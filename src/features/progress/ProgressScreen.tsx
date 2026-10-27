"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useApp } from "@/lib/store/AppStore";
import { consistencyLastDays, currentStreak } from "@/lib/calendar/calendar";
import { exerciseHistory, loggedExercises, monthlyBuckets, totals, weeklyBuckets } from "@/lib/stats/stats";
import { del, upsert } from "@/lib/domain/changes";
import type { BodyMeasurement } from "@/lib/domain/types";
import { formatDuration, formatShortDate } from "@/lib/util/dates";
import { uuid } from "@/lib/util/ids";
import { Button, EmptyState, IconButton, PageHeader, Segmented, cx } from "@/components/ui/primitives";
import { BarChart, LineChart } from "@/components/ui/charts";
import { useConfirm, useToast } from "@/components/ui/Dialog";
import { useCalendarContext, useToday } from "../common";

export function ProgressScreen() {
  const { data, prefs } = useApp();
  const today = useToday();
  const ctx = useCalendarContext();
  const [range, setRange] = useState<"weeks" | "months">("weeks");
  const t = useMemo(() => totals(data), [data]);
  const weekly = useMemo(() => weeklyBuckets(data, today, 8, prefs.weekStartsOn), [data, today, prefs.weekStartsOn]);
  const monthly = useMemo(() => monthlyBuckets(data, today, 6), [data, today]);
  const cons = useMemo(() => consistencyLastDays(ctx, 28), [ctx]);
  const streak = useMemo(() => currentStreak(ctx), [ctx]);
  const buckets = range === "weeks" ? weekly : monthly;

  return (
    <div className="space-y-6">
      <PageHeader title="Progress" subtitle="What you've done so far, in plain numbers." />
      {t.sessions === 0 ? (
        <div className="card">
          <EmptyState icon="chart" title="No workouts recorded yet" action={<Link href="/" className="font-semibold underline">Go to today's workout</Link>}>
            Your sessions, sets and training time will show up here after you finish your first workout. Nothing here is estimated.
          </EmptyState>
        </div>
      ) : (
        <>
          <dl className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Tile label="Sessions" value={t.sessions} hint={t.partial ? `${t.completed} complete · ${t.partial} partial` : "all complete"} />
            <Tile label="Sets completed" value={t.sets} />
            <Tile label="Time training" value={formatDuration(t.seconds)} />
            <Tile label="Consistency (4 weeks)" value={cons.percent === null ? "—" : `${cons.percent}%`} hint={cons.required ? `${cons.done} of ${cons.required} planned days · streak ${streak}` : "No planned days yet"} />
          </dl>

          <section className="card p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg">Workouts per {range === "weeks" ? "week" : "month"}</h2>
              <Segmented
                size="sm"
                label="Range"
                value={range}
                onChange={setRange}
                options={[
                  { value: "weeks", label: "8 weeks" },
                  { value: "months", label: "6 months" },
                ]}
              />
            </div>
            <BarChart data={buckets.map((b) => ({ label: b.label, value: b.sessions }))} label={`Workouts per ${range === "weeks" ? "week" : "month"}`} unit="workouts" />
          </section>

          <section className="card p-5 space-y-4">
            <h2 className="text-lg">Training time per {range === "weeks" ? "week" : "month"} (minutes)</h2>
            <BarChart data={buckets.map((b) => ({ label: b.label, value: b.minutes }))} label="Training minutes" unit="minutes" />
          </section>

          <ExerciseHistory />
        </>
      )}
      <Measurements />
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="card p-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="num text-3xl font-bold mt-1">{value}</dd>
      {hint && <dd className="text-xs text-muted mt-1">{hint}</dd>}
    </div>
  );
}

function ExerciseHistory() {
  const { data, prefs } = useApp();
  const logged = useMemo(() => loggedExercises(data), [data]);
  const [key, setKey] = useState<string>(() => (logged[0] ? logged[0].exerciseId ?? `name:${logged[0].name}` : ""));
  const sel = logged.find((l) => (l.exerciseId ?? `name:${l.name}`) === key) ?? logged[0];
  const hist = useMemo(() => (sel ? exerciseHistory(data, { exerciseId: sel.exerciseId, name: sel.name }, prefs.units) : []), [data, sel, prefs.units]);
  if (!sel) return null;
  const weighted = hist.filter((h) => h.topWeight !== null);
  return (
    <section className="card p-5 space-y-4" aria-labelledby="exh-h">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="exh-h" className="text-lg">
          Exercise history
        </h2>
        <label className="text-sm">
          <span className="sr-only">Exercise</span>
          <select className="field w-auto" value={sel.exerciseId ?? `name:${sel.name}`} onChange={(e) => setKey(e.target.value)}>
            {logged.map((l) => (
              <option key={l.exerciseId ?? l.name} value={l.exerciseId ?? `name:${l.name}`}>
                {l.name} ({l.count})
              </option>
            ))}
          </select>
        </label>
      </div>
      {weighted.length >= 2 ? (
        <LineChart points={weighted.map((h) => ({ label: formatShortDate(h.date), value: h.topWeight! }))} label={`Heaviest set of ${sel.name} per session (${prefs.units})`} unit={prefs.units} />
      ) : (
        <p className="text-sm text-muted">{weighted.length === 1 ? "Log this exercise with a weight one more time to see a trend line." : "No weights recorded for this exercise."}</p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted border-b border-line">
              <th className="py-2 pr-3 font-semibold">Date</th>
              <th className="py-2 pr-3 font-semibold">Sets</th>
              <th className="py-2 pr-3 font-semibold">Top weight</th>
              <th className="py-2 font-semibold">Total reps</th>
            </tr>
          </thead>
          <tbody>
            {[...hist].reverse().map((h) => (
              <tr key={h.sessionId} className="border-b border-line last:border-0">
                <td className="py-2 pr-3 whitespace-nowrap">{formatShortDate(h.date)}</td>
                <td className="py-2 pr-3 num">{h.sets.map((s) => (s.durationSeconds !== null ? `${s.durationSeconds}s` : s.weight !== null ? `${s.reps}×${s.weight}` : `${s.reps}`)).join(", ")}</td>
                <td className="py-2 pr-3 num">{h.topWeight !== null ? `${h.topWeight} ${prefs.units}` : "—"}</td>
                <td className="py-2 num">{h.totalReps || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const METRICS: { id: string; label: string; unit: string }[] = [
  { id: "body_weight", label: "Body weight", unit: "kg" },
  { id: "waist", label: "Waist", unit: "cm" },
  { id: "hips", label: "Hips", unit: "cm" },
  { id: "chest", label: "Chest", unit: "cm" },
  { id: "upper_arm", label: "Upper arm", unit: "cm" },
  { id: "thigh", label: "Thigh", unit: "cm" },
];

function metricUnit(id: string, units: "kg" | "lb") {
  const m = METRICS.find((x) => x.id === id);
  if (!m) return "";
  if (m.unit === "kg") return units;
  return units === "lb" ? "in" : "cm";
}

function Measurements() {
  const { data, prefs, setPrefs, commit } = useApp();
  const today = useToday();
  const toast = useToast();
  const confirm = useConfirm();
  const tracked = prefs.trackedMetrics;
  const [metric, setMetric] = useState(tracked[0] ?? "");
  const [value, setValue] = useState("");
  const [date, setDate] = useState(today);
  const current = tracked.includes(metric) ? metric : tracked[0] ?? "";
  const entries = data.measurements.filter((m) => m.metric === current).sort((a, b) => a.measuredOn.localeCompare(b.measuredOn));

  const toggle = (id: string) => setPrefs({ trackedMetrics: tracked.includes(id) ? tracked.filter((x) => x !== id) : [...tracked, id] });
  const add = () => {
    const v = Number(value.replace(",", "."));
    if (!current || !Number.isFinite(v) || v <= 0) return;
    const m: BodyMeasurement = { id: uuid(), metric: current, value: v, unit: metricUnit(current, prefs.units), measuredOn: date };
    commit([upsert("measurements", m)]);
    setValue("");
    toast("Measurement saved");
  };

  return (
    <section className="card p-5 space-y-4" aria-labelledby="meas-h">
      <div>
        <h2 id="meas-h" className="text-lg">
          Body measurements <span className="text-muted text-sm font-normal">(optional)</span>
        </h2>
        <p className="text-sm text-muted">Track only what you find useful. Changes are shown as they are — up or down is neither good nor bad.</p>
      </div>
      <fieldset>
        <legend className="text-sm font-semibold mb-2">What would you like to track?</legend>
        <div className="flex flex-wrap gap-2">
          {METRICS.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={tracked.includes(m.id)}
              onClick={() => toggle(m.id)}
              className={cx("h-9 px-3 rounded-pill border text-sm font-semibold", tracked.includes(m.id) ? "bg-accent-soft text-accent-text border-transparent" : "border-line hover:bg-raised")}
            >
              {m.label}
            </button>
          ))}
        </div>
      </fieldset>
      {tracked.length > 0 && (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm">
              <span className="block font-semibold mb-1">Measurement</span>
              <select className="field w-auto" value={current} onChange={(e) => setMetric(e.target.value)}>
                {tracked.map((id) => (
                  <option key={id} value={id}>
                    {METRICS.find((m) => m.id === id)?.label ?? id}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="block font-semibold mb-1">Value ({metricUnit(current, prefs.units)})</span>
              <input className="field w-28 num" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
            </label>
            <label className="text-sm">
              <span className="block font-semibold mb-1">Date</span>
              <input type="date" className="field w-auto" max={today} value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <Button onClick={add} disabled={!value}>
              Add entry
            </Button>
          </div>
          {entries.length >= 2 && <LineChart points={entries.map((e) => ({ label: formatShortDate(e.measuredOn), value: e.value }))} label={`${METRICS.find((m) => m.id === current)?.label} over time`} unit={entries[0].unit} />}
          {entries.length > 0 ? (
            <ul className="divide-y divide-line text-sm">
              {[...entries].reverse().map((e) => (
                <li key={e.id} className="py-2 flex items-center gap-3">
                  <span className="w-28 text-muted">{formatShortDate(e.measuredOn)}</span>
                  <span className="num font-semibold flex-1">
                    {e.value} {e.unit}
                  </span>
                  <IconButton
                    icon="trash"
                    label="Delete entry"
                    size={36}
                    onClick={async () => {
                      if (await confirm({ title: "Delete this entry?", confirmLabel: "Delete", danger: true })) commit([del("measurements", e.id)]);
                    }}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No entries yet.</p>
          )}
        </>
      )}
    </section>
  );
}
