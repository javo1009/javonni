import { getCurrentUser } from "@/server/dal";
import { CSV_TEMPLATE } from "@/domain/curriculum-csv";

/** The import format with a few clearly-placeholder rows. Admins only. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return new Response("Forbidden", { status: 403, headers: { "Cache-Control": "no-store" } });
  return new Response("﻿" + CSV_TEMPLATE, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="ascent-curriculum-template.csv"',
      "Cache-Control": "no-store",
    },
  });
}
