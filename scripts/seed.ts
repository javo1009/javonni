import { closeDb, getDb } from "../src/db/client";
import { DEMO_DOMAIN, DEMO_PASSWORD, seedDemo } from "../src/db/seed/demo";
import { seedSampleCurriculum } from "../src/db/seed/sample";

async function main() {
  const db = getDb();
  const sample = await seedSampleCurriculum(db);
  console.log(sample.created ? "Seeded sample curriculum (clearly labelled as demo data)." : "A curriculum is already active; skipped.");

  if (process.argv.includes("--demo")) {
    console.warn(
      `\n! Creating DEMO accounts (*@${DEMO_DOMAIN}) that all share the password "${DEMO_PASSWORD}".\n` +
        "  Only do this on a throwaway or demo database.\n",
    );
    const r = await seedDemo(db, { log: (s) => console.log(s) });
    if (r.created) console.log(`Demo class ready. Student join code: ${r.joinCode}`);
  }
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
