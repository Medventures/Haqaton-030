-- Additive storage for the current parent-only UI. Legacy case/curator tables are unchanged.
begin;

create table public.parent_ai_routes (
  parent_id uuid primary key references auth.users(id) on delete cascade,
  status text not null check (status in ('generating', 'ready', 'failed')),
  generation_id uuid not null,
  lease_until timestamptz not null,
  last_attempt_at timestamptz not null default now(),
  attempt_day date not null default (now() at time zone 'UTC')::date,
  daily_attempts integer not null default 1 check (daily_attempts between 1 and 20),
  source_answers_json jsonb not null,
  generated_for_answers_json jsonb,
  plan_json jsonb,
  error_code text,
  updated_at timestamptz not null default now(),
  constraint parent_route_source_object check (jsonb_typeof(source_answers_json) = 'object'),
  constraint parent_route_json check (plan_json is null or coalesce(
    jsonb_typeof(plan_json) = 'object'
    and plan_json ->> 'schema_version' = 'parent-route-1'
    and plan_json ->> 'source' = 'openai'
    and jsonb_typeof(plan_json -> 'steps') = 'array'
    and jsonb_array_length(plan_json -> 'steps') > 0, false)),
  constraint parent_route_ready check (status <> 'ready' or (plan_json is not null and generated_for_answers_json is not null))
);
alter table public.parent_ai_routes enable row level security;
revoke all on public.parent_ai_routes from anon, authenticated;
grant select on public.parent_ai_routes to authenticated;
grant all on public.parent_ai_routes to service_role;
create policy "parent routes: read own" on public.parent_ai_routes
  for select to authenticated using ((select auth.uid()) = parent_id);

-- Only the server may claim a generation, after validating a real user token.
create function public.claim_parent_route(p_parent_id uuid, p_answers jsonb, p_regenerate boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  interview public.interview_sessions%rowtype;
  current_route public.parent_ai_routes%rowtype;
  new_id uuid := gen_random_uuid();
  today date := (now() at time zone 'UTC')::date;
begin
  -- Also serializes simultaneous first-time claims for the same user.
  select * into interview from public.interview_sessions where parent_id = p_parent_id for update;
  if not found or interview.status <> 'completed' then
    raise exception 'interview_incomplete' using errcode = 'P0001';
  end if;
  if interview.answers_json is distinct from p_answers then
    raise exception 'interview_changed' using errcode = 'P0001';
  end if;
  select * into current_route from public.parent_ai_routes where parent_id = p_parent_id for update;
  if found then
    if current_route.status = 'generating' and current_route.lease_until > now() then
      return jsonb_build_object('claim', 'busy');
    end if;
    if not p_regenerate and current_route.status = 'ready'
       and current_route.generated_for_answers_json = p_answers then
      return jsonb_build_object('claim', 'cached');
    end if;
    if current_route.last_attempt_at > now() - interval '1 minute' then
      raise exception 'generation_rate_limit' using errcode = 'P0001';
    end if;
    if current_route.attempt_day = today and current_route.daily_attempts >= 20 then
      raise exception 'generation_rate_limit' using errcode = 'P0001';
    end if;
  end if;
  insert into public.parent_ai_routes(parent_id, status, generation_id, lease_until, source_answers_json)
  values (p_parent_id, 'generating', new_id, now() + interval '2 minutes', p_answers)
  on conflict (parent_id) do update set
    status = 'generating', generation_id = new_id, lease_until = now() + interval '2 minutes',
    source_answers_json = p_answers, error_code = null, last_attempt_at = now(), updated_at = now(),
    attempt_day = today,
    daily_attempts = case when parent_ai_routes.attempt_day = today then parent_ai_routes.daily_attempts + 1 else 1 end;
  return jsonb_build_object('claim', 'acquired', 'generation_id', new_id);
end;
$$;

create function public.finish_parent_route(p_parent_id uuid, p_generation_id uuid, p_plan jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  interview public.interview_sessions%rowtype;
  current_route public.parent_ai_routes%rowtype;
begin
  select * into interview from public.interview_sessions where parent_id = p_parent_id for update;
  select * into current_route from public.parent_ai_routes where parent_id = p_parent_id for update;
  if not found or current_route.generation_id <> p_generation_id
     or current_route.status <> 'generating' or current_route.lease_until <= now() then
    raise exception 'generation_conflict' using errcode = 'P0001';
  end if;
  if interview.status is distinct from 'completed'
     or interview.answers_json is distinct from current_route.source_answers_json then
    raise exception 'interview_changed' using errcode = 'P0001';
  end if;
  update public.parent_ai_routes set status = 'ready', plan_json = p_plan,
    generated_for_answers_json = source_answers_json, error_code = null, updated_at = now()
    where parent_id = p_parent_id;
end;
$$;

create function public.fail_parent_route(p_parent_id uuid, p_generation_id uuid, p_code text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.parent_ai_routes set status = 'failed', error_code = p_code, updated_at = now()
  where parent_id = p_parent_id and generation_id = p_generation_id and status = 'generating';
end;
$$;

revoke all on function public.claim_parent_route(uuid, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.finish_parent_route(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.fail_parent_route(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.claim_parent_route(uuid, jsonb, boolean) to service_role;
grant execute on function public.finish_parent_route(uuid, uuid, jsonb) to service_role;
grant execute on function public.fail_parent_route(uuid, uuid, text) to service_role;
commit;
