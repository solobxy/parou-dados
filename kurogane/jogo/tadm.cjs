// menu admin: tocar num jogador abre a ficha dele (não desaparece), com ir ter com ele (ligado, a dormir ou na última posição); ESP e balas infinitas no «Eu»
module.exports = async (page) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(1500);
  await ev(() => { G.net.role = 'admin'; G.net.uid = 'me1'; G.net.adm = (a, o) => { (window.__adm = window.__adm || []).push([a, o]); }; G.ui.admOpen(); const T = Date.now();
    G.ui.admList({ online: [{ uid: 'me1', n: 'dinis', on: 1, al: 1, hp: 100, cl: 'clã', r: 'admin' }, { uid: 'u2', n: 'pila', on: 1, al: 1, hp: 100 }], off: [{ uid: 'u3', n: 'Berna', on: 0, t: T - 60e3, sl: [2684, -2657], cl: 'clã' }, ...Array.from({ length: 14 }, (_, i) => ({ uid: 'o' + i, n: 'jogador' + i, on: 0, t: T - (i + 2) * 3600e3, lp: i % 2 ? [100 + i, -50] : null }))], bans: [], clans: [] }); });
  await W(600); await page.screenshot({ path: '/tmp/kg/adm1.png' });
  const nList = await ev(() => document.querySelectorAll('#admB [data-p]').length);
  await ev(() => document.querySelector('#admB [data-p="u3"]').click()); await W(500); await page.screenshot({ path: '/tmp/kg/adm2.png' });
  const det = await ev(() => ({ txt: document.getElementById('admB').innerText.replace(/\s+/g, ' ').slice(0, 300), vis: [...document.querySelectorAll('#admB .ag, #admB .ah')].filter(e => !e.classList.contains('pgx')).length }));
  console.log('lista', nList, '· ficha:', det.txt);
  console.log((/Berna/.test(det.txt) && /Ir onde está a dormir/i.test(det.txt) ? 'OK   ' : 'FALHA') + ' tocar num jogador desligado abre a ficha com «ir onde está a dormir»');
  await ev(() => document.querySelector('#admB [data-a="goto"]').click()); const sent = await ev(() => JSON.stringify(window.__adm.slice(-1)));
  console.log((/goto.*u3/.test(sent) ? 'OK   ' : 'FALHA') + ' «ir» manda o pedido ao servidor ' + sent);
  await ev(() => { G.ui.admOpen(); document.getElementById('admBack') && document.getElementById('admBack').click(); }); await W(300);
  await ev(() => { const L = document.querySelectorAll('#admB [data-p]'); const o = [...L].find(b => b.dataset.p === 'o1'); if (o) o.click(); }); await W(300);
  const lp = await ev(() => document.getElementById('admB').innerText); console.log((/última posição/i.test(lp) ? 'OK   ' : 'FALHA') + ' desligado sem corpo: «ir à última posição»');
  await ev(() => { document.querySelector('#admTabs [data-t="e"]').click(); }); await W(300); await page.screenshot({ path: '/tmp/kg/adm3.png' });
  const eu = await ev(() => document.getElementById('admB').textContent); console.log((/ESP/i.test(eu) && /Balas infinitas/i.test(eu) ? 'OK   ' : 'FALHA') + ' «Eu» tem ESP e balas infinitas');
};
