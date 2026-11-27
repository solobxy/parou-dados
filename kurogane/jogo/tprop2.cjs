// cada adereço do Blender posto à frente, num sítio aberto, com a câmara a olhar para ele
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  page.on('pageerror', e => console.log('PAGEERROR', String(e).slice(0, 300)));
  await ev(() => G.dbgKit()); await W(1500);
  const LIST = (process.env.KG_PROPS || 'lixo,vend,banco,caixote,bidao,cone,candeeiro,ac,armario,mesa,cadeira,cama,barreira').split(',');
  const T = { sofa: 0x6a5a8a, balcao: 0x9a8a72, carro: 0x2a5a8a, caixote: 0x535c3b, bidao: 0x3a5a8a, vend: 0xc23a2e, armario: 0xdcdcd6, mesa: 0x8a5a32, cama: 0xe9ece9 };
  const DD = { carro: [4.2, 0, -0.25], candeeiro: [6, -0.0, 0.4], ac: [1.6, 1.5, 0.05], cama: [2.6, 0, -0.45], vend: [2.4, 0, -0.2], lixo: [2.4, 0, -0.32] };
  let i = 0;
  for (const nm of LIST) {
    const [d, y, pit] = DD[nm] || [2.0, 0, -0.38];
    const r = await ev(([nm, t, d, y, pit, i]) => { const p = G.p; p.x = 60 + i * 0.01; p.z = 1.5; p.yaw = p.root = Math.PI / 2 + 0.35; G.aimS.fy = p.yaw; G.aimS.fpit = pit; return G.dbgProp(nm, t, d, Math.PI + 0.6, y); }, [nm, T[nm] || 0x3a5a3a, d, y, pit, i++]);
    await W(1800); await shot('p2-' + nm); console.log(nm, r);
  }
};
