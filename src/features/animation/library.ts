import type { MuscleId } from "@/lib/data/muscles";
import {
  add,
  angleOf,
  bodyLayers,
  ease,
  FLOOR,
  frontBodyShapes,
  frontJoints,
  frontLayers,
  joints,
  keyframes,
  lerpFront,
  lerpPose,
  lerp,
  lerpPt,
  mul,
  perp,
  sub,
  unit,
  type FrontJoints,
  type FrontPose,
  type Joints,
  type Pose,
  type Pt,
  type Shape,
} from "./figure";
import { bench, bolt, box, bracket, cable, dumbbell, foot, grip, guide, mat, pad, padAlong, plateFace, pulley, roller, screen, shadow, stage, tube, weightStack } from "./props";

export interface ExerciseAnimation {
  /** seconds per full repetition cycle */
  cycle: number;
  /** The picture at time t (0–1 through one repetition); `muscles` glow on the figure. */
  at: (t: number, muscles?: MuscleId[]) => Shape[];
  /** Positions shown in the frame-by-frame fallback, with what changes between them. */
  frames: { t: number; label: string }[];
  /** One line describing the movement direction, shown under the frames. */
  cue: string;
  /** Optional custom viewBox for tall movements (default "0 0 200 150"). */
  viewBox?: string;
}

type Step = { pose: Pose; hold: number; move: number };

/** Props slotted between body layers: behind everything, after the far limbs, after the torso, after the near leg, in front. */
interface Layers {
  back?: Shape[];
  far?: Shape[];
  mid?: Shape[];
  legs?: Shape[];
  front?: Shape[];
}

/**
 * The path a tracked point follows from the first pose to the second, nudged a little away from
 * the body so the dotted guide sits beside the limb rather than on top of it.
 */
function guidePath<J>(at: (s: number) => J, track: (j: J) => Pt, away: Pt): Pt[] {
  const pts = Array.from({ length: 14 }, (_, i) => track(at(i / 13)));
  // pick the side once (at the middle of the path) so the guide never flips from side to side
  const mid = pts[7];
  const midN = perp(unit(sub(pts[8], pts[6])));
  const dist = (p: Pt) => Math.hypot(p[0] - away[0], p[1] - away[1]);
  const sign = dist(add(mid, midN)) >= dist(mid) ? 1 : -1;
  return pts.map((p, i) => {
    const tan = unit(sub(pts[Math.min(i + 1, pts.length - 1)], pts[Math.max(i - 1, 0)]));
    return add(p, mul(perp(tan), 7 * sign));
  });
}

function side(steps: Step[], props: (j: Joints, k: number, t: number) => Layers, track?: (j: Joints) => Pt) {
  const poseAt = keyframes(lerpPose, steps);
  const path = track ? guide(guidePath((s) => joints(lerpPose(steps[0].pose, steps[1].pose, s)), track, steps[0].pose.hip)) : [];
  return (t: number, muscles: MuscleId[] = []): Shape[] => {
    const { pose, k } = poseAt(t);
    const j = joints(pose);
    const b = bodyLayers(j, muscles, k);
    const p = props(j, k, t);
    return [...stage(), ...(p.back ?? []), ...b.farArm, ...b.farLeg, ...(p.far ?? []), ...b.trunk, ...(p.mid ?? []), ...b.nearLeg, ...(p.legs ?? []), ...b.nearArm, ...(p.front ?? []), ...b.glow, ...path];
  };
}

function front(steps: { pose: FrontPose; hold: number; move: number }[], props: (j: FrontJoints, k: number) => { back?: Shape[]; front?: Shape[] }, track?: (j: FrontJoints) => Pt) {
  const at = keyframes(lerpFront, steps);
  const path = track ? guide(guidePath((s) => frontJoints(lerpFront(steps[0].pose, steps[1].pose, s)), track, [100, 70])) : [];
  return (t: number, muscles: MuscleId[] = []): Shape[] => {
    const { pose, k } = at(t);
    const j = frontJoints(pose);
    const p = props(j, k);
    return [...stage(), ...(p.back ?? []), ...frontBodyShapes(j, muscles, k), ...(p.front ?? []), ...path];
  };
}

const STAND: Pose = { hip: [100, 74], torso: [-90, -90], head: -90, hands: [[99, 118], [101, 118]], feet: [[97, 133], [103, 133]] };

/** Base rail along the floor with rubber feet. */
const baseRail = (x1: number, x2: number): Shape[] => [...tube([x1, FLOOR - 3], [x2, FLOOR - 3], 2), foot(x1 + 3), foot(x2 - 3)];

/** A metal foot platform under the soles, at the near foot's angle. */
function footplate(j: Joints, i: 0 | 1, l = 22): Shape[] {
  const u = unit(sub(j.toe[i], j.ankle[i]));
  const w: Pt = [u[1], -u[0]];
  const c = add(add(j.ankle[i], mul(w, -4.6)), mul(u, 4));
  const a = add(c, mul(u, -l / 2));
  const b = add(c, mul(u, l / 2));
  return [...tube(a, b, 1.8), { k: "line", a: add(a, mul(u, 2)), b: add(b, mul(u, -2)), w: 1.2, tone: "rubber", dash: "1 1", op: 0.7 }];
}

// ---------------------------------------------------------------- definitions

const hipThrust: ExerciseAnimation = {
  cycle: 3.2,
  cue: "Hips drive up from just above the seat to a straight line from shoulders to knees.",
  frames: [
    { t: 0, label: "Hips lowered" },
    { t: 0.45, label: "Full hip extension" },
  ],
  at: side(
    [
      { pose: { hip: [102, 118], torso: [-160, -156], head: -150, hands: [[106, 106], [108, 106]], feet: [[134, 133], [137, 133]] }, hold: 0.15, move: 0.3 },
      { pose: { hip: [102, 96], torso: [-179, -177], head: -170, hands: [[106, 84], [108, 84]], feet: [[134, 133], [137, 133]] }, hold: 0.15, move: 0.4 },
    ],
    (j, k) => {
      const n0 = perp(unit(sub(j.mid, j.hip)));
      const padC = add(j.hip, mul(n0, 8.6));
      const pivot: Pt = [168, 92];
      const plateC = lerpPt(pivot, padC, 0.34);
      return {
        back: [
          shadow(100, 150),
          ...baseRail(36, 182),
          ...bench(18, 74, 98, 8),
          { k: "rect", x: 118, y: FLOOR - 6.5, w: 44, h: 3.6, rx: 1.2, fill: true, tone: "rubber", stroke: "line", sw: 0.65 },
          ...tube([168, FLOOR - 3], pivot, 2.6),
          ...tube([150, FLOOR - 3], [166, 104], 1.8),
          ...tube(pivot, padC, 2.2),
          ...plateFace(plateC, 9.5, -k * 25),
          ...pulley(pivot, 3.2, k * 40),
        ],
        legs: [...padAlong(add(padC, [-11, 0]), add(padC, [11, 0]), 7.4, 3.6)],
        front: [...grip(add(padC, [4, -4]), 0, 7)],
      };
    },
    (j) => j.hip,
  ),
};

const rdl: ExerciseAnimation = {
  cycle: 3.6,
  cue: "Hips push back as the torso tilts forward with a flat back, then drive forward to stand.",
  frames: [
    { t: 0, label: "Standing tall" },
    { t: 0.45, label: "Hips back, flat back" },
  ],
  at: side(
    [
      { pose: { ...STAND, hands: [[102, 100], [104, 100]], feet: [[98, 133], [104, 133]] }, hold: 0.12, move: 0.38 },
      { pose: { hip: [84, 78], torso: [-28, -26], head: -18, hands: [[124, 112], [126, 112]], feet: [[98, 133], [104, 133]] }, hold: 0.1, move: 0.4 },
    ],
    (j) => ({
      back: [shadow(100, 56), ...mat(60, 150)],
      far: dumbbell(j.grip[0], 0, 1, "end"),
      front: dumbbell(j.grip[1], 0, 1, "end"),
    }),
    (j) => j.grip[1],
  ),
};

const legPress: ExerciseAnimation = {
  cycle: 3.4,
  cue: "Knees bend to lower the platform toward you, then the legs press it back up the rails.",
  frames: [
    { t: 0, label: "Knees bent" },
    { t: 0.5, label: "Legs extended" },
  ],
  at: side(
    [
      { pose: { hip: [70, 112], torso: [-145, -140], head: -128, hands: [[76, 116], [78, 116]], feet: [[110, 76], [113, 79]], footAngle: [-110, -110] }, hold: 0.12, move: 0.38 },
      { pose: { hip: [70, 112], torso: [-145, -140], head: -128, hands: [[76, 116], [78, 116]], feet: [[122, 63], [125, 66]], footAngle: [-110, -110] }, hold: 0.1, move: 0.4 },
    ],
    (j) => {
      // sled rides the rails with the feet
      const u = unit(sub(j.toe[1], j.ankle[1]));
      const w: Pt = [u[1], -u[0]];
      const plateC = add(add(j.ankle[1], mul(w, -4.4)), mul(u, 3));
      const sledC = add(plateC, mul(w, -10));
      return {
        back: [
          shadow(100, 170),
          ...baseRail(10, 190),
          ...tube([92, 132], [180, 44], 2.4),
          ...tube([178, 46], [178, FLOOR - 3], 2.2),
          ...tube([136, 88], [136, FLOOR - 3], 2),
          ...tube([60, 126], [60, FLOOR - 3], 2.2),
          ...tube([28, 102], [28, FLOOR - 3], 2),
          ...padAlong([68, 120], [28, 92], 9, 3.6),
          ...pad(46, 120, 42, 7),
          { k: "rect", x: sledC[0] - 15, y: sledC[1] - 5, w: 30, h: 10, rx: 2, fill: true, tone: "metalDark", stroke: "line", sw: 0.65, rot: angleOf([0, 0], u), cx: sledC[0], cy: sledC[1] },
          ...plateFace(add(sledC, mul(w, -5)), 11),
          { k: "rect", x: plateC[0] - 14, y: plateC[1] - 2.6, w: 28, h: 5.2, rx: 1.4, fill: true, tone: "metal", stroke: "line", sw: 0.65, rot: angleOf([0, 0], u), cx: plateC[0], cy: plateC[1] },
          ...Array.from({ length: 6 }, (_, i): Shape => ({ k: "line", a: add(add(plateC, mul(u, -11 + i * 4.4)), mul(w, 1.2)), b: add(add(plateC, mul(u, -11 + i * 4.4)), mul(w, -1.2)), w: 0.6, tone: "metalDark" })),
        ],
        far: [],
        front: [...grip([84, 122], 0, 8)],
      };
    },
    (j) => j.ankle[1],
  ),
};

const abduction: ExerciseAnimation = {
  cycle: 3,
  cue: "Seen from the front: seated with the pads on the outside of the knees, push the knees apart, then let them come back slowly.",
  frames: [
    { t: 0, label: "Knees together" },
    { t: 0.45, label: "Knees pushed out" },
  ],
  at: (() => {
    const steps = [
      { pose: { arm: 23, elbowBend: 18, spread: 0, seated: true }, hold: 0.12, move: 0.33 },
      { pose: { arm: 23, elbowBend: 18, spread: 20, seated: true }, hold: 0.12, move: 0.43 },
    ];
    const poseAt = keyframes(lerpFront, steps);
    const path = guide(guidePath((s) => frontJoints(lerpFront(steps[0].pose, steps[1].pose, s)), (j) => add(j.knees[1], [0, 10]), [100, 140]));
    // the seat seen from the front and a little above: its top surface is a trapezoid that
    // widens toward the viewer, with the front face of the cushion below it
    const seatTop = "M74,91 L126,91 L134,104 L66,104 Z";
    return (t: number, muscles: MuscleId[] = []): Shape[] => {
      const { pose, k } = poseAt(t);
      const j = frontJoints(pose);
      const b = frontLayers(j, muscles, k);
      const stack = weightStack(158, 26, { lift: k * 12, plates: 13 });
      // lever arms pivot under the seat and run behind the shins; only the pads sit in front
      const levers = j.knees.flatMap((kn, s): Shape[] => {
        const sign = s === 0 ? -1 : 1;
        const pivot: Pt = [100 + sign * 13, 116];
        return [...tube(pivot, [kn[0] + sign * 10.5, kn[1] + 12], 1.9), ...bolt(pivot, 1.3)];
      });
      const kneePads = j.knees.flatMap((kn, s): Shape[] => {
        const x = kn[0] + (s === 0 ? -1 : 1) * 10.5;
        return padAlong([x, kn[1] - 7], [x, kn[1] + 12], 6.4, 3);
      });
      const handles = j.hands.flatMap((h): Shape[] => [...tube([h[0], 112], add(h, [0, 3]), 1.4), { k: "circle", c: add(h, [0, 1.5]), r: 2.6, tone: "rubber", stroke: "line", sw: 0.5 }]);
      return [
        ...stage(),
        shadow(110, 150),
        ...stack.shapes,
        ...cable([stack.cable, [171, 18], [126, 18], [126, 30]]),
        ...pulley([171, 20], 3.4, k * 120),
        ...tube([126, 30], [126, FLOOR - 3], 2),
        ...tube([70, FLOOR - 3], [130, FLOOR - 3], 2.2),
        foot(72),
        foot(128),
        ...pad(74, 26, 52, 66, 6),
        ...b.shorts,
        ...b.shirt,
        { k: "path", d: seatTop, w: 0, fill: true, tone: "pad", grad: { kind: "linear", a: [0, 91], b: [0, 104], stops: [{ o: 0, tone: "pad", shade: -10 }, { o: 1, tone: "pad", shade: 14 }] }, stroke: "line", sw: 0.6 },
        { k: "path", d: "M77,93 L123,93 L130,102.6 L70,102.6 Z", w: 0.35, tone: "padLight", dash: "0.9 0.7", op: 0.8 },
        ...pad(66, 103.4, 68, 7, 2.4),
        ...tube([100, 111], [100, FLOOR - 3], 3),
        ...handles,
        ...levers,
        ...b.legs,
        ...kneePads,
        ...b.arms,
        ...b.sleeves,
        ...b.head,
        ...b.glow,
        ...path,
      ];
    };
  })(),
};

const legCurl: ExerciseAnimation = {
  cycle: 3,
  cue: "Heels curl down and back under the seat while the thighs stay pinned.",
  frames: [
    { t: 0, label: "Legs extended" },
    { t: 0.45, label: "Heels curled under" },
  ],
  at: side(
    [
      { pose: { hip: [88, 98], torso: [-96, -93], head: -88, hands: [[104, 92], [106, 92]], feet: [[141, 113], [144, 113]], footAngle: [-60, -60] }, hold: 0.12, move: 0.33 },
      { pose: { hip: [88, 98], torso: [-96, -93], head: -88, hands: [[104, 92], [106, 92]], feet: [[104, 125], [106, 125]], footAngle: [-10, -10] }, hold: 0.12, move: 0.43 },
    ],
    (j, k) => {
      const kn = j.knee[1];
      const shinU = unit(sub(j.ankle[1], kn));
      const rollC = add(add(j.ankle[1], mul(shinU, -3)), mul(perp(shinU), 5.4));
      const stack = weightStack(12, 30, { lift: k * 12 });
      return {
        back: [
          shadow(96, 170),
          ...baseRail(6, 150),
          ...stack.shapes,
          ...cable([stack.cable, [25, 22], [52, 22], [52, 118], [kn[0], 118]]),
          ...pulley([25, 24], 3.2, k * 160),
          ...pulley([52, 118], 3, k * 160),
          ...tube([90, 110], [90, FLOOR - 3], 2.6),
          ...tube([kn[0] + 4, FLOOR - 3], [kn[0] + 2, kn[1] + 4], 2.2),
          ...pad(64, 103, 52, 8),
          ...padAlong([79, 104], [74, 50], 9, 3.6),
        ],
        legs: [
          ...tube([kn[0] - 14, 70], [kn[0] - 1, kn[1] - 10], 1.8),
          ...padAlong([kn[0] - 11, kn[1] - 9.4], [kn[0] + 5, kn[1] - 9.4], 6.4, 3),
          ...tube(kn, rollC, 2),
          ...plateFace(kn, 4.4, angleOf(kn, rollC)),
          ...roller(rollC, 4.4),
        ],
        front: [...grip(j.grip[1], 90, 7)],
      };
    },
    (j) => j.ankle[1],
  ),
};

/** Seated machine press: handles on levers from a pivot behind the shoulders, stack behind. */
function seatedPress(torso: [number, number], hip: Pt, a: [Pt, Pt], b: [Pt, Pt], backPad: [Pt, Pt], pivot: Pt): (t: number, m?: MuscleId[]) => Shape[] {
  return side(
    [
      { pose: { hip, torso, head: torso[1] + 4, hands: a, feet: [[hip[0] + 32, 133], [hip[0] + 35, 133]] }, hold: 0.12, move: 0.33 },
      { pose: { hip, torso, head: torso[1] + 4, hands: b, feet: [[hip[0] + 32, 133], [hip[0] + 35, 133]] }, hold: 0.1, move: 0.45 },
    ],
    (j, k) => {
      const stack = weightStack(10, 22, { lift: k * 14 });
      const lever = (g: Pt): Shape[] => [...tube(pivot, add(g, [0, -5]), 2), ...grip(g, 90, 9)];
      return {
        back: [
          shadow(90, 170),
          ...baseRail(4, 150),
          ...stack.shapes,
          ...cable([stack.cable, [23, 14], [pivot[0], 14], pivot]),
          ...pulley([23, 16], 3.2, k * 160),
          ...tube([hip[0] - 22, FLOOR - 3], [hip[0] - 22, 16], 2.4),
          ...tube([10, 14], [pivot[0] + 4, 14], 2.2),
          ...bracket([hip[0] - 22, 14], 0, 3),
          ...tube([hip[0], 112], [hip[0], FLOOR - 3], 2.6),
          ...pad(hip[0] - 20, hip[1] + 4, 44, 8),
          ...padAlong(backPad[0], backPad[1], 9, 3.6),
          ...pulley(pivot, 3.4, k * 60),
        ],
        // both levers run behind the body; only the near handle is in front of the hand
        far: [...lever(j.grip[0]), ...tube(pivot, add(j.grip[1], [0, -5]), 2)],
        front: grip(j.grip[1], 90, 9),
      };
    },
    (j) => j.grip[1],
  );
}

const chestPress: ExerciseAnimation = {
  cycle: 3,
  cue: "Handles press straight forward from chest height until the arms are almost straight.",
  frames: [
    { t: 0, label: "Handles at chest" },
    { t: 0.45, label: "Arms extended" },
  ],
  at: seatedPress([-90, -90], [80, 100], [[100, 64], [102, 66]], [[128, 62], [130, 64]], [[71, 102], [69, 40]], [76, 28]),
};

const inclinePress: ExerciseAnimation = {
  cycle: 3,
  cue: "Handles press up and forward along the incline, then return to the upper chest.",
  frames: [
    { t: 0, label: "Handles at upper chest" },
    { t: 0.45, label: "Arms extended up and out" },
  ],
  at: seatedPress([-115, -112], [84, 104], [[92, 50], [94, 52]], [[112, 20], [114, 22]], [[78, 108], [55, 62]], [58, 38]),
};

const latPulldown: ExerciseAnimation = {
  cycle: 3.2,
  cue: "The bar travels down toward the upper chest as the elbows drive down and back.",
  frames: [
    { t: 0, label: "Arms overhead" },
    { t: 0.45, label: "Bar at upper chest" },
  ],
  viewBox: "0 -10 200 160",
  at: side(
    [
      { pose: { hip: [92, 102], torso: [-96, -98], head: -92, hands: [[96, 12], [98, 12]], feet: [[126, 133], [129, 133]] }, hold: 0.12, move: 0.33 },
      { pose: { hip: [92, 102], torso: [-100, -104], head: -96, hands: [[106, 63], [108, 63]], feet: [[126, 133], [129, 133]] }, hold: 0.12, move: 0.43 },
    ],
    (j, k) => {
      const stack = weightStack(160, 12, { lift: k * 16 });
      const g = j.grip[1];
      return {
        back: [
          shadow(110, 160),
          ...baseRail(60, 192),
          ...stack.shapes,
          ...tube([150, FLOOR - 3], [150, -2], 3),
          ...tube([96, -2], [192, -2], 2.6),
          ...bracket([150, -2], 0, 3.4),
          ...cable([stack.cable, [173, 2], [101, 2], g]),
          ...pulley([173, 2], 3.4, k * 200),
          ...pulley([101, 2], 3.4, k * 200),
          ...tube([92, 112], [92, FLOOR - 3], 2.6),
          ...pad(68, 107, 46, 8),
          ...tube([122, 84], [122, FLOOR - 3], 2),
        ],
        legs: [...tube([122, 84], [116, 92], 1.8), ...roller([113, 94], 4.6)],
        front: [
          ...tube(add(g, [-9, 5]), add(g, [-2, 0.4]), 1.3),
          ...tube(add(g, [2, 0.4]), add(g, [10, 5.5]), 1.3),
          { k: "rect", x: g[0] - 3, y: g[1] - 2.2, w: 6, h: 4.4, rx: 1.4, fill: true, tone: "metal", stroke: "line", sw: 0.6 },
          { k: "circle", c: g, r: 1, fill: true, tone: "metalDark" },
        ],
      };
    },
    (j) => j.grip[1],
  ),
};

const cableRow: ExerciseAnimation = {
  cycle: 3.2,
  cue: "The handle is pulled to the lower ribs as the shoulder blades squeeze together.",
  frames: [
    { t: 0, label: "Arms extended" },
    { t: 0.45, label: "Handle at ribs" },
  ],
  at: side(
    [
      { pose: { hip: [66, 112], torso: [-84, -84], head: -84, hands: [[118, 88], [120, 88]], feet: [[122, 122], [125, 122]], footAngle: [-70, -70] }, hold: 0.12, move: 0.33 },
      { pose: { hip: [66, 112], torso: [-92, -94], head: -90, hands: [[84, 96], [86, 96]], feet: [[122, 122], [125, 122]], footAngle: [-70, -70] }, hold: 0.12, move: 0.43 },
    ],
    (j, k) => {
      const stack = weightStack(164, 30, { lift: k * 14 });
      const g = j.grip[1];
      return {
        back: [
          shadow(100, 180),
          ...baseRail(20, 194),
          ...stack.shapes,
          ...tube([148, FLOOR - 3], [148, 20], 2.6),
          ...tube([146, 20], [192, 20], 2.4),
          ...cable([[g[0] + 6, g[1]], [146, 96], [146, 24], [177, 24], stack.cable]),
          ...pulley([146, 96], 3.4, -k * 160),
          ...pulley([146, 24], 3.2, -k * 160),
          ...pulley([177, 24], 3.2, -k * 160),
          ...bench(26, 104, 117, 6),
          ...tube([132, FLOOR - 3], [132, 104], 2.2),
        ],
        legs: footplate(j, 1, 20),
        front: [
          { k: "path", d: `M${g[0]},${g[1] - 5} L${g[0] + 7},${g[1]} L${g[0]},${g[1] + 5}`, w: 1.8, tone: "metal", stroke: "line", sw: 0.4 },
          ...grip(g, 90, 10),
        ],
      };
    },
    (j) => j.grip[1],
  ),
};

const lateralRaise: ExerciseAnimation = {
  cycle: 3,
  cue: "Seen from the front: arms rise out to the sides to shoulder height, then lower slowly.",
  frames: [
    { t: 0, label: "Arms at sides" },
    { t: 0.45, label: "Arms at shoulder height" },
  ],
  at: front(
    [
      { pose: { arm: 8, elbowBend: 6, spread: 0, seated: false }, hold: 0.12, move: 0.33 },
      { pose: { arm: 86, elbowBend: 10, spread: 0, seated: false }, hold: 0.12, move: 0.43 },
    ],
    (j) => ({
      back: [shadow(100, 50), ...mat(64, 136)],
      front: [...dumbbell(j.hands[0], 0, 0.9, "end"), ...dumbbell(j.hands[1], 0, 0.9, "end")],
    }),
    (j) => j.hands[1],
  ),
};

function curl(neutral: boolean): ExerciseAnimation {
  return {
    cycle: 3,
    cue: neutral ? "Palms face each other as the forearm curls up, upper arm still at the side." : "The forearm curls up toward the shoulder while the upper arm stays still at the side.",
    frames: [
      { t: 0, label: "Arms straight" },
      { t: 0.45, label: "Curled up" },
    ],
    at: side(
      [
        { pose: { ...STAND, hands: [[100, 120], [102, 120]] }, hold: 0.12, move: 0.33 },
        { pose: { ...STAND, hands: [[115, 40], [117, 40]] }, hold: 0.12, move: 0.43 },
      ],
      (j) => {
        const bell = (i: 0 | 1) => (neutral ? dumbbell(j.grip[i], j.handAngle[i] + 90, 0.95) : dumbbell(j.grip[i], 0, 0.95, "end"));
        return { back: [shadow(100, 50), ...mat(64, 140)], far: bell(0), front: bell(1) };
      },
      (j) => j.grip[1],
    ),
  };
}

const pushdown: ExerciseAnimation = {
  cycle: 3,
  cue: "Elbows stay pinned at the sides while the hands push the rope down until the arms are straight.",
  frames: [
    { t: 0, label: "Hands at chest" },
    { t: 0.45, label: "Arms straight" },
  ],
  viewBox: "0 -10 200 160",
  at: side(
    [
      { pose: { hip: [96, 74], torso: [-84, -80], head: -78, hands: [[118, 46], [120, 46]], feet: [[92, 133], [99, 133]] }, hold: 0.12, move: 0.33 },
      { pose: { hip: [96, 74], torso: [-84, -80], head: -78, hands: [[112, 90], [114, 90]], feet: [[92, 133], [99, 133]] }, hold: 0.12, move: 0.43 },
    ],
    (j, k) => {
      const stack = weightStack(160, 6, { lift: k * 16 });
      const g = j.grip[1];
      const clamp: Pt = [g[0] + 1, g[1] - 10];
      const rope = (h: Pt): Shape[] => [
        { k: "line", a: clamp, b: h, w: 3, tone: "line", op: 0.7 },
        { k: "line", a: clamp, b: h, w: 2, tone: "cable", dash: "1 0.6" },
        { k: "circle", c: add(h, [0, 3.2]), r: 2.2, fill: true, tone: "rubber", stroke: "line", sw: 0.5 },
      ];
      return {
        back: [
          shadow(110, 150),
          ...baseRail(134, 194),
          ...stack.shapes,
          ...tube([150, FLOOR - 3], [150, -6], 3),
          ...tube([136, -6], [192, -6], 2.4),
          ...cable([stack.cable, [173, -2], [140, -2], clamp]),
          ...pulley([173, -2], 3.2, k * 200),
          ...pulley([140, -2], 3.2, k * 200),
          ...mat(60, 140),
        ],
        far: rope(j.grip[0]),
        front: [...rope(g), { k: "rect", x: clamp[0] - 1.6, y: clamp[1] - 2, w: 3.2, h: 3.4, rx: 0.8, fill: true, tone: "metal", stroke: "line", sw: 0.5 }],
      };
    },
    (j) => j.grip[1],
  ),
};

function walkPose(phase: number, beltBob: boolean, armSwing = 12): Pose {
  // Continuous gait cycle: legs and arms swing in opposition.
  const s = Math.sin(phase * Math.PI * 2);
  const c = Math.cos(phase * Math.PI * 2);
  const stride = 17;
  const lift = (x: number) => (x > 0 ? x * x * 7 : 0);
  const hipY = 75 - (beltBob ? (1 - Math.cos(phase * Math.PI * 4)) * 0.75 : 0);
  return {
    hip: [100, hipY],
    torso: [-88, -87],
    head: -86,
    feet: [
      [100 + s * stride, 133 - lift(c)],
      [100 - s * stride, 133 - lift(-c)],
    ],
    footAngle: [s * 10 + lift(c) * 2, -s * 10 + lift(-c) * 2],
    hands: [
      [102 - s * armSwing, 108 - Math.abs(s) * 2],
      [102 + s * armSwing, 108 - Math.abs(s) * 2],
    ],
  };
}

const treadmill: ExerciseAnimation = {
  cycle: 1.3,
  cue: "Easy walking rhythm: heel lands in front, arms swing naturally opposite the legs.",
  frames: [
    { t: 0.25, label: "Right heel lands" },
    { t: 0.75, label: "Left heel lands" },
  ],
  at: (t, muscles = []) => {
    const j = joints(walkPose(t, true));
    const b = bodyLayers(j, muscles, 0.5);
    const off = (t * 40) % 10;
    const machine: Shape[] = [
      shadow(110, 160),
      ...tube([176, 128], [182, 56], 2.6),
      ...tube([180, 68], [134, 72], 2),
      { k: "circle", c: [134, 72], r: 2.6, fill: true, tone: "rubber", stroke: "line", sw: 0.6 },
      ...screen([182, 52], 20, 9, -18),
      { k: "rect", x: 36, y: 132, w: 140, h: 6, rx: 3, fill: true, tone: "rubber", stroke: "line", sw: 0.65 },
      ...Array.from({ length: 14 }, (_, i): Shape => ({ k: "line", a: [40 + i * 10 - off, 133.2], b: [44 + i * 10 - off, 133.2], w: 0.8, tone: "metalLight", op: 0.7 })),
      { k: "path", d: "M150,132 L150,124 Q150,118 158,118 L178,118 Q186,118 186,126 L186,138 L150,138 Z", w: 0, fill: true, tone: "metal", stroke: "line", sw: 0.65 },
      { k: "line", a: [154, 122], b: [182, 122], w: 0.7, tone: "metalLight" },
      foot(42, 10),
      foot(178, 10),
    ];
    return [...stage(), ...machine, ...b.farArm, ...b.farLeg, ...b.trunk, ...b.nearLeg, ...b.nearArm, ...b.glow];
  },
};

const mobility: ExerciseAnimation = {
  cycle: 5,
  cue: "Cat–cow on hands and knees: round the back up, then let the chest sink and look forward.",
  frames: [
    { t: 0, label: "Cat: back rounded" },
    { t: 0.5, label: "Cow: chest sinks" },
  ],
  at: side(
    [
      { pose: { hip: [72, 92], torso: [-28, 28], head: 75, hands: [[109, 131], [112, 131]], feet: [[42, 129], [44, 129]], handKind: ["flat", "flat"], footAngle: [180, 180] }, hold: 0.2, move: 0.3 },
      { pose: { hip: [72, 92], torso: [18, -18], head: -28, hands: [[109, 131], [112, 131]], feet: [[42, 129], [44, 129]], handKind: ["flat", "flat"], footAngle: [180, 180] }, hold: 0.2, move: 0.3 },
    ],
    () => ({ back: [shadow(90, 110), ...mat(20, 150)] }),
  ),
};

const gluteBridge: ExerciseAnimation = {
  cycle: 3.2,
  cue: "Lying on the back, the hips lift until shoulders, hips and knees form a straight line.",
  frames: [
    { t: 0, label: "Hips on the floor" },
    { t: 0.45, label: "Hips lifted" },
  ],
  at: side(
    [
      { pose: { hip: [96, 125], torso: [180, 180], head: 180, hands: [[104, 131], [106, 131]], feet: [[130, 131], [133, 131]], handKind: ["flat", "flat"] }, hold: 0.15, move: 0.3 },
      { pose: { hip: [98, 103], torso: [152, 158], head: 172, hands: [[104, 131], [106, 131]], feet: [[130, 131], [133, 131]], handKind: ["flat", "flat"] }, hold: 0.15, move: 0.4 },
    ],
    () => ({ back: [shadow(96, 140), ...mat(20, 160)] }),
    (j) => j.hip,
  ),
};

const stepUp: ExerciseAnimation = {
  cycle: 3.6,
  viewBox: "0 -16 200 166",
  cue: "Front foot on the step: drive through that heel to stand up tall, then step back down.",
  frames: [
    { t: 0, label: "Foot on the step" },
    { t: 0.45, label: "Standing on the step" },
  ],
  at: side(
    [
      { pose: { hip: [88, 80], torso: [-76, -78], head: -76, hands: [[94, 122], [96, 122]], feet: [[86, 133], [122, 109]] }, hold: 0.12, move: 0.38 },
      { pose: { hip: [118, 52], torso: [-88, -88], head: -86, hands: [[118, 96], [120, 96]], feet: [[112, 102], [123, 109]], footAngle: [30, 0] }, hold: 0.1, move: 0.4 },
    ],
    () => ({ back: [shadow(110, 100), ...box(104, 113, 58, 22)] }),
    (j) => j.hip,
  ),
};

const kickback: ExerciseAnimation = {
  cycle: 3,
  cue: "Holding the machine, the working leg kicks back and slightly up while the hips stay square.",
  frames: [
    { t: 0, label: "Leg under the hip" },
    { t: 0.45, label: "Leg kicked back" },
  ],
  at: side(
    [
      { pose: { hip: [96, 76], torso: [-66, -64], head: -58, hands: [[136, 58], [138, 58]], feet: [[98, 133], [94, 131]], footAngle: [0, 20] }, hold: 0.12, move: 0.33 },
      { pose: { hip: [96, 76], torso: [-62, -60], head: -54, hands: [[136, 58], [138, 58]], feet: [[98, 133], [42, 100]], footAngle: [0, 100] }, hold: 0.12, move: 0.43 },
    ],
    (j, k) => {
      const stack = weightStack(160, 24, { lift: k * 12 });
      return {
        back: [
          shadow(110, 160),
          ...baseRail(130, 194),
          ...stack.shapes,
          ...tube([150, FLOOR - 3], [150, 18], 3),
          ...tube([148, 18], [192, 18], 2.4),
          ...cable([stack.cable, [173, 22], [154, 22], [154, 126], [150, 128], j.ankle[1]]),
          ...pulley([173, 22], 3.2, k * 200),
          ...pulley([152, 126], 3.2, k * 200),
          ...tube([150, 58], [132, 58], 2),
        ],
        front: [{ k: "ellipse", c: j.ankle[1], rx: 3.6, ry: 2.6, rot: angleOf(j.knee[1], j.ankle[1]) + 90, tone: "rubber", stroke: "line", sw: 0.6 }],
      };
    },
    (j) => j.ankle[1],
  ),
};

const chestSupportedRow: ExerciseAnimation = {
  cycle: 3.2,
  cue: "Chest stays on the pad while the elbows row back toward the hips.",
  frames: [
    { t: 0, label: "Arms hanging" },
    { t: 0.45, label: "Elbows rowed back" },
  ],
  at: side(
    [
      { pose: { hip: [76, 90], torso: [-36, -34], head: -20, hands: [[110, 112], [112, 112]], feet: [[52, 131], [55, 131]] }, hold: 0.12, move: 0.33 },
      { pose: { hip: [76, 90], torso: [-36, -34], head: -20, hands: [[103, 88], [105, 88]], feet: [[52, 131], [55, 131]] }, hold: 0.12, move: 0.43 },
    ],
    (j) => ({
      back: [
        shadow(90, 130),
        ...baseRail(30, 140),
        ...tube([92, FLOOR - 3], [96, 88], 2.6),
        ...tube([60, FLOOR - 3], [72, 104], 2),
        ...padAlong([82, 99], [120, 71], 9, 3.6),
        ...pad(36, FLOOR - 7, 30, 4, 1.6),
      ],
      far: dumbbell(j.grip[0], j.handAngle[0] + 90, 0.95),
      front: dumbbell(j.grip[1], j.handAngle[1] + 90, 0.95),
    }),
    (j) => j.grip[1],
  ),
};

const plank: ExerciseAnimation = {
  cycle: 4,
  cue: "Hold still: one straight line from head to heels, hips neither sagging nor piked.",
  frames: [{ t: 0, label: "Straight-line hold" }],
  at: (t, muscles = []) => {
    const breathe = Math.sin(t * Math.PI * 2) * 0.6;
    const pose: Pose = { hip: [90, 111 + breathe * 0.4], torso: [-10, -10], head: -6, hands: [[158, 129], [160, 129]], feet: [[32, 127], [34, 127]], handKind: ["flat", "flat"], footAngle: [100, 100] };
    const j = joints(pose);
    const b = bodyLayers(j, muscles, 0.7 + breathe * 0.3);
    return [
      ...stage(),
      shadow(96, 150),
      ...mat(18, 176),
      ...b.farArm,
      ...b.farLeg,
      ...b.trunk,
      ...b.nearLeg,
      ...b.nearArm,
      ...b.glow,
      { k: "line", a: [j.ankle[1][0] - 4, j.ankle[1][1] - 9], b: [j.head[0] + 8, j.head[1] - 8], w: 1.2, tone: "accent", dash: "3 3", op: 0.9 },
    ];
  },
};

const deadBug: ExerciseAnimation = {
  cycle: 6,
  cue: "Back flat on the floor: one arm reaches overhead as the opposite leg straightens, then switch sides.",
  frames: [
    { t: 0, label: "Start: arms up, knees bent" },
    { t: 0.22, label: "Near arm + far leg extend" },
    { t: 0.72, label: "Switch sides" },
  ],
  at: (() => {
    const base: Pose = { hip: [104, 125], torso: [180, 180], head: 180, hands: [[62, 80], [64, 80]], feet: [[134, 96], [136, 96]], footAngle: [0, 0] };
    const nearArmFarLeg: Pose = { ...base, hands: [[62, 80], [16, 118]], feet: [[162, 116], [136, 96]] };
    const farArmNearLeg: Pose = { ...base, hands: [[18, 118], [64, 80]], feet: [[134, 96], [163, 116]] };
    return side(
      [
        { pose: base, hold: 0.08, move: 0.17 },
        { pose: nearArmFarLeg, hold: 0.08, move: 0.17 },
        { pose: base, hold: 0.08, move: 0.17 },
        { pose: farArmNearLeg, hold: 0.08, move: 0.17 },
      ],
      () => ({ back: [shadow(96, 160), ...mat(10, 180)] }),
    );
  })(),
};

const gobletSquat: ExerciseAnimation = {
  cycle: 3.4,
  cue: "Holding a weight at the chest, sit down between the heels and stand back up.",
  frames: [
    { t: 0, label: "Standing" },
    { t: 0.45, label: "Bottom of the squat" },
  ],
  at: side(
    [
      { pose: { ...STAND, hands: [[110, 44], [112, 44]], feet: [[98, 133], [103, 133]] }, hold: 0.12, move: 0.38 },
      { pose: { hip: [80, 106], torso: [-60, -66], head: -72, hands: [[116, 78], [118, 78]], feet: [[98, 133], [103, 133]] }, hold: 0.1, move: 0.4 },
    ],
    (j) => ({ back: [shadow(98, 56), ...mat(56, 146)], mid: dumbbell(add(j.grip[1], [1, -3]), 90, 1.1) }),
    (j) => j.hip,
  ),
};

const inclinePushUp: ExerciseAnimation = {
  cycle: 3,
  cue: "Body stays straight as the chest lowers toward the bench, then press back up.",
  frames: [
    { t: 0, label: "Arms straight" },
    { t: 0.45, label: "Chest near the bench" },
  ],
  at: side(
    [
      { pose: { hip: [88, 96], torso: [-32, -32], head: -28, hands: [[150, 101], [152, 101]], feet: [[38, 131], [40, 131]], handKind: ["flat", "flat"], footAngle: [60, 60] }, hold: 0.12, move: 0.33 },
      { pose: { hip: [98, 106], torso: [-22, -22], head: -18, hands: [[150, 101], [152, 101]], feet: [[38, 131], [40, 131]], handKind: ["flat", "flat"], footAngle: [60, 60] }, hold: 0.1, move: 0.45 },
    ],
    () => ({ back: [shadow(110, 160), ...bench(134, 190, 104, 7)] }),
    (j) => j.neck,
  ),
};

const shoulderPress: ExerciseAnimation = {
  cycle: 3,
  cue: "Dumbbells press from shoulder height straight overhead, then lower with control.",
  frames: [
    { t: 0, label: "Dumbbells at shoulders" },
    { t: 0.45, label: "Pressed overhead" },
  ],
  at: side(
    [
      { pose: { hip: [90, 100], torso: [-92, -91], head: -90, hands: [[98, 50], [100, 50]], feet: [[124, 133], [127, 133]] }, hold: 0.12, move: 0.33 },
      { pose: { hip: [90, 100], torso: [-92, -91], head: -90, hands: [[94, 12], [96, 12]], feet: [[124, 133], [127, 133]] }, hold: 0.1, move: 0.45 },
    ],
    (j) => ({
      back: [shadow(100, 90), ...bench(64, 116, 104, 7), ...tube([76, 110], [74, 42], 2), ...padAlong([82, 102], [78, 46], 9, 3.6)],
      far: dumbbell(j.grip[0], 0, 0.95, "end"),
      front: dumbbell(j.grip[1], 0, 0.95, "end"),
    }),
    (j) => j.grip[1],
  ),
};

const bike: ExerciseAnimation = {
  cycle: 1.4,
  cue: "Steady pedalling: feet circle smoothly with a slight bend at the bottom of each stroke.",
  frames: [
    { t: 0, label: "Pedal at the front" },
    { t: 0.5, label: "Pedal at the back" },
  ],
  at: (t, muscles = []) => {
    const crank: Pt = [114, 114];
    const a = t * Math.PI * 2;
    const r = 12;
    const near: Pt = [crank[0] + Math.cos(a) * r, crank[1] + Math.sin(a) * r];
    const far: Pt = [crank[0] - Math.cos(a) * r, crank[1] - Math.sin(a) * r];
    const pose: Pose = { hip: [88, 70], torso: [-50, -44], head: -32, hands: [[140, 52], [142, 52]], feet: [far, near] };
    const j = joints(pose);
    const b = bodyLayers(j, muscles, 0.5 + Math.sin(a) * 0.3);
    const pedal = (p: Pt): Shape => ({ k: "rect", x: p[0] - 4, y: p[1] - 1.2, w: 8, h: 2.4, rx: 0.8, fill: true, tone: "rubber", stroke: "line", sw: 0.5 });
    return [
      ...stage(),
      shadow(112, 130),
      ...tube([62, FLOOR - 3], [92, FLOOR - 3], 2.4),
      ...tube([126, FLOOR - 3], [168, FLOOR - 3], 2.4),
      foot(64),
      foot(90),
      foot(128),
      foot(166),
      ...tube([78, FLOOR - 3], [100, 120], 3),
      ...tube([146, FLOOR - 3], [140, 104], 3),
      ...tube([100, 120], [140, 112], 3),
      ...tube([98, 120], [84, 78], 2.8),
      ...tube([128, 116], [146, 62], 2.8),
      ...plateFace([144, 110], 15, t * 360),
      ...tube(crank, far, 1.4),
      pedal(far),
      ...b.farArm,
      ...b.farLeg,
      { k: "path", d: "M70,74 Q78,68 96,71 Q100,74 96,77 L74,79 Q68,79 70,74 Z", w: 0, fill: true, tone: "pad", stroke: "line", sw: 0.65 },
      ...b.trunk,
      ...plateFace(crank, 7, t * 360),
      ...b.nearLeg,
      ...tube(crank, near, 1.4),
      pedal(near),
      ...tube([146, 62], [150, 54], 2.4),
      ...tube([138, 52], [154, 52], 2),
      ...screen([152, 46], 12, 7, -12),
      ...b.nearArm,
      ...b.glow,
    ];
  },
};

// ---------------------------------------------------------------- new exercises

const legExtension: ExerciseAnimation = {
  cycle: 3,
  cue: "Seated with the shin pad above the ankles: the knees straighten to lift the pad, then lower slowly.",
  frames: [
    { t: 0, label: "Knees bent" },
    { t: 0.45, label: "Legs straight" },
  ],
  at: side(
    [
      { pose: { hip: [84, 100], torso: [-96, -93], head: -88, hands: [[92, 106], [94, 106]], feet: [[116, 131], [118, 131]], footAngle: [0, 0] }, hold: 0.12, move: 0.33 },
      { pose: { hip: [84, 100], torso: [-98, -95], head: -90, hands: [[92, 106], [94, 106]], feet: [[143, 95], [145, 96]], footAngle: [-78, -78] }, hold: 0.12, move: 0.43 },
    ],
    (j, k) => {
      const kn = j.knee[1];
      const shinU = unit(sub(j.ankle[1], kn));
      const rollC = add(add(j.ankle[1], mul(shinU, -3.5)), mul(perp(shinU), -5.6));
      const stack = weightStack(10, 30, { lift: k * 14 });
      return {
        back: [
          shadow(90, 170),
          ...baseRail(4, 150),
          ...stack.shapes,
          ...cable([stack.cable, [23, 22], [48, 22], [48, 120], [kn[0], 120], kn]),
          ...pulley([23, 24], 3.2, k * 160),
          ...pulley([48, 120], 3, k * 160),
          ...tube([86, 112], [86, FLOOR - 3], 2.6),
          ...tube([kn[0] + 2, FLOOR - 3], [kn[0] + 1, kn[1] + 2], 2.4),
          ...pad(60, 105, 52, 8),
          ...padAlong([76, 104], [70, 56], 9, 3.6),
        ],
        front: [...tube(kn, rollC, 2), ...plateFace(kn, 4.6, angleOf(kn, rollC)), ...roller(rollC, 4.8), ...grip(j.grip[1], 0, 7)],
      };
    },
    (j) => j.ankle[1],
  ),
};

const lyingLegCurl: ExerciseAnimation = {
  cycle: 3,
  cue: "Lying face down with the roller behind the ankles: heels curl up toward the glutes, hips stay down.",
  frames: [
    { t: 0, label: "Legs straight" },
    { t: 0.45, label: "Heels curled up" },
  ],
  at: side(
    [
      { pose: { hip: [92, 93], torso: [-3, -1], head: 4, hands: [[146, 106], [148, 106]], feet: [[34, 96], [32, 96]], footAngle: [100, 100] }, hold: 0.12, move: 0.33 },
      { pose: { hip: [92, 93], torso: [-3, -1], head: 4, hands: [[146, 106], [148, 106]], feet: [[64, 66], [62, 66]], footAngle: [-155, -155] }, hold: 0.12, move: 0.43 },
    ],
    (j, k) => {
      const kn = j.knee[1];
      const shinU = unit(sub(j.ankle[1], kn));
      const rollC = add(add(j.ankle[1], mul(shinU, -3)), mul(perp(shinU), 5.4));
      const plateC = lerpPt(kn, rollC, 0.45);
      return {
        back: [
          shadow(100, 170),
          ...baseRail(40, 170),
          ...tube([80, 106], [80, FLOOR - 3], 2.4),
          ...tube([132, 106], [132, FLOOR - 3], 2.4),
          ...tube([140, 104], [148, 112], 1.8),
          ...tube([kn[0] + 2, FLOOR - 3], [kn[0], kn[1] + 4], 2.4),
          ...padAlong([66, 103], [140, 103], 9, 3.6),
        ],
        front: [...tube(kn, rollC, 2), ...plateFace(plateC, 6.4, -k * 30), ...plateFace(kn, 4, 0), ...roller(rollC, 4.6), ...grip(j.grip[1], 90, 7)],
      };
    },
    (j) => j.ankle[1],
  ),
};

const preacherCurl: ExerciseAnimation = {
  cycle: 3,
  cue: "Upper arms rest on the angled pad: curl the bar up toward the shoulders, then lower until the arms are almost straight.",
  frames: [
    { t: 0, label: "Arms almost straight" },
    { t: 0.45, label: "Bar curled up" },
  ],
  at: side(
    [
      { pose: { hip: [80, 100], torso: [-80, -74], head: -66, hands: [[115, 95], [117, 95]], feet: [[112, 133], [115, 133]] }, hold: 0.12, move: 0.33 },
      { pose: { hip: [80, 100], torso: [-80, -74], head: -66, hands: [[104, 54], [106, 54]], feet: [[112, 133], [115, 133]] }, hold: 0.12, move: 0.43 },
    ],
    (j) => {
      const armU = unit(sub(j.elbow[1], j.shoulder));
      const back = perp(armU); // the triceps side rests on the pad
      // the triceps rest on the top of a thick angled pad standing in front of the chest
      const a = add(add(j.shoulder, mul(armU, 3)), mul(back, 8.6));
      const b = add(add(j.elbow[1], mul(armU, 9)), mul(back, 8.6));
      const post = add(lerpPt(a, b, 0.62), mul(back, 6));
      return {
        back: [shadow(96, 120), ...baseRail(56, 140), ...tube([80, 110], [80, FLOOR - 3], 2.6), ...pad(60, 104, 40, 7)],
        legs: [...tube([128, FLOOR - 3], post, 2.6), foot(128, 12), ...padAlong(a, b, 11, 4)],
        front: [...plateFace(j.grip[1], 8.4, 0), { k: "circle", c: j.grip[1], r: 2.6, fill: true, tone: "metal", stroke: "line", sw: 0.5 }],
      };
    },
    (j) => j.grip[1],
  ),
};

const chinUp: ExerciseAnimation = {
  cycle: 3.4,
  viewBox: "0 -44 200 194",
  cue: "Hanging with palms facing you: pull the chin over the bar by driving the elbows down, then lower to a full hang.",
  frames: [
    { t: 0, label: "Full hang" },
    { t: 0.45, label: "Chin over the bar" },
  ],
  at: side(
    [
      { pose: { hip: [94, 62], torso: [-92, -90], head: -86, hands: [[99, -24], [101, -24]], feet: [[74, 104], [78, 102]], footAngle: [40, 40] }, hold: 0.14, move: 0.36 },
      { pose: { hip: [86, 28], torso: [-82, -84], head: -96, hands: [[99, -24], [101, -24]], feet: [[66, 70], [70, 68]], footAngle: [40, 40] }, hold: 0.1, move: 0.4 },
    ],
    () => ({
      back: [
        shadow(92, 70),
        ...mat(56, 140),
        ...tube([160, FLOOR - 3], [160, -36], 3),
        ...tube([100, -36], [164, -36], 2.6),
        ...tube([100, -36], [100, -26], 2),
        foot(160, 14),
      ],
      mid: [{ k: "circle", c: [100, -24], r: 2.6, fill: true, tone: "metal", stroke: "line", sw: 0.65 }],
    }),
    (j) => j.neck,
  ),
};

function wristCurl(reverse: boolean): ExerciseAnimation {
  const pose = (wrist: number): Pose => ({ hip: [80, 99], torso: [-40, -36], head: -6, hands: [[118, 91], [121, 91]], feet: [[108, 133], [112, 133]], wrist: [wrist, wrist] });
  return {
    cycle: 2.6,
    viewBox: "40 52 120 90",
    cue: reverse ? "Forearms rest on the thighs, palms down: lift the backs of the hands, moving only at the wrist." : "Forearms rest on the thighs, palms up: curl the dumbbell up, moving only at the wrist.",
    frames: [
      { t: 0, label: "Wrist lowered" },
      { t: 0.45, label: "Wrist curled up" },
    ],
    at: side(
      [
        { pose: pose(52), hold: 0.12, move: 0.33 },
        { pose: pose(-52), hold: 0.12, move: 0.43 },
      ],
      (j) => ({
        back: [shadow(90, 100), ...bench(36, 98, 103, 6)],
        far: dumbbell(j.grip[0], 0, 0.8, "end"),
        front: dumbbell(j.grip[1], 0, 0.8, "end"),
      }),
      (j) => j.grip[1],
    ),
  };
}

const farmersCarry: ExerciseAnimation = {
  cycle: 1.4,
  cue: "Heavy weights at the sides: walk with short steady steps, standing tall with the shoulders back and down.",
  frames: [
    { t: 0.25, label: "Step" },
    { t: 0.75, label: "Step" },
  ],
  at: (t, muscles = []) => {
    const pose = walkPose(t, true, 0);
    pose.feet = [
      [pose.feet[0][0] * 0.8 + 20, pose.feet[0][1]],
      [pose.feet[1][0] * 0.8 + 20, pose.feet[1][1]],
    ];
    pose.hands = [
      [97, 117],
      [103, 117],
    ];
    const j = joints(pose);
    const b = bodyLayers(j, muscles, 0.85);
    const off = (t * 26) % 26;
    const marks: Shape[] = Array.from({ length: 10 }, (_, i): Shape => ({ k: "line", a: [-10 + i * 26 - off, FLOOR + 4], b: [2 + i * 26 - off, FLOOR + 4], w: 1.2, tone: "floorLine" }));
    return [...stage(), ...marks, shadow(100, 56), ...b.farArm, ...dumbbell(j.grip[0], 0, 1.25), ...b.farLeg, ...b.trunk, ...b.nearLeg, ...b.nearArm, ...dumbbell(j.grip[1], 0, 1.25), ...b.glow];
  },
};

/**
 * Walking lunge: step forward, lower until the back knee is just above the floor, stand up and
 * step through with the other leg. The figure stays in the middle of the picture and the floor
 * slides back underneath — always by exactly as much as the planted foot moves on screen, so a
 * foot on the floor never slides.
 */
const walkingLunge: ExerciseAnimation = (() => {
  const hands: [Pt, Pt] = [
    [99, 140],
    [101, 140],
  ];
  const stand: Pose = { hip: [100, 74], torso: [-89, -90], head: -88, hands, feet: [[97, 133], [103, 133]] };
  // [far, near] feet: front foot flat, back foot up on the toes, back knee just above the floor
  const nearForward: Pose = { hip: [100, 101], torso: [-87, -89], head: -86, hands, feet: [[66, 125], [127, 133]], footAngle: [62, 0] };
  const farForward: Pose = { ...nearForward, feet: [[127, 133], [66, 125]], footAngle: [0, 62] };
  // each move: from → to, which foot stays on the floor (0 far, 1 near) and which one swings
  const segs: { from: Pose; to: Pose; planted: 0 | 1; k: [number, number] }[] = [
    { from: stand, to: nearForward, planted: 0, k: [0, 1] },
    { from: nearForward, to: stand, planted: 1, k: [1, 0] },
    { from: stand, to: farForward, planted: 1, k: [0, 1] },
    { from: farForward, to: stand, planted: 0, k: [1, 0] },
  ];
  const HOLD = 0.06;
  const MOVE = 0.19;
  // floor scroll at the start of each move = sum of how far the planted foot travelled on screen
  const starts: number[] = [];
  let acc = 0;
  for (const s of segs) {
    starts.push(acc);
    acc += s.from.feet[s.planted][0] - s.to.feet[s.planted][0];
  }
  const loop = acc; // distance travelled per full cycle (the floor pattern repeats every 32)
  const at = (t: number, muscles: MuscleId[] = []): Shape[] => {
    const x = (((t % 1) + 1) % 1) * segs.length * (HOLD + MOVE);
    const i = Math.min(segs.length - 1, Math.floor(x / (HOLD + MOVE)));
    const s = segs[i];
    const local = x - i * (HOLD + MOVE);
    const e = local < HOLD ? 0 : ease((local - HOLD) / MOVE);
    const pose = lerpPose(s.from, s.to, e);
    // the swinging foot lifts clear of the floor on its way
    const swing = (1 - s.planted) as 0 | 1;
    const lift = Math.sin(Math.PI * e) * 6;
    pose.feet = pose.feet.map((f, fi) => (fi === swing ? [f[0], f[1] - lift] : f)) as [Pt, Pt];
    const scroll = starts[i] + (s.from.feet[s.planted][0] - pose.feet[s.planted][0]);
    const k = lerp(s.k[0], s.k[1], e);
    const j = joints(pose);
    // the glow follows the front (working) leg
    const b = bodyLayers(j, muscles, k, i < 2 ? 1 : 0);
    const off = ((scroll % loop) + loop) % 32;
    const tiles: Shape[] = Array.from({ length: 10 }, (_, n): Shape => {
      const xx = -24 + n * 32 - off;
      return { k: "line", a: [xx, FLOOR + 0.6], b: [100 + (xx - 100) * 1.7, FLOOR + 30], w: 0.7, tone: "floorLine", shade: -14 };
    });
    return [
      ...stage(),
      ...tiles,
      shadow(100, 80),
      ...b.farArm,
      ...dumbbell(j.grip[0], 0, 1.05),
      ...b.farLeg,
      ...b.trunk,
      ...b.nearLeg,
      ...b.nearArm,
      ...dumbbell(j.grip[1], 0, 1.05),
      ...b.glow,
      ...guide([
        [66, 143],
        [100, 142.6],
        [134, 143],
      ]),
    ];
  };
  return {
    cycle: 4.4,
    cue: "Step forward and lower until the back knee is just above the floor, then stand up and step through into the next lunge with the other leg.",
    frames: [
      { t: 0, label: "Standing tall" },
      { t: 0.27, label: "Lunge: back knee just above the floor" },
      { t: 0.77, label: "Step through: other leg" },
    ],
    at,
  };
})();

/** Generic figure for custom exercises: a calm standing pose, clearly not a movement demo. */
const generic: ExerciseAnimation = {
  cycle: 4,
  cue: "No demonstration for this custom exercise yet — follow your own notes and instructions.",
  frames: [{ t: 0, label: "Custom exercise" }],
  at: () => {
    const j = joints({ ...STAND, hands: [[92, 116], [108, 116]] });
    const b = bodyLayers(j);
    return [...stage(), shadow(100, 50), ...mat(64, 136), ...b.farArm, ...b.farLeg, ...b.trunk, ...b.nearLeg, ...b.nearArm];
  },
};

export const ANIMATIONS: Record<string, ExerciseAnimation> = {
  "hip-thrust-machine": hipThrust,
  "db-romanian-deadlift": rdl,
  "leg-press": legPress,
  "hip-abduction-machine": abduction,
  "seated-leg-curl": legCurl,
  "chest-press-machine": chestPress,
  "lat-pulldown": latPulldown,
  "seated-cable-row": cableRow,
  "db-lateral-raise": lateralRaise,
  "db-biceps-curl": curl(false),
  "db-hammer-curl": curl(true),
  "triceps-rope-pushdown": pushdown,
  "treadmill-walk": treadmill,
  "mobility-flow": mobility,
  "glute-bridge": gluteBridge,
  "low-step-up": stepUp,
  "cable-glute-kickback": kickback,
  "incline-chest-press-machine": inclinePress,
  "chest-supported-row": chestSupportedRow,
  "forearm-plank": plank,
  "dead-bug": deadBug,
  "goblet-squat": gobletSquat,
  "incline-push-up": inclinePushUp,
  "db-shoulder-press": shoulderPress,
  "stationary-bike": bike,
  "leg-extension": legExtension,
  "lying-leg-curl": lyingLegCurl,
  "preacher-curl": preacherCurl,
  "chin-up": chinUp,
  "db-wrist-curl": wristCurl(false),
  "db-reverse-wrist-curl": wristCurl(true),
  "farmers-carry": farmersCarry,
  "db-walking-lunge": walkingLunge,
  generic,
};

export function animationFor(key: string): ExerciseAnimation {
  return ANIMATIONS[key] ?? generic;
}

