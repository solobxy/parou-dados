module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  const st = () => ev(() => { const M = G.music.T, o = {}; for (const k in M) { const t = M[k]; if (t.want || t.lv > 0.001 || !t.el.paused) o[k] = { want: t.want, lv: +t.lv.toFixed(2), g: t.g ? +t.g.gain.value.toFixed(3) : 'el' + t.el.volume.toFixed(2), pos: +t.el.currentTime.toFixed(1), paused: t.el.paused, ok: t.ok }; } return JSON.stringify(o) + ' perigo=' + (G.danger ? G.danger() : '-') + ' ' + JSON.stringify(G.dangerWhy || {}); });
  await page.mouse.click(5, 5); await W(1600); console.log('menu:', await st());
  await page.evaluate(() => G.dbgKit()); await W(7000); console.log('jogo:', await st());
  // 3 zombies a perseguir
  await ev(() => { const p = G.p; let n = 0; for (const z of G.zs) { if (z.state === 'dead') continue; Object.assign(z, { x: p.x + 20 + n, z: p.z + 10, hx: p.x + 20, hz: p.z + 10, state: 'chase', lv: p.lv || 0 }); if (++n >= 3) break; } });
  await W(3500); console.log('perigo +3.5s:', await st());
  await ev(() => { for (const z of G.zs) { z.x = z.hx = 440; z.z = z.hz = 440; z.state = 'wander'; } });
  await W(1000); console.log('afastados:', await st());
  await ev(() => G.cfg.musGame = 0); await W(500); console.log('slider jogo 0:', await st()); await ev(() => G.cfg.musGame = 0.5);
  // dano seguido
  await ev(() => { G.t += 30; }); await W(800); console.log('passou o tempo:', await st());
  await W(6000); console.log('fundo de volta:', await st());
  await ev(() => { G.p.hp = 100; for (let i = 0; i < 3; i++) G.dbgHurt && G.dbgHurt(8); });
  console.log('zona militar:', await ev(() => { const p = G.p; p.x = 190; p.z = -178; return G.danger() + ' ' + JSON.stringify(G.dangerWhy); }));
  await ev(() => { const p = G.p; p.x = 60; p.z = 60; G.t += 40; });
  console.log('fora da zona:', await ev(() => G.danger()));
};
