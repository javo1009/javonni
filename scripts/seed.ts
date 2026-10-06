import { closeDb, getDb } from "../src/db/client";
import { seedSampleCurriculum } from "../src/db/seed/sample";

async function main() {
  const db = getDb();
  const sample = await seedSampleCurriculum(db);
  console.log(sample.created ? "Seeded sample curriculum (clearly labelled as demo data)." : "A curriculum is already active; skipped.");
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
