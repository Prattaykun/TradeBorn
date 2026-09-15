import type { SearchResult } from "@TradeBorn/shared";
import { prisma } from "../infrastructure/database/prisma.js";
import { CircuitBreaker, type SearchInput, type SearchProvider } from "./types.js";
import {
  BraveSearchProvider,
  DuckDuckGoProvider,
  SearXNGProvider,
  TavilySearchProvider,
  WikipediaProvider,
} from "./providers.js";
import { localSearch } from "./local.js";

export type SearchResponse = {
  results: SearchResult[];
  usedProvider: string;
  attemptedProviders: string[];
  fromCache: boolean;
};

/**
 * Fallback order:
 * 1–2. Optional paid keys (Brave, Tavily) — skipped when unset. Brave has no free tier.
 * 3–6. Free: DuckDuckGo → SearXNG (if URL) → Wikipedia → local MiniSearch.
 */
export class SearchRouter {
  private providers: SearchProvider[];
  private breakers = new Map<string, CircuitBreaker>();

  constructor(providers?: SearchProvider[]) {
    this.providers =
      providers ??
      [
        new BraveSearchProvider(),
        new TavilySearchProvider(),
        new DuckDuckGoProvider(),
        new SearXNGProvider(),
        new WikipediaProvider(),
        localSearch,
      ];
    for (const p of this.providers) {
      this.breakers.set(p.name, new CircuitBreaker());
    }
  }

  async search(input: SearchInput): Promise<SearchResponse> {
    const cached = await prisma.searchCache.findFirst({
      where: { query: input.query },
      orderBy: { createdAt: "desc" },
    });
    if (cached && Date.now() - cached.createdAt.getTime() < 24 * 60 * 60 * 1000) {
      return {
        results: cached.results as SearchResult[],
        usedProvider: cached.provider,
        attemptedProviders: [cached.provider],
        fromCache: true,
      };
    }

    const attempted: string[] = [];
    for (const provider of this.providers) {
      attempted.push(provider.name);
      if (!provider.isAvailable()) continue;
      const breaker = this.breakers.get(provider.name)!;
      if (breaker.isOpen) continue;
      try {
        const results = await provider.search(input);
        if (results.length > 0) {
          breaker.recordSuccess();
          await prisma.searchCache.create({
            data: {
              query: input.query,
              provider: provider.name,
              results,
            },
          });
          return {
            results,
            usedProvider: provider.name,
            attemptedProviders: attempted,
            fromCache: false,
          };
        }
      } catch (err) {
        breaker.recordFailure();
        console.warn(`[search] ${provider.name} failed:`, (err as Error).message);
      }
    }

    // absolute last hop: empty local still returns empty with local provider
    return {
      results: [],
      usedProvider: "none",
      attemptedProviders: attempted,
      fromCache: false,
    };
  }
}

export const searchRouter = new SearchRouter();
