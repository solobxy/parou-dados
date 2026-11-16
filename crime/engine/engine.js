// Motor do jogo: regras puras, sem rede nem base de dados.
// Cada ação recebe o jogador, o instante (ms, hora do servidor), o "mundo" (ronda)
// e, quando há sorte envolvida, um gerador aleatório. Tudo em inteiros.

import { CFG, T } from './config.js';
import { localParts } from './time.js';

export class GameError extends Error {
  constructor(code, extra = {}) { super(code); this.code = code; Object.assign(this, extra); }
}
const fail = (code, extra) => { throw new GameError(code, extra); };
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
    eq: eqNew(), inv: [], guard: -1, tool: -1, gweapon: -1, hmT: [], hmSafe: 0,   // equipamento no corpo (passo 4) e inventário
    luxuries: 0,
    gang: null, gb: null, gangLeft: 0, gbotLeft: 0, gh: [], gbz: gbzNew(),
    detoxT: [],
    xp: { F: 0, I: 0, C: 0 },
    wk: CFG.crimes.map(() => 0),   // sucessos por golpe (para os objetivos)
    sk: skNew(),                   // skills: stamina gasta em cada família de golpe
    job: -1, sh: null, course: null, done: [],   // emprego (índice em CFG.jobs.list), turnos de hoje { d, n }, curso a decorrer { id, end } e cursos feitos
    c: { crimes: 0, wins: 0, trains: 0, refills: 0, collects: 0, pvpWins: 0, ports: 0, shifts: 0 },
    mi: 0,                         // objetivos já recebidos
    mq: CFG.missions.map((_, i) => i), mrT: 0,   // os que faltam, pela ordem em que vão aparecer; e quando se trocou pela última vez
    titles: [],                    // títulos que ficam para sempre: { k: 'vet' } (veterano das rondas), { k: 'ep', n, d, pos } (pódio de uma época)
    cls: '', clsAt: 0, av: 0, fx: {}, sick: false, hkN: CFG.hookers.list.map(() => 0), hkAt: CFG.hookers.list.map(() => 0), house: 0, hu: CFG.house.ups.map(() => 0), bj: null,        // profissão, avatar e efeitos temporários (kind -> { bp, until })
  };
}

// jogadores gravados antes de uma regra nova ganham os campos que faltam
function migrate(p) {
  if (!Array.isArray(p.hold)) p.hold = [];
  if (typeof p.acct !== 'boolean') p.acct = false;
  if (!Array.isArray(p.detoxT)) p.detoxT = [];
  if (!p.xp) p.xp = { F: 0, I: 0, C: 0 };
  if (!Array.isArray(p.wk)) p.wk = CFG.crimes.map(() => 0);
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
}
// as listas de armas e proteções da versão 57 (índice → objeto), para passar o que cada um tinha
const W57 = ['soqueira', 'navalha', 'pistola', 'cacadeira', 'metralhadora', 'sniper'], A57 = ['cabedal', 'colete', 'balistico', 'kevlar', 'blindado', 'titanio'];
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
export const energyMax = (p) => (CFG.house.tiers[p.house] || CFG.house.tiers[0]).emax || CFG.energy.max;
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
  const { regenMs } = CFG.energy, max = energyMax(p);
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
  syncEnergy(p, now);
  syncVigor(p, now);
  syncAddiction(p, now);
  if (p.addiction > addictionCap(p)) p.addiction = addictionCap(p); // limite mudou nas regras
  if (p.jailUntil && p.jailUntil <= now) { p.jailUntil = 0; p.jailTier = 0; }
  if (p.hospUntil && p.hospUntil <= now) p.hospUntil = 0;
  settleClub(p, now); settleBro(p, now);   // os clientes da discoteca e do bordel até agora
  if (p.course && p.course.end <= now) { if (!p.done.includes(p.course.id)) p.done.push(p.course.id); p.course = null; }   // o curso acabou
  p.t = now;
}

function inRound(world, now) {
  if (now < world.start || now >= world.playEnd) fail('ROUND_CLOSED');
}

function begin(p, now, world, { allowBusy = false } = {}) {
  inRound(world, now);
  touch(p, now);
  if (!allowBusy) {
    if (p.jailUntil > now) fail('IN_JAIL', { until: p.jailUntil });
    if (p.hospUntil > now) fail('IN_HOSPITAL', { until: p.hospUntil });
  }
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
  for (const p of players) touch(p, now);
  for (let k = 0; k < G.biz.length; k++) {
    for (const p of players) {
      const s = p.gbz[k]; let coop = 0;
      if (s.inv > 0) { let sum = 0; for (const o of players) if (o !== p) sum += Math.min(o.gbz[k].inv, s.inv); coop = Math.min(G.bizCoopMax, Math.floor((G.bizCoopBp * sum) / s.inv)); }
      if (coop !== s.coop) { settleGbz(p, k, now); s.coop = coop; if (!changed.includes(p)) changed.push(p); }
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
const klass = (p) => CFG.classes.find((c) => c.id === p.cls) || {};
const up = (x, bp) => Math.floor((x * (10000 + bp)) / 10000);
const cut = (x, bp) => Math.floor((x * (10000 - bp)) / 10000);
export function buffBp(p, k, now) { const f = p.fx && p.fx[k]; return f && now !== undefined && f.until > now ? f.bp : 0; }
export function effStat(p, s, now) { const v = up(p.stats[s], buffBp(p, s, now)); return p.sick && now !== undefined ? cut(v, CFG.hookers.sickCutBp) : v; }
export function activeFx(p, now) { return CFG.fxKinds.filter((k) => buffBp(p, k, now) > 0).map((k) => ({ k, bp: p.fx[k].bp, until: p.fx[k].until })); }
function applyFx(p, g, now) {
  const out = [];
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
  begin(p, now, world, { allowBusy: true });
  if (!Number.isInteger(i) || i < 0 || i >= CFG.avatars) fail('NO_AVATAR');
  p.av = i;
  return { ok: true, av: i };
}
const huBp = (p, i) => (p.hu && CFG.house.ups[i] ? (p.hu[i] || 0) * CFG.house.ups[i].bp : 0);   // (já não há melhorias da casa)
export function bustChanceBp(p, now) {
  const acc = p.eq && p.eq.acess ? gearOf(p.eq.acess.id) : null;   // o rádio-scanner ouve a polícia a chegar
  const base = acc && acc.bustBp ? acc.bustBp : CFG.bustBp;
  return cut(cut(cut(base, klass(p).bustCutBp || 0), buffBp(p, 'bust', now)), huBp(p, 2));
}
// ---------- casa ----------
// a casa seguinte paga-se com a antiga na troca, pelo que ela custou
export function housePrice(p) { const n = CFG.house.tiers[p.house + 1]; return n ? n.price - CFG.house.tiers[p.house].price : null; }
export function buyHouse(p, now, world) {
  begin(p, now, world, { allowBusy: true });
  const n = CFG.house.tiers[p.house + 1];
  if (!n) fail('HOUSE_MAX');
  const price = housePrice(p);
  pay(p, price);
  p.house += 1;
  return { ok: true, price, respect: n.resp, levelUp: addRespect(p, n.resp, now) };
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
// calor da rua: a barra de golpes em que se vai hoje (cada 100 de stamina gasta em golpes de rua no mesmo dia)
function heatOf(p, now) {
  const H = CFG.street.heat, used = p.rua && p.rua.d === dayOf(now) ? p.rua.e : 0;
  return H[Math.min(H.length - 1, Math.floor(used / 100))];
}
export function streetView(p, now) { const d = dayOf(now), used = p.rua && p.rua.d === d ? p.rua.e : 0; return { used, heatBp: heatOf(p, now) }; }
// a arma de fogo que se usa nos golpes: a de mão, se ainda disparar; senão a principal. Se nenhuma dispara, a que houver (para dizer que está gasta).
export const gunOf = (p) => { const m = p.eq.mao, q = p.eq.principal; return m && m.u > 0 ? 'mao' : q && q.u > 0 ? 'principal' : m ? 'mao' : q ? 'principal' : null; };
const bulletsOf = (p) => { const b = p.inv.find((x) => x.id === 'balas'); return b ? b.n : 0; };
function gunCheck(p) {
  const s = gunOf(p);
  if (!s) fail('NEED_GUN');
  if (!(p.eq[s].u > 0)) fail('GUN_BROKEN');
  if (bulletsOf(p) < CFG.bullets.perJob) fail('NO_AMMO', { need: CFG.bullets.perJob });
  return s;
}

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
  const ammo = gun ? CFG.bullets.perJob : 0;
  if (gun) { takeInv(p, 'balas', ammo); p.eq[gun].u -= 1; }   // balas e um uso da arma: gastam-se antes, corra bem ou mal
  const bp = c.p, heatBp = heatOf(p, now), d = dayOf(now);
  settleAllBiz(p, now); // a prática pode subir stats: o rendimento até aqui conta com as antigas
  p.energy -= c.e;
  p.rua = { d, e: (p.rua && p.rua.d === d ? p.rua.e : 0) + c.e };
  p.sk[c.fam] += c.e;   // a skill sobe com a prática, corra bem ou mal
  // o primeiro carteirista de quem ainda não tem respeito nenhum corre sempre bem: a primeira jogada não pode ser a prisão
  const first = k === 0 && p.peakRespect === 0;
  if (first || rng.chance(bp)) {
    // o que vem é à sorte: escolhe-se a linha da tabela e depois o valor dentro dela
    let roll = rng.int(0, 9999), row = c.prizes[c.prizes.length - 1];
    for (const pr of c.prizes) { if (roll < pr[0]) { row = pr; break; } roll -= pr[0]; }
    const base = rng.int(row[1], row[2]);
    const bonus = 10000 + skillBp(p, c.fam) + (klass(p).lootBp || 0) + buffBp(p, 'loot', now) + gbp(p, 'loot');
    const value = Math.floor((Math.floor((base * bonus) / 10000) * heatBp) / 10000);
    // o que é objeto vai para o inventário (com o valor que saiu); sem espaço, vende-se logo à pressa por metade
    let money = value, good = null, rushed = false;
    if (CFG.loot.goods.includes(row[3])) {
      if (addGood(p, row[3], value)) { money = 0; good = row[3]; } else { money = Math.floor((value * CFG.loot.rushBp) / 10000); rushed = true; }
    }
    p.cash += money;
    p.c.crimes += 1; p.c.wins += 1; p.wk[k] += 1;
    // respeito: uma barra de golpes vale 20 + 2 por nível (até 120), vezes o calor; dá-se nos golpes que correm bem
    const S = CFG.street, perBar = Math.min(S.respCap, S.respBase + S.respPerLevel * level(p));
    // por golpe que corre bem: perBar × e/100 a dividir pela hipótese, para a barra dar em média perBar; o resto (em milésimos)
    // fica guardado para o golpe seguinte, para não se perder nos arredondamentos
    const milli = Math.floor((perBar * c.e * heatBp * 10) / bp) * (10000 + (klass(p).respBp || 0)) / 10000 + (p.rc || 0);
    const resp = Math.floor(milli / 1000);
    p.rc = Math.floor(milli - resp * 1000);
    const lvl = addRespect(p, resp, now);
    const gained = practice(p, c, true);
    return { ok: true, success: true, money, value, good, rushed, base, item: row[3], crit: false, respect: resp, levelUp: lvl, chanceBp: bp, heatBp, ammo, gained, newChanceBp: bp, star: 0 };
  }
  p.c.crimes += 1;
  // falhar não é sempre prisão: uma falha em quatro é apanhada
  const busted = rng.chance(bustChanceBp(p, now));
  if (busted) { p.jailUntil = now + c.jailMin * T.MIN; p.jailTier = k + 1; }
  const gained = practice(p, c, false);
  return { ok: true, success: false, busted, jailUntil: p.jailUntil, chanceBp: bp, heatBp, ammo, gained, newChanceBp: bp };
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
    busted: false, jailUntil: 0, levelUp: null, gained: {}, star: 0, chanceBp: c.p, heatBp: heatOf(p, now), newChanceBp: c.p, items: {} };
  const budget = Math.min(CFG.crimeAllMax, Math.floor(p.energy / c.e));
  const gunOk = () => { if (!c.gun) return true; try { gunCheck(p); return true; } catch { return false; } };
  while (out.n < budget && p.energy >= c.e && gunOk()) {
    const r = doCrime(p, now, world, k, rng);
    out.n += 1; out.ammo += r.ammo;
    for (const [s, g] of Object.entries(r.gained)) out.gained[s] = (out.gained[s] || 0) + g;
    if (r.success) {
      out.wins += 1; out.money += r.money; out.value = (out.value || 0) + r.value; out.respect += r.respect;
      if (r.good) { out.goods = out.goods || {}; out.goods[r.good] = (out.goods[r.good] || 0) + r.value; out.goodsN = (out.goodsN || 0) + 1; }
      if (r.rushed) out.rushed = (out.rushed || 0) + 1;
      out.items[r.item] = (out.items[r.item] || 0) + 1;
      if (r.value > out.best) { out.best = r.value; out.bestItem = r.item; }
      if (r.star) out.star = r.star;
      if (r.levelUp) out.levelUp = { from: out.levelUp ? out.levelUp.from : r.levelUp.from, to: r.levelUp.to };
    } else if (r.busted) { out.busted = true; out.jailUntil = r.jailUntil; break; }
  }
  out.heatEnd = heatOf(p, now);
  return out;
}

// multa/fiança: a do golpe que te prendeu, proporcional ao tempo que falta
export function bailCost(p, now) {
  if (!(p.jailUntil > now)) return 0;
  const c = CFG.crimes[p.jailTier - 1] || CFG.crimes[CFG.crimes.length - 1];
  const left = p.jailUntil - now, total = c.jailMin * T.MIN;
  const full = cut(c.fine, klass(p).bailCutBp || 0);
  return Math.max(1, Math.ceil((full * Math.min(left, total)) / total));
}

export function payBail(p, now, world) {
  begin(p, now, world, { allowBusy: true });
  if (!(p.jailUntil > now)) fail('NOT_IN_JAIL');
  const cost = bailCost(p, now);
  pay(p, cost);
  p.jailUntil = 0; p.jailTier = 0;
  return { ok: true, cost };
}

// safar um membro da mesma gangue: paga-se a fiança ou o hospital dele (o preço é o dele, quem paga é outro)
export function bailFor(payer, target, now, world) {
  begin(payer, now, world, { allowBusy: true });
  if (payer === target || payer.id === target.id) fail('SELF');
  if (!payer.gang || payer.gang !== target.gang) fail('NO_GANG');
  touch(target, now);
  if (!(target.jailUntil > now)) fail('NOT_IN_JAIL');
  const cost = bailCost(target, now);
  pay(payer, cost);
  target.jailUntil = 0; target.jailTier = 0;
  return { ok: true, cost };
}
export function medicFor(payer, target, now, world) {
  begin(payer, now, world, { allowBusy: true });
  if (payer === target || payer.id === target.id) fail('SELF');
  if (!payer.gang || payer.gang !== target.gang) fail('NO_GANG');
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

export function payMedic(p, now, world) {
  begin(p, now, world, { allowBusy: true });
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
// o preço é o da escada de stamina do dia (a das barras a droga) pelo que ela dá, vezes o dela; mais 4% por cada degrau dela
export function hookerPrice(p, i, now) {
  const H = CFG.hookers, g = H.list[i];
  const from = now !== undefined && p.rf && p.rf.d === dayOf(now) ? p.rf.e : 0;
  let price = Math.max(1, Math.ceil((refillCost(from, g.e) * g.valueBp) / 10000));
  const n = Math.min(hookerSteps(p, i, now), H.maxSteps); // só conta, não mexe: uma visita recusada não muda nada
  for (let k = 0; k < n; k++) price = Math.ceil((price * H.stepNum) / H.stepDen);
  return Math.max(1, cut(price, klass(p).hkCutBp || 0));
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
  const got = Math.min(g.e, energyMax(p) - p.energy), d = dayOf(now);
  p.energy += got;
  p.rf = { d, e: (p.rf && p.rf.d === d ? p.rf.e : 0) + got };   // sobe a escada do dia como uma barra
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

// Stamina a mais, a droga (base nova): cada barra de 100 no mesmo dia custa 35 € × k + 15 € × k² (50, 130, 240, 380 €…).
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
  const today = now === undefined ? null : dayOf(now), from = p.rf && p.rf.d === today ? p.rf.e : 0;
  return { energy: room, cost: refillCost(from, room), next: barPrice(Math.floor(from / 100) + 1), counts: CFG.drugs.map(() => 0) };
}
export function refill(p, now, world) {
  begin(p, now, world);
  const plan = refillPlan(p, now);
  if (!plan) fail('ENERGY_FULL');
  pay(p, plan.cost);
  const d = dayOf(now);
  p.rf = { d, e: (p.rf && p.rf.d === d ? p.rf.e : 0) + plan.energy };
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
export const jobOpen = (p, i) => { const x = jobOf(i); return !!x && (!x.course || p.done.includes(x.course)); };
export function shiftsToday(p, now) { return p.sh && p.sh.d === dayOf(now) ? p.sh.n : 0; }
// o que paga o turno n (1 a 6) de um emprego: os seis somam exatamente o dia
export function shiftPay(x, n) { const P = CFG.jobs.perDay; return Math.floor((x.day * n) / P) - Math.floor((x.day * (n - 1)) / P); }

export function chooseJob(p, now, world, i) {
  const x = jobOf(i);
  if (!x) fail('NO_JOB');
  begin(p, now, world, { allowBusy: true });
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

export function startCourse(p, now, world, id) {
  const c = courseOf(id);
  if (!c) fail('NO_COURSE');
  begin(p, now, world, { allowBusy: true });
  if (p.done.includes(id)) fail('COURSE_DONE');
  if (p.course) fail('COURSE_BUSY', { until: p.course.end });
  if (c.needs && !p.done.includes(c.needs)) fail('NEED_COURSE', { course: c.needs });
  if (c.level && level(p) < c.level) fail('LOW_LEVEL', { need: c.level });
  pay(p, c.price);
  p.course = { id, end: now + c.days * T.DAY };
  return { ok: true, id, price: c.price, end: p.course.end };
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
  const money = Math.floor((g * CFG.drugs[d].price * (10000 + skillBp(p, 'trafico'))) / 10000), day = dayOf(now);   // a skill de tráfico sobe o que se ganha
  p.energy -= D.step; p.dst[j] -= g; p.cash += money; p.sk.trafico += D.step;
  p.dl = { d: day, n: dealUsed(p, now) + 1 };
  const resp = Math.max(1, Math.round(((D.respBase + D.respPerLevel * level(p)) * D.step) / 100));
  const lvl = addRespect(p, resp, now);
  return { ok: true, grams: g, money, d, respect: resp, levelUp: lvl, left: dealCap(p) - p.dl.n };
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

// ---------- treino ----------

export function trainCost(p, stat) { return CFG.train.costBase + p.stats[stat] * CFG.train.costPerStat; }

export function train(p, now, world, stat) {
  if (!STATS.includes(stat)) fail('NO_STAT');
  begin(p, now, world);
  if (p.vigor < CFG.train.energy) fail('NO_VIGOR', { need: CFG.train.energy });
  const cost = trainCost(p, stat);
  pay(p, cost);
  settleAllBiz(p, now); // o rendimento até agora conta com a stat antiga
  p.vigor -= CFG.train.energy;
  p.stats[stat] += 1;
  p.c.trains += 1;
  return { ok: true, stat, value: p.stats[stat], cost };
}

// ---------- negócios ----------

export function bizPrice(i, n) {
  let price = CFG.biz[i].price;
  for (let k = 0; k < n; k++) price += Math.floor(price / CFG.priceStepDiv);
  return price;
}

export function bizRates(p, i) {
  const b = CFG.biz[i];
  const n = p.biz[i].n;
  const st = Math.min(p.stats[b.stat], CFG.statMultCap);
  const perH = up(Math.floor((b.perH * n * (CFG.statMultDiv + st)) / CFG.statMultDiv), (klass(p).bizBp || 0) + huBp(p, 3));
  return { perH };
}

// quanto tempo de rendimento cabe no armazém: 8 h, ou 24 h com contabilista
export const bizCapMs = (p) => CFG.storageMs * (p.acct ? CFG.accountant.capMult : 1);
// a parte do contabilista: uma fatia do que está guardado acima do armazém normal (o que sem ele se tinha perdido)
export function bizFee(p, i, stored) {
  if (!p.acct) return 0;
  const capN = bizRates(p, i).perH * (CFG.storageMs / T.HOUR);
  return stored > capN ? Math.floor(((stored - capN) * CFG.accountant.feeBp) / 10000) : 0;
}
const BIZ_DRUG = CFG.biz.map((b) => (b.drug ? CFG.drugs.findIndex((x) => x.id === b.drug) : -1));
function settleBiz(p, i, now) {
  const s = p.biz[i];
  if (s.n === 0 || now <= s.t) { s.t = Math.max(s.t, now); return; }
  const { perH } = bizRates(p, i);
  const capM = perH * (bizCapMs(p) / T.HOUR);
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
  return copy.map((s, i) => ({ money: s.stored, fee: bizFee(ghost, i, s.stored) }));
}

export function buyBiz(p, now, world, i) {
  if (!Number.isInteger(i) || !CFG.biz[i]) fail('NO_BIZ');
  begin(p, now, world);
  if (p.biz[i].n >= CFG.bizMax) fail('BIZ_MAX');
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
    money = up(money, buffBp(p, 'biz', now));   // sob efeito, a recolha rende mais
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

export function portCap(p) {
  let cap = CFG.port.capBase;
  for (let i = 1; i < tier(p); i++) cap = Math.floor((cap * CFG.port.capNum) / CFG.port.capDen);
  return cap;
}
export function portSlots(p) { return 1 + Math.floor(tier(p) / CFG.port.slotsEveryLevels); }

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
  const readyAt = now + S.ms;
  if (readyAt > world.playEnd) fail('ROUND_ENDING');
  pay(p, amount);
  p.port.push(goods === true ? { k, amount, readyAt, d: SHIP_DRUG[k] } : { k, amount, readyAt });
  p.c.ports += 1;
  return { ok: true, k, readyAt };
}

// Um carregamento que chegou: ou a polícia o apreendeu, ou volta o que se enviou mais o lucro (em dinheiro ou em droga para o armazém).
// A sorte só se tira aqui, ao descarregar: até lá ninguém sabe o que vem lá dentro.
function landShip(p, c, rng) {
  const k = shipIdx(c);
  if (rng.chance(portSeizeBp(p, k))) return { k, amount: c.amount, got: 0, seized: true };
  const got = c.amount + Math.floor((c.amount * CFG.port.ships[k].gainBp) / 10000);
  if (c.d !== undefined) return { k, amount: c.amount, got, seized: false, ...toGoods(p, c.d, got) };   // veio em droga: entra no armazém
  p.cash += got;
  return { k, amount: c.amount, got, seized: false };
}
// descarrega tudo o que já chegou, de uma vez
export function collectPort(p, now, world, rng) {
  begin(p, now, world, { allowBusy: true });
  const out = [];
  p.port = p.port.filter((c) => {
    if (c.readyAt > now) return true;
    out.push(landShip(p, c, rng));
    return false;
  });
  return { ok: true, items: out };
}
// Abre um só carregamento, o que chegou à hora `at` (é assim que o ecrã do porto o identifica: os carregamentos não têm número).
// left = quantos outros já chegaram e ficam por abrir.
export function openPort(p, now, world, rng, at) {
  begin(p, now, world, { allowBusy: true });
  const i = p.port.findIndex((c) => c.readyAt === at);
  if (i < 0) fail('NO_CARGO');
  if (p.port[i].readyAt > now) fail('SHIP_AT_SEA', { until: p.port[i].readyAt });
  const [c] = p.port.splice(i, 1);
  return { ok: true, item: landShip(p, c, rng), left: p.port.filter((x) => x.readyAt <= now).length };
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
export function airCollect(p, now, world, rng, keep = false) {
  begin(p, now, world, { allowBusy: true });
  const f = p.air;
  if (!f) fail('NO_FLIGHT');
  if (f.readyAt > now) fail('AIR_FLYING', { until: f.readyAt });
  const R = CFG.air.routes[f.r];
  p.air = null;
  if (rng.chance(airSeizeBp(p, f.r, f.bribe))) return { ok: true, r: f.r, amount: f.amount, got: 0, seized: true, respect: 0 };
  const got = f.amount + Math.floor((f.amount * R.gainBp) / 10000);
  const goods = keep ? toGoods(p, CFG.drugs.findIndex((x) => x.id === R.drug), got) : null;
  if (!goods) p.cash += got;
  return { ok: true, r: f.r, amount: f.amount, got, seized: false, respect: R.r, levelUp: addRespect(p, R.r, now), ...(goods || {}) };
}

// ---------- mercadoria e casas do jogador (discoteca e bordel) ----------
export function wholesale(d) { return Math.max(1, Math.floor((CFG.drugs[d].price * CFG.goods.wholesaleBp) / 10000)); }
export function dumpValue(d, n) { return Math.floor((n * wholesale(d) * CFG.goods.dumpBp) / 10000); }
// troca dinheiro por unidades ao preço de grosso; o troco fica em dinheiro
function toGoods(p, d, cash) { const w = wholesale(d), units = Math.floor(cash / w), rest = cash - units * w; p.stock[d] += units; p.cash += rest; return { d, units, rest }; }
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
  return Math.floor((Math.floor((base * V.volBp[b.pi]) / 10000) * (V.prices[b.pi] - V.girlBp)) / (10000 - V.girlBp));
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
  const ghost = { stock: p.stock.slice(), hold: Array.isArray(p.hold) ? p.hold.slice() : [], club: p.club ? { ...p.club } : null, bro: p.bro ? { ...p.bro, girls: p.bro.girls.slice() } : null };
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
// despachar o que está no armazém: paga um pouco menos do que custou
export function stockDump(p, now, world, d, n) {
  const g = Number.isInteger(d) ? CFG.drugs[d] : undefined;
  if (!g) fail('NO_DRUG');
  begin(p, now, world, { allowBusy: true });
  if (!Number.isSafeInteger(n) || n < 1 || n > p.stock[d]) fail('NO_STOCK');
  const got = dumpValue(d, n);
  p.stock[d] -= n; p.cash += got;
  return { ok: true, d, n, got };
}
export function broHire(p, now, world, i) {
  const g = Number.isInteger(i) ? CFG.hookers.list[i] : undefined;
  if (!g) fail('NO_HOOKER');
  begin(p, now, world);
  const b = p.bro; if (!b) fail('NO_VENUE');
  if (b.girls.length >= CFG.venue.bro.rooms[b.lvl - 1]) fail('NO_ROOM');
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
export function stockQuote(m, k, n) { const gross = Math.ceil((n * m.prices[k]) / 100); return gross + stockFee(gross); }   // o que custa comprar n ações agora
function stockArgs(m, k, n, seen) {
  if (!Number.isInteger(k) || !CFG.stocks.list[k]) fail('NO_STOCK_CO');
  if (!Number.isSafeInteger(n) || n < 1 || n > 1e9) fail('BAD_AMOUNT');
  if (!m || !Array.isArray(m.prices) || !Number.isSafeInteger(m.prices[k]) || m.prices[k] < 1) fail('NO_MARKET');
  if (seen !== undefined && seen !== m.prices[k]) fail('PRICE_CHANGED', { price: m.prices[k] });   // compra-se e vende-se só ao preço que se viu
}
export function stockBuy(p, now, world, m, k, n, seen) {
  stockArgs(m, k, n, seen);
  begin(p, now, world, { allowBusy: true });
  const total = stockQuote(m, k, n);
  const invested = CFG.stocks.list.reduce((s, _, j) => s + holding(p, m, j).cost, 0);
  if (invested + total > stockCap(p)) fail('STOCK_CAP', { cap: stockCap(p) });
  pay(p, total);
  const h = holding(p, m, k);
  p.stk[k] = { n: h.n + n, cost: h.cost + total, gen: m.gen[k], ...stkLim(h) };
  return { ok: true, k, n, price: m.prices[k], paid: total, fee: stockFee(Math.ceil((n * m.prices[k]) / 100)) };
}
export function stockSell(p, now, world, m, k, n, seen) {
  stockArgs(m, k, n, seen);
  begin(p, now, world, { allowBusy: true });
  const h = holding(p, m, k);
  if (n > h.n) fail('NO_SHARES');
  const gross = Math.floor((n * m.prices[k]) / 100), fee = Math.min(gross, stockFee(gross)), got = gross - fee;
  const part = n === h.n ? h.cost : Math.floor((h.cost * n) / h.n);   // parte do que se pagou que corresponde ao que se vende
  p.stk[k] = { n: h.n - n, cost: h.cost - part, gen: m.gen[k], ...(n < h.n ? stkLim(h) : {}) };
  p.cash += got;
  return { ok: true, k, n, price: m.prices[k], got, fee, profit: got - part };
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
    const gross = Math.floor((h.n * price) / 100), fee = Math.min(gross, stockFee(gross)), got = gross - fee;
    p.stk[k] = { n: 0, cost: 0, gen: m.gen[k] };
    p.cash += got;
    out.push({ k, n: h.n, price, got, fee, profit: got - h.cost, why });
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
export function luxuryPrice(p) { const x = CFG.luxury.list[p.luxuries]; return x ? x.price : null; }
export const luxuryRespect = (price) => Math.floor(Math.sqrt(price));
export function buyLuxury(p, now, world) {
  begin(p, now, world);
  const price = luxuryPrice(p);
  if (price === null) fail('LUXURY_MAX');
  pay(p, price);
  p.luxuries += 1;
  const resp = luxuryRespect(price);
  const lvl = addRespect(p, resp, now);
  return { ok: true, price, respect: resp, levelUp: lvl };
}

// ---------- armas e proteções ----------

const GEAR = { guard: 'guards', tool: 'tools', gweapon: 'gweapons' };
export function buyGear(p, now, world, kind, idx) {
  // quem tem o jogo aberto na versão antiga ainda pede «weapon»/«armor» por índice: passa para a compra nova
  if (kind === 'weapon' && W57[idx]) return buyItem(p, now, world, W57[idx]);
  if (kind === 'armor' && A57[idx]) return buyItem(p, now, world, A57[idx]);
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
// ataque: a melhor arma de fogo que não esteja estragada (mão ou principal) mais a arma branca; defesa: as peças do corpo todas
export function atkBp(p) {
  const fire = ['mao', 'principal'].map((s) => p.eq[s]).filter((x) => x && x.u > 0).map((x) => gearOf(x.id).atk);
  return Math.max(0, ...fire) + (p.eq.branca ? gearOf(p.eq.branca.id).atk : 0);
}
export function defBp(p) { return ['cabeca', 'tronco', 'pernas', 'pes', 'maos'].reduce((s, k) => s + (p.eq[k] ? gearOf(p.eq[k].id).def : 0), 0); }
export function attackPower(p, now) { return up(Math.floor((effStat(p, 'F', now) * (10000 + atkBp(p))) / 10000), (klass(p).atkBp || 0) + gbp(p, 'atk')); }
export function defensePower(p, now) { return up(Math.floor((effStat(p, 'T', now) * (10000 + defBp(p))) / 10000), (klass(p).defBp || 0) + huBp(p, 1) + gbp(p, 'def') + gearBp(CFG.guards, p.guard)); }

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
  begin(p, now, world, { allowBusy: true });
  if (level(p) < (g.level || 1)) fail('LOW_LEVEL', { need: g.level });
  const old = p.eq[g.slot];
  if (old && !roomFor(p)) fail('NO_ROOM');   // a que estava no corpo tem de caber no inventário
  pay(p, g.price);
  if (old) p.inv.push(old);
  p.eq[g.slot] = itemNew(id);
  return { ok: true, id, price: g.price, slot: g.slot, swapped: old ? old.id : null };
}
// vestir/usar uma peça do inventário: troca com a que está no corpo (que fica no lugar dela)
export function equip(p, now, world, i) {
  const it = Number.isInteger(i) ? p.inv[i] : undefined;
  const g = it ? gearOf(it.id) : undefined;
  if (!g) fail('NO_GEAR');
  begin(p, now, world, { allowBusy: true });
  const old = p.eq[g.slot];
  p.eq[g.slot] = it;
  if (old) p.inv[i] = old; else p.inv.splice(i, 1);
  return { ok: true, id: it.id, slot: g.slot, swapped: old ? old.id : null };
}
// recetador: um objeto roubado pelo valor que tem, uma peça de equipamento por metade (e pelo estado em que está), balas por metade
export function sellItem(p, now, world, i) {
  const it = Number.isInteger(i) ? p.inv[i] : undefined;
  if (!it) fail('NO_ITEM');
  begin(p, now, world, { allowBusy: true });
  let money;
  if (CFG.loot.goods.includes(it.id)) money = it.v;
  else if (it.id === 'balas') money = Math.floor((it.n * CFG.bullets.price * CFG.loot.gearSellBp) / (CFG.bullets.box * 10000));
  else { const g = gearOf(it.id); money = Math.floor((g.price * CFG.loot.gearSellBp * (g.gun ? it.u / g.life : 1)) / 10000); }
  p.inv.splice(i, 1);
  p.cash += money;
  return { ok: true, id: it.id, n: it.n || 1, money };
}
export function sellGoods(p, now, world) {
  begin(p, now, world, { allowBusy: true });
  let money = 0, n = 0;
  p.inv = p.inv.filter((x) => { if (!CFG.loot.goods.includes(x.id)) return true; money += x.v; n += x.n; return false; });
  if (!n) fail('NOTHING_TO_SELL');
  p.cash += money;
  return { ok: true, money, n };
}
// reparar uma arma de fogo no corpo: paga-se a parte gasta do preço
export function repairCost(p, slot) { const it = p.eq[slot]; if (!it || !it.id) return 0; const g = gearOf(it.id); return g.gun ? Math.ceil((g.price * (g.life - it.u)) / g.life) : 0; }
export function repair(p, now, world, slot) {
  if (!['mao', 'principal'].includes(slot) || !p.eq[slot]) fail('NO_GEAR');
  begin(p, now, world, { allowBusy: true });
  const price = repairCost(p, slot);
  if (!price) fail('NOT_WORN');
  pay(p, price);
  p.eq[slot].u = gearOf(p.eq[slot].id).life;
  return { ok: true, slot, price };
}

// ---------- ataques ----------

function prune(arr, now) { const lim = now - CFG.pvp.windowMs; while (arr.length && arr[0] <= lim) arr.shift(); }

// asVictim: foi mandado para o hospital por outro (conta para o limite de 4 em 24 h)
function hospitalize(p, now, ms, asVictim) {
  const P = CFG.pvp;
  p.hospUntil = now + cut(ms, klass(p).hospCutBp || 0);
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
export function canAttack(a, d, now, world, drop = false) {
  const P = CFG.pvp;
  if (a === d || a.id === d.id) return 'SELF';
  if (sameCrew(a, d)) return 'SAME_GANG';   // ninguém ataca a própria gangue (a gangue da rua não conta)
  if (now - world.start < CFG.round.noPvpMs) return 'NO_PVP_YET';
  if (a.jailUntil > now) return 'IN_JAIL';
  if (a.hospUntil > now) return 'IN_HOSPITAL';
  if (a.vigor < P.energy) return 'NO_VIGOR';
  if (a.shieldUntil > now && !drop) return 'YOU_ARE_NEW';
  if (d.shieldUntil > now) return 'TARGET_NEW';
  if (d.hospUntil > now) return 'TARGET_HOSPITAL';
  if (d.jailUntil > now) return 'TARGET_JAIL';
  if (d.protectUntil > now || d.capUntil > now) return 'TARGET_PROTECTED';
  if (d.respect * 10000 < a.respect * P.minTargetBp) return 'TARGET_TOO_WEAK';
  return null;
}

export function attackChanceBp(a, d, now) { return chanceBp(attackPower(a, now), defensePower(d, now)); }

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

export function attack(a, d, now, world, mode, rng, drop = false) {
  begin(a, now, world);
  touch(d, now);
  if (mode !== 'beat' && mode !== 'mug') fail('BAD_MODE');
  const why = canAttack(a, d, now, world, drop);
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
    const gain = Math.floor(base / div);
    let res;
    if (mode === 'beat') {
      const loss = Math.floor(gain / P.lossDiv);
      const lvA = addRespect(a, gain, now);
      addRespect(d, -loss, now);
      hospitalize(d, now, P.beatHospMs, true);
      res = { win: true, mode, respect: gain, targetLoss: loss, money: 0, levelUp: lvA };
    } else {
      settleAllBiz(d, now);
      const take = (x) => Math.floor(Math.floor((x * P.mugBp) / 10000) / div);
      let stolen = take(cut(d.cash, huBp(d, 0)));   // o cofre de casa guarda uma parte
      d.cash -= stolen;
      for (let i = 0; i < d.biz.length; i++) {
        if (!CFG.biz[i].raid) continue;
        const s = take(d.biz[i].stored);
        d.biz[i].stored -= s; stolen += s;
      }
      for (const k of ['club', 'bro']) if (d[k]) { const s = take(d[k].till); d[k].till -= s; stolen += s; }   // e o caixa da discoteca e do bordel
      a.cash += stolen;
      const g = Math.floor(gain / 4);
      const lvA = addRespect(a, g, now);
      hospitalize(d, now, P.mugHospMs, true);
      res = { win: true, mode, respect: g, targetLoss: 0, money: stolen, levelUp: lvA };
    }
    a.c.pvpWins += 1;
    if (!a.hits.has(d.id)) a.hits.set(d.id, []);
    a.hits.get(d.id).push(now);
    return { ok: true, chanceBp: bp, ...res };
  }
  const loss = Math.floor(base / P.lossDiv);
  addRespect(a, -loss, now);
  // quem se defende só ganha se o atacante tiver >= 25% do seu respeito (contra farm com contas falsas)
  const defGain = a.respect * 10000 >= d.respect * P.minTargetBp ? P.defendGain : 0;
  addRespect(d, defGain, now);
  hospitalize(a, now, P.beatHospMs, false);
  return { ok: true, chanceBp: bp, win: false, mode, respect: -loss, defenderGain: defGain };
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
    if (busted) { p.jailUntil = now + H.jailMin * T.MIN; p.jailTier = H.bailAs + 1; }
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
export function hitCanResolve(d, now, gang) { touch(d, now); return !(d.hospUntil > now || d.jailUntil > now || d.protectUntil > now || d.capUntil > now || d.shieldUntil > now || (gang && d.gang === gang)); }
// quem alinhou e entretanto foi preso ou parar ao hospital fica de fora (e recebe a stamina de volta)
export function opReady(p, now) { touch(p, now); return !(p.jailUntil > now || p.hospUntil > now); }
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
// k: quantas vezes o máximo por jogada se pode apostar (as compras de bónus das slots têm um teto mais alto)
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
  if (!mult || !Number.isSafeInteger(a.amt)) fail('BAD_BET');
  if (a.amt < CFG.casino.minBet) fail('BAD_BET');
  const bet = stakeOf(p, [a.amt * mult], buy ? CFG.casino.buyMaxMult : 1);
  p.cash -= bet;
  const sp = slotSpin(gid, rng, buy);
  const win = Math.floor((a.amt * sp.total) / 100);
  p.cash += win;
  return { ok: true, g: 'slot', game: gid, bet, base: a.amt, buy, win, spin: sp };
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
    case 'tier': { let t = 0; for (let k = 0; k < p.wk.length; k++) if (p.wk[k] > 0) t = k + 1; return t; }
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
  // inventário: pilhas com quantidade positiva; objetos roubados com valor; um só monte de cada coisa que empilha
  if (!Array.isArray(p.inv) || p.inv.some((x) => !x || !(stackable(x.id) ? Number.isSafeInteger(x.n) && x.n > 0 && (x.id === 'balas' || (Number.isSafeInteger(x.v) && x.v >= 0)) : goodItem(x)))) bad.push('inv');
  else { const ids = p.inv.filter((x) => stackable(x.id)).map((x) => x.id); if (new Set(ids).size !== ids.length) bad.push('inv dup'); }
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
  if (!Array.isArray(p.done) || p.done.some((id) => !courseOf(id)) || new Set(p.done).size !== p.done.length) bad.push('courses done');
  if (!Array.isArray(p.stk) || p.stk.length !== CFG.stocks.list.length || p.stk.some((h) => !h || !Number.isSafeInteger(h.n) || h.n < 0 || !Number.isSafeInteger(h.cost) || h.cost < 0 || !Number.isSafeInteger(h.gen) || (h.n === 0 && h.cost !== 0)
    || ['tp', 'sl'].some((x) => h[x] !== undefined && !(Number.isSafeInteger(h[x]) && h[x] > 0 && h.n > 0)) || (h.tp && h.sl && h.sl >= h.tp))) bad.push('shares');
  if (typeof p.acct !== 'boolean') bad.push('accountant');
  if (!Array.isArray(p.hold) || p.hold.some((d, i) => !Number.isInteger(d) || !CFG.drugs[d] || p.hold.indexOf(d) !== i)) bad.push('held drugs');
  if (p.port.some((c) => c.k !== undefined && !(Number.isInteger(c.k) && CFG.port.ships[c.k]))) bad.push('port ship');
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
  for (const s of p.biz) {
    for (const k of ['n', 'stored', 'rem', 't']) if (!Number.isSafeInteger(s[k]) || s[k] < 0) bad.push(`biz.${k}=${s[k]}`);
    if (s.rem >= T.HOUR) bad.push('biz remainder overflow');
    if (s.n > CFG.bizMax) bad.push('biz over max');
    if (s.g !== undefined && s.g !== true) bad.push('biz goods flag');
  }
  return bad;
}
