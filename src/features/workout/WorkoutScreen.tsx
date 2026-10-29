"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/lib/store/AppStore";
import {
  addExerciseToSession,
  completeTimedItem,
  discardSession,
  finishSession,
  inProgressSession,
  finishSet,
  isTimed,
  nextPendingExercise,
  selectExercise,
  sessionExercisesOf,
  sessionProgress,
  setsOf,
  skipExercise,
  startExtraRest,
  undoLastSet,
} from "@/lib/session/sessionOps";
import { adjustTimer, clearTimer, pauseTimer, progress, remainingMs, resumeTimer, startTimer, REST_PRESETS } from "@/lib/timer/restTimer";
import { useNow } from "@/lib/timer/TimerWatcher";
import { unlockAudio } from "@/lib/audio/alerts";
import { convertWeight, roundWeight } from "@/lib/stats/stats";
import { formatClock } from "@/lib/util/dates";
import { activePlan, daysOfPlan, estimateMinutes, formatTarget } from "@/lib/plans/planOps";
import type { AppData, SessionExercise, Units } from "@/lib/domain/types";
import { Badge, Button, EmptyState, IconButton, NumberStepper, ProgressBar, ProgressRing, cx } from "@/components/ui/primitives";
import { Dialog, useConfirm, useToast } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { ExerciseDemo } from "../animation/ExerciseDemo";
import { DAY_KIND_LABEL, useExercises, useToday } from "../common";
import { useStartWorkout } from "./useStartWorkout";
import { ExercisePicker } from "../plans/ExercisePicker";
import { uuid } from "@/lib/util/ids";
import { BuddyStrip } from "../buddies/BuddyLive";
import { CardFlower } from "@/components/ui/ThemeArt";
import { exerciseDescription, useExerciseSheet } from "../library/ExerciseSheet";

export function WorkoutScreen() {
  const { active, data, setActive } = useApp();
  const session = active ? data.sessions.find((s) => s.id === active.sessionId) : undefined;

  const running = inProgressSession(data);
  // The session was finished or deleted on another device/tab: drop the stale local state.
  // A session started elsewhere (or before a refresh lost local state) is picked up again.
  useEffect(() => {
    if (active && (!session || session.status !== "in_progress")) setActive(null);
    else if (!active && running) setActive({ sessionId: running.id, currentExerciseId: null, timer: clearTimer(), restOverride: {}, updatedAt: Date.now() });
  }, [active, session, running, setActive]);

  if (!active || !session || session.status !== "in_progress") return <StartChooser />;
  return <ActiveWorkout />;
}

// ---------------------------------------------------------------- nothing running: choose what to start

function StartChooser() {
  const { data } = useApp();
  const start = useStartWorkout();
  const today = useToday();
  const plan = activePlan(data);
  const days = plan ? daysOfPlan(data, plan.id).filter((d) => d.kind === "strength" || d.kind === "cardio") : [];
  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Ready?</p>
        <h1 className="text-4xl md:text-5xl mt-2">
          Start a <em>workout</em>
        </h1>
        <p className="text-muted mt-1">Pick a day from your plan, or start an empty session and add exercises as you go.</p>
      </header>
      {plan ? (
        <ul className="grid sm:grid-cols-2 gap-3">
          {days.map((d) => (
            <li key={d.id}>
              <button type="button" onClick={() => start(d, today)} className="card w-full text-left p-4 flex items-center gap-3 hover:border-accent transition-colors">
                <span className="h-11 w-11 rounded-ctl bg-accent-soft text-accent-text grid place-items-center shrink-0">
                  <Icon name={d.kind === "cardio" ? "walk" : "dumbbell"} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold truncate">{d.name}</span>
                  <span className="block text-sm text-muted">
                    {DAY_KIND_LABEL[d.kind]} · about {estimateMinutes(data, d.id)} min
                  </span>
                </span>
                <Icon name="play" size={18} className="text-accent-text" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon="dumbbell" title="No active plan">
          Choose a plan in{" "}
          <Link href="/workouts" className="underline font-semibold">
            My Workouts
          </Link>
          , or start an empty workout.
        </EmptyState>
      )}
      <Button variant="secondary" icon="plus" onClick={() => start(null, today, "Custom workout")}>
        Start an empty workout
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------- active session

function ActiveWorkout() {
  const app = useApp();
  const { data, active, step, setActive, commit, prefs } = app;
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const ex = useExercises();
  const session = data.sessions.find((s) => s.id === active!.sessionId)!;
  const list = sessionExercisesOf(data, session.id);
  const prog = sessionProgress(data, session.id);
  const current = list.find((e) => e.id === active!.currentExerciseId) ?? null;
  const timer = active!.timer;
  // During rest the timer replaces the exercise panel; "done" stays up until "Begin set" is tapped.
  const timerVisible = timer.status === "running" || timer.status === "paused" || timer.status === "done";
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const elapsedNow = useNow(true, 1000);
  const elapsed = Math.max(0, (elapsedNow - new Date(session.startedAt).getTime()) / 1000);

  // Open the summary once everything is done (step 13).
  useEffect(() => {
    if (prog.allDone) setSummaryOpen(true);
  }, [prog.allDone]);

  const select = (id: string) => {
    unlockAudio();
    step((d, a) => selectExercise(d, a, id, new Date()));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goNext = () => {
    const next = nextPendingExercise(data, session.id, current?.id);
    if (next) select(next.id);
    else setSummaryOpen(true);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link href="/" className="h-11 w-11 -ml-2 grid place-items-center rounded-ctl hover:bg-raised shrink-0" aria-label="Leave workout screen (the workout stays in progress)">
          <Icon name="chevronLeft" />
        </Link>
        <div className="flex-1 min-w-0">
          <p className="eyebrow">Workout in progress</p>
          <h1 className="text-3xl md:text-4xl truncate mt-1">{session.title}</h1>
          <p className="text-sm text-muted flex flex-wrap gap-x-3">
            <span className="num">{formatClock(elapsed)} elapsed</span>
            <span>
              {prog.completed}/{prog.total} exercises
            </span>
            <span>{prog.sets} sets</span>
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setSummaryOpen(true)}>
          Finish
        </Button>
      </div>
      <ProgressBar value={prog.total ? prog.completed / prog.total : 0} label="Workout progress" />
      <BuddyStrip onlyLive title="Training with you right now" />

      <div className="relative pt-3">
        <CardFlower />
        {timerVisible ? (
          <RestPanel current={current} />
        ) : current ? (
          <CurrentExercise key={current.id} se={current} onNext={goNext} />
        ) : (
          <div className="card p-6 text-center space-y-3">
            <h2 className="text-xl">Ready when you are</h2>
            <p className="text-muted">Start with the first exercise, or tap any exercise below.</p>
            {list.length > 0 ? (
              <Button size="xl" icon="play" onClick={() => select((nextPendingExercise(data, session.id) ?? list[0]).id)}>
                Start {(nextPendingExercise(data, session.id) ?? list[0]).name}
              </Button>
            ) : (
              <Button size="lg" icon="plus" onClick={() => setPickerOpen(true)}>
                Add an exercise
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Exercise list */}
      <section aria-labelledby="ex-list-h" className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 id="ex-list-h" className="text-lg">
            Exercises
          </h2>
          <Button size="sm" variant="ghost" icon="plus" onClick={() => setPickerOpen(true)}>
            Add exercise
          </Button>
        </div>
        <ol className="space-y-2">
          {list.map((se) => (
            <ExerciseRow key={se.id} se={se} isCurrent={se.id === current?.id} onSelect={() => select(se.id)} animation={ex.get(se.exerciseId)?.animation ?? "generic"} />
          ))}
        </ol>
      </section>

      <SummaryDialog
        open={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        onSave={(notes) => {
          commit((d) => finishSession(d, session.id, { now: new Date(), notes }));
          setActive(null);
          toast(prog.allDone ? "Workout saved — great job!" : "Saved as a partially completed workout.", { tone: "success" });
          router.push("/");
        }}
        onDiscard={async () => {
          const ok = await confirm({ title: "Discard this workout?", body: "Nothing was recorded, so the session will be removed.", confirmLabel: "Discard", danger: true });
          if (!ok) return;
          commit((d) => discardSession(d, session.id));
          setActive(null);
          router.push("/");
        }}
      />
      <ExercisePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(exerciseId) => {
          commit((d) => addExerciseToSession(d, session.id, exerciseId, { restSeconds: prefs.defaultRestSeconds }));
          setPickerOpen(false);
          toast("Exercise added");
        }}
      />
    </div>
  );
}

function ExerciseRow({ se, isCurrent, onSelect, animation }: { se: SessionExercise; isCurrent: boolean; onSelect: () => void; animation: string }) {
  const { data } = useApp();
  const done = setsOf(data, se.id).length;
  const statusBadge =
    se.status === "completed" ? <Badge tone="done">Done</Badge> : se.status === "skipped" ? <Badge>Skipped</Badge> : se.status === "active" ? <Badge tone="accent">Started</Badge> : null;
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={isCurrent ? "step" : undefined}
        className={cx(
          "card w-full text-left p-3 flex items-center gap-3 transition-colors",
          isCurrent ? "border-accent ring-2 ring-accent" : "hover:border-muted",
          se.status === "completed" && !isCurrent && "opacity-75",
        )}
      >
        <div className="w-16 shrink-0">
          <ExerciseDemo animation={animation} name={se.name} compact />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold break-words">{se.name}</p>
          <p className="text-sm text-muted">
            {formatTarget({ ...se, sets: se.targetSets })}
            {!isTimed(se) && ` · ${done}/${se.targetSets} sets`}
          </p>
        </div>
        {statusBadge}
        <Icon name="chevronRight" size={18} className="text-muted" />
      </button>
    </li>
  );
}

/**
 * Big buttons that appear in the same spot as the one just tapped (Finish set → Next exercise,
 * Begin set) ignore taps for a moment, so a double-tap can't trigger both.
 */
function useArmed(delay = 450) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setArmed(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return armed;
}

// ---------------------------------------------------------------- current exercise (steps 4–7, 12)

function lastWeightFor(data: AppData, exerciseId: string | null, units: Units): number | null {
  if (!exerciseId) return null;
  const seIds = new Set(data.sessionExercises.filter((e) => e.exerciseId === exerciseId).map((e) => e.id));
  const sets = data.sets.filter((s) => seIds.has(s.sessionExerciseId) && s.weight !== null).sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  const s = sets[0];
  if (!s || s.weight === null) return null;
  return roundWeight(convertWeight(s.weight, s.weightUnit ?? units, units));
}

function CurrentExercise({ se, onNext }: { se: SessionExercise; onNext: () => void }) {
  const { data, step, prefs } = useApp();
  const toast = useToast();
  const ex = useExercises();
  const info = ex.get(se.exerciseId);
  const sets = setsOf(data, se.id);
  const setNumber = sets.length + 1;
  const isSeconds = se.targetUnit === "seconds";
  const prevSet = sets[sets.length - 1];
  const [reps, setReps] = useState<number | null>(prevSet?.reps ?? (isSeconds ? se.repsMax : se.repsMax));
  const [weight, setWeight] = useState<number | null>(() => prevSet?.weight ?? lastWeightFor(data, se.exerciseId, prefs.units));
  const [minutes, setMinutes] = useState<number | null>(se.repsMax);
  const [showTips, setShowTips] = useState(false);
  const next = nextPendingExercise(data, se.sessionId, se.id);
  const armed = useArmed(300);

  const doFinish = () => {
    if (!armed) return;
    unlockAudio();
    const res = step((d, a) =>
      finishSet(d, a, {
        seId: se.id,
        expectedSetNumber: setNumber,
        reps: isSeconds ? null : reps,
        weight: se.usesWeight ? weight : null,
        units: prefs.units,
        durationSeconds: isSeconds ? reps : null,
        now: new Date(),
      }),
    );
    if (res?.event === "exercise-complete") toast(`${se.name} complete`, { tone: "success" });
  };

  const undo = () => {
    step((d, a) => undoLastSet(d, a, se.id, new Date()));
    toast("Last set removed");
  };

  // ---- time-based item (cardio / mobility minutes)
  if (isTimed(se)) {
    return (
      <section className="card p-5 space-y-4" aria-labelledby="cur-h">
        <ExerciseHeader se={se} animation={info?.animation ?? "generic"} />
        {se.status === "completed" ? (
          <CompleteBlock
            se={se}
            next={next?.name}
            onNext={onNext}
            onUndo={() => step((d, a) => ({ changes: [{ table: "sessionExercises", op: "upsert", row: { ...se, status: "active", completedAt: null, durationSeconds: null } }], active: a }))}
          />
        ) : (
          <>
            <p className="text-muted">Target: {formatTarget({ ...se, sets: 1 })}. Do it at your own pace, then record how long you went.</p>
            <div className="max-w-xs">
              <NumberStepper label="Minutes" value={minutes} onChange={setMinutes} min={1} max={240} />
            </div>
            <Button size="xl" block icon="check" disabled={!minutes} onClick={() => step((d, a) => completeTimedItem(d, a, se.id, minutes ?? 0, new Date()))}>
              Mark as done
            </Button>
            <SecondaryActions se={se} onShowTips={() => setShowTips((s) => !s)} showTips={showTips} />
          </>
        )}
        {showTips && info && <Tips steps={info.steps} mistakes={info.mistakes} safety={info.safety} breathing={info.breathing} />}
      </section>
    );
  }

  return (
    <section className="card p-5 space-y-5" aria-labelledby="cur-h">
      <ExerciseHeader se={se} animation={info?.animation ?? "generic"} />

      <SetTracker total={se.targetSets} done={sets.length} />

      {se.status === "completed" ? (
        <CompleteBlock
          se={se}
          next={next?.name}
          onNext={onNext}
          onUndo={undo}
          onRest={() => step((d, a) => ({ changes: [], active: startExtraRest(a, se.restSeconds || prefs.defaultRestSeconds, new Date()) }))}
        />
      ) : (
        <>
          <div className={cx("grid gap-3", se.usesWeight ? "grid-cols-2" : "grid-cols-1 max-w-xs")}>
            <NumberStepper label={isSeconds ? "Seconds held" : se.perSide ? "Reps (per side)" : "Reps"} value={reps} onChange={setReps} min={0} max={isSeconds ? 600 : 100} />
            {se.usesWeight && (
              <NumberStepper label={`Weight (${prefs.units})`} value={weight} onChange={setWeight} min={0} max={999} step={prefs.units === "kg" ? 1.25 : 2.5} suffix={prefs.units} allowEmpty />
            )}
          </div>
          {/* Sticky on small screens so it's always within thumb reach. */}
          <div className="sticky bottom-[calc(12px+env(safe-area-inset-bottom))] z-20 -mx-1 px-1">
            <Button size="xl" block icon="check" onClick={doFinish} className="h-[72px] text-xl shadow-lg">
              Finish set {setNumber} of {se.targetSets}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" icon="undo" onClick={undo} disabled={sets.length === 0}>
              Undo last set
            </Button>
            <SecondaryActions se={se} onShowTips={() => setShowTips((s) => !s)} showTips={showTips} />
          </div>
          {sets.length > 0 && (
            <ul className="text-sm text-muted flex flex-wrap gap-2" aria-label="Recorded sets">
              {sets.map((s) => (
                <li key={s.id} className="rounded-pill bg-raised border border-line px-3 py-1 num">
                  Set {s.setNumber}: {s.durationSeconds !== null ? `${s.durationSeconds}s` : `${s.reps ?? "—"} reps`}
                  {s.weight !== null ? ` · ${s.weight} ${s.weightUnit}` : ""}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {showTips && info && <Tips steps={info.steps} mistakes={info.mistakes} safety={info.safety} breathing={info.breathing} />}
    </section>
  );
}

function ExerciseHeader({ se, animation }: { se: SessionExercise; animation: string }) {
  const info = useExercises().get(se.exerciseId);
  const openSheet = useExerciseSheet();
  const about = info ? exerciseDescription(info) : "";
  return (
    <div className="grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-4 items-start">
      <div className="min-w-0 space-y-1 order-2 sm:order-1">
        <Badge tone={se.status === "completed" ? "done" : "accent"}>{se.status === "completed" ? "Completed" : "Current exercise"}</Badge>
        <h2 id="cur-h" className="text-2xl md:text-3xl leading-tight">
          {se.name}
        </h2>
        <p className="text-muted">
          Target {formatTarget({ ...se, sets: se.targetSets })}
          {se.restSeconds > 0 && !isTimed(se) ? ` · ${se.restSeconds}s rest` : ""}
        </p>
        {about && <p className="pt-2 leading-relaxed">{about}</p>}
        {info && (
          <button type="button" onClick={() => openSheet(info.id)} className="mt-2 inline-flex items-center gap-1.5 font-bold text-accent-text hover:underline">
            <Icon name="info" size={18} /> How to do it
          </button>
        )}
      </div>
      <div className="order-1 sm:order-2 max-w-[300px] w-full mx-auto sm:max-w-none">
        <ExerciseDemo animation={animation} name={se.name} />
      </div>
    </div>
  );
}

function SetTracker({ total, done }: { total: number; done: number }) {
  return (
    <div className="flex items-center gap-3" aria-label={`${done} of ${total} sets completed, ${Math.max(0, total - done)} remaining`}>
      <ol className="flex gap-2">
        {Array.from({ length: total }, (_, i) => (
          <li
            key={i}
            className={cx(
              "h-10 min-w-10 px-2 rounded-ctl grid place-items-center num font-bold border-2",
              i < done ? "bg-done text-white border-done" : i === done ? "border-accent text-accent-text bg-accent-soft" : "border-line text-muted",
            )}
            aria-current={i === done ? "step" : undefined}
          >
            {i < done ? <Icon name="check" size={18} strokeWidth={2.6} /> : i + 1}
          </li>
        ))}
      </ol>
      <p className="text-sm text-muted">
        <span className="font-semibold text-ink">{done}</span> done · <span className="font-semibold text-ink">{Math.max(0, total - done)}</span> left
      </p>
    </div>
  );
}

function CompleteBlock({ se, next, onNext, onUndo, onRest }: { se: SessionExercise; next?: string; onNext: () => void; onUndo: () => void; onRest?: () => void }) {
  const armed = useArmed();
  return (
    <div className="rounded-card bg-done-soft p-4 space-y-3 anim-pop">
      <p className="font-semibold text-done flex items-center gap-2">
        <Icon name="check" size={20} strokeWidth={2.4} /> {se.name} complete
      </p>
      <Button size="xl" block iconRight="chevronRight" onClick={() => armed && onNext()} aria-disabled={!armed}>
        {next ? `Next: ${next}` : "Review & finish workout"}
      </Button>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="ghost" icon="undo" onClick={() => armed && onUndo()}>
          Undo last set
        </Button>
        {onRest && (
          <Button size="sm" variant="ghost" icon="timer" onClick={() => armed && onRest()}>
            Rest before moving on
          </Button>
        )}
      </div>
    </div>
  );
}

function SecondaryActions({ se, onShowTips, showTips }: { se: SessionExercise; onShowTips: () => void; showTips: boolean }) {
  const { step } = useApp();
  const confirm = useConfirm();
  return (
    <>
      <Button variant="ghost" size="sm" icon="info" onClick={onShowTips} aria-expanded={showTips}>
        {showTips ? "Hide technique" : "Technique tips"}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        icon="skip"
        onClick={async () => {
          const ok = await confirm({ title: `Skip ${se.name}?`, body: "Sets you already recorded are kept. You can come back to it later.", confirmLabel: "Skip exercise" });
          if (ok) step((d, a) => skipExercise(d, a, se.id, new Date()));
        }}
      >
        Skip exercise
      </Button>
    </>
  );
}

function Tips({ steps, mistakes, safety, breathing }: { steps: string[]; mistakes: string[]; safety: string[]; breathing?: string }) {
  return (
    <div className="grid md:grid-cols-2 gap-4 text-[15px] border-t border-line pt-4">
      <div>
        <h3 className="font-semibold mb-1.5">How to do it</h3>
        <ol className="list-decimal pl-5 space-y-1">
          {steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        {breathing && <p className="mt-2 text-muted">{breathing}</p>}
      </div>
      <div className="space-y-3">
        <div>
          <h3 className="font-semibold mb-1.5">Avoid</h3>
          <ul className="list-disc pl-5 space-y-1">
            {mistakes.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="font-semibold mb-1.5">Stay safe</h3>
          <ul className="list-disc pl-5 space-y-1">
            {safety.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- rest timer (steps 8–11)

function RestPanel({ current }: { current: SessionExercise | null }) {
  const { active, setActive, prefs, setPrefs, step } = useApp();
  const timer = active!.timer;
  const running = timer.status === "running";
  const now = useNow(running, 200);
  const rem = remainingMs(timer, now);
  const done = timer.status === "done";
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState<number | null>(timer.durationMs / 1000);

  const update = (fn: (t: typeof timer) => typeof timer) => setActive((a) => (a ? { ...a, timer: fn(a.timer), updatedAt: Date.now() } : a));
  const restartWith = (seconds: number) => {
    unlockAudio();
    setActive((a) =>
      a
        ? {
            ...a,
            restOverride: current ? { ...a.restOverride, [current.id]: seconds } : a.restOverride,
            timer: startTimer(seconds, Date.now(), { runId: uuid(), sessionExerciseId: a.timer.sessionExerciseId, nextSetNumber: a.timer.nextSetNumber }),
            updatedAt: Date.now(),
          }
        : a,
    );
  };
  const armed = useArmed();
  const beginNext = () => setActive((a) => (a ? { ...a, timer: clearTimer(), updatedAt: Date.now() } : a));

  return (
    <section className={cx("card p-6 flex flex-col items-center text-center gap-5", done && "border-accent ring-2 ring-accent")} aria-labelledby="rest-h" aria-live="polite">
      {done ? (
        <div className="space-y-2 anim-pop" role="alert">
          <div className="mx-auto h-16 w-16 rounded-pill bg-accent text-accent-ink grid place-items-center anim-pulse">
            <Icon name="bell" size={30} />
          </div>
          <h2 id="rest-h" className="text-2xl md:text-3xl">
            Rest finished — time for your next set!
          </h2>
          {current && timer.nextSetNumber && (
            <p className="text-muted">
              {current.name} · set {timer.nextSetNumber} of {current.targetSets}
            </p>
          )}
        </div>
      ) : (
        <h2 id="rest-h" className="text-lg text-muted font-semibold" style={{ fontFamily: "var(--body-font)", textTransform: "none" }}>
          {timer.nextSetNumber && current ? `Rest · next: ${current.name}, set ${timer.nextSetNumber}` : "Rest before your next exercise"}
        </h2>
      )}

      {!done && (
        <ProgressRing value={1 - progress(timer, now)} size={248} stroke={14} label={`${formatClock(rem / 1000)} of rest remaining`}>
          <div className="leading-none">
            <div className="num text-7xl font-bold tracking-tight" aria-hidden="true">
              {formatClock(rem / 1000)}
            </div>
            <div className="text-sm text-muted mt-2">{timer.status === "paused" ? "Paused" : `of ${formatClock(timer.durationMs / 1000)}`}</div>
          </div>
        </ProgressRing>
      )}

      {done ? (
        <Button size="xl" block icon="play" onClick={() => armed && beginNext()} className="max-w-md h-[72px] text-xl">
          {timer.nextSetNumber ? `Begin set ${timer.nextSetNumber}` : "Continue"}
        </Button>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <IconButton icon="minus" label="Remove 15 seconds" variant="secondary" size={52} onClick={() => update((t) => adjustTimer(t, -15, Date.now()))} />
            {running ? (
              <Button size="xl" variant="secondary" icon="pause" onClick={() => update((t) => pauseTimer(t, Date.now()))}>
                Pause
              </Button>
            ) : (
              <Button size="xl" variant="secondary" icon="play" onClick={() => update((t) => resumeTimer(t, Date.now()))}>
                Resume
              </Button>
            )}
            <IconButton icon="plus" label="Add 15 seconds" variant="secondary" size={52} onClick={() => update((t) => adjustTimer(t, 15, Date.now()))} />
          </div>
          <Button size="lg" icon="skip" onClick={beginNext}>
            Skip rest
          </Button>
          <div className="flex flex-wrap justify-center gap-1.5" role="group" aria-label="Restart rest with a preset">
            {REST_PRESETS.map((s) => (
              <button key={s} type="button" onClick={() => restartWith(s)} className="h-9 px-3 rounded-pill border border-line text-sm font-semibold hover:bg-raised num">
                {s}s
              </button>
            ))}
            <button type="button" onClick={() => setCustomOpen((o) => !o)} className="h-9 px-3 rounded-pill border border-line text-sm font-semibold hover:bg-raised" aria-expanded={customOpen}>
              Custom
            </button>
          </div>
          {customOpen && (
            <div className="flex items-end gap-2">
              <NumberStepper label="Seconds" value={custom} onChange={setCustom} min={5} max={900} step={5} />
              <Button onClick={() => custom && restartWith(custom)} disabled={!custom}>
                Restart
              </Button>
            </div>
          )}
          <button
            type="button"
            onClick={() => setPrefs({ soundEnabled: !prefs.soundEnabled })}
            className="text-sm text-muted flex items-center gap-1.5 hover:text-ink"
            aria-pressed={prefs.soundEnabled}
          >
            <Icon name={prefs.soundEnabled ? "volume" : "volumeOff"} size={18} />
            {prefs.soundEnabled ? "Sound on" : "Sound off — you'll get a visual alert"}
          </button>
          {current && timer.sessionExerciseId === current.id && (
            <Button variant="ghost" size="sm" icon="undo" onClick={() => step((d, a) => undoLastSet(d, a, current.id, new Date()))}>
              Undo last set
            </Button>
          )}
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- summary (steps 13–14)

function SummaryDialog({ open, onClose, onSave, onDiscard }: { open: boolean; onClose: () => void; onSave: (notes: string) => void; onDiscard: () => void }) {
  const { data, active } = useApp();
  const [notes, setNotes] = useState("");
  const session = active ? data.sessions.find((s) => s.id === active.sessionId) : undefined;
  const list = session ? sessionExercisesOf(data, session.id) : [];
  const prog = session ? sessionProgress(data, session.id) : null;
  const minutes = useMemo(() => (session ? Math.round((Date.now() - new Date(session.startedAt).getTime()) / 60000) : 0), [session, open]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!session || !prog) return null;
  const notStarted = list.filter((e) => e.status === "pending" || e.status === "active" || e.status === "skipped").filter((e) => e.status !== "completed");
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={prog.allDone ? "Workout complete" : "Finish workout?"}
      description={prog.allDone ? "Every exercise is done. Save it to your history and calendar." : "Not every exercise is done. It will be saved as partially completed."}
      footer={
        <>
          {!prog.anyWork ? (
            <Button variant="ghost" icon="trash" onClick={onDiscard} className="mr-auto text-danger">
              Discard
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onClose}>
            {prog.allDone ? "Back" : "Keep training"}
          </Button>
          <Button icon="check" onClick={() => onSave(notes)} disabled={!prog.anyWork}>
            {prog.allDone ? "Save workout" : "Save as partial"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Minutes" value={minutes} />
          <Stat label="Sets" value={prog.sets} />
          <Stat label="Exercises" value={`${prog.completed}/${prog.total}`} />
        </div>
        <ul className="divide-y divide-line">
          {list.map((e) => (
            <li key={e.id} className="py-2 flex items-center gap-2">
              <span className="flex-1 min-w-0 break-words">{e.name}</span>
              <span className="text-sm text-muted num">
                {isTimed(e) ? (e.durationSeconds ? `${Math.round(e.durationSeconds / 60)} min` : "—") : `${setsOf(data, e.id).length}/${e.targetSets} sets`}
              </span>
              <Badge tone={e.status === "completed" ? "done" : e.status === "skipped" ? "neutral" : "partial"}>
                {e.status === "completed" ? "Done" : e.status === "skipped" ? "Skipped" : e.status === "active" ? "Started" : "Not done"}
              </Badge>
            </li>
          ))}
        </ul>
        {!prog.anyWork && <p className="text-sm text-muted">Nothing has been recorded yet, so there's nothing to save. Discard the session or keep training.</p>}
        {notStarted.length > 0 && prog.anyWork && !prog.allDone && <p className="text-sm text-muted">Unfinished exercises stay visible in this session's history.</p>}
        <label className="block space-y-1.5">
          <span className="text-sm font-semibold">Notes (optional)</span>
          <textarea className="field min-h-20" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Energy, how the weights felt, anything to remember" />
        </label>
      </div>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-ctl bg-raised border border-line py-3">
      <div className="num text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}
