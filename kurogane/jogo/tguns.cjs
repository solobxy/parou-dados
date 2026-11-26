// armas novas: ícones no inventário, na mão (de perto) e na primeira pessoa
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms), fs = require('fs');
  const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 300)));
  await ev(() => G.dbgKit()); await W(1500);
  await ev(() => { for (const k of ['ak', 'smg', 'revolver', 'caca', 'cacadeira']) G.inv.bag.insert(G.mkItem(k), G.inv.rows()); G.ui.refresh(true); G.ui.openInv(null); }); await W(1200); await shot('inv-armas');
  await ev(() => G.ui.closeInv()); await W(300);
  const cam = async (nm) => { const u = await ev(() => { const p = G.p; return G.dbgCam([p.x + 1.3, p.y + 1.6, p.z + 0.9], [p.x, p.y + 1.15, p.z + 0.3], 40, 640, 480); }); fs.writeFileSync(__dirname + '/shots/' + nm + '.jpg', Buffer.from(u.split(',')[1], 'base64')); };
  for (const [i, k] of [[0, 'm4'], [2, 'pistola']]) { await ev(i => { G.select(i); G.p.yaw = G.p.root = 0; }, i); await W(900); await cam('mao-' + k); }
  for (const k of ['ak', 'cacadeira']) { await ev(k => { const e = G.inv.bag.list.find(e => e.it.k === k); if (!e) return; G.inv.bag.remove(e.it); G.inv.belt[5] = e.it; G.select(5); }, k); await W(900); await cam('mao-' + k); }
  await ev(() => { G.select(0); G.aimStart(true); }); await W(2500); await shot('fp-m4');
  console.log('erros:', errs.length ? errs : 'nenhum');
};
