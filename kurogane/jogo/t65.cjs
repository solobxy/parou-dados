// zombies longe vistos pela luneta: têm de andar sem saltos (antes, depois dos 90 m mexiam-se aos solavancos de meio em meio segundo)
module.exports = async (page) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(2500);
  const g = await ev(() => { for (let i = 0; i < 6; i++) { const it = G.inv.belt[i]; if (it && it.att && it.att.scope) { G.sel = i; return it.k; } } return null; });
  console.log('arma com luneta:', g);
  for (const D of [40, 120, 200]) {
    const r = await ev(async D => {
      const p = G.p; Object.assign(p, { x: 1500, z: 900 }); const z = G.zs[0]; for (const o of G.zs) if (o !== z) o.x += 5000;
      Object.assign(z, { x: 1500, z: 900 + D, y: 0, lv: 0, state: 'alert', tx: 1560, tz: 900 + D, hp: 80, frz: undefined, yaw: Math.PI / 2, v: 1.5 }); delete z.frz;
      G.aimStart(true); await new Promise(r => setTimeout(r, 2500)); const A = G.aimS; A.fy = 0; A.fpit = -0.01;
      const xs = []; await new Promise(res => { let k = 0; const f = () => { xs.push([z.x, G.t, z.hide]); if (++k < 90) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
      const st = []; for (let i = 1; i < xs.length; i++) st.push(Math.abs(xs[i][0] - xs[i - 1][0]));
      const tot = Math.abs(xs[xs.length - 1][0] - xs[0][0]), mx = Math.max(...st), still = st.filter(v => v < 1e-5).length; G.aimEnd();
      return { fp: G.fp, total: +tot.toFixed(2), maxStep: +mx.toFixed(3), parado: still + '/' + st.length, hide: xs.filter(x => x[2]).length };
    }, D);
    console.log(`zombie a ${D} m na luneta:`, JSON.stringify(r), r.maxStep < 0.12 && r.total > 0.2 ? 'OK' : 'SALTOS');
  }
};
