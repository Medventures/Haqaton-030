create table public.interview_sessions (
  parent_id uuid primary key references public.profiles (id) on delete cascade,
  answers_json jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'completed')),
  plan_status text check (plan_status is null or plan_status = 'pending_curator'),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint interview_answers_object check (jsonb_typeof(answers_json) = 'object')
);

alter table public.interview_sessions enable row level security;

create policy "interview_sessions: read own" on public.interview_sessions
  for select using ((select auth.uid()) = parent_id);

-- Ownership is enforced by RLS for browser and server requests.
create policy "interview_sessions: insert own parent" on public.interview_sessions
  for insert with check (
    (select auth.uid()) = parent_id
    and exists (select 1 from public.profiles where id = parent_id and role = 'parent')
  );

create policy "interview_sessions: update own parent" on public.interview_sessions
  for update using (
    (select auth.uid()) = parent_id
    and exists (select 1 from public.profiles where id = parent_id and role = 'parent')
  ) with check ((select auth.uid()) = parent_id);
