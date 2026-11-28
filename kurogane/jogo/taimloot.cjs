// 1.ª pessoa: abre-se o que está debaixo da mira, não o mais perto do corpo
module.exports = async (page) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(1500);
  await ev(() => { G.fpFree = true; const p = G.p; const W0 = G.dbgW; const y0 = 0; W0.containers.push({ id: 'tA', x: p.x + 2.0, z: p.z, label: 'Caixa da mira', table: 'casa', slots: [6, 4], y: 0.6, grid: null, lv: 0 }, { id: 'tB', x: p.x + 0.4, z: p.z + 1.0, label: 'Caixa do lado', table: 'casa', slots: [6, 4], y: 0.6, grid: null, lv: 0 }); });
  await W(2500);
  const look = async (yaw, pit) => { await ev(([y, pt]) => { G.aimS.fy = y; G.aimS.fpit = pt; G.p.yaw = G.p.root = y; }, [yaw, pit]); await W(1500); return ev(() => G.prompt ? G.prompt.label : '-'); };
  const a = await look(Math.PI / 2, -0.25), b = await look(0, -0.5), c = await look(Math.PI, 0.3);
  console.log('a apontar à caixa longe:', a, '· à do lado:', b, '· para o céu:', c, '· fp', await ev(() => !!G.fp + '/' + !!G.dbgFPF));
  console.log((a === 'Caixa da mira' ? 'OK   ' : 'FALHA') + ' com a mira na caixa a 2 m abre essa (há outra mais perto do corpo)');
  console.log((b === 'Caixa do lado' ? 'OK   ' : 'FALHA') + ' virar a mira para a outra muda');
  console.log((c === '-' || !/Caixa/.test(c) ? 'OK   ' : 'FALHA') + ' sem nada na mira não abre caixas');
};
