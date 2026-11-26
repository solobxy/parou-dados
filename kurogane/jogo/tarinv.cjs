module.exports = async (page, shot) => { const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await W(2500); await ev(() => { G.net.start = () => { }; G.ui.arenaShow('lobby'); document.querySelector('#arw .atm.t0').click(); }); await W(900);
  console.log('lobby X:', JSON.stringify(await ev(() => { const b = document.getElementById('arX'); const r = b.getBoundingClientRect(); return [b.hidden, b.getAttribute('aria-label'), Math.round(r.width)]; })));
  await ev(() => { G.ui.arenaHide(); G.arenaStart(0, 'apoio'); }); await W(2500); await ev(() => G.ui.openInv()); await W(800);
  console.log('inv arena:', JSON.stringify(await ev(() => [...document.querySelectorAll('#inv .tabs button')].map(b => b.textContent + ':' + (getComputedStyle(b).display !== 'none')))), JSON.stringify(await ev(() => document.querySelector('#zone b').textContent)));
  await shot('arinv'); };
