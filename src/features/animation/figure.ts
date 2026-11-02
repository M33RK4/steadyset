// A small 2D rig for exercise demonstrations. Poses are authored as hip position, torso/head
// angles and hand/foot *targets*. Elbows and knees are solved with two-bone IK and always bend
// the way real joints do (elbows flex toward the front of the arm, knees toward the back of the
// leg); ankles and wrists are kept inside their natural range. The body is then drawn as shaded,
// outlined parts — skin with muscle definition, t-shirt, shorts, socks, trainers, face and hair.
// Output is a list of plain shape objects; ./render turns them into SVG.

import type { MuscleId } from "@/lib/data/muscles";

export type Pt = [number, number];

/** Colour roles; ./render maps them to the theme's --fig-* colours. */
export type Tone =
  | "line"
  | "skin"
  | "skinFar"
  | "skinShade"
  | "hair"
  | "lips"
  | "shirt"
  | "shirtFar"
  | "shirtShade"
  | "shorts"
  | "shortsFar"
  | "stripe"
  | "sock"
  | "shoe"
  | "shoeFar"
  | "sole"
  | "metal"
  | "metalDark"
  | "metalLight"
  | "pad"
  | "padLight"
  | "plate"
  | "plateDark"
  | "plateLight"
  | "cable"
  | "rubber"
  | "mat"
  | "matLine"
  | "floor"
  | "floorLine"
  | "wall"
  | "mirror"
  | "screen"
  | "muscle"
  | "shadow"
  | "accent"
  | "guide"
  | "white";

export type Stop = { o: number; tone: Tone; shade?: number; op?: number };
export type Grad = { kind: "linear"; a: Pt; b: Pt; stops: Stop[] } | { kind: "radial"; c: Pt; r: number; f?: Pt; stops: Stop[] };

interface Paint {
  tone: Tone;
  /** lighten (+) / darken (−) the tone by a percentage */
  shade?: number;
  grad?: Grad;
  /** outline colour (filled shapes) */
  stroke?: Tone;
  strokeShade?: number;
  sw?: number;
  op?: number;
}

export type Shape =
  | ({ k: "line"; a: Pt; b: Pt; w: number; dash?: string; cap?: "round" | "butt" } & Paint)
  | ({ k: "circle"; c: Pt; r: number; fill?: boolean; w?: number; dash?: string } & Paint)
  | ({ k: "ellipse"; c: Pt; rx: number; ry: number; rot?: number } & Paint)
  | ({ k: "rect"; x: number; y: number; w: number; h: number; rx?: number; fill?: boolean; rot?: number; cx?: number; cy?: number; dash?: string } & Paint)
  | ({ k: "path"; d: string; w: number; fill?: boolean; dash?: string } & Paint)
  | ({ k: "poly"; pts: Pt[]; w: number; dash?: string } & Paint)
  | ({ k: "text"; at: Pt; text: string; size: number; weight?: number; anchor?: "start" | "middle" | "end"; rot?: number } & Paint);

export const L = { torso1: 22, torso2: 22, neck: 5, head: 8, upper: 24, fore: 22, thigh: 30, shin: 30, foot: 9 };
export const FLOOR = 135;
/** Lowest a toe sits: a foot flat on the floor (the sole's thickness below it). */
const TOE_FLOOR = 133.6;

/**
 * Which body the figure is drawn with (the "Exercise body" setting). The female figure has a
 * ponytail, a fitted tank top, a curvier torso, slimmer arms and leggings; poses are the same.
 * Set around a drawing call with `withBody`.
 */
let female = false;
export function withBody<T>(body: "male" | "female", draw: () => T): T {
  const was = female;
  female = body === "female";
  try {
    return draw();
  } finally {
    female = was;
  }
}

export type HandKind = "fist" | "flat";

/** Side-view pose. Angles in degrees, SVG convention: 0 = right, 90 = down, -90 = up. */
export interface Pose {
  hip: Pt;
  torso: [number, number];
  head: number;
  hands: [Pt, Pt]; // [far, near]
  feet: [Pt, Pt]; // [far, near]
  /** foot direction in degrees (kept within the ankle's range relative to the shin) */
  footAngle?: [number, number];
  /** hand bend at the wrist, degrees relative to the forearm (kept within ±75°) */
  wrist?: [number, number];
  /** "flat" for hands pressed on the floor or a bench; default a closed grip */
  handKind?: [HandKind, HandKind];
  /**
   * Limbs whose hands / feet travel in a straight line between poses, e.g. feet on a sled that
   * runs on rails. Otherwise moving limbs swing naturally around the shoulder and elbow (hip and
   * knee), and hands or feet that stay put between two poses stay planted.
   */
  straight?: ("hands" | "feet")[];
  /** On the way from this pose to the next, how high each foot lifts mid-move (a step). */
  lift?: [number, number];
  /**
   * For legs turning out of the side-on view (knees dropping toward or away from the camera):
   * where the knees appear. The legs are drawn through them, the bones looking shorter as they
   * point toward or away from the viewer, and `feet` are then the ankles exactly.
   */
  knees?: [Pt, Pt];
  /** With `knees`: where the toes appear (a foot pivoting on its heel looks shorter mid-turn). */
  toes?: [Pt, Pt];
  /**
   * Like `knees`, for arms flaring out of the side-on view (a face pull, a reverse fly): where
   * the elbows appear; the arms are drawn through them and `hands` are then exact.
   */
  elbows?: [Pt, Pt];
  /**
   * With `elbows`: between poses the upper arms swing round the shoulders and the forearms round
   * the elbows (a rowing arm, arms folded on a hinging body), instead of gliding in straight lines.
   */
  swingArms?: boolean;
}

export const rad = (d: number) => (d * Math.PI) / 180;
export const deg = (r: number) => (r * 180) / Math.PI;
export const dir = (d: number, len: number, from: Pt): Pt => [from[0] + Math.cos(rad(d)) * len, from[1] + Math.sin(rad(d)) * len];
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const lerpPt = (a: Pt, b: Pt, t: number): Pt => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
export const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
export const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
export const mul = (a: Pt, s: number): Pt => [a[0] * s, a[1] * s];
export const len = (a: Pt) => Math.hypot(a[0], a[1]);
export const unit = (a: Pt): Pt => {
  const l = len(a) || 1e-6;
  return [a[0] / l, a[1] / l];
};
/** Rotate +90° (clockwise on screen): for a bone pointing down the body, this points backward. */
export const perp = (u: Pt): Pt => [-u[1], u[0]];
export const angleOf = (a: Pt, b: Pt) => deg(Math.atan2(b[1] - a[1], b[0] - a[0]));
/** Angle wrapped into (−180, 180]. */
export const wrap = (a: number) => {
  let x = ((a + 180) % 360 + 360) % 360 - 180;
  if (x === -180) x = 180;
  return x;
};
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const f2 = (p: Pt) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`;

/** Two-bone IK: joint position between root and target, bending to one side. */
export function solve(root: Pt, target: Pt, a: number, b: number, bend: number): Pt {
  const dx = target[0] - root[0];
  const dy = target[1] - root[1];
  const d = Math.min(Math.max(Math.hypot(dx, dy), Math.abs(a - b) + 0.01), a + b - 0.01);
  const base = Math.atan2(dy, dx);
  const off = Math.acos(Math.min(1, Math.max(-1, (a * a + d * d - b * b) / (2 * a * d))));
  const ang = base - bend * off;
  return [root[0] + Math.cos(ang) * a, root[1] + Math.sin(ang) * a];
}

/** Point at distance `len` from root toward target (limb can't stretch beyond its length). */
function reach(root: Pt, target: Pt, l: number): Pt {
  const d = sub(target, root);
  const dl = len(d);
  if (dl <= l) return target;
  return add(root, mul(d, l / dl));
}

/**
 * IK that respects anatomy: of the two possible middle joints, pick the one where the lower bone
 * turns the right way. `flex` −1 = elbow (forearm turns toward the front of the arm),
 * +1 = knee (shin turns toward the back of the thigh).
 */
function anatomical(root: Pt, target: Pt, a: number, b: number, flex: 1 | -1): Pt {
  const turn = (joint: Pt) => wrap(angleOf(joint, reach(joint, target, b)) - angleOf(root, joint)) * flex;
  const j1 = solve(root, target, a, b, 1);
  const j2 = solve(root, target, a, b, -1);
  return turn(j1) >= turn(j2) ? j1 : j2;
}

/** How far before full reach a limb starts easing into straight (soft IK). */
const SOFT = 1.6;
/**
 * Poses often put a hand or foot well beyond reach just to say "this limb is straight". Past
 * this much overshoot the limb looks the same, so targets are held to it; that keeps in-between
 * positions on the limb's natural path instead of being dragged toward a far-off point.
 */
const OVER = 3;

/**
 * Soft IK: as a target nears the limb's full length, the limb straightens gradually instead of
 * snapping straight. Plain two-bone IK swings the elbow or knee very fast just before lockout and
 * then stops dead; easing the reach off removes that whip. A target far beyond reach still gives
 * a straight limb; one right at full reach leaves a slight, natural bend.
 */
function softTarget(root: Pt, target: Pt, full: number): Pt {
  const d = sub(target, root);
  const l = len(d);
  const s0 = full - SOFT;
  if (l <= s0) return target;
  const x = Math.min(l, full + OVER) - s0;
  return add(root, mul(d, (s0 + SOFT * (1 - Math.exp(-x / SOFT))) / l));
}

/** The target distance that `softTarget` turns into reach `e` (its inverse). */
function unsoft(e: number, full: number): number {
  const s0 = full - SOFT;
  if (e <= s0) return e;
  return s0 + Math.min(-SOFT * Math.log(Math.max(1e-9, 1 - (e - s0) / SOFT)), SOFT + OVER);
}

export interface Joints {
  hip: Pt;
  mid: Pt;
  neck: Pt;
  head: Pt;
  /** where the arm attaches (a little below the neck) */
  shoulder: Pt;
  elbow: [Pt, Pt];
  hand: [Pt, Pt];
  /** centre of the fist, where handles and dumbbells sit */
  grip: [Pt, Pt];
  /** direction the hand points (degrees) */
  handAngle: [number, number];
  handKind: [HandKind, HandKind];
  knee: [Pt, Pt];
  ankle: [Pt, Pt];
  toe: [Pt, Pt];
  headAngle: number;
  /** How far the ponytail's tip trails or swings on from the head's recent movement (follow-through). */
  sway?: Pt;
}

/**
 * The foot's angle at the ankle, relative to the shin: between fully pointed (−8°, e.g. kneeling
 * with the top of the foot on the floor) and fully flexed (−118°).
 */
const ankleAngle = (foot: number, shin: number) => clamp(wrap(foot - shin), -118, -8);

/** Direction of the shin for a hip and foot target (the same leg `joints` builds). */
function shinAngle(hip: Pt, foot: Pt): number {
  const ft = softTarget(hip, foot, L.thigh + L.shin);
  const knee = anatomical(hip, ft, L.thigh, L.shin, 1);
  return angleOf(knee, reach(knee, ft, L.shin));
}

export function joints(p: Pose): Joints {
  const mid = dir(p.torso[0], L.torso1, p.hip);
  const neck = dir(p.torso[1], L.torso2, mid);
  const head = dir(p.head, L.neck + L.head, neck);
  const shoulder = add(neck, mul(unit(sub(mid, neck)), 3));
  const fa = p.footAngle ?? [0, 0];
  const wr = p.wrist ?? [0, 0];
  const handT = [0, 1].map((i) => softTarget(neck, p.hands[i], L.upper + L.fore));
  // arms drawn through given elbows (flared out of the side-on view) or solved as usual
  const elbow = [0, 1].map((i) => p.elbows?.[i] ?? anatomical(neck, handT[i], L.upper, L.fore, -1)) as [Pt, Pt];
  const hand = [0, 1].map((i) => (p.elbows ? p.hands[i] : reach(elbow[i], handT[i], L.fore))) as [Pt, Pt];
  const handAngle = [0, 1].map((i) => angleOf(elbow[i], hand[i]) + clamp(wr[i], -75, 75)) as [number, number];
  const grip = [0, 1].map((i) => dir(handAngle[i], 2.8, hand[i])) as [Pt, Pt];
  const footT = [0, 1].map((i) => softTarget(p.hip, p.feet[i], L.thigh + L.shin));
  // legs drawn through given knees (turned out of the side-on view) or solved as usual
  const knee = [0, 1].map((i) => p.knees?.[i] ?? anatomical(p.hip, footT[i], L.thigh, L.shin, 1)) as [Pt, Pt];
  const ankle = [0, 1].map((i) => (p.knees ? p.feet[i] : reach(knee[i], footT[i], L.shin))) as [Pt, Pt];
  // the foot sits between fully pointed (−8°, e.g. kneeling with the top of the foot on the floor)
  // and fully flexed (−118°) relative to the shin
  const toe = [0, 1].map((i) => {
    if (p.knees && p.toes) return p.toes[i];
    const shinA = angleOf(knee[i], ankle[i]);
    const tp = dir(shinA + ankleAngle(fa[i], shinA), L.foot, ankle[i]);
    // toes never push down through the floor: the foot rolls up onto it instead (soft limit)
    const over = tp[1] - TOE_FLOOR;
    if (over <= 0 || ankle[i][1] >= TOE_FLOOR) return tp;
    const y = TOE_FLOOR + 0.6 * (1 - Math.exp(-over / 0.6));
    const dy = y - ankle[i][1];
    const dx = Math.sqrt(Math.max(0, L.foot * L.foot - dy * dy)) * Math.sign(tp[0] - ankle[i][0] || 1);
    const rolled: Pt = [ankle[i][0] + dx, y];
    // only as far as the ankle can bend
    const rel = wrap(angleOf(ankle[i], rolled) - shinA);
    return rel >= -118 && rel <= -8 ? rolled : tp;
  }) as [Pt, Pt];
  return { hip: p.hip, mid, neck, head, shoulder, elbow, hand, grip, handAngle, handKind: p.handKind ?? ["fist", "fist"], knee, ankle, toe, headAngle: p.head };
}

const neckOf = (p: Pose) => dir(p.torso[1], L.torso2, dir(p.torso[0], L.torso1, p.hip));

/**
 * A limb's joint angles in the body's own terms: how far the upper bone is raised forward from
 * hanging along the torso (−90…270, so an arm going overhead never takes the short way round
 * behind the back), and the bend of the middle joint.
 */
function limbAngles(root: Pt, target: Pt, down: number, a: number, b: number, flex: 1 | -1) {
  // the limb as it is actually drawn (soft IK), so its joints are exactly where they appear
  const reachable = softTarget(root, target, a + b);
  const m = anatomical(root, reachable, a, b, flex);
  const upper = angleOf(root, m);
  let raise = wrap(down - upper);
  if (raise < -90) raise += 360;
  return { raise, bend: wrap(angleOf(m, reachable) - upper) };
}

/**
 * Where a hand or foot is part-way between two poses. A planted one stays put; one moving freely
 * swings on its joints (a curl's hand travels round the elbow, not in a straight line through the
 * forearm); `straight` limbs move in a line. Exact at both ends, whatever the limb's reach.
 */
function limbTarget(ta: Pt, tb: Pt, t: number, ra: Pt, rb: Pt, r: Pt, da: number, db: number, d: number, a: number, b: number, flex: 1 | -1, straight: boolean): Pt {
  if (planted(ta, tb, ra, rb, straight)) return lerpPt(ta, tb, t);
  const A = limbAngles(ra, ta, da, a, b, flex);
  const B = limbAngles(rb, tb, db, a, b, flex);
  // When both joints work together (a press, a pull, a row, a step) the hand or foot travels in
  // a straight line, as people's reaching movements do. When one joint does the work (a curl, a
  // leg extension, a raise) it swings in an arc around that joint.
  const dRaise = Math.abs(B.raise - A.raise);
  const dBend = Math.abs(B.bend - A.bend);
  const straightLine = Math.max(dRaise, dBend) > 15 && Math.min(dRaise, dBend) > 0.35 * Math.max(dRaise, dBend);
  const upper = d - lerp(A.raise, B.raise, t);
  // the line runs between where the hand or foot is actually drawn at each end
  const end = straightLine ? lerpPt(softTarget(ra, ta, a + b), softTarget(rb, tb, a + b), t) : dir(upper + lerp(A.bend, B.bend, t), b, dir(upper, a, r));
  // aim where soft IK will bring the hand or foot exactly to `end`, joints just as swung
  const p = add(r, mul(unit(sub(end, r)), unsoft(len(sub(end, r)), a + b)));
  // a swing near the floor never dips through it (soft limit, exact at both ends)
  const low = Math.max(ta[1], tb[1]);
  if (low < FLOOR - 8 || p[1] <= low) return p;
  return [p[0], low + 0.6 * (1 - Math.exp(-(p[1] - low) / 0.6))];
}

/**
 * Hands and feet that stay put, or barely move while the body moves a lot (a foot on a step as
 * the body rises over it), move in a straight line: they're resting on something.
 */
function planted(ta: Pt, tb: Pt, ra: Pt, rb: Pt, straight: boolean) {
  const moved = len(sub(tb, ta));
  return straight || moved < 1e-9 || moved < 0.25 * len(sub(sub(tb, rb), sub(ta, ra)));
}

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const pair = (x: [number, number] | undefined, y: [number, number] | undefined): [number, number] => {
    const xa = x ?? [0, 0];
    const ya = y ?? [0, 0];
    return [lerp(xa[0], ya[0], t), lerp(xa[1], ya[1], t)];
  };
  const hip = lerpPt(a.hip, b.hip, t);
  const torso: [number, number] = [lerp(a.torso[0], b.torso[0], t), lerp(a.torso[1], b.torso[1], t)];
  const straight = a.straight ?? b.straight ?? [];
  const neck = [neckOf(a), neckOf(b), neckOf({ ...a, hip, torso })] as const;
  // "down along the body" for each limb: from the shoulders along the chest, from the hips along the belly
  const armDown = [a.torso[1] + 180, b.torso[1] + 180, torso[1] + 180] as const;
  const legDown = [a.torso[0] + 180, b.torso[0] + 180, torso[0] + 180] as const;
  const hand = (i: 0 | 1) => limbTarget(a.hands[i], b.hands[i], t, neck[0], neck[1], neck[2], ...armDown, L.upper, L.fore, -1, straight.includes("hands"));
  const foot = (i: 0 | 1) => limbTarget(a.feet[i], b.feet[i], t, a.hip, b.hip, hip, ...legDown, L.thigh, L.shin, 1, straight.includes("feet"));
  const lift = (i: 0 | 1): Pt => {
    const f = foot(i);
    return [f[0], f[1] - Math.sin(Math.PI * t) * (a.lift?.[i] ?? 0)];
  };
  const pose: Pose = {
    hip,
    torso,
    head: lerp(a.head, b.head, t),
    hands: [hand(0), hand(1)],
    feet: [a.feet[0], a.feet[1]],
    wrist: pair(a.wrist, b.wrist),
    handKind: t < 0.5 ? a.handKind : b.handKind,
    straight: a.straight,
  };
  const at = (pa: [Pt, Pt], pb: [Pt, Pt]) => [lerpPt(pa[0], pb[0], t), lerpPt(pa[1], pb[1], t)] as [Pt, Pt];
  if (a.elbows || b.elbows) {
    // arms flaring out of the side-on view: elbows and hands glide between where they appear
    const ja = joints(a);
    const jb = joints(b);
    pose.elbows = at(ja.elbow, jb.elbow);
    pose.hands = at(ja.hand, jb.hand);
    if (a.swingArms || b.swingArms) {
      // or swing: each bone turns about the joint it hangs from, keeping its length
      const turn = (from: Pt, pa: Pt, pb: Pt, qa: Pt, qb: Pt): Pt => {
        const u = sub(pa, qa);
        const v = sub(pb, qb);
        const a0 = angleOf([0, 0], u);
        return dir(a0 + wrap(angleOf([0, 0], v) - a0) * t, lerp(len(u), len(v), t), from);
      };
      const sh = joints(pose).shoulder;
      pose.elbows = [0, 1].map((i) => turn(sh, ja.elbow[i], jb.elbow[i], ja.shoulder, jb.shoulder)) as [Pt, Pt];
      pose.hands = [0, 1].map((i) => turn(pose.elbows![i], ja.hand[i], jb.hand[i], ja.elbow[i], jb.elbow[i])) as [Pt, Pt];
    }
  }
  if (a.knees || b.knees) {
    // legs turning out of the side-on view: knees, ankles and toes glide between where they appear
    const ja = joints(a);
    const jb = joints(b);
    const feet = at(ja.ankle, jb.ankle);
    // a foot turning round pivots on its heel: it swings through toes-up and looks shortest
    // (pointing at the viewer) halfway, instead of flipping over in one frame
    const toe = (i: 0 | 1): Pt => {
      const oa = sub(ja.toe[i], ja.ankle[i]);
      const ob = sub(jb.toe[i], jb.ankle[i]);
      const aa = angleOf([0, 0], oa);
      let turn = wrap(angleOf([0, 0], ob) - aa);
      if (Math.abs(turn) > 90 && Math.sin(rad(aa + turn / 2)) > 0) turn -= 360 * Math.sign(turn);
      const shrink = 1 - Math.sin(Math.PI * t) * clamp((Math.abs(turn) - 60) / 120, 0, 1) * 0.85;
      return dir(aa + turn * t, lerp(len(oa), len(ob), t) * shrink, feet[i]);
    };
    return { ...pose, knees: at(ja.knee, jb.knee), feet, toes: [toe(0), toe(1)] };
  }
  const feet: [Pt, Pt] = [lift(0), lift(1)];
  return {
    ...pose,
    feet,
    // a foot resting on something keeps its angle to it (the short way round); a moving foot
    // turns at the ankle, following the shin
    footAngle: [0, 1].map((i) => {
      const fa = a.footAngle?.[i] ?? 0;
      const fb = b.footAngle?.[i] ?? 0;
      if (planted(a.feet[i], b.feet[i], a.hip, b.hip, straight.includes("feet"))) return fa + wrap(fb - fa) * t;
      const sa = shinAngle(a.hip, a.feet[i]);
      const sb = shinAngle(b.hip, b.feet[i]);
      return shinAngle(hip, feet[i]) + lerp(ankleAngle(fa, sa), ankleAngle(fb, sb), t);
    }) as [number, number],
  };
}

/**
 * Speed curve of a movement between two positions: a gentle build-up, a steady controlled middle
 * and a gentle settle, like a lift done with good tempo. Speed and acceleration are both zero at
 * the ends, so moves blend into holds without a jolt; the top speed is only 1.4× the average
 * (a plain S-curve peaks at almost twice it, which reads as a lurch through the middle).
 */
const RAMP = 0.3;
export const ease = (t: number) => {
  const v = 1 / (1 - RAMP);
  const up = (x: number) => {
    const u = x / RAMP;
    return v * RAMP * (u * u * u - (u * u * u * u) / 2);
  };
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  if (t < RAMP) return up(t);
  if (t > 1 - RAMP) return 1 - up(1 - t);
  return v * (RAMP / 2 + t - RAMP);
};

/**
 * Keyframes with holds. Each step: move to pose over `move` (fraction of the cycle), then hold
 * for `hold`. The cycle loops back to the first pose. Also returns the effort `k` (0 at even
 * steps, 1 at odd ones, eased in between) — used for working-muscle glow and lifted weights.
 */
export function keyframes<P>(lerpFn: (a: P, b: P, t: number) => P, steps: { pose: P; hold: number; move: number }[]) {
  const total = steps.reduce((n, s) => n + s.hold + s.move, 0);
  const kOf = (i: number) => (i % 2 === 1 ? 1 : 0);
  return (t: number): { pose: P; k: number } => {
    let x = (((t % 1) + 1) % 1) * total;
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      if (x < s.hold) return { pose: s.pose, k: kOf(i) };
      x -= s.hold;
      if (x < s.move) {
        const e = ease(x / s.move);
        const ni = (i + 1) % steps.length;
        return { pose: lerpFn(s.pose, steps[ni].pose, e), k: lerp(kOf(i), kOf(ni), e) };
      }
      x -= s.move;
    }
    return { pose: steps[0].pose, k: 0 };
  };
}

// ---------------------------------------------------------------- geometry helpers

/**
 * A limb segment: tapered capsule from a (radius ra) to b (radius rb) with rounded ends.
 * `back`/`front` bulge the side that's "behind"/"in front of" a bone pointing down the body.
 */
export function capsule(a: Pt, b: Pt, ra: number, rb: number, back = 0, front = 0, at = 0.45): string {
  const d = sub(b, a);
  const u = unit(d);
  const v = perp(u);
  const p1 = add(a, mul(v, ra));
  const p2 = add(b, mul(v, rb));
  const p3 = add(b, mul(v, -rb));
  const p4 = add(a, mul(v, -ra));
  const m = add(a, mul(d, at));
  const rm = lerp(ra, rb, at);
  const c1 = add(m, mul(v, rm + 2 * back));
  const c2 = add(m, mul(v, -(rm + 2 * front)));
  const k = 1.33;
  return `M${f2(p1)} Q${f2(c1)} ${f2(p2)} C${f2(add(p2, mul(u, rb * k)))} ${f2(add(p3, mul(u, rb * k)))} ${f2(p3)} Q${f2(c2)} ${f2(p4)} C${f2(add(p4, mul(u, -ra * k)))} ${f2(add(p1, mul(u, -ra * k)))} ${f2(p1)} Z`;
}

/** Smooth outline through points (Catmull-Rom converted to cubic Béziers). */
export function smooth(pts: Pt[], closed = true, tension = 0.5): string {
  const n = pts.length;
  const at = (i: number) => pts[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
  let d = `M${f2(pts[0])}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1 = add(p1, mul(sub(p2, p0), tension / 3));
    const c2 = add(p2, mul(sub(p3, p1), -tension / 3));
    d += ` C${f2(c1)} ${f2(c2)} ${f2(p2)}`;
  }
  return closed ? d + " Z" : d;
}

/** Point in a local frame: origin o, x along u, y along w. */
export const local = (o: Pt, u: Pt, w: Pt, x: number, y: number): Pt => add(o, add(mul(u, x), mul(w, y)));

/** Cylinder-style shading across a limb: light on the front, shadow on the back. */
export function roundShade(a: Pt, b: Pt, r: number, tone: Tone, strength = 1): Grad {
  const m = lerpPt(a, b, 0.5);
  const v = perp(unit(sub(b, a)));
  return {
    kind: "linear",
    a: add(m, mul(v, -r)),
    b: add(m, mul(v, r)),
    stops: [
      { o: 0, tone, shade: 26 * strength },
      { o: 0.3, tone, shade: 10 * strength },
      { o: 0.68, tone, shade: -2 * strength },
      { o: 1, tone, shade: -22 * strength },
    ],
  };
}

// ---------------------------------------------------------------- body (side view)

const OUT = 0.6; // outline width
const DEF = 0.32; // opacity of muscle-definition lines

function limb(a: Pt, b: Pt, ra: number, rb: number, tone: Tone, back = 0, front = 0, at = 0.45, strength = 1): Shape {
  return { k: "path", d: capsule(a, b, ra, rb, back, front, at), w: 0, fill: true, tone, grad: roundShade(a, b, Math.max(ra, rb) + 1, tone, strength), stroke: "line", sw: OUT };
}

/** A soft curve drawn along a limb, offset to one side — muscle definition and seams. */
function along(a: Pt, b: Pt, f0: number, f1: number, off0: number, off1: number, bow: number, tone: Tone = "line", op = DEF, w = 0.5): Shape {
  const u = unit(sub(b, a));
  const v = perp(u);
  const p0 = add(lerpPt(a, b, f0), mul(v, off0));
  const p1 = add(lerpPt(a, b, f1), mul(v, off1));
  const c = add(lerpPt(p0, p1, 0.5), mul(v, bow));
  return { k: "path", d: `M${f2(p0)} Q${f2(c)} ${f2(p1)}`, w, tone, op };
}

/** Hand: a closed grip with fingers and thumb, or flat (pressing on a surface). */
function hand(wrist: Pt, angle: number, tone: Tone, kind: HandKind): Shape[] {
  const u = dir(angle, 1, [0, 0]);
  const w = perp(u);
  const P = (x: number, y: number) => local(wrist, u, w, x, y);
  const grad = roundShade(P(0, 0), P(6, 0), 3.2, tone);
  if (kind === "flat") {
    return [
      { k: "path", d: smooth([P(-0.6, -2.2), P(3, -2.5), P(7.6, -1.9), P(9.4, -0.8), P(9.6, 0.6), P(7.4, 1.8), P(2.8, 2.3), P(-0.6, 2)]), w: 0, fill: true, tone, grad, stroke: "line", sw: OUT },
      { k: "path", d: `M${f2(P(3.6, -1.6))} Q${f2(P(5.2, -3.4))} ${f2(P(6.6, -2.4))}`, w: 0.5, tone: "line", op: 0.5 },
      { k: "line", a: P(5.6, -0.6), b: P(9, -0.5), w: 0.35, tone: "line", op: 0.35 },
      { k: "line", a: P(5.4, 0.6), b: P(8.8, 0.6), w: 0.35, tone: "line", op: 0.35 },
    ];
  }
  const c = P(2.8, 0);
  const C = (x: number, y: number) => local(c, u, w, x, y);
  return [
    // palm and the back of the hand
    { k: "path", d: smooth([C(-3, -2.4), C(0.6, -3), C(3.2, -2.2), C(3.6, 0.6), C(2.8, 2.8), C(-0.4, 3.1), C(-3, 2.1)]), w: 0, fill: true, tone, grad, stroke: "line", sw: OUT },
    // curled fingers
    ...[-1.6, 0, 1.6].map((y): Shape => ({ k: "path", d: `M${f2(C(1.2, y - 0.8))} Q${f2(C(3.6, y))} ${f2(C(1.2, y + 0.8))}`, w: 0.42, tone: "line", op: 0.5 })),
    // thumb wrapped over the fingers
    { k: "path", d: smooth([C(-1.4, -2.4), C(1.4, -3.2), C(2.6, -2.2), C(1.8, -1.2), C(-0.8, -1.4)]), w: 0, fill: true, tone, shade: 6, stroke: "line", sw: 0.45 },
  ];
}

/** Trainer: sole, midsole, toe cap, laces, tongue, heel tab and a side stripe. */
function shoe(ankle: Pt, toe: Pt, near: boolean): Shape[] {
  const u = unit(sub(toe, ankle));
  const w: Pt = [u[1], -u[0]]; // "up" from the sole
  // a foot turned toward or away from the viewer looks shorter (only legs drawn through set knees)
  const s = clamp(len(sub(toe, ankle)) / L.foot, 0.15, 1);
  const P = (x: number, y: number) => local(ankle, u, w, x * s, y);
  const tone: Tone = near ? "shoe" : "shoeFar";
  const upper = smooth([P(-3.4, 2.6), P(-3.8, -0.6), P(-3, -2), P(6, -2.2), P(11.4, -2), P(12.6, -0.8), P(11.8, 0.8), P(8.4, 1.8), P(4.2, 2.6), P(1.4, 3.9), P(-1.4, 4.1)]);
  return [
    { k: "path", d: upper, w: 0, fill: true, tone, grad: { kind: "linear", a: P(0, 4), b: P(0, -2.4), stops: [{ o: 0, tone, shade: 10 }, { o: 1, tone, shade: -10 }] }, stroke: "line", sw: OUT },
    // midsole + outsole with tread
    { k: "path", d: smooth([P(-3.9, -0.8), P(-3.2, -2.2), P(6, -2.4), P(11.6, -2.2), P(12.9, -1.1), P(12.6, -2.4), P(11.2, -3.6), P(-2.6, -3.6), P(-3.9, -2.6)], true, 0.4), w: 0, fill: true, tone: "white", stroke: "line", sw: OUT },
    { k: "line", a: P(-2.6, -3.5), b: P(11.2, -3.5), w: 1, tone: "sole" },
    { k: "line", a: P(-2, -3.6), b: P(10.6, -3.6), w: 0.5, tone: "line", dash: "0.6 0.9", op: 0.55 },
    // toe cap seam, laces, tongue
    { k: "path", d: `M${f2(P(8.6, 1.4))} Q${f2(P(10.4, -0.6))} ${f2(P(11.8, -1.6))}`, w: 0.4, tone: "line", op: 0.45 },
    ...[2.4, 4.2, 6].map((x): Shape => ({ k: "line", a: P(x, 2.9 - (x - 2.4) * 0.28), b: P(x + 1.3, 2.2 - (x - 2.4) * 0.28), w: 0.45, tone: "line", op: 0.6 })),
    { k: "path", d: `M${f2(P(0.6, 3.8))} Q${f2(P(1.8, 5.2))} ${f2(P(3, 3.4))}`, w: 0.5, tone: "line", op: 0.5 },
    // side stripe and heel tab
    { k: "path", d: `M${f2(P(-1.6, 0.2))} Q${f2(P(3.2, 0.8))} ${f2(P(7.6, -0.4))}`, w: 1.1, tone: near ? "stripe" : "shoeFar", op: 0.95 },
    { k: "line", a: P(-3.4, 0.6), b: P(-2.2, 3.8), w: 1, tone: "sole" },
  ];
}

function head(j: Joints): Shape[] {
  const c = j.head;
  const up = dir(j.headAngle, 1, [0, 0]);
  const face: Pt = perp(up); // same side as the chest
  const P = (x: number, y: number) => local(c, face, up, x, y);
  const profile = smooth([
    P(-7.8, 1.6), P(-4.6, 7), P(0.4, 8.4), P(5.4, 5.8), P(7.3, 2.6), P(7.1, 1.2), P(9.3, -1.1), P(7.9, -2.3), P(8.1, -3.3), P(7.7, -4.2), P(7.9, -4.9), P(6.8, -6.9), P(4, -8), P(-0.4, -6.2), P(-5.2, -4.8),
  ]);
  const hairOuter = smooth([P(4.9, 6.4), P(2.4, 8.6), P(-2, 8.9), P(-6.4, 6.4), P(-8.6, 2), P(-8.2, -2.2), P(-6, -4.6), P(-4.8, -3.2), P(-5.8, -0.4), P(-4.8, 3.4), P(-1.6, 5.6), P(2.6, 6), P(4.6, 4.8)]);
  const hairGrad: Grad = { kind: "linear", a: P(0, 9), b: P(0, -4), stops: [{ o: 0, tone: "hair", shade: 12 }, { o: 1, tone: "hair", shade: -10 }] };
  // female: a ponytail tied at the back of the head, drawn behind it. It hangs with gravity
  // (whatever the head is doing) and lies along the floor rather than going through it.
  const ponytail: Shape[] = [];
  if (female) {
    const back = mul(face, -1);
    const hang = unit(add([0, 1], mul(back, 0.45)));
    const base = P(-7.6, 2.6);
    // follow-through: the hair lags behind the head's movement and swings on a little when it stops
    const sw = j.sway ?? [0, 0];
    const p1 = add(add(add(base, mul(back, 2.6)), mul(hang, 1.6)), mul(sw, 0.3));
    const p2 = add(add(p1, mul(hang, 5)), mul(sw, 0.35));
    const p3 = add(add(p2, mul(hang, 5.4)), mul(sw, 0.35));
    // on the floor it spreads out beyond the top of the head (smoothly, whichever way that is)
    const away = clamp(up[0] * 2, -1, 1);
    const spine = [base, p1, p2, p3].map((p): Pt => (p[1] > FLOOR - 1.6 ? [p[0] + away * (p[1] - FLOOR + 1.6) * 0.9, FLOOR - 1.6] : p));
    const widths = [2, 2.5, 1.9, 0.5];
    const side = (s: number) =>
      spine.map((p, i) => {
        const tan = unit(sub(spine[Math.min(i + 1, 3)], spine[Math.max(i - 1, 0)]));
        return add(p, mul(perp(tan), widths[i] * s));
      });
    ponytail.push(
      { k: "path", d: smooth([...side(1), ...side(-1).reverse()]), w: 0, fill: true, tone: "hair", grad: hairGrad, stroke: "line", sw: OUT },
      { k: "path", d: smooth(spine.slice(1), false), w: 0.4, tone: "hair", shade: 30, op: 0.7 },
    );
  }
  return [
    ...ponytail,
    { k: "path", d: profile, w: 0, fill: true, tone: "skin", grad: { kind: "radial", c: P(3, 2.4), r: 11, stops: [{ o: 0, tone: "skin", shade: 16 }, { o: 0.6, tone: "skin" }, { o: 1, tone: "skin", shade: -18 }] }, stroke: "line", sw: OUT },
    // cheek and jaw shading
    { k: "path", d: smooth([P(1, -1.6), P(5.4, -2.8), P(5.6, -6.2), P(2.4, -6.8), P(-0.4, -5)]), w: 0, fill: true, tone: "skinShade", op: 0.35 },
    // eye, brow, nostril, lips
    { k: "path", d: smooth([P(4.2, 1.1), P(5.4, 1.7), P(6.3, 1), P(5.4, 0.5)]), w: 0, fill: true, tone: "white", stroke: "line", sw: 0.35 },
    { k: "circle", c: P(5.5, 1.05), r: 0.55, tone: "line" },
    { k: "path", d: `M${f2(P(3.6, 2.5))} Q${f2(P(5.2, 3.3))} ${f2(P(6.8, 2.6))}`, w: female ? 0.45 : 0.7, tone: "hair" },
    ...(female ? [{ k: "path", d: `M${f2(P(6.1, 1.3))} L${f2(P(7, 1.9))} M${f2(P(5.8, 1.6))} L${f2(P(6.5, 2.3))}`, w: 0.35, tone: "line" } as Shape] : []),
    { k: "path", d: `M${f2(P(7.6, -1.9))} Q${f2(P(7, -2.3))} ${f2(P(6.6, -1.6))}`, w: 0.4, tone: "line", op: 0.6 },
    { k: "path", d: smooth([P(7.9, -3.4), P(6.8, -3.7), P(7.6, -4.6), P(7.9, -4.9)]), w: 0, fill: true, tone: "lips", op: 0.9 },
    { k: "line", a: P(7.4, -4.15), b: P(6.4, -4.05), w: 0.35, tone: "line", op: 0.5 },
    // ear: small and soft so it never reads as an eye
    { k: "path", d: smooth([P(-0.8, 1), P(0.6, 0.2), P(0.5, -2.2), P(-0.6, -2.8), P(-1.4, -1)]), w: 0, fill: true, tone: "skin", shade: -6, stroke: "line", sw: 0.4, op: 0.95 },
    { k: "path", d: `M${f2(P(-0.2, -0.2))} Q${f2(P(0.2, -1.2))} ${f2(P(-0.6, -1.8))}`, w: 0.35, tone: "line", op: 0.4 },
    // hair with a few strands
    { k: "path", d: hairOuter, w: 0, fill: true, tone: "hair", grad: hairGrad, stroke: "line", sw: OUT },
    ...(female ? [{ k: "circle", c: P(-7.8, 3), r: 1.3, tone: "accent", stroke: "line", sw: 0.4 } as Shape] : []),
    ...[
      [P(3.4, 7.4), P(-1, 7.6), P(-5.4, 4.6)],
      [P(1.4, 6.6), P(-3, 6.8), P(-7, 1.8)],
      [P(-2.2, 8.2), P(-6.6, 5.2), P(-7.6, -1.4)],
    ].map((s): Shape => ({ k: "path", d: `M${f2(s[0])} Q${f2(s[1])} ${f2(s[2])}`, w: 0.4, tone: "hair", shade: 30, op: 0.7 })),
  ];
}

/** Torso outline: chest and belly in front, shoulder blades, lower back and glutes behind. */
function torso(j: Joints) {
  const u0 = unit(sub(j.mid, j.hip));
  const u1 = unit(sub(j.neck, j.mid));
  const n0 = perp(u0); // perp of an upward bone = front
  const n1 = perp(u1);
  const nm = unit(add(n0, n1));
  const chestAt = lerpPt(j.mid, j.neck, 0.55);
  // female: fuller bust, narrower waist, rounder hips and glutes
  const front: Pt[] = female
    ? [add(j.neck, mul(n1, 4)), add(lerpPt(j.mid, j.neck, 0.68), mul(n1, 7.4)), add(lerpPt(j.mid, j.neck, 0.44), mul(n1, 9.6)), add(lerpPt(j.mid, j.neck, 0.2), mul(nm, 6.4)), add(j.mid, mul(nm, 5.4)), add(lerpPt(j.hip, j.mid, 0.45), mul(n0, 5.8)), add(j.hip, mul(n0, 6.2))]
    : [add(j.neck, mul(n1, 4.2)), add(add(chestAt, mul(n1, 8.4)), mul(u1, 1)), add(lerpPt(j.mid, j.neck, 0.15), mul(nm, 7.3)), add(j.mid, mul(nm, 6.5)), add(lerpPt(j.hip, j.mid, 0.45), mul(n0, 6.5)), add(j.hip, mul(n0, 6.2))];
  const back: Pt[] = female
    ? [add(j.hip, mul(n0, -8.2)), add(lerpPt(j.hip, j.mid, 0.5), mul(n0, -5.2)), add(j.mid, mul(nm, -5.3)), add(lerpPt(j.mid, j.neck, 0.55), mul(n1, -6.4)), add(j.neck, mul(n1, -4)), add(j.neck, mul(u1, 2))]
    : [add(j.hip, mul(n0, -7.4)), add(lerpPt(j.hip, j.mid, 0.5), mul(n0, -5.7)), add(j.mid, mul(nm, -6.2)), add(lerpPt(j.mid, j.neck, 0.55), mul(n1, -7.1)), add(j.neck, mul(n1, -4.4)), add(j.neck, mul(u1, 2.2))];
  return { n0, n1, nm, u0, u1, chestAt, front, back };
}

function trunkShapes(j: Joints): Shape[] {
  const t = torso(j);
  const neckTop = add(j.head, mul(dir(j.headAngle, 1, [0, 0]), -4));
  const glute = add(add(j.hip, mul(t.n0, -6.4)), mul(t.u0, -2.2));
  const H = (x: number, y: number) => add(add(j.hip, mul(t.n0, x)), mul(t.u0, y));
  const pelvis = female
    ? smooth([H(6.3, 6.6), H(6.7, 0), H(4.2, -5.2), H(0, -6.4), add(glute, mul(t.u0, -3.6)), H(-9.8, -0.4), H(-8.6, 5.4), H(-7.6, 7.3)])
    : smooth([H(6.3, 6.6), H(6.7, 0), H(4.2, -5.2), H(0, -6.4), add(glute, mul(t.u0, -3.4)), H(-8.7, -0.6), H(-7.7, 5.4), H(-6.9, 7.3)]);
  const shirtGrad: Grad = { kind: "linear", a: add(j.mid, mul(t.nm, 9)), b: add(j.mid, mul(t.nm, -8)), stops: [{ o: 0, tone: "shirt", shade: 18 }, { o: 0.4, tone: "shirt", shade: 4 }, { o: 1, tone: "shirt", shade: -20 }] };
  const shortsGrad: Grad = { kind: "linear", a: H(8, 0), b: H(-9, 0), stops: [{ o: 0, tone: "shorts", shade: 16 }, { o: 1, tone: "shorts", shade: -16 }] };
  return [
    // neck with a hint of the neck muscle
    limb(j.neck, neckTop, 3, 2.7, "skin"),
    along(j.neck, neckTop, 0.1, 0.9, -1.2, 1.2, 0.4),
    // t-shirt
    { k: "path", d: smooth([...t.front, ...t.back]), w: 0, fill: true, tone: "shirt", grad: shirtGrad, stroke: "line", sw: OUT },
    { k: "path", d: smooth([add(lerpPt(j.hip, j.mid, 0.25), mul(t.n0, 0.6)), add(j.mid, mul(t.nm, 0.2)), add(lerpPt(j.mid, j.neck, 0.6), mul(t.n1, -0.6))], false), w: 0.5, tone: "line", op: 0.3, dash: "1.2 0.8" },
    { k: "path", d: `M${f2(add(lerpPt(j.mid, j.neck, 0.72), mul(t.n1, -4.6)))} Q${f2(add(lerpPt(j.mid, j.neck, 0.5), mul(t.n1, -6)))} ${f2(add(lerpPt(j.mid, j.neck, 0.25), mul(t.n1, -5.2)))}`, w: 0.5, tone: "line", op: 0.28 },
    { k: "path", d: `M${f2(add(j.neck, mul(t.n1, 3.8)))} Q${f2(add(j.neck, mul(t.u1, -2.8)))} ${f2(add(j.neck, mul(t.n1, -3.6)))}`, w: 1.4, tone: "shirt", shade: -14 },
    { k: "path", d: `M${f2(add(j.neck, mul(t.n1, 3.8)))} Q${f2(add(j.neck, mul(t.u1, -2.8)))} ${f2(add(j.neck, mul(t.n1, -3.6)))}`, w: 0.5, tone: "line", op: 0.5 },
    ...(female
      ? // tank top: a seam under the bust instead of the t-shirt's logo dot
        [{ k: "path", d: `M${f2(add(lerpPt(j.mid, j.neck, 0.3), mul(t.n1, 7.2)))} Q${f2(add(lerpPt(j.mid, j.neck, 0.24), mul(t.n1, 2)))} ${f2(add(lerpPt(j.mid, j.neck, 0.3), mul(t.n1, -2.6)))}`, w: 0.45, tone: "line", op: 0.3 } as Shape]
      : [{ k: "circle", c: add(add(t.chestAt, mul(t.n1, 5.2)), mul(t.u1, 1.6)), r: 1.3, tone: "shirt", shade: 34, op: 0.9 } as Shape]),
    // shorts: pelvis, waistband, drawstring
    { k: "path", d: pelvis, w: 0, fill: true, tone: "shorts", grad: shortsGrad, stroke: "line", sw: OUT },
    { k: "path", d: `M${f2(H(6.2, 5.6))} Q${f2(H(0, 7.2))} ${f2(H(-7.2, 6.6))}`, w: 0.55, tone: "line", op: 0.45 },
    { k: "path", d: `M${f2(H(5.8, 5))} Q${f2(H(6.6, 2.6))} ${f2(H(5.6, 1.4))}`, w: 0.45, tone: "white", op: 0.8 },
  ];
}

function legShapes(j: Joints, i: 0 | 1): Shape[] {
  const near = i === 1;
  const skin: Tone = near ? "skin" : "skinFar";
  const hipJ = j.hip;
  const knee = j.knee[i];
  const ankle = j.ankle[i];
  const thighU = unit(sub(knee, hipJ));
  const shinU = unit(sub(ankle, knee));
  const shortsEnd = add(hipJ, mul(sub(knee, hipJ), 0.55));
  const sockTop = add(ankle, mul(shinU, -4));
  const shorts: Tone = near ? "shorts" : "shortsFar";
  if (female) {
    // 7/8 leggings: the whole thigh and most of the shin, with the ankle showing above the sock
    const cuff = lerpPt(knee, ankle, 0.8);
    return [
      limb(knee, ankle, 4, 2.3, skin, 1.8, 0.2, 0.3, near ? 1 : 0.6),
      limb(sockTop, ankle, 2.7, 2.5, "sock", 0, 0, 0.5, 0.5),
      limb(knee, cuff, 4.5, 2.9, shorts, 2, 0.2, 0.35, near ? 0.9 : 0.6),
      { k: "line", a: add(cuff, mul(perp(shinU), 2.8)), b: add(cuff, mul(perp(shinU), -2.8)), w: 0.45, tone: "line", op: 0.4 },
      limb(add(hipJ, mul(thighU, -1)), knee, 7.4, 4.6, shorts, 1.4, 1.2, 0.42, near ? 0.9 : 0.6),
      ...(near ? [along(hipJ, knee, 0.5, 0.92, -3.6, -2.4, -1, "line", 0.22)] : []),
      { k: "ellipse", c: add(knee, mul(perp(thighU), -2.8)), rx: 2.3, ry: 1.8, rot: angleOf(hipJ, knee), tone: shorts, shade: 10, op: 0.8 },
      along(hipJ, knee, 0.05, 0.98, 0, 0, 0.2, near ? "stripe" : "shortsFar", near ? 0.9 : 0.4, 0.9),
      along(knee, cuff, 0.02, 0.98, 0.4, 0.4, 0.1, near ? "stripe" : "shortsFar", near ? 0.9 : 0.4, 0.9),
      ...shoe(ankle, j.toe[i], near),
    ];
  }
  return [
    limb(knee, ankle, 4.4, 2.5, skin, 2, 0.2, 0.3, near ? 1 : 0.6), // shin with calf
    ...(near ? [along(knee, ankle, 0.12, 0.55, 2.2, 1.6, 1.2), along(knee, ankle, 0.2, 0.75, -2.6, -1.4, -0.3, "line", 0.22)] : []),
    limb(sockTop, ankle, 2.9, 2.7, "sock", 0, 0, 0.5, 0.5),
    limb(hipJ, knee, 6.5, 4.4, skin, 0.9, 1.5, 0.45, near ? 1 : 0.6), // thigh: hamstrings / quads
    ...(near ? [along(hipJ, knee, 0.5, 0.92, -3.6, -2.4, -1, "line", 0.3), along(hipJ, knee, 0.55, 0.9, 2.6, 2.4, 0.6, "line", 0.22)] : []),
    { k: "ellipse", c: add(knee, mul(perp(thighU), -2.7)), rx: 2.3, ry: 1.8, rot: angleOf(hipJ, knee), tone: skin, shade: 12, stroke: "line", sw: 0.35, op: 0.9 }, // kneecap
    limb(add(hipJ, mul(thighU, -1)), shortsEnd, 7.3, 6.3, shorts, 0.5, 0.6, 0.45, 0.8),
    along(hipJ, shortsEnd, 0.05, 0.98, 0, 0, 0.2, near ? "stripe" : "shortsFar", near ? 0.9 : 0.4, 1.1),
    { k: "line", a: add(shortsEnd, mul(perp(thighU), 6.2)), b: add(shortsEnd, mul(perp(thighU), -6.2)), w: 0.45, tone: "line", op: 0.4 },
    ...shoe(ankle, j.toe[i], near),
  ];
}

function armShapes(j: Joints, i: 0 | 1): Shape[] {
  const near = i === 1;
  const skin: Tone = near ? "skin" : "skinFar";
  const s = j.shoulder;
  const e = j.elbow[i];
  const h = j.hand[i];
  const sleeveA = add(s, mul(unit(sub(e, s)), -1.5));
  const sleeveEnd = lerpPt(s, e, 0.42);
  const shirt: Tone = near ? "shirt" : "shirtFar";
  if (female) {
    // slimmer arms, bare shoulders (tank top) with just the strap over the top
    const strapA = add(s, mul(unit(sub(e, s)), -1.2));
    return [
      limb(e, h, 3, 2, skin, 0.5, 1, 0.25, near ? 1 : 0.6),
      limb(s, e, 3.7, 2.8, skin, 0.9, 1, 0.45, near ? 1 : 0.6),
      ...(near ? [along(s, e, 0.45, 0.92, -0.2, -0.4, 0.5, "line", 0.22)] : []),
      { k: "path", d: `M${f2(add(strapA, mul(perp(unit(sub(e, s))), 3.2)))} Q${f2(add(strapA, mul(unit(sub(e, s)), -2.2)))} ${f2(add(strapA, mul(perp(unit(sub(e, s))), -3.4)))}`, w: 1.6, tone: shirt },
      ...hand(h, j.handAngle[i], skin, j.handKind[i]),
    ];
  }
  return [
    limb(e, h, 3.3, 2.15, skin, 0.5, 1.1, 0.25, near ? 1 : 0.6), // forearm
    ...(near ? [along(e, h, 0.08, 0.6, -1.6, -0.6, -0.6, "line", 0.25)] : []),
    limb(s, e, 4.1, 3.1, skin, 1, 1.1, 0.45, near ? 1 : 0.6), // upper arm: triceps / biceps
    ...(near ? [along(s, e, 0.45, 0.92, -0.2, -0.4, 0.5, "line", 0.28), { k: "path", d: `M${f2(add(e, mul(perp(unit(sub(e, s))), -2)))} q0.6,0.6 1.2,0.2`, w: 0.4, tone: "line", op: 0.35 } as Shape] : []),
    limb(sleeveA, sleeveEnd, 5.2, 4.5, shirt, 0.6, 0.6, 0.45, 0.9), // sleeve over the deltoid
    along(sleeveA, sleeveEnd, 0.84, 0.86, 4.4, -4.4, 0, "line", 0.4, 0.45),
    ...hand(h, j.handAngle[i], skin, j.handKind[i]),
  ];
}

// ---------------------------------------------------------------- working-muscle glow (side view)

/** Soft glow without blur filters: a wide faint layer under a tighter brighter one. */
function glowLayers(base: Shape, wide: Shape, op: number): Shape[] {
  return [
    { ...wide, op: op * 0.35 },
    { ...base, op },
  ];
}

function muscleGlow(j: Joints, muscles: MuscleId[], k: number, legSide: 0 | 1 = 1): Shape[] {
  if (!muscles.length) return [];
  const op = 0.42 + 0.48 * k;
  const t = torso(j);
  const i = legSide; // the working leg (the near one, unless an exercise says otherwise)
  const knee = j.knee[i];
  const thighV = perp(unit(sub(knee, j.hip))); // back of the thigh
  const shinU = unit(sub(j.ankle[i], knee));
  const a = 1; // arms: always the near arm
  const armU = unit(sub(j.elbow[a], j.shoulder));
  const armV = perp(armU); // back of the upper arm
  const P = (d: string): Shape => ({ k: "path", d, w: 0, fill: true, tone: "muscle" });
  const E = (c: Pt, rx: number, ry: number, rot: number): Shape => ({ k: "ellipse", c, rx, ry, rot, tone: "muscle" });
  const cap = (a: Pt, b: Pt, side: Pt, off: number, f0: number, f1: number, r0: number, r1: number, grow = 1.2) => {
    const A = add(lerpPt(a, b, f0), mul(side, off));
    const B = add(lerpPt(a, b, f1), mul(side, off));
    return glowLayers(P(capsule(A, B, r0, r1)), P(capsule(A, B, r0 + grow, r1 + grow)), op);
  };
  const ell = (c: Pt, rx: number, ry: number, rot: number) => glowLayers(E(c, rx, ry, rot), E(c, rx + 1.4, ry + 1.4, rot), op);
  const out: Shape[] = [];
  for (const m of muscles) {
    switch (m) {
      case "quads":
        out.push(...cap(j.hip, knee, thighV, -2.6, 0.15, 0.85, 3.2, 2.2));
        break;
      case "hamstrings":
        out.push(...cap(j.hip, knee, thighV, 2.4, 0.2, 0.85, 2.8, 2));
        break;
      case "adductors":
        out.push(...cap(j.hip, knee, thighV, 0, 0.1, 0.55, 2.4, 1.6));
        break;
      case "glutes":
        out.push(...ell(add(add(j.hip, mul(t.n0, -5.4)), mul(t.u0, -1.2)), 5.2, 4.2, angleOf(j.hip, j.mid)));
        break;
      case "abductors":
        out.push(...ell(add(j.hip, mul(t.u0, 2.4)), 4, 3, angleOf(j.hip, j.mid)));
        break;
      case "hipFlexors":
        out.push(...ell(add(add(j.hip, mul(t.n0, 3.6)), mul(t.u0, 1.5)), 3.2, 2.2, angleOf(j.hip, j.mid)));
        break;
      case "calves":
        out.push(...cap(knee, j.ankle[i], perp(shinU), 1.8, 0.12, 0.6, 2.4, 1.4, 1));
        break;
      case "chest":
        out.push(...ell(add(t.chestAt, mul(t.n1, 5)), 6, 3.6, angleOf(j.mid, j.neck)));
        break;
      case "abs":
        out.push(...glowLayers(P(capsule(add(lerpPt(j.hip, j.mid, 0.25), mul(t.n0, 4.2)), add(lerpPt(j.mid, j.neck, 0.15), mul(t.nm, 4.6)), 2.2, 2.4)), P(capsule(add(lerpPt(j.hip, j.mid, 0.25), mul(t.n0, 4.2)), add(lerpPt(j.mid, j.neck, 0.15), mul(t.nm, 4.6)), 3.4, 3.6)), op));
        break;
      case "obliques":
        out.push(...ell(add(lerpPt(j.hip, j.mid, 0.75), mul(t.n0, 1.6)), 5, 3, angleOf(j.hip, j.mid)));
        break;
      case "lats":
        out.push(...glowLayers(P(capsule(add(lerpPt(j.hip, j.mid, 0.55), mul(t.n0, -2.8)), add(lerpPt(j.mid, j.neck, 0.6), mul(t.n1, -3.4)), 3, 4.2)), P(capsule(add(lerpPt(j.hip, j.mid, 0.55), mul(t.n0, -2.8)), add(lerpPt(j.mid, j.neck, 0.6), mul(t.n1, -3.4)), 4.2, 5.4)), op));
        break;
      case "midBack":
        out.push(...ell(add(lerpPt(j.mid, j.neck, 0.5), mul(t.n1, -4.6)), 5, 2.6, angleOf(j.mid, j.neck)));
        break;
      case "traps":
        out.push(...ell(add(add(j.neck, mul(t.n1, -2.6)), mul(t.u1, -2.6)), 4, 2.4, angleOf(j.mid, j.neck)));
        break;
      case "lowerBack":
        out.push(...ell(add(lerpPt(j.hip, j.mid, 0.5), mul(t.n0, -4.6)), 5, 2.2, angleOf(j.hip, j.mid)));
        break;
      case "frontDelts":
        out.push(...ell(add(add(j.shoulder, mul(armV, -2.4)), mul(armU, 2.4)), 3.2, 2.6, angleOf(j.shoulder, j.elbow[a])));
        break;
      case "sideDelts":
        out.push(...ell(add(j.shoulder, mul(armU, 2.8)), 3.4, 2.8, angleOf(j.shoulder, j.elbow[a])));
        break;
      case "rearDelts":
        out.push(...ell(add(add(j.shoulder, mul(armV, 2.4)), mul(armU, 2.4)), 3.2, 2.6, angleOf(j.shoulder, j.elbow[a])));
        break;
      case "biceps":
        out.push(...cap(j.shoulder, j.elbow[a], armV, -1.6, 0.3, 0.88, 2.2, 1.7, 1));
        break;
      case "triceps":
        out.push(...cap(j.shoulder, j.elbow[a], armV, 1.6, 0.3, 0.9, 2.2, 1.7, 1));
        break;
      case "forearms":
        out.push(...cap(j.elbow[a], j.hand[a], [0, 0], 0, 0.08, 0.8, 2.5, 1.6, 1));
        break;
    }
  }
  return out;
}

/** Body parts in draw order, so props can be slotted between them. */
export interface BodyLayers {
  farArm: Shape[];
  farLeg: Shape[];
  trunk: Shape[];
  nearLeg: Shape[];
  nearArm: Shape[];
  glow: Shape[];
}

/** Test hook: sees the joints of every side-view figure drawn (smoothness checks). */
export const jointProbe: { side: ((j: Joints) => void) | null } = { side: null };

export function bodyLayers(j: Joints, muscles: MuscleId[] = [], k = 0, legSide: 0 | 1 = 1): BodyLayers {
  jointProbe.side?.(j);
  // With the arm raised above the shoulder, a flat drawing would put the arm across the face.
  // In reality it passes beside the ear, so the head is drawn again in front of the arm. That
  // copy fades in as the arm rises (rather than the head jumping in front in a single frame).
  const above = (lo: number, hi: number, x: number) => {
    const u = clamp((x - lo) / (hi - lo), 0, 1);
    return u * u * (3 - 2 * u);
  };
  const raised = above(1, 7, j.shoulder[1] - j.elbow[1][1]) * above(-2, 4, j.neck[1] - j.hand[1][1]);
  const h = head(j);
  return {
    farArm: armShapes(j, 0),
    farLeg: legShapes(j, 0),
    trunk: [...trunkShapes(j), ...h],
    nearLeg: legShapes(j, 1),
    nearArm: [...armShapes(j, 1), ...h.map((s): Shape => ({ ...s, op: (s.op ?? 1) * raised }))],
    glow: muscleGlow(j, muscles, k, legSide),
  };
}

export function bodyShapes(j: Joints, muscles: MuscleId[] = [], k = 0): Shape[] {
  const b = bodyLayers(j, muscles, k);
  return [...b.farArm, ...b.farLeg, ...b.trunk, ...b.nearLeg, ...b.nearArm, ...b.glow];
}

// ---------------------------------------------------------------- front view (frontal-plane moves)

export interface FrontPose {
  /** arm angle from hanging straight down (0) to horizontal (90), both sides */
  arm: number;
  elbowBend: number;
  /** knee spread for seated abduction (0 = together) */
  spread: number;
  seated: boolean;
}

export function lerpFront(a: FrontPose, b: FrontPose, t: number): FrontPose {
  return { arm: lerp(a.arm, b.arm, t), elbowBend: lerp(a.elbowBend, b.elbowBend, t), spread: lerp(a.spread, b.spread, t), seated: a.seated };
}

export interface FrontJoints {
  head: Pt;
  neck: Pt;
  shoulders: [Pt, Pt];
  elbows: [Pt, Pt];
  hands: [Pt, Pt];
  hips: [Pt, Pt];
  knees: [Pt, Pt];
  feet: [Pt, Pt];
  pelvis: Pt;
  seated: boolean;
}

export function frontJoints(p: FrontPose): FrontJoints {
  const cx = 100;
  const pelvisY = p.seated ? 96 : 76;
  const neckY = pelvisY - 44;
  const shoulders: [Pt, Pt] = [
    [cx - 15, neckY + 5],
    [cx + 15, neckY + 5],
  ];
  const elbows: [Pt, Pt] = [
    [shoulders[0][0] - Math.sin(rad(p.arm)) * L.upper, shoulders[0][1] + Math.cos(rad(p.arm)) * L.upper],
    [shoulders[1][0] + Math.sin(rad(p.arm)) * L.upper, shoulders[1][1] + Math.cos(rad(p.arm)) * L.upper],
  ];
  const fa = p.arm - p.elbowBend;
  const hands: [Pt, Pt] = [
    [elbows[0][0] - Math.sin(rad(fa)) * L.fore, elbows[0][1] + Math.cos(rad(fa)) * L.fore],
    [elbows[1][0] + Math.sin(rad(fa)) * L.fore, elbows[1][1] + Math.cos(rad(fa)) * L.fore],
  ];
  const hips: [Pt, Pt] = [
    [cx - 8, pelvisY],
    [cx + 8, pelvisY],
  ];
  let knees: [Pt, Pt];
  let feet: [Pt, Pt];
  if (p.seated) {
    // thighs point at the viewer, so the knees sit just below and in front of the hips
    knees = [
      [cx - 10 - p.spread, pelvisY + 15],
      [cx + 10 + p.spread, pelvisY + 15],
    ];
    feet = [
      [cx - 10.5 - p.spread * 0.85, FLOOR - 3],
      [cx + 10.5 + p.spread * 0.85, FLOOR - 3],
    ];
  } else {
    knees = [
      [cx - 8.5, pelvisY + 30],
      [cx + 8.5, pelvisY + 30],
    ];
    feet = [
      [cx - 9, FLOOR - 4],
      [cx + 9, FLOOR - 4],
    ];
  }
  return { head: [cx, neckY - 12], neck: [cx, neckY], shoulders, elbows, hands, hips, knees, feet, pelvis: [cx, pelvisY], seated: p.seated };
}

function frontFace(h: Pt): Shape[] {
  const [x, y] = h;
  return [
    // female: hair falling behind the face to the jaw, in place of the ears
    ...(female
      ? [{ k: "path", d: smooth([[x - 8.4, y - 4], [x - 9.6, y + 4], [x - 8.4, y + 9.4], [x - 4, y + 7], [x + 4, y + 7], [x + 8.4, y + 9.4], [x + 9.6, y + 4], [x + 8.4, y - 4], [x, y - 10.4]]), w: 0, fill: true, tone: "hair", shade: -6, stroke: "line", sw: OUT } as Shape]
      : ([
          // ears first, then the face over them
          { k: "path", d: smooth([[x - 7.2, y - 1.4], [x - 8.8, y - 1.6], [x - 9, y + 1.6], [x - 7.4, y + 3]]), w: 0, fill: true, tone: "skin", shade: -6, stroke: "line", sw: 0.45 },
          { k: "path", d: smooth([[x + 7.2, y - 1.4], [x + 8.8, y - 1.6], [x + 9, y + 1.6], [x + 7.4, y + 3]]), w: 0, fill: true, tone: "skin", shade: -6, stroke: "line", sw: 0.45 },
        ] as Shape[])),
    { k: "path", d: smooth([[x, y - 8.8], [x + 6.6, y - 6], [x + 7.4, y - 0.6], [x + 6, y + 5], [x, y + 8.8], [x - 6, y + 5], [x - 7.4, y - 0.6], [x - 6.6, y - 6]]), w: 0, fill: true, tone: "skin", grad: { kind: "radial", c: [x - 1.6, y - 1.8], r: 10, stops: [{ o: 0, tone: "skin", shade: 16 }, { o: 0.65, tone: "skin" }, { o: 1, tone: "skin", shade: -16 }] }, stroke: "line", sw: OUT },
    // eyes, brows, nose, mouth
    ...[-1, 1].flatMap((s): Shape[] => [
      { k: "path", d: smooth([[x + s * 1.4, y + 0.6], [x + s * 2.8, y - 0.2], [x + s * 4.2, y + 0.6], [x + s * 2.8, y + 1.2]]), w: 0, fill: true, tone: "white", stroke: "line", sw: 0.35 },
      { k: "circle", c: [x + s * 2.8, y + 0.55], r: 0.55, tone: "line" },
      { k: "path", d: `M${x + s * 1.2},${y - 1.6} Q${x + s * 2.8},${y - 2.6} ${x + s * 4.4},${y - 1.6}`, w: female ? 0.45 : 0.7, tone: "hair" },
      ...(female ? [{ k: "path", d: `M${x + s * 4},${y + 0.2} L${x + s * 4.9},${y - 0.5}`, w: 0.35, tone: "line" } as Shape] : []),
    ]),
    { k: "path", d: `M${x},${y + 0.8} L${x - 0.9},${y + 3.6} Q${x},${y + 4.2} ${x + 0.9},${y + 3.6}`, w: 0.45, tone: "line", op: 0.5 },
    { k: "path", d: smooth([[x - 2.2, y + 5.4], [x, y + 5], [x + 2.2, y + 5.4], [x, y + 6.4]]), w: 0, fill: true, tone: "lips", op: 0.9 },
    // hair
    { k: "path", d: smooth([[x - 7.6, y - 0.2], [x - 7.8, y - 6.6], [x - 3, y - 10], [x + 3, y - 10], [x + 7.8, y - 6.6], [x + 7.6, y - 0.2], [x + 6.2, y - 4.6], [x + 2, y - 6.2], [x - 2.4, y - 5.8], [x - 6.2, y - 4.6]]), w: 0, fill: true, tone: "hair", grad: { kind: "linear", a: [x, y - 10], b: [x, y - 2], stops: [{ o: 0, tone: "hair", shade: 10 }, { o: 1, tone: "hair", shade: -10 }] }, stroke: "line", sw: OUT },
    { k: "path", d: `M${x - 4},${y - 8.6} Q${x - 1},${y - 7.6} ${x + 1},${y - 5.8} M${x + 2},${y - 9.2} Q${x + 5},${y - 7.6} ${x + 6},${y - 5}`, w: 0.4, tone: "hair", shade: 30, op: 0.7 },
  ];
}

function frontShoe(f: Pt): Shape[] {
  return [
    { k: "path", d: smooth([[f[0] - 4.6, f[1] + 3.6], [f[0] - 4.2, f[1] - 1.8], [f[0], f[1] - 3.4], [f[0] + 4.2, f[1] - 1.8], [f[0] + 4.6, f[1] + 3.6]]), w: 0, fill: true, tone: "shoe", grad: { kind: "linear", a: [f[0] - 5, f[1]], b: [f[0] + 5, f[1]], stops: [{ o: 0, tone: "shoe", shade: 10 }, { o: 1, tone: "shoe", shade: -12 }] }, stroke: "line", sw: OUT },
    { k: "path", d: `M${f[0] - 1.6},${f[1] - 2} L${f[0] + 1.6},${f[1] - 0.6} M${f[0] + 1.6},${f[1] - 2} L${f[0] - 1.6},${f[1] - 0.6} M${f[0] - 1.6},${f[1] + 0.2} L${f[0] + 1.6},${f[1] + 1.4}`, w: 0.45, tone: "line", op: 0.55 },
    { k: "rect", x: f[0] - 5, y: f[1] + 2.6, w: 10, h: 2.6, rx: 1.1, tone: "white", stroke: "line", sw: OUT },
    { k: "line", a: [f[0] - 4.4, f[1] + 4.7], b: [f[0] + 4.4, f[1] + 4.7], w: 0.9, tone: "sole" },
  ];
}

/** Front-view body parts in separate layers, so a scene can slot a seat or pads between them. */
export interface FrontLayers {
  legs: Shape[];
  shorts: Shape[];
  arms: Shape[];
  shirt: Shape[];
  sleeves: Shape[];
  head: Shape[];
  glow: Shape[];
}

export function frontLayers(j: FrontJoints, muscles: MuscleId[] = [], k = 0): FrontLayers {
  const legs: Shape[] = [];
  const shorts: Shape[] = [];
  const arms: Shape[] = [];
  const shirt: Shape[] = [];
  const headL: Shape[] = [];
  const glow: Shape[] = [];
  const [sl, sr] = j.shoulders;
  const cx = j.neck[0];
  const waistY = j.pelvis[1] - 10;
  const vlimb = (a: Pt, b: Pt, ra: number, rb: number, tone: Tone, bulge = 0.8, at = 0.4): Shape => limb(a, b, ra, rb, tone, bulge, bulge, at);
  // legs (shin, sock, thigh), shorts, shoes
  for (const s of [0, 1] as const) {
    const sign = s === 0 ? -1 : 1;
    const kn = j.knees[s];
    const f = j.feet[s];
    const hip = j.hips[s];
    if (j.seated) {
      // Seated, seen from the front and a little above: the thigh comes straight at the viewer,
      // so it widens toward the knee, which is the nearest point — in front of the seat edge,
      // with the shin hanging down from it.
      const kneeTop: Pt = [kn[0], kn[1] - 3];
      legs.push(vlimb(add(kn, [0, 2]), f, 5, 2.8, "skin", 1, 0.3));
      legs.push(vlimb(add(f, [0, -6]), add(f, [0, -1]), 3.1, 3, "sock", 0));
      // female: leggings over the thigh and most of the shin
      const thighTone: Tone = female ? "shorts" : "skin";
      if (female) legs.push(vlimb(add(kn, [0, 2]), lerpPt(add(kn, [0, 2]), f, 0.8), 5.2, 3.2, "shorts", 1, 0.3));
      legs.push({ k: "path", d: smooth([add(hip, [-sign * 6.2, -1]), add(hip, [sign * 6.6, -1.4]), add(kneeTop, [sign * 8.2, 0]), add(kn, [sign * 7.4, 4]), add(kn, [0, 6.6]), add(kn, [-sign * 7.4, 4]), add(kneeTop, [-sign * 7.6, 0])]), w: 0, fill: true, tone: thighTone, grad: { kind: "linear", a: [kn[0] - 9, 0], b: [kn[0] + 9, 0], stops: [{ o: 0, tone: thighTone, shade: sign < 0 ? 18 : -14 }, { o: 0.5, tone: thighTone, shade: 6 }, { o: 1, tone: thighTone, shade: sign < 0 ? -14 : 18 }] }, stroke: "line", sw: OUT });
      legs.push({ k: "ellipse", c: add(kn, [0, 2.4]), rx: 3.6, ry: 3.1, tone: thighTone, shade: 16, stroke: "line", sw: 0.4, op: female ? 0.6 : 1 });
      legs.push({ k: "path", d: `M${kn[0] - 3},${kn[1] + 5.8} Q${kn[0]},${kn[1] + 7.2} ${kn[0] + 3},${kn[1] + 5.8}`, w: 0.45, tone: "line", op: 0.45 });
      // shorts cover the half of the thigh nearest the hip
      const hem = lerpPt(hip, kneeTop, 0.5);
      if (!female) legs.push({ k: "path", d: smooth([add(hip, [-sign * 7, -2]), add(hip, [sign * 7.2, -2.4]), add(hem, [sign * 8.4, 1]), add(hem, [0, 3]), add(hem, [-sign * 8.2, 1])]), w: 0, fill: true, tone: "shorts", grad: { kind: "linear", a: [hip[0] - 9, 0], b: [hip[0] + 9, 0], stops: [{ o: 0, tone: "shorts", shade: 12 }, { o: 1, tone: "shorts", shade: -12 }] }, stroke: "line", sw: OUT });
    } else if (female) {
      legs.push(vlimb(kn, f, 4.3, 2.5, "skin", 0.9, 0.3));
      legs.push(vlimb(add(f, [0, -6]), add(f, [0, -1]), 2.8, 2.7, "sock", 0));
      legs.push(vlimb(kn, lerpPt(kn, f, 0.8), 4.7, 3.1, "shorts", 0.9, 0.3));
      legs.push(vlimb(hip, kn, 7.2, 4.8, "shorts", 0.8));
      legs.push({ k: "line", a: [hip[0] + sign * 6.8, hip[1] - 4], b: lerpPt(kn, f, 0.8), w: 0.9, tone: "stripe", op: 0.9 });
    } else {
      legs.push(vlimb(kn, f, 4.6, 2.7, "skin", 0.9, 0.3));
      legs.push(vlimb(add(f, [0, -6]), add(f, [0, -1]), 3, 2.9, "sock", 0));
      legs.push(vlimb(hip, kn, 6.7, 4.7, "skin", 0.7));
      legs.push({ k: "ellipse", c: [kn[0], kn[1] + 0.4], rx: 2.4, ry: 2.9, tone: "skin", shade: 12, stroke: "line", sw: 0.35, op: 0.9 });
      legs.push(along(hip, kn, 0.5, 0.92, sign * -2.8, sign * -1.8, sign * -0.8));
      legs.push(vlimb(hip, [hip[0] + sign * 0.8, hip[1] + 15], 7.8, 7.2, "shorts", 0.3));
      legs.push({ k: "line", a: [hip[0] + sign * 7.6, hip[1] - 6], b: [hip[0] + sign * 7.8, hip[1] + 15], w: 1.1, tone: "stripe", op: 0.9 });
    }
    legs.push(...frontShoe(f));
  }
  // shorts trunk with waistband and drawstring
  const hipW = female ? 14.4 : 15.6;
  shorts.push({ k: "path", d: smooth([[cx - 13, waistY], [cx + 13, waistY], [cx + hipW, j.pelvis[1] + 4], [cx + 9, j.pelvis[1] + 9], [cx, j.pelvis[1] + 6], [cx - 9, j.pelvis[1] + 9], [cx - hipW, j.pelvis[1] + 4]]), w: 0, fill: true, tone: "shorts", grad: { kind: "linear", a: [cx - 16, 0], b: [cx + 16, 0], stops: [{ o: 0, tone: "shorts", shade: 12 }, { o: 0.5, tone: "shorts" }, { o: 1, tone: "shorts", shade: -14 }] }, stroke: "line", sw: OUT });
  shorts.push({ k: "path", d: `M${cx - 13},${waistY + 2.4} Q${cx},${waistY + 3.6} ${cx + 13},${waistY + 2.4}`, w: 0.5, tone: "line", op: 0.45 });
  shorts.push({ k: "path", d: `M${cx - 1.2},${waistY + 3} q-1,3 0.4,4.6 M${cx + 1.2},${waistY + 3} q1,3 -0.4,4.6`, w: 0.45, tone: "white", op: 0.85 });
  // arms
  for (const s of [0, 1] as const) {
    arms.push(vlimb(j.elbows[s], j.hands[s], female ? 3 : 3.3, female ? 2.1 : 2.3, "skin", 0.8, 0.25));
    arms.push(vlimb(j.shoulders[s], j.elbows[s], female ? 3.8 : 4.2, female ? 2.9 : 3.2, "skin", 1));
    arms.push({ k: "circle", c: j.hands[s], r: 3, tone: "skin", grad: { kind: "radial", c: add(j.hands[s], [-0.8, -0.8]), r: 3.6, stops: [{ o: 0, tone: "skin", shade: 16 }, { o: 1, tone: "skin", shade: -14 }] }, stroke: "line", sw: OUT });
    arms.push({ k: "path", d: `M${j.hands[s][0] - 1.6},${j.hands[s][1] + 0.6} q1.6,1.4 3.2,0`, w: 0.4, tone: "line", op: 0.5 });
  }
  // t-shirt with sleeves, collar, side seams
  const shirtOutline: Pt[] = female
    ? // tank top: straps over the shoulders, armholes, a narrower waist
      [[cx - 6, j.neck[1] + 1], [sl[0] + 4, sl[1] - 3], [sl[0] + 2.6, sl[1] + 6], [sl[0] + 2.4, sl[1] + 13], [cx - 10.2, sl[1] + 22], [cx - 12.6, waistY + 2], [cx + 12.6, waistY + 2], [cx + 10.2, sr[1] + 22], [sr[0] - 2.4, sr[1] + 13], [sr[0] - 2.6, sr[1] + 6], [sr[0] - 4, sr[1] - 3], [cx + 6, j.neck[1] + 1]]
    : [[cx - 6, j.neck[1] + 1], [sl[0] - 3, sl[1] - 2.6], [sl[0] - 4.6, sl[1] + 4], [sl[0] - 1.8, sl[1] + 20], [cx - 13, waistY + 2], [cx + 13, waistY + 2], [sr[0] + 1.8, sr[1] + 20], [sr[0] + 4.6, sr[1] + 4], [sr[0] + 3, sr[1] - 2.6], [cx + 6, j.neck[1] + 1]];
  shirt.push({ k: "path", d: smooth(shirtOutline), w: 0, fill: true, tone: "shirt", grad: { kind: "linear", a: [cx - 18, 0], b: [cx + 18, 0], stops: [{ o: 0, tone: "shirt", shade: 14 }, { o: 0.45, tone: "shirt", shade: 4 }, { o: 1, tone: "shirt", shade: -16 }] }, stroke: "line", sw: OUT });
  const sleeves: Shape[] = [];
  for (const s of [0, 1] as const) {
    if (female) continue;
    const a: Pt = [j.shoulders[s][0] + (s ? -1 : 1) * 2.4, j.shoulders[s][1] + 0.6];
    const b = lerpPt(j.shoulders[s], j.elbows[s], 0.4);
    sleeves.push(limb(a, b, 4.6, 4.2, "shirt", 0.2, 0.2));
    sleeves.push(along(a, b, 0.86, 0.88, 4.4, -4.4, 0, "line", 0.4, 0.45));
  }
  shirt.push({ k: "path", d: `M${cx - 5.6},${j.neck[1] + 1.6} Q${cx},${j.neck[1] + 7} ${cx + 5.6},${j.neck[1] + 1.6}`, w: 1.4, tone: "shirt", shade: -14 });
  shirt.push({ k: "path", d: `M${cx - 5.6},${j.neck[1] + 1.6} Q${cx},${j.neck[1] + 7} ${cx + 5.6},${j.neck[1] + 1.6}`, w: 0.5, tone: "line", op: 0.5 });
  if (female) {
    // bust shaping and a seam under it
    shirt.push({ k: "path", d: `M${cx - 9},${j.neck[1] + 13} Q${cx - 4.6},${j.neck[1] + 17} ${cx - 0.6},${j.neck[1] + 13.4} M${cx + 9},${j.neck[1] + 13} Q${cx + 4.6},${j.neck[1] + 17} ${cx + 0.6},${j.neck[1] + 13.4}`, w: 0.5, tone: "shirtShade", op: 0.9 });
    shirt.push({ k: "path", d: `M${cx - 10},${j.neck[1] + 18} Q${cx},${j.neck[1] + 19.6} ${cx + 10},${j.neck[1] + 18}`, w: 0.45, tone: "line", op: 0.3 });
  } else {
    shirt.push({ k: "path", d: `M${cx - 1},${j.neck[1] + 12} Q${cx - 6},${j.neck[1] + 20} ${cx - 3},${waistY - 2} M${cx + 1},${j.neck[1] + 12} Q${cx + 6},${j.neck[1] + 20} ${cx + 3},${waistY - 2}`, w: 0.5, tone: "shirtShade", op: 0.8 });
    shirt.push({ k: "circle", c: [cx + 6, j.neck[1] + 10], r: 1.4, tone: "shirt", shade: 34, op: 0.9 });
  }
  // neck and head
  const h = j.head;
  headL.push(limb(j.neck, [cx, h[1] + 6], 3.5, 3.2, "skin", 0.2, 0.2));
  headL.push({ k: "path", d: `M${cx - 2.6},${j.neck[1] - 1} L${cx - 1},${j.neck[1] + 1.4} M${cx + 2.6},${j.neck[1] - 1} L${cx + 1},${j.neck[1] + 1.4}`, w: 0.4, tone: "line", op: 0.3 });
  headL.push(...frontFace(h));
  // working muscles (no blur filter: a faint wide layer under a brighter one)
  const op = 0.42 + 0.48 * k;
  const ell = (c: Pt, rx: number, ry: number, rot = 0): Shape[] => [
    { k: "ellipse", c, rx: rx + 1.4, ry: ry + 1.4, rot, tone: "muscle", op: op * 0.35 },
    { k: "ellipse", c, rx, ry, rot, tone: "muscle", op },
  ];
  for (const m of muscles) {
    for (const s of [0, 1] as const) {
      const sign = s === 0 ? -1 : 1;
      if (m === "sideDelts" || m === "frontDelts" || m === "rearDelts") glow.push(...ell(lerpPt(j.shoulders[s], j.elbows[s], 0.18), 4.4, 3.4, angleOf(j.shoulders[s], j.elbows[s])));
      if (m === "traps") glow.push(...ell([cx + sign * 8, j.neck[1] + 2], 5, 2.2, sign * 18));
      // outer hips (gluteus medius): high on the side of the hip
      if (m === "abductors") glow.push(...ell(j.seated ? [cx + sign * 15.6, j.pelvis[1] - 1] : [cx + sign * 14.5, j.pelvis[1] - 3], 3, 5.2, sign * 14));
      if (m === "glutes" && j.seated) glow.push(...ell([j.hips[s][0] + sign * 5, j.hips[s][1] + 4], 4, 3));
    }
  }
  return { legs, shorts, arms, shirt, sleeves, head: headL, glow };
}

/** Standing front view, all layers in order. */
export function frontBodyShapes(j: FrontJoints, muscles: MuscleId[] = [], k = 0): Shape[] {
  const l = frontLayers(j, muscles, k);
  return [...l.legs, ...l.shorts, ...l.arms, ...l.shirt, ...l.sleeves, ...l.head, ...l.glow];
}
