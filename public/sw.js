// Crew app shell + GET caching, so a job already opened once stays
// viewable with no signal. This never touches mutations (POST/PATCH/
// DELETE) — those are queued and replayed by the app itself
// (lib/offlineQueue.ts), not by this worker. Scope is the whole origin
// (a service worker can't be scoped to a path at the browser level), but
// in practice only /crew/* pages register it.
const CACHE_NAME = '3u3-crew-cache-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Only GET is ever cached — mutations always go straight to the
  // network (and are the app's own job to queue/retry when they fail).
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Only cache same-origin app traffic: crew pages/navigations, Next's
  // static chunks, and crew API reads. Leave everything else (Stripe,
  // Mapbox, analytics, other origins) alone.
  const isCrewArea = url.origin === self.location.origin && (url.pathname.startsWith('/crew') || url.pathname.startsWith('/_next/') || url.pathname.startsWith('/api/crew'));
  if (!isCrewArea) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const fresh = await fetch(request);
        // Only a clean 200 is worth keeping — never cache a redirect to
        // /signin or an error page as if it were the real content.
        if (fresh.ok) cache.put(request, fresh.clone());
        return fresh;
      } catch (err) {
        const cached = await cache.match(request);
        if (cached) return cached;
        throw err;
      }
    })(),
  );
});
