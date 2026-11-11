/* caiu.pt — só para as notificações de preços (não guarda páginas em cache) */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch (x) { m = { title: 'caiu.pt', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(m.title || 'caiu.pt', {
    body: m.body || '',
    icon: '/icone-192.png',
    badge: '/icone-192.png',
    tag: m.tag || 'caiu',
    renotify: true,
    lang: 'pt-PT',
    data: { url: m.url || '/' }
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href;
  e.waitUntil((async () => {
    const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const j of janelas) {
      if (new URL(j.url).origin === self.location.origin) { await j.focus(); return j.navigate(url); }
    }
    return self.clients.openWindow(url);
  })());
});
