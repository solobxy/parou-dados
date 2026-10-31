// tapmoss: funciona sem rede. A página vem da rede quando há (para apanhar versões novas), senão da cache.
const V='tapmoss-3';
const CORE=['/','/manifest.json','/icon-192.png','/icon-512.png','/icon-maskable.png','/apple-touch-icon.png','/favicon.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const r=e.request;if(r.method!=='GET')return;
  const u=new URL(r.url);if(u.origin!==location.origin||u.pathname.startsWith('/_e'))return;
  if(r.mode==='navigate'||u.pathname==='/'||u.pathname==='/index.html'){
    e.respondWith(Promise.race([fetch(r),new Promise((_,no)=>setTimeout(()=>no(new Error('lento')),4000))])
      .then(res=>{if(res.ok){const c=res.clone();caches.open(V).then(ca=>ca.put('/',c))}return res})
      .catch(()=>caches.match('/').then(m=>m||fetch(r))));
    return;
  }
  e.respondWith(caches.match(r).then(m=>m||fetch(r).then(res=>{if(res.ok){const c=res.clone();caches.open(V).then(ca=>ca.put(r,c))}return res})));
});
