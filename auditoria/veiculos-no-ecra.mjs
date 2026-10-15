// Testa que o mapa mostra TODOS os autocarros da zona que a pessoa está a ver (e não só os das linhas das paragens perto):
//   - o servidor devolve, para uma caixa, todos os autocarros de todos os operadores lá dentro, de qualquer linha;
//   - as caixas aceitam um raio largo (até 0,6° ≈ 66 km de lado) e, se houver mais autocarros do que o limite, ficam os mais perto do centro;
//   - a caixa que a app pede é o ecrã do mapa (com folga), arredondada para fora, e no mapa muito afastado a app não pede nada.
// Erro que isto impede: em Campanhã só aparecia 1 autocarro da STCP porque a app só pedia as linhas das 6 paragens mais perto
// (quase só metro e comboio) e só numa caixa fixa à volta da pessoa.
// Uso: APP=caminho-da-app node --import tsx auditoria/veiculos-no-ecra.mjs
const caminho = process.env.APP || '../app';
let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };

const V = await import(`${caminho}/src/server/veiculos.ts`);
let C = null;
try { C = await import(`${caminho}/src/utils/caixaVeiculos.ts`); } catch (e) { console.log('NOTA    src/utils/caixaVeiculos.ts não existe ou não compila:', String(e).slice(0, 120)); }

// Gerador pseudo-aleatório com semente (o teste repete-se igual)
let semente = 12345;
const rnd = () => { semente = (semente * 1664525 + 1013904223) % 4294967296; return semente / 4294967296; };

const T = 1_800_000_000;
const veic = (id, operator, line_id, lat, lon, extra = {}) => ({ id, line_id, operator, lat, lon, timestamp: T, ...extra });

// ============================================================= 1. caixas
{
  ok('[caixa] Lisboa 0,5°×0,5° é aceite (antes só até 0,3°)', V.lerCaixa('38.60,-9.35,39.10,-8.85') !== null);
  ok('[caixa] 0,6°×0,6° ainda é aceite', V.lerCaixa('38.60,-9.40,39.20,-8.80') !== null);
  ok('[caixa] 0,7° de lado é recusada (pedidos grandes demais)', V.lerCaixa('38.60,-9.40,39.30,-8.70') === null);
  ok('[caixa] fora de Portugal é recusada', V.lerCaixa('40.0,-4.0,40.1,-3.9') === null);
  ok('[caixa] caixa do telemóvel em Campanhã é aceite', V.lerCaixa('41.1405,-8.5965,41.1565,-8.5745') !== null);
}

// ============================================================= 2. o servidor devolve todos os da caixa, de qualquer linha e operador
{
  const lista = [];
  const linhasStcp = ['300', '301', '205', '107', '902', '505', '203', '401', '602', '704'];
  for (let i = 0; i < 40; i++) lista.push(veic(`stcp:${i}`, 'STCP', linhasStcp[i % linhasStcp.length], 41.1485 + (rnd() - 0.5) * 0.012, -8.5855 + (rnd() - 0.5) * 0.016));
  for (let i = 0; i < 12; i++) lista.push(veic(`cm:${i}`, 'Carris Metropolitana', ['4436', '2001', 'ZC'][i % 3], 41.1485 + (rnd() - 0.5) * 0.012, -8.5855 + (rnd() - 0.5) * 0.016));
  for (let i = 0; i < 6; i++) lista.push(veic(`tub:${i}`, 'TUB', ['45', '1A'][i % 2], 41.1485 + (rnd() - 0.5) * 0.012, -8.5855 + (rnd() - 0.5) * 0.016));
  for (let i = 0; i < 30; i++) lista.push(veic(`longe:${i}`, 'STCP', '300', 41.3 + rnd() * 0.05, -8.2 + rnd() * 0.05)); // fora da caixa
  const cx = V.lerCaixa('41.1405,-8.5965,41.1565,-8.5745');
  const r = V.filtrarVeiculos(lista, { caixa: cx });
  const dentro = lista.filter((v) => v.lat >= cx.sul && v.lat <= cx.norte && v.lon >= cx.oeste && v.lon <= cx.leste).length;
  ok('[servidor] só caixa (sem linhas): devolve todos os autocarros lá dentro', r.length === dentro && dentro >= 50, `${r.length} de ${dentro}`);
  ok('[servidor] inclui os três operadores', new Set(r.map((v) => v.op)).size === 3, [...new Set(r.map((v) => v.op))].join(','));
  ok('[servidor] inclui todas as linhas (nenhuma fica de fora por não ser de uma paragem perto)', new Set(r.map((v) => v.linha)).size === new Set(lista.slice(0, 58).map((v) => v.line_id)).size, `${new Set(r.map((v) => v.linha)).size} linhas`);
  ok('[servidor] nada de fora da caixa', r.every((v) => v.lat >= cx.sul && v.lat <= cx.norte && v.lon >= cx.oeste && v.lon <= cx.leste));
}

// ============================================================= 3. mais do que o limite: ficam os mais perto do centro
{
  const lista = [];
  const lat0 = 38.75, lon0 = -9.15;
  for (let i = 0; i < 1500; i++) lista.push(veic(`cm:${i}`, 'Carris Metropolitana', String(1000 + (i % 200)), lat0 + (rnd() - 0.5) * 0.5, lon0 + (rnd() - 0.5) * 0.5));
  const cx = V.lerCaixa(`${lat0 - 0.25},${lon0 - 0.25},${lat0 + 0.25},${lon0 + 0.25}`);
  const r = V.filtrarVeiculos(lista, { caixa: cx });
  ok('[servidor] caixa larga com 1500 autocarros: devolve no máximo 700 (resposta leve)', r.length > 0 && r.length <= 700, String(r.length));
  ok('[servidor] e devolve 700 (não menos)', r.length === 700, String(r.length));
  const dist = (v) => Math.hypot((v.lat - lat0) * 111320, (v.lon - lon0) * 111320 * Math.cos(lat0 * Math.PI / 180));
  const maisLonge = Math.max(...r.map(dist));
  const ids = new Set(r.map((v) => v.id));
  const excluidos = lista.filter((v) => !ids.has(v.id));
  const maisPerto = Math.min(...excluidos.map((v) => dist({ lat: Number(v.lat), lon: Number(v.lon) })));
  ok('[servidor] os que ficam são os mais perto do centro do ecrã (nenhum excluído está mais perto que o mais longe dos incluídos)', maisPerto >= maisLonge - 5, `incluído mais longe ${maisLonge.toFixed(0)} m; excluído mais perto ${maisPerto.toFixed(0)} m`);
}

// ============================================================= 4. a caixa que a app pede (ecrã do mapa)
if (!C) {
  ok('[app] existe a função que transforma o ecrã do mapa na caixa pedida', false, 'falta src/utils/caixaVeiculos.ts');
} else {
  const ecra = { sul: 41.1459, norte: 41.1511, oeste: -8.5895, leste: -8.5815 }; // ecrã de telemóvel ao nível 16
  const r = C.caixaDoEcra(ecra);
  ok('[app] ecrã pequeno → pede uma caixa', r && r.caixa && !r.longe, JSON.stringify(r));
  if (r && r.caixa) {
    const cx = r.caixa;
    ok('[app] a caixa cobre o ecrã todo', cx.sul <= ecra.sul && cx.norte >= ecra.norte && cx.oeste <= ecra.oeste && cx.leste >= ecra.leste);
    ok('[app] com folga à volta (≥ 10% de cada lado, para os autocarros que estão a entrar no ecrã)', (ecra.sul - cx.sul) >= 0.1 * (ecra.norte - ecra.sul) && (cx.leste - ecra.leste) >= 0.1 * (ecra.leste - ecra.oeste), JSON.stringify(cx));
    ok('[app] mas sem exagero (menos de 3× o ecrã)', (cx.norte - cx.sul) < 3 * (ecra.norte - ecra.sul) && (cx.leste - cx.oeste) < 3 * (ecra.leste - ecra.oeste));
    ok('[app] a caixa é aceite pelo servidor', V.lerCaixa([cx.sul, cx.oeste, cx.norte, cx.leste].join(',')) !== null);
    const mexe = C.caixaDoEcra({ ...ecra, sul: ecra.sul + 0.0003, norte: ecra.norte + 0.0003 });
    ok('[app] um toque pequeno no mapa não muda a caixa (arredondada, menos pedidos diferentes)', mexe && mexe.caixa && JSON.stringify(mexe.caixa) === JSON.stringify(cx), JSON.stringify(mexe?.caixa));
  }
  const cidade = C.caixaDoEcra({ sul: 41.08, norte: 41.22, oeste: -8.72, leste: -8.52 }); // nível ~12-13 no telemóvel
  ok('[app] ecrã de cidade (0,14°×0,2°) → pede uma caixa aceite pelo servidor', cidade && cidade.caixa && V.lerCaixa([cidade.caixa.sul, cidade.caixa.oeste, cidade.caixa.norte, cidade.caixa.leste].join(',')) !== null, JSON.stringify(cidade));
  const regiao = C.caixaDoEcra({ sul: 40.9, norte: 41.5, oeste: -9.1, leste: -8.3 });
  ok('[app] mapa muito afastado (0,6°×0,8°) → não pede nada e diz para aproximar', regiao && regiao.longe === true && !regiao.caixa, JSON.stringify(regiao));
  const pais = C.caixaDoEcra({ sul: 36, norte: 43, oeste: -10, leste: -6 });
  ok('[app] mapa do país inteiro → não pede nada', pais && pais.longe === true);
  const espanha = C.caixaDoEcra({ sul: 40.0, norte: 40.05, oeste: -4.0, leste: -3.95 });
  ok('[app] fora de Portugal → não pede nada (e não diz «aproxima»)', espanha && !espanha.caixa && !espanha.longe, JSON.stringify(espanha));
  const borda = C.caixaDoEcra({ sul: 36.95, norte: 37.0, oeste: -9.0, leste: -8.95 });
  ok('[app] perto do limite do mapa de Portugal a caixa pedida continua válida', borda && borda.caixa && V.lerCaixa([borda.caixa.sul, borda.caixa.oeste, borda.caixa.norte, borda.caixa.leste].join(',')) !== null, JSON.stringify(borda));
  const lixo = C.caixaDoEcra({ sul: NaN, norte: 1, oeste: 2, leste: 3 });
  ok('[app] valores inválidos → não pede nada', lixo && !lixo.caixa && !lixo.longe);
  const aAçores = C.caixaDoEcra({ sul: 37.73, norte: 37.76, oeste: -25.68, leste: -25.64 });
  ok('[app] Açores → pede uma caixa válida', aAçores && aAçores.caixa && V.lerCaixa([aAçores.caixa.sul, aAçores.caixa.oeste, aAçores.caixa.norte, aAçores.caixa.leste].join(',')) !== null, JSON.stringify(aAçores));
}

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTodos os testes OK');
process.exit(falhas ? 1 : 0);
