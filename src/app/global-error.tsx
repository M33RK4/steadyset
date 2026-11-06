"use client";

import { useEffect } from "react";

/**
 * The last resort, when even the app around the screens has crashed: nothing of the app can be
 * relied on here, so it stands alone, in the loading screen's colours.
 */
export default function GlobalError({ error }: { error: Error }) {
  useEffect(() => {
    console.error(error);
    // the Android app's loading screen would otherwise stay up until it gives up by itself
    (window as Window & { SteadysetApp?: { ready(): void } }).SteadysetApp?.ready();
  }, [error]);
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100dvh", display: "grid", placeItems: "center", background: "#14243a", color: "#fff", fontFamily: "system-ui, sans-serif", textAlign: "center", padding: 24, boxSizing: "border-box" }}>
        <main role="alert">
          <h1 style={{ fontSize: 26, margin: "0 0 8px" }}>Something went wrong</h1>
          <p style={{ margin: "0 0 20px", opacity: 0.8 }}>Steadyset ran into a problem. Your workouts and plans are safe.</p>
          <button type="button" onClick={() => window.location.reload()} style={{ font: "inherit", fontWeight: 700, padding: "12px 24px", borderRadius: 999, border: "none", background: "#9cc9f0", color: "#14243a" }}>
            Reload
          </button>
        </main>
      </body>
    </html>
  );
}
