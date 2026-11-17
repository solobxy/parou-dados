// Guarda a casca do jogo para abrir depressa; os dados vêm sempre do servidor.
const V = 'crime-88';
// Imagens: guardadas à parte e de vez (não se apagam quando sai uma versão nova do jogo). Cada endereço leva o número da versão da imagem (?N).
const IMGS = 'crime-img-1';
const SHELL = ['/', '/css/app.css', '/js/app.js', '/js/i18n.js', '/js/ui.js', '/js/fx.js', '/js/reveal.js', '/js/crazy.js', '/js/casino3d.js', '/js/globo.js', '/js/terra.js', '/js/tarefas.js', '/js/prisao.js',
  '/fonts/archivo-latin-wdth-normal.woff2', '/fonts/newsreader-latin-normal.woff2'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V && k !== IMGS).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
// imagem: a cópia guardada sai logo; por trás, uma vez por sessão, confirma-se com o servidor (que responde da memória do browser se ainda estiver fresca)
const vistas = new Set();
async function guardaImagem(c, req, r) {
  await c.put(req, r);
  // versões antigas da mesma imagem (?N diferente) deixam de fazer falta
  const iguais = await c.keys(req, { ignoreSearch: true });
  await Promise.all(iguais.filter((k) => k.url !== req.url).map((k) => c.delete(k)));
}
async function imagem(req) {
  const c = await caches.open(IMGS), tem = await c.match(req);
  if (tem) {
    if (!vistas.has(req.url)) { vistas.add(req.url); fetch(req).then((r) => (r.ok ? guardaImagem(c, req, r) : null)).catch(() => {}); }
    return tem;
  }
  const r = await fetch(req);
  if (r.ok) { vistas.add(req.url); guardaImagem(c, req, r.clone()).catch(() => {}); }
  return r;
}
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/') || u.pathname.startsWith('/_e') || u.pathname.startsWith('/audio/')) return;
  if (u.pathname.startsWith('/img/')) { e.respondWith(imagem(e.request).catch(() => Response.error())); return; }
  // rede primeiro (para apanhar versões novas), cópia guardada se não houver rede
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok) { const cp = r.clone(); caches.open(V).then((c) => c.put(e.request, cp)); }
    return r;
  }).catch(() => caches.match(e.request).then((m) => m || caches.match('/'))));
});
