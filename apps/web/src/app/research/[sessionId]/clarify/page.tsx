"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DEFAULT_EXPERIMENT, type Clarification } from "@TradeBorn/shared";
import { api } from "@/lib/api";
import { formatPct, formatSessions } from "@/lib/format";
import { OpenUIRenderer } from "@/openui/researchLibrary";
import { Field, FieldGrid } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

type Session = {
  id: string;
  question: string;
  clarification: Clarification;
  openuiClarify?: string | null;
};

export default function ClarifyPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [thresholdPct, setThresholdPct] = useState(5);
  const [windowSessions, setWindowSessions] = useState(5);
  const [holding, setHolding] = useState(10);
  const [overlapping, setOverlapping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ data: Session }>(`/api/research/sessions/${sessionId}`)
      .then((res) => {
        setSession(res.data);
        const defaults =
          (res.data.clarification?.proposedDefaults as typeof DEFAULT_EXPERIMENT) ??
          DEFAULT_EXPERIMENT;
        setThresholdPct(
          Math.abs(Number(defaults.condition?.threshold ?? -0.05)) * 100
        );
        setWindowSessions(Number(defaults.condition?.window_sessions ?? 5));
        setHolding(Number(defaults.exit?.holding_sessions ?? 10));
        setOverlapping(Boolean(defaults.allow_overlapping));
      })
      .catch((e) => setError(e.message));
  }, [sessionId]);

  async function continueWith(acceptedDefaults: boolean) {
    setBusy(true);
    setError(null);
    try {
      const threshold = -Math.abs(thresholdPct) / 100;
      const parameters = {
        ...DEFAULT_EXPERIMENT,
        condition: {
          ...DEFAULT_EXPERIMENT.condition,
          threshold,
          window_sessions: windowSessions,
        },
        exit: {
          ...DEFAULT_EXPERIMENT.exit,
          holding_sessions: holding,
        },
        allow_overlapping: overlapping,
        hypothesis: `After a ${windowSessions}-session fall of at least ${thresholdPct.toFixed(1)}%, NIFTY has a positive average return over the next ${holding} sessions.`,
      };

      await api(`/api/research/sessions/${sessionId}/clarify`, {
        method: "POST",
        body: JSON.stringify({
          acceptedDefaults,
          parameters: acceptedDefaults ? undefined : parameters,
        }),
      });

      const experimentRes = await api<{ data: { id: string } }>(
        `/api/research/sessions/${sessionId}/experiment`,
        {
          method: "POST",
          body: JSON.stringify(parameters),
        }
      );

      router.push(
        `/research/${sessionId}/define?experimentId=${experimentRes.data.id}`
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!session && !error) {
    return <p className="text-muted-foreground">Loading clarification…</p>;
  }

  const c = session?.clarification;
  const interp = c?.interpretation;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2">
          <Badge variant="system">Clarify</Badge>
          <h1 className="text-3xl font-semibold tracking-tight">
            Make the ambiguity visible
          </h1>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/">New question</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your question</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-lg">{session?.question}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Interpreted fields</CardTitle>
          <CardDescription>
            Structured reading of the question — not free-form JSON.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGrid>
            <Field label="Market" value={interp?.market ?? "Not stated"} />
            <Field
              label="Action"
              value={
                <Badge
                  variant={
                    interp?.action === "buy"
                      ? "success"
                      : interp?.action === "sell"
                        ? "danger"
                        : "secondary"
                  }
                >
                  {interp?.action ?? "unknown"}
                </Badge>
              }
            />
            <Field label="Trigger" value={interp?.trigger ?? "Unclear"} />
          </FieldGrid>
        </CardContent>
      </Card>

      <OpenUIRenderer
        response={session?.openuiClarify}
        fallback={
          <Card>
            <CardContent className="pt-5 text-sm text-muted-foreground">
              OpenUI clarification unavailable — using structured panels below.
            </CardContent>
          </Card>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-system">User-stated</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {(c?.userStated ?? []).map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-assume">
              System assumptions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {(c?.systemAssumptions ?? []).map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {(c?.missingParameters?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Missing / confirmable parameters</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGrid className="lg:grid-cols-2">
              {c!.missingParameters.map((p) => (
                <Field
                  key={p.key}
                  label={`${p.label} · ${p.importance}`}
                  value={p.reason}
                />
              ))}
            </FieldGrid>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Customize required parameters</CardTitle>
          <CardDescription>
            Threshold is edited as a percent fall (e.g. 5 = −5%).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="threshold">Fall threshold (%)</Label>
              <Input
                id="threshold"
                type="number"
                step="0.5"
                min={0.5}
                value={thresholdPct}
                onChange={(e) => setThresholdPct(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                Engine value: {formatPct(-Math.abs(thresholdPct) / 100, 1)} over{" "}
                {formatSessions(windowSessions)}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="window">Lookback sessions</Label>
              <Input
                id="window"
                type="number"
                min={1}
                value={windowSessions}
                onChange={(e) => setWindowSessions(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="holding">Holding sessions</Label>
              <Input
                id="holding"
                type="number"
                min={1}
                value={holding}
                onChange={(e) => setHolding(Number(e.target.value))}
              />
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border"
                checked={overlapping}
                onChange={(e) => setOverlapping(e.target.checked)}
              />
              Allow overlapping trades
            </label>
          </div>
          <Separator />
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => continueWith(true)}
            >
              Accept defaults
            </Button>
            <Button
              type="button"
              disabled={busy}
              onClick={() => continueWith(false)}
            >
              {busy ? "Saving…" : "Customize & continue"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}
