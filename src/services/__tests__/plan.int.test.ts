import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { losProgress, planItems, studyPlans, studySessions } from "@/db/schema";
import { seedSampleCurriculum } from "@/db/seed/sample";
import { createTestDb, type TestDb } from "@/test/db";
import { getActiveCurriculum } from "../curriculum";
import {
  adherenceWindow,
  assessActivePlan,
  createPlan,
  getActivePlan,
  logSession,
  replan,
  setItemStatus,
} from "../plan";
import { ForbiddenError, ValidationError, type Actor } from "../types";
import { createUser } from "../users";

let t: TestDb;
let ann: Actor;
let ben: Actor;
let teacher: Actor;

const TODAY = "2026-11-02"; // Monday
const EXAM = "2027-02-20";
const WEEK = [90, 90, 90, 90, 90, 240, 240];

beforeAll(async () => {
  t = await createTestDb();
  await seedSampleCurriculum(t.db);
  const a = await createUser(t.db, { email: "ann@x.test", name: "Ann", role: "student", password: "a-long-password-1" });
  const b = await createUser(t.db, { email: "ben@x.test", name: "Ben", role: "student", password: "a-long-password-1" });
  const th = await createUser(t.db, { email: "t@x.test", name: "T", role: "teacher", password: "a-long-password-1" });
  ann = { id: a.id, role: "student" };
  ben = { id: b.id, role: "student" };
  teacher = { id: th.id, role: "teacher" };
});
afterAll(() => t.drop());

describe("createPlan", () => {
  it("persists a plan for the student and makes it the only active one", async () => {
    const first = await createPlan(t.db, ann, { today: TODAY, examDate: EXAM, weeklyMinutes: WEEK });
    expect(first.summary.plannedMinutes).toBeGreaterThan(0);
    const second = await createPlan(t.db, ann, { today: TODAY, examDate: EXAM, weeklyMinutes: WEEK });
    const rows = await t.db.select().from(studyPlans).where(eq(studyPlans.studentId, ann.id));
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.active).map((r) => r.id)).toEqual([second.planId]);
    const active = await getActivePlan(t.db, ann.id);
    expect(active!.items.length).toBeGreaterThan(20);
  });

  it("rejects bad input", async () => {
    await expect(createPlan(t.db, ann, { today: TODAY, examDate: "2026-11-03", weeklyMinutes: WEEK })).rejects.toBeInstanceOf(ValidationError);
    await expect(createPlan(t.db, ann, { today: TODAY, examDate: EXAM, weeklyMinutes: [0, 0, 0, 0, 0, 0, 0] })).rejects.toBeInstanceOf(ValidationError);
    await expect(createPlan(t.db, ann, { today: TODAY, examDate: EXAM, weeklyMinutes: [60, 60] })).rejects.toBeInstanceOf(ValidationError);
    await expect(createPlan(t.db, ann, { today: TODAY, examDate: "not-a-date", weeklyMinutes: WEEK })).rejects.toBeInstanceOf(ValidationError);
  });

  it("is for students only", async () => {
    await expect(createPlan(t.db, teacher, { today: TODAY, examDate: EXAM, weeklyMinutes: WEEK })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("setItemStatus", () => {
  it("logs study time when done, and removes it when undone", async () => {
    const { items } = (await getActivePlan(t.db, ann.id))!;
    const item = items.find((i) => i.type === "practice")!;
    await setItemStatus(t.db, ann, item.id, "done", { today: TODAY });
    let sessions = await t.db.select().from(studySessions).where(eq(studySessions.planItemId, item.id));
    expect(sessions).toHaveLength(1);
    expect(sessions[0].minutes).toBe(item.minutes);
    expect(sessions[0].date).toBe(TODAY);
    await setItemStatus(t.db, ann, item.id, "todo", { today: TODAY });
    sessions = await t.db.select().from(studySessions).where(eq(studySessions.planItemId, item.id));
    expect(sessions).toHaveLength(0);
  });

  it("records the actual minutes when they differ from the plan", async () => {
    const { items } = (await getActivePlan(t.db, ann.id))!;
    const item = items.find((i) => i.type === "quiz" || i.type === "review")!;
    await setItemStatus(t.db, ann, item.id, "done", { today: TODAY, actualMinutes: 17 });
    const [s] = await t.db.select().from(studySessions).where(eq(studySessions.planItemId, item.id));
    expect(s.minutes).toBe(17);
  });

  it("marks a module's objectives studied only after every reading part is done", async () => {
    const c = await getActiveCurriculum(t.db);
    const { items } = (await getActivePlan(t.db, ann.id))!;
    const moduleId = items.find((i) => i.type === "read" && (i.parts ?? 1) > 1)!.moduleId!;
    const reads = items.filter((i) => i.type === "read" && i.moduleId === moduleId);
    const losIds = c.modules.find((m) => m.id === moduleId)!.losIds;

    const studied = async () =>
      (await t.db.select().from(losProgress).where(eq(losProgress.studentId, ann.id))).filter((r) => r.studied && losIds.includes(r.losId)).length;

    await setItemStatus(t.db, ann, reads[0].id, "done", { today: TODAY });
    expect(await studied()).toBe(0);
    for (const r of reads.slice(1)) await setItemStatus(t.db, ann, r.id, "done", { today: TODAY });
    expect(await studied()).toBe(losIds.length);
    await setItemStatus(t.db, ann, reads[0].id, "todo", { today: TODAY });
    expect(await studied()).toBe(0);
  });

  it("won't let one student change another's tasks", async () => {
    const { items } = (await getActivePlan(t.db, ann.id))!;
    await expect(setItemStatus(t.db, ben, items[0].id, "done", { today: TODAY })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setItemStatus(t.db, teacher, items[0].id, "done", { today: TODAY })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("validates actual minutes", async () => {
    const { items } = (await getActivePlan(t.db, ann.id))!;
    await expect(setItemStatus(t.db, ann, items[0].id, "done", { today: TODAY, actualMinutes: 0 })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("logSession", () => {
  it("accepts a past manual entry and rejects future or silly ones", async () => {
    await logSession(t.db, ann, { today: TODAY, date: "2026-11-01", minutes: 45, note: "  flashcards  " });
    const rows = await t.db.select().from(studySessions).where(and(eq(studySessions.studentId, ann.id), eq(studySessions.source, "manual")));
    expect(rows[0]).toMatchObject({ minutes: 45, note: "flashcards" });
    await expect(logSession(t.db, ann, { today: TODAY, date: "2026-11-05", minutes: 30 })).rejects.toBeInstanceOf(ValidationError);
    await expect(logSession(t.db, ann, { today: TODAY, date: TODAY, minutes: 2 })).rejects.toBeInstanceOf(ValidationError);
    await expect(logSession(t.db, ann, { today: TODAY, date: "2026-01-01", minutes: 30 })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("assessment and replanning", () => {
  it("reports behind/at-risk when due tasks go undone, with recovery options", async () => {
    const a = await assessActivePlan(t.db, ann.id, "2026-11-20");
    expect(["behind", "at_risk"]).toContain(a!.state);
    expect(a!.deltaMinutes).toBeLessThan(0);
    expect(a!.options.length).toBeGreaterThan(0);
  });

  it("replans from today: new active plan, completed modules skipped, shortfall still visible", async () => {
    const c = await getActiveCurriculum(t.db);
    // Finish one module's reading so replanning can skip it.
    const first = (await getActivePlan(t.db, ann.id))!;
    const moduleId = first.items.find((i) => i.type === "read")!.moduleId!;
    for (const r of first.items.filter((i) => i.type === "read" && i.moduleId === moduleId))
      await setItemStatus(t.db, ann, r.id, "done", { today: "2026-11-20" });

    const before = await adherenceWindow(t.db, ann.id, "2026-11-02", "2026-11-19");
    await replan(t.db, ann, { kind: "add_time", extraMinutesPerWeek: 120 }, "2026-11-20");
    const after = (await getActivePlan(t.db, ann.id))!;
    expect(after.plan.startDate).toBe("2026-11-20");
    expect(after.items.every((i) => i.date >= "2026-11-20")).toBe(true);
    expect(after.items.some((i) => i.type === "read" && i.moduleId === moduleId)).toBe(false);
    expect(after.plan.weeklyMinutes.reduce((a, b) => a + b, 0)).toBeGreaterThan(WEEK.reduce((a, b) => a + b, 0));

    const whole = await t.db.select().from(studyPlans).where(and(eq(studyPlans.studentId, ann.id), eq(studyPlans.active, true)));
    expect(whole).toHaveLength(1);
    // The earlier shortfall is still attributed to the old plan.
    const later = await adherenceWindow(t.db, ann.id, "2026-11-02", "2026-11-19");
    expect(later.planned).toBe(before.planned);
    expect(later.planned).toBeGreaterThan(later.done);
    expect(c.modules.length).toBeGreaterThan(0);
  });

  it("rejects an out-of-range extra-time choice", async () => {
    await expect(replan(t.db, ann, { kind: "add_time", extraMinutesPerWeek: 5 }, "2026-11-21")).rejects.toBeInstanceOf(ValidationError);
  });

  it("has nothing to replan without a plan", async () => {
    await expect(replan(t.db, ben, { kind: "as_is" }, "2026-11-21")).rejects.toThrow(/plan/i);
  });

  it("keeps plan items even after a replan (history)", async () => {
    const all = await t.db.select().from(planItems);
    expect(all.length).toBeGreaterThan(100);
  });
});
