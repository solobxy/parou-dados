// menu de fabrico: parado, não se mexe nem pisca sozinho
module.exports = async (page) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(1500);
  await ev(() => { G.ui.openInv(null, 'craft'); }); await W(2500);
  const snap = () => ev(() => { const r = document.getElementById('recipes'), f = r && [...r.children].find(e => !e.classList.contains('pgx')); const b = f && f.getBoundingClientRect(); return { n: r ? r.children.length : -1, pg: (document.querySelector('#recipes + .pgbar .pgl, .pgbar span') || {}).textContent || '', cls: r ? r.className : '', top: b ? Math.round(b.top) : null, left: b ? Math.round(b.left) : null, html: r ? r.innerHTML.length : 0, st: r ? r.scrollTop : 0 }; });
  const L = []; for (let i = 0; i < 12; i++) { L.push(await snap()); await W(250); }
  await page.screenshot({ path: '/tmp/kg/craft.png' });
  const keys = ['n', 'top', 'left', 'html', 'cls', 'st']; const ch = keys.filter(k => new Set(L.map(x => JSON.stringify(x[k]))).size > 1);
  console.log(JSON.stringify(L.map(x => [x.top, x.html]))); console.log('muda:', ch.join(',') || 'nada');
  console.log((!ch.length ? 'OK   ' : 'FALHA') + ' o menu de fabrico fica parado');
};
