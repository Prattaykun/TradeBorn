import MiniSearch from "minisearch";
import type { SearchResult } from "@TradeBorn/shared";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  sanitizeSnippet,
  type SearchInput,
  type SearchProvider,
} from "./types.js";

type Doc = { id: string; title: string; content: string; path: string };

function resolveKnowledgeDir(): string {
  const candidates = [
    join(process.cwd(), "data", "knowledge"),
    join(process.cwd(), "..", "..", "data", "knowledge"),
    join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "data", "knowledge"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return candidates[0]!;
}

export class LocalMiniSearchProvider implements SearchProvider {
  readonly name = "local_minisearch";
  private mini: MiniSearch<Doc>;
  private docs: Doc[] = [];

  constructor() {
    this.mini = new MiniSearch<Doc>({
      fields: ["title", "content"],
      storeFields: ["title", "content", "path"],
    });
    this.load();
  }

  private load(): void {
    const dir = resolveKnowledgeDir();
    if (!existsSync(dir)) return;
    const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
    this.docs = files.map((file, idx) => {
      const content = readFileSync(join(dir, file), "utf8");
      const title = content.split("\n")[0]?.replace(/^#\s*/, "") || file;
      return { id: String(idx), title, content, path: file };
    });
    if (this.docs.length) {
      this.mini.addAll(this.docs);
    }
  }

  isAvailable(): boolean {
    return this.docs.length > 0;
  }

  async search(input: SearchInput): Promise<SearchResult[]> {
    if (!this.docs.length) return [];
    const hits = this.mini.search(input.query, { prefix: true, fuzzy: 0.2 });
    if (!hits.length) {
      // keyword fallback: include any doc mentioning a token
      const tokens = input.query.toLowerCase().split(/\s+/).filter(Boolean);
      return this.docs
        .filter((d) => tokens.some((t) => d.content.toLowerCase().includes(t)))
        .slice(0, input.limit)
        .map((d) => ({
          title: d.title,
          url: `local://knowledge/${d.path}`,
          snippet: sanitizeSnippet(d.content),
          source: "local",
        }));
    }
    return hits.slice(0, input.limit).map((h) => {
      const doc = this.docs.find((d) => d.id === h.id)!;
      return {
        title: doc.title,
        url: `local://knowledge/${doc.path}`,
        snippet: sanitizeSnippet(doc.content),
        source: "local",
      };
    });
  }

  getDocuments(): Doc[] {
    return this.docs;
  }
}

export const localSearch = new LocalMiniSearchProvider();
