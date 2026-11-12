// A primeira carta do topo no WebKit (Safari): versão nova contra a antiga, a 1 s, 2,6 s e 4 s
import { webkit, chromium } from 'playwright';
import fs from 'node:fs';
fs.mkdirSync('res', { recursive: true });
const log = [];
for (const [motor, nm] of [[webkit, 'webkit'], [chromium, 'chromium']]) {
  const browser = await motor.launch();
  for (const [nome, url] of [['nova', 'http://127.0.0.1:8080/'], ['antiga', 'http://127.0.0.1:8081/']]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: nm === 'chromium', hasTouch: true });
    const p = await ctx.newPage();
    await p.goto(url, { waitUntil: 'load' });
    for (const ms of [1000, 1600, 1400]) {
      await p.waitForTimeout(ms);
      const t = await p.evaluate(() => Math.round(performance.now()));
      const info = await p.evaluate(() => { const i = document.querySelector('.carta.s0 img.on'); const c = i.closest('.carta'); return { src: i.getAttribute('src'), completo: i.complete, larg: i.naturalWidth, op: getComputedStyle(i).opacity, vis: getComputedStyle(i).visibility, cls: c.className }; });
      await p.screenshot({ path: `res/primeira-${nm}-${nome}-${t}.png`, clip: { x: 0, y: 100, width: 390, height: 460 } });
      log.push(`${nm} ${nome} ${t} ms: ${JSON.stringify(info)}`);
    }
    await ctx.close();
  }
  await browser.close();
}
fs.writeFileSync('res/primeira.txt', log.join('\n'));
