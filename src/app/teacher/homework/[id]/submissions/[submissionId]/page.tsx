import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  MarkingForm,
  type MarkItem,
} from "@/components/homework/teacher/marking-form";
import { markableOrder } from "@/components/homework/teacher/student-order";
import { formatWhen, relativeTime } from "@/components/homework/teacher/time";
import { Badge, Banner, buttonClass, Eyebrow } from "@/components/ui";
import { cn } from "@/lib/cn";
import { teacherContext } from "@/server/context";
import {
  getAssignmentForTeacher,
  getSubmissionForTeacher,
} from "@/services/homework";
import { ForbiddenError, NotFoundError } from "@/services/types";

export const metadata: Metadata = { title: "Mark work · Ascent" };

export default async function MarkingPage({
  params,
  searchParams,
}: PageProps<"/teacher/homework/[id]/submissions/[submissionId]">) {
  const { id, submissionId } = await params;
  const sp = await searchParams;
  const { actor, db, user, now } = await teacherContext();

  let sub, overview;
  try {
    sub = await getSubmissionForTeacher(db, actor, submissionId);
    if (sub.assignment.id !== id) notFound();
    overview = await getAssignmentForTeacher(db, actor, id);
  } catch (e) {
    if (e instanceof NotFoundError || e instanceof ForbiddenError) notFound();
    throw e;
  }
  const { assignment: a, student, submission: s } = sub;
  const base = `/teacher/homework/${a.id}`;
  const handedIn = s.status !== "in_progress";
  const graded = s.status === "graded";

  const order = markableOrder(overview.students);
  const idx = order.findIndex((r) => r.submissionId === s.id);
  const prev = idx > 0 ? order[idx - 1] : null;
  const following = idx >= 0 ? (order[idx + 1] ?? null) : null;
  const waiting = order.filter(
    (r) => r.status === "submitted" && r.submissionId !== s.id,
  );
  const nextUnmarked =
    waiting.find((r) => order.indexOf(r) > idx) ?? waiting[0] ?? null;
  const subHref = (r: { submissionId: string | null }) =>
    `${base}/submissions/${r.submissionId}`;

  const items: MarkItem[] = sub.items.map(
    ({ item, question, answer, files }) => ({
      id: item.id,
      kind: item.kind as MarkItem["kind"],
      points: item.points,
      prompt:
        item.kind === "mcq" ? (question?.stem ?? "") : (item.prompt ?? ""),
      files: files.map((f) => ({ id: f.id, name: f.name, size: f.size })),
      textAnswer: answer?.textAnswer ?? null,
      chosenKey: answer?.chosenKey ?? null,
      options: question?.options ?? null,
      correctKey: question?.correctKey ?? null,
      correct: answer?.correct ?? null,
      pointsAwarded: answer?.pointsAwarded ?? null,
      feedback: answer?.feedback ?? null,
    }),
  );

  const navLink =
    "inline-flex h-9 items-center rounded-[10px] border border-border-strong bg-surface-2 px-3 text-sm font-semibold text-ink hover:bg-surface-3 max-sm:h-11";

  return (
    <>
      <header className="pb-5 pt-8">
        <Link
          href={base}
          className="mb-3 inline-flex min-h-8 items-center text-sm font-semibold text-link hover:underline max-sm:min-h-11"
        >
          ← {a.title}
        </Link>
        <Eyebrow className="mb-2">Marking</Eyebrow>
        <h1 className="break-words text-[clamp(1.7rem,3vw,2.6rem)] font-bold leading-[1.12] tracking-[-0.04em] text-ink">
          {student?.name ?? "Student"}
        </h1>
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-ink-2">
          {handedIn && s.submittedAt ? (
            <span>
              Handed in {formatWhen(s.submittedAt, user.timezone)} ·{" "}
              <span suppressHydrationWarning>
                {relativeTime(s.submittedAt, now)}
              </span>
            </span>
          ) : (
            <span>Not handed in yet</span>
          )}
          {s.late && <Badge tone="risk">Late</Badge>}
          {graded ? (
            <Badge tone="good">
              ✓ Marked {s.score}/{s.maxScore}
            </Badge>
          ) : handedIn ? (
            <Badge tone="warn">● Needs marking</Badge>
          ) : (
            <Badge tone="brand">◐ In progress</Badge>
          )}
        </p>
      </header>

      {sp.returned && (
        <div
          role="status"
          className="mb-4 rounded-xl border border-good/40 bg-good-soft px-4 py-3 text-sm font-semibold text-good"
        >
          ✓ Graded work returned. Here is the next one to mark.
        </div>
      )}

      <nav
        aria-label="Submissions"
        className="mb-6 flex flex-wrap items-center gap-2"
      >
        {prev ? (
          <Link
            href={subHref(prev)}
            className={navLink}
            aria-label={`Previous: ${prev.name}`}
          >
            ← <span className="ml-1 max-w-32 truncate">{prev.name}</span>
          </Link>
        ) : (
          <span
            className={cn(navLink, "pointer-events-none opacity-40")}
            aria-hidden
          >
            ←
          </span>
        )}
        {following ? (
          <Link
            href={subHref(following)}
            className={navLink}
            aria-label={`Next: ${following.name}`}
          >
            <span className="mr-1 max-w-32 truncate">{following.name}</span> →
          </Link>
        ) : (
          <span
            className={cn(navLink, "pointer-events-none opacity-40")}
            aria-hidden
          >
            →
          </span>
        )}
        {idx >= 0 && (
          <span className="tabular text-sm text-ink-2">
            {idx + 1} of {order.length} handed in
          </span>
        )}
        {nextUnmarked && (
          <Link
            href={subHref(nextUnmarked)}
            className={cn(buttonClass("secondary", "md"), "ml-auto")}
          >
            Next to mark: {nextUnmarked.name} ({waiting.length} waiting)
          </Link>
        )}
      </nav>

      {!handedIn ? (
        <Banner
          tone="warn"
          title={`${student?.name ?? "This student"} hasn't handed this in yet`}
        >
          You can mark it once they hand it in.{" "}
          <Link
            href={base}
            className="font-semibold underline underline-offset-2"
          >
            Back to the class list
          </Link>
        </Banner>
      ) : (
        <MarkingForm
          // Fresh state per submission when moving between students.
          key={s.id}
          submissionId={s.id}
          assignmentId={a.id}
          items={items}
          graded={graded}
          initialFeedback={s.teacherFeedback ?? ""}
          feedbackFiles={sub.feedbackFiles.map((f) => ({
            id: f.id,
            name: f.name,
            size: f.size,
          }))}
          nextHref={nextUnmarked ? subHref(nextUnmarked) : null}
          nextName={nextUnmarked?.name ?? null}
        />
      )}
    </>
  );
}
