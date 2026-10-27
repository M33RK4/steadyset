import type { DayStatus } from "@/lib/calendar/calendar";

export const STATUS_LABEL: Record<DayStatus, string> = {
  completed: "Completed",
  partial: "Partially completed",
  in_progress: "In progress",
  planned: "Scheduled",
  missed: "Missed",
  unlogged: "Not logged",
  optional: "Optional",
  rest: "Rest day",
  skipped: "Skipped",
  none: "No workout",
};

/** The calendar's visual language, used everywhere a day's status is shown. */
export function StatusDot({ status, size = 16 }: { status: DayStatus; size?: number }) {
  const r = size / 2;
  const common = { width: size, height: size, viewBox: `0 0 ${size} ${size}`, "aria-hidden": true as const, className: "shrink-0" };
  const sw = Math.max(1.6, size / 9);
  switch (status) {
    case "completed":
      return (
        <svg {...common}>
          <circle cx={r} cy={r} r={r} fill="var(--done)" />
          <path d={`M${size * 0.28} ${size * 0.52} L${size * 0.44} ${size * 0.68} L${size * 0.74} ${size * 0.36}`} fill="none" stroke="#fff" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "partial":
      return (
        <svg {...common}>
          <circle cx={r} cy={r} r={r - sw / 2} fill="none" stroke="var(--partial)" strokeWidth={sw} />
          <path d={`M${r} ${sw / 2} A${r - sw / 2} ${r - sw / 2} 0 0 1 ${r} ${size - sw / 2} Z`} fill="var(--partial)" />
        </svg>
      );
    case "in_progress":
      return (
        <svg {...common}>
          <circle cx={r} cy={r} r={r - sw / 2} fill="none" stroke="var(--accent)" strokeWidth={sw} />
          <circle cx={r} cy={r} r={r * 0.4} fill="var(--accent)" />
        </svg>
      );
    case "planned":
      return (
        <svg {...common}>
          <circle cx={r} cy={r} r={r - sw / 2} fill="none" stroke="var(--accent)" strokeWidth={sw} />
        </svg>
      );
    case "missed":
      return (
        <svg {...common}>
          <circle cx={r} cy={r} r={r - sw / 2} fill="none" stroke="var(--danger)" strokeWidth={sw} />
          <path d={`M${size * 0.34} ${size * 0.34} L${size * 0.66} ${size * 0.66} M${size * 0.66} ${size * 0.34} L${size * 0.34} ${size * 0.66}`} stroke="var(--danger)" strokeWidth={sw} strokeLinecap="round" />
        </svg>
      );
    case "unlogged":
    case "optional":
      return (
        <svg {...common}>
          <circle cx={r} cy={r} r={r - sw / 2} fill="none" stroke="var(--muted)" strokeWidth={sw} strokeDasharray={`${sw * 1.3} ${sw * 1.3}`} opacity={0.7} />
        </svg>
      );
    case "skipped":
      return (
        <svg {...common}>
          <circle cx={r} cy={r} r={r - sw / 2} fill="none" stroke="var(--muted)" strokeWidth={sw} opacity={0.6} />
          <path d={`M${size * 0.3} ${size * 0.7} L${size * 0.7} ${size * 0.3}`} stroke="var(--muted)" strokeWidth={sw} strokeLinecap="round" />
        </svg>
      );
    case "rest":
      return (
        <svg {...common}>
          <rect x={size * 0.25} y={r - sw / 2} width={size * 0.5} height={sw} rx={sw / 2} fill="var(--muted)" opacity={0.7} />
        </svg>
      );
    default:
      return <svg {...common} />;
  }
}

export function StatusLegend({ showMissed }: { showMissed: boolean }) {
  const items: DayStatus[] = ["completed", "partial", "planned", ...(showMissed ? (["missed"] as DayStatus[]) : []), "unlogged", "rest", "skipped"];
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted" aria-label="Legend">
      {items.map((s) => (
        <li key={s} className="flex items-center gap-1.5">
          <StatusDot status={s} size={14} />
          {s === "unlogged" ? "Past, not logged / optional" : STATUS_LABEL[s]}
        </li>
      ))}
    </ul>
  );
}
