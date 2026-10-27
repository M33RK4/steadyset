"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { applyChanges, type Change } from "../domain/changes";
import { DEFAULT_PREFERENCES, emptyAppData, type AppData, type Preferences } from "../domain/types";
import { BALANCED_TONING_BEGINNER } from "../data/defaultPlan";
import { instantiateTemplate } from "../plans/planOps";
import type { ActiveWorkout, StepResult } from "../session/sessionOps";
import { getSupabase, isSupabaseConfigured } from "../supabase/client";
import { SyncEngine, type Db } from "../sync/syncEngine";
import { guestHasMeaningfulData, guestImportChanges } from "./migration";
import { browserKV, KEYS } from "./persistence";
import { signOut as authSignOut } from "../auth/auth";
import { normalizePreferences, resolveMode } from "../themes";

export type SyncState = {
  online: boolean;
  pending: number;
  syncing: boolean;
  lastSyncedAt: number | null;
  error: string | null;
};

type Mode = "guest" | "user";

interface AppStore {
  ready: boolean;
  mode: Mode;
  user: User | null;
  configured: boolean;
  data: AppData;
  prefs: Preferences;
  active: ActiveWorkout | null;
  sync: SyncState;
  loadError: string | null;
  pendingGuestImport: boolean;
  /** Apply changes computed from the latest data (safe for rapid repeated taps). */
  commit: (fn: Change[] | ((data: AppData) => Change[])) => void;
  /** Run a workout step that changes both data and the active-workout state atomically. */
  step: (fn: (data: AppData, active: ActiveWorkout) => StepResult) => StepResult | null;
  setActive: (next: ActiveWorkout | null | ((a: ActiveWorkout | null) => ActiveWorkout | null)) => void;
  setPrefs: (patch: Partial<Preferences>) => void;
  syncNow: () => Promise<void>;
  reload: () => Promise<void>;
  signOut: () => Promise<void>;
  importGuestData: () => void;
  dismissGuestImport: () => void;
  clearLocalAccountData: () => void;
}

const Ctx = createContext<AppStore | null>(null);

function seedIfNeeded(d: AppData): { data: AppData; changes: Change[]; prefs: Preferences | null } {
  if (d.preferences.defaultPlanSeeded || d.plans.length > 0) {
    if (!d.preferences.defaultPlanSeeded) {
      const prefs = { ...d.preferences, defaultPlanSeeded: true };
      return { data: { ...d, preferences: prefs }, changes: [], prefs };
    }
    return { data: d, changes: [], prefs: null };
  }
  const { changes } = instantiateTemplate(d, BALANCED_TONING_BEGINNER, { makeActive: true });
  const prefs = { ...d.preferences, defaultPlanSeeded: true, updatedAt: new Date().toISOString() };
  return { data: { ...applyChanges(d, changes), preferences: prefs }, changes, prefs };
}

const systemDark = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches === true;

function applyDocumentPrefs(p: Preferences) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.theme = p.theme;
  root.dataset.mode = resolveMode(p.colorMode, systemDark());
  root.dataset.motion = p.reducedMotion;
  browserKV.set(KEYS.theme, { theme: p.theme, colorMode: p.colorMode, motion: p.reducedMotion });
}

/** Older saved data can carry themes that no longer exist. */
function withNormalizedPrefs(d: AppData): AppData {
  return { ...d, preferences: normalizePreferences({ ...DEFAULT_PREFERENCES, ...d.preferences }) };
}

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>("guest");
  const [user, setUser] = useState<User | null>(null);
  const [data, setData] = useState<AppData>(() => emptyAppData());
  const [active, setActiveState] = useState<ActiveWorkout | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingGuestImport, setPendingGuestImport] = useState(false);
  const [sync, setSync] = useState<SyncState>({ online: true, pending: 0, syncing: false, lastSyncedAt: null, error: null });

  const dataRef = useRef(data);
  const activeRef = useRef(active);
  const engineRef = useRef<SyncEngine | null>(null);
  const scopeRef = useRef<string>("guest");
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeKey = () => (scopeRef.current === "guest" ? KEYS.guestActive : KEYS.userActive(scopeRef.current));

  // ---------------------------------------------------------------- persistence helpers
  const persistData = useCallback((d: AppData) => {
    if (scopeRef.current === "guest") browserKV.set(KEYS.guestData, d);
    else engineRef.current?.writeCache(d);
  }, []);

  const updateSyncCounters = useCallback(() => {
    setSync((s) => ({ ...s, pending: engineRef.current?.pendingCount ?? 0 }));
  }, []);

  const flush = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setSync((s) => ({ ...s, online: false, pending: engine.pendingCount }));
      return;
    }
    setSync((s) => ({ ...s, syncing: true }));
    const out = await engine.flush();
    setSync((s) => ({
      ...s,
      syncing: false,
      pending: engine.pendingCount,
      online: out.ok || out.reason !== "network" ? true : s.online,
      lastSyncedAt: out.ok ? Date.now() : s.lastSyncedAt,
      error: out.ok ? null : out.reason === "network" ? "Offline — changes are saved on this device and will sync automatically." : `Some changes were rejected by the server: ${out.message}`,
    }));
  }, []);

  const scheduleFlush = useCallback(
    (delay = 400) => {
      if (!engineRef.current) return;
      if (flushTimer.current) clearTimeout(flushTimer.current);
      flushTimer.current = setTimeout(() => void flush(), delay);
    },
    [flush],
  );

  const writeChanges = useCallback(
    (changes: Change[]) => {
      if (!changes.length) return;
      const next = applyChanges(dataRef.current, changes);
      dataRef.current = next;
      setData(next);
      persistData(next);
      if (engineRef.current) {
        engineRef.current.enqueue(changes);
        updateSyncCounters();
        scheduleFlush();
      }
    },
    [persistData, scheduleFlush, updateSyncCounters],
  );

  const writeActive = useCallback((next: ActiveWorkout | null) => {
    activeRef.current = next;
    setActiveState(next);
    if (next) browserKV.set(activeKey(), next);
    else browserKV.remove(activeKey());
  }, []);

  const writePrefs = useCallback(
    (prefs: Preferences) => {
      const next = { ...dataRef.current, preferences: prefs };
      dataRef.current = next;
      setData(next);
      persistData(next);
      applyDocumentPrefs(prefs);
      if (engineRef.current) {
        engineRef.current.enqueuePrefs(prefs);
        updateSyncCounters();
        scheduleFlush();
      }
    },
    [persistData, scheduleFlush, updateSyncCounters],
  );

  // ---------------------------------------------------------------- loading
  const loadGuest = useCallback(() => {
    engineRef.current = null;
    scopeRef.current = "guest";
    const stored = browserKV.get<AppData>(KEYS.guestData);
    const base = stored ? withNormalizedPrefs({ ...emptyAppData(), ...stored }) : emptyAppData();
    // Keep a theme chosen before any data existed.
    const themeOnly = browserKV.get<{ theme: Preferences["theme"]; colorMode?: Preferences["colorMode"]; motion: Preferences["reducedMotion"] }>(KEYS.theme);
    if (!stored && themeOnly)
      base.preferences = normalizePreferences({ ...base.preferences, theme: themeOnly.theme, colorMode: themeOnly.colorMode ?? base.preferences.colorMode, reducedMotion: themeOnly.motion });
    const seeded = seedIfNeeded(base);
    dataRef.current = seeded.data;
    setData(seeded.data);
    browserKV.set(KEYS.guestData, seeded.data);
    applyDocumentPrefs(seeded.data.preferences);
    writeActive(browserKV.get<ActiveWorkout>(KEYS.guestActive));
    setMode("guest");
    setUser(null);
    setPendingGuestImport(false);
    setSync({ online: true, pending: 0, syncing: false, lastSyncedAt: null, error: null });
    setReady(true);
  }, [writeActive]);

  const loadUser = useCallback(
    async (u: User) => {
      const sb = getSupabase();
      if (!sb) return loadGuest();
      const sameUser = scopeRef.current === u.id && engineRef.current;
      const engine = sameUser ? engineRef.current! : new SyncEngine(sb as unknown as Db, u.id, browserKV);
      engineRef.current = engine;
      scopeRef.current = u.id;
      browserKV.set(KEYS.lastUser, u.id);
      setUser(u);
      setMode("user");
      writeActive(browserKV.get<ActiveWorkout>(KEYS.userActive(u.id)));
      const rawCache = engine.readCache();
      const cached = rawCache ? withNormalizedPrefs(rawCache) : null;
      if (cached && !sameUser) {
        dataRef.current = cached;
        setData(cached);
        applyDocumentPrefs(cached.preferences);
        setReady(true);
      }
      try {
        const loaded = await engine.load();
        let d = loaded;
        const seeded = seedIfNeeded(d);
        d = seeded.data;
        dataRef.current = d;
        setData(d);
        engine.writeCache(d);
        applyDocumentPrefs(d.preferences);
        if (seeded.changes.length) engine.enqueue(seeded.changes);
        if (seeded.prefs) engine.enqueuePrefs(seeded.prefs);
        setLoadError(null);
        setSync((s) => ({ ...s, online: true, pending: engine.pendingCount, lastSyncedAt: Date.now() }));
        if (engine.pendingCount) void flush();
        setPendingGuestImport(guestHasMeaningfulData(browserKV.get<AppData>(KEYS.guestData)));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setLoadError(cached ? null : `Couldn't load your data: ${msg}`);
        setSync((s) => ({ ...s, online: false, error: "Offline — showing the copy saved on this device." }));
        if (!cached) {
          // no cached copy: start empty but usable; changes queue until the server is reachable
          const d = emptyAppData();
          dataRef.current = d;
          setData(d);
        }
      }
      setReady(true);
    },
    [flush, loadGuest, writeActive],
  );

  const reload = useCallback(async () => {
    if (scopeRef.current === "guest" || !engineRef.current) return;
    if (engineRef.current.pendingCount) await flush();
    try {
      const d = await engineRef.current.load();
      dataRef.current = d;
      setData(d);
      engineRef.current.writeCache(d);
      applyDocumentPrefs(d.preferences);
      setSync((s) => ({ ...s, online: true, lastSyncedAt: Date.now(), error: s.pending ? s.error : null }));
    } catch {
      setSync((s) => ({ ...s, online: false }));
    }
  }, [flush]);

  // ---------------------------------------------------------------- auth lifecycle
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) {
      loadGuest();
      return;
    }
    let cancelled = false;
    let currentUserId: string | null = null;
    const handle = (session: Session | null) => {
      if (cancelled) return;
      const uid = session?.user?.id ?? null;
      if (uid === currentUserId && uid !== null) {
        setUser(session!.user);
        return;
      }
      currentUserId = uid;
      if (session?.user) void loadUser(session.user);
      else loadGuest();
    };
    sb.auth
      .getSession()
      .then(({ data: { session } }) => handle(session))
      .catch(() => loadGuest());
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      // Defer: Supabase recommends not awaiting other calls inside this callback.
      setTimeout(() => handle(session), 0);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [loadGuest, loadUser]);

  // ---------------------------------------------------------------- connectivity & refresh
  useEffect(() => {
    const onOnline = () => {
      setSync((s) => ({ ...s, online: true }));
      void flush();
    };
    const onOffline = () => setSync((s) => ({ ...s, online: false }));
    const onVisible = () => {
      if (document.visibilityState === "visible") void reload();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    const iv = setInterval(() => {
      if (engineRef.current?.pendingCount) void flush();
    }, 30_000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(iv);
    };
  }, [flush, reload]);

  // "Match device" follows the system's light/dark setting while the app is open.
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const onChange = () => applyDocumentPrefs(dataRef.current.preferences);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Keep the active workout consistent across tabs on the same device.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === activeKey()) {
        const next = e.newValue ? (JSON.parse(e.newValue) as ActiveWorkout) : null;
        activeRef.current = next;
        setActiveState(next);
      }
      if (scopeRef.current === "guest" && e.key === KEYS.guestData && e.newValue) {
        const d = JSON.parse(e.newValue) as AppData;
        dataRef.current = d;
        setData(d);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // ---------------------------------------------------------------- public API
  const commit = useCallback<AppStore["commit"]>(
    (fn) => {
      const changes = typeof fn === "function" ? fn(dataRef.current) : fn;
      writeChanges(changes);
    },
    [writeChanges],
  );

  const step = useCallback<AppStore["step"]>(
    (fn) => {
      const a = activeRef.current;
      if (!a) return null;
      const res = fn(dataRef.current, a);
      writeChanges(res.changes);
      if (res.active !== a) writeActive(res.active);
      return res;
    },
    [writeActive, writeChanges],
  );

  const setActive = useCallback<AppStore["setActive"]>(
    (next) => {
      const value = typeof next === "function" ? next(activeRef.current) : next;
      writeActive(value);
    },
    [writeActive],
  );

  const setPrefs = useCallback(
    (patch: Partial<Preferences>) => writePrefs({ ...dataRef.current.preferences, ...patch, updatedAt: new Date().toISOString() }),
    [writePrefs],
  );

  const signOut = useCallback(async () => {
    if (engineRef.current?.pendingCount) await flush();
    await authSignOut();
    loadGuest();
  }, [flush, loadGuest]);

  const importGuestData = useCallback(() => {
    const guest = browserKV.get<AppData>(KEYS.guestData);
    if (!guest || !engineRef.current) return;
    writeChanges(guestImportChanges(guest, dataRef.current));
    const guestActive = browserKV.get<ActiveWorkout>(KEYS.guestActive);
    if (guestActive && !activeRef.current) writeActive(guestActive);
    browserKV.remove(KEYS.guestData);
    browserKV.remove(KEYS.guestActive);
    setPendingGuestImport(false);
  }, [writeActive, writeChanges]);

  const dismissGuestImport = useCallback(() => setPendingGuestImport(false), []);

  const clearLocalAccountData = useCallback(() => {
    const uid = scopeRef.current;
    if (uid === "guest") {
      browserKV.remove(KEYS.guestData);
      browserKV.remove(KEYS.guestActive);
      return;
    }
    browserKV.remove(KEYS.userCache(uid));
    browserKV.remove(KEYS.userOutbox(uid));
    browserKV.remove(KEYS.userPrefsPending(uid));
    browserKV.remove(KEYS.userActive(uid));
    engineRef.current = null;
  }, []);

  const value = useMemo<AppStore>(
    () => ({
      ready,
      mode,
      user,
      configured,
      data,
      prefs: data.preferences,
      active,
      sync,
      loadError,
      pendingGuestImport,
      commit,
      step,
      setActive,
      setPrefs,
      syncNow: flush,
      reload,
      signOut,
      importGuestData,
      dismissGuestImport,
      clearLocalAccountData,
    }),
    [ready, mode, user, configured, data, active, sync, loadError, pendingGuestImport, commit, step, setActive, setPrefs, flush, reload, signOut, importGuestData, dismissGuestImport, clearLocalAccountData],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppStore {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used inside <AppStoreProvider>");
  return v;
}
