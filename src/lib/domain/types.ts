// Core domain types shared by the UI, the local (guest) store and the Supabase store.
// Every persisted record has a client-generated UUID so writes are idempotent (safe to retry).

export type ThemeId = "lily" | "summit";
/** "system" follows the device's light/dark setting. */
export type ColorMode = "light" | "dark" | "system";
export type Units = "kg" | "lb";
/** 0 = Sunday … 6 = Saturday (same as Date#getDay). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
/** Local calendar date, always "YYYY-MM-DD" in the user's own time zone. */
export type LocalDate = string;

export type ExerciseKind = "reps" | "time" | "cardio" | "mobility";
export type Difficulty = "beginner" | "intermediate" | "advanced";

export interface Exercise {
  id: string; // stable UUID
  slug: string;
  name: string;
  /** A short plain-language "what is this exercise" — built-ins only; custom exercises may not have one. */
  summary?: string;
  kind: ExerciseKind;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string[];
  difficulty: Difficulty;
  usesWeight: boolean;
  startingPosition: string;
  steps: string[];
  breathing?: string;
  mistakes: string[];
  safety: string[];
  /** Key into the animation registry; custom exercises use "generic". */
  animation: string;
  /** null for the built-in library; the owner's user id for custom exercises. */
  ownerId: string | null;
  custom?: boolean;
}

export type TargetUnit = "reps" | "seconds" | "minutes";
export type DayKind = "strength" | "cardio" | "activity" | "rest";

export interface PlanExercise {
  id: string;
  planDayId: string;
  exerciseId: string;
  position: number;
  sets: number;
  repsMin: number;
  repsMax: number;
  targetUnit: TargetUnit;
  perSide: boolean;
  restSeconds: number;
  notes: string;
}

export interface PlanDay {
  id: string;
  planId: string;
  /** Weekly plans: the weekday. Cycle plans: the day's position in the cycle (0 = Day 1). */
  weekday: Weekday;
  name: string;
  kind: DayKind;
  notes: string;
  /** Optional days (e.g. Saturday activity) never count as "missed" and don't break streaks. */
  optional: boolean;
}

/**
 * "weekly": every day is tied to a weekday. "cycle": the days repeat in order (e.g. Push → Pull →
 * Legs → Rest → Push …) whatever the weekday. Plans saved before cycles existed have none = weekly.
 */
export type PlanSchedule = "weekly" | "cycle";

export interface Plan {
  id: string;
  name: string;
  schedule?: PlanSchedule;
  /** Cycle plans: the date on which Day 1 of the cycle falls (the cycle repeats from there). */
  cycleStart?: LocalDate | null;
  description: string;
  isActive: boolean;
  archivedAt: string | null;
  templateKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export type OverrideKind = "skip" | "add";
/** Changes to the weekly schedule for a specific date. Moving = skip on one date + add on another. */
export interface ScheduleOverride {
  id: string;
  date: LocalDate;
  kind: OverrideKind;
  planDayId: string | null;
  movedFrom: LocalDate | null;
  note: string;
  createdAt: string;
}

export type SessionStatus = "in_progress" | "completed" | "partial" | "abandoned";
export type SessionKind = "strength" | "cardio" | "activity";

export interface WorkoutSession {
  id: string;
  planId: string | null;
  planDayId: string | null;
  localDate: LocalDate;
  /** Snapshots so history stays readable after plans change or are deleted. */
  title: string;
  planName: string | null;
  kind: SessionKind;
  status: SessionStatus;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  activityType: string | null;
  notes: string;
}

export type SessionExerciseStatus = "pending" | "active" | "completed" | "skipped";

export interface SessionExercise {
  id: string;
  sessionId: string;
  exerciseId: string | null;
  position: number;
  name: string; // snapshot
  targetSets: number;
  repsMin: number;
  repsMax: number;
  targetUnit: TargetUnit;
  perSide: boolean;
  restSeconds: number;
  usesWeight: boolean;
  status: SessionExerciseStatus;
  startedAt: string | null;
  completedAt: string | null;
  /** Only for time-based items (cardio / mobility minutes) — these never create strength sets. */
  durationSeconds: number | null;
}

export interface CompletedSet {
  id: string;
  sessionExerciseId: string;
  sessionId: string;
  setNumber: number;
  reps: number | null;
  weight: number | null;
  weightUnit: Units | null;
  durationSeconds: number | null;
  completedAt: string;
}

export interface BodyMeasurement {
  id: string;
  metric: string;
  value: number;
  unit: string;
  measuredOn: LocalDate;
}

export interface Preferences {
  theme: ThemeId;
  colorMode: ColorMode;
  units: Units;
  defaultRestSeconds: number;
  soundEnabled: boolean;
  notificationsEnabled: boolean;
  remindersEnabled: boolean;
  reminderTime: string; // "HH:MM"
  weekStartsOn: 0 | 1;
  reducedMotion: "system" | "reduce" | "allow";
  showMissed: boolean;
  trackedMetrics: string[];
  displayName: string;
  /** Set once the default plan has been copied in, so deleting it doesn't make it reappear. */
  defaultPlanSeeded: boolean;
  updatedAt: string;
}

/** Everything the app holds for one user (or guest). */
export interface AppData {
  preferences: Preferences;
  exercises: Exercise[]; // custom exercises only; built-ins come from code
  plans: Plan[];
  planDays: PlanDay[];
  planExercises: PlanExercise[];
  overrides: ScheduleOverride[];
  sessions: WorkoutSession[];
  sessionExercises: SessionExercise[];
  sets: CompletedSet[];
  measurements: BodyMeasurement[];
}

export type TableName =
  | "exercises"
  | "plans"
  | "planDays"
  | "planExercises"
  | "overrides"
  | "sessions"
  | "sessionExercises"
  | "sets"
  | "measurements";

export const DEFAULT_PREFERENCES: Preferences = {
  theme: "lily",
  colorMode: "system",
  units: "kg",
  defaultRestSeconds: 90,
  soundEnabled: true,
  notificationsEnabled: false,
  remindersEnabled: false,
  reminderTime: "17:30",
  weekStartsOn: 1,
  reducedMotion: "system",
  showMissed: false,
  trackedMetrics: [],
  displayName: "",
  defaultPlanSeeded: false,
  updatedAt: new Date(0).toISOString(),
};

export function emptyAppData(): AppData {
  return {
    preferences: { ...DEFAULT_PREFERENCES },
    exercises: [],
    plans: [],
    planDays: [],
    planExercises: [],
    overrides: [],
    sessions: [],
    sessionExercises: [],
    sets: [],
    measurements: [],
  };
}
