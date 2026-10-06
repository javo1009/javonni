import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { classes } from "@/db/schema";
import { createTestDb, type TestDb } from "@/test/db";
import { authenticate, createUser, registerStudent } from "../users";
import { ValidationError } from "../types";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

let t: TestDb;
let teacherId: string;

beforeAll(async () => {
  t = await createTestDb();
  const teacher = await createUser(t.db, { email: "Teach@Example.com", name: "T", role: "teacher", password: "correct horse battery" });
  teacherId = teacher.id;
  await t.db.insert(classes).values({ name: "Evening A", teacherId, joinCode: "EVE123" });
});
afterAll(() => t.drop());

describe("users service", () => {
  it("authenticates with a correct password, case-insensitively on email", async () => {
    const u = await authenticate(t.db, "teach@example.com", "correct horse battery");
    expect(u).toMatchObject({ role: "teacher", email: "teach@example.com" });
    expect(u).not.toHaveProperty("passwordHash");
  });

  it("rejects a wrong password and an unknown email the same way", async () => {
    expect(await authenticate(t.db, "teach@example.com", "wrong")).toBeNull();
    expect(await authenticate(t.db, "nobody@example.com", "whatever-password")).toBeNull();
  });

  it("never stores the plain password", async () => {
    const [row] = await t.db.select().from(users).where(eq(users.email, "teach@example.com"));
    expect(row.passwordHash.startsWith("scrypt$")).toBe(true);
    expect(row.passwordHash).not.toContain("correct horse battery");
  });

  it("blocks disabled accounts", async () => {
    await createUser(t.db, { email: "gone@example.com", name: "G", role: "student", password: "a-long-password-1" });
    await t.db.update(users).set({ disabledAt: new Date() }).where(eq(users.email, "gone@example.com"));
    expect(await authenticate(t.db, "gone@example.com", "a-long-password-1")).toBeNull();
  });

  it("registers a student into the class with a valid join code (case/space-insensitive)", async () => {
    const s = await registerStudent(t.db, { name: "Sam", email: "sam@example.com", password: "a-long-password-1", joinCode: "  eve123 " });
    expect(s.role).toBe("student");
  });

  it("refuses registration with an unknown join code, and does not create the user", async () => {
    await expect(
      registerStudent(t.db, { name: "X", email: "x@example.com", password: "a-long-password-1", joinCode: "NOPE00" }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await authenticate(t.db, "x@example.com", "a-long-password-1")).toBeNull();
  });

  it("refuses a duplicate email", async () => {
    await expect(
      registerStudent(t.db, { name: "Sam2", email: "SAM@example.com", password: "a-long-password-1", joinCode: "EVE123" }),
    ).rejects.toThrow(/already exists/);
  });

  it("refuses registration into an archived class", async () => {
    await t.db.update(classes).set({ archived: true }).where(eq(classes.joinCode, "EVE123"));
    await expect(
      registerStudent(t.db, { name: "Late", email: "late@example.com", password: "a-long-password-1", joinCode: "EVE123" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
