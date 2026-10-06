import { and, asc, eq, inArray } from "drizzle-orm";
import { curriculumVersions, modules, questions, topics } from "@/db/schema";
import type { ModuleRef, TopicRef } from "@/domain/tracker";
import { NotFoundError, type Db } from "./types";

export type Curriculum = {
  version: { id: string; name: string; year: number; isSample: boolean; sourceNote: string | null };
  /** Topics in study order. */
  topics: TopicRef[];
  /** Modules in curriculum order (topic, then number). */
  modules: ModuleRef[];
  topicById: Map<string, TopicRef>;
  moduleById: Map<string, ModuleRef>;
  moduleBySlug: Map<string, ModuleRef>;
  topicOrder: Map<string, number>;
};

export async function getActiveCurriculum(db: Db, versionId?: string): Promise<Curriculum> {
  const [version] = await db
    .select({
      id: curriculumVersions.id,
      name: curriculumVersions.name,
      year: curriculumVersions.year,
      isSample: curriculumVersions.isSample,
      sourceNote: curriculumVersions.sourceNote,
    })
    .from(curriculumVersions)
    .where(versionId ? eq(curriculumVersions.id, versionId) : eq(curriculumVersions.isActive, true))
    .limit(1);
  if (!version) throw new NotFoundError("No active curriculum. Run `npm run db:seed` or import one in Admin.");

  const topicRows = await db.select().from(topics).where(eq(topics.versionId, version.id)).orderBy(asc(topics.order));
  const moduleRows = topicRows.length
    ? await db.select().from(modules).where(inArray(modules.topicId, topicRows.map((t) => t.id)))
    : [];

  const topicRefs: TopicRef[] = topicRows.map((t, i) => ({
    id: t.id,
    name: t.name,
    weightMin: t.weightMin,
    weightMax: t.weightMax,
    order: i,
    studyWeeks: t.studyWeeks,
  }));
  const rank = new Map(topicRefs.map((t) => [t.id, t.order]));
  const moduleRefs: ModuleRef[] = moduleRows
    .map((m) => ({ id: m.id, topicId: m.topicId, number: m.number, title: m.title, slug: m.slug }))
    .sort((a, b) => rank.get(a.topicId)! - rank.get(b.topicId)! || a.number - b.number)
    .map((m) => ({ id: m.id, topicId: m.topicId, number: m.number, title: m.title }));
  const slugById = new Map(moduleRows.map((m) => [m.id, m.slug]));

  return {
    version,
    topics: topicRefs,
    modules: moduleRefs,
    topicById: new Map(topicRefs.map((t) => [t.id, t])),
    moduleById: new Map(moduleRefs.map((m) => [m.id, m])),
    moduleBySlug: new Map(moduleRefs.filter((m) => slugById.get(m.id)).map((m) => [slugById.get(m.id)!, m])),
    topicOrder: rank,
  };
}

/** Published question counts per module. */
export async function questionCountsByModule(db: Db): Promise<Map<string, number>> {
  const rows = await db
    .select({ moduleId: questions.moduleId })
    .from(questions)
    .where(and(eq(questions.status, "published")));
  const out = new Map<string, number>();
  for (const r of rows) if (r.moduleId) out.set(r.moduleId, (out.get(r.moduleId) ?? 0) + 1);
  return out;
}
