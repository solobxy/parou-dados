// Testa as páginas públicas que o Google vê (com o servidor a correr e a base real):
//  - páginas de linhas: título começa pelo número/nome e tem o operador; descrição com as horas dos dias úteis;
//  - páginas de operadores: linhas mais usadas, perguntas frequentes (com FAQPage válido) e cidades;
//  - JSON-LD sempre válido e páginas a responder 200 depressa.
// Uso: BASE=http://127.0.0.1:3000 node auditoria/seo-paginas.mjs
const BASE = process.env.BASE || 'http://127.0.0.1:3000';
let falhas = 0;
const ok = (n, c, e = '') => { if (!c) falhas++; console.log(c ? 'OK     ' : 'FALHOU ', n, e); };
const pedir = async (u) => { const a = performance.now(); const r = await fetch(BASE + u); const h = await r.text(); return { estado: r.status, h, ms: performance.now() - a }; };
const titulo = (h) => ((/<title>([^<]*)<\/title>/.exec(h) || [])[1] || '').replace(/&amp;/g, '&');
const descricao = (h) => ((/<meta name="description" content="([^"]*)"/.exec(h) || [])[1] || '').replace(/&amp;/g, '&');
const jsonld = (h) => [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => { try { return JSON.parse(m[1]); } catch { return 'INVÁLIDO'; } });

const sm = await (await fetch(`${BASE}/sitemap-linhas.xml`)).text();
const urls = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/^https?:\/\/[^/]+/, ''));
const linhas = urls.filter((u) => u.split('/').length === 4);
const escolher = (re) => linhas.find((u) => re.test(u));
const amostra = [escolher(/^\/linhas\/stcp\/\d/), escolher(/^\/linhas\/carris\/\d/), escolher(/^\/linhas\/cp\//), escolher(/^\/linhas\/metro-do-porto\//), escolher(/^\/linhas\/unir\//), escolher(/^\/linhas\/carris-metropolitana\//), escolher(/^\/linhas\/tub-braga\//)].filter(Boolean);
ok('[preparar] há linhas de vários operadores', amostra.length >= 5, amostra.length);
for (const u of amostra) {
  const r = await pedir(u);
  const t = titulo(r.h), d = descricao(r.h);
  console.log('       ', u, '\n         título:', t, `(${t.length})`, '\n         descrição:', d.slice(0, 170));
  ok(`[linha ${u.split('/')[2]}] 200`, r.estado === 200, r.estado);
  ok(`[linha ${u.split('/')[2]}] título diz "horário" e não passa de 72`, /horário/.test(t) && t.length <= 72, t);
  ok(`[linha ${u.split('/')[2]}] título não começa por "Linha <número>" (o número vem primeiro)`, !/^Linha \d/.test(t), t);
  ok(`[linha ${u.split('/')[2]}] JSON-LD válido`, jsonld(r.h).every((x) => x !== 'INVÁLIDO'));
  if (!/\/unir\//.test(u)) ok(`[linha ${u.split('/')[2]}] descrição com horas dos dias úteis (ou sem horário)`, /^Dias úteis: 1\.º \S+ às \d\d:\d\d, último às \d\d:\d\d/.test(d) || /^Horário da /.test(d), d.slice(0, 80));
}
for (const op of ['stcp', 'carris-metropolitana', 'cp', 'fertagus', 'metro-de-lisboa']) {
  const r = await pedir(`/linhas/${op}`);
  if (r.estado === 404) { console.log('NOTA    sem', op); continue; }
  const lds = jsonld(r.h);
  const faq = lds.find((x) => x && x['@type'] === 'FAQPage');
  ok(`[operador ${op}] 200 em < 1,5 s`, r.estado === 200 && r.ms < 1500, `${r.estado} ${r.ms.toFixed(0)} ms`);
  ok(`[operador ${op}] JSON-LD válido`, lds.every((x) => x !== 'INVÁLIDO'));
  ok(`[operador ${op}] perguntas frequentes visíveis e no FAQPage`, /Perguntas frequentes/.test(r.h) && faq && faq.mainEntity.length >= 3 && faq.mainEntity.every((q) => q.name && q.acceptedAnswer && q.acceptedAnswer.text), faq ? faq.mainEntity.map((q) => q.name).join(' | ') : 'sem FAQPage');
  ok(`[operador ${op}] respostas sem "undefined"/"null"`, !/undefined|null/.test(JSON.stringify(faq || {})));
  if (['stcp', 'carris-metropolitana', 'cp'].includes(op)) ok(`[operador ${op}] secção "mais usadas"`, /mais usadas<\/h2>/.test(r.h));
  ok(`[operador ${op}] liga a cidades`, /href="\/cidade\//.test(r.h));
}
const stcp = await pedir('/linhas/stcp');
ok('[stcp] título com "tempo real"', /Horários STCP e tempo real/.test(titulo(stcp.h)), titulo(stcp.h));
ok('[stcp] pergunta sobre greve liga à página de greves', /href="\/greves\/stcp"/.test(stcp.h));
console.log(falhas ? `${falhas} FALHOU` : 'tudo OK');
process.exit(falhas ? 1 : 0);
