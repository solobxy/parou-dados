// Autocarros no mapa pela estrada (pedido do Dinis, 27/11/2026: «demasiado lentos, demasiado atrasados, a ir por fora das ruas e a
// atravessar paredes»). Simula o telemóvel (pede de 6 em 6 s, desenha a 30 imagens por segundo) com um autocarro numa rua em L
// (uma esquina de 90°) e compara o movimento novo (src/utils/trajetoNoCaminho.ts) com o antigo (linha reta):
//   - fica sempre em cima da rua (não corta a esquina por dentro dos prédios);
//   - mais perto de onde o autocarro está agora; nunca para trás; sem saltos;
//   - parado numa paragem: não foge para a frente mais do que um bocado e não recua;
//   - desenho do outro sentido não é escolhido; desvio para fora do desenho volta ao movimento antigo.
// Uso: APP=caminho-da-app node --import tsx auditoria/trajeto-caminho.mjs
const APP = process.env.APP || '../app';
const N = await import(`${APP}/src/utils/trajetoNoCaminho.ts`);
const V = await import(`${APP}/src/utils/trajetoVeiculo.ts`);
let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };

const LAT0 = 41.15, LON0 = -8.61;
const M_LAT = 1 / 111320, M_LON = 1 / (111320 * Math.cos(LAT0 * Math.PI / 180));
const pt = (norte, este) => ({ lat: LAT0 + norte * M_LAT, lon: LON0 + este * M_LON });
// rua em L: 600 m para leste, esquina, 600 m para norte (pontos de 20 em 20 m, como um desenho oficial)
const rua = [];
for (let x = 0; x <= 600; x += 20) rua.push(pt(0, x));
for (let y = 20; y <= 600; y += 20) rua.push(pt(y, 600));
const C = N.prepararCaminho(rua);
const Cinv = N.prepararCaminho([...rua].reverse());
const naRua = (s) => (s <= 600 ? pt(0, s) : pt(s - 600, 600));
const distRua = (p) => N.projetar(C, p).dist;

/** Simula: `sDe(t)` = distância verdadeira na rua no instante t; fixes de `int` em `int` s, chegam com `idade` s */
function simular({ sDe, int = 15, idade = 12, ate = 160, caminhos = [C], ruido = () => [0, 0], mov = 'novo' }) {
  const m = mov === 'novo' ? new N.MovimentoNoCaminho('cm') : new V.MovimentoVeiculo('cm');
  if (mov === 'novo') m.definirCaminhos(caminhos);
  const fixes = [];
  for (let t = 0; t <= ate; t += int) { const p = naRua(sDe(t)); const [dn, de] = ruido(t); fixes.push({ t, lat: p.lat + dn * M_LAT, lon: p.lon + de * M_LON }); }
  let proximo = 0;
  let pedido = idade;
  const frames = [];
  for (let k = 0; idade + k / 30 <= ate; k++) {
    const W = idade + k / 30;
    // o telemóvel pede de 6 em 6 s: recebe as posições que já chegaram ao servidor
    if (W >= pedido) { pedido += 6; while (proximo < fixes.length && fixes[proximo].t + idade <= W) { m.receber(fixes[proximo], W); proximo++; } }
    if (m.tem()) { const p = m.mostrar(W); frames.push({ W, ...p, real: sDe(W) }); }
  }
  return { frames, m };
}

const v = 8; // m/s ≈ 29 km/h
const reta = (t) => Math.min(1200, v * t);
const novo = simular({ sDe: reta });
const antigo = simular({ sDe: reta, mov: 'antigo' });
const depois = (fr) => fr.filter((f) => f.W > 40);
const maxFora = (fr) => Math.max(...depois(fr).map((f) => distRua(f)));
const sDoFrame = (f) => N.projetar(C, f).s;
const atrasoMedio = (fr) => { const xs = depois(fr).filter((f) => f.real < 1150).map((f) => f.real - sDoFrame(f)); return xs.reduce((a, b) => a + b, 0) / xs.length; };

ok('fica em cima da rua, também na esquina (máx. 3 m)', maxFora(novo.frames) <= 3, `novo ${maxFora(novo.frames).toFixed(1)} m · antigo ${maxFora(antigo.frames).toFixed(1)} m`);
ok('o antigo cortava a esquina (prova de que o teste apanha o problema)', maxFora(antigo.frames) > 15, `${maxFora(antigo.frames).toFixed(1)} m`);
const an = atrasoMedio(novo.frames), aa = atrasoMedio(antigo.frames);
ok('mais perto de onde o autocarro está agora (atraso pelo menos 35% menor)', an < aa * 0.65, `novo ${an.toFixed(0)} m atrás · antigo ${aa.toFixed(0)} m atrás`);
ok('atraso do novo abaixo de ~12 s de viagem', an < 12 * v, `${(an / v).toFixed(1)} s`);
const ss = depois(novo.frames).map(sDoFrame);
ok('nunca anda para trás', ss.every((s, i) => i === 0 || s >= ss[i - 1] - 0.5));
const passos = ss.slice(1).map((s, i) => s - ss[i]);
ok('sem saltos (máx. por imagem ≤ 1,7× a velocidade)', Math.max(...passos) <= 1.7 * v / 30 + 0.2, `${Math.max(...passos).toFixed(2)} m`);
const rumos = depois(novo.frames).filter((f) => sDoFrame(f) > 700 && sDoFrame(f) < 1150).map((f) => f.rumo);
ok('depois da esquina a seta aponta para norte (a estrada)', rumos.length > 0 && rumos.every((r) => r < 5 || r > 355), String(rumos[0]));

// parado 45 s numa paragem a meio
const comParagem = (t) => (t < 50 ? v * t : t < 95 ? v * 50 : v * 50 + v * (t - 95));
const p1 = simular({ sDe: comParagem, ate: 180 });
const fr1 = p1.frames.filter((f) => f.W > 30);
const s1 = fr1.map(sDoFrame);
ok('parado numa paragem: nunca recua', s1.every((s, i) => i === 0 || s >= s1[i - 1] - 0.5));
const avanco = Math.max(...fr1.map((f) => sDoFrame(f) - f.real));
ok('parado numa paragem: não foge mais de 200 m para a frente', avanco <= 200, `${avanco.toFixed(0)} m à frente no pior momento`);

// GPS com ruído de ±10 m: continua na rua
const comRuido = simular({ sDe: reta, ruido: (t) => [Math.sin(t) * 10, Math.cos(t * 1.3) * 10] });
ok('com ruído do GPS (±10 m) continua em cima da rua', maxFora(comRuido.frames) <= 3, `${maxFora(comRuido.frames).toFixed(1)} m`);

// desenho do outro sentido: não serve
const so = simular({ sDe: reta, caminhos: [Cinv] });
ok('o desenho do outro sentido não é escolhido', so.m.caminho === null);
const ambos = simular({ sDe: reta, caminhos: [Cinv, C] });
ok('com os dois sentidos, escolhe o certo', ambos.m.caminho === C);

// desvio: sai do desenho (120 m para sul e para leste) a partir dos 300 m
const desvio = (t) => reta(t);
const d1 = simular({ sDe: desvio, ruido: (t) => (v * t > 300 ? [-120, 120] : [0, 0]) });
ok('desvio para fora do desenho: volta ao movimento antigo (segue as posições)', d1.m.caminho === null);
const ult = d1.frames[d1.frames.length - 1];
ok('… e o marcador vai para onde o autocarro está (perto das posições)', Number.isFinite(ult.lat) && distRua(ult) > 60, `${distRua(ult).toFixed(0)} m da rua`);

// sem desenho: igual ao antigo
const sem = simular({ sDe: reta, caminhos: [] });
const semUlt = sem.frames[sem.frames.length - 1], antUlt = antigo.frames[antigo.frames.length - 1];
ok('sem desenho: exatamente o movimento antigo', Math.abs(semUlt.lat - antUlt.lat) < 1e-9 && Math.abs(semUlt.lon - antUlt.lon) < 1e-9);

// o mapa usa o movimento novo e pede os desenhos da linha
const fs = await import('node:fs');
const mapa = fs.readFileSync(`${APP}/src/components/VeiculosNoMapa.tsx`, 'utf8');
ok('o mapa usa o movimento pela estrada', /new MovimentoNoCaminho\(/.test(mapa) && /definirCaminhos\(/.test(mapa) && /desenhos-linha/.test(mapa));

console.log(falhas ? `\n${falhas} FALHAS` : '\nTUDO OK');
process.exit(falhas ? 1 : 0);
