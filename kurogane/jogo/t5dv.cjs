// vista de perto do boneco com cada arma pesada e equipamento
const fs = require('fs');
module.exports = async (page) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(1500);
  await ev(() => { for (const z of G.zs) z.x += 3000; });
  const sets = [['cheytac', { scope: 'mira8', sup: 'silR' }, { head: 'capacetec', vest: 'coletec' }], ['barrett', { scope: 'mira8' }, { head: 'capacetep', vest: 'coletep', eyes: 'nvg' }], ['m249', { scope: 'reddot', light: 'lantArma' }, { head: 'capaceted', vest: 'coleted' }], ['pkm', {}, { suit: 'ghillie', head: 'capaceteu', vest: 'coleteu' }]];
  for (const [k, att, eq] of sets) {
    const url = await ev(async ([k, att, eq]) => { const I = G.inv; for (const s in I.eq) if (s !== 'back') I.eq[s] = null; for (const s in eq) I.eq[s] = G.mkItem(eq[s]); const g = G.mkItem(k); g.att = att; g.ammo = 5; I.belt[5] = g; G.sel = 5; G.refresh(); await new Promise(r => setTimeout(r, 900)); const p = G.p, y = p.yaw;
      return G.dbgCam([p.x + Math.sin(y + 1.3) * 3.2, p.y + 1.9, p.z + Math.cos(y + 1.3) * 3.2], [p.x, p.y + 1.1, p.z], 32); }, [k, att, eq]);
    fs.writeFileSync(__dirname + '/shots/close-' + k + '.jpg', Buffer.from(url.split(',')[1], 'base64')); console.log('close', k);
  }
};
