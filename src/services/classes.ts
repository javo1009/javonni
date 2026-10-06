import { randomInt } from "node:crypto";
import { and, asc, eq, inArray, max, sql } from "drizzle-orm";
import { attempts, classes, enrollments, questions, studySessions, users } from "@/db/schema";
import { evaluateAlerts, groupAlerts, type Alert } from "@/domain/alerts";
import { addDays, startOfWeek, type ISODate } from "@/domain/dates";
import { applyAttempt, newMasteryState, type MasteryState } from "@/domain/mastery";
import { computeReadiness, type Readiness } from "@/domain/readiness";
import { getActiveCurriculum, type Curriculum } from "./curriculum";
import { adherenceWindow } from "./plan";
import { buildSnapshot, loadProgress, type StudentSnapshot } from "./progress";
import { ForbiddenError, NotFoundError, ValidationError, type Actor, type Db } from "./types";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

export function generateJoinCode(): string {
  return Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
}

/** The class, if the actor teaches it (admins can see every class). */
export async function assertClassAccess(db: Db, actor: Actor, classId: string) {
  if (actor.role === "student") throw new ForbiddenError();
  const [cls] = await db.select().from(classes).where(eq(classes.id, classId)).limit(1);
  if (!cls) throw new NotFoundError("Class not found.");
  if (actor.role !== "admin" && cls.teacherId !== actor.id) throw new ForbiddenError();
  return cls;
}

/** Teachers may view students enrolled in one of their classes; students only themselves. */
export async function assertCanViewStudent(db: Db, actor: Actor, studentId: string) {
  if (actor.role === "admin") return;
  if (actor.role === "student") {
    if (actor.id !== studentId) throw new ForbiddenError();
    return;
  }
  const [row] = await db
    .select({ id: classes.id })
    .from(enrollments)
    .innerJoin(classes, eq(classes.id, enrollments.classId))
    .where(and(eq(enrollments.studentId, studentId), eq(classes.teacherId, actor.id)))
    .limit(1);
  if (!row) throw new ForbiddenError();
}

export async function createClass(db: Db, actor: Actor, input: { name: string; examDate?: ISODate | null }) {
  if (actor.role !== "teacher" && actor.role !== "admin") throw new ForbiddenError("Only teachers can create classes.");
  const name = input.name.trim();
  if (name.length < 2 || name.length > 80) throw new ValidationError("Class name must be 2–80 characters.");
  for (let i = 0; i < 5; i++) {
    try {
      const [row] = await db
        .insert(classes)
        .values({ name, teacherId: actor.id, joinCode: generateJoinCode(), examDate: input.examDate ?? null })
        .returning();
      return row;
    } catch (e) {
      if ((e as { code?: string; cause?: { code?: string } }).cause?.code !== "23505" && (e as { code?: string }).code !== "23505") throw e;
    }
  }
  throw new Error("Could not generate a unique class code.");
}

export async function listClasses(db: Db, actor: Actor) {
  if (actor.role === "student") {
    return db
      .select({
        id: classes.id,
        name: classes.name,
        examDate: classes.examDate,
        joinCode: sql<string>`''`,
        students: sql<number>`0`,
      })
      .from(enrollments)
      .innerJoin(classes, eq(classes.id, enrollments.classId))
      .where(eq(enrollments.studentId, actor.id));
  }
  const rows = await db
    .select({
      id: classes.id,
      name: classes.name,
      examDate: classes.examDate,
      joinCode: classes.joinCode,
      students: sql<number>`(select count(*)::int from ${enrollments} e where e.class_id = ${classes.id})`,
    })
    .from(classes)
    .where(actor.role === "admin" ? eq(classes.archived, false) : and(eq(classes.teacherId, actor.id), eq(classes.archived, false)))
    .orderBy(asc(classes.createdAt));
  return rows;
}

export async function getRoster(db: Db, actor: Actor, classId: string) {
  await assertClassAccess(db, actor, classId);
  return db
    .select({ id: users.id, name: users.name, email: users.email, joinedAt: enrollments.joinedAt })
    .from(enrollments)
    .innerJoin(users, eq(users.id, enrollments.studentId))
    .where(eq(enrollments.classId, classId))
    .orderBy(asc(users.name));
}

/** Readiness at the end of each of the last `weeks` weeks, replaying attempts in order. */
export function weeklyReadinessFromAttempts(
  c: Curriculum,
  rows: { losId: string; correct: boolean; at: number; difficulty: number; mode: string }[],
  today: ISODate,
  weeks: number,
): number[] {
  const sorted = [...rows].sort((a, b) => a.at - b.at);
  const ends: number[] = [];
  const thisWeek = startOfWeek(today);
  for (let w = weeks - 1; w >= 0; w--) {
    const end = addDays(thisWeek, -7 * w + 7); // exclusive end of week
    const [y, m, d] = end.split("-").map(Number);
    ends.push(Date.UTC(y, m - 1, d));
  }
  const states = new Map<string, MasteryState>();
  const out: number[] = [];
  let i = 0;
  for (const end of ends) {
    while (i < sorted.length && sorted[i].at < end) {
      const r = sorted[i++];
      const difficulty = (r.difficulty === 1 || r.difficulty === 3 ? r.difficulty : 2) as 1 | 2 | 3;
      const context = r.mode === "homework" ? "homework" : r.mode === "practice" ? "practice" : "timed";
      states.set(r.losId, applyAttempt(states.get(r.losId) ?? newMasteryState(), { correct: r.correct, difficulty, context, at: r.at }));
    }
    out.push(computeReadiness(c.topics, c.modules, c.los, states, Math.min(end, Date.now())).mid);
  }
  return out;
}

export type StudentRow = {
  id: string;
  name: string;
  email: string;
  lastActive: ISODate | null;
  readiness: Readiness;
  snapshot: StudentSnapshot;
  adherence: { planned: number; done: number };
  hours7d: number;
  missedHomework: number;
  weeklyReadiness: number[];
  alerts: Alert[];
};

export type ClassOverview = {
  cls: { id: string; name: string; joinCode: string; examDate: string | null };
  curriculum: Curriculum;
  students: StudentRow[];
  attention: Alert[][];
  kpis: {
    readinessMid: number;
    adherencePct: number | null;
    activeThisWeek: number;
    total: number;
    homeworkOnTimePct: number | null;
  };
  /** Class-average mastery per topic and a "teach next" suggestion. */
  topicAverages: { topicId: string; mastery: number }[];
  teachNext: { topicId: string; reason: string } | null;
};

/**
 * Everything the cockpit and heatmap need, in a handful of queries.
 * `missedByStudent` and `onTime` come from the homework service.
 */
export async function getClassOverview(
  db: Db,
  actor: Actor,
  classId: string,
  today: ISODate,
  homework: { missedByStudent: Map<string, number>; onTimePct: number | null },
  nowMs = Date.now(),
): Promise<ClassOverview> {
  const cls = await assertClassAccess(db, actor, classId);
  const roster = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(enrollments)
    .innerJoin(users, eq(users.id, enrollments.studentId))
    .where(eq(enrollments.classId, classId))
    .orderBy(asc(users.name));
  const c = await getActiveCurriculum(db);
  const ids = roster.map((r) => r.id);
  const progress = await loadProgress(db, ids);

  const lastSession = ids.length
    ? await db
        .select({ studentId: studySessions.studentId, d: max(studySessions.date) })
        .from(studySessions)
        .where(inArray(studySessions.studentId, ids))
        .groupBy(studySessions.studentId)
    : [];
  const lastAttempt = ids.length
    ? await db
        .select({ studentId: attempts.studentId, at: max(attempts.createdAt) })
        .from(attempts)
        .where(inArray(attempts.studentId, ids))
        .groupBy(attempts.studentId)
    : [];
  const attemptRows = ids.length
    ? await db
        .select({
          studentId: attempts.studentId,
          losId: attempts.losId,
          correct: attempts.correct,
          createdAt: attempts.createdAt,
          mode: attempts.mode,
          difficulty: questions.difficulty,
        })
        .from(attempts)
        .innerJoin(questions, eq(questions.id, attempts.questionId))
        .where(inArray(attempts.studentId, ids))
    : [];
  const week7From = addDays(today, -6);
  const recentMinutes = ids.length
    ? await db
        .select({ studentId: studySessions.studentId, m: sql<number>`coalesce(sum(${studySessions.minutes}),0)::int` })
        .from(studySessions)
        .where(and(inArray(studySessions.studentId, ids), sql`${studySessions.date} >= ${week7From}`))
        .groupBy(studySessions.studentId)
    : [];

  const students: StudentRow[] = [];
  for (const r of roster) {
    const snap = buildSnapshot(c, progress.get(r.id)!, nowMs);
    const ls = lastSession.find((x) => x.studentId === r.id)?.d ?? null;
    const laAt = lastAttempt.find((x) => x.studentId === r.id)?.at ?? null;
    const la = laAt ? new Date(laAt).toISOString().slice(0, 10) : null;
    const lastActive = [ls, la].filter(Boolean).sort().pop() ?? null;
    const adherence = await adherenceWindow(db, r.id, addDays(today, -13), today);
    const weekly = weeklyReadinessFromAttempts(
      c,
      attemptRows
        .filter((a) => a.studentId === r.id)
        .map((a) => ({ losId: a.losId, correct: a.correct, at: a.createdAt.getTime(), difficulty: a.difficulty, mode: a.mode })),
      today,
      4,
    );
    const missed = homework.missedByStudent.get(r.id) ?? 0;
    const alerts = evaluateAlerts({
      studentId: r.id,
      name: r.name,
      today,
      lastActiveDate: lastActive,
      plannedMinutes14d: adherence.planned,
      doneMinutes14d: adherence.done,
      readinessWeekly: weekly,
      missedHomework: missed,
      mockScores: [],
    });
    students.push({
      ...r,
      lastActive,
      readiness: snap.readiness,
      snapshot: snap,
      adherence,
      hours7d: Math.round(((recentMinutes.find((x) => x.studentId === r.id)?.m ?? 0) / 60) * 10) / 10,
      missedHomework: missed,
      weeklyReadiness: weekly,
      alerts,
    });
  }

  const n = students.length;
  const planned = students.reduce((s, x) => s + x.adherence.planned, 0);
  const done = students.reduce((s, x) => s + Math.min(x.adherence.done, x.adherence.planned), 0);
  const topicAverages = c.topics.map((t) => ({
    topicId: t.id,
    mastery: n ? students.reduce((s, x) => s + (x.snapshot.topicStats.get(t.id)?.mastery ?? 0), 0) / n : 0,
  }));
  // Teach next: biggest gap weighted by exam weight.
  let teachNext: ClassOverview["teachNext"] = null;
  if (n) {
    const scored = c.topics
      .map((t) => {
        const avg = topicAverages.find((a) => a.topicId === t.id)!.mastery;
        return { t, avg, score: ((t.weightMin + t.weightMax) / 2) * (1 - avg) };
      })
      .sort((a, b) => b.score - a.score);
    const top = scored[0];
    teachNext = {
      topicId: top.t.id,
      reason: `Class average ${Math.round(top.avg * 100)}% on a ${top.t.weightMin}–${top.t.weightMax}% exam-weight topic.`,
    };
  }

  return {
    cls: { id: cls.id, name: cls.name, joinCode: cls.joinCode, examDate: cls.examDate },
    curriculum: c,
    students,
    attention: groupAlerts(students.flatMap((s) => s.alerts)),
    kpis: {
      readinessMid: n ? Math.round(students.reduce((s, x) => s + x.readiness.mid, 0) / n) : 0,
      adherencePct: planned > 0 ? Math.round((done / planned) * 100) : null,
      activeThisWeek: students.filter((s) => s.lastActive && s.lastActive >= week7From).length,
      total: n,
      homeworkOnTimePct: homework.onTimePct,
    },
    topicAverages,
    teachNext,
  };
}
