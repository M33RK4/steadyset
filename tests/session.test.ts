import { test } from "node:test";
import assert from "node:assert/strict";
import { seededData, apply } from "./helpers";
import {
  completeTimedItem,
  discardSession,
  finishSession,
  finishSet,
  nextPendingExercise,
  selectExercise,
  sessionExercisesOf,
  sessionProgress,
  setsOf,
  skipExercise,
  startSession,
  undoLastSet,
  type ActiveWorkout,
} from "../src/lib/session/sessionOps";
import { dayForWeekday } from "../src/lib/plans/planOps";
import { remainingMs } from "../src/lib/timer/restTimer";
import type { AppData } from "../src/lib/domain/types";

function startMonday() {
  const { data, planId } = seededData();
  const plan = data.plans.find((p) => p.id === planId)!;
  const day = dayForWeekday(data, planId, 1)!;
  const now = new Date(2026, 9, 26, 18, 0);
  const r = startSession(data, { plan, day, date: "2026-10-26", now });
  return { data: apply(data, r.changes), active: r.active, sessionId: r.sessionId, now };
}

function finish(data: AppData, active: ActiveWorkout, seId: string, n: number, t: number) {
  return finishSet(data, active, { seId, expectedSetNumber: n, reps: 10, weight: 20, units: "kg", now: new Date(t) });
}

test("starting a session snapshots the plan day's exercises in order", () => {
  const { data, sessionId } = startMonday();
  const list = sessionExercisesOf(data, sessionId);
  assert.deepEqual(
    list.map((e) => e.name),
    ["Hip Thrust Machine", "Dumbbell Romanian Deadlift", "Leg Press", "Hip Abduction Machine", "Seated Leg Curl"],
  );
  assert.equal(list[0].targetSets, 3);
  assert.equal(list[0].restSeconds, 90);
  const s = data.sessions.find((x) => x.id === sessionId)!;
  assert.equal(s.status, "in_progress");
  assert.equal(s.localDate, "2026-10-26");
  assert.equal(s.planName, "Balanced Toning — Beginner");
});

test("full exercise flow: set → rest timer → next set → final set without timer", () => {
  let { data, active, sessionId } = startMonday();
  const hip = sessionExercisesOf(data, sessionId)[0];
  let r = selectExercise(data, active, hip.id, new Date(1_000));
  data = apply(data, r.changes);
  active = r.active!;
  assert.equal(data.sessionExercises.find((e) => e.id === hip.id)!.status, "active");
  assert.equal(active.currentExerciseId, hip.id);

  r = finish(data, active, hip.id, 1, 10_000);
  data = apply(data, r.changes);
  active = r.active!;
  assert.equal(r.event, "set-recorded");
  assert.equal(setsOf(data, hip.id).length, 1);
  assert.equal(setsOf(data, hip.id)[0].weight, 20);
  assert.equal(active.timer.status, "running");
  assert.equal(remainingMs(active.timer, 10_000), 90_000, "uses the exercise's configured rest");
  assert.equal(active.timer.nextSetNumber, 2);

  r = finish(data, active, hip.id, 2, 110_000);
  data = apply(data, r.changes);
  active = r.active!;
  r = finish(data, active, hip.id, 3, 210_000);
  data = apply(data, r.changes);
  active = r.active!;
  assert.equal(r.event, "exercise-complete");
  assert.equal(active.timer.status, "idle", "no rest timer after the final set");
  assert.equal(data.sessionExercises.find((e) => e.id === hip.id)!.status, "completed");
  assert.equal(nextPendingExercise(data, sessionId, hip.id)!.name, "Dumbbell Romanian Deadlift");
});

test("double-tapping Finish Set records the set only once", () => {
  let { data, active, sessionId } = startMonday();
  const hip = sessionExercisesOf(data, sessionId)[0];
  const r1 = finish(data, active, hip.id, 1, 1_000);
  data = apply(data, r1.changes);
  active = r1.active!;
  const r2 = finish(data, active, hip.id, 1, 1_050); // stale expected number from the double tap
  assert.equal(r2.event, "ignored-duplicate");
  assert.equal(r2.changes.length, 0);
  assert.equal(setsOf(apply(data, r2.changes), hip.id).length, 1);
});

test("undo removes the last set, reopens a completed exercise and clears its timer", () => {
  let { data, active, sessionId } = startMonday();
  const rdl = sessionExercisesOf(data, sessionId)[1]; // 2 sets
  for (const n of [1, 2]) {
    const r = finish(data, active, rdl.id, n, n * 1000);
    data = apply(data, r.changes);
    active = r.active!;
  }
  assert.equal(data.sessionExercises.find((e) => e.id === rdl.id)!.status, "completed");
  const u = undoLastSet(data, active, rdl.id, new Date(5_000));
  data = apply(data, u.changes);
  assert.equal(setsOf(data, rdl.id).length, 1);
  assert.equal(data.sessionExercises.find((e) => e.id === rdl.id)!.status, "active");
  assert.equal(u.active!.timer.status, "idle");
});

test("skipping, ending early and completing everything give distinct statuses", () => {
  let { data, active, sessionId } = startMonday();
  const list = sessionExercisesOf(data, sessionId);
  let r = finish(data, active, list[0].id, 1, 1000);
  data = apply(data, r.changes);
  active = r.active!;
  const sk = skipExercise(data, active, list[1].id, new Date(2000));
  data = apply(data, sk.changes);
  assert.equal(data.sessionExercises.find((e) => e.id === list[1].id)!.status, "skipped");

  const partial = apply(data, finishSession(data, sessionId, { now: new Date(2026, 9, 26, 18, 40) }));
  const s = partial.sessions.find((x) => x.id === sessionId)!;
  assert.equal(s.status, "partial");
  assert.equal(s.durationSeconds, 40 * 60);

  // complete every exercise
  for (const se of sessionExercisesOf(data, sessionId)) {
    const done = setsOf(data, se.id).length;
    for (let n = done + 1; n <= se.targetSets; n++) {
      r = finish(data, active, se.id, n, n * 1000);
      data = apply(data, r.changes);
      active = r.active!;
    }
  }
  assert.ok(sessionProgress(data, sessionId).allDone);
  const full = apply(data, finishSession(data, sessionId, { now: new Date(2026, 9, 26, 19, 0) }));
  assert.equal(full.sessions.find((x) => x.id === sessionId)!.status, "completed");
});

test("cardio items record duration, not strength sets", () => {
  const { data: base, planId } = seededData();
  const plan = base.plans.find((p) => p.id === planId)!;
  const day = dayForWeekday(base, planId, 3)!;
  const r = startSession(base, { plan, day, date: "2026-10-28", now: new Date() });
  let data = apply(base, r.changes);
  const items = sessionExercisesOf(data, r.sessionId);
  assert.equal(items[0].targetUnit, "minutes");
  for (const it of items) data = apply(data, completeTimedItem(data, r.active, it.id, 22, new Date()).changes);
  assert.equal(data.sets.length, 0);
  assert.equal(items.length, sessionProgress(data, r.sessionId).completed);
  assert.equal(data.sessionExercises.find((e) => e.id === items[0].id)!.durationSeconds, 22 * 60);
});

test("discard only works when nothing was recorded", () => {
  let { data, active, sessionId } = startMonday();
  assert.ok(discardSession(data, sessionId).length > 0);
  const hip = sessionExercisesOf(data, sessionId)[0];
  data = apply(data, finish(data, active, hip.id, 1, 1000).changes);
  assert.equal(discardSession(data, sessionId).length, 0);
});
