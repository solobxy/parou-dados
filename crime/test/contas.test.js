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
      p.energy = 0; p.sick = false; p.hkN = p.hkN.map(() => 0); p.cash = 1e12;
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
  assert.equal(E.mugValue(ladrao, p, NOW), 7500);                                     // cofre: 70% a salvo, o assalto leva 25% do resto
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

test('putas: cada visita sobe 4% só o preço dela, desce um degrau por cada hora sem lá ir, e há um fim para o que compensa', () => {
  const H = CFG.hookers, p = mk(); p.stats = { F: 2000, T: 10, I: 2000, C: 2000 };
  const i = H.list.findIndex((x) => x.id === 'dominique'), g = H.list[i], base = E.hookerPrice(p, i, NOW);
  const sobe = (x) => Math.ceil((x * H.stepNum) / H.stepDen);
  assert.equal(H.stepNum / H.stepDen, 1.04); assert.equal(H.coolMs, T.HOUR);
  const antes = H.list.map((_, k) => E.hookerPrice(p, k, NOW));
  // duas visitas seguidas: só a dela sobe, 4% de cada vez
  p.energy = 0; E.visitHooker(p, NOW, W, i, never); assert.equal(E.hookerPrice(p, i, NOW + 1), sobe(base));
  p.energy = 0; E.visitHooker(p, NOW + 1, W, i, never); assert.equal(E.hookerPrice(p, i, NOW + 2), sobe(sobe(base)));
  H.list.forEach((_, k) => { if (k !== i) assert.equal(E.hookerPrice(p, k, NOW + 2), antes[k]); });
  assert.equal(E.hookerSteps(p, i, NOW + 2), 2); assert.equal(E.hookerSteps(p, 0, NOW + 2), 0); assert.equal(E.hookerUses(p, NOW + 2), 2);
  // 59 minutos depois ainda está igual; à hora desce um degrau; às duas horas volta ao preço de início
  assert.equal(E.hookerPrice(p, i, NOW + 1 + T.HOUR - 1), sobe(sobe(base)));
  assert.equal(E.hookerPrice(p, i, NOW + 1 + T.HOUR), sobe(base)); assert.equal(E.hookerPrice(p, i, NOW + 1 + 2 * T.HOUR), base); assert.equal(E.hookerPrice(p, i, NOW + 30 * T.HOUR), base);
  // ir lá de hora a hora não acumula: paga-se sempre o preço de início
  const h = mk(); h.stats = p.stats; for (let k = 0; k < 10; k++) { h.energy = 0; const r = E.visitHooker(h, NOW + k * T.HOUR, W, i, never); assert.equal(r.price, base); }
  // uma visita a meio não apaga os degraus que ainda faltavam descer: a hora conta desde a última visita
  const m = mk(); m.stats = p.stats; for (let k = 0; k < 5; k++) { m.energy = 0; E.visitHooker(m, NOW + k, W, i, never); }
  assert.equal(E.hookerSteps(m, i, NOW + 3 * T.HOUR + 10), 2); m.energy = 0; E.visitHooker(m, NOW + 3 * T.HOUR + 10, W, i, never); assert.equal(E.hookerSteps(m, i, NOW + 3 * T.HOUR + 11), 3);
  assert.equal(E.hookerSteps(m, i, NOW + 4 * T.HOUR + 9), 3); assert.equal(E.hookerSteps(m, i, NOW + 4 * T.HOUR + 10), 2);
  // seguidas, sem esperar: há um ponto em que deixa de compensar (mesmo no melhor caso), e o preço tem teto
  const q = mk(); q.stats = p.stats; const valor = E.valuePerEnergy(q) * g.e * 1.76;      // todos os bónus de saque e os golpes perfeitos
  let visitas = 0, ultimo = 0;
  for (; visitas < 200; visitas++) { const preco = E.hookerPrice(q, i, NOW + visitas); assert.ok(preco >= ultimo); ultimo = preco; if (preco >= valor) break; q.energy = 0; E.visitHooker(q, NOW + visitas, W, i, never); }
  assert.ok(visitas >= 20 && visitas <= 45, `compensou ${visitas} vezes seguidas`);
  for (let k = 0; k < 100; k++) { q.energy = 0; q.cash = 1e15; E.visitHooker(q, NOW + 500 + k, W, i, never); } assert.equal(q.hkN[i], H.maxSteps); assert.deepEqual(E.checkInvariants(q), []);
  // estado antigo (listas de visitas) é convertido sem perder a conta de cada uma
  const velho = mk(); delete velho.hkN; delete velho.hkAt; velho.hkT = [NOW - 5, NOW - 4, NOW - 3]; velho.hkI = [i, i, 0]; E.touch(velho, NOW);
  assert.equal(velho.hkN[i], 2); assert.equal(velho.hkN[0], 1); assert.equal(velho.hkAt[i], NOW - 4); assert.equal(velho.hkT, undefined); assert.deepEqual(E.checkInvariants(velho), []);
  // doente não entra
  p.sick = true; p.energy = 0; assert.throws(() => E.visitHooker(p, NOW + 9 * T.HOUR, W, 0, never), code('SICK'));
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

test('blackjack: dividir um par (aposta igual, duas mãos, contas de cada uma) e o que não se pode', () => {
  // 8+8 contra 6: divide; 1.ª mão recebe 3 (11) e dobra com um 10 (21); 2.ª recebe um 10 (18) e fica; dealer 6+10, tira 10 e rebenta
  const p = cas(); p.bj = { bet: 100, dbl: false, pl: [7, 20], dl: [5, 9], next: [2, 9, 9, 9] };
  assert.equal(E.bjPublic(p).split, true); assert.deepEqual(E.bjPublic(p).tip, ['split', 'stand']);
  let r = E.casinoPlay(p, NOW, W, 'bj', { op: 'split' }, never);
  assert.equal(r.done, false); assert.equal(r.bet, 100); assert.equal(p.cash, 100000 - 100);
  assert.deepEqual(r.hand.hands.map((x) => x.tot), [11, 18]); assert.equal(r.hand.cur, 0); assert.equal(r.hand.split, undefined); assert.deepEqual(r.hand.tip, ['double', 'hit']);
  assert.throws(() => E.casinoPlay(p, NOW, W, 'bj', { op: 'split' }, never), code('NO_SPLIT'));   // só se divide uma vez
  r = E.casinoPlay(p, NOW, W, 'bj', { op: 'double' }, never);
  assert.equal(r.done, false); assert.equal(r.bet, 100); assert.equal(r.hand.cur, 1); assert.equal(r.hand.bet, 100); assert.deepEqual(r.hand.hands.map((x) => [x.tot, x.bet, x.dbl]), [[21, 200, true], [18, 100, false]]);
  r = E.casinoPlay(p, NOW, W, 'bj', { op: 'stand' }, never);
  assert.equal(r.done, true); assert.equal(r.hand.bet, 300); assert.equal(r.win, 600); assert.equal(r.res, 'win'); assert.equal(p.bj, null);
  assert.deepEqual(r.hand.hands.map((x) => [x.res, x.win]), [['win', 400], ['win', 200]]); assert.equal(p.cash, 100000 - 200 + 600);
  // dois ases: uma carta para cada um e acaba logo; 21 depois de dividir paga 1 para 1 (não é blackjack)
  const a = cas(); a.bj = { bet: 100, dbl: false, pl: [0, 13], dl: [9, 8], next: [12, 5] };   // ás+K = 21, ás+6 = 17, dealer 19
  r = E.casinoPlay(a, NOW, W, 'bj', { op: 'split' }, never);
  assert.equal(r.done, true); assert.deepEqual(r.hand.hands.map((x) => [x.tot, x.res, x.win]), [[21, 'win', 200], [17, 'lose', 0]]); assert.equal(r.res, 'push'); assert.equal(a.cash, 100000 - 100 + 200);
  // uma mão rebenta e a outra empata: perde-se só a que rebentou
  const b = cas(); b.bj = { bet: 100, dbl: false, pl: [9, 22], dl: [9, 7], next: [5, 7, 9] };  // 10+6 = 16, 10+8 = 18; dealer 18
  r = E.casinoPlay(b, NOW, W, 'bj', { op: 'split' }, never); assert.equal(r.done, false);
  r = E.casinoPlay(b, NOW, W, 'bj', { op: 'hit' }, never); assert.equal(r.done, false); assert.equal(r.hand.cur, 1); assert.equal(r.hand.hands[0].tot, 26);
  r = E.casinoPlay(b, NOW, W, 'bj', { op: 'stand' }, never);
  assert.deepEqual(r.hand.hands.map((x) => x.res), ['bust', 'push']); assert.equal(r.win, 100); assert.equal(r.res, 'lose'); assert.equal(r.hand.bet, 200);
  // cartas diferentes não se dividem; sem dinheiro na mão também não (e nada muda)
  const c = cas(); c.bj = { bet: 100, dbl: false, pl: [7, 8], dl: [9, 7], next: [] };
  assert.equal(E.bjPublic(c).split, undefined); assert.throws(() => E.casinoPlay(c, NOW, W, 'bj', { op: 'split' }, never), code('NO_SPLIT'));
  const d = cas(); d.cash = 50; d.bj = { bet: 100, dbl: false, pl: [7, 20], dl: [9, 7], next: [1, 2] };
  const antes = JSON.stringify(d);
  assert.throws(() => E.casinoPlay(d, NOW, W, 'bj', { op: 'split' }, never), code('NO_CASH')); assert.equal(JSON.stringify(d), antes);
  assert.throws(() => E.casinoPlay(d, NOW, W, 'bj', { op: 'double' }, never), code('NO_CASH')); assert.equal(JSON.stringify(d), antes);
});

test('blackjack: a seguir a dica do jogo em 400 000 mãos, devolve 99,5% e a casa continua a ganhar', () => {
  const rng = seededRng(4242), p = cas(1e13); let bet = 0, win = 0, div = 0, N = 400000;
  for (let i = 0; i < N; i++) {
    let r = E.casinoPlay(p, NOW, W, 'bj', { op: 'deal', amt: 100 }, rng); bet += r.bet; win += r.win;
    while (!r.done) { r = E.casinoPlay(p, NOW, W, 'bj', { op: r.hand.tip[0] }, rng); bet += r.bet; win += r.win; }
    if (r.hand.hands) { div++; assert.equal(r.win, r.hand.hands.reduce((x, y) => x + y.win, 0)); assert.equal(r.hand.bet, r.hand.hands.reduce((x, y) => x + y.bet, 0)); assert.ok(r.win <= r.hand.bet * 2); }
  }
  const porMao = (win - bet) / N / 100;   // o que a casa leva por mão dada, em apostas
  assert.ok(porMao < -0.002 && porMao > -0.009, 'casa por mão ' + porMao);
  perto(win / bet, 0.9955, 0.004, 'retorno com a dica');
  assert.ok(div / N > 0.02 && div / N < 0.03, 'mãos divididas ' + div / N);
  // a alternativa (sem dinheiro para dobrar nem dividir) é sempre pedir ou ficar
  const val = (c) => (c % 13 >= 9 ? 10 : (c % 13) + 1);
  for (let a = 0; a < 52; a++) for (let b = 0; b < 52; b++) for (let u = 0; u < 13; u++) {
    const par = val(a) === val(b), tip = E.bjTip([a, b], u, par);
    assert.ok(['hit', 'stand'].includes(tip[1])); assert.ok(['hit', 'stand', 'double'].concat(par ? ['split'] : []).includes(tip[0]));
    if (val(a) === 8 && par) assert.equal(tip[0], 'split');            // dois 8: divide-se sempre
    if (val(a) === 10 && par) assert.equal(tip[0], 'stand');           // 20 não se estraga
  }
});

// ---------- negócios da gangue ----------
const socio = (cash = 1e9, resp = 0) => { const p = mk(); p.cash = cash; p.bank = 0; if (resp) setResp(p, resp); E.gangSet(p, 'g1', 3, 0); return p; };
test('negócios da gangue: cada um ganha sobre o que pôs; o bónus de grupo é +5% por sócio ao teu nível, em proporção para quem tem menos, até +50%', () => {
  const B = CFG.gang.biz, A = socio(), P = socio();
  assert.deepEqual(B.map((b) => b.id), ['oficina', 'jogo', 'rota']);
  // limites: sem gangue, sede pequena, quantia mínima, teto do nível e sem dinheiro; nada muda
  const fora = mk(); assert.throws(() => E.gangBizInvest(fora, NOW, W, 0, 1000, 3), code('NO_GANG'));
  const antes = JSON.stringify(A);
  assert.throws(() => E.gangBizInvest(A, NOW, W, 1, 1000, 1), code('GBIZ_SEDE'));
  assert.throws(() => E.gangBizInvest(A, NOW, W, 0, 99, 3), code('BAD_AMOUNT'));
  assert.throws(() => E.gangBizInvest(A, NOW, W, 0, 1.5, 3), code('BAD_AMOUNT'));
  assert.throws(() => E.gangBizInvest(A, NOW, W, 9, 1000, 3), code('NO_BIZ'));
  assert.equal(E.gangBizCap(A, 0), E.casinoMax(A) * B[0].capMult);
  assert.throws(() => E.gangBizInvest(A, NOW, W, 0, E.gangBizCap(A, 0) + 1, 3), code('GBIZ_CAP'));
  const teso = socio(50); assert.throws(() => E.gangBizInvest(teso, NOW, W, 0, 1000, 3), code('NO_MONEY'));
  assert.equal(JSON.stringify(A), antes);
  // A põe 3000 e fica sozinho 2 h: 3% por hora, sem bónus
  let r = E.gangBizInvest(A, NOW, W, 0, 3000, 3); assert.equal(r.inv, 3000); assert.equal(A.cash, 1e9 - 3000);
  assert.deepEqual(E.gangBizSync([A, P], NOW), []);
  assert.equal(E.gangBizRate(A, 0), 90); assert.equal(E.gangBizView(A, NOW + 2 * T.HOUR)[0].stored, 180);
  // P põe só 300 (um décimo): P ganha +5% (tem um sócio com pelo menos o mesmo), A só +0,5% (o sócio tem um décimo do dele)
  E.gangBizInvest(P, NOW + 2 * T.HOUR, W, 0, 300, 3);
  const mud = E.gangBizSync([A, P], NOW + 2 * T.HOUR); assert.equal(mud.length, 2);
  assert.equal(A.gbz[0].coop, 50); assert.equal(P.gbz[0].coop, 500);
  assert.equal(A.gbz[0].stored, 180);                       // antes de mudar o bónus fecha-se a conta com o antigo
  assert.equal(E.gangBizRate(A, 0), Math.floor(90 * 1.005)); assert.equal(E.gangBizRate(P, 0), Math.floor(9 * 1.05));
  // o pobre não ganha mais por o sócio ser rico: com um sócio igual a ele teria exatamente o mesmo bónus
  const P2 = socio(), Q2 = socio(); E.gangBizInvest(P2, NOW, W, 0, 300, 3); E.gangBizInvest(Q2, NOW, W, 0, 300, 3); E.gangBizSync([P2, Q2], NOW);
  assert.equal(P2.gbz[0].coop, P.gbz[0].coop); assert.equal(E.gangBizRate(P2, 0), E.gangBizRate(P, 0));
  // 10 ou mais sócios ao mesmo nível: +50% e não passa daí
  const grupo = Array.from({ length: 14 }, () => socio()); for (const x of grupo) E.gangBizInvest(x, NOW, W, 2, 1000, 3);
  E.gangBizSync(grupo, NOW); for (const x of grupo) { assert.equal(x.gbz[2].coop, 5000); assert.equal(E.gangBizRate(x, 2), 60); }
  // receber: cai na mão o que rendeu, guardado no máximo 8 h
  const g0 = grupo[0], c0 = g0.cash; r = E.gangBizCollect(g0, NOW + 3 * T.HOUR, W); assert.equal(r.money, 180); assert.equal(g0.cash, c0 + 180);
  assert.equal(E.gangBizView(g0, NOW + 50 * T.HOUR)[2].stored, 60 * 8);
  for (const x of [A, P, ...grupo]) assert.deepEqual(E.checkInvariants(x), []);
});

test('negócios da gangue: sair devolve metade do investido e o que estava por receber; quem fica perde o bónus desse sócio; não há forma de criar dinheiro', () => {
  const A = socio(), Bm = socio();
  E.gangBizInvest(A, NOW, W, 0, 2000, 3); E.gangBizInvest(Bm, NOW, W, 0, 2000, 3); E.gangBizSync([A, Bm], NOW);
  assert.equal(A.gbz[0].coop, 500); assert.equal(E.gangBizRate(A, 0), 63);
  const c0 = Bm.cash, t1 = NOW + 4 * T.HOUR, back = E.gangLeave(Bm, t1);
  assert.deepEqual(back, { refund: 1000, stored: 252, invested: 2000 }); assert.equal(Bm.cash, c0 + 1252);
  assert.equal(Bm.gang, null); assert.ok(Bm.gbz.every((x) => x.inv === 0 && x.stored === 0 && x.coop === 0)); assert.deepEqual(E.checkInvariants(Bm), []);
  assert.deepEqual(E.gangBizSync([A], t1), [A]); assert.equal(A.gbz[0].coop, 0); assert.equal(A.gbz[0].stored, 252); assert.equal(E.gangBizRate(A, 0), 60);
  // pôr e tirar logo custa sempre metade: entrar e sair não dá lucro a ninguém, nem a quem fica
  const X = socio(100000); E.gangBizInvest(X, t1, W, 0, 2000, 3); E.gangBizSync([A, X], t1); E.gangLeave(X, t1); E.gangBizSync([A], t1);
  assert.equal(X.cash, 100000 - 1000); assert.equal(A.gbz[0].stored, 252); assert.equal(A.gbz[0].coop, 0);
  // muitos sócios ao acaso, a investir a horas diferentes: ninguém recebe mais do que o seu investimento × taxa × 1,5 × horas, e o acerto por partes dá o mesmo
  const rng = seededRng(88), ms = Array.from({ length: 8 }, () => socio(1e9, CFG.levels[6])), teto = ms.map(() => 0), pos = ms.map(() => 0);
  let t = NOW;
  for (let passo = 0; passo < 300; passo++) {
    const i = rng.int(0, 7), k = rng.int(0, 2), dt = rng.int(1, 40) * T.MIN;
    ms.forEach((m, j) => { for (let q = 0; q < 3; q++) teto[j] += Math.floor((m.gbz[q].inv * CFG.gang.biz[q].rateBp) / 10000) * 1.5 * (dt / T.HOUR); });
    t += dt;
    if (rng.chance(1500)) { const r = E.gangBizCollect(ms[i], t, W); pos[i] += r.money; }
    else { try { E.gangBizInvest(ms[i], t, W, k, rng.int(100, 20000), 3); } catch (e) { if (!(e instanceof E.GameError)) throw e; } }
    E.gangBizSync(ms, t);
    for (const m of ms) assert.deepEqual(E.checkInvariants(m), []);
  }
  ms.forEach((m, j) => { const tot = pos[j] + E.gangBizView(m, t).reduce((x, y) => x + y.stored, 0); assert.ok(tot <= teto[j] + 1, `sócio ${j}: recebeu ${tot}, teto ${teto[j]}`); assert.ok(tot >= 0); });
});

// ---------- guardas e assassino a soldo ----------
test('guardas: compram-se para cima, dão a defesa que dizem e baixam a pontaria do assassino pelo valor que dizem', () => {
  const G = CFG.guards, H = CFG.hitman, p = mk(), a = mk();
  assert.equal(G.length, 6); assert.equal(p.guard, -1);
  p.stats = { F: 100, T: 1000, I: 10, C: 10 }; a.stats = { F: 1000, T: 10, I: 10, C: 10 };
  const d0 = E.defensePower(p, NOW), c0 = E.attackChanceBp(a, p, NOW);
  assert.equal(E.hitmanChanceBp(p), H.baseBp);
  let gasto = 0;
  for (let i = 0; i < G.length; i++) {
    const cash = p.cash, r = E.buyGear(p, NOW, W, 'guard', i); gasto += G[i].price;
    assert.equal(r.price, G[i].price); assert.equal(p.cash, cash - G[i].price); assert.equal(p.guard, i);
    assert.equal(E.defensePower(p, NOW), Math.floor((d0 * (10000 + G[i].bp)) / 10000));
    assert.equal(E.hitmanChanceBp(p), Math.max(H.minBp, H.baseBp - G[i].block));
    if (i) assert.ok(G[i].bp > G[i - 1].bp && G[i].block > G[i - 1].block && G[i].price > G[i - 1].price);
  }
  assert.ok(E.attackChanceBp(a, p, NOW) < c0);
  assert.equal(E.hitmanChanceBp(p), 2000);                                  // com a melhor escolta, o assassino acerta 1 em 5
  assert.throws(() => E.buyGear(p, NOW, W, 'guard', 2), code('ALREADY_BETTER'));
  assert.throws(() => E.buyGear(p, NOW, W, 'guard', 6), code('NO_GEAR'));
  assert.deepEqual(E.checkInvariants(p), []);
});

test('assassino a soldo: quem paga só perde o preço; o alvo perde 1,5% do respeito, 10% da mão e fica 1 h no hospital; pontaria como anunciada', () => {
  const H = CFG.hitman, t0 = START + 3 * T.DAY;
  const par = (guard = -1) => { const a = mk(), d = mk(); for (const x of [a, d]) { E.touch(x, t0); setResp(x, 2000); x.shieldUntil = 0; } a.cash = 1e9; a.bank = 0; d.cash = 50000; d.bank = 7000; d.guard = guard; return [a, d]; };
  // preço e resultado, com sorte e com azar
  let [a, d] = par();
  assert.equal(E.hitmanPrice(d), 200000); assert.equal(E.canHitman(a, d, t0, W), null); assert.equal(E.hitmanLeft(a, t0), 3);
  let r = E.hitman(a, d, t0, W, always);
  assert.deepEqual([r.success, r.price, r.chanceBp, r.respLoss, r.cashLoss], [true, 200000, 9000, 30, 5000]);
  assert.equal(a.cash, 1e9 - 200000); assert.equal(a.respect, 2000);                        // nem respeito nem dinheiro para quem paga
  assert.equal(d.respect, 1970); assert.equal(d.cash, 45000); assert.equal(d.bank, 7000); assert.equal(d.hospUntil, t0 + H.hospMs); assert.equal(d.hmSafe, t0 + H.immuneMs);
  assert.equal(E.canHitman(a, d, t0 + 1, W), 'TARGET_HOSPITAL');
  assert.equal(E.canHitman(a, d, t0 + 3 * T.HOUR, W), 'HITMAN_SAFE');                        // 12 h a salvo de outro assassino, seja de quem for
  const outro = mk(); E.touch(outro, t0); setResp(outro, 2000); outro.shieldUntil = 0; assert.equal(E.canHitman(outro, d, t0 + 3 * T.HOUR, W), 'HITMAN_SAFE');
  assert.equal(E.canHitman(a, d, t0 + H.immuneMs, W), null);
  [a, d] = par(); r = E.hitman(a, d, t0, W, never);
  assert.deepEqual([r.success, r.price], [false, 200000]); assert.equal(a.cash, 1e9 - 200000);
  assert.equal(d.respect, 2000); assert.equal(d.cash, 50000); assert.equal(d.hospUntil, 0); assert.equal(d.hmSafe, 0);   // falhou: o alvo fica igual e sem proteção nova
  // três por dia, e dá para encomendar da cama do hospital
  a.hospUntil = t0 + T.HOUR;
  r = E.hitman(a, d, t0 + 1000, W, never); r = E.hitman(a, d, t0 + 2000, W, never);
  assert.equal(E.hitmanLeft(a, t0 + 3000), 0); assert.throws(() => E.hitman(a, d, t0 + 3000, W, always), code('HITMAN_LIMIT'));
  assert.equal(E.hitmanLeft(a, t0 + 24 * T.HOUR + 1), 1);
  // quem não pode: nível baixo, mesma gangue, jogador novo, alvo fraco de mais, sem dinheiro — e nada muda
  const recusa = (prep, cod) => { const [x, y] = par(); prep(x, y); const ax = JSON.stringify(x), ay = JSON.stringify(y); assert.throws(() => E.hitman(x, y, t0, W, always), code(cod)); E.touch(y, t0); assert.equal(JSON.stringify(x), ax); assert.equal(JSON.stringify(y), ay); };
  recusa((x) => { x.respect = 10; x.peakRespect = 10; }, 'LOW_LEVEL');
  recusa((x, y) => { E.gangSet(x, 'g', 1, 0); E.gangSet(y, 'g', 1, 0); }, 'SAME_GANG');
  recusa((x, y) => { y.shieldUntil = t0 + T.HOUR; }, 'TARGET_NEW');
  recusa((x) => { x.shieldUntil = t0 + T.HOUR; }, 'YOU_ARE_NEW');
  recusa((x, y) => { y.respect = 400; }, 'TARGET_TOO_WEAK');
  recusa((x, y) => { y.protectUntil = t0 + T.HOUR; }, 'TARGET_PROTECTED');
  recusa((x, y) => { y.jailUntil = t0 + T.HOUR; }, 'TARGET_JAIL');
  recusa((x) => { x.cash = 100; x.bank = 0; }, 'NO_MONEY');
  { const x = mk(); E.touch(x, t0); assert.throws(() => E.hitman(x, x, t0, W, always), code('SELF')); }
  // quem tem escudo de jogador novo só encomenda se aceitar perdê-lo
  { const [x, y] = par(); x.shieldUntil = t0 + T.HOUR; r = E.hitman(x, y, t0, W, always, true); assert.equal(r.success, true); assert.equal(x.shieldUntil, 0); }
  // pontaria: 90% sem guardas, 50% com guarda-costas, 20% com escolta (20 000 encomendas cada)
  for (const [guard, esperado] of [[-1, 0.9], [3, 0.5], [5, 0.2]]) {
    const rng = seededRng(700 + guard); let ok = 0; const N = 20000;
    for (let i = 0; i < N; i++) { const [x, y] = par(guard); if (E.hitman(x, y, t0, W, rng).success) ok++; }
    perto(ok / N, esperado, 0.012, 'pontaria com guarda ' + guard);
  }
  // o hospital do assassino conta para o limite de 4 idas em 24 h, como as tareias
  { const [x, y] = par(); y.hospTimes = [t0 - 3000, t0 - 2000, t0 - 1000]; E.hitman(x, y, t0, W, always); assert.ok(y.capUntil > t0); }
});

// ---------- gangue da rua (chefiada por um bot) ----------
test('gangue da rua: entra quem quiser a partir do nível das gangues, quem sai espera 24 h, e os membros não ficam protegidos uns dos outros nem têm desconto', () => {
  const B = CFG.gang.bot, t0 = START + 3 * T.DAY;
  const novo = (resp = 2000) => { const p = mk(); E.touch(p, t0); setResp(p, resp); p.shieldUntil = 0; p.cash = 1e7; p.bank = 0; return p; };
  const a = novo(), b = novo(), fraco = novo(1);
  assert.throws(() => E.gangBotCanJoin(fraco, t0), code('LOW_LEVEL'));
  E.gangBotCanJoin(a, t0); E.gangSet(a, B.id, 1, 0); E.gangSet(b, B.id, 1, 0);
  assert.equal(E.sameCrew(a, b), false);                                    // na gangue da rua continuam a ser rivais
  assert.equal(E.canAttack(a, b, t0, W), null); assert.equal(E.canHitman(a, b, t0, W), null);
  assert.throws(() => E.hitJoin(a, novo(), t0, W), code('BOT_GANG_NO'));    // sem tareias em grupo
  assert.deepEqual(a.gb, E.gangBonus(1, 0));                                 // só o bónus de uma sede de nível 1
  // numa gangue a sério, os mesmos dois não se podiam atacar
  const c = novo(), d = novo(); E.gangSet(c, 'gx', 1, 0); E.gangSet(d, 'gx', 1, 0);
  assert.equal(E.sameCrew(c, d), true); assert.equal(E.canAttack(c, d, t0, W), 'SAME_GANG'); assert.equal(E.canHitman(c, d, t0, W), 'SAME_GANG');
  // desconto da gangue nas casas: só entre membros de uma gangue a sério
  for (const o of [a, c]) o.club = { lvl: 1, till: 0, t: t0, rem: 0, pi: 2, gd: 3 };
  assert.equal(E.venuePriceBp(a, 'club', b), CFG.venue.prices[2]); assert.ok(E.venuePriceBp(c, 'club', d) < CFG.venue.prices[2]);
  // negócios da gangue funcionam (Oficina) e sair devolve metade, como nas outras
  E.gangBizInvest(a, t0, W, 0, 2000, 1); assert.throws(() => E.gangBizInvest(a, t0, W, 1, 2000, 1), code('GBIZ_SEDE'));
  const cash = a.cash, back = E.gangLeave(a, t0 + T.HOUR);
  assert.equal(back.refund, 1000); assert.equal(a.cash, cash + back.refund + back.stored); assert.equal(a.gbotLeft, t0 + T.HOUR);
  // voltar: 1 h para qualquer gangue, 24 h para a da rua
  assert.throws(() => E.gangBotCanJoin(a, t0 + T.HOUR + 30 * T.MIN), code('GANG_WAIT'));
  E.gangCanJoin(a, t0 + 2 * T.HOUR + 1);
  assert.throws(() => E.gangBotCanJoin(a, t0 + 2 * T.HOUR + 1), code('BOT_GANG_WAIT'));
  assert.throws(() => E.gangBotCanJoin(a, t0 + T.HOUR + B.rejoinMs - 1), code('BOT_GANG_WAIT'));
  E.gangBotCanJoin(a, t0 + T.HOUR + B.rejoinMs);
  // sair de uma gangue a sério não mexe na espera da gangue da rua
  E.gangLeave(c, t0); assert.equal(c.gbotLeft, 0);
  for (const x of [a, b, c, d]) assert.deepEqual(E.checkInvariants(x), []);
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

test('roda da sorte: as oito apostas devolvem 96,5% (conta exata, com o teto) e a simulação confirma', () => {
  const Wh = CFG.casino.wheel, CAP = CFG.casino.maxWinMult, tw = (l) => l.reduce((x, [, w]) => x + w, 0), TT = tw(Wh.topMult);
  // retorno exato de uma aposta sozinha numa casa: sem multiplicador do topo, e com cada um deles; nenhum prémio passa do teto
  const exato = (s, cap) => {
    const l = Wh.num[s] ? [[Wh.num[s], 1]] : Wh[s], T = tw(l), q = Wh.top[s] / 10000; let e = 0;
    for (const [v, w] of l) { e += (1 - q) * (w / T) * Math.min(v + 1, cap); for (const [m, wm] of Wh.topMult) e += q * (w / T) * (wm / TT) * Math.min(v * m + 1, cap); }
    return (Wh.segs.filter((x) => x === s).length / 54) * e;
  };
  const REAL = Object.fromEntries(Wh.spots.map((s) => [s, 0.965]));
  assert.equal(Wh.segs.length, 54);
  assert.ok(Object.values(Wh.top).reduce((x, y) => x + y, 0) <= 10000);
  for (const s of Wh.spots) {
    perto(exato(s, CAP), REAL[s], 0.0006, 'roda ' + s);
    assert.ok(exato(s, Infinity) < 0.98, 'roda ' + s + ' sem teto');   // mesmo a espalhar apostas para fugir ao teto, a casa fica sempre a ganhar
  }
  // os minijogos nunca dão menos do que isto
  assert.deepEqual(['moeda', 'caixas', 'bola', 'louca'].map((s) => Math.min(...Wh[s].map(([v]) => v))), [3, 10, 10, 20]);
  const rng = seededRng(5150), N = 300000, got = {}, ret = {};
  for (let i = 0; i < N; i++) { const sp = E.wheelSpin(rng); got[sp.s] = (got[sp.s] || 0) + 1; ret[sp.s] = (ret[sp.s] || 0) + sp.mult + 1; }
  for (const s of ['1', '2', '5', '10']) perto(got[s] / N, Wh.segs.filter((x) => x === s).length / 54, 0.004, 'casa ' + s);
  for (const s of ['1', '2', '5']) perto(ret[s] / N, REAL[s], 0.03, 'retorno ' + s);
  const p = cas(1e9); p.peakRespect = 1e6;
  const r = E.casinoPlay(p, NOW, W, 'wheel', { bets: [{ s: '1', amt: 100 }, { s: 'louca', amt: 50 }] }, seededRng(1));
  assert.equal(p.cash, 1e9 - 150 + r.win); assert.ok(r.win <= 150 * CFG.casino.maxWinMult);
  assert.throws(() => E.casinoPlay(p, NOW, W, 'wheel', { bets: [{ s: '3', amt: 100 }] }, never), code('BAD_BET'));
});

test('slots de esferas: nas grátis do Chefão e do Zeus todas as esferas ficam no multiplicador acumulado (com ou sem prémio); na Doce cada rodada é à parte', () => {
  for (const gid of ['chefao', 'zeus', 'doce']) {
    const G = CFG.casino.slots[gid], rng = seededRng(61), cap = G.max * 100; let semPremio = 0, rodadas = 0;
    assert.equal(!!G.accAll, gid !== 'doce');
    for (let i = 0; i < 3000; i++) {
      const s = E.slotSpin(gid, rng, 1); let acc = 0, soma = s.base.win * (s.base.win > 0 && s.base.orbSum ? s.base.orbSum : 1) + s.scatPay;
      for (const f of s.free) {
        rodadas++;
        if (G.accAll) {
          acc += f.orbSum; assert.equal(f.acc, acc, gid + ': acumulado');            // nunca desce e junta tudo o que caiu
          assert.equal(f.w, f.win * Math.max(1, acc), gid + ': prémio da rodada');
          if (f.orbSum > 0 && f.win === 0) semPremio++;
        } else assert.equal(f.w, f.win * (f.win > 0 && f.orbSum ? f.orbSum : 1), gid + ': prémio da rodada');
        soma += f.w;
      }
      if (soma < cap && s.free.at(-1).left === 0) assert.equal(s.total, soma, gid + ': total');
    }
    if (G.accAll) assert.ok(semPremio / rodadas > 0.03, gid + ': esferas em rodadas sem prémio também contam (' + semPremio + ')');
  }
});

// as quatro slots estão afinadas para o mesmo perfil: retorno total perto de 96,2%, compra de bónus perto de 96,2×, bónus 1 em 400 jogadas
// (medido com 6 a 10 milhões de jogadas e mais de 1 milhão de compras por jogo; aqui confirma-se com menos, por isso a folga)
const SLOT_REAL = { chefao: 0.962, zeus: 0.962, doce: 0.962, rebucado: 0.962 };
for (const gid of Object.keys(CFG.casino.slots)) {
  test(`slot ${gid}: retorno perto do real, compra de bónus também, teto respeitado e contas da grelha certas`, () => {
    const G = CFG.casino.slots[gid], rng = seededRng(404), sc = G.kind === 'scatter', cap = G.max * 100, N = sc ? 400000 : 150000, NB = sc ? 30000 : 6000;
    let tot = 0, hits = 0, semGratis = 0, trig = 0;
    for (let i = 0; i < N; i++) {
      const s = E.slotSpin(gid, rng, 0), b = s.base; tot += s.total; if (b.win > 0) hits++; assert.ok(s.total <= cap);
      if (sc) { semGratis += Math.min(cap, b.win * (b.win > 0 && b.orbSum ? b.orbSum : 1) + s.scatPay); if (s.free.length) trig++; }
    }
    let bt = 0, gratis = 0;
    for (let i = 0; i < NB; i++) { const s = E.slotSpin(gid, rng, 1); bt += s.total; gratis += Math.min(cap, s.free.reduce((x, f) => x + f.w, 0)); assert.ok(s.free.length > 0, 'compra sem grátis'); }
    // as grátis têm cauda longa (uma compra pode dar milhares de vezes a aposta): nas slots de esferas o retorno mede-se por partes, que é muito mais
    // estável: o que o jogo paga sem as grátis + a frequência do bónus × o que as grátis valem em média (medido nas compras). Afinação fina: milhões de jogadas.
    if (sc) perto((semGratis / N + (trig / N) * (gratis / NB)) / 100, SLOT_REAL[gid], 0.04, gid + ' retorno');
    else perto(tot / N / 100, SLOT_REAL[gid], 0.06, gid + ' retorno');
    perto(bt / NB / 100 / G.buy, SLOT_REAL[gid], 0.08, gid + ' compra');
    assert.ok(hits / N > 0.25 && hits / N < 0.4, 'jogadas com prémio ' + hits / N);
    // o bónus natural sai perto de 1 vez em 400 jogadas em todas (antes ia de 1 em 318 a 1 em 503)
    let bon = 0; const r3 = seededRng(808), N3 = gid === 'rebucado' ? 250000 : 500000; for (let i = 0; i < N3; i++) if (E.slotSpin(gid, r3, 0).free.length) bon++;
    assert.ok(N3 / bon > 330 && N3 / bon < 480, gid + ': bónus 1 em ' + (N3 / bon).toFixed(0));
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
  assert.equal(r.bet, 10 * CFG.casino.slots.rebucado.superBuy);
  // cada casa começa com um multiplicador sorteado da lista, e não todas com o mesmo
  const lista = CFG.casino.slots.rebucado.superSpots.map(([v]) => v);
  assert.equal(r.spin.spots0.length, 49); assert.ok(r.spin.spots0.every((x) => lista.includes(x))); assert.ok(new Set(r.spin.spots0).size > 1);
});

test('slots: a compra super do Rebuçado sai com os multiplicadores nas proporções anunciadas e devolve cerca de 96,4%', () => {
  const G = CFG.casino.slots.rebucado, rng = seededRng(77), N = 60000, conta = new Map(); let tot = 0, casas = 0;
  for (let i = 0; i < N; i++) { const s = E.slotSpin('rebucado', rng, 2); tot += s.total; if (i < 4000) for (const v of s.spots0) { conta.set(v, (conta.get(v) || 0) + 1); casas++; } }
  const soma = G.superSpots.reduce((x, [, w]) => x + w, 0);
  for (const [v, w] of G.superSpots) perto(conta.get(v) / casas, w / soma, 0.006, `casas a ×${v}`);
  perto(tot / N / 100 / G.superBuy, 0.964, 0.03, 'retorno da compra super');
});

test('mesas ao vivo: pagam exatamente o mesmo que a jogada a solo, e a roleta devolve 36/37 em qualquer aposta', () => {
  // roleta: cada tipo de aposta, somado nos 37 números, devolve 36 fichas por cada 37 apostadas
  for (const b of [{ t: 'red' }, { t: 'black' }, { t: 'even' }, { t: 'odd' }, { t: 'low' }, { t: 'high' }, { t: 'dozen', n: 1 }, { t: 'num', n: 0 }, { t: 'num', n: 17 }]) {
    let tot = 0; for (let n = 0; n <= 36; n++) tot += E.tablePay('roulette', [{ ...b, amt: 100 }], { n });
    assert.equal(tot, 3600, `roleta ${b.t}`);
  }
  // roda: o prémio da mesa é o da função da roda, para o mesmo resultado
  const rng = seededRng(909);
  for (let i = 0; i < 20000; i++) {
    const res = E.tableDraw('wheel', rng), bets = [{ s: '1', amt: 100 }, { s: res.s, amt: 50 }, { s: 'louca', amt: 10 }].filter((b, k, a) => a.findIndex((x) => x.s === b.s) === k);
    const esperado = Math.min(bets.filter((b) => b.s === res.s).reduce((x, b) => x + b.amt * (res.mult + 1), 0), E.tableTotal(bets) * CFG.casino.maxWinMult);
    assert.equal(E.tablePay('wheel', bets, res), esperado);
  }
});

test('mesas ao vivo: apostar tira o dinheiro certo, junta apostas iguais, respeita o máximo e devolve tudo ao limpar', () => {
  const p = mk(); p.cash = 5000; const max = E.casinoMax(p);
  let r = E.tableBet(p, NOW, W, 'roulette', [{ t: 'red', amt: 100 }, { t: 'num', n: 7, amt: 50 }]);
  assert.equal(p.cash, 4850); assert.equal(r.total, 150);
  r = E.tableBet(p, NOW, W, 'roulette', [{ t: 'red', amt: 100 }], r.bets);
  assert.equal(p.cash, 4750); assert.equal(r.total, 250); assert.equal(r.bets.find((b) => b.t === 'red').amt, 200); assert.equal(r.bets.length, 2);
  assert.throws(() => E.tableBet(p, NOW, W, 'roulette', [{ t: 'black', amt: max }], r.bets), (e) => e.code === 'BET_TOO_BIG');
  assert.throws(() => E.tableBet(p, NOW, W, 'roulette', [{ t: 'num', n: 37, amt: 10 }], r.bets), (e) => e.code === 'BAD_BET');
  assert.throws(() => E.tableBet(p, NOW, W, 'wheel', [{ s: 'x', amt: 10 }]), (e) => e.code === 'BAD_BET');
  assert.throws(() => E.tableBet(p, NOW, W, 'roulette', [{ t: 'red', amt: 5 }], r.bets), (e) => e.code === 'BAD_BET');
  assert.equal(p.cash, 4750);
  const q2 = mk(); q2.cash = 60; assert.throws(() => E.tableBet(q2, NOW, W, 'wheel', [{ s: '1', amt: 100 }]), (e) => e.code === 'NO_CASH');
  assert.equal(E.tableClear(p, r.bets).back, 250); assert.equal(p.cash, 5000);
});

test('golpe em grupo: regras de entrada, devolução exata, parte igual para todos e a percentagem mostrada é a que sai', () => {
  const G = CFG.gang, H = G.heists[0];
  const membro = (st = 60) => { const p = mk(); p.cash = 1000; p.stats = { F: st, T: 10, I: st, C: st }; setResp(p, 100); E.gangSet(p, 'g1', 1, 0); return p; };
  const solto = mk(); assert.throws(() => E.heistJoin(solto, NOW, W, 0), code('NO_GANG'));
  const a = membro(); assert.throws(() => E.heistJoin(a, NOW, W, 99), code('NO_CRIME'));
  // entrar gasta stamina; devolver repõe-na. Não há limite por dia: só a stamina trava
  const e0 = a.energy; E.heistJoin(a, NOW, W, 0); assert.equal(a.energy, e0 - H.e);
  E.heistRefund(a, NOW, 0); assert.equal(a.energy, e0);
  for (let i = 0; i < 12; i++) { a.energy = 100; E.heistJoin(a, NOW + i, W, 0); assert.equal(a.energy, 100 - H.e); }
  // a lista: 9 golpes, os antigos nos mesmos números, e por ponto de stamina nenhum passa de 2× o melhor golpe a solo
  assert.deepEqual(G.heists.map((x) => x.id), ['carrinha', 'casino', 'banco', 'ourivesaria', 'comboio', 'leilao', 'aeroporto', 'cartel', 'moeda']);
  const solo = Math.max(...CFG.crimes.map((c) => (c.min + c.max) / 2 / c.e));
  for (const x of G.heists) { assert.ok((x.min + x.max) / 2 / x.e <= 2 * solo, x.id + ' paga de mais por stamina'); assert.ok(x.sede >= 1 && x.sede <= G.maxLevel && x.need >= 2 && x.need <= G.opMax && x.bailAs <= 9 && x.e <= CFG.energy.max && x.w.I + x.w.F + x.w.C === 100, x.id); }
  const fraco = membro(); fraco.energy = H.e - 1; assert.throws(() => E.heistJoin(fraco, NOW, W, 0), code('NO_ENERGY'));
  // quando corre bem todos levam o mesmo (mais o bónus de saque da gangue de cada um) e o respeito do golpe
  const b = membro(), c = membro(); E.gangSet(c, 'g1', 3, 0);
  let r = E.heistResolve([b, c], NOW, 0, always);
  assert.equal(r.success, true); assert.equal(r.parts[0].money, Math.floor((H.min * (10000 + G.lootBpPer)) / 10000)); assert.equal(r.parts[1].money, Math.floor((H.min * (10000 + 3 * G.lootBpPer)) / 10000));
  assert.equal(b.cash, 1000 + r.parts[0].money); assert.equal(b.respect, 100 + H.r); assert.equal(c.respect, 100 + H.r);
  // quando corre mal ninguém ganha nada
  const d = membro(), e = membro(); r = E.heistResolve([d, e], NOW, 0, never);
  assert.equal(r.success, false); assert.equal(d.cash, 1000); assert.equal(d.respect, 100); assert.equal(r.parts.every((x) => x.money === 0 && !x.busted), true);
  // mais gente = mais hipóteses, sempre dentro dos limites
  const um = E.heistChanceBp([membro()], 0, NOW), dois = E.heistChanceBp([membro(), membro()], 0, NOW), oito = E.heistChanceBp(Array.from({ length: 8 }, () => membro()), 0, NOW);
  assert.ok(um < dois && dois < oito && oito <= CFG.chance.maxBp && um >= CFG.chance.minBp);
  // 60 000 golpes a dois: sai a percentagem mostrada e a média do saque é a do intervalo
  const rng = seededRng(9917); let ok = 0, soma = 0; const N = 60000;
  const x = membro(75), y = membro(75), mostrada = E.heistChanceBp([x, y], 0, NOW) / 10000;
  for (let i = 0; i < N; i++) { x.jailUntil = 0; y.jailUntil = 0; const s = E.heistResolve([x, y], NOW, 0, rng); if (s.success) { ok++; soma += s.parts[0].money; } }
  perto(ok / N, mostrada, 0.008, 'sucesso do golpe em grupo');
  perto(soma / ok, ((H.min + H.max) / 2) * (1 + G.lootBpPer / 10000), 25, 'saque médio por cabeça');
});

test('tareia em grupo: a força junta-se com desconto, o alvo só perde uma vez e ninguém ganha mais do que a solo', () => {
  const G = CFG.gang, P = CFG.pvp;
  const lutador = (gang, f = 60) => { const p = mk(); p.stats = { F: f, T: f, I: 10, C: 10 }; setResp(p, 200); p.shieldUntil = 0; if (gang) E.gangSet(p, gang, 1, 0); return p; };
  const a = lutador('g1'), b = lutador('g1'), d = lutador('g2'), semG = lutador(null);
  assert.throws(() => E.hitJoin(semG, d, NOW, W), code('NO_GANG'));
  assert.throws(() => E.hitJoin(a, b, NOW, W), code('SAME_GANG'));
  const e0 = a.energy; E.hitJoin(a, d, NOW, W); assert.equal(a.energy, e0 - P.energy); E.hitRefund(a, NOW); assert.equal(a.energy, e0);
  // dois iguais contra um: melhor do que um sozinho, pior do que a soma inteira
  const solo = E.attackChanceBp(a, d, NOW), dupla = E.hitChanceBp([a, b], d, NOW);
  assert.ok(dupla > solo); assert.ok(dupla < E.chanceBp(E.attackPower(a, NOW) + E.attackPower(b, NOW), E.defensePower(d, NOW)));
  // ganhar: cada um leva 70% do que levaria a solo; o alvo perde uma vez só e vai para o hospital mais tempo
  const base = E.pvpBaseGain(a, d), cada = Math.floor((base * G.hitShareBp) / 10000);
  let r = E.hitResolve([a, b], d, NOW, always);
  assert.equal(r.win, true); assert.deepEqual(r.parts.map((x) => x.respect), [cada, cada]); assert.ok(cada < base);
  assert.equal(r.targetLoss, Math.floor(cada / P.lossDiv)); assert.equal(d.respect, 200 - r.targetLoss);
  assert.equal(d.hospUntil, NOW + Math.floor((P.beatHospMs * G.hitHospBp) / 10000));
  assert.equal(E.hitCanResolve(d, NOW + 1000), false);
  // repetir no mesmo alvo rende metade (mesma regra das lutas a solo)
  d.hospUntil = 0; d.protectUntil = 0; d.capUntil = 0; const antes = a.respect;
  r = E.hitResolve([a, b], d, NOW + 5000, always); assert.ok(a.respect - antes <= Math.ceil(cada / 2));
  // perder: quem atacou perde respeito e vai para o hospital; o alvo fica como estava ou ganha a defesa
  const x = lutador('g1'), y = lutador('g1'), z = lutador('g2');
  r = E.hitResolve([x, y], z, NOW, never);
  assert.equal(r.win, false); assert.ok(x.respect < 200 && y.respect < 200); assert.ok(x.hospUntil > NOW && y.hospUntil > NOW); assert.equal(z.respect, 200 + P.defendGain); assert.equal(z.hospUntil, 0);
  // o alvo que entretanto entrou na mesma gangue já não leva
  const w = lutador('g1'); assert.equal(E.hitCanResolve(w, NOW, 'g1'), false); assert.equal(E.hitCanResolve(w, NOW, 'g9'), true);
});

test('profissões: as de elite pedem respeito, mudar custa o anunciado, só de 24 em 24 h, e os bónus novos fazem o que dizem', () => {
  const C = CFG.classChange, cls = (id) => CFG.classes.find((c) => c.id === id);
  // escolher a primeira: as de elite só com o respeito pedido (conta o máximo que já tiveste)
  const novo = mk(); novo.cls = '';
  assert.throws(() => E.setClass(novo, NOW, W, 'padrinho'), code('CLASS_LOCKED'));
  assert.throws(() => E.setClass(novo, NOW, W, 'nada'), code('NO_CLASS'));
  E.setClass(novo, NOW, W, 'chulo'); assert.equal(novo.cls, 'chulo'); assert.equal(novo.clsAt, 0);
  assert.throws(() => E.setClass(novo, NOW, W, 'ladrao'), code('CLASS_SET'));
  // mudar: custo certo por nível, cobra uma vez, e depois espera 24 h
  const p = mk('ladrao'); p.cash = 10_000_000; p.bank = 0; setResp(p, 1000);
  const custo = Math.max(C.min, Math.floor((Math.floor(E.valuePerEnergy(p) * 100) * C.energy) / 100));   // o que rendem 100 de stamina no melhor golpe
  assert.equal(E.classChangeCost(p), custo); assert.ok(custo >= C.min);
  { const fraco = mk('ladrao'); assert.equal(E.classChangeCost(fraco), C.min); }
  assert.throws(() => E.changeClass(p, NOW, W, 'ladrao'), code('CLASS_SET'));
  assert.throws(() => E.changeClass(p, NOW, W, 'barao'), code('CLASS_LOCKED'));          // pede 2000
  const antes = JSON.stringify([p.cash, p.cls, p.clsAt]);
  const pobre = mk('ladrao'); pobre.cash = 10; pobre.bank = 0; assert.throws(() => E.changeClass(pobre, NOW, W, 'vigarista'), code('NO_MONEY')); assert.equal(pobre.cls, 'ladrao'); assert.equal(pobre.cash, 10);
  assert.equal(JSON.stringify([p.cash, p.cls, p.clsAt]), antes);
  let r = E.changeClass(p, NOW, W, 'mestre');                                               // pede 1000: já pode
  assert.equal(r.cost, custo); assert.equal(r.from, 'ladrao'); assert.equal(p.cls, 'mestre'); assert.equal(p.cash, 10_000_000 - custo); assert.equal(p.clsAt, NOW);
  assert.throws(() => E.changeClass(p, NOW + C.coolMs - 1, W, 'ladrao'), code('CLASS_WAIT'));
  assert.equal(p.cash, 10_000_000 - custo);
  E.changeClass(p, NOW + C.coolMs, W, 'ladrao'); assert.equal(p.cls, 'ladrao');
  // o respeito pode baixar depois: quem já lá chegou continua a poder escolher
  const q = mk('ladrao'); q.cash = 1e9; setResp(q, 6000); q.respect = 10; E.changeClass(q, NOW, W, 'padrinho'); assert.equal(q.cls, 'padrinho');
  // sem profissão ainda não se «muda»
  const sem = mk(); sem.cls = ''; assert.throws(() => E.changeClass(sem, NOW, W, 'ladrao'), code('NO_CLASS'));
  // chulo: putas 30% mais baratas e 60% menos doenças
  const a = mk('ladrao'), b = mk('chulo'); setResp(a, 500); setResp(b, 500);
  for (let i = 0; i < CFG.hookers.list.length; i++) {
    const cheio = E.hookerPrice(a, i, NOW), desc = E.hookerPrice(b, i, NOW);
    assert.equal(desc, Math.max(1, Math.floor((cheio * 7000) / 10000)));
  }
  const conta = (cl) => { const rng = seededRng(77), x = mk(cl); let s = 0; for (let k = 0; k < 20000; k++) { x.energy = 0; x.sick = false; x.hkN = x.hkN.map(() => 0); x.cash = 1e12; if (E.visitHooker(x, NOW, W, 0, rng).sick) s++; } return s / 20000; };
  const base = CFG.hookers.list[0].sickBp / 10000;
  perto(conta('ladrao'), base, 0.01, 'doença sem bónus'); perto(conta('chulo'), base * 0.4, 0.008, 'doença do chulo');
  // contrabandista e magnata: menos apreensões no porto
  assert.equal(E.portSeizeBp(mk('ladrao')), CFG.port.seizeBp); assert.equal(E.portSeizeBp(mk('contrabandista')), CFG.port.seizeBp / 2); assert.equal(E.portSeizeBp(mk('magnata')), Math.floor(CFG.port.seizeBp * 0.7));
  // padrinho: +15% de respeito nos golpes, arredondado para baixo (só mexe nos golpes de 7 ou mais)
  for (const k of [0, 5, 9]) {
    const g = mk('padrinho'), n = mk('ladrao'); for (const x of [g, n]) { x.stats = { F: 9999, T: 10, I: 9999, C: 9999 }; setResp(x, 20000); }
    const rg = E.doCrime(g, NOW, W, k, always), rn = E.doCrime(n, NOW, W, k, always), r0 = CFG.crimes[k].r;
    assert.equal(rn.respect, r0); assert.equal(rg.respect, r0 + Math.floor((r0 * 1500) / 10000)); assert.equal(g.respect - 20000, rg.respect);
  }
  // as profissões de elite dão mais do que a de rua do mesmo ofício, e nenhuma tem bónus desconhecidos
  assert.ok(cls('mestre').lootBp > cls('ladrao').lootBp && cls('padrinho').lootBp > cls('mestre').lootBp);
  assert.ok(cls('blindado').defBp > cls('seguranca').defBp && cls('carniceiro').atkBp > cls('matador').atkBp && cls('barao').drugCutBp > cls('traficante').drugCutBp && cls('magnata').bizBp > cls('empresario').bizBp);
  const conhecidos = ['id', 'need', 'lootBp', 'bustCutBp', 'bailCutBp', 'drugCutBp', 'fxMoreBp', 'capPlus', 'bizBp', 'feeCutBp', 'atkBp', 'pvpBp', 'defBp', 'hospCutBp', 'hkCutBp', 'sickCutBp', 'seizeCutBp', 'respBp'];
  for (const c of CFG.classes) for (const k of Object.keys(c)) { assert.ok(conhecidos.includes(k), `bónus desconhecido ${k} em ${c.id}`); if (k !== 'id' && k !== 'need' && k !== 'capPlus' && k !== 'fxMoreBp') assert.ok(c[k] > 0 && c[k] <= 10000); }
  assert.equal(new Set(CFG.classes.map((c) => c.id)).size, CFG.classes.length);
});

test('aeroporto: regras, pagamento certo, suborno e o retorno de cada rota é o anunciado', () => {
  const A = CFG.air, rota = (id) => A.routes.findIndex((x) => x.id === id);
  const piloto = (cl = 'ladrao', resp = 20000) => { const p = mk(cl); p.cash = 1e9; p.bank = 0; setResp(p, resp); return p; };
  // regras de entrada: rota inválida, nível, quantia, máximo, um voo de cada vez
  const p = piloto();
  assert.throws(() => E.airSend(p, NOW, W, 9, 1000, false), code('NO_ROUTE'));
  assert.throws(() => E.airSend(p, NOW, W, 0, 50, false), code('BAD_AMOUNT'));
  assert.throws(() => E.airSend(p, NOW, W, 0, E.airCap(p) + 1, false), code('OVER_CAP'));
  const novato = piloto('ladrao', 5); assert.throws(() => E.airSend(novato, NOW, W, 0, 1000, false), code('LOW_LEVEL')); assert.equal(novato.cash, 1e9);
  assert.throws(() => E.airCollect(p, NOW, W, always), code('NO_FLIGHT'));
  // sem suborno paga-se só a carga; com suborno, mais 20% que não voltam
  let r = E.airSend(p, NOW, W, rota('medellin'), 10000, false);
  assert.equal(r.paid, 10000); assert.equal(p.cash, 1e9 - 10000); assert.equal(r.readyAt, NOW + 4 * T.HOUR); assert.deepEqual(p.air, { r: rota('medellin'), amount: 10000, bribe: false, t0: NOW, readyAt: NOW + 4 * T.HOUR });
  assert.throws(() => E.airSend(p, NOW, W, 0, 1000, false), code('AIR_BUSY'));
  assert.throws(() => E.airCollect(p, NOW + 4 * T.HOUR - 1, W, never), code('AIR_FLYING')); assert.ok(p.air);
  r = E.airCollect(p, NOW + 4 * T.HOUR, W, never);   // «never»: a alfândega não apanha
  assert.equal(r.seized, false); assert.equal(r.got, 14000); assert.equal(p.cash, 1e9 + 4000); assert.equal(p.air, null); assert.equal(r.respect, 7); assert.equal(p.respect, 20007);
  const q = piloto(); r = E.airSend(q, NOW, W, rota('kandahar'), 10000, true);
  assert.equal(r.paid, 12000); assert.equal(r.bribe, 2000); assert.equal(q.cash, 1e9 - 12000);
  r = E.airCollect(q, NOW + 8 * T.HOUR, W, always);   // «always»: apreendido
  assert.equal(r.seized, true); assert.equal(r.got, 0); assert.equal(q.cash, 1e9 - 12000); assert.equal(q.respect, 20000); assert.equal(q.air, null);
  // não se manda um avião que só chegue depois do fim da ronda
  const tarde = piloto(); assert.throws(() => E.airSend(tarde, W.playEnd - T.HOUR, W, rota('medellin'), 1000, false), code('ROUND_ENDING'));
  // risco: suborno corta a metade; contrabandista corta a metade; os dois juntos, um quarto
  for (let i = 0; i < A.routes.length; i++) {
    const base = A.routes[i].seizeBp;
    assert.equal(E.airSeizeBp(piloto(), i, false), base); assert.equal(E.airSeizeBp(piloto(), i, true), Math.floor(base / 2));
    assert.equal(E.airSeizeBp(piloto('contrabandista'), i, false), Math.floor(base / 2)); assert.equal(E.airSeizeBp(piloto('contrabandista'), i, true), Math.floor(Math.floor(base / 2) / 2));
  }
  // retorno esperado por voo (conta exata) e simulação de 60 000 voos por rota
  const esperado = { tanger: 3.55, amesterdao: 7.38, medellin: 14.8, culiacan: 23.75, kandahar: 34 };
  const rng = seededRng(4411);
  A.routes.forEach((R, i) => {
    const ev = ((10000 - R.seizeBp) * (10000 + R.gainBp)) / 1e6 - 100;
    perto(ev, esperado[R.id], 0.01, 'retorno esperado de ' + R.id);
    let pago = 0, voltou = 0, presos = 0; const N = 60000;
    for (let k = 0; k < N; k++) { const x = piloto(); const s = E.airSend(x, NOW, W, i, 10000, false); pago += s.paid; const c = E.airCollect(x, s.readyAt, W, rng); voltou += c.got; if (c.seized) presos++; }
    perto(presos / N, R.seizeBp / 10000, 0.006, 'apreensões em ' + R.id);
    perto((voltou / pago - 1) * 100, ev, 1.2, 'retorno simulado de ' + R.id);
    // por hora, nenhuma rota rende mais do que 4,5% da carga (o porto dá 2,6% por contentor)
    assert.ok(ev / (R.ms / T.HOUR) < 4.5 && ev / (R.ms / T.HOUR) > 3);
    // com suborno: carga + 20%; só pode compensar nas rotas de maior risco
    const evB = ((10000 - Math.floor(R.seizeBp / 2)) * (10000 + R.gainBp)) / 1e6 - 100 - A.bribeBp / 100;
    if (R.id === 'kandahar' || R.id === 'culiacan') assert.ok(evB > ev); else assert.ok(evB < ev);
  });
  // o avião nunca cria dinheiro do nada: o máximo que volta é carga × (1 + ganho)
  const z = piloto(); const cap = E.airCap(z); E.airSend(z, NOW, W, rota('kandahar'), cap, false); const c2 = E.airCollect(z, NOW + 8 * T.HOUR, W, never); assert.equal(c2.got, cap * 2); assert.equal(z.cash, 1e9 + cap);
});

test('gangue: safar um membro custa exatamente a fiança ou o hospital dele, só entre membros da mesma gangue', () => {
  const m = (g) => { const p = mk('ladrao'); p.cash = 100000; p.bank = 0; setResp(p, 500); if (g) E.gangSet(p, g, 1, 0); return p; };
  const a = m('g1'), b = m('g1'), fora = m('g2'), sem = m(null);
  // ninguém preso: recusa sem mexer em nada
  assert.throws(() => E.bailFor(a, b, NOW, W), code('NOT_IN_JAIL')); assert.throws(() => E.medicFor(a, b, NOW, W), code('NOT_IN_HOSPITAL'));
  b.jailUntil = NOW + 5 * T.MIN; b.jailTier = 6;
  assert.throws(() => E.bailFor(fora, b, NOW, W), code('NO_GANG')); assert.throws(() => E.bailFor(sem, b, NOW, W), code('NO_GANG')); assert.throws(() => E.bailFor(b, b, NOW, W), code('SELF'));
  const custo = E.bailCost(b, NOW); assert.ok(custo > 0);
  const pobre = m('g1'); pobre.cash = custo - 1; assert.throws(() => E.bailFor(pobre, b, NOW, W), code('NO_MONEY')); assert.ok(b.jailUntil > NOW); assert.equal(pobre.cash, custo - 1);
  let r = E.bailFor(a, b, NOW, W);
  assert.equal(r.cost, custo); assert.equal(a.cash, 100000 - custo); assert.equal(b.cash, 100000); assert.equal(b.jailUntil, 0); assert.equal(b.jailTier, 0);
  // quem paga pode estar ele próprio preso ou no hospital (paga do bolso na mesma)
  const c = m('g1'); c.hospUntil = NOW + 20 * T.MIN; a.jailUntil = NOW + 3 * T.MIN; a.jailTier = 2;
  const med = E.medicCost(c, NOW); r = E.medicFor(a, c, NOW, W);
  assert.equal(r.cost, med); assert.equal(c.hospUntil, 0); assert.equal(a.cash, 100000 - custo - med); assert.ok(a.jailUntil > NOW);
});

test('mercadoria: entra ao preço de grosso, o troco fica em dinheiro, despachar nunca devolve mais do que custou', () => {
  const coca = CFG.drugs.findIndex((x) => x.id === 'coca'), erva = CFG.drugs.findIndex((x) => x.id === 'erva');
  assert.equal(E.wholesale(coca), 1200); assert.equal(E.wholesale(erva), 20);
  for (let d = 0; d < CFG.drugs.length; d++) { assert.ok(E.wholesale(d) >= 1 && E.wholesale(d) <= CFG.drugs[d].price); assert.ok(E.dumpValue(d, 7) <= 7 * E.wholesale(d)); }
  // avião: 10 000 para Medellín voltam 14 000; em coca são 11 unidades (13 200) e 800 de troco
  const p = mk('ladrao'); p.cash = 1e9; p.bank = 0; setResp(p, 20000);
  const s = E.airSend(p, NOW, W, CFG.air.routes.findIndex((x) => x.id === 'medellin'), 10000, false);
  let r = E.airCollect(p, s.readyAt, W, never, true);
  assert.equal(r.got, 14000); assert.equal(r.d, coca); assert.equal(r.units, 11); assert.equal(r.rest, 800);
  assert.equal(p.stock[coca], 11); assert.equal(p.cash, 1e9 - 10000 + 800); assert.equal(r.units * E.wholesale(coca) + r.rest, r.got);
  // apreendido: não entra nada
  const q = mk('ladrao'); q.cash = 1e9; setResp(q, 20000); const s2 = E.airSend(q, NOW, W, 0, 10000, false); r = E.airCollect(q, s2.readyAt, W, always, true);
  assert.equal(r.seized, true); assert.ok(q.stock.every((x) => x === 0)); assert.equal(q.cash, 1e9 - 10000);
  // porto: o contentor de mercadoria traz a droga do teu nível; o de dinheiro continua igual
  const c = mk(); c.cash = 1e6; c.bank = 0;
  assert.equal(E.portDrug(c), erva); const alto = mk(); setResp(alto, 20000); assert.equal(E.portDrug(alto), coca);
  E.sendPort(c, NOW, W, 1000, true); assert.equal(c.port[0].d, erva); assert.equal(c.cash, 1e6 - 1000);
  const col = E.collectPort(c, NOW + CFG.port.ms, W, never);
  assert.equal(col.items[0].got, 1300); assert.equal(col.items[0].units, 65); assert.equal(col.items[0].rest, 0); assert.equal(c.stock[erva], 65); assert.equal(c.cash, 1e6 - 1000);
  // despachar: 95% do preço de grosso; ida e volta perde sempre, e perde mais do que a taxa do banco
  assert.throws(() => E.stockDump(c, NOW + CFG.port.ms, W, erva, 66), code('NO_STOCK')); assert.throws(() => E.stockDump(c, NOW + CFG.port.ms, W, erva, 0), code('NO_STOCK')); assert.throws(() => E.stockDump(c, NOW + CFG.port.ms, W, 99, 1), code('NO_DRUG'));
  const d1 = E.stockDump(c, NOW + CFG.port.ms, W, erva, 65);
  assert.equal(d1.got, Math.floor(1300 * 0.95)); assert.equal(c.stock[erva], 0); assert.equal(c.cash, 1e6 - 1000 + 1235);
  assert.ok(10000 - CFG.goods.dumpBp > CFG.bank.feeBp);
  // tomar do armazém: não se paga, gasta uma unidade e faz o mesmo que a da discoteca; recusada não gasta nada
  const u = mk(); u.cash = 500; u.energy = 10; u.stock[coca] = 2;
  const v = mk(); v.cash = 1e6; v.energy = 10; const rb = E.buyDrug(v, NOW, W, coca);
  const ru = E.stockUse(u, NOW, W, coca);
  assert.equal(ru.price, 0); assert.equal(u.cash, 500); assert.equal(u.stock[coca], 1); assert.equal(ru.energy, rb.energy); assert.equal(u.energy, v.energy); assert.equal(u.addiction, v.addiction); assert.deepEqual(u.fx, v.fx);
  u.energy = 100; assert.throws(() => E.stockUse(u, NOW, W, 0), code('NO_STOCK')); u.stock[0] = 3; assert.throws(() => E.stockUse(u, NOW, W, 0), code('ENERGY_FULL')); assert.equal(u.stock[0], 3);
  u.energy = 0; u.addiction = E.addictionCap(u); assert.throws(() => E.stockUse(u, NOW, W, coca), code('ADDICTION_LIMIT')); assert.equal(u.stock[coca], 1);
});

test('discoteca: vende só o que tem, ao ritmo da casa, e dá o mesmo feita de uma vez ou aos bocados', () => {
  const V = CFG.venue, coca = CFG.drugs.findIndex((x) => x.id === 'coca');
  const dono = () => { const p = mk(); p.cash = 1e9; p.bank = 0; return p; };
  const p = dono();
  assert.throws(() => E.venueBuy(p, NOW, W, 'casino'), code('NO_VENUE')); assert.throws(() => E.venueSet(p, NOW, W, 'club', 2, 0), code('NO_VENUE'));
  const pobre = dono(); pobre.cash = V.club.cost[0] - 1; assert.throws(() => E.venueBuy(pobre, NOW, W, 'club'), code('NO_MONEY')); assert.equal(pobre.club, null);
  let r = E.venueBuy(p, NOW, W, 'club');
  assert.equal(r.cost, 10000); assert.equal(r.lvl, 1); assert.equal(r.respect, V.club.resp[0]); assert.equal(p.cash, 1e9 - 10000); assert.deepEqual(p.club, { lvl: 1, till: 0, t: NOW, rem: 0, pi: 2, gd: 0 });
  // sem mercadoria não entra dinheiro, por muito tempo que passe
  E.touch(p, NOW + 5 * T.HOUR); assert.equal(p.club.till, 0); assert.equal(p.club.rem, 0);
  // 100 de coca (1500 cada): nível 1 vende 2000 por hora ao preço da cidade → 3 h dão 6000 = 4 unidades
  const t0 = NOW + 5 * T.HOUR; p.stock[coca] = 100;
  E.touch(p, t0 + 3 * T.HOUR); assert.equal(p.stock[coca], 96); assert.equal(p.club.till, 6000); assert.equal(p.club.rem, 0);
  // 20 minutos: 666 de movimento não chegam para uma unidade; ficam guardados e vendem-se quando chegar
  E.touch(p, t0 + 3 * T.HOUR + 20 * T.MIN); assert.equal(p.stock[coca], 96); assert.equal(p.club.till, 6000);
  E.touch(p, t0 + 3 * T.HOUR + 45 * T.MIN); assert.equal(p.stock[coca], 95); assert.equal(p.club.till, 7500);
  // o mesmo tempo aos bocados (de 7 em 7 minutos) dá exatamente o mesmo que de uma vez, com várias drogas e a qualquer preço
  for (const pi of [0, 1, 2, 3, 4]) {
    const a = dono(), b = dono();
    for (const x of [a, b]) { E.venueBuy(x, NOW, W, 'club'); E.venueBuy(x, NOW, W, 'club'); E.venueSet(x, NOW, W, 'club', pi, 0); x.stock = [40, 30, 20, 10, 5, 5, 5, 2, 1]; }
    E.touch(a, NOW + 9 * T.HOUR); for (let t = NOW; t <= NOW + 9 * T.HOUR; t += 7 * T.MIN) E.touch(b, t); E.touch(b, NOW + 9 * T.HOUR);
    assert.deepEqual(b.stock, a.stock, 'armazém, preço ' + pi); assert.equal(b.club.till, a.club.till, 'caixa, preço ' + pi);
    // o que saiu do armazém, ao preço da cidade, nunca passa do que a casa aguenta nesse tempo
    const fora = [40, 30, 20, 10, 5, 5, 5, 2, 1].reduce((s, n0, d) => s + (n0 - a.stock[d]) * CFG.drugs[d].price, 0);
    assert.ok(fora <= E.clubRate(a) * 9, 'vendeu a mais, preço ' + pi); assert.equal(E.clubRate(a), Math.floor((V.club.perH[1] * V.volBp[pi]) / 10000));
    // e o caixa recebeu o preço escolhido por cada unidade
    const caixa = [40, 30, 20, 10, 5, 5, 5, 2, 1].reduce((s, n0, d) => s + (n0 - a.stock[d]) * Math.max(1, Math.floor((CFG.drugs[d].price * V.prices[pi]) / 10000)), 0);
    assert.equal(a.club.till, caixa);
  }
  // lucro: ao preço de custo (80%) não se ganha nada; por hora o melhor é o preço da cidade; por unidade o melhor é o mais caro
  const lucroH = V.prices.map((bp, i) => (V.volBp[i] * (bp - CFG.goods.wholesaleBp)) / 1e8);
  assert.equal(lucroH[0], 0); assert.equal(Math.max(...lucroH), lucroH[2]); assert.ok(lucroH[4] > 0 && lucroH[3] < lucroH[2]);
  // o caixa enche até 12 h de movimento e para: a mercadoria que sobra fica no armazém
  const c = dono(); E.venueBuy(c, NOW, W, 'club'); c.stock[coca] = 1000; E.touch(c, NOW + 5 * T.DAY);
  assert.equal(c.club.till, 24000); assert.equal(c.stock[coca], 1000 - 16); E.touch(c, NOW + 6 * T.DAY); assert.equal(c.club.till, 24000); assert.equal(c.stock[coca], 984);
  // recolher passa o caixa para o bolso, nem mais nem menos; depois volta a vender
  r = E.venueCollect(c, NOW + 6 * T.DAY, W); assert.equal(r.club, 24000); assert.equal(r.bro, 0); assert.equal(c.cash, 1e9 - 10000 + 24000); assert.equal(c.club.till, 0);
  E.touch(c, NOW + 6 * T.DAY + 3 * T.HOUR); assert.equal(c.club.till, 6000);
  // subir de nível: custos da tabela, respeito da tabela, teto no último
  const m = dono(); let gasto = 0; for (let i = 0; i < V.club.cost.length; i++) { const b = E.venueBuy(m, NOW, W, 'club'); gasto += b.cost; assert.equal(b.cost, V.club.cost[i]); assert.equal(b.lvl, i + 1); }
  assert.equal(m.cash, 1e9 - gasto); assert.equal(m.respect, V.club.resp.reduce((x, y) => x + y, 0)); assert.throws(() => E.venueBuy(m, NOW, W, 'club'), code('VENUE_MAX'));
  // mudar o preço não mexe no que já se vendeu: fecha primeiro as contas ao preço antigo
  const e = dono(); E.venueBuy(e, NOW, W, 'club'); e.stock[coca] = 50; E.venueSet(e, NOW + 3 * T.HOUR, W, 'club', 4, 3);
  assert.equal(e.club.till, 6000); assert.equal(e.stock[coca], 46); assert.equal(e.club.pi, 4); assert.equal(e.club.gd, 3);
  for (const bad of [[5, 0], [-1, 0], [2, 4], [1.5, 0], [NaN, 0]]) assert.throws(() => E.venueSet(e, NOW + 3 * T.HOUR, W, 'club', bad[0], bad[1]), code('BAD_AMOUNT'));
});

test('discoteca de outro jogador: quem compra paga ao dono o preço dele, a gangue tem desconto e ninguém paga abaixo do custo', () => {
  const V = CFG.venue, coca = CFG.drugs.findIndex((x) => x.id === 'coca');
  const dono = mk(); dono.cash = 1e6; dono.bank = 0; dono.gang = 'g1'; E.venueBuy(dono, NOW, W, 'club'); dono.stock[coca] = 5;
  const fora = mk(); fora.cash = 1e6; fora.energy = 0; const mano = mk(); mano.cash = 1e6; mano.energy = 0; mano.gang = 'g1'; const outro = mk(); outro.gang = 'g2';
  // tabela inteira de preços: público = o do dono; gangue = com desconto; nunca abaixo de 80%
  for (let pi = 0; pi < V.prices.length; pi++) for (let gd = 0; gd < V.gdisc.length; gd++) {
    dono.club.pi = pi; dono.club.gd = gd;
    assert.equal(E.venuePriceBp(dono, 'club', fora), V.prices[pi]); assert.equal(E.venuePriceBp(dono, 'club', outro), V.prices[pi]);
    const g = E.venuePriceBp(dono, 'club', mano);
    assert.equal(g, Math.max(8000, Math.floor((V.prices[pi] * (10000 - V.gdisc[gd])) / 10000))); assert.ok(g >= CFG.goods.wholesaleBp && g <= V.prices[pi]);
    for (let d = 0; d < CFG.drugs.length; d++) assert.ok(E.clubPriceAt(dono, mano, d) >= E.wholesale(d), 'o dono perdia dinheiro');
  }
  // compra: 110% para quem é de fora (1650), 88% para a gangue com 20% de desconto (1320)
  dono.club.pi = 3; dono.club.gd = 2;
  const antes = fora.cash + dono.club.till;
  let r = E.clubBuyAt(fora, dono, NOW, W, coca, 1650);
  assert.equal(r.price, 1650); assert.equal(fora.cash, 1e6 - 1650); assert.equal(dono.club.till, 1650); assert.equal(dono.stock[coca], 4); assert.equal(dono.cash, 1e6 - 10000);
  assert.equal(fora.cash + dono.club.till, antes); assert.equal(r.energy, 30); assert.ok(fora.addiction > 0);
  r = E.clubBuyAt(mano, dono, NOW, W, coca); assert.equal(r.price, 1320); assert.equal(dono.club.till, 1650 + 1320); assert.equal(dono.stock[coca], 3);
  // recusas que não mexem em nada: o próprio, sem casa, sem mercadoria, preço que subiu entretanto, sem dinheiro, cheio
  assert.throws(() => E.clubBuyAt(dono, dono, NOW, W, coca), code('SELF'));
  assert.throws(() => E.clubBuyAt(fora, outro, NOW, W, coca), code('NO_VENUE')); assert.throws(() => E.clubBuyAt(fora, dono, NOW, W, 0), code('NO_STOCK')); assert.throws(() => E.clubBuyAt(fora, dono, NOW, W, 99), code('NO_DRUG'));
  const f0 = structuredClone(fora), d0 = structuredClone(dono);
  assert.throws(() => E.clubBuyAt(fora, dono, NOW, W, coca, 1649), code('PRICE_CHANGED'));
  fora.cash = 100; const f1 = structuredClone(fora); assert.throws(() => E.clubBuyAt(fora, dono, NOW, W, coca), code('NO_MONEY')); assert.deepEqual(fora, f1); fora.cash = f0.cash;
  fora.energy = 100; fora.fx = []; assert.throws(() => E.clubBuyAt(fora, dono, NOW, W, 0), code('NO_STOCK'));
  assert.deepEqual(dono, d0);
  // dois amigos a comprarem um ao outro: o par nunca gasta menos do que o preço de grosso (o mesmo que tomar do próprio armazém)
  for (let pi = 0; pi < V.prices.length; pi++) for (let gd = 0; gd < V.gdisc.length; gd++) {
    const a = mk(); a.cash = 1e6; a.gang = 'gx'; a.energy = 0; const b = mk(); b.cash = 1e6; b.gang = 'gx'; E.venueBuy(b, NOW, W, 'club'); E.venueSet(b, NOW, W, 'club', pi, gd);
    const custo = E.wholesale(coca); b.stock[coca] = 1; b.cash -= custo;   // o amigo pagou a mercadoria ao preço de grosso
    const tudo = a.cash + b.cash + V.club.cost[0];
    E.clubBuyAt(a, b, NOW, W, coca); E.venueCollect(b, NOW, W);
    assert.equal(a.cash + b.cash + V.club.cost[0], tudo, 'o dinheiro só mudou de mãos');
    assert.ok(2e6 - (a.cash + b.cash + V.club.cost[0]) === custo);
  }
});

test('bordel: quartos, contratar, rendimento por hora, e a parte da puta nunca vai para o dono', () => {
  const V = CFG.venue, H = CFG.hookers.list, top = H.length - 1, rosa = 0;
  const dono = () => { const p = mk(); p.cash = 1e9; p.bank = 0; return p; };
  const p = dono();
  assert.throws(() => E.broHire(p, NOW, W, top), code('NO_VENUE')); assert.throws(() => E.broFire(p, NOW, W, 0), code('NO_VENUE'));
  let r = E.venueBuy(p, NOW, W, 'bro'); assert.equal(r.cost, 8000); assert.deepEqual(p.bro, { lvl: 1, till: 0, t: NOW, rem: 0, pi: 2, gd: 0, girls: [] });
  assert.equal(E.broRate(p), 0); E.touch(p, NOW + T.HOUR); assert.equal(p.bro.till, 0);
  // contratar custa pela categoria; os quartos são o limite
  assert.throws(() => E.broHire(p, NOW + T.HOUR, W, 99), code('NO_HOOKER'));
  r = E.broHire(p, NOW + T.HOUR, W, top); assert.equal(r.cost, V.bro.hire[3]); r = E.broHire(p, NOW + T.HOUR, W, rosa); assert.equal(r.cost, V.bro.hire[0]);
  assert.equal(p.cash, 1e9 - 8000 - 160000 - 3000); assert.deepEqual(p.bro.girls, [top, rosa]);
  assert.throws(() => E.broHire(p, NOW + T.HOUR, W, rosa), code('NO_ROOM')); assert.equal(p.bro.girls.length, 2);
  // rendimento: soma das categorias ao preço da cidade; 80% não dá nada (vai tudo para elas); o melhor por hora é 100%
  assert.equal(E.broRate(p), 8200);
  const rates = V.prices.map((_, pi) => { p.bro.pi = pi; return E.broRate(p); }); p.bro.pi = 2;
  assert.deepEqual(rates, [0, Math.floor((Math.floor(8200 * 1.15) * 1000) / 2000), 8200, Math.floor((Math.floor(8200 * 0.6) * 3000) / 2000), Math.floor((Math.floor(8200 * 0.35) * 4000) / 2000)]);
  assert.equal(Math.max(...rates), rates[2]);
  // 2 h 30 → 20 500; aos bocados dá o mesmo; enche até 12 h e para
  const q = structuredClone(p); E.touch(p, NOW + 3 * T.HOUR + 30 * T.MIN); assert.equal(p.bro.till, 20500);
  for (let t = NOW + T.HOUR; t <= NOW + 3 * T.HOUR + 30 * T.MIN; t += 7 * T.MIN) E.touch(q, t); E.touch(q, NOW + 3 * T.HOUR + 30 * T.MIN); assert.equal(q.bro.till, 20500);
  E.touch(p, NOW + 3 * T.DAY); assert.equal(p.bro.till, 8200 * 12); E.touch(p, NOW + 4 * T.DAY); assert.equal(p.bro.till, 8200 * 12);
  r = E.venueCollect(p, NOW + 4 * T.DAY, W); assert.equal(r.bro, 98400); assert.equal(p.bro.till, 0);
  // despedir não devolve nada e fecha primeiro as contas
  const c0 = p.cash; r = E.broFire(p, NOW + 4 * T.DAY + T.HOUR, W, 0); assert.equal(r.i, top); assert.deepEqual(p.bro.girls, [rosa]); assert.equal(p.cash, c0); assert.equal(p.bro.till, 8200); assert.equal(E.broRate(p), 200);
  assert.throws(() => E.broFire(p, NOW + 4 * T.DAY + T.HOUR, W, 1), code('NO_HOOKER'));
  // quartos e custos por nível
  const m = dono(); for (let i = 0; i < V.bro.cost.length; i++) { const b = E.venueBuy(m, NOW, W, 'bro'); assert.equal(b.cost, V.bro.cost[i]); for (let k = m.bro.girls.length; k < V.bro.rooms[i]; k++) E.broHire(m, NOW, W, top); assert.throws(() => E.broHire(m, NOW, W, top), code('NO_ROOM')); }
  assert.throws(() => E.venueBuy(m, NOW, W, 'bro'), code('VENUE_MAX')); assert.equal(E.broRate(m), 12 * 8000);
  // visita de outro jogador: paga o preço dele na cidade × o preço do dono; 80% do preço da cidade é dela, o resto vai para o caixa
  const casa = dono(); casa.gang = 'g1'; E.venueBuy(casa, NOW, W, 'bro'); E.broHire(casa, NOW, W, 5); const till0 = casa.bro.till;
  for (let pi = 0; pi < V.prices.length; pi++) for (let gd = 0; gd < V.gdisc.length; gd++) for (const gang of ['g1', 'g2']) {
    casa.bro.pi = pi; casa.bro.gd = gd; casa.bro.till = 0; casa.bro.t = NOW; casa.t = NOW;
    const cli = mk(); cli.cash = 1e6; cli.bank = 0; cli.energy = 0; cli.gang = gang;
    const base = E.hookerPrice(cli, 5, NOW), bp = E.venuePriceBp(casa, 'bro', cli);
    assert.equal(bp, gang === 'g1' ? Math.max(8000, Math.floor((V.prices[pi] * (10000 - V.gdisc[gd])) / 10000)) : V.prices[pi]);
    const v = E.broVisitAt(cli, casa, NOW, W, 0, never, E.broPriceAt(casa, cli, 5, NOW));
    assert.equal(v.price, Math.floor((base * bp) / 10000)); assert.equal(cli.cash, 1e6 - v.price); assert.equal(v.energy, H[5].e); assert.equal(v.sick, false);
    assert.equal(v.house, v.price - Math.floor((base * 8000) / 10000)); assert.ok(v.house >= 0); assert.equal(casa.bro.till, v.house);
    // dois amigos a visitarem-se um ao outro: o par gasta sempre 80% do preço da cidade, nem menos
    assert.equal(v.price - v.house, Math.floor((base * 8000) / 10000));
  }
  assert.equal(till0, 0);
  // conta como visita para o preço subir (igual às da cidade) e a doença também se apanha
  const cli = mk(); cli.cash = 1e6; cli.energy = 0; const b0 = E.hookerPrice(cli, 5, NOW); E.broVisitAt(cli, casa, NOW, W, 0, always); assert.equal(cli.sick, H[5].sickBp > 0); assert.ok(E.hookerPrice(cli, 5, NOW) > b0);
  assert.throws(() => E.broVisitAt(cli, casa, NOW, W, 0, never), code('SICK'));
  const ok = mk(); ok.cash = 1e6; ok.energy = 100; assert.throws(() => E.broVisitAt(ok, casa, NOW, W, 0, never), code('ENERGY_FULL')); ok.energy = 0;
  assert.throws(() => E.broVisitAt(ok, casa, NOW, W, 3, never), code('NO_HOOKER')); assert.throws(() => E.broVisitAt(casa, casa, NOW, W, 0, never), code('SELF')); assert.throws(() => E.broVisitAt(ok, ok, NOW, W, 0, never), code('SELF'));
  assert.throws(() => E.broVisitAt(ok, casa, NOW, W, 0, never, 1), code('PRICE_CHANGED')); assert.equal(ok.cash, 1e6);
});

test('assalto: leva 25% do caixa da discoteca e do bordel, como nos negócios por recolher', () => {
  const a = mk(); a.cash = 0; a.bank = 0; a.stats.F = 1e6; setResp(a, 500);
  const d = mk(); d.cash = 0; d.bank = 0; setResp(d, 500); d.protectUntil = 0;
  d.club = { lvl: 1, till: 5000, t: NOW, rem: 0, pi: 2, gd: 0 }; d.bro = { lvl: 1, till: 3000, t: NOW, rem: 0, pi: 2, gd: 0, girls: [] };
  const t = W.start + CFG.round.noPvpMs + 3 * T.HOUR; E.touch(a, t); E.touch(d, t);
  assert.equal(E.mugValue(a, d, t), 2000);
  const r = E.attack(a, d, t, W, 'mug', { int: (lo) => lo, chance: () => true, float: () => 0 });
  if (r.win) { assert.equal(r.money, 2000); assert.equal(a.cash, 2000); assert.equal(d.club.till, 3750); assert.equal(d.bro.till, 2250); }
  assert.ok(r.win, 'com força de sobra e sorte a favor o assalto tem de dar');
});

test('escudo de novato: só se ataca com ele se aceitares perdê-lo; ataque recusado não o tira; não volta', () => {
  const t = W.start + CFG.round.noPvpMs + 30 * T.HOUR, sorte = { int: (lo) => lo, chance: () => true, float: () => 0 };
  const par = () => { const a = mk(); const d = mk(); for (const x of [a, d]) { setResp(x, 500); x.cash = 1000; x.bank = 0; E.touch(x, t); x.energy = 100; x.protectUntil = 0; } a.shieldUntil = t + 10 * T.HOUR; return [a, d]; };
  // quem entra tarde na ronda tem 24 h de escudo; quem entra no início não tem
  assert.equal(E.newPlayer('tarde', W.start + 25 * T.HOUR, W).shieldUntil, W.start + 49 * T.HOUR); assert.equal(E.newPlayer('cedo', W.start, W).shieldUntil, 0);
  let [a, d] = par();
  assert.throws(() => E.attack(a, d, t, W, 'beat', sorte), code('YOU_ARE_NEW')); assert.equal(a.shieldUntil, t + 10 * T.HOUR); assert.equal(a.energy, 100);
  assert.throws(() => E.attack(a, d, t, W, 'beat', sorte, false), code('YOU_ARE_NEW'));
  // aceitou mas o ataque não se pode fazer (alvo protegido, alvo com escudo, modo inválido): o escudo fica
  d.protectUntil = t + T.HOUR; assert.throws(() => E.attack(a, d, t, W, 'beat', sorte, true), code('TARGET_PROTECTED')); assert.equal(a.shieldUntil, t + 10 * T.HOUR);
  d.protectUntil = 0; d.shieldUntil = t + T.HOUR; assert.throws(() => E.attack(a, d, t, W, 'beat', sorte, true), code('TARGET_NEW')); assert.equal(a.shieldUntil, t + 10 * T.HOUR);
  d.shieldUntil = 0; assert.throws(() => E.attack(a, d, t, W, 'x', sorte, true), code('BAD_MODE')); assert.equal(a.shieldUntil, t + 10 * T.HOUR);
  // aceitou e atacou: o escudo acaba ali e passa a poder ser atacado
  const r = E.attack(a, d, t, W, 'beat', sorte, true); assert.equal(r.ok, true); assert.equal(a.shieldUntil, 0); assert.equal(a.energy, 100 - CFG.pvp.energy);
  const [c] = par(); c.shieldUntil = 0; assert.notEqual(E.canAttack(c, a, t + 1, W), 'TARGET_NEW');
  // tareia em grupo: a mesma regra
  [a, d] = par(); a.gang = 'g1'; d.gang = 'g2';
  assert.throws(() => E.hitJoin(a, d, t, W), code('YOU_ARE_NEW')); assert.equal(a.shieldUntil, t + 10 * T.HOUR);
  E.hitJoin(a, d, t, W, true); assert.equal(a.shieldUntil, 0);
  // quem não tem escudo não perde nada por mandar o «aceito»
  [a, d] = par(); a.shieldUntil = 0; E.attack(a, d, t, W, 'beat', sorte, true); assert.equal(a.shieldUntil, 0);
});

test('desintoxicação: preço anunciado, sobe 15% de cada vez, e há sempre uma altura do dia em que deixa de compensar', () => {
  const D = CFG.detox, p = mk('ladrao'); setResp(p, 3000); p.cash = 1e12;
  const v100 = Math.floor(E.valuePerEnergy(p) * 100), melhor = Math.max(...CFG.drugs.map((g) => g.e / g.a));   // stamina por ponto de vício, na melhor droga
  p.addiction = 100; p.addictionT = NOW;
  const c1 = E.detoxCost(p, NOW); assert.equal(c1, Math.max(D.min, Math.floor((v100 * 100) / D.valueDiv)));
  // a primeira custa o que rendem 10 de stamina (antes eram 14)
  assert.equal(D.valueDiv, 1000); perto(c1 / (v100 / 100), 10, 0.05, 'primeira do dia, em stamina');
  const ganho = (melhor * 100 * v100) / 100;   // tudo o que 100 de vício deixam ganhar, sem contar o preço da droga
  let t = NOW, ultima = 0, fim = 0;
  for (let i = 0; i < D.maxSteps; i++) {
    p.addiction = 100; p.addictionT = t; const r = E.detox(p, t, W);
    if (i) assert.equal(r.price, Math.ceil((ultima * D.stepNum) / D.stepDen));
    ultima = r.price; t += 1000;
    if (!fim && r.price > ganho) fim = i + 1;
    if (i === 9) assert.ok(r.price < ganho / 10, 'a 10.ª do dia ainda compensa bem');
  }
  // deixa de compensar algures entre a 25.ª e a 40.ª do dia: nunca é de borla para sempre
  assert.ok(fim >= 25 && fim <= D.maxSteps, 'deixa de compensar à ' + fim + '.ª');
  // 24 h depois volta ao preço de início
  p.addiction = 100; p.addictionT = t + T.DAY; assert.equal(E.detoxCost(p, t + T.DAY), c1);
});

test('slots: comprar bónus pode custar até 10× o máximo por jogada, a ficha continua presa ao máximo, e só com dinheiro na mão', () => {
  const p = cas(1e9); const M = E.casinoMax(p), K = CFG.casino.buyMaxMult, G = CFG.casino.slots.zeus;
  assert.equal(M, 1000); assert.equal(K, 10);
  // ficha de 100 → compra de 10 000 (10× o máximo de 1000): passa. Ficha de 110 → 11 000: não passa e não mexe em nada
  let r = E.casinoPlay(p, NOW, W, 'slot', { game: 'zeus', amt: 100, buy: 1 }, seededRng(5)); assert.equal(r.bet, 100 * G.buy); assert.equal(p.cash, 1e9 - r.bet + r.win);
  const antes = p.cash; assert.throws(() => E.casinoPlay(p, NOW, W, 'slot', { game: 'zeus', amt: 110, buy: 1 }, never), code('BET_TOO_BIG')); assert.equal(p.cash, antes);
  // jogada normal: o máximo de sempre
  assert.throws(() => E.casinoPlay(p, NOW, W, 'slot', { game: 'zeus', amt: M + 1 }, never), code('BET_TOO_BIG'));
  E.casinoPlay(p, NOW, W, 'slot', { game: 'zeus', amt: M }, seededRng(6));
  // compra super do Rebuçado: o mesmo teto (10× o máximo), por isso a ficha é mais pequena
  const S2 = CFG.casino.slots.rebucado.superBuy; assert.throws(() => E.casinoPlay(p, NOW, W, 'slot', { game: 'rebucado', amt: Math.floor((M * K) / S2) + 1, buy: 2 }, never), code('BET_TOO_BIG'));
  assert.ok(Math.floor((M * K) / S2) >= CFG.casino.minBet); E.casinoPlay(p, NOW, W, 'slot', { game: 'rebucado', amt: Math.floor((M * K) / S2), buy: 2 }, seededRng(7));
  // sem dinheiro para a compra: recusa
  const q = cas(9999); assert.throws(() => E.casinoPlay(q, NOW, W, 'slot', { game: 'zeus', amt: 100, buy: 1 }, never), code('NO_CASH')); assert.equal(q.cash, 9999);
  // o prémio nunca passa do teto do jogo vezes a ficha
  const rng = seededRng(11); for (let i = 0; i < 3000; i++) { const x = cas(1e9); const o = E.casinoPlay(x, NOW, W, 'slot', { game: 'zeus', amt: 100, buy: 1 }, rng); assert.ok(o.win <= 100 * G.max); }
});

test('lutas: ninguém ataca a própria gangue, nem para assaltar', () => {
  const t = W.start + CFG.round.noPvpMs + 3 * T.HOUR, sorte = { int: (lo) => lo, chance: () => true, float: () => 0 };
  const a = mk(), d = mk(), x = mk(); for (const q of [a, d, x]) { setResp(q, 500); q.cash = 1000; q.bank = 0; E.touch(q, t); q.energy = 100; q.protectUntil = 0; q.shieldUntil = 0; }
  a.gang = 'g1'; d.gang = 'g1'; x.gang = 'g2';
  assert.equal(E.canAttack(a, d, t, W), 'SAME_GANG');
  for (const m of ['beat', 'mug']) assert.throws(() => E.attack(a, d, t, W, m, sorte), code('SAME_GANG'));
  assert.equal(a.energy, 100); assert.equal(d.cash, 1000); assert.equal(d.hospUntil, 0);
  // de outra gangue, ou sem gangue, ataca-se à vontade
  assert.equal(E.canAttack(a, x, t, W), null); const s = mk(); setResp(s, 500); E.touch(s, t); s.energy = 100; s.shieldUntil = 0; const s2 = mk(); setResp(s2, 500); E.touch(s2, t); s2.protectUntil = 0; s2.shieldUntil = 0;
  assert.equal(E.canAttack(s, s2, t, W), null);
});

test('bolsa: o preço seguinte é em média o de agora (conta exata), a falência zera as ações e a empresa volta a estrear-se', () => {
  const S = CFG.stocks, tot = S.steps.reduce((s, [, w]) => s + w, 0);
  // conta exata: todas as combinações de tamanho do passo e de sentido, com o peso de cada uma
  for (const price of [15, 99, 300, 2500, 12000, 987654]) for (const vol of S.list.map((x) => x.vol)) {
    let soma = 0, min = Infinity, max = 0;
    for (let x = 0; x < tot; x++) for (const sinal of [0, 1]) { const fila = [x, sinal]; const nxt = E.stockStep(price, vol, { int: () => fila.shift() }); soma += nxt; min = Math.min(min, nxt); max = Math.max(max, nxt); }
    assert.equal(soma, price * tot * 2, `média do passo com preço ${price} e passo ${vol}`);
    assert.ok(min > 0 && max - price === price - min);   // sobe tanto quanto desce
  }
  // simulação: 400 000 passos seguidos de cada empresa nunca dão preço negativo e a média de cada passo não foge
  const rng = seededRng(2026);
  for (const c of S.list) { let s = 0; const N = 400000; for (let i = 0; i < N; i++) s += E.stockStep(c.base, c.vol, rng) / c.base; perto(s / N, 1, 0.0006 * (c.vol / 40), 'média de ' + c.id); }
  // mercado: começa no preço de estreia; abaixo de 5% a empresa vai à falência e volta ao preço de estreia com outra geração
  const m = E.newMarket(); assert.deepEqual(m.prices, S.list.map((x) => x.base)); assert.deepEqual(m.gen, S.list.map(() => 0));
  const k = S.list.findIndex((x) => x.id === 'moeda'); assert.equal(E.stockBustAt(k), 15);
  m.prices[k] = 15; const desce = { int: (lo, hi) => (hi === 1 ? 0 : tot - 1) };   // o maior passo, para baixo
  const faliu = E.marketTick(m, desce); assert.ok(faliu.includes(k)); assert.equal(m.prices[k], S.list[k].base); assert.equal(m.gen[k], 1); assert.equal(m.tick, 1);
  // numa ronda inteira (1872 passos) os preços ficam sempre acima do limite de falência e há falências na empresa mais louca
  let falencias = 0; const r2 = seededRng(7);
  for (let ronda = 0; ronda < 60; ronda++) { const mm = E.newMarket(); for (let t = 0; t < 1872; t++) { const b = E.marketTick(mm, r2); falencias += b.length; for (let j = 0; j < S.list.length; j++) assert.ok(mm.prices[j] >= E.stockBustAt(j) && Number.isSafeInteger(mm.prices[j])); } }
  assert.ok(falencias > 5 && falencias < 400, 'falências em 60 rondas: ' + falencias);
});

test('bolsa: comprar e vender paga 1% de cada vez, nunca dá lucro ao mesmo preço, respeita o teto e o preço que se viu', () => {
  const S = CFG.stocks, m = E.newMarket(), k = S.list.findIndex((x) => x.id === 'casino');   // $120,00
  const p = mk(); p.cash = 1e6; p.bank = 0; setResp(p, 20000);
  assert.equal(E.stockCap(p), E.casinoMax(p) * 20);
  // 10 ações a $120 = $1200 + 1% = $1212
  assert.equal(E.stockQuote(m, k, 10), 1212);
  let r = E.stockBuy(p, NOW, W, m, k, 10, 12000);
  assert.equal(r.paid, 1212); assert.equal(r.fee, 12); assert.equal(p.cash, 1e6 - 1212); assert.deepEqual(p.stk[k], { n: 10, cost: 1212, gen: 0 });
  assert.deepEqual(E.stockView(p, m)[k], { n: 10, cost: 1212, value: 1200, tp: 0, sl: 0 });
  // vender 4 ao mesmo preço: $480 − 1% (arredondado contra ti) = $475; o custo desce na mesma proporção
  r = E.stockSell(p, NOW, W, m, k, 4, 12000);
  assert.equal(r.got, 475); assert.equal(r.fee, 5); assert.equal(r.profit, 475 - Math.floor((1212 * 4) / 10)); assert.equal(p.cash, 1e6 - 1212 + 475); assert.deepEqual(p.stk[k], { n: 6, cost: 1212 - 484, gen: 0 });
  // recusas que não mexem em nada
  const antes = structuredClone(p);
  assert.throws(() => E.stockSell(p, NOW, W, m, k, 7), code('NO_SHARES')); assert.throws(() => E.stockBuy(p, NOW, W, m, 99, 1), code('NO_STOCK_CO'));
  for (const n of [0, -1, 1.5, NaN, 2e9]) assert.throws(() => E.stockBuy(p, NOW, W, m, k, n), code('BAD_AMOUNT'));
  assert.throws(() => E.stockBuy(p, NOW, W, m, k, 1, 11999), code('PRICE_CHANGED')); assert.throws(() => E.stockSell(p, NOW, W, m, k, 1, 12001), code('PRICE_CHANGED'));
  assert.throws(() => E.stockBuy(p, NOW, W, null, k, 1), code('NO_MARKET'));
  const pobre = mk(); pobre.cash = 1211; pobre.bank = 0; setResp(pobre, 20000); assert.throws(() => E.stockBuy(pobre, NOW, W, m, k, 10), code('NO_MONEY')); assert.equal(pobre.cash, 1211);
  assert.deepEqual(p, antes);
  // teto: o total investido (o que se pagou pelo que ainda se tem) não passa de 20× a aposta máxima do nível
  const nov = mk(); nov.cash = 1e9; nov.bank = 0; const cap = E.stockCap(nov); assert.equal(cap, 20000);
  const cabe = Math.floor((cap * 100) / (12000 * 1.01)); E.stockBuy(nov, NOW, W, m, k, cabe); assert.ok(nov.stk[k].cost <= cap);
  assert.throws(() => E.stockBuy(nov, NOW, W, m, k, 1), code('STOCK_CAP')); assert.throws(() => E.stockBuy(nov, NOW, W, m, 0, 100), code('STOCK_CAP'));
  E.stockSell(nov, NOW, W, m, k, cabe); assert.deepEqual(nov.stk[k], { n: 0, cost: 0, gen: 0 }); E.stockBuy(nov, NOW, W, m, 0, 1);   // vendeu, o teto fica livre
  // ida e volta ao mesmo preço perde sempre pelo menos 2%, com qualquer quantidade e preço (os arredondamentos são contra o jogador)
  const rng = seededRng(55);
  for (let i = 0; i < 4000; i++) {
    const x = mk(); x.cash = 1e12; x.bank = 0; setResp(x, 1e9); const mm = E.newMarket(), j = rng.int(0, S.list.length - 1); mm.prices[j] = rng.int(E.stockBustAt(j), 500000); const n = rng.int(1, 5000);
    const b = E.stockBuy(x, NOW, W, mm, j, n), v = E.stockSell(x, NOW, W, mm, j, n);
    assert.ok(b.paid - v.got >= Math.floor((n * mm.prices[j]) / 100 / 50), `ida e volta: pagou ${b.paid}, recebeu ${v.got}`); assert.ok(v.got < b.paid); assert.equal(v.profit, v.got - b.paid);
    assert.equal(x.cash, 1e12 - b.paid + v.got); assert.deepEqual(x.stk[j], { n: 0, cost: 0, gen: 0 });
  }
  // falência: as ações deixam de existir (não se vendem, não contam para o teto) e comprar de novo começa do zero
  const f = mk(); f.cash = 1e6; f.bank = 0; setResp(f, 20000); const mf = E.newMarket(); E.stockBuy(f, NOW, W, mf, k, 10);
  mf.gen[k] += 1; mf.prices[k] = S.list[k].base;
  assert.deepEqual(E.stockView(f, mf)[k], { n: 0, cost: 0, value: 0, tp: 0, sl: 0 }); assert.throws(() => E.stockSell(f, NOW, W, mf, k, 1), code('NO_SHARES'));
  E.stockBuy(f, NOW, W, mf, k, 3); assert.deepEqual(f.stk[k], { n: 3, cost: E.stockQuote(mf, k, 3), gen: 1 }); assert.deepEqual(E.checkInvariants(f), []);
});

test('bolsa: nenhuma estratégia ganha à casa (comprar na queda, ir atrás da subida, comprar e esperar)', () => {
  const S = CFG.stocks, rng = seededRng(909);
  const estrategias = {
    queda: (h) => (h.at(-1) < h.at(-2) && h.at(-2) < h.at(-3) ? 'compra' : h.at(-1) > h.at(-2) ? 'vende' : ''),
    subida: (h) => (h.at(-1) > h.at(-2) && h.at(-2) > h.at(-3) ? 'compra' : h.at(-1) < h.at(-2) ? 'vende' : ''),
    esperar: (h) => (h.length === 3 ? 'compra' : ''),
  };
  for (const [nome, f] of Object.entries(estrategias)) {
    let pago = 0, recebido = 0;
    for (let c = 0; c < 2500; c++) {
      const k = c % S.list.length, m = E.newMarket(), p = mk(); p.cash = 1e12; p.bank = 0; setResp(p, 1e9); const h = [m.prices[k]];
      for (let t = 0; t < 150; t++) {
        E.marketTick(m, rng); h.push(m.prices[k]); if (h.length < 3) continue;
        const o = f(h), tem = E.stockView(p, m)[k].n;
        if (o === 'compra' && tem === 0) pago += E.stockBuy(p, NOW, W, m, k, 1000).paid;
        else if (o === 'vende' && tem > 0) recebido += E.stockSell(p, NOW, W, m, k, tem).got;
      }
      recebido += E.stockView(p, m)[k].value;   // o que sobrou vale o preço do fim (sem contar a comissão de vender)
    }
    assert.ok(pago > 0); assert.ok(recebido / pago < 1.0, `${nome}: devolveu ${(recebido / pago * 100).toFixed(2)}%`);
    assert.ok(recebido / pago > 0.9, `${nome}: devolveu só ${(recebido / pago * 100).toFixed(2)}%`);
  }
});

test('putas: roubo raro — só tira, nunca mais do que há, a carteira não chega ao banco', () => {
  const R = CFG.hookers.rob, H = CFG.hookers.list;
  assert.equal(R.bp.length, 4); assert.ok(R.bp.every((b, k) => b > 0 && b <= 200 && (k === 0 || b < R.bp[k - 1])), 'hipótese pequena e menor nas mais caras');
  const tot = R.items.reduce((s, [, w]) => s + w, 0), medio = R.items.reduce((s, [[, m], w]) => s + m * w, 0) / tot;
  assert.ok(medio * R.bp[0] / 10000 < 0.04, 'em média encarece a visita menos de 4%');
  // rng que rouba sempre e escolhe o artigo k
  const ladra = (k) => { let n = 0; return { int: (lo) => { let x = 0; for (let j = 0; j < k; j++) x += R.items[j][1]; return lo + x; }, chance: () => (n++ % 2 === 1), float: () => 0.99 }; };
  R.items.forEach(([[kind, mult]], k) => {
    const p = mk(); p.cash = 1e6; p.bank = 1e6; p.energy = 0;
    const price = E.hookerPrice(p, 3, NOW), r = E.visitHooker(p, NOW, W, 3, ladra(k));
    assert.equal(r.sick, false); assert.deepEqual(r.rob, { kind, loss: price * mult });
    assert.equal(p.cash + p.bank, 2e6 - price - price * mult); assert.equal(p.bank, 1e6); assert.deepEqual(E.checkInvariants(p), []);
  });
  // carteira vazia: não há o que levar; os outros artigos saem do banco, e nunca mais do que existe
  const q = mk(); q.cash = 0; q.bank = 1e6; q.energy = 0; const pq = E.hookerPrice(q, 3, NOW);
  assert.equal(E.visitHooker(q, NOW, W, 3, ladra(0)).rob, null); assert.equal(q.bank, 1e6 - pq);
  const z = mk(); z.energy = 0; const pz = E.hookerPrice(z, 3, NOW); z.cash = pz + 7; z.bank = 0;
  const rz = E.visitHooker(z, NOW, W, 3, ladra(3)); assert.deepEqual(rz.rob, { kind: 'chain', loss: 7 }); assert.equal(z.cash, 0); assert.equal(z.bank, 0);
  // frequência real e no bordel de outro: o dono não recebe nada do roubo
  const rng = seededRng(4242); let n = 0, N = 40000; const f = mk(); f.bank = 0;
  for (let k = 0; k < N; k++) { f.energy = 0; f.sick = false; f.hkN = f.hkN.map(() => 0); f.cash = 1e9; if (E.visitHooker(f, NOW, W, 0, rng).rob) n++; }
  assert.ok(Math.abs(n / N - R.bp[H[0].tier] / 10000) < 0.004, 'frequência ' + n / N);
  const casa = mk(); casa.id = 'casa'; casa.bro = { lvl: 1, till: 0, t: NOW, rem: 0, pi: 2, gd: 0, girls: [3] };
  const cli = mk(); cli.id = 'cli'; cli.cash = 1e6; cli.energy = 0; const base = E.hookerPrice(cli, 3, NOW);
  const v = E.broVisitAt(cli, casa, NOW, W, 0, ladra(2)); assert.deepEqual(v.rob, { kind: 'watch', loss: base * 3 }); assert.equal(casa.bro.till, v.house); assert.equal(cli.cash, 1e6 - v.price - base * 3);
});

test('bolsa: limites de venda — só vendem ao preço do passo, com comissão; não criam dinheiro nem salvam de uma falência num só passo', () => {
  const S = CFG.stocks, m = E.newMarket(), k = S.list.findIndex((x) => x.id === 'casino');   // $120,00
  const p = mk(); p.cash = 1e6; p.bank = 0; setResp(p, 20000);
  assert.throws(() => E.stockLimit(p, NOW, W, m, k, 13000, 11000), code('NO_SHARES'));
  const b = E.stockBuy(p, NOW, W, m, k, 100);
  // o alvo tem de estar acima e o travão abaixo do preço de agora; números tortos são recusados
  assert.throws(() => E.stockLimit(p, NOW, W, m, k, 12000, 0), code('BAD_LIMIT')); assert.throws(() => E.stockLimit(p, NOW, W, m, k, 0, 12000), code('BAD_LIMIT'));
  for (const x of [-1, 0.5, NaN, 2 ** 53, 1e13]) { assert.throws(() => E.stockLimit(p, NOW, W, m, k, x, 0), code('BAD_AMOUNT')); assert.throws(() => E.stockLimit(p, NOW, W, m, k, 0, x), code('BAD_AMOUNT')); }
  assert.throws(() => E.stockLimit(p, NOW, W, m, 99, 13000, 0), code('NO_STOCK_CO')); assert.throws(() => E.stockLimit(p, NOW, W, null, k, 13000, 0), code('NO_MARKET'));
  E.stockLimit(p, NOW, W, m, k, 13000, 11000);
  assert.deepEqual(p.stk[k], { n: 100, cost: b.paid, gen: 0, tp: 13000, sl: 11000 }); assert.deepEqual(E.stockView(p, m)[k], { n: 100, cost: b.paid, value: 12000, tp: 13000, sl: 11000 });
  assert.deepEqual(E.stockAuto(p, m), [], 'dentro dos limites não se vende'); assert.deepEqual(E.checkInvariants(p), []);
  // comprar mais ou vender parte mantém os limites; vender tudo apaga-os
  E.stockBuy(p, NOW, W, m, k, 10); assert.equal(p.stk[k].tp, 13000); E.stockSell(p, NOW, W, m, k, 10); assert.equal(p.stk[k].sl, 11000); assert.equal(p.stk[k].n, 100);
  // o preço salta por cima do alvo: vende ao preço do passo (não ao pedido) e paga 1%
  const custo = p.stk[k].cost, c0 = p.cash; m.prices[k] = 13700;
  let v = E.stockAuto(p, m);
  assert.equal(v.length, 1); assert.deepEqual(v[0], { k, n: 100, price: 13700, got: 13700 - 137, fee: 137, profit: 13700 - 137 - custo, why: 'tp' });
  assert.equal(p.cash, c0 + 13563); assert.deepEqual(p.stk[k], { n: 0, cost: 0, gen: 0 }); assert.deepEqual(E.stockAuto(p, m), []); assert.deepEqual(E.checkInvariants(p), []);
  // travão: o preço cai para baixo dele e vende mais barato do que o travão (o buraco é do jogador)
  m.prices[k] = 12000; E.stockBuy(p, NOW, W, m, k, 100); E.stockLimit(p, NOW, W, m, k, 0, 11000); m.prices[k] = 10400; const c1 = p.cash;
  v = E.stockAuto(p, m); assert.equal(v[0].why, 'sl'); assert.equal(v[0].got, 10400 - 104); assert.ok(v[0].profit < 0); assert.equal(p.cash, c1 + 10296);
  // tirar os limites: 0 e 0
  m.prices[k] = 12000; E.stockBuy(p, NOW, W, m, k, 5); E.stockLimit(p, NOW, W, m, k, 12500, 0); E.stockLimit(p, NOW, W, m, k, 0, 0); assert.deepEqual(p.stk[k], { n: 5, cost: E.stockQuote(m, k, 5), gen: 0 });
  // falência num só passo: o travão não chega a tempo, as ações desaparecem e não entra dinheiro
  E.stockLimit(p, NOW, W, m, k, 0, 11000); m.gen[k] += 1; m.prices[k] = S.list[k].base; const c2 = p.cash;
  assert.deepEqual(E.stockAuto(p, m), []); assert.equal(p.cash, c2); assert.equal(E.stockView(p, m)[k].n, 0);
  // qualquer estratégia de limites perde em média a comissão: simulação com o mercado real
  const rng = seededRng(909); let pago = 0, recebido = 0;
  for (let j = 0; j < 4000; j++) {
    const mm = E.newMarket(), q = mk(); q.cash = 1e9; q.bank = 0; setResp(q, 30000); const kk = j % S.list.length;
    const bb = E.stockBuy(q, NOW, W, mm, kk, 1000); pago += bb.paid;
    E.stockLimit(q, NOW, W, mm, kk, Math.floor(mm.prices[kk] * 1.05) + 1, Math.max(1, Math.floor(mm.prices[kk] * 0.9)));
    for (let t = 0; t < 400 && E.stockView(q, mm)[kk].n > 0; t++) { E.marketTick(mm, rng); for (const x of E.stockAuto(q, mm)) recebido += x.got; }
    if (E.stockView(q, mm)[kk].n > 0) recebido += E.stockSell(q, NOW, W, mm, kk, E.stockView(q, mm)[kk].n).got;
  }
  assert.ok(recebido < pago, `limites não dão lucro: ${recebido} < ${pago}`); assert.ok(recebido > pago * 0.93, 'e só custam a comissão e os saltos');
});

test('fábricas: a produção pode sair em droga ao preço de grosso; vale o mesmo que o dinheiro e só existe nos negócios de droga', () => {
  const B = CFG.biz, iErva = B.findIndex((x) => x.id === 'erva'), iLav = B.findIndex((x) => x.id === 'lavandaria');
  assert.deepEqual(B.filter((x) => x.drug).map((x) => x.id), ['erva', 'laboratorio', 'coca']); for (const x of B) if (x.drug) assert.ok(CFG.drugs.some((d) => d.id === x.drug) && !x.toBank);
  const p = mk(); p.cash = 1e9; p.bank = 0;
  assert.throws(() => E.bizGoods(p, NOW, W, iErva, true), code('NO_BIZ'), 'sem a fábrica não há o que mudar');
  assert.throws(() => E.bizGoods(p, NOW, W, iLav, true), code('NO_BIZ')); for (const x of [-1, 0.5, 99, NaN]) assert.throws(() => E.bizGoods(p, NOW, W, x, true), code('NO_BIZ'));
  E.buyBiz(p, NOW, W, iErva); E.buyBiz(p, NOW, W, iLav);
  assert.deepEqual(E.bizGoods(p, NOW, W, iErva, true), { ok: true, i: iErva, on: true, d: CFG.drugs.findIndex((d) => d.id === 'erva') }); assert.equal(p.biz[iErva].g, true); assert.deepEqual(E.checkInvariants(p), []);
  const t1 = NOW + 5 * T.HOUR, guardado = E.bizStored(p, t1)[iErva].money, c0 = p.cash, b0 = p.bank, d = CFG.drugs.findIndex((x) => x.id === 'erva'), w = E.wholesale(d);
  assert.ok(guardado > 0);
  const r = E.collectBiz(p, t1, W, never), it = r.items.find((x) => x.biz === 'erva'), lav = r.items.find((x) => x.biz === 'lavandaria');
  assert.equal(it.money, guardado); assert.equal(it.units, Math.floor(guardado / w)); assert.equal(it.rest, guardado - it.units * w); assert.equal(it.d, d);
  assert.equal(p.stock[d], it.units); assert.equal(p.cash, c0 + it.rest, 'só o troco entra em dinheiro'); assert.equal(p.bank, b0 + lav.money, 'a lavandaria continua a pagar para o banco');
  assert.ok(E.dumpValue(d, it.units) + it.rest <= guardado, 'despachar logo a seguir nunca rende mais do que ter recebido em dinheiro');
  // voltar a dinheiro
  E.bizGoods(p, t1, W, iErva, false); assert.equal(p.biz[iErva].g, undefined); const c1 = p.cash;
  const r2 = E.collectBiz(p, t1 + 2 * T.HOUR, W, never).items.find((x) => x.biz === 'erva'); assert.equal(r2.units, undefined); assert.equal(p.cash, c1 + r2.money); assert.deepEqual(E.checkInvariants(p), []);
  // a rusga tira antes de converter
  E.bizGoods(p, t1 + 2 * T.HOUR, W, iErva, true); const st = E.bizStored(p, t1 + 6 * T.HOUR)[iErva].money, n0 = p.stock[d];
  const r3 = E.collectBiz(p, t1 + 6 * T.HOUR, W, always).items.find((x) => x.biz === 'erva'); assert.equal(r3.lost, Math.floor(st / 2)); assert.equal(p.stock[d] - n0, Math.floor((st - r3.lost) / w));
});

test('contabilista: armazém de 24 h, fica com 10% só do que passa das 8 h, nunca tira a quem recolhe a horas e não se contrata duas vezes', () => {
  const A = CFG.accountant, i = CFG.biz.findIndex((x) => x.id === 'lavandaria');
  assert.equal(A.capMult, 3); assert.ok(A.feeBp > 0 && A.feeBp <= 2500);
  const novo = mk(); novo.cash = 1e9; assert.throws(() => E.hireAccountant(novo, NOW, W), code('LOW_LEVEL'));
  const pobre = mk(); setResp(pobre, 5000); pobre.cash = A.price - 1; pobre.bank = 0; assert.throws(() => E.hireAccountant(pobre, NOW, W), code('NO_MONEY')); assert.equal(pobre.acct, false);
  const a = mk(), b = mk(); for (const x of [a, b]) { setResp(x, 5000); x.cash = 1e9; x.bank = 0; E.buyBiz(x, NOW, W, i); E.buyBiz(x, NOW, W, i); }
  const c0 = a.cash; assert.deepEqual(E.hireAccountant(a, NOW, W), { ok: true, price: A.price }); assert.equal(a.cash, c0 - A.price); assert.equal(a.acct, true);
  assert.throws(() => E.hireAccountant(a, NOW, W), code('ACCT_HAVE')); assert.equal(a.cash, c0 - A.price);
  const perH = E.bizRates(a, i).perH, cap8 = perH * 8;
  // dentro das 8 h: igual a quem não tem contabilista, sem taxa
  for (const h of [1, 5, 8]) { assert.deepEqual(E.bizStored(a, NOW + h * T.HOUR)[i], { money: perH * h, fee: 0 }); assert.deepEqual(E.bizStored(b, NOW + h * T.HOUR)[i], { money: perH * h, fee: 0 }); }
  // 20 h: sem ele ficou nas 8 h; com ele há 20 h guardadas e ele fica com 10% das 12 h a mais
  assert.equal(E.bizStored(b, NOW + 20 * T.HOUR)[i].money, cap8);
  assert.deepEqual(E.bizStored(a, NOW + 20 * T.HOUR)[i], { money: perH * 20, fee: Math.floor((perH * 12 * A.feeBp) / 10000) });
  // muito tempo fora: enche às 24 h e para
  assert.equal(E.bizStored(a, NOW + 90 * T.HOUR)[i].money, perH * 24);
  const ba = a.bank, bb = b.bank, ra = E.collectBiz(a, NOW + 90 * T.HOUR, W, never).items[0], rb = E.collectBiz(b, NOW + 90 * T.HOUR, W, never).items[0];
  assert.equal(rb.money, cap8); assert.equal(rb.fee, 0); assert.equal(b.bank, bb + cap8);
  assert.equal(ra.fee, Math.floor((perH * 16 * A.feeBp) / 10000)); assert.equal(ra.money, perH * 24 - ra.fee); assert.equal(a.bank, ba + ra.money);
  assert.ok(ra.money > rb.money && ra.money < perH * 24, 'ganha mais do que sem ele, mas menos do que as 24 h inteiras');
  assert.deepEqual(E.checkInvariants(a), []); assert.deepEqual(E.checkInvariants(b), []);
  // contratar com o armazém já cheio não ressuscita o que se perdeu
  const c = mk(); setResp(c, 5000); c.cash = 1e9; E.buyBiz(c, NOW, W, i); const t = NOW + 30 * T.HOUR;
  E.hireAccountant(c, t, W); assert.equal(E.bizStored(c, t)[i].money, E.bizRates(c, i).perH * 8); assert.equal(E.bizStored(c, t + 2 * T.HOUR)[i].money, E.bizRates(c, i).perH * 10);
});
