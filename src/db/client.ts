import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { findDatabaseUrl, findDirectDatabaseUrl } from "./env";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

type Cache = { sql?: ReturnType<typeof postgres>; db?: Db; url?: string };
const globalForDb = globalThis as unknown as { __ascentDb?: Cache };
const cache: Cache = (globalForDb.__ascentDb ??= {});

/** Runtime (pooled) connection string. Accepts the names Vercel/Neon integrations inject. */
export const databaseUrl = () => findDatabaseUrl();
/** Direct (non-pooled) connection string for migrations, falling back to the pooled one. */
export const directDatabaseUrl = () => findDirectDatabaseUrl();

/**
 * Lazily-created, process-wide connection. Safe to import at build time: nothing
 * connects until the first query. `prepare: false` keeps it compatible with
 * pooled (pgbouncer-style) connection strings such as Neon's `-pooler` host.
 */
export function getDb(url = databaseUrl()): Db {
  if (!url) {
    throw new Error("DATABASE_URL is not set. See .env.example and README.md.");
  }
  if (cache.db && cache.url === url) return cache.db;
  const sql = postgres(url, {
    prepare: false,
    max: Number(process.env.DB_POOL_MAX ?? (process.env.NODE_ENV === "production" ? 5 : 10)),
    idle_timeout: 20,
    connect_timeout: 15,
  });
  cache.sql = sql;
  cache.url = url;
  cache.db = drizzle(sql, { schema });
  return cache.db;
}

export async function closeDb() {
  await cache.sql?.end({ timeout: 5 });
  cache.sql = undefined;
  cache.db = undefined;
  cache.url = undefined;
}

export { schema };
