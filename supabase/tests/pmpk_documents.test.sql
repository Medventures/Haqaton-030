begin;
insert into auth.users(id) values ('20000000-0000-4000-8000-000000000001'), ('20000000-0000-4000-8000-000000000002');
insert into public.interview_sessions(parent_id, status, answers_json)
values ('20000000-0000-4000-8000-000000000001', 'completed', '{"version":1}'),
       ('20000000-0000-4000-8000-000000000002', 'completed', '{"version":2}');
insert into public.pmpk_documents(id, parent_id, status, storage_path, mime_type, size_bytes, consent_version)
values ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'pending_upload',
        '20000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001', 'application/pdf', 1000, 'v1');

-- Only the owner's own folder name is accepted as a storage path.
do $$ begin
  begin
    insert into public.pmpk_documents(parent_id, status, storage_path, mime_type, size_bytes, consent_version)
    values ('20000000-0000-4000-8000-000000000002', 'pending_upload', 'someone-else/file', 'image/png', 10, 'v1');
    raise exception 'foreign storage path accepted';
  exception when check_violation then null;
  end;
end; $$;

set local role service_role;
do $$
declare
  owner uuid := '20000000-0000-4000-8000-000000000001';
  doc uuid := '30000000-0000-4000-8000-000000000001';
  claim jsonb;
  token uuid;
  extracted jsonb := '{"document_type":"PMPK_CONCLUSION"}';
  meta jsonb := '{"model":"test","schema_version":"v1","sha256":"abc","processing_ms":10}';
begin
  claim := public.claim_pmpk_parse(owner, doc);
  if claim ->> 'claim' <> 'acquired' or (claim ->> 'revision')::int <> 1 then raise exception 'claim failed'; end if;
  token := (claim ->> 'generation_id')::uuid;
  if public.claim_pmpk_parse(owner, doc) ->> 'claim' <> 'busy' then raise exception 'parallel parse was not blocked'; end if;
  begin
    perform public.claim_pmpk_parse('20000000-0000-4000-8000-000000000002', doc);
    raise exception 'foreign parent claimed the document';
  exception when raise_exception then
    if sqlerrm <> 'document_not_found' then raise; end if;
  end;
  begin
    perform public.finish_pmpk_parse(owner, doc, gen_random_uuid(), extracted, meta);
    raise exception 'wrong generation accepted';
  exception when raise_exception then
    if sqlerrm <> 'generation_conflict' then raise; end if;
  end;
  perform public.finish_pmpk_parse(owner, doc, token, extracted, meta);
  if (select status from public.pmpk_documents where id = doc) <> 'needs_review' then raise exception 'not in review'; end if;
  if public.claim_pmpk_parse(owner, doc) ->> 'claim' <> 'done' then raise exception 'reviewed document was claimed again'; end if;
  if (public.parent_facts(owner) ->> 'pmpk_conclusion_confirmed')::boolean then raise exception 'unconfirmed document became a fact'; end if;
  begin
    perform public.confirm_pmpk_document(owner, doc, 99, '{"document_type":"PMPK_CONCLUSION"}');
    raise exception 'stale revision confirmed';
  exception when raise_exception then
    if sqlerrm <> 'revision_conflict' then raise; end if;
  end;
end;
$$;
reset role;

-- Confirming changes the facts, so a route generated before it is stale and is not reused.
insert into public.parent_ai_routes(parent_id, status, generation_id, lease_until, source_answers_json,
  generated_for_answers_json, plan_json, generated_for_facts_json, last_attempt_at)
values ('20000000-0000-4000-8000-000000000001', 'ready', gen_random_uuid(), now(), '{"version":1}', '{"version":1}',
  '{"schema_version":"parent-route-1","source":"openai","steps":[{}]}', '{"pmpk_conclusion_confirmed": false, "pmpk": null}', now() - interval '3 minutes');
set local role service_role;
do $$
declare
  owner uuid := '20000000-0000-4000-8000-000000000001';
  claim jsonb;
begin
  if public.claim_parent_route(owner, '{"version":1}', false) ->> 'claim' <> 'cached' then raise exception 'route not cached'; end if;
end;
$$;
reset role;
update public.parent_ai_routes set last_attempt_at = now() - interval '3 minutes';
set local role service_role;
do $$
declare
  owner uuid := '20000000-0000-4000-8000-000000000001';
  doc uuid := '30000000-0000-4000-8000-000000000001';
  claim jsonb;
begin
  perform public.confirm_pmpk_document(owner, doc, 1, '{"document_type":"PMPK_CONCLUSION","issued_on":"2026-04-24"}');
  if not (public.parent_facts(owner) ->> 'pmpk_conclusion_confirmed')::boolean then raise exception 'confirmed conclusion is not a fact'; end if;
  claim := public.claim_parent_route(owner, '{"version":1}', false);
  if claim ->> 'claim' <> 'acquired' then raise exception 'stale route was reused'; end if;
  if not (claim -> 'facts' ->> 'pmpk_conclusion_confirmed')::boolean then raise exception 'facts not returned to the server'; end if;
  -- The parent removes the confirmed document while the model is still working.
  perform public.delete_pmpk_document(owner, doc);
  begin
    perform public.finish_parent_route(owner, (claim ->> 'generation_id')::uuid,
      '{"schema_version":"parent-route-1","source":"openai","steps":[{}]}');
    raise exception 'route built on a removed document was saved';
  exception when raise_exception then
    if sqlerrm <> 'facts_changed' then raise; end if;
  end;
  if not exists (select 1 from public.storage_deletion_queue where path = owner::text || '/' || doc::text) then
    raise exception 'storage deletion was not queued';
  end if;
end;
$$;
reset role;
delete from public.storage_deletion_queue;

-- Reset while the model is working: the late answer must not bring anything back.
insert into public.pmpk_documents(id, parent_id, status, storage_path, mime_type, size_bytes, consent_version)
values ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', 'pending_upload',
        '20000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000003', 'image/png', 1000, 'v1');
set local role service_role;
do $$
declare
  owner uuid := '20000000-0000-4000-8000-000000000001';
  doc uuid := '30000000-0000-4000-8000-000000000003';
  claim jsonb;
  paths text[];
begin
  claim := public.claim_pmpk_parse(owner, doc);
  paths := public.reset_parent_data(owner);
  if paths <> array[owner::text || '/' || doc::text] then raise exception 'reset returned wrong paths: %', paths; end if;
  begin
    perform public.finish_pmpk_parse(owner, doc, (claim ->> 'generation_id')::uuid, '{"document_type":"PMPK_CONCLUSION"}', '{}');
    raise exception 'late model answer restored a reset document';
  exception when raise_exception then
    if sqlerrm <> 'generation_conflict' then raise; end if;
  end;
end;
$$;
reset role;
do $$
declare owner uuid := '20000000-0000-4000-8000-000000000001';
begin
  if exists (select 1 from public.pmpk_documents where parent_id = owner) then raise exception 'document survived reset'; end if;
  if exists (select 1 from public.parent_ai_routes where parent_id = owner) then raise exception 'route survived reset'; end if;
  if (select answers_json from public.interview_sessions where parent_id = owner) <> '{}'::jsonb
     or (select status from public.interview_sessions where parent_id = owner) <> 'draft' then
    raise exception 'interview was not reset';
  end if;
end;
$$;

-- Row-level security and the upload policy.
insert into public.pmpk_documents(id, parent_id, status, storage_path, mime_type, size_bytes, consent_version)
values ('30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', 'pending_upload',
        '20000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000004', 'image/jpeg', 1000, 'v1');
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', true);
do $$ begin
  if exists (select 1 from public.pmpk_documents) then raise exception 'foreign document exposed'; end if;
  begin
    perform public.claim_pmpk_parse('20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000004');
    raise exception 'user can invoke privileged RPC';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into storage.objects(bucket_id, name)
    values ('pmpk-documents', '20000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000004');
    raise exception 'foreign user uploaded to someone else''s document';
  exception when insufficient_privilege then null;
  end;
end; $$;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);
do $$ begin
  if (select count(*) from public.pmpk_documents) <> 1 then raise exception 'own document not visible'; end if;
  begin
    update public.pmpk_documents set status = 'confirmed';
    raise exception 'user can write document directly';
  exception when insufficient_privilege then null;
  end;
  insert into storage.objects(bucket_id, name)
  values ('pmpk-documents', '20000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000004');
  begin
    insert into storage.objects(bucket_id, name) values ('pmpk-documents', '20000000-0000-4000-8000-000000000001/unregistered');
    raise exception 'upload without a registered document accepted';
  exception when insufficient_privilege then null;
  end;
end; $$;
reset role;
update public.pmpk_documents set status = 'parsing' where id = '30000000-0000-4000-8000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);
do $$ begin
  begin
    insert into storage.objects(bucket_id, name)
    values ('pmpk-documents', '20000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000004');
    raise exception 'upload accepted after parsing started';
  exception when insufficient_privilege then null;
  end;
end; $$;
reset role;
rollback;
