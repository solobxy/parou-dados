// ver o vermelho do dano, o arco de onde veio o tiro e o estremecer da vista
module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  await page.waitForFunction('window.__ready === true', { timeout: 120000 }).catch(() => { }); await W(1500);
  await ev(() => { G.dbgKit(); G.cfg.op = 0.5; G.ui.saveCfg(); }); await W(800);
  console.log('estado', JSON.stringify(await ev(() => { G.ui.damage(35, 1.2); const d = document.getElementById('dmg'), e = document.getElementById('dmgDir'); return [d.className, getComputedStyle(d).opacity, getComputedStyle(d).display, getComputedStyle(d).zIndex, d.hidden, e.className, getComputedStyle(e).opacity, d.parentElement.id || d.parentElement.tagName]; }))); await ev(() => { for (const id of ['dmg', 'dmgDir']) { const x = document.getElementById(id); x.style.transition = 'none'; x.style.opacity = id === 'dmg' ? '1' : '1'; } }); await shot('dano');
  const op = await ev(() => [getComputedStyle(document.getElementById('vit')).opacity, getComputedStyle(document.getElementById('hud')).opacity, getComputedStyle(document.getElementById('tFire')).filter]);
  console.log('opacidade: vida', op[0], 'hud', op[1], 'botão', op[2]);
};
