// Testa as descrições (meta description) das páginas, com o servidor a correr e a base real (pedido no Reddit,
// 24/11/2026: /greves acabava em «com datas,…» e /linhas em «24 operadores.…»). Têm de estar inteiras: até ~155
// caracteres, sem reticências, em português, inglês, alemão e francês. Vê também as páginas da app.
// Uso: BASE=http://127.0.0.1:3000 node auditoria/meta-descricoes.mjs
const BASE = process.env.BASE || 'http://127.0.0.1:3000';
let falhas = 0;
const ok = (n, c, e = '') => { if (!c) falhas++; console.log(c ? 'OK     ' : 'FALHOU ', n, e); };
const obter = async (u) => { const r = await fetch(BASE + u, { headers: { 'x-forwarded-for': '198.51.100.203' } }); return { s: r.status, h: await r.text() }; };
const desc = (h) => ((/<meta name="description" content="([^"]*)"/.exec(h) || [])[1] || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

const sm = await (await fetch(`${BASE}/sitemap-linhas.xml`)).text().catch(() => '');
const urls = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/^https?:\/\/[^/]+/, ''));
const linhas = urls.filter((u) => u.split('/').length === 4);
const amostraLinhas = ['stcp', 'carris', 'cp', 'metro-do-porto', 'carris-metropolitana', 'transtejo-soflusa', 'tub-braga']
  .map((op) => linhas.find((u) => u.startsWith(`/linhas/${op}/`))).filter(Boolean);
const paginas = ['/', '/linhas', '/greves', '/greves/cp', '/greves/metro-de-lisboa', '/cidades', '/cidade/lisboa', '/cidade/porto', '/incendios',
  '/linhas/cp', '/linhas/carris-metropolitana', '/linhas/transtejo-soflusa', '/paragens/stcp', ...amostraLinhas];
const app = ['/perto', '/transportes', '/alertas', '/sobre', '/comunidade', '/mapa', '/privacidade', '/termos', '/contactar'];
let vistas = 0;
for (const u of paginas) {
  for (const pre of ['', '/en', '/de', '/fr']) {
    const caminho = pre ? (u === '/' ? pre : `${pre}${u}`) : u;
    const r = await obter(caminho);
    if (r.s !== 200) { ok(`[${caminho}] responde 200`, false, String(r.s)); continue; }
    const d = desc(r.h);
    vistas++;
    ok(`[${caminho}] descrição inteira (${d.length}), sem reticências`, d.length >= 50 && d.length <= 160 && !/…|\.\.\.$/.test(d), d);
    // Linhas noutras línguas: a frase acaba nas paragens (não cortada a meio, tipo «…, weekday.»)
    if (/^\/linhas\/[^/]+\/[^/]+$/.test(u) && pre) ok(`[${caminho}] descrição da linha acaba nas paragens`, /(stops|Haltestellen|arrêts)\.( |$)/.test(d), d);
  }
}
for (const u of app) {
  const r = await obter(u);
  const d = desc(r.h);
  ok(`[app ${u}] descrição inteira (${d.length}), sem reticências`, r.s === 200 && d.length >= 30 && d.length <= 160 && !/…|\.\.\.$/.test(d), d);
}
ok('[preparar] viu páginas suficientes', vistas >= 60, String(vistas));
console.log(falhas ? `${falhas} testes falharam` : 'Todos os testes passaram');
process.exit(falhas ? 1 : 0);
