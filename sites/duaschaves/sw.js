/* Duas Chaves: service worker da app instalada.
   Página e anúncios: primeiro a rede (para estarem sempre atualizados); sem rede, a última cópia guardada.
   Imagens da marca: da cópia guardada. A API (/api/) nunca passa por aqui. */
const CACHE = 'dc-v1';
const BASE = ['/', '/manifest.webmanifest', '/marca/duaschaves-icone-192.png', '/marca/duaschaves-icone.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(BASE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  if (u.pathname.startsWith('/marca/')) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
    return;
  }
  const guardar = e.request.mode === 'navigate' || u.pathname === '/' || u.pathname === '/lista.json' || u.pathname === '/anuncios.json' || u.pathname.startsWith('/det/');
  if (!guardar) return;
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const c = r.clone(); caches.open(CACHE).then(k => k.put(e.request.mode === 'navigate' ? '/' : e.request, c)); }
    return r;
  }).catch(() => caches.match(e.request.mode === 'navigate' ? '/' : e.request).then(r => r || caches.match('/'))));
});
