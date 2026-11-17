// O travão à cópia automática está ligado na app a correr (server.main.ts), antes das páginas.
// Simula pedidos que chegam do Caddy (X-Forwarded-For) a uma página de paragem:
//  - o robô de 17/11/2026 (Chrome de computador, browser em chinês, navegação direta, sem cookie), um IP novo de cada vez:
//    os 4 primeiros chegam à página, o 5.º recebe 429 com a página curta;
//  - uma pessoa em português e o Googlebot, logo a seguir: chegam à página;
//  - um pedido local (sem X-Forwarded-For, como os testes): chega à página.
// Uso: BASE=http://127.0.0.1:3000 node travao-raspagem-servidor.mjs
const BASE = process.env.BASE || 'http://127.0.0.1:3000';
let falhas = 0;
const ok = (c, msg) => { console.log(`${c ? 'OK ' : 'FALHOU'} ${msg}`); if (!c) falhas++; };
const CHROME_PC = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36';
const GOOGLE = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1';
// Uma página de paragem que exista nos dados de teste (a 1.ª do mapa do site); senão, uma qualquer (404 também serve)
let pagina = '/paragens/stcp/bolhao';
try {
  const idx = await (await fetch(BASE + '/sitemap.xml')).text();
  const sub = [...idx.matchAll(/<loc>([^<]*paragens[^<]*)<\/loc>/g)].map((m) => m[1])[0];
  if (sub) {
    const xml = await (await fetch(BASE + new URL(sub).pathname)).text();
    const loc = /<loc>([^<]*\/paragens\/[^/<]+\/[^<]+)<\/loc>/.exec(xml)?.[1];
    if (loc) pagina = new URL(loc).pathname;
  }
} catch { /* fica a de reserva */ }
console.log('página usada:', pagina);
const pedir = (headers) => fetch(BASE + pagina, { headers, redirect: 'manual' }).then(async (r) => ({ status: r.status, corpo: await r.text(), h: r.headers }));
const robo = (i) => ({ 'User-Agent': CHROME_PC, 'Accept-Language': 'zh-CN,zh;q=0.9', 'Sec-Fetch-Site': 'none', 'Sec-Fetch-Mode': 'navigate', 'X-Forwarded-For': `81.200.${i}.7` });
const r = [];
for (let i = 1; i <= 5; i++) r.push(await pedir(robo(i)));
ok(r.slice(0, 4).every((x) => x.status !== 429), `robô: os 4 primeiros chegam à página (${r.slice(0, 4).map((x) => x.status).join(', ')})`);
ok(r[4].status === 429, `robô: o 5.º, de outro IP, recebe 429 (${r[4].status})`);
ok(/Demasiados pedidos/.test(r[4].corpo) && !/_e\.js|<script/i.test(r[4].corpo), 'a resposta 429 é a página curta, sem a app nem as estatísticas');
ok(/no-store/.test(r[4].h.get('cache-control') || '') && !!r[4].h.get('retry-after'), 'a resposta 429 não fica em cache e diz quando voltar');
const pessoa = await pedir({ 'User-Agent': IPHONE, 'Accept-Language': 'pt-PT,pt;q=0.9', 'Sec-Fetch-Site': 'none', 'X-Forwarded-For': '81.201.1.9' });
ok(pessoa.status !== 429, `uma pessoa em português, logo a seguir, chega à página (${pessoa.status})`);
const g = await pedir({ 'User-Agent': GOOGLE, 'Accept-Language': 'zh-CN', 'X-Forwarded-For': '66.249.66.1' });
ok(g.status !== 429, `o Googlebot chega à página (${g.status})`);
const local = await pedir({ 'User-Agent': CHROME_PC, 'Accept-Language': 'zh-CN', 'Sec-Fetch-Site': 'none' });
ok(local.status !== 429, `pedido local sem X-Forwarded-For chega à página (${local.status})`);
const inicio = await fetch(BASE + '/', { headers: robo(9) });
ok(inicio.status === 200, `a página inicial não é travada (${inicio.status})`);
console.log(falhas ? `${falhas} falha(s)` : 'travão: tudo OK');
process.exit(falhas ? 1 : 0);
