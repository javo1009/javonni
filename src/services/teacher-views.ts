// Read models for the teacher pages. Each function composes the existing services
// (which enforce access) and adds the few queries the teacher views need.
import { and, asc, count, desc, eq, gte, inArray, lte } from "drizzle-orm";
import {
  assignments,
  attempts,
  classes,
  enrollments,
  planItems,
  questionLos,
  questions,
  studyPlans,
  studySessions,
  submissions,
  users,
} from "@/db/schema";
import { evaluateAlerts, type Alert } from "@/domain/alerts";
import { addDays, diffDays, eachDay, formatDate, parseDate, startOfWeek, type ISODate } from "@/domain/dates";
import { assertCanViewStudent, getClassOverview, listClasses, weeklyReadinessFromAttempts } from "./classes";
import { getActiveCurriculum, questionCountsByLos, type Curriculum } from "./curriculum";
import { homeworkStats, listTeacherAssignments, type StudentHomeworkStatus } from "./homework";
import { adherenceWindow, assessActivePlan, getActivePlan } from "./plan";
import { buildSnapshot, loadProgress } from "./progress";
import { ForbiddenError, NotFoundError, type Actor, type Db } from "./types";

const DAY_MS = 86_400_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Route params reach Postgres uuid columns; reject anything that isn't one before querying. */
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

function assertStaff(actor: Actor) {
  if (actor.role !== "teacher" && actor.role !== "admin") throw new ForbiddenError();
}

// ------------------------------------------------------------------ cockpit

export async function getCockpit(db: Db, actor: Actor, requestedClassId: string | undefined, today: ISODate, nowMs = Date.now()) {
  assertStaff(actor);
  const classList = await listClasses(db, actor);
  if (classList.length === 0) return { classes: classList, overview: null, dueThisWeek: [], toGrade: 0 };
  // Only classes the actor can list are selectable; an unknown id falls back to the first.
  const chosen = classList.find((c) => c.id === requestedClassId) ?? classList[0];
  const now = new Date(nowMs);
  const hw = await homeworkStats(db, chosen.id, now);
  const overview = await getClassOverview(db, actor, chosen.id, today, hw, nowMs);
  const all = await listTeacherAssignments(db, actor, chosen.id);
  const weekStart = parseDate(startOfWeek(today));
  const weekEnd = weekStart + 7 * DAY_MS;
  const dueThisWeek = all
    .filter((a) => a.status === "assigned" && a.dueAt.getTime() >= weekStart && a.dueAt.getTime() < weekEnd)
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
  const toGrade = all.reduce((s, a) => s + a.needsGrading, 0);
  return { classes: classList, overview, dueThisWeek, toGrade };
}

// ------------------------------------------------------------- student 360

export type DailyAdherence = { date: ISODate; planned: number; done: number };
export type BurnPoint = { date: string; planned: number; done: number | null };
export type ActivityEvent = { date: ISODate; kind: "study" | "practice" | "homework"; text: string };
export type StudentHomeworkRow = {
  id: string;
  title: string;
  className: string;
  dueAt: Date;
  status: StudentHomeworkStatus;
  submissionId: string | null;
  late: boolean;
  overdue: boolean;
  submittedAt: Date | null;
  score: number | null;
  maxScore: number | null;
};

/** Planned vs studied minutes per day, using the plan that was current on each date. */
async function dailyAdherence(db: Db, studentId: string, from: ISODate, to: ISODate): Promise<DailyAdherence[]> {
  const plans = await db
    .select({ id: studyPlans.id, startDate: studyPlans.startDate })
    .from(studyPlans)
    .where(eq(studyPlans.studentId, studentId))
    .orderBy(desc(studyPlans.createdAt));
  const planned = new Map<string, number>();
  if (plans.length) {
    const items = await db
      .select({ planId: planItems.planId, date: planItems.date, minutes: planItems.minutes })
      .from(planItems)
      .where(and(inArray(planItems.planId, plans.map((p) => p.id)), gte(planItems.date, from), lte(planItems.date, to)));
    for (const it of items) {
      const owner = plans.find((p) => p.startDate <= it.date);
      if (owner && owner.id === it.planId) planned.set(it.date, (planned.get(it.date) ?? 0) + it.minutes);
    }
  }
  const sessions = await db
    .select({ date: studySessions.date, minutes: studySessions.minutes })
    .from(studySessions)
    .where(and(eq(studySessions.studentId, studentId), gte(studySessions.date, from), lte(studySessions.date, to)));
  const done = new Map<string, number>();
  for (const s of sessions) done.set(s.date, (done.get(s.date) ?? 0) + s.minutes);
  return eachDay(from, to).map((d) => ({ date: d, planned: planned.get(d) ?? 0, done: done.get(d) ?? 0 }));
}

/** Cumulative planned vs studied hours from plan start to exam day (weekly samples for long plans). */
export function buildBurnUp(
  items: { date: ISODate; minutes: number }[],
  sessions: { date: ISODate; minutes: number }[],
  start: ISODate,
  exam: ISODate,
  today: ISODate,
): BurnPoint[] {
  if (exam < start) return [];
  const days = eachDay(start, exam);
  const plannedBy = new Map<string, number>();
  for (const i of items) plannedBy.set(i.date, (plannedBy.get(i.date) ?? 0) + i.minutes);
  const doneBy = new Map<string, number>();
  for (const s of sessions) if (s.date >= start) doneBy.set(s.date, (doneBy.get(s.date) ?? 0) + s.minutes);
  const step = days.length > 120 ? 7 : days.length > 60 ? 2 : 1;
  const out: BurnPoint[] = [];
  let p = 0;
  let d = 0;
  days.forEach((day, i) => {
    p += plannedBy.get(day) ?? 0;
    d += doneBy.get(day) ?? 0;
    const keep = i % step === 0 || i === days.length - 1 || day === today;
    if (keep) out.push({ date: day, planned: Math.round((p / 60) * 10) / 10, done: day <= today ? Math.round((d / 60) * 10) / 10 : null });
  });
  return out;
}

export async function getStudent360(db: Db, actor: Actor, studentId: string, today: ISODate, nowMs = Date.now()) {
  assertStaff(actor);
  await assertCanViewStudent(db, actor, studentId);
  const [student] = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, studentId))
    .limit(1);
  if (!student || student.role !== "student") throw new NotFoundError("Student not found.");

  const c = await getActiveCurriculum(db);
  const myClasses = await db
    .select({ id: classes.id, name: classes.name, joinedAt: enrollments.joinedAt })
    .from(enrollments)
    .innerJoin(classes, eq(classes.id, enrollments.classId))
    .where(
      actor.role === "admin"
        ? eq(enrollments.studentId, studentId)
        : and(eq(enrollments.studentId, studentId), eq(classes.teacherId, actor.id)),
    )
    .orderBy(asc(classes.name));

  const progress = (await loadProgress(db, [studentId])).get(studentId)!;
  const snapshot = buildSnapshot(c, progress, nowMs);
  const attemptRows = await db
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
  const weeklyReadiness = weeklyReadinessFromAttempts(
    c,
    attemptRows.map((a) => ({ losId: a.losId, correct: a.correct, at: a.createdAt.getTime(), difficulty: a.difficulty, mode: a.mode })),
    today,
    4,
  );

  const from14 = addDays(today, -13);
  const adherence = await adherenceWindow(db, studentId, from14, today);
  const daily = await dailyAdherence(db, studentId, from14, today);
  const plan = await getActivePlan(db, studentId);
  const assessment = await assessActivePlan(db, studentId, today);
  const planSessions = plan
    ? await db
        .select({ date: studySessions.date, minutes: studySessions.minutes })
        .from(studySessions)
        .where(and(eq(studySessions.studentId, studentId), gte(studySessions.date, plan.plan.startDate)))
    : [];
  const burnUp = plan
    ? {
        points: buildBurnUp(plan.items, planSessions, plan.plan.startDate, plan.plan.examDate, today),
        examDate: plan.plan.examDate,
        startDate: plan.plan.startDate,
        plannedToDate: Math.round(plan.items.filter((i) => i.date <= today).reduce((s, i) => s + i.minutes, 0)),
        studiedToDate: planSessions.filter((s) => s.date <= today).reduce((s, x) => s + x.minutes, 0),
        totalPlanned: plan.items.reduce((s, i) => s + i.minutes, 0),
      }
    : null;

  // Recent activity: last 14 days of study sessions, practice attempts and homework.
  const sessions = await db
    .select({ date: studySessions.date, minutes: studySessions.minutes, source: studySessions.source, title: planItems.title })
    .from(studySessions)
    .leftJoin(planItems, eq(planItems.id, studySessions.planItemId))
    .where(and(eq(studySessions.studentId, studentId), gte(studySessions.date, addDays(today, -30))))
    .orderBy(desc(studySessions.date));
  const hours7d = Math.round((sessions.filter((s) => s.date >= addDays(today, -6)).reduce((s, x) => s + x.minutes, 0) / 60) * 10) / 10;
  const lastSession = sessions[0]?.date ?? (await lastSessionDate(db, studentId));
  const lastAttempt = attemptRows.reduce<number | null>((m, a) => (m === null || a.createdAt.getTime() > m ? a.createdAt.getTime() : m), null);
  const lastActive = [lastSession, lastAttempt !== null ? formatDate(lastAttempt) : null].filter((x): x is string => !!x).sort().pop() ?? null;

  const homework = await studentHomework(db, myClasses, studentId, new Date(nowMs));

  let missed = 0;
  for (const cl of myClasses) missed += (await homeworkStats(db, cl.id, new Date(nowMs))).missedByStudent.get(studentId) ?? 0;
  const alerts: Alert[] = evaluateAlerts({
    studentId,
    name: student.name,
    today,
    lastActiveDate: lastActive,
    plannedMinutes14d: adherence.planned,
    doneMinutes14d: adherence.done,
    readinessWeekly: weeklyReadiness,
    missedHomework: missed,
    mockScores: [],
  });

  const activity = buildActivity(
    today,
    sessions,
    attemptRows.map((a) => ({ at: a.createdAt.getTime(), correct: a.correct, mode: a.mode })),
    homework,
  );

  return {
    student: { id: student.id, name: student.name, email: student.email },
    classes: myClasses.map((x) => ({ id: x.id, name: x.name })),
    curriculum: c,
    snapshot,
    weeklyReadiness,
    adherence,
    daily,
    plan: plan ? { examDate: plan.plan.examDate, startDate: plan.plan.startDate } : null,
    assessment,
    burnUp,
    hours7d,
    lastActive,
    homework,
    alerts,
    activity,
  };
}

async function lastSessionDate(db: Db, studentId: string): Promise<ISODate | null> {
  const [r] = await db
    .select({ d: studySessions.date })
    .from(studySessions)
    .where(eq(studySessions.studentId, studentId))
    .orderBy(desc(studySessions.date))
    .limit(1);
  return r?.d ?? null;
}

async function studentHomework(
  db: Db,
  myClasses: { id: string; name: string }[],
  studentId: string,
  now: Date,
): Promise<StudentHomeworkRow[]> {
  if (myClasses.length === 0) return [];
  const rows = await db
    .select()
    .from(assignments)
    .where(and(inArray(assignments.classId, myClasses.map((c) => c.id)), eq(assignments.status, "assigned")))
    .orderBy(desc(assignments.dueAt));
  const visible = rows.filter((a) => a.target.kind === "class" || a.target.studentIds.includes(studentId));
  const subs = visible.length
    ? await db
        .select()
        .from(submissions)
        .where(and(eq(submissions.studentId, studentId), inArray(submissions.assignmentId, visible.map((v) => v.id))))
    : [];
  return visible.map((a) => {
    const s = subs.find((x) => x.assignmentId === a.id);
    return {
      id: a.id,
      title: a.title,
      className: myClasses.find((c) => c.id === a.classId)?.name ?? "",
      dueAt: a.dueAt,
      status: (s?.status ?? "not_started") as StudentHomeworkStatus,
      submissionId: s?.id ?? null,
      late: s?.late ?? false,
      overdue: !s?.submittedAt && a.dueAt < now,
      submittedAt: s?.submittedAt ?? null,
      score: s?.status === "graded" ? s.score : null,
      maxScore: s?.status === "graded" ? s.maxScore : null,
    };
  });
}

function buildActivity(
  today: ISODate,
  sessions: { date: ISODate; minutes: number; source: string; title: string | null }[],
  attemptRows: { at: number; correct: boolean; mode: string }[],
  homework: StudentHomeworkRow[],
): ActivityEvent[] {
  const from = addDays(today, -13);
  const events: ActivityEvent[] = [];
  for (const s of sessions) {
    if (s.date < from) continue;
    events.push({ date: s.date, kind: "study", text: s.title ? `${s.title} · ${s.minutes} min` : `Logged ${s.minutes} min of study` });
  }
  const byDay = new Map<string, { n: number; correct: number; homework: boolean }>();
  for (const a of attemptRows) {
    const d = formatDate(a.at);
    if (d < from || a.mode === "homework") continue;
    const cur = byDay.get(d) ?? { n: 0, correct: 0, homework: false };
    cur.n++;
    if (a.correct) cur.correct++;
    byDay.set(d, cur);
  }
  for (const [d, v] of byDay) {
    events.push({ date: d, kind: "practice", text: `Answered ${v.n} practice question${v.n === 1 ? "" : "s"}, ${Math.round((v.correct / v.n) * 100)}% correct` });
  }
  for (const h of homework) {
    if (!h.submittedAt) continue;
    const d = formatDate(h.submittedAt.getTime());
    if (diffDays(d, today) > 13 || d > today) continue;
    events.push({ date: d, kind: "homework", text: `${h.title}: ${h.status === "graded" ? "graded" : "submitted"}${h.late ? " (late)" : ""}` });
  }
  return events.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, 14);
}

// ---------------------------------------------------------------- builder

export type BuilderTopic = {
  id: string;
  code: string;
  name: string;
  modules: { id: string; title: string; los: { id: string; code: string; text: string; questions: number }[] }[];
};

export function curriculumTree(c: Curriculum, counts: Map<string, number>): BuilderTopic[] {
  return c.topics.map((t) => ({
    id: t.id,
    code: t.code,
    name: t.name,
    modules: c.modules
      .filter((m) => m.topicId === t.id)
      .map((m) => ({
        id: m.id,
        title: m.title,
        los: c.los
          .filter((l) => l.moduleId === m.id)
          .map((l) => ({ id: l.id, code: l.code, text: l.text, questions: counts.get(l.id) ?? 0 })),
      })),
  }));
}

export async function getBuilderData(db: Db, actor: Actor) {
  assertStaff(actor);
  const classList = await listClasses(db, actor);
  const roster = classList.length
    ? await db
        .select({ classId: enrollments.classId, id: users.id, name: users.name })
        .from(enrollments)
        .innerJoin(users, eq(users.id, enrollments.studentId))
        .where(inArray(enrollments.classId, classList.map((c) => c.id)))
        .orderBy(asc(users.name))
    : [];
  const c = await getActiveCurriculum(db);
  const counts = await questionCountsByLos(db);
  return {
    classes: classList.map((cl) => ({
      id: cl.id,
      name: cl.name,
      students: roster.filter((r) => r.classId === cl.id).map((r) => ({ id: r.id, name: r.name })),
    })),
    topics: curriculumTree(c, counts),
  };
}

export type QuestionPreview = { id: string; stem: string; difficulty: number; losId: string | null; losCode: string | null };

/** Stems for picked questions, in the given order. Published questions only. */
export async function questionPreviews(db: Db, actor: Actor, ids: string[]): Promise<QuestionPreview[]> {
  assertStaff(actor);
  if (ids.length === 0) return [];
  const c = await getActiveCurriculum(db);
  const rows = await db
    .select({ id: questions.id, stem: questions.stem, difficulty: questions.difficulty, losId: questionLos.losId, isPrimary: questionLos.isPrimary })
    .from(questions)
    .leftJoin(questionLos, eq(questionLos.questionId, questions.id))
    .where(and(inArray(questions.id, ids), eq(questions.status, "published")));
  const out: QuestionPreview[] = [];
  for (const id of ids) {
    const mine = rows.filter((r) => r.id === id);
    if (!mine.length) continue;
    const r = mine.find((x) => x.isPrimary) ?? mine[0];
    const l = r.losId ? c.los.find((x) => x.id === r.losId) : undefined;
    out.push({ id, stem: r.stem, difficulty: r.difficulty, losId: l?.id ?? null, losCode: l?.code ?? null });
  }
  return out;
}

// ---------------------------------------------------------- question bank

export async function getQuestionBank(db: Db, actor: Actor, opts: { topicId?: string; losId?: string }) {
  assertStaff(actor);
  const c = await getActiveCurriculum(db);
  const counts = await questionCountsByLos(db);
  const tree = curriculumTree(c, counts);
  const los = opts.losId ? c.los.find((l) => l.id === opts.losId) ?? null : null;
  const topicId = los ? c.topicByLos.get(los.id)! : tree.some((t) => t.id === opts.topicId) ? opts.topicId! : null;
  const list = los
    ? await db
        .select({
          id: questions.id,
          stem: questions.stem,
          options: questions.options,
          correctKey: questions.correctKey,
          explanation: questions.explanation,
          difficulty: questions.difficulty,
          isPrimary: questionLos.isPrimary,
        })
        .from(questionLos)
        .innerJoin(questions, and(eq(questions.id, questionLos.questionId), eq(questions.status, "published")))
        .where(eq(questionLos.losId, los.id))
        .orderBy(asc(questions.difficulty), asc(questions.createdAt))
    : [];
  const [{ n }] = await db.select({ n: count() }).from(questions).where(eq(questions.status, "published"));
  const totals = {
    los: c.los.length,
    withQuestions: c.los.filter((l) => (counts.get(l.id) ?? 0) > 0).length,
    questions: n,
  };
  return { tree, topicId, los, questions: list, totals };
}
