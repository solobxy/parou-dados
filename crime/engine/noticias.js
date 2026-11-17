// O jornal que escala (v77, pedido de 17/11, 03:39: «um sistema de notícias muito melhor», a funcionar igual com 1 ou 10 milhões).
// Três regras, todas sem percorrer os jogadores:
// 1. O que é «grande» mede-se contra o que é normal: cada categoria guarda um histograma de tudo o que aconteceu (em degraus de
//    potências de 2^(1/4), uns 160 no máximo), e uma notícia tem de passar o triplo da mediana das últimas 8 edições.
// 2. Em cada edição entram no jornal as 3 maiores de cada categoria que passam essa marca (sempre 3, com 1 jogador ou 10 milhões).
// 3. A última hora tem um travão: uma reserva de 6 notícias por hora e categoria e, quando acaba, só passam as maiores (o dobro
//    da última aceite, com a fasquia a descer para metade a cada 15 minutos). Com pouca gente passa tudo o que vale a pena; com muita, passam só as maiores, ao mesmo ritmo.
// Puro: o servidor guarda o estado (dentro do mundo) e chama isto; os testes chamam o mesmo.
import { CFG } from './config.js';

const N = () => CFG.news;
// ---------- histogramas ----------
export const bucketOf = (v) => (v >= 1 ? Math.min(255, Math.floor(Math.log2(v) * 4)) : 0);
export const bucketLo = (b) => (b <= 0 ? 0 : 2 ** (b / 4));
export function histAdd(h, v) { if (!(v > 0)) return h; const b = bucketOf(v); h[b] = (h[b] || 0) + 1; return h; }
// a mediana de vários histogramas juntos (o degrau onde está o do meio; devolve o valor de baixo desse degrau)
export function histMedian(hs) {
  const tot = {}; let n = 0;
  for (const h of hs) for (const [b, c] of Object.entries(h || {})) { tot[b] = (tot[b] || 0) + c; n += c; }
  if (!n) return 0;
  let acc = 0;
  for (const b of Object.keys(tot).map(Number).sort((x, y) => x - y)) { acc += tot[b]; if (acc * 2 >= n) return bucketLo(b); }
  return 0;
}
export const histCount = (h) => Object.values(h || {}).reduce((a, b) => a + b, 0);

// ---------- o estado (vive em w.nw) ----------
export function newsState(ed = 0) { return { cur: { ed, h: {}, c: {} }, ring: [], live: {} }; }
export function newsUp(w) {
  if (!w.nw || typeof w.nw !== 'object') w.nw = newsState(w.ed || 0);
  const s = w.nw; if (!s.cur) s.cur = { ed: w.ed || 0, h: {}, c: {} }; if (!Array.isArray(s.ring)) s.ring = []; if (!s.live) s.live = {};
  return s;
}
const isValued = (cat) => !!(N().cats[cat] && N().cats[cat].min !== undefined);
// a marca de uma categoria agora: o mínimo dela (o que tem significado na economia do jogo) ou o triplo do normal
export function floorOf(s, cat) {
  const C = N().cats[cat]; if (!C) return 1;
  const hs = [...s.ring.map((r) => r.h[cat]), s.cur.h[cat]];
  // com menos de 8 casos ainda não se sabe o que é normal: vale só o mínimo
  if (hs.reduce((a, h) => a + histCount(h), 0) < N().minN) return C.min || 1;
  return Math.max(C.min || 1, Math.ceil(N().relMed * histMedian(hs)));
}

// ---------- o que acontece ----------
// tudo o que tem valor entra no histograma (as pequenas também, é assim que se sabe o que é normal); as que contam vão às 3 da edição
export function sample(s, cat, v, item) {
  if (!isValued(cat) || !(v > 0)) return false;
  histAdd(s.cur.h[cat] || (s.cur.h[cat] = {}), v);
  if (!item) return false;
  const L = s.cur.c[cat] || (s.cur.c[cat] = []), K = N().ed.k;
  if (L.length >= K && L[L.length - 1].v >= v) return false;
  // a mesma pessoa só uma vez por categoria e edição: fica a maior
  const i = L.findIndex((x) => x.name && x.name === item.name);
  if (i >= 0) { if (L[i].v >= v) return false; L.splice(i, 1); }
  L.push({ ...item, v }); L.sort((a, b) => b.v - a.v); if (L.length > K) L.length = K;
  return true;
}
// a última hora: passa ou não, com o travão de cada categoria
// Duas portas: uma reserva de 6 notícias por hora e categoria (com pouca gente nunca acaba, por isso passa tudo o que vale a pena),
// e a fasquia (com a reserva vazia, só passa a que for maior do que o dobro da última, a descer para metade a cada 15 minutos).
export function livePass(s, cat, v, now) {
  const L = N().live, val = v > 0 ? v : 1;
  if (isValued(cat) && val < floorOf(s, cat)) return false;
  const g = s.live[cat] || (s.live[cat] = { thr: 0, t: now, tok: L.tokens, tt: now });
  if (g.tok === undefined) { g.tok = L.tokens; g.tt = now; }
  g.tok = Math.min(L.tokens, g.tok + (Math.max(0, now - g.tt) * L.tokens) / L.tokMs); g.tt = Math.max(g.tt, now);
  const thr = g.thr * 2 ** (-(Math.max(0, now - g.t)) / L.halfMs);
  if (g.tok >= 1) g.tok -= 1;
  else if (val < thr) return false;
  g.thr = Math.max(thr, val * L.step); g.t = now;
  return true;
}
// fecha a edição: o histograma vai para o anel das últimas 8 e as 3 maiores de cada categoria que passam a marca vão para o jornal
export function closeEdition(s, ed) {
  const out = [];
  for (const cat of Object.keys(s.cur.c)) {
    const f = floorOf(s, cat), med = Math.round(histMedian([...s.ring.map((r) => r.h[cat]), s.cur.h[cat]]));
    for (const x of s.cur.c[cat]) if (x.v >= f) out.push({ ...x, k: 'feat', cat, med });   // cat: a categoria (x.c pode ser o golpe); med: o normal
  }
  s.ring.push({ ed: s.cur.ed, h: s.cur.h }); while (s.ring.length > N().ed.eds) s.ring.shift();
  s.cur = { ed, h: {}, c: {} };
  out.sort((a, b) => weight(b) - weight(a));
  return out;
}

// ---------- o peso de cada notícia (a manchete é a que pesa mais) ----------
// as do mundo têm peso fixo; as dos jogadores pesam pelo tamanho (quantas vezes a marca da categoria, até 3 pontos a mais)
export function weight(a) {
  const W = N().w;
  if (a.k === 'feat') return W.feat + Math.min(3, Math.log2(Math.max(1, a.v / Math.max(1, (N().cats[a.cat] || {}).min || 1))));
  if (a.k === 'govVote') return a.passed ? W.govPass : W.govFail;
  return W[a.k] ?? 0;
}
