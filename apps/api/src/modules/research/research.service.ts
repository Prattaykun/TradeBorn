import {
  DEFAULT_EXPERIMENT,
  ExperimentDefinitionSchema,
  type ExperimentDefinition,
} from "@TradeBorn/shared";
import { Prisma } from "@prisma/client";
import { prisma } from "../../infrastructure/database/prisma.js";
import {
  buildClarifyOpenUi,
  buildExperimentFromParams,
  explainResults,
  interpretQuestion,
} from "../../ai/graph.js";
import { runBacktest, type OhlcBar } from "../backtests/backtest.engine.js";
import { retrieveKnowledge } from "../../rag/ingest.js";

/** Prisma Json columns reject `unknown` / custom object types — serialize first. */
function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function createSession(question: string) {
  const clarification = await interpretQuestion(question);
  const openui = buildClarifyOpenUi(clarification);
  const session = await prisma.researchSession.create({
    data: {
      question,
      status: "clarify",
      clarification: toInputJson(clarification),
      openuiClarify: openui,
    },
  });
  return session;
}

export async function getSession(id: string) {
  return prisma.researchSession.findUnique({
    where: { id },
    include: {
      experiments: {
        orderBy: { version: "desc" },
        include: {
          backtests: { orderBy: { startedAt: "desc" }, take: 5 },
        },
      },
    },
  });
}

export async function clarifySession(
  id: string,
  input: {
    acceptedDefaults?: boolean;
    parameters?: Record<string, unknown>;
    regenerate?: boolean;
  }
) {
  const session = await prisma.researchSession.findUniqueOrThrow({
    where: { id },
  });

  let clarification = session.clarification as Awaited<
    ReturnType<typeof interpretQuestion>
  >;

  if (input.regenerate) {
    clarification = await interpretQuestion(session.question);
  }

  const params = input.acceptedDefaults
    ? (clarification.proposedDefaults as Record<string, unknown>)
    : (input.parameters ?? {});

  const definition = buildExperimentFromParams(params, clarification);
  const openui = buildClarifyOpenUi(clarification);

  const updated = await prisma.researchSession.update({
    where: { id },
    data: {
      clarification: toInputJson(clarification),
      openuiClarify: openui,
      status: "define",
    },
  });

  return { session: updated, definition, clarification };
}

export async function createExperiment(
  sessionId: string,
  definitionInput: unknown
) {
  const definition = ExperimentDefinitionSchema.parse(definitionInput);
  const latest = await prisma.experimentDefinition.findFirst({
    where: { sessionId },
    orderBy: { version: "desc" },
  });
  const version = (latest?.version ?? 0) + 1;
  const assumptions = {
    source: "user_confirmed_or_defaults",
    defaults: DEFAULT_EXPERIMENT,
  };
  const experiment = await prisma.experimentDefinition.create({
    data: {
      sessionId,
      version,
      definition,
      hypothesis: definition.hypothesis,
      assumptions,
    },
  });
  await prisma.researchSession.update({
    where: { id: sessionId },
    data: { status: "define" },
  });
  return experiment;
}

export async function validateExperiment(experimentId: string) {
  const experiment = await prisma.experimentDefinition.findUniqueOrThrow({
    where: { id: experimentId },
  });
  const definition = ExperimentDefinitionSchema.parse(experiment.definition);
  const dataset = await prisma.dataset.findFirst({
    where: { symbol: definition.market.symbol },
    orderBy: { createdAt: "desc" },
  });
  if (!dataset) {
    return {
      valid: false,
      errors: [`No dataset found for ${definition.market.symbol}`],
      dataset: null,
    };
  }
  const errors: string[] = [];
  if (definition.test_period.start > dataset.endDate.toISOString().slice(0, 10)) {
    errors.push("Test period starts after dataset coverage");
  }
  if (definition.test_period.end < dataset.startDate.toISOString().slice(0, 10)) {
    errors.push("Test period ends before dataset coverage");
  }
  return { valid: errors.length === 0, errors, dataset };
}

export async function runExperiment(experimentId: string) {
  const experiment = await prisma.experimentDefinition.findUniqueOrThrow({
    where: { id: experimentId },
  });
  const definition = ExperimentDefinitionSchema.parse(experiment.definition);
  const dataset =
    (await prisma.dataset.findFirst({
      where: { symbol: definition.market.symbol },
      orderBy: { createdAt: "desc" },
    })) ?? (await prisma.dataset.findFirst({ orderBy: { createdAt: "desc" } }));

  if (!dataset) {
    throw new Error("No dataset available");
  }

  const run = await prisma.backtestRun.create({
    data: {
      experimentId,
      datasetId: dataset.id,
      status: "running",
      startedAt: new Date(),
    },
  });

  try {
    const barsRaw = await prisma.marketBar.findMany({
      where: { datasetId: dataset.id },
      orderBy: { tradeDate: "asc" },
    });
    const bars: OhlcBar[] = barsRaw.map((b) => ({
      tradeDate: b.tradeDate.toISOString().slice(0, 10),
      open: Number(b.open),
      high: Number(b.high),
      low: Number(b.low),
      close: Number(b.close),
      volume: b.volume != null ? Number(b.volume) : null,
    }));

    const entrySlippage =
      definition.costs.entry_slippage_bps ?? definition.costs.slippage_bps;
    const exitSlippage =
      definition.costs.exit_slippage_bps ?? definition.costs.slippage_bps;
    const feeBps = Math.max(
      0,
      definition.costs.round_trip_bps - entrySlippage - exitSlippage
    );

    const result = runBacktest({
      bars,
      windowSessions: definition.condition.window_sessions,
      threshold: definition.condition.threshold,
      holdingSessions: definition.exit.holding_sessions,
      allowOverlapping: definition.allow_overlapping,
      entrySlippageBps: entrySlippage,
      exitSlippageBps: exitSlippage,
      feeBps,
      startDate: definition.test_period.start,
      endDate: definition.test_period.end,
    });

    await prisma.backtestTrade.createMany({
      data: [
        ...result.trades.map((t) => ({
          backtestRunId: run.id,
          signalDate: new Date(t.signalDate),
          entryDate: new Date(t.entryDate),
          exitDate: new Date(t.exitDate),
          entryPrice: t.entryPrice,
          exitPrice: t.exitPrice,
          grossReturn: t.grossReturn,
          costReturn: t.costReturn,
          netReturn: t.netReturn,
          metadata: { incomplete: false },
        })),
        ...result.incompleteTrades.map((t) => ({
          backtestRunId: run.id,
          signalDate: new Date(t.signalDate),
          entryDate: new Date(t.entryDate),
          exitDate: new Date(t.exitDate),
          entryPrice: t.entryPrice,
          exitPrice: t.exitPrice,
          grossReturn: t.grossReturn,
          costReturn: t.costReturn,
          netReturn: t.netReturn,
          metadata: { incomplete: true },
        })),
      ],
    });

    const updated = await prisma.backtestRun.update({
      where: { id: run.id },
      data: {
        status: "completed",
        completedAt: new Date(),
        metrics: result.metrics,
        warnings: result.warnings,
      },
    });

    await prisma.researchSession.update({
      where: { id: experiment.sessionId },
      data: { status: "learn" },
    });

    return { run: updated, dataset };
  } catch (err) {
    await prisma.backtestRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        errorMessage: (err as Error).message,
        completedAt: new Date(),
      },
    });
    throw err;
  }
}

export async function explainBacktest(backtestId: string) {
  const run = await prisma.backtestRun.findUniqueOrThrow({
    where: { id: backtestId },
    include: { experiment: true },
  });
  const definition = ExperimentDefinitionSchema.parse(run.experiment.definition);
  const citations = await retrieveKnowledge(
    `${definition.hypothesis} look-ahead bias costs sample size`,
    4
  );
  const explanation = await explainResults({
    metrics: run.metrics,
    warnings: (run.warnings as string[]) ?? [],
    definition,
    citations: citations.map((c) => ({
      title: c.title,
      snippet: c.content.slice(0, 280),
      url: String(c.metadata?.source_url ?? ""),
    })),
  });

  const updated = await prisma.backtestRun.update({
    where: { id: backtestId },
    data: {
      openuiLearn: explanation.openui,
      interpretation: toInputJson({
        text: explanation.text,
        followUps: explanation.followUps,
        generated_by: "llm_or_heuristic",
        citations,
      }),
    },
  });

  return {
    data: run.metrics,
    interpretation: {
      text: explanation.text,
      followUps: explanation.followUps,
      generated_by: "llm_or_heuristic",
      context_metric_ids: [
        "completed_trades",
        "win_rate",
        "average_net_return",
        "max_drawdown",
      ],
    },
    warnings: run.warnings,
    openui: explanation.openui,
    citations,
    run: updated,
  };
}

export type { ExperimentDefinition };
