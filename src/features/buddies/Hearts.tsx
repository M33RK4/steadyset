"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { cx } from "@/components/ui/primitives";

export function HeartGlyph({ size = 20, className, filled = true }: { size?: number; className?: string; filled?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <path
        d="M12 20.5s-7.5-4.6-9.2-9.4C1.6 7.6 3.9 4 7.4 4c2 0 3.5 1.1 4.6 2.7C13.1 5.1 14.6 4 16.6 4c3.5 0 5.8 3.6 4.6 7.1-1.7 4.8-9.2 9.4-9.2 9.4z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={filled ? 0 : 1.9}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Hearts floating up the whole screen — shown when a buddy sends one. */
export function HeartShower({ onDone, count = 16 }: { onDone?: () => void; count?: number }) {
  const hearts = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: 6 + Math.random() * 88,
        size: 18 + Math.random() * 30,
        delay: Math.random() * 0.9 + (i % 4) * 0.08,
        duration: 2.4 + Math.random() * 1.4,
        drift: (Math.random() - 0.5) * 140,
        spin: (Math.random() - 0.5) * 70,
        tone: i % 3,
      })),
    [count],
  );
  useEffect(() => {
    if (!onDone) return;
    const t = setTimeout(onDone, 4600);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="fixed inset-0 z-[90] pointer-events-none overflow-hidden" aria-hidden="true">
      {hearts.map((h, i) => (
        <span
          key={i}
          className={cx("absolute bottom-[-60px]", h.tone === 0 ? "text-heart" : h.tone === 1 ? "text-accent" : "text-pop")}
          style={
            {
              left: `${h.left}%`,
              animation: `heart-rise ${h.duration}s cubic-bezier(0.25, 0.6, 0.35, 1) ${h.delay}s both`,
              "--drift": `${h.drift}px`,
              "--spin": `${h.spin}deg`,
              filter: "drop-shadow(0 4px 8px rgb(0 0 0 / 0.12))",
            } as CSSProperties
          }
        >
          <HeartGlyph size={h.size} />
        </span>
      ))}
    </div>
  );
}

/** A little burst of hearts around the button you tapped. */
function Burst() {
  const parts = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const a = (i / 7) * Math.PI * 2 - Math.PI / 2;
        return { dx: Math.cos(a) * 34, dy: Math.sin(a) * 34 - 8, size: 10 + (i % 3) * 3 };
      }),
    [],
  );
  return (
    <span className="absolute left-1/2 top-1/2 pointer-events-none" aria-hidden="true">
      {parts.map((p, i) => (
        <span
          key={i}
          className="absolute left-0 top-0 text-heart"
          style={{ animation: "heart-burst 0.7s ease-out both", "--dx": `${p.dx}px`, "--dy": `${p.dy}px` } as CSSProperties}
        >
          <HeartGlyph size={p.size} />
        </span>
      ))}
    </span>
  );
}

/** Sends a heart to a buddy. `onSend` resolves to whether it went out. */
export function HeartButton({ name, onSend, size = "md" }: { name: string; onSend: () => Promise<boolean>; size?: "sm" | "md" }) {
  const [bursts, setBursts] = useState<number[]>([]);
  const [sent, setSent] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        const id = Date.now();
        setBursts((b) => [...b.slice(-2), id]);
        setTimeout(() => setBursts((b) => b.filter((x) => x !== id)), 800);
        if (await onSend()) {
          setSent(true);
          setTimeout(() => setSent(false), 1600);
        }
      }}
      aria-label={`Send ${name} a heart`}
      className={cx(
        "relative inline-flex items-center justify-center gap-1.5 rounded-btn font-bold btn bg-accent-soft text-heart hover:brightness-[1.04] shrink-0 [--btn-shadow:none]",
        "[[data-theme=summit]_&]:[--btn-shadow:3px_3px_0_var(--edge)]",
        size === "sm" ? "h-10 px-3 text-sm" : "h-12 px-4",
      )}
    >
      <HeartGlyph size={size === "sm" ? 18 : 22} className={cx(sent && "anim-tick")} />
      <span className={cx(size === "sm" && "sr-only sm:not-sr-only")}>{sent ? "Sent" : "Send heart"}</span>
      {bursts.map((b) => (
        <Burst key={b} />
      ))}
    </button>
  );
}
