import { test } from "node:test";
import assert from "node:assert/strict";
import { BUILT_IN_EXERCISES } from "../src/lib/data/exercises";
import { muscleTargets, musclesFor } from "../src/lib/data/muscles";
import { ANIMATIONS, animationFor } from "../src/features/animation/library";
import { angleOf, joints, wrap, type Pose, type Pt } from "../src/features/animation/figure";

test("muscle names map onto the right areas of the muscle map", () => {
  assert.deepEqual(musclesFor(["Glutes (side)"]), ["abductors"]);
  assert.deepEqual(musclesFor(["Glutes"]), ["glutes"]);
  assert.deepEqual(musclesFor(["Upper back (lats)"]), ["lats"]);
  assert.deepEqual(musclesFor(["Front shoulders", "Rear shoulders"]), ["frontDelts", "rearDelts"]);
  assert.deepEqual(musclesFor(["Shoulders"]), ["frontDelts", "sideDelts", "rearDelts"]);
  assert.deepEqual(musclesFor(["Core"]), ["abs", "obliques"]);
  assert.deepEqual(musclesFor(["Brachialis"]), ["biceps", "forearms"]);
  assert.deepEqual(musclesFor(["Cardiovascular system", "Balance"]), []);
  // custom exercises use free text
  assert.deepEqual(musclesFor(["quads", "  Calves "]), ["quads", "calves"]);
  // an area is never both main and secondary
  const t = muscleTargets({ primaryMuscles: ["Biceps"], secondaryMuscles: ["Brachialis", "Forearms"] });
  assert.deepEqual(t, { primary: ["biceps"], secondary: ["forearms"] });
});

test("every built-in exercise has its own animation and a muscle map", () => {
  for (const e of BUILT_IN_EXERCISES) {
    assert.ok(ANIMATIONS[e.animation], `${e.name} has no animation`);
    assert.notEqual(animationFor(e.animation), ANIMATIONS.generic, `${e.name} falls back to the generic figure`);
    if (e.kind !== "cardio") assert.ok(muscleTargets(e).primary.length > 0, `${e.name} highlights no muscles`);
  }
});

test("the new exercises are in the library", () => {
  const slugs = new Set(BUILT_IN_EXERCISES.map((e) => e.slug));
  for (const s of ["leg-extension", "lying-leg-curl", "preacher-curl", "chin-up", "db-wrist-curl", "db-reverse-wrist-curl", "farmers-carry", "db-walking-lunge", "cable-rope-hammer-curl", "crunch", "decline-sit-up", "russian-twist", "db-standing-calf-raise", "db-seated-calf-raise"]) assert.ok(slugs.has(s), s);
  assert.equal(new Set(BUILT_IN_EXERCISES.map((e) => e.id)).size, BUILT_IN_EXERCISES.length, "ids are unique");
});

test("animations produce valid geometry through the whole movement", () => {
  for (const [key, anim] of Object.entries(ANIMATIONS)) {
    const ex = BUILT_IN_EXERCISES.find((e) => e.animation === key);
    const muscles = ex ? musclesFor(ex.primaryMuscles) : [];
    for (let i = 0; i < 24; i++) {
      const shapes = anim.at(i / 24, muscles);
      assert.ok(shapes.length > 40, `${key} draws a detailed scene`);
      const json = JSON.stringify(shapes);
      assert.ok(!json.includes("NaN") && !json.includes("null"), `${key} has broken geometry at t=${i / 24}`);
    }
    for (const f of anim.frames) assert.ok(f.t >= 0 && f.t < 1 && f.label, `${key} frame`);
  }
});

test("elbows, knees, ankles and wrists only bend the way real joints can", () => {
  // deterministic pseudo-random poses all over the picture
  let seed = 7;
  const rnd = (lo: number, hi: number) => {
    seed = (seed * 16807) % 2147483647;
    return lo + ((seed - 1) / 2147483646) * (hi - lo);
  };
  const turn = (a: Pt, b: Pt, c: Pt) => wrap(angleOf(b, c) - angleOf(a, b));
  for (let n = 0; n < 4000; n++) {
    const hip: Pt = [rnd(60, 140), rnd(40, 120)];
    const pose: Pose = {
      hip,
      torso: [rnd(-180, 180), rnd(-180, 180)],
      head: rnd(-180, 180),
      hands: [
        [rnd(0, 200), rnd(-20, 150)],
        [rnd(0, 200), rnd(-20, 150)],
      ],
      feet: [
        [rnd(0, 200), rnd(40, 150)],
        [rnd(0, 200), rnd(40, 150)],
      ],
      footAngle: [rnd(-180, 180), rnd(-180, 180)],
      wrist: [rnd(-120, 120), rnd(-120, 120)],
    };
    const j = joints(pose);
    for (const i of [0, 1] as const) {
      // elbows flex toward the front of the arm (a turn of 0° to −180°), never backwards
      assert.ok(turn(j.neck, j.elbow[i], j.hand[i]) <= 0.5, "elbow bent backwards");
      // knees flex toward the back of the thigh (0° to +180°)
      assert.ok(turn(j.hip, j.knee[i], j.ankle[i]) >= -0.5, "knee bent backwards");
      // ankles between fully pointed and fully flexed
      const ankle = wrap(angleOf(j.ankle[i], j.toe[i]) - angleOf(j.knee[i], j.ankle[i]));
      assert.ok(ankle >= -118.5 && ankle <= -7.5, `ankle out of range: ${ankle}`);
      // wrists within ±75°
      assert.ok(Math.abs(wrap(j.handAngle[i] - angleOf(j.elbow[i], j.hand[i]))) <= 75.5, "wrist out of range");
    }
  }
});
