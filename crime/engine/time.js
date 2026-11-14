// Calendário das rondas em hora de Lisboa (com mudança de hora tratada).

import { CFG } from './config.js';

const fmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: CFG.round.tz, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});

function parts(utcMs) {
  const o = {};
  for (const p of fmt.formatToParts(new Date(utcMs))) o[p.type] = p.value;
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour, mi: +o.minute, s: +o.second };
}

// diferença hora local - UTC, em ms
function offsetAt(utcMs) {
  const p = parts(utcMs);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - utcMs;
}

// hora local de Lisboa -> instante UTC (ms)
export function lisbonToUtc(y, m, d, h, mi = 0) {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let t = guess - offsetAt(guess);
  const off2 = offsetAt(t);
  t = guess - off2;
  const p = parts(t);
  if (p.h !== h || p.mi !== mi) throw new Error('LOCAL_TIME_INVALID'); // hora que não existe (salto de hora)
  return t;
}

export function localParts(utcMs) { return parts(utcMs); }

// soma dias a uma data de calendário (sem horas)
function addDays(y, m, d, n) {
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

// Ronda n a partir da primeira sexta-feira dada {y,m,d}.
export function roundAt(first, n) {
  const { playDays, totalDays, startHour } = CFG.round;
  const s = addDays(first.y, first.m, first.d, n * totalDays);
  const e = addDays(s.y, s.m, s.d, playDays);
  const nx = addDays(s.y, s.m, s.d, totalDays);
  return {
    n,
    start: lisbonToUtc(s.y, s.m, s.d, startHour),
    playEnd: lisbonToUtc(e.y, e.m, e.d, startHour),
    nextStart: lisbonToUtc(nx.y, nx.m, nx.d, startHour),
  };
}

// Em que ronda/fase estamos num instante.
export function phaseAt(first, utcMs) {
  const r0 = roundAt(first, 0);
  if (utcMs < r0.start) return { phase: 'before', round: r0 };
  let n = Math.floor((utcMs - r0.start) / (CFG.round.totalDays * 86_400_000));
  // corrige à volta da mudança de hora
  for (let k = Math.max(0, n - 1); k <= n + 1; k++) {
    const r = roundAt(first, k);
    if (utcMs >= r.start && utcMs < r.nextStart) {
      return { phase: utcMs < r.playEnd ? 'play' : 'pause', round: r };
    }
  }
  throw new Error('PHASE_NOT_FOUND');
}
