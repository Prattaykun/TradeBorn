import type { SearchResult } from "@TradeBorn/shared";
import { env } from "../infrastructure/config.js";
import {
  sanitizeSnippet,
  withTimeout,
  type SearchInput,
  type SearchProvider,
} from "./types.js";

export class BraveSearchProvider implements SearchProvider {
  readonly name = "brave";

  isAvailable(): boolean {
    return Boolean(env.BRAVE_SEARCH_API_KEY);
  }

  async search(input: SearchInput): Promise<SearchResult[]> {
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", input.query);
    url.searchParams.set("count", String(input.limit));
    const res = await withTimeout(
      fetch(url, {
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": env.BRAVE_SEARCH_API_KEY!,
        },
      }),
      8000,
      "brave"
    );
    if (!res.ok) throw new Error(`Brave HTTP ${res.status}`);
    const data = (await res.json()) as {
      web?: { results?: { title?: string; url?: string; description?: string }[] };
    };
    return (data.web?.results ?? []).slice(0, input.limit).map((r) => ({
      title: r.title ?? "Untitled",
      url: r.url ?? "",
      snippet: sanitizeSnippet(r.description ?? ""),
      source: "web",
    }));
  }
}

export class TavilySearchProvider implements SearchProvider {
  readonly name = "tavily";

  isAvailable(): boolean {
    return Boolean(env.TAVILY_API_KEY);
  }

  async search(input: SearchInput): Promise<SearchResult[]> {
    const res = await withTimeout(
      fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: env.TAVILY_API_KEY,
          query: input.query,
          max_results: input.limit,
          include_domains: input.domains,
        }),
      }),
      8000,
      "tavily"
    );
    if (!res.ok) throw new Error(`Tavily HTTP ${res.status}`);
    const data = (await res.json()) as {
      results?: { title?: string; url?: string; content?: string }[];
    };
    return (data.results ?? []).slice(0, input.limit).map((r) => ({
      title: r.title ?? "Untitled",
      url: r.url ?? "",
      snippet: sanitizeSnippet(r.content ?? ""),
      source: "web",
    }));
  }
}

export class DuckDuckGoProvider implements SearchProvider {
  readonly name = "duckduckgo";

  isAvailable(): boolean {
    return true;
  }

  async search(input: SearchInput): Promise<SearchResult[]> {
    const url = new URL("https://api.duckduckgo.com/");
    url.searchParams.set("q", input.query);
    url.searchParams.set("format", "json");
    url.searchParams.set("no_redirect", "1");
    url.searchParams.set("no_html", "1");
    const res = await withTimeout(fetch(url), 8000, "duckduckgo");
    if (!res.ok) throw new Error(`DuckDuckGo HTTP ${res.status}`);
    const data = (await res.json()) as {
      AbstractText?: string;
      AbstractURL?: string;
      Heading?: string;
      RelatedTopics?: { Text?: string; FirstURL?: string; Name?: string }[];
    };
    const results: SearchResult[] = [];
    if (data.AbstractText) {
      results.push({
        title: data.Heading || "DuckDuckGo Abstract",
        url: data.AbstractURL || "https://duckduckgo.com",
        snippet: sanitizeSnippet(data.AbstractText),
        source: "web",
      });
    }
    for (const topic of data.RelatedTopics ?? []) {
      if (topic.Text && topic.FirstURL) {
        results.push({
          title: topic.Text.slice(0, 80),
          url: topic.FirstURL,
          snippet: sanitizeSnippet(topic.Text),
          source: "web",
        });
      }
      if (results.length >= input.limit) break;
    }
    return results.slice(0, input.limit);
  }
}

export class SearXNGProvider implements SearchProvider {
  readonly name = "searxng";

  isAvailable(): boolean {
    return Boolean(env.SEARXNG_URL);
  }

  async search(input: SearchInput): Promise<SearchResult[]> {
    const base = env.SEARXNG_URL!.replace(/\/$/, "");
    const url = new URL(`${base}/search`);
    url.searchParams.set("q", input.query);
    url.searchParams.set("format", "json");
    const res = await withTimeout(fetch(url), 8000, "searxng");
    if (!res.ok) throw new Error(`SearXNG HTTP ${res.status}`);
    const data = (await res.json()) as {
      results?: { title?: string; url?: string; content?: string }[];
    };
    return (data.results ?? []).slice(0, input.limit).map((r) => ({
      title: r.title ?? "Untitled",
      url: r.url ?? "",
      snippet: sanitizeSnippet(r.content ?? ""),
      source: "web",
    }));
  }
}

export class WikipediaProvider implements SearchProvider {
  readonly name = "wikipedia";

  isAvailable(): boolean {
    return true;
  }

  async search(input: SearchInput): Promise<SearchResult[]> {
    const url = new URL("https://en.wikipedia.org/w/api.php");
    url.searchParams.set("action", "query");
    url.searchParams.set("list", "search");
    url.searchParams.set("srsearch", input.query);
    url.searchParams.set("srlimit", String(input.limit));
    url.searchParams.set("format", "json");
    url.searchParams.set("origin", "*");
    const res = await withTimeout(fetch(url), 8000, "wikipedia");
    if (!res.ok) throw new Error(`Wikipedia HTTP ${res.status}`);
    const data = (await res.json()) as {
      query?: { search?: { title?: string; snippet?: string; pageid?: number }[] };
    };
    return (data.query?.search ?? []).slice(0, input.limit).map((r) => ({
      title: r.title ?? "Wikipedia",
      url: `https://en.wikipedia.org/?curid=${r.pageid}`,
      snippet: sanitizeSnippet(r.snippet ?? ""),
      source: "web",
    }));
  }
}
