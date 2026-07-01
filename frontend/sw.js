const CACHE = 'traveller-v9';

const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './js/cloudsync.js',
  './js/campaign.js',
  './js/markdown.js',
  './js/data/skills.js',
  './js/models/character.js',
  './js/storage.js',
  './js/pages/metadata.js',
  './js/pages/attributes.js',
  './js/pages/equipment.js',
  './js/pages/career.js',
  './js/pages/notes.js',
  './js/pages/karte.js',
  './js/pages/combat.js',
  './js/pages/finances.js',
  './js/app.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // Travellermap API-Anfragen nicht cachen
  if (e.request.url.includes('travellermap.com')) return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
