// Server-safe labels shared by the student pages.
import { Badge, StatusPill } from "@/components/ui";
import type { ProgressState } from "@/domain/assessment";
import type { LosStatus } from "@/domain/status";
import { LOS_STATUS_LABEL } from "@/domain/status";
import { hours } from "@/lib/format";
import type { StudentHomeworkStatus } from "@/services/homework";

const PLAN_STATE: Record<ProgressState, { tone: "good" | "warn" | "risk"; label: string }> = {
  ahead: { tone: "good", label: "Ahead of plan" },
  on_track: { tone: "good", label: "On track" },
  behind: { tone: "warn", label: "Behind plan" },
  at_risk: { tone: "risk", label: "Plan at risk" },
};

export function deltaText(deltaMinutes: number) {
  if (Math.abs(deltaMinutes) < 15) return "right on schedule";
  return deltaMinutes > 0 ? `${hours(deltaMinutes)} ahead` : `${hours(-deltaMinutes)} behind`;
}

export function PlanStatePill({ state, deltaMinutes }: { state: ProgressState; deltaMinutes: number }) {
  const s = PLAN_STATE[state];
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2">
      <StatusPill tone={s.tone} label={s.label} />
      {/* "On track" covers small gaps, often just today's unfinished tasks; don't contradict it. */}
      <span className="tabular text-sm text-ink-2">({state === "on_track" && deltaMinutes < 0 ? "within an hour of plan" : deltaText(deltaMinutes)})</span>
    </span>
  );
}

const HW: Record<StudentHomeworkStatus, { tone: "neutral" | "brand" | "good" | "warn"; label: string }> = {
  not_started: { tone: "neutral", label: "Not started" },
  in_progress: { tone: "brand", label: "In progress" },
  submitted: { tone: "warn", label: "Submitted · awaiting grade" },
  graded: { tone: "good", label: "Graded" },
};

export function HomeworkStatusChip({ status }: { status: StudentHomeworkStatus }) {
  return <Badge tone={HW[status].tone}>{HW[status].label}</Badge>;
}

const LOS_TONE: Record<LosStatus, "neutral" | "brand" | "good" | "warn"> = {
  not_started: "neutral",
  studied: "neutral",
  practiced: "brand",
  proficient: "good",
  review_due: "warn",
};

export function LosStatusBadge({ status }: { status: LosStatus }) {
  return <Badge tone={LOS_TONE[status]}>{LOS_STATUS_LABEL[status]}</Badge>;
}

/** "due tomorrow", "due in 3 days", "2 days overdue" relative to now. */
export function dueText(dueAt: Date, nowMs: number) {
  const days = Math.round((dueAt.getTime() - nowMs) / 86_400_000);
  const hrs = (dueAt.getTime() - nowMs) / 3_600_000;
  if (hrs < 0) {
    const late = Math.max(1, Math.round(-hrs / 24));
    return hrs > -24 ? "overdue" : `${late} day${late === 1 ? "" : "s"} overdue`;
  }
  if (hrs < 24) return "due within 24 h";
  if (days <= 1) return "due tomorrow";
  return `due in ${days} days`;
}
