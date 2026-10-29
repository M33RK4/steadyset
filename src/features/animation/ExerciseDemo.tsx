"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { animationFor, type ExerciseAnimation } from "./library";
import type { Shape } from "./figure";
import { motionRuns, shapesToSvg } from "./render";
import { BUILT_IN_EXERCISES } from "@/lib/data/exercises";
import { musclesFor, type MuscleId } from "@/lib/data/muscles";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/primitives";

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
    // parts that never move are drawn once, in their own groups; each frame only replaces the
    // groups that move (same drawing order, so layering is unchanged)
    const runs = motionRuns((t) => anim.at(t, muscles));
    const first = anim.at(progress.current, muscles);
    svg.innerHTML = runs.map(([a, b], r) => `<g>${shapesToSvg(first.slice(a, b), `${id}r${r}`)}</g>`).join("");
    const groups = Array.from(svg.children) as SVGGElement[];
    const draw = (t: number) => {
      const shapes = anim.at(t, muscles);
      runs.forEach(([a, b, moves], r) => {
        if (moves) groups[r].innerHTML = shapesToSvg(shapes.slice(a, b), `${id}r${r}`);
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

/** The exercise's main muscles, which glow on the figure as it works. */
function useMuscles(animation: string) {
  return useMemo(() => {
    const ex = BUILT_IN_EXERCISES.find((e) => e.animation === animation);
    // cardio and mobility work the whole body: no single muscle to highlight
    return ex && ex.kind !== "cardio" && ex.kind !== "mobility" ? musclesFor(ex.primaryMuscles) : [];
  }, [animation]);
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
export function ExerciseDemo({ animation, name, compact }: { animation: string; name: string; compact?: boolean }) {
  const anim = useMemo(() => animationFor(animation), [animation]);
  const muscles = useMuscles(animation);
  const viewBox = anim.viewBox ?? "0 0 200 150";
  const [playing, setPlaying] = useState(true);
  const [mode, setMode] = useState<"loop" | "frames">("loop");
  const [hover, setHover] = useState(false);
  const keyFrame = anim.frames[anim.frames.length > 1 ? 1 : 0].t;
  const still = useMemo(() => anim.at(keyFrame, muscles), [anim, keyFrame, muscles]);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setPlaying(false);
      if (!compact) setMode("frames");
    }
  }, [compact]);

  const label = `Demonstration of ${name}: ${anim.cue}`;

  if (compact) {
    // Thumbnails show the key position and only animate on hover, to keep long lists light.
    return (
      <div className="relative rounded-ctl bg-raised overflow-hidden" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
        {hover ? <AnimatedFigure anim={anim} muscles={muscles} playing viewBox={viewBox} label={label} /> : <ExerciseFigure shapes={still} viewBox={viewBox} label={label} />}
      </div>
    );
  }

  return (
    <figure className="rounded-card bg-raised border border-line overflow-hidden">
      {mode === "loop" ? (
        <div className="relative">
          <AnimatedFigure anim={anim} muscles={muscles} playing={playing} viewBox={viewBox} label={label} />
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
      <figcaption className="flex items-center gap-2 border-t border-line bg-surface px-3 py-2">
        <p className="flex-1 text-sm text-muted">{anim.cue}</p>
        {mode === "loop" && (
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
      </figcaption>
    </figure>
  );
}
