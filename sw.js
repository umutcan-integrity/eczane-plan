/* Eczane Plan — çevrimdışı çalışma için önbellek */
const CACHE = 'eczplan-be2d35b443';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png', './vendor/three.module.min.js',
  './vendor/fonts/saira-latin-wdth-normal.woff2', './vendor/fonts/saira-latin-ext-wdth-normal.woff2',
  './dolap/', './dolap/icon.svg', './dolap/vendor/three.module.min.js',
  './dolap/vendor/fonts/saira-latin-wdth-normal.woff2', './dolap/vendor/fonts/saira-latin-ext-wdth-normal.woff2'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(CORE.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('eczplan-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const isPage = req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('.html');
  if (isPage) {
    // Sayfa: önce ağ (yeni sürüm hemen gelsin), yoksa önbellek. Her sayfa (ana uygulama, dolap) kendi adresiyle saklanır.
    const dolap = url.pathname.includes('/dolap/');
    const key = new URL(url.pathname.endsWith('/') ? url.pathname : url.pathname.replace(/index\.html$/, ''), url.origin).href;
    e.respondWith(fetch(req).then(r => { if (r.ok) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(key, cp)); } return r; })
      .catch(() => caches.match(key).then(r => r || caches.match(dolap ? './dolap/' : './'))));
    return;
  }
  // Diğer dosyalar: önce önbellek
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.ok) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
    return r;
  })));
});
