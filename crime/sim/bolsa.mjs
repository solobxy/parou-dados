// Prova da bolsa nova (passo 6): 10 000 épocas de 28 dias (112 edições, 36 passos de 10 minutos entre cada uma),
// com o mesmo motor que o servidor usa (engine/mundo.js). Cada estratégia mexe 10 000 € de cada vez, paga a comissão
// e o empurrão no preço como no jogo. Tem de dar três coisas:
//  1. comprar às cegas rende perto de zero depois da taxa;
//  2. ler o jornal (rumores, investigações, pânico) rende mais, com teto (o limite de posição por jogador);
//  3. não há nenhuma sequência de compra e venda com lucro garantido (todas perdem em parte das épocas, e comprar e vender logo perde sempre).
// Uso: node sim/bolsa.mjs [épocas] [semente]
import { CFG } from '../engine/config.js';
import * as M from '../engine/mundo.js';
import { seededRng } from '../engine/rng.js';

const EPOCAS = +(process.argv[2] || 10000), SEED = +(process.argv[3] || 7), EDS = 112, TICKS = 36, STAKE = 10_000;
const FEE = CFG.stocks.feeBp, K = CFG.stocks.list.length;
const fee = (g) => Math.ceil((g * FEE) / 10000);
// compra STAKE € (bruto) ao preço de agora: devolve as ações e o que custou com a taxa; o preço fica empurrado
function buy(m, k) {
  const p = m.prices[k], imp = M.impactBp(m, k, STAKE), ex = Math.ceil((p * (10000 + imp)) / 10000);
  const n = Math.floor((STAKE * 100) / ex), gross = Math.ceil((n * ex) / 100);
  m.prices[k] = ex;
  return { n, cost: gross + fee(gross), gen: m.gen[k] };
}
function sell(m, k, pos) {
  if (pos.gen !== m.gen[k]) return 0;   // faliu: perdeu-se tudo
  const p = m.prices[k], gross0 = Math.floor((pos.n * p) / 100), imp = M.impactBp(m, k, gross0), ex = Math.floor((p * (10000 - imp)) / 10000);
  const gross = Math.floor((pos.n * ex) / 100);
  m.prices[k] = ex;
  return gross - Math.min(gross, fee(gross));
}
const T0 = Date.UTC(2026, 10, 20, 12);
const res = {}, add = (s, r) => { (res[s] ||= []).push(r); };
let busts = 0, panics = 0, stories = 0;
for (let e = 0; e < EPOCAS; e++) {
  const rng = seededRng(SEED * 100003 + e), dec = seededRng(SEED * 7919 + e * 31 + 1);   // dec: as escolhas das estratégias, à parte do mundo
  const m = { prices: CFG.stocks.list.map((s) => s.base), gen: CFG.stocks.list.map(() => 0), tick: 0, hist: [] };
  m.w = M.newWorld(m.prices, T0);
  const ed0 = m.w.ed;
  // posições abertas por estratégia: { k, pos, until (edição de venda) }
  const open = { cega: null, guardar: null, rumor: null, panico: null, edicao: null };
  const tot = { cega: [0, 0], guardar: [0, 0], rumor: [0, 0], panico: [0, 0], edicao: [0, 0], ida: [0, 0] };   // [pago, recebido]
  const fecha = (s, got) => { tot[s][1] += got; open[s] = null; };
  const abre = (s, k, until) => { const pos = buy(m, k); tot[s][0] += pos.cost; open[s] = { k, pos, until }; };
  // guardar: compra uma empresa ao acaso no início e vende no fim da época
  abre('guardar', dec.int(0, K - 1), ed0 + EDS);
  for (let i = 1; i <= EDS; i++) {
    const ed = ed0 + i;
    // «comprar antes de cada edição e vender logo a seguir»: compra no último passo antes da edição
    if (!open.edicao) abre('edicao', dec.int(0, K - 1), ed);
    const r = M.runEdition(m, ed, rng);
    busts += r.bust.length;
    for (const s of Object.keys(open)) { const o = open[s]; if (o && o.until <= ed) fecha(s, sell(m, o.k, o.pos)); }
    for (const a of r.arts) {
      if (a.k === 'stAnn') stories++;
      const k = CFG.stocks.list.findIndex((x) => x.id === a.c);
      // pânico: a queda continua nesta edição; quem acredita no valor compra e vende na seguinte
      if (a.k === 'stPanic') { panics++; if (!open.panico) abre('panico', k, ed + 1); }
      // rumor ou investigação a favor: compra e vende logo a seguir ao desfecho; contra, não faz nada
      if (!open.rumor && (a.k === 'stInv' ? a.p >= 6000 : a.k === 'stRum' ? a.said && a.rel >= 7000 : false)) abre('rumor', k, a.due);
    }
    // às cegas: de vez em quando compra uma empresa qualquer e vende 1 a 20 edições depois
    if (!open.cega && dec.chance(2500)) abre('cega', dec.int(0, K - 1), ed + dec.int(1, 20));
    for (let t = 0; t < TICKS; t++) {
      M.priceTick(m, rng);
      // comprar e vender logo a seguir, à procura de um lucro certo
      if (t === 10 && dec.chance(2000)) { const k = dec.int(0, K - 1), pos = buy(m, k); tot.ida[0] += pos.cost; tot.ida[1] += sell(m, k, pos); }
    }
  }
  for (const s of Object.keys(open)) { const o = open[s]; if (o) fecha(s, sell(m, o.k, o.pos)); }
  for (const [s, [pago, rec]] of Object.entries(tot)) if (pago > 0) add(s, (rec - pago) / pago);
}
const pct = (x) => (x * 100).toFixed(2).replace('.', ',') + '%';
const stats = (a) => { const s = [...a].sort((x, y) => x - y), mean = a.reduce((x, y) => x + y, 0) / a.length; return { n: a.length, mean, p10: s[Math.floor(a.length * 0.1)], p90: s[Math.floor(a.length * 0.9)], neg: a.filter((x) => x < 0).length / a.length, max: s[s.length - 1] }; };
const NOMES = { cega: 'às cegas (compra ao acaso, vende 1 a 20 edições depois)', guardar: 'guardar a época inteira', edicao: 'comprar antes de cada edição e vender a seguir', rumor: 'ler rumores e investigações', panico: 'comprar no pânico', ida: 'comprar e vender logo a seguir' };
console.log(`Bolsa nova: ${EPOCAS} épocas de ${EDS} edições, semente ${SEED}. Falências: ${(busts / EPOCAS).toFixed(2)} por época; histórias: ${(stories / EPOCAS).toFixed(1)}; pânicos: ${(panics / EPOCAS).toFixed(2)}.`);
console.log('Rendimento por época do dinheiro mexido (média · 10% piores · 10% melhores · épocas a perder):');
const S = {};
for (const s of Object.keys(NOMES)) { if (!res[s]) continue; S[s] = stats(res[s]); console.log(`  ${NOMES[s].padEnd(52)} ${pct(S[s].mean).padStart(8)} · ${pct(S[s].p10).padStart(8)} · ${pct(S[s].p90).padStart(8)} · ${pct(S[s].neg).padStart(7)}`); }
const cap = 100_000;   // o teto de posição de quem está no nível 60 ou mais (casino × 100)
const provas = [
  ['Comprar às cegas rende perto de zero depois da taxa (entre −4% e +1% por época)', S.cega.mean >= -0.04 && S.cega.mean <= 0.01 && S.guardar.mean <= 0.02],
  ['Ler o jornal rende mais do que comprar às cegas (rumores e pânico acima da média às cegas)', S.rumor.mean > S.cega.mean + 0.01 && S.panico.mean > S.cega.mean + 0.01],
  [`Com teto: com o limite de posição (${cap.toLocaleString('pt-PT')} €), ler rumores dá em média ${Math.round(S.rumor.mean * cap).toLocaleString('pt-PT')} € por época`, S.rumor.mean * cap < 50_000],
  ['Nenhuma estratégia tem lucro garantido (todas perdem em pelo menos 5% das épocas)', Object.values(S).every((x) => x.neg >= 0.05)],
  ['Comprar e vender logo a seguir perde sempre', S.ida.max < 0],
];
for (const [txt, ok] of provas) console.log((ok ? 'PASSA  ' : 'FALHA  ') + txt);
process.exit(provas.every(([, ok]) => ok) ? 0 : 1);
