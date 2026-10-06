import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { curriculumVersions, modules, questions, topics } from "@/db/schema";
import { writeCurriculum } from "@/db/curriculum-writer";
import { createTestDb, type TestDb } from "@/test/db";
import { getActiveCurriculum } from "@/services/curriculum";
import { OFFICIAL_VERSION_NAME, ensureOfficialCurriculum, seedSampleQuestions } from "../official";
import { SAMPLE_QUESTIONS } from "../sample-questions";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.drop());

describe("official curriculum seed", () => {
  it("loads 10 topics and 102 modules and activates them", async () => {
    const r = await ensureOfficialCurriculum(t.db);
    expect(r.action).toBe("created");
    const cur = await getActiveCurriculum(t.db);
    expect(cur.version).toMatchObject({ name: OFFICIAL_VERSION_NAME, year: 2027, isSample: false });
    expect(cur.topics).toHaveLength(10);
    expect(cur.modules).toHaveLength(102);
    expect(cur.topics.map((x) => x.name)[0]).toBe("Quantitative Methods");
    expect(cur.topics.reduce((s, x) => s + x.studyWeeks, 0)).toBe(14);
    expect(cur.modules.filter((m) => cur.topicById.get(m.topicId)!.name === "Fixed Income")).toHaveLength(19);
    expect(cur.moduleBySlug.get("quantitative-methods-04")?.title).toBe("The Time Value of Money in Finance");
  });

  it("orders modules by topic study order, then number", async () => {
    const cur = await getActiveCurriculum(t.db);
    const firstTopic = cur.modules.slice(0, 11);
    expect(firstTopic.every((m) => m.topicId === cur.topics[0].id)).toBe(true);
    expect(firstTopic.map((m) => m.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it("is idempotent", async () => {
    const before = await getActiveCurriculum(t.db);
    const r = await ensureOfficialCurriculum(t.db);
    expect(r.action).toBe("kept");
    expect((await t.db.select().from(curriculumVersions)).length).toBe(1);
    expect((await getActiveCurriculum(t.db)).version.id).toBe(before.version.id);
  });

  it("adds each sample question once, linked to a real module and marked as sample", async () => {
    const cur = await getActiveCurriculum(t.db);
    const added = await seedSampleQuestions(t.db, cur.version.id);
    expect(added).toBe(SAMPLE_QUESTIONS.length);
    expect(await seedSampleQuestions(t.db, cur.version.id)).toBe(0);
    const rows = await t.db.select().from(questions);
    expect(rows).toHaveLength(SAMPLE_QUESTIONS.length);
    for (const q of rows) {
      expect(q.source).toBe("sample");
      expect(q.status).toBe("published");
      expect(q.moduleId && cur.moduleById.has(q.moduleId)).toBe(true);
      expect(q.options.map((o) => o.key)).toEqual(["A", "B", "C"]);
      expect(q.options.some((o) => o.key === q.correctKey)).toBe(true);
    }
    const spread = ["A", "B", "C"].map((k) => rows.filter((q) => q.correctKey === k).length);
    expect(Math.max(...spread) - Math.min(...spread)).toBeLessThanOrEqual(2);
  });
});

describe("replacing the old sample curriculum, keeping imported ones", () => {
  it("replaces an active sample curriculum with the official one", async () => {
    const db = (await createTestDb());
    try {
      await writeCurriculum(
        db.db,
        {
          name: "Sample curriculum (demo) — replace with the official 2027 outline",
          level: "I",
          year: 2027,
          isSample: true,
          sourceNote: null,
          topics: [{ code: "X", name: "X", weightMin: 10, weightMax: 20, modules: [{ title: "Only module" }] }],
        },
        { activate: true },
      );
      const r = await ensureOfficialCurriculum(db.db);
      expect(r.action).toBe("replaced-sample");
      const cur = await getActiveCurriculum(db.db);
      expect(cur.modules).toHaveLength(102);
      const versions = await db.db.select().from(curriculumVersions);
      expect(versions.filter((v) => v.isActive)).toHaveLength(1);
      expect(await ensureOfficialCurriculum(db.db)).toMatchObject({ action: "kept" });
    } finally {
      await db.drop();
    }
  });

  it("leaves an admin-imported curriculum alone", async () => {
    const db = await createTestDb();
    try {
      const w = await writeCurriculum(
        db.db,
        {
          name: "2028 outline (imported)",
          level: "I",
          year: 2028,
          isSample: false,
          sourceNote: null,
          topics: [{ code: "Y", name: "Y", weightMin: 10, weightMax: 20, modules: [{ title: "M", slug: "y-01" }] }],
        },
        { activate: true },
      );
      expect(await ensureOfficialCurriculum(db.db)).toEqual({ action: "kept", versionId: w.versionId });
      const topicRows = await db.db.select().from(topics).where(eq(topics.versionId, w.versionId));
      expect(topicRows).toHaveLength(1);
      expect((await db.db.select().from(modules)).length).toBe(1);
    } finally {
      await db.drop();
    }
  });
});
