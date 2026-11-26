// sem servidor não se joga: «A entrar no servidor…» e, sem resposta, volta ao menu com a razão
module.exports = async (page, shot) => { const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await W(2500); await ev(() => { window.__log = []; const n = G.ui.note; G.ui.note = t => { window.__log.push('note:' + t); n(t); }; const tm = G.toMenu; G.toMenu = () => { window.__log.push('toMenu ' + new Error().stack.split('\n').slice(1, 4).join(' / ')); tm(); }; localStorage.setItem('kg.srv', 'ws://127.0.0.1:9/ws'); G.start(false, false); });
  const t0 = Date.now(); await W(800);
  console.log('a ligar:', JSON.stringify(await ev(() => [G.playing, G.paused, !document.getElementById('netLost').hidden, document.querySelector('#netLost b').textContent, document.getElementById('netLostT').textContent]))); await shot('gate-a-ligar');
  await page.waitForFunction(() => !G.playing, null, { timeout: 40000 }).catch(() => { }); await page.waitForFunction(() => document.getElementById('mnote').textContent, null, { timeout: 8000 }).catch(() => { });
  console.log('depois de', Math.round((Date.now() - t0) / 1000), 's:', JSON.stringify(await ev(() => [G.playing, G.paused, document.getElementById('netLost').hidden, document.getElementById('start').hidden, document.getElementById('mnote').textContent]))); await shot('gate-menu'); console.log(JSON.stringify(await ev(() => window.__log)));
  await ev(() => localStorage.removeItem('kg.srv'));
};
