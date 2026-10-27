"use client";

import { useEffect, useSyncExternalStore } from "react";

// Installing Steadyset as an app: registers the service worker and keeps hold of the browser's
// install prompt (Chrome / Edge / Samsung Internet on Android fire `beforeinstallprompt`), so
// Settings can offer an "Install app" button instead of sending people to the browser menu.

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

let started = false;
function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // keep it for our own button
    deferred = e as InstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    emit();
  });
}

/** Running as the installed app (opened from the home-screen icon). */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export type InstallState = "installed" | "available" | "manual";

function snapshot(): InstallState {
  if (installed || isStandalone()) return "installed";
  return deferred ? "available" : "manual";
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(
    (l) => {
      start();
      listeners.add(l);
      return () => listeners.delete(l);
    },
    snapshot,
    () => "manual",
  );
}

/** Shows the browser's install dialog. Resolves to whether the app was installed. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const e = deferred;
  await e.prompt();
  const { outcome } = await e.userChoice;
  deferred = null;
  emit();
  return outcome === "accepted";
}

/** Mounted once in the app shell. Service workers only run in production builds. */
export function useServiceWorker() {
  useEffect(() => {
    start();
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* the app still works without offline support */
    });
  }, []);
}
