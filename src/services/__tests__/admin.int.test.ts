import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { auditLog, classes, curriculumVersions, enrollments, questionLos, questions, studyPlans, users } from "@/db/schema";
import { seedSampleCurriculum } from "@/db/seed/sample";
import { SAMPLE_STATS } from "@/db/seed/sample-data";
import { curriculumToCsv, REQUIRED_COLUMNS } from "@/domain/curriculum-csv";
import { createTestDb, type TestDb } from "@/test/db";
import {
  activateVersion,
  adminOverview,
  coverageReport,
  createTeacher,
  curriculumShape,
  generatePassword,
  getVersionForExport,
  importCurriculum,
  importCurriculumFromCli,
  listUsers,
  listVersions,
  MIN_QUESTIONS_PER_LOS,
  previewImport,
  recentAudit,
  setUserDisabled,
} from "../admin";
import { getActiveCurriculum } from "../curriculum";
import { createPlan } from "../plan";
import { ForbiddenError, NotFoundError, ValidationError, type Actor } from "../types";
import { authenticate, createUser, getUserById } from "../users";

let t: TestDb;
let admin: Actor;
let teacher: Actor;
let student: Actor;
let sampleVersionId: string;

const HEADER = REQUIRED_COLUMNS.join(",");
const VALID = [
  HEADER,
  "ETH,Ethics,15,20,Standards,120,ETH.1.a,describe,Describe the duties owed to clients.,2",
  "ETH,Ethics,15,20,Standards,120,ETH.1.b,explain,Explain the standards.,3",
  "QM,Quantitative Methods,6,9,Rates,240,QM.1.a,calculate,Calculate an effective annual rate.,2",
].join("\n");
const BROKEN = [HEADER, "ETH,Ethics,15,20,Standards,120,ETH.1.a,describe,Describe.,9", "ETH,Ethics,25,20,Standards,120,ETH.1.a,describe,Dup.,2"].join("\n");

async function mk(email: string, role: "student" | "teacher" | "admin"): Promise<Actor> {
  const u = await createUser(t.db, { email, name: email.split("@")[0], role, password: "a-long-password-1" });
  return { id: u.id, role };
}

beforeAll(async () => {
  t = await createTestDb();
  const seeded = await seedSampleCurriculum(t.db);
  sampleVersionId = seeded.written!.versionId;
  admin = await mk("admin@x.test", "admin");
  teacher = await mk("teach@x.test", "teacher");
  student = await mk("stud@x.test", "student");
  const [cls] = await t.db.insert(classes).values({ name: "Evening", teacherId: teacher.id, joinCode: "EVE234" }).returning();
  await t.db.insert(enrollments).values({ classId: cls.id, studentId: student.id });
});
afterAll(() => t.drop());

describe("authorization", () => {
  it("refuses every admin operation for teachers and students", async () => {
    for (const who of [teacher, student]) {
      await expect(adminOverview(t.db, who)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(recentAudit(t.db, who)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(previewImport(t.db, who, VALID)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(importCurriculum(t.db, who, VALID, { activate: true, name: "Hack", year: 2027 })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(listVersions(t.db, who)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(activateVersion(t.db, who, sampleVersionId)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(getVersionForExport(t.db, who, sampleVersionId)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(coverageReport(t.db, who)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(listUsers(t.db, who)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(createTeacher(t.db, who, { email: "new@x.test", name: "New" })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(setUserDisabled(t.db, who, admin.id, true)).rejects.toBeInstanceOf(ForbiddenError);
    }
    // Nothing was written by the refused calls.
    expect(await t.db.select().from(curriculumVersions)).toHaveLength(1);
    expect(await t.db.select().from(users).where(eq(users.email, "new@x.test"))).toHaveLength(0);
    expect((await t.db.select().from(users).where(eq(users.id, admin.id)))[0].disabledAt).toBeNull();
  });
});

describe("overview", () => {
  it("counts people, classes, questions and the active curriculum", async () => {
    const o = await adminOverview(t.db, admin);
    expect(o).toMatchObject({ students: 1, teachers: 1, admins: 1, classes: 1, versions: 1, activePlans: 0 });
    expect(o.questions.published).toBe(SAMPLE_STATS.questions);
    expect(o.active).toMatchObject({ id: sampleVersionId, isSample: true, los: SAMPLE_STATS.los, topics: SAMPLE_STATS.topics });
  });
});

describe("curriculum import", () => {
  it("previews errors and a diff without writing anything", async () => {
    const bad = await previewImport(t.db, admin, BROKEN);
    expect(bad.errors.length).toBeGreaterThanOrEqual(3);
    expect(bad.errors.map((e) => e.row)).toEqual(expect.arrayContaining([2, 3]));

    const ok = await previewImport(t.db, admin, VALID);
    expect(ok.errors).toEqual([]);
    expect(ok.stats).toEqual({ topics: 2, modules: 2, los: 3 });
    expect(ok.against).toMatchObject({ id: sampleVersionId, isSample: true });
    // The sample uses the same ETH.1.a / ETH.1.b codes with different wording.
    expect(ok.diff!.rewordedLos.map((l) => l.code)).toEqual(expect.arrayContaining(["ETH.1.a", "ETH.1.b"]));
    const matched = ok.stats.los - ok.diff!.addedLos.length;
    expect(ok.diff!.removedLos.length).toBe(SAMPLE_STATS.los - matched);
    expect(await t.db.select().from(curriculumVersions)).toHaveLength(1);
  });

  it("refuses to import a file with errors, or with bad options", async () => {
    await expect(importCurriculum(t.db, admin, BROKEN, { activate: true, name: "Broken", year: 2027 })).rejects.toThrow(/errors/);
    await expect(importCurriculum(t.db, admin, VALID, { activate: true, name: "", year: 2027 })).rejects.toBeInstanceOf(ValidationError);
    await expect(importCurriculum(t.db, admin, VALID, { activate: true, name: "Ok name", year: 1999 })).rejects.toBeInstanceOf(ValidationError);
    await expect(importCurriculum(t.db, admin, HEADER, { activate: true, name: "Empty", year: 2027 })).rejects.toBeInstanceOf(ValidationError);
    await expect(importCurriculum(t.db, admin, "x".repeat(1_000_000), { activate: false, name: "Huge", year: 2027 })).rejects.toThrow(/larger than/);
    expect(await t.db.select().from(curriculumVersions)).toHaveLength(1);
  });

  let inactiveId: string;
  it("imports without activating, and audit-logs it", async () => {
    const r = await importCurriculum(t.db, admin, VALID, { activate: false, name: "2027 draft", year: 2027, sourceNote: "From the official PDF" });
    inactiveId = r.versionId;
    expect(r).toMatchObject({ activated: false, stats: { topics: 2, modules: 2, los: 3 } });
    const c = await getActiveCurriculum(t.db);
    expect(c.version.id).toBe(sampleVersionId);
    const imported = await getActiveCurriculum(t.db, inactiveId);
    expect(imported.version).toMatchObject({ name: "2027 draft", year: 2027, isSample: false, sourceNote: "From the official PDF" });
    expect(imported.los.map((l) => l.code).sort()).toEqual(["ETH.1.a", "ETH.1.b", "QM.1.a"]);
    const [log] = await t.db.select().from(auditLog).where(and(eq(auditLog.action, "curriculum.import"), eq(auditLog.entityId, inactiveId)));
    expect(log.actorId).toBe(admin.id);
    expect(log.meta).toMatchObject({ activated: false, los: 3, previousActiveId: sampleVersionId });
  });

  it("lists versions with counts, active first", async () => {
    const v = await listVersions(t.db, admin);
    expect(v.map((x) => x.id)).toEqual([sampleVersionId, inactiveId]);
    expect(v[0]).toMatchObject({ isActive: true, isSample: true, los: SAMPLE_STATS.los, activePlans: 0 });
    expect(v[1]).toMatchObject({ isActive: false, topics: 2, los: 3 });
  });

  it("activates a version; existing plans keep their own version", async () => {
    await createPlan(t.db, student, { today: "2026-11-02", examDate: "2027-02-20", weeklyMinutes: [90, 90, 90, 90, 90, 240, 240] });
    const r = await activateVersion(t.db, admin, inactiveId);
    expect(r).toEqual({ changed: true, name: "2027 draft" });
    const active = await t.db.select().from(curriculumVersions).where(eq(curriculumVersions.isActive, true));
    expect(active.map((x) => x.id)).toEqual([inactiveId]);
    const [plan] = await t.db.select().from(studyPlans).where(eq(studyPlans.studentId, student.id));
    expect(plan.versionId).toBe(sampleVersionId);
    expect(plan.active).toBe(true);
    // Idempotent.
    expect(await activateVersion(t.db, admin, inactiveId)).toEqual({ changed: false, name: "2027 draft" });
    const logs = await t.db.select().from(auditLog).where(eq(auditLog.action, "curriculum.activate"));
    expect(logs).toHaveLength(1);
    expect(logs[0].meta).toMatchObject({ previousActiveIds: [sampleVersionId] });
    // Unknown ids.
    await expect(activateVersion(t.db, admin, "not-a-uuid")).rejects.toBeInstanceOf(NotFoundError);
    await expect(activateVersion(t.db, admin, "00000000-0000-0000-0000-000000000000")).rejects.toBeInstanceOf(NotFoundError);
    // Back to the sample for the remaining tests.
    await activateVersion(t.db, admin, sampleVersionId);
  });

  it("imports and activates in one step, leaving exactly one active version", async () => {
    const r = await importCurriculum(t.db, admin, VALID, { activate: true, name: "2027 v2", year: 2027 });
    const active = await t.db.select().from(curriculumVersions).where(eq(curriculumVersions.isActive, true));
    expect(active.map((x) => x.id)).toEqual([r.versionId]);
    await activateVersion(t.db, admin, sampleVersionId);
  });

  it("imports from the CLI without an actor, audit-logged as cli", async () => {
    await expect(importCurriculumFromCli(t.db, BROKEN, { activate: false, name: "Broken", year: 2027 })).rejects.toBeInstanceOf(ValidationError);
    const r = await importCurriculumFromCli(t.db, VALID, { activate: false, name: "From CLI", year: 2027 });
    const [log] = await t.db.select().from(auditLog).where(eq(auditLog.entityId, r.versionId));
    expect(log.actorId).toBeNull();
    expect(log.meta).toMatchObject({ source: "cli", activated: false });
  });

  it("exports a version that re-imports to the same curriculum", async () => {
    const { shape, version } = await getVersionForExport(t.db, admin, sampleVersionId);
    expect(version.id).toBe(sampleVersionId);
    const preview = await previewImport(t.db, admin, curriculumToCsv(shape));
    expect(preview.errors).toEqual([]);
    expect(preview.stats.los).toBe(SAMPLE_STATS.los);
    expect(preview.diff).toMatchObject({ addedLos: [], removedLos: [], rewordedLos: [], movedLos: [], topicChanges: [] });
    await expect(getVersionForExport(t.db, admin, "00000000-0000-0000-0000-000000000000")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("coverage report", () => {
  it("counts published questions per objective and flags gaps below the minimum", async () => {
    const r = (await coverageReport(t.db, admin))!;
    expect(r.version.id).toBe(sampleVersionId);
    expect(r.minQuestions).toBe(MIN_QUESTIONS_PER_LOS);
    expect(r.rows).toHaveLength(SAMPLE_STATS.los);
    expect(r.rows.reduce((s, x) => s + x.questions, 0)).toBe(SAMPLE_STATS.questions);
    for (const row of r.rows) expect(row.belowMin).toBe(row.questions < 3);
    expect(r.summary.belowMin).toBe(r.rows.filter((x) => x.questions < 3).length);
    expect(r.summary.zeroQuestions).toBeGreaterThan(0); // the sample has deliberate gaps
    expect(r.summary.covered + r.summary.belowMin).toBe(r.summary.totalLos);
    expect(r.summary.topics.reduce((s, x) => s + x.los, 0)).toBe(SAMPLE_STATS.los);
  });

  it("ignores unpublished questions", async () => {
    const before = (await coverageReport(t.db, admin))!;
    const target = before.rows.find((x) => x.questions === 0)!;
    const [q] = await t.db
      .insert(questions)
      .values({ stem: "Draft?", options: [{ key: "A", text: "a" }], correctKey: "A", explanation: "x", status: "draft" })
      .returning();
    await t.db.insert(questionLos).values({ questionId: q.id, losId: target.losId });
    const after = (await coverageReport(t.db, admin))!;
    expect(after.rows.find((x) => x.losId === target.losId)!.questions).toBe(0);
  });

  it("reports which objectives have a study task in an active plan on this version", async () => {
    const r = (await coverageReport(t.db, admin))!;
    expect(r.activePlans).toBe(1);
    const planned = r.rows.filter((x) => x.inActivePlan).length;
    expect(planned).toBeGreaterThan(0);
    expect(r.summary.notInAnyPlan).toBe(r.rows.length - planned);
    // Deactivating the plan removes it from coverage.
    await t.db.update(studyPlans).set({ active: false }).where(eq(studyPlans.studentId, student.id));
    const none = (await coverageReport(t.db, admin))!;
    expect(none.activePlans).toBe(0);
    expect(none.rows.every((x) => !x.inActivePlan)).toBe(true);
    expect(none.summary.notInAnyPlan).toBe(0);
    await t.db.update(studyPlans).set({ active: true }).where(eq(studyPlans.studentId, student.id));
  });

  it("uses a custom minimum", async () => {
    const r = (await coverageReport(t.db, admin, { minQuestions: 1 }))!;
    expect(r.summary.belowMin).toBe(r.summary.zeroQuestions);
  });
});

describe("users", () => {
  it("lists users with class counts and filters", async () => {
    const all = await listUsers(t.db, admin);
    expect(all.map((u) => u.email).sort()).toEqual(["admin@x.test", "stud@x.test", "teach@x.test"]);
    expect(all.find((u) => u.id === teacher.id)!.classes).toBe(1);
    expect(all.find((u) => u.id === student.id)!.classes).toBe(1);
    expect(all[0]).not.toHaveProperty("passwordHash");
    expect((await listUsers(t.db, admin, { role: "teacher" })).map((u) => u.id)).toEqual([teacher.id]);
    expect((await listUsers(t.db, admin, { q: "STUD" })).map((u) => u.id)).toEqual([student.id]);
    expect(await listUsers(t.db, admin, { q: "%" })).toEqual([]);
  });

  it("creates a teacher with a chosen password, audit-logged", async () => {
    const r = await createTeacher(t.db, admin, { email: " New.Teacher@X.test ", name: "New Teacher", password: "teacher-password-1" });
    expect(r.generatedPassword).toBeNull();
    expect(r.user).toMatchObject({ email: "new.teacher@x.test", role: "teacher" });
    expect(await authenticate(t.db, "new.teacher@x.test", "teacher-password-1")).not.toBeNull();
    const [log] = await t.db.select().from(auditLog).where(and(eq(auditLog.action, "user.create"), eq(auditLog.entityId, r.user.id)));
    expect(log.actorId).toBe(admin.id);
  });

  it("generates a strong password when none is given, and can create admins", async () => {
    const r = await createTeacher(t.db, admin, { email: "second.admin@x.test", name: "Second Admin", role: "admin" });
    expect(r.user.role).toBe("admin");
    expect(r.generatedPassword).toMatch(/^[A-Za-z2-9]{16}$/);
    expect(await authenticate(t.db, "second.admin@x.test", r.generatedPassword!)).not.toBeNull();
    expect(new Set(Array.from({ length: 20 }, () => generatePassword())).size).toBe(20);
  });

  it("validates staff input", async () => {
    await expect(createTeacher(t.db, admin, { email: "bad", name: "Bad" })).rejects.toBeInstanceOf(ValidationError);
    await expect(createTeacher(t.db, admin, { email: "ok@x.test", name: "A" })).rejects.toBeInstanceOf(ValidationError);
    await expect(createTeacher(t.db, admin, { email: "ok@x.test", name: "Okay", password: "short" })).rejects.toThrow(/at least 10/);
    await expect(createTeacher(t.db, admin, { email: "ok@x.test", name: "Okay", role: "student" as "teacher" })).rejects.toBeInstanceOf(ValidationError);
    await expect(createTeacher(t.db, admin, { email: "TEACH@x.test", name: "Dup" })).rejects.toThrow(/already exists/);
  });

  it("disables and re-enables accounts, but never your own", async () => {
    await expect(setUserDisabled(t.db, admin, admin.id, true)).rejects.toThrow(/your own account/);
    await expect(setUserDisabled(t.db, admin, "00000000-0000-0000-0000-000000000000", true)).rejects.toBeInstanceOf(NotFoundError);
    await expect(setUserDisabled(t.db, admin, "nope", true)).rejects.toBeInstanceOf(NotFoundError);

    const off = await setUserDisabled(t.db, admin, teacher.id, true);
    expect(off.disabledAt).toBeInstanceOf(Date);
    expect(await getUserById(t.db, teacher.id)).toBeNull();
    expect(await authenticate(t.db, "teach@x.test", "a-long-password-1")).toBeNull();
    expect((await adminOverview(t.db, admin)).teachers).toBe(1); // only the newly created teacher is enabled

    const on = await setUserDisabled(t.db, admin, teacher.id, false);
    expect(on.disabledAt).toBeNull();
    expect(await getUserById(t.db, teacher.id)).not.toBeNull();
    const actions = (await t.db.select().from(auditLog).where(eq(auditLog.entityId, teacher.id))).map((l) => l.action).sort();
    expect(actions).toEqual(["user.disable", "user.enable"]);
  });

  it("shows recent audit entries newest first with the actor's name", async () => {
    const log = await recentAudit(t.db, admin, 3);
    expect(log).toHaveLength(3);
    expect(log[0].action).toBe("user.enable");
    expect(log[0].actorName).toBe("admin");
  });
});

describe("curriculumShape", () => {
  it("mirrors the loaded curriculum", async () => {
    const shape = curriculumShape(await getActiveCurriculum(t.db));
    expect(shape.topics).toHaveLength(SAMPLE_STATS.topics);
    expect(shape.topics.flatMap((x) => x.modules).flatMap((m) => m.los)).toHaveLength(SAMPLE_STATS.los);
  });
});
