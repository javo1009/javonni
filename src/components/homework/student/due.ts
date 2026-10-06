// Pure helpers for how homework is described to students.

export type DueInfo = { overdue: boolean; label: string };

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function span(ms: number): string {
  if (ms < MIN) return "less than a minute";
  if (ms < HOUR) {
    const m = Math.floor(ms / MIN);
    return `${m} ${m === 1 ? "minute" : "minutes"}`;
  }
  if (ms < DAY) {
    const h = Math.floor(ms / HOUR);
    return `${h} ${h === 1 ? "hour" : "hours"}`;
  }
  const d = Math.floor(ms / DAY);
  return `${d} ${d === 1 ? "day" : "days"}`;
}

/** "due in 2 days" / "overdue by 3 hours" (relative to `now`). */
export function describeDue(dueAt: Date | number | string, now: Date | number | string): DueInfo {
  const diff = new Date(dueAt).getTime() - new Date(now).getTime();
  if (diff >= 0) return { overdue: false, label: diff < MIN ? "due now" : `due in ${span(diff)}` };
  return { overdue: true, label: `overdue by ${span(-diff)}` };
}

/** "Fri 9 Oct, 17:00" in the viewer's time zone. */
export function formatDue(d: Date | number | string, timeZone = "UTC"): string {
  let tz = timeZone;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
  } catch {
    tz = "UTC";
  }
  const date = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: tz }).format(new Date(d));
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz }).format(new Date(d));
  return `${date}, ${time}`;
}

export type ItemKind = "mcq" | "text" | "file";

/** "1 file upload · 8 questions · 2 written answers" */
export function summarizeItems(kinds: ItemKind[]): string {
  const n = (k: ItemKind) => kinds.filter((x) => x === k).length;
  const parts: string[] = [];
  const f = n("file");
  const q = n("mcq");
  const t = n("text");
  if (f) parts.push(`${f} file ${f === 1 ? "upload" : "uploads"}`);
  if (q) parts.push(`${q} ${q === 1 ? "question" : "questions"}`);
  if (t) parts.push(`${t} written ${t === 1 ? "answer" : "answers"}`);
  return parts.join(" · ") || "No items";
}
