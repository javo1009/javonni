// Create a user from the command line, e.g. the first admin of a fresh deployment.
//
//   npm run user:create -- admin@academy.example "Avery Admin" admin
//
// The password comes from ASCENT_NEW_PASSWORD, or is prompted for (twice, not echoed)
// when run in a terminal. It is never accepted as a command-line argument, so it
// doesn't end up in shell history or process listings.
import { closeDb, directDatabaseUrl, getDb } from "../src/db/client";
import { createUser } from "../src/services/users";
import type { Role } from "../src/services/types";

const ROLES: Role[] = ["student", "teacher", "admin"];
const MIN_LENGTH = 10;

function usage(msg?: string): never {
  if (msg) console.error(`Error: ${msg}\n`);
  console.error(
    [
      "Usage: npm run user:create -- <email> <name> <role>",
      "",
      "  role       one of: admin, teacher, student",
      "  password   set ASCENT_NEW_PASSWORD, or type it when prompted (needs a terminal)",
      "",
      "Uses DATABASE_URL_UNPOOLED if set, otherwise DATABASE_URL (.env.local is loaded if present).",
      'Example: npm run user:create -- admin@academy.example "Avery Admin" admin',
    ].join("\n"),
  );
  process.exit(1);
}

/** Read one line from the terminal without echoing it. */
function promptHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    process.stdout.write(question);
    let value = "";
    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
    };
    const onData = (buf: Buffer) => {
      for (const ch of buf.toString("utf8")) {
        if (ch === "\r" || ch === "\n" || ch === "\u0004") {
          process.stdout.write("\n");
          cleanup();
          resolve(value);
          return;
        }
        if (ch === "\u0003") {
          process.stdout.write("\n");
          cleanup();
          reject(new Error("Cancelled."));
          return;
        }
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else if (ch >= " ") value += ch;
      }
    };
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

async function readPassword(): Promise<string> {
  const fromEnv = process.env.ASCENT_NEW_PASSWORD;
  if (fromEnv !== undefined && fromEnv !== "") return fromEnv;
  if (!process.stdin.isTTY) usage("No terminal to prompt on. Set ASCENT_NEW_PASSWORD instead.");
  const first = await promptHidden(`Password (at least ${MIN_LENGTH} characters): `);
  if (first.length < MIN_LENGTH) return first; // reported by the length check below
  const second = await promptHidden("Repeat password: ");
  if (first !== second) {
    console.error("Error: the passwords don't match.");
    process.exit(1);
  }
  return first;
}

async function main() {
  const [email, name, role] = process.argv.slice(2);
  if (!email || !name || !role) usage();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) usage(`"${email}" is not a valid email address.`);
  if (name.trim().length < 2) usage("The name must be at least 2 characters.");
  if (!ROLES.includes(role as Role)) usage(`Unknown role "${role}".`);

  const password = await readPassword();
  if (password.length < MIN_LENGTH) {
    console.error(`Error: that password is too weak. Use at least ${MIN_LENGTH} characters (a short phrase works well).`);
    process.exit(1);
  }
  if (password.length > 200) {
    console.error("Error: that password is too long (200 characters max).");
    process.exit(1);
  }

  const url = directDatabaseUrl();
  if (!url) usage("Set DATABASE_URL (or DATABASE_URL_UNPOOLED).");
  const db = getDb(url);
  try {
    const user = await createUser(db, { email, name, role: role as Role, password });
    console.log(`Created ${user.role} ${user.email} (${user.name}).`);
  } finally {
    await closeDb();
  }
}

main().catch((e) => {
  console.error(e instanceof Error && e.name === "ValidationError" ? `Error: ${e.message}` : e);
  process.exit(1);
});
