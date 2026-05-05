// Cambia este número con cada deploy para forzar actualización
const VERSION = 'v5';
const CACHE = `gastro-${VERSION}`;

const PRECACHE = [
  '/',
  '/index.html',
  '/assets/css/style.css',
  '/js/storage.js',
  '/js/filters.js',
  '/js/maps.js',
  '/js/app.js',
  '/data/brasil/rio-de-janeiro/restaurantes.json',
];

// Instalar: cachear recursos estáticos
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()) // activar inmediatamente sin esperar
  );
});

// Activar: borrar cachés antiguas
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE).map(k => {
          console.log('[SW] Borrando caché antigua:', k);
          return caches.delete(k);
        })
      )
    ).then(() => self.clients.claim()) // tomar control inmediato de todos los clientes
  );
});

// Fetch: red primero para HTML, caché primero para assets
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Google Maps API siempre en red
  if (url.hostname.includes('googleapis.com') ||
      url.hostname.includes('gstatic.com') ||
      url.hostname.includes('maps.google.com') ||
      url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com')) {
    return;
  }

  // HTML: red primero (siempre versión fresca)
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Assets: caché primero, red como fallback
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (!res || res.status !== 200) return res;
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      });
    })
  );
});
