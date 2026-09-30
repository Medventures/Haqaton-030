-- The route depends on what the confirmed PMPK conclusion says, not only on whether it exists.
-- Route inputs now carry the document id, its confirmed revision and the confirmed recommendations,
-- so any correction or deletion makes a saved route stale and rejects an in-flight generation.
begin;

alter table public.pmpk_documents add column confirmed_revision integer not null default 0 check (confirmed_revision >= 0);
update public.pmpk_documents set confirmed_revision = 1 where status = 'confirmed';

-- Keep in sync with routeInputsFromDocument() in src/domain/pmpk.ts.
create or replace function public.parent_facts(p_parent_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((
    select jsonb_build_object('pmpk_conclusion_confirmed', true, 'pmpk', jsonb_build_object(
      'document_id', d.id, 'revision', d.confirmed_revision,
      'next_route', coalesce(d.confirmed_json -> 'next_route', 'null'::jsonb),
      'specialists', coalesce(d.confirmed_json -> 'specialists', '[]'::jsonb),
      'support_format', coalesce(d.confirmed_json -> 'support_format', 'null'::jsonb)))
    from public.pmpk_documents d
    where d.parent_id = p_parent_id and d.status = 'confirmed'
      and d.confirmed_json ->> 'document_type' = 'PMPK_CONCLUSION'),
    '{"pmpk_conclusion_confirmed": false, "pmpk": null}'::jsonb);
$$;

-- Every change of the confirmed fields is a new confirmed revision; re-confirming the same fields is not.
create or replace function public.confirm_pmpk_document(p_parent_id uuid, p_id uuid, p_revision integer, p_confirmed jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare doc public.pmpk_documents%rowtype;
begin
  select * into doc from public.pmpk_documents where id = p_id and parent_id = p_parent_id for update;
  if not found then raise exception 'document_not_found' using errcode = 'P0001'; end if;
  if doc.status not in ('needs_review', 'confirmed') then raise exception 'document_state_conflict' using errcode = 'P0001'; end if;
  if doc.revision <> p_revision then raise exception 'revision_conflict' using errcode = 'P0001'; end if;
  update public.pmpk_documents set status = 'confirmed', confirmed_json = p_confirmed, confirmed_at = now(),
    confirmed_revision = confirmed_revision
      + case when doc.status = 'confirmed' and doc.confirmed_json = p_confirmed then 0 else 1 end,
    updated_at = now()
    where id = p_id;
end;
$$;

-- Routes built before this migration saw no document: keep them valid instead of forcing a paid regeneration.
alter table public.parent_ai_routes alter column source_facts_json set default '{"pmpk_conclusion_confirmed": false, "pmpk": null}'::jsonb;
update public.parent_ai_routes set source_facts_json = source_facts_json || '{"pmpk": null}'::jsonb
  where source_facts_json = '{"pmpk_conclusion_confirmed": false}'::jsonb;
update public.parent_ai_routes set generated_for_facts_json = generated_for_facts_json || '{"pmpk": null}'::jsonb
  where generated_for_facts_json = '{"pmpk_conclusion_confirmed": false}'::jsonb;

revoke all on function public.parent_facts(uuid) from public, anon, authenticated;
revoke all on function public.confirm_pmpk_document(uuid, uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.parent_facts(uuid) to service_role;
grant execute on function public.confirm_pmpk_document(uuid, uuid, integer, jsonb) to service_role;
commit;
