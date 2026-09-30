-- DATA-04 (PLAN.md): cases, service catalog, case plans, events, notifications, generation jobs.
-- RLS is enabled on every new table with no policies yet: nothing is readable through the Data API
-- until AUTH-02 adds explicit policies. Server code with the secret key is the only writer for now.

-- updated_at maintenance shared by several tables.
create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Cases -----------------------------------------------------------------------------------------

create table public.cases (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.profiles (id) on delete cascade,
  -- Assigned by the server on creation (CasePlan spec clause 31); never taken from the client.
  curator_id uuid not null references public.profiles (id),
  workflow_state text not null default 'interview_in_progress' check (workflow_state in (
    'interview_in_progress', 'generating', 'generation_failed', 'pending_curator', 'returned_for_revision', 'approved'
  )),
  -- The only source of eligibility flags; set by a curator (spec "Surface").
  confirmed_facts_json jsonb not null default '{}'::jsonb,
  is_synthetic boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cases_facts_object check (jsonb_typeof(confirmed_facts_json) = 'object'),
  constraint cases_facts_known check (confirmed_facts_json - array[
    'pmpk_conclusion_confirmed', 'mse_referral_confirmed', 'home_schooling_vkk_confirmed', 'social_services_eligibility_confirmed'
  ] = '{}'::jsonb)
);

create index cases_parent_idx on public.cases (parent_id);
create index cases_curator_idx on public.cases (curator_id);

create trigger cases_touch before update on public.cases
  for each row execute function public.touch_updated_at();

-- parent_id must be a parent and curator_id a curator; roles live in profiles, so a check constraint cannot see them.
create function public.enforce_case_roles()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles where id = new.parent_id and role = 'parent') then
    raise exception 'cases.parent_id must reference a parent profile' using errcode = '23514';
  end if;
  if not exists (select 1 from public.profiles where id = new.curator_id and role = 'curator') then
    raise exception 'cases.curator_id must reference a curator profile' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger cases_roles before insert or update of parent_id, curator_id on public.cases
  for each row execute function public.enforce_case_roles();

alter table public.cases enable row level security;

-- Interview sessions: additive changes only. The current interview screen still keys rows by parent_id;
-- stage 4 moves it to case_id and the in_progress/completed states, then drops plan_status.

alter table public.interview_sessions
  add column case_id uuid references public.cases (id) on delete cascade,
  add column revision integer not null default 0 check (revision >= 0),
  add column question_bank_version text,
  add column question_history_json jsonb not null default '[]'::jsonb
    constraint interview_history_array check (jsonb_typeof(question_history_json) = 'array');

create unique index interview_sessions_case_idx on public.interview_sessions (case_id) where case_id is not null;

-- Service catalog ------------------------------------------------------------------------------

create table public.service_catalog_versions (
  catalog_version text primary key,
  effective_from date not null,
  effective_to date,
  published_at timestamptz not null default now(),
  constraint catalog_version_period check (effective_to is null or effective_to > effective_from)
);

create table public.service_catalog (
  action_id text not null check (action_id ~ '^[A-Z][A-Z0-9_]{2,60}$'),
  catalog_version text not null references public.service_catalog_versions (catalog_version),
  definition_json jsonb not null,
  created_at timestamptz not null default now(),
  primary key (action_id, catalog_version),
  constraint catalog_definition_object check (jsonb_typeof(definition_json) = 'object'),
  constraint catalog_definition_id check (definition_json ->> 'action_id' = action_id)
);

-- A published definition never changes: plans pin the version they were built from.
create function public.forbid_catalog_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'published catalog rows are immutable; publish a new catalog_version' using errcode = '42501';
end;
$$;

create trigger service_catalog_immutable before update or delete on public.service_catalog
  for each row execute function public.forbid_catalog_change();

alter table public.service_catalog_versions enable row level security;
alter table public.service_catalog enable row level security;

-- Case plans -----------------------------------------------------------------------------------

create table public.case_plans (
  id uuid primary key default gen_random_uuid(),
  -- One current plan per case (PLAN.md DATA-04).
  case_id uuid not null unique references public.cases (id) on delete cascade,
  plan_json jsonb not null,
  schema_version text not null,
  catalog_version text not null references public.service_catalog_versions (catalog_version),
  plan_status text not null check (plan_status in ('pending_curator', 'approved', 'returned_for_revision', 'closed')),
  revision integer not null default 1 check (revision > 0),
  approved_at timestamptz,
  approved_by uuid references public.profiles (id),
  approved_revision integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plan_json_object check (jsonb_typeof(plan_json) = 'object'),
  constraint plan_no_diagnosis check (not (plan_json ? 'diagnosis')),
  -- Searchable columns and the canonical JSON must agree; one DB operation writes both.
  constraint plan_columns_match_json check (
    plan_json ->> 'schema_version' = schema_version
    and plan_json ->> 'catalog_version' = catalog_version
    and plan_json ->> 'plan_status' = plan_status
    and plan_json ->> 'case_id' = case_id::text
  ),
  constraint plan_approval_complete check (
    (approved_at is null and approved_by is null and approved_revision is null)
    or (approved_at is not null and approved_by is not null and approved_revision between 1 and revision)
  ),
  constraint plan_approved_has_approval check (plan_status <> 'approved' or approved_at is not null)
);

create trigger case_plans_touch before update on public.case_plans
  for each row execute function public.touch_updated_at();

-- The original approval record is never rewritten; later execution changes only raise the revision.
create function public.keep_plan_approval()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.approved_at is not null and (
    new.approved_at is distinct from old.approved_at
    or new.approved_by is distinct from old.approved_by
    or new.approved_revision is distinct from old.approved_revision
  ) then
    raise exception 'plan approval is immutable' using errcode = '42501';
  end if;
  if new.revision < old.revision then
    raise exception 'plan revision cannot decrease' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger case_plans_keep_approval before update on public.case_plans
  for each row execute function public.keep_plan_approval();

alter table public.case_plans enable row level security;

-- Case events: append-only history --------------------------------------------------------------

create table public.case_events (
  id bigint generated always as identity primary key,
  case_id uuid not null references public.cases (id) on delete cascade,
  plan_id uuid references public.case_plans (id) on delete set null,
  -- Set by the server from the session; null only for system jobs.
  actor_id uuid references public.profiles (id),
  event_type text not null check (event_type in (
    'case_created', 'interview_completed', 'generation_queued', 'generation_succeeded', 'generation_failed',
    'plan_edited', 'plan_returned', 'plan_approved', 'step_status_changed', 'fact_confirmed',
    'step_overdue', 'notification_created'
  )),
  -- Events with rationale, draft snapshots or internal comments are curator-only.
  visibility text not null default 'curator' check (visibility in ('curator', 'family')),
  payload_json jsonb not null default '{}'::jsonb check (jsonb_typeof(payload_json) = 'object'),
  created_at timestamptz not null default now()
);

create index case_events_case_idx on public.case_events (case_id, created_at);

-- Updates are never allowed. Deletes only through an explicit demo reset (DEMO-04), which sets aqyl.demo_reset.
create function public.forbid_event_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and current_setting('aqyl.demo_reset', true) = 'on' then
    return old;
  end if;
  raise exception 'case_events is append-only' using errcode = '42501';
end;
$$;

create trigger case_events_append_only before update or delete on public.case_events
  for each row execute function public.forbid_event_change();

alter table public.case_events enable row level security;

-- Notifications --------------------------------------------------------------------------------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  step_id text not null,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  -- Case, step, recipient and the version of the deadline basis: a rerun never duplicates.
  event_key text not null,
  type text not null check (type in ('step_overdue')),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  resolved_at timestamptz,
  constraint notifications_once unique (event_key, recipient_id)
);

create index notifications_unread_idx on public.notifications (recipient_id, created_at) where read_at is null;

alter table public.notifications enable row level security;

-- Generation jobs ------------------------------------------------------------------------------

create table public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  -- Answers revision pinned at creation: later edits never change a running generation.
  interview_revision integer not null check (interview_revision >= 0),
  base_plan_revision integer check (base_plan_revision > 0),
  -- Client operation key: a repeated request returns the same job.
  request_key text not null unique,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed')),
  attempts integer not null default 0 check (attempts between 0 and 5),
  -- The worker that holds the lease is the only one allowed to save a result.
  lease_token uuid,
  lease_until timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint generation_lease_pair check ((lease_token is null) = (lease_until is null)),
  constraint generation_finished check ((status in ('succeeded', 'failed')) = (finished_at is not null)),
  constraint generation_error check (status = 'failed' or error_code is null)
);

-- At most one active generation per case.
create unique index generation_jobs_active_idx on public.generation_jobs (case_id) where status in ('queued', 'running');
create index generation_jobs_lease_idx on public.generation_jobs (status, lease_until);

alter table public.generation_jobs enable row level security;
