// Testa a resposta direta no topo das páginas públicas (o que o Google e as IAs citam) e que as paragens
// sem nenhuma linha não se indexam (o Google tratava-as como «soft 404» a 25/10/2026).
//  - linhas: <p class="sub resposta"> logo a seguir ao H1, 20 a 75 palavras, com percurso/paragens e a data do horário;
//    se diz «Hoje», traz duas horas (primeira e última);
//  - paragens: resposta com as linhas que lá passam; sem linhas → noindex;
//  - versão inglesa: resposta em inglês.
// Uso: BASE=http://127.0.0.1:3000 node auditoria/seo-respostas.mjs
const BASE = process.env.BASE || 'http://127.0.0.1:3000';
let falhas = 0;
const ok = (n, c, e = '') => { if (!c) falhas++; console.log(c ? 'OK     ' : 'FALHOU ', n, e); };
const pedir = async (u) => { const r = await fetch(BASE + u); return { estado: r.status, h: await r.text() }; };
const resposta = (h) => { const m = /<\/h1>\s*<p class="sub resposta">([\s\S]*?)<\/p>/.exec(h); return m ? m[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").trim() : null; };
const palavras = (t) => t.split(/\s+/).filter(Boolean).length;
const robots = (h) => (/<meta name="robots" content="([^"]*)"/.exec(h) || [])[1] || '';

const sm = await (await fetch(`${BASE}/sitemap-linhas.xml`)).text();
const linhas = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/^https?:\/\/[^/]+/, '')).filter((u) => u.split('/').length === 4 && u.startsWith('/linhas/'));
const escolher = (re) => linhas.find((u) => re.test(u));
const amostra = [escolher(/^\/linhas\/stcp\/\d/), escolher(/^\/linhas\/carris\/\d/), escolher(/^\/linhas\/cp\//), escolher(/^\/linhas\/metro-do-porto\//), escolher(/^\/linhas\/unir\//), escolher(/^\/linhas\/carris-metropolitana\//), escolher(/^\/linhas\/tub-braga\//)].filter(Boolean);
ok('[preparar] linhas de vários operadores', amostra.length >= 5, amostra.length);
for (const u of amostra) {
  const op = u.split('/')[2];
  const r = await pedir(u);
  const t = resposta(r.h);
  console.log('       ', u, '\n         resposta:', t, t ? `(${palavras(t)} palavras)` : '');
  ok(`[linha ${op}] tem resposta direta logo a seguir ao H1`, !!t);
  if (!t) continue;
  ok(`[linha ${op}] 20 a 75 palavras`, palavras(t) >= 20 && palavras(t) <= 75, palavras(t));
  ok(`[linha ${op}] diz o percurso ou as paragens`, /faz o percurso|paragens/.test(t), t.slice(0, 60));
  ok(`[linha ${op}] diz a data do horário`, /atualizado a \d{1,2} de \S+ de 20\d\d/.test(t), t.slice(-60));
  if (/^.*Hoje, /.test(t) && !/Hoje não há/.test(t)) ok(`[linha ${op}] «Hoje» com primeira e última hora`, (t.match(/\b\d\d:\d\d\b/g) || []).length >= 2, t);
  ok(`[linha ${op}] sem «undefined», «null» ou «NaN»`, !/undefined|null|NaN/.test(t), t);
}
// Variantes da mesma linha: uma por par de pontas no sitemap; percursos de eventos fora; todas continuam no ar
const sintra = linhas.filter((u) => /^\/linhas\/cp\/linha-de-sintra-/.test(u));
ok('[variantes] Linha de Sintra: no máximo 3 páginas no sitemap (antes 6, uma por sentido)', sintra.length >= 1 && sintra.length <= 3, sintra.join(' '));
ok('[variantes] nenhum percurso de evento (Ironman, Maratona) no sitemap', !linhas.some((u) => /ironman|maratona/.test(u)), linhas.filter((u) => /ironman|maratona/.test(u)).slice(0, 3).join(' '));
for (const u of ['/linhas/cp/linha-de-sintra-lisboa-rossio-sintra', '/linhas/cp/linha-de-sintra-sintra-lisboa-rossio', '/linhas/mobicascais/14-cascais-murches-chesol-cascais-ironman']) {
  const r = await pedir(u);
  if (/ironman/.test(u) && r.estado === 404) { console.log('NOTA    percurso Ironman já não existe nos dados de hoje:', u); continue; }
  ok(`[variantes] ${u} continua no ar (200 ou 301 para a variante atual)`, r.estado === 200, r.estado);
  if (/ironman/.test(u) && r.estado === 200) ok('[variantes] percurso de evento com noindex', /noindex/.test(robots(r.h)), robots(r.h));
}
// Versão inglesa
const en = amostra.find((u) => !/\/unir\//.test(u));
if (en) {
  const r = await pedir(`/en${en}`);
  const t = resposta(r.h);
  console.log('        /en' + en, '\n         resposta:', t);
  ok('[en] resposta em inglês', !!t && /\b(Line|runs|stops|Official timetable)\b/.test(t) && !/paragens|Horário oficial/.test(t), t);
  ok('[en] sem «Line Line»', !!t && !/Line Line/.test(t), t);
}
// Paragens
const sp = await (await fetch(`${BASE}/sitemap-paragens-1.xml`)).text();
const paragens = [...sp.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/^https?:\/\/[^/]+/, '')).filter((u) => !/carris-metropolitana/.test(u));
const porOp = new Map();
for (const u of paragens) { const op = u.split('/')[2]; if (!porOp.has(op)) porOp.set(op, []); porOp.get(op).push(u); }
const ap = [];
for (const lista of porOp.values()) ap.push(lista[Math.floor(lista.length / 3)]);
ok('[preparar] paragens de vários operadores', ap.length >= 5, ap.length);
let semLinhas = 0;
for (const u of ap.slice(0, 14)) {
  const r = await pedir(u);
  const t = resposta(r.h);
  const op = u.split('/')[2];
  ok(`[paragem ${op}] tem resposta direta`, !!t, u);
  if (!t) continue;
  console.log('       ', u, '\n         resposta:', t);
  ok(`[paragem ${op}] diz as linhas`, /passa(m)? |não passa hoje nenhuma linha/.test(t), t.slice(0, 80));
  ok(`[paragem ${op}] sem «undefined», «null» ou «NaN»`, !/undefined|null|NaN/.test(t), t);
  ok(`[paragem ${op}] sem parênteses seguidos «) (»`, !/\) \(/.test(t), t);

  if (/não passa hoje nenhuma linha/.test(t)) { semLinhas++; ok(`[paragem ${op}] sem linhas → noindex`, /noindex/.test(robots(r.h)), robots(r.h)); }
  else ok(`[paragem ${op}] com linhas → index`, /^index/.test(robots(r.h)), robots(r.h));
}
console.log(`        (${semLinhas} paragens sem linhas na amostra)`);
console.log(falhas ? `${falhas} FALHOU` : 'tudo OK');
process.exit(falhas ? 1 : 0);
