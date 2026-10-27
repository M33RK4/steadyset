import { test } from "node:test";
import assert from "node:assert/strict";
import { buddyStatusLine, LIVE_IDLE_LIMIT_MS, summarizeBuddyWorkout } from "../src/lib/buddies/live";
import { cleanInviteCode } from "../src/lib/buddies/api";
import { normalizePreferences, resolveMode } from "../src/lib/themes";
import { prefsFromRow, prefsToRow } from "../src/lib/sync/mappers";
import { DEFAULT_PREFERENCES, type CompletedSet, type Preferences, type SessionExercise, type WorkoutSession } from "../src/lib/domain/types";

const T0 = Date.parse("2026-10-28T17:00:00Z");
const iso = (minutes: number) => new Date(T0 + minutes * 60_000).toISOString();

const session = (over: Partial<WorkoutSession> = {}): WorkoutSession => ({
  id: "s1",
  planId: null,
  planDayId: null,
  localDate: "2026-10-28",
  title: "Upper Body A",
  planName: null,
  kind: "strength",
  status: "in_progress",
  startedAt: iso(0),
  endedAt: null,
  durationSeconds: null,
  activityType: null,
  notes: "",
  ...over,
});

const ex = (id: string, position: number, over: Partial<SessionExercise> = {}): SessionExercise => ({
  id,
  sessionId: "s1",
  exerciseId: null,
  position,
  name: `Exercise ${id}`,
  targetSets: 3,
  repsMin: 10,
  repsMax: 12,
  targetUnit: "reps",
  perSide: false,
  restSeconds: 60,
  usesWeight: true,
  status: "pending",
  startedAt: null,
  completedAt: null,
  durationSeconds: null,
  ...over,
});

const set = (id: string, sessionExerciseId: string, setNumber: number, minutes: number): CompletedSet => ({
  id,
  sessionExerciseId,
  sessionId: "s1",
  setNumber,
  reps: 10,
  weight: 20,
  weightUnit: "kg",
  durationSeconds: null,
  completedAt: iso(minutes),
});

test("a buddy's live workout shows exercises in order with ticked-off sets", () => {
  const live = summarizeBuddyWorkout(
    session(),
    [ex("b", 2), ex("a", 1, { status: "completed", completedAt: iso(9) }), ex("c", 3, { targetUnit: "minutes", durationSeconds: null })],
    [set("1", "a", 1, 3), set("2", "a", 2, 6), set("3", "a", 3, 9), set("4", "b", 1, 12)],
    T0 + 13 * 60_000,
  );
  assert.equal(live.isLive, true);
  assert.deepEqual(
    live.exercises.map((e) => [e.id, e.setsDone, e.status]),
    [
      ["a", 3, "completed"],
      ["b", 1, "pending"],
      ["c", 0, "pending"],
    ],
  );
  assert.equal(live.exercises[2].timed, true);
  assert.equal(live.doneExercises, 1);
  assert.equal(live.totalExercises, 3);
  assert.equal(live.setsDone, 4);
  assert.equal(live.lastActivityAt, iso(12));
  assert.match(buddyStatusLine(live, T0 + 13 * 60_000), /^Training now · Upper Body A · 13 min in$/);
});

test("a set delivered twice counts once, and never more than the target", () => {
  const live = summarizeBuddyWorkout(session(), [ex("a", 1, { targetSets: 2 })], [set("1", "a", 1, 1), set("1b", "a", 1, 1), set("2", "a", 2, 2), set("3", "a", 3, 3)], T0);
  assert.equal(live.exercises[0].setsDone, 2);
});

test("finished and forgotten sessions are not shown as live", () => {
  const done = summarizeBuddyWorkout(session({ status: "completed", endedAt: iso(40) }), [ex("a", 1)], [], T0 + 41 * 60_000);
  assert.equal(done.isLive, false);
  assert.equal(buddyStatusLine(done), "Finished Upper Body A today");

  const forgotten = summarizeBuddyWorkout(session(), [ex("a", 1)], [set("1", "a", 1, 5)], T0 + 5 * 60_000 + LIVE_IDLE_LIMIT_MS + 1);
  assert.equal(forgotten.isLive, false);

  const none = summarizeBuddyWorkout(null, [], []);
  assert.equal(none.isLive, false);
  assert.equal(buddyStatusLine(none), "Hasn't trained today yet");
});

test("invite codes are cleaned up the way people type them", () => {
  assert.equal(cleanInviteCode(" abc-2xy "), "ABC2XY");
  assert.equal(cleanInviteCode("ab c2 xy"), "ABC2XY");
});

test("old themes become Lily or Summit with the matching light/dark mode", () => {
  const p = (theme: string, extra: Partial<Preferences> = {}) => normalizePreferences({ ...DEFAULT_PREFERENCES, theme: theme as Preferences["theme"], ...extra });
  assert.deepEqual([p("blush").theme, p("blush").colorMode], ["lily", "light"]);
  assert.deepEqual([p("paper").theme, p("paper").colorMode], ["lily", "light"]);
  assert.deepEqual([p("ember").theme, p("ember").colorMode], ["summit", "dark"]);
  assert.deepEqual([p("graphite").theme, p("graphite").colorMode], ["summit", "dark"]);
  assert.deepEqual([p("summit", { colorMode: "light" }).theme, p("summit", { colorMode: "light" }).colorMode], ["summit", "light"]);
  assert.equal(p("nonsense").theme, "lily");
  // an explicit choice made after the upgrade wins over the legacy default
  assert.equal(p("ember", { colorMode: "light" }).colorMode, "light");
});

test("colour mode resolves against the device setting only for 'system'", () => {
  assert.equal(resolveMode("system", true), "dark");
  assert.equal(resolveMode("system", false), "light");
  assert.equal(resolveMode("dark", false), "dark");
  assert.equal(resolveMode("light", true), "light");
});

test("theme and colour mode sync to the database and back", () => {
  const prefs: Preferences = { ...DEFAULT_PREFERENCES, theme: "summit", colorMode: "dark" };
  const row = prefsToRow(prefs, "u1");
  assert.equal(row.theme, "summit");
  assert.equal(row.color_mode, "dark");
  assert.deepEqual(prefsFromRow(row, DEFAULT_PREFERENCES), prefs);
  // a row saved by the old app version is upgraded on load
  const old = prefsFromRow({ theme: "ember" }, DEFAULT_PREFERENCES);
  assert.equal(old.theme, "summit");
  assert.equal(old.colorMode, "dark");
});
