# Ascent

Ascent is a study tracker for CFA® Level I candidates and the teachers who prepare them. Students track all 102 modules of the 2027 curriculum, their study hours and mock exams against a plan, and see at a glance whether they are ahead or behind. Teachers see how every student is pacing and send **homework as files**: upload a worksheet, students download it, complete it and upload their work, and the teacher marks it and sends feedback back.

CFA® and Chartered Financial Analyst® are trademarks of CFA Institute. Ascent is not affiliated with or endorsed by CFA Institute. The curriculum data is the public module list (topic and module titles, exam-weight ranges). The bundled practice questions are original. See [`docs/cfa-platform/TRACKER-CONCEPT.md`](docs/cfa-platform/TRACKER-CONCEPT.md) for the design and the study features.

## Features

**Students**
- Overview: hours this week vs target, chapters read, time to exam, study pace (ahead / on pace / behind), today's focus topic, the topic roadmap and next actions.
- All chapters: 102 modules with Read / Practice / Reviewed ticks, practice score and confidence rating, filters and search.
- Study hours (log + focus timer + streaks), mock exams (trend and deadlines), practice questions, backup export/import (compatible with the original sample dashboard).
- Study-smarter features: spaced-review queue, finish forecast, streaks, confidence calibration, exam-weighted coverage, focus timer, mock deadlines, weak-chapter practice.
- Homework: download the handout, upload completed files, answer questions, hand in, see marks and feedback files.

**Teachers**
- Classes with join codes; class exam date, plan start and weekly target.
- Class overview: KPIs, who needs attention (inactive, behind on hours or roadmap, missed homework, mock drop, low scores), sortable student table with CSV export, class progress by topic.
- Student view: the student's full tracker (read-only), alerts and homework history.
- Homework builder with file handouts, file-upload / written / multiple-choice items, due-date control; submissions queue, marking with per-item feedback and returned feedback files, CSV export.
- Question bank browser.

**Admins**
- Overview and storage use, user management (create, disable, reset password), curriculum view, question coverage and CSV import/export.

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
   npm run db:seed              # 2027 curriculum (102 modules) + sample questions
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
| `npm run db:seed [-- --demo]` | Loads the 2027 curriculum and sample questions; `--demo` adds demo accounts and activity. **Never use `--demo` on a production database.** |
| `npm run user:create -- <email> <name> <role>` | Creates a user. Password from `ASCENT_NEW_PASSWORD` or a hidden prompt; at least 10 characters. |

All scripts load `.env.local` when it exists.

## Curriculum and questions

The 2027 Level I curriculum (10 topics, 102 modules, exam-weight ranges, study-week allocation) ships in `src/db/seed/official-2027.json` and is loaded by the seed and by deploy setup. A database that still holds the v1 sample curriculum has it replaced. More practice questions are added by CSV in Admin → Question coverage (template and export included).

## Homework files

Handouts, student uploads and feedback files are stored in Postgres (`bytea`): 4 MB per file, PDF / Word / Excel / PowerPoint / CSV / text / PNG / JPG (checked by content, not just extension), 5 per upload slot, 100 MB per user. Downloads go through `/api/files/<id>`, which checks who is asking and always serves an attachment.

## Architecture

- **Next.js 16 App Router, React 19, Tailwind 4, TypeScript.** Server Components render pages; mutations are Server Actions in `src/app/actions/*`.
- **Domain engines are pure** (`src/domain/*`): the tracker (roadmap, pace, review queue, forecast, calibration), alerts, backup format and the question CSV parser. No framework or database imports, fully unit-tested.
- **Services enforce authorization** (`src/services/*`): every function takes the authenticated `Actor` and checks role and ownership (a teacher sees only students in their own classes; admin functions refuse non-admins). They throw `ForbiddenError` / `NotFoundError` / `ValidationError`, which `runAction` turns into form messages.
- **Data access layer** (`src/server/dal.ts`, `context.ts`): reads the signed session cookie, then re-loads the user from the database on every request (disabled users lose access immediately). `src/proxy.ts` does only optimistic redirects from the cookie; it is not a security boundary.
- **Database:** Postgres via Drizzle ORM and the `postgres` driver (`src/db/*`), with `prepare: false` so pooled (PgBouncer-style) URLs work. Schema in `src/db/schema.ts`, SQL migrations in `drizzle/`. The curriculum is written atomically by `src/db/curriculum-writer.ts`.
- **Health check:** `GET /api/health` returns `{ ok, db, latencyMs }` after a `select 1` with a 3-second timeout; 503 when the database is unreachable. It reveals nothing else.

## Testing

```bash
npm test                 # everything (unit + integration)
npm run test:e2e         # Playwright, against a running app with the demo seed (see playwright.config.ts)
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

Import the repository in Vercel, connect a Neon Postgres database (Storage), set `SESSION_SECRET` (plus `ADMIN_EMAIL`/`ADMIN_PASSWORD` for the first admin) and deploy. The `vercel-build` script runs migrations and loads the 2027 curriculum automatically before `next build`; no local tools are needed. Step-by-step: [`docs/cfa-platform/DEPLOY.md`](docs/cfa-platform/DEPLOY.md).

## Known limitations

- Practice questions are a small original set; add more in Admin → Question coverage.
- Resetting a password does not sign out existing sessions (sessions are stateless 7-day tokens), and there is no self-service password change, password reset email or email verification.
- No rate limiting yet (see Security notes).
- Homework files live in the database; for larger files move storage to an object store (only `src/services/files.ts` touches the bytes).
- Upgrading from v1 drops the old plan / learning-objective tables; v1 progress is not carried over.
