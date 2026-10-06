import { connection } from "next/server";
import { getDb } from "@/db/client";
import { getCurrentUser, toActor } from "@/server/dal";
import { exportQuestionBank } from "@/services/admin";
import { ForbiddenError } from "@/services/types";

const NO_STORE = { "Cache-Control": "private, no-store" };

/** The published question bank as CSV, formula-injection safe (admins only). */
export async function GET() {
  await connection();
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in to export the question bank.", { status: 401, headers: NO_STORE });
  try {
    const csv = await exportQuestionBank(getDb(), toActor(user));
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      headers: {
        ...NO_STORE,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="ascent-question-bank-${stamp}.csv"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    if (e instanceof ForbiddenError) return new Response("Not found", { status: 404, headers: NO_STORE });
    console.error("[admin] question export failed:", e instanceof Error ? e.message : "unknown error");
    return new Response("Something went wrong.", { status: 500, headers: NO_STORE });
  }
}
