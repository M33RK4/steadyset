-- Database tests for workout buddies and hearts. Run with `npm run test:db`.
-- Every check raises an exception on failure; the script runs in a transaction that is rolled back.
begin;

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'alice@test.local'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bob@test.local'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'carol@test.local');
update public.user_preferences set display_name = 'Alice' where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

do $$ begin
  if (select theme from public.user_preferences where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> 'lily' then raise exception 'FAIL: new users should default to the lily theme'; end if;
end $$;

-- ---- Alice: a workout from today and one from three days ago
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true); end $$;
insert into public.workout_sessions (id, user_id, local_date, title, kind, status, started_at) values
  ('22222222-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_date, 'Upper Body A', 'strength', 'in_progress', now() - interval '20 minutes'),
  ('22222222-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_date - 3, 'Lower Body A', 'strength', 'completed', now() - interval '3 days');
insert into public.session_exercises (id, session_id, user_id, name, target_sets, reps_min, reps_max, status) values
  ('22222222-0000-4000-8000-000000000003', '22222222-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Lat Pulldown', 3, 10, 12, 'active'),
  ('22222222-0000-4000-8000-000000000004', '22222222-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Leg Press', 3, 10, 12, 'completed');
insert into public.completed_sets (id, session_exercise_id, session_id, user_id, set_number, reps, completed_at) values
  ('22222222-0000-4000-8000-000000000005', '22222222-0000-4000-8000-000000000003', '22222222-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1, 12, now()),
  ('22222222-0000-4000-8000-000000000006', '22222222-0000-4000-8000-000000000004', '22222222-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1, 12, now() - interval '3 days');

create temp table codes (who text, code text) on commit drop;
grant all on codes to authenticated;
insert into codes values ('alice', public.create_buddy_invite());

do $$ begin
  if (select code from codes where who = 'alice') !~ '^[A-Z2-9]{6}$' then raise exception 'FAIL: invite code has the wrong format'; end if;
  begin
    perform public.accept_buddy_invite((select code from codes where who = 'alice'));
    raise exception 'FAIL: accepted own invite';
  exception when invalid_parameter_value then null;
  end;
end $$;

-- ---- Bob, before connecting: sees nothing of Alice and can't send her hearts
do $$ begin perform set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true); end $$;
do $$ begin
  if exists (select 1 from public.workout_sessions) then raise exception 'FAIL: stranger can read sessions'; end if;
  if exists (select 1 from public.buddy_invites) then raise exception 'FAIL: stranger can list invite codes'; end if;
  begin
    insert into public.buddy_hearts (recipient_id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    raise exception 'FAIL: heart sent to a non-buddy';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.buddy_links (user_a, user_b) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    raise exception 'FAIL: link created without an invite';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.accept_buddy_invite('ZZZZZZ');
    raise exception 'FAIL: accepted an unknown code';
  exception when no_data_found then null;
  end;
end $$;

-- Lower-case and spaced codes are accepted
do $$ begin
  if public.accept_buddy_invite(lower(substr((select code from codes where who = 'alice'), 1, 3)) || ' ' || lower(substr((select code from codes where who = 'alice'), 4)))
     <> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' then
    raise exception 'FAIL: accepting returned the wrong buddy';
  end if;
end $$;

-- ---- Bob, connected: sees today's workout live, not older history; can't change anything
do $$ begin
  if (select count(*) from public.workout_sessions) <> 1 then raise exception 'FAIL: buddy should see exactly today''s session'; end if;
  if (select count(*) from public.session_exercises) <> 1 then raise exception 'FAIL: buddy should see only today''s exercises'; end if;
  if (select count(*) from public.completed_sets) <> 1 then raise exception 'FAIL: buddy should see only today''s sets'; end if;
  if exists (select 1 from public.plans) or exists (select 1 from public.body_measurements) then raise exception 'FAIL: buddy can read private data'; end if;
  if (select display_name from public.my_buddies()) <> 'Alice' then raise exception 'FAIL: my_buddies should show the chosen name'; end if;
  if (select count(*) from public.user_preferences) <> 1 then raise exception 'FAIL: buddy can read another user''s preferences'; end if;

  update public.workout_sessions set title = 'hacked' where id = '22222222-0000-4000-8000-000000000001';
  delete from public.completed_sets where id = '22222222-0000-4000-8000-000000000005';
  insert into public.buddy_hearts (recipient_id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  begin
    insert into public.buddy_hearts (sender_id, recipient_id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    raise exception 'FAIL: heart sent in someone else''s name';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---- Carol: not connected to anyone, sees nothing
do $$ begin perform set_config('request.jwt.claim.sub', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', true); end $$;
do $$ begin
  if exists (select 1 from public.workout_sessions) or exists (select 1 from public.buddy_hearts) or exists (select 1 from public.buddy_links) then
    raise exception 'FAIL: unrelated user sees buddy data';
  end if;
  if exists (select 1 from public.my_buddies()) then raise exception 'FAIL: unrelated user has buddies'; end if;
end $$;

-- ---- Alice: her data is unchanged, she has Bob's heart, and she can disconnect
do $$ begin perform set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true); end $$;
do $$ begin
  if (select title from public.workout_sessions where id = '22222222-0000-4000-8000-000000000001') <> 'Upper Body A' then raise exception 'FAIL: buddy edited a session'; end if;
  if (select count(*) from public.completed_sets) <> 2 then raise exception 'FAIL: buddy deleted a set'; end if;
  if (select count(*) from public.buddy_hearts where recipient_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') <> 1 then raise exception 'FAIL: heart not delivered'; end if;
  delete from public.buddy_links;
end $$;

do $$ begin perform set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true); end $$;
do $$ begin
  if exists (select 1 from public.workout_sessions) then raise exception 'FAIL: still sees sessions after disconnecting'; end if;
end $$;

reset role;
rollback;
