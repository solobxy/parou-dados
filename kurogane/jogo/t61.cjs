// camas: pôr duas, mudar o nome, morrer, escolher no mapa, espera entre usos, remover
module.exports = async (page, shot, mode) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await page.click('#sPlay'); await W(2500);
  // vai para a floresta longe de zonas e põe uma cama e um saco-cama
  await ev(() => { const p = G.p; p.x = 1000; p.z = 600; p.yaw = 0; });
  const r = await ev(() => { const B = G.base, out = []; for (const [k, dx] of [['cama', 0], ['saco', 6]]) { G.p.x = 1000 + dx; G.p.z = 600; const it = { k, n: 1 }; out.push(B.deploy(it)); } return [out, B.beds().map(d => d.name)]; });
  console.log('postas:', JSON.stringify(r));
  await ev(() => { G.p.x = 1003; G.p.z = 598; }); await W(400);
  // mudar o nome pela interação
  await ev(() => { const d = G.base.beds()[0]; G.base.use(d.c); }); await W(300); await shot('cama-menu');
  await page.fill('#bdN', 'Casa do lago'); await page.click('#bdOk'); await W(300);
  console.log('nomes:', await ev(() => G.base.beds().map(d => d.name + ' | ' + d.c.label).join(' ; ')));
  // morrer longe e escolher
  await ev(() => { G.p.x = 1200; G.p.z = 750; G.dbg.hurt(500, 'zombie'); }); await W(2200); await shot('morte-camas');
  console.log('linhas:', await ev(() => [...document.querySelectorAll('.dbed')].map(e => e.textContent).join(' || ')));
  await page.click('.dbed .dgo[data-i="0"]'); await W(800);
  const p1 = await ev(() => [G.p.alive, Math.round(G.p.x), Math.round(G.p.z), document.getElementById('toast').textContent]); console.log('renasceu:', JSON.stringify(p1));
  // morrer outra vez: a cama usada está em espera; o saco-cama não
  await ev(() => { G.dbg.hurt(500, 'zombie'); }); await W(2200);
  console.log('linhas 2:', await ev(() => [...document.querySelectorAll('.dbed')].map(e => e.textContent + (e.classList.contains('wait') ? ' [espera]' : '')).join(' || ')));
  await page.click('.dbed .dgo[data-i="0"]', { force: true }); await W(400); console.log('cama em espera, continua morto:', await ev(() => !G.p.alive), '·', await ev(() => document.getElementById('toast').textContent));
  // remover o saco-cama (dois toques)
  await page.click('.dbed .dx[data-x="1"]'); await W(200); await page.click('.dbed .dx[data-x="1"]'); await W(300);
  console.log('camas depois de remover:', await ev(() => G.base.beds().map(d => d.name).join(',')));
  await shot('morte-camas-2');
  await page.click('#dGo'); await W(800); console.log('acordar noutro sítio:', await ev(() => G.p.alive));
};
