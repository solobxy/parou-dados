// Lista as viagens de autocarro que a app não consegue desenhar pela estrada: sem desenho nos horários, ou com um desenho
// oficial que não lhes serve (nem rodado, nem outro da mesma linha). Usa o próprio código da app (percursoDeViagem), para
// a decisão ser exatamente a mesma. O workflow «Estradas» desenha estas pelo mapa de estradas (OSRM).
// Uso: APP=<pasta da app> DB=<gtfs.db> SAIDA=precisam.json node --import tsx auditoria/desenhos-que-faltam.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const APP = process.env.APP || '../parou';
const DB = process.env.DB;
const SAIDA = process.env.SAIDA || 'precisam.json';
if (!DB) { console.error('falta DB'); process.exit(2); }
// A app abre a base na pasta dos dados: uma pasta temporária com uma ligação para a base (só leitura na prática)
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'parou-faltam-'));
fs.symlinkSync(path.resolve(DB), path.join(dir, 'gtfs.db'));
process.env.PAROU_DATA_DIR = dir;
const { getDatabase } = await import(`${APP}/src/server/db/gtfsDatabase.ts`);
const P = await import(`${APP}/src/server/percursoLinha.ts`);
const db = getDatabase();
const NAO_AUTOCARRO = new Set(['cp', 'fertagus', 'metro_lisboa', 'metro_porto', 'metro_mondego', 'mts', 'transtejo_soflusa', 'unir']);
const chave = (ids) => crypto.createHash('sha1').update(ids.join('|'), 'utf8').digest('hex').slice(0, 16);
const feeds = db.prepare('SELECT DISTINCT feed_id AS f FROM trips').all().map((x) => x.f).filter((f) => !NAO_AUTOCARRO.has(f));
const saida = { criado: new Date().toISOString(), feeds: [], viagens: [], desenhos_maus: [], por_feed: {} };
const maus = new Set();
for (const feed of feeds) {
  const linhas = db.prepare('SELECT t.trip_id AS t, t.shape_id AS s, st.stop_id AS p FROM trips t JOIN stop_times st ON st.trip_id = t.trip_id WHERE t.feed_id = ? ORDER BY t.trip_id, st.stop_sequence').iterate(feed);
  const padroes = new Map();
  let atual = null, forma = null, ids = [];
  const fecha = () => { if (atual && ids.length >= 2) { const k = `${forma || ''}|${chave(ids)}`; if (!padroes.has(k)) padroes.set(k, { trip: atual, forma, n: 0 }); padroes.get(k).n++; } };
  for (const r of linhas) { if (r.t !== atual) { fecha(); atual = r.t; forma = r.s; ids = []; } ids.push(r.p); }
  fecha();
  let faltam = 0, viagensFaltam = 0;
  for (const { trip, forma: f, n } of padroes.values()) {
    // Já desenhada pelas estradas numa semana anterior (osrm:…): continua na lista, senão o desenho perdia-se na semana seguinte
    if (f && f.startsWith('osrm:')) { faltam++; viagensFaltam += n; saida.viagens.push(trip); continue; }
    const p = P.percursoDeViagem(trip);
    if (p && p.caminho) continue;
    faltam++; viagensFaltam += n;
    saida.viagens.push(trip);
    if (f) maus.add(f);
  }
  saida.por_feed[feed] = { padroes: padroes.size, sem_desenho_bom: faltam, viagens: viagensFaltam };
  if (faltam) saida.feeds.push(feed);
  console.log(feed.padEnd(26), JSON.stringify(saida.por_feed[feed]));
}
// Os desenhos oficiais que já não serviam nas semanas anteriores (a base diária já os trocou, por isso não se veem aqui)
if (process.env.ANTERIOR && fs.existsSync(process.env.ANTERIOR)) {
  try {
    const zlib = await import('node:zlib');
    const ant = JSON.parse(zlib.gunzipSync(fs.readFileSync(process.env.ANTERIOR)).toString('utf8'));
    for (const m of ant.desenhos_maus || []) maus.add(m);
    for (const f of ant.autocarros || []) if (!saida.feeds.includes(f)) saida.feeds.push(f);
    console.log(`anterior: ${(ant.desenhos_maus || []).length} desenhos maus, ${(ant.autocarros || []).length} operadores`);
  } catch (e) { console.log('anterior ilegível:', String(e).slice(0, 100)); }
}
saida.desenhos_maus = [...maus].sort();
fs.writeFileSync(SAIDA, JSON.stringify(saida));
console.log(`${saida.viagens.length} sequências sem desenho bom em ${saida.feeds.length} operadores; ${saida.desenhos_maus.length} desenhos oficiais que não servem → ${SAIDA}`);
