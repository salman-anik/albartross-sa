const CACHE_NAME = "albartross-offline-v10";
const APP_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/app-icon.svg",
  "/albatross/index.html",
  "/albatross/style.css",
  "/albatross/fonts/google.css",
  "/albatross/favicon.svg",
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
