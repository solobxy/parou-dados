// Guarda a casca do jogo para abrir depressa; os dados vêm sempre do servidor.
const V = 'crime-2';
const SHELL = ['/', '/css/app.css', '/js/app.js', '/js/i18n.js', '/js/ui.js', '/js/fx.js',
  '/fonts/big-shoulders-display-latin-900-normal.woff2', '/fonts/big-shoulders-display-latin-800-normal.woff2', '/fonts/inter-latin-wght-normal.woff2'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/') || u.pathname.startsWith('/_e')) return;
  // rede primeiro (para apanhar versões novas), cópia guardada se não houver rede
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok) { const cp = r.clone(); caches.open(V).then((c) => c.put(e.request, cp)); }
    return r;
  }).catch(() => caches.match(e.request).then((m) => m || caches.match('/'))));
});
