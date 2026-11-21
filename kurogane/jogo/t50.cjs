module.exports = async (page, shot) => {
  const ev = (f, a) => page.evaluate(f, a), W = ms => page.waitForTimeout(ms);
  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 300)); });
  await page.evaluate(() => G.dbgKit()); await W(1500);
  await ev(() => { G.cyc = 700; G.weather(true); G.rain = 0.95; }); await W(2500);
  console.log('chuva:', await ev(() => (G.rain).toFixed(2) + ' alvo ' + G.rainT + ' etiqueta: ' + document.getElementById('zone').textContent));
  await shot('chuva-dia');
  await ev(() => { G.cyc = 1650; }); await W(2000); await shot('chuva-noite');
  await ev(() => { G.weather(false); }); await W(500);
  console.log('a parar:', await ev(() => G.rain.toFixed(2) + ' -> ' + G.rainT));
};
