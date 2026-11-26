// Greve nas partidas da paragem aberta e no horário do dia, no ecrã (pedido do Dinis, 26/11/2026: «nos horários do dia não
// tiveste em conta a greve nem as alterações de horário por causa da greve»).
// As respostas reais do servidor levam por cima as marcas de uma greve (como as da greve da Metro do Porto de 27/11/2026):
//   - paragem aberta («agora» e «amanhã às 22:00»): aviso por cima da lista (o que funciona, frequências, «Aviso oficial»),
//     e cada partida com a marca: «Sem serviço (greve)» com a hora riscada, «Pode não se realizar», «Serviço reduzido»;
//   - percurso → «Horário do dia nesta paragem»: aviso, legenda e os minutos riscados (sem serviço) ou sublinhados (pode
//     não se realizar); véspera com a hora a que o serviço acaba;
//   - 320 px sem scroll para o lado, ligação do aviso com 40 px de altura, capturas a 390/320 px e nos temas.
// Não é num telemóvel a sério. Uso: BASE=http://127.0.0.1:3000 SAIDA=res node greve-horario-ecra.mjs
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const SAIDA = process.env.SAIDA || 'res';
fs.mkdirSync(SAIDA, { recursive: true });
let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };
let proximoIp = 60;
const novoIp = () => `198.51.100.${proximoIp++}`;
const diaLisboa = (desvio) => {
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const [a, m, d] = hoje.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + desvio, 12)).toISOString().slice(0, 10);
};
const AMANHA = diaLisboa(1);
const CAMPANHA = { latitude: 41.14871, longitude: -8.58483 };
const URL_AVISO = 'https://www.metrodoporto.pt/pages/630?news_id=658';
const GREVE = { titulo: 'Greve reduz serviço do Metro esta sexta-feira', url: URL_AVISO, operador: 'Metro do Porto', dia: AMANHA,
  funciona: ['Senhora da Hora – Estádio do Dragão', 'Hospital São João – Santo Ovídio'], frequencia: '15 min (7h–20h) · 30 min (6h–7h, 20h–0h)' };
const VESPERA = { titulo: GREVE.titulo, url: URL_AVISO, operador: 'Metro do Porto', dia: AMANHA, vespera: true, fimVespera: '23:00' };
const ESTADOS = ['sem-servico', 'incerta', 'reduzido'];
const modo = { diaTodoIncerto: false };

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, args: ['--no-sandbox'] } : {});
async function abrir({ largura = 390, altura = 844, tema = 'claro' } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: largura, height: altura }, hasTouch: true, isMobile: true, locale: 'pt-PT', timezoneId: 'Europe/Lisbon', serviceWorkers: 'block',
    geolocation: CAMPANHA, permissions: ['geolocation'],
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  });
  await ctx.addInitScript({ content: `try{ localStorage.setItem('parou_aviso_instalar','1'); localStorage.setItem('parou_bemvindo','visto'); localStorage.setItem('parou_tema','${tema}'); localStorage.setItem('parou_localizacao_ok','1'); }catch(e){}` });
  await ctx.route(/(tile|openstreetmap|arcgisonline|cartocdn|basemaps)\./i, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64') }));
  const ip = novoIp();
  await ctx.route(/\/api\//, async (rt) => {
    const url = rt.request().url();
    const headers = { ...rt.request().headers(), 'x-forwarded-for': ip };
    // partidas de uma paragem: as três primeiras levam cada uma das marcas, e o aviso vai por cima
    if (/\/api\/transit\/stop\/[^/?]+\?/.test(url)) {
      const r = await rt.fetch({ headers });
      const j = await r.json().catch(() => null);
      if (j && Array.isArray(j.departures)) {
        // as marcas reais (ex.: uma greve da CP a decorrer) saem: o teste põe as suas
        j.departures.forEach((d) => { delete d.greve; });
        j.departures.forEach((d, i) => { if (i < 3) { d.greve = { estado: ESTADOS[i], operador: 'Metro do Porto' }; d.state = 'PROGRAMADO'; d.is_realtime = false; } });
        j.greves = [GREVE];
      }
      return rt.fulfill({ status: r.status(), contentType: 'application/json', body: JSON.stringify(j) });
    }
    // horário do dia: véspera (as últimas sem serviço, a anterior pode não se realizar) ou dia da greve
    if (/\/api\/lines\/[^/?]+\/dia\?/.test(url)) {
      const r = await rt.fetch({ headers });
      const j = await r.json().catch(() => null);
      if (j && Array.isArray(j.partidas) && j.partidas.length) {
        const n = j.partidas.length;
        j.partidas.forEach((p) => { delete p.greve; });
        if (modo.diaTodoIncerto) {
          j.partidas.forEach((p) => { p.greve = 'incerta'; });
          j.greves = [{ titulo: 'Greve - serviços mínimos', url: 'https://www.cp.pt/passageiros/pt/consultar-horarios/avisos', operador: 'CP', dia: AMANHA }];
        } else {
          j.partidas.forEach((p, i) => { if (i >= n - 2) p.greve = 'sem-servico'; else if (i >= n - 4) p.greve = 'incerta'; });
          j.greves = [VESPERA];
        }
      }
      return rt.fulfill({ status: r.status(), contentType: 'application/json', body: JSON.stringify(j) });
    }
    return rt.continue({ headers });
  });
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(String(e).slice(0, 200)));
  await p.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 });
  await p.waitForSelector('[data-teste="paragem-perto"]:visible', { timeout: 45000 });
  const fechar = p.locator('[data-teste="ponto-diario-fechar"]');
  if (await fechar.count()) await fechar.first().click({ timeout: 2000 }).catch(() => {});
  await p.locator('[data-teste="paragem-perto"]:visible').first().locator('h2').first().click({ timeout: 8000 });
  await p.waitForSelector('[data-teste="greve-partida"]:visible', { timeout: 20000 }).catch(() => {});
  return { ctx, p, erros };
}
const textos = (p, sel) => p.$$eval(sel, (els) => els.filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.innerText.replace(/\s+/g, ' ').trim()));

for (const largura of [390, 320]) {
  const { ctx, p, erros } = await abrir({ largura });
  try {
    // ---- paragem aberta, agora
    const aviso = (await textos(p, '[data-teste="greve-horario"]'))[0] || '';
    ok(`[${largura}] agora: aviso por cima das partidas com o que funciona e as frequências`, /Greve na Metro do Porto · Amanhã/.test(aviso)
      && /Só funciona: Senhora da Hora – Estádio do Dragão e Hospital São João – Santo Ovídio, com uma viagem a cada 15 min \(7h–20h\)/.test(aviso) && /Fora disso não há viagens/.test(aviso), aviso);
    const ligacao = p.locator('[data-teste="greve-horario"]:visible a').first();
    ok(`[${largura}] agora: «Aviso oficial» abre o aviso do operador`, (await ligacao.getAttribute('href')) === URL_AVISO && /Aviso oficial/.test(await ligacao.innerText()));
    const alt = await ligacao.evaluate((e) => Math.round(e.getBoundingClientRect().height));
    ok(`[${largura}] agora: a ligação do aviso tem 40 px de altura`, alt >= 40, `${alt}px`);
    const marcas = await textos(p, '[data-teste="greve-partida"]');
    ok(`[${largura}] agora: cada partida com a sua marca`, marcas.slice(0, 3).join('|') === 'Sem serviço (greve)|Pode não se realizar|Serviço reduzido', marcas.join('|'));
    const riscada = await p.$$eval('[data-teste="greve-partida"]', (els) => {
      const e = els.find((x) => x.getBoundingClientRect().width > 0 && /Sem serviço/.test(x.textContent || ''));
      const hora = e?.parentElement?.querySelector('span.font-condensada, span[class*="font-condensada"]') || e?.previousElementSibling?.querySelector?.('span') || e?.previousElementSibling;
      return hora ? getComputedStyle(hora).textDecorationLine : '';
    });
    ok(`[${largura}] agora: a hora da partida sem serviço aparece riscada`, /line-through/.test(riscada), riscada);
    await p.screenshot({ path: `${SAIDA}/greve-horario_${largura}_paragem.png` });

    // ---- amanhã às 22:00
    await p.locator('[data-teste="botao-hora"]:visible').click();
    await p.locator('[data-teste="dias-horario"]:visible button').nth(1).click();
    await p.locator('[data-teste="hora-escolhida"]:visible').fill('22:00');
    await p.waitForSelector('[data-teste="partida-hora"]:visible', { timeout: 15000 }).catch(() => {});
    if (await p.locator('[data-teste="seletor-hora"]:visible').count()) await p.locator('[data-teste="botao-hora"]:visible').click().catch(() => {});
    const avisoH = (await textos(p, '[data-teste="greve-horario"]'))[0] || '';
    const marcasH = await textos(p, '[data-teste="partida-hora"] [data-teste="greve-partida"]');
    ok(`[${largura}] amanhã 22:00: aviso e marcas nas partidas`, /Greve na Metro do Porto/.test(avisoH) && marcasH.slice(0, 3).join('|') === 'Sem serviço (greve)|Pode não se realizar|Serviço reduzido', `${avisoH.slice(0, 60)} | ${marcasH.join('|')}`);
    await p.screenshot({ path: `${SAIDA}/greve-horario_${largura}_amanha-22h.png` });
    await p.locator('[data-teste="voltar-agora"]:visible').click().catch(() => {});
    await p.waitForTimeout(600);

    // ---- percurso → horário do dia
    await p.locator('.painel-paragem [role="button"][aria-label^="Ver o percurso da linha"]:visible').first().click({ timeout: 15000 });
    await p.waitForSelector('[data-teste="percurso-linha"]:visible', { timeout: 15000 });
    await p.locator('[data-teste="horario-linha-paragem"]:visible').click();
    await p.waitForSelector('[data-teste="horario-dia"]:visible', { timeout: 15000 }).catch(() => {});
    const avisoD = (await textos(p, '[data-teste="horario-dia"] [data-teste="greve-horario"]'))[0] || '';
    ok(`[${largura}] horário do dia: aviso da véspera com a hora a que acaba o serviço`, /Véspera da greve na Metro do Porto/.test(avisoD) && /acaba por volta das 23:00/.test(avisoD), avisoD);
    const legenda = (await textos(p, '[data-teste="legenda-greve"]'))[0] || '';
    ok(`[${largura}] horário do dia: legenda (riscado = sem serviço, sublinhado = pode não se realizar)`, /sem serviço/.test(legenda) && /pode não se realizar/.test(legenda), legenda);
    const estilos = await p.$$eval('[data-teste="horario-dia"] [data-greve]', (els) => els.map((e) => `${e.getAttribute('data-greve')}:${getComputedStyle(e).textDecorationLine}:${getComputedStyle(e).textDecorationStyle}`));
    ok(`[${largura}] horário do dia: minutos sem serviço riscados e os incertos sublinhados a pontinhos`, estilos.length === 4
      && estilos.filter((x) => x.startsWith('sem-servico:line-through')).length === 2 && estilos.filter((x) => x.startsWith('incerta:underline:dotted')).length === 2, estilos.join(' '));
    const leitor = await p.$$eval('[data-teste="horario-dia"] [data-greve="sem-servico"] .sr-only', (els) => els.map((e) => e.textContent));
    ok(`[${largura}] horário do dia: leitor de ecrã ouve «sem serviço» em cada minuto riscado`, leitor.length === 2 && leitor.every((x) => /Sem serviço/.test(x || '')), JSON.stringify(leitor));
    const lateral = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(`[${largura}] sem scroll para o lado`, lateral <= 0, `${lateral}px`);
    // dia inteiro «pode não se realizar» (greve sem dizer o que funciona): fica o aviso, sem marcar cada minuto
    modo.diaTodoIncerto = true;
    await p.locator('[data-teste="horario-linha-dia"] [data-teste="dias-horario"] button').nth(1).click();
    await p.waitForSelector('[data-teste="horario-dia"]:visible', { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(500);
    const marcadas = await p.locator('[data-teste="horario-dia"] [data-greve]').count();
    const avisoTodo = (await textos(p, '[data-teste="horario-dia"] [data-teste="greve-horario"]'))[0] || '';
    ok(`[${largura}] horário do dia, dia todo incerto: aviso «algumas viagens podem não se realizar» e minutos sem marca`, marcadas === 0 && /Algumas viagens podem não se realizar/.test(avisoTodo) && (await p.locator('[data-teste="legenda-greve"]:visible').count()) === 0, `${marcadas} | ${avisoTodo}`);
    modo.diaTodoIncerto = false;
    await p.locator('[data-teste="horario-dia"]').first().scrollIntoViewIfNeeded().catch(() => {});
    await p.screenshot({ path: `${SAIDA}/greve-horario_${largura}_horario-dia.png` });
    ok(`[${largura}] sem erros na página`, erros.length === 0, erros.join(' | '));
  } catch (e) {
    ok(`[${largura}] o ecrã funcionou`, false, String(e).slice(0, 240));
    await p.screenshot({ path: `${SAIDA}/greve-horario_${largura}_erro.png` }).catch(() => {});
  }
  await ctx.close();
}

for (const tema of ['escuro', 'ambar']) {
  const { ctx, p, erros } = await abrir({ tema });
  try {
    await p.waitForTimeout(900);
    ok(`[${tema}] aviso e marcas à vista`, (await p.locator('[data-teste="greve-horario"]:visible').count()) === 1 && (await p.locator('[data-teste="greve-partida"]:visible').count()) >= 3);
    await p.screenshot({ path: `${SAIDA}/greve-horario_390_${tema}.png` });
    ok(`[${tema}] sem erros na página`, erros.length === 0, erros.join(' | '));
  } catch (e) {
    ok(`[${tema}] o ecrã funcionou`, false, String(e).slice(0, 200));
  }
  await ctx.close();
}

await browser.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo OK');
process.exit(falhas ? 1 : 0);
