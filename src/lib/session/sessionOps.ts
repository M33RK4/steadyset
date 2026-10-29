import type {
  AppData,
  CompletedSet,
  LocalDate,
  Plan,
  PlanDay,
  SessionExercise,
  SessionStatus,
  Units,
  WorkoutSession,
} from "../domain/types";
import { applyChanges, del, upsert, type Change } from "../domain/changes";
import { BUILT_IN_EXERCISES } from "../data/exercises";
import { exercisesOfDay } from "../plans/planOps";
import { clearTimer, IDLE_TIMER, startTimer, type TimerState } from "../timer/restTimer";
import { uuid } from "../util/ids";
import { parseLocalDate, toLocalDate } from "../util/dates";

/** Device-local UI state of the workout in progress (persisted to localStorage). */
export interface ActiveWorkout {
  sessionId: string;
  currentExerciseId: string | null;
  timer: TimerState;
  /** Optional override of rest length for the rest of this session, by session exercise. */
  restOverride: Record<string, number>;
  updatedAt: number;
}

export interface StepResult {
  changes: Change[];
  active: ActiveWorkout | null;
  /** Machine-readable outcome so the UI can react (toast, haptics…). */
  event?: "set-recorded" | "exercise-complete" | "workout-ready" | "ignored-duplicate" | "undone" | "skipped";
}

export function exerciseLookup(data: AppData) {
  const all = [...BUILT_IN_EXERCISES, ...data.exercises];
  return (id: string | null) => (id ? all.find((e) => e.id === id) : undefined);
}

export function sessionExercisesOf(data: AppData, sessionId: string): SessionExercise[] {
  return data.sessionExercises.filter((e) => e.sessionId === sessionId).sort((a, b) => a.position - b.position);
}

export function setsOf(data: AppData, sessionExerciseId: string): CompletedSet[] {
  return data.sets.filter((s) => s.sessionExerciseId === sessionExerciseId).sort((a, b) => a.setNumber - b.setNumber);
}

export function inProgressSession(data: AppData): WorkoutSession | undefined {
  return data.sessions
    .filter((s) => s.status === "in_progress")
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
}

export function isTimed(se: Pick<SessionExercise, "targetUnit">) {
  return se.targetUnit === "minutes";
}

/** Steps 1–2: create the session and snapshot the plan day's exercises. */
export function startSession(
  data: AppData,
  args: { plan: Plan | null; day: PlanDay | null; date: LocalDate; now: Date; title?: string },
): { changes: Change[]; active: ActiveWorkout; sessionId: string } {
  const sessionId = uuid();
  const iso = args.now.toISOString();
  const lookup = exerciseLookup(data);
  const session: WorkoutSession = {
    id: sessionId,
    planId: args.plan?.id ?? null,
    planDayId: args.day?.id ?? null,
    localDate: args.date,
    title: args.title ?? args.day?.name ?? "Workout",
    planName: args.plan?.name ?? null,
    kind: args.day?.kind === "cardio" ? "cardio" : args.day?.kind === "activity" ? "activity" : "strength",
    status: "in_progress",
    startedAt: iso,
    endedAt: null,
    durationSeconds: null,
    activityType: null,
    notes: "",
  };
  const ses: SessionExercise[] = args.day
    ? exercisesOfDay(data, args.day.id).map((pe, i) => {
        const ex = lookup(pe.exerciseId);
        return {
          id: uuid(),
          sessionId,
          exerciseId: pe.exerciseId,
          position: i,
          name: ex?.name ?? "Exercise",
          targetSets: pe.sets,
          repsMin: pe.repsMin,
          repsMax: pe.repsMax,
          targetUnit: pe.targetUnit,
          perSide: pe.perSide,
          restSeconds: pe.restSeconds,
          usesWeight: ex?.usesWeight ?? false,
          status: "pending",
          startedAt: null,
          completedAt: null,
          durationSeconds: null,
        };
      })
    : [];
  return {
    sessionId,
    changes: [upsert("sessions", session), ...ses.map((s) => upsert("sessionExercises", s))],
    active: { sessionId, currentExerciseId: null, timer: { ...IDLE_TIMER }, restOverride: {}, updatedAt: args.now.getTime() },
  };
}

/** Add an exercise to a running session (ad-hoc). */
export function addExerciseToSession(data: AppData, sessionId: string, exerciseId: string, defaults: { restSeconds: number }): Change[] {
  const ex = exerciseLookup(data)(exerciseId);
  if (!ex) return [];
  const pos = sessionExercisesOf(data, sessionId).length;
  const timed = ex.kind === "cardio" || ex.kind === "mobility";
  const se: SessionExercise = {
    id: uuid(),
    sessionId,
    exerciseId,
    position: pos,
    name: ex.name,
    targetSets: timed ? 1 : 3,
    repsMin: timed ? 10 : ex.kind === "time" ? 20 : 10,
    repsMax: timed ? 20 : ex.kind === "time" ? 30 : 12,
    targetUnit: timed ? "minutes" : ex.kind === "time" ? "seconds" : "reps",
    perSide: false,
    restSeconds: timed ? 0 : defaults.restSeconds,
    usesWeight: ex.usesWeight,
    status: "pending",
    startedAt: null,
    completedAt: null,
    durationSeconds: null,
  };
  return [upsert("sessionExercises", se)];
}

/** Steps 3–4: select / start an exercise and highlight it. */
export function selectExercise(data: AppData, active: ActiveWorkout, seId: string, now: Date): StepResult {
  const se = data.sessionExercises.find((e) => e.id === seId && e.sessionId === active.sessionId);
  if (!se) return { changes: [], active };
  const changes: Change[] = [];
  if (se.status === "pending" || se.status === "skipped") {
    changes.push(upsert("sessionExercises", { ...se, status: "active", startedAt: se.startedAt ?? now.toISOString() }));
  }
  // Switching away from an exercise cancels a rest that was leading into it.
  const timer = active.timer.status !== "idle" && active.timer.sessionExerciseId !== seId ? clearTimer() : active.timer;
  return { changes, active: { ...active, currentExerciseId: seId, timer, updatedAt: now.getTime() } };
}

export function nextPendingExercise(data: AppData, sessionId: string, afterId?: string | null): SessionExercise | undefined {
  const list = sessionExercisesOf(data, sessionId);
  const startIdx = afterId ? list.findIndex((e) => e.id === afterId) + 1 : 0;
  const rotated = [...list.slice(startIdx), ...list.slice(0, startIdx)];
  return rotated.find((e) => e.status === "pending" || e.status === "active");
}

/**
 * Steps 6–12: record the current set. `expectedSetNumber` makes double-taps harmless: a
 * second call with the same number is ignored because that set already exists.
 */
export function finishSet(
  data: AppData,
  active: ActiveWorkout,
  args: { seId: string; expectedSetNumber: number; reps: number | null; weight: number | null; units: Units; durationSeconds?: number | null; now: Date; restSeconds?: number },
): StepResult {
  const se = data.sessionExercises.find((e) => e.id === args.seId && e.sessionId === active.sessionId);
  if (!se || se.status === "completed") return { changes: [], active, event: "ignored-duplicate" };
  const existing = setsOf(data, se.id);
  const setNumber = existing.length + 1;
  if (setNumber !== args.expectedSetNumber || setNumber > se.targetSets) {
    return { changes: [], active, event: "ignored-duplicate" };
  }
  const iso = args.now.toISOString();
  const set: CompletedSet = {
    id: uuid(),
    sessionExerciseId: se.id,
    sessionId: se.sessionId,
    setNumber,
    reps: args.reps,
    weight: se.usesWeight ? args.weight : null,
    weightUnit: se.usesWeight && args.weight !== null ? args.units : null,
    durationSeconds: args.durationSeconds ?? null,
    completedAt: iso,
  };
  const changes: Change[] = [upsert("sets", set)];
  const isLast = setNumber >= se.targetSets;
  if (isLast) {
    changes.push(upsert("sessionExercises", { ...se, status: "completed", startedAt: se.startedAt ?? iso, completedAt: iso }));
    // No rest timer after the final set: guide to the next exercise instead.
    return { changes, active: { ...active, currentExerciseId: se.id, timer: clearTimer(), updatedAt: args.now.getTime() }, event: "exercise-complete" };
  }
  if (se.status !== "active") changes.push(upsert("sessionExercises", { ...se, status: "active", startedAt: se.startedAt ?? iso }));
  const rest = args.restSeconds ?? active.restOverride[se.id] ?? se.restSeconds;
  const timer =
    rest > 0
      ? startTimer(rest, args.now.getTime(), { runId: set.id, sessionExerciseId: se.id, nextSetNumber: setNumber + 1 })
      : clearTimer();
  return { changes, active: { ...active, currentExerciseId: se.id, timer, updatedAt: args.now.getTime() }, event: "set-recorded" };
}

/** Optional rest after the final set, only when the user explicitly asks for one. */
export function startExtraRest(active: ActiveWorkout, seconds: number, now: Date): ActiveWorkout {
  return { ...active, timer: startTimer(seconds, now.getTime(), { runId: uuid(), sessionExerciseId: null, nextSetNumber: null }), updatedAt: now.getTime() };
}

export function undoLastSet(data: AppData, active: ActiveWorkout, seId: string, now: Date): StepResult {
  const se = data.sessionExercises.find((e) => e.id === seId && e.sessionId === active.sessionId);
  if (!se) return { changes: [], active };
  const sets = setsOf(data, seId);
  const last = sets[sets.length - 1];
  if (!last) return { changes: [], active };
  const changes: Change[] = [del("sets", last.id)];
  if (se.status === "completed") changes.push(upsert("sessionExercises", { ...se, status: "active", completedAt: null }));
  const timer = active.timer.sessionExerciseId === seId ? clearTimer() : active.timer;
  return { changes, active: { ...active, currentExerciseId: seId, timer, updatedAt: now.getTime() }, event: "undone" };
}

export function skipExercise(data: AppData, active: ActiveWorkout, seId: string, now: Date): StepResult {
  const se = data.sessionExercises.find((e) => e.id === seId && e.sessionId === active.sessionId);
  if (!se || se.status === "completed") return { changes: [], active };
  const changes: Change[] = [upsert("sessionExercises", { ...se, status: "skipped" })];
  const after = applyLocal(data, changes);
  const next = nextPendingExercise(after, active.sessionId, seId);
  const timer = active.timer.sessionExerciseId === seId ? clearTimer() : active.timer;
  return { changes, active: { ...active, currentExerciseId: next?.id ?? null, timer, updatedAt: now.getTime() }, event: "skipped" };
}

/** Time-based items (cardio / mobility): mark done with the actual duration, no strength sets. */
export function completeTimedItem(data: AppData, active: ActiveWorkout, seId: string, minutes: number, now: Date): StepResult {
  const se = data.sessionExercises.find((e) => e.id === seId && e.sessionId === active.sessionId);
  if (!se || se.status === "completed") return { changes: [], active, event: "ignored-duplicate" };
  const iso = now.toISOString();
  const changes: Change[] = [
    upsert("sessionExercises", { ...se, status: "completed", startedAt: se.startedAt ?? iso, completedAt: iso, durationSeconds: Math.max(0, Math.round(minutes * 60)) }),
  ];
  return { changes, active: { ...active, currentExerciseId: se.id, timer: clearTimer(), updatedAt: now.getTime() }, event: "exercise-complete" };
}

export function sessionProgress(data: AppData, sessionId: string) {
  const list = sessionExercisesOf(data, sessionId);
  const total = list.length;
  const completed = list.filter((e) => e.status === "completed").length;
  const skipped = list.filter((e) => e.status === "skipped").length;
  const sets = data.sets.filter((s) => s.sessionId === sessionId).length;
  const targetSets = list.filter((e) => !isTimed(e)).reduce((n, e) => n + e.targetSets, 0);
  const anyWork = sets > 0 || completed > 0;
  return { total, completed, skipped, sets, targetSets, allDone: total > 0 && completed === total, anyWork };
}

/** Step 13–14: close the session. Fully completed only if every exercise was completed. */
export function finishSession(data: AppData, sessionId: string, args: { now: Date; notes?: string }): Change[] {
  const s = data.sessions.find((x) => x.id === sessionId);
  if (!s) return [];
  const p = sessionProgress(data, sessionId);
  const status: SessionStatus = p.allDone ? "completed" : "partial";
  const endedAt = args.now.toISOString();
  const durationSeconds = Math.max(0, Math.round((args.now.getTime() - new Date(s.startedAt).getTime()) / 1000));
  const changes: Change[] = [upsert("sessions", { ...s, status, endedAt, durationSeconds, notes: args.notes ?? s.notes })];
  // Exercises never touched stay as they are ("pending" = not done), started ones remain visible.
  return changes;
}

/** Throw away a session that has no recorded work. Refuses if anything was logged. */
export function discardSession(data: AppData, sessionId: string): Change[] {
  const p = sessionProgress(data, sessionId);
  if (p.anyWork) return [];
  return [
    ...data.sets.filter((x) => x.sessionId === sessionId).map((x) => del("sets", x.id)),
    ...sessionExercisesOf(data, sessionId).map((e) => del("sessionExercises", e.id)),
    del("sessions", sessionId),
  ];
}

/** Optional activity or quick cardio log, recorded as a completed session in one step. */
export function logActivity(
  data: AppData,
  args: { date: LocalDate; activityType: string; minutes: number; notes: string; planDay: PlanDay | null; plan: Plan | null; now: Date; kind?: "activity" | "cardio" },
): Change[] {
  const startedAt = new Date(args.now.getTime() - args.minutes * 60_000).toISOString();
  const session: WorkoutSession = {
    id: uuid(),
    planId: args.plan?.id ?? null,
    planDayId: args.planDay?.id ?? null,
    localDate: args.date,
    title: args.activityType || args.planDay?.name || "Activity",
    planName: args.plan?.name ?? null,
    kind: args.kind ?? "activity",
    status: "completed",
    startedAt,
    endedAt: args.now.toISOString(),
    durationSeconds: Math.round(args.minutes * 60),
    activityType: args.activityType,
    notes: args.notes,
  };
  return [upsert("sessions", session)];
}

export function updateSessionNotes(data: AppData, sessionId: string, notes: string): Change[] {
  const s = data.sessions.find((x) => x.id === sessionId);
  return s ? [upsert("sessions", { ...s, notes })] : [];
}

function applyLocal(data: AppData, changes: Change[]) {
  return applyChanges(data, changes);
}

/**
 * Remove a session and everything recorded in it — for a workout that was started by mistake or
 * never really happened. Unlike `discardSession` this also removes logged sets.
 */
export function deleteSession(data: AppData, sessionId: string): Change[] {
  if (!data.sessions.some((s) => s.id === sessionId)) return [];
  return [
    ...data.sets.filter((x) => x.sessionId === sessionId).map((x) => del("sets", x.id)),
    ...data.sessionExercises.filter((e) => e.sessionId === sessionId).map((e) => del("sessionExercises", e.id)),
    del("sessions", sessionId),
  ];
}

/** One exercise of a workout logged after the fact. `reps` holds seconds for timed holds. */
export interface LoggedExercise {
  exerciseId: string;
  sets: { reps: number | null; weight: number | null }[];
  /** Cardio and mobility: how long it lasted instead of sets. */
  minutes?: number | null;
}

/**
 * A workout typed in afterwards (no plan needed): recorded as a finished session with its
 * exercises and sets, so it counts in the calendar, history and progress like any other.
 */
export function logWorkout(
  data: AppData,
  args: { date: LocalDate; title: string; minutes: number; notes: string; items: LoggedExercise[]; units: Units; now: Date },
): { changes: Change[]; sessionId: string } {
  const lookup = exerciseLookup(data);
  const sessionId = uuid();
  // finished now when logged for today, otherwise in the evening of that day
  const today = toLocalDate(args.now);
  const end = args.date === today ? args.now : new Date(parseLocalDate(args.date).setHours(18));
  const start = new Date(end.getTime() - args.minutes * 60_000);
  const startedAt = start.toISOString();
  const endedAt = end.toISOString();
  const changes: Change[] = [];
  const items = args.items.filter((it) => lookup(it.exerciseId));
  const allTimed = items.length > 0 && items.every((it) => isTimedKind(lookup(it.exerciseId)!.kind));
  changes.push(
    upsert("sessions", {
      id: sessionId,
      planId: null,
      planDayId: null,
      localDate: args.date,
      title: args.title.trim() || "Workout",
      planName: null,
      kind: allTimed ? "cardio" : "strength",
      status: "completed",
      startedAt,
      endedAt,
      durationSeconds: Math.round(args.minutes * 60),
      activityType: null,
      notes: args.notes,
    } satisfies WorkoutSession),
  );
  items.forEach((it, position) => {
    const ex = lookup(it.exerciseId)!;
    const timed = isTimedKind(ex.kind);
    const hold = ex.kind === "time";
    const sets = timed ? [] : it.sets.filter((s) => s.reps !== null && s.reps > 0);
    const reps = sets.map((s) => s.reps!);
    const se: SessionExercise = {
      id: uuid(),
      sessionId,
      exerciseId: ex.id,
      position,
      name: ex.name,
      targetSets: timed ? 1 : Math.max(1, sets.length),
      repsMin: timed ? Math.max(1, Math.round(it.minutes ?? 0)) : reps.length ? Math.min(...reps) : 10,
      repsMax: timed ? Math.max(1, Math.round(it.minutes ?? 0)) : reps.length ? Math.max(...reps) : 12,
      targetUnit: timed ? "minutes" : hold ? "seconds" : "reps",
      perSide: false,
      restSeconds: 0,
      usesWeight: ex.usesWeight,
      status: timed ? (it.minutes ? "completed" : "pending") : sets.length ? "completed" : "pending",
      startedAt,
      completedAt: endedAt,
      durationSeconds: timed && it.minutes ? Math.round(it.minutes * 60) : null,
    };
    changes.push(upsert("sessionExercises", se));
    sets.forEach((s, i) =>
      changes.push(
        upsert("sets", {
          id: uuid(),
          sessionExerciseId: se.id,
          sessionId,
          setNumber: i + 1,
          reps: hold ? null : s.reps,
          weight: ex.usesWeight ? s.weight : null,
          weightUnit: ex.usesWeight && s.weight !== null ? args.units : null,
          durationSeconds: hold ? s.reps : null,
          completedAt: endedAt,
        } satisfies CompletedSet),
      ),
    );
  });
  return { changes, sessionId };
}

function isTimedKind(kind: string) {
  return kind === "cardio" || kind === "mobility";
}
