import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { env } from "../infrastructure/config.js";

/**
 * Free-tier Gemini text models (no image / audio / live / TTS / embedding).
 * Tried in order after the configured LLM_MODEL when a call fails.
 * @see https://ai.google.dev/gemini-api/docs/models
 */
export const GEMINI_FREE_TIER_TEXT_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
] as const;

export type ChatModel = ChatOpenAI | ChatGoogleGenerativeAI;

function parseFallbackList(raw?: string): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Preferred model first, then free-tier text models, then any LLM_FALLBACK_MODELS. */
export function geminiModelFallbackChain(primary = env.LLM_MODEL): string[] {
  const extra = parseFallbackList(process.env.LLM_FALLBACK_MODELS);
  const chain = [primary, ...extra, ...GEMINI_FREE_TIER_TEXT_MODELS];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of chain) {
    if (seen.has(m)) continue;
    seen.add(m);
    out.push(m);
  }
  return out;
}

export function createChatModel(temperature = 0, modelOverride?: string): ChatModel {
  const provider = env.LLM_PROVIDER;
  const model = modelOverride ?? env.LLM_MODEL;

  if (provider === "google" || provider === "gemini") {
    return new ChatGoogleGenerativeAI({
      model,
      temperature,
      apiKey: env.LLM_API_KEY,
    });
  }

  if (provider === "ollama") {
    return new ChatOpenAI({
      model,
      temperature,
      apiKey: "ollama",
      configuration: {
        baseURL: `${env.OLLAMA_BASE_URL.replace(/\/$/, "")}/v1`,
      },
    });
  }

  if (provider === "groq") {
    return new ChatOpenAI({
      model,
      temperature,
      apiKey: env.LLM_API_KEY,
      configuration: {
        baseURL: "https://api.groq.com/openai/v1",
      },
    });
  }

  return new ChatOpenAI({
    model,
    temperature,
    apiKey: env.LLM_API_KEY,
  });
}

export function hasLlmKey(): boolean {
  if (env.LLM_PROVIDER === "ollama") return true;
  return Boolean(env.LLM_API_KEY);
}

type ChatMessage = { role: string; content: string };

/**
 * Invoke the chat model. For Google/Gemini, walk the free-tier text fallback
 * list when the preferred model errors (404, quota, overloaded, etc.).
 */
export async function invokeChat(
  messages: ChatMessage[],
  temperature = 0
): Promise<{ content: string; model: string }> {
  const provider = env.LLM_PROVIDER;
  const useGeminiFallback = provider === "google" || provider === "gemini";
  const models = useGeminiFallback
    ? geminiModelFallbackChain()
    : [env.LLM_MODEL];

  let lastError: unknown;
  for (const model of models) {
    try {
      const llm = createChatModel(temperature, model);
      const response = await llm.invoke(messages);
      const content =
        typeof response.content === "string"
          ? response.content
          : JSON.stringify(response.content);
      if (model !== env.LLM_MODEL) {
        console.warn(`[llm] fell back to ${model} (preferred was ${env.LLM_MODEL})`);
      }
      return { content, model };
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[llm] ${model} failed: ${msg}`);
      if (!useGeminiFallback) break;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("All LLM models failed");
}
