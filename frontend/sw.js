const CACHE = 'traveller-v17';

const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './js/cloudsync.js',
  './js/auth.js',
  './js/campaign.js',
  './js/filesync.js',
  './js/markdown.js',
  './js/data/skills.js',
  './js/models/character.js',
  './js/sync-merge.js',
  './js/storage.js',
  './js/pages/metadata.js',
  './js/pages/attributes.js',
  './js/pages/equipment.js',
  './js/pages/career.js',
  './js/pages/notes.js',
  './js/pages/karte.js',
  './js/pages/combat.js',
  './js/pages/finances.js',
  './js/pages/ship.js',
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
  // Nur Same-Origin-Requests cachen (App-Assets).
  // API-Aufrufe (CloudSync, CampaignSync, Travellermap) laufen direkt ums Netz –
  // sonst liefert der Cache veraltete Charakterdaten zurück.
  if (new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
