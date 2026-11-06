// tapmoss: funciona sem rede. As páginas vêm da rede quando há (para apanhar versões novas), senão da cache.
// version.json fica sempre fora da cache: é por ele que o jogo sabe que há versão nova.
// Cada página (o jogo em cada língua, os guias) guarda-se com o seu próprio endereço.
// A versão nova descarrega-se enquanto se joga e fica em NEXT; ao recarregar, sai daí sem esperar pela rede.
const V='tapmoss-130',NEXT='tapmoss-next';
const CORE=['/','/manifest.json','/tapmoss-192.png','/tapmoss-512.png','/tapmoss-maskable.png','/tapmoss-180.png','/tapmoss-64.png','/badge-96.png'];
// the pages already kept by the previous version come along, so an update does not download the whole game again just to have it offline
self.addEventListener('install',e=>{e.waitUntil((async()=>{const c=await caches.open(V);let pages=0;
  for(const k of await caches.keys()){if(k===V||k===NEXT||!k.startsWith('tapmoss-'))continue;const o=await caches.open(k);
    for(const q of await o.keys()){const u=new URL(q.url);if(u.search||!u.pathname.endsWith('/'))continue;const m=await o.match(q);if(m){await c.put(q,m);pages++}}}
  await c.addAll(pages?CORE.filter(x=>x!=='/'):CORE);await self.skipWaiting()})())});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V&&k!==NEXT).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
const pageKey=u=>{let p=u.pathname.replace(/index\.html$/,'');if(!p.endsWith('/'))p+='/';return p};
self.addEventListener('fetch',e=>{
  const r=e.request;if(r.method!=='GET')return;
  const u=new URL(r.url);if(u.origin!==location.origin||u.pathname.startsWith('/_e')||u.pathname.startsWith('/api/')||u.pathname==='/version.json'||u.pathname.endsWith('.apk')||u.pathname==='/android.json'||u.searchParams.has('pre'))return;
  if(r.mode==='navigate'){
    // the network copy is always saved when it arrives, even if it came too late to be shown this time;
    // an update (?v=) never falls back to the old copy unless there is no network at all
    const k=pageKey(u),vv=u.searchParams.get('v');
    const fromNet=()=>{const net=fetch(r).then(res=>{if(res.ok&&!res.redirected){const c=res.clone();e.waitUntil(caches.open(V).then(ca=>ca.put(k,c)))}return res});e.waitUntil(net.catch(()=>{}));return net};
    const old=()=>caches.match(k).then(m=>m||caches.match('/'));
    if(vv){
      // the game has usually downloaded the new version already, while it was being played: show it at once
      e.respondWith(caches.open(NEXT).then(c=>c.match(k+'?v='+vv).then(m=>{
        if(m){const a=m.clone();e.waitUntil(caches.open(V).then(ca=>ca.put(k,a)).then(()=>c.delete(k+'?v='+vv)).catch(()=>{}));return m}
        return fromNet().catch(()=>old().then(o=>o||Response.error()))})).catch(()=>fromNet()));
      return}
    const net=fromNet();
    e.respondWith(Promise.race([net,new Promise((_,no)=>setTimeout(()=>no(new Error('lento')),9000))]).catch(()=>old().then(m=>m||net)));
    return;
  }
  e.respondWith(caches.match(r).then(m=>m||fetch(r).then(res=>{if(res.ok&&!u.pathname.endsWith('.xml')&&!u.pathname.endsWith('.txt')){const c=res.clone();caches.open(V).then(ca=>ca.put(r,c))}return res})));
});
// avisos com o jogo fechado: o servidor manda só título, texto, etiqueta e a página de cada língua
// the server sends title, text, a tag, the page of each language, and maybe a picture (only ours) and the label of a button
const TAGS=['tm-diario','tm-amigos','tm-moedas','tm-ovo','tm-pet','tm-novidade','tm-online','tm-passou','tm-medalha','tm-volta','tm-manha','tm-ritmo'];
self.addEventListener('push',e=>{let d={};try{d=e.data?e.data.json():{}}catch(x){}
  const url=typeof d.url==='string'&&/^\/([a-z]{2}\/)?(\?av=[0-9a-f]{24})?$/.test(d.url)?d.url:'/',tag=TAGS.includes(d.tag)?d.tag:'tm-amigos';
  const o={body:String(d.body||'').slice(0,200),tag,renotify:true,icon:'/tapmoss-192.png',badge:'/badge-96.png',data:{url},vibrate:[60,40,60]};
  if(typeof d.image==='string'&&/^\/img\/n\/[a-z]{2,12}\.png$/.test(d.image))o.image=d.image;
  if(typeof d.action==='string'&&d.action)o.actions=[{action:'abrir',title:d.action.slice(0,30)}];
  e.waitUntil(self.registration.showNotification(String(d.title||'tapmoss').slice(0,60),o))});
// opening through the notification: the one-use code in the link goes to the game (a present, or straight to the friend)
// if the game is already open it gets the code by message, otherwise it opens with the code in the address
self.addEventListener('notificationclick',e=>{e.notification.close();const url=(e.notification.data&&e.notification.data.url)||'/',m=/[?&]av=([0-9a-f]{24})/.exec(url),av=m?m[1]:'';
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{for(const c of cs){if(new URL(c.url).origin===location.origin&&'focus'in c){if(av)try{c.postMessage({tm:'aviso',av})}catch(x){}return c.focus()}}return self.clients.openWindow(url)}))});

// the browser can renew the subscription while the game is closed: hand the new one to the server under the old address,
// so the player keeps getting notices without having to open the game first
self.addEventListener('pushsubscriptionchange',e=>{e.waitUntil((async()=>{const old=e.oldSubscription;if(!old||!old.endpoint)return;
  let sub=e.newSubscription;if(!sub){const k=old.options&&old.options.applicationServerKey;if(!k)return;sub=await self.registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:k})}
  const j=sub.toJSON(),ks=j.keys||{};await fetch('/api/tm_avisos_trocar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_antigo:old.endpoint,p_sub:{endpoint:j.endpoint,p256dh:ks.p256dh,auth:ks.auth}})})})().catch(()=>{}))});
