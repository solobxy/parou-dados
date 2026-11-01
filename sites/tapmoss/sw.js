// tapmoss: funciona sem rede. As páginas vêm da rede quando há (para apanhar versões novas), senão da cache.
// version.json fica sempre fora da cache: é por ele que o jogo sabe que há versão nova.
// Cada página (o jogo em cada língua, os guias) guarda-se com o seu próprio endereço.
const V='tapmoss-7';
const CORE=['/','/manifest.json','/icon-192.png','/icon-512.png','/icon-maskable.png','/apple-touch-icon.png','/favicon.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
const pageKey=u=>{let p=u.pathname.replace(/index\.html$/,'');if(!p.endsWith('/'))p+='/';return p};
self.addEventListener('fetch',e=>{
  const r=e.request;if(r.method!=='GET')return;
  const u=new URL(r.url);if(u.origin!==location.origin||u.pathname.startsWith('/_e')||u.pathname.startsWith('/api/')||u.pathname==='/version.json')return;
  if(r.mode==='navigate'){
    const k=pageKey(u);
    e.respondWith(Promise.race([fetch(r),new Promise((_,no)=>setTimeout(()=>no(new Error('lento')),4000))])
      .then(res=>{if(res.ok&&!res.redirected){const c=res.clone();caches.open(V).then(ca=>ca.put(k,c))}return res})
      .catch(()=>caches.match(k).then(m=>m||caches.match('/')).then(m=>m||fetch(r))));
    return;
  }
  e.respondWith(caches.match(r).then(m=>m||fetch(r).then(res=>{if(res.ok&&!u.pathname.endsWith('.xml')&&!u.pathname.endsWith('.txt')){const c=res.clone();caches.open(V).then(ca=>ca.put(r,c))}return res})));
});
