// Shared labels and status chips for the teacher pages. Status is always text + dot, never colour alone.
import type { AlertKind } from "@/domain/alerts";
import type { StudentHomeworkStatus } from "@/services/homework";
import { Badge, StatusPill } from "@/components/ui";

export const ALERT_LABEL: Record<AlertKind, string> = {
  inactive: "Inactive",
  behind_plan: "Behind plan",
  stagnating: "Readiness flat",
  missed_homework: "Missed homework",
  mock_drop: "Mock score drop",
};

const HW_STATUS: Record<StudentHomeworkStatus, { label: string; tone: "neutral" | "brand" | "warn" | "good" }> = {
  not_started: { label: "Not started", tone: "neutral" },
  in_progress: { label: "In progress", tone: "brand" },
  submitted: { label: "Needs grading", tone: "warn" },
  graded: { label: "Graded", tone: "good" },
};

export function HomeworkStatus({ status, overdue }: { status: StudentHomeworkStatus; overdue?: boolean }) {
  if (overdue && (status === "not_started" || status === "in_progress")) return <StatusPill tone="risk" label="Missed" />;
  const s = HW_STATUS[status];
  return <StatusPill tone={s.tone} label={s.label} />;
}

export function LateBadge({ late }: { late: boolean }) {
  return late ? <Badge tone="warn">Late</Badge> : null;
}

export function AlertBadge({ kind, severity }: { kind: AlertKind; severity: "high" | "medium" }) {
  return (
    <Badge tone={severity === "high" ? "risk" : "warn"}>
      <span aria-hidden>{severity === "high" ? "●" : "◐"}</span>
      {ALERT_LABEL[kind]}
      <span className="sr-only">{severity === "high" ? " (high priority)" : " (medium priority)"}</span>
    </Badge>
  );
}

export function scoreText(score: number | null, maxScore: number | null) {
  if (score === null || !maxScore) return "—";
  const pct = Math.round((score / maxScore) * 100);
  return `${formatPoints(score)} / ${formatPoints(maxScore)} (${pct}%)`;
}

export const formatPoints = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** A first-person nudge the teacher can edit before sending. */
export function nudgeTemplate(firstName: string, kinds: AlertKind[], teacherName: string) {
  const lines: string[] = [`Hi ${firstName},`, ""];
  if (kinds.includes("inactive")) lines.push("I noticed you haven't logged any study for a few days. Is everything OK?");
  if (kinds.includes("behind_plan")) lines.push("You're a bit behind your study plan. The plan page has a few ways to catch up; pick whichever fits your week.");
  if (kinds.includes("missed_homework")) lines.push("A couple of homework sets are still open for you. Even a late attempt helps me see where to focus in class.");
  if (kinds.includes("stagnating")) lines.push("Your readiness has been flat for a few weeks. A short mixed-review session on your weakest topic could help it move.");
  if (kinds.includes("mock_drop")) lines.push("Your last mock was a little lower than the one before. Want to go through it together?");
  if (lines.length === 2) lines.push("Just checking in on how your studies are going.");
  lines.push("", "If something is getting in the way, reply and we'll figure out a plan together.", "", teacherName);
  return lines.join("\n");
}
