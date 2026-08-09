/*
 * The smallest service worker that earns its keep.
 *
 * It handles ONE thing: the Living Map artifact, which is ~4 MB and served
 * from a content-hashed, immutable URL. Cache-first there means a member who
 * has opened the map once opens it instantly forever, and offline, and the
 * hash in the name makes a stale hit impossible: new bytes, new URL, new
 * cache entry.
 *
 * EVERYTHING ELSE PASSES THROUGH UNTOUCHED. No app-shell precache, no
 * navigation fallback, no API caching. A service worker that intercepts
 * broadly is a service worker that can serve a village yesterday's data or
 * strand it on a build that no longer exists, and the failure mode is a site
 * that looks broken with no way for the member to force a refresh. The narrow
 * version cannot do that.
 *
 * Installability comes from having a manifest and a registered worker; it
 * does not require caching the whole app, so we do not.
 */
const CACHE = "grounds-v1";

self.addEventListener("install", () => {
  // Nothing to precache. Take over as soon as the old worker lets go.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop caches from an older naming scheme so an upgrade cannot leave
      // megabytes of unreachable artifact behind on someone's phone.
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try { url = new URL(req.url); } catch { return; }
  if (url.origin !== self.location.origin) return;

  // Only the immutable, hashed artifact. The stable /grounds/index.html name
  // is deliberately excluded: its bytes change without its URL changing, so
  // caching it hard is exactly the stale-forever trap.
  if (!/^\/grounds\/grounds-[a-z0-9]+\.html$/i.test(url.pathname)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      // Only a clean, complete response is worth keeping.
      if (res && res.status === 200 && res.type === "basic") cache.put(req, res.clone());
      return res;
    })(),
  );
});
