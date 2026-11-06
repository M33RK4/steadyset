// Rest-timer alerts: a short synthesized chime (Web Audio, no asset to load or license),
// optional vibration, and an optional system notification when the tab is in the background.

import { nativeApp } from "../pwa/native";

type AudioCtor = typeof AudioContext;
let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor: AudioCtor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  return ctx;
}

/**
 * Browsers only allow audio after a user gesture. Call this from a click handler (e.g. "Finish
 * Set") so the chime can play later when the countdown ends.
 */
export function unlockAudio() {
  const c = getCtx();
  if (c && c.state === "suspended") void c.resume().catch(() => {});
}

/**
 * The rest-over chime: three rising marimba notes (G5, C6, E6), a cheerful "time to go" cue.
 * Each note is a warm wooden tone: the fundamental, the marimba's bright overtone near four times
 * its pitch (which fades fast, like a mallet strike) and a soft octave, all with a quick attack and
 * a natural decay. The last note rings a little longer. Scheduled on any audio context, so it can
 * also be rendered offline.
 */
export function scheduleChime(c: BaseAudioContext, out: AudioNode, t0: number, volume = 0.6): number {
  const master = c.createGain();
  master.gain.value = volume;
  master.connect(out);
  const notes: [freq: number, at: number, level: number, ring: number][] = [
    [783.99, 0, 0.52, 0.55],
    [1046.5, 0.13, 0.52, 0.6],
    [1318.51, 0.26, 0.62, 1.1],
  ];
  // [pitch multiple, level, decay in seconds]
  const partials: [number, number, number][] = [
    [1, 1, 1],
    [3.93, 0.16, 0.12],
    [2, 0.08, 0.35],
  ];
  let end = t0;
  for (const [freq, at, level, ring] of notes) {
    for (const [mult, lv, decay] of partials) {
      const start = t0 + at;
      const stop = start + ring * decay + 0.05;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(freq * mult, start);
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(level * lv, start + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, start + ring * decay);
      o.connect(g).connect(master);
      o.start(start);
      o.stop(stop);
      end = Math.max(end, stop);
    }
  }
  return end;
}

/** Plays the rest-over chime. Returns false if it couldn't play. */
export function playChime(volume = 0.6): boolean {
  const c = getCtx();
  if (!c) return false;
  if (c.state === "suspended") void c.resume().catch(() => {});
  scheduleChime(c, c.destination, c.currentTime + 0.01, volume);
  return c.state === "running";
}

export function vibrate(pattern: number | number[] = [180, 80, 180]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  const native = nativeApp();
  if (native) return native.notificationPermission();
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  const native = nativeApp();
  if (native) {
    return new Promise((resolve) => {
      window.__steadysetPermission = resolve;
      native.requestNotifications();
    });
  }
  if (notificationPermission() === "unsupported") return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/** Show a system notification (used only when the page is hidden). Tag dedupes repeats. */
export function showNotification(title: string, body: string, tag: string) {
  if (notificationPermission() !== "granted") return false;
  const native = nativeApp();
  if (native) {
    native.postNotification(title, body, tag);
    return true;
  }
  try {
    const n = new Notification(title, { body, tag, silent: false });
    n.onclick = () => {
      window.focus();
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}
