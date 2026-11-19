// v114: póquer entre jogadores (Texas Hold'em sem limite). O motor da mesa, puro: baralho, avaliação das mãos, as apostas de cada
// volta, os potes (com os potes laterais de quem vai a all-in), a comissão da casa e as decisões dos jogadores da casa (bots).
// O servidor guarda as mesas, dá o tempo de cada jogada e paga a quem sai. As cartas são 0..51: valor c % 13 (0 = ás), naipe c / 13.
import { CFG } from './config.js';

export class PokerError extends Error { constructor(code) { super(code); this.code = code; } }
const fail = (code) => { throw new PokerError(code); };
const rv = (c) => (c % 13 === 0 ? 14 : (c % 13) + 1), su = (c) => Math.floor(c / 13);
const BASE = 15 ** 5;

// ---------- as mãos ----------
// 5 cartas: um número (maior ganha). Categoria (0 carta alta … 8 sequência de cor) e os desempates por ordem.
export function eval5(cs) {
  const r = cs.map(rv).sort((a, b) => b - a), fl = cs.every((c) => su(c) === su(cs[0]));
  const cnt = new Map(); for (const x of r) cnt.set(x, (cnt.get(x) || 0) + 1);
  const g = [...cnt.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const u = [...new Set(r)];
  let st = 0;
  if (u.length === 5) { if (u[0] - u[4] === 4) st = u[0]; else if (u[0] === 14 && u[1] === 5 && u[4] === 2) st = 5; }   // a roda (A-2-3-4-5) vale até ao 5
  const enc = (cat, ks) => { let v = cat; for (let i = 0; i < 5; i++) v = v * 15 + (ks[i] || 0); return v; };
  if (st && fl) return enc(8, [st]);
  if (g[0][1] === 4) return enc(7, [g[0][0], g[1][0]]);
  if (g[0][1] === 3 && g[1][1] >= 2) return enc(6, [g[0][0], g[1][0]]);
  if (fl) return enc(5, r);
  if (st) return enc(4, [st]);
  if (g[0][1] === 3) return enc(3, [g[0][0], g[1][0], g[2][0]]);
  if (g[0][1] === 2 && g[1][1] === 2) return enc(2, [g[0][0], g[1][0], g[2][0]]);
  if (g[0][1] === 2) return enc(1, [g[0][0], g[1][0], g[2][0], g[3][0]]);
  return enc(0, r);
}
// a melhor mão de 5 entre 5, 6 ou 7 cartas
export function best(cs) {
  if (cs.length <= 5) return eval5(cs);
  let b = -1;
  const n = cs.length;
  for (let a = 0; a < n; a++) for (let c = a + 1; c < n; c++) {   // tira 2 (de 7) ou 1 (de 6) e avalia as outras 5
    if (n === 6 && c !== a + 1) continue;
    const five = cs.filter((_, k) => k !== a && (n === 6 || k !== c));
    if (five.length !== 5) continue;
    const v = eval5(five); if (v > b) b = v;
  }
  if (n === 6) for (let a = 0; a < 6; a++) { const v = eval5(cs.filter((_, k) => k !== a)); if (v > b) b = v; }
  return b;
}
export const handCat = (v) => Math.floor(v / BASE);
// os dois primeiros valores da mão (2..14): o par, o trio, os dois pares, a carta alta…
export const handRanks = (v) => [Math.floor(v / 15 ** 4) % 15, Math.floor(v / 15 ** 3) % 15];
export function shuffled(rng) { const d = Array.from({ length: 52 }, (_, i) => i); for (let i = 51; i > 0; i--) { const j = rng.int(0, i); [d[i], d[j]] = [d[j], d[i]]; } return d; }

// ---------- a mesa ----------
const P = () => CFG.poker;
export const pkStake = (st) => P().stakes[st];
export function pkNew(id, st, now) { return { id, st, seats: Array(P().seats).fill(null), btn: -1, hand: null, n: 0, t: now, last: null }; }
export const pkSeatOf = (tb, who) => tb.seats.findIndex((s) => s && s.who === who);
export function pkSit(tb, i, o) {
  if (tb.seats[i]) fail('SEAT_TAKEN');
  tb.seats[i] = { who: o.who, bot: !!o.bot, name: o.name, chips: o.chips, buy: o.chips, hole: null, bet: 0, put: 0, fold: true, allin: false, acted: false, leave: false, to: 0, inh: false };
  return i;
}
const nextIdx = (tb, i, ok) => { const n = tb.seats.length; for (let k = 1; k <= n; k++) { const j = (i + k + n) % n; if (ok(tb.seats[j], j)) return j; } return -1; };
const inHand = (s) => s && s.inh && !s.fold;
const canAct = (s) => inHand(s) && !s.allin;
export const pkPot = (tb) => tb.seats.reduce((a, s) => a + (s ? s.put : 0), 0);
// começa uma mão com quem está sentado e tem fichas (pelo menos 2)
export function pkStart(tb, rng, now) {
  const ok = (s) => s && s.chips > 0 && !s.leave;
  const act = tb.seats.map((s, i) => (ok(s) ? i : -1)).filter((i) => i >= 0);
  if (act.length < 2) return false;
  for (const s of tb.seats) if (s) Object.assign(s, { hole: null, bet: 0, put: 0, fold: true, allin: false, acted: false, inh: false });
  for (const i of act) Object.assign(tb.seats[i], { fold: false, inh: true });
  tb.btn = nextIdx(tb, tb.btn < 0 ? -1 : tb.btn, ok);
  const st = pkStake(tb.st), two = act.length === 2;
  const sb = two ? tb.btn : nextIdx(tb, tb.btn, ok), bb = nextIdx(tb, sb, ok);
  const deck = shuffled(rng);
  const post = (i, amt) => { const s = tb.seats[i], x = Math.min(s.chips, amt); s.chips -= x; s.bet += x; s.put += x; if (!s.chips) s.allin = true; };
  post(sb, st.bb / 2); post(bb, st.bb);
  for (const i of act) tb.seats[i].hole = [deck.pop(), deck.pop()];
  tb.n += 1;
  tb.hand = { n: tb.n, deck, board: [], street: 0, cur: st.bb, minR: st.bb, sb, bb, toAct: -1, res: null, t0: now };
  tb.hand.toAct = nextIdx(tb, bb, canAct);
  if (tb.hand.toAct < 0 || roundDone(tb)) advance(tb, now);
  return true;
}
const roundDone = (tb) => { const h = tb.hand; const live = tb.seats.filter(inHand); if (live.length <= 1) return true;
  return tb.seats.every((s) => !canAct(s) || (s.acted && s.bet === h.cur)) && (tb.seats.filter(canAct).length > 1 || tb.seats.filter(canAct).every((s) => s.bet === h.cur)); };
// o que um jogador pode fazer agora: passar, ir a jogo (quanto) e o aumento mínimo e máximo («aumentar para»)
export function pkOptions(tb, i) {
  const h = tb.hand, s = tb.seats[i];
  if (!h || h.res || h.toAct !== i || !canAct(s)) return null;
  const toCall = Math.max(0, h.cur - s.bet), max = s.bet + s.chips, minTo = Math.min(max, h.cur + h.minR);
  return { check: toCall === 0, call: Math.min(toCall, s.chips), minTo, max, canRaise: max > h.cur && (s.chips > toCall) };
}
// uma jogada: fold, check, call ou raise (amt = aumentar para). Valida tudo antes de mexer.
export function pkAct(tb, i, move, amt, now) {
  const h = tb.hand, s = tb.seats[i], o = pkOptions(tb, i);
  if (!o) fail('NOT_YOUR_TURN');
  if (move === 'fold') { s.fold = true; }
  else if (move === 'check') { if (!o.check) fail('CANT_CHECK'); }
  else if (move === 'call') { if (o.check) fail('CANT_CALL'); const x = o.call; s.chips -= x; s.bet += x; s.put += x; if (!s.chips) s.allin = true; }
  else if (move === 'raise') {
    if (!o.canRaise) fail('CANT_RAISE');
    const to = Math.floor(Number(amt));
    if (!Number.isSafeInteger(to) || to > o.max || (to < o.minTo && to !== o.max) || to <= h.cur) fail('BAD_RAISE');
    const x = to - s.bet;
    if (to - h.cur >= h.minR) h.minR = to - h.cur;   // um all-in curto não reabre o aumento mínimo
    h.cur = to; s.chips -= x; s.bet += x; s.put += x; if (!s.chips) s.allin = true;
    for (const q of tb.seats) if (q && q !== s && canAct(q)) q.acted = false;
  } else fail('BAD_MOVE');
  s.acted = true; s.to = 0;
  tb.last = { i, move, amt: move === 'raise' ? h.cur : move === 'call' ? s.bet : 0, t: now };
  s.la = { m: move, a: tb.last.amt, t: now, st: h.street };   // a última jogada de cada um (o ecrã mostra-a uns segundos)
  if (roundDone(tb)) advance(tb, now);
  else h.toAct = nextIdx(tb, i, canAct);
  return { ok: true };
}
// fora da vez: desistir de uma mão (sair da mesa a meio de uma mão)
export function pkFoldOut(tb, i, now) {
  const h = tb.hand, s = tb.seats[i];
  if (!h || h.res || !inHand(s)) return false;
  if (h.toAct === i) { pkAct(tb, i, 'fold', 0, now); return true; }
  s.fold = true;
  if (tb.seats.filter(inHand).length <= 1 || roundDone(tb)) advance(tb, now);
  return true;
}
// fecha a volta de apostas: a próxima carta da mesa, ou o fim (um só na mão, ou a mostra das cartas)
function advance(tb, now) {
  const h = tb.hand;
  for (;;) {
    if (tb.seats.filter(inHand).length <= 1) return finish(tb, now);
    if (!roundDone(tb)) { h.toAct = nextIdx(tb, h.toAct < 0 ? tb.btn : h.toAct, canAct); return; }
    if (h.street >= 3) return finish(tb, now);
    for (const s of tb.seats) if (s) { s.bet = 0; s.acted = false; }
    h.cur = 0; h.minR = pkStake(tb.st).bb;
    h.street += 1;
    if (h.street === 1) h.board.push(h.deck.pop(), h.deck.pop(), h.deck.pop()); else h.board.push(h.deck.pop());
    h.toAct = nextIdx(tb, tb.btn, canAct);
    if (tb.seats.filter(canAct).length >= 2) return;   // há quem possa apostar; senão, as cartas saem até ao fim
    h.toAct = -1;
  }
}
// o fim da mão: potes por camadas (quem foi a all-in só ganha até onde pôs), a comissão e a mostra
function finish(tb, now) {
  const h = tb.hand, st = pkStake(tb.st), live = tb.seats.map((s, i) => (inHand(s) ? i : -1)).filter((i) => i >= 0);
  while (h.board.length < 5 && live.length > 1) h.board.push(h.deck.pop());
  const total = pkPot(tb);
  const rake = h.street >= 1 || live.length > 1 ? Math.min(Math.floor((total * P().rakeBp) / 10000), st.bb * P().rakeCapBB) : 0;   // sem flop, sem comissão
  const won = new Map(), score = new Map();
  if (live.length === 1) won.set(live[0], total - rake);
  else {
    for (const i of live) score.set(i, best([...tb.seats[i].hole, ...h.board]));
    const lv = [...new Set(live.map((i) => tb.seats[i].put))].sort((a, b) => a - b);
    let prev = 0, rk = rake;
    lv.forEach((L, k) => {
      let pot = tb.seats.reduce((a, s) => a + (s ? Math.max(0, Math.min(s.put, L) - prev) : 0), 0);
      if (k === lv.length - 1) pot += tb.seats.reduce((a, s) => a + (s ? Math.max(0, s.put - L) : 0), 0);   // o que um desistente pôs acima de todos
      const take = Math.min(rk, pot); pot -= take; rk -= take;
      const el = live.filter((i) => tb.seats[i].put >= L), top = Math.max(...el.map((i) => score.get(i))), ws = el.filter((i) => score.get(i) === top);
      const each = Math.floor(pot / ws.length); let rest = pot - each * ws.length;
      const order = []; for (let k2 = 1; k2 <= tb.seats.length; k2++) { const j = (tb.btn + k2) % tb.seats.length; if (ws.includes(j)) order.push(j); }
      for (const j of order) { won.set(j, (won.get(j) || 0) + each + (rest > 0 ? 1 : 0)); if (rest > 0) rest--; }
      prev = L;
    });
  }
  for (const [i, x] of won) tb.seats[i].chips += x;
  for (const s of tb.seats) if (s) { s.bet = 0; if (s.chips > 0) s.allin = false; }
  h.res = { rake, total, win: [...won.entries()].map(([i, x]) => ({ i, amt: x, cat: score.has(i) ? handCat(score.get(i)) : -1 })), shown: live.length > 1 ? live : [], t: now };
  h.toAct = -1;
}
// o que cada um vê: as próprias cartas sempre; as dos outros só na mostra
export function pkView(tb, me, now) {
  const h = tb.hand, show = new Set(h && h.res ? h.res.shown : []);
  return { id: tb.id, st: tb.st, btn: tb.btn, n: tb.n, last: tb.last,
    hand: h ? { board: h.board, street: h.street, cur: h.cur, minR: h.minR, toAct: h.toAct, pot: pkPot(tb), res: h.res, deadline: h.deadline || 0, sb: h.sb, bb: h.bb } : null,
    seats: tb.seats.map((s, i) => s && { name: s.name, bot: s.bot, me: s.who === me, chips: s.chips, bet: s.bet, put: s.put, fold: s.fold, allin: s.allin, inh: s.inh, leave: s.leave, la: h && s.la && s.la.t >= h.t0 ? s.la : null,
      hole: s.hole && (s.who === me || show.has(i)) ? s.hole : s.hole ? [null, null] : null }),
    opt: (() => { const i = pkSeatOf(tb, me); return i >= 0 ? pkOptions(tb, i) : null; })() };
}

// ---------- os jogadores da casa ----------
// a força da mão: em quantas de n mãos ao calhas (contra os que ainda estão na mão) esta ganha ou empata
export function equity(hole, board, opps, rng, n = 120) {
  const used = new Set([...hole, ...board]), rest = Array.from({ length: 52 }, (_, i) => i).filter((c) => !used.has(c));
  let w = 0;
  for (let k = 0; k < n; k++) {
    const d = rest.slice(); for (let i = d.length - 1; i > 0; i--) { const j = rng.int(0, i); [d[i], d[j]] = [d[j], d[i]]; }
    let p = 0; const b = [...board]; while (b.length < 5) b.push(d[p++]);
    const mine = best([...hole, ...b]); let lose = false, tie = false;
    for (let o = 0; o < opps; o++) { const v = best([d[p++], d[p++], ...b]); if (v > mine) { lose = true; break; } if (v === mine) tie = true; }
    if (!lose) w += tie ? 0.5 : 1;
  }
  return w / n;
}
// a decisão: com a força da mão, o que custa ir a jogo e o tamanho do pote; um pouco de bluff para não ser previsível
export function pkBot(tb, i, rng) {
  const h = tb.hand, s = tb.seats[i], o = pkOptions(tb, i);
  if (!o) return null;
  const opps = tb.seats.filter((q, k) => k !== i && inHand(q)).length, eq = equity(s.hole, h.board, Math.max(1, opps), rng, 100);
  const pot = pkPot(tb), toCall = o.call, odds = toCall / Math.max(1, pot + toCall), bb = pkStake(tb.st).bb;
  const raiseTo = (frac) => Math.max(o.minTo, Math.min(o.max, h.cur + Math.floor(Math.max(bb, pot * frac) / bb) * bb));
  const r = rng.int(0, 9999);
  if (o.check) {
    if (o.canRaise && (eq > 0.62 || (eq > 0.45 && r < 2500) || r < 700)) return { move: 'raise', amt: raiseTo(eq > 0.8 ? 0.9 : 0.55) };
    return { move: 'check' };
  }
  if (o.canRaise && (eq > 0.74 || (eq > 0.55 && r < 1500))) return { move: 'raise', amt: raiseTo(eq > 0.85 ? 1 : 0.7) };
  if (eq >= odds + 0.04 || (toCall <= bb && eq > 0.25)) return { move: 'call' };
  if (o.canRaise && r < 400) return { move: 'raise', amt: raiseTo(0.6) };
  return { move: 'fold' };
}
