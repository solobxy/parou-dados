// granada: quem está colado morre (mesmo de colete); a 3 m fica muito ferido; a 5,5 m quase nada; a 8 m nada
module.exports = async (page) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  let fails = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALHA') + ' ' + m); if (!c) fails++; };
  await ev(() => G.dbgKit()); await W(1500);
  const r = [];
  for (const [d, vest] of [[0.6, 1], [1.2, 1], [3, 0], [3, 1], [5.5, 0], [8, 0]]) {
    const hp = await ev(([d, vest]) => { const p = G.p; p.alive = true; p.hp = 100; p.bleed = 0; G.inv.eq.vest = vest ? { k: 'colete' } : null; G.inv.eq.head = null; G.explodeAt('gran', p.x + d, p.z); const h = Math.round(p.hp); p.alive = true; p.hp = 100; return h; }, [d, vest]);
    r.push([d, vest, hp]); await W(300);
  }
  console.log(JSON.stringify(r));
  ok(r[0][2] <= 0 && r[1][2] <= 0, 'colada (0,6 e 1,2 m), mesmo de colete: morre');
  ok(r[2][2] > 0 && r[2][2] < 50, 'a 3 m sem colete: muito ferido (' + r[2][2] + ')');
  ok(r[4][2] > 60, 'a 5,5 m: ferimento leve (' + r[4][2] + ')'); ok(r[5][2] === 100, 'a 8 m: nada');
  console.log(fails ? fails + ' falhas' : 'tudo bem');
};
