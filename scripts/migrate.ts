import { runMigrations } from "../src/db/migrate";

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) {
    console.error("Set DATABASE_URL (or DATABASE_URL_UNPOOLED) before running migrations.");
    process.exit(1);
  }
  await runMigrations(url);
  console.log("Migrations applied.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
