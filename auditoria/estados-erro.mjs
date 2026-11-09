// Erro não é o mesmo que «não há nada»: quando um pedido falha (rede, servidor a reiniciar), a app tem de o dizer e deixar
// tentar outra vez, em vez de mostrar a mensagem de «sem resultados».
//
// O problema que isto impede: no planeador, uma falha de rede acabava em «Sem ligações encontradas — não encontrámos ligações
// em transportes daqui para lá», o que é falso; nos Horários, em «Ainda não temos linhas de …». A resposta do servidor é simulada; o que se testa é a app.
// Uso: BASE=http://127.0.0.1:3000 SAIDA=res node estados-erro.mjs
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const SAIDA = process.env.SAIDA || 'res';
fs.mkdirSync(SAIDA, { recursive: true });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
const UA_TEL = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const LX = { latitude: 38.7107, longitude: -9.1365 };
const COLOMBO = { id: 'teste:colombo', title: 'Centro Comercial Colombo', subtitle: 'Lisboa', latitude: 38.7539, longitude: -9.1886, type: 'PLACE' };

let falhas = 0, total = 0;
const ok = (nome, cond, extra = '') => { total++; if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };
const visivel = (p, sel) => p.locator(sel).first().isVisible().catch(() => false);

async function contexto(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, locale: 'pt-PT', timezoneId: 'Europe/Lisbon', hasTouch: true, isMobile: true,
    userAgent: UA_TEL, geolocation: LX, permissions: ['geolocation'], deviceScaleFactor: 2,
  });
  await ctx.addInitScript({ content: `try{ Object.defineProperty(Navigator.prototype,'webdriver',{get:()=>false,configurable:true}); }catch(e){}
    try{ localStorage.setItem('parou_aviso_instalar','1'); localStorage.setItem('parou_bemvindo','visto'); }catch(e){}` });
  await ctx.route(/(tile|openstreetmap|arcgisonline|cartocdn|basemaps)\./i, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await ctx.route('**/api/transit/destinations**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ suggestions: [COLOMBO] }) }));
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(String(e).slice(0, 200)));
  return { ctx, p, erros };
}

async function planeador(browser) {
  console.log('== Planeador: o pedido falha e depois responde sem ligações');
  const { ctx, p, erros } = await contexto(browser);
  let pedidos = 0;
  await ctx.route('**/api/transit/plan-route**', (r) => {
    pedidos++;
    if (pedidos === 1) return r.abort('failed');
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      routes: [], originCoords: { lat: LX.latitude, lon: LX.longitude }, destCoords: { lat: COLOMBO.latitude, lon: COLOMBO.longitude }, destName: COLOMBO.title,
    }) });
  });
  await p.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForTimeout(5000);
  const campo = p.locator('input[placeholder="Para onde vais?"]:visible').first();
  await campo.click({ timeout: 8000 });
  await campo.fill('colombo');
  const sugestao = p.locator('button:visible:has-text("Centro Comercial Colombo")').first();
  await sugestao.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
  await sugestao.click({ timeout: 8000 });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${SAIDA}/estados-erro_planeador_falha.png` });

  ok('o pedido de percursos foi feito', pedidos === 1, `pedidos=${pedidos}`);
  ok('com a rede a falhar aparece «Não foi possível calcular este percurso.»', await visivel(p, '[data-teste="rotas-erro"]'));
  ok('…e NÃO diz «Sem ligações encontradas»', !(await visivel(p, 'text=Sem ligações encontradas')));
  ok('há um botão «Tentar outra vez»', await visivel(p, '[data-teste="rotas-tentar"]'));

  await p.locator('[data-teste="rotas-tentar"]').first().click({ timeout: 5000 }).catch(() => {});
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${SAIDA}/estados-erro_planeador_sem_ligacoes.png` });
  ok('«Tentar outra vez» volta a pedir', pedidos === 2, `pedidos=${pedidos}`);
  ok('com a resposta vazia (a sério) aparece «Sem ligações encontradas»', await visivel(p, 'text=Sem ligações encontradas'));
  ok('…e o aviso de erro desaparece', !(await visivel(p, '[data-teste="rotas-erro"]')));
  ok('sem erros de JavaScript', erros.length === 0, erros.join(' | '));
  await ctx.close();
}

async function horarios(browser) {
  console.log('== Horários: a lista de todas as linhas falha e depois responde vazia');
  const { ctx, p, erros } = await contexto(browser);
  let pedidos = 0;
  await ctx.route(/\/api\/lines\?/, (r) => {
    const u = r.request().url();
    if (/[?&]near=/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ lines: [] }) });
    pedidos++;
    if (pedidos === 1) return r.abort('failed');
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ lines: [], total: 0, page: 1, total_pages: 1 }) });
  });
  await p.goto(BASE + '/horarios', { waitUntil: 'load', timeout: 60000 });
  await p.waitForTimeout(5000);
  await p.screenshot({ path: `${SAIDA}/estados-erro_horarios_falha.png` });
  ok('a lista de linhas foi pedida', pedidos >= 1, `pedidos=${pedidos}`);
  ok('com a rede a falhar aparece «Não foi possível carregar a lista»', await visivel(p, '[data-teste="linhas-erro"]'));
  ok('…e NÃO diz que não há linhas', !(await visivel(p, '[data-teste="sem-linhas"]')));
  const antes = pedidos;
  await p.locator('[data-teste="linhas-tentar"]').first().click({ timeout: 5000 }).catch(() => {});
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${SAIDA}/estados-erro_horarios_vazia.png` });
  ok('«Tentar outra vez» volta a pedir', pedidos === antes + 1, `pedidos=${pedidos}`);
  ok('com a resposta vazia (a sério) aparece a mensagem de «sem linhas»', await visivel(p, '[data-teste="sem-linhas"]'));
  ok('…e o aviso de erro desaparece', !(await visivel(p, '[data-teste="linhas-erro"]')));
  ok('sem erros de JavaScript', erros.length === 0, erros.join(' | '));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  for (const teste of [planeador, horarios]) {
    try {
      await teste(browser);
    } catch (e) {
      falhas++; console.log('FALHOU  o teste parou:', String(e).slice(0, 300));
    }
  }
  await browser.close();
  console.log(`${total - falhas}/${total} testes OK`);
  process.exit(falhas ? 1 : 0);
})();
