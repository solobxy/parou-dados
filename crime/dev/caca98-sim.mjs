// v98: quanto rende uma saída de caça em cada reserva (para afinar taxas e valores). Corre com: node dev/caca98-sim.mjs (dentro de crime/)
// Joga como um jogador razoável: aproxima-se se a hipótese com mira boa for baixa, procura outro se a arma não mata, senão dispara.
import { CFG, T } from '../engine/config.js';
import * as E from '../engine/engine.js';
import { seededRng } from '../engine/rng.js';
import { lisbonToUtc } from '../engine/time.js';

const START = lisbonToUtc(2026, 11, 20, 12), world = { start: START - T.DAY, playEnd: Number.MAX_SAFE_INTEGER, press: 50 };
const H = CFG.hunt, N = +(process.env.N || 3000);
const AIM = [['perf', 25], ['bom', 40], ['fraco', 25], ['mau', 10]];
// a melhor de cada tipo que o nível deixa comprar (o jogador escolhe a que rende mais nessa reserva)
function armas(L, mode) {
  const ok = CFG.gear.filter((g) => g.gun && g.slot === 'principal' && (g.level || 1) <= L && (mode === 'fur' || H.legalT.includes(g.t)));
  const best = {}; for (const g of ok) if (!best[g.t] || g.atk > best[g.t].atk) best[g.t] = g;
  return Object.values(best);
}
function sessao(S, sk, mode, rng, g, mods) {
  const p = E.newPlayer('s' + Math.random(), START, world);
  p.cash = 1e9; p.respect = 1e9; p.peakRespect = 1e9; p.vigor = 100; p.hunt.sk = sk * 1000;
  p.eq.principal = { id: g.id, u: 99, m: mods };
  const r0 = { int: (a, b) => rng.int(a, b), chance: (bp) => rng.int(1, 10000) <= bp };
  let t = START, o = E.huntStart(p, t, world, r0, S.id, mode), out = { cash: 0, kills: 0, hosp: 0, jail: 0, prot: 0 };
  for (let k = 0; k < 40 && p.hunt.on; k++) {
    t += 5000; const v = E.huntView(p, t), c = v.cur;
    let r;
    if (!c) r = E.huntLook(p, t, world, r0);
    else if (!c.kill && v.moves > 0) r = E.huntLook(p, t, world, r0);
    else if (c.hit.bom < 3500 && v.moves > 0 && c.d > H.minD) r = E.huntNear(p, t, world, r0);
    else {
      let x = rng.int(1, 100), q = 'bom'; for (const [k2, w] of AIM) { x -= w; if (x <= 0) { q = k2; break; } }
      // um instante com essa qualidade
      const half = p.hunt.on.cur.P / 2, ph = p.hunt.on.cur.ph / 1000, want = { perf: 0.02, bom: 0.1, fraco: 0.22, mau: 0.4 }[q];
      const at = Math.round(((1 - ph + want) % 1) * half);
      r = E.huntShoot(p, t, world, r0, at);
      if (r.shot && r.shot.kill && huntProt(r.shot.sp)) out.prot += 1;
    }
    if (r.end) { if (r.caught) out.jail = 1; if (r.charged) out.hosp = 1; if (!r.caught) { out.cash = r.cash; out.kills = r.bag.length; } }
  }
  return out;
}
const huntProt = (id) => !!E.huntSp(id).prot;
for (const S of H.sites) {
  for (const mode of ['lic', 'fur']) {
    const mods = [];
    for (const sk of [0, 30, 70]) {
      let top = null;
      for (const g of armas(S.level + 5, mode)) {
        const rng = seededRng(7 + sk); let c = 0, k = 0, h = 0, j = 0, pr = 0;
        for (let i = 0; i < N; i++) { const o = sessao(S, sk, mode, rng, g, mods); c += o.cash; k += o.kills; h += o.hosp; j += o.jail; pr += o.prot; }
        if (!top || c > top.c) top = { g, c, k, h, j, pr };
      }
      const { g, c, k, h, j, pr } = top;
      const fee = mode === 'lic' ? S.fee : 0;
      console.log(S.id.padEnd(14), mode, 'sk', String(sk).padStart(2), g.id.padEnd(14), 'bruto', Math.round(c / N).toString().padStart(6), 'taxa', String(fee).padStart(4), 'líq', Math.round(c / N - fee).toString().padStart(6),
        'abates', (k / N).toFixed(2), 'hosp', (h / N * 100).toFixed(1) + '%', 'preso', (j / N * 100).toFixed(1) + '%', 'prot', (pr / N).toFixed(3));
    }
  }
}
