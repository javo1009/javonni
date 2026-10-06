import { connection } from "next/server";
import { getDb } from "@/db/client";
import { getCurrentUser, toActor } from "@/server/dal";
import { getFileForDownload } from "@/services/files";
import { ForbiddenError, NotFoundError } from "@/services/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** RFC 6266 / 5987 attachment header: ASCII fallback plus the UTF-8 name. */
function disposition(name: string) {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/**
 * Homework file download. Authorization lives in services/files.ts; everything the caller may not
 * open (or that doesn't exist) is the same plain 404. Always an attachment, so uploaded files are
 * never rendered in our origin.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in to download files.", { status: 401, headers: { "Cache-Control": "no-store" } });
  if (!UUID.test(id)) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  try {
    const f = await getFileForDownload(getDb(), toActor(user), id);
    return new Response(new Uint8Array(f.bytes), {
      headers: {
        "Content-Type": f.contentType,
        "Content-Length": String(f.size),
        "Content-Disposition": disposition(f.name),
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none'",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    if (e instanceof NotFoundError || e instanceof ForbiddenError) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
    console.error("[files] download failed:", e instanceof Error ? e.message : "unknown error");
    return new Response("Something went wrong.", { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
