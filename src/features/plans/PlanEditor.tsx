"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useApp } from "@/lib/store/AppStore";
import { convertDraftSchedule, cyclePosition, cycleStartFor, draftFromPlan, isCycle, moveCycleDay, newDraft, saveDraft, validateDraft, type PlanDraft } from "@/lib/plans/planOps";
import type { DayKind, Exercise, PlanDay, PlanExercise, TargetUnit, Weekday } from "@/lib/domain/types";
import { orderedWeekdays, WEEKDAY_NAMES } from "@/lib/util/dates";
import { uuid } from "@/lib/util/ids";
import { REST_PRESETS } from "@/lib/timer/restTimer";
import { Badge, Button, EmptyState, Field, IconButton, Segmented, Switch, cx } from "@/components/ui/primitives";
import { useConfirm, useToast } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { ExercisePicker } from "./ExercisePicker";
import { ExerciseName } from "../library/ExerciseSheet";
import { DAY_KIND_LABEL, useExercises, useToday } from "../common";

type DraftDay = PlanDraft["days"][number];

const DAY_PRESETS: { name: string; kind: DayKind }[] = [
  { name: "Push", kind: "strength" },
  { name: "Pull", kind: "strength" },
  { name: "Legs", kind: "strength" },
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
  const today = useToday();
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
      <EmptyState
        icon="dumbbell"
        title="Plan not found"
        action={
          <Link href="/workouts" className="font-semibold underline">
            Back to My Workouts
          </Link>
        }
      >
        It may have been deleted on another device.
      </EmptyState>
    );

  const setPlan = (patch: Partial<PlanDraft["plan"]>) => setDraft((d) => d && { ...d, plan: { ...d.plan, ...patch } });
  const { setDay, setEx, moveEx, removeEx, removeDay, addExercise } = draftOps(setDraft, prefs.defaultRestSeconds, ex.get);
  const addDay = (weekday: Weekday, preset: { name: string; kind: DayKind }) =>
    setDraft(
      (d) =>
        d && {
          ...d,
          days: [...d.days, { id: uuid(), planId: d.plan.id, weekday, name: preset.name, kind: preset.kind, notes: "", optional: preset.kind === "activity", exercises: [] }],
        },
    );
  const addCycleDay = (preset: { name: string; kind: DayKind }) =>
    setDraft((d) =>
      d && d.days.length < 7
        ? {
            ...d,
            days: [
              ...d.days,
              { id: uuid(), planId: d.plan.id, weekday: d.days.length as Weekday, name: preset.name, kind: preset.kind, notes: "", optional: preset.kind === "activity", exercises: [] },
            ],
          }
        : d,
    );

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
  const cycle = isCycle(draft.plan);
  const cycleDays = [...draft.days].sort((a, b) => a.weekday - b.weekday);
  const todayPos = cycle && cycleDays.length ? cyclePosition(draft.plan.cycleStart ?? today, today, cycleDays.length) : 0;
  const dayEditorProps = (day: DraftDay) => ({
    day,
    onChange: (patch: Partial<PlanDay>) => setDay(day.id, patch),
    onRemove: () => removeDay(day.id),
    onAddExercise: () => setPicker(day.id),
    onExChange: (exId: string, patch: Partial<PlanExercise>) => setEx(day.id, exId, patch),
    onExMove: (idx: number, delta: number) => moveEx(day.id, idx, delta),
    onExRemove: (exId: string) => removeEx(day.id, exId),
  });

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
          {(id) => (
            <input id={id} className="field text-lg font-semibold" value={draft.plan.name} onChange={(e) => setPlan({ name: e.target.value })} placeholder="e.g. Summer strength" maxLength={120} />
          )}
        </Field>
        <Field label="Description (optional)">
          {(id) => <textarea id={id} className="field min-h-20" value={draft.plan.description} onChange={(e) => setPlan({ description: e.target.value })} />}
        </Field>
        <Switch label="Active plan" description="Your active plan sets the schedule on the dashboard and calendar." checked={draft.plan.isActive} onChange={(v) => setPlan({ isActive: v })} />
        <div className="space-y-2 pt-1">
          <p className="font-semibold">How the days repeat</p>
          <Segmented
            label="How the days repeat"
            value={cycle ? "cycle" : "weekly"}
            onChange={(v) => setDraft((d) => d && convertDraftSchedule(d, v, today))}
            options={[
              { value: "weekly", label: "Same days every week" },
              { value: "cycle", label: "Repeating cycle" },
            ]}
          />
          <p className="text-sm text-muted">
            {cycle
              ? "The days follow each other in order, whatever the weekday (for example Push → Pull → Legs → Rest), then start again."
              : "Each workout belongs to a weekday, like Lower Body every Monday."}
          </p>
        </div>
      </section>

      {cycle ? (
        <section className="space-y-3" aria-labelledby="sched-h">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="sched-h" className="text-xl">
                Cycle · {cycleDays.length} day{cycleDays.length === 1 ? "" : "s"}
              </h2>
              <p className="text-muted text-sm">Use the arrows to change the order. After the last day it starts again from Day 1.</p>
            </div>
            {cycleDays.length > 0 && (
              <label className="flex items-center gap-2 text-sm">
                <span className="font-semibold">Today is</span>
                <select className="field w-auto h-10 min-h-0 py-1" value={todayPos} onChange={(e) => setPlan({ cycleStart: cycleStartFor(today, Number(e.target.value)) })}>
                  {cycleDays.map((d, i) => (
                    <option key={d.id} value={i}>
                      Day {i + 1} · {d.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {cycleDays.map((day, i) => (
            <DayEditor
              key={day.id}
              {...dayEditorProps(day)}
              label={`Day ${i + 1}${i === todayPos ? " · today" : ""}`}
              freeWeekdays={[]}
              onMoveDay={(delta) => setDraft((d) => d && moveCycleDay(d, day.id, delta))}
              isFirst={i === 0}
              isLast={i === cycleDays.length - 1}
            />
          ))}
          {cycleDays.length < 7 && <EmptyDay label={`Day ${cycleDays.length + 1}`} onAdd={addCycleDay} />}
        </section>
      ) : (
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
              <DayEditor key={wd} {...dayEditorProps(day)} label={WEEKDAY_NAMES[wd]} freeWeekdays={orderedWeekdays(prefs.weekStartsOn).filter((w) => !byWeekday.has(w))} />
            ) : (
              <EmptyDay key={wd} label={WEEKDAY_NAMES[wd]} onAdd={(p) => addDay(wd, p)} />
            );
          })}
        </section>
      )}

      <div className="fixed bottom-[calc(84px+env(safe-area-inset-bottom))] lg:bottom-0 inset-x-0 z-30 bg-surface/95 backdrop-blur border-t border-line">
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

function EmptyDay({ label, onAdd }: { label: string; onAdd: (p: { name: string; kind: DayKind }) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-card border border-dashed border-line p-4">
      <div className="flex items-center gap-3">
        <span className="font-semibold w-28">{label}</span>
        <span className="text-muted flex-1 text-sm">No workout</span>
        <Button size="sm" variant="secondary" icon="plus" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          Add workout
        </Button>
      </div>
      {open && (
        <div className="flex flex-wrap gap-2 mt-3" role="group" aria-label={`Choose a workout type for ${label}`}>
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

type SetDraft = Dispatch<SetStateAction<PlanDraft | null>>;

/** Edits to the days of a draft plan, shared by the full plan editor and the inline day editor. */
function draftOps(setDraft: SetDraft, defaultRest: number, getExercise: (id: string) => Exercise | undefined) {
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
  const removeDay = (id: string) =>
    setDraft((d) => {
      if (!d) return d;
      const days = d.days.filter((x) => x.id !== id);
      // cycle positions stay 0, 1, 2 … without gaps
      return { ...d, days: isCycle(d.plan) ? [...days].sort((a, b) => a.weekday - b.weekday).map((x, i) => ({ ...x, weekday: i as Weekday })) : days };
    });
  const addExercise = (dayId: string, exerciseId: string) => {
    const e = getExercise(exerciseId);
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
                      restSeconds: timed ? 0 : defaultRest,
                      notes: "",
                    },
                  ],
                }
              : x,
          ),
        },
    );
  };

  return { setDay, setEx, moveEx, removeEx, removeDay, addExercise };
}

/**
 * Edit one day of a plan in place (from the plan card on My workouts), saved straight to the
 * plan. Uses the same day editor as the full plan editor.
 */
export function InlineDayEditor({ planId, dayId, label, onDone }: { planId: string; dayId: string; label: string; onDone: () => void }) {
  const { data, commit, prefs } = useApp();
  const ex = useExercises();
  const toast = useToast();
  const confirm = useConfirm();
  const [draft, setDraft] = useState<PlanDraft | null>(() => draftFromPlan(data, planId));
  const [errors, setErrors] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const { setDay, setEx, moveEx, removeEx, addExercise } = draftOps(setDraft, prefs.defaultRestSeconds, ex.get);
  const day = draft?.days.find((d) => d.id === dayId);
  if (!draft || !day) return null;

  const save = (next: PlanDraft, message: string) => {
    const errs = validateDraft(next);
    setErrors(errs);
    if (errs.length) return;
    commit((d) => saveDraft(d, next));
    toast(message, { tone: "success" });
    onDone();
  };
  const remove = async () => {
    const ok = await confirm({ title: `Remove ${day.name}?`, body: "The day is taken out of this plan. Workouts you already logged stay in your history.", confirmLabel: "Remove day", danger: true });
    if (!ok) return;
    const days = draft.days.filter((x) => x.id !== dayId);
    save({ ...draft, days: isCycle(draft.plan) ? [...days].sort((a, b) => a.weekday - b.weekday).map((x, i) => ({ ...x, weekday: i as Weekday })) : days }, `${day.name} removed`);
  };

  return (
    <div className="space-y-3 anim-pop">
      {errors.length > 0 && (
        <div role="alert" className="rounded-ctl bg-danger-soft text-danger p-3 text-sm">
          {errors.map((e) => (
            <p key={e}>{e}</p>
          ))}
        </div>
      )}
      <DayEditor
        day={day}
        label={label}
        freeWeekdays={[]}
        onChange={(patch) => setDay(day.id, patch)}
        onRemove={remove}
        onAddExercise={() => setPicking(true)}
        onExChange={(exId, patch) => setEx(day.id, exId, patch)}
        onExMove={(idx, delta) => moveEx(day.id, idx, delta)}
        onExRemove={(exId) => removeEx(day.id, exId)}
      />
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button icon="check" onClick={() => save(draft, "Workout saved")}>
          Save changes
        </Button>
      </div>
      <ExercisePicker
        open={picking}
        onClose={() => setPicking(false)}
        onPick={(id) => {
          addExercise(day.id, id);
          setPicking(false);
        }}
      />
    </div>
  );
}

function DayEditor({
  day,
  label,
  onMoveDay,
  isFirst,
  isLast,
  freeWeekdays,
  onChange,
  onRemove,
  onAddExercise,
  onExChange,
  onExMove,
  onExRemove,
}: {
  day: DraftDay;
  /** "Monday", or "Day 2" in a cycle. */
  label: string;
  /** Cycle plans: move this day earlier (-1) or later (+1) in the cycle. */
  onMoveDay?: (delta: number) => void;
  isFirst?: boolean;
  isLast?: boolean;
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
        <span className="font-semibold w-28">{label}</span>
        <label className="flex-1 min-w-[180px]">
          <span className="sr-only">Workout name for {label}</span>
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
          {onMoveDay && (
            <>
              <IconButton icon="arrowUp" label={`Move ${day.name} earlier in the cycle`} disabled={isFirst} onClick={() => onMoveDay(-1)} />
              <IconButton icon="arrowDown" label={`Move ${day.name} later in the cycle`} disabled={isLast} onClick={() => onMoveDay(1)} />
            </>
          )}
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
                        <span className="num text-muted w-5 text-right shrink-0">{i + 1}</span>
                        <ExerciseName exerciseId={info?.id} name={info?.name ?? "Unknown exercise"} className="font-semibold flex-1" />
                        {info?.custom && <Badge tone="accent">Custom</Badge>}
                        <IconButton icon="arrowUp" label={`Move ${info?.name} up`} size={38} disabled={i === 0} onClick={() => onExMove(i, -1)} />
                        <IconButton icon="arrowDown" label={`Move ${info?.name} down`} size={38} disabled={i === day.exercises.length - 1} onClick={() => onExMove(i, 1)} />
                        <IconButton icon="x" label={`Remove ${info?.name}`} size={38} onClick={() => onExRemove(pe.id)} />
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-end">
                        {pe.targetUnit !== "minutes" && <SmallNum label="Sets" value={pe.sets} min={1} max={20} onChange={(v) => onExChange(pe.id, { sets: v })} />}
                        <SmallNum
                          label={pe.targetUnit === "minutes" ? "Min (from)" : pe.targetUnit === "seconds" ? "Seconds from" : "Reps from"}
                          value={pe.repsMin}
                          min={1}
                          max={600}
                          onChange={(v) => onExChange(pe.id, { repsMin: v, repsMax: Math.max(v, pe.repsMax) })}
                        />
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
                              {[...new Set([0, ...REST_PRESETS, 75, 150, 180, pe.restSeconds])]
                                .sort((a, b) => a - b)
                                .map((s) => (
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
                      <input
                        className="field h-10 min-h-0 py-1 text-sm"
                        value={pe.notes}
                        placeholder="Notes (optional)"
                        onChange={(e) => onExChange(pe.id, { notes: e.target.value })}
                        aria-label={`Notes for ${info?.name}`}
                      />
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
