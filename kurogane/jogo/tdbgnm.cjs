module.exports = async (page) => { const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(1500); await ev(() => { G.ui.refresh(true); G.ui.openInv(null); }); await W(1200);
  console.log(JSON.stringify(await ev(() => [...document.querySelectorAll('.item .nm')].map(n => [n.textContent, n.style.fontSize, n.scrollWidth, n.clientWidth]))));
};
