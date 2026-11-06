"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { startTransition, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
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
import { useServiceWorker, useTouchLikeAnApp } from "@/lib/pwa/install";
import { GlassIndicator, SPRING, SPRING_MS, reducedMotion, type GlassHandle } from "./GlassIndicator";
import { clearOldThumbs, currentPalette, prepareThumbs } from "@/features/animation/thumbs";
import { dismissSplash } from "@/lib/pwa/splash";

const NAV: { href: string; label: string; short: string; icon: IconName; dock: boolean }[] = [
  { href: "/", label: "Today", short: "Today", icon: "home", dock: true },
  { href: "/workouts", label: "My Workouts", short: "Plans", icon: "dumbbell", dock: true },
  { href: "/calendar", label: "Calendar", short: "Calendar", icon: "calendar", dock: true },
  { href: "/library", label: "Exercises", short: "Exercises", icon: "book", dock: false },
  { href: "/progress", label: "Progress", short: "Progress", icon: "chart", dock: true },
  { href: "/buddies", label: "Buddies", short: "Buddies", icon: "users", dock: true },
];

/** Tab of the screen shown last, so the next screen can slide in from the side of the tab tapped. */
let lastTab = -1;

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname() ?? "/";
  const { mode, configured, ready, prefs } = useApp();
  useServiceWorker();
  useTouchLikeAnApp();
  useEffect(() => {
    if (ready) dismissSplash();
  }, [ready]);
  // while nothing else is happening, get the exercise pictures ready before they're asked for
  useEffect(() => {
    if (!ready) return;
    clearOldThumbs();
    const t = setTimeout(() => prepareThumbs(currentPalette(), prefs.bodyType ?? "female"), 1500);
    return () => clearTimeout(t);
  }, [ready, prefs.theme, prefs.colorMode, prefs.bodyType]);
  const activeTab = NAV.find((n) => isActive(path, n.href))?.href ?? null;
  const tabIndex = NAV.findIndex((n) => n.href === activeTab);
  // A different tab glides in from its side; anything else (sub-pages, first load) just rises in.
  // Decided once per screen, so a later re-render doesn't swap the class and replay it.
  const anim = useRef<{ path: string; cls: string } | null>(null);
  if (anim.current?.path !== path) {
    anim.current = { path, cls: tabIndex >= 0 && lastTab >= 0 && tabIndex !== lastTab ? (tabIndex > lastTab ? "page-from-right" : "page-from-left") : "anim-page" };
  }
  const pageAnim = anim.current.cls;
  useEffect(() => {
    lastTab = tabIndex;
  }, [tabIndex]);
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
    <div className="relative isolate min-h-dvh flex flex-col">
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
          <DesktopNav path={path} active={activeTab} />
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

      <main id="main" className={cx("relative flex-1 w-full mx-auto px-4 md:px-8 pt-6 md:pt-10", inWorkout ? "max-w-3xl pb-12" : "max-w-6xl pb-32 lg:pb-16")}>
        {ready ? (
          <div key={path} className={cx("relative", pageAnim)}>
            {children}
          </div>
        ) : (
          <ShellSkeleton />
        )}
      </main>

      {/* Phones & tablets: a floating dock; the current page's pill grows to show its name */}
      {!inWorkout && (
        <MobileDock path={path} active={activeTab} />
      )}
    </div>
  );
}

/**
 * Phones & tablets: a floating dock; the current tab grows to show its name under a sliding glass
 * pill. The pill can be held and dragged along the dock: the tab under it lights up as it passes
 * and letting go opens it.
 *
 * Everything that moves here is a browser-run animation, started the moment a tab is touched and
 * before the next screen starts being built, so the dock never waits for that screen.
 */
function MobileDock({ path, active }: { path: string; active: string | null }) {
  const current = NAV.some((n) => n.dock && n.href === active) ? active : null;
  const router = useRouter();
  const list = useRef<HTMLUListElement>(null);
  const glass = useRef<GlassHandle>(null);

  // The tab being opened is shown as current straight away, while its screen is on its way.
  const [opening, setOpening] = useState<string | null>(null);
  const shown = opening ?? current;
  useEffect(() => setOpening(null), [path]);
  useEffect(() => {
    if (!opening) return;
    const t = setTimeout(() => setOpening(null), 8000); // it never arrived (no connection)
    return () => clearTimeout(t);
  }, [opening]);

  // The icons glide to their new places when a tab grows. The tabs themselves change size at once:
  // nothing but their icons can be seen, so only the icons need to move.
  const iconX = useRef(new Map<HTMLElement, number>());
  const remember = () => {
    list.current?.querySelectorAll<HTMLElement>("[data-tab-icon]").forEach((icon) => iconX.current.set(icon, icon.getBoundingClientRect().left));
  };
  useLayoutEffect(() => {
    const reduce = reducedMotion();
    list.current?.querySelectorAll<HTMLElement>("[data-tab-icon]").forEach((icon) => {
      icon.getAnimations().forEach((a) => a.cancel());
      const was = iconX.current.get(icon);
      const dx = was === undefined ? 0 : was - icon.getBoundingClientRect().left;
      if (dx && !reduce) {
        try {
          icon.animate([{ translate: `${dx}px 0` }, { translate: "0 0" }], { duration: SPRING_MS, easing: SPRING });
        } catch {
          /* no spring curves in this browser: it simply arrives */
        }
      }
    });
    remember();
  }, [shown]);

  const open = (href: string) => {
    remember();
    flushSync(() => setOpening(href));
  };

  // Holding and dragging the pill. Refs and direct styles, not state: nothing re-renders per move.
  const press = useRef<{ id: number; x: number; t: number; offset: number; lifted: boolean; dragging: boolean; over: string | null; timer: number } | null>(null);
  const justDragged = useRef(false);
  const tabUnder = (centre: number) => {
    let best: string | null = null;
    let dist = Infinity;
    list.current?.querySelectorAll<HTMLElement>("[data-glass]").forEach((li) => {
      const b = li.getBoundingClientRect();
      const d = Math.abs(centre - (b.left + b.width / 2));
      if (d < dist) {
        dist = d;
        best = li.dataset.glass ?? null;
      }
    });
    return best as string | null;
  };
  /** Each tab lights up as the pill comes over it. */
  const lightTabs = (centre: number | null) => {
    list.current?.querySelectorAll<HTMLElement>("[data-glass]").forEach((li) => {
      const link = li.firstElementChild as HTMLElement;
      if (centre === null) {
        link.style.removeProperty("--near");
        return;
      }
      const icon = li.querySelector<HTMLElement>("[data-tab-icon]")!.getBoundingClientRect();
      link.style.setProperty("--near", String(Math.max(0, 1 - Math.abs(centre - (icon.left + icon.width / 2)) / 44).toFixed(3)));
    });
  };
  const lift = (p: NonNullable<typeof press.current>) => {
    if (p.lifted) return;
    p.lifted = true;
    glass.current?.lift();
    list.current?.toggleAttribute("data-dragging", true);
    navigator.vibrate?.(8);
  };
  const letGo = () => {
    const p = press.current;
    press.current = null;
    if (!p) return null;
    clearTimeout(p.timer);
    list.current?.toggleAttribute("data-dragging", false);
    lightTabs(null);
    return p;
  };

  return (
    <nav aria-label="Main" className="lg:hidden fixed bottom-0 inset-x-0 z-40 px-3 pb-[max(env(safe-area-inset-bottom),12px)]">
      <ul
        ref={list}
        className="dock relative mx-auto max-w-md rounded-card flex items-center justify-between p-1.5 touch-none"
        onPointerDown={(e) => {
          // only the current tab's glass pill can be picked up
          const li = (e.target as Element).closest<HTMLElement>("[data-glass]");
          if (!li || li.dataset.glass !== shown || !glass.current) return;
          const p = { id: e.pointerId, x: e.clientX, t: e.timeStamp, offset: glass.current.centreOnScreen() - e.clientX, lifted: false, dragging: false, over: shown, timer: 0 };
          // holding still for a moment picks it up too, so it answers before the finger moves
          p.timer = window.setTimeout(() => press.current === p && lift(p), 140);
          press.current = p;
        }}
        onPointerMove={(e) => {
          const p = press.current;
          if (!p || p.id !== e.pointerId) return;
          if (!p.dragging) {
            if (Math.abs(e.clientX - p.x) < 6) return;
            p.dragging = true;
            lift(p);
            e.currentTarget.setPointerCapture(e.pointerId);
          }
          const centre = e.clientX + p.offset;
          const left = e.currentTarget.getBoundingClientRect().left;
          const speed = (e.clientX - p.x) / Math.max(1, e.timeStamp - p.t);
          p.x = e.clientX;
          p.t = e.timeStamp;
          glass.current?.moveTo(centre - left, speed);
          lightTabs(centre);
          const over = tabUnder(centre);
          if (over !== p.over) {
            p.over = over;
            navigator.vibrate?.(6); // a small tick as it crosses into each tab
          }
        }}
        onPointerUp={() => {
          const p = letGo();
          if (!p) return;
          if (!p.dragging) {
            if (p.lifted) glass.current?.drop();
            return; // a tap: the tab's link handles it
          }
          justDragged.current = true;
          setTimeout(() => (justDragged.current = false), 350);
          const to = p.over;
          if (to && to !== shown) {
            navigator.vibrate?.(12);
            open(to);
            glass.current?.drop();
            startTransition(() => router.push(to));
          } else glass.current?.drop();
        }}
        onPointerCancel={() => {
          if (letGo()?.lifted) glass.current?.drop();
        }}
        onClickCapture={(e) => {
          // the click that ends a drag must not also open the tab under the finger's start
          if (justDragged.current) {
            e.preventDefault();
            e.stopPropagation();
            justDragged.current = false;
          }
        }}
      >
        <GlassIndicator activeKey={shown} handle={glass} />
        {NAV.filter((n) => n.dock).map((n) => {
          const on = shown === n.href;
          return (
            <li key={n.href} data-glass={n.href} className={cx("relative min-w-0 basis-0", on ? "grow-[2.2]" : "grow")}>
              <Link
                href={n.href}
                draggable={false}
                aria-current={isActive(path, n.href) ? "page" : undefined}
                aria-label={n.label}
                data-on={on || undefined}
                onClick={(e) => {
                  if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !on) open(n.href);
                }}
                className="dock-tab relative flex items-center justify-center gap-1.5 h-12 rounded-btn font-bold text-[13px]"
              >
                <span data-tab-icon className="grid place-items-center">
                  <Icon name={n.icon} size={21} />
                </span>
                <span className={cx("dock-label truncate", on && "dock-label-on")}>{n.short}</span>
                {n.href === "/buddies" && <BuddyLiveDot />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function DesktopNav({ path, active }: { path: string; active: string | null }) {
  return (
    <nav aria-label="Main" className="hidden lg:flex relative items-center gap-1 mr-auto">
      <GlassIndicator activeKey={active} />
      {NAV.map((n) => (
        <NavLink key={n.href} href={n.href} active={isActive(path, n.href)} icon={n.icon} label={n.label} />
      ))}
    </nav>
  );
}

function NavLink({ href, active, icon, label }: { href: string; active: boolean; icon: IconName; label: string }) {
  return (
    <Link
      href={href}
      data-glass={href}
      aria-current={active ? "page" : undefined}
      className={cx("relative flex items-center gap-2 rounded-btn px-3.5 h-10 font-bold text-[14px] transition-colors duration-300", active ? "text-accent-ink" : "text-muted hover:text-ink hover:bg-raised")}
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
