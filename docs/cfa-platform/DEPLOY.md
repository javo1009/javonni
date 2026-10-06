# Deploying Ascent to Vercel with Neon Postgres

This guide takes Ascent from a GitHub repository to a production deployment on [Vercel](https://vercel.com/docs) with a managed [Neon](https://neon.com/docs) Postgres database. Vercel and Neon change their dashboards often, so the steps describe what to do rather than every button. When a screen looks different, the linked docs are the reference.

**You'll need:** the GitHub repository, a Vercel account, Node.js 22 and this repository checked out locally (migrations and the first admin are created from your machine).

---

## 1. How the pieces fit

| Piece | Where it runs | Notes |
|---|---|---|
| Next.js app (pages, Server Actions, `/api/health`) | Vercel Functions (Node.js runtime) | Built with `npm run build`. No custom server. |
| Postgres | Neon | The app connects with the **pooled** URL (`DATABASE_URL`). The driver uses `prepare: false`, which pooled connections require. |
| Migrations, seed, first admin, CLI imports | Your machine | Run with the **direct (unpooled)** URL. They are deliberately *not* run during the Vercel build. |

Environment variables the app reads:

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | Pooled Postgres URL used by the app at runtime. |
| `DATABASE_URL_UNPOOLED` | For scripts | Direct URL. `db:migrate`, `user:create` and `import:curriculum` prefer it when set. |
| `SESSION_SECRET` | Yes | 32+ random characters for signing session cookies. Different per environment. |
| `NEXT_PUBLIC_DEMO_MODE` | No | `1` shows demo logins on the sign-in page. **Never set it in Production.** Inlined at build time. |
| `DB_POOL_MAX` | No | Connections per function instance (default 5 in production). |

---

## 2. Create the Vercel project

1. In Vercel, add a new project and **import the GitHub repository** ([docs](https://vercel.com/docs/getting-started-with-vercel/import)). Vercel detects Next.js; keep the default build command (`npm run build`), install command and output settings.
2. Don't worry if the first deployment fails because variables are missing. You'll add them next and redeploy.

## 3. Add Neon through the Vercel Marketplace

1. From the project, add the **Neon** integration from the Vercel Marketplace (Storage / Marketplace in the dashboard) and create a database, choosing a region close to your Vercel Functions region ([Vercel docs](https://vercel.com/docs/storage), [Neon docs](https://neon.com/docs/guides/vercel-overview)).
2. Connect the database to the project. The integration injects connection variables into the project, including **`DATABASE_URL`** (pooled) and **`DATABASE_URL_UNPOOLED`** (direct), plus some others Ascent doesn't use.
3. Check in Project Settings → Environment Variables that `DATABASE_URL` exists for the environments you expect (see section 9 about Preview).

> Tip: keep Vercel Functions and Neon in the same region. Every page makes several queries, so cross-region latency adds up. The function region is a project setting ([docs](https://vercel.com/docs/functions/configuring-functions/region)).

## 4. Set `SESSION_SECRET`

Generate a secret and add it as an environment variable for **Production**:

```bash
openssl rand -base64 32
```

Use a **different** value for Preview (and for local development). Changing the secret signs everyone out, which is also the way to revoke all sessions at once. See [Vercel environment variables](https://vercel.com/docs/environment-variables).

Leave `NEXT_PUBLIC_DEMO_MODE` **unset** in Production.

## 5. Run migrations from your machine

Get the **direct (unpooled)** connection string for the production database from the Neon console (or from the `DATABASE_URL_UNPOOLED` value Vercel shows). Then, in your local checkout, load it into the current shell without writing it to disk or shell history:

```bash
read -rs PROD_DB_URL            # paste the unpooled URL, press Enter (nothing is echoed)
export DATABASE_URL_UNPOOLED="$PROD_DB_URL" DATABASE_URL="$PROD_DB_URL"

npm ci
npm run db:migrate              # applies drizzle/*.sql; safe to re-run
```

Variables exported in the shell take precedence over anything in `.env.local`. Keep this terminal for the next two steps, and close it when you're done.

(If you use the [Vercel CLI](https://vercel.com/docs/cli/env), `vercel env pull` can download a project's variables into a local file instead. Be careful which environment you pull, and don't commit the file.)

## 6. Load the curriculum

You have two options.

**Recommended for real use: import the official outline.** Prepare the CSV as described in the README ("Importing the official curriculum"), then:

```bash
npm run import:curriculum -- outline-2027.csv --dry-run      # validate and preview
npm run import:curriculum -- outline-2027.csv --activate --name "CFA Level I 2027" --year 2027 --note "Official topic outline, downloaded YYYY-MM-DD"
```

You can also do this later in the browser (Admin → Curriculum).

**To get started quickly: load the labelled sample.**

```bash
npm run db:seed                 # sample curriculum + sample questions, only if none is active
```

The sample is clearly marked in the UI, and every page shows a banner while it's active. Replace it with the official outline before real students rely on it. The sample's questions stay linked to the sample objectives, so after you activate the official outline the coverage report starts from zero questions until you add your own.

**Never run `npm run db:seed -- --demo` against production.** It creates accounts that share a published password.

## 7. Create the first admin

```bash
npm run user:create -- you@academy.example "Your Name" admin
# prompts twice for a password (at least 10 characters, not echoed)
```

Sign in at `https://<your-domain>/login`. From Admin → Users you can create teacher accounts. Students register themselves with a class join code from their teacher.

## 8. Redeploy and verify

1. Trigger a redeploy so the build picks up the variables (Deployments → Redeploy, or push a commit).
2. Check the health endpoint:

   ```bash
   curl -s https://<your-domain>/api/health
   # {"ok":true,"db":"up","latencyMs":12}
   ```

   A `503` with `"db":"down"` means the app can't reach the database: check `DATABASE_URL` for that environment and the Vercel function logs (the error is logged there, never returned to the caller). The endpoint is public, never cached and reveals nothing else, so it suits an uptime monitor.
3. Sign in as the admin. The overview page warns you if the active curriculum is the sample.
4. Before inviting students, add rate limiting to sign-in and registration. Ascent has none built in; a [Vercel Firewall](https://vercel.com/docs/vercel-firewall) rate-limit rule on `/login` and `/register` (their Server Actions POST to those paths) is the quickest option.

---

## 9. Environments and preview deployments

Vercel has three environment scopes: **Production**, **Preview** (every non-production branch or pull request) and **Development** (used by `vercel dev` / `vercel env pull`). Each variable is set per scope ([docs](https://vercel.com/docs/environment-variables)).

- **Don't point Preview at the production database.** Preview deployments run unreviewed branches with full write access to whatever `DATABASE_URL` they get. Give the Preview scope its own database. Either use a separate Neon branch or database and set Preview's `DATABASE_URL` to it, or use the Neon integration's option to create a database branch per preview deployment if your integration offers it ([Neon docs](https://neon.com/docs/guides/vercel-overview)).
- **Migrations aren't automatic anywhere.** A Neon branch starts as a copy of its parent, so it has the parent's schema. If a pull request adds a migration, apply it to that preview database yourself (`DATABASE_URL_UNPOOLED=<preview url> npm run db:migrate`) before testing.
- **Use a separate `SESSION_SECRET` for Preview**, so a preview cookie can never be accepted by production.
- **Demo previews:** for a throwaway preview that should show demo accounts, use a database you can delete, run `npm run db:seed -- --demo` against it, and set `NEXT_PUBLIC_DEMO_MODE=1` for that scope only (a branch-specific Preview variable works well). `NEXT_PUBLIC_*` values are baked in at build time, so redeploy after changing it.

## 10. Releasing changes

1. CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests and a build on every push and pull request. Keep it green.
2. If a release includes a migration, run `npm run db:migrate` against production **before** the new code goes live. Write migrations so the previous release keeps working with the new schema (add columns before using them; drop them a release later).
3. Merge to the production branch; Vercel builds and deploys it.
4. Check `/api/health`.

Rollback: Vercel can instantly roll back to a previous deployment ([docs](https://vercel.com/docs/instant-rollback)). Migrations are forward-only, which is another reason to keep them backwards-compatible.

## 11. Operations checklist

- [ ] `SESSION_SECRET` set, 32+ characters, different per environment.
- [ ] `NEXT_PUBLIC_DEMO_MODE` unset in Production; no `@ascent.demo` accounts in the production database.
- [ ] Preview uses its own database.
- [ ] Official curriculum imported and active; sample no longer active.
- [ ] First admin created; demo or test accounts removed or disabled.
- [ ] Rate limiting on `/login` and `/register`.
- [ ] Uptime monitor on `/api/health`.
- [ ] Neon backups / point-in-time restore window checked on your plan, and a restore tried once ([Neon docs](https://neon.com/docs)).
- [ ] Licensing of objective text and use of CFA Institute marks checked (PLAN.md §7.4).

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Every page errors right after deploy | `DATABASE_URL` or `SESSION_SECRET` missing in that environment, or migrations not run. Check `/api/health` and the function logs. |
| "No active curriculum" | Run `npm run db:seed` or import a curriculum (step 6). |
| Signed out after a deploy | `SESSION_SECRET` changed. Expected. |
| Large CSV import fails in the browser | Uploads are capped at about 900 KB (Server Action bodies are limited to 1 MB by default). Use `npm run import:curriculum` or split the file. |
| `prepared statement ... does not exist` errors | A tool other than the app is using the pooled URL with prepared statements. Use `DATABASE_URL_UNPOOLED` for scripts and tools. |
