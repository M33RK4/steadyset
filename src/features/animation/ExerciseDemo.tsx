"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { animationFor, type ExerciseAnimation } from "./library";
import { withBody, type Shape } from "./figure";
import { motionRuns, patchSvg, shapesToSvg } from "./render";
import { currentPalette, musclesOf, requestThumb, thumbUrl } from "./thumbs";
import type { MuscleId } from "@/lib/data/muscles";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/primitives";
import { useApp } from "@/lib/store/AppStore";

/** A still picture of the demonstration. */
export function ExerciseFigure({ shapes, viewBox, label }: { shapes: Shape[]; viewBox: string; label?: string }) {
  const id = `f${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const html = useMemo(() => shapesToSvg(shapes, id), [shapes, id]);
  return <svg viewBox={viewBox} className="w-full h-auto block" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} dangerouslySetInnerHTML={{ __html: html }} />;
}

/**
 * The moving picture. Each screen refresh draws the next moment of the repetition straight into
 * the SVG (no React re-render), so the motion stays smooth even with detailed scenes.
 */
function AnimatedFigure({ anim, muscles, playing, viewBox, label }: { anim: ExerciseAnimation; muscles: MuscleId[]; playing: boolean; viewBox: string; label: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const id = `a${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const progress = useRef(0);
  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    // parts that never move are drawn once, in their own groups; each frame only updates the
    // groups that move (same drawing order, so layering is unchanged)
    const runs = motionRuns((t) => anim.at(t, muscles));
    const first = anim.at(progress.current, muscles);
    svg.innerHTML = runs.map(([a, b], r) => `<g>${shapesToSvg(first.slice(a, b), `${id}r${r}`)}</g>`).join("");
    const groups = Array.from(svg.children) as SVGGElement[];
    // each frame only updates what changed (positions and outlines), not the whole picture
    const draw = (t: number) => {
      const shapes = anim.at(t, muscles);
      runs.forEach(([a, b, moves], r) => {
        if (moves) patchSvg(groups[r], shapes.slice(a, b), `${id}r${r}`);
      });
    };
    if (!playing) {
      draw(progress.current);
      return;
    }
    let raf = 0;
    let start: number | null = null;
    const loop = (now: number) => {
      if (start === null) start = now - progress.current * anim.cycle * 1000;
      progress.current = ((now - start) / (anim.cycle * 1000)) % 1;
      draw(progress.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [anim, muscles, playing, id]);
  return <svg ref={ref} viewBox={viewBox} className="w-full h-auto block" role="img" aria-label={label} />;
}

/** An exercise's animation, drawn with the same body as the muscle map (Settings → Exercise body). */
function useBodyAnimation(animation: string, body: "male" | "female"): ExerciseAnimation {
  return useMemo(() => {
    const a = animationFor(animation);
    return { ...a, at: (t, m) => withBody(body, () => a.at(t, m)) };
  }, [animation, body]);
}

// One observer each, shared by every thumbnail in a list.
const paletteWatchers = new Set<() => void>();
let paletteObserver: MutationObserver | null = null;
function watchPalette(cb: () => void) {
  paletteObserver ??= new MutationObserver(() => paletteWatchers.forEach((w) => w()));
  if (!paletteWatchers.size) paletteObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-mode"] });
  paletteWatchers.add(cb);
  return () => {
    paletteWatchers.delete(cb);
    if (!paletteWatchers.size) paletteObserver?.disconnect();
  };
}

const nearScreen = new WeakMap<Element, () => void>();
let nearObserver: IntersectionObserver | null = null;
function whenNearScreen(el: Element, cb: () => void) {
  nearObserver ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        nearObserver?.unobserve(e.target);
        nearScreen.get(e.target)?.();
      }
    },
    { rootMargin: "500px 0px" },
  );
  nearScreen.set(el, cb);
  nearObserver.observe(el);
  return () => nearObserver?.unobserve(el);
}

/** A still picture for lists: a plain image, drawn once and kept (see thumbs.ts). */
function Thumb({ animation, body, label, ratio }: { animation: string; body: "male" | "female"; label: string; ratio: string }) {
  const palette = useSyncExternalStore(watchPalette, currentPalette, () => "");
  const box = useRef<HTMLDivElement>(null);
  const [image, setImage] = useState(() => {
    const src = palette ? thumbUrl(palette, body, animation) : undefined;
    return src ? { src, fresh: false } : null;
  });
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!palette || !box.current) return;
    const src = thumbUrl(palette, body, animation);
    if (src) {
      setImage({ src, fresh: false });
      return;
    }
    let withdraw = () => {};
    const stop = whenNearScreen(box.current, () => {
      withdraw = requestThumb(palette, body, animation, (url) => setImage({ src: url, fresh: true }));
    });
    return () => {
      stop();
      withdraw();
    };
  }, [palette, body, animation]);
  return (
    <div ref={box} style={{ aspectRatio: ratio }}>
      {/* an image that won't load is drawn live instead: never a broken-image icon */}
      {failed ? <LiveStill animation={animation} body={body} label={label} /> : image && <img src={image.src} alt={label} decoding="async" draggable={false} onError={() => setFailed(true)} className={cx("block w-full h-full", image.fresh && "anim-thumb")} />}
    </div>
  );
}

function LiveStill({ animation, body, label }: { animation: string; body: "male" | "female"; label: string }) {
  const anim = useBodyAnimation(animation, body);
  const shapes = useMemo(() => anim.at(anim.frames[anim.frames.length > 1 ? 1 : 0].t, musclesOf(animation)), [anim, animation]);
  return <ExerciseFigure shapes={shapes} viewBox={anim.viewBox ?? "0 0 200 150"} label={label} />;
}

/** Thumbnails show the key position and only animate under a mouse, to keep long lists light. */
function CompactDemo({ animation, name }: { animation: string; name: string }) {
  const { prefs } = useApp();
  const body = prefs.bodyType ?? "female";
  const [hover, setHover] = useState(false);
  const { viewBox = "0 0 200 150", cue } = animationFor(animation);
  const [, , w, h] = viewBox.split(" ");
  const label = `Demonstration of ${name}: ${cue}`;
  return (
    <div className="relative rounded-ctl bg-raised overflow-hidden" onPointerEnter={(e) => e.pointerType === "mouse" && setHover(true)} onPointerLeave={() => setHover(false)}>
      {hover ? <HoverFigure animation={animation} body={body} viewBox={viewBox} label={label} /> : <Thumb animation={animation} body={body} label={label} ratio={`${w} / ${h}`} />}
    </div>
  );
}

function HoverFigure({ animation, body, viewBox, label }: { animation: string; body: "male" | "female"; viewBox: string; label: string }) {
  const anim = useBodyAnimation(animation, body);
  return <AnimatedFigure anim={anim} muscles={musclesOf(animation)} playing viewBox={viewBox} label={label} />;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  const pref = document.documentElement.dataset.motion;
  if (pref === "reduce") return true;
  if (pref === "allow") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/**
 * Looping, original illustrated demonstration of an exercise. Users with reduced motion get the
 * frame-by-frame view (start → finish with a direction cue) and can still press play.
 */
export function ExerciseDemo({ animation, name, compact, bare }: { animation: string; name: string; compact?: boolean; /** just the moving picture: no description or controls */ bare?: boolean }) {
  return compact ? <CompactDemo animation={animation} name={name} /> : <FullDemo animation={animation} name={name} bare={bare} />;
}

function FullDemo({ animation, name, bare }: { animation: string; name: string; bare?: boolean }) {
  const { prefs } = useApp();
  const anim = useBodyAnimation(animation, prefs.bodyType ?? "female");
  const muscles = musclesOf(animation);
  const viewBox = anim.viewBox ?? "0 0 200 150";
  const [playing, setPlaying] = useState(true);
  const [mode, setMode] = useState<"loop" | "frames">("loop");

  useEffect(() => {
    if (prefersReducedMotion()) {
      setPlaying(false);
      setMode("frames");
    }
  }, []);

  const label = `Demonstration of ${name}: ${anim.cue}`;

  return (
    <figure className="rounded-card bg-raised border border-line overflow-hidden">
      {mode === "loop" ? (
        <div className="relative">
          <AnimatedFigure anim={anim} muscles={muscles} playing={playing && animation !== "generic"} viewBox={viewBox} label={label} />
        </div>
      ) : (
        <div className="grid grid-flow-col auto-cols-fr items-center gap-1 p-2" role="group" aria-label={`${name}, step by step`}>
          {anim.frames.map((f, i) => (
            <div key={f.label + i} className="flex items-center gap-1 min-w-0">
              <div className="flex-1 min-w-0">
                <ExerciseFigure shapes={anim.at(f.t, muscles)} viewBox={viewBox} label={`${i + 1}. ${f.label}`} />
                <p className="text-xs text-center text-muted font-semibold mt-1">
                  {i + 1}. {f.label}
                </p>
              </div>
              {i < anim.frames.length - 1 && <Icon name="chevronRight" size={18} className="text-accent-text shrink-0" />}
            </div>
          ))}
        </div>
      )}
      {!bare && <figcaption className="flex items-center gap-2 border-t border-line bg-surface px-3 py-2">
        <p className="flex-1 text-sm text-muted">{anim.cue}</p>
        {mode === "loop" && animation !== "generic" && (
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            className="h-10 w-10 grid place-items-center rounded-ctl hover:bg-raised shrink-0"
            aria-label={playing ? "Pause demonstration" : "Play demonstration"}
          >
            <Icon name={playing ? "pause" : "play"} size={18} />
          </button>
        )}
        {anim.frames.length > 1 && (
          <button
            type="button"
            onClick={() => {
              setMode((m) => (m === "loop" ? "frames" : "loop"));
              if (mode === "frames") setPlaying(true);
            }}
            className={cx("h-10 px-3 rounded-ctl text-sm font-semibold shrink-0 flex items-center gap-1.5", mode === "frames" ? "bg-accent-soft text-accent-text" : "hover:bg-raised")}
            aria-pressed={mode === "frames"}
          >
            <Icon name="frames" size={16} /> Steps
          </button>
        )}
      </figcaption>}
    </figure>
  );
}
