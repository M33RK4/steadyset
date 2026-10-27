"use client";

import Link from "next/link";
import { buddyStatusLine, type BuddyLive } from "@/lib/buddies/live";
import { Icon } from "@/components/ui/Icon";
import { ProgressRing, cx } from "@/components/ui/primitives";
import { useNow } from "@/lib/timer/TimerWatcher";
import { HeartButton } from "./Hearts";
import { liveOf, useBuddies } from "./BuddiesProvider";

export function Avatar({ name, live, size = 48 }: { name: string; live?: boolean; size?: number }) {
  return (
    <span className="relative shrink-0" style={{ width: size, height: size }}>
      <span
        className="grid place-items-center w-full h-full rounded-btn bg-accent-soft text-accent-text font-display [[data-theme=summit]_&]:border-2 [[data-theme=summit]_&]:border-edge"
        style={{ fontSize: size * 0.46 }}
        aria-hidden="true"
      >
        {name.trim()[0]?.toUpperCase() ?? "?"}
      </span>
      {live && <span className="absolute -right-0.5 -bottom-0.5 h-3.5 w-3.5 rounded-pill bg-done ring-[3px] ring-surface anim-live" aria-hidden="true" />}
    </span>
  );
}

export function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-pill bg-done-soft text-done px-2.5 py-0.5 text-xs font-extrabold uppercase tracking-wider">
      <span className="h-2 w-2 rounded-pill bg-done anim-live" aria-hidden="true" /> Live
    </span>
  );
}

/** One row of a buddy's live checklist: name plus a pip for every set. */
function LiveExercise({ e }: { e: BuddyLive["exercises"][number] }) {
  const done = e.status === "completed";
  const skipped = e.status === "skipped";
  return (
    <li className={cx("flex items-center gap-3 py-2.5", e.status === "active" && "font-semibold")}>
      <span
        className={cx(
          "h-7 w-7 rounded-pill grid place-items-center shrink-0 border-2",
          done ? "bg-done border-done text-white anim-tick" : e.status === "active" ? "border-accent text-accent-text" : "border-line text-muted",
        )}
        aria-hidden="true"
      >
        {done ? <Icon name="check" size={16} strokeWidth={3} /> : skipped ? <Icon name="skip" size={12} /> : e.status === "active" ? <span className="h-2.5 w-2.5 rounded-pill bg-accent anim-live" /> : null}
      </span>
      <span className={cx("flex-1 min-w-0 truncate", skipped && "line-through text-muted")}>{e.name}</span>
      {!e.timed && (
        <span className="flex gap-1 shrink-0" aria-label={`${e.setsDone} of ${e.targetSets} sets`}>
          {Array.from({ length: e.targetSets }, (_, i) => (
            <span key={`${i}-${i < e.setsDone}`} className={cx("h-2.5 w-5 rounded-pill", i < e.setsDone ? "bg-accent anim-tick" : "bg-line")} />
          ))}
        </span>
      )}
      <span className="sr-only">{done ? "done" : skipped ? "skipped" : e.status === "active" ? "doing now" : "not started"}</span>
    </li>
  );
}

/** A buddy's card: who they are, what they're doing, their live checklist and a heart button. */
export function BuddyLiveCard({ name, live, onHeart, onRemove, compact }: { name: string; live: BuddyLive; onHeart: () => Promise<boolean>; onRemove?: () => void; compact?: boolean }) {
  const now = useNow(live.isLive, 30_000);
  const ratio = live.totalExercises ? live.doneExercises / live.totalExercises : 0;
  return (
    <article className={cx("card overflow-hidden", live.isLive && "ring-2 ring-done/60")}>
      <div className="p-5 flex items-center gap-4">
        <Avatar name={name} live={live.isLive} size={52} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-2xl truncate">{name}</h3>
            {live.isLive && <LiveBadge />}
          </div>
          <p className="text-sm text-muted truncate">{buddyStatusLine(live, now)}</p>
        </div>
        {live.session && live.totalExercises > 0 && (
          <ProgressRing value={ratio} size={58} stroke={6} trackClass="text-accent-soft" barClass={live.isLive ? "text-done" : "text-accent"} label={`${live.doneExercises} of ${live.totalExercises} exercises done`}>
            <span className="num text-sm font-bold">
              {live.doneExercises}/{live.totalExercises}
            </span>
          </ProgressRing>
        )}
      </div>

      {!compact && live.session && live.exercises.length > 0 && (
        <div className="px-5 pb-2">
          <ol className="divide-y divide-line border-t border-line" aria-label={`${name}'s exercises`}>
            {live.exercises.map((e) => (
              <LiveExercise key={e.id} e={e} />
            ))}
          </ol>
        </div>
      )}

      <div className="px-5 py-4 flex flex-wrap items-center justify-end gap-x-2 gap-y-3 border-t border-line bg-raised/60">
        <p className="text-sm text-muted basis-full sm:basis-0 sm:flex-1 min-w-0">{live.isLive ? `${live.setsDone} set${live.setsDone === 1 ? "" : "s"} ticked off so far — cheer them on!` : "Hearts show up on their screen right away."}</p>
        {onRemove && (
          <button type="button" onClick={onRemove} className="h-10 px-3 rounded-btn text-sm font-semibold text-muted hover:text-danger hover:bg-danger-soft">
            Remove
          </button>
        )}
        <HeartButton name={name} onSend={onHeart} />
      </div>
    </article>
  );
}

/** Small strip of buddies for the dashboard and the workout screen. */
export function BuddyStrip({ onlyLive, title }: { onlyLive?: boolean; title?: string }) {
  const { available, buddies, live, sendHeart, setupMissing } = useBuddies();
  if (!available || setupMissing) return null;
  const shown = onlyLive ? buddies.filter((b) => liveOf(live, b.id).isLive) : buddies;
  if (!shown.length) return null;
  return (
    <section aria-label={title ?? "Buddies"} className="space-y-2">
      {title && <p className="eyebrow">{title}</p>}
      <ul className="grid gap-2 sm:grid-cols-2">
        {shown.map((b) => {
          const l = liveOf(live, b.id);
          return (
            <li key={b.id} className="tile p-3 flex items-center gap-3">
              <Avatar name={b.name} live={l.isLive} size={40} />
              <Link href="/buddies" className="flex-1 min-w-0">
                <span className="block font-bold truncate">{b.name}</span>
                <span className="block text-sm text-muted truncate">
                  {l.isLive ? `${l.session!.title} · ${l.doneExercises}/${l.totalExercises} done` : buddyStatusLine(l)}
                </span>
              </Link>
              <HeartButton name={b.name} onSend={() => sendHeart(b.id)} size="sm" />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
