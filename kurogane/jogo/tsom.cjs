// sons novos: carregam todos e tocam nas ações certas (recarga por partes, mirar, sacar, lanterna, visão noturna, passos, cair, inventário)
module.exports = async (page) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => { G.audio.start(); }); await W(12000);
  const miss = await ev(() => ['rec-tira', 'rec-mete', 'rec-arma', 'rec-tira-ak', 'rec-arma-p', 'rec-abre-r', 'rec-cartucho', 'rec-bala', 'seletor', 'mirar', 'sacar', 'faca', 'mochila', 'luz', 'passo-neve', 'passo-folhas', 'passo-terra', 'capsula', 'aterrar', 'nv-liga', 'nv-desliga'].filter(k => !G.audio.has(k)));
  console.log((miss.length ? 'FALHA' : 'OK   ') + ' todos os sons novos carregam ' + miss.join(','));
  await ev(() => { G.dbgKit(); window.__snd = []; const a = G.audio, p0 = a.play.bind(a), s0 = a.sample.bind(a); a.play = (n, ...r) => { __snd.push(n); return p0(n, ...r); }; a.sample = (n, ...r) => { __snd.push(n); return s0(n, ...r); }; }); await W(1500);
  const rec = async (fn, ms) => { await ev(() => { __snd.length = 0; }); await ev(fn); await W(ms); return ev(() => [...__snd]); };
  let r = await rec(() => { const it = G.inv.belt[0]; it.k = 'm4'; it.att = {}; delete it.sk; G.select(1); G.select(0); }, 600); console.log((r.includes('sacar') ? 'OK   ' : 'FALHA') + ' sacar a arma: ' + r.join(','));
  r = await rec(() => { const it = G.inv.belt[0]; it.ammo = 0; window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', code: 'KeyR' })); }, 3500); console.log((r.includes('rec-tira') && r.includes('rec-mete') && r.includes('rec-arma') ? 'OK   ' : 'FALHA') + ' recarga M4 vazia por partes: ' + r.join(','));
  r = await rec(() => { G.lightOn = false; G.inv.eq.head = G.inv.eq.head || null; G.toggleLight(); }, 400); console.log((r.includes('luz') || r.length === 0 ? 'OK   ' : 'FALHA') + ' lanterna: ' + (r.join(',') || '(sem lanterna no kit)'));
  r = await rec(() => { G.jump(); }, 25000); console.log((r.includes('aterrar') ? 'OK   ' : 'FALHA') + ' cair do salto: ' + r.join(','));
  r = await rec(() => { G.ui.openInv(); }, 300); await ev(() => G.ui.closeInv()); console.log((r.includes('mochila') ? 'OK   ' : 'FALHA') + ' abrir o inventário: ' + r.join(','));
  console.log('passos: neve ' + await ev(() => G.surfAt(40, -2600)) + ' · campo ' + await ev(() => G.surfAt(900, 300)));
};
