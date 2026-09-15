import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {
  ClarificationSchema,
  DEFAULT_EXPERIMENT,
  ExperimentDefinitionSchema,
  type Clarification,
  type ExperimentDefinition,
} from "@TradeBorn/shared";
import { invokeChat, hasLlmKey } from "./llm.js";
import { searchRouter } from "../search/search.router.js";
import { retrieveKnowledge } from "../rag/ingest.js";
import { prisma } from "../infrastructure/database/prisma.js";
import { runBacktest } from "../modules/backtests/backtest.engine.js";
import { OPENUI_CLARIFY_PROMPT } from "./openui-prompts.js";

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
    // Free-tier text models are tried in order if the preferred model fails.
    const { content: raw } = await invokeChat(
      [
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
      ],
      0
    );

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

const LEARN_EXPLAIN_PROMPT = `You explain a finished historical backtest for a normal reader.

Write markdown with exactly these headings, in order:

## What the data shows
2–4 sentences. Use the **formatted_metrics** values (already in %). Do not paste raw decimals like 0.357.
Mention sample size (completed trades / signals) so the reader knows how thin the evidence is.

## What we can reasonably conclude
3–5 bullets. This section is required. Derive a cautious takeaway from the numbers, for example:
- whether average/median net return was positive or negative under this definition
- whether win rate and profit factor support an edge
- how it compared to the benchmark (if provided)
- that this is **one parameter set on one sample**, not proof of a live edge
If results look weak (negative average, win rate well under 50%, profit factor under 1), say so plainly: the data does **not** support “this works” for this definition.

## What we cannot conclude
2–4 bullets. State limits: not out-of-sample, costs are simplified, overlapping was off, small sample, not investment advice.

## What to investigate next
3–4 short follow-up experiments (thresholds, holding period, overlap, uglier costs, later years).

Rules:
- Never invent numbers. Prefer formatted_metrics over raw metrics JSON.
- Do not dump the experiment definition as a questionnaire.
- Do not end after “questions for the user” — always finish with the conclusion sections.
- No OpenUI Lang. No HTML. No JavaScript.`;

function pctLabel(v: number | null | undefined, digits = 2): string {
  if (v == null || Number.isNaN(v)) return "n/a";
  return `${(v * 100).toFixed(digits)}%`;
}

function buildHeuristicConclusion(
  metrics: Record<string, number | null | undefined>,
  definition: ExperimentDefinition
): string {
  const n = metrics.completed_trades ?? 0;
  const signals = metrics.signal_count ?? 0;
  const win = metrics.win_rate;
  const avg = metrics.average_net_return;
  const med = metrics.median_net_return;
  const dd = metrics.max_drawdown;
  const pf = metrics.profit_factor;
  const bench = metrics.benchmark_return;

  const avgNeg = (avg ?? 0) < 0;
  const weakEdge =
    avgNeg || (win != null && win < 0.5) || (pf != null && pf < 1);

  const conclusion = weakEdge
    ? `Under this definition, the sample does **not** support the claim that “buying after a sharp fall works.” Average and median net returns were negative (or the win rate / profit factor stayed weak), so any bounce story is not showing up as a reliable edge here.`
    : `Under this definition, the sample shows a **modest positive** average net return. That is interesting but not proof of an edge — the sample is small and the test is in-sample only.`;

  return `## What the data shows

For **${definition.market.symbol}**, a ${definition.condition.window_sessions}-session fall of ≤ ${pctLabel(definition.condition.threshold, 1)}, then hold ${definition.exit.holding_sessions} sessions: **${n} completed trades** from **${signals} signals**. Win rate **${pctLabel(win, 1)}**, average net return **${pctLabel(avg)}**, median **${pctLabel(med)}**, max drawdown **${pctLabel(dd)}**${pf != null ? `, profit factor **${pf.toFixed(2)}**` : ""}${bench != null ? `. Buy-and-hold over the same window was **${pctLabel(bench)}**` : ""}.

## What we can reasonably conclude

- ${conclusion}
- With only **${n}** completed trades, the result is exploratory — one lucky or unlucky cluster of years can dominate.
- Costs and slippage here are a **simplified bps model**, not full brokerage/taxes/impact.
- Overlapping trades were **${definition.allow_overlapping ? "allowed" : "disabled"}**, so the trade count is not the same as the raw signal count.

## What we cannot conclude

- That the idea will work (or fail) on **future** NIFTY data.
- That a different fall size / hold length would look the same.
- That this is investment advice — it is a historical research notebook only.

## What to investigate next

- Test thresholds from -3% to -8%.
- Compare 5-, 10-, and 20-session holding periods.
- Enable overlapping trades and compare sample size / dependence.
- Raise slippage assumptions and re-run.`;
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
  const m = (input.metrics ?? {}) as Record<string, number | null | undefined>;
  const fallbackText = buildHeuristicConclusion(m, input.definition);

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

  const formatted_metrics = {
    completed_trades: m.completed_trades ?? 0,
    signal_count: m.signal_count ?? 0,
    incomplete_trades: m.incomplete_trades ?? 0,
    win_rate: pctLabel(m.win_rate, 1),
    average_net_return: pctLabel(m.average_net_return),
    median_net_return: pctLabel(m.median_net_return),
    cumulative_compounded_return: pctLabel(m.cumulative_compounded_return),
    max_drawdown: pctLabel(m.max_drawdown),
    best_trade: pctLabel(m.best_trade),
    worst_trade: pctLabel(m.worst_trade),
    profit_factor:
      m.profit_factor != null ? Number(m.profit_factor).toFixed(2) : "n/a",
    benchmark_return: pctLabel(m.benchmark_return),
  };

  if (!hasLlmKey()) {
    return { text: fallbackText, followUps, openui: openuiFallback };
  }

  try {
    const { content } = await invokeChat(
      [
        { role: "system", content: SYSTEM + "\n\n" + LEARN_EXPLAIN_PROMPT },
        {
          role: "user",
          content: JSON.stringify({
            definition_summary: {
              symbol: input.definition.market.symbol,
              fall_window_sessions: input.definition.condition.window_sessions,
              fall_threshold: pctLabel(input.definition.condition.threshold, 1),
              holding_sessions: input.definition.exit.holding_sessions,
              entry: input.definition.entry.timing,
              allow_overlapping: input.definition.allow_overlapping,
              hypothesis: input.definition.hypothesis,
            },
            formatted_metrics,
            warnings: input.warnings,
            citations,
          }),
        },
      ],
      0.2
    );

    const openuiMatch = content.match(/ResearchSummary[\s\S]*$/);
    let text = extractLearnText(content, fallbackText);
    // If the model skipped the conclusion heading, append the heuristic one.
    if (!/what we can reasonably conclude/i.test(text)) {
      text = `${text.trim()}\n\n${fallbackText}`;
    }
    return {
      text,
      followUps,
      openui: openuiMatch?.[0] ?? openuiFallback,
    };
  } catch (err) {
    console.warn("explainResults failed:", (err as Error).message);
    return { text: fallbackText, followUps, openui: openuiFallback };
  }
}

/** Pull readable markdown from the model reply; drop OpenUI Lang / fences. */
function extractLearnText(content: string, fallback: string): string {
  const raw = content.trim();
  if (!raw) return fallback;

  // Prefer prose before the first OpenUI root call.
  let text = raw;
  const openuiAt = text.search(/\bResearchSummary\s*\(/);
  if (openuiAt > 0) text = text.slice(0, openuiAt);
  else if (openuiAt === 0) {
    const body = text.match(/body\("((?:\\.|[^"\\])*)"\)/);
    const interp = text.match(
      /ResultInterpretation\(\s*text\("((?:\\.|[^"\\])*)"\)\s*\)/
    );
    text = (interp?.[1] ?? body?.[1] ?? "")
      .replace(/\\n/g, "\n")
      .replace(/\\"/g, '"');
  }

  text = text
    .replace(/^```(?:markdown|md|text)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .replace(/```[\s\S]*?```/g, "")
    .trim();

  if (text.length < 24) return fallback;
  return text.slice(0, 4000);
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
