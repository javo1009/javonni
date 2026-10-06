import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../db/schema";
import type { Db } from "../db/client";
import { TEST_TEMPLATE_URL, templateName, withDatabase } from "./urls";

export type TestDb = { db: Db; url: string; drop: () => Promise<void> };

/** A private database cloned from the migrated template. Drop it in afterAll. */
export async function createTestDb(): Promise<TestDb> {
  const name = `t_${randomBytes(6).toString("hex")}`;
  const admin = postgres(withDatabase(TEST_TEMPLATE_URL, "postgres"), { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe(`create database "${name}" template "${templateName()}"`);
  } finally {
    await admin.end({ timeout: 5 });
  }
  const url = withDatabase(TEST_TEMPLATE_URL, name);
  const sql = postgres(url, { max: 4, prepare: false, onnotice: () => {} });
  const db = drizzle(sql, { schema }) as Db;
  return {
    db,
    url,
    drop: async () => {
      await sql.end({ timeout: 5 });
      const a = postgres(withDatabase(TEST_TEMPLATE_URL, "postgres"), { max: 1, onnotice: () => {} });
      try {
        await a.unsafe(`drop database if exists "${name}" with (force)`);
      } finally {
        await a.end({ timeout: 5 });
      }
    },
  };
}
