import { test } from "node:test";
import assert from "node:assert/strict";
import { BUILT_IN_EXERCISES } from "../src/lib/data/exercises";
import { muscleTargets, musclesFor } from "../src/lib/data/muscles";
import { ANIMATIONS, animationFor } from "../src/features/animation/library";
import { angleOf, jointProbe, joints, withBody, wrap, type Joints, type Pose, type Pt } from "../src/features/animation/figure";

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
  for (const s of ["leg-extension", "lying-leg-curl", "preacher-curl", "chin-up", "db-wrist-curl", "db-reverse-wrist-curl", "farmers-carry", "db-walking-lunge", "cable-rope-hammer-curl", "crunch", "decline-sit-up", "russian-twist", "db-standing-calf-raise", "db-seated-calf-raise", "adductor-rock-back", "lunge-rock", "seated-straight-leg-raise", "side-lunge-rock", "ninety-ninety-foot-lift", "ninety-ninety-knee-lift", "pigeon-backbend", "supine-knee-drop", "side-sit-leg-lift", "low-lunge-quad-stretch", "kneel-to-squat", "couch-stretch", "ninety-ninety-switch"]) assert.ok(slugs.has(s), s);
  // back and core additions
  for (const s of ["back-extension-45", "machine-back-extension", "barbell-romanian-deadlift", "cable-romanian-deadlift", "cable-pull-through", "barbell-good-morning", "cable-good-morning", "superman", "bird-dog", "pull-up", "db-single-arm-row", "cable-face-pull", "wide-grip-cable-row", "reverse-pec-deck", "reverse-crunch", "high-plank", "reverse-plank", "slow-mountain-climber"]) assert.ok(slugs.has(s), s);
  // triceps additions
  for (const s of ["db-overhead-triceps-extension", "cable-overhead-triceps-extension", "skull-crusher", "bench-dip", "db-triceps-kickback", "close-grip-push-up"]) assert.ok(slugs.has(s), s);
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

test("the female figure draws every animation and differs from the male one", () => {
  for (const [key, anim] of Object.entries(ANIMATIONS)) {
    for (const t of [0.1, 0.4, 0.7]) {
      const her = withBody("female", () => anim.at(t, []));
      const json = JSON.stringify(her);
      assert.ok(her.length > 40 && !json.includes("NaN") && !json.includes("null"), `${key} female at t=${t}`);
      assert.notEqual(json, JSON.stringify(withBody("male", () => anim.at(t, []))), `${key} female looks different`);
    }
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

test("every animation moves smoothly: no joint jolts, snaps or parts popping in and out", () => {
  // joints are the same for both bodies; the default (female) one is checked
  for (const [key, anim] of Object.entries(ANIMATIONS)) {
    // one sample per frame at 60 fps, all the way round the loop (including back to the start)
    const n = Math.round(anim.cycle * 60);
    const frames: { j: Joints | null; count: number }[] = [];
    for (let i = 0; i < n; i++) {
      let j: Joints | null = null;
      jointProbe.side = (x) => {
        j ??= x;
      };
      const count = withBody("female", () => anim.at(i / n, [])).length;
      jointProbe.side = null;
      frames.push({ j, count });
    }
    assert.ok(frames.every((f) => f.count === frames[0].count), `${key}: shapes appear or disappear mid-loop`);
    if (!frames[0].j) continue;
    const pts = (j: Joints): Pt[] => [j.hip, j.neck, j.head, ...j.elbow, ...j.hand, ...j.knee, ...j.ankle, ...j.toe];
    for (let i = 0; i < n; i++) {
      const [p, q, r] = [frames[(i - 1 + n) % n], frames[i], frames[(i + 1) % n]].map((f) => pts(f.j as Joints));
      q.forEach((qq, c) => {
        // change of speed between frames: tiny for eased motion, large for a snap or a whip
        const jolt = Math.hypot(r[c][0] - 2 * qq[0] + p[c][0], r[c][1] - 2 * qq[1] + p[c][1]);
        assert.ok(jolt < 0.8, `${key}: joint ${c} jolts by ${jolt.toFixed(2)} at t=${(i / n).toFixed(3)}`);
      });
    }
  }
});
