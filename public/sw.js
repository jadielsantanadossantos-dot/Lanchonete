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
  // Ignorar: não-http, websockets, e origens cruzadas (Google Fonts, Cloudflare Insights, etc)
  const url = event.request.url;
  if (!url.startsWith('http') || url.startsWith('ws')) return;
  // Não interceptar fontes do Google e scripts de analytics - deixar o browser gerenciar
  if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com') || url.includes('cloudflareinsights.com')) {
    return;
  }
  event.respondWith(
    fetch(event.request).catch(err => {
      return caches.match(event.request).then(res => res || Promise.reject(err));
    })
  );
});