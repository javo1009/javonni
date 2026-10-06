import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink, EmptyState, PageHeader } from "@/components/ui";
import { HomeworkBuilder } from "@/components/homework/teacher/homework-builder";
import type { TopicOption } from "@/components/homework/teacher/builder-types";
import { addDays } from "@/domain/dates";
import { getCurriculumOrNull, teacherContext } from "@/server/context";
import { getRoster, listClasses } from "@/services/classes";
import { questionCountsByModule } from "@/services/curriculum";

export const metadata: Metadata = { title: "New homework · Ascent" };

export default async function NewHomeworkPage({
  searchParams,
}: PageProps<"/teacher/homework/new">) {
  const { actor, db, today } = await teacherContext();
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;

  const classes = await listClasses(db, actor);
  if (classes.length === 0) {
    return (
      <>
        <PageHeader eyebrow="Homework" title="New homework" />
        <EmptyState
          title="Create a class first"
          action={
            <ButtonLink href="/teacher/classes">Go to classes</ButtonLink>
          }
        >
          Homework is assigned to a class, so you need at least one.
        </EmptyState>
      </>
    );
  }

  const rosters = await Promise.all(
    classes.map((c) => getRoster(db, actor, c.id)),
  );
  const classOptions = classes.map((c, i) => ({
    id: c.id,
    name: c.name,
    students: rosters[i].map((s) => ({ id: s.id, name: s.name })),
  }));
  const wantedClass = one(sp.class);
  const defaultClassId =
    classOptions.find((c) => c.id === wantedClass)?.id ?? classOptions[0].id;

  const cur = await getCurriculumOrNull();
  const counts = cur
    ? await questionCountsByModule(db)
    : new Map<string, number>();
  const topics: TopicOption[] = cur
    ? cur.topics.map((t) => ({
        id: t.id,
        name: t.name,
        modules: cur.modules
          .filter((m) => m.topicId === t.id)
          .map((m) => ({
            id: m.id,
            number: m.number,
            title: m.title,
            count: counts.get(m.id) ?? 0,
          })),
      }))
    : [];
  const wantedModule = one(sp.module);
  const presetModuleId =
    wantedModule &&
    cur?.moduleById.has(wantedModule) &&
    (counts.get(wantedModule) ?? 0) > 0
      ? wantedModule
      : undefined;

  return (
    <>
      <PageHeader
        eyebrow="Homework"
        title="New homework"
        description="Upload a handout, choose who gets it and what they hand in. Students download the file, complete it and upload their work for you to mark."
        actions={
          <Link
            href="/teacher/homework"
            className="inline-flex h-10 items-center text-sm font-semibold text-link hover:underline max-sm:h-11"
          >
            ← All homework
          </Link>
        }
      />
      <HomeworkBuilder
        classes={classOptions}
        topics={topics}
        defaultClassId={defaultClassId}
        defaultDate={addDays(today, 7)}
        presetModuleId={presetModuleId}
      />
    </>
  );
}
