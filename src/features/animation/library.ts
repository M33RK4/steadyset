import { bodyShapes, dir, FLOOR, frontBodyShapes, frontJoints, joints, keyframes, lerpFront, lerpPose, type FrontPose, type Joints, type Pose, type Pt, type Shape } from "./figure";

export interface ExerciseAnimation {
  /** seconds per full repetition cycle */
  cycle: number;
  at: (t: number) => Shape[];
  /** Positions shown in the frame-by-frame fallback, with what changes between them. */
  frames: { t: number; label: string }[];
  /** One line describing the movement direction, shown under the frames. */
  cue: string;
  /** Optional custom viewBox for tall movements (default "0 0 200 150"). */
  viewBox?: string;
}

const floor = (x1 = 10, x2 = 190): Shape => ({ k: "line", a: [x1, FLOOR + 1], b: [x2, FLOOR + 1], w: 2, tone: "floor" });

function dumbbell(at: Pt, angle = 0, len = 13): Shape[] {
  const a = dir(angle + 180, len / 2, at);
  const b = dir(angle, len / 2, at);
  return [
    { k: "line", a, b, w: 3, tone: "accent" },
    { k: "circle", c: a, r: 4, tone: "accent", fill: true },
    { k: "circle", c: b, r: 4, tone: "accent", fill: true },
  ];
}

function side(steps: { pose: Pose; hold: number; move: number }[], props: (j: Joints, p: Pose) => { back?: Shape[]; front?: Shape[] }) {
  const poseAt = keyframes(lerpPose, steps);
  return (t: number): Shape[] => {
    const pose = poseAt(t);
    const j = joints(pose);
    const pr = props(j, pose);
    return [floor(), ...(pr.back ?? []), ...bodyShapes(j), ...(pr.front ?? [])];
  };
}

const STAND: Pose = { hip: [100, 74], torso: [-90, -90], head: -90, hands: [[99, 118], [101, 118]], feet: [[97, 133], [103, 133]] };

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
      { pose: { hip: [102, 118], torso: [-160, -156], head: -150, hands: [[100, 107], [102, 107]], feet: [[134, 133], [137, 133]], knee: [1, 1], elbow: [-1, -1] }, hold: 0.15, move: 0.3 },
      { pose: { hip: [102, 96], torso: [-179, -177], head: -170, hands: [[100, 88], [102, 88]], feet: [[134, 133], [137, 133]], knee: [1, 1], elbow: [-1, -1] }, hold: 0.15, move: 0.4 },
    ],
    (j) => ({
      back: [
        { k: "rect", x: 26, y: 102, w: 48, h: 10, tone: "prop", rx: 4, fill: true },
        { k: "line", a: [34, 112], b: [34, FLOOR], w: 4, tone: "prop" },
        { k: "line", a: [66, 112], b: [66, FLOOR], w: 4, tone: "prop" },
        { k: "line", a: [168, FLOOR], b: [168, 70], w: 5, tone: "propSoft" },
        { k: "line", a: [168, 72], b: [j.hip[0] + 4, j.hip[1] - 6], w: 4, tone: "propSoft" },
      ],
      front: [{ k: "rect", x: j.hip[0] - 9, y: j.hip[1] - 13, w: 22, h: 8, rx: 4, tone: "accent", fill: true }],
    }),
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
    (j) => ({ front: [...dumbbell(j.hand[1], 0)] }),
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
      { pose: { hip: [70, 112], torso: [-145, -140], head: -128, hands: [[74, 110], [76, 110]], feet: [[110, 76], [113, 79]], knee: [1, 1], elbow: [-1, -1], footAngle: [-110, -110] }, hold: 0.12, move: 0.38 },
      { pose: { hip: [70, 112], torso: [-145, -140], head: -128, hands: [[74, 110], [76, 110]], feet: [[122, 63], [125, 66]], knee: [1, 1], elbow: [-1, -1], footAngle: [-110, -110] }, hold: 0.1, move: 0.4 },
    ],
    (j) => {
      const f = j.ankle[1];
      return {
        back: [
          { k: "line", a: [40, 124], b: [86, 124], w: 6, tone: "prop" },
          { k: "line", a: [42, 124], b: [22, 86], w: 6, tone: "prop" },
          { k: "line", a: [96, 120], b: [176, 40], w: 4, tone: "propSoft" },
          { k: "line", a: [60, 124], b: [60, FLOOR], w: 4, tone: "prop" },
        ],
        front: [{ k: "line", a: dir(-45 + 180, 2, [f[0] + 6, f[1] - 9]), b: [f[0] + 18, f[1] + 4], w: 7, tone: "accent" }, { k: "line", a: [f[0] - 6, f[1] - 16], b: [f[0] + 14, f[1] + 4], w: 7, tone: "accent" }],
      };
    },
  ),
};

function front(steps: { pose: FrontPose; hold: number; move: number }[], props: (p: FrontPose, j: ReturnType<typeof frontJoints>) => { back?: Shape[]; front?: Shape[] }) {
  const at = keyframes(lerpFront, steps);
  return (t: number): Shape[] => {
    const p = at(t);
    const j = frontJoints(p);
    const pr = props(p, j);
    return [floor(), ...(pr.back ?? []), ...frontBodyShapes(j), ...(pr.front ?? [])];
  };
}

const abduction: ExerciseAnimation = {
  cycle: 3,
  cue: "Seen from the front: knees push outward against the pads, then return slowly.",
  frames: [
    { t: 0, label: "Knees together" },
    { t: 0.45, label: "Knees out" },
  ],
  at: front(
    [
      { pose: { arm: 18, elbowBend: 20, spread: 0, seated: true }, hold: 0.12, move: 0.33 },
      { pose: { arm: 18, elbowBend: 20, spread: 22, seated: true }, hold: 0.12, move: 0.43 },
    ],
    (_p, j) => ({
      back: [
        { k: "rect", x: 72, y: 26, w: 56, h: 76, rx: 8, tone: "propSoft", fill: true },
        { k: "rect", x: 66, y: 100, w: 68, h: 8, rx: 3, tone: "prop", fill: true },
        { k: "line", a: [100, 108], b: [100, FLOOR], w: 5, tone: "prop" },
      ],
      front: [
        { k: "rect", x: j.knees[0][0] - 12, y: j.knees[0][1] - 8, w: 6, h: 20, rx: 3, tone: "accent", fill: true },
        { k: "rect", x: j.knees[1][0] + 6, y: j.knees[1][1] - 8, w: 6, h: 20, rx: 3, tone: "accent", fill: true },
      ],
    }),
  ),
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
      { pose: { hip: [88, 98], torso: [-96, -93], head: -88, hands: [[96, 102], [98, 102]], feet: [[141, 113], [144, 113]], footAngle: [-60, -60], elbow: [-1, -1] }, hold: 0.12, move: 0.33 },
      { pose: { hip: [88, 98], torso: [-96, -93], head: -88, hands: [[96, 102], [98, 102]], feet: [[104, 125], [106, 125]], footAngle: [-10, -10], elbow: [-1, -1] }, hold: 0.12, move: 0.43 },
    ],
    (j) => ({
      back: [
        { k: "rect", x: 66, y: 104, w: 52, h: 8, rx: 3, tone: "prop", fill: true },
        { k: "line", a: [70, 104], b: [62, 50], w: 7, tone: "prop" },
        { k: "line", a: [92, 112], b: [92, FLOOR], w: 4, tone: "prop" },
        { k: "line", a: [119, 98], b: [150, 60], w: 4, tone: "propSoft" },
      ],
      front: [
        { k: "rect", x: j.knee[1][0] - 12, y: j.knee[1][1] - 14, w: 18, h: 7, rx: 3, tone: "prop", fill: true },
        { k: "circle", c: [j.ankle[1][0] + 2, j.ankle[1][1] - 6], r: 5.5, tone: "accent", fill: true },
      ],
    }),
  ),
};

function seatedPress(torso: [number, number], hip: Pt, a: [Pt, Pt], b: [Pt, Pt], back: Shape[]): (t: number) => Shape[] {
  return side(
    [
      { pose: { hip, torso, head: torso[1] + 4, hands: a, feet: [[hip[0] + 32, 133], [hip[0] + 35, 133]], elbow: [-1, -1] }, hold: 0.12, move: 0.33 },
      { pose: { hip, torso, head: torso[1] + 4, hands: b, feet: [[hip[0] + 32, 133], [hip[0] + 35, 133]], elbow: [-1, -1] }, hold: 0.1, move: 0.45 },
    ],
    (j) => ({
      back,
      front: [
        { k: "line", a: [j.hand[1][0], j.hand[1][1] - 7], b: [j.hand[1][0], j.hand[1][1] + 7], w: 6, tone: "accent" },
        { k: "line", a: [j.hand[1][0] + 4, j.hand[1][1]], b: [j.hand[1][0] + 22, j.hand[1][1] + 2], w: 3, tone: "propSoft" },
      ],
    }),
  );
}

const chestPress: ExerciseAnimation = {
  cycle: 3,
  cue: "Handles press straight forward from chest height until the arms are almost straight.",
  frames: [
    { t: 0, label: "Handles at chest" },
    { t: 0.45, label: "Arms extended" },
  ],
  at: seatedPress([-90, -90], [80, 100], [[98, 62], [100, 64]], [[126, 60], [128, 62]], [
    { k: "rect", x: 60, y: 104, w: 44, h: 8, rx: 3, tone: "prop", fill: true },
    { k: "line", a: [70, 104], b: [70, 38], w: 8, tone: "prop" },
    { k: "line", a: [82, 112], b: [82, FLOOR], w: 4, tone: "prop" },
  ]),
};

const inclinePress: ExerciseAnimation = {
  cycle: 3,
  cue: "Handles press up and forward along the incline, then return to the upper chest.",
  frames: [
    { t: 0, label: "Handles at upper chest" },
    { t: 0.45, label: "Arms extended up and out" },
  ],
  at: seatedPress([-115, -112], [84, 104], [[90, 48], [92, 50]], [[110, 18], [112, 20]], [
    { k: "rect", x: 64, y: 108, w: 44, h: 8, rx: 3, tone: "prop", fill: true },
    { k: "line", a: [72, 108], b: [50, 50], w: 8, tone: "prop" },
    { k: "line", a: [86, 116], b: [86, FLOOR], w: 4, tone: "prop" },
  ]),
};

const latPulldown: ExerciseAnimation = {
  cycle: 3.2,
  cue: "The bar travels down toward the upper chest as the elbows drive down and back.",
  frames: [
    { t: 0, label: "Arms overhead" },
    { t: 0.45, label: "Bar at upper chest" },
  ],
  at: side(
    [
      { pose: { hip: [92, 102], torso: [-96, -98], head: -92, hands: [[90, 10], [92, 10]], feet: [[126, 133], [129, 133]], elbow: [-1, -1] }, hold: 0.12, move: 0.33 },
      { pose: { hip: [92, 102], torso: [-100, -104], head: -96, hands: [[104, 63], [106, 63]], feet: [[126, 133], [129, 133]], elbow: [-1, -1] }, hold: 0.12, move: 0.43 },
    ],
    (j) => ({
      back: [
        { k: "rect", x: 66, y: 106, w: 46, h: 8, rx: 3, tone: "prop", fill: true },
        { k: "line", a: [86, 114], b: [86, FLOOR], w: 4, tone: "prop" },
        { k: "line", a: [150, FLOOR], b: [150, 2], w: 6, tone: "propSoft" },
        { k: "line", a: [150, 4], b: [96, 4], w: 4, tone: "propSoft" },
        { k: "line", a: [96, 4], b: j.hand[1], w: 1.5, tone: "propSoft" },
      ],
      front: [
        { k: "rect", x: 104, y: 92, w: 20, h: 8, rx: 3, tone: "prop", fill: true },
        { k: "line", a: [j.hand[1][0] - 26, j.hand[1][1] + 1], b: [j.hand[1][0] + 26, j.hand[1][1] - 1], w: 4.5, tone: "accent" },
      ],
    }),
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
      { pose: { hip: [66, 114], torso: [-84, -84], head: -84, hands: [[118, 88], [120, 88]], feet: [[122, 124], [125, 124]], footAngle: [-70, -70], knee: [1, 1] }, hold: 0.12, move: 0.33 },
      { pose: { hip: [66, 114], torso: [-92, -94], head: -90, hands: [[84, 96], [86, 96]], feet: [[122, 124], [125, 124]], footAngle: [-70, -70], knee: [1, 1], elbow: [-1, -1] }, hold: 0.12, move: 0.43 },
    ],
    (j) => ({
      back: [
        { k: "rect", x: 40, y: 118, w: 56, h: 7, rx: 3, tone: "prop", fill: true },
        { k: "line", a: [60, 125], b: [60, FLOOR], w: 4, tone: "prop" },
        { k: "line", a: [134, 112], b: [134, 132], w: 6, tone: "prop" },
        { k: "line", a: [170, FLOOR], b: [170, 70], w: 6, tone: "propSoft" },
        { k: "line", a: [168, 94], b: j.hand[1], w: 1.5, tone: "propSoft" },
      ],
      front: [{ k: "line", a: [j.hand[1][0], j.hand[1][1] - 6], b: [j.hand[1][0], j.hand[1][1] + 6], w: 5, tone: "accent" }],
    }),
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
    (_p, j) => ({ front: [...dumbbell(j.hands[0], 90, 11), ...dumbbell(j.hands[1], 90, 11)] }),
  ),
};

function curl(neutral: boolean): ExerciseAnimation {
  return {
    cycle: 3,
    cue: "The forearm curls up toward the shoulder while the upper arm stays still at the side.",
    frames: [
      { t: 0, label: "Arms straight" },
      { t: 0.45, label: "Curled up" },
    ],
    at: side(
      [
        { pose: { ...STAND, hands: [[100, 120], [102, 120]], elbow: [-1, -1] }, hold: 0.12, move: 0.33 },
        { pose: { ...STAND, hands: [[115, 40], [117, 40]], elbow: [-1, -1] }, hold: 0.12, move: 0.43 },
      ],
      (j) => {
        const ang = Math.atan2(j.hand[1][1] - j.elbow[1][1], j.hand[1][0] - j.elbow[1][0]) * (180 / Math.PI);
        return { front: dumbbell(j.hand[1], neutral ? ang + 90 : ang + 90 + 60, neutral ? 13 : 9) };
      },
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
  at: side(
    [
      { pose: { hip: [96, 74], torso: [-84, -80], head: -78, hands: [[118, 44], [120, 44]], feet: [[92, 133], [99, 133]], elbow: [-1, -1] }, hold: 0.12, move: 0.33 },
      { pose: { hip: [96, 74], torso: [-84, -80], head: -78, hands: [[110, 90], [112, 90]], feet: [[92, 133], [99, 133]], elbow: [-1, -1] }, hold: 0.12, move: 0.43 },
    ],
    (j) => ({
      back: [
        { k: "line", a: [150, FLOOR], b: [150, 2], w: 6, tone: "propSoft" },
        { k: "line", a: [148, 8], b: j.hand[1], w: 1.5, tone: "propSoft" },
      ],
      front: [
        { k: "line", a: j.hand[1], b: [j.hand[1][0] - 3, j.hand[1][1] + 10], w: 4, tone: "accent" },
        { k: "line", a: j.hand[1], b: [j.hand[1][0] + 4, j.hand[1][1] + 10], w: 4, tone: "accent" },
      ],
    }),
  ),
};

function walkPose(phase: number, beltBob: boolean): Pose {
  // Continuous gait cycle: legs and arms swing in opposition.
  const s = Math.sin(phase * Math.PI * 2);
  const c = Math.cos(phase * Math.PI * 2);
  const stride = 17;
  const lift = (x: number) => Math.max(0, x) * 7;
  const hipY = 75 - (beltBob ? Math.abs(c) * 1.5 : 0);
  return {
    hip: [100, hipY],
    torso: [-88, -87],
    head: -86,
    feet: [
      [100 + s * stride, 133 - lift(c)],
      [100 - s * stride, 133 - lift(-c)],
    ],
    hands: [
      [100 - s * 12, 112],
      [100 + s * 12, 112],
    ],
    elbow: [-1, -1],
  };
}

const treadmill: ExerciseAnimation = {
  cycle: 1.3,
  cue: "Easy walking rhythm: heel lands in front, arms swing naturally opposite the legs.",
  frames: [
    { t: 0.25, label: "Right heel lands" },
    { t: 0.75, label: "Left heel lands" },
  ],
  at: (t) => {
    const j = joints(walkPose(t, true));
    const off = (t * 40) % 10;
    const belt: Shape[] = [
      { k: "rect", x: 40, y: 134, w: 130, h: 6, rx: 3, tone: "prop", fill: true },
      { k: "line", a: [158, 134], b: [176, 58], w: 5, tone: "prop" },
      { k: "line", a: [166, 62], b: [184, 58], w: 6, tone: "propSoft" },
      { k: "line", a: [128, 92], b: [168, 92], w: 4, tone: "propSoft" },
      ...Array.from({ length: 13 }, (_, i): Shape => ({ k: "line", a: [44 + i * 10 - off, 137], b: [46 + i * 10 - off, 137], w: 1.5, tone: "guide" })),
    ];
    return [...belt, ...bodyShapes(j)];
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
      { pose: { hip: [72, 92], torso: [-28, 28], head: 75, hands: [[116, 133], [119, 133]], feet: [[42, 131], [44, 131]], knee: [1, 1], footAngle: [180, 180] }, hold: 0.2, move: 0.3 },
      { pose: { hip: [72, 92], torso: [18, -18], head: -28, hands: [[116, 133], [119, 133]], feet: [[42, 131], [44, 131]], knee: [1, 1], footAngle: [180, 180] }, hold: 0.2, move: 0.3 },
    ],
    () => ({ back: [{ k: "rect", x: 26, y: 133, w: 120, h: 4, rx: 2, tone: "propSoft", fill: true }] }),
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
      { pose: { hip: [96, 127], torso: [180, 180], head: 180, hands: [[86, 131], [88, 131]], feet: [[130, 133], [133, 133]], knee: [1, 1], elbow: [1, 1] }, hold: 0.15, move: 0.3 },
      { pose: { hip: [98, 104], torso: [152, 158], head: 172, hands: [[86, 131], [88, 131]], feet: [[130, 133], [133, 133]], knee: [1, 1], elbow: [1, 1] }, hold: 0.15, move: 0.4 },
    ],
    () => ({ back: [{ k: "rect", x: 26, y: 133, w: 130, h: 4, rx: 2, tone: "propSoft", fill: true }] }),
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
      { pose: { hip: [88, 80], torso: [-76, -78], head: -76, hands: [[94, 122], [96, 122]], feet: [[86, 133], [122, 111]], elbow: [-1, -1] }, hold: 0.12, move: 0.38 },
      { pose: { hip: [118, 52], torso: [-88, -88], head: -86, hands: [[118, 96], [120, 96]], feet: [[112, 104], [123, 111]], elbow: [-1, -1], footAngle: [30, 0] }, hold: 0.1, move: 0.4 },
    ],
    () => ({ back: [{ k: "rect", x: 106, y: 112, w: 56, h: 23, rx: 3, tone: "prop", fill: true }] }),
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
      { pose: { hip: [96, 76], torso: [-66, -64], head: -58, hands: [[136, 58], [138, 58]], feet: [[98, 133], [94, 131]], footAngle: [0, 20], elbow: [-1, -1] }, hold: 0.12, move: 0.33 },
      { pose: { hip: [96, 76], torso: [-62, -60], head: -54, hands: [[136, 58], [138, 58]], feet: [[98, 133], [42, 100]], footAngle: [0, 100], elbow: [-1, -1], knee: [1, 1] }, hold: 0.12, move: 0.43 },
    ],
    (j) => ({
      back: [
        { k: "line", a: [150, FLOOR], b: [150, 30], w: 6, tone: "propSoft" },
        { k: "line", a: [134, 58], b: [150, 58], w: 4, tone: "propSoft" },
        { k: "line", a: [148, 128], b: j.ankle[1], w: 1.5, tone: "propSoft" },
      ],
      front: [{ k: "circle", c: j.ankle[1], r: 3.5, tone: "accent", fill: true }],
    }),
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
      { pose: { hip: [76, 90], torso: [-36, -34], head: -20, hands: [[110, 112], [112, 112]], feet: [[52, 133], [55, 133]], knee: [1, 1], elbow: [-1, -1] }, hold: 0.12, move: 0.33 },
      { pose: { hip: [76, 90], torso: [-36, -34], head: -20, hands: [[103, 88], [105, 88]], feet: [[52, 133], [55, 133]], knee: [1, 1], elbow: [-1, -1] }, hold: 0.12, move: 0.43 },
    ],
    (j) => ({
      back: [
        { k: "line", a: [72, 100], b: [124, 62], w: 8, tone: "prop" },
        { k: "line", a: [84, 92], b: [84, FLOOR], w: 4, tone: "prop" },
        { k: "line", a: [84, 120], b: [128, 120], w: 4, tone: "propSoft" },
      ],
      front: dumbbell(j.hand[1], 0),
    }),
  ),
};

const plank: ExerciseAnimation = {
  cycle: 4,
  cue: "Hold still: one straight line from head to heels, hips neither sagging nor piked.",
  frames: [{ t: 0, label: "Straight-line hold" }],
  at: (t) => {
    const breathe = Math.sin(t * Math.PI * 2) * 0.6;
    const pose: Pose = { hip: [90, 113 + breathe * 0.4], torso: [-10, -10], head: -6, hands: [[158, 131], [160, 131]], feet: [[32, 129], [34, 129]], elbow: [-1, -1], footAngle: [100, 100], knee: [1, 1] };
    const j = joints(pose);
    return [
      floor(),
      { k: "rect", x: 20, y: 133, w: 150, h: 4, rx: 2, tone: "propSoft", fill: true },
      ...bodyShapes(j),
      { k: "line", a: [j.ankle[1][0] - 4, j.ankle[1][1] - 8], b: [j.head[0] + 8, j.head[1] - 6], w: 1.5, tone: "guide", dash: "4 4" },
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
    const base: Pose = { hip: [104, 127], torso: [180, 180], head: 180, hands: [[62, 82], [64, 82]], feet: [[134, 98], [136, 98]], knee: [1, 1], elbow: [1, 1], footAngle: [0, 0] };
    const nearArmFarLeg: Pose = { ...base, hands: [[62, 82], [16, 120]], feet: [[162, 118], [136, 98]], elbow: [1, -1] };
    const farArmNearLeg: Pose = { ...base, hands: [[18, 120], [64, 82]], feet: [[134, 98], [163, 118]], elbow: [-1, 1] };
    return side(
      [
        { pose: base, hold: 0.08, move: 0.17 },
        { pose: nearArmFarLeg, hold: 0.08, move: 0.17 },
        { pose: base, hold: 0.08, move: 0.17 },
        { pose: farArmNearLeg, hold: 0.08, move: 0.17 },
      ],
      () => ({ back: [{ k: "rect", x: 20, y: 133, w: 150, h: 4, rx: 2, tone: "propSoft", fill: true }] }),
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
      { pose: { ...STAND, hands: [[110, 42], [112, 42]], feet: [[98, 133], [103, 133]], elbow: [-1, -1] }, hold: 0.12, move: 0.38 },
      { pose: { hip: [80, 106], torso: [-60, -66], head: -72, hands: [[116, 76], [118, 76]], feet: [[98, 133], [103, 133]], elbow: [-1, -1] }, hold: 0.1, move: 0.4 },
    ],
    (j) => ({ front: dumbbell([j.hand[1][0] + 2, j.hand[1][1] - 2], 90, 12) }),
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
      { pose: { hip: [88, 98], torso: [-32, -32], head: -28, hands: [[150, 104], [152, 104]], feet: [[38, 131], [40, 131]], knee: [1, 1], elbow: [-1, -1], footAngle: [60, 60] }, hold: 0.12, move: 0.33 },
      { pose: { hip: [98, 108], torso: [-22, -22], head: -18, hands: [[150, 104], [152, 104]], feet: [[38, 131], [40, 131]], knee: [1, 1], elbow: [-1, -1], footAngle: [60, 60] }, hold: 0.1, move: 0.45 },
    ],
    () => ({ back: [{ k: "rect", x: 140, y: 105, w: 40, h: 8, rx: 3, tone: "prop", fill: true }, { k: "line", a: [146, 113], b: [146, FLOOR], w: 4, tone: "prop" }, { k: "line", a: [174, 113], b: [174, FLOOR], w: 4, tone: "prop" }] }),
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
      { pose: { hip: [90, 100], torso: [-92, -91], head: -90, hands: [[96, 48], [98, 48]], feet: [[124, 133], [127, 133]], elbow: [-1, -1] }, hold: 0.12, move: 0.33 },
      { pose: { hip: [90, 100], torso: [-92, -91], head: -90, hands: [[92, 10], [94, 10]], feet: [[124, 133], [127, 133]], elbow: [-1, -1] }, hold: 0.1, move: 0.45 },
    ],
    (j) => ({
      back: [
        { k: "rect", x: 70, y: 104, w: 44, h: 8, rx: 3, tone: "prop", fill: true },
        { k: "line", a: [78, 104], b: [74, 40], w: 8, tone: "prop" },
        { k: "line", a: [92, 112], b: [92, FLOOR], w: 4, tone: "prop" },
      ],
      front: dumbbell(j.hand[1], 0, 12),
    }),
  ),
};

const bike: ExerciseAnimation = {
  cycle: 1.4,
  cue: "Steady pedalling: feet circle smoothly with a slight bend at the bottom of each stroke.",
  frames: [
    { t: 0, label: "Pedal at the front" },
    { t: 0.5, label: "Pedal at the back" },
  ],
  at: (t) => {
    const crank: Pt = [114, 116];
    const a = t * Math.PI * 2;
    const r = 12;
    const near: Pt = [crank[0] + Math.cos(a) * r, crank[1] + Math.sin(a) * r];
    const far: Pt = [crank[0] - Math.cos(a) * r, crank[1] - Math.sin(a) * r];
    const pose: Pose = { hip: [88, 72], torso: [-50, -44], head: -32, hands: [[140, 54], [142, 54]], feet: [far, near], knee: [1, 1], elbow: [-1, -1] };
    const j = joints(pose);
    return [
      floor(),
      { k: "line", a: [80, 76], b: [100, 124], w: 6, tone: "prop" },
      { k: "line", a: [100, 124], b: [140, 124], w: 6, tone: "prop" },
      { k: "line", a: [140, 124], b: [146, 58], w: 6, tone: "prop" },
      { k: "line", a: [74, 74], b: [96, 74], w: 6, tone: "prop" },
      { k: "line", a: [80, 132], b: [150, 132], w: 5, tone: "prop" },
      { k: "circle", c: crank, r: 13, tone: "propSoft", w: 2 },
      ...bodyShapes(j),
      { k: "line", a: crank, b: near, w: 3, tone: "accent" },
    ];
  },
};

/** Generic figure for custom exercises: a calm standing pose, clearly not a movement demo. */
const generic: ExerciseAnimation = {
  cycle: 4,
  cue: "No demonstration for this custom exercise yet — follow your own notes and instructions.",
  frames: [{ t: 0, label: "Custom exercise" }],
  at: () => [floor(), ...bodyShapes(joints({ ...STAND, hands: [[92, 116], [108, 116]] }))],
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
  generic,
};

export function animationFor(key: string): ExerciseAnimation {
  return ANIMATIONS[key] ?? generic;
}
