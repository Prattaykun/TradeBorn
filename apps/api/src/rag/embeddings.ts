import { env } from "../infrastructure/config.js";

export async function embedTexts(texts: string[]): Promise<number[][] | null> {
  if (!texts.length) return [];

  const provider = env.EMBEDDING_PROVIDER;

  if (provider === "none") return null;

  if (provider === "ollama") {
    return embedOllama(texts);
  }

  if (provider === "google" || provider === "gemini") {
    if (!env.EMBEDDING_API_KEY && !env.LLM_API_KEY) return null;
    return embedGoogle(texts);
  }

  if (!env.EMBEDDING_API_KEY) return null;

  // openai-compatible embeddings
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.EMBEDDING_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.EMBEDDING_MODEL,
      input: texts,
      dimensions: env.EMBEDDING_DIMENSIONS,
    }),
  });
  if (!res.ok) {
    console.warn("Embedding request failed:", res.status, await res.text());
    return null;
  }
  const data = (await res.json()) as {
    data: { embedding: number[]; index: number }[];
  };
  return data.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

async function embedGoogle(texts: string[]): Promise<number[][] | null> {
  const apiKey = env.EMBEDDING_API_KEY || env.LLM_API_KEY;
  const model = env.EMBEDDING_MODEL || "gemini-embedding-001";
  const out: number[][] = [];

  for (const text of texts) {
    const url = new URL(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent`
    );
    url.searchParams.set("key", apiKey!);

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        taskType: "RETRIEVAL_DOCUMENT",
        outputDimensionality: env.EMBEDDING_DIMENSIONS,
      }),
    });

    if (!res.ok) {
      console.warn("Google embedding failed:", res.status, await res.text());
      return null;
    }

    const data = (await res.json()) as {
      embedding?: { values?: number[] };
    };
    const values = data.embedding?.values;
    if (!values?.length) return null;
    out.push(normalizeIfNeeded(values));
  }

  return out;
}

/** Gemini docs: non-3072 dims for embedding-001 may need L2 normalization */
function normalizeIfNeeded(values: number[]): number[] {
  if (values.length === 3072) return values;
  const norm = Math.sqrt(values.reduce((s, v) => s + v * v, 0));
  if (!norm) return values;
  return values.map((v) => v / norm);
}

async function embedOllama(texts: string[]): Promise<number[][] | null> {
  const out: number[][] = [];
  for (const text of texts) {
    const res = await fetch(
      `${env.OLLAMA_BASE_URL.replace(/\/$/, "")}/api/embeddings`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: env.EMBEDDING_MODEL, prompt: text }),
      }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { embedding: number[] };
    out.push(data.embedding);
  }
  return out;
}

export function toVectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}
