export function formatPct(
  value: number | null | undefined,
  digits = 2
): string {
  if (value == null || Number.isNaN(value)) return "n/a";
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatPrice(value: number | null | undefined, digits = 2): string {
  if (value == null || Number.isNaN(value)) return "n/a";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatBps(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "n/a";
  return `${value} bps`;
}

export function formatSessions(n: number): string {
  return `${n} session${n === 1 ? "" : "s"}`;
}

export function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") ? iso : `${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function thresholdLabel(threshold: number, windowSessions: number): string {
  return `${windowSessions}-session return ≤ ${formatPct(threshold, 1)}`;
}
