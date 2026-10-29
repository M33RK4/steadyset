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

function gradSvg(id: string, g: Grad): string {
  const stops = g.stops.map((s) => `<stop offset="${n(s.o)}" style="stop-color:${shade(s.tone, s.shade ?? 0)};stop-opacity:${s.op ?? 1}"/>`).join("");
  if (g.kind === "linear") return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${n(g.a[0])}" y1="${n(g.a[1])}" x2="${n(g.b[0])}" y2="${n(g.b[1])}">${stops}</linearGradient>`;
  const f = g.f ?? g.c;
  return `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${n(g.c[0])}" cy="${n(g.c[1])}" r="${n(g.r)}" fx="${n(f[0])}" fy="${n(f[1])}">${stops}</radialGradient>`;
}

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

/** SVG markup (defs + elements) for a list of shapes. `id` keeps gradient ids unique per picture. */
export function shapesToSvg(shapes: Shape[], id: string): string {
  let defs = "";
  let body = "";
  let gi = 0;
  for (const s of shapes) {
    let paint = shade(s.tone, s.shade ?? 0);
    if (s.grad) {
      const gid = `${id}g${gi++}`;
      defs += gradSvg(gid, s.grad);
      paint = `url(#${gid})`;
    }
    const op = s.op !== undefined && s.op < 1 ? ` opacity="${n(s.op)}"` : "";
    const outline = s.stroke ? ` stroke="${shade(s.stroke, s.strokeShade ?? 0)}" stroke-width="${n(s.sw ?? 0.6)}" stroke-linejoin="round"` : "";
    switch (s.k) {
      case "line":
        body += `<line x1="${n(s.a[0])}" y1="${n(s.a[1])}" x2="${n(s.b[0])}" y2="${n(s.b[1])}" stroke="${paint}" stroke-width="${n(s.w)}" stroke-linecap="${s.cap ?? "round"}"${s.dash ? ` stroke-dasharray="${s.dash}"` : ""}${op}/>`;
        break;
      case "circle":
        body += s.fill === false
          ? `<circle cx="${n(s.c[0])}" cy="${n(s.c[1])}" r="${n(s.r)}" fill="none" stroke="${paint}" stroke-width="${n(s.w ?? 1)}"${s.dash ? ` stroke-dasharray="${s.dash}"` : ""}${op}/>`
          : `<circle cx="${n(s.c[0])}" cy="${n(s.c[1])}" r="${n(s.r)}" fill="${paint}"${outline}${op}/>`;
        break;
      case "ellipse":
        body += `<ellipse cx="${n(s.c[0])}" cy="${n(s.c[1])}" rx="${n(s.rx)}" ry="${n(s.ry)}"${s.rot ? ` transform="rotate(${n(s.rot)} ${n(s.c[0])} ${n(s.c[1])})"` : ""} fill="${paint}"${outline}${op}/>`;
        break;
      case "rect": {
        const tr = s.rot ? ` transform="rotate(${n(s.rot)} ${n(s.cx ?? s.x + s.w / 2)} ${n(s.cy ?? s.y + s.h / 2)})"` : "";
        body += s.fill === false
          ? `<rect x="${n(s.x)}" y="${n(s.y)}" width="${n(s.w)}" height="${n(s.h)}" rx="${n(s.rx ?? 0)}" fill="none" stroke="${paint}" stroke-width="${n(s.sw ?? 0.6)}"${s.dash ? ` stroke-dasharray="${s.dash}"` : ""}${tr}${op}/>`
          : `<rect x="${n(s.x)}" y="${n(s.y)}" width="${n(s.w)}" height="${n(s.h)}" rx="${n(s.rx ?? 0)}" fill="${paint}"${outline}${tr}${op}/>`;
        break;
      }
      case "path":
        body += s.fill
          ? `<path d="${s.d}" fill="${paint}"${outline}${op}/>`
          : `<path d="${s.d}" fill="none" stroke="${paint}" stroke-width="${n(s.w)}" stroke-linecap="round" stroke-linejoin="round"${s.dash ? ` stroke-dasharray="${s.dash}"` : ""}${op}/>`;
        break;
      case "poly":
        body += `<polyline points="${s.pts.map((p) => `${n(p[0])},${n(p[1])}`).join(" ")}" fill="none" stroke="${paint}" stroke-width="${n(s.w)}" stroke-linecap="round" stroke-linejoin="round"${s.dash ? ` stroke-dasharray="${s.dash}"` : ""}${op}/>`;
        break;
      case "text":
        body += `<text x="${n(s.at[0])}" y="${n(s.at[1])}" font-size="${n(s.size)}" font-weight="${s.weight ?? 700}" text-anchor="${s.anchor ?? "middle"}" font-family="var(--body-font)" fill="${paint}"${s.rot ? ` transform="rotate(${n(s.rot)} ${n(s.at[0])} ${n(s.at[1])})"` : ""}${op}>${s.text}</text>`;
        break;
    }
  }
  return defs ? `<defs>${defs}</defs>${body}` : body;
}
