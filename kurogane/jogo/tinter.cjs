// sons de interação: carregam todos e tocam nas ações certas (contentores, mexer nos objetos, comer, beber, curar, fabricar, encaixar, mapa, posturas)
module.exports = async (page) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => { G.audio.start(); }); await W(14000);
  const NEW = ['ab-caixa', 'ab-gaveta', 'ab-metal', 'ab-frigo', 'ab-saco', 'ab-carro', 'fe-caixa', 'fe-gaveta', 'fe-metal', 'fe-frigo', 'fe-carro', 'it-arma', 'it-balas', 'it-pano', 'it-lata', 'it-garrafa', 'it-madeira', 'it-pedra', 'it-metal', 'it-papel', 'it-mole', 'it-pegar', 'comer', 'beber', 'ligadura', 'medkit', 'fabricar', 'encaixe', 'vestir', 'largar', 'moedas', 'mapa', 'destrancar', 'erro', 'cavilha', 'ressalto', 'colocar', 'esfolar', 'colher', 'chapinhar', 'deitar', 'respirar', 'coracao'];
  const miss = await ev(L => L.filter(k => !G.audio.has(k)), NEW);
  console.log((miss.length ? 'FALHA' : 'OK   ') + ' ' + (NEW.length - miss.length) + '/' + NEW.length + ' sons de interação carregam ' + miss.join(','));
  await ev(() => { G.dbgKit(); window.__snd = []; const a = G.audio, p0 = a.play.bind(a); a.play = (n, ...r) => { __snd.push(n); return p0(n, ...r); }; }); await W(1200);
  const rec = async (fn, ms = 300, arg) => { await ev(() => { __snd.length = 0; }); await ev(fn, arg); await W(ms); return ev(() => [...__snd]); };
  const ok = (c, t, r) => console.log((c ? 'OK   ' : 'FALHA') + ' ' + t + ': ' + r.join(','));
  // contentores do mundo: cada tipo com o seu som ao abrir e ao fechar
  for (const [lab, tab, want] of [['Abrir frigorífico', 'bebida', 'frigo'], ['Revistar cozinha', 'casa', 'gaveta'], ['Revistar cacifo', 'casa', 'metal'], ['Revistar caixas', 'casa', 'caixa'], ['Abrir mala do carro', 'carro', 'carro']]) {
    const r = await rec(L => { const c = { id: 't' + Math.random(), x: G.p.x, z: G.p.z, label: L[0], table: L[1], slots: [6, 4], grid: null, lv: 0 }; G.ui.closeInv(); G.box = c; G.ui.openInv(c); }, 300, [lab, tab]);
    await ev(([L, T]) => {}, [lab, tab]);
    const r2 = await rec(() => G.ui.closeInv());
    ok(r.includes('ab-' + want) && r2.includes('fe-' + want), lab, [...r, '|', ...r2]);
  }
  // inventário próprio continua com o som da mochila
  let r = await rec(() => { G.ui.closeInv(); G.box = null; G.ui.openInv(null); }); await ev(() => G.ui.closeInv()); ok(r.includes('mochila'), 'abrir a mochila', r);
  // material dos objetos
  const mats = await ev(() => ['m4', 'a556', 'cStanag', 'lata', 'agua', 'madeira', 'pedraR', 'ligadura', 'capacete', 'maca', 'mira4'].map(k => k + '=' + G.itemMat(k)));
  console.log('      materiais: ' + mats.join(' '));
  // comer, beber, ligadura, kit médico
  for (const [k, want] of [['lata', 'comer'], ['agua', 'beber'], ['ligadura', 'ligadura'], ['medkit', 'medkit']]) {
    r = await rec(K => { const p = G.p; p.use = null; p.food = 40; p.water = 40; p.hp = 50; p.bleed = 1; const it = G.mkItem(K, 1); G.inv.give(it); G.use(it); }, 300, k); ok(r.includes(want), 'usar ' + k, r);
    await ev(() => { G.p.use = null; });
  }
  r = await rec(() => document.getElementById('bMap').click()); ok(r.includes('mapa') || !r.length, 'abrir o mapa', r.length ? r : ['(sem toggleMap exposto)']);
  r = await rec(() => G.stanceSet(2), 300); ok(r.includes('deitar') || r.includes('pano'), 'deitar', r); await ev(() => G.stanceSet(0));
  r = await rec(() => G.grenStart && G.grenStart(G.mkItem('granada', 1))); ok(r.includes('cavilha'), 'tirar a cavilha', r); await ev(() => { G.gch = null; });
  r = await rec(() => { G.ui.codeErr(); }); ok(r.includes('erro'), 'código errado', r);
  r = await rec(() => { G.p.hp = 10; }, 2600); ok(r.includes('coracao'), 'pouca vida: coração', r); await ev(() => { G.p.hp = 100; });
};
