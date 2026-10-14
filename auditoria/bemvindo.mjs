// Testa e fotografa o carrossel de boas-vindas (primeira visita) em 3 temas e vários tamanhos.
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = 'http://127.0.0.1:3000';
const SAIDA = process.env.SAIDA || 'res';
fs.mkdirSync(SAIDA, { recursive: true });
const res = { testes: [], consola: [] };
const ok = (nome, cond, extra = '') => { res.testes.push({ nome, ok: !!cond, extra: String(extra) }); console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');

// Um navegador "normal": o de testes anuncia-se como HeadlessChrome com webdriver=true e a app (de propósito) trata isso como robô
const UA_TELEMOVEL = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const UA_COMPUTADOR = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
async function contexto(browser, { w, h, tema = 'claro', ua, init = '', robo = false }) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'pt-PT', timezoneId: 'Europe/Lisbon', hasTouch: w < 1024, isMobile: w < 700, userAgent: robo ? undefined : (ua || (w < 700 ? UA_TELEMOVEL : UA_COMPUTADOR)) });
  if (!robo) await ctx.addInitScript({ content: `try{ Object.defineProperty(Navigator.prototype,'webdriver',{get:()=>false,configurable:true}); }catch(e){}` });
  await ctx.addInitScript({ content: `try{ if(!localStorage.getItem('parou_tema')) localStorage.setItem('parou_tema','${tema}'); localStorage.setItem('parou_aviso_instalar','1'); }catch(e){} ${init}` });
  await ctx.route(/(tile|openstreetmap|arcgisonline|cartocdn|basemaps)\./i, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  const p = await ctx.newPage();
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon|ERR_/.test(m.text())) res.consola.push(m.text().slice(0, 200)); });
  p.on('pageerror', (e) => res.consola.push('PAGEERROR ' + String(e).slice(0, 200)));
  return { ctx, p };
}
const dialogo = (p) => p.locator('[data-teste="bem-vindo"]');
const aparece = async (p, ms = 6000) => { try { await dialogo(p).waitFor({ state: 'visible', timeout: ms }); return true; } catch { return false; } };
const naoAparece = async (p, ms = 3000) => { await p.waitForTimeout(ms); return (await dialogo(p).count()) === 0; };
const estado = (p) => p.evaluate(() => localStorage.getItem('parou_bemvindo'));
const foto = (p, nome) => p.screenshot({ path: `${SAIDA}/${nome}.png` });
const semTransbordo = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const passoAtivo = (p) => p.evaluate(() => { const s = [...document.querySelectorAll('[data-teste="bem-vindo"] [data-passo]')].find((e) => e.getAttribute('aria-hidden') === 'false'); return s ? s.getAttribute('data-passo') : null; });
const alturaOk = (p) => p.evaluate(() => { const d = document.querySelector('[role="dialog"]'); if (!d) return false; const r = d.getBoundingClientRect(); return r.top >= -1 && r.bottom <= window.innerHeight + 1; });

const PASSOS = ['idioma', 'perto', 'destinos', 'horarios', 'alertas', 'comunidade', 'conta'];

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });

  // A) Primeira visita: aparece, percorre os 7 passos nos 3 temas e em 3 tamanhos
  for (const [w, h] of [[390, 780], [320, 568], [1280, 800]]) {
    for (const tema of ['claro', 'escuro', 'ambar']) {
      if (w === 320 && tema !== 'claro') continue;
      const { ctx, p } = await contexto(browser, { w, h, tema });
      await p.goto(BASE + '/', { waitUntil: 'load' });
      const viu = await aparece(p);
      ok(`[${w} ${tema}] aparece na primeira visita`, viu);
      if (!viu) { await foto(p, `${w}_${tema}_FALHA`); await ctx.close(); continue; }
      await p.waitForTimeout(500);
      await foto(p, `${w}_${tema}_0_idioma`);
      ok(`[${w} ${tema}] diálogo cabe no ecrã (passo 0)`, await alturaOk(p));
      await p.locator('[data-teste="bv-idioma-pt"]').click();
      for (let i = 1; i < PASSOS.length; i++) {
        await p.waitForTimeout(450);
        const a = await passoAtivo(p);
        ok(`[${w} ${tema}] passo ${i} = ${PASSOS[i]}`, a === PASSOS[i], a);
        if (w !== 320 || i === 1 || i === 6) await foto(p, `${w}_${tema}_${i}_${PASSOS[i]}`);
        if (i === 3 || i === 6) ok(`[${w} ${tema}] diálogo cabe no ecrã (passo ${i})`, await alturaOk(p));
        if (i < PASSOS.length - 1) await p.getByRole('button', { name: /^Seguinte$/ }).click();
      }
      ok(`[${w} ${tema}] sem scroll lateral`, await semTransbordo(p));
      await p.getByRole('button', { name: /^Finalizar$/ }).click();
      await p.waitForTimeout(400);
      ok(`[${w} ${tema}] fecha em Finalizar`, (await dialogo(p).count()) === 0);
      ok(`[${w} ${tema}] fica guardado como visto`, (await estado(p)) === 'visto', await estado(p));
      await p.reload({ waitUntil: 'load' });
      ok(`[${w} ${tema}] não volta a aparecer`, await naoAparece(p, 2500));
      await ctx.close();
    }
  }

  // B) Mudar de idioma a meio: recarrega e retoma no passo 1 já em inglês
  {
    const { ctx, p } = await contexto(browser, { w: 390, h: 780 });
    await p.goto(BASE + '/', { waitUntil: 'load' });
    await aparece(p);
    await Promise.all([p.waitForNavigation({ waitUntil: 'load', timeout: 20000 }), p.locator('[data-teste="bv-idioma-en"]').click()]);
    ok('[idioma] depois de escolher inglês volta a abrir o carrossel', await aparece(p));
    await p.waitForTimeout(600);
    ok('[idioma] retoma no passo 2 (perto)', (await passoAtivo(p)) === 'perto', await passoAtivo(p));
    const titulo = await p.locator('[data-passo="perto"] h3').innerText();
    ok('[idioma] texto em inglês', /near you|nearby/i.test(titulo) || /passing/i.test(titulo) || !/Vê o que/.test(titulo), titulo);
    await foto(p, 'idioma_en_passo1');
    ok('[idioma] estado guardado "curso:1"', (await estado(p)) === 'curso:1', await estado(p));
    await p.getByRole('button', { name: /^Next$/ }).click();
    await p.waitForTimeout(450);
    await foto(p, 'idioma_en_passo2');
    // vai até ao fim e termina
    for (let i = 0; i < 4; i++) { await p.getByRole('button', { name: /^Next$/ }).click(); await p.waitForTimeout(350); }
    await foto(p, 'idioma_en_conta');
    await p.getByRole('button', { name: /^Finish$/ }).click();
    await p.waitForTimeout(300);
    ok('[idioma] termina e fica visto', (await estado(p)) === 'visto', await estado(p));
    await ctx.close();
  }
  // B2) Francês e alemão: fotografa o primeiro passo depois da escolha
  for (const l of ['fr', 'de']) {
    const { ctx, p } = await contexto(browser, { w: 390, h: 780 });
    await p.goto(BASE + '/', { waitUntil: 'load' });
    await aparece(p);
    await Promise.all([p.waitForNavigation({ waitUntil: 'load', timeout: 20000 }), p.locator(`[data-teste="bv-idioma-${l}"]`).click()]);
    await aparece(p);
    await p.waitForTimeout(600);
    await foto(p, `idioma_${l}_passo1`);
    await ctx.close();
  }

  // C) Quem já usava a PAROU (tem favoritos guardados) não vê nada
  {
    const { ctx, p } = await contexto(browser, { w: 390, h: 780, init: "try{ if(localStorage.getItem('parou_bemvindo')===null) localStorage.setItem('parou_favorite_line_ids','[]'); }catch(e){}" });
    await p.goto(BASE + '/', { waitUntil: 'load' });
    ok('[existente] utilizador antigo não vê', await naoAparece(p, 3000));
    ok('[existente] fica marcado como visto', (await estado(p)) === 'visto', await estado(p));
    await ctx.close();
  }

  // D) Primeira visita numa página de horários (vindo do Google): não incomoda; ao abrir o início, aparece
  {
    const { ctx, p } = await contexto(browser, { w: 390, h: 780 });
    await p.goto(BASE + '/transportes', { waitUntil: 'load' });
    ok('[ligação direta] /transportes não mostra', await naoAparece(p, 2500));
    ok('[ligação direta] continua "novo"', (await estado(p)) === 'novo', await estado(p));
    await p.goto(BASE + '/', { waitUntil: 'load' });
    ok('[ligação direta] ao abrir o início aparece', await aparece(p));
    await ctx.close();
  }

  // E) Robôs (Google) não veem o carrossel
  {
    const { ctx, p } = await contexto(browser, { w: 390, h: 780, ua: 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' });
    await p.goto(BASE + '/', { waitUntil: 'load' });
    ok('[robô] Googlebot não vê', await naoAparece(p, 2500));
    await ctx.close();
  }

  // E2) O navegador automático (webdriver, HeadlessChrome) também conta como robô
  {
    const { ctx, p } = await contexto(browser, { w: 390, h: 780, robo: true });
    await p.goto(BASE + '/', { waitUntil: 'load' });
    ok('[robô] navegador automático não vê', await naoAparece(p, 2500));
    await ctx.close();
  }

  // F) Administração: botão temporário no menu "Mais" abre o carrossel sem mexer no que está guardado
  for (const [w, h, nome] of [[390, 780, 'm'], [1280, 800, 'd']]) {
    const { ctx, p } = await contexto(browser, { w, h, init: "try{ localStorage.setItem('parou_bemvindo','visto'); localStorage.setItem('parou_admin','a'.repeat(24)); }catch(e){}" });
    await p.goto(BASE + '/transportes', { waitUntil: 'load' });
    await p.waitForTimeout(1200);
    await p.locator('button[aria-expanded]').filter({ hasText: /Mais|More/ }).first().click();
    await p.waitForTimeout(250);
    const botao = p.locator('[data-teste="menu-bemvindo"]');
    ok(`[admin ${nome}] botão "Ver boas-vindas" existe no menu`, (await botao.count()) === 1);
    await foto(p, `admin_${nome}_menu`);
    await botao.click();
    ok(`[admin ${nome}] abre o carrossel`, await aparece(p, 4000));
    await p.waitForTimeout(500);
    await p.locator('[data-teste="bv-idioma-pt"]').click();
    await p.waitForTimeout(450);
    ok(`[admin ${nome}] segue para o passo 2`, (await passoAtivo(p)) === 'perto');
    await p.getByRole('button', { name: 'Fechar' }).first().click();
    await p.waitForTimeout(300);
    ok(`[admin ${nome}] fecha`, (await dialogo(p).count()) === 0);
    ok(`[admin ${nome}] estado continua "visto"`, (await estado(p)) === 'visto', await estado(p));
    await ctx.close();
  }

  // G) Teclado: setas mudam de passo, Esc fecha
  {
    const { ctx, p } = await contexto(browser, { w: 1280, h: 800 });
    await p.goto(BASE + '/', { waitUntil: 'load' });
    await aparece(p);
    await p.locator('[data-teste="bv-idioma-pt"]').click();
    await p.waitForTimeout(400);
    await p.keyboard.press('ArrowRight');
    await p.waitForTimeout(400);
    ok('[teclado] seta direita avança', (await passoAtivo(p)) === 'destinos', await passoAtivo(p));
    await p.keyboard.press('ArrowLeft');
    await p.waitForTimeout(400);
    ok('[teclado] seta esquerda recua', (await passoAtivo(p)) === 'perto', await passoAtivo(p));
    await p.keyboard.press('Escape');
    await p.waitForTimeout(300);
    ok('[teclado] Esc fecha', (await dialogo(p).count()) === 0);
    ok('[teclado] Esc deixa guardado como visto', (await estado(p)) === 'visto', await estado(p));
    await ctx.close();
  }

  res.consolaTotal = res.consola.length;
  ok('sem erros de consola', res.consola.length === 0, res.consola.slice(0, 3).join(' | '));
  fs.writeFileSync(`${SAIDA}/resultado.json`, JSON.stringify(res, null, 1));
  const falhas = res.testes.filter((t) => !t.ok);
  console.log(`\n${res.testes.length - falhas.length}/${res.testes.length} testes OK`);
  await browser.close();
})();
