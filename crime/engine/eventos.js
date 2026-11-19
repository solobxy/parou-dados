// v117: o calendário dos eventos do ano, em hora de Londres. As datas calculam-se para qualquer ano, sem ninguém ter de as escrever:
// a Páscoa pelo cálculo gregoriano, o Royal Ascot pela terceira terça-feira de junho, o Carnaval de Notting Hill pela última
// segunda-feira de agosto, a Oktoberfest pelo primeiro sábado depois de 15 de setembro, o Black Friday pela quarta quinta-feira de
// novembro. Mais ou menos um evento a cada seis a oito semanas; no máximo dois ao mesmo tempo (o Ano Novo Chinês às vezes apanha
// o Dia dos Namorados). O Ano Novo Lunar vem de uma tabela (confirmada em várias fontes) até 2042; depois
// disso calcula-se pela segunda lua nova depois do solstício de inverno (a regra do calendário chinês, certa quase todos os anos).
import { CFG, T } from './config.js';
import { lisbonToUtc, localParts } from './time.js';

const LUNAR = { 2025: [1, 29], 2026: [2, 17], 2027: [2, 6], 2028: [1, 26], 2029: [2, 13], 2030: [2, 3], 2031: [1, 23], 2032: [2, 11], 2033: [1, 31],
  2034: [2, 19], 2035: [2, 8], 2036: [1, 28], 2037: [2, 15], 2038: [2, 4], 2039: [1, 24], 2040: [2, 12], 2041: [2, 1], 2042: [1, 22] };

const day = (y, m, d) => { const t = new Date(Date.UTC(y, m - 1, d)); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }; };
const plus = (x, n) => day(x.y, x.m, x.d + n);
const wd = (x) => new Date(Date.UTC(x.y, x.m - 1, x.d)).getUTCDay();   // 0 = domingo

// Páscoa (algoritmo anónimo gregoriano)
export function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  return { y, m: Math.floor((h + l - 7 * m + 114) / 31), d: ((h + l - 7 * m + 114) % 31) + 1 };
}
// a lua nova número k desde a de 6 de janeiro de 2000 (Meeus, cap. 49, com as correções principais: erra poucos minutos).
// Contra a tabela de 2025 a 2042 só falha em 2034, um ano com mês intercalar (por isso a tabela manda enquanto chega).
const DEG = Math.PI / 180;
function newMoon(k) {
  const c = k / 1236.85, E = 1 - 0.002516 * c;
  const M = (2.5534 + 29.1053567 * k) * DEG, Mp = (201.5643 + 385.81693528 * k) * DEG, F = (160.7108 + 390.67050284 * k) * DEG, Om = (124.7746 - 1.56375588 * k) * DEG;
  const jde = 2451550.09766 + 29.530588861 * k + 0.00015437 * c * c
    - 0.4072 * Math.sin(Mp) + 0.17241 * E * Math.sin(M) + 0.01608 * Math.sin(2 * Mp) + 0.01039 * Math.sin(2 * F) + 0.00739 * E * Math.sin(Mp - M)
    - 0.00514 * E * Math.sin(Mp + M) + 0.00208 * E * E * Math.sin(2 * M) - 0.00111 * Math.sin(Mp - 2 * F) - 0.00057 * Math.sin(Mp + 2 * F)
    + 0.00056 * E * Math.sin(2 * Mp + M) - 0.00042 * Math.sin(3 * Mp) + 0.00042 * E * Math.sin(M + 2 * F) + 0.00038 * E * Math.sin(M - 2 * F)
    - 0.00024 * E * Math.sin(2 * Mp - M) - 0.00017 * Math.sin(Om);
  return (jde - 2440587.5) * T.DAY;
}
export function lunarNewYear(y) {
  if (LUNAR[y]) return { y, m: LUNAR[y][0], d: LUNAR[y][1] };
  const sol = Date.UTC(y - 1, 11, 21, 12);   // o solstício de inverno do ano anterior (perto o bastante)
  let k = Math.floor((sol - Date.UTC(2000, 0, 6, 18, 14)) / (29.530588861 * T.DAY)) - 1;
  while (newMoon(k) < sol) k++;
  const x = new Date(newMoon(k + 1) + 8 * T.HOUR);   // a segunda lua nova depois do solstício, na hora da China
  return { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate() };
}
// o primeiro dia e quantos dias dura cada evento, no ano y (o Ano Novo começa a 31 de dezembro de y)
export function eventDays(id, y) {
  switch (id) {
    case 'lunar': return { s: lunarNewYear(y), n: 5 };
    case 'namorados': return { s: day(y, 2, 13), n: 2 };
    case 'patrick': return { s: day(y, 3, 15), n: 3 };
    case 'pascoa': return { s: plus(easter(y), -2), n: 4 };      // de sexta-feira santa a segunda-feira de Páscoa
    case 'ascot': { let s = day(y, 6, 1); while (wd(s) !== 2) s = plus(s, 1); return { s: plus(s, 14), n: 5 }; }   // de terça a sábado
    case 'nottinghill': { let s = day(y, 8, 31); while (wd(s) !== 1) s = plus(s, -1); return { s: plus(s, -2), n: 3 }; }   // o fim de semana do feriado
    case 'oktober': { let s = day(y, 9, 16); while (wd(s) !== 6) s = plus(s, 1); return { s, n: 7 }; }   // a primeira semana
    case 'halloween': return { s: day(y, 10, 25), n: 9 };        // até ao Dia dos Mortos (2 de novembro)
    case 'bonfire': return { s: day(y, 11, 4), n: 3 };
    case 'blackfriday': { let s = day(y, 11, 1); while (wd(s) !== 4) s = plus(s, 1); return { s: plus(s, 22), n: 4 }; }   // até à Cyber Monday
    case 'natal': return { s: day(y, 12, 1), n: 26 };
    case 'anonovo': return { s: day(y, 12, 31), n: 2 };
  }
  return null;
}
const at = (x) => lisbonToUtc(x.y, x.m, x.d, 0);
// um evento num ano: a chave (id e ano), o início e o fim (fim exclusivo, à meia-noite de Londres)
export function eventIn(id, y) {
  const w = eventDays(id, y);
  if (!w) return null;
  const E = CFG.events.list.find((e) => e.id === id);
  const goals = CFG.events.goalsK.map((k) => Math.ceil((w.n * k * (E.goalsX || 10000)) / 100000));   // pela duração: dias × 1,5, × 3,5 e × 6
  return { id, key: id + '-' + y, start: at(w.s), end: at(plus(w.s, w.n)), days: w.n, fx: E.fx, goals };
}
// todos os eventos de um ano (guardados: contar as datas a cada golpe sairia caro)
const ANO = new Map();
function ofYear(y) {
  let L = ANO.get(y);
  if (!L) { L = CFG.events.list.map((E) => eventIn(E.id, y)).filter(Boolean); ANO.set(y, L); if (ANO.size > 8) ANO.delete(ANO.keys().next().value); }
  return L;
}
// os eventos a decorrer agora (podem ser dois: o Ano Novo Chinês às vezes apanha o Dia dos Namorados)
export function eventsAt(now) {
  const y = localParts(now).y;
  return [...ofYear(y - 1), ...ofYear(y)].filter((e) => e.start <= now && now < e.end).sort((a, b) => a.start - b.start);
}
// o próximo a começar
export function nextEvent(now) {
  const y = localParts(now).y;
  return [...ofYear(y), ...ofYear(y + 1)].filter((e) => e.start > now).sort((a, b) => a.start - b.start)[0] || null;
}
// v118: os que acabaram há menos de ms (o jornal ainda mostra a classificação final)
export function eventsEnded(now, ms) {
  const y = localParts(now).y;
  return [...ofYear(y - 1), ...ofYear(y)].filter((e) => e.end <= now && now - e.end < ms).sort((a, b) => b.end - a.end);
}
