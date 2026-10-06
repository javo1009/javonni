import { describe, expect, it } from "vitest";
import { databaseLikeEnvNames, findDatabaseUrl, findDirectDatabaseUrl } from "../env";

const PG = "postgresql://u:p@host/db?sslmode=require";
const PG_DIRECT = "postgresql://u:p@direct-host/db?sslmode=require";

describe("database env discovery", () => {
  it("uses DATABASE_URL, then POSTGRES_URL", () => {
    expect(findDatabaseUrl({ DATABASE_URL: PG })).toBe(PG);
    expect(findDatabaseUrl({ POSTGRES_URL: PG })).toBe(PG);
  });

  it("finds prefixed names from a custom integration prefix", () => {
    expect(findDatabaseUrl({ STORAGE_DATABASE_URL: PG })).toBe(PG);
    expect(findDirectDatabaseUrl({ STORAGE_DATABASE_URL: PG, STORAGE_DATABASE_URL_UNPOOLED: PG_DIRECT })).toBe(PG_DIRECT);
  });

  it("prefers the direct URL for migrations and falls back to the pooled one", () => {
    expect(findDirectDatabaseUrl({ DATABASE_URL: PG, DATABASE_URL_UNPOOLED: PG_DIRECT })).toBe(PG_DIRECT);
    expect(findDirectDatabaseUrl({ POSTGRES_URL: PG, POSTGRES_URL_NON_POOLING: PG_DIRECT })).toBe(PG_DIRECT);
    expect(findDirectDatabaseUrl({ DATABASE_URL: PG })).toBe(PG);
  });

  it("ignores empty or non-Postgres values", () => {
    expect(findDatabaseUrl({ DATABASE_URL: "", POSTGRES_URL: PG })).toBe(PG);
    expect(findDatabaseUrl({ DATABASE_URL: "mysql://x" })).toBeUndefined();
    expect(findDatabaseUrl({})).toBeUndefined();
  });

  it("lists database-looking names without values", () => {
    expect(databaseLikeEnvNames({ PGHOST: "h", NEON_PROJECT_ID: "x", SESSION_SECRET: "s" })).toEqual(["NEON_PROJECT_ID", "PGHOST"]);
  });
});
