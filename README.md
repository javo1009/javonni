# Ascent

Ascent is a study-tracking platform for CFA® Level I candidates and the academies that teach them. Every learning objective is a trackable item. Each student gets a study plan built from their exam date and weekly availability, and an honest "on track / behind" signal. Teachers see who is falling behind and on what, send homework and grade it. Admins import and version the curriculum and see where the question bank has gaps.

> **Status: pre-release.** The app ships with a **sample curriculum** whose modules and objectives are illustrative, written for the demo. They are **not** the official CFA Institute learning outcome statements, and the topic weights are third-party reports that haven't been verified. Before real students use Ascent, an admin must import the official 2027 Level I outline (Admin → Curriculum). The app shows a banner whenever the sample is active.
>
> CFA® and Chartered Financial Analyst® are trademarks of CFA Institute. Ascent is not affiliated with or endorsed by CFA Institute. Check CFA Institute's terms for prep providers before displaying objective text or using its marks (see [`docs/cfa-platform/PLAN.md`](docs/cfa-platform/PLAN.md) §7.4).

## Features

**Students**
- Onboarding: exam date and weekly availability produce a day-by-day plan (learn → practice → mock phases).
- Today view: the tasks for today, time logging, and an on-track/behind assessment with recovery options when they slip.
- Curriculum map: every topic and objective with its status (not started → studied → practiced → proficient → review due).
- Practice by topic or objective, mastery tracking, and a readiness index.
- Homework inbox: assignments from their teacher, submit answers, see grades and feedback.

**Teachers**
- Classes with join codes (students self-register with the code).
- Cockpit: students who need attention, a students × topics heatmap, class KPIs.
- Student 360: plan adherence, hours, mastery and homework history for one student.
- Homework builder (auto-assemble questions from objectives, or hand-pick), targeting a class or chosen students, and a grading queue.

**Admins**
- Curriculum import from CSV with validation, row-numbered errors and a diff against the active version (added / removed / reworded / moved objectives, topic weight changes). Versions are immutable; activating a new one doesn't disturb existing student plans.
- Coverage report: published questions per objective against a minimum of 3, and whether each objective has a study task in active student plans. Gaps are flagged in text, not just colour.
- Staff accounts: create teachers or admins, disable and re-enable accounts. All admin changes go to an audit log.

## Quick start (local)

Requirements: Node.js 22, PostgreSQL 14+ (16 recommended).

1. **Postgres.** Create a role that can create databases (the test runner needs it) and a database:

   ```bash
   # with Docker
   docker run -d --name ascent-pg -p 5432:5432 -e POSTGRES_USER=ascent -e POSTGRES_PASSWORD=ascent -e POSTGRES_DB=ascent postgres:16

   # or with a local install
   createuser --createdb --pwprompt ascent   # password: ascent
   createdb -O ascent ascent
   ```

2. **Install and configure.**

   ```bash
   npm ci
   cp .env.example .env.local
   # set SESSION_SECRET to the output of: openssl rand -base64 32
   ```

3. **Create the schema and load data.**

   ```bash
   npm run db:migrate
   npm run db:seed              # sample curriculum + sample questions (clearly labelled)
   # or, for a local demo with accounts and activity:
   npm run db:seed -- --demo    # adds demo users (*@ascent.demo, shared password), a class and history
   ```

   The demo seed prints the shared password. Set `NEXT_PUBLIC_DEMO_MODE=1` in `.env.local` to show the demo logins on the sign-in page.

4. **Create your own admin** (skip if you only use the demo accounts):

   ```bash
   npm run user:create -- you@example.com "Your Name" admin   # prompts for a password
   ```

5. **Run it:** `npm run dev`, then open http://localhost:3000.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server. |
| `npm run build` / `npm start` | Production build and server. |
| `npm run lint` | ESLint. |
| `npm run typecheck` | Generates route types (`next typegen`) and runs `tsc`. |
| `npm test` | Vitest: unit tests plus integration tests against Postgres. |
| `npm run db:migrate` | Applies SQL migrations from `drizzle/`. Uses `DATABASE_URL_UNPOOLED` if set, else `DATABASE_URL`. |
| `npm run db:generate` | Generates a new migration after changing `src/db/schema.ts`. |
| `npm run db:seed [-- --demo]` | Loads the sample curriculum if none is active; `--demo` adds demo accounts and activity. **Never use `--demo` on a production database.** |
| `npm run user:create -- <email> <name> <role>` | Creates a user. Password from `ASCENT_NEW_PASSWORD` or a hidden prompt; at least 10 characters. |
| `npm run import:curriculum -- <file.csv> [--activate] [--dry-run] [--name ..] [--year ..] [--note ..]` | Imports a curriculum CSV as a new version, with the same validation as the admin page. |

All scripts load `.env.local` when it exists.

## Importing the official curriculum

1. Get the 2027 Level I topic outline from CFA Institute (the Level I exam page links to it).
2. Transcribe it into the CSV format: one row per objective with `topic_code, topic_name, weight_min, weight_max, module_title, est_minutes, los_code, command_word, los_text, importance` (optional `topic_difficulty`, `topic_spread`). Admin → Curriculum has a downloadable template and a column reference.
3. Decide whether you may display the verbatim objective text (licensing). If not, use the official codes with your own short paraphrases.
4. In Admin → Curriculum, paste or upload the file, press **Preview**, fix any errors (row numbers match your spreadsheet), review the diff, then **Import**, ticking "Make this the active version" when ready. Or use `npm run import:curriculum`.
5. Check Admin → Coverage: each objective needs at least 3 published questions.

Students who already have a plan keep the version it was built from. Plans created after activation use the new version.

## Architecture

- **Next.js 16 App Router, React 19, Tailwind 4, TypeScript.** Server Components render pages; mutations are Server Actions in `src/app/actions/*`.
- **Domain engines are pure** (`src/domain/*`): plan generation, mastery, readiness, alerts, assessment and the curriculum CSV parser/diff. No framework or database imports, fully unit-tested.
- **Services enforce authorization** (`src/services/*`): every function takes the authenticated `Actor` and checks role and ownership (a teacher sees only students in their own classes; admin functions refuse non-admins). They throw `ForbiddenError` / `NotFoundError` / `ValidationError`, which `runAction` turns into form messages.
- **Data access layer** (`src/server/dal.ts`, `context.ts`): reads the signed session cookie, then re-loads the user from the database on every request (disabled users lose access immediately). `src/proxy.ts` does only optimistic redirects from the cookie; it is not a security boundary.
- **Database:** Postgres via Drizzle ORM and the `postgres` driver (`src/db/*`), with `prepare: false` so pooled (PgBouncer-style) URLs work. Schema in `src/db/schema.ts`, SQL migrations in `drizzle/`. Curriculum versions are written atomically by `src/db/curriculum-writer.ts`.
- **Health check:** `GET /api/health` returns `{ ok, db, latencyMs }` after a `select 1` with a 3-second timeout; 503 when the database is unreachable. It reveals nothing else.

## Testing

```bash
npm test                 # everything
npx vitest run src/domain   # pure unit tests only (no database needed)
```

Integration tests (`*.int.test.ts`) need Postgres. The global setup creates and migrates a template database (`ascent_test` by default, override with `DATABASE_URL_TEST`); each test file then clones its own private database from it and drops it afterwards, so files run in parallel without interfering and the dev database is never touched. The database user needs `CREATEDB`.

CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests against a Postgres 16 service and a production build on every push and pull request.

## Security notes

- Passwords are hashed with scrypt (`node:crypto`, per-user salt, constant-time compare). Unknown emails take about as long as wrong passwords.
- Sessions are HS256-signed JWTs in an `httpOnly`, `SameSite=Lax` cookie (`Secure` in production), valid 7 days. `SESSION_SECRET` must be at least 32 characters; the app refuses to sign sessions otherwise.
- Every Server Action and service re-checks authorization; ids from forms are never trusted alone.
- **No rate limiting yet.** Before going public, protect the login and registration actions, e.g. with a [Vercel Firewall](https://vercel.com/docs/vercel-firewall) rate-limit rule on `/login` and `/register`, or an Upstash Redis limiter inside the login action.
- **Demo accounts must never exist in production.** They share a published password. Run `db:seed -- --demo` only against a throwaway database, and leave `NEXT_PUBLIC_DEMO_MODE` unset in production.
- Admin actions (imports, activations, account changes) are recorded in `audit_log`.

## Deploying

Import the repository in Vercel, connect a Neon Postgres database (Storage), set `SESSION_SECRET` (plus `ADMIN_EMAIL`/`ADMIN_PASSWORD` for the first admin) and deploy. The `vercel-build` script runs migrations and seeds the sample curriculum automatically before `next build`; no local tools are needed. Step-by-step: [`docs/cfa-platform/DEPLOY.md`](docs/cfa-platform/DEPLOY.md).

## Known limitations

- The bundled curriculum is a sample (see Status). The official outline must be imported.
- No question authoring UI yet: questions come from the seed. The coverage report shows gaps but can't yet link to "write a question for this objective". Flashcards and question bulk import aren't built.
- No rate limiting, password reset, email verification or self-service password change.
- No PDF import of the curriculum: CSV only.
- No Postgres row-level security; authorization lives in the service layer (covered by integration tests).
- Single academy (no multi-organization tenancy).
- English only.

## Documentation

- [`docs/cfa-platform/PLAN.md`](docs/cfa-platform/PLAN.md): product and technical plan, curriculum fact base and open questions.
- [`docs/cfa-platform/UX-DESIGN.md`](docs/cfa-platform/UX-DESIGN.md): design system and screens.
- [`docs/cfa-platform/DEPLOY.md`](docs/cfa-platform/DEPLOY.md): deployment.
