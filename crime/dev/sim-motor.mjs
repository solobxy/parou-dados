// Simulação da economia com o MOTOR VERDADEIRO (passo 2), para comparar com o modelo (sim/economia.mjs).
// Joga contas com os quatro perfis do modelo (uma sessão por dia, todos os dias, a stamina toda, bot) durante N dias,
// sempre pelas funções do motor: golpes de rua, venda de droga, barras a droga, multas, pistola, casas e luxos.
// Passo 3: também os empregos (6 turnos por dia, com a energia) e os cursos (o seguinte quando há o dobro do preço), como no modelo.
// Passo 5: os golpes grandes (o melhor que se pode pagar, como no modelo: com 3 vezes o custo, suborno nos grandes) e a avença.
// Passo 5 também: a lavagem (20% do crime acima dos primeiros 100 000 €). Os seguranças (passo 7) ficam de fora; para comparar, o modelo corre com SEM_SEGURANCAS=1.
// Com SEM_EMPREGO=1 o motor não trabalha; com SEM_OPS=1 não faz golpes grandes nem tem avença (comparações dos passos 2 a 4).
// PASSOS=1: além do suborno, faz o reconhecimento e contrata a equipa quando compensa (para medir quanto isso pesa).
// Uso: node dev/sim-motor.mjs [semente] [contas por perfil] [dias]   (dentro de crime/)
import { CFG, T } from '../engine/config.js';
import * as E from '../engine/engine.js';
import { seededRng } from '../engine/rng.js';
import { lisbonToUtc } from '../engine/time.js';

const SEED = +(process.argv[2] ?? 1), N = +(process.argv[3] ?? 100), DIAS = +(process.argv[4] ?? 365);
const T0 = lisbonToUtc(2026, 11, 20, 0, 30);      // cada dia de jogo vai das 0:30 à meia-noite de Lisboa (a rua arrefece à meia-noite)
const world = { start: T0 - T.DAY, playEnd: Number.MAX_SAFE_INTEGER };
const CARRO = 5000, CASA_A_SERIO = 3;             // como no modelo: carro usado de 5 000 € e o T1 na cidade
const PIST = CFG.gear.find((x) => x.id === 'pistola');
const CUSTO_ARMA = (CFG.bullets.price * CFG.bullets.perJob) / CFG.bullets.box + PIST.price / PIST.life;   // balas e desgaste por golpe (passo 4)
const balas = (p) => (p.inv.find((x) => x.id === 'balas') || { n: 0 }).n;
const SEM_EMPREGO = process.env.SEM_EMPREGO === '1', SEM_OPS = process.env.SEM_OPS === '1', PASSOS = process.env.PASSOS === '1';
// golpes grandes: avança o que estiver pronto (compra o material e as balas que faltam); começa o que render mais por dia, contando a pausa
function golpesGrandes(p, t, perfil, st) {
  if (SEM_OPS) return;
  // avença: como no modelo, a partir do nível 30 quando custa até 5% do que se ganha por dia
  const quer = E.level(p) >= CFG.retainer.level && st.media != null && CFG.retainer.day <= st.media * 0.05;
  if (quer !== p.avenca) tenta(() => E.setRetainer(p, t, world, quer));
  if (p.jailUntil > t) tenta(() => E.payBail(p, t, world));   // apanhado: paga-se o advogado para sair, como nos golpes de rua
  if (p.op && t >= p.op.ready) {
    const o = CFG.ops[p.op.i];
    for (const id of o.mat) if (!p.inv.some((x) => x.id === id)) { if (E.invUsed(p) >= E.invCap(p)) tenta(() => E.sellGoods(p, t, world)); tenta(() => E.buyItem(p, t, world, id)); }
    if (o.gun) { if (!p.eq.mao) tenta(() => E.buyItem(p, t, world, 'pistola')); if (p.eq.mao && p.eq.mao.u === 0) tenta(() => E.repair(p, t, world, 'mao')); if (balas(p) < CFG.opSteps.bullets) tenta(() => E.buyItem(p, t, world, 'balas', 1)); }
    const pago = p.op.paid, r = tenta(() => E.opGo(p, t, world, simRng));
    if (r && st.dia <= 90) { st.og90 = (st.og90 || 0) + (r.success ? r.money : 0); st.oc90 = (st.oc90 || 0) + pago + (r.lawyer || 0); }
    if (r) { st.ops = (st.ops || 0) + 1; if (r.success) st.opsWon = (st.opsWon || 0) + 1; st.byop = st.byop || {}; st.byop[o.id] = (st.byop[o.id] || 0) + 1; if (st.dia <= 90) st.ops90 = (st.ops90 || 0) + 1; }
    else if (!E.opMissing(p, o).length && p.jailUntil <= t && p.hospUntil <= t) tenta(() => E.opDrop(p, t, world));
  }
  if (!p.op && perfil !== 'casual' && p.opPause <= t) {
    const vale = (o) => (o.p / 10000 * o.gain - o.cost) / (Math.max(1, Math.ceil(o.prepH / 24)) + o.pauseH / 24);
    const o = CFG.ops.filter((x) => E.level(p) >= x.level && liquido(p) > x.cost * 3).sort((x, y) => vale(y) - vale(x))[0];
    if (o && tenta(() => E.opStart(p, t, world, CFG.ops.indexOf(o)))) {
      if (E.opStepCost(o, 'bribe')) tenta(() => E.opStep(p, t, world, 'bribe'));
      if (PASSOS) {
        tenta(() => E.opStep(p, t, world, 'crew'));   // a equipa dá +8% por 5% da parte: compensa sempre
        tenta(() => E.opStep(p, t, world, 'recon'));
      }
    }
  }
}
let simRng = null;
// emprego: o melhor que já está aberto; curso: o seguinte da lista quando há o dobro do preço (a regra do modelo); depois os turnos
function trabalho(p, t) {
  if (SEM_EMPREGO) return;
  const J = CFG.jobs.list;
  if (!p.course) { const c = CFG.courses.find((x) => !p.done.includes(x.id) && (!x.needs || p.done.includes(x.needs)) && (!x.level || E.level(p) >= x.level)); if (c && liquido(p) > c.price * 2) tenta(() => E.startCourse(p, t, world, c.id)); }
  let best = -1; J.forEach((x, i) => { if (E.jobOpen(p, i) && (best < 0 || x.day > J[best].day)) best = i; });
  if (best !== p.job) tenta(() => E.chooseJob(p, t, world, best));
  while (E.shiftsToday(p, t) < CFG.jobs.perDay && p.vigor >= CFG.jobs.shiftE) if (!tenta(() => E.doShift(p, t, world))) break;
}
const PERFIS = {
  casual: { sessoes: 2, extra: 0, falha: 0.25 },
  regular: { sessoes: 4, extra: 0, falha: 0.05 },
  hardcore: { sessoes: 7, extra: 3, falha: 0 },
  bot: { sessoes: 7.2, extra: 7, falha: 0 },
};
const ev = (c) => E.crimeEv(c);
const liquido = (p) => p.cash + p.bank;
// o que uma barra de golpes de rua rende em média, já com hipótese, calor, mestria, balas e multas (o que interessa para decidir)
function barra(p, k, heatBp) {
  const c = CFG.crimes[k], n = 100 / c.e, bonus = 1 + E.skillBp(p, c.fam) / 10000;
  const ganho = n * (c.p / 10000) * ev(c) * bonus * (heatBp / 10000);
  const custo = n * ((c.gun ? CUSTO_ARMA : 0) + (1 - c.p / 10000) * (CFG.bustBp / 10000) * c.fine);
  return ganho - custo;
}
function melhorGolpe(p) {
  let best = 0, v = -Infinity;
  for (let k = 0; k < CFG.crimes.length; k++) {
    const c = CFG.crimes[k];
    if (!E.crimeUnlocked(p, k) || (c.gun && !p.eq.mao)) continue;
    const x = barra(p, k, 10000); if (x > v) { v = x; best = k; }
  }
  return best;
}
const heatAgora = (p, t) => E.streetView(p, t).heatBp;
const tenta = (f) => { try { return f(); } catch (e) { if (!(e instanceof E.GameError)) throw e; return null; } };

function sessao(p, t, rng, s) {
  // multas: paga-se para sair (o modelo assume que se paga)
  if (p.jailUntil > t) { tenta(() => E.payBail(p, t, world)); if (p.jailUntil > t) return; }
  // pistola: compra-se quando o nível a pede e há o dobro do preço; balas às caixas; repara-se quando se estraga
  if (E.level(p) >= CFG.crimes.find((c) => c.gun).level) {
    if (!p.eq.mao && liquido(p) > PIST.price * 2) tenta(() => E.buyItem(p, t, world, 'pistola'));
    if (p.eq.mao) { if (balas(p) < 100 && liquido(p) > 500) tenta(() => E.buyItem(p, t, world, 'balas', 4)); if (p.eq.mao.u === 0) tenta(() => E.repair(p, t, world, 'mao')); }
  }
  // venda de droga primeiro, se render mais do que a barra de rua mais quente do dia
  const L = E.level(p), hoje = s.hoje;
  const d = [...CFG.deal.list.entries()].reverse().find(([, x]) => L >= x.level);
  if (d) {
    const [j, x] = d, g = CFG.drugs.find((y) => y.id === x.drug), lucro = x.perBar * g.price - (x.perBar * x.kg) / 1000;
    const piorBarra = barra(p, melhorGolpe(p), CFG.street.heat[Math.min(CFG.street.heat.length - 1, Math.max(0, Math.ceil(s.barras) - 1))]);
    if (lucro > piorBarra) {
      while (p.energy >= CFG.deal.step && E.dealUsed(p, t) < E.dealCap(p)) {
        const grams = Math.floor((x.perBar * CFG.deal.step) / 100);
        if (p.dst[j] < grams) { if (!tenta(() => E.dealBuy(p, t, world, j, 1))) break; }
        if (!tenta(() => E.deal(p, t, world, j))) break;
      }
    }
  }
  // golpes de rua com a stamina que há, enquanto a barra (ao calor de agora) render mais do que custa
  for (let guard = 0; guard < 60; guard++) {
    if (p.jailUntil > t) { if (!tenta(() => E.payBail(p, t, world))) return; }
    const k = melhorGolpe(p), c = CFG.crimes[k];
    if (p.energy < c.e) break;
    if (barra(p, k, heatAgora(p, t)) <= 0) break;
    if (c.gun && p.eq.mao && p.eq.mao.u === 0) tenta(() => E.repair(p, t, world, 'mao'));
    if (c.gun && balas(p) < CFG.bullets.perJob) tenta(() => E.buyItem(p, t, world, 'balas', 4));
    const r = tenta(() => E.doCrimeAll(p, t, world, k, rng)); if (!r) break;
  }
  // o que se roubou e é objeto vende-se ao recetador no fim de cada sessão
  tenta(() => E.sellGoods(p, t, world));
}

function simula(perfil, rng) {
  const A = PERFIS[perfil], p = E.newPlayer('sim-' + perfil, T0 - T.HOUR, world);
  p.cls = 'ladrao';
  const st = { carro: null, saiu: null, t1: null, n100: null, media: null, luxo: 0, dias: 0, entrou: 0, saiu$: 0 };
  const fotos = {};
  for (let dia = 1; dia <= DIAS; dia++) {
    const t0 = T0 + (dia - 1) * T.DAY; st.dia = dia;
    const w0 = liquido(p);
    if (rng.float() < A.falha) { fotos[dia] = foto(p, st); continue; }
    st.dias++;
    // as sessões espalham-se pelo dia; a stamina natural enche entre uma e outra (a 2 min por ponto)
    const n = Math.ceil(A.sessoes), passo = Math.floor((23.4 * T.HOUR) / n);
    const s = { hoje: dia, barras: A.sessoes };
    for (let i = 0; i < n; i++) {
      const t = t0 + i * passo + 60_000;
      tenta(() => E.touch(p, t));
      if (i === 0) p.energy = Math.min(p.energy, E.energyMax(p));
      trabalho(p, t);
      simRng = rng; golpesGrandes(p, t, perfil, st);
      sessao(p, t, rng, s);
    }
    // barras a droga no fim do dia: só se a próxima render mais do que custa
    const tf = t0 + (n - 1) * passo + 90_000;
    for (let k = 0; k < A.extra; k++) {
      tenta(() => E.touch(p, tf));
      const plano = E.refillPlan(p, tf); if (!plano) break;
      const g = melhorGolpe(p), val = (barra(p, g, heatAgora(p, tf)) * plano.energy) / 100;
      if (val <= plano.cost || liquido(p) < plano.cost * 2) break;
      if (!tenta(() => E.refill(p, tf, world))) break;
      sessao(p, tf, rng, s);
    }
    const ganho = liquido(p) - w0;   // o que entrou no dia (líquido de balas, multas e barras), antes das compras
    st.media = st.media == null ? ganho : st.media * 0.8 + ganho * 0.2;
    // compras: carro, casas (com 1,3 vezes o preço), luxo depois do T1 na cidade (com 1,5 vezes) — as regras do modelo
    if (!st.carro && p.cash + p.bank > CARRO + 1000) { gastar(p, CARRO); st.carro = dia; }
    while (E.housePrice(p) !== null && liquido(p) > CFG.house.tiers[p.house + 1].price * 1.3) {
      if (!tenta(() => E.buyHouse(p, tf, world))) break;
      if (!st.saiu) st.saiu = dia; if (!st.t1 && p.house >= CASA_A_SERIO) st.t1 = dia;
    }
    while (p.house >= CASA_A_SERIO && E.luxuryPrice(p) !== null && liquido(p) > E.luxuryPrice(p) * 1.5) { if (!tenta(() => E.buyLuxury(p, tf, world))) break; st.luxo++; }
    if (!st.n100 && E.level(p) >= 100) st.n100 = dia;
    fotos[dia] = foto(p, st);
  }
  return { fotos, ...st };
}
function gastar(p, m) { const a = Math.min(p.cash, m); p.cash -= a; p.bank -= m - a; }
const foto = (p, st) => ({ fortuna: Math.round(liquido(p) + CFG.house.tiers[p.house].price + p.dst.reduce((x, g, j) => x + (g * CFG.deal.list[j].kg) / 1000, 0)), nivel: E.level(p), dia: Math.round(st.media || 0) });

const med = (a, q = 0.5) => { const b = a.filter((x) => x != null).sort((x, y) => x - y); return b.length ? b[Math.min(b.length - 1, Math.floor(q * b.length))] : null; };
const eur = (n) => (n == null ? '—' : n.toLocaleString('pt-PT') + ' €');
const DIAS_FOTO = [1, 7, 30, 90, 180, 365].filter((d) => d <= DIAS);
const res = {};
for (const perfil of Object.keys(PERFIS)) {
  const rng = seededRng(SEED * 1000 + perfil.length * 97), runs = [];
  for (let i = 0; i < N; i++) runs.push(simula(perfil, rng));
  res[perfil] = {
    fotos: Object.fromEntries(DIAS_FOTO.map((d) => [d, { fortuna: med(runs.map((r) => r.fotos[d].fortuna)), p90: med(runs.map((r) => r.fotos[d].fortuna), 0.9), nivel: med(runs.map((r) => r.fotos[d].nivel)), dia: med(runs.map((r) => r.fotos[d].dia)) }])),
    ops90: med(runs.map((r) => r.ops90 || 0)), og90: med(runs.map((r) => r.og90 || 0)), oc90: med(runs.map((r) => r.oc90 || 0)), lux: med(runs.map((r) => r.luxo)), ops: med(runs.map((r) => r.ops || 0)), byop: runs[0].byop || {},
    carro: med(runs.map((r) => r.carro)), saiu: med(runs.map((r) => r.saiu)), t1: med(runs.map((r) => r.t1)), n100: med(runs.map((r) => r.n100)), luxo: med(runs.map((r) => r.luxo)),
    semT1: runs.filter((r) => r.t1 == null).length / N, sem100: runs.filter((r) => r.n100 == null).length / N,
  };
}
console.log(`Motor verdadeiro · semente ${SEED} · ${N} contas por perfil · ${DIAS} dias (${SEM_EMPREGO ? 'sem empregos' : 'com empregos e cursos'}, ${SEM_OPS ? 'sem golpes grandes' : 'com golpes grandes, avença e lavagem'})\n`);
for (const [perfil, r] of Object.entries(res)) {
  console.log(perfil.toUpperCase() + `  (${PERFIS[perfil].sessoes} barras de stamina por dia${PERFIS[perfil].extra ? ' e até ' + PERFIS[perfil].extra + ' a droga' : ''})`);
  for (const d of DIAS_FOTO) console.log(`  dia ${String(d).padStart(3)}: fortuna mediana ${eur(r.fotos[d].fortuna).padStart(14)}   10% mais ricos ${eur(r.fotos[d].p90).padStart(14)}   nível ${String(r.fotos[d].nivel).padStart(3)}   ganha por dia ${eur(r.fotos[d].dia)}`);
  console.log(`  primeiro carro: dia ${r.carro ?? '—'}   sai da barraca: dia ${r.saiu ?? '—'}   T1 na cidade: dia ${r.t1 ?? '—'}${r.semT1 ? ` (${Math.round(r.semT1 * 100)}% sem T1)` : ''}   nível 100: dia ${r.n100 ?? '—'}${r.sem100 ? ` (${Math.round(r.sem100 * 100)}% não chegam)` : ''}   luxo: ${r.luxo} de ${CFG.luxury.list.length}`);
  if (!SEM_OPS) console.log(`  golpes grandes: ${r.ops90} até ao dia 90 (renderam ${Math.round(r.og90)} €, custaram ${Math.round(r.oc90)} €), ${r.ops} no ano (uma conta: ${Object.entries(r.byop).map(([k, n]) => k + ' ' + n).join(', ') || 'nenhum'})`);
  console.log('');
}
console.log(JSON.stringify(res));
