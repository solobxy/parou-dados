// Testa a pesquisa «Para onde vais?» com locais (OpenStreetMap) e paragens:
// - o local conhecido vem antes de outro pequeno com o mesmo nome (Colombo de Lisboa antes de uma rua «Colombo»);
// - entre iguais ganha o mais perto (o Continente da rua de quem procura);
// - quem escreve só o tipo ("praia") vê esse tipo primeiro; "colombo shopping" encontra o Centro Comercial Colombo;
// - o mesmo nome a poucos metros (um poste por sentido, vários operadores) é uma só sugestão;
// - sem a tabela de locais (base antiga) continua a dar as paragens;
// - «aeroporto ponta delgada», «continente maia»: o nome e a terra (sítio) em separado;
// - o aeroporto leva à porta (estação ou paragem «Aeroporto»), não ao meio das pistas onde o mapa o põe.
// Monta uma base pequena com as funções da própria app. Uso: APP=<pasta da app> tsx auditoria/pesquisa-locais.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'parou-locais-'));
process.env.PAROU_DATA_DIR = dir; // antes de importar a app
const APP = process.env.APP || '../parou';
const B = await import(`${APP}/src/server/db/gtfsDatabase.ts`);
const E = await import(`${APP}/src/server/pertoEngine.ts`);
const L = await import(`${APP}/src/server/pesquisaLocais.ts`);
let falhas = 0;
const ok = (n, c, e = '') => { if (!c) falhas++; console.log(c ? 'OK     ' : 'FALHOU ', n, e); };

B.getDatabase().exec('CREATE TABLE IF NOT EXISTS stop_routes (feed_id TEXT NOT NULL, stop_id TEXT NOT NULL, route_id TEXT NOT NULL, direction_id INTEGER DEFAULT 0, stop_sequence INTEGER, PRIMARY KEY (stop_id, route_id, direction_id))');
for (const f of [{ id: 'metro_t', nome: 'Metro T', mode: 'Metro' }, { id: 'bus_t', nome: 'Autocarros T', mode: 'Autocarro' }]) {
  B.upsertFeed({ id: f.id, operator_name: f.nome, mode: f.mode, feed_type: 'gtfs', source_origin: 'seed', url: '', status: 'OK', progress: 'OK', lines_count: 1, stops_count: 1, trips_count: 1, realtime_entities: 'Nenhum' });
}
B.batchInsertStops([
  { stop_id: 'bus_t:1', feed_id: 'bus_t', stop_name: 'Colombo', stop_lat: 33.07, stop_lon: -16.34 }, // Porto Santo
  { stop_id: 'bus_t:2', feed_id: 'bus_t', stop_name: 'Gare do Oriente', stop_lat: 38.7679, stop_lon: -9.0990 },
  { stop_id: 'bus_t:3', feed_id: 'bus_t', stop_name: 'Gare do Oriente', stop_lat: 38.7681, stop_lon: -9.0992 }, // outro sentido, 30 m
  { stop_id: 'metro_t:9', feed_id: 'metro_t', stop_name: 'Oriente', stop_lat: 38.7678, stop_lon: -9.0995 },
  { stop_id: 'bus_t:4', feed_id: 'bus_t', stop_name: 'Praia Nova', stop_lat: 38.70, stop_lon: -9.20 },
  // à porta do terminal de Lisboa: a estação de metro e uma paragem de autocarro (o ponto do mapa fica a ~1 km, nas pistas)
  { stop_id: 'metro_t:20', feed_id: 'metro_t', stop_name: 'Aeroporto', stop_lat: 38.7686, stop_lon: -9.1283 },
  { stop_id: 'bus_t:21', feed_id: 'bus_t', stop_name: 'Aeroporto (Partidas)', stop_lat: 38.7700, stop_lon: -9.1290 },
]);

const sugestoes = (q, lat, lon) => E.sugestoesLocais(q, lat, lon);
const titulos = (r) => r.map((x) => x.title);

// --- sem tabela de locais (base antiga): só paragens, sem erro
let r = await sugestoes('oriente');
ok('[sem locais] continua a dar as paragens', r.some((x) => x.title === 'Oriente'), JSON.stringify(titulos(r)));
const grupo = r.filter((x) => x.title === 'Gare do Oriente');
ok('[paragens] o mesmo nome a 30 m é uma só sugestão', grupo.length === 1, String(grupo.length));
ok('[paragens] a estação de metro vem antes da paragem de autocarro', titulos(r).indexOf('Oriente') < titulos(r).indexOf('Gare do Oriente'));
ok('[paragens] a estação traz o tipo e o operador', r.find((x) => x.title === 'Oriente')?.category === 'estacao' && /Metro T/.test(r.find((x) => x.title === 'Oriente')?.place || ''));

// --- tabela de locais como o parou-dados a grava (pela ordem de importância)
const db = B.getDatabase();
db.exec(`CREATE TABLE locais (id INTEGER PRIMARY KEY, nome TEXT NOT NULL, cat TEXT NOT NULL, sitio TEXT, lat REAL NOT NULL, lon REAL NOT NULL, imp REAL NOT NULL, alt TEXT);
  CREATE VIRTUAL TABLE locais_fts USING fts5(texto, content='', columnsize=0, detail='none', tokenize='unicode61 remove_diacritics 2');`);
const LOCAIS = [
  ['Aeroporto Humberto Delgado', 'aeroporto', 'Lisboa', 38.7756, -9.1354, 0.98, 'Aeroporto de Lisboa|Lisbon Airport'],
  ['Aeroporto Francisco Sá Carneiro', 'aeroporto', 'Maia', 41.2370, -8.6700, 0.98, 'Aeroporto do Porto'],
  ['Centro Comercial Colombo', 'centro_comercial', 'Carnide, Lisboa', 38.7549, -9.1888, 0.93, ''],
  ['Torre de Belém', 'atracao', 'Belém, Lisboa', 38.6916, -9.2160, 0.62, 'Tower of Belém'],
  ['Palácio Praia e Monforte', 'castelo', 'Rato, Lisboa', 38.7200, -9.1500, 0.70, ''],
  ['Praia de Algés', 'praia', 'Oeiras', 38.6950, -9.2370, 0.50, ''],
  ['Continente Colombo', 'supermercado', 'Carnide, Lisboa', 38.7550, -9.1880, 0.32, ''],
  ['Continente Bom Dia', 'supermercado', 'Arroios, Lisboa', 38.7260, -9.1350, 0.30, ''],
  ['Continente Bom Dia', 'supermercado', 'Bolhão, Porto', 41.1490, -8.6060, 0.30, ''],
  ['Rua Cristóvão Colombo', 'rua', 'Odivelas', 38.7900, -9.1800, 0.09, ''],
  ['Aeroporto João Paulo II', 'aeroporto', 'Ponta Delgada', 37.7427, -25.6997, 0.98, ''],
  ['Continente', 'supermercado', 'Travagem, Maia', 41.2200, -8.5620, 0.30, ''],
  ['Continente', 'supermercado', 'Odivelas', 38.7930, -9.1730, 0.30, ''],
];
const ins = db.prepare('INSERT INTO locais VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
const insF = db.prepare('INSERT INTO locais_fts (rowid, texto) VALUES (?, ?)');
LOCAIS.sort((a, b) => b[5] - a[5]).forEach((l, i) => {
  ins.run(i + 1, ...l);
  insF.run(i + 1, `${l[0]} ${l[6].replace(/\|/g, ' ')} ${L.celulaLocais(l[3], l[4])}`);
});
L._teste.limpar();

const LX = [38.7253, -9.15], PO = [41.15, -8.61];
r = await sugestoes('colombo');
ok('[importância] «colombo» sem localização: o centro comercial primeiro', r[0]?.title === 'Centro Comercial Colombo', JSON.stringify(titulos(r)));
ok('[importância] a paragem «Colombo» de Porto Santo fica depois', titulos(r).indexOf('Colombo') > 0);
r = await sugestoes('colombo', ...PO);
ok('[importância] «colombo» no Porto: o centro comercial continua primeiro', r[0]?.title === 'Centro Comercial Colombo', JSON.stringify(titulos(r)));
r = await sugestoes('colombo shopping', ...LX);
ok('[tipo] «colombo shopping» encontra o Centro Comercial Colombo', r[0]?.title === 'Centro Comercial Colombo', JSON.stringify(titulos(r)));
r = await sugestoes('continente', ...LX);
ok('[distância] «continente» em Lisboa: o mais perto primeiro', r[0]?.title === 'Continente Bom Dia' && r[0]?.place?.includes('Arroios'), JSON.stringify(r.slice(0, 3).map((x) => `${x.title} ${x.place}`)));
r = await sugestoes('continente', ...PO);
ok('[distância] «continente» no Porto: o do Porto primeiro', r[0]?.place?.includes('Porto'), JSON.stringify(r.slice(0, 3).map((x) => `${x.title} ${x.place}`)));
r = await sugestoes('aeroporto', ...PO);
ok('[distância] «aeroporto» no Porto: o do Porto primeiro', r[0]?.title === 'Aeroporto Francisco Sá Carneiro', JSON.stringify(titulos(r)));
r = await sugestoes('aeroporto', ...LX);
ok('[distância] «aeroporto» em Lisboa: o de Lisboa primeiro', r[0]?.title === 'Aeroporto Humberto Delgado', JSON.stringify(titulos(r)));
r = await sugestoes('torre de belem');
ok('[acentos] «torre de belem» sem acento encontra a Torre de Belém', r[0]?.title === 'Torre de Belém', JSON.stringify(titulos(r)));
r = await sugestoes('belem tower');
ok('[outros nomes] «belem tower» (nome inglês) encontra a Torre de Belém', r[0]?.title === 'Torre de Belém', JSON.stringify(titulos(r)));
r = await sugestoes('praia', ...LX);
ok('[tipo] «praia» perto do palácio Praia e Monforte: a praia vem primeiro', r[0]?.title === 'Praia de Algés', JSON.stringify(titulos(r)));
ok('[tipo] cada local traz o tipo para a app traduzir', r.find((x) => x.title === 'Praia de Algés')?.category === 'praia');
r = await sugestoes('aer', ...LX);
ok('[a escrever] «aer» já mostra o aeroporto', r[0]?.title === 'Aeroporto Humberto Delgado', JSON.stringify(titulos(r)));
r = await sugestoes('aeroporto ponta delgada');
ok('[terra] «aeroporto ponta delgada» encontra o aeroporto de Ponta Delgada', r[0]?.title === 'Aeroporto João Paulo II', JSON.stringify(titulos(r)));
r = await sugestoes('continente maia', ...LX);
ok('[terra] «continente maia» (em Lisboa) dá o Continente da Maia primeiro', r[0]?.place?.includes('Maia'), JSON.stringify(r.slice(0, 3).map((x) => `${x.title} ${x.place}`)));
r = await sugestoes('aeroporto', ...LX);
const aero = r.find((x) => x.title === 'Aeroporto Humberto Delgado');
const dPorta = aero ? Math.hypot((aero.latitude - 38.7686) * 111000, (aero.longitude + 9.1283) * 87000) : Infinity;
ok('[porta] o aeroporto de Lisboa leva à estação Aeroporto (à porta), não às pistas', dPorta < 50, `${Math.round(dPorta)} m`);
const t0 = Date.now();
for (let i = 0; i < 50; i++) await sugestoes(i % 2 ? 'continente' : 'colombo', ...LX);
ok('[rapidez] 50 pesquisas em menos de 1 s', Date.now() - t0 < 1000, `${Date.now() - t0} ms`);
ok('[robustez] aspas e símbolos não partem a pesquisa', Array.isArray(await sugestoes('"col" * ombo)(', ...LX)));

console.log(falhas ? `${falhas} testes falharam` : 'Todos os testes passaram');
process.exit(falhas ? 1 : 0);
