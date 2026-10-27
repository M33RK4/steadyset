-- Database tests: row level security, one-set-only rule, history surviving plan deletion and
-- account deletion. Run with `npm run test:db` (uses a throwaway local PostgreSQL), or against a
-- local Supabase stack: psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_test.sql
-- Every check raises an exception on failure; the whole script runs in a transaction that is
-- rolled back, so it leaves no data behind.
begin;

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'alice@test.local'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bob@test.local');

do $$ begin
  if (select count(*) from public.user_preferences) <> 2 then raise exception 'new users should get a preferences row'; end if;
  if (select count(*) from public.exercises where owner_id is null) < 21 then raise exception 'built-in exercise library missing'; end if;
end $$;

-- ---- act as Alice
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true); end $$;

insert into public.plans (id, user_id, name, is_active) values ('11111111-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Alice plan', true);
insert into public.plan_days (id, plan_id, user_id, weekday, name, kind) values ('11111111-0000-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1, 'Lower Body A', 'strength');
insert into public.plan_exercises (id, plan_day_id, user_id, exercise_id, sets, reps_min, reps_max)
  select '11111111-0000-4000-8000-000000000003', '11111111-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', id, 3, 10, 12 from public.exercises where slug = 'hip-thrust-machine';
insert into public.workout_sessions (id, user_id, plan_id, plan_day_id, local_date, title, plan_name, kind, status, started_at)
  values ('11111111-0000-4000-8000-000000000004', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000002', '2026-10-26', 'Lower Body A', 'Alice plan', 'strength', 'completed', now());
insert into public.session_exercises (id, session_id, user_id, exercise_id, name, target_sets, reps_min, reps_max, status)
  select '11111111-0000-4000-8000-000000000005', '11111111-0000-4000-8000-000000000004', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', id, 'Hip Thrust Machine', 3, 10, 12, 'completed' from public.exercises where slug = 'hip-thrust-machine';
insert into public.completed_sets (id, session_exercise_id, session_id, user_id, set_number, reps, weight, weight_unit, completed_at)
  values ('11111111-0000-4000-8000-000000000006', '11111111-0000-4000-8000-000000000005', '11111111-0000-4000-8000-000000000004', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1, 12, 40, 'kg', now());

-- Upserting the same set id again is idempotent (offline retry)
insert into public.completed_sets (id, session_exercise_id, session_id, user_id, set_number, reps, weight, weight_unit, completed_at)
  values ('11111111-0000-4000-8000-000000000006', '11111111-0000-4000-8000-000000000005', '11111111-0000-4000-8000-000000000004', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1, 12, 40, 'kg', now())
  on conflict (id) do update set reps = excluded.reps;

-- A second record for the same set number is rejected
do $$ begin
  insert into public.completed_sets (id, session_exercise_id, session_id, user_id, set_number, reps, completed_at)
    values ('11111111-0000-4000-8000-000000000007', '11111111-0000-4000-8000-000000000005', '11111111-0000-4000-8000-000000000004', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1, 10, now());
  raise exception 'FAIL: duplicate set number was accepted';
exception when unique_violation then null;
end $$;

-- Alice can't write rows claiming to be Bob
do $$ begin
  insert into public.plans (id, user_id, name) values ('11111111-0000-4000-8000-000000000008', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'forged');
  raise exception 'FAIL: inserted a row for another user';
exception when insufficient_privilege then null;
end $$;

-- Alice can't create custom exercises as built-ins
do $$ begin
  insert into public.exercises (id, owner_id, slug, name, kind) values (gen_random_uuid(), null, 'fake', 'Fake', 'reps');
  raise exception 'FAIL: user created a built-in exercise';
exception when insufficient_privilege then null;
end $$;

-- ---- act as Bob
do $$ begin perform set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true); end $$;
do $$ begin
  if (select count(*) from public.plans) <> 0 then raise exception 'FAIL: Bob can read Alice''s plans'; end if;
  if (select count(*) from public.workout_sessions) <> 0 then raise exception 'FAIL: Bob can read Alice''s sessions'; end if;
  if (select count(*) from public.completed_sets) <> 0 then raise exception 'FAIL: Bob can read Alice''s sets'; end if;
  if (select count(*) from public.user_preferences) <> 1 then raise exception 'FAIL: Bob should only see his own preferences'; end if;
  if (select count(*) from public.exercises) < 21 then raise exception 'FAIL: Bob should see the built-in library'; end if;
end $$;
update public.plans set name = 'hacked' where id = '11111111-0000-4000-8000-000000000001';
delete from public.workout_sessions where id = '11111111-0000-4000-8000-000000000004';
-- Bob attaching a day to Alice's plan is refused by the parent-ownership check
do $$ begin
  insert into public.plan_days (id, plan_id, user_id, weekday, name, kind) values (gen_random_uuid(), '11111111-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 2, 'x', 'strength');
  raise exception 'FAIL: attached a day to someone else''s plan';
exception when insufficient_privilege then null;
end $$;

-- ---- back to Alice: Bob's update/delete had no effect
do $$ begin perform set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true); end $$;
do $$ begin
  if (select name from public.plans where id = '11111111-0000-4000-8000-000000000001') <> 'Alice plan' then raise exception 'FAIL: Bob modified Alice''s plan'; end if;
  if (select count(*) from public.workout_sessions) <> 1 then raise exception 'FAIL: Bob deleted Alice''s session'; end if;
end $$;

-- Deleting the plan keeps the workout history (links are set null, snapshots stay)
delete from public.plans where id = '11111111-0000-4000-8000-000000000001';
do $$ begin
  if (select count(*) from public.plan_days) <> 0 then raise exception 'FAIL: plan days not removed with plan'; end if;
  if (select count(*) from public.workout_sessions where plan_id is null and plan_day_id is null and plan_name = 'Alice plan') <> 1 then raise exception 'FAIL: history lost or still linked'; end if;
  if (select count(*) from public.completed_sets) <> 1 then raise exception 'FAIL: sets lost with plan'; end if;
end $$;

-- Account deletion removes everything of Alice and nothing of Bob
do $$ begin perform public.delete_own_account(); end $$;
reset role;
do $$ begin
  if exists (select 1 from auth.users where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') then raise exception 'FAIL: auth user not deleted'; end if;
  if (select count(*) from public.workout_sessions) + (select count(*) from public.completed_sets) + (select count(*) from public.session_exercises) <> 0 then raise exception 'FAIL: private data left behind'; end if;
  if (select count(*) from public.user_preferences) <> 1 then raise exception 'FAIL: Bob''s data affected'; end if;
end $$;

select 'ALL DATABASE TESTS PASSED' as result;
rollback;
