export type OhlcBar = {
  tradeDate: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number | null;
};

export type EngineInput = {
  bars: OhlcBar[];
  windowSessions: number;
  threshold: number;
  holdingSessions: number;
  allowOverlapping: boolean;
  entrySlippageBps: number;
  exitSlippageBps: number;
  feeBps: number;
  startDate?: string;
  endDate?: string;
};

export type EngineTrade = {
  signalDate: string;
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  grossReturn: number;
  costReturn: number;
  netReturn: number;
  incomplete: boolean;
};

export type EngineResult = {
  trades: EngineTrade[];
  incompleteTrades: EngineTrade[];
  metrics: {
    signal_count: number;
    completed_trades: number;
    incomplete_trades: number;
    win_rate: number | null;
    average_net_return: number | null;
    median_net_return: number | null;
    cumulative_compounded_return: number | null;
    max_drawdown: number | null;
    profit_factor: number | null;
    average_holding_period_return: number | null;
    best_trade: number | null;
    worst_trade: number | null;
    longest_winning_streak: number;
    longest_losing_streak: number;
    benchmark_return: number | null;
    std_dev_returns: number | null;
    equity_curve: { date: string; equity: number }[];
    return_distribution: number[];
  };
  warnings: string[];
};

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function stdDev(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function streaks(returns: number[]): { win: number; loss: number } {
  let win = 0;
  let loss = 0;
  let curWin = 0;
  let curLoss = 0;
  for (const r of returns) {
    if (r > 0) {
      curWin += 1;
      curLoss = 0;
      win = Math.max(win, curWin);
    } else if (r < 0) {
      curLoss += 1;
      curWin = 0;
      loss = Math.max(loss, curLoss);
    } else {
      curWin = 0;
      curLoss = 0;
    }
  }
  return { win, loss };
}

export function runBacktest(input: EngineInput): EngineResult {
  const warnings: string[] = [];
  const {
    windowSessions,
    threshold,
    holdingSessions,
    allowOverlapping,
    entrySlippageBps,
    exitSlippageBps,
    feeBps,
  } = input;

  if (windowSessions <= 0) throw new Error("Invalid threshold window");
  if (holdingSessions <= 0) throw new Error("Invalid holding period");
  if (!(threshold < 0)) throw new Error("Invalid threshold: must be negative");

  let bars = input.bars.filter((b) => {
    if (!Number.isFinite(b.open) || !Number.isFinite(b.close)) return false;
    if (b.open <= 0 || b.close <= 0 || b.high <= 0 || b.low <= 0) return false;
    return true;
  });

  if (input.startDate) {
    bars = bars.filter((b) => b.tradeDate >= input.startDate!);
  }
  if (input.endDate) {
    bars = bars.filter((b) => b.tradeDate <= input.endDate!);
  }

  if (bars.length < windowSessions + holdingSessions + 2) {
    warnings.push("Insufficient bars for requested window and holding period");
  }

  const completed: EngineTrade[] = [];
  const incomplete: EngineTrade[] = [];
  let activeUntil = -1;
  let signalCount = 0;

  for (let i = windowSessions; i < bars.length; i++) {
    const prev = bars[i - windowSessions]!;
    const cur = bars[i]!;
    const rolling = cur.close / prev.close - 1;
    if (rolling > threshold) continue;

    signalCount += 1;
    const entryIndex = i + 1;
    const exitIndex = entryIndex + holdingSessions - 1;

    if (!allowOverlapping && entryIndex <= activeUntil) {
      continue;
    }

    if (entryIndex >= bars.length) {
      incomplete.push({
        signalDate: cur.tradeDate,
        entryDate: cur.tradeDate,
        exitDate: cur.tradeDate,
        entryPrice: cur.close,
        exitPrice: cur.close,
        grossReturn: 0,
        costReturn: 0,
        netReturn: 0,
        incomplete: true,
      });
      continue;
    }

    if (exitIndex >= bars.length) {
      const entryBar = bars[entryIndex]!;
      incomplete.push({
        signalDate: cur.tradeDate,
        entryDate: entryBar.tradeDate,
        exitDate: bars[bars.length - 1]!.tradeDate,
        entryPrice: entryBar.open,
        exitPrice: bars[bars.length - 1]!.close,
        grossReturn: 0,
        costReturn: 0,
        netReturn: 0,
        incomplete: true,
      });
      continue;
    }

    const entryBar = bars[entryIndex]!;
    const exitBar = bars[exitIndex]!;
    const entryPrice = entryBar.open * (1 + entrySlippageBps / 10000);
    const exitPrice = exitBar.close * (1 - exitSlippageBps / 10000);
    const grossReturn = exitPrice / entryPrice - 1;
    const costReturn = feeBps / 10000;
    const netReturn = grossReturn - costReturn;

    completed.push({
      signalDate: cur.tradeDate,
      entryDate: entryBar.tradeDate,
      exitDate: exitBar.tradeDate,
      entryPrice,
      exitPrice,
      grossReturn,
      costReturn,
      netReturn,
      incomplete: false,
    });

    if (!allowOverlapping) {
      activeUntil = exitIndex;
    }
  }

  const nets = completed.map((t) => t.netReturn);
  const wins = nets.filter((r) => r > 0);
  const losses = nets.filter((r) => r < 0);
  const grossWins = wins.reduce((a, b) => a + b, 0);
  const grossLosses = Math.abs(losses.reduce((a, b) => a + b, 0));
  let equity = 1;
  const equityCurve: { date: string; equity: number }[] = [];
  let peak = 1;
  let maxDd = 0;
  for (const t of completed) {
    equity *= 1 + t.netReturn;
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, (peak - equity) / peak);
    equityCurve.push({ date: t.exitDate, equity });
  }

  const streak = streaks(nets);
  let benchmark: number | null = null;
  if (bars.length >= 2) {
    benchmark = bars[bars.length - 1]!.close / bars[0]!.open - 1;
  }

  if (completed.length < 30) {
    warnings.push("Very small sample — treat results as exploratory");
  }
  warnings.push("No out-of-sample validation");
  warnings.push("Simplified cost model");
  warnings.push("Results may be sensitive to parameter choice");

  return {
    trades: completed,
    incompleteTrades: incomplete,
    metrics: {
      signal_count: signalCount,
      completed_trades: completed.length,
      incomplete_trades: incomplete.length,
      win_rate: completed.length ? wins.length / completed.length : null,
      average_net_return: nets.length
        ? nets.reduce((a, b) => a + b, 0) / nets.length
        : null,
      median_net_return: median(nets),
      cumulative_compounded_return: completed.length ? equity - 1 : null,
      max_drawdown: completed.length ? maxDd : null,
      profit_factor:
        grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? null : null,
      average_holding_period_return: nets.length
        ? nets.reduce((a, b) => a + b, 0) / nets.length
        : null,
      best_trade: nets.length ? Math.max(...nets) : null,
      worst_trade: nets.length ? Math.min(...nets) : null,
      longest_winning_streak: streak.win,
      longest_losing_streak: streak.loss,
      benchmark_return: benchmark,
      std_dev_returns: stdDev(nets),
      equity_curve: equityCurve,
      return_distribution: nets,
    },
    warnings,
  };
}
