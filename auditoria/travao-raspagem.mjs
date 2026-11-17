// Testa o travão à cópia automática das páginas (src/server/travaoRaspagem.ts).
// Caso real (17/11/2026): um robô abriu ~1500 páginas de paragens num dia, cada uma de um IP diferente, em Chrome de
// computador com o browser em chinês, por navegação direta, sem cookies e sem vir de outro site.
// Confirma que: o robô é travado (4 por hora no total), pessoas e robôs declarados (Google, Exa…) não são,
// o limite por IP (30/min, 300/h) só conta páginas de paragens e linhas, e a memória fica limitada.
// Uso: APP=<pasta da app> node --import tsx auditoria/travao-raspagem.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.PAROU_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'travao-'));
const APP = process.env.APP || '../parou';
let falhas = 0;
const ok = (n, c, e = '') => { if (!c) falhas++; console.log(c ? 'OK     ' : 'FALHOU ', n, e); };
const t = await import(path.resolve(APP, 'src/server/travaoRaspagem.ts'));

const CHROME_PC = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1';
const GOOGLE = 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const EXA = 'Mozilla/5.0 (compatible; ExaSearchBot/1.0; +https://crawler.exa.ai/)';
let n = 0;
const ipNovo = () => { n++; return `81.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`; };
const robo = (extra = {}) => ({ metodo: 'GET', caminho: `/paragens/unir/paragem-${n}`, ua: CHROME_PC, idioma: 'zh-CN,zh;q=0.9', cookie: '', referer: '', secFetchSite: 'none', ip: ipNovo(), ...extra });
const T0 = Date.UTC(2026, 10, 17, 16, 0, 0);

// 1. A pegada do robô: 4 por hora no total, mesmo com um IP novo em cada pedido
t._teste.reiniciar();
const r1 = []; for (let i = 0; i < 20; i++) r1.push(t.avaliarPedido(robo(), T0 + i * 1000));
ok('robô: os 4 primeiros passam', r1.slice(0, 4).every((x) => x === null), JSON.stringify(r1.slice(0, 5)));
ok('robô: do 5.º em diante é travado (pegada)', r1.slice(4).every((x) => x === 'pegada'), JSON.stringify(r1.slice(4, 8)));
ok('robô: passada uma hora, voltam a passar 4', t.avaliarPedido(robo(), T0 + 3600_000 + 5000) === null);
ok('robô em /en/ também conta', (() => { t._teste.reiniciar(); for (let i = 0; i < 4; i++) t.avaliarPedido(robo(), T0); return t.avaliarPedido(robo({ caminho: '/en/paragens/stcp/bolhao' }), T0) === 'pegada'; })());
ok('robô em linhas também conta', (() => { t._teste.reiniciar(); for (let i = 0; i < 4; i++) t.avaliarPedido(robo(), T0); return t.avaliarPedido(robo({ caminho: '/linhas/stcp/205-campanha' }), T0) === 'pegada'; })());
ok('maiúsculas no endereço não escapam', (() => { t._teste.reiniciar(); for (let i = 0; i < 4; i++) t.avaliarPedido(robo(), T0); return t.avaliarPedido(robo({ caminho: '/Paragens/UNIR/X' }), T0) === 'pegada'; })());
ok('HEAD conta como GET', (() => { t._teste.reiniciar(); for (let i = 0; i < 4; i++) t.avaliarPedido(robo(), T0); return t.avaliarPedido(robo({ metodo: 'HEAD' }), T0) === 'pegada'; })());
ok('zh-TW também é a pegada', t.ePegada({ idioma: 'zh-TW,zh;q=0.9', cookie: '', referer: '', secFetchSite: 'none' }));
ok('sem Sec-Fetch-Site (ferramenta) com zh também é a pegada', t.ePegada({ idioma: 'zh-CN', cookie: '', referer: '', secFetchSite: '' }));

// 2. O que NÃO é a pegada
ok('chinês como 2.ª língua não é a pegada', !t.ePegada({ idioma: 'pt-PT,zh;q=0.5', cookie: '', referer: '', secFetchSite: 'none' }));
ok('com cookie da PAROU (já cá esteve) não é a pegada', !t.ePegada({ idioma: 'zh-CN', cookie: 'parou_v=abc', referer: '', secFetchSite: 'none' }));
ok('vindo do Google (referer) não é a pegada', !t.ePegada({ idioma: 'zh-CN', cookie: '', referer: 'https://www.google.com/', secFetchSite: 'cross-site' }));
ok('vindo de outro site sem referer (cross-site) não é a pegada', !t.ePegada({ idioma: 'zh-CN', cookie: '', referer: '', secFetchSite: 'cross-site' }));
ok('português não é a pegada', !t.ePegada({ idioma: 'pt-PT,pt;q=0.9', cookie: '', referer: '', secFetchSite: 'none' }));
t._teste.reiniciar();
const r2 = []; for (let i = 0; i < 50; i++) r2.push(t.avaliarPedido(robo({ cookie: 'parou_v=1' }), T0 + i));
ok('50 visitas em chinês com cookie: nenhuma travada', r2.every((x) => x === null));

// 3. Robôs declarados e pedidos da própria máquina nunca são travados
t._teste.reiniciar();
const ip1 = ipNovo();
const g = []; for (let i = 0; i < 400; i++) g.push(t.avaliarPedido(robo({ ua: GOOGLE, ip: ip1 }), T0 + i * 100));
ok('Googlebot: 400 páginas em 40 s do mesmo IP, nenhuma travada', g.every((x) => x === null));
const e = []; for (let i = 0; i < 100; i++) e.push(t.avaliarPedido(robo({ ua: EXA }), T0 + i));
ok('ExaSearchBot: nenhuma travada', e.every((x) => x === null));
const l = []; for (let i = 0; i < 100; i++) l.push(t.avaliarPedido(robo({ ip: '127.0.0.1' }), T0 + i));
ok('pedidos da própria máquina (testes): nenhum travado', l.every((x) => x === null));

// 4. Limite por IP: só páginas de paragens e linhas
t._teste.reiniciar();
const pessoa = (ip, i, caminho) => ({ metodo: 'GET', caminho: caminho || `/paragens/stcp/p-${i}`, ua: IPHONE, idioma: 'pt-PT', cookie: 'x=1', referer: 'https://parou.pt/', secFetchSite: 'same-origin', ip });
const ipA = ipNovo(), ipB = ipNovo();
const a = []; for (let i = 0; i < 31; i++) a.push(t.avaliarPedido(pessoa(ipA, i), T0 + i * 500));
ok('30 páginas num minuto do mesmo IP passam', a.slice(0, 30).every((x) => x === null));
ok('a 31.ª no mesmo minuto é travada (ip-minuto)', a[30] === 'ip-minuto', a[30]);
ok('outro IP no mesmo minuto não é afetado', t.avaliarPedido(pessoa(ipB, 1), T0 + 20_000) === null);
ok('o mesmo IP volta a passar no minuto seguinte', t.avaliarPedido(pessoa(ipA, 99), T0 + 61_000) === null);
t._teste.reiniciar();
const ipC = ipNovo();
const h = []; for (let i = 0; i < 301; i++) h.push(t.avaliarPedido(pessoa(ipC, i), T0 + i * 11_000));
ok('300 páginas numa hora (1 a cada 11 s) passam', h.slice(0, 300).every((x) => x === null), String(h.findIndex((x) => x !== null)));
ok('a 301.ª na mesma hora é travada (ip-hora)', h[300] === 'ip-hora', h[300]);
t._teste.reiniciar();
const ipD = ipNovo();
const outras = []; for (let i = 0; i < 200; i++) for (const c of ['/', '/api/transit/nearby', '/linhas/stcp', '/assets/app.js', '/mapa']) outras.push(t.avaliarPedido(pessoa(ipD, i, c), T0 + i));
ok('início, API, ficheiros, listas de operador e mapa nunca são travados', outras.every((x) => x === null));
ok('pedidos POST não contam', t.avaliarPedido({ ...robo(), metodo: 'POST' }, T0) === null);

// 5. Memória limitada: 200 mil IPs diferentes não fazem crescer os contadores sem fim
t._teste.reiniciar();
for (let i = 0; i < 200_000; i++) t.avaliarPedido(pessoa(`10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`, i), T0 + i);
const tam = t._teste.tamanhos();
ok('contadores por IP com limite de entradas', tam.ipMinuto <= t.MAX_IPS && tam.ipHora <= t.MAX_IPS, JSON.stringify(tam));

// 6. A resposta do servidor: 429, sem cache, sem indexação, página curta; quem passa segue para a app
t._teste.reiniciar();
const mid = t.criarTravao(() => T0);
function pedir(headers, caminho = '/paragens/unir/teobalde') {
  const req = { method: 'GET', path: caminho, originalUrl: caminho, headers, socket: { remoteAddress: '127.0.0.1' } };
  const res = { statusCode: 200, h: {}, corpo: null, setHeader(k, v) { this.h[k.toLowerCase()] = String(v); }, end(b) { this.corpo = String(b || ''); } };
  let seguiu = false;
  mid(req, res, () => { seguiu = true; });
  return { res, seguiu };
}
const cab = (ip) => ({ 'user-agent': CHROME_PC, 'accept-language': 'zh-CN,zh;q=0.9', 'sec-fetch-site': 'none', 'x-forwarded-for': ip });
const respostas = []; for (let i = 0; i < 5; i++) respostas.push(pedir(cab(ipNovo())));
ok('middleware: os 4 primeiros seguem para a app', respostas.slice(0, 4).every((x) => x.seguiu && x.res.corpo === null));
const ult = respostas[4];
ok('middleware: o 5.º recebe 429 e não segue', !ult.seguiu && ult.res.statusCode === 429, String(ult.res.statusCode));
ok('middleware: Retry-After, no-store e noindex', !!ult.res.h['retry-after'] && /no-store/.test(ult.res.h['cache-control'] || '') && /noindex/.test(ult.res.h['x-robots-tag'] || ''), JSON.stringify(ult.res.h));
ok('middleware: página curta em HTML sem scripts', /text\/html/.test(ult.res.h['content-type'] || '') && /Demasiados pedidos/.test(ult.res.corpo || '') && !/<script/i.test(ult.res.corpo || '') && (ult.res.corpo || '').length < 2000);
const pessoaPt = pedir({ 'user-agent': IPHONE, 'accept-language': 'pt-PT', 'sec-fetch-site': 'none', 'x-forwarded-for': ipNovo() });
ok('middleware: uma pessoa em português segue para a app na mesma hora', pessoaPt.seguiu && pessoaPt.res.statusCode === 200);
const semXff = pedir({ 'user-agent': CHROME_PC, 'accept-language': 'zh-CN', 'sec-fetch-site': 'none' });
ok('middleware: pedido local sem X-Forwarded-For segue sempre', semXff.seguiu);

console.log(falhas ? `${falhas} FALHOU` : 'tudo OK');
process.exit(falhas ? 1 : 0);
