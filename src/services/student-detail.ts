import { and, desc, eq, inArray } from "drizzle-orm";
import {
  assignments,
  classes,
  enrollments,
  files,
  submissions,
  users,
} from "@/db/schema";
import type { Alert } from "@/domain/alerts";
import type { ISODate } from "@/domain/dates";
import { assertCanViewStudent, isTargeted } from "./access";
import { getClassOverview } from "./classes";
import { ForbiddenError, NotFoundError, type Actor, type Db } from "./types";

export type StudentHomeworkRow = {
  assignmentId: string;
  submissionId: string | null;
  title: string;
  className: string;
  dueAt: Date;
  status: "not_started" | "in_progress" | "submitted" | "graded";
  late: boolean;
  score: number | null;
  maxScore: number | null;
  submittedAt: Date | null;
  uploadedFiles: number;
  overdue: boolean;
};

/**
 * What a teacher (or admin) sees above a student's tracker: who they are, which class, the alert engine's
 * view of them and their homework history. Authorization is the same as for the tracker snapshot.
 */
export async function getStudentForTeacher(
  db: Db,
  actor: Actor,
  studentId: string,
  today: ISODate,
  nowMs = Date.now(),
) {
  if (actor.role === "student") throw new ForbiddenError();
  await assertCanViewStudent(db, actor, studentId);
  const [student] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
    })
    .from(users)
    .where(eq(users.id, studentId))
    .limit(1);
  if (!student || student.role !== "student")
    throw new NotFoundError("Student not found.");

  const enrolled = await db
    .select({
      classId: classes.id,
      className: classes.name,
      teacherId: classes.teacherId,
      joinedAt: enrollments.joinedAt,
    })
    .from(enrollments)
    .innerJoin(classes, eq(classes.id, enrollments.classId))
    .where(eq(enrollments.studentId, studentId));
  const visible = enrolled.filter(
    (c) => actor.role === "admin" || c.teacherId === actor.id,
  );
  if (visible.length === 0) throw new NotFoundError("Student not found.");

  // The class overview owns alert evaluation, so this page can't disagree with the cockpit.
  const primary = visible[0];
  const overview = await getClassOverview(
    db,
    actor,
    primary.classId,
    today,
    nowMs,
  );
  const row = overview.students.find((s) => s.id === studentId);
  const alerts: Alert[] = row?.alerts ?? [];

  const classIds = visible.map((c) => c.classId);
  const assigned = await db
    .select()
    .from(assignments)
    .where(
      and(
        inArray(assignments.classId, classIds),
        eq(assignments.status, "assigned"),
      ),
    )
    .orderBy(desc(assignments.dueAt));
  const mine = assigned.filter((a) => isTargeted(a, studentId));
  const subs = mine.length
    ? await db
        .select()
        .from(submissions)
        .where(
          and(
            eq(submissions.studentId, studentId),
            inArray(
              submissions.assignmentId,
              mine.map((a) => a.id),
            ),
          ),
        )
    : [];
  const fileRows = subs.length
    ? await db
        .select({ submissionId: files.submissionId })
        .from(files)
        .where(
          and(
            inArray(
              files.submissionId,
              subs.map((s) => s.id),
            ),
            eq(files.kind, "submission"),
          ),
        )
    : [];
  const classNames = new Map(visible.map((c) => [c.classId, c.className]));
  const now = new Date(nowMs);
  const homework: StudentHomeworkRow[] = mine.map((a) => {
    const s = subs.find((x) => x.assignmentId === a.id);
    return {
      assignmentId: a.id,
      submissionId: s?.id ?? null,
      title: a.title,
      className: classNames.get(a.classId) ?? "",
      dueAt: a.dueAt,
      status: (s?.status ?? "not_started") as StudentHomeworkRow["status"],
      late: s?.late ?? false,
      score: s?.score ?? null,
      maxScore: s?.maxScore ?? null,
      submittedAt: s?.submittedAt ?? null,
      uploadedFiles: s
        ? fileRows.filter((f) => f.submissionId === s.id).length
        : 0,
      overdue: (!s || s.status === "in_progress") && a.dueAt < now,
    };
  });

  return {
    student: { id: student.id, name: student.name, email: student.email },
    classes: visible.map((c) => ({
      id: c.classId,
      name: c.className,
      joinedAt: c.joinedAt,
    })),
    alerts,
    lastActive: row?.lastActive ?? null,
    homework,
  };
}
