import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink, EmptyState, PageHeader } from "@/components/ui";
import { AssignmentBuilder } from "@/components/teacher/assignment-builder";
import { addDays } from "@/domain/dates";
import { teacherContext } from "@/server/context";
import { getBuilderData } from "@/services/teacher-views";

export const metadata: Metadata = { title: "New homework" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function NewHomeworkPage({ searchParams }: { searchParams: Promise<{ class?: string | string[]; topic?: string | string[] }> }) {
  const sp = await searchParams;
  const { actor, db, today } = await teacherContext();
  const data = await getBuilderData(db, actor);
  const backLink = (
    <Link href="/teacher/homework" className="hover:underline">
      ← Homework
    </Link>
  );
  if (data.classes.length === 0) {
    return (
      <>
        <PageHeader eyebrow={backLink} title="New homework" />
        <EmptyState title="Create a class first" action={<ButtonLink href="/teacher/classes#create">Create a class</ButtonLink>}>
          Homework is assigned to a class or to students in it.
        </EmptyState>
      </>
    );
  }
  const reqClass = one(sp.class);
  const initialClassId = data.classes.some((c) => c.id === reqClass) ? reqClass! : data.classes[0].id;
  const topic = data.topics.find((t) => t.id === one(sp.topic));
  // Pre-select a suggested topic's objectives that actually have questions.
  const initialLos = topic ? topic.modules.flatMap((m) => m.los.filter((l) => l.questions > 0).map((l) => l.id)) : [];
  return (
    <>
      <PageHeader eyebrow={backLink} title="New homework" description="Build a set from the question bank in four short steps." />
      <AssignmentBuilder
        classes={data.classes}
        topics={data.topics}
        initialClassId={initialClassId}
        initialLosIds={initialLos}
        initialTitle={topic ? `${topic.name} practice` : ""}
        defaultDue={`${addDays(today, 7)}T21:00`}
      />
    </>
  );
}
