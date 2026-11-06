import { test } from "node:test";
import assert from "node:assert/strict";
import { seededData, apply } from "./helpers";
import { logWorkout, sessionExercisesOf, setsOf } from "../src/lib/session/sessionOps";
import { activePlan, formatTarget } from "../src/lib/plans/planOps";
import { buildDay, makeContext, moveDay, weekSummary } from "../src/lib/calendar/calendar";
import { exerciseIdBySlug } from "../src/lib/data/exercises";
import { emptyAppData } from "../src/lib/domain/types";
import { cleanNumberText, plural } from "../src/lib/util/text";

const now = new Date(2026, 9, 29, 19, 0); // a Thursday

test("number boxes keep decimals, one point, and nothing but digits", () => {
  assert.equal(cleanNumberText("42.", false), "42.");
  assert.equal(cleanNumberText("42.5", false), "42.5");
  assert.equal(cleanNumberText("10,5", false), "10.5");
  assert.equal(cleanNumberText("1.2.3", false), "1.23");
  assert.equal(cleanNumberText("-5a", false), "5");
  assert.equal(cleanNumberText("12.5", true), "125");
  assert.equal(cleanNumberText("", true), "");
});

test("counts read properly in the singular", () => {
  assert.equal(plural(1, "set"), "1 set");
  assert.equal(plural(0, "set"), "0 sets");
  assert.equal(plural(3, "exercise"), "3 exercises");
  const target = { sets: 1, repsMin: 1, repsMax: 1, targetUnit: "reps", perSide: false };
  assert.equal(formatTarget(target), "1 × 1 rep");
  assert.equal(formatTarget({ ...target, repsMax: 12 }), "1 × 1–12 reps");
});

test("editing a workout that was left unfinished doesn't make it complete", () => {
  const data = emptyAppData();
  const squat = exerciseIdBySlug("goblet-squat")!;
  const plank = exerciseIdBySlug("forearm-plank")!;
  // a finished one first, so there's something to edit, then make it unfinished the way a real one is
  const first = logWorkout(data, { date: "2026-10-29", title: "Legs", minutes: 40, notes: "", units: "kg", now, items: [{ exerciseId: squat, sets: [{ reps: 10, weight: 20 }] }, { exerciseId: plank, sets: [{ reps: null, weight: null }] }] });
  let d = apply(data, first.changes);
  assert.equal(d.sessions[0].status, "partial", "an exercise with nothing in it isn't done");
  const list = sessionExercisesOf(d, first.sessionId);
  // aiming for three sets of squats, as a plan would
  d = { ...d, sessionExercises: d.sessionExercises.map((e) => (e.id === list[0].id ? { ...e, targetSets: 3, repsMin: 8, repsMax: 12 } : e)) };

  const edit = (sets: { reps: number | null; weight: number | null }[], plankSets: { reps: number | null; weight: number | null }[]) =>
    apply(d, logWorkout(d, { date: "2026-10-29", title: "Legs", minutes: 45, notes: "", units: "kg", now, sessionId: first.sessionId, items: [{ exerciseId: squat, sets }, { exerciseId: plank, sets: plankSets }] }).changes);

  // only a weight corrected: still unfinished, still aiming for three sets, the plank still there
  let e = edit([{ reps: 10, weight: 25 }], [{ reps: null, weight: null }]);
  assert.equal(e.sessions[0].status, "partial");
  let rows = sessionExercisesOf(e, first.sessionId);
  assert.deepEqual(rows.map((r) => [r.name, r.targetSets, r.status]), [["Goblet Squat", 3, "active"], ["Forearm Plank", 1, "pending"]]);
  assert.deepEqual([rows[0].repsMin, rows[0].repsMax], [8, 12]);

  // everything really done now: it's complete
  e = edit([{ reps: 10, weight: 25 }, { reps: 10, weight: 25 }, { reps: 10, weight: 25 }], [{ reps: 30, weight: null }]);
  assert.equal(e.sessions[0].status, "completed");
  rows = sessionExercisesOf(e, first.sessionId);
  assert.deepEqual(rows.map((r) => [r.status, setsOf(e, r.id).length]), [["completed", 3], ["completed", 1]]);
});

test("a finished workout stays finished when a set is removed from it", () => {
  const data = emptyAppData();
  const squat = exerciseIdBySlug("goblet-squat")!;
  const first = logWorkout(data, { date: "2026-10-29", title: "Legs", minutes: 40, notes: "", units: "kg", now, items: [{ exerciseId: squat, sets: [{ reps: 10, weight: 20 }, { reps: 10, weight: 20 }] }] });
  const d = apply(data, first.changes);
  const e = apply(d, logWorkout(d, { date: "2026-10-29", title: "Legs", minutes: 40, notes: "", units: "kg", now, sessionId: first.sessionId, items: [{ exerciseId: squat, sets: [{ reps: 10, weight: 20 }] }] }).changes);
  assert.equal(e.sessions[0].status, "completed");
});

test("a moved workout says where it went, and the week counts every session", () => {
  const { data } = seededData();
  const plan = activePlan(data)!;
  assert.ok(plan);
  const today = "2026-11-04"; // a Wednesday
  const ctx = makeContext(data, today);
  const from = "2026-11-05"; // Thursday has a workout in the seeded plan
  assert.ok(buildDay(ctx, from).planned);
  const moved = apply(data, moveDay(ctx, from, "2026-11-07", new Date(2026, 10, 4, 9)));
  const after = makeContext(moved, today);
  const day = buildDay(after, from);
  assert.equal(day.status, "skipped");
  assert.equal(day.movedTo, "2026-11-07");
  assert.equal(buildDay(after, "2026-11-07").plannedSource, "moved");

  // two sessions on one day are two sessions
  const a = logWorkout(moved, { date: today, title: "Morning", minutes: 20, notes: "", units: "kg", now: new Date(2026, 10, 4, 9), items: [{ exerciseId: exerciseIdBySlug("goblet-squat")!, sets: [{ reps: 10, weight: 10 }] }] });
  const d1 = apply(moved, a.changes);
  const b = logWorkout(d1, { date: today, title: "Evening", minutes: 20, notes: "", units: "kg", now: new Date(2026, 10, 4, 19), items: [{ exerciseId: exerciseIdBySlug("goblet-squat")!, sets: [{ reps: 10, weight: 10 }] }] });
  const week = weekSummary(makeContext(apply(d1, b.changes), today), 1);
  assert.equal(week.doneCount, 1, "one day");
  assert.equal(week.sessionCount, 2, "two sessions");
});
