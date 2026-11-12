// Testa a contagem diária dos robôs de pesquisa e de IA (src/server/robos.ts): reconhece os robôs pelo
// user-agent, separa o tipo de página, conta erros e lentos, grava e volta a ler o ficheiro.
// Uso: APP=<pasta da app> node --import tsx auditoria/robos.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const APP = process.env.APP || '../parou';
let falhas = 0;
const ok = (n, c, e = '') => { if (!c) falhas++; console.log(c ? 'OK     ' : 'FALHOU ', n, e); };
const r = await import(path.resolve(APP, 'src/server/robos.ts'));
const UA = {
  google: 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  bing: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/116.0 Safari/537.36',
  oai: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.3; +https://openai.com/searchbot',
  chatgpt: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot',
  perplexity: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
  pessoa: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
};
ok('Googlebot', r.qualRobo(UA.google) === 'Googlebot', r.qualRobo(UA.google));
ok('Bingbot', r.qualRobo(UA.bing) === 'Bingbot', r.qualRobo(UA.bing));
ok('OAI-SearchBot', r.qualRobo(UA.oai) === 'OAI-SearchBot', r.qualRobo(UA.oai));
ok('ChatGPT-User', r.qualRobo(UA.chatgpt) === 'ChatGPT-User', r.qualRobo(UA.chatgpt));
ok('PerplexityBot', r.qualRobo(UA.perplexity) === 'PerplexityBot', r.qualRobo(UA.perplexity));
ok('pessoa num iPhone não é robô', r.qualRobo(UA.pessoa) === null);
ok('sem user-agent não é robô', r.qualRobo(undefined) === null);
ok('tipo linha', r.tipoDeCaminho('/linhas/stcp/205-campanha-castelo-do-queijo') === 'linha');
ok('tipo linha em inglês', r.tipoDeCaminho('/en/linhas/stcp/205-campanha') === 'linha');
ok('tipo paragem', r.tipoDeCaminho('/paragens/cp/campanha') === 'paragem');
ok('tipo operador', r.tipoDeCaminho('/linhas/stcp') === 'operador');
ok('tipo sitemap', r.tipoDeCaminho('/sitemap-paragens-1.xml') === 'sitemap' && r.tipoDeCaminho('/robots.txt') === 'sitemap');
ok('tipo api', r.tipoDeCaminho('/api/transit/x') === 'api');
const quando = new Date('2026-11-12T10:00:00Z');
r.registarPedidoRobo('Googlebot', '/linhas/stcp/205-x', 200, 120, quando);
r.registarPedidoRobo('Googlebot', '/paragens/stcp/bolhao', 503, 2500, quando);
r.registarPedidoRobo('OAI-SearchBot', '/linhas/cp/linha-de-sintra', 200, 80, quando);
const d = r.resumoRobos()['2026-11-12'];
ok('conta pedidos do Google', d?.Googlebot?.n === 2, JSON.stringify(d?.Googlebot));
ok('conta os 503', d?.Googlebot?.estados?.['503'] === 1);
ok('conta os lentos (> 2 s)', d?.Googlebot?.lentos === 1);
ok('separa por tipo de página', d?.Googlebot?.tipos?.linha === 1 && d?.Googlebot?.tipos?.paragem === 1);
const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'robos-')), 'robos.json');
r.gravarRobos(f);
ok('grava o ficheiro', fs.existsSync(f));
r.carregarRobos(f);
ok('volta a ler o que gravou', r.resumoRobos()['2026-11-12']?.['OAI-SearchBot']?.n === 1);
// Guarda só os últimos 40 dias
for (let i = 0; i < 45; i++) r.registarPedidoRobo('Bingbot', '/', 200, 10, new Date(Date.UTC(2026, 8, 1 + i, 12)));
r.gravarRobos(f);
ok('guarda no máximo 40 dias', Object.keys(JSON.parse(fs.readFileSync(f, 'utf8'))).length <= 40, Object.keys(JSON.parse(fs.readFileSync(f, 'utf8'))).length);
console.log(falhas ? `${falhas} FALHOU` : 'tudo OK');
process.exit(falhas ? 1 : 0);
