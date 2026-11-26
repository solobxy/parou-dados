// Ver as partidas de uma paragem a outra hora (pedido do Dinis, 26/11/2026: «uma pessoa sai do trabalho às 22:00 mas são
// 15:00: como vê as partidas dessa hora ou quando é a última?»).
//   - API: ?time= dá as partidas a partir dessa hora, sem dados em direto; a memória de 30 s não mistura «agora» com outra
//     hora; ?ultimas=1 dá a última partida de cada linha e destino nesse dia (as que faltam primeiro); recusa o inválido;
//   - ecrã (Campanhã, base de teste do CI): o botão «Agora» abre os dias, a hora e «Última de cada linha»; escolher amanhã às
//     22:00 mostra horas fixas (nada de «X min») iguais às do servidor; «Última de cada linha» mostra uma por linha e destino;
//     «Agora» volta às partidas em direto; erro com «Tentar outra vez» que recupera; 320 px sem scroll lateral,
//     alvos de toque de 40 px; capturas a 320/390/1280 px e nos temas;
//   - percurso de uma linha: «Horário do dia nesta paragem» (com a viagem: o sentido dela e as linhas com o mesmo nome);
//   - rotas: «Sair agora» → amanhã às 22:00 volta a calcular com essa hora; «Agora» volta a agora.
// Não é num telemóvel a sério.
// Uso: BASE=http://127.0.0.1:3000 SAIDA=res node escolher-hora.mjs
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const SAIDA = process.env.SAIDA || 'res';
fs.mkdirSync(SAIDA, { recursive: true });
let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };
const nota = (s) => console.log('NOTA   ', s);
let proximoIp = 10;
const novoIp = () => `198.51.100.${proximoIp++}`;
const diaLisboa = (desvio) => {
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const [a, m, d] = hoje.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + desvio, 12)).toISOString().slice(0, 10);
};
const HOJE = diaLisboa(0), AMANHA = diaLisboa(1);
const CAMPANHA = { latitude: 41.14871, longitude: -8.58483 };
const IP_API = novoIp();
const api = async (caminho) => { const r = await fetch(BASE + caminho, { headers: { 'x-forwarded-for': IP_API } }); return { status: r.status, j: await r.json().catch(() => null) }; };
const diaDe = (epoch) => new Date(epoch * 1000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Lisbon' });
const horaDe = (epoch) => new Date(epoch * 1000).toLocaleTimeString('en-GB', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit', hour12: false });

// ---------------------------------------------------------------- API
const perto = await api(`/api/transit/nearby?lat=${CAMPANHA.latitude}&lon=${CAMPANHA.longitude}&radius=400`);
const paragens = perto.j?.stops || [];
const cp = paragens.find((s) => /^cp:/.test(s.id)) || paragens[0];
ok('há paragens em Campanhã na base de teste', Boolean(cp), paragens.slice(0, 4).map((s) => s.id).join(', '));
if (cp) {
  const id = encodeURIComponent(cp.id);
  const ate = await api(`/api/transit/stop/${id}?linhas=1&time=${AMANHA}T22:00`);
  const deps = ate.j?.departures || [];
  const limite = Date.parse(`${AMANHA}T22:00:00Z`) / 1000 - 3600; // (inverno: UTC+0; folga de 1 h para o verão)
  ok('API ?time=amanhã 22:00: responde com partidas', ate.status === 200 && deps.length > 0, `${ate.status} ${deps.length}`);
  ok('API ?time: todas a partir dessa hora', deps.every((d) => d.dep_epoch_secs >= limite), deps.slice(0, 4).map((d) => `${diaDe(d.dep_epoch_secs)} ${d.scheduled_time}`).join(', '));
  ok('API ?time longe de agora: só horário oficial (nada em direto)', deps.every((d) => d.state !== 'TEMPO REAL' && !d.is_realtime), deps.map((d) => d.state).filter((x) => x !== 'PROGRAMADO').join(','));
  const agora = await api(`/api/transit/stop/${id}?linhas=1`);
  const primeiraAgora = agora.j?.departures?.[0]?.dep_epoch_secs || 0;
  ok('API: «agora» logo a seguir não devolve as partidas de amanhã às 22:00 (memória separada)', agora.status === 200 && primeiraAgora > 0 && primeiraAgora < limite, `${diaDe(primeiraAgora)} ${horaDe(primeiraAgora)}`);
  const ult = await api(`/api/transit/stop/${id}?ultimas=1&data=${HOJE}`);
  const ps = ult.j?.partidas || [];
  ok('API ?ultimas=1: a última de cada linha', ult.status === 200 && ps.length > 0, `${ps.length}`);
  const chaves = ps.map((p) => `${p.route_short_name}|${String(p.headsign).toLowerCase()}`);
  ok('API ?ultimas=1: uma só por linha e destino', new Set(chaves).size === chaves.length);
  const agoraS = Date.now() / 1000;
  const iFutura = ps.findIndex((p) => p.dep_epoch_secs < agoraS);
  ok('API ?ultimas=1: as que ainda vão partir vêm primeiro, por hora', (iFutura === -1 ? ps : ps.slice(0, iFutura)).every((p, i, a) => i === 0 || a[i - 1].dep_epoch_secs <= p.dep_epoch_secs) && (iFutura === -1 || ps.slice(iFutura).every((p) => p.dep_epoch_secs < agoraS)));
  // a última de cada linha é mesmo a última: nenhuma partida dessa linha e destino depois dela nesse dia
  const tarde = await api(`/api/transit/stop/${id}?linhas=1&time=${HOJE}T23:59`);
  const depoisDaUltima = (tarde.j?.departures || []).filter((d) => {
    const u = ps.find((p) => p.route_short_name === d.route_short_name && String(p.headsign).toLowerCase() === String(d.headsign).toLowerCase());
    return u && diaDe(d.dep_epoch_secs) === HOJE && d.dep_epoch_secs > u.dep_epoch_secs;
  });
  ok('API ?ultimas=1: não há partidas da mesma linha e destino depois da «última» (hoje)', depoisDaUltima.length === 0, depoisDaUltima.slice(0, 3).map((d) => `${d.route_short_name} ${d.scheduled_time}`).join(', '));
  const inval = await Promise.all([
    api(`/api/transit/stop/${id}?time=2030-01-01T10:00`), api(`/api/transit/stop/${id}?time=isto-nao`), api(`/api/transit/stop/${id}?ultimas=1&data=ontem`),
  ]);
  ok('API: recusa horas e datas inválidas (400)', inval.every((r) => r.status === 400), inval.map((r) => r.status).join(','));
}

// ---------------------------------------------------------------- ecrã
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, args: ['--no-sandbox'] } : {});
async function abrir({ largura = 390, altura = 844, tema = 'claro', falhar = false } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: largura, height: altura }, hasTouch: largura < 1000, isMobile: largura < 1000, locale: 'pt-PT', timezoneId: 'Europe/Lisbon', serviceWorkers: 'block',
    geolocation: CAMPANHA, permissions: ['geolocation'],
    userAgent: largura < 1000 ? 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' : undefined,
  });
  await ctx.addInitScript({ content: `try{ localStorage.setItem('parou_aviso_instalar','1'); localStorage.setItem('parou_bemvindo','visto'); localStorage.setItem('parou_tema','${tema}'); localStorage.setItem('parou_localizacao_ok','1'); }catch(e){}` });
  await ctx.route(/(tile|openstreetmap|arcgisonline|cartocdn|basemaps)\./i, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64') }));
  const estado = { falhar, pedidos: [] };
  const ip = novoIp();
  await ctx.route(/\/api\//, async (rt) => {
    const url = rt.request().url();
    if (/\/api\/transit\/stop\/[^?]+\?(.*&)?(time|ultimas)=/.test(url)) {
      estado.pedidos.push(url.replace(BASE, ''));
      if (estado.falhar) return rt.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"teste"}' });
    }
    return rt.continue({ headers: { ...rt.request().headers(), 'x-forwarded-for': ip } });
  });
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(String(e).slice(0, 200)));
  await p.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForSelector('[data-teste="paragem-perto"]:visible', { timeout: 45000 });
  const fechar = p.locator('[data-teste="ponto-diario-fechar"]');
  if (await fechar.count()) await fechar.first().click({ timeout: 2000 }).catch(() => {});
  // abre a primeira paragem (toca no nome da paragem no cartão: os botões do cartão abrem linhas ou guardam favoritos)
  const cartao = p.locator('[data-teste="paragem-perto"]:visible').first();
  await cartao.locator('h2').first().click({ timeout: 8000 });
  await p.locator('.painel-paragem').first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
  await p.waitForSelector('[data-teste="botao-hora"]:visible', { timeout: 15000 }).catch(() => {});
  return { ctx, p, erros, estado };
}
const visiveis = (p, sel) => p.$$eval(sel, (els) => els.filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.innerText.replace(/\s+/g, ' ').trim()));

for (const largura of [390, 320]) {
  const { ctx, p, erros, estado } = await abrir({ largura });
  try {
    const botao = p.locator('[data-teste="botao-hora"]:visible');
    ok(`[${largura}] a paragem aberta tem o botão «Agora»`, (await botao.count()) === 1 && /Agora/.test(await botao.innerText()));
    await botao.click();
    await p.waitForSelector('[data-teste="seletor-hora"]:visible', { timeout: 5000 }).catch(() => {});
    ok(`[${largura}] ao tocar abre os dias, a hora e «Última de cada linha»`, await p.locator('[data-teste="seletor-hora"] [data-teste="dias-horario"] button').count() >= 7
      && await p.locator('[data-teste="hora-escolhida"]:visible').count() === 1 && await p.locator('[data-teste="ultima-partida"]:visible').count() === 1);
    // amanhã às 22:00
    await p.locator('[data-teste="dias-horario"] button').nth(1).click();
    await p.locator('[data-teste="hora-escolhida"]').fill('22:00');
    // ao confirmar a hora no seletor do telemóvel (evento «change»), o painel fecha e fica a lista à vista
    await p.waitForSelector('[data-teste="partida-hora"]:visible', { timeout: 15000 }).catch(() => {});
    const linhas = await visiveis(p, '[data-teste="partida-hora"]');
    ok(`[${largura}] depois de escolher a hora, o painel fecha`, await p.locator('[data-teste="seletor-hora"]:visible').count() === 0);
    const contexto = (await visiveis(p, '[data-teste="contexto-hora"]'))[0] || '';
    ok(`[${largura}] a lista diz que é o horário oficial, de que dia e a partir de que hora`, /Horário oficial/.test(contexto) && /Amanhã/.test(contexto) && /22:00/.test(contexto), contexto);
    const pedido = estado.pedidos.at(-1) || '';
    ok(`[${largura}] amanhã às 22:00: pede ao servidor essa hora`, pedido.includes(`time=${encodeURIComponent(`${AMANHA}T22:00`)}`) || pedido.includes(`time=${AMANHA}T22`), pedido);
    ok(`[${largura}] amanhã às 22:00: mostra partidas com hora fixa (nada de «min»)`, linhas.length > 0 && linhas.every((l) => /\b\d{2}:\d{2}\b/.test(l) && !/\bmin\b/.test(l)), linhas.slice(0, 3).join(' | '));
    const id = pedido.match(/\/api\/transit\/stop\/([^?]+)/)?.[1];
    if (id) {
      const srv = await api(`/api/transit/stop/${id}?linhas=1&time=${AMANHA}T22:00`);
      const primeira = srv.j?.departures?.[0]?.scheduled_time;
      ok(`[${largura}] a primeira hora no ecrã é a do servidor`, Boolean(primeira) && (linhas[0] || '').includes(primeira), `${primeira} vs ${linhas[0]}`);
    }
    const rotulo = await botao.innerText();
    ok(`[${largura}] o botão diz o que se está a ver («Amanhã, 22:00»)`, /Amanhã/.test(rotulo) && /22:00/.test(rotulo), rotulo);
    await p.screenshot({ path: `${SAIDA}/escolher-hora_${largura}_amanha-22h.png` });
    // última de cada linha
    await botao.click();
    ok(`[${largura}] com o painel aberto, o botão de cima não repete a escolha («Escolher dia e hora»)`, /Escolher dia e hora/.test(await botao.innerText()), await botao.innerText());
    await p.locator('[data-teste="ultima-partida"]').click();
    await p.waitForFunction(() => /Última partida de cada linha/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
    const ultimas = await visiveis(p, '[data-teste="partida-hora"]');
    ok(`[${largura}] «Última partida»: lista uma por linha, com hora`, ultimas.length > 0 && ultimas.every((l) => /\b\d{2}:\d{2}\b/.test(l)), `${ultimas.length}: ${ultimas.slice(0, 2).join(' | ')}`);
    ok(`[${largura}] «Última partida» pede ao servidor as últimas de amanhã`, (estado.pedidos.at(-1) || '').includes(`ultimas=1&data=${AMANHA}`), estado.pedidos.at(-1));
    ok(`[${largura}] «Última de cada linha» fecha o painel e o botão diz «Últimas · Amanhã»`, await p.locator('[data-teste="seletor-hora"]:visible').count() === 0 && /Últimas/.test(await botao.innerText()) && /Amanhã/.test(await botao.innerText()), await botao.innerText());
    await p.screenshot({ path: `${SAIDA}/escolher-hora_${largura}_ultima.png` });
    // no modo última, o campo da hora dá lugar a «A partir das…»
    await botao.click();
    ok(`[${largura}] no modo última não aparece a hora (só «A partir das…» para voltar a esse modo)`, await p.locator('[data-teste="hora-escolhida"]:visible').count() === 0 && await p.locator('[data-teste="modo-a-partir"]:visible').count() === 1);
    await p.screenshot({ path: `${SAIDA}/escolher-hora_${largura}_painel-ultimas.png` });
    // alvos de toque e largura
    const alturas = await p.$$eval('[data-teste="botao-hora"], [data-teste="voltar-agora"], [data-teste="ultima-partida"], [data-teste="modo-a-partir"], [data-teste="dias-horario"] button', (els) => els.filter((e) => e.getBoundingClientRect().width > 0).map((e) => Math.round(e.getBoundingClientRect().height)));
    ok(`[${largura}] alvos de toque ≥ 40 px`, alturas.length >= 3 && alturas.every((h) => h >= 40), JSON.stringify(alturas));
    const lateral = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(`[${largura}] sem scroll para o lado`, lateral <= 0, `${lateral}px`);
    // voltar a agora
    await p.locator('[data-teste="voltar-agora"]').click();
    await p.waitForTimeout(800);
    ok(`[${largura}] «Voltar a agora»: o botão volta a dizer «Agora» e a lista volta às partidas em direto`, /Agora/.test(await botao.innerText())
      && (await p.locator('[data-teste="partida-hora"]:visible').count()) === 0 && (await p.locator('[data-teste="seletor-hora"]:visible').count()) === 0);
    ok(`[${largura}] sem erros na página`, erros.length === 0, erros.join(' | '));
  } catch (e) {
    ok(`[${largura}] o ecrã funcionou`, false, String(e).slice(0, 200));
    await p.screenshot({ path: `${SAIDA}/escolher-hora_${largura}_erro.png` }).catch(() => {});
  }
  await ctx.close();
}

{ // erro do servidor: «Tentar outra vez» recupera
  const { ctx, p, erros, estado } = await abrir({ falhar: true });
  try {
    await p.locator('[data-teste="botao-hora"]:visible').click();
    await p.locator('[data-teste="hora-escolhida"]').fill('22:00');
    await p.waitForSelector('[data-teste="partidas-hora-erro"]:visible', { timeout: 15000 }).catch(() => {});
    ok('erro: diz que não foi possível e oferece «Tentar outra vez» (não «sem partidas»)', await p.locator('[data-teste="partidas-hora-erro"]:visible').count() === 1 && await p.locator('[data-teste="partidas-hora-vazio"]:visible').count() === 0);
    estado.falhar = false;
    await p.locator('[data-teste="partidas-hora-erro"] button').click();
    await p.waitForSelector('[data-teste="partida-hora"]:visible', { timeout: 15000 }).catch(() => {});
    ok('erro: «Tentar outra vez» volta a pedir e mostra as partidas', await p.locator('[data-teste="partida-hora"]:visible').count() > 0);
    ok('sem erros na página (erro)', erros.length === 0, erros.join(' | '));
  } catch (e) {
    ok('erro: o ecrã funcionou', false, String(e).slice(0, 200));
  }
  await ctx.close();
}

// ---------------------------------------------------------------- percurso aberto: «Horário do dia nesta paragem»
for (const largura of [390, 320]) {
  const { ctx, p, erros } = await abrir({ largura });
  const pedidosDia = [];
  p.on('request', (r) => { if (/\/api\/lines\/[^/?]+\/dia\?/.test(r.url())) pedidosDia.push(r.url()); });
  try {
    // toca na primeira partida da paragem aberta (abre o percurso da linha)
    await p.locator('.painel-paragem [role="button"][aria-label^="Ver o percurso da linha"]:visible').first().click({ timeout: 15000 });
    await p.waitForSelector('[data-teste="percurso-linha"]:visible', { timeout: 15000 });
    const botao = p.locator('[data-teste="horario-linha-paragem"]:visible');
    await botao.waitFor({ state: 'visible', timeout: 15000 });
    ok(`[${largura}] percurso: há «Horário do dia nesta paragem»`, /Horário do dia nesta paragem/.test(await botao.innerText()));
    await botao.click();
    await p.waitForSelector('[data-teste="horario-dia"]:visible, [data-teste="horario-dia-vazio"]:visible', { timeout: 15000 }).catch(() => {});
    const horas = await p.$$eval('[data-teste="horario-dia"]', (els) => (els[0]?.innerText || '').match(/\d{1,2}/g)?.length || 0);
    ok(`[${largura}] percurso: mostra o horário do dia (por horas)`, horas > 0 || await p.locator('[data-teste="horario-dia-vazio"]:visible').count() === 1, `${horas} números`);
    ok(`[${largura}] percurso: o pedido leva a viagem aberta (sentido e linhas com o mesmo nome)`, /[?&]viagem=/.test(pedidosDia.at(-1) || ''), pedidosDia.at(-1));
    await p.locator('[data-teste="horario-linha-dia"] [data-teste="dias-horario"] button').nth(1).click();
    await p.waitForTimeout(400);
    ok(`[${largura}] percurso: «Amanhã» pede o horário de amanhã`, (pedidosDia.at(-1) || '').includes(`data=${AMANHA}`), pedidosDia.at(-1));
    await p.waitForSelector('[data-teste="horario-dia"]:visible, [data-teste="horario-dia-vazio"]:visible', { timeout: 15000 }).catch(() => {});
    const lateral = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(`[${largura}] percurso: sem scroll para o lado`, lateral <= 0, `${lateral}px`);
    await p.screenshot({ path: `${SAIDA}/escolher-hora_${largura}_horario-linha.png` });
    await botao.click();
    ok(`[${largura}] percurso: «Ver o percurso» volta às paragens da viagem`, await p.locator('[data-teste="horario-linha-dia"]:visible').count() === 0 && /Horário do dia/.test(await botao.innerText()));
    ok(`[${largura}] sem erros na página (percurso)`, erros.length === 0, erros.join(' | '));
  } catch (e) {
    ok(`[${largura}] percurso: o ecrã funcionou`, false, String(e).slice(0, 200));
    await p.screenshot({ path: `${SAIDA}/escolher-hora_${largura}_horario-linha_erro.png` }).catch(() => {});
  }
  await ctx.close();
}

// ---------------------------------------------------------------- rotas: «Sair agora» → amanhã às 22:00
const TRINDADE = { id: 'teste:trindade', title: 'Estação da Trindade', subtitle: 'Porto', latitude: 41.15228, longitude: -8.609299, type: 'PLACE' };
for (const largura of [390, 320]) {
  const { ctx, p, erros } = await abrir({ largura });
  const planos = [];
  await ctx.route('**/api/transit/destinations**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ suggestions: [TRINDADE] }) }));
  p.on('request', (r) => { if (/\/api\/transit\/plan-route\?/.test(r.url())) planos.push(r.url()); });
  try {
    // volta à lista e pesquisa um destino
    await p.locator('[aria-label="Voltar aos transportes perto"]:visible').first().click().catch(() => {});
    const campo = p.locator('input[placeholder="Para onde vais?"]:visible').first();
    await campo.click({ timeout: 8000 });
    await campo.fill('trindade');
    await p.locator('text=Estação da Trindade >> visible=true').first().click({ timeout: 10000 });
    await p.waitForSelector('[data-teste="botao-partida"]:visible', { timeout: 20000 });
    const botao = p.locator('[data-teste="botao-partida"]:visible').first();
    ok(`[${largura}] rotas: há o botão «Sair agora»`, /Sair agora/.test(await botao.innerText()), await botao.innerText());
    await p.waitForFunction(() => !/A calcular percursos/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {});
    const antes = planos.length;
    await botao.click();
    await p.locator('[data-teste="seletor-partida"] [data-teste="dias-horario"] button').nth(1).click();
    await p.locator('[data-teste="hora-partida"]').fill('22:00');
    await p.waitForFunction((n) => true, antes, { timeout: 1000 }).catch(() => {});
    await p.waitForTimeout(600);
    await p.waitForFunction(() => !/A calcular percursos/.test(document.body.innerText), null, { timeout: 40000 }).catch(() => {});
    const ultimo = planos.at(-1) || '';
    const quando = new URL(ultimo || 'http://x/').searchParams.get('quando') || '';
    const esperado = (() => { // amanhã 22:00 em Lisboa, como instante
      const g = Date.parse(`${AMANHA}T22:00:00Z`);
      const lx = new Date(g).toLocaleString('sv-SE', { timeZone: 'Europe/Lisbon' }).replace(' ', 'T');
      return new Date(g - (Date.parse(`${lx}Z`) - g)).toISOString();
    })();
    ok(`[${largura}] rotas: volta a calcular para amanhã às 22:00 (quando=… certo)`, planos.length > antes && quando === esperado, `${quando} vs ${esperado}`);
    const rotulo = await botao.innerText();
    ok(`[${largura}] rotas: o botão diz «Sair amanhã, 22:00»`, /amanhã/i.test(rotulo) && /22:00/.test(rotulo), rotulo);
    const texto = await p.evaluate(() => document.body.innerText);
    // cada opção começa por «22:03 – 22:14» (sair – chegar)
    const saidas = [...texto.matchAll(/\b(\d{2}):(\d{2}) – \d{2}:\d{2}\b/g)].map((m) => Number(m[1]) * 60 + Number(m[2]));
    const semOpcoes = /Sem ligações encontradas/.test(texto);
    if (semOpcoes) nota(`[${largura}] rotas: sem ligações na base de teste para amanhã às 22:00`);
    ok(`[${largura}] rotas: as opções saem a partir das 22:00 (ou diz que não há ligações)`, semOpcoes || (saidas.length > 0 && saidas.every((m) => m >= 22 * 60 - 1 || m < 6 * 60)), JSON.stringify(saidas.slice(0, 5)));
    const lateral = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(`[${largura}] rotas: sem scroll para o lado`, lateral <= 0, `${lateral}px`);
    await p.screenshot({ path: `${SAIDA}/escolher-hora_${largura}_rotas.png` });
    await p.locator('[data-teste="partida-agora"]:visible').first().click();
    await p.waitForTimeout(600);
    const depois = new URL(planos.at(-1) || 'http://x/').searchParams.get('quando');
    ok(`[${largura}] rotas: «Agora» volta a calcular para agora (sem quando)`, !depois && /Sair agora/.test(await botao.innerText()), String(depois));
    ok(`[${largura}] sem erros na página (rotas)`, erros.length === 0, erros.join(' | '));
  } catch (e) {
    ok(`[${largura}] rotas: o ecrã funcionou`, false, String(e).slice(0, 200));
    await p.screenshot({ path: `${SAIDA}/escolher-hora_${largura}_rotas_erro.png` }).catch(() => {});
  }
  await ctx.close();
}

// capturas nos temas e em 1280 px
for (const [largura, tema] of [[390, 'escuro'], [390, 'ambar'], [1280, 'claro']]) {
  const { ctx, p } = await abrir({ largura, altura: largura > 1000 ? 860 : 844, tema });
  try {
    await p.locator('[data-teste="botao-hora"]:visible').click();
    await p.locator('[data-teste="hora-escolhida"]').fill('22:00');
    await p.waitForSelector('[data-teste="partida-hora"]:visible', { timeout: 15000 }).catch(() => {});
    await p.screenshot({ path: `${SAIDA}/escolher-hora_${largura}_${tema}.png` });
    await p.locator('[data-teste="botao-hora"]:visible').click();
    await p.screenshot({ path: `${SAIDA}/escolher-hora_${largura}_${tema}_painel.png` });
    nota(`captura ${largura} ${tema}`);
  } catch (e) { nota(`captura ${largura} ${tema} falhou: ${String(e).slice(0, 120)}`); }
  await ctx.close();
}

await browser.close();
console.log();
console.log(falhas ? `${falhas} falha(s)` : 'Tudo OK');
process.exit(falhas ? 1 : 0);
