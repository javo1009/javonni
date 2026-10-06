import { connection } from "next/server";
import { getDb } from "@/db/client";
import { toCsv, csvFileName } from "@/components/homework/teacher/csv";
import { sortStudents } from "@/components/homework/teacher/student-order";
import { getCurrentUser, toActor } from "@/server/dal";
import { getAssignmentForTeacher, getSubmissionForTeacher } from "@/services/homework";
import { ForbiddenError, NotFoundError } from "@/services/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const noStore = { "Cache-Control": "no-store" };

const STATUS = { not_started: "Not started", in_progress: "In progress", submitted: "Handed in (not marked)", graded: "Marked" } as const;

/** Scores for one homework as CSV. Authorization is the service's: only the class's teacher (or an admin). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in to export scores.", { status: 401, headers: noStore });
  if (user.role === "student" || !UUID.test(id)) return new Response("Not found", { status: 404, headers: noStore });
  const db = getDb();
  const actor = toActor(user);
  try {
    const data = await getAssignmentForTeacher(db, actor, id);
    const students = sortStudents(data.students.map((s) => ({ ...s })));
    const handedIn = students.filter((s) => s.submissionId && (s.status === "submitted" || s.status === "graded"));
    // Per-item marks for everyone who handed in (classes are small; one read each).
    const details = new Map(
      await Promise.all(handedIn.map(async (s) => [s.id, await getSubmissionForTeacher(db, actor, s.submissionId!)] as const)),
    );
    const itemCols = data.items.map((it, i) => `Item ${i + 1} (${it.item.kind === "mcq" ? "auto" : it.item.kind}, /${it.item.points})`);
    const rows: (string | number | null)[][] = [["Student", "Status", "Late", "Handed in (UTC)", "Files uploaded", "Score", "Out of", "Percent", ...itemCols, "Feedback"]];
    for (const s of students) {
      const d = details.get(s.id);
      const marked = s.status === "graded";
      rows.push([
        s.name,
        STATUS[s.status],
        s.late ? "Late" : "",
        s.submittedAt ? s.submittedAt.toISOString().replace("T", " ").slice(0, 16) : "",
        s.status === "not_started" ? "" : s.uploadedFiles,
        marked ? s.score : null,
        marked ? s.maxScore : null,
        marked && s.score !== null && s.maxScore ? Math.round((s.score / s.maxScore) * 100) : null,
        ...data.items.map((it) => (marked ? (d?.items.find((x) => x.item.id === it.item.id)?.answer?.pointsAwarded ?? null) : null)),
        marked ? (d?.submission.teacherFeedback ?? "") : "",
      ]);
    }
    return new Response(toCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${csvFileName(data.assignment.title, data.assignment.dueAt)}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    if (e instanceof NotFoundError || e instanceof ForbiddenError) return new Response("Not found", { status: 404, headers: noStore });
    console.error("[homework export] failed:", e instanceof Error ? e.message : "unknown error");
    return new Response("Something went wrong.", { status: 500, headers: noStore });
  }
}
