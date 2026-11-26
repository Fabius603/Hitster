'use strict';
// Service worker for the installable game. App files and card lists are served
// network-first (always fresh when online, cached copy when offline). Audio is
// left to the browser: it needs range requests and is too large to cache.
const CACHE = 'hitster-spiel-v1';
const PRECACHE = ['./', 'index.html', 'app.js', 'engine.js', 'catalog.js', 'spiel.css', 'manifest.webmanifest',
  'icons/icon-32.png', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png'];

function handles(request) {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  return !/\.(mp3|mp4|m4a|ogg|wav|webm)$/i.test(url.pathname);
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key.startsWith('hitster-spiel-') && key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (handles(event.request)) event.respondWith(networkFirst(event.request));
});

globalThis.HitsterSW = { PRECACHE, handles };
