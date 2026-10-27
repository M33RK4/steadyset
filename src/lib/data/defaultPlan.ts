import type { DayKind, TargetUnit, Weekday } from "../domain/types";

export interface TemplateExercise {
  slug: string;
  sets: number;
  repsMin: number;
  repsMax: number;
  targetUnit?: TargetUnit;
  perSide?: boolean;
  restSeconds: number;
  notes?: string;
}

export interface TemplateDay {
  weekday: Weekday;
  name: string;
  kind: DayKind;
  optional?: boolean;
  notes?: string;
  exercises: TemplateExercise[];
}

export interface PlanTemplate {
  key: string;
  name: string;
  description: string;
  days: TemplateDay[];
}

export const BALANCED_TONING_BEGINNER: PlanTemplate = {
  key: "balanced-toning-beginner",
  name: "Balanced Toning — Beginner",
  description:
    "Five days a week of beginner-friendly training: moderate glute work, stronger chest, arms, shoulders and back, plus core and general fitness. Saturday is optional, Sunday is rest.",
  days: [
    {
      weekday: 1,
      name: "Lower Body A",
      kind: "strength",
      exercises: [
        { slug: "hip-thrust-machine", sets: 3, repsMin: 10, repsMax: 12, restSeconds: 90 },
        { slug: "db-romanian-deadlift", sets: 2, repsMin: 10, repsMax: 12, restSeconds: 90 },
        { slug: "leg-press", sets: 2, repsMin: 10, repsMax: 12, restSeconds: 90 },
        { slug: "hip-abduction-machine", sets: 2, repsMin: 15, repsMax: 20, restSeconds: 60 },
        { slug: "seated-leg-curl", sets: 2, repsMin: 12, repsMax: 15, restSeconds: 60 },
      ],
    },
    {
      weekday: 2,
      name: "Upper Body A",
      kind: "strength",
      exercises: [
        { slug: "chest-press-machine", sets: 3, repsMin: 10, repsMax: 12, restSeconds: 90 },
        { slug: "lat-pulldown", sets: 3, repsMin: 10, repsMax: 12, restSeconds: 90 },
        { slug: "seated-cable-row", sets: 2, repsMin: 10, repsMax: 12, restSeconds: 75 },
        { slug: "db-lateral-raise", sets: 2, repsMin: 12, repsMax: 15, restSeconds: 60 },
        { slug: "db-biceps-curl", sets: 2, repsMin: 10, repsMax: 15, restSeconds: 60 },
        { slug: "triceps-rope-pushdown", sets: 2, repsMin: 10, repsMax: 15, restSeconds: 60 },
      ],
    },
    {
      weekday: 3,
      name: "Cardio & Mobility",
      kind: "cardio",
      notes: "A light activity day, not an intense workout.",
      exercises: [
        { slug: "treadmill-walk", sets: 1, repsMin: 20, repsMax: 25, targetUnit: "minutes", restSeconds: 0, notes: "Comfortable or moderately brisk pace." },
        { slug: "mobility-flow", sets: 1, repsMin: 5, repsMax: 10, targetUnit: "minutes", restSeconds: 0 },
      ],
    },
    {
      weekday: 4,
      name: "Lower Body B",
      kind: "strength",
      exercises: [
        { slug: "glute-bridge", sets: 3, repsMin: 10, repsMax: 15, restSeconds: 90 },
        { slug: "low-step-up", sets: 2, repsMin: 8, repsMax: 10, perSide: true, restSeconds: 75 },
        { slug: "cable-glute-kickback", sets: 2, repsMin: 12, repsMax: 15, perSide: true, restSeconds: 60 },
        { slug: "hip-abduction-machine", sets: 2, repsMin: 15, repsMax: 20, restSeconds: 60 },
        { slug: "seated-leg-curl", sets: 2, repsMin: 12, repsMax: 15, restSeconds: 60 },
      ],
    },
    {
      weekday: 5,
      name: "Upper Body B & Core",
      kind: "strength",
      exercises: [
        { slug: "incline-chest-press-machine", sets: 2, repsMin: 10, repsMax: 12, restSeconds: 90 },
        { slug: "chest-supported-row", sets: 3, repsMin: 10, repsMax: 12, restSeconds: 75 },
        { slug: "db-hammer-curl", sets: 2, repsMin: 10, repsMax: 12, restSeconds: 60 },
        { slug: "triceps-rope-pushdown", sets: 2, repsMin: 10, repsMax: 12, restSeconds: 60 },
        { slug: "forearm-plank", sets: 2, repsMin: 20, repsMax: 30, targetUnit: "seconds", restSeconds: 45 },
        { slug: "dead-bug", sets: 2, repsMin: 8, repsMax: 10, perSide: true, restSeconds: 45 },
      ],
    },
    {
      weekday: 6,
      name: "Optional Activity",
      kind: "activity",
      optional: true,
      notes: "Walking, cycling or anything you enjoy. Log the time if you feel like it.",
      exercises: [],
    },
    {
      weekday: 0,
      name: "Rest Day",
      kind: "rest",
      notes: "Recovery is part of training.",
      exercises: [],
    },
  ],
};

export const PLAN_TEMPLATES: PlanTemplate[] = [BALANCED_TONING_BEGINNER];
