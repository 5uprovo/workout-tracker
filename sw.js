// Offline cache. Bump VERSION whenever you change any file so phones pick up the update.
const VERSION = 'replog-v1';
const ASSETS = ['./', './index.html', './app.css', './app.js', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Network first (so updates arrive when online), cache fallback (so it works offline in the gym).
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const cached = () => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('./index.html'));
  const net = fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return res;
  });
  // Weak gym signal: if the network takes over 2.5 s, serve the cached copy instead.
  const timeout = new Promise(resolve => setTimeout(resolve, 2500)).then(() => caches.match(req, { ignoreSearch: true }));
  e.respondWith(Promise.race([net.catch(cached), timeout]).then(r => r || net));
});
