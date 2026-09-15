import { z } from "zod";

export const ClarificationSchema = z.object({
  interpretation: z.object({
    market: z.string().nullable(),
    action: z.enum(["buy", "sell", "unknown"]),
    trigger: z.string().nullable(),
  }),
  missingParameters: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      importance: z.enum(["required", "recommended", "optional"]),
      reason: z.string(),
    })
  ),
  proposedDefaults: z.record(z.string(), z.unknown()),
  questions: z.array(z.string()),
  userStated: z.array(z.string()).default([]),
  systemAssumptions: z.array(z.string()).default([]),
});

export type Clarification = z.infer<typeof ClarificationSchema>;

export const ExperimentDefinitionSchema = z.object({
  market: z.object({
    symbol: z.string(),
    asset_type: z.string(),
  }),
  condition: z.object({
    type: z.literal("rolling_return"),
    window_sessions: z.number().int().positive(),
    threshold: z.number().negative(),
  }),
  entry: z.object({
    timing: z.enum(["next_session_open", "same_session_close"]),
    price_field: z.enum(["open", "close"]),
  }),
  exit: z.object({
    type: z.literal("fixed_holding_period"),
    holding_sessions: z.number().int().positive(),
    price_field: z.enum(["open", "close"]),
  }),
  test_period: z.object({
    start: z.string(),
    end: z.string(),
  }),
  costs: z.object({
    round_trip_bps: z.number().nonnegative(),
    slippage_bps: z.number().nonnegative(),
    entry_slippage_bps: z.number().nonnegative().optional(),
    exit_slippage_bps: z.number().nonnegative().optional(),
  }),
  allow_overlapping: z.boolean().default(false),
  hypothesis: z.string(),
});

export type ExperimentDefinition = z.infer<typeof ExperimentDefinitionSchema>;

export const DEFAULT_EXPERIMENT: ExperimentDefinition = {
  market: { symbol: "NIFTY50", asset_type: "index" },
  condition: {
    type: "rolling_return",
    window_sessions: 5,
    threshold: -0.05,
  },
  entry: { timing: "next_session_open", price_field: "open" },
  exit: {
    type: "fixed_holding_period",
    holding_sessions: 10,
    price_field: "close",
  },
  test_period: { start: "2015-01-01", end: "2025-12-31" },
  costs: {
    round_trip_bps: 10,
    slippage_bps: 5,
    entry_slippage_bps: 5,
    exit_slippage_bps: 5,
  },
  allow_overlapping: false,
  hypothesis:
    "After a sharp five-session fall, NIFTY has a positive average return over the next ten trading sessions.",
};

export const BacktestMetricsSchema = z.object({
  signal_count: z.number(),
  completed_trades: z.number(),
  incomplete_trades: z.number(),
  win_rate: z.number().nullable(),
  average_net_return: z.number().nullable(),
  median_net_return: z.number().nullable(),
  cumulative_compounded_return: z.number().nullable(),
  max_drawdown: z.number().nullable(),
  profit_factor: z.number().nullable(),
  average_holding_period_return: z.number().nullable(),
  best_trade: z.number().nullable(),
  worst_trade: z.number().nullable(),
  longest_winning_streak: z.number(),
  longest_losing_streak: z.number(),
  benchmark_return: z.number().nullable(),
  std_dev_returns: z.number().nullable(),
  equity_curve: z.array(
    z.object({
      date: z.string(),
      equity: z.number(),
    })
  ),
  return_distribution: z.array(z.number()),
});

export type BacktestMetrics = z.infer<typeof BacktestMetricsSchema>;

export const TradeResultSchema = z.object({
  signal_date: z.string(),
  entry_date: z.string(),
  exit_date: z.string(),
  entry_price: z.number(),
  exit_price: z.number(),
  gross_return: z.number(),
  cost_return: z.number(),
  net_return: z.number(),
  incomplete: z.boolean().optional(),
});

export type TradeResult = z.infer<typeof TradeResultSchema>;

export const SearchResultSchema = z.object({
  title: z.string(),
  url: z.string(),
  snippet: z.string(),
  published_at: z.string().nullable().optional(),
  source: z.string().optional(),
});

export type SearchResult = z.infer<typeof SearchResultSchema>;

export const CreateSessionSchema = z.object({
  question: z.string().min(3),
});

export const ClarifySessionSchema = z.object({
  acceptedDefaults: z.boolean().optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
  regenerate: z.boolean().optional(),
});

export const ExplainResultsSchema = z.object({
  backtestId: z.string().uuid(),
  sessionId: z.string().uuid().optional(),
});

export const SearchRequestSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().positive().max(20).default(5),
  domains: z.array(z.string()).optional(),
});

export const EXAMPLE_QUESTION =
  "Does buying NIFTY after a sharp fall work?";

export const OPENUI_ALLOWLIST = [
  "ResearchSummary",
  "ClarificationCard",
  "AssumptionBadge",
  "ExperimentField",
  "MetricCard",
  "WarningPanel",
  "TradeTable",
  "ResultInterpretation",
  "FollowUpQuestion",
  "SourceCitation",
] as const;
