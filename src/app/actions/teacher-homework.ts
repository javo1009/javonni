"use server";

// Extra teacher homework actions for the builder: pick auto-marked questions and preview them in one round trip.

import * as z from "zod";
import { runAction, type ActionResult } from "@/server/action";
import { teacherContext } from "@/server/context";
import { assembleQuestions } from "@/services/homework";
import { questionPreviews, type BankQuestion } from "@/services/question-bank";

const uuid = z.uuid();

/** What the builder shows for a picked question (teachers may see the answer key). */
export type QuestionPreview = Pick<BankQuestion, "id" | "stem" | "options" | "correctKey" | "difficulty" | "moduleId" | "moduleNumber" | "moduleTitle" | "topicName">;

const toPreview = (q: BankQuestion): QuestionPreview => ({
  id: q.id,
  stem: q.stem,
  options: q.options,
  correctKey: q.correctKey,
  difficulty: q.difficulty,
  moduleId: q.moduleId,
  moduleNumber: q.moduleNumber,
  moduleTitle: q.moduleTitle,
  topicName: q.topicName,
});

const PickSchema = z.object({
  moduleIds: z.array(uuid).min(1, { error: "Pick at least one chapter." }).max(110),
  count: z.number({ error: "Enter how many questions." }).int().min(1, { error: "Pick at least 1 question." }).max(40, { error: "Pick at most 40 questions at a time." }),
  excludeIds: z.array(uuid).max(80).default([]),
});

/** Auto-pick questions from chapters (skipping `excludeIds`) and return them ready to preview. */
export async function pickAndPreviewQuestions(
  input: z.input<typeof PickSchema>,
): Promise<ActionResult<{ questions: QuestionPreview[]; uncoveredModuleIds: string[] }>> {
  const { actor, db } = await teacherContext();
  const p = PickSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Check the form and try again." };
  return runAction(async () => {
    const picked = await assembleQuestions(db, actor, p.data);
    const previews = await questionPreviews(db, actor, picked.questionIds);
    return { questions: previews.map(toPreview), uncoveredModuleIds: picked.uncoveredModuleIds };
  });
}

/** Re-fetch previews for ids already chosen (e.g. when a draft is reopened). */
export async function previewQuestions(ids: string[]): Promise<ActionResult<QuestionPreview[]>> {
  const { actor, db } = await teacherContext();
  if (!Array.isArray(ids) || ids.length > 60 || !ids.every((i) => uuid.safeParse(i).success)) return { ok: false, error: "Check the questions and try again." };
  return runAction(async () => (await questionPreviews(db, actor, ids)).map(toPreview));
}
