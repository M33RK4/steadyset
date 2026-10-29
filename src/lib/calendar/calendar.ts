import type { AppData, LocalDate, Plan, PlanDay, ScheduleOverride, WorkoutSession } from "../domain/types";
import { del, upsert, type Change } from "../domain/changes";
import { activePlan, planDayOn } from "../plans/planOps";
import { addDays, diffDays, toLocalDate, weekDates } from "../util/dates";
import { uuid } from "../util/ids";

export type DayStatus =
  | "completed" // a completed session exists
  | "partial" // only partially completed session(s)
  | "in_progress"
  | "planned" // scheduled for today or later
  | "missed" // scheduled in the past, nothing logged (only shown if the user enables it)
  | "unlogged" // scheduled in the past, nothing logged, "missed" display disabled
  | "optional" // optional activity day without a log
  | "rest"
  | "skipped" // the user skipped/moved this day
  | "none";

export interface CalendarDay {
  date: LocalDate;
  isToday: boolean;
  isPast: boolean;
  planned: PlanDay | null;
  plannedSource: "plan" | "added" | "moved" | null;
  overrides: ScheduleOverride[];
  skippedDay: PlanDay | null;
  sessions: WorkoutSession[];
  status: DayStatus;
}

export interface CalendarContext {
  data: AppData;
  plan: Plan | undefined;
  today: LocalDate;
  showMissed: boolean;
}

export function makeContext(data: AppData, today: LocalDate): CalendarContext {
  return { data, plan: activePlan(data), today, showMissed: data.preferences.showMissed };
}

function planStart(plan: Plan): LocalDate {
  const created = toLocalDate(new Date(plan.createdAt));
  // a cycle can be started "in the past" (today is Day 3), but never shows before the plan existed
  return plan.cycleStart && plan.cycleStart > created ? plan.cycleStart : created;
}

/** The plan day scheduled on a date, after applying skip/move/add overrides. */
export function scheduledFor(ctx: CalendarContext, date: LocalDate) {
  const { data, plan } = ctx;
  const overrides = data.overrides.filter((o) => o.date === date);
  let planned: PlanDay | null = null;
  let source: CalendarDay["plannedSource"] = null;
  let skippedDay: PlanDay | null = null;
  if (plan && date >= planStart(plan)) {
    planned = planDayOn(data, plan, date);
    if (planned) source = "plan";
  }
  if (planned && overrides.some((o) => o.kind === "skip" && (o.planDayId === planned!.id || o.planDayId === null))) {
    skippedDay = planned;
    planned = null;
    source = null;
  }
  const add = overrides.filter((o) => o.kind === "add").sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (add) {
    const d = data.planDays.find((x) => x.id === add.planDayId) ?? null;
    if (d) {
      planned = d;
      source = add.movedFrom ? "moved" : "added";
    }
  }
  return { planned, source, skippedDay, overrides };
}

export function sessionsOn(data: AppData, date: LocalDate): WorkoutSession[] {
  return data.sessions
    .filter((s) => s.localDate === date && s.status !== "abandoned")
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

export function isTrainingDay(d: PlanDay | null): boolean {
  return !!d && d.kind !== "rest";
}

export function buildDay(ctx: CalendarContext, date: LocalDate): CalendarDay {
  const { planned, source, skippedDay, overrides } = scheduledFor(ctx, date);
  const sessions = sessionsOn(ctx.data, date);
  const isToday = date === ctx.today;
  const isPast = date < ctx.today;
  let status: DayStatus = "none";
  if (sessions.some((s) => s.status === "completed")) status = "completed";
  else if (sessions.some((s) => s.status === "partial")) status = "partial";
  else if (sessions.some((s) => s.status === "in_progress")) status = "in_progress";
  else if (planned) {
    if (planned.kind === "rest") status = "rest";
    else if (planned.optional) status = isPast ? "optional" : "planned";
    else if (isPast) status = ctx.showMissed ? "missed" : "unlogged";
    else status = "planned";
  } else if (skippedDay) status = "skipped";
  return { date, isToday, isPast, planned, plannedSource: source, overrides, skippedDay, sessions, status };
}

/** A day where the user was expected to train (not rest, not optional). */
function isRequired(day: CalendarDay) {
  return !!day.planned && day.planned.kind !== "rest" && !day.planned.optional;
}

/**
 * Current streak: consecutive scheduled training days that were completed (or partially
 * completed), counting back from today. Rest days, optional days and skipped days don't break
 * it, and today doesn't break it while it is still in progress. Extra sessions on unscheduled
 * days also count.
 */
export function currentStreak(ctx: CalendarContext): number {
  const first = ctx.data.sessions.reduce<LocalDate | null>((m, s) => (s.status === "abandoned" ? m : !m || s.localDate < m ? s.localDate : m), null);
  if (!first) return 0;
  let streak = 0;
  for (let i = 0; i < 400; i++) {
    const date = addDays(ctx.today, -i);
    if (date < first) break;
    const day = buildDay(ctx, date);
    const done = day.status === "completed" || day.status === "partial";
    if (done) streak++;
    else if (isRequired(day) && date < ctx.today) break;
  }
  return streak;
}

export function weekSummary(ctx: CalendarContext, weekStartsOn: 0 | 1) {
  const days = weekDates(ctx.today, weekStartsOn).map((d) => buildDay(ctx, d));
  const required = days.filter(isRequired);
  const done = days.filter((d) => d.status === "completed" || d.status === "partial");
  const requiredDone = required.filter((d) => d.status === "completed" || d.status === "partial");
  return { days, plannedCount: required.length, requiredDone: requiredDone.length, doneCount: done.length };
}

export function upcomingWorkouts(ctx: CalendarContext, count: number, includeToday = false): CalendarDay[] {
  const out: CalendarDay[] = [];
  for (let i = includeToday ? 0 : 1; i < 60 && out.length < count; i++) {
    const day = buildDay(ctx, addDays(ctx.today, i));
    if (isTrainingDay(day.planned) && day.status === "planned") out.push(day);
  }
  return out;
}

export function nextRestDay(ctx: CalendarContext): CalendarDay | null {
  if (!ctx.plan) return null;
  for (let i = 0; i < 30; i++) {
    const day = buildDay(ctx, addDays(ctx.today, i));
    if ((!day.planned && !day.skippedDay) || day.planned?.kind === "rest") return day;
  }
  return null;
}

// ---- schedule changes (never touch recorded sessions) ----

export function skipDay(ctx: CalendarContext, date: LocalDate, now = new Date()): Change[] {
  const { planned } = scheduledFor(ctx, date);
  const changes: Change[] = [];
  // Undo an "add" on that date first, otherwise add a skip.
  const adds = ctx.data.overrides.filter((o) => o.date === date && o.kind === "add");
  if (adds.length) changes.push(...adds.map((o) => del("overrides", o.id)));
  const basePlan = ctx.plan && planDayOn(ctx.data, ctx.plan, date);
  if (basePlan && (!adds.length || planned?.id === basePlan.id)) {
    changes.push(upsert("overrides", { id: uuid(), date, kind: "skip", planDayId: basePlan.id, movedFrom: null, note: "", createdAt: now.toISOString() } satisfies ScheduleOverride));
  }
  return changes;
}

export function moveDay(ctx: CalendarContext, from: LocalDate, to: LocalDate, now = new Date()): Change[] {
  const { planned } = scheduledFor(ctx, from);
  if (!planned || from === to) return [];
  const iso = now.toISOString();
  return [
    ...skipDay(ctx, from, now),
    // replace any previous add on the target date
    ...ctx.data.overrides.filter((o) => o.date === to && o.kind === "add").map((o) => del("overrides", o.id)),
    upsert("overrides", { id: uuid(), date: to, kind: "add", planDayId: planned.id, movedFrom: from, note: "", createdAt: iso } satisfies ScheduleOverride),
  ];
}

export function addWorkoutOn(ctx: CalendarContext, date: LocalDate, planDayId: string, now = new Date()): Change[] {
  return [
    ...ctx.data.overrides.filter((o) => o.date === date && o.kind === "add").map((o) => del("overrides", o.id)),
    upsert("overrides", { id: uuid(), date, kind: "add", planDayId, movedFrom: null, note: "", createdAt: now.toISOString() } satisfies ScheduleOverride),
  ];
}

/** Remove all overrides on a date → back to the plan's normal schedule. */
export function restoreDay(ctx: CalendarContext, date: LocalDate): Change[] {
  return ctx.data.overrides.filter((o) => o.date === date).map((o) => del("overrides", o.id));
}

export function daysBetween(a: LocalDate, b: LocalDate) {
  return diffDays(a, b);
}

/** Consistency over the last `n` days (excluding today): completed required days / required days. */
export function consistencyLastDays(ctx: CalendarContext, n: number): { required: number; done: number; percent: number | null } {
  let required = 0;
  let done = 0;
  for (let i = 1; i <= n; i++) {
    const day = buildDay(ctx, addDays(ctx.today, -i));
    if (isRequired(day)) {
      required++;
      if (day.status === "completed" || day.status === "partial") done++;
    }
  }
  return { required, done, percent: required ? Math.round((done / required) * 100) : null };
}
