import { test } from "node:test";
import assert from "node:assert/strict";
import { applyChanges } from "../src/lib/domain/changes";
import { emptyAppData, type AppData, type Plan } from "../src/lib/domain/types";
import { BALANCED_TONING_BEGINNER, PUSH_PULL_LEGS_REST } from "../src/lib/data/defaultPlan";
import { buildDay, currentStreak, makeContext, moveDay, skipDay, upcomingWorkouts } from "../src/lib/calendar/calendar";
import {
  convertDraftSchedule,
  cyclePosition,
  daysOfPlan,
  draftFromPlan,
  instantiateTemplate,
  moveCycleDay,
  saveDraft,
  validateDraft,
} from "../src/lib/plans/planOps";
import { fromRow, toRow } from "../src/lib/sync/mappers";
import { addDays } from "../src/lib/util/dates";

const START = new Date(2026, 9, 29, 9, 0); // Thursday 29 Oct 2026
const TODAY = "2026-10-29";

function cycleData(opts: { order?: number[]; todayPosition?: number } = {}): { data: AppData; planId: string } {
  const base = emptyAppData();
  const r = instantiateTemplate(base, PUSH_PULL_LEGS_REST, { makeActive: true, now: START, ...opts });
  return { data: applyChanges(base, r.changes), planId: r.planId };
}

const names = (data: AppData, from: string, n: number) =>
  Array.from({ length: n }, (_, i) => buildDay(makeContext(data, from), addDays(from, i)).planned?.name ?? "—");

test("a push/pull/legs/rest cycle repeats in order regardless of the weekday", () => {
  const { data, planId } = cycleData();
  const plan = data.plans.find((p) => p.id === planId)!;
  assert.equal(plan.schedule, "cycle");
  assert.equal(plan.cycleStart, TODAY);
  assert.deepEqual(names(data, TODAY, 10), ["Push", "Pull", "Legs", "Rest", "Push", "Pull", "Legs", "Rest", "Push", "Pull"]);
  // 100 days later it is still in step (100 = 25 full cycles)
  assert.equal(buildDay(makeContext(data, TODAY), addDays(TODAY, 100)).planned?.name, "Push");
  assert.equal(buildDay(makeContext(data, TODAY), addDays(TODAY, -1)).planned, null, "nothing before the plan existed");
  assert.equal(buildDay(makeContext(data, TODAY), addDays(TODAY, 3)).status, "rest");
});

test("the order can be chosen (pull → push → legs → rest) and the cycle can start mid-way", () => {
  // Pull, Push, Legs, Rest — and today is the second day of the cycle (Push)
  const { data, planId } = cycleData({ order: [1, 0, 2, 3], todayPosition: 1 });
  assert.deepEqual(
    daysOfPlan(data, planId).map((d) => [d.weekday, d.name]),
    [
      [0, "Pull"],
      [1, "Push"],
      [2, "Legs"],
      [3, "Rest"],
    ],
  );
  assert.equal(data.plans[0].cycleStart, "2026-10-28");
  assert.deepEqual(names(data, TODAY, 6), ["Push", "Legs", "Rest", "Pull", "Push", "Legs"]);
});

test("cycle position wraps forwards and backwards", () => {
  assert.equal(cyclePosition("2026-10-29", "2026-10-29", 4), 0);
  assert.equal(cyclePosition("2026-10-29", "2026-11-02", 4), 0);
  assert.equal(cyclePosition("2026-10-29", "2026-10-28", 4), 3);
  assert.equal(cyclePosition("2026-10-29", "2026-10-22", 4), 1);
});

test("skipping and moving work on cycle days like on weekly ones", () => {
  let { data } = cycleData();
  let ctx = makeContext(data, TODAY);
  data = applyChanges(data, moveDay(ctx, "2026-10-30", "2026-11-01")); // Pull moved onto the rest day
  ctx = makeContext(data, TODAY);
  assert.equal(buildDay(ctx, "2026-10-30").status, "skipped");
  assert.equal(buildDay(ctx, "2026-11-01").planned?.name, "Pull");
  data = applyChanges(data, skipDay(ctx, "2026-10-31"));
  ctx = makeContext(data, TODAY);
  assert.equal(buildDay(ctx, "2026-10-31").status, "skipped");
  assert.deepEqual(upcomingWorkouts(ctx, 3).map((d) => [d.date, d.planned!.name]), [
    ["2026-11-01", "Pull"],
    ["2026-11-02", "Push"],
    ["2026-11-03", "Pull"],
  ]);
  assert.equal(currentStreak(ctx), 0);
});

test("the editor can reorder cycle days and convert between weekly and cycle plans", () => {
  const { data, planId } = cycleData();
  let draft = draftFromPlan(data, planId)!;
  draft = moveCycleDay(draft, draft.days[1].id, -1); // Pull first
  assert.deepEqual([...draft.days].sort((a, b) => a.weekday - b.weekday).map((d) => d.name), ["Pull", "Push", "Legs", "Rest"]);
  assert.deepEqual(validateDraft(draft), []);
  const saved = applyChanges(data, saveDraft(data, draft));
  assert.deepEqual(names(saved, TODAY, 4), ["Pull", "Push", "Legs", "Rest"]);

  // a 1-day cycle isn't a cycle
  assert.ok(validateDraft({ ...draft, days: draft.days.slice(0, 1) }).some((e) => e.includes("at least 2")));

  // weekly → cycle keeps Monday-first order; cycle → weekly puts Day 1 on Monday
  const base = emptyAppData();
  const w = instantiateTemplate(base, BALANCED_TONING_BEGINNER, { makeActive: true, now: START });
  const weekly = applyChanges(base, w.changes);
  const asCycle = convertDraftSchedule(draftFromPlan(weekly, w.planId)!, "cycle", TODAY);
  assert.equal(asCycle.plan.schedule, "cycle");
  assert.equal(asCycle.plan.cycleStart, TODAY);
  assert.deepEqual(
    [...asCycle.days].sort((a, b) => a.weekday - b.weekday).map((d) => d.name),
    ["Lower Body A", "Upper Body A", "Cardio & Mobility", "Lower Body B", "Upper Body B & Core", "Optional Activity", "Rest Day"],
  );
  const back = convertDraftSchedule(asCycle, "weekly", TODAY);
  assert.equal(back.plan.schedule, "weekly");
  assert.equal(back.days.find((d) => d.name === "Lower Body A")!.weekday, 1);
  assert.equal(back.days.find((d) => d.name === "Rest Day")!.weekday, 0);
});

test("weekly plans and plans saved before cycles existed are unaffected", () => {
  const base = emptyAppData();
  const w = instantiateTemplate(base, BALANCED_TONING_BEGINNER, { makeActive: true, now: START });
  let data = applyChanges(base, w.changes);
  assert.equal(data.plans[0].schedule, "weekly");
  // simulate an old cached plan without the new fields
  const { schedule: _s, cycleStart: _c, ...old } = data.plans[0];
  data = { ...data, plans: [old as Plan] };
  assert.equal(buildDay(makeContext(data, TODAY), TODAY).planned?.name, "Lower Body B"); // Thursday
});

test("the plan type and cycle start sync to the database and back", () => {
  const { data } = cycleData({ todayPosition: 2 });
  const row = toRow("plans", data.plans[0] as unknown as Record<string, unknown>, "u1");
  assert.equal(row.schedule, "cycle");
  assert.equal(row.cycle_start, "2026-10-27");
  const back = fromRow<Plan>("plans", row);
  assert.equal(back.schedule, "cycle");
  assert.equal(back.cycleStart, "2026-10-27");
});
