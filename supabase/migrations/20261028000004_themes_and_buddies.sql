-- Lily / Summit themes with a light-dark mode, workout buddies (live view of each other's
-- workout) and hearts sent between buddies. Safe to run more than once.

-- ---------------------------------------------------------------- themes & colour mode
-- The old theme ids stay allowed so an older version of the app can keep saving while this
-- migration and the new app version roll out.
alter table public.user_preferences drop constraint if exists user_preferences_theme_check;
alter table public.user_preferences add constraint user_preferences_theme_check
  check (theme in ('lily', 'summit', 'blush', 'ember', 'paper', 'graphite'));
alter table public.user_preferences add column if not exists color_mode text not null default 'system';
alter table public.user_preferences drop constraint if exists user_preferences_color_mode_check;
alter table public.user_preferences add constraint user_preferences_color_mode_check
  check (color_mode in ('light', 'dark', 'system'));
alter table public.user_preferences alter column theme set default 'lily';

update public.user_preferences set color_mode = 'light', theme = 'lily' where theme in ('blush', 'paper');
update public.user_preferences set color_mode = 'dark', theme = 'summit' where theme in ('ember', 'graphite');

-- ---------------------------------------------------------------- buddies
-- A short-lived code one user shares with another to connect.
create table if not exists public.buddy_invites (
  code text primary key check (code ~ '^[A-Z2-9]{6}$'),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '2 days'
);
create index if not exists buddy_invites_owner on public.buddy_invites (owner_id);

-- One row per connected pair, stored with the smaller id first so a pair exists only once.
create table if not exists public.buddy_links (
  user_a uuid not null references auth.users (id) on delete cascade,
  user_b uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
create index if not exists buddy_links_user_b on public.buddy_links (user_b);

create table if not exists public.buddy_hearts (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);
create index if not exists buddy_hearts_recipient on public.buddy_hearts (recipient_id, created_at);

alter table public.buddy_invites enable row level security;
alter table public.buddy_links enable row level security;
alter table public.buddy_hearts enable row level security;

-- True when the caller and `other` are connected. SECURITY DEFINER so policies on other tables
-- can use it without the caller needing to read buddy_links through RLS.
create or replace function public.is_buddy(other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.buddy_links l
    where l.user_a = least(other, (select auth.uid())) and l.user_b = greatest(other, (select auth.uid()))
  )
$$;
revoke all on function public.is_buddy(uuid) from public, anon;
grant execute on function public.is_buddy(uuid) to authenticated;

drop policy if exists "own invites" on public.buddy_invites;
create policy "own invites" on public.buddy_invites for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- Links are created only through accept_buddy_invite(); either side can read or remove theirs.
drop policy if exists "read own links" on public.buddy_links;
create policy "read own links" on public.buddy_links for select to authenticated
  using ((select auth.uid()) in (user_a, user_b));
drop policy if exists "remove own links" on public.buddy_links;
create policy "remove own links" on public.buddy_links for delete to authenticated
  using ((select auth.uid()) in (user_a, user_b));

drop policy if exists "send hearts to buddies" on public.buddy_hearts;
create policy "send hearts to buddies" on public.buddy_hearts for insert to authenticated
  with check (sender_id = (select auth.uid()) and public.is_buddy(recipient_id));
drop policy if exists "read own hearts" on public.buddy_hearts;
create policy "read own hearts" on public.buddy_hearts for select to authenticated
  using ((select auth.uid()) in (sender_id, recipient_id));

-- Buddies can read each other's workouts from the last 18 hours (today's session, live) —
-- never older history, plans, measurements or settings. Read only.
drop policy if exists "buddies see recent sessions" on public.workout_sessions;
create policy "buddies see recent sessions" on public.workout_sessions for select to authenticated
  using (public.is_buddy(user_id) and started_at > now() - interval '18 hours');

drop policy if exists "buddies see recent session exercises" on public.session_exercises;
create policy "buddies see recent session exercises" on public.session_exercises for select to authenticated
  using (
    public.is_buddy(user_id)
    and exists (select 1 from public.workout_sessions s where s.id = session_id and s.started_at > now() - interval '18 hours')
  );

drop policy if exists "buddies see recent sets" on public.completed_sets;
create policy "buddies see recent sets" on public.completed_sets for select to authenticated
  using (
    public.is_buddy(user_id)
    and exists (select 1 from public.workout_sessions s where s.id = session_id and s.started_at > now() - interval '18 hours')
  );

-- Creates a fresh 6-character code for the caller (replacing their older codes).
create or replace function public.create_buddy_invite() returns text
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  new_code text;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  delete from public.buddy_invites where owner_id = uid or expires_at < now();
  loop
    new_code := '';
    for i in 1..6 loop
      new_code := new_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    begin
      insert into public.buddy_invites (code, owner_id) values (new_code, uid);
      return new_code;
    exception when unique_violation then
      -- try another code
    end;
  end loop;
end $$;
revoke all on function public.create_buddy_invite() from public, anon;
grant execute on function public.create_buddy_invite() to authenticated;

-- Connects the caller with the owner of `invite_code`. Returns the new buddy's id.
create or replace function public.accept_buddy_invite(invite_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  clean text := upper(regexp_replace(coalesce(invite_code, ''), '[^A-Za-z0-9]', '', 'g'));
  inviter uuid;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select owner_id into inviter from public.buddy_invites where code = clean and expires_at > now();
  if inviter is null then
    raise exception 'That code is invalid or has expired.' using errcode = 'P0002';
  end if;
  if inviter = uid then
    raise exception 'That''s your own code — send it to your buddy instead.' using errcode = '22023';
  end if;
  insert into public.buddy_links (user_a, user_b) values (least(uid, inviter), greatest(uid, inviter))
    on conflict do nothing;
  delete from public.buddy_invites where code = clean;
  return inviter;
end $$;
revoke all on function public.accept_buddy_invite(text) from public, anon;
grant execute on function public.accept_buddy_invite(text) to authenticated;

-- The caller's buddies with the name they chose in Settings (or the start of their email).
create or replace function public.my_buddies() returns table (buddy_id uuid, display_name text, connected_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select b.id,
         coalesce(nullif(trim(p.display_name), ''), nullif(split_part(u.email, '@', 1), ''), 'Your buddy'),
         l.created_at
  from public.buddy_links l
  cross join lateral (select case when l.user_a = (select auth.uid()) then l.user_b else l.user_a end as id) b
  left join public.user_preferences p on p.user_id = b.id
  left join auth.users u on u.id = b.id
  where (select auth.uid()) in (l.user_a, l.user_b)
  order by l.created_at
$$;
revoke all on function public.my_buddies() from public, anon;
grant execute on function public.my_buddies() to authenticated;

-- ---------------------------------------------------------------- realtime
-- Lets the app hear about hearts and a buddy's ticked-off sets as they happen. Realtime still
-- applies the RLS policies above, so nobody receives rows they couldn't read.
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['buddy_hearts', 'workout_sessions', 'session_exercises', 'completed_sets'] loop
      if not exists (
        select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
