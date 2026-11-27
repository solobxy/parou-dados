module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => { G.showMenu(); document.getElementById('sNews').click(); }); await W(800);
  const r = await ev(() => { const L = document.querySelector('.nw-list'), D = document.querySelector('.nw-d'); const mk = (el) => { const t = new Touch({ identifier: 1, target: el, clientX: 100, clientY: 200 }); el.dispatchEvent(new TouchEvent('touchstart', { touches: [t], targetTouches: [t], changedTouches: [t], bubbles: true, cancelable: true })); const t2 = new Touch({ identifier: 1, target: el, clientX: 100, clientY: 150 }); const m = new TouchEvent('touchmove', { touches: [t2], targetTouches: [t2], changedTouches: [t2], bubbles: true, cancelable: true }); el.dispatchEvent(m); return m.defaultPrevented; };
    return { list: [L.scrollHeight, L.clientHeight, getComputedStyle(L).flexDirection], det: [D.scrollHeight, D.clientHeight], prevList: mk(L.querySelector('.nw-it')), prevDet: mk(D.querySelector('p') || D), prevGame: mk(document.getElementById('start')) }; });
  console.log(JSON.stringify(r));
  console.log((r.list[0] > r.list[1] && !r.prevList ? 'OK   ' : 'FALHA') + ' a lista das novidades desliza com o dedo');
  console.log((!r.prevDet ? 'OK   ' : 'FALHA') + ' o texto da novidade desliza com o dedo');
  console.log((r.prevGame ? 'OK   ' : 'FALHA') + ' fora das listas o ecrã não se mexe');
  await shot('news');
};
