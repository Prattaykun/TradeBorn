"use client";

import React, { useMemo } from "react";
import {
  defineComponent,
  createLibrary,
  Renderer,
} from "@openuidev/react-lang";
import { z } from "zod/v4";

const ResearchSummary = defineComponent({
  name: "ResearchSummary",
  description: "Root summary panel for research AI output",
  props: z.object({
    title: z.string(),
    body: z.string().optional(),
  }),
  component: ({ props }) => (
    <section className="notebook-card border-l-4 border-indigo-400">
      <div className="mb-2 flex items-center gap-2">
        <span className="badge-ai">AI / OpenUI</span>
        <h3 className="font-serif text-lg">{props.title}</h3>
      </div>
      {props.body ? (
        <p className="text-sm text-stone-700">{props.body}</p>
      ) : null}
    </section>
  ),
});

const ClarificationCard = defineComponent({
  name: "ClarificationCard",
  description: "Card describing a missing or ambiguous parameter",
  props: z.object({
    title: z.string(),
    body: z.string(),
    importance: z.enum(["required", "recommended", "optional"]).optional(),
  }),
  component: ({ props }) => (
    <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-medium text-system">{props.title}</span>
        {props.importance ? (
          <span className="badge-system">{props.importance}</span>
        ) : null}
      </div>
      <p className="text-sm text-stone-600">{props.body}</p>
    </div>
  ),
});

const AssumptionBadge = defineComponent({
  name: "AssumptionBadge",
  description: "Amber badge for a system assumption",
  props: z.object({ label: z.string() }),
  component: ({ props }) => (
    <span className="badge-assume mr-2 mb-2">{props.label}</span>
  ),
});

const ExperimentField = defineComponent({
  name: "ExperimentField",
  description: "Labelled experiment field",
  props: z.object({ label: z.string(), value: z.string() }),
  component: ({ props }) => (
    <div className="text-sm">
      <span className="font-medium">{props.label}: </span>
      <span>{props.value}</span>
    </div>
  ),
});

const MetricCard = defineComponent({
  name: "MetricCard",
  description: "Metric display — values must match engine JSON exactly",
  props: z.object({ label: z.string(), value: z.string() }),
  component: ({ props }) => (
    <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
      <div className="text-xs uppercase tracking-wide text-stone-500">
        {props.label}
      </div>
      <div className="font-serif text-xl">{props.value}</div>
    </div>
  ),
});

const WarningPanel = defineComponent({
  name: "WarningPanel",
  description: "Research warning or limitation",
  props: z.object({ message: z.string() }),
  component: ({ props }) => (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      {props.message}
    </div>
  ),
});

const TradeTable = defineComponent({
  name: "TradeTable",
  description: "Placeholder note that trades come from the engine",
  props: z.object({ note: z.string().optional() }),
  component: ({ props }) => (
    <div className="text-sm text-stone-500">
      {props.note ??
        "Trade table rendered from engine data (not model-invented)."}
    </div>
  ),
});

const ResultInterpretation = defineComponent({
  name: "ResultInterpretation",
  description: "AI interpretation clearly labelled",
  props: z.object({ text: z.string() }),
  component: ({ props }) => (
    <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-3 text-sm">
      <span className="badge-ai mb-2">Interpretation</span>
      <p className="mt-2 text-stone-800">{props.text}</p>
    </div>
  ),
});

const FollowUpQuestion = defineComponent({
  name: "FollowUpQuestion",
  description: "Suggested follow-up experiment",
  props: z.object({ text: z.string() }),
  component: ({ props }) => (
    <li className="text-sm text-stone-700">{props.text}</li>
  ),
});

const SourceCitation = defineComponent({
  name: "SourceCitation",
  description: "Citation from RAG or web search — not market data",
  props: z.object({
    title: z.string(),
    snippet: z.string(),
    url: z.string().optional(),
  }),
  component: ({ props }) => (
    <blockquote className="border-l-2 border-stone-300 pl-3 text-sm text-stone-600">
      <div className="font-medium text-stone-800">{props.title}</div>
      <p>{props.snippet}</p>
      {props.url ? (
        <a className="text-system underline" href={props.url}>
          {props.url}
        </a>
      ) : null}
    </blockquote>
  ),
});

export const researchLibrary = createLibrary({
  root: "ResearchSummary",
  components: [
    ResearchSummary,
    ClarificationCard,
    AssumptionBadge,
    ExperimentField,
    MetricCard,
    WarningPanel,
    TradeTable,
    ResultInterpretation,
    FollowUpQuestion,
    SourceCitation,
  ],
  componentGroups: [
    {
      name: "Research",
      components: [
        "ResearchSummary",
        "ClarificationCard",
        "AssumptionBadge",
        "ExperimentField",
        "MetricCard",
        "WarningPanel",
        "TradeTable",
        "ResultInterpretation",
        "FollowUpQuestion",
        "SourceCitation",
      ],
      notes: [
        "Never invent HTML or JavaScript.",
        "MetricCard values must be copied exactly from provided metrics JSON.",
        "Unknown component names are invalid.",
      ],
    },
  ],
});

export const OPENUI_COMPONENT_ALLOWLIST = [
  "ResearchSummary",
  "ClarificationCard",
  "AssumptionBadge",
  "ExperimentField",
  "MetricCard",
  "WarningPanel",
  "TradeTable",
  "ResultInterpretation",
  "FollowUpQuestion",
  "SourceCitation",
] as const;

function FallbackOpenUI({
  response,
  fallback,
}: {
  response: string;
  fallback?: React.ReactNode;
}) {
  const hasKnown = OPENUI_COMPONENT_ALLOWLIST.some((n) => response.includes(n));
  if (!hasKnown) return <>{fallback ?? null}</>;

  const blocks: React.ReactNode[] = [];
  const metricRe =
    /MetricCard\(\s*label\("([^"]*)"\)\s*,\s*value\("([^"]*)"\)\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = metricRe.exec(response))) {
    blocks.push(
      <div
        key={`m-${blocks.length}`}
        className="rounded-lg border border-stone-200 bg-stone-50 p-3"
      >
        <div className="text-xs uppercase text-stone-500">{m[1]}</div>
        <div className="font-serif text-xl">{m[2]}</div>
      </div>
    );
  }
  const warnRe = /WarningPanel\(\s*message\("([^"]*)"\)\s*\)/g;
  while ((m = warnRe.exec(response))) {
    blocks.push(
      <div
        key={`w-${blocks.length}`}
        className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm"
      >
        {m[1]}
      </div>
    );
  }
  const interp = response.match(
    /ResultInterpretation\(\s*text\("([^"]*)"\)\s*\)/
  );
  if (interp) {
    blocks.unshift(
      <div
        key="interp"
        className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-3 text-sm"
      >
        <span className="badge-ai mb-2">Interpretation</span>
        <p className="mt-2">{interp[1]}</p>
      </div>
    );
  }

  if (!blocks.length) return <>{fallback ?? null}</>;
  return (
    <section className="notebook-card space-y-3 border-l-4 border-indigo-400">
      <span className="badge-ai">AI / OpenUI (fallback parse)</span>
      {blocks}
    </section>
  );
}

export function OpenUIRenderer({
  response,
  isStreaming,
  fallback,
}: {
  response?: string | null;
  isStreaming?: boolean;
  fallback?: React.ReactNode;
}) {
  const [useFallback, setUseFallback] = React.useState(false);
  const content = useMemo(() => response ?? null, [response]);

  if (!content) return <>{fallback ?? null}</>;
  if (useFallback) {
    return <FallbackOpenUI response={content} fallback={fallback} />;
  }

  return (
    <div onErrorCapture={() => setUseFallback(true)} className="space-y-3">
      <Renderer
        response={content}
        library={researchLibrary}
        isStreaming={Boolean(isStreaming)}
        onParseResult={(result) => {
          const unknown = result?.meta?.errors?.some(
            (e) => e.code === "unknown-component"
          );
          if (unknown) setUseFallback(true);
        }}
      />
    </div>
  );
}

export function getResearchOpenUiPrompt(): string {
  try {
    return researchLibrary.prompt({
      preamble:
        "You are a research assistant emitting OpenUI Lang only with allowlisted components.",
      additionalRules: [
        "Never invent market data or metric numbers.",
        "Copy MetricCard values exactly from provided JSON.",
        "Do not emit HTML or JavaScript.",
      ],
    });
  } catch {
    return `Use only: ${OPENUI_COMPONENT_ALLOWLIST.join(", ")}`;
  }
}
