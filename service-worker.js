const CACHE = 'pflegelern-p23-v1.1.0-dev23';
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
  './css/p14-calibration.css',
  './css/p15-free-recall.css',
  './css/p16-exam-plan.css',
  './css/p20-exam.css',
  './css/p21-care-theme.css',
  './css/p22-accessibility.css',
  './js/util.js',
  './js/storage.js',
  './js/content.js',
  './js/fsrs.js',
  './js/study-engine.js',
  './js/app.js',
  './js/p14-calibration.js',
  './js/p15-free-recall.js',
  './js/p16-exam-plan-core.js',
  './js/p16-exam-plan.js',
  './js/p17-study-mix-core.js',
  './js/p17-study-mix.js',
  './js/p18-mastery-core.js',
  './js/p18-mastery.js',
  './js/p19-remediation-core.js',
  './js/p19-remediation-migration.js',
  './js/p19-remediation.js',
  './js/p20-exam-core.js',
  './js/p20-exam.js',
  './js/p20-exam-ui.js',
  './js/p21-care-ui.js',
  './js/p22-accessibility.js',
  './js/p18-bootstrap.js',
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
