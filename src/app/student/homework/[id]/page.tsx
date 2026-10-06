import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, ChevronLeft, Clock, X } from "lucide-react";
import { dueText, HomeworkStatusChip } from "@/components/student/labels";
import { HomeworkForm, type HomeworkFormItem } from "@/components/student/homework-form";
import { Badge, Banner, Card, CardBody, CardHeader } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { getCurriculum, studentContext } from "@/server/context";
import { NotFoundError } from "@/services/types";
import { getHomeworkDetail } from "@/services/student-views";

export const metadata: Metadata = { title: "Homework" };

const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

type Detail = Awaited<ReturnType<typeof getHomeworkDetail>>;

export default async function HomeworkDetailPage({ params }: PageProps<"/student/homework/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { user, actor, db, now } = await studentContext();
  const c = await getCurriculum();
  let hw: Detail;
  try {
    hw = await getHomeworkDetail(db, actor, id, { c, now: new Date(now) });
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const { assignment: a, submission: sub } = hw;
  const submitted = !!sub && sub.status !== "in_progress";
  const status = sub ? (sub.status === "in_progress" ? "in_progress" : sub.status) : "not_started";
  const closed = a.overdue && !a.policies.allowLate;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/student/homework" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand hover:underline sm:min-h-0">
        <ChevronLeft className="size-4" aria-hidden /> Homework
      </Link>
      <header className="space-y-2">
        <h1 className="font-[family-name:var(--font-display)] text-3xl leading-tight tracking-tight text-ink">{a.title}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
          <HomeworkStatusChip status={status} />
          {!submitted && a.overdue && <Badge tone="risk">Overdue</Badge>}
          {sub?.late && <Badge tone="warn">Submitted late</Badge>}
          <span className="inline-flex items-center gap-1">
            <Clock className="size-4" aria-hidden /> Due {formatDateTime(a.dueAt, user.timezone)}
            {!submitted && ` (${dueText(a.dueAt, now)})`}
          </span>
        </div>
      </header>

      {submitted ? <Results hw={hw} timezone={user.timezone} /> : (
        <>
          {a.instructions && (
            <Card aria-labelledby="instr-h">
              <CardHeader id="instr-h" title="Instructions" />
              <CardBody>
                <p className="whitespace-pre-line text-ink">{a.instructions}</p>
              </CardBody>
            </Card>
          )}
          {a.overdue && a.policies.allowLate && (
            <Banner tone="warn" title="This is past its due date">
              You can still hand it in. It will be marked as late.
            </Banner>
          )}
          <p className="text-sm text-ink-2">Your answers save as you go. Multiple-choice items are marked when you submit.</p>
          <HomeworkForm
            assignmentId={a.id}
            items={hw.items.map<HomeworkFormItem>((i) => ({ id: i.id, kind: i.kind, points: i.points, prompt: i.prompt, options: i.options, answer: i.answer }))}
            canSubmit={!closed}
            blockedReason={closed ? "The due date has passed and this homework doesn't accept late work. Talk to your teacher." : undefined}
          />
        </>
      )}
    </div>
  );
}

function Results({ hw, timezone }: { hw: Detail; timezone: string }) {
  const { assignment: a, submission: sub, items, reveal, objectives } = hw;
  const graded = sub?.status === "graded";
  const mcqItems = items.filter((i) => i.kind === "mcq");
  const mcqScore = mcqItems.reduce((s, i) => s + (i.result?.pointsAwarded ?? 0), 0);
  const mcqMax = mcqItems.reduce((s, i) => s + i.points, 0);
  const revealNote =
    a.policies.showAnswers === "after_due"
      ? `Correct answers and explanations appear after the due date (${formatDateTime(a.dueAt, timezone)}).`
      : a.policies.showAnswers === "never"
        ? "Your teacher isn't sharing the answer key for this homework."
        : null;

  return (
    <div className="space-y-5">
      <section aria-labelledby="score-h" className="rounded-[var(--radius-card)] border border-border bg-surface p-5">
        <h2 id="score-h" className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-2">
          {graded ? "Score" : "Submitted"}
        </h2>
        {graded && sub?.score != null && sub.maxScore ? (
          <p className="mt-1 font-[family-name:var(--font-display)] text-4xl text-ink">
            <span className="tabular">
              {sub.score}/{sub.maxScore}
            </span>{" "}
            <span className="tabular text-xl text-ink-2">{Math.round((sub.score / sub.maxScore) * 100)}%</span>
          </p>
        ) : (
          <p className="mt-1 text-ink">
            Multiple choice: <span className="tabular font-semibold">{mcqScore}/{mcqMax}</span>. Your teacher will mark the written answers and return the
            final score.
          </p>
        )}
        {sub?.submittedAt && <p className="mt-1 text-sm text-ink-2">Handed in {formatDateTime(sub.submittedAt, timezone)}</p>}
      </section>

      {sub?.teacherFeedback && (
        <Card aria-labelledby="fb-h">
          <CardHeader id="fb-h" title="Feedback from your teacher" />
          <CardBody>
            <p className="whitespace-pre-line text-ink">{sub.teacherFeedback}</p>
          </CardBody>
        </Card>
      )}

      {!reveal && revealNote && <Banner tone="neutral" title="Answer key">{revealNote}</Banner>}

      <ol className="space-y-3" aria-label="Your answers">
        {items.map((it, n) => {
          const r = it.result;
          const pending = r?.pointsAwarded == null;
          const chosen = it.options?.find((o) => o.key === it.answer.chosenKey);
          const obj = objectives[it.id];
          return (
            <li key={it.id} className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <p className="text-ink">
                  <span className="mr-2 text-sm font-semibold text-ink-2">Q{n + 1}.</span>
                  {it.prompt}
                </p>
                <p className="tabular shrink-0 text-sm font-medium text-ink">
                  {pending ? "–" : r!.pointsAwarded}/{it.points}
                </p>
              </div>
              <div className="mt-3 space-y-2 text-sm">
                {it.kind === "mcq" ? (
                  <p className="text-ink-2">
                    Your answer: <span className="text-ink">{chosen ? `${chosen.key}. ${chosen.text}` : "No answer"}</span>
                  </p>
                ) : (
                  <div>
                    <p className="text-ink-2">Your answer:</p>
                    <p className="mt-1 whitespace-pre-line rounded-lg bg-surface-2 p-3 text-ink">{it.answer.textAnswer || "No answer"}</p>
                  </div>
                )}
                {pending ? (
                  <p className="flex items-center gap-1.5 font-medium text-ink-2">
                    <Clock className="size-4" aria-hidden /> Awaiting your teacher
                  </p>
                ) : (
                  <p className={cn("flex items-center gap-1.5 font-medium", r!.correct ? "text-good" : "text-risk")}>
                    {r!.correct ? <Check className="size-4" aria-hidden /> : <X className="size-4" aria-hidden />}
                    {r!.correct ? "Correct" : it.kind === "mcq" ? "Incorrect" : "Not full marks"}
                  </p>
                )}
                {r?.feedback && <p className="rounded-lg border-l-4 border-l-brand bg-brand-soft/60 px-3 py-2 text-ink">{r.feedback}</p>}
                {it.reveal && (
                  <div className="rounded-lg bg-surface-2 p-3">
                    <p className="font-medium text-ink">Correct answer: {it.reveal.correctKey}</p>
                    <p className="mt-1 text-ink-2">{it.reveal.explanation}</p>
                  </div>
                )}
                {obj && (
                  <Link href={`/student/map/${obj.losId}`} className="flex min-h-11 w-fit items-center text-sm font-medium text-brand hover:underline sm:min-h-0">
                    Review {obj.code}
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
