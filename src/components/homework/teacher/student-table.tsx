"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, EmptyState, TableWrap, td, th } from "@/components/ui";
import { cn } from "@/lib/cn";
import { sortStudents } from "./student-order";
import { formatWhen } from "./time";

export type StudentRowData = {
  id: string;
  name: string;
  submissionId: string | null;
  status: "not_started" | "in_progress" | "submitted" | "graded";
  late: boolean;
  uploadedFiles: number;
  score: number | null;
  maxScore: number | null;
  /** ISO string */
  submittedAt: string | null;
};

const STATUS: Record<StudentRowData["status"], { label: string; tone: "neutral" | "brand" | "warn" | "good"; icon: string }> = {
  submitted: { label: "Needs marking", tone: "warn", icon: "●" },
  in_progress: { label: "In progress", tone: "brand", icon: "◐" },
  not_started: { label: "Not started", tone: "neutral", icon: "○" },
  graded: { label: "Marked", tone: "good", icon: "✓" },
};

type Filter = "all" | StudentRowData["status"] | "late";

export function StudentTable({ assignmentId, rows, timeZone, isDraft }: { assignmentId: string; rows: StudentRowData[]; timeZone: string; isDraft: boolean }) {
  const [filter, setFilter] = useState<Filter>("all");
  const sorted = useMemo(() => sortStudents(rows), [rows]);
  const count = (f: Filter) => (f === "all" ? rows.length : f === "late" ? rows.filter((r) => r.late).length : rows.filter((r) => r.status === f).length);
  const chips: [Filter, string][] = [
    ["all", "All"],
    ["submitted", "Needs marking"],
    ["graded", "Marked"],
    ["in_progress", "In progress"],
    ["not_started", "Not started"],
    ["late", "Late"],
  ];
  const shown = sorted.filter((r) => filter === "all" || (filter === "late" ? r.late : r.status === filter));

  if (rows.length === 0)
    return (
      <EmptyState title="No students targeted yet">
        {isDraft ? "Once you assign this, every student it applies to will be listed here." : "Nobody is in this class yet, or nobody chosen has joined."}
      </EmptyState>
    );

  return (
    <div className="space-y-3">
      <div role="group" aria-label="Filter students" className="flex flex-wrap gap-2">
        {chips.map(([f, label]) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold max-sm:h-11",
              filter === f ? "border-brand bg-brand-soft text-brand" : "border-border bg-surface-2 text-ink-2 hover:text-ink",
            )}
          >
            {label}
            <span className="tabular text-xs opacity-80">{count(f)}</span>
          </button>
        ))}
      </div>
      <TableWrap label="Student status">
        <table className="w-full min-w-[40rem] border-collapse">
          <thead className="border-b border-border">
            <tr>
              <th className={th} scope="col">
                Student
              </th>
              <th className={th} scope="col">
                Status
              </th>
              <th className={th} scope="col">
                Files
              </th>
              <th className={th} scope="col">
                Handed in
              </th>
              <th className={th} scope="col">
                Score
              </th>
              <th className={th} scope="col">
                <span className="sr-only">Action</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {shown.length === 0 && (
              <tr>
                <td className={cn(td, "text-ink-2")} colSpan={6}>
                  Nobody matches this filter.
                </td>
              </tr>
            )}
            {shown.map((r) => {
              const s = STATUS[r.status];
              const canOpen = r.submissionId && (r.status === "submitted" || r.status === "graded");
              return (
                <tr key={r.id} className={cn(r.status === "submitted" && "bg-warn-soft/40")}>
                  <th scope="row" className={cn(td, "text-left font-semibold")}>
                    {canOpen ? (
                      <Link href={`/teacher/homework/${assignmentId}/submissions/${r.submissionId}`} className="hover:underline">
                        {r.name}
                      </Link>
                    ) : (
                      r.name
                    )}
                  </th>
                  <td className={td}>
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      <Badge tone={s.tone}>
                        <span aria-hidden>{s.icon}</span> {s.label}
                      </Badge>
                      {r.late && <Badge tone="risk">Late</Badge>}
                    </span>
                  </td>
                  <td className={cn(td, "tabular")}>{r.status === "not_started" ? "—" : r.uploadedFiles}</td>
                  <td className={cn(td, "whitespace-nowrap text-ink-2")}>{r.submittedAt ? formatWhen(r.submittedAt, timeZone) : "—"}</td>
                  <td className={cn(td, "tabular whitespace-nowrap")}>
                    {r.status === "graded" && r.score !== null && r.maxScore ? (
                      <>
                        <strong>
                          {r.score} / {r.maxScore}
                        </strong>{" "}
                        <span className="text-ink-2">({Math.round((r.score / r.maxScore) * 100)}%)</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className={cn(td, "text-right")}>
                    {canOpen && (
                      <Link
                        href={`/teacher/homework/${assignmentId}/submissions/${r.submissionId}`}
                        aria-label={`${r.status === "submitted" ? "Mark" : "Review"} ${r.name}'s work`}
                        className={cn(
                          "inline-flex h-8 items-center rounded-[10px] px-3 text-sm font-semibold max-sm:h-11",
                          r.status === "submitted" ? "bg-brand text-brand-ink hover:bg-brand-hi" : "border border-border-strong bg-surface-2 text-ink hover:bg-surface-3",
                        )}
                      >
                        {r.status === "submitted" ? "Mark" : "Review"}
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableWrap>
    </div>
  );
}
