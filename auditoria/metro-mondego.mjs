// Metro Mondego (metrobus de Coimbra, Miranda do Corvo e Lousã) na app, com o servidor a correr e a base real.
// Antes não aparecia em lado nenhum (comentário na Comunidade a 16/11/2026: «não inclui o principal meio de transporte
// atual em Coimbra»). Testa o que uma pessoa vê:
//  - páginas públicas do operador e das 5 linhas (U1, U2, U3, S1, S2), com horas dos dias úteis;
//  - paragens perto da Portagem com as linhas do metrobus;
//  - o planeador usa o metrobus (Coimbra B → Serpins e República → Vale das Flores, num dia útil às 10:00);
//  - os desenhos das linhas seguem a rede (muitos pontos e comprimento perto do real), não retas entre paragens.
// Uso (na pasta da app): APP=$PWD BASE=http://127.0.0.1:3000 DB=<gtfs.db> node --import tsx ../auditoria/metro-mondego.mjs
import { DatabaseSync } from 'node:sqlite';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const DBFILE = process.env.DB || 'dados/gtfs.db';
const OPERADOR = 'Metro Mondego (Coimbra)';
let falhas = 0;
const ok = (n, c, e = '') => { if (!c) falhas++; console.log(c ? 'OK     ' : 'FALHOU ', n, e); };
const texto = async (u) => { const r = await fetch(BASE + u); return { estado: r.status, h: await r.text() }; };
const json = async (u) => (await fetch(BASE + u)).json();
const titulo = (h) => ((/<title>([^<]*)<\/title>/.exec(h) || [])[1] || '').replace(/&amp;/g, '&');
const descricao = (h) => ((/<meta name="description" content="([^"]*)"/.exec(h) || [])[1] || '').replace(/&amp;/g, '&');

// Próximo dia útil (hora de Lisboa) às 10:00, para o planeador
const proximoDiaUtil = () => {
  const d = new Date(Date.now() + 24 * 3600_000);
  while ([0, 6].includes(new Date(d.toLocaleString('en-US', { timeZone: 'Europe/Lisbon' })).getDay())) d.setTime(d.getTime() + 24 * 3600_000);
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Lisbon' }).format(d) + 'T10:00';
};

// --- Base -----------------------------------------------------------------------------------------------------------
const db = new DatabaseSync(DBFILE, { readOnly: true });
const feed = db.prepare("SELECT status, lines_count, stops_count FROM feeds WHERE id = 'metro_mondego'").get();
ok('[base] Metro Mondego carregado', feed && feed.status === 'OK' && feed.lines_count >= 5 && feed.stops_count >= 35, JSON.stringify(feed));
const linhas = db.prepare("SELECT route_short_name AS n, route_long_name AS l FROM routes WHERE feed_id = 'metro_mondego' ORDER BY 1").all();
ok('[base] linhas U1, U2, U3, S1 e S2', ['S1', 'S2', 'U1', 'U2', 'U3'].every((x) => linhas.some((l) => l.n === x)), linhas.map((l) => `${l.n} ${l.l}`).join(' | '));
// Desenhos: polilinha codificada; o comprimento do desenho da S1 (Coimbra B ou República → Serpins) tem de passar dos 30 km
// e ter centenas de pontos (pela rede), não umas dezenas de retas entre paragens.
const C = await import(`${process.env.APP || '.'}/src/utils/caminho.ts`).catch(() => null);
const formas = db.prepare(`SELECT s.pontos FROM shapes s WHERE s.feed_id = 'metro_mondego' AND s.shape_id IN (
  SELECT t.shape_id FROM trips t WHERE t.feed_id = 'metro_mondego' AND t.trip_headsign = 'Serpins')`).all();
if (C && C.descodificarPolilinha && formas.length) {
  const pts = C.descodificarPolilinha(formas[0].pontos);
  let m = 0;
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]];
    const la = Array.isArray(a) ? a[0] : a.lat, lo = Array.isArray(a) ? a[1] : a.lon, lb = Array.isArray(b) ? b[0] : b.lat, lob = Array.isArray(b) ? b[1] : b.lon;
    const dx = (lob - lo) * 111320 * Math.cos(la * Math.PI / 180), dy = (lb - la) * 110540;
    m += Math.hypot(dx, dy);
  }
  ok('[desenho] linha para Serpins segue a rede (mais de 150 pontos, mais de 30 km)', pts.length > 150 && m > 30000, `${pts.length} pontos, ${(m / 1000).toFixed(1)} km`);
} else {
  ok('[desenho] há desenhos das viagens para Serpins', formas.length > 0, `${formas.length} desenhos`);
}

// --- Créditos (licença CC BY 4.0 dos dados da AGIT) e região -----------------------------------------------------------
{
  const A = await import(`${process.env.APP || '.'}/src/utils/atribuicoes.ts`).catch(() => ({}));
  const I = await import(`${process.env.APP || '.'}/src/server/seo/indice.ts`).catch(() => ({}));
  const txt = A.atribuicaoDaFonte ? A.atribuicaoDaFonte('metro_mondego') : null;
  ok('[créditos] atribuição à Metro Mondego e à AGIT, com a licença', !!txt && /Metro Mondego/.test(txt) && /AGIT/.test(txt) && /CC BY 4\.0/.test(txt), txt);
  ok('[região] Metro Mondego aparece em Coimbra', I.REGIAO_OPERADOR && I.REGIAO_OPERADOR.metro_mondego === 'Coimbra', I.REGIAO_OPERADOR && I.REGIAO_OPERADOR.metro_mondego);
}

// --- Páginas públicas -----------------------------------------------------------------------------------------------
{
  const r = await texto('/linhas/metro-mondego');
  ok('[página] /linhas/metro-mondego responde 200', r.estado === 200, r.estado);
  ok('[página] mostra as 5 linhas', ['U1', 'U2', 'U3', 'S1', 'S2'].every((x) => new RegExp(`>\\s*${x}\\s*<`).test(r.h)), titulo(r.h));
  ok('[página] título com Metro Mondego', /Metro Mondego/.test(titulo(r.h)), titulo(r.h));
  const sm = await (await fetch(`${BASE}/sitemap-linhas.xml`)).text();
  const urls = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/^https?:\/\/[^/]+/, '')).filter((u) => u.startsWith('/linhas/metro-mondego/'));
  ok('[sitemap] linhas do Metro Mondego no mapa do site (para o Google)', urls.length >= 5, urls.slice(0, 5).join(' '));
  const u1 = urls.find((u) => /\/u1(-|$)/.test(u));
  if (u1) {
    const p = await texto(u1);
    const t = titulo(p.h), d = descricao(p.h);
    console.log('        ', u1, '|', t, '|', d.slice(0, 120));
    ok('[linha U1] 200, título com U1 e Metro Mondego', p.estado === 200 && /U1/.test(t) && /Metro Mondego/.test(t), t);
    ok('[linha U1] descrição com as horas dos dias úteis', /^Dias úteis: 1\.º \S+ às \d\d:\d\d, último às \d\d:\d\d/.test(d), d.slice(0, 90));
  } else ok('[linha U1] página existe', false, urls.join(' '));
}

// --- Perto (Portagem) -----------------------------------------------------------------------------------------------
{
  const r = await json('/api/transit/nearby?lat=40.20753&lon=-8.43065&radius=400');
  const mm = (r.stops || []).filter((s) => s.operatorName === OPERADOR);
  const codigos = new Set(mm.flatMap((s) => (s.lines || []).map((l) => l.code)));
  ok('[perto] paragens do Metro Mondego perto da Portagem', mm.length > 0, mm.map((s) => s.name).join(', '));
  ok('[perto] com as linhas do metrobus (U1/U2/S1/S2)', ['U1', 'U2'].some((c) => codigos.has(c)) && ['S1', 'S2'].some((c) => codigos.has(c)), [...codigos].join(' '));
}

// --- Planeador ------------------------------------------------------------------------------------------------------
const quando = proximoDiaUtil();
for (const [nome, o, d] of [
  ['Coimbra B → Serpins', [40.22474, -8.43988], [40.15577, -8.21001]],
  ['República → Vale das Flores', [40.20983, -8.41970], [40.19544, -8.39805]],
]) {
  const q = new URLSearchParams({ originLat: o[0], originLon: o[1], destLat: d[0], destLon: d[1], destName: 'Destino', quando });
  const r = await json(`/api/transit/plan-route?${q}`);
  const rotas = r.routes || [];
  const comMetrobus = rotas.filter((x) => (x.legs || []).some((l) => l.mode === 'TRANSIT' && l.operatorName === OPERADOR));
  const resumo = rotas.map((x) => (x.legs || []).filter((l) => l.mode === 'TRANSIT').map((l) => `${l.operatorName}:${l.lineCode}`).join('>') + ` ${x.totalDurationMinutes}min`).join(' | ');
  ok(`[planeador] ${nome} (${quando}) usa o metrobus`, comMetrobus.length > 0, resumo || JSON.stringify(r).slice(0, 200));
}

if (falhas) { console.log(`\n${falhas} FALHA(S)`); process.exit(1); }
console.log('\nTodos os testes OK');
