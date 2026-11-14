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
    { id: 'carteirista', e: 5,  D: 6,   min: 12,    max: 28,    r: 1,  jailMin: 1,  w: { I: 30, F: 0,  C: 70 } },
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
  bailBp: 3000,                   // fiança = 30% do valor médio do golpe que te prendeu, proporcional ao tempo que falta

  // Discoteca: só se compra se a energia não passar do máximo e o vício não passar do limite.
  // energia por vício melhora nos consumos caros; os baratos servem para o início (1 $ por ponto de energia)
  drugs: [
    { id: 'cerveja',   e: 5,  a: 2, price: 5 },
    { id: 'erva',      e: 10, a: 3, price: 25 },
    { id: 'pastilha',  e: 20, a: 5, price: 200 },
    { id: 'coca',      e: 30, a: 6, price: 1500 },
    { id: 'dourada',   e: 40, a: 7, price: 8000 },
  ],
  // prática: cada golpe treina as stats que usa (energia × peso; metade se falhar).
  // Um ponto custa base + perStat × stat atual de prática, por isso ajuda muito no início e menos depois (o ginásio continua mais rápido).
  practice: { base: 1000, perStat: 10, failBp: 5000 },
  // desintoxicação: limpa o vício todo; preço = vício × nível, a dobrar a cada uso nas últimas 24 h
  detox: { min: 50, windowMs: 24 * HOUR, max: 12 },

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
  port: { ms: 4 * HOUR, gainBp: 3000, seizeBp: 1500, minAmount: 100, capBase: 1000, capEveryLevels: 3, slotsEveryLevels: 5 },

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
  levels: [0, 3, 10, 25, 60, 120, 220, 380, 650, 1000, 1500, 2300, 3400, 4800, 6800, 9500, 13000, 18500, 27000, 38000],
};

export const T = { MIN, HOUR, DAY: 24 * HOUR };
