import { closeDb, getDb } from "../src/db/client";
import { DEMO_DOMAIN, DEMO_PASSWORD, seedDemo } from "../src/db/seed/demo";
import { ensureOfficialCurriculum, seedSampleQuestions } from "../src/db/seed/official";

async function main() {
  const db = getDb();
  const cur = await ensureOfficialCurriculum(db);
  console.log(
    cur.action === "kept"
      ? "A curriculum is already active; kept it."
      : `${cur.action === "created" ? "Loaded" : "Activated"} the 2027 Level I curriculum (10 topics, 102 modules).`,
  );
  const added = await seedSampleQuestions(db, cur.versionId);
  if (added) console.log(`Added ${added} sample questions (source = "sample").`);

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
