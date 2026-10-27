import { test } from "node:test";
import assert from "node:assert/strict";
import { apply, seededData } from "./helpers";
import { buildDay, currentStreak, makeContext, moveDay, skipDay, upcomingWorkouts, weekSummary, nextRestDay } from "../src/lib/calendar/calendar";
import {
  deletePlan,
  draftFromPlan,
  duplicatePlan,
  resetPlanToTemplate,
  saveDraft,
  setActivePlan,
  validateDraft,
  dayForWeekday,
  exercisesOfDay,
} from "../src/lib/plans/planOps";
import { finishSession, finishSet, logActivity, sessionExercisesOf, startSession } from "../src/lib/session/sessionOps";
import { BALANCED_TONING_BEGINNER } from "../src/lib/data/defaultPlan";
import { addDays, monthGrid, startOfWeek, toLocalDate, weekdayOf } from "../src/lib/util/dates";
import type { AppData } from "../src/lib/domain/types";

const TODAY = "2026-10-28"; // a Wednesday

function completeDay(data: AppData, date: string, weekday: number, full = true): AppData {
  const plan = data.plans.find((p) => p.isActive)!;
  const day = dayForWeekday(data, plan.id, weekday as 0)!;
  const start = new Date(`${date}T18:00:00`);
  const r = startSession(data, { plan, day, date, now: start });
  data = apply(data, r.changes);
  let active = r.active;
  const list = sessionExercisesOf(data, r.sessionId);
  for (const se of full ? list : list.slice(0, 1)) {
    for (let n = 1; n <= se.targetSets; n++) {
      const f = finishSet(data, active, { seId: se.id, expectedSetNumber: n, reps: 10, weight: 10, units: "kg", now: start });
      data = apply(data, f.changes);
      active = f.active!;
    }
  }
  return apply(data, finishSession(data, r.sessionId, { now: new Date(start.getTime() + 45 * 60_000) }));
}

test("local date helpers never shift across UTC midnight", () => {
  assert.equal(toLocalDate(new Date(2026, 9, 26, 23, 59)), "2026-10-26");
  assert.equal(toLocalDate(new Date(2026, 9, 27, 0, 1)), "2026-10-27");
  assert.equal(addDays("2026-10-24", 2), "2026-10-26"); // across the EU DST change (25 Oct 2026)
  assert.equal(weekdayOf("2026-10-26"), 1);
  assert.equal(startOfWeek(TODAY, 1), "2026-10-26");
  assert.equal(startOfWeek(TODAY, 0), "2026-10-25");
  assert.equal(monthGrid(TODAY, 1)[0], "2026-09-28");
});

test("calendar derives schedule from the active plan; a passed date is not 'completed'", () => {
  const { data } = seededData();
  const ctx = makeContext(data, TODAY);
  const mon = buildDay(ctx, "2026-10-26");
  assert.equal(mon.planned?.name, "Lower Body A");
  assert.equal(mon.status, "unlogged");
  assert.equal(buildDay({ ...ctx, showMissed: true }, "2026-10-26").status, "missed");
  assert.equal(buildDay(ctx, "2026-11-01").status, "rest");
  assert.equal(buildDay(ctx, "2026-10-31").planned?.optional, true);
  assert.equal(buildDay(ctx, TODAY).isToday, true);
  assert.equal(buildDay(ctx, "2026-09-28").planned, null, "nothing scheduled before the plan existed");
});

test("completing a workout updates the calendar for that local date", () => {
  let { data } = seededData();
  data = completeDay(data, "2026-10-26", 1);
  data = completeDay(data, "2026-10-27", 2, false);
  const ctx = makeContext(data, TODAY);
  assert.equal(buildDay(ctx, "2026-10-26").status, "completed");
  assert.equal(buildDay(ctx, "2026-10-27").status, "partial");
  const wk = weekSummary(ctx, 1);
  assert.equal(wk.plannedCount, 5);
  assert.equal(wk.requiredDone, 2);
});

test("streak counts consecutive scheduled days and ignores rest/optional days", () => {
  let { data } = seededData();
  // Thu 22, Fri 23 done; Sat optional skipped, Sun rest; Mon 26, Tue 27 done
  for (const [d, w] of [["2026-10-22", 4], ["2026-10-23", 5], ["2026-10-26", 1], ["2026-10-27", 2]] as const) data = completeDay(data, d, w);
  assert.equal(currentStreak(makeContext(data, TODAY)), 4);
  // A missed required day breaks it: nothing on Wed 21
  data = completeDay(data, "2026-10-20", 2);
  assert.equal(currentStreak(makeContext(data, TODAY)), 4);
  // Today (Wed) logged as cardio → 5
  data = apply(data, logActivity(data, { date: TODAY, activityType: "Treadmill", minutes: 25, notes: "", planDay: null, plan: null, now: new Date(), kind: "cardio" }));
  assert.equal(currentStreak(makeContext(data, TODAY)), 5);
});

test("skip and move change the schedule without touching history", () => {
  let { data } = seededData();
  data = completeDay(data, "2026-10-26", 1);
  const before = data.sessions.length;
  let ctx = makeContext(data, TODAY);
  data = apply(data, moveDay(ctx, "2026-10-29", "2026-10-31"));
  ctx = makeContext(data, TODAY);
  assert.equal(buildDay(ctx, "2026-10-29").status, "skipped");
  const sat = buildDay(ctx, "2026-10-31");
  assert.equal(sat.planned?.name, "Lower Body B");
  assert.equal(sat.plannedSource, "moved");
  data = apply(data, skipDay(ctx, "2026-10-30"));
  ctx = makeContext(data, TODAY);
  assert.equal(buildDay(ctx, "2026-10-30").status, "skipped");
  assert.equal(data.sessions.length, before);
  assert.deepEqual(upcomingWorkouts(ctx, 2).map((d) => d.date), ["2026-10-31", "2026-11-02"]);
  assert.equal(nextRestDay(ctx)?.date, "2026-11-01");
});

test("editing or deleting a plan keeps workout history intact", () => {
  let { data, planId } = seededData();
  data = completeDay(data, "2026-10-26", 1);
  const session = data.sessions[0];
  const names = sessionExercisesOf(data, session.id).map((e) => e.name);

  const draft = draftFromPlan(data, planId)!;
  draft.plan.name = "My edited plan";
  draft.days[0].exercises.reverse();
  draft.days[0].exercises.pop();
  draft.days[0].exercises[0].sets = 5;
  assert.deepEqual(validateDraft(draft), []);
  data = apply(data, saveDraft(data, draft));
  const monday = dayForWeekday(data, planId, 1)!;
  assert.equal(exercisesOfDay(data, monday.id).length, 4);
  assert.equal(exercisesOfDay(data, monday.id)[0].sets, 5);
  assert.deepEqual(sessionExercisesOf(data, session.id).map((e) => e.name), names, "history keeps its snapshot");
  assert.equal(data.sessions[0].planName, "Balanced Toning — Beginner");

  data = apply(data, deletePlan(data, planId));
  assert.equal(data.plans.length, 0);
  assert.equal(data.planDays.length, 0);
  assert.equal(data.sessions.length, 1);
  assert.equal(data.sessions[0].planId, null);
  assert.equal(sessionExercisesOf(data, session.id).length, 5);
  assert.ok(data.sets.length > 0);
});

test("duplicate, activate and reset-to-defaults", () => {
  let { data, planId } = seededData();
  const dup = duplicatePlan(data, planId);
  data = apply(data, dup.changes);
  assert.equal(data.plans.length, 2);
  assert.equal(data.planExercises.length, 2 * 24);
  data = apply(data, setActivePlan(data, dup.planId));
  assert.deepEqual(data.plans.filter((p) => p.isActive).map((p) => p.id), [dup.planId]);

  const draft = draftFromPlan(data, planId)!;
  draft.days = draft.days.slice(0, 2);
  data = apply(data, saveDraft(data, draft));
  assert.equal(data.planDays.filter((d) => d.planId === planId).length, 2);
  data = apply(data, resetPlanToTemplate(data, planId, BALANCED_TONING_BEGINNER));
  assert.equal(data.planDays.filter((d) => d.planId === planId).length, 7);
  const tue = dayForWeekday(data, planId, 2)!;
  assert.equal(exercisesOfDay(data, tue.id).length, 6);
});

test("plans are not limited to the default 5-day layout", () => {
  let { data, planId } = seededData();
  const draft = draftFromPlan(data, planId)!;
  draft.days = draft.days.filter((d) => d.weekday === 1 || d.weekday === 4); // 2-day plan
  data = apply(data, saveDraft(data, draft));
  const ctx = makeContext(data, TODAY);
  assert.equal(weekSummary(ctx, 1).plannedCount, 2);
  assert.equal(buildDay(ctx, "2026-10-27").planned, null);
  const dupWeekday = draftFromPlan(data, planId)!;
  dupWeekday.days[1].weekday = dupWeekday.days[0].weekday;
  assert.ok(validateDraft(dupWeekday).length > 0);
});
