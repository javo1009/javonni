import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AssignButton } from "@/components/homework/teacher/assign-button";
import { HandoutManager } from "@/components/homework/teacher/handout-manager";
import { markableOrder } from "@/components/homework/teacher/student-order";
import { StudentTable, type StudentRowData } from "@/components/homework/teacher/student-table";
import { formatWhen, PHASE_LABEL, PHASE_TONE, phaseOf, relativeTime } from "@/components/homework/teacher/time";
import { Badge, Banner, buttonClass, Card, CardBody, CardHeader, Eyebrow, Metric, ProgressBar, StatusPill } from "@/components/ui";
import { cn } from "@/lib/cn";
import { plural } from "@/lib/format";
import { teacherContext } from "@/server/context";
import { assertClassAccess } from "@/services/access";
import { getAssignmentForTeacher } from "@/services/homework";
import { ForbiddenError, NotFoundError } from "@/services/types";

export const metadata: Metadata = { title: "Homework · Ascent" };

export default async function HomeworkDetailPage({ params, searchParams }: PageProps<"/teacher/homework/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const { actor, db, user, now } = await teacherContext();

  let data;
  try {
    data = await getAssignmentForTeacher(db, actor, id);
  } catch (e) {
    if (e instanceof NotFoundError || e instanceof ForbiddenError) notFound();
    throw e;
  }
  const { assignment: a, items, students, attachments } = data;
  const cls = await assertClassAccess(db, actor, a.classId);
  const phase = phaseOf(a, now);
  const isDraft = a.status === "draft";
  const pastDue = a.dueAt.getTime() <= now;

  const rows: StudentRowData[] = students.map((s) => ({ ...s, submittedAt: s.submittedAt ? s.submittedAt.toISOString() : null }));
  const handedIn = students.filter((s) => s.status === "submitted" || s.status === "graded");
  const toMark = students.filter((s) => s.status === "submitted");
  const marked = students.filter((s) => s.status === "graded" && s.score !== null && s.maxScore);
  const avg = marked.length ? Math.round((marked.reduce((t, s) => t + s.score! / s.maxScore!, 0) / marked.length) * 100) : null;
  const late = handedIn.filter((s) => s.late).length;
  const next = markableOrder(students).find((s) => s.status === "submitted");
  const totalPoints = items.reduce((t, i) => t + i.item.points, 0);

  return (
    <>
      <header className="flex flex-col gap-4 pb-6 pt-8 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <Link href={`/teacher/homework?class=${a.classId}`} className="mb-3 inline-flex min-h-8 items-center text-sm font-semibold text-link hover:underline max-sm:min-h-11">
            ← All homework
          </Link>
          <Eyebrow className="mb-2">{cls.name}</Eyebrow>
          <h1 className="break-words text-[clamp(1.7rem,3vw,2.6rem)] font-bold leading-[1.12] tracking-[-0.04em] text-ink">{a.title}</h1>
          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-ink-2">
            <StatusPill tone={PHASE_TONE[phase]} label={PHASE_LABEL[phase]} />
            <span>
              {phase === "closed" ? "Was due" : "Due"} {formatWhen(a.dueAt, user.timezone)} · <span suppressHydrationWarning>{relativeTime(a.dueAt, now)}</span>
            </span>
            <span>{a.target.kind === "class" ? "Whole class" : "Chosen students"}</span>
            <span>{a.policies.allowLate ? "Late work accepted" : "No late work"}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2 sm:justify-end">
          {isDraft ? (
            <AssignButton assignmentId={a.id} disabledReason={pastDue ? "The due date has passed, so this can't be assigned." : undefined} />
          ) : (
            <>
              {next && (
                <Link href={`/teacher/homework/${a.id}/submissions/${next.submissionId}`} className={buttonClass("primary", "md")}>
                  Mark next ({toMark.length})
                </Link>
              )}
              {/* A plain link: the route returns a file, so Next shouldn't prefetch or client-navigate it. */}
              <a href={`/teacher/homework/${a.id}/export`} download className={buttonClass("secondary", "md")}>
                Export scores (CSV)
              </a>
            </>
          )}
        </div>
      </header>

      {sp.returned && (
        <div role="status" className="mb-6 rounded-xl border border-good/40 bg-good-soft px-4 py-3 text-sm font-semibold text-good">
          ✓ Graded work returned.{toMark.length === 0 && handedIn.length > 0 ? " Everything handed in so far is marked." : ""}
        </div>
      )}

      {isDraft && (
        <div className="mb-6 space-y-3">
          <Banner tone={pastDue ? "risk" : "warn"} title={pastDue ? "Draft with a due date in the past" : "Draft: students can't see this yet"}>
            {pastDue
              ? "The due date has already passed, so this draft can't be assigned. The due date can't be changed after saving; create a new homework with a later date and copy the handout across."
              : `Check the handout and items below, then assign it. ${attachments.length === 0 ? "You haven't attached a handout yet. " : ""}Once assigned, handout files can no longer be removed.`}
          </Banner>
        </div>
      )}

      {!isDraft && (
        <section aria-label="Progress" className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="Handed in"
            value={handedIn.length}
            unit={`of ${students.length}`}
            meter={students.length ? handedIn.length / students.length : 0}
            hint={students.length - handedIn.length > 0 ? `${plural(students.length - handedIn.length, "student")} still to hand in` : "Everyone has handed in"}
            primary
          />
          <Metric
            label="Needs marking"
            value={toMark.length}
            hint={toMark.length ? "Oldest hand-in first" : handedIn.length ? "All caught up" : "Nothing handed in yet"}
            className={toMark.length ? "border-warn/50" : undefined}
          />
          <Metric label="Average score" value={avg === null ? "—" : `${avg}%`} hint={marked.length ? `${plural(marked.length, "marked submission")}` : "Nothing marked yet"} />
          <Metric label="Late hand-ins" value={late} hint={a.policies.allowLate ? "Flagged in the table" : "Not accepted for this homework"} />
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
        <div className="min-w-0 space-y-6">
          <section id="students" aria-labelledby="students-h" className="scroll-mt-4 space-y-3">
            <h2 id="students-h" className="text-xl font-semibold tracking-tight text-ink">
              Students
            </h2>
            <StudentTable assignmentId={a.id} rows={rows} timeZone={user.timezone} isDraft={isDraft} />
          </section>

          <section aria-labelledby="items-h" className="space-y-3">
            <h2 id="items-h" className="text-xl font-semibold tracking-tight text-ink">
              What students hand in <span className="text-base font-medium text-ink-2">· {totalPoints} points</span>
            </h2>
            <ol className="space-y-3">
              {items.map(({ item, question, answered, correctPct, choiceCounts }, i) => {
                const totalChoices = Object.values(choiceCounts).reduce((s, n) => s + n, 0);
                return (
                  <li key={item.id}>
                    <Card>
                      <CardBody className="space-y-3 pt-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="tabular text-sm font-bold text-ink-2">{i + 1}.</span>
                          <Badge tone={item.kind === "file" ? "brand" : item.kind === "text" ? "neutral" : "good"}>
                            {item.kind === "file" ? "File upload" : item.kind === "text" ? "Written answer" : "Auto-marked"}
                          </Badge>
                          <span className="text-sm text-ink-2">{plural(item.points, "point")}</span>
                        </div>
                        <p className="whitespace-pre-wrap text-ink">{item.kind === "mcq" ? question?.stem : item.prompt}</p>
                        {item.kind === "mcq" && question ? (
                          <div className="space-y-2">
                            <p className="text-sm text-ink-2">
                              {answered === 0 ? "No answers yet." : (
                                <>
                                  <strong className="tabular text-ink">{correctPct}%</strong> correct · {plural(answered, "answer")}
                                </>
                              )}
                            </p>
                            {answered > 0 && <ProgressBar value={correctPct ?? 0} max={100} label={`Question ${i + 1}: percent correct`} />}
                            <ul className="space-y-1.5">
                              {question.options.map((o) => {
                                const n = choiceCounts[o.key] ?? 0;
                                const share = totalChoices ? n / totalChoices : 0;
                                const isCorrect = o.key === question.correctKey;
                                return (
                                  <li key={o.key} className="grid grid-cols-[minmax(0,1fr)_3.5rem] items-center gap-3 text-sm">
                                    <div className="relative min-w-0 overflow-hidden rounded-lg border border-border bg-surface-2 px-3 py-1.5">
                                      <span aria-hidden className={cn("absolute inset-y-0 left-0", isCorrect ? "bg-good-soft" : "bg-surface-3")} style={{ width: `${share * 100}%` }} />
                                      <span className={cn("relative block truncate", isCorrect ? "font-semibold text-good" : "text-ink")} title={o.text}>
                                        {o.key}. {o.text}
                                        {isCorrect && <span> (correct)</span>}
                                      </span>
                                    </div>
                                    <span className="tabular text-right text-ink-2">
                                      {n} <span className="sr-only">{plural(n, "student", "students")} chose {o.key}</span>
                                    </span>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        ) : (
                          <p className="text-sm text-ink-2">
                            {isDraft ? "Marked by you." : `${handedIn.length} of ${students.length} handed in · ${marked.length} marked`}
                          </p>
                        )}
                      </CardBody>
                    </Card>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>

        <aside className="space-y-6">
          <Card aria-labelledby="files-h">
            <CardHeader id="files-h" title="Handout files" subtitle="What students download to complete offline." />
            <CardBody>
              <HandoutManager assignmentId={a.id} files={attachments.map((f) => ({ id: f.id, name: f.name, size: f.size }))} isDraft={isDraft} />
            </CardBody>
          </Card>
          <Card aria-labelledby="instr-h">
            <CardHeader id="instr-h" title="Instructions" />
            <CardBody>
              {a.instructions.trim() ? <p className="whitespace-pre-wrap text-ink">{a.instructions}</p> : <p className="text-sm text-ink-2">No written instructions.</p>}
            </CardBody>
          </Card>
          <Card aria-labelledby="rules-h">
            <CardHeader id="rules-h" title="Rules" />
            <CardBody>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-2">Late work</dt>
                  <dd className="text-ink">{a.policies.allowLate ? "Accepted, flagged" : "Not accepted"}</dd>
                </div>
                {items.some((i) => i.item.kind === "mcq") && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-2">Correct answers shown</dt>
                    <dd className="text-ink">{{ never: "Never", after_due: "After the due date", immediately: "Right after hand-in" }[a.policies.showAnswers]}</dd>
                  </div>
                )}
              </dl>
            </CardBody>
          </Card>
        </aside>
      </div>
    </>
  );
}
