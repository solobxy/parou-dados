// Testa dois pontos do feedback do Reddit:
//  (2) transparência da localização: nota visível, janela "A tua localização", botão "Desligar e apagar", e o desligar aguenta recarregar a página
//  (4) "As minhas cidades": escolher no seletor, os Horários pedem só essas cidades, "procurar em todo o país", pedido mais recente ganha,
//      escolha guardada ao recarregar, limite de 8 cidades e o mesmo botão nos Favoritos
// As APIs são simuladas (para não depender dos dados do dia); o filtro no servidor verifica-se à parte, em produção.
import { chromium, webkit, devices } from 'playwright';
import fs from 'fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const SAIDA = process.env.SAIDA || 'res';
fs.mkdirSync(SAIDA, { recursive: true });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
const res = { testes: [], notas: [] };
const ok = (nome, cond, extra = '') => { res.testes.push({ nome, ok: !!cond, extra: String(extra) }); console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };

const LAT = 41.1496, LON = -8.6109;
const ALVOS = [
  ['iPhone SE', 'webkit', 'claro'],
  ['iPhone 13 Mini', 'webkit', 'claro'],
  ['iPhone 13 Mini', 'webkit', 'escuro'],
  ['iPhone 13 Mini', 'webkit', 'ambar'],
  ['Pixel 5', 'chromium', 'claro'],
  ['Desktop', 'chromium', 'claro', { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }],
];

// ---------- Perto simulado ----------
const dep = (extra) => ({ lineName: '', lineColor: '#E4572E', operatorName: 'STCP', operatorId: 'stcp', transportMode: 'Autocarro', ...extra });
const DEPS = [
  dep({ lineCode: '205', destination: 'Santo Ovídio', tripId: 'T205', routeId: 'R205', stopId: 'S1', departureTime: '5 min', displayText: '5 min', scheduledTime: '14:12', etaMinutes: 5, departureMinutes: 5, countdown_minutes: 5, isRealtime: true, state: 'TEMPO REAL', statusDescription: 'Em circulação ao vivo' }),
  dep({ lineCode: '706', destination: 'Matosinhos Sul', routeId: 'R706', stopId: 'S1', departureTime: '14:35 · Programado', displayText: '14:35 · Programado', scheduledTime: '14:35', etaMinutes: 23, departureMinutes: 23, countdown_minutes: 23, isRealtime: false, state: 'PROGRAMADO', statusDescription: 'Horário oficial programado' }),
];
const PARAGEM = {
  id: 'S1', name: 'Aliados', operatorId: 'stcp', operatorName: 'STCP', transportMode: 'Autocarro', latitude: LAT + 0.0003, longitude: LON + 0.0003,
  locality: 'Porto', district: 'Porto', distanceMeters: 40, formattedDistance: '40 m', walkingMinutes: 1,
  lines: [{ code: '205', name: '', color: '#E4572E', destination: '' }, { code: '706', name: '', color: '#E4572E', destination: '' }],
  nextDepartures: DEPS, activeAlerts: [],
};

// ---------- Linhas simuladas ----------
const linha = (code, nome, op = 'STCP') => ({ id: `t:${code}`, code, name: nome, color: '#E4572E', mode: 'Autocarro', operator: op, operator_id: 'x', feed_id: 'x', destinations: [nome] });
const NACIONAL = [linha('N1', 'Nacional Um'), linha('N2', 'Nacional Dois'), linha('N3', 'Nacional Três')];
const PORTO = [linha('P1', 'Porto Um'), linha('P2', 'Porto Dois')];
const BRAGA = [linha('B1', 'Braga Um', 'TUB')];
const respostaLinhas = (u) => {
  const q = u.searchParams.get('q') || '';
  const cid = (u.searchParams.get('cidades') || '').split(',').filter(Boolean);
  let lines;
  if (q === 'zzz') lines = cid.length ? [] : [linha('Z1', 'Só noutra cidade')];
  else if (!cid.length) lines = NACIONAL;
  else lines = [...(cid.includes('porto') ? PORTO : []), ...(cid.includes('braga') ? BRAGA : [])];
  return { lines, total: lines.length, page: 1, total_pages: 1 };
};

// luminância relativa e contraste de um elemento (cor do texto contra o fundo mais próximo que não é transparente)
const CONTRASTE = `(el) => {
  const rgb = (c) => { const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const [r, g, b, a] = m[1].split(',').map((x) => parseFloat(x)); return { r, g, b, a: a === undefined ? 1 : a }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const fg = rgb(getComputedStyle(el).color);
  let n = el, bg = null;
  while (n && n.nodeType === 1) { const c = rgb(getComputedStyle(n).backgroundColor); if (c && c.a > 0.5) { bg = c; break; } n = n.parentElement; }
  if (!fg || !bg) return 0;
  const a = lum(fg), b = lum(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}`;

async function novoContexto(browser, nome, tema, custom, { gps }) {
  const base = custom ? {} : devices[nome];
  if (!custom && !base) return null;
  const ctx = await browser.newContext({
    ...(custom || base), locale: 'pt-PT', timezoneId: 'Europe/Lisbon',
    ...(gps ? { permissions: ['geolocation'], geolocation: { latitude: LAT, longitude: LON, accuracy: 10 } } : {}),
    serviceWorkers: 'block', // o Playwright não intercepta pedidos que passam pelo service worker (WebKit)
  });
  await ctx.addInitScript({ content: `try{ Object.defineProperty(Navigator.prototype,'webdriver',{get:()=>false,configurable:true}); localStorage.setItem('parou_tema','${tema}'); localStorage.setItem('parou_aviso_instalar','1'); localStorage.setItem('parou_bemvindo','visto'); ${gps ? "localStorage.setItem('parou_localizacao_ok','1');" : ''} }catch(e){}` });
  await ctx.route(/(tile|openstreetmap|arcgisonline|cartocdn|basemaps)\./i, (rt) => rt.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  return ctx;
}
const fechaPonto = async (p) => {
  const f = p.locator('[data-teste="ponto-diario-fechar"]');
  if (await f.count()) await f.first().click({ timeout: 2000 }).catch(() => {});
};
const cabe = async (p, seletor) => {
  await p.waitForTimeout(500); // as janelas sobem com uma animação curta
  const c = await p.locator(seletor).first().boundingBox();
  const vh = p.viewportSize().height, vw = p.viewportSize().width;
  return c && c.x >= -1 && c.y >= -1 && c.x + c.width <= vw + 2 && c.y + c.height <= vh + 2 ? 'ok' : `fora do ecrã ${c ? `${Math.round(c.x)},${Math.round(c.y)} ${Math.round(c.width)}x${Math.round(c.height)} em ${vw}x${vh}` : 'sem caixa'}`;
};

// ============ Parte A: localização ============
async function parteLocalizacao(browser, nome, motor, tema, custom) {
  const rot = `[${nome} ${tema}] localização`;
  const foto = async (p, s) => { await p.waitForTimeout(500); return p.screenshot({ path: `${SAIDA}/${nome.replace(/[^\w]+/g, '_')}_${tema}_loc_${s}.jpg`, type: 'jpeg', quality: 60, scale: 'css' }).catch(() => {}); };

  // A1) Convite para ativar (sem GPS): a nota está à vista e abre a janela
  {
    const ctx = await novoContexto(browser, nome, tema, custom, { gps: false });
    if (!ctx) return;
    await ctx.route('**/api/transit/nearby**', (rt) => rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ stops: [], vehicles: [], alerts: [], radiusMeters: 500, timestamp: new Date().toISOString() }) }));
    const p = await ctx.newPage();
    const erros = [];
    p.on('pageerror', (e) => erros.push(String(e).slice(0, 200)));
    try {
      await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
      await p.waitForSelector('[data-teste="ativar-localizacao"]:visible', { timeout: 45000 });
      await fechaPonto(p);
      await p.waitForTimeout(500);
      const nota = p.locator('[data-teste="nota-localizacao"]:visible').first();
      ok(`${rot}: convite mostra a nota sobre o uso da localização`, (await nota.count()) === 1, await nota.count());
      const txt = await nota.innerText().catch(() => '');
      ok(`${rot}: nota diz que não fica guardada no servidor`, /não fica guardada no servidor/i.test(txt), txt.slice(0, 90));
      const caixa = await nota.boundingBox();
      ok(`${rot}: nota é um alvo de toque ≥ 44 px`, caixa && caixa.height >= 44, caixa ? Math.round(caixa.height) : 'sem caixa');
      ok(`${rot}: nota cabe na largura do ecrã`, caixa && caixa.x >= 0 && caixa.x + caixa.width <= p.viewportSize().width + 1, caixa ? `${Math.round(caixa.x)}+${Math.round(caixa.width)}` : '');
      const ct = await nota.evaluate(eval(CONTRASTE));
      ok(`${rot}: texto da nota com contraste ≥ 4.5:1`, ct >= 4.5, ct.toFixed(2));
      const botao = await p.locator('[data-teste="ativar-localizacao"]:visible').first().boundingBox();
      ok(`${rot}: botão "Ativar localização" continua visível no ecrã`, botao && botao.y + botao.height <= p.viewportSize().height + 1, botao ? Math.round(botao.y + botao.height) : '');
      await foto(p, '1_convite');

      await nota.click();
      await p.waitForSelector('[role="dialog"][aria-label="A tua localização"]', { timeout: 5000 });
      const dlg = p.locator('[role="dialog"][aria-label="A tua localização"]');
      const t1 = await dlg.innerText();
      ok(`${rot}: janela explica o que vai para o servidor e o que fica no telemóvel`, /No servidor/.test(t1) && /No teu telemóvel/.test(t1) && /12 horas/.test(t1) && /Nunca/.test(t1), t1.replace(/\n+/g, ' | ').slice(0, 140));
      ok(`${rot}: janela cabe no ecrã`, (await cabe(p, '[role="dialog"][aria-label="A tua localização"]')) === 'ok', await cabe(p, '[role="dialog"][aria-label="A tua localização"]'));
      ok(`${rot}: sem GPS ligado não há botão de desligar`, (await p.locator('[data-teste="desligar-localizacao"]').count()) === 0);
      const cj = await dlg.locator('p').first().evaluate(eval(CONTRASTE));
      ok(`${rot}: texto da janela com contraste ≥ 4.5:1`, cj >= 4.5, cj.toFixed(2));
      const sec = await dlg.locator('li span span').nth(1).evaluate(eval(CONTRASTE)).catch(() => 99);
      ok(`${rot}: texto secundário da janela com contraste ≥ 4.5:1`, sec >= 4.5, Number(sec).toFixed(2));
      await foto(p, '2_janela');
      await p.keyboard.press('Escape');
      await p.waitForTimeout(300);
      ok(`${rot}: Esc fecha a janela`, (await p.locator('[role="dialog"][aria-label="A tua localização"]').count()) === 0);
      // A janela abre também por teclado (Enter na nota)
      await nota.focus();
      await p.keyboard.press('Enter');
      await p.waitForTimeout(300);
      ok(`${rot}: Enter na nota abre a janela`, (await p.locator('[role="dialog"][aria-label="A tua localização"]').count()) === 1);
    } catch (e) {
      ok(`${rot}: convite sem exceções`, false, String(e).slice(0, 300));
      await foto(p, 'erro_convite');
    }
    ok(`${rot}: convite sem erros de JavaScript`, erros.length === 0, erros.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // A2) Com GPS: nota no fim da lista, "Desligar e apagar" e a escolha aguenta recarregar
  {
    const ctx = await novoContexto(browser, nome, tema, custom, { gps: true });
    await ctx.route('**/api/transit/nearby**', (rt) => rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ stops: [PARAGEM], vehicles: [], alerts: [], radiusMeters: 500, timestamp: new Date().toISOString() }) }));
    await ctx.route('**/api/transit/stop/**', (rt) => rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ departures: [] }) }));
    const p = await ctx.newPage();
    const erros = [];
    p.on('pageerror', (e) => erros.push(String(e).slice(0, 200)));
    const ls = (k) => p.evaluate((c) => localStorage.getItem(c), k);
    try {
      await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
      await p.waitForSelector('[data-teste="paragem-perto"]:visible', { timeout: 45000 });
      await fechaPonto(p);
      await p.waitForTimeout(500);
      ok(`${rot}: com GPS ligado a lista mostra a paragem`, (await p.locator('[data-teste="paragem-perto"]:visible').count()) >= 1);
      const notaFim = p.locator('[data-teste="nota-localizacao"]');
      await notaFim.last().scrollIntoViewIfNeeded().catch(() => {});
      ok(`${rot}: a nota também está no fim da lista`, (await notaFim.count()) >= 1, await notaFim.count());
      await foto(p, '3_lista_nota');
      await notaFim.last().click();
      await p.waitForSelector('[role="dialog"][aria-label="A tua localização"]', { timeout: 5000 });
      const des = p.locator('[data-teste="desligar-localizacao"]');
      ok(`${rot}: com GPS ligado aparece "Desligar e apagar a posição guardada"`, (await des.count()) === 1, await des.count());
      const cd = await des.boundingBox();
      ok(`${rot}: botão de desligar com altura ≥ 44 px`, cd && cd.height >= 44, cd ? Math.round(cd.height) : '');
      ok(`${rot}: botão de desligar visível sem deslizar`, (await cabe(p, '[data-teste="desligar-localizacao"]')) === 'ok', await cabe(p, '[data-teste="desligar-localizacao"]'));
      ok(`${rot}: antes de desligar há posição guardada no telemóvel`, !!(await ls('parou_ultima_posicao')));
      await foto(p, '4_janela_ativa');
      await des.click();
      await p.waitForTimeout(800);
      ok(`${rot}: desligar fecha a janela`, (await p.locator('[role="dialog"][aria-label="A tua localização"]').count()) === 0);
      ok(`${rot}: desligar apaga a última posição`, (await ls('parou_ultima_posicao')) === null);
      ok(`${rot}: desligar regista que está desligada`, (await ls('parou_localizacao_desligada')) === '1');
      ok(`${rot}: desligar tira a autorização guardada da app`, (await ls('parou_localizacao_ok')) === null);
      ok(`${rot}: depois de desligar volta o convite e a lista de paragens desaparece`, (await p.locator('[data-teste="ativar-localizacao"]:visible').count()) >= 1 && (await p.locator('[data-teste="paragem-perto"]:visible').count()) === 0,
        `${await p.locator('[data-teste="ativar-localizacao"]:visible').count()} convites, ${await p.locator('[data-teste="paragem-perto"]:visible').count()} paragens`);
      await foto(p, '5_desligada');

      // Recarrega: mesmo com a permissão do browser, a app não volta a ligar sozinha
      await p.reload({ waitUntil: 'domcontentloaded' });
      await p.waitForTimeout(3500);
      await fechaPonto(p);
      ok(`${rot}: depois de recarregar continua desligada`, (await p.locator('[data-teste="paragem-perto"]:visible').count()) === 0 && (await p.locator('[data-teste="ativar-localizacao"]:visible').count()) >= 1,
        `${await p.locator('[data-teste="paragem-perto"]:visible').count()} paragens`);
      ok(`${rot}: depois de recarregar não há posição guardada`, (await ls('parou_ultima_posicao')) === null);

      // Ligar outra vez à mão
      await p.locator('[data-teste="ativar-localizacao"]:visible').first().click();
      await p.waitForSelector('[data-teste="paragem-perto"]:visible', { timeout: 30000 });
      ok(`${rot}: voltar a ativar traz as paragens`, (await p.locator('[data-teste="paragem-perto"]:visible').count()) >= 1);
      ok(`${rot}: voltar a ativar limpa o "desligada"`, (await ls('parou_localizacao_desligada')) === null);
    } catch (e) {
      ok(`${rot}: desligar sem exceções`, false, String(e).slice(0, 300));
      await foto(p, 'erro_desligar');
    }
    ok(`${rot}: desligar sem erros de JavaScript`, erros.length === 0, erros.slice(0, 2).join(' | '));
    await ctx.close();
  }
}

// ============ Parte B: as minhas cidades ============
async function parteCidades(browser, nome, motor, tema, custom) {
  const rot = `[${nome} ${tema}] cidades`;
  const foto = async (p, s) => { await p.waitForTimeout(500); return p.screenshot({ path: `${SAIDA}/${nome.replace(/[^\w]+/g, '_')}_${tema}_cid_${s}.jpg`, type: 'jpeg', quality: 60, scale: 'css' }).catch(() => {}); };
  const ctx = await novoContexto(browser, nome, tema, custom, { gps: false });
  if (!ctx) return;
  const pedidos = [];
  await ctx.route(/\/api\/lines(\?|$)/, async (rt) => {
    const u = new URL(rt.request().url());
    if (u.searchParams.has('near') || u.searchParams.has('ids')) return rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ lines: [], total: 0 }) });
    pedidos.push({ cidades: u.searchParams.get('cidades'), q: u.searchParams.get('q') || '' });
    // Só "porto" sozinho demora, para provar que uma resposta atrasada não estraga a lista
    if (u.searchParams.get('cidades') === 'porto') await new Promise((r) => setTimeout(r, 1800));
    return rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(respostaLinhas(u)) }).catch(() => {});
  });
  // Quantas linhas tem cada cidade (no servidor de verdade vem da base; aqui é simulado)
  await ctx.route('**/api/lines/cidades', (rt) => {
    const c = {}; for (const x of ['lisboa','porto','braga','coimbra','aveiro','faro','setubal','leiria','viseu','evora','santarem','viana-do-castelo','vila-real','braganca','guarda','castelo-branco','portalegre','beja','funchal','ponta-delgada','maia','matosinhos','vila-nova-de-gaia','gondomar','valongo','povoa-de-varzim','vila-do-conde','espinho','guimaraes','vila-nova-de-famalicao','santa-maria-da-feira','amadora','sintra','cascais','oeiras','loures','odivelas','almada','seixal','barreiro','montijo','vila-franca-de-xira','figueira-da-foz','torres-vedras','caldas-da-rainha','portimao','albufeira','loule','lagos','olhao','covilha']) c[x] = 10;
    c.porto = 265; c.lisboa = 370; c.viseu = 0; c['ponta-delgada'] = 0; c.beja = 1; c['vila-nova-de-famalicao'] = 64;
    return rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ cidades: c }) });
  });
  await ctx.route('**/api/dados-utilizador**', (rt) => rt.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(String(e).slice(0, 200)));
  const ls = (k) => p.evaluate((c) => localStorage.getItem(c), k);
  const ultimo = () => pedidos[pedidos.length - 1] || {};
  const chip = () => p.locator('[data-teste="botao-cidades"]:visible').first();
  const tex = async () => (await p.locator('main, #root').first().innerText().catch(() => '')) || '';
  const sheet = '[role="dialog"][aria-label="As minhas cidades"]';

  try {
    await p.goto(`${BASE}/horarios`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('[data-teste="botao-cidades"]:visible', { timeout: 45000 });
    await fechaPonto(p);
    await p.waitForFunction(() => /Nacional Um/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
    ok(`${rot}: sem cidades, o botão diz "Cidades: todas"`, /Cidades: todas/.test(await chip().innerText()), await chip().innerText());
    ok(`${rot}: sem cidades, o primeiro pedido não leva filtro`, pedidos.length >= 1 && !pedidos[0].cidades, JSON.stringify(pedidos[0]));
    ok(`${rot}: mostra as linhas de todo o país`, /Nacional Um/.test(await p.evaluate(() => document.body.innerText)));
    const cb = await chip().boundingBox();
    ok(`${rot}: botão de cidades com altura ≥ 44 px`, cb && cb.height >= 44, cb ? Math.round(cb.height) : '');
    ok(`${rot}: botão de cidades cabe na largura do ecrã`, cb && cb.x >= 0 && cb.x + cb.width <= p.viewportSize().width + 1, cb ? `${Math.round(cb.x)}+${Math.round(cb.width)} de ${p.viewportSize().width}` : '');
    await foto(p, '1_horarios_todas');

    // Abrir o seletor
    await chip().click();
    await p.waitForSelector(sheet, { timeout: 5000 });
    ok(`${rot}: seletor abre e lista cidades`, (await p.locator('[data-teste="cidade"]').count()) >= 40, await p.locator('[data-teste="cidade"]').count());
    await p.waitForSelector('[data-teste="cidade-linhas"]', { timeout: 8000 }).catch(() => {});
    const numPorto = await p.locator('[data-teste="cidade"][data-cidade="porto"]').innerText();
    const numViseu = await p.locator('[data-teste="cidade"][data-cidade="viseu"]').innerText();
    const numBeja = await p.locator('[data-teste="cidade"][data-cidade="beja"]').innerText();
    ok(`${rot}: seletor mostra quantas linhas tem cada cidade`, /265 linhas/.test(numPorto), numPorto.replace(/\n/g, ' '));
    ok(`${rot}: cidade sem linhas diz "sem linhas ainda"`, /sem linhas ainda/.test(numViseu), numViseu.replace(/\n/g, ' '));
    ok(`${rot}: uma linha só diz "1 linha" (singular)`, /\b1 linha\b(?!s)/.test(numBeja), numBeja.replace(/\n/g, ' '));
    // nenhuma linha da lista sai do ecrã nem corta o nome
    const sobraLinhas = await p.evaluate(() => Array.from(document.querySelectorAll('[data-teste="cidade"]')).filter((b) => b.scrollWidth > b.clientWidth + 1).length);
    ok(`${rot}: nenhuma linha do seletor transborda na largura`, sobraLinhas === 0, sobraLinhas);
    ok(`${rot}: seletor cabe no ecrã`, (await cabe(p, sheet)) === 'ok', await cabe(p, sheet));
    const alvoLinha = await p.locator('[data-teste="cidade"]').first().boundingBox();
    ok(`${rot}: cada cidade é um alvo de toque ≥ 44 px`, alvoLinha && alvoLinha.height >= 44, alvoLinha ? Math.round(alvoLinha.height) : '');
    const box = p.locator('[data-teste="cidade"]').first().locator('span').last();
    ok(`${rot}: caixa de seleção tem contorno visível`, (await box.evaluate((e) => getComputedStyle(e).borderTopWidth)) !== '0px');
    const txtCidade = await p.locator('[data-teste="cidade"]').first().locator('span').first().evaluate(eval(CONTRASTE));
    ok(`${rot}: nome da cidade com contraste ≥ 4.5:1`, txtCidade >= 4.5, txtCidade.toFixed(2));
    const fim = await p.locator('[data-teste="cidades-concluido"]').boundingBox();
    ok(`${rot}: "Concluído" visível e com ≥ 44 px`, fim && fim.height >= 44 && fim.y + fim.height <= p.viewportSize().height + 1, fim ? `${Math.round(fim.y)}+${Math.round(fim.height)} de ${p.viewportSize().height}` : '');
    ok(`${rot}: "Ver todas" desativado sem cidades`, await p.locator('[data-teste="cidades-limpar"]').isDisabled());
    await foto(p, '2_seletor');

    // Procurar
    const campo = p.locator(`${sheet} input[type="search"]`);
    const fs = await campo.evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    if (nome !== 'Desktop') ok(`${rot}: campo de pesquisa ≥ 16 px (o iPhone não faz zoom)`, fs >= 16, fs);
    await campo.fill('guimaraes');
    await p.waitForTimeout(200);
    const achadas = await p.locator('[data-teste="cidade"]').allInnerTexts();
    ok(`${rot}: pesquisa sem acentos encontra "Guimarães"`, achadas.some((x) => /Guimarães/.test(x)), achadas.join(',').slice(0, 80));
    await campo.fill('xyzxyz');
    await p.waitForTimeout(200);
    ok(`${rot}: pesquisa sem resultados diz "Nenhuma cidade com esse nome."`, /Nenhuma cidade com esse nome/.test(await p.locator(sheet).innerText()));
    await campo.fill('');

    // Escolher Porto: o Horários pede só o Porto; o pedido de "porto" demora, vamos mudar já a seguir
    await p.locator('[data-teste="cidade"][data-cidade="porto"]').click();
    ok(`${rot}: Porto fica marcado (aria-checked)`, (await p.locator('[data-teste="cidade"][data-cidade="porto"]').getAttribute('aria-checked')) === 'true');
    ok(`${rot}: a escolha fica guardada no telemóvel`, (await ls('parou_cidades')) === '{"v":1,"s":["porto"]}', await ls('parou_cidades'));
    await p.waitForTimeout(500);
    // ... e antes de o Porto responder, troca por Braga (tira Porto, põe Braga)
    await p.locator('[data-teste="cidade"][data-cidade="porto"]').click();
    await p.locator('[data-teste="cidade"][data-cidade="braga"]').click();
    ok(`${rot}: escolha atual é só Braga`, (await ls('parou_cidades')) === '{"v":1,"s":["braga"]}', await ls('parou_cidades'));
    await p.locator('[data-teste="cidades-concluido"]').click();
    await p.waitForTimeout(300);
    ok(`${rot}: "Concluído" fecha o seletor`, (await p.locator(sheet).count()) === 0);
    ok(`${rot}: o botão passa a mostrar "Braga"`, /Braga/.test(await chip().innerText()), await chip().innerText());
    await p.waitForFunction(() => /Braga Um/.test(document.body.innerText), null, { timeout: 8000 }).catch(() => {});
    ok(`${rot}: mostra as linhas de Braga`, /Braga Um/.test(await p.evaluate(() => document.body.innerText)));
    // Espera que a resposta atrasada do Porto chegue e confirma que não apagou a lista de Braga
    await p.waitForTimeout(2600);
    const corpo = await p.evaluate(() => document.body.innerText);
    ok(`${rot}: resposta atrasada do Porto não estraga a lista (pedido mais recente ganha)`, /Braga Um/.test(corpo) && !/Porto Um/.test(corpo), corpo.includes('Porto Um') ? 'apareceu Porto Um' : '');
    ok(`${rot}: o último pedido ao servidor leva cidades=braga`, ultimo().cidades === 'braga', JSON.stringify(ultimo()));
    await foto(p, '3_horarios_braga');

    // Duas cidades, por ordem de escolha
    await chip().click();
    await p.waitForSelector(sheet);
    await p.locator('[data-teste="cidade"][data-cidade="lisboa"]').click();
    await p.locator('[data-teste="cidades-concluido"]').click();
    await p.waitForTimeout(900);
    ok(`${rot}: botão com duas cidades diz "Braga e Lisboa"`, /Braga e Lisboa/.test(await chip().innerText()), await chip().innerText());
    ok(`${rot}: pedido leva as duas cidades`, ultimo().cidades === 'braga,lisboa', JSON.stringify(ultimo()));
    const cb2 = await chip().boundingBox();
    ok(`${rot}: botão com cidades continua dentro do ecrã`, cb2 && cb2.x + cb2.width <= p.viewportSize().width + 1, cb2 ? `${Math.round(cb2.x)}+${Math.round(cb2.width)}` : '');
    const ccs = await chip().evaluate(eval(CONTRASTE));
    ok(`${rot}: botão com cidades (escuro) com contraste ≥ 4.5:1`, ccs >= 4.5, ccs.toFixed(2));
    await foto(p, '4_duas_cidades');

    // Pesquisa sem resultados nas cidades → "Procurar em todo o país"
    await p.locator('input[placeholder*="Pesquisar"]').first().fill('zzz');
    await p.waitForSelector('[data-teste="sem-linhas"]', { timeout: 8000 });
    const semTxt = await p.locator('[data-teste="sem-linhas"]').innerText();
    ok(`${rot}: sem resultados nas cidades diz onde procurou`, /Nenhuma linha em Braga e Lisboa/.test(semTxt), semTxt.replace(/\n/g, ' ').slice(0, 100));
    await foto(p, '5_sem_resultados');
    await p.locator('[data-teste="procurar-todo-o-pais"]').first().click();
    await p.waitForFunction(() => /Só noutra cidade/i.test(document.body.innerText), null, { timeout: 8000 }).catch(() => {});
    ok(`${rot}: "Procurar em todo o país" mostra a linha de outra cidade`, /Só noutra cidade/i.test(await p.evaluate(() => document.body.innerText)));
    ok(`${rot}: esse pedido não leva filtro`, !ultimo().cidades && ultimo().q === 'zzz', JSON.stringify(ultimo()));
    ok(`${rot}: avisa que mostra todo o país`, (await p.locator('[data-teste="aviso-todo-o-pais"]').count()) === 1);
    ok(`${rot}: "todo o país" é só desta vez (a escolha continua guardada)`, (await ls('parou_cidades')) === '{"v":1,"s":["braga","lisboa"]}', await ls('parou_cidades'));
    await foto(p, '6_todo_o_pais');
    await p.getByRole('button', { name: 'Voltar às minhas cidades' }).click();
    await p.waitForTimeout(900);
    ok(`${rot}: "Voltar às minhas cidades" volta a filtrar`, ultimo().cidades === 'braga,lisboa', JSON.stringify(ultimo()));
    await p.locator('input[placeholder*="Pesquisar"]').first().fill('');
    await p.waitForTimeout(700);

    // Guardado ao recarregar: o primeiro pedido já leva as cidades (nada de piscar com o país todo)
    pedidos.length = 0;
    await p.reload({ waitUntil: 'domcontentloaded' });
    await p.waitForSelector('[data-teste="botao-cidades"]:visible', { timeout: 45000 });
    await p.waitForTimeout(1200);
    ok(`${rot}: ao recarregar mantém as cidades escolhidas`, /Braga e Lisboa/.test(await chip().innerText()), await chip().innerText());
    ok(`${rot}: ao recarregar nenhum pedido sai sem filtro`, pedidos.length >= 1 && pedidos.every((x) => x.cidades === 'braga,lisboa'), JSON.stringify(pedidos));

    // Limite de 8 cidades
    await chip().click();
    await p.waitForSelector(sheet);
    for (const s of ['porto', 'coimbra', 'faro', 'aveiro', 'leiria', 'viseu']) {
      const el = p.locator(`[data-teste="cidade"][data-cidade="${s}"]`);
      if (await el.count()) await el.click();
    }
    const marcadas = await p.locator('[data-teste="cidade"][aria-checked="true"]').count();
    ok(`${rot}: chega a 8 cidades escolhidas`, marcadas === 8, marcadas);
    const bloqueadas = await p.locator('[data-teste="cidade"]:disabled').count();
    ok(`${rot}: com 8, as restantes ficam bloqueadas`, bloqueadas >= 30, bloqueadas);
    ok(`${rot}: diz que chegou ao máximo`, /o máximo/.test(await p.locator(sheet).innerText()));
    await foto(p, '7_maximo');
    await p.locator('[data-teste="cidades-limpar"]').click();
    await p.waitForTimeout(200);
    ok(`${rot}: "Ver todas" limpa a escolha e guarda a lista vazia`, (await ls('parou_cidades')) === '{"v":1,"s":[]}', await ls('parou_cidades'));
    await p.locator('[data-teste="cidades-concluido"]').click();
    await p.waitForTimeout(900);
    ok(`${rot}: sem cidades volta "Cidades: todas" e o pedido sem filtro`, /Cidades: todas/.test(await chip().innerText()) && !ultimo().cidades, `${await chip().innerText()} ${JSON.stringify(ultimo())}`);

    // Cidade sem linhas nos nossos dados: diz a verdade e deixa procurar em todo o país
    await p.evaluate(() => localStorage.setItem('parou_cidades', JSON.stringify({ v: 1, s: ['viseu'] })));
    await p.goto(`${BASE}/horarios`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('[data-teste="sem-linhas"]', { timeout: 20000 });
    const vazio = await p.locator('[data-teste="sem-linhas"]').innerText();
    ok(`${rot}: cidade sem linhas diz "Ainda não temos linhas de Viseu."`, /Ainda não temos linhas de Viseu/.test(vazio), vazio.replace(/\n/g, ' ').slice(0, 100));
    ok(`${rot}: cidade sem linhas oferece "Procurar em todo o país"`, (await p.locator('[data-teste="procurar-todo-o-pais"]').count()) >= 1);
    await foto(p, '7b_cidade_sem_linhas');

    // Favoritos: o mesmo botão e o mesmo seletor
    await p.evaluate(() => localStorage.setItem('parou_cidades', JSON.stringify({ v: 1, s: ['porto', 'braga'] })));
    await p.goto(`${BASE}/favoritos`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('[data-teste="cidades-favoritos"]:visible', { timeout: 30000 });
    await fechaPonto(p);
    const bf = p.locator('[data-teste="cidades-favoritos"] [data-teste="botao-cidades"]');
    ok(`${rot}: Favoritos mostra as cidades escolhidas`, /Porto e Braga/.test(await bf.innerText()), await bf.innerText());
    ok(`${rot}: Favoritos explica o efeito nos Horários`, /Nos Horários só vês as linhas/.test(await p.locator('[data-teste="cidades-favoritos"]').innerText()));
    await foto(p, '8_favoritos');
    await bf.click();
    await p.waitForSelector(sheet);
    ok(`${rot}: Favoritos abre o seletor com as duas marcadas`, (await p.locator('[data-teste="cidade"][aria-checked="true"]').count()) === 2);
    await p.locator('[data-teste="cidade"][data-cidade="porto"]').click();
    await p.locator('[data-teste="cidades-concluido"]').click();
    await p.waitForTimeout(300);
    ok(`${rot}: Favoritos atualiza o botão (só Braga)`, /^\s*Braga\s*$/.test(await bf.innerText()) || /Braga/.test(await bf.innerText()) && !/Porto/.test(await bf.innerText()), await bf.innerText());
    ok(`${rot}: Favoritos guarda a escolha`, (await ls('parou_cidades')) === '{"v":1,"s":["braga"]}', await ls('parou_cidades'));
    await foto(p, '9_favoritos_braga');
    const sobra = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(`${rot}: Favoritos sem deslize horizontal`, sobra <= 1, sobra);
  } catch (e) {
    ok(`${rot}: fluxo sem exceções`, false, String(e).slice(0, 300));
    await foto(p, 'erro');
  }
  ok(`${rot}: sem erros de JavaScript`, erros.length === 0, erros.slice(0, 2).join(' | '));
  await ctx.close();
}

// ============ Parte C: aviso de posição pouco precisa ============
async function parteAviso(browser, nome, motor, tema, custom) {
  const rot = `[${nome} ${tema}] precisão`;
  const foto = async (p, s) => { await p.waitForTimeout(400); return p.screenshot({ path: `${SAIDA}/${nome.replace(/[^\w]+/g, '_')}_${tema}_prec_${s}.jpg`, type: 'jpeg', quality: 60, scale: 'css' }).catch(() => {}); };
  const ctx = await novoContexto(browser, nome, tema, custom, { gps: true });
  if (!ctx) return;
  await ctx.setGeolocation({ latitude: LAT, longitude: LON, accuracy: 800 });
  await ctx.route('**/api/transit/nearby**', (rt) => rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ stops: [PARAGEM], vehicles: [], alerts: [], radiusMeters: 500, timestamp: new Date().toISOString() }) }));
  await ctx.route('**/api/transit/stop/**', (rt) => rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ departures: [] }) }));
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(String(e).slice(0, 200)));
  const aviso = p.locator('[data-teste="aviso-precisao-chip"]:visible');
  try {
    await p.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('[data-teste="paragem-perto"]:visible', { timeout: 45000 });
    await fechaPonto(p);
    // O aviso vive no mapa e só aparece depois de a precisão ficar fraca durante uns segundos (não pisca no arranque do GPS)
    await p.waitForSelector('[data-teste="aviso-precisao-chip"]', { state: 'visible', timeout: 45000 });
    const chip = await aviso.first().innerText();
    ok(`${rot}: com 800 m de erro o aviso do mapa diz "posição aproximada"`, /Posição aproximada/.test(chip), chip.replace(/\n/g, ' ').slice(0, 120));
    ok(`${rot}: diz a ordem de grandeza (cerca de N metros ou km)`, /cerca de (\d[\d,. ]*\s?(metros?|km))/.test(chip), chip.replace(/\n/g, ' ').slice(0, 80));
    const bc = await aviso.first().boundingBox();
    ok(`${rot}: aviso cabe na largura do ecrã e tem ≥ 44 px de altura`, bc && bc.x >= 0 && bc.x + bc.width <= p.viewportSize().width + 1 && bc.height >= 44, bc ? `${Math.round(bc.x)}+${Math.round(bc.width)} x ${Math.round(bc.height)}` : '');
    await foto(p, '1_aviso');
    await aviso.first().click();
    const det = p.locator('[data-teste="aviso-precisao-detalhe"]:visible');
    await det.first().waitFor({ state: 'visible', timeout: 5000 });
    const txt = await det.first().innerText();
    ok(`${rot}: o detalhe explica como ligar a localização precisa`, /localização precisa/.test(txt), txt.replace(/\n/g, ' ').slice(0, 120));
    const c1 = await det.first().locator('p').first().evaluate(eval(CONTRASTE));
    ok(`${rot}: texto do detalhe com contraste ≥ 4.5:1`, c1 >= 4.5, c1.toFixed(2));
    const bf = await p.locator('[data-teste="aviso-precisao-fechar-mapa"]:visible').first().boundingBox();
    ok(`${rot}: botão "Fechar" com altura ≥ 44 px`, bf && bf.height >= 44, bf ? Math.round(bf.height) : '');
    await foto(p, '2_detalhe');
    await p.locator('[data-teste="aviso-precisao-fechar-mapa"]:visible').first().click();
    await p.waitForTimeout(300);
    ok(`${rot}: "Fechar" esconde o detalhe`, (await det.count()) === 0);
    // A posição melhora: o aviso desaparece
    await ctx.setGeolocation({ latitude: LAT, longitude: LON, accuracy: 8 });
    await p.waitForFunction(() => !document.querySelector('[data-teste="aviso-precisao-chip"]'), null, { timeout: 30000 }).catch(() => {});
    ok(`${rot}: com a posição boa não há aviso`, (await aviso.count()) === 0);
  } catch (e) {
    ok(`${rot}: aviso sem exceções`, false, String(e).slice(0, 300));
    await foto(p, 'erro');
  }
  ok(`${rot}: aviso sem erros de JavaScript`, erros.length === 0, erros.slice(0, 2).join(' | '));
  await ctx.close();
}

for (const [nome, motor, tema, custom] of ALVOS) {
  const b = await (motor === 'webkit' ? webkit : chromium).launch();
  try {
    await parteCidades(b, nome, motor, tema, custom);
    await parteLocalizacao(b, nome, motor, tema, custom);
    if (nome !== 'Pixel 5') await parteAviso(b, nome, motor, tema, custom);
  } catch (e) {
    ok(`[${nome} ${tema}] sem exceções gerais`, false, String(e).slice(0, 300));
  }
  await b.close();
}

fs.writeFileSync(`${SAIDA}/resultado.json`, JSON.stringify(res, null, 1));
const falhas = res.testes.filter((t) => !t.ok);
console.log(`\nTOTAL ${res.testes.length - falhas.length}/${res.testes.length}`);
if (falhas.length) { console.log('FALHAS:'); for (const f of falhas) console.log(' -', f.nome, f.extra); }
