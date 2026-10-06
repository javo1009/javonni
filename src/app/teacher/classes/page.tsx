import type { Metadata } from "next";
import Link from "next/link";
import {
  ButtonLink,
  Card,
  CardBody,
  EmptyState,
  PageHeader,
} from "@/components/ui";
import { NewClassForm } from "@/components/teacher/class-forms";
import { JoinCodeChip } from "@/components/teacher/join-code";
import { addDays } from "@/domain/dates";
import { examCountdown } from "@/lib/class-roster";
import { formatDay, plural } from "@/lib/format";
import { teacherContext } from "@/server/context";
import { listClasses } from "@/services/classes";
import { MAX_EXAM_DATE, MIN_EXAM_DATE } from "@/services/tracker";

export const metadata: Metadata = { title: "Classes" };

export default async function ClassesPage() {
  const { actor, db, today } = await teacherContext();
  // listClasses is typed for every role; teachers and admins get the full row.
  const classes = (await listClasses(db, actor)) as (Awaited<
    ReturnType<typeof listClasses>
  >[number] & { weeklyTargetMinutes: number })[];
  const minExam = [MIN_EXAM_DATE, addDays(today, 7)].sort().pop()!;

  return (
    <>
      <PageHeader
        eyebrow="TEACHER"
        title="Classes"
        description="Each class has its own join code, exam date and weekly target. Open one to change its settings or see who has joined."
      />
      <div className="space-y-6 pb-12">
        {classes.length === 0 ? (
          <EmptyState title="You don't have a class yet">
            Create one below to get a join code for your students.
          </EmptyState>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {classes.map((c) => {
              const exam = examCountdown(c.examDate, today);
              return (
                <li key={c.id}>
                  <Card className="h-full">
                    <CardBody className="flex h-full flex-col gap-4 pt-5">
                      <div>
                        <h2 className="text-xl font-semibold leading-tight tracking-tight text-ink">
                          <Link
                            href={`/teacher/classes/${c.id}`}
                            className="hover:underline"
                          >
                            {c.name}
                          </Link>
                        </h2>
                        <p className="mt-1 text-sm text-ink-2">
                          {plural(c.students, "student")}
                          <span aria-hidden> · </span>
                          {exam.date
                            ? `Exam ${formatDay(exam.date)} ${exam.date.slice(0, 4)} (${exam.text})`
                            : exam.text}
                        </p>
                        <p className="mt-0.5 text-sm text-ink-3">
                          Target{" "}
                          {Math.round((c.weeklyTargetMinutes / 60) * 10) / 10} h
                          per week
                        </p>
                      </div>
                      <JoinCodeChip code={c.joinCode} />
                      <div className="mt-auto flex flex-wrap gap-2">
                        <ButtonLink
                          href={`/teacher?class=${c.id}`}
                          variant="primary"
                          size="sm"
                        >
                          Class overview
                        </ButtonLink>
                        <ButtonLink
                          href={`/teacher/classes/${c.id}`}
                          variant="secondary"
                          size="sm"
                        >
                          Settings and roster
                        </ButtonLink>
                      </div>
                    </CardBody>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
        <div className="max-w-3xl">
          <NewClassForm
            minExam={minExam}
            maxExam={MAX_EXAM_DATE}
            defaultOpen={classes.length === 0}
          />
        </div>
      </div>
    </>
  );
}
