import type { FastifyInstance } from "fastify";
import {
  ClarifySessionSchema,
  CreateSessionSchema,
  ExplainResultsSchema,
  ExperimentDefinitionSchema,
  SearchRequestSchema,
} from "@TradeBorn/shared";
import { prisma } from "./infrastructure/database/prisma.js";
import { searchRouter } from "./search/search.router.js";
import {
  clarifySession,
  createExperiment,
  createSession,
  explainBacktest,
  getSession,
  runExperiment,
  validateExperiment,
} from "./modules/research/research.service.js";

export async function registerRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({ ok: true }));

  app.post("/api/research/sessions", async (req, reply) => {
    try {
      const body = CreateSessionSchema.parse(req.body);
      const session = await createSession(body.question);
      return reply.code(201).send({ data: session });
    } catch (err) {
      const message = (err as Error).message ?? "Unknown error";
      req.log.error(err);
      if (message.includes("Can't reach database") || message.includes("P1001")) {
        return reply.code(503).send({
          error:
            "Database unreachable. Wake the Neon project in the console, check DATABASE_URL, then retry.",
        });
      }
      return reply.code(500).send({ error: message });
    }
  });

  app.get<{ Params: { id: string } }>(
    "/api/research/sessions/:id",
    async (req, reply) => {
      const session = await getSession(req.params.id);
      if (!session) return reply.code(404).send({ error: "Not found" });
      return { data: session };
    }
  );

  app.post<{ Params: { id: string } }>(
    "/api/research/sessions/:id/clarify",
    async (req) => {
      const body = ClarifySessionSchema.parse(req.body ?? {});
      const result = await clarifySession(req.params.id, body);
      return { data: result };
    }
  );

  app.post<{ Params: { id: string } }>(
    "/api/research/sessions/:id/experiment",
    async (req, reply) => {
      const definition = ExperimentDefinitionSchema.parse(req.body);
      const experiment = await createExperiment(req.params.id, definition);
      return reply.code(201).send({ data: experiment });
    }
  );

  app.post<{ Params: { id: string } }>(
    "/api/experiments/:id/validate",
    async (req) => {
      const result = await validateExperiment(req.params.id);
      return { data: result };
    }
  );

  app.post<{ Params: { id: string } }>(
    "/api/experiments/:id/run",
    async (req) => {
      const result = await runExperiment(req.params.id);
      return {
        data: result.run.metrics,
        warnings: result.run.warnings,
        run: result.run,
        dataset: {
          id: result.dataset.id,
          name: result.dataset.name,
          version: result.dataset.version,
          checksum: result.dataset.checksum,
          startDate: result.dataset.startDate,
          endDate: result.dataset.endDate,
        },
      };
    }
  );

  app.get<{ Params: { id: string } }>(
    "/api/backtests/:id",
    async (req, reply) => {
      const run = await prisma.backtestRun.findUnique({
        where: { id: req.params.id },
        include: { experiment: true, dataset: true },
      });
      if (!run) return reply.code(404).send({ error: "Not found" });
      return {
        data: run.metrics,
        warnings: run.warnings,
        interpretation: run.interpretation,
        openui: run.openuiLearn,
        status: run.status,
        errorMessage: run.errorMessage,
        run,
      };
    }
  );

  app.get<{ Params: { id: string } }>(
    "/api/backtests/:id/trades",
    async (req) => {
      const trades = await prisma.backtestTrade.findMany({
        where: { backtestRunId: req.params.id },
        orderBy: { signalDate: "asc" },
      });
      return {
        data: trades.map((t: { id: any; signalDate: { toISOString: () => string | any[]; }; entryDate: { toISOString: () => string | any[]; }; exitDate: { toISOString: () => string | any[]; }; entryPrice: any; exitPrice: any; grossReturn: any; costReturn: any; netReturn: any; metadata: any; }) => ({
          id: t.id,
          signal_date: t.signalDate.toISOString().slice(0, 10),
          entry_date: t.entryDate.toISOString().slice(0, 10),
          exit_date: t.exitDate.toISOString().slice(0, 10),
          entry_price: Number(t.entryPrice),
          exit_price: Number(t.exitPrice),
          gross_return: Number(t.grossReturn),
          cost_return: Number(t.costReturn),
          net_return: Number(t.netReturn),
          metadata: t.metadata,
        })),
      };
    }
  );

  app.get<{
    Params: { id: string };
    Querystring: { from?: string; to?: string };
  }>("/api/backtests/:id/bars", async (req, reply) => {
    const run = await prisma.backtestRun.findUnique({
      where: { id: req.params.id },
      select: { datasetId: true },
    });
    if (!run) return reply.code(404).send({ error: "Not found" });

    const from = req.query.from;
    const to = req.query.to;
    const bars = await prisma.marketBar.findMany({
      where: {
        datasetId: run.datasetId,
        ...(from || to
          ? {
              tradeDate: {
                ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
                ...(to ? { lte: new Date(`${to}T00:00:00.000Z`) } : {}),
              },
            }
          : {}),
      },
      orderBy: { tradeDate: "asc" },
      take: 400,
    });

    return {
      data: bars.map((b) => ({
        date: b.tradeDate.toISOString().slice(0, 10),
        open: Number(b.open),
        high: Number(b.high),
        low: Number(b.low),
        close: Number(b.close),
      })),
    };
  });

  app.post("/api/ai/explain-results", async (req) => {
    const body = ExplainResultsSchema.parse(req.body);
    try {
      const result = await explainBacktest(body.backtestId);
      return result;
    } catch (err) {
      return {
        data: null,
        interpretation: {
          text: "AI explanation unavailable. Deterministic metrics remain valid.",
          generated_by: "fallback",
          context_metric_ids: [],
        },
        warnings: [(err as Error).message],
        openui: null,
      };
    }
  });

  app.post("/api/search", async (req) => {
    const body = SearchRequestSchema.parse(req.body);
    const result = await searchRouter.search(body);
    return { data: result };
  });

  app.get("/api/datasets", async () => {
    const datasets = await prisma.dataset.findMany({
      orderBy: { createdAt: "desc" },
    });
    return { data: datasets };
  });
}
