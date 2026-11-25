// Kurogane: avisos no telemóvel (alarme de raid) mesmo com o jogo fechado. Não guarda nada em cache: o jogo vem sempre da versão mais recente.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Kurogane', { body: d.body || '', tag: d.tag || 'kg', renotify: true, icon: 'icon-192.png', badge: 'badge-96.png', vibrate: [300, 120, 300, 120, 600], requireInteraction: d.tag === 'raid' }));
});
self.addEventListener('notificationclick', e => { e.notification.close(); e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(L => { for (const c of L) if ('focus' in c) return c.focus(); return self.clients.openWindow('./'); })); });
