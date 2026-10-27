import type { CompletedSet, SessionExercise, SessionExerciseStatus, WorkoutSession } from "../domain/types";

export interface Buddy {
  id: string;
  name: string;
  connectedAt: string;
}

export interface BuddyLiveExercise {
  id: string;
  name: string;
  targetSets: number;
  setsDone: number;
  status: SessionExerciseStatus;
  /** Timed items (cardio / mobility minutes) have no strength sets — they're just done or not. */
  timed: boolean;
}

export interface BuddyLive {
  session: Pick<WorkoutSession, "id" | "title" | "status" | "startedAt" | "endedAt"> | null;
  exercises: BuddyLiveExercise[];
  doneExercises: number;
  totalExercises: number;
  setsDone: number;
  /** When the buddy last ticked something off (or started), ISO time. */
  lastActivityAt: string | null;
  /** Working out right now. */
  isLive: boolean;
}

/** An in-progress session with no activity for this long is treated as forgotten, not live. */
export const LIVE_IDLE_LIMIT_MS = 2 * 60 * 60 * 1000;

export const EMPTY_LIVE: BuddyLive = { session: null, exercises: [], doneExercises: 0, totalExercises: 0, setsDone: 0, lastActivityAt: null, isLive: false };

/** Summarises a buddy's latest session (already limited to the last hours by the database). */
export function summarizeBuddyWorkout(session: WorkoutSession | null, exercises: SessionExercise[], sets: CompletedSet[], now = Date.now()): BuddyLive {
  if (!session) return EMPTY_LIVE;
  const own = exercises.filter((e) => e.sessionId === session.id).sort((a, b) => a.position - b.position);
  const ownSets = sets.filter((s) => s.sessionId === session.id);
  const setsByExercise = new Map<string, Set<number>>();
  for (const s of ownSets) {
    const done = setsByExercise.get(s.sessionExerciseId) ?? new Set<number>();
    done.add(s.setNumber); // a set number counts once, even if a retry delivered it twice
    setsByExercise.set(s.sessionExerciseId, done);
  }
  const list: BuddyLiveExercise[] = own.map((e) => ({
    id: e.id,
    name: e.name,
    targetSets: e.targetSets,
    setsDone: Math.min(setsByExercise.get(e.id)?.size ?? 0, e.targetSets),
    status: e.status,
    timed: e.durationSeconds !== null || e.targetUnit === "minutes",
  }));
  const times = [session.startedAt, ...ownSets.map((s) => s.completedAt), ...own.map((e) => e.completedAt).filter((t): t is string => !!t)];
  const lastActivityAt = times.reduce((a, b) => (b > a ? b : a));
  const isLive = session.status === "in_progress" && now - Date.parse(lastActivityAt) < LIVE_IDLE_LIMIT_MS;
  return {
    session: { id: session.id, title: session.title, status: session.status, startedAt: session.startedAt, endedAt: session.endedAt },
    exercises: list,
    doneExercises: list.filter((e) => e.status === "completed").length,
    totalExercises: list.length,
    setsDone: [...setsByExercise.values()].reduce((n, s) => n + s.size, 0),
    lastActivityAt,
    isLive,
  };
}

/** A short line describing what a buddy is up to. */
export function buddyStatusLine(live: BuddyLive, now = Date.now()): string {
  if (!live.session) return "Hasn't trained today yet";
  const mins = Math.max(1, Math.round((now - Date.parse(live.session.startedAt)) / 60000));
  if (live.isLive) return `Training now · ${live.session.title} · ${mins} min in`;
  if (live.session.status === "completed") return `Finished ${live.session.title} today`;
  if (live.session.status === "partial") return `Did part of ${live.session.title} today`;
  return `Started ${live.session.title} earlier`;
}
