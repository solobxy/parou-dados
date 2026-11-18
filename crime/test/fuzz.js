// Teste ao calhas: milhões de ações aleatórias (válidas e inválidas) em muitos jogadores.
// Verifica: (1) só há erros de regra (GameError), nunca falhas do código;
// (2) os invariantes valem sempre; (3) uma ação recusada não muda nada.
// Uso: node test/fuzz.js [ações] [semente]

import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { CFG, T } from '../engine/config.js';
import * as E from '../engine/engine.js';
import { seededRng } from '../engine/rng.js';
import * as MW from '../engine/mundo.js';

const ACTIONS = +(process.argv[2] ?? 1_000_000);
const r = seededRng(+(process.argv[3] ?? 7));
const game = seededRng(99);
const START = Date.UTC(2026, 10, 20, 21, 0);
const world = { start: START, playEnd: START + 13 * T.DAY };

const players = [];
let now = START;
// um em cada três já tem armazéns no Alentejo e no Algarve (como se os tivesse comprado), para as cargas entre regiões acontecerem
const novo = (i) => { const q = E.newPlayer('f' + i, now, world); if (i % 3 === 0) for (const rr of ['al', 'ag']) q.wh[rr] = { sp: 1, hd: 1, fr: 1, h: 0, f: 0, s: CFG.drugs.map(() => 0) }; return q; };
for (let i = 0; i < 60; i++) players.push(novo(i));

const pick = (arr) => arr[r.int(0, arr.length - 1)];
const anyInt = () => pick([0, 1, -1, 100, 1e6, 2 ** 53, 0.5, NaN, r.int(0, 1e7)]);
const counts = {};
const MAPA = process.env.FUZZ_MAPA ? {} : null;
let market = E.newMarket();
// o mercado das regiões (passo 6, parte 2) vive no mundo; fica à parte da bolsa daqui, que é a das regras antigas
const mundoNovo = () => { const m = E.newMarket(); m.w = MW.newWorld(m.prices, START); return m; };
let mk = mundoNovo();
const REG = ['lx', 'al', 'ag'];
let refused = 0, done = 0, rounds = 1;

// (4) as contas batem certo: cada ação só mexe no dinheiro e no respeito o que a regra diz, e nada cria dinheiro do nada
const wealth = (q) => q.cash + q.bank;
const LAV_MAX_BP = CFG.launder.bp + CFG.gov.laws.branq.addBp;   // a lei do branqueamento (v76) pode somar à taxa
const MAX_LOOT_BP = 10000 + CFG.gang.lootBpPer * CFG.gang.maxLevel + CFG.skills.maxBp + Math.max(...CFG.classes.map((c) => c.lootBp || 0)) + Math.max(...CFG.drugs.flatMap((g) => (g.fx || []).filter((f) => f.k === 'loot').map((f) => f.bp))) + Math.max(0, ...CFG.studies.list.map((x) => (x.fx.burla || [0]).at(-1)))   // v81: artes;
// respeito máximo de um golpe de rua que correu bem: a barra mais rica (120) a dividir pela hipótese, mais o bónus de profissão e o resto guardado
const MAX_STREET_RESP = Math.max(...CFG.crimes.map((c) => Math.ceil((CFG.street.respCap * c.e * (10000 + Math.max(...CFG.classes.map((k) => k.respBp || 0)))) / c.p / 100))) + 1;
const balas = (q) => (q.inv.find((x) => x.id === 'balas') || { n: 0 }).n;
const MAX_PVP = Math.floor(((CFG.pvp.gainBase + CFG.tiers.length) * 2 * (10000 + Math.max(...CFG.classes.map((c) => c.pvpBp || 0)))) / 10000);
function contas(kind, a0, a, d0, d, t, res, arg) {
  const av = ((a.avN || 0) - (a0.avN || 0)) * CFG.retainer.day;   // o dia da avença, pago no primeiro ato do dia, não é da ação
  // a multa de uma carga parada pela polícia paga-se quando a carga chega, com a ação que vier a seguir: também não é da ação
  const mvNovas = (a.mvLog || []).filter((x) => !(a0.mvLog || []).some((y) => y.at === x.at && y.d === x.d && y.n === x.n && y.b === x.b && y.a === x.a)), mf = mvNovas.reduce((s, x) => s + x.fine, 0);
  const dm = wealth(a) - wealth(a0) + av + mf, dr = a.respect - a0.respect;
  const chegou = (rr, dd) => mvNovas.filter((x) => x.x !== 2 && x.b === rr && x.d === dd).reduce((s2, x) => s2 + x.n, 0);   // o que chegou a essa região com a ação
  if (av < 0 || av > CFG.retainer.day) { console.error('CONTAS ERRADAS avença paga mais de uma vez', kind, av); process.exit(1); }
  if ((a.ilegal || 0) < (a0.ilegal || 0)) { console.error('CONTAS ERRADAS total de crime desceu', kind); process.exit(1); }
  const bad = (m) => { console.error('CONTAS ERRADAS', kind, m, JSON.stringify(res), { dm, dr }); if (process.env.DBG && res && res.r) { const s0 = res.r === 'lx' ? E.venueView(a0, t).stock : a0.wh[res.r].s; console.error('s0', s0[res.d], 's1', E.whStock(a, res.r)[res.d], 'chegou', chegou(res.r, res.d), 'mvNovas', JSON.stringify(mvNovas), 'cost min', Math.floor((res.n * MW.refC(res.d) * 0.2) / 100)); } process.exit(1); };
  // v79: a vitrine só cresce com golpes que correm bem e aviões que chegam inteiros, e só desce no museu e no penhorista
  // (v85: comparado com o estado depois do touch: uma escavação esquecida fecha sozinha e guarda o saco na vitrine)
  const b0col = touched(a0, t).col || {};
  const colD = {}; for (const id of new Set([...Object.keys(b0col), ...Object.keys(a.col || {})])) { const x = ((a.col || {})[id] || 0) - (b0col[id] || 0); if (x) colD[id] = x; }
  const colEq = (m) => JSON.stringify(Object.entries(colD).sort()) === JSON.stringify(Object.entries(m).filter(([, v]) => v).sort());
  const RARAS = CFG.col.sets.raras.items;
  if (kind === 'crime' && !colEq(res.col ? { [res.col]: 1 } : {})) bad('vitrine: golpe');
  if (kind === 'crime' && res.col && (!res.success || !RARAS.includes(res.col))) bad('vitrine: peça de golpe');
  if (kind === 'crimeAll' && (!colEq(res.col || {}) || Object.keys(res.col || {}).some((id) => !RARAS.includes(id)) || Object.values(res.col || {}).reduce((x, y) => x + y, 0) > res.wins)) bad('vitrine: vários golpes');
  if (kind === 'airCollect' && (!colEq(res.col ? { [res.col]: 1 } : {}) || (res.col && (res.seized || res.col !== CFG.col.route[CFG.air.routes[a0.air.r].id])))) bad('vitrine: avião');
  if (!['crime', 'crimeAll', 'airCollect', 'museum', 'colSell', 'feiraTake', 'feiraGive', 'feiraBuy', 'digTap', 'digStop'].includes(kind) && Object.keys(colD).length) bad('vitrine mexeu sem razão');
  if (Object.values(a.col || {}).some((v) => !Number.isInteger(v) || v < 0)) bad('vitrine negativa');
  // v83: o depósito só cresce com biscates (o material do ofício) e com o que se recolhe da bancada; só desce ao começar uma receita
  const b0mt = touched(a0, t).mt || {};   // (v86: uma escavação esquecida fecha sozinha e o material raro vai para o depósito)
  const mtD = {}; for (const id of new Set([...Object.keys(b0mt), ...Object.keys(a.mt || {})])) { const x = ((a.mt || {})[id] || 0) - (b0mt[id] || 0); if (x) mtD[id] = x; }
  const mtEq = (m) => JSON.stringify(Object.entries(mtD).sort()) === JSON.stringify(Object.entries(m).filter(([, v]) => v).sort());
  if (kind === 'workDone' && !mtEq(res.mat ? { [res.mat.id]: res.mat.n } : {})) bad('depósito: biscate');
  if (kind === 'workDone' && res.mat && (res.busted || res.shift || res.mat.id !== CFG.mat.drop[res.id] || res.mat.n + res.mat.lost !== (res.q >= CFG.mat.good ? 2 : 1))) bad('depósito: material do biscate');
  if (kind === 'craftStart') { const R = E.recipeOf(res.id), comp = R.kind === 'comp', gasto = Object.fromEntries(Object.entries(R.needs).map(([k, v]) => [k, -v * res.n]));
    if (comp) gasto[res.id] = (gasto[res.id] || 0) + res.n;
    if (!mtEq(gasto) || dm !== (comp ? -res.price : -res.price * res.n) || res.price !== E.recipePrice(a0, R) * (comp ? res.n : 1) || res.price > R.price * res.n || dr !== 0) bad('cave: fazer');   // v90: o armeiro paga menos
    if (comp ? JSON.stringify(touched(a0, t).cf) !== JSON.stringify(a.cf) || res.n > CFG.craft.batch : touched(a0, t).cf || !a.cf || a.cf.id !== res.id || a.cf.end !== t + E.recipeMs(a0, R) || a.cf.end > t + R.ms || res.n !== 1) bad('cave: bancada ao fazer'); }
  if (kind === 'craftTake') { const R = E.recipeOf(res.id), c0 = touched(a0, t).cf;
    if (!c0 || c0.end > t || c0.id !== res.id || a.cf !== null || dm !== 0 || dr !== 0 || Object.keys(mtD).length) bad('cave: recolher');
    if ((R.kind === 'tool' || R.kind === 'gun' || R.kind === 'gear') && a.inv.filter((x) => x.id === res.id).length !== a0.inv.filter((x) => x.id === res.id).length + 1) bad('cave: inventário');
    if (R.kind === 'maq' && (a.maq[R.biz] !== t + CFG.craft.rev.ms || a0.maq[R.biz])) bad('cave: máquina'); }
  if (kind === 'maqService') { const V = CFG.craft.rev, u0 = touched(a0, t).maq[res.id];
    if (!mtEq(Object.fromEntries(Object.entries(V.needs).map(([k, v]) => [k, -v]))) || dm !== -V.price || dr !== 0 || a.maq[res.id] !== Math.max(u0, t) + V.ms || u0 - t > V.maxMs - V.ms) bad('cave: revisão'); }
  if (kind === 'repair' && !mtEq(res.kit ? { kit: -1 } : {})) bad('reparar: kit');
  if (kind === 'repair' && res.kit && dm !== 0) bad('reparar com kit não paga');
  // v84: a feira (o motor só faz a parte de cada jogador; o servidor junta as duas)
  if (kind.startsWith('feira')) { const d = res, invN0 = a0.inv.filter((x) => x.id === d.id).length, invN1 = a.inv.filter((x) => x.id === d.id).length, sinal = kind === 'feiraTake' ? -1 : kind === 'feiraLock' ? 0 : 1;
    const box = d.kind === 'mt' ? mtD : d.kind === 'col' ? colD : null;
    if (kind !== 'feiraLock' && (box ? (box[d.id] || 0) !== sinal * d.n || Object.keys(mtD).length + Object.keys(colD).length !== 1 : invN1 - invN0 !== sinal || Object.keys(mtD).length + Object.keys(colD).length)) bad('feira: o que mexeu');
    if (dm !== (kind === 'feiraBuy' ? -d.price : kind === 'feiraLock' ? -d.amount : 0) || dr !== 0) bad('feira: dinheiro');
    if (d.kind === 'mt' && (a.mt[d.id] || 0) > CFG.mat.cap && sinal > 0) bad('feira: passou o teto do depósito'); }
  if (!['workDone', 'craftStart', 'craftTake', 'maqService', 'repair', 'feiraTake', 'feiraGive', 'feiraBuy', 'digTap', 'digStop'].includes(kind) && Object.keys(mtD).length) bad('depósito mexeu sem razão');
  if (!['craftStart', 'craftTake'].includes(kind) && JSON.stringify(touched(a0, t).cf) !== JSON.stringify(a.cf)) bad('bancada mexeu sem razão');
  if (!['craftTake', 'maqService'].includes(kind) && JSON.stringify(a0.maq || {}) !== JSON.stringify(a.maq || {})) bad('máquinas mexeram sem razão');
  // v85: escavações
  { const b0 = touched(a0, t), d0 = b0.dg, conta = (L) => L.reduce((o, x) => ((o[x] = (o[x] || 0) + 1), o), {});
    // o saco ao sair: os achados na vitrine; o material raro no depósito (até ao teto)
    const guardou = (got) => { const R = CFG.mat.rare, raros = conta(got.filter((x) => R.includes(x))), espera = Object.fromEntries(Object.entries(raros).map(([k, v]) => [k, Math.min(CFG.mat.cap, (b0.mt[k] || 0) + v) - (b0.mt[k] || 0)]));
      return colEq(conta(got.filter((x) => !R.includes(x)))) && mtEq(espera); };
    const igual = (x, y) => JSON.stringify(x.dg) === JSON.stringify(y.dg) && JSON.stringify(x.dgc) === JSON.stringify(y.dgc);   // (há ações que não passam pelo touch)
    if (!kind.startsWith('dig') && !igual(b0, a) && !igual(a0, a)) bad('escavação mexeu sem razão');
    if (kind === 'digStart') { const S = E.siteOf(arg);
      if (d0 || !a.dg || a.dg.site !== arg || a.dg.used !== 0 || dm !== -S.price || dr !== 0 || Object.keys(colD).length || Object.keys(mtD).length || (b0.dgc[arg] || 0) > t || E.stLevel(a, 'arqueologia') < S.st) bad('escavar: começar'); }
    if (kind === 'digTap') {
      if (!d0 || dm !== 0 || dr !== 0) bad('escavar: pazada');
      else if (res.caught) { if (a.dg || Object.keys(colD).length || Object.keys(mtD).length || !(a.jailUntil > t) || !(a.dgc[d0.site] > t) || E.digRiskBp(d0.used + 1, d0.safe) === 0) bad('escavar: ronda'); }
      else { const got = [...d0.got, ...(res.v ? [res.v] : [])];
        if (res.v && !d0.cells[arg]) bad('escavar: achado onde não havia');
        if (!res.v && d0.cells[arg]) bad('escavar: achado escondido');
        if (res.end ? a.dg || !guardou(got) : a.dg.used !== d0.used + 1 || JSON.stringify(a.dg.got) !== JSON.stringify(got) || Object.keys(colD).length || Object.keys(mtD).length) bad('escavar: saco'); } }
    if (kind === 'digStop' && (!d0 || a.dg || !guardou(d0.got) || dm !== 0 || dr !== 0 || !(a.dgc[d0.site] > t))) bad('escavar: sair'); }
  switch (kind) {
    case 'gymStart': if (dm !== 0 || dr !== 0 || !a.gs || a.vigor !== touched(a0, t).vigor || E.STATS.some((k) => a.stats[k] !== a0.stats[k])) bad('ginásio: começar'); break;
    case 'gymDone': { const g = touched(a0, t).gs, S = CFG.train.set, b0 = touched(a0, t), n = E.gymReps(g, t - g.t0);
      const m = b0.sx[g.stat] + res.marks.reduce((x, k) => x + S.q[k] / 10, 0);
      if (dm !== 0 || dr !== 0 || a.gs !== null || res.reps !== n || res.marks.length !== n || a.vigor !== b0.vigor - n * CFG.train.energy || a.stats[g.stat] !== b0.stats[g.stat] + Math.floor(m / 1000) || a.sx[g.stat] !== Math.round(m - Math.floor(m / 1000) * 1000) || res.gain > Math.ceil((n * S.q[0]) / 10000) + 1) bad('ginásio: série');
      if (arg.some((x) => x > t - g.t0 + S.slack)) bad('ginásio: toque do futuro aceite');
      if (E.STATS.some((k) => k !== g.stat && a.stats[k] !== a0.stats[k])) bad('ginásio: outra stat');
      break; }
    case 'examStart': { const c0 = touched(a0, t).course; if (dm !== 0 || dr !== 0 || !a.course || !a.course.q || (c0 && c0.q && JSON.stringify(c0.q) !== JSON.stringify(a.course.q))) bad('exame: começar'); break; }
    case 'examAnswer': { const c0 = touched(a0, t).course;
      if (dm !== 0 || dr !== 0 || !c0 || !c0.q) bad('exame: responder');
      const ok = c0.q.ids.every((qi, k) => c0.q.p[k][arg[k]] === CFG.exam.ans[E.examBank(c0.id)][qi]);
      if (ok !== res.pass) bad('exame: nota errada');
      if (!res.pass && (!a.course || a.course.end !== c0.end || a.course.next !== t + E.examRetry(c0.id) || a.course.why !== 'wrong' || JSON.stringify(a.course.last.sel) !== JSON.stringify(arg))) bad('exame: chumbo');
      if (res.pass && res.done !== !a.course) bad('exame: diploma');
      if (res.pass && !res.done && !res.cut && (c0.cuts < CFG.exam.cuts || a.course.end !== c0.end)) bad('exame: sem corte');
      if (res.pass && !res.done && res.cut && (a.course.end !== c0.end - res.cut || res.cut !== Math.floor((CFG.courses.find((x) => x.id === c0.id).days * T.DAY * CFG.exam.cutBp) / 10000) || a.course.cuts !== c0.cuts + 1 || a.course.cuts > CFG.exam.cuts)) bad('exame: corte');
      if (res.done && !a.done.includes(c0.id)) bad('exame: sem diploma');
      break; }
    case 'museum': { const S = CFG.col.sets[arg], k = (a0.mus || {})[arg] > 0 ? 1 : 2;
      // v85: nos conjuntos das escavações, as repetidas pagam digRepBp e não dão respeito
      const pc = k === 2 ? S.cash * 2 : S.dig ? Math.floor((S.cash * CFG.col.digRepBp) / 10000) : S.cash, pr = k === 2 ? S.resp * 2 : S.dig ? 0 : S.resp;
      if (!colEq(Object.fromEntries(S.items.map((i) => [i, -1]))) || dm !== pc || dr !== pr || res.first !== (k === 2) || a.mus[arg] !== ((a0.mus || {})[arg] || 0) + 1) bad('museu'); break; }
    case 'colSell': if (!colEq({ [arg.id]: -res.n }) || res.n < 1 || dm !== res.n * CFG.col.pawn || dr !== 0 || a.col[arg.id] < 1) bad('penhorista'); break;
    case 'crime': {
      const c = CFG.crimes[arg], ammo = c.gun ? CFG.bullets.perJob : 0, maxOne = Math.floor((c.prizes.at(-1)[2] * MAX_LOOT_BP) / 10000);
      if (res.ammo !== ammo || balas(a0) - balas(a) !== ammo || (c.gun && !E.gunOf(a0)) || E.level(a0) < c.level) bad('golpe: arma, balas ou nível');
      if (res.success) {
        if (dm !== res.money || res.money < 0 || res.value > maxOne || res.money > res.value || (res.good && res.money) || !c.prizes.some((x) => x[3] === res.item)) bad('saque fora dos limites');
        if (dr !== res.respect || res.respect < 0 || res.respect > MAX_STREET_RESP) bad('respeito do golpe');
        if (![10000, ...CFG.street.heat].includes(res.heatBp)) bad('calor');
      } else if (dm !== 0 || dr !== 0) bad('falhou mas mexeu');
      if (a.energy !== Math.min(E.energyMax(a0), touched(a0, t).energy) - c.e) bad('golpe: stamina gasta');
      break;
    }
    case 'crimeAll': {
      const c = CFG.crimes[arg], maxOne = Math.floor((c.prizes.at(-1)[2] * MAX_LOOT_BP) / 10000);
      if (dm !== res.money || (res.value || 0) > res.wins * maxOne || res.ammo !== (c.gun ? res.n * CFG.bullets.perJob : 0)) bad('saque de vários golpes');
      if (res.respect !== dr || dr < 0 || dr > res.wins * MAX_STREET_RESP) bad('respeito de vários golpes');
      if (res.n < 1 || res.n > CFG.crimeAllMax || res.wins > res.n) bad('contagem');
      const e0 = Math.min(E.energyMax(a0), touched(a0, t).energy);
      if (a.energy !== e0 - res.n * c.e) bad('stamina gasta');
      const budget = Math.min(CFG.crimeAllMax, Math.floor(e0 / c.e));
      if (!res.busted && res.n !== budget && !(c.gun && (balas(a) < CFG.bullets.perJob || !(a.eq[E.gunOf(a)].u > 0)))) bad('não fez os golpes que a stamina dava');
      if (res.busted && res.n > budget) bad('fez golpes a mais');
      if (a.c.crimes - a0.c.crimes !== res.n || a.c.wins - a0.c.wins !== res.wins) bad('contadores');
      break;
    }
    case 'buy': {
      if (arg.id === 'balas') { if (dm !== -arg.n * CFG.bullets.price || balas(a) - balas(a0) !== arg.n * CFG.bullets.box) bad('balas'); }
      else if (CFG.gear.find((x) => x.id === arg.id).slot === 'mat') { if (dm !== -CFG.gear.find((x) => x.id === arg.id).price || a.inv.length - a0.inv.length !== 1 || a.inv.filter((x) => x.id === arg.id).length !== 1) bad('compra de material'); }
      else { const g = CFG.gear.find((x) => x.id === arg.id); if (dm !== -E.gearPrice(g) || res.price !== E.gearPrice(g) || a.eq[g.slot].id !== arg.id || a.inv.length - a0.inv.length !== (a0.eq[g.slot] ? 1 : 0)) bad('compra de equipamento'); }
      if (E.invUsed(a) > E.invCap(a) && E.invUsed(a) > E.invUsed(a0)) bad('inventário acima dos espaços');
      if (dr !== 0) bad('compra mexeu no respeito');
      break;
    }
    case 'equip': if (dm !== 0 || dr !== 0 || a.inv.length > a0.inv.length) bad('equipar'); break;
    case 'unequip': if (dm !== 0 || dr !== 0 || a.inv.length !== a0.inv.length + 1 || E.invUsed(a) > E.invCap(a)) bad('tirar do corpo'); break;   // v93
    case 'sell': case 'sellGoods': if (dm !== res.money || res.money < 0 || dr !== 0 || a.inv.length >= a0.inv.length) bad('recetador'); break;
    case 'repair': { const g = CFG.gear.find((x) => x.id === a.eq[arg].id); if (dm !== -res.price || a.eq[arg].u !== g.life || dr !== 0) bad('reparar'); break; }
    // golpes grandes (passo 5)
    case 'opStart': { const o = CFG.ops[arg]; if (dm !== -o.cost || !a.op || a.op.i !== arg || a.op.ready !== t + o.prepH * T.HOUR || E.level(a0) < o.level || a0.op || dr !== 0) bad('preparar golpe grande'); break; }
    case 'opStep': if (dm !== -res.price || res.price <= 0 || !a.op[arg] || a0.op[arg] || a.op.paid !== a0.op.paid + res.price) bad('passo da preparação'); break;
    case 'opDrop': if (dm !== 0 || a.op !== null || res.lost !== a0.op.paid) bad('desistir do golpe grande'); break;
    case 'opGo': {
      const o = CFG.ops[res.i];
      if (a.op !== null || a.opPause !== t + o.pauseH * T.HOUR || t < a0.op.ready || res.i !== a0.op.i) bad('avançar: estado');
      if (res.chanceBp > CFG.opSteps.maxBp || res.chanceBp < o.p || res.rasto < CFG.opSteps.minRasto || res.rasto > o.rasto) bad('avançar: hipótese ou rasto');
      if (res.success) { if (dm !== res.money || res.money + res.lav !== o.gain || res.lav < 0 || res.lav > Math.ceil((o.gain * LAV_MAX_BP) / 10000) || dr !== res.respect || res.respect !== Math.round(CFG.opSteps.respK * Math.sqrt(o.gain))) bad('avançar: correu bem'); }
      else if (dr !== 0 || dm !== -res.lawyer || res.lawyer > o.lawyer || (a0.op.bribe && (res.lawyer || res.busted))) bad('avançar: correu mal');
      if (!!(res.busted || res.linked) !== (a.jailUntil > t)) bad('avançar: prisão');
      if (o.gun && (balas(a0) - balas(a) !== CFG.opSteps.bullets)) bad('avançar: balas');
      break;
    }
    case 'retainer': if (dm !== 0 || a.avenca !== res.on || (res.on && a.avD === null)) bad('avença'); break;
    case 'jailSmuggle': if (dm !== res.money || res.money > Math.floor((E.streetPerBar(a0) * CFG.jail.smuggleE) / 200) || dr !== 0 || !(a0.jailUntil > t)) bad('contrabando'); break;
    case 'jailWork': if (dm !== CFG.jail.work || dr !== 0) bad('oficina'); break;
    case 'jailYard': if (Math.abs(dm) !== E.yardBet(a0) || a.stats.F !== a0.stats.F + 1 || dr !== 0) bad('pátio'); break;
    case 'jailCards': if (Math.abs(dm) !== arg || arg > CFG.jail.cardsMax || dr !== 0) bad('cartas'); break;
    case 'jailFavor': if (dm !== 0 || a.jf !== touched(a0, t).jf + 1 || (arg === 'time' ? a.jailUntil > a0.jailUntil : a.contacts !== a0.contacts + 1)) bad('favor'); break;
    case 'jailEscape': if (dm !== 0 || (res.free ? a.jailUntil !== 0 : a.jailUntil < a0.jailUntil)) bad('fuga'); break;
    case 'deal': {
      const x = CFG.deal.list[arg], d = CFG.drugs.findIndex((g) => g.id === x.drug), g = Math.floor((x.perBar * CFG.deal.step) / 100);
      if (res.grams !== g || dm + res.lav !== Math.floor((g * CFG.drugs[d].price * (10000 + E.skillBp(a0, 'trafico'))) / 10000) || res.money !== dm || res.lav < 0 || res.lav > Math.ceil((dm + res.lav) * LAV_MAX_BP / 10000) || dr !== res.respect || res.respect < 1 || a.dst[arg] !== a0.dst[arg] - g || E.level(a0) < x.level) bad('venda de droga');
      if (a.energy !== Math.min(E.energyMax(a0), touched(a0, t).energy) - CFG.deal.step) bad('venda: stamina');
      if (E.dealUsed(a, t) > E.dealCap(a)) bad('venda acima da clientela');
      break;
    }
    case 'dealBuy': {
      const x = CFG.deal.list[arg.j];
      if (dm !== -res.price || res.price !== arg.kg * x.kg || a.dst[arg.j] !== a0.dst[arg.j] + arg.kg * 1000 || dr !== 0 || E.level(a0) < x.level) bad('compra para vender');
      break;
    }
    case 'shift': {
      const x = CFG.jobs.list[a0.job];
      if (!x || dm !== res.money || res.money !== E.shiftPay(x, res.n) || res.n !== E.shiftsToday(a0, t) + 1 || res.n > CFG.jobs.perDay || dr !== CFG.jobs.resp) bad('turno: dinheiro ou contagem');
      if (a.vigor !== touched(a0, t).vigor - CFG.jobs.shiftE || a.energy !== touched(a0, t).energy) bad('turno: energia');
      break;
    }
    case 'job': if (dm !== 0 || dr !== 0 || !E.jobOpen(a, a.job)) bad('emprego'); break;
    case 'consume': { const it = E.consumOf(arg); if (!it || dm !== -it.price || dr !== 0 || (it.level && E.level(a0) < it.level) || E.consumWait(a, it.fam, t) > CFG.consum.cap[it.fam] || (it.fam === 'med' ? a.hospUntil > a0.hospUntil : a.hospUntil > t) || a.energy > E.energyMax(a) || a.vigor > CFG.vigor.max) bad('consumível'); break; }
    case 'govVote': if (dm !== 0 || dr !== 0 || E.level(a0) < CFG.gov.vote.minLevel) bad('voto'); break;
    case 'govLobby': if (dm !== -arg || arg < CFG.gov.vote.minLobby || dr !== 0 || E.level(a0) < CFG.gov.vote.minLevel) bad('dinheiro no parlamento'); break;
    case 'course': { const c = CFG.courses.find((x) => x.id === arg); const b0 = touched(a0, t); if (dm !== -c.price || dr !== 0 || a.course.id !== arg || b0.done.includes(arg) || b0.course) bad('curso'); break; }
    case 'refill': if (dm !== -res.price || res.price < 1 || a.energy !== E.energyMax(a) || dr !== 0 || a.addiction !== touched(a0, t).addiction) bad('barra a droga'); break;
    case 'casino': {
      // slots ao cêntimo (17/11): o que entra e sai conta-se em cêntimos, com os cêntimos da mão (p.cent)
      const dC = (wealth(a) - wealth(a0) + av + mf) * 100 + (a.cent || 0) - (a0.cent || 0);
      if (res.g === 'slot' ? dC !== res.winC - res.betC || res.betC !== res.baseC * (res.buy === 2 ? CFG.casino.slots[res.game].superBuy : res.buy === 1 ? CFG.casino.slots[res.game].buy : 1) : dm !== res.win - res.bet || dr !== 0) bad('casino: dinheiro não bate com a aposta e o prémio');
      if (dr !== 0) bad('casino: respeito');
      if (res.g !== 'slot' && res.bet && res.bet > E.casinoMax(a0)) bad('casino: aposta acima do máximo');
      if (res.g === 'slot' && (res.baseC > E.casinoMax(a0) * 100 || res.baseC < CFG.casino.slotMinC)) bad('slot: aposta fora dos limites');
      const staked = res.g === 'bj' ? (res.done ? res.hand.bet : res.bet) : res.bet;
      const maxMult = res.g === 'roulette' ? 36 : res.g === 'dice' ? 6 : res.g === 'bj' ? 3 : CFG.casino.maxWinMult;
      if (res.g === 'slot' ? res.winC > res.baseC * CFG.casino.slots[res.game].max : res.win > staked * maxMult) bad('casino: prémio acima do possível');
      if (a.bank !== a0.bank) bad('casino mexeu no banco');
      break;
    }
    case 'table': {
      // apostar na mesa ao vivo e receber o prémio: no fim só pode faltar a aposta e sobrar o prémio
      if (dm !== res.win - res.total + res.before || dr !== 0) bad('mesa: dinheiro não bate com a aposta e o prémio');
      if (res.total > E.casinoMax(a0)) bad('mesa: aposta acima do máximo');
      if (res.win > res.total * (res.g === 'roulette' ? 36 : CFG.casino.maxWinMult)) bad('mesa: prémio acima do possível');
      if (a.bank !== a0.bank) bad('mesa mexeu no banco');
      break;
    }
    case 'heist': {
      const H = CFG.gang.heists[arg], eu = (res.parts || []).find((x) => x.id === a.id);
      if (res.refund || !res.success) { if (dm !== 0 || dr !== 0) bad('golpe em grupo falhado ou devolvido mexeu no dinheiro ou no respeito'); }
      else if (dm !== eu.money || !(eu.share >= 0 && eu.share <= 10000) || eu.money > Math.floor((Math.floor((H.max * eu.share) / 10000) * (10000 + CFG.gang.lootBpPer * CFG.gang.maxLevel)) / 10000) || (eu.share === 10000 && eu.money < H.min)
        || dr !== eu.respect || eu.respect < 1 || eu.respect > H.r || res.parts.reduce((s, x) => s + x.share, 0) > res.parts.length * 10000) bad('golpe em grupo: saque ou respeito');
      if (res.refund && a.energy !== Math.min(E.energyMax(a), touched(a0, t).energy)) bad('golpe em grupo: a stamina não voltou');
      break;
    }
    case 'hit': {
      const eu = (res.parts || []).find((x) => x.id === a.id);
      if (dm !== 0) bad('tareia em grupo mexeu no dinheiro');
      if (res.refund) { if (dr !== 0) bad('tareia devolvida mexeu no respeito'); }
      else if (dr !== Math.max(eu.respect, -a0.respect) || (res.win ? eu.respect < 0 : eu.respect > 0)) bad('tareia em grupo: respeito');
      if (!res.refund && res.win && d.respect - d0.respect !== -Math.min(res.targetLoss, d0.respect)) bad('tareia em grupo: o alvo perdeu mais de uma vez');
      break;
    }
    case 'gangCreate': if (dm !== -CFG.gang.createCost || dr !== 0) bad('criar gangue'); break;
    case 'gangDonate': if (dm !== -arg || dr !== 0 || arg < CFG.gang.donateMin) bad('dar ao cofre'); break;
    case 'gangLeave': if (dm !== res.refund + res.stored || dr !== 0 || res.refund !== Math.floor(a0.gbz.reduce((x, y) => x + y.inv, 0) / 2) || a.gbz.some((x) => x.inv || x.stored || x.coop)) bad('sair da gangue'); break;
    case 'gangBiz': if (dm !== -arg.amount || dr !== 0 || arg.amount < CFG.gang.bizMin || a.gbz[arg.k].inv !== a0.gbz[arg.k].inv + arg.amount || a.gbz[arg.k].inv > E.gangBizCap(a, arg.k)) bad('negócio da gangue: investir'); break;
    case 'gangBizCollect': { const max = a0.gbz.reduce((x, y, k) => x + Math.floor((y.inv * CFG.gang.biz[k].rateBp * 15) / 100000) * (CFG.storageMs / T.HOUR), 0); if (dm !== res.money || dr !== 0 || res.money < 0 || res.money > max || a.gbz.some((x) => x.stored)) bad('negócio da gangue: receber'); break; }
    case 'bailFor': case 'medicFor': if (dm !== -res.cost || res.cost < 1 || dr !== 0 || d.cash + d.bank !== d0.cash + d0.bank || d.respect !== d0.respect || a0.gang !== d0.gang || !a0.gang || (kind === 'bailFor' ? d.jailUntil !== 0 || !(d0.jailUntil > t) : d.hospUntil !== 0 || !(d0.hospUntil > t))) bad('safar um membro'); break;
    case 'air': if (dm !== -res.paid || dr !== 0 || res.paid !== arg.amount + (arg.bribe ? Math.ceil(arg.amount * 0.2) : 0) || arg.amount > E.airCap(a0) || a0.air) bad('avião: pagamento'); break;
    case 'airCollect': { const f = a0.air, R = CFG.air.routes[f.r]; const full = f.amount + Math.floor((f.amount * R.gainBp) / 10000);
      if (!res.seized && res.units !== undefined && (Math.ceil(((res.units + res.over) * E.wholesaleC(res.d)) / 100) + res.rest !== full || res.rest < 0 || a.stock[res.d] !== E.venueView(a0, t).stock[res.d] + res.units || CFG.drugs[res.d].id !== R.drug || res.overGot > Math.floor((res.over * E.wholesaleC(res.d)) / 100))) bad('avião: mercadoria');
      if (res.seized ? (dm !== 0 || dr !== 0) : (dm !== (res.units !== undefined ? res.rest + res.overGot : full - res.lav) || res.lav < 0 || dr !== R.r) || f.readyAt > t || a.air !== null) bad('avião: chegada'); break; }
    case 'deposit': if (dm !== -res.fee || res.fee < 1 || res.fee !== Math.ceil((arg * E.bankFeeBp(a)) / 10000) || dr) bad('taxa do banco'); break;
    case 'withdraw': case 'class': case 'avatar': if (dm !== 0 || dr !== 0) bad('devia ser neutro'); break;
    case 'classChange': if (dm !== -E.classChangeCost(a0) || dr !== 0 || res.cost !== E.classChangeCost(a0) || a.cls === a0.cls || (CFG.classes.find((c) => c.id === a.cls).need || 0) > a0.peakRespect || (a0.clsAt && t < a0.clsAt + CFG.classChange.coolMs)) bad('mudar de profissão'); break;
    case 'claim': if (dm !== res.cash || dr !== 0) bad('prémio'); break;
    case 'collect': { const st = E.bizStored(a0, t).reduce((x, y) => x + y.money, 0); if (dm < 0 || dm > st || dr !== 0) bad('recolha maior do que o armazém'); break; }   // v89: o efeito da coca já está no que se guardou
    case 'collectPort': {
      const due = a0.port.filter((c) => c.readyAt <= t).reduce((x, c) => x + c.amount + Math.floor((c.amount * CFG.port.ships[c.k === undefined ? CFG.port.legacy : c.k].gainBp) / 10000), 0);
      if (dm < 0 || dm > due || dr !== 0) bad('porto pagou a mais'); break;
    }
    case 'portOpen': {   // abre-se um só, que já tinha chegado: sai da lista, os outros ficam, e paga no máximo o que esse devia
      const c = a0.port.find((x) => x.readyAt === arg), k = c && (c.k === undefined ? CFG.port.legacy : c.k);
      if (!c || c.readyAt > t) bad('abriu um contentor que não existia ou ainda não tinha chegado');
      const due = c.amount + Math.floor((c.amount * CFG.port.ships[k].gainBp) / 10000), it = res.item;
      if (a.port.length !== a0.port.length - 1 || it.amount !== c.amount || it.k !== k || dr !== 0) bad('contentor: saiu mais do que um ou o errado');
      if (it.seized ? dm !== 0 || it.got !== 0 : (it.units === undefined ? it.got !== due - (it.lav || 0) : it.got !== due) || dm < 0 || dm > due) bad('contentor pagou o que não devia');
      if (res.left !== a.port.filter((x) => x.readyAt <= t).length) bad('contentor: os que faltam abrir estão mal contados');
      break;
    }
    case 'hitman': {
      const H = CFG.hitman, preco = Math.max(H.priceMin, d0.respect * H.pricePerRespect);
      if (dm !== -preco || res.price !== preco || dr !== 0) bad('assassino: quem paga só perde o preço');
      if (E.sameCrew(a0, d0)) bad('assassino na própria gangue');
      if (E.level(a0) < H.minLevel || d0.respect * 10000 < a0.respect * CFG.pvp.minTargetBp || d0.shieldUntil > t || d0.hmSafe > t || d0.hospUntil > t) bad('assassino contra quem não podia');
      if (a.hmT.length > H.perDay || a.hmT.filter((x) => x > t - CFG.pvp.windowMs).length > H.perDay) bad('assassino: mais de 3 por dia');
      if (res.chanceBp !== Math.max(H.minBp, H.baseBp - (d0.guard >= 0 ? CFG.guards[d0.guard].block : 0))) bad('assassino: pontaria');
      if (res.success) {
        if (d0.respect - d.respect !== res.respLoss || res.respLoss !== Math.floor((d0.respect * H.respBp) / 10000) || d0.cash - d.cash !== res.cashLoss || res.cashLoss !== Math.floor((d0.cash * H.cashBp) / 10000) || d.bank !== d0.bank) bad('assassino: o que o alvo perdeu');
        if (!(d.hospUntil > t) || d.hospUntil > t + H.hospMs || d.hmSafe !== t + H.immuneMs) bad('assassino: hospital e proteção do alvo');
      } else if (d.respect !== d0.respect || wealth(d) !== wealth(d0) || d.hospUntil !== touched(d0, t).hospUntil || d.hmSafe !== d0.hmSafe) bad('assassino falhou mas o alvo mudou');
      break;
    }
    case 'attack': {
      const vv = E.venueView(d0, Math.max(t, d0.t));
      const max = Math.floor((d0.cash * CFG.pvp.mugBp) / 10000) + E.bizStored(d0, t).reduce((x, y, i) => x + (CFG.biz[i].raid ? Math.floor((y.money * CFG.pvp.mugBp) / 10000) : 0), 0) + ['club', 'bro'].reduce((x, k) => x + (vv[k] ? Math.floor((vv[k].till * CFG.pvp.mugBp) / 10000) : 0), 0);
      if (dm < 0 || dm > max || wealth(d) > wealth(d0) || d.bank !== d0.bank) bad('assalto');
      // o alvo é posto em dia antes do ataque (uma carga que a polícia parou paga a multa nesse momento): isso não é do ataque
      if (touched(d0, t).cash - d.cash > dm) bad('o alvo perdeu mais do que o atacante ganhou');
      if (E.sameCrew(a0, d0)) bad('atacou a própria gangue');
      if (res.win && res.mode === 'mug' && wealth(d0) - wealth(d) + ['club', 'bro'].reduce((x, k) => x + (vv[k] ? vv[k].till - d[k].till : 0), 0) + E.bizStored(d0, t).reduce((x, y, i) => x + y.money - d.biz[i].stored, 0) !== dm) bad('o que saiu do alvo não é o que entrou no atacante');
      if (res.win && res.mode === 'mug' && dm !== res.money) bad('saque diferente do resultado');
      if (Math.abs(dr) > MAX_PVP || Math.abs(d.respect - d0.respect) > MAX_PVP) bad('respeito da luta fora dos limites');
      if (res.win && d.respect > d0.respect) bad('o alvo ganhou respeito ao perder');
      break;
    }
    case 'buyBiz': if (dm !== -res.price || dr !== CFG.biz[arg].resp) bad('negócio'); break;
    case 'venueBuy': { const C = CFG.venue[arg], l0 = a0[arg] ? a0[arg].lvl : 0; if (dm !== -C.cost[l0] || dr !== C.resp[l0] || a[arg].lvl !== l0 + 1) bad('comprar casa'); break; }
    case 'venueSet': case 'broFire': case 'missionSwap': case 'bizGoods': case 'stockLimit': if (dm !== 0 || dr !== 0) bad('devia ser neutro'); break;
    case 'port': if (dm !== -arg || dr !== 0 || a.port.length !== a0.port.length + 1 || a.port.at(-1).readyAt !== t + CFG.port.ships[res.k].ms || E.level(a0) < CFG.port.ships[res.k].level) bad('porto: paga-se o que se envia, no barco certo'); break;
    case 'acct': if (dm !== -CFG.accountant.price || dr !== 0 || !a.acct) bad('contabilista'); break;
    case 'hooker': if (dm !== -res.price - (res.rob ? res.rob.loss : 0) || dr !== 0 || (res.rob && !(res.rob.loss > 0 && res.rob.loss <= 5 * res.price))) bad('visita à puta'); break;
    case 'stockBuy': { const h = E.stockView(a, market), bruto = Math.ceil((arg.n * market.prices[arg.k]) / 100);
      if (dm !== -res.paid || dr !== 0 || res.paid !== bruto + Math.ceil((bruto * CFG.stocks.feeBp) / 10000) || h[arg.k].n !== arg.h0[arg.k].n + arg.n || h[arg.k].cost !== arg.h0[arg.k].cost + res.paid) bad('bolsa: compra');
      if (h.reduce((x, y) => x + y.cost, 0) > E.stockCap(a0)) bad('bolsa: passou o teto');
      break; }
    case 'stockSell': { const h = E.stockView(a, market), bruto = Math.floor((arg.n * market.prices[arg.k]) / 100);
      if (dm !== res.got || dr !== 0 || res.got > bruto || res.got < bruto - Math.ceil((bruto * CFG.stocks.feeBp) / 10000) || h[arg.k].n !== arg.h0[arg.k].n - arg.n || arg.n > arg.h0[arg.k].n || h[arg.k].cost > arg.h0[arg.k].cost) bad('bolsa: venda');
      break; }
    case 'venueCollect': { const v = E.venueView(a0, t); const due = (v.club ? v.club.till : 0) + (v.bro ? v.bro.till : 0); if (dm !== due || res.club + res.bro !== due || dr !== 0 || (a.club && a.club.till) || (a.bro && a.bro.till)) bad('recolha das casas'); break; }
    case 'stockUse': { const v = E.venueView(a0, t); if (dm !== 0 || dr !== 0 || a.stock[arg] !== v.stock[arg] - 1) bad('tomar do armazém'); break; }
    // regiões e armazéns: cada um mexe no dinheiro e no stock exatamente o que diz
    case 'whBuy': if (dm !== -res.cost || dr !== 0 || a0.wh[res.r] || !a.wh[res.r] || res.cost !== CFG.wh[res.r].price) bad('comprar armazém'); break;
    case 'whUp': if (dm !== -res.cost || dr !== 0 || a.wh[res.r][res.k] !== a0.wh[res.r][res.k] + 1 || res.cost <= 0) bad('melhorar armazém'); break;
    case 'mktBuy': { const s0 = res.r === 'lx' ? E.venueView(a0, t).stock : a0.wh[res.r].s, s1 = E.whStock(a, res.r);
      if (dm !== -res.cost || dr !== 0 || s1[res.d] !== s0[res.d] + (res.r === 'lx' ? 0 : chegou(res.r, res.d)) + res.n || res.cost < Math.floor((res.n * MW.refC(res.d) * 0.2) / 100)) bad('comprar no mercado'); break; }
    case 'mktSell': { const s0 = res.r === 'lx' ? E.venueView(a0, t).stock : a0.wh[res.r].s, s1 = E.whStock(a, res.r);
      if (dm !== res.got || dr !== 0 || s1[res.d] !== s0[res.d] + (res.r === 'lx' ? 0 : chegou(res.r, res.d)) - res.n || res.got > (res.n * MW.refC(res.d) * 4) / 100) bad('vender no mercado'); break; }
    case 'mvSend': { const s0 = res.a === 'lx' ? E.venueView(a0, t).stock : a0.wh[res.a].s, s1 = E.whStock(a, res.a);
      if (dm !== 0 || dr !== 0 || s1[res.d] !== s0[res.d] + (res.a === 'lx' ? 0 : chegou(res.a, res.d)) - res.n || a.mv.length !== a0.mv.length - mvNovas.length + 1 || res.at !== t + E.mvHops(res.a, res.b) * CFG.mv.hopMs) bad('mudar de região'); break; }
    case 'whEdition': if (dm > 0 || dr !== 0 || REG.some((x) => a0.wh[x] && E.whStock(a, x).some((n, k) => n > E.whStock(a0, x)[k]))) bad('rusga deu dinheiro ou stock'); break;
    case 'stockDump': { const v = E.venueView(a0, t); if (dm !== res.got || res.got > Math.floor((arg.n * E.wholesaleC(arg.d)) / 100) || res.got !== E.dumpValue(arg.d, arg.n) || a.stock[arg.d] !== v.stock[arg.d] - arg.n || dr !== 0) bad('despachar'); break; }
    case 'broHire': { const g = CFG.hookers.list[arg]; if (dm !== -CFG.venue.bro.hire[g.tier] || dr !== 0 || a.bro.girls.length !== a0.bro.girls.length + 1 || a.bro.girls.length > CFG.venue.bro.rooms[a.bro.lvl - 1]) bad('contratar'); break; }
    case 'clubBuyAt': { const v = E.venueView(d0, Math.max(t, d0.t));
      if (dm !== -res.price || dr !== 0 || d.club.till !== v.club.till + res.price || d.stock[arg] !== v.stock[arg] - 1 || wealth(d) !== wealth(d0) || d.respect !== d0.respect) bad('compra na discoteca de outro');
      if (res.price < E.wholesale(arg) || res.price > Math.floor((CFG.drugs[arg].price * 12000) / 10000) || (!E.sameCrew(a0, d0) ? res.price !== Math.max(1, Math.floor((CFG.drugs[arg].price * CFG.venue.prices[d0.club.pi]) / 10000)) : false)) bad('preço na discoteca de outro');
      break; }
    case 'broVisitAt': { const v = E.venueView(d0, Math.max(t, d0.t));
      if (dm !== -res.price - (res.rob ? res.rob.loss : 0) || (res.rob && !(res.rob.loss > 0 && res.rob.loss <= 5 * E.hookerPrice(a0, res.i, t))) || dr !== 0 || d.bro.till !== v.bro.till + res.house || wealth(d) !== wealth(d0) || d.respect !== d0.respect) bad('visita ao bordel de outro');
      if (res.house < 0 || res.house * 3 > res.price + 3 || d0.bro.girls[arg] !== res.i) bad('parte da casa no bordel');
      break; }
    case 'luxury': { const base = CFG.luxury.list[a0.luxuries].price, tax = E.lawsOn().includes('luxo') ? Math.floor((base * CFG.gov.laws.luxo.bp) / 10000) : 0;   // v76: imposto do luxo
      if (dm !== -res.price || dr !== Math.floor(Math.sqrt(base)) || res.price !== base + tax || (res.tax || 0) !== tax) bad('luxo'); break; }
    case 'house': if (dm !== -res.price || dr !== res.respect) bad('casa'); break;
    case 'workStart': if (dm !== 0 || dr !== 0 || !a.tk || a.tk.id !== res.task.id) bad('biscate: começar'); break;
    case 'workDone': if (res.shift) { if (dm !== res.money || dr !== CFG.jobs.resp || a.tk || res.money > Math.ceil((E.shiftPay(CFG.jobs.list[a.job], res.n) * CFG.jobs.qMax) / 10000)) bad('turno à mão'); break; }
      if (dm !== res.money || dr !== 0 || a.tk || res.money < 0 || (res.busted && (res.money !== 0 || !(a.jailUntil > t))) || (!res.busted && res.money > Math.ceil((CFG.work.list.find((x) => x.id === res.id).base * CFG.work.qMax * (10000 + CFG.work.ritmo.cap)) / 1e8)) || (a.wm && a.wm[res.id]) !== res.ritmo || Math.abs(res.ritmo - res.ritmoAntes) > CFG.work.ritmo.drop) bad('biscate: entregar'); break;
    default: if (dm > 0 || dr !== 0) bad('esta ação só devia gastar'); // discoteca, putas, hospital, treino, porto (envio), equipamento, melhorias
  }
  if (a.energy > E.energyMax(a) || a.energy < 0) bad('stamina');
  if (a.vigor > CFG.vigor.max || a.vigor < 0) bad('energia');
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
    players.length = 0; market = E.newMarket(); mk = mundoNovo();
    for (let i = 0; i < 60; i++) players.push(novo(i));
    rounds++;
  }
  let t = now;
  if (r.chance(50)) t = pick([world.playEnd, world.start - 1, world.playEnd + T.DAY, now - 1000]); // horas inválidas

  const p = (r.chance(6000) && players.find((q) => q.dg)) || pick(players);   // v85: quem tem uma escavação aberta volta a ela muitas vezes
  const d = pick(players);
  if (r.chance(200)) { p.cash += r.int(0, 5e6); } // dá dinheiro para chegar a tudo
  if (r.chance(60) && E.level(p) < 30) { p.respect = p.peakRespect = CFG.levels[29]; } // e nível para o mercado das regiões (comprar coca pede o 25)
  if (r.chance(3000) && p.wh) { const rr = pick(REG); if (p.wh[rr]) E.whStock(p, rr)[pick([1, 3, 6, 11, 13])] += r.int(1, 400); } // droga num armazém de uma região, como a que vem de lá
  if (r.chance(1500)) { // a bolsa mexe (às vezes com falências) e, a seguir a cada passo, os limites de venda de toda a gente
    E.marketTick(market, game);
    for (const q of players) {
      const w0 = wealth(q), v0 = E.stockView(q, market), vs = E.stockAuto(q, market); let got = 0;
      for (const v of vs) { got += v.got; const h = v0[v.k];
        if (v.n !== h.n || v.got > h.value || v.got < 0 || v.profit !== v.got - h.cost || E.stockView(q, market)[v.k].n !== 0 || !(v.why === 'tp' ? h.tp && market.prices[v.k] >= h.tp : h.sl && market.prices[v.k] <= h.sl)) { console.error('CONTAS ERRADAS limite da bolsa', JSON.stringify(v), JSON.stringify(h)); process.exit(1); } }
      if (wealth(q) - w0 !== got) { console.error('CONTAS ERRADAS limite da bolsa: dinheiro', wealth(q) - w0, got); process.exit(1); }
      for (let k = 0; k < v0.length; k++) if (v0[k].n > 0 && ((v0[k].tp && market.prices[k] >= v0[k].tp) || (v0[k].sl && market.prices[k] <= v0[k].sl)) && !vs.some((v) => v.k === k)) { console.error('FALHA limite da bolsa não vendeu', k); process.exit(1); }
      const bad2 = E.checkInvariants(q); if (bad2.length) { console.error('INVARIANTE limite da bolsa', bad2); process.exit(1); }
    }
  }
  if (r.chance(300)) p.shieldUntil = now + pick([T.HOUR, 20 * T.HOUR]); // jogador que entrou tarde: escudo
  if (r.chance(300)) { p.stock[r.int(0, CFG.drugs.length - 1)] += r.int(1, 60); } // mercadoria no armazém, como a que vem do porto
  // casas já montadas (para as compras entre jogadores, os preços e os despedimentos terem onde acontecer)
  for (const q of [p, d]) {
    if (r.chance(700) && !q.club) { q.club = { lvl: r.int(1, 8), till: 0, t: q.t, rem: 0, pi: r.int(0, 4), gd: r.int(0, 3) }; q.stock[r.int(0, CFG.drugs.length - 1)] += r.int(1, 40); q.stock[r.int(0, CFG.drugs.length - 1)] += r.int(1, 40); }
    if (r.chance(700) && !q.bro) { const lvl = r.int(1, 5); q.bro = { lvl, till: 0, t: q.t, rem: 0, pi: r.int(0, 4), gd: r.int(0, 3), girls: Array.from({ length: r.int(1, CFG.venue.bro.rooms[lvl - 1]) }, () => r.int(0, CFG.hookers.list.length - 1)) }; }
  }
  if (r.chance(400) && !p.gang) { if (r.chance(3000)) E.gangSet(p, CFG.gang.bot.id, 1, 0); else E.gangSet(p, 'g' + r.int(1, 3), r.int(1, 5), r.int(0, 5)); } // o servidor pôs-te numa gangue (para os golpes e tareias em grupo terem quem os faça)
  if (r.chance(2500)) { p.energy = r.int(0, CFG.energy.max); p.energyT = Math.min(p.energyT, p.t); } // gasta stamina para chegar à discoteca, às putas e ao hospital
  if (r.chance(2500)) { p.vigor = r.int(0, CFG.vigor.max); p.vigorT = Math.min(p.vigorT, p.t); } // e energia, para o ginásio e as lutas
  if (r.chance(300)) { const x = r.int(0, CFG.levels[r.int(0, CFG.levels.length - 1)]); p.respect = x; p.peakRespect = Math.max(p.peakRespect, x); } // jogadores de todos os níveis
  // armas gastas de vez em quando (nos golpes gastam-se devagar), para a reparação ser posta à prova
  if (r.chance(2000)) for (const sl of ['mao', 'principal']) if (p.eq[sl] && p.eq[sl].u !== undefined) p.eq[sl].u = r.int(0, CFG.gear.find((g) => g.id === p.eq[sl].id).life);
  if (r.chance(800) && !(p.jailUntil > t)) { p.jailUntil = t + r.int(1, 90) * T.MIN; p.jailTier = r.chance(5000) ? 100 + r.int(0, CFG.ops.length - 1) : r.int(1, CFG.crimes.length); p.jailT0 = t; p.jf = 0; } // preso, para a prisão ter que fazer
  if (r.chance(4000) && p.op) p.op.ready = Math.min(p.op.ready, Math.max(p.op.t0, t)); // a preparação acabou
  if (r.chance(4000) && p.op) { // e às vezes já tem o material, a arma e as balas
    const o = CFG.ops[p.op.i]; p.house = Math.max(p.house, 5);
    for (const id of o.mat) if (!p.inv.some((x) => x.id === id)) p.inv.push({ id });
    if (o.gun) { if (!p.eq.mao) p.eq.mao = { id: 'pistola', u: 20 }; const b = p.inv.find((x) => x.id === 'balas'); if (b) b.n += 50; else p.inv.push({ id: 'balas', n: 50 }); }
  }
  if (p.tk && r.chance(7000)) p.tk.t0 = Math.min(p.tk.t0, t - r.int(0, 30000));   // o biscate a meio: às vezes já passou o tempo mínimo
  // v76: as leis do Estado mudam de vez em quando (qualquer combinação, qualquer corrupção), antes das fotografias de antes; as contas têm de bater na mesma
  if (r.chance(200)) E.setGov(r.chance(3000) ? null : { laws: Object.fromEntries(Object.keys(CFG.gov.laws).filter(() => r.chance(4000)).map((id) => [id, 1])), corr: r.int(0, 100) });
  if (r.chance(150) && !(p.jailUntil > t)) p.hospUntil = Math.max(p.hospUntil || 0, t + r.int(1, 300) * 60000);   // v78: às vezes internado, para a farmácia
  // v80: às vezes a meio de um curso com exame (para o exame ter que fazer), e às vezes com o exame aberto
  if (r.chance(300) && !p.course) { const c = pick(CFG.courses.filter((x) => !p.done.includes(x.id))); if (c) { const D = c.days * T.DAY, t0 = t - r.int(0, D + T.DAY); p.course = { id: c.id, end: t0 + D, t0, ex: 1, cuts: r.int(0, CFG.exam.cuts), next: r.chance(3000) ? t + r.int(1, 600) * 60000 : 0, q: null }; } }
  if (r.chance(3000) && p.course && p.course.ex && !p.course.q) { const B = CFG.exam.ans[E.examBank(p.course.id)].length, ids = []; while (ids.length < CFG.exam.n) { const i = r.int(0, B - 1); if (!ids.includes(i)) ids.push(i); } p.course.q = { ids, p: ids.map(() => { const x = [0, 1, 2, 3]; for (let i = 3; i > 0; i--) { const j = r.int(0, i); [x[i], x[j]] = [x[j], x[i]]; } return x; }), t: t - r.int(0, 20) * 60000 }; }
  if (r.chance(800)) for (const id of E.matIds()) if (r.chance(5000)) p.mt[id] = r.int(1, CFG.mat.cap);   // v83: depósito com coisas, para a cave ter que fazer
  if (r.chance(300) && !p.cf) { const R = pick(CFG.craft.list.filter((x) => x.kind !== 'comp')), t0 = t - r.int(0, 10) * 3600000; p.cf = { id: R.id, t0, end: t0 + R.ms }; }
  if (r.chance(400)) { const i = r.int(0, CFG.biz.length - 1); p.maq[CFG.biz[i].id] = t + r.int(-10, 14) * T.DAY + r.int(0, 86399) * 1000; if (r.chance(7000) && !p.biz[i].n) { p.biz[i].n = 1; p.biz[i].t = t; } }   // máquinas a trabalhar, a acabar ou paradas
  if (r.chance(500)) Object.assign(p.mt, { chapa: r.int(1, 5), circuito: r.int(1, 5), reagente: r.int(1, 5), kit: r.int(1, 3) });   // o que a revisão e a reparação gastam
  if (r.chance(500)) { if (!p.eq.mao) p.eq.mao = { id: 'pistola', u: 20 }; for (const sl of ['mao', 'principal']) if (p.eq[sl] && p.eq[sl].u !== undefined) p.eq[sl].u = r.int(0, Math.max(0, p.eq[sl].u - 1)); }   // armas gastas, para reparar
  if (r.chance(600) && !p.gs) p.gs = { stat: pick(['F', 'T', 'I', 'C']), reps: pick([5, 10]), t0: t - r.int(0, 200) * 1000 };   // v82: série a meio
  if (r.chance(500)) for (let k = 1; k <= r.int(1, 3); k++) if (!p.done.includes('arqueologia' + k) && !(p.course && p.course.id === 'arqueologia' + k)) p.done.push('arqueologia' + k);   // v85: escavações
  if (r.chance(400)) { const st = pick(CFG.studies.list), n = r.int(1, 3); for (let k = 1; k <= n; k++) if (!p.done.includes(st.id + k) && !(p.course && p.course.id === st.id + k)) p.done.push(st.id + k); }   // v81: estudos feitos
  if (r.chance(500)) for (const i of E.colItems()) if (r.chance(7000)) p.col[i] = (p.col[i] || 0) + r.int(1, 3);   // v79: peças na vitrine, para o museu e o penhorista terem que fazer
  const before = touched(p, t), beforeD = touched(d, t), origD = structuredClone(d), origP = structuredClone(p);
  const kind = p.dg && r.chance(8500) ? pick(['digTap', 'digTap', 'digTap', 'digTap', 'digTap', 'digStop']) : pick(['stockBuy', 'stockBuy', 'stockBuy', 'govVote', 'govLobby', 'govLobby', 'consume', 'consume', 'consume', 'museum', 'museum', 'colSell', 'colSell', 'examStart', 'examStart', 'examAnswer', 'examAnswer', 'examAnswer', 'gymStart', 'gymStart', 'gymDone', 'gymDone', 'gymDone', 'craftStart', 'craftStart', 'craftStart', 'craftTake', 'craftTake', 'maqService', 'maqService', 'feiraTake', 'feiraTake', 'feiraGive', 'feiraBuy', 'feiraBuy', 'feiraLock', 'digStart', 'digStart', 'digTap', 'digTap', 'digTap', 'digTap', 'digTap', 'digStop', 'stockSell', 'stockSell', 'missionSwap', 'venueBuy', 'venueBuy', 'venueSet', 'venueCollect', 'stockUse', 'stockUse', 'stockDump', 'broHire', 'broHire', 'broFire', 'clubBuyAt', 'clubBuyAt', 'clubBuyAt', 'broVisitAt', 'broVisitAt', 'broVisitAt', 'casino', 'casino', 'table', 'heist', 'hit', 'gangCreate', 'gangDonate', 'gangLeave', 'gangBiz', 'gangBiz', 'gangBiz', 'gangBizCollect', 'hitman', 'hitman', 'hitman', 'crime', 'crime', 'crimeAll', 'deal', 'deal', 'dealBuy', 'drug', 'refill', 'detox', 'claim', 'class', 'classChange', 'classChange', 'air', 'air', 'airCollect', 'airCollect', 'bailFor', 'bailFor', 'medicFor', 'medicFor', 'avatar', 'hooker', 'cure', 'house', 'houseUp', 'buyBiz', 'buyBiz', 'collect', 'bizGoods', 'bizGoods', 'stockHold', 'stockHold', 'acct', 'stockLimit', 'stockLimit', 'stockLimit', 'port', 'collectPort', 'portOpen', 'portOpen', 'deposit', 'withdraw', 'gear', 'attack', 'bail', 'medic', 'luxury', 'shift', 'shift', 'shift', 'job', 'course', 'buy', 'buy', 'buy', 'buy', 'equip', 'unequip', 'unequip', 'sell', 'sellGoods', 'sellGoods', 'repair', 'repair', 'opStart', 'opStart', 'opStep', 'opStep', 'opGo', 'opGo', 'opGo', 'opDrop', 'retainer', 'jailSmuggle', 'jailWork', 'jailYard', 'jailCards', 'jailFavor', 'jailEscape', 'whBuy', 'whBuy', 'whUp', 'whUp', 'mktBuy', 'mktBuy', 'mktBuy', 'mktSell', 'mktSell', 'mvSend', 'mvSend', 'mvSend', 'whEdition', 'workStart', 'workStart', 'workDone', 'workDone', 'workDone']);
  let res, arg;
  try {
    switch (kind) {
      case 'crime': arg = r.chance(9000) ? r.int(0, CFG.crimes.length) : anyInt(); res = E.doCrime(p, t, world, arg, game); break;
      case 'deal': arg = r.chance(9000) ? r.int(0, CFG.deal.list.length) : anyInt(); res = E.deal(p, t, world, arg); break;
      case 'shift': res = E.doShift(p, t, world); break;
      case 'govVote': res = E.govVoteCheck(p, t, world); break;
      case 'consume': arg = r.chance(9000) ? pick(CFG.consum.list).id : 'x'; res = E.consume(p, t, world, arg); break;
      case 'examStart': res = E.examStart(p, t, world, game); break;
      case 'gymStart': res = E.gymStart(p, t, world, pick(['F', 'T', 'I', 'C', 'X']), pick([5, 10, 5, 7, 0])); break;
      case 'gymDone': { const S = CFG.train.set, n = p.gs ? p.gs.reps : 5; arg = r.chance(4000) ? Array.from({ length: n }, (_, k) => S.lead + k * S.beat + r.int(-300, 300)) : r.chance(5000) ? Array.from({ length: r.int(0, 20) }, () => r.int(0, 15000)) : pick([null, 'x', [-1], [1e9], [NaN], [S.lead, S.lead + S.beat, S.lead + 2 * S.beat, S.lead + 3 * S.beat]]); res = E.gymDone(p, t, world, arg); break; }
      case 'examAnswer': { const c = p.course; arg = r.chance(5000) && c && c.q ? c.q.ids.map((qi, k) => c.q.p[k].indexOf(CFG.exam.ans[E.examBank(c.id)][qi])) : r.chance(8000) ? [r.int(0, 3), r.int(0, 3), r.int(0, 3)] : pick([null, [0, 0], [0, 0, 4], [0.5, 0, 0], 'x']); res = E.examAnswer(p, t, world, arg); break; }
      case 'museum': arg = pick(['mundo', 'raras', 'mundo', 'raras', 'castrejo', 'mertola', 'x', 'constructor', '__proto__']); res = E.museumGive(p, t, world, arg); break;
      case 'craftStart': arg = { id: r.chance(9000) ? pick(CFG.craft.list).id : pick(['x', 'toString', '__proto__']), n: pick([1, 1, 1, 2, 5, 6, 0, -1, 0.5]) }; res = E.craftStart(p, t, world, arg.id, arg.n); break;   // v83
      case 'craftTake': res = E.craftTake(p, t, world); break;
      case 'feiraTake': { const k = pick(['mt', 'col', 'inv', 'x']); arg = { k, id: k === 'mt' ? pick(E.matIds()) : k === 'col' ? pick(E.colItems()) : pick(['broca', 'x']), n: pick([1, 1, 2, 5, 0, -1, 0.5, 1000]), i: r.int(-1, Math.max(0, p.inv.length)) }; res = E.feiraTake(p, t, world, arg.k, arg.id, arg.n, arg.i); break; }
      case 'feiraGive': case 'feiraBuy': { const k = pick(['mt', 'col', 'inv']), id = k === 'mt' ? pick(E.matIds()) : k === 'col' ? pick(E.colItems()) : pick(CFG.gear).id, g = CFG.gear.find((x) => x.id === id);
        arg = { kind: k, id, n: k === 'inv' ? 1 : r.int(1, 12), o: k === 'inv' && g && g.gun ? { id, u: r.int(0, g.life) } : null };
        res = kind === 'feiraGive' ? E.feiraGive(p, t, world, arg) : E.feiraBuy(p, t, world, arg, pick([1, 100, 5000, 1e6, 0, -3, 0.5])); break; }
      case 'feiraLock': res = E.feiraLock(p, t, world, pick([1, 100, 5000, 1e6, 0, -3, 0.5, anyInt()])); break;
      case 'digStart': arg = r.chance(9000) ? pick(CFG.dig.sites).id : pick(['x', 'toString', '__proto__']); res = E.digStart(p, t, world, r, arg); break;   // v85
      case 'digTap': arg = r.chance(9000) ? r.int(0, CFG.dig.size ** 2 - 1) : pick([-1, 36, 0.5, NaN, '3']); res = E.digTap(p, t, world, r, arg); break;
      case 'digStop': res = E.digStop(p, t, world); break;
      case 'maqService': arg = r.chance(9000) ? pick(CFG.biz).id : pick(['x', 'toString', '__proto__']); res = E.maqService(p, t, world, arg); break;
      case 'colSell': arg = { id: r.chance(9000) ? pick(E.colItems()) : pick(['toString', 'x']), n: pick([1, 1, 2, 5, 0, -1, 0.5, anyInt()]) }; res = E.colSell(p, t, world, arg.id, arg.n); break;
      case 'govLobby': arg = pick([100, 1000, 50000, 99, 0, -5, 0.5, 2e12, anyInt()]); res = E.govLobby(p, t, world, arg); break;
      case 'buy': arg = r.chance(3000) ? { id: 'balas', n: pick([1, 1, 2, 5, 0, -1, 101, 0.5]) } : { id: r.chance(9500) ? pick(CFG.gear).id : 'x' + r.int(0, 9) }; res = E.buyItem(p, t, world, arg.id, arg.n); break;
      case 'equip': arg = r.chance(9000) ? r.int(0, Math.max(0, p.inv.length - 1)) : anyInt(); res = E.equip(p, t, world, arg); break;
      case 'unequip': arg = r.chance(9000) ? pick(CFG.slots) : pick(['mat', '__proto__', 'x', '']); res = E.unequip(p, t, world, arg); break;   // v93
      case 'sell': arg = r.chance(9000) ? r.int(0, Math.max(0, p.inv.length - 1)) : anyInt(); res = E.sellItem(p, t, world, arg); break;
      case 'sellGoods': res = E.sellGoods(p, t, world); break;
      case 'repair': arg = pick(['mao', 'principal', 'mao', 'cabeca', 'x']); res = E.repair(p, t, world, arg, r.chance(4000)); break;   // v83: às vezes com kit de armeiro
      case 'opStart': arg = r.chance(9500) ? r.int(0, CFG.ops.length - 1) : anyInt(); res = E.opStart(p, t, world, arg); break;
      case 'opStep': arg = pick(['recon', 'crew', 'bribe', 'x']); res = E.opStep(p, t, world, arg); break;
      case 'opGo': res = E.opGo(p, t, world, game); break;
      case 'opDrop': res = E.opDrop(p, t, world); break;
      case 'retainer': res = E.setRetainer(p, t, world, r.chance(6000)); break;
      case 'jailSmuggle': res = E.jailSmuggle(p, t, world, game); break;
      case 'jailWork': res = E.jailWork(p, t, world); break;
      case 'jailYard': res = E.jailYard(p, t, world, game); break;
      case 'jailCards': arg = pick([1, 10, 50, 51, 0, -5]); res = E.jailCards(p, t, world, arg, game); break;
      case 'jailFavor': arg = pick(['time', 'contact', 'x']); res = E.jailFavor(p, t, world, arg); break;
      case 'jailEscape': res = E.jailEscape(p, t, world, game); break;
      case 'job': arg = r.chance(9000) ? r.int(0, CFG.jobs.list.length) : anyInt(); res = E.chooseJob(p, t, world, arg); break;
      case 'course': arg = r.chance(9000) ? pick(CFG.courses.map((c) => c.id)) : 'x' + r.int(0, 9); res = E.startCourse(p, t, world, arg); break;
      case 'dealBuy': arg = { j: r.chance(9000) ? r.int(0, CFG.deal.list.length) : anyInt(), kg: pick([1, 1, 2, 5, 20, 21, 0, -1, 0.5]) }; res = E.dealBuy(p, t, world, arg.j, arg.kg); break;
      case 'casino': {
        const amt = () => pick([1, 5, 10, 50, 100, 999, 5000, 1e6, 0, -5, 0.5, NaN]);
        const g = pick(['roulette', 'dice', 'bj', 'bj', 'wheel', 'slot', 'x']);
        arg = g === 'roulette' ? { bets: Array.from({ length: r.int(0, 13) }, () => ({ t: pick(['red', 'black', 'even', 'odd', 'low', 'high', 'dozen', 'num', 'x']), n: pick([0, 1, 2, 3, 17, 36, 37, -1]), amt: amt() })) }
          : g === 'dice' ? { pick: pick(['low', 'seven', 'high', '__proto__']), amt: amt() }
          : g === 'wheel' ? { bets: Array.from({ length: r.int(0, 13) }, () => ({ s: pick(['1', '2', '5', '10', 'moeda', 'caixas', 'bola', 'louca', 'x']), amt: amt() })) }
          : g === 'slot' ? { ...(r.chance(7000) ? { bc: pick([20, 40, 100, 120, 500, 2000, 19, 0, -20, 20.5, NaN]) } : { amt: pick([1, 2, 5, 10, 20, 50, 0, -1, NaN]) }), game: pick(['chefao', 'zeus', 'doce', 'rebucado', 'x']), buy: pick([0, 0, 0, 1, 2, 3]) } : { op: pick(['deal', 'hit', 'hit', 'stand', 'double', 'split', 'split', 'x']), amt: amt() };
        res = E.casinoPlay(p, t, world, g, arg, game); break;
      }
      case 'table': {
        // uma ronda inteira: aposta duas vezes (a segunda junta-se à primeira), às vezes tira tudo, e depois sai o resultado
        const amt = () => pick([1, 5, 10, 50, 100, 999, 5000, 1e6, 0, -5, 0.5, NaN]);
        const g = pick(['roulette', 'wheel', 'wheel', 'x']);
        const bom = r.chance(8000), va = () => (bom ? pick([1, 2, 5, 10, 50, 100, 999]) : amt());
        const mk = () => Array.from({ length: bom ? r.int(1, 5) : r.int(0, 13) }, () => (g === 'wheel' ? { s: pick(['1', '2', '5', '10', 'moeda', 'caixas', 'bola', 'louca'].concat(bom ? [] : ['x'])), amt: va() }
          : { t: pick(['red', 'black', 'even', 'odd', 'low', 'high', 'dozen', 'num'].concat(bom ? [] : ['x'])), n: bom ? r.int(0, 2) : pick([0, 1, 2, 3, 17, 36, 37, -1, undefined]), amt: va() }));
        let mine = E.tableBet(p, t, world, g, mk()).bets, before = 0;
        try { mine = E.tableBet(p, t, world, g, mk(), mine).bets; } catch (e) { if (!(e instanceof E.GameError)) throw e; }
        if (r.chance(1500)) { const back = E.tableClear(p, mine); if (back.back !== E.tableTotal(mine)) throw new Error('devolução errada'); before = back.back; }
        const out = E.tableDraw(g, game), win = E.tablePay(g, mine, out);
        if (!before) E.tableCredit(p, win);
        res = { ok: true, g, total: E.tableTotal(mine), win: before ? 0 : win, before };
        break;
      }
      case 'heist': {
        arg = r.chance(9000) ? r.int(0, 2) : anyInt();
        E.heistJoin(p, t, world, arg);
        const ps = [p];
        if (d !== p && r.chance(6000)) { try { E.heistJoin(d, t, world, arg); ps.push(d); } catch (e) { if (!(e instanceof E.GameError)) throw e; } }
        if (r.chance(1500)) { for (const x of ps) E.heistRefund(x, t, arg); res = { ok: true, refund: true }; } else res = E.heistResolve(ps, t, arg, game);
        break;
      }
      case 'hit': {
        E.hitJoin(p, d, t, world, r.chance(5000));
        if (r.chance(1500) || !E.hitCanResolve(d, t)) { E.hitRefund(p, t); res = { ok: true, refund: true }; } else res = E.hitResolve([p], d, t, game);
        break;
      }
      case 'gangCreate': res = E.gangCreate(p, t, world); E.gangSet(p, 'g' + r.int(1, 5), r.int(1, 5), r.int(0, 5)); break;   // o servidor regista a gangue e escreve o bónus
      case 'gangDonate': arg = r.chance(8000) ? r.int(100, 50000) : anyInt(); res = E.gangDonate(p, t, world, arg); break;
      case 'gangLeave': { if (!p.gang) throw new E.GameError('NO_GANG'); const g0 = p.gang; res = { ok: true, ...E.gangLeave(p, t) }; if (t === now) E.gangBizSync(players.filter((x) => x.gang === g0), t); break; }
      case 'gangBiz': {
        arg = { k: r.chance(9000) ? r.int(0, CFG.gang.biz.length - 1) : anyInt(), amount: r.chance(8500) ? r.int(500, 60000) : anyInt() };
        res = E.gangBizInvest(p, t, world, arg.k, arg.amount, p.gb ? p.gb.loot / CFG.gang.lootBpPer : 0);
        const ms = players.filter((x) => x.gang === p.gang); E.gangBizSync(ms, t);   // o servidor acerta o bónus de grupo de todos os membros
        for (const m of ms) { const bad2 = E.checkInvariants(m); if (bad2.length) { console.error('INVARIANTE', kind, bad2); process.exit(1); } }
        break;
      }
      case 'gangBizCollect': res = E.gangBizCollect(p, t, world); break;
      case 'crimeAll': arg = r.chance(9000) ? r.int(0, CFG.crimes.length) : anyInt(); res = E.doCrimeAll(p, t, world, arg, game); break;
      case 'drug': res = E.buyDrug(p, t, world, r.chance(9000) ? r.int(0, CFG.drugs.length - 1) : anyInt()); break;
      case 'refill': res = E.refill(p, t, world); break;
      case 'detox': res = E.detox(p, t, world); break;
      case 'claim': res = E.claimMission(p, t, world); break;
      case 'stockBuy': arg = { k: r.chance(9000) ? r.int(0, 5) : anyInt(), n: pick([1, 5, 50, 1000, 0, -1, 0.5, 2e9]), h0: null }; arg.h0 = E.stockView(p, market); res = E.stockBuy(p, t, world, r.chance(9700) ? market : null, arg.k, arg.n, r.chance(1000) ? 1 : undefined); break;
      case 'stockSell': arg = { k: r.chance(9000) ? r.int(0, 5) : anyInt(), n: 0, h0: E.stockView(p, market) }; arg.n = r.chance(7000) && arg.h0[arg.k] ? pick([arg.h0[arg.k].n, Math.ceil(arg.h0[arg.k].n / 2), 1]) : pick([1, 0, -1, 1e9]); res = E.stockSell(p, t, world, market, arg.k, arg.n, r.chance(1000) ? 1 : undefined); break;
      case 'missionSwap': res = E.swapMission(p, t, world); break;
      case 'hooker': res = E.visitHooker(p, t, world, pick([0, 1, 2, 3, 4, 5, 6, 12, 15, 17, 18]), game); break;
      case 'cure': res = E.cure(p, t, world); break;
      case 'house': res = E.buyHouse(p, t, world); break;
      case 'houseUp': res = E.buyUpgrade(p, t, world, pick([0, 1, 2, 3, 4])); break;
      case 'class': res = E.setClass(p, t, world, pick([...CFG.classes.map((c) => c.id), 'x'])); break;
      case 'classChange': res = E.changeClass(p, t, world, pick([...CFG.classes.map((c) => c.id), 'x'])); break;
      case 'air': arg = { amount: pick([50, 100, 500, 5000, E.airCap(p), E.airCap(p) + 1, p.cash]), bribe: r.chance(4000) }; res = E.airSend(p, t, world, pick([0, 1, 2, 3, 4, 5, -1]), arg.amount, arg.bribe); break;
      case 'airCollect': res = E.airCollect(p, t, world, game, r.chance(5000)); break;
      case 'avatar': res = E.setAvatar(p, t, world, pick([0, 5, 31, CFG.avatars - 1, CFG.avatars, -1])); break;
      case 'buyBiz': arg = r.chance(9000) ? r.int(0, 4) : anyInt(); res = E.buyBiz(p, t, world, arg); break;
      case 'collect': res = E.collectBiz(p, t, world, game); break;
      case 'bizGoods': arg = r.chance(9000) ? r.int(0, 4) : anyInt(); res = E.bizGoods(p, t, world, arg, r.chance(6000)); break;
      case 'acct': res = E.hireAccountant(p, t, world); break;
      case 'stockLimit': { const k = r.chance(9000) ? r.int(0, 5) : anyInt(), pr = market.prices[k] || 0;
        arg = { k, tp: pick([0, pr + r.int(1, 400), pr + r.int(1, 400), pr * 2, pr, -1, 0.5, anyInt()]), sl: pick([0, Math.max(1, pr - r.int(1, 400)), Math.max(1, pr - r.int(1, 400)), Math.floor(pr / 2), pr, anyInt()]) };
        res = E.stockLimit(p, t, world, r.chance(9700) ? market : null, arg.k, arg.tp, arg.sl); break; }
      case 'port': arg = r.chance(5000) ? r.int(100, Math.max(100, E.portCap(p))) : r.chance(8000) ? r.int(0, 300000) : anyInt(); /* metade das vezes um valor que cabe, para os envios acontecerem mesmo */ res = E.sendPort(p, t, world, r.chance(9200) ? r.int(0, CFG.port.ships.length - 1) : anyInt(), arg, r.chance(5000)); break;
      case 'stockHold': arg = r.chance(9000) ? r.int(0, CFG.drugs.length - 1) : anyInt(); res = E.stockHold(p, t, world, arg, r.chance(6000)); break;
      case 'venueBuy': arg = pick(['club', 'bro', 'bro', 'club', 'x']); res = E.venueBuy(p, t, world, arg); break;
      case 'venueSet': res = E.venueSet(p, t, world, pick(['club', 'bro', 'x']), pick([0, 1, 2, 3, 4, 5, -1, 0.5]), pick([0, 1, 2, 3, 4, NaN])); break;
      case 'venueCollect': res = E.venueCollect(p, t, world); break;
      case 'stockUse': arg = r.chance(9000) ? r.int(0, CFG.drugs.length - 1) : anyInt(); res = E.stockUse(p, t, world, arg); break;
      case 'stockDump': arg = { d: r.chance(9000) ? r.int(0, CFG.drugs.length - 1) : anyInt(), n: pick([1, 2, 10, 0, -1, 0.5, 1e9]) }; res = E.stockDump(p, t, world, arg.d, arg.n); break;
      case 'whBuy': res = E.whBuy(p, t, world, pick(['al', 'ag', 'al', 'ag', 'lx', 'x', 3])); break;
      case 'whUp': res = E.whUp(p, t, world, pick([...REG, 'x']), pick(['sp', 'hd', 'fr', 'x'])); break;
      case 'mktBuy': arg = { r: pick([...REG, REG[0], 'x']), d: r.chance(9000) ? r.int(0, CFG.drugs.length - 1) : anyInt(), n: pick([1, 10, 500, 5000, 0, -1, 0.5, 1e8]) };
        res = E.mktBuy(p, t, world, r.chance(9800) ? mk : null, arg.r, arg.d, arg.n, r.chance(1000) ? 1 : undefined); break;
      case 'mktSell': { const rr = pick([...REG, 'x']), st = p.wh && p.wh[rr] ? E.whStock(p, rr) : null, dd = st && r.chance(7000) ? st.findIndex((x, k) => x > 0 && MW.tradable(k)) : r.int(0, CFG.drugs.length - 1);
        res = E.mktSell(p, t, world, mk, rr, dd, st && dd >= 0 && r.chance(6000) ? pick([st[dd], Math.ceil(st[dd] / 2), 1]) : pick([1, 0, -1, 1e9]), r.chance(1000) ? 1 : undefined); break; }
      case 'mvSend': { const a1 = pick(REG), b1 = pick([...REG, 'x']), st = p.wh && p.wh[a1] ? E.whStock(p, a1) : null, dd = st && r.chance(7000) ? st.findIndex((x, k) => x > 0 && MW.tradable(k)) : r.int(0, CFG.drugs.length - 1);
        res = E.mvSend(p, t, world, mk, game, a1, b1, dd, st && dd >= 0 && r.chance(6000) ? pick([st[dd], 1]) : pick([1, 0, -1, 1e9])); break; }
      case 'whEdition': for (const g of [mk.w.lx, mk.w.rg.al, mk.w.rg.ag]) g.press = r.int(0, 100); res = { raids: E.whEdition(p, mk, t, game) }; break;
      case 'workStart': if (r.chance(3000) && CFG.jobs.list[p.job]) res = E.workStart(p, t, world, r, r.chance(8000) ? CFG.jobs.list[p.job].task : pick(['entradas', 'doses', 'contrato', 'camiao']), true); else res = E.workStart(p, t, world, r, pick(['camiao', 'entregas', 'laboratorio', 'entradas', 'oficina', 'mudancas', 'desmanche', 'x'])); break;
      case 'workDone': {
        const L = p.tk ? E.workLayout(p.tk.id, p.tk.s) : null;
        const ans = !L ? {} : p.tk.id === 'camiao' ? { slots: r.chance(8000) ? [0, 1, 2, 3, 4, 5].sort(() => r.int(0, 2) - 1) : [0, 0, 1, 2, 3, 4], drops: r.int(0, 3) }
          : p.tk.id === 'entregas' ? { order: [0, 1, 2, 3].sort(() => r.int(0, 2) - 1) } : p.tk.id === 'entradas' || p.tk.id === 'contrato' ? { picks: r.chance(9000) ? [r.int(0, 3), r.int(4, 6)] : [0, 0] } : p.tk.id === 'doses' ? { holds: [r.int(0, 3000), r.int(0, 3000), r.int(0, 3000)] }
          : p.tk.id === 'oficina' ? { picks: r.chance(8000) ? [0, 2, 4, 1, 3] : [0, 1, 2, 3, 3], holds: [0, 1, 2, 3, 4].map(() => r.int(0, 4000)) }
          : p.tk.id === 'mudancas' ? { place: E.workLayout('mudancas', p.tk.s).pcs.map(() => (r.chance(5000) ? [r.int(-1, 2), r.int(-1, 3), r.int(0, 1)] : [-1, -1, 0])) }
          : p.tk.id === 'desmanche' ? { holds: E.workLayout('desmanche', p.tk.s).parts.map(() => r.int(0, 4000)), spotted: r.chance(2000) } : { taps: [r.int(0, 900), r.int(1000, 1900), r.int(2000, 2900)], holds: [r.int(0, 3000), r.int(0, 3000), r.chance(9000) ? r.int(0, 3000) : -1] };
        res = E.workDone(p, t, world, r, ans); break;
      }
      case 'broHire': arg = r.chance(9000) ? r.int(0, CFG.hookers.list.length - 1) : anyInt(); res = E.broHire(p, t, world, arg); break;
      case 'broFire': res = E.broFire(p, t, world, pick([0, 1, 2, 5, -1])); break;
      case 'clubBuyAt': arg = r.chance(9000) ? r.int(0, CFG.drugs.length - 1) : anyInt(); res = E.clubBuyAt(p, d, t, world, arg, r.chance(1000) ? 1 : undefined); break;
      case 'broVisitAt': arg = pick([0, 1, 2, 3, 20, -1]); res = E.broVisitAt(p, d, t, world, arg, game, r.chance(1000) ? 1 : undefined); break;
      case 'collectPort': res = E.collectPort(p, t, world, game); break;
      case 'portOpen': arg = p.port.length && r.chance(8500) ? pick(p.port).readyAt : anyInt(); /* quase sempre um carregamento que existe (chegado ou não), o resto lixo */ res = E.openPort(p, t, world, game, arg); break;
      case 'deposit': arg = r.chance(8000) ? r.int(0, p.cash + 10) : anyInt(); res = E.deposit(p, t, world, arg); break;
      case 'withdraw': res = E.withdraw(p, t, world, r.chance(8000) ? r.int(0, p.bank + 10) : anyInt()); break;
      case 'gear': res = E.buyGear(p, t, world, ...(() => { const kd = pick(['weapon', 'armor', 'guard', 'guard', 'tool', 'tool', 'gweapon', 'cash', 'stats', 'house']); return [kd, r.chance(7000) && Number.isInteger(p[kd]) ? p[kd] + 1 : r.chance(9000) ? r.int(-1, 8) : anyInt()]; })()); break;
      case 'attack': res = E.attack(p, d, t, world, pick(['beat', 'mug', 'x']), game, r.chance(5000)); if (p.shieldUntil > t) { console.error('CONTAS ERRADAS', 'atacou e ficou com o escudo'); process.exit(1); } break;
      case 'hitman': res = E.hitman(p, d, t, world, game, r.chance(5000)); if (p.shieldUntil > t) { console.error('CONTAS ERRADAS', 'encomendou e ficou com o escudo'); process.exit(1); } break;
      case 'bail': res = E.payBail(p, t, world); break;
      case 'bailFor': res = E.bailFor(p, d, t, world); break;
      case 'medicFor': res = E.medicFor(p, d, t, world); break;
      case 'medic': res = E.payMedic(p, t, world); break;
      case 'luxury': res = E.buyLuxury(p, t, world); break;
    }
    contas(kind, origP, p, origD, d, t, res, arg);
    if (MAPA) { const dm = wealth(p) - wealth(origP), m = (MAPA[kind] ||= { n: 0, entra: 0, sai: 0 }); m.n++; if (dm > 0) m.entra += dm; else m.sai -= dm;
      if (d !== p) { const dd = wealth(d) - wealth(origD), k2 = kind + ' (alvo)', m2 = (MAPA[k2] ||= { n: 0, entra: 0, sai: 0 }); m2.n++; if (dd > 0) m2.entra += dd; else m2.sai -= dd; } }
    done++;
    counts[kind] = (counts[kind] || 0) + 1;
  } catch (e) {
    if (!(e instanceof E.GameError)) { console.error('FALHA DO CÓDIGO', kind, e); process.exit(1); }
    refused++;
    counts['x_' + e.code] = (counts['x_' + e.code] || 0) + 1;
    // ação recusada: o estado só pode ter mudado pela atualização normal do tempo
    // (ou nem isso, quando o pedido é recusado logo à entrada por argumentos inválidos)
    // (o primeiro ato do dia paga a avença antes de validar o resto: isso fica, mesmo que a ação seja recusada)
    const beforeAv = structuredClone(before); E.retainerDay(beforeAv, t);
    if (!isDeepStrictEqual(p, before) && !isDeepStrictEqual(p, beforeAv) && !isDeepStrictEqual(p, origP)) { console.error('RECUSADA MAS MUDOU', kind, e.code); process.exit(1); }
    if (d !== p && !isDeepStrictEqual(d, beforeD) && !isDeepStrictEqual(d, origD)) { console.error('ALVO MUDOU', kind, e.code); process.exit(1); }
  }
  for (const q of [p, d]) {
    const bad = E.checkInvariants(q);
    if (bad.length) { console.error('INVARIANTE', kind, bad); process.exit(1); }
  }
}
console.log(JSON.stringify({ actions: ACTIONS, rounds, done, refused, counts }, null, 0));
// FUZZ_MAPA=1: de onde vem e para onde vai o dinheiro, por ação (ao calhas: mostra o que cria e o que gasta dinheiro, não quanto
// cada um pesa num jogo a sério)
if (MAPA) { const L = Object.entries(MAPA).map(([k, m]) => [k, m.n, m.entra, m.sai, m.entra - m.sai]).sort((a, b) => b[4] - a[4]);
  for (const [k, n, e, s, l] of L) if (e || s) console.log(k.padEnd(22), String(n).padStart(7), 'entra', String(e).padStart(14), 'sai', String(s).padStart(14), 'líquido', String(l).padStart(14), 'por ação', Math.round(l / n)); }
