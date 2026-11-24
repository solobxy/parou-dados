// Teste de optimalidade do planeador ("Para onde vais?").
//
// Um segundo algoritmo, escrito à parte e sem usar o código do planeador (CSA por rondas, a ler a mesma base de horários),
// calcula a chegada mais cedo possível com as MESMAS regras do planeador: a pé a 75 m/min × 1,3 pelas ruas, até 900 m às
// paragens de autocarro e 1400 m às estações, transbordos a pé até 300 m (500 m se uma delas for estação) com 2 min de
// margem, até 4 viagens, e cada transbordo a mais tem de poupar 3 min (2.º) ou 5 min (3.º e 4.º). Depois pede ao planeador
// a mesma viagem e compara. Se o planeador chega mais tarde do que a referência permite, é uma falha (com o percurso que
// a referência encontrou, para se ver o que o planeador deixou escapar).
// A UNIR (sem horários na base) fica de fora dos dois lados.
//
// Uso (servidor a correr com a mesma base): DB=<gtfs.db> BASE=http://127.0.0.1:3000 [N=40] [DATA=2026-11-25] [SAIDA=res] node auditoria/planeador-otimo.mjs
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const DB = process.env.DB;
const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const N = Number(process.env.N || 40); // viagens por região e hora
const SAIDA = process.env.SAIDA || 'res';
fs.mkdirSync(SAIDA, { recursive: true });
if (!DB) { console.error('falta DB'); process.exit(2); }

// Dia: o DATA pedido ou amanhã (hora de Lisboa); se calhar ao fim de semana, a quarta-feira seguinte
function diaDeTeste() {
  if (process.env.DATA) return process.env.DATA;
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' });
  const d = new Date(Date.now() + 24 * 3600_000);
  for (let i = 0; i < 7; i++) {
    const x = new Date(d.getTime() + i * 24 * 3600_000);
    const dow = new Date(`${f.format(x)}T12:00:00Z`).getUTCDay();
    if (dow >= 1 && dow <= 5) return f.format(x);
  }
  return f.format(d);
}
const DATA = diaDeTeste();
const DOW = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date(`${DATA}T12:00:00Z`).getUTCDay()];
const DATA8 = DATA.replace(/-/g, '');
console.log(`Dia de teste: ${DATA} (${DOW})`);

const db = new DatabaseSync(DB, { readOnly: true });
// Metros a pé pelas ruas (rede do OpenStreetMap na base): os mesmos números que o planeador usa até às paragens.
// É só o dado de entrada; a procura do percurso é feita aqui, à parte.
const APP = process.env.APP;
let distanciasAPe = null;
if (APP) {
  process.env.PAROU_DATA_DIR = path.dirname(path.resolve(DB));
  try { ({ distanciasAPe } = await import(`${APP}/src/server/caminhoAPe.ts`)); } catch (e) { console.log('sem a rede a pé da app:', String(e).slice(0, 120)); }
}
const t0 = Date.now();

// ---------------------------------------------------------------- serviços do dia (calendar + calendar_dates)
const ativos = new Set();
for (const r of db.prepare(`SELECT feed_id f, service_id s FROM calendar WHERE ${DOW} = 1 AND start_date <= ? AND end_date >= ?`).iterate(DATA8, DATA8)) ativos.add(`${r.f}|${r.s}`);
for (const r of db.prepare('SELECT feed_id f, service_id s, exception_type e FROM calendar_dates WHERE date = ?').iterate(DATA8)) {
  if (Number(r.e) === 1) ativos.add(`${r.f}|${r.s}`); else ativos.delete(`${r.f}|${r.s}`);
}

// ---------------------------------------------------------------- paragens, classes, estações
const modoFeed = new Map(db.prepare('SELECT id, mode FROM feeds').all().map((r) => [r.id, String(r.mode || '').toLowerCase()]));
function classe(routeType, feed) {
  const t = routeType == null || routeType === '' ? NaN : Number(routeType);
  if (t === 0 || t === 1 || t === 5 || t === 7 || (t >= 400 && t < 500) || (t >= 900 && t < 1000)) return 1;
  if (t === 2 || (t >= 100 && t < 200)) return 2;
  if (t === 4 || (t >= 1000 && t < 1100)) return 3;
  const mf = modoFeed.get(feed) || '';
  if (/autocarro|trólecar/.test(mf)) return 0;
  if (mf.includes('metro')) return 1;
  if (mf.includes('comboio')) return 2;
  if (mf.includes('barco')) return 3;
  return 0;
}
const idx = new Map(), sId = [], sLat = [], sLon = [], sNome = [];
for (const r of db.prepare('SELECT stop_id, stop_name, stop_lat, stop_lon FROM stops WHERE COALESCE(location_type, 0) = 0 AND stop_lat IS NOT NULL').iterate()) {
  idx.set(r.stop_id, sId.length); sId.push(r.stop_id); sLat.push(r.stop_lat); sLon.push(r.stop_lon); sNome.push(r.stop_name);
}
const nS = sId.length;
const paraApp = (id) => (id.startsWith('cmh:') ? `cm:${id.slice(4)}` : id);

// ---------------------------------------------------------------- viagens do dia e ligações (paragem a paragem)
const rotas = new Map(db.prepare('SELECT route_id, route_type, route_short_name FROM routes').all().map((r) => [r.route_id, r]));
const viagens = []; // { id, feed, route, linha, classe }
const vIdx = new Map();
for (const r of db.prepare("SELECT trip_id, feed_id, route_id, service_id FROM trips WHERE feed_id != 'unir'").iterate()) {
  if (!ativos.has(`${r.feed_id}|${r.service_id}`)) continue;
  const ro = rotas.get(r.route_id);
  vIdx.set(r.trip_id, viagens.length);
  viagens.push({ id: r.trip_id, feed: r.feed_id, route: r.route_id, linha: ro?.route_short_name || r.route_id, classe: classe(ro?.route_type, r.feed_id) });
}
const estacao = new Uint8Array(nS);
const lig = []; // [de, para, parte, chega, viagem]
{
  let atual = null, prev = null;
  for (const r of db.prepare('SELECT trip_id, stop_id, arrival_secs a, departure_secs d FROM stop_times ORDER BY trip_id, stop_sequence').iterate()) {
    const v = vIdx.get(r.trip_id);
    if (v === undefined) continue;
    const s = idx.get(paraApp(r.stop_id));
    if (r.trip_id !== atual) { atual = r.trip_id; prev = null; }
    if (s === undefined) { prev = null; continue; }
    if (viagens[v].classe !== 0) estacao[s] = 1;
    const chega = r.a ?? r.d, parte = r.d ?? r.a;
    if (prev && chega != null && prev.parte != null && chega >= prev.parte) lig.push([prev.s, s, prev.parte, chega, v]);
    prev = { s, parte };
  }
}
lig.sort((a, b) => a[2] - b[2] || a[3] - b[3]);
const L = lig.length;
const cDe = new Int32Array(L), cPara = new Int32Array(L), cParte = new Int32Array(L), cChega = new Int32Array(L), cViagem = new Int32Array(L);
lig.forEach((c, i) => { cDe[i] = c[0]; cPara[i] = c[1]; cParte[i] = c[2]; cChega[i] = c[3]; cViagem[i] = c[4]; });
lig.length = 0;
console.log(`Referência: ${nS} paragens, ${viagens.length} viagens ativas, ${L} ligações (${Date.now() - t0} ms)`);

// ---------------------------------------------------------------- a pé
const DESVIO = 1.3, M_MIN = 75;
const minutosAPe = (m) => Math.max(1, Math.round((m * DESVIO) / M_MIN));
// O planeador conta cada minuto a pé acima de 8, até à 1.ª paragem e desde a última, a dobrar (prefere andar menos)
const custoAPe = (min) => (min + Math.max(0, min - 8)) * 60;
/** Minutos a pé até cada paragem: pelas ruas quando a rede o diz (como o planeador), senão em linha reta × 1,3 */
function minutosAte(lat, lon, lista) {
  const alvos = lista.filter(([, d]) => d >= 40 && d <= 1300);
  let reais = [];
  if (distanciasAPe && alvos.length) { try { reais = distanciasAPe(lat, lon, alvos.map(([s]) => ({ lat: sLat[s], lon: sLon[s] }))); } catch { reais = []; } }
  const real = new Map(alvos.map(([s, d], i) => [s, reais[i] == null ? null : Number.isFinite(reais[i]) ? reais[i] : d * 3 + 800]));
  return lista.map(([s, d]) => { const m = real.get(s); return [s, minutosAPe(m == null ? d : m / DESVIO)]; });
}
function distM(aLat, aLon, bLat, bLon) {
  const R = 6371000, p = Math.PI / 180;
  const x = Math.sin(((bLat - aLat) * p) / 2) ** 2 + Math.cos(aLat * p) * Math.cos(bLat * p) * Math.sin(((bLon - aLon) * p) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
const CEL = 0.01;
const grelha = new Map();
for (let s = 0; s < nS; s++) {
  const k = `${Math.floor(sLat[s] / CEL)}|${Math.floor(sLon[s] / CEL)}`;
  (grelha.get(k) || grelha.set(k, []).get(k)).push(s);
}
function perto(lat, lon, raio) {
  const out = [];
  const a = Math.floor(lat / CEL), b = Math.floor(lon / CEL), r = Math.ceil(raio / 800) + 1;
  for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
    for (const s of grelha.get(`${a + i}|${b + j}`) || []) { const d = distM(lat, lon, sLat[s], sLon[s]); if (d <= raio) out.push([s, d]); }
  }
  return out;
}
const vizinhos = new Map();
function viz(s) {
  let v = vizinhos.get(s);
  if (!v) {
    v = perto(sLat[s], sLon[s], 500).filter(([o, d]) => o !== s && d <= (estacao[s] || estacao[o] ? 500 : 300)).map(([o, d]) => [o, minutosAPe(d) * 60]);
    vizinhos.set(s, v);
  }
  return v;
}

// ---------------------------------------------------------------- referência: CSA por rondas (até 4 viagens)
const INF = 0x3fffffff;
const MARGEM = 120;
function referencia(oLat, oLon, dLat, dLon, partida) {
  // Custo de procura igual ao do planeador (a pé longo pesa mais); a hora real de chegada vem à parte
  const acesso = minutosAte(oLat, oLon, perto(oLat, oLon, 1400).filter(([s, d]) => d <= 900 || estacao[s]));
  const minSaida = new Map(minutosAte(dLat, dLon, perto(dLat, dLon, 1400).filter(([s, d]) => d <= 900 || estacao[s])));
  const saida = new Map([...minSaida].map(([s, m]) => [s, custoAPe(m)]));
  let ant = new Int32Array(nS).fill(INF);
  for (const [s, m] of acesso) ant[s] = Math.min(ant[s], partida + custoAPe(m));
  const rondas = [];
  const pais = [];
  const chegouTransito = new Int32Array(nS).fill(INF);
  let ini = 0, fim = L;
  { let lo = 0, hi = L; while (lo < hi) { const m = (lo + hi) >> 1; if (cParte[m] < partida) lo = m + 1; else hi = m; } ini = lo; }
  const limite = partida + 4 * 3600;
  { let lo = ini, hi = L; while (lo < hi) { const m = (lo + hi) >> 1; if (cParte[m] <= limite) lo = m + 1; else hi = m; } fim = lo; }
  for (let k = 1; k <= 4; k++) {
    const margem = k > 1 ? MARGEM : 0;
    const transito = new Int32Array(nS).fill(INF);
    const embarque = new Map(); // viagem -> índice da ligação onde se entrou
    const paiT = new Int32Array(nS).fill(-1); // ligação de chegada
    for (let c = ini; c < fim; c++) {
      const v = cViagem[c];
      if (!embarque.has(v)) {
        const a = ant[cDe[c]];
        if (a < INF && a + margem <= cParte[c]) embarque.set(v, c);
        else continue;
      }
      if (cChega[c] < transito[cPara[c]]) { transito[cPara[c]] = cChega[c]; paiT[cPara[c]] = c; embarque.get(v); paiEmb.set(`${k}|${cPara[c]}`, embarque.get(v)); }
    }
    const novo = Int32Array.from(ant);
    const paiP = new Int32Array(nS).fill(-1);
    for (let s = 0; s < nS; s++) {
      if (transito[s] >= INF) continue;
      if (transito[s] < novo[s]) { novo[s] = transito[s]; paiP[s] = -2; }
    }
    for (let s = 0; s < nS; s++) {
      if (transito[s] >= INF) continue;
      for (const [o, seg] of viz(s)) if (transito[s] + seg < novo[o]) { novo[o] = transito[s] + seg; paiP[o] = s; }
    }
    // chegada ao destino com até k viagens: como no planeador, só quem SAI do transporte numa paragem do destino
    // (sair noutra e ir a pé até uma do destino e daí ao destino não conta: o a pé é um só, da paragem onde se sai)
    for (let s = 0; s < nS; s++) if (transito[s] < chegouTransito[s]) chegouTransito[s] = transito[s];
    let melhor = INF, dMelhor = -1;
    for (const [s, seg] of saida) if (chegouTransito[s] < INF && chegouTransito[s] + seg < melhor) { melhor = chegouTransito[s] + seg; dMelhor = s; }
    rondas.push(melhor);
    pais.push({ transito, paiT, paiP, novo, dMelhor, ant });
    ant = novo;
  }
  // percurso da melhor ronda (para ver o que o planeador deixou escapar)
  const exigido = [0, 180, 300, 300];
  let limiteRef = INF, kRef = -1;
  rondas.forEach((r, i) => { if (r < INF && r + exigido[i] < limiteRef) { limiteRef = r + exigido[i]; kRef = i; } });
  const melhorAbs = Math.min(...rondas);
  const kMelhor = rondas.indexOf(melhorAbs);
  return { rondas, limiteRef, kRef, melhorAbs, percurso: kMelhor >= 0 && melhorAbs < INF ? reconstruir(pais, kMelhor) : [] };
}
const paiEmb = new Map();
function reconstruir(pais, k) {
  const pernas = [];
  let s = pais[k].dMelhor;
  for (let r = k; r >= 0 && s >= 0; r--) {
    const P = pais[r];
    if (P.paiP[s] === -1) { continue; } // veio de uma ronda anterior
    if (P.paiP[s] >= 0) { pernas.unshift(`a pé ${sNome[P.paiP[s]]} → ${sNome[s]}`); s = P.paiP[s]; }
    const c = P.paiT[s];
    if (c < 0) break;
    const e = paiEmb.get(`${r + 1}|${s}`);
    const v = viagens[cViagem[c]];
    pernas.unshift(`${v.feed} ${v.linha} ${e !== undefined ? sNome[cDe[e]] : '?'} ${hm(e !== undefined ? cParte[e] : 0)} → ${sNome[s]} ${hm(cChega[c])}`);
    s = e !== undefined ? cDe[e] : -1;
  }
  return pernas;
}
const hm = (t) => `${String(Math.floor(t / 3600)).padStart(2, '0')}:${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}`;
const seg = (txt, dia = 0) => { const [h, m] = String(txt || '').split(':').map(Number); return Number.isFinite(h) ? (h * 60 + m) * 60 + dia * 86400 : INF; };

// ---------------------------------------------------------------- viagens de teste
const REGIOES = [
  { nome: 'Lisboa', bbox: [38.68, -9.32, 38.82, -9.05] },
  { nome: 'Porto', bbox: [41.10, -8.70, 41.25, -8.52] },
  { nome: 'Coimbra', bbox: [40.17, -8.47, 40.23, -8.38] },
  { nome: 'Braga', bbox: [41.52, -8.46, 41.58, -8.38] },
  { nome: 'Funchal', bbox: [32.63, -16.97, 32.67, -16.86] },
  { nome: 'Faro', bbox: [37.00, -7.97, 37.04, -7.90] },
];
let semente = 20261125;
const aleat = () => { semente = (semente * 1103515245 + 12345) & 0x7fffffff; return semente / 0x7fffffff; };
const comLigacoes = new Uint8Array(nS);
for (let i = 0; i < L; i++) { comLigacoes[cDe[i]] = 1; comLigacoes[cPara[i]] = 1; }
function pontos(reg, n) {
  const [la0, lo0, la1, lo1] = reg.bbox;
  const cand = [];
  for (let s = 0; s < nS; s++) if (comLigacoes[s] && sLat[s] >= la0 && sLat[s] <= la1 && sLon[s] >= lo0 && sLon[s] <= lo1) cand.push(s);
  const pares = [];
  let tent = 0;
  while (pares.length < n && cand.length > 1 && tent++ < n * 50) {
    const a = cand[Math.floor(aleat() * cand.length)], b = cand[Math.floor(aleat() * cand.length)];
    const o = [sLat[a] + (aleat() - 0.5) * 0.003, sLon[a] + (aleat() - 0.5) * 0.004];
    const d = [sLat[b] + (aleat() - 0.5) * 0.003, sLon[b] + (aleat() - 0.5) * 0.004];
    const km = distM(o[0], o[1], d[0], d[1]) / 1000;
    if (km < 2 || km > 18) continue;
    pares.push({ o, d, km });
  }
  return pares;
}

let ip = 1;
async function planeador(o, d, hora) {
  const url = `${BASE}/api/transit/plan-route?originLat=${o[0]}&originLon=${o[1]}&destLat=${d[0]}&destLon=${d[1]}&quando=${DATA}T${hora}`;
  for (let tent = 0; tent < 3; tent++) {
    const r = await fetch(url, { headers: { 'x-forwarded-for': `198.18.${Math.floor(ip / 250)}.${(ip++ % 250) + 1}` }, signal: AbortSignal.timeout(60000) }).catch(() => null);
    if (r && r.ok) return r.json();
    await new Promise((res) => setTimeout(res, 2000));
  }
  return null;
}

const resultados = [];
const resumo = {};
for (const reg of REGIOES) {
  for (const hora of ['08:00', '17:30']) {
    const partida = seg(hora);
    for (const par of pontos(reg, N)) {
      const ref = referencia(par.o[0], par.o[1], par.d[0], par.d[1], partida);
      if (ref.limiteRef >= INF) continue; // sem transportes possíveis: nada a comparar
      const p = await planeador(par.o, par.d, hora);
      if (!p) { resultados.push({ reg: reg.nome, hora, ...par, erro: 'planeador não respondeu' }); continue; }
      // Mesmo custo do lado do planeador: chegada + o castigo do a pé longo na última perna (o da 1.ª perna só antecipa a hora
      // a que se pode apanhar o transporte, como na referência; não soma à chegada)
      const castigo = (r) => { const w = r.legs || []; const ul = w.length > 1 && w[w.length - 1].mode === 'WALK' ? w[w.length - 1].durationMinutes || 0 : 0; return Math.max(0, ul - 8) * 60; };
      const opcoes = (p.routes || []).filter((r) => (r.legs || []).some((l) => l.mode === 'TRANSIT')).map((r) => ({ chega: seg(r.arrivalTime, r.arrivalDayOffset || 0) + castigo(r), r }));
      const melhor = opcoes.length ? Math.min(...opcoes.map((x) => x.chega)) : INF;
      // o planeador arredonda ao minuto: 60 s de folga
      const atraso = melhor - ref.limiteRef;
      const falha = melhor >= INF || atraso > 60;
      const linha = {
        reg: reg.nome, hora, custo: true, km: +par.km.toFixed(1), o: par.o.map((x) => +x.toFixed(5)), d: par.d.map((x) => +x.toFixed(5)),
        planeador: melhor < INF ? hm(melhor) : 'sem opções', referencia: hm(ref.melhorAbs), permitido: hm(ref.limiteRef), // em «custo»: chegada + castigo do a pé longo
        atrasoMin: melhor < INF ? Math.round(atraso / 60) : null, falha,
        rondas: ref.rondas.map((r) => (r < INF ? hm(r) : '-')),
        percursoReferencia: ref.percurso,
        opcoesPlaneador: (p.routes || []).slice(0, 3).map((r) => `${r.departureTime}→${r.arrivalTime} ${r.legs.filter((l) => l.mode === 'TRANSIT').map((l) => `${l.transportMode} ${l.lineCode} ${l.fromStopName} ${l.departureTime}`).join(' + ')}`),
      };
      resultados.push(linha);
      const k = `${reg.nome} ${hora}`;
      resumo[k] = resumo[k] || { viagens: 0, falhas: 0, semOpcoes: 0, atrasos: [] };
      resumo[k].viagens++;
      if (falha) { resumo[k].falhas++; if (melhor >= INF) resumo[k].semOpcoes++; else resumo[k].atrasos.push(Math.round(atraso / 60)); }
    }
  }
}

let total = 0, falhas = 0;
console.log('\nRegião e hora          viagens  falhas  sem opções  atraso (min) das falhas');
for (const [k, r] of Object.entries(resumo)) {
  total += r.viagens; falhas += r.falhas;
  const at = r.atrasos.sort((a, b) => a - b);
  console.log(`${k.padEnd(22)} ${String(r.viagens).padStart(7)} ${String(r.falhas).padStart(7)} ${String(r.semOpcoes).padStart(11)}  ${at.length ? `mediana ${at[Math.floor(at.length / 2)]}, máx ${at[at.length - 1]}` : '-'}`);
}
const pct = total ? (100 * (total - falhas)) / total : 0;
console.log(`\nTOTAL: ${total} viagens, ${falhas} falhas — o planeador dá o melhor percurso (dentro das regras dele) em ${pct.toFixed(1)}%`);
fs.writeFileSync(`${SAIDA}/planeador-otimo.json`, JSON.stringify({ dia: DATA, total, falhas, resumo, resultados }, null, 1));
for (const r of resultados.filter((x) => x.falha).slice(0, 25)) {
  console.log(`\nFALHA ${r.reg} ${r.hora} ${r.km} km ${r.o} → ${r.d}: planeador ${r.planeador}, permitido ${r.permitido} (+${r.atrasoMin ?? '∞'} min)`);
  console.log('   referência:', r.percursoReferencia.join(' | '));
  console.log('   planeador: ', r.opcoesPlaneador.join(' || ') || '(nada)');
}
process.exit(0);
