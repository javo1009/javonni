import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { enrollments, studentProfiles } from "@/db/schema";
import { createTestDb, type TestDb } from "@/test/db";
import { makeActor, seedBase, slugModule } from "@/test/seed";
import { createClass, getClassOverview, listClasses, updateClassSettings } from "../classes";
import type { getActiveCurriculum } from "../curriculum";
import { addMock, ensureProfile, logSession, updateChapter } from "../tracker";
import { ForbiddenError, ValidationError, type Actor } from "../types";

let t: TestDb;
let cur: Awaited<ReturnType<typeof getActiveCurriculum>>;
let teacher: Actor;
let other: Actor;
let classId: string;
let diligent: Actor;
let slacker: Actor;
let newcomer: Actor;

const TODAY = "2026-11-17"; // Tuesday, six weeks into the roadmap

beforeAll(async () => {
  t = await createTestDb();
  cur = await seedBase(t.db);
  teacher = await makeActor(t.db, "teach@x.test", "teacher");
  other = await makeActor(t.db, "other@x.test", "teacher");
  const cls = await createClass(t.db, teacher, { name: "Evening", examDate: "2027-02-18", planStart: "2026-10-06", weeklyTargetHours: 10 }, "2026-10-01");
  classId = cls.id;
  diligent = await makeActor(t.db, "dil@x.test", "student");
  slacker = await makeActor(t.db, "slack@x.test", "student");
  newcomer = await makeActor(t.db, "new@x.test", "student");
  await t.db.insert(enrollments).values([
    { classId, studentId: diligent.id, joinedAt: new Date("2026-10-06T08:00:00Z") },
    { classId, studentId: slacker.id, joinedAt: new Date("2026-10-06T08:00:00Z") },
    { classId, studentId: newcomer.id, joinedAt: new Date("2026-11-16T08:00:00Z") },
  ]);
  // Diligent: reads 20 chapters (QM, FSA and a few of Economics), studies ~10 h/week, scores and a mock.
  for (const m of cur.modules.slice(0, 20)) await updateChapter(t.db, diligent, m.id, { read: true, practice: true, review: true, accuracy: 80 }, "2026-11-10");
  for (const d of ["2026-11-03", "2026-11-05", "2026-11-09", "2026-11-11", "2026-11-14", "2026-11-16", "2026-11-17"])
    await logSession(t.db, diligent, { date: d, minutes: 180, topic: "Quantitative Methods" }, TODAY);
  await addMock(t.db, diligent, { date: "2026-11-15", score: 66 }, TODAY);
  // Slacker: one chapter read a month ago, a single short session, weak score, mocks dropping.
  await updateChapter(t.db, slacker, cur.modules[0].id, { read: true, accuracy: 40 }, "2026-10-20");
  await updateChapter(t.db, slacker, cur.modules[1].id, { accuracy: 50 }, "2026-10-20");
  await updateChapter(t.db, slacker, cur.modules[2].id, { accuracy: 45 }, "2026-10-20");
  await logSession(t.db, slacker, { date: "2026-10-21", minutes: 60, topic: "Quantitative Methods" }, "2026-10-21");
  await addMock(t.db, slacker, { date: "2026-10-25", score: 58 }, "2026-10-25");
  await addMock(t.db, slacker, { date: "2026-11-01", score: 49 }, "2026-11-01");
});
afterAll(() => t.drop());

describe("class settings", () => {
  it("creates a class with exam date, roadmap start and weekly target", async () => {
    const list = await listClasses(t.db, teacher);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ examDate: "2027-02-18", planStart: "2026-10-06", weeklyTargetMinutes: 600, students: 3 });
    expect(list[0].joinCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  });

  it("validates settings", async () => {
    const bad = (s: object) => createClass(t.db, teacher, { name: "X1", ...s }, "2026-10-01");
    await expect(bad({ name: "x" })).rejects.toBeInstanceOf(ValidationError);
    await expect(bad({ examDate: "2027-01-10" })).rejects.toBeInstanceOf(ValidationError);
    await expect(bad({ examDate: "2028-03-01" })).rejects.toBeInstanceOf(ValidationError);
    await expect(bad({ weeklyTargetHours: 0 })).rejects.toBeInstanceOf(ValidationError);
    await expect(bad({ examDate: "2027-03-01", planStart: "2027-02-20" })).rejects.toBeInstanceOf(ValidationError);
    await expect(createClass(t.db, diligent, { name: "Mine" }, TODAY)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("changes a class's defaults and can apply them to every enrolled student", async () => {
    await ensureProfile(t.db, diligent.id, TODAY);
    await updateClassSettings(t.db, teacher, classId, { examDate: "2027-05-19", weeklyTargetHours: 8, applyToStudents: true }, TODAY);
    const rows = await t.db.select().from(studentProfiles);
    expect(rows).toHaveLength(3);
    for (const r of rows) expect(r).toMatchObject({ examDate: "2027-05-19", weeklyTargetMinutes: 480 });
    expect(rows.find((r) => r.studentId === diligent.id)?.planStart).toBe("2026-10-06"); // existing profile start kept via class value
    await updateClassSettings(t.db, teacher, classId, { examDate: "2027-02-18", weeklyTargetHours: 10, applyToStudents: true }, TODAY);
  });

  it("is limited to the class's teacher", async () => {
    await expect(updateClassSettings(t.db, other, classId, { name: "Hijack" }, TODAY)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(updateClassSettings(t.db, diligent, classId, { name: "Hijack" }, TODAY)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("class overview", () => {
  it("summarises each student's coverage, hours and mocks", async () => {
    const o = await getClassOverview(t.db, teacher, classId, TODAY, Date.UTC(2026, 10, 17));
    const d = o.students.find((s) => s.id === diligent.id)!;
    const s = o.students.find((x) => x.id === slacker.id)!;
    expect(d.totals).toMatchObject({ read: 20, complete: 20 });
    expect(d.topics[cur.topics[0].id]).toMatchObject({ read: 11, total: 11, avgAccuracy: 80 });
    expect(d.hoursThisWeek).toBe(6); // 16 and 17 Nov (Mon, Tue) at 3 h
    expect(d.mocks).toMatchObject({ count: 1, latest: 66 });
    expect(d.lastActive).toBe("2026-11-17");
    expect(s.totals.read).toBe(1);
    expect(s.avgAccuracy).toBe(45);
    expect(s.mocks).toMatchObject({ count: 2, latest: 49, change: -9 });
  });

  it("measures students against the roadmap", async () => {
    const o = await getClassOverview(t.db, teacher, classId, TODAY, Date.UTC(2026, 10, 17));
    const d = o.students.find((x) => x.id === diligent.id)!;
    // By 17 Nov the roadmap is in Equities (16–29 Nov): QM 11 + FSA 12 + ECO 8 + CF 7 done, plus 2/14 of 12 Equities.
    expect(d.chaptersExpected).toBe(38 + 1);
    expect(d.behindBy).toBe(19);
    expect(o.students.find((x) => x.id === slacker.id)!.behindBy).toBe(38);
  });

  it("raises the right alerts with evidence, most urgent first", async () => {
    const o = await getClassOverview(t.db, teacher, classId, TODAY, Date.UTC(2026, 10, 17));
    const kinds = (id: string) => o.students.find((s) => s.id === id)!.alerts.map((a) => a.kind).sort();
    expect(kinds(slacker.id)).toEqual(["behind_hours", "behind_roadmap", "inactive", "low_scores", "mock_drop"]);
    expect(kinds(diligent.id)).toEqual(["behind_roadmap"]); // read 20 of the 39 expected
    expect(kinds(newcomer.id)).toEqual([]); // joined yesterday: too early to judge
    expect(o.attention[0][0].studentId).toBe(slacker.id);
    expect(o.students.find((s) => s.id === slacker.id)!.alerts.find((a) => a.kind === "inactive")!.evidence).toBe("No activity for 16 days."); // last seen with the 1 Nov mock
  });

  it("computes class KPIs, per-topic summary and the weakest topic", async () => {
    const o = await getClassOverview(t.db, teacher, classId, TODAY, Date.UTC(2026, 10, 17));
    expect(o.kpis).toMatchObject({ total: 3, activeThisWeek: 1, behindRoadmap: 2, avgLatestMock: 57.5 });
    expect(o.kpis.avgReadPct).toBe(Math.round((20 / 102 * 100 + 1 / 102 * 100 + 0) / 3));
    expect(o.kpis.avgHoursThisWeek).toBe(2);
    expect(o.topicSummary[0]).toMatchObject({ topicId: cur.topics[0].id, scoredStudents: 2 });
    expect(o.topicSummary[0].avgAccuracy).toBe(Math.round((80 + 45) / 2));
    expect(o.weakestTopic?.topicId).toBeTruthy();
    expect(o.weakestTopic!.reason).toMatch(/Lowest average practice score/);
  });

  it("uses a student's own profile over the class defaults", async () => {
    const m = slugModule(cur, "alternative-investments-01").id;
    await updateChapter(t.db, newcomer, m, { read: true }, TODAY);
    const own = { studentId: newcomer.id, examDate: "2027-05-19", planStart: "2026-11-16", weeklyTargetMinutes: 1200 };
    await t.db.insert(studentProfiles).values(own).onConflictDoUpdate({ target: studentProfiles.studentId, set: own });
    const o = await getClassOverview(t.db, teacher, classId, TODAY, Date.UTC(2026, 10, 17));
    const n = o.students.find((s) => s.id === newcomer.id)!;
    expect(n).toMatchObject({ examDate: "2027-05-19", weeklyTargetHours: 20 });
    expect(n.totals.read).toBe(1);
    await t.db.delete(studentProfiles).where(eq(studentProfiles.studentId, newcomer.id));
  });

  it("is limited to the class's teacher (and admins)", async () => {
    await expect(getClassOverview(t.db, other, classId, TODAY)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getClassOverview(t.db, diligent, classId, TODAY)).rejects.toBeInstanceOf(ForbiddenError);
    const admin = await makeActor(t.db, "admin@x.test", "admin");
    await expect(getClassOverview(t.db, admin, classId, TODAY)).resolves.toBeTruthy();
  });
});
