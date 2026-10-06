import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import path from "node:path";
import { toDriverUrl } from "./env";

/** Apply pending SQL migrations from ./drizzle. Uses a dedicated single connection. */
export async function runMigrations(url: string) {
  const sql = postgres(toDriverUrl(url), { max: 1, prepare: false, onnotice: () => {} });
  try {
    await migrate(drizzle(sql), { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
  } finally {
    await sql.end({ timeout: 5 });
  }
}
