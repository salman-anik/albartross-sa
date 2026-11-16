const CACHE_NAME = "albartross-offline-v16";
const APP_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/app-icon.svg",
  "/albatross/index.html",
  "/albatross/style.css",
  "/albatross/fonts/google.css",
  "/albatross/favicon.svg",
  "/albatross/albatross.html",
  "/albatross/heads.html",
  "/albatross/pillars.html",
  "/albatross/obelisks.html",
  "/albatross/trees.html",
  "/albatross/scene.html",
  "/albatross/main.field.js",
  "/albatross/albatross.js",
  "/albatross/beach.js",
  "/albatross/clouds.js",
  "/albatross/daylight.js",
  "/albatross/flatlight.js",
  "/albatross/flowers.js",
  "/albatross/hands.js",
  "/albatross/heads.js",
  "/albatross/palette.js",
  "/albatross/scenery.js",
  "/albatross/sounds.js",
  "/albatross/statues.js",
  "/albatross/wildlife.js",
  "/albatross/worldmap.js",
  "/albatross/vendor/three/build/three.module.js",
  "/albatross/vendor/three/examples/jsm/controls/OrbitControls.js",
  "/albatross/vendor/three/examples/jsm/geometries/ConvexGeometry.js",
  "/albatross/vendor/three/examples/jsm/math/ConvexHull.js",
  "/albatross/vendor/three/examples/jsm/utils/BufferGeometryUtils.js",
  ...["font-1.ttf", "font-2.ttf", "font-3.ttf", "font-4.ttf", "font-5.ttf"].map((file) => `/albatross/fonts/${file}`),
  ...[
    "1_1_violin.ogg.mp3", "2_1_violin.ogg.mp3", "2_lamp-1.mp3", "3_1_violin.ogg.mp3", "3_lamp-2.mp3",
    "4_1_violin.ogg.mp3", "4_lamp-3.mp3", "ambient-ocean.mp3", "bgm.mp3", "chimes.mp3", "ping-1.mp3",
    "rain.mp3", "rumble-1.mp3", "rumble-2.mp3", "splash-2-2.mp3", "splash-2.mp3", "splash-3.mp3",
    "splash.mp3", "stone-scrape-01.mp3", "stone-scrape-02.mp3", "stone-scrape-03.mp3", "stone-scrape-04.mp3",
    "stone-scrape-05.mp3", "surf-2-2.mp3", "surf-3-2.mp3", "surf-3.mp3", "surf.mp3", "thunder.mp3",
    "wind-mid.mp3", "wind-soft.mp3", "wind-strong.mp3",
  ].map((file) => `/albatross/sounds/${file}`),
];

async function cacheUrl(cache, url) {
  try {
    const response = await fetch(url, { cache: "reload" });
    if (response.ok) await cache.put(url, response.clone());
  } catch {
    // An unavailable optional shell asset should not prevent installation.
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const root = await fetch("/").catch(() => null);
    if (root?.ok) {
      await cache.put("/", root.clone());
      const html = await root.text();
      const chunks = [...html.matchAll(/\b(?:src|href)=["'](\/_next\/static\/[^"']+)["']/g)].map((match) => match[1]);
      await Promise.allSettled(chunks.map((url) => cacheUrl(cache, url)));
    }
    await Promise.allSettled(APP_SHELL.slice(1).map((url) => cacheUrl(cache, url)));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith("albartross-offline-") && name !== CACHE_NAME).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    if (request.mode === "navigate") {
      try {
        const response = await fetch(request);
        if (response.ok) {
          await cache.put(request, response.clone());
          if (url.pathname === "/") await cache.put("/", response.clone());
        }
        return response;
      } catch {
        return (await cache.match(request, { ignoreSearch: true }))
          || (await cache.match("/"))
          || new Response("Albartross SA is offline. Open it again when a connection is available so it can finish saving the game.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
      }
    }

    const appAsset = url.pathname.startsWith("/albatross/")
      || url.pathname.startsWith("/_next/static/")
      || url.pathname === "/manifest.webmanifest"
      || url.pathname === "/app-icon.svg";
    if (!appAsset) return fetch(request);

    // Store complete audio responses so streaming audio remains available offline.
    const fullRequest = request.headers.has("Range")
      ? new Request(request.url, { method: "GET", credentials: "same-origin" })
      : request;
    const cached = await cache.match(fullRequest);
    if (cached) return cached;
    const response = await fetch(fullRequest);
    if (response.ok) await cache.put(fullRequest, response.clone()).catch(() => {});
    return response;
  })());
});
