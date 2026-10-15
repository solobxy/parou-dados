// Testa quando a bola do autocarro «meu» pode ir em cima do ponto da pessoa (src/utils/trajetoVeiculo.ts: raioABordoM, pessoaPodeIrABordo).
// O erro que isto evita: a pessoa, longe do autocarro (em casa, por teste ou por engano), toca em «Estou a bordo» e a bola do autocarro
// saltava para o ponto dela e ficava lá parada. Só se segue a pessoa se ela está tão perto do autocarro quanto o atraso das posições
// do operador explica (as posições chegam com 10 a 45 s de idade).
// Uso: APP=caminho-da-app node --import tsx auditoria/seguir-pessoa.mjs
const caminho = process.env.APP || '../app';
const M = await import(`${caminho}/src/utils/trajetoVeiculo.ts`);

let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };
const pode = (d, v, ja = false) => M.pessoaPodeIrABordo(d, v, ja);

ok('[raio] existem as funções', typeof M.raioABordoM === 'function' && typeof M.pessoaPodeIrABordo === 'function');
if (typeof M.raioABordoM === 'function') {
  // A bordo de verdade: a posição do operador atrasa-se até uns 45 s; à velocidade do autocarro dá a distância a que a pessoa pode estar do modelo
  ok('[a bordo] autocarro a 8 m/s (29 km/h), modelo 200 m atrás (atraso medido no mapa): segue', pode(200, 8));
  ok('[a bordo] autocarro a 14 m/s (50 km/h), modelo 560 m atrás (40 s de idade): segue', pode(560, 14));
  ok('[a bordo] autocarro parado e a pessoa em cima dele: segue', pode(10, 0));
  ok('[a bordo] autocarro parado numa paragem, pessoa a 60 m: segue', pode(60, 0));
  // Longe: não é possível estar lá dentro
  ok('[longe] a 1,2 km do autocarro, parada: não segue', !pode(1200, 0));
  ok('[longe] a 3 km do autocarro: não segue', !pode(3000, 0));
  ok('[longe] a 3 km, mesmo com o autocarro rápido (20 m/s): não segue', !pode(3000, 20));
  ok('[longe] a 600 m de um autocarro parado: não segue', !pode(600, 0));
  ok('[longe] a 5 km, já a seguir (histerese): deixa de seguir', !pode(5000, 8, true));
  // Histerese: depois de começar a seguir tolera-se um pouco mais, para não oscilar na fronteira
  const r = M.raioABordoM(8);
  ok('[raio] cresce com a velocidade', M.raioABordoM(14) > M.raioABordoM(8) && M.raioABordoM(8) >= M.raioABordoM(0));
  ok('[raio] nunca abaixo de 200 m nem acima de 900 m', M.raioABordoM(0) >= 200 && M.raioABordoM(100) <= 900, `${M.raioABordoM(0)} .. ${M.raioABordoM(100)}`);
  ok('[histerese] um pouco acima do raio: não começa a seguir', !pode(r * 1.2, 8, false));
  ok('[histerese] um pouco acima do raio: se já segue, continua', pode(r * 1.2, 8, true));
  ok('[histerese] muito acima do raio: mesmo a seguir, deixa de seguir', !pode(r * 1.6, 8, true));
  // Valores estranhos nunca fazem seguir
  ok('[robustez] distância inválida (NaN): não segue', !pode(NaN, 8) && !pode(NaN, 8, true));
  ok('[robustez] velocidade inválida (NaN): usa a mínima, não rebenta', typeof pode(100, NaN) === 'boolean' && pode(100, NaN));
  ok('[robustez] distância infinita: não segue', !pode(Infinity, 8));
}

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTodos os testes OK');
process.exit(falhas ? 1 : 0);
