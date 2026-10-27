// A tiny 2D rig for exercise demonstrations. Poses are authored as hip position, torso/head
// angles and hand/foot *targets*; elbows and knees are solved with two-bone IK, so limbs bend
// naturally while we interpolate between keyframes. Output is a list of plain shape objects that
// React (or a test script) turns into SVG.

export type Pt = [number, number];
export type Tone = "near" | "far" | "prop" | "propSoft" | "accent" | "guide" | "floor";

export type Shape =
  | { k: "line"; a: Pt; b: Pt; w: number; tone: Tone; dash?: string }
  | { k: "circle"; c: Pt; r: number; tone: Tone; fill?: boolean; w?: number }
  | { k: "rect"; x: number; y: number; w: number; h: number; tone: Tone; rx?: number; fill?: boolean; rot?: number; cx?: number; cy?: number }
  | { k: "path"; d: string; tone: Tone; w: number; fill?: boolean; dash?: string }
  | { k: "poly"; pts: Pt[]; tone: Tone; w: number };

export const L = { torso1: 22, torso2: 22, neck: 5, head: 8, upper: 24, fore: 22, thigh: 30, shin: 30, foot: 9 };
export const FLOOR = 135;

/** Side-view pose. Angles in degrees, SVG convention: 0 = right, 90 = down, -90 = up. */
export interface Pose {
  hip: Pt;
  torso: [number, number];
  head: number;
  hands: [Pt, Pt]; // [far, near]
  feet: [Pt, Pt]; // [far, near]
  /** +1 / -1 picks which way elbows and knees bend (per limb: [far, near]); +1 = knees forward when facing right. */
  elbow?: [number, number];
  knee?: [number, number];
  /** foot direction in degrees (default: pointing right along the floor) */
  footAngle?: [number, number];
}

export const rad = (d: number) => (d * Math.PI) / 180;
export const dir = (deg: number, len: number, from: Pt): Pt => [from[0] + Math.cos(rad(deg)) * len, from[1] + Math.sin(rad(deg)) * len];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpPt = (a: Pt, b: Pt, t: number): Pt => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];

/** Two-bone IK: joint position between root and target. */
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
function reach(root: Pt, target: Pt, len: number): Pt {
  const dx = target[0] - root[0];
  const dy = target[1] - root[1];
  const d = Math.hypot(dx, dy);
  if (d <= len) return target;
  return [root[0] + (dx / d) * len, root[1] + (dy / d) * len];
}

export interface Joints {
  hip: Pt;
  mid: Pt;
  neck: Pt;
  head: Pt;
  elbow: [Pt, Pt];
  hand: [Pt, Pt];
  knee: [Pt, Pt];
  ankle: [Pt, Pt];
  toe: [Pt, Pt];
}

export function joints(p: Pose): Joints {
  const mid = dir(p.torso[0], L.torso1, p.hip);
  const neck = dir(p.torso[1], L.torso2, mid);
  const head = dir(p.head, L.neck + L.head, neck);
  const eb = p.elbow ?? [1, 1];
  const kb = p.knee ?? [1, 1];
  const fa = p.footAngle ?? [0, 0];
  const elbow: [Pt, Pt] = [0, 1].map((i) => solve(neck, p.hands[i], L.upper, L.fore, eb[i])) as [Pt, Pt];
  const hand: [Pt, Pt] = [0, 1].map((i) => reach(elbow[i], p.hands[i], L.fore)) as [Pt, Pt];
  const knee: [Pt, Pt] = [0, 1].map((i) => solve(p.hip, p.feet[i], L.thigh, L.shin, kb[i])) as [Pt, Pt];
  const ankle: [Pt, Pt] = [0, 1].map((i) => reach(knee[i], p.feet[i], L.shin)) as [Pt, Pt];
  const toe: [Pt, Pt] = [0, 1].map((i) => dir(fa[i], L.foot, ankle[i])) as [Pt, Pt];
  return { hip: p.hip, mid, neck, head, elbow, hand, knee, ankle, toe };
}

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const pair = <T extends number>(x: [T, T] | undefined, y: [T, T] | undefined, def: [number, number]): [number, number] => {
    const xa = x ?? def;
    const ya = y ?? def;
    return [lerp(xa[0], ya[0], t), lerp(xa[1], ya[1], t)];
  };
  return {
    hip: lerpPt(a.hip, b.hip, t),
    torso: [lerp(a.torso[0], b.torso[0], t), lerp(a.torso[1], b.torso[1], t)],
    head: lerp(a.head, b.head, t),
    hands: [lerpPt(a.hands[0], b.hands[0], t), lerpPt(a.hands[1], b.hands[1], t)],
    feet: [lerpPt(a.feet[0], b.feet[0], t), lerpPt(a.feet[1], b.feet[1], t)],
    elbow: t < 0.5 ? a.elbow : b.elbow,
    knee: t < 0.5 ? a.knee : b.knee,
    footAngle: pair(a.footAngle, b.footAngle, [0, 0]),
  };
}

const ease = (t: number) => 0.5 - Math.cos(Math.PI * t) / 2;

/**
 * Keyframes with holds. Each step: move to pose over `move` (fraction of the cycle), then
 * hold for `hold`. The cycle loops back to the first pose.
 */
export function keyframes<P>(lerpFn: (a: P, b: P, t: number) => P, steps: { pose: P; hold: number; move: number }[]) {
  const total = steps.reduce((n, s) => n + s.hold + s.move, 0);
  return (t: number): P => {
    let x = (((t % 1) + 1) % 1) * total;
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      if (x < s.hold) return s.pose;
      x -= s.hold;
      if (x < s.move) return lerpFn(s.pose, steps[(i + 1) % steps.length].pose, ease(x / s.move));
      x -= s.move;
    }
    return steps[0].pose;
  };
}

/** Body shapes, far limbs first so the near side overlaps them. */
export function bodyShapes(j: Joints): Shape[] {
  const limb = (pts: Pt[], tone: Tone, w: number): Shape => ({ k: "poly", pts, tone, w });
  const torso: Shape = { k: "path", d: `M${j.hip[0]},${j.hip[1]} Q${j.mid[0]},${j.mid[1]} ${j.neck[0]},${j.neck[1]}`, tone: "near", w: 12 };
  return [
    limb([j.neck, j.elbow[0], j.hand[0]], "far", 7),
    limb([j.hip, j.knee[0], j.ankle[0], j.toe[0]], "far", 8.5),
    torso,
    { k: "line", a: j.neck, b: j.head, w: 6, tone: "near" },
    { k: "circle", c: j.head, r: L.head, tone: "near", fill: true },
    limb([j.hip, j.knee[1], j.ankle[1], j.toe[1]], "near", 8.5),
    limb([j.neck, j.elbow[1], j.hand[1]], "near", 7),
  ];
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
}

export function frontJoints(p: FrontPose): FrontJoints {
  const cx = 100;
  const pelvisY = p.seated ? 96 : 76;
  const neckY = pelvisY - 44;
  const shoulders: [Pt, Pt] = [
    [cx - 15, neckY + 4],
    [cx + 15, neckY + 4],
  ];
  // Left arm mirrors the right: angle measured from hanging straight down toward the side.
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
    [cx - 9, pelvisY],
    [cx + 9, pelvisY],
  ];
  let knees: [Pt, Pt];
  let feet: [Pt, Pt];
  if (p.seated) {
    knees = [
      [cx - 10 - p.spread, pelvisY + 10],
      [cx + 10 + p.spread, pelvisY + 10],
    ];
    feet = [
      [cx - 11 - p.spread * 0.75, FLOOR - 2],
      [cx + 11 + p.spread * 0.75, FLOOR - 2],
    ];
  } else {
    knees = [
      [cx - 9, pelvisY + 30],
      [cx + 9, pelvisY + 30],
    ];
    feet = [
      [cx - 9, FLOOR - 2],
      [cx + 9, FLOOR - 2],
    ];
  }
  return { head: [cx, neckY - 13], neck: [cx, neckY], shoulders, elbows, hands, hips, knees, feet, pelvis: [cx, pelvisY] };
}

export function frontBodyShapes(j: FrontJoints): Shape[] {
  return [
    { k: "poly", pts: [j.hips[0], j.knees[0], j.feet[0]], tone: "near", w: 8.5 },
    { k: "poly", pts: [j.hips[1], j.knees[1], j.feet[1]], tone: "near", w: 8.5 },
    { k: "path", d: `M${j.shoulders[0][0]},${j.shoulders[0][1]} L${j.shoulders[1][0]},${j.shoulders[1][1]} L${j.hips[1][0]},${j.hips[1][1]} L${j.hips[0][0]},${j.hips[0][1]} Z`, tone: "near", w: 6, fill: true },
    { k: "line", a: j.neck, b: j.head, w: 6, tone: "near" },
    { k: "circle", c: j.head, r: L.head, tone: "near", fill: true },
    { k: "poly", pts: [j.shoulders[0], j.elbows[0], j.hands[0]], tone: "near", w: 7 },
    { k: "poly", pts: [j.shoulders[1], j.elbows[1], j.hands[1]], tone: "near", w: 7 },
  ];
}
