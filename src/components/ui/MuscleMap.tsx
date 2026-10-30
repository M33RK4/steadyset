"use client";

import { MUSCLE_LABEL, type MuscleId } from "@/lib/data/muscles";
import { useApp } from "@/lib/store/AppStore";
import type { BodyType } from "@/lib/domain/types";
import { BODY_MAPS, type BodySlug, type BodyView } from "./bodyMapData";
import { cx } from "./primitives";

// Front and back body chart (male or female, from Settings) with the exercise's muscles coloured
// in. The drawings come from react-native-body-highlighter (MIT, see bodyMapData.ts); each of its
// body areas stands for one or more of the app's muscle groups.

const GROUPS: Partial<Record<BodySlug, MuscleId[]>> = {
  chest: ["chest"],
  deltoids: ["frontDelts", "sideDelts", "rearDelts"],
  trapezius: ["traps"],
  biceps: ["biceps"],
  triceps: ["triceps"],
  forearm: ["forearms"],
  abs: ["abs"],
  obliques: ["obliques"],
  "upper-back": ["lats", "midBack"],
  "lower-back": ["lowerBack"],
  gluteal: ["glutes", "abductors"],
  adductors: ["adductors"],
  quadriceps: ["quads", "hipFlexors"],
  hamstring: ["hamstrings"],
  calves: ["calves"],
};

/** Body areas that aren't muscles: drawn in the plain skin tone. */
const PLAIN = new Set<BodySlug>(["hair", "head", "neck", "hands", "feet", "ankles", "knees"]);

const NAMES: Partial<Record<BodySlug, string>> = {
  deltoids: "Shoulders (deltoids)",
  trapezius: "Trapezius",
  forearm: "Forearms",
  "upper-back": "Upper back (lats, rhomboids)",
  "lower-back": "Lower back",
  gluteal: "Glutes",
  adductors: "Inner thighs (adductors)",
  quadriceps: "Quadriceps",
  hamstring: "Hamstrings",
  tibialis: "Shins (tibialis)",
};

const label = (slug: BodySlug) => NAMES[slug] ?? slug.charAt(0).toUpperCase() + slug.slice(1);

function View({ view, title, primary, secondary }: { view: BodyView; title: string; primary: Set<MuscleId>; secondary: Set<MuscleId> }) {
  return (
    <figure className="flex flex-col items-center gap-1 min-w-0">
      <svg viewBox={view.viewBox} className="w-full h-auto max-h-[300px]" aria-hidden="true">
        <path d={view.outline} fill="none" stroke="var(--mm-line)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        {view.parts.map((part) => {
          const groups = GROUPS[part.slug] ?? [];
          const fill = groups.some((g) => primary.has(g))
            ? "var(--mm-primary)"
            : groups.some((g) => secondary.has(g))
              ? "var(--mm-secondary)"
              : PLAIN.has(part.slug)
                ? "var(--mm-base)"
                : "var(--mm-muscle)";
          return (
            <g key={part.slug} fill={fill}>
              {!PLAIN.has(part.slug) && <title>{label(part.slug)}</title>}
              {part.d.map((d, i) => (
                <path key={i} d={d} />
              ))}
            </g>
          );
        })}
      </svg>
      <figcaption className="text-xs font-bold tracking-[0.18em] uppercase text-muted">{title}</figcaption>
    </figure>
  );
}

/**
 * Front and back body chart with the exercise's main muscles in full colour and the muscles it
 * also works in a lighter tint. Hovering a muscle shows its name.
 */
export function MuscleMap({ primary, secondary, className, showLegend = true, body }: { primary: MuscleId[]; secondary: MuscleId[]; className?: string; showLegend?: boolean; body?: BodyType }) {
  const { prefs } = useApp();
  const map = BODY_MAPS[body ?? prefs.bodyType ?? "female"];
  const p = new Set(primary);
  const s = new Set(secondary);
  const describe = [primary.length ? `Main: ${primary.map((m) => MUSCLE_LABEL[m]).join(", ")}` : "", secondary.length ? `Also works: ${secondary.map((m) => MUSCLE_LABEL[m]).join(", ")}` : ""]
    .filter(Boolean)
    .join(". ");
  return (
    <div className={cx("space-y-3", className)}>
      <div
        role="img"
        aria-label={describe || "Muscle map"}
        className="grid grid-cols-2 items-end gap-4 max-w-[360px] mx-auto [--mm-base:color-mix(in_srgb,var(--ink)_7%,var(--surface))] [--mm-muscle:color-mix(in_srgb,var(--ink)_17%,var(--surface))] [--mm-line:color-mix(in_srgb,var(--ink)_22%,var(--surface))] [--mm-primary:var(--fig-muscle)] [--mm-secondary:color-mix(in_srgb,var(--fig-muscle)_45%,var(--mm-muscle))]"
      >
        <View view={map.front} title="Front" primary={p} secondary={s} />
        <View view={map.back} title="Back" primary={p} secondary={s} />
      </div>
      {showLegend && (primary.length > 0 || secondary.length > 0) && (
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-sm">
          {primary.length > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 shrink-0 rounded-pill bg-[var(--fig-muscle)]" aria-hidden="true" />
              <span className="font-semibold">{primary.map((m) => MUSCLE_LABEL[m]).join(", ")}</span>
            </span>
          )}
          {secondary.length > 0 && (
            <span className="flex items-center gap-1.5 text-muted">
              <span className="h-3 w-3 shrink-0 rounded-pill bg-[color-mix(in_srgb,var(--fig-muscle)_45%,var(--surface))]" aria-hidden="true" />
              {secondary.map((m) => MUSCLE_LABEL[m]).join(", ")}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
