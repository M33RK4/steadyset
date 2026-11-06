// Exercise thumbnails as plain images. One demo picture is about 380 SVG elements, so a list of
// live pictures is tens of thousands of elements, built all at once. Here each picture is drawn
// once, in the background, into a small image kept on the device: the list then only has to show
// images, so it opens at once and scrolls smoothly. Images are redrawn for a new palette, body or
// deploy, so they can't go out of date.

import { BUILT_IN_EXERCISES } from "@/lib/data/exercises";
import { musclesFor, type MuscleId } from "@/lib/data/muscles";
import { animationFor } from "./library";
import { withBody } from "./figure";
import { shapesToSvg } from "./render";

type Body = Parameters<typeof withBody>[0];

const BUILD = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
const CACHE = `thumbs-${BUILD}`;
const WIDTH = 640;

const musclesByAnimation = new Map<string, MuscleId[]>();
for (const ex of BUILT_IN_EXERCISES) {
  // cardio and mobility work the whole body: no single muscle to highlight
  if (!musclesByAnimation.has(ex.animation)) musclesByAnimation.set(ex.animation, ex.kind !== "cardio" && ex.kind !== "mobility" ? musclesFor(ex.primaryMuscles) : []);
}

const NO_MUSCLES: MuscleId[] = [];

/** The exercise's main muscles, which glow on the figure as it works. */
export function musclesOf(animation: string): MuscleId[] {
  return musclesByAnimation.get(animation) ?? NO_MUSCLES;
}

/** Which colours are on screen. Figures are drawn with the theme's colours, so images depend on it. */
export function currentPalette(): string {
  const d = document.documentElement.dataset;
  return `${d.theme}-${d.mode}`;
}

const keyOf = (palette: string, body: Body, animation: string) => `${palette}/${body}/${animation}`;

const ready = new Map<string, string>();
export function thumbUrl(palette: string, body: Body, animation: string): string | undefined {
  return ready.get(keyOf(palette, body, animation));
}

type Job = { key: string; palette: string; body: Body; animation: string; waiting: Set<(url: string) => void> };
const queue = new Map<string, Job>();
let running = false;

/**
 * Writes the theme's values into a picture's markup: unlike the page, an image can't read them.
 * They land inside attributes, so a value's own double quotes (font names have them) become single
 * ones: left as they are, they would end the attribute and the image wouldn't load at all.
 */
export function inlineCssVars(markup: string, valueOf: (name: string) => string): string {
  const known = new Map<string, string>();
  return markup.replace(/var\((--[\w-]+)\)/g, (_, name: string) => {
    if (!known.has(name)) known.set(name, valueOf(name).trim().replace(/"/g, "'"));
    return known.get(name)!;
  });
}

function buildSvg(job: Job): string {
  const a = animationFor(job.animation);
  const t = a.frames[a.frames.length > 1 ? 1 : 0].t;
  const shapes = withBody(job.body, () => a.at(t, musclesOf(job.animation)));
  const css = getComputedStyle(document.documentElement);
  const inner = inlineCssVars(shapesToSvg(shapes, "t"), (name) => css.getPropertyValue(name));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${a.viewBox ?? "0 0 200 150"}">${inner}</svg>`;
}

/** Draws the picture into a bitmap, which is far lighter to show than an SVG image. */
async function drawToBlob(src: string, ratio: number): Promise<Blob | null> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = Math.round(WIDTH * ratio);
  canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.9));
}

async function openCache(): Promise<Cache | null> {
  // while developing, animations change without a new deploy: always redraw
  if (BUILD === "dev" || typeof caches === "undefined") return null;
  try {
    return await caches.open(CACHE);
  } catch {
    return null;
  }
}

async function produce(job: Job, cache: Cache | null): Promise<string> {
  const request = `/__thumbs/${job.key}`;
  const hit = await cache?.match(request).catch(() => undefined);
  if (hit) return URL.createObjectURL(await hit.blob());
  const a = animationFor(job.animation);
  const [, , w, h] = (a.viewBox ?? "0 0 200 150").split(" ").map(Number);
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildSvg(job))}`;
  try {
    const blob = await drawToBlob(src, h / w);
    if (!blob) return src;
    void cache?.put(request, new Response(blob)).catch(() => {});
    return URL.createObjectURL(blob);
  } catch {
    return src; // the picture still shows, just as a heavier image
  }
}

const breathe = () =>
  new Promise<void>((resolve) => {
    // a thumbnail someone is waiting to see goes straight away; the rest wait until the app is idle
    if ([...queue.values()].some((j) => j.waiting.size > 0) || typeof requestIdleCallback === "undefined") setTimeout(resolve, 0);
    else requestIdleCallback(() => resolve(), { timeout: 400 });
  });

async function run() {
  if (running) return;
  running = true;
  const cache = await openCache();
  while (queue.size) {
    await breathe();
    // the most recently asked for first: that's what is on screen now
    const list = [...queue.values()];
    const job = list.filter((j) => j.waiting.size > 0).pop() ?? list[0];
    queue.delete(job.key);
    // the theme changed while it waited: its colours are no longer the ones on the page
    if (job.palette !== currentPalette()) continue;
    try {
      const url = await produce(job, cache);
      ready.set(job.key, url);
      job.waiting.forEach((cb) => cb(url));
    } catch {
      /* one picture failing mustn't stop the others */
    }
  }
  running = false;
}

/** Asks for a thumbnail that's about to be seen. Returns a function that withdraws the request. */
export function requestThumb(palette: string, body: Body, animation: string, cb: (url: string) => void): () => void {
  const key = keyOf(palette, body, animation);
  const done = ready.get(key);
  if (done) {
    cb(done);
    return () => {};
  }
  const job = queue.get(key) ?? { key, palette, body, animation, waiting: new Set() };
  // re-added at the end, so it's the next one drawn
  queue.delete(key);
  queue.set(key, job);
  job.waiting.add(cb);
  void run();
  return () => job.waiting.delete(cb);
}

/** Draws every thumbnail while the app is idle, so the library has them ready before it's opened. */
export function prepareThumbs(palette: string, body: Body) {
  for (const animation of musclesByAnimation.keys()) {
    const key = keyOf(palette, body, animation);
    if (!ready.has(key) && !queue.has(key)) queue.set(key, { key, palette, body, animation, waiting: new Set() });
  }
  void run();
}

/** Images from earlier deploys are no longer used. */
export function clearOldThumbs() {
  if (typeof caches === "undefined") return;
  void caches.keys().then((keys) => keys.filter((k) => k.startsWith("thumbs-") && k !== CACHE).forEach((k) => void caches.delete(k))).catch(() => {});
}
