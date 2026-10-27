import type { ThemeId } from "./domain/types";

export const THEMES: { id: ThemeId; name: string; description: string; swatch: [string, string, string] }[] = [
  { id: "blush", name: "Blush", description: "Soft pink, rose and plum", swatch: ["#fbf2f3", "#c8476b", "#3b2229"] },
  { id: "ember", name: "Ember", description: "Charcoal and black with orange", swatch: ["#121212", "#ff7a1a", "#f3f1ee"] },
  { id: "paper", name: "Paper", description: "Minimal light", swatch: ["#ffffff", "#161616", "#e3e3e3"] },
  { id: "graphite", name: "Graphite", description: "Minimal dark", swatch: ["#0f0f0f", "#f4f4f4", "#2b2b2b"] },
];
