const CACHE_VERSION = 'troy-app-v20260801a';
const CORE_CACHE = `troy-core-${CACHE_VERSION}`;
const RUNTIME_CACHE = `troy-runtime-${CACHE_VERSION}`;

const CORE_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/main.js',
  '/manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CORE_CACHE).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key !== CORE_CACHE && key !== RUNTIME_CACHE)
        .map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

function isCacheableRequest(request) {
  if (!request || request.method !== 'GET') return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  return true;
}

function isFreshCodeAsset(request) {
  if (!request) return false;
  const url = new URL(request.url);
  const path = String(url.pathname || '');
  return (
    path === '/' ||
    path.endsWith('/index.html') ||
    path.endsWith('.js') ||
    path.endsWith('.css') ||
    path.endsWith('.html') ||
    path.endsWith('.webmanifest')
  );
}

function isVersionedCodeAsset(request) {
  if (!request) return false;
  const url = new URL(request.url);
  const path = String(url.pathname || '');
  return url.searchParams.has('v') && (path.endsWith('.js') || path.endsWith('.css'));
}

function shouldBypassRuntimeCache(request) {
  if (!request) return false;
  const url = new URL(request.url);
  const path = String(url.pathname || '');
  return path.startsWith('/api/') || path === '/entry-effect.mp4';
}

function isAppShellNavigation(request) {
  if (!request || request.mode !== 'navigate') return false;
  const url = new URL(request.url);
  return url.pathname === '/' || url.pathname === '/index.html';
}

function createOfflineResponse(request) {
  const isNavigation = request?.mode === 'navigate';
  return new Response(
    isNavigation
      ? '<!doctype html><html lang="ja"><meta charset="utf-8"><title>Offline</title><body>ページを読み込めません。ローカルプレビューサーバーが起動しているか確認してください。</body></html>'
      : 'Offline',
    {
      status: 503,
      statusText: 'Service Unavailable',
      headers: {
        'Content-Type': isNavigation ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store'
      }
    }
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (!isCacheableRequest(request)) return;

  if (shouldBypassRuntimeCache(request)) {
    event.respondWith(fetch(request));
    return;
  }

  if (isVersionedCodeAsset(request)) {
    const networkUpdate = fetch(request).then((response) => {
      if (response?.ok) {
        const cloned = response.clone();
        caches.open(CORE_CACHE).then((cache) => cache.put(request, cloned)).catch(() => undefined);
      }
      return response;
    });
    event.waitUntil(networkUpdate.then(() => undefined).catch(() => undefined));
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return networkUpdate.catch(() => createOfflineResponse(request));
      })
    );
    return;
  }

  const isNavigation = request.mode === 'navigate';
  if (isNavigation || isFreshCodeAsset(request)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response?.ok) {
            const cloned = response.clone();
            const cacheName = isNavigation ? RUNTIME_CACHE : CORE_CACHE;
            caches.open(cacheName).then((cache) => cache.put(request, cloned)).catch(() => undefined);
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          if (isAppShellNavigation(request)) {
            const appShell = await caches.match('/index.html');
            if (appShell) return appShell;
          }
          return createOfflineResponse(request);
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (!response?.ok || response.status === 206) return response;
        const cloned = response.clone();
        caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, cloned)).catch(() => undefined);
        return response;
      });
    })
  );
});
