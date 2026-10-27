"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/lib/store/AppStore";
import { draftFromPlan, newDraft, saveDraft, validateDraft, type PlanDraft } from "@/lib/plans/planOps";
import type { DayKind, PlanDay, PlanExercise, TargetUnit, Weekday } from "@/lib/domain/types";
import { orderedWeekdays, WEEKDAY_NAMES } from "@/lib/util/dates";
import { uuid } from "@/lib/util/ids";
import { REST_PRESETS } from "@/lib/timer/restTimer";
import { Badge, Button, EmptyState, Field, IconButton, Switch, cx } from "@/components/ui/primitives";
import { useConfirm, useToast } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { ExercisePicker } from "./ExercisePicker";
import { DAY_KIND_LABEL, useExercises } from "../common";

type DraftDay = PlanDraft["days"][number];

const DAY_PRESETS: { name: string; kind: DayKind }[] = [
  { name: "Glute Day", kind: "strength" },
  { name: "Upper Body Day", kind: "strength" },
  { name: "Lower Body Day", kind: "strength" },
  { name: "Full Body Day", kind: "strength" },
  { name: "Cardio Day", kind: "cardio" },
  { name: "Optional Activity", kind: "activity" },
  { name: "Rest Day", kind: "rest" },
];

export function PlanEditor() {
  const params = useParams<{ planId: string }>();
  const planId = String(params?.planId ?? "new");
  const { data, commit, prefs } = useApp();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const ex = useExercises();
  const isNew = planId === "new";
  const [draft, setDraft] = useState<PlanDraft | null>(() => (isNew ? { ...newDraft(), plan: { ...newDraft().plan, isActive: data.plans.length === 0 } } : draftFromPlan(data, planId)));
  const initial = useRef(JSON.stringify(draft));
  const [errors, setErrors] = useState<string[]>([]);
  const [picker, setPicker] = useState<string | null>(null); // day id receiving an exercise

  // If data arrives later (first load / sync), initialise the draft once.
  useEffect(() => {
    if (!draft && !isNew) {
      const d = draftFromPlan(data, planId);
      if (d) {
        setDraft(d);
        initial.current = JSON.stringify(d);
      }
    }
  }, [data, draft, isNew, planId]);

  const dirty = useMemo(() => JSON.stringify(draft) !== initial.current, [draft]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (!draft)
    return (
      <EmptyState icon="dumbbell" title="Plan not found" action={<Link href="/workouts" className="font-semibold underline">Back to My Workouts</Link>}>
        It may have been deleted on another device.
      </EmptyState>
    );

  const setPlan = (patch: Partial<PlanDraft["plan"]>) => setDraft((d) => d && { ...d, plan: { ...d.plan, ...patch } });
  const setDay = (id: string, patch: Partial<DraftDay>) => setDraft((d) => d && { ...d, days: d.days.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const setEx = (dayId: string, exId: string, patch: Partial<PlanExercise>) =>
    setDraft((d) => d && { ...d, days: d.days.map((x) => (x.id === dayId ? { ...x, exercises: x.exercises.map((e) => (e.id === exId ? { ...e, ...patch } : e)) } : x)) });
  const moveEx = (dayId: string, idx: number, delta: number) =>
    setDraft(
      (d) =>
        d && {
          ...d,
          days: d.days.map((x) => {
            if (x.id !== dayId) return x;
            const list = [...x.exercises];
            const j = idx + delta;
            if (j < 0 || j >= list.length) return x;
            [list[idx], list[j]] = [list[j], list[idx]];
            return { ...x, exercises: list.map((e, i) => ({ ...e, position: i })) };
          }),
        },
    );
  const removeEx = (dayId: string, exId: string) => setDraft((d) => d && { ...d, days: d.days.map((x) => (x.id === dayId ? { ...x, exercises: x.exercises.filter((e) => e.id !== exId) } : x)) });
  const addDay = (weekday: Weekday, preset: { name: string; kind: DayKind }) =>
    setDraft(
      (d) =>
        d && {
          ...d,
          days: [...d.days, { id: uuid(), planId: d.plan.id, weekday, name: preset.name, kind: preset.kind, notes: "", optional: preset.kind === "activity", exercises: [] }],
        },
    );
  const removeDay = (id: string) => setDraft((d) => d && { ...d, days: d.days.filter((x) => x.id !== id) });

  const addExercise = (dayId: string, exerciseId: string) => {
    const e = ex.get(exerciseId);
    const timed = e?.kind === "cardio" || e?.kind === "mobility";
    const hold = e?.kind === "time";
    setDraft(
      (d) =>
        d && {
          ...d,
          days: d.days.map((x) =>
            x.id === dayId
              ? {
                  ...x,
                  exercises: [
                    ...x.exercises,
                    {
                      id: uuid(),
                      planDayId: dayId,
                      exerciseId,
                      position: x.exercises.length,
                      sets: timed ? 1 : 3,
                      repsMin: timed ? 15 : hold ? 20 : 10,
                      repsMax: timed ? 25 : hold ? 30 : 12,
                      targetUnit: (timed ? "minutes" : hold ? "seconds" : "reps") as TargetUnit,
                      perSide: false,
                      restSeconds: timed ? 0 : prefs.defaultRestSeconds,
                      notes: "",
                    },
                  ],
                }
              : x,
          ),
        },
    );
  };

  const save = () => {
    const errs = validateDraft(draft);
    setErrors(errs);
    if (errs.length) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    commit((d) => saveDraft(d, draft));
    initial.current = JSON.stringify(draft);
    toast(isNew ? "Plan created" : "Plan saved", { tone: "success" });
    router.push("/workouts");
  };

  const cancel = async () => {
    if (dirty && !(await confirm({ title: "Discard your changes?", body: "Edits to this plan haven't been saved.", confirmLabel: "Discard changes", danger: true }))) return;
    router.push("/workouts");
  };

  const byWeekday = new Map(draft.days.map((d) => [d.weekday, d]));

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-center gap-2">
        <button type="button" onClick={cancel} className="h-11 w-11 -ml-2 grid place-items-center rounded-ctl hover:bg-raised" aria-label="Back to My Workouts">
          <Icon name="chevronLeft" />
        </button>
        <h1 className="text-3xl flex-1">{isNew ? "Create plan" : "Edit plan"}</h1>
      </div>

      {errors.length > 0 && (
        <div role="alert" className="rounded-ctl bg-danger-soft text-danger p-4">
          <p className="font-semibold">Please fix the following before saving:</p>
          <ul className="list-disc pl-5 mt-1">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <section className="card p-5 space-y-4">
        <Field label="Plan name">
          {(id) => <input id={id} className="field text-lg font-semibold" value={draft.plan.name} onChange={(e) => setPlan({ name: e.target.value })} placeholder="e.g. Summer strength" maxLength={120} />}
        </Field>
        <Field label="Description (optional)">
          {(id) => <textarea id={id} className="field min-h-20" value={draft.plan.description} onChange={(e) => setPlan({ description: e.target.value })} />}
        </Field>
        <Switch label="Active plan" description="Your active plan sets the schedule on the dashboard and calendar." checked={draft.plan.isActive} onChange={(v) => setPlan({ isActive: v })} />
      </section>

      <section className="space-y-3" aria-labelledby="sched-h">
        <div>
          <h2 id="sched-h" className="text-xl">
            Weekly schedule
          </h2>
          <p className="text-muted text-sm">Assign a workout to any day. Days without a workout are free days.</p>
        </div>
        {orderedWeekdays(prefs.weekStartsOn).map((wd) => {
          const day = byWeekday.get(wd);
          return day ? (
            <DayEditor
              key={wd}
              day={day}
              freeWeekdays={orderedWeekdays(prefs.weekStartsOn).filter((w) => !byWeekday.has(w))}
              onChange={(patch) => setDay(day.id, patch)}
              onRemove={() => removeDay(day.id)}
              onAddExercise={() => setPicker(day.id)}
              onExChange={(exId, patch) => setEx(day.id, exId, patch)}
              onExMove={(idx, delta) => moveEx(day.id, idx, delta)}
              onExRemove={(exId) => removeEx(day.id, exId)}
            />
          ) : (
            <EmptyDay key={wd} weekday={wd} onAdd={(p) => addDay(wd, p)} />
          );
        })}
      </section>

      <div className="fixed bottom-[calc(64px+env(safe-area-inset-bottom))] md:bottom-0 inset-x-0 md:left-[248px] z-30 bg-surface/95 backdrop-blur border-t border-line">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-3 flex items-center gap-2">
          <span className="text-sm text-muted flex-1">{dirty ? "Unsaved changes" : "No changes"}</span>
          <Button variant="secondary" onClick={cancel}>
            Cancel
          </Button>
          <Button icon="check" onClick={save}>
            {isNew ? "Create plan" : "Save plan"}
          </Button>
        </div>
      </div>

      <ExercisePicker
        open={picker !== null}
        onClose={() => setPicker(null)}
        onPick={(id) => {
          if (picker) addExercise(picker, id);
          setPicker(null);
        }}
      />
    </div>
  );
}

function EmptyDay({ weekday, onAdd }: { weekday: Weekday; onAdd: (p: { name: string; kind: DayKind }) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-card border border-dashed border-line p-4">
      <div className="flex items-center gap-3">
        <span className="font-semibold w-28">{WEEKDAY_NAMES[weekday]}</span>
        <span className="text-muted flex-1 text-sm">No workout</span>
        <Button size="sm" variant="secondary" icon="plus" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          Add workout
        </Button>
      </div>
      {open && (
        <div className="flex flex-wrap gap-2 mt-3" role="group" aria-label={`Choose a workout type for ${WEEKDAY_NAMES[weekday]}`}>
          {DAY_PRESETS.map((p) => (
            <button key={p.name} type="button" onClick={() => onAdd(p)} className="h-9 px-3 rounded-pill border border-line text-sm font-semibold hover:border-accent hover:bg-raised">
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DayEditor({
  day,
  freeWeekdays,
  onChange,
  onRemove,
  onAddExercise,
  onExChange,
  onExMove,
  onExRemove,
}: {
  day: DraftDay;
  freeWeekdays: Weekday[];
  onChange: (p: Partial<PlanDay>) => void;
  onRemove: () => void;
  onAddExercise: () => void;
  onExChange: (exId: string, patch: Partial<PlanExercise>) => void;
  onExMove: (idx: number, delta: number) => void;
  onExRemove: (exId: string) => void;
}) {
  const ex = useExercises();
  const [collapsed, setCollapsed] = useState(false);
  return (
    <article className="card p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-semibold w-28">{WEEKDAY_NAMES[day.weekday]}</span>
        <label className="flex-1 min-w-[180px]">
          <span className="sr-only">Workout name for {WEEKDAY_NAMES[day.weekday]}</span>
          <input className="field font-semibold" value={day.name} onChange={(e) => onChange({ name: e.target.value })} maxLength={80} />
        </label>
        <label>
          <span className="sr-only">Day type</span>
          <select className="field w-auto" value={day.kind} onChange={(e) => onChange({ kind: e.target.value as DayKind, optional: e.target.value === "activity" ? true : day.optional })}>
            {(Object.keys(DAY_KIND_LABEL) as DayKind[]).map((k) => (
              <option key={k} value={k}>
                {DAY_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-1">
          <IconButton icon={collapsed ? "chevronDown" : "chevronUp"} label={collapsed ? "Expand day" : "Collapse day"} onClick={() => setCollapsed((c) => !c)} />
          <IconButton icon="trash" label={`Remove ${day.name}`} onClick={onRemove} className="text-danger" />
        </div>
      </div>
      {!collapsed && (
        <>
          <div className="flex flex-wrap gap-3 items-center">
            {freeWeekdays.length > 0 && (
              <label className="flex items-center gap-2 text-sm">
                <span className="text-muted">Move to</span>
                <select className="field w-auto h-10 min-h-0 py-1" value="" onChange={(e) => e.target.value !== "" && onChange({ weekday: Number(e.target.value) as Weekday })}>
                  <option value="">Choose a day…</option>
                  {freeWeekdays.map((w) => (
                    <option key={w} value={w}>
                      {WEEKDAY_NAMES[w]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {day.kind !== "rest" && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={day.optional} onChange={(e) => onChange({ optional: e.target.checked })} />
                Optional day (never counts as missed)
              </label>
            )}
          </div>
          <label className="block">
            <span className="text-sm font-semibold">Notes</span>
            <input className="field mt-1" value={day.notes} onChange={(e) => onChange({ notes: e.target.value })} placeholder="Optional notes for this day" />
          </label>

          {day.kind !== "rest" && (
            <div className="space-y-2">
              {day.exercises.length === 0 && <p className="text-sm text-muted">{day.kind === "activity" ? "Activity days don't need exercises — you can log any activity." : "No exercises yet."}</p>}
              <ol className="space-y-2">
                {day.exercises.map((pe, i) => {
                  const info = ex.get(pe.exerciseId);
                  return (
                    <li key={pe.id} className="rounded-ctl border border-line bg-raised p-3 space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="num text-muted w-5 text-right">{i + 1}</span>
                        <span className="font-semibold flex-1 min-w-0 truncate">{info?.name ?? "Unknown exercise"}</span>
                        {info?.custom && <Badge tone="accent">Custom</Badge>}
                        <IconButton icon="arrowUp" label={`Move ${info?.name} up`} size={38} disabled={i === 0} onClick={() => onExMove(i, -1)} />
                        <IconButton icon="arrowDown" label={`Move ${info?.name} down`} size={38} disabled={i === day.exercises.length - 1} onClick={() => onExMove(i, 1)} />
                        <IconButton icon="x" label={`Remove ${info?.name}`} size={38} onClick={() => onExRemove(pe.id)} />
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-end">
                        {pe.targetUnit !== "minutes" && <SmallNum label="Sets" value={pe.sets} min={1} max={20} onChange={(v) => onExChange(pe.id, { sets: v })} />}
                        <SmallNum label={pe.targetUnit === "minutes" ? "Min (from)" : pe.targetUnit === "seconds" ? "Seconds from" : "Reps from"} value={pe.repsMin} min={1} max={600} onChange={(v) => onExChange(pe.id, { repsMin: v, repsMax: Math.max(v, pe.repsMax) })} />
                        <SmallNum label="to" value={pe.repsMax} min={pe.repsMin} max={600} onChange={(v) => onExChange(pe.id, { repsMax: v })} />
                        <label className="text-sm">
                          <span className="text-muted block mb-1">Unit</span>
                          <select className="field h-10 min-h-0 py-1" value={pe.targetUnit} onChange={(e) => onExChange(pe.id, { targetUnit: e.target.value as TargetUnit })}>
                            <option value="reps">Reps</option>
                            <option value="seconds">Seconds</option>
                            <option value="minutes">Minutes</option>
                          </select>
                        </label>
                        {pe.targetUnit !== "minutes" && (
                          <label className="text-sm">
                            <span className="text-muted block mb-1">Rest</span>
                            <select className="field h-10 min-h-0 py-1" value={pe.restSeconds} onChange={(e) => onExChange(pe.id, { restSeconds: Number(e.target.value) })}>
                              {[...new Set([0, ...REST_PRESETS, 75, 150, 180, pe.restSeconds])].sort((a, b) => a - b).map((s) => (
                                <option key={s} value={s}>
                                  {s === 0 ? "No rest" : `${s} s`}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                        {pe.targetUnit === "reps" && (
                          <label className="flex items-center gap-2 text-sm h-10">
                            <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={pe.perSide} onChange={(e) => onExChange(pe.id, { perSide: e.target.checked })} />
                            Per side
                          </label>
                        )}
                      </div>
                      <input className="field h-10 min-h-0 py-1 text-sm" value={pe.notes} placeholder="Notes (optional)" onChange={(e) => onExChange(pe.id, { notes: e.target.value })} aria-label={`Notes for ${info?.name}`} />
                    </li>
                  );
                })}
              </ol>
              <Button size="sm" variant="soft" icon="plus" onClick={onAddExercise}>
                Add exercise
              </Button>
            </div>
          )}
        </>
      )}
    </article>
  );
}

function SmallNum({ label, value, onChange, min, max }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number }) {
  return (
    <label className="text-sm">
      <span className="text-muted block mb-1">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        className={cx("field h-10 min-h-0 py-1 num")}
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const n = Math.round(Number(e.target.value));
          if (!Number.isNaN(n)) onChange(Math.max(min, Math.min(max, n)));
        }}
      />
    </label>
  );
}
