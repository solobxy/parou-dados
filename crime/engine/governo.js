// O Estado (v76, pedido de 17/11, 03:39): cofres, corrupção, popularidade, parlamento de 230 lugares com quatro partidos e leis
// votadas. Corre dentro da edição do mundo (mundo.js), depois das regiões e antes das empresas: um motor só.
// Tudo é por cabeça: os cofres guardam-se em euros por pessoa, a opinião da rua mistura os votos dos jogadores com 5 votos de fundo,
// e o dinheiro posto numa votação pesa contra 4 vezes o rendimento normal de uma edição por cabeça. A edição nunca percorre os jogadores.
// Puro: o servidor guarda o estado e chama isto; os testes e as simulações chamam o mesmo.
import { CFG } from './config.js';

const G = () => CFG.gov;
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
export const PARTIES = () => Object.keys(G().parties);
export const LAWS = () => Object.keys(G().laws);

export function newGov() {
  const P = G();
  return {
    cofPc: (P.cof.startPct / 100) * P.cof.reserveEds * P.cof.spendPc,   // euros por pessoa no cofre
    corr: P.corr.start, popu: P.popu.start,
    seats: Object.fromEntries(PARTIES().map((k) => [k, P.parties[k].seats])), pm: P.pm,
    laws: {},          // id -> edição em que entrou em vigor
    pend: [],          // { id, on, at }: passou e entra em vigor na edição at
    bill: null,        // { id, on, ed0, vote, yes, no, ly, ln }
    last: [],          // as últimas votações
    next: 0,           // a edição a partir da qual se propõe a lei seguinte
    hist: [],          // [ed, cofres %, corrupção, popularidade]
  };
}
export function govUp(w) {
  if (!w) return w;
  if (!w.gov || typeof w.gov !== 'object') w.gov = newGov();
  const g = w.gov, n = newGov();
  for (const k of Object.keys(n)) if (g[k] === undefined) g[k] = n[k];
  return w;
}

// ---------- os números à vista ----------
// cofres em percentagem da reserva (8 edições de despesa = 100%)
export const cofPct = (g) => { const C = G().cof; return clamp(Math.round((100 * g.cofPc) / (C.reserveEds * C.spendPc)), 0, 100); };
export const lawOn = (g, id) => !!(g && g.laws && g.laws[id] !== undefined && g.laws[id] !== null);
// o que o Estado mexe na pressão de todas as regiões: menos polícia com os cofres vazios, mais com eles cheios, +10 com o reforço
export function pressDelta(g) {
  if (!g) return 0;
  const C = G().cof, c = cofPct(g);
  return (lawOn(g, 'policia') ? G().laws.policia.press : 0) + (c < C.lowPct ? -C.pressStep : c > C.highPct ? C.pressStep : 0);
}
// o que o motor dos jogadores precisa de saber (leis em vigor e corrupção): passa-se com setGov antes de cada ação
export const govSnapshot = (g) => (g ? { laws: { ...g.laws }, corr: g.corr } : { laws: {}, corr: 0 });

// ---------- opinião da rua sobre uma proposta (0 a 1), pelos indicadores ----------
function npcOpinion(id, on, ind) {
  const { crime, cof, corr, popu } = ind;
  const base = {
    policia: 0.35 + (crime - 40) / 100 + (cof - 50) / 400,
    penas: 0.3 + (crime - 40) / 80,
    erva: 0.45 + (50 - cof) / 400,
    jogo: 0.55 + (50 - cof) / 200,
    luxo: 0.6 + (50 - cof) / 200,
    branq: 0.4 + (corr - 40) / 100,
    salario: 0.65 + (50 - popu) / 400,
    armas: 0.4 - (crime - 40) / 100,
  }[id] ?? 0.5;
  const x = on ? base : 1 - base;
  return clamp(x, 0.05, 0.95);
}
// a rua: os votos dos jogadores juntam-se aos de fundo (5 votos com a opinião dos indicadores)
export function streetOpinion(bill, ind) {
  const bg = G().vote.bg, p0 = npcOpinion(bill.id, bill.on, ind);
  return (bill.yes + bg * p0) / (bill.yes + bill.no + bg);
}
// o dinheiro posto numa votação: de -1 (tudo contra) a +1 (tudo a favor), contra um valor fixo que cresce com a gente
export function lobbyEffect(bill, pop) {
  const K = G().vote.lobbyK * G().vote.incomePc * pop;
  return (bill.ly - bill.ln) / (bill.ly + bill.ln + K);
}

// ---------- a votação ----------
// cada partido vota em bloco: a posição dele, mais o que a rua acha, mais o dinheiro, cada um com o seu peso; o partido do governo
// apoia as propostas do governo. Uma parte dos deputados de cada partido (sorteada) vota ao contrário.
export function partyScore(k, bill, op, lob, pm) {
  const P = G().parties[k], pos = (P.pos[bill.id] || 0) * (bill.on ? 1 : -1);
  return pos + (op - 0.5) * 4 * P.wOp + lob * 2 * P.wLob + (k === pm ? G().vote.pmBonus : 0);
}
export function countVotes(g, bill, ind, pop, rng) {
  const op = streetOpinion(bill, ind), lob = lobbyEffect(bill, pop), by = {};
  let yes = 0;
  for (const k of PARTIES()) {
    const s = g.seats[k] || 0, sc = partyScore(k, bill, op, lob, g.pm), bloc = sc > 0;
    const reb = rng ? Math.floor((s * rng.int(0, G().vote.rebelMaxPct)) / 100) : 0;
    const y = bloc ? s - reb : reb;
    by[k] = { y, n: s - y, bloc };
    yes += y;
  }
  const total = PARTIES().reduce((a, k) => a + (g.seats[k] || 0), 0);
  return { yes, no: total - yes, passed: yes >= G().vote.majority, by, op: Math.round(op * 100), lob: Math.round(lob * 100) };
}
// a contagem que o jornal publica antes da votação: sem os rebeldes, com margem de erro
export function pollVotes(g, bill, ind, pop) {
  const c = countVotes(g, bill, ind, pop, null), m = G().vote.pollMargin;
  return { yes: c.yes, lo: Math.max(0, c.yes - m), hi: c.yes + m, op: c.op };
}

// ---------- a proposta seguinte: o governo escolhe pelos indicadores, com uma parte de sorte ----------
function urgency(id, ind) {
  const { crime, cof, corr, popu } = ind;
  return {
    policia: crime - 45 + (cof - 50) / 5,
    penas: crime - 50,
    erva: (40 - cof) / 2 + 5,
    jogo: 50 - cof,
    luxo: 40 - cof,
    branq: corr - 45,
    salario: 45 - popu,
    armas: 35 - crime,
  }[id] ?? 0;
}
export function pickBill(g, ed, ind, rng) {
  const recent = new Set(g.last.filter((x) => ed - x.ed < G().bill.coolEds).map((x) => x.id));
  let best = null;
  for (const id of LAWS()) {
    if (recent.has(id) || g.pend.some((x) => x.id === id)) continue;
    const on = !lawOn(g, id), u = (on ? urgency(id, ind) : -urgency(id, ind)) + rng.int(0, G().bill.noise);
    if (!best || u > best.u) best = { id, on, u };
  }
  return best;
}

// ---------- a edição ----------
// ind: { crime (média das regiões), press }; pop: a gente do mundo; acc: { tax } (o que os jogadores pagaram ao Estado nesta edição)
export function govEdition(w, ed, rng, ind0, pop, tax) {
  govUp(w);
  const g = w.gov, P = G(), C = P.cof, arts = [];
  // 1. cofres: a despesa é a polícia e o resto, por cabeça (mais 25% com o reforço policial); a receita, os contribuintes de
  // fundo mais o que os jogadores pagaram (multas, fianças, comissões, impostos das leis), também por cabeça
  const spend = C.spendPc * (lawOn(g, 'policia') ? 1 + P.laws.policia.spendBp / 10000 : 1);
  const income = C.spendPc * C.bgTaxBp / 10000 + (tax || 0) / pop;
  g.cofPc = Math.max(0, g.cofPc + income - spend);
  const ind = { crime: ind0.crime, cof: cofPct(g), corr: g.corr, popu: g.popu };
  // 2. corrupção: sobe com os cofres vazios; acima de 60, escândalo possível
  const R = P.corr;
  g.corr = Math.round(clamp(g.corr + ((R.base + R.perEmpty * (100 - ind.cof) / 100 - g.corr) * R.moveBp) / 10000, 0, 100));
  if (g.corr > R.scandalAt && rng.chance(R.scandalBp)) {
    g.corr = Math.max(0, g.corr - R.scandalCut); g.popu = Math.max(0, g.popu - R.scandalPopu);
    arts.push({ k: 'govScandal', n: rng.int(0, 3), corr: g.corr });
  }
  // 3. popularidade do governo
  const U = P.popu, target = U.base - U.perCrime * (ind.crime - 40) - (ind.cof < C.lowPct ? U.emptyCut : 0);
  g.popu = Math.round(clamp(g.popu + ((target - g.popu) * U.moveBp) / 10000, 0, 100));
  ind.corr = g.corr; ind.popu = g.popu;
  // 4. leis que entram em vigor agora (votadas há 2 edições)
  for (const x of g.pend.filter((y) => y.at <= ed)) {
    if (x.on) g.laws[x.id] = ed; else delete g.laws[x.id];
    arts.push({ k: 'govLaw', id: x.id, on: x.on });
  }
  g.pend = g.pend.filter((y) => y.at > ed);
  // 5. a votação que vencia
  if (g.bill && g.bill.vote <= ed) {
    const b = g.bill, c = countVotes(g, b, ind, pop, rng);
    if (c.passed) { g.pend.push({ id: b.id, on: b.on, at: ed + P.bill.effectEds }); g.popu = clamp(g.popu + (c.op >= 50 ? U.goodLaw : -U.goodLaw), 0, 100); }
    g.last.unshift({ id: b.id, on: b.on, ed, passed: c.passed, yes: c.yes, no: c.no, by: c.by, op: c.op, pv: [b.yes, b.no], lob: [b.ly, b.ln] });
    g.last = g.last.slice(0, P.bill.keep);
    arts.push({ k: 'govVote', id: b.id, on: b.on, passed: c.passed, yes: c.yes, no: c.no, by: c.by, op: c.op, at: c.passed ? ed + P.bill.effectEds : 0 });
    g.bill = null; g.next = ed;
  }
  // 6. a contagem do jornal na edição antes da votação
  if (g.bill && g.bill.vote === ed + 1) { const pv = pollVotes(g, g.bill, ind, pop); arts.push({ k: 'govPoll', id: g.bill.id, on: g.bill.on, ...pv }); }
  // 7. a proposta seguinte
  if (!g.bill && ed >= g.next) {
    const b = pickBill(g, ed, ind, rng);
    if (b) { g.bill = { id: b.id, on: b.on, ed0: ed, vote: ed + P.bill.voteEds, yes: 0, no: 0, ly: 0, ln: 0 }; arts.push({ k: 'govBill', id: b.id, on: b.on, vote: g.bill.vote }); }
  }
  g.hist.push([ed, ind.cof, g.corr, g.popu]); while (g.hist.length > P.histMax) g.hist.shift();
  return arts;
}

// o que o ecrã do parlamento mostra
export function govView(w, pop, ind) {
  govUp(w);
  const g = w.gov, i = { crime: ind.crime, cof: cofPct(g), corr: g.corr, popu: g.popu };
  return {
    cof: i.cof, cofEur: Math.round(g.cofPc * pop), corr: g.corr, popu: g.popu, seats: g.seats, pm: g.pm,
    laws: Object.keys(g.laws), pend: g.pend, last: g.last.slice(0, 6), hist: g.hist, press: pressDelta(g),
    // a contagem do jornal só sai na véspera (na edição antes da votação), como a notícia govPoll
    bill: g.bill ? { ...g.bill, op: Math.round(streetOpinion(g.bill, i) * 100), lob: Math.round(lobbyEffect(g.bill, pop) * 100), poll: g.bill.vote <= (w.ed || 0) + 1 ? pollVotes(g, g.bill, i, pop) : null } : null,
  };
}
