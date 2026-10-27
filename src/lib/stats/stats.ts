import type { AppData, LocalDate, Units } from "../domain/types";
import { addDays, startOfWeek } from "../util/dates";

const finished = (data: AppData) => data.sessions.filter((s) => s.status === "completed" || s.status === "partial");

export function totals(data: AppData) {
  const sessions = finished(data);
  const ids = new Set(sessions.map((s) => s.id));
  const sets = data.sets.filter((s) => ids.has(s.sessionId)).length;
  const seconds = sessions.reduce((n, s) => n + (s.durationSeconds ?? 0), 0);
  return {
    sessions: sessions.length,
    completed: sessions.filter((s) => s.status === "completed").length,
    partial: sessions.filter((s) => s.status === "partial").length,
    sets,
    seconds,
  };
}

export interface Bucket {
  key: LocalDate;
  label: string;
  sessions: number;
  minutes: number;
  sets: number;
}

export function weeklyBuckets(data: AppData, today: LocalDate, weeks: number, weekStartsOn: 0 | 1): Bucket[] {
  const thisWeek = startOfWeek(today, weekStartsOn);
  const buckets: Bucket[] = Array.from({ length: weeks }, (_, i) => {
    const key = addDays(thisWeek, -7 * (weeks - 1 - i));
    const [, m, d] = key.split("-").map(Number);
    return { key, label: `${d}/${m}`, sessions: 0, minutes: 0, sets: 0 };
  });
  const setsBySession = countSetsBySession(data);
  for (const s of finished(data)) {
    const wk = startOfWeek(s.localDate, weekStartsOn);
    const b = buckets.find((x) => x.key === wk);
    if (!b) continue;
    b.sessions++;
    b.minutes += Math.round((s.durationSeconds ?? 0) / 60);
    b.sets += setsBySession.get(s.id) ?? 0;
  }
  return buckets;
}

export function monthlyBuckets(data: AppData, today: LocalDate, months: number): Bucket[] {
  const [ty, tm] = today.split("-").map(Number);
  const buckets: Bucket[] = Array.from({ length: months }, (_, i) => {
    const d = new Date(ty, tm - 1 - (months - 1 - i), 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    return { key, label: d.toLocaleDateString(undefined, { month: "short" }), sessions: 0, minutes: 0, sets: 0 };
  });
  const setsBySession = countSetsBySession(data);
  for (const s of finished(data)) {
    const b = buckets.find((x) => x.key.slice(0, 7) === s.localDate.slice(0, 7));
    if (!b) continue;
    b.sessions++;
    b.minutes += Math.round((s.durationSeconds ?? 0) / 60);
    b.sets += setsBySession.get(s.id) ?? 0;
  }
  return buckets;
}

function countSetsBySession(data: AppData) {
  const m = new Map<string, number>();
  for (const s of data.sets) m.set(s.sessionId, (m.get(s.sessionId) ?? 0) + 1);
  return m;
}

export const KG_PER_LB = 0.45359237;
export function convertWeight(value: number, from: Units, to: Units): number {
  if (from === to) return value;
  return from === "kg" ? value / KG_PER_LB : value * KG_PER_LB;
}
export function roundWeight(v: number) {
  return Math.round(v * 10) / 10;
}

export interface ExerciseHistoryEntry {
  sessionId: string;
  date: LocalDate;
  sets: { setNumber: number; reps: number | null; weight: number | null; durationSeconds: number | null }[];
  topWeight: number | null;
  totalReps: number;
  volume: number; // sum(weight × reps), in display units
}

/** Per-exercise history (matched by stable exercise id, falling back to the name snapshot). */
export function exerciseHistory(data: AppData, key: { exerciseId: string | null; name: string }, units: Units): ExerciseHistoryEntry[] {
  const sessionsById = new Map(finished(data).map((s) => [s.id, s]));
  const entries: ExerciseHistoryEntry[] = [];
  for (const se of data.sessionExercises) {
    const match = key.exerciseId ? se.exerciseId === key.exerciseId : se.name === key.name;
    const session = sessionsById.get(se.sessionId);
    if (!match || !session) continue;
    const sets = data.sets
      .filter((s) => s.sessionExerciseId === se.id)
      .sort((a, b) => a.setNumber - b.setNumber)
      .map((s) => ({
        setNumber: s.setNumber,
        reps: s.reps,
        weight: s.weight !== null && s.weightUnit ? roundWeight(convertWeight(s.weight, s.weightUnit, units)) : s.weight,
        durationSeconds: s.durationSeconds,
      }));
    if (!sets.length) continue;
    const weights = sets.map((s) => s.weight).filter((w): w is number => w !== null);
    entries.push({
      sessionId: session.id,
      date: session.localDate,
      sets,
      topWeight: weights.length ? Math.max(...weights) : null,
      totalReps: sets.reduce((n, s) => n + (s.reps ?? 0), 0),
      volume: roundWeight(sets.reduce((n, s) => n + (s.weight ?? 0) * (s.reps ?? 0), 0)),
    });
  }
  return entries.sort((a, b) => a.date.localeCompare(b.date));
}

/** Exercises the user has actually logged sets for, most recent first. */
export function loggedExercises(data: AppData): { exerciseId: string | null; name: string; lastDate: LocalDate; count: number }[] {
  const sessionsById = new Map(finished(data).map((s) => [s.id, s]));
  const withSets = new Set(data.sets.map((s) => s.sessionExerciseId));
  const map = new Map<string, { exerciseId: string | null; name: string; lastDate: LocalDate; count: number }>();
  for (const se of data.sessionExercises) {
    const s = sessionsById.get(se.sessionId);
    if (!s || !withSets.has(se.id)) continue;
    const k = se.exerciseId ?? `name:${se.name}`;
    const cur = map.get(k);
    if (!cur) map.set(k, { exerciseId: se.exerciseId, name: se.name, lastDate: s.localDate, count: 1 });
    else {
      cur.count++;
      if (s.localDate > cur.lastDate) cur.lastDate = s.localDate;
    }
  }
  return [...map.values()].sort((a, b) => b.lastDate.localeCompare(a.lastDate));
}

/** Share of scheduled (required) days in the last N weeks that had a session. */
export function consistency(requiredDays: number, doneDays: number): number | null {
  if (requiredDays === 0) return null;
  return Math.round((Math.min(doneDays, requiredDays) / requiredDays) * 100);
}
