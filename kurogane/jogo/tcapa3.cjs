// cartões: survival (rua ao fim da tarde com zombies à frente) e arena (Tóquio, depois de entrar numa equipa)
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  const clean = () => ev(() => { for (const e of document.querySelectorAll('body *')) if (e.tagName !== 'CANVAS' && !e.querySelector('canvas')) e.style.visibility = 'hidden'; });
  if (!process.env.KG_ARENA) {
    await ev(() => G.dbgKit()); await W(1500);
    await ev(() => { const s = G.propStat.vend; const [x, z, ry] = s.at[1] || s.at[0]; const p = G.p, a = ry + 0.7; p.x = x + Math.sin(a) * 6.5; p.z = z + Math.cos(a) * 6.5; p.yaw = p.root = Math.atan2(x - p.x, z - p.z) + 0.25; G.aimS.fy = p.yaw; G.aimS.fpit = -0.02; G.cyc = 1440; p.god = true; window.__ph = [p.x, p.z, p.yaw]; }); await W(8000);
    await ev(() => { const [px, pz, yw] = window.__ph, zs = G.zs.filter(z => z.state !== 'dead').slice(0, 5); zs.forEach((z, i) => { const d = 3.2 + i * 1.3, s = (i % 2 ? 1 : -1) * (0.5 + i * 0.35); const x = px + Math.sin(yw) * d + Math.cos(yw) * s, zz = pz + Math.cos(yw) * d - Math.sin(yw) * s; Object.assign(z, { x, z: zz, hx: x, hz: zz, lv: 0, state: 'wander', wT: 99, think: 99, yaw: yw + Math.PI }); }); });
    await W(1500); await clean(); await W(300); await shot('capa-zombies');
  } else {
    await W(4000);
    await ev(async () => { const t = document.querySelector('#arw .atm.t0'); if (t) t.click(); await new Promise(r => setTimeout(r, 500)); const g = document.getElementById('arGo'); if (g) g.click(); }); await W(9000);
    await ev(() => { const p = G.p; if (p) { G.aimS.fpit = 0.0; } }); await W(800); await clean(); await W(300); await shot('capa-arena');
  }
};
