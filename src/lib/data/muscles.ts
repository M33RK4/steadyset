// The muscle areas shown on the muscle map and highlighted on the animated figure, and how the
// free-text muscle names on exercises ("Front shoulders", "Core", "Glutes (side)" …) map onto them.

export type MuscleId =
  | "chest"
  | "frontDelts"
  | "sideDelts"
  | "rearDelts"
  | "traps"
  | "biceps"
  | "triceps"
  | "forearms"
  | "abs"
  | "obliques"
  | "lats"
  | "midBack"
  | "lowerBack"
  | "glutes"
  | "abductors"
  | "adductors"
  | "hipFlexors"
  | "quads"
  | "hamstrings"
  | "calves";

export const MUSCLE_LABEL: Record<MuscleId, string> = {
  chest: "Chest",
  frontDelts: "Front shoulders",
  sideDelts: "Side shoulders",
  rearDelts: "Rear shoulders",
  traps: "Traps",
  biceps: "Biceps",
  triceps: "Triceps",
  forearms: "Forearms",
  abs: "Abs",
  obliques: "Obliques",
  lats: "Lats",
  midBack: "Mid back",
  lowerBack: "Lower back",
  glutes: "Glutes",
  abductors: "Outer hips",
  adductors: "Inner thighs",
  hipFlexors: "Hip flexors",
  quads: "Quads",
  hamstrings: "Hamstrings",
  calves: "Calves",
};

// First matching rules win for a name; a name can map to several areas.
const RULES: [RegExp, MuscleId[]][] = [
  [/glutes?\s*\(side\)|outer hip|abductor|glute med|hip stabil/, ["abductors"]],
  [/glute|butt|bum/, ["glutes"]],
  [/hamstring/, ["hamstrings"]],
  [/quad/, ["quads"]],
  [/adductor|inner thigh/, ["adductors"]],
  [/hip flexor/, ["hipFlexors"]],
  [/calf|calves/, ["calves"]],
  [/lower back|erector/, ["lowerBack"]],
  [/forearm|grip|wrist/, ["forearms"]],
  [/brachialis/, ["biceps", "forearms"]],
  [/bicep/, ["biceps"]],
  [/tricep/, ["triceps"]],
  [/chest|pec/, ["chest"]],
  [/front (shoulder|delt)/, ["frontDelts"]],
  [/(side|lateral) (shoulder|delt)/, ["sideDelts"]],
  [/rear (shoulder|delt)/, ["rearDelts"]],
  [/shoulder|delt/, ["frontDelts", "sideDelts", "rearDelts"]],
  [/trap/, ["traps"]],
  [/\blats?\b|latissimus/, ["lats"]],
  [/mid back|upper back|rhomboid|thoracic/, ["midBack"]],
  [/oblique/, ["obliques"]],
  [/core|\babs\b|abdominal|stomach/, ["abs", "obliques"]],
  [/^legs?$/, ["quads", "hamstrings", "glutes", "calves"]],
  [/^hips?$/, ["glutes", "hipFlexors", "abductors"]],
];

/** Muscle areas for a list of names, in a stable order without duplicates. */
export function musclesFor(names: string[]): MuscleId[] {
  const found = new Set<MuscleId>();
  for (const raw of names) {
    const name = raw.toLowerCase().trim();
    const rule = RULES.find(([re]) => re.test(name));
    rule?.[1].forEach((m) => found.add(m));
  }
  return (Object.keys(MUSCLE_LABEL) as MuscleId[]).filter((m) => found.has(m));
}

/** Primary and secondary areas for an exercise; an area never appears in both. */
export function muscleTargets(e: { primaryMuscles: string[]; secondaryMuscles: string[] }): { primary: MuscleId[]; secondary: MuscleId[] } {
  const primary = musclesFor(e.primaryMuscles);
  const secondary = musclesFor(e.secondaryMuscles).filter((m) => !primary.includes(m));
  return { primary, secondary };
}
