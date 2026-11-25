// O jogo como app (ícone no ecrã, sem barra do browser) e o alarme de raid no telemóvel (notificações push).
export function initPWA(G) {
  let reg = null, bip = null;
  let top = true; try { top = window.top === window; } catch (e) { top = false; } // dentro de outra página (pré-visualização) não se instala
  const site = top && location.protocol === 'https:';
  if (site && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').then(r => { reg = r; }).catch(() => { });
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); bip = e; });
  addEventListener('appinstalled', () => { bip = null; G.ui && G.ui.toast('Kurogane instalado: abre-o pelo ícone'); });
  const key = s => { const p = '='.repeat((4 - s.length % 4) % 4), b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...b].map(c => c.charCodeAt(0))); };
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const P = {
    installed: () => matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true,
    canInstall: () => !!bip, ios,
    install: async () => { if (!bip) return false; bip.prompt(); const r = await bip.userChoice.catch(() => ({})); bip = null; return r.outcome === 'accepted'; },
    // o iPhone só deixa avisos com o jogo instalado no ecrã principal
    pushOk: () => !!(reg && 'PushManager' in window && 'Notification' in window),
    pushOn: () => { try { return localStorage.getItem('kg.push') === '1' && Notification.permission === 'granted'; } catch (e) { return false; } },
    enablePush: async () => {
      if (!P.pushOk()) return ios && !P.installed() ? 'ios' : 'nao';
      if (!G.net || !G.net.on || !G.net.vapid) return 'offline';
      const perm = await Notification.requestPermission(); if (perm !== 'granted') return 'negado';
      let sub = await reg.pushManager.getSubscription(); if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key(G.net.vapid) });
      G.net.raw({ t: 'psub', sub: sub.toJSON() }); try { localStorage.setItem('kg.push', '1'); } catch (e) { } return 'ok';
    },
    disablePush: async () => { try { localStorage.removeItem('kg.push'); } catch (e) { } const sub = reg && await reg.pushManager.getSubscription(); if (sub) { if (G.net && G.net.on) G.net.raw({ t: 'punsub', endpoint: sub.endpoint }); await sub.unsubscribe().catch(() => { }); } },
  };
  // ao ligar ao servidor: volta a dizer onde avisar (o servidor pode ter perdido; não manda aviso de teste)
  G.pushResub = () => { if (!P.pushOn() || !reg) return; setTimeout(() => reg.pushManager.getSubscription().then(sub => { if (sub && G.net && G.net.on) G.net.raw({ t: 'psub', sub: sub.toJSON(), q: 1 }); }).catch(() => { }), 1500); };
  G.pwa = P; return P;
}
