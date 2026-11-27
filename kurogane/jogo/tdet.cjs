// o mapa tem de sair igual com e sem os adereços do Blender (mesmos sorteios: contentores, colisões, portas)
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  const fp = async () => { await ev(() => G.dbgKit()); await W(1000);
    for (const [x, z] of [[-2677, -2779], [0, 0], [-160, -7], [400, 300]]) { await ev(([x, z]) => { G.p.x = x; G.p.z = z; }, [x, z]); await W(5000); }
    return ev(() => { const W = G.W; let h = 0; const t = W.containers.map(c => c.label + Math.round(c.x * 10) + ',' + Math.round(c.z * 10)).join('|') + '#' + (W.rects || []).length + '#' + (W.doors || []).length; for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return [W.containers.length, (W.rects || []).length, W.doors.length, h >>> 0, !!document.querySelector('canvas')]; }); };
  const a = await fp(); console.log('com adereços:', JSON.stringify(a));
  await page.goto(page.url().split('?')[0] + '?noprops'); await page.waitForFunction('window.G && G.dbgKit', { timeout: 120000 }); await W(3000);
  const b = await fp(); console.log('sem adereços:', JSON.stringify(b));
  console.log(JSON.stringify(a) === JSON.stringify(b) ? 'IGUAL' : 'DIFERENTE');
};
