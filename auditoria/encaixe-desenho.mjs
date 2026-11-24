// Testa o encaixe das paragens no desenho oficial (dados reais de 24/11/2026: 93 viagens da Carris Metropolitana saíam
// sem desenho, com o desenho certo):
//  - linhas que vão e voltam pela mesma rua (Ericeira: 19 paragens repetidas) — o desenho passa muitas vezes no mesmo
//    sítio e só se olhava para 6 passagens; a certa ficava de fora e o encaixe recuava 1,6 km e era recusado;
//  - uma paragem com as coordenadas erradas no ficheiro do operador (a 38 km do resto da linha) arrastava as vizinhas e
//    o desenho inteiro era recusado. Agora essa paragem fica fora da ordem e sem posição (linha reta só nela).
// Uso: APP=<pasta da app> tsx auditoria/encaixe-desenho.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const APP = process.env.APP || '../parou';
const U = await import(`${APP}/src/utils/caminho.ts`);
let falhas = 0;
const ok = (n, c, e = '') => { if (!c) falhas++; console.log(c ? 'OK     ' : 'FALHOU ', n, e); };

// Os dois casos reais
const reais = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/encaixe-cmh.json'), 'utf8'));
for (const c of reais.casos) {
  const d = U.descodificarPolilinha(c.desenho);
  const e = U.encaixarNoDesenho(d, c.paragens);
  ok(`[real] ${c.o}: o desenho oficial serve`, !!e, e ? '' : `recua ${Math.round(U.encaixarParagens(d, c.paragens)?.retrocessoM)} m`);
  if (e) {
    const cortes = U.cortesDoEncaixe(e.encaixe);
    ok(`[real] ${c.o}: paragens encaixadas`, cortes.filter((x) => x !== null).length >= c.paragens.length - 1, `${cortes.filter((x) => x !== null).length}/${c.paragens.length}`);
  }
}

// Rua em ziguezague (curvas a cada 40 m) que a linha percorre 4 vezes: ida, volta, ida, volta (4 passagens × vários mínimos)
const rua = [];
for (let i = 0; i <= 40; i++) rua.push({ lat: 38.90 + i * 0.0004, lon: -9.40 + (i % 2 ? 0.00025 : 0) });
const ida = rua, volta = [...rua].reverse();
const desenho = [...ida, ...volta.slice(1), ...ida.slice(1), ...volta.slice(1)];
const naRua = (i) => ({ lat: 38.90 + i * 0.0004 + 0.00002, lon: -9.40 + 0.0001 });
const paragens = [];
for (const [de, ate, passo] of [[0, 40, 5], [40, 0, -5], [0, 40, 5], [40, 0, -5]]) for (let i = de; passo > 0 ? i <= ate : i >= ate; i += passo) paragens.push(naRua(i));
const e1 = U.encaixarNoDesenho(desenho, paragens);
ok('[ida e volta 4×] o desenho serve', !!e1, e1 ? '' : JSON.stringify(U.encaixarParagens(desenho, paragens)?.retrocessoM));
if (e1) {
  const pos = e1.encaixe.posicoes;
  ok('[ida e volta 4×] posições sempre a avançar', pos.every((p, i) => i === 0 || p >= pos[i - 1]));
  ok('[ida e volta 4×] sem recuar', e1.encaixe.retrocessoM === 0, String(e1.encaixe.retrocessoM));
  ok('[ida e volta 4×] a última paragem fica no fim do desenho', pos[pos.length - 1] > desenho.length * 0.9, `${pos[pos.length - 1]} de ${desenho.length}`);
}

// Linha a direito com uma paragem com coordenadas erradas (38 km ao lado)
const reta = Array.from({ length: 200 }, (_, i) => ({ lat: 38.70, lon: -9.20 + i * 0.0005 }));
const pr = Array.from({ length: 20 }, (_, i) => ({ lat: 38.7001, lon: -9.20 + i * 0.005 }));
pr[8] = { lat: 39.04, lon: -9.20 + 8 * 0.005 };
const e2 = U.encaixarNoDesenho(reta, pr);
ok('[paragem errada] o desenho continua a servir', !!e2);
if (e2) {
  const c = U.cortesDoEncaixe(e2.encaixe);
  ok('[paragem errada] só essa paragem fica sem posição', c.filter((x) => x === null).length === 1 && c[8] === null, JSON.stringify(c));
  ok('[paragem errada] as vizinhas ficam no sítio certo (não arrastadas)', Math.abs(c[9] - 9 * 10) < 2 && Math.abs(c[7] - 7 * 10) < 2, `${c[7]} ${c[9]}`);
}

// Continua a recusar um desenho de outra linha
const outra = Array.from({ length: 100 }, (_, i) => ({ lat: 38.75, lon: -9.20 + i * 0.001 }));
ok('[outra linha] desenho a 5 km das paragens é recusado', !U.encaixarNoDesenho(outra, pr));
const meio = [...reta.slice(0, 100), ...Array.from({ length: 100 }, (_, i) => ({ lat: 38.70 + i * 0.0005, lon: -9.20 + 99 * 0.0005 }))];
ok('[outra linha] desenho que se afasta a meio (metade das paragens longe) é recusado', !U.encaixarNoDesenho(meio, pr));

const t0 = Date.now();
for (let i = 0; i < 50; i++) U.encaixarNoDesenho(desenho, paragens);
ok('[rapidez] 50 encaixes de uma linha com 36 paragens e 160 pontos em menos de 1 s', Date.now() - t0 < 1000, `${Date.now() - t0} ms`);

console.log(falhas ? `${falhas} testes falharam` : 'Todos os testes passaram');
process.exit(falhas ? 1 : 0);
