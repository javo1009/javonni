import { and, eq, sql } from "drizzle-orm";
import { burnPasswordCheck, hashPassword, verifyPassword } from "@/lib/password";
import { classes, enrollments, users } from "@/db/schema";
import { isValidTimezone } from "@/lib/today";
import { ValidationError, type Db, type Role } from "./types";

export type PublicUser = { id: string; email: string; name: string; role: Role; timezone: string };

const normEmail = (e: string) => e.trim().toLowerCase();

export async function authenticate(db: Db, email: string, password: string): Promise<PublicUser | null> {
  const [row] = await db.select().from(users).where(eq(users.email, normEmail(email))).limit(1);
  if (!row || row.disabledAt) {
    await burnPasswordCheck(password); // keep timing similar for unknown emails
    return null;
  }
  if (!(await verifyPassword(password, row.passwordHash))) return null;
  return { id: row.id, email: row.email, name: row.name, role: row.role, timezone: row.timezone };
}

export async function getUserById(db: Db, id: string): Promise<PublicUser | null> {
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      timezone: users.timezone,
      disabledAt: users.disabledAt,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!row || row.disabledAt) return null;
  return { id: row.id, email: row.email, name: row.name, role: row.role, timezone: row.timezone };
}

export async function createUser(
  db: Db,
  input: { email: string; name: string; role: Role; password: string; timezone?: string },
): Promise<PublicUser> {
  const email = normEmail(input.email);
  const passwordHash = await hashPassword(input.password);
  try {
    const [row] = await db
      .insert(users)
      .values({
        email,
        name: input.name.trim(),
        role: input.role,
        passwordHash,
        timezone: input.timezone && isValidTimezone(input.timezone) ? input.timezone : "UTC",
      })
      .returning({ id: users.id, email: users.email, name: users.name, role: users.role, timezone: users.timezone });
    return row;
  } catch (e) {
    if (isUniqueViolation(e)) throw new ValidationError("An account with this email already exists.");
    throw e;
  }
}

/** Student self-registration: requires a valid, non-archived class join code. */
export async function registerStudent(
  db: Db,
  input: { name: string; email: string; password: string; joinCode: string; timezone?: string },
): Promise<PublicUser> {
  const code = input.joinCode.trim().toUpperCase();
  const [cls] = await db
    .select({ id: classes.id })
    .from(classes)
    .where(and(eq(classes.joinCode, code), eq(classes.archived, false)))
    .limit(1);
  if (!cls) throw new ValidationError("That class code isn't valid. Check it with your teacher.");
  const user = await createUser(db, {
    email: input.email,
    name: input.name,
    role: "student",
    password: input.password,
    timezone: input.timezone,
  });
  await db.insert(enrollments).values({ classId: cls.id, studentId: user.id }).onConflictDoNothing();
  return user;
}

export async function countUsers(db: Db): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(users);
  return r.n;
}

function isUniqueViolation(e: unknown): boolean {
  const code = (e as { code?: string; cause?: { code?: string } })?.code ?? (e as { cause?: { code?: string } })?.cause?.code;
  return code === "23505";
}
