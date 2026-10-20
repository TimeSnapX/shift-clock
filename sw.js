// Shift Clock service worker — network-first, scoped to /shift-clock/.
const CACHE = 'shift-clock-v1';
const SHELL = ['./', './index.html', './app.js', './pay.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
const NEVER = /(^|\.)(googleapis\.com|google\.com|gstatic\.com|googleusercontent\.com|accounts\.google\.com)$/;
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (url.origin !== location.origin || NEVER.test(url.hostname)) return;   // never touch cross-origin / Google auth
  if (url.pathname.includes('/api/') || /oauth|auth|token/i.test(url.pathname)) return; // never cache API/auth
  if (!url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  e.respondWith(fetch(req).then(res => {
    if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
});
