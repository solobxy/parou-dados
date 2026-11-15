// Todos os números do jogo num só sítio. Tudo inteiro: dinheiro em unidades,
// percentagens em pontos-base (bp, 10000 = 100%), tempos em milissegundos.

const MIN = 60_000;
const HOUR = 60 * MIN;

export const CFG = {
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

  energy: { max: 100, regenMs: 2 * MIN }, // cheia em 3h20
  addiction: { base: 100, perT: 4, decayMs: 1 * MIN }, // limite = 100 + tolerância/4; desce 1 por minuto

  start: { stat: 10, cash: 500 },
  missionSwapMs: 1 * HOUR, // trocar o objetivo do beco: uma vez por hora
  // Bolsa. Os preços (em cêntimos) mexem de 10 em 10 minutos, iguais para todos, e ninguém os consegue mexer nem adivinhar:
  // cada passo sobe ou desce o mesmo com 50% de hipótese (0, 1, 2 ou 4 vezes o passo da empresa), por isso em média o preço fica onde está.
  // Quem compra e vende paga 1% de cada vez: no total, a bolsa tira dinheiro do jogo. Abaixo de 5% do preço de estreia a empresa vai à falência
  // (as ações passam a valer zero) e volta a estrear-se. O máximo investido é 20× a aposta máxima do casino para o teu nível.
  stocks: {
    tickMs: 10 * MIN, feeBp: 100, bustBp: 500, capMult: 20, steps: [[0, 2], [1, 5], [2, 2], [4, 1]], histMax: 144,
    list: [
      { id: 'docas', base: 5000, vol: 40 }, { id: 'farma', base: 2500, vol: 55 }, { id: 'casino', base: 12000, vol: 70 },
      { id: 'armas', base: 8000, vol: 90 }, { id: 'noite', base: 1200, vol: 130 }, { id: 'moeda', base: 300, vol: 250 },
    ],
  },

  train: { energy: 5, costBase: 0, costPerStat: 0 }, // +1 ponto por treino; só gasta energia

  // Probabilidade de sucesso = S²/(S²+D²), entre 5% e 95%.
  chance: { minBp: 500, maxBp: 9500 },
  crit: { chanceBp: 500, mult: 3 }, // golpe perfeito: 5%, dinheiro x3
  unlockBp: 2000, // crime aparece com 20% de hipótese

  crimes: [
    { id: 'carteirista', e: 5, D: 5, min: 12, max: 28, r: 1, jailMin: 1, w: { I: 30, F: 0, C: 70 } },
    { id: 'loja', e: 6, D: 10, min: 35, max: 65, r: 2, jailMin: 2, w: { I: 40, F: 60, C: 0 } },
    { id: 'carro', e: 7, D: 16, min: 90, max: 150, r: 3, jailMin: 3, w: { I: 70, F: 30, C: 0 } },
    { id: 'bomba', e: 8, D: 25, min: 220, max: 340, r: 4, jailMin: 4, w: { I: 20, F: 80, C: 0 } },
    { id: 'turistas', e: 10, D: 38, min: 500, max: 800, r: 6, jailMin: 5, w: { I: 30, F: 0, C: 70 } },
    { id: 'vivenda', e: 12, D: 58, min: 1200, max: 1800, r: 7, jailMin: 6, w: { I: 60, F: 40, C: 0 } },
    { id: 'sequestro', e: 14, D: 88, min: 2800, max: 4200, r: 9, jailMin: 7, w: { I: 20, F: 50, C: 30 } },
    { id: 'carrinha', e: 17, D: 135, min: 6500, max: 9500, r: 11, jailMin: 8, w: { I: 40, F: 60, C: 0 } },
    { id: 'casino', e: 20, D: 205, min: 15000, max: 21000, r: 13, jailMin: 9, w: { I: 50, F: 0, C: 50 } },
    { id: 'banco', e: 25, D: 310, min: 34000, max: 46000, r: 16, jailMin: 10, w: { I: 40, F: 30, C: 30 } },
  ],
  crimeAllMax: 25, // «usar a stamina toda»: no máximo 25 golpes de uma vez
  bustBp: 2500, // falhar um golpe: 25% das vezes és apanhado (prisão); nas outras só perdes a energia
  // mestria: cada golpe conta os sucessos; 3 estrelas, cada uma dá +10% de dinheiro nesse golpe
  mastery: { at: [10, 40, 150], bonusBp: 1000 },
  bailBp: 3000, // fiança = 30% do valor médio do golpe que te prendeu, proporcional ao tempo que falta

  // Discoteca: só se compra se a energia não passar do máximo e o vício não passar do limite.
  // energia por vício melhora nos consumos caros; os baratos servem para o início (1 $ por ponto de energia)
  // a: quanto vicia. Com 100 de limite, a coca dá 33 doses (990 de stamina) antes de ser preciso desintoxicar ou esperar.
  drugs: [
    { id: 'cerveja', e: 5, a: 1, price: 5 },
    { id: 'erva', e: 10, a: 2, price: 25, fx: [{ k: 'bust', bp: 3000, ms: 10 * MIN }] },
    { id: 'cogumelos', e: 13, a: 2, price: 90, fx: [{ k: 'I', bp: 1000, ms: 10 * MIN }] },
    { id: 'ecstasy', e: 20, a: 3, price: 200, fx: [{ k: 'C', bp: 1000, ms: 10 * MIN }] },
    { id: 'speed', e: 24, a: 3, price: 600, fx: [{ k: 'loot', bp: 1500, ms: 10 * MIN }] },
    { id: 'lsd', e: 18, a: 2, price: 1000, fx: [{ k: 'I', bp: 2000, ms: 15 * MIN }] },
    { id: 'coca', e: 30, a: 3, price: 1500, fx: [{ k: 'C', bp: 1500, ms: 15 * MIN }, { k: 'biz', bp: 1000, ms: 15 * MIN }] },
    { id: 'cristal', e: 36, a: 3, price: 4000, fx: [{ k: 'F', bp: 2000, ms: 15 * MIN }] },
    { id: 'heroina', e: 40, a: 3, price: 8000, fx: [{ k: 'T', bp: 2500, ms: 20 * MIN }] },
    // juntas mais tarde: ficam no fim da lista para os armazéns já guardados não trocarem de droga (o ecrã mostra-as por preço)
    { id: 'absinto', e: 7, a: 1, price: 15 },
    { id: 'poppers', e: 6, a: 1, price: 40, fx: [{ k: 'loot', bp: 800, ms: 5 * MIN }] },
    { id: 'haxixe', e: 14, a: 2, price: 60, fx: [{ k: 'bust', bp: 3500, ms: 12 * MIN }] },
    { id: 'ketamina', e: 26, a: 3, price: 800, fx: [{ k: 'bust', bp: 4000, ms: 15 * MIN }] },
    { id: 'crack', e: 34, a: 4, price: 2500, fx: [{ k: 'F', bp: 2500, ms: 10 * MIN }, { k: 'loot', bp: 1000, ms: 10 * MIN }] },
    { id: 'oxi', e: 32, a: 3, price: 5000, fx: [{ k: 'T', bp: 2000, ms: 20 * MIN }] },
  ],
  // efeitos temporários: F, I, C, T sobem a stat; loot = saque dos golpes; biz = recolhas dos negócios; bust = menos prisão ao falhar
  fxKinds: ['F', 'I', 'C', 'T', 'loot', 'biz', 'bust'],
  // profissão: escolhe-se uma vez por ronda
  classes: [
    { id: 'ladrao', lootBp: 1500 }, // +15% de saque
    { id: 'vigarista', bustCutBp: 2500, bailCutBp: 5000 }, // menos prisão, fiança a metade
    { id: 'traficante', drugCutBp: 3000, fxMoreBp: 10000, capPlus: 15 }, // drogas mais baratas, efeitos a dobrar, mais limite de vício
    { id: 'empresario', bizBp: 2000, feeCutBp: 5000 }, // negócios rendem mais, banco a metade
    { id: 'matador', atkBp: 2000, pvpBp: 2500 }, // ataque e respeito nas lutas
    { id: 'seguranca', defBp: 2500, hospCutBp: 5000 }, // defesa, hospital a metade
    { id: 'chulo', hkCutBp: 3000, sickCutBp: 6000 }, // putas mais baratas e menos doenças
    { id: 'contrabandista', seizeCutBp: 5000 }, // metade das apreensões no porto
    // de elite: só com respeito (conta o máximo que já tiveste na ronda). Juntam dois ofícios e dão mais do que os de rua.
    { id: 'mestre', need: 1000, lootBp: 2000, bustCutBp: 1500 },
    { id: 'blindado', need: 1500, defBp: 3500, hospCutBp: 6000, atkBp: 1000 },
    { id: 'barao', need: 2000, drugCutBp: 4500, fxMoreBp: 15000, capPlus: 25 },
    { id: 'magnata', need: 3000, bizBp: 3000, feeCutBp: 8000, seizeCutBp: 3000 },
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
      { id: 'tanger', lat: 35.8, lon: -5.8, ms: 1 * HOUR, gainBp: 900, seizeBp: 500, level: 5, r: 2, drug: 'erva' },
      { id: 'amesterdao', lat: 52.4, lon: 4.9, ms: 2 * HOUR, gainBp: 1800, seizeBp: 900, level: 7, r: 4, drug: 'ecstasy' },
      { id: 'medellin', lat: 6.2, lon: -75.6, ms: 4 * HOUR, gainBp: 4000, seizeBp: 1800, level: 9, r: 7, drug: 'coca' },
      { id: 'culiacan', lat: 24.8, lon: -107.4, ms: 6 * HOUR, gainBp: 6500, seizeBp: 2500, level: 11, r: 10, drug: 'cristal' },
      { id: 'kandahar', lat: 31.6, lon: 65.7, ms: 8 * HOUR, gainBp: 10000, seizeBp: 3300, level: 13, r: 14, drug: 'heroina' },
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
    club: { cost: [10000, 30000, 90000, 270000, 800000, 2400000, 7000000, 20000000], perH: [2000, 6000, 18000, 50000, 140000, 400000, 1100000, 3000000], resp: [8, 16, 30, 50, 80, 120, 180, 260] },
    bro: { cost: [8000, 40000, 200000, 800000, 2500000], rooms: [2, 4, 6, 9, 12], hire: [3000, 12000, 45000, 160000], perH: [200, 700, 2500, 8000], resp: [8, 20, 45, 80, 130] },
  },
  // mudar de profissão: custa o que rendem 100 de stamina no teu melhor golpe e só dá uma vez a cada 24 h, para ninguém trocar antes de cada jogada
  classChange: { energy: 100, min: 500, coolMs: 24 * HOUR },
  avatars: 62,
  // casino: só com o dinheiro que tens na mão. A casa ganha sempre um pouco (roleta 2,7%, dados 3–4%, blackjack ~1%).
  casino: {
    minBet: 10, maxBase: 1000, maxNum: 8, maxDen: 5, // aposta máxima por jogada = 1000 × 1,6^(nível−1), como o porto
    maxBets: 12, // fichas por jogada na roleta e na roda
    buyMaxMult: 10, // comprar um bónus numa slot pode custar até 10× o máximo por jogada (o prémio máximo continua preso à ficha)
    red: [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36],
    dice: { low: 23, seven: 58, high: 23 }, // quanto volta por cada 10 apostados: 2,3× · 5,8× · 2,3×
    bj: { decks: 6, draw: 24 }, // baralho de 6 baralhos, baralhado a cada mão
    newsMin: 5000, // ganhos a partir daqui vão para o jornal
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
      top: { 1: 2359, 2: 2471, 5: 1415, 10: 993, moeda: 936, caixas: 780, bola: 519, louca: 418 }, // em 10 000 voltas: quantas vezes o multiplicador do topo cai em cada casa
      topMult: [[2, 560], [3, 240], [4, 90], [5, 55], [7, 28], [10, 18], [15, 5], [20, 2], [25, 1], [50, 1]],
      moeda: [[3, 250], [5, 240], [7, 150], [10, 140], [15, 90], [20, 50], [25, 30], [50, 30], [100, 10]],
      caixas: [[10, 408], [15, 240], [20, 150], [25, 100], [50, 78], [75, 30], [100, 15], [200, 7]],
      bola: [[10, 363], [15, 240], [20, 150], [25, 90], [50, 73], [100, 37], [200, 10]],
      // Crazy: roda de 64 casas com três flappers (verde, azul, amarelo). O jogador escolhe um antes de ela rodar e cada flapper lê a casa que tem
      // por baixo (flaps: desvio em casas a partir do do meio). 'D' é DOUBLE: todos os valores da roda dobram e ela roda outra vez, só para quem
      // lá caiu, as vezes que sair (até ao teto de 2500×). 56 valores (15×10, 20×10, 25×12, 35×9, 50×8, 100×5, 200×2) e 8 DOUBLE, nunca dois
      // flappers em DOUBLE na mesma volta. Em média dá ×47,2 (a roda antiga dava ×44,7, sem escolha nem DOUBLE).
      louca: { flaps: [-5, 0, 5], segs: [20, 25, 35, 'D', 50, 15, 100, 25, 20, 35, 15, 'D', 50, 25, 15, 20, 200, 35, 'D', 25, 100, 50, 15, 20, 35, 25, 15, 'D', 50, 20, 25, 35,
        100, 25, 20, 'D', 50, 15, 25, 35, 20, 15, 'D', 50, 100, 25, 35, 15, 200, 20, 25, 'D', 50, 15, 35, 20, 25, 100, 15, 'D', 50, 35, 20, 25] },
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
    createCost: 25000, minLevel: 4, baseMembers: 4, perSede: 2, maxLevel: 5,
    sede: [100000, 400000, 1500000, 6000000],                 // preço para passar a sede do nível 1 ao 2, do 2 ao 3…
    armaria: [50000, 200000, 800000, 3000000, 12000000],      // preço de cada nível da armaria (começa em 0)
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
      { id: 'carrinha', need: 2, sede: 1, e: 20, D: 150, min: 3000, max: 4500, r: 14, jailMin: 6, bailAs: 5, w: { I: 40, F: 60, C: 0 } },
      { id: 'casino', need: 3, sede: 2, e: 30, D: 450, min: 16000, max: 24000, r: 22, jailMin: 9, bailAs: 8, w: { I: 50, F: 0, C: 50 } },
      { id: 'banco', need: 4, sede: 3, e: 40, D: 1000, min: 75000, max: 105000, r: 30, jailMin: 10, bailAs: 9, w: { I: 40, F: 30, C: 30 } },
      { id: 'ourivesaria', need: 2, sede: 1, e: 25, D: 320, min: 8000, max: 12000, r: 18, jailMin: 7, bailAs: 6, w: { I: 60, F: 10, C: 30 } },
      { id: 'comboio', need: 3, sede: 2, e: 35, D: 750, min: 38000, max: 54000, r: 26, jailMin: 9, bailAs: 8, w: { I: 30, F: 60, C: 10 } },
      { id: 'leilao', need: 3, sede: 3, e: 35, D: 900, min: 55000, max: 75000, r: 28, jailMin: 9, bailAs: 8, w: { I: 40, F: 0, C: 60 } },
      { id: 'aeroporto', need: 4, sede: 4, e: 45, D: 1500, min: 100000, max: 135000, r: 34, jailMin: 10, bailAs: 9, w: { I: 50, F: 40, C: 10 } },
      { id: 'cartel', need: 5, sede: 5, e: 50, D: 2000, min: 120000, max: 160000, r: 38, jailMin: 10, bailAs: 9, w: { I: 20, F: 70, C: 10 } },
      { id: 'moeda', need: 5, sede: 5, e: 50, D: 2600, min: 135000, max: 180000, r: 42, jailMin: 10, bailAs: 9, w: { I: 50, F: 20, C: 30 } },
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
      { id: 'oficina', sede: 1, rateBp: 300, capMult: 3 },
      { id: 'jogo', sede: 2, rateBp: 350, capMult: 6 },
      { id: 'rota', sede: 3, rateBp: 400, capMult: 12 },
    ],
    bizMin: 100, bizCoopBp: 500, bizCoopMax: 5000, bizRefundBp: 5000,
    // Gangue da rua: existe sempre, é chefiada por um bot e entra quem quiser (a partir do nível das gangues), para ninguém ficar sem
    // golpes em grupo, conversa e negócio por não ter gangue. Fica sempre no nível 1 (sem cofre nem melhorias) e não é uma gangue a sério:
    // os membros podem atacar-se uns aos outros, não há tareias em grupo nem desconto nas casas dos outros membros.
    // Quem sai só pode voltar a esta gangue ao fim de 24 h. Como não tem chefe nem cargos, ninguém podia cancelar um pedido de golpe
    // esquecido (e só há um pedido aberto por gangue): o bot cancela o que estiver há opMaxMs à espera sem ter gente que chegue.
    bot: { id: 'rua', name: 'Strays', tag: 'BOT', rejoinMs: 24 * HOUR, roster: 40, opMaxMs: 15 * MIN },
  },
  // casa: cada nível dá respeito e deixa subir as melhorias até esse nível; a melhoria n custa uma parte do preço da casa n
  house: {
    tiers: [
      { id: 'rua', price: 0, resp: 0 }, { id: 'barraca', price: 2000, resp: 5 }, { id: 'quarto', price: 10000, resp: 15 },
      { id: 'apartamento', price: 50000, resp: 40 }, { id: 'moradia', price: 250000, resp: 100 }, { id: 'vivenda', price: 1000000, resp: 250 },
      { id: 'mansao', price: 5000000, resp: 600 }, { id: 'penthouse', price: 20000000, resp: 1500 },
    ],
    ups: [
      { id: 'cofre', costBp: 2500, bp: 1000 }, // dinheiro a salvo dos assaltos, por nível
      { id: 'alarme', costBp: 2500, bp: 400 }, // defesa quando te atacam
      { id: 'garagem', costBp: 2500, bp: 400 }, // menos prisão ao falhar
      { id: 'escritorio', costBp: 2500, bp: 200 }, // rendimento dos negócios
    ],
  },
  // putas: stamina sem vício; o preço segue o que ganhas por stamina e sobe 10% por cada visita nas últimas 24 h
  hookers: {
    // cada visita sobe 4% o preço DESSA puta (as outras não mexem); por cada hora sem lá ir, o preço dela desce um degrau até voltar ao normal.
    stepNum: 26, stepDen: 25, maxSteps: 60, coolMs: 1 * HOUR,
    sickCutBp: 1500, // doente: −15% em todas as stats até se tratar
    cureMin: 40, cureValueBp: 1000, // tratar custa o que rendem 10 de stamina
    // rara: ela mete-te a mão (hipótese por categoria, da mais barata à mais cara). A carteira só leva o que tens na mão (o banco está a salvo);
    // telemóvel, relógio e fio custam-te a reposição (sai da mão e depois do banco). Vale um múltiplo do preço da cidade dessa visita e sai do jogo: ninguém o recebe.
    rob: { bp: [150, 110, 70, 40], items: [[['wallet', 1], 50], [['phone', 2], 25], [['watch', 3], 18], [['chain', 5], 7]] },
    list: [
      // quanto mais barata, menos stamina por visita e um pouco mais de risco de doença (no máximo 1%);
      // as de cima custam mais por ponto mas enchem de uma vez e quase sem risco.
      { id: 'rosinha', tier: 0, e: 8, min: 10, valueBp: 1700, sickBp: 100 },
      { id: 'marlene', tier: 0, e: 12, min: 20, valueBp: 2000, sickBp: 90 },
      { id: 'sandra', tier: 0, e: 18, min: 35, valueBp: 2200, sickBp: 80 },
      { id: 'katia', tier: 1, e: 28, min: 120, valueBp: 2600, sickBp: 60 },
      { id: 'jessica', tier: 1, e: 36, min: 180, valueBp: 2800, sickBp: 50 },
      { id: 'bianca', tier: 1, e: 45, min: 350, valueBp: 3000, sickBp: 40 },
      { id: 'valentina', tier: 2, e: 55, min: 700, valueBp: 3300, sickBp: 30 },
      { id: 'dominique', tier: 2, e: 75, min: 1200, valueBp: 3600, sickBp: 25 },
      { id: 'scarlett', tier: 2, e: 85, min: 1800, valueBp: 3800, sickBp: 20 },
      { id: 'anastasia', tier: 3, e: 95, min: 3000, valueBp: 4100, sickBp: 15 },
      { id: 'isabella', tier: 3, e: 100, min: 4500, valueBp: 4400, sickBp: 10 },
      { id: 'celeste', tier: 3, e: 100, min: 7000, valueBp: 4700, sickBp: 0 },
      // juntas mais tarde: ficam no fim da lista (o ecrã mostra-as por categoria e preço)
      { id: 'lurdes', tier: 0, e: 15, min: 28, valueBp: 2100, sickBp: 85 },
      { id: 'tatiana', tier: 1, e: 32, min: 150, valueBp: 2700, sickBp: 55 },
      { id: 'vanessa', tier: 1, e: 40, min: 260, valueBp: 2900, sickBp: 45 },
      { id: 'kiara', tier: 2, e: 65, min: 950, valueBp: 3450, sickBp: 28 },
      { id: 'chanel', tier: 2, e: 80, min: 1500, valueBp: 3700, sickBp: 22 },
      { id: 'victoria', tier: 3, e: 98, min: 3800, valueBp: 4250, sickBp: 12 },
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
  detox: { min: 30, windowMs: 24 * HOUR, valueDiv: 1000, stepNum: 23, stepDen: 20, maxSteps: 40 },

  // Negócios: rendem por hora para um armazém que enche em 8 h. Cada compra dá respeito uma vez (resp).
  // Cada unidade extra do mesmo tipo custa +50%; máximo 10 de cada tipo.
  storageMs: 8 * HOUR,
  priceStepDiv: 2, // preço seguinte = preço + preço/2
  bizMax: 10,
  statMultDiv: 1000, // rendimento x (1000 + stat) / 1000, com a stat contada até 1000 (máx. x2)
  statMultCap: 1000,
  raid: { chanceBp: 500, lossBp: 5000 },
  biz: [
    { id: 'lavandaria', price: 3000, perH: 125, resp: 6, stat: 'C', raid: false, toBank: true },
    { id: 'prostitutas', price: 8000, perH: 500, resp: 12, stat: 'C', raid: true, toBank: false },
    // drug: estes três são fábricas. O dono pode pedir a produção em droga (ao preço de grosso, para o armazém) em vez de dinheiro:
    // vende-a na discoteca dele, toma-a ou despacha-a. É a mesma conta do porto com «receber em droga».
    { id: 'erva', price: 25000, perH: 1800, resp: 24, stat: 'I', raid: true, toBank: false, drug: 'erva' },
    { id: 'laboratorio', price: 120000, perH: 9600, resp: 45, stat: 'I', raid: true, toBank: false, drug: 'ecstasy' },
    { id: 'coca', price: 500000, perH: 42000, resp: 90, stat: 'I', raid: true, toBank: false, drug: 'coca' },
  ],
  // Contabilista: contrato pago uma vez por ronda. Com ele o armazém dos negócios aguenta 24 h em vez de 8 h;
  // do que passar das 8 h normais (dinheiro que sem ele se perdia) fica com 10%. Nunca tira nada a quem recolhe a horas.
  accountant: { price: 25000, minLevel: 3, capMult: 3, feeBp: 1000 },

  // Porto: contentor volta ao fim de 4 h com +30%, ou é apreendido (15%).
  // Porto: cada carregamento tem o seu barco, a sua droga, o seu tempo, o seu lucro e o seu risco de apreensão.
  // Valor esperado de cada um = (1 − risco) × (1 + lucro): entre 2,6% e 3,1% por hora, sempre abaixo do aeroporto (3,6% a 4,3%), porque o porto tem vários lugares.
  // O risco cresce com a duração (menos no submarino, que é lento e discreto): uma viagem curta com muito risco daria de mais a quem corta as apreensões a metade.
  // legacy: os contentores enviados antes de haver carregamentos valem como o porta-contentores (os mesmos +30% e 15%).
  port: { minAmount: 100, capBase: 1000, capNum: 8, capDen: 5, slotsEveryLevels: 5, legacy: 3, // limite por carregamento: 1000 × 1,6^(nível−1)
    ships: [
      { id: 'pesca', level: 1, ms: 2 * HOUR, gainBp: 1200, seizeBp: 600, drug: 'erva' },
      { id: 'lancha', level: 3, ms: 1 * HOUR, gainBp: 800, seizeBp: 500, drug: 'haxixe' },
      { id: 'ferry', level: 5, ms: 3 * HOUR, gainBp: 2100, seizeBp: 1000, drug: 'ecstasy' },
      { id: 'contentor', level: 7, ms: 4 * HOUR, gainBp: 3000, seizeBp: 1500, drug: 'coca' },
      { id: 'cargueiro', level: 10, ms: 6 * HOUR, gainBp: 4600, seizeBp: 1900, drug: 'cristal' },
      { id: 'submarino', level: 13, ms: 8 * HOUR, gainBp: 3700, seizeBp: 900, drug: 'heroina' },
    ] },

  // Três tipos de armas, cada um no seu espaço. Compram-se por ordem, uma de cada vez, e a anterior não se vende nem volta.
  // level: nível mínimo para comprar (sem ele, qualquer nível).
  // weapons (lutas): bp = ataque a mais, em pontos da Força.
  weapons: [
    { id: 'soqueira', price: 500, bp: 1000 },
    { id: 'navalha', price: 3000, bp: 2500 },
    { id: 'pistola', price: 20000, bp: 5000 },
    { id: 'cacadeira', price: 120000, bp: 8000 },
    { id: 'metralhadora', price: 700000, bp: 12000 },
    { id: 'sniper', price: 4000000, bp: 17000 },
    { id: 'lancachamas', price: 12000000, bp: 20000, level: 13 },
    { id: 'minigun', price: 30000000, bp: 23000, level: 16 },
  ],
  // tools (golpes a solo): str = força que se soma à pontuação de todos os golpes a solo (conta também para os desbloquear).
  // É força fixa e não percentagem: cada ferramenta vale cerca de +28% no nível em que abre e cada vez menos daí para cima.
  // Assim as baratas não dão quase nada a quem já é forte, e nenhuma mexe no teto do fim do jogo (95% de hipótese).
  // Preços: o que a ferramenta rende a mais do que a anterior paga-a em 1 a 4 dias de golpes (720 de stamina por dia) no nível em que abre.
  tools: [
    { id: 'pedecabra', price: 500, str: 2, level: 1 },
    { id: 'gazuas', price: 1200, str: 3, level: 3 },
    { id: 'taser', price: 3500, str: 5, level: 5 },
    { id: 'revolver', price: 10000, str: 9, level: 7 },
    { id: 'serrada', price: 30000, str: 16, level: 9 },
    { id: 'macarico', price: 80000, str: 27, level: 11 },
    { id: 'explosivos', price: 180000, str: 48, level: 13 },
    { id: 'broca', price: 250000, str: 84, level: 15 },
  ],
  // gweapons (golpes em grupo): str = força que se soma ao que tu puxas num golpe da gangue (e por isso também à tua parte do saque).
  // Mesma escada das ferramentas; começam no nível das gangues. Preços: 2 a 5 dias de golpes em grupo com metade da stamina do dia.
  gweapons: [
    { id: 'taco', price: 1000, str: 3, level: 4 },
    { id: 'catana', price: 2500, str: 5, level: 5 },
    { id: 'molotov', price: 7000, str: 9, level: 7 },
    { id: 'assalto', price: 20000, str: 16, level: 9 },
    { id: 'lancagranadas', price: 55000, str: 27, level: 11 },
    { id: 'pesada', price: 120000, str: 48, level: 13 },
    { id: 'bazuca', price: 160000, str: 84, level: 15 },
    { id: 'morteiro', price: 200000, str: 147, level: 17 },
  ],
  armors: [
    { id: 'cabedal', price: 400, bp: 1000 },
    { id: 'colete', price: 2500, bp: 2500 },
    { id: 'balistico', price: 18000, bp: 5000 },
    { id: 'kevlar', price: 110000, bp: 8000 },
    { id: 'blindado', price: 650000, bp: 12000 },
    { id: 'titanio', price: 3800000, bp: 17000 },
  ],
  // Guardas: compram-se sempre para cima, como as armas. bp: defesa a mais nas lutas (soma-se aos bónus da casa e da gangue).
  // block: quanto tiram à pontaria de um assassino a soldo (ver hitman).
  guards: [
    { id: 'chihuahua', price: 600, bp: 300, block: 500 },
    { id: 'pitbull', price: 4000, bp: 800, block: 1500 },
    { id: 'porteiro', price: 25000, bp: 1500, block: 2500 },
    { id: 'guardacostas', price: 150000, bp: 2500, block: 4000 },
    { id: 'comando', price: 900000, bp: 3500, block: 5500 },
    { id: 'escolta', price: 5000000, bp: 5000, block: 7000 },
  ],
  // Assassino a soldo: paga-se para mandar alguém para o hospital sem dar a cara e sem gastar stamina (dá para encomendar da cama do hospital).
  // Ninguém perde a conta. Se acerta: o alvo fica 1 h no hospital, perde 1,5% do respeito e 10% do dinheiro na mão (não vai para ninguém),
  // e fica 12 h a salvo de outros assassinos. Quem paga não ganha respeito nem dinheiro: é só para atrasar um rival.
  // Pontaria: 90% menos o «block» dos guardas do alvo (no mínimo 15%). Se falha, o dinheiro perde-se e o alvo fica a saber quem pagou.
  // Travões: preço = 100 por ponto de respeito do alvo (mínimo 5000), 3 encomendas por dia, só a partir do nível 5, e as regras das lutas
  // (alvo com pelo menos 25% do teu respeito, nada de jogadores novos, da tua gangue, no hospital, presos ou protegidos).
  hitman: { minLevel: 5, priceMin: 5000, pricePerRespect: 100, baseBp: 9000, minBp: 1500, hospMs: 60 * MIN, respBp: 150, cashBp: 1000, immuneMs: 12 * HOUR, perDay: 3 },

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
    maxHospPerWindow: 4, // ninguém é mandado para o hospital mais de 4 vezes em 24 h (regra fixa)
    windowMs: 24 * HOUR,
  },
  // sair do hospital: por cada minuto que falta, o mais barato de (5 × nível) e (um quarto do que rende 1 de stamina)
  medicPerMin: 5, medicValueBp: 2500,

  bank: { feeBp: 300 }, // depositar custa 3%

  // Luxos: dão respeito uma vez e ficam no perfil. Cada compra custa o dobro da anterior.
  luxury: { firstPrice: 250000, respect: 250, max: 20 },

  // Níveis pelo maior respeito já alcançado (o nível nunca desce). Índice = nível - 1.
  levels: [0, 3, 10, 30, 80, 180, 350, 600, 950, 1400, 2000, 2800, 3900, 5400, 7500, 10500, 15000, 22000, 32000, 46000],
};

// Objetivos: uma cadeia, um de cada vez. tipo → de onde vem o progresso (ver missionHave no motor).
CFG.missions = [
  { id: 'first', type: 'wins', need: 1, cash: 50 },
  { id: 'wins5', type: 'wins', need: 5, cash: 100 },
  { id: 'train3', type: 'trains', need: 3, cash: 100 },
  { id: 'refill1', type: 'refills', need: 1, cash: 150 },
  { id: 'lvl3', type: 'level', need: 3, cash: 200 },
  { id: 'tier2', type: 'tier', need: 2, cash: 250 },
  { id: 'wins25', type: 'wins', need: 25, cash: 400 },
  { id: 'weapon', type: 'gear', need: 1, cash: 400 },
  { id: 'lvl5', type: 'level', need: 5, cash: 600 },
  { id: 'star1', type: 'stars', need: 1, cash: 800 },
  { id: 'biz1', type: 'biz', need: 1, cash: 1500 },
  { id: 'collect1', type: 'collects', need: 1, cash: 800 },
  { id: 'tier4', type: 'tier', need: 4, cash: 1500 },
  { id: 'fight1', type: 'pvpWins', need: 1, cash: 2500 },
  { id: 'port1', type: 'ports', need: 1, cash: 2000 },
  { id: 'wins100', type: 'wins', need: 100, cash: 5000 },
  { id: 'lvl8', type: 'level', need: 8, cash: 8000 },
  { id: 'biz5', type: 'biz', need: 5, cash: 20000 },
  { id: 'tier6', type: 'tier', need: 6, cash: 25000 },
  { id: 'fight10', type: 'pvpWins', need: 10, cash: 40000 },
  { id: 'lvl10', type: 'level', need: 10, cash: 60000 },
  { id: 'lux1', type: 'lux', need: 1, cash: 120000 },
  { id: 'wins500', type: 'wins', need: 500, cash: 200000 },
  { id: 'tier8', type: 'tier', need: 8, cash: 300000 },
  { id: 'lvl13', type: 'level', need: 13, cash: 500000 },
  { id: 'biz20', type: 'biz', need: 20, cash: 750000 },
  { id: 'tier10', type: 'tier', need: 10, cash: 1500000 },
  { id: 'lvl16', type: 'level', need: 16, cash: 2000000 },
  { id: 'lux5', type: 'lux', need: 5, cash: 5000000 },
  { id: 'lvl20', type: 'level', need: 20, cash: 10000000 },
];

export const T = { MIN, HOUR, DAY: 24 * HOUR };
