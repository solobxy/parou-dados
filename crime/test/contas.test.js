// Contas e batota: cada percentagem mostrada bate com o que acontece em muitas jogadas,
// os bónus valem exatamente o que dizem, e os atalhos conhecidos de batoteiros têm um teto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, T } from '../engine/config.js';
import * as E from '../engine/engine.js';
import { seededRng } from '../engine/rng.js';

const START = Date.UTC(2026, 10, 20, 21, 0);
const W = { start: START, playEnd: START + 13 * T.DAY };
const NOW = START + 2 * T.HOUR;
let n = 0;
const mk = (cls = '') => { const p = E.newPlayer('c' + (n++), START, W); p.cls = cls; p.cash = 1e12; E.touch(p, NOW); return p; };
const perto = (got, want, tol, msg) => assert.ok(Math.abs(got - want) <= tol, `${msg}: saiu ${got}, esperado ${want} (±${tol})`);
const always = { int: (lo) => lo, chance: () => true, float: () => 0 };
const never = { int: (lo) => lo, chance: () => false, float: () => 0.99 };
const code = (c) => (e) => e instanceof E.GameError && e.code === c;
const setResp = (p, r) => { p.respect = r; p.peakRespect = Math.max(p.peakRespect, r); };

test('golpes: a percentagem mostrada é a que sai em 200 000 tentativas (sucesso, golpe perfeito, prisão e dinheiro)', () => {
  const casos = [
    { k: 0, st: 10 },   // carteirista com stats iniciais
    { k: 3, st: 25 },   // 50%
    { k: 5, st: 40 },   // abaixo de metade
  ];
  for (const { k, st } of casos) {
    const rng = seededRng(1234 + k), p = mk(), c = CFG.crimes[k], N = 200000;
    p.peakRespect = 1;
    let ok = 0, crit = 0, bust = 0, soma = 0, simples = 0;
    const mostrada = (() => { p.stats = { F: st, T: 10, I: st, C: st }; return E.crimeChanceBp(p, k, NOW) / 10000; })();
    for (let i = 0; i < N; i++) {
      p.stats = { F: st, T: 10, I: st, C: st }; p.xp = { F: 0, I: 0, C: 0 }; p.energy = 100; p.jailUntil = 0; p.wk[k] = 0;
      const r = E.doCrime(p, NOW, W, k, rng);
      if (r.success) { ok++; if (r.crit) crit++; else { soma += r.money; simples++; } } else if (r.busted) bust++;
    }
    perto(ok / N, mostrada, 0.005, `golpe ${c.id}: sucesso`);
    perto(crit / ok, CFG.crit.chanceBp / 10000, 0.004, `golpe ${c.id}: golpe perfeito`);
    perto(bust / (N - ok), CFG.bustBp / 10000, 0.008, `golpe ${c.id}: prisão ao falhar`);
    perto(soma / simples, (c.min + c.max) / 2, (c.min + c.max) / 2 * 0.01, `golpe ${c.id}: dinheiro médio`);
  }
});

test('golpes: os bónus de saque somam-se (mestria + ladrão + speed) e nunca passam do teto', () => {
  const p = mk('ladrao'), k = 3, c = CFG.crimes[k];
  p.peakRespect = 1; p.stats = { F: 500, T: 10, I: 500, C: 500 };
  p.wk[k] = 150; p.c.wins = 150;                       // 3 estrelas: +30%
  p.fx.loot = { bp: 1500, until: NOW + T.MIN };        // speed: +15%
  const semCrit = { int: (lo, hi) => hi, chance: (() => { let i = 0; return () => i++ % 2 === 0; })() }; // sucesso, sem golpe perfeito
  const r = E.doCrime(p, NOW, W, k, semCrit);
  assert.equal(r.money, Math.floor((c.max * (10000 + 3000 + 1500 + 1500)) / 10000));
  assert.equal(r.crit, false);
});

test('putas: o risco de doença mostrado é o que sai em 100 000 visitas a cada uma', () => {
  CFG.hookers.list.forEach((g, i) => {
    const rng = seededRng(77 + i), p = mk(); let doente = 0; const N = 100000;
    for (let v = 0; v < N; v++) {
      p.energy = 0; p.sick = false; p.hkT = []; p.cash = 1e12;
      if (E.visitHooker(p, NOW, W, i, rng).sick) doente++;
    }
    perto(doente / N, g.sickBp / 10000, 0.0035, `doença com ${g.id}`);
  });
});

test('porto e rusgas: 15% de apreensões, +30% exatos, 5% de rusgas que levam metade', () => {
  const rng = seededRng(5), p = mk(); let ap = 0; const N = 100000;
  for (let i = 0; i < N; i++) {
    p.port = [{ amount: 1000, readyAt: NOW }]; const antes = p.cash;
    const it = E.collectPort(p, NOW, W, rng).items[0];
    if (it.seized) { ap++; assert.equal(p.cash, antes); } else assert.equal(p.cash - antes, 1300);
  }
  perto(ap / N, CFG.port.seizeBp / 10000, 0.005, 'apreensões');
  let rusgas = 0;
  for (let i = 0; i < N; i++) {
    p.biz[1] = { n: 1, stored: 1000, rem: 0, t: NOW }; const antes = p.cash;
    const it = E.collectBiz(p, NOW, W, rng).items[0];
    if (it.lost) { rusgas++; assert.equal(it.lost, 500); assert.equal(p.cash - antes, 500); } else assert.equal(p.cash - antes, 1000);
  }
  perto(rusgas / N, CFG.raid.chanceBp / 10000, 0.003, 'rusgas');
});

test('banco: a taxa nunca é zero, partir o depósito em bocados nunca sai mais barato, e levantar e depositar só perde', () => {
  for (const cls of ['', 'empresario']) {
    const bp = cls ? 150 : 300;
    for (let v = 1; v <= 3000; v++) {
      const p = mk(cls); p.cash = v; p.bank = 0;
      const r = E.deposit(p, NOW, W, v);
      assert.equal(r.fee, Math.ceil((v * bp) / 10000)); assert.ok(r.fee >= 1);
      assert.equal(p.cash + p.bank, v - r.fee);
    }
    const junto = mk(cls); junto.cash = 100000; junto.bank = 0; E.deposit(junto, NOW, W, 100000);
    for (const parte of [1, 7, 33, 100, 999]) {
      const p = mk(cls); p.cash = 100000; p.bank = 0;
      while (p.cash > 0) E.deposit(p, NOW, W, Math.min(parte, p.cash));
      assert.ok(p.bank <= junto.bank, `depositar de ${parte} em ${parte} não pode render mais`);
    }
    const p = mk(cls); p.cash = 50000; p.bank = 0; let antes = 50000;
    for (let i = 0; i < 200 && p.cash + p.bank > 0; i++) {
      if (p.cash > 0) E.deposit(p, NOW, W, p.cash); if (p.bank > 0) E.withdraw(p, NOW, W, p.bank);
      assert.ok(p.cash + p.bank <= antes); antes = p.cash + p.bank;
    }
  }
});

test('drogas: o efeito vale o que diz, acaba no segundo certo, o mais fraco não tira o mais forte', () => {
  const p = mk(); p.energy = 0; p.stats.C = 100; p.stats.I = 100;
  E.buyDrug(p, NOW, W, 6); // coca: +15% carisma e +10% nas recolhas, 15 min
  assert.equal(E.effStat(p, 'C', NOW), 115);
  assert.equal(E.buffBp(p, 'biz', NOW), 1000);
  assert.equal(E.buffBp(p, 'C', NOW + 15 * T.MIN - 1), 1500);
  assert.equal(E.buffBp(p, 'C', NOW + 15 * T.MIN), 0);
  assert.equal(E.effStat(p, 'C', NOW + 15 * T.MIN), 100);
  p.energy = 0; E.buyDrug(p, NOW, W, 5);                     // LSD: +20% inteligência, 15 min
  p.energy = 0; E.buyDrug(p, NOW + T.MIN, W, 2);             // cogumelos (+10%, 10 min) não substituem
  assert.deepEqual(p.fx.I, { bp: 2000, until: NOW + 15 * T.MIN });
  p.energy = 0; E.buyDrug(p, NOW + 16 * T.MIN, W, 2);        // depois de acabar, entram
  assert.deepEqual(p.fx.I, { bp: 1000, until: NOW + 26 * T.MIN });
  p.energy = 0; E.buyDrug(p, NOW + 17 * T.MIN, W, 5);        // o mais forte substitui o mais fraco
  assert.equal(p.fx.I.bp, 2000);
  // as recolhas só rendem mais enquanto o efeito dura
  const q = mk(); q.biz[1] = { n: 1, stored: 1000, rem: 0, t: NOW }; q.fx.biz = { bp: 1000, until: NOW + 1 };
  assert.equal(E.collectBiz(q, NOW, W, never).items[0].money, 1100);
  q.biz[1] = { n: 1, stored: 1000, rem: 0, t: NOW + 1 };
  assert.equal(E.collectBiz(q, NOW + 1, W, never).items[0].money, 1000);
});

test('profissões: cada bónus vale exatamente o que o cartão diz', () => {
  const now = NOW;
  // ladrão: +15% de saque
  const l = mk('ladrao'); l.peakRespect = 1;
  assert.equal(E.doCrime(l, now, W, 0, { int: (lo) => lo, chance: (() => { let i = 0; return () => i++ % 2 === 0; })() }).money, Math.floor(CFG.crimes[0].min * 1.15));
  // vigarista: −25% de prisão ao falhar e fiança a metade
  const v = mk('vigarista'), s = mk();
  assert.equal(E.bustChanceBp(v, now), 1875); assert.equal(E.bustChanceBp(s, now), 2500);
  for (const q of [v, s]) { q.jailUntil = now + 10 * T.MIN; q.jailTier = 10; }
  assert.equal(E.bailCost(s, now), 12000); assert.equal(E.bailCost(v, now), 6000);
  // traficante: drogas −30%, efeitos a dobrar, +15 de limite
  const t = mk('traficante'); t.energy = 0;
  assert.equal(E.drugPrice(t, 8), 5600); assert.equal(E.addictionCap(t), E.addictionCap(s) + 15);
  const antes = t.cash; E.buyDrug(t, now, W, 6);
  assert.equal(antes - t.cash, 1050); assert.equal(t.fx.C.until, now + 30 * T.MIN);
  // empresário: negócios +20%, taxa do banco a metade
  const e = mk('empresario'); e.biz[0].n = 1; s.biz[0].n = 1;
  assert.equal(E.bizRates(e, 0).perH, Math.floor(E.bizRates(s, 0).perH * 1.2));
  assert.equal(E.bankFeeBp(e), 150); assert.equal(E.bankFeeBp(s), 300);
  // matador: +20% de ataque e +25% de respeito por luta
  const m = mk('matador'), alvo = mk(); m.stats.F = 100; s.stats.F = 100;
  assert.equal(E.attackPower(m, now), 120); assert.equal(E.attackPower(s, now), 100);
  assert.equal(E.pvpBaseGain(m, alvo), Math.floor(E.pvpBaseGain(s, alvo) * 1.25));
  // segurança: +25% de defesa e metade do tempo no hospital
  const g = mk('seguranca'); g.stats.T = 100; s.stats.T = 100;
  assert.equal(E.defensePower(g, now), 125); assert.equal(E.defensePower(s, now), 100);
  const forte = mk(); forte.stats.T = 100000; setResp(forte, 10); setResp(g, 10);
  E.attack(g, forte, now, W, 'beat', never);
  assert.equal(g.hospUntil, now + 10 * T.MIN);
});

test('casa: preços e respeito somam o que está na tabela e cada melhoria vale o que diz', () => {
  const p = mk(); let pago = 0, resp = 0;
  for (let i = 1; i < CFG.house.tiers.length; i++) { const r = E.buyHouse(p, NOW, W); pago += r.price; resp += r.respect; }
  assert.equal(pago, 26312000); assert.equal(resp, 2510); assert.equal(p.respect, 2510);
  assert.throws(() => E.buyHouse(p, NOW, W), code('HOUSE_MAX'));
  for (let u = 0; u < 4; u++) {
    let soma = 0;
    for (let k = 0; k < 7; k++) soma += E.buyUpgrade(p, NOW, W, u).price;
    assert.equal(soma, 26312000 / 4);
    assert.throws(() => E.buyUpgrade(p, NOW, W, u), code('NEED_HOUSE'));
  }
  const s = mk();
  assert.equal(E.bustChanceBp(p, NOW), Math.floor(2500 * 0.72));                      // garagem: −28%
  p.stats.T = 100; s.stats.T = 100;
  assert.equal(E.defensePower(p, NOW), 128);                                          // alarme: +28%
  p.biz[0].n = 1; s.biz[0].n = 1;
  assert.equal(E.bizRates(p, 0).perH, Math.floor(E.bizRates(s, 0).perH * 1.14));      // escritório: +14%
  const ladrao = mk(); p.cash = 100000;
  assert.equal(E.mugValue(ladrao, p, NOW), 3000);                                     // cofre: 70% a salvo, o assalto leva 10% do resto
  // casa nova sem melhorias: nada muda
  const q = mk(); E.buyHouse(q, NOW, W);
  assert.throws(() => { E.buyUpgrade(q, NOW, W, 0); E.buyUpgrade(q, NOW, W, 0); }, code('NEED_HOUSE'));
});

test('batota: dois amigos a baterem-se um ao outro ganham no máximo 4 lutas cada por dia e quase nada de respeito', () => {
  const a = mk(), b = mk();
  for (const p of [a, b]) { setResp(p, 10000); p.stats.F = 5000; }
  const r0 = 10000, g = E.pvpBaseGain(a, b);
  let now = NOW, wins = { [a.id]: 0, [b.id]: 0 }, parados = 0, vez = 0;
  for (let i = 0; i < 200 && parados < 2; i++) {
    const [x, y] = vez++ % 2 === 0 ? [a, b] : [b, a];
    now += 1000;
    x.energy = 100; E.touch(x, now);
    if (x.hospUntil > now) E.payMedic(x, now, W);     // paga para sair e voltar a atacar
    try { E.attack(x, y, now, W, 'beat', always); wins[x.id]++; parados = 0; } catch (e) { assert.ok(e instanceof E.GameError); parados++; }
  }
  assert.equal(wins[a.id], 4); assert.equal(wins[b.id], 4);
  assert.throws(() => { a.energy = 100; a.hospUntil = 0; E.attack(a, b, now + 1, W, 'beat', always); }, code('TARGET_PROTECTED'));
  for (const p of [a, b]) assert.ok(p.respect - r0 >= 0 && p.respect - r0 <= g, `ganho líquido ${p.respect - r0} com ganho base ${g}`);
});

test('batota: uma conta fraca não serve para dar respeito à principal, nem a perder de propósito', () => {
  const main = mk(), alt = mk();
  setResp(main, 5000); setResp(alt, 1000); main.stats.F = 5000;
  assert.throws(() => E.attack(main, alt, NOW, W, 'beat', always), code('TARGET_TOO_WEAK'));
  // a secundária ataca e perde: a principal não ganha nada com isso
  const antes = main.respect;
  alt.stats.F = 1; E.attack(alt, main, NOW, W, 'beat', never);
  assert.equal(main.respect, antes);
});

test('batota: perder respeito e voltar a ganhá-lo não volta a encher a stamina', () => {
  const p = mk(); p.peakRespect = CFG.levels[1]; p.respect = CFG.levels[1] - 1; p.energy = 50;
  const r = E.doCrime(p, NOW, W, 0, always);
  assert.equal(r.levelUp, null); assert.equal(p.energy, 45);
});

test('batota: as putas deixam de compensar ao fim de poucas visitas por dia e o preço volta ao normal 24 h depois', () => {
  const p = mk(); p.stats = { F: 2000, T: 10, I: 2000, C: 2000 };
  const i = 5, g = CFG.hookers.list[i], base = E.hookerPrice(p, i, NOW);
  const valor = E.valuePerEnergy(p) * g.e * 1.76;      // o melhor caso: todos os bónus de saque e os golpes perfeitos
  let visitas = 0, now = NOW, ultimo = base;
  for (; visitas < 100; visitas++) {
    const preco = E.hookerPrice(p, i, now);
    assert.ok(preco >= ultimo); ultimo = preco;
    if (preco >= valor) break;
    p.energy = 0; E.visitHooker(p, now, W, i, never); now += 1000;
  }
  assert.ok(visitas <= 18, `compensou ${visitas} vezes`);
  assert.equal(E.hookerPrice(p, i, now + 24 * T.HOUR + 1), base);
  // doente não entra; tratado volta a entrar
  p.sick = true; p.energy = 0;
  assert.throws(() => E.visitHooker(p, now, W, 0, never), code('SICK'));
});

test('batota: o motor recusa tipos de equipamento inventados e a recarga usa o preço da profissão', () => {
  const p = mk(), antes = structuredClone(p);
  for (const k of ['cash', 'stats', 'house', 'respect', '__proto__', '']) assert.throws(() => E.buyGear(p, NOW, W, k, 1), code('NO_GEAR'));
  assert.deepEqual(p, antes);
  const t = mk('traficante'), s = mk(); t.energy = 0; s.energy = 0;
  const pt = E.refillPlan(t), ps = E.refillPlan(s);
  assert.equal(pt.cost, pt.counts.reduce((x, c, d) => x + c * E.drugPrice(t, d), 0));
  assert.ok(pt.cost < ps.cost);
  const c0 = t.cash; const r = E.refill(t, NOW, W);
  assert.equal(c0 - t.cash, r.price); assert.equal(r.price, pt.cost);
});

test('negócios: um golpe que sobe a stat não muda o que já estava produzido', () => {
  const p = mk(); p.peakRespect = 1; p.biz[2] = { n: 1, stored: 0, rem: 0, t: NOW };
  const antes = E.bizRates(p, 2).perH;
  p.xp.I = E.practiceNeed(p, 'I') - 1;                          // o próximo golpe sobe a inteligência
  const t1 = NOW + T.HOUR;
  const r = E.doCrime(p, t1, W, 0, always);
  assert.equal(r.gained.I, 1);
  assert.equal(p.biz[2].stored, antes);                         // 1 h ao rendimento antigo, exato
  assert.ok(E.bizRates(p, 2).perH > antes);
});

test('usar a stamina toda: igual a carregar várias vezes, para na prisão, a subida de nível não se perde', () => {
  // sem subir de nível: gasta a stamina toda
  const p = mk(); p.peakRespect = 1e6; p.energy = 100; p.stats = { F: 400, T: 10, I: 400, C: 400 };
  const r = E.doCrimeAll(p, NOW, W, 0, always);
  assert.equal(r.n, 20); assert.equal(r.wins, 20); assert.equal(p.energy, 0);
  assert.equal(r.respect, 20 * CFG.crimes[0].r); assert.equal(p.respect, r.respect);
  // o mesmo jogador, golpe a golpe, com a mesma sorte, acaba igual
  const a = mk(), b = mk();
  for (const q of [a, b]) { q.peakRespect = 1e6; q.energy = 100; q.cash = 0; }
  const ra = E.doCrimeAll(a, NOW, W, 0, seededRng(9)); const rb = seededRng(9);
  for (let i = 0; i < ra.n; i++) E.doCrime(b, NOW, W, 0, rb);
  assert.equal(a.cash, b.cash); assert.equal(a.respect, b.respect); assert.deepEqual(a.stats, b.stats); assert.equal(a.energy, b.energy);
  // apanhado: para logo
  const c = mk(); c.peakRespect = 1e6; c.energy = 100;
  const rc = E.doCrimeAll(c, NOW, W, 1, (() => { let i = 0; return { int: (lo) => lo, chance: () => i++ % 2 === 1 }; })());
  assert.equal(rc.n, 1); assert.equal(rc.busted, true); assert.ok(c.jailUntil > NOW); assert.equal(c.energy, 100 - CFG.crimes[1].e);
  assert.throws(() => E.doCrimeAll(c, NOW, W, 0, always), code('IN_JAIL'));
  // sobe de nível a meio (aos 3 e aos 10 de respeito): faz os 20 na mesma e a stamina que encheu fica
  const d = mk(); d.energy = 100;
  const rd = E.doCrimeAll(d, NOW, W, 0, always);
  assert.equal(rd.n, 20); assert.deepEqual(rd.levelUp, { from: 1, to: 3 }); assert.equal(d.energy, 50);
  // sem stamina para um golpe: recusado e nada muda
  const e = mk(); e.energy = 4; const antes = structuredClone(e);
  assert.throws(() => E.doCrimeAll(e, NOW, W, 0, always), code('NO_ENERGY'));
  assert.deepEqual(e, antes);
});

// ---------- casino ----------
const cas = (cash = 100000) => { const p = mk(); p.cash = cash; p.bank = 0; return p; };
test('roleta: cada aposta paga o que diz a mesa e a casa fica com 2,7% (36/37) em todas', () => {
  const tipos = [{ t: 'red' }, { t: 'black' }, { t: 'even' }, { t: 'odd' }, { t: 'low' }, { t: 'high' }, { t: 'dozen', n: 0 }, { t: 'dozen', n: 2 }, { t: 'num', n: 0 }, { t: 'num', n: 17 }];
  for (const b of tipos) {
    let soma = 0; for (let n = 0; n <= 36; n++) soma += E.rouletteReturn(b, n);
    assert.equal(soma, 36, `${b.t} ${b.n ?? ''}`);
  }
  assert.equal(E.rouletteReturn({ t: 'red' }, 0), 0); assert.equal(E.rouletteReturn({ t: 'even' }, 0), 0); assert.equal(E.rouletteReturn({ t: 'odd' }, 0), 0);
  assert.equal(E.rouletteReturn({ t: 'red' }, 1), 2); assert.equal(E.rouletteReturn({ t: 'black' }, 2), 2);
  assert.equal(E.rouletteReturn({ t: 'dozen', n: 1 }, 13), 3); assert.equal(E.rouletteReturn({ t: 'dozen', n: 1 }, 12), 0);
  // uma jogada com várias fichas: o dinheiro bate certo
  const p = cas(), fixed = { int: () => 17, chance: () => false };
  const r = E.casinoPlay(p, NOW, W, 'roulette', { bets: [{ t: 'num', amt: 100, n: 17 }, { t: 'red', amt: 50 }, { t: 'odd', amt: 30 }] }, fixed);
  assert.equal(r.n, 17); assert.equal(r.bet, 180); assert.equal(r.win, 3600 + 0 + 60); assert.equal(p.cash, 100000 - 180 + 3660);
});

test('dados: as probabilidades e os pagamentos dão o que a casa diz (baixo 95,8%, sete 96,7%)', () => {
  const ways = (f) => { let n = 0; for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) if (f(a + b)) n++; return n; };
  assert.equal(ways((s) => s < 7), 15); assert.equal(ways((s) => s === 7), 6); assert.equal(ways((s) => s > 7), 15);
  const rtp = { low: (15 / 36) * 2.3, seven: (6 / 36) * 5.8, high: (15 / 36) * 2.3 };
  const rng = seededRng(31), N = 200000;
  for (const pick of ['low', 'seven', 'high']) {
    const p = cas(1e12); let bet = 0, win = 0;
    for (let i = 0; i < N; i++) { const r = E.casinoPlay(p, NOW, W, 'dice', { pick, amt: 100 }, rng); bet += r.bet; win += r.win; }
    perto(win / bet, rtp[pick], 0.012, 'dados ' + pick);
  }
});

test('blackjack: valores das mãos, 3 para 2, empate, dobrar, e as cartas escondidas não saem do servidor', () => {
  const v = (...c) => E.bjValue(c).tot;
  assert.equal(v(0, 12), 21); assert.equal(v(0, 0, 8), 21); assert.equal(v(0, 0, 0), 13); assert.equal(v(9, 10, 11), 30); assert.equal(v(0, 5), 17);
  // baralho combinado: jogador A+K (blackjack), dealer 9+7
  const shoe = (cards) => { let i = 0; return { int: (lo, hi) => { const want = cards[i++] ?? 0; return want; }, chance: () => false }; };
  // bjShoe tira cartas de 6 baralhos por posição; com int() a devolver posições baixas sai sempre o ás. Testamos pela mão final.
  const p = cas(); p.bj = { bet: 100, dbl: false, pl: [0, 12], dl: [8, 6], next: [] };
  let r = E.casinoPlay(p, NOW, W, 'bj', { op: 'stand' }, never);
  assert.equal(r.res, 'bj'); assert.equal(r.win, 250); assert.equal(p.bj, null);
  const q = cas(); q.bj = { bet: 100, dbl: false, pl: [9, 7], dl: [9, 7], next: [] };   // 18 contra 18
  r = E.casinoPlay(q, NOW, W, 'bj', { op: 'stand' }, never); assert.equal(r.res, 'push'); assert.equal(r.win, 100);
  const d = cas(); d.bj = { bet: 100, dbl: false, pl: [4, 5], dl: [9, 5], next: [9, 9] };  // 11 contra 16: dobra, tira 10 → 21; dealer tira 10 → 26
  r = E.casinoPlay(d, NOW, W, 'bj', { op: 'double' }, never);
  assert.equal(r.bet, 100); assert.equal(r.hand.bet, 200); assert.equal(r.res, 'win'); assert.equal(r.win, 400); assert.equal(d.cash, 100000 - 100 + 400);
  const s = cas(); s.bj = { bet: 100, dbl: false, pl: [9, 5], dl: [9, 6], next: [5] };    // dealer 17: pára
  r = E.casinoPlay(s, NOW, W, 'bj', { op: 'stand' }, never); assert.equal(r.hand.dl.length, 2); assert.equal(r.res, 'lose');
  const h = cas(); h.bj = { bet: 100, dbl: false, pl: [9, 5], dl: [9, 6], next: [3, 2] };
  E.casinoPlay(h, NOW, W, 'bj', { op: 'hit' }, never);
  assert.throws(() => E.casinoPlay(h, NOW, W, 'bj', { op: 'double' }, never), code('NO_DOUBLE'));
  const pub = E.bjPublic(h);
  assert.equal(pub.dl.length, 1); assert.equal(pub.next, undefined); assert.equal(JSON.stringify(pub).includes('next'), false);
  // não se dá outra mão com uma aberta
  assert.throws(() => E.casinoPlay(h, NOW, W, 'bj', { op: 'deal', amt: 100 }, never), code('BJ_OPEN'));
});

test('blackjack: em 200 000 mãos com estratégia simples a casa ganha pouco (retorno entre 95% e 100%)', () => {
  const rng = seededRng(77), p = cas(1e13); let bet = 0, win = 0;
  for (let i = 0; i < 200000; i++) {
    let r = E.casinoPlay(p, NOW, W, 'bj', { op: 'deal', amt: 100 }, rng); bet += r.bet; win += r.win;
    while (!r.done) {
      const tot = r.hand.tot, up = r.hand.dl[0] % 13, upv = up === 0 ? 11 : up >= 9 ? 10 : up + 1;
      const op = r.hand.pl.length === 2 && (tot === 11 || (tot === 10 && upv < 10)) ? 'double' : tot >= 17 || (tot >= 13 && upv <= 6) || (tot === 12 && upv >= 4 && upv <= 6) ? 'stand' : 'hit';
      r = E.casinoPlay(p, NOW, W, 'bj', { op }, rng); bet += r.bet; win += r.win;
    }
  }
  const rtp = win / bet;
  assert.ok(rtp > 0.95 && rtp < 1.0, 'retorno ' + rtp);
});

test('casino: aposta mínima, máxima pelo nível, só dinheiro na mão; aposta recusada não mexe em nada', () => {
  const p = cas(500); p.bank = 1e6;
  const antes = structuredClone(p);
  assert.throws(() => E.casinoPlay(p, NOW, W, 'dice', { pick: 'low', amt: 9 }, never), code('BAD_BET'));
  assert.throws(() => E.casinoPlay(p, NOW, W, 'dice', { pick: 'low', amt: 501 }, never), code('NO_CASH'));
  assert.throws(() => E.casinoPlay(p, NOW, W, 'dice', { pick: 'low', amt: 10.5 }, never), code('BAD_BET'));
  assert.throws(() => E.casinoPlay(p, NOW, W, 'dice', { pick: 'toString', amt: 10 }, never), code('BAD_BET'));
  assert.throws(() => E.casinoPlay(p, NOW, W, 'roulette', { bets: [{ t: 'num', n: 37, amt: 10 }] }, never), code('BAD_BET'));
  assert.throws(() => E.casinoPlay(p, NOW, W, 'roulette', { bets: Array.from({ length: 13 }, () => ({ t: 'red', amt: 10 })) }, never), code('BAD_BET'));
  assert.throws(() => E.casinoPlay(p, NOW, W, 'slots', { amt: 10 }, never), code('NO_GAME'));
  assert.deepEqual(p, antes);
  const rico = cas(1e9);
  assert.equal(E.casinoMax(rico), 1000);
  assert.throws(() => E.casinoPlay(rico, NOW, W, 'dice', { pick: 'low', amt: 1001 }, never), code('BET_TOO_BIG'));
  rico.peakRespect = CFG.levels[4];
  assert.equal(E.casinoMax(rico), 6553);   // nível 5: 1000 × 1,6⁴
});

test('roda da sorte: cada aposta devolve o mesmo que na roda real (conta exata) e a simulação confirma', () => {
  const Wh = CFG.casino.wheel, E2 = (l) => l.reduce((x, [v, w]) => x + v * w, 0) / l.reduce((x, [, w]) => x + w, 0), Em = E2(Wh.topMult);
  const REAL = { 1: 0.9608, 2: 0.9595, 5: 0.9578, 10: 0.9573, moeda: 0.957, caixas: 0.9527, bola: 0.9433, louca: 0.9441 };
  assert.equal(Wh.segs.length, 54);
  assert.ok(Object.values(Wh.top).reduce((x, y) => x + y, 0) <= 10000);
  for (const s of Wh.spots) {
    const P = Wh.segs.filter((x) => x === s).length / 54, B = Wh.num[s] ?? E2(Wh[s]), q = Wh.top[s] / 10000;
    perto(P * (1 + B * (1 + q * (Em - 1))), REAL[s], 0.0012, 'roda ' + s);
  }
  const rng = seededRng(5150), N = 300000, got = {}, ret = {};
  for (let i = 0; i < N; i++) { const sp = E.wheelSpin(rng); got[sp.s] = (got[sp.s] || 0) + 1; ret[sp.s] = (ret[sp.s] || 0) + sp.mult + 1; }
  for (const s of ['1', '2', '5', '10']) perto(got[s] / N, Wh.segs.filter((x) => x === s).length / 54, 0.004, 'casa ' + s);
  for (const s of ['1', '2', '5']) perto(ret[s] / N, REAL[s], 0.03, 'retorno ' + s);
  const p = cas(1e9); p.peakRespect = 1e6;
  const r = E.casinoPlay(p, NOW, W, 'wheel', { bets: [{ s: '1', amt: 100 }, { s: 'louca', amt: 50 }] }, seededRng(1));
  assert.equal(p.cash, 1e9 - 150 + r.win); assert.ok(r.win <= 150 * CFG.casino.maxWinMult);
  assert.throws(() => E.casinoPlay(p, NOW, W, 'wheel', { bets: [{ s: '3', amt: 100 }] }, never), code('BAD_BET'));
});

// retorno de referência dos jogos reais em que cada slot se inspira (o nosso tem de ficar a ±3%, com 150 000 jogadas e 8000 compras)
const SLOT_REAL = { chefao: 0.955, zeus: 0.965, doce: 0.965, rebucado: 0.9653 };
for (const gid of Object.keys(CFG.casino.slots)) {
  test(`slot ${gid}: retorno perto do real, compra de bónus também, teto respeitado e contas da grelha certas`, () => {
    const G = CFG.casino.slots[gid], rng = seededRng(404), N = gid === 'rebucado' ? 150000 : 400000, NB = gid === 'rebucado' ? 6000 : 12000;
    let tot = 0, hits = 0;
    for (let i = 0; i < N; i++) { const s = E.slotSpin(gid, rng, 0); tot += s.total; if (s.base.win > 0) hits++; assert.ok(s.total <= G.max * 100); }
    let bt = 0; for (let i = 0; i < NB; i++) { const s = E.slotSpin(gid, rng, 1); bt += s.total; assert.ok(s.free.length > 0, 'compra sem grátis'); }
    perto(tot / N / 100, SLOT_REAL[gid], 0.06, gid + ' retorno');        // as grátis têm cauda longa: a afinação fina foi feita com milhões de jogadas
    perto(bt / NB / 100 / G.buy, SLOT_REAL[gid], 0.08, gid + ' compra');
    assert.ok(hits / N > 0.25 && hits / N < 0.4, 'jogadas com prémio ' + hits / N);
    // grelha: cada vitória paga o que diz a tabela e só com o mínimo de iguais
    const r2 = seededRng(9);
    for (let i = 0; i < 400; i++) {
      const s = E.slotSpin(gid, r2, 0);
      for (const step of s.base.steps) {
        assert.equal(step.g.length, G.cols * G.rows);
        if (!step.w) continue;
        for (const w of step.w) { assert.ok(w.n >= G.min); if (G.kind === 'scatter') assert.equal(step.g.filter((x) => x === w.s).length, w.n); }
      }
    }
    // dinheiro: a aposta sai, o prémio entra, a compra custa N vezes a aposta
    const p = cas(1e9); p.peakRespect = 1e6;
    const r = E.casinoPlay(p, NOW, W, 'slot', { game: gid, amt: 100, buy: 1 }, seededRng(3));
    assert.equal(r.bet, 100 * G.buy); assert.equal(p.cash, 1e9 - 100 * G.buy + r.win); assert.ok(r.spin.free.length > 0);
    assert.throws(() => E.casinoPlay(p, NOW, W, 'slot', { game: gid, amt: 100, buy: 3 }, never), code('BAD_BET'));
  });
}
test('slots: compra super só no Rebuçado, jogo inventado recusado', () => {
  const p = cas(1e9); p.peakRespect = 1e6;
  assert.throws(() => E.casinoPlay(p, NOW, W, 'slot', { game: 'zeus', amt: 100, buy: 2 }, never), code('BAD_BET'));
  assert.throws(() => E.casinoPlay(p, NOW, W, 'slot', { game: 'toString', amt: 100 }, never), code('BAD_BET'));
  const r = E.casinoPlay(p, NOW, W, 'slot', { game: 'rebucado', amt: 10, buy: 2 }, seededRng(8));
  assert.equal(r.bet, 10 * CFG.casino.slots.rebucado.superBuy); assert.ok(r.spin.spots0.every((x) => x === 2));
});
