import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import {
  assignmentItems,
  assignments,
  classes,
  enrollments,
  questionLos,
  questions,
  submissionAnswers,
  submissions,
  users,
} from "@/db/schema";
import { assertClassAccess } from "./classes";
import { recordAttempt } from "./practice";
import { ForbiddenError, NotFoundError, ValidationError, type Actor, type Db } from "./types";

export type Target = { kind: "class" } | { kind: "students"; studentIds: string[] };
export type Policies = { showAnswers: "never" | "after_due" | "immediately"; allowLate: boolean };
export type ItemInput = { kind: "mcq"; questionId: string; points?: number } | { kind: "text"; prompt: string; points?: number };

export type StudentHomeworkStatus = "not_started" | "in_progress" | "submitted" | "graded";

type AssignmentRow = typeof assignments.$inferSelect;

function isTargeted(a: Pick<AssignmentRow, "target">, studentId: string) {
  return a.target.kind === "class" || a.target.studentIds.includes(studentId);
}

/** Pick `count` published questions spread across the given objectives (round-robin). */
export async function assembleQuestions(db: Db, actor: Actor, input: { losIds: string[]; count: number; excludeIds?: string[] }) {
  if (actor.role === "student") throw new ForbiddenError();
  const count = Math.max(1, Math.min(40, Math.floor(input.count)));
  if (input.losIds.length === 0) throw new ValidationError("Pick at least one learning objective.");
  const rows = await db
    .select({ id: questions.id, losId: questionLos.losId, difficulty: questions.difficulty })
    .from(questionLos)
    .innerJoin(questions, and(eq(questions.id, questionLos.questionId), eq(questions.status, "published")))
    .where(inArray(questionLos.losId, input.losIds))
    .orderBy(asc(questions.difficulty), asc(questions.id));
  const exclude = new Set(input.excludeIds ?? []);
  const byLos = new Map<string, string[]>();
  for (const r of rows) {
    if (exclude.has(r.id)) continue;
    byLos.set(r.losId, [...(byLos.get(r.losId) ?? []), r.id]);
  }
  const picked: string[] = [];
  const queues = input.losIds.map((id) => [...(byLos.get(id) ?? [])]);
  while (picked.length < count && queues.some((q) => q.length)) {
    for (const q of queues) {
      const next = q.shift();
      if (next && !picked.includes(next)) picked.push(next);
      if (picked.length >= count) break;
    }
  }
  const covered = input.losIds.filter((id) => (byLos.get(id) ?? []).some((q) => picked.includes(q)));
  return { questionIds: picked, coveredLosIds: covered, uncoveredLosIds: input.losIds.filter((id) => !covered.includes(id)) };
}

export async function createAssignment(
  db: Db,
  actor: Actor,
  input: {
    classId: string;
    title: string;
    instructions?: string;
    dueAt: Date;
    target: Target;
    policies: Policies;
    items: ItemInput[];
    assign: boolean;
  },
  now = new Date(),
) {
  await assertClassAccess(db, actor, input.classId);
  const title = input.title.trim();
  if (title.length < 3 || title.length > 120) throw new ValidationError("Title must be 3–120 characters.");
  if (input.items.length === 0) throw new ValidationError("Add at least one item.");
  if (input.items.length > 60) throw new ValidationError("Keep homework to 60 items or fewer.");
  if (Number.isNaN(input.dueAt.getTime())) throw new ValidationError("Enter a valid due date.");
  if (input.assign && input.dueAt <= now) throw new ValidationError("The due date must be in the future.");

  const qIds = input.items.filter((i) => i.kind === "mcq").map((i) => (i as { questionId: string }).questionId);
  if (qIds.length) {
    const found = await db
      .select({ id: questions.id })
      .from(questions)
      .where(and(inArray(questions.id, qIds), eq(questions.status, "published")));
    if (new Set(found.map((f) => f.id)).size !== new Set(qIds).size) throw new ValidationError("Some questions are unavailable.");
  }
  for (const it of input.items) {
    if (it.kind === "text" && (it.prompt.trim().length < 5 || it.prompt.length > 2000)) throw new ValidationError("Written prompts must be 5–2000 characters.");
    if (it.points !== undefined && (!Number.isInteger(it.points) || it.points < 1 || it.points > 20)) throw new ValidationError("Points must be 1–20.");
  }
  if (input.target.kind === "students") {
    const ids = [...new Set(input.target.studentIds)];
    if (ids.length === 0) throw new ValidationError("Choose at least one student.");
    const enrolled = await db
      .select({ id: enrollments.studentId })
      .from(enrollments)
      .where(and(eq(enrollments.classId, input.classId), inArray(enrollments.studentId, ids)));
    if (enrolled.length !== ids.length) throw new ValidationError("Every chosen student must be in this class.");
    input.target = { kind: "students", studentIds: ids };
  }

  return db.transaction(async (tx) => {
    const [a] = await tx
      .insert(assignments)
      .values({
        classId: input.classId,
        teacherId: actor.id,
        title,
        instructions: (input.instructions ?? "").trim().slice(0, 4000),
        dueAt: input.dueAt,
        status: input.assign ? "assigned" : "draft",
        target: input.target,
        policies: input.policies,
        assignedAt: input.assign ? now : null,
      })
      .returning();
    await tx.insert(assignmentItems).values(
      input.items.map((it, i) => ({
        assignmentId: a.id,
        position: i,
        kind: it.kind,
        questionId: it.kind === "mcq" ? it.questionId : null,
        prompt: it.kind === "text" ? it.prompt.trim() : null,
        points: it.points ?? 1,
      })),
    );
    return a;
  });
}

export async function publishAssignment(db: Db, actor: Actor, assignmentId: string, now = new Date()) {
  const a = await teacherAssignment(db, actor, assignmentId);
  if (a.status === "assigned") return a;
  if (a.dueAt <= now) throw new ValidationError("Move the due date into the future before assigning.");
  const [row] = await db.update(assignments).set({ status: "assigned", assignedAt: now }).where(eq(assignments.id, a.id)).returning();
  return row;
}

async function teacherAssignment(db: Db, actor: Actor, assignmentId: string) {
  const [a] = await db.select().from(assignments).where(eq(assignments.id, assignmentId)).limit(1);
  if (!a) throw new NotFoundError("Homework not found.");
  await assertClassAccess(db, actor, a.classId);
  return a;
}

/** Students the homework applies to: targeted, and enrolled before it was due. */
async function targetedStudents(db: Db, a: AssignmentRow): Promise<{ id: string; name: string }[]> {
  const roster = await db
    .select({ id: users.id, name: users.name, joinedAt: enrollments.joinedAt })
    .from(enrollments)
    .innerJoin(users, eq(users.id, enrollments.studentId))
    .where(eq(enrollments.classId, a.classId))
    .orderBy(asc(users.name));
  return roster.filter((r) => isTargeted(a, r.id) && r.joinedAt <= a.dueAt).map(({ id, name }) => ({ id, name }));
}

export async function listTeacherAssignments(db: Db, actor: Actor, classId: string) {
  await assertClassAccess(db, actor, classId);
  const rows = await db.select().from(assignments).where(eq(assignments.classId, classId)).orderBy(desc(assignments.dueAt));
  const subs = rows.length
    ? await db.select().from(submissions).where(inArray(submissions.assignmentId, rows.map((r) => r.id)))
    : [];
  const out = [];
  for (const a of rows) {
    const targets = await targetedStudents(db, a);
    const mine = subs.filter((s) => s.assignmentId === a.id && targets.some((t) => t.id === s.studentId));
    const submitted = mine.filter((s) => s.status !== "in_progress");
    const graded = mine.filter((s) => s.status === "graded");
    const scored = graded.filter((s) => s.maxScore);
    out.push({
      ...a,
      targeted: targets.length,
      submitted: submitted.length,
      needsGrading: mine.filter((s) => s.status === "submitted").length,
      late: submitted.filter((s) => s.late).length,
      avgScorePct: scored.length ? Math.round((scored.reduce((s, x) => s + x.score! / x.maxScore!, 0) / scored.length) * 100) : null,
    });
  }
  return out;
}

export async function getAssignmentForTeacher(db: Db, actor: Actor, assignmentId: string) {
  const a = await teacherAssignment(db, actor, assignmentId);
  const items = await db
    .select({ item: assignmentItems, q: questions })
    .from(assignmentItems)
    .leftJoin(questions, eq(questions.id, assignmentItems.questionId))
    .where(eq(assignmentItems.assignmentId, a.id))
    .orderBy(asc(assignmentItems.position));
  const targets = await targetedStudents(db, a);
  const subs = await db.select().from(submissions).where(eq(submissions.assignmentId, a.id));
  const answers = subs.length
    ? await db.select().from(submissionAnswers).where(inArray(submissionAnswers.submissionId, subs.map((s) => s.id)))
    : [];
  const students = targets.map((t) => {
    const s = subs.find((x) => x.studentId === t.id);
    return {
      ...t,
      submissionId: s?.id ?? null,
      status: (s?.status ?? "not_started") as StudentHomeworkStatus,
      late: s?.late ?? false,
      score: s?.score ?? null,
      maxScore: s?.maxScore ?? null,
      submittedAt: s?.submittedAt ?? null,
    };
  });
  const itemStats = items.map(({ item, q }) => {
    const ans = answers.filter((x) => x.itemId === item.id && x.correct !== null);
    const counts: Record<string, number> = {};
    for (const x of answers.filter((y) => y.itemId === item.id && y.chosenKey)) counts[x.chosenKey!] = (counts[x.chosenKey!] ?? 0) + 1;
    return {
      item,
      question: q ? { stem: q.stem, options: q.options, correctKey: q.correctKey } : null,
      answered: ans.length,
      correctPct: ans.length ? Math.round((ans.filter((x) => x.correct).length / ans.length) * 100) : null,
      choiceCounts: counts,
    };
  });
  return { assignment: a, items: itemStats, students };
}

/** Assignments visible to a student: assigned (not draft), in their classes, targeted at them. */
export async function listStudentAssignments(db: Db, actor: Actor, now = new Date()) {
  if (actor.role !== "student") throw new ForbiddenError();
  const rows = await db
    .select({ a: assignments, className: classes.name })
    .from(assignments)
    .innerJoin(classes, eq(classes.id, assignments.classId))
    .innerJoin(enrollments, and(eq(enrollments.classId, assignments.classId), eq(enrollments.studentId, actor.id)))
    .where(eq(assignments.status, "assigned"))
    .orderBy(asc(assignments.dueAt));
  const visible = rows.filter((r) => isTargeted(r.a, actor.id));
  const subs = visible.length
    ? await db
        .select()
        .from(submissions)
        .where(and(eq(submissions.studentId, actor.id), inArray(submissions.assignmentId, visible.map((v) => v.a.id))))
    : [];
  const counts = visible.length
    ? await db
        .select({ id: assignmentItems.assignmentId, n: sql<number>`count(*)::int` })
        .from(assignmentItems)
        .where(inArray(assignmentItems.assignmentId, visible.map((v) => v.a.id)))
        .groupBy(assignmentItems.assignmentId)
    : [];
  return visible.map(({ a, className }) => {
    const s = subs.find((x) => x.assignmentId === a.id);
    return {
      id: a.id,
      title: a.title,
      className,
      dueAt: a.dueAt,
      itemCount: counts.find((c) => c.id === a.id)?.n ?? 0,
      status: (s?.status ?? "not_started") as StudentHomeworkStatus,
      overdue: !s?.submittedAt && a.dueAt < now,
      late: s?.late ?? false,
      score: s?.status === "graded" ? s.score : null,
      maxScore: s?.status === "graded" ? s.maxScore : null,
    };
  });
}

async function studentAssignment(db: Db, actor: Actor, assignmentId: string) {
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

function canReveal(a: AssignmentRow, submitted: boolean, now: Date) {
  if (!submitted) return false;
  if (a.policies.showAnswers === "immediately") return true;
  if (a.policies.showAnswers === "after_due") return a.dueAt <= now;
  return false;
}

export async function getAssignmentForStudent(db: Db, actor: Actor, assignmentId: string, now = new Date()) {
  const a = await studentAssignment(db, actor, assignmentId);
  const items = await db
    .select({ item: assignmentItems, q: questions })
    .from(assignmentItems)
    .leftJoin(questions, eq(questions.id, assignmentItems.questionId))
    .where(eq(assignmentItems.assignmentId, a.id))
    .orderBy(asc(assignmentItems.position));
  const [sub] = await db
    .select()
    .from(submissions)
    .where(and(eq(submissions.assignmentId, a.id), eq(submissions.studentId, actor.id)))
    .limit(1);
  const answers = sub ? await db.select().from(submissionAnswers).where(eq(submissionAnswers.submissionId, sub.id)) : [];
  const submitted = !!sub && sub.status !== "in_progress";
  const reveal = canReveal(a, submitted, now);
  return {
    assignment: {
      id: a.id,
      title: a.title,
      instructions: a.instructions,
      dueAt: a.dueAt,
      policies: a.policies,
      overdue: a.dueAt < now,
    },
    submission: sub
      ? {
          status: sub.status,
          submittedAt: sub.submittedAt,
          late: sub.late,
          score: sub.status === "graded" ? sub.score : null,
          maxScore: sub.status === "graded" ? sub.maxScore : null,
          teacherFeedback: sub.status === "graded" ? sub.teacherFeedback : null,
        }
      : null,
    reveal,
    items: items.map(({ item, q }) => {
      const ans = answers.find((x) => x.itemId === item.id);
      return {
        id: item.id,
        kind: item.kind as "mcq" | "text",
        points: item.points,
        prompt: item.kind === "text" ? item.prompt : q!.stem,
        options: item.kind === "mcq" ? q!.options : null,
        answer: { chosenKey: ans?.chosenKey ?? null, textAnswer: ans?.textAnswer ?? null },
        // Correctness only after submission; answer key/explanation only when policy allows.
        result: submitted ? { correct: ans?.correct ?? null, pointsAwarded: ans?.pointsAwarded ?? null, feedback: ans?.feedback ?? null } : null,
        reveal: reveal && q ? { correctKey: q.correctKey, explanation: q.explanation } : null,
      };
    }),
  };
}

export type AnswerInput = { itemId: string; chosenKey?: string | null; textAnswer?: string | null };

async function upsertDraft(db: Db, actor: Actor, a: AssignmentRow, answers: AnswerInput[]) {
  const items = await db.select().from(assignmentItems).where(eq(assignmentItems.assignmentId, a.id));
  const byId = new Map(items.map((i) => [i.id, i]));
  for (const ans of answers) {
    if (!byId.has(ans.itemId)) throw new ValidationError("Unknown homework item.");
    if (ans.textAnswer && ans.textAnswer.length > 10_000) throw new ValidationError("That answer is too long.");
  }
  const [existing] = await db
    .select()
    .from(submissions)
    .where(and(eq(submissions.assignmentId, a.id), eq(submissions.studentId, actor.id)))
    .limit(1);
  if (existing && existing.status !== "in_progress") throw new ValidationError("This homework has already been submitted.");
  const sub =
    existing ??
    (
      await db
        .insert(submissions)
        .values({ assignmentId: a.id, studentId: actor.id })
        .onConflictDoNothing()
        .returning()
    )[0] ??
    (await db.select().from(submissions).where(and(eq(submissions.assignmentId, a.id), eq(submissions.studentId, actor.id))))[0];
  for (const ans of answers) {
    const values = {
      submissionId: sub.id,
      itemId: ans.itemId,
      chosenKey: ans.chosenKey ?? null,
      textAnswer: ans.textAnswer?.trim() || null,
    };
    await db
      .insert(submissionAnswers)
      .values(values)
      .onConflictDoUpdate({ target: [submissionAnswers.submissionId, submissionAnswers.itemId], set: values });
  }
  return { sub, items };
}

export async function saveDraft(db: Db, actor: Actor, assignmentId: string, answers: AnswerInput[]) {
  const a = await studentAssignment(db, actor, assignmentId);
  await upsertDraft(db, actor, a, answers);
}

/** Final submission: auto-grade MCQ (feeding mastery), queue written items for the teacher. */
export async function submitAssignment(db: Db, actor: Actor, assignmentId: string, answers: AnswerInput[], now = new Date()) {
  const a = await studentAssignment(db, actor, assignmentId);
  const late = a.dueAt < now;
  if (late && !a.policies.allowLate) throw new ValidationError("The due date has passed and late work isn't accepted.");
  const { sub, items } = await upsertDraft(db, actor, a, answers);
  // Claim the submission atomically so a double submit can't grade (and count attempts) twice.
  const [claimed] = await db
    .update(submissions)
    .set({ status: "submitted", submittedAt: now, late })
    .where(and(eq(submissions.id, sub.id), eq(submissions.status, "in_progress")))
    .returning({ id: submissions.id });
  if (!claimed) throw new ValidationError("This homework has already been submitted.");
  const saved = await db.select().from(submissionAnswers).where(eq(submissionAnswers.submissionId, sub.id));

  let score = 0;
  let maxScore = 0;
  let needsTeacher = false;
  for (const item of items) {
    maxScore += item.points;
    const ans = saved.find((s) => s.itemId === item.id);
    if (item.kind === "mcq" && item.questionId) {
      if (!ans?.chosenKey) {
        await db
          .insert(submissionAnswers)
          .values({ submissionId: sub.id, itemId: item.id, correct: false, pointsAwarded: 0 })
          .onConflictDoUpdate({ target: [submissionAnswers.submissionId, submissionAnswers.itemId], set: { correct: false, pointsAwarded: 0 } });
        continue;
      }
      const r = await recordAttempt(
        db,
        actor,
        { questionId: item.questionId, chosenKey: ans.chosenKey, mode: "homework", assignmentId: a.id },
        now.getTime(),
      );
      const pts = r.correct ? item.points : 0;
      score += pts;
      await db.update(submissionAnswers).set({ correct: r.correct, pointsAwarded: pts }).where(eq(submissionAnswers.id, ans.id));
    } else {
      needsTeacher = true;
    }
  }
  const [row] = await db
    .update(submissions)
    .set({
      status: needsTeacher ? "submitted" : "graded",
      score,
      maxScore,
      gradedAt: needsTeacher ? null : now,
    })
    .where(eq(submissions.id, sub.id))
    .returning();
  return row;
}

/** Teacher grades written items (and may override MCQ points), then returns the work. */
export async function gradeSubmission(
  db: Db,
  actor: Actor,
  submissionId: string,
  input: { items: { itemId: string; points: number; feedback?: string }[]; feedback?: string },
  now = new Date(),
) {
  const [sub] = await db.select().from(submissions).where(eq(submissions.id, submissionId)).limit(1);
  if (!sub) throw new NotFoundError("Submission not found.");
  await teacherAssignment(db, actor, sub.assignmentId);
  if (sub.status === "in_progress") throw new ValidationError("The student hasn't submitted yet.");
  const items = await db.select().from(assignmentItems).where(eq(assignmentItems.assignmentId, sub.assignmentId));
  for (const g of input.items) {
    const it = items.find((i) => i.id === g.itemId);
    if (!it) throw new ValidationError("Unknown item.");
    if (!(g.points >= 0 && g.points <= it.points)) throw new ValidationError(`Points must be between 0 and ${it.points}.`);
    const values = { pointsAwarded: g.points, feedback: g.feedback?.trim().slice(0, 2000) || null, correct: g.points === it.points };
    await db
      .insert(submissionAnswers)
      .values({ submissionId, itemId: g.itemId, ...values })
      .onConflictDoUpdate({ target: [submissionAnswers.submissionId, submissionAnswers.itemId], set: values });
  }
  const answers = await db.select().from(submissionAnswers).where(eq(submissionAnswers.submissionId, submissionId));
  const ungradedText = items.filter((i) => i.kind === "text" && !answers.some((a) => a.itemId === i.id && a.pointsAwarded !== null));
  if (ungradedText.length) throw new ValidationError("Grade every written answer before returning the work.");
  const score = answers.reduce((s, a) => s + (a.pointsAwarded ?? 0), 0);
  const [row] = await db
    .update(submissions)
    .set({
      status: "graded",
      score,
      maxScore: items.reduce((s, i) => s + i.points, 0),
      teacherFeedback: input.feedback?.trim().slice(0, 4000) || null,
      gradedAt: now,
    })
    .where(eq(submissions.id, submissionId))
    .returning();
  return row;
}

export async function getSubmissionForTeacher(db: Db, actor: Actor, submissionId: string) {
  const [sub] = await db.select().from(submissions).where(eq(submissions.id, submissionId)).limit(1);
  if (!sub) throw new NotFoundError("Submission not found.");
  const a = await teacherAssignment(db, actor, sub.assignmentId);
  const [student] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, sub.studentId));
  const items = await db
    .select({ item: assignmentItems, q: questions })
    .from(assignmentItems)
    .leftJoin(questions, eq(questions.id, assignmentItems.questionId))
    .where(eq(assignmentItems.assignmentId, a.id))
    .orderBy(asc(assignmentItems.position));
  const answers = await db.select().from(submissionAnswers).where(eq(submissionAnswers.submissionId, sub.id));
  return {
    assignment: a,
    student,
    submission: sub,
    items: items.map(({ item, q }) => ({
      item,
      question: q ? { stem: q.stem, options: q.options, correctKey: q.correctKey } : null,
      answer: answers.find((x) => x.itemId === item.id) ?? null,
    })),
  };
}

/**
 * For the cockpit: missed (past due, not submitted, last 30 days) per student, and on-time rate.
 * No actor: callers must have checked class access (getClassOverview does).
 */
export async function homeworkStats(db: Db, classId: string, now = new Date()) {
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const due = await db
    .select()
    .from(assignments)
    .where(and(eq(assignments.classId, classId), eq(assignments.status, "assigned"), lt(assignments.dueAt, now)));
  const recent = due.filter((a) => a.dueAt >= since);
  const roster = await db
    .select({ id: enrollments.studentId, joinedAt: enrollments.joinedAt })
    .from(enrollments)
    .where(eq(enrollments.classId, classId));
  const subs = due.length
    ? await db.select().from(submissions).where(inArray(submissions.assignmentId, due.map((a) => a.id)))
    : [];
  const missedByStudent = new Map<string, number>();
  let expected = 0;
  let onTime = 0;
  for (const a of due) {
    for (const r of roster) {
      if (!isTargeted(a, r.id)) continue;
      // Work that was due before the student joined the class doesn't count against them.
      if (a.dueAt < r.joinedAt) continue;
      expected++;
      const s = subs.find((x) => x.assignmentId === a.id && x.studentId === r.id && x.submittedAt);
      if (s && !s.late) onTime++;
      if (!s && recent.includes(a)) missedByStudent.set(r.id, (missedByStudent.get(r.id) ?? 0) + 1);
    }
  }
  return { missedByStudent, onTimePct: expected ? Math.round((onTime / expected) * 100) : null };
}
