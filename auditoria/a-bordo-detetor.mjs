// Testa o detetor «Está a bordo do …?» (src/utils/aBordo.ts) com viagens simuladas, ruído de GPS, atraso dos autocarros e relógio desacertado.
// Uso: node --import tsx auditoria/a-bordo-detetor.mjs     (APP=caminho da app; por omissão a pasta ao lado)
const caminho = process.env.APP || '../app';
const { DetetorABordo } = await import(`${caminho}/src/utils/aBordo.ts`);
const { projetarNoPercurso, progressoNoPercurso, metros } = await import(`${caminho}/src/utils/geoPercurso.ts`);

let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function gauss(r) { let u = 0, v = 0; while (u === 0) u = r(); v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
const LAT0 = 41.15, LON0 = -8.61, M = 111320, COS = Math.cos(LAT0 * Math.PI / 180);
const ll = (x, y) => ({ lat: LAT0 + y / M, lon: LON0 + x / (M * COS) });

const T0 = 1_760_000_000; // segundos (hora do servidor)

/**
 * Simula `duracao` segundos. `utilizador(t)` devolve {x,y} verdadeiros; `autocarros` = [{id, linha, pos(t)}].
 * Os autocarros medem a posição de 10 em 10 s (tempo do servidor) e a app só a recebe 12 s depois, de 12 em 12 s.
 * `relogioErro`: segundos que o relógio do telemóvel está adiantado; `corrigir`: a app acerta o relógio pelo do servidor.
 */
function simular({ duracao = 150, utilizador, autocarros, relogioErro = 0, corrigir = true, semente = 7, sigma = 5, precisao = 9 }) {
  const r = rng(semente);
  const d = new DetetorABordo();
  const primeiraEm = {};
  let melhorFinal = null;
  for (let t = 0; t <= duracao; t++) {
    const u = utilizador(t);
    const ruido = ll(u.x + gauss(r) * sigma, u.y + gauss(r) * sigma);
    d.adicionarLeitura({ t: (T0 + t + relogioErro) * 1000, lat: ruido.lat, lon: ruido.lon, precisao });
    if (t > 0 && t % 12 === 0) {
      // Posições mais recentes que o operador já enviou (medidas até há 12 s)
      const lista = autocarros.map((a) => {
        const tm = Math.floor((t - 12 - 5) / 10) * 10 + 5;
        const p = a.pos(tm);
        const q = ll(p.x, p.y);
        return { id: a.id, op: 'stcp', linha: a.linha, lat: q.lat, lon: q.lon, rumo: 90, vel: 32, t: T0 + tm };
      }).filter((v) => v.t >= T0 + 5);
      d.adicionarVeiculos(lista, corrigir ? { agoraServidorS: T0 + t, recebidoEmMs: (T0 + t + relogioErro) * 1000 } : undefined);
      const e = d.escolher();
      if (e) {
        melhorFinal = e;
        for (const c of [e.principal, ...e.alternativas]) if (primeiraEm[c.veiculo.id] === undefined) primeiraEm[c.veiculo.id] = t;
      }
    }
  }
  return { d, melhorFinal, primeiraEm };
}

const V = 9; // m/s, ≈ 32 km/h
const autocarro = (id, linha, y = 0, x0 = 0) => ({ id, linha, pos: (t) => ({ x: x0 + V * t, y }) });

// 1) A pessoa entra no 801 aos 40 s e vai com ele
{
  const bus1 = autocarro('stcp:A', '801');
  const bus2 = autocarro('stcp:B', '803', 160, -300); // paralelo, noutra rua
  const bus3 = autocarro('stcp:C', '204', 0, -900);   // atrás, na mesma rua
  const { melhorFinal, primeiraEm } = simular({
    utilizador: (t) => (t < 40 ? { x: 20 + 1.4 * t - 60, y: 6 } : { x: V * t, y: 0 }),
    autocarros: [bus1, bus2, bus3],
  });
  ok('entra no 801: é escolhido', melhorFinal?.principal.veiculo.id === 'stcp:A', JSON.stringify(melhorFinal?.principal && { id: melhorFinal.principal.veiculo.id, d: melhorFinal.principal.distanciaMediaM, n: melhorFinal.principal.amostras }));
  ok('entra no 801: deteta em menos de 2 min depois de entrar', primeiraEm['stcp:A'] !== undefined && primeiraEm['stcp:A'] - 40 <= 110, `aos ${primeiraEm['stcp:A']} s (entrou aos 40)`);
  ok('não confunde com o autocarro da rua ao lado nem o de trás', primeiraEm['stcp:B'] === undefined && primeiraEm['stcp:C'] === undefined);
}

// 2) A pé, o autocarro passa por ele e não há deteção
{
  const { melhorFinal } = simular({ utilizador: (t) => ({ x: 400 + 1.4 * t, y: 5 }), autocarros: [autocarro('stcp:A', '801', 0, 0)] });
  ok('a pé com o autocarro a passar: não pergunta', melhorFinal === null);
}

// 3) Parado na paragem com o autocarro parado ao lado: não pergunta
{
  const parado = { id: 'stcp:A', linha: '801', pos: () => ({ x: 0, y: 0 }) };
  const { melhorFinal } = simular({ utilizador: () => ({ x: 4, y: 3 }), autocarros: [parado] });
  ok('parado na paragem junto ao autocarro: não pergunta', melhorFinal === null);
}

// 4) Dois autocarros lado a lado (linhas diferentes): pergunta com os dois
{
  const { melhorFinal } = simular({
    utilizador: (t) => ({ x: V * t, y: 0 }),
    autocarros: [autocarro('stcp:A', '801', 0), autocarro('stcp:B', '803', 14)],
    sigma: 3, precisao: 6,
  });
  const linhas = melhorFinal ? [melhorFinal.principal.veiculo.linha, ...melhorFinal.alternativas.map((c) => c.veiculo.linha)].sort() : [];
  ok('dois autocarros lado a lado: oferece as duas linhas', linhas.join() === '801,803', linhas.join());
}

// 5) Relógio do telemóvel 8 s adiantado
{
  const bus = autocarro('stcp:A', '801');
  const comCorrecao = simular({ utilizador: (t) => ({ x: V * t, y: 0 }), autocarros: [bus], relogioErro: 8, corrigir: true });
  ok('relógio adiantado 8 s, acertado pelo servidor: deteta', comCorrecao.melhorFinal?.principal.veiculo.id === 'stcp:A');
  const semCorrecao = simular({ utilizador: (t) => ({ x: V * t, y: 0 }), autocarros: [bus], relogioErro: 5, corrigir: false });
  ok('relógio adiantado 5 s, sem acerto: ainda deteta (tolerância de relógio)', semCorrecao.melhorFinal?.principal.veiculo.id === 'stcp:A');
}

// 6) Dizer «Não» faz o autocarro deixar de ser candidato
{
  const bus = autocarro('stcp:A', '801');
  const { d } = simular({ utilizador: (t) => ({ x: V * t, y: 0 }), autocarros: [bus] });
  ok('antes de recusar há candidato', d.escolher()?.principal.veiculo.id === 'stcp:A');
  d.recusar('stcp:A', 10);
  ok('depois de recusar não volta a perguntar', d.escolher() === null);
}

// 7) Pessoa de carro na mesma estrada, 100 m atrás do autocarro (fora do alcance): não pergunta
{
  const { melhorFinal } = simular({ utilizador: (t) => ({ x: V * t - 100, y: 0 }), autocarros: [autocarro('stcp:A', '801')] });
  ok('carro 100 m atrás do autocarro: não pergunta', melhorFinal === null);
}

// 8) Geometria do percurso: progresso ao longo das paragens, sem confundir o regresso numa linha em "U"
{
  const paragens = [];
  for (let i = 0; i <= 5; i++) paragens.push(ll(i * 300, 0));      // ida para este
  for (let i = 5; i >= 0; i--) paragens.push(ll(i * 300, 40));     // volta para oeste, 40 m ao lado
  let p = progressoNoPercurso(paragens, ll(450, 3), {});
  ok('ida: a meio entre a 2.ª e a 3.ª, a seguinte é a 3.ª', p && p.indice === 2 && !p.naParagem, JSON.stringify(p));
  p = progressoNoPercurso(paragens, ll(450, 37), { desde: 6 });
  ok('volta (com a posição anterior): a seguinte é a do regresso', p && p.indice === 10 && !p.naParagem, JSON.stringify(p));
  p = progressoNoPercurso(paragens, ll(450, 20), { desde: 1 });
  ok('à mesma distância dos dois sentidos, a posição anterior (ida) decide', p && p.indice === 2, JSON.stringify(p));
  p = progressoNoPercurso(paragens, ll(450, 20), { desde: 9 });
  ok('à mesma distância dos dois sentidos, a posição anterior (volta) decide', p && p.indice === 10, JSON.stringify(p));
  p = progressoNoPercurso(paragens, ll(900, 0), {});
  ok('em cima de uma paragem diz que está na paragem', p && p.naParagem && p.indice === 3, JSON.stringify(p));
  const proj = projetarNoPercurso(paragens, ll(450, 200), {});
  ok('longe do percurso a distância ao percurso é grande', proj && proj.distanciaM > 100, proj && proj.distanciaM.toFixed(0));
}

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo');
process.exit(falhas ? 1 : 0);
