// Prova das regiões (passo 6, parte 2): épocas de 28 dias (112 edições), com o mesmo motor que o servidor usa
// (engine/engine.js para as ordens, o transporte e as rusgas; engine/mundo.js para as regiões e o mercado).
// O tráfico é uma torneira nova (o mercado de cada região paga em dinheiro), por isso tem de mostrar:
//  1. comprar e vender na mesma região perde sempre (as duas margens de 10%);
//  2. comprar às cegas (droga, região e destino ao acaso) perde dinheiro;
//  3. há lucro em levar de onde é barato para onde é caro, mas com teto: um comerciante sozinho que joga em todas as edições
//     ganha por dia menos de um quinto do que o modelo da economia dá a quem joga todos os dias no nível 25 a 40;
//  4. o mercado é de todos: com dez comerciantes na mesma cidade, cada um ganha menos de metade do que ganharia sozinho;
//  5. com a cidade cheia (pressão acima de 50), guardar muito à vista acaba em rusgas, e o esconderijo e a fachada cortam a perda.
// Uso: node sim/regioes.mjs [épocas] [semente]
import { CFG } from '../engine/config.js';
import * as M from '../engine/mundo.js';
import * as E from '../engine/engine.js';
import { seededRng } from '../engine/rng.js';

const EPOCAS = +(process.argv[2] || 2000), SEED = +(process.argv[3] || 7), EDS = 112, DIAS = EDS / 4;
const T0 = Date.UTC(2026, 10, 23, 12);   // uma segunda-feira: as épocas apanham quatro fins de semana
const WORLD = { phase: 'play', start: T0 - 86_400_000, playEnd: T0 + 400 * 86_400_000 };
const DRUGS = CFG.drugs.map((_, d) => d).filter(M.tradable), REG = M.REG();
const eur = (n) => Math.round(n).toLocaleString('pt-PT').replace(/\s/g, ' ') + ' €';

function comerciante(id, now, { nivel = 60, esconde = 1 } = {}, cash = 3_000_000) {
  const p = E.newPlayer(id, now, WORLD);
  p.respect = p.peakRespect = CFG.levels[nivel - 1]; p.cash = 1e9; E.touch(p, now);
  for (const r of REG) if (r !== 'lx') E.whBuy(p, now, WORLD, r);
  for (const r of REG) for (let k = 1; k < esconde; k++) { E.whUp(p, now, WORLD, r, 'hd'); E.whUp(p, now, WORLD, r, 'fr'); }
  p.cash = cash;   // os armazéns e as melhorias contam-se à parte (são uma compra, não uma perda do comércio)
  return p;
}
const podeComprar = (p, d) => E.level(p) >= CFG.regions.famLevel[CFG.drugs[d].fam];
// tudo o que o jogador tem: dinheiro mais a droga ao preço a que a venderia agora (sem a mexer no preço)
function fortuna(p, m, now) {
  let v = p.cash + p.bank;
  for (const r of REG) { const s = E.whStock(p, r); if (s) s.forEach((n, d) => { if (n > 0 && M.tradable(d)) v += M.quoteC(m.w, r, d, n, -1, now).c / 100; }); }
  for (const x of p.mv) v += M.quoteC(m.w, x.b, x.d, x.n, -1, now).c / 100 * (x.x === 2 ? 0 : 1);
  return v;
}
// a melhor ordem agora: de onde para onde, que droga e quanto, a contar com o risco do caminho
// sellAt: quando vai vender (na próxima vez que joga): o fim de semana e os acontecimentos que já acabaram não contam
function melhor(p, m, now, sellAt) {
  let best = null;
  const wv = { ...m.w, ed: M.edAt(sellAt) };
  for (const a of REG) for (const b of REG) {
    if (a === b) continue;
    const risk = E.mvRiskBp(m.w, a, b) / 10000;
    for (const d of DRUGS) {
      if (!podeComprar(p, d)) continue;
      const D = M.depthU(a, d, m.w), free = Math.min(E.whFree(p, b), 1e7);
      let last = 0;
      for (let f = 1; f <= 60; f++) {
        const n = Math.min(free, Math.floor((D * f) / 200));   // de 0,5% em 0,5% da profundidade de onde se compra
        if (n < 1) break;
        const g = M.quoteC(wv, b, d, n, -1, sellAt).c * (1 - risk) - M.quoteC(m.w, a, d, n, 1, now).c;
        if (g <= last) break;   // o lucro sobe e depois desce: passou o melhor
        last = g;
        if (!best || g > best.g) best = { a, b, d, n, g };
        if (n === free) break;
      }
    }
  }
  return best;
}
// uma edição de um comerciante: vende o que chegou e manda a melhor carga (até três por edição)
function joga(p, m, now, rng, sellAt) {
  for (let k = 0; k < 3 && p.mv.length < CFG.mv.max; k++) {
    const b = melhor(p, m, now, sellAt); if (!b) break;
    E.mktBuy(p, now, WORLD, m, b.a, b.d, b.n);
    E.mvSend(p, now, WORLD, m, rng, b.a, b.b, b.d, b.n);
  }
}
// vende o que chegou em qualquer região (o comerciante só leva para onde vale a pena vender)
function vendeTudo(p, m, now) {
  E.touch(p, now);
  for (const r of REG) { const s = E.whStock(p, r); if (!s) continue; s.forEach((n, d) => { if (n > 0 && M.tradable(d)) E.mktSell(p, now, WORLD, m, r, d, n); }); }
}
function contarAtividade(m, r, v) { M.accAdd(m.w, r, v / CFG.regions.ptsEur); }

function epoca(e, cenario) {
  const rng = seededRng(SEED * 100003 + e), dec = seededRng(SEED * 7919 + e * 31 + 1);
  const m = { ...E.newMarket(), hist: [] }; m.w = M.newWorld(m.prices, T0);
  const ed0 = m.w.ed, t = (i) => M.edStart(ed0 + i) + 10 * 60_000;
  const P = cenario.n ? Array.from({ length: cenario.n }, (_, i) => comerciante('c' + i, t(0), cenario)) : [];
  const start = P.map((p) => fortuna(p, m, t(0)));
  let raids = 0, perdaRusga = 0;
  for (let i = 1; i <= EDS; i++) {
    const now = t(i - 1);
    // a cidade: a atividade dos outros jogadores (golpes, vendas), por edição
    if (cenario.cidade) for (const r of REG) M.accAdd(m.w, r, cenario.cidade[r]);
    P.forEach((p, j) => {
      if (cenario.cada && (i % cenario.cada) !== (j % cenario.cada)) { E.touch(p, now); return; }
      const before = { s: REG.map((r) => (E.whStock(p, r) || []).slice()), mv: p.mv.length };
      if (cenario.modo === 'rota') { vendeTudo(p, m, now); joga(p, m, now, dec, t(i - 1 + (cenario.cada || 1))); }
      else if (cenario.modo === 'cega') {
        vendeTudo(p, m, now);
        const a = REG[dec.int(0, REG.length - 1)], b = REG.filter((x) => x !== a)[dec.int(0, REG.length - 2)], d = DRUGS[dec.int(0, DRUGS.length - 1)];
        const n = Math.max(1, Math.floor((M.depthU(a, d, m.w) * dec.int(1, 10)) / 100));
        if (n <= E.whFree(p, b)) { E.mktBuy(p, now, WORLD, m, a, d, n); E.mvSend(p, now, WORLD, m, dec, a, b, d, n); }
      } else if (cenario.modo === 'mesma') {
        const r = REG[dec.int(0, REG.length - 1)], d = DRUGS[dec.int(0, DRUGS.length - 1)], n = Math.max(1, Math.floor((M.depthU(r, d, m.w) * dec.int(1, 10)) / 100));
        E.mktBuy(p, now, WORLD, m, r, d, n); E.mktSell(p, now, WORLD, m, r, d, n);
      } else if (cenario.modo === 'monte') {
        // compra coca no Alentejo até ter cenario.monte € à vista e fica com ela (sem a vender)
        E.touch(p, now);
        const coca = CFG.drugs.findIndex((g) => g.id === 'coca'), has = E.whStock(p, 'al')[coca] * M.refC(coca) / 100;
        if (has < cenario.monte) { const n = Math.floor(((cenario.monte - has) * 100) / M.refC(coca)); if (n > 0) E.mktBuy(p, now, WORLD, m, 'al', coca, Math.min(n, E.whFree(p, 'al'))); }
      }
      // o que o jogador mexeu conta para a criminalidade das regiões (como no servidor)
      REG.forEach((r, k) => { const s = E.whStock(p, r); if (!s) return; let v = 0; s.forEach((n, d) => { v += Math.abs(n - (before.s[k][d] || 0)) * M.refC(d) / 100; }); if (v) contarAtividade(m, r, v); });
    });
    // a edição: regiões, mercado, acontecimentos; depois as rusgas, com a droga guardada à vista a contar
    for (const p of P) { const st = E.whStoredEur(p); for (const r of REG) M.accAdd(m.w, r, st[r] / CFG.regions.storeEur); }
    M.runEdition(m, ed0 + i, rng);
    for (const p of P) { const rz = E.whEdition(p, m, M.edStart(ed0 + i), rng); raids += rz.length; for (const x of rz) perdaRusga += x.v + x.fine; }
  }
  const end = t(EDS);
  P.forEach((p) => vendeTudo(p, m, end + 3 * 3600_000));
  return { ganho: P.map((p, j) => fortuna(p, m, end + 3 * 3600_000) - start[j]), raids, perdaRusga, press: { lx: m.w.lx.press, al: m.w.rg.al.press, ag: m.w.rg.ag.press } };
}

const q = (a, x) => { const b = a.slice().sort((u, v) => u - v); return b[Math.min(b.length - 1, Math.floor(x * b.length))]; };
const media = (a) => a.reduce((s, x) => s + x, 0) / a.length;
function corre(nome, cenario, n = EPOCAS) {
  const r = Array.from({ length: n }, (_, e) => epoca(e, cenario));
  const g = r.flatMap((x) => x.ganho);
  return { nome, dia: media(g) / DIAS, p10: q(g, 0.1) / DIAS, p90: q(g, 0.9) / DIAS, perde: g.filter((x) => x < 0).length / g.length, raids: media(r.map((x) => x.raids)), rusga: media(r.map((x) => x.perdaRusga)), press: r[r.length - 1].press };
}
const CHEIA = { lx: 3000, al: 1500, ag: 1500 };
const t0 = Date.now();
const R = {
  mesma: corre('Comprar e vender logo na mesma região', { n: 1, modo: 'mesma' }),
  cega: corre('Às cegas (droga, região e destino ao acaso)', { n: 1, modo: 'cega' }),
  rota: corre('Comerciante sozinho, em todas as edições', { n: 1, modo: 'rota' }),
  rota2: corre('Comerciante sozinho, duas edições por dia', { n: 1, modo: 'rota', cada: 2 }),
  rota4: corre('Comerciante sozinho, uma edição por dia', { n: 1, modo: 'rota', cada: 4 }),
  leve: corre('Nível 10 (só leves), em todas as edições', { n: 1, modo: 'rota', nivel: 10 }),
  leve2: corre('Nível 10 (só leves), duas edições por dia', { n: 1, modo: 'rota', nivel: 10, cada: 2 }),
  leve4: corre('Nível 10 (só leves), uma edição por dia', { n: 1, modo: 'rota', nivel: 10, cada: 4 }),
  dez: corre('Dez comerciantes na mesma cidade (cada um)', { n: 10, modo: 'rota' }, Math.max(20, Math.floor(EPOCAS / 10))),
  cheia: corre('Comerciante sozinho com a cidade cheia', { n: 1, modo: 'rota', cidade: CHEIA }),
  monte: corre('200 000 € de coca à vista no Alentejo, cidade cheia', { n: 1, modo: 'monte', monte: 200000, cidade: CHEIA }),
  escondido: corre('O mesmo com esconderijo e fachada no nível 5', { n: 1, modo: 'monte', monte: 200000, cidade: CHEIA, esconde: 5 }),
};
console.log(`Regiões · ${EPOCAS} épocas de ${EDS} edições · semente ${SEED} · ${((Date.now() - t0) / 1000).toFixed(0)} s\n`);
for (const x of Object.values(R)) console.log(`${x.nome.padEnd(56)} por dia ${eur(x.dia).padStart(10)}   10% piores ${eur(x.p10).padStart(10)}   10% melhores ${eur(x.p90).padStart(10)}   épocas a perder ${Math.round(x.perde * 100)}%   rusgas ${x.raids.toFixed(2)} (${eur(x.rusga)})`);
console.log(`\npressão no fim de uma época com a cidade cheia: Lisboa ${R.cheia.press.lx}, Alentejo ${R.cheia.press.al}, Algarve ${R.cheia.press.ag}`);
// o modelo da economia (sim/economia.mjs, sem tráfico) ao dia 30: quem joga uma vez por dia ganha 6 849 € por dia, quem joga
// todos os dias 16 167 €, e quem joga 24 h por dia 30 613 €. O tráfico tem de ficar abaixo de um quinto disso, em cada caso.
const TETO = { uma: 6849 / 5, duas: 16167 / 5, todas: 30613 / 5 };
const provas = [
  ['Comprar e vender logo na mesma região perde sempre', R.mesma.perde === 1],
  ['Comprar às cegas perde dinheiro', R.cega.dia < 0],
  ['Levar de onde é barato para onde é caro dá lucro', R.rota.dia > 0],
  [`Com teto: rende menos de um quinto do que o modelo dá ao dia 30 (${eur(TETO.uma)}, ${eur(TETO.duas)} e ${eur(TETO.todas)} por dia, jogando uma, duas ou quatro edições)`, R.rota4.dia < TETO.uma && R.rota2.dia < TETO.duas && R.rota.dia < TETO.todas],
  ['O mercado é de todos: com dez, cada um ganha menos de metade do que sozinho', R.dez.dia < R.rota.dia / 2],
  ['Com a cidade cheia, guardar muito à vista dá rusgas', R.monte.raids >= 1],
  ['O esconderijo e a fachada cortam a perda nas rusgas a menos de metade', R.escondido.rusga < R.monte.rusga / 2],
];
let ok = true;
for (const [nome, passa] of provas) { console.log((passa ? 'PASSA  ' : 'FALHA  ') + nome); ok = ok && passa; }
console.log('\nPOR_DIA ' + JSON.stringify({ todas: Math.round(R.rota.dia), duas: Math.round(R.rota2.dia), uma: Math.round(R.rota4.dia), leve: { todas: Math.round(R.leve.dia), duas: Math.round(R.leve2.dia), uma: Math.round(R.leve4.dia) } }));
process.exit(ok ? 0 : 1);
