// Teacher alert rules. Pure: takes a per-student snapshot, returns evidence-bearing alerts.
// See docs/cfa-platform/PLAN.md §4.6.

import { diffDays, type ISODate } from "./dates";

export type AlertKind = "inactive" | "behind_plan" | "stagnating" | "missed_homework" | "mock_drop";
export type AlertSeverity = "high" | "medium";

export type StudentSnapshot = {
  studentId: string;
  name: string;
  today: ISODate;
  lastActiveDate: ISODate | null;
  /** Planned vs. done minutes over the last 14 days. */
  plannedMinutes14d: number;
  doneMinutes14d: number;
  /** Weekly readiness midpoints, oldest first (last 4 weeks ideally). */
  readinessWeekly: number[];
  /** Homeworks past due and not submitted (last 30 days). */
  missedHomework: number;
  /** Mock scores in percent, oldest first. */
  mockScores: number[];
};

export type Alert = {
  studentId: string;
  name: string;
  kind: AlertKind;
  severity: AlertSeverity;
  /** Plain-language evidence shown next to the alert. */
  evidence: string;
};

export const ALERT_CONFIG = {
  inactiveDays: 5,
  adherenceFloor: 0.6,
  minPlannedForAdherence: 120,
  stagnationWeeks: 3,
  stagnationDelta: 1,
  missedHomework: 2,
  mockDrop: 5,
};

export function evaluateAlerts(s: StudentSnapshot, cfg = ALERT_CONFIG): Alert[] {
  const out: Alert[] = [];
  const base = { studentId: s.studentId, name: s.name };

  const idle = s.lastActiveDate ? diffDays(s.lastActiveDate, s.today) : null;
  if (idle === null || idle >= cfg.inactiveDays) {
    out.push({
      ...base,
      kind: "inactive",
      severity: idle === null || idle >= 10 ? "high" : "medium",
      evidence: idle === null ? "No study activity yet." : `No activity for ${idle} days.`,
    });
  }

  if (s.plannedMinutes14d >= cfg.minPlannedForAdherence) {
    const adherence = s.doneMinutes14d / s.plannedMinutes14d;
    if (adherence < cfg.adherenceFloor) {
      const behindH = Math.round(((s.plannedMinutes14d - s.doneMinutes14d) / 60) * 10) / 10;
      out.push({
        ...base,
        kind: "behind_plan",
        severity: adherence < 0.4 ? "high" : "medium",
        evidence: `${Math.round(adherence * 100)}% of planned study done over 2 weeks (${behindH} h behind).`,
      });
    }
  }

  const w = s.readinessWeekly;
  if (w.length >= cfg.stagnationWeeks + 1) {
    const recent = w.slice(-(cfg.stagnationWeeks + 1));
    const gain = recent[recent.length - 1] - recent[0];
    if (Math.abs(gain) < cfg.stagnationDelta) {
      out.push({
        ...base,
        kind: "stagnating",
        severity: "medium",
        evidence: `Readiness flat at ~${recent[recent.length - 1]} for ${cfg.stagnationWeeks} weeks.`,
      });
    }
  }

  if (s.missedHomework >= cfg.missedHomework) {
    out.push({
      ...base,
      kind: "missed_homework",
      severity: s.missedHomework >= 3 ? "high" : "medium",
      evidence: `${s.missedHomework} homework assignments missed in the last 30 days.`,
    });
  }

  if (s.mockScores.length >= 2) {
    const last = s.mockScores[s.mockScores.length - 1];
    const prev = s.mockScores[s.mockScores.length - 2];
    if (prev - last >= cfg.mockDrop) {
      out.push({
        ...base,
        kind: "mock_drop",
        severity: "medium",
        evidence: `Latest mock ${last}% — down ${Math.round(prev - last)} points from the previous one.`,
      });
    }
  }
  return out;
}

const SEVERITY_RANK: Record<AlertSeverity, number> = { high: 0, medium: 1 };

/** One entry per student, most severe first. */
export function groupAlerts(alerts: Alert[]) {
  const byStudent = new Map<string, Alert[]>();
  for (const a of alerts) byStudent.set(a.studentId, [...(byStudent.get(a.studentId) ?? []), a]);
  return [...byStudent.values()]
    .map((list) => list.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]))
    .sort(
      (a, b) =>
        SEVERITY_RANK[a[0].severity] - SEVERITY_RANK[b[0].severity] || b.length - a.length || a[0].name.localeCompare(b[0].name),
    );
}
