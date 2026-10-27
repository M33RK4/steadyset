import type { LocalDate, Weekday } from "../domain/types";

// All calendar logic works on local "YYYY-MM-DD" strings built from the device's local time,
// never from toISOString() (which is UTC and would shift days around midnight).

const pad = (n: number) => String(n).padStart(2, "0");

export function toLocalDate(d: Date): LocalDate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayLocal(now: Date = new Date()): LocalDate {
  return toLocalDate(now);
}

/** Parse "YYYY-MM-DD" as local midnight. */
export function parseLocalDate(s: LocalDate): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: LocalDate, n: number): LocalDate {
  const d = parseLocalDate(s);
  d.setDate(d.getDate() + n);
  return toLocalDate(d);
}

export function weekdayOf(s: LocalDate): Weekday {
  return parseLocalDate(s).getDay() as Weekday;
}

/** Days between two local dates (b - a), DST-safe. */
export function diffDays(a: LocalDate, b: LocalDate): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

export function startOfWeek(s: LocalDate, weekStartsOn: 0 | 1): LocalDate {
  const wd = weekdayOf(s);
  const back = (wd - weekStartsOn + 7) % 7;
  return addDays(s, -back);
}

export function weekDates(s: LocalDate, weekStartsOn: 0 | 1): LocalDate[] {
  const start = startOfWeek(s, weekStartsOn);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function startOfMonth(s: LocalDate): LocalDate {
  return s.slice(0, 8) + "01";
}

export function addMonths(s: LocalDate, n: number): LocalDate {
  const d = parseLocalDate(startOfMonth(s));
  d.setMonth(d.getMonth() + n);
  return toLocalDate(d);
}

/** 6x7 grid of dates covering the month containing `s`. */
export function monthGrid(s: LocalDate, weekStartsOn: 0 | 1): LocalDate[] {
  const first = startOfWeek(startOfMonth(s), weekStartsOn);
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

export function sameMonth(a: LocalDate, b: LocalDate) {
  return a.slice(0, 7) === b.slice(0, 7);
}

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function orderedWeekdays(weekStartsOn: 0 | 1): Weekday[] {
  return Array.from({ length: 7 }, (_, i) => ((i + weekStartsOn) % 7) as Weekday);
}

export function formatLongDate(s: LocalDate, locale?: string): string {
  return parseLocalDate(s).toLocaleDateString(locale, { weekday: "long", month: "long", day: "numeric" });
}

export function formatShortDate(s: LocalDate, locale?: string): string {
  return parseLocalDate(s).toLocaleDateString(locale, { month: "short", day: "numeric" });
}

export function formatMonthYear(s: LocalDate, locale?: string): string {
  return parseLocalDate(s).toLocaleDateString(locale, { month: "long", year: "numeric" });
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds < 60) return seconds ? `${Math.round(seconds)} s` : "—";
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}
