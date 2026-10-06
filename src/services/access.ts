import { and, eq } from "drizzle-orm";
import { assignments, classes, enrollments } from "@/db/schema";
import { ForbiddenError, NotFoundError, type Actor, type Db } from "./types";

export function assertStudent(actor: Actor) {
  if (actor.role !== "student") throw new ForbiddenError("Only students can do that.");
}

/** The class, if the actor teaches it (admins can see every class). */
export async function assertClassAccess(db: Db, actor: Actor, classId: string) {
  if (actor.role === "student") throw new ForbiddenError();
  const [cls] = await db.select().from(classes).where(eq(classes.id, classId)).limit(1);
  if (!cls) throw new NotFoundError("Class not found.");
  if (actor.role !== "admin" && cls.teacherId !== actor.id) throw new ForbiddenError();
  return cls;
}

/** Teachers may view students enrolled in one of their classes; students only themselves. */
export async function assertCanViewStudent(db: Db, actor: Actor, studentId: string) {
  if (actor.role === "admin") return;
  if (actor.role === "student") {
    if (actor.id !== studentId) throw new ForbiddenError();
    return;
  }
  const [row] = await db
    .select({ id: classes.id })
    .from(enrollments)
    .innerJoin(classes, eq(classes.id, enrollments.classId))
    .where(and(eq(enrollments.studentId, studentId), eq(classes.teacherId, actor.id)))
    .limit(1);
  if (!row) throw new ForbiddenError();
}

// -------------------------------------------------------------- homework
type AssignmentRow = typeof assignments.$inferSelect;

export function isTargeted(a: Pick<AssignmentRow, "target">, studentId: string) {
  return a.target.kind === "class" || a.target.studentIds.includes(studentId);
}

/** The assignment, if the actor teaches its class (admins: any). */
export async function assertTeacherAssignment(db: Db, actor: Actor, assignmentId: string): Promise<AssignmentRow> {
  const [a] = await db.select().from(assignments).where(eq(assignments.id, assignmentId)).limit(1);
  if (!a) throw new NotFoundError("Homework not found.");
  await assertClassAccess(db, actor, a.classId);
  return a;
}

/** The assignment, if it is assigned (not a draft) and applies to this enrolled student. */
export async function assertStudentAssignment(db: Db, actor: Actor, assignmentId: string): Promise<AssignmentRow> {
  if (actor.role !== "student") throw new ForbiddenError();
  const [a] = await db.select().from(assignments).where(eq(assignments.id, assignmentId)).limit(1);
  if (!a || a.status !== "assigned") throw new NotFoundError("Homework not found.");
  const [enr] = await db
    .select({ id: enrollments.studentId })
    .from(enrollments)
    .where(and(eq(enrollments.classId, a.classId), eq(enrollments.studentId, actor.id)))
    .limit(1);
  if (!enr || !isTargeted(a, actor.id)) throw new NotFoundError("Homework not found.");
  return a;
}
