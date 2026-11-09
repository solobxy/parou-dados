// Volta completa pela app para rever o design: fotografa os ecrãs principais em telemóvel (390, 320) e computador (1280),
// nos 3 temas, com localização na Baixa de Lisboa. Mede também problemas fáceis de apanhar à máquina: scroll lateral,
// alvos de toque pequenos, texto cortado, erros na consola. Resultado: SAIDA/*.png e SAIDA/relatorio.json
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const SAIDA = process.env.SAIDA || 'res';
fs.mkdirSync(SAIDA, { recursive: true });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
const UA_TEL = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const UA_PC = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const LX = { latitude: 38.7107, longitude: -9.1365 };
const rel = { ecras: [], consola: [] };

async function contexto(browser, w, h, tema, opcoes = {}) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h }, locale: 'pt-PT', timezoneId: 'Europe/Lisbon', hasTouch: w < 1024, isMobile: w < 700,
    userAgent: opcoes.ua || (w < 700 ? UA_TEL : UA_PC), geolocation: LX, permissions: ['geolocation'], deviceScaleFactor: w < 700 ? 2 : 1,
  });
  await ctx.addInitScript({ content: `try{ Object.defineProperty(Navigator.prototype,'webdriver',{get:()=>false,configurable:true}); }catch(e){}
    try{ localStorage.setItem('parou_tema','${tema}'); ${opcoes.convite ? '' : "localStorage.setItem('parou_aviso_instalar','1');"} localStorage.setItem('parou_bemvindo','visto'); }catch(e){}` });
  await ctx.route(/(tile|openstreetmap|arcgisonline|cartocdn|basemaps)\./i, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  const p = await ctx.newPage();
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|favicon|ERR_/.test(m.text())) rel.consola.push(`${w} ${tema}: ${m.text().slice(0, 180)}`); });
  p.on('pageerror', (e) => rel.consola.push(`${w} ${tema} PAGEERROR ${String(e).slice(0, 180)}`));
  p.on('response', async (r) => {
    if (!r.url().includes('/api/transit/caminho-a-pe')) return;
    const j = await r.json().catch(() => null);
    respostasAPe.push(`HTTP ${r.status()} ${j?.caminho ? j.metros + ' m' : 'reta'}`);
  });
  return { ctx, p };
}

// Problemas que uma máquina vê: scroll lateral, alvos de toque < 40 px, texto cortado com reticências, texto a sair do ecrã
const medir = (p) => p.evaluate(() => {
  const out = { scrollLateral: document.documentElement.scrollWidth > window.innerWidth + 1, alvosPequenos: [], cortados: [], foraDoEcra: [] };
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && r.bottom > 0 && r.top < innerHeight; };
  for (const e of document.querySelectorAll('button, a[href], [role="button"], input, select')) {
    if (!vis(e)) continue;
    const r = e.getBoundingClientRect();
    if ((r.width < 40 || r.height < 40) && r.width * r.height > 0) {
      const nome = (e.getAttribute('aria-label') || e.textContent || e.getAttribute('placeholder') || e.tagName).trim().replace(/\s+/g, ' ').slice(0, 40);
      out.alvosPequenos.push(`${nome} ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    if (r.right > innerWidth + 1) out.foraDoEcra.push((e.textContent || '').trim().slice(0, 40));
  }
  for (const e of document.querySelectorAll('*')) {
    if (!vis(e) || e.children.length) continue;
    const s = getComputedStyle(e);
    if (s.textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth + 1) out.cortados.push(e.textContent.trim().slice(0, 50));
  }
  out.alvosPequenos = [...new Set(out.alvosPequenos)].slice(0, 25);
  out.cortados = [...new Set(out.cortados)].slice(0, 20);
  return out;
});

async function foto(p, nome, extra = {}) {
  await p.waitForTimeout(400);
  const m = await medir(p).catch(() => ({}));
  await p.screenshot({ path: `${SAIDA}/${nome}.png`, fullPage: !!extra.inteira });
  rel.ecras.push({ nome, ...m });
  console.log(nome, m.scrollLateral ? 'SCROLL-LATERAL' : '', `alvos<40: ${(m.alvosPequenos || []).length}`, `cortados: ${(m.cortados || []).length}`);
}
const ir = async (p, caminho, ms = 3500) => { try { await p.goto(BASE + caminho, { waitUntil: 'load', timeout: 60000 }); } catch (e) { rel.consola.push('goto ' + caminho + ' ' + String(e).slice(0, 120)); } await p.waitForTimeout(ms); };
const tocar = async (p, loc, ms = 1500) => {
  try { await loc.first().click({ timeout: 6000 }); }
  catch { try { await loc.first().click({ timeout: 4000, force: true }); } catch { return false; } }
  await p.waitForTimeout(ms);
  return true;
};

// Troços a pé no mapa (linha às bolinhas): pelas ruas têm muitos pontos; em linha reta só 2. Aproxima o mapa do maior
// troço (roda do rato por cima dele) e fotografa.
const trocosDoMapa = (p) => p.evaluate(() => [...document.querySelectorAll('.leaflet-container svg path')]
  .filter((e) => /^1[ ,]+9$/.test((e.getAttribute('stroke-dasharray') || '').trim()))
  .map((e) => { const r = e.getBoundingClientRect(); return { pontos: ((e.getAttribute('d') || '').match(/[ML]/g) || []).length, x: r.x, y: r.y, w: r.width, h: r.height }; }));
const respostasAPe = [];
async function trocosAPe(p, k) {
  await p.waitForTimeout(3000); // o caminho pelas ruas chega depois da linha reta
  // (as respostas guardadas são as desta página e das voltas anteriores sem esta verificação)
  console.log(`[${k}] pedidos do caminho a pé: ${respostasAPe.splice(0).join(' | ') || 'nenhum'}`);
  const trocos = await trocosDoMapa(p).catch(() => []);
  // Em linha reta cada troço tem 2 pontos; pelas ruas tem mais (o Leaflet simplifica ao nível de zoom: uma rua a direito
  // continua com poucos pontos, por isso basta um troço com mais de 2)
  const pelasRuas = trocos.filter((t) => t.pontos > 2).length;
  console.log(`${pelasRuas ? 'OK     ' : 'FALHOU '} [${k}] troços a pé pelas ruas: ${pelasRuas}/${trocos.length} (${trocos.map((t) => t.pontos + ' pontos').join(', ')})`);
  rel.trocosAPe = { ...(rel.trocosAPe || {}), [k]: trocos };
  const maior = [...trocos].sort((a, b) => b.w * b.h - a.w * a.h)[0];
  if (!maior) return;
  await p.mouse.move(maior.x + maior.w / 2, maior.y + maior.h / 2);
  for (let i = 0; i < 4; i++) { await p.mouse.wheel(0, -240); await p.waitForTimeout(450); }
  await p.waitForTimeout(1200);
  await foto(p, `${k}_04c_troco_a_pe`);
}

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const CONF = [[390, 844, 'claro'], [390, 844, 'escuro'], [390, 844, 'ambar'], [320, 640, 'claro'], [1280, 800, 'claro'], [1280, 800, 'escuro']];
  for (const [w, h, tema] of CONF) {
    const { ctx, p } = await contexto(browser, w, h, tema);
    const k = `${w}_${tema}`;
    const completo = w === 390 && tema === 'claro' || w === 1280 && tema === 'claro';
    // 1. Início (Perto) e a página inteira
    await ir(p, '/', 7000);
    await foto(p, `${k}_01_inicio`);
    if (completo) await foto(p, `${k}_01b_inicio_inteiro`, { inteira: true });
    // 2. Para onde vais? → Colombo → opções → abrir a primeira
    const campo = p.locator('input[placeholder="Para onde vais?"]:visible');
    if (await tocar(p, campo, 600)) {
      await campo.first().fill('colombo');
      await p.waitForTimeout(1800);
      await foto(p, `${k}_02_pesquisa`);
      if (await tocar(p, p.locator('button:visible:has-text("Centro Comercial Colombo")'), 7000)) {
        await foto(p, `${k}_03_opcoes`);
        if (completo) await foto(p, `${k}_03b_opcoes_inteiro`, { inteira: true });
        if (await tocar(p, p.locator('[data-teste="opcao-rota"]'), 2500)) {
          await foto(p, `${k}_04_opcao_aberta`);
          if (completo) await trocosAPe(p, k);
        }
      }
    }
    if (!completo && w === 390) { await ir(p, '/', 4000); if (await tocar(p, p.locator('[data-teste="botao-menu"]:visible'), 900)) await foto(p, `${k}_23_menu`); }
    // 3. Paragem perto (detalhe)
    await ir(p, '/', 6000);
    if (await tocar(p, p.locator('[data-teste="paragem-perto"]'), 3500)) await foto(p, `${k}_05_paragem`);
    // 4. Outros separadores e páginas
    const PAGINAS = completo || w === 320
      ? [['/horarios', '06_horarios'], ['/mapa', '07_alertas'], ['/alertas', '08_noticias'], ['/comunidade', '09_comunidade'], ['/ocorrencias', '10_ocorrencias'], ['/favoritos', '11_favoritos'], ['/greves', '12_greves'], ['/sobre', '13_sobre'], ['/linhas', '14_seo_linhas'], ['/linhas/carris', '15_seo_operador'], ['/cidade/lisboa', '16_seo_cidade']]
      : [['/horarios', '06_horarios'], ['/mapa', '07_alertas'], ['/comunidade', '09_comunidade']];
    for (const [c, n] of PAGINAS) { await ir(p, c, 4000); await foto(p, `${k}_${n}`); }
    if (completo) {
      // página de uma linha e de uma paragem (o que vem do Google)
      await ir(p, '/linhas/carris', 2500);
      const ligacao = await p.locator('a[href^="/linhas/carris/"]').first().getAttribute('href').catch(() => null);
      if (ligacao) { await ir(p, ligacao, 3000); await foto(p, `${k}_17_seo_linha`); await foto(p, `${k}_17b_seo_linha_inteira`, { inteira: true }); }
      const lp = await p.locator('a[href^="/paragem/"]').first().getAttribute('href').catch(() => null);
      if (lp) { await ir(p, lp, 3000); await foto(p, `${k}_18_seo_paragem`); }
      // menu "Mais" (computador) / conta (telemóvel)
      await ir(p, '/', 4000);
      if (w >= 1024) { if (await tocar(p, p.locator('button:has-text("Mais")'), 800)) await foto(p, `${k}_19_menu_mais`); }
      if (await tocar(p, p.locator('[data-teste="botao-entrar"]'), 1500)) await foto(p, `${k}_20_entrar`);
      await ir(p, '/', 4000);
      if (await tocar(p, p.locator('[data-teste="botao-menu"]:visible'), 900)) await foto(p, `${k}_23_menu`);
      await ir(p, '/', 4000);
      if (await tocar(p, p.locator('[aria-label="Abrir pesquisa"]'), 1200)) await foto(p, `${k}_21_pesquisa_geral`);
      await ir(p, '/', 4000);
      if (await tocar(p, p.locator('[aria-label="Notificações"]'), 1200)) await foto(p, `${k}_22_notificacoes`);
    }
    await ctx.close();
  }
  // Convite para instalar: aparece depois de abrir uma opção de viagem (só no telemóvel, uma vez por sessão)
  const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
  for (const [w, h, tema, ua] of [[390, 844, 'claro', null], [390, 844, 'escuro', null], [390, 844, 'ambar', null], [320, 640, 'claro', null], [390, 844, 'claro', UA_IPHONE]]) {
    const { ctx, p } = await contexto(browser, w, h, tema, { convite: true, ua });
    const k = `${w}_${tema}${ua ? '_iphone' : ''}`;
    await ir(p, '/', 7000);
    const semConvite = !(await p.locator('[data-teste="convite-instalar"]').isVisible().catch(() => false));
    console.log(`${semConvite ? 'OK     ' : 'FALHOU '} [${k}] sem convite à entrada`);
    const campo = p.locator('input[placeholder="Para onde vais?"]:visible');
    if (await tocar(p, campo, 600)) {
      await campo.first().fill('colombo');
      await p.waitForTimeout(1800);
      if (await tocar(p, p.locator('button:visible:has-text("Centro Comercial Colombo")'), 7000) && await tocar(p, p.locator('[data-teste="opcao-rota"]'), 2500)) {
        await p.waitForTimeout(1500);
        const cartao = p.locator('[data-teste="convite-instalar"]');
        const ve = await cartao.isVisible().catch(() => false);
        const caixa = ve ? await cartao.boundingBox() : null;
        const dentro = !!caixa && caixa.x >= 0 && caixa.x + caixa.width <= w + 1 && caixa.y + caixa.height <= h;
        console.log(`${ve && dentro ? 'OK     ' : 'FALHOU '} [${k}] convite aparece depois de abrir a opção, dentro do ecrã`, caixa ? JSON.stringify(caixa) : '');
        await foto(p, `${k}_24_convite_instalar`);
        if (await tocar(p, p.locator('[data-teste="convite-instalar-botao"]'), 3200)) {
          const passos = await p.locator('[data-teste="convite-instalar-passos"]').isVisible().catch(() => false);
          console.log(`${passos ? 'OK     ' : 'FALHOU '} [${k}] sem pedido do browser, mostra como instalar`);
          await foto(p, `${k}_25_convite_passos`);
        }
        if (await tocar(p, p.locator('[data-teste="convite-instalar-fechar"]'), 600)) {
          const foi = !(await cartao.isVisible().catch(() => false));
          const mem = await p.evaluate(() => localStorage.getItem('parou_convite_instalar')).catch(() => null);
          console.log(`${foi && /"vezes":1/.test(mem || '') ? 'OK     ' : 'FALHOU '} [${k}] "agora não" fecha e lembra-se`, mem || '');
          // abrir outra opção na mesma sessão: não volta a aparecer
          await tocar(p, p.locator('[data-teste="opcao-rota"]').nth(1), 2600);
          const outraVez = await cartao.isVisible().catch(() => false);
          console.log(`${!outraVez ? 'OK     ' : 'FALHOU '} [${k}] não volta a aparecer na mesma sessão`);
        }
      } else console.log(`FALHOU  [${k}] não consegui abrir uma opção de viagem`);
    }
    await ctx.close();
  }
  // No computador nunca aparece (instala-se pelo menu)
  {
    const { ctx, p } = await contexto(browser, 1280, 800, 'claro', { convite: true });
    await ir(p, '/', 7000);
    const campo = p.locator('input[placeholder="Para onde vais?"]:visible');
    if (await tocar(p, campo, 600)) {
      await campo.first().fill('colombo');
      await p.waitForTimeout(1800);
      if (await tocar(p, p.locator('button:visible:has-text("Centro Comercial Colombo")'), 7000) && await tocar(p, p.locator('[data-teste="opcao-rota"]'), 4000)) {
        const ve = await p.locator('[data-teste="convite-instalar"]').isVisible().catch(() => false);
        console.log(`${!ve ? 'OK     ' : 'FALHOU '} [1280] no computador não há convite`);
      }
    }
    await ctx.close();
  }
  // Sem localização (recusada): o que vê quem não deixa
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-PT', isMobile: true, hasTouch: true, userAgent: UA_TEL, deviceScaleFactor: 2 });
    await ctx.addInitScript({ content: `try{ Object.defineProperty(Navigator.prototype,'webdriver',{get:()=>false,configurable:true}); localStorage.setItem('parou_bemvindo','visto'); localStorage.setItem('parou_aviso_instalar','1'); }catch(e){}` });
    await ctx.route(/(tile|openstreetmap|arcgisonline|cartocdn|basemaps)\./i, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    const p = await ctx.newPage();
    await ir(p, '/', 6000);
    await foto(p, '390_claro_00_sem_localizacao');
    await ctx.close();
  }
  fs.writeFileSync(`${SAIDA}/relatorio.json`, JSON.stringify(rel, null, 1));
  console.log('consola:', rel.consola.length, 'erros');
  await browser.close();
})();
