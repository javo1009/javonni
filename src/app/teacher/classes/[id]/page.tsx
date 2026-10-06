import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  TableWrap,
  td,
  th,
} from "@/components/ui";
import { ClassSettingsForm } from "@/components/teacher/class-forms";
import { JoinCard } from "@/components/teacher/join-card";
import { addDays } from "@/domain/dates";
import { examCountdown, relativeDay } from "@/lib/class-roster";
import { formatDay, plural } from "@/lib/format";
import { teacherContext } from "@/server/context";
import { getClassOverview } from "@/services/classes";
import { MAX_EXAM_DATE, MIN_EXAM_DATE } from "@/services/tracker";
import { ForbiddenError, NotFoundError } from "@/services/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata: Metadata = { title: "Class settings" };

export default async function ClassPage({
  params,
}: PageProps<"/teacher/classes/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { actor, db, today, now } = await teacherContext();
  // The overview also carries each student's last-active date, so the roster needs no second query.
  const overview = await getClassOverview(db, actor, id, today, now).catch(
    (e) => {
      if (e instanceof NotFoundError || e instanceof ForbiddenError) notFound();
      throw e;
    },
  );
  const { cls, students } = overview;
  const exam = examCountdown(cls.examDate, today);
  const minExam = [MIN_EXAM_DATE, addDays(today, 7)].sort().pop()!;

  return (
    <>
      <PageHeader
        eyebrow="TEACHER · CLASS"
        title={cls.name}
        description={`${exam.date ? `Exam ${formatDay(exam.date)} ${exam.date.slice(0, 4)}, ${exam.text}` : exam.text} · ${plural(students.length, "student")}`}
        actions={
          <>
            <ButtonLink href={`/teacher?class=${cls.id}`} variant="primary">
              Class overview
            </ButtonLink>
            <ButtonLink href="/teacher/classes" variant="secondary">
              All classes
            </ButtonLink>
          </>
        }
      />
      <div className="grid gap-6 pb-12 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        <ClassSettingsForm
          classId={cls.id}
          initial={{
            name: cls.name,
            examDate: cls.examDate,
            planStart: cls.planStart,
            weeklyTargetHours: cls.weeklyTargetHours,
          }}
          studentCount={students.length}
          minExam={minExam}
          maxExam={MAX_EXAM_DATE}
        />
        <JoinCard joinCode={cls.joinCode} />
        <div className="lg:col-span-2">
          <Card aria-labelledby="roster-h">
            <CardHeader
              id="roster-h"
              title="Roster"
              subtitle={
                students.length
                  ? `${plural(students.length, "student")} enrolled.`
                  : undefined
              }
            />
            <CardBody>
              {students.length === 0 ? (
                <EmptyState title="Nobody has joined yet">
                  Share the join code or sign-up link above. Students appear
                  here as soon as they register.
                </EmptyState>
              ) : (
                <TableWrap label="Class roster">
                  <table className="w-full min-w-[36rem] border-collapse">
                    <thead className="border-b border-border bg-surface-2">
                      <tr>
                        <th scope="col" className={th}>
                          Student
                        </th>
                        <th scope="col" className={th}>
                          Email
                        </th>
                        <th scope="col" className={th}>
                          Joined
                        </th>
                        <th scope="col" className={th}>
                          Last active
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {students.map((s) => (
                        <tr key={s.id} className="hover:bg-surface-2/60">
                          <th
                            scope="row"
                            className={`${td} text-left font-normal`}
                          >
                            <Link
                              href={`/teacher/students/${s.id}`}
                              className="font-semibold text-link hover:underline"
                            >
                              {s.name}
                            </Link>
                          </th>
                          <td className={`${td} text-ink-2`}>{s.email}</td>
                          <td className={`${td} whitespace-nowrap`}>
                            {formatDay(s.joinedOn)}
                          </td>
                          <td className={`${td} whitespace-nowrap`}>
                            {relativeDay(s.lastActive, today)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
