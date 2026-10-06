import { connection } from "next/server";
import { questionTemplateCsv } from "@/domain/question-csv";
import { getCurrentUser } from "@/server/dal";

const NO_STORE = { "Cache-Control": "private, no-store" };

/** The question-import CSV template (admins only). */
export async function GET() {
  await connection();
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in to download the template.", { status: 401, headers: NO_STORE });
  if (user.role !== "admin") return new Response("Not found", { status: 404, headers: NO_STORE });
  return new Response(questionTemplateCsv(), {
    headers: {
      ...NO_STORE,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="ascent-question-template.csv"',
      "X-Content-Type-Options": "nosniff",
    },
  });
}
