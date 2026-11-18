// Simulação da economia nova (vida infinita, valores reais de Portugal, um dia real = dois meses de jogo).
// Não usa o motor do jogo: é o modelo que serve de especificação, para acertar os números antes de construir.
// Uso: node sim/economia.mjs [semente] [contas por perfil] [dias]
//
// O que tem de provar (falha com código de saída 1 se alguma não se verificar):
//   1. ninguém fica rico numa semana (nem quem joga sem parar passa de 120 000 € ao dia 7, dois terços do primeiro T1;
//      era 100 000 € antes de os biscates pagarem como o crime do mesmo nível, 17/11);
//   2. o primeiro carro chega na primeira ou segunda semana a quem joga todos os dias;
//   3. sai-se da barraca em dias, mas o primeiro apartamento na cidade demora cerca de um mês ou mais (dia 28 a 150);
//   4. o nível 100 demora cerca de um ano a quem joga todos os dias e não menos de cinco meses a quem joga sem parar;
//   5. jogar o dobro rende menos do que o dobro (a rua aquece), para valer a pena variar em vez de repetir.

import { CFG } from '../engine/config.js';   // v101: as viagens usam os números do jogo (destinos, mercadoria, malas)
const SEED = +(process.argv[2] ?? 1), N = +(process.argv[3] ?? 300), DIAS = +(process.argv[4] ?? 365);
// para comparar com o motor (dev/sim-motor.mjs) enquanto ele ainda não tem estes sistemas: SEM_EMPREGO=1, SEM_OPS=1, SEM_GASTOS=1
// (SEM_GASTOS desliga os três gastos; cada um também se desliga sozinho: SEM_LAVAGEM=1, SEM_AVENCA=1, SEM_SEGURANCAS=1)
const SEM_G = process.env.SEM_GASTOS === '1', semG = (k) => (process.env[k] === undefined ? SEM_G : process.env[k] === '1');
const SEM = { emprego: process.env.SEM_EMPREGO === '1', ops: process.env.SEM_OPS === '1', lavagem: semG('SEM_LAVAGEM'), avenca: semG('SEM_AVENCA'), segurancas: semG('SEM_SEGURANCAS'), trafico: process.env.SEM_TRAFICO === '1', negocios: process.env.SEM_NEGOCIOS === '1', trabalho: process.env.SEM_TRABALHO === '1', viagens: process.env.SEM_VIAGENS === '1' };
function rngDe(s) { let a = s >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------- números do modelo (os que vão para a wiki) ----------
export const P = {
  mesesPorDia: +(process.env.MESES ?? 2),   // um dia real vale dois meses de jogo: um dia de turnos paga o ordenado de dois meses
  estaminaBarra: 100,
  // Empregos: 6 turnos por dia real, cada um com 10 de energia (barra à parte da stamina). Um dia completo paga dois meses de ordenado líquido.
  turnos: 6, turnoEnergia: 10, turnoQual: +(process.env.TURNO_Q ?? 1.16),   // o turno é uma tarefa à mão: paga 80% a 120% conforme a qualidade (em média ~116%)
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
    { nivel: 3, barra: 1290, gasto: 75 },         // v72: roubar bicicletas (152 € em média quando corre bem); multa de 200 €
    { nivel: 5, barra: 1300, gasto: 150 },        // v72: multibanco (burla, 325 € em média); multa de 600 €
    { nivel: 8, barra: 1500, gasto: 100 },        // arrombar carros; fiança de 400 €
    { nivel: 12, barra: 2000, gasto: 250 },       // esticão (1 500 € em média; na vida real 2 021 €); fiança de 1 500 €
    { nivel: 18, barra: 2800, gasto: 440 + 200 }, // assalto a loja e a bomba de gasolina; fiança de 2 500 €, 100 € de arma e balas por golpe
    { nivel: 24, barra: 3170, gasto: 595 + 200 }, // v72: assalto a farmácia (2 400 € em média); fiança de 3 500 €, 100 € de arma e balas por golpe
    { nivel: 30, barra: 3600, gasto: 450 + 100 }, // assaltos armados; fiança de 6 000 €, 100 € de arma e balas por golpe
  ],
  // A rua aquece: rendimento de cada barra seguida de golpes de rua no mesmo dia.
  calor: [1, 1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4],
  calorResp: [1, 1, 0.7, 0.7, 0.45, 0.45, 0.25],   // o respeito da rua continua a contar por dia (a corrida ao nível 100 não acelera)
  arrefece: +(process.env.ARREFECE ?? 0.5),        // a rua arrefece meia barra por hora (16/11: antes era à meia-noite)
  escadaArrefece: +(process.env.ESCADA ?? 0.25),   // a escada da recarga desce um quarto de barra por hora
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
  // Tráfico entre regiões (passo 6, parte 2): o lucro por dia de quem leva droga de onde é barata para onde é cara, medido com o motor
  // em sim/regioes.mjs (um comerciante sozinho, 1 000 épocas, semente 7), por edições jogadas por dia. Do nível 10 só as leves (o haxixe do
  // Algarve, com o armazém de lá); do nível 25 também a coca do Alentejo e a droga de festa. Compra-se o armazém quando há 1,3 vezes o
  // preço mais o capital; o capital fica parado na mercadoria. Não paga lavagem (como o porto).
  trafico: [
    { nivel: 10, armazem: 50000, capital: 20000, dia: { 1: 600, 2: 1172, 4: 1513 } },
    { nivel: 25, armazem: 30000, capital: 40000, dia: { 1: 1095, 2: 1875, 4: 2735 } },
  ],
  // v99 (18/11): negócios legais, do mais barato ao clube. Cada um rende por hora (vezes ~1,05 da stat) e enche um armazém de 8 h
  // (24 h com o contabilista). Cada unidade a mais custa +50%, até 10. Compra-se a unidade que se paga mais depressa, se se pagar em
  // menos de pagaEm dias e houver 1,3 vezes o preço. Valores por mês de jogo realistas: um dia real paga dois meses (porHora = mês / 12).
  negocios: [
    { id: 'banca', preco: +(process.env.NG_BANCA ?? 5000), hora: 35, resp: 5, max: 3 }, { id: 'quiosque', preco: 12000, hora: 52, resp: 10, max: 3 },
    { id: 'lavagem', preco: 20000, hora: 66, resp: 15, max: 5 }, { id: 'barbearia', preco: 30000, hora: 80, resp: 25, max: 5 },
    { id: 'lavandaria', preco: 40000, hora: 88, resp: 40 }, { id: 'cafe', preco: 60000, hora: 119, resp: 60 },
    { id: 'oficina', preco: 90000, hora: 162, resp: 90 }, { id: 'clube', preco: 800000, hora: 1134, resp: 600 },
  ],
  negocioMax: 10, negocioStat: 1.05, pagaEm: +(process.env.PAGA_EM ?? 20), contabilista: 25000,
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
  // Trabalho à mão (16/11): biscates sem barra. Cada tarefa paga a base vezes a qualidade (60 a 120%, em média 95%) e vezes
  // 0,5^(cansaço/meia): o cansaço sobe 1 por tarefa e desce para metade a cada meiaVida horas. Laboratório ilegal: mais base, rusga.
  // 17/11: o biscate do nível 1 paga como um carteirista (115 € por toque); os de níveis acima pagam mais, mas sobem mais devagar do
  // que o crime do mesmo nível (o crime compensa mais à medida que se sobe, com o risco). escala: base de cada degrau (nível, €).
  // 17/11 (v74): os biscates mais longos e difíceis pagam mais (entregas 105, laboratório 135, oficina 145, mudanças 165, desmanche 185),
  // e cada biscate tem o seu ritmo: +5% por cada um bem feito (70% ou mais), até +ritmo; um mal feito tira 10%.
  // O bot joga sempre bem (ritmo no máximo); as pessoas ficam, em média, a ritmoGente do máximo.
  trabalho: { escala: [[1, +(process.env.TB_BASE ?? 100)], [8, 145], [12, 165]],   // camião e entregas; oficina (8); mudanças (12)
    sujos: [[1, 135, 0.03], [12, 185, 0.04]],   // laboratório; desmanche (nível, base, rusga)
    ritmo: +(process.env.TB_RITMO ?? 0.3), ritmoGente: 0.6,
    esc: +(process.env.TB_ESC ?? 1),
    lab: +(process.env.TB_LAB ?? 115), labNivel: 1, rusga: 0.03, multa: 150, qual: +(process.env.TB_Q ?? 1.1), meia: +(process.env.TB_MEIA ?? 30), meiaVida: +(process.env.TB_HL ?? 12) },
  // Stamina a mais do que a natural: cada barra seguida custa mais; a escada desce com o tempo (escadaArrefece).
  extra: (k) => 25 * k + 5 * k * k,   // 1.ª barra extra 30 €, 3.ª 120 €, 7.ª 420 €
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
  // sessoes por dia, espalhadas por horas (o resto é a noite); extra: barras a droga por dia, no máximo (e só se compensar)
  casual:   { barras: 2, extra: 0, falha: 0.25, edicoes: 1, sessoes: 1, horas: 1, paraEm: 1, tarefas: 15, viagens: 0.3 },     // uma sessão por dia; falha um dia em quatro
  regular:  { barras: 4, extra: +(process.env.REG_EXTRA ?? 0), falha: 0.05, edicoes: 2, sessoes: 2, horas: 12, paraEm: 0.8, tarefas: 30, viagens: 1 },    // duas ou três sessões por dia
  hardcore: { barras: 7, extra: 12, falha: 0, edicoes: 3, sessoes: 3, horas: 15, paraEm: +(process.env.PARA ?? 0.6), tarefas: 45, viagens: 2 },      // gasta a stamina natural toda e compra enquanto compensar
  bot:      { barras: 7.2, extra: 100, falha: 0, edicoes: 4, sessoes: 6, horas: 24, paraEm: +(process.env.PARA ?? 0.6), tarefas: 'otimo', viagens: 3 },   // 24 h por dia: o caso que a economia tem de aguentar
};
// lucro do tráfico por dia para quem joga e edições por dia (3 edições: a meio entre 2 e 4)
const traficoDia = (t, e) => t.dia[e] ?? (t.dia[e - 1] + t.dia[e + 1]) / 2;

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
    if (!SEM.emprego && !s.curso && prox && (!prox.nivel || nv >= prox.nivel) && s.cash > prox.curso.preco * 2) { s.curso = { fim: d + prox.curso.dias }; sai += prox.curso.preco; }
    if (s.curso && d >= s.curso.fim) { s.emprego++; s.curso = null; }
    // emprego: 6 turnos por dia, pagos com energia. Todos os fazem
    const turnos = SEM.emprego ? 0 : P.turnos;
    entra += (P.empregos[s.emprego].dia * P.mesesPorDia * turnos * P.turnoQual) / P.turnos; s.resp += turnos * P.resp.turno;   // os turnos gastam energia (a barra do ginásio e das lutas), não a stamina dos crimes
    let crime = 0;
    // venda de droga: primeiro, até ao limite da clientela
    const r = [...P.rua].reverse().find((x) => nv >= x.nivel), bonus = 1 + P.pratica.max * Math.min(1, s.pratica / P.pratica.barrasParaMax);
    const porSes = barras / A.sessoes;
    const piorBarra = r.barra * bonus * P.calor[Math.min(Math.max(0, Math.ceil(porSes) - 1), P.calor.length - 1)];   // o que rende a barra de rua mais quente de uma sessão
    const v = [...P.venda].reverse().find((x) => nv >= x.nivel && x.barra > piorBarra && (s.capital >= x.capital || s.cash > x.capital * 1.5));
    if (v) {
      if (s.capital < v.capital) { sai += v.capital - s.capital; s.capital = v.capital; }
      const b = Math.min(barras, P.clientela.base + nv / P.clientela.porNivel);
      crime += b * v.barra; s.resp += b * P.resp.venda(nv); barras -= b;
    }
    // golpes de rua por sessões: a rua aquece com cada barra e arrefece entre sessões; a escada da recarga também
    const gap = A.horas / A.sessoes, noite = 24 - A.horas;
    let quente = s.quente || 0, escada = s.escada || 0, compradas = 0;
    let hoje = 0;
    const golpe = (b) => { const c = P.calor[Math.min(Math.floor(quente + 1e-9), P.calor.length - 1)], cr = P.calorResp[Math.min(Math.floor(hoje + 1e-9), P.calorResp.length - 1)]; quente += b; hoje += b; if (r.barra * bonus * c <= r.gasto) return; crime += b * r.barra * bonus * c; sai += b * r.gasto; s.resp += b * P.resp.rua(nv) * cr; s.pratica += b; };
    for (let j = 0; j < A.sessoes; j++) {
      for (let resto = barras / A.sessoes; resto > 0.01; resto -= 1) golpe(Math.min(1, resto));
      // barras a mais, a droga: só se a barra render mais do que custa
      while (compradas < A.extra) {
        const c = P.calor[Math.min(Math.floor(quente + 1e-9), P.calor.length - 1)], preco = P.extra(Math.floor(escada + 1e-9) + 1);
        if (c < A.paraEm || r.barra * bonus * c <= preco + r.gasto) break;   // pára quando a rua já rende pouco (quem joga vê o calor)
        sai += preco; escada += 1; compradas++; s.extras = (s.extras || 0) + 1; golpe(1);
      }
      const h = j === A.sessoes - 1 ? gap + noite : gap;
      quente = Math.max(0, quente - P.arrefece * h); escada = Math.max(0, escada - P.escadaArrefece * h);
    }
    s.quente = quente; s.escada = escada;
    // trabalho à mão: o bot trabalha ao ritmo que mais rende (cansaço estável); as pessoas fazem tarefas seguidas em cada sessão
    if (!SEM.trabalho) {
      const W = P.trabalho, k = Math.LN2 / W.meiaVida, legal = W.escala.filter(([n]) => nv >= n).map(([, b], i) => (i ? b * W.esc + W.escala[0][1] * (1 - W.esc) : b)).pop() * W.qual,
        sujo = Math.max(0, ...W.sujos.filter(([n]) => nv >= n).map(([, b, r]) => b * W.qual * (1 - r) - r * W.multa)),
        porTarefa = Math.max(legal, sujo) * (1 + W.ritmo * (A.tarefas === 'otimo' ? 1 : W.ritmoGente));
      let cans = s.cansaco || 0, ganho = 0;
      if (A.tarefas === 'otimo') {
        const r = W.meia / (Math.LN2 / k);   // tarefas por hora que maximizam r·0,5^(r/(k·meia))
        for (let h = 0; h < 24; h++) { for (let j = 0; j < r; j++) { ganho += porTarefa * 0.5 ** (cans / W.meia); cans += 1; } cans *= Math.exp(-k); }
      } else {
        for (let j = 0; j < A.sessoes; j++) {
          for (let n = 0; n < A.tarefas / A.sessoes; n++) { ganho += porTarefa * 0.5 ** (cans / W.meia); cans += 1; }
          cans *= Math.exp(-k * (j === A.sessoes - 1 ? gap + noite : gap));
        }
      }
      s.cansaco = cans; s.ganhoTrabalho = (s.ganhoTrabalho || 0) + ganho;
      if (sujo > legal) crime += ganho; else entra += ganho;   // o laboratório é dinheiro sujo (conta para a lavagem)
    }
    // operações: prepara a melhor que consegue pagar; resolve quando chega o dia
    if (s.op && d >= s.op.fim) {
      const o = s.op.o; s.op = null; s.pausaAte = d + o.pausa;
      if (rng() < o.p) { crime += o.ganho; s.resp += P.resp.op(o.ganho); }
      else { const adv = P.falhaOp.advogado[0] + rng() * (P.falhaOp.advogado[1] - P.falhaOp.advogado[0]) * (o.custo > 2000 ? 1 : 0.1); if (!s.avenca) sai += adv; }
    }
    if (!SEM.ops && !s.op && d >= s.pausaAte && perfil !== 'casual') {
      const vale = (x) => (x.p * x.ganho - x.custo) / (Math.max(1, Math.ceil(x.dias)) + x.pausa);   // o que rende por dia, contando a pausa
      const o = P.ops.filter((x) => nv >= x.nivel && s.cash > x.custo * 3).sort((x, y) => vale(y) - vale(x))[0];
      if (o) { s.op = { o, fim: d + Math.max(1, Math.ceil(o.dias)) }; sai += o.custo + (o.custo > 2000 ? P.suborno * o.ganho : 0); }
    }
    // tráfico entre regiões: compra o armazém (e põe o capital na mercadoria) quando pode; depois rende por dia
    let trafico = 0;
    if (!SEM.trafico) {
      s.armz = s.armz || 0;
      const t = P.trafico[s.armz];
      if (t && nv >= t.nivel && s.cash > (t.armazem + t.capital) * 1.3) { sai += t.armazem + t.capital; s.capital += t.capital; s.armz++; }
      if (s.armz > 0) trafico = traficoDia(P.trafico[s.armz - 1], A.edicoes);
    }
    entra += trafico;
    // v99: negócios: compra a unidade que se paga mais depressa; rende as horas que se recolhem (8 h por sessão, 24 h com o contabilista)
    if (!SEM.negocios) {
      s.ng = s.ng || P.negocios.map(() => 0);
      const preco = (i) => { let x = P.negocios[i].preco; for (let k = 0; k < s.ng[i]; k++) x += Math.floor(x / 2); return x; };
      for (let k = 0; k < 3; k++) {
        const c = P.negocios.map((g, i) => ({ i, pr: preco(i), dias: preco(i) / (g.hora * P.negocioStat * 24) })).filter((x) => s.ng[x.i] < (P.negocios[x.i].max || P.negocioMax) && x.dias <= P.pagaEm).sort((x, y) => x.dias - y.dias)[0];
        if (!c || s.cash + entra - sai < c.pr * 1.3) break;
        sai += c.pr; s.ng[c.i]++; s.resp += P.negocios[c.i].resp; s.investido = (s.investido || 0) + c.pr;
      }
      if (!s.contab && s.ng.some((n) => n > 0) && A.sessoes < 3 && s.cash + entra - sai > P.contabilista * 1.3) { sai += P.contabilista; s.contab = true; }
      const horas = s.contab ? 24 * 0.95 : Math.min(24, A.sessoes * 8);
      const negocio = s.ng.reduce((x, n, i) => x + n * P.negocios[i].hora * P.negocioStat * horas, 0);
      s.ganhoNegocios = (s.ganhoNegocios || 0) + negocio;
      entra += negocio;
    }
    // v101: viagens (ida e volta, mala cheia do que é legal no melhor destino aberto, ao preço normal do importador). Cada uma pede três
    // passagens pelo jogo (partir, comprar lá e voltar, vender): quem joga uma vez por dia quase nunca as faz; o jogo deixa 3 por dia.
    if (!SEM.viagens && A.viagens) {
      const TR = CFG.travel; s.mala = s.mala || 0;
      const k = s.mala + 1; if (TR.bag[k] && s.cash + entra - sai > TR.bagCost[k] * 3) { sai += TR.bagCost[k]; s.mala = k; }
      const cap = TR.bag[s.mala], op = TR.dests.filter((d) => nv >= d.level).map((d) => { const g = Object.values(TR.goods).find((x) => x.at === d.id && !x.seizeBp); return { d, lucro: cap * (g.sell - g.buy) - d.ticket, custo: cap * g.buy + d.ticket }; })
        .filter((x) => x.lucro > 0 && s.cash > x.custo).sort((x, y) => y.lucro - x.lucro)[0];
      if (op) { const n = Math.min(A.viagens, TR.perDay); entra += op.lucro * n; s.resp += op.d.r * n; s.ganhoViagens = (s.ganhoViagens || 0) + op.lucro * n; }
    }
    // lavagem e equipa
    s.ilegal += crime;
    if (!SEM.lavagem && s.ilegal > P.lavagem.acimaDe) crime *= 1 - P.lavagem.parte;
    entra += crime;
    // vida: sobe de degrau quando pode
    s.media = s.media == null ? entra : s.media * 0.8 + entra * 0.2;   // o que se ganha por dia, alisado
    s.avenca = !SEM.avenca && nv >= P.avenca.nivel && P.avenca.dia <= s.media * P.avenca.parte;
    if (s.avenca) sai += P.avenca.dia;
    if (!SEM.segurancas && nv >= P.segurancas.nivel) sai += P.segurancas.dia * Math.min(P.segurancas.max, Math.floor((s.media * P.segurancas.parte) / P.segurancas.dia));
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
const foto = (s) => ({ cash: Math.round(s.cash), fortuna: Math.round(s.cash + s.casa + s.capital),   // (os negócios não entram: não se vendem)
  ng: Math.round(s.investido || 0), nivel: nivelDe(s.resp), dia: Math.round(s.media || 0) });

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
  ['Ninguém fica rico numa semana (bot abaixo de 120 000 € ao dia 7)', res.bot.fotos[7].p90 < 120000],
  ['Primeiro carro até ao dia 14 para quem joga todos os dias', res.regular.carro != null && res.regular.carro <= 14],
  // v99: com os negócios baratos, quem joga todos os dias chega ao T1 um dia mais cedo (29 em vez de 30); continua a ser cerca de um mês
  ['Primeiro T1 na cidade entre o dia 28 e o dia 150 (regular)', res.regular.casa != null && res.regular.casa >= 28 && res.regular.casa <= 150],
  ['Nível 100 entre o dia 270 e o dia 400 (regular)', DIAS < 400 ? (res.regular.n100 == null || res.regular.n100 >= 270) : res.regular.n100 >= 270 && res.regular.n100 <= 400],
  ['Nível 100 nunca antes do dia 150, nem para o bot', res.bot.n100 == null || res.bot.n100 >= 150],
  ['Quem joga 24 h por dia ganha por dia menos do triplo de quem joga normalmente (dia 30 e dia 180)', res.bot.fotos[30].dia < 3 * res.regular.fotos[30].dia && (DIAS < 180 || res.bot.fotos[180].dia < 3 * res.regular.fotos[180].dia)],
  ['Quem joga uma vez por dia não fica na miséria: tem carro até ao dia 60', res.casual.carro != null && res.casual.carro <= 60],
];
let ok = true;
for (const [nome, passa] of provas) { console.log((passa ? 'PASSA  ' : 'FALHA  ') + nome); ok = ok && passa; }
process.exit(ok ? 0 : 1);
