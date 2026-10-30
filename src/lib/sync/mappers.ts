import type { AppData, Preferences, TableName } from "../domain/types";
import { normalizePreferences } from "../themes";

/** Postgres table for each in-app collection. */
export const DB_TABLE: Record<TableName, string> = {
  exercises: "exercises",
  plans: "plans",
  planDays: "plan_days",
  planExercises: "plan_exercises",
  overrides: "scheduled_workouts",
  sessions: "workout_sessions",
  sessionExercises: "session_exercises",
  sets: "completed_sets",
  measurements: "body_measurements",
};

/** camelCase field → snake_case column, per table. Only listed fields are sent to the database. */
const COLUMNS: Record<TableName, Record<string, string>> = {
  exercises: {
    id: "id",
    slug: "slug",
    name: "name",
    kind: "kind",
    primaryMuscles: "primary_muscles",
    secondaryMuscles: "secondary_muscles",
    equipment: "equipment",
    difficulty: "difficulty",
    usesWeight: "uses_weight",
    startingPosition: "starting_position",
    steps: "steps",
    breathing: "breathing",
    mistakes: "mistakes",
    safety: "safety",
    animation: "animation",
  },
  plans: {
    id: "id",
    name: "name",
    schedule: "schedule",
    cycleStart: "cycle_start",
    description: "description",
    isActive: "is_active",
    archivedAt: "archived_at",
    templateKey: "template_key",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
  planDays: { id: "id", planId: "plan_id", weekday: "weekday", name: "name", kind: "kind", notes: "notes", optional: "optional" },
  planExercises: {
    id: "id",
    planDayId: "plan_day_id",
    exerciseId: "exercise_id",
    position: "position",
    sets: "sets",
    repsMin: "reps_min",
    repsMax: "reps_max",
    targetUnit: "target_unit",
    perSide: "per_side",
    restSeconds: "rest_seconds",
    notes: "notes",
  },
  overrides: { id: "id", date: "date", kind: "kind", planDayId: "plan_day_id", movedFrom: "moved_from", note: "note", createdAt: "created_at" },
  sessions: {
    id: "id",
    planId: "plan_id",
    planDayId: "plan_day_id",
    localDate: "local_date",
    title: "title",
    planName: "plan_name",
    kind: "kind",
    status: "status",
    startedAt: "started_at",
    endedAt: "ended_at",
    durationSeconds: "duration_seconds",
    activityType: "activity_type",
    notes: "notes",
  },
  sessionExercises: {
    id: "id",
    sessionId: "session_id",
    exerciseId: "exercise_id",
    position: "position",
    name: "name",
    targetSets: "target_sets",
    repsMin: "reps_min",
    repsMax: "reps_max",
    targetUnit: "target_unit",
    perSide: "per_side",
    restSeconds: "rest_seconds",
    usesWeight: "uses_weight",
    status: "status",
    startedAt: "started_at",
    completedAt: "completed_at",
    durationSeconds: "duration_seconds",
  },
  sets: {
    id: "id",
    sessionExerciseId: "session_exercise_id",
    sessionId: "session_id",
    setNumber: "set_number",
    reps: "reps",
    weight: "weight",
    weightUnit: "weight_unit",
    durationSeconds: "duration_seconds",
    completedAt: "completed_at",
  },
  measurements: { id: "id", metric: "metric", value: "value", unit: "unit", measuredOn: "measured_on" },
};

const NUMERIC_FIELDS = new Set(["weight", "value"]); // Postgres numeric comes back as string in some clients

export function toRow(table: TableName, obj: Record<string, unknown>, userId: string): Record<string, unknown> {
  const cols = COLUMNS[table];
  const row: Record<string, unknown> = {};
  for (const [field, col] of Object.entries(cols)) if (field in obj) row[col] = obj[field] ?? null;
  if (table === "exercises") row.owner_id = userId;
  else row.user_id = userId;
  return row;
}

export function fromRow<T>(table: TableName, row: Record<string, unknown>): T {
  const cols = COLUMNS[table];
  const out: Record<string, unknown> = {};
  for (const [field, col] of Object.entries(cols)) {
    let v = row[col];
    if (NUMERIC_FIELDS.has(field) && typeof v === "string") v = Number(v);
    if (v === undefined) v = null;
    out[field] = v;
  }
  if (table === "exercises") {
    out.ownerId = row.owner_id ?? null;
    out.custom = true;
    out.breathing = out.breathing ?? undefined;
  }
  if (table === "sets" && out.weight !== null) out.weight = Number(out.weight);
  return out as T;
}

const PREF_COLUMNS: Record<keyof Preferences, string> = {
  theme: "theme",
  colorMode: "color_mode",
  units: "units",
  defaultRestSeconds: "default_rest_seconds",
  soundEnabled: "sound_enabled",
  notificationsEnabled: "notifications_enabled",
  remindersEnabled: "reminders_enabled",
  reminderTime: "reminder_time",
  weekStartsOn: "week_starts_on",
  reducedMotion: "reduced_motion",
  showMissed: "show_missed",
  trackedMetrics: "tracked_metrics",
  displayName: "display_name",
  bodyType: "body_type",
  defaultPlanSeeded: "default_plan_seeded",
  updatedAt: "updated_at",
};

export function prefsToRow(p: Preferences, userId: string) {
  const row: Record<string, unknown> = { user_id: userId };
  for (const [k, col] of Object.entries(PREF_COLUMNS)) row[col] = p[k as keyof Preferences];
  return row;
}

export function prefsFromRow(row: Record<string, unknown>, fallback: Preferences): Preferences {
  const out = { ...fallback } as Record<string, unknown>;
  for (const [k, col] of Object.entries(PREF_COLUMNS)) if (row[col] !== undefined && row[col] !== null) out[k] = row[col];
  return normalizePreferences(out as unknown as Preferences);
}

export const ALL_TABLES: TableName[] = ["exercises", "plans", "planDays", "planExercises", "overrides", "sessions", "sessionExercises", "sets", "measurements"];

export type DataTables = Omit<AppData, "preferences">;
