import { eq } from "drizzle-orm";
import type { Db } from "../client";
import { writeCurriculum, type WrittenCurriculum } from "../curriculum-writer";
import { curriculumVersions, questionLos, questions } from "../schema";
import { SAMPLE_TOPICS, SAMPLE_VERSION } from "./sample-data";

const KEYS = ["A", "B", "C"] as const;

/** Spread the correct answer evenly across A/B/C, deterministically. */
export function placeOptions(correct: string, wrong: [string, string], index: number) {
  const pos = index % 3;
  const texts = [...wrong];
  texts.splice(pos, 0, correct);
  return { options: texts.map((text, i) => ({ key: KEYS[i], text })), correctKey: KEYS[pos] };
}

/** Seed the labelled sample curriculum + questions unless a version already exists. */
export async function seedSampleCurriculum(db: Db): Promise<{ created: boolean; written?: WrittenCurriculum }> {
  const existing = await db.select({ id: curriculumVersions.id }).from(curriculumVersions).where(eq(curriculumVersions.isActive, true)).limit(1);
  if (existing.length > 0) return { created: false };

  const written = await writeCurriculum(
    db,
    {
      ...SAMPLE_VERSION,
      isSample: true,
      topics: SAMPLE_TOPICS.map((t) => ({
        ...t,
        modules: t.modules.map((m) => ({ ...m, los: m.los.map(({ questions: _q, ...l }) => l) })),
      })),
    },
    { activate: true },
  );

  let qi = 0;
  for (const t of SAMPLE_TOPICS)
    for (const m of t.modules)
      for (const l of m.los)
        for (const q of l.questions) {
          const { options, correctKey } = placeOptions(q.correct, q.wrong, qi++);
          const [row] = await db
            .insert(questions)
            .values({ stem: q.stem, options, correctKey, explanation: q.explanation, difficulty: q.difficulty, status: "published" })
            .returning({ id: questions.id });
          await db.insert(questionLos).values({ questionId: row.id, losId: written.losIdByCode.get(l.code)!, isPrimary: true });
        }
  return { created: true, written };
}
