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
  goods: { wholesaleBp: 8000, dumpBp: 9500, portDrug: [[9, 'coca'], [7, 'ecstasy'], [0, 'erva']] },
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
  avatars: 32,
  // casino: só com o dinheiro que tens na mão. A casa ganha sempre um pouco (roleta 2,7%, dados 3–4%, blackjack ~1%).
  casino: {
    minBet: 10, maxBase: 1000, maxNum: 8, maxDen: 5, // aposta máxima por jogada = 1000 × 1,6^(nível−1), como o porto
    maxBets: 12, // fichas por jogada na roleta e na roda
    red: [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36],
    dice: { low: 23, seven: 58, high: 23 }, // quanto volta por cada 10 apostados: 2,3× · 5,8× · 2,3×
    bj: { decks: 6, draw: 24 }, // baralho de 6 baralhos, baralhado a cada mão
    newsMin: 5000, // ganhos a partir daqui vão para o jornal
    maxWinMult: 2500, // nenhuma jogada paga mais de 2500× o que se apostou
    // Roda da Fortuna: 54 casas. Número n paga n para 1; as casas de bónus abrem um jogo que dá um multiplicador.
    // Em cada volta pode aparecer um multiplicador extra numa casa (o «multiplicador do topo»).
    // Contas: cada aposta devolve o mesmo que no jogo real (1: 96,08%, 2: 95,95%, 5: 95,78%, 10: 95,73%, moeda 95,70%, caixas 95,27%, bola 94,33%, louca 94,41%).
    wheel: {
      // mesma ordem e mesmas quantidades de uma roda de casino ao vivo: um bónus de 6 em 6 casas
      segs: ['louca', '1', '2', '5', '1', '2', 'bola', '1', '5', '1', '2', '1', 'moeda', '1', '2', '1', '10', '2', 'caixas', '1', '2', '1', '5', '1', 'moeda', '1', '5', '2', '10', '1',
        'bola', '1', '2', '5', '1', '2', 'moeda', '1', '10', '1', '5', '1', 'caixas', '1', '2', '5', '1', '2', 'moeda', '2', '1', '10', '2', '1'],
      spots: ['1', '2', '5', '10', 'moeda', 'caixas', 'bola', 'louca'],
      num: { 1: 1, 2: 2, 5: 5, 10: 10 },
      top: { 1: 1058, 2: 1107, 5: 624, 10: 432, moeda: 434, caixas: 368, bola: 247, louca: 356 }, // em 10 000 voltas; dá o retorno de cada aposta da roda real (96,08% no 1 … 94,33% na bola)
      topMult: [[2, 40], [3, 25], [5, 18], [10, 10], [20, 5], [50, 2]],
      moeda: [[2, 18], [3, 18], [5, 16], [7, 12], [10, 12], [15, 9], [20, 7], [25, 4], [50, 3], [100, 1]],
      caixas: [[5, 18], [7, 17], [10, 16], [15, 14], [20, 11], [25, 9], [50, 8], [75, 4], [100, 2], [200, 1]],
      bola: [[5, 22], [10, 22], [15, 15], [20, 15], [25, 12], [50, 9], [100, 4], [200, 1]],
      louca: [[10, 22], [15, 18], [20, 15], [25, 13], [50, 12], [75, 8], [100, 7], [200, 4], [500, 1]],
      bolaSlots: 12, loucaSlots: 24, caixasN: 36,
    },
    // Slots. «scatter»: 6×5, 8 ou mais iguais em qualquer sítio pagam; as vitórias caem e entram símbolos novos; as esferas somam-se e
    // multiplicam o prémio da jogada. «cluster»: 7×7, grupos de 5+ iguais encostados; cada casa onde rebenta um símbolo fica marcada e
    // depois multiplica (×2, ×4 … ×1024). Compra de bónus: paga-se N vezes a aposta e as rodadas grátis começam logo.
    // Prémios em centésimos da aposta. Os números foram afinados por simulação para ficarem perto dos jogos reais (ver os testes).
    slots: {
      chefao: {
        kind: 'scatter', cols: 6, rows: 5, min: 8, nsym: 10, trig: 4,
        // 0 charuto, 1 whisky, 2 ficha, 3 chapéu, 4 relógio, 5 anel, 6 notas, 7 diamante, 8 coroa, 9 barra de ouro, 10 chefão (scatter), 11 esfera
        w: [140, 130, 118, 106, 74, 60, 50, 40, 32, 26, 14, 5],
        wFree: [140, 130, 118, 106, 74, 60, 50, 40, 32, 26, 14, 24],
        pay: [[26, 78, 205], [41, 93, 413], [51, 103, 515], [82, 123, 824], [103, 154, 1029], [154, 205, 1237], [205, 515, 1545], [258, 1029, 2574], [1029, 2574, 5149], [515, 1237, 3089]],
        orb: [[2, 300], [3, 200], [4, 120], [5, 100], [6, 60], [8, 50], [10, 40], [12, 25], [15, 20], [20, 15], [25, 10], [50, 5], [100, 2]],
        orbBase: true, accFree: true, scatPay: { 4: 300, 5: 500, 6: 10000 }, free: 15, retrig: [3, 5], maxFree: 60, buy: 100, max: 2500,
      },
      // «Trovão de Zeus 1000»: como os jogos de deuses gregos 6×5 (esferas até ×1000, multiplicador total nas grátis). Real: 96,5%, 15 000×, compra a 100×.
      zeus: {
        kind: 'scatter', cols: 6, rows: 5, min: 8, nsym: 9, trig: 4,
        // 0 gema azul, 1 verde, 2 amarela, 3 roxa, 4 vermelha, 5 cálice, 6 ânfora, 7 lira, 8 elmo, 9 deus (scatter), 10 esfera
        w: [135, 128, 117, 106, 88, 72, 60, 50, 40, 13, 4],
        wFree: [135, 128, 117, 106, 88, 72, 60, 50, 40, 13, 18],
        pay: [[34, 103, 274], [55, 124, 548], [69, 137, 686], [109, 165, 1097], [137, 206, 1371], [206, 274, 1645], [274, 686, 2056], [343, 1371, 3428], [1371, 3428, 6855]],
        orb: [[2, 400], [3, 260], [4, 160], [5, 130], [6, 80], [8, 60], [10, 50], [12, 30], [15, 25], [20, 18], [25, 12], [50, 7], [100, 4], [250, 2], [500, 1], [1000, 1]],
        orbBase: true, accFree: true, scatPay: { 4: 300, 5: 500, 6: 10000 }, free: 15, retrig: [3, 5], maxFree: 60, buy: 100, max: 15000,
      },
      // «Doce Vingança»: doces e fruta 6×5; bombas de ×2 a ×100 só nas grátis, cada jogada com as suas. Real: ~96,5%, 21 175×, compra a 100×.
      doce: {
        kind: 'scatter', cols: 6, rows: 5, min: 8, nsym: 9, trig: 4,
        // 0 kiwi, 1 laranja, 2 pera, 3 cerejas, 4 morango, 5 doce azul, 6 goma verde, 7 rebuçado roxo, 8 coração, 9 queque (scatter), 10 bomba
        w: [135, 128, 117, 106, 88, 72, 60, 50, 40, 13, 0],
        wFree: [235, 223, 204, 106, 88, 72, 60, 50, 40, 13, 14],
        pay: [[70, 210, 559], [112, 251, 1118], [139, 279, 1396], [224, 335, 2235], [279, 419, 2794], [419, 559, 3353], [559, 1396, 4191], [698, 2794, 6984], [2794, 6984, 13970]],
        orb: [[2, 300], [3, 220], [4, 150], [5, 120], [6, 80], [8, 60], [10, 50], [12, 30], [15, 25], [20, 18], [25, 12], [50, 5], [100, 2]],
        orbBase: false, accFree: false, scatPay: { 4: 300, 5: 500, 6: 10000 }, free: 10, retrig: [3, 5], maxFree: 60, buy: 100, max: 21175,
      },
      // «Rebuçado Louco 1000»: grupos 7×7 com casas que multiplicam até ×1024 (nas grátis ficam). Real: 96,53%, 25 000×, compra a 100× ou 500× (super: todas as casas a ×2).
      rebucado: {
        kind: 'cluster', cols: 7, rows: 7, min: 5, nsym: 7, trig: 3,
        // 0 cristal azul, 1 marshmallow, 2 estrela, 3 cubo roxo, 4 minhoca verde, 5 urso laranja, 6 urso vermelho, 7 máquina de pastilhas (scatter)
        w: [140, 130, 120, 110, 95, 80, 65, 4],
        wFree: [265, 246, 227, 110, 95, 80, 65, 4],
        // grupos de 5, 6, 7 … 14 e 15 ou mais
        pay: [[81, 102, 122, 163, 203, 305, 407, 610, 813, 1220, 2034], [102, 122, 163, 203, 244, 407, 610, 813, 1220, 1627, 3050], [122, 163, 203, 244, 325, 488, 813, 1220, 1627, 2034, 4067], [163, 203, 244, 325, 407, 610, 1017, 1627, 2034, 3050, 6100], [203, 244, 325, 407, 610, 813, 1220, 2034, 3050, 4067, 8134], [305, 407, 488, 610, 813, 1220, 2034, 3050, 4067, 6100, 12201], [407, 610, 813, 1017, 1220, 2034, 3050, 4067, 6100, 10168, 20335]],
        spotMax: 1024, superSpots: [[2, 70], [4, 20], [8, 8], [16, 2]], fs: { 3: 10, 4: 12, 5: 15, 6: 20, 7: 30 }, maxFree: 60, buy: 100, superBuy: 935, max: 25000, // compra super: cada casa começa com ×2 (70%), ×4 (20%), ×8 (8%) ou ×16 (2%). Em 480 000 compras simuladas devolve em média 903× a aposta, por isso custa 935× (retorno de cerca de 96,6%)
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
    // Golpes em grupo: um membro abre, os outros alinham (cada um paga a stamina ao alinhar) e ao fim de 2 minutos resolve-se.
    // A dificuldade compara-se com a soma das stats de quem foi; o saque é por cabeça. No máximo 3 por jogador em 24 h.
    heists: [
      { id: 'carrinha', need: 2, sede: 1, e: 20, D: 150, min: 3000, max: 4500, r: 14, jailMin: 6, bailAs: 5, w: { I: 40, F: 60, C: 0 } },
      { id: 'casino', need: 3, sede: 2, e: 30, D: 450, min: 16000, max: 24000, r: 22, jailMin: 9, bailAs: 8, w: { I: 50, F: 0, C: 50 } },
      { id: 'banco', need: 4, sede: 3, e: 40, D: 1000, min: 75000, max: 105000, r: 30, jailMin: 10, bailAs: 9, w: { I: 40, F: 30, C: 30 } },
    ],
    heistPerDay: 3, opMs: 2 * MIN, hitMs: 90 * 1000, opCoolMs: 5 * MIN, opMax: 8,
    // Tareia em grupo: soma-se o ataque de todos (a 85%), o alvo só vai uma vez para o hospital (30 min) e só perde respeito uma vez;
    // cada atacante ganha 70% do que ganharia sozinho, com o mesmo desconto por repetir o alvo.
    hitNeed: 2, hitTeamBp: 8500, hitShareBp: 7000, hitHospBp: 15000,
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
    // cada visita sobe 10% o preço DESSA puta durante 24 h; as outras não mexem. maxList: quantas visitas se guardam ao todo.
    windowMs: 24 * HOUR, stepNum: 11, stepDen: 10, maxSteps: 60, maxList: 240,
    sickCutBp: 1500, // doente: −15% em todas as stats até se tratar
    cureMin: 40, cureValueBp: 1000, // tratar custa o que rendem 10 de stamina
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
    { id: 'erva', price: 25000, perH: 1800, resp: 24, stat: 'I', raid: true, toBank: false },
    { id: 'laboratorio', price: 120000, perH: 9600, resp: 45, stat: 'I', raid: true, toBank: false },
    { id: 'coca', price: 500000, perH: 42000, resp: 90, stat: 'I', raid: true, toBank: false },
  ],

  // Porto: contentor volta ao fim de 4 h com +30%, ou é apreendido (15%).
  port: { ms: 4 * HOUR, gainBp: 3000, seizeBp: 1500, minAmount: 100, capBase: 1000, capNum: 8, capDen: 5, slotsEveryLevels: 5 }, // limite por contentor: 1000 × 1,6^(nível−1)

  weapons: [
    { id: 'soqueira', price: 500, bp: 1000 },
    { id: 'navalha', price: 3000, bp: 2500 },
    { id: 'pistola', price: 20000, bp: 5000 },
    { id: 'cacadeira', price: 120000, bp: 8000 },
    { id: 'metralhadora', price: 700000, bp: 12000 },
    { id: 'sniper', price: 4000000, bp: 17000 },
  ],
  armors: [
    { id: 'cabedal', price: 400, bp: 1000 },
    { id: 'colete', price: 2500, bp: 2500 },
    { id: 'balistico', price: 18000, bp: 5000 },
    { id: 'kevlar', price: 110000, bp: 8000 },
    { id: 'blindado', price: 650000, bp: 12000 },
    { id: 'titanio', price: 3800000, bp: 17000 },
  ],

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
