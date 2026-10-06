import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink, EmptyState, PageHeader } from "@/components/ui";
import { ClassKpis } from "@/components/teacher/class-kpis";
import { ClassSwitcher } from "@/components/teacher/class-switcher";
import { NewClassForm } from "@/components/teacher/class-forms";
import { JoinCodeChip } from "@/components/teacher/join-code";
import { NeedsAttention } from "@/components/teacher/needs-attention";
import { StudentTable } from "@/components/teacher/student-table";
import { TopicBars } from "@/components/teacher/topic-bars";
import { addDays } from "@/domain/dates";
import { examCountdown, toRosterRows } from "@/lib/class-roster";
import { formatDay, plural } from "@/lib/format";
import { teacherContext } from "@/server/context";
import { getClassOverview, listClasses } from "@/services/classes";
import { MAX_EXAM_DATE, MIN_EXAM_DATE } from "@/services/tracker";

export const metadata: Metadata = { title: "Class overview" };

export default async function TeacherOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ class?: string | string[] }>;
}) {
  const { actor, db, today, now } = await teacherContext();
  const sp = await searchParams;
  const classes = await listClasses(db, actor);

  if (classes.length === 0) {
    const minExam = [MIN_EXAM_DATE, addDays(today, 7)].sort().pop()!;
    return (
      <>
        <PageHeader
          eyebrow="TEACHER"
          title="Welcome to Ascent"
          description="Create your first class to get a join code for your students. Their progress, pace and alerts appear here as soon as they sign up."
        />
        <div className="max-w-2xl">
          <NewClassForm
            title="Create a class"
            minExam={minExam}
            maxExam={MAX_EXAM_DATE}
          />
        </div>
      </>
    );
  }

  const wanted = Array.isArray(sp.class) ? sp.class[0] : sp.class;
  const active = classes.find((c) => c.id === wanted) ?? classes[0];
  const overview = await getClassOverview(db, actor, active.id, today, now);
  const { cls, kpis } = overview;
  const exam = examCountdown(cls.examDate, today);
  const rows = toRosterRows(overview.students, today);

  return (
    <>
      <PageHeader
        eyebrow="TEACHER"
        title={cls.name}
        description={
          <>
            {exam.date
              ? `Exam ${formatDay(exam.date)} ${exam.date.slice(0, 4)}, ${exam.text}`
              : exam.text}
            <span aria-hidden> · </span>
            {plural(kpis.total, "student")}
          </>
        }
        actions={
          <>
            <JoinCodeChip code={cls.joinCode} />
            <ButtonLink href={`/teacher/classes/${cls.id}`} variant="secondary">
              Class settings
            </ButtonLink>
          </>
        }
      />
      <ClassSwitcher classes={classes} activeId={cls.id} />
      {kpis.total === 0 ? (
        <EmptyState
          title="No students have joined yet"
          action={
            <ButtonLink href={`/teacher/classes/${cls.id}`} variant="primary">
              Get the sign-up link
            </ButtonLink>
          }
        >
          Give students the join code{" "}
          <strong className="font-mono tracking-widest text-ink">
            {cls.joinCode}
          </strong>{" "}
          or the sign-up link on the{" "}
          <Link
            href={`/teacher/classes/${cls.id}`}
            className="font-medium text-link hover:underline"
          >
            class page
          </Link>
          . Progress, pace and alerts show up here as they join.
        </EmptyState>
      ) : (
        <div className="space-y-6 pb-12">
          <ClassKpis kpis={kpis} />
          <NeedsAttention groups={overview.attention} />
          <StudentTable rows={rows} classId={cls.id} />
          <TopicBars overview={overview} />
        </div>
      )}
    </>
  );
}
