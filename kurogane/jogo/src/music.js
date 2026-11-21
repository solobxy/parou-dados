// Música: menu, fundo em jogo (baixinho) e perigo, com fades.
// O volume passa por um GainNode porque no iOS o volume dos <audio> é só de leitura.
export function makeMusic(getCtx) {
  const T = {}; let ctx = null, hidden = false;
  const add = (k, src, base, fin, fout) => {
    const el = new Audio(); el.preload = 'none'; el.loop = true; el.src = src;
    const t = T[k] = { k, el, base, fin, fout, lv: 0, want: 0, ok: true, g: null, stopAt: -1e9 };
    el.addEventListener('error', () => { t.ok = false; }); return t;
  };
  const wire = t => {
    if (t.g) return; if (!ctx) ctx = getCtx(); if (!ctx) return;
    try { const s = ctx.createMediaElementSource(t.el); t.g = ctx.createGain(); t.g.gain.value = 0; s.connect(t.g); t.g.connect(ctx.destination); t.el.volume = 1; } catch (e) { t.g = null; }
  };
  const play = t => { if (!t.ok || hidden) return; wire(t); if (t.el.paused) t.el.play().catch(() => { }); };
  const M = {
    T, add,
    // tocar e pausar logo dentro de um gesto: no iOS só assim a faixa pode começar mais tarde sozinha
    prime(keys) { for (const k of keys) { const t = T[k]; if (!t || !t.ok || !t.el.paused) continue; wire(t); if (!t.g) t.el.volume = 0; const pr = t.el.play(); if (pr && pr.then) pr.then(() => { if (t.want === 0 && t.lv <= 0.001) t.el.pause(); }).catch(() => { }); } },
    // nível pedido de cada faixa (0 ou 1); o volume final vem de vol(k)
    set(k, w) { const t = T[k]; if (!t) return; t.want = w; if (w > 0) play(t); },
    only(keys) { for (const k in T) M.set(k, keys.includes(k) ? 1 : 0); },
    ok: k => !!(T[k] && T[k].ok),
    playing: k => !!(T[k] && T[k].lv > 0.02),
    // recomeça do início se esteve parada muito tempo
    rewindIfStale(k, sec) { const t = T[k]; if (t && t.lv < 0.01 && performance.now() - t.stopAt > sec * 1000) try { t.el.currentTime = 0; } catch (e) { } },
    tick(dt, vol) {
      for (const k in T) {
        const t = T[k]; const up = t.want > t.lv;
        t.lv = up ? Math.min(t.want, t.lv + dt / t.fin) : Math.max(t.want, t.lv - dt / t.fout);
        const g = t.lv * t.lv * t.base * vol(k);
        if (t.g) { if (Math.abs(t.g.gain.value - g) > 1e-4) t.g.gain.value = g; } else t.el.volume = Math.min(1, g);
        if (t.lv <= 0.001 && t.want === 0 && !t.el.paused) { t.el.pause(); t.stopAt = performance.now(); }
      }
    },
    // separador escondido: pausa tudo e retoma o que estava a tocar
    hide(h) { hidden = h; for (const k in T) { const t = T[k]; if (h) { if (!t.el.paused) t.el.pause(); } else if (t.want > 0 || t.lv > 0.001) play(t); } },
  };
  return M;
}
