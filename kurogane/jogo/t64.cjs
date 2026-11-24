// precisão dos tiros: zombie parado ou a andar a várias distâncias, mira pelo caminho real (toque: prender; arrastar para a cabeça, peito, pernas; PC: rato)
// depois: dano da caçadeira por tiro e balas a atravessar corpos
module.exports = async (page, shot, mode) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(2500);
  const N = +(process.env.N || 12), spreadK = process.env.SPREAD !== undefined ? +process.env.SPREAD : 1, natural = !!process.env.NATURAL;
  // um sítio aberto: nada entre o jogador e 24 m à frente, a várias alturas, nem um pouco ao lado
  await ev(() => { Object.assign(G.p, { x: 1000, z: 700 }); }); await W(4000);
  const spot = await ev(() => { for (let r = 0; r < 60; r += 3) for (let a = 0; a < 6.28; a += 0.5) { const x = 1000 + Math.cos(a) * r, z = 700 + Math.sin(a) * r; let ok = true; for (const h of [0.3, 1.0, 1.35, 1.9]) for (const dx of [-0.8, 0, 0.8]) if (G.dbg.wallHit([x + dx, h, z], [x + dx, h, z + 24]) < 0.999) ok = false; if (ok) return [Math.round(x), Math.round(z)]; } return [1000, 700]; });
  console.log('sítio', spot);
  const sel = k => ev(k => { const i = G.inv.belt.findIndex(b => b && b.k === k); if (i >= 0) G.sel = i; else { G.inv.belt[0] = G.dbg.item(k, 1); G.sel = 0; } G.cfg.assist = true; return G.inv.belt[G.sel].k; }, k);
  const run = async (cond) => ev(async ({ cond, N, spreadK, natural, spot }) => {
    const sl = ms => new Promise(r => setTimeout(r, ms));
    const p = G.p, [X, Z] = spot; G.dbgSpread = spreadK;
    const zs = G.zs.slice(0, cond.zs || 1); for (const o of G.zs) if (!zs.includes(o)) { o.x = X + 4000; o.frz = 0; }
    const place = () => { Object.assign(p, { x: X, z: Z, y: 0.03, lv: 0, vx: 0, vz: 0 }); p.yaw = p.root = p.aim = 0; zs.forEach((z, k) => Object.assign(z, { x: X + cond.lat + (k ? (k % 2 ? 0.08 : -0.08) : 0), z: Z + cond.d + k * (cond.gap || 1), y: 0, lv: 0, yaw: Math.PI + (cond.zy || 0), state: cond.st, helm: 0, vest: 0, frz: cond.frz, atkT: 0, hide: false, _pt: -1 })); };
    const hp0 = cond.hp || 1e6; place(); zs.forEach(z => { z.hp = z.hpMax = hp0; }); if (cond.ammo) { const it = G.inv.belt[G.sel]; it.ak = cond.ammo; }
    if (!G.aimS.on) G.aimStart(); await sl(+(cond.settle || 900));
    const res = { z: 0, w: 0, a: 0, p: 0, none: 0, zones: {}, ends: [], dmg: [], multi: 0, off: 0 };
    for (let i = 0; i < N; i++) {
      place(); zs.forEach(z => { z.hp = z.hpMax = hp0; z.state = cond.st; }); p.cd = 0; p.reload = 0; const it = G.inv.belt[G.sel]; it.ammo = 30; if (cond.ammo) it.ak = cond.ammo; G.aimS.idle = 0;
      const H = { head: 1.72, chest: 1.3, legs: 0.5 }[cond.part || 'chest'], z = zs[0];
      await sl(350);
      if (cond.m === 'lock') G.aimS.lock = { z, mk: 'torso', lp: [0, 0.43, 0], zone: 'body' };
      else if (cond.m === 'drag') { G.aimS.lock = null; const q = G.dbg.scr(z.x, H, z.z); if (q[1] < 0 || q[1] > innerHeight) res.off++; G.aimDrag(q[0] - G.aimS.sx, q[1] - G.aimS.sy); }
      await sl(260); place(); if (!natural) G.aimS.steady = 1; G.aimS.kick = 0; G.dbgShots = [];
      const A = G.dbg.aimA();
      G.fireDown(); G.fireUp(); await sl(500);
      const S = G.dbgShots; G.dbgShots = null;
      if (!S.length) res.none++;
      for (const s of S) { res[s.k]++; if (s.k === 'z') { res.zones[s.zone] = (res.zones[s.zone] || 0) + 1; } else if (res.ends.length < 2 && s.e) res.ends.push(s.e.map(v => +v.toFixed(2)).join(',') + ' A=' + A.slice(0, 3).map(v => +v.toFixed(2)).join(',') + ' ' + A[3]); }
      if (zs.filter(z => z.hp < hp0).length > 1) res.multi++;
      res.dmg.push(zs.map(z => Math.round(hp0 - Math.max(z.hp, 0))));
    }
    return res;
  }, { cond, N, spreadK, natural, spot });
  await ev(s => { Object.assign(G.p, { x: s[0], z: s[1], y: 0.03, lv: 0 }); }, spot); await W(2500);
  const fmt = (r, n) => `acertos ${String(r.z).padStart(2)}/${n}  ${JSON.stringify(r.zones)}  parede ${r.w} ar ${r.a} nada ${r.none}${r.off ? ' FORA DO ECRÃ ' + r.off : ''}${r.ends.length ? '  ex: ' + r.ends.join(' | ') : ''}`;
  const part = process.env.PART || 'all';
  if (part === 'all' || part === 'aim') {
    await sel(process.env.GUN || 'pistola');
    const touch = mode !== 'desktop';
    const ms = touch ? (process.env.M ? process.env.M.split(',') : ['lock', 'drag']) : ['mouse'];
    const parts = process.env.PARTS ? process.env.PARTS.split(',') : ['chest', 'head', 'legs'];
    const dists = process.env.D ? process.env.D.split(',').map(Number) : [1, 1.6, 2.5, 4, 7, 12, 20];
    let tot = 0, hits = 0;
    for (const st of [['wander', 0], ['chase', 3]]) for (const m of ms) for (const pt of (m === 'lock' ? ['chest'] : parts)) for (const d of dists) {
      if (m === 'mouse') { await ev(({ d, spot }) => { Object.assign(G.p, { x: spot[0], z: spot[1] }); const z = G.zs[0]; Object.assign(z, { x: spot[0], z: spot[1] + d, frz: 0, hide: false }); }, { d, spot }); await W(700); const q = await ev(({ d, pt, spot }) => G.dbg.scr(spot[0], { head: 1.72, chest: 1.3, legs: 0.5 }[pt], spot[1] + d), { d, pt, spot }); await page.mouse.move(q[0], q[1]); }
      const r = await run({ d, lat: 0, st: st[0], frz: st[1], m, part: pt });
      tot += N - r.off; hits += r.z;
      console.log(`${st[0].padEnd(6)} ${m.padEnd(5)} ${pt.padEnd(5)} ${String(d).padStart(4)} m  ${fmt(r, N)}`);
    }
    console.log(`TOTAL acertos ${hits}/${tot} (${(100 * hits / tot).toFixed(1)}%)`);
  }
  if (part === 'all' || part === 'shotgun') {
    await sel('cacadeira');
    for (const d of [2, 4, 7, 10, 15, 22]) { const r = await run({ d, lat: 0, st: 'chase', frz: 3, m: 'lock', ammo: 'c12', hp: 80 }); const dm = r.dmg.map(x => x[0]); const kills = dm.filter(v => v >= 80).length; console.log(`caçadeira chumbo ${String(d).padStart(3)} m  bagos no zombie ${(r.z / N).toFixed(1)}/8 por tiro  dano médio ${(dm.reduce((a, b) => a + b, 0) / N).toFixed(0)}  mortos à 1.ª ${kills}/${N}  ${JSON.stringify(r.zones)}`); }
  }
  if (part === 'all' || part === 'pen') {
    for (const [g, am] of [['cacadeira', 'c12'], ['cacadeira', 'c12s'], ['pistola', 'a9'], ['m4', 'a556'], ['caca', 'a308']]) {
      await sel(g);
      const r = await run({ d: 4, gap: 1.2, zs: 3, lat: 0, st: 'chase', frz: 3, m: 'lock', ammo: am, hp: 1e6 });
      const per = [0, 0, 0]; for (const x of r.dmg) x.forEach((v, k) => { if (v > 0) per[k]++; });
      console.log(`atravessa ${am.padEnd(5)}: 1.º zombie atingido ${per[0]}/${N}, 2.º ${per[1]}/${N}, 3.º ${per[2]}/${N}  dano médio ${[0, 1, 2].map(k => (r.dmg.reduce((a, x) => a + x[k], 0) / N).toFixed(0)).join(' / ')}`);
    }
  }
  await shot('precisao');
};
