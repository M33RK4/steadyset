"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/lib/store/AppStore";
import { Dialog, useConfirm, useToast } from "@/components/ui/Dialog";
import { Button, Field, IconButton } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import { logWorkout } from "@/lib/session/sessionOps";
import { isCycle, planSlotFor, saveSessionAsPlanDay } from "@/lib/plans/planOps";
import type { LocalDate } from "@/lib/domain/types";
import { formatLongDate, WEEKDAY_NAMES, weekdayOf } from "@/lib/util/dates";
import { useExercises, useToday } from "../common";
import { ExercisePicker } from "../plans/ExercisePicker";

interface Row {
  key: number;
  exerciseId: string;
  sets: { reps: string; weight: string }[];
  minutes: string;
}

const num = (s: string) => (s.trim() === "" || !Number.isFinite(Number(s)) ? null : Number(s));
const digits = (s: string) => s.replace(/[^0-9.]/g, "");

/**
 * Log a workout that was done without starting it in the app: pick the exercises, type in the
 * sets, save. Then offers to make it the plan's workout for that weekday (or cycle day).
 */
export function LogWorkoutDialog({ open, onClose, date: initialDate }: { open: boolean; onClose: () => void; date: LocalDate }) {
  const { data, prefs, commit } = useApp();
  const ex = useExercises();
  const toast = useToast();
  const confirm = useConfirm();
  const today = useToday();
  const [date, setDate] = useState(initialDate);
  const [title, setTitle] = useState("");
  const [minutes, setMinutes] = useState("45");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [picking, setPicking] = useState(false);
  const [nextKey, setNextKey] = useState(1);

  useEffect(() => {
    if (!open) return;
    setDate(initialDate);
    setTitle("");
    setMinutes("45");
    setNotes("");
    setRows([]);
  }, [open, initialDate]);

  const m = Number(minutes);
  const validMinutes = Number.isFinite(m) && m > 0 && m <= 600;
  const filled = rows.filter((r) => {
    const e = ex.get(r.exerciseId);
    return e && (e.kind === "cardio" || e.kind === "mobility" ? (num(r.minutes) ?? 0) > 0 : r.sets.some((s) => (num(s.reps) ?? 0) > 0));
  });
  const valid = validMinutes && filled.length > 0 && !!date && date <= today;
  const update = (key: number, f: (r: Row) => Row) => setRows((rs) => rs.map((r) => (r.key === key ? f(r) : r)));

  const save = async () => {
    if (!valid) return;
    const name = title.trim() || "Workout";
    const r = logWorkout(data, {
      date,
      title: name,
      minutes: m,
      notes,
      units: prefs.units,
      now: new Date(),
      items: filled.map((row) => ({
        exerciseId: row.exerciseId,
        minutes: num(row.minutes),
        sets: row.sets.map((s) => ({ reps: num(s.reps), weight: num(s.weight) })),
      })),
    });
    commit(r.changes);
    onClose();
    toast(`${name} logged`, { tone: "success" });

    const slot = planSlotFor(data, date);
    const weekday = WEEKDAY_NAMES[weekdayOf(date)];
    const cycle = isCycle(slot.plan);
    const yes = await confirm({
      title: cycle ? `Use this as Day ${slot.position + 1} of your cycle?` : `Make this your ${weekday} workout?`,
      body: !slot.plan
        ? `You don't have a plan yet. Steadyset will make one called “My plan” with “${name}” every ${weekday}, using today's exercises, sets and reps as the targets. The other days stay free — you can add to them any time.`
        : cycle
          ? `${formatLongDate(date)} is Day ${slot.position + 1} of “${slot.plan.name}”.${slot.existing ? ` It replaces “${slot.existing.name}” on that day of the cycle.` : ""} Your sets and reps become the targets.`
          : `Every ${weekday} in “${slot.plan.name}” will be “${name}”, with these exercises, sets and reps as the targets.${slot.existing ? ` It replaces “${slot.existing.name}”.` : ""}`,
      confirmLabel: cycle ? "Save to my cycle" : `Save as my ${weekday} workout`,
      cancelLabel: "Not now",
    });
    if (!yes) return;
    commit((d) => saveSessionAsPlanDay(d, r.sessionId, { restSeconds: prefs.defaultRestSeconds }).changes);
    toast(slot.plan ? "Plan updated" : "Plan created", { tone: "success" });
  };

  return (
    <>
      <Dialog
        open={open && !picking}
        onClose={onClose}
        title="Log a workout"
        description="For a workout you did without starting it here. No plan needed."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={save} disabled={!valid} icon="check">
              Save workout
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-[1.4fr_1fr_0.8fr]">
            <Field label="Name">
              {(id) => <input id={id} className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Legs, Upper body" />}
            </Field>
            <Field label="Date" error={date > today ? "Pick today or an earlier day." : null}>
              {(id) => <input id={id} type="date" className="field" max={today} value={date} onChange={(e) => setDate(e.target.value)} />}
            </Field>
            <Field label="Minutes" error={minutes && !validMinutes ? "1–600" : null}>
              {(id) => <input id={id} className="field num" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(digits(e.target.value))} />}
            </Field>
          </div>

          <section className="space-y-3" aria-label="Exercises">
            {rows.length === 0 && <p className="text-muted text-sm">Add the exercises you did, then fill in your sets.</p>}
            {rows.map((row) => {
              const e = ex.get(row.exerciseId);
              if (!e) return null;
              const timed = e.kind === "cardio" || e.kind === "mobility";
              const hold = e.kind === "time";
              return (
                <div key={row.key} className="rounded-card border border-line p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold flex-1 min-w-0 break-words">{e.name}</p>
                    <IconButton icon="trash" label={`Remove ${e.name}`} size={36} onClick={() => setRows((rs) => rs.filter((r) => r.key !== row.key))} />
                  </div>
                  {timed ? (
                    <label className="flex items-center gap-2 text-sm">
                      <input className="field num w-24" inputMode="numeric" value={row.minutes} aria-label={`${e.name} minutes`} onChange={(ev) => update(row.key, (r) => ({ ...r, minutes: digits(ev.target.value) }))} />
                      minutes
                    </label>
                  ) : (
                    <>
                      <ol className="space-y-2">
                        {row.sets.map((s, i) => (
                          <li key={i} className="flex items-center gap-2 text-sm">
                            <span className="w-12 text-muted shrink-0">Set {i + 1}</span>
                            <input
                              className="field num w-20"
                              inputMode="numeric"
                              value={s.reps}
                              aria-label={`Set ${i + 1} ${hold ? "seconds" : "reps"}`}
                              onChange={(ev) => update(row.key, (r) => ({ ...r, sets: r.sets.map((x, j) => (j === i ? { ...x, reps: digits(ev.target.value) } : x)) }))}
                            />
                            <span className="text-muted">{hold ? "sec" : "reps"}</span>
                            {e.usesWeight && (
                              <>
                                <span className="text-muted">×</span>
                                <input
                                  className="field num w-20"
                                  inputMode="decimal"
                                  value={s.weight}
                                  placeholder="—"
                                  aria-label={`Set ${i + 1} weight in ${prefs.units}`}
                                  onChange={(ev) => update(row.key, (r) => ({ ...r, sets: r.sets.map((x, j) => (j === i ? { ...x, weight: digits(ev.target.value) } : x)) }))}
                                />
                                <span className="text-muted">{prefs.units}</span>
                              </>
                            )}
                            {row.sets.length > 1 && (
                              <IconButton icon="minus" label={`Remove set ${i + 1}`} size={34} className="ml-auto" onClick={() => update(row.key, (r) => ({ ...r, sets: r.sets.filter((_, j) => j !== i) }))} />
                            )}
                          </li>
                        ))}
                      </ol>
                      <Button size="sm" variant="ghost" icon="plus" onClick={() => update(row.key, (r) => ({ ...r, sets: [...r.sets, { ...r.sets[r.sets.length - 1] }] }))}>
                        Add set
                      </Button>
                    </>
                  )}
                </div>
              );
            })}
            <Button variant="secondary" icon="plus" onClick={() => setPicking(true)}>
              Add exercise
            </Button>
          </section>

          <Field label="Notes (optional)">
            {(id) => <textarea id={id} className="field min-h-20" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="How did it feel?" />}
          </Field>
          {rows.length > 0 && filled.length === 0 && (
            <p className="text-sm text-muted flex items-center gap-1.5">
              <Icon name="info" size={16} /> Fill in at least one set to save.
            </p>
          )}
        </div>
      </Dialog>
      <ExercisePicker
        open={open && picking}
        onClose={() => setPicking(false)}
        title="Add an exercise you did"
        onPick={(exerciseId) => {
          const e = ex.get(exerciseId);
          const hold = e?.kind === "time";
          const reps = hold ? "30" : "10";
          setRows((rs) => [...rs, { key: nextKey, exerciseId, minutes: "20", sets: [0, 1, 2].map(() => ({ reps, weight: "" })) }]);
          setNextKey((k) => k + 1);
          setPicking(false);
        }}
      />
    </>
  );
}
