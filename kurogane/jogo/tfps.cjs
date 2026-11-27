// peso por imagem (chamadas de desenho e triângulos, com sombras) em sítios típicos, de dia
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(1000);
  const SP = [[-165, -7, 0], [0, 0, 1.6], [-20, -12, 2], [60, 1.5, 1.57]];
  const o = [];
  for (const [x, z, a] of SP) { await ev(([x, z, a]) => { const p = G.p; p.x = x; p.z = z; p.yaw = p.root = a; G.aimS.fy = a; G.aimS.fpit = -0.1; window.__rinfoOn = 1; }, [x, z, a]); await W(5000);
    o.push(await ev(async () => { const s = []; for (let i = 0; i < 3; i++) { await new Promise(r => requestAnimationFrame(r)); s.push(window.__rinfo()); } const r = s[2]; return [r.calls, Math.round(r.tris / 1000) + 'k']; })); }
  console.log('peso', JSON.stringify(o), 'luzes', await ev(() => { let n = 0, v = 0, sh = 0; G.dbgScene.traverse(l => { if (l.isLight) { n++; if (l.visible) v++; if (l.castShadow && l.visible && (!l.shadow || l.shadow.autoUpdate !== false)) sh++; } }); n += ' ' + [...(function* () { const L = []; G.dbgScene.traverse(l => { if (l.isLight && l.castShadow) L.push(l.type + ':' + l.intensity.toFixed(1) + ':' + (l.shadow.autoUpdate ? 'A' : '-')); }); yield* L; })()].join(','); return [n, v, sh].join('/'); }));
};
