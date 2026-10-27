"use client";

import { useEffect, useRef, useState } from "react";
import { useApp } from "../store/AppStore";
import { isStale, markAlerted, tick } from "./restTimer";
import { playDing, showNotification, vibrate } from "../audio/alerts";

/** Re-render periodically while `running` (display only — correctness comes from timestamps). */
export function useNow(running: boolean, intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    const onVis = () => setNow(Date.now());
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [running, intervalMs]);
  return now;
}

/**
 * Mounted once in the app shell so the rest timer finishes (and dings) no matter which screen
 * is open. Completion is checked by an exact setTimeout at the target time, a 1s safety
 * interval, and whenever the tab becomes visible — whichever happens first wins, and the
 * persisted `alerted` flag guarantees the ding plays only once.
 */
export function TimerWatcher() {
  const { active, setActive, prefs } = useApp();
  const timer = active?.timer;
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  useEffect(() => {
    if (!timer || (timer.status !== "running" && !(timer.status === "done" && !timer.alerted))) return;

    const check = () => {
      setActive((a) => {
        if (!a) return a;
        const now = Date.now();
        const { state, shouldAlert } = tick(a.timer, now);
        if (!shouldAlert) return state === a.timer ? a : { ...a, timer: state };
        const stale = isStale(state, now);
        if (!stale) {
          const p = prefsRef.current;
          if (p.soundEnabled) playDing();
          vibrate();
          if (document.visibilityState === "hidden" && p.notificationsEnabled) {
            showNotification("Rest finished", "Time for your next set!", `rest-${state.runId}`);
          }
        }
        return { ...a, timer: markAlerted(state), updatedAt: now };
      });
    };

    let timeout: ReturnType<typeof setTimeout> | null = null;
    if (timer.status === "running" && timer.endsAt) timeout = setTimeout(check, Math.max(0, timer.endsAt - Date.now()) + 5);
    else check();
    const iv = setInterval(check, 1000);
    const onVis = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", check);
    return () => {
      if (timeout) clearTimeout(timeout);
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", check);
    };
  }, [timer?.runId, timer?.status, timer?.endsAt, timer?.alerted, setActive]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
