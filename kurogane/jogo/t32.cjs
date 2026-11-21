// perfis: nome ao jogar, gravação de personagem e mundo (sacos, caixas, andar de cima), continuar; música do menu
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await W(3000); await shot('h0-menu-sem-perfil');
  await page.click('#sPlay'); await W(600); await shot('h1-pede-nome');
  await page.fill('#pfN', 'Dinis'); await page.click('#pfOk'); await W(2500);
  console.log('a jogar como', await ev(() => [G.playing, JSON.parse(localStorage.getItem('kg.perfis')).lista.map(p => p.nome).join(',')]));
  // estado: subir ao 1.º piso dos Apartamentos, abrir uma caixa e tirar uma coisa, largar um saco no chão
  const before = await ev(() => { const C = G.W.cuts.find(c => c.name === 'Apartamentos'); const p = G.p; p.lv = 1; p.bld = C; p.base = C.fh; p.y = C.fh; p.x = -24; p.z = -36; let b = null; for (const c of G.W.containers) if ((c.lv || 0) === 1 && Math.hypot(c.x - p.x, c.z - p.z) < 12) { b = c; break; } G.prompt = b; G.interact(); const n0 = b.grid.list.length; const e = b.grid.list[0]; if (e) { b.grid.remove(e.it); G.inv.give(e.it); } G.ui.closeInv(); G.sel = 1; G.gain('madeira', 30); G.save(); return { cont: G.W.containers.indexOf(b), left: b.grid.list.length, n0, x: p.x, lv: p.lv, inv: G.inv.count('madeira') }; });
  console.log('antes', JSON.stringify(before));
  await page.reload(); await page.waitForFunction('window.__ready === true'); await W(3500); await shot('h2-menu-com-perfil');
  await page.click('#sCont'); await W(2500);
  const after = await ev((ci) => { const c = G.W.containers[ci]; return { left: c.grid ? c.grid.list.length : null, x: +G.p.x.toFixed(1), lv: G.p.lv, bld: G.p.bld && G.p.bld.name, sel: G.sel, inv: G.inv.count('madeira'), zs: G.zs.length }; }, before.cont);
  console.log('depois', JSON.stringify(after));
  console.log('música', await ev(() => { const a = [...document.querySelectorAll('audio')]; return !document.getElementById('sMus').hidden; }));
  // conta sem rede (aqui não há saída para o Supabase): tem de mostrar o erro com calma
  await ev(() => G.toMenu()); await W(800); await page.click('#pfC'); await W(400); await page.fill('#pfP', 'segredo123'); await page.click('#pfOk'); await W(4000); await shot('h3-conta-sem-rede');
  console.log('mensagem', await ev(() => document.getElementById('pfM').textContent));
};
