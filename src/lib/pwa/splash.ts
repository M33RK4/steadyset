// The loading screen (components/shell/Splash.tsx) and the colour of the phone's system bars,
// which take the loading screen's colour while it's up and the theme's background after that.

export const SPLASH_COLOR = "#14243a";

/** Long enough for the logo's animation to finish, even if the app is ready sooner. */
const MIN_SHOWN_MS = 1000;
const EXIT_MS = 420;

function splashShowing(): boolean {
  const el = document.getElementById("splash");
  return !!el && !el.hidden;
}

/** The phone's status bar (and the installed app's title bar) takes the theme's background. */
export function syncSystemBars() {
  if (typeof document === "undefined" || splashShowing()) return;
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  if (bg) document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", bg));
}

let leaving = false;

/** The app is ready: the loading screen opens up to show it. */
export function dismissSplash() {
  const el = document.getElementById("splash");
  if (!el || el.hidden || leaving) return;
  leaving = true;
  setTimeout(() => {
    el.dataset.out = "";
    setTimeout(() => {
      el.hidden = true;
      syncSystemBars();
    }, EXIT_MS);
  }, Math.max(0, MIN_SHOWN_MS - performance.now()));
}
