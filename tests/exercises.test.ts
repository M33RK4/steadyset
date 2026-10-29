import { test } from "node:test";
import assert from "node:assert/strict";
import { BUILT_IN_EXERCISES } from "../src/lib/data/exercises";

test("every built-in exercise explains what it is in plain words", () => {
  for (const e of BUILT_IN_EXERCISES) {
    assert.ok(e.summary && e.summary.length >= 60, `${e.name} needs a description`);
    assert.ok(e.summary.length <= 320, `${e.name}'s description should stay short`);
  }
});
