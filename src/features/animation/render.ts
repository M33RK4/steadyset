// Turns exercise-demo shapes into SVG markup. The animated demo writes this string straight into
// the page every frame (much faster and smoother than re-rendering hundreds of React elements),
// and still pictures use the same function, so both always look identical.

import type { Grad, Shape, Tone } from "./figure";

const v = (name: string) => `var(--fig-${name})`;

export const TONE: Record<Tone, string> = {
  line: v("line"),
  skin: v("skin"),
  skinFar: v("skin-far"),
  skinShade: v("skin-shade"),
  hair: v("hair"),
  lips: v("lips"),
  shirt: v("shirt"),
  shirtFar: v("shirt-far"),
  shirtShade: v("shirt-shade"),
  shorts: v("shorts"),
  shortsFar: v("shorts-far"),
  stripe: v("stripe"),
  sock: v("sock"),
  shoe: v("shoe"),
  shoeFar: v("shoe-far"),
  sole: v("sole"),
  metal: v("metal"),
  metalDark: v("metal-dark"),
  metalLight: v("metal-light"),
  pad: v("pad"),
  padLight: v("pad-light"),
  plate: v("plate"),
  plateDark: v("plate-dark"),
  plateLight: v("plate-light"),
  cable: v("cable"),
  rubber: v("rubber"),
  mat: v("mat"),
  matLine: v("mat-line"),
  floor: v("floor"),
  floorLine: v("floor-line"),
  wall: v("wall"),
  mirror: v("mirror"),
  screen: v("screen"),
  muscle: v("muscle"),
  shadow: v("shadow"),
  accent: "var(--accent)",
  guide: "var(--accent)",
  white: "#ffffff",
};

/** A tone lightened (amt > 0) or darkened (amt < 0) by a percentage. */
export function shade(t: Tone, amt = 0): string {
  if (!amt) return TONE[t];
  return amt > 0 ? `color-mix(in srgb, ${TONE[t]} ${100 - amt}%, white)` : `color-mix(in srgb, ${TONE[t]} ${100 + amt}%, black)`;
}

// one decimal is a third of a pixel at the size demos are shown — plenty, and keeps the markup small
const n = (x: number) => (Math.round(x * 10) / 10).toString();

/**
 * Splits a scene into runs of shapes that never change during the animation (the room, the parts
 * of a machine that don't move) and runs that do, keeping the drawing order. Still runs are drawn
 * once; only the moving runs are redrawn each frame. Returns [start, end, moves] ranges.
 */
export function motionRuns(sample: (t: number) => Shape[]): [number, number, boolean][] {
  const frames = [0.07, 0.31, 0.58, 0.83].map((t) => sample(t).map((s) => JSON.stringify(s)));
  const count = frames[0].length;
  // a scene whose number of shapes changes can't be split safely: redraw everything
  if (frames.some((f) => f.length !== count)) return [[0, count, true]];
  const runs: [number, number, boolean][] = [];
  for (let i = 0; i < count; i++) {
    const moves = frames.some((f) => f[i] !== frames[0][i]);
    const last = runs[runs.length - 1];
    if (last && last[2] === moves) last[1] = i + 1;
    else runs.push([i, i + 1, moves]);
  }
  return runs;
}

/**
 * One SVG element: its tag, its attributes as a flat [name, value, name, value…] list in order,
 * and child elements (gradient stops) or text. Flat lists keep building a frame cheap.
 */
interface El {
  tag: string;
  at: string[];
  kids?: El[];
  text?: string;
}

const shades = new Map<string, string>();
/** `shade` for the renderer, remembered (the same few colours come up thousands of times a second). */
function paintOf(t: Tone, amt = 0): string {
  const key = t + amt;
  let v = shades.get(key);
  if (v === undefined) shades.set(key, (v = shade(t, amt)));
  return v;
}

// attribute groups several shapes share (module-level so building a frame makes no closures)
function outline(at: string[], s: Shape): void {
  if (s.stroke) at.push("stroke", paintOf(s.stroke, s.strokeShade ?? 0), "stroke-width", n(s.sw ?? 0.6), "stroke-linejoin", "round");
}
function dash(at: string[], s: Shape): void {
  if ("dash" in s && s.dash) at.push("stroke-dasharray", s.dash);
}
function rotate(at: string[], r: number | undefined, x: number, y: number): void {
  if (r) at.push("transform", `rotate(${n(r)} ${n(x)} ${n(y)})`);
}

/**
 * The SVG elements for a list of shapes, in document order as `querySelectorAll("*")` lists them:
 * a <defs> first (if any gradients), each gradient followed by its stops, then the shapes.
 */
function shapeEls(shapes: Shape[], id: string): El[] {
  const grads: El[] = [];
  const defs: El[] = [];
  const body: El[] = [];
  for (const s of shapes) {
    // fully faded out (kept in the list so a scene always has the same shapes)
    if (s.op === 0) continue;
    let paint = paintOf(s.tone, s.shade ?? 0);
    if (s.grad) {
      const gid = `${id}g${grads.length}`;
      grads.push(gradEls(gid, s.grad, defs));
      paint = `url(#${gid})`;
    }
    const at: string[] = [];
    let tag: string = s.k;
    let text: string | undefined;
    switch (s.k) {
      case "line":
        at.push("x1", n(s.a[0]), "y1", n(s.a[1]), "x2", n(s.b[0]), "y2", n(s.b[1]), "stroke", paint, "stroke-width", n(s.w), "stroke-linecap", s.cap ?? "round");
        dash(at, s);
        break;
      case "circle":
        at.push("cx", n(s.c[0]), "cy", n(s.c[1]), "r", n(s.r));
        if (s.fill === false) {
          at.push("fill", "none", "stroke", paint, "stroke-width", n(s.w ?? 1));
          dash(at, s);
        } else {
          at.push("fill", paint);
          outline(at, s);
        }
        break;
      case "ellipse":
        at.push("cx", n(s.c[0]), "cy", n(s.c[1]), "rx", n(s.rx), "ry", n(s.ry));
        rotate(at, s.rot, s.c[0], s.c[1]);
        at.push("fill", paint);
        outline(at, s);
        break;
      case "rect":
        at.push("x", n(s.x), "y", n(s.y), "width", n(s.w), "height", n(s.h), "rx", n(s.rx ?? 0));
        if (s.fill === false) {
          at.push("fill", "none", "stroke", paint, "stroke-width", n(s.sw ?? 0.6));
          dash(at, s);
        } else {
          at.push("fill", paint);
          outline(at, s);
        }
        rotate(at, s.rot, s.cx ?? s.x + s.w / 2, s.cy ?? s.y + s.h / 2);
        break;
      case "path":
        at.push("d", s.d);
        if (s.fill) {
          at.push("fill", paint);
          outline(at, s);
        } else {
          at.push("fill", "none", "stroke", paint, "stroke-width", n(s.w), "stroke-linecap", "round", "stroke-linejoin", "round");
          dash(at, s);
        }
        break;
      case "poly": {
        tag = "polyline";
        let pts = "";
        for (const p of s.pts) pts += (pts ? " " : "") + n(p[0]) + "," + n(p[1]);
        at.push("points", pts, "fill", "none", "stroke", paint, "stroke-width", n(s.w), "stroke-linecap", "round", "stroke-linejoin", "round");
        dash(at, s);
        break;
      }
      case "text":
        at.push("x", n(s.at[0]), "y", n(s.at[1]), "font-size", n(s.size), "font-weight", String(s.weight ?? 700), "text-anchor", s.anchor ?? "middle", "font-family", "var(--body-font)", "fill", paint);
        rotate(at, s.rot, s.at[0], s.at[1]);
        text = s.text;
        break;
    }
    if (s.op !== undefined && s.op < 1) at.push("opacity", n(s.op));
    body.push(text === undefined ? { tag, at } : { tag, at, text });
  }
  return grads.length ? [{ tag: "defs", at: [], kids: grads }, ...defs, ...body] : body;
}

/** A gradient and its stops, appended in document order; returns the gradient. */
function gradEls(id: string, g: Grad, out: El[]): El {
  const at =
    g.kind === "linear"
      ? ["id", id, "gradientUnits", "userSpaceOnUse", "x1", n(g.a[0]), "y1", n(g.a[1]), "x2", n(g.b[0]), "y2", n(g.b[1])]
      : ["id", id, "gradientUnits", "userSpaceOnUse", "cx", n(g.c[0]), "cy", n(g.c[1]), "r", n(g.r), "fx", n((g.f ?? g.c)[0]), "fy", n((g.f ?? g.c)[1])];
  const kids: El[] = [];
  for (const s of g.stops) kids.push({ tag: "stop", at: ["offset", n(s.o), "style", `stop-color:${paintOf(s.tone, s.shade ?? 0)};stop-opacity:${s.op ?? 1}`] });
  const grad: El = { tag: g.kind === "linear" ? "linearGradient" : "radialGradient", at, kids };
  out.push(grad, ...kids);
  return grad;
}

/** Markup for elements in document order (children follow their parent; `kids` mark where they close). */
function markup(els: El[]): string {
  const cur = { i: 0, out: "" };
  while (cur.i < els.length) markupOne(els, cur);
  return cur.out;
}
function markupOne(els: El[], cur: { i: number; out: string }): void {
  const e = els[cur.i++];
  let attrs = "";
  for (let a = 0; a < e.at.length; a += 2) attrs += " " + e.at[a] + '="' + e.at[a + 1] + '"';
  if (e.kids) {
    cur.out += "<" + e.tag + attrs + ">";
    for (let k = 0; k < e.kids.length; k++) markupOne(els, cur);
    cur.out += "</" + e.tag + ">";
  } else cur.out += e.text !== undefined ? "<" + e.tag + attrs + ">" + e.text + "</" + e.tag + ">" : "<" + e.tag + attrs + "/>";
}

/** SVG markup (defs + elements) for a list of shapes. `id` keeps gradient ids unique per picture. */
export function shapesToSvg(shapes: Shape[], id: string): string {
  return markup(shapeEls(shapes, id));
}

const drawn = new WeakMap<Element, { els: El[]; nodes: Element[] }>();

/**
 * Draws shapes into a group that may already hold the previous frame's picture. When the scene
 * has the same elements as before (the usual case while it moves), only the attributes that
 * changed are updated — far less work for the browser than rebuilding the markup every frame,
 * which keeps the animation smooth on phones. Otherwise the group is redrawn from scratch.
 */
export function patchSvg(group: Element, shapes: Shape[], id: string): void {
  const els = shapeEls(shapes, id);
  const prev = drawn.get(group);
  if (!prev || prev.els.length !== els.length || prev.els.some((e, i) => e.tag !== els[i].tag)) {
    group.innerHTML = markup(els);
    drawn.set(group, { els, nodes: Array.from(group.querySelectorAll("*")) });
    return;
  }
  for (let i = 0; i < els.length; i++) {
    const now = els[i].at;
    const was = prev.els[i].at;
    const node = prev.nodes[i];
    let same = now.length === was.length;
    for (let a = 0; same && a < now.length; a += 2) same = now[a] === was[a];
    if (same) {
      // the usual case: the same attributes in the same order, so compare values in place
      for (let a = 1; a < now.length; a += 2) if (now[a] !== was[a]) node.setAttribute(now[a - 1], now[a]);
    } else {
      // an attribute came or went (e.g. an opacity while something fades)
      const old = new Map<string, string>();
      for (let a = 0; a < was.length; a += 2) old.set(was[a], was[a + 1]);
      for (let a = 0; a < now.length; a += 2) {
        if (old.get(now[a]) !== now[a + 1]) node.setAttribute(now[a], now[a + 1]);
        old.delete(now[a]);
      }
      for (const k of old.keys()) node.removeAttribute(k);
    }
    if (els[i].text !== prev.els[i].text) node.textContent = els[i].text ?? "";
  }
  drawn.set(group, { els, nodes: prev.nodes });
}
