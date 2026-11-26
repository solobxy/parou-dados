// Ordem e duração das opções de viagem (src/utils/escolhaOpcoes.ts).
//
// O que isto impede (queixa real, Rua das Cangostas → Campanhã às 01:56, 26/11/2026):
// - um comboio da CP com greve oficial marcado como «Mais rápido» e posto em primeiro;
// - a duração contada desde agora («4 h 40 min») em vez da viagem em si (05:45 → 06:36 = 51 min);
// - 28 min a pé para chegar uns minutos antes à frente de uma opção com 8 min a pé.
// Uso: APP=caminho-da-app tsx auditoria/escolha-opcoes-greve.mjs
const caminho = process.env.APP || '../app';
let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };
const U = await import(`${caminho}/src/utils/escolhaOpcoes.ts`);

const perna = (modo, greve) => ({ mode: 'TRANSIT', transportMode: modo, ...(greve ? { greve } : {}) });
const op = (id, total, aPe, trocas, pernas, extra = {}) => ({ id, totalDurationMinutes: total, walkingMinutes: aPe, transfersCount: trocas, legs: pernas, departureTime: '05:48', arrivalTime: '06:35', ...extra });
const GREVE = { titulo: 'Greve CP', url: 'https://www.cp.pt', operador: 'CP' };

// O caso real: às 01:56, metro e comboio chegam à mesma hora; o comboio tem greve
const comboio = op('cp', 279, 13, 2, [perna('Autocarro'), perna('Autocarro'), perna('Comboio', GREVE)]);
const metro = op('metro', 279, 16, 2, [perna('Autocarro'), perna('Autocarro'), perna('Metro')]);
const mr = U.maisRapidaDe([comboio, metro]);
ok('«Mais rápido» não é a opção com greve oficial quando há outra sem greve', mr?.id === 'metro', mr?.id);
ok('com greve à hora da viagem a opção fica atrás', [comboio, metro].sort(U.ordemDasOpcoes)[0].id === 'metro');
ok('greve à hora da viagem pesa 45 min', U.custoDaOpcao(comboio) - U.custoDaOpcao({ ...comboio, legs: [perna('Autocarro'), perna('Autocarro'), perna('Comboio')] }) === 45);
const previsto = op('p', 279, 13, 2, [perna('Comboio', { ...GREVE, previsto: true })]);
ok('perturbações previstas pesam 15 min', U.custoDaOpcao(previsto) - U.custoDaOpcao({ ...previsto, legs: [perna('Comboio')] }) === 15);
ok('se todas têm greve, a mais rápida continua a ser escolhida', U.maisRapidaDe([comboio])?.id === 'cp');
ok('greve oficial: 2 à hora, 1 prevista, 0 sem greve', U.greveNaOpcao(comboio) === 2 && U.greveNaOpcao(previsto) === 1 && U.greveNaOpcao(metro) === 0);
// Um comboio com greve 60 min mais rápido do que tudo o resto continua à frente (pode ser a única forma de lá chegar)
const muitoMaisRapido = op('cp2', 60, 5, 0, [perna('Comboio', GREVE)]);
const lento = op('bus', 130, 5, 0, [perna('Autocarro')]);
ok('a greve não esconde uma opção muito mais rápida (60 min contra 130)', [lento, muitoMaisRapido].sort(U.ordemDasOpcoes)[0].id === 'cp2');

// Duração mostrada: só a viagem
ok('às 01:56, 05:45 → 06:36 dura 51 min (não 4 h 40)', U.minutosDaViagem({ id: 'x', departureTime: '05:45', arrivalTime: '06:36', totalDurationMinutes: 280 }) === 51);
ok('passa a meia-noite: 23:50 → 00:20 = 30 min', U.minutosDaViagem({ id: 'x', departureTime: '23:50', arrivalTime: '00:20', totalDurationMinutes: 40 }) === 30);
ok('com dia seguinte marcado: 23:50 → 00:20 (+1) = 30 min', U.minutosDaViagem({ id: 'x', departureTime: '23:50', arrivalTime: '00:20', arrivalDayOffset: 1, totalDurationMinutes: 40 }) === 30);
ok('horas estranhas: fica o que o servidor deu', U.minutosDaViagem({ id: 'x', departureTime: '', arrivalTime: '06:36', totalDurationMinutes: 47 }) === 47);
ok('nunca mais do que o tempo até chegar', U.minutosDaViagem({ id: 'x', departureTime: '06:00', arrivalTime: '05:00', totalDurationMinutes: 30 }) === 30);

// Andar muito a pé: S. Pedro da Cova → Campanhã às 11:20
const poucoAPe = op('8006+8017', 97, 8, 1, [perna('Autocarro'), perna('Autocarro')]);
const muitoAPe = op('801 direto', 79, 28, 0, [perna('Autocarro')]);
ok('28 min a pé para chegar 18 min antes não fica à frente de 8 min a pé', [muitoAPe, poucoAPe].sort(U.ordemDasOpcoes)[0].id === '8006+8017',
  `${U.custoDaOpcao(muitoAPe)} vs ${U.custoDaOpcao(poucoAPe)}`);
ok('até 15 min a pé o peso não muda (cada minuto conta a dobrar)', U.custoDaOpcao(op('a', 30, 15, 0, [])) - U.custoDaOpcao(op('b', 30, 14, 0, [])) === 1);
ok('depois dos 15 min a pé cada minuto pesa mais', U.custoDaOpcao(op('a', 30, 20, 0, [])) - U.custoDaOpcao(op('b', 30, 19, 0, [])) === 2);

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo OK');
process.exit(falhas ? 1 : 0);
