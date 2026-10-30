"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/lib/store/AppStore";
import { addWorkoutOn, buildDay, moveDay, restoreDay, skipDay, type CalendarDay } from "@/lib/calendar/calendar";
import { activePlan, daysOfPlan, exercisesOfDay, formatTarget } from "@/lib/plans/planOps";
import { deleteSession, isTimed, sessionExercisesOf, setsOf, updateSessionNotes } from "@/lib/session/sessionOps";
import { addDays, addMonths, formatDuration, formatLongDate, formatMonthYear, monthGrid, orderedWeekdays, sameMonth, startOfWeek, WEEKDAY_SHORT, weekDates, weekdayOf } from "@/lib/util/dates";
import { Badge, Button, IconButton, PageHeader, Segmented, cx } from "@/components/ui/primitives";
import { Dialog, useConfirm, useToast } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { StatusDot, STATUS_LABEL, StatusLegend } from "./StatusDot";
import { useCalendarContext, useExercises, useToday, DAY_KIND_LABEL } from "../common";
import { LogActivityDialog, useStartWorkout } from "../workout/useStartWorkout";
import { LogWorkoutDialog } from "../workout/LogWorkoutDialog";

type View = "month" | "week" | "agenda";

export function CalendarScreen() {
  const { prefs, setPrefs } = useApp();
  const today = useToday();
  const ctx = useCalendarContext();
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState(today);
  const [selected, setSelected] = useState<string | null>(null);

  const move = (dir: number) => setCursor((c) => (view === "month" ? addMonths(c, dir) : view === "week" ? addDays(c, 7 * dir) : addDays(c, 14 * dir)));
  const title =
    view === "month"
      ? formatMonthYear(cursor)
      : view === "week"
        ? `Week of ${formatLongDate(startOfWeek(cursor, prefs.weekStartsOn))}`
        : `From ${formatLongDate(cursor)}`;

  return (
    <div className="space-y-5">
      <PageHeader title="Workout calendar" subtitle="Your schedule, completed sessions and rest days." />
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <IconButton icon="chevronLeft" label={`Previous ${view === "agenda" ? "two weeks" : view}`} onClick={() => move(-1)} variant="secondary" />
          <IconButton icon="chevronRight" label={`Next ${view === "agenda" ? "two weeks" : view}`} onClick={() => move(1)} variant="secondary" />
          <Button variant="secondary" onClick={() => setCursor(today)} disabled={view === "month" ? sameMonth(cursor, today) : cursor === today}>
            Today
          </Button>
        </div>
        <h2 className="text-xl flex-1 min-w-[180px]" aria-live="polite">
          {title}
        </h2>
        <Segmented
          label="Calendar view"
          value={view}
          onChange={setView}
          options={[
            { value: "month", label: "Month" },
            { value: "week", label: "Week" },
            { value: "agenda", label: "Agenda" },
          ]}
        />
      </div>

      {view === "month" && <MonthView cursor={cursor} onSelect={setSelected} />}
      {view === "week" && <WeekView cursor={cursor} onSelect={setSelected} />}
      {view === "agenda" && <AgendaView from={cursor} onSelect={setSelected} />}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <StatusLegend showMissed={prefs.showMissed} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={prefs.showMissed} onChange={(e) => setPrefs({ showMissed: e.target.checked })} />
          Mark missed workouts
        </label>
      </div>

      {selected && <DayPanel date={selected} onClose={() => setSelected(null)} key={selected} />}
      {!ctx.plan && <p className="text-sm text-muted">No active plan — only logged sessions are shown.</p>}
    </div>
  );
}

function MonthView({ cursor, onSelect }: { cursor: string; onSelect: (d: string) => void }) {
  const { prefs } = useApp();
  const ctx = useCalendarContext();
  const days = useMemo(() => monthGrid(cursor, prefs.weekStartsOn).map((d) => buildDay(ctx, d)), [ctx, cursor, prefs.weekStartsOn]);
  return (
    <div className="card p-2 sm:p-3">
      <div className="grid grid-cols-7 mb-1" aria-hidden="true">
        {orderedWeekdays(prefs.weekStartsOn).map((w) => (
          <div key={w} className="text-center text-xs font-semibold text-muted py-1">
            {WEEKDAY_SHORT[w]}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1" role="grid" aria-label={formatMonthYear(cursor)}>
        {days.map((d) => (
          <DayCell key={d.date} day={d} outside={!sameMonth(d.date, cursor)} onClick={() => onSelect(d.date)} />
        ))}
      </div>
    </div>
  );
}

function dayLabel(d: CalendarDay) {
  const what = d.sessions[0]?.title ?? d.planned?.name ?? (d.skippedDay ? `${d.skippedDay.name} (skipped)` : "No workout");
  return `${formatLongDate(d.date)}${d.isToday ? " (today)" : ""}: ${what}, ${STATUS_LABEL[d.status]}`;
}

function DayCell({ day, outside, onClick }: { day: CalendarDay; outside: boolean; onClick: () => void }) {
  const label = day.sessions[0]?.title ?? (day.planned && day.planned.kind !== "rest" ? day.planned.name : "");
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dayLabel(day)}
      aria-current={day.isToday ? "date" : undefined}
      className={cx(
        "relative min-h-[64px] sm:min-h-[92px] rounded-ctl p-1.5 sm:p-2 text-left flex flex-col gap-1 border transition-colors",
        day.isToday ? "border-accent border-2 bg-accent-soft/60" : "border-transparent hover:border-line hover:bg-raised",
        outside && "opacity-45",
      )}
    >
      <span className={cx("num text-sm font-semibold", day.isToday && "text-accent-text")}>{Number(day.date.slice(8))}</span>
      <span className="flex items-center gap-1 min-w-0">
        <StatusDot status={day.status} size={14} />
        <span className="hidden sm:block text-[11px] leading-tight font-medium truncate">{label}</span>
      </span>
    </button>
  );
}

function WeekView({ cursor, onSelect }: { cursor: string; onSelect: (d: string) => void }) {
  const { prefs, data } = useApp();
  const ctx = useCalendarContext();
  const days = useMemo(() => weekDates(cursor, prefs.weekStartsOn).map((d) => buildDay(ctx, d)), [ctx, cursor, prefs.weekStartsOn]);
  return (
    <div className="grid sm:grid-cols-7 gap-2">
      {days.map((d) => (
        <button
          key={d.date}
          type="button"
          onClick={() => onSelect(d.date)}
          aria-label={dayLabel(d)}
          aria-current={d.isToday ? "date" : undefined}
          className={cx("card p-3 text-left flex sm:flex-col gap-2 sm:min-h-[180px] hover:border-accent", d.isToday && "border-accent border-2")}
        >
          <div className="w-14 sm:w-auto shrink-0">
            <p className={cx("text-xs font-semibold", d.isToday ? "text-accent-text" : "text-muted")}>{WEEKDAY_SHORT[weekdayOf(d.date)]}</p>
            <p className="num text-2xl font-bold">{Number(d.date.slice(8))}</p>
          </div>
          <div className="flex-1 min-w-0 space-y-1.5">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
              <StatusDot status={d.status} size={14} /> {STATUS_LABEL[d.status]}
            </p>
            {d.planned && <p className="font-semibold text-sm leading-tight">{d.planned.name}</p>}
            {d.planned && d.planned.kind === "strength" && <p className="text-xs text-muted">{exercisesOfDay(data, d.planned.id).length} exercises</p>}
            {d.sessions.map((s) => (
              <p key={s.id} className="text-xs">
                {s.title} · {formatDuration(s.durationSeconds)}
              </p>
            ))}
          </div>
        </button>
      ))}
    </div>
  );
}

function AgendaView({ from, onSelect }: { from: string; onSelect: (d: string) => void }) {
  const ctx = useCalendarContext();
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => buildDay(ctx, addDays(from, i))), [ctx, from]);
  return (
    <ol className="card divide-y divide-line">
      {days.map((d) => (
        <li key={d.date}>
          <button type="button" onClick={() => onSelect(d.date)} className={cx("w-full text-left flex items-center gap-4 px-4 py-3 hover:bg-raised", d.isToday && "bg-accent-soft/60")} aria-current={d.isToday ? "date" : undefined}>
            <span className="w-28 shrink-0">
              <span className={cx("block text-sm font-semibold", d.isToday && "text-accent-text")}>{d.isToday ? "Today" : WEEKDAY_SHORT[weekdayOf(d.date)]}</span>
              <span className="block text-sm text-muted">{formatLongDate(d.date).split(", ").slice(1).join(", ")}</span>
            </span>
            <StatusDot status={d.status} size={18} />
            <span className="flex-1 min-w-0">
              <span className="block font-semibold truncate">{d.sessions[0]?.title ?? d.planned?.name ?? (d.skippedDay ? `${d.skippedDay.name} — skipped` : "No workout")}</span>
              <span className="block text-sm text-muted">{STATUS_LABEL[d.status]}{d.plannedSource === "moved" ? " · moved here" : ""}</span>
            </span>
            <Icon name="chevronRight" size={18} className="text-muted" />
          </button>
        </li>
      ))}
    </ol>
  );
}

function DayPanel({ date, onClose }: { date: string; onClose: () => void }) {
  const { data, commit } = useApp();
  const ctx = useCalendarContext();
  const today = useToday();
  const toast = useToast();
  const start = useStartWorkout();
  const ex = useExercises();
  const day = buildDay(ctx, date);
  const [moveTo, setMoveTo] = useState(addDays(date, 1));
  const [logOpen, setLogOpen] = useState(false);
  const [logWorkoutOpen, setLogWorkoutOpen] = useState(false);
  const plan = activePlan(data);
  const planDays = plan ? daysOfPlan(data, plan.id).filter((d) => d.kind !== "rest") : [];
  const planned = day.planned;
  const items = planned ? exercisesOfDay(data, planned.id) : [];
  const canReschedule = !!planned && planned.kind !== "rest" && date >= today && day.sessions.length === 0;
  const canSkip = !!planned && planned.kind !== "rest" && day.sessions.length === 0;

  return (
    <>
      <Dialog open onClose={onClose} title={formatLongDate(date)} description={<span className="flex items-center gap-1.5"><StatusDot status={day.status} size={14} /> {STATUS_LABEL[day.status]}{day.isToday ? " · today" : ""}</span>} size="lg">
        <div className="space-y-6">
          {/* Planned */}
          <section className="space-y-2">
            <h3 className="font-semibold text-muted text-sm">Planned</h3>
            {planned ? (
              <div className="rounded-card border border-line p-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-lg font-semibold flex-1">{planned.name}</p>
                  <Badge>{DAY_KIND_LABEL[planned.kind]}</Badge>
                  {day.plannedSource === "moved" && <Badge tone="accent">Moved from {formatLongDate(day.overrides.find((o) => o.kind === "add")?.movedFrom ?? date)}</Badge>}
                </div>
                {items.length > 0 && (
                  <ul className="text-sm divide-y divide-line">
                    {items.map((e) => (
                      <li key={e.id} className="py-1.5 flex justify-between gap-3">
                        <span>{ex.get(e.exerciseId)?.name}</span>
                        <span className="text-muted whitespace-nowrap">{formatTarget(e)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <p className="text-muted">{day.skippedDay ? `${day.skippedDay.name} was skipped or moved.` : "Nothing scheduled."}</p>
            )}
          </section>

          {/* Actual */}
          <section className="space-y-2">
            <h3 className="font-semibold text-muted text-sm">Logged</h3>
            {day.sessions.length === 0 ? (
              <p className="text-muted">{date > today ? "Not yet — this day is still ahead." : "No session logged."}</p>
            ) : (
              day.sessions.map((s) => <SessionDetail key={s.id} sessionId={s.id} />)
            )}
          </section>

          {/* Actions */}
          <section className="space-y-3 border-t border-line pt-4">
            <div className="flex flex-wrap gap-2">
              {date === today && planned && (planned.kind === "strength" || planned.kind === "cardio") && (
                <Button
                  icon="play"
                  onClick={() => {
                    onClose();
                    void start(planned, date);
                  }}
                >
                  Start workout
                </Button>
              )}
              {date <= today && (
                <>
                  <Button variant="secondary" icon="dumbbell" onClick={() => setLogWorkoutOpen(true)}>
                    Log workout
                  </Button>
                  <Button variant="secondary" icon="walk" onClick={() => setLogOpen(true)}>
                    Log activity
                  </Button>
                </>
              )}
              {canSkip && (
                <Button
                  variant="ghost"
                  icon="skip"
                  onClick={() => {
                    commit(skipDay(ctx, date));
                    toast(`${planned!.name} skipped`, { action: { label: "Undo", onClick: () => commit((d) => restoreDay({ ...ctx, data: d }, date)) } });
                  }}
                >
                  {date < today ? "I didn't do this — mark as skipped" : "Skip this day"}
                </Button>
              )}
              {day.overrides.length > 0 && (
                <Button variant="ghost" icon="restore" onClick={() => commit(restoreDay(ctx, date))}>
                  Restore normal schedule
                </Button>
              )}
            </div>
            {canReschedule && (
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-sm">
                  <span className="block font-semibold mb-1">Move this workout to</span>
                  <input type="date" className="field w-auto" min={today} value={moveTo} onChange={(e) => setMoveTo(e.target.value)} />
                </label>
                <Button
                  variant="secondary"
                  icon="move"
                  disabled={!moveTo || moveTo === date}
                  onClick={() => {
                    commit(moveDay(ctx, date, moveTo));
                    toast(`Moved to ${formatLongDate(moveTo)}`, { tone: "success" });
                    onClose();
                  }}
                >
                  Move
                </Button>
              </div>
            )}
            {(!planned || planned.kind === "rest") && date >= today && planDays.length > 0 && (
              <label className="text-sm block">
                <span className="block font-semibold mb-1">Schedule a workout on this day</span>
                <select
                  className="field w-auto"
                  value=""
                  onChange={(e) => {
                    if (!e.target.value) return;
                    commit(addWorkoutOn(ctx, date, e.target.value));
                    toast("Workout added to your calendar", { tone: "success" });
                  }}
                >
                  <option value="">Choose a workout…</option>
                  {planDays.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <p className="text-xs text-muted">Rescheduling only changes your plan for these dates. Logged workouts stay unless you delete them.</p>
          </section>
        </div>
      </Dialog>
      <LogWorkoutDialog open={logWorkoutOpen} onClose={() => setLogWorkoutOpen(false)} date={date} />
      <LogActivityDialog open={logOpen} onClose={() => setLogOpen(false)} date={date} day={planned && planned.kind !== "rest" ? planned : null} kind={planned?.kind === "cardio" ? "cardio" : "activity"} />
    </>
  );
}

function SessionDetail({ sessionId }: { sessionId: string }) {
  const { data, commit, active, setActive } = useApp();
  const confirm = useConfirm();
  const toast = useToast();
  const s = data.sessions.find((x) => x.id === sessionId)!;
  const list = sessionExercisesOf(data, s.id);
  const [notes, setNotes] = useState(s.notes);
  const [editing, setEditing] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const canEdit = s.status !== "in_progress" && list.length > 0;
  return (
    <div className="rounded-card border border-line p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold flex-1">{s.title}</p>
        <Badge tone={s.status === "completed" ? "done" : s.status === "partial" ? "partial" : "accent"}>{s.status === "in_progress" ? "In progress" : s.status === "completed" ? "Completed" : "Partial"}</Badge>
      </div>
      <p className="text-sm text-muted">
        {new Date(s.startedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })} · {formatDuration(s.durationSeconds)}
        {s.planName ? ` · ${s.planName}` : ""}
      </p>
      {list.length > 0 && (
        <ul className="text-sm divide-y divide-line">
          {list.map((e) => {
            const sets = setsOf(data, e.id);
            return (
              <li key={e.id} className="py-2">
                <div className="flex justify-between gap-2">
                  <span className="font-medium">{e.name}</span>
                  <span className="text-muted">{e.status === "skipped" ? "Skipped" : isTimed(e) ? (e.durationSeconds ? `${Math.round(e.durationSeconds / 60)} min` : "Not done") : `${sets.length}/${e.targetSets} sets`}</span>
                </div>
                {sets.length > 0 && (
                  <p className="text-muted num mt-0.5">
                    {sets.map((x) => `${x.durationSeconds !== null ? `${x.durationSeconds}s` : `${x.reps ?? "—"}`}${x.weight !== null ? ` × ${x.weight}${x.weightUnit}` : ""}`).join(" · ")}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {editing ? (
        <div className="space-y-2">
          <textarea className="field min-h-20" value={notes} onChange={(e) => setNotes(e.target.value)} aria-label="Workout notes" />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                commit(updateSessionNotes(data, s.id, notes));
                setEditing(false);
              }}
            >
              Save notes
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2">
          <p className={cx("text-sm flex-1", !s.notes && "text-muted")}>{s.notes || "No notes."}</p>
          <Button size="sm" variant="ghost" icon="note" onClick={() => setEditing(true)}>
            {s.notes ? "Edit notes" : "Add notes"}
          </Button>
          {canEdit && (
            <Button size="sm" variant="ghost" icon="edit" onClick={() => setEditOpen(true)}>
              Edit
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            icon="trash"
            className="text-danger"
            onClick={async () => {
              const ok = await confirm({
                title: `Delete “${s.title}”?`,
                body: "It's removed from your calendar, history and progress, along with every set recorded in it. This can't be undone.",
                confirmLabel: "Delete workout",
                danger: true,
              });
              if (!ok) return;
              commit((d) => deleteSession(d, s.id));
              if (active?.sessionId === s.id) setActive(null);
              toast("Workout deleted");
            }}
          >
            Delete
          </Button>
        </div>
      )}
      {canEdit && <LogWorkoutDialog open={editOpen} onClose={() => setEditOpen(false)} date={s.localDate} sessionId={s.id} />}
    </div>
  );
}
