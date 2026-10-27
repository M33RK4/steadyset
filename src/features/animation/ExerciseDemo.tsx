"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { animationFor } from "./library";
import type { Shape, Tone } from "./figure";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/primitives";

const TONE: Record<Tone, string> = {
  near: "var(--ink)",
  far: "color-mix(in srgb, var(--ink) 38%, var(--surface))",
  prop: "color-mix(in srgb, var(--muted) 45%, var(--surface))",
  propSoft: "color-mix(in srgb, var(--muted) 25%, var(--surface))",
  accent: "var(--accent)",
  guide: "var(--accent)",
  floor: "var(--line)",
};

function ShapeEl({ s }: { s: Shape }) {
  const c = TONE[s.tone];
  switch (s.k) {
    case "line":
      return <line x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} stroke={c} strokeWidth={s.w} strokeLinecap="round" strokeDasharray={s.dash} />;
    case "circle":
      return s.fill ? <circle cx={s.c[0]} cy={s.c[1]} r={s.r} fill={c} /> : <circle cx={s.c[0]} cy={s.c[1]} r={s.r} fill="none" stroke={c} strokeWidth={s.w ?? 2} />;
    case "rect":
      return <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={s.rx ?? 0} fill={c} />;
    case "path":
      return <path d={s.d} fill={s.fill ? c : "none"} stroke={c} strokeWidth={s.w} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={s.dash} />;
    case "poly":
      return <polyline points={s.pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={c} strokeWidth={s.w} strokeLinecap="round" strokeLinejoin="round" />;
  }
}

function Figure({ shapes, viewBox, label }: { shapes: Shape[]; viewBox: string; label?: string }) {
  return (
    <svg viewBox={viewBox} className="w-full h-auto block" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {shapes.map((s, i) => (
        <ShapeEl key={i} s={s} />
      ))}
    </svg>
  );
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
  const viewBox = anim.viewBox ?? "0 0 200 150";
  const [playing, setPlaying] = useState(true);
  const [mode, setMode] = useState<"loop" | "frames">("loop");
  const [t, setT] = useState(0);
  const [hover, setHover] = useState(false);
  const start = useRef<number | null>(null);
  const offset = useRef(0);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setPlaying(false);
      if (!compact) setMode("frames");
    }
  }, [compact]);

  useEffect(() => {
    if (compact ? !hover : !playing || mode !== "loop") return;
    let raf = 0;
    let last = 0;
    start.current = null;
    const loop = (now: number) => {
      if (start.current === null) start.current = now - offset.current * anim.cycle * 1000;
      if (now - last > 30) {
        last = now;
        const tt = ((now - start.current) / (anim.cycle * 1000)) % 1;
        offset.current = tt;
        setT(tt);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, mode, anim, compact, hover]);

  const label = `Demonstration of ${name}: ${anim.cue}`;

  if (compact) {
    // Thumbnails show the key position and only animate on hover, to keep long lists light.
    return (
      <div className="relative rounded-ctl bg-raised overflow-hidden" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
        <Figure shapes={anim.at(hover ? t : anim.frames[anim.frames.length > 1 ? 1 : 0].t)} viewBox={viewBox} label={label} />
      </div>
    );
  }

  return (
    <figure className="rounded-card bg-raised border border-line overflow-hidden">
      {mode === "loop" ? (
        <div className="relative">
          <Figure shapes={anim.at(t)} viewBox={viewBox} label={label} />
        </div>
      ) : (
        <div className="grid grid-flow-col auto-cols-fr items-center gap-1 p-2" role="group" aria-label={`${name}, step by step`}>
          {anim.frames.map((f, i) => (
            <div key={f.label} className="flex items-center gap-1 min-w-0">
              <div className="flex-1 min-w-0">
                <Figure shapes={anim.at(f.t)} viewBox={viewBox} label={`${i + 1}. ${f.label}`} />
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
