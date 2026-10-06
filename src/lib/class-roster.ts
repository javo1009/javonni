// Pure helpers for the teacher cockpit's student table: status, sorting, filtering and CSV export.
// Every number comes from services/classes.ts (getClassOverview); nothing here re-derives pace.

import type { Alert, AlertKind } from "@/domain/alerts";
import { diffDays, type ISODate } from "@/domain/dates";
import type { StudentRow } from "@/services/classes";

export type StudentStatus = "on_track" | "watch" | "behind" | "inactive";

export const STATUS_LABEL: Record<StudentStatus, string> = {
  on_track: "On track",
  watch: "Needs a look",
  behind: "Behind",
  inactive: "Inactive",
};

/** Higher means more urgent; used by the "status" sort. */
const STATUS_RANK: Record<StudentStatus, number> = {
  on_track: 0,
  watch: 1,
  behind: 2,
  inactive: 3,
};

export const ALERT_LABEL: Record<AlertKind, string> = {
  inactive: "Inactive",
  behind_hours: "Behind on hours",
  behind_roadmap: "Behind the roadmap",
  missed_homework: "Missed homework",
  mock_drop: "Mock score dropped",
  low_scores: "Low practice scores",
};

/** Inactive wins, then behind (hours or roadmap), then any other alert; no alerts means on track. */
export function studentStatus(alerts: Pick<Alert, "kind">[]): StudentStatus {
  if (alerts.some((a) => a.kind === "inactive")) return "inactive";
  if (
    alerts.some((a) => a.kind === "behind_roadmap" || a.kind === "behind_hours")
  )
    return "behind";
  return alerts.length ? "watch" : "on_track";
}

export function attentionScore(alerts: Pick<Alert, "severity">[]): number {
  return alerts.reduce((sum, a) => sum + (a.severity === "high" ? 3 : 1), 0);
}

/** "Today", "Yesterday", "4 days ago", "3 weeks ago", "Never". */
export function relativeDay(date: ISODate | null, today: ISODate): string {
  if (!date) return "Never";
  const d = diffDays(date, today);
  if (d <= 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 14) return `${d} days ago`;
  if (d < 60) return `${Math.floor(d / 7)} weeks ago`;
  return `${Math.floor(d / 30)} months ago`;
}

/** The serialisable row the table and the CSV export share. */
export type RosterRow = {
  id: string;
  name: string;
  email: string;
  status: StudentStatus;
  attention: number;
  alertCount: number;
  alertKinds: AlertKind[];
  chaptersRead: number;
  chaptersTotal: number;
  readPct: number;
  weightedReadPct: number;
  hoursThisWeek: number;
  targetHours: number;
  lastActive: ISODate | null;
  lastActiveLabel: string;
  mockLatest: number | null;
  mockChange: number | null;
  missedHomework: number;
};

export function toRosterRows(
  students: StudentRow[],
  today: ISODate,
): RosterRow[] {
  return students.map((s) => ({
    id: s.id,
    name: s.name,
    email: s.email,
    status: studentStatus(s.alerts),
    attention: attentionScore(s.alerts),
    alertCount: s.alerts.length,
    alertKinds: s.alerts.map((a) => a.kind),
    chaptersRead: s.totals.read,
    chaptersTotal: s.totals.total,
    readPct: s.totals.readPct,
    weightedReadPct: s.totals.weightedReadPct,
    hoursThisWeek: s.hoursThisWeek,
    targetHours: s.weeklyTargetHours,
    lastActive: s.lastActive,
    lastActiveLabel: relativeDay(s.lastActive, today),
    mockLatest: s.mocks.latest,
    mockChange: s.mocks.change,
    missedHomework: s.missedHomework,
  }));
}

// ------------------------------------------------------------------ sort / filter

export type SortKey =
  | "attention"
  | "name"
  | "status"
  | "chapters"
  | "weighted"
  | "hours"
  | "active"
  | "mock"
  | "homework"
  | "alerts";
export type SortDir = "asc" | "desc";

/** The direction a column starts in the first time it is clicked. */
export const DEFAULT_DIR: Record<SortKey, SortDir> = {
  attention: "desc",
  name: "asc",
  status: "desc",
  chapters: "asc",
  weighted: "asc",
  hours: "asc",
  active: "asc",
  mock: "asc",
  homework: "desc",
  alerts: "desc",
};

function sortValue(r: RosterRow, key: SortKey): number | string | null {
  switch (key) {
    case "attention":
      return r.attention * 100 + r.alertCount;
    case "name":
      return r.name.toLocaleLowerCase();
    case "status":
      return STATUS_RANK[r.status];
    case "chapters":
      return r.chaptersRead;
    case "weighted":
      return r.weightedReadPct;
    case "hours":
      return r.targetHours > 0
        ? r.hoursThisWeek / r.targetHours
        : r.hoursThisWeek;
    case "active":
      return r.lastActive; // ISO dates compare as strings; null = never
    case "mock":
      return r.mockLatest;
    case "homework":
      return r.missedHomework;
    case "alerts":
      return r.alertCount;
  }
}

/** Sorts a copy. Empty values (never active, no mock) always sit at the bottom; ties fall back to name. */
export function sortRows(
  rows: RosterRow[],
  key: SortKey,
  dir: SortDir,
): RosterRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = sortValue(a, key);
    const bv = sortValue(b, key);
    if (av === null && bv !== null) return 1;
    if (bv === null && av !== null) return -1;
    if (av !== null && bv !== null && av !== bv)
      return (av < bv ? -1 : 1) * sign;
    return a.name.localeCompare(b.name);
  });
}

/** Every whitespace-separated term must appear in the name or email. */
export function filterRows(rows: RosterRow[], query: string): RosterRow[] {
  const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return rows;
  return rows.filter((r) => {
    const hay = `${r.name} ${r.email}`.toLocaleLowerCase();
    return terms.every((t) => hay.includes(t));
  });
}

// ------------------------------------------------------------------ CSV

/** Text cells starting with = + - @ (or a tab/CR) are prefixed with ' so spreadsheets never run them as formulas. */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let s = typeof value === "number" ? String(value) : value;
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export const CSV_HEADERS = [
  "Name",
  "Email",
  "Status",
  "Chapters read",
  "Chapters total",
  "Chapters read %",
  "Exam-weighted coverage %",
  "Hours this week",
  "Weekly target hours",
  "Last active",
  "Latest mock %",
  "Mock change (points)",
  "Homework missed",
  "Alerts",
] as const;

export function rosterCsv(rows: RosterRow[]): string {
  const lines = [CSV_HEADERS.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.name,
        r.email,
        STATUS_LABEL[r.status],
        r.chaptersRead,
        r.chaptersTotal,
        r.readPct,
        r.weightedReadPct,
        r.hoursThisWeek,
        r.targetHours,
        r.lastActive,
        r.mockLatest,
        r.mockChange,
        r.missedHomework,
        r.alertKinds.map((k) => ALERT_LABEL[k]).join("; "),
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return "﻿" + lines.join("\r\n") + "\r\n";
}

export function csvFileName(className: string, today: ISODate): string {
  const slug =
    className
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "class";
  return `${slug}-students-${today}.csv`;
}

/** "18 Feb 2027 · 134 days to go" / "exam day is today" / "exam date passed" / "No exam date set". */
export function examCountdown(
  examDate: ISODate | null,
  today: ISODate,
): { date: ISODate | null; text: string } {
  if (!examDate) return { date: null, text: "No exam date set" };
  const d = diffDays(today, examDate);
  const text =
    d > 1
      ? `${d} days to go`
      : d === 1
        ? "1 day to go"
        : d === 0
          ? "exam day is today"
          : "exam date has passed";
  return { date: examDate, text };
}
