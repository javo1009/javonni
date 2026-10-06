import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { losProgress, planItems, studyPlans, studySessions } from "@/db/schema";
import { assessProgress, type Assessment } from "@/domain/assessment";
import { addDays, diffDays, isValidDate, type ISODate } from "@/domain/dates";
import { generatePlan, type PlanOptions } from "@/domain/plan";
import type { PlanItemDraft, PlanWarning } from "@/domain/types";
import { getActiveCurriculum, type Curriculum } from "./curriculum";
import { buildSnapshot, loadProgress } from "./progress";
import { ForbiddenError, NotFoundError, ValidationError, type Actor, type Db } from "./types";

export type CreatePlanInput = {
  today: ISODate;
  examDate: ISODate;
  /** Minutes per weekday, Monday first. */
  weeklyMinutes: number[];
  blackoutDates?: ISODate[];
};

export type PlanRow = typeof studyPlans.$inferSelect;
export type PlanItemRow = typeof planItems.$inferSelect;

function assertStudent(actor: Actor) {
  if (actor.role !== "student") throw new ForbiddenError("Only students have a study plan.");
}

export function validatePlanInput(input: CreatePlanInput) {
  if (!isValidDate(input.examDate)) throw new ValidationError("Enter a valid exam date.");
  const days = diffDays(input.today, input.examDate);
  if (days < 3) throw new ValidationError("The exam date must be at least 3 days away.");
  if (days > 800) throw new ValidationError("The exam date is too far away.");
  if (input.weeklyMinutes.length !== 7 || input.weeklyMinutes.some((m) => !Number.isInteger(m) || m < 0 || m > 720))
    throw new ValidationError("Study time per day must be between 0 and 12 hours.");
  if (input.weeklyMinutes.reduce((a, b) => a + b, 0) === 0) throw new ValidationError("Add some study time to at least one day.");
  for (const d of input.blackoutDates ?? []) if (!isValidDate(d)) throw new ValidationError("A blackout date is invalid.");
}

/** Modules whose LOS are all marked studied: their reading is done. */
function completedModuleIds(c: Curriculum, studied: Set<string>): string[] {
  return c.modules.filter((m) => m.losIds.length > 0 && m.losIds.every((id) => studied.has(id))).map((m) => m.id);
}

type GenerateArgs = {
  c: Curriculum;
  studentId: string;
  today: ISODate;
  examDate: ISODate;
  weeklyMinutes: number[];
  blackoutDates: ISODate[];
  nowMs: number;
  options?: Partial<PlanOptions>;
};

async function generateFor(db: Db, a: GenerateArgs) {
  const progress = (await loadProgress(db, [a.studentId])).get(a.studentId)!;
  const snapshot = buildSnapshot(a.c, progress, a.nowMs);
  const studied = new Set([...progress].filter(([, p]) => p.studied).map(([id]) => id));
  const priorMastery: Record<string, number> = {};
  for (const [tid, st] of snapshot.topicStats) priorMastery[tid] = st.mastery;
  return generatePlan({
    startDate: a.today,
    examDate: a.examDate,
    weeklyMinutes: a.weeklyMinutes,
    blackoutDates: a.blackoutDates,
    topics: a.c.topics,
    modules: a.c.modules,
    priorMastery,
    completedModuleIds: completedModuleIds(a.c, studied),
    options: a.options,
  });
}

async function persistPlan(
  db: Db,
  a: GenerateArgs,
  plan: { items: PlanItemDraft[]; warnings: PlanWarning[]; summary: Record<string, number | string> },
) {
  return db.transaction(async (tx) => {
    await tx.update(studyPlans).set({ active: false }).where(and(eq(studyPlans.studentId, a.studentId), eq(studyPlans.active, true)));
    const [row] = await tx
      .insert(studyPlans)
      .values({
        studentId: a.studentId,
        versionId: a.c.version.id,
        startDate: a.today,
        examDate: a.examDate,
        weeklyMinutes: a.weeklyMinutes,
        blackoutDates: a.blackoutDates,
        warnings: plan.warnings,
        summary: plan.summary,
      })
      .returning({ id: studyPlans.id });
    const BATCH = 500;
    for (let i = 0; i < plan.items.length; i += BATCH) {
      await tx.insert(planItems).values(
        plan.items.slice(i, i + BATCH).map((it) => ({
          planId: row.id,
          date: it.date,
          type: it.type,
          phase: it.phase,
          title: it.title,
          minutes: it.minutes,
          topicId: it.topicId,
          moduleId: it.moduleId,
          losIds: it.losIds,
          part: it.part ?? null,
          parts: it.parts ?? null,
        })),
      );
    }
    return row.id;
  });
}

export async function createPlan(db: Db, actor: Actor, input: CreatePlanInput, nowMs = Date.now()) {
  assertStudent(actor);
  validatePlanInput(input);
  const c = await getActiveCurriculum(db);
  const args: GenerateArgs = {
    c,
    studentId: actor.id,
    today: input.today,
    examDate: input.examDate,
    weeklyMinutes: input.weeklyMinutes,
    blackoutDates: input.blackoutDates ?? [],
    nowMs,
  };
  const plan = await generateFor(db, args);
  if (plan.items.length === 0) throw new ValidationError(plan.warnings[0]?.message ?? "Couldn't build a plan from that.");
  const planId = await persistPlan(db, args, { ...plan, summary: plan.summary });
  return { planId, warnings: plan.warnings, summary: plan.summary };
}

export async function getActivePlan(db: Db, studentId: string): Promise<{ plan: PlanRow; items: PlanItemRow[] } | null> {
  const [plan] = await db
    .select()
    .from(studyPlans)
    .where(and(eq(studyPlans.studentId, studentId), eq(studyPlans.active, true)))
    .orderBy(desc(studyPlans.createdAt))
    .limit(1);
  if (!plan) return null;
  const items = await db
    .select()
    .from(planItems)
    .where(eq(planItems.planId, plan.id))
    .orderBy(asc(planItems.date), asc(planItems.id));
  return { plan, items };
}

async function ownItem(db: Db, actor: Actor, itemId: string) {
  assertStudent(actor);
  const [row] = await db
    .select({ item: planItems, studentId: studyPlans.studentId })
    .from(planItems)
    .innerJoin(studyPlans, eq(studyPlans.id, planItems.planId))
    .where(eq(planItems.id, itemId))
    .limit(1);
  if (!row) throw new NotFoundError("Task not found.");
  if (row.studentId !== actor.id) throw new ForbiddenError();
  return row.item;
}

/**
 * Mark a plan task done / skipped / todo. Done logs study time; finishing every
 * reading part of a module marks that module's objectives as studied.
 */
export async function setItemStatus(
  db: Db,
  actor: Actor,
  itemId: string,
  status: "todo" | "done" | "skipped",
  opts: { today: ISODate; actualMinutes?: number },
) {
  const item = await ownItem(db, actor, itemId);
  if (opts.actualMinutes !== undefined && (!Number.isInteger(opts.actualMinutes) || opts.actualMinutes < 1 || opts.actualMinutes > 720))
    throw new ValidationError("Minutes must be between 1 and 720.");

  await db.transaction(async (tx) => {
    await tx
      .update(planItems)
      .set({
        status,
        completedAt: status === "done" ? new Date() : null,
        actualMinutes: status === "done" ? (opts.actualMinutes ?? item.minutes) : null,
      })
      .where(eq(planItems.id, itemId));

    await tx.delete(studySessions).where(and(eq(studySessions.planItemId, itemId), eq(studySessions.studentId, actor.id)));
    if (status === "done") {
      await tx.insert(studySessions).values({
        studentId: actor.id,
        planItemId: itemId,
        date: opts.today,
        minutes: opts.actualMinutes ?? item.minutes,
        source: "plan",
      });
    }

    if (item.type === "read" && item.moduleId) {
      const parts = await tx
        .select({ status: planItems.status })
        .from(planItems)
        .where(and(eq(planItems.planId, item.planId), eq(planItems.moduleId, item.moduleId), eq(planItems.type, "read")));
      const allDone = parts.length > 0 && parts.every((p) => p.status === "done");
      const losIds = item.losIds;
      if (losIds.length > 0) {
        if (allDone) {
          for (const losId of losIds) {
            await tx
              .insert(losProgress)
              .values({ studentId: actor.id, losId, studied: true })
              .onConflictDoUpdate({ target: [losProgress.studentId, losProgress.losId], set: { studied: true, updatedAt: new Date() } });
          }
        } else {
          await tx
            .update(losProgress)
            .set({ studied: false, updatedAt: new Date() })
            .where(and(eq(losProgress.studentId, actor.id), inArray(losProgress.losId, losIds)));
        }
      }
    }
  });
}

/** Manual study-time entry that isn't tied to a plan task. */
export async function logSession(db: Db, actor: Actor, input: { today: ISODate; date: ISODate; minutes: number; note?: string }) {
  assertStudent(actor);
  if (!isValidDate(input.date)) throw new ValidationError("Enter a valid date.");
  if (input.date > input.today) throw new ValidationError("You can't log study time in the future.");
  if (diffDays(input.date, input.today) > 90) throw new ValidationError("That date is too far in the past.");
  if (!Number.isInteger(input.minutes) || input.minutes < 5 || input.minutes > 720)
    throw new ValidationError("Minutes must be between 5 and 720.");
  await db.insert(studySessions).values({
    studentId: actor.id,
    date: input.date,
    minutes: input.minutes,
    source: "manual",
    note: input.note?.trim().slice(0, 300) || null,
  });
}

export async function minutesStudied(db: Db, studentId: string, from: ISODate, to: ISODate): Promise<number> {
  const [r] = await db
    .select({ m: sql<number>`coalesce(sum(${studySessions.minutes}), 0)::int` })
    .from(studySessions)
    .where(and(eq(studySessions.studentId, studentId), gte(studySessions.date, from), lte(studySessions.date, to)));
  return r.m;
}

export async function assessActivePlan(db: Db, studentId: string, today: ISODate): Promise<(Assessment & { examDate: ISODate }) | null> {
  const active = await getActivePlan(db, studentId);
  if (!active) return null;
  const a = assessProgress({
    today,
    examDate: active.plan.examDate,
    items: active.items.map((i) => ({ date: i.date, minutes: i.minutes, status: i.status, type: i.type })),
  });
  return { ...a, examDate: active.plan.examDate };
}

export type ReplanChoice = { kind: "add_time"; extraMinutesPerWeek: number } | { kind: "drop_optional" } | { kind: "as_is" };

/** Spread extra weekly minutes across the days the student already studies (weekends weighted by their time). */
export function addWeeklyMinutes(weekly: number[], extra: number): number[] {
  const total = weekly.reduce((a, b) => a + b, 0);
  if (total === 0) return weekly;
  const out = weekly.map((m) => m + Math.round((extra * m) / total / 5) * 5);
  return out.map((m) => Math.min(720, m));
}

/**
 * Rebuild the plan from today for the content that's left. The student always
 * picks the option; nothing here runs automatically.
 */
export async function replan(db: Db, actor: Actor, choice: ReplanChoice, today: ISODate, nowMs = Date.now()) {
  assertStudent(actor);
  const active = await getActivePlan(db, actor.id);
  if (!active) throw new NotFoundError("You don't have a plan yet.");
  const c = await getActiveCurriculum(db, active.plan.versionId);
  let weekly = active.plan.weeklyMinutes;
  let options: Partial<PlanOptions> | undefined;
  if (choice.kind === "add_time") {
    if (!Number.isInteger(choice.extraMinutesPerWeek) || choice.extraMinutesPerWeek < 15 || choice.extraMinutesPerWeek > 600)
      throw new ValidationError("Extra time must be between 15 and 600 minutes per week.");
    weekly = addWeeklyMinutes(weekly, choice.extraMinutesPerWeek);
  }
  if (choice.kind === "drop_optional") options = { phaseSplit: { learn: 0.7, practice: 0.18, mock: 0.12 } };

  const args: GenerateArgs = {
    c,
    studentId: actor.id,
    today,
    examDate: active.plan.examDate,
    weeklyMinutes: weekly,
    blackoutDates: active.plan.blackoutDates.filter((d) => d >= today),
    nowMs,
    options,
  };
  validatePlanInput({ today, examDate: args.examDate, weeklyMinutes: weekly, blackoutDates: args.blackoutDates });
  const plan = await generateFor(db, args);
  if (plan.items.length === 0) throw new ValidationError(plan.warnings[0]?.message ?? "Couldn't rebuild the plan.");
  const planId = await persistPlan(db, args, plan);
  return { planId, warnings: plan.warnings, summary: plan.summary };
}

/**
 * Planned vs. studied minutes for a window, using for each date the plan that was
 * current on that date (so a re-plan doesn't erase an earlier shortfall).
 */
export async function adherenceWindow(db: Db, studentId: string, from: ISODate, to: ISODate) {
  const plans = await db
    .select({ id: studyPlans.id, startDate: studyPlans.startDate, createdAt: studyPlans.createdAt })
    .from(studyPlans)
    .where(eq(studyPlans.studentId, studentId))
    .orderBy(desc(studyPlans.createdAt));
  if (plans.length === 0) return { planned: 0, done: await minutesStudied(db, studentId, from, to) };
  const items = await db
    .select({ planId: planItems.planId, date: planItems.date, minutes: planItems.minutes })
    .from(planItems)
    .where(and(inArray(planItems.planId, plans.map((p) => p.id)), gte(planItems.date, from), lte(planItems.date, to)));
  let planned = 0;
  for (const it of items) {
    const owner = plans.find((p) => p.startDate <= it.date); // newest plan that had started by then
    if (owner && owner.id === it.planId) planned += it.minutes;
  }
  return { planned, done: await minutesStudied(db, studentId, from, to) };
}

export { addDays };
