"use client";

import { forwardRef, useId, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger" | "soft";
type Size = "sm" | "md" | "lg" | "xl";

const variants: Record<Variant, string> = {
  primary: "btn bg-accent text-accent-ink hover:brightness-110",
  secondary: "btn bg-surface text-ink hover:bg-raised [--btn-shadow:none] [border:1.5px_solid_var(--line)] [[data-theme=summit]_&]:[border:2px_solid_var(--edge)] [[data-theme=summit]_&]:[--btn-shadow:3px_3px_0_var(--edge)]",
  soft: "bg-accent-soft text-accent-text hover:brightness-[1.03] active:brightness-95",
  ghost: "text-ink hover:bg-raised active:bg-line",
  danger: "btn bg-danger text-white hover:brightness-110 [--btn-shadow:none]",
};
const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm gap-1.5",
  md: "h-11 px-4 text-[15px] gap-2",
  lg: "h-13 px-5 text-base gap-2",
  xl: "h-16 px-6 text-lg gap-2.5",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", icon, iconRight, loading, block, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        "inline-flex items-center justify-center rounded-btn font-bold whitespace-nowrap select-none transition-[filter,background-color,transform,box-shadow] duration-150 disabled:opacity-50 disabled:pointer-events-none",
        variants[variant],
        sizes[size],
        block && "w-full",
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner /> : icon ? <Icon name={icon} size={size === "sm" ? 16 : size === "xl" ? 24 : 20} /> : null}
      {children}
      {iconRight && !loading ? <Icon name={iconRight} size={size === "sm" ? 16 : 20} /> : null}
    </button>
  );
});

export function IconButton({
  icon,
  label,
  size = 44,
  variant = "ghost",
  className,
  ...rest
}: { icon: IconName; label: string; size?: number; variant?: Variant } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex items-center justify-center rounded-btn shrink-0 transition-[filter,background-color] duration-150 disabled:opacity-40 disabled:pointer-events-none",
        variants[variant],
        variant !== "ghost" && variant !== "soft" && "[--btn-shadow:none]",
        className,
      )}
      style={{ width: size, height: size }}
      {...rest}
    >
      <Icon name={icon} size={Math.round(size * 0.48)} />
    </button>
  );
}

export function Spinner({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="animate-spin" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function ProgressRing({
  value,
  size = 64,
  stroke = 6,
  children,
  label,
  trackClass = "text-line",
  barClass = "text-accent",
}: {
  value: number;
  size?: number;
  stroke?: number;
  children?: ReactNode;
  label?: string;
  trackClass?: string;
  barClass?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="relative inline-grid place-items-center shrink-0" style={{ width: size, height: size }} role={label ? "img" : undefined} aria-label={label}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className={trackClass} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          className={barClass}
          style={{ transition: "stroke-dashoffset 0.35s linear" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}

export function ProgressBar({ value, className, label }: { value: number; className?: string; label?: string }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div
      className={cx("h-2.5 rounded-pill bg-accent-soft overflow-hidden", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      aria-label={label}
    >
      <div className="h-full bg-accent rounded-pill transition-[width] duration-300" style={{ width: `${v * 100}%` }} />
    </div>
  );
}

export function Field({ label, hint, error, children, id }: { label: string; hint?: string; error?: string | null; children: (id: string) => ReactNode; id?: string }) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className="space-y-1.5">
      <label htmlFor={fid} className="block text-sm font-semibold">
        {label}
      </label>
      {children(fid)}
      {error ? (
        <p className="text-sm text-danger flex items-center gap-1.5" role="alert">
          <Icon name="alert" size={16} /> {error}
        </p>
      ) : hint ? (
        <p className="text-sm text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <label htmlFor={id} className="font-medium block">
          {label}
        </label>
        {description && <p className="text-sm text-muted">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          "relative h-7 w-12 shrink-0 rounded-pill transition-colors duration-150 disabled:opacity-50",
          checked ? "bg-accent" : "bg-line [[data-theme=summit]_&]:bg-raised [[data-theme=summit]_&]:ring-2 [[data-theme=summit]_&]:ring-edge",
        )}
      >
        <span
          className={cx("absolute top-1 left-1 h-5 w-5 rounded-pill shadow transition-transform duration-150", checked ? "translate-x-5 bg-accent-ink" : "bg-surface")}
        />
      </button>
    </div>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
  size = "md",
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap p-1 rounded-btn bg-raised border border-line gap-1 [[data-theme=summit]_&]:border-2 [[data-theme=summit]_&]:border-edge">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            "rounded-[max(calc(var(--r-btn)-4px),4px)] font-bold transition-colors duration-150",
            size === "sm" ? "px-2.5 h-8 text-sm" : "px-3.5 h-9 text-[15px]",
            o.value === value ? "bg-accent text-accent-ink" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-10 gap-3">
      <div className="h-16 w-16 rounded-btn bg-accent-soft text-accent-text grid place-items-center rotate-[-4deg]">
        <Icon name={icon} size={28} />
      </div>
      <h3 className="text-xl">{title}</h3>
      {children && <div className="text-muted max-w-sm">{children}</div>}
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton", className)} aria-hidden="true" />;
}

export function Badge({ tone = "neutral", children, className }: { tone?: "neutral" | "accent" | "done" | "partial" | "danger"; children: ReactNode; className?: string }) {
  const tones = {
    neutral: "bg-raised text-muted border border-line",
    accent: "bg-accent-soft text-accent-text",
    done: "bg-done-soft text-done",
    partial: "bg-partial-soft text-partial",
    danger: "bg-danger-soft text-danger",
  };
  return <span className={cx("inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 text-xs font-semibold", tones[tone], className)}>{children}</span>;
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: string }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3 mb-7">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="text-4xl md:text-5xl">{title}</h1>
        {subtitle && <p className="text-muted mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function NumberStepper({
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  label,
  suffix,
  allowEmpty,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  suffix?: string;
  allowEmpty?: boolean;
}) {
  const id = useId();
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n / step) * step));
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-semibold text-muted block">
        {label}
      </label>
      <div className="flex items-stretch rounded-ctl border-[1.5px] border-line bg-surface overflow-hidden h-12 [[data-theme=summit]_&]:border-2 [[data-theme=summit]_&]:border-edge">
        <button type="button" aria-label={`Decrease ${label}`} className="w-12 grid place-items-center hover:bg-raised" onClick={() => onChange(clamp((value ?? min + step) - step))}>
          <Icon name="minus" size={18} />
        </button>
        <div className="flex-1 flex items-center justify-center min-w-0">
          <input
            id={id}
            inputMode="decimal"
            className="w-full min-w-0 bg-transparent text-center text-lg font-semibold num outline-none"
            value={value ?? ""}
            placeholder={allowEmpty ? "—" : undefined}
            onChange={(e) => {
              const raw = e.target.value.replace(",", ".");
              if (raw === "" && allowEmpty) return onChange(null);
              const n = Number(raw);
              if (!Number.isNaN(n)) onChange(Math.min(max, Math.max(min, n)));
            }}
          />
          {suffix && <span className="pr-2 text-muted text-sm">{suffix}</span>}
        </div>
        <button type="button" aria-label={`Increase ${label}`} className="w-12 grid place-items-center hover:bg-raised" onClick={() => onChange(clamp((value ?? min - step) + step))}>
          <Icon name="plus" size={18} />
        </button>
      </div>
    </div>
  );
}
