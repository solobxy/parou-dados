module.exports = async (page) => {
  const ev = (f, a) => page.evaluate(f, a);
  await ev(() => G.dbgKit());
  const r = await ev(() => { const i = 432, j = 219, P = [['fund', 'f:432:219', 432, 219, 1, 600, 0, 0], ['fund', 'f:433:219', 433, 219, 1, 600, 0, 0], ['parede', 'h:432:219', null, null, 0, 250, 0, 0], ['porta', 'h:433:219', null, null, 0, 250, 0, 0]];
    let err = null; try { G.base.load({ p: P, d: [] }, () => null); } catch (e) { err = String(e.stack).slice(0, 500); }
    const out = []; G.base.root ? 0 : 0; return { err, save: JSON.stringify(G.base.save(() => null)).slice(0, 300) }; });
  console.log(JSON.stringify(r));
};
