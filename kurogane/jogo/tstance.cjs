// agachar e deitar: altura dos olhos, velocidade, parede à frente (empurra para trás), sem espaço (fica agachado) e as poses
module.exports = async (page, shot) => { const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms), fs = require('fs');
  const WG = async sec => { const t0 = await ev(() => G.t); await page.waitForFunction(t => G.t >= t, t0 + sec, { timeout: 180000, polling: 100 }); };
  await ev(() => G.dbgKit()); await W(1500); await ev(() => { for (const z of G.zs) z.x += 3000; }); await WG(1);
  if (!(await ev(() => !!G.fp))) { await ev(() => G.viewToggle()); await WG(0.8); }
  const eye = () => ev(() => +(G.aimS ? G.aimS.eye.y - G.p.y : 0).toFixed(2));
  const st = async () => ev(() => ({ st: G.p.stance | 0, sc: +(G.p.sc || 0).toFixed(2) }));
  const speed = async () => { await page.keyboard.down('KeyW'); await WG(1.2); const v = await ev(() => +Math.hypot(G.p.vx, G.p.vz).toFixed(2)); await page.keyboard.up('KeyW'); await WG(0.6); return v; };
  const out = {};
  out.pe = { eye: await eye(), v: await speed() };
  await ev(() => G.stanceToggle(1)); await WG(0.08); out.meio = await st(); await WG(0.8); out.agachado = { ...(await st()), eye: await eye(), v: await speed() };
  await ev(() => G.stanceToggle(2)); await WG(0.9); out.deitado = { ...(await st()), eye: await eye(), v: await speed() };
  await ev(() => G.jump()); await WG(0.8); out.saltarDeitado = await st();
  await ev(() => G.jump()); await WG(0.8); out.saltarAgachado = await st();
  console.log(JSON.stringify(out));
  // parede: encosta-se de frente a uma parede e deita-se
  const w = await ev(async () => { const p = G.p, R = G.W.rects.filter(r => r.k === 's' && !(r.lv) && r.h > 2 && (r.x1 - r.x0) > 3 && (r.z1 - r.z0) < 0.5).sort((a, b) => Math.hypot((a.x0 + a.x1) / 2 - p.x, a.z0 - p.z) - Math.hypot((b.x0 + b.x1) / 2 - p.x, b.z0 - p.z))[0];
    const x = (R.x0 + R.x1) / 2; p.x = x; p.z = R.z0 - 0.32; p.h = 0; p.vx = p.vz = 0; p.root = p.yaw = 0; if (G.aimS) G.aimS.fy = 0; await new Promise(r => setTimeout(r, 400)); const z0 = p.z;
    const pr0 = G.proneRoom(); G.stanceSet(2); await new Promise(r => setTimeout(r, 900)); return { pr0: [+pr0.f.toFixed(2), +pr0.b.toFixed(2)], toast: document.getElementById('toast').textContent, parede: +R.z0.toFixed(2), antes: +z0.toFixed(2), depois: +p.z.toFixed(2), folga: +(R.z0 - p.z).toFixed(2), st: p.stance }; });
  console.log('parede:', JSON.stringify(w));
  // corredor estreito (de lado entre duas paredes que não deixam): não se deita
  const nar = await ev(async () => { const p = G.p; G.stanceSet(0); await new Promise(r => setTimeout(r, 300)); const R = G.W.rects.find(r => r.k === 's' && !(r.lv) && r.h > 2 && (r.x1 - r.x0) > 3 && (r.z1 - r.z0) < 0.5); p.x = (R.x0 + R.x1) / 2; p.z = R.z0 - 0.32; p.root = p.yaw = Math.PI / 2; if (G.aimS) G.aimS.fy = Math.PI / 2;
    await new Promise(r => setTimeout(r, 300)); G.stanceSet(2); await new Promise(r => setTimeout(r, 600)); return { st: p.stance, toast: document.getElementById('toast').textContent }; });
  console.log('ao longo da parede:', JSON.stringify(nar));
  // poses vistas de lado (3.ª pessoa)
  await ev(() => { G.stanceSet(0); G.p.z -= 4; }); await WG(0.5); await ev(() => G.viewToggle()); await WG(0.8);
  for (const [nm, k, gun] of [['pe', 0, 'm4'], ['agach', 1, 'm4'], ['deit', 2, 'm4'], ['deitp', 2, 'pistola'], ['agachp', 1, 'pistola']]) {
    await ev(([k, gun]) => { G.inv.belt.fill(null); G.inv.belt[0] = G.mkItem(gun); G.sel = 0; G.refresh(); G.stanceSet(k); if (G.aimStart) G.aimStart(); }, [k, gun]); await WG(1.2);
    const u = await ev(() => { const p = G.p, fx = Math.sin(p.root), fz = Math.cos(p.root); return G.dbgCam([p.x + Math.cos(p.root) * 3.2 + fx * 0.3, p.y + 1.1, p.z - Math.sin(p.root) * 3.2 + fz * 0.3], [p.x, p.y + 0.6, p.z], 40, 700, 500); });
    fs.writeFileSync('shots/st-' + nm + '.jpg', Buffer.from(u.split(',')[1], 'base64')); }
};
