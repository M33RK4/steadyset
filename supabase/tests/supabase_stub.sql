-- ONLY for running the database tests against a plain PostgreSQL server (no Supabase).
-- Recreates the small part of Supabase the migrations rely on: the auth schema, auth.users,
-- auth.uid() and the anon/authenticated roles. Do not run this against a real Supabase project.
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;
