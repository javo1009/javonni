import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReadOnlyTracker } from "@/components/tracker/student-detail";
import {
  Badge,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  TableWrap,
  td,
  th,
} from "@/components/ui";
import { ALERT_LABEL } from "@/lib/class-roster";
import { formatWhen, relativeTime } from "@/components/homework/teacher/time";
import { teacherContext } from "@/server/context";
import { getTrackerSnapshot } from "@/services/tracker";
import {
  getStudentForTeacher,
  type StudentHomeworkRow,
} from "@/services/student-detail";
import { ForbiddenError, NotFoundError } from "@/services/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata: Metadata = { title: "Student" };

const STATUS: Record<
  StudentHomeworkRow["status"],
  { label: string; tone: "neutral" | "warn" | "good" | "brand" }
> = {
  not_started: { label: "Not started", tone: "neutral" },
  in_progress: { label: "In progress", tone: "neutral" },
  submitted: { label: "Needs marking", tone: "warn" },
  graded: { label: "Marked", tone: "good" },
};

export default async function StudentPage({
  params,
}: PageProps<"/teacher/students/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { user, actor, db, today, now } = await teacherContext();
  const swallow = (e: unknown) => {
    if (e instanceof NotFoundError || e instanceof ForbiddenError) notFound();
    throw e;
  };
  const detail = await getStudentForTeacher(db, actor, id, today, now).catch(
    swallow,
  );
  const snapshot = await getTrackerSnapshot(db, actor, id, today).catch(
    swallow,
  );
  const { student, classes, alerts, homework } = detail;

  return (
    <>
      <PageHeader
        eyebrow={`TEACHER · ${classes
          .map((c) => c.name)
          .join(", ")
          .toUpperCase()}`}
        title={student.name}
        description={student.email}
        actions={
          <ButtonLink
            href={`/teacher?class=${classes[0].id}`}
            variant="secondary"
          >
            Back to class
          </ButtonLink>
        }
      />

      <Card className="mb-6" aria-labelledby="attention-h">
        <CardHeader id="attention-h" title="Needs attention" />
        <CardBody>
          {alerts.length === 0 ? (
            <p className="text-ink-2">
              Nothing flagged. {student.name.split(" ")[0]} is on track for the
              class thresholds.
            </p>
          ) : (
            <ul className="space-y-3">
              {alerts.map((a) => (
                <li key={a.kind} className="flex items-start gap-3 text-sm">
                  <Badge tone={a.severity === "high" ? "risk" : "warn"}>
                    {a.severity === "high" ? "▲ High" : "● Watch"}
                  </Badge>
                  <span>
                    <span className="font-semibold text-ink">
                      {ALERT_LABEL[a.kind]}
                    </span>
                    <span className="block text-ink-2">{a.evidence}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <ReadOnlyTracker snapshot={snapshot} />

      <section className="mt-8" aria-labelledby="hw-h">
        <h2
          id="hw-h"
          className="mb-3 text-xl font-semibold tracking-tight text-ink"
        >
          Homework
        </h2>
        {homework.length === 0 ? (
          <EmptyState title="No homework assigned yet">
            Homework assigned to {student.name.split(" ")[0]} will show up here.
          </EmptyState>
        ) : (
          <TableWrap label={`${student.name}'s homework`}>
            <table className="w-full min-w-[40rem]">
              <thead>
                <tr className="border-b border-border">
                  <th className={th}>Homework</th>
                  <th className={th}>Due</th>
                  <th className={th}>Status</th>
                  <th className={th}>Files</th>
                  <th className={th}>Score</th>
                  <th className={th}>
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {homework.map((h) => {
                  const s = STATUS[h.status];
                  return (
                    <tr
                      key={h.assignmentId}
                      className="border-b border-border last:border-0"
                    >
                      <td className={td}>
                        <Link
                          href={`/teacher/homework/${h.assignmentId}`}
                          className="font-medium text-link hover:underline"
                        >
                          {h.title}
                        </Link>
                        <span className="block text-xs text-ink-3">
                          {h.className}
                        </span>
                      </td>
                      <td className={td}>
                        {formatWhen(h.dueAt, user.timezone)}
                        <span
                          className="block text-xs text-ink-3"
                          suppressHydrationWarning
                        >
                          {relativeTime(h.dueAt, now)}
                        </span>
                      </td>
                      <td className={td}>
                        <Badge tone={s.tone}>{s.label}</Badge>
                        {h.late && (
                          <Badge tone="warn" className="ml-1.5">
                            Late
                          </Badge>
                        )}
                        {h.overdue && (
                          <Badge tone="risk" className="ml-1.5">
                            Overdue
                          </Badge>
                        )}
                      </td>
                      <td className={`${td} tabular`}>
                        {h.uploadedFiles || "–"}
                      </td>
                      <td className={`${td} tabular`}>
                        {h.score !== null && h.maxScore
                          ? `${h.score}/${h.maxScore}`
                          : "–"}
                      </td>
                      <td className={td}>
                        {h.submissionId && h.status !== "in_progress" && (
                          <Link
                            href={`/teacher/homework/${h.assignmentId}/submissions/${h.submissionId}`}
                            className="text-sm font-semibold text-link hover:underline"
                          >
                            {h.status === "submitted" ? "Mark" : "Review"}
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </section>
    </>
  );
}
