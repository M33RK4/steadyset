"use client";

import { useEffect, useImperativeHandle, useLayoutEffect, useRef, type Ref, type RefObject } from "react";

/** The curve of a damped spring, for the browser to play: a quick start and a soft, slight settle. */
function springCurve(damping: number, stiffness: number, ms: number): string {
  const wd = stiffness * Math.sqrt(1 - damping * damping);
  const points: string[] = [];
  for (let i = 0; i <= 40; i++) {
    const t = ((i / 40) * ms) / 1000;
    const x = 1 - Math.exp(-damping * stiffness * t) * (Math.cos(wd * t) + ((damping * stiffness) / wd) * Math.sin(wd * t));
    points.push(x.toFixed(4));
  }
  return `linear(${points.join(",")})`;
}

export const SPRING_MS = 560;
export const SPRING = springCurve(0.74, 13, SPRING_MS);

/** Whether the user wants less motion (the setting in the app, or the phone's own). */
export function reducedMotion(): boolean {
  const pref = document.documentElement.dataset.motion;
  return pref === "reduce" || (pref !== "allow" && matchMedia("(prefers-reduced-motion: reduce)").matches);
}

/** For dragging the pill. All positions are its centre, in px from the list's left edge. */
export type GlassHandle = {
  /** Picks the pill up: it swells and narrows to a lens over the tab under it. */
  lift(): void;
  /** Follows the finger. `speed` is in px per ms; the pill stretches with it. */
  moveTo(centre: number, speed: number): void;
  /** Lets go: the pill glides into its tab from wherever it is. */
  drop(): void;
  /** Where its centre is now, on the screen (for grabbing it without a jump). */
  centreOnScreen(): number;
};

/** `cx` is the pill's centre: it's anchored there, so changing its width never moves it. */
type Rect = { cx: number; y: number; w: number; h: number };

/** How wide the pill is while held, so it clearly sits over one tab at a time. */
const LENS_WIDTH = 76;
const LENS_HEIGHT = 48;

// The glass: how much of its edge curves away, how far that bends the light (px), the zoom in the
// middle (as a share), and the furthest the map can move anything (px, there and back).
const RIM_WIDTH = 13;
const RIM_BEND = 10;
const MAGNIFY = 0.18;
const LENS_RANGE = 48;

/**
 * What the held pill does to whatever is under it, as a displacement map: each pixel says where the
 * glass takes its light from. Across the middle it magnifies a little, like a bead of glass; around
 * the rim, where the surface curves away, it bends strongly inward.
 */
function lensMap(w: number, h: number): string {
  const px = 2; // finer than the screen's CSS pixels, so the bending stays smooth
  const canvas = document.createElement("canvas");
  canvas.width = w * px;
  canvas.height = h * px;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const image = ctx.createImageData(canvas.width, canvas.height);
  const r = h / 2;
  for (let j = 0; j < canvas.height; j++) {
    for (let i = 0; i < canvas.width; i++) {
      const x = (i + 0.5) / px - w / 2;
      const y = (j + 0.5) / px - h / 2;
      // distance in from the capsule's edge, and the direction out towards it
      const along = Math.max(0, Math.abs(x) - (w / 2 - r));
      const len = Math.hypot(along, y) || 1;
      const depth = Math.max(0, r - len);
      const rim = Math.pow(1 - Math.min(1, depth / RIM_WIDTH), 2) * RIM_BEND;
      const dx = -((along / len) * Math.sign(x)) * rim - x * MAGNIFY;
      const dy = -(y / len) * rim - y * MAGNIFY;
      const at = (j * canvas.width + i) * 4;
      image.data[at] = 127.5 + (dx / LENS_RANGE) * 255;
      image.data[at + 1] = 127.5 + (dy / LENS_RANGE) * 255;
      image.data[at + 2] = 128;
      image.data[at + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

/**
 * The SVG filter behind the held pill's glass. Bending what's behind an element this way only works
 * in Chromium (so in the Android app and Chrome): other browsers keep a tinted pill and a swelling icon.
 */
function GlassLens({ pill }: { pill: RefObject<HTMLSpanElement | null> }) {
  const image = useRef<SVGFEImageElement>(null);
  useEffect(() => {
    if (!/Chrom(e|ium)\//.test(navigator.userAgent) || !CSS.supports("backdrop-filter", "url(#a)")) return;
    const map = lensMap(LENS_WIDTH, LENS_HEIGHT);
    if (!map) return;
    image.current?.setAttribute("href", map);
    pill.current?.parentElement?.toggleAttribute("data-refract", true);
  }, [pill]);
  return (
    <svg aria-hidden="true" className="absolute size-0">
      <filter id="glass-lens" x="0" y="0" width={LENS_WIDTH} height={LENS_HEIGHT} filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
        <feImage ref={image} x="0" y="0" width={LENS_WIDTH} height={LENS_HEIGHT} preserveAspectRatio="none" result="map" />
        <feDisplacementMap in="SourceGraphic" in2="map" scale={LENS_RANGE} xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  );
}

/**
 * A frosted-glass highlight that slides from the previous tab to the current one instead of
 * jumping. It sits inside the positioned list of tabs; `activeKey` is the active item's
 * `data-glass` attribute (null hides the highlight).
 *
 * The slide only animates `translate` and `scale`, which the browser runs off the main thread: it
 * stays perfectly smooth even while the next screen is being built underneath it.
 */
export function GlassIndicator({ activeKey, handle }: { activeKey: string | null; handle?: Ref<GlassHandle> }) {
  const ref = useRef<HTMLSpanElement>(null);
  const rest = useRef<Rect | null>(null);
  const keyRef = useRef(activeKey);
  keyRef.current = activeKey;
  const held = useRef(false);

  const target = (): Rect | null => {
    const list = ref.current?.parentElement;
    const key = keyRef.current;
    if (!list || !key) return null;
    const item = list.querySelector<HTMLElement>(`[data-glass="${CSS.escape(key)}"]`);
    if (!item) return null;
    const a = item.getBoundingClientRect();
    const b = list.getBoundingClientRect();
    // from inside the list's border, where the pill's own position counts from
    return { cx: a.left - b.left - list.clientLeft + a.width / 2, y: a.top - b.top - list.clientTop, w: a.width, h: a.height };
  };

  const setWidth = (el: HTMLElement, w: number) => {
    el.style.width = `${w}px`;
    el.style.marginLeft = `${-w / 2}px`;
  };

  const place = (r: Rect) => {
    const el = ref.current!;
    rest.current = r;
    setWidth(el, r.w);
    el.style.height = `${r.h}px`;
    el.style.translate = `${r.cx}px ${r.y}px`;
    el.style.opacity = "1";
  };

  /** Where the pill looks to be right now, mid-animation or not. */
  const onScreen = (): Rect | null => {
    const el = ref.current;
    const r = rest.current;
    if (!el || !r) return null;
    const cs = getComputedStyle(el);
    const [cx = r.cx, y = r.y] = cs.translate === "none" ? [] : cs.translate.split(" ").map(parseFloat);
    const [sx = 1, sy = sx] = cs.scale === "none" ? [] : cs.scale.split(" ").map(parseFloat);
    return { cx, y, w: (parseFloat(cs.width) || r.w) * sx, h: (parseFloat(cs.height) || r.h) * sy };
  };

  const slide = () => {
    const el = ref.current;
    if (!el) return;
    const to = target();
    if (!to) {
      el.style.opacity = "0";
      rest.current = null;
      return;
    }
    const from = onScreen();
    el.getAnimations().forEach((a) => a.cancel());
    el.style.scale = "";
    place(to);
    if (!from || reducedMotion()) return;
    const dx = from.cx - to.cx;
    if (Math.abs(dx) < 0.5 && Math.abs(from.w - to.w) < 0.5 && Math.abs(from.h - to.h) < 0.5) return;
    const moves = Math.min(1, Math.abs(dx) / 120);
    try {
      el.animate([{ translate: `${from.cx}px ${to.y}px` }, { translate: `${to.cx}px ${to.y}px` }], { duration: SPRING_MS, easing: SPRING });
      // starts at the size it had, then a liquid squash on the way: a little wider and flatter mid-way
      el.animate(
        [
          { scale: `${from.w / to.w} ${from.h / to.h}` },
          { scale: `${1 + 0.07 * moves} ${1 - 0.05 * moves}`, offset: 0.32 },
          { scale: "1 1" },
        ],
        { duration: SPRING_MS * 0.8, easing: "cubic-bezier(0.3, 0.7, 0.3, 1)" },
      );
    } catch {
      /* no spring curves in this browser: it simply arrives */
    }
  };

  useLayoutEffect(slide, [activeKey]);

  // keep it in place when the layout changes (rotation, window resize)
  useLayoutEffect(() => {
    const list = ref.current?.parentElement;
    if (!list) return;
    const ro = new ResizeObserver(() => {
      const el = ref.current;
      if (!el || held.current || !rest.current || el.getAnimations().some((a) => a.playState === "running")) return;
      const r = target();
      if (r) place(r);
    });
    ro.observe(list);
    return () => ro.disconnect();
  }, []);

  useImperativeHandle(handle, () => ({
    lift() {
      const el = ref.current;
      const from = onScreen();
      if (!el || !from) return;
      el.getAnimations().forEach((a) => a.cancel());
      held.current = true;
      el.style.translate = `${from.cx}px ${from.y}px`;
      rest.current = { ...from, w: LENS_WIDTH };
      // the stylesheet eases the width and the swell while it's held
      el.dataset.held = "";
      setWidth(el, LENS_WIDTH);
    },
    moveTo(centre, speed) {
      const el = ref.current;
      const list = el?.parentElement;
      if (!el || !list || !rest.current) return;
      const half = LENS_WIDTH / 2;
      const cx = Math.max(4 + half, Math.min(list.clientWidth - 4 - half, centre - list.clientLeft));
      rest.current = { ...rest.current, cx };
      el.style.translate = `${cx}px ${rest.current.y}px`;
      // stretches along the way it's moving, the faster the more, like a drop of liquid
      const stretch = Math.min(0.16, Math.abs(speed) * 0.09);
      el.style.scale = `${1.08 + stretch} ${1.14 - stretch * 0.7}`;
    },
    drop() {
      const el = ref.current;
      if (!el) return;
      const from = onScreen();
      held.current = false;
      delete el.dataset.held;
      if (from) rest.current = from;
      slide();
    },
    centreOnScreen() {
      const b = ref.current?.getBoundingClientRect();
      return b ? b.left + b.width / 2 : 0;
    },
  }));

  return (
    <>
      <span ref={ref} aria-hidden="true" className="glass-pill pointer-events-none absolute left-0 top-0 opacity-0" />
      {handle && <GlassLens pill={ref} />}
    </>
  );
}
