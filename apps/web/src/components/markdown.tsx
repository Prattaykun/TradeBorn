"use client";

import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

/** Renders model markdown (headings, lists, bold) without raw HTML. */
export function Markdown({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "prose prose-sm max-w-none text-foreground",
        "prose-headings:mb-2 prose-headings:mt-4 prose-headings:text-base prose-headings:font-semibold",
        "prose-p:my-2 prose-p:leading-relaxed",
        "prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5",
        "prose-strong:font-semibold",
        "prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-xs",
        className
      )}
    >
      <ReactMarkdown
        components={{
          a: ({ href, children: c }) => (
            <a
              href={href}
              className="text-violet-700 underline underline-offset-2"
              target="_blank"
              rel="noreferrer"
            >
              {c}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
