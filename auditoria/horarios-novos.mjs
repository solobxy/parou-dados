// Testa, num browser simulado (Chromium, 390 px), o separador Horários para quem é novo:
//   - sem favoritos, linhas abertas nem pesquisas: aparece «Mais procuradas» com as linhas que o servidor indica, pela mesma ordem;
//   - abrir uma dessas linhas avisa o servidor (contagem anónima da linha);
//   - quem já tem pesquisas recentes não vê a secção; sem dados no servidor, a secção não aparece.
// O pedido /api/estatisticas/populares é simulado (a base de teste não tem procuras); as linhas são reais. Não é num telemóvel a sério.
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const SAIDA = process.env.SAIDA || 'res';
fs.mkdirSync(SAIDA, { recursive: true });
let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };

const todas = await (await fetch(`${BASE}/api/lines?page=1`)).json();
const ids = (todas.lines || []).slice(5, 8).map((l) => l.id);
const nomes = new Map((todas.lines || []).map((l) => [l.id, String(l.name || l.code).slice(0, 12)]));
ok('[preparar] há linhas reais na base de teste', ids.length === 3, ids.join(', '));

const browser = await chromium.launch();
async function abrir({ populares, local = {} }) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'pt-PT', timezoneId: 'Europe/Lisbon', serviceWorkers: 'block',
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  });
  const extra = Object.entries(local).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(JSON.stringify(v))});`).join('');
  await ctx.addInitScript({ content: `try{ Object.defineProperty(Navigator.prototype,'webdriver',{get:()=>false,configurable:true}); localStorage.setItem('parou_aviso_instalar','1'); localStorage.setItem('parou_bemvindo','visto'); ${extra} }catch(e){}` });
  const avisos = [];
  await ctx.route('**/api/estatisticas/populares**', (rt) => rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ linhas: populares }) }));
  await ctx.route('**/api/estatisticas/procura', (rt) => { try { avisos.push(JSON.parse(rt.request().postData() || '{}')); } catch {} rt.fulfill({ status: 204, body: '' }); });
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(String(e)));
  await p.goto(`${BASE}/transportes`, { waitUntil: 'domcontentloaded' });
  return { ctx, p, avisos, erros };
}

// 1. Pessoa nova
{
  const { ctx, p, avisos, erros } = await abrir({ populares: ids });
  const sec = p.locator('[data-teste="mais-procuradas"]');
  await sec.waitFor({ timeout: 25000 }).catch(() => {});
  ok('[nova] aparece «Mais procuradas»', await sec.count() === 1);
  const titulo = (await sec.locator('h2').first().textContent().catch(() => '')) || '';
  ok('[nova] título em português', titulo.includes('Mais procuradas'), titulo);
  const texto = (await sec.innerText().catch(() => '')) || '';
  const pos = ids.map((id) => texto.toLowerCase().indexOf(String(nomes.get(id)).toLowerCase()));
  ok('[nova] as 3 linhas, pela ordem do servidor', pos.every((x) => x >= 0) && pos[0] < pos[1] && pos[1] < pos[2], pos.join(','));
  const topo = await sec.boundingBox().catch(() => null);
  const todasH = await p.getByRole('heading', { name: /Todas as linhas/ }).first().boundingBox().catch(() => null);
  ok('[nova] fica antes de «Todas as linhas»', topo && todasH && topo.y < todasH.y, `${topo?.y} < ${todasH?.y}`);
  const larg = await p.evaluate(() => document.documentElement.scrollWidth);
  ok('[nova] sem scroll lateral a 390 px', larg <= 390, String(larg));
  await p.screenshot({ path: `${SAIDA}/mais-procuradas.png` });
  await sec.getByText(nomes.get(ids[0]), { exact: false }).first().click({ timeout: 5000 }).catch((e) => console.log('NOTA    clique:', String(e).slice(0, 120)));
  await p.waitForTimeout(4000);
  ok('[contar] abrir a linha avisa o servidor (só tipo, id e nome)', avisos.some((a) => a.t === 'linha' && a.id === ids[0] && Object.keys(a).sort().join() === 'id,nome,t'), JSON.stringify(avisos));
  ok('[nova] sem erros na página', erros.length === 0, erros.join(' | '));
  await ctx.close();
}

// 2. Quem já pesquisou não vê a secção
{
  const { ctx, p } = await abrir({ populares: ids, local: { parou_pesquisas_linhas: ['728'] } });
  await p.locator('[data-teste="pesquisas-recentes"]').waitFor({ timeout: 25000 }).catch(() => {});
  await p.waitForTimeout(2500);
  ok('[com pesquisas] mostra as pesquisas recentes', await p.locator('[data-teste="pesquisas-recentes"]').count() === 1);
  ok('[com pesquisas] não mostra «Mais procuradas»', await p.locator('[data-teste="mais-procuradas"]').count() === 0);
  await ctx.close();
}

// 3. Servidor ainda sem dados
{
  const { ctx, p, erros } = await abrir({ populares: [] });
  await p.getByRole('heading', { name: /Todas as linhas/ }).first().waitFor({ timeout: 25000 }).catch(() => {});
  await p.waitForTimeout(2500);
  ok('[sem dados] a secção não aparece', await p.locator('[data-teste="mais-procuradas"]').count() === 0);
  ok('[sem dados] sem erros na página', erros.length === 0, erros.join(' | '));
  await ctx.close();
}

await browser.close();
console.log(falhas ? `${falhas} FALHOU` : 'tudo OK');
process.exit(falhas ? 1 : 0);
