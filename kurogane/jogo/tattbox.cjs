// mochila cheia: um silenciador num saco no chão monta-se direto na arma (sem ter de arranjar espaço)
module.exports = async (page, shot) => { const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(2000);
  const r = await ev(async () => { const I = G.inv; I.belt.fill(null); const g = G.mkItem('m4'); g.att = {}; I.belt[0] = g; let n = 0; while (n < 200 && !I.give(G.mkItem('pedra', 1))) n++; // enche a mochila
    const full = !!I.give(G.mkItem('silR')); G.dropItem(G.mkItem('silR')); await new Promise(r => setTimeout(r, 300)); const b = G.bags[G.bags.length - 1]; G.ui.openInv(b); await new Promise(r => setTimeout(r, 500));
    const el = [...document.querySelectorAll('#gBox [data-src]')].find(e => e.dataset.src.startsWith('box')); el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 1, clientY: 1 })); el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 1, clientY: 1 })); el.click(); await new Promise(r => setTimeout(r, 400));
    const btns = [...document.querySelectorAll('#iAct button')].map(x => x.textContent); const put = [...document.querySelectorAll('#iAct button')].find(x => /^Pôr na M4/.test(x.textContent)); if (put) put.click(); await new Promise(r => setTimeout(r, 300));
    return { full, btns, sup: g.att.sup, left: b.grid.list.length }; });
  console.log(JSON.stringify(r)); await shot('attbox');
};
