// Find the Postgres connection strings among environment variables. Vercel's
// storage integrations inject them under a few names, optionally with a custom
// prefix (e.g. STORAGE_DATABASE_URL), so accept all of those.

type Env = Record<string, string | undefined>;

const isPg = (v: string | undefined): v is string => !!v && /^postgres(ql)?:\/\//i.test(v.trim());

function pick(env: Env, exact: string[], suffixes: string[]): string | undefined {
  for (const k of exact) if (isPg(env[k])) return env[k]!.trim();
  const keys = Object.keys(env).sort();
  for (const s of suffixes) {
    const k = keys.find((key) => key.endsWith(s) && isPg(env[key]));
    if (k) return env[k]!.trim();
  }
  return undefined;
}

/** Pooled URL for the app at runtime. */
export function findDatabaseUrl(env: Env = process.env): string | undefined {
  return pick(env, ["DATABASE_URL", "POSTGRES_URL"], ["_DATABASE_URL", "_POSTGRES_URL"]);
}

/** Direct (non-pooled) URL for migrations, falling back to the pooled one. */
export function findDirectDatabaseUrl(env: Env = process.env): string | undefined {
  return (
    pick(env, ["DATABASE_URL_UNPOOLED", "POSTGRES_URL_NON_POOLING"], ["_DATABASE_URL_UNPOOLED", "_POSTGRES_URL_NON_POOLING"]) ??
    findDatabaseUrl(env)
  );
}

/** Names (never values) of variables that look database-related, for error messages. */
export function databaseLikeEnvNames(env: Env = process.env): string[] {
  return Object.keys(env)
    .filter((k) => /DATABASE|POSTGRES|^PG|NEON/i.test(k))
    .sort();
}
