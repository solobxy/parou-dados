// Ocorrências no sítio certo do mapa (26/11/2026: «há ocorrências fora do mapa, no meio do mar, que não fazem sentido»).
// Antes o mapa punha cada ocorrência no centro do distrito com um desvio ao acaso de 4 a 16 km (as de Setúbal caíam no mar
// da Caparica). Agora: coordenadas da fonte (Proteção Civil), senão a localidade escrita no concelho, senão o concelho;
// sem nada disso não vai para o mapa. Continente e ilhas.
// Uso: APP=<pasta da app> node --import tsx auditoria/ocorrencias-posicao.mjs
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
const APP = process.env.APP || '../parou';
process.env.PAROU_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ocorrencias-posicao-'));
let falhas = 0;
const ok = (n, c, e = '') => { if (!c) falhas++; console.log(c ? 'OK     ' : 'FALHOU ', n, e); };
const B = await import(path.join(APP, 'src/server/db/gtfsDatabase.ts'));
const db = B.getDatabase();
db.exec(`CREATE TABLE IF NOT EXISTS locais (id INTEGER PRIMARY KEY, nome TEXT, cat TEXT, sitio TEXT, lat REAL, lon REAL, imp REAL, alt TEXT);
  CREATE VIRTUAL TABLE IF NOT EXISTS locais_fts USING fts5(nome, content='locais', content_rowid='id');`);
const L = [
  ['Almada', 'cidade', '', 38.68313, -9.15763, 1], ['Costa da Caparica', 'cidade', 'Almada', 38.644517, -9.233607, 1],
  ['Almada', 'bairro', 'Mafra', 38.929839, -9.343373, 0.34], ['Figueira da Foz', 'cidade', '', 40.148581, -8.855655, 1],
  ['Buarcos', 'aldeia', 'Figueira da Foz', 40.16496, -8.875103, 0.56], ['São João', 'localidade', 'Ovar', 40.86, -8.62, 0.5],
  ['São João', 'localidade', 'Lajes do Pico', 38.40, -28.21, 0.3], ['Machico', 'cidade', '', 32.7168, -16.7666, 1],
];
L.forEach((l, i) => db.prepare('INSERT INTO locais (id, nome, cat, sitio, lat, lon, imp, alt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(i + 1, ...l, ''));
db.exec(`INSERT INTO locais_fts(locais_fts) VALUES('rebuild')`);
const P = await import(path.join(APP, 'src/server/comunidade/posicaoOcorrencia.ts'));

const anepc = P.posicaoDaOcorrencia({ latitude: 40.207937, longitude: -8.891904, concelho: 'Figueira da Foz', locationDetails: 'Quiaios' });
ok('Proteção Civil: as coordenadas da fonte (exatas)', anepc && anepc.lat === 40.207937 && !anepc.aproximada, JSON.stringify(anepc));
const buarcos = P.posicaoDaOcorrencia({ concelho: 'Figueira da Foz', locationDetails: 'Buarcos, Figueira da Foz' });
ok('sem coordenadas: a localidade escrita, dentro do concelho (Buarcos)', buarcos && Math.abs(buarcos.lat - 40.16496) < 1e-6 && buarcos.aproximada, JSON.stringify(buarcos));
const almada = P.posicaoDaOcorrencia({ district: 'Setúbal', concelho: 'Almada', locationDetails: '' });
ok('só o concelho: a sede (Almada cidade, não o bairro «Almada» em Mafra), em terra', almada && Math.abs(almada.lon - -9.15763) < 1e-6, JSON.stringify(almada));
const caparica = P.posicaoDaOcorrencia({ concelho: 'Almada', locationDetails: 'Costa da Caparica' });
ok('Costa da Caparica (Almada): a localidade, não o mar', caparica && caparica.lon > -9.24, JSON.stringify(caparica));
const pico = P.posicaoDaOcorrencia({ concelho: 'Lajes do Pico', locationDetails: 'Sao Joao' });
ok('Açores: «Sao Joao» sem acentos no concelho Lajes do Pico (não o São João de Ovar)', pico && pico.lon < -28, JSON.stringify(pico));
const machico = P.posicaoDaOcorrencia({ concelho: 'Machico' });
ok('Madeira: concelho de Machico', machico && machico.lat < 33, JSON.stringify(machico));
ok('nada que se encontre: fica fora do mapa (nada de posições inventadas)', P.posicaoDaOcorrencia({ district: 'Setúbal', concelho: 'Concelho Inexistente' }) === null);
ok('coordenadas fora de Portugal não contam', !P.dentroDePortugal(48.85, 2.35) && P.dentroDePortugal(38.72, -9.14) && P.dentroDePortugal(32.65, -16.9) && P.dentroDePortugal(37.74, -25.67));

// a lista de ocorrências da comunidade leva a posição
const C = await import(path.join(APP, 'src/server/comunidade/conteudo.ts'));
C.importarOcorrenciasPublicas([{ title: 'Despiste: Figueira da Foz, Buarcos', externalId: 'anepc-1', district: 'Coimbra', concelho: 'Figueira da Foz', locationDetails: 'Buarcos', latitude: 40.165, longitude: -8.876, severity: 'Moderada', type: 'ACIDENTE', sourceName: 'Proteção Civil' },
  { title: 'Obras na estrada', externalId: 'x-2', district: 'Setúbal', concelho: 'Almada', locationDetails: '', severity: 'Moderada', type: 'CORTE' }]);
const lista = C.listarOcorrencias(false);
const a = lista.find((o) => o.externalId === 'anepc-1'), b = lista.find((o) => o.externalId === 'x-2');
ok('lista: a da Proteção Civil com as coordenadas da fonte', a && a.latitude === 40.165 && !a.posicaoAproximada, JSON.stringify(a && [a.latitude, a.longitude]));
ok('lista: a sem coordenadas com a posição do concelho (aproximada)', b && Math.abs(b.latitude - 38.68313) < 1e-6 && b.posicaoAproximada === true, JSON.stringify(b && [b.latitude, b.longitude]));

// o mapa já não inventa posições
const mapa = fs.readFileSync(path.join(APP, 'src/components/PortugalMap.tsx'), 'utf8');
ok('mapa: nada de desvios ao acaso à volta do centro do distrito', !/radius = 0\.04 \+/.test(mapa) && /occ\.latitude/.test(mapa));

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo OK');
process.exit(falhas ? 1 : 0);
