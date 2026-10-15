// Testa o desenho dos percursos pela estrada (src/utils/caminho.ts): polilinha codificada igual à do construtor dos dados (Python),
// encaixe das paragens no desenho (linhas circulares, paragens dos dois lados da estrada, desenho ao contrário ou de outro sítio)
// e o troço entre duas paragens que a app desenha.
// Uso: APP=<pasta da app> node --import tsx auditoria/caminho.mjs
const caminho = process.env.APP || '../app';
const C = await import(`${caminho}/src/utils/caminho.ts`);
const { metros } = await import(`${caminho}/src/utils/geoPercurso.ts`);

let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };
const perto = (a, b, tol) => Math.abs(a - b) <= tol;

// ------------------------------------------------------------ polilinha
{
  // Exemplo da documentação da Google (5 casas)
  const g = C.descodificarPolilinha('_p~iF~ps|U_ulLnnqC_mqNvxq`@', 5);
  ok('[polilinha] exemplo da Google (5 casas) descodifica', g.length === 3 && perto(g[0].lat, 38.5, 1e-9) && perto(g[1].lon, -120.95, 1e-9) && perto(g[2].lat, 43.252, 1e-9) && perto(g[2].lon, -126.453, 1e-9), JSON.stringify(g));
  ok('[polilinha] exemplo da Google (5 casas) codifica igual', C.codificarPolilinha(g, 5) === '_p~iF~ps|U_ulLnnqC_mqNvxq`@');
  // O que o construtor dos dados (Python) escreveu com 6 casas, para estes pontos
  const texto = 'siqnmAziqlOkW{mTwnCgpA??ut_DxsY';
  const pts = C.descodificarPolilinha(texto);
  const esperado = [[41.14961, -8.61099], [41.15, -8.6], [41.1523, -8.5987], [41.1523, -8.5987], [41.234567, -8.612345]];
  ok('[polilinha] descodifica o que o Python escreveu (6 casas)', pts.length === 5 && esperado.every((e, i) => perto(pts[i].lat, e[0], 1e-9) && perto(pts[i].lon, e[1], 1e-9)), JSON.stringify(pts));
  ok('[polilinha] codifica exatamente o mesmo texto que o Python', C.codificarPolilinha(esperado.map(([lat, lon]) => ({ lat, lon }))) === texto);
  // Ida e volta com muitos pontos (Portugal continental, ilhas, longitudes negativas)
  let s = 12345; const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const muitos = Array.from({ length: 4000 }, () => ({ lat: 32.6 + r() * 9.5, lon: -31.3 + r() * 24.8 }));
  const volta = C.descodificarPolilinha(C.codificarPolilinha(muitos));
  ok('[polilinha] 4000 pontos: ida e volta sem perder nada (≤ 0,0000005°)', volta.length === muitos.length && muitos.every((p, i) => perto(p.lat, volta[i].lat, 5e-7) && perto(p.lon, volta[i].lon, 5e-7)));
  ok('[polilinha] texto cortado a meio não rebenta', (() => { try { return C.descodificarPolilinha(texto.slice(0, 9)).length <= 2; } catch { return false; } })());
  ok('[polilinha] texto vazio dá lista vazia', C.descodificarPolilinha('').length === 0);
}

// ------------------------------------------------------------ geometria de teste
const LAT0 = 41.15, LON0 = -8.61, M = 111320, COS = Math.cos(LAT0 * Math.PI / 180);
const ll = (x, y) => ({ lat: LAT0 + y / 110540, lon: LON0 + x / (M * COS) });
const comprimento = (ps) => ps.slice(1).reduce((a, p, i) => a + metros(ps[i], p), 0);
/** Desenho com curvas: sobe 1 km para este, vira, sobe outro, etc. (como uma estrada com esquinas) */
const estrada = [[0, 0], [400, 0], [400, 300], [900, 300], [900, 700], [1500, 700], [1500, 1200]].flatMap((p, i, a) => {
  if (!i) return [ll(...p)];
  const q = a[i - 1]; // pontos intermédios de 25 m
  const n = Math.max(1, Math.round(Math.hypot(p[0] - q[0], p[1] - q[1]) / 25));
  return Array.from({ length: n }, (_, k) => ll(q[0] + ((p[0] - q[0]) * (k + 1)) / n, q[1] + ((p[1] - q[1]) * (k + 1)) / n));
});
const naEstrada = (x, y, lado = 0) => ll(x, y + lado);

// ------------------------------------------------------------ encaixe simples
{
  const paragens = [[0, 5], [400, 150], [650, 300], [900, 500], [1500, 700], [1500, 1200]].map(([x, y]) => naEstrada(x, y));
  // as paragens estão em cima da estrada (a 3.ª e a 4.ª em cima das esquinas certas)
  const e = C.encaixarParagens(estrada, [ll(0, 0), ll(400, 150), ll(650, 300), ll(900, 500), ll(1500, 700), ll(1500, 1200)]);
  ok('[encaixe] encaixa 6 paragens', !!e && e.posicoes.length === 6);
  ok('[encaixe] as posições não decrescem', !!e && e.posicoes.every((p, i, a) => i === 0 || p >= a[i - 1]));
  ok('[encaixe] paragens em cima da estrada: desvio < 1 m', !!e && e.desviosM.every((d) => d < 1), e ? e.desviosM.map((d) => d.toFixed(2)).join(',') : '');
  ok('[encaixe] sem recuos', !!e && e.retrocessoM === 0);
  void paragens;
}

// ------------------------------------------------------------ linha circular: a última paragem é a primeira
{
  // Volta ao quarteirão: (0,0) → (300,0) → (300,300) → (0,300) → (0,0)
  const cantos = [[0, 0], [300, 0], [300, 300], [0, 300], [0, 0]];
  const volta = cantos.flatMap((p, i, a) => {
    if (!i) return [ll(...p)];
    const q = a[i - 1];
    return Array.from({ length: 12 }, (_, k) => ll(q[0] + ((p[0] - q[0]) * (k + 1)) / 12, q[1] + ((p[1] - q[1]) * (k + 1)) / 12));
  });
  const paragens = [ll(0, 0), ll(300, 0), ll(300, 300), ll(0, 300), ll(0, 0)];
  const e = C.encaixarParagens(volta, paragens);
  const n = volta.length - 1;
  ok('[circular] a primeira paragem fica no princípio', !!e && e.posicoes[0] < 0.5);
  ok('[circular] a última paragem (no mesmo sítio que a primeira) fica no FIM do desenho', !!e && e.posicoes[4] > n - 0.5, e ? `pos=${e.posicoes[4].toFixed(2)} de ${n}` : '');
  ok('[circular] as do meio ficam no sítio certo (esquinas a 12, 24 e 36)', !!e && perto(e.posicoes[1], 12, 0.6) && perto(e.posicoes[2], 24, 0.6) && perto(e.posicoes[3], 36, 0.6), e ? e.posicoes.map((p) => p.toFixed(1)).join(',') : '');
  ok('[circular] o encaixe é válido', !!C.encaixeValido(volta, paragens));
}

// ------------------------------------------------------------ paragens dos dois lados da estrada
{
  // Estrada reta de 600 m; paragens alternadas a 12 m para cada lado e a 6 m de distância umas das outras
  const reta = Array.from({ length: 25 }, (_, k) => ll(k * 25, 0));
  const xs = [30, 36, 120, 125, 300, 297, 450, 520];
  const paragens = xs.map((x, i) => ll(x, i % 2 ? 12 : -12));
  const e = C.encaixeValido(reta, paragens);
  ok('[dois lados] paragens que se cruzam por poucos metros continuam válidas', !!e);
  ok('[dois lados] posições nunca decrescem (corrigidas)', !!e && e.posicoes.every((p, i, a) => i === 0 || p >= a[i - 1]));
  ok('[dois lados] o recuo corrigido é pequeno (< 20 m)', !!e && e.retrocessoM < 20, e ? `${e.retrocessoM.toFixed(1)} m` : '');
}

// ------------------------------------------------------------ desenho que não serve
{
  const paragens = [ll(0, 0), ll(400, 150), ll(650, 300), ll(900, 500), ll(1500, 700), ll(1500, 1200)];
  const ao_contrario = [...estrada].reverse();
  ok('[não serve] desenho ao contrário das paragens é recusado', C.encaixeValido(ao_contrario, paragens) === null);
  const outroSitio = estrada.map((p) => ({ lat: p.lat + 0.01, lon: p.lon }));
  ok('[não serve] desenho a 1 km das paragens é recusado', C.encaixeValido(outroSitio, paragens) === null);
  ok('[não serve] desenho com 1 ponto: sem encaixe', C.encaixarParagens([ll(0, 0)], paragens) === null);
  ok('[não serve] sem paragens: sem encaixe', C.encaixarParagens(estrada, []) === null);
}

// ------------------------------------------------------------ desenho no sentido contrário
{
  const paragens = [ll(0, 0), ll(400, 150), ll(650, 300), ll(900, 500), ll(1500, 700), ll(1500, 1200)];
  const contrario = [...estrada].reverse(); // o operador desenhou a viagem ao contrário (Corroios → Cacilhas em vez de Cacilhas → Corroios)
  const r = C.encaixarNoDesenho(contrario, paragens);
  ok('[ao contrário] um desenho ao contrário é virado e passa a servir', !!r && r.invertido === true);
  ok('[ao contrário] depois de virado, as posições não decrescem e o recuo é 0', !!r && r.encaixe.retrocessoM === 0 && r.encaixe.posicoes.every((p, i, a) => i === 0 || p >= a[i - 1]));
  ok('[ao contrário] o desenho virado vai da 1.ª paragem à última', !!r && metros(r.desenho[0], paragens[0]) < 1 && metros(r.desenho[r.desenho.length - 1], paragens[5]) < 1);
  const certo = C.encaixarNoDesenho(estrada, paragens);
  ok('[ao contrário] um desenho no sentido certo não se vira', !!certo && certo.invertido === false && certo.desenho === estrada);
  const longe = estrada.map((p) => ({ lat: p.lat + 0.01, lon: p.lon }));
  ok('[ao contrário] um desenho de outro sítio continua a ser recusado nos dois sentidos', C.encaixarNoDesenho(longe, paragens) === null);
}

// ------------------------------------------------------------ fatiar
{
  const total = comprimento(estrada);
  const todo = C.fatiarDesenho(estrada, 0, estrada.length - 1);
  ok('[fatiar] o desenho inteiro tem o comprimento do desenho', perto(comprimento(todo), total, 0.5), `${comprimento(todo).toFixed(1)} vs ${total.toFixed(1)}`);
  const meio = C.fatiarDesenho(estrada, 16.5, 40.25);
  ok('[fatiar] o troço começa e acaba nas posições pedidas', metros(meio[0], C.pontoNaPosicao(estrada, 16.5)) < 0.01 && metros(meio[meio.length - 1], C.pontoNaPosicao(estrada, 40.25)) < 0.01);
  ok('[fatiar] leva os pontos do desenho que ficam pelo meio (17 a 40 = 24 pontos)', meio.length === 2 + 24, String(meio.length));
  const inteiro = C.fatiarDesenho(estrada, 10, 20);
  ok('[fatiar] entre dois pontos do desenho não repete pontos (11 pontos)', inteiro.length === 11, String(inteiro.length));
  ok('[fatiar] mesma posição: dois pontos iguais, sem rebentar', C.fatiarDesenho(estrada, 5.5, 5.5).length === 2);
}

// ------------------------------------------------------------ o que a app desenha
{
  const paragens = [ll(0, 0), ll(400, 150), ll(650, 300), ll(900, 500), ll(1500, 700), ll(1500, 1200)];
  const enc = C.encaixeValido(estrada, paragens);
  const texto = C.codificarPolilinha(estrada);
  const retas = C.trocosDoPercurso(paragens, 2);
  ok('[app] sem desenho: paragens unidas em linha reta (como antes)', !retas.pelaEstrada && retas.restante.length === 4 && retas.passado.length === 3);
  const via = C.trocosDoPercurso(paragens, 2, texto, enc.posicoes);
  ok('[app] com desenho: pela estrada', via.pelaEstrada);
  ok('[app] a estrada tem muitos mais pontos do que as 4 paragens', via.restante.length > 20, String(via.restante.length));
  // O desenho segue as esquinas: o comprimento é o da estrada (≥ o da linha reta entre paragens) e fica sempre em cima dela
  const ret = comprimento(retas.restante);
  const est = comprimento(via.restante);
  ok('[app] o troço pela estrada é mais comprido do que a linha reta entre paragens (as esquinas)', est > ret + 100, `${est.toFixed(0)} m vs ${ret.toFixed(0)} m`);
  const encostado = via.restante.every((p) => estrada.some((q) => metros(p, q) < 14)); // 25 m entre pontos → a meio ≤ 12,5 m
  ok('[app] cada ponto desenhado está em cima da estrada', encostado);
  ok('[app] o passado e o restante encontram-se na paragem onde se está', metros(via.passado[via.passado.length - 1], via.restante[0]) < 0.01);
  ok('[app] índice 0: nada de passado', C.trocosDoPercurso(paragens, 0, texto, enc.posicoes).passado.length === 0);
  ok('[app] cortes que não batem com as paragens: volta à linha reta', !C.trocosDoPercurso(paragens, 2, texto, enc.posicoes.slice(1)).pelaEstrada);
  ok('[app] desenho vazio: volta à linha reta', !C.trocosDoPercurso(paragens, 2, '', enc.posicoes).pelaEstrada);
  ok('[app] índice fora do intervalo não rebenta', C.trocosDoPercurso(paragens, 99, texto, enc.posicoes).restante.length >= 2);
}

// ------------------------------------------------------------ desenho que só cobre parte da linha
{
  // 10 paragens ao longo da estrada; o desenho só vai até à 7.ª (como o do Metro do Porto, que acaba antes da última estação)
  const paragens = [[0, 0], [200, 0], [400, 100], [400, 300], [650, 300], [900, 400], [900, 700], [1200, 700], [1500, 800], [1500, 1200]].map(([x, y]) => ll(x, y));
  const curto = estrada.slice(0, 1 + 36 + 0); // 0..900 m do desenho (cada 25 m): acaba perto de (900, 300)
  const parcial = [ll(0, 0), ll(200, 0), ll(400, 0), ll(400, 150), ll(400, 300), ll(650, 300), ll(900, 300)];
  void curto;
  const enc = C.encaixeValido(parcial, paragens.slice(0, 7));
  ok('[parcial] 7 paragens encostadas ao desenho: serve', !!enc);
  // com as 10 paragens, 70% encostadas: o desenho já não serve para a viagem inteira
  ok('[parcial] com 3 de 10 paragens fora do desenho (70% encostadas): não serve', C.encaixeValido(parcial, paragens) === null);
  // com 9 de 10 encostadas (90%): serve; a que fica fora é desenhada a direito
  const quase = [...estrada.slice(0, estrada.length)];
  const enc2 = C.encaixarParagens(quase, [...paragens.slice(0, 9).map((p) => p), ll(1500, 1400)]);
  const cortes = C.cortesDoEncaixe(enc2);
  ok('[parcial] a paragem fora do desenho fica sem posição (null)', cortes[9] === null && cortes.slice(0, 9).every((c) => typeof c === 'number'), JSON.stringify(cortes.map((c) => c === null ? null : Math.round(c))));
  const linha = C.desenharPorPares([...paragens.slice(0, 9), ll(1500, 1400)], quase, cortes);
  const ultimo = linha[linha.length - 1];
  ok('[parcial] a linha chega à última paragem (a direito, onde não há desenho)', metros(ultimo, ll(1500, 1400)) < 0.01);
  ok('[parcial] e começa na primeira', metros(linha[0], ll(0, 0)) < 1);
  const seguidos = linha.slice(1).every((p, k) => metros(linha[k], p) < 700);
  ok('[parcial] sem saltos: nenhum segmento desenhado passa de 700 m', seguidos);
}

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nO desenho dos percursos pela estrada funciona.');
process.exit(falhas ? 1 : 0);
