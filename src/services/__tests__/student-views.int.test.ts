import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { enrollments, questionLos, questions } from "@/db/schema";
import { seedSampleCurriculum } from "@/db/seed/sample";
import { createTestDb, type TestDb } from "@/test/db";
import { createClass } from "../classes";
import { getActiveCurriculum, type Curriculum } from "../curriculum";
import { createAssignment } from "../homework";
import { createPlan, getActivePlan, setItemStatus } from "../plan";
import { submitPracticeAnswer } from "../practice";
import {
  burnUpSeries,
  explainStatus,
  getHomeworkDetail,
  getLosDetail,
  getPlanWeekView,
  getTodayView,
  phaseSpans,
  practiceHrefFor,
} from "../student-views";
import { ForbiddenError, NotFoundError, type Actor } from "../types";
import { createUser } from "../users";

let t: TestDb;
let c: Curriculum;
let ann: Actor;
let ben: Actor;
let teacher: Actor;

const TODAY = "2026-11-02"; // Monday
const EXAM = "2027-02-20";
const WEEK = [90, 90, 90, 90, 90, 240, 240];
const NOW = Date.parse("2026-11-02T09:00:00Z");

async function actor(email: string, role: "student" | "teacher") {
  const u = await createUser(t.db, { email, name: email.split("@")[0], role, password: "a-long-password-1" });
  return { id: u.id, role } as Actor;
}

beforeAll(async () => {
  t = await createTestDb();
  await seedSampleCurriculum(t.db);
  c = await getActiveCurriculum(t.db);
  ann = await actor("ann@x.test", "student");
  ben = await actor("ben@x.test", "student");
  teacher = await actor("t@x.test", "teacher");
  await createPlan(t.db, ann, { today: TODAY, examDate: EXAM, weeklyMinutes: WEEK }, NOW);
});
afterAll(() => t.drop());

describe("pure helpers", () => {
  it("builds a cumulative burn-up in hours that stops at today", () => {
    const pts = burnUpSeries(
      [
        { date: "2026-11-02", minutes: 60 },
        { date: "2026-11-03", minutes: 90 },
        { date: "2026-11-05", minutes: 30 },
      ],
      new Map([["2026-11-02", 30]]),
      "2026-11-02",
      "2026-11-05",
      "2026-11-03",
    );
    expect(pts.map((p) => p.planned)).toEqual([1, 2.5, 2.5, 3]);
    expect(pts.map((p) => p.done)).toEqual([0.5, 0.5, null, null]);
  });

  it("summarises phases in learn → practice → mock order", () => {
    const spans = phaseSpans([
      { phase: "mock", date: "2027-02-10", minutes: 135 },
      { phase: "learn", date: "2026-11-03", minutes: 60 },
      { phase: "learn", date: "2026-11-02", minutes: 30 },
    ]);
    expect(spans).toEqual([
      { phase: "learn", start: "2026-11-02", end: "2026-11-03", minutes: 90 },
      { phase: "mock", start: "2027-02-10", end: "2027-02-10", minutes: 135 },
    ]);
  });

  it("links practice-like tasks to a scoped session and leaves reading alone", () => {
    expect(practiceHrefFor({ type: "read", moduleId: "m", topicId: "t" })).toBeNull();
    expect(practiceHrefFor({ type: "practice", moduleId: "m", topicId: "t" })).toContain("scope=module&id=m");
    expect(practiceHrefFor({ type: "mock", moduleId: null, topicId: null })).toContain("scope=mixed&count=30");
    expect(practiceHrefFor({ type: "final_review", moduleId: null, topicId: null })).toContain("scope=review");
  });

  it("explains each status in plain language", () => {
    const base = { attempts: 5, activeDays: 1, mastery: 0.8, daysSinceLast: 1, studied: true };
    expect(explainStatus("practiced", base)).toMatch(/another day/);
    expect(explainStatus("review_due", { ...base, daysSinceLast: 30 })).toMatch(/30 days/);
    expect(explainStatus("not_started", { ...base, attempts: 0 })).toMatch(/hatched/);
  });
});

describe("getTodayView", () => {
  it("returns null when the student has no plan", async () => {
    expect(await getTodayView(t.db, ben, { today: TODAY, nowMs: NOW, c })).toBeNull();
  });

  it("is for students only", async () => {
    await expect(getTodayView(t.db, teacher, { today: TODAY, nowMs: NOW, c })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("shows today's tasks and carries over earlier open ones", async () => {
    const later = "2026-11-09";
    const v = (await getTodayView(t.db, ann, { today: later, nowMs: NOW + 7 * 86_400_000, c }))!;
    expect(v.todayTasks.every((x) => x.date === later)).toBe(true);
    expect(v.overdueCount).toBeGreaterThan(0);
    expect(v.overdue.length).toBeLessThanOrEqual(5);
    expect(v.overdue.every((x) => x.date < later && x.status === "todo")).toBe(true);
    expect(v.assessment.state).not.toBe("on_track");
    expect(v.daysToExam).toBeGreaterThan(90);
    expect(v.coverage.total).toBe(c.los.length);
  });

  it("counts a completed task toward this week", async () => {
    const before = (await getTodayView(t.db, ann, { today: TODAY, nowMs: NOW, c }))!;
    const task = before.todayTasks[0];
    await setItemStatus(t.db, ann, task.id, "done", { today: TODAY, actualMinutes: 40 });
    const after = (await getTodayView(t.db, ann, { today: TODAY, nowMs: NOW, c }))!;
    expect(after.week.done - before.week.done).toBe(40);
    expect(after.todayTasks.find((x) => x.id === task.id)!.status).toBe("done");
  });
});

describe("getPlanWeekView", () => {
  it("returns seven days, a burn-up to exam day and the phases", async () => {
    const v = (await getPlanWeekView(t.db, ann, { today: TODAY, weekStart: TODAY, c }))!;
    expect(v.days).toHaveLength(7);
    expect(v.days[0].isToday).toBe(true);
    expect(v.burnUp[0].date).toBe(TODAY);
    expect(v.burnUp[v.burnUp.length - 1].date).toBe(EXAM);
    expect(v.phases.map((p) => p.phase)[0]).toBe("learn");
    const { items } = (await getActivePlan(t.db, ann.id))!;
    const total = items.reduce((s, i) => s + i.minutes, 0);
    expect(v.totals.planned).toBe(total);
  });
});

describe("getLosDetail", () => {
  it("returns null for an unknown objective", async () => {
    expect(await getLosDetail(t.db, ann, "00000000-0000-4000-8000-000000000000", { c, nowMs: NOW })).toBeNull();
  });

  it("shows recent answers after practice", async () => {
    const [q] = await t.db
      .select({ id: questions.id, key: questions.correctKey, losId: questionLos.losId })
      .from(questions)
      .innerJoin(questionLos, eq(questionLos.questionId, questions.id))
      .where(eq(questions.status, "published"))
      .limit(1);
    await submitPracticeAnswer(t.db, ann, { questionId: q.id, chosenKey: q.key });
    const d = (await getLosDetail(t.db, ann, q.losId, { c, nowMs: Date.now() }))!;
    expect(d.recent).toHaveLength(1);
    expect(d.recent[0].correct).toBe(true);
    expect(d.attempts).toBe(1);
    expect(d.questionCount).toBeGreaterThan(0);
    expect(d.why.length).toBeGreaterThan(10);
  });
});

describe("getHomeworkDetail", () => {
  it("adds each MCQ item's objective without revealing answers before submission", async () => {
    const cls = await createClass(t.db, teacher, { name: "Evening" });
    await t.db.insert(enrollments).values({ classId: cls.id, studentId: ann.id });
    const qs = await t.db.select({ id: questions.id }).from(questions).where(eq(questions.status, "published")).limit(2);
    const a = await createAssignment(t.db, teacher, {
      classId: cls.id,
      title: "Week 1",
      dueAt: new Date(Date.now() + 3 * 86_400_000),
      target: { kind: "class" },
      policies: { showAnswers: "immediately", allowLate: true },
      items: qs.map((q) => ({ kind: "mcq" as const, questionId: q.id })),
      assign: true,
    });
    const hw = await getHomeworkDetail(t.db, ann, a.id, { c, now: new Date() });
    expect(Object.keys(hw.objectives)).toHaveLength(2);
    expect(hw.items.every((i) => i.reveal === null && i.result === null)).toBe(true);
    await expect(getHomeworkDetail(t.db, ben, a.id, { c, now: new Date() })).rejects.toBeInstanceOf(NotFoundError);
  });
});
