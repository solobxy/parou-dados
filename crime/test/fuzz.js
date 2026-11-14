// Teste ao calhas: milhões de ações aleatórias (válidas e inválidas) em muitos jogadores.
// Verifica: (1) só há erros de regra (GameError), nunca falhas do código;
// (2) os invariantes valem sempre; (3) uma ação recusada não muda nada.
// Uso: node test/fuzz.js [ações] [semente]

import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { CFG, T } from '../engine/config.js';
import * as E from '../engine/engine.js';
import { seededRng } from '../engine/rng.js';

const ACTIONS = +(process.argv[2] ?? 1_000_000);
const r = seededRng(+(process.argv[3] ?? 7));
const game = seededRng(99);
const START = Date.UTC(2026, 10, 20, 21, 0);
const world = { start: START, playEnd: START + 13 * T.DAY };

const players = [];
let now = START;
for (let i = 0; i < 60; i++) players.push(E.newPlayer('f' + i, now, world));

const pick = (arr) => arr[r.int(0, arr.length - 1)];
const anyInt = () => pick([0, 1, -1, 100, 1e6, 2 ** 53, 0.5, NaN, r.int(0, 1e7)]);
const counts = {};
let refused = 0, done = 0, rounds = 1;

function touched(p, t) {
  const c = structuredClone(p);
  try { if (t >= world.start && t < world.playEnd) E.touch(c, t); } catch { /* tempo para trás */ }
  return c;
}

for (let n = 0; n < ACTIONS; n++) {
  // o tempo avança aos saltos (às vezes grandes), e por vezes tenta-se uma hora fora da ronda
  now += pick([0, 0, 1000, 3000, 3000, 60_000, 5 * 60_000, 30 * 60_000, T.HOUR]);
  if (now >= world.playEnd) { // nova ronda com jogadores novos
    now = START;
    players.length = 0;
    for (let i = 0; i < 60; i++) players.push(E.newPlayer('f' + i, now, world));
    rounds++;
  }
  let t = now;
  if (r.chance(50)) t = pick([world.playEnd, world.start - 1, world.playEnd + T.DAY, now - 1000]); // horas inválidas

  const p = pick(players);
  const d = pick(players);
  if (r.chance(200)) { p.cash += r.int(0, 5e6); } // dá dinheiro para chegar a tudo
  const before = touched(p, t), beforeD = touched(d, t), origD = structuredClone(d), origP = structuredClone(p);
  const kind = pick(['crime', 'drug', 'train', 'buyBiz', 'collect', 'port', 'collectPort', 'deposit', 'withdraw', 'gear', 'attack', 'bail', 'medic', 'luxury']);
  try {
    switch (kind) {
      case 'crime': E.doCrime(p, t, world, r.chance(9000) ? r.int(0, 9) : anyInt(), game); break;
      case 'drug': E.buyDrug(p, t, world, r.chance(9000) ? r.int(0, 4) : anyInt()); break;
      case 'train': E.train(p, t, world, pick(['F', 'T', 'I', 'C', 'X', ''])); break;
      case 'buyBiz': E.buyBiz(p, t, world, r.chance(9000) ? r.int(0, 4) : anyInt()); break;
      case 'collect': E.collectBiz(p, t, world, game); break;
      case 'port': E.sendPort(p, t, world, r.chance(8000) ? r.int(0, 300000) : anyInt()); break;
      case 'collectPort': E.collectPort(p, t, world, game); break;
      case 'deposit': E.deposit(p, t, world, r.chance(8000) ? r.int(0, p.cash + 10) : anyInt()); break;
      case 'withdraw': E.withdraw(p, t, world, r.chance(8000) ? r.int(0, p.bank + 10) : anyInt()); break;
      case 'gear': E.buyGear(p, t, world, pick(['weapon', 'armor']), r.chance(9000) ? r.int(-1, 6) : anyInt()); break;
      case 'attack': E.attack(p, d, t, world, pick(['beat', 'mug', 'x']), game); break;
      case 'bail': E.payBail(p, t, world); break;
      case 'medic': E.payMedic(p, t, world); break;
      case 'luxury': E.buyLuxury(p, t, world); break;
    }
    done++;
    counts[kind] = (counts[kind] || 0) + 1;
  } catch (e) {
    if (!(e instanceof E.GameError)) { console.error('FALHA DO CÓDIGO', kind, e); process.exit(1); }
    refused++;
    counts['x_' + e.code] = (counts['x_' + e.code] || 0) + 1;
    // ação recusada: o estado só pode ter mudado pela atualização normal do tempo
    // (ou nem isso, quando o pedido é recusado logo à entrada por argumentos inválidos)
    if (!isDeepStrictEqual(p, before) && !isDeepStrictEqual(p, origP)) { console.error('RECUSADA MAS MUDOU', kind, e.code); process.exit(1); }
    if (d !== p && !isDeepStrictEqual(d, beforeD) && !isDeepStrictEqual(d, origD)) { console.error('ALVO MUDOU', kind, e.code); process.exit(1); }
  }
  for (const q of [p, d]) {
    const bad = E.checkInvariants(q);
    if (bad.length) { console.error('INVARIANTE', kind, bad); process.exit(1); }
  }
}
console.log(JSON.stringify({ actions: ACTIONS, rounds, done, refused, counts }, null, 0));
