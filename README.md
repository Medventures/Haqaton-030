# AqylRoute AI

Next.js demo with real Supabase Auth for two roles: parent and curator.

## Setup

1. Copy `.env.example` to `.env.local` and set the URL and publishable key from your Supabase project. For creating demo users, also set `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`. Never expose this key to the browser or commit the file.
2. Apply `supabase/migrations/0001_profiles_roles.sql` in the Supabase SQL Editor. This creates `profiles`, the two roles, a sign-up trigger, and a policy that lets users read only their own profile.
3. Run `pnpm install`, then `pnpm seed:demo`. The seed command creates or updates two confirmed demo users and assigns their roles.
4. Run `pnpm dev` and open `http://localhost:3000/login`.

The login form has these synthetic demo credentials prefilled:

| Role | Email | Password |
| --- | --- | --- |
| Parent | `parent@aqylroute.demo` | `DemoParent2026!` |
| Curator | `curator@aqylroute.demo` | `DemoCurator2026!` |

Supabase Auth checks the password. The page reads the role from `profiles` on the server. A user cannot open the other role's page; the page redirects to their own. The form's role choice does not grant access.

These shared credentials are only for a synthetic demo. Do not use these accounts or passwords with real family or medical data.
