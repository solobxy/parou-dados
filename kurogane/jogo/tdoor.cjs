// entrar e sair da base pela porta: fundação com 3 paredes e uma porta (de lado e de frente), a correr, como no telemóvel
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(2500);
  await ev(() => { for (const k of Object.keys(G.inv)) { } G.inv.eq && (G.inv.eq.back = null); }); // menos peso, anda normal
  const run = async (yaw, ms) => { await ev(y => { const p = G.p; p.yaw = p.root = p.aim = y; p.vx = Math.sin(y) * 0.1; p.vz = Math.cos(y) * 0.1; G.autoYaw = y; G.autoRun = true; }, yaw); await W(ms); await ev(() => { G.setAuto(false); }); await W(400); return ev(() => [+G.p.x.toFixed(2), +G.p.z.toFixed(2), +G.p.y.toFixed(2)]); };
  let fails = 0;
  for (const side of ['h', 'v']) {
    const B = await ev(side => { const p = G.p, i = Math.floor(p.x / 3) + 3 + (side === 'v' ? 3 : 0), j = Math.floor(p.z / 3) + 3; G.base.clear();
      const k = (t, a, b) => t + ':' + a + ':' + b, door = side === 'h' ? k('h', i, j) : k('v', i, j);
      const walls = side === 'h' ? [k('h', i, j + 1), k('v', i, j), k('v', i + 1, j)] : [k('h', i, j), k('h', i, j + 1), k('v', i + 1, j)];
      G.base.applyNet({ p: [[k('f', i, j), 'fund', 1, 500, 0, 0], ...walls.map(w => [w, 'parede', 1, 500, 0, 0]), [door, 'porta', 1, 500, 0, 0]] });
      const D = G.base.pieces.get(door).door; return { i, j, door, dx: D.x, dz: D.z, cx: i * 3 + 1.5, cz: j * 3 + 1.5 }; }, side);
    // fora, a 2 m da porta, virado para ela
    const off = +(process.env.OFF || 0), out = side === 'h' ? [B.dx + off, B.dz - 2.2] : [B.dx - 2.2, B.dz + off];
    await ev(([x, z]) => { Object.assign(G.p, { x, z, vx: 0, vz: 0, h: 0 }); }, out); await W(1500);
    const pr = await ev(() => G.prompt && G.prompt.door ? G.prompt.label : (G.prompt ? 'outro: ' + G.prompt.label : 'nada'));
    await ev(() => G.interact()); await ev(k => { const D = G.base.pieces.get(k).door; D.target = 1; }, B.door); await W(1500);
    const open = await ev(k => G.base.pieces.get(k).door.target, B.door);
    const yIn = Math.atan2(B.cx - out[0], B.cz - out[1]) + (+(process.env.ANG || 0)) * Math.PI / 180;
    const p1 = await run(yIn, 5000); const inside = p1[0] > B.i * 3 + 0.3 && p1[0] < B.i * 3 + 2.7 && p1[1] > B.j * 3 + 0.3 && p1[1] < B.j * 3 + 2.7;
    await shot('base-' + side + '-dentro');
    // e sair outra vez
    const p2 = await run(yIn + Math.PI, 5000); const outside = side === 'h' ? p2[1] < B.j * 3 - 0.3 : p2[0] < B.i * 3 - 0.3;
    console.log(`porta ${side}: aviso «${pr}», aberta ${open}; entrar → ${JSON.stringify(p1)} ${inside ? 'DENTRO' : 'FICOU FORA'}; sair → ${JSON.stringify(p2)} ${outside ? 'FORA' : 'FICOU PRESO'}`);
    if (!inside || !outside) { fails++; console.log('  colisões perto:', JSON.stringify(await ev(([x, z]) => G.dbg.cols(x, z, 1.6).filter(q => !(q[0] === 'r' && q[1] === 'b')), p1))); }
  }
  console.log(fails ? 'FALHA' : 'tudo bem');
};
