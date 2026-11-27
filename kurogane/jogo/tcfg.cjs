// definições: a sensibilidade fica guardada e as da nuvem (mais recentes) substituem as locais
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await W(1500);
  const r = await ev(() => { const a = JSON.parse(localStorage.getItem('kurogane-cfg-v1') || 'null'); const c = JSON.parse(JSON.stringify(a)); const keys = Object.keys(c).filter(k => /sens/i.test(k)); keys.forEach(k => { if (typeof c[k] === 'number') c[k] = +(c[k] * 1.7).toFixed(3); }); c.ts = Date.now() + 5000; localStorage.setItem('kurogane-cfg-v1', JSON.stringify(c)); G.ui.cfgCloud(); const b = JSON.parse(localStorage.getItem('kurogane-cfg-v1')); return { keys, antes: keys.map(k => a[k]), nuvem: keys.map(k => c[k]), depois: keys.map(k => b[k]), ts: !!a.ts }; });
  console.log(JSON.stringify(r));
  await page.reload(); await page.waitForFunction('window.G && G.ui', { timeout: 120000 }); await W(3000);
  console.log('depois de recarregar:', await ev(k => { const b = JSON.parse(localStorage.getItem('kurogane-cfg-v1')); return k.map(x => b[x]); }, r.keys));
};
