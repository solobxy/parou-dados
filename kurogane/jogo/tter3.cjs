module.exports = async (page, shot) => {
  const errs = []; page.on('console', m => { const t = m.text(); if (/Shader|ERROR: 0|WebGLProgram|warning/i.test(t)) errs.push(t.slice(0, 600)); });
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await ev(() => G.dbgKit()); await W(3000);
  console.log('ERRS', errs.length, errs.slice(0, 3).join('\n---\n'));
};
