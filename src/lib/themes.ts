import type { ColorMode, Preferences, ThemeId } from "./domain/types";

export interface ThemeInfo {
  id: ThemeId;
  name: string;
  description: string;
  /** [background, accent, ink] for the light and dark variants — used by the theme pickers. */
  swatch: { light: [string, string, string]; dark: [string, string, string] };
}

export const THEMES: ThemeInfo[] = [
  {
    id: "lily",
    name: "Lily",
    description: "Baby blue and white lilies, with a soft serif",
    swatch: { light: ["#eaf4fc", "#2f6fae", "#1d3350"], dark: ["#0d1726", "#9cc9f0", "#e6f0fb"] },
  },
  {
    id: "summit",
    name: "Summit",
    description: "Charcoal, warm stone and sunset orange, with mountain ridges",
    swatch: { light: ["#efe9e1", "#c94f16", "#1f2328"], dark: ["#111316", "#ff8a3d", "#eee9e3"] },
  },
];

/** Themes from earlier versions of the app, mapped to the closest new theme and mode. */
const LEGACY_THEMES: Record<string, { theme: ThemeId; colorMode: ColorMode }> = {
  blush: { theme: "lily", colorMode: "light" },
  paper: { theme: "lily", colorMode: "light" },
  ember: { theme: "summit", colorMode: "dark" },
  graphite: { theme: "summit", colorMode: "dark" },
};

const isTheme = (t: unknown): t is ThemeId => t === "lily" || t === "summit";
const isMode = (m: unknown): m is ColorMode => m === "light" || m === "dark" || m === "system";

/** Fixes preferences saved by older versions (old theme ids, no colour mode). */
export function normalizePreferences(p: Preferences): Preferences {
  const legacy = LEGACY_THEMES[p.theme as string];
  if (legacy) return { ...p, theme: legacy.theme, colorMode: isMode(p.colorMode) && p.colorMode !== "system" ? p.colorMode : legacy.colorMode };
  return {
    ...p,
    theme: isTheme(p.theme) ? p.theme : "lily",
    colorMode: isMode(p.colorMode) ? p.colorMode : "system",
    bodyType: p.bodyType === "male" ? "male" : "female",
  };
}

/** The light/dark variant actually shown for a colour mode. */
export function resolveMode(mode: ColorMode, systemDark: boolean): "light" | "dark" {
  return mode === "system" ? (systemDark ? "dark" : "light") : mode;
}
