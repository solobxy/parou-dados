// Simulação da economia nova (vida infinita, valores reais de Portugal, um dia real = dois meses de jogo).
// Não usa o motor do jogo: é o modelo que serve de especificação, para acertar os números antes de construir.
// Uso: node sim/economia.mjs [semente] [contas por perfil] [dias]
//
// O que tem de provar (falha com código de saída 1 se alguma não se verificar):
//   1. ninguém fica rico numa semana (nem quem joga sem parar passa de 100 000 € ao dia 7);
//   2. o primeiro carro chega na primeira ou segunda semana a quem joga todos os dias;
//   3. sai-se da barraca em dias, mas o primeiro apartamento na cidade demora meses;
//   4. o nível 100 demora cerca de um ano a quem joga todos os dias e não menos de cinco meses a quem joga sem parar;
//   5. jogar o dobro rende menos do que o dobro (a rua aquece), para valer a pena variar em vez de repetir.

const SEED = +(process.argv[2] ?? 1), N = +(process.argv[3] ?? 300), DIAS = +(process.argv[4] ?? 365);
function rngDe(s) { let a = s >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------- números do modelo (os que vão para a wiki) ----------
export const P = {
  mesesPorDia: +(process.env.MESES ?? 2),   // um dia real vale dois meses de jogo: um dia de turnos paga o ordenado de dois meses
  estaminaBarra: 100,
  // Empregos: 6 turnos por dia real, cada um com 10 de energia (barra à parte da stamina). Um dia completo paga dois meses de ordenado líquido.
  turnos: 6, turnoEnergia: 10,
  empregos: [   // líquido por dia completo, curso que pede, preço e dias reais do curso
    { id: 'estafeta', dia: 700, curso: null },
    { id: 'minimo', dia: 819, curso: null },
    { id: 'vigilante', dia: 900, curso: { preco: 570, dias: 2 } },
    { id: 'motorista', dia: 1250, curso: { preco: 1500, dias: 4 } },
    { id: 'tecnico', dia: 1350, curso: { preco: 2100, dias: 21 } },     // licenciatura: 3 propinas de 697 €; 1 348 € é o líquido médio do país
    { id: 'senior', dia: 2400, curso: { preco: 4000, dias: 30 }, nivel: 40 },
  ],
  // Golpes de rua: média por barra de stamina, já com a taxa de sucesso. O que se leva em cada golpe é à sorte
  // (quase sempre pouco, às vezes um telemóvel ou um relógio); a média da primeira hora de um novato anda pelos 1 500 €.
  rua: [
    // gasto = o que sai por barra em multas e fianças (uma falha em quatro é apanhada) e, nos golpes com arma, em arma e balas
    { nivel: 1, barra: 1150, gasto: 50 },         // furto em loja, carteirista (135 € em média quando corre bem); multa de 150 €
    { nivel: 8, barra: 1500, gasto: 100 },        // arrombar carros; fiança de 400 €
    { nivel: 12, barra: 2000, gasto: 250 },       // esticão (1 500 € em média; na vida real 2 021 €); fiança de 1 500 €
    { nivel: 18, barra: 2800, gasto: 440 + 200 }, // assalto a loja e a bomba de gasolina; fiança de 2 500 €, 100 € de arma e balas por golpe
    { nivel: 30, barra: 3600, gasto: 450 + 100 }, // assaltos armados; fiança de 6 000 €, 100 € de arma e balas por golpe
  ],
  // A rua aquece: rendimento de cada barra seguida de golpes de rua no mesmo dia.
  calor: [1, 1, 0.7, 0.7, 0.45, 0.45, 0.25],
  pratica: { max: 0.3, barrasParaMax: 400 },   // a prática sobe o rendimento até +30%
  // Venda de droga na rua: lucro por barra, capital parado e clientela (barras por dia = base + nível/25).
  venda: [
    { nivel: 10, barra: 1800, capital: 2000 },   // haxixe: quilo a 2 000 €, grama a 5 €; 600 g por barra
    { nivel: 25, barra: 4000, capital: 15000 },  // cocaína: quilo a 15 000 €, grama a 35 €; 200 g por barra
  ],
  clientela: { base: 1, porNivel: 25 },
  // Operações: uma de cada vez. Dias reais de preparação, custo, parte do jogador se correr bem, hipótese, descanso antes da seguinte.
  ops: [
    { id: 'carros', nivel: 15, dias: 0.5, custo: 200, ganho: 4300, p: 0.8, pausa: 0 },
    { id: 'residencia', nivel: 20, dias: 1, custo: 500, ganho: 4500, p: 0.75, pausa: 0 },
    { id: 'ourivesaria', nivel: 35, dias: 2, custo: 5000, ganho: 35000, p: 0.65, pausa: 1 },
    { id: 'lancha', nivel: 40, dias: 2, custo: 70000, ganho: 170000, p: 0.8, pausa: 2 },      // 100 kg de haxixe: 700 €/kg em Marrocos, 2 000 €/kg cá, menos a tripulação
    { id: 'banco', nivel: 55, dias: 4, custo: 30000, ganho: 78000, p: 0.55, pausa: 2 },
    { id: 'carrinha', nivel: 65, dias: 5, custo: 40000, ganho: 100000, p: 0.5, pausa: 3 },
    { id: 'contentor', nivel: 75, dias: 5, custo: 400000, ganho: 1500000, p: 0.7, pausa: 5 },  // 100 kg de cocaína: 15 000 €/kg por grosso
    { id: 'casino', nivel: 80, dias: 7, custo: 150000, ganho: 700000, p: 0.4, pausa: 5 },
  ],
  falhaOp: { advogado: [3000, 7000], perdeCusto: true },
  // Casas: começa-se numa barraca de 0 €. Não há renda nem despesa de casa: as casas só se compram, e cada uma dá mais espaços de inventário.
  // Compra-se quando há 1,3 vezes o preço; a antiga entra na troca pelo que custou.
  vida: [
    { id: 'barraca', dia: 0, espacos: 6 },
    { id: 'roulotte', compra: +(process.env.ROUL ?? 6000), dia: 0, espacos: 12 },   // usada; preço sem fonte (grau D)
    { id: 'T1 no interior', compra: 54000, dia: 0, espacos: 20 },                    // 50 m² em Castelo Branco
    { id: 'T1 na cidade', compra: 183000, dia: 0, espacos: 30 },                     // 50 m² no Porto, a 3 665 €/m²
    { id: 'moradia', compra: 600000, dia: 0, espacos: 45 },
    { id: 'mansão', compra: 3000000, dia: 0, espacos: 80 },
  ],
  casaASerio: 183000,   // a prova da «primeira casa» mede o primeiro T1 na cidade, não a roulotte
  parteDaVida: +(process.env.PARTE ?? 0.5),
  carro: 5000,   // usado barato; compra-se quando sobram 1 000 € depois de o pagar
  // Stamina a mais do que a natural: cada barra extra custa droga e desintoxicação, cada vez mais cara no mesmo dia.
  extra: (k) => 35 * k + 15 * k * k,   // 1.ª barra extra 50 €, 3.ª 240 €, 7.ª 980 €
  lavagem: { acimaDe: 100000, parte: 0.2 },   // dinheiro do crime que passa pelas fachadas: custa 20%
  // Gastos que crescem com a fortuna (as casas não têm despesa).
  segurancas: { nivel: 60, dia: 3600, max: 6, parte: 0.2 },   // quem pode ser morto paga guarda-costas: 1 800 € por mês cada, até 6, até 20% do que ganha
  avenca: { nivel: 30, dia: 3000, parte: 0.05 },              // advogado em avença (1 500 € por mês): cobre o advogado das operações falhadas
  suborno: 0.06,                                              // 6% do valor de uma operação grande, pago antes: se falhar, não há prisão nem investigação
  // Luxo acima da mansão: compra-se pela ordem, quando há 1,5 vezes o preço. Não tem despesa.
  luxo: [
    { id: 'relógio de marca', preco: 12000 }, { id: 'carro bom usado', preco: 25700 }, { id: 'lancha de recreio', preco: 80000 },
    { id: 'Porsche 911', preco: 200263 }, { id: 'helicóptero', preco: 550000 }, { id: 'iate', preco: 2500000 },
    { id: 'jato privado', preco: 4500000 }, { id: 'quinta no Douro', preco: 6000000 }, { id: 'palacete em Lisboa', preco: 15000000 },
    { id: 'ilha privada', preco: 40000000 },
  ],
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
  const s = { cash: 50, resp: 0, emprego: 1, curso: null, pratica: 0, capital: 0, vida: 0, casa: 0, carro: null, op: null, pausaAte: 0, luxo: 0, gastoLuxo: 0, n100: null, casaDia: null, tetoDia: null, ilegal: 0, diasJogados: 0 };
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
    // emprego: 6 turnos por dia, pagos com energia. Todos os fazem
    const turnos = P.turnos;
    entra += (P.empregos[s.emprego].dia * P.mesesPorDia * turnos) / P.turnos; s.resp += turnos * P.resp.turno;   // os turnos gastam energia (a barra do ginásio e das lutas), não a stamina dos crimes
    let crime = 0;
    // venda de droga: primeiro, até ao limite da clientela
    const r = [...P.rua].reverse().find((x) => nv >= x.nivel), bonus = 1 + P.pratica.max * Math.min(1, s.pratica / P.pratica.barrasParaMax);
    const piorBarra = r.barra * bonus * P.calor[Math.min(Math.max(0, Math.ceil(barras) - 1), P.calor.length - 1)];   // o que rende a barra de rua mais quente do dia
    const v = [...P.venda].reverse().find((x) => nv >= x.nivel && x.barra > piorBarra && (s.capital >= x.capital || s.cash > x.capital * 1.5));
    if (v) {
      if (s.capital < v.capital) { sai += v.capital - s.capital; s.capital = v.capital; }
      const b = Math.min(barras, P.clientela.base + nv / P.clientela.porNivel);
      crime += b * v.barra; s.resp += b * P.resp.venda(nv); barras -= b;
    }
    // golpes de rua com o resto da stamina, a aquecer
    let i = 0;
    for (; barras > 0.01; i++) { const b = Math.min(1, barras), c = P.calor[Math.min(i, P.calor.length - 1)]; barras -= b; if (r.barra * bonus * c <= r.gasto) continue; crime += b * r.barra * bonus * c; sai += b * r.gasto; s.resp += b * P.resp.rua(nv) * c; s.pratica += b; }   // o calor corta o dinheiro e o respeito; as multas não baixam
    // barras a mais, a droga: só se a barra render mais do que custa
    for (let k = 1; k <= A.extra; k++, i++) { const g = r.barra * bonus * P.calor[Math.min(i, P.calor.length - 1)]; if (g <= P.extra(k) + r.gasto) break; crime += g; sai += P.extra(k) + r.gasto; s.resp += P.resp.rua(nv) * P.calor[Math.min(i, P.calor.length - 1)]; s.pratica += 1; s.extras = (s.extras || 0) + 1; }
    // operações: prepara a melhor que consegue pagar; resolve quando chega o dia
    if (s.op && d >= s.op.fim) {
      const o = s.op.o; s.op = null; s.pausaAte = d + o.pausa;
      if (rng() < o.p) { crime += o.ganho; s.resp += P.resp.op(o.ganho); }
      else { const adv = P.falhaOp.advogado[0] + rng() * (P.falhaOp.advogado[1] - P.falhaOp.advogado[0]) * (o.custo > 2000 ? 1 : 0.1); if (!s.avenca) sai += adv; }
    }
    if (!s.op && d >= s.pausaAte && perfil !== 'casual') {
      const vale = (x) => (x.p * x.ganho - x.custo) / (Math.max(1, Math.ceil(x.dias)) + x.pausa);   // o que rende por dia, contando a pausa
      const o = P.ops.filter((x) => nv >= x.nivel && s.cash > x.custo * 3).sort((x, y) => vale(y) - vale(x))[0];
      if (o) { s.op = { o, fim: d + Math.max(1, Math.ceil(o.dias)) }; sai += o.custo + (o.custo > 2000 ? P.suborno * o.ganho : 0); }
    }
    // lavagem e equipa
    s.ilegal += crime;
    if (s.ilegal > P.lavagem.acimaDe) crime *= 1 - P.lavagem.parte;
    entra += crime;
    // vida: sobe de degrau quando pode
    s.media = s.media == null ? entra : s.media * 0.8 + entra * 0.2;   // o que se ganha por dia, alisado
    s.avenca = nv >= P.avenca.nivel && P.avenca.dia <= s.media * P.avenca.parte;
    if (s.avenca) sai += P.avenca.dia;
    if (nv >= P.segurancas.nivel) sai += P.segurancas.dia * Math.min(P.segurancas.max, Math.floor((s.media * P.segurancas.parte) / P.segurancas.dia));
    const cabe = (i) => { const t = P.vida[i]; return t && t.dia * P.mesesPorDia <= s.media * P.parteDaVida && (!t.compra || s.casa >= t.compra || s.cash + entra - sai > t.compra * 1.3); };
    let alvo = 0; for (let j = 1; j < P.vida.length; j++) if (cabe(j)) alvo = j;
    if (alvo !== s.vida) { s.vida = alvo; const t = P.vida[alvo]; if (t.compra && s.casa < t.compra) { sai += t.compra - s.casa; s.casa = t.compra; if (!s.tetoDia) s.tetoDia = d; if (!s.casaDia && t.compra >= P.casaASerio) s.casaDia = d; } }
    sai += P.vida[s.vida].dia * P.mesesPorDia; s.sumidouro = (s.sumidouro || 0) + sai; s.torneira = (s.torneira || 0) + entra;
    s.cash += entra - sai;
    if (s.cash < 0) s.cash = 0;   // sem dinheiro: come na cantina social, não acumula dívida (rede para não castigar o novato)
    if (!s.carro && s.cash > P.carro + 1000) { s.cash -= P.carro; s.carro = d; }
    while (s.casa >= P.casaASerio && P.luxo[s.luxo] && s.cash > P.luxo[s.luxo].preco * 1.5) { const x = P.luxo[s.luxo++]; s.cash -= x.preco; s.gastoLuxo += x.preco; s.sumidouro += x.preco; }
    if (!s.n100 && nivelDe(s.resp) >= 100) s.n100 = d;
    marcos[d] = foto(s);
  }
  return { marcos, luxo: s.luxo, carro: s.carro, teto: s.tetoDia, casa: s.casaDia, n100: s.n100, dias: s.diasJogados, ralo: s.sumidouro / s.torneira };
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
    luxo: med(runs.map((r) => r.luxo)), carro: med(runs.map((r) => r.carro)), teto: med(runs.map((r) => r.teto)), casa: med(runs.map((r) => r.casa)), n100: med(runs.map((r) => r.n100)), semCasa: runs.filter((r) => r.casa == null).length / N, sem100: runs.filter((r) => r.n100 == null).length / N,
  };
}
console.log(`Economia nova · semente ${SEED} · ${N} contas por perfil · ${DIAS} dias (um dia real = ${P.mesesPorDia} meses de jogo)\n`);
for (const [perfil, r] of Object.entries(res)) {
  console.log(perfil.toUpperCase() + `  (${PERFIS[perfil].barras} barras de stamina por dia)`);
  for (const d of DIAS_FOTO) console.log(`  dia ${String(d).padStart(3)}: fortuna mediana ${eur(r.fotos[d].fortuna).padStart(14)}   10% mais ricos ${eur(r.fotos[d].p90).padStart(14)}   nível ${String(r.fotos[d].nivel).padStart(3)}   ganha por dia ${eur(r.fotos[d].dia)}`);
  console.log(`  primeiro carro: dia ${r.carro ?? '—'}   sai da barraca: dia ${r.teto ?? '—'}   T1 na cidade: dia ${r.casa ?? '—'}${r.semCasa ? ` (${Math.round(r.semCasa * 100)}% sem casa)` : ''}   nível 100: dia ${r.n100 ?? '—'}${r.sem100 ? ` (${Math.round(r.sem100 * 100)}% não chegam)` : ''}   sai em custos ${Math.round(r.ralo * 100)}% do que entra   luxo: ${r.luxo} de ${P.luxo.length}\n`);
}
const provas = [
  ['Ninguém fica rico numa semana (bot abaixo de 100 000 € ao dia 7)', res.bot.fotos[7].p90 < 100000],
  ['Primeiro carro até ao dia 14 para quem joga todos os dias', res.regular.carro != null && res.regular.carro <= 14],
  ['Primeiro T1 na cidade entre o dia 30 e o dia 150 (regular)', res.regular.casa != null && res.regular.casa >= 30 && res.regular.casa <= 150],
  ['Nível 100 entre o dia 270 e o dia 400 (regular)', DIAS < 400 ? (res.regular.n100 == null || res.regular.n100 >= 270) : res.regular.n100 >= 270 && res.regular.n100 <= 400],
  ['Nível 100 nunca antes do dia 150, nem para o bot', res.bot.n100 == null || res.bot.n100 >= 150],
  ['Quem joga 24 h por dia ganha por dia menos do triplo de quem joga normalmente (dia 30 e dia 180)', res.bot.fotos[30].dia < 3 * res.regular.fotos[30].dia && (DIAS < 180 || res.bot.fotos[180].dia < 3 * res.regular.fotos[180].dia)],
  ['Quem joga uma vez por dia não fica na miséria: tem carro até ao dia 60', res.casual.carro != null && res.casual.carro <= 60],
];
let ok = true;
for (const [nome, passa] of provas) { console.log((passa ? 'PASSA  ' : 'FALHA  ') + nome); ok = ok && passa; }
process.exit(ok ? 0 : 1);
