// Royal Fabrics PWA Service Worker
// Handles: app shell caching, offline fallback, background sync

const CACHE_NAME = 'royal-fabrics-v1';
const SYNC_TAG = 'royal-fabrics-sync';

// App shell files to cache on install
const APP_SHELL = [
  '/',
  '/index.html',
  '/icon-192.png',
  '/icon-512.png',
  '/manifest.json',
];

// ── Install: cache app shell ──────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// ── Activate: remove old caches ───────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: network-first for API, cache-first for assets ──────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Always network for Supabase API calls — don't cache DB responses
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        // Offline: return a simple JSON error so the app can handle it
        return new Response(
          JSON.stringify({ error: 'offline' }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  // For Google Fonts — network first, fall back to cache
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        fetch(event.request)
          .then((response) => {
            cache.put(event.request, response.clone());
            return response;
          })
          .catch(() => cache.match(event.request))
      )
    );
    return;
  }

  // App shell: cache-first, then network
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Cache successful GET responses
        if (event.request.method === 'GET' && response.status === 200) {
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, response.clone());
          });
        }
        return response;
      }).catch(() => {
        // For navigation requests offline, serve the app shell
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});

// ── Background Sync ───────────────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(syncPendingOperations());
  }
});

async function syncPendingOperations() {
  // Notify all open tabs that a sync is happening
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach((client) => {
    client.postMessage({ type: 'SYNC_STARTED' });
  });
}

// ── Push message from app to trigger sync notification ────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'SYNC_COMPLETE') {
    // Broadcast to all tabs that sync finished
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      clients.forEach((client) => {
        client.postMessage({ type: 'SYNC_COMPLETE', count: event.data.count });
      });
    });
  }
});
