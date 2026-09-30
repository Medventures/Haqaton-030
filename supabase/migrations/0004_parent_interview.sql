-- The current UI has one signed-in user type: the parent.
-- Keep profiles.role because cases and their role-check trigger from 0003 depend on it.

drop policy if exists "interview_sessions: insert own parent" on public.interview_sessions;
drop policy if exists "interview_sessions: update own parent" on public.interview_sessions;

create policy "interview_sessions: insert own" on public.interview_sessions
  for insert with check ((select auth.uid()) = parent_id);

create policy "interview_sessions: update own" on public.interview_sessions
  for update using ((select auth.uid()) = parent_id)
  with check ((select auth.uid()) = parent_id);

alter table public.interview_sessions drop column if exists plan_status;
