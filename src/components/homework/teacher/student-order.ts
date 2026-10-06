// Pure helpers (usable on server and client) for the order students are marked in.

export type HandInStatus = "not_started" | "in_progress" | "submitted" | "graded";

export const STATUS_RANK: Record<HandInStatus, number> = { submitted: 0, in_progress: 1, not_started: 2, graded: 3 };

/** Marking order: waiting work first (oldest hand-in first), then the rest by name. */
export function sortStudents<T extends { status: HandInStatus; submittedAt: Date | string | null; name: string }>(rows: T[]): T[] {
  const at = (v: Date | string | null) => (v ? new Date(v).getTime() : 0);
  return [...rows].sort(
    (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || (a.status === "submitted" ? at(a.submittedAt) - at(b.submittedAt) : 0) || a.name.localeCompare(b.name),
  );
}

/** Students whose work has been handed in, in marking order (unmarked first). */
export function markableOrder<T extends { status: HandInStatus; submittedAt: Date | string | null; name: string; submissionId: string | null }>(rows: T[]): T[] {
  return sortStudents(rows).filter((r) => r.submissionId && (r.status === "submitted" || r.status === "graded"));
}
