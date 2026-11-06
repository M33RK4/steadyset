"use client";

import { useEffect, useSyncExternalStore } from "react";
import { nativeApp } from "./native";

// Installing Steadyset as an app: registers the service worker and works out what "Install app"
// should do on this device. Android gets the APK (served from public/); iPhones can't run one, so
// they get Add to Home Screen instead.

/** The Android app: it opens the live site, so it updates with every deploy. */
export const APK_URL = "/steadyset.apk";

let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

let started = false;
function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  // Chrome's own "Install app" prompt would offer a second, different install next to the APK
  window.addEventListener("beforeinstallprompt", (e) => e.preventDefault());
  window.addEventListener("appinstalled", () => {
    installed = true;
    emit();
  });
}

/** Running as the installed app (the APK, or opened from a home-screen icon). */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return !!nativeApp() || window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true || document.referrer.startsWith("android-app://");
}

function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export type InstallState = "installed" | "ios" | "apk";

function snapshot(): InstallState {
  if (installed || isStandalone()) return "installed";
  return isIOS() ? "ios" : "apk";
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(
    (l) => {
      start();
      listeners.add(l);
      return () => listeners.delete(l);
    },
    snapshot,
    () => "apk",
  );
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

/**
 * Press-and-hold on a phone: an app has no "Open in new tab" menu and nothing to drag out. Text
 * fields keep theirs, for paste and select. (A mouse's right-click is left alone.)
 */
export function useTouchLikeAnApp() {
  useEffect(() => {
    if (!matchMedia("(pointer: coarse)").matches && !isStandalone()) return;
    const block = (e: Event) => {
      if ((e.target as Element | null)?.closest?.("input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
    };
    document.addEventListener("contextmenu", block);
    document.addEventListener("dragstart", block);
    return () => {
      document.removeEventListener("contextmenu", block);
      document.removeEventListener("dragstart", block);
    };
  }, []);
}
