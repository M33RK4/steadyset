import type { MetadataRoute } from "next";

// Makes Steadyset installable ("Install app" / "Add to Home screen"): it then opens full-screen
// from its own icon, like a native app. Served at /manifest.webmanifest.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Steadyset — workout planner",
    short_name: "Steadyset",
    description: "Follow your workout plan, log every set, rest with a reliable timer and train alongside a buddy.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    // No "orientation" lock on purpose: on Android 8.0.0 a fixed orientation combined with Chrome's
    // see-through launch screen makes the installed app crash on start ("Steadyset has stopped").
    background_color: "#e9f3fc",
    theme_color: "#1f3d66",
    categories: ["health", "fitness", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Start today's workout", short_name: "Workout", url: "/workout", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Buddies", url: "/buddies", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
