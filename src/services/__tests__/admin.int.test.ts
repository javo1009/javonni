import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { auditLog, questions, users } from "@/db/schema";
import { QUESTION_CSV, questionTemplateCsv, toCsv } from "@/domain/question-csv";
import { authenticate } from "../users";
import { createTestDb, type TestDb } from "@/test/db";
import { makeActor, seedBase, slugModule } from "@/test/seed";
import {
  MIN_PASSWORD_LENGTH,
  adminCoverage,
  adminCurriculum,
  adminOverview,
  createAccount,
  exportQuestionBank,
  importQuestions,
  listUsers,
  previewQuestionImport,
  resetUserPassword,
  setUserDisabled,
} from "../admin";
import type { getActiveCurriculum } from "../curriculum";
import { ForbiddenError, NotFoundError, ValidationError, type Actor } from "../types";

let t: TestDb;
let cur: Awaited<ReturnType<typeof getActiveCurriculum>>;
let admin: Actor;
let teacher: Actor;
let student: Actor;

const PW = "a-long-password-1";

beforeAll(async () => {
  t = await createTestDb();
  cur = await seedBase(t.db);
  admin = await makeActor(t.db, "admin@x.test", "admin");
  teacher = await makeActor(t.db, "teacher@x.test", "teacher");
  student = await makeActor(t.db, "student@x.test", "student");
});
afterAll(() => t.drop());

const HEADER = [...QUESTION_CSV.columns];
const qrow = (o: Partial<Record<(typeof HEADER)[number], string | number>> = {}) => {
  const v: Record<string, string | number> = {
    module: "economics-01",
    stem: "Under perfect competition, a firm facing a market price is best described as a:",
    a: "Price taker",
    b: "Price maker",
    c: "Price discriminator",
    d: "",
    correct: "A",
    explanation: "A perfectly competitive firm cannot influence the market price, so it takes it as given.",
    difficulty: 1,
    source: "Unit test",
    ...o,
  };
  return HEADER.map((c) => v[c]);
};
const csv = (...rows: (string | number)[][]) => toCsv([HEADER, ...rows]);
const bankCount = async (slug: string) => {
  const m = slugModule(cur, slug);
  return (await t.db.select({ id: questions.id }).from(questions).where(and(eq(questions.moduleId, m.id), eq(questions.status, "published")))).length;
};

describe("authorization", () => {
  it("refuses every function to non-admins", async () => {
    for (const who of [teacher, student]) {
      await expect(adminOverview(t.db, who)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(listUsers(t.db, who)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(createAccount(t.db, who, { name: "Eve", email: "eve@x.test", role: "admin", password: PW })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(setUserDisabled(t.db, who, admin.id, true)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(resetUserPassword(t.db, who, admin.id, PW)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(adminCurriculum(t.db, who)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(adminCoverage(t.db, who)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(previewQuestionImport(t.db, who, csv(qrow()))).rejects.toBeInstanceOf(ForbiddenError);
      await expect(importQuestions(t.db, who, csv(qrow()), { skipInvalid: false })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(exportQuestionBank(t.db, who)).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect(await bankCount("economics-01")).toBe(0);
  });
});

describe("accounts", () => {
  it("creates accounts that can sign in, normalising the email, and writes an audit entry", async () => {
    const u = await createAccount(t.db, admin, { name: "  New Teacher ", email: " New.Teacher@X.test ", role: "teacher", password: "temporary-pass-12" });
    expect(u).toMatchObject({ name: "New Teacher", email: "new.teacher@x.test", role: "teacher" });
    expect(await authenticate(t.db, "new.teacher@x.test", "temporary-pass-12")).not.toBeNull();
    const log = await t.db.select().from(auditLog).where(eq(auditLog.action, "user.create"));
    expect(log.some((l) => l.entityId === u.id && l.actorId === admin.id)).toBe(true);
    expect(JSON.stringify(log)).not.toContain("temporary-pass-12");
  });

  it("validates name, email, role and password length", async () => {
    const ok = { name: "Valid Name", email: "valid@x.test", role: "student" as const, password: "x".repeat(MIN_PASSWORD_LENGTH) };
    await expect(createAccount(t.db, admin, { ...ok, name: "A" })).rejects.toBeInstanceOf(ValidationError);
    await expect(createAccount(t.db, admin, { ...ok, email: "nope" })).rejects.toBeInstanceOf(ValidationError);
    await expect(createAccount(t.db, admin, { ...ok, role: "owner" as never })).rejects.toBeInstanceOf(ValidationError);
    await expect(createAccount(t.db, admin, { ...ok, password: "x".repeat(MIN_PASSWORD_LENGTH - 1) })).rejects.toThrow(/at least 12/);
    await expect(createAccount(t.db, admin, { ...ok, password: "x".repeat(200) })).rejects.toBeInstanceOf(ValidationError);
    await createAccount(t.db, admin, ok);
    await expect(createAccount(t.db, admin, { ...ok, email: "VALID@x.test" })).rejects.toThrow(/already exists/);
  });

  it("lists with search, role and status filters, and paginates", async () => {
    for (let i = 0; i < 22; i++) await createAccount(t.db, admin, { name: `Bulk Student ${String(i).padStart(2, "0")}`, email: `bulk${i}@bulk.test`, role: "student", password: PW + i });
    const all = await listUsers(t.db, admin);
    expect(all.total).toBeGreaterThanOrEqual(26);
    expect(all.rows).toHaveLength(all.pageSize);
    const p2 = await listUsers(t.db, admin, { page: 2 });
    expect(p2.page).toBe(2);
    expect(p2.rows.length).toBeGreaterThan(0);
    expect(p2.rows.some((r) => all.rows.some((a) => a.id === r.id))).toBe(false);
    expect((await listUsers(t.db, admin, { page: 999 })).page).toBe(all.pageCount);
    expect((await listUsers(t.db, admin, { page: -3 })).page).toBe(1);

    expect((await listUsers(t.db, admin, { q: "bulk.test" })).total).toBe(22);
    expect((await listUsers(t.db, admin, { q: "BULK STUDENT 07" })).rows.map((r) => r.email)).toEqual(["bulk7@bulk.test"]);
    expect((await listUsers(t.db, admin, { q: "%" })).total).toBe(0); // wildcards are literal
    expect((await listUsers(t.db, admin, { role: "teacher" })).rows.every((r) => r.role === "teacher")).toBe(true);
    expect((await listUsers(t.db, admin, { role: "admin" })).total).toBe(1);
    expect((await listUsers(t.db, admin, { status: "disabled" })).total).toBe(0);
  });

  it("disables and re-enables accounts, blocking sign-in while disabled", async () => {
    const r = await setUserDisabled(t.db, admin, student.id, true);
    expect(r).toMatchObject({ disabled: true });
    expect(await authenticate(t.db, "student@x.test", PW)).toBeNull();
    expect((await listUsers(t.db, admin, { status: "disabled" })).rows.map((x) => x.id)).toEqual([student.id]);
    expect((await listUsers(t.db, admin, { status: "active" })).rows.some((x) => x.id === student.id)).toBe(false);
    await setUserDisabled(t.db, admin, student.id, false);
    expect(await authenticate(t.db, "student@x.test", PW)).not.toBeNull();
    const actions = (await t.db.select().from(auditLog)).map((l) => l.action);
    expect(actions).toContain("user.disable");
    expect(actions).toContain("user.enable");
    await expect(setUserDisabled(t.db, admin, "00000000-0000-4000-8000-000000000000", true)).rejects.toBeInstanceOf(NotFoundError);
    await expect(setUserDisabled(t.db, admin, "not-a-uuid", true)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("never lets an admin disable themselves or the last active admin", async () => {
    await expect(setUserDisabled(t.db, admin, admin.id, true)).rejects.toThrow(/own account/);
    const second = await makeActor(t.db, "admin2@x.test", "admin");
    // Another admin can disable the first (one still active afterwards)...
    await setUserDisabled(t.db, second, admin.id, true);
    // ...but then cannot disable the last one remaining (themselves) and nobody else can be disabled to zero.
    await expect(setUserDisabled(t.db, second, second.id, true)).rejects.toThrow();
    // A disabled admin cannot be the "other" one: re-enable, then disable second via the first.
    await setUserDisabled(t.db, second, admin.id, false);
    await setUserDisabled(t.db, admin, second.id, true);
    await expect(setUserDisabled(t.db, admin, admin.id, true)).rejects.toThrow(/own account/);
    const [row] = await t.db.select({ d: users.disabledAt }).from(users).where(eq(users.id, admin.id));
    expect(row.d).toBeNull();
    // Re-enable so later tests have two admins; disabling the last one by a third party is refused.
    await setUserDisabled(t.db, admin, second.id, false);
  });

  it("refuses to disable the last active admin even when another admin does it", async () => {
    const third = await makeActor(t.db, "admin3@x.test", "admin");
    await setUserDisabled(t.db, admin, third.id, true); // 2 active admins remain: fine
    await setUserDisabled(t.db, admin, (await t.db.select({ id: users.id }).from(users).where(eq(users.email, "admin2@x.test")))[0].id, true);
    // Only `admin` is active now. A disabled admin can't act through the app, but the service rule must still hold:
    await expect(setUserDisabled(t.db, third, admin.id, true)).rejects.toThrow(/last active admin/);
    await setUserDisabled(t.db, admin, third.id, false);
  });

  it("resets a password: old one stops working, new one works, nothing secret is logged", async () => {
    const u = await createAccount(t.db, admin, { name: "Reset Me", email: "reset@x.test", role: "student", password: "original-pass-12" });
    await resetUserPassword(t.db, admin, u.id, "brand-new-pass-34");
    expect(await authenticate(t.db, "reset@x.test", "original-pass-12")).toBeNull();
    expect(await authenticate(t.db, "reset@x.test", "brand-new-pass-34")).not.toBeNull();
    await expect(resetUserPassword(t.db, admin, u.id, "short")).rejects.toBeInstanceOf(ValidationError);
    await expect(resetUserPassword(t.db, admin, "00000000-0000-4000-8000-000000000000", "brand-new-pass-34")).rejects.toBeInstanceOf(NotFoundError);
    expect(JSON.stringify(await t.db.select().from(auditLog))).not.toContain("brand-new-pass-34");
  });
});

describe("overview, curriculum and coverage", () => {
  it("summarises the platform", async () => {
    const o = await adminOverview(t.db, admin);
    expect(o.users.admin.active).toBeGreaterThanOrEqual(1);
    expect(o.users.student.active).toBeGreaterThan(20);
    expect(o.demoAccounts).toBe(0);
    expect(o.curriculum).toMatchObject({ topics: 10, modules: 102, isSample: false });
    expect(o.questions.published).toBe(47);
    expect(o.questions.bySource).toEqual([{ source: "sample", n: 47 }]);
    expect(o.modulesWithoutQuestions.count).toBeGreaterThan(0);
    expect(o.modulesWithoutQuestions.count).toBeLessThan(102);
    expect(o.files).toMatchObject({ count: 0, bytes: 0, heaviest: null });
    expect(o.files.quotaPerUser).toBeGreaterThan(0);
    expect(o.recentActivity.length).toBeGreaterThan(0);
  });

  it("counts demo accounts by their email domain", async () => {
    await createAccount(t.db, admin, { name: "Dana Demo", email: "dana@ascent.demo", role: "student", password: PW });
    expect((await adminOverview(t.db, admin)).demoAccounts).toBe(1);
  });

  it("lists the 10 topics and 102 modules in study order with question counts", async () => {
    const c = (await adminCurriculum(t.db, admin))!;
    expect(c.version.name).toBe("2027 Level I curriculum");
    expect(c.topics.map((x) => x.code)).toEqual(["QM", "FSA", "ECO", "CF", "EQ", "FI", "DER", "ALT", "PC", "ETH"]);
    expect(c.totals).toMatchObject({ topics: 10, modules: 102 });
    expect(c.topics.reduce((s, x) => s + x.modules.length, 0)).toBe(102);
    expect(c.topics[0].modules[3]).toMatchObject({ number: 4, slug: "quantitative-methods-04" });
    expect(c.totals.questions).toBe(47);
  });

  it("flags modules by published question count and difficulty", async () => {
    const cov = (await adminCoverage(t.db, admin))!;
    expect(cov.totals).toMatchObject({ published: 47, modules: 102 });
    expect(cov.totals.covered + cov.totals.low + cov.totals.none).toBe(102);
    expect(cov.totals.byDifficulty.reduce((a, b) => a + b, 0)).toBe(47);
    const eco = cov.topics.find((x) => x.code === "ECO")!.modules[0];
    expect(eco).toMatchObject({ total: 0, status: "none" });
    expect(cov.unmapped).toBe(0);
  });
});

describe("question CSV import", () => {
  it("previews without writing: counts, per-row errors with row numbers, duplicates", async () => {
    const before = await bankCount("economics-01");
    const text = csv(
      qrow(), // 2 ok
      qrow({ module: "nowhere-99" }), // 3 error
      qrow({ stem: "A second valid stem about monopolies and prices here?", module: "ECO 1" }), // 4 ok
      qrow(), // 5 duplicate of row 2
      qrow({ correct: "Q" }), // 6 error
    );
    const p = await previewQuestionImport(t.db, admin, text);
    expect(p.fileErrors).toEqual([]);
    expect(p.counts).toEqual({ total: 5, ok: 2, duplicates: 1, errors: 2 });
    expect(p.rows.map((r) => [r.row, r.status])).toEqual([[2, "ok"], [3, "error"], [4, "ok"], [5, "duplicate"], [6, "error"]]);
    expect(p.rows[1].errors[0]).toMatch(/not found/);
    expect(p.rows[3].note).toMatch(/row 2/);
    expect(p.perModule).toEqual([{ slug: "economics-01", title: expect.any(String), n: 2 }]);
    expect(await bankCount("economics-01")).toBe(before);
  });

  it("reports file-level errors in the preview and refuses to import them", async () => {
    const p = await previewQuestionImport(t.db, admin, "module,stem\nECO 1,hi");
    expect(p.fileErrors[0]).toMatch(/missing/);
    expect(p.rows).toEqual([]);
    await expect(importQuestions(t.db, admin, "module,stem\nECO 1,hi", { skipInvalid: true })).rejects.toThrow(/missing/);
  });

  it("is all-or-nothing when any row is invalid and skipInvalid is off", async () => {
    const before = await bankCount("economics-01");
    const text = csv(qrow(), qrow({ module: "nowhere-99" }));
    await expect(importQuestions(t.db, admin, text, { skipInvalid: false })).rejects.toThrow(/1 row has errors/);
    expect(await bankCount("economics-01")).toBe(before);
  });

  it("imports valid rows as published, source 'imported', skipping invalid rows and duplicates", async () => {
    const text = csv(
      qrow(), // ok
      qrow({ module: "nowhere-99" }), // invalid
      qrow({ stem: "A monopolist that faces a downward-sloping demand curve maximises profit where:", module: "ECO 1", a: "-2%", b: "+3%", c: "=1+1", d: "Marginal revenue equals marginal cost", correct: "D", difficulty: 3 }),
      qrow(), // duplicate within the file
    );
    const r = await importQuestions(t.db, admin, text, { skipInvalid: true });
    expect(r).toEqual({ imported: 2, skippedInvalid: 1, skippedDuplicates: 1 });
    const m = slugModule(cur, "economics-01");
    const rows = await t.db.select().from(questions).where(eq(questions.moduleId, m.id));
    expect(rows).toHaveLength(2);
    for (const q of rows) expect(q).toMatchObject({ status: "published", source: "imported", authorId: admin.id });
    const mono = rows.find((q) => q.difficulty === 3)!;
    expect(mono.options).toEqual([
      { key: "A", text: "-2%" },
      { key: "B", text: "+3%" },
      { key: "C", text: "=1+1" },
      { key: "D", text: "Marginal revenue equals marginal cost" },
    ]);
    expect(mono.correctKey).toBe("D");
    const log = (await t.db.select().from(auditLog).where(eq(auditLog.action, "questions.import")))[0];
    expect(log.meta).toMatchObject({ imported: 2, skippedInvalid: 1, skippedDuplicates: 1, sourceLabels: ["Unit test"] });
  });

  it("makes imported questions visible in coverage and re-importing is idempotent", async () => {
    const cov = (await adminCoverage(t.db, admin))!;
    expect(cov.totals.published).toBe(49);
    expect(cov.totals.bySource).toEqual([{ source: "sample", n: 47 }, { source: "imported", n: 2 }]);
    const eco = cov.topics.find((x) => x.code === "ECO")!.modules[0];
    expect(eco).toMatchObject({ total: 2, status: "low", byDifficulty: [1, 0, 1] });
    await expect(importQuestions(t.db, admin, csv(qrow()), { skipInvalid: true })).rejects.toThrow(/already in the question bank/);
  });

  it("imports a clean file in one go, three options or four, and trims to the limits", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => qrow({ module: `economics-0${i + 2}`, stem: `A clean question number ${i} about this module?` }));
    expect(await importQuestions(t.db, admin, csv(...rows), { skipInvalid: false })).toEqual({ imported: 5, skippedInvalid: 0, skippedDuplicates: 0 });
    await expect(importQuestions(t.db, admin, "", { skipInvalid: false })).rejects.toBeInstanceOf(ValidationError);
    const tooMany = csv(...Array.from({ length: QUESTION_CSV.maxRows + 1 }, (_, i) => qrow({ stem: `Overflow question number ${i} for the cap` })));
    await expect(importQuestions(t.db, admin, tooMany, { skipInvalid: true })).rejects.toThrow(/At most 500/);
  });

  it("accepts the downloadable template, guards formulas on export, and round-trips", async () => {
    const tpl = await previewQuestionImport(t.db, admin, questionTemplateCsv());
    expect(tpl.fileErrors).toEqual([]);
    expect(tpl.counts.errors).toBe(0);
    await importQuestions(t.db, admin, csv(qrow({ stem: "Which of these starts with a dash? Pick the formula-looking option.", a: "-1.2%", b: "=SUM(A1)", c: "@cmd", correct: "A", module: "ECO 8" })), { skipInvalid: false });
    const out = await exportQuestionBank(t.db, admin);
    expect(out.startsWith("﻿module,stem,a,b,c,d,correct,explanation,difficulty,source")).toBe(true);
    expect(out).toContain("'-1.2%");
    expect(out).toContain("'=SUM(A1)");
    expect(out).toContain("'@cmd");
    // Re-importing the export finds only duplicates.
    const again = await previewQuestionImport(t.db, admin, out);
    expect(again.fileErrors).toEqual([]);
    expect(again.counts.errors).toBe(0);
    expect(again.counts.ok).toBe(0);
    expect(again.counts.duplicates).toBe(again.counts.total);
    expect(again.counts.total).toBe((await adminCoverage(t.db, admin))!.totals.published);
  });
});
