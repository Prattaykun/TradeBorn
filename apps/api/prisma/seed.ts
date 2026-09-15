import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { ingestKnowledge } from "../src/rag/ingest.js";

for (const p of [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "../../.env"),
]) {
  if (existsSync(p)) {
    config({ path: p });
    break;
  }
}

const prisma = new PrismaClient();

function resolveCsv(): string {
  const candidates = [
    join(process.cwd(), "data", "nifty50_daily.csv"),
    join(process.cwd(), "..", "..", "data", "nifty50_daily.csv"),
    join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "data", "nifty50_daily.csv"),
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  throw new Error("nifty50_daily.csv not found");
}

async function ensureVectorExtension() {
  try {
    await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector`);
  } catch (err) {
    console.warn("Could not create vector extension (may already exist):", (err as Error).message);
  }
}

async function seedDataset() {
  const csvPath = resolveCsv();
  const content = readFileSync(csvPath, "utf8");
  const checksum = createHash("sha256").update(content).digest("hex");
  const lines = content.trim().split(/\r?\n/).slice(1);
  const rows = lines.map((line) => {
    const [trade_date, open, high, low, close, volume] = line.split(",");
    return {
      tradeDate: new Date(trade_date!),
      open: open!,
      high: high!,
      low: low!,
      close: close!,
      volume: volume || null,
    };
  });

  const existing = await prisma.dataset.findFirst({
    where: { checksum },
  });
  if (existing) {
    console.log("Dataset already seeded:", existing.id);
    return existing;
  }

  await prisma.backtestTrade.deleteMany();
  await prisma.backtestRun.deleteMany();
  await prisma.marketBar.deleteMany();
  await prisma.dataset.deleteMany({ where: { symbol: "NIFTY50" } });

  const startDate = rows[0]!.tradeDate;
  const endDate = rows[rows.length - 1]!.tradeDate;

  const dataset = await prisma.dataset.create({
    data: {
      name: "NIFTY 50 Daily OHLC (sample)",
      symbol: "NIFTY50",
      source: "synthetic_sample_csv",
      version: "1.0.0",
      startDate,
      endDate,
      rowCount: rows.length,
      checksum,
      metadata: {
        path: "data/nifty50_daily.csv",
        note: "Sample/synthetic series for reproducible demos — not live exchange data",
      },
    },
  });

  const batchSize = 500;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    await prisma.marketBar.createMany({
      data: batch.map((r) => ({
        datasetId: dataset.id,
        tradeDate: r.tradeDate,
        open: r.open,
        high: r.high,
        low: r.low,
        close: r.close,
        volume: r.volume,
      })),
    });
  }

  console.log(
    `Seeded dataset ${dataset.id} rows=${rows.length} ${startDate.toISOString().slice(0, 10)}..${endDate.toISOString().slice(0, 10)}`
  );
  return dataset;
}

async function main() {
  await ensureVectorExtension();
  await seedDataset();
  const knowledge = await ingestKnowledge();
  console.log("Knowledge ingest:", knowledge);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
