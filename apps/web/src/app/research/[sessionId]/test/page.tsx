"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatPct } from "@/lib/format";
import { Field, FieldGrid } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Metrics = {
  signal_count: number;
  completed_trades: number;
  win_rate: number | null;
  average_net_return: number | null;
  max_drawdown: number | null;
};

function TestPageInner() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const [experimentId, setExperimentId] = useState(search.get("experimentId"));
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">(
    "idle"
  );
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [dataset, setDataset] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (experimentId) return;
    api<{ data: { experiments: { id: string }[] } }>(
      `/api/research/sessions/${sessionId}`
    ).then((res) => {
      const id = res.data.experiments[0]?.id;
      if (id) setExperimentId(id);
    });
  }, [sessionId, experimentId]);

  async function run() {
    if (!experimentId) {
      setError("Missing experiment id");
      return;
    }
    setStatus("running");
    setError(null);
    try {
      const validation = await api<{
        data: { valid: boolean; errors: string[] };
      }>(`/api/experiments/${experimentId}/validate`, {
        method: "POST",
        body: "{}",
      });
      if (!validation.data.valid) {
        setStatus("error");
        setError(validation.data.errors.join("; "));
        return;
      }

      const res = await api<{
        data: Metrics;
        warnings: string[];
        run: { id: string };
        dataset: Record<string, unknown>;
      }>(`/api/experiments/${experimentId}/run`, {
        method: "POST",
        body: "{}",
      });
      setMetrics(res.data);
      setWarnings((res.warnings as string[]) ?? []);
      setRunId(res.run.id);
      setDataset(res.dataset);
      setStatus("done");
    } catch (e) {
      setStatus("error");
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Badge variant="system">Test</Badge>
        <h1 className="text-3xl font-semibold tracking-tight">
          Run deterministic backtest
        </h1>
        <p className="text-sm text-muted-foreground">
          Metrics are computed by the backend engine — not by the LLM.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Engine run</CardTitle>
          <CardDescription>
            Status updates as the deterministic simulator finishes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FieldGrid>
            <Field
              label="Status"
              value={
                <Badge
                  variant={
                    status === "done"
                      ? "success"
                      : status === "error"
                        ? "danger"
                        : status === "running"
                          ? "assume"
                          : "secondary"
                  }
                >
                  {status === "idle" && "Ready"}
                  {status === "running" && "Running…"}
                  {status === "done" && "Completed"}
                  {status === "error" && "Failed"}
                </Badge>
              }
            />
            {dataset && (
              <>
                <Field label="Dataset" value={String(dataset.name)} />
                <Field label="Version" value={`v${String(dataset.version)}`} />
              </>
            )}
          </FieldGrid>
          <Button
            type="button"
            onClick={run}
            disabled={status === "running" || !experimentId}
          >
            {status === "running" ? "Running…" : "Run experiment"}
          </Button>
        </CardContent>
      </Card>

      {metrics && (
        <Card>
          <CardHeader>
            <CardTitle>Headline metrics</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGrid>
              <Field label="Signals" value={metrics.signal_count} />
              <Field
                label="Completed trades"
                value={metrics.completed_trades}
              />
              <Field label="Win rate" value={formatPct(metrics.win_rate)} />
              <Field
                label="Avg net return"
                value={formatPct(metrics.average_net_return)}
              />
              <Field
                label="Max drawdown"
                value={formatPct(metrics.max_drawdown)}
              />
            </FieldGrid>
          </CardContent>
        </Card>
      )}

      {warnings.length > 0 && (
        <div className="space-y-2">
          {warnings.map((w) => (
            <div
              key={w}
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm"
            >
              {w}
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-3">
        <Button asChild variant="outline">
          <Link
            href={`/research/${sessionId}/define?experimentId=${experimentId ?? ""}`}
          >
            Back
          </Link>
        </Button>
        <Button
          type="button"
          disabled={!runId}
          onClick={() =>
            router.push(`/research/${sessionId}/learn?backtestId=${runId}`)
          }
        >
          Continue to learn
        </Button>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}

export default function TestPage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading test…</p>}>
      <TestPageInner />
    </Suspense>
  );
}
