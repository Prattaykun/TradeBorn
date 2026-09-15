import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

for (const p of [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "../../.env"),
  resolve(process.cwd(), "../.env"),
]) {
  if (existsSync(p)) {
    loadDotenv({ path: p });
    break;
  }
}

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().optional(),
  API_PORT: z.coerce.number().default(4000),
  API_HOST: z.string().default("0.0.0.0"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  LLM_PROVIDER: z
    .enum(["openai", "groq", "google", "gemini", "ollama"])
    .default("openai"),
  LLM_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().default("gpt-4o-mini"),
  OLLAMA_BASE_URL: z.string().default("http://127.0.0.1:11434"),
  EMBEDDING_PROVIDER: z
    .enum(["openai", "google", "gemini", "ollama", "none"])
    .default("none"),
  EMBEDDING_API_KEY: z.string().optional(),
  EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  EMBEDDING_DIMENSIONS: z.coerce.number().default(1536),
  BRAVE_SEARCH_API_KEY: z.string().optional(),
  TAVILY_API_KEY: z.string().optional(),
  SEARXNG_URL: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.warn("Env validation warnings:", parsed.error.flatten().fieldErrors);
    return EnvSchema.parse({
      ...process.env,
      DATABASE_URL:
        process.env.DATABASE_URL ?? "postgresql://localhost:5432/TradeBorn",
    });
  }
  return parsed.data;
}

export const env = loadEnv();
