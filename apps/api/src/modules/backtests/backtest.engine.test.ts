import { describe, expect, it } from "vitest";
import { runBacktest, type OhlcBar } from "./backtest.engine.js";

function makeBars(closes: number[], start = "2020-01-01"): OhlcBar[] {
  const bars: OhlcBar[] = [];
  const d = new Date(start);
  for (let i = 0; i < closes.length; i++) {
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
    const close = closes[i]!;
    const open = i === 0 ? close : closes[i - 1]!;
    bars.push({
      tradeDate: d.toISOString().slice(0, 10),
      open,
      high: Math.max(open, close) * 1.01,
      low: Math.min(open, close) * 0.99,
      close,
      volume: 1000,
    });
    d.setDate(d.getDate() + 1);
  }
  return bars;
}

const base = {
  windowSessions: 5,
  threshold: -0.05,
  holdingSessions: 3,
  allowOverlapping: false,
  entrySlippageBps: 5,
  exitSlippageBps: 5,
  feeBps: 0,
};

describe("backtest engine", () => {
  it("returns no signals when prices are flat", () => {
    const bars = makeBars(Array(30).fill(100));
    const result = runBacktest({ ...base, bars });
    expect(result.metrics.signal_count).toBe(0);
    expect(result.trades).toHaveLength(0);
  });

  it("detects a sharp fall and enters next open", () => {
    // 5-session fall of >5% then recovery
    const closes = [
      100, 100, 100, 100, 100, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103,
    ];
    const bars = makeBars(closes);
    const result = runBacktest({ ...base, bars, threshold: -0.05 });
    expect(result.metrics.signal_count).toBeGreaterThan(0);
    expect(result.trades.length + result.incompleteTrades.length).toBeGreaterThan(0);
    if (result.trades[0]) {
      expect(result.trades[0].entryDate > result.trades[0].signalDate).toBe(true);
    }
  });

  it("marks incomplete when holding exceeds data", () => {
    const closes = [100, 99, 98, 97, 96, 90, 91];
    const bars = makeBars(closes);
    const result = runBacktest({
      ...base,
      bars,
      holdingSessions: 10,
      threshold: -0.05,
    });
    expect(result.incompleteTrades.length).toBeGreaterThan(0);
  });

  it("disallows overlapping trades by default", () => {
    const closes = [
      100, 98, 96, 94, 92, 88, 87, 86, 85, 84, 83, 82, 90, 91, 92, 93, 94, 95,
    ];
    const bars = makeBars(closes);
    const noOverlap = runBacktest({ ...base, bars, allowOverlapping: false, holdingSessions: 5 });
    const overlap = runBacktest({ ...base, bars, allowOverlapping: true, holdingSessions: 5 });
    expect(overlap.trades.length).toBeGreaterThanOrEqual(noOverlap.trades.length);
  });

  it("throws on invalid threshold", () => {
    const bars = makeBars([100, 101, 102, 103, 104, 105, 106, 107, 108, 109]);
    expect(() =>
      runBacktest({ ...base, bars, threshold: 0.05 })
    ).toThrow(/Invalid threshold/);
  });

  it("filters zero/negative prices", () => {
    const bars = makeBars([100, 100, 100, 100, 100, 90, 91, 92, 93, 94, 95]);
    bars[2]!.close = -1;
    const result = runBacktest({ ...base, bars });
    expect(result.metrics).toBeDefined();
  });

  it("is deterministic for same inputs", () => {
    const bars = makeBars([
      100, 99, 98, 97, 96, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100,
    ]);
    const a = runBacktest({ ...base, bars });
    const b = runBacktest({ ...base, bars });
    expect(a.metrics).toEqual(b.metrics);
    expect(a.trades).toEqual(b.trades);
  });
});
