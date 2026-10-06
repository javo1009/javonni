import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { attempts, enrollments, questions } from "@/db/schema";
import { createTestDb, type TestDb } from "@/test/db";
import { seedBase } from "@/test/seed";
import { assertCanViewStudent } from "../access";
import { createClass, getClassOverview, getRoster, listClasses } from "../classes";
import { getActiveCurriculum } from "../curriculum";
import {
  assembleQuestions,
  createAssignment,
  getAssignmentForStudent,
  getAssignmentForTeacher,
  gradeSubmission,
  homeworkStats,
  listStudentAssignments,
  listTeacherAssignments,
  saveDraft,
  submitAssignment,
} from "../homework";
import { ForbiddenError, NotFoundError, ValidationError, type Actor } from "../types";
import { createUser } from "../users";

let t: TestDb;
let teacher: Actor;
let otherTeacher: Actor;
let s1: Actor;
let s2: Actor;
let outsider: Actor;
let classId: string;
let otherClassId: string;

const NOW = new Date("2026-11-10T09:00:00Z");
const DUE = new Date("2026-11-12T21:00:00Z");
const policies = { showAnswers: "after_due" as const, allowLate: true };

async function actor(email: string, role: "student" | "teacher") {
  const u = await createUser(t.db, { email, name: email.split("@")[0], role, password: "a-long-password-1" });
  return { id: u.id, role } as Actor;
}

beforeAll(async () => {
  t = await createTestDb();
  await seedBase(t.db);
  teacher = await actor("teach@x.test", "teacher");
  otherTeacher = await actor("other@x.test", "teacher");
  s1 = await actor("s1@x.test", "student");
  s2 = await actor("s2@x.test", "student");
  outsider = await actor("out@x.test", "student");
  const cls = await createClass(t.db, teacher, { name: "Evening A" }, "2026-11-01");
  classId = cls.id;
  otherClassId = (await createClass(t.db, otherTeacher, { name: "Other" }, "2026-11-01")).id;
  await t.db.insert(enrollments).values([
    { classId, studentId: s1.id },
    { classId, studentId: s2.id },
    { classId: otherClassId, studentId: outsider.id },
  ]);
});
afterAll(() => t.drop());

async function mcqItems(n: number) {
  const c = await getActiveCurriculum(t.db);
  const moduleIds = c.modules.filter((m) => c.topicById.get(m.topicId)!.name === "Quantitative Methods").map((m) => m.id);
  const { questionIds } = await assembleQuestions(t.db, teacher, { moduleIds, count: n });
  return questionIds.map((questionId) => ({ kind: "mcq" as const, questionId }));
}

describe("classes and access control", () => {
  it("creates classes with readable join codes", async () => {
    const list = await listClasses(t.db, teacher);
    expect(list).toHaveLength(1);
    expect(list[0].joinCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(list[0].students).toBe(2);
  });

  it("only lets a teacher see their own classes and students", async () => {
    await expect(getRoster(t.db, otherTeacher, classId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getRoster(t.db, s1, classId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(assertCanViewStudent(t.db, teacher, s1.id)).resolves.toBeUndefined();
    await expect(assertCanViewStudent(t.db, teacher, outsider.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(assertCanViewStudent(t.db, s1, s2.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(assertCanViewStudent(t.db, s1, s1.id)).resolves.toBeUndefined();
  });

  it("doesn't let students create classes", async () => {
    await expect(createClass(t.db, s1, { name: "Mine" }, "2026-11-01")).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("assembleQuestions", () => {
  it("spreads questions across chapters and reports uncovered ones", async () => {
    const c = await getActiveCurriculum(t.db);
    const pick = ["quantitative-methods-04", "quantitative-methods-05", "economics-01"].map((slug) => c.moduleBySlug.get(slug)!.id);
    const r = await assembleQuestions(t.db, teacher, { moduleIds: pick, count: 4 });
    expect(r.questionIds).toHaveLength(4);
    expect(r.uncoveredModuleIds).toEqual([pick[2]]); // no sample question for economics-01
    expect(r.coveredModuleIds).toEqual([pick[0], pick[1]]);
    await expect(assembleQuestions(t.db, s1, { moduleIds: pick, count: 2 })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(assembleQuestions(t.db, teacher, { moduleIds: [], count: 2 })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("homework round trip", () => {
  let hwId: string;

  it("validates assignments", async () => {
    const items = await mcqItems(2);
    const base = { classId, title: "TVM drill", dueAt: DUE, target: { kind: "class" as const }, policies, items, assign: true };
    await expect(createAssignment(t.db, otherTeacher, base, NOW)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createAssignment(t.db, teacher, { ...base, items: [] }, NOW)).rejects.toBeInstanceOf(ValidationError);
    await expect(createAssignment(t.db, teacher, { ...base, dueAt: new Date("2026-11-01") }, NOW)).rejects.toBeInstanceOf(ValidationError);
    await expect(
      createAssignment(t.db, teacher, { ...base, target: { kind: "students", studentIds: [outsider.id] } }, NOW),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("assigns to the class; students see it, outsiders don't", async () => {
    const items = [...(await mcqItems(3)), { kind: "text" as const, prompt: "Explain why the annuity-due value is higher.", points: 2 }];
    const a = await createAssignment(
      t.db,
      teacher,
      { classId, title: "TVM drill", dueAt: DUE, target: { kind: "class" }, policies, items, assign: true },
      NOW,
    );
    hwId = a.id;
    expect((await listStudentAssignments(t.db, s1, NOW)).map((x) => x.id)).toEqual([hwId]);
    expect(await listStudentAssignments(t.db, outsider, NOW)).toEqual([]);
    await expect(getAssignmentForStudent(t.db, outsider, hwId, NOW)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("hides answer keys before submission", async () => {
    const view = await getAssignmentForStudent(t.db, s1, hwId, NOW);
    expect(view.items).toHaveLength(4);
    for (const it of view.items) {
      expect(it.reveal).toBeNull();
      expect(it.result).toBeNull();
      expect(JSON.stringify(it)).not.toMatch(/correctKey|explanation/);
    }
  });

  it("saves drafts, submits, auto-grades MCQ and feeds mastery", async () => {
    const view = await getAssignmentForStudent(t.db, s1, hwId, NOW);
    const qs = await t.db.select().from(questions);
    const answers = view.items.map((it, i) => {
      if (it.kind === "text") return { itemId: it.id, textAnswer: "Each payment is received one period earlier." };
      // First answer wrong, the rest right.
      const q = qs.find((x) => x.stem === it.prompt)!;
      const key = i === 0 ? q.options.find((o) => o.key !== q.correctKey)!.key : q.correctKey;
      return { itemId: it.id, chosenKey: key };
    });
    await saveDraft(t.db, s1, hwId, answers.slice(0, 1));
    const sub = await submitAssignment(t.db, s1, hwId, answers, NOW);
    expect(sub.status).toBe("submitted"); // the written answer awaits the teacher
    expect(sub.late).toBe(false);
    expect(sub.score).toBe(2);
    expect(sub.maxScore).toBe(5);
    const hwAttempts = await t.db.select().from(attempts).where(eq(attempts.assignmentId, hwId));
    expect(hwAttempts).toHaveLength(3);
    expect(hwAttempts.every((a) => a.mode === "homework")).toBe(true);
  });

  it("refuses a second submission and further edits", async () => {
    await expect(submitAssignment(t.db, s1, hwId, [], NOW)).rejects.toBeInstanceOf(ValidationError);
    await expect(saveDraft(t.db, s1, hwId, [])).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses concurrent double submits without double-counting attempts", async () => {
    const view = await getAssignmentForStudent(t.db, s2, hwId, NOW);
    const answers = view.items.filter((i) => i.kind === "mcq").map((i) => ({ itemId: i.id, chosenKey: "A" }));
    const results = await Promise.allSettled([
      submitAssignment(t.db, s2, hwId, answers, NOW),
      submitAssignment(t.db, s2, hwId, answers, NOW),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rows = (await t.db.select().from(attempts).where(eq(attempts.assignmentId, hwId))).filter((a) => a.studentId === s2.id);
    expect(rows).toHaveLength(3);
  });

  it("shows the teacher a completion funnel and per-question stats", async () => {
    const list = await listTeacherAssignments(t.db, teacher, classId);
    expect(list[0]).toMatchObject({ targeted: 2, submitted: 2, needsGrading: 2 });
    const detail = await getAssignmentForTeacher(t.db, teacher, hwId);
    expect(detail.students.map((s) => s.status)).toEqual(["submitted", "submitted"]);
    expect(detail.items[0].answered).toBe(2);
    await expect(getAssignmentForTeacher(t.db, otherTeacher, hwId)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("requires every written answer graded, within the item's points", async () => {
    const detail = await getAssignmentForTeacher(t.db, teacher, hwId);
    const subId = detail.students.find((s) => s.id === s1.id)!.submissionId!;
    const textItem = detail.items.find((i) => i.item.kind === "text")!.item;
    await expect(gradeSubmission(t.db, teacher, subId, { items: [] })).rejects.toThrow(/written/);
    await expect(gradeSubmission(t.db, teacher, subId, { items: [{ itemId: textItem.id, points: 5 }] })).rejects.toBeInstanceOf(ValidationError);
    await expect(gradeSubmission(t.db, otherTeacher, subId, { items: [{ itemId: textItem.id, points: 1 }] })).rejects.toBeInstanceOf(ForbiddenError);
    const graded = await gradeSubmission(t.db, teacher, subId, { items: [{ itemId: textItem.id, points: 2, feedback: "Good." }], feedback: "Nice work" });
    expect(graded.status).toBe("graded");
    expect(graded.score).toBe(4);
  });

  it("reveals answers only per policy (after the due date)", async () => {
    const before = await getAssignmentForStudent(t.db, s1, hwId, NOW);
    expect(before.reveal).toBe(false);
    expect(before.submission!.score).toBe(4);
    expect(before.submission!.teacherFeedback).toBe("Nice work");
    const after = await getAssignmentForStudent(t.db, s1, hwId, new Date("2026-11-13T00:00:00Z"));
    expect(after.reveal).toBe(true);
    expect(after.items.find((i) => i.kind === "mcq")!.reveal!.correctKey).toMatch(/[ABC]/);
  });

  it("targets individuals only", async () => {
    const items = await mcqItems(1);
    const a = await createAssignment(
      t.db,
      teacher,
      { classId, title: "Just for s2", dueAt: DUE, target: { kind: "students", studentIds: [s2.id] }, policies, items, assign: true },
      NOW,
    );
    expect((await listStudentAssignments(t.db, s1, NOW)).some((x) => x.id === a.id)).toBe(false);
    expect((await listStudentAssignments(t.db, s2, NOW)).some((x) => x.id === a.id)).toBe(true);
  });

  it("keeps drafts invisible to students", async () => {
    const items = await mcqItems(1);
    const a = await createAssignment(
      t.db,
      teacher,
      { classId, title: "Draft one", dueAt: DUE, target: { kind: "class" }, policies, items, assign: false },
      NOW,
    );
    await expect(getAssignmentForStudent(t.db, s1, a.id, NOW)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects late work when the policy forbids it, and flags late work otherwise", async () => {
    const items = await mcqItems(1);
    const strict = await createAssignment(
      t.db,
      teacher,
      { classId, title: "Strict", dueAt: DUE, target: { kind: "class" }, policies: { showAnswers: "never", allowLate: false }, items, assign: true },
      NOW,
    );
    const late = new Date("2026-11-13T09:00:00Z");
    await expect(submitAssignment(t.db, s1, strict.id, [], late)).rejects.toThrow(/late/);
    const lenient = await createAssignment(
      t.db,
      teacher,
      { classId, title: "Lenient", dueAt: DUE, target: { kind: "class" }, policies, items, assign: true },
      NOW,
    );
    const sub = await submitAssignment(t.db, s1, lenient.id, [], late);
    expect(sub.late).toBe(true);
    expect(sub.status).toBe("graded");
  });
});

describe("homework stats", () => {
  it("doesn't count homework due before a student joined as missed", async () => {
    const late = await actor("latejoin@x.test", "student");
    await t.db.insert(enrollments).values({ classId, studentId: late.id, joinedAt: new Date("2026-11-18T00:00:00Z") });
    const stats = await homeworkStats(t.db, classId, new Date("2026-11-20T00:00:00Z"));
    expect(stats.missedByStudent.get(late.id) ?? 0).toBe(0);
    // ...and the teacher's funnel agrees: they aren't counted as targeted for past work.
    const list = await listTeacherAssignments(t.db, teacher, classId);
    const past = list.find((a) => a.dueAt < new Date("2026-11-18T00:00:00Z"))!;
    const detail = await getAssignmentForTeacher(t.db, teacher, past.id);
    expect(detail.students.some((s) => s.id === late.id)).toBe(false);
    // ...and the late joiner doesn't see it as overdue homework.
    const theirs = await listStudentAssignments(t.db, late, new Date("2026-11-20T00:00:00Z"));
    expect(theirs.some((a) => a.id === past.id)).toBe(false);
    await t.db.delete(enrollments).where(eq(enrollments.studentId, late.id));
  });
});

describe("class overview", () => {
  it("builds KPIs, per-topic summary and alerts for a class", async () => {
    const o = await getClassOverview(t.db, teacher, classId, "2026-11-20", Date.UTC(2026, 10, 20));
    expect(o.students).toHaveLength(2);
    expect(o.kpis.total).toBe(2);
    expect(o.topics).toHaveLength(10);
    expect(o.topicSummary).toHaveLength(10);
    const s2Row = o.students.find((s) => s.id === s2.id)!;
    expect(s2Row.alerts.some((a) => a.kind === "missed_homework")).toBe(true);
    expect(o.attention.length).toBeGreaterThan(0);
    expect(o.weakestTopic).not.toBeNull();
    await expect(getClassOverview(t.db, otherTeacher, classId, "2026-11-20")).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("editing homework", () => {
  it("lets a draft change everything but an assigned task only its due date", async () => {
    const { updateAssignment, publishAssignment } = await import("../homework");
    const items = await mcqItems(1);
    const draft = await createAssignment(t.db, teacher, { classId, title: "Edit me", dueAt: DUE, target: { kind: "class" }, policies, items, assign: false }, NOW);
    const later = new Date("2026-11-20T21:00:00Z");
    const d = await updateAssignment(t.db, teacher, draft.id, { title: "Edited", dueAt: later }, NOW);
    expect(d.title).toBe("Edited");
    expect(d.dueAt.toISOString()).toBe(later.toISOString());
    await expect(updateAssignment(t.db, teacher, draft.id, { dueAt: new Date("2026-11-01") }, NOW)).rejects.toBeInstanceOf(ValidationError);
    await expect(updateAssignment(t.db, otherTeacher, draft.id, { title: "Hijack" }, NOW)).rejects.toBeInstanceOf(ForbiddenError);
    await publishAssignment(t.db, teacher, draft.id, NOW);
    await expect(updateAssignment(t.db, teacher, draft.id, { title: "Changed under students" }, NOW)).rejects.toThrow(/Only the due date/);
    const ext = await updateAssignment(t.db, teacher, draft.id, { dueAt: new Date("2026-11-25T21:00:00Z") }, NOW);
    expect(ext.dueAt.toISOString()).toBe("2026-11-25T21:00:00.000Z");
  });
});
