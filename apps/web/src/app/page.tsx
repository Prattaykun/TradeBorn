"use client";

import { Suspense, useState } from "react";
import { useRouter } from "next/navigation";
import { EXAMPLE_QUESTION } from "@TradeBorn/shared";
import { api } from "@/lib/api";
import { ResearchStageFlow } from "@/components/stage-flow";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";

export default function HomePage() {
  const router = useRouter();
  const [question, setQuestion] = useState(EXAMPLE_QUESTION);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ data: { id: string } }>("/api/research/sessions", {
        method: "POST",
        body: JSON.stringify({ question }),
      });
      router.push(`/research/${res.data.id}/clarify`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <Suspense
        fallback={
          <div className="h-[120px] animate-pulse rounded-xl border bg-muted/40" />
        }
      >
        <ResearchStageFlow current="ask" />
      </Suspense>

      <section className="space-y-3">
        <Badge variant="system">Ask</Badge>
        <h1 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
          Turn a vague trading question into a transparent experiment
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          Clarify assumptions, lock a versioned experiment, run a deterministic
          backtest, then review evidence — including an animated buy/hold/sell
          simulation of each historical trade.
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Research question</CardTitle>
          <CardDescription>
            Natural language is fine. The next step turns ambiguity into fields.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="question">Question</Label>
            <textarea
              id="question"
              className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setQuestion(EXAMPLE_QUESTION)}
            >
              Use example question
            </Button>
            <Button
              type="button"
              disabled={loading || question.trim().length < 3}
              onClick={start}
            >
              {loading ? "Starting…" : "Start research"}
            </Button>
          </div>
          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      <aside className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        Results are historical research on a sample dataset. This product does
        not provide investment advice, execute trades, or predict future prices.
      </aside>
    </div>
  );
}
