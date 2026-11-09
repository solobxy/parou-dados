// Troços a pé pelas ruas: um quarteirão de 150 m entre a partida e a chegada. A linha reta atravessa os prédios; o caminho
// tem de dar a volta pelas ruas. Também: sem a tabela (base antiga) fica a linha reta; longe demais, também.
// Uso: APP=caminho-da-app tsx auditoria/caminho-a-pe.mjs   (precisa de python3 para fazer os mosaicos)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'parou-ape-'));
process.env.PAROU_DATA_DIR = dir;
const caminho = process.env.APP || '../app';
const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const B = await import(`${caminho}/src/server/db/gtfsDatabase.ts`);
const C = await import(`${caminho}/src/server/caminhoAPe.ts`);

let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };

// Quarteirão na Baixa: cantos a 150 m; ruas à volta e a continuar um pouco para fora
const LAT = 38.7100, LON = -9.1400;
const mLat = 111195, mLon = 111195 * Math.cos(LAT * Math.PI / 180);
const P = (n, e) => [LON + e / mLon, LAT + n / mLat]; // [lon, lat] a n metros a norte e e a este
const vias = [
  { highway: 'residential', c: [P(-40, 0), P(0, 0), P(150, 0), P(190, 0)] },       // rua do lado oeste
  { highway: 'residential', c: [P(-40, 150), P(0, 150), P(150, 150), P(190, 150)] }, // rua do lado este
  { highway: 'residential', c: [P(0, -40), P(0, 0), P(0, 150), P(0, 190)] },          // rua do lado sul
  { highway: 'footway', c: [P(150, -40), P(150, 0), P(150, 150), P(150, 190)] },     // passeio do lado norte
  { highway: 'motorway', c: [P(75, -40), P(75, 190)] },                                // autoestrada a atravessar: não é a pé
];
const geo = path.join(dir, 'vias.geojsonseq');
fs.writeFileSync(geo, vias.map((v) => JSON.stringify({ type: 'Feature', properties: { highway: v.highway }, geometry: { type: 'LineString', coordinates: v.c } })).join('\n') + '\n');
const sq = path.join(dir, 'caminhos.sqlite');
const saida = execFileSync('python3', [path.join(RAIZ, 'caminhos_a_pe.py'), geo, sq]).toString().trim();
console.log('mosaicos:', saida);

// partida a meio do lado oeste (fora do quarteirão), chegada a meio do lado este
const [aLon, aLat] = P(75, -10);
const [bLon, bLat] = P(75, 160);
ok('[base antiga] sem a tabela dos caminhos fica a linha reta (null)', C.caminhoAPe(aLat, aLon, bLat, bLon) === null);

// Junta os mosaicos à base da app
const db = B.getDatabase();
db.exec('CREATE TABLE IF NOT EXISTS ape (t INTEGER PRIMARY KEY, d BLOB NOT NULL)');
const fonte = new DatabaseSync(sq, { readOnly: true });
const ins = db.prepare('INSERT OR REPLACE INTO ape (t, d) VALUES (?, ?)');
for (const r of fonte.prepare('SELECT t, d FROM ape').all()) ins.run(r.t, r.d);
// (a app vê a tabela nova quando a base muda: abre-se outra vez)
const D2 = await import(`${caminho}/src/server/caminhoAPe.ts?nova`);
const r = D2.caminhoAPe(aLat, aLon, bLat, bLon);
const reta = Math.hypot((aLat - bLat) * mLat, (aLon - bLon) * mLon);
ok('[quarteirão] há caminho pelas ruas', !!r, r ? `${r.metros} m (reta ${Math.round(reta)} m)` : '');
if (r) {
  const dentro = r.pontos.filter((p) => {
    const n = (p.lat - LAT) * mLat, e = (p.lon - LON) * mLon;
    return n > 10 && n < 140 && e > 10 && e < 140;
  });
  ok('[quarteirão] nenhum ponto do caminho passa por dentro dos prédios', dentro.length === 0, JSON.stringify(dentro.slice(0, 3)));
  ok('[quarteirão] dá a volta (mais comprido do que a reta, mas sem voltas absurdas)', r.metros > reta * 1.3 && r.metros < reta * 2.5, `${r.metros} m`);
  ok('[quarteirão] começa na partida e acaba na chegada', Math.abs(r.pontos[0].lat - aLat) < 1e-7 && Math.abs(r.pontos[r.pontos.length - 1].lon - bLon) < 1e-7);
  ok('[quarteirão] não usa a autoestrada (atravessaria o quarteirão)', !r.pontos.some((p) => Math.abs((p.lat - LAT) * mLat - 75) < 3 && (p.lon - LON) * mLon > 20 && (p.lon - LON) * mLon < 130));
  ok('[quarteirão] vem codificado para a app', typeof r.caminho === 'string' && r.caminho.length > 4);
}
const [fLon, fLat] = P(4000, 0);
ok('[longe] mais de 3 km a pé não se calcula (fica a reta)', D2.caminhoAPe(aLat, aLon, fLat, fLon) === null);
const [lLon, lLat] = P(75, 900);
ok('[sem ruas] chegada longe de qualquer via fica a reta', D2.caminhoAPe(aLat, aLon, lLat, lLon) === null);

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo OK');
try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* sem importância */ }
process.exit(falhas ? 1 : 0);
