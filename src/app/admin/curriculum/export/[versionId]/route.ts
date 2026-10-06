import type { NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { curriculumToCsv } from "@/domain/curriculum-csv";
import { getCurrentUser, toActor } from "@/server/dal";
import { getVersionForExport } from "@/services/admin";
import { ForbiddenError, NotFoundError } from "@/services/types";

/** Download a stored version in the import format, e.g. to fix a typo and re-import it as a new version. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/admin/curriculum/export/[versionId]">) {
  const { versionId } = await ctx.params;
  const noStore = { "Cache-Control": "no-store" };
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first.", { status: 401, headers: noStore });
  try {
    const { version, shape } = await getVersionForExport(getDb(), toActor(user), versionId);
    const slug = `${version.name}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "curriculum";
    return new Response("﻿" + curriculumToCsv(shape), {
      headers: {
        ...noStore,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${slug}-${version.year}.csv"`,
      },
    });
  } catch (e) {
    if (e instanceof ForbiddenError) return new Response("Forbidden", { status: 403, headers: noStore });
    if (e instanceof NotFoundError) return new Response("Not found", { status: 404, headers: noStore });
    throw e;
  }
}
