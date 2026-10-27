import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adjustTimer,
  IDLE_TIMER,
  isStale,
  markAlerted,
  pauseTimer,
  progress,
  remainingMs,
  resumeTimer,
  skipTimer,
  startTimer,
  tick,
} from "../src/lib/timer/restTimer";

const meta = { runId: "r1", sessionExerciseId: "se1", nextSetNumber: 2 };

test("remaining time is derived from the absolute end timestamp", () => {
  const t = startTimer(90, 1_000, meta);
  assert.equal(remainingMs(t, 1_000), 90_000);
  assert.equal(remainingMs(t, 31_000), 60_000);
  // A tab that was throttled for 2 minutes still reports the correct (clamped) value.
  assert.equal(remainingMs(t, 1_000 + 120_000), 0);
  assert.ok(Math.abs(progress(t, 46_000) - 0.5) < 1e-9);
});

test("completion fires the alert exactly once, even across repeated ticks", () => {
  let t = startTimer(30, 0, meta);
  let r = tick(t, 10_000);
  assert.equal(r.shouldAlert, false);
  r = tick(t, 30_000);
  assert.equal(r.state.status, "done");
  assert.equal(r.shouldAlert, true);
  t = markAlerted(r.state);
  // further ticks (interval, visibilitychange, setTimeout all racing) never alert again
  for (const now of [30_001, 31_000, 99_999]) assert.equal(tick(t, now).shouldAlert, false);
});

test("a timer persisted mid-run and reloaded after it expired alerts once on reload", () => {
  const saved = JSON.parse(JSON.stringify(startTimer(60, 0, meta)));
  const r = tick(saved, 75_000);
  assert.equal(r.state.status, "done");
  assert.equal(r.shouldAlert, true);
  assert.equal(r.state.finishedAt, 60_000);
  const reloadedAgain = JSON.parse(JSON.stringify(markAlerted(r.state)));
  assert.equal(tick(reloadedAgain, 80_000).shouldAlert, false);
});

test("pause freezes, resume continues from the frozen value", () => {
  let t = startTimer(60, 0, meta);
  t = pauseTimer(t, 20_000);
  assert.equal(t.status, "paused");
  assert.equal(remainingMs(t, 50_000), 40_000); // time passing while paused doesn't count
  t = resumeTimer(t, 100_000);
  assert.equal(t.status, "running");
  assert.equal(remainingMs(t, 100_000), 40_000);
  assert.equal(tick(t, 139_999).state.status, "running");
  assert.equal(tick(t, 140_000).state.status, "done");
});

test("pausing a timer that already ran out completes it instead", () => {
  const t = pauseTimer(startTimer(10, 0, meta), 15_000);
  assert.equal(t.status, "done");
});

test("skip ends the rest silently", () => {
  const t = skipTimer(startTimer(60, 0, meta), 5_000);
  assert.equal(t.status, "done");
  assert.equal(tick(t, 6_000).shouldAlert, false);
  assert.equal(skipTimer(IDLE_TIMER, 0), IDLE_TIMER);
});

test("adjust adds and removes time but never below one second", () => {
  let t = startTimer(60, 0, meta);
  t = adjustTimer(t, 15, 0);
  assert.equal(remainingMs(t, 0), 75_000);
  t = adjustTimer(t, -500, 10_000);
  assert.equal(remainingMs(t, 10_000), 1_000);
});

test("stale completions are detected so the UI can stay silent", () => {
  const done = tick(startTimer(30, 0, meta), 30_000).state;
  assert.equal(isStale(done, 40_000), false);
  assert.equal(isStale(done, 30_000 + 61_000), true);
});
