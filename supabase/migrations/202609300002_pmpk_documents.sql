-- PMPK document intake: private original in Storage, model extraction, parent confirmation.
-- All writes except the browser's own upload go through service_role RPCs; users can only read their row.
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pmpk-documents', 'pmpk-documents', false, 10485760, array['application/pdf', 'image/png', 'image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = 10485760,
  allowed_mime_types = array['application/pdf', 'image/png', 'image/jpeg'];

create table public.pmpk_documents (
  id uuid primary key default gen_random_uuid(),
  -- One document per parent in the MVP.
  parent_id uuid not null unique references auth.users(id) on delete cascade,
  status text not null check (status in ('pending_upload', 'parsing', 'needs_review', 'confirmed', 'failed')),
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('application/pdf', 'image/png', 'image/jpeg')),
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  sha256 text,
  consent_version text not null,
  consent_at timestamptz not null default now(),
  -- Processing revision: incremented by every claim; confirm must present the one the parent reviewed.
  revision integer not null default 0,
  generation_id uuid,
  lease_until timestamptz,
  last_attempt_at timestamptz,
  extracted_json jsonb,
  confirmed_json jsonb,
  model text,
  schema_version text,
  processed_at timestamptz,
  processing_ms integer,
  error_code text,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pmpk_path_owner check (storage_path = parent_id::text || '/' || id::text),
  constraint pmpk_extracted_object check (extracted_json is null or jsonb_typeof(extracted_json) = 'object'),
  constraint pmpk_confirmed_object check (confirmed_json is null or jsonb_typeof(confirmed_json) = 'object'),
  constraint pmpk_review_has_result check (status not in ('needs_review', 'confirmed') or extracted_json is not null),
  constraint pmpk_confirmed_has_fields check (status <> 'confirmed' or (confirmed_json is not null and confirmed_at is not null))
);
alter table public.pmpk_documents enable row level security;
revoke all on public.pmpk_documents from anon, authenticated;
grant select on public.pmpk_documents to authenticated;
grant all on public.pmpk_documents to service_role;
create policy "pmpk documents: read own" on public.pmpk_documents
  for select to authenticated using ((select auth.uid()) = parent_id);

-- Daily parse budget per parent. Survives deleting a document so delete + re-upload cannot reset it.
create table public.pmpk_parse_quota (
  parent_id uuid primary key references auth.users(id) on delete cascade,
  quota_day date not null,
  attempts integer not null check (attempts >= 0)
);
alter table public.pmpk_parse_quota enable row level security;
revoke all on public.pmpk_parse_quota from anon, authenticated;
grant all on public.pmpk_parse_quota to service_role;

-- Objects whose Storage deletion is still owed. Storage and Postgres cannot share a transaction,
-- so the database records the debt first and the server pays it, retrying until the row is gone.
create table public.storage_deletion_queue (
  path text primary key,
  parent_id uuid not null,
  queued_at timestamptz not null default now()
);
alter table public.storage_deletion_queue enable row level security;
revoke all on public.storage_deletion_queue from anon, authenticated;
grant all on public.storage_deletion_queue to service_role;

-- Browser uploads use the user's session. The row must exist and still await its file,
-- so an upload that outlives a reset or deletion is refused.
create policy "pmpk objects: upload own pending" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'pmpk-documents' and exists (
      select 1 from public.pmpk_documents d
      where d.parent_id = (select auth.uid()) and d.storage_path = storage.objects.name and d.status = 'pending_upload'));
create policy "pmpk objects: read own" on storage.objects
  for select to authenticated using (
    bucket_id = 'pmpk-documents' and exists (
      select 1 from public.pmpk_documents d
      where d.parent_id = (select auth.uid()) and d.storage_path = storage.objects.name));

-- Facts the parent has confirmed through documents. Keep in sync with factsFromDocument() in src/domain/pmpk.ts.
create function public.parent_facts(p_parent_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('pmpk_conclusion_confirmed', exists (
    select 1 from public.pmpk_documents d
    where d.parent_id = p_parent_id and d.status = 'confirmed'
      and d.confirmed_json ->> 'document_type' = 'PMPK_CONCLUSION'));
$$;

create function public.claim_pmpk_parse(p_parent_id uuid, p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  doc public.pmpk_documents%rowtype;
  quota public.pmpk_parse_quota%rowtype;
  today date := (now() at time zone 'UTC')::date;
  new_id uuid := gen_random_uuid();
begin
  select * into doc from public.pmpk_documents where id = p_id and parent_id = p_parent_id for update;
  if not found then raise exception 'document_not_found' using errcode = 'P0001'; end if;
  if doc.status = 'parsing' and doc.lease_until > now() then return jsonb_build_object('claim', 'busy'); end if;
  if doc.status in ('needs_review', 'confirmed') then return jsonb_build_object('claim', 'done'); end if;
  if doc.last_attempt_at is not null and doc.last_attempt_at > now() - interval '30 seconds' then
    raise exception 'parse_rate_limit' using errcode = 'P0001';
  end if;
  select * into quota from public.pmpk_parse_quota where parent_id = p_parent_id for update;
  if found and quota.quota_day = today and quota.attempts >= 10 then
    raise exception 'parse_rate_limit' using errcode = 'P0001';
  end if;
  insert into public.pmpk_parse_quota(parent_id, quota_day, attempts) values (p_parent_id, today, 1)
  on conflict (parent_id) do update set quota_day = today,
    attempts = case when public.pmpk_parse_quota.quota_day = today then public.pmpk_parse_quota.attempts + 1 else 1 end;
  update public.pmpk_documents set status = 'parsing', generation_id = new_id, revision = revision + 1,
    lease_until = now() + interval '150 seconds', last_attempt_at = now(), error_code = null, updated_at = now()
    where id = p_id;
  return jsonb_build_object('claim', 'acquired', 'generation_id', new_id, 'revision', doc.revision + 1,
    'storage_path', doc.storage_path, 'mime_type', doc.mime_type, 'size_bytes', doc.size_bytes);
end;
$$;

-- A late model answer must find the same document, generation and a live lease; otherwise it is dropped.
create function public.finish_pmpk_parse(p_parent_id uuid, p_id uuid, p_generation_id uuid, p_extracted jsonb, p_meta jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare doc public.pmpk_documents%rowtype;
begin
  select * into doc from public.pmpk_documents where id = p_id and parent_id = p_parent_id for update;
  if not found or doc.generation_id is distinct from p_generation_id
     or doc.status <> 'parsing' or doc.lease_until <= now() then
    raise exception 'generation_conflict' using errcode = 'P0001';
  end if;
  update public.pmpk_documents set status = 'needs_review', extracted_json = p_extracted, confirmed_json = null,
    confirmed_at = null, model = p_meta ->> 'model', schema_version = p_meta ->> 'schema_version',
    sha256 = p_meta ->> 'sha256', processing_ms = (p_meta ->> 'processing_ms')::integer,
    processed_at = now(), error_code = null, updated_at = now()
    where id = p_id;
end;
$$;

create function public.fail_pmpk_parse(p_parent_id uuid, p_id uuid, p_generation_id uuid, p_code text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.pmpk_documents set status = 'failed', error_code = p_code, updated_at = now()
  where id = p_id and parent_id = p_parent_id and generation_id = p_generation_id and status = 'parsing';
end;
$$;

create function public.confirm_pmpk_document(p_parent_id uuid, p_id uuid, p_revision integer, p_confirmed jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare doc public.pmpk_documents%rowtype;
begin
  select * into doc from public.pmpk_documents where id = p_id and parent_id = p_parent_id for update;
  if not found then raise exception 'document_not_found' using errcode = 'P0001'; end if;
  if doc.status not in ('needs_review', 'confirmed') then raise exception 'document_state_conflict' using errcode = 'P0001'; end if;
  if doc.revision <> p_revision then raise exception 'revision_conflict' using errcode = 'P0001'; end if;
  update public.pmpk_documents set status = 'confirmed', confirmed_json = p_confirmed,
    confirmed_at = now(), updated_at = now() where id = p_id;
end;
$$;

-- Deleting a document or resetting the account records the Storage debt in the same transaction.
create function public.delete_pmpk_document(p_parent_id uuid, p_id uuid)
returns text[] language plpgsql security definer set search_path = '' as $$
declare removed text;
begin
  delete from public.pmpk_documents where id = p_id and parent_id = p_parent_id returning storage_path into removed;
  if not found then raise exception 'document_not_found' using errcode = 'P0001'; end if;
  insert into public.storage_deletion_queue(path, parent_id) values (removed, p_parent_id) on conflict do nothing;
  return array(select path from public.storage_deletion_queue where parent_id = p_parent_id);
end;
$$;

create function public.reset_parent_data(p_parent_id uuid)
returns text[] language plpgsql security definer set search_path = '' as $$
begin
  insert into public.storage_deletion_queue(path, parent_id)
    select storage_path, parent_id from public.pmpk_documents where parent_id = p_parent_id
    on conflict do nothing;
  delete from public.pmpk_documents where parent_id = p_parent_id;
  -- The route row holds copies of the answers, so it goes too.
  delete from public.parent_ai_routes where parent_id = p_parent_id;
  update public.interview_sessions set answers_json = '{}'::jsonb, status = 'draft',
    completed_at = null, updated_at = now() where parent_id = p_parent_id;
  return array(select path from public.storage_deletion_queue where parent_id = p_parent_id);
end;
$$;

-- The route now depends on confirmed facts as well as on the interview answers.
alter table public.parent_ai_routes
  add column source_facts_json jsonb not null default '{"pmpk_conclusion_confirmed": false}'::jsonb,
  add column generated_for_facts_json jsonb;
update public.parent_ai_routes set generated_for_facts_json = '{"pmpk_conclusion_confirmed": false}'::jsonb
  where status = 'ready';
alter table public.parent_ai_routes add constraint parent_route_ready_facts
  check (status <> 'ready' or generated_for_facts_json is not null);

create or replace function public.claim_parent_route(p_parent_id uuid, p_answers jsonb, p_regenerate boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  interview public.interview_sessions%rowtype;
  current_route public.parent_ai_routes%rowtype;
  new_id uuid := gen_random_uuid();
  today date := (now() at time zone 'UTC')::date;
  facts jsonb := public.parent_facts(p_parent_id);
begin
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
       and current_route.generated_for_answers_json = p_answers
       and current_route.generated_for_facts_json = facts then
      return jsonb_build_object('claim', 'cached');
    end if;
    if current_route.last_attempt_at > now() - interval '1 minute' then
      raise exception 'generation_rate_limit' using errcode = 'P0001';
    end if;
    if current_route.attempt_day = today and current_route.daily_attempts >= 20 then
      raise exception 'generation_rate_limit' using errcode = 'P0001';
    end if;
  end if;
  insert into public.parent_ai_routes(parent_id, status, generation_id, lease_until, source_answers_json, source_facts_json)
  values (p_parent_id, 'generating', new_id, now() + interval '2 minutes', p_answers, facts)
  on conflict (parent_id) do update set
    status = 'generating', generation_id = new_id, lease_until = now() + interval '2 minutes',
    source_answers_json = p_answers, source_facts_json = facts, error_code = null, last_attempt_at = now(), updated_at = now(),
    attempt_day = today,
    daily_attempts = case when parent_ai_routes.attempt_day = today then parent_ai_routes.daily_attempts + 1 else 1 end;
  return jsonb_build_object('claim', 'acquired', 'generation_id', new_id, 'facts', facts);
end;
$$;

create or replace function public.finish_parent_route(p_parent_id uuid, p_generation_id uuid, p_plan jsonb)
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
  if public.parent_facts(p_parent_id) is distinct from current_route.source_facts_json then
    raise exception 'facts_changed' using errcode = 'P0001';
  end if;
  update public.parent_ai_routes set status = 'ready', plan_json = p_plan,
    generated_for_answers_json = source_answers_json, generated_for_facts_json = source_facts_json,
    error_code = null, updated_at = now()
    where parent_id = p_parent_id;
end;
$$;

revoke all on function public.parent_facts(uuid) from public, anon, authenticated;
revoke all on function public.claim_pmpk_parse(uuid, uuid) from public, anon, authenticated;
revoke all on function public.finish_pmpk_parse(uuid, uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.fail_pmpk_parse(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.confirm_pmpk_document(uuid, uuid, integer, jsonb) from public, anon, authenticated;
revoke all on function public.delete_pmpk_document(uuid, uuid) from public, anon, authenticated;
revoke all on function public.reset_parent_data(uuid) from public, anon, authenticated;
grant execute on function public.parent_facts(uuid) to service_role;
grant execute on function public.claim_pmpk_parse(uuid, uuid) to service_role;
grant execute on function public.finish_pmpk_parse(uuid, uuid, uuid, jsonb, jsonb) to service_role;
grant execute on function public.fail_pmpk_parse(uuid, uuid, uuid, text) to service_role;
grant execute on function public.confirm_pmpk_document(uuid, uuid, integer, jsonb) to service_role;
grant execute on function public.delete_pmpk_document(uuid, uuid) to service_role;
grant execute on function public.reset_parent_data(uuid) to service_role;
commit;
