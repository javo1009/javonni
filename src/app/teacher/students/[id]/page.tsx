import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, ClipboardCheck, PencilLine } from "lucide-react";
import { Card, CardBody, CardHeader, EmptyState, PageHeader, Stat, StatusPill, TableWrap, buttonClass, td, th } from "@/components/ui";
import { BurnUp } from "@/components/viz/burn-up";
import { ReadinessBand } from "@/components/viz/readiness";
import { AdherenceChart, TopicMasteryBars } from "@/components/teacher/charts";
import { AlertBadge, HomeworkStatus, LateBadge, scoreText } from "@/components/teacher/labels";
import { formatDateTime, formatDay, formatMinutes, formatShortDate, hours, pct } from "@/lib/format";
import { teacherContext } from "@/server/context";
import { getStudent360 } from "@/services/teacher-views";
import { orNotFound } from "../../_lib/guard";

export const metadata: Metadata = { title: "Student" };

const PLAN_STATE: Record<string, { label: string; tone: "good" | "brand" | "warn" | "risk" }> = {
  ahead: { label: "Ahead of plan", tone: "good" },
  on_track: { label: "On track", tone: "good" },
  behind: { label: "Behind plan", tone: "warn" },
  at_risk: { label: "At risk", tone: "risk" },
};

const ACTIVITY_ICON = { study: BookOpen, practice: PencilLine, homework: ClipboardCheck } as const;
const ACTIVITY_LABEL = { study: "Study", practice: "Practice", homework: "Homework" } as const;

export default async function Student360({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { actor, db, today, now, user } = await teacherContext();
  const v = await orNotFound(id, (sid) => getStudent360(db, actor, sid, today, now));
  const c = v.curriculum;
  const adherencePct = v.adherence.planned > 0 ? Math.round((Math.min(v.adherence.done, v.adherence.planned) / v.adherence.planned) * 100) : null;
  const plan = v.assessment ? PLAN_STATE[v.assessment.state] : null;

  const topicRows = c.topics.map((t) => {
    const st = v.snapshot.topicStats.get(t.id);
    const tr = v.snapshot.readiness.topics.find((x) => x.topicId === t.id);
    return {
      id: t.id,
      code: t.code,
      name: t.name,
      weight: `${t.weightMin}–${t.weightMax}%`,
      mastery: st?.mastery ?? 0,
      coverage: st?.coveragePct ?? 0,
      hasEvidence: (tr?.attemptedShare ?? 0) > 0,
      belowFloor: st?.belowFloor ?? false,
    };
  });

  let burnSummary = "";
  if (v.burnUp) {
    const gap = Math.round((v.burnUp.studiedToDate - v.burnUp.plannedToDate) / 6) / 10;
    burnSummary = `Planned ${hours(v.burnUp.plannedToDate)} by today, studied ${hours(v.burnUp.studiedToDate)} (${gap >= 0 ? `${gap} h ahead` : `${-gap} h behind`}). ${hours(v.burnUp.totalPlanned)} planned in total to the exam on ${formatShortDate(v.burnUp.examDate)}.`;
  }

  return (
    <>
      <PageHeader
        eyebrow={
          <span>
            Student{v.classes.length ? " · " : ""}
            {v.classes.map((cl, i) => (
              <span key={cl.id}>
                {i > 0 && ", "}
                <Link href={`/teacher/classes/${cl.id}`} className="hover:underline">
                  {cl.name}
                </Link>
              </span>
            ))}
          </span>
        }
        title={v.student.name}
        description={v.student.email}
        actions={
          <a href={`mailto:${encodeURIComponent(v.student.email)}?subject=${encodeURIComponent("Checking in")}`} className={buttonClass("secondary")}>
            Email {v.student.name.split(" ")[0]}
          </a>
        }
      />

      {v.alerts.length > 0 && (
        <Card className="mb-6 border-warn/40" aria-labelledby="alerts-h">
          <CardHeader id="alerts-h" title={`Alerts (${v.alerts.length})`} />
          <CardBody>
            <ul className="space-y-2">
              {v.alerts.map((a) => (
                <li key={a.kind} className="flex flex-wrap items-center gap-2 text-sm">
                  <AlertBadge kind={a.kind} severity={a.severity} />
                  <span className="text-ink">{a.evidence}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <Card className="mb-6">
        <CardBody className="grid gap-6 pt-5 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <ReadinessBand r={v.snapshot.readiness} trend={v.weeklyReadiness} />
          <Stat
            label="Plan adherence"
            value={adherencePct === null ? "—" : `${adherencePct}%`}
            hint={plan ? <StatusPill tone={plan.tone} label={plan.label} /> : "No active plan"}
            tone={adherencePct !== null && adherencePct < 60 ? "warn" : undefined}
          />
          <Stat label="Hours (7 days)" value={v.hours7d} hint={`Coverage ${pct(v.snapshot.coverage.coveragePct)} of LOS`} />
          <Stat label="Last active" value={v.lastActive ? formatShortDate(v.lastActive) : "Never"} hint={v.plan ? `Exam ${formatShortDate(v.plan.examDate)}` : undefined} />
        </CardBody>
      </Card>

      <Card className="mb-6" aria-labelledby="burn-h">
        <CardHeader id="burn-h" title="Plan burn-up" />
        <CardBody>
          {v.burnUp && v.burnUp.points.length > 1 ? (
            <BurnUp points={v.burnUp.points} today={today} summary={burnSummary} />
          ) : (
            <p className="text-sm text-ink-2">{v.student.name.split(" ")[0]} hasn&apos;t created a study plan yet.</p>
          )}
          {v.assessment && v.assessment.deltaMinutes < 0 && (
            <p className="mt-2 text-sm text-ink-2">Behind by {formatMinutes(-v.assessment.deltaMinutes)} of planned work.</p>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card aria-labelledby="mastery-h">
          <CardHeader
            id="mastery-h"
            title="Mastery by topic"
            subtitle={`${v.snapshot.coverage.proficient} proficient · ${v.snapshot.coverage.reviewDue} due for review · ${v.snapshot.coverage.covered} of ${v.snapshot.coverage.total} objectives covered`}
          />
          <CardBody>
            <TopicMasteryBars rows={topicRows} />
          </CardBody>
        </Card>
        <div className="space-y-6">
          <Card aria-labelledby="adh-h">
            <CardHeader id="adh-h" title="Planned vs studied · last 14 days" />
            <CardBody>
              <AdherenceChart days={v.daily} />
            </CardBody>
          </Card>
          <Card aria-labelledby="act-h">
            <CardHeader id="act-h" title="Recent activity · last 14 days" />
            <CardBody>
              {v.activity.length === 0 ? (
                <p className="text-sm text-ink-2">No activity in the last 14 days.</p>
              ) : (
                <ol className="space-y-2">
                  {v.activity.map((e, i) => {
                    const Icon = ACTIVITY_ICON[e.kind];
                    return (
                    <li key={i} className="grid grid-cols-[6.5rem_1fr] gap-3 text-sm">
                      <span className="tabular text-ink-2">{formatDay(e.date)}</span>
                      <span className="flex items-start gap-2 text-ink">
                        <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-3" />
                        <span className="sr-only">{ACTIVITY_LABEL[e.kind]}: </span>
                        <span>{e.text}</span>
                      </span>
                    </li>
                    );
                  })}
                </ol>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <section className="mt-6" aria-labelledby="hw-h">
        <h2 id="hw-h" className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-ink-2">
          Homework
        </h2>
        {v.homework.length === 0 ? (
          <EmptyState title="No homework assigned yet" />
        ) : (
          <TableWrap label="Homework history">
            <table className="relative w-full min-w-[40rem]">
              <caption className="sr-only">Homework history for {v.student.name}</caption>
              <thead className="border-b border-border">
                <tr>
                  <th scope="col" className={th}>Homework</th>
                  <th scope="col" className={th}>Due</th>
                  <th scope="col" className={th}>Status</th>
                  <th scope="col" className={`${th} text-right`}>Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {v.homework.map((h) => (
                  <tr key={h.id}>
                    <th scope="row" className={`${td} text-left font-medium`}>
                      <Link href={`/teacher/homework/${h.id}`} className="text-ink hover:underline">
                        {h.title}
                      </Link>
                      {v.classes.length > 1 && <span className="block text-xs font-normal text-ink-2">{h.className}</span>}
                    </th>
                    <td className={`${td} tabular`}>{formatDateTime(h.dueAt, user.timezone)}</td>
                    <td className={td}>
                      <span className="flex flex-wrap items-center gap-2">
                        <HomeworkStatus status={h.status} overdue={h.overdue} />
                        <LateBadge late={h.late} />
                        {h.status === "submitted" && h.submissionId && (
                          <Link href={`/teacher/homework/${h.id}/submissions/${h.submissionId}`} className="text-sm text-brand hover:underline">
                            Grade
                          </Link>
                        )}
                      </span>
                    </td>
                    <td className={`${td} tabular text-right`}>{scoreText(h.score, h.maxScore)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </section>

    </>
  );
}
