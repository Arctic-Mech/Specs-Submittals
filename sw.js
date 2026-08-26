/* Service worker for the Submittal Register.

   Purpose: keep the app fresh. A single-file static site on GitHub Pages is
   easy for a browser (especially a reopened mobile tab) to serve from a stale
   cache, which is why an old build can linger after a deploy. This worker is
   network-first for the page itself: every navigation fetches the latest
   index.html straight from the network (bypassing the HTTP cache), so opening
   the site always shows the current version when online. It caches nothing of
   its own — the register needs the network anyway.

   Everything except the top-level document (Firebase, pdf.js, the ShareFile
   folder) passes straight through untouched. */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method === 'GET' && (req.mode === 'navigate' || req.destination === 'document')) {
    // Force a fresh copy of the page, ignoring the HTTP cache; fall back to a
    // normal (possibly cached) fetch only if that fails (e.g. flaky network).
    e.respondWith(fetch(req, { cache: 'reload' }).catch(() => fetch(req)));
  }
});
