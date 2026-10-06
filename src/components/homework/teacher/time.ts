// Small date helpers shared by the teacher homework pages. Dates cross the server/client boundary as ISO strings.

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "in 2 days", "3 hours ago", "yesterday". */
export function relativeTime(target: Date | string, now: Date | number = new Date()): string {
  const t = new Date(target).getTime();
  const diff = t - (typeof now === "number" ? now : now.getTime());
  const abs = Math.abs(diff);
  const min = 60_000;
  if (abs < min) return "just now";
  if (abs < 60 * min) return rtf.format(Math.round(diff / min), "minute");
  if (abs < 24 * 60 * min) return rtf.format(Math.round(diff / (60 * min)), "hour");
  if (abs < 30 * 24 * 60 * min) return rtf.format(Math.round(diff / (24 * 60 * min)), "day");
  return rtf.format(Math.round(diff / (30 * 24 * 60 * min)), "month");
}

/** "Tue 13 Oct, 17:00" in the given time zone. */
export function formatWhen(d: Date | string, timeZone = "UTC"): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(d));
}

export type HomeworkPhase = "draft" | "open" | "closed";

export function phaseOf(a: { status: "draft" | "assigned"; dueAt: Date | string }, now: Date | number = new Date()): HomeworkPhase {
  if (a.status === "draft") return "draft";
  return new Date(a.dueAt).getTime() > (typeof now === "number" ? now : now.getTime()) ? "open" : "closed";
}

export const PHASE_LABEL: Record<HomeworkPhase, string> = { draft: "Draft", open: "Open", closed: "Closed" };
export const PHASE_TONE = { draft: "neutral", open: "good", closed: "warn" } as const;
