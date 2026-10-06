import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "../client";
import { writeCurriculum, type CurriculumDraft } from "../curriculum-writer";
import { curriculumVersions, modules, questions, topics } from "../schema";
import official from "./official-2027.json";
import { SAMPLE_QUESTIONS } from "./sample-questions";

export const OFFICIAL_VERSION_NAME = "2027 Level I curriculum";

export const officialDraft = (): CurriculumDraft => ({
  name: OFFICIAL_VERSION_NAME,
  level: "I",
  year: 2027,
  isSample: false,
  sourceNote: official.source,
  topics: official.topics.map((t) => ({
    code: t.code,
    name: t.name,
    weightMin: t.weightMin,
    weightMax: t.weightMax,
    studyWeeks: t.studyWeeks,
    modules: t.modules.map((m) => ({ slug: m.slug, number: m.number, title: m.title })),
  })),
});

/**
 * Make the 2027 Level I curriculum (10 topics, 102 modules) the active one.
 * - nothing active: write and activate it
 * - the old bundled sample is active: replace it
 * - an admin-imported curriculum is active: leave it alone
 */
export async function ensureOfficialCurriculum(db: Db): Promise<{ action: "created" | "replaced-sample" | "kept"; versionId: string }> {
  const [active] = await db
    .select({ id: curriculumVersions.id, isSample: curriculumVersions.isSample, name: curriculumVersions.name })
    .from(curriculumVersions)
    .where(eq(curriculumVersions.isActive, true))
    .limit(1);
  if (active && !active.isSample && !active.name.startsWith("Sample curriculum")) return { action: "kept", versionId: active.id };

  // Reuse an existing official version instead of duplicating it on every deploy.
  const [existing] = await db
    .select({ id: curriculumVersions.id })
    .from(curriculumVersions)
    .where(and(eq(curriculumVersions.name, OFFICIAL_VERSION_NAME), eq(curriculumVersions.isSample, false)))
    .limit(1);
  if (existing) {
    await db.update(curriculumVersions).set({ isActive: false }).where(eq(curriculumVersions.isActive, true));
    await db.update(curriculumVersions).set({ isActive: true }).where(eq(curriculumVersions.id, existing.id));
    return { action: "replaced-sample", versionId: existing.id };
  }
  const written = await writeCurriculum(db, officialDraft(), { activate: true });
  return { action: active ? "replaced-sample" : "created", versionId: written.versionId };
}

/** Insert the bundled sample questions into the active curriculum once (matched by stem). */
export async function seedSampleQuestions(db: Db, versionId: string): Promise<number> {
  const topicRows = await db.select({ id: topics.id }).from(topics).where(eq(topics.versionId, versionId));
  if (topicRows.length === 0) return 0;
  const mods = await db
    .select({ id: modules.id, slug: modules.slug })
    .from(modules)
    .where(inArray(modules.topicId, topicRows.map((t) => t.id)));
  const bySlug = new Map(mods.filter((m) => m.slug).map((m) => [m.slug!, m.id]));
  const existing = new Set((await db.select({ stem: questions.stem }).from(questions).where(eq(questions.source, "sample"))).map((q) => q.stem));

  const KEYS = ["A", "B", "C"] as const;
  let added = 0;
  for (const [i, q] of SAMPLE_QUESTIONS.entries()) {
    const moduleId = bySlug.get(q.module);
    if (!moduleId || existing.has(q.stem)) continue;
    // Spread the correct answer evenly across A/B/C, deterministically.
    const pos = i % 3;
    const texts = [...q.wrong];
    texts.splice(pos, 0, q.correct);
    await db.insert(questions).values({
      stem: q.stem,
      options: texts.map((text, k) => ({ key: KEYS[k], text })),
      correctKey: KEYS[pos],
      explanation: q.explanation,
      difficulty: q.difficulty,
      status: "published",
      moduleId,
      source: "sample",
    });
    added++;
  }
  return added;
}
