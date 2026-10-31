"use client";

import { useId } from "react";
import { useApp } from "@/lib/store/AppStore";
import { cx } from "./primitives";

// Decorative illustrations for the two themes, drawn in SVG and coloured with theme tokens so
// the light and dark variants follow automatically. All of it is aria-hidden.

// ---------------------------------------------------------------- Lily

const PETAL = "M0 0 C 10 -8, 14 -27, 0 -50 C -14 -27, -10 -8, 0 0 Z";
const PETAL_SHADE = "M0 0 C 6 -6, 7 -17, 0 -29 C -7 -17, -6 -6, 0 0 Z";

/** A star lily seen from above: six tepals, a pale throat and six gold-tipped stamens. */
export function LilyFlower({ x = 0, y = 0, scale = 1, rotate = 0 }: { x?: number; y?: number; scale?: number; rotate?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`}>
      {[0, 60, 120, 180, 240, 300].map((a, i) => (
        <g key={a} transform={`rotate(${a}) scale(${i % 2 ? 0.88 : 1})`}>
          <path d={PETAL} fill="var(--petal)" stroke="var(--petal-line)" strokeWidth="1.1" strokeLinejoin="round" />
          <path d={PETAL_SHADE} fill="var(--petal-shade)" opacity="0.85" />
          <path d="M0 -5 C 1 -18, 1 -30, 0 -40" fill="none" stroke="var(--petal-line)" strokeWidth="0.8" opacity="0.55" />
        </g>
      ))}
      {[30, 90, 150, 210, 270, 330].map((a) => (
        <g key={a} transform={`rotate(${a})`}>
          <path d="M0 0 C 1.5 -8, 1 -16, 0 -23" fill="none" stroke="var(--stem)" strokeWidth="1" />
          <ellipse cx="0" cy="-24.5" rx="1.8" ry="3.4" fill="var(--stamen)" />
        </g>
      ))}
      <circle r="4" fill="var(--petal-shade)" stroke="var(--petal-line)" strokeWidth="0.8" />
    </g>
  );
}

function LilyBud({ x, y, rotate = 0, scale = 1 }: { x: number; y: number; rotate?: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`}>
      <path d="M0 0 C 8 -8, 9 -26, 0 -42 C -9 -26, -8 -8, 0 0 Z" fill="var(--petal)" stroke="var(--petal-line)" strokeWidth="1.1" />
      <path d="M0 -3 C 2 -16, 2 -28, 0 -38" fill="none" stroke="var(--petal-line)" strokeWidth="0.8" opacity="0.6" />
    </g>
  );
}

function Leaf({ d }: { d: string }) {
  return <path d={d} fill="var(--leaf)" stroke="var(--stem)" strokeWidth="1" strokeLinejoin="round" />;
}

/** A spray of lilies on curved stems — sits in the corner of hero cards. */
export function LilySpray({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 240" className={className} aria-hidden="true" focusable="false">
      <g className="anim-sway">
        <path d="M232 240 C 200 190, 170 150, 138 104" fill="none" stroke="var(--stem)" strokeWidth="3" strokeLinecap="round" />
        <path d="M232 240 C 170 220, 110 200, 70 160" fill="none" stroke="var(--stem)" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M190 178 C 196 120, 200 80, 202 48" fill="none" stroke="var(--stem)" strokeWidth="2.2" strokeLinecap="round" />
        <Leaf d="M210 214 C 180 196, 168 172, 176 150 C 192 168, 204 188, 210 214 Z" />
        <Leaf d="M150 200 C 120 206, 96 196, 86 180 C 110 180, 132 186, 150 200 Z" />
        <Leaf d="M196 120 C 214 108, 222 90, 220 74 C 206 86, 198 102, 196 120 Z" />
        <LilyBud x={202} y={52} rotate={8} scale={0.9} />
        <LilyFlower x={138} y={100} scale={1.25} rotate={12} />
        <LilyFlower x={70} y={158} scale={0.85} rotate={-20} />
      </g>
    </svg>
  );
}

// ---------------------------------------------------------------- Summit

/** Three layered mountain ridges under a brass sun (a pale moon in dark mode). */
export function Ridge({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 140" preserveAspectRatio="xMidYMax slice" className={className} aria-hidden="true" focusable="false">
      <circle cx="318" cy="44" r="17" fill="var(--sun)" />
      <path d="M0 104 L34 78 L62 92 L110 50 L150 82 L196 58 L236 86 L292 40 L340 74 L372 60 L400 70 L400 140 L0 140 Z" fill="var(--ridge-far)" />
      <path d="M0 118 L48 92 L86 108 L142 70 L178 98 L226 76 L270 106 L318 82 L366 104 L400 92 L400 140 L0 140 Z" fill="var(--ridge-mid)" />
      <path d="M0 134 L56 112 L104 126 L160 100 L214 124 L262 108 L320 130 L370 116 L400 124 L400 140 L0 140 Z" fill="var(--ridge-near)" />
      <path d="M110 50 L120 60 L114 59 L106 64 L100 59 Z M292 40 L302 50 L296 49 L288 54 L282 50 Z" fill="var(--surface)" opacity="0.85" />
    </svg>
  );
}

/** Contour lines like a topographic map; wobbly rings around a few summits. */
function contourPath(cx: number, cy: number, r: number, seed: number) {
  const pts: string[] = [];
  const steps = 48;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const w = 1 + 0.12 * Math.sin(a * 3 + seed) + 0.07 * Math.sin(a * 5 + seed * 2.3) + 0.04 * Math.cos(a * 7 + seed);
    pts.push(`${(cx + Math.cos(a) * r * w).toFixed(1)} ${(cy + Math.sin(a) * r * 0.78 * w).toFixed(1)}`);
  }
  return `M${pts.join(" L")}Z`;
}

const TOPO_PATHS = [
  ...Array.from({ length: 9 }, (_, k) => contourPath(180, 160, 34 + k * 34, 1.7)),
  ...Array.from({ length: 7 }, (_, k) => contourPath(1180, 620, 30 + k * 38, 4.2)),
  ...Array.from({ length: 5 }, (_, k) => contourPath(760, 90, 24 + k * 30, 2.9)),
];

export function Topo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 1400 900" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden="true" focusable="false">
      <g fill="none" stroke="var(--topo)" strokeWidth="1.2">
        {TOPO_PATHS.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </svg>
  );
}

// ---------------------------------------------------------------- theme-aware pieces

/** Fixed, faint decoration behind every page. */
export function Backdrop() {
  const { prefs } = useApp();
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden="true">
      <div className="absolute inset-0" style={{ background: "radial-gradient(60% 50% at 85% 0%, var(--bg-glow) 0%, transparent 70%), radial-gradient(50% 40% at 0% 100%, var(--bg-glow) 0%, transparent 70%)" }} />
      {prefs.theme === "lily" ? (
        <>
          {/* large sprays that fill the screen: one rising from the bottom right, one hanging from the top left */}
          <LilySpray className="absolute -right-[14vw] -bottom-[4vh] w-[118vw] max-w-[900px] opacity-50" />
          <div className="absolute -left-[22vw] -top-[2vh] w-[86vw] max-w-[640px] rotate-180 opacity-25">
            <LilySpray className="w-full" />
          </div>
          <svg viewBox="-60 -60 120 120" className="absolute top-[42%] right-[6%] w-28 md:w-40 opacity-30">
            <LilyFlower scale={1} rotate={40} />
          </svg>
        </>
      ) : (
        <Topo className="absolute inset-0 w-full h-full opacity-[0.07]" />
      )}
    </div>
  );
}

/** Illustration placed in the corner / along the bottom of hero cards. */
export function HeroArt({ className }: { className?: string }) {
  const { prefs } = useApp();
  return prefs.theme === "lily" ? (
    <LilySpray className={cx("hero-art absolute -right-6 -bottom-8 w-56 md:w-72 pointer-events-none", className)} />
  ) : (
    <Ridge className={cx("hero-art absolute inset-x-0 bottom-0 h-24 md:h-28 w-full pointer-events-none", className)} />
  );
}

/**
 * A small lily spray that rests on the top corner of the workout card in the Lily theme, so the
 * flowers stay visible on phones where the cards cover the whole background.
 */
export function CardFlower() {
  const { prefs } = useApp();
  if (prefs.theme !== "lily") return null;
  return (
    <svg viewBox="-70 -46 140 92" className="absolute -top-9 -right-3 w-28 sm:w-32 z-10 pointer-events-none drop-shadow-[0_4px_6px_rgb(0_0_0_/_0.12)]" aria-hidden="true">
      <g className="anim-sway">
        <path d="M40,40 C26,26 6,14 -18,8" fill="none" stroke="var(--stem)" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M40,40 C38,18 32,0 24,-14" fill="none" stroke="var(--stem)" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M30,26 C16,30 4,26 -2,18 C12,16 22,18 30,26 Z" fill="var(--leaf)" stroke="var(--stem)" strokeWidth="1" />
        <path d="M37,22 C46,10 48,-2 44,-10 C38,-2 36,10 37,22 Z" fill="var(--leaf)" stroke="var(--stem)" strokeWidth="1" />
        <g transform="translate(24 -16) rotate(18) scale(0.75)">
          <path d="M0 0 C 8 -8, 9 -26, 0 -42 C -9 -26, -8 -8, 0 0 Z" fill="var(--petal)" stroke="var(--petal-line)" strokeWidth="1.2" />
        </g>
        <LilyFlower x={-20} y={6} scale={0.95} rotate={-16} />
      </g>
    </svg>
  );
}

/** The app's logo — a dumbbell inside a progress ring — the same in both themes (matches the app icon). */
export function BrandMark({ size = 36 }: { size?: number }) {
  const id = useId().replace(/:/g, "");
  return (
    <span className="block shrink-0 overflow-hidden rounded-[28%] [[data-theme=summit]_&]:rounded-[8px] [[data-theme=summit]_&]:shadow-[2px_2px_0_var(--edge)]" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 512 512" width={size} height={size}>
        <defs>
          <linearGradient id={`bm-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#1f3d66" />
            <stop offset="1" stopColor="#16201a" />
          </linearGradient>
        </defs>
        <rect width="512" height="512" fill={`url(#bm-${id})`} />
        <g transform="rotate(-90 256 256)" fill="none" strokeWidth="30" strokeLinecap="round">
          <circle cx="256" cy="256" r="168" stroke="#9cc9f0" strokeDasharray="790 1056" />
          <circle cx="256" cy="256" r="168" stroke="#6e9071" strokeDasharray="0 800 230 1056" />
        </g>
        <g transform="translate(256 256) scale(0.82) rotate(-30)" fill="#ffffff">
          <rect x="-92" y="-14" width="184" height="28" rx="10" />
          <rect x="-142" y="-78" width="40" height="156" rx="14" />
          <rect x="102" y="-78" width="40" height="156" rx="14" />
          <rect x="-176" y="-52" width="30" height="104" rx="11" />
          <rect x="146" y="-52" width="30" height="104" rx="11" />
          <rect x="-100" y="-22" width="12" height="44" rx="4" fill="#e2ad3b" />
          <rect x="88" y="-22" width="12" height="44" rx="4" fill="#e2ad3b" />
        </g>
      </svg>
    </span>
  );
}
