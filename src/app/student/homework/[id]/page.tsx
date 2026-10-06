import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock, Info, Paperclip } from "lucide-react";
import {
  Banner,
  Card,
  CardBody,
  CardHeader,
  Eyebrow,
  highlightPanel,
  ProgressBar,
} from "@/components/ui";
import {
  describeDue,
  formatDue,
  summarizeItems,
} from "@/components/homework/student/due";
import { FileLinks } from "@/components/homework/student/file-links";
import { ReviewItems } from "@/components/homework/student/review-items";
import { HomeworkStatus } from "@/components/homework/student/status";
import { HomeworkWorkspace } from "@/components/homework/student/workspace";
import { cn } from "@/lib/cn";
import { studentContext } from "@/server/context";
import {
  getAssignmentForStudent,
  type StudentHomeworkStatus,
} from "@/services/homework";
import { NotFoundError } from "@/services/types";

export const metadata: Metadata = { title: "Homework" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function HomeworkDetailPage({
  params,
}: PageProps<"/student/homework/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { actor, db, user, now: nowMs } = await studentContext();
  const now = new Date(nowMs);
  let data: Awaited<ReturnType<typeof getAssignmentForStudent>>;
  try {
    data = await getAssignmentForStudent(db, actor, id, now);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  const { assignment: a, submission: sub } = data;
  const status: StudentHomeworkStatus = !sub
    ? "not_started"
    : sub.status === "in_progress"
      ? "in_progress"
      : sub.status === "graded"
        ? "graded"
        : "submitted";
  const working = status === "not_started" || status === "in_progress";
  const due = describeDue(a.dueAt, now);
  const scorePct =
    sub?.score != null && sub.maxScore
      ? Math.round((sub.score / sub.maxScore) * 100)
      : null;
  const kinds = data.items.map((i) => i.kind);

  return (
    <div className="pb-10">
      <header className="pb-5 pt-6 sm:pt-8">
        <Link
          href="/student/homework"
          className="inline-flex h-9 items-center gap-1.5 rounded-md text-sm font-medium text-link hover:underline max-sm:h-11"
        >
          <ArrowLeft aria-hidden className="size-4" /> All homework
        </Link>
        <Eyebrow className="mb-2 mt-3">Homework</Eyebrow>
        <h1 className="text-[clamp(1.75rem,3.2vw,2.75rem)] font-bold leading-[1.12] tracking-[-0.045em] text-ink">
          {a.title}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-2">
          <HomeworkStatus
            status={status}
            overdue={working && due.overdue}
            late={sub?.late ?? false}
          />
          <span
            className={cn(
              "inline-flex items-center gap-1.5",
              working && due.overdue && "font-semibold text-risk",
            )}
          >
            <Clock aria-hidden className="size-4" />
            Due {formatDue(a.dueAt, user.timezone)}
            {working && <span>({due.label})</span>}
          </span>
          <span>{summarizeItems(kinds)}</span>
          {working && (
            <span>
              {a.policies.allowLate
                ? "Late work is accepted"
                : "No late work after the deadline"}
            </span>
          )}
        </div>
      </header>

      {working ? (
        <div className="space-y-5">
          {a.instructions.trim() && (
            <Card aria-labelledby="instructions">
              <CardHeader id="instructions" title="Instructions" />
              <CardBody>
                <p className="whitespace-pre-wrap text-ink">{a.instructions}</p>
              </CardBody>
            </Card>
          )}
          <Card aria-labelledby="handouts">
            <CardHeader
              id="handouts"
              title="Handout files"
              subtitle={
                data.attachments.length
                  ? "Download these, do the work offline, then upload your completed files below."
                  : undefined
              }
            />
            <CardBody>
              {data.attachments.length ? (
                <FileLinks files={data.attachments} label="Handout files" />
              ) : (
                <p className="flex items-center gap-2 text-sm text-ink-2">
                  <Paperclip aria-hidden className="size-4" /> There are no
                  handout files. Everything you need is in the instructions and
                  questions.
                </p>
              )}
            </CardBody>
          </Card>
          <HomeworkWorkspace
            assignmentId={a.id}
            title={a.title}
            dueAt={a.dueAt.toISOString()}
            serverNow={now.toISOString()}
            allowLate={a.policies.allowLate}
            timeZone={user.timezone}
            items={data.items.map((i) => ({
              id: i.id,
              kind: i.kind,
              points: i.points,
              prompt: i.prompt ?? "",
              options: i.options,
              answer: i.answer,
              files: i.files.map((f) => ({
                id: f.id,
                name: f.name,
                size: f.size,
              })),
            }))}
          />
        </div>
      ) : (
        <div className="space-y-5">
          {status === "graded" && sub ? (
            <section
              aria-label="Your mark"
              className={cn(
                "rounded-[var(--radius-card)] border p-5 shadow-[var(--shadow)] sm:p-6",
                highlightPanel,
              )}
            >
              <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
                <div>
                  <p className="text-sm font-semibold text-ink-2">Your mark</p>
                  <p className="tabular mt-1 text-5xl font-bold leading-none tracking-[-0.05em] text-ink">
                    {sub.score}
                    <span className="text-2xl font-semibold text-ink-2">
                      {" "}
                      / {sub.maxScore}
                    </span>
                  </p>
                </div>
                {scorePct !== null && (
                  <p className="tabular text-3xl font-bold tracking-[-0.04em] text-ink">
                    {scorePct}%
                  </p>
                )}
              </div>
              {scorePct !== null && (
                <ProgressBar
                  value={scorePct}
                  max={100}
                  label={`Score ${scorePct}%`}
                  className="mt-4"
                />
              )}
              {sub.submittedAt && (
                <p className="mt-3 text-sm text-ink-2">
                  Handed in {formatDue(sub.submittedAt, user.timezone)}
                  {sub.late ? " (late)" : ""}
                </p>
              )}
            </section>
          ) : (
            <Banner
              tone="brand"
              title="Handed in. Waiting for your teacher to mark it."
            >
              {sub?.submittedAt
                ? `You handed this in on ${formatDue(sub.submittedAt, user.timezone)}${sub.late ? ", after the deadline" : ""}. `
                : ""}
              You can&apos;t change it now. Your mark and feedback will appear
              here.
            </Banner>
          )}

          {status === "graded" && sub?.teacherFeedback && (
            <Card aria-labelledby="feedback">
              <CardHeader id="feedback" title="Feedback from your teacher" />
              <CardBody>
                <p className="whitespace-pre-wrap text-ink">
                  {sub.teacherFeedback}
                </p>
              </CardBody>
            </Card>
          )}
          {status === "graded" && sub && sub.feedbackFiles.length > 0 && (
            <Card aria-labelledby="feedback-files">
              <CardHeader
                id="feedback-files"
                title="Marked-up files"
                subtitle="Your teacher sent these back with comments."
              />
              <CardBody>
                <FileLinks
                  files={sub.feedbackFiles}
                  label="Feedback files from your teacher"
                />
              </CardBody>
            </Card>
          )}
          {data.attachments.length > 0 && (
            <Card aria-labelledby="handouts">
              <CardHeader id="handouts" title="Handout files" />
              <CardBody>
                <FileLinks files={data.attachments} label="Handout files" />
              </CardBody>
            </Card>
          )}

          <section aria-labelledby="your-work" className="space-y-3">
            <h2
              id="your-work"
              className="flex items-center gap-2 text-xl font-semibold tracking-tight text-ink"
            >
              {status === "graded"
                ? "Your work and marks"
                : "What you handed in"}
            </h2>
            {a.instructions.trim() && (
              <details className="rounded-xl border border-border bg-surface px-4 py-2.5 text-sm">
                <summary className="flex min-h-9 cursor-pointer items-center gap-2 font-medium text-ink max-sm:min-h-11">
                  <Info aria-hidden className="size-4 shrink-0 text-ink-2" />{" "}
                  Show the instructions
                </summary>
                <p className="whitespace-pre-wrap pb-2 pt-1 text-ink-2">
                  {a.instructions}
                </p>
              </details>
            )}
            <ReviewItems data={data} graded={status === "graded"} now={now} />
          </section>
        </div>
      )}
    </div>
  );
}
