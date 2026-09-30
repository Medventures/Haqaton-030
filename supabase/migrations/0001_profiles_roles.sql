-- Two user types: curator and parent. Role lives in profiles, not in user_metadata:
-- user_metadata is editable by the user, so it must not decide access.
create type public.user_role as enum ('curator', 'parent');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'parent',
  full_name text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: read own" on public.profiles
  for select using ((select auth.uid()) = id);

-- Every sign-up becomes a parent. A curator is promoted by hand:
-- update public.profiles set role = 'curator' where id = '<user-id>';
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
