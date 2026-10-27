"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/primitives";
import { MUSCLE_FILTERS, muscleGroupOf } from "@/lib/data/exercises";
import type { Exercise } from "@/lib/domain/types";
import { useExercises } from "../common";
import { ExerciseDemo } from "../animation/ExerciseDemo";

export function filterExercises(all: Exercise[], query: string, group: string | null) {
  const q = query.trim().toLowerCase();
  return all.filter((e) => {
    if (group && !muscleGroupOf(e).includes(group)) return false;
    if (!q) return true;
    return [e.name, ...e.primaryMuscles, ...e.secondaryMuscles, ...e.equipment].join(" ").toLowerCase().includes(q);
  });
}

export function SearchAndFilter({ query, setQuery, group, setGroup }: { query: string; setQuery: (q: string) => void; group: string | null; setGroup: (g: string | null) => void }) {
  return (
    <div className="space-y-3">
      <label className="relative block">
        <span className="sr-only">Search exercises</span>
        <Icon name="search" size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input className="field pl-10" type="search" placeholder="Search by name, muscle or equipment" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" role="group" aria-label="Filter by muscle group">
        {[null, ...MUSCLE_FILTERS].map((g) => (
          <button
            key={g ?? "all"}
            type="button"
            aria-pressed={group === g}
            onClick={() => setGroup(g)}
            className={cx("h-9 px-3 rounded-pill text-sm font-semibold whitespace-nowrap border", group === g ? "bg-accent text-accent-ink border-accent" : "border-line hover:bg-raised")}
          >
            {g ?? "All"}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ExercisePicker({ open, onClose, onPick, title = "Add exercise" }: { open: boolean; onClose: () => void; onPick: (exerciseId: string) => void; title?: string }) {
  const { all } = useExercises();
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<string | null>(null);
  const list = useMemo(() => filterExercises(all, query, group), [all, query, group]);
  useEffect(() => {
    if (open) {
      setQuery("");
      setGroup(null);
    }
  }, [open]);
  return (
    <Dialog open={open} onClose={onClose} title={title} size="lg">
      <div className="space-y-4">
        <SearchAndFilter query={query} setQuery={setQuery} group={group} setGroup={setGroup} />
        {list.length === 0 ? (
          <p className="text-muted text-center py-8">No exercises match. Try another search or filter.</p>
        ) : (
          <ul className="grid sm:grid-cols-2 gap-2">
            {list.map((e) => (
              <li key={e.id}>
                <button type="button" onClick={() => onPick(e.id)} className="w-full text-left flex items-center gap-3 rounded-ctl border border-line p-2 hover:border-accent hover:bg-raised">
                  <div className="w-16 shrink-0">
                    <ExerciseDemo animation={e.animation} name={e.name} compact />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">{e.name}</p>
                    <p className="text-sm text-muted truncate">{e.primaryMuscles.join(", ")}</p>
                  </div>
                  <Icon name="plus" size={18} className="text-accent-text" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
