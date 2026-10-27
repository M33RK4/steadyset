"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useApp } from "@/lib/store/AppStore";
import { THEMES } from "@/lib/themes";
import { REST_PRESETS } from "@/lib/timer/restTimer";
import { notificationPermission, playDing, requestNotificationPermission, unlockAudio } from "@/lib/audio/alerts";
import { deleteAccount, requestPasswordReset } from "@/lib/auth/auth";
import { BUILT_IN_EXERCISES } from "@/lib/data/exercises";
import { Button, Field, NumberStepper, PageHeader, Segmented, Switch, cx } from "@/components/ui/primitives";
import { Dialog, useToast } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { LilyFlower, Ridge } from "@/components/ui/ThemeArt";
import type { ThemeId } from "@/lib/domain/types";

function Section({ id, title, children, description }: { id?: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section id={id} className="card p-5 scroll-mt-24" aria-labelledby={`${id ?? title}-h`}>
      <h2 id={`${id ?? title}-h`} className="text-2xl">
        {title}
      </h2>
      {description && <p className="text-sm text-muted mt-1">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function SettingsScreen() {
  const app = useApp();
  const { prefs, setPrefs, mode, user, sync, configured, data } = app;
  const toast = useToast();
  const router = useRouter();
  const [perm, setPerm] = useState<string>("default");
  const [customRest, setCustomRest] = useState<number | null>(prefs.defaultRestSeconds);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [resetSending, setResetSending] = useState(false);
  useEffect(() => setPerm(notificationPermission()), []);

  const exportData = () => {
    const payload = {
      app: "Steadyset",
      exportedAt: new Date().toISOString(),
      account: user?.email ?? "guest",
      ...data,
      builtInExercises: BUILT_IN_EXERCISES.map((e) => ({ id: e.id, slug: e.slug, name: e.name })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `steadyset-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast("Export downloaded", { tone: "success" });
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <PageHeader eyebrow="Make it yours" title="Settings" />

      <Section title="Appearance" description="Both themes have every feature, in a light and a dark version.">
        <div className="space-y-5">
          <div className="grid sm:grid-cols-2 gap-4" role="radiogroup" aria-label="Theme">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={prefs.theme === t.id}
                onClick={() => setPrefs({ theme: t.id })}
                className={cx("rounded-card border-2 p-2 text-left transition-colors", prefs.theme === t.id ? "border-accent" : "border-line hover:border-muted")}
              >
                <ThemePreview theme={t.id} />
                <span className="flex items-center gap-2 px-2 pt-3 pb-1">
                  <span className="flex-1">
                    <span className="block font-bold">{t.name}</span>
                    <span className="block text-sm text-muted">{t.description}</span>
                  </span>
                  {prefs.theme === t.id && (
                    <span className="h-7 w-7 rounded-pill bg-accent text-accent-ink grid place-items-center shrink-0">
                      <Icon name="check" size={16} strokeWidth={2.6} />
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              <span className="font-semibold block">Dark mode</span>
              <span className="text-sm text-muted">Turns your theme into its dark version.</span>
            </span>
            <Segmented
              label="Dark mode"
              value={prefs.colorMode}
              onChange={(v) => setPrefs({ colorMode: v })}
              options={[
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
                { value: "system", label: "Match device" },
              ]}
            />
          </div>
        </div>
      </Section>

      <Section title="Workout">
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="font-medium">Weight units</span>
            <Segmented label="Weight units" value={prefs.units} onChange={(u) => setPrefs({ units: u })} options={[{ value: "kg", label: "Kilograms" }, { value: "lb", label: "Pounds" }]} />
          </div>
          <div className="space-y-2">
            <p className="font-medium">Default rest timer</p>
            <p className="text-sm text-muted">Used for exercises you add yourself. Each exercise in a plan can have its own rest time.</p>
            <div className="flex flex-wrap items-end gap-2">
              {REST_PRESETS.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={prefs.defaultRestSeconds === s}
                  onClick={() => {
                    setPrefs({ defaultRestSeconds: s });
                    setCustomRest(s);
                  }}
                  className={cx("h-10 px-4 rounded-pill border text-sm font-semibold num", prefs.defaultRestSeconds === s ? "bg-accent text-accent-ink border-accent" : "border-line hover:bg-raised")}
                >
                  {s}s
                </button>
              ))}
              <div className="w-44">
                <NumberStepper label="Custom (seconds)" value={customRest} min={5} max={900} step={5} onChange={(v) => {
                  setCustomRest(v);
                  if (v) setPrefs({ defaultRestSeconds: v });
                }} />
              </div>
            </div>
          </div>
          <div className="divide-y divide-line">
            <Switch label="Timer sound" description="A short ding when rest is over. With sound off you still get the on-screen alert." checked={prefs.soundEnabled} onChange={(v) => setPrefs({ soundEnabled: v })} />
            <div className="py-3 flex items-center justify-between gap-3">
              <span className="text-sm text-muted">Check your volume — the ding follows your device's media volume and silent mode.</span>
              <Button
                variant="secondary"
                size="sm"
                icon="volume"
                onClick={() => {
                  unlockAudio();
                  const ok = playDing();
                  if (!ok) toast("Your browser blocked audio — tap again or check its sound settings.", { tone: "error" });
                }}
              >
                Test sound
              </Button>
            </div>
            <Switch
              label="Browser notifications"
              description={
                perm === "unsupported"
                  ? "This browser doesn't support notifications."
                  : perm === "denied"
                    ? "Notifications are blocked for this site. Allow them in your browser's site settings, then turn this on."
                    : "Notify you when rest ends while Steadyset is in the background."
              }
              disabled={perm === "unsupported"}
              checked={prefs.notificationsEnabled && perm === "granted"}
              onChange={async (v) => {
                if (!v) return setPrefs({ notificationsEnabled: false });
                const p = await requestNotificationPermission();
                setPerm(p);
                if (p === "granted") setPrefs({ notificationsEnabled: true });
                else toast("Notifications weren't allowed.", { tone: "error" });
              }}
            />
            <Switch label="Workout reminders" description="A reminder on scheduled training days that aren't done yet (while Steadyset is open in a tab)." checked={prefs.remindersEnabled} onChange={(v) => setPrefs({ remindersEnabled: v })} />
            {prefs.remindersEnabled && (
              <label className="py-3 flex items-center justify-between gap-3">
                <span className="font-medium">Remind me at</span>
                <input type="time" className="field w-auto" value={prefs.reminderTime} onChange={(e) => e.target.value && setPrefs({ reminderTime: e.target.value })} />
              </label>
            )}
          </div>
        </div>
      </Section>

      <Section id="display" title="Display">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="font-medium">First day of the week</span>
            <Segmented label="First day of the week" value={prefs.weekStartsOn} onChange={(v) => setPrefs({ weekStartsOn: v })} options={[{ value: 1, label: "Monday" }, { value: 0, label: "Sunday" }]} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="font-medium">Motion</span>
            <Segmented
              label="Motion"
              value={prefs.reducedMotion}
              onChange={(v) => setPrefs({ reducedMotion: v })}
              options={[
                { value: "system", label: "Match device" },
                { value: "reduce", label: "Reduce" },
                { value: "allow", label: "Full" },
              ]}
            />
          </div>
          <Switch label="Mark missed workouts in the calendar" checked={prefs.showMissed} onChange={(v) => setPrefs({ showMissed: v })} />
          <Field label="Your name" hint="Used in your greeting and shown to your buddies.">
            {(id) => <input id={id} className="field" value={prefs.displayName} maxLength={40} onChange={(e) => setPrefs({ displayName: e.target.value })} />}
          </Field>
        </div>
      </Section>

      <Section id="account" title="Account and sync">
        {mode === "user" && user ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{user.email}</p>
                <p className="text-sm text-muted flex items-center gap-1.5">
                  <Icon name={sync.online ? "cloud" : "cloudOff"} size={16} />
                  {!sync.online ? "Offline — changes are kept on this device" : sync.pending ? `${sync.pending} change(s) waiting to sync` : sync.lastSyncedAt ? `Synced ${new Date(sync.lastSyncedAt).toLocaleTimeString()}` : "Synced"}
                </p>
                {sync.error && sync.online && <p className="text-sm text-danger mt-1">{sync.error}</p>}
              </div>
              <Button variant="secondary" size="sm" icon="restore" onClick={() => void app.reload()}>
                Sync now
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                icon="lock"
                loading={resetSending}
                onClick={async () => {
                  setResetSending(true);
                  const r = await requestPasswordReset(user.email ?? "");
                  setResetSending(false);
                  toast(r.ok ? `Password reset link sent to ${user.email}` : r.message, { tone: r.ok ? "success" : "error" });
                }}
              >
                Reset password
              </Button>
              <Button
                variant="secondary"
                icon="logout"
                onClick={async () => {
                  await app.signOut();
                  toast("Signed out");
                  router.push("/");
                }}
              >
                Sign out
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-muted">
              {configured
                ? "You're using guest mode: data stays in this browser. Create an account to sync your plans, history, calendar and settings across devices. Your guest data can be imported when you sign in."
                : "Accounts aren't configured on this deployment. Add your Supabase settings (see README) to enable sign-in and sync."}
            </p>
            {configured && (
              <div className="flex flex-wrap gap-2">
                <Link href="/auth/signup" className="inline-flex items-center h-11 px-4 rounded-ctl bg-accent text-accent-ink font-semibold">
                  Create account
                </Link>
                <Link href="/auth/login" className="inline-flex items-center h-11 px-4 rounded-ctl border border-line font-semibold hover:bg-raised">
                  Sign in
                </Link>
              </div>
            )}
          </div>
        )}
      </Section>

      <Section title="Your data">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted flex-1 min-w-[200px]">Download everything — plans, workouts, sets, measurements and settings — as a JSON file.</p>
            <Button variant="secondary" icon="download" onClick={exportData}>
              Export data
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <p className="text-sm text-muted flex-1 min-w-[200px]">
              {mode === "user" ? "Permanently delete your account and all of its data from the server and this device." : "Delete all guest data stored in this browser."}
            </p>
            <Button variant="danger" icon="trash" onClick={() => setDeleteOpen(true)}>
              {mode === "user" ? "Delete account" : "Delete guest data"}
            </Button>
          </div>
        </div>
      </Section>

      <DeleteDialog open={deleteOpen} onClose={() => setDeleteOpen(false)} />
    </div>
  );
}

function DeleteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const app = useApp();
  const toast = useToast();
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isUser = app.mode === "user";
  const ok = text.trim().toUpperCase() === "DELETE";
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title={isUser ? "Delete your account?" : "Delete guest data?"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} data-autofocus>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={!ok}
            loading={busy}
            onClick={async () => {
              setError(null);
              if (isUser) {
                setBusy(true);
                const r = await deleteAccount();
                setBusy(false);
                if (!r.ok) return setError(r.message);
                app.clearLocalAccountData();
                await app.signOut();
              } else {
                app.clearLocalAccountData();
                window.location.assign("/");
                return;
              }
              toast("Your account and data were deleted.");
              onClose();
              router.push("/");
            }}
          >
            Delete permanently
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-muted">
          {isUser
            ? "This removes your login, plans, workout history, measurements and settings from our database. It can't be undone. Consider exporting your data first."
            : "This removes all plans, workouts and settings saved in this browser. It can't be undone."}
        </p>
        <Field label='Type "DELETE" to confirm' error={error}>
          {(id) => <input id={id} className="field" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />}
        </Field>
      </div>
    </Dialog>
  );
}

/** A tiny picture of each theme in both light and dark, drawn with that theme's own tokens. */
function ThemePreview({ theme }: { theme: ThemeId }) {
  return (
    <span className="grid grid-cols-2 gap-1.5" aria-hidden="true">
      {(["light", "dark"] as const).map((m) => (
        <span key={m} data-theme={theme} data-mode={m} className="relative block h-28 overflow-hidden rounded-ctl" style={{ background: "var(--bg)" }}>
          <span className="absolute left-2.5 top-2.5 right-8 h-3 rounded-pill" style={{ background: "var(--ink)", opacity: 0.85 }} />
          <span className="absolute left-2.5 top-7 w-10 h-2 rounded-pill" style={{ background: "var(--muted)", opacity: 0.6 }} />
          <span className="absolute z-10 left-2.5 bottom-2.5 h-6 w-16 rounded-btn" style={{ background: "var(--accent)", boxShadow: "0 0 0 2px var(--bg)" }} />
          {theme === "lily" ? (
            <svg viewBox="-60 -60 120 120" className="absolute -right-5 -bottom-5 w-24">
              <LilyFlower rotate={14} />
            </svg>
          ) : (
            <Ridge className="absolute inset-x-0 bottom-0 h-12 w-full" />
          )}
        </span>
      ))}
    </span>
  );
}
