begin;
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000001'), ('10000000-0000-4000-8000-000000000002');
insert into public.interview_sessions(parent_id, status, answers_json)
values ('10000000-0000-4000-8000-000000000001', 'completed', '{"version":1}'),
       ('10000000-0000-4000-8000-000000000002', 'completed', '{"version":2}');

set local role service_role;
do $$
declare
  owner uuid := '10000000-0000-4000-8000-000000000001';
  claim jsonb;
  token uuid;
begin
  claim := public.claim_parent_route(owner, '{"version":1}', false);
  if claim ->> 'claim' <> 'acquired' then raise exception 'claim failed'; end if;
  token := (claim ->> 'generation_id')::uuid;
  if public.claim_parent_route(owner, '{"version":1}', false) ->> 'claim' <> 'busy' then
    raise exception 'parallel generation was not blocked';
  end if;
  begin
    perform public.finish_parent_route(owner, gen_random_uuid(), '{"schema_version":"parent-route-1","source":"openai","steps":[{}]}');
    raise exception 'wrong generation token accepted';
  exception when raise_exception then
    if sqlerrm <> 'generation_conflict' then raise; end if;
  end;
  begin
    perform public.finish_parent_route(owner, token, '{}');
    raise exception 'missing JSON fields accepted';
  exception when check_violation then null;
  end;
  perform public.finish_parent_route(owner, token, '{"schema_version":"parent-route-1","source":"openai","steps":[{}]}');
  if public.claim_parent_route(owner, '{"version":1}', false) ->> 'claim' <> 'cached' then
    raise exception 'cached route not reused';
  end if;
  begin
    perform public.claim_parent_route(owner, '{"version":1}', true);
    raise exception 'rate limit missing';
  exception when raise_exception then
    if sqlerrm <> 'generation_rate_limit' then raise; end if;
  end;
end;
$$;
reset role;

-- A response generated for an old snapshot must not overwrite the current route.
update public.parent_ai_routes set last_attempt_at = now() - interval '3 minutes';
do $$
declare claim jsonb;
begin
  claim := public.claim_parent_route('10000000-0000-4000-8000-000000000001', '{"version":1}', true);
  update public.interview_sessions set answers_json = '{"version":3}' where parent_id = '10000000-0000-4000-8000-000000000001';
  begin
    perform public.finish_parent_route('10000000-0000-4000-8000-000000000001', (claim ->> 'generation_id')::uuid,
      '{"schema_version":"parent-route-1","source":"openai","steps":[{}]}');
    raise exception 'stale answers accepted';
  exception when raise_exception then
    if sqlerrm <> 'interview_changed' then raise; end if;
  end;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
do $$ begin
  if exists(select 1 from public.parent_ai_routes) then raise exception 'foreign route exposed'; end if;
  begin
    perform public.claim_parent_route('10000000-0000-4000-8000-000000000001', '{"version":3}', false);
    raise exception 'user can invoke privileged RPC';
  exception when insufficient_privilege then null;
  end;
end; $$;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
do $$ begin
  if (select count(*) from public.parent_ai_routes) <> 1 then raise exception 'own route not visible'; end if;
  begin
    update public.parent_ai_routes set status = 'ready';
    raise exception 'user can write route directly';
  exception when insufficient_privilege then null;
  end;
end; $$;
reset role;
rollback;
