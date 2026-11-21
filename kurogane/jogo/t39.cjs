module.exports = async (page) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await page.evaluate(() => G.dbgKit()); await W(1200);
  console.log('árvores em chão duro:', await ev(() => G.W ? G.W.trees.filter(t => G.W.paved(t.x, t.z)).length : 'sem G.W'));
  const run = o => ev(o => { const z = G.zs[0]; Object.assign(z, { x: 300, z: 300, state: 'wander', hp: o.hp, hpMax: o.hp, kind: 'mil', helm: 2, vest: o.vest, helm0: 2, vest0: o.vest, hd: 20, vd: o.vest >= 3 ? 50 : 25, limp: 0 });
    const log = []; let n = 0; while (z.state !== 'dead' && z.hp > 0 && n < 40) { const h0 = z.hp; G.dbg.hitZ(z, o.zone, o.k); n++; log.push(Math.round(h0 - z.hp) + (z.helm ? '' : 'H') + (z.vest ? '' : 'V')); }
    return o.k + ' ' + o.zone + ' colete ' + o.vest + ': ' + n + ' tiros (' + log.join(' ') + ')'; }, o);
  for (let rep = 0; rep < 3; rep++) for (const o of [{ k: 'a9', zone: 'body', vest: 3, hp: 70 }, { k: 'a9', zone: 'body', vest: 2, hp: 70 }, { k: 'a9', zone: 'body', vest: 2, hp: 75 }, { k: 'a9', zone: 'head', vest: 3, hp: 70 }, { k: 'a556', zone: 'body', vest: 3, hp: 70 }]) console.log(await run(o));
};
