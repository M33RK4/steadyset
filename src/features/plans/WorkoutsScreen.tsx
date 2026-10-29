"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApp } from "@/lib/store/AppStore";
import {
  archivePlan,
  cyclePosition,
  dayLabel,
  daysOfPlan,
  deletePlan,
  duplicatePlan,
  estimateMinutes,
  exercisesOfDay,
  formatTarget,
  instantiateTemplate,
  isCycle,
  resetPlanToTemplate,
  setActivePlan,
} from "@/lib/plans/planOps";
import { PLAN_TEMPLATES, type PlanTemplate } from "@/lib/data/defaultPlan";
import type { Plan, PlanDay } from "@/lib/domain/types";
import { orderedWeekdays, WEEKDAY_NAMES, WEEKDAY_SHORT } from "@/lib/util/dates";
import { Badge, Button, EmptyState, IconButton, PageHeader, Switch, cx } from "@/components/ui/primitives";
import { Dialog, useConfirm, useToast } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { DAY_KIND_LABEL, useExercises, useToday } from "../common";
import { ExerciseName } from "../library/ExerciseSheet";
import { InlineDayEditor } from "./PlanEditor";
import { LogActivityDialog, useStartWorkout } from "../workout/useStartWorkout";
import { LogWorkoutDialog } from "../workout/LogWorkoutDialog";

export function WorkoutsScreen() {
  const { data, commit } = useApp();
  const router = useRouter();
  const toast = useToast();
  const today = useToday();
  const [logOpen, setLogOpen] = useState(false);
  const [logWorkoutOpen, setLogWorkoutOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [starting, setStarting] = useState<PlanTemplate | null>(null);
  const live = data.plans.filter((p) => !p.archivedAt).sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.createdAt.localeCompare(b.createdAt));
  const archived = data.plans.filter((p) => p.archivedAt);

  return (
    <div className="space-y-8">
      <PageHeader
        title="My workouts"
        subtitle="Your plans and weekly schedule. The active plan drives your dashboard and calendar."
        actions={
          <>
            <Button variant="secondary" icon="dumbbell" onClick={() => setLogWorkoutOpen(true)}>
              Log workout
            </Button>
            <Button variant="secondary" icon="walk" onClick={() => setLogOpen(true)}>
              Log activity
            </Button>
            <Button icon="plus" onClick={() => router.push("/workouts/new")}>
              Create plan
            </Button>
          </>
        }
      />

      {live.length === 0 ? (
        <EmptyState
          icon="dumbbell"
          title="No plans yet"
          action={
            <Button onClick={() => router.push("/workouts/new")} icon="plus">
              Create plan
            </Button>
          }
        >
          Create your own plan, or copy the beginner template below.
        </EmptyState>
      ) : (
        <div className="space-y-5">
          {live.map((p) => (
            <PlanCard key={p.id} plan={p} />
          ))}
        </div>
      )}

      <section aria-labelledby="tpl-h" className="space-y-3">
        <h2 id="tpl-h" className="text-xl">
          Templates
        </h2>
        {PLAN_TEMPLATES.map((t) => (
          <div key={t.key} className="card p-4 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[220px]">
              <p className="font-semibold flex flex-wrap items-center gap-2">
                {t.name}
                {t.schedule === "cycle" && <Badge tone="accent">Repeating cycle</Badge>}
              </p>
              <p className="text-sm text-muted">{t.description}</p>
            </div>
            {t.schedule === "cycle" ? (
              <Button icon="play" onClick={() => setStarting(t)}>
                Use this plan
              </Button>
            ) : (
              <Button
                variant="secondary"
                icon="copy"
                onClick={() => {
                  const r = instantiateTemplate(data, t, { makeActive: false, name: `${t.name} (my copy)` });
                  commit(r.changes);
                  toast("Template copied — edit it to make it yours", { tone: "success" });
                  router.push(`/workouts/${r.planId}`);
                }}
              >
                Copy and customise
              </Button>
            )}
          </div>
        ))}
      </section>

      {archived.length > 0 && (
        <section className="space-y-3">
          <button type="button" className="flex items-center gap-2 text-lg font-semibold" aria-expanded={showArchived} onClick={() => setShowArchived((s) => !s)}>
            <Icon name={showArchived ? "chevronDown" : "chevronRight"} size={18} /> Archived plans ({archived.length})
          </button>
          {showArchived && archived.map((p) => <PlanCard key={p.id} plan={p} />)}
        </section>
      )}

      <LogActivityDialog open={logOpen} onClose={() => setLogOpen(false)} date={today} day={null} />
      <LogWorkoutDialog open={logWorkoutOpen} onClose={() => setLogWorkoutOpen(false)} date={today} />
      {starting && <StartCycleDialog template={starting} onClose={() => setStarting(null)} />}
    </div>
  );
}

/** Start a cycle template: choose the order of its days, which day today is, and make it active. */
function StartCycleDialog({ template, onClose }: { template: PlanTemplate; onClose: () => void }) {
  const { commit } = useApp();
  const toast = useToast();
  const [order, setOrder] = useState(() => template.days.map((_, i) => i));
  const [todayPos, setTodayPos] = useState(0);
  const [makeActive, setMakeActive] = useState(true);
  const move = (pos: number, delta: number) =>
    setOrder((o) => {
      const n = [...o];
      [n[pos], n[pos + delta]] = [n[pos + delta], n[pos]];
      return n;
    });
  const dayName = (pos: number) => template.days[order[pos]].name;
  const sequence = order.map((i) => template.days[i].name);
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Start ${template.name}`}
      description="It repeats in this order every day, whatever the weekday. You can change everything later with Edit."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            icon="check"
            onClick={() => {
              const name = sequence.join(" · ");
              commit((d) => instantiateTemplate(d, template, { makeActive, order, todayPosition: todayPos, name }).changes);
              toast(makeActive ? `${name} is now your plan. Today is ${dayName(todayPos)}.` : `${name} added to your plans`, { tone: "success" });
              onClose();
            }}
          >
            {makeActive ? "Start plan" : "Add plan"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <section>
          <p className="eyebrow mb-2">Order</p>
          <ol className="space-y-2">
            {order.map((ti, pos) => (
              <li key={ti} className="tile flex items-center gap-3 p-2 pl-3">
                <span className="num text-muted w-12 shrink-0 text-sm">Day {pos + 1}</span>
                <span className="font-bold flex-1">{template.days[ti].name}</span>
                <IconButton icon="arrowUp" label={`Move ${template.days[ti].name} earlier`} size={38} disabled={pos === 0} onClick={() => move(pos, -1)} />
                <IconButton icon="arrowDown" label={`Move ${template.days[ti].name} later`} size={38} disabled={pos === order.length - 1} onClick={() => move(pos, 1)} />
              </li>
            ))}
          </ol>
          <p className="text-sm text-muted mt-2">
            Then it starts again: {sequence.join(" → ")} → {sequence[0]} …
          </p>
        </section>
        <section>
          <p className="eyebrow mb-2">What are you doing today?</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Which day of the cycle is today">
            {order.map((ti, pos) => (
              <button
                key={ti}
                type="button"
                role="radio"
                aria-checked={todayPos === pos}
                onClick={() => setTodayPos(pos)}
                className={cx("h-10 px-4 rounded-btn font-bold border-2", todayPos === pos ? "bg-accent text-accent-ink border-accent" : "border-line hover:border-accent")}
              >
                {template.days[ti].name}
              </button>
            ))}
          </div>
        </section>
        <Switch label="Make this my active plan" description="Your active plan decides what shows on Today and in the calendar." checked={makeActive} onChange={setMakeActive} />
      </div>
    </Dialog>
  );
}

function PlanCard({ plan }: { plan: Plan }) {
  const { data, commit, prefs } = useApp();
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const start = useStartWorkout();
  const today = useToday();
  const ex = useExercises();
  const days = daysOfPlan(data, plan.id);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const template = PLAN_TEMPLATES.find((t) => t.key === plan.templateKey);
  const sessionsUsing = data.sessions.filter((s) => s.planId === plan.id).length;
  const byWeekday = new Map(days.map((d) => [d.weekday, d]));
  const opened = days.find((d) => d.id === openDay) ?? null;
  const cycle = isCycle(plan);
  const todayPos = cycle && days.length ? cyclePosition(plan.cycleStart ?? today, today, days.length) : -1;

  return (
    <article className={cx("card p-5 space-y-4", plan.isActive && "border-accent")} aria-labelledby={`plan-${plan.id}`}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-[220px]">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={`plan-${plan.id}`} className="text-xl md:text-2xl">
              {plan.name}
            </h2>
            {plan.isActive && <Badge tone="accent">Active</Badge>}
            {plan.archivedAt && <Badge>Archived</Badge>}
          </div>
          {cycle && days.length > 0 && (
            <p className="text-sm font-semibold text-accent-text mt-1">
              Repeats every {days.length} days · today is {days[todayPos].name}
            </p>
          )}
          {plan.description && <p className="text-muted mt-1 max-w-2xl">{plan.description}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {!plan.isActive && !plan.archivedAt && (
            <Button
              size="sm"
              onClick={() => {
                commit((d) => setActivePlan(d, plan.id));
                toast(`${plan.name} is now your active plan`, { tone: "success" });
              }}
            >
              Set as active
            </Button>
          )}
          <Button size="sm" variant="secondary" icon="edit" onClick={() => router.push(`/workouts/${plan.id}`)}>
            Edit
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon="copy"
            onClick={() => {
              commit((d) => duplicatePlan(d, plan.id).changes);
              toast("Plan duplicated");
            }}
          >
            Duplicate
          </Button>
          {template && (
            <Button
              size="sm"
              variant="ghost"
              icon="restore"
              onClick={async () => {
                const ok = await confirm({
                  title: "Reset to the original plan?",
                  body: `Your changes to “${plan.name}” will be replaced with the original ${template.name}. Completed workouts are not affected.`,
                  confirmLabel: "Reset plan",
                });
                if (ok) {
                  commit((d) => resetPlanToTemplate(d, plan.id, template));
                  toast("Plan reset to defaults");
                }
              }}
            >
              Reset
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            icon="archive"
            onClick={() => {
              commit((d) => archivePlan(d, plan.id, !plan.archivedAt));
              toast(plan.archivedAt ? "Plan restored" : "Plan archived", {
                action: plan.archivedAt ? undefined : { label: "Undo", onClick: () => commit((d) => archivePlan(d, plan.id, false)) },
              });
            }}
          >
            {plan.archivedAt ? "Restore" : "Archive"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon="trash"
            className="text-danger"
            onClick={async () => {
              const ok = await confirm({
                title: `Delete “${plan.name}”?`,
                body:
                  sessionsUsing > 0
                    ? `The plan and its schedule are deleted permanently. Your ${sessionsUsing} completed workout${sessionsUsing === 1 ? "" : "s"} from this plan stay in your history.`
                    : "The plan and its schedule are deleted permanently.",
                confirmLabel: "Delete plan",
                danger: true,
              });
              if (ok) {
                commit((d) => deletePlan(d, plan.id));
                toast("Plan deleted");
              }
            }}
          >
            Delete
          </Button>
        </div>
      </div>

      {cycle ? (
        <ol className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-1.5" aria-label="Cycle">
          {days.map((d, pos) => {
            const selected = d.id === openDay;
            return (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => setOpenDay(selected ? null : d.id)}
                  aria-expanded={selected}
                  aria-label={`Day ${pos + 1}: ${d.name}${pos === todayPos ? " (today)" : ""}`}
                  className={cx(
                    "w-full rounded-ctl border px-3 py-2.5 text-left min-h-[76px] flex flex-col gap-1 transition-colors",
                    selected ? "border-accent bg-accent-soft" : d.kind !== "rest" ? "border-line hover:border-accent bg-surface" : "border-dashed border-line bg-raised",
                    pos === todayPos && "ring-2 ring-accent",
                  )}
                >
                  <span className="text-xs font-semibold text-muted">
                    Day {pos + 1}
                    {pos === todayPos && <span className="text-accent-text"> · today</span>}
                  </span>
                  <span className={cx("text-[14px] leading-tight font-semibold", d.kind === "rest" && "text-muted")}>{d.name}</span>
                </button>
              </li>
            );
          })}
          <li className="hidden lg:grid place-items-center text-muted text-sm" aria-hidden="true">
            <span className="flex items-center gap-1">
              <Icon name="restore" size={16} /> repeats
            </span>
          </li>
        </ol>
      ) : (
        <ol className="grid grid-cols-1 sm:grid-cols-7 gap-1.5" aria-label="Weekly schedule">
          {orderedWeekdays(prefs.weekStartsOn).map((wd) => {
            const d = byWeekday.get(wd);
            const selected = d && d.id === openDay;
            return (
              <li key={wd}>
                <button
                  type="button"
                  disabled={!d}
                  onClick={() => d && setOpenDay(selected ? null : d.id)}
                  aria-expanded={d ? !!selected : undefined}
                  aria-label={`${WEEKDAY_NAMES[wd]}: ${d ? d.name : "no workout"}`}
                  className={cx(
                    "w-full rounded-ctl border px-3 py-2.5 sm:p-2 text-left sm:min-h-[84px] flex flex-row items-center sm:items-start sm:flex-col gap-3 sm:gap-1 transition-colors",
                    selected ? "border-accent bg-accent-soft" : d && d.kind !== "rest" ? "border-line hover:border-accent bg-surface" : "border-dashed border-line bg-raised",
                  )}
                >
                  <span className="text-xs font-semibold text-muted w-9 sm:w-auto shrink-0">{WEEKDAY_SHORT[wd]}</span>
                  <span className={cx("text-[13px] leading-tight font-semibold", !d || d.kind === "rest" ? "text-muted" : "")}>{d ? d.name : "—"}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {opened && (
        <DayDetail key={opened.id} day={opened} label={dayLabel(plan, opened, WEEKDAY_NAMES)} canStart={!plan.archivedAt} onStart={() => start(opened, today)} exName={(id) => ex.get(id)?.name ?? "Exercise"} />
      )}
    </article>
  );
}

function DayDetail({ day, label, canStart, onStart, exName }: { day: PlanDay; label: string; canStart: boolean; onStart: () => void; exName: (id: string) => string }) {
  const { data } = useApp();
  const ex = useExercises();
  const [editing, setEditing] = useState(false);
  const items = exercisesOfDay(data, day.id);
  if (editing) return <InlineDayEditor planId={day.planId} dayId={day.id} label={label} onDone={() => setEditing(false)} />;
  return (
    <div className="rounded-card bg-raised border border-line p-4 space-y-3 anim-pop">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg flex-1">
          {label} · {day.name}
        </h3>
        <Badge>{DAY_KIND_LABEL[day.kind]}</Badge>
        {day.kind !== "rest" && day.kind !== "activity" && <span className="text-sm text-muted">about {estimateMinutes(data, day.id)} min</span>}
      </div>
      {day.notes && <p className="text-sm text-muted">{day.notes}</p>}
      {items.length > 0 && (
        <ol className="divide-y divide-line">
          {items.map((e, i) => (
            <li key={e.id} className="py-2 flex items-baseline gap-3">
              <span className="num text-muted w-5 text-right shrink-0">{i + 1}</span>
              <ExerciseName exerciseId={e.exerciseId} name={exName(e.exerciseId)} className="flex-1 font-medium" />
              <span className="text-sm text-muted whitespace-nowrap">
                {formatTarget(e)}
                {e.restSeconds > 0 && e.targetUnit !== "minutes" ? ` · ${e.restSeconds}s rest` : ""}
              </span>
            </li>
          ))}
        </ol>
      )}
      <div className="flex flex-wrap gap-2">
        {canStart && (day.kind === "strength" || day.kind === "cardio") && (
          <Button icon="play" onClick={onStart}>
            Start this workout
          </Button>
        )}
        <Button variant="secondary" icon="edit" onClick={() => setEditing(true)}>
          Edit this workout
        </Button>
      </div>
    </div>
  );
}
