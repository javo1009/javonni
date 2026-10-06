"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  Input,
  ProgressBar,
  StatusPill,
  TableWrap,
  buttonClass,
  td,
  th,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  DEFAULT_DIR,
  STATUS_LABEL,
  filterRows,
  sortRows,
  type RosterRow,
  type SortDir,
  type SortKey,
  type StudentStatus,
} from "@/lib/class-roster";

const TONE: Record<StudentStatus, "good" | "warn" | "risk" | "neutral"> = {
  on_track: "good",
  watch: "warn",
  behind: "warn",
  inactive: "risk",
};

const COLUMNS: { key: SortKey; label: string; align?: "right" }[] = [
  { key: "name", label: "Student" },
  { key: "status", label: "Status" },
  { key: "chapters", label: "Chapters read" },
  { key: "weighted", label: "Exam-weighted" },
  { key: "hours", label: "Hours this week" },
  { key: "active", label: "Last active" },
  { key: "mock", label: "Latest mock" },
  { key: "homework", label: "Homework missed" },
  { key: "alerts", label: "Alerts" },
];

function SortHeader({
  col,
  sort,
  onSort,
}: {
  col: (typeof COLUMNS)[number];
  sort: { key: SortKey; dir: SortDir };
  onSort: (k: SortKey) => void;
}) {
  const active = sort.key === col.key;
  return (
    <th
      scope="col"
      className={th}
      aria-sort={
        active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"
      }
    >
      <button
        type="button"
        onClick={() => onSort(col.key)}
        className={cn(
          "-mx-1 inline-flex items-center gap-1 rounded px-1 py-1 uppercase tracking-[0.06em] hover:text-ink max-sm:min-h-11",
          active && "text-ink",
        )}
      >
        {col.label}
        <span
          aria-hidden
          className={cn("text-[0.7rem]", !active && "opacity-30")}
        >
          {active ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}

function Trend({ change }: { change: number | null }) {
  if (change === null || change === 0) return null;
  const up = change > 0;
  return (
    <Badge tone={up ? "good" : "warn"} className="ml-2 px-1.5 py-0.5">
      <span aria-hidden>{up ? "▲" : "▼"}</span>
      <span className="sr-only">{up ? "up" : "down"}</span> {Math.abs(change)}
    </Badge>
  );
}

export function StudentTable({
  rows,
  classId,
}: {
  rows: RosterRow[];
  classId: string;
}) {
  const [query, setQuery] = useState("");
  // Default: most attention first. A header click picks that column's natural direction, a second click flips it.
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "attention",
    dir: "desc",
  });
  const visible = useMemo(
    () => sortRows(filterRows(rows, query), sort.key, sort.dir),
    [rows, query, sort],
  );

  const onSort = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: DEFAULT_DIR[key] },
    );

  return (
    <Card aria-labelledby="students-h">
      <CardHeader
        id="students-h"
        title="Students"
        subtitle={
          sort.key === "attention"
            ? "Sorted by who needs attention most. Click a column heading to re-sort."
            : "Click a column heading to re-sort."
        }
        action={
          <a
            href={`/teacher/classes/${classId}/export`}
            download
            className={buttonClass("secondary", "sm", "shrink-0")}
          >
            Export CSV
          </a>
        }
      />
      <div className="space-y-3 px-5 pb-5">
        {rows.length === 0 ? (
          <EmptyState title="No students yet">
            Share the class join code so students can sign up and appear here.
          </EmptyState>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor="student-search" className="sr-only">
                Search students by name or email
              </label>
              <Input
                id="student-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or email"
                className="max-w-sm"
                autoComplete="off"
              />
              <p
                role="status"
                aria-live="polite"
                className="text-sm text-ink-2"
              >
                {query
                  ? `Showing ${visible.length} of ${rows.length}`
                  : `${rows.length} ${rows.length === 1 ? "student" : "students"}`}
              </p>
              {sort.key !== "attention" && (
                <button
                  type="button"
                  onClick={() => setSort({ key: "attention", dir: "desc" })}
                  className="text-sm font-semibold text-link hover:underline max-sm:min-h-11"
                >
                  Reset sort
                </button>
              )}
            </div>
            <TableWrap label="Students in this class">
              <table className="w-full min-w-[60rem] border-collapse">
                <thead className="border-b border-border bg-surface-2">
                  <tr>
                    {COLUMNS.map((c) => (
                      <SortHeader
                        key={c.key}
                        col={c}
                        sort={sort}
                        onSort={onSort}
                      />
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {visible.map((r) => (
                    <tr key={r.id} className="hover:bg-surface-2/60">
                      <th
                        scope="row"
                        className={cn(td, "text-left font-normal")}
                      >
                        <Link
                          href={`/teacher/students/${r.id}`}
                          className="font-semibold text-link hover:underline"
                        >
                          {r.name}
                        </Link>
                        <span className="block text-xs text-ink-3">
                          {r.email}
                        </span>
                      </th>
                      <td className={cn(td, "whitespace-nowrap")}>
                        <StatusPill
                          tone={TONE[r.status]}
                          label={STATUS_LABEL[r.status]}
                        />
                      </td>
                      <td className={td}>
                        <div className="w-32">
                          <p className="tabular text-sm">
                            <span className="font-semibold">
                              {r.chaptersRead}
                            </span>
                            <span className="text-ink-3">
                              /{r.chaptersTotal}
                            </span>
                          </p>
                          <ProgressBar
                            value={r.chaptersRead}
                            max={r.chaptersTotal}
                            label={`${r.name}: chapters read`}
                            className="mt-1"
                          />
                        </div>
                      </td>
                      <td className={cn(td, "tabular")}>
                        {r.weightedReadPct}%
                      </td>
                      <td className={td}>
                        <div className="w-32">
                          <p className="tabular text-sm">
                            <span className="font-semibold">
                              {Math.round(r.hoursThisWeek * 10) / 10}
                            </span>
                            <span className="text-ink-3">
                              {" "}
                              / {Math.round(r.targetHours * 10) / 10} h
                            </span>
                          </p>
                          <ProgressBar
                            value={r.hoursThisWeek}
                            max={r.targetHours}
                            label={`${r.name}: hours this week`}
                            className="mt-1"
                          />
                        </div>
                      </td>
                      <td className={cn(td, "whitespace-nowrap")}>
                        {r.lastActiveLabel}
                      </td>
                      <td className={cn(td, "tabular whitespace-nowrap")}>
                        {r.mockLatest === null ? (
                          <span className="text-ink-3">None</span>
                        ) : (
                          <span className="font-semibold">{r.mockLatest}%</span>
                        )}
                        <Trend change={r.mockChange} />
                      </td>
                      <td className={cn(td, "tabular")}>
                        {r.missedHomework === 0 ? (
                          <span className="text-ink-3">0</span>
                        ) : (
                          <span className="font-semibold text-warn">
                            {r.missedHomework}
                          </span>
                        )}
                      </td>
                      <td className={cn(td, "tabular")}>
                        {r.alertCount === 0 ? (
                          <span className="text-ink-3">0</span>
                        ) : (
                          <span className="font-semibold">{r.alertCount}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {visible.length === 0 && (
                    <tr>
                      <td
                        colSpan={COLUMNS.length}
                        className={cn(td, "py-8 text-center text-ink-2")}
                      >
                        No student matches “{query}”.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </TableWrap>
          </>
        )}
      </div>
    </Card>
  );
}
