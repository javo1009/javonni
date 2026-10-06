import postgres from "postgres";
import { runMigrations } from "../db/migrate";
import { TEST_TEMPLATE_URL, templateName, withDatabase } from "./urls";

/** Ensure the template database exists and is fully migrated before any test file runs. */
export default async function setup() {
  const admin = postgres(withDatabase(TEST_TEMPLATE_URL, "postgres"), { max: 1, onnotice: () => {} });
  try {
    const exists = await admin`select 1 from pg_database where datname = ${templateName()}`;
    if (exists.length === 0) await admin.unsafe(`create database "${templateName()}"`);
  } finally {
    await admin.end({ timeout: 5 });
  }
  await runMigrations(TEST_TEMPLATE_URL);
}
