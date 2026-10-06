import { Badge, StatusPill } from "@/components/ui";
import type { StudentHomeworkStatus } from "@/services/homework";

/** The state pill shown on cards and the detail header. State is a word as well as a colour. */
export function HomeworkStatus({ status, overdue, late }: { status: StudentHomeworkStatus; overdue: boolean; late: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2.5 gap-y-1">
      {status === "graded" ? (
        <StatusPill tone="good" label="Marked" />
      ) : status === "submitted" ? (
        <StatusPill tone="brand" label="Handed in, waiting for marking" />
      ) : overdue ? (
        <StatusPill tone="risk" label={status === "in_progress" ? "Overdue, in progress" : "Overdue"} />
      ) : status === "in_progress" ? (
        <StatusPill tone="warn" label="In progress" />
      ) : (
        <StatusPill tone="neutral" label="Not started" />
      )}
      {late && (status === "submitted" || status === "graded") && <Badge tone="warn">Handed in late</Badge>}
    </span>
  );
}
