"use client";

import { Suspense } from "react";
import { ResearchStageFlow } from "@/components/stage-flow";

export default function ResearchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <Suspense
        fallback={
          <div className="h-[120px] animate-pulse rounded-xl border bg-muted/40" />
        }
      >
        <ResearchStageFlow />
      </Suspense>
      {children}
    </div>
  );
}
