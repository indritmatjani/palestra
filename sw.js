/* ============ Service worker: offline + aggiornamento automatico ============
   Cambia VERSION a ogni rilascio: il telefono scarica i file nuovi e si ricarica da solo. */
const VERSION = 'palestra-v29';
const APP_CACHE = VERSION + '-app';

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
      .then(keys => Promise.all(keys.filter(k => k !== APP_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // le immagini degli esercizi (GitHub) non passano dal service worker:
  // le gestisce la cache normale del browser (evita di riempire la memoria del telefono)

  // file dell'app: prima la rete (versione sempre aggiornata), la cache solo se sei offline
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(APP_CACHE).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => {
        if (hit) return hit;
        // pagina di riserva solo per le navigazioni, mai per js/css/immagini
        if (req.mode === 'navigate') return caches.match('index.html');
        return Response.error();
      }))
    );
    return;
  }
  // tutto il resto (es. Supabase sync) va direttamente in rete
});
