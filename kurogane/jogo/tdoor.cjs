// mobília no sítio onde as portas abrem (armários, caixas, mesas a atravessar portas)
module.exports = async (page) => {
  const r = await page.evaluate(() => { const b = G.W.doorCheck(); return { n: b.length, ex: b.slice(0, 12), props: G.W.rects.filter(r => r.prop).length, mv: G.W.doorMoved || 0, sk: G.W.doorSkipped || 0, fl: G.W.doorFlip || 0, st: G.W.doorStuck || 0 }; });
  console.log('móveis', r.props, 'a bater em portas', r.n, 'mudados', r.mv, 'tirados', r.sk, 'portas viradas', r.fl, 'presas', r.st, JSON.stringify(r.ex));
  console.log((r.n === 0 ? 'OK   ' : 'FALHA') + ' nenhum móvel no sítio onde uma porta abre');
};
