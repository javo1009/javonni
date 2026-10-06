import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { attempts, questions } from "@/db/schema";
import { createTestDb, type TestDb } from "@/test/db";
import { makeActor, seedBase, slugModule } from "@/test/seed";
import type { getActiveCurriculum } from "../curriculum";
import { pickQuestions, submitPracticeAnswer } from "../practice";
import { updateChapter } from "../tracker";
import { ForbiddenError, NotFoundError, ValidationError, type Actor } from "../types";

let t: TestDb;
let cur: Awaited<ReturnType<typeof getActiveCurriculum>>;
let stu: Actor;
let teacher: Actor;

beforeAll(async () => {
  t = await createTestDb();
  cur = await seedBase(t.db);
  stu = await makeActor(t.db, "s@x.test", "student");
  teacher = await makeActor(t.db, "t@x.test", "teacher");
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
      expect(q.moduleTitle.length).toBeGreaterThan(3);
    }
  });

  it("scopes to a chapter or a topic, without repeats", async () => {
    const qm4 = slugModule(cur, "quantitative-methods-04");
    const one = await pickQuestions(t.db, stu, { kind: "module", id: qm4.id }, 30);
    expect(one.length).toBeGreaterThan(2);
    expect(one.every((q) => q.moduleId === qm4.id)).toBe(true);
    const qm = cur.topics.find((x) => x.name === "Quantitative Methods")!;
    const topic = await pickQuestions(t.db, stu, { kind: "topic", id: qm.id }, 30);
    expect(new Set(topic.map((q) => q.id)).size).toBe(topic.length);
    expect(topic.every((q) => q.topicName === "Quantitative Methods")).toBe(true);
    expect(new Set(topic.map((q) => q.moduleId)).size).toBeGreaterThan(1);
  });

  it("spreads a set across chapters before repeating one", async () => {
    const qs = await pickQuestions(t.db, stu, { kind: "mixed" }, 10);
    const counts = new Map<string, number>();
    for (const q of qs) counts.set(q.moduleId, (counts.get(q.moduleId) ?? 0) + 1);
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(2);
  });

  it("explains when a chapter has no questions, and for unknown scopes", async () => {
    const none = slugModule(cur, "economics-01"); // no sample questions
    await expect(pickQuestions(t.db, stu, { kind: "module", id: none.id }, 5)).rejects.toBeInstanceOf(NotFoundError);
    await expect(pickQuestions(t.db, stu, { kind: "module", id: "00000000-0000-4000-8000-000000000000" }, 5)).rejects.toBeInstanceOf(NotFoundError);
    await expect(pickQuestions(t.db, stu, { kind: "topic", id: "00000000-0000-4000-8000-000000000000" }, 5)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("'weak' draws only from chapters with a low recorded score", async () => {
    await expect(pickQuestions(t.db, stu, { kind: "weak" }, 5)).rejects.toThrow(/weak chapters/i);
    const qm4 = slugModule(cur, "quantitative-methods-04");
    const fi6 = slugModule(cur, "fixed-income-06");
    await updateChapter(t.db, stu, qm4.id, { accuracy: 45 }, "2026-11-02");
    await updateChapter(t.db, stu, fi6.id, { accuracy: 90 }, "2026-11-02");
    const qs = await pickQuestions(t.db, stu, { kind: "weak" }, 10);
    expect(qs.length).toBeGreaterThan(0);
    expect(qs.every((q) => q.moduleId === qm4.id)).toBe(true);
  });

  it("is for students only", async () => {
    await expect(pickQuestions(t.db, teacher, { kind: "mixed" }, 5)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("submitPracticeAnswer", () => {
  it("grades on the server, reveals the answer and keeps a running tally for the chapter", async () => {
    const [q] = await t.db.select().from(questions).limit(1);
    const wrong = q.options.find((o) => o.key !== q.correctKey)!.key;
    const bad = await submitPracticeAnswer(t.db, stu, { questionId: q.id, chosenKey: wrong });
    expect(bad).toMatchObject({ correct: false, correctKey: q.correctKey, explanation: q.explanation, moduleId: q.moduleId });
    const good = await submitPracticeAnswer(t.db, stu, { questionId: q.id, chosenKey: q.correctKey, timeMs: 4200 });
    expect(good.correct).toBe(true);
    expect(good.tally).toEqual({ attempts: (bad.tally?.attempts ?? 0) + 1, correct: (bad.tally?.correct ?? 0) + 1 });
    const rows = await t.db.select().from(attempts).where(and(eq(attempts.studentId, stu.id), eq(attempts.questionId, q.id)));
    expect(rows).toHaveLength(2);
    expect(rows[0].moduleId).toBe(q.moduleId);
  });

  it("de-prioritises questions answered in the last two days", async () => {
    const qm5 = slugModule(cur, "quantitative-methods-05");
    const first = await pickQuestions(t.db, stu, { kind: "module", id: qm5.id }, 1);
    const [full] = await t.db.select().from(questions).where(eq(questions.id, first[0].id));
    await submitPracticeAnswer(t.db, stu, { questionId: full.id, chosenKey: full.correctKey });
    const next = await pickQuestions(t.db, stu, { kind: "module", id: qm5.id }, 1);
    expect(next[0].id).not.toBe(full.id);
  });

  it("rejects invalid options, unknown or unpublished questions, and homework mode", async () => {
    const [q] = await t.db.select().from(questions).limit(1);
    await expect(submitPracticeAnswer(t.db, stu, { questionId: q.id, chosenKey: "Z" })).rejects.toBeInstanceOf(ValidationError);
    await expect(submitPracticeAnswer(t.db, stu, { questionId: "00000000-0000-4000-8000-000000000000", chosenKey: "A" })).rejects.toBeInstanceOf(NotFoundError);
    await t.db.update(questions).set({ status: "draft" }).where(eq(questions.id, q.id));
    await expect(submitPracticeAnswer(t.db, stu, { questionId: q.id, chosenKey: q.correctKey })).rejects.toBeInstanceOf(NotFoundError);
    await t.db.update(questions).set({ status: "published" }).where(eq(questions.id, q.id));
    await expect(submitPracticeAnswer(t.db, stu, { questionId: q.id, chosenKey: q.correctKey, mode: "homework" as never })).rejects.toBeInstanceOf(ValidationError);
    await expect(submitPracticeAnswer(t.db, teacher, { questionId: q.id, chosenKey: q.correctKey })).rejects.toBeInstanceOf(ForbiddenError);
  });
});
