// Compara os percursos da PAROU com os de outro planeador, nas mesmas viagens e à mesma hora.
//
// Referência externa: Transitous (https://transitous.org), planeador aberto europeu (motor MOTIS, com os GTFS de Portugal que o
// projeto junta). O Google Maps só dá percursos por uma API paga com chave e o Moovit não tem API pública: ficam de fora.
// Para cada viagem: a chegada mais cedo de cada um (só percursos com transporte, a sair à hora pedida ou depois), os minutos a
// pé e os transbordos. Classes: PAROU melhor (chega 3+ min antes), empate (menos de 3 min), PAROU pior (chega 3+ min depois),
// só a PAROU tem percurso, só o outro tem, nenhum. As piores vão para o relatório com os dois percursos lado a lado.
//
// Uso: DB=gtfs.db BASE=http://127.0.0.1:3000 N=30 SAIDA=pasta node auditoria/comparar-planeadores.mjs
// Pede ao Transitous no máximo uma viagem a cada 1,5 s (uso moderado, como pede o projeto).
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const DB = process.env.DB, BASE = process.env.BASE || 'http://127.0.0.1:3000', N = Number(process.env.N || 30), SAIDA = process.env.SAIDA || '.';
const TRANSITOUS = process.env.TRANSITOUS || 'https://api.transitous.org/api/v5/plan';
const UA = 'PAROU.PT comparacao/1.0 (+https://parou.pt)';
const ESPACO_MS = Number(process.env.ESPACO_MS || 1500);
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- dia (próxima quarta-feira, a 2 ou mais dias) e fuso
function proximaQuarta() {
  const d = new Date(Date.now() + 2 * 86400_000);
  while (d.getUTCDay() !== 3) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
const DATA = process.env.DATA || proximaQuarta();
function desvioLisboa(dataIso) { // minutos à frente de UTC (0 no inverno, 60 no verão)
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', timeZoneName: 'longOffset' }).formatToParts(new Date(`${dataIso}T12:00:00Z`));
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(f.find((p) => p.type === 'timeZoneName')?.value || '');
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
}
const DESVIO = desvioLisboa(DATA);
const iso = (hora) => { const [h, m] = hora.split(':').map(Number); const t = Date.UTC(...DATA.split('-').map((x, i) => (i === 1 ? Number(x) - 1 : Number(x))), h, m) - DESVIO * 60_000; return new Date(t).toISOString(); };
/** minutos desde a meia-noite (hora de Lisboa) do dia pedido */
const minDe = (isoUtc) => Math.round((Date.parse(isoUtc) - Date.parse(`${DATA}T00:00:00Z`)) / 60_000 + DESVIO);
const hm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}${m >= 1440 ? '+1' : ''}`;

// ---------------------------------------------------------------- viagens de teste (paragens com serviço, 2 a 18 km)
const db = new DatabaseSync(DB, { readOnly: true });
const REGIOES = [
  { nome: 'Lisboa', bbox: [38.68, -9.32, 38.82, -9.05] },
  { nome: 'Porto', bbox: [41.10, -8.70, 41.25, -8.52] },
  { nome: 'Coimbra', bbox: [40.17, -8.47, 40.23, -8.38] },
  { nome: 'Braga', bbox: [41.52, -8.46, 41.58, -8.38] },
  { nome: 'Funchal', bbox: [32.63, -16.97, 32.67, -16.86] },
  { nome: 'Faro', bbox: [37.00, -7.97, 37.04, -7.90] },
];
const comServico = new Set();
for (const r of db.prepare("SELECT DISTINCT CASE WHEN stop_id LIKE 'cmh:%' THEN 'cm:' || substr(stop_id, 5) WHEN stop_id LIKE 'unirh:%' THEN 'unir:' || substr(stop_id, 7) ELSE stop_id END AS s FROM stop_times").iterate()) comServico.add(r.s);
const paragens = db.prepare('SELECT stop_id, stop_lat, stop_lon FROM stops WHERE stop_lat IS NOT NULL').all().filter((p) => comServico.has(p.stop_id));
function distM(a, b, c, d) { const R = 6371000, p = Math.PI / 180; const x = Math.sin(((c - a) * p) / 2) ** 2 + Math.cos(a * p) * Math.cos(c * p) * Math.sin(((d - b) * p) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); }
let semente = Number(process.env.SEMENTE || 20261125);
const aleat = () => { semente = (semente * 1103515245 + 12345) & 0x7fffffff; return semente / 0x7fffffff; };
function pares(reg, n) {
  const [la0, lo0, la1, lo1] = reg.bbox;
  const cand = paragens.filter((p) => p.stop_lat >= la0 && p.stop_lat <= la1 && p.stop_lon >= lo0 && p.stop_lon <= lo1);
  const out = [];
  for (let t = 0; out.length < n && cand.length > 1 && t < n * 50; t++) {
    const a = cand[Math.floor(aleat() * cand.length)], b = cand[Math.floor(aleat() * cand.length)];
    const o = [+(a.stop_lat + (aleat() - 0.5) * 0.003).toFixed(5), +(a.stop_lon + (aleat() - 0.5) * 0.004).toFixed(5)];
    const d = [+(b.stop_lat + (aleat() - 0.5) * 0.003).toFixed(5), +(b.stop_lon + (aleat() - 0.5) * 0.004).toFixed(5)];
    const km = distM(o[0], o[1], d[0], d[1]) / 1000;
    if (km >= 2 && km <= 18) out.push({ o, d, km: +km.toFixed(1) });
  }
  return out;
}

// ---------------------------------------------------------------- os dois planeadores
let ip = 1;
async function parou(o, d, hora) {
  const url = `${BASE}/api/transit/plan-route?originLat=${o[0]}&originLon=${o[1]}&destLat=${d[0]}&destLon=${d[1]}&quando=${DATA}T${hora}`;
  for (let t = 0; t < 3; t++) {
    const r = await fetch(url, { headers: { 'x-forwarded-for': `198.18.${Math.floor(ip / 250)}.${(ip++ % 250) + 1}` }, signal: AbortSignal.timeout(60000) }).catch(() => null);
    if (r && r.ok) {
      const j = await r.json();
      const ops = (j.routes || []).filter((x) => x.legs.some((l) => l.mode === 'TRANSIT')).map((x) => {
        const [h, m] = x.arrivalTime.split(':').map(Number), [h2, m2] = x.departureTime.split(':').map(Number);
        return {
          sai: (x.departureDayOffset || 0) * 1440 + h2 * 60 + m2, chega: (x.arrivalDayOffset || 0) * 1440 + h * 60 + m, aPe: x.walkingMinutes, trocas: x.transfersCount,
          linhas: x.legs.filter((l) => l.mode === 'TRANSIT').map((l) => `${l.lineCode}@${l.departureTime} ${l.fromStopName}`).join(' > '),
        };
      });
      return { ok: true, ops };
    }
    await dorme(2000);
  }
  return { ok: false, ops: [] };
}
let ultimoExterno = 0;
async function transitous(o, d, hora) {
  const espera = ultimoExterno + ESPACO_MS - Date.now();
  if (espera > 0) await dorme(espera);
  ultimoExterno = Date.now();
  const url = `${TRANSITOUS}?fromPlace=${o[0]},${o[1]}&toPlace=${d[0]},${d[1]}&time=${encodeURIComponent(iso(hora))}`;
  for (let t = 0; t < 2; t++) {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(30000) }).catch(() => null);
    if (r && r.ok) {
      const j = await r.json();
      const partida = minDe(iso(hora));
      const ops = (j.itineraries || []).filter((it) => it.legs.some((l) => l.mode !== 'WALK') && minDe(it.startTime) >= partida - 1).map((it) => ({
        sai: minDe(it.startTime), chega: minDe(it.endTime),
        aPe: Math.round(it.legs.filter((l) => l.mode === 'WALK').reduce((s, l) => s + (l.duration || 0), 0) / 60), trocas: it.transfers ?? Math.max(0, it.legs.filter((l) => l.mode !== 'WALK').length - 1),
        linhas: it.legs.filter((l) => l.mode !== 'WALK').map((l) => `${l.routeShortName || l.mode}@${minDe(l.startTime) >= 0 ? hm(minDe(l.startTime)) : '?'} ${l.from?.name || ''} [${l.agencyName || ''}]`).join(' > '),
        // troços com transporte: de onde, para onde e a que horas (para ver os transbordos)
        trocos: it.legs.filter((l) => l.mode !== 'WALK').map((l) => ({ de: [l.from?.lat, l.from?.lon], para: [l.to?.lat, l.to?.lon], sai: minDe(l.startTime), chega: minDe(l.endTime) })),
      }));
      return { ok: true, ops };
    }
    await dorme(3000);
  }
  return { ok: false, ops: [] };
}

// ---------------------------------------------------------------- causa provável de a PAROU chegar depois
// Regras da PAROU (planeadorIndice.ts): até 4 viagens (3 transbordos); num transbordo, 2 min de margem mais o caminho a pé
// (linha reta × 1,3 a 75 m/min, pelo menos 1 min; até 300 m, ou 500 m numa estação). O percurso do outro que não cabe nestas
// regras explica a diferença; se cabe, a diferença vem dos dados ou da pesquisa.
const MARGEM_PAROU = 2, RAIO_PAROU = 500;
function causaProvavel(P, T) {
  const tr = T.trocos || [];
  if (tr.length > 4) return 'mais de 3 transbordos';
  for (let i = 1; i < tr.length; i++) {
    const a = tr[i - 1], b = tr[i];
    if (!a.para?.[0] || !b.de?.[0]) continue;
    const m = distM(a.para[0], a.para[1], b.de[0], b.de[1]);
    if (m > RAIO_PAROU) return 'transbordo a pé mais longo do que a PAROU aceita';
    const precisa = MARGEM_PAROU + (m < 1 ? 0 : Math.max(1, Math.round((m * 1.3) / 75)));
    if (b.sai - a.chega < precisa) return `transbordo mais apertado (${b.sai - a.chega} min; a PAROU pede ${precisa})`;
  }
  if (P && T.aPe > P.aPe + 10) return 'anda muito mais a pé';
  return 'dados ou pesquisa';
}

// ---------------------------------------------------------------- comparação
const melhor = (ops) => (ops.length ? ops.reduce((a, b) => (b.chega < a.chega || (b.chega === a.chega && b.aPe < a.aPe) ? b : a)) : null);
const casos = [];
for (const reg of REGIOES) {
  for (const hora of ['08:00', '17:30']) {
    for (const par of pares(reg, N)) {
      const [p, t] = [await parou(par.o, par.d, hora), await transitous(par.o, par.d, hora)];
      if (!p.ok || !t.ok) { casos.push({ reg: reg.nome, hora, ...par, classe: 'erro', erro: !p.ok ? 'PAROU não respondeu' : 'Transitous não respondeu' }); continue; }
      const P = melhor(p.ops), T = melhor(t.ops);
      let classe;
      if (!P && !T) classe = 'nenhum';
      else if (!T) classe = 'so_parou';
      else if (!P) classe = 'so_outro';
      else classe = P.chega <= T.chega - 3 ? 'parou_melhor' : P.chega >= T.chega + 3 ? 'parou_pior' : 'empate';
      // o outro chega antes mas a andar muito mais ou com mais transbordos: diferença de "regras", não só de cálculo
      const esforco = classe === 'parou_pior' && (T.aPe > P.aPe + 10 || T.trocas > P.trocas + 1);
      casos.push({ reg: reg.nome, hora, ...par, classe, esforco, causa: classe === 'parou_pior' || classe === 'so_outro' ? causaProvavel(P, T) : undefined, difMin: P && T ? P.chega - T.chega : null, parou: P, outro: T });
    }
  }
}

// ---------------------------------------------------------------- relatório
const NOMES = { parou_melhor: 'PAROU melhor', empate: 'empate', parou_pior: 'PAROU pior', so_parou: 'só a PAROU', so_outro: 'só o Transitous', nenhum: 'nenhum', erro: 'erro' };
const contar = (lista) => { const c = {}; for (const x of lista) c[x.classe] = (c[x.classe] || 0) + 1; return c; };
const validos = casos.filter((c) => c.classe !== 'erro' && c.classe !== 'nenhum');
const pct = (n) => (validos.length ? `${((100 * n) / validos.length).toFixed(1)}%` : '-');
const c = contar(casos);
const linhas = [];
linhas.push(`Comparação PAROU × Transitous (MOTIS) — ${DATA} (quarta-feira), 08:00 e 17:30, ${casos.length} viagens (${validos.length} com percurso em pelo menos um)`);
linhas.push(`Chega 3+ min antes: PAROU ${c.parou_melhor || 0} (${pct(c.parou_melhor || 0)}) · empate ${c.empate || 0} (${pct(c.empate || 0)}) · Transitous ${c.parou_pior || 0} (${pct(c.parou_pior || 0)}; ${casos.filter((x) => x.esforco).length} delas a andar 10+ min a mais ou com mais transbordos)`);
linhas.push(`Só a PAROU tem percurso: ${c.so_parou || 0} · só o Transitous: ${c.so_outro || 0} · nenhum: ${c.nenhum || 0} · erros: ${c.erro || 0}`);
const ambos = casos.filter((x) => x.parou && x.outro);
if (ambos.length) {
  const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  linhas.push(`Mediana (viagens com os dois): diferença de chegada ${med(ambos.map((x) => x.difMin))} min (negativo = PAROU antes) · a pé PAROU ${med(ambos.map((x) => x.parou.aPe))} min vs ${med(ambos.map((x) => x.outro.aPe))} · transbordos ${med(ambos.map((x) => x.parou.trocas))} vs ${med(ambos.map((x) => x.outro.trocas))}`);
}
const causas = {};
for (const x of casos) if (x.causa) { const k = x.causa.replace(/ \(.*\)$/, ''); causas[k] = (causas[k] || 0) + 1; }
linhas.push(`Causa provável onde a PAROU perde: ${Object.entries(causas).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ') || '-'}`);
linhas.push('', 'Por região:');
for (const reg of REGIOES) {
  const r = casos.filter((x) => x.reg === reg.nome), rc = contar(r);
  linhas.push(`  ${reg.nome.padEnd(8)} ${r.length} viagens: ${Object.entries(rc).map(([k, v]) => `${NOMES[k]} ${v}`).join(' · ')}`);
}
const piores = casos.filter((x) => x.classe === 'parou_pior' || x.classe === 'so_outro').sort((a, b) => (b.difMin ?? 999) - (a.difMin ?? 999));
linhas.push('', `Onde a PAROU perde (${piores.length}), da maior diferença para a menor:`);
for (const x of piores) {
  linhas.push(`- [${x.reg} ${x.hora}] ${x.o.join(',')} → ${x.d.join(',')} (${x.km} km): ${x.classe === 'so_outro' ? 'PAROU sem percurso' : `+${x.difMin} min${x.esforco ? ' (o outro anda mais ou troca mais)' : ''}`} — ${x.causa}`);
  if (x.parou) linhas.push(`    PAROU      ${hm(x.parou.sai)}→${hm(x.parou.chega)} a pé ${x.parou.aPe} min, ${x.parou.trocas} transb.: ${x.parou.linhas}`);
  linhas.push(`    Transitous ${hm(x.outro.sai)}→${hm(x.outro.chega)} a pé ${x.outro.aPe} min, ${x.outro.trocas} transb.: ${x.outro.linhas}`);
}
const ganhas = casos.filter((x) => x.classe === 'parou_melhor' || x.classe === 'so_parou').sort((a, b) => (a.difMin ?? -999) - (b.difMin ?? -999)).slice(0, 15);
linhas.push('', 'Onde a PAROU ganha (15 maiores):');
for (const x of ganhas) {
  linhas.push(`- [${x.reg} ${x.hora}] ${x.km} km: ${x.classe === 'so_parou' ? 'Transitous sem percurso' : `${x.difMin} min`} | PAROU ${hm(x.parou.chega)} ${x.parou.linhas}${x.outro ? ` | Transitous ${hm(x.outro.chega)} ${x.outro.linhas}` : ''}`);
}
fs.mkdirSync(SAIDA, { recursive: true });
fs.writeFileSync(`${SAIDA}/resumo.txt`, linhas.join('\n') + '\n');
fs.writeFileSync(`${SAIDA}/casos.json`, JSON.stringify({ data: DATA, casos }, null, 1));
console.log(linhas.slice(0, 14).join('\n'));
