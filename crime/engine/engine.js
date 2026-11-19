// Motor do jogo: regras puras, sem rede nem base de dados.
// Cada ação recebe o jogador, o instante (ms, hora do servidor), o "mundo" (ronda)
// e, quando há sorte envolvida, um gerador aleatório. Tudo em inteiros.

import { CFG, T } from './config.js';
import { localParts } from './time.js';
import { seededRng } from './rng.js';
import { pressMultBp, impactBp, quoteC, trade, refC, tradable, regPos, pressOf, REG, worldUp } from './mundo.js';
import { eventsAt } from './eventos.js';

export class GameError extends Error {
  constructor(code, extra = {}) { super(code); this.code = code; Object.assign(this, extra); }
}
const fail = (code, extra) => { throw new GameError(code, extra); };
// v76: o Estado (leis em vigor e corrupção). O servidor põe-no antes de cada ação e de cada edição; sem nada, nenhuma lei está em vigor.
let GOV = { laws: {}, corr: 0 };
export function setGov(g) { GOV = g && typeof g === 'object' ? { laws: g.laws || {}, corr: g.corr || 0 } : { laws: {}, corr: 0 }; }
const law = (id) => GOV.laws[id] !== undefined && GOV.laws[id] !== null;
export const lawsOn = () => Object.keys(GOV.laws);
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
export const STATS = ['F', 'T', 'I', 'C'];

// ---------- criação ----------

export function newPlayer(id, now, world, opts = {}) {
  const st = CFG.start.stat;
  const stats = { F: st, T: st, I: st, C: st, ...(opts.stats || {}) };
  const late = now - world.start >= CFG.round.lateJoinAfterMs;
  return {
    id, joinedAt: now, t: now,
    stats,
    energy: CFG.energy.max, energyT: now,
    vigor: CFG.vigor.max, vigorT: now,      // energia: ginásio e lutas (a stamina, «energy», é dos crimes)
    rua: null, rf: null, dl: null, rc: 0, dst: CFG.deal.list.map(() => 0),   // calor da rua, barras de stamina compradas e vendas de droga, de hoje
    eco: 2,                                 // economia nova (16/11/2026)
    addiction: 0, addictionT: now,
    cash: CFG.start.cash, bank: 0,
    respect: 0, respectAt: now, peakRespect: 0,
    jailUntil: 0, jailTier: 0,
    hospUntil: 0, protectUntil: 0, capUntil: 0,
    shieldUntil: late ? now + CFG.round.newbieShieldMs : 0,
    hospTimes: [],
    hits: new Map(),
    biz: CFG.biz.map(() => ({ n: 0, stored: 0, rem: 0, t: now })),
    port: [], air: null, stock: CFG.drugs.map(() => 0), hold: [], club: null, bro: null, stk: CFG.stocks.list.map(() => ({ n: 0, cost: 0, gen: 0 })), acct: false,
    wh: whsNew(), mv: [], mvLog: [], rz: [],   // armazéns por região e mercadoria a caminho (passo 6, parte 2)
    eq: eqNew(), inv: [], guard: -1, tool: -1, gweapon: -1, hmT: [], hmSafe: 0,   // equipamento no corpo (passo 4) e inventário
    op: null, opPause: 0, contacts: 0, avenca: false, avD: null, avN: 0, jailT0: 0, jf: 0, ilegal: 0,   // golpe grande a preparar, pausa, contactos da prisão, avença do advogado (passo 5)
    luxuries: 0,
    gang: null, gb: null, gangLeft: 0, gbotLeft: 0, gh: [], gbz: gbzNew(),
    emp: null,   // v111: a empresa onde trabalha ({ id, t: o tipo, s: as estrelas }); o servidor escreve-a
    cars: [], car: -1, rcn: { n: 0, w: 0, pod: 0 }, pkn: { h: 0, w: 0, big: 0 }, pkd: null, jsr: null, evs: {}, vip: 0, vipOn: false, crd: null, seeds: 0,   // v114: mãos de póquer (jogadas, ganhas, maior pote) e as fichas compradas hoje   // v112: os carros (cada um com as peças), o que está escolhido e as corridas feitas (rc já é o resto do respeito)
    detoxT: [],
    xp: { F: 0, I: 0, C: 0 },
    wk: CFG.crimes.map(() => 0),   // sucessos por golpe (para os objetivos)
    sk: skNew(),                   // skills: stamina gasta em cada família de golpe
    job: -1, sh: null, course: null, done: [],   // emprego (índice em CFG.jobs.list), turnos de hoje { d, n }, curso a decorrer { id, end } e cursos feitos
    c: { crimes: 0, wins: 0, trains: 0, refills: 0, collects: 0, pvpWins: 0, ports: 0, shifts: 0, work: 0 },
    tk: null, cz: null,   // trabalho à mão: a tarefa a decorrer e o cansaço
    mi: 0,                         // objetivos já recebidos
    mq: CFG.missions.map((_, i) => i), mrT: 0,   // os que faltam, pela ordem em que vão aparecer; e quando se trocou pela última vez
    titles: [],                    // títulos que ficam para sempre: { k: 'vet' } (veterano das rondas), { k: 'ep', n, d, pos } (pódio de uma época)
    cls: '', clsAt: 0, av: 0, fx: {}, sick: false, hkN: CFG.hookers.list.map(() => 0), hkAt: CFG.hookers.list.map(() => 0), house: 0, hu: CFG.house.ups.map(() => 0), bj: null, wm: {}, cd: { est: 0, med: 0 }, col: {}, mus: {}, sx: { F: 0, T: 0, I: 0, C: 0 }, gs: null, gym: 'garagem', gyms: ['garagem'], gx: 0, bk: { own: {}, rd: null, on: null, done: {}, last: null, n: 0, bd: null }, mt: {}, cf: null, maq: {}, dg: null, dgc: {}, hunt: { on: null, sk: 0, tr: {}, day: '', q: {}, fc: {}, n: 0 }, hon: {}, honSel: null, honVit: [], cx: { air: {}, wt: [], trip: {} }, tr: null, trL: null, trB: 0, trD: null,        // profissão, avatar e efeitos temporários (kind -> { bp, until })
  };
}

// jogadores gravados antes de uma regra nova ganham os campos que faltam
function migrate(p) {
  if (!Array.isArray(p.hold)) p.hold = [];
  if (typeof p.acct !== 'boolean') p.acct = false;
  if (!Array.isArray(p.detoxT)) p.detoxT = [];
  if (!p.xp) p.xp = { F: 0, I: 0, C: 0 };
  if (!Array.isArray(p.wk)) p.wk = CFG.crimes.map(() => 0);
  while (p.wk.length < CFG.crimes.length) p.wk.push(0);   // golpes novos no fim da lista (v72)
  if (!p.wm || typeof p.wm !== 'object' || Array.isArray(p.wm)) p.wm = {};   // v74: o ritmo de cada biscate
  if (!p.cd || typeof p.cd !== 'object') p.cd = { est: 0, med: 0 };   // v78: até quando dura a espera do estômago e a médica
  if (!p.col || typeof p.col !== 'object') p.col = {};   // v79: vitrine dos colecionáveis (id -> quantos)
  if (!p.mus || typeof p.mus !== 'object') p.mus = {};   // v79: quantas vezes entregou cada conjunto ao museu
  if (!p.sx || typeof p.sx !== 'object') p.sx = { F: 0, T: 0, I: 0, C: 0 };   // v82: pontos partidos do ginásio (milésimos)
  if (p.gs === undefined) p.gs = null;   // v82: a série do ginásio a meio
  if (!Array.isArray(p.gyms)) p.gyms = ['garagem'];   // v94: os ginásios onde já é sócio, o que está a usar e a energia lá gasta
  if (typeof p.gym !== 'string' || !p.gyms.includes(p.gym)) p.gym = 'garagem';
  if (!Number.isFinite(p.gx)) p.gx = 0;
  if (!p.bk || typeof p.bk !== 'object') p.bk = { own: {}, rd: null, on: null, done: {}, last: null, n: 0, bd: null };   // v95: livros
  if (!p.mt || typeof p.mt !== 'object' || Array.isArray(p.mt)) p.mt = {};   // v83: materiais e componentes no depósito
  if (p.cf === undefined) p.cf = null;   // v83: o que está na bancada da cave
  if (!p.maq || typeof p.maq !== 'object' || Array.isArray(p.maq)) p.maq = {};   // v83: máquinas instaladas nos negócios
  if (Array.isArray(p.biz)) while (p.biz.length < CFG.biz.length) p.biz.push({ n: 0, stored: 0, rem: 0, t: p.t || 0 });   // v99: negócios novos no fim da lista
  if (p.dg === undefined || (p.dg && typeof p.dg !== 'object')) p.dg = null;   // v85: a escavação aberta
  if (p.dg && !Number.isSafeInteger(p.dg.safe)) p.dg.safe = CFG.dig.safe;
  if (!p.dgc || typeof p.dgc !== 'object' || Array.isArray(p.dgc)) p.dgc = {};   // v85: até quando cada sítio está vigiado
  if (!p.hon || typeof p.hon !== 'object' || Array.isArray(p.hon)) p.hon = {};   // v100: honras (id -> quando)
  if (!p.cx || typeof p.cx !== 'object' || !p.cx.air || !Array.isArray(p.cx.wt)) p.cx = { air: {}, wt: [] };   // v100: voos por rota e tipos de arma usados (para as honras)
  if (!p.cx.trip || typeof p.cx.trip !== 'object') p.cx.trip = {};   // v101: viagens por país
  if (p.tr === undefined) { p.tr = null; p.trL = null; p.trB = 0; }   // v101: a viagem, a mala que chegou e a mala comprada
  if (p.trD === undefined) p.trD = null;   // e as viagens de hoje { d: dia de Lisboa, n }
  if (p.honSel !== null && (typeof p.honSel !== 'string' || !p.hon[p.honSel])) p.honSel = null;
  if (!Array.isArray(p.honVit)) p.honVit = [];   // v109: a vitrine do perfil público (até 6 honras)
  p.honVit = p.honVit.filter((k, i, v) => typeof k === 'string' && p.hon[k] && v.indexOf(k) === i).slice(0, CFG.social.vitMax);
  if (!p.hunt || typeof p.hunt !== 'object' || Array.isArray(p.hunt)) p.hunt = { on: null, sk: 0, tr: {}, day: '', q: {}, fc: {}, n: 0 };   // v98: caça (saída aberta, perícia em milésimos, troféus, saídas com licença do dia, reservas vigiadas)
  if (!p.c) p.c = { crimes: 0, wins: 0, trains: 0, refills: 0, collects: 0, pvpWins: 0, ports: 0 };
  if (!Number.isSafeInteger(p.mi)) p.mi = 0;
  if (!Array.isArray(p.mq)) p.mq = CFG.missions.map((_, i) => i).slice(Math.min(Math.max(p.mi, 0), CFG.missions.length));
  if (!Number.isSafeInteger(p.mrT)) p.mrT = 0;
  if (typeof p.cls !== 'string') p.cls = '';
  if (!Number.isSafeInteger(p.clsAt)) p.clsAt = 0;
  if (p.air === undefined) p.air = null;
  if (!Array.isArray(p.stock) || p.stock.length !== CFG.drugs.length) p.stock = CFG.drugs.map((_, i) => (Array.isArray(p.stock) && Number.isSafeInteger(p.stock[i]) && p.stock[i] > 0 ? p.stock[i] : 0));
  if (p.club === undefined) p.club = null;
  if (!Array.isArray(p.stk) || p.stk.length !== CFG.stocks.list.length) p.stk = CFG.stocks.list.map((_, k) => (Array.isArray(p.stk) && p.stk[k] && Number.isSafeInteger(p.stk[k].n) ? p.stk[k] : { n: 0, cost: 0, gen: 0 }));
  if (p.bro === undefined) p.bro = null;
  if (!Number.isSafeInteger(p.av)) p.av = 0;
  if (!p.fx || typeof p.fx !== 'object') p.fx = {};
  if (typeof p.sick !== 'boolean') p.sick = false;
  // putas: cada uma tem os seus degraus de preço (hkN) e a hora da última visita (hkAt). Estado antigo (listas de visitas) é convertido.
  if (!Array.isArray(p.hkN) || p.hkN.length !== CFG.hookers.list.length) {
    const n = CFG.hookers.list.map((_, i) => (Array.isArray(p.hkN) && Number.isSafeInteger(p.hkN[i]) && p.hkN[i] > 0 ? Math.min(p.hkN[i], CFG.hookers.maxSteps) : 0));
    const at = CFG.hookers.list.map((_, i) => (Array.isArray(p.hkAt) && Number.isSafeInteger(p.hkAt[i]) ? p.hkAt[i] : 0));
    if (Array.isArray(p.hkT) && Array.isArray(p.hkI)) for (let k = 0; k < p.hkT.length; k++) { const i = p.hkI[k]; if (n[i] !== undefined && Number.isSafeInteger(p.hkT[k])) { n[i] = Math.min(n[i] + 1, CFG.hookers.maxSteps); at[i] = Math.max(at[i], p.hkT[k]); } }
    p.hkN = n; p.hkAt = at;
  }
  if (!Array.isArray(p.hkAt) || p.hkAt.length !== p.hkN.length) p.hkAt = p.hkN.map(() => 0);
  delete p.hkT; delete p.hkI;
  if (!Number.isSafeInteger(p.house)) p.house = 0;
  if (!Array.isArray(p.hu)) p.hu = CFG.house.ups.map(() => 0);
  if (p.bj === undefined) p.bj = null;
  if (typeof p.gang !== 'string') p.gang = null;
  if (!p.gang || !p.gb || typeof p.gb !== 'object') p.gb = null;
  if (!empOk(p.emp)) p.emp = null;   // v111
  if (!Array.isArray(p.cars)) p.cars = [];   // v112
  p.cars = p.cars.filter((c) => c && carOf(c.id) && Array.isArray(c.up) && c.up.length === 3);
  if (!Number.isInteger(p.car) || !p.cars[p.car]) p.car = p.cars.length ? 0 : -1;
  if (!p.rcn || typeof p.rcn !== 'object') p.rcn = { n: 0, w: 0, pod: 0 };
  if (!p.pkn || typeof p.pkn !== 'object' || !Number.isSafeInteger(p.pkn.h)) p.pkn = { h: 0, w: 0, big: 0 };
  if (p.pkd && (typeof p.pkd !== 'object' || typeof p.pkd.d !== 'string' || !Number.isSafeInteger(p.pkd.n))) p.pkd = null;
  if (p.pkd === undefined) p.pkd = null;
  if (!p.evs || typeof p.evs !== 'object' || Array.isArray(p.evs)) p.evs = {};   // v117: os eventos
  if (!Number.isSafeInteger(p.vip) || p.vip < 0) p.vip = 0;   // v119: o VIP (até quando)
  if (!Number.isSafeInteger(p.seeds) || p.seeds < 0) p.seeds = 0;   // v120: as sementes
  if (typeof p.vipOn !== 'boolean') p.vipOn = false;
  if (p.crd !== null && (!p.crd || typeof p.crd.d !== 'string' || !Number.isSafeInteger(p.crd.n))) p.crd = null;
  if (p.jsr === undefined || (p.jsr !== null && (typeof p.jsr !== 'object' || !Number.isSafeInteger(p.jsr.t0)))) p.jsr = null;   // v116: a sentença
  if (!Number.isFinite(p.rc)) p.rc = 0;   // (uma versão de teste da v112 usou rc para as corridas: volta a ser o resto do respeito)
  if (!Number.isSafeInteger(p.gangLeft)) p.gangLeft = 0;
  if (!Number.isSafeInteger(p.gbotLeft)) p.gbotLeft = 0;
  if (!Number.isInteger(p.guard)) p.guard = -1;
  if (!Number.isInteger(p.tool)) p.tool = -1;         // ferramenta de golpe (ver CFG.tools)
  if (!Number.isInteger(p.gweapon)) p.gweapon = -1;   // arma de gangue (ver CFG.gweapons)
  if (!Array.isArray(p.hmT)) p.hmT = [];
  if (!Number.isSafeInteger(p.hmSafe)) p.hmSafe = 0;
  if (!Array.isArray(p.gbz) || p.gbz.length !== CFG.gang.biz.length) p.gbz = gbzNew();
  p.gh = [];   // (antigo contador de golpes em grupo por dia: já não há limite)
  if (!Array.isArray(p.titles)) p.titles = [];
  if (!Number.isSafeInteger(p.vigor)) { p.vigor = CFG.vigor.max; p.vigorT = p.t || 0; }
  if (!Array.isArray(p.dst) || p.dst.length !== CFG.deal.list.length) p.dst = CFG.deal.list.map((_, j) => (Array.isArray(p.dst) && Number.isSafeInteger(p.dst[j]) ? p.dst[j] : 0));
  if (p.eco !== 2) ecoNova(p);
  // passo 3: as vitórias de cada golpe passam a skill da família (a stamina dos golpes que correram bem)
  if (!p.sk || typeof p.sk !== 'object') { p.sk = skNew(); CFG.crimes.forEach((c, k) => { p.sk[c.fam] += (p.wk[k] || 0) * c.e; }); }
  for (const f of CFG.skills.fams) if (!Number.isSafeInteger(p.sk[f]) || p.sk[f] < 0) p.sk[f] = 0;
  if (!Number.isInteger(p.job)) p.job = -1;
  if (p.sh === undefined) p.sh = null;
  if (p.course === undefined) p.course = null;
  if (!Array.isArray(p.done)) p.done = [];
  if (!Number.isSafeInteger(p.c.shifts)) p.c.shifts = 0;
  // passo 4: a arma e a proteção (índices nas listas antigas) passam para o corpo; quem tinha arma de fogo recebe uma caixa de balas
  if (!p.eq || typeof p.eq !== 'object') {
    p.eq = eqNew();
    const w = W57[p.weapon], a = A57[p.armor];
    if (w) { p.eq[gearOf(w).slot] = itemNew(w); }
    if (a) p.eq.tronco = itemNew(a);
    if (!Array.isArray(p.inv)) p.inv = [];
    if (w && gearOf(w).gun) p.inv.push({ id: 'balas', n: CFG.bullets.box });
  }
  if (!Array.isArray(p.inv)) p.inv = [];
  delete p.weapon; delete p.armor;
  // passo 5: golpes grandes, avença e prisão com coisas para fazer. As ferramentas antigas (compradas por ordem) viram material
  // no inventário; o que não couber, e as que não são material (taser, revólver, caçadeira serrada), voltam em dinheiro, pelo preço.
  // passo 6, parte 2: armazéns por região (o de Lisboa é o que já havia: o stock fica em p.stock) e mercadoria a caminho
  if (!p.wh || typeof p.wh !== 'object') p.wh = whsNew();
  for (const r of REG()) if (p.wh[r] === undefined) p.wh[r] = r === 'lx' ? whNew('lx') : null;
  if (!Array.isArray(p.mv)) p.mv = [];
  if (!Array.isArray(p.mvLog)) p.mvLog = [];
  if (!Array.isArray(p.rz)) p.rz = [];
  if (p.op === undefined) {
    p.op = null; p.opPause = 0; p.contacts = 0; p.avenca = false; p.avD = null; p.avN = 0; p.jailT0 = 0; p.jf = 0; p.ilegal = 0;
    for (let i = 0; i <= p.tool && i < CFG.tools.length; i++) {
      const id = T58[i];
      if (id && invUsed(p) < invCap(p)) p.inv.push({ id }); else p.cash += CFG.tools[i].price;
    }
    p.tool = -1;
  }
}
// as listas de armas e proteções da versão 57 (índice → objeto), para passar o que cada um tinha
const W57 = ['soqueira', 'navalha', 'pistola', 'cacadeira', 'metralhadora', 'sniper'], A57 = ['cabedal', 'colete', 'balistico', 'kevlar', 'blindado', 'titanio'];
// as ferramentas da versão 59 (índice em CFG.tools) que passaram a material dos golpes grandes
const T58 = { 0: 'pedecabra', 1: 'gazuas', 5: 'macarico', 6: 'explosivos', 7: 'broca' };
const eqNew = () => Object.fromEntries(CFG.slots.map((s) => [s, null]));
const gearOf = (id) => CFG.gear.find((x) => x.id === id);
const itemNew = (id) => { const g = gearOf(id); return g.gun ? { id, u: g.life } : { id }; };
const skNew = () => Object.fromEntries(CFG.skills.fams.map((f) => [f, 0]));

// Economia nova (passo 2): quem jogou com os preços antigos recebe de volta o que pagou pelo que deixou de existir ou mudou de
// preço (casa e melhorias, armas, proteções, guardas, ferramentas, armas de gangue, negócios, luxos e droga guardada) e fica com
// essas coisas a zero. O dinheiro, o respeito, as stats e o resto ficam.
const OLD = {
  house: [0, 2000, 10000, 50000, 250000, 1000000, 5000000, 20000000],
  weapons: [500, 3000, 20000, 120000, 700000, 4000000, 12000000, 30000000], armors: [400, 2500, 18000, 110000, 650000, 3800000],
  guards: [600, 4000, 25000, 150000, 900000, 5000000], tools: [500, 1200, 3500, 10000, 30000, 80000, 180000, 250000],
  gweapons: [1000, 2500, 7000, 20000, 55000, 120000, 160000, 200000], biz: [3000, 8000, 25000, 120000, 500000],
  drugs: [5, 25, 90, 200, 600, 1000, 1500, 4000, 8000, 15, 40, 60, 800, 2500, 5000],
  club: [10000, 30000, 90000, 270000, 800000, 2400000, 7000000, 20000000], bro: [8000, 40000, 200000, 800000, 2500000], hire: [3000, 12000, 45000, 160000],
};
function ecoNova(p) {
  let back = 0;
  const h = Number.isSafeInteger(p.house) ? Math.min(p.house, OLD.house.length - 1) : 0;
  for (let i = 1; i <= h; i++) back += OLD.house[i];
  if (Array.isArray(p.hu)) for (const n of p.hu) for (let l = 1; l <= Math.min(n || 0, h); l++) back += Math.floor(OLD.house[l] / 4);
  for (const [k, list] of [['weapon', OLD.weapons], ['armor', OLD.armors], ['guard', OLD.guards], ['tool', OLD.tools], ['gweapon', OLD.gweapons]]) {
    const idx = Number.isInteger(p[k]) ? Math.min(p[k], list.length - 1) : -1;
    for (let i = 0; i <= idx; i++) back += list[i];
    p[k] = -1;
  }
  if (Array.isArray(p.biz)) p.biz.forEach((b, i) => { if (!b) return; let pr = OLD.biz[i] || 0; for (let n = 0; n < (b.n || 0); n++) { back += pr; pr += Math.floor(pr / 2); } back += Number.isSafeInteger(b.stored) && b.stored > 0 ? b.stored : 0; });
  for (let i = 0; i < (p.luxuries || 0); i++) back += 250000 * 2 ** i;
  // discoteca e bordel: o que custaram (níveis e putas contratadas) e o que estava no caixa
  for (const [k, list] of [['club', OLD.club], ['bro', OLD.bro]]) {
    const v = p[k]; if (!v || typeof v !== 'object') continue;
    for (let l = 0; l < Math.min(v.lvl || 0, list.length); l++) back += list[l];
    if (k === 'bro' && Array.isArray(v.girls)) for (const i of v.girls) { const g = CFG.hookers.list[i]; if (g) back += OLD.hire[g.tier] || 0; }
    back += Number.isSafeInteger(v.till) && v.till > 0 ? v.till : 0;
    p[k] = null;
  }
  if (Array.isArray(p.gbz)) for (const g of p.gbz) if (g) { back += (g.inv || 0) + (g.stored || 0); g.inv = 0; g.stored = 0; g.rem = 0; g.coop = 0; }   // negócios da gangue: o que lá estava volta
  if (Array.isArray(p.stock)) p.stock.forEach((n, d) => { if (n > 0) back += Math.floor((n * (OLD.drugs[d] || 0) * 8) / 10); });
  p.cash = (p.cash || 0) + back;
  p.house = 0; p.hu = []; p.luxuries = 0;
  p.biz = CFG.biz.map(() => ({ n: 0, stored: 0, rem: 0, t: p.t || 0 }));
  p.stock = CFG.drugs.map(() => 0); p.hold = [];
  p.rua = null; p.rf = null; p.dl = null;
  if (p.energy > CFG.energy.max) p.energy = CFG.energy.max;
  p.eco = 2;
}

// ---------- tempo ----------

// stamina máxima: a da casa
export const energyMax = (p) => { const b = (CFG.house.tiers[p.house] || CFG.house.tiers[0]).emax || CFG.energy.max; return p.vipOn ? b + Math.floor((b * CFG.vip.emaxBp) / 10000) : b; };   // v119: o VIP
export const energyRegenMs = (p) => (p.vipOn ? Math.round((CFG.energy.regenMs * 10000) / (10000 + CFG.vip.regenBp)) : CFG.energy.regenMs);
function syncVigor(p, now) {
  const { max, regenMs } = CFG.vigor;
  if (p.vigor >= max) { p.vigorT = now; return; }
  const ticks = Math.floor((now - p.vigorT) / regenMs);
  if (ticks <= 0) return;
  const gain = Math.min(ticks, max - p.vigor);
  p.vigor += gain;
  p.vigorT = p.vigor >= max ? now : p.vigorT + gain * regenMs;
}
function syncEnergy(p, now) {
  const regenMs = energyRegenMs(p), max = energyMax(p);
  if (p.energy >= max) { p.energyT = now; return; }
  const ticks = Math.floor((now - p.energyT) / regenMs);
  if (ticks <= 0) return;
  const gain = Math.min(ticks, max - p.energy);
  p.energy += gain;
  p.energyT = p.energy >= max ? now : p.energyT + gain * regenMs;
}

function syncAddiction(p, now) {
  const { decayMs } = CFG.addiction;
  if (p.addiction <= 0) { p.addiction = 0; p.addictionT = now; return; }
  const ticks = Math.floor((now - p.addictionT) / decayMs);
  if (ticks <= 0) return;
  const dec = Math.min(ticks, p.addiction);
  p.addiction -= dec;
  p.addictionT = p.addiction === 0 ? now : p.addictionT + dec * decayMs;
}

// Estado guardado por uma versão antiga do jogo: junta-lhe os campos que entretanto nasceram. O servidor chama isto ao carregar cada jogador,
// para que nada que percorra todos os jogadores (bolsa, alvos, gangues) tropece em quem não entra há muito tempo.
export function upgrade(p) { migrate(p); return p; }
// põe o jogador em dia até "now" (nunca anda para trás no tempo)
export function touch(p, now) {
  if (!Number.isSafeInteger(now)) fail('BAD_TIME');
  if (now < p.t) fail('TIME_BACKWARDS');
  migrate(p);
  p.vipOn = p.vip > now;   // v119: o VIP vale enquanto não acaba; ao acabar, a stamina a mais vai-se
  syncEnergy(p, now);
  if (p.energy > energyMax(p)) p.energy = energyMax(p);
  syncVigor(p, now);
  syncAddiction(p, now);
  if (p.addiction > addictionCap(p)) p.addiction = addictionCap(p); // limite mudou nas regras
  settleMoves(p, now);   // a mercadoria que já chegou (ou que a polícia apanhou no caminho)
  if (p.jailUntil && p.jailUntil <= now) { p.jailUntil = 0; p.jailTier = 0; }
  if (p.hospUntil && p.hospUntil <= now) p.hospUntil = 0;
  settleClub(p, now); settleBro(p, now);   // os clientes da discoteca e do bordel até agora
  if (p.course && !p.course.ex && p.course.end <= now) { if (!p.done.includes(p.course.id)) p.done.push(p.course.id); p.course = null; }   // curso de antes do exame: acaba sozinho
  if (p.gs && p.gs.t0 + CFG.train.set.ttl <= now) p.gs = null;   // v82: série esquecida
  bookTick(p, now);   // v95: o livro que acabou de se ler e o efeito que acabou
  if (p.dg && p.dg.t0 + CFG.dig.ttl <= now) digClose(p, p.dg.t0 + CFG.dig.ttl);   // v85: escavação esquecida: fecha e guarda o que se achou
  if (p.hunt.on && p.hunt.on.t0 + CFG.hunt.ttl <= now) huntClose(p, p.hunt.on.t0 + CFG.hunt.ttl);   // v98: saída esquecida: o guia vende o que se caçou
  trSettle(p, now);   // v101: o avião que chegou (lá fora, ou cá com a mala)
  if (p.course && p.course.q && p.course.q.t + CFG.exam.ttl <= now) { p.course.next = Math.max(p.course.next || 0, p.course.q.t + CFG.exam.ttl + examRetry(p.course.id)); p.course.q = null; p.course.why = 'ttl'; p.course.last = null; }   // v80: exame deixado aberto conta como chumbo
  p.t = now;
}

function inRound(world, now) {
  if (now < world.start || now >= world.playEnd) fail('ROUND_CLOSED');
}

// allowBusy: deixa fazer no hospital. Preso só se faz o que se faz na prisão (v75, pedido de 17/11): as tarefas de lá, a fiança,
// o advogado e a cara (jailOk). O resto responde IN_JAIL, depois de conferir os argumentos.
// v101: trOk diz o que se faz fora do país: 0 só cá (o normal), 1 também lá fora (não a voar), 2 em qualquer lado (até a voar)
function begin(p, now, world, { allowBusy = false, jailOk = false, trOk = 0 } = {}) {
  inRound(world, now);
  touch(p, now);
  retainerDay(p, now);
  if (p.jailUntil > now && !jailOk) fail('IN_JAIL', { until: p.jailUntil });
  if (!allowBusy && p.hospUntil > now) fail('IN_HOSPITAL', { until: p.hospUntil });
  if (p.tr && trOk < 2 && (trOk === 0 || p.tr.st !== 'there')) fail(p.tr.st === 'there' ? 'ABROAD' : 'FLYING', { to: p.tr.to, until: p.tr.st === 'there' ? 0 : p.tr.at });
}

// ---------- utilidades ----------

const stepOf = (L, r) => {
  let lo = 0, hi = L.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (L[mid] <= r) lo = mid; else hi = mid - 1; }
  return lo + 1;
};
// nível de 1 a 100 pelo maior respeito que já se teve (nunca desce)
export function level(p) { return stepOf(CFG.levels, p.peakRespect ?? p.respect); }
// escala antiga das rondas (1 a 20), pelo mesmo respeito: é o que ainda mede a economia antiga até ao passo 2
export function tier(p) { return stepOf(CFG.tiers, p.peakRespect ?? p.respect); }

export function addictionCap(p) { return CFG.addiction.base + (klass(p).capPlus || 0) + Math.floor(p.stats.T / CFG.addiction.perT); }

function addRespect(p, delta, now) {
  if (delta === 0) return null;
  const before = level(p);
  p.respect = Math.max(0, p.respect + delta);
  if (p.respect > p.peakRespect) p.peakRespect = p.respect;
  p.respectAt = now;
  const after = level(p);
  // economia nova: subir de nível já não enche a stamina (com 100 níveis seria uma barra de borla a cada passo; o modelo não a tem)
  return after !== before ? { from: before, to: after } : null;
}

// o dia de Lisboa de um instante, como 'AAAA-MM-DD'
export function dayOf(now) { const d = localParts(now); return d.y + '-' + String(d.m).padStart(2, '0') + '-' + String(d.d).padStart(2, '0'); }

// ---------- épocas ----------
// O mundo não acaba; de 28 em 28 dias recomeça só a classificação. Cada jogador entra na época com a divisão do nível
// que tem nesse momento e conta o respeito que ganha a partir daí (p.ep = { n, div, r0 }).
export const divisionOf = (L) => Math.min(CFG.season.divs - 1, Math.max(0, Math.floor((L - 1) / CFG.season.divSize)));
export function seasonJoin(p, n) {
  if (!p.ep || p.ep.n !== n) p.ep = { n, div: divisionOf(level(p)), r0: p.respect };
  return p.ep;
}
export const seasonScore = (p, n) => (p.ep && p.ep.n === n ? Math.max(0, p.respect - p.ep.r0) : 0);
// os 3 primeiros de cada divisão, só quem ganhou respeito na época; empate: mais respeito total, depois o id (para dar sempre o mesmo)
export function seasonStandings(players, n, div) {
  return players.filter((p) => p.ep && p.ep.n === n && p.ep.div === div).map((p) => ({ p, score: seasonScore(p, n) }))
    .sort((a, b) => (b.score - a.score) || (b.p.respect - a.p.respect) || (a.p.id < b.p.id ? -1 : a.p.id > b.p.id ? 1 : 0));
}
export function seasonPodium(players, n) {
  return Array.from({ length: CFG.season.divs }, (_, d) => seasonStandings(players, n, d).filter((x) => x.score > 0).slice(0, 3));
}
// prémio em dinheiro: 3, 2 e 1 dias do que um jogador da divisão ganha por dia (base)
export const seasonPrize = (base, pos) => Math.max(0, Math.floor(base * (CFG.season.prizeDays[pos - 1] || 0)));
export function seasonAward(p, n, div, pos, cash) {
  migrate(p);
  if (!p.titles.some((x) => x.k === 'ep' && x.n === n)) p.titles.push({ k: 'ep', n, d: div, pos });
  if (Number.isSafeInteger(cash) && cash > 0) p.cash += cash;
}

function pay(p, amount) {
  if (!Number.isSafeInteger(amount) || amount < 0) fail('BAD_AMOUNT');
  if (p.cash + p.bank < amount) fail('NO_MONEY', { need: amount, have: p.cash + p.bank });
  const fromCash = Math.min(p.cash, amount);
  p.cash -= fromCash;
  p.bank -= amount - fromCash;
}

// ---------- v111: empresas dos jogadores ----------
// O motor só sabe em que empresa o jogador trabalha (id, tipo, estrelas) para o bónus do tipo e para o turno; o resto é do servidor.
const empOk = (e) => !!e && typeof e === 'object' && typeof e.id === 'string' && Number.isInteger(e.t) && e.t >= 0 && e.t < CFG.comp.types.length && Number.isInteger(e.s) && e.s >= 0 && e.s <= 5;
export const empType = (p) => (p.emp ? CFG.comp.types[p.emp.t] : null);
export function empSet(p, id, t, s) { p.emp = { id, t, s }; p.job = -1; }
export function empClear(p) { p.emp = null; }
// o bónus do tipo da empresa: perk[0] com 3 estrelas, perk[1] com 5
export function empBp(p, k) { const x = empType(p); return x && x.perk === k ? (p.emp.s >= 5 ? x.bp[1] : p.emp.s >= 3 ? x.bp[0] : 0) : 0; }
export function empStars(shifts7) { let s = 0; for (const v of CFG.comp.stars) if (shifts7 >= v) s++; return s; }
// o que um turno rende para o caixa: a base do tipo, a qualidade (80% a 120%) e +10% por estrela
export function empRev(t, q, stars) { const x = CFG.comp.types[t], J = CFG.jobs; return Math.floor((Math.floor((x.rev * (J.qMin + Math.floor(((J.qMax - J.qMin) * q) / 10000))) / 10000) * (10000 + CFG.comp.starBp * stars)) / 10000); }
// pode trabalhar nesta empresa (o curso que a tarefa pede)
export const empCan = (p, t) => { const x = CFG.comp.types[t]; return !!x && (!x.course || p.done.includes(x.course)); };
// fundar: nível mínimo, sem outra empresa, paga o preço do tipo (do bolso e depois do banco)
export function empFound(p, now, world, t) {
  const x = CFG.comp.types[t];
  if (!x) fail('NO_COMP_TYPE');
  begin(p, now, world, { allowBusy: true });
  if (p.emp) fail('IN_COMPANY');
  if (level(p) < CFG.comp.minLevel) fail('LOW_LEVEL', { need: CFG.comp.minLevel });
  pay(p, x.cost);
  return { ok: true, cost: x.cost, t };
}
// pôr dinheiro do bolso no caixa (o dono) e tirar do caixa para o banco (o servidor confere o caixa)
export function empPut(p, now, world, amount) {
  begin(p, now, world, { allowBusy: true });
  if (!Number.isSafeInteger(amount) || amount < 1) fail('BAD_AMOUNT');
  if (p.cash < amount) fail('NO_CASH');
  p.cash -= amount;
  return { ok: true, amount };
}
export function empTake(p, now, world, amount) {
  begin(p, now, world, { allowBusy: true });
  if (!Number.isSafeInteger(amount) || amount < 1) fail('BAD_AMOUNT');
  p.bank += amount;
  return { ok: true, amount };
}

// ---------- v112: corridas de carros ----------
// O motor sabe dos carros (comprar, afinar, escolher, vender), de quem entra numa corrida (energia e inscrição), da corrida em si
// (voltas com o acaso e os despistes) e do que se ganha. As corridas entre jogadores (a sala, quem entra, quando arranca) são do servidor.
export const carOf = (id) => CFG.race.cars.find((c) => c.id === id) || null;
export const carMine = (p) => (Array.isArray(p.cars) && p.cars[p.car]) || null;
export function carStats(c) { const x = carOf(c.id), U = CFG.race.upPts; return { spd: x.spd + U * c.up[0], acc: x.acc + U * c.up[1], han: x.han + U * c.up[2] }; }
export const carUpCost = (id, lv) => Math.floor((carOf(id).price * CFG.race.upBp[lv]) / 10000);
export function carValue(c) { let v = carOf(c.id).price; for (const lv of c.up) for (let k = 0; k < lv; k++) v += carUpCost(c.id, k); return v; }
export function carBuy(p, now, world, id) {
  const x = carOf(String(id));
  if (!x) fail('NO_CAR');
  begin(p, now, world, { allowBusy: true });
  if (p.cars.some((c) => c.id === x.id)) fail('HAVE_IT');
  if (p.cars.length >= CFG.race.maxCars) fail('CAR_MAX');
  pay(p, x.price);
  p.cars.push({ id: x.id, up: [0, 0, 0] }); p.car = p.cars.length - 1;
  return { ok: true, id: x.id, cost: x.price };
}
export function carUp(p, now, world, i, part) {
  begin(p, now, world, { allowBusy: true });
  const c = p.cars[i];
  if (!c) fail('NO_CAR');
  if (![0, 1, 2].includes(part)) fail('BAD_PART');
  const lv = c.up[part];
  if (lv >= CFG.race.upBp.length) fail('CAR_UP_MAX');
  const cost = carUpCost(c.id, lv);
  pay(p, cost);
  c.up[part] = lv + 1;
  return { ok: true, id: c.id, part, lv: lv + 1, cost };
}
// ---------- v114: póquer ----------
// sentar: as fichas compram-se com o dinheiro do bolso, entre o mínimo e o máximo da mesa e dentro do limite do dia
export function pkBuy(p, now, world, st, amt) {
  begin(p, now, world);
  const P = CFG.poker, S = Number.isInteger(st) ? P.stakes[st] : null;
  if (!S) fail('NO_STAKE');
  if (level(p) < S.level) fail('LOW_LEVEL', { need: S.level });
  amt = Math.floor(Number(amt));
  if (!Number.isSafeInteger(amt) || amt < S.min || amt > S.max) fail('BAD_AMOUNT', { min: S.min, max: S.max });
  const d = dayOf(now);
  if (!p.pkd || p.pkd.d !== d) p.pkd = { d, n: 0 };
  if (p.pkd.n + amt > P.dayBuy) fail('PK_DAY', { left: Math.max(0, P.dayBuy - p.pkd.n) });
  if (p.cash < amt) fail('NO_CASH');
  p.cash -= amt; p.pkd.n += amt;
  return amt;
}
// sair (ou ser posto fora): as fichas voltam ao bolso
export function pkPay(p, chips) { if (Number.isSafeInteger(chips) && chips > 0) p.cash += chips; }
// no fim de cada mão: as contas de quem lá estava
export function pkHand(p, won, pot) { p.pkn.h += 1; if (won > 0) { p.pkn.w += 1; if (pot > p.pkn.big) p.pkn.big = pot; } }
export function carSel(p, now, world, i) { begin(p, now, world, { allowBusy: true }); if (!p.cars[i]) fail('NO_CAR'); p.car = i; return { ok: true, id: p.cars[i].id }; }   // v113: a garagem fica em casa (lá fora não se mexe)
export function carSell(p, now, world, i) {
  begin(p, now, world, { allowBusy: true });
  const c = p.cars[i];
  if (!c) fail('NO_CAR');
  const v = Math.floor((carValue(c) * CFG.race.sellBp) / 10000);
  p.cars.splice(i, 1); p.bank += v;
  p.car = p.cars.length ? Math.min(p.car === i ? 0 : p.car > i ? p.car - 1 : p.car, p.cars.length - 1) : -1;
  return { ok: true, id: c.id, money: v };
}
// a ficha de quem corre: o carro com as peças e a perícia de condução
export function raceDriver(p) { const c = carMine(p); return c ? { car: c.id, up: [...c.up], ...carStats(c), sk: skillBp(p, 'conducao') } : null; }
// entrar numa corrida: carro, energia e (nas corridas a dinheiro) a inscrição; devolve a ficha do piloto
export function raceEnter(p, now, world, fee) {
  begin(p, now, world);
  const R = CFG.race;
  if (!carMine(p)) fail('NO_CAR');
  if (p.vigor < R.vigor) fail('NO_VIGOR', { need: R.vigor });
  if (fee) pay(p, fee);
  p.vigor -= R.vigor;
  return raceDriver(p);
}
// a corrida não arrancou (ninguém mais entrou): volta a inscrição e a energia
export function raceRefund(p, fee) { p.bank += fee; p.vigor = Math.min(CFG.vigor.max, p.vigor + CFG.race.vigor); return { ok: true, fee }; }
// a corrida: cada volta = o tempo base da pista x 70 / desempenho, com ±noise e, de vez em quando, um despiste (menos com boa condução)
export function raceSim(drivers, ti, rng) {
  const R = CFG.race, tr = R.tracks[ti], maxSk = CFG.skills.maxBp;
  const out = drivers.map((d, i) => {
    const perf = (tr.w[0] * d.spd + tr.w[1] * d.acc + tr.w[2] * d.han) / 100, eff = (perf * (10000 + Math.floor((Math.min(d.sk, maxSk) * R.driveBp) / maxSk))) / 10000;
    const spinBp = Math.round(R.spinBp[0] - ((R.spinBp[0] - R.spinBp[1]) * Math.min(100, d.han)) / 100), laps = [], spins = [];
    for (let k = 0; k < R.laps; k++) {
      let t = (tr.lap * 70) / Math.max(1, eff);
      t = (t * (10000 + rng.int(-R.noiseBp, R.noiseBp))) / 10000;
      if (rng.chance(spinBp)) { t = (t * (10000 + rng.int(R.spinCost[0], R.spinCost[1]))) / 10000; spins.push(k); }
      laps.push(Math.round(t));
    }
    return { i, laps, spins, total: laps.reduce((a, b) => a + b, 0) };
  });
  out.sort((a, b) => a.total - b.total || a.i - b.i);
  out.forEach((r, k) => { r.pos = k + 1; });
  return out;
}
// o que um piloto leva da corrida: o prémio para o banco, a perícia, o respeito dos 3 primeiros e as contas
export function raceReward(p, now, pos, prize) {
  const R = CFG.race;
  p.bank += prize;
  p.sk.conducao += R.skPts + (pos <= 3 ? R.skPodium : 0);
  p.rcn.n += 1; if (pos === 1) p.rcn.w += 1; if (pos <= 3) p.rcn.pod += 1;
  const resp = pos <= 3 ? R.resp[pos - 1] : 0, lvl = resp ? addRespect(p, resp, now) : null;
  return { pos, prize, respect: resp, levelUp: lvl };
}
// corrida de rua: contra pilotos da rua do mesmo escalão (peças e perícia ao calhas); paga aos 3 primeiros
export function raceStreet(p, now, world, rng, ti, names) {
  const R = CFG.race;
  if (!R.tracks[ti]) fail('NO_TRACK');
  const me = raceEnter(p, now, world, 0), tier = carOf(me.car).tier, pool = R.cars.filter((c) => c.tier === tier);
  const nb = rng.int(R.botsMin, R.botsMax), used = new Set(), bots = [];
  for (let k = 0; k < nb; k++) {
    let nm; do nm = names[rng.int(0, names.length - 1)]; while (used.has(nm) && used.size < names.length); used.add(nm);
    const c = { id: pool[rng.int(0, pool.length - 1)].id, up: [rng.int(0, 2), rng.int(0, 2), rng.int(0, 2)] };
    bots.push({ name: nm, bot: true, car: c.id, up: c.up, ...carStats(c), sk: rng.int(0, Math.floor(CFG.skills.maxBp / 2)) });
  }
  const drivers = [{ ...me, me: true }, ...bots], res = raceSim(drivers, ti, rng), mine = res.find((r) => r.i === 0);
  const prize = mine.pos <= 3 ? Math.floor((Math.floor((R.street[tier] * [10000, 5000, 2500][mine.pos - 1]) / 10000) * (10000 + evBp('race', now))) / 10000) : 0;   // v117: o Royal Ascot
  const rw = raceReward(p, now, mine.pos, prize);
  return { ok: true, kind: 's', track: ti, n: drivers.length, ...rw,
    drivers: res.map((r) => ({ name: drivers[r.i].name || null, me: !!drivers[r.i].me, bot: !!drivers[r.i].bot, car: drivers[r.i].car, up: drivers[r.i].up, laps: r.laps, spins: r.spins, total: r.total, pos: r.pos, prize: r.i === 0 ? prize : 0 })) };
}

// ---------- gangues ----------
// O motor só trata do que mexe no jogador: pagar para criar, dar ao cofre e os bónus que a gangue lhe dá.
// Quem é de que gangue, o cofre e os níveis vivem no servidor, que escreve aqui o bónus de cada membro.
const gbp = (p, k) => (p.gb && Number.isSafeInteger(p.gb[k]) ? p.gb[k] : 0);
export function gangBonus(sede, armaria) { const G = CFG.gang; return { loot: G.lootBpPer * sede, atk: G.fightBpPer * armaria, def: G.fightBpPer * armaria }; }
// da mesma gangue a sério: a gangue da rua (a do bot) não protege os membros uns dos outros nem dá descontos entre eles
export const sameCrew = (a, d) => !!a && !!d && !!a.gang && a.gang === d.gang && a.gang !== CFG.gang.bot.id;
// entrar na gangue da rua: as regras de qualquer gangue, e quem saiu dela só volta ao fim de 24 h
export function gangBotCanJoin(p, now) {
  gangCanJoin(p, now);
  if (p.gbotLeft && now - p.gbotLeft < CFG.gang.bot.rejoinMs) fail('BOT_GANG_WAIT', { until: p.gbotLeft + CFG.gang.bot.rejoinMs });
}
export function gangSlots(sede) { return CFG.gang.baseMembers + CFG.gang.perSede * sede; }
export function gangCanJoin(p, now) {
  if (p.gang) fail('IN_GANG');
  if (level(p) < CFG.gang.minLevel) fail('LOW_LEVEL', { need: CFG.gang.minLevel });
  if (p.gangLeft && now - p.gangLeft < CFG.gang.rejoinMs) fail('GANG_WAIT', { until: p.gangLeft + CFG.gang.rejoinMs });
}
export function gangCreate(p, now, world) {
  begin(p, now, world);
  gangCanJoin(p, now);
  pay(p, CFG.gang.createCost);
  return { ok: true, cost: CFG.gang.createCost };
}
export function gangSet(p, id, sede, armaria) { p.gang = id; p.gb = gangBonus(sede, armaria); }
// sair (ou ser expulso): os negócios da gangue devolvem metade do investido e tudo o que estava por receber
export function gangLeave(p, now) {
  let stored = 0, inv = 0;
  if (!Array.isArray(p.gbz) || p.gbz.length !== CFG.gang.biz.length) p.gbz = gbzNew();
  for (let k = 0; k < p.gbz.length; k++) { settleGbz(p, k, Math.max(now, p.gbz[k].t)); stored += p.gbz[k].stored; inv += p.gbz[k].inv; }
  const refund = Math.floor((inv * CFG.gang.bizRefundBp) / 10000);
  p.cash += stored + refund; p.gbz = gbzNew();
  if (p.gang === CFG.gang.bot.id) p.gbotLeft = now;
  p.gang = null; p.gb = null; p.gangLeft = now;
  return { refund, stored, invested: inv };
}
// a gangue deixou de existir no registo (não devia acontecer): o jogador fica sem gangue e recebe de volta tudo o que lá tinha
export function gangOrphan(p) {
  let back = 0;
  if (Array.isArray(p.gbz)) for (const x of p.gbz) back += (x.inv || 0) + (x.stored || 0);
  p.cash += back; p.gbz = gbzNew(); p.gang = null; p.gb = null;
  return back;
}
// ---- negócios da gangue ----
// p.gbz[k] = { inv: o que este membro lá pôs, coop: bónus de grupo em pontos (quem o escreve é gangBizSync), stored/rem/t: rendimento por receber }
function gbzNew() { return CFG.gang.biz.map(() => ({ inv: 0, coop: 0, stored: 0, rem: 0, t: 0 })); }
export function gangBizCap(p, k) { return level(p) * CFG.gang.bizCapPerLevel * CFG.gang.biz[k].capMult; }
export function gangBizRate(p, k) { const s = p.gbz[k]; return up(Math.floor((s.inv * CFG.gang.biz[k].rateBp) / 10000), s.coop); }   // por hora
function settleGbz(p, k, now) {
  const s = p.gbz[k];
  if (s.inv === 0 || now <= s.t) { s.t = Math.max(s.t, now); return; }
  const perH = gangBizRate(p, k), capM = perH * (CFG.storageMs / T.HOUR), dt = Math.min(now - s.t, CFG.storageMs);
  if (s.stored < capM) {
    const tot = s.rem + perH * dt, add = Math.floor(tot / T.HOUR);
    s.rem = tot - add * T.HOUR;
    s.stored = Math.min(capM, s.stored + add);
    if (s.stored === capM) s.rem = 0;
  } else s.rem = 0;
  s.t = now;
}
// leitura para o ecrã, sem mexer no jogador
export function gangBizView(p, now) {
  const ghost = { ...p, gbz: (Array.isArray(p.gbz) && p.gbz.length === CFG.gang.biz.length ? p.gbz : gbzNew()).map((s) => ({ ...s })) };
  return ghost.gbz.map((s, k) => { settleGbz(ghost, k, Math.max(now, s.t)); return { inv: s.inv, coop: s.coop, perH: gangBizRate(ghost, k), stored: s.stored, cap: gangBizCap(p, k) }; });
}
export function gangBizInvest(p, now, world, k, amount, sede) {
  const B = Number.isInteger(k) ? CFG.gang.biz[k] : undefined;
  if (!B) fail('NO_BIZ');
  begin(p, now, world);
  if (!p.gang) fail('NO_GANG');
  if (!Number.isSafeInteger(sede) || sede < B.sede) fail('GBIZ_SEDE', { need: B.sede });
  if (!Number.isSafeInteger(amount) || amount < CFG.gang.bizMin) fail('BAD_AMOUNT');
  const cap = gangBizCap(p, k);
  if (p.gbz[k].inv + amount > cap) fail('GBIZ_CAP', { cap, have: p.gbz[k].inv });
  pay(p, amount);
  settleGbz(p, k, now);          // o que rendeu até agora conta com o que lá estava
  p.gbz[k].inv += amount;
  return { ok: true, k, biz: B.id, amount, inv: p.gbz[k].inv };
}
export function gangBizCollect(p, now, world) {
  begin(p, now, world, { allowBusy: true });
  if (!p.gang) fail('NO_GANG');
  let money = 0;
  for (let k = 0; k < p.gbz.length; k++) { settleGbz(p, k, now); money += p.gbz[k].stored; p.gbz[k].stored = 0; }
  p.cash += money;
  return { ok: true, money };
}
// Acerta o bónus de grupo de todos os membros de uma gangue (chamar sempre que alguém investe, entra ou sai). Devolve quem mudou.
// Antes de mudar o bónus de alguém, fecha-se a conta do que rendeu até agora com o bónus antigo.
export function gangBizSync(players, now) {
  const G = CFG.gang, changed = [];
  // cada sócio acerta-se à sua hora: um que já está mais à frente (outro pedido, relógio acertado) não faz falhar quem investiu
  const at = (p) => Math.max(now, p.t);
  for (const p of players) touch(p, at(p));
  for (let k = 0; k < G.biz.length; k++) {
    for (const p of players) {
      const s = p.gbz[k]; let coop = 0;
      if (s.inv > 0) { let sum = 0; for (const o of players) if (o !== p) sum += Math.min(o.gbz[k].inv, s.inv); coop = Math.min(G.bizCoopMax, Math.floor((G.bizCoopBp * sum) / s.inv)); }
      if (coop !== s.coop) { settleGbz(p, k, at(p)); s.coop = coop; if (!changed.includes(p)) changed.push(p); }
    }
  }
  return changed;
}
export function gangDonate(p, now, world, amount) {
  begin(p, now, world, { allowBusy: true });
  if (!p.gang) fail('NO_GANG');
  if (!Number.isSafeInteger(amount) || amount < CFG.gang.donateMin) fail('BAD_AMOUNT');
  pay(p, amount);
  return { ok: true, amount };
}

// ---------- profissão e efeitos temporários ----------
// v95: a profissão mais o livro que está a fazer efeito (os livros somam às mesmas contas da profissão: lootBp, bustCutBp…)
const klassOf = (p) => CFG.classes.find((c) => c.id === p.cls) || {};
const klass = (p) => {
  const c = klassOf(p), o = p.bk && p.bk.on, b = o ? bookOf(o.id) : null;
  return b && b.k.endsWith('Bp') ? { ...c, [b.k]: (c[b.k] || 0) + b.bp } : c;
};
const up = (x, bp) => Math.floor((x * (10000 + bp)) / 10000);
const cut = (x, bp) => Math.floor((x * (10000 - bp)) / 10000);
export function buffBp(p, k, now) { const f = p.fx && p.fx[k]; return f && now !== undefined && f.until > now ? f.bp : 0; }
export function effStat(p, s, now) { const v = up(p.stats[s], buffBp(p, s, now)); return p.sick && now !== undefined ? cut(v, CFG.hookers.sickCutBp) : v; }
export function activeFx(p, now) { return CFG.fxKinds.filter((k) => buffBp(p, k, now) > 0).map((k) => ({ k, bp: p.fx[k].bp, until: p.fx[k].until })); }
function applyFx(p, g, now) {
  const out = [];
  if ((g.fx || []).some((f) => f.k === 'biz')) settleAllBiz(p, now);   // v89: o que os negócios renderam até aqui conta sem o efeito
  for (const f of g.fx || []) {
    const until = now + up(f.ms, klass(p).fxMoreBp || 0), cur = p.fx[f.k];
    if (!cur || cur.until <= now || f.bp >= cur.bp) { p.fx[f.k] = { bp: f.bp, until }; out.push({ k: f.k, bp: f.bp, until }); }
  }
  return out;
}
export function setClass(p, now, world, id) {
  begin(p, now, world, { allowBusy: true });
  if (p.cls) fail('CLASS_SET');
  const c = CFG.classes.find((x) => x.id === id);
  if (!c) fail('NO_CLASS');
  if ((c.need || 0) > p.peakRespect) fail('CLASS_LOCKED', { need: c.need });
  settleAllBiz(p, now);
  p.cls = id;
  return { ok: true, cls: id };
}
export function classChangeCost(p) {
  const C = CFG.classChange;
  return Math.max(C.min, Math.floor((Math.floor(valuePerEnergy(p) * 100) * C.energy) / 100));
}
// mudar de profissão: paga-se e só de 24 em 24 h. O que os negócios renderam até aqui conta com a profissão antiga.
export function changeClass(p, now, world, id) {
  begin(p, now, world, { allowBusy: true });
  if (!p.cls) fail('NO_CLASS');
  const c = CFG.classes.find((x) => x.id === id);
  if (!c) fail('NO_CLASS');
  if (id === p.cls) fail('CLASS_SET');
  if ((c.need || 0) > p.peakRespect) fail('CLASS_LOCKED', { need: c.need });
  if (p.clsAt && now < p.clsAt + CFG.classChange.coolMs) fail('CLASS_WAIT', { until: p.clsAt + CFG.classChange.coolMs });
  const capNovo = CFG.addiction.base + (c.capPlus || 0) + Math.floor(p.stats.T / CFG.addiction.perT);
  if (p.addiction > capNovo) fail('ADDICTION_LIMIT', { cap: capNovo });   // com vício acima do limite da profissão nova, primeiro desintoxica (senão mudar apagava vício de graça)
  const cost = classChangeCost(p);
  if (p.cash + p.bank < cost) fail('NO_MONEY', { need: cost, have: p.cash + p.bank });
  settleAllBiz(p, now);
  pay(p, cost);
  const from = p.cls;
  p.cls = id; p.clsAt = now;
  return { ok: true, cls: id, from, cost };
}
export function setAvatar(p, now, world, i) {
  begin(p, now, world, { allowBusy: true, jailOk: true, trOk: 2 });
  if (!Number.isInteger(i) || i < 0 || i >= CFG.avatars) fail('NO_AVATAR');
  p.av = i;
  return { ok: true, av: i };
}
const huBp = (p, i) => (p.hu && CFG.house.ups[i] ? (p.hu[i] || 0) * CFG.house.ups[i].bp : 0);   // (já não há melhorias da casa)
// press: a pressão policial de Lisboa (passo 6); sem ela conta como 50, o valor com que o modelo foi feito
export function bustChanceBp(p, now, press) {
  const acc = p.eq && p.eq.acess ? gearOf(p.eq.acess.id) : null;   // o rádio-scanner ouve a polícia a chegar
  const base = acc && acc.bustBp ? acc.bustBp : CFG.bustBp;
  const b = cut(cut(cut(cut(base, klass(p).bustCutBp || 0), buffBp(p, 'bust', now)), huBp(p, 2)), evBp('bust', now));   // v117: as máscaras do Halloween
  return Math.min(9500, Math.floor((b * pressMultBp(press)) / 10000));
}
// ---------- casa ----------
// a casa seguinte paga-se com a antiga na troca, pelo que ela custou
const luxTax = (x) => (law('luxo') ? Math.floor((x * CFG.gov.laws.luxo.bp) / 10000) : 0);   // v76: o imposto de luxo vai para os cofres
export function housePrice(p) { const n = CFG.house.tiers[p.house + 1]; if (!n) return null; const x = n.price - CFG.house.tiers[p.house].price; return x + luxTax(x); }
export function buyHouse(p, now, world) {
  begin(p, now, world, { allowBusy: true });
  const n = CFG.house.tiers[p.house + 1];
  if (!n) fail('HOUSE_MAX');
  const price = housePrice(p), base = n.price - CFG.house.tiers[p.house].price;
  pay(p, price);
  p.house += 1;
  return { ok: true, price, tax: price - base, respect: n.resp, levelUp: addRespect(p, n.resp, now) };
}
export function upgradePrice(p, u) {
  const g = CFG.house.ups[u], n = CFG.house.tiers[p.hu[u] + 1];
  return g && n ? Math.floor((n.price * g.costBp) / 10000) : null;
}
export function buyUpgrade(p, now, world, u) {
  if (!Number.isInteger(u) || !CFG.house.ups[u]) fail('NO_UPGRADE');
  begin(p, now, world, { allowBusy: true });
  if (p.hu[u] >= p.house) fail('NEED_HOUSE');
  const price = upgradePrice(p, u);
  pay(p, price);
  settleAllBiz(p, now); // o rendimento até aqui conta sem a melhoria nova
  p.hu[u] += 1;
  return { ok: true, price, level: p.hu[u] };
}
export function drugPrice(p, d) { return Math.max(1, cut(CFG.drugs[d].price, klass(p).drugCutBp || 0)); }

export function chanceBp(S, D) {
  const { minBp, maxBp } = CFG.chance;
  if (S <= 0) return minBp;
  const s2 = S * S, d2 = D * D;
  return clamp(Math.floor((10000 * s2) / (s2 + d2)), minBp, maxBp);
}

// força fixa do equipamento que se usa nos golpes em grupo (arma de gangue)
const gearStr = (list, idx) => (idx >= 0 && list[idx] ? list[idx].str : 0);
// Golpes de rua (base nova): a hipótese é a do golpe e abrem pelo nível. As ferramentas voltam com as operações (passo 5).
export function crimeScore(p, k) { return CFG.crimes[k].p; }
export function toolPreview() { return null; }
export function crimeChanceBp(p, k) { return CFG.crimes[k].p; }
export function crimeUnlocked(p, k) { return level(p) >= CFG.crimes[k].level; }
// média do que se leva quando corre bem (sem bónus)
export const crimeEv = (c) => c.prizes.reduce((s, [bp, a, z]) => s + (bp * (a + z)) / 2, 0) / 10000;
// o que ainda está quente: o que se gastou, menos perH por hora desde a última vez (16/11: antes era por dia, à meia-noite)
function cooled(x, now, perH) {
  if (!x) return 0;
  if (x.t === undefined) return now !== undefined && x.d === dayOf(now) ? x.e : 0;   // formato antigo, por dia
  if (now === undefined) return x.e;
  return Math.max(0, x.e - Math.floor((Math.max(0, now - x.t) * perH) / T.HOUR));
}
const ruaHot = (p, now) => cooled(p.rua, now, CFG.street.coolPerH);
// o que se gastou hoje em golpes (para o respeito, que conta por dia)
const ruaToday = (p, now) => (p.rua && now !== undefined && p.rua.d === dayOf(now) ? (p.rua.t === undefined ? p.rua.e : p.rua.de || 0) : 0);
const respHeatOf = (p, now) => { const H = CFG.street.respHeat; return H[Math.min(H.length - 1, Math.floor(ruaToday(p, now) / 100))]; };
export const refillUsed = (p, now) => cooled(p.rf, now, CFG.refillBar.coolPerH);
// calor da rua: a barra de golpes em que se vai (cada 100 de stamina gasta em golpes de rua e ainda quente)
function heatOf(p, now) {
  const H = CFG.street.heat;
  return H[Math.min(H.length - 1, Math.floor(ruaHot(p, now) / 100))];
}
export function streetView(p, now) { return { used: ruaHot(p, now), heatBp: heatOf(p, now), coolPerH: CFG.street.coolPerH, today: ruaToday(p, now), respBp: respHeatOf(p, now) }; }
// a arma de fogo que se usa nos golpes: a de mão, se ainda disparar; senão a principal. Se nenhuma dispara, a que houver (para dizer que está gasta).
export const gunOf = (p) => { const m = p.eq.mao, q = p.eq.principal; return m && m.u > 0 ? 'mao' : q && q.u > 0 ? 'principal' : m ? 'mao' : q ? 'principal' : null; };
const bulletsOf = (p) => { const b = p.inv.find((x) => x.id === 'balas'); return b ? b.n : 0; };
function gunCheck(p) {
  const s = gunOf(p);
  if (!s) fail('NEED_GUN');
  if (!(p.eq[s].u > 0)) fail('GUN_BROKEN');
  if (bulletsOf(p) < ammoPerJob(p)) fail('NO_AMMO', { need: ammoPerJob(p) });
  return s;
}
// v97: as balas de um golpe (10), menos as que o carregador alargado da arma usada poupa (nunca menos de 1)
export function ammoPerJob(p) { const s = gunOf(p), it = s ? p.eq[s] : null; return Math.max(1, CFG.bullets.perJob - (it ? wStat(it).ammo : 0)); }

// ---------- crimes ----------

// ---------- prática ----------

export function practiceNeed(p, s) { return CFG.practice.base + CFG.practice.perStat * p.stats[s]; }

// devolve as stats que subiram, ex.: { C: 1 }
function practice(p, c, success) {
  const gained = {};
  for (const s of ['F', 'I', 'C']) {
    if (!c.w[s]) continue;
    let xp = c.e * c.w[s];
    if (!success) xp = Math.floor((xp * CFG.practice.failBp) / 10000);
    p.xp[s] += xp;
    let need = practiceNeed(p, s);
    while (p.xp[s] >= need) {
      p.xp[s] -= need; p.stats[s] += 1; gained[s] = (gained[s] || 0) + 1;
      need = practiceNeed(p, s);
    }
  }
  return gained;
}

// skill de uma família de golpe, em bp a mais no que se leva: até maxBp ao fim de fullPts de stamina gasta, em proporção
export function skillBp(p, fam) {
  const S = CFG.skills, pts = (p.sk && p.sk[fam]) || 0;
  return Math.floor((S.maxBp * Math.min(pts, S.fullPts)) / S.fullPts);
}

export function masteryStars(p, k) {
  const n = p.wk[k]; let s = 0;
  for (const at of CFG.mastery.at) if (n >= at) s++;
  return s;
}

export function doCrime(p, now, world, k, rng) {
  const c = Number.isInteger(k) ? CFG.crimes[k] : undefined;
  if (!c) fail('NO_CRIME');
  begin(p, now, world);
  if (!crimeUnlocked(p, k)) fail('LOCKED', { need: c.level });
  if (p.energy < c.e) fail('NO_ENERGY', { need: c.e });
  const gun = c.gun ? gunCheck(p) : null;
  const ammo = gun ? ammoPerJob(p) : 0, quiet = gun ? wStat(p.eq[gun]).bust : 0;   // v97: o silenciador da arma usada baixa a hipótese de ser apanhado
  if (gun) { takeInv(p, 'balas', ammo); p.eq[gun].u -= 1; }   // balas e um uso da arma: gastam-se antes, corra bem ou mal
  const bp = Math.max(c.p, Math.min(9500, c.p + evBp('luck', now))), heatBp = heatOf(p, now), respBp = respHeatOf(p, now);   // v117: a sorte do São Patrício
  settleAllBiz(p, now); // a prática pode subir stats: o rendimento até aqui conta com as antigas
  p.energy -= c.e;
  p.rua = { e: ruaHot(p, now) + c.e, t: now, d: dayOf(now), de: ruaToday(p, now) + c.e };
  p.sk[c.fam] += c.e;   // a skill sobe com a prática, corra bem ou mal
  // o primeiro carteirista de quem ainda não tem respeito nenhum corre sempre bem: a primeira jogada não pode ser a prisão
  const first = k === 0 && p.peakRespect === 0;
  if (first || rng.chance(bp)) {
    // o que vem é à sorte: escolhe-se a linha da tabela e depois o valor dentro dela
    let roll = rng.int(0, 9999), row = c.prizes[c.prizes.length - 1];
    for (const pr of c.prizes) { if (roll < pr[0]) { row = pr; break; } roll -= pr[0]; }
    const base = rng.int(row[1], row[2]);
    const bonus = 10000 + skillBp(p, c.fam) + (klass(p).lootBp || 0) + buffBp(p, 'loot', now) + gbp(p, 'loot') + empBp(p, 'loot') + evBp('loot', now) + (c.fam === 'burla' ? studyBp(p, 'burla') : 0);   // v81: artes; v117: o Carnaval
    const value = Math.floor((Math.floor((base * bonus) / 10000) * heatBp) / 10000);
    // o que é objeto vai para o inventário (com o valor que saiu); sem espaço, vende-se logo à pressa por metade
    let money = value, good = null, rushed = false;
    if (CFG.loot.goods.includes(row[3])) {
      if (addGood(p, row[3], value)) { money = 0; good = row[3]; } else { money = Math.floor((value * CFG.loot.rushBp) / 10000); rushed = true; }
    }
    const L = launder(p, money); money = L.net;
    p.cash += money;
    p.c.crimes += 1; p.c.wins += 1; p.wk[k] += 1;
    // respeito: uma barra de golpes vale 20 + 2 por nível (até 120), vezes o calor do dia (respHeat); dá-se nos golpes que correm bem
    const S = CFG.street, perBar = Math.min(S.respCap, S.respBase + S.respPerLevel * level(p));
    // por golpe que corre bem: perBar × e/100 a dividir pela hipótese, para a barra dar em média perBar; o resto (em milésimos)
    // fica guardado para o golpe seguinte, para não se perder nos arredondamentos
    const milli = Math.floor((perBar * c.e * respBp * 10) / bp) * (10000 + (klass(p).respBp || 0) + evBp('resp', now)) / 10000 + (p.rc || 0);   // v117: o Ano Novo
    const resp = Math.floor(milli / 1000);
    p.rc = Math.floor(milli - resp * 1000);
    const lvl = addRespect(p, resp, now);
    const gained = practice(p, c, true);
    const R = CFG.col.sets.raras.items, col = colFind(p, rng, up(c.e * CFG.col.crimeBpPerE, klass(p).colBp || 0), () => R[rng.int(0, R.length - 1)]);   // v90: o ladrão dá mais com elas
    const book = p.c.wins % CFG.books.findEvery === 0 ? bookFind(p, now) : null;   // v95: um livro a cada 150 golpes bem-sucedidos (sem gastar sorte)
    const ev = evDrop(p, c, now, rng);   // v117: as fichas dos eventos
    return { ok: true, success: true, money, value, good, rushed, lav: L.lav, base, item: row[3], crit: false, respect: resp, levelUp: lvl, chanceBp: bp, heatBp, respBp, ammo, gained, newChanceBp: bp, star: 0, ...(col ? { col } : {}), ...(book ? { book } : {}), ...(ev ? { ev } : {}) };
  }
  p.c.crimes += 1;
  // falhar não é sempre prisão: uma falha em quatro é apanhada
  const busted = rng.chance(cut(bustChanceBp(p, now, world && world.press), quiet));
  if (busted) jailFor(p, now, c.jailMin * T.MIN, k + 1, { k: 'crime', id: k });
  const gained = practice(p, c, false);
  return { ok: true, success: false, busted, jailUntil: p.jailUntil, chanceBp: bp, heatBp, respBp, ammo, gained, newChanceBp: bp };
}

// «usar a stamina toda»: repete o mesmo golpe tantas vezes quantas a stamina de agora dá (no máximo crimeAllMax).
// Para se fores preso, se acabarem as balas ou se a arma ficar gasta. Cada golpe é exatamente igual a um toque no botão; isto só poupa toques.
export function doCrimeAll(p, now, world, k, rng) {
  const c = Number.isInteger(k) ? CFG.crimes[k] : undefined;
  if (!c) fail('NO_CRIME');
  begin(p, now, world);
  if (!crimeUnlocked(p, k)) fail('LOCKED', { need: c.level });
  if (p.energy < c.e) fail('NO_ENERGY', { need: c.e });
  if (c.gun) gunCheck(p);
  const out = { ok: true, all: true, n: 0, wins: 0, crits: 0, money: 0, best: 0, bestCrit: false, bestItem: null, respect: 0, ammo: 0,
    busted: false, jailUntil: 0, levelUp: null, gained: {}, star: 0, chanceBp: c.p, heatBp: heatOf(p, now), respBp: respHeatOf(p, now), newChanceBp: c.p, items: {} };
  const budget = Math.min(CFG.crimeAllMax, Math.floor(p.energy / c.e));
  const gunOk = () => { if (!c.gun) return true; try { gunCheck(p); return true; } catch { return false; } };
  while (out.n < budget && p.energy >= c.e && gunOk()) {
    const r = doCrime(p, now, world, k, rng);
    out.n += 1; out.ammo += r.ammo;
    for (const [s, g] of Object.entries(r.gained)) out.gained[s] = (out.gained[s] || 0) + g;
    if (r.success) {
      out.wins += 1; out.money += r.money; out.value = (out.value || 0) + r.value; out.respect += r.respect; out.lav = (out.lav || 0) + r.lav;
      if (r.good) { out.goods = out.goods || {}; out.goods[r.good] = (out.goods[r.good] || 0) + r.value; out.goodsN = (out.goodsN || 0) + 1; }
      if (r.rushed) out.rushed = (out.rushed || 0) + 1;
      if (r.book) (out.books ||= []).push(r.book);   // v95: os livros achados pelo caminho
      out.items[r.item] = (out.items[r.item] || 0) + 1;
      if (r.value > out.best) { out.best = r.value; out.bestItem = r.item; }
      if (r.star) out.star = r.star;
      if (r.levelUp) out.levelUp = { from: out.levelUp ? out.levelUp.from : r.levelUp.from, to: r.levelUp.to };
      if (r.col) { out.col = out.col || {}; out.col[r.col] = (out.col[r.col] || 0) + 1; }
      if (r.ev) for (const x of r.ev) { const o = (out.ev ||= []).find((y) => y.key === x.key); if (o) { o.got += x.got; o.n = x.n; o.paid.push(...x.paid); } else out.ev.push({ ...x, paid: [...x.paid] }); }   // v117
    } else if (r.busted) { out.busted = true; out.jailUntil = r.jailUntil; break; }
  }
  out.heatEnd = heatOf(p, now);
  return out;
}

// multa/fiança: a do golpe que te prendeu, proporcional ao tempo que falta
export function bailCost(p, now) { const x = bailRaw(p, now); const bp = studyBp(p, 'bail'); return x > 0 && bp ? Math.max(1, Math.ceil((x * (10000 - bp)) / 10000)) : x; }   // v81: direito
function bailRaw(p, now) {
  if (!(p.jailUntil > now)) return 0;
  if (p.jailTier === DRUG_JAIL) { const left = p.jailUntil - now, total = CFG.wh.jailMin * T.MIN; return Math.max(1, Math.ceil((CFG.wh.lawyer * Math.min(left, total)) / total)); }
  const hs = p.jailTier >= HUNT_JAIL ? CFG.hunt.sites[p.jailTier - HUNT_JAIL] : null;   // v98: apanhado na caça furtiva
  if (hs) { const left = p.jailUntil - now, total = hs.jail * T.MIN; return Math.max(1, Math.ceil((hs.lawyer * Math.min(left, total)) / total)); }
  const sd = p.jailTier >= DIG_JAIL ? CFG.dig.sites[p.jailTier - DIG_JAIL] : null;   // v85: apanhado a escavar
  if (sd) { const left = p.jailUntil - now, total = sd.jailMin * T.MIN; return Math.max(1, Math.ceil((sd.lawyer * Math.min(left, total)) / total)); }
  const o = p.jailTier >= 100 && p.jailTier < DRUG_JAIL ? CFG.ops[p.jailTier - 100] : null;
  if (o) { const left = p.jailUntil - now, total = o.jailMin * T.MIN; return Math.max(1, Math.ceil((o.lawyer * Math.min(left, total)) / total)); }
  const c = CFG.crimes[p.jailTier - 1] || CFG.crimes[CFG.crimes.length - 1];
  const left = p.jailUntil - now, total = c.jailMin * T.MIN;
  const full = cut(c.fine, klass(p).bailCutBp || 0);
  return govBail(Math.max(1, Math.ceil((full * Math.min(left, total)) / total)));
}
// v76: com penas pesadas a fiança é ×1,5; a corrupção alta torna-a mais barata (até −30% com 100)
function govBail(x) {
  let y = law('penas') ? Math.ceil((x * CFG.gov.laws.penas.bailBp) / 10000) : x;
  y = Math.ceil((y * (10000 - Math.floor((CFG.gov.corr.bailCutMax * Math.min(100, GOV.corr || 0)) / 100))) / 10000);
  return Math.max(1, y);
}

export function payBail(p, now, world) {
  begin(p, now, world, { allowBusy: true, jailOk: true });
  if (!(p.jailUntil > now)) fail('NOT_IN_JAIL');
  const cost = bailCost(p, now);
  pay(p, cost);
  p.jailUntil = 0; p.jailTier = 0;
  return { ok: true, cost };
}

// safar um membro da mesma gangue: paga-se a fiança ou o hospital dele (o preço é o dele, quem paga é outro)
export function bailFor(payer, target, now, world) {
  if (payer === target || payer.id === target.id) fail('SELF');   // os argumentos primeiro, depois se quem paga pode (preso não pode)
  if (!payer.gang || payer.gang !== target.gang) fail('NO_GANG');
  begin(payer, now, world, { allowBusy: true });
  touch(target, now);
  if (!(target.jailUntil > now)) fail('NOT_IN_JAIL');
  const cost = bailCost(target, now);
  pay(payer, cost);
  target.jailUntil = 0; target.jailTier = 0;
  return { ok: true, cost };
}
export function medicFor(payer, target, now, world) {
  if (payer === target || payer.id === target.id) fail('SELF');   // os argumentos primeiro, depois se quem paga pode (preso não pode)
  if (!payer.gang || payer.gang !== target.gang) fail('NO_GANG');
  begin(payer, now, world, { allowBusy: true });
  touch(target, now);
  if (!(target.hospUntil > now)) fail('NOT_IN_HOSPITAL');
  const cost = medicCost(target, now);
  pay(payer, cost);
  target.hospUntil = 0;
  return { ok: true, cost };
}
export function medicCost(p, now) {
  if (!(p.hospUntil > now)) return 0;
  const mins = Math.ceil((p.hospUntil - now) / T.MIN);
  const porNivel = mins * CFG.medicPerMin * tier(p), porValor = Math.floor((mins * Math.floor(valuePerEnergy(p) * 100) * CFG.medicValueBp) / 1000000);
  return Math.max(1, Math.min(porNivel, porValor));
}

// ---------- consumíveis (v78) ----------
// cerveja, whisky e absinto dão stamina; o energético dá vigor; a ligadura, o kit e a morfina encurtam o internamento.
// Cada um soma à conta da sua família (estômago ou médica) e não se consome se a conta passasse do teto.
export const consumOf = (id) => CFG.consum.list.find((x) => x.id === id);
export function consumWait(p, fam, now) { return Math.max(0, ((p.cd && p.cd[fam]) || 0) - now); }
export function consume(p, now, world, id) {
  const it = consumOf(id);
  if (!it) fail('NO_ITEM');
  begin(p, now, world, { allowBusy: it.fam === 'med', trOk: 2 });   // (v101: bebe-se e trata-se também em viagem)
  if (it.level && level(p) < it.level) fail('LOW_LEVEL', { need: it.level });
  if (it.fam === 'med' && !(p.hospUntil > now)) fail('NOT_IN_HOSPITAL');
  if (it.energy && p.energy >= energyMax(p)) fail('ENERGY_FULL');
  if (it.vigor && p.vigor >= CFG.vigor.max) fail('VIGOR_FULL');
  const wait = consumWait(p, it.fam, now);
  if (wait + it.cd > CFG.consum.cap[it.fam]) fail('TOO_SOON', { wait: wait + it.cd - CFG.consum.cap[it.fam] });
  pay(p, it.price);
  p.cd[it.fam] = now + wait + it.cd;
  let gain = 0;
  if (it.energy) { const e0 = p.energy; p.energy = Math.min(energyMax(p), p.energy + it.energy); gain = p.energy - e0; }
  if (it.vigor) { const v0 = p.vigor; p.vigor = Math.min(CFG.vigor.max, p.vigor + it.vigor); if (p.vigor >= CFG.vigor.max) p.vigorT = now; gain = p.vigor - v0; }
  if (it.cut) { const h0 = p.hospUntil; p.hospUntil = p.hospUntil - it.cut > now ? p.hospUntil - it.cut : 0; gain = Math.round(((p.hospUntil || now) - h0) / -T.MIN); }
  return { ok: true, id, price: it.price, gain, until: p.cd[it.fam] };
}

// ---------- colecionáveis e museu (v79) ----------
// Ficam na vitrine (p.col), fora do inventário e das apreensões. O museu fica com um de cada peça do conjunto.
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
export const colItems = () => Object.values(CFG.col.sets).flatMap((x) => x.items);
function colFind(p, rng, bp, pick) {
  if (!rng.chance(bp)) return null;
  const id = pick();
  if (!id) return null;
  p.col[id] = (p.col[id] || 0) + 1;
  return id;
}
// quanto paga a próxima entrega de um conjunto: a primeira paga o dobro e põe o nome na placa; nos das escavações, as repetidas
// pagam digRepBp e não dão respeito (v85)
export function museumPay(p, set) {
  const S = CFG.col.sets[set], first = !(p.mus && p.mus[set] > 0);
  if (first) return { first, cash: S.cash * 2, resp: S.resp * 2 };
  if (S.dig) return { first, cash: Math.floor((S.cash * CFG.col.digRepBp) / 10000), resp: 0 };
  return { first, cash: S.cash, resp: S.resp };
}
export function museumGive(p, now, world, set) {
  const S = typeof set === 'string' && own(CFG.col.sets, set) ? CFG.col.sets[set] : null;
  if (!S) fail('NO_SET');
  begin(p, now, world);
  const miss = S.items.filter((i) => !(p.col[i] > 0));
  if (miss.length) fail('SET_INCOMPLETE', { miss });
  for (const i of S.items) p.col[i] -= 1;
  const { first, cash, resp } = museumPay(p, set);
  p.bank += cash;
  p.mus[set] = (p.mus[set] || 0) + 1;
  return { ok: true, set, cash, respect: resp, first, n: p.mus[set], levelUp: addRespect(p, resp, now) };
}
export function colSell(p, now, world, id, n) {
  if (typeof id !== 'string' || !colItems().includes(id)) fail('NO_ITEM');
  begin(p, now, world);
  const extra = Math.max(0, (p.col[id] || 0) - 1), k = Math.min(extra, Number.isInteger(n) ? n : 0);
  if (k <= 0) fail('NO_EXTRA');
  p.col[id] -= k;
  const cash = k * CFG.col.pawn;
  p.cash += cash;
  return { ok: true, id, n: k, cash };
}

export function payMedic(p, now, world) {
  begin(p, now, world, { allowBusy: true, trOk: 1 });   // (v101: também no hospital lá de fora)
  if (!(p.hospUntil > now)) fail('NOT_IN_HOSPITAL');
  const cost = medicCost(p, now);
  pay(p, cost);
  p.hospUntil = 0;
  return { ok: true, cost };
}

// ---------- putas ----------
const recent = (arr, now, win) => (now === undefined ? arr.length : arr.reduce((c, t) => c + (t > now - win ? 1 : 0), 0));
// degraus de preço desta puta agora: cada visita sobe um; por cada hora inteira sem lá ir, desce um
export function hookerSteps(p, i, now) {
  const n = p.hkN[i] || 0; if (n <= 0) return 0;
  return Math.max(0, n - Math.max(0, Math.floor((now - p.hkAt[i]) / CFG.hookers.coolMs)));
}
export const hookerUses = (p, now) => p.hkN.reduce((s, _, i) => s + hookerSteps(p, i, now), 0);
export const detoxUses = (p, now) => recent(p.detoxT, now, CFG.detox.windowMs);
// o preço é o da escada de stamina do dia (a das barras a droga) pelo que ela dá, vezes o dela (v74: sem subir por visita)
export function hookerPrice(p, i, now) {
  const g = CFG.hookers.list[i];
  const from = now !== undefined ? refillUsed(p, now) : 0;
  const price = Math.max(1, Math.ceil((refillCost(from, g.e) * g.valueBp) / 10000));
  return Math.max(1, cut(cut(price, klass(p).hkCutBp || 0), now !== undefined ? evBp('vice', now) : 0));   // v117: o Dia dos Namorados
}
export function visitHooker(p, now, world, i, rng) {
  const g = Number.isInteger(i) ? CFG.hookers.list[i] : undefined;
  if (!g) fail('NO_HOOKER');
  begin(p, now, world);
  if (p.sick) fail('SICK');
  if (p.energy >= energyMax(p)) fail('ENERGY_FULL');
  const price = hookerPrice(p, i, now);
  pay(p, price);
  return { ok: true, price, ...doVisit(p, i, now, rng, price) };
}
function doVisit(p, i, now, rng, base) {
  const g = CFG.hookers.list[i];
  const got = Math.min(g.e, energyMax(p) - p.energy);
  p.energy += got;
  p.rf = { e: refillUsed(p, now) + got, t: now };   // sobe a escada como uma barra
  p.hkN[i] = Math.min(CFG.hookers.maxSteps, hookerSteps(p, i, now) + 1); p.hkAt[i] = now;   // a hora conta a partir da última visita a ela
  const sick = rng.chance(cut(g.sickBp, klass(p).sickCutBp || 0));
  if (sick) p.sick = true;
  return { energy: got, sick, rob: hookerRob(p, i, base, rng) };
}
// rara: ela rouba-te. Só perdes (ninguém recebe) e nunca mais do que tens: a carteira é só o dinheiro na mão, o resto sai da mão e depois do banco.
function hookerRob(p, i, base, rng) {
  const R = CFG.hookers.rob;
  if (!rng.chance(R.bp[CFG.hookers.list[i].tier])) return null;
  const [kind, mult] = pickW(rng, R.items);
  const loss = Math.min(kind === 'wallet' ? p.cash : p.cash + p.bank, base * mult);
  if (!(loss > 0)) return null;
  const fromCash = Math.min(p.cash, loss); p.cash -= fromCash; p.bank -= loss - fromCash;
  return { kind, loss };
}
export function cureCost(p) {
  return p.sick ? Math.max(CFG.hookers.cureMin, Math.floor((Math.floor(valuePerEnergy(p) * 100) * CFG.hookers.cureValueBp) / 10000)) : 0;
}
export function cure(p, now, world) {
  begin(p, now, world, { allowBusy: true });
  if (!p.sick) fail('NOT_SICK');
  const price = cureCost(p);
  pay(p, price);
  p.sick = false;
  return { ok: true, price };
}

// ---------- discoteca ----------

export function canBuyDrug(p, d) {
  const g = CFG.drugs[d];
  return (g.fx || p.energy + g.e <= energyMax(p)) && p.addiction + g.a <= addictionCap(p) && p.cash + p.bank >= drugPrice(p, d);
}

export function buyDrug(p, now, world, d) {
  const g = Number.isInteger(d) ? CFG.drugs[d] : undefined;
  if (!g) fail('NO_DRUG');
  begin(p, now, world);
  canTake(p, g);
  const price = drugPrice(p, d);
  pay(p, price);
  return { ok: true, price, ...take(p, g, now) };
}
// quem está cheio só pode tomar o que tem efeito (a stamina a mais perde-se)
function canTake(p, g) {
  if (!g.fx && p.energy + g.e > energyMax(p)) fail('ENERGY_FULL');
  if (p.addiction + g.a > addictionCap(p)) fail('ADDICTION_LIMIT', { cap: addictionCap(p) });
}
function take(p, g, now) {
  const got = Math.min(g.e, energyMax(p) - p.energy);
  p.energy += got;
  if (p.addiction === 0) p.addictionT = now;
  p.addiction += g.a;
  p.c.refills += 1;
  return { energy: got, addiction: g.a, fx: applyFx(p, g, now) };
}

// Quanto vale 1 ponto de energia para este jogador: o melhor golpe desbloqueado, em dinheiro esperado.
export function valuePerEnergy(p) {
  let best = 0;
  for (let k = 0; k < CFG.crimes.length; k++) {
    if (!crimeUnlocked(p, k)) continue;
    const c = CFG.crimes[k], v = (c.p * crimeEv(c)) / 10000 / c.e;
    if (v > best) best = v;
  }
  return best;
}

// Stamina a mais, a droga (base nova): cada barra de 100 seguida custa 25 € × k + 5 € × k² (30, 70, 120, 180 €…); a escada desce 25 por hora.
// Paga-se ponto a ponto, por isso meia barra custa metade. Não mexe no vício (os efeitos tomam-se à parte, na discoteca).
const barPrice = (k) => CFG.refillBar.a * k + CFG.refillBar.b * k * k;
function refillCost(from, n) {
  let cents = 0;   // em centésimos de euro, para somar ponto a ponto sem arredondar a meio
  for (let u = from; u < from + n; u++) cents += barPrice(Math.floor(u / 100) + 1);
  return Math.ceil(cents / 100);
}
export function refillPlan(p, now) {
  const room = energyMax(p) - p.energy;
  if (room <= 0) return null;
  const from = now === undefined ? 0 : refillUsed(p, now);
  const ev = now === undefined ? 0 : evBp('refill', now);   // v117: a Oktoberfest
  return { energy: room, cost: Math.max(1, cut(refillCost(from, room), ev)), next: barPrice(Math.floor(from / 100) + 1), counts: CFG.drugs.map(() => 0), ev };
}
export function refill(p, now, world) {
  begin(p, now, world);
  const plan = refillPlan(p, now);
  if (!plan) fail('ENERGY_FULL');
  pay(p, plan.cost);
  p.rf = { e: refillUsed(p, now) + plan.energy, t: now };
  p.energy += plan.energy;
  p.c.refills += 1;
  return { ok: true, energy: plan.energy, addiction: 0, price: plan.cost, counts: plan.counts };
}

// ---------- venda de droga na rua ----------
// Compra-se ao quilo (fica guardada à parte, em gramas: não vai para a discoteca) e vende-se ao grama com stamina: cada venda gasta deal.step e vende um décimo
// de barra. A clientela compra deal.base barras por dia, mais uma por cada deal.perLevels níveis. Sem calor e sem risco.
const dealOf = (j) => (Number.isInteger(j) ? CFG.deal.list[j] : undefined);
const dealDrug = (x) => CFG.drugs.findIndex((g) => g.id === x.drug);
export const dealCap = (p) => (CFG.deal.base + Math.floor(level(p) / CFG.deal.perLevels)) * (100 / CFG.deal.step);
export const dealUsed = (p, now) => (p.dl && p.dl.d === dayOf(now) ? p.dl.n : 0);
export function dealBuy(p, now, world, j, kg) {
  const x = dealOf(j);
  if (!x) fail('NO_DRUG');
  if (!Number.isSafeInteger(kg) || kg < 1 || kg > 20) fail('BAD_AMOUNT');
  begin(p, now, world, { allowBusy: true });
  if (level(p) < x.level) fail('LOW_LEVEL', { need: x.level });
  const price = kg * x.kg;
  if (p.dst[j] <= 0 && invUsed(p) >= invCap(p)) fail('NO_ROOM');   // um tipo de droga novo ocupa um espaço
  pay(p, price);
  p.dst[j] += kg * 1000;
  return { ok: true, price, grams: kg * 1000, d: dealDrug(x), have: p.dst[j] };
}
// ---------- empregos e cursos (passo 3) ----------
const jobOf = (i) => (Number.isInteger(i) ? CFG.jobs.list[i] : undefined);
const courseOf = (id) => CFG.courses.find((c) => c.id === id);
// v81: os níveis dos estudos usam o banco de perguntas da matéria
export const examBank = (id) => { const c = courseOf(id); return (c && c.bank) || id; };
// v81: bónus dos estudos e artes marciais (o do nível mais alto feito de cada matéria, somado entre matérias)
export function studyBp(p, fx) {
  let bp = 0;
  for (const st of CFG.studies.list) {
    const v = st.fx[fx]; if (!v) continue;
    for (let n = v.length; n >= 1; n--) if (p.done && p.done.includes(st.id + n)) { bp += v[n - 1]; break; }
  }
  return bp;
}
export const jobOpen = (p, i) => { const x = jobOf(i); return !!x && (!x.course || p.done.includes(x.course)); };
export function shiftsToday(p, now) { return p.sh && p.sh.d === dayOf(now) ? p.sh.n : 0; }
// o que paga o turno n (1 a 6) de um emprego: os seis somam exatamente o dia
export function shiftPay(x, n) { const P = CFG.jobs.perDay, v = Math.floor((x.day * n) / P) - Math.floor((x.day * (n - 1)) / P); return law('salario') ? Math.floor((v * (10000 + CFG.gov.laws.salario.bp)) / 10000) : v; }

export function chooseJob(p, now, world, i) {
  const x = jobOf(i);
  if (!x) fail('NO_JOB');
  begin(p, now, world, { allowBusy: true });
  if (p.emp) fail('IN_COMPANY');   // v111: quem trabalha numa empresa sai dela primeiro
  if (!jobOpen(p, i)) fail('NEED_COURSE', { course: x.course });
  p.job = i;
  return { ok: true, job: x.id };
}

// turno: 10 de energia, um sexto do ordenado do dia para o banco (é dinheiro declarado), +2 de respeito. Até 6 por dia de Lisboa.
export function doShift(p, now, world) {
  const x = jobOf(p.job);
  if (!x) fail('NO_JOB');
  begin(p, now, world);
  const J = CFG.jobs, n = shiftsToday(p, now) + 1;
  if (n > J.perDay) fail('SHIFTS_DONE');
  if (p.vigor < J.shiftE) fail('NO_VIGOR', { need: J.shiftE });
  const money = shiftPay(x, n);
  p.vigor -= J.shiftE; p.bank += money;
  p.sh = { d: dayOf(now), n }; p.c.shifts += 1;
  const lvl = addRespect(p, J.resp, now);
  return { ok: true, job: x.id, n, left: J.perDay - n, money, respect: J.resp, levelUp: lvl };
}

// ---------- trabalho à mão (16/11) ----------
// A tarefa começa no servidor (com a disposição sorteada aqui, a partir de uma semente) e entrega-se com a resposta.
// O servidor confere a ordem e o tempo: depressa demais não paga; respostas impossíveis são recusadas sem mexer em nada.
const workOf = (id) => CFG.work.list.find((x) => x.id === id);
function tiredAt(p, now) {
  const z = p.cz;
  if (!z || !(z.v > 0)) return 0;
  return (z.v / 1000) * 0.5 ** (Math.max(0, now - z.t) / CFG.work.halfLifeMs);
}
const tiredMultBp = (tired) => Math.floor(10000 * 0.5 ** (tired / CFG.work.half));
export function workView(p, now) {
  const tired = tiredAt(p, now);
  return { tired, multBp: tiredMultBp(tired), ritmo: { ...(p.wm || {}) }, tk: p.tk ? { id: p.tk.id, t0: p.tk.t0, sh: !!p.tk.sh, layout: workLayout(p.tk.id, p.tk.s) } : null };
}
// a disposição de cada tarefa: tudo o que o ecrã desenha e o servidor confere
export function workLayout(id, seed) {
  const r = seededRng(seed);
  if (id === 'camiao') {
    const kg = []; while (kg.length < 6) { const x = r.int(4, 40); if (!kg.includes(x)) kg.push(x); }
    return { boxes: kg.map((x) => ({ kg: x, look: r.int(0, 3) })) };
  }
  if (id === 'entregas') {
    const stops = [], names = [];
    while (stops.length < 4) { const x = r.int(0, 4), y = r.int(0, 4); if ((x || y) && !stops.some((s) => s.x === x && s.y === y)) stops.push({ x, y }); }
    while (names.length < 4) { const n = r.int(0, 11); if (!names.includes(n)) names.push(n); }
    return { stops: stops.map((s, i) => ({ ...s, name: names[i], door: r.int(1, 240) })) };
  }
  if (id === 'laboratorio') {
    return { pills: r.int(6, 9), gauge: { periodMs: r.int(900, 1400), c: r.int(5500, 8000), w: 900 }, bags: [0, 1, 2].map(() => r.int(0, 2)), target: 1000, rate: r.int(600, 900) };
  }
  if (id === 'entradas') {   // 5 convidados na lista; 7 a 8 entradas à porta, 2 ou 3 de gente que não está na lista
    const pick = (n, not) => { const out = []; while (out.length < n) { const x = r.int(0, 23); if (!out.includes(x) && !not.includes(x)) out.push(x); } return out; };
    const guests = pick(5, []), bad = pick(r.int(2, 3), guests), rows = [...guests, ...bad].map((n) => ({ n, m: r.int(0, 179) }));
    for (let i = rows.length - 1; i > 0; i--) { const j = r.int(0, i); [rows[i], rows[j]] = [rows[j], rows[i]]; }
    return { guests, rows: rows.sort((a, b) => a.m - b.m) };
  }
  if (id === 'contrato') {   // ficha com 4 campos; 8 linhas do contrato, 2 ou 3 com um valor trocado
    const ficha = [r.int(0, 23), r.int(24, 196) * 50, r.int(1, 28) * 100 + r.int(1, 12), r.int(1, 6) * 6];
    const rows = Array.from({ length: 8 }, (_, i) => ({ f: i % 4, v: ficha[i % 4], k: i >> 2 }));   // k: a 2.ª vez que o campo aparece diz-se de outra maneira
    const nb = r.int(2, 3), idx = []; while (idx.length < nb) { const x = r.int(0, 7); if (!idx.includes(x)) idx.push(x); }
    for (const i of idx) { const f = rows[i].f; let v = ficha[f]; while (v === ficha[f]) v = f === 0 ? r.int(0, 23) : f === 1 ? ficha[1] + r.int(-20, 20) * 50 : f === 2 ? r.int(1, 28) * 100 + r.int(1, 12) : r.int(1, 6) * 6; rows[i].v = Math.max(f === 1 ? 50 : 0, v); if (rows[i].v === ficha[f]) rows[i].v = ficha[f] + (f === 1 ? 500 : f === 3 ? 6 : 1); }
    for (let i = rows.length - 1; i > 0; i--) { const j = r.int(0, i); [rows[i], rows[j]] = [rows[j], rows[i]]; }
    return { ficha, rows };
  }
  if (id === 'doses') {   // três seringas: a dose receitada (em décimas de ml) e a velocidade a que enche (centésimas de ml por segundo)
    return { doses: [0, 1, 2].map(() => r.int(10, 45)), rate: r.int(180, 260) };
  }
  if (id === 'oficina') {   // trocar um pneu: 5 porcas, apertadas em estrela até ao binário pedido (nm), a rate N·m por segundo
    return { nm: r.int(10, 14) * 10, rate: r.int(45, 65), look: r.int(0, 2) };
  }
  if (id === 'mudancas') {   // carregar a carrinha: grelha W × H vista de cima (a fila 0 é junto à cabine), peças que a enchem toda
    const W = 3, H = 4, g = Array(W * H).fill(-1), pcs = [];
    const free = (x, y) => x < W && y < H && g[y * W + x] < 0;
    for (let c = 0; c < W * H; c++) {
      if (g[c] >= 0) continue;
      const x = c % W, y = Math.floor(c / W), opts = [[1, 1]];
      if (free(x + 1, y) && free(x, y + 1) && free(x + 1, y + 1)) opts.push([2, 2], [2, 2]);
      if (free(x + 1, y)) opts.push([2, 1], [2, 1]);
      if (free(x, y + 1)) opts.push([1, 2], [1, 2]);
      const [w, h] = opts[r.int(0, opts.length - 1)];
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) g[yy * W + xx] = pcs.length;
      pcs.push({ w, h, y });
    }
    // as pesadas saem das peças que tocam a cabine e a frágil das que tocam a porta: há sempre uma maneira de cumprir as duas
    const front = pcs.map((q, i) => i).filter((i) => pcs[i].y === 0), back = pcs.map((q, i) => i).filter((i) => pcs[i].y + pcs[i].h === H && pcs[i].y > 0);
    const heavy = new Set([front[r.int(0, front.length - 1)]]), fragile = back.length ? back[r.int(0, back.length - 1)] : -1;
    const NAMES = { 1: ['caixa', 'planta', 'candeeiro', 'cadeira'], 2: ['sofa', 'colchao', 'estante', 'comoda'], 4: ['cama', 'mesa', 'secretaria'] };
    const HEAVY = { 1: 'frigorifico', 2: 'maquina', 4: 'roupeiro' }, FRAGILE = { 1: 'espelho', 2: 'televisao', 4: 'aquario' };
    const out = pcs.map((q, i) => { const a = q.w * q.h; return { w: q.w, h: q.h, heavy: heavy.has(i), fragile: i === fragile, kind: heavy.has(i) ? HEAVY[a] : i === fragile ? FRAGILE[a] : NAMES[a][r.int(0, NAMES[a].length - 1)] }; });
    for (let i = out.length - 1; i > 0; i--) { const j = r.int(0, i); [out[i], out[j]] = [out[j], out[i]]; }
    return { W, H, pcs: out };   // sem as posições: a solução não vai para o telemóvel
  }
  if (id === 'desmanche') {   // peças de um carro roubado, cada uma com o tempo de a tirar (ms) e o que vale; a patrulha passa ao fim de win ms
    const PARTS = [3, 4, 5, 6, 2, 3, 4, 2];   // rádio, GPS, jante, catalisador, bateria, farol, airbag, banco
    const ks = []; while (ks.length < 6) { const k = r.int(0, 7); if (!ks.includes(k)) ks.push(k); }
    const win = r.int(90, 120) * 100, raw = ks.map(() => r.int(12, 32)), sum = raw.reduce((a, b) => a + b, 0);
    // juntas, as peças levam 1,7 vezes o tempo que há: é preciso escolher
    const parts = ks.map((k, i) => ({ k, need: Math.max(800, Math.round((raw[i] * win * 1.7) / sum / 100) * 100), v: Math.max(1, PARTS[k] + r.int(-1, 1)) }));
    return { win, parts };
  }
  return null;
}
// desmanche: o melhor que se podia levar com 85% do tempo (as mãos não passam de uma peça para a outra num instante)
function bestStrip(L) {
  let best = 0;
  for (let m = 1; m < 1 << L.parts.length; m++) {
    let t = 0, v = 0; L.parts.forEach((x, i) => { if (m & (1 << i)) { t += x.need; v += x.v; } });
    if (t <= L.win * 0.85 && v > best) best = v;
  }
  return Math.max(1, best);
}
export const stripSpotted = (L, ans) => !!(ans && (ans.spotted === true || (Array.isArray(ans.holds) && ans.holds.reduce((a, b) => a + (Number(b) || 0), 0) > L.win)));
const isInts = (a, n, lo, hi) => Array.isArray(a) && a.length === n && a.every((x) => Number.isSafeInteger(x) && x >= lo && x <= hi);
const routeLen = (L, o) => { let x = 0, y = 0, s = 0; for (const i of o) { const st = L.stops[i]; s += Math.abs(st.x - x) + Math.abs(st.y - y); x = st.x; y = st.y; } return s; };
const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((q) => [x, ...q])));
// qualidade de 0 a 10000; null se a resposta não pode ter vindo de quem jogou a tarefa
function workQuality(id, L, ans) {
  if (!ans || typeof ans !== 'object') return null;
  if (id === 'camiao') {
    const { slots, drops } = ans;
    if (!isInts(slots, 6, 0, 5) || new Set(slots).size !== 6 || !Number.isSafeInteger(drops) || drops < 0 || drops > 50) return null;
    const heavy = L.boxes.map((b, i) => [b.kg, i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).slice(0, 3).map((x) => x[1]);
    const ok = slots.filter((sl, i) => (sl < 3) === heavy.includes(i)).length;
    return Math.max(0, Math.round((10000 * ok) / 6) - 800 * Math.min(drops, 5));
  }
  if (id === 'entregas') {
    const o = ans.order;
    if (!isInts(o, L.stops.length, 0, L.stops.length - 1) || new Set(o).size !== o.length) return null;
    const best = Math.min(...perms(L.stops.map((_, i) => i)).map((x) => routeLen(L, x)));
    return Math.round((10000 * best) / routeLen(L, o));
  }
  if (id === 'laboratorio') {
    const { taps, holds } = ans, G = L.gauge;
    if (!isInts(taps, 3, 0, 120000) || !(taps[0] < taps[1] && taps[1] < taps[2]) || !isInts(holds, L.bags.length, 0, 20000)) return null;
    const hits = taps.filter((ms) => { const ph = (ms % G.periodMs) / G.periodMs, x = ph < 0.5 ? 2 * ph : 2 - 2 * ph; return Math.abs(x * 10000 - G.c) <= G.w; }).length;
    // cada saco: até 3% de diferença do peso certo vale tudo; daí para fora desce, e a 43% já não vale nada
    const bag = holds.map((ms) => { const err = Math.abs((L.rate * ms) / 1000 - L.target) / L.target; return err <= 0.03 ? 10000 : Math.max(0, Math.floor(10000 - (err - 0.03) * 25000)); });
    return Math.round((5000 * hits) / 3 + bag.reduce((a, b) => a + b, 0) / (2 * bag.length));
  }
  if (id === 'entradas' || id === 'contrato') {   // marcar as linhas erradas: certas menos as marcadas a mais, a dividir pelas erradas
    const pk = ans.picks;
    if (!Array.isArray(pk) || pk.length > L.rows.length || !pk.every((x) => Number.isSafeInteger(x) && x >= 0 && x < L.rows.length) || new Set(pk).size !== pk.length) return null;
    const isBad = (i) => (id === 'entradas' ? !L.guests.includes(L.rows[i].n) : L.rows[i].v !== L.ficha[L.rows[i].f]);
    const nBad = L.rows.filter((_, i) => isBad(i)).length, hit = pk.filter(isBad).length, wrong = pk.length - hit;
    return Math.max(0, Math.round((10000 * (hit - wrong)) / nBad));
  }
  if (id === 'oficina') {   // 40% pela ordem em estrela (cada passo salta uma porca), 60% pelo aperto (cada porca a 8% do binário)
    const { picks, holds } = ans;
    if (!isInts(picks, 5, 0, 4) || new Set(picks).size !== 5 || !isInts(holds, 5, 0, 20000)) return null;
    let star = 0; for (let i = 1; i < 5; i++) { const d = (picks[i] - picks[i - 1] + 5) % 5; if (d === 2 || d === 3) star++; }
    const tq = holds.map((ms) => (Math.abs((L.rate * ms) / 1000 - L.nm) / L.nm <= 0.08 ? 10000 : 0));   // dentro de 8% ou não
    return Math.round((4000 * star) / 4 + (6000 * tq.reduce((a, b) => a + b, 0)) / 50000);
  }
  if (id === 'mudancas') {   // 70% pelo espaço ocupado, 30% pelas regras (pesadas junto à cabine, a frágil junto à porta)
    const pl = ans.place;
    if (!Array.isArray(pl) || pl.length !== L.pcs.length || !pl.every((v) => isInts(v, 3, -1, Math.max(L.W, L.H)) && (v[2] === 0 || v[2] === 1))) return null;
    const g = Array(L.W * L.H).fill(-1); let area = 0, rules = 0, nRules = 0;
    for (let i = 0; i < pl.length; i++) {
      const [x, y, rot] = pl[i], q = L.pcs[i], w = rot ? q.h : q.w, h = rot ? q.w : q.h;
      if (q.heavy || q.fragile) nRules++;
      if (x < 0 || y < 0) continue;
      if (x + w > L.W || y + h > L.H) return null;
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) { if (g[yy * L.W + xx] >= 0) return null; g[yy * L.W + xx] = i; }
      area += w * h;
      if ((q.heavy && y === 0) || (q.fragile && y + h === L.H)) rules++;
    }
    return Math.round((7000 * area) / (L.W * L.H) + (nRules ? (3000 * rules) / nRules : 3000));
  }
  if (id === 'desmanche') {   // o que vale o que se levou, a dividir pelo melhor que se podia levar
    const { holds } = ans;
    if (!isInts(holds, L.parts.length, 0, 30000) || (ans.spotted !== undefined && typeof ans.spotted !== 'boolean')) return null;
    const got = L.parts.reduce((a, x, i) => a + (holds[i] >= x.need ? x.v : 0), 0);
    return Math.min(10000, Math.round((10000 * got) / bestStrip(L)));
  }
  if (id === 'doses') {
    const { holds } = ans;
    if (!isInts(holds, L.doses.length, 0, 20000)) return null;
    const sc = holds.map((ms, k) => { const ml = (L.rate * ms) / 100000, tg = L.doses[k] / 10, err = Math.abs(ml - tg) / tg; return err <= 0.05 ? 10000 : Math.max(0, Math.floor(10000 - (err - 0.05) * 25000)); });
    return Math.round(sc.reduce((a, b) => a + b, 0) / sc.length);
  }
  return null;
}
export function workStart(p, now, world, rng, id, shift) {
  const x = workOf(id);
  if (!x) fail('NO_WORK');
  if (shift === 'emp') {   // v111: o turno na empresa: a tarefa é a do tipo, conta nos 6 do dia
    const e = empType(p);
    if (!e) fail('NO_COMPANY');
    if (e.task !== id) fail('NO_WORK');
    if (!empCan(p, p.emp.t)) fail('NEED_COURSE', { course: e.course });
    begin(p, now, world);
    if (shiftsToday(p, now) >= CFG.jobs.perDay) fail('SHIFTS_DONE');
    if (p.vigor < CFG.jobs.shiftE) fail('NO_VIGOR', { need: CFG.jobs.shiftE });
  } else if (shift) {   // o turno do emprego: a tarefa é a do emprego, até 6 por dia, com 10 de energia
    const j = jobOf(p.job);
    if (!j) fail('NO_JOB');
    if (j.task !== id) fail('NO_WORK');
    begin(p, now, world);
    if (shiftsToday(p, now) >= CFG.jobs.perDay) fail('SHIFTS_DONE');
    if (p.vigor < CFG.jobs.shiftE) fail('NO_VIGOR', { need: CFG.jobs.shiftE });
  } else {
    if (x.shift) fail('NO_WORK');
    begin(p, now, world);
    if (level(p) < x.level) fail('LOW_LEVEL', { need: x.level });
  }
  p.tk = { id, t0: now, s: rng.int(1, 2147483646), ...(shift ? { sh: 1 } : {}), ...(shift === 'emp' ? { emp: 1 } : {}) };
  return { ok: true, task: { id, t0: now, minMs: x.minMs, shift: !!shift, emp: shift === 'emp', layout: workLayout(id, p.tk.s) } };
}
// emp (v111): o que o servidor paga por um turno na empresa ({ pay }, já limitado ao caixa)
export function workDone(p, now, world, rng, ans, emp) {
  if (!p.tk) fail('NO_TASK');
  const x = workOf(p.tk.id);
  if (!x) fail('NO_TASK');
  // confere-se antes de mexer no jogador: uma entrega recusada não muda nada
  if (now - p.tk.t0 < x.minMs) fail('TOO_FAST', { wait: x.minMs - (now - p.tk.t0) });
  const L = workLayout(p.tk.id, p.tk.s), q = workQuality(p.tk.id, L, ans);
  if (q === null) fail('BAD_ANSWER');
  begin(p, now, world);
  if (p.tk.emp) {   // v111: turno na empresa: confere outra vez; o ordenado vem do caixa (o servidor diz quanto)
    const e = empType(p), J = CFG.jobs, n = shiftsToday(p, now) + 1;
    if (!e || e.task !== p.tk.id || !emp) fail('NO_COMPANY');
    if (n > J.perDay) fail('SHIFTS_DONE');
    if (p.vigor < J.shiftE) fail('NO_VIGOR', { need: J.shiftE });
    const money = Math.max(0, Math.floor(emp.pay) || 0);
    p.tk = null; p.vigor -= J.shiftE; p.bank += money;
    p.sh = { d: dayOf(now), n }; p.c.shifts += 1;
    const lvl = addRespect(p, J.resp, now);
    return { ok: true, id: x.id, q, shift: true, emp: true, n, left: J.perDay - n, money, respect: J.resp, levelUp: lvl, busted: false };
  }
  if (p.tk.sh) {   // turno do emprego: confere outra vez (o dia pode ter mudado, a energia pode ter ido para o ginásio)
    const j = jobOf(p.job), J = CFG.jobs, n = shiftsToday(p, now) + 1;
    if (!j || j.task !== p.tk.id) fail('NO_JOB');
    if (n > J.perDay) fail('SHIFTS_DONE');
    if (p.vigor < J.shiftE) fail('NO_VIGOR', { need: J.shiftE });
    const money = Math.floor((shiftPay(j, n) * (J.qMin + Math.floor(((J.qMax - J.qMin) * q) / 10000))) / 10000);
    p.tk = null; p.vigor -= J.shiftE; p.bank += money;
    p.sh = { d: dayOf(now), n }; p.c.shifts += 1;
    const lvl = addRespect(p, J.resp, now);
    return { ok: true, id: x.id, q, shift: true, job: j.id, n, left: J.perDay - n, money, respect: J.resp, levelUp: lvl, busted: false };
  }
  const W = CFG.work, tired = tiredAt(p, now), multBp = tiredMultBp(tired);
  p.cz = { v: Math.round((tired + 1) * 1000), t: now };
  p.tk = null;
  p.c.work = (p.c.work || 0) + 1;
  // desmanche: quem ainda estava agarrado a uma peça quando a patrulha passou foi visto (metade das vezes acaba preso)
  const spotted = x.id === 'desmanche' && stripSpotted(L, ans), bustBp = spotted ? CFG.work.spottedBp : x.bustBp;
  const busted = !!bustBp && rng.chance(Math.floor((bustBp * (spotted ? 10000 : pressMultBp(world && world.press))) / 10000));
  // o ritmo deste biscate: sobe com o trabalho bem feito, desce com o mal feito (ou com ser visto pela patrulha)
  const Rt = W.ritmo, r0 = (p.wm && p.wm[x.id]) || 0;
  const r1 = spotted || q < Rt.bad ? Math.max(0, r0 - Rt.drop) : q >= Rt.good ? Math.min(Rt.cap, r0 + Rt.step) : r0;
  if (!p.wm || typeof p.wm !== 'object') p.wm = {};
  p.wm[x.id] = r1;
  if (busted) { jailFor(p, now, x.jailMin * T.MIN, 1, { k: 'gig', id: x.id }); return { ok: true, id: x.id, q, busted: true, spotted, money: 0, multBp, ritmo: r1, ritmoAntes: r0, jailUntil: p.jailUntil }; }
  const pago = Math.floor((x.base * (W.qMin + Math.floor(((W.qMax - W.qMin) * q) / 10000))) / 10000);
  let money = Math.max(1, Math.floor((Math.floor((Math.floor((pago * (10000 + r1)) / 10000) * multBp) / 10000) * (10000 + empBp(p, 'work'))) / 10000));   // v111: logística
  let lav = 0;
  if (x.bustBp) { const Lv = launder(p, money); money = Lv.net; lav = Lv.lav; }
  p.cash += money;
  const mat = matGain(p, x.id, q);   // v83: o material do ofício
  return { ok: true, id: x.id, q, busted: false, spotted, money, lav, multBp, tired: tired + 1, ritmo: r1, ritmoAntes: r0, mat };
}

export function startCourse(p, now, world, id) {
  const c = courseOf(id);
  if (!c) fail('NO_COURSE');
  begin(p, now, world, { allowBusy: true });
  if (p.done.includes(id)) fail('COURSE_DONE');
  if (p.course) fail('COURSE_BUSY', { until: p.course.end });
  if (c.needs && !p.done.includes(c.needs)) fail('NEED_COURSE', { course: c.needs });
  if (c.level && level(p) < c.level) fail('LOW_LEVEL', { need: c.level });
  pay(p, c.price);
  p.course = { id, end: now + c.days * T.DAY, t0: now, ex: 1, cuts: 0, next: 0, q: null };
  return { ok: true, id, price: c.price, end: p.course.end };
}

// ---------- exame dos cursos (v80) ----------
const courseMs = (id) => courseOf(id).days * T.DAY;
export function examRetry(id) { const X = CFG.exam; return Math.min(X.retryMax, Math.max(X.retryMin, Math.floor((courseMs(id) * X.retryBp) / 10000))); }
// quando abre o próximo exame a meio do curso (1/4 do tempo para o 1.º corte, metade para o 2.º); no fim do tempo, sempre
export function examOpensAt(c) { return c.cuts >= CFG.exam.cuts ? c.end : Math.min(c.end, c.t0 + Math.floor((courseMs(c.id) * (c.cuts + 1)) / 4)); }
export function examStart(p, now, world, rng) {
  const c = p.course;
  if (!c || !c.ex) fail('NO_EXAM');
  begin(p, now, world, { allowBusy: true });
  if (!p.course) fail('NO_EXAM');
  if (c.q) return { ok: true, ids: c.q.ids, p: c.q.p, until: c.q.t + CFG.exam.ttl, early: c.end > now };   // o mesmo exame: não se trocam perguntas
  if (c.next > now) fail('EXAM_WAIT', { until: c.next });
  const at = examOpensAt(c);
  if (at > now) fail('EXAM_NOT_YET', { until: at });
  // as perguntas: as primeiras n de uma baralhada do banco (Fisher-Yates parcial, todas com a mesma hipótese);
  // as opções de cada uma também se baralham, para a letra da certa não se decorar (p[k][d] = opção do banco mostrada em d)
  const shuffle = (arr, k) => { for (let i = 0; i < k; i++) { const j = rng.int(i, arr.length - 1); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  const ids = shuffle([...Array(CFG.exam.ans[examBank(c.id)].length).keys()], CFG.exam.n).slice(0, CFG.exam.n);
  const pm = ids.map(() => shuffle([0, 1, 2, 3], 3));
  c.q = { ids, p: pm, t: now }; c.why = null; c.last = null;
  return { ok: true, ids, p: pm, until: now + CFG.exam.ttl, early: c.end > now };
}
export function examAnswer(p, now, world, ans) {
  if (!p.course || !p.course.q) fail('NO_EXAM');
  begin(p, now, world, { allowBusy: true });
  const c = p.course;
  if (!c || !c.q) fail('NO_EXAM');   // passou do tempo: o toque acabou de o dar como chumbado
  if (!Array.isArray(ans) || ans.length !== c.q.ids.length || !ans.every((x) => Number.isInteger(x) && x >= 0 && x <= 3)) fail('EXAM_BAD');
  const key = CFG.exam.ans[examBank(c.id)], wrong = [], q = c.q;
  q.ids.forEach((qi, k) => { if (q.p[k][ans[k]] !== key[qi]) wrong.push(k); });
  c.q = null;
  if (wrong.length) { c.next = now + examRetry(c.id); c.why = 'wrong'; c.last = { ids: q.ids, p: q.p, sel: ans.slice(), wrong }; return { ok: true, pass: false, wrong, next: c.next }; }
  c.why = null; c.last = null;
  let cut = 0;
  if (c.end > now && c.cuts < CFG.exam.cuts) { cut = Math.floor((courseMs(c.id) * CFG.exam.cutBp) / 10000); c.end -= cut; c.cuts += 1; }
  if (c.end <= now) { if (!p.done.includes(c.id)) p.done.push(c.id); p.course = null; return { ok: true, pass: true, done: true, id: c.id, cut }; }
  return { ok: true, pass: true, done: false, id: c.id, cut, end: c.end, opens: examOpensAt(c) };
}

export function deal(p, now, world, j) {
  const x = dealOf(j);
  if (!x) fail('NO_DRUG');
  begin(p, now, world);
  if (level(p) < x.level) fail('LOW_LEVEL', { need: x.level });
  const D = CFG.deal, d = dealDrug(x), g = Math.floor((x.perBar * D.step) / 100);
  if (p.energy < D.step) fail('NO_ENERGY', { need: D.step });
  if (p.dst[j] < g) fail('NO_STOCK', { need: g });
  if (dealUsed(p, now) >= dealCap(p)) fail('NO_CLIENTS');
  const gross = Math.floor((g * CFG.drugs[d].price * (10000 + skillBp(p, 'trafico'))) / 10000), day = dayOf(now);   // a skill de tráfico sobe o que se ganha
  const { net: money, lav } = launder(p, gross);
  p.energy -= D.step; p.dst[j] -= g; p.cash += money; p.sk.trafico += D.step;
  p.dl = { d: day, n: dealUsed(p, now) + 1 };
  const resp = Math.max(1, Math.round(((D.respBase + D.respPerLevel * level(p)) * D.step) / 100));
  const lvl = addRespect(p, resp, now);
  return { ok: true, grams: g, money, lav, d, respect: resp, levelUp: lvl, left: dealCap(p) - p.dl.n };
}

function pruneDetox(p, now) {
  const lim = now - CFG.detox.windowMs;
  while (p.detoxT.length && p.detoxT[0] <= lim) p.detoxT.shift();
}
// preço = (valor de 100 de energia para ti) × vício / 200, +25% por cada uso nas últimas 24 h
export function detoxCost(p, now) {
  const D = CFG.detox;
  const v100 = Math.floor(valuePerEnergy(p) * 100);
  let price = Math.max(D.min, Math.floor((v100 * p.addiction) / D.valueDiv));
  const n = Math.min(recent(p.detoxT, now, D.windowMs), D.maxSteps);
  for (let i = 0; i < n; i++) price = Math.ceil((price * D.stepNum) / D.stepDen);
  return price;
}
export function detox(p, now, world) {
  begin(p, now, world);
  if (p.addiction === 0) fail('NO_VICE');
  const price = detoxCost(p, now);
  pay(p, price);
  p.addiction = 0; p.addictionT = now;
  pruneDetox(p, now);
  if (p.detoxT.length >= CFG.detox.maxSteps) p.detoxT.shift();
  p.detoxT.push(now);
  return { ok: true, price };
}

// ---------- ginásio (v82): séries no ritmo ----------
// O cliente mostra a barra a subir e a descer e manda os toques (ms desde o início da série). Cada topo tem a sua janela
// (meio tempo para cada lado): um toque lá dentro dá a nota pelo erro (perfeito, bom, fraco); nenhum, ou dois na mesma
// janela, é falhado só dessa repetição. Um ritmo certo demais (desvio-padrão dos erros abaixo de 8 ms, com 3 ou mais
// toques) não é de pessoa: os «perfeitos» contam como «bons».
export function gymMarks(n, taps) {
  const S = CFG.train.set, half = S.beat / 2, miss = S.win.length, marks = [], errs = [];
  for (let k = 0; k < n; k++) {
    const T0 = S.lead + k * S.beat, inW = taps.filter((x) => x >= T0 - half && x < T0 + half);
    if (inW.length !== 1) { marks.push(miss); continue; }
    const e = inW[0] - T0, err = Math.round(Math.abs(e));
    let m = S.win.findIndex((w) => err <= w); if (m < 0) m = miss;
    marks.push(m); errs.push(e);
  }
  if (errs.length >= 3) {
    const avg = errs.reduce((a, b) => a + b, 0) / errs.length, sd = Math.sqrt(errs.reduce((a, b) => a + (b - avg) ** 2, 0) / errs.length);
    if (sd < S.botSd) return marks.map((m) => (m === 0 ? 1 : m));
  }
  return marks;
}
// quantas repetições já passaram pelo relógio do servidor (com folga para a rede: não se cobra um topo que o jogador
// ainda não viu). Desistir ou sair da app entrega a série até aí; antes do primeiro topo não custa nada.
export function gymReps(g, el) {
  const S = CFG.train.set;
  if (el >= S.lead + (g.reps - 1) * S.beat) return g.reps;
  return Math.max(0, Math.min(g.reps, Math.floor((el - S.slack - S.lead) / S.beat) + 1));
}
// ---------- ginásios pelo mundo (v94) ----------
export const gymOf = (id) => (typeof id === 'string' ? CFG.gyms.list.find((g) => g.id === id) : undefined);
export const GYM_NORMAL = CFG.gyms.list.filter((g) => g.tier === 'leve' || g.tier === 'medio' || g.tier === 'pesado');
export const gymGain = (G, stat) => (G && STATS.includes(stat) ? G.g[STATS.indexOf(stat)] : 0);
// o ginásio onde se treina agora: preso, é o da prisão; fora, o que escolheu
export const gymNow = (p, now) => (p.jailUntil > now ? gymOf('prisao') : gymOf(p.gym) || gymOf('garagem'));
// especialistas: uma stat 25% acima de cada uma das outras, ou duas juntas 25% acima das outras duas
export function gymReqOk(p, G) {
  const v = (k) => p.stats[k] || 0, R = CFG.gyms.ratio;
  if (G.solo) return STATS.filter((k) => k !== G.solo).every((k) => v(G.solo) * 10000 >= v(k) * R);
  if (G.duo) { const a = G.duo.reduce((s, k) => s + v(k), 0), b = STATS.filter((k) => !G.duo.includes(k)).reduce((s, k) => s + v(k), 0); return a * 10000 >= b * R; }
  return true;
}
// pode comprar a entrada: os normais pela ordem e com a energia gasta; os especialistas depois do que pedem
export function gymCanBuy(p, G) {
  if (!G || G.tier === 'prisao' || p.gyms.includes(G.id)) return false;
  if (G.tier === 'esp') return p.gyms.includes(G.after);
  const i = GYM_NORMAL.indexOf(G);
  return i > 0 && p.gyms.includes(GYM_NORMAL[i - 1].id) && p.gx >= G.xp;
}
export function gymBuy(p, now, world, id) {
  const G = gymOf(id);
  if (!G || G.tier === 'prisao') fail('NO_GYM');
  if (p.gyms.includes(id)) fail('HAVE_IT');
  begin(p, now, world);
  if (!gymCanBuy(p, G)) fail('GYM_LOCKED', { need: G.xp || 0, after: G.after || null });
  pay(p, G.price);
  p.gyms.push(id);
  if (G.tier !== 'esp' || gymReqOk(p, G)) p.gym = id;
  return { ok: true, id, price: G.price, gym: p.gym };
}
export function gymUse(p, now, world, id) {
  const G = gymOf(id);
  if (!G || G.tier === 'prisao' || !p.gyms.includes(id)) fail('NO_GYM');
  begin(p, now, world, { allowBusy: true });
  p.gym = id;
  return { ok: true, gym: id };
}
export function gymStart(p, now, world, stat, reps) {
  if (!STATS.includes(stat)) fail('NO_STAT');
  if (!CFG.train.set.reps.includes(reps)) fail('BAD_REPS');
  const G = gymNow(p, now);
  begin(p, now, world, { jailOk: G.id === 'prisao' });
  if (!(gymGain(G, stat) > 0)) fail('GYM_NO_STAT');
  if (!gymReqOk(p, G)) fail('GYM_REQ');
  if (p.vigor < reps * G.e) fail('NO_VIGOR', { need: reps * G.e });
  const S = CFG.train.set;
  p.gs = { stat, reps, t0: now, gym: G.id };
  return { ok: true, stat, reps, gym: G.id, beat: S.beat, lead: S.lead, t0: now, until: now + S.ttl };
}
export function gymDone(p, now, world, taps) {
  if (!p.gs) fail('NO_SERIES');
  const S = CFG.train.set, g = p.gs, el = now - g.t0;
  // os toques vêm do cliente: números, poucos, e nenhum marcado depois do tempo que já passou aqui
  if (!Array.isArray(taps) || taps.length > 64 || !taps.every((x) => Number.isFinite(x) && x >= 0 && x <= el + S.slack)) fail('BAD_TAPS');
  const G = gymOf(g.gym) || gymOf('garagem');
  begin(p, now, world, { jailOk: G.id === 'prisao' });
  if (!p.gs) fail('NO_SERIES');   // caducou
  const n = gymReps(g, el);
  if (p.vigor < n * G.e) fail('NO_VIGOR', { need: n * G.e });
  // v94: cada repetição vale o mesmo de sempre vezes o ganho do ginásio (20 = 1) vezes a energia que custa (5 = 1)
  const k = ((gymGain(G, g.stat) * G.e) / (CFG.gyms.base * 5)) * ((10000 + bookGymBp(p, g.stat)) / 10000);   // v95: e o livro do ginásio
  const marks = gymMarks(n, taps), milli = marks.reduce((a, m) => a + (S.q[m] / 10) * k, 0) + (p.sx[g.stat] || 0);
  const gain = Math.floor(milli / 1000);
  if (gain) settleAllBiz(p, now);   // o rendimento até aqui conta com a stat antiga
  p.vigor -= n * G.e;
  p.gx += n * G.e;
  p.stats[g.stat] += gain; p.sx[g.stat] = Math.round(milli - gain * 1000);
  p.c.trains += n; p.gs = null;
  return { ok: true, stat: g.stat, reps: n, of: g.reps, marks, gain, value: p.stats[g.stat], part: p.sx[g.stat], gym: G.id };
}

// ---------- livros (v95) ----------
// Como os do Torn: um de cada vez; ler leva horas; ao acabar, 31 dias de efeito (o novo substitui o anterior), ou +5% de vez
// numa stat, ou repetir o último. Compram-se no alfarrabista (4 por dia, iguais para todos) ou acham-se nos golpes.
export const bookOf = (id) => (typeof id === 'string' ? CFG.books.list.find((b) => b.id === id) : undefined);
export function bookGymBp(p, stat) {
  const o = p.bk && p.bk.on, b = o ? bookOf(o.id) : null;
  return b && b.k === 'gym' && (b.s === stat || b.s === '*') ? b.bp : 0;
}
export const bookOwned = (p) => Object.values(p.bk.own).reduce((a, n) => a + n, 0);
// os 4 títulos do dia: os mesmos para todos, escolhidos com uma semente feita do dia (os raros pesam menos)
export function bookShelf(now) {
  let h = 2166136261 >>> 0;
  for (const ch of 'livros:' + dayOf(now)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const r = seededRng(h), left = CFG.books.list.slice(), out = [];
  while (out.length < CFG.books.shelf && left.length) {
    let x = r.int(0, left.reduce((a, b) => a + b.w, 0) - 1), i = 0;
    while (x >= left[i].w) { x -= left[i].w; i++; }
    out.push(left.splice(i, 1)[0].id);
  }
  return out;
}
// os negócios rendem com a profissão e as stats: antes de um livro mudar uma coisa ou outra, o que renderam até ali fica contado
function bookSettle(p, at, b) {
  if (b && (b.k === 'bizBp' || b.k === 'perm')) for (let i = 0; i < p.biz.length; i++) if (p.biz[i].t < at) settleBiz(p, i, at);
}
function bookFinish(p, at) {
  const b = bookOf(p.bk.rd.id), eff = b && b.k === 'again' ? bookOf(p.bk.last) : b;
  p.bk.rd = null;
  if (!b) return;
  p.bk.n += 1; p.bk.done[b.id] = (p.bk.done[b.id] || 0) + 1;
  if (!eff) return;
  if (b.k !== 'again') p.bk.last = b.id;
  if (eff.k === 'perm') {
    bookSettle(p, at, eff);
    const add = Math.max(1, Math.floor((p.stats[eff.s] * eff.bp) / 10000));
    p.stats[eff.s] += add; p.bk.got = { s: eff.s, add, at };
    return;
  }
  const old = p.bk.on ? bookOf(p.bk.on.id) : null;
  bookSettle(p, at, old); bookSettle(p, at, eff);
  p.bk.on = { id: eff.id, until: at + CFG.books.days * T.DAY };
}
function bookTick(p, now) {
  if (p.bk.rd && p.bk.rd.end <= now) bookFinish(p, p.bk.rd.end);
  if (p.bk.on && p.bk.on.until <= now) { const at = p.bk.on.until; bookSettle(p, at, bookOf(p.bk.on.id)); p.bk.on = null; }
}
// achado num golpe: um título dos que não são raros, escolhido pelo número de golpes (sem tirar à sorte); sem espaço, fica lá
function bookFind(p, now) {
  if (bookOwned(p) >= CFG.books.cap) return null;
  const L = CFG.books.list.filter((b) => b.w >= 3), b = L[(p.c.wins / CFG.books.findEvery + Number(dayOf(now).slice(-2))) % L.length];
  p.bk.own[b.id] = (p.bk.own[b.id] || 0) + 1;
  return b.id;
}
export function bookBuy(p, now, world, id) {
  const b = bookOf(id);
  if (!b) fail('NO_BOOK');
  begin(p, now, world, { allowBusy: true });
  if (!bookShelf(now).includes(id)) fail('NOT_ON_SHELF');
  const d = dayOf(now), bd = p.bk.bd && p.bk.bd.d === d ? p.bk.bd : { d, ids: [] };
  if (bd.ids.includes(id)) fail('BOUGHT_TODAY');
  if (bookOwned(p) >= CFG.books.cap) fail('BOOKS_FULL');
  pay(p, b.price);
  p.bk.bd = bd; bd.ids.push(id);
  p.bk.own[id] = (p.bk.own[id] || 0) + 1;
  return { ok: true, id, price: b.price };
}
export function bookRead(p, now, world, id) {
  const b = bookOf(id);
  if (!b) fail('NO_BOOK');
  begin(p, now, world, { allowBusy: true, jailOk: true, trOk: 2 });   // lê-se também preso, no hospital ou no avião
  if (!(p.bk.own[id] > 0)) fail('NO_BOOK');
  if (p.bk.rd) fail('BOOK_BUSY', { until: p.bk.rd.end });
  if (b.k === 'again' && !p.bk.last) fail('NO_LAST');
  p.bk.own[id] -= 1; if (!p.bk.own[id]) delete p.bk.own[id];
  p.bk.rd = { id, t0: now, end: now + b.h * T.HOUR };
  return { ok: true, id, end: p.bk.rd.end };
}

// ---------- materiais e cave (v83) ----------
// Cada biscate deixa o material do seu ofício. Na cave juntam-se materiais (e uns euros) para fazer componentes, na hora;
// com os componentes fazem-se as ferramentas dos golpes grandes, armas e máquinas para os negócios, que ficam na bancada
// o tempo da receita (uma coisa de cada vez) e depois se recolhem.
export const recipeOf = (id) => (typeof id === 'string' ? CFG.craft.list.find((r) => r.id === id) : undefined);
const MAT_IDS = [...CFG.mat.base, ...CFG.craft.list.filter((r) => r.kind === 'comp').map((r) => r.id), ...CFG.mat.rare];   // v86: e os raros das escavações
export const matIds = () => MAT_IDS.slice();
const bizIdx = (id) => CFG.biz.findIndex((b) => b.id === id);
export function matGain(p, workId, q) {
  const id = CFG.mat.drop[workId];
  if (!id) return null;
  const want = q >= CFG.mat.good ? 2 : 1, have = p.mt[id] || 0, n = Math.max(0, Math.min(want, CFG.mat.cap - have));
  if (n) p.mt[id] = have + n;
  return { id, n, lost: want - n };
}
export const recipePrice = (p, r) => cut(r.price, klass(p).recipeCutBp || 0);
export const recipeMs = (p, r) => cut(r.ms || 0, klass(p).craftCutBp || 0);
export function craftStart(p, now, world, id, n = 1) {
  const r = recipeOf(id), comp = r && r.kind === 'comp';
  if (!r) fail('NO_RECIPE');
  if (!Number.isSafeInteger(n) || n < 1 || n > (comp ? CFG.craft.batch : 1)) fail('BAD_AMOUNT');
  begin(p, now, world);
  if (!comp && p.cf) fail('BENCH_BUSY', { until: p.cf.end });   // os componentes não ocupam a bancada
  if (comp && (p.mt[id] || 0) + n > CFG.mat.cap) fail('MAT_FULL', { cap: CFG.mat.cap });
  if (r.kind === 'tool' && p.inv.some((x) => x.id === id)) fail('HAVE_IT');
  { const g = gearOf(id); if (g && g.level && level(p) < g.level) fail('LOW_LEVEL', { need: g.level }); }   // v86: o que pede nível na loja também o pede aqui
  if (r.kind === 'maq') { if (!p.biz[bizIdx(r.biz)].n) fail('NO_BIZ'); if (p.maq[r.biz]) fail('HAVE_IT'); }
  const miss = Object.entries(r.needs).filter(([k, v]) => (p.mt[k] || 0) < v * n);
  if (miss.length) fail('NO_MAT', { need: Object.fromEntries(miss.map(([k, v]) => [k, v * n])) });
  const price = recipePrice(p, r);   // v90: o armeiro paga menos e acaba mais depressa
  pay(p, price * n);
  for (const [k, v] of Object.entries(r.needs)) { p.mt[k] -= v * n; if (!p.mt[k]) delete p.mt[k]; }
  if (comp) { p.mt[id] = (p.mt[id] || 0) + n; return { ok: true, id, n, price: price * n, kind: r.kind }; }
  p.cf = { id, t0: now, end: now + recipeMs(p, r) };
  return { ok: true, id, n, price, kind: r.kind, end: p.cf.end };
}
// recolher da bancada: ferramentas e armas para o inventário, a máquina para o negócio. Se não couber (inventário cheio,
// ferramenta que entretanto se comprou), fica na bancada: nada se perde.
export function craftTake(p, now, world) {
  const c = p.cf;
  if (!c) fail('NO_CRAFT');
  begin(p, now, world);
  if (c.end > now) fail('CRAFT_WAIT', { until: c.end });
  const r = recipeOf(c.id);
  if (r.kind === 'maq') {
    if (!p.biz[bizIdx(r.biz)].n) fail('NO_BIZ');
    if (p.maq[r.biz]) fail('HAVE_IT');   // uma por negócio
    settleAllBiz(p, now);   // o rendimento até aqui conta sem a máquina
    p.maq[r.biz] = now + CFG.craft.rev.ms;   // trabalha uma semana; depois pede revisão
  } else {
    if (r.kind === 'tool' && p.inv.some((x) => x.id === c.id)) fail('HAVE_IT');
    if (!roomFor(p)) fail('NO_ROOM');
    p.inv.push(itemNew(c.id));
  }
  p.cf = null;
  return { ok: true, id: c.id, kind: r.kind };
}
// revisão de uma máquina: mais 7 dias a trabalhar (contados de quando acabava, ou de agora se já tinha parado). Faz-se quando
// faltar uma semana ou menos; uma máquina parada volta logo a render.
export function maqService(p, now, world, id) {
  const i = typeof id === 'string' ? bizIdx(id) : -1, R = CFG.craft.rev;
  if (i < 0) fail('NO_BIZ');
  begin(p, now, world);
  if (!p.maq[id]) fail('NO_MACHINE');
  if (!p.biz[i].n) fail('NO_BIZ');
  const u0 = p.maq[id];
  if (u0 - now > R.maxMs - R.ms) fail('SERVICE_EARLY', { at: u0 - (R.maxMs - R.ms) });
  const miss = Object.entries(R.needs).filter(([k, v]) => (p.mt[k] || 0) < v);
  if (miss.length) fail('NO_MAT', { need: Object.fromEntries(miss) });
  pay(p, R.price);
  for (const [k, v] of Object.entries(R.needs)) { p.mt[k] -= v; if (!p.mt[k]) delete p.mt[k]; }
  settleAllBiz(p, now);   // o que rendeu até aqui conta como estava
  p.maq[id] = Math.max(u0, now) + R.ms;
  return { ok: true, id, until: p.maq[id], price: R.price, stopped: u0 <= now };
}

// ---------- escavações (v85) ----------
// Escavações clandestinas à noite em sítios a sério. A grelha fica só aqui (o servidor nunca a mostra): cells[i] = o achado escondido
// nessa casa (ou nada). Cada pazada abre uma casa: um achado vai para o saco desta escavação; uma casa vazia diz quantos achados há
// nas 8 à volta. As primeiras pazadas são seguras; depois cada uma pode chamar a ronda (preso, e o saco perde-se). Sair guarda o saco.
export const siteOf = (id) => (typeof id === 'string' ? CFG.dig.sites.find((x) => x.id === id) : undefined);
export const digSet = (site) => Object.keys(CFG.col.sets).find((k) => CFG.col.sets[k].dig === site);
export function stLevel(p, id) { for (let n = 3; n >= 1; n--) if (p.done && p.done.includes(id + n)) return n; return 0; }
export const digSafe = (p) => CFG.dig.safe + Math.floor(studyBp(p, 'dig') / 100);   // a Arqueologia dá pazadas seguras
// hipótese de a ronda aparecer na pazada número k (1, 2, ...), com safe pazadas seguras
export const digRiskBp = (k, safe = CFG.dig.safe) => Math.max(0, Math.min(10000, (k - safe) * CFG.dig.riskBp));
function digNear(cells, i) {
  const N = CFG.dig.size, x = i % N, y = Math.floor(i / N);
  let n = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const xx = x + dx, yy = y + dy;
    if (xx >= 0 && yy >= 0 && xx < N && yy < N && cells[yy * N + xx]) n++;
  }
  return n;
}
// fecha a escavação: o saco vai para a vitrine e o sítio fica vigiado
function digClose(p, at) {
  const d = p.dg;
  // os achados vão para a vitrine; o material raro, para o depósito da cave (o que passa do teto perde-se, como nos biscates)
  d.matLost = 0;
  for (const id of d.got) {
    if (!CFG.mat.rare.includes(id)) { p.col[id] = (p.col[id] || 0) + 1; continue; }
    if ((p.mt[id] || 0) >= CFG.mat.cap) d.matLost += 1; else p.mt[id] = (p.mt[id] || 0) + 1;
  }
  p.dgc[d.site] = Math.max(p.dgc[d.site] || 0, at + CFG.dig.coolMs);
  p.dg = null;
  return d.got;
}
// a escavação acabou: já se pode mostrar onde estava tudo (cada grelha é sorteada de novo, não ensina nada para a seguinte)
const digReveal = (d) => d.cells.map((v) => v || 0);
export function digStart(p, now, world, rng, site) {
  const S = siteOf(site), set = S && digSet(S.id);
  if (!S || !set) fail('NO_SITE');
  begin(p, now, world, { trOk: 1 });   // (primeiro: preso ou internado diz isso, não que falta o curso)
  if (S.at !== hereOf(p)) fail('NOT_THERE', { at: S.at });   // v101: só se escava onde se está
  if (stLevel(p, 'arqueologia') < S.st) fail('NEED_STUDY', { need: S.st });
  if (p.dg) fail('DIG_OPEN');
  if ((p.dgc[S.id] || 0) > now) fail('DIG_WAIT', { until: p.dgc[S.id] });
  pay(p, S.price);
  const D = CFG.dig, cells = Array(D.size * D.size).fill(0), items = CFG.col.sets[set].items;
  for (let k = 0; k < D.finds; ) { const i = rng.int(0, cells.length - 1); if (!cells[i]) { cells[i] = items[rng.int(0, items.length - 1)]; k++; } }
  if (S.rare && rng.chance(S.rareBp)) for (;;) { const i = rng.int(0, cells.length - 1); if (!cells[i]) { cells[i] = S.rare; break; } }   // v86: às vezes, o material raro do sítio
  p.dg = { site: S.id, t0: now, cells, open: [], got: [], used: 0, taps: D.taps, safe: digSafe(p) };
  return { ok: true, site: S.id, price: S.price, taps: p.dg.taps, safe: p.dg.safe };
}
export function digTap(p, now, world, rng, i) {
  const D = CFG.dig;
  if (!Number.isInteger(i) || i < 0 || i >= D.size * D.size) fail('BAD_CELL');
  begin(p, now, world, { trOk: 1 });
  const d = p.dg;
  if (!d) fail('NO_DIG');
  if (d.open.some((x) => x.i === i)) fail('CELL_OPEN');
  if (d.used >= d.taps) fail('NO_TAPS');
  d.used += 1;
  const S = siteOf(d.site), risk = digRiskBp(d.used, d.safe);
  if (risk && rng.chance(risk)) {   // a ronda: preso, e o saco desta escavação fica para trás
    const lost = d.got.slice(), grid = digReveal(d), open = d.open.slice();
    d.got = [];
    digClose(p, now);
    const dep = p.tr ? trDeport(p, now) : null;   // v101: apanhado lá fora: deportado, a mala fica lá, e a pena cumpre-se cá
    jailFor(p, now, S.jailMin * T.MIN, DIG_JAIL + CFG.dig.sites.indexOf(S), { k: 'dig', id: S.id });
    return { ok: true, i, caught: true, lost, jailUntil: p.jailUntil, site: S.id, grid, open, ...(dep ? { deported: dep } : {}) };
  }
  const v = d.cells[i];
  if (v) { d.got.push(v); d.open.push({ i, v }); } else d.open.push({ i, n: digNear(d.cells, i) });
  const out = { ok: true, i, v: v || null, n: v ? undefined : digNear(d.cells, i), used: d.used, taps: d.taps, site: d.site };
  if (d.used >= d.taps) { out.end = true; out.grid = digReveal(d); out.open = d.open.slice(); out.got = digClose(p, now); out.matLost = d.matLost; }
  return out;
}
export function digStop(p, now, world) {
  begin(p, now, world, { trOk: 1 });
  if (!p.dg) fail('NO_DIG');
  const d = p.dg, site = d.site, grid = digReveal(d), open = d.open.slice(), got = digClose(p, now);
  return { ok: true, site, grid, open, got, matLost: d.matLost };   // matLost: o raro que não coube no depósito
}
// o que o site pode ver de uma escavação aberta (sem a grelha)
export function digView(p, now) {
  const d = p.dg;
  return d ? { site: d.site, t0: d.t0, until: d.t0 + CFG.dig.ttl, open: d.open.map((x) => ({ ...x })), got: d.got.slice(), used: d.used, taps: d.taps, safe: d.safe, next: digRiskBp(d.used + 1, d.safe) } : null;
}

// ---------- viagens (v101) ----------
// O jogador voa para outro país: a ida (out), lá (there) e a volta (back). Enquanto está fora só faz o que se faz lá (comprar, escavar,
// voltar) e o que se faz em qualquer lado (vestir, beber, ler). A mala que chega espera no aeroporto até se vender ao importador.
// O stock lá fora e o preço do importador são de todos: vivem no mundo (w.tw), e só mudam com as compras e as vendas.
export const destOf = (id) => (typeof id === 'string' ? CFG.travel.dests.find((d) => d.id === id) : undefined);
export const trGood = (id) => (typeof id === 'string' && Object.hasOwn(CFG.travel.goods, id) ? CFG.travel.goods[id] : undefined);
export const hereOf = (p) => (p.tr && p.tr.st === 'there' ? p.tr.to : 'pt');
export const trBagCap = (p) => CFG.travel.bag[p.trB || 0];
export const trUsed = (bag) => Object.values(bag || {}).reduce((s, n) => s + n, 0);
const TR_SAT_MS = T.HOUR / CFG.travel.satRecH;   // um ponto (0,01%) de preço volta a cada TR_SAT_MS
// o estado de uma coisa agora (sem mexer no mundo): stock lá fora (s, com t: até onde já se repôs) e preço cá (sat, com ts)
export function trState(w, id, now) {
  const G = CFG.travel.goods[id], x0 = w && w.tw && w.tw[id], x = x0 ? { ...x0 } : { s: G.max, t: now, sat: 10000, ts: now };
  const per = T.HOUR / G.perH;
  if (x.s >= G.max) { x.s = G.max; x.t = Math.max(x.t, now); }
  else if (now > x.t) { const k = Math.floor((now - x.t) / per); if (k > 0) { x.s = Math.min(G.max, x.s + k); x.t = x.s >= G.max ? now : x.t + k * per; } }
  if (x.sat >= 10000) { x.sat = 10000; x.ts = Math.max(x.ts, now); }
  else if (now > x.ts) { const k = Math.floor((now - x.ts) / TR_SAT_MS); if (k > 0) { x.sat = Math.min(10000, x.sat + k); x.ts = x.sat >= 10000 ? now : x.ts + k * TR_SAT_MS; } }
  return x;
}
const trPut = (w, id, x) => { if (!w.tw || typeof w.tw !== 'object') w.tw = {}; w.tw[id] = x; };
// o que o importador paga por n de uma coisa com o preço a sat (cada unidade baixa satBp: conta-se pela média)
export function trPrice(id, n, sat) {
  const R = CFG.travel, avg = Math.max(R.satMin, sat - Math.floor((R.satBp * (n - 1)) / 2));
  return { v: Math.floor((n * CFG.travel.goods[id].sell * avg) / 10000), sat1: Math.max(R.satMin, sat - R.satBp * n) };
}
// a viagem que mudou de fase com o tempo: chegou lá, ou chegou cá (a mala fica à espera no aeroporto)
function trSettle(p, now) {
  const t = p.tr; if (!t) return;
  if (t.st === 'out' && t.at <= now) { t.st = 'there'; t.t0 = t.at; }
  if (t.st === 'back' && t.at <= now) { p.trL = { to: t.to, at: t.at, bag: t.bag, paid: t.paid, sz: t.sz || [] }; p.tr = null; }
}
// apanhado lá fora: volta já, sem a mala
function trDeport(p, now) { const t = p.tr; p.tr = null; return { to: t.to, bag: t.bag }; }
export function travel(p, now, world, to, mode = 'locker', rng) {
  const D = destOf(to);
  if (!D) fail('NO_DEST');
  if (!['locker', 'hide', 'contact'].includes(mode)) fail('BAD_MODE');
  begin(p, now, world);
  if (level(p) < D.level) fail('LOW_LEVEL', { need: D.level });
  if (p.trL) fail('BAG_WAITING');
  if (p.dg) fail('DIG_OPEN');
  if (p.hunt.on) fail('HUNT_OPEN');   // (o golpe grande em preparação fica à espera: só avança quando cá estiveres)
  if (p.gs || (p.course && p.course.q)) fail('TRIP_BUSY');
  if (now + 2 * D.ms > world.playEnd) fail('ROUND_ENDING');
  const day = dayOf(now), done = p.trD && p.trD.d === day ? p.trD.n : 0;
  if (done >= CFG.travel.perDay) fail('TRIP_LIMIT', { n: CFG.travel.perDay });
  const n = trWeapons(p), bribe = n && mode === 'contact' ? trContactCost(p) : 0;
  pay(p, D.ticket + bribe);
  // o raio-X: sem armas, passa; no cacifo, ficam cá; escondidas ou pelo contacto, podem ser confiscadas (com multa)
  let arm = false, xr = null;
  if (n && mode !== 'locker') {
    if (rng.chance(mode === 'contact' ? CFG.travel.contact.risk : Math.min(CFG.travel.xray.max, CFG.travel.xray.bp * n))) {
      const lost = [...W_ALL.filter((s) => p.eq[s]).map((s) => p.eq[s].id), ...p.inv.filter((x) => isWeapon(x.id)).map((x) => x.id)];
      for (const s of W_ALL) p.eq[s] = null;
      p.inv = p.inv.filter((x) => !isWeapon(x.id));
      const fine = Math.min(CFG.travel.xray.fine * n, p.cash + p.bank); pay(p, fine);
      xr = { mode, caught: true, lost, fine, bribe };
    } else { arm = true; xr = { mode, caught: false, n, bribe }; }
  } else if (n) xr = { mode: 'locker', n };
  p.tr = { to: D.id, st: 'out', t0: now, at: now + D.ms, bag: {}, paid: {}, arm };
  p.trD = { d: day, n: done + 1 };
  return { ok: true, to: D.id, at: p.tr.at, paid: D.ticket, ...(xr ? { xr } : {}) };
}
// o contacto no aeroporto: uma parte do valor das armas na loja (os contactos da prisão baixam o preço)
export function trContactCost(p) {
  const C = CFG.travel.contact, v = [...W_ALL.map((s) => p.eq[s]).filter(Boolean), ...p.inv.filter((x) => isWeapon(x.id))].reduce((s, x) => s + (gearOf(x.id).price || 0), 0);
  return Math.max(C.min, Math.floor((Math.floor((v * C.bp) / 10000) * (10000 - C.perBp * Math.min(p.contacts || 0, CFG.jail.contactsMax))) / 10000));
}
// o armeiro lá de fora: aluga a arma do país até à volta (não entra no avião)
export function trGun(p, now, world) {
  begin(p, now, world, { trOk: 1 });
  if (!p.tr) fail('NOT_ABROAD');
  const D = destOf(p.tr.to);
  if (p.tr.gun) fail('HAVE_IT');
  pay(p, D.gunRent);
  p.tr.gun = D.gun;
  return { ok: true, gun: D.gun, price: D.gunRent };
}
// as armas que o raio-X vê: as vestidas e as do inventário
const W_ALL = ['branca', 'mao', 'principal'];
const isWeapon = (id) => { const g = gearOf(id); return !!g && W_ALL.includes(g.slot); };
export const trWeapons = (p) => W_ALL.filter((s) => p.eq[s]).length + p.inv.filter((x) => isWeapon(x.id)).length;
// onde está agora, sem mexer no jogador (a ida que já chegou conta como lá)
export function trWhere(p, now) {
  const t = p.tr; if (!t) return null;
  if (t.st === 'out' && t.at <= now) return { to: t.to, st: 'there', t0: t.at };
  if (t.st === 'back' && t.at <= now) return null;
  return { to: t.to, st: t.st, t0: t.t0 };
}
export function trBuy(p, now, world, m, g, n) {
  const G = trGood(g);
  if (!G) fail('NO_GOOD');
  if (!Number.isSafeInteger(n) || n < 1) fail('BAD_AMOUNT');
  if (!m || !m.w) fail('NO_MARKET');
  begin(p, now, world, { trOk: 1 });
  if (!p.tr) fail('NOT_ABROAD');
  if (G.at !== p.tr.to) fail('NOT_THERE', { at: G.at });
  const free = trBagCap(p) - trUsed(p.tr.bag);
  if (n > free) fail('BAG_FULL', { free });
  const x = trState(m.w, g, now);
  if (x.s < n) fail('OUT_OF_STOCK', { s: x.s });
  const cost = G.buy * n;
  pay(p, cost);
  x.s -= n; trPut(m.w, g, x);
  p.tr.bag[g] = (p.tr.bag[g] || 0) + n; p.tr.paid[g] = (p.tr.paid[g] || 0) + cost;
  return { ok: true, g, n, cost, s: x.s };
}
export function trBack(p, now, world, rng) {
  begin(p, now, world, { trOk: 1 });
  if (!p.tr) fail('NOT_ABROAD');
  if (p.dg) fail('DIG_OPEN');
  const D = destOf(p.tr.to);
  // a alfândega decide já (o jogador só sabe quando aterra): cada lote de contrabando com a sua hipótese
  const sz = Object.keys(CFG.travel.goods).filter((g) => p.tr.bag[g] > 0 && CFG.travel.goods[g].seizeBp && rng.chance(CFG.travel.goods[g].seizeBp));
  Object.assign(p.tr, { st: 'back', t0: now, at: now + D.ms, sz });
  return { ok: true, to: D.id, at: p.tr.at };
}
export function trSell(p, now, world, m) {
  if (!m || !m.w) fail('NO_MARKET');
  begin(p, now, world, { allowBusy: true });
  const L = p.trL;
  if (!L) fail('NO_BAG');
  const lines = [];
  let bank = 0, cash = 0, gross = 0, lav = 0, units = 0;
  for (const g of Object.keys(CFG.travel.goods)) {
    const n = L.bag[g] || 0; if (!n) continue;
    const G = CFG.travel.goods[g];
    if (L.sz.includes(g)) { lines.push({ g, n, sz: true }); continue; }
    const x = trState(m.w, g, now), q = trPrice(g, n, x.sat);
    x.sat = q.sat1; trPut(m.w, g, x);
    units += n; gross += q.v;
    if (G.seizeBp) {   // contrabando: o lucro é sujo (paga lavagem) e vem em dinheiro
      const Lv = launder(p, q.v - (L.paid[g] || 0)); lav += Lv.lav; cash += q.v - Lv.lav;
      lines.push({ g, n, v: q.v - Lv.lav, lav: Lv.lav });
    } else { bank += q.v; lines.push({ g, n, v: q.v }); }   // legal: o importador paga por transferência
  }
  p.cash += cash; p.bank += bank;
  p.trL = null;
  const resp = units ? destOf(L.to).r : 0;
  return { ok: true, to: L.to, lines, got: cash + bank, gross, lav, units, respect: resp, levelUp: resp ? addRespect(p, resp, now) : false };
}
export function trBag(p, now, world) {
  begin(p, now, world);
  const k = (p.trB || 0) + 1;
  if (k >= CFG.travel.bag.length) fail('BAG_MAX');
  pay(p, CFG.travel.bagCost[k]);
  p.trB = k;
  return { ok: true, k, cap: CFG.travel.bag[k], price: CFG.travel.bagCost[k] };
}
// o que o site vê da viagem (a alfândega fica escondida até aterrar)
export function trView(p) {
  const t = p.tr;
  return t ? { to: t.to, st: t.st, t0: t.t0, at: t.at, bag: { ...t.bag }, paid: { ...t.paid }, arm: !!t.arm, ...(t.gun ? { gun: t.gun } : {}) } : null;
}

// ---------- caça (v98) ----------
// Uma saída de cada vez. O servidor guarda o animal à vista (espécie, tamanho, distância, ritmo da mira); o site vê a espécie, a
// distância, o ritmo e as hipóteses, mas não o tamanho (só se sabe depois de abatido).
export const HUNT_JAIL = 400;   // jailTier de quem foi apanhado na caça furtiva (400 + a reserva)
export const huntSite = (id) => (typeof id === 'string' ? CFG.hunt.sites.find((s) => s.id === id) : undefined);
export const huntSp = (id) => (typeof id === 'string' && Object.hasOwn(CFG.hunt.sp, id) ? CFG.hunt.sp[id] : undefined);
export const huntSk = (p) => Math.floor(((p.hunt && p.hunt.sk) || 0) / 1000);   // perícia de 0 a 100
const huntSkF = (p) => ((p.hunt && p.hunt.sk) || 0) / 100000;
// a arma de fogo vestida com mais alcance (com usos)
export function huntGun(p) {
  const L = ['principal', 'mao'].filter((s) => { const x = p.eq[s], g = x && gearOf(x.id); return g && g.gun && x.u > 0; });
  L.sort((a, b) => wStat(p.eq[b]).rng - wStat(p.eq[a]).rng);
  return L[0] || null;
}
export const huntLegalGun = (p, slot) => !!slot && CFG.hunt.legalT.includes(gearOf(p.eq[slot].id).t);
function huntDay(p, now) { const d = dayOf(now); if (p.hunt.day !== d) { p.hunt.day = d; p.hunt.q = {}; } }
export function huntQuotaLeft(p, now, site) { const H = p.hunt; return CFG.hunt.quota - (H.day === dayOf(now) ? H.q[site] || 0 : 0); }
// o ritmo da mira (ms por ida e volta): mais lento com mais precisão e perícia
function huntPeriod(p, it) { const A = CFG.hunt.aim; return clamp(A.base + A.perAcc * wStat(it).acc + A.perSk * huntSk(p), A.min, A.max); }
// a qualidade do tiro pelo instante: a mira passa pelo centro a cada meio período; ph (milésimos de meia volta) é onde começa
export function huntAim(c, at) {
  const half = c.P / 2, x = (((at / half) + c.ph / 1000) % 1 + 1) % 1, off = Math.round(Math.min(x, 1 - x) * 20000);   // 0 no centro, 10000 na ponta
  for (const [q, lim] of CFG.hunt.aim.q) if (off <= lim) return q;
  return 'mau';
}
// hipótese de acertar com cada mira, para o animal à vista e a arma da saída
export function huntHitBp(p, it, c, q) {
  const H = CFG.hunt, a = huntSp(c.sp), w = wStat(it), R = Math.max(1, w.rng);
  const rf = c.d <= R ? 10000 : c.d >= 2 * R ? 0 : Math.floor(((2 * R - c.d) * 10000) / R);
  if (!rf) return 0;
  let bp = w.acc * H.accBp + H.qBp[q] + huntSk(p) * H.skBp;
  bp = Math.floor((bp * rf) / 10000);
  bp = Math.floor((bp * (a.hard || 10000)) / 10000);
  if (a.bird && gearOf(it.id).t !== 'cacadeira') bp = Math.floor((bp * H.birdBp) / 10000);
  return clamp(bp, H.minBp, H.maxBp);
}
const huntSpook = (p, a) => Math.floor((a.wary * (200 - huntSk(p))) / 200);
function huntSight(p, now, rng) {
  const h = p.hunt.on, S = huntSite(h.site), sk = huntSk(p);
  const L = [...S.sp, ...(h.mode === 'fur' ? S.prot : [])].filter(([id]) => (huntSp(id).sk || 0) <= sk);
  let r = rng.int(1, L.reduce((s, x) => s + x[1], 0)), id = L[0][0];
  for (const [k, w] of L) { r -= w; if (r <= 0) { id = k; break; } }
  const a = huntSp(id), size = () => (rng.int(0, 1000) + rng.int(0, 1000)) / 2;
  let sz = size(); if (rng.int(1, 200) <= sk) sz = Math.max(sz, size());   // com perícia, às vezes o melhor de dois
  h.cur = { sp: id, d: rng.int(a.d[0], a.d[1]), sz: Math.round(sz), P: huntPeriod(p, p.eq[h.slot]), ph: rng.int(0, 999), t: now };
  h.seen += 1;
}
// o que o site vê da saída (sem o tamanho do animal)
export function huntView(p, now) {
  const h = p.hunt && p.hunt.on; if (!h) return null;
  const it = p.eq[h.slot], c = h.cur;
  return { site: h.site, mode: h.mode, slot: h.slot, t0: h.t0, until: h.t0 + CFG.hunt.ttl, shots: h.shots, moves: h.moves, bag: h.bag.map((k) => ({ ...k })),
    cur: c && it ? { sp: c.sp, d: c.d, P: c.P, ph: c.ph, t: c.t, hit: Object.fromEntries(Object.keys(CFG.hunt.qBp).map((q) => [q, huntHitBp(p, it, c, q)])),
      spook: huntSpook(p, huntSp(c.sp)), kill: wStat(it).atk >= huntSp(c.sp).tough } : null,
    ranger: h.mode === 'fur' ? huntRanger(p, h) : 0 };
}
function huntRanger(p, h) { const S = huntSite(h.site), it = p.eq[h.slot]; return it && wStat(it).bust > 0 ? cut(S.ranger, CFG.hunt.silBp) : S.ranger; }
export function huntStart(p, now, world, rng, site, mode) {
  const H = CFG.hunt, S = huntSite(site);
  if (!S) fail('NO_SITE');
  if (mode !== 'lic' && mode !== 'fur') fail('BAD_MODE');
  begin(p, now, world);
  if (level(p) < S.level) fail('LOW_LEVEL', { need: S.level });
  if (p.hunt.on) fail('HUNT_OPEN');
  const slot = huntGun(p);
  if (!slot) fail('NO_GUN');
  if (mode === 'lic' && !huntLegalGun(p, slot)) fail('GUN_NOT_LEGAL');
  if (mode === 'lic' && huntQuotaLeft(p, now, S.id) < 1) fail('HUNT_QUOTA');
  if (mode === 'fur' && (p.hunt.fc[S.id] || 0) > now) fail('HUNT_WATCHED', { until: p.hunt.fc[S.id] });
  if (p.vigor < H.e) fail('NO_VIGOR', { need: H.e });
  if (mode === 'lic') pay(p, S.fee);
  huntDay(p, now);   // (só depois de tudo conferido: uma saída recusada não mexe em nada)
  p.vigor -= H.e;
  p.eq[slot].u -= 1;
  if (mode === 'lic') p.hunt.q[S.id] = (p.hunt.q[S.id] || 0) + 1; else p.hunt.fc[S.id] = now + H.furCool;
  p.hunt.on = { site: S.id, mode, slot, gid: p.eq[slot].id, sk0: p.hunt.sk, t0: now, shots: H.shots, moves: H.moves, bag: [], cur: null, seen: 0 };
  p.hunt.n += 1;
  huntSight(p, now, rng);
  return { ok: true, site: S.id, mode, fee: mode === 'lic' ? S.fee : 0, hunt: huntView(p, now) };
}
function huntOpen(p, now, world) {
  begin(p, now, world);
  if (!p.hunt.on) fail('NO_HUNT');
  return p.hunt.on;
}
// procurar outro animal (o que estava à vista vai-se embora)
export function huntLook(p, now, world, rng) {
  const h = huntOpen(p, now, world), it = p.eq[h.slot];
  if (!it || it.id !== h.gid) fail('NO_GUN');   // (v116, achado pelo fuzz) a arma tirada a meio da saída: o ritmo da mira lia uma arma que já não estava lá
  if (h.moves < 1) fail('NO_MOVES');
  h.moves -= 1;
  huntSight(p, now, rng);
  return { ok: true, hunt: huntView(p, now) };
}
// aproximar: a distância fica em 60%, mas o animal pode fugir
export function huntNear(p, now, world, rng) {
  const H = CFG.hunt, h = huntOpen(p, now, world), c = h.cur;
  if (!c) fail('NO_ANIMAL');
  if (h.moves < 1) fail('NO_MOVES');
  if (c.d <= H.minD) fail('TOO_CLOSE');
  h.moves -= 1;
  const fled = rng.chance(huntSpook(p, huntSp(c.sp)));
  if (fled) h.cur = null;
  else { c.d = Math.max(H.minD, Math.floor((c.d * H.nearBp) / 10000)); c.t = now; c.ph = rng.int(0, 999); }
  const out = { ok: true, fled, sp: c.sp, hunt: huntView(p, now) };
  if (huntDone(h)) Object.assign(out, huntClose(p, now), { end: true });
  return out;
}
const huntDone = (h) => h.shots < 1 || (h.moves < 1 && !h.cur);
const huntMedal = (sz) => CFG.hunt.medal.filter((x) => sz >= x / 10).length;   // sz em milésimos; medal em pontos base
// at: milissegundos desde que o animal apareceu no ecrã (o relógio do site)
export function huntShoot(p, now, world, rng, at) {
  const H = CFG.hunt;
  if (!Number.isFinite(at) || at < 0) fail('BAD_TAP');
  const h = huntOpen(p, now, world), c = h.cur, it = p.eq[h.slot];
  if (!c) fail('NO_ANIMAL');
  if (!it || it.id !== h.gid) fail('NO_GUN');   // trocar de arma a meio não vale
  if (at > now - c.t + H.slack) fail('BAD_TAP');
  h.shots -= 1;
  const a = huntSp(c.sp), q = huntAim(c, at), bp = huntHitBp(p, it, c, q), hit = rng.chance(bp), kill = hit && wStat(it).atk >= a.tough;
  const shot = { sp: c.sp, d: c.d, q, bp, hit, kill, wounded: hit && !kill };
  if (kill) {
    const md = huntMedal(c.sz), v = Math.max(1, Math.floor((a.v * (500 + c.sz) * H.valBp[q]) / 10000000));
    const sc = Math.round(a.sc[0] + ((a.sc[1] - a.sc[0]) * c.sz) / 1000);
    const g = Math.max(1, Math.floor(a.xp * 50 * (1 - huntSkF(p)) ** 1.5));
    p.hunt.sk = Math.min(100000, p.hunt.sk + g);
    const k = { sp: c.sp, sz: c.sz, sc, md, v, q };
    h.bag.push(k); Object.assign(shot, { sc, md, v, xp: g });
  }
  h.cur = null;
  const out = { ok: true, shot };
  if (h.mode === 'fur' && rng.chance(huntRanger(p, h))) {   // os guardas: preso, e o que se caçou nesta saída fica para trás
    const S = huntSite(h.site), lost = h.bag.slice();
    p.hunt.on = null;
    jailFor(p, now, S.jail * T.MIN, HUNT_JAIL + CFG.hunt.sites.indexOf(S), { k: 'hunt', id: S.id });
    return { ...out, caught: true, lost, jailUntil: p.jailUntil, site: S.id, end: true };
  }
  if (!kill && a.dg && c.d <= H.chargeD && rng.chance(hit ? a.dg : Math.floor(a.dg / 2))) {   // carregou: o guia leva-te ao hospital e vende o que já tinhas
    Object.assign(out, huntClose(p, now), { charged: true, end: true });
    hospitalize(p, now, a.hosp * T.MIN, false);
    out.hospUntil = p.hospUntil;
    return out;
  }
  out.hunt = huntView(p, now);
  if (huntDone(h)) Object.assign(out, huntClose(p, now), { end: true });
  return out;
}
export function huntStop(p, now, world) {
  huntOpen(p, now, world);
  return { ok: true, ...huntClose(p, now), end: true };
}
// fecha a saída: o guia compra a caça, os troféus vão para a parede (o melhor de cada espécie) e o respeito das medalhas
function huntClose(p, now) {
  const H = CFG.hunt, h = p.hunt.on, bag = h.bag, cash = bag.reduce((s, k) => s + k.v, 0), firsts = [], best = [];
  let resp = 0;
  for (const k of bag) {
    const t = p.hunt.tr[k.sp] || (p.hunt.tr[k.sp] = { n: 0, sc: 0, md: 0 });
    if (!t.n) { firsts.push(k.sp); resp += huntSp(k.sp).xp * H.firstResp; }
    if (k.sc > t.sc) { if (t.n) best.push(k.sp); t.sc = k.sc; }
    t.n += 1; t.md = Math.max(t.md, k.md);
    resp += H.medalResp[k.md];
  }
  p.cash += cash;
  p.c.kills = (p.c.kills || 0) + bag.length;
  const lvl = addRespect(p, resp, now);
  p.hunt.on = null;
  return { site: h.site, mode: h.mode, bag, cash, resp, firsts, best, xp: p.hunt.sk - (h.sk0 ?? p.hunt.sk), ...(lvl ? { levelUp: lvl } : {}) };   // xp: perícia ganha na saída (milésimos)
}

// ---------- honras (v100) ----------
// A lista sai da configuração: uma honra por degrau de cada número, ou uma por cada coisa de uma lista (golpes, stats, negócios,
// casas, luxos, rotas, espécies, reservas, conjuntos do museu, cursos, tipos de arma). id = m + '_' + (coisa) + ('_' + degrau).
const HON_EACH = {
  crimes: () => CFG.crimes.map((c) => c.id), stats: () => STATS, biz: () => CFG.biz.map((b) => b.id), house: () => CFG.house.tiers.slice(1).map((x) => x.id),
  lux: () => CFG.luxury.list.map((x) => x.id), routes: () => CFG.air.routes.map((x) => x.id), species: () => Object.keys(CFG.hunt.sp), reserves: () => CFG.hunt.sites.map((x) => x.id),
  sets: () => Object.keys(CFG.col.sets), courses: () => CFG.courses.map((c) => c.id), dests: () => CFG.travel.dests.map((d) => d.id),
  wtypes: () => [...new Set(CFG.gear.filter((g) => g.t).map((g) => g.t))],
};
// d: a dificuldade (0 a 1), que dá a moldura: o degrau na série, ou, nas de um só passo, a posição da coisa na lista (as listas vão
// do mais fácil ao mais difícil; os negócios pelo preço, os cursos pelo nível). s: o número da série dentro da categoria (o desenho
// é o mesmo em toda a série; o degrau muda a moldura e a força do padrão).
const honDiff = (H, k, ks) => {
  if (H.each === 'biz') { const L = [...CFG.biz].sort((a, b) => a.price - b.price); return (L.findIndex((b) => b.id === k) + 1) / L.length; }
  if (H.each === 'courses') { const c = CFG.courses.find((x) => x.id === k); return c.lv ? c.lv / 3 : 0.5; }
  if (H.each === 'species') { const L = Object.entries(CFG.hunt.sp).sort((a, b) => a[1].v - b[1].v); return (L.findIndex(([id]) => id === k) + 1) / L.length; }
  return (ks.indexOf(k) + 1) / ks.length;
};
const HON_SERIES = {};
export const HONORS = CFG.honors.flatMap((H) => {
  const ks = H.each ? HON_EACH[H.each]() : [null], at = H.at || [1];
  return ks.flatMap((k) => {
    const sIdx = (HON_SERIES[H.cat] = (HON_SERIES[H.cat] ?? -1) + 1);
    return at.map((n, j) => ({ id: H.m + (k ? '_' + k : '') + (at.length > 1 ? '_' + n : ''), m: H.m, cat: H.cat, k, at: n, t: j + 1, of: at.length, s: sIdx,
      d: Math.round((at.length > 1 ? (j + 1) / at.length : honDiff(H, k, ks)) * 100) / 100 }));
  });
});
const HON_BY_ID = new Map(HONORS.map((x) => [x.id, x]));
export const honorOf = (id) => (typeof id === 'string' ? HON_BY_ID.get(id) : undefined);
// o número de cada honra
export function honorVal(p, m, k) {
  const c = p.c || {};
  switch (m) {
    case 'crimes': return c.crimes || 0;
    case 'wk': return p.wk[CFG.crimes.findIndex((x) => x.id === k)] || 0;
    case 'crits': return c.crits || 0;
    case 'pvp': return c.pvpWins || 0;
    case 'hosp': return c.hosp || 0;
    case 'trains': return c.trains || 0;
    case 'stat': return p.stats[k] || 0;
    case 'stats': return STATS.reduce((s, x) => s + (p.stats[x] || 0), 0);
    case 'gyms': return (p.gyms || []).length;
    case 'level': return level(p);
    case 'nw': return Math.max(c.nw || 0, p.cash + p.bank);
    case 'bizn': return p.biz.reduce((s, b) => s + b.n, 0);
    case 'biz': return p.biz[CFG.biz.findIndex((b) => b.id === k)]?.n || 0;
    case 'house': return (p.house || 0) >= CFG.house.tiers.findIndex((x) => x.id === k) ? 1 : 0;
    case 'lux': return (p.luxuries || 0) > CFG.luxury.list.findIndex((x) => x.id === k) ? 1 : 0;
    case 'collects': return c.collects || 0;
    case 'ports': return c.ports || 0;
    case 'air': return (p.cx && p.cx.air[k]) || 0;
    case 'trips': return (p.cx && p.cx.trip && p.cx.trip[k]) || 0;   // v101
    case 'trGoods': return c.trGoods || 0;
    case 'wars': return c.wars || 0;   // v102
    case 'warHits': return c.warHits || 0;
    case 'hunts': return p.hunt.n || 0;
    case 'kills': return c.kills || 0;
    case 'sp': return p.hunt.tr[k]?.n || 0;
    case 'gold': return Object.values(p.hunt.tr).filter((x) => x.md === 3).length;
    case 'hsk': return huntSk(p);
    case 'res': { const S = huntSite(k); return [...S.sp, ...S.prot].every(([id]) => p.hunt.tr[id]?.n) ? 1 : 0; }
    case 'mus': return p.mus[k] || 0;
    case 'musn': return Object.values(p.mus).reduce((s, n) => s + n, 0);
    case 'digs': return c.digs || 0;
    case 'course': return p.done.includes(k) ? 1 : 0;
    case 'books': return Object.keys(p.bk.done || {}).length;
    case 'jail': return c.jail || 0;
    case 'esc': return c.esc || 0;
    case 'busts': return c.busts || 0;
    case 'evtop': return c.evtop || 0;   // v117: eventos acabados (a última meta)
    case 'wt': return p.cx && p.cx.wt.includes(k) ? 1 : 0;
    case 'mods': return c.mods || 0;
    case 'missions': return p.mi || 0;
    case 'refills': return c.refills || 0;
  }
  return 0;
}
// os números novos que as honras pedem, contados pelo servidor depois de cada ação (pre: preso e internado antes da ação)
export function honorTrack(p, now, pre, type, r) {
  const c = p.c;
  if (!r) return;
  if (type === 'crime' && r.crit) c.crits = (c.crits || 0) + 1;
  if (type === 'crimeAll' && r.crits > 0) c.crits = (c.crits || 0) + r.crits;
  if (!p.cx || typeof p.cx !== 'object') p.cx = { air: {}, wt: [], trip: {} };
  if (!p.cx.trip) p.cx.trip = {};
  if (type === 'trSell' && r.ok && destOf(r.to)) { p.cx.trip[r.to] = (p.cx.trip[r.to] || 0) + 1; c.trGoods = (c.trGoods || 0) + (r.units || 0); }   // v101
  if (type === 'airCollect' && !r.seized && Number.isInteger(r.r) && CFG.air.routes[r.r]) { const id = CFG.air.routes[r.r].id; p.cx.air[id] = (p.cx.air[id] || 0) + 1; }
  if (type === 'digStart' && r.ok) c.digs = (c.digs || 0) + 1;
  if (type === 'jailEscape' && r.free) c.esc = (c.esc || 0) + 1;
  if (type === 'bust' && r.freed) c.busts = (c.busts || 0) + 1;   // v115
  if (type === 'modFit' && r.ok) c.mods = (c.mods || 0) + 1;
  if (!pre.j && p.jailUntil > now) c.jail = (c.jail || 0) + 1;
  if (!pre.h && p.hospUntil > now) c.hosp = (c.hosp || 0) + 1;
  for (const s of ['branca', 'mao', 'principal']) { const g = p.eq[s] && gearOf(p.eq[s].id); if (g && g.t && !p.cx.wt.includes(g.t)) p.cx.wt.push(g.t); }
}
// dá as honras que faltam e devolve as novas (ficam para sempre; o maior património também)
export function honorsCheck(p, now) {
  if (!p.hon || typeof p.hon !== 'object' || Array.isArray(p.hon)) p.hon = {};
  p.c.nw = Math.max(p.c.nw || 0, p.cash + p.bank);
  const memo = new Map(), out = [];
  for (const h of HONORS) {
    if (p.hon[h.id]) continue;
    const key = h.m + ':' + h.k;
    if (!memo.has(key)) memo.set(key, honorVal(p, h.m, h.k));
    if (memo.get(key) >= h.at) { p.hon[h.id] = now; out.push(h.id); }
  }
  return out;
}
// os números de todas as honras, para o site mostrar quanto falta
export function honorVals(p) {
  const o = {};
  for (const h of HONORS) { const key = h.m + (h.k ? ':' + h.k : ''); if (!(key in o)) o[key] = honorVal(p, h.m, h.k); }
  return o;
}
// escolher a barra que se mostra (null tira)
export function honorPick(p, now, world, id) {
  if (id !== null && !(typeof id === 'string' && honorOf(id) && p.hon && p.hon[id])) fail('NO_HONOR');
  p.honSel = id;
  return { ok: true, id };
}

// v109: a vitrine do perfil público: até CFG.social.vitMax honras ganhas, pela ordem escolhida (lista vazia tira tudo)
export function honorShow(p, now, world, ids) {
  if (!Array.isArray(ids) || ids.length > CFG.social.vitMax) fail('BAD_ACTION');
  const out = [];
  for (const id of ids) {
    if (typeof id !== 'string' || !honorOf(id) || !(p.hon && p.hon[id])) fail('NO_HONOR');
    if (!out.includes(id)) out.push(id);
  }
  p.honVit = out;
  return { ok: true, ids: out };
}

// ---------- Feira da Ladra (v84) ----------
// O motor só mexe no jogador: tira o que se põe à venda (fica guardado no anúncio), dá o que se compra ou se levanta e
// cobra. O anúncio, o dinheiro preso nos lances e quem recebe o quê ficam no servidor.
// kind: 'mt' (depósito da cave), 'col' (vitrine), 'inv' (um objeto do inventário: ferramenta, arma ou proteção).
export function feiraDesc(kind, id) {
  if (kind === 'mt') return MAT_IDS.includes(id);
  if (kind === 'col') return colItems().includes(id);
  if (kind === 'inv') { const g = typeof id === 'string' ? gearOf(id) : undefined; return !!g; }
  return false;
}
// pôr à venda: o que vai no anúncio sai do jogador
export function feiraTake(p, now, world, kind, id, n, i) {
  const F = CFG.feira;
  if (!['mt', 'col', 'inv'].includes(kind)) fail('NO_ITEM');
  if (kind === 'inv') {
    const it = Number.isInteger(i) ? p.inv[i] : undefined;
    if (!it || !gearOf(it.id) || (typeof id === 'string' && id !== it.id)) fail('NO_ITEM');
    begin(p, now, world);
    p.inv.splice(i, 1);
    return { kind, id: it.id, n: 1, o: it };
  }
  if (!feiraDesc(kind, id)) fail('NO_ITEM');
  if (!Number.isSafeInteger(n) || n < 1 || n > F.maxN) fail('BAD_AMOUNT');
  begin(p, now, world);
  const box = kind === 'mt' ? p.mt : p.col;
  if (!((box[id] || 0) >= n)) fail('NO_ITEM', { have: box[id] || 0 });
  box[id] -= n; if (!box[id]) delete box[id];
  return { kind, id, n, o: null };
}
// pode receber? (o depósito tem teto; a ferramenta é uma de cada; um objeto ocupa um espaço). Devolve o código do erro ou null.
export function feiraFits(p, d) {
  if (d.kind === 'mt' && (p.mt[d.id] || 0) + d.n > CFG.mat.cap) return 'MAT_FULL';
  if (d.kind === 'inv') {
    if (gearOf(d.id).slot === 'mat' && p.inv.some((x) => x.id === d.id)) return 'HAVE_IT';
    if (!roomFor(p)) return 'NO_ROOM';
  }
  return null;
}
function feiraRoom(p, d) {
  const e = feiraFits(p, d);
  if (e) fail(e, e === 'MAT_FULL' ? { cap: CFG.mat.cap } : undefined);
}
// preço de referência de uma unidade (a banda de preços sai daqui)
const matRef = (id, depth = 0) => {
  const F = CFG.feira;
  if (F.ref[id]) return F.ref[id];
  const r = depth < 4 ? CFG.craft.list.find((x) => x.id === id && x.kind === 'comp') : null;
  return r ? Object.entries(r.needs).reduce((s, [k, q]) => s + q * matRef(k, depth + 1), r.price) : 0;
};
// uma arma vale pelos usos que lhe restam (uma sniper gasta não vale o preço da loja)
export function feiraRef(kind, id, o) {
  if (kind === 'inv') {
    const g = typeof id === 'string' ? gearOf(id) : undefined;
    if (!g) return 0;
    return g.gun && o && Number.isInteger(o.u) ? Math.max(1, Math.round((g.price * Math.max(0, Math.min(o.u, g.life))) / g.life)) : g.price;
  }
  if (kind === 'col') { const s = Object.values(CFG.col.sets).find((x) => x.items.includes(id)); return s ? Math.round(s.cash / s.items.length) : 0; }
  if (kind === 'mt') return MAT_IDS.includes(id) ? matRef(id) : 0;
  return 0;
}
// v89: quanto uma unidade vale mesmo, vendida fora da feira: o equipamento ao recetador (metade, pelo estado em que está), as peças
// das escavações ao museu nas entregas repetidas (30%) ou ao penhorista; as outras peças de coleção o museu paga sempre por inteiro.
// Pagar a «referência» por uma arma que só vale metade passava dinheiro de uma conta para outra sem contar nos limites da feira.
export function feiraLiq(kind, id, o) {
  const r = feiraRef(kind, id, o);
  if (kind === 'inv') return Math.floor((r * CFG.loot.gearSellBp) / 10000);
  if (kind === 'col') { const s = Object.values(CFG.col.sets).find((x) => x.items.includes(id)); return s && s.dig ? Math.min(r, Math.max(CFG.col.pawn, Math.floor((r * CFG.col.digRepBp) / 10000))) : r; }
  return r;
}
// entre quanto e quanto se pode pôr uma unidade à venda (e até onde vão os lances, vezes as unidades do lote)
export function feiraBand(kind, id, o) {
  const F = CFG.feira, r = feiraRef(kind, id, o);
  return { ref: r, lo: Math.max(1, Math.ceil((r * F.loBp) / 10000)), hi: Math.max(1, Math.floor((r * F.hiBp) / 10000)) };
}
// a tabela toda, para o site mostrar a banda antes de se escrever o preço
export function feiraRefs() {
  const out = {};
  for (const id of MAT_IDS) out['mt:' + id] = feiraRef('mt', id);
  for (const id of colItems()) out['col:' + id] = feiraRef('col', id);
  for (const g of CFG.gear) out['inv:' + g.id] = g.price;
  return out;
}
function feiraPut(p, d) {
  if (d.kind === 'mt') p.mt[d.id] = (p.mt[d.id] || 0) + d.n;
  else if (d.kind === 'col') p.col[d.id] = (p.col[d.id] || 0) + d.n;
  else p.inv.push(d.o && d.o.id === d.id ? { ...d.o } : itemNew(d.id));
}
// levantar (o que não se vendeu, ou o que se ganhou num leilão já pago)
export function feiraGive(p, now, world, d) {
  begin(p, now, world);
  feiraRoom(p, d);
  feiraPut(p, d);
  return { ok: true, kind: d.kind, id: d.id, n: d.n };
}
// comprar a preço fixo: paga e recebe na mesma ação (confere tudo antes)
export function feiraBuy(p, now, world, d, total) {
  if (!Number.isSafeInteger(total) || total < 1) fail('BAD_AMOUNT');
  begin(p, now, world);
  feiraRoom(p, d);
  pay(p, total);
  feiraPut(p, d);
  return { ok: true, kind: d.kind, id: d.id, n: d.n, price: total };
}
// só confere que o jogador pode agir agora (preso, internado, ocupado): voltar a pôr à venda, tirar para «levantar»
export function feiraBegin(p, now, world) { begin(p, now, world); return true; }
// licitar: o dinheiro sai já (fica preso no leilão enquanto se vai à frente)
export function feiraLock(p, now, world, amount) {
  if (!Number.isSafeInteger(amount) || amount < 1) fail('BAD_AMOUNT');
  begin(p, now, world);
  pay(p, amount);
  return { ok: true, amount };
}
// a taxa de quem vende (v90: o recetador paga metade)
export const feiraFeeBp = (p) => cut(CFG.feira.feeBp, (p && klass(p).feiraFeeCutBp) || 0);
export const feiraFee = (v, p) => Math.ceil((v * feiraFeeBp(p)) / 10000);
// o lance seguinte (pelo menos 5% acima do anterior, nunca acima do teto do lote). 0 = o leilão já chegou ao teto.
export const feiraNext = (lance, preco, cap = Infinity) => {
  if (lance && lance >= cap) return 0;
  return Math.min(cap, lance ? Math.max(lance + 1, Math.ceil((lance * (10000 + CFG.feira.stepBp)) / 10000)) : preco);
};

// ---------- negócios ----------

export const bizMaxOf = (i) => CFG.biz[i].max || CFG.bizMax;   // v99: os negócios pequenos têm um máximo próprio
export function bizPrice(i, n) {
  let price = CFG.biz[i].price;
  for (let k = 0; k < n; k++) price += Math.floor(price / CFG.priceStepDiv);
  return price;
}

// at: o momento a que se refere (a máquina só conta se estiver a trabalhar nesse momento); por omissão, o último toque
export function bizRates(p, i, at = p.t) {
  const b = CFG.biz[i];
  const n = p.biz[i].n;
  const st = Math.min(p.stats[b.stat], CFG.statMultCap);
  const base = up(Math.floor((b.perH * n * (CFG.statMultDiv + st)) / CFG.statMultDiv), (klass(p).bizBp || 0) + huBp(p, 3) + studyBp(p, 'biz') + (p.maq && p.maq[b.id] > at ? CFG.craft.maqBp : 0));   // v81: gestão; v83: máquina a trabalhar
  // v89: sob o efeito «negócios» (a coca), rende mais enquanto ele dura (antes multiplicava tudo o que estava guardado, até 24 h)
  return { perH: up(base, buffBp(p, 'biz', at)), base };
}

// quanto tempo de rendimento cabe no armazém: 8 h, ou 24 h com contabilista
export const bizCapMs = (p) => CFG.storageMs * (p.acct ? CFG.accountant.capMult : 1);
// a parte do contabilista: uma fatia do que está guardado acima do armazém normal (o que sem ele se tinha perdido)
export function bizFee(p, i, stored, at = p.t) {
  if (!p.acct) return 0;
  const capN = bizRates(p, i, at).base * (CFG.storageMs / T.HOUR);
  return stored > capN ? Math.floor(((stored - capN) * CFG.accountant.feeBp) / 10000) : 0;
}
const BIZ_DRUG = CFG.biz.map((b) => (b.drug ? CFG.drugs.findIndex((x) => x.id === b.drug) : -1));
function settleBiz(p, i, now) {
  const s = p.biz[i], u = p.maq && p.maq[CFG.biz[i].id];
  if (u && s.n > 0 && u > s.t && u < now) settleBiz(p, i, u);   // v83: a máquina parou a meio (falta a revisão): até aí rende com ela
  const fb = p.fx && p.fx.biz;
  if (fb && s.n > 0 && fb.until > s.t && fb.until < now) settleBiz(p, i, fb.until);   // v89: o efeito acabou a meio: até aí rende com ele
  if (s.n === 0 || now <= s.t) { s.t = Math.max(s.t, now); return; }
  const { perH, base } = bizRates(p, i, s.t);
  const capM = base * (bizCapMs(p) / T.HOUR);
  const dt = Math.min(now - s.t, bizCapMs(p));
  if (s.stored < capM) {
    const tot = s.rem + perH * dt;
    const add = Math.floor(tot / T.HOUR);
    s.rem = tot - add * T.HOUR;
    s.stored = Math.min(capM, s.stored + add);
    if (s.stored === capM) s.rem = 0;
  } else s.rem = 0;
  s.t = now;
}

function settleAllBiz(p, now) { for (let i = 0; i < p.biz.length; i++) settleBiz(p, i, now); }

export function bizStored(p, now) {
  // leitura sem alterar o estado (para o ecrã)
  const copy = p.biz.map((s) => ({ ...s }));
  const ghost = { ...p, biz: copy };
  for (let i = 0; i < copy.length; i++) settleBiz(ghost, i, Math.max(now, copy[i].t));
  return copy.map((s, i) => ({ money: s.stored, fee: bizFee(ghost, i, s.stored, now) }));
}

export function buyBiz(p, now, world, i) {
  if (!Number.isInteger(i) || !CFG.biz[i]) fail('NO_BIZ');
  begin(p, now, world);
  if (p.biz[i].n >= bizMaxOf(i)) fail('BIZ_MAX');
  const price = bizPrice(i, p.biz[i].n);
  pay(p, price);
  settleBiz(p, i, now);
  p.biz[i].n += 1;
  const lvl = addRespect(p, CFG.biz[i].resp, now);
  return { ok: true, price, n: p.biz[i].n, respect: CFG.biz[i].resp, levelUp: lvl };
}

export function collectBiz(p, now, world, rng) {
  begin(p, now, world, { allowBusy: true });
  settleAllBiz(p, now);
  const out = [];
  for (let i = 0; i < p.biz.length; i++) {
    const s = p.biz[i], b = CFG.biz[i];
    if (s.stored === 0) continue;
    const fee = bizFee(p, i, s.stored);
    let money = s.stored - fee, lost = 0;
    if (b.raid && money > 0 && rng.chance(CFG.raid.chanceBp)) {
      lost = Math.floor((money * CFG.raid.lossBp) / 10000);
      money -= lost;
    }
    if (s.g && BIZ_DRUG[i] >= 0) out.push({ biz: b.id, money, lost, fee, ...toGoods(p, BIZ_DRUG[i], money) });   // fábrica a entregar em droga: unidades para o armazém, o troco em dinheiro
    else { if (b.toBank) p.bank += money; else p.cash += money; out.push({ biz: b.id, money, lost, fee }); }
    s.stored = 0;
  }
  if (out.length) p.c.collects += 1;
  return { ok: true, items: out };
}

// fábricas: escolher se a produção sai em dinheiro ou em droga (só os negócios com «drug» e só de quem os tem)
export function bizGoods(p, now, world, i, on) {
  if (!Number.isInteger(i) || !CFG.biz[i] || BIZ_DRUG[i] < 0) fail('NO_BIZ');
  begin(p, now, world, { allowBusy: true });
  if (!(p.biz[i].n > 0)) fail('NO_BIZ');
  if (on === true) p.biz[i].g = true; else delete p.biz[i].g;
  return { ok: true, i, on: on === true, d: BIZ_DRUG[i] };
}
// contratar o contabilista: paga-se uma vez e fica até ao fim da ronda
export function hireAccountant(p, now, world) {
  begin(p, now, world, { allowBusy: true });
  const A = CFG.accountant;
  if (p.acct) fail('ACCT_HAVE');
  if (level(p) < A.minLevel) fail('LOW_LEVEL', { need: A.minLevel });
  if (p.cash + p.bank < A.price) fail('NO_MONEY', { need: A.price, have: p.cash + p.bank });
  settleAllBiz(p, now);   // o que já se perdeu com o armazém cheio não volta: ele só guarda daqui para a frente
  pay(p, A.price);
  p.acct = true;
  return { ok: true, price: A.price };
}

// ---------- porto ----------

// v89: na escala nova, por nível (a escala antiga crescia 1,6× por degrau: no nível 60 eram 3 M€ por carregamento e o porto
// rendia 25 M€ por dia, mais do que tudo o resto junto). Agora: 1 000 € + 100 € por nível; um lugar a mais nos níveis 35 e 70.
export function portCap(p) { return up(CFG.port.capBase + CFG.port.capPerLevel * level(p), klass(p).cargoBp || 0); }   // v90: o contrabandista leva mais
export function portSlots(p) { return 1 + Math.floor(level(p) / CFG.port.slotsEvery); }

// cada carregamento tem a sua droga (para quem a quer receber em vez do dinheiro)
const SHIP_DRUG = CFG.port.ships.map((s) => CFG.drugs.findIndex((x) => x.id === s.drug));
// o barco de um contentor já enviado; os de antes de haver carregamentos (sem k) valem como o porta-contentores
const shipIdx = (c) => (Number.isInteger(c.k) && CFG.port.ships[c.k] ? c.k : CFG.port.legacy);
export function portSeizeBp(p, k = CFG.port.legacy) { return cut(CFG.port.ships[k].seizeBp, klass(p).seizeCutBp || 0); }
export function sendPort(p, now, world, k, amount, goods = false) {
  const S = Number.isInteger(k) ? CFG.port.ships[k] : undefined;
  if (!S) fail('NO_SHIP');
  begin(p, now, world);
  if (level(p) < S.level) fail('LOW_LEVEL', { need: S.level });
  if (!Number.isSafeInteger(amount) || amount < CFG.port.minAmount) fail('BAD_AMOUNT');
  if (amount > portCap(p)) fail('OVER_CAP', { cap: portCap(p) });
  if (p.port.length >= portSlots(p)) fail('NO_SLOT');
  if (goods === true && !p.wh[S.rg]) fail('NO_WH', { r: S.rg });   // em droga, o barco descarrega no armazém da região onde chega
  const readyAt = now + S.ms;
  if (readyAt > world.playEnd) fail('ROUND_ENDING');
  pay(p, amount);
  p.port.push(goods === true ? { k, amount, readyAt, d: SHIP_DRUG[k] } : { k, amount, readyAt });
  p.c.ports += 1;
  return { ok: true, k, readyAt };
}

// Um carregamento que chegou: ou a polícia o apreendeu, ou volta o que se enviou mais o lucro (em dinheiro ou em droga para o armazém).
// A sorte só se tira aqui, ao descarregar: até lá ninguém sabe o que vem lá dentro.
function landShip(p, c, rng, m) {
  const k = shipIdx(c);
  if (rng.chance(portSeizeBp(p, k))) return { k, amount: c.amount, got: 0, seized: true };
  const got = c.amount + Math.floor((c.amount * CFG.port.ships[k].gainBp) / 10000);
  if (c.d !== undefined) return { k, amount: c.amount, got, seized: false, ...toGoods(p, c.d, got, CFG.port.ships[k].rg, m) };   // veio em droga: entra no armazém da região
  const L = launder(p, got - c.amount);   // v89: o lucro é dinheiro do crime (paga lavagem, como os golpes)
  p.cash += c.amount + L.net;
  return { k, amount: c.amount, got: c.amount + L.net, ...(L.lav ? { lav: L.lav } : {}), seized: false };
}
// descarrega tudo o que já chegou, de uma vez
export function collectPort(p, now, world, rng, m) {
  begin(p, now, world, { allowBusy: true });
  const out = [];
  p.port = p.port.filter((c) => {
    if (c.readyAt > now) return true;
    out.push(landShip(p, c, rng, m));
    return false;
  });
  return { ok: true, items: out };
}
// Abre um só carregamento, o que chegou à hora `at` (é assim que o ecrã do porto o identifica: os carregamentos não têm número).
// left = quantos outros já chegaram e ficam por abrir.
export function openPort(p, now, world, rng, at, m) {
  begin(p, now, world, { allowBusy: true });
  const i = p.port.findIndex((c) => c.readyAt === at);
  if (i < 0) fail('NO_CARGO');
  if (p.port[i].readyAt > now) fail('SHIP_AT_SEA', { until: p.port[i].readyAt });
  const [c] = p.port.splice(i, 1);
  return { ok: true, item: landShip(p, c, rng, m), left: p.port.filter((x) => x.readyAt <= now).length };
}

// ---------- aeroporto ----------
// Um avião de cada vez. O resultado (chega ou é apreendido) só se sorteia quando o jogador vai buscar a carga, como no porto.
export function airCap(p) { return portCap(p); }
export function airBribe(amount) { return Math.ceil((amount * CFG.air.bribeBp) / 10000); }
export function airSeizeBp(p, r, bribe) {
  const bp = cut(CFG.air.routes[r].seizeBp, klass(p).seizeCutBp || 0);
  return bribe ? cut(bp, CFG.air.bribeCutBp) : bp;
}
export function airSend(p, now, world, r, amount, bribe) {
  const R = Number.isInteger(r) ? CFG.air.routes[r] : undefined;
  if (!R) fail('NO_ROUTE');
  begin(p, now, world);
  if (level(p) < R.level) fail('LOW_LEVEL', { need: R.level });
  if (p.air) fail('AIR_BUSY', { until: p.air.readyAt });
  if (!Number.isSafeInteger(amount) || amount < CFG.air.minAmount) fail('BAD_AMOUNT');
  if (amount > airCap(p)) fail('OVER_CAP', { cap: airCap(p) });
  const readyAt = now + R.ms;
  if (readyAt > world.playEnd) fail('ROUND_ENDING');
  const extra = bribe ? airBribe(amount) : 0;
  pay(p, amount + extra);
  p.air = { r, amount, bribe: !!bribe, t0: now, readyAt };
  return { ok: true, r, readyAt, paid: amount + extra, bribe: extra };
}
export function airCollect(p, now, world, rng, keep = false, m) {
  begin(p, now, world, { allowBusy: true });
  const f = p.air;
  if (!f) fail('NO_FLIGHT');
  if (f.readyAt > now) fail('AIR_FLYING', { until: f.readyAt });
  const R = CFG.air.routes[f.r];
  p.air = null;
  if (rng.chance(airSeizeBp(p, f.r, f.bribe))) return { ok: true, r: f.r, amount: f.amount, got: 0, seized: true, respect: 0 };
  let got = f.amount + Math.floor((f.amount * R.gainBp) / 10000), lav = 0;
  const goods = keep ? toGoods(p, CFG.drugs.findIndex((x) => x.id === R.drug), got, 'lx', m) : null;   // o avião aterra em Lisboa
  if (!goods) { const L = launder(p, got - f.amount); lav = L.lav; got = f.amount + L.net; p.cash += got; }   // v89: o lucro paga lavagem
  const col = colFind(p, rng, CFG.col.airBp, () => CFG.col.route[R.id]);   // v79: a lembrança da rota
  return { ok: true, r: f.r, amount: f.amount, got, lav, seized: false, respect: R.r, levelUp: addRespect(p, R.r, now), ...(goods || {}), ...(col ? { col } : {}) };
}

// ---------- mercadoria e casas do jogador (discoteca e bordel) ----------
export function wholesale(d) { return Math.max(1, Math.floor((CFG.drugs[d].price * CFG.goods.wholesaleBp) / 10000)); }
// v89: ao cêntimo (em euros a erva de 6 € ficava a 4 € em vez de 4,80 €: a carga em droga rendia 20% a mais)
export function wholesaleC(d) { return Math.max(1, Math.floor((CFG.drugs[d].price * CFG.goods.wholesaleBp) / 100)); }
export function dumpValue(d, n) { return Math.floor((n * wholesaleC(d) * CFG.goods.dumpBp) / 1000000); }
// troca dinheiro por unidades ao preço de grosso, no armazém da região onde a mercadoria chega (sem ele, no de Lisboa); o troco fica
// em dinheiro. O que não couber vende-se logo ao mercado da região (ao preço de lá, a empurrar o preço como qualquer venda).
function toGoods(p, d, cash, rg = 'lx', m) {
  const r = p.wh && p.wh[rg] ? rg : 'lx', wc = wholesaleC(d), units = Math.floor((cash * 100) / wc), rest = cash - Math.ceil((units * wc) / 100);
  const fit = Math.min(units, whFree(p, r)), over = units - fit;
  whStock(p, r)[d] += fit; heatAdd(p, r, Math.floor((fit * refC(d)) / 100));
  let overGot = 0;
  if (over > 0) {
    if (m && m.w) { const q = quoteC(m.w, r, d, over, -1, p.t); overGot = Math.floor(q.c / 100); trade(m.w, r, d, q.s1); }
    else overGot = dumpValue(d, over);
  }
  p.cash += rest + overGot;
  return { d, units: fit, rest, rg: r, over, overGot, v: Math.floor((units * refC(d)) / 100) };
}
const venueFloor = (kind) => (kind === 'club' ? CFG.goods.wholesaleBp : CFG.venue.girlBp);
// quanto sai por hora na discoteca (em dinheiro ao preço da cidade) e quanto cabe no caixa
export function clubRate(p) { const c = p.club, V = CFG.venue; return c ? Math.floor((V.club.perH[c.lvl - 1] * V.volBp[c.pi]) / 10000) : 0; }
const clubCap = (c) => CFG.venue.club.perH[c.lvl - 1] * (CFG.venue.tillMs / T.HOUR);
// Discoteca: os clientes da casa gastam por hora o que a casa aguenta e levam primeiro o mais barato que houver.
// A conta dá o mesmo quer se faça de uma vez ou aos bocados: o que não chegou para mais uma unidade fica guardado (rem).
const DRUGS_BY_PRICE = CFG.drugs.map((_, d) => d).sort((a, b) => CFG.drugs[a].price - CFG.drugs[b].price || a - b);
// Drogas que o dono tirou da venda: ficam na stash só para ele (tomar ou despachar). Nem os clientes da casa nem os outros jogadores as compram.
export const held = (p, d) => Array.isArray(p.hold) && p.hold.includes(d);
export function stockHold(p, now, world, d, on) {
  if (!Number.isInteger(d) || !CFG.drugs[d]) fail('NO_DRUG');
  begin(p, now, world, { allowBusy: true });
  settleClub(p, now);   // o que a casa já vendeu até agora fica vendido; a mudança só vale daqui para a frente
  const set = new Set(p.hold); if (on === true) set.add(d); else set.delete(d);
  p.hold = [...set].sort((a, b) => a - b);
  return { ok: true, d, on: on === true };
}
function settleClub(p, now) {
  const c = p.club; if (!c) return;
  if (now <= c.t) return;
  const V = CFG.venue, perH = clubRate(p), cap = clubCap(c);
  const tot = c.rem + perH * Math.min(now - c.t, 14 * T.DAY);   // em dinheiro × ms, ao preço da cidade
  const budget = Math.floor(tot / T.HOUR);
  let used = 0, left = false;
  for (const d of DRUGS_BY_PRICE) {
    if (!p.stock[d] || held(p, d)) continue;
    const price = CFG.drugs[d].price, unit = Math.max(1, Math.floor((price * V.prices[c.pi]) / 10000));
    const n = c.till >= cap ? 0 : Math.min(p.stock[d], Math.floor((budget - used) / price), Math.ceil((cap - c.till) / unit));
    if (n > 0) { p.stock[d] -= n; used += n * price; c.till += n * unit; }
    if (p.stock[d] > 0) { left = true; break; }   // enquanto houver da mais barata, as outras esperam
  }
  // o tempo sem mercadoria (ou com o caixa cheio) não se acumula
  c.rem = left && c.till < cap ? tot - used * T.HOUR : 0;
  c.t = now;
}
// Bordel: o que as putas rendem por hora ao dono, depois da parte delas. Ao preço da cidade é o perH da tabela.
export function broRate(p) {
  const b = p.bro, V = CFG.venue; if (!b) return 0;
  let base = 0; for (const i of b.girls) base += V.bro.perH[CFG.hookers.list[i].tier];
  return up(Math.floor((Math.floor((base * V.volBp[b.pi]) / 10000) * (V.prices[b.pi] - V.girlBp)) / (10000 - V.girlBp)), klass(p).broBp || 0);   // v90: o chulo
}
function settleBro(p, now) {
  const b = p.bro; if (!b) return;
  if (now <= b.t) return;
  const perH = broRate(p), cap = perH * (CFG.venue.tillMs / T.HOUR);
  if (perH > 0 && b.till < cap) {
    const tot = b.rem + perH * Math.min(now - b.t, CFG.venue.tillMs), add = Math.floor(tot / T.HOUR);
    b.rem = tot - add * T.HOUR; b.till = Math.min(cap, b.till + add);
    if (b.till >= cap) b.rem = 0;
  } else b.rem = 0;
  b.t = now;
}
// leitura sem alterar o estado (para os ecrãs e para a lista de casas)
export function venueView(p, now) {
  const ghost = { cls: p.cls, stock: p.stock.slice(), hold: Array.isArray(p.hold) ? p.hold.slice() : [], club: p.club ? { ...p.club } : null, bro: p.bro ? { ...p.bro, girls: p.bro.girls.slice() } : null };   // v90: a profissão conta (o chulo rende mais no bordel)
  for (const v of p.mv || []) if (v.at <= now && v.x !== 2 && v.b === 'lx') ghost.stock[v.d] += v.n;   // a mercadoria que já chegou a Lisboa entra antes (como no touch)
  settleClub(ghost, now); settleBro(ghost, now);
  return ghost;
}
// preço numa casa de outro jogador, em pontos sobre o preço da cidade: o do dono, com o desconto da gangue se forem da mesma.
// Nunca abaixo do custo.
export function venuePriceBp(owner, kind, buyer) {
  const v = owner[kind], V = CFG.venue;
  const bp = sameCrew(buyer, owner) ? cut(V.prices[v.pi], V.gdisc[v.gd]) : V.prices[v.pi];
  return Math.max(venueFloor(kind), bp);
}
export function clubPriceAt(owner, buyer, d) { return Math.max(1, Math.floor((CFG.drugs[d].price * venuePriceBp(owner, 'club', buyer)) / 10000)); }
export function broPriceAt(owner, buyer, i, now) { return Math.max(1, Math.floor((hookerPrice(buyer, i, now) * venuePriceBp(owner, 'bro', buyer)) / 10000)); }
const isVenue = (kind) => kind === 'club' || kind === 'bro';
export function venueBuy(p, now, world, kind) {
  if (!isVenue(kind)) fail('NO_VENUE');
  begin(p, now, world);
  const C = CFG.venue[kind], v = p[kind], next = v ? v.lvl : 0;
  if (next >= C.cost.length) fail('VENUE_MAX');
  pay(p, C.cost[next]);
  if (v) v.lvl += 1;
  else p[kind] = kind === 'club' ? { lvl: 1, till: 0, t: now, rem: 0, pi: 2, gd: 0 } : { lvl: 1, till: 0, t: now, rem: 0, pi: 2, gd: 0, girls: [] };
  return { ok: true, kind, lvl: p[kind].lvl, cost: C.cost[next], respect: C.resp[next], levelUp: addRespect(p, C.resp[next], now) };
}
export function venueSet(p, now, world, kind, pi, gd) {
  if (!isVenue(kind)) fail('NO_VENUE');
  begin(p, now, world, { allowBusy: true });
  const v = p[kind]; if (!v) fail('NO_VENUE');
  if (!Number.isInteger(pi) || pi < 0 || pi >= CFG.venue.prices.length || !Number.isInteger(gd) || gd < 0 || gd >= CFG.venue.gdisc.length) fail('BAD_AMOUNT');
  v.pi = pi; v.gd = gd;
  return { ok: true, kind, pi, gd };
}
export function venueCollect(p, now, world) {
  begin(p, now, world, { allowBusy: true });
  const club = p.club ? p.club.till : 0, bro = p.bro ? p.bro.till : 0;
  if (p.club) p.club.till = 0;
  if (p.bro) p.bro.till = 0;
  p.cash += club + bro;
  return { ok: true, club, bro };
}
// tomar do próprio armazém: já está paga, o resto é como na discoteca
export function stockUse(p, now, world, d) {
  const g = Number.isInteger(d) ? CFG.drugs[d] : undefined;
  if (!g) fail('NO_DRUG');
  begin(p, now, world);
  if (!(p.stock[d] > 0)) fail('NO_STOCK');
  canTake(p, g);
  p.stock[d] -= 1;
  return { ok: true, d, price: 0, ...take(p, g, now) };
}
// despachar o que está no armazém de Lisboa: vende-se ao mercado de Lisboa (com o mercado; sem ele, como antes, a 95% do grosso)
export function stockDump(p, now, world, d, n, m) {
  const g = Number.isInteger(d) ? CFG.drugs[d] : undefined;
  if (!g) fail('NO_DRUG');
  if (m && m.w && tradable(d)) return mktSell(p, now, world, m, 'lx', d, n);
  begin(p, now, world, { allowBusy: true });
  if (!Number.isSafeInteger(n) || n < 1 || n > p.stock[d]) fail('NO_STOCK');
  const got = dumpValue(d, n);
  p.stock[d] -= n; p.cash += got;
  return { ok: true, d, n, got };
}
// ---------- regiões, armazéns, mercado e transporte (passo 6, parte 2) ----------
// O armazém de Lisboa é o que já havia (o stock fica em p.stock); os outros compram-se, um por região, e guardam o stock em wh[r].s.
// O calor (h) está em centésimos de ponto (0 a 10 000 = 0 a 100); f é o que entrou ou saiu desde a última edição, em euros.
export const REG_IDS = CFG.regions.list.map((r) => r.id);
export const DRUG_JAIL = 200;
export const DIG_JAIL = 300;   // v85: jailTier de quem foi apanhado a escavar (300 + o sítio)   // jailTier de quem foi preso por droga pesada apreendida (a fiança é o advogado de CFG.wh)
const famOf = (d) => CFG.drugs[d].fam;
function whNew(r) { const w = { sp: 1, hd: 1, fr: 1, h: 0, f: 0 }; if (r !== 'lx') w.s = CFG.drugs.map(() => 0); return w; }
function whsNew() { return Object.fromEntries(REG().map((r) => [r, r === 'lx' ? whNew('lx') : null])); }
export const whStock = (p, r) => (r === 'lx' ? p.stock : p.wh[r] ? p.wh[r].s : null);
export const whCap = (p, r) => (p.wh[r] ? CFG.wh[r].sp[p.wh[r].sp - 1] : 0);
const sumOf = (a) => a.reduce((x, y) => x + y, 0);
// o espaço conta também com o que vem a caminho (e não foi apreendido): ao chegar, cabe sempre
export const whUsed = (p, r) => (p.wh[r] ? sumOf(whStock(p, r)) + p.mv.reduce((x, v) => x + (v.b === r && v.x !== 2 ? v.n : 0), 0) : 0);
export const whFree = (p, r) => Math.max(0, whCap(p, r) - whUsed(p, r));
const hideBp = (w) => CFG.wh.hideBp[w.hd - 1], frontBp = (w) => CFG.wh.frontBp[w.fr - 1];
export const whHidden = (p, r, d) => Math.floor((whStock(p, r)[d] * hideBp(p.wh[r])) / 10000);
// o que a polícia vê num armazém, em euros ao preço de grosso (a droga de bar não conta: não se trafica)
export function whVisEur(p, r) { const s = whStock(p, r); let c = 0; s.forEach((n, d) => { if (n > 0 && tradable(d)) c += (n - whHidden(p, r, d)) * refC(d); }); return Math.floor(c / 100); }
export const whStoredEur = (p) => Object.fromEntries(REG().map((r) => [r, p.wh && p.wh[r] ? whVisEur(p, r) : 0]));
function heatAdd(p, r, eur) {
  const w = p.wh && p.wh[r]; if (!w || !(eur > 0)) return;
  w.h = Math.min(10000, w.h + Math.floor((eur * 100 * (10000 - frontBp(w))) / (CFG.wh.heatEur * 10000))); w.f += eur;
}
function takeMoney(p, x) { const c = Math.min(p.cash, x); p.cash -= c; p.bank -= Math.min(p.bank, x - c); }
function jailAt(p, at) { const ms = CFG.wh.jailMin * T.MIN, until = at + ms; if (until > p.jailUntil) { p.jailUntil = until; p.jailTier = DRUG_JAIL; p.jailT0 = at; p.jf = 0; p.jsr = { t0: at, k: 'raid', id: null, b: ms, l: ms, av: 0, em: 0, ap: 0 }; } }

export function whBuy(p, now, world, r) {
  if (!REG().includes(r) || r === 'lx') fail('NO_REGION');
  begin(p, now, world, { allowBusy: true });
  if (p.wh[r]) fail('WH_OWNED');
  if (level(p) < CFG.wh.level) fail('LOW_LEVEL', { need: CFG.wh.level });
  pay(p, CFG.wh[r].price);
  p.wh[r] = whNew(r);
  return { ok: true, r, cost: CFG.wh[r].price };
}
const WH_UPS = ['sp', 'hd', 'fr'];
export function whUpCost(p, r, k) { const w = p.wh[r]; if (!w || w[k] >= 5) return null; return k === 'sp' ? CFG.wh[r].spCost[w[k]] : CFG.wh.upCost[w[k]]; }
export function whUp(p, now, world, r, k) {
  if (!REG().includes(r)) fail('NO_REGION');
  if (!WH_UPS.includes(k)) fail('NO_UPGRADE');
  begin(p, now, world, { allowBusy: true });
  if (!p.wh[r]) fail('NO_WH', { r });
  const cost = whUpCost(p, r, k);
  if (cost == null) fail('WH_MAX');
  pay(p, cost);
  p.wh[r][k] += 1;
  return { ok: true, r, k, lvl: p.wh[r][k], cost };
}

// ---------- v120: a estufa (erva feita à mão) ----------
const growDrug = () => CFG.drugs.findIndex((g) => g.id === CFG.grow.drug);
export const growN = (p, r) => (p.wh[r] ? CFG.grow.pots[p.wh[r].sp - 1] || CFG.grow.pots[0] : 0);
// os vasos de um armazém (cresce com o espaço; um vaso vazio é null). growPots devolve uma cópia; o estado só muda (growFix) depois
// de todas as verificações, para uma ação recusada não deixar nada mexido.
export function growPots(p, r) {
  const w = p.wh[r], g = w && Array.isArray(w.g) ? w.g : [];
  return Array.from({ length: growN(p, r) }, (_, i) => g[i] || null);
}
function growFix(p, r) { const w = p.wh[r]; w.g = growPots(p, r); return w.g; }
// em que ponto está uma planta, em pontos-base do crescimento (10 000 = madura)
export const growBp = (x, now) => Math.min(10000, Math.floor(((now - x.t0) * 10000) / CFG.grow.ms));
function growArgs(p, now, world, r, i) {
  if (!REG().includes(r)) fail('NO_REGION');
  begin(p, now, world, { allowBusy: true });
  if (!p.wh[r]) fail('NO_WH', { r });
  if (level(p) < CFG.grow.level) fail('LOW_LEVEL', { need: CFG.grow.level });
  if (!Number.isInteger(i) || i < 0 || i >= growN(p, r)) fail('NO_POT');
  return growPots(p, r)[i];
}
export function seedBuy(p, now, world, n) {
  if (!Number.isSafeInteger(n) || n < 1 || n > CFG.grow.seedsMax) fail('BAD_AMOUNT');
  begin(p, now, world, { allowBusy: true });
  if (level(p) < CFG.grow.level) fail('LOW_LEVEL', { need: CFG.grow.level });
  if (p.seeds + n > CFG.grow.seedsMax) fail('SEEDS_FULL', { n: CFG.grow.seedsMax - p.seeds });
  const cost = n * CFG.grow.seed;
  pay(p, cost);
  p.seeds += n;
  return { ok: true, n, cost, seeds: p.seeds };
}
export function growPlant(p, now, world, r, i) {
  if (growArgs(p, now, world, r, i)) fail('POT_BUSY');
  if (p.seeds < 1) fail('NO_SEEDS');
  p.seeds -= 1; growFix(p, r)[i] = { t0: now, pr: false };
  return { ok: true, r, i, seeds: p.seeds };
}
export function growPrune(p, now, world, r, i) {
  const x = growArgs(p, now, world, r, i);
  if (!x) fail('POT_EMPTY');
  if (x.pr) fail('PRUNED');
  const bp = growBp(x, now);
  if (bp < CFG.grow.pruneFrom || bp > CFG.grow.pruneTo) fail('NOT_PRUNE_TIME');
  growFix(p, r)[i].pr = true;
  return { ok: true, r, i };
}
export function growHarvest(p, now, world, r, i, rng) {
  const x = growArgs(p, now, world, r, i), G = CFG.grow;
  if (!x) fail('POT_EMPTY');
  if (growBp(x, now) < 10000) fail('NOT_READY', { at: x.t0 + G.ms });
  const v = rng.int(-G.yieldVarBp, G.yieldVarBp), grams = Math.max(1, Math.floor((G.yield * (10000 + (x.pr ? G.pruneBp : 0)) * (10000 + v)) / 1e8));
  if (grams > whFree(p, r)) fail('WH_FULL', { free: whFree(p, r) });
  const d = growDrug();
  whStock(p, r)[d] += grams; growFix(p, r)[i] = null;
  const eur = Math.floor((grams * refC(d)) / 100); heatAdd(p, r, eur);
  p.c.harv = (p.c.harv || 0) + 1;
  return { ok: true, r, i, d, grams, pruned: !!x.pr, v: eur };
}

// Mercado: compra-se e vende-se ao preço da região, que anda com cada ordem. Comprar pede o nível da família; vender o que já se
// tem, não. As vendas ao mercado não pagam lavagem, como o porto e o aeroporto. seen: o que o ecrã mostrou, em cêntimos (com
// 1% de folga, ou 1 €): se o preço mudou mais do que isso entretanto, não se faz.
function mktArgs(p, m, r, d, n) {
  if (!REG().includes(r)) fail('NO_REGION');
  if (!Number.isInteger(d) || !tradable(d)) fail('NO_DRUG');
  if (!Number.isSafeInteger(n) || n < 1 || n > 1e7) fail('BAD_AMOUNT');
  if (!m || !m.w) fail('NO_MARKET');
  worldUp(m.w);
}
const seenOk = (c, seen) => seen === undefined || Math.abs(c - seen) <= Math.max(100, Math.floor(seen / 100));
export function mktBuy(p, now, world, m, r, d, n, seen) {
  mktArgs(p, m, r, d, n);
  begin(p, now, world, { allowBusy: true });
  if (!p.wh[r]) fail('NO_WH', { r });
  const need = CFG.regions.famLevel[famOf(d)];
  if (level(p) < need) fail('LOW_LEVEL', { need });
  if (n > whFree(p, r)) fail('WH_FULL', { free: whFree(p, r) });
  const q = quoteC(m.w, r, d, n, 1, now), cost = Math.ceil(q.c / 100);
  if (!seenOk(q.c, seen)) fail('PRICE_CHANGED', { c: q.c });
  pay(p, cost);
  whStock(p, r)[d] += n; trade(m.w, r, d, q.s1);
  const v = Math.floor((n * refC(d)) / 100); heatAdd(p, r, v);
  return { ok: true, r, d, n, cost, v };
}
export function mktSell(p, now, world, m, r, d, n, seen) {
  mktArgs(p, m, r, d, n);
  begin(p, now, world, { allowBusy: true });
  if (!p.wh[r]) fail('NO_WH', { r });
  if (n > whStock(p, r)[d]) fail('NO_STOCK');
  const q = quoteC(m.w, r, d, n, -1, now), got = Math.floor(q.c / 100);
  if (!seenOk(q.c, seen)) fail('PRICE_CHANGED', { c: q.c });
  whStock(p, r)[d] -= n; trade(m.w, r, d, q.s1);
  p.cash += got;
  const v = Math.floor((n * refC(d)) / 100); heatAdd(p, r, v);
  return { ok: true, r, d, n, got, v };
}

// Transporte: 1 hora por salto. O caminho passa pelas regiões do meio (de Lisboa ao Algarve passa pelo Alentejo).
function mvPath(a, b) {
  const pa = regPos(a), pb = regPos(b);
  return CFG.regions.list.filter((g) => g.pos >= Math.min(pa, pb) && g.pos <= Math.max(pa, pb)).sort((x, y) => (pa < pb ? x.pos - y.pos : y.pos - x.pos)).map((g) => g.id);
}
export const mvHops = (a, b) => Math.abs(regPos(a) - regPos(b));
// risco de apreensão no caminho, em bp: em cada salto, a média da pressão das duas regiões a dividir por 10 (em %)
export function mvRiskBp(w, a, b) {
  const ids = mvPath(a, b); let bp = 0;
  for (let i = 1; i < ids.length; i++) bp += Math.round(((pressOf(w, ids[i - 1]) + pressOf(w, ids[i])) * 10) / 2);
  return Math.min(9500, bp);
}
export function mvSend(p, now, world, m, rng, a, b, d, n) {
  if (!REG().includes(a) || !REG().includes(b) || a === b) fail('NO_REGION');
  if (!Number.isInteger(d) || !tradable(d)) fail('NO_DRUG');
  if (!Number.isSafeInteger(n) || n < 1 || n > 1e7) fail('BAD_AMOUNT');
  if (!m || !m.w) fail('NO_MARKET');
  worldUp(m.w);
  begin(p, now, world, { allowBusy: true });
  if (!p.wh[a]) fail('NO_WH', { r: a });
  if (!p.wh[b]) fail('NO_WH', { r: b });
  if (n > whStock(p, a)[d]) fail('NO_STOCK');
  if (n > whFree(p, b)) fail('WH_FULL', { free: whFree(p, b) });
  if (p.mv.length >= CFG.mv.max) fail('MV_MAX');
  const risk = mvRiskBp(m.w, a, b), at = now + mvHops(a, b) * CFG.mv.hopMs;
  // a sorte tira-se já, mas só se sabe à chegada (o ecrã não a recebe)
  const x = rng.chance(risk) ? (famOf(d) === 'leve' ? 1 : 2) : 0;
  whStock(p, a)[d] -= n;
  const v = Math.floor((n * refC(d)) / 100); heatAdd(p, a, v);
  p.mv.push({ d, n, a, b, t0: now, at, risk, x });
  return { ok: true, a, b, d, n, at, risk, v };
}
// a mercadoria que já chegou entra no armazém. Se a polícia a apanhou: as leves pagam multa e seguem, as de festa ficam
// apreendidas, as pesadas ficam apreendidas e dão prisão (contada a partir da hora da chegada; quem chega tarde já a cumpriu).
function settleMoves(p, now) {
  if (!Array.isArray(p.mv) || !p.mv.length) return;
  const W = CFG.wh;
  p.mv = p.mv.filter((v) => {
    if (v.at > now) return true;
    const val = Math.floor((v.n * refC(v.d)) / 100); let fine = 0, jail = false;
    if (v.x === 2) {
      if (famOf(v.d) === 'pesada' && !(p.hospUntil > v.at)) { jailAt(p, v.at); jail = true; }
    } else {
      if (v.x === 1 && !(law('erva') && famOf(v.d) === 'leve')) { fine = Math.min(p.cash + p.bank, Math.floor((val * W.fineBp) / 10000)); takeMoney(p, fine); }
      if (p.wh[v.b]) { whStock(p, v.b)[v.d] += v.n; heatAdd(p, v.b, val); }
    }
    p.mvLog.push({ d: v.d, n: v.n, a: v.a, b: v.b, at: v.at, x: v.x, fine, jail, v: val });
    while (p.mvLog.length > CFG.mv.log) p.mvLog.shift();
    return false;
  });
}
// Numa edição, em cada armazém: a rusga (com a pressão de agora e o calor que o armazém juntou) e depois o calor desce ou fica.
// Corre para todos, também para quem está fora do jogo. Devolve as rusgas que houve.
export function whEdition(p, m, at, rng) {
  if (!p.wh || !m || !m.w) return [];
  const W = CFG.wh, out = [];
  for (const r of REG()) {
    const w = p.wh[r]; if (!w) continue;
    const press = pressOf(m.w, r);
    if (press >= W.raidMin && w.h > 0 && whVisEur(p, r) > 0) {
      const bp = Math.floor((W.raidBp * press * w.h) / (100 * 10000));
      if (rng.chance(bp)) out.push(raid(p, r, at, bp));
    }
    const floor = Math.min(10000, Math.floor((whVisEur(p, r) * 100 * (10000 - frontBp(w))) / (W.floorEur * 10000)));
    w.h = w.f > 0 ? Math.max(w.h, floor) : Math.max(floor, w.h - W.coolPerEd * 100);
    w.f = 0;
  }
  return out;
}
export const raidBp = (p, w, r) => { const x = p.wh[r], press = pressOf(w, r); return !x || press < CFG.wh.raidMin ? 0 : Math.floor((CFG.wh.raidBp * press * x.h) / (100 * 10000)); };
// a rusga: multa de 10% do que está à vista; leva metade do que está à vista da droga de festa e das pesadas (as leves só dão multa)
function raid(p, r, at, bp) {
  const W = CFG.wh, w = p.wh[r], s = whStock(p, r), took = [];
  let vis = 0, seized = 0, heavy = false;
  s.forEach((n, d) => {
    if (!(n > 0) || !tradable(d)) return;
    const v = n - whHidden(p, r, d);
    if (famOf(d) === 'leve' && law('erva')) return;   // v76: legalizada, nem conta para a multa
    vis += v * refC(d);
    if (famOf(d) === 'leve' || v <= 0) return;
    const k = Math.floor((v * W.takeBp) / 10000); if (k <= 0) return;
    s[d] -= k; seized += k * refC(d); took.push([d, k]); if (famOf(d) === 'pesada') heavy = true;
  });
  const fine = Math.min(p.cash + p.bank, Math.floor((Math.floor(vis / 100) * W.fineBp) / 10000));
  takeMoney(p, fine);
  const jail = heavy && !(p.hospUntil > at);
  if (jail) jailAt(p, at);
  w.h = 0; w.f = 0;
  const x = { r, at, bp, took, v: Math.floor(seized / 100), fine, jail };
  p.rz.push(x); while (p.rz.length > W.log) p.rz.shift();
  return x;
}
// o que o ecrã mostra dos armazéns e da mercadoria a caminho (sem o desfecho, que só se sabe à chegada)
export function whView(p) {
  return Object.fromEntries(REG().map((r) => {
    const w = p.wh[r]; if (!w) return [r, null];
    return [r, { sp: w.sp, hd: w.hd, fr: w.fr, heat: Math.round(w.h / 100), cap: whCap(p, r), used: whUsed(p, r), s: r === 'lx' ? null : w.s.slice(), vis: whVisEur(p, r),
      hide: hideBp(w), front: frontBp(w), up: Object.fromEntries(WH_UPS.map((k) => [k, whUpCost(p, r, k)])),
      g: growPots(p, r).map((x) => (x ? { t0: x.t0, pr: !!x.pr } : null)) }];   // v120: os vasos da estufa
  }));
}
export const mvView = (p) => p.mv.map(({ d, n, a, b, t0, at, risk }) => ({ d, n, a, b, t0, at, risk }));

export function broHire(p, now, world, i) {
  const g = Number.isInteger(i) ? CFG.hookers.list[i] : undefined;
  if (!g) fail('NO_HOOKER');
  begin(p, now, world);
  const b = p.bro; if (!b) fail('NO_VENUE');
  if (b.girls.length >= CFG.venue.bro.rooms[b.lvl - 1]) fail('NO_ROOMS');   // (era NO_ROOM, o mesmo código do inventário cheio: o aviso saía trocado)
  const cost = CFG.venue.bro.hire[g.tier];
  pay(p, cost);
  b.girls.push(i);
  return { ok: true, i, cost };
}
export function broFire(p, now, world, slot) {
  begin(p, now, world, { allowBusy: true });
  const b = p.bro; if (!b) fail('NO_VENUE');
  if (!Number.isInteger(slot) || slot < 0 || slot >= b.girls.length) fail('NO_HOOKER');
  const [i] = b.girls.splice(slot, 1);
  return { ok: true, i };
}
// comprar na discoteca de outro jogador: paga-se ao dono, a droga sai do armazém dele e toma-se logo.
// price é o preço que o comprador viu: se o dono mudou entretanto, a compra não se faz.
export function clubBuyAt(buyer, owner, now, world, d, seen) {
  const g = Number.isInteger(d) ? CFG.drugs[d] : undefined;
  if (!g) fail('NO_DRUG');
  begin(buyer, now, world);
  if (buyer === owner || buyer.id === owner.id) fail('SELF');
  touch(owner, now);
  if (!owner.club) fail('NO_VENUE');
  if (!(owner.stock[d] > 0) || held(owner, d)) fail('NO_STOCK');
  canTake(buyer, g);
  const price = clubPriceAt(owner, buyer, d);
  if (seen !== undefined && price > seen) fail('PRICE_CHANGED', { price });
  pay(buyer, price);
  owner.stock[d] -= 1; owner.club.till += price;
  return { ok: true, d, price, ...take(buyer, g, now) };
}
// ir ao bordel de outro jogador: o teu preço da cidade para essa puta, vezes o preço do dono. A parte dela (80% do preço da cidade) não vai para o dono.
export function broVisitAt(buyer, owner, now, world, slot, rng, seen) {
  begin(buyer, now, world);
  if (buyer === owner || buyer.id === owner.id) fail('SELF');
  touch(owner, now);
  const b = owner.bro; if (!b) fail('NO_VENUE');
  const i = Number.isInteger(slot) ? b.girls[slot] : undefined;
  if (i === undefined) fail('NO_HOOKER');
  if (buyer.sick) fail('SICK');
  if (buyer.energy >= energyMax(buyer)) fail('ENERGY_FULL');
  const base = hookerPrice(buyer, i, now), price = broPriceAt(owner, buyer, i, now);
  if (seen !== undefined && price > seen) fail('PRICE_CHANGED', { price });
  pay(buyer, price);
  const house = Math.max(0, price - Math.floor((base * CFG.venue.girlBp) / 10000));
  b.till += house;
  return { ok: true, i, price, house, ...doVisit(buyer, i, now, rng, base) };
}

// ---------- bolsa ----------
// O mercado (preços em cêntimos e a «geração» de cada empresa, que sobe quando vai à falência) vive no servidor e é igual para todos.
// Um passo do preço: sobe ou desce o mesmo com a mesma hipótese, por isso a média do preço seguinte é exatamente o preço de agora.
export function stockStep(price, volBp, rng) {
  const mag = pickW(rng, CFG.stocks.steps), delta = Math.floor((price * mag * volBp) / 10000 + 0.5);
  return rng.int(0, 1) ? price + delta : price - delta;
}
export function stockBustAt(k) { return Math.floor((CFG.stocks.list[k].base * CFG.stocks.bustBp) / 10000); }
export function newMarket() { return { tick: 0, prices: CFG.stocks.list.map((x) => x.base), gen: CFG.stocks.list.map(() => 0), busts: [] }; }
// avança um passo todas as empresas; devolve as que foram à falência neste passo (voltam ao preço de estreia com outra geração)
export function marketTick(m, rng) {
  const bust = [];
  for (let k = 0; k < CFG.stocks.list.length; k++) {
    const next = stockStep(m.prices[k], CFG.stocks.list[k].vol, rng);
    if (next < stockBustAt(k)) { m.prices[k] = CFG.stocks.list[k].base; m.gen[k] += 1; bust.push(k); } else m.prices[k] = next;
  }
  m.tick += 1;
  return bust;
}
export function stockCap(p) { return casinoMax(p) * CFG.stocks.capMult; }
// o que o jogador tem de uma empresa: se ela faliu desde a compra, não tem nada
function holding(p, m, k) { const h = p.stk[k]; return h.gen === m.gen[k] ? h : { n: 0, cost: 0, gen: m.gen[k] }; }
const stkLim = (h) => ({ ...(h.tp ? { tp: h.tp } : {}), ...(h.sl ? { sl: h.sl } : {}) });
export function stockView(p, m) { return CFG.stocks.list.map((_, k) => { const h = holding(p, m, k); return { n: h.n, cost: h.cost, value: Math.floor((h.n * m.prices[k]) / 100), tp: h.tp || 0, sl: h.sl || 0 }; }); }
const stockFee = (gross) => Math.ceil((gross * CFG.stocks.feeBp) / 10000);
// o preço a que uma ordem de n ações se faz: o de agora, empurrado pelo tamanho da ordem (side 1 compra, −1 vende)
export function execPrice(m, k, n, side) {
  const p = m.prices[k], imp = impactBp(m, k, Math.floor((n * p) / 100));
  return side > 0 ? Math.ceil((p * (10000 + imp)) / 10000) : Math.max(1, Math.floor((p * (10000 - imp)) / 10000));
}
export function stockQuote(m, k, n) { const gross = Math.ceil((n * execPrice(m, k, n, 1)) / 100); return gross + stockFee(gross); }   // o que custa comprar n ações agora
function stockArgs(m, k, n, seen) {
  if (!Number.isInteger(k) || !CFG.stocks.list[k]) fail('NO_STOCK_CO');
  if (!Number.isSafeInteger(n) || n < 1 || n > 1e9) fail('BAD_AMOUNT');
  if (!m || !Array.isArray(m.prices) || !Number.isSafeInteger(m.prices[k]) || m.prices[k] < 1) fail('NO_MARKET');
  if (seen !== undefined && seen !== m.prices[k]) fail('PRICE_CHANGED', { price: m.prices[k] });   // compra-se e vende-se só ao preço que se viu
}
export function stockBuy(p, now, world, m, k, n, seen) {
  stockArgs(m, k, n, seen);
  begin(p, now, world, { allowBusy: true });
  const ex = execPrice(m, k, n, 1), total = Math.ceil((n * ex) / 100) + stockFee(Math.ceil((n * ex) / 100));
  const invested = CFG.stocks.list.reduce((s, _, j) => s + holding(p, m, j).cost, 0);
  if (invested + total > stockCap(p)) fail('STOCK_CAP', { cap: stockCap(p) });
  pay(p, total);
  const h = holding(p, m, k);
  p.stk[k] = { n: h.n + n, cost: h.cost + total, gen: m.gen[k], ...stkLim(h) };
  m.prices[k] = ex;   // a compra empurra o preço (no mercado novo); compra-se já ao preço empurrado
  return { ok: true, k, n, price: ex, paid: total, fee: stockFee(Math.ceil((n * ex) / 100)) };
}
export function stockSell(p, now, world, m, k, n, seen) {
  stockArgs(m, k, n, seen);
  begin(p, now, world, { allowBusy: true });
  const h = holding(p, m, k);
  if (n > h.n) fail('NO_SHARES');
  const ex = execPrice(m, k, n, -1), gross = Math.floor((n * ex) / 100), fee = Math.min(gross, stockFee(gross)), got = gross - fee;
  const part = n === h.n ? h.cost : Math.floor((h.cost * n) / h.n);   // parte do que se pagou que corresponde ao que se vende
  p.stk[k] = { n: h.n - n, cost: h.cost - part, gen: m.gen[k], ...(n < h.n ? stkLim(h) : {}) };
  p.cash += got;
  m.prices[k] = ex;
  return { ok: true, k, n, price: ex, got, fee, profit: got - part };
}
// Limites de venda de uma posição: alvo de lucro (tp) e travão de perda (sl), em cêntimos por ação; 0 = sem limite.
// Não dão vantagem nenhuma: a venda faz-se ao preço do passo em que o limite é tocado (nunca ao preço pedido) e paga a comissão normal.
// Se a empresa falir num só passo antes de o travão ser tocado, perde-se tudo na mesma.
export function stockLimit(p, now, world, m, k, tp, sl) {
  if (!Number.isInteger(k) || !CFG.stocks.list[k]) fail('NO_STOCK_CO');
  if (!m || !Array.isArray(m.prices) || !Number.isSafeInteger(m.prices[k]) || m.prices[k] < 1) fail('NO_MARKET');
  if (!Number.isSafeInteger(tp) || tp < 0 || tp > 1e12 || !Number.isSafeInteger(sl) || sl < 0 || sl > 1e12) fail('BAD_AMOUNT');
  begin(p, now, world, { allowBusy: true });
  const h = holding(p, m, k), price = m.prices[k];
  if (!(h.n > 0)) fail('NO_SHARES');
  if ((tp && tp <= price) || (sl && sl >= price)) fail('BAD_LIMIT', { price });   // tem de ficar de fora do preço de agora, senão vendia já
  p.stk[k] = { n: h.n, cost: h.cost, gen: h.gen, ...stkLim({ tp, sl }) };
  return { ok: true, k, tp, sl };
}
// corre a seguir a cada passo da bolsa, para toda a gente (mesmo fora do jogo): vende por inteiro as posições cujo limite foi tocado
export function stockAuto(p, m) {
  const out = [];
  for (let k = 0; k < CFG.stocks.list.length; k++) {
    const h = holding(p, m, k), price = m.prices[k];
    if (!(h.n > 0) || !(h.tp || h.sl)) continue;
    const why = h.tp && price >= h.tp ? 'tp' : h.sl && price <= h.sl ? 'sl' : null;
    if (!why) continue;
    const ex = execPrice(m, k, h.n, -1), gross = Math.floor((h.n * ex) / 100), fee = Math.min(gross, stockFee(gross)), got = gross - fee;
    p.stk[k] = { n: 0, cost: 0, gen: m.gen[k] };
    p.cash += got;
    m.prices[k] = ex;
    out.push({ k, n: h.n, price: ex, got, fee, profit: got - h.cost, why });
  }
  return out;
}

// ---------- banco ----------

export function bankFeeBp(p) { return cut(CFG.bank.feeBp, klass(p).feeCutBp || 0); }
export function deposit(p, now, world, amount) {
  begin(p, now, world, { allowBusy: true });
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > p.cash) fail('BAD_AMOUNT');
  const fee = Math.ceil((amount * bankFeeBp(p)) / 10000);
  p.cash -= amount;
  p.bank += amount - fee;
  return { ok: true, fee };
}

export function withdraw(p, now, world, amount) {
  begin(p, now, world, { allowBusy: true });
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > p.bank) fail('BAD_AMOUNT');
  p.bank -= amount;
  p.cash += amount;
  return { ok: true };
}

// ---------- luxos ----------

// pela ordem da lista; cada um dá uma vez a raiz quadrada do preço em respeito
export function luxuryPrice(p) { const x = CFG.luxury.list[p.luxuries]; return x ? x.price + luxTax(x.price) : null; }
export const luxuryRespect = (price) => Math.floor(Math.sqrt(price));
export function buyLuxury(p, now, world) {
  begin(p, now, world);
  const price = luxuryPrice(p);
  if (price === null) fail('LUXURY_MAX');
  const base = CFG.luxury.list[p.luxuries].price;
  pay(p, price);
  p.luxuries += 1;
  const resp = luxuryRespect(base);   // o respeito é o do luxo, não o do imposto
  const lvl = addRespect(p, resp, now);
  return { ok: true, price, tax: price - base, respect: resp, levelUp: lvl };
}

// ---------- armas e proteções ----------

const GEAR = { guard: 'guards', tool: 'tools', gweapon: 'gweapons' };
export function buyGear(p, now, world, kind, idx) {
  // quem tem o jogo aberto na versão antiga ainda pede «weapon»/«armor» por índice: passa para a compra nova
  if (kind === 'weapon' && W57[idx]) return buyItem(p, now, world, W57[idx]);
  if (kind === 'armor' && A57[idx]) return buyItem(p, now, world, A57[idx]);
  if (kind === 'tool') { const id = T58[idx]; if (!id) fail('NO_GEAR'); return buyItem(p, now, world, id); }   // as ferramentas viraram material (passo 5)
  if (typeof kind !== 'string' || !Object.hasOwn(GEAR, kind)) fail('NO_GEAR');
  const list = CFG[GEAR[kind]];
  if (!Number.isInteger(idx) || !list[idx]) fail('NO_GEAR');
  begin(p, now, world);
  if (idx <= p[kind]) fail('ALREADY_BETTER');
  if (idx !== p[kind] + 1) fail('GEAR_ORDER');   // por ordem, uma de cada vez: saltar ficava mais barato e só o ecrã é que o impedia
  if (level(p) < (list[idx].level || 1)) fail('LOW_LEVEL', { need: list[idx].level });
  pay(p, list[idx].price);
  p[kind] = idx;
  return { ok: true, price: list[idx].price };
}

const gearBp = (list, idx) => (idx >= 0 ? list[idx].bp : 0);
// ataque: a melhor arma de fogo que não esteja estragada (mão ou principal), 30% da outra se também disparar (v87), mais a arma
// branca; defesa: as peças do corpo todas
// v97: cada arma vale o que é mais o que os acessórios montados lhe somam (ataque, precisão, alcance, crítico, balas, silêncio)
export const modOf = (id) => { const g = gearOf(id); return g && g.slot === 'mod' ? g : undefined; };
export function wStat(it) {
  const g = gearOf(it.id) || {}, ms = (Array.isArray(it.m) ? it.m : []).map(modOf).filter(Boolean);
  const sum = (k) => ms.reduce((a, m) => a + (m[k] || 0), 0);
  return { atk: up(g.atk || 0, sum('dmg')), acc: clamp((g.acc || 50) + sum('acc'), 0, 100), rng: (g.rng || 1) + sum('rng'), crit: sum('crit'), ammo: sum('ammo'), bust: sum('bust') };
}
// v101: lá fora, quem deixou as armas no cacifo luta à mão
// (a alugada ao armeiro de lá conta como mais uma: de fogo, ou branca se for melhor do que a que se tem)
const armedOff = (p) => !!(p.tr && !p.tr.arm);
const rented = (p) => (p.tr && p.tr.gun && p.tr.st === 'there' ? { id: p.tr.gun, u: 1 } : null);
const firesOf = (p) => [...(armedOff(p) ? [] : ['mao', 'principal'].map((s) => p.eq[s]).filter((x) => x && x.u > 0)), ...[rented(p)].filter((x) => x && gearOf(x.id).gun)];
const meleeOf = (p) => { const L = [armedOff(p) ? null : p.eq.branca, rented(p) && !gearOf(rented(p).id).gun ? rented(p) : null].filter(Boolean); return L.sort((a, b) => wStat(b).atk - wStat(a).atk)[0] || null; };
export function atkBp(p) {
  const fire = firesOf(p).map((x) => wStat(x).atk).sort((a, b) => b - a), br = meleeOf(p);
  return (fire[0] || 0) + (fire[1] ? Math.floor((fire[1] * CFG.gunSideBp) / 10000) : 0) + (br ? wStat(br).atk : 0);
}
// a arma com que se luta: a de fogo mais forte que ainda dispara; senão a branca; senão os punhos (precisão 50, alcance 1 m)
export function mainWeapon(p) {
  const fire = firesOf(p).sort((a, b) => wStat(b).atk - wStat(a).atk);
  return fire[0] || meleeOf(p) || null;
}
export function fightAccBp(p) { const W = CFG.wfight, w = mainWeapon(p), acc = w ? wStat(w).acc : 50; return clamp((acc - 50) * W.accBp, -W.accMax, W.accMax); }
export const fightRng = (p) => { const w = mainWeapon(p); return w ? wStat(w).rng : 1; };
export function defBp(p) { return ['cabeca', 'tronco', 'pernas', 'pes', 'maos'].reduce((s, k) => s + (p.eq[k] ? gearOf(p.eq[k].id).def : 0), 0); }
export function attackPower(p, now) { return up(Math.floor((effStat(p, 'F', now) * (10000 + atkBp(p))) / 10000), (klass(p).atkBp || 0) + gbp(p, 'atk') + studyBp(p, 'atk')); }   // v81: boxe, krav maga
export function defensePower(p, now) { return up(Math.floor((effStat(p, 'T', now) * (10000 + defBp(p))) / 10000), (klass(p).defBp || 0) + huBp(p, 1) + gbp(p, 'def') + empBp(p, 'def') + gearBp(CFG.guards, p.guard) + studyBp(p, 'def')); }   // v81: jiu-jitsu, krav maga

// ---------- inventário (passo 4) ----------
// espaços: os da casa, mais os da mochila. Ocupam espaço as pilhas do inventário (um tipo de objeto cada; as armas e peças
// guardadas uma cada) e a droga para vender na rua (um espaço por tipo). O que está no corpo não ocupa.
export function invCap(p) { const a = p.eq && p.eq.acess ? gearOf(p.eq.acess.id) : null; return CFG.house.tiers[p.house].slots + (a && a.room ? a.room : 0); }
export function invUsed(p) { return p.inv.length + p.dst.filter((g) => g > 0).length; }
const roomFor = (p) => invUsed(p) < invCap(p);
const stackable = (id) => id === 'balas' || CFG.loot.goods.includes(id);
function addGood(p, id, v) {
  const s = p.inv.find((x) => x.id === id);
  if (s) { s.n += 1; s.v += v; return true; }
  if (!roomFor(p)) return false;
  p.inv.push({ id, n: 1, v }); return true;
}
function takeInv(p, id, n) {
  const i = p.inv.findIndex((x) => x.id === id);
  p.inv[i].n -= n;
  if (p.inv[i].n <= 0) p.inv.splice(i, 1);
}
// comprar: balas (às caixas) ou uma peça de equipamento. A peça vai logo para o corpo; a que lá estava passa para o inventário.
// v76: com o porte de arma, as armas (mão, principal e branca) ficam 15% mais baratas
export const gearPrice = (g, now) => cut(gearPriceLaw(g), now !== undefined ? evBp('shop', now) : 0);   // v117: o Black Friday
const gearPriceLaw = (g) => (law('armas') && ['mao', 'principal', 'branca'].includes(g.slot) ? Math.ceil((g.price * CFG.gov.laws.armas.priceBp) / 10000) : g.price);
export function buyItem(p, now, world, id, n = 1) {
  if (id === 'balas') {
    if (!Number.isSafeInteger(n) || n < 1 || n > 100) fail('BAD_AMOUNT');
    begin(p, now, world, { allowBusy: true });
    const s = p.inv.find((x) => x.id === 'balas');
    if (!s && !roomFor(p)) fail('NO_ROOM');
    const price = n * CFG.bullets.price;
    pay(p, price);
    if (s) s.n += n * CFG.bullets.box; else p.inv.push({ id: 'balas', n: n * CFG.bullets.box });
    return { ok: true, id, price, n: n * CFG.bullets.box };
  }
  const g = typeof id === 'string' ? gearOf(id) : undefined;
  if (!g) fail('NO_GEAR');
  if (g.craft) fail('CRAFT_ONLY');   // v83: a broca e os explosivos fazem-se na cave
  begin(p, now, world, { allowBusy: true });
  if (level(p) < (g.level || 1)) fail('LOW_LEVEL', { need: g.level });
  if (g.slot === 'mod') {   // v97: acessório de arma: vai para o inventário (podem ser vários iguais), monta-se depois
    if (!roomFor(p)) fail('NO_ROOM');
    const price = gearPrice(g, now);
    pay(p, price);
    p.inv.push({ id });
    return { ok: true, id, price, slot: 'mod', swapped: null };
  }
  if (g.slot === 'mat') {   // material dos golpes grandes: um de cada (as ferramentas não se gastam), guardado no inventário
    if (p.inv.some((x) => x.id === id)) fail('HAVE_IT');
    if (p.cf && p.cf.id === id) fail('ON_BENCH');   // v83: já está a ser feito na cave
    if (!roomFor(p)) fail('NO_ROOM');
    pay(p, g.price);
    p.inv.push({ id });
    return { ok: true, id, price: g.price, slot: 'mat', swapped: null };
  }
  const old = p.eq[g.slot];
  if (old && !roomFor(p)) fail('NO_ROOM');   // a que estava no corpo tem de caber no inventário
  const price = gearPrice(g, now);
  pay(p, price);
  if (old) p.inv.push(old);
  p.eq[g.slot] = itemNew(id);
  return { ok: true, id, price, slot: g.slot, swapped: old ? old.id : null };
}
// vestir/usar uma peça do inventário: troca com a que está no corpo (que fica no lugar dela)
export function equip(p, now, world, i) {
  const it = Number.isInteger(i) ? p.inv[i] : undefined;
  const g = it ? gearOf(it.id) : undefined;
  if (!g) fail('NO_GEAR');
  if (g.slot === 'mat' || g.slot === 'mod') fail('NOT_WEARABLE');
  begin(p, now, world, { allowBusy: true, trOk: 2 });
  if (g.level && level(p) < g.level) fail('LOW_LEVEL', { need: g.level });   // v87: o nível conta também para o que vem da feira
  const old = p.eq[g.slot];
  p.eq[g.slot] = it;
  if (old) p.inv[i] = old; else p.inv.splice(i, 1);
  return { ok: true, id: it.id, slot: g.slot, swapped: old ? old.id : null };
}
// v93: tirar uma peça do corpo para o inventário (o boneco: arrastar para fora da slot). Precisa de um espaço livre; a mochila
// só sai se o que está guardado continuar a caber sem os espaços que ela dá.
export function unequip(p, now, world, slot) {
  if (!CFG.slots.includes(slot) || !p.eq[slot] || !p.eq[slot].id) fail('NO_GEAR');
  begin(p, now, world, { allowBusy: true, trOk: 2 });
  const it = p.eq[slot], g = gearOf(it.id), room = slot === 'acess' && g && g.room ? g.room : 0;
  if (invUsed(p) + 1 > invCap(p) - room) fail('NO_ROOM');
  p.eq[slot] = null;
  p.inv.push(it);
  return { ok: true, id: it.id, slot };
}
// v97: montar um acessório do inventário (i) na arma vestida nesse espaço; tirá-lo (k = qual) de volta para o inventário
const W_SLOTS = ['branca', 'mao', 'principal'];
export function modFit(p, now, world, slot, i) {
  if (!W_SLOTS.includes(slot)) fail('NO_GEAR');
  const it = p.eq[slot], m = Number.isInteger(i) && p.inv[i] ? modOf(p.inv[i].id) : undefined;
  if (!m) fail('NO_MOD');
  if (!it) fail('NO_GEAR');
  begin(p, now, world, { allowBusy: true });
  const g = gearOf(it.id), on = Array.isArray(it.m) ? it.m : [];
  if (level(p) < (m.level || 1)) fail('LOW_LEVEL', { need: m.level });
  if (!m.fits.includes(g.t)) fail('MOD_NO_FIT');
  if (on.length >= (g.ms || 0)) fail('MOD_FULL');
  if (on.some((x) => modOf(x) && modOf(x).cat === m.cat)) fail('MOD_SAME');
  p.inv.splice(i, 1);
  it.m = [...on, m.id];
  return { ok: true, id: m.id, slot, weapon: it.id };
}
export function modTake(p, now, world, slot, k) {
  if (!W_SLOTS.includes(slot)) fail('NO_GEAR');
  const it = p.eq[slot];
  if (!it || !Array.isArray(it.m) || !Number.isInteger(k) || !it.m[k]) fail('NO_MOD');
  begin(p, now, world, { allowBusy: true });
  if (!roomFor(p)) fail('NO_ROOM');
  const id = it.m[k];
  it.m = it.m.filter((_, j) => j !== k); if (!it.m.length) delete it.m;
  p.inv.push({ id });
  return { ok: true, id, slot, weapon: it.id };
}
// recetador: um objeto roubado pelo valor que tem, uma peça de equipamento por metade (e pelo estado em que está), balas por metade
export function sellItem(p, now, world, i) {
  const it = Number.isInteger(i) ? p.inv[i] : undefined;
  if (!it) fail('NO_ITEM');
  if (Array.isArray(it.m) && it.m.length) fail('HAS_MODS');   // v97: os acessórios tiram-se antes de vender a arma
  begin(p, now, world, { allowBusy: true });
  let money, lav = 0;
  if (CFG.loot.goods.includes(it.id)) ({ net: money, lav } = launder(p, it.v));
  else if (it.id === 'balas') money = Math.floor((it.n * CFG.bullets.price * CFG.loot.gearSellBp) / (CFG.bullets.box * 10000));
  else { const g = gearOf(it.id); money = up(Math.floor((g.price * CFG.loot.gearSellBp * (g.gun ? it.u / g.life : 1)) / 10000), klass(p).fenceBp || 0); }   // v90: o recetador
  p.inv.splice(i, 1);
  p.cash += money;
  return { ok: true, id: it.id, n: it.n || 1, money, lav };
}
export function sellGoods(p, now, world) {
  begin(p, now, world, { allowBusy: true });
  let money = 0, n = 0;
  p.inv = p.inv.filter((x) => { if (!CFG.loot.goods.includes(x.id)) return true; money += x.v; n += x.n; return false; });
  if (!n) fail('NOTHING_TO_SELL');
  const L = launder(p, money);
  p.cash += L.net;
  return { ok: true, money: L.net, n, lav: L.lav };
}
// reparar uma arma de fogo no corpo: paga-se a parte gasta do preço. v87: as que só se fazem na cave pagam sobre o dinheiro da
// receita (sobre o valor, reparar uma gasta custava o dobro de fazer outra)
const repairBase = (g) => (g.craft ? (CFG.craft.list.find((r) => r.id === g.id) || g).price : g.price);
export function repairCost(p, slot) { const it = p.eq[slot]; if (!it || !it.id) return 0; const g = gearOf(it.id); return g.gun ? Math.ceil((repairBase(g) * (g.life - it.u)) / g.life) : 0; }
// v83: com um kit de armeiro (feito na cave) a reparação não custa dinheiro
export function repair(p, now, world, slot, kit = false) {
  if (!['mao', 'principal'].includes(slot) || !p.eq[slot]) fail('NO_GEAR');
  begin(p, now, world, { allowBusy: true });
  const price = repairCost(p, slot);
  if (!price) fail('NOT_WORN');
  if (kit) { if (!((p.mt.kit || 0) >= 1)) fail('NO_MAT', { need: { kit: 1 } }); p.mt.kit -= 1; if (!p.mt.kit) delete p.mt.kit; }
  else pay(p, price);
  p.eq[slot].u = gearOf(p.eq[slot].id).life;
  return { ok: true, slot, price: kit ? 0 : price, kit: !!kit };
}

// ---------- golpes grandes (passo 5) ----------
// Um de cada vez. Paga-se à cabeça e prepara-se em tempo real; durante a preparação faz-se o reconhecimento, a equipa, o suborno
// e compra-se o material. Quando está pronto, avança-se: corre bem (a parte, respeito) ou mal (perde-se o custo, advogado, e às
// vezes prisão). O rasto decide quantas vezes se é apanhado.
const opOf = (i) => (Number.isInteger(i) ? CFG.ops[i] : undefined);
// lavagem: do dinheiro do crime, o que passa dos primeiros 100 000 € perde 20% nas fachadas (15% com a licenciatura).
// Devolve o que fica e quanto se perdeu; conta para o total de crime de cada um.
export function launder(p, gross) {
  const L = CFG.launder;
  if (!(gross > 0)) return { net: gross, lav: 0 };
  const free = Math.max(0, L.freeUpTo - p.ilegal), taxed = Math.max(0, gross - free);
  p.ilegal += gross;
  const lav = Math.floor((taxed * ((p.done.includes(L.course) ? L.courseBp : L.bp) + (law('branq') ? CFG.gov.laws.branq.addBp : 0))) / 10000);   // v76: lei do branqueamento
  return { net: gross - lav, lav };
}
const opCut = (o, bp, min = 0) => Math.max(min, Math.ceil((o.gain * bp) / 10000));
export function opStepCost(o, kind) {
  const S = CFG.opSteps;
  if (kind === 'recon') return opCut(o, S.reconBp, S.reconMin);
  if (kind === 'crew') return opCut(o, S.crewBp);
  if (kind === 'bribe') return o.cost > S.bribeFrom ? opCut(o, S.bribeBp) : 0;
  return 0;
}
// hipótese de correr bem, em bp: a da tabela, mais a equipa
export function opChanceBp(p, o, st = p.op, now) {
  const S = CFG.opSteps;
  return Math.min(S.maxBp, o.p + (st && st.crew ? S.crew : 0) + (now !== undefined ? evBp('ops', now) : 0));   // v117: o fogo de artifício
}
// rasto (0 a 100): o que fica para trás. Baixa com o reconhecimento, a skill da família (até −10), luvas calçadas, o curso de vigilante
// (onde há alarmes), o de motorista (onde há fuga de carro) e um contacto da prisão.
export function opRasto(p, o, st = p.op) {
  const S = CFG.opSteps;
  let r = o.rasto - (st && st.recon ? S.recon : 0) - Math.floor(skillBp(p, o.fam) / S.skillDiv) - (p.eq.maos && p.eq.maos.id === 'luvas' ? S.gloves : 0) - (st && st.contact ? S.contact : 0);
  if (o.alarm && p.done.includes(S.alarmCourse)) r -= S.alarm;
  if (o.drive && p.done.includes(S.driveCourse)) r -= S.drive;
  return Math.max(S.minRasto, r);
}
// o que falta para avançar: material no inventário e, nos golpes com arma, arma de fogo que dispare e as balas
export function opMissing(p, o) {
  const miss = o.mat.filter((id) => !p.inv.some((x) => x.id === id));
  if (o.gun) {
    const s = gunOf(p);
    if (!s) miss.push('gun'); else if (!(p.eq[s].u > 0)) miss.push('gunWorn');
    if (bulletsOf(p) < CFG.opSteps.bullets) miss.push('balas');
  }
  return miss;
}
export function opStart(p, now, world, i) {
  const o = opOf(i);
  if (!o) fail('NO_OP');
  begin(p, now, world, { allowBusy: true });
  if (level(p) < o.level) fail('LOW_LEVEL', { need: o.level });
  if (p.op) fail('OP_BUSY');
  if (p.opPause > now) fail('OP_PAUSE', { until: p.opPause });
  pay(p, o.cost);
  p.op = { i, t0: now, ready: now + o.prepH * T.HOUR, recon: false, crew: false, bribe: false, contact: false, paid: o.cost };
  if (p.contacts > 0) { p.contacts -= 1; p.op.contact = true; }   // um contacto da prisão vai logo para este golpe
  return { ok: true, i, price: o.cost, ready: p.op.ready };
}
export function opStep(p, now, world, kind) {
  if (!['recon', 'crew', 'bribe'].includes(kind)) fail('NO_STEP');
  begin(p, now, world, { allowBusy: true });
  if (!p.op) fail('NO_OP');
  const o = CFG.ops[p.op.i];
  if (p.op[kind]) fail('STEP_DONE');
  const price = opStepCost(o, kind);
  if (!price) fail('NO_STEP');   // suborno só nos golpes grandes a sério
  pay(p, price);
  p.op[kind] = true; p.op.paid += price;
  return { ok: true, kind, price, chanceBp: opChanceBp(p, o, p.op, now), rasto: opRasto(p, o) };
}
export function opDrop(p, now, world) {
  begin(p, now, world, { allowBusy: true });
  if (!p.op) fail('NO_OP');
  const lost = p.op.paid; p.op = null;
  return { ok: true, lost };
}
// v116: a sentença fica escrita (porquê, a pena da tabela, depois da lei, os cortes do advogado), para a folha do tribunal e o recurso
function jailFor(p, now, ms, tier, why) {
  const b = ms;
  if (law('penas')) ms = Math.floor((ms * CFG.gov.laws.penas.jailBp) / 10000);   // v76: penas pesadas
  const av = p.avenca && level(p) >= CFG.retainer.level ? CFG.retainer.jailCutBp : 0, em = empBp(p, 'jail');
  const cut = Math.min(9000, av + em);   // v111: advogados
  p.jailUntil = now + Math.max(T.MIN, Math.floor((ms * (10000 - cut)) / 10000)); p.jailTier = tier; p.jailT0 = now; p.jf = 0;
  p.jsr = { t0: now, k: (why && why.k) || 'crime', id: why && why.id != null ? why.id : null, b, l: ms, av, em, ap: 0 };
}
export { jailFor as jailForTest, jailAt as jailAtTest };
// v116: a sentença que o ecrã mostra (só a da pena de agora) e o recurso: uma vez por pena, paga custas (uma parte da fiança de agora),
// e se o juiz der razão tira metade do que falta. Perder não agrava a pena: fica tudo como estava, menos as custas.
const sentenceOn = (p, now) => p.jailUntil > now && p.jsr && typeof p.jsr === 'object' && p.jsr.t0 === p.jailT0;
export function appealFee(p, now) { return Math.max(CFG.appeal.feeMin, Math.ceil((bailCost(p, now) * CFG.appeal.feeBp) / 10000)); }
export function appealChance(p) {
  const A = CFG.appeal;
  return Math.min(A.maxBp, A.baseBp + (p.avenca && level(p) >= CFG.retainer.level ? A.avencaBp : 0) + studyBp(p, 'appeal'));
}
export function sentence(p, now) {
  if (!sentenceOn(p, now)) return null;
  const s = p.jsr;
  return { ...s, until: p.jailUntil, left: p.jailUntil - now, appeal: s.ap ? null : { fee: appealFee(p, now), chance: appealChance(p) } };
}
export function jailAppeal(p, now, world, rng) {
  begin(p, now, world, { allowBusy: true, jailOk: true }); inJail(p, now);
  if (!sentenceOn(p, now)) fail('NO_SENTENCE');
  const s = p.jsr, A = CFG.appeal;
  if (s.ap) fail('APPEALED');
  const fee = appealFee(p, now), chance = appealChance(p);
  pay(p, fee);
  const won = rng.chance(chance), cut = won ? Math.floor(((p.jailUntil - now) * A.cutBp) / 10000) : 0;
  p.jailUntil -= cut; s.ap = won ? 1 : 2; s.apt = now; s.apc = cut;
  return { ok: true, won, fee, chance, cut, jailUntil: p.jailUntil };
}
export function opGo(p, now, world, rng) {
  begin(p, now, world);
  if (!p.op) fail('NO_OP');
  const st = p.op, o = CFG.ops[st.i], S = CFG.opSteps;
  if (now < st.ready) fail('PREP_LEFT', { until: st.ready });
  const miss = opMissing(p, o);
  if (miss.length) fail('OP_MISSING', { miss });
  // material: as ferramentas ficam, os explosivos gastam-se; com arma, gastam-se balas e um uso
  for (const id of o.mat) if (gearOf(id).once) p.inv.splice(p.inv.findIndex((x) => x.id === id), 1);
  if (o.gun) { const s = gunOf(p); takeInv(p, 'balas', S.bullets); p.eq[s].u -= 1; }
  const bp = opChanceBp(p, o, st, now), rasto = opRasto(p, o, st);
  p.op = null; p.opPause = now + o.pauseH * T.HOUR;
  p.sk[o.fam] += S.practice;
  p.c.ops = (p.c.ops || 0) + 1;
  const covered = p.avenca && level(p) >= CFG.retainer.level;
  if (rng.chance(bp)) {
    const L = launder(p, o.gain);
    p.cash += L.net;
    p.c.opsWon = (p.c.opsWon || 0) + 1;
    const resp = Math.round(S.respK * Math.sqrt(o.gain)), lvl = addRespect(p, resp, now);
    // a Judiciária pode ligar o golpe a ti mais tarde (o suborno impede): ficas com o dinheiro, mas vais preso
    const linked = !st.bribe && rng.chance(rasto * S.linkedPer);
    if (linked) jailFor(p, now, o.jailMin * T.MIN, 100 + st.i, { k: 'op', id: o.id });
    return { ok: true, success: true, i: st.i, money: L.net, value: o.gain, lav: L.lav, respect: resp, levelUp: lvl, chanceBp: bp, rasto, linked, jailUntil: linked ? p.jailUntil : 0, ...(() => { const ev = evOp(p, now); return ev ? { ev } : {}; })() };   // v117: fichas dos eventos
  }
  // correu mal: perde-se o que se pagou; sem suborno paga-se advogado (a avença cobre) e às vezes há prisão
  let lawyer = 0, busted = false;
  if (!st.bribe) {
    if (!covered) { lawyer = Math.min(o.lawyer, p.cash + p.bank); payAll(p, lawyer); }
    busted = rng.chance(rasto * S.caughtPer);
    if (busted) jailFor(p, now, o.jailMin * T.MIN, 100 + st.i, { k: 'op', id: o.id });
  }
  return { ok: true, success: false, i: st.i, lost: st.paid, lawyer, busted, chanceBp: bp, rasto, jailUntil: busted ? p.jailUntil : 0 };
}
// tira até onde houver (o advogado cobra o que puder)
function payAll(p, amount) { const c = Math.min(p.cash, amount); p.cash -= c; p.bank -= amount - c; }

// ---------- advogado em avença ----------
export function setRetainer(p, now, world, on) {
  begin(p, now, world, { allowBusy: true, jailOk: true });
  if (on && level(p) < CFG.retainer.level) fail('LOW_LEVEL', { need: CFG.retainer.level });
  if (!!on === p.avenca) fail(on ? 'HAVE_IT' : 'NO_RETAINER');
  p.avenca = !!on;
  if (on) retainerDay(p, now);   // o primeiro dia paga-se ao contratar
  return { ok: true, on: p.avenca, price: on ? CFG.retainer.day : 0 };
}
// paga o dia de hoje (Lisboa) se ainda não pagou; sem dinheiro, o advogado vai-se embora
export function retainerDay(p, now) {
  if (!p.avenca) return;
  const d = dayOf(now);
  if (p.avD === d) return;
  if (p.cash + p.bank < CFG.retainer.day) { p.avenca = false; return; }
  payAll(p, CFG.retainer.day); p.avD = d; p.avN += 1;
}

// ---------- prisão com coisas para fazer ----------
// o que a rua rende por barra (100 de stamina) no teu nível: o melhor golpe aberto, pela média da tabela e a hipótese
export function streetPerBar(p) {
  let best = 0;
  CFG.crimes.forEach((c, k) => { if (crimeUnlocked(p, k)) best = Math.max(best, (crimeAvg(c) * c.p * 100) / (10000 * c.e)); });
  return Math.floor(best);
}
const crimeAvg = (c) => c.prizes.reduce((x, [bp, a, z]) => x + (bp * (a + z)) / 2, 0) / 10000;
function inJail(p, now) { if (!(p.jailUntil > now)) fail('NOT_IN_JAIL'); }
export function jailSmuggle(p, now, world, rng) {
  begin(p, now, world, { allowBusy: true, jailOk: true }); inJail(p, now);
  const J = CFG.jail;
  if (p.energy < J.smuggleE) fail('NO_ENERGY', { need: J.smuggleE });
  p.energy -= J.smuggleE;
  const money = Math.floor((streetPerBar(p) * J.smuggleE) / 200);   // metade do que a rua dá por esta stamina
  const lost = rng.chance(J.smuggleLoseBp);
  if (!lost) p.cash += money;
  return { ok: true, money: lost ? 0 : money, lost };
}
export function jailWork(p, now, world) {
  begin(p, now, world, { allowBusy: true, jailOk: true }); inJail(p, now);
  const J = CFG.jail;
  if (p.vigor < J.workE) fail('NO_VIGOR', { need: J.workE });
  p.vigor -= J.workE; p.cash += J.work;
  return { ok: true, money: J.work };
}
export const yardBet = (p) => { const J = CFG.jail; return J.yardMin + Math.floor(((J.yardMax - J.yardMin) * (level(p) - 1)) / 99); };
export function jailYard(p, now, world, rng) {
  begin(p, now, world, { allowBusy: true, jailOk: true }); inJail(p, now);
  const J = CFG.jail, bet = yardBet(p);
  if (p.vigor < J.yardE) fail('NO_VIGOR', { need: J.yardE });
  if (p.cash < bet) fail('NO_MONEY', { need: bet, have: p.cash });
  p.vigor -= J.yardE;
  settleAllBiz(p, now);   // treina a força como o ginásio (o rendimento até agora conta com a antiga)
  p.stats.F += 1; p.c.trains += 1;
  const win = rng.chance(5000);
  p.cash += win ? bet : -bet;
  return { ok: true, win, money: win ? bet : -bet, stat: 'F', value: p.stats.F };
}
export function jailCards(p, now, world, bet, rng) {
  begin(p, now, world, { allowBusy: true, jailOk: true }); inJail(p, now);
  if (!Number.isSafeInteger(bet) || bet < 1 || bet > CFG.jail.cardsMax) fail('BAD_AMOUNT');
  if (p.cash < bet) fail('NO_MONEY', { need: bet, have: p.cash });
  // v75: as cartas são a sério. Tiram-se duas cartas de um baralho (a tua e a do outro preso); ganha a mais alta.
  // Valores iguais não contam e tira-se outra vez, por isso ganha-se exatamente metade das vezes (é simétrico).
  // (sem repetir à sorte: o valor dele sai dos 12 que sobram, por isso a conta fecha sempre e é exatamente 50%)
  const mine = rng.int(0, 51), mr = mine >> 2, r2 = rng.int(0, 11), tr = r2 >= mr ? r2 + 1 : r2, theirs = tr * 4 + rng.int(0, 3);
  const win = mr > tr;
  p.cash += win ? bet : -bet;
  const today = jailCardsDay(p, now); today.n += 1; if (win) today.w += 1;
  return { ok: true, win, money: win ? bet : -bet, cards: [mine, theirs], today: { n: today.n, w: today.w } };
}
// as mãos de cartas de hoje (dia de Lisboa): o ecrã mostra quantas ganhaste, para a sorte se ver
function jailCardsDay(p, now) {
  const d = dayOf(now);
  if (!p.jc || p.jc.d !== d) p.jc = { d, n: 0, w: 0 };
  return p.jc;
}
export function jailFavor(p, now, world, kind) {
  if (!['time', 'contact'].includes(kind)) fail('NO_STEP');
  begin(p, now, world, { allowBusy: true, jailOk: true }); inJail(p, now);
  const J = CFG.jail;
  if (p.jf >= J.favors) fail('NO_FAVORS');
  if (kind === 'contact' && p.contacts >= J.contactsMax) fail('CONTACTS_FULL');
  p.jf += 1;
  if (kind === 'contact') { p.contacts += 1; return { ok: true, kind, contacts: p.contacts }; }
  const cut = Math.floor(((p.jailUntil - now) * J.favorCutBp) / 10000);
  p.jailUntil -= cut;
  return { ok: true, kind, cut, jailUntil: p.jailUntil };
}
// ---------- v115: tirar outros da prisão ----------
// a hipótese de tirar alguém: menos quanto mais pena lhe falta, mais com a perícia de furto
export function bustChance(p, target, now) {
  const B = CFG.bust, left = Math.max(0, Math.ceil((target.jailUntil - now) / T.MIN));
  return Math.max(B.minBp, Math.min(B.maxBp, B.baseBp - left * B.perMinBp + skillBp(p, 'furto')));
}
export function bust(p, target, now, world, rng) {
  if (p === target || p.id === target.id) fail('SELF');
  begin(p, now, world);   // de dentro, do hospital ou de fora do país não se tira ninguém
  touch(target, now);
  if (!(target.jailUntil > now)) fail('NOT_IN_JAIL');
  const B = CFG.bust;
  if (p.energy < B.e) fail('NO_ENERGY', { need: B.e });
  const left = Math.max(0, Math.ceil((target.jailUntil - now) / T.MIN)), chance = bustChance(p, target, now);
  p.energy -= B.e; p.sk.furto += B.e;   // a perícia sobe com a prática, corra bem ou mal
  if (rng.chance(chance)) {
    target.jailUntil = 0; target.jailTier = 0;
    const resp = Math.min(B.respMax, 1 + Math.floor(left / B.respMin));
    return { ok: true, freed: true, chance, left, respect: resp, levelUp: addRespect(p, resp, now) };
  }
  const caught = rng.chance(B.failJailBp);
  if (caught) jailFor(p, now, B.jailMin * T.MIN, 1, { k: 'bust', id: target.name || null });
  return { ok: true, freed: false, caught, chance, left, jailUntil: caught ? p.jailUntil : 0 };
}
export function jailEscape(p, now, world, rng) {
  begin(p, now, world, { allowBusy: true, jailOk: true }); inJail(p, now);
  const J = CFG.jail;
  if (p.energy < J.escapeE) fail('NO_ENERGY', { need: J.escapeE });
  p.energy -= J.escapeE;
  if (rng.chance(J.escapeBp)) { p.jailUntil = 0; p.jailTier = 0; return { ok: true, free: true }; }
  const add = Math.floor(((p.jailUntil - now) * J.escapeAddBp) / 10000);
  p.jailUntil += add;
  return { ok: true, free: false, add, jailUntil: p.jailUntil };
}

// ---------- v117: eventos do ano ----------
// os efeitos dos eventos a decorrer (somam-se quando há dois ao mesmo tempo)
export function evBp(k, now) { let s = 0; for (const e of eventsAt(now)) if (e.fx.k === k) s += e.fx.bp; return s; }
// o prémio de cada meta: dinheiro (mais com o nível) e o respeito de 1 ou 3 barras de golpes do nível de cada um
export const evPrize = (p, i) => {
  const P = CFG.events.prize[i], S = CFG.street, bar = Math.min(S.respCap, S.respBase + S.respPerLevel * level(p));
  return { cash: P.cash + P.perLevel * level(p), resp: P.bars * bar };
};
// o registo de cada evento no jogador: fichas, metas pagas (bits), fichas de hoje (para o limite do dia), presente de hoje, ovos de hoje.
// Os de eventos que já acabaram saem.
function evRec(p, e, now) {
  if (!p.evs || typeof p.evs !== 'object' || Array.isArray(p.evs)) p.evs = {};
  if (!p.evs[e.key]) {
    const on = new Set(eventsAt(now).map((x) => x.key));
    for (const k of Object.keys(p.evs)) if (!on.has(k)) delete p.evs[k];
    p.evs[e.key] = { n: 0, got: 0, d: '', dn: 0, g: '', gv: 0, eg: 0 };
  }
  const R = p.evs[e.key], d = dayOf(now);
  if (R.d !== d) { R.d = d; R.dn = 0; R.eg = 0; }   // um dia novo: o limite e os ovos recomeçam
  return R;
}
// juntar fichas: cada meta que se passa paga logo (dinheiro no banco, respeito); a última conta para a honra «Festeiro»
function evAdd(p, e, n, now) {
  const R = evRec(p, e, now), out = { id: e.id, key: e.key, got: n, n: 0, paid: [] };
  R.n += n; out.n = R.n;
  e.goals.forEach((g, i) => {
    if (R.n < g || R.got & (1 << i)) return;
    R.got |= 1 << i;
    const P = evPrize(p, i);
    p.bank += P.cash;
    const lvl = P.resp ? addRespect(p, P.resp, now) : null;
    if (i === e.goals.length - 1) { p.c.evtop = (p.c.evtop || 0) + 1; R.t3 = now; }   // v118: quando fechou (para a classificação do jornal)
    out.paid.push({ i, cash: P.cash, respect: P.resp, levelUp: lvl });
  });
  return out;
}
// fichas ganhas a jogar (golpes, golpes grandes): contam para o limite do dia
function evEarn(p, e, n, now) {
  const R = evRec(p, e, now), k = Math.min(n, CFG.events.dayCap - R.dn);
  if (k <= 0) return null;
  R.dn += k;
  return evAdd(p, e, k, now);
}
// as fichas que um golpe bem feito encontra: uma por evento a decorrer, com hipótese pela stamina do golpe (já no limite, nem se tenta)
export const evDropBp = (c) => Math.min(10000, c.e * CFG.events.perE);
function evDrop(p, c, now, rng) {
  const L = eventsAt(now);
  if (!L.length) return null;
  const bp = evDropBp(c), out = [];
  for (const e of L) { if (evRec(p, e, now).dn >= CFG.events.dayCap) continue; if (rng.chance(bp)) { const r = evEarn(p, e, 1, now); if (r) out.push(r); } }
  return out.length ? out : null;
}
// um golpe grande que corre bem dá opTokens fichas de cada evento a decorrer
function evOp(p, now) {
  const out = [];
  for (const e of eventsAt(now)) { const r = evEarn(p, e, CFG.events.opTokens, now); if (r) out.push(r); }
  return out.length ? out : null;
}
// o presente do dia: o envelope vermelho do Ano Novo Chinês (um valor da sorte) ou a porta do Advento (sobe até dia 24, triplo no 25)
export function evGiftValue(p, e, now, rng) {
  const G = CFG.events;
  if (e.id === 'lunar') {   // abaixo do nível 20, um décimo (88, 188… 8 888): o envelope não pode valer mais do que dias de golpes
    let r = rng.int(0, 9999), v = G.hongbao[0][1];
    for (const [w, x] of G.hongbao) { if (r < w) { v = x; break; } r -= w; }
    return level(p) < G.hongbaoLevel ? Math.floor(v / 10) : v;
  }
  const d = localParts(now).d, A = G.advent, base = A.base + A.perLevel * level(p);
  return d === 25 ? base * A.day25 : d <= 24 ? Math.round((base * (12 + d)) / 24) : base;
}
// abre-se em qualquer lado, preso ou lá fora; vai para o banco
export function evGift(p, now, world, key, rng) {
  begin(p, now, world, { allowBusy: true, jailOk: true, trOk: 2 });
  const e = eventsAt(now).find((x) => x.key === key);
  if (!e) fail('NO_EVENT');
  if (e.fx.k !== 'gift') fail('NO_GIFT');
  const R = evRec(p, e, now), d = dayOf(now);
  if (R.g === d) fail('GIFT_TAKEN');
  const cash = evGiftValue(p, e, now, rng);
  R.g = d; R.gv = cash;
  p.bank += cash;
  return { ok: true, id: e.id, key, cash, day: localParts(now).d };
}
// os ovos da Páscoa: eggs por dia, cada um num ecrã do jogo (o mesmo para o jogador o dia todo); apanhar vale eggTokens fichas
export function evEggTabs(p, now) {
  const G = CFG.events, d = dayOf(now), out = [];
  let h = 2166136261; for (const ch of String(p.id) + d) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const pool = [...G.eggTabs];
  for (let i = 0; i < G.eggs && pool.length; i++) { h = Math.imul(h ^ (h >>> 13), 2654435761) >>> 0; out.push(pool.splice(h % pool.length, 1)[0]); }
  return out;
}
export function evEgg(p, now, world, key, i) {
  begin(p, now, world, { allowBusy: true, jailOk: true, trOk: 2 });
  const e = eventsAt(now).find((x) => x.key === key);
  if (!e) fail('NO_EVENT');
  if (e.fx.k !== 'eggs') fail('NO_EGGS');
  if (!Number.isInteger(i) || i < 0 || i >= CFG.events.eggs) fail('NO_EGG');
  const R = evRec(p, e, now);
  if (R.eg & (1 << i)) fail('EGG_TAKEN');
  R.eg |= 1 << i;
  return { ok: true, id: e.id, key, i, ev: evAdd(p, e, CFG.events.eggTokens, now) };
}
// o que o ecrã mostra de cada evento a decorrer
export function evView(p, now) {
  const d = dayOf(now);
  return eventsAt(now).map((e) => { const R = p.evs && p.evs[e.key], today = R && R.d === d;
    return { id: e.id, key: e.key, start: e.start, end: e.end, fx: e.fx, goals: e.goals, n: R ? R.n : 0, got: R ? R.got : 0,
      dn: today ? R.dn : 0, cap: CFG.events.dayCap,
      gift: e.fx.k === 'gift' ? !(R && R.g === d) : false, gv: R && R.g === d ? R.gv : 0,
      eggs: e.fx.k === 'eggs' ? evEggTabs(p, now) : null, eg: today ? R.eg : 0,
      prize: e.goals.map((_, i) => evPrize(p, i)) }; });
}

// ---------- v119: o que os créditos compram (o servidor tira os créditos da carteira da conta; aqui só o efeito) ----------
export function vipAdd(p, now, world, days) {
  begin(p, now, world, { allowBusy: true, jailOk: true, trOk: 2 });
  if (!Number.isSafeInteger(days) || days < 1 || days > 400) fail('BAD_AMOUNT');
  p.vip = Math.max(now, p.vip || 0) + days * T.DAY; p.vipOn = true;
  return { ok: true, vip: p.vip, days };
}
export const crRefillsToday = (p, now) => (p.crd && p.crd.d === dayOf(now) ? p.crd.n : 0);
export const crExitsToday = (p, now) => (p.crd && p.crd.d === dayOf(now) ? p.crd.x || 0 : 0);
function crExit(p, now) {
  const n = crExitsToday(p, now);
  if (n >= CFG.vip.exitsPerDay) fail('CR_DAY', { n: CFG.vip.exitsPerDay });
  p.crd = p.crd && p.crd.d === dayOf(now) ? { ...p.crd, x: n + 1 } : { d: dayOf(now), n: 0, x: 1 };
}
export function crRefill(p, now, world) {
  begin(p, now, world, { allowBusy: true, jailOk: true, trOk: 2 });
  if (p.energy >= energyMax(p)) fail('ENERGY_FULL');
  const it = CFG.vip.shop.find((x) => x.id === 'refill'), n = crRefillsToday(p, now);
  if (n >= it.perDay) fail('CR_DAY', { n: it.perDay });
  const got = energyMax(p) - p.energy;
  p.energy += got; p.energyT = now; p.crd = { d: dayOf(now), n: n + 1, x: crExitsToday(p, now) };
  return { ok: true, energy: got, left: it.perDay - n - 1 };
}
export function crJail(p, now, world) {
  begin(p, now, world, { allowBusy: true, jailOk: true }); inJail(p, now);
  crExit(p, now);
  p.jailUntil = 0; p.jailTier = 0;
  return { ok: true };
}
export function crHosp(p, now, world) {
  begin(p, now, world, { allowBusy: true, trOk: 1 });
  if (!(p.hospUntil > now)) fail('NOT_IN_HOSPITAL');
  crExit(p, now);
  p.hospUntil = 0;
  return { ok: true };
}

// ---------- parlamento (v76) ----------
// votar: nível mínimo e conta com um dia ou mais (as contas novas não contam). O voto em si guarda-se no mundo (servidor).
export function govVoteCheck(p, now, world) {
  begin(p, now, world, { allowBusy: true });
  const V = CFG.gov.vote;
  if (level(p) < V.minLevel) fail('LOW_LEVEL', { need: V.minLevel });
  if (now - (p.joinedAt || now) < V.minAgeMs) fail('YOU_ARE_NEW');
  return { ok: true };
}
// pôr dinheiro num dos lados de uma votação: sai do jogo (campanha, almoços, favores)
export function govLobby(p, now, world, amount) {
  const V = CFG.gov.vote;
  if (!Number.isSafeInteger(amount) || amount < V.minLobby || amount > 1e12) fail('BAD_AMOUNT');
  begin(p, now, world, { allowBusy: true });
  if (level(p) < V.minLevel) fail('LOW_LEVEL', { need: V.minLevel });
  pay(p, amount);
  return { ok: true, amount };
}

// ---------- ataques ----------

function prune(arr, now) { const lim = now - CFG.pvp.windowMs; while (arr.length && arr[0] <= lim) arr.shift(); }

// asVictim: foi mandado para o hospital por outro (conta para o limite de 4 em 24 h)
function hospitalize(p, now, ms, asVictim) {
  const P = CFG.pvp;
  p.hospUntil = now + cut(ms, Math.min(9000, (klass(p).hospCutBp || 0) + studyBp(p, 'hosp') + empBp(p, 'hosp')));   // v81: medicina; v111: clínica
  p.protectUntil = p.hospUntil + P.protectMs;          // proteção normal: cai se ele atacar
  if (!asVictim) return;
  prune(p.hospTimes, now);
  p.hospTimes.push(now);
  if (p.hospTimes.length >= P.maxHospPerWindow) {      // limite fixo: não cai
    const oldest = p.hospTimes[p.hospTimes.length - P.maxHospPerWindow];
    p.capUntil = Math.max(p.capUntil, oldest + P.windowMs);
  }
}

// drop: quem ataca aceitou perder o escudo de jogador novo
// war: os dois são de gangues em guerra (v102): aí vale atacar quem tem menos respeito (as gangues já se mediram ao declarar)
export function canAttack(a, d, now, world, drop = false, war = false) {
  const P = CFG.pvp;
  if (a === d || a.id === d.id) return 'SELF';
  if (sameCrew(a, d)) return 'SAME_GANG';   // ninguém ataca a própria gangue (a gangue da rua não conta)
  if (now - world.start < CFG.round.noPvpMs) return 'NO_PVP_YET';
  if (a.jailUntil > now) return 'IN_JAIL';
  if (a.hospUntil > now) return 'IN_HOSPITAL';
  if (a.vigor < P.energy) return 'NO_VIGOR';
  if (a.shieldUntil > now && !drop) return 'YOU_ARE_NEW';
  if (d.shieldUntil > now) return 'TARGET_NEW';
  { // v101: fora do país só se luta lá, os dois no mesmo país (nunca no avião); quem acabou de chegar tem uns segundos
    const wa = trWhere(a, now), wd = trWhere(d, now);
    if (wa || wd) {
      if (!(wa && wd && wa.st === 'there' && wd.st === 'there' && wa.to === wd.to)) return 'TARGET_AWAY';
      if (wd.t0 + CFG.travel.graceMs > now) return 'TARGET_LANDED';
    }
  }
  if (d.hospUntil > now) return 'TARGET_HOSPITAL';
  if (d.jailUntil > now) return 'TARGET_JAIL';
  if (d.protectUntil > now || d.capUntil > now) return 'TARGET_PROTECTED';
  if (!war && d.respect * 10000 < a.respect * P.minTargetBp) return 'TARGET_TOO_WEAK';
  if (level(d) < P.newbieLevel && attackPower(a, now) > P.newbiePowerX * Math.max(1, defensePower(d, now))) return 'TARGET_NEWBIE';   // v89
  return null;
}

// v97: a hipótese das forças, mais a precisão da arma de quem ataca, mais 3 pontos a quem tem o dobro do alcance (ou menos 3 a quem tem metade)
export function attackChanceBp(a, d, now) {
  const W = CFG.wfight, ra = fightRng(a), rd = fightRng(d), edge = ra >= 2 * rd ? W.rngBp : rd >= 2 * ra ? -W.rngBp : 0;
  return clamp(chanceBp(attackPower(a, now), defensePower(d, now)) + fightAccBp(a) + edge, CFG.chance.minBp, CFG.chance.maxBp);
}

// ---------- assassino a soldo ----------
export function hitmanPrice(d) { const H = CFG.hitman; return Math.max(H.priceMin, d.respect * H.pricePerRespect); }
export function hitmanChanceBp(d) { const H = CFG.hitman; return Math.max(H.minBp, H.baseBp - (d.guard >= 0 ? CFG.guards[d.guard].block : 0)); }
export function hitmanLeft(a, now) { return Math.max(0, CFG.hitman.perDay - a.hmT.filter((t) => t > now - CFG.pvp.windowMs).length); }
// porque não se pode encomendar (ou null). Quem encomenda pode estar preso ou no hospital, e não gasta stamina.
export function canHitman(a, d, now, world, drop = false) {
  const P = CFG.pvp, H = CFG.hitman;
  if (a === d || a.id === d.id) return 'SELF';
  if (sameCrew(a, d)) return 'SAME_GANG';
  if (now - world.start < CFG.round.noPvpMs) return 'NO_PVP_YET';
  if (level(a) < H.minLevel) return 'LOW_LEVEL';
  if (a.shieldUntil > now && !drop) return 'YOU_ARE_NEW';
  if (hitmanLeft(a, now) <= 0) return 'HITMAN_LIMIT';
  if (d.shieldUntil > now) return 'TARGET_NEW';
  if (trWhere(d, now)) return 'TARGET_AWAY';   // v101: o assassino não vai atrás de quem está fora
  if (d.hospUntil > now) return 'TARGET_HOSPITAL';
  if (d.jailUntil > now) return 'TARGET_JAIL';
  if (d.protectUntil > now || d.capUntil > now) return 'TARGET_PROTECTED';
  if (d.hmSafe > now) return 'HITMAN_SAFE';
  if (d.respect * 10000 < a.respect * P.minTargetBp) return 'TARGET_TOO_WEAK';
  return null;
}
export function hitman(a, d, now, world, rng, drop = false) {
  begin(a, now, world, { allowBusy: true });
  touch(d, now);
  const why = canHitman(a, d, now, world, drop);
  if (why) fail(why, why === 'LOW_LEVEL' ? { need: CFG.hitman.minLevel } : undefined);
  const H = CFG.hitman, price = hitmanPrice(d), bp = hitmanChanceBp(d);
  pay(a, price);                                   // paga-se adiantado: se falhar, o dinheiro não volta
  if (a.shieldUntil > now) a.shieldUntil = 0;      // só chega aqui com escudo quem aceitou perdê-lo
  a.protectUntil = 0;                              // quem manda bater perde a proteção, como quem ataca
  pruneT(a.hmT, now, CFG.pvp.windowMs); a.hmT.push(now);
  if (!rng.chance(bp)) return { ok: true, success: false, price, chanceBp: bp };
  const respLoss = Math.min(d.respect, Math.floor((d.respect * H.respBp) / 10000)), cashLoss = Math.floor((d.cash * H.cashBp) / 10000);
  addRespect(d, -respLoss, now);
  d.cash -= cashLoss;
  hospitalize(d, now, H.hospMs, true);
  d.hmSafe = now + H.immuneMs;
  return { ok: true, success: true, price, chanceBp: bp, respLoss, cashLoss, hospUntil: d.hospUntil };
}

function priorWins(a, d, now) {
  const arr = a.hits.get(d.id);
  if (!arr) return 0;
  prune(arr, now);
  return arr.length;
}

export function mugValue(a, d, now) {
  const div = 2 ** Math.min(priorWins(a, d, now), 10);
  const st = bizStored(d, now);
  const take = (x) => Math.floor(Math.floor((x * CFG.pvp.mugBp) / 10000) / div);
  if (trWhere(d, now)) return take(d.cash);   // v101: lá fora só o que traz no bolso (o cofre de casa não o guarda)
  let v = take(cut(d.cash, huBp(d, 0)));
  for (let i = 0; i < st.length; i++) if (CFG.biz[i].raid) v += take(st[i].money);
  const vv = venueView(d, Math.max(now, d.t));
  for (const k of ['club', 'bro']) if (vv[k]) v += take(vv[k].till);
  return v;
}

// ganho por vitória (antes do desconto por repetir o alvo)
export function pvpBaseGain(a, d) {
  const P = CFG.pvp;
  const ratioBp = clamp(Math.floor((10000 * d.respect) / Math.max(1, a.respect)), P.ratioMinBp, P.ratioMaxBp);
  const sqrtBp = Math.floor(Math.sqrt(ratioBp * 10000)); // 5000..20000
  return up(Math.floor(((P.gainBase + tier(a)) * sqrtBp) / 10000), klass(a).pvpBp || 0);
}

export function expectedGain(a, d, now) {
  const div = 2 ** Math.min(priorWins(a, d, now), 10);
  return Math.floor(pvpBaseGain(a, d) / div);
}

export function attack(a, d, now, world, mode, rng, drop = false, war = false) {
  begin(a, now, world, { trOk: 1 });   // v101: também lá fora (com quem lá estiver)
  touch(d, now);
  if (mode !== 'beat' && mode !== 'mug') fail('BAD_MODE');
  const why = canAttack(a, d, now, world, drop, war);
  if (why) fail(why);
  const P = CFG.pvp;
  const shieldLost = a.shieldUntil > now; if (shieldLost) a.shieldUntil = 0;   // só chega aqui com escudo quem aceitou perdê-lo; não volta
  a.vigor -= P.energy;   // as lutas gastam energia (a barra do ginásio), não a stamina dos crimes
  a.protectUntil = 0; // quem ataca perde a proteção
  const bp = attackChanceBp(a, d, now);
  const n = priorWins(a, d, now);
  const div = 2 ** Math.min(n, 10);
  const base = pvpBaseGain(a, d);
  if (rng.chance(bp)) {
    const cw = mainWeapon(a), crit = cw && wStat(cw).crit > 0 && rng.chance(wStat(cw).crit);   // v97: o laser dá golpes críticos (+50% de respeito)
    const gain = Math.floor((Math.floor(base / div) * (crit ? 15000 : 10000)) / 10000);
    let res;
    if (mode === 'beat') {
      const loss = Math.floor(gain / P.lossDiv);
      const lvA = addRespect(a, gain, now);
      addRespect(d, -loss, now);
      hospitalize(d, now, P.beatHospMs, true);
      res = { win: true, mode, respect: gain, targetLoss: loss, money: 0, levelUp: lvA, wp: gain };   // wp: pontos de guerra (v102)
    } else {
      settleAllBiz(d, now);
      const take = (x) => Math.floor(Math.floor((x * P.mugBp) / 10000) / div);
      let stolen = take(d.tr ? d.cash : cut(d.cash, huBp(d, 0)));   // o cofre de casa guarda uma parte (v101: lá fora, não)
      d.cash -= stolen;
      for (let i = 0; i < d.biz.length; i++) {
        if (!CFG.biz[i].raid || d.tr) continue;   // (v101: lá fora só se leva o que traz no bolso)
        const s = take(d.biz[i].stored);
        d.biz[i].stored -= s; stolen += s;
      }
      for (const k of ['club', 'bro']) if (d[k] && !d.tr) { const s = take(d[k].till); d[k].till -= s; stolen += s; }   // e o caixa da discoteca e do bordel
      a.cash += stolen;
      const g = Math.floor(gain / 4);
      const lvA = addRespect(a, g, now);
      hospitalize(d, now, P.mugHospMs, true);
      res = { win: true, mode, respect: g, targetLoss: 0, money: stolen, levelUp: lvA, wp: Math.floor((gain * CFG.gang.war.mugBp) / 10000) };
    }
    a.c.pvpWins += 1;
    if (!a.hits.has(d.id)) a.hits.set(d.id, []);
    a.hits.get(d.id).push(now);
    return { ok: true, chanceBp: bp, ...res, ...(crit ? { crit: true } : {}) };
  }
  const loss = Math.floor(base / P.lossDiv);
  addRespect(a, -loss, now);
  // quem se defende só ganha se o atacante tiver >= 25% do seu respeito (contra farm com contas falsas)
  const defGain = a.respect * 10000 >= d.respect * P.minTargetBp ? P.defendGain : 0;
  addRespect(d, defGain, now);
  hospitalize(a, now, P.beatHospMs, false);
  return { ok: true, chanceBp: bp, win: false, mode, respect: -loss, defenderGain: defGain };
}

// ---------- guerras entre gangues (v102) ----------
// O servidor guarda as guerras (são das gangues); aqui só o que mexe no jogador: o prémio de respeito no fim e as contagens.
export function warHit(p) { p.c.warHits = (p.c.warHits || 0) + 1; }
export function warBonus(p, pts, won, now) {
  const W = CFG.gang.war, respect = Math.floor((Math.max(0, pts) * (won ? W.winBp : W.loseBp)) / 10000);
  if (won && pts > 0) p.c.wars = (p.c.wars || 0) + 1;
  return { respect, levelUp: respect ? addRespect(p, respect, now) : false };
}
// o alvo de uma guerra agora: o inicial até holdMs; depois desce dropBp do inicial por hora (nunca abaixo de 0)
export function warTarget(t0, start, now) {
  const W = CFG.gang.war, h = Math.floor((now - start - W.holdMs) / T.HOUR);
  return now - start < W.holdMs ? t0 : Math.max(0, t0 - Math.floor((t0 * W.dropBp * h) / 10000));
}

// ---------- golpes e tareias em grupo (gangues) ----------
// Quem alinha paga a stamina logo. O servidor junta quem alinhou e chama a resolução quando o tempo acaba;
// se não houver gente que chegue, a stamina volta.
const pruneT = (arr, now, ms) => { while (arr.length && arr[0] <= now - ms) arr.shift(); };
const heistOf = (k) => (Number.isInteger(k) ? CFG.gang.heists[k] : undefined) || fail('NO_CRIME');
export function heistJoin(p, now, world, k) {
  const H = heistOf(k);
  begin(p, now, world);
  if (!p.gang) fail('NO_GANG');
  if (p.energy < H.e) fail('NO_ENERGY', { need: H.e });
  p.energy -= H.e;   // sem limite por dia: trava a stamina e a pausa da gangue entre operações
  return { ok: true, e: H.e };
}
export function heistRefund(p, now, k) { touch(p, now); p.energy = Math.min(energyMax(p), p.energy + heistOf(k).e); }
// o que cada um puxa num golpe em grupo: as stats dele, pesadas como o golpe pede
const heistPull = (p, k, now) => { const { w } = heistOf(k); return gearStr(CFG.gweapons, p.gweapon) + Math.floor((w.I * effStat(p, 'I', now) + w.F * effStat(p, 'F', now) + w.C * effStat(p, 'C', now)) / 100); };
export function heistChanceBp(ps, k, now) {
  const { D } = heistOf(k); let s = 0;
  for (const p of ps) s += heistPull(p, k, now);
  return chanceBp(s, D);
}
// A parte de cada um, em pontos-base do saque por cabeça: quem puxa a média do grupo ou mais leva o saque inteiro; quem puxa menos leva em proporção.
// Sem limite de golpes por dia, é isto que impede ir à boleia dos fortes (ou encher o grupo de contas fracas): a soma nunca passa do que um grupo igual receberia.
export function heistShares(ps, k, now) {
  const cs = ps.map((p) => heistPull(p, k, now)), S = cs.reduce((a, b) => a + b, 0), n = ps.length;
  return cs.map((c) => (S > 0 ? Math.min(10000, Math.floor((c * n * 10000) / S)) : 10000));
}
export function heistResolve(ps, now, k, rng) {
  const H = heistOf(k);
  for (const p of ps) touch(p, now);
  const bp = heistChanceBp(ps, k, now);
  if (rng.chance(bp)) {
    const each = rng.int(H.min, H.max), sh = heistShares(ps, k, now);   // o saque por cabeça; cada um leva a parte dele (ver heistShares), mais o bónus de saque da gangue
    return { ok: true, success: true, chanceBp: bp, parts: ps.map((p, i) => {
      const money = Math.floor((Math.floor((each * sh[i]) / 10000) * (10000 + gbp(p, 'loot'))) / 10000), respect = Math.max(1, Math.floor((H.r * sh[i]) / 10000));
      p.cash += money;
      return { id: p.id, money, respect, share: sh[i], levelUp: addRespect(p, respect, now) };
    }) };
  }
  return { ok: true, success: false, chanceBp: bp, parts: ps.map((p) => {
    const busted = !(p.jailUntil > now) && !(p.hospUntil > now) && rng.chance(bustChanceBp(p, now));
    if (busted) jailFor(p, now, H.jailMin * T.MIN, H.bailAs + 1, { k: 'heist', id: H.id });
    return { id: p.id, money: 0, respect: 0, busted };
  }) };
}
export function hitJoin(a, d, now, world, drop = false) {
  begin(a, now, world);
  touch(d, now);
  if (!a.gang) fail('NO_GANG');
  if (a.gang === CFG.gang.bot.id) fail('BOT_GANG_NO');   // a gangue da rua não faz tareias em grupo
  if (a.gang === d.gang) fail('SAME_GANG');
  const why = canAttack(a, d, now, world, drop);
  if (why) fail(why);
  if (a.shieldUntil > now) a.shieldUntil = 0;
  a.vigor -= CFG.pvp.energy;
  return { ok: true, e: CFG.pvp.energy };
}
export function hitRefund(a, now) { touch(a, now); a.vigor = Math.min(CFG.vigor.max, a.vigor + CFG.pvp.energy); }
export function hitChanceBp(as, d, now) {
  let s = 0; for (const a of as) s += attackPower(a, now);
  return chanceBp(Math.floor((s * CFG.gang.hitTeamBp) / 10000), defensePower(d, now));
}
// o alvo tem de continuar à mão quando o tempo acaba (não pode ter ido entretanto para o hospital ou para a prisão)
export function hitCanResolve(d, now, gang) { touch(d, now); return !(d.tr || d.hospUntil > now || d.jailUntil > now || d.protectUntil > now || d.capUntil > now || d.shieldUntil > now || (gang && d.gang === gang)); }
// quem alinhou e entretanto foi preso ou parar ao hospital fica de fora (e recebe a stamina de volta)
export function opReady(p, now) { touch(p, now); return !(p.tr || p.jailUntil > now || p.hospUntil > now); }   // (v101: quem viajou fica de fora)
export function hitResolve(as, d, now, rng) {
  const P = CFG.pvp, G = CFG.gang;
  for (const a of as) touch(a, now);
  touch(d, now);
  const bp = hitChanceBp(as, d, now);
  if (rng.chance(bp)) {
    let loss = 0;
    const parts = as.map((a) => {
      const gain = Math.floor((Math.floor(pvpBaseGain(a, d) / 2 ** Math.min(priorWins(a, d, now), 10)) * G.hitShareBp) / 10000);
      loss = Math.max(loss, Math.floor(gain / P.lossDiv));
      a.protectUntil = 0; a.c.pvpWins += 1;
      if (!a.hits.has(d.id)) a.hits.set(d.id, []);
      a.hits.get(d.id).push(now);
      return { id: a.id, respect: gain, levelUp: addRespect(a, gain, now) };
    });
    addRespect(d, -loss, now);
    hospitalize(d, now, Math.floor((P.beatHospMs * G.hitHospBp) / 10000), true);
    return { ok: true, win: true, chanceBp: bp, targetLoss: loss, parts };
  }
  let defGain = 0;
  const parts = as.map((a) => {
    const loss = Math.floor(pvpBaseGain(a, d) / P.lossDiv);
    if (a.respect * 10000 >= d.respect * P.minTargetBp) defGain = P.defendGain;
    addRespect(a, -loss, now); a.protectUntil = 0;
    if (!(a.hospUntil > now)) hospitalize(a, now, P.beatHospMs, false);
    return { id: a.id, respect: -loss };
  });
  addRespect(d, defGain, now);
  return { ok: true, win: false, chanceBp: bp, defenderGain: defGain, parts };
}

// ---------- casino ----------
// Tudo decidido aqui, no servidor, com o gerador aleatório do servidor. Aposta-se só o dinheiro que tens na mão.
export function casinoMax(p) {
  const L = level(p); let m = CFG.casino.limits[0][1];
  for (const [n, max] of CFG.casino.limits) if (L >= n) m = max;
  return m;
}
function stakeOf(p, amounts, k = 1) {
  const C = CFG.casino;
  if (!Array.isArray(amounts) || !amounts.length || amounts.length > C.maxBets) fail('BAD_BET');
  let tot = 0;
  for (const a of amounts) { if (!Number.isSafeInteger(a) || a < C.minBet) fail('BAD_BET'); tot += a; }
  if (tot > casinoMax(p) * k) fail('BET_TOO_BIG', { max: casinoMax(p) * k });
  if (tot > p.cash) fail('NO_CASH');
  return tot;
}
const RED = new Set(CFG.casino.red);
const RL_TYPES = ['red', 'black', 'even', 'odd', 'low', 'high', 'dozen', 'num'];
// quanto volta (contando com a aposta) por cada ficha, se sair o número n
export function rouletteReturn(b, n) {
  switch (b.t) {
    case 'red': return n > 0 && RED.has(n) ? 2 : 0;
    case 'black': return n > 0 && !RED.has(n) ? 2 : 0;
    case 'even': return n > 0 && n % 2 === 0 ? 2 : 0;
    case 'odd': return n % 2 === 1 ? 2 : 0;
    case 'low': return n >= 1 && n <= 18 ? 2 : 0;
    case 'high': return n >= 19 ? 2 : 0;
    case 'dozen': return n > 0 && Math.floor((n - 1) / 12) === b.n ? 3 : 0;
    case 'num': return n === b.n ? 36 : 0;
    default: return 0;
  }
}
function roulette(p, a, rng) {
  const bets = Array.isArray(a.bets) ? a.bets : [];
  for (const b of bets) {
    if (!b || !RL_TYPES.includes(b.t)) fail('BAD_BET');
    if (b.t === 'dozen' && !(Number.isInteger(b.n) && b.n >= 0 && b.n <= 2)) fail('BAD_BET');
    if (b.t === 'num' && !(Number.isInteger(b.n) && b.n >= 0 && b.n <= 36)) fail('BAD_BET');
  }
  const bet = stakeOf(p, bets.map((b) => b && b.amt));
  p.cash -= bet;
  const n = rng.int(0, 36);
  let win = 0;
  const out = bets.map((b) => { const r = b.amt * rouletteReturn(b, n); win += r; return { t: b.t, n: b.n ?? null, amt: b.amt, ret: r }; });
  p.cash += win;
  return { ok: true, g: 'roulette', bet, win, n, bets: out };
}
function dice(p, a, rng) {
  const mult = CFG.casino.dice[a.pick];
  if (!Object.hasOwn(CFG.casino.dice, a.pick)) fail('BAD_BET');
  const bet = stakeOf(p, [a.amt]);
  p.cash -= bet;
  const d = [rng.int(1, 6), rng.int(1, 6)], s = d[0] + d[1];
  const hit = a.pick === 'low' ? s < 7 : a.pick === 'seven' ? s === 7 : s > 7;
  const win = hit ? Math.floor((bet * mult) / 10) : 0;
  p.cash += win;
  return { ok: true, g: 'dice', bet, win, d, pick: a.pick };
}
// blackjack: cartas 0..51 (valor = c % 13: 0 ás, 1..8 = 2..9, 9..12 = 10, valete, dama, rei).
// As cartas que ainda vão sair ficam só no servidor; o jogador só vê as suas e a primeira do dealer.
export function bjValue(cards) {
  let tot = 0, aces = 0;
  for (const c of cards) { const r = c % 13; if (r === 0) { aces++; tot += 11; } else tot += r >= 9 ? 10 : r + 1; }
  while (tot > 21 && aces) { tot -= 10; aces--; }
  return { tot, soft: aces > 0 };
}
const isBJ = (cards) => cards.length === 2 && bjValue(cards).tot === 21;
function bjShoe(rng) {
  const { decks, draw } = CFG.casino.bj, left = new Array(52).fill(decks), out = [];
  let total = 52 * decks;
  for (let k = 0; k < draw; k++) {
    let x = rng.int(0, total - 1), c = 0;
    while (x >= left[c]) { x -= left[c]; c++; }
    left[c]--; total--; out.push(c);
  }
  return out;
}
// Dividir: com duas cartas do mesmo valor, o jogador pode separá-las em duas mãos (uma vez por jogada), pondo outra aposta igual.
// h.pl/h.bet/h.dbl são sempre da mão que está a ser jogada; h.fin guarda as mãos já jogadas e h.q a que ainda espera.
// Depois de dividir, 21 com duas cartas vale como 21 normal (paga 1 para 1) e dois ases recebem uma carta cada e ficam por aí.
const bjRank = (c) => { const r = c % 13; return r >= 9 ? 10 : r + 1; };
const bjCanSplit = (h) => h.pl.length === 2 && !h.sp && bjRank(h.pl[0]) === bjRank(h.pl[1]);
const bjHands = (h) => [...(h.fin || []), { pl: h.pl, bet: h.bet, dbl: h.dbl }, ...(h.q || [])];
// A jogada que perde menos a longo prazo (estratégia básica para estas regras: 6 baralhos, dealer pára em todos os 17, dobra-se com
// quaisquer 2 cartas, também depois de dividir, e só se divide uma vez). Devolve [melhor, alternativa]: a alternativa é pedir ou ficar,
// para quando a melhor é dobrar ou dividir e não há dinheiro na mão para isso. Só usa o que o jogador vê: as suas cartas e a 1.ª do dealer.
export function bjTip(pl, up0, canSplit) {
  const up = up0 % 13 === 0 ? 11 : bjRank(up0), { tot, soft } = bjValue(pl), two = pl.length === 2, btw = (a, b) => up >= a && up <= b;
  let alt;
  if (soft) alt = tot >= 19 || (tot === 18 && up <= 8) ? 'stand' : 'hit';
  else alt = tot >= 17 || (tot >= 13 && up <= 6) || (tot === 12 && btw(4, 6)) ? 'stand' : 'hit';
  if (canSplit && two) {
    const v = pl[0] % 13 === 0 ? 11 : bjRank(pl[0]);
    if (v === 11 || v === 8 || ((v === 2 || v === 3 || v === 7) && up <= 7) || (v === 4 && btw(5, 6)) || (v === 6 && up <= 6) || (v === 9 && up <= 9 && up !== 7)) return ['split', alt];
  }
  if (two) {
    const d = soft ? (tot >= 17 && tot <= 18 ? btw(3, 6) : tot >= 15 && tot <= 16 ? btw(4, 6) : tot >= 13 && tot <= 14 ? btw(5, 6) : false)
      : tot === 11 ? up <= 10 : tot === 10 ? up <= 9 : tot === 9 ? btw(3, 6) : false;
    if (d) return ['double', alt];
  }
  return [alt, alt];
}
function bjView(h, done) {
  const v = { bet: h.bet, dbl: h.dbl, pl: h.pl.slice(), tot: bjValue(h.pl).tot };
  if (done) { v.dl = h.dl.slice(); v.dtot = bjValue(h.dl).tot; } else { v.dl = [h.dl[0]]; if (bjCanSplit(h)) v.split = true; v.tip = bjTip(h.pl, h.dl[0], !!v.split); }
  if (h.sp) { v.cur = (h.fin || []).length; v.hands = bjHands(h).map((x) => ({ pl: x.pl.slice(), tot: bjValue(x.pl).tot, bet: x.bet, dbl: !!x.dbl })); }
  return v;
}
// a mão que estava a ser jogada acabou (ficou, dobrou, fez 21 ou rebentou): passa à seguinte, se houver, ou fecha as contas
function bjNext(p, h, bet) {
  while (h.q && h.q.length) {
    (h.fin ||= []).push({ pl: h.pl, bet: h.bet, dbl: h.dbl });
    const nx = h.q.shift(); h.pl = nx.pl; h.bet = nx.bet; h.dbl = false;
    if (!h.aces && bjValue(h.pl).tot < 21) return { ok: true, g: 'bj', bet, win: 0, done: false, hand: bjView(h, false) };
  }
  return bjFinish(p, h, bet);
}
function bjFinish(p, h, bet) {
  const hands = bjHands(h), natural = !h.sp && isBJ(h.pl);
  if (!natural && hands.some((x) => bjValue(x.pl).tot <= 21)) while (bjValue(h.dl).tot < 17) h.dl.push(h.next.shift()); // o dealer pára em 17 (também no 17 com ás)
  const dv = bjValue(h.dl).tot, dbj = isBJ(h.dl);
  let win = 0, staked = 0;
  const outs = hands.map((x) => {
    const pv = bjValue(x.pl).tot;
    const res = pv > 21 ? 'bust' : natural && !dbj ? 'bj' : dbj && !natural ? 'lose' : dv > 21 || pv > dv ? 'win' : pv === dv ? 'push' : 'lose';
    const w = res === 'bj' ? x.bet + Math.floor((x.bet * 3) / 2) : res === 'win' ? x.bet * 2 : res === 'push' ? x.bet : 0;
    win += w; staked += x.bet;
    return { pl: x.pl.slice(), tot: pv, bet: x.bet, dbl: !!x.dbl, res, win: w };
  });
  p.cash += win; p.bj = null;
  const hand = bjView(h, true); hand.bet = staked;   // no fim, «bet» é tudo o que esteve na mesa nesta jogada
  let res = outs[0].res;
  if (h.sp) { hand.hands = outs; hand.cur = -1; res = win > staked ? 'win' : win === staked ? 'push' : outs.every((o) => o.res === 'bust') ? 'bust' : 'lose'; }
  return { ok: true, g: 'bj', bet, win, done: true, res, hand };
}
function bjDeal(p, a, rng) {
  if (p.bj) fail('BJ_OPEN');
  const bet = stakeOf(p, [a.amt]);
  p.cash -= bet;
  const n = bjShoe(rng);
  const h = { bet, dbl: false, pl: [n[0], n[2]], dl: [n[1], n[3]], next: n.slice(4) };
  p.bj = h;
  if (isBJ(h.pl) || isBJ(h.dl)) return bjFinish(p, h, bet);  // o dealer espreita: com blackjack de alguém, a mão acaba já
  return { ok: true, g: 'bj', bet, win: 0, done: false, hand: bjView(h, false) };
}
function bjMove(p, op, rng) {
  const h = p.bj;
  if (!h) fail('NO_HAND');
  if (op === 'double' && (h.pl.length !== 2 || h.dbl)) fail('NO_DOUBLE');
  if (op === 'split' && !bjCanSplit(h)) fail('NO_SPLIT');
  if ((op === 'double' || op === 'split') && p.cash < h.bet) fail('NO_CASH');
  while (h.next.length < 16) h.next.push(rng.int(0, 51));   // nunca falta carta (com 6 baralhos isto quase nunca acontece)
  if (op === 'hit') {
    h.pl.push(h.next.shift());
    if (bjValue(h.pl).tot >= 21) return bjNext(p, h, 0);
    return { ok: true, g: 'bj', bet: 0, win: 0, done: false, hand: bjView(h, false) };
  }
  if (op === 'stand') return bjNext(p, h, 0);
  if (op === 'double') {
    p.cash -= h.bet;
    const extra = h.bet; h.bet *= 2; h.dbl = true;
    h.pl.push(h.next.shift());
    return bjNext(p, h, extra);
  }
  if (op === 'split') {
    p.cash -= h.bet;
    const [c0, c1] = h.pl;
    h.sp = true; h.aces = c0 % 13 === 0; h.fin = [];
    h.pl = [c0, h.next.shift()]; h.q = [{ pl: [c1, h.next.shift()], bet: h.bet }];
    if (h.aces || bjValue(h.pl).tot === 21) return bjNext(p, h, h.bet);
    return { ok: true, g: 'bj', bet: h.bet, win: 0, done: false, hand: bjView(h, false) };
  }
  fail('BAD_BET');
}
// ---- Roda da Fortuna ----
function pickW(rng, list) {
  let tot = 0; for (const [, w] of list) tot += w;
  let x = rng.int(0, tot - 1);
  for (const [v, w] of list) { if (x < w) return v; x -= w; }
  return list[list.length - 1][0];
}
// Crazy: onde a roda pára em cada volta (a casa por baixo do flapper do meio) e o que cada flapper ganha. Um flapper que cai em DOUBLE ou
// TRIPLE segue para a volta seguinte com tudo a dobrar ou a triplicar; os outros já acabaram. À 12.ª volta seguida (1 vez em milhares de
// milhões) uma dessas casas conta como a casa de valor que vem a seguir, para a roda não rodar para sempre.
export const CRAZY_X = { D: 2, T: 3 };
export function crazySpin(rng) {
  const L = CFG.casino.wheel.louca, N = L.segs.length, stops = [], mults = L.flaps.map(() => null), fac = L.flaps.map(() => 1);
  for (let n = 0; n < 12 && mults.includes(null); n++) {
    const idx = rng.int(0, N - 1); stops.push(idx);
    L.flaps.forEach((off, f) => {
      if (mults[f] !== null) return;
      let i = (((idx + off) % N) + N) % N;
      if (n === 11) while (CRAZY_X[L.segs[i]]) i = (i + 1) % N;
      if (CRAZY_X[L.segs[i]]) fac[f] *= CRAZY_X[L.segs[i]]; else mults[f] = L.segs[i] * fac[f];
    });
  }
  return { stops, mults };
}
export function wheelSpin(rng) {
  const W = CFG.casino.wheel;
  // multiplicador do topo: uma casa (ou, raramente, nenhuma) com ×2 a ×50 nesta volta
  let x = rng.int(0, 9999), top = null;
  for (const s of W.spots) { if (x < W.top[s]) { top = { s, m: pickW(rng, W.topMult) }; break; } x -= W.top[s]; }
  const idx = rng.int(0, W.segs.length - 1), s = W.segs[idx];
  let bonus = null, B = W.num[s] ?? 0;
  if (s === 'moeda') { const sides = [pickW(rng, W.moeda), pickW(rng, W.moeda)], side = rng.int(0, 1); B = sides[side]; bonus = { sides, side }; }
  else if (s === 'caixas') { const boxes = Array.from({ length: W.caixasN }, () => pickW(rng, W.caixas)), pick = rng.int(0, W.caixasN - 1); B = boxes[pick]; bonus = { boxes, pick }; }
  else if (s === 'bola') { const slots = Array.from({ length: W.bolaSlots }, () => pickW(rng, W.bola)), at = rng.int(0, slots.length - 1); B = slots[at]; bonus = { slots, at }; }
  else if (s === 'louca') { bonus = crazySpin(rng); B = null; }
  const tm = top && top.s === s ? top.m : 1;   // o multiplicador do topo só conta se a roda parar na casa dele
  return { idx, s, top, bonus, tm, mult: B === null ? null : B * tm };   // quem apostou em s recebe aposta × (mult + 1); na Crazy o mult depende do flapper
}
// o multiplicador para quem apostou na casa que saiu; na Crazy é o do flapper escolhido (0 verde, 1 azul, 2 amarelo)
export const wheelMult = (res, flap = 1) => (res.s === 'louca' ? res.bonus.mults[flap] * res.tm : res.mult);
function wheel(p, a, rng) {
  const W = CFG.casino.wheel, bets = Array.isArray(a.bets) ? a.bets : [];
  for (const b of bets) if (!b || !W.spots.includes(b.s)) fail('BAD_BET');
  if (a.flap !== undefined && ![0, 1, 2].includes(a.flap)) fail('BAD_BET');
  const bet = stakeOf(p, bets.map((b) => b && b.amt));
  p.cash -= bet;
  const sp = wheelSpin(rng), flap = a.flap ?? rng.int(0, 2), mult = wheelMult(sp, flap);
  let win = 0;
  for (const b of bets) if (b.s === sp.s) win += b.amt * (mult + 1);
  win = Math.min(win, bet * CFG.casino.maxWinMult);
  p.cash += win;
  return { ok: true, g: 'wheel', bet, win, ...sp, flap, mult };
}
// ---- mesas ao vivo (roleta e roda) ----
// A ronda é de todos: cada um aposta enquanto a mesa está aberta (o dinheiro sai logo da mão),
// o servidor tira um só resultado e paga a toda a gente. As contas são as mesmas da jogada a solo.
const tableKey = (g, b) => (g === 'roulette' ? b.t + ':' + (b.n ?? '') : b.s);
function tableClean(g, bets) {
  if (!Array.isArray(bets) || !bets.length || bets.length > CFG.casino.maxBets) fail('BAD_BET');
  return bets.map((b) => {
    if (!b || !Number.isSafeInteger(b.amt) || b.amt < CFG.casino.minBet) fail('BAD_BET');
    if (g === 'roulette') {
      if (!RL_TYPES.includes(b.t)) fail('BAD_BET');
      if (b.t === 'dozen' && !(Number.isInteger(b.n) && b.n >= 0 && b.n <= 2)) fail('BAD_BET');
      if (b.t === 'num' && !(Number.isInteger(b.n) && b.n >= 0 && b.n <= 36)) fail('BAD_BET');
      return b.t === 'dozen' || b.t === 'num' ? { t: b.t, n: b.n, amt: b.amt } : { t: b.t, amt: b.amt };
    }
    if (!CFG.casino.wheel.spots.includes(b.s)) fail('BAD_BET');
    return { s: b.s, amt: b.amt };
  });
}
export const tableTotal = (bets) => bets.reduce((x, b) => x + b.amt, 0);
// junta apostas novas às que o jogador já tem nesta ronda; devolve a lista completa
export function tableBet(p, now, world, g, add, mine = []) {
  if (g !== 'roulette' && g !== 'wheel') fail('NO_GAME');
  begin(p, now, world);
  const novo = tableClean(g, add), all = new Map(mine.map((b) => [tableKey(g, b), { ...b }]));
  let bet = 0;
  for (const b of novo) { const k = tableKey(g, b), cur = all.get(k); if (cur) cur.amt += b.amt; else all.set(k, b); bet += b.amt; }
  if (all.size > CFG.casino.maxBets) fail('BAD_BET');
  const bets = [...all.values()], total = tableTotal(bets);
  if (!Number.isSafeInteger(total) || total > casinoMax(p)) fail('BET_TOO_BIG', { max: casinoMax(p) });
  if (bet > p.cash) fail('NO_CASH');
  p.cash -= bet;
  return { ok: true, g, bet, bets, total };
}
// tirar as apostas da mesa enquanto ela está aberta: o dinheiro volta todo
export function tableClear(p, mine) {
  const back = tableTotal(mine);
  p.cash += back;
  return { ok: true, back, bets: [], total: 0 };
}
export function tableDraw(g, rng) { return g === 'roulette' ? { n: rng.int(0, 36) } : wheelSpin(rng); }
// quanto volta ao jogador (aposta incluída) com este resultado; flap: o flapper do jogador, que só conta quando sai a Crazy
export function tablePay(g, bets, res, flap = 1) {
  let win = 0;
  if (g === 'roulette') for (const b of bets) win += b.amt * rouletteReturn(b, res.n);
  else { const mult = wheelMult(res, flap); for (const b of bets) if (b.s === res.s) win += b.amt * (mult + 1); win = Math.min(win, tableTotal(bets) * CFG.casino.maxWinMult); }
  return win;
}
export function tableCredit(p, win) { if (!Number.isSafeInteger(win) || win < 0) fail('BAD_BET'); p.cash += win; }

// ---- slots ----
const cellW = (rng, w) => { let tot = 0; for (const x of w) tot += x; let r = rng.int(0, tot - 1); for (let i = 0; i < w.length; i++) { if (r < w[i]) return i; r -= w[i]; } return w.length - 1; };
// Quem enche as casas. Com G.run, os símbolos normais vêm em pilhas dentro de cada coluna (1, 2 ou 3 iguais seguidos, com os pesos de G.run),
// como nos rolos a sério: é isso que deixa os símbolos raros juntarem os iguais precisos para rebentar. Scatters e esferas vêm sempre sozinhos.
// Nas rodadas grátis as pilhas podem ser maiores (G.runFree): mais prémios, que é o que se espera de um bónus.
// mk(s) devolve [símbolo, extra]. fill(c) enche uma casa da coluna c; fill.novo() esquece a pilha a meio (grelha nova ou queda nova).
function filler(G, rng, w, mk, free) {
  const run = free && G.runFree ? G.runFree : G.run;
  let col = -1, sym = 0, left = 0;
  const fill = (c) => {
    if (c !== col) { col = c; left = 0; }
    if (left > 0) { left--; return mk(sym); }
    const s = cellW(rng, w);
    if (run && s < G.nsym) { sym = s; left = cellW(rng, run); }
    return mk(s);
  };
  fill.novo = () => { col = -1; left = 0; };
  return fill;
}
// a grelha inicial, coluna a coluna (índice = linha × colunas + coluna)
function firstGrid(G, fill, extra) {
  const g = new Array(G.cols * G.rows);
  fill.novo();
  for (let c = 0; c < G.cols; c++) for (let r = 0; r < G.rows; r++) { const i = r * G.cols + c, [s, x] = fill(c); g[i] = s; if (x !== undefined) extra[i] = x; }
  return g;
}
// garante pelo menos «need» scatters na grelha inicial (compra de bónus)
function forceScat(g, need, SC, rng) {
  let have = g.filter((s) => s === SC).length;
  while (have < need) { const i = rng.int(0, g.length - 1); if (g[i] !== SC) { g[i] = SC; have++; } }
}
// cair: cada coluna desce o que sobra e enche por cima (linha 0 em cima; índice = linha × colunas + coluna)
function gravity(G, g, extra, rm, fill) {
  const C = G.cols, R = G.rows, n = C * R, rmS = new Set(rm), ng = new Array(n), ne = {};
  fill.novo();
  for (let c = 0; c < C; c++) {
    const keep = [];
    for (let r = R - 1; r >= 0; r--) { const i = r * C + c; if (!rmS.has(i)) keep.push([g[i], extra[i]]); }
    for (let r = R - 1, k = 0; r >= 0; r--, k++) {
      const i = r * C + c;
      if (k < keep.length) { ng[i] = keep[k][0]; if (keep[k][1] !== undefined) ne[i] = keep[k][1]; } else { const [s, x] = fill(c); ng[i] = s; if (x !== undefined) ne[i] = x; }
    }
  }
  return [ng, ne];
}
function scatterRound(G, rng, free, force) {
  const n = G.cols * G.rows, SC = G.nsym, ORB = G.nsym + 1, w = free ? G.wFree : G.w;
  const fill = filler(G, rng, w, (s) => [s, s === ORB ? pickW(rng, G.orb) : undefined], free);
  let orbs = {}, g = firstGrid(G, fill, orbs);
  if (force) { forceScat(g, G.trig, SC, rng); for (const k of Object.keys(orbs)) if (g[k] !== ORB) delete orbs[k]; }
  const steps = [{ g: g.slice(), o: { ...orbs } }];
  let win = 0;
  for (let t = 0; t < 40; t++) {
    const cnt = new Array(G.nsym).fill(0);
    for (const s of g) if (s < SC) cnt[s]++;
    const wins = [];
    for (let s = 0; s < G.nsym; s++) if (cnt[s] >= G.min) wins.push({ s, n: cnt[s], pay: G.pay[s][cnt[s] >= G.min + 4 ? 2 : cnt[s] >= G.min + 2 ? 1 : 0] });
    if (!wins.length) break;
    const rm = [];
    for (let i = 0; i < n; i++) if (wins.some((x) => x.s === g[i])) rm.push(i);
    win += wins.reduce((x, y) => x + y.pay, 0);
    Object.assign(steps[steps.length - 1], { w: wins, rm });
    [g, orbs] = gravity(G, g, orbs, rm, fill);
    steps.push({ g: g.slice(), o: { ...orbs } });
  }
  return { steps, win, orbSum: Object.values(orbs).reduce((x, y) => x + y, 0), scat: g.filter((s) => s === SC).length };
}
// grupos 7×7: casas encostadas (cima, baixo, lados) com o mesmo símbolo
function clusters(G, g) {
  const C = G.cols, n = g.length, seen = new Uint8Array(n), out = [];
  for (let i = 0; i < n; i++) {
    if (seen[i] || g[i] >= G.nsym) continue;
    const s = g[i], stack = [i], cells = []; seen[i] = 1;
    while (stack.length) {
      const j = stack.pop(); cells.push(j);
      const r = Math.floor(j / C), c = j % C;
      for (const k of [c > 0 ? j - 1 : -1, c < C - 1 ? j + 1 : -1, r > 0 ? j - C : -1, j + C < n ? j + C : -1]) if (k >= 0 && !seen[k] && g[k] === s) { seen[k] = 1; stack.push(k); }
    }
    if (cells.length >= G.min) out.push({ s, cells });
  }
  return out;
}
function clusterRound(G, rng, free, spots, force) {
  const n = G.cols * G.rows, SC = G.nsym, w = free ? G.wFree : G.w, fill = filler(G, rng, w, (s) => [s], free);
  let g = firstGrid(G, fill, {});
  if (force) forceScat(g, G.trig, SC, rng);
  const steps = [{ g: g.slice(), sp: spots.slice() }];
  let win = 0;
  for (let t = 0; t < 60; t++) {
    const cl = clusters(G, g);
    if (!cl.length) break;
    const wins = [], rm = [];
    for (const k of cl) {
      // as casas com multiplicador por baixo do grupo somam-se; depois cada casa fica marcada ou duplica
      let m = 0; for (const i of k.cells) if (spots[i] >= 2) m += spots[i];
      const pay = G.pay[k.s][Math.min(k.cells.length, G.min + 10) - G.min] * (m || 1);
      wins.push({ s: k.s, n: k.cells.length, pay, m, cells: k.cells }); win += pay; rm.push(...k.cells);
    }
    for (const i of rm) spots[i] = spots[i] === 0 ? 1 : Math.min(G.spotMax, spots[i] === 1 ? 2 : spots[i] * 2);
    Object.assign(steps[steps.length - 1], { w: wins, rm });
    [g] = gravity(G, g, {}, rm, fill);
    steps.push({ g: g.slice(), sp: spots.slice() });
  }
  return { steps, win, scat: g.filter((s) => s === SC).length };
}
// uma jogada completa (com as rodadas grátis, se as houver). buy: 0 normal, 1 compra, 2 compra super. total em centésimos da aposta.
export function slotSpin(gid, rng, buy = 0) {
  const G = CFG.casino.slots[gid], cap = G.max * 100, out = { game: gid, free: [], scatPay: 0, buy };
  let total = 0;
  if (G.kind === 'cluster') {
    const base = clusterRound(G, rng, false, new Array(G.cols * G.rows).fill(0), buy > 0);
    out.base = base; total = base.win;
    if (base.scat >= G.trig) {
      // compra super: cada casa do tabuleiro começa já com um multiplicador, sorteado casa a casa
      const spots = buy === 2 ? Array.from({ length: G.cols * G.rows }, () => pickW(rng, G.superSpots)) : new Array(G.cols * G.rows).fill(0);
      out.spots0 = spots.slice();
      let left = G.fs[Math.min(7, base.scat)], played = 0;
      out.free0 = left;
      while (left > 0 && played < G.maxFree && total < cap) {
        left--; played++;
        const r = clusterRound(G, rng, true, spots, false);
        const add = r.scat >= G.trig ? G.fs[Math.min(7, r.scat)] : 0;
        left += add; total += r.win;
        // add: rodadas ganhas nesta rodada; left: as que ficam por jogar (o limite de rodadas e o prémio máximo acabam o bónus)
        out.free.push({ ...r, w: r.win, add, left: total < cap ? Math.min(left, G.maxFree - played) : 0 });
      }
    }
  } else {
    const base = scatterRound(G, rng, false, buy > 0);
    out.base = base;
    total = base.win * (base.win > 0 && base.orbSum ? base.orbSum : 1);
    if (base.scat >= G.trig) {
      out.scatPay = G.scatPay[Math.min(6, base.scat)]; total += out.scatPay;
      let left = G.free, played = 0, acc = 0;
      out.free0 = left;
      while (left > 0 && played < G.maxFree && total < cap) {
        left--; played++;
        const r = scatterRound(G, rng, true, false);
        // accAll: nas rodadas grátis todas as esferas que caem ficam no multiplicador acumulado, mesmo que essa rodada não tenha prémio
        let m = r.orbSum && (r.win > 0 || G.accAll) ? r.orbSum : 0;
        if (G.accFree) { acc += m; m = acc; }
        const w2 = r.win * (r.win > 0 && m ? m : 1);
        const add = r.scat >= G.retrig[0] ? G.retrig[1] : 0;
        left += add; total += w2;
        out.free.push({ ...r, acc: m, w: w2, add, left: total < cap ? Math.min(left, G.maxFree - played) : 0 });
      }
    }
  }
  out.total = Math.min(total, cap);
  return out;
}
function slot(p, a, rng) {
  const gid = Object.hasOwn(CFG.casino.slots, a.game) ? a.game : null;
  if (!gid) fail('BAD_BET');
  if (![0, 1, 2].includes(a.buy ?? 0)) fail('BAD_BET');
  const G = CFG.casino.slots[gid], buy = a.buy ?? 0;
  const mult = buy === 2 ? G.superBuy : buy === 1 ? G.buy : 1;
  // como nas slots a sério: aposta ao cêntimo (bc, a partir de 0,20 €) e o bónus custa sempre mult× a aposta, com qualquer aposta permitida.
  // O prémio também se paga ao cêntimo (antes 0,40 € numa ficha de 1 € dava 0 €); os cêntimos ficam em p.cent, ao lado do dinheiro na mão.
  // Quem ainda manda «amt» (euros inteiros, versão antiga do site) continua a poder jogar.
  const betC = a.bc !== undefined ? a.bc : Number.isSafeInteger(a.amt) ? a.amt * 100 : NaN;
  if (!mult || !Number.isSafeInteger(betC) || betC < CFG.casino.slotMinC) fail('BAD_BET');
  if (betC > casinoMax(p) * 100) fail('BET_TOO_BIG', { max: casinoMax(p) });
  const costC = betC * mult, wallet = p.cash * 100 + (p.cent || 0);
  if (costC > wallet) fail('NO_CASH');
  const sp = slotSpin(gid, rng, buy);
  const winC = Math.floor((betC * sp.total) / 100), after = wallet - costC + winC;
  p.cash = Math.floor(after / 100); p.cent = after % 100;
  return { ok: true, g: 'slot', game: gid, bet: costC / 100, base: betC / 100, win: winC / 100, betC: costC, baseC: betC, winC, buy, spin: sp };
}
export function bjPublic(p) { return p.bj ? bjView(p.bj, false) : null; }
export function casinoPlay(p, now, world, g, a, rng) {
  if (!a || typeof a !== 'object') fail('BAD_BET');
  if (g === 'bj' && a.op !== 'deal') {
    if (!['hit', 'stand', 'double', 'split'].includes(a.op)) fail('BAD_BET');
    begin(p, now, world, { allowBusy: true });       // uma mão começada pode acabar-se mesmo no hospital
    return bjMove(p, a.op, rng);
  }
  if (!['roulette', 'dice', 'bj', 'wheel', 'slot'].includes(g)) fail('NO_GAME');
  begin(p, now, world);
  if (g === 'roulette') return roulette(p, a, rng);
  if (g === 'wheel') return wheel(p, a, rng);
  if (g === 'slot') return slot(p, a, rng);
  if (g === 'dice') return dice(p, a, rng);
  return bjDeal(p, a, rng);
}

// ---------- objetivos ----------

function missionHave(p, type) {
  switch (type) {
    case 'wins': return p.c.wins;
    case 'trains': return p.c.trains;
    case 'refills': return p.c.refills;
    case 'collects': return p.c.collects;
    case 'pvpWins': return p.c.pvpWins;
    case 'ports': return p.c.ports;
    case 'level': return level(p);
    case 'tier': { let t = 0; for (let k = 0; k < p.wk.length; k++) if (p.wk[k] > 0) t = Math.max(t, CFG.crimes[k].tier ?? k + 1); return t; }   // o degrau do golpe, não a posição na lista
    case 'shifts': return p.c.shifts;
    case 'courses': return p.done.length;
    case 'skill': return Math.floor(Math.max(...CFG.skills.fams.map((f) => p.sk[f])) / 100);   // barras na melhor família
    case 'gear': return (p.eq.branca || p.eq.mao || p.eq.principal ? 1 : 0) + (['cabeca', 'tronco', 'pernas', 'pes', 'maos'].some((k) => p.eq[k]) ? 1 : 0);   // uma arma e uma peça de proteção
    case 'biz': return p.biz.reduce((s, b) => s + b.n, 0);
    case 'lux': return p.luxuries;
    default: return 0;
  }
}

// o objetivo atual, ou null quando a cadeia acabou
export function mission(p) {
  const m = CFG.missions[p.mq[0]];
  if (!m) return null;
  const have = Math.min(m.need, missionHave(p, m.type));
  // swapAt: a partir de quando se pode trocar por outro (0 = não há outro para pôr no lugar)
  return { i: CFG.missions.length - p.mq.length, id: m.id, type: m.type, need: m.need, have, cash: m.cash, done: have >= m.need, total: CFG.missions.length, swapAt: p.mq.length > 1 ? p.mrT + CFG.missionSwapMs : 0 };
}

export function claimMission(p, now, world) {
  begin(p, now, world, { allowBusy: true });
  const m = mission(p);
  if (!m) fail('NO_MISSION');
  if (!m.done) fail('MISSION_NOT_DONE');
  p.cash += m.cash;
  p.mq.shift(); p.mi += 1;
  return { ok: true, id: m.id, cash: m.cash, next: mission(p) };
}
// trocar o objetivo: o que está à vista vai para o fim da fila e aparece o seguinte. Uma vez por hora; não dá nem tira dinheiro.
export function swapMission(p, now, world) {
  begin(p, now, world, { allowBusy: true });
  const m = mission(p);
  if (!m) fail('NO_MISSION');
  if (m.done) fail('MISSION_READY');
  if (p.mq.length < 2) fail('NO_OTHER');
  if (now < p.mrT + CFG.missionSwapMs) fail('SWAP_WAIT', { at: p.mrT + CFG.missionSwapMs });
  p.mq.push(p.mq.shift()); p.mrT = now;
  return { ok: true, skipped: m.id, next: mission(p) };
}

// ---------- ranking ----------

export function ranking(players) {
  return [...players].sort((x, y) => (y.respect - x.respect) || (x.respectAt - y.respectAt) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}

// ---------- verificação de invariantes (testes e simulação) ----------

export function checkInvariants(p) {
  const bad = [];
  if (p.cent !== undefined && (!Number.isInteger(p.cent) || p.cent < 0 || p.cent > 99)) bad.push(`cent=${p.cent}`);
  if (p.wm !== undefined && (typeof p.wm !== 'object' || Object.values(p.wm).some((v) => !Number.isInteger(v) || v < 0 || v > CFG.work.ritmo.cap))) bad.push('ritmo');
  const ints = ['energy', 'energyT', 'addiction', 'addictionT', 'cash', 'bank', 'respect', 'respectAt', 'peakRespect', 'jailUntil', 'hospUntil', 'protectUntil', 'capUntil', 'luxuries', 't'];
  for (const k of ints) if (!Number.isSafeInteger(p[k]) || p[k] < 0) bad.push(`${k}=${p[k]}`);
  for (const s of STATS) if (!Number.isSafeInteger(p.stats[s]) || p.stats[s] < CFG.start.stat) bad.push(`stat ${s}=${p.stats[s]}`);
  if (p.energy > energyMax(p)) bad.push(`energy>${energyMax(p)}`);
  if (!Number.isSafeInteger(p.vigor) || p.vigor < 0 || p.vigor > CFG.vigor.max) bad.push('vigor');
  if (p.addiction > addictionCap(p)) bad.push('addiction>cap');
  if (p.peakRespect < p.respect) bad.push('peak<respect');
  if (!Number.isInteger(p.guard) || p.guard < -1 || p.guard >= CFG.guards.length) bad.push('guard');
  for (const [k, list] of [['tool', CFG.tools], ['gweapon', CFG.gweapons]]) if (!Number.isInteger(p[k]) || p[k] < -1 || p[k] >= list.length) bad.push(k);
  // corpo: cada espaço vazio ou com uma peça desse espaço; armas de fogo com os usos entre 0 e o máximo
  const goodItem = (it) => { const g = gearOf(it.id); return !!g && (g.gun ? Number.isSafeInteger(it.u) && it.u >= 0 && it.u <= g.life : it.u === undefined); };
  if (!p.eq || CFG.slots.some((k) => p.eq[k] !== null && !(p.eq[k] && goodItem(p.eq[k]) && gearOf(p.eq[k].id).slot === k))) bad.push('eq');
  // v85: a escavação aberta (grelha do tamanho certo, só achados do conjunto do sítio, pazadas dentro do que há) e os sítios vigiados
  if (p.dg !== null) {
    const d = p.dg, S = d && siteOf(d.site), items = S ? [...CFG.col.sets[digSet(S.id)].items, ...(S.rare ? [S.rare] : [])] : [], nr = d && Array.isArray(d.cells) ? d.cells.filter((v) => v && S && v === S.rare).length : 0;
    if (!S || !Array.isArray(d.cells) || d.cells.length !== CFG.dig.size ** 2 || d.cells.some((v) => v && !items.includes(v)) || nr > 1 || d.cells.filter(Boolean).length !== CFG.dig.finds + nr
      || !Number.isSafeInteger(d.used) || d.used < 0 || d.used > d.taps || d.open.length !== d.used || d.got.some((v) => !items.includes(v))
      || !Number.isSafeInteger(d.safe) || d.safe < CFG.dig.safe || new Set(d.open.map((x) => x.i)).size !== d.open.length
      || d.open.some((x) => !Number.isInteger(x.i) || x.i < 0 || x.i >= d.cells.length || (x.v ? x.v !== d.cells[x.i] : d.cells[x.i] || x.n !== digNear(d.cells, x.i)))
      || JSON.stringify(d.open.filter((x) => x.v).map((x) => x.v)) !== JSON.stringify(d.got)) bad.push('dg');
  }
  if (!p.dgc || Object.entries(p.dgc).some(([k, v]) => !siteOf(k) || !Number.isSafeInteger(v) || v < 0)) bad.push('dgc');
  // v101: a viagem (país que existe, fase, mala só com coisas desse país e dentro da mala que se tem), a mala que chegou e a escavação no sítio onde se está
  const bagOk = (b, paid, to) => b && paid && typeof b === 'object' && Object.entries(b).every(([g, n]) => trGood(g) && trGood(g).at === to && Number.isSafeInteger(n) && n > 0 && Number.isSafeInteger(paid[g]) && paid[g] === n * trGood(g).buy)
    && Object.keys(paid).every((g) => b[g] > 0) && trUsed(b) <= trBagCap(p);
  if (!Number.isInteger(p.trB) || p.trB < 0 || p.trB >= CFG.travel.bag.length) bad.push('trB');
  if (p.trD !== null && !(p.trD && typeof p.trD.d === 'string' && Number.isInteger(p.trD.n) && p.trD.n >= 1 && p.trD.n <= CFG.travel.perDay)) bad.push('trD');
  if (p.tr !== null && !(p.tr && destOf(p.tr.to) && typeof p.tr.arm === 'boolean' && (p.tr.gun === undefined || p.tr.gun === destOf(p.tr.to).gun) && ['out', 'there', 'back'].includes(p.tr.st) && Number.isSafeInteger(p.tr.at) && Number.isSafeInteger(p.tr.t0) && bagOk(p.tr.bag, p.tr.paid, p.tr.to)
    && (p.tr.st !== 'back' || (Array.isArray(p.tr.sz) && p.tr.sz.every((g) => p.tr.bag[g] > 0 && trGood(g).seizeBp))))) bad.push('tr');
  if (p.trL !== null && !(p.trL && destOf(p.trL.to) && bagOk(p.trL.bag, p.trL.paid, p.trL.to) && Array.isArray(p.trL.sz) && p.trL.sz.every((g) => p.trL.bag[g] > 0 && trGood(g).seizeBp))) bad.push('trL');
  if (p.dg && (siteOf(p.dg.site)?.at !== hereOf(p) || (p.tr && p.tr.st !== 'there'))) bad.push('dg fora do sítio');
  if (p.hunt && p.hunt.on && p.tr) bad.push('caça em viagem');
  // inventário: pilhas com quantidade positiva; objetos roubados com valor; um só monte de cada coisa que empilha
  if (!Array.isArray(p.inv) || p.inv.some((x) => !x || !(stackable(x.id) ? Number.isSafeInteger(x.n) && x.n > 0 && (x.id === 'balas' || (Number.isSafeInteger(x.v) && x.v >= 0)) : goodItem(x)))) bad.push('inv');
  else { const ids = p.inv.filter((x) => stackable(x.id) || gearOf(x.id)?.slot === 'mat').map((x) => x.id); if (new Set(ids).size !== ids.length) bad.push('inv dup'); }
  // golpe grande: um de cada vez, com o que se pagou; contactos e avença
  if (p.op !== null && !(p.op && CFG.ops[p.op.i] && Number.isSafeInteger(p.op.t0) && Number.isSafeInteger(p.op.ready) && p.op.ready >= p.op.t0 && Number.isSafeInteger(p.op.paid) && p.op.paid >= CFG.ops[p.op.i].cost)) bad.push('op');
  if (!Number.isSafeInteger(p.opPause) || p.opPause < 0) bad.push('opPause');
  if (!Number.isSafeInteger(p.ilegal) || p.ilegal < 0) bad.push('ilegal');
  if (!Number.isSafeInteger(p.contacts) || p.contacts < 0 || p.contacts > CFG.jail.contactsMax) bad.push('contacts');
  if (typeof p.avenca !== 'boolean' || !Number.isSafeInteger(p.avN) || p.avN < 0 || !Number.isSafeInteger(p.jf) || p.jf < 0 || p.jf > CFG.jail.favors) bad.push('avença/favores');
  if (!Array.isArray(p.hmT) || p.hmT.length > CFG.hitman.perDay || p.hmT.some((t) => !Number.isSafeInteger(t)) || !Number.isSafeInteger(p.hmSafe) || p.hmSafe < 0) bad.push('hitman');
  if ((p.gang === null) !== (p.gb === null)) bad.push('gang/gb');
  if (!Number.isSafeInteger(p.gbotLeft) || p.gbotLeft < 0) bad.push('gbotLeft');
  if (!Array.isArray(p.gbz) || p.gbz.length !== CFG.gang.biz.length) bad.push('gang biz');
  else p.gbz.forEach((s, k) => {
    for (const f of ['inv', 'coop', 'stored', 'rem', 't']) if (!Number.isSafeInteger(s[f]) || s[f] < 0) bad.push(`gbz.${f}=${s[f]}`);
    if (s.coop > CFG.gang.bizCoopMax || s.inv > gangBizCap(p, k) || (!p.gang && (s.inv || s.stored || s.coop))) bad.push('gang biz ' + k);
  });
  if (p.gb) { const G = CFG.gang; for (const k of ['loot', 'atk', 'def']) if (!Number.isSafeInteger(p.gb[k]) || p.gb[k] < 0 || p.gb[k] > (k === 'loot' ? G.lootBpPer : G.fightBpPer) * G.maxLevel) bad.push('gb.' + k); }
  if (!Array.isArray(p.detoxT) || p.detoxT.length > CFG.detox.maxSteps) bad.push('detox list');
  if (!Number.isSafeInteger(p.mi) || p.mi < 0 || p.mi > CFG.missions.length) bad.push('mission index');
  if (!Array.isArray(p.mq) || p.mq.length + p.mi !== CFG.missions.length || new Set(p.mq).size !== p.mq.length || p.mq.some((i) => !CFG.missions[i])) bad.push('mission queue');
  for (const k of Object.keys(p.c)) if (!Number.isSafeInteger(p.c[k]) || p.c[k] < 0) bad.push(`counter ${k}`);
  if (p.wk.length !== CFG.crimes.length || p.wk.some((n) => !Number.isSafeInteger(n) || n < 0)) bad.push('mastery');
  if (p.c.wins !== p.wk.reduce((s, n) => s + n, 0)) bad.push('wins!=mastery');
  for (const s of ['F', 'I', 'C']) if (!Number.isSafeInteger(p.xp?.[s]) || p.xp[s] < 0 || p.xp[s] >= practiceNeed(p, s)) bad.push(`xp ${s}=${p.xp?.[s]}`);
  if (p.energyT > p.t || p.addictionT > p.t) bad.push('timer in future');
  if (p.cls !== '' && !CFG.classes.some((c) => c.id === p.cls)) bad.push('class');
  if (!Array.isArray(p.stock) || p.stock.length !== CFG.drugs.length || p.stock.some((x) => !Number.isSafeInteger(x) || x < 0)) bad.push('stock');
  if (!Array.isArray(p.dst) || p.dst.length !== CFG.deal.list.length || p.dst.some((x) => !Number.isSafeInteger(x) || x < 0)) bad.push('dst');
  if (!p.sk || CFG.skills.fams.some((f) => !Number.isSafeInteger(p.sk[f]) || p.sk[f] < 0)) bad.push('skills');
  if (!Number.isInteger(p.job) || p.job < -1 || p.job >= CFG.jobs.list.length || (p.job >= 0 && !jobOpen(p, p.job))) bad.push('job');
  if (p.sh !== null && !(p.sh && Number.isSafeInteger(p.sh.n) && p.sh.n >= 1 && p.sh.n <= CFG.jobs.perDay && typeof p.sh.d === 'string')) bad.push('shifts');
  if (p.course !== null && !(p.course && courseOf(p.course.id) && Number.isSafeInteger(p.course.end) && !p.done.includes(p.course.id))) bad.push('course');
  if (p.course && p.course.q) { const q = p.course.q, B = (CFG.exam.ans[examBank(p.course.id)] || []).length;   // v80: o exame aberto
    if (!p.course.ex || !Array.isArray(q.ids) || q.ids.length !== CFG.exam.n || new Set(q.ids).size !== q.ids.length || q.ids.some((i) => !Number.isInteger(i) || i < 0 || i >= B) || !Number.isSafeInteger(q.t)
      || !Array.isArray(q.p) || q.p.length !== q.ids.length || q.p.some((x) => !Array.isArray(x) || [...x].sort().join() !== '0,1,2,3')) bad.push('exam'); }
  if (!p.sx || STATS.some((k) => !Number.isInteger(p.sx[k]) || p.sx[k] < 0 || p.sx[k] > 999)) bad.push('sx');   // v82
  if (!p.mt || Object.entries(p.mt).some(([k, v]) => !MAT_IDS.includes(k) || !Number.isInteger(v) || v < 1 || v > CFG.mat.cap)) bad.push('mt');   // v83
  if (p.cf !== null && !(p.cf && recipeOf(p.cf.id) && recipeOf(p.cf.id).kind !== 'comp' && Number.isSafeInteger(p.cf.t0) && Number.isSafeInteger(p.cf.end) && p.cf.end >= p.cf.t0)) bad.push('cf');
  if (!p.maq || Object.entries(p.maq).some(([k, v]) => !Number.isSafeInteger(v) || v <= 0 || bizIdx(k) < 0)) bad.push('maq');
  if (p.gs && !(STATS.includes(p.gs.stat) && CFG.train.set.reps.includes(p.gs.reps) && Number.isSafeInteger(p.gs.t0))) bad.push('gs');
  if (p.course && p.course.ex && !(Number.isInteger(p.course.cuts) && p.course.cuts >= 0 && p.course.cuts <= CFG.exam.cuts)) bad.push('exam cuts');
  if (!Array.isArray(p.done) || p.done.some((id) => !courseOf(id)) || new Set(p.done).size !== p.done.length) bad.push('courses done');
  if (!Array.isArray(p.stk) || p.stk.length !== CFG.stocks.list.length || p.stk.some((h) => !h || !Number.isSafeInteger(h.n) || h.n < 0 || !Number.isSafeInteger(h.cost) || h.cost < 0 || !Number.isSafeInteger(h.gen) || (h.n === 0 && h.cost !== 0)
    || ['tp', 'sl'].some((x) => h[x] !== undefined && !(Number.isSafeInteger(h[x]) && h[x] > 0 && h.n > 0)) || (h.tp && h.sl && h.sl >= h.tp))) bad.push('shares');
  if (typeof p.acct !== 'boolean') bad.push('accountant');
  if (!Array.isArray(p.hold) || p.hold.some((d, i) => !Number.isInteger(d) || !CFG.drugs[d] || p.hold.indexOf(d) !== i)) bad.push('held drugs');
  if (p.port.some((c) => c.k !== undefined && !(Number.isInteger(c.k) && CFG.port.ships[c.k]))) bad.push('port ship');
  // armazéns: o de Lisboa sempre; os outros nulos ou com as melhorias de 1 a 5, o stock e o calor dentro dos limites
  if (!p.wh || REG().some((r) => { const w = p.wh[r]; if (w === null) return r === 'lx';
    return !(w && WH_UPS.every((k) => Number.isInteger(w[k]) && w[k] >= 1 && w[k] <= 5) && Number.isSafeInteger(w.h) && w.h >= 0 && w.h <= 10000 && Number.isSafeInteger(w.f) && w.f >= 0
      && (r === 'lx' ? w.s === undefined : Array.isArray(w.s) && w.s.length === CFG.drugs.length && w.s.every((x) => Number.isSafeInteger(x) && x >= 0))); })) bad.push('warehouses');
  if (!(p.seeds >= 0 && p.seeds <= CFG.grow.seedsMax) || REG().some((r) => { const w = p.wh[r]; return w && w.g !== undefined && !(Array.isArray(w.g) && w.g.length <= 12 && w.g.every((x) => x === null || (Number.isSafeInteger(x.t0) && typeof x.pr === 'boolean'))); })) bad.push('estufa');   // v120
  if (!Array.isArray(p.mv) || p.mv.length > CFG.mv.max || p.mv.some((v) => !v || !tradable(v.d) || !REG().includes(v.a) || !REG().includes(v.b) || v.a === v.b || !p.wh[v.b] || !Number.isSafeInteger(v.n) || v.n < 1
    || !Number.isSafeInteger(v.at) || v.at !== v.t0 + mvHops(v.a, v.b) * CFG.mv.hopMs || ![0, 1, 2].includes(v.x))) bad.push('moves');
  if (!Array.isArray(p.mvLog) || p.mvLog.length > CFG.mv.log || !Array.isArray(p.rz) || p.rz.length > CFG.wh.log) bad.push('move/raid logs');
  for (const k of ['club', 'bro']) { const v = p[k]; if (v === null) continue;
    if (!(v && Number.isInteger(v.lvl) && v.lvl >= 1 && v.lvl <= CFG.venue[k].cost.length && Number.isSafeInteger(v.till) && v.till >= 0 && Number.isSafeInteger(v.rem) && v.rem >= 0 && Number.isSafeInteger(v.t) && CFG.venue.prices[v.pi] !== undefined && CFG.venue.gdisc[v.gd] !== undefined)) bad.push(k);
    else if (k === 'bro' && !(Array.isArray(v.girls) && v.girls.length <= CFG.venue.bro.rooms[v.lvl - 1] && v.girls.every((i) => CFG.hookers.list[i]))) bad.push('bro girls'); }
  if (p.air !== null && !(p.air && CFG.air.routes[p.air.r] && Number.isSafeInteger(p.air.amount) && p.air.amount >= CFG.air.minAmount && Number.isSafeInteger(p.air.readyAt) && p.air.readyAt === p.air.t0 + CFG.air.routes[p.air.r].ms && typeof p.air.bribe === 'boolean')) bad.push('air');
  if (typeof p.sick !== 'boolean') bad.push('sick');
  if (!Number.isSafeInteger(p.house) || p.house < 0 || p.house >= CFG.house.tiers.length) bad.push('house');
  if (!Array.isArray(p.hu) || p.hu.length !== CFG.house.ups.length || p.hu.some((n) => !Number.isSafeInteger(n) || n < 0 || n > p.house)) bad.push('house upgrades');
  if (!Array.isArray(p.hkN) || p.hkN.length !== CFG.hookers.list.length || p.hkN.some((x) => !Number.isSafeInteger(x) || x < 0 || x > CFG.hookers.maxSteps) || !Array.isArray(p.hkAt) || p.hkAt.length !== p.hkN.length) bad.push('hooker list');
  if (!Number.isSafeInteger(p.av) || p.av < 0 || p.av >= CFG.avatars) bad.push('avatar');
  if (p.bj !== null && (typeof p.bj !== 'object' || !Number.isSafeInteger(p.bj.bet) || p.bj.bet < CFG.casino.minBet || !Array.isArray(p.bj.pl) || bjValue(p.bj.pl).tot > 21 || !Array.isArray(p.bj.next)
    || [...(p.bj.fin || []), ...(p.bj.q || [])].some((x) => !x || !Array.isArray(x.pl) || x.bet !== (x.dbl ? 2 : 1) * (p.bj.bet / (p.bj.dbl ? 2 : 1))) || (p.bj.fin || []).length + (p.bj.q || []).length > 1)) bad.push('blackjack');
  for (const k of Object.keys(p.fx)) { const f = p.fx[k]; if (!CFG.fxKinds.includes(k) || !Number.isSafeInteger(f.bp) || f.bp <= 0 || !Number.isSafeInteger(f.until)) bad.push('fx ' + k); }
  // v97: acessórios montados: só nas armas, que os aceitam, sem passar os espaços nem repetir a família
  for (const it of [...p.inv, ...Object.values(p.eq).filter(Boolean)]) if (it.m !== undefined) {
    const g = gearOf(it.id), ms = Array.isArray(it.m) ? it.m.map(modOf) : null;
    if (!g || !ms || !ms.length || ms.some((m) => !m || !m.fits.includes(g.t)) || ms.length > (g.ms || 0) || new Set(ms.map((m) => m.cat)).size !== ms.length) bad('mods ' + it.id);
  }
  // v94/v95: ginásios e livros
  if (!p.gyms.every((g) => gymOf(g) && g !== 'prisao') || new Set(p.gyms).size !== p.gyms.length || !p.gyms.includes(p.gym) || !(p.gx >= 0)) bad.push('gyms');
  for (const [k, n] of Object.entries(p.bk.own)) if (!bookOf(k) || !Number.isSafeInteger(n) || n <= 0) bad.push('book ' + k);
  if (bookOwned(p) > CFG.books.cap) bad.push('books>cap');
  if (p.bk.rd && (!bookOf(p.bk.rd.id) || !(p.bk.rd.end > p.bk.rd.t0))) bad.push('book reading');
  if (p.bk.on && (!bookOf(p.bk.on.id) || !Number.isSafeInteger(p.bk.on.until))) bad.push('book on');
  if (p.hon) for (const k of Object.keys(p.hon)) if (!honorOf(k) || !Number.isSafeInteger(p.hon[k])) bad.push('hon ' + k);   // v100
  if (p.honSel != null && !(p.hon && p.hon[p.honSel])) bad.push('honSel');
  if (p.emp !== null && !empOk(p.emp)) bad.push('emp');   // v111
  if (!Array.isArray(p.cars) || p.cars.length > CFG.race.maxCars || p.cars.some((c) => !carOf(c.id) || !isInts(c.up, 3, 0, CFG.race.upBp.length)) || new Set(p.cars.map((c) => c.id)).size !== p.cars.length) bad.push('cars');   // v112
  if (p.cars.length ? !p.cars[p.car] : p.car !== -1) bad.push('car');
  if (!p.rcn || !Number.isSafeInteger(p.rcn.n) || p.rcn.w > p.rcn.n || p.rcn.pod > p.rcn.n) bad.push('rcn');
  if (!p.pkn || !Number.isSafeInteger(p.pkn.h) || p.pkn.w > p.pkn.h || !(p.pkn.big >= 0)) bad.push('pkn');
  if (p.pkd !== null && (!p.pkd || !Number.isSafeInteger(p.pkd.n) || p.pkd.n < 0)) bad.push('pkd');
  if (p.jsr !== null && (!p.jsr || !Number.isSafeInteger(p.jsr.t0) || ![0, 1, 2].includes(p.jsr.ap))) bad.push('jsr');
  if (!Number.isSafeInteger(p.vip) || p.vip < 0 || (p.crd !== null && !(p.crd.n >= 0 && p.crd.n <= 10 && (p.crd.x || 0) <= 10))) bad.push('vip');
  if (!p.evs || typeof p.evs !== 'object' || Object.values(p.evs).some((r) => !r || !Number.isSafeInteger(r.n) || r.n < 0 || !Number.isSafeInteger(r.got) || !(r.dn >= 0 && r.dn <= CFG.events.dayCap))) bad.push('eventos');
  if (!Number.isFinite(p.rc)) bad.push('rc');
  if (p.emp && p.job !== -1) bad.push('emp/job');
  if (p.honVit != null && (!Array.isArray(p.honVit) || p.honVit.length > CFG.social.vitMax || p.honVit.some((k) => !(p.hon && p.hon[k])))) bad.push('honVit');   // v109
  if (p.biz.length !== CFG.biz.length) bad.push('biz length');
  p.biz.forEach((s, i) => {
    for (const k of ['n', 'stored', 'rem', 't']) if (!Number.isSafeInteger(s[k]) || s[k] < 0) bad.push(`biz.${k}=${s[k]}`);
    if (s.rem >= T.HOUR) bad.push('biz remainder overflow');
    if (s.n > bizMaxOf(i)) bad.push('biz over max');
    if (s.g !== undefined && s.g !== true) bad.push('biz goods flag');
  });
  return bad;
}
