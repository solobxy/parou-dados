// texturas nos adereços: de perto, caixote, bidão, caixote do lixo, máquina de bebidas, carro e banco
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  page.on('pageerror', e => console.log('PAGEERROR', String(e).slice(0, 300)));
  await ev(() => G.dbgKit()); await W(1200);
  const clean = () => ev(() => { const cv = G.dbgCanvas; for (const e of document.querySelectorAll('body *')) if (e !== cv && !e.contains(cv)) e.style.visibility = 'hidden'; });
  for (const k of (process.env.KG_PROPS || 'caixote,bidao,lixo,vend,carro,banco').split(',')) {
    const at = await ev(k => { const s = G.propStat[k]; return s && s.at[0]; }, k); if (!at) { console.log('sem', k); continue; }
    const d = k === 'carro' ? 4.2 : Number(process.env.KG_D || 2.3);
    for (let tries = 0; tries < 2; tries++) await ev(([x, z, ry, d]) => { const p = G.p, a = ry + 0.5; p.x = x + Math.sin(a) * d; p.z = z + Math.cos(a) * d; p.yaw = p.root = Math.atan2(x - p.x, z - p.z); G.aimS.fy = p.yaw; G.aimS.fpit = -0.28; G.cyc = 700; G.camOv = null; }, [...at, d]).then(() => W(2500));
    await clean(); await shot('ptex-' + k);
  }
  console.log('ptex', await ev(() => { let n = 0; G.dbgScene.traverse(o => { if (o.isMesh && o.geometry && o.geometry.attributes.tid) n++; }); return n; }));
};
