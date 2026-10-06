// Runs before `next build` on Vercel (package.json "vercel-build"), so a deploy
// needs no local tooling. Every step is idempotent:
//   1. apply pending migrations
//   2. seed the labelled sample curriculum if no curriculum is active
//   3. create the first admin from ADMIN_EMAIL / ADMIN_PASSWORD if that user doesn't exist
//   4. SEED_DEMO=1 only: create the demo class (shared demo password — throwaway deployments only)
// Set SKIP_DB_SETUP=1 to skip everything (e.g. preview builds without a database).
import { eq } from "drizzle-orm";
import { closeDb, databaseUrl, directDatabaseUrl, getDb } from "../src/db/client";
import { databaseLikeEnvNames } from "../src/db/env";
import { runMigrations } from "../src/db/migrate";
import { users } from "../src/db/schema";
import { DEMO_DOMAIN, seedDemo } from "../src/db/seed/demo";
import { seedSampleCurriculum } from "../src/db/seed/sample";
import { createUser } from "../src/services/users";

function fail(msg: string): never {
  console.error(`\n✖ Deploy setup: ${msg}\n`);
  process.exit(1);
}

async function main() {
  if (process.env.SKIP_DB_SETUP === "1") {
    console.log("Deploy setup skipped (SKIP_DB_SETUP=1).");
    return;
  }
  const pooled = databaseUrl();
  const direct = directDatabaseUrl();
  if (!pooled || !direct) {
    const seen = databaseLikeEnvNames();
    fail(
      "No Postgres connection string found (looked for DATABASE_URL, POSTGRES_URL and prefixed variants).\n" +
        "  In Vercel: Storage → create a Neon database → Connect it to this project (Production), then redeploy.\n" +
        (seen.length
          ? `  Database-looking variables present (names only): ${seen.join(", ")}`
          : "  No database-looking variables are set in this environment at all, so the database isn't connected to it yet."),
    );
  }
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32)
    fail("SESSION_SECRET must be set to a random string of at least 32 characters (Settings → Environment Variables).");

  console.log("Deploy setup: applying migrations…");
  await runMigrations(direct);

  const db = getDb(direct);
  const sample = await seedSampleCurriculum(db);
  console.log(sample.created ? "Deploy setup: seeded the sample curriculum (labelled as demo data)." : "Deploy setup: curriculum already present.");

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    if (adminPassword.length < 12) fail("ADMIN_PASSWORD must be at least 12 characters.");
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, adminEmail)).limit(1);
    if (existing) console.log(`Deploy setup: admin ${adminEmail} already exists.`);
    else {
      await createUser(db, { email: adminEmail, name: process.env.ADMIN_NAME?.trim() || "Administrator", role: "admin", password: adminPassword });
      console.log(`Deploy setup: created admin ${adminEmail}. You can remove ADMIN_PASSWORD from the environment now.`);
    }
  }

  if (process.env.SEED_DEMO === "1") {
    console.warn(`Deploy setup: SEED_DEMO=1 → demo accounts *@${DEMO_DOMAIN} with a shared public password. Throwaway deployments only.`);
    const r = await seedDemo(db, { log: (s) => console.log(s) });
    console.log(r.created ? `Deploy setup: demo class ready (join code ${r.joinCode}).` : "Deploy setup: demo data already present.");
  }
  await closeDb();
  console.log("Deploy setup: done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
