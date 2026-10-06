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
    difficulty: number;
    spread: boolean;
    modules: {
      title: string;
      estMinutes: number;
      los: { code: string; commandWord: string; text: string; importance: number }[];
    }[];
  }[];
};

export type WrittenCurriculum = {
  versionId: string;
  losIdByCode: Map<string, string>;
};

/**
 * Insert a whole curriculum version atomically. When `activate` is true the new
 * version becomes the only active one (existing plans keep pointing at theirs).
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

    const losIdByCode = new Map<string, string>();
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
          difficulty: t.difficulty,
          spread: t.spread,
        })
        .returning({ id: topics.id });
      for (const [mi, m] of t.modules.entries()) {
        const [mod] = await tx
          .insert(modules)
          .values({ topicId: topic.id, title: m.title, order: mi, estMinutes: m.estMinutes })
          .returning({ id: modules.id });
        if (m.los.length === 0) continue;
        const rows = await tx
          .insert(los)
          .values(
            m.los.map((l, li) => ({
              moduleId: mod.id,
              code: l.code,
              commandWord: l.commandWord,
              text: l.text,
              importance: l.importance,
              order: li,
            })),
          )
          .returning({ id: los.id, code: los.code });
        for (const r of rows) losIdByCode.set(r.code, r.id);
      }
    }
    return { versionId: version.id, losIdByCode };
  });
}
