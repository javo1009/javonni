import { randomInt } from "node:crypto";
import { and, asc, eq, inArray, max, sql } from "drizzle-orm";
import { attempts, classes, enrollments, mockResults, moduleProgress, studentProfiles, studySessions, users } from "@/db/schema";
import { evaluateAlerts, groupAlerts, type Alert } from "@/domain/alerts";
import { addDays, diffDays, isValidDate, type ISODate } from "@/domain/dates";
import {
  TRACKER,
  buildRoadmap,
  expectedChaptersRead,
  hoursInRange,
  mockStats,
  topicProgress,
  totals,
  weekBounds,
  weightLabel,
  type MockStats,
  type PaceStatus,
  type Totals,
} from "@/domain/tracker";
import { assertClassAccess } from "./access";
import { getActiveCurriculum } from "./curriculum";
import { homeworkStats } from "./homework";
import { MAX_EXAM_DATE, MIN_EXAM_DATE, defaultProfile, loadChapterStates, minutesByDate, validateWeeklyHours, type Profile } from "./tracker";
import { ForbiddenError, ValidationError, type Actor, type Db } from "./types";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

export function generateJoinCode(): string {
  return Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
}

export type ClassSettings = { name: string; examDate: ISODate | null; planStart: ISODate | null; weeklyTargetHours: number };

function validateClassSettings(s: Partial<ClassSettings>, today: ISODate) {
  if (s.name !== undefined && (s.name.trim().length < 2 || s.name.trim().length > 80)) throw new ValidationError("Class name must be 2–80 characters.");
  if (s.examDate) {
    if (!isValidDate(s.examDate)) throw new ValidationError("Enter a valid exam date.");
    if (s.examDate < MIN_EXAM_DATE || s.examDate > MAX_EXAM_DATE) throw new ValidationError("The 2027 curriculum applies to exams from February to December 2027.");
    if (diffDays(today, s.examDate) < 7) throw new ValidationError("The exam date must be at least a week away.");
  }
  if (s.planStart) {
    if (!isValidDate(s.planStart)) throw new ValidationError("Enter a valid roadmap start date.");
    if (s.examDate && diffDays(s.planStart, s.examDate) < 28) throw new ValidationError("The roadmap needs at least four weeks before the exam.");
  }
  if (s.weeklyTargetHours !== undefined) validateWeeklyHours(s.weeklyTargetHours);
}

export async function createClass(db: Db, actor: Actor, input: Partial<ClassSettings> & { name: string }, today: ISODate = new Date().toISOString().slice(0, 10)) {
  if (actor.role !== "teacher" && actor.role !== "admin") throw new ForbiddenError("Only teachers can create classes.");
  validateClassSettings(input, today);
  for (let i = 0; i < 5; i++) {
    try {
      const [row] = await db
        .insert(classes)
        .values({
          name: input.name.trim(),
          teacherId: actor.id,
          joinCode: generateJoinCode(),
          examDate: input.examDate ?? null,
          planStart: input.planStart ?? null,
          weeklyTargetMinutes: Math.round((input.weeklyTargetHours ?? TRACKER.defaultWeeklyMinutes / 60) * 60),
        })
        .returning();
      return row;
    } catch (e) {
      const code = (e as { code?: string; cause?: { code?: string } }).code ?? (e as { cause?: { code?: string } }).cause?.code;
      if (code !== "23505") throw e;
    }
  }
  throw new Error("Could not generate a unique class code.");
}

/**
 * Change a class's name and defaults. With `applyToStudents`, every enrolled student's
 * exam date, roadmap start and weekly target are set to the class's values too.
 */
export async function updateClassSettings(
  db: Db,
  actor: Actor,
  classId: string,
  input: Partial<ClassSettings> & { applyToStudents?: boolean },
  today: ISODate,
) {
  const cls = await assertClassAccess(db, actor, classId);
  validateClassSettings(input, today);
  const next = {
    name: input.name?.trim() ?? cls.name,
    examDate: input.examDate === undefined ? cls.examDate : input.examDate,
    planStart: input.planStart === undefined ? cls.planStart : input.planStart,
    weeklyTargetMinutes: input.weeklyTargetHours === undefined ? cls.weeklyTargetMinutes : Math.round(input.weeklyTargetHours * 60),
  };
  if (next.examDate && next.planStart && diffDays(next.planStart, next.examDate) < 28) throw new ValidationError("The roadmap needs at least four weeks before the exam.");
  await db.transaction(async (tx) => {
    await tx.update(classes).set(next).where(eq(classes.id, classId));
    if (input.applyToStudents) {
      const roster = await tx.select({ id: enrollments.studentId }).from(enrollments).where(eq(enrollments.classId, classId));
      for (const r of roster) {
        const base = await defaultProfile(tx as unknown as Db, r.id, today);
        const values = {
          studentId: r.id,
          examDate: next.examDate ?? base.examDate,
          planStart: next.planStart ?? base.planStart,
          weeklyTargetMinutes: next.weeklyTargetMinutes,
          updatedAt: new Date(),
        };
        await tx.insert(studentProfiles).values(values).onConflictDoUpdate({ target: studentProfiles.studentId, set: values });
      }
    }
  });
}

export async function listClasses(db: Db, actor: Actor) {
  if (actor.role === "student") {
    return db
      .select({ id: classes.id, name: classes.name, examDate: classes.examDate, joinCode: sql<string>`''`, students: sql<number>`0` })
      .from(enrollments)
      .innerJoin(classes, eq(classes.id, enrollments.classId))
      .where(eq(enrollments.studentId, actor.id));
  }
  return db
    .select({
      id: classes.id,
      name: classes.name,
      examDate: classes.examDate,
      planStart: classes.planStart,
      weeklyTargetMinutes: classes.weeklyTargetMinutes,
      joinCode: classes.joinCode,
      students: sql<number>`(select count(*)::int from ${enrollments} e where e.class_id = ${classes.id})`,
    })
    .from(classes)
    .where(actor.role === "admin" ? eq(classes.archived, false) : and(eq(classes.teacherId, actor.id), eq(classes.archived, false)))
    .orderBy(asc(classes.createdAt));
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

// ------------------------------------------------------------- overview
export type StudentRow = {
  id: string;
  name: string;
  email: string;
  joinedOn: ISODate;
  examDate: ISODate;
  weeklyTargetHours: number;
  lastActive: ISODate | null;
  totals: Totals;
  /** Per topic id. */
  topics: Record<string, { read: number; total: number; complete: number; avgAccuracy: number | null; scored: number }>;
  hoursThisWeek: number;
  hours14d: number;
  chaptersExpected: number;
  /** Positive: behind the roadmap. */
  behindBy: number;
  mocks: MockStats;
  scored: number;
  avgAccuracy: number | null;
  missedHomework: number;
  alerts: Alert[];
};

export type ClassOverview = {
  cls: { id: string; name: string; joinCode: string; examDate: string | null; planStart: string | null; weeklyTargetHours: number };
  topics: { id: string; name: string; weightLabel: string }[];
  students: StudentRow[];
  attention: Alert[][];
  kpis: {
    total: number;
    avgReadPct: number;
    avgCompletePct: number;
    avgHoursThisWeek: number;
    avgTargetHours: number;
    activeThisWeek: number;
    behindRoadmap: number;
    avgLatestMock: number | null;
    homeworkOnTimePct: number | null;
  };
  /** Class-wide per topic, in study order. */
  topicSummary: { topicId: string; avgReadPct: number; avgAccuracy: number | null; scoredStudents: number }[];
  /** The topic with the lowest average practice score (or lowest coverage when nobody has scores). */
  weakestTopic: { topicId: string; reason: string } | null;
};

const dateOf = (d: Date | string | null): ISODate | null => (d ? (typeof d === "string" ? d : d.toISOString().slice(0, 10)) : null);
const latest = (...ds: (ISODate | null)[]) => ds.filter((d): d is ISODate => !!d).sort().pop() ?? null;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Everything the cockpit needs for one class, in a fixed number of queries. */
export async function getClassOverview(db: Db, actor: Actor, classId: string, today: ISODate, nowMs = Date.now()): Promise<ClassOverview> {
  const cls = await assertClassAccess(db, actor, classId);
  const cur = await getActiveCurriculum(db);
  const roster = await db
    .select({ id: users.id, name: users.name, email: users.email, joinedAt: enrollments.joinedAt })
    .from(enrollments)
    .innerJoin(users, eq(users.id, enrollments.studentId))
    .where(eq(enrollments.classId, classId))
    .orderBy(asc(users.name));
  const ids = roster.map((r) => r.id);
  const hw = await homeworkStats(db, classId, new Date(nowMs));

  const [profileRows, states, sessions, mocks, lastProgress, lastAttempt] = ids.length
    ? await Promise.all([
        db.select().from(studentProfiles).where(inArray(studentProfiles.studentId, ids)),
        loadChapterStates(db, ids),
        db
          .select({ studentId: studySessions.studentId, date: studySessions.date, minutes: sql<number>`sum(${studySessions.minutes})::int` })
          .from(studySessions)
          .where(inArray(studySessions.studentId, ids))
          .groupBy(studySessions.studentId, studySessions.date),
        db.select().from(mockResults).where(inArray(mockResults.studentId, ids)),
        db.select({ studentId: moduleProgress.studentId, at: max(moduleProgress.updatedAt) }).from(moduleProgress).where(inArray(moduleProgress.studentId, ids)).groupBy(moduleProgress.studentId),
        db.select({ studentId: attempts.studentId, at: max(attempts.createdAt) }).from(attempts).where(inArray(attempts.studentId, ids)).groupBy(attempts.studentId),
      ])
    : [[], new Map(), [], [], [], []];

  const classDefault: Profile = {
    examDate: cls.examDate ?? TRACKER.defaultExamDate,
    planStart: cls.planStart ?? today,
    weeklyTargetMinutes: cls.weeklyTargetMinutes,
  };
  const week = weekBounds(today);
  const rows: StudentRow[] = [];
  for (const r of roster) {
    const p = profileRows.find((x) => x.studentId === r.id);
    const profile: Profile = p ? { examDate: p.examDate, planStart: p.planStart, weeklyTargetMinutes: p.weeklyTargetMinutes } : classDefault;
    const st = (states as Map<string, Map<string, import("@/domain/tracker").ChapterState>>).get(r.id)!;
    const progress = topicProgress(cur.topics, cur.modules, st);
    const tot = totals(cur.topics, progress);
    const roadmap = buildRoadmap({ planStart: profile.planStart, examDate: profile.examDate, topics: cur.topics });
    const expected = expectedChaptersRead(roadmap, progress, today);
    const byDate = minutesByDate(sessions.filter((s) => s.studentId === r.id));
    const myMocks = mocks.filter((m) => m.studentId === r.id);
    const scored = [...progress.values()].reduce((s, t) => s + t.scored, 0);
    const accSum = [...progress.values()].reduce((s, t) => s + (t.avgAccuracy ?? 0) * t.scored, 0);
    const avgAccuracy = scored ? Math.round(accSum / scored) : null;
    const lastSessionDate = [...byDate.keys()].sort().pop() ?? null;
    const lastActive = latest(
      lastSessionDate,
      dateOf(lastProgress.find((x) => x.studentId === r.id)?.at ?? null),
      dateOf(lastAttempt.find((x) => x.studentId === r.id)?.at ?? null),
      myMocks.map((m) => m.date).sort().pop() ?? null,
    );
    const joinedOn = dateOf(r.joinedAt)!;
    const weeklyTargetHours = profile.weeklyTargetMinutes / 60;
    const hours14d = hoursInRange(byDate, addDays(today, -13), today);
    const mockScores = [...myMocks].sort((a, b) => a.date.localeCompare(b.date)).map((m) => m.score);
    const alerts = evaluateAlerts({
      studentId: r.id,
      name: r.name,
      today,
      joinedOn,
      lastActiveDate: lastActive,
      planStart: profile.planStart,
      weeklyTargetMinutes: profile.weeklyTargetMinutes,
      minutes14d: Math.round(hours14d * 60),
      chaptersRead: tot.read,
      chaptersExpected: expected,
      missedHomework: hw.missedByStudent.get(r.id) ?? 0,
      mockScores,
      scoredChapters: scored,
      avgAccuracy,
    });
    rows.push({
      id: r.id,
      name: r.name,
      email: r.email,
      joinedOn,
      examDate: profile.examDate,
      weeklyTargetHours,
      lastActive,
      totals: tot,
      topics: Object.fromEntries(
        [...progress].map(([id, t]) => [id, { read: t.read, total: t.total, complete: t.complete, avgAccuracy: t.avgAccuracy, scored: t.scored }]),
      ),
      hoursThisWeek: hoursInRange(byDate, week.start, week.end),
      hours14d,
      chaptersExpected: expected,
      behindBy: expected - tot.read,
      mocks: mockStats(myMocks),
      scored,
      avgAccuracy,
      missedHomework: hw.missedByStudent.get(r.id) ?? 0,
      alerts,
    });
  }

  const topicSummary = cur.topics.map((t) => {
    const withScores = rows.filter((s) => s.topics[t.id]?.avgAccuracy !== null && s.topics[t.id]?.avgAccuracy !== undefined);
    return {
      topicId: t.id,
      avgReadPct: rows.length ? Math.round(avg(rows.map((s) => (s.topics[t.id].total ? (s.topics[t.id].read / s.topics[t.id].total) * 100 : 0)))) : 0,
      avgAccuracy: withScores.length ? Math.round(avg(withScores.map((s) => s.topics[t.id].avgAccuracy as number))) : null,
      scoredStudents: withScores.length,
    };
  });
  let weakest: ClassOverview["weakestTopic"] = null;
  const scoredTopics = topicSummary.filter((t) => t.avgAccuracy !== null);
  if (scoredTopics.length) {
    const w = [...scoredTopics].sort((a, b) => (a.avgAccuracy as number) - (b.avgAccuracy as number))[0];
    weakest = { topicId: w.topicId, reason: `Lowest average practice score in the class: ${w.avgAccuracy}% across ${w.scoredStudents} student${w.scoredStudents === 1 ? "" : "s"}.` };
  } else if (rows.length) {
    const w = [...topicSummary].sort((a, b) => a.avgReadPct - b.avgReadPct)[0];
    weakest = { topicId: w.topicId, reason: `Least covered topic so far: ${w.avgReadPct}% of chapters read on average.` };
  }
  const mockLatest = rows.map((s) => s.mocks.latest).filter((x): x is number => x !== null);

  return {
    cls: {
      id: cls.id,
      name: cls.name,
      joinCode: cls.joinCode,
      examDate: cls.examDate,
      planStart: cls.planStart,
      weeklyTargetHours: cls.weeklyTargetMinutes / 60,
    },
    topics: cur.topics.map((t) => ({ id: t.id, name: t.name, weightLabel: weightLabel(t) })),
    students: rows,
    attention: groupAlerts(rows.flatMap((s) => s.alerts)),
    kpis: {
      total: rows.length,
      avgReadPct: Math.round(avg(rows.map((s) => s.totals.readPct))),
      avgCompletePct: Math.round(avg(rows.map((s) => s.totals.completePct))),
      avgHoursThisWeek: Math.round(avg(rows.map((s) => s.hoursThisWeek)) * 10) / 10,
      avgTargetHours: Math.round(avg(rows.map((s) => s.weeklyTargetHours)) * 10) / 10,
      activeThisWeek: rows.filter((s) => s.lastActive && s.lastActive >= addDays(today, -6)).length,
      behindRoadmap: rows.filter((s) => s.alerts.some((a) => a.kind === "behind_roadmap")).length,
      avgLatestMock: mockLatest.length ? Math.round(avg(mockLatest) * 10) / 10 : null,
      homeworkOnTimePct: hw.onTimePct,
    },
    topicSummary,
    weakestTopic: weakest,
  };
}

export type { PaceStatus };
