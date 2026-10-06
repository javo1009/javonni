import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { dueText, PlanStatePill } from "@/components/student/labels";
import { LogTime } from "@/components/student/log-time";
import { TaskList } from "@/components/student/task-row";
import { ButtonLink, Card, CardBody, CardHeader, EmptyState, ProgressBar } from "@/components/ui";
import { ReadinessBand } from "@/components/viz/readiness";
import { formatMinutes } from "@/domain/assessment";
import { cn } from "@/lib/cn";
import { formatDayLong, hours } from "@/lib/format";
import { getCurriculum, studentContext } from "@/server/context";
import { getTodayView } from "@/services/student-views";

export const metadata: Metadata = { title: "Today" };

function greeting(timezone: string, now: number) {
  let h = 12;
  try {
    h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: timezone }).format(now));
  } catch {}
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default async function TodayPage() {
  const { user, actor, db, today, now } = await studentContext();
  const c = await getCurriculum();
  const v = await getTodayView(db, actor, { today, nowMs: now, c });
  if (!v) redirect("/student/onboarding");

  const firstName = user.name.split(" ")[0];
  const todo = v.todayTasks.filter((t) => t.status === "todo");
  const doneMin = v.todayTasks.filter((t) => t.status === "done").reduce((s, t) => s + (t.actualMinutes ?? t.minutes), 0);
  const weekPct = v.week.planned > 0 ? Math.round((v.week.done / v.week.planned) * 100) : 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-ink-2">{formatDayLong(today)}</p>
        <h1 className="font-[family-name:var(--font-display)] text-3xl leading-tight tracking-tight text-ink sm:text-[2.1rem]">
          {greeting(user.timezone, now)}, {firstName}
        </h1>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <PlanStatePill state={v.assessment.state} deltaMinutes={v.assessment.deltaMinutes} />
          {(v.assessment.state === "behind" || v.assessment.state === "at_risk") && (
            <Link href="/student/plan#catch-up" className="text-sm font-medium text-brand hover:underline">
              See ways to catch up
            </Link>
          )}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          <section aria-labelledby="today-h">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h2 id="today-h" className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-2">
                Today · <span className="tabular">{formatMinutes(v.todayMinutes)}</span>
              </h2>
              {v.todayTasks.length > 0 && (
                <p className="tabular text-sm text-ink-2">
                  {todo.length === 0 ? "All done for today" : `${formatMinutes(doneMin)} done`}
                </p>
              )}
            </div>
            {v.todayTasks.length > 0 ? (
              <TaskList tasks={v.todayTasks} label="Today's tasks" />
            ) : (
              <EmptyState
                title="Nothing scheduled today"
                action={
                  <ButtonLink href="/student/practice/session?scope=mixed" variant="secondary">
                    Do a quick mixed set
                  </ButtonLink>
                }
              >
                It&apos;s a rest day in your plan. A short practice set keeps things fresh if you have time.
              </EmptyState>
            )}
          </section>

          {v.overdue.length > 0 && (
            <section aria-labelledby="carry-h">
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <h2 id="carry-h" className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-2">
                  Carried over · {v.overdueCount}
                </h2>
                <Link href="/student/plan" className="text-sm font-medium text-brand hover:underline">
                  Open plan
                </Link>
              </div>
              <p className="mb-2 text-sm text-ink-2">
                Earlier tasks that are still open. Do them when you can, skip what you don&apos;t need, or tick off work you already did.
              </p>
              <TaskList tasks={v.overdue} showDate overdue label="Carried-over tasks" />
              {v.overdueCount > v.overdue.length && (
                <p className="mt-2 text-sm text-ink-2">
                  And {v.overdueCount - v.overdue.length} more in your plan.
                </p>
              )}
            </section>
          )}

          <LogTime today={today} />
        </div>

        <aside className="min-w-0 space-y-4" aria-label="Progress">
          <Card>
            <CardBody className="space-y-4 pt-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-ink-2">Exam</p>
                <p className="mt-1 font-[family-name:var(--font-display)] text-2xl text-ink">
                  <span className="tabular">{v.daysToExam}</span> {v.daysToExam === 1 ? "day" : "days"} to go
                </p>
                <p className="text-sm text-ink-2">{formatDayLong(v.examDate)}</p>
              </div>
              <ReadinessBand r={v.readiness} trend={v.trend.length > 1 ? v.trend : undefined} />
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-ink-2">Coverage</p>
                <p className="tabular mt-1 text-ink">
                  <span className="text-lg font-semibold">{v.coverage.covered}</span> of {v.coverage.total} objectives started
                </p>
                <p className="tabular text-sm text-ink-2">{v.coverage.proficient} proficient</p>
              </div>
            </CardBody>
          </Card>

          <Card aria-labelledby="week-h">
            <CardHeader id="week-h" title="This week" />
            <CardBody>
              <p className="tabular mb-2 text-ink">
                <span className="text-lg font-semibold">{hours(v.week.done)}</span> of {hours(v.week.planned)} planned
              </p>
              <ProgressBar value={v.week.done} max={v.week.planned} label={`This week: ${weekPct}% of planned study time`} />
            </CardBody>
          </Card>

          <Card aria-labelledby="due-h">
            <CardHeader id="due-h" title="Due soon" action={<Link href="/student/homework" className="text-sm font-medium text-brand hover:underline">All</Link>} />
            <CardBody>
              {v.homework.length === 0 ? (
                <p className="text-sm text-ink-2">No homework due in the next week.</p>
              ) : (
                <ul className="space-y-1">
                  {v.homework.map((h) => (
                    <li key={h.id}>
                      <Link href={`/student/homework/${h.id}`} className="-mx-2 flex min-h-11 items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink">{h.title}</span>
                          <span className={cn("block text-xs", h.overdue ? "font-medium text-risk" : "text-ink-2")}>
                            {dueText(h.dueAt, now)} · {h.itemCount} items
                          </span>
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-ink-3" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card aria-labelledby="att-h">
            <CardHeader id="att-h" title="Needs attention" />
            <CardBody>
              {v.attention.length === 0 ? (
                <p className="text-sm text-ink-2">Nothing flagged. Keep following the plan.</p>
              ) : (
                <ul className="space-y-1">
                  {v.attention.map((a) => (
                    <li key={a.key}>
                      <Link href={a.href} className="-mx-2 flex min-h-11 items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2">
                        <span aria-hidden className={cn("size-2 shrink-0 rounded-full", a.tone === "warn" ? "bg-warn" : "bg-ink-3")} />
                        <span className="min-w-0 flex-1 text-ink">{a.text}</span>
                        <span className="shrink-0 text-xs font-medium text-brand">Practise</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </aside>
      </div>
    </div>
  );
}
