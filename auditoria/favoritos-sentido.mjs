// Favoritos por sentido (pedido do Dinis, 27/11/2026: «o 801 tem sentido Cordoaria e sentido S. Pedro da Cova,
// devia dar para favoritar independentemente cada sentido»). Funções puras da app:
//   - ids «line-<linha>» (linha inteira) e «line-<linha>~s<sentido>»;
//   - estrela de um sentido: guarda, tira, e com a linha inteira guardada fica só o outro sentido;
//   - avisos das linhas e lista dos Horários continuam a ver a linha (sem o sufixo do sentido).
const APP = process.env.APP || '../parou';
const { idFavoritoLinha, linhaDoFavorito, sentidosGuardados, alternarSentido } = await import(`${APP}/src/utils/linhaFavorita.ts`);
const { linhasParaAvisos } = await import(`${APP}/src/utils/avisosLinha.ts`);

let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

ok('id da linha inteira fica como antes', idFavoritoLinha('stcp:801') === 'line-stcp:801');
ok('id de um sentido', idFavoritoLinha('stcp:801', 1) === 'line-stcp:801~s1');
ok('id do sentido 0', idFavoritoLinha('stcp:801', 0) === 'line-stcp:801~s0');
ok('lê a linha inteira', igual(linhaDoFavorito('line-stcp:801'), { routeId: 'stcp:801' }));
ok('lê um sentido', igual(linhaDoFavorito('line-stcp:801~s1'), { routeId: 'stcp:801', sentido: 1 }));
ok('ids com «_» e «:» da CP/Carris ficam intactos', igual(linhaDoFavorito('line-carris:245_0'), { routeId: 'carris:245_0' }));
ok('não é linha: paragem', linhaDoFavorito('stop-stcp:BLM1') === null);
ok('não é linha: lixo', linhaDoFavorito(undefined) === null && linhaDoFavorito('line-') === null);

const s = (ids) => ids.map((id) => ({ id }));
const g1 = sentidosGuardados(s(['line-stcp:801~s1', 'line-stcp:801~s0', 'line-stcp:300']), 'stcp:801');
ok('sentidos guardados: os dois sentidos', g1 instanceof Set && g1.has(0) && g1.has(1) && g1.size === 2);
ok('sentidos guardados: linha inteira', sentidosGuardados(s(['line-stcp:801']), 'stcp:801') === 'toda');
const g3 = sentidosGuardados(s(['line-stcp:8010~s1']), 'stcp:801');
ok('outra linha com o número a começar igual não conta', g3 instanceof Set && g3.size === 0);

// Estrela de um sentido
let r = alternarSentido([], 'stcp:801', 1, [0, 1]);
ok('nada guardado → guarda só este sentido', igual(r, { tirar: [], juntar: [1], ficaGuardado: true }), JSON.stringify(r));
r = alternarSentido(s(['line-stcp:801~s1']), 'stcp:801', 1, [0, 1]);
ok('sentido guardado → sai', igual(r, { tirar: ['line-stcp:801~s1'], juntar: [], ficaGuardado: false }), JSON.stringify(r));
r = alternarSentido(s(['line-stcp:801~s1']), 'stcp:801', 0, [0, 1]);
ok('o outro sentido junta-se sem tirar o primeiro', igual(r, { tirar: [], juntar: [0], ficaGuardado: true }), JSON.stringify(r));
r = alternarSentido(s(['line-stcp:801']), 'stcp:801', 0, [0, 1]);
ok('linha inteira guardada (favorito antigo) → fica só o outro sentido', igual(r, { tirar: ['line-stcp:801'], juntar: [1], ficaGuardado: false }), JSON.stringify(r));
r = alternarSentido(s(['line-cp:x']), 'cp:x', 0, [0]);
ok('linha de um só sentido guardada inteira → sai', igual(r, { tirar: ['line-cp:x'], juntar: [], ficaGuardado: false }), JSON.stringify(r));

// Avisos: um sentido guardado ainda conta como a linha (uma só vez)
const av = linhasParaAvisos([
  { id: 'line-stcp:801~s0', operatorName: 'STCP', lineCode: '801' },
  { id: 'line-stcp:801~s1', operatorName: 'STCP', lineCode: '801' },
  { id: 'line-cm:1001~s0' },
]);
ok('avisos: os dois sentidos do 801 dão uma só linha', av.filter((x) => x.ln === '801').length === 1, JSON.stringify(av));
ok('avisos: sentido sem dados usa o id da linha sem o sufixo', av.some((x) => x.op === 'cm' && x.ln === '1001'), JSON.stringify(av));

console.log(falhas ? `${falhas} FALHOU` : 'Tudo OK');
process.exit(falhas ? 1 : 0);
