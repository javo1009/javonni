"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod";
import { runAction, type ActionResult } from "@/server/action";
import { teacherContext } from "@/server/context";
import { createClass } from "@/services/classes";
import { assembleQuestions, createAssignment, gradeSubmission, publishAssignment } from "@/services/homework";
import { questionPreviews, type QuestionPreview } from "@/services/teacher-views";

const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? "Check the form and try again.";

// ------------------------------------------------------------------ classes

export type CreateClassState = { error?: string; fieldErrors?: Record<string, string[] | undefined>; values?: { name?: string; examDate?: string } } | undefined;

const CreateClassSchema = z.object({
  name: z.string().trim().min(2, { error: "Use at least 2 characters." }).max(80, { error: "Keep it under 80 characters." }),
  examDate: z.union([z.literal(""), z.iso.date({ error: "Enter a valid date." })]).optional(),
});

export async function createClassAction(_prev: CreateClassState, formData: FormData): Promise<CreateClassState> {
  const { actor, db } = await teacherContext();
  const raw = { name: String(formData.get("name") ?? "").slice(0, 200), examDate: String(formData.get("examDate") ?? "").slice(0, 20) };
  const parsed = CreateClassSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors, values: raw };
  const res = await runAction(() => createClass(db, actor, { name: parsed.data.name, examDate: parsed.data.examDate || null }));
  if (!res.ok) return { error: res.error, values: raw };
  revalidatePath("/teacher", "layout");
  redirect(`/teacher/classes/${res.data.id}?created=1`);
}

// ----------------------------------------------------------------- homework

const AssembleSchema = z.object({
  losIds: z.array(z.uuid()).min(1, { error: "Pick at least one learning objective." }).max(200),
  count: z.number().int().min(1).max(40),
  excludeIds: z.array(z.uuid()).max(60).default([]),
});

export type AssembleResult = ActionResult<{ questions: QuestionPreview[]; coveredLosIds: string[]; uncoveredLosIds: string[] }>;

export async function assembleAction(input: unknown): Promise<AssembleResult> {
  const { actor, db } = await teacherContext();
  const parsed = AssembleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  return runAction(async () => {
    const r = await assembleQuestions(db, actor, parsed.data);
    const qs = await questionPreviews(db, actor, r.questionIds);
    return { questions: qs, coveredLosIds: r.coveredLosIds, uncoveredLosIds: r.uncoveredLosIds };
  });
}

const ItemSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("mcq"), questionId: z.uuid(), points: z.number().int().min(1).max(20).optional() }),
  z.object({
    kind: z.literal("text"),
    prompt: z.string().trim().min(5, { error: "Written prompts need at least 5 characters." }).max(2000),
    points: z.number().int().min(1, { error: "Points must be 1–20." }).max(20, { error: "Points must be 1–20." }),
  }),
]);

const CreateAssignmentSchema = z.object({
  classId: z.uuid({ error: "Choose a class." }),
  title: z.string().trim().min(3, { error: "Title must be 3–120 characters." }).max(120, { error: "Title must be 3–120 characters." }),
  instructions: z.string().max(4000).default(""),
  dueAt: z.iso.datetime({ error: "Enter a valid due date and time." }),
  target: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("class") }),
    z.object({ kind: z.literal("students"), studentIds: z.array(z.uuid()).min(1, { error: "Choose at least one student." }).max(500) }),
  ]),
  policies: z.object({ showAnswers: z.enum(["never", "after_due", "immediately"]), allowLate: z.boolean() }),
  items: z.array(ItemSchema).min(1, { error: "Add at least one item." }).max(60, { error: "Keep homework to 60 items or fewer." }),
  assign: z.boolean(),
});

export async function createAssignmentAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const { actor, db } = await teacherContext();
  const parsed = CreateAssignmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const d = parsed.data;
  const res = await runAction(async () => {
    const a = await createAssignment(db, actor, { ...d, dueAt: new Date(d.dueAt) });
    return { id: a.id };
  });
  if (res.ok) {
    revalidatePath("/teacher", "layout");
    revalidatePath("/student", "layout");
  }
  return res;
}

export type PublishState = { error?: string } | undefined;

export async function publishAssignmentAction(_prev: PublishState, formData: FormData): Promise<PublishState> {
  const { actor, db } = await teacherContext();
  const id = z.uuid().safeParse(formData.get("assignmentId"));
  if (!id.success) return { error: "Homework not found." };
  const res = await runAction(() => publishAssignment(db, actor, id.data));
  if (!res.ok) return { error: res.error };
  revalidatePath("/teacher", "layout");
  revalidatePath("/student", "layout");
  return undefined;
}

// ------------------------------------------------------------------ grading

const GradeSchema = z.object({
  submissionId: z.uuid(),
  items: z
    .array(
      z.object({
        itemId: z.uuid(),
        points: z.number({ error: "Enter points for every written answer." }).min(0, { error: "Points can't be negative." }).max(20),
        feedback: z.string().max(2000, { error: "Keep item feedback under 2000 characters." }).optional(),
      }),
    )
    .max(60),
  feedback: z.string().max(4000, { error: "Keep overall feedback under 4000 characters." }).optional(),
});

export async function gradeSubmissionAction(input: unknown): Promise<ActionResult<{ score: number | null; maxScore: number | null }>> {
  const { actor, db } = await teacherContext();
  const parsed = GradeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const { submissionId, ...grades } = parsed.data;
  const res = await runAction(async () => {
    const row = await gradeSubmission(db, actor, submissionId, grades);
    return { score: row.score, maxScore: row.maxScore };
  });
  if (res.ok) {
    revalidatePath("/teacher", "layout");
    revalidatePath("/student", "layout");
  }
  return res;
}
