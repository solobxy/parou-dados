// Testa, com os dados reais e o servidor a sério, que as linhas e as viagens se desenham PELA ESTRADA (ou pelo carril) e não em linha
// reta entre paragens (que atravessava prédios e cortava caminhos que não existem).
//  1. Cobertura: quase todas as viagens têm desenho (shape) e a base dá o número de desenhos de cada operador.
//  2. Percurso de uma linha (/api/transit/percurso): para viagens de cada operador, o desenho que a app vai desenhar (o mesmo código
//     da app) começa e acaba nas paragens, passa junto das paragens e não tem saltos.
//  3. Planeador (/api/transit/plan-route): os troços de transporte trazem o desenho da estrada entre embarque e desembarque.
//  4. UNIR (sem viagens na base) e CP/metros (desenhos feitos pelo mapa de estradas e carris): a linha e as opções de viagem também vão pela estrada.
// Uso (na pasta da app, com o servidor a correr): APP=$PWD BASE=http://127.0.0.1:3000 DB=<gtfs.db> node --import tsx ../auditoria/percurso-estrada.mjs
import { DatabaseSync } from 'node:sqlite';

const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const APP = process.env.APP || '../app';
const DBFILE = process.env.DB || `${APP}/dados/gtfs.db`;
const C = await import(`${APP}/src/utils/caminho.ts`);
const { metros } = await import(`${APP}/src/utils/geoPercurso.ts`);

let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };
const nota = (...a) => console.log('NOTA   ', ...a);
const get = async (caminho) => {
  const r = await fetch(BASE + caminho, { signal: AbortSignal.timeout(60000) });
  return { status: r.status, corpo: r.ok ? await r.json() : null };
};

/** Distância (m) de um ponto à linha, por força bruta (independente do código da app) */
function aLinha(p, linha) {
  const kx = Math.cos((p.lat * Math.PI) / 180) * 111320, ky = 110540;
  let melhor = Infinity;
  for (let i = 0; i < linha.length - 1; i++) {
    const ax = (linha[i].lon - p.lon) * kx, ay = (linha[i].lat - p.lat) * ky;
    const bx = (linha[i + 1].lon - p.lon) * kx, by = (linha[i + 1].lat - p.lat) * ky;
    const dx = bx - ax, dy = by - ay, c2 = dx * dx + dy * dy;
    const u = c2 === 0 ? 0 : Math.max(0, Math.min(1, (-ax * dx - ay * dy) / c2));
    melhor = Math.min(melhor, Math.hypot(ax + u * dx, ay + u * dy));
  }
  return melhor;
}
const comprimento = (ps) => ps.slice(1).reduce((a, p, i) => a + metros(ps[i], p), 0);
const saltoMax = (ps) => ps.slice(1).reduce((m, p, i) => Math.max(m, metros(ps[i], p)), 0);

const db = new DatabaseSync(DBFILE, { readOnly: true });
const temColuna = db.prepare("SELECT name FROM pragma_table_info('trips')").all().some((c) => c.name === 'shape_id');
ok('[dados] a base tem desenhos (coluna shape_id e tabela shapes)', temColuna && !!db.prepare("SELECT name FROM sqlite_master WHERE name = 'shapes'").get());
if (!temColuna) { console.log(`\n${falhas} FALHA(S)`); process.exit(1); }

// ------------------------------------------------------------ 1. cobertura
const cobertura = db.prepare('SELECT feed_id AS feed, COUNT(*) AS n, SUM(shape_id IS NOT NULL) AS com FROM trips GROUP BY feed_id ORDER BY n DESC').all();
for (const c of cobertura) nota(`${c.feed.padEnd(20)} viagens ${String(c.n).padStart(6)}  com desenho ${String(c.com).padStart(6)}  (${Math.round((100 * c.com) / c.n)}%)`);
for (const feed of ['stcp', 'carris', 'cmh', 'tub_braga', 'metro_porto', 'metro_lisboa']) {
  const c = cobertura.find((x) => x.feed === feed);
  ok(`[cobertura] ${feed}: pelo menos 95% das viagens têm desenho`, !!c && c.com / c.n >= 0.95, c ? `${Math.round((100 * c.com) / c.n)}%` : 'feed sem viagens');
}
// Desenhos feitos pelo mapa de estradas e carris (workflow «Estradas»): CP e metros (que traziam só retas entre estações) e a UNIR
const feitosPeloMapa = (feed) => db.prepare("SELECT COUNT(*) AS n FROM trips WHERE feed_id = ? AND shape_id LIKE 'osrm:%'").get(feed).n;
const totalDe = (feed) => cobertura.find((x) => x.feed === feed)?.n || 0;
for (const [feed, minimo] of [['cp', 0.85], ['metro_porto', 0.9], ['metro_lisboa', 0.9]]) {
  const n = feitosPeloMapa(feed), t = totalDe(feed);
  ok(`[mapa] ${feed}: pelo menos ${Math.round(minimo * 100)}% das viagens têm o desenho feito pelo mapa de estradas/carris`, t > 0 && n / t >= minimo, `${n}/${t} (${t ? Math.round((100 * n) / t) : 0}%)`);
}
const temRotaDesenhos = !!db.prepare("SELECT name FROM sqlite_master WHERE name = 'route_shapes'").get();
const sentidosUnir = db.prepare("SELECT COUNT(*) AS n FROM (SELECT DISTINCT route_id, direction_id FROM stop_routes WHERE route_id LIKE 'unir:%')").get().n;
const sentidosComDesenho = temRotaDesenhos ? db.prepare("SELECT COUNT(*) AS n FROM route_shapes WHERE route_id LIKE 'unir:%'").get().n : 0;
ok('[mapa] UNIR: pelo menos 85% das linhas (por sentido) têm desenho', sentidosUnir > 0 && sentidosComDesenho / sentidosUnir >= 0.85, `${sentidosComDesenho}/${sentidosUnir} (${sentidosUnir ? Math.round((100 * sentidosComDesenho) / sentidosUnir) : 0}%)`);

// ------------------------------------------------------------ 2. percurso de linha
const FEEDS = ['stcp', 'carris', 'cmh', 'tub_braga', 'metro_porto', 'metro_lisboa', 'mts', 'smtuc', 'guimabus', 'mobiave', 'horarios_funchal', 'vamus', 'giro', 'tcb_barreiro', 'proximo_faro', 'mdb-1272', 'tuba_barcelos', 'fertagus', 'transtejo_soflusa'];
let testadas = 0;
for (const feed of FEEDS) {
  const total = db.prepare('SELECT COUNT(*) AS n FROM trips WHERE feed_id = ? AND shape_id IS NOT NULL').get(feed).n;
  if (!total) { nota(`${feed}: sem viagens com desenho nesta base`); continue; }
  const viagens = [0.1, 0.35, 0.6, 0.85].map((f) => db.prepare('SELECT trip_id AS id FROM trips WHERE feed_id = ? AND shape_id IS NOT NULL ORDER BY trip_id LIMIT 1 OFFSET ?').get(feed, Math.floor(total * f)).id);
  let boas = 0, comProblema = [];
  for (const id of viagens) {
    const primeira = db.prepare('SELECT stop_id AS s FROM stop_times WHERE trip_id = ? ORDER BY stop_sequence LIMIT 1').get(id)?.s;
    const { status, corpo: p } = await get(`/api/transit/percurso?trip=${encodeURIComponent(id)}${primeira ? `&stop=${encodeURIComponent(primeira)}` : ''}`);
    if (status !== 200 || !p?.paragens?.length) { comProblema.push(`${id}: HTTP ${status}`); continue; }
    if (!p.caminho || !Array.isArray(p.cortes) || p.cortes.length !== p.paragens.length) { comProblema.push(`${id}: sem caminho/cortes (${typeof p.caminho}, ${p.cortes?.length}/${p.paragens.length})`); continue; }
    const t = C.trocosDoPercurso(p.paragens, 0, p.caminho, p.cortes);
    const linha = t.restante;
    const problemas = [];
    if (!t.pelaEstrada) problemas.push('não desenha pela estrada');
    if (linha.length < 2) problemas.push('linha vazia');
    else {
      const ps = p.paragens;
      if (metros(linha[0], ps[0]) > 200) problemas.push(`começa a ${Math.round(metros(linha[0], ps[0]))} m da 1.ª paragem`);
      if (metros(linha[linha.length - 1], ps[ps.length - 1]) > 200) problemas.push(`acaba a ${Math.round(metros(linha[linha.length - 1], ps[ps.length - 1]))} m da última`);
      const perto = ps.filter((q) => aLinha(q, linha) <= 120).length;
      if (perto / ps.length < 0.8) problemas.push(`só ${perto}/${ps.length} paragens a menos de 120 m da linha`);
      if (saltoMax(linha) > 6000) problemas.push(`salto de ${Math.round(saltoMax(linha))} m`);
      const razao = comprimento(linha) / Math.max(1, comprimento(ps));
      if (razao > 3.5 && ps.length > 4) problemas.push(`linha ${razao.toFixed(1)}× mais comprida do que as paragens`);
    }
    if (problemas.length) comProblema.push(`${id}: ${problemas.join('; ')}`); else boas++;
    testadas++;
  }
  ok(`[percurso] ${feed}: ${boas}/${viagens.length} viagens desenhadas pela estrada, junto das paragens e sem saltos`, boas === viagens.length, comProblema.slice(0, 2).join(' | '));
}
ok('[percurso] testou-se pelo menos 40 viagens', testadas >= 40, String(testadas));

// ------------------------------------------------------------ 3. planeador
const sitio = (id) => db.prepare('SELECT stop_lat AS lat, stop_lon AS lon FROM stops WHERE stop_id = ?').get(id);
const noeda = sitio('stcp:NDA1'), freixo = sitio('stcp:FRX2');
const PARES = [
  ['Noeda → Freixo (Porto)', noeda, freixo],
  ['Trindade → Hospital S. João (Porto)', { lat: 41.1523, lon: -8.6098 }, { lat: 41.1829, lon: -8.6004 }],
  ['Oriente → Praça do Comércio (Lisboa)', { lat: 38.7678, lon: -9.0993 }, { lat: 38.7075, lon: -9.1364 }],
  ['Cais do Sodré → Cacilhas (barco)', { lat: 38.7058, lon: -9.1441 }, { lat: 38.6874, lon: -9.1472 }],
  ['Braga centro → Gualtar', { lat: 41.5503, lon: -8.42 }, { lat: 41.56, lon: -8.397 }],
  ['Campanhã → Foz (Porto)', { lat: 41.1485, lon: -8.5855 }, { lat: 41.1536, lon: -8.6766 }],
];
const OPERADORES_PELO_MAPA = new RegExp(process.env.SEM_DESENHO || '(?!)', 'i');   // por defeito nenhum operador fica de fora: todos os troços têm de ir pela estrada
let trocosTransito = 0, trocosComCaminho = 0, paresComTransporte = 0;
for (const [nome, o, d] of PARES) {
  if (!o || !d) { nota(`${nome}: sem coordenadas na base`); continue; }
  const { status, corpo } = await get(`/api/transit/plan-route?originLat=${o.lat}&originLon=${o.lon}&destLat=${d.lat}&destLon=${d.lon}&destName=Destino&quando=${encodeURIComponent('2026-10-20T10:30')}`);
  if (status !== 200 || !corpo?.routes) { ok(`[planeador] ${nome}: o servidor respondeu`, false, `HTTP ${status}`); continue; }
  const trocos = corpo.routes.flatMap((r) => r.legs).filter((l) => l.mode === 'TRANSIT' && l.pontos?.length > 1);
  if (!trocos.length) { nota(`${nome}: sem troços de transporte nesta hora`); continue; }
  paresComTransporte++;
  const problemas = [];
  for (const l of trocos) {
    trocosTransito++;
    if (!l.caminho) {
      // Operadores que só ganham desenho com o mapa de estradas/carris (workflow «Estradas»): CP e UNIR
      if (OPERADORES_PELO_MAPA.test(String(l.operatorName || ''))) { nota(`${l.lineCode || '?'} (${l.operatorName}): sem caminho (espera o desenho do mapa de estradas/carris)`); continue; }
      problemas.push(`${l.lineCode || '?'} (${l.operatorName || '?'}): sem caminho`);
      continue;
    }
    trocosComCaminho++;
    const linha = C.descodificarPolilinha(l.caminho);
    const ps = l.pontos;
    if (linha.length < 2) { problemas.push(`${l.lineCode}: caminho vazio`); continue; }
    if (metros(linha[0], ps[0]) > 200 || metros(linha[linha.length - 1], ps[ps.length - 1]) > 200) problemas.push(`${l.lineCode}: não começa/acaba nas paragens`);
    const perto = ps.filter((q) => aLinha(q, linha) <= 120).length;
    if (perto / ps.length < 0.8) problemas.push(`${l.lineCode}: só ${perto}/${ps.length} paragens junto do caminho`);
  }
  ok(`[planeador] ${nome}: ${trocos.length} troços de transporte, todos com o caminho pela estrada`, problemas.length === 0, problemas.slice(0, 3).join(' | '));
}
ok('[planeador] pelo menos 3 viagens com transporte foram testadas', paresComTransporte >= 3, String(paresComTransporte));
nota(`troços de transporte com caminho: ${trocosComCaminho}/${trocosTransito}`);

// ------------------------------------------------------------ 4. UNIR: percurso da linha e opções de viagem
if (temRotaDesenhos) {
  const total = db.prepare("SELECT COUNT(*) AS n FROM route_shapes WHERE route_id LIKE 'unir:%'").get().n;
  const amostra = total ? [0.05, 0.25, 0.5, 0.75, 0.95].map((f) => db.prepare("SELECT route_id AS r, direction_id AS d FROM route_shapes WHERE route_id LIKE 'unir:%' ORDER BY route_id, direction_id LIMIT 1 OFFSET ?").get(Math.floor(total * f))) : [];
  let boasU = 0; const malU = [];
  for (const { r, d } of amostra) {
    const ids = db.prepare('SELECT stop_id AS s FROM stop_routes WHERE route_id = ? AND direction_id = ? ORDER BY stop_sequence').all(r, d).map((x) => x.s);
    const { status, corpo: p } = await get(`/api/transit/percurso?route=${encodeURIComponent(r)}&stop=${encodeURIComponent(ids[0])}&sentido=${d}`);
    if (status !== 200 || !p?.paragens?.length) { malU.push(`${r}/${d}: HTTP ${status}`); continue; }
    if (!p.caminho || p.cortes?.length !== p.paragens.length) { malU.push(`${r}/${d}: sem caminho/cortes`); continue; }
    const t = C.trocosDoPercurso(p.paragens, 0, p.caminho, p.cortes);
    const linha = t.restante, ps = p.paragens, problemas = [];
    if (!t.pelaEstrada) problemas.push('não desenha pela estrada');
    if (linha.length < 2) problemas.push('linha vazia');
    else {
      if (metros(linha[0], ps[0]) > 200) problemas.push(`começa a ${Math.round(metros(linha[0], ps[0]))} m da 1.ª paragem`);
      if (metros(linha[linha.length - 1], ps[ps.length - 1]) > 200) problemas.push('não acaba na última paragem');
      const perto = ps.filter((q) => aLinha(q, linha) <= 120).length;
      if (perto / ps.length < 0.8) problemas.push(`só ${perto}/${ps.length} paragens a menos de 120 m`);
      if (saltoMax(linha) > 6000) problemas.push(`salto de ${Math.round(saltoMax(linha))} m`);
      if (comprimento(linha) / Math.max(1, comprimento(ps)) > 3.5 && ps.length > 4) problemas.push('linha muito mais comprida do que as paragens');
    }
    if (problemas.length) malU.push(`${r}/${d}: ${problemas.join('; ')}`); else boasU++;
  }
  ok(`[UNIR] percurso: ${boasU}/${amostra.length} linhas desenhadas pela estrada, junto das paragens e sem saltos`, amostra.length >= 4 && boasU === amostra.length, malU.slice(0, 2).join(' | '));

  // Opções de viagem com a UNIR: de uma paragem a outra da mesma linha
  const candidatos = (corpo) => [
    ...(corpo.unir || []), ...(corpo.hibridas || []).map((h) => h.candidato), ...(corpo.pontes || []).map((p) => p.candidato),
    ...(corpo.duplas || []).flatMap((d) => [d.a, d.b]), ...(corpo.cadeias || []).flatMap((c) => c.pernas), ...(corpo.ligacoes || []).map((l) => l.candidato),
  ].filter(Boolean);
  let testados = 0; const semCaminho = [], maus = [];
  for (const { r, d } of amostra.slice(0, 3)) {
    const seq = db.prepare('SELECT s.stop_lat AS lat, s.stop_lon AS lon FROM stop_routes sr JOIN stops s ON s.stop_id = sr.stop_id WHERE sr.route_id = ? AND sr.direction_id = ? ORDER BY sr.stop_sequence').all(r, d);
    if (seq.length < 8) continue;
    const o = seq[1], dest = seq[Math.min(seq.length - 2, 9)];
    const { status, corpo } = await get(`/api/transit/plan-route?originLat=${o.lat}&originLon=${o.lon}&destLat=${dest.lat}&destLon=${dest.lon}&destName=Destino&quando=${encodeURIComponent('2026-10-20T10:30')}`);
    if (status !== 200 || !corpo) { maus.push(`${r}/${d}: plan-route HTTP ${status}`); continue; }
    for (const c of candidatos(corpo)) {
      if (!c?.pontos || c.pontos.length < 2) continue;
      testados++;
      if (!c.caminho) { semCaminho.push(`${c.linha}`); continue; }
      const linha = C.descodificarPolilinha(c.caminho);
      if (linha.length < 2 || metros(linha[0], c.pontos[0]) > 200 || metros(linha[linha.length - 1], c.pontos[c.pontos.length - 1]) > 200) maus.push(`${c.linha}: não começa/acaba nas paragens`);
      else if (c.pontos.filter((q) => aLinha(q, linha) <= 120).length / c.pontos.length < 0.8) maus.push(`${c.linha}: paragens longe do caminho`);
    }
  }
  nota(`opções com a UNIR testadas: ${testados}; sem caminho: ${semCaminho.length}`);
  ok('[UNIR] planeador: há opções com a UNIR e todas trazem o caminho pela estrada', testados >= 2 && semCaminho.length === 0 && maus.length === 0, [...semCaminho.slice(0, 2).map((l) => `${l}: sem caminho`), ...maus.slice(0, 2)].join(' | '));
} else {
  ok('[UNIR] a base tem os desenhos das linhas da UNIR (tabela route_shapes)', false, 'tabela route_shapes inexistente');
}

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nAs linhas e as viagens desenham-se pela estrada.');
process.exit(falhas ? 1 : 0);
