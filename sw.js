// Service worker de VEXEL · Oficina (solo lectura).
// Estrategia: shell cache-first, estado network-first con último estado guardado.
const PREFIX = 'vexel-oficina';          // solo tocamos cachés de esta app
const VERSION = PREFIX + '-cortada-v3';
const SHELL = [
  './',
  'index.html',
  'css/app.css',
  'js/office.js',
  'js/data.js',
  'data/snapshot.json',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
];
const STATE_CACHE = VERSION + '-state';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    // Borra versiones viejas de ESTA app; nunca cachés de otro proyecto del mismo origen.
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k.startsWith(PREFIX) && k !== VERSION && k !== STATE_CACHE)
        .map((k) => caches.delete(k))
    ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return; // nada de escrituras: el SW no las toca ni las guarda
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (url.pathname.endsWith('/api/office') || url.pathname.endsWith('/api/state')) {
    e.respondWith(
      fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(STATE_CACHE).then((c) => {
            c.put('last-state', copy);
            c.put('last-state-at', new Response(String(Date.now())));
          }).catch(() => {});
        }
        return res;
      }).catch(async () => {
        // sin red: último estado guardado, marcado como tal (24 h máximo)
        const hit = await caches.match('last-state');
        if (!hit) return Response.error();
        const at = await caches.match('last-state-at').then((r) => (r ? r.text() : '0')).catch(() => '0');
        if (Date.now() - Number(at) > 24 * 3600 * 1000) return Response.error();
        const headers = new Headers(hit.headers);
        headers.set('x-vexel-stale', '1');
        return new Response(await hit.blob(), { status: 200, headers });
      })
    );
    return;
  }

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put('index.html', copy)).catch(() => {});
        return res;
      }).catch(() => caches.match('index.html').then((hit) => hit || caches.match('./')))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    }))
  );
});
