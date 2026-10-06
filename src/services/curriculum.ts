import { and, asc, eq, inArray } from "drizzle-orm";
import { curriculumVersions, los, modules, questionLos, questions, topics } from "@/db/schema";
import type { LosInfo, ModuleInfo, TopicInfo } from "@/domain/types";
import { NotFoundError, type Db } from "./types";

export type Curriculum = {
  version: { id: string; name: string; year: number; isSample: boolean; sourceNote: string | null };
  topics: TopicInfo[];
  modules: ModuleInfo[];
  los: LosInfo[];
  topicByModule: Map<string, string>;
  topicByLos: Map<string, string>;
  moduleByLos: Map<string, string>;
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
  const topicIds = topicRows.map((t) => t.id);
  const moduleRows = topicIds.length
    ? await db.select().from(modules).where(inArray(modules.topicId, topicIds)).orderBy(asc(modules.order))
    : [];
  const moduleIds = moduleRows.map((m) => m.id);
  const losRows = moduleIds.length
    ? await db.select().from(los).where(inArray(los.moduleId, moduleIds)).orderBy(asc(los.order))
    : [];

  // Objectives in curriculum order: topic, then module, then LOS order.
  const moduleRank = new Map(
    [...moduleRows]
      .sort((a, b) => topicRows.findIndex((t) => t.id === a.topicId) - topicRows.findIndex((t) => t.id === b.topicId) || a.order - b.order)
      .map((m, i) => [m.id, i]),
  );
  losRows.sort((a, b) => moduleRank.get(a.moduleId)! - moduleRank.get(b.moduleId)! || a.order - b.order);

  const losByModule = new Map<string, string[]>();
  for (const l of losRows) losByModule.set(l.moduleId, [...(losByModule.get(l.moduleId) ?? []), l.id]);

  const topicByModule = new Map(moduleRows.map((m) => [m.id, m.topicId]));
  const moduleByLos = new Map(losRows.map((l) => [l.id, l.moduleId]));
  const topicByLos = new Map(losRows.map((l) => [l.id, topicByModule.get(l.moduleId)!]));
  // Keep modules in curriculum order (topic order, then module order).
  const topicOrder = new Map(topicRows.map((t) => [t.id, t.order]));
  moduleRows.sort((a, b) => topicOrder.get(a.topicId)! - topicOrder.get(b.topicId)! || a.order - b.order);

  return {
    version,
    topics: topicRows.map((t) => ({
      id: t.id,
      code: t.code,
      name: t.name,
      weightMin: t.weightMin,
      weightMax: t.weightMax,
      order: t.order,
      difficulty: t.difficulty,
      spread: t.spread,
    })),
    modules: moduleRows.map((m) => ({
      id: m.id,
      topicId: m.topicId,
      title: m.title,
      order: m.order,
      estMinutes: m.estMinutes,
      losIds: losByModule.get(m.id) ?? [],
    })),
    los: losRows.map((l) => ({
      id: l.id,
      moduleId: l.moduleId,
      code: l.code,
      commandWord: l.commandWord,
      text: l.text,
      importance: (l.importance === 1 || l.importance === 3 ? l.importance : 2) as 1 | 2 | 3,
      order: l.order,
    })),
    topicByModule,
    topicByLos,
    moduleByLos,
  };
}

/** Published question counts per LOS (primary + secondary links). */
export async function questionCountsByLos(db: Db): Promise<Map<string, number>> {
  const rows = await db
    .select({ losId: questionLos.losId, questionId: questionLos.questionId })
    .from(questionLos)
    .innerJoin(questions, and(eq(questions.id, questionLos.questionId), eq(questions.status, "published")));
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.losId, (out.get(r.losId) ?? 0) + 1);
  return out;
}
