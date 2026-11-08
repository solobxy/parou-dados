// Testa as versões das páginas públicas noutras línguas (/en, /de, /fr), para o Google as mostrar a quem pesquisa
// nessas línguas: endereço próprio, canónico da própria língua, hreflang nos dois sentidos, ligações na mesma língua,
// páginas das paragens sem indexar noutras línguas, sitemaps por língua e o caminho de volta para a app.
// Uso: BASE=http://127.0.0.1:3000 node auditoria/seo-linguas.mjs
const BASE = process.env.BASE || 'http://127.0.0.1:3000';
let falhas = 0;
const ok = (n, c, e = '') => { if (!c) falhas++; console.log(c ? 'OK     ' : 'FALHOU ', n, e); };
const pedir = async (u, opcoes = {}) => { const r = await fetch(BASE + u, { redirect: 'manual', ...opcoes }); return { estado: r.status, h: await r.text(), destino: r.headers.get('location') || '' }; };
const canonico = (h) => (/<link rel="canonical" href="([^"]*)"/.exec(h) || [])[1] || '';
const robots = (h) => (/<meta name="robots" content="([^"]*)"/.exec(h) || [])[1] || '';
const alternativas = (h) => Object.fromEntries([...h.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)].map((m) => [m[1], m[2]]));
const lang = (h) => (/<html lang="([^"]+)"/.exec(h) || [])[1] || '';
const ligacoes = (h) => [...h.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
const jsonld = (h) => [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => { try { return JSON.parse(m[1]); } catch { return 'INVÁLIDO'; } });

// Uma linha qualquer do sitemap
const sm = await (await fetch(`${BASE}/sitemap-linhas.xml`)).text();
const linha = [...sm.matchAll(/<loc>https:\/\/parou\.pt(\/linhas\/[^/<]+\/[^<]+)<\/loc>/g)].map((m) => m[1])[0];
ok('[preparar] há uma linha no sitemap', Boolean(linha), linha);
ok('[sitemap] as linhas trazem as versões noutras línguas (xhtml:link)', /<xhtml:link rel="alternate" hreflang="en" href="https:\/\/parou\.pt\/en\/linhas\//.test(sm));

for (const [l, html] of [['en', 'en'], ['de', 'de'], ['fr', 'fr']]) {
  // Página inicial da língua
  const ini = await pedir(`/${l}`);
  ok(`[${l} início] 200 e na língua certa`, ini.estado === 200 && lang(ini.h) === html, `${ini.estado} ${lang(ini.h)}`);
  ok(`[${l} início] indexável e com canónico próprio`, /^index/.test(robots(ini.h)) && canonico(ini.h) === `https://parou.pt/${l}`, `${robots(ini.h)} ${canonico(ini.h)}`);
  const ai = alternativas(ini.h);
  ok(`[${l} início] hreflang para o português (a app) e para as outras línguas`, ai['pt-PT'] === 'https://parou.pt/' && ai.en === 'https://parou.pt/en' && ai.de === 'https://parou.pt/de' && ai.fr === 'https://parou.pt/fr' && ai['x-default'] === 'https://parou.pt/', JSON.stringify(ai));
  ok(`[${l} início] o botão da app abre a app nessa língua`, ligacoes(ini.h).includes(`/?lang=${l}`));
  ok(`[${l} início] JSON-LD válido com perguntas frequentes`, jsonld(ini.h).every((x) => x !== 'INVÁLIDO') && jsonld(ini.h).some((x) => x['@type'] === 'FAQPage'));
  // Linha
  const r = await pedir(`/${l}${linha}`);
  ok(`[${l} linha] 200, na língua certa, indexável`, r.estado === 200 && lang(r.h) === html && /^index/.test(robots(r.h)), `${r.estado} ${lang(r.h)} ${robots(r.h)}`);
  ok(`[${l} linha] canónico na própria língua`, canonico(r.h) === `https://parou.pt/${l}${linha}`, canonico(r.h));
  const a = alternativas(r.h);
  ok(`[${l} linha] hreflang das quatro línguas e x-default`, a['pt-PT'] === `https://parou.pt${linha}` && a.en === `https://parou.pt/en${linha}` && a['x-default'] === `https://parou.pt${linha}`, JSON.stringify(a));
  const lig = ligacoes(r.h).filter((u) => u.startsWith('/') && !u.startsWith('//'));
  const paraPt = lig.filter((u) => /^\/(linhas|paragens|cidades?|greves|incendios)(\/|$|\?)/.test(u));
  // A única ligação para a versão portuguesa é o botão «Português»
  ok(`[${l} linha] as ligações para outras páginas ficam na mesma língua`, paraPt.length <= 1 && lig.some((u) => u.startsWith(`/${l}/linhas`)), paraPt.slice(0, 3).join(' '));
  ok(`[${l} linha] o botão «Português» leva à versão portuguesa`, lig.includes(linha));
  ok(`[${l} linha] JSON-LD válido e com endereços na língua`, jsonld(r.h).every((x) => x !== 'INVÁLIDO') && !/"https:\/\/parou\.pt\/linhas/.test(JSON.stringify(jsonld(r.h))));
  // Sitemap da língua
  const sml = await pedir(`/sitemap-linhas-${l}.xml`);
  ok(`[${l} sitemap] existe e tem os endereços na língua`, sml.estado === 200 && sml.h.includes(`<loc>https://parou.pt/${l}${linha}</loc>`));
}

// Paragens: existem noutras línguas, mas só se indexam em português (são dezenas de milhares)
const lista = await pedir('/paragens/stcp');
const paragem = (/href="(\/paragens\/stcp\/[^"]+)"/.exec(lista.h) || [])[1];
if (paragem) {
  const p = await pedir(`/en${paragem}`);
  ok('[paragem en] responde e não se indexa', p.estado === 200 && /noindex/.test(robots(p.h)), `${p.estado} ${robots(p.h)}`);
  ok('[paragem en] canónico aponta para a portuguesa e sem hreflang', canonico(p.h) === `https://parou.pt${paragem}` && !Object.keys(alternativas(p.h)).length, canonico(p.h));
  const pt = await pedir(paragem);
  ok('[paragem pt] indexável e sem hreflang', /^index/.test(robots(pt.h)) && !Object.keys(alternativas(pt.h)).length);
}

// Redirecionamentos
let x = await pedir('/linhas?lang=en');
ok('[?lang=en] leva à versão inglesa (301)', x.estado === 301 && /\/en\/linhas$/.test(x.destino), `${x.estado} ${x.destino}`);
x = await pedir('/linhas', { headers: { cookie: 'parou_idioma=de' } });
ok('[cookie de] quem escolheu alemão vai para a versão alemã (302)', x.estado === 302 && /\/de\/linhas$/.test(x.destino), `${x.estado} ${x.destino}`);
x = await pedir('/linhas');
ok('[sem prefixo] português, sem redirecionar', x.estado === 200 && lang(x.h) === 'pt-PT');
x = await pedir('/en/mapa');
ok('[/en/mapa] página da app abre a app em inglês', x.estado === 302 && /\/mapa\?lang=en$/.test(x.destino), `${x.estado} ${x.destino}`);
x = await pedir('/en/linhas/');
ok('[barra final] /en/linhas/ vai para /en/linhas', x.estado === 301 && /\/en\/linhas$/.test(x.destino), x.destino);
const idx = await (await fetch(`${BASE}/sitemap.xml`)).text();
ok('[sitemap] o índice lista os sitemaps das três línguas', ['en', 'de', 'fr'].every((l) => idx.includes(`/sitemap-linhas-${l}.xml`) && idx.includes(`/sitemap-paginas-${l}.xml`)));
// (o robots.txt só abre para parou.pt e localhost; o endereço de teste fecha tudo)
const rb = await (await fetch(`${BASE.replace('127.0.0.1', 'localhost')}/robots.txt`)).text();
ok('[robots] a pesquisa não se indexa em nenhuma língua', /Disallow: \/en\/pesquisa/.test(rb));
// A app (português) aponta para as versões noutras línguas
const app = await pedir('/');
ok('[app /] hreflang para /en, /de e /fr', /hreflang="en" href="https:\/\/parou\.pt\/en"/.test(app.h) && /hreflang="fr" href="https:\/\/parou\.pt\/fr"/.test(app.h));

console.log(falhas ? `${falhas} testes falharam` : 'Todos os testes passaram');
process.exit(falhas ? 1 : 0);
