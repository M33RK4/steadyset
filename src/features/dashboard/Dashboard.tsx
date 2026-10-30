"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useApp } from "@/lib/store/AppStore";
import { buildDay, currentStreak, nextRestDay, upcomingWorkouts, weekSummary, type CalendarDay } from "@/lib/calendar/calendar";
import { estimateMinutes, exercisesOfDay, formatTarget } from "@/lib/plans/planOps";
import { deleteSession, inProgressSession, sessionProgress } from "@/lib/session/sessionOps";
import { formatDuration, formatLongDate, WEEKDAY_SHORT, weekdayOf } from "@/lib/util/dates";
import { Badge, Button, EmptyState, IconButton, ProgressRing, cx } from "@/components/ui/primitives";
import { useConfirm, useToast } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { greeting, useCalendarContext, useExercises, useToday } from "../common";
import { LogActivityDialog, useStartWorkout } from "../workout/useStartWorkout";
import { LogWorkoutDialog } from "../workout/LogWorkoutDialog";
import { StatusDot } from "../calendar/StatusDot";
import { HeroArt } from "@/components/ui/ThemeArt";
import { BuddyStrip } from "../buddies/BuddyLive";
import { useBuddies } from "../buddies/BuddiesProvider";
import { ExerciseName } from "../library/ExerciseSheet";

export function Dashboard() {
  const { data, prefs, commit, active, setActive } = useApp();
  const today = useToday();
  const confirm = useConfirm();
  const toast = useToast();
  const [logWorkoutOpen, setLogWorkoutOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const removeSession = async (id: string) => {
    const s = data.sessions.find((x) => x.id === id);
    if (!s) return;
    const ok = await confirm({
      title: `Delete “${s.title}”?`,
      body: "It's removed from your calendar, history and progress, along with every set recorded in it. This can't be undone.",
      confirmLabel: "Delete workout",
      danger: true,
    });
    if (!ok) return;
    commit((d) => deleteSession(d, id));
    if (active?.sessionId === id) setActive(null);
    toast("Workout deleted");
  };
  const ctx = useCalendarContext();
  const ex = useExercises();
  const start = useStartWorkout();
  const [logOpen, setLogOpen] = useState(false);

  const todayDay = useMemo(() => buildDay(ctx, today), [ctx, today]);
  const week = useMemo(() => weekSummary(ctx, prefs.weekStartsOn), [ctx, prefs.weekStartsOn]);
  const streak = useMemo(() => currentStreak(ctx), [ctx]);
  const upcoming = useMemo(() => upcomingWorkouts(ctx, 3), [ctx]);
  const rest = useMemo(() => nextRestDay(ctx), [ctx]);
  const running = inProgressSession(data);
  const recent = useMemo(
    () => data.sessions.filter((s) => s.status === "completed" || s.status === "partial").sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 5),
    [data.sessions],
  );
  const hasHistory = recent.length > 0;
  const name = prefs.displayName.trim();

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">{formatLongDate(today)}</p>
        <h1 className="text-5xl md:text-6xl mt-3">
          <Greeting name={name} />
        </h1>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1.45fr_1fr]">
        <TodayCard day={todayDay} running={running?.id ?? null} onStart={() => start(todayDay.planned, today)} onLog={() => setLogOpen(true)} onLogWorkout={() => setLogWorkoutOpen(true)} onDelete={removeSession} exName={(id) => ex.get(id)?.name ?? "Exercise"} />

        <section className="card p-6 space-y-5" aria-labelledby="week-h">
          <div className="flex items-center justify-between">
            <h2 id="week-h" className="text-2xl">
              This week
            </h2>
            <Link href="/calendar" className="text-sm font-semibold text-accent-text hover:underline">
              Calendar
            </Link>
          </div>
          <div className="flex items-center gap-5">
            <ProgressRing value={week.plannedCount ? week.requiredDone / week.plannedCount : 0} size={92} stroke={9} label={`${week.requiredDone} of ${week.plannedCount} planned workouts done`}>
              <div className="text-center leading-none">
                <div className="num text-2xl font-bold">
                  {week.requiredDone}/{week.plannedCount}
                </div>
                <div className="text-[11px] text-muted mt-1">planned</div>
              </div>
            </ProgressRing>
            <div className="space-y-2 min-w-0">
              {hasHistory ? (
                <>
                  <p className="flex items-center gap-2">
                    <Icon name="flame" size={20} className="text-accent-text" />
                    <span>
                      <span className="num text-xl font-bold">{streak}</span> <span className="text-muted">day streak</span>
                    </span>
                  </p>
                  <p className="text-sm text-muted">{week.doneCount ? `${week.doneCount} session${week.doneCount === 1 ? "" : "s"} logged this week.` : "Nothing logged yet this week."}</p>
                </>
              ) : (
                <p className="text-sm text-muted">Your streak and weekly progress appear here once you finish your first workout.</p>
              )}
            </div>
          </div>
          <WeekStrip days={week.days} today={today} />
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-6" aria-labelledby="up-h">
          <h2 id="up-h" className="text-2xl mb-3">
            Coming up
          </h2>
          {upcoming.length ? (
            <ul className="divide-y divide-line">
              {upcoming.map((d) => (
                <li key={d.date} className="py-3 flex items-center gap-3">
                  <DateChip date={d.date} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{d.planned!.name}</p>
                    <p className="text-sm text-muted">
                      {d.planned!.kind === "strength" ? `${exercisesOfDay(data, d.planned!.id).length} exercises · about ${estimateMinutes(data, d.planned!.id)} min` : d.planned!.kind === "cardio" ? "Light cardio & mobility" : "Optional"}
                      {d.plannedSource === "moved" && " · moved"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted text-sm">No workouts scheduled in the next weeks. Pick or create a plan in My Workouts.</p>
          )}
          {rest && (
            <p className="mt-3 pt-3 border-t border-line text-sm flex items-center gap-2 text-muted">
              <Icon name="bed" size={18} /> Next rest day: <span className="font-semibold text-ink">{rest.date === today ? "today" : formatLongDate(rest.date)}</span>
            </p>
          )}
        </section>

        <section className="card p-6" aria-labelledby="recent-h">
          <div className="flex items-center justify-between mb-3">
            <h2 id="recent-h" className="text-2xl">
              Recent workouts
            </h2>
            {hasHistory && (
              <Link href="/progress" className="text-sm font-semibold text-accent-text hover:underline">
                Progress
              </Link>
            )}
          </div>
          {hasHistory ? (
            <ul className="divide-y divide-line">
              {recent.map((s) => {
                const p = sessionProgress(data, s.id);
                return (
                  <li key={s.id} className="py-3 flex items-center gap-3">
                    <DateChip date={s.localDate} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{s.title}</p>
                      <p className="text-sm text-muted">
                        {formatDuration(s.durationSeconds)}
                        {p.sets ? ` · ${p.sets} sets` : ""}
                      </p>
                    </div>
                    <Badge tone={s.status === "completed" ? "done" : "partial"}>{s.status === "completed" ? "Completed" : "Partial"}</Badge>
                    {p.total > 0 && <IconButton icon="edit" label={`Edit ${s.title}`} size={36} className="text-muted -mr-2" onClick={() => setEditId(s.id)} />}
                    <IconButton icon="trash" label={`Delete ${s.title}`} size={36} className="text-muted" onClick={() => void removeSession(s.id)} />
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              icon="dumbbell"
              title="No workouts yet"
              action={
                <Button variant="secondary" icon="plus" onClick={() => setLogWorkoutOpen(true)}>
                  Log a workout
                </Button>
              }
            >
              Finish your first session, or log one you already did, and it'll show up here.
            </EmptyState>
          )}
        </section>
      </div>

      <BuddiesRow />

      <LogWorkoutDialog open={logWorkoutOpen} onClose={() => setLogWorkoutOpen(false)} date={today} />
      <LogWorkoutDialog open={!!editId} onClose={() => setEditId(null)} date={today} sessionId={editId ?? undefined} />
      <LogActivityDialog open={logOpen} onClose={() => setLogOpen(false)} date={today} day={todayDay.planned} kind={todayDay.planned?.kind === "cardio" ? "cardio" : "activity"} />
    </div>
  );
}

function TodayCard({
  day,
  running,
  onStart,
  onLog,
  onLogWorkout,
  onDelete,
  exName,
}: {
  day: CalendarDay;
  running: string | null;
  onStart: () => void;
  onLog: () => void;
  onLogWorkout: () => void;
  onDelete: (sessionId: string) => void;
  exName: (id: string) => string;
}) {
  const { data } = useApp();
  const planned = day.planned;
  const doneSession = day.sessions.find((s) => s.status === "completed") ?? day.sessions.find((s) => s.status === "partial");
  const exs = planned ? exercisesOfDay(data, planned.id) : [];

  if (running) {
    const s = data.sessions.find((x) => x.id === running)!;
    const p = sessionProgress(data, running);
    return (
      <section className="card hero-surface relative overflow-hidden [&>:not(.hero-art)]:relative p-6 md:p-8 pb-32 md:pb-36 [[data-theme=lily]_&]:pb-8 flex flex-col gap-4" aria-labelledby="today-h">
        <HeroArt />
        <Badge tone="accent" className="self-start">
          In progress
        </Badge>
        <h2 id="today-h" className="relative text-4xl md:text-5xl">
          {s.title}
        </h2>
        <p className="text-muted">
          {p.completed} of {p.total} exercises done · {p.sets} sets logged
        </p>
        <Link
          href="/workout"
          className="btn relative self-start inline-flex items-center gap-2.5 h-16 px-7 rounded-btn bg-accent text-accent-ink font-bold text-lg hover:brightness-110"
        >
          <Icon name="play" size={24} /> Resume workout
        </Link>
        <Button variant="ghost" icon="trash" className="relative self-start text-danger" onClick={() => onDelete(s.id)}>
          {s.localDate < day.date ? "Didn't do it? Delete this workout" : "Delete this workout"}
        </Button>
      </section>
    );
  }

  if (!planned || planned.kind === "rest") {
    return (
      <section className="card hero-surface relative overflow-hidden [&>:not(.hero-art)]:relative p-6 md:p-8 pb-32 md:pb-36 [[data-theme=lily]_&]:pb-8 flex flex-col gap-3" aria-labelledby="today-h">
        <HeroArt />
        <div className="relative h-12 w-12 rounded-btn bg-accent-soft text-accent-text grid place-items-center">
          <Icon name="bed" size={24} />
        </div>
        <h2 id="today-h" className="relative text-4xl md:text-5xl">
          {doneSession ? "Nice work today" : planned ? "Rest day" : "Nothing scheduled today"}
        </h2>
        <p className="text-muted max-w-md">
          {planned ? "Recovery is when your muscles adapt. A gentle walk or some stretching is plenty." : day.skippedDay ? "You moved or skipped today's workout." : "Enjoy the day, or start a workout anyway."}
        </p>
        <div className="relative flex flex-wrap gap-2 mt-2">
          <Button variant="secondary" icon="dumbbell" onClick={onLogWorkout}>
            Log a workout
          </Button>
          <Button variant="secondary" icon="walk" onClick={onLog}>
            Log an activity
          </Button>
          <Button variant="ghost" icon="plus" onClick={onStart}>
            Start an empty workout
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="card hero-surface relative overflow-hidden [&>:not(.hero-art)]:relative p-6 md:p-8 pb-32 md:pb-36 [[data-theme=lily]_&]:pb-8 flex flex-col gap-4" aria-labelledby="today-h">
        <HeroArt />
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="accent">Today</Badge>
        {doneSession && <Badge tone={doneSession.status === "completed" ? "done" : "partial"}>{doneSession.status === "completed" ? "Completed" : "Partially completed"}</Badge>}
        {day.plannedSource === "moved" && <Badge>Moved here</Badge>}
      </div>
      <div>
        <p className="eyebrow">Today's session</p>
        <h2 id="today-h" className="text-4xl md:text-5xl mt-2">
          {planned.name}
        </h2>
        <p className="text-muted mt-1">
          {planned.kind === "strength" ? `${exs.length} exercises · about ${estimateMinutes(data, planned.id)} min` : planned.kind === "cardio" ? `Light day · about ${estimateMinutes(data, planned.id)} min` : "Optional — anything you enjoy"}
        </p>
      </div>
      {exs.length > 0 && (
        <ol className="relative grid gap-y-2 text-[15px] max-w-md rounded-ctl bg-surface/75 backdrop-blur-sm p-3 -mx-1 [[data-theme=summit]_&]:bg-transparent [[data-theme=summit]_&]:backdrop-blur-none [[data-theme=summit]_&]:p-0 [[data-theme=summit]_&]:mx-0">
          {exs.map((e, i) => (
            <li key={e.id} className="flex items-baseline gap-2 min-w-0">
              <span className="num text-muted w-5 text-right shrink-0">{i + 1}</span>
              <ExerciseName exerciseId={e.exerciseId} name={exName(e.exerciseId)} className="flex-1 font-medium" />
              <span className="text-muted text-sm whitespace-nowrap ml-auto pl-2">{formatTarget(e)}</span>
            </li>
          ))}
        </ol>
      )}
      <div className="relative flex flex-wrap gap-2 pt-1">
        {planned.kind === "activity" ? (
          <Button size="xl" icon="walk" onClick={onLog} className="w-full sm:w-auto">
            Log activity
          </Button>
        ) : (
          <>
            <Button size="xl" icon="play" onClick={onStart} className="anim-pulse w-full sm:w-auto">
              {doneSession ? "Train again" : "Start workout"}
            </Button>
            {planned.kind === "cardio" && (
              <Button size="xl" variant="secondary" icon="walk" onClick={onLog}>
                Quick log
              </Button>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function WeekStrip({ days, today }: { days: CalendarDay[]; today: string }) {
  return (
    <ol className="grid grid-cols-7 gap-1.5" aria-label="This week">
      {days.map((d) => {
        const label = d.planned ? d.planned.name : d.skippedDay ? "Skipped" : "No workout";
        return (
          <li key={d.date} className={cx("flex flex-col items-center gap-1.5 rounded-btn py-2.5", d.isToday && "bg-accent-soft ring-2 ring-accent")}>
            <span className={cx("text-xs font-semibold", d.isToday ? "text-accent-text" : "text-muted")}>{WEEKDAY_SHORT[weekdayOf(d.date)]}</span>
            <span className="num text-sm font-semibold">{Number(d.date.slice(8))}</span>
            <StatusDot status={d.status} size={18} />
            <span className="sr-only">
              {d.date === today ? "Today, " : ""}
              {label}: {d.status.replace("_", " ")}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function DateChip({ date }: { date: string }) {
  return (
    <span className="w-12 shrink-0 rounded-ctl bg-accent-soft text-accent-text text-center py-1.5 leading-tight">
      <span className="block text-[10px] font-extrabold uppercase tracking-wider">{WEEKDAY_SHORT[weekdayOf(date)]}</span>
      <span className="block num text-xl font-bold">{Number(date.slice(8))}</span>
    </span>
  );
}

/** "Good evening, Sam" with the name (or the time of day) set in the theme's accent style. */
function Greeting({ name }: { name: string }) {
  const g = greeting();
  if (name) return <>{g}, <em>{name}</em></>;
  const [first, ...rest] = g.split(" ");
  return <>{first} <em>{rest.join(" ")}</em></>;
}

function BuddiesRow() {
  const { available, buddies, setupMissing } = useBuddies();
  if (!available || setupMissing) return null;
  if (!buddies.length)
    return (
      <Link href="/buddies" className="tile p-4 flex items-center gap-3 hover:brightness-[1.02]">
        <span className="h-11 w-11 rounded-btn bg-accent-soft text-accent-text grid place-items-center shrink-0">
          <Icon name="users" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block font-bold">Train with a buddy</span>
          <span className="block text-sm text-muted">See each other's sets tick off live and send hearts.</span>
        </span>
        <Icon name="chevronRight" size={18} className="text-muted" />
      </Link>
    );
  return <BuddyStrip title="Your buddies" />;
}
