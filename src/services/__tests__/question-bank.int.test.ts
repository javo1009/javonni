import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { questions } from "@/db/schema";
import { createTestDb, type TestDb } from "@/test/db";
import { makeActor, seedBase } from "@/test/seed";
import { getActiveCurriculum } from "../curriculum";
import {
  listQuestions,
  questionCoverage,
  questionPreviews,
} from "../question-bank";
import { ForbiddenError, ValidationError, type Actor } from "../types";

let t: TestDb;
let teacher: Actor;
let admin: Actor;
let student: Actor;
let cur: Awaited<ReturnType<typeof getActiveCurriculum>>;
let draftId: string;
let draftModuleId: string;

beforeAll(async () => {
  t = await createTestDb();
  cur = await seedBase(t.db);
  teacher = await makeActor(t.db, "qb-teacher@x.test", "teacher");
  admin = await makeActor(t.db, "qb-admin@x.test", "admin");
  student = await makeActor(t.db, "qb-student@x.test", "student");
  // An unpublished question that must never show up for teachers.
  const [any] = await t.db
    .select()
    .from(questions)
    .where(eq(questions.status, "published"))
    .limit(1);
  draftModuleId = any.moduleId!;
  const [d] = await t.db
    .insert(questions)
    .values({
      stem: "SECRET draft stem about zebras",
      options: [
        { key: "A", text: "x" },
        { key: "B", text: "y" },
      ],
      correctKey: "A",
      explanation: "because",
      status: "draft",
      moduleId: draftModuleId,
    })
    .returning();
  draftId = d.id;
});
afterAll(() => t.drop());

describe("question bank access", () => {
  it("is teacher/admin only", async () => {
    await expect(listQuestions(t.db, student)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(questionPreviews(t.db, student, [])).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(questionCoverage(t.db, student)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(listQuestions(t.db, teacher)).resolves.toBeTruthy();
    await expect(listQuestions(t.db, admin)).resolves.toBeTruthy();
  });
});

describe("listQuestions", () => {
  it("returns published questions with the answer key, in curriculum order, and never drafts", async () => {
    const r = await listQuestions(t.db, teacher, { pageSize: 50 });
    expect(r.total).toBeGreaterThan(0);
    expect(
      r.items.every(
        (q) => q.correctKey && q.explanation && q.moduleTitle && q.topicName,
      ),
    ).toBe(true);
    expect(r.items.find((q) => q.id === draftId)).toBeUndefined();
    const order = r.items.map((q) => [
      cur.topicOrder.get(q.topicId!)!,
      q.moduleNumber!,
    ]);
    const sorted = [...order].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    expect(order).toEqual(sorted);
  });

  it("filters by chapter, topic, difficulty and search; paginates", async () => {
    const all = await listQuestions(t.db, teacher, { pageSize: 50 });
    const first = all.items[0];
    const byModule = await listQuestions(t.db, teacher, {
      moduleId: first.moduleId!,
    });
    expect(byModule.items.length).toBeGreaterThan(0);
    expect(byModule.items.every((q) => q.moduleId === first.moduleId)).toBe(
      true,
    );

    const byTopic = await listQuestions(t.db, teacher, {
      topicId: first.topicId!,
      pageSize: 50,
    });
    expect(byTopic.items.every((q) => q.topicId === first.topicId)).toBe(true);
    expect(byTopic.total).toBeGreaterThanOrEqual(byModule.total);

    const hard = await listQuestions(t.db, teacher, {
      difficulty: 3,
      pageSize: 50,
    });
    expect(hard.items.every((q) => q.difficulty === 3)).toBe(true);

    const word = first.stem
      .split(/\s+/)
      .find((w) => w.length > 5)!
      .replace(/[^a-z0-9]/gi, "");
    const found = await listQuestions(t.db, teacher, {
      search: word.toUpperCase(),
      pageSize: 50,
    });
    expect(found.items.some((q) => q.id === first.id)).toBe(true);

    const none = await listQuestions(t.db, teacher, { search: "zebras" });
    expect(none.total).toBe(0);
    // LIKE wildcards in the search box are literal.
    expect(
      (await listQuestions(t.db, teacher, { search: "%" })).items.every((q) =>
        q.stem.includes("%"),
      ),
    ).toBe(true);

    const p1 = await listQuestions(t.db, teacher, { pageSize: 5, page: 1 });
    const p2 = await listQuestions(t.db, teacher, { pageSize: 5, page: 2 });
    expect(p1.items).toHaveLength(5);
    expect(p1.pageCount).toBe(Math.ceil(p1.total / 5));
    expect(
      p2.items.map((q) => q.id).some((id) => p1.items.some((q) => q.id === id)),
    ).toBe(false);
    // Out-of-range pages clamp.
    expect(
      (await listQuestions(t.db, teacher, { pageSize: 5, page: 999 })).page,
    ).toBe(p1.pageCount);
  });
});

describe("questionPreviews", () => {
  it("keeps the order asked, drops unpublished and unknown ids, de-duplicates", async () => {
    const all = await listQuestions(t.db, teacher, { pageSize: 10 });
    const [a, b, c] = all.items;
    const out = await questionPreviews(t.db, teacher, [
      c.id,
      a.id,
      draftId,
      "00000000-0000-4000-8000-000000000000",
      c.id,
      b.id,
    ]);
    expect(out.map((q) => q.id)).toEqual([c.id, a.id, b.id]);
    expect(out[0].correctKey).toBeTruthy();
    expect(await questionPreviews(t.db, teacher, [])).toEqual([]);
  });

  it("refuses absurd batches", async () => {
    const ids = Array.from(
      { length: 61 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    );
    await expect(questionPreviews(t.db, teacher, ids)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});

describe("questionCoverage", () => {
  it("counts published questions per chapter by difficulty, ignoring drafts", async () => {
    const cov = await questionCoverage(t.db, teacher);
    const all = await listQuestions(t.db, teacher, {
      pageSize: 50,
      moduleId: draftModuleId,
    });
    const c = cov.get(draftModuleId)!;
    expect(c.total).toBe(all.total);
    expect(c.easy + c.medium + c.hard).toBe(c.total);
  });
});
