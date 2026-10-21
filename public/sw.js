const CACHE_NAME = 'lanchonete-v2';
const urlsToCache = [
  '/',
  '/css/admin.css',
  '/manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  // Ignorar rotas de websocket e esquema não-http
  if (!event.request.url.startsWith('http')) return;
  event.respondWith(
    fetch(event.request).catch(err => {
      return caches.match(event.request).then(res => res || Promise.reject(err));
    })
  );
});