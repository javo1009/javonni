import type { Metadata } from "next";
import { PracticeApp } from "@/components/practice/practice-app";
import type {
  ChapterOption,
  PracticeData,
  ScopeChoice,
} from "@/components/practice/types";
import { ButtonLink, EmptyState, PageHeader } from "@/components/ui";
import { TRACKER } from "@/domain/tracker";
import { getCurriculumOrNull, studentContext } from "@/server/context";
import { questionCountsByModule } from "@/services/curriculum";
import { loadChapterStates, practiceStatsByModule } from "@/services/tracker";

export const metadata: Metadata = { title: "Practice" };

const first = (v: string | string[] | undefined) =>
  Array.isArray(v) ? v[0] : v;

export default async function PracticePage({
  searchParams,
}: PageProps<"/student/practice">) {
  const sp = await searchParams;
  const { actor, db } = await studentContext();
  const cur = await getCurriculumOrNull();

  const header = (
    <PageHeader
      eyebrow="Practice"
      title="Practise questions"
      description="Pick a chapter, a topic or your weak spots, answer one question at a time and see why each answer is right."
    />
  );
  if (!cur) {
    return (
      <div className="pb-10">
        {header}
        <EmptyState title="No curriculum is set up yet">
          Practice needs the curriculum. Ask an admin to set it up.
        </EmptyState>
      </div>
    );
  }

  const [counts, states, stats] = await Promise.all([
    questionCountsByModule(db),
    loadChapterStates(db, [actor.id]),
    practiceStatsByModule(db, [actor.id]),
  ]);
  const mine = states.get(actor.id)!;
  const played = stats.get(actor.id)!;

  const topics = cur.topics.map((t) => {
    const chapters: ChapterOption[] = cur.modules
      .filter((m) => m.topicId === t.id)
      .map((m) => ({
        id: m.id,
        number: m.number,
        title: m.title,
        questions: counts.get(m.id) ?? 0,
        score: mine.get(m.id)?.accuracy ?? null,
        attempts: played.get(m.id)?.attempts ?? 0,
        correct: played.get(m.id)?.correct ?? 0,
      }));
    return {
      id: t.id,
      name: t.name,
      weightLabel:
        t.weightMin === t.weightMax
          ? `${t.weightMin}%`
          : `${t.weightMin}–${t.weightMax}%`,
      questions: chapters.reduce((n, c) => n + c.questions, 0),
      chapters,
    };
  });
  // Same rule the service uses for the "weak" scope: a recorded score under the threshold.
  const weak = topics
    .flatMap((t) => t.chapters)
    .filter(
      (c) => c.score !== null && c.score < TRACKER.weakScore && c.questions > 0,
    )
    .sort((a, b) => a.score! - b.score!);
  const data: PracticeData = {
    topics,
    weak,
    weakThreshold: TRACKER.weakScore,
    totalQuestions: topics.reduce((n, t) => n + t.questions, 0),
  };

  // ?module=<id>, ?topic=<id> or ?scope=weak pre-select what to practise.
  const moduleParam = first(sp.module);
  const topicParam = first(sp.topic);
  const initial: ScopeChoice | null =
    moduleParam && cur.moduleById.has(moduleParam)
      ? { kind: "module", id: moduleParam }
      : topicParam && cur.topicById.has(topicParam)
        ? { kind: "topic", id: topicParam }
        : first(sp.scope) === "weak"
          ? { kind: "weak" }
          : first(sp.scope) === "mixed"
            ? { kind: "mixed" }
            : null;

  if (data.totalQuestions === 0) {
    return (
      <div className="pb-10">
        {header}
        <EmptyState
          title="The question bank is empty"
          action={
            <ButtonLink href="/student/chapters" variant="secondary">
              Go to your chapters
            </ButtonLink>
          }
        >
          There are no practice questions yet. Check back soon, and keep
          recording your own practice scores on the chapters page in the
          meantime.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="pb-10">
      {header}
      {/* The key resets the client state when a link (e.g. "Practise this chapter again") changes the pre-selection. */}
      <PracticeApp
        key={`${initial?.kind ?? "none"}:${"id" in (initial ?? {}) ? (initial as { id: string }).id : ""}`}
        data={data}
        initial={initial}
      />
    </div>
  );
}
