// adereços do Blender: vê-se cada um de perto
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  page.on('pageerror', e => console.log('PAGEERROR', String(e).slice(0, 300)));
  await ev(() => G.dbgKit()); await W(1200);
  const LIST = (process.env.KG_PROPS || 'lixo,vend,banco,caixote,bidao,cone,candeeiro,ac,armario,mesa,cadeira,cama,barreira').split(',');
  const D = { carro: [5, 1.4], lixo: [2.6, 1.4], vend: [2.4, 1.5], banco: [2.6, 1.4], caixote: [2.4, 1.4], bidao: [1.8, 1.2], cone: [1.6, 1.0], candeeiro: [4.5, 4], ac: [3, 0], armario: [2.6, 1.2], mesa: [2.4, 1.3], cadeira: [1.8, 1], cama: [3, 1.6], barreira: [2.6, 1.2] };
  for (const nm of LIST) {
    // chega perto (as zonas constroem-se ao chegar), depois põe-se à frente do adereço
    const st = await ev(nm => { const s = G.propStat[nm]; return s ? s.at[0] : null; }, nm);
    if (!st) { await ev(() => { G.p.x = -2677; G.p.z = -2779; }); await W(6000); }
    const r = await ev(([nm, d]) => { const s = G.propStat[nm]; if (!s) return 'sem ' + nm; const [x, z, ry] = s.at[0], p = G.p, a = ry + 0.55; p.x = x + Math.sin(a) * d[0]; p.z = z + Math.cos(a) * d[0]; p.yaw = p.root = Math.atan2(x - p.x, z - p.z); G.aimS.fy = p.yaw; G.aimS.fpit = -0.32 + (nm === 'candeeiro' ? 0.6 : 0) + (nm === 'ac' ? 0.2 : 0); return [s.n, x, z]; }, [nm, D[nm] || [2.5, 1.2]]);
    console.log(nm, JSON.stringify(r)); await W(6500);
    await ev(([nm, d]) => { const s = G.propStat[nm]; if (!s) return; const [x, z, ry] = s.at[0], p = G.p, a = ry + 0.55; p.x = x + Math.sin(a) * d[0]; p.z = z + Math.cos(a) * d[0]; p.yaw = p.root = Math.atan2(x - p.x, z - p.z); G.aimS.fy = p.yaw; }, [nm, D[nm] || [2.5, 1.2]]); await W(1500);
    await shot('prop-' + nm);
  }
  console.log('contagem:', JSON.stringify(await ev(() => Object.fromEntries(Object.entries(G.propStat).map(([k, v]) => [k, v.n])))));
};
