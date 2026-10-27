"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useApp } from "@/lib/store/AppStore";
import { THEMES } from "@/lib/themes";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Button, cx } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/Dialog";
import { TimerWatcher, useNow } from "@/lib/timer/TimerWatcher";
import { remainingMs } from "@/lib/timer/restTimer";
import { formatClock } from "@/lib/util/dates";
import { ReminderWatcher } from "./ReminderWatcher";

const NAV: { href: string; label: string; icon: IconName; mobile: boolean }[] = [
  { href: "/", label: "Dashboard", icon: "home", mobile: true },
  { href: "/workouts", label: "My Workouts", icon: "dumbbell", mobile: true },
  { href: "/calendar", label: "Calendar", icon: "calendar", mobile: true },
  { href: "/library", label: "Exercises", icon: "book", mobile: true },
  { href: "/progress", label: "Progress", icon: "chart", mobile: true },
  { href: "/settings", label: "Settings", icon: "settings", mobile: false },
];

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname() ?? "/";
  const { mode, configured, ready } = useApp();
  const bare = path.startsWith("/auth");
  if (bare) return <div className="min-h-dvh">{children}</div>;
  const inWorkout = path === "/workout";

  return (
    <div className="min-h-dvh md:pl-[248px]">
      <TimerWatcher />
      <ReminderWatcher />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[80] bg-surface px-3 py-2 rounded-ctl">
        Skip to content
      </a>

      {/* Desktop / tablet sidebar */}
      <aside className="hidden md:flex flex-col gap-1 fixed left-0 top-0 w-[248px] h-dvh overflow-y-auto border-r border-line bg-surface px-4 py-6 z-30">
        <Link href="/" className="flex items-center gap-2.5 px-2 mb-6">
          <Logo />
          <span className="brand text-xl">
            Steadyset
          </span>
        </Link>
        <nav aria-label="Main" className="flex flex-col gap-1">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={isActive(path, n.href) ? "page" : undefined}
              className={cx(
                "flex items-center gap-3 rounded-ctl px-3 h-11 font-medium transition-colors",
                isActive(path, n.href) ? "bg-accent-soft text-accent-text" : "text-muted hover:text-ink hover:bg-raised",
              )}
            >
              <Icon name={n.icon} size={20} />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto space-y-3">
          <ThemeQuickSwitch />
          <AccountBadge />
        </div>
      </aside>

      <div className="min-w-0 min-h-dvh flex flex-col">
        {/* Mobile top bar */}
        <div className="md:hidden sticky top-0 z-40 bg-bg/90 backdrop-blur border-b border-line">
          <div className="flex items-center justify-between h-14 px-4">
            <Link href="/" className="flex items-center gap-2">
              <Logo />
              <span className="brand text-lg">
                Steadyset
              </span>
            </Link>
            <div className="flex items-center gap-1">
              <SyncDot />
              <ThemeQuickSwitch compact />
              <Link
                href="/settings"
                aria-label="Settings"
                aria-current={isActive(path, "/settings") ? "page" : undefined}
                className={cx("h-11 w-11 grid place-items-center rounded-ctl", isActive(path, "/settings") ? "text-accent-text bg-accent-soft" : "hover:bg-raised")}
              >
                <Icon name="settings" />
              </Link>
            </div>
          </div>
        </div>

        {ready && mode === "guest" && !inWorkout && <GuestBanner configured={configured} />}
        {!inWorkout && <ResumeBanner />}
        <GuestImportDialog />

        <main id="main" className={cx("flex-1 w-full mx-auto px-4 md:px-8 pt-5 md:pt-8", inWorkout ? "max-w-3xl pb-10" : "max-w-6xl pb-28 md:pb-12")}>
          {ready ? <div key={path} className="anim-page">{children}</div> : <ShellSkeleton />}
        </main>
      </div>

      {/* Mobile bottom navigation */}
      {!inWorkout && (
        <nav aria-label="Main" className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-surface/95 backdrop-blur border-t border-line pb-[env(safe-area-inset-bottom)]">
          <ul className="grid grid-cols-5">
            {NAV.filter((n) => n.mobile).map((n) => (
              <li key={n.href}>
                <Link
                  href={n.href}
                  aria-current={isActive(path, n.href) ? "page" : undefined}
                  className={cx("flex flex-col items-center justify-center gap-0.5 h-16 text-[11px] font-semibold", isActive(path, n.href) ? "text-accent-text" : "text-muted")}
                >
                  <span className={cx("h-8 w-14 grid place-items-center rounded-pill transition-colors", isActive(path, n.href) && "bg-accent-soft")}>
                    <Icon name={n.icon} size={21} />
                  </span>
                  {n.label === "My Workouts" ? "Workouts" : n.label === "Dashboard" ? "Home" : n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}

function Logo() {
  return (
    <span className="h-8 w-8 rounded-[10px] bg-accent text-accent-ink grid place-items-center" aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
        <path d="M4 15h4M10 11v8M14 7v12M18 11v4" />
      </svg>
    </span>
  );
}

function ShellSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-10 w-60" />
      <div className="skeleton h-44 w-full" />
      <div className="grid md:grid-cols-3 gap-4">
        <div className="skeleton h-32" />
        <div className="skeleton h-32" />
        <div className="skeleton h-32" />
      </div>
    </div>
  );
}

export function ThemeQuickSwitch({ compact }: { compact?: boolean }) {
  const { prefs, setPrefs } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const current = THEMES.find((t) => t.id === prefs.theme)!;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Theme: ${current.name}. Change theme`}
        onClick={() => setOpen((o) => !o)}
        className={cx(
          "flex items-center gap-2.5 rounded-ctl hover:bg-raised",
          compact ? "h-11 w-11 justify-center" : "w-full h-11 px-3 border border-line",
        )}
      >
        <Icon name="palette" size={20} />
        {!compact && (
          <>
            <span className="font-medium">{current.name}</span>
            <Icon name="chevronUp" size={16} className="ml-auto text-muted" />
          </>
        )}
      </button>
      {open && (
        <div
          role="menu"
          className={cx("absolute z-50 card p-1.5 w-60 anim-pop", compact ? "right-0 top-12" : "left-0 bottom-12")}
        >
          {THEMES.map((t) => (
            <button
              key={t.id}
              role="menuitemradio"
              aria-checked={prefs.theme === t.id}
              type="button"
              onClick={() => {
                setPrefs({ theme: t.id });
                setOpen(false);
              }}
              className={cx("w-full flex items-center gap-3 rounded-ctl px-2.5 py-2 text-left hover:bg-raised", prefs.theme === t.id && "bg-raised")}
            >
              <Swatch colors={t.swatch} />
              <span className="flex-1">
                <span className="block font-semibold text-sm">{t.name}</span>
                <span className="block text-xs text-muted">{t.description}</span>
              </span>
              {prefs.theme === t.id && <Icon name="check" size={18} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Swatch({ colors, size = 28 }: { colors: [string, string, string]; size?: number }) {
  return (
    <span className="relative inline-block rounded-pill overflow-hidden border border-line shrink-0" style={{ width: size, height: size, background: colors[0] }} aria-hidden="true">
      <span className="absolute right-0 bottom-0 w-1/2 h-1/2" style={{ background: colors[1] }} />
      <span className="absolute left-0 bottom-0 w-1/2 h-1/2" style={{ background: colors[2], opacity: 0.85 }} />
    </span>
  );
}

function SyncDot() {
  const { mode, sync } = useApp();
  if (mode !== "user") return null;
  const offline = !sync.online;
  const label = offline ? "Offline — changes saved on this device" : sync.pending ? `Syncing ${sync.pending} change(s)` : "All changes synced";
  return (
    <span className="h-11 w-9 grid place-items-center text-muted" title={label} aria-label={label} role="status">
      <Icon name={offline ? "cloudOff" : "cloud"} size={20} className={cx(sync.pending > 0 && !offline && "animate-pulse")} />
    </span>
  );
}

function AccountBadge() {
  const { mode, user, sync } = useApp();
  if (mode === "guest")
    return (
      <Link href="/auth/login" className="flex items-center gap-2 rounded-ctl px-3 h-11 bg-raised hover:brightness-95 text-sm font-semibold">
        <Icon name="user" size={18} /> Sign in to sync
      </Link>
    );
  const offline = !sync.online;
  return (
    <Link href="/settings#account" className="flex items-center gap-2.5 rounded-ctl px-3 py-2 hover:bg-raised">
      <span className="h-8 w-8 rounded-pill bg-accent-soft text-accent-text grid place-items-center font-bold text-sm">{user?.email?.[0]?.toUpperCase() ?? "?"}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold truncate">{user?.email}</span>
        <span className="flex items-center gap-1 text-xs text-muted">
          <Icon name={offline ? "cloudOff" : "cloud"} size={13} />
          {offline ? "Offline" : sync.pending ? "Syncing…" : "Synced"}
        </span>
      </span>
    </Link>
  );
}

function GuestBanner({ configured }: { configured: boolean }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <div className="mx-4 md:mx-8 mt-4 rounded-ctl border border-line bg-raised px-4 py-3 flex items-start gap-3 text-sm">
      <Icon name="info" size={18} className="mt-0.5 shrink-0 text-muted" />
      <p className="flex-1">
        {configured ? (
          <>
            You're using Steadyset as a guest — everything is saved in this browser only.{" "}
            <Link href="/auth/signup" className="font-semibold underline underline-offset-2">
              Create a free account
            </Link>{" "}
            to back up your workouts and sync them to your other devices.
          </>
        ) : (
          <>Accounts aren't configured on this deployment, so your data is saved in this browser only. See the README to connect Supabase.</>
        )}
      </p>
      <button type="button" onClick={() => setHidden(true)} aria-label="Dismiss" className="h-8 w-8 -m-1 grid place-items-center rounded-ctl hover:bg-line shrink-0">
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}

function ResumeBanner() {
  const { active, data } = useApp();
  const session = active ? data.sessions.find((s) => s.id === active.sessionId && s.status === "in_progress") : undefined;
  const running = !!active && active.timer.status === "running";
  const now = useNow(running, 500);
  if (!active || !session) return null;
  const rem = remainingMs(active.timer, now);
  return (
    <div className="mx-4 md:mx-8 mt-4">
      <Link href="/workout" className="flex items-center gap-3 rounded-card bg-accent text-accent-ink px-4 py-3 shadow-lg hover:brightness-105">
        <Icon name={running ? "timer" : "play"} size={20} />
        <span className="flex-1 min-w-0">
          <span className="block font-semibold truncate">{session.title} in progress</span>
          <span className="block text-sm opacity-85">{running ? `Resting · ${formatClock(rem / 1000)} left` : active.timer.status === "done" ? "Rest finished — time for your next set!" : "Tap to continue your workout"}</span>
        </span>
        <span className="font-semibold text-sm">Resume</span>
        <Icon name="chevronRight" size={18} />
      </Link>
    </div>
  );
}

function GuestImportDialog() {
  const { pendingGuestImport, importGuestData, dismissGuestImport } = useApp();
  return (
    <Dialog
      open={pendingGuestImport}
      onClose={dismissGuestImport}
      title="Bring your guest data into this account?"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={dismissGuestImport}>
            Not now
          </Button>
          <Button onClick={importGuestData} icon="download">
            Import guest data
          </Button>
        </>
      }
    >
      <p className="text-muted">
        This browser has workouts, plans or settings you created before signing in. Importing copies them into your account so they sync everywhere. Nothing in your account is overwritten, and if you choose
        “Not now” the guest data stays on this device.
      </p>
    </Dialog>
  );
}
