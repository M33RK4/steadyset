"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useApp } from "@/lib/store/AppStore";
import { buildDay, currentStreak, nextRestDay, upcomingWorkouts, weekSummary, type CalendarDay } from "@/lib/calendar/calendar";
import { estimateMinutes, exercisesOfDay, formatTarget } from "@/lib/plans/planOps";
import { inProgressSession, sessionProgress } from "@/lib/session/sessionOps";
import { formatDuration, formatLongDate, WEEKDAY_SHORT, weekdayOf } from "@/lib/util/dates";
import { Badge, Button, EmptyState, ProgressRing, cx } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import { greeting, useCalendarContext, useExercises, useToday } from "../common";
import { LogActivityDialog, useStartWorkout } from "../workout/useStartWorkout";
import { StatusDot } from "../calendar/StatusDot";

export function Dashboard() {
  const { data, prefs } = useApp();
  const today = useToday();
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
        <p className="text-muted font-medium">{formatLongDate(today)}</p>
        <h1 className="text-3xl md:text-4xl mt-1">
          {greeting()}
          {name ? `, ${name}` : ""}
        </h1>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1.45fr_1fr]">
        <TodayCard day={todayDay} running={running?.id ?? null} onStart={() => start(todayDay.planned, today)} onLog={() => setLogOpen(true)} exName={(id) => ex.get(id)?.name ?? "Exercise"} />

        <section className="card p-5 space-y-5" aria-labelledby="week-h">
          <div className="flex items-center justify-between">
            <h2 id="week-h" className="text-lg">
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
        <section className="card p-5" aria-labelledby="up-h">
          <h2 id="up-h" className="text-lg mb-3">
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

        <section className="card p-5" aria-labelledby="recent-h">
          <div className="flex items-center justify-between mb-3">
            <h2 id="recent-h" className="text-lg">
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
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState icon="dumbbell" title="No workouts yet">
              Finish your first session and it'll show up here.
            </EmptyState>
          )}
        </section>
      </div>

      <LogActivityDialog open={logOpen} onClose={() => setLogOpen(false)} date={today} day={todayDay.planned} kind={todayDay.planned?.kind === "cardio" ? "cardio" : "activity"} />
    </div>
  );
}

function TodayCard({ day, running, onStart, onLog, exName }: { day: CalendarDay; running: string | null; onStart: () => void; onLog: () => void; exName: (id: string) => string }) {
  const { data } = useApp();
  const planned = day.planned;
  const doneSession = day.sessions.find((s) => s.status === "completed") ?? day.sessions.find((s) => s.status === "partial");
  const exs = planned ? exercisesOfDay(data, planned.id) : [];

  if (running) {
    const s = data.sessions.find((x) => x.id === running)!;
    const p = sessionProgress(data, running);
    return (
      <section className="card hero-surface p-6 flex flex-col gap-4" aria-labelledby="today-h">
        <Badge tone="accent" className="self-start">
          In progress
        </Badge>
        <h2 id="today-h" className="text-2xl md:text-3xl">
          {s.title}
        </h2>
        <p className="text-muted">
          {p.completed} of {p.total} exercises done · {p.sets} sets logged
        </p>
        <Link
          href="/workout"
          className="self-start inline-flex items-center gap-2.5 h-16 px-6 rounded-ctl bg-accent text-accent-ink font-semibold text-lg hover:brightness-110"
        >
          <Icon name="play" size={24} /> Resume workout
        </Link>
      </section>
    );
  }

  if (!planned || planned.kind === "rest") {
    return (
      <section className="card hero-surface p-6 flex flex-col gap-3" aria-labelledby="today-h">
        <div className="h-12 w-12 rounded-pill bg-accent-soft text-accent-text grid place-items-center">
          <Icon name="bed" size={24} />
        </div>
        <h2 id="today-h" className="text-2xl md:text-3xl">
          {doneSession ? "Nice work today" : planned ? "Rest day" : "Nothing scheduled today"}
        </h2>
        <p className="text-muted max-w-md">
          {planned ? "Recovery is when your muscles adapt. A gentle walk or some stretching is plenty." : day.skippedDay ? "You moved or skipped today's workout." : "Enjoy the day, or start a workout anyway."}
        </p>
        <div className="flex flex-wrap gap-2 mt-2">
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
    <section className="card hero-surface p-6 flex flex-col gap-4" aria-labelledby="today-h">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="accent">Today</Badge>
        {doneSession && <Badge tone={doneSession.status === "completed" ? "done" : "partial"}>{doneSession.status === "completed" ? "Completed" : "Partially completed"}</Badge>}
        {day.plannedSource === "moved" && <Badge>Moved here</Badge>}
      </div>
      <div>
        <h2 id="today-h" className="text-3xl md:text-4xl">
          {planned.name}
        </h2>
        <p className="text-muted mt-1">
          {planned.kind === "strength" ? `${exs.length} exercises · about ${estimateMinutes(data, planned.id)} min` : planned.kind === "cardio" ? `Light day · about ${estimateMinutes(data, planned.id)} min` : "Optional — anything you enjoy"}
        </p>
      </div>
      {exs.length > 0 && (
        <ol className="grid gap-y-1.5 text-[15px] max-w-xl">
          {exs.map((e, i) => (
            <li key={e.id} className="flex items-baseline gap-2 min-w-0">
              <span className="num text-muted w-5 text-right shrink-0">{i + 1}</span>
              <span className="truncate font-medium">{exName(e.exerciseId)}</span>
              <span className="text-muted text-sm whitespace-nowrap ml-auto">{formatTarget(e)}</span>
            </li>
          ))}
        </ol>
      )}
      <div className="flex flex-wrap gap-2 pt-1">
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
          <li key={d.date} className={cx("flex flex-col items-center gap-1.5 rounded-ctl py-2", d.isToday && "ring-2 ring-accent bg-accent-soft/50")}>
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
    <span className="w-12 shrink-0 rounded-ctl bg-raised border border-line text-center py-1 leading-tight">
      <span className="block text-[11px] font-semibold text-muted">{WEEKDAY_SHORT[weekdayOf(date)]}</span>
      <span className="block num font-bold">{Number(date.slice(8))}</span>
    </span>
  );
}
