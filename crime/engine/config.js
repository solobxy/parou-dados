// Todos os números do jogo num só sítio. Tudo inteiro: dinheiro em unidades,
// percentagens em pontos-base (bp, 10000 = 100%), tempos em milissegundos.

const MIN = 60_000;
const HOUR = 60 * MIN;

export const CFG = {
  round: {
    playDays: 13,
    totalDays: 14,          // 13 de jogo + 1 de pausa
    startWeekday: 5,        // sexta-feira
    startHour: 21,          // 21:00, hora de Lisboa
    tz: 'Europe/Lisbon',
    noPvpMs: 1 * HOUR,      // primeira hora da ronda sem ataques
    lateJoinAfterMs: 24 * HOUR,
    newbieShieldMs: 24 * HOUR,
    lateStatsBp: 5000,      // quem entra tarde: 50% da mediana das stats
  },

  energy: { max: 100, regenMs: 2 * MIN },          // cheia em 3h20
  addiction: { base: 100, perT: 4, decayMs: 1 * MIN }, // limite = 100 + tolerância/4; desce 1 por minuto

  start: { stat: 10, cash: 500 },

  train: { energy: 5, costBase: 0, costPerStat: 0 }, // +1 ponto por treino; só gasta energia

  // Probabilidade de sucesso = S²/(S²+D²), entre 5% e 95%.
  chance: { minBp: 500, maxBp: 9500 },
  crit: { chanceBp: 500, mult: 3 },                  // golpe perfeito: 5%, dinheiro x3
  unlockBp: 2000,                                    // crime aparece com 20% de hipótese

  crimes: [
    { id: 'carteirista', e: 5,  D: 5,   min: 12,    max: 28,    r: 1,  jailMin: 1,  w: { I: 30, F: 0,  C: 70 } },
    { id: 'loja',        e: 6,  D: 10,  min: 35,    max: 65,    r: 2,  jailMin: 2,  w: { I: 40, F: 60, C: 0 } },
    { id: 'carro',       e: 7,  D: 16,  min: 90,    max: 150,   r: 3,  jailMin: 3,  w: { I: 70, F: 30, C: 0 } },
    { id: 'bomba',       e: 8,  D: 25,  min: 220,   max: 340,   r: 4,  jailMin: 4,  w: { I: 20, F: 80, C: 0 } },
    { id: 'turistas',    e: 10, D: 38,  min: 500,   max: 800,   r: 6,  jailMin: 5,  w: { I: 30, F: 0,  C: 70 } },
    { id: 'vivenda',     e: 12, D: 58,  min: 1200,  max: 1800,  r: 7,  jailMin: 6,  w: { I: 60, F: 40, C: 0 } },
    { id: 'sequestro',   e: 14, D: 88,  min: 2800,  max: 4200,  r: 9,  jailMin: 7,  w: { I: 20, F: 50, C: 30 } },
    { id: 'carrinha',    e: 17, D: 135, min: 6500,  max: 9500,  r: 11, jailMin: 8,  w: { I: 40, F: 60, C: 0 } },
    { id: 'casino',      e: 20, D: 205, min: 15000, max: 21000, r: 13, jailMin: 9,  w: { I: 50, F: 0,  C: 50 } },
    { id: 'banco',       e: 25, D: 310, min: 34000, max: 46000, r: 16, jailMin: 10, w: { I: 40, F: 30, C: 30 } },
  ],
  crimeAllMax: 25,                // «usar a stamina toda»: no máximo 25 golpes de uma vez
  bustBp: 2500,                   // falhar um golpe: 25% das vezes és apanhado (prisão); nas outras só perdes a energia
  // mestria: cada golpe conta os sucessos; 3 estrelas, cada uma dá +10% de dinheiro nesse golpe
  mastery: { at: [10, 40, 150], bonusBp: 1000 },
  bailBp: 3000,                   // fiança = 30% do valor médio do golpe que te prendeu, proporcional ao tempo que falta

  // Discoteca: só se compra se a energia não passar do máximo e o vício não passar do limite.
  // energia por vício melhora nos consumos caros; os baratos servem para o início (1 $ por ponto de energia)
  drugs: [
    { id: 'cerveja',   e: 5,  a: 2, price: 5 },
    { id: 'erva',      e: 10, a: 3, price: 25,   fx: [{ k: 'bust', bp: 3000, ms: 10 * MIN }] },
    { id: 'cogumelos', e: 13, a: 4, price: 90,   fx: [{ k: 'I', bp: 1000, ms: 10 * MIN }] },
    { id: 'ecstasy',   e: 20, a: 5, price: 200,  fx: [{ k: 'C', bp: 1000, ms: 10 * MIN }] },
    { id: 'speed',     e: 24, a: 6, price: 600,  fx: [{ k: 'loot', bp: 1500, ms: 10 * MIN }] },
    { id: 'lsd',       e: 18, a: 5, price: 1000, fx: [{ k: 'I', bp: 2000, ms: 15 * MIN }] },
    { id: 'coca',      e: 30, a: 6, price: 1500, fx: [{ k: 'C', bp: 1500, ms: 15 * MIN }, { k: 'biz', bp: 1000, ms: 15 * MIN }] },
    { id: 'cristal',   e: 36, a: 7, price: 4000, fx: [{ k: 'F', bp: 2000, ms: 15 * MIN }] },
    { id: 'heroina',   e: 40, a: 7, price: 8000, fx: [{ k: 'T', bp: 2500, ms: 20 * MIN }] },
  ],
  // efeitos temporários: F, I, C, T sobem a stat; loot = saque dos golpes; biz = recolhas dos negócios; bust = menos prisão ao falhar
  fxKinds: ['F', 'I', 'C', 'T', 'loot', 'biz', 'bust'],
  // profissão: escolhe-se uma vez por ronda
  classes: [
    { id: 'ladrao',     lootBp: 1500 },                                  // +15% de saque
    { id: 'vigarista',  bustCutBp: 2500, bailCutBp: 5000 },              // menos prisão, fiança a metade
    { id: 'traficante', drugCutBp: 3000, fxMoreBp: 10000, capPlus: 15 }, // drogas mais baratas, efeitos a dobrar, mais limite de vício
    { id: 'empresario', bizBp: 2000, feeCutBp: 5000 },                   // negócios rendem mais, banco a metade
    { id: 'matador',    atkBp: 2000, pvpBp: 2500 },                      // ataque e respeito nas lutas
    { id: 'seguranca',  defBp: 2500, hospCutBp: 5000 },                  // defesa, hospital a metade
  ],
  avatars: 32,
  // casino: só com o dinheiro que tens na mão. A casa ganha sempre um pouco (roleta 2,7%, dados 3–4%, blackjack ~1%).
  casino: {
    minBet: 10, maxBase: 1000, maxNum: 8, maxDen: 5,   // aposta máxima por jogada = 1000 × 1,6^(nível−1), como o porto
    maxBets: 12,                                        // fichas por jogada na roleta e na roda
    red: [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36],
    dice: { low: 23, seven: 58, high: 23 },            // quanto volta por cada 10 apostados: 2,3× · 5,8× · 2,3×
    bj: { decks: 6, draw: 24 },                        // baralho de 6 baralhos, baralhado a cada mão
    newsMin: 5000,                                      // ganhos a partir daqui vão para o jornal
    maxWinMult: 2500,                                   // nenhuma jogada paga mais de 2500× o que se apostou
    // Roda da Fortuna: 54 casas. Número n paga n para 1; as casas de bónus abrem um jogo que dá um multiplicador.
    // Em cada volta pode aparecer um multiplicador extra numa casa (o «multiplicador do topo»).
    // Contas: cada aposta devolve, em média, 95,5% (verificado nos testes).
    wheel: {
      segs: ['louca', '1', '2', '1', 'bola', '1', '2', 'caixas', '1', '10', '2', '1', '5', '1', '2', '10', '1', '5', '1', '5', '1', 'moeda', '2', '1', '2', '1', '5', '1', '10', '1',
        'moeda', '1', '2', '1', 'caixas', '5', '2', '1', 'moeda', '2', '1', '2', '10', '5', '2', '1', 'bola', '2', '1', '5', '1', '2', 'moeda', '1'],
      spots: ['1', '2', '5', '10', 'moeda', 'caixas', 'bola', 'louca'],
      num: { 1: 1, 2: 2, 5: 5, 10: 10 },
      top: { 1: 1024, 2: 1086, 5: 614, 10: 425, moeda: 428, caixas: 375, bola: 279, louca: 386 },   // em 10 000 voltas
      topMult: [[2, 40], [3, 25], [5, 18], [10, 10], [20, 5], [50, 2]],
      moeda: [[2, 18], [3, 18], [5, 16], [7, 12], [10, 12], [15, 9], [20, 7], [25, 4], [50, 3], [100, 1]],
      caixas: [[5, 18], [7, 17], [10, 16], [15, 14], [20, 11], [25, 9], [50, 8], [75, 4], [100, 2], [200, 1]],
      bola: [[5, 22], [10, 22], [15, 15], [20, 15], [25, 12], [50, 9], [100, 4], [200, 1]],
      louca: [[10, 22], [15, 18], [20, 15], [25, 13], [50, 12], [75, 8], [100, 7], [200, 4], [500, 1]],
      bolaSlots: 12, loucaSlots: 24,
    },
    // Slot «Chefão»: 6 colunas × 5 linhas, paga por quantidade (8 ou mais iguais em qualquer lado), as vitórias caem e entram símbolos novos.
    // Esferas douradas multiplicam o prémio da jogada. 4 ou mais chefões dão rodadas grátis, onde os multiplicadores se somam.
    slot: {
      cols: 6, rows: 5,
      // peso de cada símbolo: 0 charuto, 1 whisky, 2 ficha, 3 chapéu, 4 relógio, 5 anel, 6 notas, 7 diamante, 8 coroa, 9 barra de ouro, 10 chefão, 11 esfera
      w: [140, 130, 118, 106, 74, 60, 50, 40, 32, 26, 14, 5],
      wFree: [140, 130, 118, 106, 74, 60, 50, 40, 32, 26, 14, 18],
      // prémio em centésimos da aposta para 8–9, 10–11 e 12+ iguais
      pay: [[27, 81, 215], [43, 97, 431], [54, 107, 538], [86, 129, 861], [107, 161, 1076], [161, 215, 1292], [215, 538, 1614], [269, 1076, 2690], [1076, 2690, 5380], [538, 1292, 3228]],
      orb: [[2, 300], [3, 200], [4, 120], [5, 100], [6, 60], [8, 50], [10, 40], [12, 25], [15, 20], [20, 15], [25, 10], [50, 5], [100, 2]],
      scatterPay: { 4: 300, 5: 500, 6: 10000 },       // centésimos da aposta
      free: 15, retrigger: 5, maxFree: 50, maxTumbles: 30,
    },
  },
  // casa: cada nível dá respeito e deixa subir as melhorias até esse nível; a melhoria n custa uma parte do preço da casa n
  house: {
    tiers: [
      { id: 'rua', price: 0, resp: 0 }, { id: 'barraca', price: 2000, resp: 5 }, { id: 'quarto', price: 10000, resp: 15 },
      { id: 'apartamento', price: 50000, resp: 40 }, { id: 'moradia', price: 250000, resp: 100 }, { id: 'vivenda', price: 1000000, resp: 250 },
      { id: 'mansao', price: 5000000, resp: 600 }, { id: 'penthouse', price: 20000000, resp: 1500 },
    ],
    ups: [
      { id: 'cofre', costBp: 2500, bp: 1000 },      // dinheiro a salvo dos assaltos, por nível
      { id: 'alarme', costBp: 2500, bp: 400 },      // defesa quando te atacam
      { id: 'garagem', costBp: 2500, bp: 400 },     // menos prisão ao falhar
      { id: 'escritorio', costBp: 2500, bp: 200 },  // rendimento dos negócios
    ],
  },
  // putas: stamina sem vício; o preço segue o que ganhas por stamina e sobe 10% por cada visita nas últimas 24 h
  hookers: {
    windowMs: 24 * HOUR, stepNum: 11, stepDen: 10, maxSteps: 60,
    sickCutBp: 1500,                 // doente: −15% em todas as stats até se tratar
    cureMin: 150, cureValueBp: 6000, // tratar custa o que rendem 60 de stamina
    list: [
      { id: 'marlene',   tier: 0, e: 12, min: 20,   valueBp: 2000, sickBp: 600 },
      { id: 'sandra',    tier: 0, e: 18, min: 35,   valueBp: 2200, sickBp: 500 },
      { id: 'katia',     tier: 1, e: 28, min: 120,  valueBp: 2600, sickBp: 300 },
      { id: 'jessica',   tier: 1, e: 36, min: 180,  valueBp: 2800, sickBp: 250 },
      { id: 'valentina', tier: 2, e: 55, min: 700,  valueBp: 3300, sickBp: 120 },
      { id: 'dominique', tier: 2, e: 75, min: 1200, valueBp: 3600, sickBp: 80 },
    ],
  },
  // prática: cada golpe treina as stats que usa (energia × peso; metade se falhar).
  // Um ponto custa base + perStat × stat atual de prática, por isso ajuda muito no início e menos depois (o ginásio continua mais rápido).
  practice: { base: 1000, perStat: 10, failBp: 5000 },
  // desintoxicação: limpa o vício todo, sem limite de vezes. Preço = metade do que 100 de energia te rendem
  // (por 100 de vício), +25% por cada uso nas últimas 24 h. Nunca bloqueia: só fica cada vez mais cara.
  detox: { min: 50, windowMs: 24 * HOUR, valueDiv: 200, stepNum: 5, stepDen: 4, maxSteps: 40 },

  // Negócios: rendem por hora para um armazém que enche em 8 h. Cada compra dá respeito uma vez (resp).
  // Cada unidade extra do mesmo tipo custa +50%; máximo 10 de cada tipo.
  storageMs: 8 * HOUR,
  priceStepDiv: 2,                // preço seguinte = preço + preço/2
  bizMax: 10,
  statMultDiv: 1000,              // rendimento x (1000 + stat) / 1000, com a stat contada até 1000 (máx. x2)
  statMultCap: 1000,
  raid: { chanceBp: 500, lossBp: 5000 },
  biz: [
    { id: 'lavandaria',  price: 3000,   perH: 125,   resp: 6,  stat: 'C', raid: false, toBank: true },
    { id: 'prostitutas', price: 8000,   perH: 500,   resp: 12, stat: 'C', raid: true,  toBank: false },
    { id: 'erva',        price: 25000,  perH: 1800,  resp: 24, stat: 'I', raid: true,  toBank: false },
    { id: 'laboratorio', price: 120000, perH: 9600,  resp: 45, stat: 'I', raid: true,  toBank: false },
    { id: 'coca',        price: 500000, perH: 42000, resp: 90, stat: 'I', raid: true,  toBank: false },
  ],

  // Porto: contentor volta ao fim de 4 h com +30%, ou é apreendido (15%).
  port: { ms: 4 * HOUR, gainBp: 3000, seizeBp: 1500, minAmount: 100, capBase: 1000, capNum: 8, capDen: 5, slotsEveryLevels: 5 }, // limite por contentor: 1000 × 1,6^(nível−1)

  weapons: [
    { id: 'soqueira', price: 500,     bp: 1000 },
    { id: 'navalha',  price: 3000,    bp: 2500 },
    { id: 'pistola',  price: 20000,   bp: 5000 },
    { id: 'cacadeira', price: 120000, bp: 8000 },
    { id: 'metralhadora', price: 700000, bp: 12000 },
    { id: 'sniper',   price: 4000000, bp: 17000 },
  ],
  armors: [
    { id: 'cabedal',  price: 400,     bp: 1000 },
    { id: 'colete',   price: 2500,    bp: 2500 },
    { id: 'balistico', price: 18000,  bp: 5000 },
    { id: 'kevlar',   price: 110000,  bp: 8000 },
    { id: 'blindado', price: 650000,  bp: 12000 },
    { id: 'titanio',  price: 3800000, bp: 17000 },
  ],

  pvp: {
    energy: 20,
    minTargetBp: 2500,      // só se ataca quem tem >= 25% do teu respeito
    // ganho = (4 + nível do atacante) x raiz(respeito do alvo / respeito do atacante), com a razão entre 1/4 e 4
    gainBase: 12,
    ratioMinBp: 2500, ratioMaxBp: 40000,
    lossDiv: 2,             // quem perde a luta perde metade do que o outro ganharia
    defendGain: 2,          // quem se defende com sucesso ganha 2
    beatHospMs: 20 * MIN,
    mugHospMs: 10 * MIN,
    mugBp: 1000,            // assalto leva 10% do dinheiro na mão e do que está por recolher nos negócios ilegais
    protectMs: 30 * MIN,    // proteção depois de sair do hospital
    maxHospPerWindow: 4,    // ninguém é mandado para o hospital mais de 4 vezes em 24 h (regra fixa)
    windowMs: 24 * HOUR,
  },
  medicPerMin: 30,          // sair do hospital: 30 x minutos que faltam x nível do jogador

  bank: { feeBp: 300 },     // depositar custa 3%

  // Luxos: dão respeito uma vez e ficam no perfil. Cada compra custa o dobro da anterior.
  luxury: { firstPrice: 250000, respect: 250, max: 20 },

  // Níveis pelo maior respeito já alcançado (o nível nunca desce). Índice = nível - 1.
  levels: [0, 3, 10, 30, 80, 180, 350, 600, 950, 1400, 2000, 2800, 3900, 5400, 7500, 10500, 15000, 22000, 32000, 46000],
};

// Objetivos: uma cadeia, um de cada vez. tipo → de onde vem o progresso (ver missionHave no motor).
CFG.missions = [
  { id: 'first',    type: 'wins',     need: 1,   cash: 50 },
  { id: 'wins5',    type: 'wins',     need: 5,   cash: 100 },
  { id: 'train3',   type: 'trains',   need: 3,   cash: 100 },
  { id: 'refill1',  type: 'refills',  need: 1,   cash: 150 },
  { id: 'lvl3',     type: 'level',    need: 3,   cash: 200 },
  { id: 'tier2',    type: 'tier',     need: 2,   cash: 250 },
  { id: 'wins25',   type: 'wins',     need: 25,  cash: 400 },
  { id: 'weapon',   type: 'gear',     need: 1,   cash: 400 },
  { id: 'lvl5',     type: 'level',    need: 5,   cash: 600 },
  { id: 'star1',    type: 'stars',    need: 1,   cash: 800 },
  { id: 'biz1',     type: 'biz',      need: 1,   cash: 1500 },
  { id: 'collect1', type: 'collects', need: 1,   cash: 800 },
  { id: 'tier4',    type: 'tier',     need: 4,   cash: 1500 },
  { id: 'fight1',   type: 'pvpWins',  need: 1,   cash: 2500 },
  { id: 'port1',    type: 'ports',    need: 1,   cash: 2000 },
  { id: 'wins100',  type: 'wins',     need: 100, cash: 5000 },
  { id: 'lvl8',     type: 'level',    need: 8,   cash: 8000 },
  { id: 'biz5',     type: 'biz',      need: 5,   cash: 20000 },
  { id: 'tier6',    type: 'tier',     need: 6,   cash: 25000 },
  { id: 'fight10',  type: 'pvpWins',  need: 10,  cash: 40000 },
  { id: 'lvl10',    type: 'level',    need: 10,  cash: 60000 },
  { id: 'lux1',     type: 'lux',      need: 1,   cash: 120000 },
  { id: 'wins500',  type: 'wins',     need: 500, cash: 200000 },
  { id: 'tier8',    type: 'tier',     need: 8,   cash: 300000 },
  { id: 'lvl13',    type: 'level',    need: 13,  cash: 500000 },
  { id: 'biz20',    type: 'biz',      need: 20,  cash: 750000 },
  { id: 'tier10',   type: 'tier',     need: 10,  cash: 1500000 },
  { id: 'lvl16',    type: 'level',    need: 16,  cash: 2000000 },
  { id: 'lux5',     type: 'lux',      need: 5,   cash: 5000000 },
  { id: 'lvl20',    type: 'level',    need: 20,  cash: 10000000 },
];

export const T = { MIN, HOUR, DAY: 24 * HOUR };
