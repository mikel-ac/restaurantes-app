// SW minimalista — sin caché, siempre red
// Cambiar a true cuando la app esté estable
const USE_CACHE = false;
const VERSION = 'v5';
 
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
 
self.addEventListener('fetch', e => {
  if (!USE_CACHE) return; // sin caché: deja pasar todas las peticiones a la red
});
 
