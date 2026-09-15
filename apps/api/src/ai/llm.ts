import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { env } from "../infrastructure/config.js";

export function createChatModel(temperature = 0) {
  const provider = env.LLM_PROVIDER;
  const model = env.LLM_MODEL;

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
