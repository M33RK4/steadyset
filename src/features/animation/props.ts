// Detailed gym equipment for the exercise demonstrations: a gym room, chrome frames, upholstered
// pads, weight stacks that rise with the lift, pulleys, cables, plates and dumbbells. Everything
// is outlined and shaded with the theme's illustration colours (see Tone in ./figure).

import { add, angleOf, dir, FLOOR, lerpPt, mul, perp, smooth, sub, unit, type Grad, type Pt, type Shape, type Tone } from "./figure";

const OUT = 0.6;
const f2 = (p: Pt) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`;

/** Shading across a bar from a to b, sideways: dark edge, highlight, body, dark edge. */
function barShade(a: Pt, b: Pt, r: number, tone: Tone, light: Tone = "metalLight"): Grad {
  const m = lerpPt(a, b, 0.5);
  const n = perp(unit(sub(b, a)));
  return {
    kind: "linear",
    a: add(m, mul(n, -r)),
    b: add(m, mul(n, r)),
    stops: [
      { o: 0, tone, shade: -18 },
      { o: 0.22, tone: light },
      { o: 0.42, tone },
      { o: 0.8, tone, shade: -10 },
      { o: 1, tone, shade: -32 },
    ],
  };
}

// ---------------------------------------------------------------- room

const SPECKS: Pt[] = Array.from({ length: 34 }, (_, i) => [((i * 53) % 260) - 30, FLOOR + 3 + ((i * 37) % 26)]);

/** Gym room: wall with a mirror strip and ledge, skirting board, rubber tile floor. */
export function stage(): Shape[] {
  const out: Shape[] = [
    { k: "rect", x: -40, y: -90, w: 280, h: FLOOR + 90, tone: "wall", grad: { kind: "linear", a: [0, -90], b: [0, FLOOR], stops: [{ o: 0, tone: "wall", shade: -6 }, { o: 1, tone: "wall", shade: 6 }] } },
    // mirror with frame and two soft reflections
    { k: "rect", x: -40, y: -60, w: 280, h: 150, tone: "mirror", grad: { kind: "linear", a: [0, -60], b: [200, 90], stops: [{ o: 0, tone: "mirror", shade: 10 }, { o: 0.5, tone: "mirror" }, { o: 1, tone: "mirror", shade: -6 }] } },
    { k: "path", d: "M30,-60 L70,-60 L-10,90 L-50,90 Z", w: 0, fill: true, tone: "white", op: 0.18 },
    { k: "path", d: "M150,-60 L162,-60 L82,90 L70,90 Z", w: 0, fill: true, tone: "white", op: 0.14 },
    { k: "rect", x: -40, y: 88, w: 280, h: 4, tone: "metal", grad: { kind: "linear", a: [0, 88], b: [0, 92], stops: [{ o: 0, tone: "metalLight" }, { o: 1, tone: "metal", shade: -14 }] }, stroke: "line", sw: 0.4, strokeShade: 30, op: 0.9 },
    { k: "rect", x: -40, y: FLOOR - 6, w: 280, h: 6, tone: "floorLine", shade: -4 },
    { k: "line", a: [-40, FLOOR - 6], b: [240, FLOOR - 6], w: 0.5, tone: "white", op: 0.35 },
    // floor
    { k: "rect", x: -40, y: FLOOR, w: 280, h: 70, tone: "floor", grad: { kind: "linear", a: [0, FLOOR], b: [0, FLOOR + 30], stops: [{ o: 0, tone: "floor", shade: -6 }, { o: 1, tone: "floor", shade: 4 }] } },
    { k: "line", a: [-40, FLOOR], b: [240, FLOOR], w: 0.9, tone: "floorLine", shade: -10 },
  ];
  for (let x = -40; x <= 240; x += 30) out.push({ k: "line", a: [x, FLOOR], b: [100 + (x - 100) * 1.7, FLOOR + 30], w: 0.5, tone: "floorLine", op: 0.8 });
  for (const y of [FLOOR + 6, FLOOR + 15]) out.push({ k: "line", a: [-40, y], b: [240, y], w: 0.45, tone: "floorLine", op: 0.7 });
  for (const p of SPECKS) out.push({ k: "circle", c: p, r: 0.35, tone: "floorLine", shade: -14, op: 0.7 });
  return out;
}

/** Soft contact shadow on the floor. */
export function shadow(cx: number, w: number, y = FLOOR + 1): Shape {
  return { k: "ellipse", c: [cx, y], rx: w / 2, ry: 3, tone: "shadow", grad: { kind: "radial", c: [cx, y], r: w / 2, stops: [{ o: 0, tone: "shadow" }, { o: 0.7, tone: "shadow", op: 0.6 }, { o: 1, tone: "shadow", op: 0 }] } };
}

// ---------------------------------------------------------------- frames & pads

/** Steel tube: outline, cylinder shading with a highlight, optional end caps. */
export function tube(a: Pt, b: Pt, r = 2.2, caps = false): Shape[] {
  const out: Shape[] = [
    { k: "line", a, b, w: r * 2 + OUT * 2, tone: "line" },
    { k: "line", a, b, w: r * 2, tone: "metal", grad: barShade(a, b, r, "metal") },
  ];
  if (caps)
    for (const p of [a, b]) out.push({ k: "circle", c: p, r: r * 0.9, tone: "rubber", stroke: "line", sw: 0.4 });
  return out;
}

/** Weld plate with two bolts where frame tubes meet. */
export function bracket(c: Pt, angle = 0, size = 3.4): Shape[] {
  const u = dir(angle, 1, [0, 0]);
  const v = perp(u);
  const pts = [add(add(c, mul(u, -size)), mul(v, -size * 0.7)), add(add(c, mul(u, size)), mul(v, -size * 0.7)), add(add(c, mul(u, size)), mul(v, size * 0.7)), add(add(c, mul(u, -size)), mul(v, size * 0.7))];
  return [
    { k: "path", d: `M${pts.map(f2).join(" L")} Z`, w: 0, fill: true, tone: "metal", shade: -6, stroke: "line", sw: 0.45 },
    ...bolt(add(c, mul(u, -size * 0.5)), 0.75),
    ...bolt(add(c, mul(u, size * 0.5)), 0.75),
  ];
}

/** Rubber foot under a frame tube. */
export function foot(x: number, w = 10): Shape {
  return { k: "rect", x: x - w / 2, y: FLOOR - 2.6, w, h: 2.8, rx: 1.2, tone: "rubber", grad: { kind: "linear", a: [0, FLOOR - 2.6], b: [0, FLOOR], stops: [{ o: 0, tone: "rubber", shade: 18 }, { o: 1, tone: "rubber" }] }, stroke: "line", sw: OUT };
}

export function bolt(c: Pt, r = 1): Shape[] {
  return [
    { k: "circle", c, r, tone: "metalLight", grad: { kind: "radial", c: add(c, [-r * 0.3, -r * 0.3]), r: r * 1.4, stops: [{ o: 0, tone: "white" }, { o: 1, tone: "metal", shade: -10 }] }, stroke: "line", sw: 0.35 },
    { k: "line", a: add(c, [-r * 0.55, 0]), b: add(c, [r * 0.55, 0]), w: 0.3, tone: "line", op: 0.6 },
  ];
}

const padGrad = (y0: number, y1: number): Grad => ({ kind: "linear", a: [0, y0], b: [0, y1], stops: [{ o: 0, tone: "pad", shade: 22 }, { o: 0.25, tone: "pad", shade: 6 }, { o: 1, tone: "pad", shade: -16 }] });

/** Upholstered pad (axis-aligned): vinyl with shading, piping, stitching and a highlight. */
export function pad(x: number, y: number, w: number, h: number, rx = 2.8): Shape[] {
  return [
    { k: "rect", x, y, w, h, rx, tone: "pad", grad: padGrad(y, y + h), stroke: "line", sw: OUT },
    { k: "rect", x: x + 0.7, y: y + 0.7, w: w - 1.4, h: h - 1.4, rx: Math.max(0, rx - 0.6), fill: false, tone: "padLight", sw: 0.45, op: 0.55 },
    { k: "rect", x: x + 2, y: y + 2, w: Math.max(0, w - 4), h: Math.max(0, h - 4), rx: Math.max(0, rx - 1.4), fill: false, tone: "padLight", sw: 0.35, dash: "0.9 0.7", op: 0.8 },
    { k: "line", a: [x + rx + 1, y + 1.2], b: [x + w - rx - 1, y + 1.2], w: 0.7, tone: "white", op: 0.28 },
  ];
}

/** Pad between two points (its long axis), any angle. */
export function padAlong(a: Pt, b: Pt, thick: number, rx = 2.8): Shape[] {
  const c = lerpPt(a, b, 0.5);
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const rot = angleOf(a, b);
  const base = { rot, cx: c[0], cy: c[1] };
  const n = perp(unit(sub(b, a)));
  const grad: Grad = { kind: "linear", a: add(c, mul(n, -thick / 2)), b: add(c, mul(n, thick / 2)), stops: [{ o: 0, tone: "pad", shade: 22 }, { o: 0.3, tone: "pad", shade: 6 }, { o: 1, tone: "pad", shade: -16 }] };
  return [
    { k: "rect", x: c[0] - l / 2, y: c[1] - thick / 2, w: l, h: thick, rx, tone: "pad", grad, stroke: "line", sw: OUT, ...base },
    { k: "rect", x: c[0] - l / 2 + 0.7, y: c[1] - thick / 2 + 0.7, w: l - 1.4, h: thick - 1.4, rx: Math.max(0, rx - 0.6), fill: false, tone: "padLight", sw: 0.45, op: 0.55, ...base },
    { k: "rect", x: c[0] - l / 2 + 2, y: c[1] - thick / 2 + 2, w: l - 4, h: thick - 4, rx: Math.max(0, rx - 1.4), fill: false, tone: "padLight", sw: 0.35, dash: "0.9 0.7", op: 0.8, ...base },
  ];
}

/** Foam roller pad (seen end-on) with chrome end cap. */
export function roller(c: Pt, r = 4.4): Shape[] {
  return [
    { k: "circle", c, r, tone: "pad", grad: { kind: "radial", c: add(c, [-r * 0.35, -r * 0.35]), r: r * 1.5, stops: [{ o: 0, tone: "pad", shade: 26 }, { o: 1, tone: "pad", shade: -18 }] }, stroke: "line", sw: OUT },
    { k: "circle", c, r: r * 0.72, fill: false, tone: "padLight", w: 0.4, op: 0.6, dash: "0.8 0.6" },
    { k: "circle", c, r: r * 0.34, tone: "metal", grad: { kind: "radial", c: add(c, [-0.5, -0.5]), r: r * 0.5, stops: [{ o: 0, tone: "white" }, { o: 1, tone: "metal", shade: -12 }] }, stroke: "line", sw: 0.4 },
  ];
}

// ---------------------------------------------------------------- weights

/** Weight plate seen face-on: raised rim, lettering ring, recessed centre, chrome hub with bolts. */
export function plateFace(c: Pt, r: number, spin = 0): Shape[] {
  const body: Grad = { kind: "radial", c: add(c, [-r * 0.3, -r * 0.3]), r: r * 1.5, stops: [{ o: 0, tone: "plate", shade: 18 }, { o: 0.6, tone: "plate" }, { o: 1, tone: "plate", shade: -22 }] };
  const out: Shape[] = [
    { k: "circle", c, r, tone: "plate", grad: body, stroke: "line", sw: OUT },
    { k: "circle", c, r: r * 0.88, fill: false, tone: "plateLight", w: r * 0.08, op: 0.7 },
    { k: "circle", c, r: r * 0.7, fill: false, tone: "plateLight", w: 0.6, op: 0.85, dash: `${(r * 0.7).toFixed(1)} 1.2` },
    { k: "circle", c, r: r * 0.5, tone: "plateDark", stroke: "line", sw: 0.35, op: 0.9 },
    { k: "circle", c, r: Math.max(1.3, r * 0.24), tone: "metal", grad: { kind: "radial", c: add(c, [-0.6, -0.6]), r: r * 0.4, stops: [{ o: 0, tone: "white" }, { o: 1, tone: "metal", shade: -14 }] }, stroke: "line", sw: 0.4 },
    { k: "circle", c, r: Math.max(0.6, r * 0.1), tone: "line" },
  ];
  if (r > 6) for (let i = 0; i < 4; i++) out.push({ k: "circle", c: dir(spin + 45 + i * 90, r * 0.38, c), r: Math.max(0.4, r * 0.05), tone: "metalLight", stroke: "line", sw: 0.25 });
  return out;
}

/** Plate seen edge-on (as on a barbell or sled horn). */
export function plateEdge(c: Pt, angle: number, r: number, t = 3.2): Shape[] {
  return [
    { k: "rect", x: c[0] - t / 2, y: c[1] - r, w: t, h: r * 2, rx: 1.2, tone: "plate", grad: { kind: "linear", a: [c[0] - t / 2, c[1]], b: [c[0] + t / 2, c[1]], stops: [{ o: 0, tone: "plate", shade: 16 }, { o: 1, tone: "plate", shade: -18 }] }, stroke: "line", sw: OUT, rot: angle, cx: c[0], cy: c[1] },
  ];
}

/** Hex dumbbell. "side": handle across the picture at `angle`; "end": handle pointing at the viewer. */
export function dumbbell(c: Pt, angle = 0, size = 1, view: "side" | "end" = "side"): Shape[] {
  if (view === "end") {
    const hex = (r: number) => Array.from({ length: 6 }, (_, i) => dir(angle + 30 + i * 60, r, c));
    const hexD = (r: number) => `M${hex(r).map(f2).join(" L")} Z`;
    return [
      { k: "path", d: hexD(5.8 * size), w: 0, fill: true, tone: "rubber", grad: { kind: "linear", a: add(c, [-5, -5]), b: add(c, [5, 5]), stops: [{ o: 0, tone: "rubber", shade: 22 }, { o: 1, tone: "rubber", shade: -10 }] }, stroke: "line", sw: OUT },
      { k: "path", d: hexD(4.4 * size), w: 0, fill: true, tone: "rubber", shade: 10, stroke: "line", sw: 0.35, strokeShade: 20 },
      { k: "circle", c, r: 2.3 * size, tone: "metal", grad: { kind: "radial", c: add(c, [-0.7, -0.7]), r: 3 * size, stops: [{ o: 0, tone: "white" }, { o: 1, tone: "metal", shade: -14 }] }, stroke: "line", sw: 0.45 },
      { k: "circle", c, r: 0.8 * size, tone: "metal", shade: -20 },
    ];
  }
  const u = dir(angle, 1, [0, 0]);
  const at = (d: number) => add(c, mul(u, d * size));
  const head = (d: number): Shape[] => {
    const p = at(d);
    return [
      { k: "rect", x: p[0] - 2.6 * size, y: p[1] - 5.8 * size, w: 5.2 * size, h: 11.6 * size, rx: 1.4 * size, tone: "rubber", grad: { kind: "linear", a: add(p, mul(perp(u), -5.8 * size)), b: add(p, mul(perp(u), 5.8 * size)), stops: [{ o: 0, tone: "rubber", shade: 24 }, { o: 0.35, tone: "rubber", shade: 6 }, { o: 1, tone: "rubber", shade: -12 }] }, stroke: "line", sw: OUT, rot: angle, cx: p[0], cy: p[1] },
      { k: "rect", x: p[0] - 0.6 * size, y: p[1] - 5 * size, w: 1.2 * size, h: 10 * size, rx: 0.5, tone: "rubber", shade: 16, op: 0.7, rot: angle, cx: p[0], cy: p[1] },
    ];
  };
  return [
    ...tube(at(-6), at(6), 1.15 * size),
    { k: "line", a: at(-3.4), b: at(3.4), w: 2.3 * size, tone: "metal", shade: -26, dash: "0.4 0.5", op: 0.7 },
    ...[-4.9, 4.9].map((d): Shape => ({ k: "rect", x: at(d)[0] - 0.9 * size, y: at(d)[1] - 2.3 * size, w: 1.8 * size, h: 4.6 * size, rx: 0.6, tone: "metal", grad: barShade(add(at(d), mul(perp(u), 2.3)), add(at(d), mul(perp(u), -2.3)), 1, "metal"), stroke: "line", sw: 0.4, rot: angle, cx: at(d)[0], cy: at(d)[1] })),
    ...head(-8),
    ...head(8),
    ...[-10.9, 10.9].map((d): Shape => ({ k: "rect", x: at(d)[0] - 0.5 * size, y: at(d)[1] - 2 * size, w: 1 * size, h: 4 * size, rx: 0.4, tone: "metal", shade: 10, stroke: "line", sw: 0.35, rot: angle, cx: at(d)[0], cy: at(d)[1] })),
  ];
}

/**
 * Selectorised weight stack: back panel, frame, chrome guide rods, numbered plates with
 * selector holes, the pin with its pull cord, a top plate and a label. The plates above the pin
 * rise by `lift`. Returns the cable attachment point too.
 */
export function weightStack(x: number, top: number, opts: { plates?: number; selected?: number; lift: number; w?: number }): { shapes: Shape[]; cable: Pt } {
  const plates = opts.plates ?? 12;
  const selected = opts.selected ?? 5;
  const w = opts.w ?? 26;
  const ph = 3.7;
  const gap = 0.5;
  const base = FLOOR - 6;
  const out: Shape[] = [
    { k: "rect", x: x - 4, y: top, w: w + 8, h: base - top, tone: "metalDark", shade: -10, op: 0.55 },
    ...tube([x - 3, FLOOR - 1], [x - 3, top], 2, true),
    ...tube([x + w + 3, FLOOR - 1], [x + w + 3, top], 2, true),
    ...tube([x - 5.5, top], [x + w + 5.5, top], 2.4, true),
    ...bracket([x - 3, top], 90, 3),
    ...bracket([x + w + 3, top], 90, 3),
    { k: "rect", x: x - 7, y: base, w: w + 14, h: 5, rx: 1.2, tone: "metalDark", grad: { kind: "linear", a: [0, base], b: [0, base + 5], stops: [{ o: 0, tone: "metal" }, { o: 1, tone: "metalDark", shade: -16 }] }, stroke: "line", sw: OUT },
    { k: "rect", x: x + 3, y: base - 1.8, w: 4, h: 1.8, rx: 0.6, tone: "rubber" },
    { k: "rect", x: x + w - 7, y: base - 1.8, w: 4, h: 1.8, rx: 0.6, tone: "rubber" },
    // chrome guide rods
    ...[x + 5, x + w - 5].map((gx): Shape => ({ k: "line", a: [gx, base], b: [gx, top + 2.4], w: 1.3, tone: "metal", grad: barShade([gx, base], [gx, top], 0.65, "metal") })),
    // label plate on the base
    { k: "rect", x: x + w / 2 - 8, y: base + 0.5, w: 16, h: 4, rx: 0.8, tone: "rubber", stroke: "line", sw: 0.4 },
    { k: "text", at: [x + w / 2, base + 3.4], text: "STEADYSET", size: 2.2, tone: "white", weight: 800 },
  ];
  const plateY = (i: number) => base - (i + 1) * (ph + gap);
  for (let i = 0; i < plates; i++) {
    const moving = i >= plates - selected;
    const y = plateY(i) - (moving ? opts.lift : 0);
    out.push({ k: "rect", x, y, w, h: ph, rx: 0.8, tone: "plate", grad: { kind: "linear", a: [0, y], b: [0, y + ph], stops: [{ o: 0, tone: "plate", shade: 16 }, { o: 0.4, tone: "plate" }, { o: 1, tone: "plate", shade: -24 }] }, stroke: "line", sw: OUT });
    out.push({ k: "circle", c: [x + w / 2, y + ph / 2], r: 0.7, tone: "line", op: 0.8 });
    out.push({ k: "text", at: [x + 4.6, y + ph - 0.9], text: String((plates - i) * 10), size: 2.2, tone: "plateLight", weight: 800, anchor: "middle" });
  }
  // selector pin with its cord
  const pinY = plateY(plates - selected) - opts.lift + ph / 2;
  out.push({ k: "path", d: `M${f2([x + w + 8, pinY])} Q${f2([x + w + 12, pinY + 14])} ${f2([x + w + 4, base - 2])}`, w: 0.5, tone: "cable", op: 0.8 });
  out.push({ k: "line", a: [x + w / 2 + 2, pinY], b: [x + w + 6, pinY], w: 1.3, tone: "metal", grad: barShade([x + w, pinY - 1], [x + w, pinY + 1], 0.65, "metal") });
  out.push({ k: "rect", x: x + w + 5.6, y: pinY - 2.2, w: 4.4, h: 4.4, rx: 1.6, tone: "accent", stroke: "line", sw: OUT });
  // top plate + stem
  const capY = plateY(plates - 1) - opts.lift - 3.6;
  out.push({ k: "rect", x: x - 1, y: capY, w: w + 2, h: 3.2, rx: 1, tone: "metal", grad: { kind: "linear", a: [0, capY], b: [0, capY + 3.2], stops: [{ o: 0, tone: "metalLight" }, { o: 1, tone: "metal", shade: -16 }] }, stroke: "line", sw: OUT });
  out.push(...bolt([x + w / 2, capY + 1.6], 0.9));
  out.push({ k: "line", a: [x + w / 2, capY], b: [x + w / 2, capY - 4.6], w: 1.8, tone: "metal", grad: barShade([x + w / 2, capY], [x + w / 2, capY - 4], 0.9, "metal") });
  return { shapes: out, cable: [x + w / 2, capY - 4.6] };
}

/** Pulley wheel in its bracket, with spokes that turn with the cable. */
export function pulley(c: Pt, r = 4, spin = 0): Shape[] {
  return [
    { k: "path", d: smooth([add(c, [-r - 2, -r - 1]), add(c, [r + 2, -r - 1]), add(c, [r + 2.4, 0]), add(c, [0, r + 2.4]), add(c, [-r - 2.4, 0])]), w: 0, fill: true, tone: "metal", shade: -14, stroke: "line", sw: 0.45, op: 0.9 },
    { k: "circle", c, r: r + 1.1, tone: "metalDark", stroke: "line", sw: OUT },
    { k: "circle", c, r, tone: "metal", grad: { kind: "radial", c: add(c, [-r * 0.3, -r * 0.3]), r: r * 1.3, stops: [{ o: 0, tone: "metalLight" }, { o: 1, tone: "metal", shade: -12 }] } },
    ...[0, 120, 240].map((a): Shape => ({ k: "line", a: dir(spin + a, r * 0.32, c), b: dir(spin + a, r * 0.85, c), w: 0.7, tone: "metalDark" })),
    ...bolt(c, r * 0.3),
  ];
}

export function cable(pts: Pt[]): Shape[] {
  return [
    { k: "poly", pts, w: 1.6, tone: "line", op: 0.55 },
    { k: "poly", pts, w: 1, tone: "cable" },
    { k: "poly", pts, w: 0.3, tone: "white", op: 0.35 },
  ];
}

/** Rubber-covered handle seen from the side, with knurled texture and chrome end caps. */
export function grip(c: Pt, angle: number, l = 9): Shape[] {
  const u = dir(angle, l / 2, [0, 0]);
  const a = sub(c, u);
  const b = add(c, u);
  return [
    { k: "line", a, b, w: 3.8, tone: "line" },
    { k: "line", a, b, w: 2.6, tone: "rubber", grad: barShade(a, b, 1.3, "rubber", "rubber") },
    { k: "line", a: lerpPt(a, b, 0.12), b: lerpPt(a, b, 0.88), w: 2.6, tone: "rubber", shade: 22, dash: "0.4 0.6", op: 0.6 },
    ...[a, b].map((p): Shape => ({ k: "circle", c: p, r: 1.7, tone: "metal", grad: { kind: "radial", c: add(p, [-0.5, -0.5]), r: 2.2, stops: [{ o: 0, tone: "white" }, { o: 1, tone: "metal", shade: -12 }] }, stroke: "line", sw: 0.4 })),
  ];
}

// ---------------------------------------------------------------- furniture

/** Flat bench: pad on a steel frame with crossbar, brackets and rubber feet. */
export function bench(x1: number, x2: number, top: number, thick = 6): Shape[] {
  const legs = [x1 + 7, x2 - 7];
  return [
    ...legs.flatMap((x) => [...tube([x, top + thick], [x, FLOOR - 2], 1.8), foot(x, 12)]),
    ...tube([x1 + 4, top + thick + 1.8], [x2 - 4, top + thick + 1.8], 1.6),
    ...legs.flatMap((x) => bracket([x, top + thick + 1.8], 0, 2.6)),
    ...pad(x1, top, x2 - x1, thick),
  ];
}

/** Exercise mat with a shaded edge and ridges. */
export function mat(x1: number, x2: number): Shape[] {
  const out: Shape[] = [{ k: "rect", x: x1, y: FLOOR - 2.8, w: x2 - x1, h: 3.2, rx: 1.4, tone: "mat", grad: { kind: "linear", a: [0, FLOOR - 2.8], b: [0, FLOOR + 0.4], stops: [{ o: 0, tone: "mat", shade: 14 }, { o: 1, tone: "mat", shade: -14 }] }, stroke: "line", sw: OUT }];
  for (let x = x1 + 5; x < x2 - 3; x += 5) out.push({ k: "line", a: [x, FLOOR - 2], b: [x, FLOOR - 0.6], w: 0.5, tone: "matLine" });
  return out;
}

/** Sturdy plyo box / step with wood grain, a carry slot and a rubber top. */
export function box(x: number, y: number, w: number, h: number): Shape[] {
  const out: Shape[] = [
    { k: "rect", x, y, w, h, rx: 1.6, tone: "plateLight", grad: { kind: "linear", a: [x, y], b: [x + w, y + h], stops: [{ o: 0, tone: "plateLight", shade: 18 }, { o: 1, tone: "plateLight", shade: -16 }] }, stroke: "line", sw: OUT },
    { k: "rect", x: x + 3, y: y + 4, w: w - 6, h: h - 7, rx: 1, fill: false, tone: "plate", sw: 0.6, op: 0.45 },
    { k: "rect", x: x + w / 2 - 6, y: y + 6, w: 12, h: 3.4, rx: 1.7, tone: "plate", shade: -18, op: 0.8 },
    { k: "rect", x: x - 0.6, y: y - 1.8, w: w + 1.2, h: 3.2, rx: 1, tone: "rubber", grad: { kind: "linear", a: [0, y - 1.8], b: [0, y + 1.4], stops: [{ o: 0, tone: "rubber", shade: 20 }, { o: 1, tone: "rubber" }] }, stroke: "line", sw: OUT },
  ];
  for (let i = 1; i < 4; i++) {
    const yy = y + 10 + i * ((h - 13) / 4);
    out.push({ k: "path", d: smooth([[x + 5, yy], [x + w / 2, yy - 1], [x + w - 5, yy + 0.6]], false), w: 0.4, tone: "plate", op: 0.45 });
  }
  return out;
}

/** A display console with a screen and buttons (treadmill, bike). */
export function screen(c: Pt, w: number, h: number, rot = 0): Shape[] {
  const r = { rot, cx: c[0], cy: c[1] };
  return [
    { k: "rect", x: c[0] - w / 2 - 1.6, y: c[1] - h / 2 - 1.6, w: w + 3.2, h: h + 4.8, rx: 1.8, tone: "rubber", grad: { kind: "linear", a: [c[0], c[1] - h], b: [c[0], c[1] + h], stops: [{ o: 0, tone: "rubber", shade: 20 }, { o: 1, tone: "rubber" }] }, stroke: "line", sw: OUT, ...r },
    { k: "rect", x: c[0] - w / 2, y: c[1] - h / 2, w, h, rx: 0.8, tone: "screen", grad: { kind: "linear", a: [c[0] - w / 2, c[1] - h / 2], b: [c[0] + w / 2, c[1] + h / 2], stops: [{ o: 0, tone: "screen", shade: 20 }, { o: 1, tone: "screen", shade: -10 }] }, ...r },
    { k: "rect", x: c[0] - w / 2 + 1.5, y: c[1] - 1.2, w: w * 0.45, h: 1.4, rx: 0.4, tone: "line", op: 0.45, ...r },
    { k: "rect", x: c[0] - w / 2 + 1.5, y: c[1] + 1, w: w * 0.3, h: 0.9, rx: 0.4, tone: "line", op: 0.3, ...r },
    ...[-1, 0, 1].map((i): Shape => ({ k: "circle", c: dir(rot + 90, h / 2 + 1.6, add(c, dir(rot, i * 3, [0, 0]))), r: 0.7, tone: "accent", op: 0.9 })),
  ];
}

/** A faint dotted path with an arrowhead showing the direction of the main movement. */
export function guide(points: Pt[]): Shape[] {
  if (points.length < 2) return [];
  const end = points[points.length - 1];
  const before = points[Math.max(0, points.length - 3)];
  const a = angleOf(before, end);
  const tip = dir(a, 3, end);
  return [
    { k: "path", d: smooth(points, false), w: 1.1, tone: "accent", dash: "1.6 1.8", op: 0.6 },
    { k: "path", d: `M${f2(dir(a + 150, 3.4, tip))} L${f2(tip)} L${f2(dir(a - 150, 3.4, tip))}`, w: 1.2, tone: "accent", op: 0.75 },
  ];
}
