"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/lib/store/AppStore";
import { BUILT_IN_EXERCISES } from "@/lib/data/exercises";
import type { Exercise } from "@/lib/domain/types";
import { todayLocal } from "@/lib/util/dates";
import { makeContext } from "@/lib/calendar/calendar";

/** Today's local date; re-renders after midnight. */
export function useToday() {
  const [today, setToday] = useState(() => todayLocal());
  useEffect(() => {
    const id = setInterval(() => {
      const t = todayLocal();
      setToday((prev) => (prev === t ? prev : t));
    }, 30_000);
    return () => clearInterval(id);
  }, []);
  return today;
}

export function useExercises() {
  const { data } = useApp();
  return useMemo(() => {
    const all: Exercise[] = [...BUILT_IN_EXERCISES, ...data.exercises];
    const byId = new Map(all.map((e) => [e.id, e]));
    return { all, byId, get: (id: string | null | undefined) => (id ? byId.get(id) : undefined) };
  }, [data.exercises]);
}

export function useCalendarContext() {
  const { data } = useApp();
  const today = useToday();
  return useMemo(() => makeContext(data, today), [data, today]);
}

export function greeting(d = new Date()) {
  const h = d.getHours();
  if (h < 5) return "Good evening";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export const DAY_KIND_LABEL = { strength: "Strength", cardio: "Cardio & mobility", activity: "Optional activity", rest: "Rest" } as const;
