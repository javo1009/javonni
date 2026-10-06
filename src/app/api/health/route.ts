import { connection } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";

const DB_TIMEOUT_MS = 3000;

/**
 * Liveness + database check for uptime monitors and post-deploy smoke tests.
 * Public on purpose, so it reveals nothing beyond "up" or "down": no versions,
 * hostnames, error text or counts.
 */
export async function GET() {
  await connection(); // always run at request time, never prerendered
  const started = Date.now();
  let db: "up" | "down" = "down";
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("timeout")), DB_TIMEOUT_MS);
    });
    await Promise.race([getDb().execute(sql`select 1`), timeout]);
    db = "up";
  } catch (e) {
    // Log server-side only (Vercel function logs); never echo the error to the caller.
    console.error("[health] database check failed:", e instanceof Error ? e.message : "unknown error");
  } finally {
    clearTimeout(timer);
  }
  const ok = db === "up";
  return Response.json(
    { ok, db, latencyMs: Date.now() - started },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
