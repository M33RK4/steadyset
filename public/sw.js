// Steadyset service worker: lets the installed app open without a connection.
// - Pages: network first (always the latest version when online), cached copy when offline.
// - Hashed build files, icons and fonts: cache first (their names change on every deploy).
// - Everything else, including Supabase (another origin), goes straight to the network —
//   account data syncs through the app's own offline queue, never through this cache.
const VERSION = "v1";
const PAGES = `steadyset-pages-${VERSION}`;
const ASSETS = `steadyset-assets-${VERSION}`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGES)
      .then((cache) => cache.add(new Request("/", { cache: "reload" })))
      .catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("steadyset-") && k !== PAGES && k !== ASSETS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isAsset(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || /\.(woff2?|png|svg|ico)$/.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && !url.pathname.startsWith("/auth/")) {
            const copy = res.clone();
            caches.open(PAGES).then((cache) => cache.put(url.pathname, copy));
          }
          return res;
        })
        .catch(async () => (await caches.match(url.pathname, { cacheName: PAGES })) || (await caches.match("/", { cacheName: PAGES })) || Response.error()),
    );
    return;
  }

  if (isAsset(url)) {
    event.respondWith(
      caches.open(ASSETS).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
  }
});
