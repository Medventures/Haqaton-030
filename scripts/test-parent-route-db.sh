#!/usr/bin/env bash
set -euo pipefail

# Isolated PostgreSQL with a minimal Auth shim. Never connects to .env.local or the demo project.
ROUTE_PG_BIN="${ROUTE_PG_BIN:-/usr/local/opt/postgresql@16/bin}"
ROUTE_PG_DIR=$(mktemp -d)
export LC_ALL=C LANG=C
cleanup() {
  "$ROUTE_PG_BIN/pg_ctl" -D "$ROUTE_PG_DIR/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$ROUTE_PG_DIR"
}
trap cleanup EXIT
"$ROUTE_PG_BIN/initdb" -D "$ROUTE_PG_DIR/data" -A trust --no-locale >/dev/null
"$ROUTE_PG_BIN/pg_ctl" -D "$ROUTE_PG_DIR/data" -l "$ROUTE_PG_DIR/log" -o "-h '' -k $ROUTE_PG_DIR" -w start >/dev/null
ROUTE_PSQL=("$ROUTE_PG_BIN/psql" -X -h "$ROUTE_PG_DIR" -d postgres -v ON_ERROR_STOP=1)
"${ROUTE_PSQL[@]}" -q <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
grant usage on schema auth, public to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
-- Minimal Storage shim: enough for the bucket row and the row-level policies on storage.objects.
create schema storage;
create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant select, insert on storage.objects to authenticated;
grant all on storage.objects, storage.buckets to service_role;
SQL
for migration in supabase/migrations/*.sql; do
  "${ROUTE_PSQL[@]}" -q -f "$migration" >/dev/null
done
for test in supabase/tests/*.test.sql; do
  "${ROUTE_PSQL[@]}" -q -f "$test"
done
echo "Database checks passed"
