const CACHE = 'pflegelern-p10-v1.0.0-rc1';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './css/tokens.css',
  './css/base.css',
  './css/layout.css',
  './css/components.css',
  './css/study.css',
  './css/responsive.css',
  './js/util.js',
  './js/storage.js',
  './js/content.js',
  './js/fsrs.js',
  './js/study-engine.js',
  './js/app.js',
  './data/manifest.json',
  './data/chapters.json',
  './data/sections.json',
  './data/concepts.json',
  './data/cards.json',
  './data/questions.json',
  './data/cases.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put('./index.html', copy)).catch(() => {});
      return response;
    }).catch(() => caches.match('./index.html')));
    return;
  }

  event.respondWith(caches.match(event.request).then((cached) => {
    if (cached) return cached;
    return fetch(event.request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => {});
      }
      return response;
    });
  }));
});
