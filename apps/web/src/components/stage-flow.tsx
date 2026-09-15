"use client";

import { useCallback, useMemo } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  MarkerType,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  HelpCircle,
  MessageSquareQuote,
  FileJson,
  FlaskConical,
  LineChart,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type ResearchStage = "ask" | "clarify" | "define" | "test" | "learn";

const STAGE_ORDER: ResearchStage[] = [
  "ask",
  "clarify",
  "define",
  "test",
  "learn",
];

const STAGE_META: Record<
  ResearchStage,
  { label: string; blurb: string; icon: typeof HelpCircle }
> = {
  ask: { label: "Ask", blurb: "Pose the question", icon: HelpCircle },
  clarify: {
    label: "Clarify",
    blurb: "Expose assumptions",
    icon: MessageSquareQuote,
  },
  define: { label: "Define", blurb: "Lock experiment", icon: FileJson },
  test: { label: "Test", blurb: "Run backtest", icon: FlaskConical },
  learn: { label: "Learn", blurb: "Evidence + sim", icon: LineChart },
};

function stageFromPath(pathname: string): ResearchStage {
  if (pathname.includes("/clarify")) return "clarify";
  if (pathname.includes("/define")) return "define";
  if (pathname.includes("/test")) return "test";
  if (pathname.includes("/learn")) return "learn";
  return "ask";
}

type StageNodeData = {
  stage: ResearchStage;
  label: string;
  blurb: string;
  status: "done" | "active" | "upcoming";
  href?: string;
};

function StageNode({ data }: NodeProps<Node<StageNodeData, "stage">>) {
  const d = data;
  const Icon = STAGE_META[d.stage].icon;
  return (
    <div
      className={cn(
        "min-w-[132px] rounded-xl border bg-card px-3 py-2.5 shadow-sm transition-all",
        d.status === "active" &&
          "border-primary ring-2 ring-primary/30 shadow-md",
        d.status === "done" && "border-emerald-300 bg-emerald-50/80",
        d.status === "upcoming" && "opacity-70"
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !bg-muted-foreground"
      />
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-lg",
            d.status === "active" && "bg-primary text-primary-foreground",
            d.status === "done" && "bg-emerald-600 text-white",
            d.status === "upcoming" && "bg-muted text-muted-foreground"
          )}
        >
          {d.status === "done" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <Icon className="h-4 w-4" />
          )}
        </div>
        <div>
          <div className="text-sm font-semibold leading-none">{d.label}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">{d.blurb}</div>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !bg-muted-foreground"
      />
    </div>
  );
}

const nodeTypes = { stage: StageNode };

export function ResearchStageFlow({
  current,
  className,
}: {
  current?: ResearchStage;
  className?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useParams<{ sessionId?: string }>();
  const search = useSearchParams();
  const active = current ?? stageFromPath(pathname);
  const sessionId = params.sessionId;
  const experimentId = search.get("experimentId");
  const backtestId = search.get("backtestId");

  const hrefFor = useCallback(
    (stage: ResearchStage): string | undefined => {
      if (stage === "ask") return "/";
      if (!sessionId) return undefined;
      if (stage === "clarify") return `/research/${sessionId}/clarify`;
      if (stage === "define") {
        const q = experimentId ? `?experimentId=${experimentId}` : "";
        return `/research/${sessionId}/define${q}`;
      }
      if (stage === "test") {
        const q = experimentId ? `?experimentId=${experimentId}` : "";
        return `/research/${sessionId}/test${q}`;
      }
      if (stage === "learn") {
        if (!backtestId) return undefined;
        return `/research/${sessionId}/learn?backtestId=${backtestId}`;
      }
      return undefined;
    },
    [sessionId, experimentId, backtestId]
  );

  const activeIndex = STAGE_ORDER.indexOf(active);

  const nodes: Node[] = useMemo(
    () =>
      STAGE_ORDER.map((stage, i) => {
        const meta = STAGE_META[stage];
        const status: StageNodeData["status"] =
          i < activeIndex ? "done" : i === activeIndex ? "active" : "upcoming";
        return {
          id: stage,
          type: "stage",
          position: { x: i * 170, y: 16 },
          data: {
            stage,
            label: meta.label,
            blurb: meta.blurb,
            status,
            href: hrefFor(stage),
          } satisfies StageNodeData,
          draggable: false,
          selectable: true,
        };
      }),
    [activeIndex, hrefFor]
  );

  const edges: Edge[] = useMemo(
    () =>
      STAGE_ORDER.slice(0, -1).map((stage, i) => {
        const next = STAGE_ORDER[i + 1]!;
        const done = i < activeIndex;
        return {
          id: `${stage}-${next}`,
          source: stage,
          target: next,
          animated: i === activeIndex - 1 || i === activeIndex,
          style: {
            stroke: done || i === activeIndex ? "hsl(222 47% 31%)" : "#cbd5e1",
            strokeWidth: 2,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: done || i === activeIndex ? "hsl(222 47% 31%)" : "#cbd5e1",
          },
        };
      }),
    [activeIndex]
  );

  const onNodeClick = useCallback(
    (_: unknown, node: Node) => {
      const href = (node.data as StageNodeData).href;
      if (href) router.push(href);
    },
    [router]
  );

  return (
    <div
      className={cn(
        "h-[120px] w-full overflow-hidden rounded-xl border bg-card",
        className
      )}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        panOnDrag={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        proOptions={{ hideAttribution: true }}
        minZoom={0.8}
        maxZoom={1.2}
      >
        <Background gap={18} size={1} color="#e2e8f0" />
        <Controls showInteractive={false} className="!scale-75" />
      </ReactFlow>
    </div>
  );
}
