import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {
  ClarificationSchema,
  DEFAULT_EXPERIMENT,
  ExperimentDefinitionSchema,
  type Clarification,
  type ExperimentDefinition,
} from "@TradeBorn/shared";
import { createChatModel, hasLlmKey } from "./llm.js";
import { searchRouter } from "../search/search.router.js";
import { retrieveKnowledge } from "../rag/ingest.js";
import { prisma } from "../infrastructure/database/prisma.js";
import { runBacktest } from "../modules/backtests/backtest.engine.js";
import { OPENUI_CLARIFY_PROMPT, OPENUI_LEARN_PROMPT } from "./openui-prompts.js";

const SYSTEM = `You are a research assistant, not a financial adviser.

Separate:
1. User-provided facts.
2. System assumptions.
3. Questions requiring user confirmation.
4. Deterministic results.
5. Interpretive conclusions.

Never invent market data or numerical results.
Use only the supplied experiment definition, metrics, warnings, and retrieved sources.
If evidence is insufficient, say so explicitly.
Never present assumptions as user requirements.`;

export function heuristicClarification(question: string): Clarification {
  const q = question.toLowerCase();
  const market = q.includes("nifty") ? "NIFTY 50" : null;
  const action = q.includes("buy") ? "buy" : q.includes("sell") ? "sell" : "unknown";
  const trigger = q.includes("sharp fall") || q.includes("fall") ? "sharp fall" : null;

  return ClarificationSchema.parse({
    interpretation: { market, action, trigger },
    userStated: [
      market ? `Instrument mentioned: ${market}` : "Instrument not clearly stated",
      action !== "unknown" ? `Direction: ${action}` : "Direction unclear",
      trigger ? `Trigger: ${trigger}` : "Trigger unclear",
    ],
    systemAssumptions: [
      "Sharp fall defaults to five-session close-to-close return <= -5%",
      "Entry at next session open to reduce look-ahead bias",
      "Exit after 10 trading sessions",
      "Overlapping trades disabled",
      "Simplified 10 bps round-trip cost assumption",
    ],
    missingParameters: [
      {
        key: "market",
        label: "Instrument",
        importance: "required",
        reason: "Determines which dataset and prices are used",
      },
      {
        key: "threshold",
        label: "Sharp fall threshold",
        importance: "required",
        reason: "Materially changes how many signals qualify",
      },
      {
        key: "window_sessions",
        label: "Fall measurement window",
        importance: "required",
        reason: "Defines the lookback for the fall condition",
      },
      {
        key: "holding_sessions",
        label: "Holding period",
        importance: "required",
        reason: "Controls exit timing and return horizon",
      },
      {
        key: "test_period",
        label: "Historical test period",
        importance: "recommended",
        reason: "Results depend on the sample window",
      },
      {
        key: "costs",
        label: "Transaction costs",
        importance: "recommended",
        reason: "Costs can erase apparent edges",
      },
      {
        key: "allow_overlapping",
        label: "Allow overlapping signals",
        importance: "optional",
        reason: "Affects sample dependence and trade count",
      },
    ],
    proposedDefaults: DEFAULT_EXPERIMENT,
    questions: [
      "Which NIFTY instrument should be tested?",
      "What fall threshold and lookback window?",
      "What holding period and entry timing?",
      "What historical period and cost assumptions?",
      "Should overlapping signals be allowed?",
    ],
  });
}

export async function interpretQuestion(question: string): Promise<Clarification> {
  if (!hasLlmKey()) return heuristicClarification(question);

  try {
    // Gemini rejects Zod nullable unions in response_schema ("type" list).
    // Ask for JSON and validate with Zod instead of withStructuredOutput.
    const llm = createChatModel(0);
    const response = await llm.invoke([
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `Analyze this trading research question. Mark unknowns clearly and propose conservative defaults.

Return ONLY valid JSON matching this shape (no markdown fences):
{
  "interpretation": { "market": string|null, "action": "buy"|"sell"|"unknown", "trigger": string|null },
  "userStated": string[],
  "systemAssumptions": string[],
  "missingParameters": [{ "key": string, "label": string, "importance": "required"|"recommended"|"optional", "reason": string }],
  "proposedDefaults": object,
  "questions": string[]
}

Question: ${question}`,
      },
    ]);

    const raw =
      typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content);
    const jsonText = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const parsed = JSON.parse(jsonText);
    if (!parsed.proposedDefaults || typeof parsed.proposedDefaults !== "object") {
      parsed.proposedDefaults = DEFAULT_EXPERIMENT;
    }
    return ClarificationSchema.parse(parsed);
  } catch (err) {
    console.warn("interpretQuestion LLM failed:", (err as Error).message);
    return heuristicClarification(question);
  }
}

export function buildExperimentFromParams(
  params: Record<string, unknown>,
  clarification?: Clarification
): ExperimentDefinition {
  const base = {
    ...DEFAULT_EXPERIMENT,
    ...(clarification?.proposedDefaults as Partial<ExperimentDefinition>),
  };

  const merged = {
    ...base,
    market: {
      symbol: String(params.symbol ?? params.market ?? base.market.symbol),
      asset_type: String(params.asset_type ?? base.market.asset_type),
    },
    condition: {
      type: "rolling_return" as const,
      window_sessions: Number(
        params.window_sessions ?? base.condition.window_sessions
      ),
      threshold: Number(params.threshold ?? base.condition.threshold),
    },
    exit: {
      type: "fixed_holding_period" as const,
      holding_sessions: Number(
        params.holding_sessions ?? base.exit.holding_sessions
      ),
      price_field: "close" as const,
    },
    test_period: {
      start: String(
        (params.test_period as { start?: string })?.start ??
          params.start ??
          base.test_period.start
      ),
      end: String(
        (params.test_period as { end?: string })?.end ??
          params.end ??
          base.test_period.end
      ),
    },
    costs: {
      round_trip_bps: Number(params.round_trip_bps ?? base.costs.round_trip_bps),
      slippage_bps: Number(params.slippage_bps ?? base.costs.slippage_bps),
      entry_slippage_bps: Number(
        params.entry_slippage_bps ?? base.costs.entry_slippage_bps ?? 5
      ),
      exit_slippage_bps: Number(
        params.exit_slippage_bps ?? base.costs.exit_slippage_bps ?? 5
      ),
    },
    allow_overlapping: Boolean(
      params.allow_overlapping ?? base.allow_overlapping
    ),
    hypothesis: String(params.hypothesis ?? base.hypothesis),
  };

  return ExperimentDefinitionSchema.parse(merged);
}

export async function explainResults(input: {
  metrics: unknown;
  warnings: string[];
  definition: ExperimentDefinition;
  citations?: { title: string; snippet: string; url?: string }[];
}): Promise<{
  text: string;
  followUps: string[];
  openui: string;
}> {
  const citations = input.citations ?? [];
  const fallbackText = `Under this specific definition, the historical sample showed ${
    (input.metrics as { completed_trades?: number })?.completed_trades ?? 0
  } completed trades with win rate ${
    (input.metrics as { win_rate?: number | null })?.win_rate != null
      ? (
          ((input.metrics as { win_rate: number }).win_rate as number) * 100
        ).toFixed(1) + "%"
      : "n/a"
  }. Treat this as exploratory research, not investment advice.`;

  const followUps = [
    "Test thresholds from -3% to -8%",
    "Compare 5-, 10-, and 20-session holding periods",
    "Enable overlapping trades and compare sample size",
    "Raise slippage assumptions and re-run",
  ];

  const openuiFallback = buildLearnOpenUi({
    text: fallbackText,
    followUps,
    warnings: input.warnings,
    metrics: input.metrics,
    citations,
  });

  if (!hasLlmKey()) {
    return { text: fallbackText, followUps, openui: openuiFallback };
  }

  try {
    const llm = createChatModel(0.2);
    const response = await llm.invoke([
      { role: "system", content: SYSTEM + "\n" + OPENUI_LEARN_PROMPT },
      {
        role: "user",
        content: JSON.stringify({
          definition: input.definition,
          metrics: input.metrics,
          warnings: input.warnings,
          citations,
          instruction:
            "Write a grounded interpretation. Then output OpenUI Lang using only allowlisted components. Copy metric numbers exactly from JSON.",
        }),
      },
    ]);
    const content =
      typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content);

    const openuiMatch = content.match(/ResearchSummary[\s\S]*$/);
    return {
      text: content.split("```")[0]?.slice(0, 2000) || fallbackText,
      followUps,
      openui: openuiMatch?.[0] ?? openuiFallback,
    };
  } catch (err) {
    console.warn("explainResults failed:", (err as Error).message);
    return { text: fallbackText, followUps, openui: openuiFallback };
  }
}

export function buildClarifyOpenUi(clarification: Clarification): string {
  const cards = clarification.missingParameters
    .slice(0, 4)
    .map(
      (p) =>
        `ClarificationCard(title("${p.label}"), body("${p.reason.replace(/"/g, "'")}"), importance("${p.importance}"))`
    )
    .join(",\n  ");

  const assumptions = clarification.systemAssumptions
    .slice(0, 4)
    .map((a) => `AssumptionBadge(label("${a.replace(/"/g, "'")}"))`)
    .join(",\n  ");

  return `ResearchSummary(
  title("Clarification"),
  body("${(clarification.interpretation.trigger ?? "Ambiguous trigger").replace(/"/g, "'")} — confirm parameters before testing."),
  children(
    ${cards},
    ${assumptions}
  )
)`;
}

export function buildLearnOpenUi(input: {
  text: string;
  followUps: string[];
  warnings: string[];
  metrics: unknown;
  citations: { title: string; snippet: string; url?: string }[];
}): string {
  const m = input.metrics as Record<string, number | null>;
  const safe = (s: string) => s.replace(/"/g, "'").slice(0, 240);
  const metrics = [
    `MetricCard(label("Completed trades"), value("${m.completed_trades ?? 0}"))`,
    `MetricCard(label("Win rate"), value("${m.win_rate != null ? (Number(m.win_rate) * 100).toFixed(1) + "%" : "n/a"}"))`,
    `MetricCard(label("Avg net return"), value("${m.average_net_return != null ? (Number(m.average_net_return) * 100).toFixed(2) + "%" : "n/a"}"))`,
    `MetricCard(label("Max drawdown"), value("${m.max_drawdown != null ? (Number(m.max_drawdown) * 100).toFixed(2) + "%" : "n/a"}"))`,
  ].join(",\n    ");

  const warnings = input.warnings
    .slice(0, 4)
    .map((w) => `WarningPanel(message("${safe(w)}"))`)
    .join(",\n    ");

  const followUps = input.followUps
    .slice(0, 4)
    .map((f) => `FollowUpQuestion(text("${safe(f)}"))`)
    .join(",\n    ");

  const citations = input.citations
    .slice(0, 3)
    .map(
      (c) =>
        `SourceCitation(title("${safe(c.title)}"), snippet("${safe(c.snippet)}"), url("${safe(c.url ?? "")}"))`
    )
    .join(",\n    ");

  return `ResearchSummary(
  title("Learn"),
  body("${safe(input.text)}"),
  children(
    ResultInterpretation(text("${safe(input.text)}")),
    ${metrics},
    ${warnings},
    ${followUps}${citations ? `,\n    ${citations}` : ""}
  )
)`;
}

export const agentTools = [
  tool(
    async ({ query, limit }) => {
      const result = await searchRouter.search({ query, limit: limit ?? 5 });
      return JSON.stringify(result);
    },
    {
      name: "web_search",
      description:
        "Search external research sources with multi-provider fallback. Snippets are not market data.",
      schema: z.object({
        query: z.string(),
        limit: z.number().optional(),
      }),
    }
  ),
  tool(
    async ({ query, limit, topic }) => {
      const hits = await retrieveKnowledge(query, limit ?? 5, topic);
      return JSON.stringify(hits);
    },
    {
      name: "retrieve_knowledge",
      description:
        "Retrieve internal methodology knowledge via pgvector with FTS/MiniSearch fallback.",
      schema: z.object({
        query: z.string(),
        limit: z.number().optional(),
        topic: z.string().optional(),
      }),
    }
  ),
  tool(
    async ({ datasetId }) => {
      const ds = datasetId
        ? await prisma.dataset.findUnique({ where: { id: datasetId } })
        : await prisma.dataset.findFirst({ orderBy: { createdAt: "desc" } });
      return JSON.stringify(ds);
    },
    {
      name: "get_dataset_metadata",
      description: "Get dataset coverage, version, and checksum.",
      schema: z.object({ datasetId: z.string().uuid().optional() }),
    }
  ),
  tool(
    async ({ backtestId }) => {
      const run = await prisma.backtestRun.findUnique({
        where: { id: backtestId },
      });
      return JSON.stringify({
        metrics: run?.metrics,
        warnings: run?.warnings,
        status: run?.status,
      });
    },
    {
      name: "get_metrics",
      description: "Read-only persisted backtest metrics.",
      schema: z.object({ backtestId: z.string().uuid() }),
    }
  ),
];

export { OPENUI_CLARIFY_PROMPT };
