import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Banner, ButtonLink, Card, CardBody, CardHeader, EmptyState, PageHeader, Stat, TableWrap, buttonClass, td, th } from "@/components/ui";
import { ChoiceDistribution, Funnel } from "@/components/teacher/charts";
import { HomeworkStatus, LateBadge, scoreText } from "@/components/teacher/labels";
import { PublishButton } from "@/components/teacher/publish-button";
import { formatDateTime, plural } from "@/lib/format";
import { teacherContext } from "@/server/context";
import { getRoster } from "@/services/classes";
import { getAssignmentForTeacher } from "@/services/homework";
import { orNotFound } from "../../_lib/guard";

export const metadata: Metadata = { title: "Homework detail" };

const SHOW_ANSWERS = { after_due: "after the due date", immediately: "right after submitting", never: "never" } as const;

/** The most-chosen wrong option, if enough students picked it to be worth discussing. */
function commonWrong(counts: Record<string, number>, correctKey: string): string | null {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const wrong = Object.entries(counts)
    .filter(([k]) => k !== correctKey)
    .sort((a, b) => b[1] - a[1])[0];
  if (!wrong || wrong[1] < 2 || wrong[1] / Math.max(1, total) < 0.25) return null;
  return wrong[0];
}

export default async function AssignmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ assigned?: string; saved?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { actor, db, user, now } = await teacherContext();
  const { detail, roster } = await orNotFound(id, async (aid) => {
    const detail = await getAssignmentForTeacher(db, actor, aid);
    const roster = await getRoster(db, actor, detail.assignment.classId);
    return { detail, roster };
  });
  const { assignment: a, items, students } = detail;
  const draft = a.status === "draft";
  const pastDue = a.dueAt.getTime() < now;
  const started = students.filter((s) => s.status !== "not_started").length;
  const submitted = students.filter((s) => s.status === "submitted" || s.status === "graded").length;
  const graded = students.filter((s) => s.status === "graded").length;
  const toGrade = students.filter((s) => s.status === "submitted" && s.submissionId);
  const late = students.filter((s) => s.late).length;
  const scored = students.filter((s) => s.status === "graded" && s.maxScore);
  const avg = scored.length ? Math.round((scored.reduce((sum, s) => sum + s.score! / s.maxScore!, 0) / scored.length) * 100) : null;
  const notStarted = students.filter((s) => s.status === "not_started");
  const emailById = new Map(roster.map((r) => [r.id, r.email]));
  const joinedById = new Map(roster.map((r) => [r.id, r.joinedAt]));
  // Mirrors homeworkStats: work due before a student joined doesn't count against them.
  const joinedAfterDue = (sid: string) => (joinedById.get(sid)?.getTime() ?? 0) > a.dueAt.getTime();
  const reminderHref = `mailto:?bcc=${encodeURIComponent(notStarted.map((s) => emailById.get(s.id)).filter(Boolean).join(","))}&subject=${encodeURIComponent(`Reminder: ${a.title}`)}&body=${encodeURIComponent(`Hi,\n\nA reminder that "${a.title}" is due ${formatDateTime(a.dueAt, user.timezone)}. You'll find it in your Homework inbox.\n\n${user.name}`)}`;
  const totalPoints = items.reduce((s, i) => s + i.item.points, 0);

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/teacher/homework" className="hover:underline">
            ← Homework
          </Link>
        }
        title={a.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {draft ? <Badge>Draft</Badge> : <Badge tone={pastDue ? "neutral" : "brand"}>{pastDue ? "Assigned · past due" : "Assigned · open"}</Badge>}
            <span>
              Due {formatDateTime(a.dueAt, user.timezone)} · {plural(items.length, "item")} · {totalPoints} pts · answers shown {SHOW_ANSWERS[a.policies.showAnswers]} ·{" "}
              {a.policies.allowLate ? "late work accepted" : "no late work"} · {a.target.kind === "class" ? "whole class" : plural(students.length, "chosen student")}
            </span>
          </span>
        }
        actions={
          draft ? (
            <PublishButton assignmentId={a.id} />
          ) : toGrade.length ? (
            <ButtonLink href={`/teacher/homework/${a.id}/submissions/${toGrade[0].submissionId}`}>Grade next ({toGrade.length})</ButtonLink>
          ) : undefined
        }
      />

      {sp.assigned && !draft && (
        <div className="mb-6">
          <Banner tone="good" title="Homework assigned">
            It&apos;s now in the homework inbox of {plural(students.length, "student")}.
          </Banner>
        </div>
      )}
      {sp.saved && draft && (
        <div className="mb-6">
          <Banner tone="brand" title="Saved as a draft">
            Only you can see it. Assign it when you&apos;re ready.
          </Banner>
        </div>
      )}
      {a.instructions && (
        <p className="mb-6 max-w-3xl whitespace-pre-line rounded-lg border border-border bg-surface px-4 py-3 text-sm text-ink">{a.instructions}</p>
      )}

      {!draft && (
        <div className="mb-6 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <Card aria-labelledby="funnel-h">
            <CardHeader id="funnel-h" title="Completion" />
            <CardBody>
              <Funnel
                steps={[
                  { label: "Targeted", value: students.length },
                  { label: "Started", value: started },
                  { label: "Submitted", value: submitted },
                  { label: "Graded", value: graded },
                ]}
              />
            </CardBody>
          </Card>
          <Card>
            <CardBody className="grid grid-cols-2 gap-4 pt-5">
              <Stat label="Avg score" value={avg === null ? "—" : `${avg}%`} hint={scored.length ? `${plural(scored.length, "graded submission")}` : "Nothing graded yet"} />
              <Stat label="Late" value={late} />
              <Stat label="To grade" value={toGrade.length} tone={toGrade.length ? "warn" : undefined} />
              <Stat label="Not started" value={notStarted.length} />
              {notStarted.length > 0 && !pastDue && (
                <a href={reminderHref} className={buttonClass("secondary", "sm", "col-span-2")}>
                  Email a reminder to {plural(notStarted.length, "non-starter")}
                </a>
              )}
            </CardBody>
          </Card>
        </div>
      )}

      <section aria-labelledby="students-h" className="mb-8">
        <h2 id="students-h" className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-ink-2">
          Students
        </h2>
        {students.length === 0 ? (
          <EmptyState title="No students targeted">Students who join the class later will get whole-class homework automatically.</EmptyState>
        ) : (
          <TableWrap label="Student submissions">
            <table className="relative w-full min-w-[44rem]">
              <caption className="sr-only">Submission status per student</caption>
              <thead className="border-b border-border">
                <tr>
                  <th scope="col" className={th}>Student</th>
                  <th scope="col" className={th}>Status</th>
                  <th scope="col" className={th}>Submitted</th>
                  <th scope="col" className={`${th} text-right`}>Score</th>
                  <th scope="col" className={th}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {students.map((s) => (
                  <tr key={s.id}>
                    <th scope="row" className={`${td} text-left font-medium`}>
                      <Link href={`/teacher/students/${s.id}`} className="text-ink hover:underline">
                        {s.name}
                      </Link>
                    </th>
                    <td className={td}>
                      <span className="flex flex-wrap items-center gap-2">
                        {s.status === "not_started" && joinedAfterDue(s.id) ? (
                          <span className="text-sm text-ink-2">Joined after due date</span>
                        ) : (
                          <HomeworkStatus status={s.status} overdue={!draft && pastDue && !s.submittedAt} />
                        )}
                        <LateBadge late={s.late} />
                      </span>
                    </td>
                    <td className={`${td} tabular`}>{s.submittedAt ? formatDateTime(s.submittedAt, user.timezone) : <span className="text-ink-3">—</span>}</td>
                    <td className={`${td} tabular text-right`}>{s.status === "graded" ? scoreText(s.score, s.maxScore) : <span className="text-ink-3">—</span>}</td>
                    <td className={`${td} text-right`}>
                      {s.submissionId && (s.status === "submitted" || s.status === "graded") && (
                        <Link
                          href={`/teacher/homework/${a.id}/submissions/${s.submissionId}`}
                          className={buttonClass(s.status === "submitted" ? "primary" : "ghost", "sm")}
                        >
                          {s.status === "submitted" ? "Grade" : "Review"}
                          <span className="sr-only"> {s.name}</span>
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </section>

      <section aria-labelledby="items-h">
        <h2 id="items-h" className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-ink-2">
          Questions{!draft && " · how the class answered"}
        </h2>
        <ol className="space-y-4">
          {items.map((it, i) => {
            const q = it.question;
            const wrongKey = q ? commonWrong(it.choiceCounts, q.correctKey) : null;
            return (
              <li key={it.item.id}>
                <Card>
                  <CardBody className="pt-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <p className="min-w-0 flex-1 text-sm text-ink">
                        <span className="mr-2 font-semibold text-ink-2">Q{i + 1}</span>
                        {q ? q.stem : it.item.prompt}
                      </p>
                      <span className="flex shrink-0 items-center gap-2">
                        <Badge>{it.item.kind === "mcq" ? "Multiple choice" : "Written"}</Badge>
                        <Badge>{plural(it.item.points, "pt")}</Badge>
                        {!draft && it.item.kind === "mcq" && (
                          <span className="tabular text-sm font-semibold text-ink">
                            {it.correctPct === null ? "No answers yet" : `${it.correctPct}% correct`}
                            {it.answered > 0 && <span className="font-normal text-ink-2"> · {it.answered} answered</span>}
                          </span>
                        )}
                        {!draft && it.item.kind === "text" && <span className="text-sm text-ink-2">{plural(it.answered, "answer")} graded</span>}
                      </span>
                    </div>
                    {q && (
                      <div className="mt-3">
                        {draft ? (
                          <ul className="space-y-1 text-sm">
                            {q.options.map((o) => (
                              <li key={o.key} className={o.key === q.correctKey ? "font-medium text-good" : "text-ink"}>
                                {o.key}. {o.text}
                                {o.key === q.correctKey && " ✓ correct"}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <ChoiceDistribution options={q.options} counts={it.choiceCounts} correctKey={q.correctKey} commonWrongKey={wrongKey} />
                        )}
                      </div>
                    )}
                  </CardBody>
                </Card>
              </li>
            );
          })}
        </ol>
      </section>
    </>
  );
}
