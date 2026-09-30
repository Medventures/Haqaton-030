-- What the confirmed conclusion says is part of the route inputs; any change invalidates routes built on it.
begin;
insert into auth.users(id) values ('40000000-0000-4000-8000-000000000001');
insert into public.interview_sessions(parent_id, status, answers_json)
values ('40000000-0000-4000-8000-000000000001', 'completed', '{"version":1}');
insert into public.pmpk_documents(id, parent_id, status, storage_path, mime_type, size_bytes, consent_version, revision, extracted_json)
values ('50000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'needs_review',
        '40000000-0000-4000-8000-000000000001/50000000-0000-4000-8000-000000000001', 'application/pdf', 1000, 'v1', 1, '{}');

set local role service_role;
do $$
declare
  owner uuid := '40000000-0000-4000-8000-000000000001';
  doc uuid := '50000000-0000-4000-8000-000000000001';
  plan jsonb := '{"schema_version":"parent-route-1","source":"openai","steps":[{}]}';
  other jsonb := '{"document_type":"PMPK_CONCLUSION","issued_on":"2026-04-24","next_route":"OTHER","specialists":["logoped"],"support_format":null}';
  kppk jsonb := '{"document_type":"PMPK_CONCLUSION","issued_on":"2026-04-24","next_route":"KPPK","specialists":["defectolog","logoped"],"support_format":"individual_development_program"}';
  inputs jsonb;
  claim jsonb;
begin
  if public.parent_facts(owner) <> '{"pmpk_conclusion_confirmed": false, "pmpk": null}' then
    raise exception 'unconfirmed document leaked into route inputs: %', public.parent_facts(owner);
  end if;

  perform public.confirm_pmpk_document(owner, doc, 1, other);
  inputs := public.parent_facts(owner);
  if inputs -> 'pmpk' ->> 'next_route' <> 'OTHER' or (inputs -> 'pmpk' ->> 'revision')::int <> 1
     or inputs -> 'pmpk' ->> 'document_id' <> doc::text or inputs -> 'pmpk' -> 'specialists' <> '["logoped"]'
     or inputs -> 'pmpk' -> 'support_format' <> 'null'::jsonb then
    raise exception 'route inputs do not carry the confirmed content: %', inputs;
  end if;

  -- Build a route on the OTHER direction.
  claim := public.claim_parent_route(owner, '{"version":1}', false);
  if claim -> 'facts' <> inputs then raise exception 'claim did not snapshot the inputs'; end if;
  perform public.finish_parent_route(owner, (claim ->> 'generation_id')::uuid, plan);

  -- Confirming the same fields again is not a change.
  perform public.confirm_pmpk_document(owner, doc, 1, other);
  if (public.parent_facts(owner) -> 'pmpk' ->> 'revision')::int <> 1 then raise exception 'identical confirmation bumped the revision'; end if;
  if public.claim_parent_route(owner, '{"version":1}', false) ->> 'claim' <> 'cached' then raise exception 'unchanged route not reused'; end if;

  -- The parent corrects the direction after generation: the saved route is no longer valid.
  perform public.confirm_pmpk_document(owner, doc, 1, kppk);
  if (public.parent_facts(owner) -> 'pmpk' ->> 'revision')::int <> 2 then raise exception 'changed confirmation did not bump the revision'; end if;
  if (select generated_for_facts_json from public.parent_ai_routes where parent_id = owner) = public.parent_facts(owner) then
    raise exception 'route built on the old direction still matches';
  end if;
end;
$$;
reset role;

-- The conclusion changes while OpenAI is working: the late answer must not be saved.
update public.parent_ai_routes set last_attempt_at = now() - interval '3 minutes';
set local role service_role;
do $$
declare
  owner uuid := '40000000-0000-4000-8000-000000000001';
  doc uuid := '50000000-0000-4000-8000-000000000001';
  claim jsonb;
begin
  claim := public.claim_parent_route(owner, '{"version":1}', false);
  if claim ->> 'claim' <> 'acquired' then raise exception 'stale route was reused: %', claim; end if;
  if claim -> 'facts' -> 'pmpk' ->> 'next_route' <> 'KPPK' then raise exception 'generation not built on the corrected direction'; end if;
  perform public.confirm_pmpk_document(owner, doc, 1,
    '{"document_type":"PMPK_CONCLUSION","issued_on":"2026-04-24","next_route":null,"specialists":[],"support_format":null}');
  begin
    perform public.finish_parent_route(owner, (claim ->> 'generation_id')::uuid,
      '{"schema_version":"parent-route-1","source":"openai","steps":[{}]}');
    raise exception 'route built on a superseded conclusion was saved';
  exception when raise_exception then
    if sqlerrm <> 'facts_changed' then raise; end if;
  end;
  if (select status from public.parent_ai_routes where parent_id = owner) = 'ready' then
    raise exception 'old result applied';
  end if;
end;
$$;
reset role;
rollback;
