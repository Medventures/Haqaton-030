# AqylRoute AI

Next.js 16 demo for a parent. The dashboard shows a vertical route and a visual agent workflow. [Current plan](PLAN.md).

## Setup

1. Use Node.js 22+ and pnpm 10.22.
2. Copy `.env.example` to `.env.local`. Add Supabase values. OpenAI variables can be kept for the next stage. Keep server keys private.
3. Apply SQL files in `supabase/migrations` in order to a new database. For an existing database with `0001` and `0002`, apply `0003_cases_plans_catalog.sql`, then `0004_parent_interview.sql`.
4. Run `pnpm install`, then `pnpm seed:demo`. Run `pnpm seed:catalog` to load the service catalog used by the new case-plan domain.
5. Run `pnpm dev` and open `http://localhost:3000/login`.
6. Check the merged code with `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build`.

## Demo account

The login form is prefilled with `parent@aqylroute.demo` / `DemoParent2026!`. Supabase Auth checks the password. Use only synthetic data.

## Agent demo

The left panel shows the parent's timeline. The right panel shows example agent steps: reviewing context, finding a program, comparing places, and checking times. The parent can choose a time. That choice updates the timeline in the current browser session. Programs, centers, dates, and the confirmation are synthetic. No search, booking, or OpenAI request runs in this demo. `OPENAI_API_KEY` and `OPENAI_MODEL` remain in the server configuration for the next stage.

## Database change

`0003_cases_plans_catalog.sql` adds the case-plan tables and a versioned service catalog. `0004_parent_interview.sql` removes the old `plan_status` placeholder from the interview table and updates interview ownership policies. It keeps `profiles.role` because the new case-plan schema uses that field. The current UI still shows only the parent flow.
