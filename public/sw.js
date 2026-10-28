// FC Arena VS standalone service worker
importScripts('/sw-push-handler.js');

const CACHE_NAME = 'fc-arena-cache-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/fc_arena_icon.jpg',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-1024x1024.png',
  '/pwa-maskable-512x512.png',
  '/pwa-maskable-1024x1024.png',
  '/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('Pre-cache error (ignored):', err);
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Only cache GET requests that are http/https
  if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) {
    return;
  }

  // Network-first strategy for dynamic content, fallback to cache
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
