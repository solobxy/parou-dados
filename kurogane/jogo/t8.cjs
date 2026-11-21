module.exports = async (page, shot, mode) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  console.log('boot ms', await ev(() => Math.round(performance.now())));
  await W(400); await page.tap('#sPlay'); await W(800);
  // botões reais por toque
  await page.tap('#bMap'); await W(400); console.log('map open', await ev(() => G.mapOpen)); await shot('60-mapa');
  await page.tap('#mClose'); await W(200);
  await page.tap('#bInv'); await W(400); console.log('inv open', await ev(() => G.invOpen)); await page.tap('#iClose'); await W(200);
  await page.tap('#mm'); await W(300); console.log('map via minimap', await ev(() => G.mapOpen)); await ev(() => G.ui.toggleMap(false));
  const go = async (x, z, name, yaw = Math.PI) => { await ev(([x, z, yaw]) => { const p = G.p; p.x = x; p.z = z; p.yaw = yaw; G.camT.set(x, 0, z); G.zs.length = 0; }, [x, z, yaw]); await W(900); await shot(name); };
  await go(-170, 4, '61-kitamura');
  await go(190, -150, '62-base-entrada');
  await go(185, -172, '63-base-dentro');
  await go(-232, 170, '64-pedreira');
  await go(150, -6, '65-posto');
  await go(156, 160, '66-quinta');
  await go(-118, -190, '67-torre');
  await go(0, 178, '68-minamisato');
  await go(-14.2, -4.5, '69-clinica-raiox');
  // zombie a ver o jogador através da janela: silhueta vermelha
  await ev(() => { const p = G.p; p.x = -14.2; p.z = -5.6; G.camT.set(p.x, 0, p.z); G.zs.length = 0; G.zs.push({ x: -17.5, z: -9.5, yaw: 0, hp: 80, state: 'wander', tx: -17.5, tz: -9.5, think: 0, phase: 0, mv: 0, atkT: 0, atkCd: 0, lost: 0, stuck: 0, det: 0, detDir: 1, deadT: 0, sink: 0, groan: 3, sc: 1, wT: 9, spd: 1 }); });
  await W(700); await shot('70-zombie-ve');
  console.log('zombie sees', await ev(() => G.zs[0] && G.zs[0].sees + ' ' + G.zs[0].state));
  console.log('calls', await ev(() => G.renderer.info.render.calls), 'tris', await ev(() => G.renderer.info.render.triangles), 'trees', await ev(() => G.W.trees.length), 'rocks', await ev(() => G.W.rocks.length), 'meshes', await ev(() => G.scene.children.length));
};
