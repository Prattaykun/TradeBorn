"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  CartesianGrid,
} from "recharts";
import {
  Play,
  Pause,
  SkipForward,
  RotateCcw,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { api } from "@/lib/api";
import { formatDate, formatPct, formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export type SimTrade = {
  id?: string;
  signal_date: string;
  entry_date: string;
  exit_date: string;
  entry_price: number;
  exit_price: number;
  net_return: number;
  metadata?: { incomplete?: boolean };
};

type Bar = { date: string; open: number; high: number; low: number; close: number };

type Phase = "idle" | "signal" | "invest" | "holding" | "sell" | "result";

type Camera = { x0: number; x1: number; y0: number; y1: number };

type AnimMode = "run" | "zoom-in" | "dwell" | "zoom-out";

const PHASE_COPY: Record<Phase, string> = {
  idle: "Pick a trade and press Play to simulate buy → hold → sell.",
  signal: "Signal fires — fall condition met. Preparing next-session entry…",
  invest: "Buying — zooming in on the entry bar on the plot.",
  holding: "Holding through the experiment window…",
  sell: "Selling — zooming in on the exit bar on the plot.",
  result: "Trade closed. The shaded band is the price difference between the two plot points.",
};

const SPEED = 2.4;
const ZOOM_IN_MS = 900;
const DWELL_MS = 1600;
const ZOOM_OUT_MS = 800;

const BUY_COLOR = "#2563eb";
const WIN_COLOR = "#059669";
const LOSS_COLOR = "#dc2626";

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function easeInOut(t: number) {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2;
}

function mixCam(a: Camera, b: Camera, t: number): Camera {
  const e = easeInOut(t);
  return {
    x0: lerp(a.x0, b.x0, e),
    x1: lerp(a.x1, b.x1, e),
    y0: lerp(a.y0, b.y0, e),
    y1: lerp(a.y1, b.y1, e),
  };
}

function focusCamera(
  idx: number,
  price: number,
  lastIdx: number,
  full: Camera
): Camera {
  const xSpan = Math.max(5, lastIdx * 0.22);
  const ySpan = Math.max((full.y1 - full.y0) / 3.4, Math.abs(price) * 0.012, 8);
  return {
    x0: Math.max(0, idx - xSpan / 2),
    x1: Math.min(lastIdx, idx + xSpan / 2),
    y0: price - ySpan / 2,
    y1: price + ySpan / 2,
  };
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function buildFallbackPath(trade: SimTrade): Bar[] {
  const start = new Date(`${trade.entry_date}T00:00:00Z`);
  const end = new Date(`${trade.exit_date}T00:00:00Z`);
  const days = Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / 86_400_000)
  );
  const steps = Math.min(Math.max(days, 6), 24);
  const bars: Bar[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const close =
      trade.entry_price + (trade.exit_price - trade.entry_price) * t;
    const wobble = Math.sin(i * 1.1) * Math.abs(trade.entry_price) * 0.004;
    const px = close + wobble;
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + Math.round(t * days));
    bars.push({
      date: d.toISOString().slice(0, 10),
      open: px,
      high: px * 1.002,
      low: px * 0.998,
      close: px,
    });
  }
  return bars;
}

type LabelViewBox = { x: number; y: number; width: number; height: number };

function LevelChip(props: {
  viewBox?: LabelViewBox;
  color: string;
  text: string;
  align?: "left" | "right";
}) {
  const { viewBox, color, text, align = "left" } = props;
  if (!viewBox) return null;
  const width = text.length * 6.3 + 16;
  const x =
    align === "left" ? viewBox.x + 4 : viewBox.x + viewBox.width - width - 4;
  return (
    <g>
      <rect
        x={x}
        y={viewBox.y - 9}
        width={width}
        height={18}
        rx={4}
        fill={color}
      />
      <text
        x={x + 8}
        y={viewBox.y + 4}
        fill="#ffffff"
        fontSize={11}
        fontWeight={600}
      >
        {text}
      </text>
    </g>
  );
}

function ReturnBracket(props: {
  viewBox?: LabelViewBox;
  color: string;
  text: string;
}) {
  const { viewBox, color, text } = props;
  if (!viewBox) return null;
  const cx = viewBox.x + viewBox.width * 0.5;
  const top = viewBox.y;
  const bottom = viewBox.y + viewBox.height;
  const mid = (top + bottom) / 2;
  const width = Math.max(text.length * 6.3 + 16, 72);
  return (
    <g>
      <line
        x1={cx}
        y1={top}
        x2={cx}
        y2={bottom}
        stroke={color}
        strokeWidth={1.5}
      />
      <polygon
        points={`${cx},${top} ${cx - 4},${top + 7} ${cx + 4},${top + 7}`}
        fill={color}
      />
      <polygon
        points={`${cx},${bottom} ${cx - 4},${bottom - 7} ${cx + 4},${bottom - 7}`}
        fill={color}
      />
      <rect
        x={cx - width / 2}
        y={mid - 10}
        width={width}
        height={20}
        rx={5}
        fill="#ffffff"
        stroke={color}
      />
      <text
        x={cx}
        y={mid + 4}
        fill={color}
        fontSize={11}
        fontWeight={700}
        textAnchor="middle"
      >
        {text}
      </text>
    </g>
  );
}

function PulseDot(props: {
  cx?: number;
  cy?: number;
  fill?: string;
  label?: string;
}) {
  const { cx, cy, fill = BUY_COLOR, label } = props;
  if (cx == null || cy == null) return null;
  const labelWidth = label ? label.length * 7.2 + 16 : 0;
  return (
    <g>
      <circle cx={cx} cy={cy} r={8} fill={fill} opacity={0.3}>
        <animate
          attributeName="r"
          values="7;18;7"
          dur="1.5s"
          repeatCount="indefinite"
        />
        <animate
          attributeName="opacity"
          values="0.35;0;0.35"
          dur="1.5s"
          repeatCount="indefinite"
        />
      </circle>
      <circle cx={cx} cy={cy} r={6.5} fill={fill} stroke="#fff" strokeWidth={2} />
      {label ? (
        <g>
          <rect
            x={cx + 12}
            y={cy - 14}
            width={labelWidth}
            height={22}
            rx={6}
            fill={fill}
          />
          <text
            x={cx + 20}
            y={cy + 2}
            fill="#ffffff"
            fontSize={12}
            fontWeight={700}
          >
            {label}
          </text>
        </g>
      ) : null}
    </g>
  );
}

export function TradeSimulation({
  backtestId,
  trades,
}: {
  backtestId: string;
  trades: SimTrade[];
}) {
  const completed = useMemo(
    () => trades.filter((t) => !t.metadata?.incomplete),
    [trades]
  );
  const [index, setIndex] = useState(0);
  const trade = completed[index] ?? null;

  const [bars, setBars] = useState<Bar[]>([]);
  const [loadingBars, setLoadingBars] = useState(false);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [focus, setFocus] = useState<"buy" | "sell" | null>(null);
  const [camera, setCamera] = useState<Camera>({
    x0: 0,
    x1: 1,
    y0: 0,
    y1: 1,
  });

  const progressRef = useRef(0);
  const cameraRef = useRef<Camera>(camera);
  const focusedRef = useRef({ buy: false, sell: false });
  const animRef = useRef<{
    mode: AnimMode;
    at: "buy" | "sell" | null;
    elapsed: number;
    fromCam: Camera;
  }>({ mode: "run", at: null, elapsed: 0, fromCam: camera });

  useEffect(() => {
    if (!trade || !backtestId) return;
    let cancelled = false;
    async function load() {
      setLoadingBars(true);
      setPlaying(false);
      setStarted(false);
      setFocus(null);
      progressRef.current = 0;
      focusedRef.current = { buy: false, sell: false };
      animRef.current = {
        mode: "run",
        at: null,
        elapsed: 0,
        fromCam: cameraRef.current,
      };
      setProgress(0);
      try {
        const from = shiftDate(trade!.signal_date, -5);
        const to = shiftDate(trade!.exit_date, 3);
        const res = await api<{ data: Bar[] }>(
          `/api/backtests/${backtestId}/bars?from=${from}&to=${to}`
        );
        if (!cancelled) {
          setBars(res.data.length >= 2 ? res.data : buildFallbackPath(trade!));
        }
      } catch {
        if (!cancelled) setBars(buildFallbackPath(trade!));
      } finally {
        if (!cancelled) setLoadingBars(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [trade, backtestId]);

  const entryIdx = useMemo(() => {
    if (!trade || !bars.length) return 0;
    const i = bars.findIndex((b) => b.date >= trade.entry_date);
    return i >= 0 ? i : 0;
  }, [bars, trade]);

  const exitIdx = useMemo(() => {
    if (!trade || !bars.length) return Math.max(0, bars.length - 1);
    const i = bars.findIndex((b) => b.date >= trade.exit_date);
    return i >= 0 ? i : bars.length - 1;
  }, [bars, trade]);

  const signalIdx = useMemo(() => {
    if (!trade || !bars.length) return 0;
    const i = bars.findIndex((b) => b.date >= trade.signal_date);
    return i >= 0 ? i : 0;
  }, [bars, trade]);

  const lastIdx = Math.max(0, bars.length - 1);

  /** Plot prices — the close of the bar the playhead actually sits on. */
  const buyPlot = bars[entryIdx]?.close ?? trade?.entry_price ?? 0;
  const sellPlot = bars[exitIdx]?.close ?? trade?.exit_price ?? 0;
  const plotPnl = sellPlot - buyPlot;
  const plotWin = plotPnl >= 0;
  const outcomeColor = plotWin ? WIN_COLOR : LOSS_COLOR;
  const engineWin = (trade?.net_return ?? 0) >= 0;

  const fullCam = useMemo<Camera>(() => {
    if (!bars.length) return { x0: 0, x1: 1, y0: 0, y1: 1 };
    const values = bars.map((b) => b.close);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = (max - min) * 0.14 || Math.abs(max) * 0.01 || 1;
    return { x0: 0, x1: lastIdx, y0: min - pad, y1: max + pad };
  }, [bars, lastIdx]);

  const buyCam = useMemo(
    () => focusCamera(entryIdx, buyPlot, lastIdx, fullCam),
    [entryIdx, buyPlot, lastIdx, fullCam]
  );
  const sellCam = useMemo(
    () => focusCamera(exitIdx, sellPlot, lastIdx, fullCam),
    [exitIdx, sellPlot, lastIdx, fullCam]
  );

  useEffect(() => {
    cameraRef.current = fullCam;
    setCamera(fullCam);
  }, [fullCam]);

  useEffect(() => {
    if (!playing || bars.length < 2) return;
    let raf = 0;
    let lastTs: number | null = null;

    const applyCam = (next: Camera) => {
      cameraRef.current = next;
      setCamera(next);
    };

    const startFocus = (at: "buy" | "sell") => {
      animRef.current = {
        mode: "zoom-in",
        at,
        elapsed: 0,
        fromCam: { ...cameraRef.current },
      };
      setFocus(at);
    };

    const step = (ts: number) => {
      const dt = lastTs == null ? 0 : Math.min(64, ts - lastTs);
      lastTs = ts;
      const anim = animRef.current;
      const targetCam = anim.at === "sell" ? sellCam : buyCam;

      if (anim.mode === "zoom-in") {
        anim.elapsed += dt;
        const t = anim.elapsed / ZOOM_IN_MS;
        applyCam(mixCam(anim.fromCam, targetCam, t));
        if (t >= 1) {
          applyCam(targetCam);
          anim.mode = "dwell";
          anim.elapsed = 0;
        }
      } else if (anim.mode === "dwell") {
        anim.elapsed += dt;
        applyCam(targetCam);
        if (anim.elapsed >= DWELL_MS) {
          anim.mode = "zoom-out";
          anim.elapsed = 0;
          anim.fromCam = { ...targetCam };
        }
      } else if (anim.mode === "zoom-out") {
        anim.elapsed += dt;
        const t = anim.elapsed / ZOOM_OUT_MS;
        applyCam(mixCam(anim.fromCam, fullCam, t));
        if (t >= 1) {
          applyCam(fullCam);
          anim.mode = "run";
          anim.at = null;
          anim.elapsed = 0;
          setFocus(null);
        }
      } else {
        let p = progressRef.current + (dt / 1000) * SPEED;
        if (!focusedRef.current.buy && p >= entryIdx) {
          focusedRef.current.buy = true;
          p = entryIdx;
          progressRef.current = p;
          setProgress(p);
          startFocus("buy");
        } else if (!focusedRef.current.sell && p >= exitIdx) {
          focusedRef.current.sell = true;
          p = exitIdx;
          progressRef.current = p;
          setProgress(p);
          startFocus("sell");
        } else if (p >= lastIdx) {
          progressRef.current = lastIdx;
          setProgress(lastIdx);
          applyCam(fullCam);
          setFocus(null);
          setPlaying(false);
          return;
        } else {
          progressRef.current = p;
          setProgress(p);
        }
      }

      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, bars.length, entryIdx, exitIdx, lastIdx, fullCam, buyCam, sellCam]);

  const phase: Phase = useMemo(() => {
    if (!started || !bars.length) return "idle";
    if (focus === "buy") return "invest";
    if (focus === "sell") return "sell";
    if (progress < signalIdx) return "idle";
    if (progress < entryIdx) return "signal";
    if (progress < exitIdx) return "holding";
    return "result";
  }, [
    started,
    bars.length,
    focus,
    progress,
    signalIdx,
    entryIdx,
    exitIdx,
  ]);

  const reachedEntry = started && progress >= entryIdx;
  const reachedExit = started && progress >= exitIdx;

  const chartData = useMemo(() => {
    if (!bars.length || !started) return [];

    const head = Math.min(progress, lastIdx);
    const hi = Math.floor(head);
    const frac = head - hi;
    const rows = bars.slice(0, hi + 1).map((b, i) => ({
      ...b,
      i,
      visible: b.close,
      hold:
        head >= entryIdx && i >= entryIdx && i <= exitIdx ? b.close : null,
    }));

    if (frac > 0.001 && hi < lastIdx) {
      const y =
        bars[hi]!.close +
        (bars[hi + 1]!.close - bars[hi]!.close) * frac;
      const inHold = head >= entryIdx && head <= exitIdx;
      rows.push({
        ...bars[hi]!,
        i: head,
        close: y,
        visible: y,
        hold: inHold ? y : null,
      });
    }

    return rows;
  }, [bars, progress, started, entryIdx, exitIdx, lastIdx]);

  const head = Math.min(progress, lastIdx);
  const headHi = Math.floor(head);
  const headFrac = head - headHi;
  const headPrice =
    bars.length === 0
      ? 0
      : bars[headHi]!.close +
        (bars[Math.min(headHi + 1, lastIdx)]!.close - bars[headHi]!.close) *
          headFrac;
  const progressPct = lastIdx === 0 ? 0 : Math.round((progress / lastIdx) * 100);
  const enginePnl = trade ? trade.exit_price - trade.entry_price : 0;

  function play() {
    if (!bars.length) return;
    if (progressRef.current >= lastIdx) {
      progressRef.current = 0;
      setProgress(0);
      cameraRef.current = fullCam;
      setCamera(fullCam);
      animRef.current = {
        mode: "run",
        at: null,
        elapsed: 0,
        fromCam: fullCam,
      };
      focusedRef.current = { buy: false, sell: false };
      setFocus(null);
    }
    setStarted(true);
    setPlaying(true);
  }

  function pause() {
    setPlaying(false);
  }

  function reset() {
    setPlaying(false);
    setStarted(false);
    setFocus(null);
    progressRef.current = 0;
    focusedRef.current = { buy: false, sell: false };
    animRef.current = {
      mode: "run",
      at: null,
      elapsed: 0,
      fromCam: fullCam,
    };
    cameraRef.current = fullCam;
    setCamera(fullCam);
    setProgress(0);
  }

  function skipToEnd() {
    if (bars.length < 2) return;
    setPlaying(false);
    setStarted(true);
    setFocus(null);
    progressRef.current = lastIdx;
    focusedRef.current = { buy: true, sell: true };
    animRef.current = {
      mode: "run",
      at: null,
      elapsed: 0,
      fromCam: fullCam,
    };
    cameraRef.current = fullCam;
    setCamera(fullCam);
    setProgress(lastIdx);
  }

  function nextTrade() {
    if (!completed.length) return;
    setIndex((i) => (i + 1) % completed.length);
  }

  if (!completed.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Trade simulation</CardTitle>
          <CardDescription>No completed trades to animate.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const yDomain: [number, number] = [camera.y0, camera.y1];
  const xDomain: [number, number] = [camera.x0, camera.x1];
  const buyLabel = focus === "buy" ? "Buying" : undefined;
  const sellLabel = focus === "sell" ? "Selling" : undefined;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-3 border-b bg-muted/20">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              Live trade simulation
              <Badge variant="system">plot prices</Badge>
            </CardTitle>
            <CardDescription className="mt-1.5 max-w-xl">
              The plot is drawn in as the playhead moves — there is no ghost
              path underneath. It zooms in on the buy bar, holds, zooms out,
              then does the same at sell. The band is the gap between those
              two points.
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={nextTrade}
            disabled={completed.length < 2}
          >
            Next trade ({index + 1}/{completed.length})
          </Button>
        </div>

        {trade && (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <MiniStat label="Signal" value={formatDate(trade.signal_date)} />
            <MiniStat label="Buy / invest" value={formatDate(trade.entry_date)} />
            <MiniStat label="Sell / exit" value={formatDate(trade.exit_date)} />
            <MiniStat label="Entry (engine)" value={formatPrice(trade.entry_price)} />
            <MiniStat label="Exit (engine)" value={formatPrice(trade.exit_price)} />
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-4 pt-5">
        <div className="flex flex-wrap items-center gap-2">
          {!playing ? (
            <Button size="sm" onClick={play} disabled={loadingBars}>
              <Play className="h-4 w-4" /> Play
            </Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={pause}>
              <Pause className="h-4 w-4" /> Pause
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={reset}>
            <RotateCcw className="h-4 w-4" /> Reset
          </Button>
          <Button size="sm" variant="outline" onClick={skipToEnd}>
            <SkipForward className="h-4 w-4" /> End
          </Button>
          <Badge
            variant={
              phase === "result"
                ? plotWin
                  ? "success"
                  : "danger"
                : phase === "invest"
                  ? "system"
                  : phase === "holding"
                    ? "assume"
                    : "secondary"
            }
          >
            {phase === "invest" ? "BUYING" : phase.toUpperCase()}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {PHASE_COPY[phase]}
          </span>
        </div>

        <Progress value={progressPct} />

        <div className="relative h-[420px] w-full overflow-hidden rounded-xl border bg-background">
          {loadingBars ? (
            <p className="p-6 text-sm text-muted-foreground">
              Loading OHLC path…
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={{ top: 28, right: 64, left: 8, bottom: 8 }}
              >
                <defs>
                  <linearGradient id="plotFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0f172a" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#0f172a" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="holdFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#d97706" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#d97706" stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="i"
                  type="number"
                  domain={xDomain}
                  hide
                  allowDataOverflow
                />
                <YAxis
                  yAxisId="price"
                  domain={yDomain}
                  width={64}
                  tick={{ fontSize: 11 }}
                  allowDataOverflow
                  tickFormatter={(v: number) => formatPrice(v, 0)}
                />
                <YAxis
                  yAxisId="return"
                  orientation="right"
                  domain={yDomain}
                  width={58}
                  tick={{ fontSize: 11 }}
                  allowDataOverflow
                  tickFormatter={(v: number) =>
                    buyPlot ? formatPct(v / buyPlot - 1, 1) : ""
                  }
                />
                <Tooltip
                  formatter={(v: number) => formatPrice(v)}
                  labelFormatter={(_, payload) => {
                    const date = payload?.[0]?.payload?.date;
                    return date ? formatDate(String(date)) : "";
                  }}
                />

                {reachedExit ? (
                  <ReferenceArea
                    yAxisId="price"
                    x1={entryIdx}
                    x2={exitIdx}
                    y1={buyPlot}
                    y2={sellPlot}
                    fill={outcomeColor}
                    fillOpacity={0.18}
                    strokeOpacity={0}
                    label={
                      <ReturnBracket
                        color={outcomeColor}
                        text={`Return ${plotPnl >= 0 ? "+" : ""}${formatPrice(plotPnl)}`}
                      />
                    }
                  />
                ) : null}

                {reachedEntry ? (
                  <ReferenceArea
                    yAxisId="price"
                    x1={entryIdx}
                    x2={Math.min(Math.floor(progress), exitIdx)}
                    fill="#f59e0b"
                    fillOpacity={0.08}
                    strokeOpacity={0}
                  />
                ) : null}

                <Area
                  yAxisId="price"
                  type="linear"
                  dataKey="visible"
                  stroke="#0f172a"
                  strokeWidth={2.25}
                  fill="url(#plotFill)"
                  baseValue={camera.y0}
                  connectNulls={false}
                  isAnimationActive={false}
                  dot={false}
                  activeDot={false}
                />
                <Area
                  yAxisId="price"
                  type="linear"
                  dataKey="hold"
                  stroke="#d97706"
                  strokeWidth={3}
                  fill="url(#holdFill)"
                  baseValue={camera.y0}
                  connectNulls={false}
                  isAnimationActive={false}
                  dot={false}
                  activeDot={false}
                />

                {reachedEntry ? (
                  <ReferenceLine
                    yAxisId="price"
                    y={buyPlot}
                    stroke={BUY_COLOR}
                    strokeDasharray="5 4"
                    strokeWidth={1.25}
                  />
                ) : null}
                {reachedEntry ? (
                  <ReferenceLine
                    yAxisId="price"
                    segment={[
                      { x: camera.x0, y: buyPlot },
                      { x: entryIdx, y: buyPlot },
                    ]}
                    stroke={BUY_COLOR}
                    strokeWidth={2.5}
                    label={
                      <LevelChip
                        color={BUY_COLOR}
                        text={`Buy ${formatPrice(buyPlot)}`}
                      />
                    }
                  />
                ) : null}
                {reachedEntry ? (
                  <ReferenceDot
                    yAxisId="price"
                    x={entryIdx}
                    y={buyPlot}
                    r={7}
                    fill={BUY_COLOR}
                    shape={<PulseDot label={buyLabel} />}
                  />
                ) : null}

                {reachedExit ? (
                  <ReferenceLine
                    yAxisId="price"
                    y={sellPlot}
                    stroke={outcomeColor}
                    strokeDasharray="5 4"
                    strokeWidth={1.25}
                    label={
                      <LevelChip
                        align="right"
                        color={outcomeColor}
                        text={`Return ${formatPct(buyPlot ? plotPnl / buyPlot : 0)}`}
                      />
                    }
                  />
                ) : null}
                {reachedExit ? (
                  <ReferenceLine
                    yAxisId="price"
                    segment={[
                      { x: camera.x0, y: sellPlot },
                      { x: exitIdx, y: sellPlot },
                    ]}
                    stroke={outcomeColor}
                    strokeWidth={2.5}
                    label={
                      <LevelChip
                        color={outcomeColor}
                        text={`Sell ${formatPrice(sellPlot)}`}
                      />
                    }
                  />
                ) : null}
                {reachedExit ? (
                  <ReferenceDot
                    yAxisId="price"
                    x={exitIdx}
                    y={sellPlot}
                    r={7}
                    fill={outcomeColor}
                    shape={<PulseDot label={sellLabel} />}
                  />
                ) : null}

                {started && !focus && !reachedExit ? (
                  <ReferenceDot
                    yAxisId="price"
                    x={Math.min(progress, lastIdx)}
                    y={headPrice}
                    r={4}
                    fill="#0f172a"
                    stroke="#fff"
                    strokeWidth={1.5}
                  />
                ) : null}
              </ComposedChart>
            </ResponsiveContainer>
          )}

          <AnimatePresence mode="wait">
            {(phase === "invest" || phase === "sell" || phase === "result") &&
              trade && (
                <motion.div
                  key={phase === "invest" ? "invest" : "exit"}
                  initial={{ opacity: 0, y: 8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.28, ease: "easeOut" }}
                  className="pointer-events-none absolute right-16 top-3 w-[248px]"
                >
                  <div
                    className={cn(
                      "rounded-lg border bg-card/95 px-3 py-2 text-sm shadow-md backdrop-blur",
                      phase === "invest" && "border-blue-300",
                      (phase === "sell" || phase === "result") &&
                        (plotWin ? "border-emerald-300" : "border-red-300")
                    )}
                  >
                    {phase === "invest" && (
                      <div className="space-y-1">
                        <p className="font-semibold text-blue-700">Buying</p>
                        <p>
                          On the plot @ {formatPrice(buyPlot)} on{" "}
                          {formatDate(trade.entry_date)}
                        </p>
                      </div>
                    )}
                    {phase === "sell" && (
                      <p
                        className={cn(
                          "font-semibold",
                          plotWin ? "text-emerald-700" : "text-red-700"
                        )}
                      >
                        Selling
                      </p>
                    )}
                    {(phase === "sell" || phase === "result") && (
                      <div className="space-y-1">
                        <p>
                          <strong>Sell</strong> @ {formatPrice(sellPlot)} on{" "}
                          {formatDate(trade.exit_date)}
                        </p>
                        <p
                          className={cn(
                            "flex items-center gap-1 font-semibold",
                            plotWin ? "text-emerald-700" : "text-red-700"
                          )}
                        >
                          {plotWin ? (
                            <TrendingUp className="h-4 w-4" />
                          ) : (
                            <TrendingDown className="h-4 w-4" />
                          )}
                          Plot Δ {plotPnl >= 0 ? "+" : ""}
                          {formatPrice(plotPnl)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Band spans the buy and sell points on this close path.
                          Engine fill Δ {enginePnl >= 0 ? "+" : ""}
                          {formatPrice(enginePnl)} · net{" "}
                          {formatPct(trade.net_return)}.
                        </p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
          </AnimatePresence>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <LegendSwatch color={BUY_COLOR} label="Buy point on the plot" />
          <LegendSwatch
            color={outcomeColor}
            label={`Sell point (${plotWin ? "profit" : "loss"} on plot)`}
          />
          <LegendSwatch color="#d97706" label="Holding period" />
          <span>Right axis = return vs the buy-point close.</span>
        </div>

        {phase === "result" && trade && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="grid gap-3 sm:grid-cols-3"
          >
            <ResultTile
              label="Investment point (plot)"
              value={formatPrice(buyPlot)}
              hint={`${formatDate(trade.entry_date)} · engine fill ${formatPrice(trade.entry_price)}`}
            />
            <ResultTile
              label="Selling point (plot)"
              value={formatPrice(sellPlot)}
              hint={`${formatDate(trade.exit_date)} · engine fill ${formatPrice(trade.exit_price)}`}
            />
            <ResultTile
              label="Plot difference"
              value={`${plotPnl >= 0 ? "+" : ""}${formatPrice(plotPnl)}`}
              hint={`Engine net ${formatPct(trade.net_return)}${engineWin === plotWin ? "" : " (fill uses session open)"}`}
              tone={plotWin ? "good" : "bad"}
            />
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block h-0.5 w-5 rounded"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

function ResultTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "good" | "bad";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3",
        tone === "good" && "border-emerald-200 bg-emerald-50",
        tone === "bad" && "border-red-200 bg-red-50"
      )}
    >
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
      {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}
