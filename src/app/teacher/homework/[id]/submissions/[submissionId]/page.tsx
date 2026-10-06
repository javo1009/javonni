import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { GradingForm, type GradeItem } from "@/components/teacher/grading-form";
import { LateBadge } from "@/components/teacher/labels";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { teacherContext } from "@/server/context";
import { getAssignmentForTeacher, getSubmissionForTeacher } from "@/services/homework";
import { isUuid } from "@/services/teacher-views";
import { orNotFound } from "../../../../_lib/guard";

export const metadata: Metadata = { title: "Grade submission" };

export default async function GradePage({ params }: { params: Promise<{ id: string; submissionId: string }> }) {
  const { id, submissionId } = await params;
  if (!isUuid(id)) notFound();
  const { actor, db, user } = await teacherContext();
  const { sub, detail } = await orNotFound(submissionId, async (sid) => {
    const sub = await getSubmissionForTeacher(db, actor, sid);
    const detail = await getAssignmentForTeacher(db, actor, sub.assignment.id);
    return { sub, detail };
  });
  // The URL's assignment must match the submission's.
  if (sub.assignment.id !== id) notFound();
  const { assignment: a, student, submission: s } = sub;

  const queue = detail.students
    .filter((x) => x.submissionId && (x.status === "submitted" || x.status === "graded"))
    .map((x) => ({ submissionId: x.submissionId!, name: x.name, status: x.status as "submitted" | "graded", late: x.late }));
  const items: GradeItem[] = sub.items.map(({ item, question, answer }) => ({
    itemId: item.id,
    kind: item.kind === "text" ? "text" : "mcq",
    maxPoints: item.points,
    text: question ? question.stem : (item.prompt ?? ""),
    options: question?.options ?? null,
    correctKey: question?.correctKey ?? null,
    chosenKey: answer?.chosenKey ?? null,
    textAnswer: answer?.textAnswer ?? null,
    pointsAwarded: answer?.pointsAwarded ?? null,
    feedback: answer?.feedback ?? "",
  }));

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href={`/teacher/homework/${a.id}`} className="hover:underline">
            ← {a.title}
          </Link>
        }
        title={student.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {s.submittedAt ? `Submitted ${formatDateTime(s.submittedAt, user.timezone)}` : "Not submitted"}
            <LateBadge late={s.late} />
            <span>· {s.status === "graded" ? "Graded" : "Waiting for grading"}</span>
          </span>
        }
      />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <nav aria-label="Submissions for this homework" className="lg:sticky lg:top-6 lg:self-start">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-ink-2">
            Submissions ({queue.filter((q) => q.status === "submitted").length} to grade)
          </p>
          <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
            {queue.map((q) => {
              const current = q.submissionId === s.id;
              return (
                <li key={q.submissionId} className="shrink-0">
                  <Link
                    href={`/teacher/homework/${a.id}/submissions/${q.submissionId}`}
                    aria-current={current ? "page" : undefined}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm",
                      current ? "bg-brand-soft font-semibold text-brand" : "text-ink hover:bg-surface-2",
                    )}
                  >
                    <span className="truncate">{q.name}</span>
                    <span className={cn("shrink-0 text-xs", q.status === "submitted" ? "font-medium text-warn" : "text-ink-2")}>
                      {q.status === "submitted" ? "To grade" : "Graded"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 hidden text-xs text-ink-2 lg:block">
            Keys: <kbd className="rounded border border-border px-1">J</kbd> / <kbd className="rounded border border-border px-1">K</kbd> next / previous ·{" "}
            <kbd className="rounded border border-border px-1">Ctrl</kbd>+<kbd className="rounded border border-border px-1">Enter</kbd> save
          </p>
        </nav>
        <GradingForm
          key={s.id}
          submissionId={s.id}
          assignmentId={a.id}
          status={s.status}
          items={items}
          overallFeedback={s.teacherFeedback ?? ""}
          score={s.score}
          maxScore={s.maxScore}
          queue={queue}
        />
      </div>
    </>
  );
}
