module.exports = async (page, shot, mode) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await W(600); await page.click('#sPlay'); await W(600);
  // equipar pelo menu de ações e ver no corpo
  await ev(() => { for (const k of ['capacete', 'colete', 'mochila', 'pistola']) G.gain(k, 1); G.gain('a9', 24); const p = G.p; p.x = -20; p.z = 1.5; G.camT.set(p.x, 0, p.z); G.zs.length = 0; });
  await ev(() => G.ui.openInv(null)); await W(300);
  for (const k of ['capacete', 'colete', 'mochila']) {
    await ev(k => { const e = G.inv.bag.list.find(e => e.it.k === k); const el = document.querySelector(`[data-src="bag:${e.it.id}"]`); const r = el.getBoundingClientRect(); for (const t of ['pointerdown', 'pointerup']) el.dispatchEvent(new PointerEvent(t, { bubbles: true, clientX: r.x + 5, clientY: r.y + 5, pointerId: 3 })); }, k);
    await W(150);
    const btns = await ev(() => [...document.querySelectorAll('#iAct button')].map(b => b.textContent));
    console.log(k, 'acts', btns.join('|'));
    await page.click('#iAct button:has-text("Equipar")'); await W(200);
  }
  console.log('eq', await ev(() => Object.entries(G.inv.eq).map(([k, v]) => k + '=' + (v && v.k)).join(' ')), 'rows', await ev(() => G.inv.rows()));
  await shot('20-equipado-inv');
  await ev(() => G.ui.closeInv());
  // pistola: recarregar
  await ev(() => { const i = G.inv.belt.findIndex(b => b && b.k === 'pistola'); G.select(i); G.reload(); }); await W(2500);
  console.log('pistol ammo', await ev(() => G.inv.belt[G.sel].ammo), 'a9 left', await ev(() => G.inv.count('a9')));
  await shot('21-pistola');
  // zombie ataca
  await ev(() => { const p = G.p; G.zs.push({ x: p.x + 1.0, z: p.z, yaw: -Math.PI / 2, hp: 100, state: 'chase', tx: p.x, tz: p.z, think: 0, phase: 0, mv: 0, atkT: 0, atkCd: 0, lost: 0, stuck: 0, det: 0, detDir: 1, deadT: 0, sink: 0, groan: 3, sc: 1, wT: 0 }); });
  await W(3000);
  console.log('hp after zombie', await ev(() => Math.round(G.p.hp)), 'bleed', await ev(() => G.p.bleed));
  await shot('22-ataque');
  // guardar e voltar
  await ev(() => { window.dispatchEvent(new Event('pagehide')); });
  console.log('save', await ev(() => (localStorage.getItem('kurogane-save-v1') || '').slice(0, 80)));
  // morte e renascer
  await ev(() => { G.p.hp = 0.5; G.p.bleed = 1; G.zs.length = 0; }); await W(7000);
  console.log('dead overlay', await ev(() => !document.getElementById('dead').hidden), await ev(() => document.getElementById('dCause').textContent + ' / ' + document.getElementById('dStat').textContent));
  await shot('23-morte');
  await page.click('#dGo'); await W(800);
  console.log('respawn', await ev(() => [Math.round(G.p.x), Math.round(G.p.z), G.p.alive, G.inv.belt.map(b => b ? b.k : '-').join(',')].join(' ')), 'bags', await ev(() => G.bags.length));
  await page.reload(); await page.waitForFunction('window.__ready === true'); await W(500);
  console.log('continue btn', await ev(() => !document.getElementById('sCont').hidden));
};
