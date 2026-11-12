// dinissousa.pt (cópia local): grelha de projetos, baralho do topo por ordem de importância, artigos
import { chromium, webkit } from 'playwright';
import fs from 'node:fs';
fs.mkdirSync('res', { recursive: true });
const B = 'http://127.0.0.1:8080/';
const log = [];
for (const [motor, nomeMotor] of [[chromium, 'chromium'], [webkit, 'webkit']]) {
  const browser = await motor.launch();
  for (const [largura, altura] of [[390, 844], [1280, 900], [800, 1000]]) {
    if (nomeMotor === 'webkit' && largura === 800) continue;
    const ctx = await browser.newContext({ viewport: { width: largura, height: altura }, deviceScaleFactor: 2, isMobile: largura < 700, hasTouch: largura < 700 });
    const p = await ctx.newPage();
    const erros = [];
    p.on('pageerror', (e) => erros.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
    await p.goto(B, { waitUntil: 'load' });
    const pre = `${nomeMotor}-${largura}`;
    await p.waitForTimeout(2600);
    await p.screenshot({ path: `res/${pre}-topo-1-caiu.png` });
    await p.waitForTimeout(5200);
    await p.screenshot({ path: `res/${pre}-topo-2-ganhas.png` });
    await p.waitForTimeout(5200);
    await p.screenshot({ path: `res/${pre}-topo-3-parou.png` });
    const ordemBaralho = await p.evaluate(() => document.getElementById('palcoNome')?.textContent);
    const grelha = await p.$('nav.brands');
    await grelha.scrollIntoViewIfNeeded(); await p.waitForTimeout(1200);
    await grelha.screenshot({ path: `res/${pre}-grelha.png` });
    const tiles = await p.$$eval('nav.brands a', (as) => as.map((a) => a.getAttribute('href') + '@' + Math.round(a.getBoundingClientRect().top) + ',' + Math.round(a.getBoundingClientRect().left) + 'x' + Math.round(a.getBoundingClientRect().width)));
    const artigos = await p.$$eval('article.project', (as) => as.map((a) => a.id));
    const sub = await p.$eval('.hero .sub', (e) => e.textContent.trim());
    const largo = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    await p.click('nav.brands a[href="#caiu"]'); await p.waitForTimeout(2500);
    await p.screenshot({ path: `res/${pre}-artigo-caiu.png` });
    log.push(`${pre}: nome no baralho depois de ~13 s: ${ordemBaralho}\n  grelha: ${tiles.join(' ')}\n  artigos: ${artigos.join(' ')}\n  frase: ${sub}\n  scroll lateral: ${largo}\n  erros: ${erros.join(' | ') || 'nenhum'}`);
    await ctx.close();
  }
  await browser.close();
}
fs.writeFileSync('res/log.txt', log.join('\n'));
