// Rest-timer alerts: a short synthesized "ding" (Web Audio, no asset to load or license),
// optional vibration, and an optional system notification when the tab is in the background.

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
 * Set") so the ding can play later when the countdown ends.
 */
export function unlockAudio() {
  const c = getCtx();
  if (c && c.state === "suspended") void c.resume().catch(() => {});
}

/** Two soft bell partials with a quick attack and a long decay. Returns false if it couldn't play. */
export function playDing(volume = 0.6): boolean {
  const c = getCtx();
  if (!c) return false;
  if (c.state === "suspended") void c.resume().catch(() => {});
  const t0 = c.currentTime + 0.01;
  const master = c.createGain();
  master.gain.value = volume;
  master.connect(c.destination);
  const tones: [number, number, number][] = [
    [880, 0.55, 1.4], // A5 fundamental
    [1320, 0.25, 1.0], // fifth above, shorter
    [2640, 0.08, 0.5], // shimmer
  ];
  for (const [freq, gain, decay] of tones) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
    o.connect(g).connect(master);
    o.start(t0);
    o.stop(t0 + decay + 0.05);
  }
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
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
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
