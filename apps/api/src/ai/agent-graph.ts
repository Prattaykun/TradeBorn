import { Annotation, StateGraph, END, START } from "@langchain/langgraph";
import type { Clarification, ExperimentDefinition } from "@TradeBorn/shared";
import {
  interpretQuestion,
  buildExperimentFromParams,
  explainResults,
  buildClarifyOpenUi,
  agentTools,
} from "./graph.js";
import { retrieveKnowledge } from "../rag/ingest.js";

/**
 * Session-scoped research agent graph.
 * HITL interrupts happen via REST (UI), which invokes specific nodes.
 */
const ResearchState = Annotation.Root({
  question: Annotation<string>,
  clarification: Annotation<Clarification | null>,
  experiment: Annotation<ExperimentDefinition | null>,
  metrics: Annotation<unknown>,
  warnings: Annotation<string[]>,
  citations: Annotation<unknown[]>,
  openui: Annotation<string | null>,
  interpretation: Annotation<string | null>,
  followUps: Annotation<string[]>,
});

async function interpretNode(state: typeof ResearchState.State) {
  const clarification = await interpretQuestion(state.question);
  return {
    clarification,
    openui: buildClarifyOpenUi(clarification),
  };
}

async function proposeExperimentNode(state: typeof ResearchState.State) {
  const experiment = buildExperimentFromParams(
    (state.clarification?.proposedDefaults as Record<string, unknown>) ?? {},
    state.clarification ?? undefined
  );
  return { experiment };
}

async function retrieveNode(state: typeof ResearchState.State) {
  const hits = await retrieveKnowledge(
    state.question || state.experiment?.hypothesis || "backtesting methodology",
    4
  );
  return { citations: hits };
}

async function explainNode(state: typeof ResearchState.State) {
  if (!state.experiment) {
    return {
      interpretation: "No experiment defined",
      followUps: [],
      openui: null,
    };
  }
  const result = await explainResults({
    metrics: state.metrics,
    warnings: state.warnings ?? [],
    definition: state.experiment,
    citations: (state.citations as { title: string; content?: string; snippet?: string; metadata?: { source_url?: string } }[]).map(
      (c) => ({
        title: c.title,
        snippet: c.snippet ?? c.content?.slice(0, 280) ?? "",
        url: c.metadata?.source_url,
      })
    ),
  });
  return {
    interpretation: result.text,
    followUps: result.followUps,
    openui: result.openui,
  };
}

export const researchAgentGraph = new StateGraph(ResearchState)
  .addNode("interpret", interpretNode)
  .addNode("propose_experiment", proposeExperimentNode)
  .addNode("retrieve", retrieveNode)
  .addNode("explain", explainNode)
  .addEdge(START, "interpret")
  .addEdge("interpret", "propose_experiment")
  .addEdge("propose_experiment", "retrieve")
  .addEdge("retrieve", "explain")
  .addEdge("explain", END)
  .compile();

export { agentTools, ResearchState };
