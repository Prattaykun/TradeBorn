import { createHash } from "node:crypto";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../infrastructure/database/prisma.js";
import { env } from "../infrastructure/config.js";
import { embedTexts, toVectorLiteral } from "./embeddings.js";
import { localSearch } from "../search/local.js";

function knowledgeDir(): string {
  const candidates = [
    join(process.cwd(), "data", "knowledge"),
    join(process.cwd(), "..", "..", "data", "knowledge"),
    join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "data", "knowledge"),
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  return candidates[0]!;
}

function chunkText(text: string, size = 800, overlap = 100): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + size));
    i += size - overlap;
  }
  return chunks.filter((c) => c.trim().length > 0);
}

export type KnowledgeHit = {
  id: string;
  content: string;
  title: string;
  similarity: number | null;
  metadata: Record<string, unknown>;
  source: "pgvector" | "fts" | "minisearch";
};

export async function ingestKnowledge(): Promise<{ documents: number; chunks: number }> {
  const dir = knowledgeDir();
  if (!existsSync(dir)) return { documents: 0, chunks: 0 };

  await prisma.knowledgeChunk.deleteMany();
  await prisma.knowledgeDocument.deleteMany();

  const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
  let chunkCount = 0;

  for (const file of files) {
    const content = readFileSync(join(dir, file), "utf8");
    const title = content.split("\n")[0]?.replace(/^#\s*/, "") || file;
    const topic = file.replace(/\.md$/, "").replace(/-/g, "_");
    const doc = await prisma.knowledgeDocument.create({
      data: {
        title,
        sourceUrl: `local://knowledge/${file}`,
        documentType: "methodology",
        content,
        metadata: { topic, file },
      },
    });

    const parts = chunkText(content);
    const embeddings = await embedTexts(parts);

    for (let i = 0; i < parts.length; i++) {
      const chunk = await prisma.knowledgeChunk.create({
        data: {
          documentId: doc.id,
          chunkIndex: i,
          content: parts[i]!,
          metadata: {
            topic,
            source_type: "methodology",
            source_url: `local://knowledge/${file}`,
            embedding_model: embeddings ? env.EMBEDDING_MODEL : null,
            title,
          },
        },
      });
      chunkCount += 1;

      if (embeddings?.[i]) {
        const lit = toVectorLiteral(embeddings[i]!);
        await prisma.$executeRawUnsafe(
          `UPDATE knowledge_chunks SET embedding = $1::vector WHERE id = $2::uuid`,
          lit,
          chunk.id
        );
      }
    }
  }

  return { documents: files.length, chunks: chunkCount };
}

export async function retrieveKnowledge(
  query: string,
  limit = 5,
  topic?: string
): Promise<KnowledgeHit[]> {
  const embeddings = await embedTexts([query]);
  if (embeddings?.[0]) {
    try {
      const lit = toVectorLiteral(embeddings[0]!);
      const rows = topic
        ? await prisma.$queryRawUnsafe<
            {
              id: string;
              content: string;
              metadata: Record<string, unknown>;
              similarity: number;
            }[]
          >(
            `SELECT id, content, metadata,
              1 - (embedding <=> $1::vector) AS similarity
             FROM knowledge_chunks
             WHERE embedding IS NOT NULL
               AND metadata->>'topic' = $2
             ORDER BY embedding <=> $1::vector
             LIMIT $3`,
            lit,
            topic,
            limit
          )
        : await prisma.$queryRawUnsafe<
            {
              id: string;
              content: string;
              metadata: Record<string, unknown>;
              similarity: number;
            }[]
          >(
            `SELECT id, content, metadata,
              1 - (embedding <=> $1::vector) AS similarity
             FROM knowledge_chunks
             WHERE embedding IS NOT NULL
             ORDER BY embedding <=> $1::vector
             LIMIT $2`,
            lit,
            limit
          );

      if (rows.length) {
        return rows.map((r) => ({
          id: r.id,
          content: r.content,
          title: String(r.metadata?.title ?? "Knowledge"),
          similarity: Number(r.similarity),
          metadata: r.metadata,
          source: "pgvector" as const,
        }));
      }
    } catch (err) {
      console.warn("pgvector retrieval failed, falling back:", (err as Error).message);
    }
  }

  // FTS fallback
  try {
    const rows = await prisma.$queryRawUnsafe<
      { id: string; content: string; metadata: Record<string, unknown>; rank: number }[]
    >(
      `SELECT id, content, metadata,
        ts_rank(to_tsvector('english', content), plainto_tsquery('english', $1)) AS rank
       FROM knowledge_chunks
       WHERE to_tsvector('english', content) @@ plainto_tsquery('english', $1)
       ORDER BY rank DESC
       LIMIT $2`,
      query,
      limit
    );
    if (rows.length) {
      return rows.map((r) => ({
        id: r.id,
        content: r.content,
        title: String(r.metadata?.title ?? "Knowledge"),
        similarity: Number(r.rank),
        metadata: r.metadata,
        source: "fts" as const,
      }));
    }
  } catch (err) {
    console.warn("FTS retrieval failed:", (err as Error).message);
  }

  // MiniSearch last hop
  const local = await localSearch.search({ query, limit });
  return local.map((r, i) => ({
    id: `local-${i}`,
    content: r.snippet,
    title: r.title,
    similarity: null,
    metadata: { source_url: r.url },
    source: "minisearch" as const,
  }));
}

export function checksumFile(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}
