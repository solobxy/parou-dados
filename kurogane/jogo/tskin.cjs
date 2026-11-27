// skins das armas: ecrã, trancadas por nível, arma na mão (1.ª pessoa e corpo) e retrato com a skin
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms), errs = [];
  page.on('console', m => { if (/Shader Error|ERROR: 0:|THREE\.WebGLProgram/.test(m.text())) errs.push(m.text().slice(0, 400)); });
  const r0 = await ev(() => { G.setLv(1); G.setSkin('ak', 5); return G.skinFor('ak'); }); console.log((r0 === 0 ? 'OK   ' : 'FALHA') + ' nível 1: Tigre (nível 10) não se usa (' + r0 + ')');
  await ev(() => { G.setLv(12); G.showMenu(); G.ui_skins(); }); await W(1500);
  const info = await ev(() => ({ tiles: document.querySelectorAll('.sk-t').length, lock: document.querySelectorAll('.sk-t.lock').length, on: (document.querySelector('.sk-t.on b') || {}).textContent, imgs: [...document.querySelectorAll('.sk-t img')].map(i => i.src.length) }));
  console.log(JSON.stringify(info)); console.log((info.tiles === 8 && info.lock === 2 && info.on === 'Tigre' ? 'OK   ' : 'FALHA') + ' 8 skins, 2 trancadas no nível 12, Tigre em uso');
  console.log((new Set(info.imgs).size >= 7 ? 'OK   ' : 'FALHA') + ' cada skin tem a sua imagem');
  await shot('skins');
  await ev(() => document.querySelector('.sk-t[data-s="7"]').click()); await W(300);
  console.log((await ev(() => G.skinFor('ak') === 5) ? 'OK   ' : 'FALHA') + ' tocar no Ouro trancado não muda');
  await ev(() => document.querySelector('.sk-t[data-s="2"]').click()); await W(600);
  console.log((await ev(() => G.skinFor('ak') === 2) ? 'OK   ' : 'FALHA') + ' escolher Deserto');
  await ev(() => document.querySelector('[data-g="m4"]').click()); await W(800); await shot('skins-m4');
  await ev(() => { G.setLv(20); G.setSkin('ak', 7); document.getElementById('pfX').click(); }); await W(300);
  const u = await ev(() => G.dbgPortrait({ gun: 'ak', skin: 7, raise: 1, ry: -0.6 }, 900, 1000));
  await ev(u => { const i = document.createElement('img'); i.src = u; i.id = 'pv'; i.style.cssText = 'position:fixed;inset:0;margin:auto;height:100%;z-index:99999;background:#3a4048'; document.body.appendChild(i); }, u); await W(500); await shot('skin-retrato'); await ev(() => document.getElementById('pv').remove());
  await ev(() => G.dbgKit()); await W(800);
  await ev(() => { G.setSkin('ak', 5); const it = G.inv.belt[0]; it.k = 'ak'; it.att = {}; delete it.sk; G.select(1); G.select(0); const p = G.p; p.x = 60; p.z = 1.5; p.yaw = p.root = 2.2; G.aimS.fy = 2.2; G.aimS.fpit = 0.05; }); await W(2500); await shot('skin-fp');
  const fp = await ev(() => G.inv.belt[0].sk); console.log((fp === 5 ? 'OK   ' : 'FALHA') + ' AK nova na mão leva a Tigre (' + fp + ')');
  await ev(() => { G.ui.openInv && G.ui.openInv(); }); await W(1200); await shot('skin-inv');
  const ic = await ev(() => { const im = [...document.querySelectorAll('#hud img, .bs img')].map(i => i.src); return im.some(u => u === G.itemIcon(G.inv.belt[0])) && G.itemIcon(G.inv.belt[0]) !== G.ICONS.ak; }); console.log((ic ? 'OK   ' : 'FALHA') + ' o ícone da AK no cinto mostra a skin');
  console.log((errs.length ? 'FALHA' : 'OK   ') + ' shaders sem erros ' + errs.join(' | '));
};
