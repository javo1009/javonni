// Student study tracker: settings, chapter progress, study sessions, mock results, backups,
// and the snapshot every dashboard view renders. Business rules live in domain/tracker.ts.

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { attempts, classes, enrollments, mockResults, moduleProgress, modules, studentProfiles, studySessions } from "@/db/schema";
import { BackupError, normalizeBackup, toBackupJson, BACKUP_LIMITS, type BackupModule } from "@/domain/backup";
import { addDays, diffDays, isValidDate, type ISODate } from "@/domain/dates";
import {
  EMPTY_CHAPTER,
  TRACKER,
  buildRoadmap,
  calibration,
  chapterStatus,
  computeChapterPace,
  computeConsistency,
  computePace,
  focusModel,
  hoursInRange,
  mockDeadlines,
  mockStats,
  nextActions,
  phaseOf,
  reviewQueue,
  topicProgress,
  totals,
  weekBounds,
  weightLabel,
  type ChapterState,
  type Confidence,
  type ModuleRef,
} from "@/domain/tracker";
import { formatShortDate } from "@/lib/format";
import { assertCanViewStudent, assertStudent } from "./access";
import { getActiveCurriculum, type Curriculum } from "./curriculum";
import { NotFoundError, ValidationError, type Actor, type Db } from "./types";

export const MIXED_TOPICS = ["Mixed review", "Mock exam"] as const;
export const MAX_EXAM_DATE: ISODate = "2027-12-31";
export const MIN_EXAM_DATE: ISODate = "2027-02-01";

export type Profile = { examDate: ISODate; planStart: ISODate; weeklyTargetMinutes: number };

// -------------------------------------------------------------- profile
/** Defaults for a student with no profile yet: the class they belong to, else the sample's defaults. */
export async function defaultProfile(db: Db, studentId: string, today: ISODate): Promise<Profile> {
  const [cls] = await db
    .select({ examDate: classes.examDate, planStart: classes.planStart, weeklyTargetMinutes: classes.weeklyTargetMinutes })
    .from(enrollments)
    .innerJoin(classes, eq(classes.id, enrollments.classId))
    .where(and(eq(enrollments.studentId, studentId), eq(classes.archived, false)))
    .orderBy(asc(enrollments.joinedAt))
    .limit(1);
  let examDate = cls?.examDate ?? TRACKER.defaultExamDate;
  if (diffDays(today, examDate) < 14) examDate = addDays(today, 120); // never default into the past
  return {
    examDate,
    planStart: cls?.planStart ?? today,
    weeklyTargetMinutes: cls?.weeklyTargetMinutes ?? TRACKER.defaultWeeklyMinutes,
  };
}

/** The student's profile, created from class defaults on first use. */
export async function ensureProfile(db: Db, studentId: string, today: ISODate): Promise<Profile> {
  const read = async () => {
    const [row] = await db.select().from(studentProfiles).where(eq(studentProfiles.studentId, studentId)).limit(1);
    return row ? { examDate: row.examDate, planStart: row.planStart, weeklyTargetMinutes: row.weeklyTargetMinutes } : null;
  };
  const existing = await read();
  if (existing) return existing;
  const d = await defaultProfile(db, studentId, today);
  await db.insert(studentProfiles).values({ studentId, ...d }).onConflictDoNothing();
  return (await read()) ?? d;
}

export function validateExamDate(examDate: string, today: ISODate) {
  if (!isValidDate(examDate)) throw new ValidationError("Enter a valid exam date.");
  if (examDate < MIN_EXAM_DATE || examDate > MAX_EXAM_DATE)
    throw new ValidationError("The 2027 curriculum applies to exams from February to December 2027.");
  if (diffDays(today, examDate) < 7) throw new ValidationError("The exam date must be at least a week away.");
}

export function validateWeeklyHours(hours: number) {
  if (!Number.isFinite(hours) || hours < 1 || hours > 80) throw new ValidationError("Weekly hours must be between 1 and 80.");
}

export async function updateSettings(
  db: Db,
  actor: Actor,
  input: { examDate?: ISODate; weeklyTargetHours?: number },
  today: ISODate,
): Promise<Profile> {
  assertStudent(actor);
  await ensureProfile(db, actor.id, today);
  const patch: Partial<typeof studentProfiles.$inferInsert> = { updatedAt: new Date() };
  if (input.examDate !== undefined) {
    validateExamDate(input.examDate, today);
    patch.examDate = input.examDate;
  }
  if (input.weeklyTargetHours !== undefined) {
    validateWeeklyHours(input.weeklyTargetHours);
    patch.weeklyTargetMinutes = Math.round(input.weeklyTargetHours * 60);
  }
  await db.update(studentProfiles).set(patch).where(eq(studentProfiles.studentId, actor.id));
  return ensureProfile(db, actor.id, today);
}

// ------------------------------------------------------------- chapters
export type ChapterPatch = {
  read?: boolean;
  practice?: boolean;
  review?: boolean;
  accuracy?: number | null;
  confidence?: Confidence | null;
  /** Record a fresh review today even if the chapter is already marked reviewed. */
  reviewedToday?: boolean;
};

type ProgressRow = typeof moduleProgress.$inferSelect;
const rowToState = (r: ProgressRow): ChapterState => ({
  read: r.read,
  practice: r.practice,
  review: r.review,
  accuracy: r.accuracy,
  confidence: r.confidence === 1 || r.confidence === 2 || r.confidence === 3 ? r.confidence : null,
  readOn: r.readOn,
  reviewedOn: r.reviewedOn,
});

export async function loadChapterStates(db: Db, studentIds: string[]): Promise<Map<string, Map<string, ChapterState>>> {
  const out = new Map<string, Map<string, ChapterState>>(studentIds.map((id) => [id, new Map()]));
  if (studentIds.length === 0) return out;
  const rows = await db.select().from(moduleProgress).where(inArray(moduleProgress.studentId, studentIds));
  for (const r of rows) out.get(r.studentId)!.set(r.moduleId, rowToState(r));
  return out;
}

export async function updateChapter(db: Db, actor: Actor, moduleId: string, patch: ChapterPatch, today: ISODate): Promise<ChapterState> {
  assertStudent(actor);
  if (patch.accuracy !== undefined && patch.accuracy !== null && (!Number.isFinite(patch.accuracy) || patch.accuracy < 0 || patch.accuracy > 100))
    throw new ValidationError("A practice score is a percentage from 0 to 100.");
  if (patch.confidence !== undefined && patch.confidence !== null && ![1, 2, 3].includes(patch.confidence))
    throw new ValidationError("Confidence is 1 (shaky), 2 (okay) or 3 (solid).");
  const [mod] = await db.select({ id: modules.id }).from(modules).where(eq(modules.id, moduleId)).limit(1);
  if (!mod) throw new NotFoundError("Chapter not found.");

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${actor.id + ":" + moduleId}, 0))`);
    const [row] = await tx
      .select()
      .from(moduleProgress)
      .where(and(eq(moduleProgress.studentId, actor.id), eq(moduleProgress.moduleId, moduleId)))
      .limit(1);
    const cur: ChapterState = row ? rowToState(row) : { ...EMPTY_CHAPTER };
    const next: ChapterState = { ...cur };
    if (patch.read !== undefined) {
      next.read = patch.read;
      next.readOn = patch.read ? (cur.read ? cur.readOn : today) : null;
    }
    if (patch.practice !== undefined) next.practice = patch.practice;
    if (patch.review !== undefined) {
      next.review = patch.review;
      next.reviewedOn = patch.review ? (cur.review ? cur.reviewedOn : today) : null;
    }
    if (patch.reviewedToday) {
      next.review = true;
      next.reviewedOn = today;
    }
    if (patch.accuracy !== undefined) next.accuracy = patch.accuracy === null ? null : Math.round(patch.accuracy);
    if (patch.confidence !== undefined) next.confidence = patch.confidence;

    const values = {
      studentId: actor.id,
      moduleId,
      read: next.read,
      practice: next.practice,
      review: next.review,
      accuracy: next.accuracy,
      confidence: next.confidence,
      readOn: next.readOn,
      reviewedOn: next.reviewedOn,
      // Activity is tracked by the student's local date, not the server clock.
      updatedAt: new Date(`${today}T12:00:00Z`),
    };
    await tx
      .insert(moduleProgress)
      .values(values)
      .onConflictDoUpdate({ target: [moduleProgress.studentId, moduleProgress.moduleId], set: values });
    return next;
  });
}

// ------------------------------------------------------------- sessions
export type SessionInput = { date: ISODate; minutes: number; topic: string; note?: string; source?: "manual" | "timer" };

export async function logSession(db: Db, actor: Actor, input: SessionInput, today: ISODate): Promise<string> {
  assertStudent(actor);
  if (!isValidDate(input.date)) throw new ValidationError("Enter a valid date.");
  if (input.date > today) throw new ValidationError("You can't log study time in the future.");
  if (diffDays(input.date, today) > 730) throw new ValidationError("That date is too far in the past.");
  if (!Number.isInteger(input.minutes) || input.minutes < 15 || input.minutes > 24 * 60)
    throw new ValidationError("Log between 15 minutes and 24 hours per session.");
  const cur = await getActiveCurriculum(db);
  const allowed = new Set<string>([...cur.topics.map((t) => t.name), ...MIXED_TOPICS]);
  if (!allowed.has(input.topic)) throw new ValidationError("Choose a topic from the list.");
  const [row] = await db
    .insert(studySessions)
    .values({
      studentId: actor.id,
      date: input.date,
      minutes: input.minutes,
      topic: input.topic,
      note: input.note?.trim().slice(0, BACKUP_LIMITS.noteChars) || null,
      source: input.source ?? "manual",
    })
    .returning({ id: studySessions.id });
  return row.id;
}

export async function deleteSession(db: Db, actor: Actor, sessionId: string) {
  assertStudent(actor);
  await db.delete(studySessions).where(and(eq(studySessions.id, sessionId), eq(studySessions.studentId, actor.id)));
}

// ---------------------------------------------------------------- mocks
export async function addMock(db: Db, actor: Actor, input: { date: ISODate; score: number; note?: string }, today: ISODate): Promise<string> {
  assertStudent(actor);
  if (!isValidDate(input.date)) throw new ValidationError("Enter a valid date.");
  if (input.date > today) throw new ValidationError("A mock result can't be dated in the future.");
  if (!Number.isFinite(input.score) || input.score < 0 || input.score > 100) throw new ValidationError("A score is a percentage from 0 to 100.");
  const [row] = await db
    .insert(mockResults)
    .values({
      studentId: actor.id,
      date: input.date,
      score: Math.round(input.score * 10) / 10,
      note: input.note?.trim().slice(0, BACKUP_LIMITS.noteChars) || null,
    })
    .returning({ id: mockResults.id });
  return row.id;
}

export async function deleteMock(db: Db, actor: Actor, mockId: string) {
  assertStudent(actor);
  await db.delete(mockResults).where(and(eq(mockResults.id, mockId), eq(mockResults.studentId, actor.id)));
}

// ------------------------------------------------------------- snapshot
export type ChapterView = {
  id: string;
  number: number;
  title: string;
  topicId: string;
  state: ChapterState;
  status: ReturnType<typeof chapterStatus>;
  /** Present when the chapter is due for review. */
  reviewDue: { kind: "first-review" | "refresh"; overdueDays: number } | null;
  /** Answers given to questions in the platform's bank for this chapter. */
  practice: { attempts: number; correct: number } | null;
};

export type TopicView = {
  id: string;
  name: string;
  weightLabel: string;
  weightMin: number;
  weightMax: number;
  start: ISODate;
  end: ISODate;
  active: boolean;
  total: number;
  read: number;
  complete: number;
  avgAccuracy: number | null;
  scored: number;
  weak: number;
};

export type TrackerSnapshot = Awaited<ReturnType<typeof buildSnapshot>>;

type SessionRow = typeof studySessions.$inferSelect;
type MockRow = typeof mockResults.$inferSelect;

export async function practiceStatsByModule(db: Db, studentIds: string[]) {
  const out = new Map<string, Map<string, { attempts: number; correct: number }>>(studentIds.map((id) => [id, new Map()]));
  if (studentIds.length === 0) return out;
  const rows = await db
    .select({
      studentId: attempts.studentId,
      moduleId: attempts.moduleId,
      n: sql<number>`count(*)::int`,
      ok: sql<number>`count(*) filter (where ${attempts.correct})::int`,
    })
    .from(attempts)
    .where(inArray(attempts.studentId, studentIds))
    .groupBy(attempts.studentId, attempts.moduleId);
  for (const r of rows) if (r.moduleId) out.get(r.studentId)!.set(r.moduleId, { attempts: r.n, correct: r.ok });
  return out;
}

export function minutesByDate(sessions: Pick<SessionRow, "date" | "minutes">[]): Map<ISODate, number> {
  const m = new Map<ISODate, number>();
  for (const s of sessions) m.set(s.date, (m.get(s.date) ?? 0) + s.minutes);
  return m;
}

/** Everything the dashboard views render, as plain serializable data. */
export function buildSnapshot(input: {
  cur: Curriculum;
  profile: Profile;
  states: Map<string, ChapterState>;
  practice: Map<string, { attempts: number; correct: number }>;
  sessions: SessionRow[];
  mocks: MockRow[];
  today: ISODate;
}) {
  const { cur, profile, states, practice, sessions, mocks, today } = input;
  const weeklyTargetHours = profile.weeklyTargetMinutes / 60;
  const roadmap = buildRoadmap({ planStart: profile.planStart, examDate: profile.examDate, topics: cur.topics });
  const progress = topicProgress(cur.topics, cur.modules, states);
  const tot = totals(cur.topics, progress);
  const byDate = minutesByDate(sessions);
  const pace = computePace({ planStart: profile.planStart, examDate: profile.examDate, today, weeklyTargetHours, minutesByDate: byDate });
  const week = weekBounds(today);
  const weekHours = hoursInRange(byDate, week.start, week.end);
  const queue = reviewQueue(cur.modules, states, today, cur.topicOrder);
  const dueById = new Map(queue.map((q) => [q.moduleId, q]));
  const chapterPace = computeChapterPace({ roadmap, progress, states, today });
  const mockList = [...mocks].sort((a, b) => a.date.localeCompare(b.date));
  const stats = mockStats(mockList);
  const windows = new Map(roadmap.topics.map((w) => [w.topicId, w]));
  const activeTopicId = focusModel({ roadmap, modules: cur.modules, states, today });

  const topicViews: TopicView[] = cur.topics.map((t) => {
    const p = progress.get(t.id)!;
    const w = windows.get(t.id)!;
    return {
      id: t.id,
      name: t.name,
      weightLabel: weightLabel(t),
      weightMin: t.weightMin,
      weightMax: t.weightMax,
      start: w.start,
      end: w.end,
      active: w.start <= today && w.end >= today,
      total: p.total,
      read: p.read,
      complete: p.complete,
      avgAccuracy: p.avgAccuracy,
      scored: p.scored,
      weak: p.weak,
    };
  });

  const chapters: ChapterView[] = cur.modules.map((m) => {
    const state = states.get(m.id) ?? { ...EMPTY_CHAPTER };
    const due = dueById.get(m.id);
    const pr = practice.get(m.id);
    return {
      id: m.id,
      number: m.number,
      title: m.title,
      topicId: m.topicId,
      state,
      status: chapterStatus(state),
      reviewDue: due ? { kind: due.kind, overdueDays: due.overdueDays } : null,
      practice: pr && pr.attempts > 0 ? pr : null,
    };
  });

  const actions = nextActions({
    roadmap,
    topics: cur.topics,
    modules: cur.modules,
    states,
    today,
    examDate: profile.examDate,
    mockCount: mockList.length,
    weekHours,
    weeklyTargetHours,
    review: queue,
    formatDate: formatShortDate,
  });

  // Weekly hours from the first Monday to the exam, for the bar chart.
  const weeklyHours: { start: ISODate; hours: number; current: boolean }[] = [];
  for (let d = roadmap.firstPassStart; d < profile.examDate && weeklyHours.length < 80; d = addDays(d, 7))
    weeklyHours.push({ start: d, hours: hoursInRange(byDate, d, addDays(d, 6)), current: d === week.start });

  const recentSessions = [...sessions].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.getTime() - a.createdAt.getTime());
  return {
    today,
    examDate: profile.examDate,
    planStart: profile.planStart,
    daysLeft: Math.max(0, diffDays(today, profile.examDate)),
    weeklyTargetHours,
    phase: phaseOf(roadmap, today),
    roadmap,
    topics: topicViews,
    chapters,
    totals: tot,
    week: { ...week, hours: weekHours, targetHours: weeklyTargetHours },
    pace,
    chapterPace,
    focus: activeTopicId,
    actions,
    reviewQueue: queue,
    consistency: computeConsistency(byDate, today, weeklyTargetHours),
    calibration: calibration(cur.modules, states),
    mocks: {
      items: [...mockList].reverse().map((m) => ({ id: m.id, date: m.date, score: m.score, note: m.note ?? "" })),
      stats,
      deadlines: mockDeadlines(profile.examDate),
    },
    sessions: {
      recent: recentSessions.slice(0, 30).map((s) => ({ id: s.id, date: s.date, minutes: s.minutes, topic: s.topic, note: s.note ?? "", source: s.source })),
      count: sessions.length,
      totalMinutes: sessions.reduce((a, s) => a + s.minutes, 0),
    },
    weeklyHours,
    version: { name: cur.version.name, isSample: cur.version.isSample },
  };
}

export async function getTrackerSnapshot(db: Db, actor: Actor, studentId: string, today: ISODate) {
  await assertCanViewStudent(db, actor, studentId);
  const cur = await getActiveCurriculum(db);
  const profile = await ensureProfileForViewer(db, actor, studentId, today);
  const [states, practice, sessions, mocks] = await Promise.all([
    loadChapterStates(db, [studentId]),
    practiceStatsByModule(db, [studentId]),
    db.select().from(studySessions).where(eq(studySessions.studentId, studentId)).orderBy(desc(studySessions.date)),
    db.select().from(mockResults).where(eq(mockResults.studentId, studentId)),
  ]);
  return buildSnapshot({ cur, profile, states: states.get(studentId)!, practice: practice.get(studentId)!, sessions, mocks, today });
}

/** Students create their profile on first visit; a teacher viewing a student who hasn't visited sees the defaults without writing. */
async function ensureProfileForViewer(db: Db, actor: Actor, studentId: string, today: ISODate): Promise<Profile> {
  if (actor.id === studentId) return ensureProfile(db, studentId, today);
  const [row] = await db.select().from(studentProfiles).where(eq(studentProfiles.studentId, studentId)).limit(1);
  if (row) return { examDate: row.examDate, planStart: row.planStart, weeklyTargetMinutes: row.weeklyTargetMinutes };
  return defaultProfile(db, studentId, today);
}

// --------------------------------------------------------------- backup
export async function exportBackup(db: Db, actor: Actor, today: ISODate) {
  assertStudent(actor);
  const cur = await getActiveCurriculum(db);
  const profile = await ensureProfile(db, actor.id, today);
  const slugs = await db.select({ id: modules.id, slug: modules.slug }).from(modules).where(inArray(modules.id, cur.modules.map((m) => m.id)));
  const slugById = new Map(slugs.map((s) => [s.id, s.slug]));
  const states = (await loadChapterStates(db, [actor.id])).get(actor.id)!;
  const mods = new Map<string, BackupModule>();
  for (const [id, s] of states) {
    const slug = slugById.get(id);
    if (slug) mods.set(slug, { read: s.read, practice: s.practice, review: s.review, accuracy: s.accuracy });
  }
  const sessions = await db.select().from(studySessions).where(eq(studySessions.studentId, actor.id)).orderBy(asc(studySessions.date));
  const mocks = await db.select().from(mockResults).where(eq(mockResults.studentId, actor.id)).orderBy(asc(mockResults.date));
  return toBackupJson({
    examDate: profile.examDate,
    weeklyTargetHours: profile.weeklyTargetMinutes / 60,
    modules: mods,
    sessions: sessions.map((s) => ({ date: s.date, hours: s.minutes / 60, topic: s.topic, note: s.note ?? "" })),
    mocks: mocks.map((m) => ({ date: m.date, score: m.score, note: m.note ?? "" })),
    exportedAt: new Date().toISOString(),
  });
}

/**
 * Replace the student's progress with a backup (the sample dashboard's export format works).
 * Chapters restored this way have no read dates, so they don't enter the review queue.
 */
export async function importBackup(db: Db, actor: Actor, raw: unknown, today: ISODate) {
  assertStudent(actor);
  const cur = await getActiveCurriculum(db);
  const slugRows = await db.select({ id: modules.id, slug: modules.slug }).from(modules).where(inArray(modules.id, cur.modules.map((m) => m.id)));
  const idBySlug = new Map(slugRows.filter((r) => r.slug).map((r) => [r.slug!, r.id]));
  let parsed;
  try {
    parsed = normalizeBackup(raw, new Set(idBySlug.keys()));
  } catch (e) {
    if (e instanceof BackupError) throw new ValidationError(e.message);
    throw e;
  }
  const validTopics = new Set<string>([...cur.topics.map((t) => t.name), ...MIXED_TOPICS]);
  const profile = await ensureProfile(db, actor.id, today);

  await db.transaction(async (tx) => {
    await tx.delete(moduleProgress).where(eq(moduleProgress.studentId, actor.id));
    await tx.delete(studySessions).where(eq(studySessions.studentId, actor.id));
    await tx.delete(mockResults).where(eq(mockResults.studentId, actor.id));
    for (const [slug, m] of parsed.modules)
      await tx.insert(moduleProgress).values({
        studentId: actor.id,
        moduleId: idBySlug.get(slug)!,
        read: m.read,
        practice: m.practice,
        review: m.review,
        accuracy: m.accuracy,
      });
    for (const s of parsed.sessions)
      await tx.insert(studySessions).values({
        studentId: actor.id,
        date: s.date,
        minutes: Math.max(15, Math.round(s.hours * 60)),
        topic: validTopics.has(s.topic) ? s.topic : "Mixed review",
        note: s.note || null,
        source: "backup",
      });
    for (const m of parsed.mocks) await tx.insert(mockResults).values({ studentId: actor.id, date: m.date, score: m.score, note: m.note || null });
    const patch: Partial<typeof studentProfiles.$inferInsert> = { updatedAt: new Date() };
    // Same rules as the settings form: within the curriculum year and at least a week away.
    const exam = parsed.settings.examDate;
    if (exam && exam >= MIN_EXAM_DATE && exam <= MAX_EXAM_DATE && diffDays(today, exam) >= 7) patch.examDate = exam;
    if (parsed.settings.weeklyTargetHours) patch.weeklyTargetMinutes = Math.round(parsed.settings.weeklyTargetHours * 60);
    await tx.update(studentProfiles).set(patch).where(eq(studentProfiles.studentId, actor.id));
  });
  return {
    chapters: parsed.modules.size,
    sessions: parsed.sessions.length,
    mocks: parsed.mocks.length,
    skipped: parsed.skipped,
    planStartKept: profile.planStart,
  };
}

export type { ModuleRef };
