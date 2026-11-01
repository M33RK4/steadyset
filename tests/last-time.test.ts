import { test } from "node:test";
import assert from "node:assert/strict";
import { apply } from "./helpers";
import { logWorkout } from "../src/lib/session/sessionOps";
import { lastTimeFor } from "../src/lib/stats/stats";
import { exerciseIdBySlug } from "../src/lib/data/exercises";
import { emptyAppData, type AppData } from "../src/lib/domain/types";

const now = new Date(2026, 9, 29, 19, 0);
const squat = exerciseIdBySlug("goblet-squat")!;
const plank = exerciseIdBySlug("forearm-plank")!;
const key = { exerciseId: squat, name: "Goblet Squat", repsMax: 12, targetSets: 3, usesWeight: true };

function log(data: AppData, date: string, exerciseId: string, sets: [number, number | null][], units: "kg" | "lb" = "kg") {
  const r = logWorkout(data, { date, title: "Legs", minutes: 30, notes: "", items: [{ exerciseId, sets: sets.map(([reps, weight]) => ({ reps, weight })) }], units, now });
  return apply(data, r.changes);
}

test("last time shows the most recent session's sets", () => {
  let d = emptyAppData();
  assert.equal(lastTimeFor(d, key, "kg"), null);
  d = log(d, "2026-10-15", squat, [[10, 10], [10, 10], [10, 10]]);
  d = log(d, "2026-10-22", squat, [[10, 12], [10, 12], [10, 12]]);
  const last = lastTimeFor(d, key, "kg")!;
  assert.equal(last.entry.date, "2026-10-22");
  assert.equal(last.summary, "3 × 10 at 12 kg");
  assert.equal(last.progress, null);
});

test("uneven sets and mixed weights are listed", () => {
  const d = log(emptyAppData(), "2026-10-22", squat, [[12, 10], [10, 12], [8, 12]]);
  assert.equal(lastTimeFor(d, key, "kg")!.summary, "12, 10, 8 at 10–12 kg");
});

test("weights are shown in the current units", () => {
  const d = log(emptyAppData(), "2026-10-22", squat, [[10, 20], [10, 20], [10, 20]]);
  assert.equal(lastTimeFor(d, key, "lb")!.summary, "3 × 10 at 44.1 lb");
});

test("hitting the top of the range two sessions in a row suggests more weight", () => {
  let d = log(emptyAppData(), "2026-10-15", squat, [[12, 12], [12, 12], [12, 12]]);
  assert.equal(lastTimeFor(d, key, "kg")!.progress, null, "one session is not enough");
  d = log(d, "2026-10-22", squat, [[12, 12], [12, 12], [13, 12]]);
  assert.deepEqual(lastTimeFor(d, key, "kg")!.progress, { kind: "weight", weight: 14.5, step: 2.5 });
});

test("no nudge when a set fell short, a set was missing or the weight changed", () => {
  const top: [number, number][] = [[12, 12], [12, 12], [12, 12]];
  const short = log(log(emptyAppData(), "2026-10-15", squat, top), "2026-10-22", squat, [[12, 12], [12, 12], [11, 12]]);
  assert.equal(lastTimeFor(short, key, "kg")!.progress, null);
  const missing = log(log(emptyAppData(), "2026-10-15", squat, top), "2026-10-22", squat, [[12, 12], [12, 12]]);
  assert.equal(lastTimeFor(missing, key, "kg")!.progress, null);
  const heavier = log(log(emptyAppData(), "2026-10-15", squat, [[12, 10], [12, 10], [12, 10]]), "2026-10-22", squat, top);
  assert.equal(lastTimeFor(heavier, key, "kg")!.progress, null);
});

test("bodyweight and timed holds suggest more reps or time instead", () => {
  const plankKey = { exerciseId: plank, name: "Forearm Plank", repsMax: 30, targetSets: 2, usesWeight: false };
  let d = log(emptyAppData(), "2026-10-15", plank, [[30, null], [32, null]]);
  d = log(d, "2026-10-22", plank, [[30, null], [30, null]]);
  const last = lastTimeFor(d, plankKey, "kg")!;
  assert.equal(last.summary, "2 × 30s");
  assert.deepEqual(last.progress, { kind: "reps" });
});
