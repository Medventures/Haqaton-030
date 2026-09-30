# AqylRoute AI

Next.js 16 demo for a parent. The dashboard generates a preliminary route using OpenAI and saves it in Supabase. [Current plan](PLAN.md).

## Setup

1. Use Node.js 22+ and pnpm 10.22.
2. Copy `.env.example` to `.env.local`. Add Supabase values. Set OPENAI_API_KEY, OPENAI_MODEL, APP_URL and the server-only SUPABASE_SECRET_KEY. Keep server keys private.
3. Apply SQL files in `supabase/migrations` in order to a new database. For an existing database with `0001` and `0002`, apply `0003_cases_plans_catalog.sql`, then `0004_parent_interview.sql` and `202609300001_parent_ai_routes.sql`.
4. Run `pnpm install`, then `pnpm seed:demo`. Run `pnpm seed:catalog` to load the service catalog used by the new case-plan domain.
5. Run `pnpm dev` and open `http://localhost:3000/`.
6. Check the merged code with `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm test:route-db` (local PostgreSQL 16), and `pnpm build`.

## Demo account

The login form is prefilled with `parent@aqylroute.demo` / `DemoParent2026!`. Supabase Auth checks the password. Use only synthetic data.

## OpenAI route

Complete the interview and click «Создать маршрут». The server reads your saved answers, sends anonymized structured context to OpenAI, validates its selected actions against the service catalog, and saves the route in `parent_ai_routes`. Reloading the page restores it. Editing the interview makes the previous route stale. Explicit regeneration is limited to one attempt per minute and twenty per UTC day.

The API uses `GET /api/agent/route` and `POST /api/agent/route`. Website requests use Supabase cookies; API clients can use a Supabase Auth Bearer token. See [API examples](docs/api.md) and [OpenAPI](public/openapi.json). OpenAI and Supabase secret keys remain server-only.

The generated route is preliminary. This version does not search centers, reserve slots, or send applications. Deadlines are rules from the catalog; no confirmed appointment dates are invented.

## Database change

`0003_cases_plans_catalog.sql` adds the case-plan tables and a versioned service catalog. `0004_parent_interview.sql` removes the old `plan_status` placeholder from the interview table and updates interview ownership policies. It keeps `profiles.role` because the new case-plan schema uses that field. The current UI still shows only the parent flow.

`202609300001_parent_ai_routes.sql` adds parent-only generated routes and server-only claim/finish/fail operations. Apply it once; existing tables and accounts are preserved.

## Consolidated PMPK PR

This delivery consolidates only PR #4, #5 and #6: OpenAI route generation, PMPK document intake and its review fixes. Role/case API changes, the legacy CasePlan validation fix and the general workflow rules from PR #1–#3 are not included. The synthetic center/schedule example from main is preserved at `/parent/demo`; `/parent` uses the live OpenAI/PMPK flow.
