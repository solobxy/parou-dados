// webase — service worker da app: só serve para «Ligar no telemóvel».
// O servidor acorda o telemóvel com um aviso vazio; aqui vamos buscar o pedido com a sessão de quem está no telemóvel
// e mostramos «Ligar a …». Tocar na notificação abre a página do pedido, com o botão para ligar.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

function formatar(n) {
  const s = String(n || '').replace(/\s/g, '');
  if (/^\d{9}$/.test(s)) return s.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3');
  return s;
}

self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    let p = null;
    let sessao = true;
    try {
      const r = await fetch('/api/ligar/pendente', { credentials: 'same-origin', cache: 'no-store' });
      if (r.status === 401) sessao = false;
      else if (r.ok) p = (await r.json()).pedido;
    } catch (_) { /* sem rede: mostra o aviso genérico */ }
    const base = { icon: '/img/icone-192.png', badge: '/img/icone-aviso.png', tag: 'wb-ligar', renotify: true, lang: 'pt-PT' };
    if (p && p.teste) {
      return self.registration.showNotification('webase: está tudo pronto', { ...base,
        body: 'Quando clicares em «Ligar» no computador, o aviso aparece assim.', data: { url: '/app/ligar/' + p.id } });
    }
    if (p) {
      return self.registration.showNotification('Ligar a ' + (p.nome || formatar(p.numero)), { ...base,
        body: (p.nome ? formatar(p.numero) + ' · ' : '') + 'Toca para ligar do teu telemóvel.', requireInteraction: true,
        vibrate: [120, 60, 120], data: { url: '/app/ligar/' + p.id } });
    }
    return self.registration.showNotification('webase', { ...base,
      body: sessao ? 'O pedido para ligar já não está ativo.' : 'Entra na webase neste telemóvel para ver o pedido.',
      data: { url: sessao ? '/app/ligar' : '/app/entrar' } });
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/app/ligar';
  e.waitUntil((async () => {
    const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of janelas) {
      if (new URL(w.url).pathname.startsWith('/app') && 'focus' in w) {
        try { await w.navigate(url); } catch (_) { /* janela de outro tipo */ }
        return w.focus();
      }
    }
    return self.clients.openWindow(url);
  })());
});
