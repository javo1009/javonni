import official from "@/db/seed/official-2027.json";
import { weightLabel, type ChapterState, type ModuleRef, type TopicRef, EMPTY_CHAPTER } from "../tracker";

/** The real 2027 curriculum as the engine sees it: 10 topics in study order, 102 modules. */
export const topics: TopicRef[] = official.topics.map((t, order) => ({
  id: t.code,
  name: t.name,
  weightMin: t.weightMin,
  weightMax: t.weightMax,
  order,
  studyWeeks: t.studyWeeks,
}));

export const modules: ModuleRef[] = official.topics.flatMap((t) =>
  t.modules.map((m) => ({ id: m.slug, topicId: t.code, number: m.number, title: m.title })),
);

export const topicOrder = new Map(topics.map((t) => [t.id, t.order]));

export const state = (over: Partial<ChapterState> = {}): ChapterState => ({ ...EMPTY_CHAPTER, ...over });

export const statesOf = (entries: Record<string, Partial<ChapterState>>) =>
  new Map(Object.entries(entries).map(([id, s]) => [id, state(s)]));

/** Mark the first n chapters of a topic read (with a read date). */
export function readFirst(topicId: string, n: number, readOn: string | null = null) {
  const out = new Map<string, ChapterState>();
  modules
    .filter((m) => m.topicId === topicId)
    .slice(0, n)
    .forEach((m) => out.set(m.id, state({ read: true, readOn })));
  return out;
}

export { weightLabel };
