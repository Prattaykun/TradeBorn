"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import { api } from "@/lib/api";
import { formatDate, formatPct, formatPrice } from "@/lib/format";
import { Field, FieldGrid } from "@/components/field";
import { Markdown } from "@/components/markdown";
import { TradeSimulation, type SimTrade } from "@/components/trade-simulation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Metrics = {
  signal_count: number;
  completed_trades: number;
  incomplete_trades: number;
  win_rate: number | null;
  average_net_return: number | null;
  median_net_return: number | null;
  cumulative_compounded_return: number | null;
  max_drawdown: number | null;
  best_trade: number | null;
  worst_trade: number | null;
  benchmark_return: number | null;
  equity_curve: { date: string; equity: number }[];
  return_distribution: number[];
};

function LearnPageInner() {
  const search = useSearchParams();
  const backtestId = search.get("backtestId");
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [trades, setTrades] = useState<SimTrade[]>([]);
  const [interpretation, setInterpretation] = useState<string | null>(null);
  const [followUps, setFollowUps] = useState<string[]>([]);
  const [explaining, setExplaining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!backtestId) {
      setError("Missing backtest id — run a test first");
      return;
    }
    async function load() {
      try {
        const run = await api<{
          data: Metrics;
          warnings: string[];
          interpretation?: { text?: string; followUps?: string[] } | null;
        }>(`/api/backtests/${backtestId}`);
        setMetrics(run.data);
        setWarnings((run.warnings as string[]) ?? []);

        // Prefer a previously saved interpretation so the card is never blank
        // while we refresh the AI explanation.
        const saved = run.interpretation;
        if (saved?.text?.trim()) {
          setInterpretation(saved.text.trim());
          setFollowUps(saved.followUps ?? []);
        }

        const tradesRes = await api<{ data: SimTrade[] }>(
          `/api/backtests/${backtestId}/trades`
        );
        setTrades(tradesRes.data);

        setExplaining(true);
        try {
          const explained = await api<{
            interpretation: { text: string; followUps?: string[] };
            warnings?: string[];
          }>("/api/ai/explain-results", {
            method: "POST",
            body: JSON.stringify({ backtestId }),
          });
          const text =
            explained.interpretation?.text?.trim() ||
            "AI explanation unavailable. Deterministic metrics remain valid.";
          setInterpretation(text);
          setFollowUps(explained.interpretation?.followUps ?? []);
        } catch {
          setInterpretation((prev) =>
            prev?.trim()
              ? prev
              : "AI explanation unavailable. Deterministic metrics remain valid."
          );
        } finally {
          setExplaining(false);
        }
      } catch (e) {
        setError((e as Error).message);
        setExplaining(false);
      }
    }
    load();
  }, [backtestId]);

  const hist = useMemo(() => {
    if (!metrics?.return_distribution?.length) return [];
    const bins = 10;
    const vals = metrics.return_distribution;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const width = (max - min) / bins || 1;
    return Array.from({ length: bins }, (_, i) => {
      const lo = min + i * width;
      const hi = lo + width;
      const count = vals.filter(
        (v) => v >= lo && (i === bins - 1 ? v <= hi : v < hi)
      ).length;
      return { bucket: `${(lo * 100).toFixed(1)}%`, count };
    });
  }, [metrics]);

  if (!metrics && !error) {
    return <p className="text-muted-foreground">Loading results…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Badge variant="system">Learn</Badge>
        <h1 className="text-3xl font-semibold tracking-tight">
          Evidence, simulation &amp; interpretation
        </h1>
        <p className="text-sm text-muted-foreground">
          Numbers come from the engine. The simulation replays invest → hold →
          sell for each historical trade.
        </p>
      </div>

      {metrics && backtestId && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>What the data shows</CardTitle>
              <CardDescription>
                Aggregate outcomes across the completed sample.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {metrics.completed_trades} completed trades from{" "}
                {metrics.signal_count} signals. Win rate{" "}
                {formatPct(metrics.win_rate)}, average net return{" "}
                {formatPct(metrics.average_net_return)}, median{" "}
                {formatPct(metrics.median_net_return)}, max drawdown{" "}
                {formatPct(metrics.max_drawdown)}. Benchmark buy-and-hold:{" "}
                {formatPct(metrics.benchmark_return)}.
              </p>
              <FieldGrid className="lg:grid-cols-4">
                <Field label="Completed trades" value={metrics.completed_trades} />
                <Field label="Win rate" value={formatPct(metrics.win_rate)} />
                <Field
                  label="Avg net return"
                  value={formatPct(metrics.average_net_return)}
                />
                <Field
                  label="Compounded"
                  value={formatPct(metrics.cumulative_compounded_return)}
                />
                <Field
                  label="Max drawdown"
                  value={formatPct(metrics.max_drawdown)}
                />
                <Field label="Best trade" value={formatPct(metrics.best_trade)} />
                <Field
                  label="Worst trade"
                  value={formatPct(metrics.worst_trade)}
                />
                <Field
                  label="Incomplete"
                  value={metrics.incomplete_trades}
                />
              </FieldGrid>
            </CardContent>
          </Card>

          <TradeSimulation backtestId={backtestId} trades={trades} />

          <section className="grid gap-4 lg:grid-cols-2">
            <Card className="h-80">
              <CardHeader>
                <CardTitle className="text-base">Equity curve (engine)</CardTitle>
              </CardHeader>
              <CardContent className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={metrics.equity_curve}>
                    <XAxis dataKey="date" hide />
                    <YAxis domain={["auto", "auto"]} width={40} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="equity"
                      stroke="#1d4ed8"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card className="h-80">
              <CardHeader>
                <CardTitle className="text-base">
                  Return distribution (engine)
                </CardTitle>
              </CardHeader>
              <CardContent className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hist}>
                    <XAxis dataKey="bucket" hide />
                    <YAxis allowDecimals={false} width={30} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#6d28d9" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </section>

          <Card>
            <CardHeader>
              <CardTitle>Trade ledger</CardTitle>
              <CardDescription>
                First 50 trades — open the simulation above to animate any case.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2">Signal</th>
                    <th>Entry</th>
                    <th>Exit</th>
                    <th>Entry px</th>
                    <th>Exit px</th>
                    <th>Δ / Net</th>
                    <th>Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.slice(0, 50).map((t, i) => {
                    const delta = t.exit_price - t.entry_price;
                    return (
                      <tr key={t.id ?? i} className="border-b border-border/60">
                        <td className="py-2">{formatDate(t.signal_date)}</td>
                        <td>{formatDate(t.entry_date)}</td>
                        <td>{formatDate(t.exit_date)}</td>
                        <td>{formatPrice(t.entry_price)}</td>
                        <td>{formatPrice(t.exit_price)}</td>
                        <td
                          className={
                            t.net_return >= 0
                              ? "text-emerald-700"
                              : "text-red-700"
                          }
                        >
                          {delta >= 0 ? "+" : ""}
                          {formatPrice(delta)} · {formatPct(t.net_return)}
                        </td>
                        <td>
                          {t.metadata?.incomplete ? (
                            <Badge variant="assume">incomplete</Badge>
                          ) : (
                            ""
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-ai">AI interpretation</CardTitle>
          <CardDescription>
            Labelled separately — never recalculates engine metrics.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {explaining && !interpretation?.trim() ? (
            <p className="text-sm text-muted-foreground">
              Writing an interpretation of the engine numbers…
            </p>
          ) : null}
          <div className="rounded-lg border-l-4 border-violet-400 bg-muted/30 p-4 text-sm">
            {interpretation?.trim() ? (
              <Markdown>{interpretation}</Markdown>
            ) : !explaining ? (
              <p className="text-muted-foreground">
                No interpretation yet. Refresh after the API finishes explaining.
              </p>
            ) : null}
            {followUps.length > 0 && (
              <div className="mt-4">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  What to investigate next
                </p>
                <ul className="list-disc space-y-1 pl-5">
                  {followUps.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {warnings.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium text-assume">Warnings</h2>
          {warnings.map((w) => (
            <div
              key={w}
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm"
            >
              {w}
            </div>
          ))}
        </section>
      )}

      <Button asChild variant="outline">
        <Link href="/">Start another research session</Link>
      </Button>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}

export default function LearnPage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading results…</p>}>
      <LearnPageInner />
    </Suspense>
  );
}
