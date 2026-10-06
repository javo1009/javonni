import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { enrollments } from "@/db/schema";
import { seedSampleCurriculum } from "@/db/seed/sample";
import { addDays, startOfWeek } from "@/domain/dates";
import { createTestDb, type TestDb } from "@/test/db";
import { createClass } from "../classes";
import { getActiveCurriculum } from "../curriculum";
import { assembleQuestions, createAssignment, getAssignmentForStudent, submitAssignment } from "../homework";
import {
  buildBurnUp,
  getBuilderData,
  getCockpit,
  getQuestionBank,
  getStudent360,
  isUuid,
  questionPreviews,
} from "../teacher-views";
import { ForbiddenError, type Actor } from "../types";
import { createUser } from "../users";

let t: TestDb;
let teacher: Actor;
let otherTeacher: Actor;
let lonelyTeacher: Actor;
let s1: Actor;
let s2: Actor;
let outsider: Actor;
let classId: string;
let otherClassId: string;

const TODAY = "2026-11-11"; // a Wednesday
const NOW = new Date("2026-11-11T09:00:00Z");

async function actor(email: string, role: "student" | "teacher") {
  const u = await createUser(t.db, { email, name: email.split("@")[0], role, password: "a-long-password-1" });
  return { id: u.id, role } as Actor;
}

beforeAll(async () => {
  t = await createTestDb();
  await seedSampleCurriculum(t.db);
  teacher = await actor("teach@tv.test", "teacher");
  otherTeacher = await actor("other@tv.test", "teacher");
  lonelyTeacher = await actor("lonely@tv.test", "teacher");
  s1 = await actor("s1@tv.test", "student");
  s2 = await actor("s2@tv.test", "student");
  outsider = await actor("out@tv.test", "student");
  classId = (await createClass(t.db, teacher, { name: "Evening A" })).id;
  otherClassId = (await createClass(t.db, otherTeacher, { name: "Other" })).id;
  const joined = new Date("2026-10-01T00:00:00Z");
  await t.db.insert(enrollments).values([
    { classId, studentId: s1.id, joinedAt: joined },
    { classId, studentId: s2.id, joinedAt: joined },
    { classId: otherClassId, studentId: outsider.id, joinedAt: joined },
  ]);
});
afterAll(() => t.drop());

async function homework(title: string, dueAt: Date, assign = true) {
  const c = await getActiveCurriculum(t.db);
  const { questionIds } = await assembleQuestions(t.db, teacher, { losIds: c.los.slice(0, 3).map((l) => l.id), count: 3 });
  return createAssignment(
    t.db,
    teacher,
    {
      classId,
      title,
      dueAt,
      target: { kind: "class" },
      policies: { showAnswers: "after_due", allowLate: true },
      items: [...questionIds.map((questionId) => ({ kind: "mcq" as const, questionId })), { kind: "text" as const, prompt: "Explain annuities.", points: 2 }],
      assign,
    },
    new Date("2026-11-01T09:00:00Z"),
  );
}

describe("isUuid", () => {
  it("accepts uuids and rejects everything else", () => {
    expect(isUuid("7944ed79-048d-477c-a04b-7c68319b8890")).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid("7944ed79-048d-477c-a04b-7c68319b8890' or 1=1")).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });
});

describe("buildBurnUp", () => {
  it("accumulates planned and studied hours and stops studied at today", () => {
    const pts = buildBurnUp(
      [
        { date: "2026-11-01", minutes: 60 },
        { date: "2026-11-02", minutes: 120 },
        { date: "2026-11-04", minutes: 60 },
      ],
      [
        { date: "2026-10-31", minutes: 999 }, // before plan start: ignored
        { date: "2026-11-01", minutes: 30 },
        { date: "2026-11-02", minutes: 60 },
      ],
      "2026-11-01",
      "2026-11-04",
      "2026-11-02",
    );
    expect(pts).toEqual([
      { date: "2026-11-01", planned: 1, done: 0.5 },
      { date: "2026-11-02", planned: 3, done: 1.5 },
      { date: "2026-11-03", planned: 3, done: null },
      { date: "2026-11-04", planned: 4, done: null },
    ]);
  });

  it("samples long plans but keeps today and the exam day", () => {
    const pts = buildBurnUp([], [], "2026-01-01", "2026-12-31", "2026-06-15");
    expect(pts.length).toBeLessThan(60);
    expect(pts.some((p) => p.date === "2026-06-15")).toBe(true);
    expect(pts[pts.length - 1].date).toBe("2026-12-31");
  });

  it("returns nothing for an exam before the start", () => {
    expect(buildBurnUp([], [], "2026-05-01", "2026-04-01", "2026-04-15")).toEqual([]);
  });
});

describe("getCockpit", () => {
  it("returns an empty cockpit for a teacher without classes", async () => {
    const r = await getCockpit(t.db, lonelyTeacher, undefined, TODAY, NOW.getTime());
    expect(r.overview).toBeNull();
    expect(r.classes).toHaveLength(0);
  });

  it("defaults to the first class and ignores classes the teacher doesn't teach", async () => {
    const r = await getCockpit(t.db, teacher, otherClassId, TODAY, NOW.getTime());
    expect(r.overview?.cls.id).toBe(classId);
    expect(r.overview?.students.map((s) => s.id).sort()).toEqual([s1.id, s2.id].sort());
  });

  it("lists homework due this week with submission counts", async () => {
    const weekStart = new Date(`${startOfWeek(TODAY)}T00:00:00Z`);
    const due = new Date(weekStart.getTime() + 5 * 86_400_000 + 20 * 3_600_000); // Saturday 20:00
    const a = await homework("Due this week", due);
    await homework("Due next week", new Date(`${addDays(startOfWeek(TODAY), 9)}T20:00:00Z`));
    await homework("Draft this week", due, false);

    const view = await getAssignmentForStudent(t.db, s1, a.id, NOW);
    await submitAssignment(
      t.db,
      s1,
      a.id,
      view.items.map((i) => (i.kind === "text" ? { itemId: i.id, textAnswer: "Because of timing." } : { itemId: i.id, chosenKey: "A" })),
      NOW,
    );

    const r = await getCockpit(t.db, teacher, classId, TODAY, NOW.getTime());
    expect(r.dueThisWeek.map((d) => d.title)).toEqual(["Due this week"]);
    expect(r.dueThisWeek[0]).toMatchObject({ targeted: 2, submitted: 1, needsGrading: 1 });
    expect(r.toGrade).toBe(1);
  });

  it("is forbidden for students", async () => {
    await expect(getCockpit(t.db, s1, undefined, TODAY)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("getStudent360", () => {
  it("shows the student's homework, readiness trend and adherence window", async () => {
    const v = await getStudent360(t.db, teacher, s1.id, TODAY, NOW.getTime());
    expect(v.student.id).toBe(s1.id);
    expect(v.classes.map((c) => c.id)).toEqual([classId]);
    expect(v.weeklyReadiness).toHaveLength(4);
    expect(v.daily).toHaveLength(14);
    expect(v.plan).toBeNull();
    expect(v.burnUp).toBeNull();
    const titles = v.homework.map((h) => h.title);
    expect(titles).toContain("Due this week");
    expect(titles).not.toContain("Draft this week");
    const submitted = v.homework.find((h) => h.title === "Due this week")!;
    expect(submitted.status).toBe("submitted");
    expect(submitted.submissionId).not.toBeNull();
    // Homework answers count as activity on the submission day.
    expect(v.activity.some((e) => e.kind === "homework")).toBe(true);
    // Answering homework counts as activity; s2 has done nothing and is flagged with evidence.
    expect(v.lastActive).toBe(TODAY);
    expect(v.alerts.some((a) => a.kind === "inactive")).toBe(false);
    const idle = await getStudent360(t.db, teacher, s2.id, TODAY, NOW.getTime());
    expect(idle.alerts.find((a) => a.kind === "inactive")?.evidence).toBe("No study activity yet.");
  });

  it("refuses students outside the teacher's classes and other students", async () => {
    await expect(getStudent360(t.db, teacher, outsider.id, TODAY)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getStudent360(t.db, s2, s1.id, TODAY)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("builder and question bank", () => {
  it("returns the teacher's classes with rosters and the curriculum tree with counts", async () => {
    const d = await getBuilderData(t.db, teacher);
    expect(d.classes.map((c) => c.id)).toEqual([classId]);
    expect(d.classes[0].students).toHaveLength(2);
    const c = await getActiveCurriculum(t.db);
    expect(d.topics).toHaveLength(c.topics.length);
    const losCount = d.topics.flatMap((tp) => tp.modules.flatMap((m) => m.los)).length;
    expect(losCount).toBe(c.los.length);
  });

  it("previews questions in the given order without answer keys", async () => {
    const c = await getActiveCurriculum(t.db);
    const { questionIds } = await assembleQuestions(t.db, teacher, { losIds: c.los.slice(0, 4).map((l) => l.id), count: 4 });
    const reversed = [...questionIds].reverse();
    const p = await questionPreviews(t.db, teacher, reversed);
    expect(p.map((x) => x.id)).toEqual(reversed);
    expect(p[0]).not.toHaveProperty("correctKey");
    expect(p.every((x) => x.losCode)).toBe(true);
    await expect(questionPreviews(t.db, s1, reversed)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("lists questions for one objective and reports gaps", async () => {
    const c = await getActiveCurriculum(t.db);
    const bank = await getQuestionBank(t.db, teacher, {});
    expect(bank.los).toBeNull();
    expect(bank.totals.los).toBe(c.los.length);
    expect(bank.totals.withQuestions).toBeLessThanOrEqual(bank.totals.los);
    const withQs = bank.tree.flatMap((tp) => tp.modules.flatMap((m) => m.los)).find((l) => l.questions > 0)!;
    const one = await getQuestionBank(t.db, teacher, { losId: withQs.id });
    expect(one.los?.id).toBe(withQs.id);
    expect(one.questions).toHaveLength(withQs.questions);
    expect(one.topicId).toBe(c.topicByLos.get(withQs.id));
    // Unknown ids fall back gracefully.
    const unknown = await getQuestionBank(t.db, teacher, { losId: "00000000-0000-4000-8000-000000000000", topicId: "00000000-0000-4000-8000-000000000000" });
    expect(unknown.los).toBeNull();
    expect(unknown.topicId).toBeNull();
    await expect(getQuestionBank(t.db, s1, {})).rejects.toBeInstanceOf(ForbiddenError);
  });
});
