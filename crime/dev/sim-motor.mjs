// Simulação da economia com o MOTOR VERDADEIRO (passo 2), para comparar com o modelo (sim/economia.mjs).
// Joga contas com os quatro perfis do modelo (uma sessão por dia, todos os dias, a stamina toda, bot) durante N dias,
// sempre pelas funções do motor: golpes de rua, venda de droga, barras a droga, multas, pistola, casas e luxos.
// O que o motor ainda não tem (empregos, operações, lavagem, seguranças, avença) fica de fora; para comparar, o modelo
// corre com os mesmos sistemas desligados (SEM_EMPREGO=1 SEM_OPS=1 SEM_GASTOS=1).
// Uso: node dev/sim-motor.mjs [semente] [contas por perfil] [dias]   (dentro de crime/)
import { CFG, T } from '../engine/config.js';
import * as E from '../engine/engine.js';
import { seededRng } from '../engine/rng.js';
import { lisbonToUtc } from '../engine/time.js';

const SEED = +(process.argv[2] ?? 1), N = +(process.argv[3] ?? 100), DIAS = +(process.argv[4] ?? 365);
const T0 = lisbonToUtc(2026, 11, 20, 0, 30);      // cada dia de jogo vai das 0:30 à meia-noite de Lisboa (a rua arrefece à meia-noite)
const world = { start: T0 - T.DAY, playEnd: Number.MAX_SAFE_INTEGER };
const CARRO = 5000, CASA_A_SERIO = 3;             // como no modelo: carro usado de 5 000 € e o T1 na cidade
const GUN = CFG.weapons.findIndex((w) => w.id === CFG.street.gun);
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
  const c = CFG.crimes[k], n = 100 / c.e, bonus = 1 + (E.masteryStars(p, k) * CFG.mastery.bonusBp) / 10000;
  const ganho = n * (c.p / 10000) * ev(c) * bonus * (heatBp / 10000);
  const custo = n * ((c.gun ? CFG.street.ammo : 0) + (1 - c.p / 10000) * (CFG.bustBp / 10000) * c.fine);
  return ganho - custo;
}
function melhorGolpe(p) {
  let best = 0, v = -Infinity;
  for (let k = 0; k < CFG.crimes.length; k++) {
    const c = CFG.crimes[k];
    if (!E.crimeUnlocked(p, k) || (c.gun && p.weapon < GUN)) continue;
    const x = barra(p, k, 10000); if (x > v) { v = x; best = k; }
  }
  return best;
}
const heatAgora = (p, t) => E.streetView(p, t).heatBp;
const tenta = (f) => { try { return f(); } catch (e) { if (!(e instanceof E.GameError)) throw e; return null; } };

function sessao(p, t, rng, s) {
  // multas: paga-se para sair (o modelo assume que se paga)
  if (p.jailUntil > t) { tenta(() => E.payBail(p, t, world)); if (p.jailUntil > t) return; }
  // pistola: compra-se por ordem quando o nível a pede e há dinheiro
  if (E.level(p) >= CFG.crimes.find((c) => c.gun).level) while (p.weapon < GUN && liquido(p) > CFG.weapons[p.weapon + 1].price * 2) tenta(() => E.buyGear(p, t, world, 'weapon', p.weapon + 1));
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
    if (c.gun && liquido(p) < CFG.street.ammo) break;
    const r = tenta(() => E.doCrimeAll(p, t, world, k, rng)); if (!r) break;
  }
}

function simula(perfil, rng) {
  const A = PERFIS[perfil], p = E.newPlayer('sim-' + perfil, T0 - T.HOUR, world);
  p.cls = 'ladrao';
  const st = { carro: null, saiu: null, t1: null, n100: null, media: null, luxo: 0, dias: 0, entrou: 0, saiu$: 0 };
  const fotos = {};
  for (let dia = 1; dia <= DIAS; dia++) {
    const t0 = T0 + (dia - 1) * T.DAY;
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
    carro: med(runs.map((r) => r.carro)), saiu: med(runs.map((r) => r.saiu)), t1: med(runs.map((r) => r.t1)), n100: med(runs.map((r) => r.n100)), luxo: med(runs.map((r) => r.luxo)),
    semT1: runs.filter((r) => r.t1 == null).length / N, sem100: runs.filter((r) => r.n100 == null).length / N,
  };
}
console.log(`Motor verdadeiro · semente ${SEED} · ${N} contas por perfil · ${DIAS} dias (sem empregos nem operações, que ainda não existem)\n`);
for (const [perfil, r] of Object.entries(res)) {
  console.log(perfil.toUpperCase() + `  (${PERFIS[perfil].sessoes} barras de stamina por dia${PERFIS[perfil].extra ? ' e até ' + PERFIS[perfil].extra + ' a droga' : ''})`);
  for (const d of DIAS_FOTO) console.log(`  dia ${String(d).padStart(3)}: fortuna mediana ${eur(r.fotos[d].fortuna).padStart(14)}   10% mais ricos ${eur(r.fotos[d].p90).padStart(14)}   nível ${String(r.fotos[d].nivel).padStart(3)}   ganha por dia ${eur(r.fotos[d].dia)}`);
  console.log(`  primeiro carro: dia ${r.carro ?? '—'}   sai da barraca: dia ${r.saiu ?? '—'}   T1 na cidade: dia ${r.t1 ?? '—'}${r.semT1 ? ` (${Math.round(r.semT1 * 100)}% sem T1)` : ''}   nível 100: dia ${r.n100 ?? '—'}${r.sem100 ? ` (${Math.round(r.sem100 * 100)}% não chegam)` : ''}   luxo: ${r.luxo} de ${CFG.luxury.list.length}\n`);
}
console.log(JSON.stringify(res));
