// Import a curriculum CSV as a new version (same format and checks as Admin > Curriculum).
//
//   npm run import:curriculum -- outline-2027.csv                     # import, not active
//   npm run import:curriculum -- outline-2027.csv --activate          # import and make active
//   npm run import:curriculum -- outline-2027.csv --dry-run           # check and diff only
//   options: --name "CFA Level I 2027"  --year 2027  --note "Source PDF, downloaded 2026-10-06"
import { readFileSync } from "node:fs";
import path from "node:path";
import { closeDb, getDb } from "../src/db/client";
import { diffCurricula, draftStats, parseCurriculumCsv } from "../src/domain/curriculum-csv";
import { curriculumShape, importCurriculumFromCli } from "../src/services/admin";
import { getActiveCurriculum } from "../src/services/curriculum";

function usage(msg?: string): never {
  if (msg) console.error(`Error: ${msg}\n`);
  console.error(
    [
      "Usage: npm run import:curriculum -- <file.csv> [--activate] [--dry-run] [--name <name>] [--year <year>] [--note <text>]",
      "",
      "  --activate   make the new version active (new plans use it; existing plans keep theirs)",
      "  --dry-run    validate and show the diff against the active version, write nothing",
      "",
      "Uses DATABASE_URL_UNPOOLED if set, otherwise DATABASE_URL (.env.local is loaded if present).",
    ].join("\n"),
  );
  process.exit(1);
}

function parseArgs(argv: string[]) {
  const out = { file: "", activate: false, dryRun: false, name: "", year: NaN, note: "" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) usage(`${a} needs a value.`);
      return v;
    };
    if (a === "--activate") out.activate = true;
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--name") out.name = value();
    else if (a === "--year") out.year = Number.parseInt(value(), 10);
    else if (a === "--note") out.note = value();
    else if (a === "--help" || a === "-h") usage();
    else if (a.startsWith("--")) usage(`Unknown option ${a}.`);
    else if (!out.file) out.file = a;
    else usage(`Unexpected argument "${a}".`);
  }
  if (!out.file) usage();
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let text: string;
  try {
    text = readFileSync(args.file, "utf8");
  } catch {
    usage(`Can't read ${args.file}.`);
  }
  const year = Number.isFinite(args.year) ? args.year : 2027;
  const name = args.name || `CFA Level I ${year} (${path.basename(args.file)})`;

  const { draft, errors, warnings } = parseCurriculumCsv(text, { name, year });
  const stats = draftStats(draft);
  console.log(`${args.file}: ${stats.topics} topics, ${stats.modules} modules, ${stats.los} objectives.`);
  for (const w of warnings) console.warn(`  warning ${w.row === 0 ? "(file)" : `row ${w.row}`}: ${w.message}`);
  for (const e of errors) console.error(`  ERROR ${e.row === 0 ? "(file)" : `row ${e.row}`}: ${e.message}`);
  if (errors.length > 0) {
    console.error(`\n${errors.length} error(s). Nothing was imported.`);
    process.exit(1);
  }

  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) usage("Set DATABASE_URL (or DATABASE_URL_UNPOOLED).");
  const db = getDb(url);
  try {
    let active = null;
    try {
      active = await getActiveCurriculum(db);
    } catch {
      // no active version yet
    }
    if (active) {
      const d = diffCurricula(curriculumShape(active), draft);
      console.log(
        `Compared with the active version "${active.version.name}": ${d.addedLos.length} added, ${d.removedLos.length} removed, ` +
          `${d.rewordedLos.length} reworded, ${d.movedLos.length} moved, ${d.unchangedLos} unchanged objectives; ` +
          `${d.addedTopics.length + d.removedTopics.length + d.topicChanges.length} topic change(s).`,
      );
    } else {
      console.log("There is no active version yet.");
    }
    if (args.dryRun) {
      console.log("Dry run: nothing was written.");
      return;
    }
    const r = await importCurriculumFromCli(db, text, { name, year, sourceNote: args.note || null, activate: args.activate });
    console.log(`Imported "${name}" as version ${r.versionId}${r.activated ? " and made it active." : ". It is NOT active; activate it in Admin > Curriculum or re-run with --activate."}`);
  } finally {
    await closeDb();
  }
}

main().catch((e) => {
  console.error(e instanceof Error && e.name === "ValidationError" ? `Error: ${e.message}` : e);
  process.exit(1);
});
