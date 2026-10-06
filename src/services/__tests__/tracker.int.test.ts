import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { classes, enrollments, mockResults, moduleProgress, studentProfiles, studySessions } from "@/db/schema";
import { createTestDb, type TestDb } from "@/test/db";
import { makeActor, seedBase, slugModule } from "@/test/seed";
import {
  addMock,
  deleteMock,
  deleteSession,
  ensureProfile,
  exportBackup,
  getTrackerSnapshot,
  importBackup,
  logSession,
  updateChapter,
  updateSettings,
} from "../tracker";
import { ForbiddenError, NotFoundError, ValidationError, type Actor } from "../types";
import type { getActiveCurriculum } from "../curriculum";

let t: TestDb;
let cur: Awaited<ReturnType<typeof getActiveCurriculum>>;
let ann: Actor;
let ben: Actor;
let teacher: Actor;
let otherTeacher: Actor;
let admin: Actor;

const TODAY = "2026-11-02"; // Monday
const qm4 = () => slugModule(cur, "quantitative-methods-04").id;

beforeAll(async () => {
  t = await createTestDb();
  cur = await seedBase(t.db);
  ann = await makeActor(t.db, "ann@x.test", "student");
  ben = await makeActor(t.db, "ben@x.test", "student");
  teacher = await makeActor(t.db, "teach@x.test", "teacher");
  otherTeacher = await makeActor(t.db, "other@x.test", "teacher");
  admin = await makeActor(t.db, "admin@x.test", "admin");
  const [cls] = await t.db.insert(classes).values({ name: "Evening", teacherId: teacher.id, joinCode: "EVE123" }).returning();
  await t.db.insert(enrollments).values({ classId: cls.id, studentId: ann.id });
});
afterAll(() => t.drop());

describe("profile and settings", () => {
  it("defaults to the sample's exam date and 10 h a week, starting today", async () => {
    const p = await ensureProfile(t.db, ann.id, "2026-10-06");
    expect(p).toEqual({ examDate: "2027-02-18", planStart: "2026-10-06", weeklyTargetMinutes: 600 });
  });

  it("is created once and keeps its plan start", async () => {
    const again = await ensureProfile(t.db, ann.id, "2026-12-01");
    expect(again.planStart).toBe("2026-10-06");
    expect(await t.db.select().from(studentProfiles).where(eq(studentProfiles.studentId, ann.id))).toHaveLength(1);
  });

  it("inherits the class's exam date, roadmap start and weekly target", async () => {
    const cls = await makeActor(t.db, "teach2@x.test", "teacher");
    const [c] = await t.db
      .insert(classes)
      .values({ name: "Spring", teacherId: cls.id, joinCode: "SPR123", examDate: "2027-05-19", planStart: "2026-12-07", weeklyTargetMinutes: 900 })
      .returning();
    await t.db.insert(enrollments).values({ classId: c.id, studentId: ben.id });
    expect(await ensureProfile(t.db, ben.id, "2026-12-20")).toEqual({ examDate: "2027-05-19", planStart: "2026-12-07", weeklyTargetMinutes: 900 });
  });

  it("never defaults an exam date into the past", async () => {
    const late = await makeActor(t.db, "late@x.test", "student");
    const p = await ensureProfile(t.db, late.id, "2027-02-10");
    expect(p.examDate > "2027-02-24").toBe(true);
  });

  it("updates the exam date and weekly hours, with validation", async () => {
    const p = await updateSettings(t.db, ann, { examDate: "2027-05-19", weeklyTargetHours: 12.5 }, TODAY);
    expect(p).toMatchObject({ examDate: "2027-05-19", weeklyTargetMinutes: 750 });
    await expect(updateSettings(t.db, ann, { examDate: "2027-01-15" }, TODAY)).rejects.toBeInstanceOf(ValidationError);
    await expect(updateSettings(t.db, ann, { examDate: "2028-01-15" }, TODAY)).rejects.toBeInstanceOf(ValidationError);
    await expect(updateSettings(t.db, ann, { examDate: "2027-02-30" }, TODAY)).rejects.toBeInstanceOf(ValidationError);
    await expect(updateSettings(t.db, ann, { examDate: "2027-02-05" }, "2027-02-01")).rejects.toBeInstanceOf(ValidationError); // < 1 week away
    await expect(updateSettings(t.db, ann, { weeklyTargetHours: 0 }, TODAY)).rejects.toBeInstanceOf(ValidationError);
    await expect(updateSettings(t.db, ann, { weeklyTargetHours: 81 }, TODAY)).rejects.toBeInstanceOf(ValidationError);
    await updateSettings(t.db, ann, { examDate: "2027-02-18", weeklyTargetHours: 10 }, TODAY);
  });

  it("is for students only", async () => {
    await expect(updateSettings(t.db, teacher, { weeklyTargetHours: 5 }, TODAY)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("chapters", () => {
  it("records read with the date, and clears it when unticked", async () => {
    let s = await updateChapter(t.db, ann, qm4(), { read: true }, "2026-11-02");
    expect(s).toMatchObject({ read: true, readOn: "2026-11-02", practice: false, review: false });
    s = await updateChapter(t.db, ann, qm4(), { read: true }, "2026-11-05"); // already read: date is kept
    expect(s.readOn).toBe("2026-11-02");
    s = await updateChapter(t.db, ann, qm4(), { read: false }, "2026-11-06");
    expect(s).toMatchObject({ read: false, readOn: null });
    await updateChapter(t.db, ann, qm4(), { read: true }, "2026-11-02");
  });

  it("records questions, review (dated), score and confidence independently", async () => {
    let s = await updateChapter(t.db, ann, qm4(), { practice: true, accuracy: 64, confidence: 3 }, "2026-11-03");
    expect(s).toMatchObject({ practice: true, accuracy: 64, confidence: 3, read: true, review: false });
    s = await updateChapter(t.db, ann, qm4(), { review: true }, "2026-11-09");
    expect(s).toMatchObject({ review: true, reviewedOn: "2026-11-09" });
    s = await updateChapter(t.db, ann, qm4(), { reviewedToday: true }, "2026-12-01");
    expect(s.reviewedOn).toBe("2026-12-01");
    s = await updateChapter(t.db, ann, qm4(), { accuracy: null, confidence: null }, "2026-12-01");
    expect(s).toMatchObject({ accuracy: null, confidence: null });
  });

  it("rejects bad input and unknown chapters", async () => {
    await expect(updateChapter(t.db, ann, qm4(), { accuracy: 101 }, TODAY)).rejects.toBeInstanceOf(ValidationError);
    await expect(updateChapter(t.db, ann, qm4(), { accuracy: -1 }, TODAY)).rejects.toBeInstanceOf(ValidationError);
    await expect(updateChapter(t.db, ann, qm4(), { confidence: 4 as 3 }, TODAY)).rejects.toBeInstanceOf(ValidationError);
    await expect(updateChapter(t.db, ann, "00000000-0000-4000-8000-000000000000", { read: true }, TODAY)).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateChapter(t.db, teacher, qm4(), { read: true }, TODAY)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("keeps each student's progress separate and survives concurrent updates", async () => {
    const m = slugModule(cur, "economics-04").id;
    await Promise.all([
      updateChapter(t.db, ben, m, { read: true }, TODAY),
      updateChapter(t.db, ben, m, { practice: true }, TODAY),
      updateChapter(t.db, ben, m, { accuracy: 75 }, TODAY),
    ]);
    const [row] = await t.db.select().from(moduleProgress).where(eq(moduleProgress.studentId, ben.id));
    expect(row).toMatchObject({ read: true, practice: true, accuracy: 75 });
    expect(await t.db.select().from(moduleProgress).where(eq(moduleProgress.moduleId, m))).toHaveLength(1);
  });
});

describe("study sessions", () => {
  it("logs a session and lists it newest first", async () => {
    await logSession(t.db, ann, { date: "2026-11-01", minutes: 90, topic: "Quantitative Methods", note: "  TVM  " }, TODAY);
    await logSession(t.db, ann, { date: "2026-11-02", minutes: 45, topic: "Mixed review" }, TODAY);
    const snap = await getTrackerSnapshot(t.db, ann, ann.id, TODAY);
    expect(snap.sessions.recent.map((s) => [s.date, s.minutes, s.topic, s.note])).toEqual([
      ["2026-11-02", 45, "Mixed review", ""],
      ["2026-11-01", 90, "Quantitative Methods", "TVM"],
    ]);
    expect(snap.sessions.totalMinutes).toBe(135);
  });

  it("validates date, length and topic", async () => {
    const bad = (over: object) => logSession(t.db, ann, { date: TODAY, minutes: 60, topic: "Equities", ...over }, TODAY);
    await expect(bad({ date: "2026-11-03" })).rejects.toBeInstanceOf(ValidationError);
    await expect(bad({ date: "nope" })).rejects.toBeInstanceOf(ValidationError);
    await expect(bad({ date: "2020-01-01" })).rejects.toBeInstanceOf(ValidationError);
    await expect(bad({ minutes: 5 })).rejects.toBeInstanceOf(ValidationError);
    await expect(bad({ minutes: 1441 })).rejects.toBeInstanceOf(ValidationError);
    await expect(bad({ minutes: 60.5 })).rejects.toBeInstanceOf(ValidationError);
    await expect(bad({ topic: "Basket weaving" })).rejects.toBeInstanceOf(ValidationError);
    await expect(logSession(t.db, teacher, { date: TODAY, minutes: 60, topic: "Equities" }, TODAY)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("deletes only the student's own sessions", async () => {
    const id = await logSession(t.db, ann, { date: TODAY, minutes: 30, topic: "Equities" }, TODAY);
    await deleteSession(t.db, ben, id);
    expect(await t.db.select().from(studySessions).where(eq(studySessions.id, id))).toHaveLength(1);
    await deleteSession(t.db, ann, id);
    expect(await t.db.select().from(studySessions).where(eq(studySessions.id, id))).toHaveLength(0);
  });
});

describe("mock exams", () => {
  it("adds and deletes results, with validation", async () => {
    const a = await addMock(t.db, ann, { date: "2026-11-01", score: 61.46, note: "FSA hurt" }, TODAY);
    await addMock(t.db, ann, { date: "2026-11-02", score: 66 }, TODAY);
    const snap = await getTrackerSnapshot(t.db, ann, ann.id, TODAY);
    expect(snap.mocks.items.map((m) => [m.date, m.score])).toEqual([["2026-11-02", 66], ["2026-11-01", 61.5]]);
    expect(snap.mocks.stats).toMatchObject({ count: 2, best: 66, latest: 66, change: 4.5 });
    await expect(addMock(t.db, ann, { date: TODAY, score: 101 }, TODAY)).rejects.toBeInstanceOf(ValidationError);
    await expect(addMock(t.db, ann, { date: "2026-11-09", score: 50 }, TODAY)).rejects.toBeInstanceOf(ValidationError);
    await deleteMock(t.db, ben, a);
    expect(await t.db.select().from(mockResults).where(eq(mockResults.id, a))).toHaveLength(1);
    await deleteMock(t.db, ann, a);
    expect(await t.db.select().from(mockResults).where(eq(mockResults.id, a))).toHaveLength(0);
  });
});

describe("snapshot", () => {
  it("computes totals, roadmap, pace, review queue and views for a student", async () => {
    // Ann: QM-04 read and reviewed earlier; QM-05 read on 2 Nov and not reviewed; plan started 6 Oct.
    const qm5 = slugModule(cur, "quantitative-methods-05").id;
    await updateChapter(t.db, ann, qm5, { read: true }, "2026-11-02");
    const snap = await getTrackerSnapshot(t.db, ann, ann.id, "2026-11-10");
    expect(snap.examDate).toBe("2027-02-18");
    expect(snap.daysLeft).toBe(100);
    expect(snap.topics).toHaveLength(10);
    expect(snap.topics[0]).toMatchObject({ name: "Quantitative Methods", weightLabel: "11–14%", start: "2026-10-05", end: "2026-10-18", total: 11, read: 2 });
    expect(snap.chapters).toHaveLength(102);
    expect(snap.totals).toMatchObject({ total: 102, read: 2 });
    expect(snap.pace.expectedHours).toBeCloseTo((35 / 7) * 10, 5); // 6 Oct -> 10 Nov
    expect(snap.pace.totalHours).toBeCloseTo(2.25, 5);
    expect(snap.pace.status).toBe("behind");
    expect(snap.phase).toBe("first-pass");
    expect(snap.focus).toMatchObject({ kind: "topic" });
    expect(snap.actions.length).toBeGreaterThan(0);
    // QM-05 was read on 2 Nov and not reviewed: first review due from 5 Nov. QM-04 was reviewed on 1 Dec.
    expect(snap.reviewQueue.map((q) => q.moduleId)).toEqual([qm5]);
    expect(snap.chapters.find((c) => c.id === qm5)?.reviewDue).toMatchObject({ kind: "first-review", overdueDays: 5 });
    expect(snap.chapters.find((c) => c.id === qm4())?.reviewDue).toBeNull();
    // The snapshot is plain data: it must survive JSON (server -> client).
    expect(JSON.parse(JSON.stringify(snap)).chapters).toHaveLength(102);
  });

  it("counts platform practice per chapter without touching the recorded score", async () => {
    const snap = await getTrackerSnapshot(t.db, ben, ben.id, TODAY);
    expect(snap.chapters.find((c) => c.id === slugModule(cur, "economics-04").id)?.state.accuracy).toBe(75);
  });
});

describe("backup", () => {
  const sample = {
    version: 1,
    exportedAt: "2026-11-01T10:00:00.000Z",
    data: {
      settings: { examDate: "2027-03-10", weeklyTarget: 12 },
      modules: {
        "quantitative-methods-01": { read: true, practice: true, review: true, accuracy: 88 },
        "quantitative-methods-02": { read: true, practice: false, review: false, accuracy: "" },
        "economics-04": { read: true, practice: true, review: false, accuracy: 55 },
        "made-up-module": { read: true },
      },
      sessions: [
        { id: "a", date: "2026-10-07", hours: 1.5, topic: "Quantitative Methods", note: "TVM" },
        { id: "b", date: "2026-10-08", hours: 2, topic: "Something odd", note: "" },
        { id: "c", date: "bad", hours: 1, topic: "x", note: "" },
      ],
      mocks: [{ id: "m", date: "2026-10-30", score: 64.5, note: "weak on FSA" }],
    },
  };

  it("restores progress from the sample dashboard's export format", async () => {
    const r = await importBackup(t.db, ben, sample, TODAY);
    expect(r).toMatchObject({ chapters: 3, sessions: 2, mocks: 1, skipped: { modules: 1, sessions: 1, mocks: 0 } });
    const snap = await getTrackerSnapshot(t.db, ben, ben.id, TODAY);
    expect(snap.examDate).toBe("2027-03-10");
    expect(snap.weeklyTargetHours).toBe(12);
    expect(snap.totals.read).toBe(3);
    expect(snap.totals.complete).toBe(1);
    expect(snap.chapters.find((c) => c.id === slugModule(cur, "economics-04").id)?.state.accuracy).toBe(55);
    expect(snap.sessions.recent.map((s) => s.topic).sort()).toEqual(["Mixed review", "Quantitative Methods"]); // unknown topic folded in
    expect(snap.sessions.recent.find((s) => s.topic === "Quantitative Methods")?.minutes).toBe(90);
    expect(snap.mocks.items[0]).toMatchObject({ score: 64.5, note: "weak on FSA" });
  });

  it("doesn't queue restored chapters for review (their read dates are unknown)", async () => {
    const snap = await getTrackerSnapshot(t.db, ben, ben.id, "2027-01-01");
    expect(snap.reviewQueue).toEqual([]);
  });

  it("replaces what was there before, and rejects files that aren't backups", async () => {
    await importBackup(t.db, ben, { data: { settings: {}, modules: {}, sessions: [], mocks: [] } }, TODAY);
    const snap = await getTrackerSnapshot(t.db, ben, ben.id, TODAY);
    expect(snap.totals.read).toBe(0);
    expect(snap.sessions.count).toBe(0);
    for (const bad of [null, "text", { data: 5 }, { data: { modules: [], sessions: [] } }])
      await expect(importBackup(t.db, ben, bad, TODAY)).rejects.toBeInstanceOf(ValidationError);
    expect(snap.examDate).toBe("2027-03-10"); // a rejected or empty import leaves settings alone
  });

  it("ignores a backup exam date that has passed or is outside the curriculum year", async () => {
    await importBackup(t.db, ben, { data: { settings: { examDate: "2027-02-05" }, modules: {}, sessions: [] } }, "2027-02-01");
    expect((await getTrackerSnapshot(t.db, ben, ben.id, "2027-02-01")).examDate).toBe("2027-03-10");
  });

  it("exports in a shape the importer (and the sample dashboard) accepts", async () => {
    await importBackup(t.db, ben, sample, TODAY);
    const out = await exportBackup(t.db, ben, TODAY);
    expect(out.version).toBe(1);
    expect(Object.keys(out.data.modules).sort()).toEqual(["economics-04", "quantitative-methods-01", "quantitative-methods-02"]);
    expect((out.data.modules as Record<string, { accuracy: unknown }>)["quantitative-methods-02"].accuracy).toBe(""); // sample uses "" for no score
    const other = await makeActor(t.db, "carl@x.test", "student");
    const r = await importBackup(t.db, other, JSON.parse(JSON.stringify(out)), TODAY);
    expect(r).toMatchObject({ chapters: 3, sessions: 2, mocks: 1 });
  });
});

describe("who can see a student's tracker", () => {
  it("allows the student, their teacher and admins, and nobody else", async () => {
    await expect(getTrackerSnapshot(t.db, ann, ann.id, TODAY)).resolves.toBeTruthy();
    await expect(getTrackerSnapshot(t.db, teacher, ann.id, TODAY)).resolves.toBeTruthy();
    await expect(getTrackerSnapshot(t.db, admin, ann.id, TODAY)).resolves.toBeTruthy();
    await expect(getTrackerSnapshot(t.db, ben, ann.id, TODAY)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getTrackerSnapshot(t.db, otherTeacher, ann.id, TODAY)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("shows a teacher defaults for a student who hasn't opened the app, without creating a profile", async () => {
    const fresh = await makeActor(t.db, "fresh@x.test", "student");
    const [cls] = await t.db.select().from(classes).where(eq(classes.joinCode, "EVE123"));
    await t.db.insert(enrollments).values({ classId: cls.id, studentId: fresh.id });
    const snap = await getTrackerSnapshot(t.db, teacher, fresh.id, TODAY);
    expect(snap.totals.read).toBe(0);
    expect(await t.db.select().from(studentProfiles).where(eq(studentProfiles.studentId, fresh.id))).toHaveLength(0);
  });
});
