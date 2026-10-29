import type { AppData, LocalDate, Plan, PlanDay, PlanExercise, Weekday } from "../domain/types";
import { del, upsert, type Change } from "../domain/changes";
import type { PlanTemplate } from "../data/defaultPlan";
import { exerciseIdBySlug } from "../data/exercises";
import { uuid } from "../util/ids";
import { addDays, diffDays, toLocalDate, weekdayOf } from "../util/dates";

/** Cycle plans repeat their days in order; weekly plans tie each day to a weekday. */
export function isCycle(plan: Pick<Plan, "schedule"> | undefined | null): boolean {
  return plan?.schedule === "cycle";
}

/** A plan's days in order: Monday first for weekly plans, Day 1 first for cycles. */
export function daysOfPlan(data: AppData, planId: string): PlanDay[] {
  const cycle = isCycle(data.plans.find((p) => p.id === planId));
  const key = (d: PlanDay) => (cycle ? d.weekday : (d.weekday + 6) % 7);
  return data.planDays.filter((d) => d.planId === planId).sort((a, b) => key(a) - key(b));
}

/** Which position of an n-day cycle falls on a date (0 = Day 1). Works before the start too. */
export function cyclePosition(cycleStart: LocalDate, date: LocalDate, length: number): number {
  return ((diffDays(cycleStart, date) % length) + length) % length;
}

/** The start date that makes `date` fall on cycle position `position`. */
export function cycleStartFor(date: LocalDate, position: number): LocalDate {
  return addDays(date, -position);
}

/** The plan day a date falls on by the plan's own schedule (before any skip / move). */
export function planDayOn(data: AppData, plan: Plan, date: LocalDate): PlanDay | null {
  const days = daysOfPlan(data, plan.id);
  if (!isCycle(plan)) return days.find((d) => d.weekday === weekdayOf(date)) ?? null;
  if (!days.length) return null;
  const start = plan.cycleStart ?? toLocalDate(new Date(plan.createdAt));
  return days[cyclePosition(start, date, days.length)];
}

/** "Day 2" for cycles, "Tuesday" for weekly plans. */
export function dayLabel(plan: Pick<Plan, "schedule"> | undefined, day: Pick<PlanDay, "weekday">, weekdayNames: readonly string[]): string {
  return isCycle(plan) ? `Day ${day.weekday + 1}` : weekdayNames[day.weekday];
}

export function exercisesOfDay(data: AppData, dayId: string): PlanExercise[] {
  return data.planExercises.filter((e) => e.planDayId === dayId).sort((a, b) => a.position - b.position);
}

export function activePlan(data: AppData): Plan | undefined {
  return data.plans.find((p) => p.isActive && !p.archivedAt);
}

export function dayForWeekday(data: AppData, planId: string, weekday: Weekday): PlanDay | undefined {
  return data.planDays.find((d) => d.planId === planId && d.weekday === weekday);
}

function templateContent(template: PlanTemplate, planId: string): { days: PlanDay[]; exercises: PlanExercise[] } {
  const days: PlanDay[] = [];
  const exercises: PlanExercise[] = [];
  for (const td of template.days) {
    const day: PlanDay = {
      id: uuid(),
      planId,
      weekday: td.weekday,
      name: td.name,
      kind: td.kind,
      notes: td.notes ?? "",
      optional: td.optional ?? false,
    };
    days.push(day);
    td.exercises.forEach((te, i) =>
      exercises.push({
        id: uuid(),
        planDayId: day.id,
        exerciseId: exerciseIdBySlug(te.slug),
        position: i,
        sets: te.sets,
        repsMin: te.repsMin,
        repsMax: te.repsMax,
        targetUnit: te.targetUnit ?? "reps",
        perSide: te.perSide ?? false,
        restSeconds: te.restSeconds,
        notes: te.notes ?? "",
      }),
    );
  }
  return { days, exercises };
}

/**
 * Copy a template into the user's own plans. Cycle templates can be reordered with `order`
 * (template day indexes in the order wanted) and started on any day with `todayPosition`.
 */
export function instantiateTemplate(
  data: AppData,
  template: PlanTemplate,
  opts: { makeActive: boolean; name?: string; now?: Date; order?: number[]; todayPosition?: number },
): { changes: Change[]; planId: string } {
  const nowDate = opts.now ?? new Date();
  const now = nowDate.toISOString();
  const cycle = template.schedule === "cycle";
  if (cycle && opts.order) {
    const order = opts.order;
    template = { ...template, days: order.map((i, pos) => ({ ...template.days[i], weekday: pos as Weekday })) };
  }
  const plan: Plan = {
    id: uuid(),
    name: opts.name ?? template.name,
    schedule: cycle ? "cycle" : "weekly",
    cycleStart: cycle ? cycleStartFor(toLocalDate(nowDate), opts.todayPosition ?? 0) : null,
    description: template.description,
    isActive: opts.makeActive,
    archivedAt: null,
    templateKey: template.key,
    createdAt: now,
    updatedAt: now,
  };
  const { days, exercises } = templateContent(template, plan.id);
  const changes: Change[] = [];
  if (opts.makeActive) changes.push(...deactivateOthers(data, plan.id, now));
  changes.push(upsert("plans", plan), ...days.map((d) => upsert("planDays", d)), ...exercises.map((e) => upsert("planExercises", e)));
  return { changes, planId: plan.id };
}

/** Replace a plan's days and exercises with the original template (plan id and history are kept). */
export function resetPlanToTemplate(data: AppData, planId: string, template: PlanTemplate, now = new Date()): Change[] {
  const plan = data.plans.find((p) => p.id === planId);
  if (!plan) return [];
  const oldDays = data.planDays.filter((d) => d.planId === planId);
  const oldDayIds = new Set(oldDays.map((d) => d.id));
  const changes: Change[] = [
    ...data.planExercises.filter((e) => oldDayIds.has(e.planDayId)).map((e) => del("planExercises", e.id)),
    ...oldDays.map((d) => del("planDays", d.id)),
  ];
  const { days, exercises } = templateContent(template, planId);
  changes.push(
    upsert("plans", { ...plan, name: template.name, description: template.description, templateKey: template.key, updatedAt: now.toISOString() }),
    ...days.map((d) => upsert("planDays", d)),
    ...exercises.map((e) => upsert("planExercises", e)),
  );
  return changes;
}

function deactivateOthers(data: AppData, keepId: string, now: string): Change[] {
  return data.plans.filter((p) => p.isActive && p.id !== keepId).map((p) => upsert("plans", { ...p, isActive: false, updatedAt: now }));
}

export function setActivePlan(data: AppData, planId: string, now = new Date()): Change[] {
  const plan = data.plans.find((p) => p.id === planId);
  if (!plan) return [];
  const iso = now.toISOString();
  return [...deactivateOthers(data, planId, iso), upsert("plans", { ...plan, isActive: true, archivedAt: null, updatedAt: iso })];
}

export function duplicatePlan(data: AppData, planId: string, now = new Date()): { changes: Change[]; planId: string } {
  const src = data.plans.find((p) => p.id === planId);
  if (!src) return { changes: [], planId };
  const iso = now.toISOString();
  const copy: Plan = { ...src, id: uuid(), name: `${src.name} (copy)`, isActive: false, archivedAt: null, createdAt: iso, updatedAt: iso };
  const changes: Change[] = [upsert("plans", copy)];
  for (const d of daysOfPlan(data, planId)) {
    const nd: PlanDay = { ...d, id: uuid(), planId: copy.id };
    changes.push(upsert("planDays", nd));
    for (const e of exercisesOfDay(data, d.id)) changes.push(upsert("planExercises", { ...e, id: uuid(), planDayId: nd.id }));
  }
  return { changes, planId: copy.id };
}

export function archivePlan(data: AppData, planId: string, archived: boolean, now = new Date()): Change[] {
  const plan = data.plans.find((p) => p.id === planId);
  if (!plan) return [];
  return [upsert("plans", { ...plan, archivedAt: archived ? now.toISOString() : null, isActive: archived ? false : plan.isActive, updatedAt: now.toISOString() })];
}

/**
 * Delete a plan and its days/exercises. Workout sessions keep their snapshot (title, plan name,
 * exercise names, targets) and only lose the link — history is never deleted with a plan.
 */
export function deletePlan(data: AppData, planId: string): Change[] {
  const dayIds = new Set(data.planDays.filter((d) => d.planId === planId).map((d) => d.id));
  const changes: Change[] = [];
  for (const s of data.sessions) {
    if (s.planId === planId || (s.planDayId && dayIds.has(s.planDayId))) {
      changes.push(upsert("sessions", { ...s, planId: null, planDayId: null }));
    }
  }
  for (const o of data.overrides) if (o.planDayId && dayIds.has(o.planDayId)) changes.push(del("overrides", o.id));
  changes.push(...data.planExercises.filter((e) => dayIds.has(e.planDayId)).map((e) => del("planExercises", e.id)));
  changes.push(...[...dayIds].map((id) => del("planDays", id)));
  changes.push(del("plans", planId));
  return changes;
}

/** Shape used by the plan editor: a full draft of one plan that is saved in one go. */
export interface PlanDraft {
  plan: Plan;
  days: (PlanDay & { exercises: PlanExercise[] })[];
}

export function draftFromPlan(data: AppData, planId: string): PlanDraft | null {
  const plan = data.plans.find((p) => p.id === planId);
  if (!plan) return null;
  return {
    plan: { ...plan },
    days: daysOfPlan(data, planId).map((d) => ({ ...d, exercises: exercisesOfDay(data, d.id).map((e) => ({ ...e })) })),
  };
}

export function newDraft(now = new Date()): PlanDraft {
  const iso = now.toISOString();
  const planId = uuid();
  return {
    plan: { id: planId, name: "", schedule: "weekly", cycleStart: null, description: "", isActive: false, archivedAt: null, templateKey: null, createdAt: iso, updatedAt: iso },
    days: [],
  };
}

export function validateDraft(d: PlanDraft): string[] {
  const errors: string[] = [];
  if (!d.plan.name.trim()) errors.push("Give your plan a name.");
  const seen = new Set<number>();
  const cycle = isCycle(d.plan);
  if (cycle && d.days.length < 2) errors.push("A repeating cycle needs at least 2 days.");
  if (cycle && d.days.length > 7) errors.push("A repeating cycle can have at most 7 days.");
  for (const day of d.days) {
    if (seen.has(day.weekday)) errors.push(cycle ? "Two days share the same place in the cycle." : "Each weekday can only have one workout.");
    seen.add(day.weekday);
    if (!day.name.trim()) errors.push("Every workout day needs a name.");
    for (const e of day.exercises) {
      if (e.sets < 1 || e.sets > 20) errors.push(`Sets must be between 1 and 20 (${day.name}).`);
      if (e.repsMin < 1 || e.repsMax < e.repsMin) errors.push(`Check the rep range in ${day.name}.`);
      if (e.restSeconds < 0 || e.restSeconds > 900) errors.push(`Rest must be between 0 and 900 seconds (${day.name}).`);
    }
  }
  return [...new Set(errors)];
}

/** Diff a draft against stored data and produce the minimal set of changes. */
export function saveDraft(data: AppData, draft: PlanDraft, now = new Date()): Change[] {
  const iso = now.toISOString();
  const changes: Change[] = [];
  const existingDays = data.planDays.filter((d) => d.planId === draft.plan.id);
  const existingDayIds = new Set(existingDays.map((d) => d.id));
  const keptDayIds = new Set(draft.days.map((d) => d.id));
  const existingEx = data.planExercises.filter((e) => existingDayIds.has(e.planDayId));
  const keptExIds = new Set(draft.days.flatMap((d) => d.exercises.map((e) => e.id)));

  if (draft.plan.isActive) changes.push(...deactivateOthers(data, draft.plan.id, iso));
  changes.push(upsert("plans", { ...draft.plan, name: draft.plan.name.trim(), updatedAt: iso }));
  for (const day of draft.days) {
    const { exercises, ...row } = day;
    changes.push(upsert("planDays", { ...row, planId: draft.plan.id }));
    exercises.forEach((e, i) => changes.push(upsert("planExercises", { ...e, planDayId: day.id, position: i })));
  }
  for (const e of existingEx) if (!keptExIds.has(e.id)) changes.push(del("planExercises", e.id));
  for (const d of existingDays) {
    if (!keptDayIds.has(d.id)) {
      for (const o of data.overrides) if (o.planDayId === d.id) changes.push(del("overrides", o.id));
      for (const s of data.sessions) if (s.planDayId === d.id) changes.push(upsert("sessions", { ...s, planDayId: null }));
      changes.push(del("planDays", d.id));
    }
  }
  return changes;
}

export function estimateMinutes(data: AppData, dayId: string): number {
  const exs = exercisesOfDay(data, dayId);
  let seconds = 0;
  for (const e of exs) {
    if (e.targetUnit === "minutes") seconds += e.repsMax * 60;
    else {
      const work = e.targetUnit === "seconds" ? e.repsMax : e.repsMax * 3.5 * (e.perSide ? 2 : 1);
      seconds += e.sets * work + Math.max(0, e.sets - 1) * e.restSeconds + 90; // + setup/transition
    }
  }
  return Math.max(5, Math.round(seconds / 300) * 5);
}

export function formatTarget(e: { sets: number; repsMin: number; repsMax: number; targetUnit: string; perSide: boolean }): string {
  const range = e.repsMin === e.repsMax ? `${e.repsMin}` : `${e.repsMin}–${e.repsMax}`;
  if (e.targetUnit === "minutes") return `${range} min`;
  const unit = e.targetUnit === "seconds" ? " s" : " reps";
  return `${e.sets} × ${range}${unit}${e.perSide ? " / side" : ""}`;
}

/** Switch a draft between a weekly plan and a repeating cycle, keeping the days in order. */
export function convertDraftSchedule(draft: PlanDraft, to: "weekly" | "cycle", today: LocalDate): PlanDraft {
  if ((draft.plan.schedule ?? "weekly") === to) return draft;
  const ordered = [...draft.days].sort((a, b) => (to === "cycle" ? (a.weekday + 6) % 7 - (b.weekday + 6) % 7 : a.weekday - b.weekday)).slice(0, 7);
  return {
    plan: { ...draft.plan, schedule: to, cycleStart: to === "cycle" ? today : null },
    // to a cycle: Monday's day becomes Day 1; to weekly: Day 1 becomes Monday, Day 2 Tuesday …
    days: ordered.map((d, i) => ({ ...d, weekday: (to === "cycle" ? i : (i + 1) % 7) as Weekday })),
  };
}

/** Move a cycle day earlier or later, renumbering the cycle positions. */
export function moveCycleDay(draft: PlanDraft, dayId: string, delta: number): PlanDraft {
  const days = [...draft.days].sort((a, b) => a.weekday - b.weekday);
  const i = days.findIndex((d) => d.id === dayId);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= days.length) return draft;
  [days[i], days[j]] = [days[j], days[i]];
  return { ...draft, days: days.map((d, pos) => ({ ...d, weekday: pos as Weekday })) };
}

/**
 * Where a workout done on `date` would go in the active plan: weekly plans use that weekday,
 * cycles the day of the cycle that falls on it. Without a plan a new weekly one is created.
 */
export function planSlotFor(data: AppData, date: LocalDate): { plan: Plan | undefined; position: Weekday; existing: PlanDay | undefined } {
  const plan = activePlan(data);
  if (plan && isCycle(plan)) {
    const days = daysOfPlan(data, plan.id);
    const position = (days.length && plan.cycleStart ? cyclePosition(plan.cycleStart, date, days.length) : 0) as Weekday;
    return { plan, position, existing: days.find((d) => d.weekday === position) };
  }
  const position = weekdayOf(date);
  return { plan, position, existing: plan ? dayForWeekday(data, plan.id, position) : undefined };
}

/**
 * Make a logged workout the plan's workout for that day (see `planSlotFor`), using what was
 * actually done as the targets. An existing day in that slot is replaced; the session is then
 * linked to the day so the calendar shows it as done.
 */
export function saveSessionAsPlanDay(data: AppData, sessionId: string, opts: { restSeconds: number; now?: Date }): { changes: Change[]; planId: string } {
  const now = opts.now ?? new Date();
  const session = data.sessions.find((s) => s.id === sessionId);
  if (!session) return { changes: [], planId: "" };
  const { plan, position, existing } = planSlotFor(data, session.localDate);
  const fresh = newDraft(now);
  const draft: PlanDraft = plan ? draftFromPlan(data, plan.id)! : { ...fresh, plan: { ...fresh.plan, name: "My plan", isActive: true } };
  const dayId = existing?.id ?? uuid();
  const ses = data.sessionExercises.filter((e) => e.sessionId === sessionId && e.exerciseId).sort((a, b) => a.position - b.position);
  const exercises: PlanExercise[] = ses.map((e, i) => {
    const sets = data.sets.filter((s) => s.sessionExerciseId === e.id);
    const timed = e.targetUnit === "minutes";
    const values = sets.map((s) => (e.targetUnit === "seconds" ? s.durationSeconds : s.reps)).filter((v): v is number => v !== null && v > 0);
    const minutes = e.durationSeconds ? Math.max(1, Math.round(e.durationSeconds / 60)) : e.repsMin;
    return {
      id: uuid(),
      planDayId: dayId,
      exerciseId: e.exerciseId!,
      position: i,
      sets: timed ? 1 : Math.max(1, sets.length || e.targetSets),
      repsMin: timed ? minutes : values.length ? Math.min(...values) : e.repsMin,
      repsMax: timed ? minutes : values.length ? Math.max(...values) : e.repsMax,
      targetUnit: e.targetUnit,
      perSide: e.perSide,
      restSeconds: timed ? 0 : opts.restSeconds,
      notes: "",
    };
  });
  const day: PlanDraft["days"][number] = {
    id: dayId,
    planId: draft.plan.id,
    weekday: position,
    name: session.title,
    kind: session.kind === "cardio" ? "cardio" : "strength",
    notes: existing?.notes ?? "",
    optional: false,
    exercises,
  };
  draft.days = [...draft.days.filter((d) => d.weekday !== position), day];
  const changes = saveDraft(data, draft, now);
  changes.push(upsert("sessions", { ...session, planId: draft.plan.id, planDayId: dayId, planName: draft.plan.name }));
  return { changes, planId: draft.plan.id };
}
