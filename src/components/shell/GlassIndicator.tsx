"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * A frosted-glass highlight that slides from the previous tab to the current one instead of
 * jumping. It follows the active item every frame while it settles, so it also keeps up with
 * tabs that grow when they become active. It sits inside the positioned list of tabs;
 * `activeKey` is the active item's `data-glass` attribute (null hides the highlight).
 */
export function GlassIndicator({ activeKey, className }: { activeKey: string | null; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const rect = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    // the parent, not a ref: on first mount a parent's ref isn't attached yet when this runs
    const list = el?.parentElement;
    if (!el || !list) return;
    const target = () => {
      const item = activeKey ? list.querySelector<HTMLElement>(`[data-glass="${CSS.escape(activeKey)}"]`) : null;
      if (!item) return null;
      const a = item.getBoundingClientRect();
      const b = list.getBoundingClientRect();
      return { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height };
    };
    const place = (r: { x: number; y: number; w: number; h: number }, squish = 0) => {
      rect.current = r;
      el.style.opacity = "1";
      el.style.width = `${r.w}px`;
      el.style.height = `${r.h}px`;
      // a liquid squash while moving: a little wider and flatter mid-way
      el.style.transform = `translate(${r.x}px, ${r.y}px) scale(${1 + squish * 0.05}, ${1 - squish * 0.035})`;
    };
    const first = target();
    if (!first) {
      el.style.opacity = "0";
      rect.current = null;
      return;
    }
    const reduce = document.documentElement.dataset.motion === "reduce" || (document.documentElement.dataset.motion !== "allow" && matchMedia("(prefers-reduced-motion: reduce)").matches);
    const from = rect.current;
    let raf = 0;
    if (!from || reduce) place(first);
    else {
      const start = performance.now();
      const dur = 520;
      // ease-out with a slight overshoot, like a sliding drop of glass settling
      const ease = (t: number) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / dur);
        const to = target() ?? first;
        const e = ease(t);
        place({ x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, w: from.w + (to.w - from.w) * e, h: from.h + (to.h - from.h) * e }, Math.sin(Math.PI * t));
        raf = t < 1 ? requestAnimationFrame(step) : 0;
      };
      raf = requestAnimationFrame(step);
    }
    // keep it in place when the layout changes (rotation, window resize, labels growing)
    const ro = new ResizeObserver(() => {
      if (raf && rect.current) return;
      const r = target();
      if (r) place(r);
    });
    ro.observe(list);
    list.querySelectorAll("[data-glass]").forEach((n) => ro.observe(n));
    return () => {
      cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
    };
  }, [activeKey]);

  return <span ref={ref} aria-hidden="true" className={`glass-pill pointer-events-none absolute left-0 top-0 opacity-0 ${className ?? ""}`} />;
}
