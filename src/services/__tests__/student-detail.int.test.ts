import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { enrollments } from "@/db/schema";
import { createTestDb, type TestDb } from "@/test/db";
import { makeActor, seedBase } from "@/test/seed";
import { createClass } from "../classes";
import { createAssignment } from "../homework";
import { getStudentForTeacher } from "../student-detail";
import { ForbiddenError, NotFoundError, type Actor } from "../types";

let t: TestDb;
let teacher: Actor, other: Actor, admin: Actor, s1: Actor, s2: Actor;

beforeAll(async () => {
  t = await createTestDb();
  await seedBase(t.db);
  teacher = await makeActor(t.db, "t@x.test", "teacher");
  other = await makeActor(t.db, "o@x.test", "teacher");
  admin = await makeActor(t.db, "a@x.test", "admin");
  s1 = await makeActor(t.db, "s1@x.test", "student");
  s2 = await makeActor(t.db, "s2@x.test", "student");
  const c = await createClass(t.db, teacher, { name: "Class A" }, "2026-11-01");
  await t.db.insert(enrollments).values({ classId: c.id, studentId: s1.id });
  await createAssignment(
    t.db,
    teacher,
    { classId: c.id, title: "Worksheet 1", dueAt: new Date("2026-11-12T21:00:00Z"), target: { kind: "class" }, policies: { showAnswers: "never", allowLate: true }, items: [{ kind: "file", prompt: "Upload your work" }], assign: true },
    new Date("2026-11-10T09:00:00Z"),
  );
});
afterAll(() => t.drop());

describe("getStudentForTeacher", () => {
  it("shows a teacher their own student with homework history", async () => {
    const d = await getStudentForTeacher(t.db, teacher, s1.id, "2026-11-11");
    expect(d.student.email).toBe("s1@x.test");
    expect(d.classes).toHaveLength(1);
    expect(d.homework.map((h) => h.title)).toEqual(["Worksheet 1"]);
    expect(d.homework[0].status).toBe("not_started");
    expect(await getStudentForTeacher(t.db, admin, s1.id, "2026-11-11")).toBeTruthy();
  });

  it("refuses other teachers, unenrolled students, students and non-students", async () => {
    await expect(getStudentForTeacher(t.db, other, s1.id, "2026-11-11")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getStudentForTeacher(t.db, s1, s1.id, "2026-11-11")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getStudentForTeacher(t.db, admin, s2.id, "2026-11-11")).rejects.toBeInstanceOf(NotFoundError);
    await expect(getStudentForTeacher(t.db, admin, teacher.id, "2026-11-11")).rejects.toBeInstanceOf(NotFoundError);
  });
});
