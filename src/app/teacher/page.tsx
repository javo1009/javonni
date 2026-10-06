import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Button, ButtonLink, Card, CardBody, CardHeader, EmptyState, PageHeader, Select, Stat } from "@/components/ui";
import { Heatmap } from "@/components/viz/heatmap";
import { MasteryLegend } from "@/components/viz/mastery";
import { Sparkline } from "@/components/viz/sparkline";
import { ClassSwitcher } from "@/components/teacher/class-switcher";
import { JoinCode } from "@/components/teacher/join-code";
import { AlertBadge, nudgeTemplate } from "@/components/teacher/labels";
import { Nudge } from "@/components/teacher/nudge";
import { heatRows, sortStudents } from "@/components/teacher/heat";
import { formatDateTime, formatShortDate, plural } from "@/lib/format";
import { teacherContext } from "@/server/context";
import { getCockpit } from "@/services/teacher-views";

export const metadata: Metadata = { title: "Cockpit" };

type Search = Promise<{ class?: string | string[]; sort?: string | string[] }>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function Cockpit({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const { actor, db, today, now, user } = await teacherContext();
  const { classes, overview, dueThisWeek, toGrade } = await getCockpit(db, actor, one(sp.class), today, now);

  if (!overview) {
    return (
      <>
        <PageHeader title="Cockpit" description="Who needs you today, how the class is doing, and what to teach next." />
        <EmptyState title="You don't have a class yet" action={<ButtonLink href="/teacher/classes#create">Create a class</ButtonLink>}>
          Create a class to get a join code. Students sign up with it, and their progress shows up here.
        </EmptyState>
      </>
    );
  }

  const { cls, curriculum: c, students, attention, kpis, topicAverages, teachNext } = overview;
  const byId = new Map(students.map((s) => [s.id, s]));
  const topicIdByCode = new Map(c.topics.map((t) => [t.code, t.id]));
  const sort = one(sp.sort);
  const sorted = sortStudents(students, sort, topicIdByCode);
  const weeks = students[0]?.weeklyReadiness.length ?? 0;
  const classTrend = Array.from({ length: weeks }, (_, i) => Math.round(students.reduce((s, x) => s + x.weeklyReadiness[i], 0) / Math.max(1, students.length)));
  const trendDelta = classTrend.length > 1 ? classTrend[classTrend.length - 1] - classTrend[0] : 0;
  const hoursAvg = students.length ? Math.round((students.reduce((s, x) => s + x.hours7d, 0) / students.length) * 10) / 10 : 0;
  const teachTopic = teachNext ? c.topics.find((t) => t.id === teachNext.topicId) : undefined;
  const classQuery = `class=${cls.id}`;

  return (
    <>
      <PageHeader
        eyebrow="Cockpit"
        title={cls.name}
        description={`${plural(kpis.total, "student")}${cls.examDate ? ` · exam ${formatShortDate(cls.examDate)}` : ""}`}
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <ClassSwitcher key={cls.id} classes={classes} current={cls.id} />
            <ButtonLink href={`/teacher/homework/new?${classQuery}`}>New homework</ButtonLink>
          </div>
        }
      />

      <Card className="mb-6">
        <CardBody className="pt-4">
          <JoinCode code={cls.joinCode} />
        </CardBody>
      </Card>

      {kpis.total === 0 ? (
        <EmptyState title="No students yet">
          Share the join code or sign-up link above. Students appear here as soon as they register.
        </EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <Card aria-labelledby="attention-h">
              <CardHeader
                id="attention-h"
                title={`Needs attention (${attention.length})`}
                subtitle={attention.length ? "Most urgent first. Each row shows why it was flagged." : undefined}
              />
              <CardBody>
                {attention.length === 0 ? (
                  <p className="text-sm text-ink-2">Nobody is flagged right now. Everyone has been active, is keeping to their plan and handing in homework.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {attention.map((alerts) => {
                      const s = byId.get(alerts[0].studentId)!;
                      return (
                        <li key={s.id} className="py-3 first:pt-0 last:pb-0">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <Link href={`/teacher/students/${s.id}`} className="font-medium text-ink hover:underline">
                                  {s.name}
                                </Link>
                                {alerts.map((a) => (
                                  <AlertBadge key={a.kind} kind={a.kind} severity={a.severity} />
                                ))}
                              </div>
                              <ul className="mt-1 space-y-0.5 text-sm text-ink-2">
                                {alerts.map((a) => (
                                  <li key={a.kind}>{a.evidence}</li>
                                ))}
                                <li className="text-xs text-ink-3">
                                  Last active {s.lastActive ? formatShortDate(s.lastActive) : "never"} · {s.hours7d} h this week
                                </li>
                              </ul>
                            </div>
                            <ButtonLink href={`/teacher/students/${s.id}`} variant="ghost" size="sm">
                              Open<span className="sr-only"> {s.name}</span>
                            </ButtonLink>
                          </div>
                          <div className="mt-2">
                            <Nudge
                              name={s.name}
                              email={s.email}
                              subject={`Checking in · ${cls.name}`}
                              template={nudgeTemplate(s.name.split(" ")[0], alerts.map((a) => a.kind), user.name)}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardBody>
            </Card>

            <div className="space-y-6">
              <Card aria-labelledby="pulse-h">
                <CardHeader id="pulse-h" title="Class pulse" />
                <CardBody className="grid grid-cols-2 gap-x-4 gap-y-5">
                  <div className="col-span-2">
                    <p className="text-xs font-medium uppercase tracking-[0.08em] text-ink-2">Avg readiness</p>
                    <div className="mt-1 flex items-end gap-3">
                      <p className="tabular text-2xl font-semibold text-ink">{kpis.readinessMid}</p>
                      {classTrend.length > 1 && <Sparkline values={classTrend} label="Class average readiness, last 4 weeks" className="mb-1.5" />}
                      <p className="mb-1 text-sm text-ink-2">
                        {trendDelta > 0 ? `▲ +${trendDelta}` : trendDelta < 0 ? `▼ ${trendDelta}` : "■ flat"} in 4 wks
                      </p>
                    </div>
                  </div>
                  <Stat
                    label="Plan adherence"
                    value={kpis.adherencePct === null ? "—" : `${kpis.adherencePct}%`}
                    hint="last 14 days"
                    tone={kpis.adherencePct !== null && kpis.adherencePct < 60 ? "warn" : undefined}
                  />
                  <Stat label="HW on time" value={kpis.homeworkOnTimePct === null ? "—" : `${kpis.homeworkOnTimePct}%`} hint="past due work" />
                  <Stat label="Active this week" value={`${kpis.activeThisWeek} / ${kpis.total}`} hint="last 7 days" />
                  <Stat label="Hours / student" value={hoursAvg} hint="last 7 days" />
                </CardBody>
              </Card>

              <Card aria-labelledby="due-h">
                <CardHeader
                  id="due-h"
                  title="Due this week"
                  action={
                    <Link href={`/teacher/homework?${classQuery}`} className="text-sm text-brand hover:underline">
                      All homework
                    </Link>
                  }
                />
                <CardBody>
                  {dueThisWeek.length === 0 ? (
                    <p className="text-sm text-ink-2">Nothing due this week.</p>
                  ) : (
                    <ul className="space-y-3">
                      {dueThisWeek.map((a) => (
                        <li key={a.id}>
                          <Link href={`/teacher/homework/${a.id}`} className="font-medium text-ink hover:underline">
                            {a.title}
                          </Link>
                          <p className="tabular text-sm text-ink-2">
                            Due {formatDateTime(a.dueAt, user.timezone)} · {a.submitted} / {a.targeted} submitted
                            {a.needsGrading ? ` · ${a.needsGrading} to grade` : ""}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                  {toGrade > 0 && (
                    <p className="mt-4 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
                      {plural(toGrade, "submission")} waiting for grading.{" "}
                      <Link href={`/teacher/homework?${classQuery}`} className="font-medium underline">
                        Open homework
                      </Link>
                    </p>
                  )}
                </CardBody>
              </Card>
            </div>
          </div>

          <Card className="mt-6" aria-labelledby="heat-h">
            <CardHeader
              id="heat-h"
              title="Cohort heatmap"
              subtitle="Mean objective mastery per topic. Hatched cells have no practice evidence yet."
            />
            <CardBody>
              <Form action="/teacher" className="mb-3 flex flex-wrap items-center gap-2">
                <input type="hidden" name="class" value={cls.id} />
                <label htmlFor="heat-sort" className="text-sm text-ink-2">
                  Sort by
                </label>
                <Select id="heat-sort" name="sort" defaultValue={sort ?? ""} className="w-64! max-w-full text-sm">
                  <option value="">Name (A–Z)</option>
                  <option value="readiness">Readiness (lowest first)</option>
                  {c.topics.map((t) => (
                    <option key={t.id} value={t.code}>
                      {t.name} (lowest first)
                    </option>
                  ))}
                </Select>
                <Button type="submit" variant="secondary">
                  Sort
                </Button>
              </Form>
              <Heatmap
                topics={c.topics.map((t) => ({ id: t.id, code: t.code, name: t.name }))}
                rows={heatRows(sorted)}
                footer={{ label: "Class average", cells: topicAverages }}
              />
              <MasteryLegend className="mt-4" />
            </CardBody>
          </Card>
          {teachNext && teachTopic && (
            <Card className="mt-6 border-brand/40 bg-brand-soft/40" aria-labelledby="teach-h">
              <CardHeader id="teach-h" title="Teach next" />
              <CardBody className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-lg font-semibold text-ink">{teachTopic.name}</p>
                  <p className="text-sm text-ink-2">
                    {teachNext.reason} Ranked by exam weight × (1 − class mastery), so a low average on a heavy topic comes first.
                  </p>
                </div>
                <ButtonLink href={`/teacher/homework/new?${classQuery}&topic=${teachTopic.id}`} variant="secondary">
                  Plan homework on it
                </ButtonLink>
              </CardBody>
            </Card>
          )}

        </>
      )}
    </>
  );
}
