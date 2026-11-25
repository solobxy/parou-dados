// as zonas de acerto acompanham o desenho do zombie (cabeça, corpo, braços, pernas)
module.exports = async (page) => {
  const ev = (f, a) => page.evaluate(f, a);
  const WG = async sec => { const t0 = await ev(() => G.t); await page.waitForFunction(t => G.t >= t, t0 + sec, { timeout: 120000, polling: 50 }); };
  await ev(() => G.dbgKit()); await page.waitForTimeout(1000);
  await ev(() => { const p = G.p; for (const z of G.zs) z.x += 3000; const z = G.zs[0]; z.x = p.x + 0.3; z.z = p.z + 5; z.state = 'wander'; z.mv = 0; z.lv = 0; window.__z = z; });
  await WG(1);
  const res = await ev(() => { const z = window.__z, o = {}; const V = G.p.constructor; const M = z._pose || null; const hp = G.zHead ? G.zHead(z) : null; for (const [k, y] of [['cabeca', 1.8], ['peito', 1.3], ['pernas', 0.45]]) { const P = k === 'cabeca' && hp ? hp : { x: z.x, y, z: z.z }; const s = G.proj({ ...P, clone() { return { ...this }; }, isVector3: true }); o[k] = s && s.ok !== false ? G.dbg.pick(s.x, s.y) : 'sem ecrã'; } return o; });
  console.log(JSON.stringify(res));
};
