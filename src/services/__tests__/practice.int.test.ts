import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { attempts, losProgress, questionLos, questions } from "@/db/schema";
import { seedSampleCurriculum } from "@/db/seed/sample";
import { createTestDb, type TestDb } from "@/test/db";
import { getActiveCurriculum } from "../curriculum";
import { pickQuestions, recordAttempt, submitPracticeAnswer } from "../practice";
import { buildSnapshot, loadProgress } from "../progress";
import { ForbiddenError, NotFoundError, ValidationError, type Actor } from "../types";
import { createUser } from "../users";

let t: TestDb;
let stu: Actor;
let other: Actor;
let teacher: Actor;

beforeAll(async () => {
  t = await createTestDb();
  await seedSampleCurriculum(t.db);
  const s = await createUser(t.db, { email: "s@x.test", name: "S", role: "student", password: "a-long-password-1" });
  const o = await createUser(t.db, { email: "o@x.test", name: "O", role: "student", password: "a-long-password-1" });
  const th = await createUser(t.db, { email: "t@x.test", name: "T", role: "teacher", password: "a-long-password-1" });
  stu = { id: s.id, role: "student" };
  other = { id: o.id, role: "student" };
  teacher = { id: th.id, role: "teacher" };
});
afterAll(() => t.drop());

describe("pickQuestions", () => {
  it("never leaks the answer key or explanation", async () => {
    const qs = await pickQuestions(t.db, stu, { kind: "mixed" }, 8);
    expect(qs).toHaveLength(8);
    for (const q of qs) {
      expect(q).not.toHaveProperty("correctKey");
      expect(q).not.toHaveProperty("explanation");
      expect(q.options).toHaveLength(3);
    }
  });

  it("scopes to a topic, and avoids repeats within one pick", async () => {
    const c = await getActiveCurriculum(t.db);
    const qm = c.topics.find((x) => x.code === "QM")!;
    const qs = await pickQuestions(t.db, stu, { kind: "topic", id: qm.id }, 30);
    expect(new Set(qs.map((q) => q.id)).size).toBe(qs.length);
    for (const q of qs) expect(q.losCode.startsWith("QM.")).toBe(true);
  });

  it("explains when there is nothing to practise", async () => {
    const c = await getActiveCurriculum(t.db);
    const gap = c.los.find((l) => l.code === "EQ.1.c")!; // intentionally has no questions
    await expect(pickQuestions(t.db, stu, { kind: "los", id: gap.id }, 5)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("is for students only", async () => {
    await expect(pickQuestions(t.db, teacher, { kind: "mixed" }, 5)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("recordAttempt", () => {
  it("grades server-side, stores the attempt, and reveals the answer", async () => {
    const [q] = await t.db.select().from(questions).limit(1);
    const wrong = q.options.find((o) => o.key !== q.correctKey)!.key;
    const bad = await submitPracticeAnswer(t.db, stu, { questionId: q.id, chosenKey: wrong });
    expect(bad.correct).toBe(false);
    expect(bad.correctKey).toBe(q.correctKey);
    expect(bad.explanation).toBe(q.explanation);
    const good = await submitPracticeAnswer(t.db, stu, { questionId: q.id, chosenKey: q.correctKey, timeMs: 4200 });
    expect(good.correct).toBe(true);
    expect(good.mastery).toBeGreaterThan(bad.mastery);
    const rows = await t.db.select().from(attempts).where(and(eq(attempts.studentId, stu.id), eq(attempts.questionId, q.id)));
    expect(rows).toHaveLength(2);
  });

  it("rejects invalid options and unknown questions", async () => {
    const [q] = await t.db.select().from(questions).limit(1);
    await expect(submitPracticeAnswer(t.db, stu, { questionId: q.id, chosenKey: "Z" })).rejects.toBeInstanceOf(ValidationError);
    await expect(
      submitPracticeAnswer(t.db, stu, { questionId: "00000000-0000-4000-8000-000000000000", chosenKey: "A" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("won't accept an unpublished question", async () => {
    const [q] = await t.db.select().from(questions).limit(1);
    await t.db.update(questions).set({ status: "draft" }).where(eq(questions.id, q.id));
    await expect(submitPracticeAnswer(t.db, stu, { questionId: q.id, chosenKey: q.correctKey })).rejects.toBeInstanceOf(NotFoundError);
    await t.db.update(questions).set({ status: "published" }).where(eq(questions.id, q.id));
  });

  it("does not allow homework mode through the practice entry point", async () => {
    const [q] = await t.db.select().from(questions).limit(1);
    await expect(
      submitPracticeAnswer(t.db, stu, { questionId: q.id, chosenKey: q.correctKey, mode: "homework" as never }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("walks a LOS from studied to proficient across two days, and lowers it after mistakes", async () => {
    const c = await getActiveCurriculum(t.db);
    const los = c.los.find((l) => l.code === "QM.1.a")!;
    // Use the objective's easy question (weight 0.5) so the thresholds below are exact.
    const linked = await t.db
      .select({ id: questions.id, correct: questions.correctKey, difficulty: questions.difficulty })
      .from(questions)
      .innerJoin(questionLos, eq(questionLos.questionId, questions.id))
      .where(eq(questionLos.losId, los.id));
    const real = linked.find((x) => x.difficulty === 1)!;
    const q = { id: real.id };
    const day1 = Date.UTC(2026, 10, 2, 10);
    const day2 = Date.UTC(2026, 10, 3, 10);
    for (let i = 0; i < 3; i++) await recordAttempt(t.db, other, { questionId: q.id, chosenKey: real.correct, mode: "practice" }, day1 + i * 1000);
    let r = await recordAttempt(t.db, other, { questionId: q.id, chosenKey: real.correct, mode: "practice" }, day2);
    // 4 easy attempts over 2 days: enough attempts and days, mastery not yet >= 0.75
    expect(r.status).toBe("practiced");
    r = await recordAttempt(t.db, other, { questionId: q.id, chosenKey: real.correct, mode: "practice" }, day2 + 1000);
    expect(r.mastery).toBeGreaterThan(0.75);
    expect(r.status).toBe("proficient");

    const progress = (await loadProgress(t.db, [other.id])).get(other.id)!;
    const snap = buildSnapshot(c, progress, day2 + 2000);
    expect(snap.statusByLos.get(los.id)).toBe("proficient");
    expect(snap.coverage.proficient).toBe(1);

    const options = (await t.db.select().from(questions).where(eq(questions.id, q.id)))[0].options;
    const wrong = options.find((o) => o.key !== real.correct)!.key;
    let last = r;
    for (let i = 0; i < 6; i++) last = await recordAttempt(t.db, other, { questionId: q.id, chosenKey: wrong, mode: "practice" }, day2 + 5000 + i * 1000);
    expect(last.status).toBe("review_due");
  });

  it("serialises concurrent answers on the same objective without losing updates", async () => {
    const c = await getActiveCurriculum(t.db);
    const los = c.los.find((l) => l.code === "QM.1.b")!;
    const [q] = await pickQuestions(t.db, stu, { kind: "los", id: los.id }, 1);
    const [{ correctKey }] = await t.db.select({ correctKey: questions.correctKey }).from(questions).where(eq(questions.id, q.id));
    await Promise.all(Array.from({ length: 8 }, () => recordAttempt(t.db, stu, { questionId: q.id, chosenKey: correctKey, mode: "practice" })));
    const [row] = await t.db.select().from(losProgress).where(and(eq(losProgress.studentId, stu.id), eq(losProgress.losId, los.id)));
    expect(row.attempts).toBe(8);
  });
});
