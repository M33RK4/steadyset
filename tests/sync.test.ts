import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeDb } from "./fakeDb";
import { apply, seededData } from "./helpers";
import { SyncEngine } from "../src/lib/sync/syncEngine";
import { memoryKV } from "../src/lib/store/persistence";
import { instantiateTemplate, dayForWeekday } from "../src/lib/plans/planOps";
import { BALANCED_TONING_BEGINNER } from "../src/lib/data/defaultPlan";
import { emptyAppData } from "../src/lib/domain/types";
import { applyChanges } from "../src/lib/domain/changes";
import { finishSet, sessionExercisesOf, startSession, finishSession } from "../src/lib/session/sessionOps";

const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";

function aliceWorkout() {
  const base = emptyAppData();
  const seed = instantiateTemplate(base, BALANCED_TONING_BEGINNER, { makeActive: true, now: new Date(2026, 9, 1) });
  let data = applyChanges(base, seed.changes);
  const plan = data.plans[0];
  const day = dayForWeekday(data, plan.id, 1)!;
  const s = startSession(data, { plan, day, date: "2026-10-26", now: new Date(2026, 9, 26, 18) });
  data = apply(data, s.changes);
  const se = sessionExercisesOf(data, s.sessionId)[0];
  const f = finishSet(data, s.active, { seId: se.id, expectedSetNumber: 1, reps: 12, weight: 40, units: "kg", now: new Date(2026, 9, 26, 18, 5) });
  const all = [...seed.changes, ...s.changes, ...f.changes];
  data = apply(data, f.changes);
  return { data, changes: all, sessionId: s.sessionId, seId: se.id };
}

test("changes made on one device are available after signing in on another", async () => {
  const db = new FakeDb(ALICE);
  const phone = new SyncEngine(db, ALICE, memoryKV());
  const w = aliceWorkout();
  phone.enqueue(w.changes);
  const out = await phone.flush();
  assert.equal(out.ok, true);
  assert.ok(out.pushed <= w.changes.length, "repeated edits to one row are compacted into one write");
  assert.equal(phone.pendingCount, 0);

  const laptop = new SyncEngine(db, ALICE, memoryKV());
  const loaded = await laptop.load();
  assert.equal(loaded.plans.length, 1);
  assert.equal(loaded.planExercises.length, 24);
  assert.equal(loaded.sessions.length, 1);
  assert.equal(loaded.sets.length, 1);
  assert.equal(loaded.sets[0].weight, 40);
  assert.deepEqual(loaded.sessions[0], w.data.sessions[0]);
});

test("offline edits are queued, survive a restart and are pushed once back online", async () => {
  const db = new FakeDb(ALICE);
  const kv = memoryKV();
  const engine = new SyncEngine(db, ALICE, kv);
  const w = aliceWorkout();
  db.offline = true;
  engine.enqueue(w.changes);
  const r = await engine.flush();
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.reason, "network");
  const queued = engine.pendingCount;
  assert.ok(queued > 0);

  // App restarts while still offline: the queue is read back from storage.
  const restarted = new SyncEngine(db, ALICE, kv);
  assert.equal(restarted.pendingCount, queued);
  db.offline = false;
  const ok = await restarted.flush();
  assert.equal(ok.ok, true);
  assert.equal(restarted.pendingCount, 0);
  assert.equal(db.tables.get("completed_sets")!.size, 1);
});

test("retrying the same set is idempotent and a second set with the same number is rejected", async () => {
  const db = new FakeDb(ALICE);
  const engine = new SyncEngine(db, ALICE, memoryKV());
  const w = aliceWorkout();
  engine.enqueue(w.changes);
  await engine.flush();
  // retry exactly the same changes (e.g. a response was lost)
  engine.enqueue(w.changes);
  assert.equal((await engine.flush()).ok, true);
  assert.equal(db.tables.get("completed_sets")!.size, 1);

  const dupe = { ...w.data.sets[0], id: "33333333-3333-4333-8333-333333333333" };
  engine.enqueue([{ table: "sets", op: "upsert", row: dupe }]);
  const r = await engine.flush();
  assert.equal(r.ok === false && r.reason, "rejected", "permanent errors are dropped, not retried forever");
  assert.equal(engine.pendingCount, 0);
  assert.equal(db.tables.get("completed_sets")!.size, 1);
});

test("one user cannot read or write another user's rows", async () => {
  const db = new FakeDb(ALICE);
  const alice = new SyncEngine(db, ALICE, memoryKV());
  alice.enqueue(aliceWorkout().changes);
  await alice.flush();

  const bob = new SyncEngine(db.as(BOB), BOB, memoryKV());
  const seen = await bob.load();
  assert.equal(seen.plans.length + seen.sessions.length + seen.sets.length, 0);

  // Bob's client trying to write with Alice's id is refused (RLS with-check)
  const evil = new SyncEngine(db.as(BOB), ALICE, memoryKV());
  evil.enqueue([{ table: "plans", op: "upsert", row: { id: "44444444-4444-4444-8444-444444444444", name: "x" } }]);
  const r = await evil.flush();
  assert.equal(r.ok, false);
});

test("edits made while a flush is in flight are not lost", async () => {
  const db = new FakeDb(ALICE);
  const engine = new SyncEngine(db, ALICE, memoryKV());
  const w = aliceWorkout();
  engine.enqueue(w.changes);
  const p = engine.flush();
  // user finishes the session while the first push is still running
  const finished = finishSession(w.data, w.sessionId, { now: new Date(2026, 9, 26, 19) });
  engine.enqueue(finished);
  await p;
  await engine.flush();
  const loaded = await new SyncEngine(db, ALICE, memoryKV()).load();
  assert.equal(loaded.sessions[0].status, "partial");
});

test("loading applies still-pending local changes over server data", async () => {
  const db = new FakeDb(ALICE);
  const kv = memoryKV();
  const engine = new SyncEngine(db, ALICE, kv);
  const { data, changes } = (() => {
    const s = seededData();
    return { data: s.data, changes: instantiateTemplate(emptyAppData(), BALANCED_TONING_BEGINNER, { makeActive: true }).changes };
  })();
  void data;
  engine.enqueue(changes.slice(0, 1)); // plan row only, not flushed
  const loaded = await engine.load();
  assert.equal(loaded.plans.length, 1);
});

test("guest data import keeps history and doesn't duplicate an untouched default plan", async () => {
  const { guestImportChanges, guestHasMeaningfulData } = await import("../src/lib/store/migration");
  const { logActivity } = await import("../src/lib/session/sessionOps");
  const guest0 = seededData().data;
  assert.equal(guestHasMeaningfulData(guest0), false, "a fresh guest has nothing to import");
  const guest = apply(guest0, logActivity(guest0, { date: "2026-10-27", activityType: "Walking", minutes: 30, notes: "", planDay: guest0.planDays[0], plan: guest0.plans[0], now: new Date() }));
  assert.equal(guestHasMeaningfulData(guest), true);
  const account = seededData().data;
  const merged = apply(account, guestImportChanges(guest, account));
  assert.equal(merged.plans.length, 1);
  assert.equal(merged.sessions.length, 1);
  assert.equal(merged.sessions[0].planId, null, "link to the skipped duplicate plan is removed, snapshot kept");
  assert.equal(merged.sessions[0].title, "Walking");
});
