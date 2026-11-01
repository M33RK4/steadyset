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

/** One SVG element: tag, attributes in order, and child elements (gradient stops) or text. */
interface El {
  tag: string;
  at: [string, string][];
  kids?: El[];
  text?: string;
}

/** The SVG elements (a <defs> of gradients first, if any) for a list of shapes. */
function shapeEls(shapes: Shape[], id: string): El[] {
  const defs: El[] = [];
  const body: El[] = [];
  for (const s of shapes) {
    // fully faded out (kept in the list so a scene always has the same shapes)
    if (s.op === 0) continue;
    let paint = shade(s.tone, s.shade ?? 0);
    if (s.grad) {
      const gid = `${id}g${defs.length}`;
      defs.push(gradEl(gid, s.grad));
      paint = `url(#${gid})`;
    }
    const op: [string, string][] = s.op !== undefined && s.op < 1 ? [["opacity", n(s.op)]] : [];
    const outline: [string, string][] = s.stroke ? [["stroke", shade(s.stroke, s.strokeShade ?? 0)], ["stroke-width", n(s.sw ?? 0.6)], ["stroke-linejoin", "round"]] : [];
    const dash: [string, string][] = "dash" in s && s.dash ? [["stroke-dasharray", s.dash]] : [];
    const rotate = (r: number | undefined, x: number, y: number): [string, string][] => (r ? [["transform", `rotate(${n(r)} ${n(x)} ${n(y)})`]] : []);
    const round: [string, string][] = [["stroke-linecap", "round"], ["stroke-linejoin", "round"]];
    switch (s.k) {
      case "line":
        body.push({ tag: "line", at: [["x1", n(s.a[0])], ["y1", n(s.a[1])], ["x2", n(s.b[0])], ["y2", n(s.b[1])], ["stroke", paint], ["stroke-width", n(s.w)], ["stroke-linecap", s.cap ?? "round"], ...dash, ...op] });
        break;
      case "circle": {
        const c: [string, string][] = [["cx", n(s.c[0])], ["cy", n(s.c[1])], ["r", n(s.r)]];
        body.push({ tag: "circle", at: s.fill === false ? [...c, ["fill", "none"], ["stroke", paint], ["stroke-width", n(s.w ?? 1)], ...dash, ...op] : [...c, ["fill", paint], ...outline, ...op] });
        break;
      }
      case "ellipse":
        body.push({ tag: "ellipse", at: [["cx", n(s.c[0])], ["cy", n(s.c[1])], ["rx", n(s.rx)], ["ry", n(s.ry)], ...rotate(s.rot, s.c[0], s.c[1]), ["fill", paint], ...outline, ...op] });
        break;
      case "rect": {
        const r: [string, string][] = [["x", n(s.x)], ["y", n(s.y)], ["width", n(s.w)], ["height", n(s.h)], ["rx", n(s.rx ?? 0)]];
        const tr = rotate(s.rot, s.cx ?? s.x + s.w / 2, s.cy ?? s.y + s.h / 2);
        body.push({ tag: "rect", at: s.fill === false ? [...r, ["fill", "none"], ["stroke", paint], ["stroke-width", n(s.sw ?? 0.6)], ...dash, ...tr, ...op] : [...r, ["fill", paint], ...outline, ...tr, ...op] });
        break;
      }
      case "path":
        body.push({ tag: "path", at: s.fill ? [["d", s.d], ["fill", paint], ...outline, ...op] : [["d", s.d], ["fill", "none"], ["stroke", paint], ["stroke-width", n(s.w)], ...round, ...dash, ...op] });
        break;
      case "poly":
        body.push({ tag: "polyline", at: [["points", s.pts.map((p) => `${n(p[0])},${n(p[1])}`).join(" ")], ["fill", "none"], ["stroke", paint], ["stroke-width", n(s.w)], ...round, ...dash, ...op] });
        break;
      case "text":
        body.push({
          tag: "text",
          at: [["x", n(s.at[0])], ["y", n(s.at[1])], ["font-size", n(s.size)], ["font-weight", String(s.weight ?? 700)], ["text-anchor", s.anchor ?? "middle"], ["font-family", "var(--body-font)"], ["fill", paint], ...rotate(s.rot, s.at[0], s.at[1]), ...op],
          text: s.text,
        });
        break;
    }
  }
  return defs.length ? [{ tag: "defs", at: [], kids: defs }, ...body] : body;
}

function gradEl(id: string, g: Grad): El {
  const kids = g.stops.map((s): El => ({ tag: "stop", at: [["offset", n(s.o)], ["style", `stop-color:${shade(s.tone, s.shade ?? 0)};stop-opacity:${s.op ?? 1}`]] }));
  const units: [string, string] = ["gradientUnits", "userSpaceOnUse"];
  if (g.kind === "linear") return { tag: "linearGradient", at: [["id", id], units, ["x1", n(g.a[0])], ["y1", n(g.a[1])], ["x2", n(g.b[0])], ["y2", n(g.b[1])]], kids };
  const f = g.f ?? g.c;
  return { tag: "radialGradient", at: [["id", id], units, ["cx", n(g.c[0])], ["cy", n(g.c[1])], ["r", n(g.r)], ["fx", n(f[0])], ["fy", n(f[1])]], kids };
}

const markup = (e: El): string => {
  const attrs = e.at.map(([k, v]) => ` ${k}="${v}"`).join("");
  if (e.kids) return `<${e.tag}${attrs}>${e.kids.map(markup).join("")}</${e.tag}>`;
  return e.text !== undefined ? `<${e.tag}${attrs}>${e.text}</${e.tag}>` : `<${e.tag}${attrs}/>`;
};

/** SVG markup (defs + elements) for a list of shapes. `id` keeps gradient ids unique per picture. */
export function shapesToSvg(shapes: Shape[], id: string): string {
  return shapeEls(shapes, id).map(markup).join("");
}

/** Elements in document order (each gradient followed by its stops), as querySelectorAll lists them. */
const flat = (els: El[]): El[] => els.flatMap((e) => [e, ...(e.kids ? flat(e.kids) : [])]);

const drawn = new WeakMap<Element, { els: El[]; nodes: Element[] }>();

/**
 * Draws shapes into a group that may already hold the previous frame's picture. When the scene
 * has the same elements as before (the usual case while it moves), only the attributes that
 * changed are updated — far less work for the browser than rebuilding the markup every frame,
 * which keeps the animation smooth on phones. Otherwise the group is redrawn from scratch.
 */
export function patchSvg(group: Element, shapes: Shape[], id: string): void {
  const els = flat(shapeEls(shapes, id));
  const prev = drawn.get(group);
  if (!prev || prev.els.length !== els.length || prev.els.some((e, i) => e.tag !== els[i].tag)) {
    group.innerHTML = shapesToSvg(shapes, id);
    drawn.set(group, { els, nodes: Array.from(group.querySelectorAll("*")) });
    return;
  }
  els.forEach((e, i) => {
    const before = prev.els[i];
    const node = prev.nodes[i];
    for (const [k, v] of e.at) if (before.at.find((x) => x[0] === k)?.[1] !== v) node.setAttribute(k, v);
    for (const [k] of before.at) if (!e.at.some((x) => x[0] === k)) node.removeAttribute(k);
    if (e.text !== before.text) node.textContent = e.text ?? "";
  });
  drawn.set(group, { els, nodes: prev.nodes });
}
