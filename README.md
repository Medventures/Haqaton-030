# AqylRoute AI

Next.js demo with real Supabase Auth for two roles: parent and curator. Plan: [PLAN.md](PLAN.md). Hosting: Vercel ([ADR](.archcore/nextjs-vercel-mvp.adr.md)).

## Requirements

- Node.js 22 or newer
- pnpm 10.22 (`corepack enable` picks the version from `package.json`)
- `psql` to apply migrations

## Setup

1. Copy `.env.example` to `.env.local` and fill it in. Only `NEXT_PUBLIC_*` values reach the browser. `SUPABASE_SECRET_KEY`, `POSTGRES_URL_NON_POOLING`, `OPENAI_API_KEY` and `CRON_SECRET` are server-only. Never commit `.env.local`.
2. Apply migrations in order:

   ```bash
   set -a; source .env.local; set +a
   for f in supabase/migrations/*.sql; do psql "$POSTGRES_URL_NON_POOLING" -v ON_ERROR_STOP=1 -f "$f"; done
   ```

3. Run `pnpm install`, then `pnpm seed:demo` and `pnpm seed:catalog`. The first creates or updates two confirmed demo users and assigns their roles; the second publishes the service catalog from `src/domain/catalog/v1.ts` (idempotent; a published version is immutable, so a change needs a new `catalog_version`).
4. Run `pnpm dev` and open `http://localhost:3000/login`.
5. Checks: `pnpm test` (domain rules, no network), `pnpm typecheck`, `pnpm lint`.

## Configuration

| Variable | Required | Without it |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes | `/login` shows that sign-in is unavailable |
| `APP_URL` | Yes | Server links and origin checks fail |
| `SUPABASE_SECRET_KEY` | For seeding and privileged operations | `pnpm seed:demo` stops with an error |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | For new plan generation | Saved routes work; generation reports it is unavailable |
| `DEMO_ENABLED`, `DEMO_CURATOR_EMAIL` | For creating cases | Case creation fails with a configuration error |
| `CRON_SECRET` | For the job recovery endpoint | The endpoint rejects calls |

The server logs missing variables once at start (`[config] ...`).

## Demo accounts

The login form has these synthetic demo credentials prefilled:

| Role | Email | Password |
| --- | --- | --- |
| Parent | `parent@aqylroute.demo` | `DemoParent2026!` |
| Curator | `curator@aqylroute.demo` | `DemoCurator2026!` |

Supabase Auth checks the password. The page reads the role from `profiles` on the server. A user cannot open the other role's page; the page redirects to their own. The form's role choice does not grant access.

These shared credentials are only for a synthetic demo. Do not use these accounts or passwords with real family or medical data.
