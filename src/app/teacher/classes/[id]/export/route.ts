import { connection } from "next/server";
import { getDb } from "@/db/client";
import { csvFileName, rosterCsv, toRosterRows } from "@/lib/class-roster";
import { todayIn } from "@/lib/today";
import { getCurrentUser, toActor } from "@/server/dal";
import { getClassOverview } from "@/services/classes";
import { ForbiddenError, NotFoundError } from "@/services/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const plain = (body: string, status: number) =>
  new Response(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });

/**
 * CSV of the class's student table. Route handlers can't redirect to a sign-in page, so this answers 401 for
 * signed-out callers and a plain 404 for students, other teachers' classes and unknown ids. The service does the authorization.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await connection();
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return plain("Sign in to export.", 401);
  if (user.role === "student" || !UUID.test(id)) return plain("Not found", 404);
  try {
    const today = todayIn(user.timezone);
    const overview = await getClassOverview(getDb(), toActor(user), id, today);
    const csv = rosterCsv(toRosterRows(overview.students, today));
    const name = csvFileName(overview.cls.name, today);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    if (e instanceof NotFoundError || e instanceof ForbiddenError)
      return plain("Not found", 404);
    console.error(
      "[class-export] failed:",
      e instanceof Error ? e.message : "unknown error",
    );
    return plain("Something went wrong.", 500);
  }
}
