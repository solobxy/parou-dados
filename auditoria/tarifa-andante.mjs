// Título Andante em cada trajeto do Porto (tarifaAndante.ts), só com dados oficiais (andante.pt) e só quando há certeza.
// Regra oficial: anéis de zonas à volta da zona da 1.ª validação (Z2 = 2 anéis, mínimo Z2), dentro da duração do título.
// Testa a regra (exemplos oficiais: Campanhã→Trindade na mesma zona = Z2; Trindade→Pedras Rubras = Z4, das perguntas
// frequentes do Andante), os casos em que não se mostra nada (operador sem Andante, paragem sem zona, preços velhos ou
// ainda não em vigor, viagem mais longa do que o título) e o planeador a sério com uma base pequena.
// Com a app a correr (BASE) e dados reais: Campanhã → Trindade tem de dar Andante Z2 ao preço oficial.
// Uso: APP=pasta-da-app [BASE=http://127.0.0.1:3000] node --import tsx tarifa-andante.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'parou-andante-'));
process.env.PAROU_DATA_DIR = dir; // antes de importar a app
const APP = path.resolve(process.env.APP || '../app');
const BASE = process.env.BASE || '';
let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };

const T = await import(`${APP}/src/server/tarifaAndante.ts`);

// ---------------------------------------------------------------- regra (sem base)
const agoraIso = new Date().toISOString();
const PRECOS = {
  simples: { 2: 1.4, 3: 1.85, 4: 2.3, 5: 2.8, 6: 3.25, 7: 3.75, 8: 4.2, 9: 4.65 },
  h24: { 2: 5.35, 3: 6.85, 4: 8.55, 5: 10.25, 6: 12.2, 7: 13.9, 8: 15.6, 9: 17.3 },
  duracao_min: { 2: 60, 3: 60, 4: 75, 5: 90, 6: 105, 7: 120, 8: 135, 9: 150 },
  cartao_azul: 0.6, em_vigor_desde: '2026-01-01', obtidos: agoraIso,
};
// anéis oficiais usados nos exemplos (distances.csv do Andante): PRT1→PRT1 1, PRT1→MAI1 3, PRT1→VCD8 4
const DIST = { 'PRT1|PRT1': 1, 'PRT1|PRT2': 2, 'PRT1|MAI1': 3, 'PRT1|VCD8': 4, 'PRT1|PRT3': 2, 'MAI1|MAI1': 1, 'MAI1|PRT1': 3 };
const tabela = (precos = PRECOS) => ({ anel: (o, d) => DIST[`${o}|${d}`], precos, fontePrecos: 'https://andante.pt/comprar/andante-azul/' });
const hoje = new Date('2026-11-25T12:00:00Z');
const perna = (zonas, parte = 36000, elegivel = true) => ({ elegivel, parte, zonas });

let r = T.calcularTituloAndante([perna(['PRT1', 'PRT1', 'PRT1'])], tabela(), hoje);
ok('[regra] Campanhã → Trindade (mesma zona PRT1): Z2, 1,40 €', r?.zonas === 2 && r?.preco === 1.4, JSON.stringify(r));
ok('[regra] com 24 h, cartão Azul, duração e data de entrada em vigor', r?.preco24h === 5.35 && r?.cartao === 0.6 && r?.duracaoMin === 60 && r?.emVigorDesde === '2026-01-01');
r = T.calcularTituloAndante([perna(['PRT1', 'PRT1', 'MAI1', 'VCD8'])], tabela(), hoje);
ok('[regra] Trindade → Pedras Rubras (VCD8, 4 anéis): Z4, 2,30 € (exemplo oficial do Andante)', r?.zonas === 4 && r?.preco === 2.3, JSON.stringify(r));
r = T.calcularTituloAndante([perna(['PRT1', 'MAI1']), perna(['MAI1', 'PRT1'], 36000 + 20 * 60)], tabela(), hoje);
ok('[regra] conta-se sempre a partir da 1.ª validação (ir e voltar pela MAI1 = Z3)', r?.zonas === 3);
ok('[regra] uma zona sem certeza (perto de fronteira): nada', T.calcularTituloAndante([perna(['PRT1', undefined, 'PRT1'])], tabela(), hoje) === undefined);
ok('[regra] um troço num operador sem Andante: nada', T.calcularTituloAndante([perna(['PRT1']), perna(['PRT1'], 36600, false)], tabela(), hoje) === undefined);
ok('[regra] última entrada depois da duração do título (Z2 = 1 h): nada',
  T.calcularTituloAndante([perna(['PRT1', 'PRT1']), perna(['PRT1', 'PRT1'], 36000 + 61 * 60)], tabela(), hoje) === undefined);
ok('[regra] última entrada dentro da hora: Z2',
  T.calcularTituloAndante([perna(['PRT1', 'PRT1']), perna(['PRT1', 'PRT1'], 36000 + 59 * 60)], tabela(), hoje)?.zonas === 2);
const velhos = { ...PRECOS, obtidos: new Date(Date.now() - 11 * 86400_000).toISOString() };
ok('[regra] preços lidos há mais de 10 dias: nada', T.calcularTituloAndante([perna(['PRT1'])], tabela(velhos), hoje) === undefined);
const futuros = { ...PRECOS, em_vigor_desde: '2027-01-01' };
ok('[regra] preços que ainda não estão em vigor no dia da viagem: nada', T.calcularTituloAndante([perna(['PRT1'])], tabela(futuros), hoje) === undefined);
ok('[regra] e passam a valer no dia em que entram em vigor', T.calcularTituloAndante([perna(['PRT1'])], tabela(futuros), new Date('2027-01-02T12:00:00Z'))?.zonas === 2);
ok('[regra] sem preços: nada', T.calcularTituloAndante([perna(['PRT1'])], tabela(null), hoje) === undefined);
ok('[regra] zona sem anéis na tabela oficial: nada', T.calcularTituloAndante([perna(['PRT1', 'XXX9'])], tabela(), hoje) === undefined);
ok('[CP] urbanos e regionais têm Andante', T.comboioCpComAndante('R') && T.comboioCpComAndante('U') && T.comboioCpComAndante('Linha de Braga') && T.comboioCpComAndante('Linha do Marco'));
ok('[CP] Intercidades, Alfa e InterRegional não', !T.comboioCpComAndante('IC') && !T.comboioCpComAndante('AP') && !T.comboioCpComAndante('IR') && !T.comboioCpComAndante(''));

// ---------------------------------------------------------------- planeador a sério (base pequena)
const B = await import(`${APP}/src/server/db/gtfsDatabase.ts`);
const P = await import(`${APP}/src/server/planeador.ts`);
const I = await import(`${APP}/src/server/planeadorIndice.ts`);
const db = B.getDatabase();
db.exec('CREATE TABLE IF NOT EXISTS stop_routes (feed_id TEXT NOT NULL, stop_id TEXT NOT NULL, route_id TEXT NOT NULL, direction_id INTEGER DEFAULT 0, stop_sequence INTEGER, PRIMARY KEY (stop_id, route_id, direction_id))');
const FEEDS = [['metro_porto', 'Metro', 'Metro do Porto'], ['stcp', 'Autocarro', 'STCP'], ['cp', 'Comboio', 'CP'], ['outro_t', 'Autocarro', 'Outro']];
for (const [id, mode, nome] of FEEDS) {
  B.upsertFeed({ id, operator_name: nome, mode, feed_type: 'gtfs', source_origin: 'seed', url: '', status: 'OK', progress: 'OK', lines_count: 1, stops_count: 1, trips_count: 1, realtime_entities: 'Nenhum' });
  B.batchInsertCalendar([{ feed_id: id, service_id: 'todos', monday: 1, tuesday: 1, wednesday: 1, thursday: 1, friday: 1, saturday: 1, sunday: 1, start_date: '20200101', end_date: '20991231' }]);
}
const KM_LAT = 1 / 111, KM_LON = 1 / 84;
const ponto = (c, n, e) => ({ lat: c.lat + n * KM_LAT, lon: c.lon + e * KM_LON });
const paragens = [], zonas = [];
const nova = (feed, id, nome, p, zona) => { paragens.push({ stop_id: id, feed_id: feed, stop_name: nome, stop_lat: p.lat, stop_lon: p.lon }); if (zona) zonas.push([id, zona]); return id; };
function linha(feed, tipo, codigo, ps, cada) {
  const rota = `${feed}:${codigo}`;
  B.batchInsertRoutes([{ route_id: rota, feed_id: feed, route_short_name: codigo, route_long_name: `${codigo} teste`, route_type: tipo }]);
  const trips = [], sts = [];
  for (let m = 5 * 60; m < 23 * 60 + 50; m += cada) {
    const t = `${rota}:${m}`;
    trips.push({ trip_id: t, feed_id: feed, route_id: rota, service_id: 'todos', trip_headsign: 'Fim' });
    ps.forEach(([id, min], i) => sts.push({ feed_id: feed, trip_id: t, stop_id: id, arrival_secs: (m + min) * 60, departure_secs: (m + min) * 60, stop_sequence: i + 1 }));
  }
  B.batchInsertTrips(trips);
  B.batchInsertStopTimes(sts);
}
const CENARIOS = {};
const CIDADE = (n) => ({ lat: 41.0 + n * 0.25, lon: -8.6 + n * 0.25 });
{ // metro na mesma zona
  const c = CIDADE(0);
  const a = nova('metro_porto', 'metro_porto:A0', 'Campanhã T', ponto(c, 0.05, 0), 'PRT1');
  const m = nova('metro_porto', 'metro_porto:M0', 'Heroísmo T', ponto(c, 1.5, 0), 'PRT1');
  const b = nova('metro_porto', 'metro_porto:B0', 'Trindade T', ponto(c, 3.05, 0), 'PRT1');
  linha('metro_porto', 1, 'F', [[a, 0], [m, 3], [b, 6]], 6);
  CENARIOS.mesmaZona = { O: ponto(c, 0, 0), D: ponto(c, 3, 0) };
}
{ // metro a atravessar zonas (PRT1 → MAI1 → VCD8)
  const c = CIDADE(1);
  const a = nova('metro_porto', 'metro_porto:A1', 'Trindade T1', ponto(c, 0.05, 0), 'PRT1');
  const m = nova('metro_porto', 'metro_porto:M1', 'Maia T1', ponto(c, 3, 0), 'MAI1');
  const b = nova('metro_porto', 'metro_porto:B1', 'Pedras Rubras T1', ponto(c, 6.05, 0), 'VCD8');
  linha('metro_porto', 1, 'E', [[a, 0], [m, 10], [b, 20]], 10);
  CENARIOS.variasZonas = { O: ponto(c, 0, 0), D: ponto(c, 6, 0) };
}
{ // autocarro com uma paragem intermédia sem zona certa
  const c = CIDADE(2);
  const a = nova('stcp', 'stcp:A2', 'STCP origem', ponto(c, 0.05, 0), 'PRT1');
  const m = nova('stcp', 'stcp:M2', 'STCP fronteira', ponto(c, 2, 0), null);
  const b = nova('stcp', 'stcp:B2', 'STCP destino', ponto(c, 4.05, 0), 'PRT1');
  linha('stcp', 3, '200', [[a, 0], [m, 8], [b, 16]], 10);
  CENARIOS.semZona = { O: ponto(c, 0, 0), D: ponto(c, 4, 0) };
}
{ // Intercidades (sem Andante) entre estações com zona
  const c = CIDADE(3);
  const a = nova('cp', 'cp:A3', 'Estação A', ponto(c, 0.05, 0), 'PRT1');
  const b = nova('cp', 'cp:B3', 'Estação B', ponto(c, 6.05, 0), 'PRT1');
  linha('cp', 2, 'IC', [[a, 0], [b, 12]], 30);
  CENARIOS.intercidades = { O: ponto(c, 0, 0), D: ponto(c, 6, 0) };
}
{ // regional da CP com zonas: Andante
  const c = CIDADE(4);
  const a = nova('cp', 'cp:A4', 'Estação C', ponto(c, 0.05, 0), 'PRT1');
  const b = nova('cp', 'cp:B4', 'Estação D', ponto(c, 6.05, 0), 'MAI1');
  linha('cp', 2, 'R', [[a, 0], [b, 12]], 30);
  CENARIOS.regional = { O: ponto(c, 0, 0), D: ponto(c, 6, 0) };
}
{ // outro operador (fora do Andante)
  const c = CIDADE(5);
  const a = nova('outro_t', 'outro_t:A5', 'Outro A', ponto(c, 0.05, 0), null);
  const b = nova('outro_t', 'outro_t:B5', 'Outro B', ponto(c, 4.05, 0), null);
  linha('outro_t', 3, '1', [[a, 0], [b, 12]], 10);
  CENARIOS.outro = { O: ponto(c, 0, 0), D: ponto(c, 4, 0) };
}
B.batchInsertStops(paragens);
db.exec('DROP TABLE IF EXISTS andante_dist; DROP TABLE IF EXISTS andante_zona;');
db.exec('CREATE TABLE andante_dist (o TEXT NOT NULL, d TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (o, d)) WITHOUT ROWID');
db.exec('CREATE TABLE andante_zona (stop_id TEXT PRIMARY KEY, zona TEXT NOT NULL, origem TEXT NOT NULL) WITHOUT ROWID');
const insD = db.prepare('INSERT INTO andante_dist VALUES (?, ?, ?)');
for (const [k, n] of Object.entries(DIST)) { const [o, d] = k.split('|'); insD.run(o, d, n); }
const insZ = db.prepare('INSERT INTO andante_zona VALUES (?, ?, ?)');
for (const [id, z] of zonas) insZ.run(id, z, 'gtfs');
const estado = (precos, versao) => {
  db.prepare('INSERT OR REPLACE INTO app_state (key, value) VALUES (?, ?)').run('andante', JSON.stringify({ fonte_precos: 'https://andante.pt/comprar/andante-azul/', precos }));
  db.prepare('INSERT OR REPLACE INTO app_state (key, value) VALUES (?, ?)').run('dataset_built_at', JSON.stringify(versao)); // muda a chave da cache
};
estado(PRECOS, 'v1');

for (let i = 0; i < 400 && !I.indicePronto(); i++) await new Promise((res) => setTimeout(res, 50));
ok('[plano] o motor do planeador ficou pronto', !!I.indicePronto());
const AGORA = new Date('2026-11-25T10:00:00Z');
const plano = async (nome) => { const { O, D } = CENARIOS[nome]; return P.planearViagem(O.lat, O.lon, D.lat, D.lon, 'Destino', AGORA); };
const comTransporte = (res) => res.routes.filter((o) => o.legs.some((l) => l.mode === 'TRANSIT'));

let res = await plano('mesmaZona');
let o = comTransporte(res)[0];
ok('[plano] metro na mesma zona: Andante Z2 a 1,40 €', o?.tarifa?.sistema === 'andante' && o.tarifa.zonas === 2 && o.tarifa.preco === 1.4, JSON.stringify(o?.tarifa));
ok('[plano] com a página oficial como fonte', o?.tarifa?.fonte === 'https://andante.pt/comprar/andante-azul/');
ok('[plano] a opção «a pé» não tem bilhete', res.routes.filter((x) => !x.legs.some((l) => l.mode === 'TRANSIT')).every((x) => !x.tarifa));
res = await plano('variasZonas'); o = comTransporte(res)[0];
ok('[plano] metro de PRT1 até VCD8: Z4 a 2,30 €', o?.tarifa?.zonas === 4 && o.tarifa.preco === 2.3, JSON.stringify(o?.tarifa));
res = await plano('semZona'); o = comTransporte(res)[0];
ok('[plano] passa numa paragem sem zona certa: sem bilhete', o && !o.tarifa, JSON.stringify(o?.tarifa));
res = await plano('intercidades'); o = comTransporte(res)[0];
ok('[plano] Intercidades da CP: sem bilhete Andante', o && !o.tarifa, JSON.stringify(o?.tarifa));
res = await plano('regional'); o = comTransporte(res)[0];
ok('[plano] Regional da CP com zonas: Andante Z3', o?.tarifa?.zonas === 3, JSON.stringify(o?.tarifa));
res = await plano('outro'); o = comTransporte(res)[0];
ok('[plano] operador sem Andante: sem bilhete', o && !o.tarifa);
estado({ ...PRECOS, obtidos: new Date(Date.now() - 20 * 86400_000).toISOString() }, 'v2');
res = await plano('mesmaZona'); o = comTransporte(res)[0];
ok('[plano] preços lidos há 20 dias (site oficial em baixo): sem bilhete', o && !o.tarifa);
db.exec('DROP TABLE andante_dist; DROP TABLE andante_zona;');
estado(PRECOS, 'v3');
res = await plano('mesmaZona'); o = comTransporte(res)[0];
ok('[plano] base sem as tabelas do Andante (antiga): o planeador continua a responder, sem bilhete', o && !o.tarifa);

// ---------------------------------------------------------------- servidor a correr, dados reais
if (BASE) {
  // Campanhã (metro) → Trindade (metro), ambas na zona PRT1
  // às 10h do dia seguinte (de madrugada o metro não circula e o teste não teria o que verificar)
  const amanha = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(Date.now() + 86400_000);
  const u = `${BASE}/api/transit/plan-route?originLat=41.15054&originLon=-8.586245&destLat=41.15228&destLon=-8.609299&destName=Trindade&quando=${amanha}T10:00`;
  try {
    const rr = await fetch(u);
    const j = await rr.json();
    const op = (j.routes || []).filter((x) => (x.legs || []).some((l) => l.mode === 'TRANSIT'));
    const soMetro = op.filter((x) => x.legs.filter((l) => l.mode === 'TRANSIT').every((l) => l.transportMode === 'Metro'));
    console.log('NOTA  ', `${op.length} opções com transporte, ${soMetro.length} só de metro;`, soMetro.map((x) => `${x.legs.filter((l) => l.mode === 'TRANSIT').map((l) => l.lineCode).join('>')}: ${x.tarifa ? `Z${x.tarifa.zonas} ${x.tarifa.preco}€` : 'sem bilhete'}`).join(' | '));
    ok('[real] Campanhã → Trindade de metro: Andante Z2 ao preço oficial', soMetro.length > 0 && soMetro.every((x) => x.tarifa?.zonas === 2 && x.tarifa.preco > 0), `HTTP ${rr.status}`);
  } catch (e) {
    ok('[real] Campanhã → Trindade respondeu', false, String(e));
  }
}

console.log();
console.log(falhas ? `${falhas} falha(s)` : 'Tudo OK');
process.exit(falhas ? 1 : 0);
