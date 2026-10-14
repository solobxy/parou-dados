// Auditoria de aparelhos pequenos e iPhone: abre a app com o motor do Safari (WebKit) e o do Chrome em vários
// telemóveis e tablets, nos 3 temas, e verifica o que costuma falhar nos iPhone Mini/SE:
//  - campos de texto com letra menor que 16 px (o iOS faz zoom ao tocar e a página fica "grande demais")
//  - conteúdo que sai do ecrã para o lado, barra de baixo tapada ou cortada, botões que não recebem o toque
//  - janelas (entrar, publicar) que não cabem no ecrã
// Resultado em SAIDA (consola.txt, resultado.json e fotografias).
import { chromium, webkit, devices } from 'playwright';
import fs from 'fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const SAIDA = process.env.SAIDA || 'res';
fs.mkdirSync(SAIDA, { recursive: true });
const TEMAS = ['claro', 'escuro', 'ambar'];
const ROTAS = ['/', '/transportes', '/mapa', '/alertas', '/comunidade', '/favoritos'];
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');

// [nome do aparelho, motor, tema(s)]. Os "completos" correm os 3 temas.
const ALVOS = [
  ['iPhone SE', 'webkit', 'todos'],               // 320×568 (o mais estreito)
  ['iPhone 8', 'webkit', 'claro'],                // 375×667 (SE 2/3)
  ['iPhone 12 Mini', 'webkit', 'todos'],
  ['iPhone 13 Mini', 'webkit', 'todos'],
  ['iPhone 13', 'webkit', 'claro'],
  ['iPhone 14 Pro Max', 'webkit', 'todos'],
  ['iPhone SE landscape', 'webkit', 'claro'],
  ['iPhone 13 Mini landscape', 'webkit', 'todos'],
  ['iPhone 14 Pro Max landscape', 'webkit', 'claro'],
  ['iPad Mini', 'webkit', 'claro'],
  ['iPad Mini landscape', 'webkit', 'claro'],
  ['iPad Pro 11', 'webkit', 'claro'],
  ['Galaxy S9+', 'chromium', 'claro'],            // 320×658
  ['Galaxy S5', 'chromium', 'claro'],             // 360×640
  ['Pixel 5', 'chromium', 'claro'],
  ['Galaxy Fold (ecrã de fora)', 'chromium', 'claro', { viewport: { width: 280, height: 653 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-F926B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' }],
];

const res = { aparelhos: [], testes: [], notas: [] };
const ok = (nome, cond, extra = '') => { res.testes.push({ nome, ok: !!cond, extra: String(extra) }); console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };
const aviso = (nome, extra = '') => { res.notas.push(`${nome} ${extra}`); console.log('AVISO  ', nome, extra); };

const init = (tema) => `
try{ Object.defineProperty(Navigator.prototype,'webdriver',{get:()=>false,configurable:true}); }catch(e){}
try{ localStorage.setItem('parou_tema','${tema}'); localStorage.setItem('parou_aviso_instalar','1'); localStorage.setItem('parou_bemvindo','visto'); localStorage.setItem('parou_localizacao_ok','1'); }catch(e){}
`;

// Medições feitas dentro da página
const medir = `(() => {
  const vw = window.innerWidth, vh = window.innerHeight;
  const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0'; };
  const descr = (e) => e.tagName.toLowerCase() + (e.type ? '[' + e.type + ']' : '') + ' "' + ((e.getAttribute('aria-label') || e.getAttribute('placeholder') || e.getAttribute('name') || e.id || e.textContent || '').trim().slice(0, 28)) + '"';
  const campos = [...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]):not([type=hidden]):not([type=color]):not([type=submit]):not([type=button]), textarea, select')].filter(vis);
  const camposPequenos = campos.filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16 - 0.01).map((e) => descr(e) + ' ' + getComputedStyle(e).fontSize);
  const transbordam = [...document.querySelectorAll('body *')].filter((e) => {
    if (!vis(e)) return false;
    const r = e.getBoundingClientRect();
    if (r.right <= vw + 1 && r.left >= -1) return false;
    if (e.closest('.leaflet-container,[data-rolagem],.overflow-x-auto,.overflow-auto,.scroll-x,[class*="overflow-x"],[class*="snap-x"]')) return false;
    return true;
  }).slice(0, 6).map((e) => descr(e) + ' l=' + Math.round(e.getBoundingClientRect().left) + ' r=' + Math.round(e.getBoundingClientRect().right));
  // Barra de baixo (fixa): dentro do ecrã e com botões que recebem o toque
  const barras = [...document.querySelectorAll('body *')].filter((e) => getComputedStyle(e).position === 'fixed' && vis(e)).filter((e) => { const r = e.getBoundingClientRect(); return r.bottom >= vh - 4 && r.width >= vw * 0.9 && r.height < 140; });
  const barra = barras[0] || null;
  let barraInfo = null;
  if (barra) {
    const r = barra.getBoundingClientRect();
    const botoes = [...barra.querySelectorAll('button,a')].filter(vis);
    const semToque = botoes.filter((b) => { const q = b.getBoundingClientRect(); const x = q.left + q.width / 2, y = q.top + q.height / 2; const h = document.elementFromPoint(x, y); return !(h && (b === h || b.contains(h))); }).map(descr);
    barraInfo = { fundo: Math.round(r.bottom), altura: Math.round(r.height), vh, botoes: botoes.length, semToque, cortada: r.bottom > vh + 1 || r.left < -1 || r.right > vw + 1 };
  }
  const principal = document.querySelector('main, #root > div');
  return {
    vw, vh, dpr: window.devicePixelRatio, escala: window.visualViewport ? +window.visualViewport.scale.toFixed(3) : null,
    fonteRaiz: getComputedStyle(document.documentElement).fontSize,
    scrollW: document.documentElement.scrollWidth, bodyScrollW: document.body.scrollWidth,
    transbordam, campos: campos.length, camposPequenos, barra: barraInfo,
    alturaPagina: document.documentElement.scrollHeight,
    textoMiudo: [...document.querySelectorAll('body *')].filter((e) => { if (!vis(e)) return false; const t = [...e.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim().length > 2); return t.length && parseFloat(getComputedStyle(e).fontSize) < 10 && !e.closest('.leaflet-container'); }).length,
  };
})()`;

async function novoContexto(browsers, [nome, motor, , extra], tema) {
  const base = devices[nome] ? { ...devices[nome] } : {};
  const ctx = await browsers[motor].newContext({
    ...base, ...(extra || {}),
    locale: 'pt-PT', timezoneId: 'Europe/Lisbon', geolocation: { latitude: 41.1496, longitude: -8.6109, accuracy: 20 }, permissions: ['geolocation'],
  });
  await ctx.addInitScript({ content: init(tema) });
  await ctx.route(/(tile|openstreetmap|arcgisonline|cartocdn|basemaps)\./i, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  return ctx;
}

(async () => {
  const browsers = { webkit: await webkit.launch(), chromium: await chromium.launch({ args: ['--no-sandbox'] }) };
  for (const alvo of ALVOS) {
    const [nome, motor, temasSel, extra] = alvo;
    if (!devices[nome] && !extra) { aviso(`aparelho desconhecido no Playwright: ${nome}`); continue; }
    const vp = (devices[nome] || extra).viewport;
    const rotulo = `${nome} ${vp.width}×${vp.height}`;
    const temas = temasSel === 'todos' ? TEMAS : ['claro'];
    const reg = { aparelho: rotulo, motor, rotas: [], interacoes: [] };
    res.aparelhos.push(reg);
    const fotografar = /Mini|SE|Pro Max|Fold/.test(nome);

    for (const tema of temas) {
      const ctx = await novoContexto(browsers, alvo, tema);
      const p = await ctx.newPage();
      const consola = [];
      p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon|ERR_|net::/.test(m.text())) consola.push(m.text().slice(0, 160)); });
      p.on('pageerror', (e) => consola.push('PAGEERROR ' + String(e).slice(0, 160)));

      // ---- A) Ecrãs
      for (const rota of ROTAS) {
        try {
          await p.goto(BASE + rota, { waitUntil: 'load' });
          await p.waitForTimeout(rota === '/' ? 2500 : 1800);
          // fecha o popup do ponto diário, se aparecer
          await p.locator('[data-teste=ponto-diario-fechar]').first().click({ timeout: 800 }).catch(() => {});
          const m = await p.evaluate(medir);
          const r = { tema, rota, ...m };
          reg.rotas.push(r);
          const rot = `[${rotulo} ${tema} ${rota}]`;
          ok(`${rot} sem scroll lateral`, m.scrollW <= m.vw + 1 && m.bodyScrollW <= m.vw + 1, `scrollW=${m.scrollW} vw=${m.vw}`);
          ok(`${rot} nada sai do ecrã para o lado`, m.transbordam.length === 0, m.transbordam.slice(0, 3).join(' | '));
          if (m.barra) {
            ok(`${rot} barra de baixo inteira no ecrã`, !m.barra.cortada, `fundo=${m.barra.fundo} vh=${m.barra.vh}`);
            ok(`${rot} todos os botões da barra recebem o toque`, m.barra.semToque.length === 0, m.barra.semToque.join(' | '));
          }
          if (m.camposPequenos.length) aviso(`${rot} campos com letra < 16px (o iOS faz zoom ao tocar)`, m.camposPequenos.slice(0, 4).join(' | '));
          ok(`${rot} campos de texto com letra >= 16px`, m.camposPequenos.length === 0, m.camposPequenos.slice(0, 3).join(' | '));
          if (fotografar && ['/', '/transportes', '/comunidade'].includes(rota)) await p.screenshot({ path: `${SAIDA}/${nome.replace(/[^\w]+/g, '_')}_${tema}_${rota === '/' ? 'perto' : rota.slice(1)}.png` });
        } catch (e) { ok(`[${rotulo} ${tema} ${rota}] abrir o ecrã`, false, String(e).slice(0, 140)); }
      }

      // ---- B) Interações (só no tema claro e no escuro, para não demorar)
      if (tema !== 'ambar') {
        // B1) Perto: tocar na pesquisa de destino
        try {
          await p.goto(BASE + '/', { waitUntil: 'load' });
          await p.waitForTimeout(2500);
          await p.locator('[data-teste=ponto-diario-fechar]').first().click({ timeout: 800 }).catch(() => {});
          const campo = p.locator('input[placeholder*="Para onde"]:visible, input[placeholder*="Procurar um local"]:visible, input[placeholder*="Rua, localidade"]:visible').first();
          if (await campo.count()) {
            await campo.click({ timeout: 4000 });
            await p.waitForTimeout(500);
            const dados = await campo.evaluate((e) => ({ fs: parseFloat(getComputedStyle(e).fontSize), h: Math.round(e.getBoundingClientRect().height), escala: window.visualViewport ? window.visualViewport.scale : 1 }));
            ok(`[${rotulo} ${tema}] Perto: a pesquisa de destino não provoca zoom no iOS (letra >= 16px)`, dados.fs >= 16, `letra=${dados.fs}px`);
            ok(`[${rotulo} ${tema}] Perto: a escala da página fica em 1 ao tocar na pesquisa`, Math.abs(dados.escala - 1) < 0.01, dados.escala);
            const m2 = await p.evaluate(medir);
            ok(`[${rotulo} ${tema}] Perto: com a pesquisa aberta nada sai do ecrã`, m2.transbordam.length === 0 && m2.scrollW <= m2.vw + 1, m2.transbordam.slice(0, 2).join(' | '));
            if (fotografar) await p.screenshot({ path: `${SAIDA}/${nome.replace(/[^\w]+/g, '_')}_${tema}_perto_pesquisa.png` });
          } else aviso(`[${rotulo} ${tema}] Perto: campo de pesquisa não encontrado`);
        } catch (e) { ok(`[${rotulo} ${tema}] Perto: pesquisa`, false, String(e).slice(0, 140)); }

        // B2) Entrar / criar conta
        try {
          await p.goto(BASE + '/', { waitUntil: 'load' });
          await p.waitForTimeout(2000);
          await p.locator('[data-teste=ponto-diario-fechar]').first().click({ timeout: 800 }).catch(() => {});
          const bot = p.locator('[data-teste=botao-entrar]').first();
          if (await bot.count() && await bot.isVisible()) {
            await bot.click({ timeout: 4000 });
            await p.waitForTimeout(700);
            const d = await p.evaluate(() => {
              const dlg = document.querySelector('[role=dialog]');
              if (!dlg) return null;
              const r = dlg.getBoundingClientRect();
              const campos = [...dlg.querySelectorAll('input:not([type=checkbox]):not([type=hidden]), textarea, select')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => parseFloat(getComputedStyle(e).fontSize));
              const sc = dlg.querySelector('[class*="overflow-y"]') || dlg;
              return { topo: Math.round(r.top), fundo: Math.round(r.bottom), esq: Math.round(r.left), dir: Math.round(r.right), vw: innerWidth, vh: innerHeight, campos, rolavel: sc.scrollHeight > sc.clientHeight + 1 };
            });
            if (d) {
              ok(`[${rotulo} ${tema}] Entrar: a janela cabe no ecrã`, d.topo >= -1 && d.fundo <= d.vh + 1 && d.esq >= -1 && d.dir <= d.vw + 1, JSON.stringify({ topo: d.topo, fundo: d.fundo, vh: d.vh, esq: d.esq, dir: d.dir, vw: d.vw }));
              ok(`[${rotulo} ${tema}] Entrar: campos com letra >= 16px (sem zoom no iOS)`, d.campos.length > 0 && d.campos.every((f) => f >= 16), d.campos.join(','));
            } else aviso(`[${rotulo} ${tema}] Entrar: sem janela (role=dialog)`);
            if (fotografar) await p.screenshot({ path: `${SAIDA}/${nome.replace(/[^\w]+/g, '_')}_${tema}_entrar.png` });
          } else aviso(`[${rotulo} ${tema}] Entrar: botão não visível`);
        } catch (e) { ok(`[${rotulo} ${tema}] Entrar`, false, String(e).slice(0, 140)); }
      }
      ok(`[${rotulo} ${tema}] sem erros de consola`, consola.length === 0, consola.slice(0, 2).join(' | '));
      await ctx.close();
    }
  }

  fs.writeFileSync(`${SAIDA}/resultado.json`, JSON.stringify(res, null, 1));
  const falhas = res.testes.filter((t) => !t.ok);
  console.log(`\n${res.testes.length - falhas.length}/${res.testes.length} testes OK; ${res.notas.length} avisos`);
  if (falhas.length) { console.log('--- FALHAS ---'); falhas.slice(0, 60).forEach((f) => console.log(f.nome, f.extra)); }
  await browsers.webkit.close(); await browsers.chromium.close();
})();
