'use strict';

const cacheName = 'mandalart-mate-shell-v6';
const shell = ['./', './index.html', './styles.css', './model.js', './app.js', './mates.js', './manifest.webmanifest', './icon-192.png', './icon-512.png', './demo-run.jpg', './demo-read.jpg', './demo-walk.jpg', './demo-fruit.jpg'];
const shellUrls = new Set(shell.map(file => new URL(file, self.registration.scope).href));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(shell)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith('mandalart-mate-shell-') && key !== cacheName)
    .map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || !shellUrls.has(request.url)) return;
  event.respondWith(fetch(request).catch(() => caches.open(cacheName).then(cache => cache.match(request))));
});
