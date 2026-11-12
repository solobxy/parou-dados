// Madeira e Açores: o Perto explica que ainda não há horários (em vez de «Sem paragens nesta área»)
// e os avisos do IPMA chegam às zonas que não estão na lista de cidades do IPMA (costa norte e serras da Madeira).
// Uso: APP=caminho-da-app node --import tsx auditoria/ilhas.mjs
const caminho = process.env.APP || '../app';
const Z = await import(`${caminho}/src/utils/zonasSemHorarios.ts`).catch((e) => ({ erro: e }));
const A = await import(`${caminho}/src/server/zonasAvisoIlhas.ts`).catch((e) => ({ erro: e }));
let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };
ok('existe zonaSemHorarios', typeof Z.zonaSemHorarios === 'function', Z.erro?.message || '');
ok('existem as zonas de aviso das ilhas', typeof A.porAreaPreferida === 'function' && typeof A.zonaSoDeAvisos === 'function', A.erro?.message || '');

if (typeof Z.zonaSemHorarios === 'function') {
  const z = Z.zonaSemHorarios;
  ok('[zona] Machico → madeira', z(32.7166, -16.7666) === 'madeira');
  ok('[zona] Porto Santo → madeira', z(33.06, -16.34) === 'madeira');
  ok('[zona] Ponta Delgada → acores', z(37.74, -25.668) === 'acores');
  ok('[zona] Flores → acores', z(39.45, -31.13) === 'acores');
  ok('[zona] Lisboa → nada', z(38.72, -9.14) === null);
  ok('[zona] Faro → nada', z(37.02, -7.93) === null);
  ok('[zona] sem posição → nada', z(undefined, undefined) === null && z(NaN, NaN) === null);
  ok('[zona] link da SIGA', /^https:\/\/siga\.madeira\.gov\.pt\//.test(Z.HORARIOS_SIGA || ''));
}

if (typeof A.porAreaPreferida === 'function') {
  // Lista como o IPMA a publica (distrits-islands.json), só as ilhas
  const ipma = [
    { area: 'MCS', nome: 'Funchal', globalIdLocal: 2310300, lat: 32.6485, lon: -16.9084, idRegiao: 2 },
    { area: 'MPS', nome: 'Porto Santo', globalIdLocal: 2320100, lat: 33.07, lon: -16.34, idRegiao: 2 },
    { area: 'AOR', nome: 'Vila do Porto', globalIdLocal: 3410100, lat: 36.9563, lon: -25.1409, idRegiao: 3 },
    { area: 'AOR', nome: 'Ponta Delgada', globalIdLocal: 3420300, lat: 37.7415, lon: -25.6677, idRegiao: 3 },
    { area: 'ACE', nome: 'Angra do Heroísmo', globalIdLocal: 3430100, lat: 38.67, lon: -27.22, idRegiao: 3 },
    { area: 'ACE', nome: 'Horta', globalIdLocal: 3470100, lat: 38.5363, lon: -28.6315, idRegiao: 3 },
    { area: 'AOC', nome: 'Santa Cruz das Flores', globalIdLocal: 3480200, lat: 39.45, lon: -31.13, idRegiao: 3 },
    { area: 'AOC', nome: 'Vila do Corvo', globalIdLocal: 3490100, lat: 39.67, lon: -31.12, idRegiao: 3 },
  ];
  const m = A.porAreaPreferida(ipma);
  ok('[aviso] grupo oriental = Ponta Delgada', m.get('AOR')?.nome === 'Ponta Delgada', m.get('AOR')?.nome);
  ok('[aviso] grupo central = Angra do Heroísmo', m.get('ACE')?.nome === 'Angra do Heroísmo', m.get('ACE')?.nome);
  ok('[aviso] grupo ocidental = Santa Cruz das Flores', m.get('AOC')?.nome === 'Santa Cruz das Flores', m.get('AOC')?.nome);
  ok('[aviso] costa norte da Madeira existe', m.has('MCN'));
  ok('[aviso] serras da Madeira existem', m.has('MRM'));
  ok('[aviso] continente sem Madeira não ganha zonas', !A.porAreaPreferida([{ area: 'LSB', nome: 'Lisboa', globalIdLocal: 1, lat: 38.7, lon: -9.1, idRegiao: 1 }]).has('MCN'));
  const ilha = A.areasLocaisAviso('MCS');
  ok('[aviso] no Funchal contam as duas costas e as serras', ['MCS', 'MCN', 'MRM'].every((a) => ilha.includes(a)), ilha.join());
  ok('[aviso] costa norte e serras não são locais à parte', A.zonaSoDeAvisos('MCN') && A.zonaSoDeAvisos('MRM') && !A.zonaSoDeAvisos('MCS') && !A.zonaSoDeAvisos('AOR'));
  ok('[aviso] Porto Santo só Porto Santo', A.areasLocaisAviso('MPS').join() === 'MPS');
  // O IPMA só tem previsão diária para as cidades de distrits-islands.json (na Madeira, Funchal e Porto Santo):
  // um número inventado deixava a zona sem previsão (2311000 dá 404)
  ok('[aviso] zonas extra usam uma previsão que existe', (A.ZONAS_EXTRA || []).every((z) => [2310300, 2320100].includes(z.globalIdLocal)), (A.ZONAS_EXTRA || []).map((z) => z.globalIdLocal).join());
  ok('[aviso] em Lisboa só Lisboa', A.areasLocaisAviso('LSB').join() === 'LSB');
  ok('[aviso] nome das serras', A.nomeDaZona('MRM', m) === 'Madeira (serras)');
  ok('[aviso] nome no continente é o distrito', A.nomeDaZona('LSB', new Map([['LSB', { nome: 'Lisboa' }]])) === 'Lisboa');
  ok('[aviso] notificações chegam à região', A.regiaoDaZona(2) === 'Madeira' && A.regiaoDaZona(3) === 'Açores' && A.regiaoDaZona(1) === null);
}
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTodos os testes OK');
process.exit(falhas ? 1 : 0);
