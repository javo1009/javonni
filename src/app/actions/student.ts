"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod";
import type { PlanWarning } from "@/domain/types";
import { runAction, type ActionResult } from "@/server/action";
import { studentContext } from "@/server/context";
import { saveDraft, submitAssignment } from "@/services/homework";
import { createPlan, logSession, replan, setItemStatus } from "@/services/plan";
import { pickQuestions, submitPracticeAnswer, type AnswerResult, type PracticeQuestion } from "@/services/practice";

/** Every student page reads plan/progress, so refresh the whole area after a write. */
const refreshStudent = () => revalidatePath("/student", "layout");

const firstError = (e: z.ZodError) => e.issues[0]?.message ?? "Check the form and try again.";

// ------------------------------------------------------------- onboarding

export type PlanFormState =
  | {
      error?: string;
      fieldErrors?: Record<string, string[] | undefined>;
      result?: { warnings: PlanWarning[]; plannedMinutes: number; days: number };
    }
  | undefined;

const PlanSchema = z.object({
  examDate: z.iso.date({ error: "Enter your exam date." }),
  weeklyMinutes: z
    .array(z.coerce.number({ error: "Enter minutes as a number." }).int({ error: "Use whole minutes." }).min(0).max(720, { error: "Keep each day to 12 hours or less." }))
    .length(7),
  blackoutDates: z.array(z.iso.date({ error: "A day off is not a valid date." })).max(120, { error: "That's too many days off." }),
});

export async function createPlanAction(_prev: PlanFormState, formData: FormData): Promise<PlanFormState> {
  const { actor, db, today, now } = await studentContext();
  const parsed = PlanSchema.safeParse({
    examDate: formData.get("examDate"),
    weeklyMinutes: Array.from({ length: 7 }, (_, i) => formData.get(`day${i}`) || "0"),
    blackoutDates: formData.getAll("blackout").filter((v) => typeof v === "string" && v !== ""),
  });
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const blackout = [...new Set(parsed.data.blackoutDates)].filter((d) => d >= today && d <= parsed.data.examDate);
  const r = await runAction(() =>
    createPlan(db, actor, { today, examDate: parsed.data.examDate, weeklyMinutes: parsed.data.weeklyMinutes, blackoutDates: blackout }, now),
  );
  if (!r.ok) return { error: r.error };
  refreshStudent();
  return {
    result: {
      warnings: r.data.warnings,
      plannedMinutes: Number(r.data.summary.plannedMinutes) || 0,
      days: Number(r.data.summary.days) || 0,
    },
  };
}

// ------------------------------------------------------------------ tasks

const TaskStatusSchema = z.object({
  itemId: z.uuid(),
  status: z.enum(["todo", "done", "skipped"]),
  actualMinutes: z.number().int().min(1).max(720).optional(),
});

export async function setTaskStatus(input: z.input<typeof TaskStatusSchema>): Promise<ActionResult> {
  const { actor, db, today } = await studentContext();
  const parsed = TaskStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Minutes must be a whole number between 1 and 720." };
  const r = await runAction(async () => {
    await setItemStatus(db, actor, parsed.data.itemId, parsed.data.status, { today, actualMinutes: parsed.data.actualMinutes });
    return undefined;
  });
  if (r.ok) refreshStudent();
  return r;
}

export type LogTimeState = { ok?: boolean; message?: string; error?: string; fieldErrors?: Record<string, string[] | undefined> } | undefined;

const LogSchema = z.object({
  date: z.iso.date({ error: "Enter a valid date." }),
  minutes: z.coerce
    .number({ error: "Enter minutes as a number." })
    .int({ error: "Use whole minutes." })
    .min(5, { error: "Log at least 5 minutes." })
    .max(720, { error: "Log 12 hours or less at a time." }),
  note: z.string().max(300, { error: "Keep the note under 300 characters." }).optional(),
});

export async function logStudyTime(_prev: LogTimeState, formData: FormData): Promise<LogTimeState> {
  const { actor, db, today } = await studentContext();
  const parsed = LogSchema.safeParse({
    date: formData.get("date"),
    minutes: formData.get("minutes"),
    note: (formData.get("note") as string | null) ?? undefined,
  });
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const r = await runAction(() => logSession(db, actor, { today, ...parsed.data }));
  if (!r.ok) return { error: r.error };
  refreshStudent();
  return { ok: true, message: `Logged ${parsed.data.minutes} min.` };
}

// ----------------------------------------------------------------- replan

const ReplanSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("add_time"), extraMinutesPerWeek: z.number().int().min(15).max(600) }),
  z.object({ kind: z.literal("drop_optional") }),
  z.object({ kind: z.literal("as_is") }),
]);

/** On success this redirects to the plan, which shows the new plan's warnings; it only returns on error. */
export async function replanAction(choice: z.input<typeof ReplanSchema>): Promise<ActionResult> {
  const { actor, db, today, now } = await studentContext();
  const parsed = ReplanSchema.safeParse(choice);
  if (!parsed.success) return { ok: false, error: "That catch-up option isn't available." };
  const r = await runAction(() => replan(db, actor, parsed.data, today, now));
  if (!r.ok) return r;
  refreshStudent();
  redirect("/student/plan?rebuilt=1");
}

// --------------------------------------------------------------- practice

const ScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("los"), id: z.uuid() }),
  z.object({ kind: z.literal("module"), id: z.uuid() }),
  z.object({ kind: z.literal("topic"), id: z.uuid() }),
  z.object({ kind: z.literal("mixed") }),
  z.object({ kind: z.literal("review") }),
]);

export async function loadPracticeQuestions(scope: z.input<typeof ScopeSchema>, count: number): Promise<ActionResult<PracticeQuestion[]>> {
  const { actor, db, now } = await studentContext();
  const parsed = ScopeSchema.safeParse(scope);
  const n = z.number().int().min(1).max(30).safeParse(count);
  if (!parsed.success || !n.success) return { ok: false, error: "That practice set doesn't exist." };
  return runAction(() => pickQuestions(db, actor, parsed.data, n.data, now));
}

const AnswerSchema = z.object({
  questionId: z.uuid(),
  chosenKey: z.string().min(1).max(4),
  timeMs: z.number().int().min(0).max(3_600_000).nullable().optional(),
});

export async function answerPracticeQuestion(input: z.input<typeof AnswerSchema>): Promise<ActionResult<AnswerResult>> {
  const { actor, db } = await studentContext();
  const parsed = AnswerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  // No revalidation here: the session keeps its own state, and other pages render fresh on navigation.
  return runAction(() => submitPracticeAnswer(db, actor, { ...parsed.data, mode: "practice" }));
}

// --------------------------------------------------------------- homework

const HomeworkSchema = z.object({
  assignmentId: z.uuid(),
  answers: z
    .array(
      z.object({
        itemId: z.uuid(),
        chosenKey: z.string().min(1).max(4).nullable().optional(),
        textAnswer: z.string().max(10_000, { error: "That answer is too long." }).nullable().optional(),
      }),
    )
    .max(100),
});

export async function saveHomeworkDraft(input: z.input<typeof HomeworkSchema>): Promise<ActionResult<{ savedAt: number }>> {
  const { actor, db } = await studentContext();
  const parsed = HomeworkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const r = await runAction(async () => {
    await saveDraft(db, actor, parsed.data.assignmentId, parsed.data.answers);
    return { savedAt: Date.now() };
  });
  // Only the inbox chip changes ("In progress"); the open form keeps its own state.
  if (r.ok) revalidatePath("/student/homework");
  return r;
}

export async function submitHomework(input: z.input<typeof HomeworkSchema>): Promise<ActionResult> {
  const { actor, db } = await studentContext();
  const parsed = HomeworkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const r = await runAction(async () => {
    await submitAssignment(db, actor, parsed.data.assignmentId, parsed.data.answers);
    return undefined;
  });
  if (r.ok) refreshStudent();
  return r;
}
