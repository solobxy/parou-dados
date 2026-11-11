// Testa, num browser simulado (Chromium, 390 px), o convite para os avisos de uma linha guardada:
//   - guardar uma linha da Carris Metropolitana com os avisos desligados: aparece «Avisar-te sobre a linha …?»;
//     «Avisar-me» liga os avisos e manda ao servidor a linha guardada;
//   - guardar uma linha de um operador sem avisos por linha: não aparece nada (não se promete o que não chega);
//   - com os avisos já ligados: uma confirmação, uma vez, e o servidor recebe a lista nova (e a lista sem a linha ao tirá-la);
//   - «agora não»: a seguir não volta a aparecer.
// As notificações e o serviço de push do browser são simulados (o Chromium de teste não tem push); as linhas são reais.
// Não é num telemóvel a sério.
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const SAIDA = process.env.SAIDA || 'res';
fs.mkdirSync(SAIDA, { recursive: true });
let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };

const procurar = async (q) => ((await (await fetch(`${BASE}/api/lines?q=${encodeURIComponent(q)}`)).json()).lines || []);
const unicas = (ls) => [...new Map(ls.map((l) => [l.id, l])).values()];
const cm = unicas([...(await procurar('1001')), ...(await procurar('Carris Metropolitana')), ...(await procurar('2001'))].filter((l) => String(l.id).startsWith('cm:')));
const outras = (await procurar('200')).concat(await procurar('Porto')).filter((l) => !/^cm:|^metro_lisboa:/.test(String(l.id)) && !/carris metropolitana|metro de lisboa/i.test(String(l.operator)));
ok('[preparar] há duas linhas reais diferentes da Carris Metropolitana e uma de outro operador', cm.length >= 2 && cm[0].id !== cm[1].id && outras.length >= 1, `${cm.slice(0, 2).map((l) => l.id)} ${outras[0]?.id}`);

const browser = await chromium.launch();
// Notificações e push simulados: a permissão começa em `perm`; o push devolve uma subscrição falsa
const simular = (perm) => `
  window.__perm = ${JSON.stringify(perm)};
  try { Object.defineProperty(Notification, 'permission', { get: () => window.__perm, configurable: true }); } catch (e) {}
  Notification.requestPermission = async () => { window.__perm = 'granted'; return 'granted'; };
  const sub = { endpoint: 'https://push.exemplo/teste', options: { applicationServerKey: null },
    toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'x', auth: 'y' } }; }, unsubscribe: async () => true };
  const reg = { pushManager: { getSubscription: async () => window.__sub || null,
      subscribe: async (o) => { sub.options.applicationServerKey = new Uint8Array(o.applicationServerKey).buffer; window.__sub = sub; return sub; } },
    showNotification: async () => {}, addEventListener() {}, update: async () => {} };
  const sw = { ready: Promise.resolve(reg), register: async () => reg, getRegistration: async () => reg, getRegistrations: async () => [reg],
    addEventListener() {}, removeEventListener() {}, controller: null };
  try { Object.defineProperty(navigator, 'serviceWorker', { value: sw, configurable: true }); } catch (e) {}
`;
async function abrir({ perm = 'default', local = {}, populares }) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'pt-PT', timezoneId: 'Europe/Lisbon', serviceWorkers: 'block',
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  });
  const extra = Object.entries(local).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(JSON.stringify(v))});`).join('');
  await ctx.addInitScript({ content: `try{ Object.defineProperty(Navigator.prototype,'webdriver',{get:()=>false,configurable:true}); localStorage.setItem('parou_aviso_instalar','1'); localStorage.setItem('parou_bemvindo','visto'); ${extra} }catch(e){}` });
  await ctx.addInitScript({ content: simular(perm) });
  const pedidos = [];
  await ctx.route('**/api/estatisticas/populares**', (rt) => rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ linhas: populares }) }));
  await ctx.route('**/api/push/chave', (rt) => rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ chave: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U' }) }));
  await ctx.route('**/api/push/subscrever', (rt) => { try { pedidos.push(JSON.parse(rt.request().postData() || '{}')); } catch {} rt.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(String(e)));
  await p.goto(`${BASE}/transportes`, { waitUntil: 'domcontentloaded' });
  await p.locator('[data-teste="mais-procuradas"]').waitFor({ timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(1500);
  return { ctx, p, pedidos, erros };
}
const estrela = (p, i) => p.locator('[data-teste="mais-procuradas"] .divide-y > *').nth(i).getByRole('button', { name: /Guardar nos favoritos|Remover dos favoritos/ });
const cartao = (p) => p.locator('[data-teste="convite-avisos-linha"]');
const codigo = String(cm[0]?.code || '');

// 1. Avisos desligados: guardar uma linha da CM → convite → «Avisar-me»
{
  const { ctx, p, pedidos, erros } = await abrir({ populares: [cm[0].id, outras[0].id] });
  await estrela(p, 0).click({ timeout: 8000 }).catch((e) => console.log('NOTA    estrela:', String(e).slice(0, 120)));
  await cartao(p).waitFor({ timeout: 6000 }).catch(() => {});
  const txt = (await cartao(p).innerText().catch(() => '')) || '';
  ok('[convite] aparece ao guardar a linha', txt.includes('Avisar-te sobre a linha'), txt.replace(/\s+/g, ' '));
  ok('[convite] diz qual é a linha', codigo && txt.includes(codigo), codigo);
  await p.screenshot({ path: `${SAIDA}/avisos-linha-convite.png` });
  await p.locator('[data-teste="convite-avisos-linha-ligar"]').click({ timeout: 5000 }).catch(() => {});
  await p.waitForTimeout(2500);
  const txt2 = (await cartao(p).innerText().catch(() => '')) || '';
  ok('[ligar] mostra «Avisos ligados»', txt2.includes('Avisos ligados'), txt2.replace(/\s+/g, ' '));
  const ultimo = pedidos[pedidos.length - 1] || {};
  ok('[ligar] o servidor recebe a linha guardada', (ultimo.linhas || []).some((l) => l.ln === codigo && /carris metropolitana|^cm$/i.test(l.op)), JSON.stringify(ultimo.linhas));
  ok('[ligar] em modo de alertas (não só lembretes)', ultimo.modo === 'alertas', String(ultimo.modo));
  const prefs = await p.evaluate(() => JSON.parse(localStorage.getItem('parou_notification_preferences_v1') || '{}'));
  ok('[ligar] fica ligado nas preferências', prefs.enabled === true);
  await p.screenshot({ path: `${SAIDA}/avisos-linha-ligado.png` });
  const larg = await p.evaluate(() => document.documentElement.scrollWidth);
  ok('[ecrã] sem scroll lateral a 390 px', larg <= 390, String(larg));
  ok('[ecrã] sem erros na página', erros.length === 0, erros.join(' | '));
  await ctx.close();
}

// 2. Operador sem avisos por linha: nada
{
  const { ctx, p } = await abrir({ populares: [outras[0].id, cm[0].id] });
  await estrela(p, 0).click({ timeout: 8000 }).catch(() => {});
  await p.waitForTimeout(2500);
  ok('[outro operador] não aparece convite', await cartao(p).count() === 0, outras[0].id);
  await ctx.close();
}

// 3. Avisos já ligados: confirmação uma vez e a lista nova chega ao servidor
// (depois da 1.ª estrela, «Mais procuradas» desaparece: a 2.ª linha guarda-se pela pesquisa e tiram-se as duas nos Favoritos)
const guardarPelaPesquisa = async (p, linha) => {
  await p.getByPlaceholder(/Pesquisar número de linha/).fill(String(linha.code));
  await p.waitForTimeout(3000);
  return p.evaluate(({ code, id }) => {
    for (const b of document.querySelectorAll('button[aria-label="Guardar nos favoritos"]')) {
      let el = b;
      for (let k = 0; k < 6 && el; k++) {
        el = el.parentElement;
        const t = (el && el.textContent) || '';
        if (t.includes(code) && /Carris Metropolitana/.test(t) && t.length < 400) { b.click(); return true; }
      }
    }
    return false;
  }, { code: String(linha.code), id: linha.id });
};
{
  const { ctx, p, pedidos } = await abrir({ perm: 'granted', populares: [cm[0].id, cm[1].id], local: { parou_notification_preferences_v1: { enabled: true, selectedDistrict: 'Todas', districts: ['Lisboa'], importantTransportOnly: true, severeOnly: false, soundEnabled: false, pushSubscribed: true } } });
  await p.waitForTimeout(6500); // a app sincroniza ao abrir
  const antes = pedidos.length;
  await estrela(p, 0).click({ timeout: 8000 }).catch(() => {});
  await cartao(p).waitFor({ timeout: 6000 }).catch(() => {});
  const txt = (await cartao(p).innerText().catch(() => '')) || '';
  ok('[ligados] confirma que a linha passa a ter avisos', txt.includes('Vais saber o que se passa na linha'), txt.replace(/\s+/g, ' '));
  await p.waitForTimeout(3000);
  const novo = pedidos.slice(antes).pop() || {};
  ok('[ligados] o servidor recebe a linha nova', (novo.linhas || []).some((l) => l.ln === codigo), JSON.stringify(novo.linhas));
  ok('[ligados] mantém os distritos', JSON.stringify(novo.distritos) === '["Lisboa"]', JSON.stringify(novo.distritos));
  await p.waitForTimeout(6500); // a confirmação sai sozinha
  const n0 = pedidos.length;
  const guardou = await guardarPelaPesquisa(p, cm[1]);
  await p.waitForTimeout(3000);
  ok('[ligados] guarda a 2.ª linha pela pesquisa', guardou, String(cm[1].code));
  ok('[ligados] a confirmação só aparece uma vez', await cartao(p).count() === 0);
  const dois = pedidos.slice(n0).pop() || {};
  ok('[ligados] o servidor fica com as duas linhas', ['' + cm[0].code, '' + cm[1].code].every((c) => (dois.linhas || []).some((l) => l.ln === c)), JSON.stringify(dois.linhas));
  await p.getByPlaceholder(/Pesquisar número de linha/).fill('');
  await p.waitForTimeout(2500);
  const n = pedidos.length;
  const tirar = p.getByRole('button', { name: 'Remover dos favoritos' });
  await tirar.first().click({ timeout: 8000 }).catch(() => {});
  await p.waitForTimeout(250);
  await tirar.first().click({ timeout: 8000 }).catch(() => {});
  await p.waitForTimeout(3500);
  const fim = pedidos.slice(n);
  ok('[ligados] tirar duas linhas seguidas: um só pedido, já sem linhas', fim.length === 1 && (fim[0].linhas || []).length === 0, `${fim.length} ${JSON.stringify(fim.map((x) => x.linhas))}`);
  await p.screenshot({ path: `${SAIDA}/avisos-linha-tirar.png` });
  await ctx.close();
}

// 4. «Agora não»: não volta a aparecer logo
{
  const { ctx, p } = await abrir({ populares: [cm[0].id, cm[1].id] });
  await estrela(p, 0).click({ timeout: 8000 }).catch(() => {});
  await cartao(p).waitFor({ timeout: 6000 }).catch(() => {});
  await p.locator('[data-teste="convite-avisos-linha-fechar"]').click({ timeout: 5000 }).catch(() => {});
  await p.waitForTimeout(800);
  const guardou = await guardarPelaPesquisa(p, cm[1]);
  await p.waitForTimeout(2500);
  ok('[agora não] ao guardar outra linha, não volta a aparecer', guardou && await cartao(p).count() === 0, String(guardou));
  await ctx.close();
}

await browser.close();
console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo OK');
process.exit(falhas ? 1 : 0);
