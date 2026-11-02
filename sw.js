/* ============ Service worker: offline + aggiornamento automatico ============
   Cambia VERSION a ogni rilascio: il telefono scarica i file nuovi e si ricarica da solo. */
const VERSION = 'palestra-v2.0.0';
const APP_CACHE = VERSION + '-app';
const MEDIA_CACHE = 'palestra-media-v1'; // immagini esercizi: restano tra una versione e l'altra

const APP_SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/styles.css',
  'js/data.js',
  'js/muscles.js',
  'js/charts.js',
  'js/exlib.js',
  'js/cardio.js',
  'js/sync.js',
  'js/app.js',
  'data/exercises-index.json',
  'icons/icon-192.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(APP_CACHE)
      .then(cache => cache.addAll(APP_SHELL.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== APP_CACHE && k !== MEDIA_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // immagini/GIF del dataset: cache-first (non cambiano mai)
  if (url.hostname === 'raw.githubusercontent.com' && url.pathname.includes('/exercises-dataset/')) {
    event.respondWith(
      caches.open(MEDIA_CACHE).then(cache =>
        cache.match(req).then(hit => hit || fetch(req).then(res => {
          if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
          return res;
        }))
      )
    );
    return;
  }

  // file dell'app: dalla cache (veloce e offline), aggiornati in background
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(APP_CACHE).then(cache =>
        cache.match(req, { ignoreSearch: true }).then(hit => {
          const net = fetch(req).then(res => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          }).catch(() => hit || (req.mode === 'navigate' ? cache.match('index.html') : Response.error()));
          return hit || net;
        })
      )
    );
  }
  // tutto il resto (es. Supabase sync) va direttamente in rete
});
