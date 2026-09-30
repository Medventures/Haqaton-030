# AqylRoute AI

Next.js 16 demo for a parent. The dashboard shows a vertical route and a visual agent workflow. [Current plan](PLAN.md).

## Setup

1. Use Node.js 22+ and pnpm 10.22.
2. Copy `.env.example` to `.env.local`. Add Supabase and OpenAI values. Keep server keys private. Next.js does not override variables that are already set in your shell: if your shell exports another `OPENAI_API_KEY`, unset it before `pnpm dev`.
3. Apply SQL files in `supabase/migrations` in order to a new database. For an existing database with `0001` and `0002`, apply `0003_cases_plans_catalog.sql`, `0004_parent_interview.sql`, then the three `202609300001…3` files (routes, PMPK documents, route inputs).
4. Run `pnpm install`, then `pnpm seed:demo`. Run `pnpm seed:catalog` to load the service catalog used by the new case-plan domain.
5. Run `pnpm dev` and open `http://localhost:3000/`.
6. Check the merged code with `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build`.

## Demo account

The login form is prefilled with `parent@aqylroute.demo` / `DemoParent2026!`. Supabase Auth checks the password. Use only synthetic data.

## Agent demo

The left panel shows the parent's timeline. The right panel shows the agent feed. The PMPK step is real: the parent uploads a PDF, PNG or JPEG, OpenAI reads it, and the parent checks, corrects and confirms the fields. The file is kept in a private Supabase bucket; "Сбросить" deletes the answers, the document and the file. After confirmation the agent finds a KPPK, books a time and builds a weekly schedule. These later steps are synthetic and live only in the current browser tab. API: [docs/api.md](docs/api.md).

## Database change

`0003_cases_plans_catalog.sql` adds the case-plan tables and a versioned service catalog. `0004_parent_interview.sql` removes the old `plan_status` placeholder from the interview table and updates interview ownership policies. It keeps `profiles.role` because the new case-plan schema uses that field. The current UI still shows only the parent flow.
