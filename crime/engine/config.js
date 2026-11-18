// Todos os números do jogo num só sítio. Tudo inteiro: dinheiro em unidades,
// percentagens em pontos-base (bp, 10000 = 100%), tempos em milissegundos.

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// Níveis da base nova (16/11/2026): 100 níveis, o respeito acumulado para chegar ao nível N é 1,3 × N^2,55
// (nível 10 com 461, 20 com 2 701, 40 com 15 820, 60 com 44 487, 80 com 92 645 e 100 com 163 660). O nível nunca desce.
export const LEVELS = Array.from({ length: 100 }, (_, i) => (i ? Math.round(1.3 * (i + 1) ** 2.55) : 0));
// Escala antiga das rondas (20 degraus). Até à economia nova (passo 2) é ela que mede o que cresce com o nível:
// aposta máxima, carregamento máximo e lugares no porto, preço do médico, ganho das lutas e encher a stamina ao subir.
// Assim a economia fica igual enquanto os níveis passam a ir até 100.
export const TIERS = [0, 3, 10, 30, 80, 180, 350, 600, 950, 1400, 2000, 2800, 3900, 5400, 7500, 10500, 15000, 22000, 32000, 46000];
// Uma porta da escala antiga na escala nova: o nível que se tem com o respeito que essa porta pedia (quem passava, continua a passar).
const nv = (old) => { const r = TIERS[old - 1]; let n = 1; while (n < LEVELS.length && LEVELS[n] <= r) n++; return n; };

export const CFG = {
  // Vida sem rondas (16/11/2026): o mundo é um só e não acaba. Do que era a ronda fica a hora sem lutas no recomeço
  // e o escudo de 24 h de quem chega depois do primeiro dia. As épocas (season) só recomeçam a classificação.
  round: {
    playDays: 13,
    totalDays: 14, // 13 de jogo + 1 de pausa
    startWeekday: 5, // sexta-feira
    startHour: 21, // 21:00, hora de Lisboa
    tz: 'Europe/Lisbon',
    noPvpMs: 1 * HOUR, // primeira hora da ronda sem ataques
    lateJoinAfterMs: 24 * HOUR,
    newbieShieldMs: 24 * HOUR,
    lateStatsBp: 5000, // quem entra tarde: 50% da mediana das stats
  },

  energy: { max: 100, regenMs: 2 * MIN }, // stamina dos crimes: cheia em 3h20 (a casa sobe o máximo)
  vigor: { max: 100, regenMs: 2 * MIN },  // energia: ginásio e lutas (barra à parte da stamina)
  addiction: { base: 100, perT: 4, decayMs: 1 * MIN }, // limite = 100 + tolerância/4; desce 1 por minuto

  start: { stat: 10, cash: 50 },   // todos recomeçam com 50 € (base nova)
  // Épocas: 28 dias a começar à sexta às 21:00 de Lisboa. Conta o respeito ganho na época, em divisões de 20 níveis
  // (pelo nível com que se entra na época). Os 3 primeiros de cada divisão levam título, troféu e dinheiro: 3, 2 e 1 dias
  // do que um jogador da divisão ganha por dia (a mediana, contada no registo diário dessa época).
  season: { days: 28, startHour: 21, divSize: 20, divs: 5, prizeDays: [3, 2, 1] },
  missionSwapMs: 1 * HOUR, // trocar o objetivo do beco: uma vez por hora
  // Bolsa. Os preços (em cêntimos) mexem de 10 em 10 minutos, iguais para todos, e ninguém os consegue mexer nem adivinhar:
  // cada passo sobe ou desce o mesmo com 50% de hipótese (0, 1, 2 ou 4 vezes o passo da empresa), por isso em média o preço fica onde está.
  // Quem compra e vende paga 1% de cada vez: no total, a bolsa tira dinheiro do jogo. Abaixo de 5% do preço de estreia a empresa vai à falência
  // (as ações passam a valer zero) e volta a estrear-se. O máximo investido é 20× a aposta máxima do casino para o teu nível.
  stocks: {
    tickMs: 10 * MIN, feeBp: 100, bustBp: 500, capMult: 100, steps: [[0, 2], [1, 5], [2, 2], [4, 1]], histMax: 144,
    list: [
      { id: 'docas', base: 5000, vol: 40 }, { id: 'farma', base: 2500, vol: 55 }, { id: 'casino', base: 12000, vol: 70 },
      { id: 'armas', base: 8000, vol: 90 }, { id: 'noite', base: 1200, vol: 130 }, { id: 'moeda', base: 300, vol: 250 },
    ],
  },

  // Mundo ligado (passo 6): edições do jornal às 03h, 09h, 15h e 21h de Lisboa (engine/mundo.js).
  // Lisboa: a criminalidade vai de floor (rua calma) a 100; sobe com a stamina que os jogadores gastam lá (golpes, lutas, vendas)
  // por uma curva A/(A+half), com metade do caminho aos 3 000 de stamina numa edição, e guarda keepBp do valor anterior. A pressão
  // é a criminalidade da edição anterior. Ao falhar um golpe, a hipótese de prisão multiplica por (bustLo + bustPer × pressão)/10000:
  // 0,75 com a polícia parada, 1 com a pressão a 50 (o que o modelo usa), 1,25 com a pressão no máximo.
  // Empresas: r0 é a receita por edição dos outros clientes (com ±noiseBp), a que se soma o que os jogadores lá deixam. O valor mexe
  // até maxMoveBp por edição conforme essa receita fica acima ou abaixo da média das últimas avgN, e volta revertBp por edição ao
  // valor de estreia. Dividendo: divBp do que os jogadores lá gastaram de verdade, a dividir por float ações (com os jogadores a
  // gastarem o mesmo que os outros clientes, rende 0,1% por edição). liq: euros que empurram o preço 100% (o empurrão para em impMaxBp).
  // Entre edições, de 10 em 10 minutos, o preço anda pullBp do caminho até à abertura, com um tremor de ±tickNoiseBp.
  // Histórias em três atos: nascem com spawnBp por edição, vencem 4 a 8 edições depois (1 a 2 dias), com hipótese escondida de
  // 35% a 75%; correm bem +25% a +40%, mal −30% a −45%. Rumores com fiabilidade escrita (55% a 80%), investigação que revela a
  // hipótese. Três desfechos maus seguidos e a empresa vai à falência. Pânico: caiu mais de 12% numa edição, cai mais 4% a 8% na seguinte.
  world: {
    edHours: [3, 9, 15, 21], keepEds: 12,
    // v76 (17/11): o mundo escala. Gente da edição = jogadores que jogaram nela, numa média que anda devagar (keepBp da anterior),
    // mais bg pessoas de fundo; nunca menos de ref (os números abaixo foram afinados para ref pessoas). A criminalidade conta por cabeça;
    // a profundidade dos mercados, a liquidez da bolsa, os clientes de fundo e as ações das empresas crescem com a gente.
    pop: { ref: 8, bg: 5, keepBp: 7500 },
    lx: { start: 30, floor: 25, half: 3000, keepBp: 6000, histMax: 28, bustLo: 7500, bustPer: 50, fight: 10 },   // uma luta conta como 10 de stamina na rua
    portBp: 500,   // a Docas do Sul fica com 5% do que os jogadores mandam pelo porto
    co: {
      docas: { r0: 120000, liq: 20000000, float: 480000 }, farma: { r0: 25000, liq: 5000000, float: 200000 }, casino: { r0: 60000, liq: 10000000, float: 100000 },
      armas: { r0: 40000, liq: 8000000, float: 100000 }, noite: { r0: 30000, liq: 3000000, float: 500000 }, moeda: { r0: 0, liq: 1000000, float: 0 },
    },
    noiseBp: 1500, maxMoveBp: 600, avgN: 8, revertBp: 100, divBp: 2000, moedaBp: 500,
    pullBp: 3000, tickNoiseBp: 30, impMaxBp: 500,
    panic: { trigBp: 1200, min: 400, max: 800 },
    story: { spawnBp: 300, moedaSpawnBp: 600, durMin: 4, durMax: 8, pMin: 3500, pMax: 7500, upMin: 2500, upMax: 4000, dnMin: 3000, dnMax: 4500, rumorBp: 3500, relMin: 5500, relMax: 8000, invBp: 1200, bustAfter: 3 },
    stories: { docas: ['terminal', 'greve'], farma: ['ensaio'], casino: ['licenca'], armas: ['contrato'], noite: ['cadeia'], moeda: ['proibir', 'banca'] },
  },

  // ---------- o Estado (v76, pedido de 17/11, 03:39): cofres, corrupção, popularidade, parlamento e leis ----------
  // Cofres por cabeça: a despesa de uma edição é spendPc por pessoa (com a pressão a 50); os contribuintes de fundo pagam bgTaxBp dela e
  // o resto vem do que os jogadores pagam ao Estado (fianças, comissões da bolsa, multas das rusgas, impostos das leis). 100% = reserveEds
  // edições de despesa. Corrupção: anda para base + perEmpty × (o que falta aos cofres); acima de scandalAt pode rebentar um escândalo.
  // Votos: os dos jogadores juntam-se a bg votos de fundo; o dinheiro posto numa votação pesa contra lobbyK × incomePc × gente.
  // v77: o jornal que escala (engine/noticias.js). min = o que tem significado na economia (em euros); o resto mede-se contra o
  // normal: o triplo da mediana das últimas 8 edições. Na última hora há uma reserva de 6 por hora e categoria; quando acaba, só passa
  // a que for maior do que o dobro da última aceite, com essa fasquia a descer para metade a cada 15 minutos.
  news: {
    relMed: 3, minN: 8, live: { halfMs: 15 * MIN, step: 2, tokens: 6, tokMs: 60 * MIN }, ed: { k: 3, eds: 8 },
    cats: { job: { min: 2000 }, spree: { min: 3000 }, casino: { min: 1000 }, casinoLoss: { min: 1000 }, op: { min: 5000 }, mug: { min: 200 },
      stockWin: { min: 1000 }, stockLoss: { min: 1000 }, air: { min: 1000 }, airLost: { min: 1000 }, gangHeist: { min: 1 } },   // golpes de gangue: todos os que correm bem são notícia (são raros)
    // o peso de cada notícia na primeira página (a manchete é a que pesa mais)
    w: { feat: 4, govScandal: 9, govPass: 8, govFail: 6, govLaw: 5, govBill: 4, govPoll: 3, stBust: 9, stOut: 6, stPanic: 6, stEuph: 6, rgEv: 5, stAnn: 3, stInv: 3, stRum: 2, coRes: 1, lx: 1 },
  },
  gov: {
    cof: { spendPc: 2000, bgTaxBp: 9000, reserveEds: 8, startPct: 50, lowPct: 30, highPct: 80, pressStep: 5 },
    corr: { start: 30, base: 15, perEmpty: 60, moveBp: 2000, scandalAt: 60, scandalBp: 800, scandalCut: 30, scandalPopu: 10, bailCutMax: 3000 },
    popu: { start: 55, base: 60, perCrime: 0.4, emptyCut: 10, moveBp: 1000, goodLaw: 3 },
    vote: { bg: 5, lobbyK: 4, incomePc: 2000, rebelMaxPct: 8, majority: 116, pmBonus: 0.5, pollMargin: 8, minLevel: 5, minAgeMs: 24 * HOUR, minLobby: 100 },
    bill: { voteEds: 4, effectEds: 2, coolEds: 12, noise: 10, keep: 12 },
    histMax: 56, pm: 'cm',
    // posição de cada partido sobre pôr cada lei (de -2 a +2; para tirar, ao contrário); wOp: quanto segue a rua; wLob: quanto o dinheiro pesa
    parties: {
      cm: { seats: 95, wOp: 1.5, wLob: 0.6, pos: { policia: 1, penas: 0, erva: 0, jogo: 1, luxo: 0, branq: 1, salario: 1, armas: -1 } },
      op: { seats: 55, wOp: 0.6, wLob: 0.4, pos: { policia: 2, penas: 2, erva: -2, jogo: 0, luxo: -1, branq: 1, salario: 0, armas: 1 } },
      ml: { seats: 40, wOp: 0.8, wLob: 1, pos: { policia: -1, penas: -1, erva: 2, jogo: -2, luxo: -2, branq: -1, salario: -2, armas: 2 } },
      rv: { seats: 40, wOp: 0.8, wLob: 0.3, pos: { policia: -2, penas: -2, erva: 2, jogo: 2, luxo: 2, branq: 1, salario: 2, armas: -2 } },
    },
    laws: {
      policia: { press: 10, spendBp: 2500 },          // pressão +10 em todas as regiões; a despesa do Estado sobe 25%
      penas: { jailBp: 15000, bailBp: 15000 },        // prisão e fiança ×1,5
      erva: { priceBp: 7000 },                        // erva e haxixe sem multa nem apreensão; erva por grosso −30%
      jogo: { over: 1000, bp: 1500 },                 // 15% dos prémios do casino acima de 1 000 € vão para os cofres
      luxo: { bp: 1000 },                             // casas e luxos +10%, para os cofres
      branq: { addBp: 500 },                          // a lavagem sobe 5 pontos
      salario: { bp: 1000 },                          // turnos do emprego +10%
      armas: { priceBp: 8500, crime: 5 },             // armas −15%; a criminalidade de Lisboa vai para +5
    },
  },

  // ---------- passo 6, parte 2: regiões, armazéns, preços por região e transporte ----------
  // Portugal em cinco regiões numa linha de norte a sul (pos: o lugar na linha); abrem primeiro três. O jogador vive em Lisboa e não
  // viaja: mexe-se a mercadoria. De uma região para a vizinha é 1 hora; de Lisboa ao Algarve são 2 saltos (passa pelo Alentejo).
  regions: {
    list: [{ id: 'lx', pos: 2 }, { id: 'al', pos: 3 }, { id: 'ag', pos: 4 }],
    // criminalidade das outras regiões (a de Lisboa está em world.lx), pela mesma fórmula: base e atividade que faz metade do caminho
    crime: { al: { start: 15, floor: 15, half: 2000 }, ag: { start: 20, floor: 20, half: 2500 } },
    ptsEur: 20,      // 1 ponto de atividade por cada 20 € de droga (ao preço de grosso) comprada, vendida, desembarcada ou mudada de região
    storeEur: 500,   // e, em cada edição, 1 ponto por cada 500 € de droga guardada à vista
    famLevel: { leve: 10, festa: 18, pesada: 25 },   // o nível que cada família pede para comprar, vender e mudar (a de bar não se trafica)
  },
  // Mercado de cada região, em cêntimos: preço de grosso (80% do de rua) × procura de lá × saturação. Compra-se 10% acima e vende-se
  // 10% abaixo. Vender baixa a saturação e comprar sobe-a: cada 1% de depth (em euros, ao preço de grosso) mexe 1% no preço.
  // Em cada edição a saturação volta 5 pontos ao normal (100%); nunca fica abaixo de 20% nem acima de 200%.
  market: {
    spreadBp: 1000, recBp: 500, satMin: 2000, satMax: 20000,
    depth: { lx: 300000, al: 75000, ag: 150000 },
    dem: {
      lx: { leve: 10000, festa: 10000, pesada: 10500, ecstasy: 8500 },   // onde mais se vende; o ferry traz ecstasy
      al: { leve: 8500, festa: 9000, pesada: 9000, coca: 7700 },         // pouca gente para comprar; os contentores de coca chegam a Sines
      ag: { leve: 9500, festa: 11000, pesada: 10000, haxixe: 7200 },     // turistas; o haxixe vem de lancha de Marrocos
    },
    weekendBp: 1000,                                                    // a droga de festa vende 10% melhor à sexta e ao sábado
    summer: { rg: 'ag', fam: 'festa', bp: 2000, months: [6, 7, 8, 9] },  // e mais 20% no Algarve no verão
    // acontecimentos que mexem na procura: em cada edição, 3% de nascer um em cada região que não tenha nenhum; dura 3 edições
    ev: { spawnBp: 300, eds: 3,
      list: { lx: [{ k: 'cimeira', drug: 'coca', bp: 2500 }], al: [{ k: 'carga', drug: 'coca', bp: -2000 }], ag: [{ k: 'festival', drug: 'ecstasy', bp: 3000 }] } },
    // apreensão recorde (uma rusga que leva 50 000 € ou mais): a polícia mostrou serviço, a criminalidade cai 10 e a droga apreendida
    // fica 20% mais cara nessa região (a saturação sobe 20 pontos e volta 5 por edição)
    record: { min: 50000, crime: 10, satBp: 2000 },
  },
  // Armazéns: um por região. O de Lisboa é o que já havia e é de todos. Três melhorias de 1 a 5: espaço (unidades: gramas ou comprimidos),
  // esconderijo (a parte do stock que uma rusga não vê) e fachada (corta o calor que o armazém gera).
  wh: {
    level: 10,
    lx: { price: 0, sp: [10000, 20000, 40000, 80000, 160000], spCost: [0, 60000, 180000, 500000, 1500000] },      // caro e pequeno
    al: { price: 30000, sp: [50000, 100000, 200000, 400000, 800000], spCost: [0, 20000, 60000, 180000, 500000] },  // enorme e barato
    ag: { price: 50000, sp: [20000, 40000, 80000, 160000, 320000], spCost: [0, 40000, 120000, 350000, 1000000] },
    hideBp: [1000, 2000, 3000, 4000, 5000], frontBp: [1000, 2000, 3000, 4000, 5000], upCost: [0, 20000, 60000, 180000, 500000],
    // calor (0 a 100): +1 por cada 1 000 € que entram ou saem (menos o que a fachada corta). Parado, desce 10 por edição, mas nunca
    // abaixo de 1 por cada 10 000 € à vista (também menos a fachada).
    heatEur: 1000, coolPerEd: 10, floorEur: 10000,
    // rusga, em cada edição: até 20% × pressão/100 × calor/100, e só com a pressão a 50 ou mais. Multa de 10% do que está à vista;
    // leva metade do que está à vista da droga de festa e das pesadas (as leves só dão multa); com pesadas apreendidas, 60 min de prisão.
    raidBp: 2000, raidMin: 50, fineBp: 1000, takeBp: 5000, jailMin: 60, lawyer: 5000, log: 6,
  },
  // Transporte entre regiões: 1 hora por salto; risco de apreensão em cada salto = média da pressão das duas regiões a dividir por 10, em %.
  // Se a polícia apanha: as leves pagam multa de 10% e seguem; as de festa ficam apreendidas; as pesadas ficam apreendidas e dão prisão.
  mv: { hopMs: HOUR, max: 5, log: 6 },

  train: { energy: 5, costBase: 0, costPerStat: 0, // +1 ponto por treino; gasta energia (vigor), não stamina
    // v82: ginásio novo. Treinar é uma série de repetições no ritmo certo: a barra sobe e desce e toca-se quando chega ao topo.
    // Cada repetição gasta a energia de um treino e vale de 50% a 120% de um ponto, conforme o erro do toque (em ms) ao topo.
    // O primeiro topo vem ao fim de lead ms (a contagem) e os outros a cada beat ms. Mais de reps + extra toques: tudo falhado.
    // Os pontos partidos guardam-se (em milésimos) para a série seguinte.
    set: { reps: [5, 10], beat: 1000, lead: 3000, ttl: 2 * MIN, win: [80, 160, 260], q: [12000, 10000, 8000, 5000], botSd: 8, slack: 300 },
  },

  // v94 (pedido de 18/11/2026, a partir do sistema do Torn): ginásios pelo mundo. g = ganho de cada stat [F, T, I, C] em décimas de ponto
  // por 10 de energia com o ritmo médio (20 = o de sempre; 0 = não se treina lá essa stat); e = energia por repetição; xp = energia já gasta
  // em ginásios para poder entrar (gx); price em euros (paga-se uma vez). Os normais abrem pela ordem; os especialistas pedem uma stat (ou
  // duas) 25% acima das outras; o da prisão só se usa preso e é o melhor da prisão para a Tolerância.
  gyms: {
    base: 20, ratio: 12500,
    list: [
      { id: 'garagem', tier: 'leve', at: 'pt', e: 5, price: 0, xp: 0, g: [20, 20, 20, 20] },
      { id: 'ringue', tier: 'leve', at: 'it', e: 5, price: 300, xp: 150, g: [22, 26, 20, 22] },
      { id: 'caveboxe', tier: 'leve', at: 'gb', e: 5, price: 1000, xp: 400, g: [26, 26, 20, 20] },
      { id: 'praia', tier: 'leve', at: 'br', e: 5, price: 2500, xp: 900, g: [26, 24, 0, 28] },
      { id: 'dojo', tier: 'leve', at: 'jp', e: 5, price: 5000, xp: 1600, g: [24, 28, 28, 22] },
      { id: 'xadrez', tier: 'leve', at: 'ua', e: 5, price: 10000, xp: 2500, g: [0, 0, 32, 26] },
      { id: 'muaythai', tier: 'leve', at: 'th', e: 5, price: 20000, xp: 3600, g: [28, 30, 22, 22] },
      { id: 'global', tier: 'leve', at: 'ae', e: 5, price: 40000, xp: 5000, g: [30, 30, 30, 30] },
      { id: 'ferro', tier: 'medio', at: 'us', e: 10, price: 100000, xp: 7000, g: [34, 30, 28, 28] },
      { id: 'krav', tier: 'medio', at: 'il', e: 10, price: 200000, xp: 9500, g: [32, 34, 30, 28] },
      { id: 'teatro', tier: 'medio', at: 'gb', e: 10, price: 400000, xp: 12500, g: [28, 28, 32, 36] },
      { id: 'sambo', tier: 'medio', at: 'ru', e: 10, price: 750000, xp: 16000, g: [34, 36, 30, 28] },
      { id: 'capoeira', tier: 'medio', at: 'br', e: 10, price: 1200000, xp: 20000, g: [32, 32, 30, 36] },
      { id: 'shaolin', tier: 'medio', at: 'cn', e: 10, price: 2000000, xp: 25000, g: [32, 36, 36, 30] },
      { id: 'ironworks', tier: 'medio', at: 'us', e: 10, price: 3000000, xp: 31000, g: [38, 34, 32, 32] },
      { id: 'olimpico', tier: 'medio', at: 'de', e: 10, price: 5000000, xp: 38000, g: [40, 40, 40, 40] },
      { id: 'kyokushin', tier: 'pesado', at: 'jp', e: 10, price: 7500000, xp: 46000, g: [42, 44, 40, 38] },
      { id: 'bronx', tier: 'pesado', at: 'us', e: 10, price: 10000000, xp: 55000, g: [44, 42, 38, 40] },
      { id: 'rancho', tier: 'pesado', at: 'mx', e: 10, price: 15000000, xp: 65000, g: [44, 44, 40, 42] },
      { id: 'yakuza', tier: 'pesado', at: 'jp', e: 10, price: 20000000, xp: 76000, g: [42, 42, 44, 44] },
      { id: 'legiao', tier: 'pesado', at: 'fr', e: 10, price: 30000000, xp: 88000, g: [46, 46, 42, 40] },
      { id: 'spetsnaz', tier: 'pesado', at: 'ru', e: 10, price: 45000000, xp: 101000, g: [46, 48, 44, 42] },
      { id: 'monaco', tier: 'pesado', at: 'mc', e: 10, price: 70000000, xp: 115000, g: [44, 44, 46, 48] },
      { id: 'olimpo', tier: 'pesado', at: 'gr', e: 10, price: 100000000, xp: 130000, g: [50, 50, 50, 50] },
      { id: 'corpo', tier: 'esp', at: 'za', e: 15, price: 50000000, after: 'legiao', duo: ['F', 'T'], g: [52, 52, 0, 0] },
      { id: 'cabeca', tier: 'esp', at: 'ch', e: 15, price: 50000000, after: 'legiao', duo: ['I', 'C'], g: [0, 0, 52, 52] },
      { id: 'strongman', tier: 'esp', at: 'is', e: 15, price: 100000000, after: 'olimpo', solo: 'F', g: [56, 0, 0, 0] },
      { id: 'muralha', tier: 'esp', at: 'mn', e: 15, price: 100000000, after: 'olimpo', solo: 'T', g: [0, 56, 0, 0] },
      { id: 'torneio', tier: 'esp', at: 'ru', e: 15, price: 100000000, after: 'olimpo', solo: 'I', g: [0, 0, 56, 0] },
      { id: 'broadway', tier: 'esp', at: 'us', e: 15, price: 100000000, after: 'olimpo', solo: 'C', g: [0, 0, 0, 56] },
      { id: 'prisao', tier: 'prisao', at: '', e: 5, price: 0, g: [26, 34, 0, 0] },
    ],
  },

  // v95: livros, como os do Torn. Compram-se no alfarrabista (4 títulos por dia, iguais para todos, um de cada por pessoa e dia)
  // ou acham-se nos golpes (um a cada findEvery golpes bem-sucedidos). Não se vendem nem se trocam. Lê-se um de cada vez e ler
  // leva h horas (lê-se também preso ou no hospital). Ao acabar: os de efeito ficam ativos 31 dias (só um ativo; o novo substitui
  // o anterior); os de stat (perm) dão de vez +5% dessa stat; o «Déjà lu» repete o último livro lido.
  // k: a parte da profissão que o livro soma (as mesmas contas: lootBp, bustCutBp…), 'gym' (ganho no ginásio numa stat, ou *
  // em todas), 'perm' ou 'again'. bp em pontos-base. w: peso na prateleira (os raros aparecem menos).
  books: {
    days: 31, shelf: 4, cap: 20, findEvery: 150,
    list: [
      { id: 'musculo', k: 'gym', s: 'F', bp: 3000, h: 3, price: 60000, w: 4 },
      { id: 'aguenta', k: 'gym', s: 'T', bp: 3000, h: 3, price: 60000, w: 4 },
      { id: 'pensar', k: 'gym', s: 'I', bp: 3000, h: 3, price: 60000, w: 4 },
      { id: 'sorri', k: 'gym', s: 'C', bp: 3000, h: 3, price: 60000, w: 4 },
      { id: 'naomorde', k: 'gym', s: '*', bp: 2000, h: 5, price: 150000, w: 2 },
      { id: 'bolsos', k: 'lootBp', bp: 1000, h: 4, price: 80000, w: 4 },
      { id: 'correr', k: 'bustCutBp', bp: 1500, h: 3, price: 50000, w: 4 },
      { id: 'advogado', k: 'bailCutBp', bp: 3000, h: 2, price: 25000, w: 4 },
      { id: 'fitacola', k: 'hospCutBp', bp: 3000, h: 2, price: 25000, w: 4 },
      { id: 'cabecada', k: 'atkBp', bp: 1000, h: 4, price: 100000, w: 3 },
      { id: 'olho', k: 'defBp', bp: 1000, h: 4, price: 100000, w: 3 },
      { id: 'contas', k: 'bizBp', bp: 1000, h: 6, price: 200000, w: 3 },
      { id: 'temido', k: 'respBp', bp: 1000, h: 5, price: 150000, w: 3 },
      { id: 'contrabando', k: 'seizeCutBp', bp: 2000, h: 3, price: 75000, w: 4 },
      { id: 'quimica', k: 'fxMoreBp', bp: 5000, h: 2, price: 30000, w: 4 },
      { id: 'regatear', k: 'fenceBp', bp: 1500, h: 2, price: 40000, w: 4 },
      { id: 'bricolage', k: 'craftCutBp', bp: 2500, h: 3, price: 60000, w: 4 },
      { id: 'receitas', k: 'recipeCutBp', bp: 2000, h: 3, price: 50000, w: 4 },
      { id: 'feira', k: 'feiraFeeCutBp', bp: 5000, h: 2, price: 30000, w: 4 },
      { id: 'mala', k: 'cargoBp', bp: 1500, h: 3, price: 70000, w: 4 },
      { id: 'achados', k: 'colBp', bp: 3000, h: 4, price: 50000, w: 4 },
      { id: 'diario', k: 'perm', s: 'F', bp: 500, h: 12, price: 750000, w: 1 },
      { id: 'ressaca', k: 'perm', s: 'T', bp: 500, h: 12, price: 750000, w: 1 },
      { id: 'enciclopedia', k: 'perm', s: 'I', bp: 500, h: 12, price: 750000, w: 1 },
      { id: 'charme', k: 'perm', s: 'C', bp: 500, h: 12, price: 750000, w: 1 },
      { id: 'dejalu', k: 'again', h: 1, price: 300000, w: 1 },
    ],
  },

  // Probabilidade de sucesso = S²/(S²+D²), entre 5% e 95%.
  chance: { minBp: 500, maxBp: 9500 },
  wfight: { accBp: 15, accMax: 900, rngBp: 300 },   // v97: precisão e alcance nas lutas (ver o arsenal)
  crit: { chanceBp: 500, mult: 3 }, // golpe perfeito: 5%, dinheiro x3
  unlockBp: 2000, // crime aparece com 20% de hipótese

  // Golpes de rua (base nova, 16/11/2026). Valores reais de Portugal, risco à escala de jogo. Cada golpe gasta stamina (e),
  // abre num nível (level), corre bem com uma hipótese fixa (p, em bp) e, se correr bem, o que se leva é à sorte (prizes:
  // [hipótese em bp, mínimo, máximo, o que é]): quase sempre pouco, às vezes muito. A média por barra (100 de stamina):
  // furto e carteirista 1 150 €, carros 1 500 €, esticão 2 000 €, assalto a loja 2 800 €, assalto armado 3 600 €.
  // Uma falha em quatro é apanhada (bustBp): prisão de jailMin minutos ou multa/fiança (fine) para sair já.
  // gun: precisa de pistola e gasta 100 € de balas e desgaste por golpe (street.ammo). w: as stats que o golpe treina.
  crimes: [
    { id: 'carteirista', fam: 'furto', e: 10, level: 1, p: 8500, fine: 150, jailMin: 2, w: { I: 30, F: 0, C: 70 },
      prizes: [[6200, 15, 80, 'carteira'], [2800, 120, 320, 'telemovel'], [900, 250, 450, 'relogio'], [100, 1000, 1500, 'turista']] },
    { id: 'loja', fam: 'furto', e: 10, level: 1, p: 9000, fine: 150, jailMin: 2, w: { I: 40, F: 60, C: 0 },
      prizes: [[6000, 30, 90, 'miudezas'], [3000, 150, 250, 'perfumes'], [900, 250, 350, 'eletronica'], [100, 400, 600, 'caixa']] },
    { id: 'carro', fam: 'furto', e: 20, level: 8, p: 8000, fine: 400, jailMin: 5, w: { I: 70, F: 30, C: 0 },
      prizes: [[5000, 80, 220, 'radio'], [3500, 300, 600, 'gps'], [1300, 700, 1100, 'pecas'], [200, 1000, 1500, 'mala']] },
    { id: 'esticao', fam: 'assalto', e: 50, level: 12, p: 6700, fine: 1500, jailMin: 8, w: { I: 0, F: 70, C: 30 },
      prizes: [[5500, 300, 900, 'mala'], [3000, 1200, 2400, 'fio'], [1300, 3000, 5000, 'joias'], [200, 4000, 7000, 'envelope']] },
    { id: 'bomba', fam: 'assalto', e: 50, level: 18, p: 6500, fine: 2500, jailMin: 12, gun: true, w: { I: 20, F: 80, C: 0 },
      prizes: [[5000, 700, 1500, 'caixa'], [3500, 1800, 3000, 'cofre'], [1300, 4000, 6000, 'tabaco'], [200, 4000, 7000, 'malote']] },
    { id: 'armado', fam: 'armas', e: 100, level: 30, p: 7000, fine: 6000, jailMin: 20, gun: true, w: { I: 40, F: 60, C: 0 },
      prizes: [[5000, 2000, 4000, 'caixa'], [3500, 4500, 7500, 'cofre'], [1300, 8000, 12000, 'joalharia'], [200, 10000, 15000, 'cofreforte']] },
    // v72 (17/11/2026): três golpes novos, acrescentados no fim para não mexer nos índices dos jogadores (o ecrã ordena por nível).
    // tier: o degrau para os objetivos «golpe de nível N» (os seis de cima são 1 a 6 pela ordem); estes entram no degrau do nível.
    { id: 'bicicleta', fam: 'furto', e: 10, level: 3, p: 8500, fine: 200, jailMin: 3, tier: 2, w: { I: 30, F: 50, C: 20 },
      prizes: [[6000, 30, 100, 'pecasbike'], [3000, 140, 320, 'bicicleta'], [900, 300, 500, 'btt'], [100, 600, 1000, 'bikeeletrica']] },
    { id: 'multibanco', fam: 'burla', e: 20, level: 5, p: 8000, fine: 600, jailMin: 6, tier: 2, w: { I: 80, F: 0, C: 20 },
      prizes: [[5500, 80, 240, 'talao'], [3200, 250, 550, 'cartao'], [1100, 500, 900, 'clonados'], [200, 1200, 2000, 'carregamento']] },
    { id: 'farmacia', fam: 'assalto', e: 50, level: 24, p: 6600, fine: 3500, jailMin: 15, gun: true, tier: 5, w: { I: 20, F: 70, C: 10 },
      prizes: [[5000, 900, 2000, 'caixa'], [3500, 2000, 3500, 'medicamentos'], [1300, 3500, 5500, 'cofre'], [200, 5000, 8000, 'controlados']] },
  ],
  // A rua aquece: no mesmo dia (de Lisboa), a 1.ª e a 2.ª barra de golpes de rua rendem 100%, a 3.ª e a 4.ª 70%, a 5.ª e a 6.ª 45%,
  // da 7.ª em diante 25% (dinheiro e respeito). Respeito de uma barra de golpes: 20 + 2 por nível, até 120 (dá-se nos golpes que correm bem).
  // a rua aquece com a stamina gasta em golpes e arrefece sozinha, coolPerH por hora (uma barra em 2 h; antes era por dia)
  // o respeito continua a contar por dia (respHeat, as barras de golpes do dia), para a corrida ao nível 100 não acelerar
  street: { heat: [10000, 10000, 9000, 8000, 7000, 6000, 5000, 4000], coolPerH: 50, respHeat: [10000, 10000, 7000, 7000, 4500, 4500, 2500], respBase: 20, respPerLevel: 2, respCap: 120 },
  // Passo 4: os golpes com arma gastam 10 balas e um uso da arma de fogo (a de mão, se houver; senão a principal).
  // Balas: caixas de 50 a 25 € (0,50 € cada; grau C). Com o desgaste da pistola (1 750 € em 20 usos), um golpe com arma custa
  // cerca de 92 €, perto dos 100 € de balas e desgaste do modelo.
  bullets: { box: 50, price: 25, perJob: 10 },
  // O que se rouba e é objeto vai para o inventário com o valor que saiu (vende-se ao recetador por esse valor). Sem espaço,
  // vende-se logo à pressa por metade (rushBp). O resto do sorteio é dinheiro na mão.
  loot: { goods: ['telemovel', 'relogio', 'miudezas', 'perfumes', 'eletronica', 'radio', 'gps', 'pecas', 'fio', 'joias', 'tabaco', 'joalharia'], rushBp: 5000, gearSellBp: 5000 },
  // Equipamento (passo 4): 9 espaços no corpo. atk/def em bp a somar à Força/Tolerância. Ataque = a melhor arma de fogo (mão ou
  // principal, se não estiver estragada) + 30% da outra (v87) + a arma branca. Defesa = a soma das peças do corpo. Armas de fogo: life = usos até
  // ser preciso reparar (reparar custa a parte gasta do preço). Acessórios: mochila (+4 espaços) ou rádio-scanner (prisão ao
  // falhar 20% em vez de 25%). Preços reais: pistola 1 750 €, colete 600 €, navalha 25 €; os outros sem fonte (grau D).
  slots: ['branca', 'mao', 'principal', 'cabeca', 'tronco', 'pernas', 'pes', 'maos', 'acess'],
  gunSideBp: 3000,   // v87: com duas armas de fogo a funcionar, a mais fraca conta 30% no ataque (a de mão deixa de ser só reserva)
  gear: [
    // v87: o arsenal passa de 6 para 30 armas (10 brancas, 5 de mão, 15 principais), por nível. As melhores de cada categoria
    // (craft: true) só se fazem na cave, com um material raro das escavações, e ficam acima de todas as da loja; o preço delas é o
    // valor (penhorista, feira). As 6 antigas mantêm o preço e o ataque; a metralhadora e a sniper passam a pedir nível (quem já
    // as tinha vestidas fica com elas). Degraus de pelo menos 1 000 bp nas principais (a revisão achou o topo plano).
    // Teto do ataque (principal + 30% da de mão + branca): 23 000 + 2 550 + 5 600 = 31 150 bp; a defesa vai a 28 500 nas peças
    // e mais 50% com a escolta (os guardas multiplicam), por isso no topo quem se protege continua à frente.
    // v97: o arsenal passa a 156 armas em 13 tipos, como no Torn: cada uma com ataque (atk, bp), precisão (acc, de 0 a 100: nas lutas,
    // cada ponto acima de 50 vale +15 bp de hipótese), alcance (rng, metros: nas lutas, o dobro do alcance do outro dá +3 pontos;
    // na caça diz até onde se acerta) e espaços para acessórios (ms). As 30 de antes mantêm preço, ataque, vida e nível.
    // soqueira
    { id: 'soqueira', slot: 'branca', price: 20, atk: 1000, t: 'soqueira', acc: 68, rng: 1, ms: 1 },
    { id: 'luvaschumbo', slot: 'branca', price: 50, atk: 1500, t: 'soqueira', acc: 71, rng: 1, ms: 1 },
    { id: 'soqueirapicos', slot: 'branca', price: 100, atk: 2000, t: 'soqueira', acc: 75, rng: 1, ms: 1 },
    { id: 'punhalsoco', slot: 'branca', price: 110, atk: 2500, t: 'soqueira', acc: 73, rng: 1, ms: 1 },
    { id: 'garras', slot: 'branca', price: 120, atk: 3000, t: 'soqueira', acc: 77, rng: 1, ms: 1 },
    { id: 'soqueiralamina', slot: 'branca', price: 500, atk: 3500, level: 6, t: 'soqueira', acc: 75, rng: 1, ms: 1 },
    { id: 'manopla', slot: 'branca', price: 700, atk: 4000, level: 12, t: 'soqueira', acc: 79, rng: 1, ms: 1 },
    { id: 'soqueiratitanio', slot: 'branca', price: 2000, atk: 4500, level: 22, t: 'soqueira', acc: 82, rng: 1, ms: 1 },
    // faca
    { id: 'xisato', slot: 'branca', price: 5, atk: 1600, t: 'faca', acc: 64, rng: 1, ms: 1 },
    { id: 'canivete', slot: 'branca', price: 10, atk: 1900, t: 'faca', acc: 67, rng: 1, ms: 1 },
    { id: 'facacozinha', slot: 'branca', price: 20, atk: 2200, t: 'faca', acc: 70, rng: 1, ms: 1 },
    { id: 'navalha', slot: 'branca', price: 25, atk: 2500, t: 'faca', acc: 68, rng: 1, ms: 1 },
    { id: 'borboleta', slot: 'branca', price: 100, atk: 2800, t: 'faca', acc: 71, rng: 1, ms: 1 },
    { id: 'estilete', slot: 'branca', price: 200, atk: 3100, t: 'faca', acc: 69, rng: 1, ms: 1 },
    { id: 'facamato', slot: 'branca', price: 220, atk: 3400, level: 5, t: 'faca', acc: 71, rng: 1, ms: 1 },
    { id: 'baioneta', slot: 'branca', price: 500, atk: 3700, level: 8, t: 'faca', acc: 74, rng: 1, ms: 1 },
    { id: 'karambit', slot: 'branca', price: 700, atk: 4000, level: 12, t: 'faca', acc: 72, rng: 1, ms: 1 },
    { id: 'facacombate', slot: 'branca', price: 1500, atk: 4300, level: 18, t: 'faca', acc: 75, rng: 1, ms: 1 },
    { id: 'kukri', slot: 'branca', price: 2000, atk: 4600, level: 24, t: 'faca', acc: 73, rng: 1, ms: 1 },
    { id: 'tanto', slot: 'branca', price: 3500, atk: 4900, level: 30, t: 'faca', acc: 76, rng: 1, ms: 1 },
    // contundente
    { id: 'garrafa', slot: 'branca', price: 10, atk: 1300, t: 'contundente', acc: 58, rng: 1, ms: 1 },
    { id: 'canoferro', slot: 'branca', price: 20, atk: 1600, t: 'contundente', acc: 61, rng: 1, ms: 1 },
    { id: 'tacobasebol', slot: 'branca', price: 30, atk: 1900, t: 'contundente', acc: 64, rng: 1, ms: 1 },
    { id: 'cassetete', slot: 'branca', price: 40, atk: 2200, t: 'contundente', acc: 61, rng: 1, ms: 1 },
    { id: 'martelo', slot: 'branca', price: 50, atk: 2500, t: 'contundente', acc: 64, rng: 1, ms: 1 },
    { id: 'taco', slot: 'branca', price: 60, atk: 2800, t: 'contundente', acc: 62, rng: 1, ms: 1 },
    { id: 'bastao', slot: 'branca', price: 120, atk: 3100, t: 'contundente', acc: 65, rng: 1, ms: 1 },
    { id: 'alavanca', slot: 'branca', price: 200, atk: 3400, level: 5, t: 'contundente', acc: 67, rng: 2, ms: 1 },
    { id: 'nunchaku', slot: 'branca', price: 500, atk: 3700, level: 8, t: 'contundente', acc: 65, rng: 2, ms: 1 },
    { id: 'tacopregos', slot: 'branca', price: 700, atk: 3950, level: 11, t: 'contundente', acc: 68, rng: 2, ms: 1 },
    { id: 'bastaoextensivel', slot: 'branca', price: 1000, atk: 4250, level: 17, t: 'contundente', acc: 66, rng: 2, ms: 1 },
    { id: 'marreta', slot: 'branca', price: 2000, atk: 4550, level: 23, t: 'contundente', acc: 68, rng: 2, ms: 1 },
    { id: 'maca', slot: 'branca', price: 3000, atk: 4800, level: 28, t: 'contundente', acc: 71, rng: 2, ms: 1 },
    { id: 'martelodeguerra', slot: 'branca', price: 5000, atk: 5100, level: 34, t: 'contundente', acc: 69, rng: 2, ms: 1 },
    // lamina
    { id: 'foice', slot: 'branca', price: 100, atk: 2200, t: 'lamina', acc: 54, rng: 2, ms: 1 },
    { id: 'machadinha', slot: 'branca', price: 150, atk: 2550, t: 'lamina', acc: 57, rng: 2, ms: 1 },
    { id: 'catanamato', slot: 'branca', price: 250, atk: 2950, t: 'lamina', acc: 60, rng: 2, ms: 1 },
    { id: 'tomahawk', slot: 'branca', price: 300, atk: 3300, level: 3, t: 'lamina', acc: 58, rng: 2, ms: 1 },
    { id: 'machado', slot: 'branca', price: 400, atk: 3700, level: 8, t: 'lamina', acc: 61, rng: 2, ms: 1 },
    { id: 'catana', slot: 'branca', price: 750, atk: 4000, level: 12, t: 'lamina', acc: 60, rng: 2, ms: 1 },
    { id: 'gadanha', slot: 'branca', price: 1500, atk: 4300, level: 18, t: 'lamina', acc: 63, rng: 2, ms: 1 },
    { id: 'machadobatalha', slot: 'branca', price: 2500, atk: 4650, level: 25, t: 'lamina', acc: 66, rng: 2, ms: 1 },
    { id: 'motosserra', slot: 'branca', price: 4000, atk: 4950, level: 31, t: 'lamina', acc: 64, rng: 2, ms: 1 },
    { id: 'alabarda', slot: 'branca', price: 7000, atk: 5300, level: 38, t: 'lamina', acc: 67, rng: 2, ms: 1 },
    // espada
    { id: 'florete', slot: 'branca', price: 200, atk: 2650, t: 'espada', acc: 60, rng: 2, ms: 1 },
    { id: 'rapieira', slot: 'branca', price: 500, atk: 3000, t: 'espada', acc: 63, rng: 2, ms: 1 },
    { id: 'cimitarra', slot: 'branca', price: 800, atk: 3350, level: 4, t: 'espada', acc: 66, rng: 2, ms: 1 },
    { id: 'wakizashi', slot: 'branca', price: 1000, atk: 3700, level: 8, t: 'espada', acc: 64, rng: 2, ms: 1 },
    { id: 'espadalarga', slot: 'branca', price: 1200, atk: 4050, level: 13, t: 'espada', acc: 67, rng: 2, ms: 1 },
    { id: 'katana', slot: 'branca', price: 1500, atk: 4400, level: 20, t: 'espada', acc: 66, rng: 3, ms: 1 },
    { id: 'espadamao', slot: 'branca', price: 2000, atk: 4700, level: 26, t: 'espada', acc: 69, rng: 3, ms: 1 },
    { id: 'falcata', slot: 'branca', price: 3000, atk: 5000, level: 25, craft: true, t: 'espada', acc: 72, rng: 3, ms: 1 },
    { id: 'claymore', slot: 'branca', price: 4000, atk: 5300, level: 38, t: 'espada', acc: 70, rng: 3, ms: 1 },
    { id: 'gladio', slot: 'branca', price: 5000, atk: 5600, level: 35, craft: true, t: 'espada', acc: 73, rng: 3, ms: 1 },
    // pistola
    { id: 'pistola22', slot: 'mao', price: 200, atk: 3100, gun: true, life: 30, t: 'pistola', acc: 53, rng: 25, ms: 2 },
    { id: 'pistolabolso', slot: 'mao', price: 500, atk: 3450, gun: true, life: 30, t: 'pistola', acc: 56, rng: 25, ms: 2 },
    { id: 'pistola380', slot: 'mao', price: 800, atk: 3750, gun: true, life: 35, t: 'pistola', acc: 58, rng: 30, ms: 2 },
    { id: 'pistolacompacta', slot: 'mao', price: 1000, atk: 4050, gun: true, life: 35, t: 'pistola', acc: 56, rng: 30, ms: 2 },
    { id: 'pistola9', slot: 'mao', price: 1200, atk: 4350, gun: true, life: 35, t: 'pistola', acc: 58, rng: 35, ms: 2 },
    { id: 'pistolapolicia', slot: 'mao', price: 1500, atk: 4700, gun: true, life: 40, t: 'pistola', acc: 56, rng: 35, ms: 2 },
    { id: 'pistola', slot: 'mao', price: 1750, atk: 5000, gun: true, life: 20, t: 'pistola', acc: 59, rng: 35, ms: 2 },
    { id: 'pistolatiro', slot: 'mao', price: 2500, atk: 5350, gun: true, life: 40, level: 4, t: 'pistola', acc: 65, rng: 40, ms: 2 },
    { id: 'pistola10', slot: 'mao', price: 3000, atk: 5650, gun: true, life: 45, level: 8, t: 'pistola', acc: 59, rng: 40, ms: 2 },
    { id: 'pistolamilitar', slot: 'mao', price: 3500, atk: 6000, gun: true, life: 45, level: 12, t: 'pistola', acc: 61, rng: 45, ms: 2 },
    { id: 'pistolaaco', slot: 'mao', price: 4000, atk: 6350, gun: true, life: 45, level: 15, t: 'pistola', acc: 59, rng: 45, ms: 2 },
    { id: 'pistola57', slot: 'mao', price: 4500, atk: 6650, gun: true, life: 50, level: 17, t: 'pistola', acc: 61, rng: 50, ms: 2 },
    { id: 'pistola50', slot: 'mao', price: 5000, atk: 7000, gun: true, life: 40, level: 20, t: 'pistola', acc: 64, rng: 50, ms: 2 },
    { id: 'pistolaauto', slot: 'mao', price: 5500, atk: 7300, gun: true, life: 50, level: 22, t: 'pistola', acc: 58, rng: 50, ms: 2 },
    { id: 'pistolacarbono', slot: 'mao', price: 6000, atk: 7600, gun: true, life: 55, level: 25, t: 'pistola', acc: 68, rng: 55, ms: 2 },
    { id: 'pistola50ae', slot: 'mao', price: 7000, atk: 7900, gun: true, life: 55, level: 27, t: 'pistola', acc: 62, rng: 55, ms: 2 },
    { id: 'pistolaouro', slot: 'mao', price: 7500, atk: 8200, gun: true, life: 55, level: 30, t: 'pistola', acc: 64, rng: 60, ms: 2 },
    { id: 'pistolaafinada', slot: 'mao', price: 8000, atk: 8500, gun: true, life: 50, level: 30, craft: true, t: 'pistola', acc: 71, rng: 60, ms: 2 },
    // revolver
    { id: 'revolver22', slot: 'mao', price: 500, atk: 3650, gun: true, life: 35, t: 'revolver', acc: 50, rng: 30, ms: 2 },
    { id: 'revolver', slot: 'mao', price: 600, atk: 4000, gun: true, life: 15, t: 'revolver', acc: 53, rng: 35, ms: 2 },
    { id: 'snubnose', slot: 'mao', price: 1000, atk: 4500, gun: true, life: 40, t: 'revolver', acc: 56, rng: 40, ms: 2 },
    { id: 'revolver357', slot: 'mao', price: 2000, atk: 5000, gun: true, life: 40, t: 'revolver', acc: 54, rng: 45, ms: 2 },
    { id: 'revolver44', slot: 'mao', price: 2500, atk: 5500, gun: true, life: 40, level: 6, t: 'revolver', acc: 57, rng: 50, ms: 2 },
    { id: 'magnum', slot: 'mao', price: 3000, atk: 6000, gun: true, life: 30, level: 12, t: 'revolver', acc: 56, rng: 50, ms: 2 },
    { id: 'revolvercaca', slot: 'mao', price: 4000, atk: 6500, gun: true, life: 50, level: 16, t: 'revolver', acc: 59, rng: 55, ms: 2 },
    { id: 'revolver454', slot: 'mao', price: 5000, atk: 7000, gun: true, life: 50, level: 20, t: 'revolver', acc: 62, rng: 60, ms: 2 },
    { id: 'revolver500', slot: 'mao', price: 6500, atk: 7500, gun: true, life: 50, level: 24, t: 'revolver', acc: 60, rng: 65, ms: 2 },
    { id: 'revolvercolecao', slot: 'mao', price: 8500, atk: 8000, gun: true, life: 55, level: 28, t: 'revolver', acc: 63, rng: 70, ms: 2 },
    // smg
    { id: 'micro', slot: 'principal', price: 2000, atk: 8550, gun: true, life: 60, level: 3, t: 'smg', acc: 40, rng: 60, ms: 2 },
    { id: 'smg9', slot: 'principal', price: 3000, atk: 9550, gun: true, life: 65, level: 7, t: 'smg', acc: 47, rng: 65, ms: 2 },
    { id: 'compacta', slot: 'principal', price: 4500, atk: 10500, gun: true, life: 50, level: 9, t: 'smg', acc: 50, rng: 70, ms: 2 },
    { id: 'smgdobravel', slot: 'principal', price: 5000, atk: 11250, gun: true, life: 70, level: 10, t: 'smg', acc: 48, rng: 75, ms: 2 },
    { id: 'metralhadora', slot: 'principal', price: 6000, atk: 12000, gun: true, life: 70, level: 12, t: 'smg', acc: 51, rng: 80, ms: 2 },
    { id: 'smg45', slot: 'principal', price: 6500, atk: 13000, gun: true, life: 80, level: 14, t: 'smg', acc: 49, rng: 85, ms: 2 },
    { id: 'smgpdw', slot: 'principal', price: 7500, atk: 14000, gun: true, life: 85, level: 16, t: 'smg', acc: 51, rng: 95, ms: 2 },
    { id: 'artesanal', slot: 'principal', price: 8000, atk: 15000, gun: true, life: 60, level: 18, craft: true, t: 'smg', acc: 54, rng: 100, ms: 2 },
    { id: 'smgsilenciosa', slot: 'principal', price: 8500, atk: 15800, gun: true, life: 95, level: 20, t: 'smg', acc: 52, rng: 105, ms: 2 },
    { id: 'smgbullpup', slot: 'principal', price: 9000, atk: 16550, gun: true, life: 100, level: 21, t: 'smg', acc: 55, rng: 110, ms: 2 },
    { id: 'smgtambor', slot: 'principal', price: 9500, atk: 17350, gun: true, life: 100, level: 23, t: 'smg', acc: 49, rng: 115, ms: 2 },
    { id: 'smgtatica', slot: 'principal', price: 11000, atk: 18100, gun: true, life: 105, level: 26, t: 'smg', acc: 56, rng: 120, ms: 2 },
    // cacadeira
    { id: 'cacadeiraserrada', slot: 'principal', price: 1000, atk: 6400, gun: true, life: 45, t: 'cacadeira', acc: 44, rng: 10, ms: 2 },
    { id: 'cacadeiradupla', slot: 'principal', price: 2000, atk: 7200, gun: true, life: 50, t: 'cacadeira', acc: 51, rng: 25, ms: 2 },
    { id: 'cacadeira', slot: 'principal', price: 2500, atk: 8000, gun: true, life: 30, t: 'cacadeira', acc: 54, rng: 25, ms: 2 },
    { id: 'cacadeirapolicial', slot: 'principal', price: 3000, atk: 8500, gun: true, life: 60, level: 3, t: 'cacadeira', acc: 52, rng: 30, ms: 2 },
    { id: 'repeticao', slot: 'principal', price: 3500, atk: 9000, gun: true, life: 40, level: 6, t: 'cacadeira', acc: 55, rng: 30, ms: 2 },
    { id: 'cacadeirasemi', slot: 'principal', price: 4500, atk: 10350, gun: true, life: 65, level: 9, t: 'cacadeira', acc: 53, rng: 35, ms: 2 },
    { id: 'cacadeiratatica', slot: 'principal', price: 5500, atk: 11700, gun: true, life: 75, level: 11, t: 'cacadeira', acc: 55, rng: 35, ms: 2 },
    { id: 'cacadeirabullpup', slot: 'principal', price: 7000, atk: 13100, gun: true, life: 80, level: 14, t: 'cacadeira', acc: 58, rng: 40, ms: 2 },
    { id: 'cacadeiracarregador', slot: 'principal', price: 8000, atk: 14450, gun: true, life: 85, level: 17, t: 'cacadeira', acc: 56, rng: 40, ms: 2 },
    { id: 'cacadeiraauto', slot: 'principal', price: 8500, atk: 15800, gun: true, life: 95, level: 20, t: 'cacadeira', acc: 55, rng: 45, ms: 2 },
    { id: 'cacadeiratambor', slot: 'principal', price: 9500, atk: 17200, gun: true, life: 100, level: 23, t: 'cacadeira', acc: 53, rng: 45, ms: 2 },
    { id: 'cacadeiragravada', slot: 'principal', price: 12500, atk: 18550, gun: true, life: 110, level: 28, t: 'cacadeira', acc: 60, rng: 50, ms: 2 },
    // carabina
    { id: 'carabinacurta', slot: 'principal', price: 2000, atk: 11300, gun: true, life: 70, level: 11, t: 'carabina', acc: 54, rng: 300, ms: 3 },
    { id: 'carabina556', slot: 'principal', price: 4000, atk: 12050, gun: true, life: 75, level: 12, t: 'carabina', acc: 57, rng: 320, ms: 3 },
    { id: 'espingardaassalto', slot: 'principal', price: 6000, atk: 12800, gun: true, life: 80, level: 14, t: 'carabina', acc: 59, rng: 340, ms: 3 },
    { id: 'assalto', slot: 'principal', price: 7500, atk: 13500, gun: true, life: 80, level: 15, t: 'carabina', acc: 57, rng: 360, ms: 3 },
    { id: 'carabinapolicia', slot: 'principal', price: 8000, atk: 14400, gun: true, life: 85, level: 17, t: 'carabina', acc: 60, rng: 380, ms: 3 },
    { id: 'ar762', slot: 'principal', price: 9000, atk: 15300, gun: true, life: 90, level: 19, t: 'carabina', acc: 57, rng: 400, ms: 3 },
    { id: 'carabinamilitar', slot: 'principal', price: 9500, atk: 16200, gun: true, life: 95, level: 20, t: 'carabina', acc: 60, rng: 420, ms: 3 },
    { id: 'bullpup', slot: 'principal', price: 10500, atk: 17100, gun: true, life: 100, level: 22, t: 'carabina', acc: 63, rng: 440, ms: 3 },
    { id: 'batalha', slot: 'principal', price: 11000, atk: 18000, gun: true, life: 90, level: 26, t: 'carabina', acc: 60, rng: 460, ms: 3 },
    { id: 'carabinadmr', slot: 'principal', price: 13000, atk: 18750, gun: true, life: 110, level: 29, t: 'carabina', acc: 67, rng: 480, ms: 3 },
    { id: 'batalhapesada', slot: 'principal', price: 14000, atk: 19500, gun: true, life: 110, level: 32, t: 'carabina', acc: 61, rng: 500, ms: 3 },
    { id: 'carabinaforcas', slot: 'principal', price: 16000, atk: 20250, gun: true, life: 115, level: 35, t: 'carabina', acc: 63, rng: 520, ms: 3 },
    { id: 'calibre50', slot: 'principal', price: 18000, atk: 21000, gun: true, life: 120, level: 38, t: 'carabina', acc: 66, rng: 540, ms: 3 },
    { id: 'carabinacarbono', slot: 'principal', price: 22000, atk: 21650, gun: true, life: 125, level: 41, t: 'carabina', acc: 68, rng: 560, ms: 3 },
    { id: 'carabinaprototipo', slot: 'principal', price: 26000, atk: 22350, gun: true, life: 125, level: 43, t: 'carabina', acc: 66, rng: 580, ms: 3 },
    { id: 'tatica', slot: 'principal', price: 30000, atk: 23000, gun: true, life: 140, level: 50, craft: true, t: 'carabina', acc: 64, rng: 600, ms: 3 },
    // espingarda
    { id: 'espingardaar', slot: 'principal', price: 500, atk: 4300, gun: true, life: 35, t: 'espingarda', acc: 60, rng: 150, ms: 2 },
    { id: 'pressao', slot: 'principal', price: 900, atk: 5000, gun: true, life: 15, t: 'espingarda', acc: 63, rng: 190, ms: 2 },
    { id: 'espingarda22', slot: 'principal', price: 1000, atk: 5750, gun: true, life: 45, t: 'espingarda', acc: 66, rng: 235, ms: 2 },
    { id: 'caca', slot: 'principal', price: 1700, atk: 6500, gun: true, life: 25, t: 'espingarda', acc: 63, rng: 275, ms: 2 },
    { id: 'espingardaalavanca', slot: 'principal', price: 3000, atk: 8300, gun: true, life: 55, level: 2, t: 'espingarda', acc: 66, rng: 320, ms: 2 },
    { id: 'espingarda3030', slot: 'principal', price: 5000, atk: 10050, gun: true, life: 65, level: 8, t: 'espingarda', acc: 64, rng: 360, ms: 2 },
    { id: 'espingardavarmint', slot: 'principal', price: 7000, atk: 11850, gun: true, life: 75, level: 12, t: 'espingarda', acc: 67, rng: 405, ms: 2 },
    { id: 'ferrolho', slot: 'principal', price: 8000, atk: 13650, gun: true, life: 85, level: 15, t: 'espingarda', acc: 69, rng: 445, ms: 2 },
    { id: 'espingardamontanha', slot: 'principal', price: 10000, atk: 15450, gun: true, life: 90, level: 19, t: 'espingarda', acc: 67, rng: 490, ms: 2 },
    { id: 'espingarda300', slot: 'principal', price: 12000, atk: 17200, gun: true, life: 100, level: 23, t: 'espingarda', acc: 70, rng: 530, ms: 2 },
    { id: 'precisao', slot: 'principal', price: 13500, atk: 19000, gun: true, life: 110, level: 30, t: 'espingarda', acc: 72, rng: 575, ms: 2 },
    { id: 'espingardasafari', slot: 'principal', price: 15000, atk: 19500, gun: true, life: 110, level: 32, t: 'espingarda', acc: 70, rng: 615, ms: 2 },
    { id: 'ligeira', slot: 'principal', price: 16000, atk: 20000, gun: true, life: 120, level: 34, t: 'espingarda', acc: 73, rng: 660, ms: 2 },
    { id: 'espingardaexpress', slot: 'principal', price: 18000, atk: 20950, gun: true, life: 120, level: 38, t: 'espingarda', acc: 71, rng: 700, ms: 2 },
    // sniper
    { id: 'sniper308', slot: 'principal', price: 2000, atk: 15200, gun: true, life: 90, level: 19, t: 'sniper', acc: 70, rng: 800, ms: 3 },
    { id: 'sniperpolicia', slot: 'principal', price: 4000, atk: 15800, gun: true, life: 95, level: 20, t: 'sniper', acc: 73, rng: 890, ms: 3 },
    { id: 'snipersemi', slot: 'principal', price: 7000, atk: 16400, gun: true, life: 95, level: 21, t: 'sniper', acc: 76, rng: 980, ms: 3 },
    { id: 'sniper', slot: 'principal', price: 9000, atk: 17000, gun: true, life: 100, level: 22, t: 'sniper', acc: 74, rng: 1075, ms: 3 },
    { id: 'sniperbullpup', slot: 'principal', price: 11000, atk: 17700, gun: true, life: 105, level: 25, t: 'sniper', acc: 77, rng: 1165, ms: 3 },
    { id: 'sniper338', slot: 'principal', price: 12000, atk: 18450, gun: true, life: 105, level: 28, t: 'sniper', acc: 75, rng: 1255, ms: 3 },
    { id: 'snipersilenciosa', slot: 'principal', price: 14000, atk: 19150, gun: true, life: 110, level: 31, t: 'sniper', acc: 77, rng: 1345, ms: 3 },
    { id: 'sniperartico', slot: 'principal', price: 15000, atk: 19850, gun: true, life: 115, level: 33, t: 'sniper', acc: 80, rng: 1435, ms: 3 },
    { id: 'snipercompeticao', slot: 'principal', price: 17000, atk: 20550, gun: true, life: 120, level: 36, t: 'sniper', acc: 82, rng: 1525, ms: 3 },
    { id: 'sniperanti', slot: 'principal', price: 18000, atk: 21300, gun: true, life: 120, level: 39, t: 'sniper', acc: 81, rng: 1620, ms: 3 },
    { id: 'afinada', slot: 'principal', price: 20000, atk: 22000, gun: true, life: 130, level: 42, craft: true, t: 'sniper', acc: 83, rng: 1710, ms: 3 },
    { id: 'sniperlonga', slot: 'principal', price: 21500, atk: 22600, gun: true, life: 130, level: 44, t: 'sniper', acc: 82, rng: 1800, ms: 3 },
    // pesada
    { id: 'metralhadoraligeira', slot: 'principal', price: 9500, atk: 17300, gun: true, life: 100, level: 23, t: 'pesada', acc: 36, rng: 400, ms: 2 },
    { id: 'metralhadoraesquadra', slot: 'principal', price: 11000, atk: 18050, gun: true, life: 105, level: 26, t: 'pesada', acc: 39, rng: 515, ms: 2 },
    { id: 'metralhadoramedia', slot: 'principal', price: 13000, atk: 18750, gun: true, life: 110, level: 29, t: 'pesada', acc: 43, rng: 630, ms: 2 },
    { id: 'espingardaautopesada', slot: 'principal', price: 14500, atk: 19500, gun: true, life: 110, level: 32, t: 'pesada', acc: 37, rng: 745, ms: 2 },
    { id: 'metralhadoracinto', slot: 'principal', price: 16500, atk: 20200, gun: true, life: 115, level: 35, t: 'pesada', acc: 41, rng: 855, ms: 2 },
    { id: 'metralhadorafuzileiro', slot: 'principal', price: 18000, atk: 20950, gun: true, life: 120, level: 38, t: 'pesada', acc: 43, rng: 970, ms: 2 },
    { id: 'metralhadoratripe', slot: 'principal', price: 19500, atk: 21650, gun: true, life: 125, level: 41, t: 'pesada', acc: 47, rng: 1085, ms: 2 },
    { id: 'metralhadorapesada', slot: 'principal', price: 21000, atk: 22400, gun: true, life: 125, level: 44, t: 'pesada', acc: 50, rng: 1200, ms: 2 },
    // v97: acessórios das armas (como os «mods» do Torn). Compram-se no armeiro, guardam-se no inventário e montam-se numa arma
    // vestida que os aceite (fits: os tipos). Cada arma tem ms espaços e só leva um acessório de cada família (cat). Somam à arma:
    // acc (precisão, pontos), rng (alcance, metros), dmg (ataque, bp, pode ser negativo), crit (bp de golpe crítico nas lutas: +50%
    // de respeito), ammo (balas a menos por golpe), bust (bp a menos de ser apanhado nos golpes com arma). Tiram-se para o inventário.
    { id: 'mod_reflex', slot: 'mod', cat: 'mira', price: 400, level: 5, acc: 6, fits: ['pistola', 'revolver', 'smg', 'carabina', 'cacadeira'] },
    { id: 'mod_holo', slot: 'mod', cat: 'mira', price: 1200, level: 12, acc: 9, fits: ['smg', 'carabina', 'cacadeira'] },
    { id: 'mod_luneta4', slot: 'mod', cat: 'mira', price: 1500, level: 10, acc: 8, rng: 150, fits: ['carabina', 'espingarda', 'sniper', 'pesada'] },
    { id: 'mod_luneta12', slot: 'mod', cat: 'mira', price: 6000, level: 25, acc: 12, rng: 400, fits: ['espingarda', 'sniper'] },
    { id: 'mod_laser', slot: 'mod', cat: 'laser', price: 900, level: 8, acc: 3, crit: 500, fits: ['pistola', 'revolver', 'smg', 'carabina', 'cacadeira'] },
    { id: 'mod_silenciador', slot: 'mod', cat: 'cano', price: 2000, level: 15, dmg: -500, bust: 1500, fits: ['pistola', 'smg', 'carabina', 'espingarda', 'sniper'] },
    { id: 'mod_compensador', slot: 'mod', cat: 'cano', price: 1600, level: 12, acc: 4, dmg: 300, fits: ['pistola', 'smg', 'carabina'] },
    { id: 'mod_choke', slot: 'mod', cat: 'cano', price: 800, level: 8, acc: 5, rng: 15, fits: ['cacadeira'] },
    { id: 'mod_carregador', slot: 'mod', cat: 'carregador', price: 700, level: 6, ammo: 3, fits: ['pistola', 'smg', 'carabina', 'pesada'] },
    { id: 'mod_tambor', slot: 'mod', cat: 'carregador', price: 2500, level: 18, acc: -3, ammo: 5, fits: ['smg', 'carabina', 'pesada', 'cacadeira'] },
    { id: 'mod_punho', slot: 'mod', cat: 'apoio', price: 500, level: 5, acc: 5, fits: ['smg', 'carabina', 'cacadeira', 'pesada'] },
    { id: 'mod_bipe', slot: 'mod', cat: 'apoio', price: 1800, level: 15, acc: 10, rng: 100, fits: ['espingarda', 'sniper', 'pesada'] },
    { id: 'mod_fita', slot: 'mod', cat: 'pega', price: 60, acc: 5, fits: ['soqueira', 'faca', 'contundente', 'lamina', 'espada'] },
    { id: 'mod_afiar', slot: 'mod', cat: 'gume', price: 300, level: 5, dmg: 500, fits: ['faca', 'lamina', 'espada'] },
    { id: 'mod_pregos', slot: 'mod', cat: 'gume', price: 150, level: 3, acc: -3, dmg: 700, fits: ['contundente', 'soqueira'] },
    // v73 (17/11/2026): mais peças para a cabeça, as pernas, os pés, as mãos e acessórios (as de baixo nível valem pouco; as táticas pedem nível)
    { id: 'bone', slot: 'cabeca', price: 15, def: 300 },
    { id: 'gorro', slot: 'cabeca', price: 20, def: 400 },
    { id: 'chapeu', slot: 'cabeca', price: 90, def: 600 },
    { id: 'capacete', slot: 'cabeca', price: 120, def: 1500 },
    { id: 'capatatico', slot: 'cabeca', price: 900, def: 3000, level: 15 },
    { id: 'capabalistico', slot: 'cabeca', price: 2500, def: 5000, level: 30 },
    { id: 'cabedal', slot: 'tronco', price: 150, def: 1000 },
    { id: 'colete', slot: 'tronco', price: 600, def: 2500 },
    { id: 'balistico', slot: 'tronco', price: 1200, def: 5000 },
    { id: 'kevlar', slot: 'tronco', price: 2500, def: 8000 },
    { id: 'blindado', slot: 'tronco', price: 6000, def: 12000 },
    { id: 'titanio', slot: 'tronco', price: 15000, def: 17000 },
    { id: 'ganga', slot: 'pernas', price: 45, def: 400 },
    { id: 'calcas', slot: 'pernas', price: 80, def: 800 },
    { id: 'calcastaticas', slot: 'pernas', price: 350, def: 1600, level: 12 },
    { id: 'perneiras', slot: 'pernas', price: 1400, def: 3000, level: 25 },
    { id: 'tenis', slot: 'pes', price: 50, def: 300 },
    { id: 'botas', slot: 'pes', price: 60, def: 700 },
    { id: 'biqueira', slot: 'pes', price: 140, def: 1200, level: 6 },
    { id: 'botastaticas', slot: 'pes', price: 420, def: 2000, level: 15 },
    { id: 'luvas', slot: 'maos', price: 25, def: 500 },
    { id: 'luvascabedal', slot: 'maos', price: 70, def: 800 },
    { id: 'luvastaticas', slot: 'maos', price: 260, def: 1500, level: 12 },
    { id: 'pochete', slot: 'acess', price: 20, room: 2 },
    { id: 'mochila', slot: 'acess', price: 45, room: 4 },
    { id: 'mochilatatica', slot: 'acess', price: 320, room: 8, level: 10 },
    { id: 'scanner', slot: 'acess', price: 400, bustBp: 2000 },
    { id: 'scannerdigital', slot: 'acess', price: 1600, bustBp: 1700, level: 20 },
    // material dos golpes grandes (passo 5): não se veste, guarda-se no inventário. As ferramentas ficam; os explosivos gastam-se.
    { id: 'pedecabra', slot: 'mat', price: 20 },
    { id: 'gazuas', slot: 'mat', price: 40 },
    { id: 'macarico', slot: 'mat', price: 400 },
    { id: 'explosivos', slot: 'mat', price: 3000, once: true, craft: true },   // v83: já não se vendem; fazem-se na cave
    { id: 'broca', slot: 'mat', price: 5000, craft: true },
  ],
  // Golpes grandes (passo 5, «Operações» da especificação): um de cada vez, preparação em tempo real, custo pago à cabeça,
  // parte do jogador se correr bem, hipótese (bp), pausa antes do seguinte. Valores da wiki; o resto é meu (grau D):
  // fam = skill que sobe e ajuda; jailMin = prisão se fores apanhado; lawyer = advogado se falhar; mat = material que tem de estar no
  // inventário; gun = pede arma de fogo e balas; rasto = o que fica para trás antes de preparar; alarm/drive = onde os cursos ajudam.
  ops: [
    { id: 'carros', level: 15, prepH: 12, cost: 200, gain: 4300, p: 8000, pauseH: 0, fam: 'conducao', jailMin: 30, lawyer: 300, mat: ['gazuas'], rasto: 40, drive: true },
    { id: 'residencia', level: 20, prepH: 24, cost: 500, gain: 4500, p: 7500, pauseH: 0, fam: 'furto', jailMin: 40, lawyer: 500, mat: ['pedecabra', 'gazuas'], rasto: 50, alarm: true },
    { id: 'ourivesaria', level: 35, prepH: 48, cost: 5000, gain: 35000, p: 6500, pauseH: 24, fam: 'assalto', jailMin: 60, lawyer: 3000, mat: ['pedecabra'], gun: true, rasto: 60, alarm: true },
    { id: 'lancha', level: 40, prepH: 48, cost: 70000, gain: 170000, p: 8000, pauseH: 48, fam: 'trafico', jailMin: 75, lawyer: 4000, mat: [], rasto: 40, drive: true },
    { id: 'banco', level: 55, prepH: 96, cost: 30000, gain: 78000, p: 5500, pauseH: 48, fam: 'armas', jailMin: 90, lawyer: 5000, mat: ['macarico'], gun: true, rasto: 60, alarm: true },
    { id: 'carrinha', level: 65, prepH: 120, cost: 40000, gain: 100000, p: 5000, pauseH: 72, fam: 'armas', jailMin: 100, lawyer: 5500, mat: ['explosivos'], gun: true, rasto: 60, drive: true },
    { id: 'contentor', level: 75, prepH: 120, cost: 400000, gain: 1500000, p: 7000, pauseH: 120, fam: 'trafico', jailMin: 110, lawyer: 7000, mat: [], rasto: 40 },
    { id: 'casino', level: 80, prepH: 168, cost: 150000, gain: 700000, p: 4000, pauseH: 120, fam: 'burla', jailMin: 120, lawyer: 7000, mat: ['broca'], rasto: 50, alarm: true },
  ],
  // Passos da preparação (nenhum gasta barra): reconhecimento (1% da parte, baixa o rasto), equipa (5%, sobe a hipótese) e suborno
  // (6%, só nos golpes que custam mais de 2 000 €: se falhar, não há advogado, prisão nem investigação). Respeito de um golpe que corre
  // bem: 2 × √parte (a wiki diz 3 ×; com 3 o motor chegava ao nível 100 antes das metas: regular no dia 245, bot no 147). Rasto: apanhado ao falhar
  // rasto/2 % das vezes; ligado ao golpe depois de correr bem rasto/5 % das vezes. Hipótese no máximo 95%.
  // A skill da família, os cursos (vigilante onde há alarmes, motorista onde há fuga de carro), as luvas e os contactos baixam o rasto;
  // só a equipa sobe a hipótese (a skill e os cursos a subir a hipótese punham o motor 45% acima do modelo no fim do ano).
  opSteps: { reconBp: 100, reconMin: 20, recon: 20, crewBp: 500, crew: 800, bribeBp: 600, bribeFrom: 2000, gloves: 10, alarmCourse: 'vigilante', alarm: 10,
    driveCourse: 'pesados', drive: 10, contact: 15, skillDiv: 300, maxBp: 9500, minRasto: 5, caughtPer: 50, linkedPer: 20, practice: 1000, bullets: 30, respK: 2 },
  // Lavagem (dos gastos da especificação): passados os primeiros 100 000 € de crime, 20% do que o crime rende perde-se nas fachadas.
  // Conta o dinheiro dos golpes de rua, da venda de droga, dos golpes grandes e do que se vende ao recetador. A licenciatura
  // (o contabilista) lava mais barato: 15% (grau D).
  launder: { freeUpTo: 100000, bp: 2000, course: 'licenciatura', courseBp: 1500 },
  // Advogado em avença: a partir do nível 30, 3 000 € por cada dia em que se joga. Paga o advogado dos golpes grandes falhados e corta a prisão a metade.
  retainer: { level: 30, day: 3000, jailCutBp: 5000 },
  // Prisão com coisas para fazer (passo 5). Contrabando: 20 de stamina rende metade do que a rua dá no teu nível, mas 15% das vezes
  // perde-se a mercadoria. Oficina: 10 de energia, 50 €. Pátio: 10 de energia, aposta de 20 € a 200 € conforme o nível, treina a força.
  // Cartas: 1 € a 50 €, sem barra. Favores: 2 por estadia (tirar 15% ao tempo, ou um contacto para os golpes grandes, até 3).
  // Fuga: 30 de stamina, 35%; se falhar, a pena cresce metade do que falta.
  jail: { smuggleE: 20, smuggleLoseBp: 1500, workE: 10, work: 50, yardE: 10, yardMin: 20, yardMax: 200, cardsMax: 50, favors: 2, favorCutBp: 1500,
    contactsMax: 3, escapeE: 30, escapeBp: 3500, escapeAddBp: 5000 },
  // Stamina a mais, a droga: cada barra (100) seguida custa 25 € × k + 5 € × k² (30, 70, 120, 180 €…); a escada desce 25 pontos por hora (uma barra em 4 h).
  refillBar: { a: 25, b: 5, coolPerH: 25 },
  // v79: colecionáveis e museu, à maneira dos peluches e das flores do Torn. Ficam numa vitrine (fora do inventário).
  // Lembranças: uma por rota do aeroporto, 25% em cada voo que chega inteiro. Peças raras: em cada golpe que corre bem,
  // 0,15% por ponto de stamina do golpe (carteirista 1,5%, assalto à mão armada 15%), para a stamina gasta valer o mesmo em qualquer golpe.
  // O museu fica com o conjunto inteiro e paga dinheiro limpo (vai para o banco) e respeito; a primeira entrega de cada conjunto
  // paga o dobro e põe o nome na placa. As repetidas vendem-se ao penhorista.
  col: {
    airBp: 2500, crimeBpPerE: 15, pawn: 300, plaque: 20,
    digRepBp: 3000,   // v85: nos conjuntos das escavações, as entregas repetidas pagam 30% e não dão respeito (repetir era uma máquina de dinheiro)
    sets: {
      mundo: { items: ['bule', 'tulipa', 'orquidea', 'caveira', 'tapete'], cash: 25000, resp: 300 },
      raras: { items: ['moeda', 'bolso', 'broche', 'selo', 'caneta', 'estatueta'], cash: 15000, resp: 200 },
      // v85: o que sai das escavações (cada sítio tem o seu conjunto)
      castrejo: { items: ['torques', 'fibula', 'cossoiro', 'triscele', 'contas'], cash: 8000, resp: 150, dig: 'briteiros' },
      conimbriga: { items: ['mosaico', 'lucerna', 'estilete', 'denario', 'anel'], cash: 15000, resp: 250, dig: 'conimbriga' },
      troia: { items: ['anfora', 'anzol', 'peso', 'unguentario', 'sigillata'], cash: 30000, resp: 400, dig: 'troia' },
      mertola: { items: ['candil', 'ataifor', 'jarrinha', 'dirham', 'pente'], cash: 60000, resp: 600, dig: 'mertola' },
    },
    route: { tanger: 'bule', amesterdao: 'tulipa', medellin: 'orquidea', culiacan: 'caveira', kandahar: 'tapete' },
  },
  // v78: consumíveis à maneira do Torn. Compram-se e usam-se logo; cada um enche uma conta de espera (estômago ou médica) que passa
  // em tempo real. Acima do teto não se consome mais dessa família. Preços em euros de Portugal (2026).
  consum: {
    cap: { est: 12 * HOUR, med: 6 * HOUR },
    list: [
      { id: 'cerveja', fam: 'est', price: 1, cd: HOUR, energy: 2 },
      { id: 'whisky', fam: 'est', price: 4, cd: HOUR, energy: 4 },
      { id: 'absinto', fam: 'est', price: 6, cd: HOUR, energy: 6, level: 10 },
      { id: 'energetico', fam: 'est', price: 2, cd: 2 * HOUR, vigor: 10 },
      { id: 'ligadura', fam: 'med', price: 3, cd: 15 * MIN, cut: 15 * MIN },
      { id: 'kit', fam: 'med', price: 18, cd: HOUR, cut: HOUR },
      { id: 'morfina', fam: 'med', price: 150, cd: 3 * HOUR, cut: 3 * HOUR, level: 20 },
    ],
  },
  // Venda de droga na rua: compra-se ao quilo e vende-se ao grama com stamina (10 por venda). Uma barra vende perBar gramas.
  // A clientela compra 1 barra por dia, mais 1 por cada 25 níveis. Respeito de uma barra: 15 + 1 por nível.
  deal: { step: 10, base: 1, perLevels: 25, respBase: 15, respPerLevel: 1,
    list: [{ drug: 'haxixe', level: 10, kg: 2000, perBar: 600 }, { drug: 'coca', level: 25, kg: 15000, perBar: 200 }] },
  crimeAllMax: 10, // «usar a stamina toda»: no máximo 10 golpes de uma vez (uma barra de carteirista)
  bustBp: 2500, // falhar um golpe: 25% das vezes és apanhado (prisão); nas outras só perdes a energia
  // mestria (antiga): ficou só a contagem de vitórias por golpe (wk), para os objetivos; o bónus passou para as skills
  mastery: { at: [10, 40, 150], bonusBp: 0 },
  // Skills por família de golpe (passo 3): sobem com a stamina gasta nessa família (corra bem ou mal) e dão até +30% do que se
  // leva ao fim de 400 barras (40 000 de stamina), em proporção até lá. Burla e condução ficam para as operações (passo 5).
  skills: { fams: ['furto', 'assalto', 'burla', 'trafico', 'conducao', 'armas'], maxBp: 3000, fullPts: 400 * 100 },
  // Empregos por turnos (passo 3). day = o líquido de um dia completo (6 turnos) em euros, que é o de dois meses de ordenado
  // real (um dia real vale dois meses de jogo). Cada turno gasta 10 de energia (a barra do ginásio, não a stamina), paga um
  // sexto do dia para o banco e dá +2 de respeito. Um emprego de cada vez; no máximo 6 turnos por dia de Lisboa.
  // course: o curso que o emprego pede (null = não pede nada). tip: a informação que cada turno dá.
  jobs: {
    // cada turno é a tarefa do emprego (trabalho à mão): paga o turno vezes 80% a 120% conforme a qualidade
    shiftE: 10, perDay: 6, resp: 2, qMin: 8000, qMax: 12000,
    list: [
      { id: 'estafeta', day: 1400, course: null, tip: 'cash', task: 'entregas' },        // entrega em casa das pessoas: vê quem tem dinheiro na mão
      { id: 'minimo', day: 1638, course: null, tip: 'stock', task: 'camiao' },         // caixa e armazém: ouve os clientes falar da bolsa
      { id: 'vigilante', day: 1800, course: 'vigilante', tip: 'guard', task: 'entradas' }, // conhece os alarmes: sabe quem não tem guardas
      { id: 'motorista', day: 2500, course: 'pesados', tip: 'club', task: 'entregas' },     // pesados: sabe onde a droga está mais barata
      { id: 'quadro', day: 2700, course: 'licenciatura', tip: 'hosp', task: 'doses' },   // enfermeiro: sabe quem sai do hospital e quando
      { id: 'senior', day: 4800, course: 'especializacao', tip: 'jail', task: 'contrato' },  // advogado: sabe quem sai da prisão e quando
    ],
  },
  // Trabalho à mão (16/11): biscates sem barra, cada um uma tarefa curta com objetos. Paga a base vezes a qualidade
  // (qMin a qMax: 60 a 120%) vezes 0,5^(cansaço/half); o cansaço sobe 1 por tarefa e desce para metade a cada halfLifeMs.
  // minMs: menos do que isto entre começar e entregar não paga. O laboratório é ilegal: dinheiro sujo e bustBp de rusga
  // (vezes a pressão policial), com jailMin de prisão e a multa do carteirista.
  // 17/11 (v67): um biscate do nível 1 paga como um toque de carteirista (cerca de 115 € com a qualidade normal), sem risco e
  // sem respeito; o laboratório paga mais com 3% de rusga. O cansaço passa para metade a cada 12 h (era 6 h).
  work: {
    half: 30, halfLifeMs: 12 * HOUR, qMin: 6000, qMax: 12000, spottedBp: 5000,   // spottedBp: visto pela patrulha no desmanche
    // v74 (17/11): o ritmo de cada biscate. Bem feito (70% ou mais) sobe +5%, até +30%; mal feito (menos de 50%) ou visto pela patrulha
    // desce 10%. É de cada biscate e fica na conta: recompensa quem se esforça, sem tirar o cansaço (que continua a travar quem repete).
    ritmo: { good: 7000, bad: 5000, step: 500, drop: 1000, cap: 3000 },
    list: [
      { id: 'camiao', level: 1, base: 95, minMs: 9000 },          // descarregar o camião: as caixas pesadas em baixo
      { id: 'entregas', level: 1, base: 105, minMs: 9000 },       // v74: dois passos (mochila e mapa), paga mais do que o camião        // encomendas na mochila e as portas pela ordem mais curta
      { id: 'laboratorio', level: 1, base: 135, minMs: 12000, bustBp: 300, jailMin: 10 },   // v74: três passos e ilegal (115 → 135)   // comprimidos, trituradora, sacos
      // 17/11 (v68): um degrau por cada crime novo. Pagam mais, mas sobem mais devagar do que o crime do mesmo nível
      { id: 'oficina', level: 8, base: 145, minMs: 12000 },       // v74: 110 → 145       // trocar um pneu: porcas em estrela e o aperto certo
      { id: 'mudancas', level: 12, base: 165, minMs: 12000 },     // v74: 125 → 165     // encaixar os móveis na carrinha: pesados à cabine, frágeis à porta
      { id: 'desmanche', level: 12, base: 185, minMs: 8000, bustBp: 400, jailMin: 15 },   // v74: 150 → 185   // peças de um carro roubado antes da patrulha
      // só nos turnos dos empregos (não são biscates)
      { id: 'entradas', shift: true, minMs: 8000 },   // vigilante: quem entrou sem estar na lista
      { id: 'doses', shift: true, minMs: 8000 },      // enfermeiro: três seringas na dose certa
      { id: 'contrato', shift: true, minMs: 8000 },   // advogado: as linhas do contrato que não batem com a ficha
    ],
  },
  // Cursos: pagam-se à cabeça, correm em tempo real (dias reais), um de cada vez. Ficam para sempre (a conta é permanente).
  // v80: o exame dos cursos, à maneira das entrevistas do Torn. São n perguntas do banco do curso (os textos estão no i18n
  // pela mesma ordem; aqui só a posição da resposta certa, que nunca vai para o cliente). Tudo certo a meio do curso tira
  // cutBp da duração (o 1.º corte a partir de 1/4 do tempo, o 2.º a partir de metade); no fim do tempo, passar dá o diploma.
  // Errar obriga a esperar retryBp da duração (entre retryMin e retryMax). Um exame aberto mais de ttl conta como chumbo.
  // v83: materiais dos biscates e a cave (onde se juntam para fazer componentes, ferramentas, armas e máquinas)
  mat: {
    cap: 40,   // teto por material ou componente no depósito; o que passa perde-se
    good: 7000,   // biscate bem feito (qualidade) dá 2 em vez de 1
    base: ['madeira', 'eletronica', 'quimicos', 'sucata', 'cobre', 'pecas'],
    drop: { camiao: 'madeira', entregas: 'eletronica', laboratorio: 'quimicos', oficina: 'sucata', mudancas: 'cobre', desmanche: 'pecas' },
    rare: ['ferro', 'bronze', 'vidro', 'malha'],   // v86: materiais raros, só das escavações (um por sítio), para as receitas de topo
  },
  craft: {
    batch: 5,   // componentes: até 5 de cada vez
    maqBp: 1500,   // máquina a trabalhar: +15% ao que o negócio rende
    // a máquina trabalha 7 dias depois de instalada ou revista; sem revisão pára (fica instalada, sem os +15%) até se fazer.
    // A revisão faz-se quando faltar uma semana ou menos (no máximo 14 dias à frente) e gasta componentes: procura que se repete.
    rev: { ms: 7 * DAY, maxMs: 14 * DAY, price: 500, needs: { chapa: 1, circuito: 1, reagente: 1 } },
    // Componentes fazem-se na hora (materiais e uns euros). O que sai deles (ferramentas, armas, máquinas) fica na bancada o
    // tempo da receita, uma coisa de cada vez. Ferramentas e armas custam em dinheiro metade do preço da loja (o que o
    // recetador dá por elas: fazer poupa, mas não imprime dinheiro); as máquinas, 5% do preço do negócio.
    list: [
      { id: 'chapa', kind: 'comp', needs: { sucata: 3 }, price: 10 },
      { id: 'caixote', kind: 'comp', needs: { madeira: 2 }, price: 10 },
      { id: 'cano', kind: 'comp', needs: { sucata: 2, pecas: 1 }, price: 20 },
      { id: 'circuito', kind: 'comp', needs: { eletronica: 2, cobre: 1 }, price: 30 },
      { id: 'reagente', kind: 'comp', needs: { quimicos: 3 }, price: 30 },
      { id: 'motor', kind: 'comp', needs: { pecas: 2, cobre: 2, sucata: 1 }, price: 50 },
      { id: 'kit', kind: 'comp', needs: { chapa: 1, reagente: 1, caixote: 1 }, price: 50 },   // kit de armeiro: repara uma arma de fogo de graça
      { id: 'macarico', kind: 'tool', needs: { cano: 1, chapa: 1, reagente: 1 }, price: 200, ms: HOUR },
      { id: 'explosivos', kind: 'tool', needs: { reagente: 2, circuito: 1, caixote: 1 }, price: 1500, ms: 2 * HOUR },
      { id: 'broca', kind: 'tool', needs: { motor: 1, circuito: 1, chapa: 2 }, price: 2500, ms: 4 * HOUR },
      { id: 'pistola', kind: 'gun', needs: { cano: 1, chapa: 1, pecas: 1 }, price: 875, ms: 2 * HOUR },
      { id: 'cacadeira', kind: 'gun', needs: { cano: 2, chapa: 1, madeira: 2 }, price: 1250, ms: 3 * HOUR },   // a coronha talha-se da madeira
      // v87: todas as da loja a partir de 200 € também se fazem aqui, por metade do preço e peças dos biscates (sem raros)
      { id: 'facamato', kind: 'gun', needs: { chapa: 1, madeira: 1 }, price: 110, ms: HOUR },
      { id: 'machado', kind: 'gun', needs: { chapa: 1, caixote: 1 }, price: 200, ms: HOUR },
      { id: 'catana', kind: 'gun', needs: { chapa: 2, caixote: 1 }, price: 375, ms: 2 * HOUR },
      { id: 'katana', kind: 'gun', needs: { chapa: 2, sucata: 2, caixote: 1 }, price: 750, ms: 2 * HOUR },
      { id: 'revolver', kind: 'gun', needs: { cano: 1, chapa: 1 }, price: 300, ms: 2 * HOUR },
      { id: 'magnum', kind: 'gun', needs: { cano: 1, chapa: 1, pecas: 2 }, price: 1500, ms: 3 * HOUR },
      { id: 'pistola50', kind: 'gun', needs: { cano: 2, chapa: 1, pecas: 1 }, price: 2500, ms: 3 * HOUR },
      { id: 'pressao', kind: 'gun', needs: { cano: 1, madeira: 2 }, price: 450, ms: HOUR },
      { id: 'caca', kind: 'gun', needs: { cano: 1, chapa: 1, madeira: 2 }, price: 850, ms: 2 * HOUR },
      { id: 'repeticao', kind: 'gun', needs: { cano: 2, chapa: 1, caixote: 1 }, price: 1750, ms: 3 * HOUR },
      { id: 'compacta', kind: 'gun', needs: { cano: 1, motor: 1, chapa: 1 }, price: 2250, ms: 3 * HOUR },
      { id: 'assalto', kind: 'gun', needs: { cano: 2, motor: 1, chapa: 1 }, price: 3750, ms: 4 * HOUR },
      { id: 'batalha', kind: 'gun', needs: { cano: 2, motor: 1, chapa: 2, madeira: 2 }, price: 5500, ms: 5 * HOUR },
      { id: 'precisao', kind: 'gun', needs: { cano: 2, circuito: 1, chapa: 1, madeira: 2 }, price: 6750, ms: 6 * HOUR },
      { id: 'ligeira', kind: 'gun', needs: { cano: 2, circuito: 1, chapa: 2, caixote: 1 }, price: 8000, ms: 6 * HOUR },
      { id: 'calibre50', kind: 'gun', needs: { cano: 2, circuito: 2, chapa: 2 }, price: 9000, ms: 7 * HOUR },
      // v86: os fatos de topo pedem materiais raros das escavações (gear = proteção: vai para o inventário como as armas);
      // v87: nas armas, os raros ficaram só para as que se fazem apenas aqui
      // (um raro por receita: a revisão mostrou que com 2 ou 3 eram precisas dezenas de escavações por peça)
      { id: 'metralhadora', kind: 'gun', needs: { motor: 1, cano: 2, circuito: 1 }, price: 3000, ms: 4 * HOUR },   // v87: as da loja sem raros
      { id: 'sniper', kind: 'gun', needs: { cano: 2, circuito: 1, chapa: 1, madeira: 1 }, price: 4500, ms: 6 * HOUR },
      { id: 'blindado', kind: 'gear', needs: { chapa: 3, ferro: 1 }, price: 3000, ms: 3 * HOUR },
      // v87: as que só se fazem aqui (as melhores de cada categoria)
      // (em dinheiro, metade do valor, como as outras: fazer e vender ao recetador nunca dá lucro)
      { id: 'falcata', kind: 'gun', needs: { ferro: 1, chapa: 1, caixote: 1 }, price: 1500, ms: 3 * HOUR },   // a espada curva dos povos da Idade do Ferro
      { id: 'gladio', kind: 'gun', needs: { ferro: 1, bronze: 1, chapa: 1 }, price: 2500, ms: 4 * HOUR },
      { id: 'pistolaafinada', kind: 'gun', needs: { cano: 1, chapa: 1, circuito: 1, vidro: 1 }, price: 4000, ms: 5 * HOUR },   // vidro: a mira
      { id: 'artesanal', kind: 'gun', needs: { motor: 1, cano: 2, chapa: 2, bronze: 1 }, price: 4000, ms: 4 * HOUR },
      { id: 'afinada', kind: 'gun', needs: { cano: 2, circuito: 2, vidro: 1, bronze: 1 }, price: 10000, ms: 8 * HOUR },
      { id: 'tatica', kind: 'gun', needs: { cano: 2, circuito: 1, chapa: 2, vidro: 1 }, price: 15000, ms: 10 * HOUR },
      // v97: as armas novas da loja a partir de 200 € também se fazem na cave, por metade do preço (materiais pelo tipo e pelo valor)
      { id: 'soqueiralamina', kind: 'gun', needs: { chapa: 2, caixote: 1 }, price: 250, ms: 2 * HOUR },
      { id: 'manopla', kind: 'gun', needs: { chapa: 2, caixote: 1 }, price: 350, ms: 2 * HOUR },
      { id: 'soqueiratitanio', kind: 'gun', needs: { chapa: 2, sucata: 2, caixote: 1 }, price: 1000, ms: 3 * HOUR },
      { id: 'estilete', kind: 'gun', needs: { chapa: 1, madeira: 1 }, price: 100, ms: 1 * HOUR },
      { id: 'baioneta', kind: 'gun', needs: { chapa: 2, caixote: 1 }, price: 250, ms: 2 * HOUR },
      { id: 'karambit', kind: 'gun', needs: { chapa: 2, caixote: 1 }, price: 350, ms: 2 * HOUR },
      { id: 'facacombate', kind: 'gun', needs: { chapa: 2, sucata: 2, caixote: 1 }, price: 750, ms: 3 * HOUR },
      { id: 'kukri', kind: 'gun', needs: { chapa: 2, sucata: 2, caixote: 1 }, price: 1000, ms: 3 * HOUR },
      { id: 'tanto', kind: 'gun', needs: { chapa: 2, sucata: 2, caixote: 1 }, price: 1750, ms: 3 * HOUR },
      { id: 'alavanca', kind: 'gun', needs: { chapa: 1, madeira: 1 }, price: 100, ms: 1 * HOUR },
      { id: 'nunchaku', kind: 'gun', needs: { chapa: 2, caixote: 1 }, price: 250, ms: 2 * HOUR },
      { id: 'tacopregos', kind: 'gun', needs: { chapa: 2, caixote: 1 }, price: 350, ms: 2 * HOUR },
      { id: 'bastaoextensivel', kind: 'gun', needs: { chapa: 2, caixote: 1 }, price: 500, ms: 2 * HOUR },
      { id: 'marreta', kind: 'gun', needs: { chapa: 2, sucata: 2, caixote: 1 }, price: 1000, ms: 3 * HOUR },
      { id: 'maca', kind: 'gun', needs: { chapa: 2, sucata: 2, caixote: 1 }, price: 1500, ms: 3 * HOUR },
      { id: 'martelodeguerra', kind: 'gun', needs: { chapa: 2, sucata: 2, caixote: 1 }, price: 2500, ms: 3 * HOUR },
      { id: 'catanamato', kind: 'gun', needs: { chapa: 1, madeira: 1 }, price: 125, ms: 1 * HOUR },
      { id: 'tomahawk', kind: 'gun', needs: { chapa: 1, madeira: 1 }, price: 150, ms: 1 * HOUR },
      { id: 'gadanha', kind: 'gun', needs: { chapa: 2, sucata: 2, caixote: 1 }, price: 750, ms: 3 * HOUR },
      { id: 'machadobatalha', kind: 'gun', needs: { chapa: 2, sucata: 2, caixote: 1 }, price: 1250, ms: 3 * HOUR },
      { id: 'motosserra', kind: 'gun', needs: { chapa: 2, sucata: 2, caixote: 1 }, price: 2000, ms: 3 * HOUR },
      { id: 'alabarda', kind: 'gun', needs: { chapa: 2, sucata: 2, caixote: 1 }, price: 3500, ms: 3 * HOUR },
      { id: 'florete', kind: 'gun', needs: { chapa: 1, madeira: 1 }, price: 100, ms: 1 * HOUR },
      { id: 'rapieira', kind: 'gun', needs: { chapa: 2, caixote: 1 }, price: 250, ms: 2 * HOUR },
      { id: 'cimitarra', kind: 'gun', needs: { chapa: 2, caixote: 1 }, price: 400, ms: 2 * HOUR },
      { id: 'wakizashi', kind: 'gun', needs: { chapa: 2, caixote: 1 }, price: 500, ms: 2 * HOUR },
      { id: 'espadalarga', kind: 'gun', needs: { chapa: 2, caixote: 1 }, price: 600, ms: 2 * HOUR },
      { id: 'espadamao', kind: 'gun', needs: { chapa: 2, sucata: 2, caixote: 1 }, price: 1000, ms: 3 * HOUR },
      { id: 'claymore', kind: 'gun', needs: { chapa: 2, sucata: 2, caixote: 1 }, price: 2000, ms: 3 * HOUR },
      { id: 'pistola22', kind: 'gun', needs: { cano: 1, chapa: 1 }, price: 100, ms: 2 * HOUR },
      { id: 'pistolabolso', kind: 'gun', needs: { cano: 1, chapa: 1 }, price: 250, ms: 2 * HOUR },
      { id: 'pistola380', kind: 'gun', needs: { cano: 1, chapa: 1 }, price: 400, ms: 2 * HOUR },
      { id: 'pistolacompacta', kind: 'gun', needs: { cano: 1, chapa: 1 }, price: 500, ms: 2 * HOUR },
      { id: 'pistola9', kind: 'gun', needs: { cano: 1, chapa: 1, pecas: 1 }, price: 600, ms: 2 * HOUR },
      { id: 'pistolapolicia', kind: 'gun', needs: { cano: 1, chapa: 1, pecas: 1 }, price: 750, ms: 3 * HOUR },
      { id: 'pistolatiro', kind: 'gun', needs: { cano: 1, chapa: 1, pecas: 1 }, price: 1250, ms: 3 * HOUR },
      { id: 'pistola10', kind: 'gun', needs: { cano: 1, chapa: 1, pecas: 1 }, price: 1500, ms: 3 * HOUR },
      { id: 'pistolamilitar', kind: 'gun', needs: { cano: 1, chapa: 1, pecas: 2 }, price: 1750, ms: 3 * HOUR },
      { id: 'pistolaaco', kind: 'gun', needs: { cano: 1, chapa: 1, pecas: 2 }, price: 2000, ms: 4 * HOUR },
      { id: 'pistola57', kind: 'gun', needs: { cano: 1, chapa: 1, pecas: 2 }, price: 2250, ms: 4 * HOUR },
      { id: 'pistolaauto', kind: 'gun', needs: { cano: 1, chapa: 1, pecas: 2 }, price: 2750, ms: 4 * HOUR },
      { id: 'pistolacarbono', kind: 'gun', needs: { cano: 1, chapa: 1, pecas: 2 }, price: 3000, ms: 4 * HOUR },
      { id: 'pistola50ae', kind: 'gun', needs: { cano: 1, chapa: 1, pecas: 2 }, price: 3500, ms: 4 * HOUR },
      { id: 'pistolaouro', kind: 'gun', needs: { cano: 1, chapa: 1, pecas: 2 }, price: 3750, ms: 4 * HOUR },
      { id: 'revolver22', kind: 'gun', needs: { cano: 1, chapa: 1 }, price: 250, ms: 2 * HOUR },
      { id: 'snubnose', kind: 'gun', needs: { cano: 1, chapa: 1 }, price: 500, ms: 2 * HOUR },
      { id: 'revolver357', kind: 'gun', needs: { cano: 1, chapa: 1, pecas: 1 }, price: 1000, ms: 3 * HOUR },
      { id: 'revolver44', kind: 'gun', needs: { cano: 1, chapa: 1, pecas: 1 }, price: 1250, ms: 3 * HOUR },
      { id: 'revolvercaca', kind: 'gun', needs: { cano: 1, chapa: 1, pecas: 2 }, price: 2000, ms: 4 * HOUR },
      { id: 'revolver454', kind: 'gun', needs: { cano: 1, chapa: 1, pecas: 2 }, price: 2500, ms: 4 * HOUR },
      { id: 'revolver500', kind: 'gun', needs: { cano: 1, chapa: 1, pecas: 2 }, price: 3250, ms: 4 * HOUR },
      { id: 'revolvercolecao', kind: 'gun', needs: { cano: 1, chapa: 1, pecas: 2 }, price: 4250, ms: 6 * HOUR },
      { id: 'micro', kind: 'gun', needs: { cano: 1, motor: 1, chapa: 1 }, price: 1000, ms: 3 * HOUR },
      { id: 'smg9', kind: 'gun', needs: { cano: 1, motor: 1, chapa: 1 }, price: 1500, ms: 3 * HOUR },
      { id: 'smgdobravel', kind: 'gun', needs: { cano: 1, motor: 1, chapa: 1 }, price: 2500, ms: 4 * HOUR },
      { id: 'smg45', kind: 'gun', needs: { cano: 1, motor: 1, chapa: 1 }, price: 3250, ms: 4 * HOUR },
      { id: 'smgpdw', kind: 'gun', needs: { cano: 1, motor: 1, chapa: 1 }, price: 3750, ms: 4 * HOUR },
      { id: 'smgsilenciosa', kind: 'gun', needs: { cano: 1, motor: 1, chapa: 1, circuito: 1 }, price: 4250, ms: 6 * HOUR },
      { id: 'smgbullpup', kind: 'gun', needs: { cano: 1, motor: 1, chapa: 1, circuito: 1 }, price: 4500, ms: 6 * HOUR },
      { id: 'smgtambor', kind: 'gun', needs: { cano: 1, motor: 1, chapa: 1, circuito: 1 }, price: 4750, ms: 6 * HOUR },
      { id: 'smgtatica', kind: 'gun', needs: { cano: 1, motor: 1, chapa: 1, circuito: 1 }, price: 5500, ms: 6 * HOUR },
      { id: 'cacadeiraserrada', kind: 'gun', needs: { cano: 2, chapa: 1, madeira: 2 }, price: 500, ms: 2 * HOUR },
      { id: 'cacadeiradupla', kind: 'gun', needs: { cano: 2, chapa: 1, madeira: 2 }, price: 1000, ms: 3 * HOUR },
      { id: 'cacadeirapolicial', kind: 'gun', needs: { cano: 2, chapa: 1, madeira: 2 }, price: 1500, ms: 3 * HOUR },
      { id: 'cacadeirasemi', kind: 'gun', needs: { cano: 2, chapa: 1, madeira: 2 }, price: 2250, ms: 4 * HOUR },
      { id: 'cacadeiratatica', kind: 'gun', needs: { cano: 2, chapa: 1, madeira: 2 }, price: 2750, ms: 4 * HOUR },
      { id: 'cacadeirabullpup', kind: 'gun', needs: { cano: 2, chapa: 1, madeira: 2, caixote: 1 }, price: 3500, ms: 4 * HOUR },
      { id: 'cacadeiracarregador', kind: 'gun', needs: { cano: 2, chapa: 1, madeira: 2, caixote: 1 }, price: 4000, ms: 6 * HOUR },
      { id: 'cacadeiraauto', kind: 'gun', needs: { cano: 2, chapa: 1, madeira: 2, caixote: 1 }, price: 4250, ms: 6 * HOUR },
      { id: 'cacadeiratambor', kind: 'gun', needs: { cano: 2, chapa: 1, madeira: 2, caixote: 1 }, price: 4750, ms: 6 * HOUR },
      { id: 'cacadeiragravada', kind: 'gun', needs: { cano: 2, chapa: 1, madeira: 2, caixote: 1 }, price: 6250, ms: 6 * HOUR },
      { id: 'carabinacurta', kind: 'gun', needs: { cano: 2, motor: 1, chapa: 1 }, price: 1000, ms: 3 * HOUR },
      { id: 'carabina556', kind: 'gun', needs: { cano: 2, motor: 1, chapa: 1 }, price: 2000, ms: 4 * HOUR },
      { id: 'espingardaassalto', kind: 'gun', needs: { cano: 2, motor: 1, chapa: 1 }, price: 3000, ms: 4 * HOUR },
      { id: 'carabinapolicia', kind: 'gun', needs: { cano: 2, motor: 1, chapa: 1 }, price: 4000, ms: 6 * HOUR },
      { id: 'ar762', kind: 'gun', needs: { cano: 2, motor: 1, chapa: 1 }, price: 4500, ms: 6 * HOUR },
      { id: 'carabinamilitar', kind: 'gun', needs: { cano: 2, motor: 1, chapa: 1 }, price: 4750, ms: 6 * HOUR },
      { id: 'bullpup', kind: 'gun', needs: { cano: 2, motor: 1, chapa: 1, circuito: 1 }, price: 5250, ms: 6 * HOUR },
      { id: 'carabinadmr', kind: 'gun', needs: { cano: 2, motor: 1, chapa: 1, circuito: 1 }, price: 6500, ms: 6 * HOUR },
      { id: 'batalhapesada', kind: 'gun', needs: { cano: 2, motor: 1, chapa: 1, circuito: 1 }, price: 7000, ms: 6 * HOUR },
      { id: 'carabinaforcas', kind: 'gun', needs: { cano: 2, motor: 1, chapa: 1, circuito: 1 }, price: 8000, ms: 8 * HOUR },
      { id: 'carabinacarbono', kind: 'gun', needs: { cano: 2, motor: 1, chapa: 1, circuito: 1 }, price: 11000, ms: 8 * HOUR },
      { id: 'carabinaprototipo', kind: 'gun', needs: { cano: 2, motor: 1, chapa: 1, circuito: 1 }, price: 13000, ms: 8 * HOUR },
      { id: 'espingardaar', kind: 'gun', needs: { cano: 1, chapa: 1, madeira: 2 }, price: 250, ms: 2 * HOUR },
      { id: 'espingarda22', kind: 'gun', needs: { cano: 1, chapa: 1, madeira: 2 }, price: 500, ms: 2 * HOUR },
      { id: 'espingardaalavanca', kind: 'gun', needs: { cano: 1, chapa: 1, madeira: 2 }, price: 1500, ms: 3 * HOUR },
      { id: 'espingarda3030', kind: 'gun', needs: { cano: 1, chapa: 1, madeira: 2 }, price: 2500, ms: 4 * HOUR },
      { id: 'espingardavarmint', kind: 'gun', needs: { cano: 1, chapa: 1, madeira: 2, circuito: 1 }, price: 3500, ms: 4 * HOUR },
      { id: 'ferrolho', kind: 'gun', needs: { cano: 1, chapa: 1, madeira: 2, circuito: 1 }, price: 4000, ms: 6 * HOUR },
      { id: 'espingardamontanha', kind: 'gun', needs: { cano: 1, chapa: 1, madeira: 2, circuito: 1 }, price: 5000, ms: 6 * HOUR },
      { id: 'espingarda300', kind: 'gun', needs: { cano: 1, chapa: 1, madeira: 2, circuito: 1 }, price: 6000, ms: 6 * HOUR },
      { id: 'espingardasafari', kind: 'gun', needs: { cano: 1, chapa: 1, madeira: 2, circuito: 1 }, price: 7500, ms: 8 * HOUR },
      { id: 'espingardaexpress', kind: 'gun', needs: { cano: 1, chapa: 1, madeira: 2, circuito: 1 }, price: 9000, ms: 8 * HOUR },
      { id: 'sniper308', kind: 'gun', needs: { cano: 2, circuito: 1, chapa: 1, madeira: 1 }, price: 1000, ms: 3 * HOUR },
      { id: 'sniperpolicia', kind: 'gun', needs: { cano: 2, circuito: 1, chapa: 1, madeira: 1 }, price: 2000, ms: 4 * HOUR },
      { id: 'snipersemi', kind: 'gun', needs: { cano: 2, circuito: 1, chapa: 1, madeira: 1 }, price: 3500, ms: 4 * HOUR },
      { id: 'sniperbullpup', kind: 'gun', needs: { cano: 2, circuito: 1, chapa: 1, madeira: 1 }, price: 5500, ms: 6 * HOUR },
      { id: 'sniper338', kind: 'gun', needs: { cano: 2, circuito: 1, chapa: 1, madeira: 1 }, price: 6000, ms: 6 * HOUR },
      { id: 'snipersilenciosa', kind: 'gun', needs: { cano: 2, circuito: 1, chapa: 1, madeira: 1 }, price: 7000, ms: 6 * HOUR },
      { id: 'sniperartico', kind: 'gun', needs: { cano: 2, circuito: 1, chapa: 1, madeira: 1 }, price: 7500, ms: 8 * HOUR },
      { id: 'snipercompeticao', kind: 'gun', needs: { cano: 2, circuito: 2, chapa: 1, madeira: 1 }, price: 8500, ms: 8 * HOUR },
      { id: 'sniperanti', kind: 'gun', needs: { cano: 2, circuito: 2, chapa: 1, madeira: 1 }, price: 9000, ms: 8 * HOUR },
      { id: 'sniperlonga', kind: 'gun', needs: { cano: 2, circuito: 2, chapa: 1, madeira: 1 }, price: 10750, ms: 8 * HOUR },
      { id: 'metralhadoraligeira', kind: 'gun', needs: { cano: 2, motor: 2, chapa: 2, circuito: 1 }, price: 4750, ms: 6 * HOUR },
      { id: 'metralhadoraesquadra', kind: 'gun', needs: { cano: 2, motor: 2, chapa: 2, circuito: 1 }, price: 5500, ms: 6 * HOUR },
      { id: 'metralhadoramedia', kind: 'gun', needs: { cano: 2, motor: 2, chapa: 2, circuito: 1 }, price: 6500, ms: 6 * HOUR },
      { id: 'espingardaautopesada', kind: 'gun', needs: { cano: 2, motor: 2, chapa: 2, circuito: 1 }, price: 7250, ms: 6 * HOUR },
      { id: 'metralhadoracinto', kind: 'gun', needs: { cano: 2, motor: 2, chapa: 2, circuito: 1 }, price: 8250, ms: 8 * HOUR },
      { id: 'metralhadorafuzileiro', kind: 'gun', needs: { cano: 2, motor: 2, chapa: 2, circuito: 1 }, price: 9000, ms: 8 * HOUR },
      { id: 'metralhadoratripe', kind: 'gun', needs: { cano: 2, motor: 2, chapa: 2, circuito: 1 }, price: 9750, ms: 8 * HOUR },
      { id: 'metralhadorapesada', kind: 'gun', needs: { cano: 2, motor: 2, chapa: 2, circuito: 1 }, price: 10500, ms: 8 * HOUR },
      { id: 'titanio', kind: 'gear', needs: { chapa: 3, motor: 1, malha: 1 }, price: 7500, ms: 8 * HOUR },
      { id: 'maq-lavandaria', kind: 'maq', biz: 'lavandaria', needs: { motor: 2, chapa: 2, circuito: 1 }, price: 2000, ms: 4 * HOUR },
      { id: 'maq-cafe', kind: 'maq', biz: 'cafe', needs: { motor: 1, circuito: 1, chapa: 1, cano: 1 }, price: 3000, ms: 3 * HOUR },
      { id: 'maq-oficina', kind: 'maq', biz: 'oficina', needs: { motor: 2, chapa: 3, cano: 2 }, price: 4500, ms: 5 * HOUR },
      { id: 'maq-clube', kind: 'maq', biz: 'clube', needs: { circuito: 3, motor: 1, caixote: 2 }, price: 40000, ms: 6 * HOUR },   // as caixas das colunas
      // v99: as máquinas dos negócios pequenos (5% do preço do negócio, como as outras)
      { id: 'maq-banca', kind: 'maq', biz: 'banca', needs: { madeira: 2, chapa: 1 }, price: 250, ms: 1 * HOUR },
      { id: 'maq-quiosque', kind: 'maq', biz: 'quiosque', needs: { chapa: 1, circuito: 1 }, price: 600, ms: 2 * HOUR },
      { id: 'maq-lavagem', kind: 'maq', biz: 'lavagem', needs: { motor: 1, cano: 2, chapa: 1 }, price: 1000, ms: 3 * HOUR },
      { id: 'maq-barbearia', kind: 'maq', biz: 'barbearia', needs: { motor: 1, chapa: 1, madeira: 1 }, price: 1500, ms: 3 * HOUR },
    ],
  },
  // v84: a Feira da Ladra. Os jogadores vendem uns aos outros materiais, componentes, colecionáveis e objetos.
  // A preço fixo (por unidade, compra-se uma parte ou tudo; anúncio de 48 h) ou em leilão (24 h, lance mínimo, cada lance
  // 5% acima do anterior; um lance nos últimos 10 minutos empurra o fim para 10 minutos depois dele). O vendedor paga 5% do que vende.
  // Contra passar dinheiro entre contas: o preço fica entre 0,3× e 3× o de referência (objetos: o da loja; colecionáveis: a parte
  // de cada peça no que o museu paga pelo conjunto; materiais: ref; componentes: os euros da receita mais os materiais), os
  // lances também param nos 3×, e só se negoceia a partir do nível minLvl. Quem ainda tem coisas por levantar conta-as nos 10.
  feira: { feeBp: 500, listMs: 48 * HOUR, auctionMs: 24 * HOUR, stepBp: 500, bidEndMs: 10 * MIN, maxOpen: 10, maxPrice: 1_000_000_000, maxN: 999,
    minLvl: 5, loBp: 3000, hiBp: 30000, ref: { madeira: 40, sucata: 40, eletronica: 50, quimicos: 50, cobre: 60, pecas: 60, ferro: 400, bronze: 500, vidro: 600, malha: 900 },
    // e entre as mesmas duas contas (num sentido ou no outro), em 24 h, a diferença para o preço de referência não passa de pairMax
    // (vender caro a uma conta e voltar a comprar barato fazia passar dinheiro sem limite, um ciclo de cada vez). Os lances à frente
    // contam já. Quem licita também não guarda mais de maxOpen coisas na feira (por levantar mais leilões em que vai à frente).
    pairMax: 10_000, acctMax: 30_000, pairMs: 24 * HOUR,
    // v89: pedidos de compra («compro 10 chapas a 55 € cada»). O dinheiro sai do banco ao pedir e fica preso até alguém vender
    // ou o pedido acabar (volta ao banco: um pedido não serve de cofre sem a taxa do banco). Só materiais e colecionáveis.
    orderMs: 72 * HOUR },   // e cada conta, com toda a gente, até acctMax (várias contas, triângulos)
  exam: {
    n: 3, cutBp: 2500, cuts: 2, retryBp: 1250, retryMin: HOUR, retryMax: 12 * HOUR, ttl: 15 * MIN,
    ans: {
      vigilante: [0, 0, 2, 1, 2, 3],
      pesados: [2, 1, 0, 3, 3, 0],
      licenciatura: [1, 1, 0, 1, 2, 0],
      // v81: estudos e artes marciais (um banco por matéria, partilhado pelos 3 níveis)
      medicina: [0, 2, 1, 0, 1, 3],
      arqueologia: [1, 2, 0, 3, 1, 0],   // v85
      direito: [0, 1, 2, 3, 0, 0],
      gestao: [3, 0, 2, 2, 2, 1],
      artes: [3, 2, 2, 2, 0, 2],
      boxe: [3, 3, 0, 3, 2, 0],
      jiujitsu: [1, 3, 1, 1, 0, 1],
      kravmaga: [0, 1, 2, 1, 0, 2],
      especializacao: [3, 2, 3, 3, 1, 3],
    },
  },
  // v81: Universidade. Estudos (medicina, direito, gestão, artes) e artes marciais (boxe, jiu-jitsu, krav maga), cada um com
  // 3 níveis: cada nível é um curso como os outros (pago à cabeça, tempo real, exame de 3 perguntas da matéria) e pede o anterior.
  // O bónus é o do nível mais alto feito: hosp (hospital mais curto), bail (fiança mais barata), biz (negócios rendem mais),
  // burla (golpes de burla rendem mais), atk e def (ataque e defesa), em bp.
  studies: {
    lv: [{ days: 3, price: 1500, level: 5 }, { days: 7, price: 6000, level: 20 }, { days: 14, price: 20000, level: 40 }],
    list: [
      { id: 'medicina', kind: 'st', fx: { hosp: [1000, 2000, 3000] } },
      { id: 'direito', kind: 'st', fx: { bail: [1000, 2000, 3000] } },
      { id: 'gestao', kind: 'st', fx: { biz: [500, 1000, 1500] } },
      { id: 'artes', kind: 'st', fx: { burla: [500, 1000, 1500] } },
      { id: 'boxe', kind: 'ma', fx: { atk: [500, 1000, 1500] } },
      { id: 'jiujitsu', kind: 'ma', fx: { def: [500, 1000, 1500] } },
      { id: 'kravmaga', kind: 'ma', fx: { atk: [300, 600, 1000], def: [300, 600, 1000] } },
      { id: 'arqueologia', kind: 'st', fx: { dig: [100, 200, 300] } },   // v85: abre as escavações; +1, +2, +3 pazadas seguras (em centésimas, como os bp)
    ],
  },
  // v85: escavações clandestinas, à noite, em sítios a sério. Cada sítio pede o nível de Arqueologia (st), custa à cabeça (transporte,
  // material, quem fecha os olhos) e fica vigiado coolMs depois. A escavação é uma grelha size×size com finds achados escondidos
  // (do conjunto do sítio) e taps pazadas. Uma pazada vazia diz quantos achados há nas 8 à volta. Só as primeiras safe são seguras
  // (mais 1, 2 ou 3 com a Arqueologia); depois, cada pazada tem riskBp × (pazadas a mais) de a ronda aparecer: preso jailMin e
  // perde-se o que se achou nessa escavação. Sair a tempo guarda tudo na vitrine. Uma escavação esquecida (ttl) fecha sozinha e
  // guarda o que tinha. (Revisão: 6 seguras tiravam o risco do jogo; e a 6×6 com 4 achados dava a um programa mais do dobro de
  // quem joga à mão: na 5×5 com 5, a mão chega mais perto.)
  dig: {
    size: 5, finds: 5, taps: 8, safe: 1, riskBp: 500, ttl: 30 * MIN, coolMs: 4 * HOUR,
    sites: [
      // v86: rare = o material raro do sítio; rareBp = hipótese de a grelha ter um (como um sexto achado, que vai para o depósito).
      // Em todas: com 35-40% só saía em 6-15% das escavações (a revisão simulou), lento demais para contar.
      { id: 'briteiros', st: 1, price: 500, jailMin: 15, lawyer: 300, rare: 'ferro', rareBp: 10000 },
      { id: 'conimbriga', st: 1, price: 1000, jailMin: 25, lawyer: 700, rare: 'bronze', rareBp: 10000 },
      { id: 'troia', st: 2, price: 2000, jailMin: 40, lawyer: 1800, rare: 'vidro', rareBp: 10000 },
      { id: 'mertola', st: 3, price: 4000, jailMin: 60, lawyer: 3500, rare: 'malha', rareBp: 10000 },   // fragmentos de cotas de malha do período islâmico
    ],
  },
  // v98: caça em 8 reservas pelo mundo, à maneira da do Torn (nível, energia e uma taxa por saída), mas com mira, distância e arma.
  // Cada saída gasta 10 de energia (a do ginásio) e um uso da arma. Dá 3 tiros e 6 movimentos (procurar outro animal ou aproximar).
  // Com licença: paga a taxa, só armas de caça (revólver, caçadeira, carabina, espingarda, sniper), no máximo 3 saídas por reserva
  // por dia de Lisboa, e sem espécies protegidas. Furtiva: sem taxa, qualquer arma de fogo, aparecem as protegidas (valem muito mais);
  // cada tiro pode chamar os guardas (com silenciador, metade), e quem é apanhado vai preso e perde o que caçou nessa saída.
  // Depois de uma saída furtiva, a reserva fica vigiada 6 h.
  // Tiro: hipótese = precisão da arma × 45 + a mira (perfeita 4500, boa 3000, fraca 1500, má 0) + perícia × 20, vezes o alcance
  // (até ao alcance da arma conta tudo; daí até ao dobro desce a direito até zero) e a dificuldade do animal; aves só com caçadeira
  // (as outras armas ficam com 25%). Acertar com ataque abaixo da robustez do animal só o fere (foge). Os perigosos, falhados ou
  // feridos a 60 m ou menos, podem carregar: hospital.
  // Valor: base do animal × (0,5 + tamanho) × a mira (perfeita 100%, boa 90%, fraca 75%, má 60%). Tamanho de 0 a 1 (média de dois
  // sorteios; com perícia, às vezes o melhor de duas médias). Medalha pelo tamanho: bronze 0,55, prata 0,75, ouro 0,9.
  // Perícia de 0 a 100 (em milésimos): cada animal abatido dá xp/20 pontos × (1 − perícia/100)^1,5. Abre as espécies mais difíceis.
  hunt: {
    e: 10, shots: 3, moves: 6, ttl: 20 * MIN, quota: 3, furCool: 6 * HOUR, slack: 1500,
    legalT: ['revolver', 'cacadeira', 'carabina', 'espingarda', 'sniper'],
    nearBp: 6000, minD: 10,
    aim: { base: 1000, perAcc: 14, perSk: 6, min: 1200, max: 2800, q: [['perf', 1000], ['bom', 3000], ['fraco', 6000]] },
    qBp: { perf: 4500, bom: 3000, fraco: 1500, mau: 0 }, valBp: { perf: 10000, bom: 9000, fraco: 7500, mau: 6000 },
    accBp: 45, skBp: 20, birdBp: 2500, minBp: 300, maxBp: 9500, silBp: 5000, chargeD: 60,
    medal: [5500, 7500, 9000], medalResp: [0, 3, 8, 20], firstResp: 2,
    // d: distância em metros; tough: ataque que mata; v: euros (tamanho médio, mira perfeita); wary: hipótese de fugir quando te
    // aproximas; hard: dificuldade do tiro; xp: décimas de perícia; sk: perícia para aparecer; dg e hosp: carga e minutos de hospital;
    // sc: pontos do troféu (do mais pequeno ao maior); prot: protegida (só na furtiva)
    sp: {
      corco: { d: [60, 220], tough: 3000, v: 95, wary: 3000, xp: 10, sc: [80, 140] },
      gamo: { d: [80, 250], tough: 4000, v: 210, wary: 3000, xp: 14, sk: 5, sc: [150, 200] },
      javali: { d: [25, 120], tough: 4000, v: 130, wary: 2000, xp: 12, dg: 1500, hosp: 15, sc: [90, 130] },
      raposa: { d: [40, 160], tough: 2000, v: 50, wary: 3500, hard: 8500, xp: 8, sc: [20, 28] },
      lince: { d: [40, 140], tough: 2500, v: 1900, wary: 5000, hard: 8500, xp: 20, sc: [20, 26], prot: true },
      lagopode: { d: [15, 45], tough: 800, v: 45, wary: 1500, hard: 7000, xp: 6, bird: true, sc: [550, 750] },
      lebre: { d: [30, 140], tough: 1500, v: 50, wary: 3000, hard: 7500, xp: 6, sc: [30, 45] },
      veado: { d: [100, 320], tough: 5000, v: 420, wary: 3500, xp: 16, sk: 10, sc: [160, 230] },
      cabra: { d: [60, 250], tough: 3500, v: 140, wary: 2500, xp: 10, sc: [70, 110] },
      gatobravo: { d: [30, 120], tough: 1500, v: 2600, wary: 5500, hard: 8000, xp: 20, sc: [16, 21], prot: true },
      guanaco: { d: [120, 400], tough: 5000, v: 200, wary: 3000, xp: 12, sc: [40, 60] },
      antilope: { d: [150, 450], tough: 3500, v: 420, wary: 4500, hard: 9000, xp: 18, sk: 15, sc: [45, 70] },
      huemul: { d: [80, 250], tough: 4000, v: 4000, wary: 4000, xp: 25, sc: [60, 90], prot: true },
      peru: { d: [20, 70], tough: 1500, v: 40, wary: 3000, hard: 8000, xp: 8, bird: true, sc: [50, 75] },
      veadomula: { d: [100, 380], tough: 5000, v: 170, wary: 3000, xp: 14, sc: [140, 210] },
      wapiti: { d: [150, 500], tough: 8000, v: 420, wary: 3000, xp: 20, sk: 15, sc: [280, 400] },
      carneiro: { d: [200, 550], tough: 7000, v: 680, wary: 4500, xp: 26, sk: 30, sc: [150, 200] },
      puma: { d: [40, 160], tough: 6000, v: 340, wary: 4500, hard: 9000, xp: 22, sk: 20, dg: 3000, hosp: 40, sc: [13, 16] },
      grizzly: { d: [50, 200], tough: 11000, v: 4200, wary: 2500, xp: 35, dg: 5000, hosp: 90, sc: [21, 26], prot: true },
      sambar: { d: [80, 300], tough: 7000, v: 560, wary: 4000, xp: 20, sk: 15, sc: [190, 260] },
      camelo: { d: [150, 450], tough: 9000, v: 380, wary: 2000, xp: 14, sc: [400, 600] },
      bufaloagua: { d: [50, 200], tough: 13000, v: 1050, wary: 2000, xp: 26, sk: 30, dg: 3500, hosp: 60, sc: [90, 130] },
      crocodilo: { d: [30, 120], tough: 12000, v: 6400, wary: 3000, xp: 35, dg: 4500, hosp: 90, sc: [400, 600], prot: true },
      caribu: { d: [150, 500], tough: 8000, v: 360, wary: 3000, xp: 16, sc: [330, 450] },
      lobo: { d: [80, 300], tough: 5000, v: 300, wary: 5000, hard: 9000, xp: 20, dg: 1500, hosp: 30, sc: [14, 18] },
      alce: { d: [80, 350], tough: 12000, v: 850, wary: 2500, xp: 24, sk: 20, dg: 2000, hosp: 60, sc: [180, 240] },
      kodiak: { d: [60, 250], tough: 15000, v: 1500, wary: 3000, xp: 34, sk: 40, dg: 5500, hosp: 120, sc: [26, 31] },
      ursopolar: { d: [80, 300], tough: 15000, v: 8000, wary: 3000, xp: 40, dg: 6000, hosp: 120, sc: [24, 29], prot: true },
      marmota: { d: [50, 220], tough: 2500, v: 70, wary: 4000, hard: 7500, xp: 8, sc: [5, 8] },
      gazela: { d: [200, 600], tough: 5000, v: 520, wary: 4500, hard: 9000, xp: 18, sc: [25, 35] },
      ibex: { d: [250, 700], tough: 9000, v: 1300, wary: 4500, xp: 28, sk: 25, sc: [100, 140] },
      argali: { d: [300, 800], tough: 11000, v: 3000, wary: 5000, xp: 38, sk: 50, sc: [150, 200] },
      leopardoneves: { d: [150, 500], tough: 8000, v: 11000, wary: 5500, hard: 8500, xp: 45, dg: 2500, hosp: 60, sc: [14, 17], prot: true },
      facoquero: { d: [30, 150], tough: 4000, v: 300, wary: 2500, xp: 12, dg: 1500, hosp: 20, sc: [25, 40] },
      impala: { d: [100, 300], tough: 4500, v: 450, wary: 3500, xp: 14, sc: [55, 70] },
      kudu: { d: [120, 350], tough: 9000, v: 1500, wary: 4000, xp: 26, sk: 25, sc: [120, 155] },
      bufalo: { d: [40, 150], tough: 16000, v: 4000, wary: 2500, xp: 40, sk: 50, dg: 6000, hosp: 120, sc: [95, 125] },
      rinoceronte: { d: [40, 180], tough: 18000, v: 19000, wary: 3000, xp: 45, dg: 5000, hosp: 120, sc: [60, 100], prot: true },
    },
    // fee: taxa da licença; ranger: hipótese de cada tiro furtivo chamar os guardas; jail: minutos de prisão; lawyer: fiança inteira
    sites: [
      { id: 'florestanegra', level: 5, fee: 50, ranger: 1000, jail: 15, lawyer: 400, sp: [['corco', 40], ['javali', 30], ['raposa', 20], ['gamo', 10]], prot: [['lince', 6]] },
      { id: 'highlands', level: 8, fee: 70, ranger: 1000, jail: 20, lawyer: 700, sp: [['lagopode', 30], ['lebre', 25], ['cabra', 25], ['veado', 20]], prot: [['gatobravo', 6]] },
      { id: 'patagonia', level: 12, fee: 100, ranger: 1100, jail: 30, lawyer: 1200, sp: [['lebre', 25], ['guanaco', 30], ['javali', 20], ['veado', 15], ['antilope', 10]], prot: [['huemul', 6]] },
      { id: 'rochosas', level: 16, fee: 150, ranger: 1200, jail: 40, lawyer: 2000, sp: [['peru', 25], ['veadomula', 30], ['wapiti', 25], ['puma', 10], ['carneiro', 10]], prot: [['grizzly', 6]] },
      { id: 'outback', level: 20, fee: 200, ranger: 1200, jail: 50, lawyer: 3000, sp: [['cabra', 25], ['javali', 30], ['camelo', 15], ['sambar', 20], ['bufaloagua', 10]], prot: [['crocodilo', 6]] },
      { id: 'alasca', level: 25, fee: 250, ranger: 1300, jail: 60, lawyer: 4500, sp: [['lobo', 25], ['caribu', 35], ['alce', 25], ['kodiak', 15]], prot: [['ursopolar', 6]] },
      { id: 'mongolia', level: 30, fee: 320, ranger: 1400, jail: 90, lawyer: 7000, sp: [['marmota', 30], ['gazela', 30], ['ibex', 25], ['argali', 15]], prot: [['leopardoneves', 5]] },
      { id: 'limpopo', level: 35, fee: 400, ranger: 1500, jail: 120, lawyer: 10000, sp: [['facoquero', 30], ['impala', 35], ['kudu', 25], ['bufalo', 10]], prot: [['rinoceronte', 5]] },
    ],
  },
  courses: [
    { id: 'vigilante', price: 570, days: 2 },
    { id: 'pesados', price: 1500, days: 4 },            // carta de pesados e curso
    { id: 'licenciatura', price: 3 * 697, days: 21 },   // três propinas de 697 €
    { id: 'especializacao', price: 4000, days: 30, level: 40, needs: 'direito1' },   // v81: o estágio de advogado pede Direito (era a licenciatura de enfermagem)
  ],
  // a multa/fiança de cada golpe (fine) paga-se proporcional ao tempo que falta

  // Discoteca: só se compra se a energia não passar do máximo e o vício não passar do limite.
  // energia por vício melhora nos consumos caros; os baratos servem para o início (1 $ por ponto de energia)
  // a: quanto vicia. Com 100 de limite, a coca dá 33 doses (990 de stamina) antes de ser preciso desintoxicar ou esperar.
  // Droga a preços reais de rua (o grama, o comprimido, a dose). Toma-se pelo efeito; já não dá stamina (essa é refillBar).
  drugs: [
    { id: 'cerveja', fam: 'bar', e: 0, a: 1, price: 3, fx: [{ k: 'bust', bp: 1000, ms: 10 * MIN }] },
    { id: 'erva', fam: 'leve', e: 0, a: 2, price: 6, fx: [{ k: 'bust', bp: 3000, ms: 10 * MIN }] },
    { id: 'cogumelos', fam: 'leve', e: 0, a: 2, price: 8, fx: [{ k: 'I', bp: 1000, ms: 10 * MIN }] },
    { id: 'ecstasy', fam: 'festa', e: 0, a: 3, price: 7, fx: [{ k: 'C', bp: 1000, ms: 10 * MIN }] },
    { id: 'speed', fam: 'festa', e: 0, a: 3, price: 10, fx: [{ k: 'loot', bp: 1500, ms: 10 * MIN }] },
    { id: 'lsd', fam: 'festa', e: 0, a: 2, price: 8, fx: [{ k: 'I', bp: 2000, ms: 15 * MIN }] },
    { id: 'coca', fam: 'pesada', e: 0, a: 3, price: 35, fx: [{ k: 'C', bp: 1500, ms: 15 * MIN }, { k: 'biz', bp: 1000, ms: 4 * HOUR }] },   // v89: os negócios rendem +10% durante 4 h (antes: +10% em tudo o que estava guardado, ao recolher)
    { id: 'cristal', fam: 'pesada', e: 0, a: 3, price: 60, fx: [{ k: 'F', bp: 2000, ms: 15 * MIN }] },
    { id: 'heroina', fam: 'pesada', e: 0, a: 3, price: 17, fx: [{ k: 'T', bp: 2500, ms: 20 * MIN }] },
    // juntas mais tarde: ficam no fim da lista para os armazéns já guardados não trocarem de droga (o ecrã mostra-as por preço)
    { id: 'absinto', fam: 'bar', e: 0, a: 1, price: 15, fx: [{ k: 'C', bp: 500, ms: 10 * MIN }] },
    { id: 'poppers', fam: 'festa', e: 0, a: 1, price: 10, fx: [{ k: 'loot', bp: 800, ms: 5 * MIN }] },
    { id: 'haxixe', fam: 'leve', e: 0, a: 2, price: 5, fx: [{ k: 'bust', bp: 3500, ms: 12 * MIN }] },
    { id: 'ketamina', fam: 'festa', e: 0, a: 3, price: 30, fx: [{ k: 'bust', bp: 4000, ms: 15 * MIN }] },
    { id: 'crack', fam: 'pesada', e: 0, a: 4, price: 5, fx: [{ k: 'F', bp: 2500, ms: 10 * MIN }, { k: 'loot', bp: 1000, ms: 10 * MIN }] },
    { id: 'oxi', fam: 'pesada', e: 0, a: 3, price: 9, fx: [{ k: 'T', bp: 2000, ms: 20 * MIN }] },
  ],
  // efeitos temporários: F, I, C, T sobem a stat; loot = saque dos golpes; biz = recolhas dos negócios; bust = menos prisão ao falhar
  fxKinds: ['F', 'I', 'C', 'T', 'loot', 'biz', 'bust'],
  // profissão: escolhe-se uma vez por ronda
  classes: [
    { id: 'ladrao', lootBp: 1500, colBp: 5000 }, // +15% de saque; v90: +50% de hipótese de achar peças raras nos golpes
    { id: 'vigarista', bustCutBp: 2500, bailCutBp: 5000 }, // menos prisão, fiança a metade
    { id: 'traficante', drugCutBp: 3000, fxMoreBp: 10000, capPlus: 15 }, // drogas mais baratas, efeitos a dobrar, mais limite de vício
    { id: 'empresario', bizBp: 2000, feeCutBp: 5000 }, // negócios rendem mais, banco a metade
    { id: 'matador', atkBp: 2000, pvpBp: 2500 }, // ataque e respeito nas lutas
    { id: 'seguranca', defBp: 2500, hospCutBp: 5000 }, // defesa, hospital a metade
    { id: 'chulo', hkCutBp: 3000, sickCutBp: 6000, broBp: 2500 }, // putas mais baratas, menos doenças; v90: o bordel rende +25%
    { id: 'contrabandista', seizeCutBp: 3000, cargoBp: 2500 }, // v89: menos 30% de apreensões no porto e no avião; v90: cargas 25% maiores
    // v90: a cave e a feira também têm o seu ofício (antes nenhuma profissão tocava nelas)
    { id: 'armeiro', craftCutBp: 3000, recipeCutBp: 2500 }, // a bancada da cave trabalha 30% mais depressa; receitas 25% mais baratas
    { id: 'recetador', fenceBp: 3000, feiraFeeCutBp: 5000 }, // o recetador paga +30% pelo equipamento; a taxa da feira fica a metade
    // de elite: só com respeito (conta o máximo que já tiveste na ronda). Juntam dois ofícios e dão mais do que os de rua.
    { id: 'mestre', need: 1000, lootBp: 2000, bustCutBp: 1500 },
    { id: 'blindado', need: 1500, defBp: 3500, hospCutBp: 6000, atkBp: 1000 },
    { id: 'barao', need: 2000, drugCutBp: 4500, fxMoreBp: 15000, capPlus: 25 },
    { id: 'magnata', need: 3000, bizBp: 3000, feeCutBp: 8000, seizeCutBp: 2000 },
    { id: 'carniceiro', need: 4000, atkBp: 3000, pvpBp: 4000, hospCutBp: 2500 },
    { id: 'padrinho', need: 6000, lootBp: 2500, respBp: 1500, bizBp: 1500 },
  ],
  // Aeroporto: mandas um avião buscar mercadoria lá fora. Quanto mais longe, mais rende e maior o risco de a alfândega ficar com tudo.
  // Um voo de cada vez; a carga máxima é a de um contentor do porto. O suborno custa 20% da carga (não volta) e corta o risco a metade.
  // Contas sem suborno (retorno esperado por hora): Tânger +3,6%, Amesterdão +3,7%, Medellín +3,7%, Culiacán +4,0%, Kandahar +4,3%.
  // Com suborno só compensa nas rotas de maior risco: Culiacán +24,4% por voo (em vez de +23,8%) e Kandahar +47% (em vez de +34%).
  air: {
    minAmount: 100, bribeBp: 2000, bribeCutBp: 5000,
    home: { lat: 38.7, lon: -9.1 },
    routes: [
      { id: 'tanger', lat: 35.8, lon: -5.8, ms: 1 * HOUR, gainBp: 900, seizeBp: 500, level: nv(5), r: 2, drug: 'erva' },
      { id: 'amesterdao', lat: 52.4, lon: 4.9, ms: 2 * HOUR, gainBp: 1800, seizeBp: 900, level: nv(7), r: 4, drug: 'ecstasy' },
      { id: 'medellin', lat: 6.2, lon: -75.6, ms: 4 * HOUR, gainBp: 4000, seizeBp: 1800, level: nv(9), r: 7, drug: 'coca' },
      { id: 'culiacan', lat: 24.8, lon: -107.4, ms: 6 * HOUR, gainBp: 6500, seizeBp: 2500, level: nv(11), r: 10, drug: 'cristal' },
      { id: 'kandahar', lat: 31.6, lon: 65.7, ms: 8 * HOUR, gainBp: 10000, seizeBp: 3300, level: nv(13), r: 14, drug: 'heroina' },
    ],
  },
  // Mercadoria: a droga que vem do aeroporto ou do porto entra no armazém ao preço de grosso (80% do preço da discoteca da cidade).
  // Despachar o que está no armazém paga 95% disso: guardar droga nunca sai mais barato do que o banco (3%).
  goods: { wholesaleBp: 8000, dumpBp: 9500 },
  // Discoteca e bordel do jogador. O dono escolhe o preço (80% a 120% do preço da cidade) e o desconto para a gangue.
  // Ninguém paga menos do que o custo (80%): na discoteca é o que a droga custou, no bordel é a parte da puta. O dono nunca perde numa venda.
  // Os clientes da casa (não são jogadores) aparecem por hora: mais barato sai mais depressa, mais caro sai menos (volBp).
  // Discoteca: perH é quanta droga sai por hora, em dinheiro ao preço da cidade; só vende o que houver no armazém.
  // Bordel: cada puta rende perH por hora ao preço da cidade (pela categoria). O caixa de cada casa enche até 12 h de movimento.
  venue: {
    prices: [8000, 9000, 10000, 11000, 12000], volBp: [13000, 11500, 10000, 6000, 3500], gdisc: [0, 1000, 2000, 3000], tillMs: 12 * HOUR, girlBp: 8000,
    // economia nova: cada nível paga-se em cerca de 25 dias. Na discoteca o movimento por hora é o custo a dividir por 120 (o lucro ao
    // preço da cidade é 20% disso); no bordel cada puta contratada rende por hora o que custou a dividir por 600.
    club: { cost: [3000, 9000, 27000, 81000, 240000, 720000, 2100000, 6000000], perH: [25, 75, 225, 675, 2000, 6000, 17500, 50000], resp: [8, 16, 30, 50, 80, 120, 180, 260] },
    bro: { cost: [2400, 12000, 60000, 240000, 750000], rooms: [2, 4, 6, 9, 12], hire: [3000, 12000, 45000, 150000], perH: [5, 20, 75, 250], resp: [8, 20, 45, 80, 130] },
  },
  // mudar de profissão: custa o que rendem 100 de stamina no teu melhor golpe e só dá uma vez a cada 24 h, para ninguém trocar antes de cada jogada
  classChange: { energy: 100, min: 500, coolMs: 24 * HOUR },
  avatars: 62,
  // casino: só com o dinheiro que tens na mão. A casa ganha sempre um pouco (roleta 2,7%, dados 3–4%, blackjack ~1%).
  casino: {
    // em euros: 1 € a 5 € até ao nível 20, até 20 € do 20 ao 39, até 50 € do 40 ao 59, sala reservada até 1 000 € a partir do 60
    minBet: 1, limits: [[1, 5], [20, 20], [40, 50], [60, 1000]], // aposta máxima por jogada = 1000 × 1,6^(nível−1), como o porto
    maxBets: 12, // fichas por jogada na roleta e na roda
    slotMinC: 20, // slots (17/11/2026): aposta mínima de 0,20 €, em cêntimos; o bónus custa sempre buy× a aposta (0,20 € → 20 €), com qualquer aposta até ao máximo do nível
    red: [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36],
    dice: { low: 23, seven: 58, high: 23 }, // quanto volta por cada 10 apostados: 2,3× · 5,8× · 2,3×
    bj: { decks: 6, draw: 24 }, // baralho de 6 baralhos, baralhado a cada mão
    newsMin: 1000, // ganhos a partir daqui vão para o jornal
    maxWinMult: 2500, // nenhuma jogada paga mais de 2500× o que se apostou
    // Roda da Fortuna: 54 casas. Número n paga n para 1; as casas de bónus abrem um jogo que dá um multiplicador.
    // Em cada volta pode aparecer um multiplicador extra numa casa (o «multiplicador do topo»).
    // Contas (exatas, já com o teto de 2500×): as oito apostas devolvem todas 96,5% (antes iam de 94,3% na bola a 96,1% no 1).
    // Os minijogos têm mínimo alto para nunca saberem a pouco: moeda ×3, caixas e bola ×10, Crazy ×15.
    wheel: {
      // mesma ordem e mesmas quantidades de uma roda de casino ao vivo: um bónus de 6 em 6 casas
      segs: ['louca', '1', '2', '5', '1', '2', 'bola', '1', '5', '1', '2', '1', 'moeda', '1', '2', '1', '10', '2', 'caixas', '1', '2', '1', '5', '1', 'moeda', '1', '5', '2', '10', '1',
        'bola', '1', '2', '5', '1', '2', 'moeda', '1', '10', '1', '5', '1', 'caixas', '1', '2', '5', '1', '2', 'moeda', '2', '1', '10', '2', '1'],
      spots: ['1', '2', '5', '10', 'moeda', 'caixas', 'bola', 'louca'],
      num: { 1: 1, 2: 2, 5: 5, 10: 10 },
      // Multiplicador do topo (15/11/2026): sai quase sempre numa casa (98,9% das voltas; antes 47%) e, em troca, é mais baixo em média (×3,04; antes ×5,45).
      // Acerta na casa que sai em 18,9% das voltas (1 em 5,3; antes 8,7%, 1 em 11). O retorno de cada aposta fica igual: 96,5%.
      top: { 1: 2359, 2: 2471, 5: 1415, 10: 993, moeda: 936, caixas: 780, bola: 519, louca: 443 }, // em 10 000 voltas: quantas vezes o multiplicador do topo cai em cada casa
      topMult: [[2, 560], [3, 240], [4, 90], [5, 55], [7, 28], [10, 18], [15, 5], [20, 2], [25, 1], [50, 1]],
      moeda: [[3, 250], [5, 240], [7, 150], [10, 140], [15, 90], [20, 50], [25, 30], [50, 30], [100, 10]],
      caixas: [[10, 408], [15, 240], [20, 150], [25, 100], [50, 78], [75, 30], [100, 15], [200, 7]],
      bola: [[10, 363], [15, 240], [20, 150], [25, 90], [50, 73], [100, 37], [200, 10]],
      // Crazy: roda de 64 casas com três flappers (verde, azul, amarelo). O jogador escolhe um antes de ela rodar e cada flapper lê a casa que tem
      // por baixo (flaps: desvio em casas a partir do do meio). 'D' é DOUBLE e 'T' é TRIPLE: todos os valores da roda dobram ou triplicam e ela
      // roda outra vez, só para quem lá caiu, as vezes que sair (até ao teto de 2500×). 56 valores (15×11, 20×11, 25×12, 35×8, 50×8, 100×4, 200×2),
      // 6 DOUBLE e 2 TRIPLE, nunca dois flappers numa destas casas na mesma volta. Em média dá ×47,1 (a roda antiga dava ×44,7, sem escolha).
      louca: { flaps: [-5, 0, 5], segs: [20, 25, 35, 'D', 50, 15, 100, 25, 20, 35, 15, 'D', 50, 25, 15, 20, 200, 35, 'T', 25, 100, 50, 15, 20, 35, 25, 15, 'D', 50, 20, 25, 15,
        100, 25, 20, 'D', 50, 15, 25, 35, 20, 15, 'D', 50, 20, 25, 35, 15, 200, 20, 25, 'T', 50, 15, 35, 20, 25, 100, 15, 'D', 50, 35, 20, 25] },
      bolaSlots: 12, caixasN: 36,
    },
    // Slots. «scatter»: 6×5, 8 ou mais iguais em qualquer sítio pagam; as vitórias caem e entram símbolos novos; as esferas somam-se e
    // multiplicam o prémio da jogada. «cluster»: 7×7, grupos de 5+ iguais encostados; cada casa onde rebenta um símbolo fica marcada e
    // depois multiplica (×2, ×4 … ×1024). Compra de bónus: paga-se N vezes a aposta e as rodadas grátis começam logo.
    // Prémios em centésimos da aposta. As quatro slots estão afinadas por simulação (milhões de jogadas cada) para o mesmo perfil:
    // bónus natural a sair 1 vez em cada 400 jogadas, jogo base a devolver cerca de 72%, retorno total entre 96% e 96,5%,
    // e a compra de bónus (100× a aposta) a devolver em média 96 a 96,5×. O que muda de umas para as outras é o tema e a forma de pagar, não as odds.
    // Todos os símbolos rebentam (15/11/2026): antes os pesos eram tão desiguais que só os 4 mais comuns juntavam 8 iguais (a coroa do Chefão rebentava
    // 1 vez em 15 000 jogadas). Agora os pesos são quase planos e os símbolos normais vêm em pilhas dentro de cada coluna (run: pesos de vir 1, 2 ou 3
    // iguais seguidos; runFree: o mesmo nas rodadas grátis), como nos rolos a sério. O mais comum rebenta 1 vez em cada 9 a 13 jogadas e o mais raro
    // 1 em cada 32 a 76. Os prémios foram refeitos para cada símbolo dar a mesma fatia do retorno: os comuns pagam pouco muitas vezes, os raros pagam
    // 6 a 7 vezes mais, menos vezes. As odds de cima (bónus 1 em 400, retorno e compra) ficaram iguais.
    // accFree: nas rodadas grátis as esferas juntam-se num multiplicador que fica até ao fim. accAll: juntam-se todas as que caem, mesmo numa rodada
    // sem prémio (antes, 2 em cada 3 esferas das grátis caíam em rodadas sem prémio e perdiam-se). Para o retorno ficar igual, nas grátis caem
    // cerca de um terço das esferas que caíam: o multiplicador final é, em média, o mesmo, mas nenhuma esfera se perde.
    slots: {
      chefao: {
        kind: 'scatter', cols: 6, rows: 5, min: 8, nsym: 10, trig: 4, run: [65, 25, 10],
        // 0 charuto, 1 whisky, 2 ficha, 3 chapéu, 4 relógio, 5 anel, 6 notas, 7 diamante, 8 coroa, 9 barra de ouro, 10 chefão (scatter), 11 esfera
        w: [961, 920, 879, 838, 797, 755, 714, 673, 632, 591, 177, 50],
        wFree: [9608, 9197, 8786, 8376, 7965, 7555, 7144, 6734, 6323, 5912, 1770, 933],   // nas grátis caem menos esferas, mas todas contam (accAll)
        pay: [[38, 95, 228], [44, 111, 265], [51, 130, 312], [62, 157, 379], [76, 189, 454], [94, 236, 564], [119, 295, 709], [145, 362, 868], [185, 464, 1115], [247, 617, 1480]],
        orb: [[2, 300], [3, 200], [4, 120], [5, 100], [6, 60], [8, 50], [10, 40], [12, 25], [15, 20], [20, 15], [25, 10], [50, 5], [100, 2]],
        orbBase: true, accFree: true, accAll: true, scatPay: { 4: 300, 5: 500, 6: 10000 }, free: 15, retrig: [3, 5], maxFree: 60, buy: 100, max: 2500,
      },
      // «Trovão de Zeus 1000»: como os jogos de deuses gregos 6×5 (esferas até ×1000, multiplicador total nas grátis). Prémio máximo 15 000×, compra a 100×.
      zeus: {
        kind: 'scatter', cols: 6, rows: 5, min: 8, nsym: 9, trig: 4, run: [75, 20, 5],
        // 0 gema azul, 1 verde, 2 amarela, 3 roxa, 4 vermelha, 5 cálice, 6 ânfora, 7 lira, 8 elmo, 9 deus (scatter), 10 esfera
        w: [1095, 1042, 990, 937, 884, 832, 779, 727, 674, 165, 40],
        wFree: [10950, 10424, 9897, 9371, 8844, 8318, 7792, 7265, 6739, 1650, 712],   // nas grátis caem menos esferas, mas todas contam (accAll)
        pay: [[31, 76, 182], [37, 91, 220], [45, 111, 267], [56, 139, 335], [71, 177, 424], [89, 224, 538], [119, 297, 714], [158, 395, 947], [221, 551, 1322]],
        orb: [[2, 400], [3, 260], [4, 160], [5, 130], [6, 80], [8, 60], [10, 50], [12, 30], [15, 25], [20, 18], [25, 12], [50, 7], [100, 4], [250, 2], [500, 1], [1000, 1]],
        orbBase: true, accFree: true, accAll: true, scatPay: { 4: 300, 5: 500, 6: 10000 }, free: 15, retrig: [3, 5], maxFree: 60, buy: 100, max: 15000,
      },
      // «Doce Vingança»: doces e fruta 6×5; bombas de ×2 a ×100 só nas grátis, cada jogada com as suas. Prémio máximo 21 175×, compra a 100×.
      doce: {
        kind: 'scatter', cols: 6, rows: 5, min: 8, nsym: 9, trig: 4, run: [75, 20, 5], runFree: [45, 30, 25],
        // 0 kiwi, 1 laranja, 2 pera, 3 cerejas, 4 morango, 5 doce azul, 6 goma verde, 7 rebuçado roxo, 8 coração, 9 queque (scatter), 10 bomba
        w: [1095, 1042, 990, 937, 884, 832, 779, 727, 674, 163, 0],
        wFree: [1483, 1412, 1340, 1269, 1198, 1126, 1055, 984, 913, 163, 394],
        pay: [[58, 146, 351], [70, 176, 422], [86, 215, 516], [107, 268, 643], [135, 338, 812], [176, 439, 1055], [229, 573, 1376], [298, 745, 1787], [417, 1042, 2500]],
        orb: [[2, 300], [3, 220], [4, 150], [5, 120], [6, 80], [8, 60], [10, 50], [12, 30], [15, 25], [20, 18], [25, 12], [50, 5], [100, 2]],
        orbBase: false, accFree: false, scatPay: { 4: 300, 5: 500, 6: 10000 }, free: 10, retrig: [3, 5], maxFree: 60, buy: 100, max: 21175,
      },
      // «Rebuçado Louco 1000»: grupos 7×7 com casas que multiplicam até ×1024 (nas grátis ficam). Prémio máximo 25 000×, compra a 100× ou 895× (super: todas as casas já com multiplicador).
      rebucado: {
        kind: 'cluster', cols: 7, rows: 7, min: 5, nsym: 7, trig: 3, run: [96, 4],
        // 0 cristal azul, 1 marshmallow, 2 estrela, 3 cubo roxo, 4 minhoca verde, 5 urso laranja, 6 urso vermelho, 7 máquina de pastilhas (scatter)
        w: [1249, 1185, 1121, 1057, 993, 929, 865, 40],
        wFree: [2638, 2503, 2368, 1057, 993, 929, 865, 40],
        // grupos de 5, 6, 7 … 14 e 15 ou mais
        pay: [[67, 85, 100, 134, 167, 252, 336, 504, 673, 1009, 1683], [82, 102, 122, 163, 204, 306, 409, 613, 818, 1227, 2046], [101, 128, 153, 204, 255, 383, 511, 766, 1022, 1533, 2556], [127, 161, 192, 257, 320, 482, 644, 964, 1286, 1929, 3217], [163, 206, 245, 327, 408, 614, 819, 1227, 1637, 2456, 4094], [209, 265, 315, 421, 524, 789, 1054, 1578, 2105, 3159, 5268], [273, 344, 410, 548, 683, 1028, 1372, 2055, 2740, 4112, 6857]],
        spotMax: 1024, superSpots: [[2, 70], [4, 20], [8, 8], [16, 2]], fs: { 3: 10, 4: 12, 5: 15, 6: 20, 7: 30 }, maxFree: 60, buy: 100, superBuy: 895, max: 25000, // compra super: cada casa começa com ×2 (70%), ×4 (20%), ×8 (8%) ou ×16 (2%). Em 50 000 compras simuladas devolve em média cerca de 862× a aposta, por isso custa 895
      },
    },
  },
  // Gangues. Criar custa dinheiro e pede nível; o cofre só recebe (nunca devolve), para não servir de ponte entre contas.
  // A sede dá lugares e mais saque nos golpes a todos os membros; a armaria dá mais ataque e defesa nas lutas.
  gang: {
    createCost: 25000, minLevel: nv(4), baseMembers: 4, perSede: 2, maxLevel: 5,
    sede: [15000, 50000, 150000, 450000],                 // preço para passar a sede do nível 1 ao 2, do 2 ao 3…
    armaria: [8000, 25000, 80000, 250000, 750000],      // preço de cada nível da armaria (começa em 0)
    lootBpPer: 200, fightBpPer: 300,                          // +2% de saque por nível de sede; +3% de ataque e defesa por nível de armaria
    donateMin: 100, rejoinMs: 1 * HOUR, chatMax: 200,
    // Golpes em grupo: um membro abre o pedido e os outros alinham (cada um paga a stamina ao alinhar). O pedido não tem prazo: fica aberto
    // até haver gente que chegue, ou até ser cancelado por quem o abriu, pelo chefe ou por quem tem cargo (ver roles). Quando a equipa
    // fica completa começa a última chamada (opMs nos golpes, hitMs nas tareias) para ainda entrar mais gente, e no fim vai-se;
    // quem abriu ou quem tem cargo pode mandar avançar logo. Quem alinhou pode sair do pedido quando quiser (a stamina volta).
    // A dificuldade compara-se com a soma das stats de quem foi; o saque é por cabeça. Não há limite por dia: quem trava é a stamina
    // de cada um e a pausa de 5 minutos da gangue entre operações. Contas: por ponto de stamina, um golpe em grupo dá no máximo
    // cerca de 1,9× o melhor golpe a solo (3150 contra 1600), e só com 5 pessoas em linha numa gangue com a sede no nível 5.
    // Os novos entram no fim da lista para os números dos antigos não mudarem; no ecrã aparecem por ordem de dificuldade.
    heists: [
      { id: 'carrinha', need: 2, sede: 1, e: 20, D: 150, min: 224, max: 336, r: 14, jailMin: 6, bailAs: 4, w: { I: 40, F: 60, C: 0 } },
      { id: 'casino', need: 3, sede: 2, e: 30, D: 450, min: 492, max: 738, r: 22, jailMin: 9, bailAs: 5, w: { I: 50, F: 0, C: 50 } },
      { id: 'banco', need: 4, sede: 3, e: 40, D: 1000, min: 1395, max: 1953, r: 30, jailMin: 10, bailAs: 5, w: { I: 40, F: 30, C: 30 } },
      { id: 'ourivesaria', need: 2, sede: 1, e: 25, D: 320, min: 338, max: 507, r: 18, jailMin: 7, bailAs: 4, w: { I: 60, F: 10, C: 30 } },
      { id: 'comboio', need: 3, sede: 2, e: 35, D: 750, min: 845, max: 1199, r: 26, jailMin: 9, bailAs: 5, w: { I: 30, F: 60, C: 10 } },
      { id: 'leilao', need: 3, sede: 3, e: 35, D: 900, min: 1080, max: 1474, r: 28, jailMin: 9, bailAs: 5, w: { I: 40, F: 0, C: 60 } },
      { id: 'aeroporto', need: 4, sede: 4, e: 45, D: 1500, min: 1789, max: 2415, r: 34, jailMin: 10, bailAs: 5, w: { I: 50, F: 40, C: 10 } },
      { id: 'cartel', need: 5, sede: 5, e: 50, D: 2000, min: 2112, max: 2816, r: 38, jailMin: 10, bailAs: 5, w: { I: 20, F: 70, C: 10 } },
      { id: 'moeda', need: 5, sede: 5, e: 50, D: 2600, min: 2314, max: 3086, r: 42, jailMin: 10, bailAs: 5, w: { I: 50, F: 20, C: 30 } },
    ],
    opMs: 2 * MIN, hitMs: 90 * 1000, opCoolMs: 5 * MIN, opMax: 8,
    // Tareia em grupo: soma-se o ataque de todos (a 85%), o alvo só vai uma vez para o hospital (30 min) e só perde respeito uma vez;
    // cada atacante ganha 70% do que ganharia sozinho, com o mesmo desconto por repetir o alvo.
    hitNeed: 2, hitTeamBp: 8500, hitShareBp: 7000, hitHospBp: 15000,
    // Cargos: o chefe nomeia até 1 subchefe (cargo 2) e 2 capitães (cargo 1); os outros são membros (0) e o chefe vale 3.
    // O número ao lado de cada permissão é o cargo mínimo: aceitar ou recusar pedidos de entrada e cancelar ou mandar avançar
    // um golpe em grupo pedem capitão; expulsar pede subchefe (e só quem está abaixo dele). Cofre, melhorias, cargos,
    // abrir ou fechar a gangue e passar a chefia continuam a ser só do chefe. Se o chefe sair, a chefia vai para o cargo mais alto.
    roles: { max: [0, 2, 1], asks: 1, ops: 1, kick: 2 },
    // Negócios da gangue: cada membro põe o seu dinheiro e ganha só sobre o que ele próprio pôs (ninguém vive à conta dos outros).
    // rateBp: o que rende por hora, em pontos do que está investido. sede: nível da sede preciso. capMult: teto por pessoa = máximo do casino do nível × capMult.
    // O que se ganha por ser em grupo: +5% por cada outro membro que tenha lá pelo menos o mesmo que tu; quem tem menos conta só em proporção
    // (um sócio com metade do teu dá-te +2,5%), até +50%. Assim um rico não puxa por quem pôs pouco, e contas pequenas não dão bónus a ninguém.
    // O dinheiro investido fica no negócio. Ao sair da gangue ou ser expulso volta metade, mais o que estiver por receber.
    // O rendimento fica guardado até 8 h (storageMs), como nos negócios próprios.
    biz: [
      // economia nova: rendem por hora 0,10% a 0,12% do que lá está (2,4% a 2,9% por dia sozinho, até 4,3% com dez sócios ao
      // mesmo nível), para se pagarem em 20 a 30 dias como os negócios; o teto é o nível × 1 000 € × capMult
      { id: 'oficina', sede: 1, rateBp: 10, capMult: 3 },
      { id: 'jogo', sede: 2, rateBp: 11, capMult: 6 },
      { id: 'rota', sede: 3, rateBp: 12, capMult: 12 },
    ],
    bizCapPerLevel: 1000,
    bizMin: 1000, bizCoopBp: 500, bizCoopMax: 5000, bizRefundBp: 5000,
    // Gangue da rua: existe sempre, é chefiada por um bot e entra quem quiser (a partir do nível das gangues), para ninguém ficar sem
    // golpes em grupo, conversa e negócio por não ter gangue. Fica sempre no nível 1 (sem cofre nem melhorias) e não é uma gangue a sério:
    // os membros podem atacar-se uns aos outros, não há tareias em grupo nem desconto nas casas dos outros membros.
    // Quem sai só pode voltar a esta gangue ao fim de 24 h. Como não tem chefe nem cargos, ninguém podia cancelar um pedido de golpe
    // esquecido (e só há um pedido aberto por gangue): o bot cancela o que estiver há opMaxMs à espera sem ter gente que chegue.
    bot: { id: 'rua', name: 'Strays', tag: 'BOT', rejoinMs: 24 * HOUR, roster: 40, opMaxMs: 15 * MIN },
  },
  // casa: cada nível dá respeito e deixa subir as melhorias até esse nível; a melhoria n custa uma parte do preço da casa n
  // Casas (base nova): começa-se numa barraca de 0 € e as outras só se compram; a antiga entra na troca pelo que custou.
  // Sem renda nem despesa. Cada casa dá respeito uma vez, espaços de inventário (slots) e stamina máxima (emax).
  house: {
    tiers: [
      { id: 'barraca', price: 0, resp: 0, slots: 6, emax: 100 }, { id: 'roulotte', price: 6000, resp: 30, slots: 12, emax: 105 },
      { id: 't1interior', price: 54000, resp: 120, slots: 20, emax: 110 }, { id: 't1cidade', price: 183000, resp: 400, slots: 30, emax: 115 },
      { id: 'moradia', price: 600000, resp: 1200, slots: 45, emax: 120 }, { id: 'mansao', price: 3000000, resp: 4000, slots: 80, emax: 130 },
    ],
    ups: [],
  },
  // putas: stamina sem vício; o preço é o da escada de stamina do dia (a mesma das barras), vezes o dela
  hookers: {
    // v74 (17/11): voltar à mesma já não fica mais caro (antes subia 4% por visita). Só a escada do dia mexe no preço, e essa é a das barras:
    // sobe com a stamina comprada hoje e desce uma barra a cada 4 horas. stepNum/stepDen ficam 1/1 para os ecrãs abertos na versão antiga.
    // hkN/hkAt continuam a contar as visitas a cada uma (descem uma por hora), sem mexer no preço.
    stepNum: 1, stepDen: 1, maxSteps: 60, coolMs: 1 * HOUR,
    sickCutBp: 1500, // doente: −15% em todas as stats até se tratar
    cureMin: 40, cureValueBp: 1000, // tratar custa o que rendem 10 de stamina
    // rara: ela mete-te a mão (hipótese por categoria, da mais barata à mais cara). A carteira só leva o que tens na mão (o banco está a salvo);
    // telemóvel, relógio e fio custam-te a reposição (sai da mão e depois do banco). Vale um múltiplo do preço da cidade dessa visita e sai do jogo: ninguém o recebe.
    rob: { bp: [150, 110, 70, 40], items: [[['wallet', 1], 50], [['phone', 2], 25], [['watch', 3], 18], [['chain', 5], 7]] },
    list: [
      // quanto mais barata, menos stamina por visita e um pouco mais de risco de doença (no máximo 1%);
      // as de cima custam mais por ponto mas enchem de uma vez e quase sem risco.
      // valueBp: o preço é o da escada de stamina do dia (a mesma das barras a droga) por aquilo que ela dá, vezes isto
      // (80% nas mais baratas, 115% na melhor). A stamina que elas dão sobe essa escada como as barras.
      { id: 'rosinha', tier: 0, e: 8, valueBp: 8000, sickBp: 100 },
      { id: 'marlene', tier: 0, e: 12, valueBp: 8400, sickBp: 90 },
      { id: 'sandra', tier: 0, e: 18, valueBp: 8600, sickBp: 80 },
      { id: 'katia', tier: 1, e: 28, valueBp: 9000, sickBp: 60 },
      { id: 'jessica', tier: 1, e: 36, valueBp: 9300, sickBp: 50 },
      { id: 'bianca', tier: 1, e: 45, valueBp: 9500, sickBp: 40 },
      { id: 'valentina', tier: 2, e: 55, valueBp: 9900, sickBp: 30 },
      { id: 'dominique', tier: 2, e: 75, valueBp: 10200, sickBp: 25 },
      { id: 'scarlett', tier: 2, e: 85, valueBp: 10400, sickBp: 20 },
      { id: 'anastasia', tier: 3, e: 95, valueBp: 10800, sickBp: 15 },
      { id: 'isabella', tier: 3, e: 100, valueBp: 11200, sickBp: 10 },
      { id: 'celeste', tier: 3, e: 100, valueBp: 11500, sickBp: 0 },
      // juntas mais tarde: ficam no fim da lista (o ecrã mostra-as por categoria e preço)
      { id: 'lurdes', tier: 0, e: 15, valueBp: 8500, sickBp: 85 },
      { id: 'tatiana', tier: 1, e: 32, valueBp: 9200, sickBp: 55 },
      { id: 'vanessa', tier: 1, e: 40, valueBp: 9400, sickBp: 45 },
      { id: 'kiara', tier: 2, e: 65, valueBp: 10000, sickBp: 28 },
      { id: 'chanel', tier: 2, e: 80, valueBp: 10300, sickBp: 22 },
      { id: 'victoria', tier: 3, e: 98, valueBp: 11000, sickBp: 12 },
    ],
  },
  // prática: cada golpe treina as stats que usa (energia × peso; metade se falhar).
  // Um ponto custa base + perStat × stat atual de prática, por isso ajuda muito no início e menos depois (o ginásio continua mais rápido).
  practice: { base: 1000, perStat: 10, failBp: 5000 },
  // desintoxicação: limpa o vício todo, sem limite de vezes. Preço = pouco menos de um terço do que 100 de energia te rendem
  // (por 100 de vício), +25% por cada uso nas últimas 24 h. Nunca bloqueia: só fica cada vez mais cara.
  // desintoxicar 100 de vício custa o que rendem ~14 de stamina; cada vez no mesmo dia fica 30% mais cara (trava quem quer stamina sem fim)
  // limpar 100 de vício custa o que rendem 10 de stamina; cada uma nas últimas 24 h custa mais 15%.
  // Por volta da 30.ª do dia já custa mais do que tudo o que esse vício deixava ganhar: há sempre um fim.
  // 15/11/2026: o preço volta a baixar ao fim de 30 minutos (antes 24 h). Cada desintoxicação só encarece as dos 30 minutos seguintes;
  // deixou de haver um teto por dia, o travão passa a ser só o preço a subir dentro de cada meia hora.
  detox: { min: 30, windowMs: 30 * MIN, valueDiv: 1000, stepNum: 23, stepDen: 20, maxSteps: 40 },

  // Negócios: rendem por hora para um armazém que enche em 8 h. Cada compra dá respeito uma vez (resp).
  // Cada unidade extra do mesmo tipo custa +50%; máximo 10 de cada tipo.
  storageMs: 8 * HOUR,
  priceStepDiv: 2, // preço seguinte = preço + preço/2
  bizMax: 10,
  statMultDiv: 1000, // rendimento x (1000 + stat) / 1000, com a stat contada até 1000 (máx. x2)
  statMultCap: 1000,
  raid: { chanceBp: 500, lossBp: 5000 },
  // Negócios (base nova): pagam-se em cerca de 30 dias. perH = o que rende por hora (o dia real todo: lavandaria 1 500 €,
  // café 2 000 €, oficina 3 000 €, clube 25 000 €). Valores de jogo (grau D). Plantação e laboratório voltam com os armazéns (passo 6).
  biz: [
    // v99: os de sempre rendem mais (a lavandaria pagava-se em 26 dias; agora em 19), para a escada dos preços fazer sentido
    { id: 'lavandaria', price: 40000, perH: 88, resp: 40, stat: 'C', raid: false, toBank: true },
    { id: 'cafe', price: 60000, perH: 119, resp: 60, stat: 'C', raid: false, toBank: true },
    { id: 'oficina', price: 90000, perH: 162, resp: 90, stat: 'I', raid: false, toBank: true },
    { id: 'clube', price: 800000, perH: 1134, resp: 600, stat: 'C', raid: true, toBank: false },
    // v99 (pedido do Dinis: negócios mais baratos para o início). Acrescentados no fim para não mexer nos índices dos jogadores
    // (o ecrã ordena pelo preço). Os pequenos só deixam ter 3 a 5 unidades (max), para não serem a única coisa que vale a pena.
    // Retorno sem a stat: banca 6 dias, quiosque 9,6, lavagem 12,6, barbearia 15,6, lavandaria 19, café 21, oficina 23, clube 29.
    { id: 'banca', price: 5000, perH: 35, resp: 5, stat: 'C', raid: false, toBank: true, max: 3 },
    { id: 'quiosque', price: 12000, perH: 52, resp: 10, stat: 'I', raid: false, toBank: true, max: 3 },
    { id: 'lavagem', price: 20000, perH: 66, resp: 15, stat: 'T', raid: false, toBank: true, max: 5 },
    { id: 'barbearia', price: 30000, perH: 80, resp: 25, stat: 'C', raid: false, toBank: true, max: 5 },
  ],
  // Contabilista: contrato pago uma vez por ronda. Com ele o armazém dos negócios aguenta 24 h em vez de 8 h;
  // do que passar das 8 h normais (dinheiro que sem ele se perdia) fica com 10%. Nunca tira nada a quem recolhe a horas.
  accountant: { price: 25000, minLevel: nv(3), capMult: 3, feeBp: 1000 },

  // Porto: contentor volta ao fim de 4 h com +30%, ou é apreendido (15%).
  // Porto: cada carregamento tem o seu barco, a sua droga, o seu tempo, o seu lucro e o seu risco de apreensão.
  // Valor esperado de cada um = (1 − risco) × (1 + lucro): entre 2,6% e 3,1% por hora, sempre abaixo do aeroporto (3,6% a 4,3%), porque o porto tem vários lugares.
  // O risco cresce com a duração (menos no submarino, que é lento e discreto): uma viagem curta com muito risco daria de mais a quem corta as apreensões a metade.
  // legacy: os contentores enviados antes de haver carregamentos valem como o porta-contentores (os mesmos +30% e 15%).
  // v89: limite por carregamento 1 000 € + 100 € por nível; um lugar a mais nos níveis 35 e 70 (antes: 1 000 × 1,6 por degrau antigo,
  // que no nível 60 dava 3 M€ por carregamento). Com o aeroporto, rende cerca de um quarto a um terço do que o resto do jogo dá por dia.
  port: { minAmount: 100, capBase: 1000, capPerLevel: 100, slotsEvery: 35, legacy: 3,
    ships: [
      { id: 'pesca', rg: 'lx', level: nv(1), ms: 2 * HOUR, gainBp: 1200, seizeBp: 600, drug: 'erva' },
      { id: 'lancha', rg: 'ag', level: nv(3), ms: 1 * HOUR, gainBp: 800, seizeBp: 500, drug: 'haxixe' },
      { id: 'ferry', rg: 'lx', level: nv(5), ms: 3 * HOUR, gainBp: 2100, seizeBp: 1000, drug: 'ecstasy' },
      { id: 'contentor', rg: 'al', level: nv(7), ms: 4 * HOUR, gainBp: 3000, seizeBp: 1500, drug: 'coca' },
      { id: 'cargueiro', rg: 'lx', level: nv(10), ms: 6 * HOUR, gainBp: 4600, seizeBp: 1900, drug: 'cristal' },
      { id: 'submarino', rg: 'lx', level: nv(13), ms: 8 * HOUR, gainBp: 3700, seizeBp: 900, drug: 'heroina' },
    ] },

  // Três tipos de armas, cada um no seu espaço. Compram-se por ordem, uma de cada vez, e a anterior não se vende nem volta.
  // level: nível mínimo para comprar (sem ele, qualquer nível).
  // weapons (lutas): bp = ataque a mais, em pontos da Força.
  weapons: [
    { id: 'soqueira', price: 20, bp: 1000 },
    { id: 'navalha', price: 25, bp: 2500 },
    { id: 'pistola', price: 1750, bp: 5000 },
    { id: 'cacadeira', price: 2500, bp: 8000 },
    { id: 'metralhadora', price: 6000, bp: 12000 },
    { id: 'sniper', price: 9000, bp: 17000 },
  ],
  // tools (golpes a solo): str = força que se soma à pontuação de todos os golpes a solo (conta também para os desbloquear).
  // É força fixa e não percentagem: cada ferramenta vale cerca de +28% no nível em que abre e cada vez menos daí para cima.
  // Assim as baratas não dão quase nada a quem já é forte, e nenhuma mexe no teto do fim do jogo (95% de hipótese).
  // Preços: o que a ferramenta rende a mais do que a anterior paga-a em 1 a 4 dias de golpes (720 de stamina por dia) no nível em que abre.
  tools: [
    { id: 'pedecabra', price: 20, str: 2, level: nv(1) },
    { id: 'gazuas', price: 40, str: 3, level: nv(3) },
    { id: 'taser', price: 60, str: 5, level: nv(5) },
    { id: 'revolver', price: 900, str: 9, level: nv(7) },
    { id: 'serrada', price: 1500, str: 16, level: nv(9) },
    { id: 'macarico', price: 400, str: 27, level: nv(11) },
    { id: 'explosivos', price: 3000, str: 48, level: nv(13) },
    { id: 'broca', price: 5000, str: 84, level: nv(15) },
  ],
  // gweapons (golpes em grupo): str = força que se soma ao que tu puxas num golpe da gangue (e por isso também à tua parte do saque).
  // Mesma escada das ferramentas; começam no nível das gangues. Preços: 2 a 5 dias de golpes em grupo com metade da stamina do dia.
  gweapons: [
    { id: 'taco', price: 40, str: 3, level: nv(4) },
    { id: 'catana', price: 60, str: 5, level: nv(5) },
    { id: 'molotov', price: 80, str: 9, level: nv(7) },
    { id: 'assalto', price: 3000, str: 16, level: nv(9) },
    { id: 'lancagranadas', price: 8000, str: 27, level: nv(11) },
    { id: 'pesada', price: 12000, str: 48, level: nv(13) },
    { id: 'bazuca', price: 20000, str: 84, level: nv(15) },
    { id: 'morteiro', price: 30000, str: 147, level: nv(17) },
  ],
  armors: [
    { id: 'cabedal', price: 150, bp: 1000 },
    { id: 'colete', price: 600, bp: 2500 },
    { id: 'balistico', price: 1200, bp: 5000 },
    { id: 'kevlar', price: 2500, bp: 8000 },
    { id: 'blindado', price: 6000, bp: 12000 },
    { id: 'titanio', price: 15000, bp: 17000 },
  ],
  // Guardas: compram-se sempre para cima, como as armas. bp: defesa a mais nas lutas (soma-se aos bónus da casa e da gangue).
  // block: quanto tiram à pontaria de um assassino a soldo (ver hitman).
  guards: [
    { id: 'chihuahua', price: 300, bp: 300, block: 500 },
    { id: 'pitbull', price: 1200, bp: 800, block: 1500 },
    { id: 'porteiro', price: 5000, bp: 1500, block: 2500 },
    { id: 'guardacostas', price: 20000, bp: 2500, block: 4000 },
    { id: 'comando', price: 60000, bp: 3500, block: 5500 },
    { id: 'escolta', price: 150000, bp: 5000, block: 7000 },
  ],
  // Assassino a soldo: paga-se para mandar alguém para o hospital sem dar a cara e sem gastar stamina (dá para encomendar da cama do hospital).
  // Ninguém perde a conta. Se acerta: o alvo fica 1 h no hospital, perde 1,5% do respeito e 10% do dinheiro na mão (não vai para ninguém),
  // e fica 12 h a salvo de outros assassinos. Quem paga não ganha respeito nem dinheiro: é só para atrasar um rival.
  // Pontaria: 90% menos o «block» dos guardas do alvo (no mínimo 15%). Se falha, o dinheiro perde-se e o alvo fica a saber quem pagou.
  // Travões: preço = 100 por ponto de respeito do alvo (mínimo 5000), 3 encomendas por dia, só a partir do nível 5, e as regras das lutas
  // (alvo com pelo menos 25% do teu respeito, nada de jogadores novos, da tua gangue, no hospital, presos ou protegidos).
  hitman: { minLevel: nv(5), priceMin: 2000, pricePerRespect: 10, baseBp: 9000, minBp: 1500, hospMs: 60 * MIN, respBp: 150, cashBp: 1000, immuneMs: 12 * HOUR, perDay: 3 },

  pvp: {
    energy: 20,
    minTargetBp: 2500, // só se ataca quem tem >= 25% do teu respeito
    // ganho = (4 + nível do atacante) x raiz(respeito do alvo / respeito do atacante), com a razão entre 1/4 e 4
    gainBase: 12,
    ratioMinBp: 2500, ratioMaxBp: 40000,
    lossDiv: 2, // quem perde a luta perde metade do que o outro ganharia
    defendGain: 2, // quem se defende com sucesso ganha 2
    beatHospMs: 20 * MIN,
    mugHospMs: 10 * MIN,
    mugBp: 2500, // assalto leva 25% do dinheiro na mão e do que está por recolher nos negócios ilegais, na discoteca e no bordel (o banco e o cofre de casa ficam a salvo)
    protectMs: 30 * MIN, // proteção depois de sair do hospital
    // v89: quem ainda está a começar (abaixo do nível 10) só pode ser atacado por quem não tem mais do triplo da força dele
    // (o respeito sozinho deixava contas com pouco respeito e muita força, do ginásio e das armas, caçar novatos)
    newbieLevel: 10, newbiePowerX: 3,
    maxHospPerWindow: 4, // ninguém é mandado para o hospital mais de 4 vezes em 24 h (regra fixa)
    windowMs: 24 * HOUR,
  },
  // sair do hospital: por cada minuto que falta, o mais barato de (5 × nível) e (um quarto do que rende 1 de stamina)
  medicPerMin: 5, medicValueBp: 2500,

  bank: { feeBp: 300 }, // depositar custa 3%

  // Luxos: dão respeito uma vez e ficam no perfil. Cada compra custa o dobro da anterior.
  // Luxo acima da mansão: compra-se pela ordem, sem despesa, e fica à vista no perfil. Dá respeito uma vez: a raiz quadrada do preço.
  luxury: { list: [{ id: 'relogio', price: 12000 }, { id: 'carrobom', price: 25700 }, { id: 'lancha', price: 80000 }, { id: 'porsche', price: 200263 },
    { id: 'helicoptero', price: 550000 }, { id: 'iate', price: 2500000 }, { id: 'jato', price: 4500000 }, { id: 'quinta', price: 6000000 },
    { id: 'palacete', price: 15000000 }, { id: 'ilha', price: 40000000 }] },

  // Níveis pelo maior respeito já alcançado (o nível nunca desce). Índice = nível - 1. Ver LEVELS e TIERS lá em cima.
  levels: LEVELS,
  tiers: TIERS,
};

// v81: cada nível de um estudo é um curso como os outros (ids medicina1, medicina2, medicina3…), com o banco de perguntas da matéria
for (const st of CFG.studies.list) CFG.studies.lv.forEach((L, k) => CFG.courses.push({ id: st.id + (k + 1), of: st.id, lv: k + 1, kind: st.kind, bank: st.id,
  price: L.price, days: L.days, level: L.level, ...(k ? { needs: st.id + k } : {}) }));

// Objetivos: uma cadeia, um de cada vez. tipo → de onde vem o progresso (ver missionHave no motor).
CFG.missions = [
  { id: 'first', type: 'wins', need: 1, cash: 50 },
  { id: 'wins5', type: 'wins', need: 5, cash: 100 },
  { id: 'train3', type: 'trains', need: 3, cash: 100 },
  { id: 'refill1', type: 'refills', need: 1, cash: 150 },
  { id: 'lvl3', type: 'level', need: nv(3), cash: 200 },
  { id: 'tier2', type: 'tier', need: 2, cash: 300 },
  { id: 'wins25', type: 'wins', need: 25, cash: 500 },
  { id: 'weapon', type: 'gear', need: 1, cash: 300 },
  { id: 'lvl5', type: 'level', need: nv(5), cash: 600 },
  { id: 'shift1', type: 'shifts', need: 1, cash: 800 },
  { id: 'biz1', type: 'biz', need: 1, cash: 2000 },
  { id: 'collect1', type: 'collects', need: 1, cash: 800 },
  { id: 'tier4', type: 'tier', need: 4, cash: 2000 },
  { id: 'fight1', type: 'pvpWins', need: 1, cash: 1000 },
  { id: 'port1', type: 'ports', need: 1, cash: 1000 },
  { id: 'wins100', type: 'wins', need: 100, cash: 2500 },
  { id: 'lvl8', type: 'level', need: nv(8), cash: 3000 },
  { id: 'biz5', type: 'biz', need: 5, cash: 5000 },
  { id: 'tier6', type: 'tier', need: 6, cash: 6000 },
  { id: 'fight10', type: 'pvpWins', need: 10, cash: 5000 },
  { id: 'lvl10', type: 'level', need: nv(10), cash: 6000 },
  { id: 'lux1', type: 'lux', need: 1, cash: 8000 },
  { id: 'wins500', type: 'wins', need: 500, cash: 12000 },
  { id: 'course1', type: 'courses', need: 1, cash: 12000 },
  { id: 'lvl13', type: 'level', need: nv(13), cash: 15000 },
  { id: 'biz10', type: 'biz', need: 10, cash: 25000 },
  { id: 'skill100', type: 'skill', need: 100, cash: 25000 },
  { id: 'lvl16', type: 'level', need: nv(16), cash: 40000 },
  { id: 'lux3', type: 'lux', need: 3, cash: 60000 },
  { id: 'lvl20', type: 'level', need: nv(20), cash: 120000 },
];

export const T = { MIN, HOUR, DAY };
