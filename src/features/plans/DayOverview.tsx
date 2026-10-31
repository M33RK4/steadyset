"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { PlanDraft } from "@/lib/plans/planOps";
import { DAY_KIND_LABEL } from "../common";
import { Icon } from "@/components/ui/Icon";
import { IconButton, cx } from "@/components/ui/primitives";

type DraftDay = PlanDraft["days"][number];
export interface Slot {
  slot: number;
  label: string;
  day: DraftDay | null;
}

/**
 * The whole week (or cycle) at a glance: each day's workout in one line, moved with the arrows
 * or by dragging its handle onto another day, and copied onto another day from its menu.
 * Tapping a row scrolls to that day's full editor below.
 */
export function DayOverview({
  slots,
  copyTargets,
  onMove,
  onCopy,
  onJump,
}: {
  slots: Slot[];
  /** where a day can be copied to: weekly plans list the other weekdays, cycles add a day at the end */
  copyTargets: (from: Slot) => { slot: number; label: string }[];
  onMove: (dayId: string, toSlot: number) => void;
  onCopy: (dayId: string, toSlot: number) => void;
  onJump: (dayId: string) => void;
}) {
  const rows = useRef<(HTMLLIElement | null)[]>([]);
  const [drag, setDrag] = useState<{ id: string; from: number; y0: number; dy: number; over: number } | null>(null);

  const startDrag = (e: ReactPointerEvent, i: number, id: string) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ id, from: i, y0: e.clientY, dy: 0, over: i });
  };
  const moveDrag = (e: ReactPointerEvent) => {
    if (!drag) return;
    // the row whose middle is nearest the pointer is where it will land
    let over = drag.from;
    let best = Infinity;
    rows.current.forEach((r, i) => {
      if (!r) return;
      const b = r.getBoundingClientRect();
      const d = Math.abs(e.clientY - (b.top + b.height / 2));
      if (d < best) {
        best = d;
        over = i;
      }
    });
    setDrag({ ...drag, dy: e.clientY - drag.y0, over });
  };
  const endDrag = () => {
    if (drag && drag.over !== drag.from) onMove(drag.id, slots[drag.over].slot);
    setDrag(null);
  };

  return (
    <ol className="card divide-y divide-line overflow-hidden" aria-label="All days at a glance">
      {slots.map((s, i) => {
        const d = s.day;
        const dragging = drag?.id === d?.id;
        const target = drag && drag.over === i && drag.from !== i;
        const count = d?.exercises.length ?? 0;
        return (
          <li
            key={s.slot}
            ref={(el) => {
              rows.current[i] = el;
            }}
            className={cx("relative flex items-center gap-1 pl-3 pr-1.5 py-2 bg-surface transition-colors", target && "bg-accent-soft", dragging && "z-10 shadow-lg ring-2 ring-accent rounded-ctl")}
            style={dragging ? { transform: `translateY(${drag!.dy}px)` } : undefined}
          >
            <span className="w-9 shrink-0 text-sm font-semibold text-muted">{s.label}</span>
            {d ? (
              <button type="button" onClick={() => onJump(d.id)} className="flex-1 min-w-0 text-left py-1">
                <span className="block font-semibold leading-tight line-clamp-2 break-words">{d.name || "Untitled"}</span>
                <span className="block text-xs text-muted">
                  {DAY_KIND_LABEL[d.kind]}
                  {d.kind !== "rest" ? ` · ${count} exercise${count === 1 ? "" : "s"}` : ""}
                </span>
              </button>
            ) : (
              <span className="flex-1 text-sm text-muted py-2">Free day</span>
            )}
            {d && (
              <>
                <IconButton icon="arrowUp" label={`Move ${d.name} to ${slots[i - 1]?.label ?? ""}`} size={32} disabled={i === 0} onClick={() => onMove(d.id, slots[i - 1].slot)} />
                <IconButton icon="arrowDown" label={`Move ${d.name} to ${slots[i + 1]?.label ?? ""}`} size={32} disabled={i === slots.length - 1} onClick={() => onMove(d.id, slots[i + 1].slot)} />
                <CopyMenu name={d.name} targets={copyTargets(s)} onCopy={(to) => onCopy(d.id, to)} />
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label={`Drag ${d.name} to another day`}
                  title="Drag to another day"
                  className="h-9 w-7 shrink-0 grid place-items-center rounded-ctl text-muted cursor-grab active:cursor-grabbing touch-none select-none hover:bg-raised"
                  onPointerDown={(e) => startDrag(e, i, d.id)}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={() => setDrag(null)}
                >
                  <Icon name="grip" size={18} />
                </span>
              </>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function CopyMenu({ name, targets, onCopy }: { name: string; targets: { slot: number; label: string }[]; onCopy: (slot: number) => void }) {
  if (!targets.length) return null;
  return (
    <label className="relative h-8 w-8 shrink-0 grid place-items-center rounded-ctl text-muted hover:bg-raised cursor-pointer" title={`Copy ${name} to another day`}>
      <Icon name="copy" size={18} />
      <span className="sr-only">Copy {name} to</span>
      {/* a native select keeps this easy on phones; it sits invisibly over the icon */}
      <select
        className="absolute inset-0 opacity-0 cursor-pointer"
        value=""
        onChange={(e) => {
          if (e.target.value !== "") onCopy(Number(e.target.value));
        }}
      >
        <option value="">Copy to…</option>
        {targets.map((t) => (
          <option key={t.slot} value={t.slot}>
            {t.label}
          </option>
        ))}
      </select>
    </label>
  );
}
