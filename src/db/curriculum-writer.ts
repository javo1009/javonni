import { eq } from "drizzle-orm";
import type { Db } from "./client";
import { curriculumVersions, los, modules, topics } from "./schema";

export type CurriculumDraft = {
  name: string;
  level: string;
  year: number;
  isSample: boolean;
  sourceNote: string | null;
  topics: {
    code: string;
    name: string;
    weightMin: number;
    weightMax: number;
    /** Weeks of the first pass at the reference runway (default 1). */
    studyWeeks?: number;
    modules: {
      title: string;
      /** Stable id such as "quantitative-methods-04"; optional for imported curricula. */
      slug?: string | null;
      /** Printed number within the topic; defaults to the position. */
      number?: number;
      estMinutes?: number;
      /** Optional finer-grained objectives; the tracker works at module level without them. */
      los?: { code: string; commandWord: string; text: string; importance: number }[];
    }[];
  }[];
};

export type WrittenCurriculum = {
  versionId: string;
  moduleIdBySlug: Map<string, string>;
};

/**
 * Insert a whole curriculum version atomically. When `activate` is true the new
 * version becomes the only active one (existing student data keeps pointing at its modules).
 */
export async function writeCurriculum(db: Db, draft: CurriculumDraft, opts: { activate: boolean }): Promise<WrittenCurriculum> {
  return db.transaction(async (tx) => {
    if (opts.activate) await tx.update(curriculumVersions).set({ isActive: false }).where(eq(curriculumVersions.isActive, true));
    const [version] = await tx
      .insert(curriculumVersions)
      .values({
        name: draft.name,
        level: draft.level,
        year: draft.year,
        isSample: draft.isSample,
        isActive: opts.activate,
        sourceNote: draft.sourceNote,
      })
      .returning({ id: curriculumVersions.id });

    const moduleIdBySlug = new Map<string, string>();
    for (const [ti, t] of draft.topics.entries()) {
      const [topic] = await tx
        .insert(topics)
        .values({
          versionId: version.id,
          code: t.code,
          name: t.name,
          weightMin: t.weightMin,
          weightMax: t.weightMax,
          order: ti,
          studyWeeks: t.studyWeeks ?? 1,
        })
        .returning({ id: topics.id });
      for (const [mi, m] of t.modules.entries()) {
        const [mod] = await tx
          .insert(modules)
          .values({
            topicId: topic.id,
            title: m.title,
            order: mi,
            number: m.number ?? mi + 1,
            slug: m.slug ?? null,
            estMinutes: m.estMinutes ?? 180,
          })
          .returning({ id: modules.id });
        if (m.slug) moduleIdBySlug.set(m.slug, mod.id);
        if (m.los?.length)
          await tx.insert(los).values(
            m.los.map((l, li) => ({
              moduleId: mod.id,
              code: l.code,
              commandWord: l.commandWord,
              text: l.text,
              importance: l.importance,
              order: li,
            })),
          );
      }
    }
    return { versionId: version.id, moduleIdBySlug };
  });
}
