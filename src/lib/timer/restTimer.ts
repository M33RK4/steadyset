/**
 * Rest timer as a pure state machine. Remaining time is always derived from an absolute
 * timestamp (`endsAt`), never from counting interval ticks, so it stays correct when the tab
 * is throttled in the background, the device sleeps, or the page is reloaded.
 */
export type TimerStatus = "idle" | "running" | "paused" | "done";

export interface TimerState {
  /** Unique per countdown; used to make completion handling idempotent. */
  runId: string | null;
  status: TimerStatus;
  durationMs: number;
  /** Epoch ms at which a running timer reaches zero. */
  endsAt: number | null;
  /** Frozen remaining time while paused. */
  pausedRemainingMs: number;
  /** Which exercise/set the rest leads into. */
  sessionExerciseId: string | null;
  nextSetNumber: number | null;
  /** True once the ding/notification for this run has been played (never play twice). */
  alerted: boolean;
  finishedAt: number | null;
}

export const IDLE_TIMER: TimerState = {
  runId: null,
  status: "idle",
  durationMs: 0,
  endsAt: null,
  pausedRemainingMs: 0,
  sessionExerciseId: null,
  nextSetNumber: null,
  alerted: false,
  finishedAt: null,
};

export const REST_PRESETS = [30, 45, 60, 90, 120] as const;

export function startTimer(
  durationSeconds: number,
  now: number,
  meta: { runId: string; sessionExerciseId: string | null; nextSetNumber: number | null },
): TimerState {
  const durationMs = Math.max(1, Math.round(durationSeconds)) * 1000;
  return {
    runId: meta.runId,
    status: "running",
    durationMs,
    endsAt: now + durationMs,
    pausedRemainingMs: 0,
    sessionExerciseId: meta.sessionExerciseId,
    nextSetNumber: meta.nextSetNumber,
    alerted: false,
    finishedAt: null,
  };
}

export function remainingMs(t: TimerState, now: number): number {
  switch (t.status) {
    case "running":
      return Math.max(0, (t.endsAt ?? now) - now);
    case "paused":
      return t.pausedRemainingMs;
    default:
      return 0;
  }
}

/** 0 → 1 progress of the rest period. */
export function progress(t: TimerState, now: number): number {
  if (t.status === "idle") return 0;
  if (t.status === "done") return 1;
  return t.durationMs === 0 ? 1 : 1 - remainingMs(t, now) / t.durationMs;
}

export function pauseTimer(t: TimerState, now: number): TimerState {
  if (t.status !== "running") return t;
  const rem = remainingMs(t, now);
  if (rem <= 0) return tick(t, now).state;
  return { ...t, status: "paused", pausedRemainingMs: rem, endsAt: null };
}

export function resumeTimer(t: TimerState, now: number): TimerState {
  if (t.status !== "paused") return t;
  return { ...t, status: "running", endsAt: now + t.pausedRemainingMs, pausedRemainingMs: 0 };
}

/** Skipping ends the rest immediately without an alert. */
export function skipTimer(t: TimerState, now: number): TimerState {
  if (t.status !== "running" && t.status !== "paused") return t;
  return { ...t, status: "done", endsAt: null, pausedRemainingMs: 0, alerted: true, finishedAt: now };
}

export function adjustTimer(t: TimerState, deltaSeconds: number, now: number): TimerState {
  const delta = deltaSeconds * 1000;
  if (t.status === "running") {
    const endsAt = Math.max(now + 1000, (t.endsAt ?? now) + delta);
    return { ...t, endsAt, durationMs: Math.max(1000, t.durationMs + delta) };
  }
  if (t.status === "paused") {
    const rem = Math.max(1000, t.pausedRemainingMs + delta);
    return { ...t, pausedRemainingMs: rem, durationMs: Math.max(rem, t.durationMs + delta) };
  }
  return t;
}

export function clearTimer(): TimerState {
  return { ...IDLE_TIMER };
}

/**
 * Advance the timer to `now`. `shouldAlert` is true exactly once per run: the first time the
 * countdown is observed at zero and no alert has been played yet. The caller plays the sound
 * and then calls `markAlerted`, which is persisted — so reloads never replay the ding.
 */
export function tick(t: TimerState, now: number): { state: TimerState; shouldAlert: boolean } {
  if (t.status === "running" && t.endsAt !== null && now >= t.endsAt) {
    const state: TimerState = { ...t, status: "done", finishedAt: t.endsAt, endsAt: null };
    return { state, shouldAlert: !t.alerted };
  }
  if (t.status === "done" && !t.alerted) return { state: t, shouldAlert: true };
  return { state: t, shouldAlert: false };
}

export function markAlerted(t: TimerState): TimerState {
  return t.alerted ? t : { ...t, alerted: true };
}

/** If the countdown ended long ago (e.g. app reopened much later), show it silently. */
export function isStale(t: TimerState, now: number, maxAgeMs = 60_000): boolean {
  return t.status === "done" && t.finishedAt !== null && now - t.finishedAt > maxAgeMs;
}
