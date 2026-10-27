"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/store/AppStore";
import { useConfirm, useToast, Dialog } from "@/components/ui/Dialog";
import { Button, Field } from "@/components/ui/primitives";
import { activePlan } from "@/lib/plans/planOps";
import { inProgressSession, logActivity, startSession } from "@/lib/session/sessionOps";
import type { LocalDate, PlanDay } from "@/lib/domain/types";
import { todayLocal } from "@/lib/util/dates";
import { unlockAudio } from "@/lib/audio/alerts";
import { clearTimer } from "@/lib/timer/restTimer";

/** Steps 1–2 of the workout flow: create the session (recording the start time) and open it. */
export function useStartWorkout() {
  const { data, commit, setActive, active } = useApp();
  const router = useRouter();
  const confirm = useConfirm();

  return async (day: PlanDay | null, date: LocalDate = todayLocal(), title?: string) => {
    unlockAudio();
    const running = inProgressSession(data);
    if (running) {
      const resume = await confirm({
        title: "A workout is already in progress",
        body: `“${running.title}” was started ${new Date(running.startedAt).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })}. Resume it, or finish it first from the workout screen.`,
        confirmLabel: "Resume workout",
      });
      if (resume) {
        if (!active || active.sessionId !== running.id) setActive({ sessionId: running.id, currentExerciseId: null, timer: active?.timer ?? clearTimer(), restOverride: {}, updatedAt: Date.now() });
        router.push("/workout");
      }
      return;
    }
    const plan = day ? data.plans.find((p) => p.id === day.planId) ?? null : activePlan(data) ?? null;
    const r = startSession(data, { plan, day, date, now: new Date(), title });
    commit(r.changes);
    setActive(r.active);
    router.push("/workout");
  };
}


const ACTIVITIES = ["Walking", "Cycling", "Swimming", "Hiking", "Yoga", "Dancing", "Sport", "Other"];

/** Quick log for optional activities and cardio days: records a completed session, no sets. */
export function LogActivityDialog({
  open,
  onClose,
  date,
  day,
  kind = "activity",
}: {
  open: boolean;
  onClose: () => void;
  date: LocalDate;
  day: PlanDay | null;
  kind?: "activity" | "cardio";
}) {
  const { data, commit } = useApp();
  const toast = useToast();
  const [type, setType] = useState(kind === "cardio" ? "Treadmill walking" : "Walking");
  const [minutes, setMinutes] = useState<string>(kind === "cardio" ? "25" : "30");
  const [notes, setNotes] = useState("");
  const m = Number(minutes);
  const valid = Number.isFinite(m) && m > 0 && m <= 600;
  const save = () => {
    if (!valid) return;
    const plan = day ? data.plans.find((p) => p.id === day.planId) ?? null : null;
    commit(logActivity(data, { date, activityType: type.trim() || "Activity", minutes: m, notes, planDay: day, plan, now: new Date(), kind }));
    toast(`${type} logged — ${m} min`, { tone: "success" });
    onClose();
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={kind === "cardio" ? "Log cardio session" : "Log an activity"}
      description="Saved as a completed session in your calendar and history."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!valid} icon="check">
            Save activity
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Activity">
          {(id) => (
            <>
              <input id={id} className="field" list="activity-types" value={type} onChange={(e) => setType(e.target.value)} />
              <datalist id="activity-types">
                {ACTIVITIES.map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <Field label="Duration (minutes)" error={minutes && !valid ? "Enter a duration between 1 and 600 minutes." : null}>
          {(id) => <input id={id} className="field num" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/[^0-9.]/g, ""))} />}
        </Field>
        <Field label="Notes (optional)">
          {(id) => <textarea id={id} className="field min-h-20" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="How did it feel?" />}
        </Field>
      </div>
    </Dialog>
  );
}
