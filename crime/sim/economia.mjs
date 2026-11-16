// Simulação da economia nova (vida infinita, valores reais de Portugal, um dia real = um mês de jogo).
// Não usa o motor do jogo: é o modelo que serve de especificação, para acertar os números antes de construir.
// Uso: node sim/economia.mjs [semente] [contas por perfil] [dias]
//
// O que tem de provar (falha com código de saída 1 se alguma não se verificar):
//   1. ninguém fica rico numa semana (nem quem joga sem parar passa de 100 000 € ao dia 7);
//   2. o primeiro carro chega na primeira ou segunda semana a quem joga todos os dias;
//   3. a primeira casa comprada demora meses, não dias;
//   4. o nível 100 demora cerca de um ano a quem joga todos os dias e não menos de cinco meses a quem joga sem parar;
//   5. jogar o dobro rende menos do que o dobro (a rua aquece), para valer a pena variar em vez de repetir.

const SEED = +(process.argv[2] ?? 1), N = +(process.argv[3] ?? 300), DIAS = +(process.argv[4] ?? 365);
function rngDe(s) { let a = s >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------- números do modelo (os que vão para a wiki) ----------
export const P = {
  estaminaBarra: 100,
  // Empregos: o ordenado líquido de um mês real paga-se por dia real, em 6 turnos de 10 de stamina.
  turnos: 6, turnoStamina: 10,
  empregos: [   // líquido por dia completo, curso que pede, preço e dias reais do curso
    { id: 'estafeta', dia: 700, curso: null },
    { id: 'minimo', dia: 819, curso: null },
    { id: 'vigilante', dia: 900, curso: { preco: 570, dias: 2 } },
    { id: 'motorista', dia: 1250, curso: { preco: 1500, dias: 4 } },
    { id: 'tecnico', dia: 1350, curso: { preco: 2100, dias: 21 } },     // licenciatura: 3 propinas de 697 €; 1 348 € é o líquido médio do país
    { id: 'senior', dia: 2400, curso: { preco: 4000, dias: 30 }, nivel: 40 },
  ],
  // Golpes de rua: líquido por barra de stamina já com o recetador (30% do valor declarado), a taxa de sucesso e as multas.
  rua: [
    { nivel: 1, barra: 220 },    // furto em loja (80 € declarados), carteirista
    { nivel: 8, barra: 420 },    // arrombar carros
    { nivel: 12, barra: 800 },   // esticão (1 743 € declarados em média)
    { nivel: 18, barra: 1300 },  // assalto a loja e a bomba de gasolina
    { nivel: 30, barra: 1800 },  // assaltos armados
  ],
  // A rua aquece: rendimento de cada barra seguida de golpes de rua no mesmo dia.
  calor: [1, 1, 0.7, 0.7, 0.45, 0.45, 0.25],
  pratica: { max: 0.3, barrasParaMax: 400 },   // a prática sobe o rendimento até +30%
  // Venda de droga na rua: lucro por barra, capital parado e clientela (barras por dia = base + nível/25).
  venda: [
    { nivel: 10, barra: 300, capital: 2000 },    // haxixe: quilo a 2 000 €, grama a 5 €
    { nivel: 25, barra: 1000, capital: 15000 },  // cocaína: quilo a 15 000 €, grama a 35 €
  ],
  clientela: { base: 1, porNivel: 25 },
  // Operações: uma de cada vez. Dias reais de preparação, custo, parte do jogador se correr bem, hipótese, descanso antes da seguinte.
  ops: [
    { id: 'carros', nivel: 15, dias: 0.5, custo: 200, ganho: 1900, p: 0.8, pausa: 0 },
    { id: 'residencia', nivel: 20, dias: 1, custo: 500, ganho: 2000, p: 0.75, pausa: 0 },
    { id: 'ourivesaria', nivel: 35, dias: 2, custo: 5000, ganho: 35000, p: 0.65, pausa: 1 },
    { id: 'lancha', nivel: 40, dias: 2, custo: 70000, ganho: 170000, p: 0.8, pausa: 2 },      // 100 kg de haxixe: 700 €/kg em Marrocos, 2 000 €/kg cá, menos a tripulação
    { id: 'banco', nivel: 55, dias: 4, custo: 30000, ganho: 78000, p: 0.55, pausa: 2 },
    { id: 'carrinha', nivel: 65, dias: 5, custo: 40000, ganho: 100000, p: 0.5, pausa: 3 },
    { id: 'contentor', nivel: 75, dias: 5, custo: 400000, ganho: 1500000, p: 0.7, pausa: 5 },  // 100 kg de cocaína: 15 000 €/kg por grosso
    { id: 'casino', nivel: 80, dias: 7, custo: 150000, ganho: 700000, p: 0.4, pausa: 5 },
  ],
  falhaOp: { advogado: [3000, 7000], perdeCusto: true },
  // Custo de vida por dia jogado (renda de um mês + comida + contas), por degrau de vida.
  // Sobe-se de degrau quando o degrau seguinte cabe em metade do que se ganha por dia; as casas compram-se quando há 1,3 vezes o preço.
  vida: [
    { id: 'quarto', dia: 750 },                              // quarto no Porto 450 + cabaz 256 + passe 40
    { id: 'T1 arrendado', dia: 1400 },                       // T1 no Porto 1 003 + contas e comida
    { id: 'T1 comprado', compra: 183000, dia: 900 },         // 50 m² a 3 665 €/m²; fica o condomínio, contas e vida
    { id: 'moradia', compra: 600000, dia: 3500 },
    { id: 'mansão', compra: 3000000, dia: 18000 },           // pessoal, segurança, carros
  ],
  parteDaVida: 0.5,
  carro: 5000,   // usado barato; compra-se quando sobram 1 000 € depois de o pagar
  // Stamina a mais do que a natural: cada barra extra custa droga e desintoxicação, cada vez mais cara no mesmo dia.
  extra: (k) => 35 * k + 15 * k * k,   // 1.ª barra extra 50 €, 3.ª 240 €, 7.ª 980 €
  lavagem: { acimaDe: 100000, parte: 0.2 },   // dinheiro do crime que passa pelas fachadas: custa 20%
  equipa: 0.05,                               // seguranças, subornos e gente a soldo: 5% do que entra, a partir do nível 30
  // Respeito: o que dá cada coisa, e quanto pede cada nível (acumulado = a × nível^b).
  resp: { rua: (n) => Math.min(120, 20 + 2 * n), venda: (n) => 15 + n, turno: 2, op: (g) => Math.round(3 * Math.sqrt(g)) },
  nivel: { a: +(process.env.NA ?? 1.3), b: +(process.env.NB ?? 2.55) },
};
const nivelDe = (resp) => Math.min(100, Math.max(1, Math.floor(Math.cbrt(resp / P.nivel.a) ** (3 / P.nivel.b))));

// ---------- perfis ----------
const PERFIS = {
  casual:   { barras: 2, extra: 0, falha: 0.25 },    // uma sessão por dia; falha um dia em quatro
  regular:  { barras: 4, extra: 0, falha: 0.05 },    // duas ou três sessões por dia
  hardcore: { barras: 7, extra: 3, falha: 0 },       // gasta a stamina natural toda (7 barras) e até três a droga, se compensar
  bot:      { barras: 7.2, extra: 7, falha: 0 },     // 24 h por dia: o caso que a economia tem de aguentar
};

function simula(perfil, rng) {
  const A = PERFIS[perfil];
  const s = { cash: 50, resp: 0, emprego: 1, curso: null, pratica: 0, capital: 0, vida: 0, casa: 0, carro: null, op: null, pausaAte: 0, n100: null, casaDia: null, ilegal: 0, diasJogados: 0 };
  const marcos = {};
  for (let d = 1; d <= DIAS; d++) {
    if (rng() < A.falha) { marcos[d] = foto(s); continue; }
    s.diasJogados++;
    const nv = nivelDe(s.resp);
    let barras = A.barras, entra = 0, sai = 0;
    // cursos: começa o próximo se tiver dinheiro; acaba ao fim dos dias
    const prox = P.empregos[s.emprego + 1];
    if (!s.curso && prox && (!prox.nivel || nv >= prox.nivel) && s.cash > prox.curso.preco * 2) { s.curso = { fim: d + prox.curso.dias }; sai += prox.curso.preco; }
    if (s.curso && d >= s.curso.fim) { s.emprego++; s.curso = null; }
    // emprego: 6 turnos (0,6 de uma barra); o casual só faz metade
    const turnos = perfil === 'casual' ? 3 : P.turnos;
    entra += (P.empregos[s.emprego].dia * turnos) / P.turnos; s.resp += turnos * P.resp.turno; barras -= (turnos * P.turnoStamina) / P.estaminaBarra;
    let crime = 0;
    // venda de droga: primeiro, até ao limite da clientela
    const v = [...P.venda].reverse().find((x) => nv >= x.nivel && (s.capital >= x.capital || s.cash > x.capital * 1.5));
    if (v) {
      if (s.capital < v.capital) { sai += v.capital - s.capital; s.capital = v.capital; }
      const b = Math.min(barras, P.clientela.base + nv / P.clientela.porNivel);
      crime += b * v.barra; s.resp += b * P.resp.venda(nv); barras -= b;
    }
    // golpes de rua com o resto da stamina, a aquecer
    const r = [...P.rua].reverse().find((x) => nv >= x.nivel), bonus = 1 + P.pratica.max * Math.min(1, s.pratica / P.pratica.barrasParaMax);
    let i = 0;
    for (; barras > 0.01; i++) { const b = Math.min(1, barras), c = P.calor[Math.min(i, P.calor.length - 1)]; crime += b * r.barra * bonus * c; s.resp += b * P.resp.rua(nv) * c; s.pratica += b; barras -= b; }   // o calor corta o dinheiro e o respeito
    // barras a mais, a droga: só se a barra render mais do que custa
    for (let k = 1; k <= A.extra; k++, i++) { const g = r.barra * bonus * P.calor[Math.min(i, P.calor.length - 1)]; if (g <= P.extra(k)) break; crime += g; sai += P.extra(k); s.resp += P.resp.rua(nv) * P.calor[Math.min(i, P.calor.length - 1)]; s.pratica += 1; s.extras = (s.extras || 0) + 1; }
    // operações: prepara a melhor que consegue pagar; resolve quando chega o dia
    if (s.op && d >= s.op.fim) {
      const o = s.op.o; s.op = null; s.pausaAte = d + o.pausa;
      if (rng() < o.p) { crime += o.ganho; s.resp += P.resp.op(o.ganho); }
      else sai += P.falhaOp.advogado[0] + rng() * (P.falhaOp.advogado[1] - P.falhaOp.advogado[0]) * (o.custo > 2000 ? 1 : 0.1);
    }
    if (!s.op && d >= s.pausaAte && perfil !== 'casual') {
      const vale = (x) => (x.p * x.ganho - x.custo) / (Math.max(1, Math.ceil(x.dias)) + x.pausa);   // o que rende por dia, contando a pausa
      const o = P.ops.filter((x) => nv >= x.nivel && s.cash > x.custo * 3).sort((x, y) => vale(y) - vale(x))[0];
      if (o) { s.op = { o, fim: d + Math.max(1, Math.ceil(o.dias)) }; sai += o.custo; }
    }
    // lavagem e equipa
    s.ilegal += crime;
    if (s.ilegal > P.lavagem.acimaDe) crime *= 1 - P.lavagem.parte;
    if (nv >= 30) crime *= 1 - P.equipa;
    entra += crime;
    // vida: sobe de degrau quando pode
    s.media = s.media == null ? entra : s.media * 0.8 + entra * 0.2;   // o que se ganha por dia, alisado
    const cabe = (i) => { const t = P.vida[i]; return t && t.dia <= s.media * P.parteDaVida && (!t.compra || s.casa >= t.compra || s.cash + entra - sai > t.compra * 1.3); };
    let alvo = 0; for (let j = 1; j < P.vida.length; j++) if (cabe(j)) alvo = j;
    if (alvo !== s.vida) { s.vida = alvo; const t = P.vida[alvo]; if (t.compra && s.casa < t.compra) { sai += t.compra - s.casa; s.casa = t.compra; if (!s.casaDia) s.casaDia = d; } }
    sai += P.vida[s.vida].dia; s.sumidouro = (s.sumidouro || 0) + sai; s.torneira = (s.torneira || 0) + entra;
    s.cash += entra - sai;
    if (s.cash < 0) s.cash = 0;   // sem dinheiro: come na cantina social, não acumula dívida (rede para não castigar o novato)
    if (!s.carro && s.cash > P.carro + 1000) { s.cash -= P.carro; s.carro = d; }
    if (!s.n100 && nivelDe(s.resp) >= 100) s.n100 = d;
    marcos[d] = foto(s);
  }
  return { marcos, carro: s.carro, casa: s.casaDia, n100: s.n100, dias: s.diasJogados, ralo: s.sumidouro / s.torneira };
}
const foto = (s) => ({ cash: Math.round(s.cash), fortuna: Math.round(s.cash + s.casa + s.capital), nivel: nivelDe(s.resp), dia: Math.round(s.media || 0) });

// ---------- corre e mostra ----------
const med = (a, q = 0.5) => { const b = a.filter((x) => x != null).sort((x, y) => x - y); return b.length ? b[Math.min(b.length - 1, Math.floor(q * b.length))] : null; };
const eur = (n) => (n == null ? '—' : n.toLocaleString('pt-PT').replace(/ /g, ' ') + ' €');
const DIAS_FOTO = [1, 7, 30, 90, 180, 365].filter((d) => d <= DIAS);
const res = {};
for (const perfil of Object.keys(PERFIS)) {
  const rng = rngDe(SEED * 1000 + perfil.length * 97), runs = Array.from({ length: N }, () => simula(perfil, rng));
  res[perfil] = {
    fotos: Object.fromEntries(DIAS_FOTO.map((d) => [d, { fortuna: med(runs.map((r) => r.marcos[d].fortuna)), p90: med(runs.map((r) => r.marcos[d].fortuna), 0.9), nivel: med(runs.map((r) => r.marcos[d].nivel)), dia: med(runs.map((r) => r.marcos[d].dia)) }])),
    ralo: med(runs.map((r) => r.ralo)),
    carro: med(runs.map((r) => r.carro)), casa: med(runs.map((r) => r.casa)), n100: med(runs.map((r) => r.n100)), semCasa: runs.filter((r) => r.casa == null).length / N, sem100: runs.filter((r) => r.n100 == null).length / N,
  };
}
console.log(`Economia nova · semente ${SEED} · ${N} contas por perfil · ${DIAS} dias (um dia real = um mês de jogo)\n`);
for (const [perfil, r] of Object.entries(res)) {
  console.log(perfil.toUpperCase() + `  (${PERFIS[perfil].barras} barras de stamina por dia)`);
  for (const d of DIAS_FOTO) console.log(`  dia ${String(d).padStart(3)}: fortuna mediana ${eur(r.fotos[d].fortuna).padStart(14)}   10% mais ricos ${eur(r.fotos[d].p90).padStart(14)}   nível ${String(r.fotos[d].nivel).padStart(3)}   ganha por dia ${eur(r.fotos[d].dia)}`);
  console.log(`  primeiro carro: dia ${r.carro ?? '—'}   primeira casa comprada: dia ${r.casa ?? '—'}${r.semCasa ? ` (${Math.round(r.semCasa * 100)}% sem casa)` : ''}   nível 100: dia ${r.n100 ?? '—'}${r.sem100 ? ` (${Math.round(r.sem100 * 100)}% não chegam)` : ''}   sai em custos ${Math.round(r.ralo * 100)}% do que entra\n`);
}
const provas = [
  ['Ninguém fica rico numa semana (bot abaixo de 100 000 € ao dia 7)', res.bot.fotos[7].p90 < 100000],
  ['Primeiro carro até ao dia 14 para quem joga todos os dias', res.regular.carro != null && res.regular.carro <= 14],
  ['Primeira casa comprada entre o dia 45 e o dia 150 (regular)', res.regular.casa != null && res.regular.casa >= 45 && res.regular.casa <= 150],
  ['Nível 100 entre o dia 270 e o dia 400 (regular)', DIAS < 400 ? (res.regular.n100 == null || res.regular.n100 >= 270) : res.regular.n100 >= 270 && res.regular.n100 <= 400],
  ['Nível 100 nunca antes do dia 150, nem para o bot', res.bot.n100 == null || res.bot.n100 >= 150],
  ['Quem joga 24 h por dia ganha por dia menos do triplo de quem joga normalmente (dia 30 e dia 180)', res.bot.fotos[30].dia < 3 * res.regular.fotos[30].dia && (DIAS < 180 || res.bot.fotos[180].dia < 3 * res.regular.fotos[180].dia)],
  ['Quem joga uma vez por dia não fica na miséria: tem carro até ao dia 60', res.casual.carro != null && res.casual.carro <= 60],
];
let ok = true;
for (const [nome, passa] of provas) { console.log((passa ? 'PASSA  ' : 'FALHA  ') + nome); ok = ok && passa; }
process.exit(ok ? 0 : 1);
