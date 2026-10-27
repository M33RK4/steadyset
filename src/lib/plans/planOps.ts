import type { AppData, Plan, PlanDay, PlanExercise, Weekday } from "../domain/types";
import { del, upsert, type Change } from "../domain/changes";
import type { PlanTemplate } from "../data/defaultPlan";
import { exerciseIdBySlug } from "../data/exercises";
import { uuid } from "../util/ids";

export function daysOfPlan(data: AppData, planId: string): PlanDay[] {
  return data.planDays.filter((d) => d.planId === planId).sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7));
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

/** Copy a template into the user's own plans. */
export function instantiateTemplate(
  data: AppData,
  template: PlanTemplate,
  opts: { makeActive: boolean; name?: string; now?: Date },
): { changes: Change[]; planId: string } {
  const now = (opts.now ?? new Date()).toISOString();
  const plan: Plan = {
    id: uuid(),
    name: opts.name ?? template.name,
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
    plan: { id: planId, name: "", description: "", isActive: false, archivedAt: null, templateKey: null, createdAt: iso, updatedAt: iso },
    days: [],
  };
}

export function validateDraft(d: PlanDraft): string[] {
  const errors: string[] = [];
  if (!d.plan.name.trim()) errors.push("Give your plan a name.");
  const seen = new Set<number>();
  for (const day of d.days) {
    if (seen.has(day.weekday)) errors.push("Each weekday can only have one workout.");
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
