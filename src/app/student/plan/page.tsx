import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { deltaText, PlanStatePill } from "@/components/student/labels";
import { RecoveryOptions } from "@/components/student/recovery-options";
import { TaskList } from "@/components/student/task-row";
import { Badge, Banner, buttonClass, ButtonLink, Card, CardBody, CardHeader, PageHeader } from "@/components/ui";
import { BurnUp } from "@/components/viz/burn-up";
import { formatMinutes } from "@/domain/assessment";
import { addDays, diffDays, isValidDate, startOfWeek } from "@/domain/dates";
import { cn } from "@/lib/cn";
import { formatDay, formatShortDate, hours } from "@/lib/format";
import { getCurriculum, studentContext } from "@/server/context";
import { getPlanWeekView, type PhaseSpan } from "@/services/student-views";

export const metadata: Metadata = { title: "Plan" };

const PHASE_LABEL: Record<PhaseSpan["phase"], string> = { learn: "Learn", practice: "Practice", mock: "Mock exams" };
const PHASE_FILL: Record<PhaseSpan["phase"], string> = { learn: "bg-m-1", practice: "bg-m-2", mock: "bg-m-4" };

function PhaseStrip({ phases, today, start, exam }: { phases: PhaseSpan[]; today: string; start: string; exam: string }) {
  const total = Math.max(1, diffDays(start, exam) + 1);
  const todayPct = Math.min(100, Math.max(0, (diffDays(start, today) / total) * 100));
  return (
    <div>
      <div className="relative h-3 overflow-hidden rounded-full bg-surface-2" aria-hidden>
        {phases.map((p) => (
          <div
            key={p.phase}
            className={cn("absolute inset-y-0 border-r-2 border-surface", PHASE_FILL[p.phase])}
            style={{ left: `${(diffDays(start, p.start) / total) * 100}%`, width: `${((diffDays(p.start, p.end) + 1) / total) * 100}%` }}
          />
        ))}
        {today >= start && today <= exam && <div className="absolute inset-y-0 w-0.5 bg-ink" style={{ left: `${todayPct}%` }} />}
      </div>
      <ol className="mt-3 grid gap-2 sm:grid-cols-3" aria-label="Plan phases">
        {phases.map((p) => {
          const now = today >= p.start && today <= p.end;
          return (
            <li key={p.phase} className={cn("rounded-lg border px-3 py-2", now ? "border-brand bg-brand-soft" : "border-border")}>
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                <span aria-hidden className={cn("size-2.5 rounded-sm ring-1 ring-inset ring-border-strong", PHASE_FILL[p.phase])} />
                {PHASE_LABEL[p.phase]}
                {now && <Badge tone="brand">Now</Badge>}
              </p>
              <p className="tabular mt-0.5 text-xs text-ink-2">
                {formatShortDate(p.start)} – {formatShortDate(p.end)} · {hours(p.minutes)}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default async function PlanPage({ searchParams }: PageProps<"/student/plan">) {
  const { actor, db, today } = await studentContext();
  const c = await getCurriculum();
  const sp = await searchParams;
  const raw = sp.week;
  const rebuilt = sp.rebuilt === "1";
  const weekParam = Array.isArray(raw) ? raw[0] : raw;
  const weekStart = startOfWeek(weekParam && isValidDate(weekParam) ? weekParam : today);

  const v = await getPlanWeekView(db, actor, { today, weekStart, c });
  if (!v) redirect("/student/onboarding");

  const firstWeek = startOfWeek(v.plan.startDate);
  const lastWeek = startOfWeek(v.plan.examDate);
  const prev = addDays(weekStart, -7);
  const next = addDays(weekStart, 7);
  const thisWeek = startOfWeek(today);
  const behind = v.assessment.state === "behind" || v.assessment.state === "at_risk";
  const weeklyTotal = v.plan.weeklyMinutes.reduce((s, m) => s + m, 0);
  const navBtn = buttonClass("secondary", "md", "max-sm:min-h-11 px-3");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Your plan"
        description={
          <>
            Exam on {formatDay(v.plan.examDate)} · {formatMinutes(weeklyTotal)} a week ·{" "}
            <PlanStatePill state={v.assessment.state} deltaMinutes={v.assessment.deltaMinutes} />
          </>
        }
        actions={
          <ButtonLink href="/student/onboarding" variant="secondary" className="max-sm:min-h-11">
            Rebuild plan
          </ButtonLink>
        }
      />

      {rebuilt && (
        <div role="status">
          <Banner tone="good" title="Your plan has been rebuilt from today">
            {v.plan.warnings.length > 0 ? (
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {v.plan.warnings.map((w) => (
                  <li key={w.code}>{w.message}</li>
                ))}
              </ul>
            ) : (
              "Everything you've finished is kept. Upcoming tasks now fit your week."
            )}
          </Banner>
        </div>
      )}

      {behind && (
        <section id="catch-up" aria-labelledby="catch-h" className="scroll-mt-20 rounded-[var(--radius-card)] border border-border bg-warn-soft/50 p-4 sm:p-5">
          <h2 id="catch-h" className="font-semibold text-ink">
            You&apos;re {deltaText(v.assessment.deltaMinutes)} plan. Here are ways to catch up.
          </h2>
          <p className="mt-1 mb-4 text-sm text-ink-2">Pick the one that suits your week. Nothing changes until you choose.</p>
          <RecoveryOptions options={v.assessment.options} />
        </section>
      )}

      <Card aria-labelledby="burn-h">
        <CardHeader id="burn-h" title="Progress to exam day" />
        <CardBody className="space-y-5">
          <BurnUp
            points={v.burnUp}
            today={today}
            summary={`You've studied ${hours(v.totals.studied)} against ${hours(v.totals.due)} scheduled up to today, with ${hours(v.totals.planned)} planned in total by exam day.`}
          />
          <PhaseStrip phases={v.phases} today={today} start={v.plan.startDate} exam={v.plan.examDate} />
        </CardBody>
      </Card>

      <section aria-labelledby="week-h" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="week-h" className="text-lg font-semibold text-ink">
              Week of {formatDay(weekStart)}
            </h2>
            <p className="tabular text-sm text-ink-2">
              {formatMinutes(v.weekDone)} done of {formatMinutes(v.weekPlanned)} planned
            </p>
          </div>
          <nav aria-label="Weeks" className="flex items-center gap-1.5">
            {weekStart > firstWeek ? (
              <Link href={`/student/plan?week=${prev}`} className={navBtn} aria-label="Previous week">
                <ChevronLeft className="size-4" aria-hidden />
              </Link>
            ) : (
              <span className={cn(navBtn, "pointer-events-none opacity-40")} aria-hidden>
                <ChevronLeft className="size-4" />
              </span>
            )}
            {weekStart !== thisWeek && (
              <Link href="/student/plan" className={navBtn}>
                This week
              </Link>
            )}
            {weekStart < lastWeek ? (
              <Link href={`/student/plan?week=${next}`} className={navBtn} aria-label="Next week">
                <ChevronRight className="size-4" aria-hidden />
              </Link>
            ) : (
              <span className={cn(navBtn, "pointer-events-none opacity-40")} aria-hidden>
                <ChevronRight className="size-4" />
              </span>
            )}
          </nav>
        </div>

        {weekStart < firstWeek || weekStart > lastWeek ? (
          <p className="rounded-[var(--radius-card)] border border-dashed border-border-strong bg-surface px-4 py-6 text-center text-sm text-ink-2">
            This week is outside your plan ({formatDay(v.plan.startDate)} to {formatDay(v.plan.examDate)}).
          </p>
        ) : (
          <ol className="space-y-4">
            {v.days.map((d) => (
              <li key={d.date} aria-labelledby={`d-${d.date}`}>
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <h3 id={`d-${d.date}`} className={cn("text-sm font-semibold", d.isToday ? "text-brand" : "text-ink")}>
                    {formatDay(d.date)}
                  </h3>
                  {d.isToday && <Badge tone="brand">Today</Badge>}
                  {d.isBlackout && <Badge>Day off</Badge>}
                  {d.date === v.plan.examDate && <Badge tone="warn">Exam day</Badge>}
                  {d.tasks.length > 0 && (
                    <span className="tabular text-xs text-ink-2">{formatMinutes(d.tasks.reduce((s, t) => s + t.minutes, 0))}</span>
                  )}
                </div>
                {d.tasks.length > 0 ? (
                  <TaskList tasks={d.tasks} label={`Tasks for ${formatDay(d.date)}`} />
                ) : (
                  <p className="rounded-lg border border-dashed border-border px-3 py-2.5 text-sm text-ink-3">
                    {d.isBlackout ? "Day off. Nothing scheduled." : d.date === v.plan.examDate ? "Good luck!" : "Rest day."}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
