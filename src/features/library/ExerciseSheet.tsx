"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import type { Exercise } from "@/lib/domain/types";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { Badge, cx } from "@/components/ui/primitives";
import { ExerciseDemo } from "../animation/ExerciseDemo";
import { useExercises } from "../common";

// Tap any exercise name to see what the exercise is: the demonstration, a plain description,
// the muscles it works and the steps. One sheet for the whole app, opened from anywhere.

const Ctx = createContext<(exerciseId: string | null | undefined) => void>(() => {});

/** Opens the exercise sheet for an exercise id. */
export const useExerciseSheet = () => useContext(Ctx);

/** What the exercise is, in plain words — or the starting position for custom exercises. */
export function exerciseDescription(e: Exercise): string {
  return e.summary ?? e.startingPosition ?? "";
}

export function ExerciseSheetProvider({ children }: { children: ReactNode }) {
  const [id, setId] = useState<string | null>(null);
  const open = useCallback((exerciseId: string | null | undefined) => setId(exerciseId ?? null), []);
  return (
    <Ctx.Provider value={open}>
      {children}
      <ExerciseSheet exerciseId={id} onClose={() => setId(null)} />
    </Ctx.Provider>
  );
}

function ExerciseSheet({ exerciseId, onClose }: { exerciseId: string | null; onClose: () => void }) {
  const ex = useExercises();
  const e = ex.get(exerciseId);
  return (
    <Dialog open={!!e} onClose={onClose} title={e?.name ?? ""} size="lg">
      {e && (
        <div className="space-y-5">
          <div className="grid gap-5 md:grid-cols-2 md:items-center">
            <ExerciseDemo key={e.id} animation={e.animation} name={e.name} />
            <div className="space-y-4">
              {exerciseDescription(e) && (
                <section>
                  <p className="eyebrow mb-1.5">What it is</p>
                  <p className="text-[17px] leading-relaxed">{exerciseDescription(e)}</p>
                </section>
              )}
              <div className="flex flex-wrap gap-1.5">
                {e.primaryMuscles.map((m) => (
                  <Badge key={m} tone="accent">
                    {m}
                  </Badge>
                ))}
                {e.secondaryMuscles.map((m) => (
                  <Badge key={m}>{m}</Badge>
                ))}
                {e.equipment.map((q) => (
                  <Badge key={q} className="bg-transparent">
                    <Icon name="dumbbell" size={13} /> {q}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          {e.steps.length > 0 && (
            <section>
              <p className="eyebrow mb-2">How to do it</p>
              <ol className="space-y-2">
                {e.steps.map((s, i) => (
                  <li key={s} className="flex gap-3">
                    <span className="num h-7 w-7 shrink-0 rounded-pill bg-accent-soft text-accent-text grid place-items-center text-sm font-bold">{i + 1}</span>
                    <span className="pt-0.5">{s}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
          <Link href={`/library/${e.slug}`} onClick={onClose} className="inline-flex items-center gap-1.5 font-bold text-accent-text hover:underline">
            Full guide: breathing, common mistakes and safety <Icon name="chevronRight" size={16} />
          </Link>
        </div>
      )}
    </Dialog>
  );
}

/** An exercise's full name that opens its sheet when tapped. Wraps instead of cutting off. */
export function ExerciseName({ exerciseId, name, className }: { exerciseId: string | null | undefined; name: string; className?: string }) {
  const open = useExerciseSheet();
  if (!exerciseId) return <span className={className}>{name}</span>;
  return (
    <button
      type="button"
      onClick={(ev) => {
        ev.stopPropagation();
        open(exerciseId);
      }}
      className={cx(
        "text-left min-w-0 break-words underline decoration-dotted decoration-2 underline-offset-[5px] decoration-accent/50 hover:decoration-accent hover:text-accent-text",
        className,
      )}
      aria-label={`${name} — show how to do it`}
    >
      {name}
    </button>
  );
}
