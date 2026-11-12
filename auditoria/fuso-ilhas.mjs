// Operadores novos entram sozinhos (Mobility Database) com ids como "mdb-1234". Um operador dos Açores (UTC-1)
// tem de contar as horas no fuso dos Açores, senão os autocarros aparecem uma hora mais cedo ou mais tarde.
// Monta uma base pequena com as funções da app. Uso: APP=caminho-da-app node --import tsx auditoria/fuso-ilhas.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'parou-fuso-'));
process.env.PAROU_DATA_DIR = dir; // tem de ser antes de importar a app
const caminho = process.env.APP || '../app';
const B = await import(`${caminho}/src/server/db/gtfsDatabase.ts`);
const D = await import(`${caminho}/src/server/dadosProntos.ts`);
let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };
const feeds = [
  ['mdb-9001', 37.7412, -25.6756], // Ponta Delgada
  ['mdb-9002', 38.6553, -27.2167], // Angra do Heroísmo
  ['mdb-9003', 32.6478, -16.9105], // Funchal
  ['mdb-9004', 38.7223, -9.1393], // Lisboa
];
for (const [id, lat, lon] of feeds) {
  B.upsertFeed({ id, operator_name: id, mode: 'Autocarro', feed_type: 'gtfs', source_origin: 'discovered', url: '', status: 'OK', progress: 'OK', lines_count: 1, stops_count: 2, trips_count: 1, realtime_entities: 'Nenhum' });
  B.batchInsertStops([
    { stop_id: `${id}:a`, feed_id: id, stop_name: 'A', stop_lat: lat, stop_lon: lon },
    { stop_id: `${id}:b`, feed_id: id, stop_name: 'B', stop_lat: lat + 0.01, stop_lon: lon + 0.01 },
  ]);
}
const z = D.getFeedTimezone;
ok('existe getFeedTimezone', typeof z === 'function');
ok('Ponta Delgada (mdb-9001) → Atlantic/Azores', z('mdb-9001') === 'Atlantic/Azores', z('mdb-9001'));
ok('Angra (mdb-9002) → Atlantic/Azores', z('mdb-9002') === 'Atlantic/Azores', z('mdb-9002'));
ok('Funchal (mdb-9003) → Europe/Lisbon (a Madeira tem a hora de Lisboa)', z('mdb-9003') === 'Europe/Lisbon', z('mdb-9003'));
ok('Lisboa (mdb-9004) → Europe/Lisbon', z('mdb-9004') === 'Europe/Lisbon', z('mdb-9004'));
ok('operador sem paragens → Europe/Lisbon', z('nao-existe') === 'Europe/Lisbon');
ok('ids antigos com "acores" continuam', z('transportes_acores') === 'Atlantic/Azores');
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTodos os testes OK');
process.exit(falhas ? 1 : 0);
