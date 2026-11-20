// Testa, num browser simulado (Chromium), os horários dos próximos dias no ecrã de uma linha (pedido de um passageiro,
// 20/11/2026: «não consigo ver os horários de amanhã»):
//   - API /api/lines/:id/dia: responde ao dia de amanhã com partidas ordenadas e recusa datas fora do intervalo;
//   - ao tocar numa paragem aparece a fila de dias (Hoje, Amanhã e mais 5), com «Hoje» escolhido;
//   - «Amanhã» mostra o horário completo desse dia, com as mesmas horas que o servidor devolve;
//   - estados: a carregar, erro com «Tentar outra vez» (e recupera), voltar a «Hoje» mostra as próximas partidas;
//   - 320 px sem scroll lateral, botões dos dias com pelo menos 40 px; capturas a 320/390/1280 px e nos temas.
// As linhas e horários são reais (base de teste do CI). Não é num telemóvel a sério.
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const SAIDA = process.env.SAIDA || 'res';
fs.mkdirSync(SAIDA, { recursive: true });
let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };
const nota = (s) => console.log('NOTA   ', s);

// O servidor limita os pedidos à API por endereço e por minuto: cada parte do teste usa o seu (rede de exemplo 198.51.100.x)
let proximoIp = 10;
const novoIp = () => `198.51.100.${proximoIp++}`;
const IP_API = novoIp();
const obter = (url) => fetch(url, { headers: { 'x-forwarded-for': IP_API } });
const diaLisboa = (desvio) => {
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const [a, m, d] = hoje.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + desvio, 12)).toISOString().slice(0, 10);
};
const AMANHA = diaLisboa(1);
const dia = async (id, paragem, sentido, data) => {
  const r = await obter(`${BASE}/api/lines/${encodeURIComponent(id)}/dia?paragem=${encodeURIComponent(paragem)}&sentido=${sentido}&data=${data}`);
  return { status: r.status, corpo: await r.json().catch(() => null) };
};

// 1. Escolher uma linha real com paragens e partidas amanhã (não UNIR: essas não têm horários por viagem)
let escolha = null;
const lista = ((await (await obter(`${BASE}/api/lines?page=1`)).json()).lines || []).filter((l) => !String(l.id).startsWith('unir:'));
for (const l of lista.slice(0, 25)) {
  const det = await (await obter(`${BASE}/api/lines/${encodeURIComponent(l.id)}`)).json().catch(() => null);
  const dir = (det?.directions || []).find((d) => (d.stops || []).length >= 4);
  if (!dir) continue;
  const paragem = dir.stops[1];
  const r = await dia(l.id, paragem.id, dir.direction_id ?? 0, AMANHA);
  if (r.status === 200 && r.corpo?.estado === 'ok' && r.corpo.partidas.length >= 2) {
    escolha = { linha: l, det, dir, paragem, amanha: r.corpo };
    break;
  }
}
ok('[preparar] há uma linha real com partidas amanhã na 2.ª paragem', !!escolha, escolha ? `${escolha.linha.id} · ${escolha.paragem.name} · ${escolha.amanha.partidas.length} partidas` : '');
if (!escolha) { console.log('1 FALHOU'); process.exit(1); }
const { linha, dir, paragem, amanha } = escolha;

// 2. API
{
  const s = amanha.partidas.map((p) => p.s);
  ok('[api] partidas de amanhã ordenadas pela hora', s.every((v, i) => i === 0 || v >= s[i - 1]));
  ok('[api] cada partida tem hora HH:MM e destino', amanha.partidas.every((p) => /^\d\d:\d\d$/.test(p.hora) && typeof p.destino === 'string'), amanha.partidas.slice(0, 3).map((p) => p.hora).join(' '));
  ok('[api] diz o dia pedido', amanha.data === AMANHA, amanha.data);
  const longe = await dia(linha.id, paragem.id, 0, diaLisboa(30));
  ok('[api] recusa datas a mais de 14 dias', longe.status === 400, String(longe.status));
  const mal = await dia(linha.id, paragem.id, 0, '2026-13-45');
  ok('[api] recusa datas inválidas', mal.status === 400, String(mal.status));
  const semParagem = await obter(`${BASE}/api/lines/${encodeURIComponent(linha.id)}/dia?data=${AMANHA}`);
  ok('[api] recusa pedidos sem paragem', semParagem.status === 400, String(semParagem.status));
  // Última paragem de uma linha que não é circular (nas circulares a última é também a primeira e tem partidas)
  let fimTestado = false;
  for (const l of lista.slice(0, 40)) {
    const det = await (await obter(`${BASE}/api/lines/${encodeURIComponent(l.id)}`)).json().catch(() => null);
    const d = (det?.directions || []).find((x) => (x.stops || []).length >= 4 && x.stops.filter((st) => st.id === x.stops[x.stops.length - 1].id).length === 1
      && !(det.directions || []).some((y) => y !== x && (y.stops || []).some((st) => st.id === x.stops[x.stops.length - 1].id)));
    if (!d) continue;
    const ultima = d.stops[d.stops.length - 1];
    const fim = await dia(l.id, ultima.id, d.direction_id ?? 0, AMANHA);
    // Outra variante da linha pode continuar para lá desta paragem: aí há partidas e está certo
    if (fim.corpo?.estado !== 'ultima-paragem') { nota(`${l.id} · ${ultima.name}: ${fim.corpo?.estado} (outra variante continua?)`); continue; }
    ok('[api] na última paragem de uma linha não circular diz «última paragem»', true, `${l.id} · ${ultima.name}`);
    fimTestado = true;
    break;
  }
  ok('[api] há linhas reais em que a última paragem não promete partidas', fimTestado);
  const r1 = await obter(`${BASE}/api/lines/${encodeURIComponent(linha.id)}/dia?paragem=${encodeURIComponent(paragem.id)}&sentido=${dir.direction_id ?? 0}&data=${AMANHA}`);
  ok('[api] pode ficar em cache 5 minutos', /max-age=300/.test(r1.headers.get('cache-control') || ''), r1.headers.get('cache-control'));
}

const browser = await chromium.launch();
async function abrir({ largura = 390, altura = 844, tema = 'claro', falhar = false, atrasoMs = 0 } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: largura, height: altura }, hasTouch: largura < 1000, isMobile: largura < 1000, locale: 'pt-PT', timezoneId: 'Europe/Lisbon', serviceWorkers: 'block',
    userAgent: largura < 1000 ? 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' : undefined,
  });
  await ctx.addInitScript({ content: `try{ Object.defineProperty(Navigator.prototype,'webdriver',{get:()=>false,configurable:true}); localStorage.setItem('parou_aviso_instalar','1'); localStorage.setItem('parou_bemvindo','visto'); localStorage.setItem('parou_tema','${tema}'); }catch(e){}` });
  const estado = { falhar, pedidos: 0 };
  const ip = novoIp();
  // Só os pedidos à API levam o endereço próprio (o resto vai como sempre)
  await ctx.route(/\/api\//, async (rt) => {
    const url = rt.request().url();
    if (/\/api\/lines\/[^/?]+\/dia\?/.test(url)) {
      estado.pedidos += 1;
      if (atrasoMs) await new Promise((r) => setTimeout(r, atrasoMs));
      if (estado.falhar) return rt.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"teste"}' });
    }
    return rt.continue({ headers: { ...rt.request().headers(), 'x-forwarded-for': ip } });
  });
  const p = await ctx.newPage();
  const erros = [];
  const recusas = [];
  p.on('pageerror', (e) => erros.push(String(e).slice(0, 200)));
  p.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith(BASE)) recusas.push(`${r.status()} ${r.url().replace(BASE, '').slice(0, 90)}`); });
  // Como as pessoas fazem: Horários, tocar na linha da lista
  await p.goto(`${BASE}/transportes`, { waitUntil: 'domcontentloaded' });
  const cartao = p.locator(`[data-linha="${linha.id}"]`).first();
  await cartao.waitFor({ timeout: 30000 }).catch(() => {});
  await cartao.click({ timeout: 5000 }).catch((e) => nota('cartão da linha: ' + String(e).slice(0, 100)));
  const abriu = await p.locator('[data-teste="paragem-da-linha"]').first().waitFor({ timeout: 30000 }).then(() => true).catch(() => false);
  if (!abriu) {
    nota(`a linha não abriu (${largura} ${tema}): ${recusas.slice(0, 6).join(' · ') || 'sem respostas de erro'} · URL ${p.url().replace(BASE, '')}`);
    await p.screenshot({ path: `${SAIDA}/horario-dia-nao-abriu-${largura}-${tema}.png` }).catch(() => {});
  }
  await p.waitForTimeout(800);
  return { ctx, p, erros, estado };
}
const indiceSentido = (det) => (det.directions || []).indexOf(dir);
async function escolherSentidoEParagem(p) {
  const i = indiceSentido(escolha.det);
  if (i > 0) {
    await p.getByRole('button', { name: /Destino:|Sentido/ }).nth(i).click({ timeout: 5000 }).catch((e) => nota('sentido: ' + String(e).slice(0, 100)));
    await p.waitForTimeout(500);
  }
  await p.locator('[data-teste="paragem-da-linha"]').nth(1).click({ timeout: 8000 }).catch((e) => nota('paragem: ' + String(e).slice(0, 100)));
  await p.locator('[data-teste="dias-horario"]').waitFor({ timeout: 8000 }).catch(() => {});
}
const dias = (p) => p.locator('[data-teste="dias-horario"] button');

// 3. Ecrã a 390 px: fila de dias, amanhã, voltar a hoje
{
  const { ctx, p, erros } = await abrir();
  await escolherSentidoEParagem(p);
  const repetida = dir.stops.filter((st) => st.id === paragem.id).length;
  if (repetida > 1) nota(`a paragem aparece ${repetida} vezes nesta linha (circular)`);
  ok('[dias] só uma paragem aberta (mesmo nas linhas circulares)', await p.locator('[data-teste="dias-horario"]').count() === 1, String(await p.locator('[data-teste="dias-horario"]').count()));
  const rotulos = await dias(p).allInnerTexts().catch(() => []);
  ok('[dias] aparece a fila de dias ao tocar na paragem', rotulos.length === 7, rotulos.join(' | '));
  ok('[dias] começa em «Hoje» e «Amanhã»', rotulos[0] === 'Hoje' && rotulos[1] === 'Amanhã', rotulos.slice(0, 2).join(','));
  ok('[dias] «Hoje» vem escolhido', (await dias(p).nth(0).getAttribute('aria-pressed', { timeout: 3000 }).catch(() => null)) === 'true');
  const alturas = [];
  for (let i = 0; i < rotulos.length; i++) alturas.push(Math.round((await dias(p).nth(i).boundingBox())?.height || 0));
  ok('[dias] botões com pelo menos 40 px de altura', alturas.every((h) => h >= 40), alturas.join(','));
  await p.screenshot({ path: `${SAIDA}/horario-dia-hoje.png` });

  await dias(p).nth(1).click({ timeout: 3000 }).catch(() => {});
  const painel = p.locator('[data-teste="horario-dia"]');
  await painel.waitFor({ timeout: 10000 }).catch(() => {});
  ok('[amanhã] mostra o horário do dia', await painel.count() === 1);
  ok('[amanhã] «Amanhã» fica escolhido', (await dias(p).nth(1).getAttribute('aria-pressed', { timeout: 3000 }).catch(() => null)) === 'true');
  const texto = ((await painel.innerText().catch(() => '')) || '').replace(/\s+/g, ' ');
  const primeira = amanha.partidas[0];
  const minutosNoEcra = await painel.locator('.flex-wrap > span').count();
  ok('[amanhã] a primeira hora do servidor está no ecrã', texto.includes(primeira.hora.slice(0, 2)) && texto.includes(primeira.hora.slice(3)), `${primeira.hora} em «${texto.slice(0, 80)}»`);
  ok('[amanhã] uma hora no ecrã por cada partida do servidor', minutosNoEcra === amanha.partidas.length, `${minutosNoEcra} = ${amanha.partidas.length}`);
  const naoMarca = await painel.evaluate((el) => [...el.querySelectorAll('*')].filter((n) => { const c = getComputedStyle(n).color; return !['rgb(17, 17, 17)', 'rgb(107, 107, 107)', 'rgba(0, 0, 0, 0)'].includes(c); }).length).catch(() => -1);
  ok('[amanhã] só cores da marca no tema claro', naoMarca === 0, String(naoMarca));
  await painel.scrollIntoViewIfNeeded().catch(() => {});
  await p.screenshot({ path: `${SAIDA}/horario-dia-amanha-390.png` });

  // Tocar dentro do horário não fecha a paragem
  await painel.click({ position: { x: 5, y: 5 } }).catch(() => {});
  await p.waitForTimeout(300);
  ok('[amanhã] tocar no horário não o fecha', await painel.count() === 1);

  // Outro dia (o 4.º) também responde
  await dias(p).nth(3).click({ timeout: 3000 }).catch(() => {});
  await p.waitForTimeout(400);
  await p.locator('[data-teste="horario-dia"], [data-teste="horario-dia-vazio"]').first().waitFor({ timeout: 10000 }).catch(() => {});
  ok('[outro dia] mostra horário ou uma frase clara', await p.locator('[data-teste="horario-dia"], [data-teste="horario-dia-vazio"]').count() === 1);

  await dias(p).nth(0).click({ timeout: 3000 }).catch(() => {});
  await p.waitForTimeout(1500);
  ok('[hoje] voltar a «Hoje» tira o horário do dia', await p.locator('[data-teste="horario-dia"]').count() === 0);
  ok('[hoje] e mostra as partidas de hoje (ou «Sem partidas previstas»)', /Sem partidas previstas|\d\d:\d\d|\bmin\b|A carregar partidas/.test((await p.locator('[data-teste="dias-horario"]').locator('xpath=..').innerText().catch(() => '')) || ''));
  ok('[ecrã] sem erros na página', erros.length === 0, erros.join(' | '));
  await ctx.close();
}

// 4. A carregar e erro com «Tentar outra vez»
{
  const { ctx, p, erros, estado } = await abrir({ falhar: true, atrasoMs: 1200 });
  await escolherSentidoEParagem(p);
  await dias(p).nth(1).click({ timeout: 3000 }).catch(() => {});
  const aCarregar = await p.locator('[data-teste="horario-dia-a-carregar"]').waitFor({ timeout: 3000 }).then(() => true).catch(() => false);
  ok('[a carregar] mostra «A carregar horário…»', aCarregar);
  const erro = p.locator('[data-teste="horario-dia-erro"]');
  await erro.waitFor({ timeout: 8000 }).catch(() => {});
  const txt = (await erro.innerText().catch(() => '')) || '';
  ok('[erro] diz que não carregou e oferece «Tentar outra vez»', /Não foi possível carregar o horário/.test(txt) && /Tentar outra vez/.test(txt), txt.replace(/\s+/g, ' '));
  ok('[erro] não diz que a linha não passa', !/não passa aqui/.test(txt));
  await p.screenshot({ path: `${SAIDA}/horario-dia-erro.png` });
  estado.falhar = false;
  await erro.getByRole('button', { name: 'Tentar outra vez' }).click().catch(() => {});
  await p.locator('[data-teste="horario-dia"]').waitFor({ timeout: 10000 }).catch(() => {});
  ok('[erro] «Tentar outra vez» recupera o horário', await p.locator('[data-teste="horario-dia"]').count() === 1, `${estado.pedidos} pedidos`);
  ok('[erro] sem erros na página', erros.length === 0, erros.join(' | '));
  await ctx.close();
}

// 5. Larguras e temas
for (const [largura, tema] of [[320, 'claro'], [1280, 'claro'], [390, 'escuro'], [390, 'ambar'], [390, 'porto'], [320, 'escuro']]) {
  const { ctx, p, erros } = await abrir({ largura, altura: largura > 1000 ? 860 : 780, tema });
  await escolherSentidoEParagem(p);
  await dias(p).nth(1).click({ timeout: 3000 }).catch(() => {});
  const painel = p.locator('[data-teste="horario-dia"]');
  await painel.waitFor({ timeout: 10000 }).catch(() => {});
  await painel.scrollIntoViewIfNeeded().catch(() => {});
  const larg = await p.evaluate(() => document.documentElement.scrollWidth).catch(() => 99999);
  ok(`[${largura} ${tema}] horário visível`, await painel.count() === 1);
  ok(`[${largura} ${tema}] sem scroll lateral da página`, larg <= largura, `${larg}`);
  const caixa = await painel.boundingBox().catch(() => null);
  ok(`[${largura} ${tema}] o horário cabe na largura`, caixa && caixa.x >= 0 && caixa.x + caixa.width <= largura + 1, caixa ? `${Math.round(caixa.x)}+${Math.round(caixa.width)}` : '');
  if (tema !== 'claro') {
    const contraste = await painel.evaluate((el) => {
      const lum = (c) => { const v = (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
      let fundo = 'rgb(255, 255, 255)';
      for (let n = el; n; n = n.parentElement) { const b = getComputedStyle(n).backgroundColor; if (b && !/rgba\(0, 0, 0, 0\)|transparent/.test(b)) { fundo = b; break; } }
      const hora = el.querySelector('.font-semibold');
      const c = getComputedStyle(hora || el).color;
      const [a, b] = [lum(c), lum(fundo)].sort((x, y) => y - x);
      return Math.round(((a + 0.05) / (b + 0.05)) * 10) / 10;
    }).catch(() => 0);
    ok(`[${largura} ${tema}] horas com contraste ≥ 4,5:1`, contraste >= 4.5, String(contraste));
  }
  ok(`[${largura} ${tema}] sem erros na página`, erros.length === 0, erros.join(' | '));
  await p.screenshot({ path: `${SAIDA}/horario-dia-${largura}-${tema}.png` });
  await ctx.close();
}

// 6. Diagnóstico (não conta como falha): abrir pela ligação /transportes?linha=… (vinda das páginas públicas das linhas)
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'pt-PT', timezoneId: 'Europe/Lisbon', serviceWorkers: 'block' });
  await ctx.addInitScript({ content: `try{ localStorage.setItem('parou_aviso_instalar','1'); localStorage.setItem('parou_bemvindo','visto');
    window.__reg=[]; const t0=performance.now(); const r=(s)=>window.__reg.push(Math.round(performance.now()-t0)+'ms '+s);
    for (const k of ['pushState','replaceState']) { const o=history[k].bind(history); history[k]=(st,ti,url)=>{ r(k+' '+JSON.stringify(st)+' '+(url||'')); return o(st,ti,url); }; }
    const og=history.go.bind(history); history.go=(n)=>{ r('go '+n+' '+String(new Error().stack||'').split('\\n').slice(2,5).join(' < ').slice(0,300)); return og(n); };
    const ob=history.back.bind(history); history.back=()=>{ r('back'); return ob(); };
    addEventListener('popstate',(e)=>r('popstate '+JSON.stringify(e.state)+' '+location.pathname+location.search),true);
    let antes=null; setInterval(()=>{ const ha=!!document.querySelector('[data-teste="paragem-da-linha"]'); if(ha!==antes){ r('linha aberta: '+ha); antes=ha; } },50);
  }catch(e){}` });
  for (const [nome, atraso] of [['normal', 0], ['rede lenta', 1500]]) {
    if (atraso) await ctx.route(/\/api\//, async (rt) => { await new Promise((r) => setTimeout(r, atraso)); return rt.continue({ headers: { ...rt.request().headers(), 'x-forwarded-for': novoIp() } }); });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/transportes?linha=${encodeURIComponent(linha.id)}`, { waitUntil: 'domcontentloaded' });
    const abriu = await p.locator('[data-teste="paragem-da-linha"]').first().waitFor({ timeout: 25000 }).then(() => true).catch(() => false);
    await p.waitForTimeout(3000);
    const ficou = await p.locator('[data-teste="paragem-da-linha"]').count() > 0;
    nota(`ligação ?linha= (${nome}): abriu ${abriu}, continua aberta ${ficou}`);
    if (!abriu || !ficou) for (const l of await p.evaluate(() => window.__reg || []).catch(() => [])) console.log('       ', l);
    await p.close();
  }
  await ctx.close();
}

await browser.close();
console.log(falhas ? `${falhas} FALHOU` : 'tudo OK');
process.exit(falhas ? 1 : 0);
