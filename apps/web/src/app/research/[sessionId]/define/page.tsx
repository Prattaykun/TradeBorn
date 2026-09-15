"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import type { ExperimentDefinition } from "@TradeBorn/shared";
import { api } from "@/lib/api";
import {
  formatBps,
  formatDate,
  formatSessions,
  thresholdLabel,
} from "@/lib/format";
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

function DefinePageInner() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const search = useSearchParams();
  const experimentId = search.get("experimentId");
  const router = useRouter();
  const [definition, setDefinition] = useState<ExperimentDefinition | null>(
    null
  );
  const [dataset, setDataset] = useState<Record<string, unknown> | null>(null);
  const [resolvedExperimentId, setResolvedExperimentId] =
    useState(experimentId);
  const [showJson, setShowJson] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const session = await api<{
          data: {
            experiments: {
              id: string;
              definition: ExperimentDefinition;
            }[];
          };
        }>(`/api/research/sessions/${sessionId}`);
        const exp =
          session.data.experiments.find((e) => e.id === experimentId) ??
          session.data.experiments[0];
        if (!exp) throw new Error("No experiment found — go back to clarify");
        setDefinition(exp.definition as ExperimentDefinition);
        setResolvedExperimentId(exp.id);

        const v = await api<{
          data: {
            valid: boolean;
            errors: string[];
            dataset: Record<string, unknown> | null;
          };
        }>(`/api/experiments/${exp.id}/validate`, {
          method: "POST",
          body: "{}",
        });
        setDataset(v.data.dataset);
        if (!v.data.valid) setError(v.data.errors.join("; "));
      } catch (e) {
        setError((e as Error).message);
      }
    }
    load();
  }, [sessionId, experimentId]);

  if (!definition && !error) {
    return <p className="text-muted-foreground">Loading experiment…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Badge variant="system">Define</Badge>
        <h1 className="text-3xl font-semibold tracking-tight">
          Experiment specification
        </h1>
        <p className="text-sm text-muted-foreground">
          Same contract the engine will execute — shown as fields, not a wall of
          JSON.
        </p>
      </div>

      {definition && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Hypothesis</CardTitle>
              <CardDescription>{definition.hypothesis}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FieldGrid>
                <Field
                  label="Market"
                  value={definition.market.symbol}
                  hint={definition.market.asset_type}
                />
                <Field
                  label="Fall condition"
                  value={thresholdLabel(
                    definition.condition.threshold,
                    definition.condition.window_sessions
                  )}
                  hint={definition.condition.type}
                />
                <Field
                  label="Entry"
                  value={definition.entry.timing.replaceAll("_", " ")}
                  hint={`Price field: ${definition.entry.price_field}`}
                />
                <Field
                  label="Exit"
                  value={`Close after ${formatSessions(definition.exit.holding_sessions)}`}
                  hint={`Price field: ${definition.exit.price_field}`}
                />
                <Field
                  label="Test period"
                  value={`${formatDate(definition.test_period.start)} → ${formatDate(definition.test_period.end)}`}
                />
                <Field
                  label="Overlapping trades"
                  value={
                    definition.allow_overlapping ? (
                      <Badge variant="assume">Allowed</Badge>
                    ) : (
                      <Badge variant="success">Disabled</Badge>
                    )
                  }
                />
              </FieldGrid>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Cost model</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldGrid>
                <Field
                  label="Round-trip"
                  value={formatBps(definition.costs.round_trip_bps)}
                />
                <Field
                  label="Entry slippage"
                  value={formatBps(
                    definition.costs.entry_slippage_bps ??
                      definition.costs.slippage_bps
                  )}
                />
                <Field
                  label="Exit slippage"
                  value={formatBps(
                    definition.costs.exit_slippage_bps ??
                      definition.costs.slippage_bps
                  )}
                />
              </FieldGrid>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge variant="assume">Assumption: next-open entry</Badge>
                <Badge variant="assume">Assumption: simplified costs</Badge>
                <Badge variant="system">Deterministic engine only</Badge>
              </div>
            </CardContent>
          </Card>

          {dataset && (
            <Card>
              <CardHeader>
                <CardTitle>Dataset</CardTitle>
              </CardHeader>
              <CardContent>
                <FieldGrid>
                  <Field label="Name" value={String(dataset.name)} />
                  <Field label="Version" value={`v${String(dataset.version)}`} />
                  <Field
                    label="Checksum"
                    value={
                      <code className="text-xs">
                        {String(dataset.checksum).slice(0, 16)}…
                      </code>
                    }
                  />
                </FieldGrid>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Machine-readable JSON</CardTitle>
                <CardDescription>Optional — for debugging only</CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowJson((v) => !v)}
              >
                {showJson ? "Hide" : "Show"} JSON
              </Button>
            </CardHeader>
            {showJson && (
              <CardContent>
                <pre className="overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">
                  {JSON.stringify(definition, null, 2)}
                </pre>
              </CardContent>
            )}
          </Card>
        </>
      )}

      <div className="flex gap-3">
        <Button asChild variant="outline">
          <Link href={`/research/${sessionId}/clarify`}>Back</Link>
        </Button>
        <Button
          type="button"
          onClick={() =>
            router.push(
              `/research/${sessionId}/test?experimentId=${resolvedExperimentId ?? ""}`
            )
          }
          disabled={!resolvedExperimentId}
        >
          Continue to test
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

export default function DefinePage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading experiment…</p>}>
      <DefinePageInner />
    </Suspense>
  );
}
