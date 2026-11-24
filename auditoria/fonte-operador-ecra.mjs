// Testa, num browser simulado (Chromium), a fonte da Transtejo Soflusa na app: ao abrir uma linha da TTSL nos Horários,
// por baixo das paragens e partidas aparece «Fonte — Transtejo Soflusa (TTSL)» (em inglês «Source — …»); numa linha da
// Carris não aparece. Vê também que a API das partidas de uma paragem da TTSL diz o operador (é daí que o painel da
// paragem, no ecrã «Perto», tira a fonte). Dados reais do CI. Não é num telemóvel a sério.
// Uso: BASE=http://127.0.0.1:3000 SAIDA=res node auditoria/fonte-operador-ecra.mjs
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const SAIDA = process.env.SAIDA || 'res';
fs.mkdirSync(SAIDA, { recursive: true });
let falhas = 0;
const ok = (n, c, e = '') => { if (!c) falhas++; console.log(c ? 'OK     ' : 'FALHOU ', n, e); };
const IP = '198.51.100.204';
const obter = async (u) => (await fetch(BASE + u, { headers: { 'x-forwarded-for': IP } })).json().catch(() => null);

const procurar = async (q, feed) => ((await obter(`/api/lines?q=${encodeURIComponent(q)}&page=1`))?.lines || []).find((l) => l.feed_id === feed || l.operator_id === feed);
const ttsl = (await procurar('Cacilhas', 'transtejo_soflusa')) || (await procurar('Barreiro', 'transtejo_soflusa')) || (await procurar('Seixal', 'transtejo_soflusa'));
const carris = (await procurar('Restauradores', 'carris')) || (await procurar('Cais do Sodré', 'carris'));
ok('[preparar] há uma linha real da TTSL', !!ttsl, ttsl ? `${ttsl.id} ${ttsl.name}` : '');
ok('[preparar] há uma linha real da Carris', !!carris, carris ? `${carris.id} ${carris.name}` : '');

// A paragem da TTSL: as partidas dizem o operador (o painel da paragem usa-o para mostrar a fonte)
if (ttsl) {
  const det = await obter(`/api/lines/${encodeURIComponent(ttsl.id)}`);
  const paragem = det?.directions?.[0]?.stops?.[0];
  const partidas = paragem ? await obter(`/api/transit/stop/${encodeURIComponent(paragem.id)}?linhas=1`) : null;
  const deps = partidas?.departures || [];
  ok('[api] partidas da paragem da TTSL trazem feed_id transtejo_soflusa', deps.length === 0 || deps.some((d) => d.feed_id === 'transtejo_soflusa'), `${paragem?.name} · ${deps.length} partidas · ${[...new Set(deps.map((d) => d.feed_id))].join(',')}`);
}

const browser = await chromium.launch();
async function abrirLinha(linha, lingua = 'pt', largura = 390) {
  const ctx = await browser.newContext({ viewport: { width: largura, height: 844 }, hasTouch: true, isMobile: largura < 1000, locale: lingua === 'pt' ? 'pt-PT' : 'en-GB', timezoneId: 'Europe/Lisbon', serviceWorkers: 'block' });
  await ctx.addInitScript({ content: `try{ localStorage.setItem('parou_aviso_instalar','1'); localStorage.setItem('parou_bemvindo','visto'); localStorage.setItem('parou_idioma','${lingua}'); }catch(e){}` });
  await ctx.route(/\/api\//, (rt) => rt.continue({ headers: { ...rt.request().headers(), 'x-forwarded-for': IP } }));
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(String(e).slice(0, 200)));
  await p.goto(`${BASE}/transportes?linha=${encodeURIComponent(linha.id)}${lingua === 'pt' ? '' : `&lang=${lingua}`}`, { waitUntil: 'domcontentloaded' });
  await p.locator('[data-teste="paragem-da-linha"]').first().waitFor({ timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(800);
  return { ctx, p, erros };
}

if (ttsl) {
  const { ctx, p, erros } = await abrirLinha(ttsl);
  const fonte = p.locator('[data-teste="fonte-operador"]');
  const txt = ((await fonte.first().innerText().catch(() => '')) || '').trim();
  ok('[ecrã] linha da TTSL mostra «Fonte — Transtejo Soflusa (TTSL)»', txt === 'Fonte — Transtejo Soflusa (TTSL)', txt);
  ok('[ecrã] aparece uma só vez', await fonte.count() === 1, String(await fonte.count()));
  const caixa = await fonte.first().boundingBox().catch(() => null);
  ok('[ecrã] cabe no ecrã de 390 px', caixa && caixa.x >= 0 && caixa.x + caixa.width <= 390, JSON.stringify(caixa));
  await fonte.first().scrollIntoViewIfNeeded().catch(() => {});
  await p.screenshot({ path: `${SAIDA}/fonte-ttsl-390.png` });
  ok('[ecrã] sem erros na página', erros.length === 0, erros.join(' | '));
  await ctx.close();
  const en = await abrirLinha(ttsl, 'en');
  const txtEn = ((await en.p.locator('[data-teste="fonte-operador"]').first().innerText().catch(() => '')) || '').trim();
  ok('[ecrã en] em inglês: «Source — Transtejo Soflusa (TTSL)»', txtEn === 'Source — Transtejo Soflusa (TTSL)', txtEn);
  await en.p.screenshot({ path: `${SAIDA}/fonte-ttsl-en.png` });
  await en.ctx.close();
}
if (carris) {
  const { ctx, p } = await abrirLinha(carris);
  const abriu = await p.locator('[data-teste="paragem-da-linha"]').count();
  ok('[ecrã] linha da Carris abre e não mostra a fonte da TTSL', abriu > 0 && await p.locator('[data-teste="fonte-operador"]').count() === 0, `${abriu} paragens`);
  await ctx.close();
}
await browser.close();
console.log(falhas ? `${falhas} testes falharam` : 'Todos os testes passaram');
process.exit(falhas ? 1 : 0);
