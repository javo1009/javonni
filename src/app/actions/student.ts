"use server";

// Student write actions. Pages read through services; every write comes through here.
// Actions take plain objects (or FormData for uploads) and return an ActionResult, never throw for user errors.

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { runAction, type ActionResult } from "@/server/action";
import { studentContext } from "@/server/context";
import { attachSubmissionFile, removeSubmissionFile, type FileMeta } from "@/services/files";
import { saveDraft, submitAssignment } from "@/services/homework";
import { pickQuestions, submitPracticeAnswer, type AnswerResult, type PracticeQuestion, type PracticeScope } from "@/services/practice";
import { addMock, deleteMock, deleteSession, exportBackup, importBackup, logSession, updateChapter, updateSettings } from "@/services/tracker";

const refresh = () => revalidatePath("/student", "layout");
const bad = (e: z.ZodError): ActionResult => ({ ok: false, error: e.issues[0]?.message ?? "Check the form and try again." });
const uuid = z.uuid();
const isoDate = z.iso.date({ error: "Enter a valid date." });

// ------------------------------------------------------------------ chapters

const ChapterSchema = z.object({
  moduleId: uuid,
  patch: z.object({
    read: z.boolean().optional(),
    practice: z.boolean().optional(),
    review: z.boolean().optional(),
    accuracy: z.number().min(0).max(100).nullable().optional(),
    confidence: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable().optional(),
    reviewedToday: z.boolean().optional(),
  }),
});

/** Tick read/practice/reviewed, set the practice score or confidence for one chapter. */
export async function setChapter(input: z.input<typeof ChapterSchema>): Promise<ActionResult> {
  const { actor, db, today } = await studentContext();
  const p = ChapterSchema.safeParse(input);
  if (!p.success) return bad(p.error);
  const r = await runAction(async () => void (await updateChapter(db, actor, p.data.moduleId, p.data.patch, today)));
  if (r.ok) refresh();
  return r;
}

// ------------------------------------------------------------------ settings

const SettingsSchema = z.object({
  examDate: isoDate.optional(),
  weeklyTargetHours: z.number({ error: "Enter hours as a number." }).optional(),
});

export async function saveSettings(input: z.input<typeof SettingsSchema>): Promise<ActionResult> {
  const { actor, db, today } = await studentContext();
  const p = SettingsSchema.safeParse(input);
  if (!p.success) return bad(p.error);
  const r = await runAction(async () => void (await updateSettings(db, actor, p.data, today)));
  if (r.ok) refresh();
  return r;
}

// --------------------------------------------------------------------- hours

const SessionSchema = z.object({
  date: isoDate,
  minutes: z.number({ error: "Enter the time studied." }).int({ error: "Use whole minutes." }),
  topic: z.string().min(1, { error: "Choose a topic." }).max(80),
  note: z.string().max(300).optional(),
  source: z.enum(["manual", "timer"]).optional(),
});

export async function addStudySession(input: z.input<typeof SessionSchema>): Promise<ActionResult> {
  const { actor, db, today } = await studentContext();
  const p = SessionSchema.safeParse(input);
  if (!p.success) return bad(p.error);
  const r = await runAction(async () => void (await logSession(db, actor, p.data, today)));
  if (r.ok) refresh();
  return r;
}

export async function removeStudySession(sessionId: string): Promise<ActionResult> {
  const { actor, db } = await studentContext();
  if (!uuid.safeParse(sessionId).success) return { ok: false, error: "Session not found." };
  const r = await runAction(async () => void (await deleteSession(db, actor, sessionId)));
  if (r.ok) refresh();
  return r;
}

// --------------------------------------------------------------------- mocks

const MockSchema = z.object({
  date: isoDate,
  score: z.number({ error: "Enter a score from 0 to 100." }),
  note: z.string().max(300).optional(),
});

export async function addMockResult(input: z.input<typeof MockSchema>): Promise<ActionResult> {
  const { actor, db, today } = await studentContext();
  const p = MockSchema.safeParse(input);
  if (!p.success) return bad(p.error);
  const r = await runAction(async () => void (await addMock(db, actor, p.data, today)));
  if (r.ok) refresh();
  return r;
}

export async function removeMockResult(mockId: string): Promise<ActionResult> {
  const { actor, db } = await studentContext();
  if (!uuid.safeParse(mockId).success) return { ok: false, error: "Mock result not found." };
  const r = await runAction(async () => void (await deleteMock(db, actor, mockId)));
  if (r.ok) refresh();
  return r;
}

// -------------------------------------------------------------------- backup

/** The backup as JSON text (same format as the sample dashboard's export). */
export async function exportBackupAction(): Promise<ActionResult<{ filename: string; json: string }>> {
  const { actor, db, today } = await studentContext();
  return runAction(async () => ({ filename: `cfa-progress-${today}.json`, json: JSON.stringify(await exportBackup(db, actor, today), null, 2) }));
}

const MAX_BACKUP_CHARS = 1_000_000;

/** Replace the student's progress with an uploaded backup. */
export async function importBackupAction(jsonText: string): Promise<ActionResult<{ chapters: number; sessions: number; mocks: number; skipped: unknown }>> {
  const { actor, db, today } = await studentContext();
  if (typeof jsonText !== "string" || jsonText.length > MAX_BACKUP_CHARS) return { ok: false, error: "That backup file is too large." };
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    return { ok: false, error: "That file isn't valid JSON." };
  }
  const r = await runAction(() => importBackup(db, actor, raw, today));
  if (r.ok) refresh();
  return r;
}

// ------------------------------------------------------------------ practice

const ScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("module"), id: uuid }),
  z.object({ kind: z.literal("topic"), id: uuid }),
  z.object({ kind: z.literal("weak") }),
  z.object({ kind: z.literal("mixed") }),
]);

export async function startPractice(scope: PracticeScope, count = 10): Promise<ActionResult<PracticeQuestion[]>> {
  const { actor, db } = await studentContext();
  const p = ScopeSchema.safeParse(scope);
  if (!p.success || !Number.isInteger(count) || count < 1 || count > 40) return { ok: false, error: "Choose what to practise." };
  return runAction(() => pickQuestions(db, actor, p.data, count));
}

const AnswerSchema = z.object({
  questionId: uuid,
  chosenKey: z.string().min(1).max(4),
  timeMs: z.number().int().min(0).max(3_600_000).nullable().optional(),
  mode: z.enum(["practice", "timed", "mock"]).optional(),
});

/** Marks one answer and reveals the key and explanation. Run only after the student commits an answer. */
export async function answerPractice(input: z.input<typeof AnswerSchema>): Promise<ActionResult<AnswerResult>> {
  const { actor, db } = await studentContext();
  const p = AnswerSchema.safeParse(input);
  if (!p.success) return bad(p.error) as ActionResult<AnswerResult>;
  const r = await runAction(() => submitPracticeAnswer(db, actor, p.data));
  // Practice scores feed the chapter table, but don't refresh mid-session; the page refreshes when it ends.
  return r;
}

/** Call when a practice session ends so Overview / chapter scores pick up the new results. */
export async function finishPractice(): Promise<void> {
  await studentContext();
  refresh();
}

// ------------------------------------------------------------------ homework

const AnswersSchema = z
  .array(z.object({ itemId: uuid, chosenKey: z.string().max(4).nullable().optional(), textAnswer: z.string().max(10_000).nullable().optional() }))
  .max(80);

export async function saveHomeworkDraft(assignmentId: string, answers: z.input<typeof AnswersSchema>): Promise<ActionResult> {
  const { actor, db } = await studentContext();
  const p = AnswersSchema.safeParse(answers);
  if (!uuid.safeParse(assignmentId).success || !p.success) return { ok: false, error: "Check your answers and try again." };
  return runAction(async () => void (await saveDraft(db, actor, assignmentId, p.data)));
}

export async function submitHomework(assignmentId: string, answers: z.input<typeof AnswersSchema>): Promise<ActionResult<{ status: string }>> {
  const { actor, db } = await studentContext();
  const p = AnswersSchema.safeParse(answers);
  if (!uuid.safeParse(assignmentId).success || !p.success) return { ok: false, error: "Check your answers and try again." };
  const r = await runAction(async () => ({ status: (await submitAssignment(db, actor, assignmentId, p.data)).status }));
  if (r.ok) refresh();
  return r;
}

/** FormData: assignmentId, itemId, file. One file per call (client loops for several). */
export async function uploadSubmissionFile(formData: FormData): Promise<ActionResult<FileMeta>> {
  const { actor, db } = await studentContext();
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  const file = formData.get("file");
  if (!uuid.safeParse(assignmentId).success || !uuid.safeParse(itemId).success) return { ok: false, error: "Homework not found." };
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a file to upload." };
  const bytes = Buffer.from(await file.arrayBuffer());
  const r = await runAction(() => attachSubmissionFile(db, actor, { assignmentId, itemId, file: { name: file.name, bytes } }));
  if (r.ok) refresh();
  return r;
}

export async function deleteSubmissionFile(fileId: string): Promise<ActionResult> {
  const { actor, db } = await studentContext();
  if (!uuid.safeParse(fileId).success) return { ok: false, error: "File not found." };
  const r = await runAction(async () => void (await removeSubmissionFile(db, actor, fileId)));
  if (r.ok) refresh();
  return r;
}
