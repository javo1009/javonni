// Read models for the student pages. These compose the existing services and only
// ever read the calling student's own data (actor.id), so they need no extra checks
// beyond "is a student".
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { assignmentItems, attempts, questionLos, questions, studySessions } from "@/db/schema";
import { assessProgress, type Assessment } from "@/domain/assessment";
import { addDays, diffDays, eachDay, startOfWeek, type ISODate } from "@/domain/dates";
import { evidenceOf, MASTERY_CONFIG } from "@/domain/mastery";
import type { LosStatus } from "@/domain/status";
import type { PlanItemType, PlanPhase } from "@/domain/types";
import { weeklyReadinessFromAttempts } from "./classes";
import { questionCountsByLos, type Curriculum } from "./curriculum";
import { getAssignmentForStudent, listStudentAssignments } from "./homework";
import { adherenceWindow, getActivePlan, type PlanItemRow } from "./plan";
import { buildSnapshot, loadProgress, type StudentSnapshot } from "./progress";
import { ForbiddenError, type Actor, type Db } from "./types";

function assertStudent(actor: Actor) {
  if (actor.role !== "student") throw new ForbiddenError();
}

// ------------------------------------------------------------------ tasks

export type TaskView = {
  id: string;
  date: ISODate;
  type: PlanItemType;
  phase: PlanPhase;
  title: string;
  minutes: number;
  actualMinutes: number | null;
  status: "todo" | "done" | "skipped";
  topicName: string | null;
  losCount: number;
  /** Where "Start" goes for tasks that are practice; null for reading. */
  practiceHref: string | null;
};

export function practiceHrefFor(item: Pick<PlanItemRow, "type" | "moduleId" | "topicId">): string | null {
  const base = "/student/practice/session";
  switch (item.type) {
    case "read":
      return null;
    case "practice":
    case "quiz":
      if (item.moduleId) return `${base}?scope=module&id=${item.moduleId}`;
      if (item.topicId) return `${base}?scope=topic&id=${item.topicId}`;
      return `${base}?scope=mixed`;
    case "mock":
      return `${base}?scope=mixed&count=30`;
    default:
      return item.topicId ? `${base}?scope=topic&id=${item.topicId}` : `${base}?scope=review`;
  }
}

export function toTaskView(item: PlanItemRow, c: Curriculum): TaskView {
  return {
    id: item.id,
    date: item.date,
    type: item.type as PlanItemType,
    phase: item.phase as PlanPhase,
    title: item.title,
    minutes: item.minutes,
    actualMinutes: item.actualMinutes,
    status: item.status,
    topicName: item.topicId ? (c.topics.find((t) => t.id === item.topicId)?.name ?? null) : null,
    losCount: item.losIds.length,
    practiceHref: practiceHrefFor(item),
  };
}

function assess(today: ISODate, examDate: ISODate, items: PlanItemRow[]): Assessment {
  return assessProgress({
    today,
    examDate,
    items: items.map((i) => ({ date: i.date, minutes: i.minutes, status: i.status, type: i.type })),
  });
}

// -------------------------------------------------------------- readiness

export async function readinessTrend(db: Db, c: Curriculum, studentId: string, today: ISODate, weeks = 6): Promise<number[]> {
  const rows = await db
    .select({
      losId: attempts.losId,
      correct: attempts.correct,
      createdAt: attempts.createdAt,
      mode: attempts.mode,
      difficulty: questions.difficulty,
    })
    .from(attempts)
    .innerJoin(questions, eq(questions.id, attempts.questionId))
    .where(eq(attempts.studentId, studentId));
  if (rows.length === 0) return [];
  return weeklyReadinessFromAttempts(
    c,
    rows.map((r) => ({ losId: r.losId, correct: r.correct, at: r.createdAt.getTime(), difficulty: r.difficulty, mode: r.mode })),
    today,
    weeks,
  );
}

export type AttentionHint = { key: string; text: string; href: string; tone: "warn" | "neutral" };

/** Up to three specific "needs attention" hints, most useful first. */
export function attentionHints(c: Curriculum, snap: StudentSnapshot): AttentionHint[] {
  const out: AttentionHint[] = [];
  if (snap.coverage.reviewDue > 0) {
    const n = snap.coverage.reviewDue;
    out.push({
      key: "review",
      text: `${n} objective${n === 1 ? " is" : "s are"} due for review`,
      href: "/student/practice/session?scope=review",
      tone: "warn",
    });
  }
  const weight = (t: Curriculum["topics"][number]) => (t.weightMin + t.weightMax) / 2;
  const below = c.topics.filter((t) => snap.topicStats.get(t.id)?.belowFloor).sort((a, b) => weight(b) - weight(a));
  for (const t of below.slice(0, 2)) {
    const m = Math.round((snap.topicStats.get(t.id)?.mastery ?? 0) * 100);
    out.push({ key: `floor-${t.id}`, text: `${t.name}: mastery ${m}%, below the 50% floor`, href: `/student/practice/session?scope=topic&id=${t.id}`, tone: "warn" });
  }
  if (out.length < 3 && !snap.readiness.insufficient) {
    const unseen = c.topics
      .filter((t) => (snap.readiness.topics.find((r) => r.topicId === t.id)?.attemptedShare ?? 0) === 0)
      .sort((a, b) => weight(b) - weight(a))[0];
    if (unseen) out.push({ key: `unseen-${unseen.id}`, text: `${unseen.name}: no practice evidence yet`, href: `/student/practice/session?scope=topic&id=${unseen.id}`, tone: "neutral" });
  }
  return out.slice(0, 3);
}

// ------------------------------------------------------------------ today

const OVERDUE_SHOWN = 5;

export async function getTodayView(db: Db, actor: Actor, a: { today: ISODate; nowMs: number; c: Curriculum }) {
  assertStudent(actor);
  const active = await getActivePlan(db, actor.id);
  if (!active) return null;
  const { plan, items } = active;
  const { today, c } = a;

  const assessment = assess(today, plan.examDate, items);
  const todayTasks = items.filter((i) => i.date === today).map((i) => toTaskView(i, c));
  const overdueAll = items.filter((i) => i.date < today && i.status === "todo").sort((x, y) => (x.date < y.date ? 1 : -1));
  const overdue = overdueAll.slice(0, OVERDUE_SHOWN).map((i) => toTaskView(i, c));

  const weekStart = startOfWeek(today);
  const week = await adherenceWindow(db, actor.id, weekStart, addDays(weekStart, 6));

  const progress = (await loadProgress(db, [actor.id])).get(actor.id)!;
  const snap = buildSnapshot(c, progress, a.nowMs);
  const trend = await readinessTrend(db, c, actor.id, today, 6);

  const now = new Date(a.nowMs);
  const soon = new Date(a.nowMs + 7 * 86_400_000);
  const homework = (await listStudentAssignments(db, actor, now)).filter(
    (h) => (h.status === "not_started" || h.status === "in_progress") && h.dueAt <= soon,
  );

  return {
    examDate: plan.examDate,
    daysToExam: diffDays(today, plan.examDate),
    assessment,
    todayTasks,
    todayMinutes: todayTasks.filter((t) => t.status !== "skipped").reduce((s, t) => s + t.minutes, 0),
    overdue,
    overdueCount: overdueAll.length,
    week: { start: weekStart, planned: week.planned, done: week.done },
    readiness: snap.readiness,
    trend,
    coverage: snap.coverage,
    homework,
    attention: attentionHints(c, snap),
  };
}

// ------------------------------------------------------------------- plan

export type PhaseSpan = { phase: PlanPhase; start: ISODate; end: ISODate; minutes: number };

export function phaseSpans(items: Pick<PlanItemRow, "phase" | "date" | "minutes">[]): PhaseSpan[] {
  const order: PlanPhase[] = ["learn", "practice", "mock"];
  const out: PhaseSpan[] = [];
  for (const phase of order) {
    const xs = items.filter((i) => i.phase === phase);
    if (xs.length === 0) continue;
    let start = xs[0].date;
    let end = xs[0].date;
    let minutes = 0;
    for (const x of xs) {
      if (x.date < start) start = x.date;
      if (x.date > end) end = x.date;
      minutes += x.minutes;
    }
    out.push({ phase, start, end, minutes });
  }
  return out;
}

/** Cumulative planned vs studied hours per day, plan start to exam. Studied stops at today. */
export function burnUpSeries(
  items: Pick<PlanItemRow, "date" | "minutes">[],
  studiedByDate: Map<ISODate, number>,
  start: ISODate,
  exam: ISODate,
  today: ISODate,
): { date: ISODate; planned: number; done: number | null }[] {
  const plannedBy = new Map<ISODate, number>();
  for (const i of items) plannedBy.set(i.date, (plannedBy.get(i.date) ?? 0) + i.minutes);
  let p = 0;
  let d = 0;
  const out: { date: ISODate; planned: number; done: number | null }[] = [];
  for (const day of eachDay(start, exam)) {
    p += plannedBy.get(day) ?? 0;
    d += studiedByDate.get(day) ?? 0;
    out.push({ date: day, planned: Math.round((p / 60) * 10) / 10, done: day <= today ? Math.round((d / 60) * 10) / 10 : null });
  }
  return out;
}

export async function getPlanWeekView(db: Db, actor: Actor, a: { today: ISODate; weekStart: ISODate; c: Curriculum }) {
  assertStudent(actor);
  const active = await getActivePlan(db, actor.id);
  if (!active) return null;
  const { plan, items } = active;
  const { today, c } = a;
  const weekEnd = addDays(a.weekStart, 6);
  const blackout = new Set(plan.blackoutDates);

  const days = eachDay(a.weekStart, weekEnd).map((date) => ({
    date,
    isToday: date === today,
    isBlackout: blackout.has(date),
    weekdayMinutes: plan.weeklyMinutes[diffDays(a.weekStart, date)] ?? 0,
    tasks: items.filter((i) => i.date === date).map((i) => toTaskView(i, c)),
  }));
  const weekTasks = days.flatMap((d) => d.tasks);

  const sessions = await db
    .select({ date: studySessions.date, m: sql<number>`coalesce(sum(${studySessions.minutes}), 0)::int` })
    .from(studySessions)
    .where(and(eq(studySessions.studentId, actor.id), gte(studySessions.date, plan.startDate), lte(studySessions.date, today)))
    .groupBy(studySessions.date);
  const studied = new Map(sessions.map((s) => [s.date, s.m]));
  const studiedTotal = sessions.reduce((s, x) => s + x.m, 0);
  const dueTotal = items.filter((i) => i.date <= today).reduce((s, i) => s + i.minutes, 0);
  const plannedTotal = items.reduce((s, i) => s + i.minutes, 0);

  return {
    plan: {
      startDate: plan.startDate,
      examDate: plan.examDate,
      weeklyMinutes: plan.weeklyMinutes,
      warnings: plan.warnings,
    },
    days,
    weekPlanned: weekTasks.reduce((s, t) => s + t.minutes, 0),
    weekDone: weekTasks.filter((t) => t.status === "done").reduce((s, t) => s + (t.actualMinutes ?? t.minutes), 0),
    burnUp: burnUpSeries(items, studied, plan.startDate, plan.examDate, today),
    totals: { studied: studiedTotal, due: dueTotal, planned: plannedTotal },
    phases: phaseSpans(items),
    assessment: assess(today, plan.examDate, items),
  };
}

// -------------------------------------------------------------------- map

export async function getStudentSnapshot(db: Db, actor: Actor, c: Curriculum, nowMs: number) {
  assertStudent(actor);
  const progress = (await loadProgress(db, [actor.id])).get(actor.id)!;
  return { progress, snap: buildSnapshot(c, progress, nowMs) };
}

export function mapTopics(c: Curriculum, snap: StudentSnapshot) {
  return c.topics.map((t) => ({
    id: t.id,
    code: t.code,
    name: t.name,
    weightMin: t.weightMin,
    weightMax: t.weightMax,
    proficientPct: snap.topicStats.get(t.id)?.proficiencyPct ?? 0,
    los: c.los
      .filter((l) => c.topicByLos.get(l.id) === t.id)
      .map((l) => ({ id: l.id, code: l.code, text: l.text, status: snap.statusByLos.get(l.id)!, mastery: snap.masteryByLos.get(l.id) ?? 0 })),
  }));
}

/** A plain-language reason for an objective's colour. */
export function explainStatus(
  status: LosStatus,
  p: { attempts: number; activeDays: number; mastery: number; daysSinceLast: number | null; studied: boolean },
): string {
  const m = Math.round(p.mastery * 100);
  const target = Math.round(MASTERY_CONFIG.proficientMastery * 100);
  const need = MASTERY_CONFIG.practicedAttempts;
  switch (status) {
    case "not_started":
      return "You haven't finished the reading for this module or answered a question on it yet, so it's drawn hatched.";
    case "studied": {
      const left = Math.max(1, need - p.attempts);
      return p.studied
        ? `You've done the reading. Answer ${left} more question${left === 1 ? "" : "s"} to start building a mastery colour.`
        : `You've started answering questions here. Answer ${left} more to start building a mastery colour.`;
    }
    case "practiced":
      if (p.mastery >= MASTERY_CONFIG.proficientMastery && p.activeDays < MASTERY_CONFIG.proficientDays)
        return `Mastery is ${m}%, which is enough, but all on one day. Practise again on another day to confirm it and reach proficient.`;
      return `Mastery is ${m}% from ${p.attempts} answers. Proficient needs ${target}% or more, on at least ${MASTERY_CONFIG.proficientDays} different days.`;
    case "proficient":
      return `Mastery is ${m}% across ${p.activeDays} days of practice. If you don't practise it for ${MASTERY_CONFIG.reviewIntervalDays} days, or mastery dips below ${target}%, it will ask for a review.`;
    case "review_due":
      return p.daysSinceLast !== null && p.daysSinceLast > MASTERY_CONFIG.reviewIntervalDays
        ? `You were proficient here, but it's been ${p.daysSinceLast} days since you last practised it. A few questions will bring it back.`
        : `You were proficient here, but recent answers brought mastery down to ${m}%. A short review will bring it back.`;
  }
}

export async function getLosDetail(db: Db, actor: Actor, losId: string, a: { c: Curriculum; nowMs: number }) {
  assertStudent(actor);
  const { c, nowMs } = a;
  const l = c.los.find((x) => x.id === losId);
  if (!l) return null;
  const mod = c.modules.find((m) => m.id === l.moduleId)!;
  const topic = c.topics.find((t) => t.id === mod.topicId)!;

  const { progress, snap } = await getStudentSnapshot(db, actor, c, nowMs);
  const p = progress.get(l.id);
  const status = snap.statusByLos.get(l.id)!;
  const mastery = snap.masteryByLos.get(l.id) ?? 0;
  const lastAt = p?.state.lastAt ?? null;
  const daysSinceLast = lastAt === null ? null : Math.floor((nowMs - lastAt) / 86_400_000);

  const recent = await db
    .select({ at: attempts.createdAt, correct: attempts.correct, mode: attempts.mode, difficulty: questions.difficulty })
    .from(attempts)
    .innerJoin(questions, eq(questions.id, attempts.questionId))
    .where(and(eq(attempts.studentId, actor.id), eq(attempts.losId, l.id)))
    .orderBy(desc(attempts.createdAt))
    .limit(10);
  const questionCount = (await questionCountsByLos(db)).get(l.id) ?? 0;

  const info = {
    attempts: p?.state.attempts ?? 0,
    activeDays: p?.state.activeDays ?? 0,
    mastery,
    daysSinceLast,
    studied: p?.studied ?? false,
  };
  return {
    los: l,
    module: { id: mod.id, title: mod.title },
    topic: { id: topic.id, name: topic.name, code: topic.code },
    status,
    evidence: p ? evidenceOf(p.state, nowMs) : 0,
    ...info,
    lastAt,
    recent,
    questionCount,
    why: explainStatus(status, info),
  };
}

// --------------------------------------------------------------- homework

/** The student's view of one assignment, plus each MCQ item's primary objective. */
export async function getHomeworkDetail(db: Db, actor: Actor, assignmentId: string, a: { c: Curriculum; now: Date }) {
  const hw = await getAssignmentForStudent(db, actor, assignmentId, a.now); // authorizes
  const links = await db
    .select({ itemId: assignmentItems.id, losId: questionLos.losId })
    .from(assignmentItems)
    .innerJoin(questionLos, and(eq(questionLos.questionId, assignmentItems.questionId), eq(questionLos.isPrimary, true)))
    .where(eq(assignmentItems.assignmentId, hw.assignment.id));
  const objectives: Record<string, { losId: string; code: string }> = {};
  for (const k of links) {
    const l = a.c.los.find((x) => x.id === k.losId);
    if (l) objectives[k.itemId] = { losId: l.id, code: l.code };
  }
  return { ...hw, objectives };
}
