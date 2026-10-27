"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useApp } from "@/lib/store/AppStore";
import { THEMES, resolveMode } from "@/lib/themes";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Button, cx } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/Dialog";
import { Backdrop, BrandMark } from "@/components/ui/ThemeArt";
import { TimerWatcher, useNow } from "@/lib/timer/TimerWatcher";
import { remainingMs } from "@/lib/timer/restTimer";
import { formatClock } from "@/lib/util/dates";
import { liveOf, useBuddies } from "@/features/buddies/BuddiesProvider";
import { ReminderWatcher } from "./ReminderWatcher";
import { useServiceWorker } from "@/lib/pwa/install";

const NAV: { href: string; label: string; short: string; icon: IconName; dock: boolean }[] = [
  { href: "/", label: "Today", short: "Today", icon: "home", dock: true },
  { href: "/workouts", label: "My Workouts", short: "Plans", icon: "dumbbell", dock: true },
  { href: "/calendar", label: "Calendar", short: "Calendar", icon: "calendar", dock: true },
  { href: "/library", label: "Exercises", short: "Exercises", icon: "book", dock: false },
  { href: "/progress", label: "Progress", short: "Progress", icon: "chart", dock: true },
  { href: "/buddies", label: "Buddies", short: "Buddies", icon: "users", dock: true },
];

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname() ?? "/";
  const { mode, configured, ready } = useApp();
  useServiceWorker();
  const bare = path.startsWith("/auth");
  if (bare)
    return (
      <div className="min-h-dvh">
        <Backdrop />
        {children}
      </div>
    );
  const inWorkout = path === "/workout";

  return (
    <div className="min-h-dvh flex flex-col">
      <TimerWatcher />
      <ReminderWatcher />
      <Backdrop />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[80] bg-surface px-3 py-2 rounded-ctl">
        Skip to content
      </a>

      {/* Top bar: full navigation on desktop, brand + quick actions on phones */}
      <header className="sticky top-0 z-40 px-3 md:px-6 pt-3">
        <div className="dock mx-auto max-w-6xl rounded-card flex items-center gap-2 h-16 pl-3 pr-2 md:pl-4">
          <Link href="/" className="flex items-center gap-2.5 shrink-0 mr-auto lg:mr-4">
            <BrandMark />
            <span className="brand text-2xl leading-none">Steadyset</span>
          </Link>
          <nav aria-label="Main" className="hidden lg:flex items-center gap-1 mr-auto">
            {NAV.map((n) => (
              <NavLink key={n.href} href={n.href} active={isActive(path, n.href)} icon={n.icon} label={n.label} />
            ))}
          </nav>
          <SyncDot />
          <ModeToggle />
          <ThemeQuickSwitch />
          <Link
            href="/library"
            aria-label="Exercises"
            aria-current={isActive(path, "/library") ? "page" : undefined}
            className={cx("lg:hidden h-11 w-11 grid place-items-center rounded-btn", isActive(path, "/library") ? "bg-accent-soft text-accent-text" : "hover:bg-raised")}
          >
            <Icon name="book" />
          </Link>
          <AccountButton active={isActive(path, "/settings")} />
        </div>
      </header>

      {ready && mode === "guest" && !inWorkout && <GuestBanner configured={configured} />}
      {!inWorkout && <ResumeBanner />}
      <GuestImportDialog />

      <main id="main" className={cx("flex-1 w-full mx-auto px-4 md:px-8 pt-6 md:pt-10", inWorkout ? "max-w-3xl pb-12" : "max-w-6xl pb-32 lg:pb-16")}>
        {ready ? (
          <div key={path} className="anim-page">
            {children}
          </div>
        ) : (
          <ShellSkeleton />
        )}
      </main>

      {/* Phones & tablets: a floating dock; the current page's pill grows to show its name */}
      {!inWorkout && (
        <nav aria-label="Main" className="lg:hidden fixed bottom-0 inset-x-0 z-40 px-3 pb-[max(env(safe-area-inset-bottom),12px)]">
          <ul className="dock mx-auto max-w-md rounded-card flex items-center justify-between p-1.5">
            {NAV.filter((n) => n.dock).map((n) => {
              const on = isActive(path, n.href);
              return (
                <li key={n.href} className={cx("transition-[flex-grow] duration-300", on ? "grow-[2.2]" : "grow")}>
                  <Link
                    href={n.href}
                    aria-current={on ? "page" : undefined}
                    aria-label={n.label}
                    className={cx("relative flex items-center justify-center gap-1.5 h-12 rounded-btn font-bold text-[13px] transition-colors", on ? "bg-accent text-accent-ink px-3" : "text-muted hover:text-ink")}
                  >
                    <Icon name={n.icon} size={21} />
                    {on && <span className="truncate">{n.short}</span>}
                    {n.href === "/buddies" && <BuddyLiveDot />}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </div>
  );
}

function NavLink({ href, active, icon, label }: { href: string; active: boolean; icon: IconName; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx("relative flex items-center gap-2 rounded-btn px-3.5 h-10 font-bold text-[14px] transition-colors", active ? "bg-accent text-accent-ink" : "text-muted hover:text-ink hover:bg-raised")}
    >
      <Icon name={icon} size={18} />
      {label}
      {href === "/buddies" && <BuddyLiveDot />}
    </Link>
  );
}

/** A green dot on the Buddies link while a buddy is working out. */
function BuddyLiveDot() {
  const { buddies, live } = useBuddies();
  if (!buddies.some((b) => liveOf(live, b.id).isLive)) return null;
  return <span className="absolute top-1.5 right-1.5 h-2.5 w-2.5 rounded-pill bg-done ring-2 ring-surface anim-live" aria-label="A buddy is working out now" />;
}

function ShellSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-12 w-72" />
      <div className="skeleton h-56 w-full" />
      <div className="grid md:grid-cols-3 gap-4">
        <div className="skeleton h-32" />
        <div className="skeleton h-32" />
        <div className="skeleton h-32" />
      </div>
    </div>
  );
}

function useSystemDark() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    setDark(mq.matches);
    const on = () => setDark(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return dark;
}

/** Sun / moon button: flips the current theme between its light and dark variant. */
export function ModeToggle() {
  const { prefs, setPrefs } = useApp();
  const systemDark = useSystemDark();
  const shown = resolveMode(prefs.colorMode, systemDark);
  const next = shown === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => setPrefs({ colorMode: next })}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className="h-11 w-11 grid place-items-center rounded-btn hover:bg-raised shrink-0"
    >
      <Icon name={shown === "dark" ? "sun" : "moon"} size={21} />
    </button>
  );
}

export function ThemeQuickSwitch() {
  const { prefs, setPrefs } = useApp();
  const systemDark = useSystemDark();
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
  const shown = resolveMode(prefs.colorMode, systemDark);
  const current = THEMES.find((t) => t.id === prefs.theme) ?? THEMES[0];
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Theme: ${current.name}. Change theme`}
        onClick={() => setOpen((o) => !o)}
        className="h-11 w-11 grid place-items-center rounded-btn hover:bg-raised"
      >
        <Icon name="palette" size={21} />
      </button>
      {open && (
        <div role="menu" className="absolute z-50 card p-2 w-64 anim-pop right-0 top-13">
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
              className={cx("w-full flex items-center gap-3 rounded-ctl px-2.5 py-2.5 text-left hover:bg-raised", prefs.theme === t.id && "bg-raised")}
            >
              <Swatch colors={t.swatch[shown]} />
              <span className="flex-1">
                <span className="block font-bold text-sm">{t.name}</span>
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

export function Swatch({ colors, size = 30 }: { colors: [string, string, string]; size?: number }) {
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
    <span className="h-11 w-8 hidden sm:grid place-items-center text-muted" title={label} aria-label={label} role="status">
      <Icon name={offline ? "cloudOff" : "cloud"} size={19} className={cx(sync.pending > 0 && !offline && "animate-pulse")} />
    </span>
  );
}

function AccountButton({ active }: { active: boolean }) {
  const { mode, user, prefs } = useApp();
  const initial = (prefs.displayName.trim() || user?.email || "?")[0]?.toUpperCase();
  return (
    <Link
      href="/settings"
      aria-label="Settings and account"
      aria-current={active ? "page" : undefined}
      className={cx("h-11 grid place-items-center rounded-btn shrink-0", mode === "user" ? "w-11" : "w-11", active ? "bg-accent text-accent-ink" : "hover:bg-raised")}
    >
      {mode === "user" ? (
        <span className={cx("h-8 w-8 rounded-pill grid place-items-center font-bold text-sm", active ? "bg-accent-ink/20" : "bg-accent-soft text-accent-text")}>{initial}</span>
      ) : (
        <Icon name="settings" />
      )}
    </Link>
  );
}

function GuestBanner({ configured }: { configured: boolean }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <div className="mx-auto w-full max-w-6xl px-4 md:px-8 mt-4">
      <div className="tile px-4 py-3 flex items-start gap-3 text-sm">
        <Icon name="info" size={18} className="mt-0.5 shrink-0 text-accent-text" />
        <p className="flex-1">
          {configured ? (
            <>
              You're using Steadyset as a guest — everything is saved in this browser only.{" "}
              <Link href="/auth/signup" className="font-bold underline underline-offset-2">
                Create a free account
              </Link>{" "}
              to sync across devices and train with buddies.
            </>
          ) : (
            <>Accounts aren't configured on this deployment, so your data is saved in this browser only. See the README to connect Supabase.</>
          )}
        </p>
        <button type="button" onClick={() => setHidden(true)} aria-label="Dismiss" className="h-8 w-8 -m-1 grid place-items-center rounded-btn hover:bg-line shrink-0">
          <Icon name="x" size={16} />
        </button>
      </div>
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
    <div className="mx-auto w-full max-w-6xl px-4 md:px-8 mt-4">
      <Link href="/workout" className="btn flex items-center gap-3 rounded-card bg-accent text-accent-ink px-5 py-3.5 hover:brightness-105">
        <Icon name={running ? "timer" : "play"} size={22} />
        <span className="flex-1 min-w-0">
          <span className="block font-bold truncate">{session.title} in progress</span>
          <span className="block text-sm opacity-85">{running ? `Resting · ${formatClock(rem / 1000)} left` : active.timer.status === "done" ? "Rest finished — time for your next set!" : "Tap to continue your workout"}</span>
        </span>
        <span className="font-bold text-sm">Resume</span>
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
