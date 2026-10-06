# Deploying Ascent to Vercel (with Neon Postgres)

Vercel and Neon change their dashboards often. These steps say what to do; when a screen looks different, the linked docs are the reference: [Vercel docs](https://vercel.com/docs), [Neon docs](https://neon.com/docs).

**No local tools are needed.** On Vercel the build runs `npm run vercel-build`, which first runs `scripts/deploy-setup.ts` and then `next build`. Deploy setup:

1. applies database migrations;
2. loads the labelled **sample curriculum** if no curriculum is active;
3. creates the first admin from `ADMIN_EMAIL` / `ADMIN_PASSWORD`, if set and that user doesn't exist yet;
4. loads the demo class, only when `SEED_DEMO=1`.

Every step is safe to repeat on each deploy. If the database or `SESSION_SECRET` is missing, the build stops with a message saying what to add.

---

## 1. Get the code onto the production branch

Vercel deploys a repository's **default branch** (usually `main`) to Production; other branches become Preview deployments. Merge the work into `main`, or change the project's Production Branch in Settings → Git ([docs](https://vercel.com/docs/deployments/git)).

## 2. Import the repository

Projects → **Add New → Project** (or **Import Project**) → pick the GitHub repository ([docs](https://vercel.com/docs/getting-started-with-vercel/import)). Vercel detects Next.js. Keep the default settings. If the first build fails because the database isn't connected yet, that's expected; continue.

## 3. Create and connect the database

In the project: **Storage → Create Database → Neon (Postgres)**, choose a region close to your functions, and connect it to the project for Production (and Preview if you want previews to work) ([Vercel Storage](https://vercel.com/docs/storage), [Neon on Vercel](https://neon.com/docs/guides/vercel-overview)).

The integration adds connection variables to the project. Ascent reads `DATABASE_URL` (or `POSTGRES_URL`) for the app and `DATABASE_URL_UNPOOLED` (or `POSTGRES_URL_NON_POOLING`) for migrations. Check under **Settings → Environment Variables** that at least one of each pair exists.

> Keep Vercel Functions and the database in the same region: each page makes several queries ([function region docs](https://vercel.com/docs/functions/configuring-functions/region)).

## 4. Add environment variables

Settings → Environment Variables ([docs](https://vercel.com/docs/environment-variables)):

| Variable | Value | Notes |
|---|---|---|
| `SESSION_SECRET` | 32+ random characters, e.g. from `openssl rand -base64 32` or a password manager | **Required.** Use a different value for Preview. Changing it signs everyone out. |
| `ADMIN_EMAIL` | your email | Creates the first admin on the next deploy. |
| `ADMIN_PASSWORD` | 12+ characters | Remove it after the admin exists (the build log says when). |
| `ADMIN_NAME` | optional | Display name for that admin. |
| `SEED_DEMO` | `1` | **Optional, demo only.** Creates a teacher and 8 students who share the public password `ascent-demo-2027`. Never on a real deployment. |
| `NEXT_PUBLIC_DEMO_MODE` | `1` | **Optional, demo only.** Shows the demo logins on the sign-in page. |

## 5. Deploy and verify

Deployments → **Redeploy** the latest deployment (environment-variable changes need a new build).

1. In the build log you should see `Deploy setup: applying migrations…` and `Deploy setup: done.`
2. Open `https://<your-project>.vercel.app/api/health`. Expect `{"ok":true,"db":"up",…}`.
3. Sign in with the admin account. Then:
   - **Admin → Users:** create teacher accounts.
   - **Teacher → Classes:** create a class and share its join code or link with students.
   - **Admin → Curriculum:** when you have the official 2027 Level I outline, import it as CSV. The bundled curriculum is a labelled sample, not the official learning outcomes.

## 6. Preview deployments

Every push to another branch gets a Preview deployment, which runs deploy setup against whatever database the Preview environment points to. If Preview shares the production database, preview builds also apply migrations to it. To keep them apart, connect a separate database (or Neon branch) to Preview, or set `SKIP_DB_SETUP=1` for Preview.

## 7. Releasing changes

Merging to the production branch deploys automatically. Migrations are generated in development (`npm run db:generate`), committed in `drizzle/`, and applied by deploy setup on the next deploy. Write migrations so the previous app version keeps working while the new one rolls out: add columns first, remove later.

## 8. Before going public

- Add rate limiting on sign-in and registration, e.g. a [Vercel Firewall](https://vercel.com/docs/vercel-firewall) rule for `/login` and `/register`.
- Make sure `SEED_DEMO` and `NEXT_PUBLIC_DEMO_MODE` are **not** set in Production, and that no `@ascent.demo` accounts exist there.
- Check CFA Institute's terms before displaying official learning outcome text or using the CFA® marks.

## Optional: run scripts from your machine

You can run the same steps locally against any database, using the direct (unpooled) connection string:

```bash
read -rs DATABASE_URL_UNPOOLED && export DATABASE_URL_UNPOOLED DATABASE_URL="$DATABASE_URL_UNPOOLED"
npm run db:migrate
npm run db:seed                                        # sample curriculum (add -- --demo for the demo class)
npm run user:create -- you@example.com "Your Name" admin
npm run import:curriculum -- outline.csv --activate     # official outline as CSV
```

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Build fails with "DATABASE_URL is not set" | Database not connected to this environment (step 3). |
| Build fails with "SESSION_SECRET must be set" | Add it for this environment (step 4), then redeploy. |
| `/api/health` returns 503 | Database unreachable. Check the connection variables and the function logs. |
| Signed out after a deploy | `SESSION_SECRET` changed. Expected. |
| Large CSV import fails in the browser | Uploads are capped at about 900 KB. Use `npm run import:curriculum` or split the file. |
| `prepared statement ... does not exist` | A tool other than the app is using the pooled URL with prepared statements. Use the unpooled URL for tools. |
