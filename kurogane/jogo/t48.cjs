const base = require('./t44.cjs');
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await base(page, async () => {});
  // paredes: madeira, pedra, metal contra C4 (rebentam no sítio da parede)
  console.log('C4 nas paredes:', await ev(() => { const out = []; const mk = tier => { const P = [...G.base.pieces.values()].find(q => q.t === 'parede'); return P; };
    const walls = [...G.base.pieces.values()].filter(q => q.t === 'parede' || q.t === 'janela'); const res = [];
    for (const [P, tier] of walls.map((P, i) => [P, [2, 1, 0][i % 3]])) { P.tier = tier; P.hp = [250, 600, 1200][tier]; const r = P.rects[0]; const x = (r.x0 + r.x1) / 2, z = (r.z0 + r.z1) / 2; let n = 0; while (G.base.pieces.has(P.k) && n < 6) { G.p.x = x + 30; G.explodeAt('c4', x, z); n++; } res.push(['madeira', 'pedra', 'metal'][tier] + ':' + n); }
    return res.join(' '); }));
  // granada contra zombies
  console.log('granada:', await ev(() => { const p = G.p; const zs = G.zs.filter(z => z.state !== 'dead').slice(0, 5); zs.forEach((z, i) => Object.assign(z, { x: p.x + 20 + i * 0.8, z: p.z + 1, hx: p.x + 20, hz: p.z, hp: z.hpMax || 80, lv: 0, state: 'wander', helm: 0, vest: 0 })); G.explodeAt('gran', p.x + 21.5, p.z + 1); return zs.map(z => z.state === 'dead' ? 'morto' : Math.round(z.hp)).join(','); }));
  // paiol: porta trancada; 3 C4
  console.log('paiol:', await ev(() => { const D = G.W.doors.find(D => D.lock); G.p.x = D.x; G.p.z = D.z + 1.2; G.p.lv = 0; const r = []; r.push('hp ' + D.lock.hp); for (let i = 0; i < 4 && D.lock.hp > 0; i++) { G.explodeAt('c4', D.x, D.z + 0.2); r.push(Math.round(D.lock.hp)); } return r.join(' → ') + ' aberta=' + D.target; }));
  await W(600);
  console.log('vida depois das explosões ao lado:', await ev(() => Math.round(G.p.hp) + ' vivo=' + G.p.alive));
};
