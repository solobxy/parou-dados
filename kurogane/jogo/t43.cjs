module.exports = async (page) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
  await page.evaluate(() => G.dbgKit()); await W(1500);
  await ev(() => { G.select(0); }); await W(300);
  await ev(() => { G.inv.belt[0].ammo = 0; G.reload(); });
  for (let i = 0; i < 5; i++) { await W(600); console.log(await ev(() => 'reload=' + G.p.reload.toFixed(2) + ' mode=' + G.p.reloadMode + ' ammo=' + G.inv.belt[G.sel].ammo + ' sel=' + G.sel + ' t=' + G.t.toFixed(2))); }
};
