"use server";

// Teacher (and admin) write actions: classes, homework with file handouts, grading with feedback files.

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { runAction, type ActionResult } from "@/server/action";
import { teacherContext } from "@/server/context";
import { createClass, updateClassSettings } from "@/services/classes";
import { attachAssignmentFile, attachFeedbackFile, removeAssignmentFile, removeFeedbackFile, type FileMeta } from "@/services/files";
import { assembleQuestions, createAssignment, gradeSubmission, publishAssignment } from "@/services/homework";

const refresh = () => revalidatePath("/teacher", "layout");
const bad = (e: z.ZodError): ActionResult<never> => ({ ok: false, error: e.issues[0]?.message ?? "Check the form and try again." });
const uuid = z.uuid();
const isoDate = z.iso.date({ error: "Enter a valid date." });

// ------------------------------------------------------------------ classes

const ClassSchema = z.object({
  name: z.string().trim().min(2, { error: "Use at least 2 characters." }).max(80, { error: "Keep it under 80 characters." }),
  examDate: isoDate.nullable().optional(),
  planStart: isoDate.nullable().optional(),
  weeklyTargetHours: z.number({ error: "Enter hours as a number." }).optional(),
});

export async function createClassAction(input: z.input<typeof ClassSchema>): Promise<ActionResult<{ id: string }>> {
  const { actor, db, today } = await teacherContext();
  const p = ClassSchema.safeParse(input);
  if (!p.success) return bad(p.error);
  const r = await runAction(async () => ({ id: (await createClass(db, actor, p.data, today)).id }));
  if (r.ok) refresh();
  return r;
}

export async function updateClassAction(classId: string, input: z.input<typeof ClassSchema> & { applyToStudents?: boolean }): Promise<ActionResult> {
  const { actor, db, today } = await teacherContext();
  const p = ClassSchema.partial().extend({ applyToStudents: z.boolean().optional() }).safeParse(input);
  if (!uuid.safeParse(classId).success || !p.success) return { ok: false, error: "Check the form and try again." };
  const r = await runAction(async () => void (await updateClassSettings(db, actor, classId, p.data, today)));
  if (r.ok) refresh();
  return r;
}

// ----------------------------------------------------------------- homework

const AssembleSchema = z.object({
  moduleIds: z.array(uuid).min(1, { error: "Pick at least one chapter." }).max(110),
  count: z.number().int().min(1).max(40),
  excludeIds: z.array(uuid).max(60).default([]),
});

export async function pickHomeworkQuestions(input: z.input<typeof AssembleSchema>) {
  const { actor, db } = await teacherContext();
  const p = AssembleSchema.safeParse(input);
  if (!p.success) return bad(p.error);
  return runAction(() => assembleQuestions(db, actor, p.data));
}

const ItemSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("mcq"), questionId: uuid, points: z.number().int().min(1).max(20).optional() }),
  z.object({ kind: z.literal("text"), prompt: z.string().max(2000), points: z.number().int().min(1).max(20).optional() }),
  z.object({ kind: z.literal("file"), prompt: z.string().max(2000), points: z.number().int().min(1).max(20).optional() }),
]);

const HomeworkSchema = z.object({
  classId: uuid,
  title: z.string().max(200),
  instructions: z.string().max(4000).optional(),
  /** ISO timestamp (the form converts the teacher's local due date/time). */
  dueAt: z.iso.datetime({ offset: true, error: "Enter a valid due date." }),
  target: z.discriminatedUnion("kind", [z.object({ kind: z.literal("class") }), z.object({ kind: z.literal("students"), studentIds: z.array(uuid).max(500) })]),
  policies: z.object({ showAnswers: z.enum(["never", "after_due", "immediately"]), allowLate: z.boolean() }),
  items: z.array(ItemSchema).min(1, { error: "Add at least one item." }).max(60),
  /** false saves a draft, which is the only state where handout files can be added before students see it. */
  assign: z.boolean(),
});

/** Creates the homework (draft or assigned). Attach handout files afterwards with uploadHandout while it's a draft. */
export async function createHomework(input: z.input<typeof HomeworkSchema>): Promise<ActionResult<{ id: string; status: string }>> {
  const { actor, db } = await teacherContext();
  const p = HomeworkSchema.safeParse(input);
  if (!p.success) return bad(p.error);
  const r = await runAction(async () => {
    const a = await createAssignment(db, actor, { ...p.data, dueAt: new Date(p.data.dueAt) });
    return { id: a.id, status: a.status };
  });
  if (r.ok) refresh();
  return r;
}

export async function publishHomework(assignmentId: string): Promise<ActionResult> {
  const { actor, db } = await teacherContext();
  if (!uuid.safeParse(assignmentId).success) return { ok: false, error: "Homework not found." };
  const r = await runAction(async () => void (await publishAssignment(db, actor, assignmentId)));
  if (r.ok) refresh();
  return r;
}

/** FormData: assignmentId, file. Handouts may be added to drafts or live homework; removal only on drafts. */
export async function uploadHandout(formData: FormData): Promise<ActionResult<FileMeta>> {
  const { actor, db } = await teacherContext();
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const file = formData.get("file");
  if (!uuid.safeParse(assignmentId).success) return { ok: false, error: "Homework not found." };
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a file to upload." };
  const bytes = Buffer.from(await file.arrayBuffer());
  const r = await runAction(() => attachAssignmentFile(db, actor, assignmentId, { name: file.name, bytes }));
  if (r.ok) refresh();
  return r;
}

export async function deleteHandout(fileId: string): Promise<ActionResult> {
  const { actor, db } = await teacherContext();
  if (!uuid.safeParse(fileId).success) return { ok: false, error: "File not found." };
  const r = await runAction(async () => void (await removeAssignmentFile(db, actor, fileId)));
  if (r.ok) refresh();
  return r;
}

// ------------------------------------------------------------------ grading

const GradeSchema = z.object({
  items: z.array(z.object({ itemId: uuid, points: z.number().min(0).max(20), feedback: z.string().max(2000).optional() })).max(80),
  feedback: z.string().max(4000).optional(),
});

/** Saves marks and returns the work to the student (every written/file item must be marked). */
export async function gradeHomework(submissionId: string, input: z.input<typeof GradeSchema>): Promise<ActionResult> {
  const { actor, db } = await teacherContext();
  const p = GradeSchema.safeParse(input);
  if (!uuid.safeParse(submissionId).success || !p.success) return { ok: false, error: "Check the marks and try again." };
  const r = await runAction(async () => void (await gradeSubmission(db, actor, submissionId, p.data)));
  if (r.ok) refresh();
  return r;
}

/** FormData: submissionId, file. A marked-up copy for the student; they see it once the work is graded. */
export async function uploadFeedbackFile(formData: FormData): Promise<ActionResult<FileMeta>> {
  const { actor, db } = await teacherContext();
  const submissionId = String(formData.get("submissionId") ?? "");
  const file = formData.get("file");
  if (!uuid.safeParse(submissionId).success) return { ok: false, error: "Submission not found." };
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a file to upload." };
  const bytes = Buffer.from(await file.arrayBuffer());
  const r = await runAction(() => attachFeedbackFile(db, actor, submissionId, { name: file.name, bytes }));
  if (r.ok) refresh();
  return r;
}

export async function deleteFeedbackFile(fileId: string): Promise<ActionResult> {
  const { actor, db } = await teacherContext();
  if (!uuid.safeParse(fileId).success) return { ok: false, error: "File not found." };
  const r = await runAction(async () => void (await removeFeedbackFile(db, actor, fileId)));
  if (r.ok) refresh();
  return r;
}
