-- Repeating-cycle plans (e.g. Push → Pull → Legs → Rest → …) that aren't tied to weekdays.
-- For a cycle plan, plan_days.weekday holds the day's position in the cycle (0 = Day 1), so a
-- cycle has at most 7 days and the existing one-day-per-slot constraint still applies.
-- Safe to run more than once.

alter table public.plans add column if not exists schedule text not null default 'weekly';
alter table public.plans drop constraint if exists plans_schedule_check;
alter table public.plans add constraint plans_schedule_check check (schedule in ('weekly', 'cycle'));

-- The date on which Day 1 of the cycle falls; the cycle repeats from there. Null for weekly plans.
alter table public.plans add column if not exists cycle_start date;
