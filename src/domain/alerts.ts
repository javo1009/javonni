// Teacher alert rules over tracker data. Pure: takes a per-student snapshot and returns
// alerts that each carry the evidence shown to the teacher (docs/cfa-platform/PLAN.md §4.6).

import { diffDays, type ISODate } from "./dates";

export type AlertKind = "inactive" | "behind_hours" | "behind_roadmap" | "missed_homework" | "mock_drop" | "low_scores";
export type AlertSeverity = "high" | "medium";

export type StudentSnapshot = {
  studentId: string;
  name: string;
  today: ISODate;
  /** Day the student joined; brand-new students aren't flagged for having no activity. */
  joinedOn: ISODate;
  /** Most recent study session, chapter update, practice answer or mock. */
  lastActiveDate: ISODate | null;
  planStart: ISODate;
  weeklyTargetMinutes: number;
  /** Minutes studied in the last 14 days. */
  minutes14d: number;
  chaptersRead: number;
  /** Chapters the roadmap expects to be read by today. */
  chaptersExpected: number;
  /** Homeworks past due and not submitted (last 30 days). */
  missedHomework: number;
  /** Mock scores in percent, oldest first. */
  mockScores: number[];
  /** Chapters with a recorded practice score, and their mean. */
  scoredChapters: number;
  avgAccuracy: number | null;
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
  /** New students aren't flagged for having no activity during this many days... */
  graceDays: 3,
  /** ...or for being behind a roadmap that started before they joined, during this many. */
  roadmapGraceDays: 7,
  /** Share of planned hours below which a student is "behind" on hours. */
  hoursFloor: 0.5,
  minWindowDays: 4,
  roadmapBehind: 3,
  roadmapBehindHigh: 6,
  missedHomework: 2,
  mockDrop: 5,
  lowScore: 60,
  minScored: 3,
};

const hours = (m: number) => Math.round((m / 60) * 10) / 10;

export function evaluateAlerts(s: StudentSnapshot, cfg = ALERT_CONFIG): Alert[] {
  const out: Alert[] = [];
  const base = { studentId: s.studentId, name: s.name };
  const sinceJoin = diffDays(s.joinedOn, s.today);

  const idle = s.lastActiveDate ? diffDays(s.lastActiveDate, s.today) : null;
  if (idle === null ? sinceJoin >= cfg.graceDays : idle >= cfg.inactiveDays) {
    out.push({
      ...base,
      kind: "inactive",
      severity: idle === null || idle >= 10 ? "high" : "medium",
      evidence: idle === null ? "No study activity yet." : `No activity for ${idle} days.`,
    });
  }

  // Compare with the hours planned over the part of the last 14 days the student has been on the plan.
  const windowStart = s.planStart > s.joinedOn ? s.planStart : s.joinedOn;
  const windowDays = Math.min(14, diffDays(windowStart, s.today) + 1);
  if (windowDays >= cfg.minWindowDays) {
    const planned = (s.weeklyTargetMinutes / 7) * windowDays;
    if (planned > 0 && s.minutes14d / planned < cfg.hoursFloor) {
      out.push({
        ...base,
        kind: "behind_hours",
        severity: s.minutes14d / planned < cfg.hoursFloor / 2 ? "high" : "medium",
        evidence: `Logged ${hours(s.minutes14d)} h of ${hours(planned)} h planned in the last ${windowDays} days.`,
      });
    }
  }

  const behind = s.chaptersExpected - s.chaptersRead;
  if (behind >= cfg.roadmapBehind && sinceJoin >= cfg.roadmapGraceDays) {
    out.push({
      ...base,
      kind: "behind_roadmap",
      severity: behind >= cfg.roadmapBehindHigh ? "high" : "medium",
      evidence: `${s.chaptersRead} chapters read; the roadmap expects ${s.chaptersExpected} by now (${behind} behind).`,
    });
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
        evidence: `Latest mock ${last}%, down ${Math.round(prev - last)} points from the previous one.`,
      });
    }
  }

  if (s.avgAccuracy !== null && s.scoredChapters >= cfg.minScored && s.avgAccuracy < cfg.lowScore) {
    out.push({
      ...base,
      kind: "low_scores",
      severity: "medium",
      evidence: `Practice scores average ${Math.round(s.avgAccuracy)}% across ${s.scoredChapters} chapters.`,
    });
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
