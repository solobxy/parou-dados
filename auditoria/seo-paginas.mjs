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
  ok(`[linha ${u.split('/')[2]}] título sem percurso vazio (" -:" ou "()")`, !/ -:|\(\s*-?\s*\)/.test(t + d), t);
  ok(`[linha ${u.split('/')[2]}] JSON-LD válido`, jsonld(r.h).every((x) => x !== 'INVÁLIDO'));
  if (!/\/unir\//.test(u)) ok(`[linha ${u.split('/')[2]}] descrição com horas dos dias úteis (ou sem horário)`, /^Dias úteis: 1\.º \S+ às \d\d:\d\d, último às \d\d:\d\d/.test(d) || /^Horário da /.test(d), d.slice(0, 80));
}
// Página inicial: «parou» é também um verbo («o site parou»), por isso o título diz que é uma app de transportes
// e o WebSite tem os outros nomes por que as pessoas procuram a marca (PAROU app, PAROU transportes).
{
  const r = await pedir('/');
  const t = titulo(r.h);
  const site = jsonld(r.h).flatMap((x) => (x && x['@graph']) || [x]).find((x) => x && x['@type'] === 'WebSite');
  const alt = [].concat((site && site.alternateName) || []);
  ok('[início] título começa por PAROU e diz que é uma app de transportes', /^PAROU\b/.test(t) && /\bapp\b/i.test(t) && /autocarros/i.test(t) && t.length <= 65, `${t} (${t.length})`);
  ok('[início] WebSite com os nomes alternativos da marca', ['PAROU app', 'PAROU Transportes', 'parou.pt'].every((n) => alt.some((a) => a.toLowerCase() === n.toLowerCase())), alt.join(' | '));
}
// Carris Metropolitana: a API (padrões) às vezes não tem a versão em vigor (ex.: 4562 só tinha agosto e 2027),
// e a página dizia «sem serviço» em todos os dias. As linhas mais procuradas têm de mostrar o horário.
for (const cod of ['4562', '4725', '1001']) {
  const u = linhas.find((x) => x.startsWith(`/linhas/carris-metropolitana/${cod}-`));
  if (!u) { console.log('NOTA    sem a linha CM', cod); continue; }
  const r = await pedir(u);
  const d = descricao(r.h);
  const uteis = (/<summary>Dias úteis<span class="nota"[^>]*>([^<]*)/.exec(r.h) || [])[1] || '';
  console.log('       ', u, '\n         dias úteis:', uteis, '\n         descrição:', d.slice(0, 120));
  ok(`[CM ${cod}] dias úteis com partidas (não «sem serviço»)`, r.estado === 200 && /\d+ partidas/.test(uteis), uteis || r.estado);
  ok(`[CM ${cod}] descrição começa pelas horas dos dias úteis`, /^Dias úteis: (1\.º autocarro às \d\d:\d\d|uma partida)/.test(d), d.slice(0, 80));
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
// Toques mortos (estatísticas de 30 dias até 13/11/2026): nas páginas das linhas tocava-se na linha da paragem
// fora do nome (li do percurso) e nas páginas das paragens tocava-se nas partidas, que não levavam a lado nenhum.
// Cada paragem do percurso é uma ligação na linha toda e cada partida abre a paragem na app, em tempo real.
{
  const uLinha = amostra.find((u) => /\/stcp\//.test(u)) || amostra[0];
  const r = await pedir(uLinha);
  const lis = [...r.h.matchAll(/<ol class="percurso">([\s\S]*?)<\/ol>/g)].flatMap((m) => m[1].split('<li>').slice(1));
  const comLigacao = lis.filter((x) => x.startsWith('<a '));
  ok('[toques] percurso com paragens ligadas', comLigacao.length > 3, `${comLigacao.length}/${lis.length}`);
  ok('[toques] a ligação da paragem abrange a linha toda (os minutos ficam dentro da ligação)', comLigacao.every((x) => !/<\/a><small>/.test(x)), comLigacao.find((x) => /<\/a><small>/.test(x)) || '');
  ok('[toques] a ligação do percurso ocupa a largura toda (display:block)', /ol\.percurso a\{[^}]*display:block/.test(r.h));
  const uPar = (/href="(\/paragens\/stcp\/[^"]+)"/.exec(r.h) || [])[1];
  ok('[toques] há uma página de paragem para testar', !!uPar, uLinha);
  if (uPar) {
    const rp = await pedir(uPar);
    const bloco = (/<ul class="lista partidas">([\s\S]*?)<\/ul>/.exec(rp.h) || [])[1];
    if (!bloco) console.log('NOTA    sem próximas partidas agora em', uPar);
    else {
      const linhasP = bloco.split('<li>').slice(1);
      ok('[toques] cada partida da paragem é uma ligação para a app nessa paragem', linhasP.length > 0 && linhasP.every((x) => /^<a class="linha" href="\/\?local=-?\d+\.\d+,-?\d+\.\d+&amp;nome=[^"]*&amp;paragem=[^"]+"/.test(x)), linhasP[0]?.slice(0, 140));
      ok('[toques] sem ligações dentro de ligações nas partidas', linhasP.every((x) => (x.match(/<a /g) || []).length === 1));
    }
  }
  const uUnir = amostra.find((u) => /\/unir\//.test(u));
  if (uUnir) {
    const ru = await pedir(uUnir);
    const uParU = (/href="(\/paragens\/unir\/[^"]+)"/.exec(ru.h) || [])[1];
    if (uParU) {
      const rpu = await pedir(uParU);
      ok('[toques] UNIR: a lista de partidas sabe o endereço da paragem na app', /data-unir="proximas"[^>]*data-app="\/\?local=/.test(rpu.h), uParU);
      ok('[toques] UNIR: cada partida é uma ligação (sem ligação dentro da ligação)', /<a class="linha" href="'\+esc\(el\.dataset\.app\b/.test(rpu.h) && /function chipT\(/.test(rpu.h));
    }
  }
}
console.log(falhas ? `${falhas} FALHOU` : 'tudo OK');
process.exit(falhas ? 1 : 0);
