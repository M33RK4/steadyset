"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApp } from "@/lib/store/AppStore";
import {
  archivePlan,
  daysOfPlan,
  deletePlan,
  duplicatePlan,
  estimateMinutes,
  exercisesOfDay,
  formatTarget,
  instantiateTemplate,
  resetPlanToTemplate,
  setActivePlan,
} from "@/lib/plans/planOps";
import { PLAN_TEMPLATES } from "@/lib/data/defaultPlan";
import type { Plan, PlanDay } from "@/lib/domain/types";
import { orderedWeekdays, WEEKDAY_NAMES, WEEKDAY_SHORT } from "@/lib/util/dates";
import { Badge, Button, EmptyState, PageHeader, cx } from "@/components/ui/primitives";
import { useConfirm, useToast } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { DAY_KIND_LABEL, useExercises, useToday } from "../common";
import { ExerciseName } from "../library/ExerciseSheet";
import { LogActivityDialog, useStartWorkout } from "../workout/useStartWorkout";

export function WorkoutsScreen() {
  const { data, commit } = useApp();
  const router = useRouter();
  const toast = useToast();
  const today = useToday();
  const [logOpen, setLogOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const live = data.plans.filter((p) => !p.archivedAt).sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.createdAt.localeCompare(b.createdAt));
  const archived = data.plans.filter((p) => p.archivedAt);

  return (
    <div className="space-y-8">
      <PageHeader
        title="My workouts"
        subtitle="Your plans and weekly schedule. The active plan drives your dashboard and calendar."
        actions={
          <>
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
        <EmptyState icon="dumbbell" title="No plans yet" action={<Button onClick={() => router.push("/workouts/new")} icon="plus">Create plan</Button>}>
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
              <p className="font-semibold">{t.name}</p>
              <p className="text-sm text-muted">{t.description}</p>
            </div>
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
    </div>
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

      {opened && <DayDetail day={opened} canStart={!plan.archivedAt} onStart={() => start(opened, today)} exName={(id) => ex.get(id)?.name ?? "Exercise"} />}
    </article>
  );
}

function DayDetail({ day, canStart, onStart, exName }: { day: PlanDay; canStart: boolean; onStart: () => void; exName: (id: string) => string }) {
  const { data } = useApp();
  const ex = useExercises();
  const items = exercisesOfDay(data, day.id);
  return (
    <div className="rounded-card bg-raised border border-line p-4 space-y-3 anim-pop">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg flex-1">
          {WEEKDAY_NAMES[day.weekday]} · {day.name}
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
      {canStart && (day.kind === "strength" || day.kind === "cardio") && (
        <Button icon="play" onClick={onStart}>
          Start this workout
        </Button>
      )}
    </div>
  );
}
