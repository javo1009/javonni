import type { Metadata } from "next";
import Link from "next/link";
import { Banner, ButtonLink, Card, CardBody, EmptyState, PageHeader, TableWrap, td, th } from "@/components/ui";
import { JoinCode } from "@/components/teacher/join-code";
import { AlertBadge } from "@/components/teacher/labels";
import { formatShortDate, pct, plural } from "@/lib/format";
import { teacherContext } from "@/server/context";
import { assertClassAccess, getClassOverview } from "@/services/classes";
import { homeworkStats } from "@/services/homework";
import { orNotFound } from "../../_lib/guard";

export const metadata: Metadata = { title: "Class roster" };

export default async function ClassPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const [{ id }, { created }] = await Promise.all([params, searchParams]);
  const { actor, db, today, now } = await teacherContext();
  const overview = await orNotFound(id, async (classId) => {
    await assertClassAccess(db, actor, classId);
    const hw = await homeworkStats(db, classId, new Date(now));
    return getClassOverview(db, actor, classId, today, hw, now);
  });
  const { cls, students, kpis } = overview;

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/teacher/classes" className="hover:underline">
            ← Classes
          </Link>
        }
        title={cls.name}
        description={`${plural(kpis.total, "student")}${cls.examDate ? ` · exam ${formatShortDate(cls.examDate)}` : ""}`}
        actions={
          <>
            <ButtonLink href={`/teacher?class=${cls.id}`} variant="secondary">
              Cockpit
            </ButtonLink>
            <ButtonLink href={`/teacher/homework/new?class=${cls.id}`}>New homework</ButtonLink>
          </>
        }
      />
      {created && (
        <div className="mb-6">
          <Banner tone="good" title="Class created">
            Share the join code or sign-up link below with your students.
          </Banner>
        </div>
      )}
      <Card className="mb-6">
        <CardBody className="pt-4">
          <JoinCode code={cls.joinCode} />
        </CardBody>
      </Card>

      {students.length === 0 ? (
        <EmptyState title="No students yet">Students who register with the join code appear here, with their readiness and activity.</EmptyState>
      ) : (
        <TableWrap label="Class roster">
          <table className="relative w-full min-w-[52rem]">
            <caption className="sr-only">Roster for {cls.name}</caption>
            <thead className="border-b border-border">
              <tr>
                <th scope="col" className={th}>Student</th>
                <th scope="col" className={th}>Readiness</th>
                <th scope="col" className={`${th} text-right`}>Coverage</th>
                <th scope="col" className={`${th} text-right`}>Hours (7 d)</th>
                <th scope="col" className={th}>Last active</th>
                <th scope="col" className={th}>Alerts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {students.map((s) => (
                <tr key={s.id}>
                  <th scope="row" className={`${td} text-left font-medium`}>
                    <Link href={`/teacher/students/${s.id}`} className="text-ink hover:underline">
                      {s.name}
                    </Link>
                    <span className="block text-xs font-normal text-ink-2">{s.email}</span>
                  </th>
                  <td className={`${td} tabular`}>
                    {s.readiness.insufficient ? (
                      <span className="text-ink-3">Not enough data</span>
                    ) : (
                      <>
                        {s.readiness.low}–{s.readiness.high}
                        <span className="ml-1 text-xs text-ink-2">({s.readiness.evidenceLabel} evidence)</span>
                      </>
                    )}
                  </td>
                  <td className={`${td} tabular text-right`}>
                    {pct(s.snapshot.coverage.coveragePct)}
                    <span className="block text-xs text-ink-2">
                      {s.snapshot.coverage.covered} / {s.snapshot.coverage.total} LOS
                    </span>
                  </td>
                  <td className={`${td} tabular text-right`}>{s.hours7d}</td>
                  <td className={td}>{s.lastActive ? formatShortDate(s.lastActive) : <span className="text-ink-3">Never</span>}</td>
                  <td className={td}>
                    {s.alerts.length === 0 ? (
                      <span className="text-sm text-ink-2">None</span>
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        {s.alerts.map((a) => (
                          <span key={a.kind} title={a.evidence}>
                            <AlertBadge kind={a.kind} severity={a.severity} />
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </>
  );
}
