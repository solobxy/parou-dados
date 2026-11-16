// Mundo ligado (passo 6 da base nova): o relógio do mundo anda por edições do jornal (03h, 09h, 15h e 21h em Lisboa).
// Em cada edição, por esta ordem: fecham-se as contas da edição anterior (o que os jogadores fizeram em Lisboa e gastaram
// em cada empresa), atualizam-se a criminalidade e a pressão policial de Lisboa, resolvem-se as histórias que venciam,
// mexe-se o valor de cada empresa pela receita, nascem histórias, rumores e investigações, e a bolsa abre com os valores novos.
// Tudo puro: o servidor guarda o estado e chama isto; a simulação (sim/bolsa.mjs) chama o mesmo.

import { CFG } from './config.js';
import { localParts, lisbonToUtc } from './time.js';

const DAY = 86_400_000;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const W = () => CFG.world;
const coCfg = (k) => CFG.world.co[CFG.stocks.list[k].id];

// ---------- edições ----------
// número da edição em que um instante cai (4 por dia de Lisboa; antes das 03h ainda é a das 21h do dia anterior)
export function edAt(t) {
  const p = localParts(t), hs = W().edHours, day = Math.floor(Date.UTC(p.y, p.m - 1, p.d) / DAY);
  let s = -1;
  for (let i = 0; i < hs.length; i++) if (p.h >= hs[i]) s = i;
  return s < 0 ? day * hs.length - 1 : day * hs.length + s;
}
// quando sai a edição ed (hora de Lisboa; às 03h nunca há salto de hora em Portugal)
export function edStart(ed) {
  const hs = W().edHours, n = hs.length, day = Math.floor(ed / n), s = ed - day * n, d = new Date(day * DAY);
  return lisbonToUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), hs[s]);
}

// ---------- estado ----------
const accNew = () => ({ lx: 0, rev: CFG.stocks.list.map(() => 0), rg: rgMap(() => 0) });
// as outras regiões (Lisboa tem o seu sítio próprio, w.lx, desde a parte 1)
const OTHER = () => CFG.regions.list.map((r) => r.id).filter((r) => r !== 'lx');
const rgMap = (f) => Object.fromEntries(OTHER().map((r) => [r, f(r)]));
const satNew = () => CFG.drugs.map(() => 10000);
// prices: os preços de agora (quem já tinha ações fica com elas ao mesmo preço)
export function newWorld(prices, now) {
  const L = W().lx;
  return {
    v: WORLD_V, ed: edAt(now), lx: { crime: L.start, press: L.start, hist: [] }, acc: accNew(), arts: [],
    rg: rgMap((r) => ({ crime: CFG.regions.crime[r].start, press: CFG.regions.crime[r].start, hist: [] })),
    mk: Object.fromEntries(CFG.regions.list.map((r) => [r.id, satNew()])), ev: [],
    co: CFG.stocks.list.map((s, k) => { const p = prices && prices[k] > 0 ? prices[k] : s.base; return { v: p, anc: p, open: p, rev: [], div: 0, pan: 0, bad: 0, st: null, last: 0 }; }),
  };
}
// o mundo gravado antes ganha o que lhe falta: as regiões (parte 1) e, desde 16/11, os países em vez do Alentejo e do Algarve
// (o que era só dessas regiões sai: criminalidade, mercado, acontecimentos e pontos por contar)
export const WORLD_V = 3;
export function worldUp(w) {
  if (!w) return w;
  if (w.v === WORLD_V && w.rg && w.mk && Array.isArray(w.ev) && w.acc && w.acc.rg) return w;
  if (!w.rg) w.rg = {};
  for (const r of Object.keys(w.rg)) if (!OTHER().includes(r)) delete w.rg[r];
  for (const r of OTHER()) if (!w.rg[r]) w.rg[r] = { crime: CFG.regions.crime[r].start, press: CFG.regions.crime[r].start, hist: [] };
  if (!w.mk) w.mk = {};
  for (const r of Object.keys(w.mk)) if (!REG().includes(r)) delete w.mk[r];
  for (const r of CFG.regions.list) if (!Array.isArray(w.mk[r.id]) || w.mk[r.id].length !== CFG.drugs.length) w.mk[r.id] = satNew();
  if (!Array.isArray(w.ev)) w.ev = [];
  w.ev = w.ev.filter((e) => REG().includes(e.r));
  if (!w.acc.rg) w.acc.rg = {};
  for (const r of Object.keys(w.acc.rg)) if (!OTHER().includes(r)) delete w.acc.rg[r];
  for (const r of OTHER()) if (!(r in w.acc.rg)) w.acc.rg[r] = 0;
  w.v = WORLD_V;
  return w;
}
// o que os jogadores fizeram desde a última edição: 'lx' em pontos de Lisboa (a stamina gasta na rua, as lutas, as vendas, e a droga
// comprada, vendida ou mudada lá), 'al' e 'ag' em pontos dessas regiões, ou o id de uma empresa e o dinheiro que lá deixaram
// (no casino pode ser negativo: o que os jogadores ganharam à casa)
export function accAdd(w, kind, x) {
  if (!w || !Number.isFinite(x) || !x) return;
  if (kind === 'lx') { if (x > 0) w.acc.lx += Math.round(x); return; }
  if (w.rg && w.rg[kind]) { worldUp(w); if (x > 0) w.acc.rg[kind] += Math.round(x); return; }
  const k = CFG.stocks.list.findIndex((s) => s.id === kind);
  if (k >= 0) w.acc.rev[k] += Math.round(x);
}

// ---------- Lisboa ----------
// a criminalidade segue o que os jogadores fazem (com uma base: Lisboa nunca está parada); a pressão segue-a uma edição depois
function lisboa(w, A, ed) {
  const L = W().lx, old = w.lx.crime;
  const target = L.floor + ((100 - L.floor) * A) / (A + L.half);
  w.lx.press = old;
  w.lx.crime = Math.round((old * L.keepBp + target * (10000 - L.keepBp)) / 10000);
  w.lx.hist.push([ed, w.lx.crime, w.lx.press]);
  if (w.lx.hist.length > L.histMax) w.lx.hist.shift();
  return { k: 'lx', crime: w.lx.crime, press: w.lx.press, d: w.lx.crime - old };
}
// as outras regiões: a mesma fórmula, com a base e a atividade de cada uma
function regiao(w, r, A, ed) {
  const R = CFG.regions.crime[r], L = W().lx, g = w.rg[r], old = g.crime;
  const target = R.floor + ((100 - R.floor) * A) / (A + R.half);
  g.press = old;
  g.crime = clamp(Math.round((old * L.keepBp + target * (10000 - L.keepBp)) / 10000), 0, 100);
  g.hist.push([ed, g.crime, g.press]);
  if (g.hist.length > L.histMax) g.hist.shift();
  return { k: 'rg', r, crime: g.crime, press: g.press, d: g.crime - old };
}
export const regionOf = (w, r) => (r === 'lx' ? w.lx : w.rg && w.rg[r]);
export const pressOf = (w, r) => { const g = w && regionOf(w, r); return g ? g.press : 50; };

// ---------- mercado de cada região ----------
export const REG = () => CFG.regions.list.map((r) => r.id);
export const contOf = (r) => { const x = CFG.regions.list.find((g) => g.id === r); return x ? x.ct : null; };
export const tradable = (d) => !!CFG.drugs[d] && CFG.drugs[d].fam !== 'bar';
// preço de grosso de uma droga, em cêntimos (80% do preço de rua)
export const refC = (d) => Math.floor((CFG.drugs[d].price * 100 * CFG.goods.wholesaleBp) / 10000);
// quantas unidades fazem o preço andar 100% (cada 1% da profundidade da região, em euros, mexe 1%)
export const depthU = (r, d) => Math.max(1, Math.floor((CFG.market.depth[r] * 100) / refC(d)));
// procura de uma droga numa região agora, em bp: a da região (pela droga, se tiver número próprio, senão pela família),
// vezes os acontecimentos a decorrer, o fim de semana (festa) e o verão no Algarve (festa)
// dia da semana e mês em Lisboa (guarda-se o último: as ordens e os ecrãs pedem o mesmo instante muitas vezes seguidas)
const dayC = new Map();
function dayOf(now) {
  const k = Math.floor(now / 60000);
  let x = dayC.get(k);
  if (!x) { const p = localParts(now); x = { wd: new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay(), m: p.m }; if (dayC.size > 64) dayC.clear(); dayC.set(k, x); }
  return x;
}
export function demBp(w, r, d, now) {
  const M = CFG.market, g = CFG.drugs[d], t = M.dem[r];
  let bp = t[g.id] ?? t[g.fam] ?? 10000;
  for (const e of (w && w.ev) || []) if (e.r === r && e.d === d && e.ed0 <= w.ed && w.ed <= e.ed1) bp = Math.round((bp * (10000 + e.bp)) / 10000);
  if (g.fam === 'festa' && Number.isFinite(now)) {
    const { wd, m } = dayOf(now);
    if (wd === 5 || wd === 6) bp = Math.round((bp * (10000 + M.weekendBp)) / 10000);
    if (r === M.summer.rg && M.summer.months.includes(m)) bp = Math.round((bp * (10000 + M.summer.bp)) / 10000);
  }
  return bp;
}
export const satOf = (w, r, d) => (w && w.mk && w.mk[r] ? w.mk[r][d] : 10000);
// preço do meio agora, em cêntimos por unidade (sem a margem de 10%)
export const midC = (w, r, d, now) => (refC(d) * demBp(w, r, d, now) * satOf(w, r, d)) / 1e8;
// Quanto custam (side 1) ou rendem (side −1) n unidades, em cêntimos, e a saturação com que o mercado fica. O preço anda à medida
// que se compra ou vende (a média entre o princípio e o fim), e pára nos limites.
export function quoteC(w, r, d, n, side, now) {
  const M = CFG.market, D = depthU(r, d), s0 = satOf(w, r, d), lim = side > 0 ? M.satMax : M.satMin;
  const ds = (n * 10000) / D, room = Math.max(0, side > 0 ? lim - s0 : s0 - lim), n1 = Math.min(n, (room * D) / 10000);
  const s1 = side > 0 ? Math.min(lim, s0 + ds) : Math.max(lim, s0 - ds);
  const sum = n1 * (s0 + (side > 0 ? s0 + (n1 * 10000) / D : s0 - (n1 * 10000) / D)) / 2 + (n - n1) * lim;   // unidades × saturação
  const c = (refC(d) * demBp(w, r, d, now) * sum * (10000 + side * M.spreadBp)) / 1e12;
  return { c: side > 0 ? Math.ceil(c) : Math.floor(c), s1 };
}
export function trade(w, r, d, s1) { worldUp(w); w.mk[r][d] = s1; }
// a saturação volta ao normal e os acontecimentos da procura nascem e acabam
function mercado(w, ed, rng) {
  const M = CFG.market, arts = [];
  for (const r of REG()) w.mk[r] = w.mk[r].map((s) => (s > 10000 ? Math.max(10000, s - M.recBp) : Math.min(10000, s + M.recBp)));
  w.ev = w.ev.filter((e) => e.ed1 >= ed);
  for (const r of REG()) {
    const list = M.ev.list[r];
    if (!list || !list.length || w.ev.some((e) => e.r === r)) continue;
    if (!rng.chance(M.ev.spawnBp)) continue;
    const x = list[rng.int(0, list.length - 1)], d = CFG.drugs.findIndex((g) => g.id === x.drug);
    const e = { r, k: x.k, d, bp: x.bp, ed0: ed, ed1: ed + M.ev.eds - 1 };
    w.ev.push(e); arts.push({ k: 'rgEv', r, e: x.k, d, bp: x.bp, to: e.ed1 });
  }
  return arts;
}
// uma rusga levou muito: a polícia mostrou serviço (a criminalidade cai) e a droga apreendida encarece nessa região
export function recordSeizure(w, r, ds) {
  const R = CFG.market.record, g = regionOf(w, r);
  worldUp(w);
  if (g) g.crime = Math.max(r === 'lx' ? W().lx.floor : CFG.regions.crime[r].floor, g.crime - R.crime);
  for (const d of ds) w.mk[r][d] = Math.min(CFG.market.satMax, w.mk[r][d] + R.satBp);
}
// o que os ecrãs mostram de cada região: criminalidade, pressão, o histórico e, por droga, a procura e a saturação de agora
export function marketView(w, now) {
  if (!w) return null;
  worldUp(w);
  return Object.fromEntries(REG().map((r) => { const g = regionOf(w, r);
    return [r, { crime: g.crime, press: g.press, hist: g.hist, dem: CFG.drugs.map((_, d) => (tradable(d) ? demBp(w, r, d, now) : 0)), sat: w.mk[r].map((s) => Math.round(s * 100) / 100),
      ev: w.ev.filter((e) => e.r === r && e.ed0 <= w.ed && w.ed <= e.ed1).map((e) => ({ k: e.k, d: e.d, bp: e.bp, ed1: e.ed1, to: edStart(e.ed1 + 1) })) }]; }));
}

// multiplicador da hipótese de ser apanhado ao falhar um golpe em Lisboa (10000 = como antes, com a pressão a 50)
export const pressMultBp = (press) => W().lx.bustLo + W().lx.bustPer * clamp(press ?? 50, 0, 100);

// ---------- empresas ----------
function bust(m, k) {
  const c = m.w.co[k], base = CFG.stocks.list[k].base;
  m.gen[k] += 1; c.v = c.anc = c.open = base; m.prices[k] = base; c.st = null; c.bad = 0; c.pan = 0; c.rev = [];
}
const rint = (rng, a, b) => rng.int(a, b);
// corre uma edição: devolve as notícias, o dividendo por ação (em cêntimos) de cada empresa e as que faliram
export function runEdition(m, ed, rng) {
  const w = m.w, C = W(), S = C.story, arts = [], bustK = [];
  // 1-2. contas da edição anterior e Lisboa
  worldUp(w);
  const acc = w.acc;
  arts.push(lisboa(w, acc.lx, ed));
  for (const r of OTHER()) arts.push(regiao(w, r, acc.rg[r] || 0, ed));
  arts.push(...mercado(w, ed, rng));
  CFG.stocks.list.forEach((s, k) => {
    const c = w.co[k], cc = coCfg(k), before = c.v;
    // 3. histórias que venciam
    if (c.st && c.st.due <= ed) {
      const st = c.st, pct = st.ok ? st.up : -st.dn;
      c.v = Math.max(1, Math.round((c.v * (10000 + pct)) / 10000));
      c.bad = st.ok ? 0 : c.bad + 1;
      arts.push({ k: 'stOut', c: s.id, s: st.s, ok: st.ok, pct, n: c.bad });
      c.st = null;
      // falência: três desfechos maus seguidos, todos no jornal, e a empresa já a valer menos de metade do que valia à estreia
      if (c.bad >= S.bustAfter && c.v * 2 < s.base) { bust(m, k); bustK.push(k); arts.push({ k: 'stBust', c: s.id }); return; }
    }
    // 4. o valor mexe pela receita da edição contra a média das últimas 8 (o que os outros clientes gastam, mais o que os jogadores lá deixaram)
    let rev = 0;
    if (cc.r0 > 0) {
      rev = Math.round(cc.r0 * (1 + (rint(rng, -C.noiseBp, C.noiseBp)) / 10000)) + acc.rev[k];
      const avg = c.rev.length ? c.rev.reduce((a, b) => a + b, 0) / c.rev.length : cc.r0;
      const rel = (rev - avg) / Math.max(avg, cc.r0 / 4);
      const move = clamp(Math.round(C.maxMoveBp * rel), -C.maxMoveBp, C.maxMoveBp);
      c.v = Math.max(1, Math.round((c.v * (10000 + move)) / 10000));
      c.rev.push(rev); if (c.rev.length > C.avgN) c.rev.shift();
      // dividendo: uma parte do que os jogadores lá gastaram de verdade, a dividir pelas ações da empresa
      c.div = cc.float > 0 ? Math.floor((Math.max(0, acc.rev[k]) * C.divBp * 100) / (10000 * cc.float)) : 0;
      arts.push({ k: 'coRes', c: s.id, rev, avg: Math.round(avg), pct: move, mine: acc.rev[k], div: c.div });
    } else {
      // sem receita (o Merdacoin): só rumor e humor
      c.v = Math.max(1, Math.round((c.v * (10000 + rint(rng, -C.moedaBp, C.moedaBp))) / 10000));
      c.div = 0;
    }
    // o valor volta devagar ao valor de estreia (sem isto andava à deriva para sempre)
    c.v = Math.max(1, c.v + Math.round(((s.base - c.v) * C.revertBp) / 10000));
    // 5. histórias novas, rumores e investigações
    if (c.st) {
      const st = c.st;
      if (rng.chance(S.rumorBp)) { const rel = Math.round(rint(rng, S.relMin, S.relMax) / 100) * 100, said = rng.chance(rel) ? st.ok : !st.ok; st.rum.push([ed, said, rel]); arts.push({ k: 'stRum', c: s.id, s: st.s, said, rel, due: st.due }); }
      if (!st.inv && rng.chance(S.invBp)) { st.inv = true; arts.push({ k: 'stInv', c: s.id, s: st.s, p: st.p, due: st.due }); }
    } else if (rng.chance(cc.r0 > 0 ? S.spawnBp : S.moedaSpawnBp)) {
      const list = C.stories[s.id], p = Math.round(rint(rng, S.pMin, S.pMax) / 100) * 100;   // percentagens inteiras: o jornal escreve «62%», não «61,7%»
      c.st = { s: list[rint(rng, 0, list.length - 1)], ed0: ed, due: ed + rint(rng, S.durMin, S.durMax), p, ok: rng.chance(p), up: rint(rng, S.upMin, S.upMax), dn: rint(rng, S.dnMin, S.dnMax), rum: [], inv: false };
      arts.push({ k: 'stAnn', c: s.id, s: c.st.s, due: c.st.due });
    }
    // 6. a bolsa abre: no valor, ou mais longe dele se houve pânico (ou euforia) na edição anterior
    let open = c.v;
    if (c.pan) {
      const x = rint(rng, C.panic.min, C.panic.max);
      // o preço passa do valor (os pequenos acionistas vendem tudo, ou compram tudo) e o próprio valor vai atrás uma parte, que
      // não se sabe: na edição seguinte volta-se ao valor, mas a recuperação não é certa
      open = Math.max(1, Math.round((c.v * (10000 + c.pan * x)) / 10000));
      c.v = Math.max(1, Math.round((c.v * (10000 + c.pan * rint(rng, 0, x))) / 10000));
      arts.push({ k: c.pan < 0 ? 'stPanic' : 'stEuph', c: s.id, pct: c.pan * x });
      c.pan = 0;
    } else {
      const ch = c.open > 0 ? Math.round(((open - c.open) * 10000) / c.open) : 0;
      if (ch <= -C.panic.trigBp) c.pan = -1; else if (ch >= C.panic.trigBp) c.pan = 1;
    }
    c.last = before ? Math.round(((open - c.open) * 10000) / Math.max(1, c.open)) : 0;
    c.anc = c.open = open; m.prices[k] = open;
  });
  w.acc = accNew(); w.ed = ed;
  w.arts.push({ ed, a: arts }); while (w.arts.length > C.keepEds) w.arts.shift();
  return { arts, div: w.co.map((c) => c.div), bust: bustK };
}

// ---------- entre edições ----------
// de 10 em 10 minutos o preço anda um bocado para o valor da abertura (desfaz o empurrão das compras e vendas), com um tremor pequeno
export function priceTick(m, rng) {
  const C = W();
  m.w.co.forEach((c, k) => {
    const p = m.prices[k], noise = Math.round((c.anc * rint(rng, -C.tickNoiseBp, C.tickNoiseBp)) / 10000);
    m.prices[k] = Math.max(1, p + Math.round(((c.anc - p) * C.pullBp) / 10000) + noise);
  });
  m.tick += 1;
}
// quanto uma ordem empurra o preço (bp): proporcional ao tamanho, até ao teto. Compra-se e vende-se já ao preço empurrado,
// por isso comprar e vender logo a seguir perde sempre o empurrão mais as duas comissões.
export function impactBp(m, k, gross) {
  if (!m || !m.w) return 0;
  return Math.min(W().impMaxBp, Math.floor((gross * 10000) / coCfg(k).liq));
}
// o que a página mostra de cada empresa: a história a decorrer (sem o desfecho, claro), rumores, investigação, dividendo e receita
export function companyView(m) {
  if (!m || !m.w) return null;
  return m.w.co.map((c, k) => ({
    div: c.div, last: c.last, pan: c.pan, bad: c.bad, rev: c.rev.length ? c.rev[c.rev.length - 1] : 0,
    st: c.st ? { s: c.st.s, ed0: c.st.ed0, due: c.st.due, rum: c.st.rum, p: c.st.inv ? c.st.p : null } : null,
  }));
}
