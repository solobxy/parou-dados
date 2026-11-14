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

// (4) as contas batem certo: cada ação só mexe no dinheiro e no respeito o que a regra diz, e nada cria dinheiro do nada
const wealth = (q) => q.cash + q.bank;
const MAX_LOOT_BP = 10000 + CFG.mastery.bonusBp * CFG.mastery.at.length + Math.max(...CFG.classes.map((c) => c.lootBp || 0)) + Math.max(...CFG.drugs.flatMap((g) => (g.fx || []).filter((f) => f.k === 'loot').map((f) => f.bp)));
const MAX_PVP = Math.floor(((CFG.pvp.gainBase + CFG.levels.length) * 2 * (10000 + Math.max(...CFG.classes.map((c) => c.pvpBp || 0)))) / 10000);
function contas(kind, a0, a, d0, d, t, res, arg) {
  const dm = wealth(a) - wealth(a0), dr = a.respect - a0.respect;
  const bad = (m) => { console.error('CONTAS ERRADAS', kind, m, JSON.stringify(res), { dm, dr }); process.exit(1); };
  switch (kind) {
    case 'crime': {
      const c = CFG.crimes[arg];
      if (res.success) {
        if (dm !== res.money || res.money < c.min || res.money > Math.floor((c.max * MAX_LOOT_BP) / 10000) * CFG.crit.mult) bad('saque fora dos limites');
        if (dr !== c.r) bad('respeito do golpe');
      } else if (dm !== 0 || dr !== 0) bad('falhou mas mexeu');
      break;
    }
    case 'crimeAll': {
      const c = CFG.crimes[arg], maxOne = Math.floor((c.max * MAX_LOOT_BP) / 10000) * CFG.crit.mult;
      if (dm !== res.money || res.money > res.n * maxOne || (res.wins && res.money < res.wins * c.min)) bad('saque de vários golpes');
      if (dr !== res.wins * c.r || res.respect !== dr) bad('respeito de vários golpes');
      if (res.n < 1 || res.n > CFG.crimeAllMax || res.wins > res.n || res.crits > res.wins) bad('contagem');
      if (!res.levelUp && a.energy !== Math.min(CFG.energy.max, touched(a0, t).energy) - res.n * c.e) bad('stamina gasta');
      const budget = Math.min(CFG.crimeAllMax, Math.floor(Math.min(CFG.energy.max, touched(a0, t).energy) / c.e));
      if (!res.busted && res.n !== budget) bad('não fez os golpes que a stamina dava');
      if (res.busted && res.n > budget) bad('fez golpes a mais');
      if (a.c.crimes - a0.c.crimes !== res.n || a.c.wins - a0.c.wins !== res.wins) bad('contadores');
      break;
    }
    case 'deposit': if (dm !== -res.fee || res.fee < 1 || res.fee !== Math.ceil((arg * E.bankFeeBp(a)) / 10000) || dr) bad('taxa do banco'); break;
    case 'withdraw': case 'class': case 'avatar': if (dm !== 0 || dr !== 0) bad('devia ser neutro'); break;
    case 'claim': if (dm !== res.cash || dr !== 0) bad('prémio'); break;
    case 'collect': { const st = E.bizStored(a0, t).reduce((x, y) => x + y.money, 0); if (dm < 0 || dm > Math.ceil(st * 1.1) || dr !== 0) bad('recolha maior do que o armazém'); break; }
    case 'collectPort': {
      const due = a0.port.filter((c) => c.readyAt <= t).reduce((x, c) => x + c.amount + Math.floor((c.amount * CFG.port.gainBp) / 10000), 0);
      if (dm < 0 || dm > due || dr !== 0) bad('porto pagou a mais'); break;
    }
    case 'attack': {
      const max = Math.floor((d0.cash * CFG.pvp.mugBp) / 10000) + E.bizStored(d0, t).reduce((x, y, i) => x + (CFG.biz[i].raid ? Math.floor((y.money * CFG.pvp.mugBp) / 10000) : 0), 0);
      if (dm < 0 || dm > max || wealth(d) > wealth(d0) || d.bank !== d0.bank) bad('assalto');
      if (d0.cash - d.cash > dm) bad('o alvo perdeu mais do que o atacante ganhou');
      if (res.win && res.mode === 'mug' && dm !== res.money) bad('saque diferente do resultado');
      if (Math.abs(dr) > MAX_PVP || Math.abs(d.respect - d0.respect) > MAX_PVP) bad('respeito da luta fora dos limites');
      if (res.win && d.respect > d0.respect) bad('o alvo ganhou respeito ao perder');
      break;
    }
    case 'buyBiz': if (dm !== -res.price || dr !== CFG.biz[arg].resp) bad('negócio'); break;
    case 'luxury': if (dm !== -res.price || dr !== CFG.luxury.respect) bad('luxo'); break;
    case 'house': if (dm !== -res.price || dr !== res.respect) bad('casa'); break;
    default: if (dm > 0 || dr !== 0) bad('esta ação só devia gastar'); // discoteca, putas, hospital, treino, porto (envio), equipamento, melhorias
  }
  if (a.energy > CFG.energy.max || a.energy < 0) bad('energia');
}

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
  if (r.chance(2500)) { p.energy = r.int(0, CFG.energy.max); p.energyT = Math.min(p.energyT, p.t); } // gasta stamina para chegar à discoteca, às putas e ao hospital
  const before = touched(p, t), beforeD = touched(d, t), origD = structuredClone(d), origP = structuredClone(p);
  const kind = pick(['crime', 'crimeAll', 'drug', 'refill', 'detox', 'claim', 'class', 'avatar', 'hooker', 'cure', 'house', 'houseUp', 'train', 'buyBiz', 'collect', 'port', 'collectPort', 'deposit', 'withdraw', 'gear', 'attack', 'bail', 'medic', 'luxury']);
  let res, arg;
  try {
    switch (kind) {
      case 'crime': arg = r.chance(9000) ? r.int(0, 9) : anyInt(); res = E.doCrime(p, t, world, arg, game); break;
      case 'crimeAll': arg = r.chance(9000) ? r.int(0, 9) : anyInt(); res = E.doCrimeAll(p, t, world, arg, game); break;
      case 'drug': res = E.buyDrug(p, t, world, r.chance(9000) ? r.int(0, 8) : anyInt()); break;
      case 'refill': res = E.refill(p, t, world); break;
      case 'detox': res = E.detox(p, t, world); break;
      case 'claim': res = E.claimMission(p, t, world); break;
      case 'hooker': res = E.visitHooker(p, t, world, pick([0, 1, 2, 3, 4, 5, 6]), game); break;
      case 'cure': res = E.cure(p, t, world); break;
      case 'house': res = E.buyHouse(p, t, world); break;
      case 'houseUp': res = E.buyUpgrade(p, t, world, pick([0, 1, 2, 3, 4])); break;
      case 'class': res = E.setClass(p, t, world, pick([...CFG.classes.map((c) => c.id), 'x'])); break;
      case 'avatar': res = E.setAvatar(p, t, world, pick([0, 5, 31, 32, -1])); break;
      case 'train': res = E.train(p, t, world, pick(['F', 'T', 'I', 'C', 'X', ''])); break;
      case 'buyBiz': arg = r.chance(9000) ? r.int(0, 4) : anyInt(); res = E.buyBiz(p, t, world, arg); break;
      case 'collect': res = E.collectBiz(p, t, world, game); break;
      case 'port': res = E.sendPort(p, t, world, r.chance(8000) ? r.int(0, 300000) : anyInt()); break;
      case 'collectPort': res = E.collectPort(p, t, world, game); break;
      case 'deposit': arg = r.chance(8000) ? r.int(0, p.cash + 10) : anyInt(); res = E.deposit(p, t, world, arg); break;
      case 'withdraw': res = E.withdraw(p, t, world, r.chance(8000) ? r.int(0, p.bank + 10) : anyInt()); break;
      case 'gear': res = E.buyGear(p, t, world, pick(['weapon', 'armor', 'cash', 'stats', 'house']), r.chance(9000) ? r.int(-1, 6) : anyInt()); break;
      case 'attack': res = E.attack(p, d, t, world, pick(['beat', 'mug', 'x']), game); break;
      case 'bail': res = E.payBail(p, t, world); break;
      case 'medic': res = E.payMedic(p, t, world); break;
      case 'luxury': res = E.buyLuxury(p, t, world); break;
    }
    contas(kind, origP, p, origD, d, t, res, arg);
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
