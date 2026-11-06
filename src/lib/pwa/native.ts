// The Android app (android/) runs the site in a WebView and offers it this object, for what a web
// page can't do by itself. In a browser it's simply not there, and the site uses the web's own ways.

export interface NativeApp {
  /** The site has started: the loading screen can open onto it. */
  ready(): void;
  /** The colour behind the phone's status bar and buttons. */
  setBars(color: string): void;
  notificationPermission(): NotificationPermission;
  /** Asks for permission; the answer arrives at window.__steadysetPermission. */
  requestNotifications(): void;
  postNotification(title: string, body: string, tag: string): void;
  /** Rings at that time even if Android has closed the app in the meantime. */
  scheduleAlert(atMillis: number, title: string, body: string, tag: string): void;
  cancelAlert(): void;
  /** Asks where to save, then writes the file there and confirms. */
  saveFile(name: string, mime: string, text: string): void;
  share(text: string): void;
}

declare global {
  interface Window {
    SteadysetApp?: NativeApp;
    __steadysetPermission?: (state: NotificationPermission) => void;
  }
}

export function nativeApp(): NativeApp | undefined {
  return typeof window === "undefined" ? undefined : window.SteadysetApp;
}
