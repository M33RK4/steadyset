import { test } from "node:test";
import assert from "node:assert/strict";
import { seededData, apply } from "./helpers";
import { deleteSession, finishSet, logWorkout, sessionExercisesOf, setsOf, startSession } from "../src/lib/session/sessionOps";
import { activePlan, dayForWeekday, exercisesOfDay, planSlotFor, saveSessionAsPlanDay } from "../src/lib/plans/planOps";
import { buildDay, makeContext } from "../src/lib/calendar/calendar";
import { exerciseIdBySlug } from "../src/lib/data/exercises";
import { emptyAppData } from "../src/lib/domain/types";

const now = new Date(2026, 9, 29, 19, 0); // Thursday
const items = () => [
  { exerciseId: exerciseIdBySlug("goblet-squat")!, sets: [{ reps: 12, weight: 10 }, { reps: 10, weight: 12 }, { reps: 8, weight: 12 }] },
  { exerciseId: exerciseIdBySlug("forearm-plank")!, sets: [{ reps: 30, weight: null }] },
];

test("a workout logged by hand is a completed session with its sets, no plan needed", () => {
  const data = emptyAppData();
  const r = logWorkout(data, { date: "2026-10-29", title: "Legs", minutes: 40, notes: "", items: items(), units: "kg", now });
  const d = apply(data, r.changes);
  const s = d.sessions.find((x) => x.id === r.sessionId)!;
  assert.equal(s.status, "completed");
  assert.equal(s.durationSeconds, 2400);
  assert.equal(s.planId, null);
  const list = sessionExercisesOf(d, s.id);
  assert.deepEqual(list.map((e) => [e.name, e.status, setsOf(d, e.id).length]), [["Goblet Squat", "completed", 3], ["Forearm Plank", "completed", 1]]);
  // weights recorded, the plank as seconds
  assert.deepEqual(setsOf(d, list[0].id).map((x) => [x.reps, x.weight, x.weightUnit]), [[12, 10, "kg"], [10, 12, "kg"], [8, 12, "kg"]]);
  assert.equal(setsOf(d, list[1].id)[0].durationSeconds, 30);
});

test("without a plan, saving it creates a weekly plan with that weekday's workout", () => {
  const data = emptyAppData();
  const r = logWorkout(data, { date: "2026-10-29", title: "Legs", minutes: 40, notes: "", items: items(), units: "kg", now });
  let d = apply(data, r.changes);
  assert.equal(planSlotFor(d, "2026-10-29").plan, undefined);
  const saved = saveSessionAsPlanDay(d, r.sessionId, { restSeconds: 90, now });
  d = apply(d, saved.changes);
  const plan = activePlan(d)!;
  assert.equal(plan.name, "My plan");
  const thu = dayForWeekday(d, plan.id, 4)!;
  assert.equal(thu.name, "Legs");
  assert.deepEqual(exercisesOfDay(d, thu.id).map((e) => [e.sets, e.repsMin, e.repsMax, e.targetUnit]), [[3, 8, 12, "reps"], [1, 30, 30, "seconds"]]);
  // the session now counts as that plan day being done
  assert.equal(d.sessions.find((s) => s.id === r.sessionId)!.planDayId, thu.id);
});

test("with a weekly plan, saving replaces that weekday's workout and keeps the others", () => {
  const { data, planId } = seededData();
  const before = data.planDays.filter((x) => x.planId === planId).length;
  const old = dayForWeekday(data, planId, 4);
  const r = logWorkout(data, { date: "2026-10-29", title: "My Thursday", minutes: 30, notes: "", items: items(), units: "kg", now });
  let d = apply(data, r.changes);
  d = apply(d, saveSessionAsPlanDay(d, r.sessionId, { restSeconds: 60, now }).changes);
  assert.equal(d.planDays.filter((x) => x.planId === planId).length, old ? before : before + 1);
  const thu = dayForWeekday(d, planId, 4)!;
  assert.equal(thu.name, "My Thursday");
  assert.equal(exercisesOfDay(d, thu.id).length, 2);
  assert.equal(exercisesOfDay(d, thu.id)[0].restSeconds, 60);
});

test("deleting a workout removes it and its sets, so the day is no longer done", () => {
  const { data, planId } = seededData();
  const plan = data.plans.find((p) => p.id === planId)!;
  const day = dayForWeekday(data, planId, 1)!;
  const r = startSession(data, { plan, day, date: "2026-10-26", now: new Date(2026, 9, 26, 18) });
  let d = apply(data, r.changes);
  const se = sessionExercisesOf(d, r.sessionId)[0];
  d = apply(d, finishSet(d, r.active, { seId: se.id, expectedSetNumber: 1, reps: 10, weight: 5, units: "kg", now: new Date(2026, 9, 26, 18, 5) }).changes);
  assert.equal(d.sets.length, 1);
  d = apply(d, deleteSession(d, r.sessionId));
  assert.equal(d.sessions.length, 0);
  assert.equal(d.sessionExercises.length, 0);
  assert.equal(d.sets.length, 0);
  assert.equal(buildDay(makeContext(d, "2026-10-29"), "2026-10-26").sessions.length, 0);
});
