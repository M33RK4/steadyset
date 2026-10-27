-- Row Level Security: every private table is readable and writable only by its owner.
-- Child rows additionally must point at a parent row owned by the same user, so nobody can
-- attach data to (or probe) another user's plans or sessions.

alter table public.profiles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.exercises enable row level security;
alter table public.plans enable row level security;
alter table public.plan_days enable row level security;
alter table public.plan_exercises enable row level security;
alter table public.scheduled_workouts enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.session_exercises enable row level security;
alter table public.completed_sets enable row level security;
alter table public.body_measurements enable row level security;

-- profiles / preferences (keyed by the user id itself)
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists "own preferences" on public.user_preferences;
create policy "own preferences" on public.user_preferences for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- exercises: built-ins readable by everyone signed in; custom ones only by their owner
drop policy if exists "read library and own exercises" on public.exercises;
create policy "read library and own exercises" on public.exercises for select to authenticated
  using (owner_id is null or owner_id = (select auth.uid()));
drop policy if exists "insert own exercises" on public.exercises;
create policy "insert own exercises" on public.exercises for insert to authenticated
  with check (owner_id = (select auth.uid()));
drop policy if exists "update own exercises" on public.exercises;
create policy "update own exercises" on public.exercises for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists "delete own exercises" on public.exercises;
create policy "delete own exercises" on public.exercises for delete to authenticated
  using (owner_id = (select auth.uid()));

-- plans
drop policy if exists "own plans" on public.plans;
create policy "own plans" on public.plans for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "own plan days" on public.plan_days;
create policy "own plan days" on public.plan_days for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.plans p where p.id = plan_id and p.user_id = (select auth.uid()))
  );

drop policy if exists "own plan exercises" on public.plan_exercises;
create policy "own plan exercises" on public.plan_exercises for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.plan_days d where d.id = plan_day_id and d.user_id = (select auth.uid()))
    and exists (select 1 from public.exercises e where e.id = exercise_id and (e.owner_id is null or e.owner_id = (select auth.uid())))
  );

drop policy if exists "own schedule" on public.scheduled_workouts;
create policy "own schedule" on public.scheduled_workouts for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (plan_day_id is null or exists (select 1 from public.plan_days d where d.id = plan_day_id and d.user_id = (select auth.uid())))
  );

-- history
drop policy if exists "own sessions" on public.workout_sessions;
create policy "own sessions" on public.workout_sessions for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (plan_id is null or exists (select 1 from public.plans p where p.id = plan_id and p.user_id = (select auth.uid())))
  );

drop policy if exists "own session exercises" on public.session_exercises;
create policy "own session exercises" on public.session_exercises for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.workout_sessions s where s.id = session_id and s.user_id = (select auth.uid()))
  );

drop policy if exists "own sets" on public.completed_sets;
create policy "own sets" on public.completed_sets for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.session_exercises se
      where se.id = session_exercise_id and se.session_id = completed_sets.session_id and se.user_id = (select auth.uid())
    )
  );

drop policy if exists "own measurements" on public.body_measurements;
create policy "own measurements" on public.body_measurements for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- No policies for the anon role: signed-out visitors can't read anything (guest mode is local-only).

-- ---------------------------------------------------------------- new-user bootstrap
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  insert into public.user_preferences (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- account deletion
-- Deletes the calling user's auth record. Every private table references auth.users with
-- ON DELETE CASCADE, so all of the user's data is removed in the same transaction.
-- Runs as the function owner, but can only ever delete auth.uid() — never another account.
create or replace function public.delete_own_account() returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  delete from auth.users where id = uid;
end $$;

revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;
