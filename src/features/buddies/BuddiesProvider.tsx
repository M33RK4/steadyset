"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useApp } from "@/lib/store/AppStore";
import { getSupabase } from "@/lib/supabase/client";
import { BuddyError, acceptInvite, createInvite, fetchBuddyLive, heartsSince, listBuddies, removeBuddy, sendHeart as apiSendHeart } from "@/lib/buddies/api";
import { EMPTY_LIVE, type Buddy, type BuddyLive } from "@/lib/buddies/live";
import { useToast } from "@/components/ui/Dialog";
import { HeartShower } from "./Hearts";

interface BuddiesState {
  /** Signed in with Supabase configured — buddies can work at all. */
  available: boolean;
  /** The buddy migration hasn't been run on the server. */
  setupMissing: boolean;
  loading: boolean;
  buddies: Buddy[];
  live: Record<string, BuddyLive>;
  refresh: () => Promise<void>;
  createCode: () => Promise<string>;
  connect: (code: string) => Promise<Buddy | null>;
  remove: (buddyId: string) => Promise<void>;
  sendHeart: (buddyId: string) => Promise<boolean>;
}

const Ctx = createContext<BuddiesState | null>(null);

export function useBuddies(): BuddiesState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useBuddies must be used inside <BuddiesProvider>");
  return v;
}

export function BuddiesProvider({ children }: { children: ReactNode }) {
  const { mode, user } = useApp();
  const toast = useToast();
  const me = mode === "user" ? (user?.id ?? null) : null;
  const sb = me ? getSupabase() : null;
  const available = !!sb && !!me;

  const [buddies, setBuddies] = useState<Buddy[]>([]);
  const [live, setLive] = useState<Record<string, BuddyLive>>({});
  const [loading, setLoading] = useState(false);
  const [setupMissing, setSetupMissing] = useState(false);
  const [showers, setShowers] = useState<{ id: string; from: string }[]>([]);
  const buddiesRef = useRef<Buddy[]>([]);
  buddiesRef.current = buddies;

  const handleError = useCallback((e: unknown) => {
    if (e instanceof BuddyError && e.setupMissing) setSetupMissing(true);
  }, []);

  const refreshLive = useCallback(
    async (ids: string[]) => {
      if (!sb) return;
      const results = await Promise.all(ids.map((id) => fetchBuddyLive(sb, id).then((l) => [id, l] as const, () => null)));
      setLive((prev) => {
        const next = { ...prev };
        for (const r of results) if (r) next[r[0]] = r[1];
        return next;
      });
    },
    [sb],
  );

  const refresh = useCallback(async () => {
    if (!sb) return;
    try {
      const list = await listBuddies(sb);
      setSetupMissing(false);
      setBuddies(list);
      await refreshLive(list.map((b) => b.id));
    } catch (e) {
      handleError(e);
    }
  }, [sb, refreshLive, handleError]);

  // Load on sign-in; clear on sign-out.
  useEffect(() => {
    if (!available) {
      setBuddies([]);
      setLive({});
      setSetupMissing(false);
      return;
    }
    setLoading(true);
    void refresh().finally(() => setLoading(false));
  }, [available, refresh]);

  // ---------------------------------------------------------------- hearts in
  const seenHearts = useRef(new Set<string>());
  const heartsCursor = useRef(new Date().toISOString());
  const receiveHeart = useCallback(
    (id: string, senderId: string, at: string) => {
      if (seenHearts.current.has(id)) return;
      seenHearts.current.add(id);
      if (at > heartsCursor.current) heartsCursor.current = at;
      const from = buddiesRef.current.find((b) => b.id === senderId)?.name ?? "Your buddy";
      setShowers((s) => [...s.slice(-3), { id, from }]);
      toast(`${from} sent you a heart`, { tone: "success" });
    },
    [toast],
  );

  // ---------------------------------------------------------------- realtime + fallback polling
  const buddyKey = buddies.map((b) => b.id).join(",");
  useEffect(() => {
    if (!sb || !me || setupMissing) return;
    let realtimeOk = false;
    const channels: RealtimeChannel[] = [];
    const ids = buddyKey ? buddyKey.split(",") : [];

    channels.push(
      sb
        .channel(`hearts:${me}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "buddy_hearts", filter: `recipient_id=eq.${me}` }, (p) => {
          const row = p.new as { id: string; sender_id: string; created_at: string };
          receiveHeart(row.id, row.sender_id, row.created_at);
        })
        .subscribe((status) => {
          realtimeOk = status === "SUBSCRIBED";
        }),
    );

    if (ids.length) {
      let pending: ReturnType<typeof setTimeout> | null = null;
      const touched = new Set<string>();
      const onActivity = (row: { user_id?: string } | undefined) => {
        if (row?.user_id) touched.add(row.user_id);
        else ids.forEach((id) => touched.add(id));
        if (pending) return;
        pending = setTimeout(() => {
          pending = null;
          const which = [...touched];
          touched.clear();
          void refreshLive(which);
        }, 350);
      };
      const filter = `user_id=in.(${ids.join(",")})`;
      let ch = sb.channel(`buddy-activity:${me}`);
      for (const table of ["workout_sessions", "session_exercises", "completed_sets"]) {
        ch = ch.on("postgres_changes", { event: "*", schema: "public", table, filter }, (p) => onActivity((p.new as { user_id?: string }) ?? undefined));
      }
      channels.push(ch.subscribe());
    }

    // Polling keeps things working if realtime isn't available (and catches anything missed).
    let tick = 0;
    const iv = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      tick++;
      if (!realtimeOk)
        void heartsSince(sb, me, heartsCursor.current).then(
          (rows) => rows.forEach((r) => receiveHeart(r.id, r.sender_id, r.created_at)),
          () => {},
        );
      const anyLive = ids.some((id) => live[id]?.isLive);
      if (ids.length && (anyLive ? tick % 2 === 0 : tick % 6 === 0)) void refreshLive(ids);
    }, 10_000);
    const onVisible = () => document.visibilityState === "visible" && ids.length && void refreshLive(ids);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVisible);
      channels.forEach((c) => void sb.removeChannel(c));
    };
    // `live` is read only to pick a polling speed; re-subscribing on every update isn't wanted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sb, me, buddyKey, setupMissing, receiveHeart, refreshLive]);

  // ---------------------------------------------------------------- actions
  const createCode = useCallback(async () => {
    if (!sb) throw new BuddyError("Sign in to connect with a buddy.");
    try {
      return await createInvite(sb);
    } catch (e) {
      handleError(e);
      throw e;
    }
  }, [sb, handleError]);

  const connect = useCallback(
    async (code: string) => {
      if (!sb) throw new BuddyError("Sign in to connect with a buddy.");
      try {
        const id = await acceptInvite(sb, code);
        const list = await listBuddies(sb);
        setBuddies(list);
        void refreshLive([id]);
        return list.find((b) => b.id === id) ?? null;
      } catch (e) {
        handleError(e);
        throw e;
      }
    },
    [sb, refreshLive, handleError],
  );

  const remove = useCallback(
    async (buddyId: string) => {
      if (!sb || !me) return;
      await removeBuddy(sb, me, buddyId);
      setBuddies((l) => l.filter((b) => b.id !== buddyId));
    },
    [sb, me],
  );

  const lastSent = useRef<Record<string, number>>({});
  const sendHeart = useCallback(
    async (buddyId: string) => {
      if (!sb) return false;
      const now = Date.now();
      if (now - (lastSent.current[buddyId] ?? 0) < 1200) return false; // gentle rate limit
      lastSent.current[buddyId] = now;
      try {
        await apiSendHeart(sb, buddyId);
        return true;
      } catch (e) {
        handleError(e);
        toast(e instanceof Error ? e.message : "Couldn't send the heart.", { tone: "error" });
        return false;
      }
    },
    [sb, toast, handleError],
  );

  const value = useMemo<BuddiesState>(
    () => ({ available, setupMissing, loading, buddies, live, refresh, createCode, connect, remove, sendHeart }),
    [available, setupMissing, loading, buddies, live, refresh, createCode, connect, remove, sendHeart],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {showers.map((s) => (
        <HeartShower key={s.id} onDone={() => setShowers((l) => l.filter((x) => x.id !== s.id))} />
      ))}
    </Ctx.Provider>
  );
}

export const liveOf = (live: Record<string, BuddyLive>, id: string) => live[id] ?? EMPTY_LIVE;
