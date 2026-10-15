// Garante que o planeador de viagens ("Para onde vais?") mostra o METRO (e o comboio, o barco) como opção de viagem.
//
// O problema que isto impede: o metro com transbordo só aparecia se chegasse 3 minutos ou mais antes do autocarro direto
// (o RAPTOR e a escolha final descartavam-no), por isso, em muitas viagens (Marquês → Aeroporto, São Bento → Matosinhos Sul)
// só havia autocarros. A regra agora é: cada meio de transporte que serve a viagem aparece pelo menos uma vez, desde que
// não chegue muito mais tarde do que a melhor opção.
//
// Monta uma base GTFS pequena (cidades inventadas, uma por cenário) com as funções da própria app e chama o planeador a sério.
// Uso: APP=caminho-da-app node --import tsx auditoria/planeador-modos.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'parou-plano-'));
process.env.PAROU_DATA_DIR = dir; // tem de ser antes de importar a app
const caminho = process.env.APP || '../app';
const B = await import(`${caminho}/src/server/db/gtfsDatabase.ts`);
const P = await import(`${caminho}/src/server/planeador.ts`);
const I = await import(`${caminho}/src/server/planeadorIndice.ts`);
let U = null;
try { U = await import(`${caminho}/src/utils/escolhaOpcoes.ts`); } catch { /* ainda não existe: o teste da app falha abaixo */ }

let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };

// ---------------------------------------------------------------- base de teste
const AGORA = new Date('2026-10-14T12:00:00+01:00'); // quarta-feira, meio-dia em Lisboa
const FEEDS = {
  bus: { id: 'bus_t', mode: 'Autocarro', nome: 'Autocarros T' },
  metro: { id: 'metro_t', mode: 'Metro', nome: 'Metro T' },
  cp: { id: 'cp_t', mode: 'Comboio', nome: 'Comboios T' },
  barco: { id: 'barco_t', mode: 'Barco', nome: 'Barcos T' },
};
// a tabela das linhas sem horários (UNIR) é criada pelo construtor dos dados, não pela app: cria-se vazia, como em produção
B.getDatabase().exec('CREATE TABLE IF NOT EXISTS stop_routes (feed_id TEXT NOT NULL, stop_id TEXT NOT NULL, route_id TEXT NOT NULL, direction_id INTEGER DEFAULT 0, stop_sequence INTEGER, PRIMARY KEY (stop_id, route_id, direction_id))');
for (const f of Object.values(FEEDS)) {
  B.upsertFeed({ id: f.id, operator_name: f.nome, mode: f.mode, feed_type: 'gtfs', source_origin: 'seed', url: '', status: 'OK', progress: 'OK', lines_count: 1, stops_count: 1, trips_count: 1, realtime_entities: 'Nenhum' });
  B.batchInsertCalendar([{ feed_id: f.id, service_id: 'todos', monday: 1, tuesday: 1, wednesday: 1, thursday: 1, friday: 1, saturday: 1, sunday: 1, start_date: '20200101', end_date: '20991231' }]);
}

const KM_LAT = 1 / 111, KM_LON = 1 / 84; // graus por km, perto do Porto
const ponto = (lat, lon, dkmN, dkmE) => ({ lat: lat + dkmN * KM_LAT, lon: lon + dkmE * KM_LON });
let contadorViagem = 0;
const paragens = [];
const novaParagem = (feed, id, nome, p) => { paragens.push({ stop_id: id, feed_id: feed.id, stop_name: nome, stop_lat: p.lat, stop_lon: p.lon }); return id; };

/** Linha com horário a cada `cada` min, das 05:00 às 23:50; `ps` = [[paragem, minutos desde a primeira]] */
function linha(feed, tipo, codigo, ps, cada, extra = {}) {
  const rota = `${feed.id}:${codigo}`;
  B.batchInsertRoutes([{ route_id: rota, feed_id: feed.id, route_short_name: codigo, route_long_name: `${codigo} teste`, route_type: tipo }]);
  const trips = [], sts = [];
  for (let m = 5 * 60 + (extra.desfasamento || 0); m < 23 * 60 + 50; m += cada) {
    const t = `${rota}:${m}`;
    trips.push({ trip_id: t, feed_id: feed.id, route_id: rota, service_id: 'todos', trip_headsign: extra.destino || 'Fim' });
    ps.forEach(([id, min], i) => sts.push({ feed_id: feed.id, trip_id: t, stop_id: id, arrival_secs: (m + min) * 60, departure_secs: (m + min) * 60, stop_sequence: i + 1 }));
    contadorViagem++;
  }
  B.batchInsertTrips(trips);
  B.batchInsertStopTimes(sts);
}

// Cada cenário fica na sua "cidade", longe das outras (0, 50, 100… km para leste)
const CIDADE = (n) => ({ lat: 41.15, lon: -8.6 + n * 50 * KM_LON });

/**
 * Viagem de 9 km: o autocarro direto demora 34 min; o transporte alternativo (metro, comboio, barco) tem DUAS linhas com transbordo
 * no meio: `a` + `b` minutos (mais ~4 min de espera no transbordo) e chega depois do autocarro.
 */
function cenarioComTransbordo(n, feedAlt, tipoAlt, a, b, nomeCod) {
  const c = CIDADE(n);
  const O = ponto(c.lat, c.lon, 0, 0), D = ponto(c.lat, c.lon, 5, -8);
  const pBusO = novaParagem(FEEDS.bus, `bus:${n}:O`, `Bus origem ${n}`, ponto(c.lat, c.lon, 0.05, 0));
  const pBusD = novaParagem(FEEDS.bus, `bus:${n}:D`, `Bus destino ${n}`, ponto(c.lat, c.lon, 5.05, -8));
  const pA = novaParagem(feedAlt, `alt:${n}:A`, `Estação A ${n}`, ponto(c.lat, c.lon, 0.1, 0.05));
  const pH = novaParagem(feedAlt, `alt:${n}:H`, `Estação Central ${n}`, ponto(c.lat, c.lon, 2.5, -4));
  const pZ = novaParagem(feedAlt, `alt:${n}:Z`, `Estação Z ${n}`, ponto(c.lat, c.lon, 5.1, -8));
  linha(FEEDS.bus, 3, `${n}00`, [[pBusO, 0], [pBusD, 34]], 10);
  linha(feedAlt, tipoAlt, `${nomeCod}1`, [[pA, 0], [pH, a]], 5);
  linha(feedAlt, tipoAlt, `${nomeCod}2`, [[pH, 0], [pZ, b]], 5, { desfasamento: 2 });
  return { O, D };
}

const CENARIOS = {
  metroComTransbordo: cenarioComTransbordo(0, FEEDS.metro, 1, 12, 26, 'M'),
  comboioComTransbordo: cenarioComTransbordo(1, FEEDS.cp, 2, 12, 26, 'C'),
  barcoComTransbordo: cenarioComTransbordo(2, FEEDS.barco, 4, 12, 26, 'B'),
  metroMuitoLento: cenarioComTransbordo(3, FEEDS.metro, 1, 40, 70, 'L'),
};
// Cenário em que o metro direto é mais rápido que o autocarro (já aparecia: guarda contra regressões)
{
  const n = 4, c = CIDADE(n);
  const pBusO = novaParagem(FEEDS.bus, `bus:${n}:O`, 'Bus origem 4', ponto(c.lat, c.lon, 0.05, 0));
  const pBusD = novaParagem(FEEDS.bus, `bus:${n}:D`, 'Bus destino 4', ponto(c.lat, c.lon, 5.05, -8));
  const pA = novaParagem(FEEDS.metro, `alt:${n}:A`, 'Estação A 4', ponto(c.lat, c.lon, 0.1, 0.05));
  const pZ = novaParagem(FEEDS.metro, `alt:${n}:Z`, 'Estação Z 4', ponto(c.lat, c.lon, 5.1, -8));
  linha(FEEDS.bus, 3, '400', [[pBusO, 0], [pBusD, 34]], 10);
  linha(FEEDS.metro, 1, 'D1', [[pA, 0], [pZ, 18]], 5);
  CENARIOS.metroDireto = { O: ponto(c.lat, c.lon, 0, 0), D: ponto(c.lat, c.lon, 5, -8) };
}
// Cidade só com autocarros (nada deve mudar)
{
  const n = 5, c = CIDADE(n);
  const pBusO = novaParagem(FEEDS.bus, `bus:${n}:O`, 'Bus origem 5', ponto(c.lat, c.lon, 0.05, 0));
  const pBusD = novaParagem(FEEDS.bus, `bus:${n}:D`, 'Bus destino 5', ponto(c.lat, c.lon, 5.05, -8));
  linha(FEEDS.bus, 3, '500', [[pBusO, 0], [pBusD, 34]], 10);
  CENARIOS.soAutocarros = { O: ponto(c.lat, c.lon, 0, 0), D: ponto(c.lat, c.lon, 5, -8) };
}
// Rua do centro: 40 paragens de autocarro a menos de 120 m e a estação de metro a ~700 m (as 30 paragens mais próximas eram todas de autocarro)
{
  const n = 6, c = CIDADE(n);
  const ids = [];
  for (let i = 0; i < 40; i++) ids.push(novaParagem(FEEDS.bus, `bus:${n}:${i}`, `Rua ${i}`, ponto(c.lat, c.lon, 0.003 * i, 0.002 * (i % 3))));
  const pBusD = novaParagem(FEEDS.bus, `bus:${n}:D`, 'Bus destino 6', ponto(c.lat, c.lon, 5.05, -8));
  const pA = novaParagem(FEEDS.metro, `alt:${n}:A`, 'Estação do centro', ponto(c.lat, c.lon, 0.7, 0.1));
  const pZ = novaParagem(FEEDS.metro, `alt:${n}:Z`, 'Estação Z 6', ponto(c.lat, c.lon, 5.1, -8));
  linha(FEEDS.bus, 3, '600', [...ids.map((id, i) => [id, i]), [pBusD, 75]], 10);
  linha(FEEDS.metro, 1, 'C1', [[pA, 0], [pZ, 18]], 5);
  CENARIOS.centroDenso = { O: ponto(c.lat, c.lon, 0, 0), D: ponto(c.lat, c.lon, 5, -8) };
}
B.batchInsertStops(paragens);

// espera que o motor em memória (RAPTOR) esteja pronto: é com ele que o servidor responde
for (let i = 0; i < 400 && !I.indicePronto(); i++) await new Promise((r) => setTimeout(r, 50));
ok('o motor em memória do planeador ficou pronto', !!I.indicePronto(), I.estadoIndice);

const modos = (o) => o.legs.filter((l) => l.mode === 'TRANSIT').map((l) => l.transportMode);
const resumo = (r) => r.routes.map((o) => `${o.id.startsWith('a-pe') ? 'a pé' : modos(o).join('>')} ${o.totalDurationMinutes}min`).join(' | ');
async function plano(nome) {
  const { O, D } = CENARIOS[nome];
  return P.planearViagem(O.lat, O.lon, D.lat, D.lon, 'Destino', AGORA);
}

// ---------------------------------------------------------------- servidor
for (const [nome, modo, titulo] of [['metroComTransbordo', 'Metro', 'metro'], ['comboioComTransbordo', 'Comboio', 'comboio'], ['barcoComTransbordo', 'Barco', 'barco']]) {
  const r = await plano(nome);
  const bus = r.routes.find((o) => modos(o).includes('Autocarro'));
  const alt = r.routes.find((o) => modos(o).includes(modo));
  ok(`[${titulo} com transbordo] o autocarro direto aparece`, !!bus, resumo(r));
  ok(`[${titulo} com transbordo] o ${titulo} aparece como opção, mesmo chegando depois do autocarro`, !!alt, resumo(r));
  if (alt && bus) ok(`[${titulo} com transbordo] o ${titulo} é mesmo mais lento (o cenário testa o caso difícil)`, alt.totalDurationMinutes > bus.totalDurationMinutes, `${alt.totalDurationMinutes} > ${bus.totalDurationMinutes}`);
  if (alt) ok(`[${titulo} com transbordo] a opção do ${titulo} tem as duas linhas e um transbordo`, alt.transfersCount === 1 && modos(alt).length === 2, JSON.stringify(modos(alt)));
  ok(`[${titulo} com transbordo] no máximo 5 opções`, r.routes.length <= 5, String(r.routes.length));
}
{
  const r = await plano('metroMuitoLento');
  ok('[metro muito lento] um metro que chega muito mais tarde não polui a lista', !r.routes.some((o) => modos(o).includes('Metro')), resumo(r));
  ok('[metro muito lento] o autocarro continua lá', r.routes.some((o) => modos(o).includes('Autocarro')), resumo(r));
}
{
  const r = await plano('metroDireto');
  const m = r.routes.find((o) => modos(o).includes('Metro'));
  ok('[metro direto mais rápido] aparece e é o mais rápido', !!m && m.badgeLabel.startsWith('Mais rápido'), resumo(r));
}
{
  const r = await plano('centroDenso');
  ok('[centro com muitas paragens de autocarro] a estação de metro, mais longe, também conta', r.routes.some((o) => modos(o).includes('Metro')), resumo(r));
}
{
  const r = await plano('soAutocarros');
  ok('[só autocarros] continua a dar só autocarros', r.routes.length >= 1 && r.routes.every((o) => o.id === 'a-pe' || modos(o).every((x) => x === 'Autocarro')), resumo(r));
}

// ---------------------------------------------------------------- app (lista mostrada ao utilizador)
const opc = (id, min, modosLeg, extra = {}) => ({
  id, type: 'fastest', title: id, badgeLabel: '', totalDurationMinutes: min, departureTime: '12:00', arrivalTime: '12:30', walkingDistanceMeters: 0, walkingMinutes: 0,
  transfersCount: Math.max(0, modosLeg.length - 1), realtimeStatus: 'PROGRAMADO', realtimeLabel: '', relevantAlerts: [],
  legs: modosLeg.map((m, i) => ({ mode: 'TRANSIT', transportMode: m, lineCode: `L${i}`, instruction: '' })), ...extra,
});
if (!U) {
  ok('a app tem src/utils/escolhaOpcoes.ts (escolha da lista com todos os meios de transporte)', false);
} else {
  const lim = U.limitarComModos;
  // 6 autocarros e um metro mais lento: com o corte a 5 o metro desaparecia
  const lista = [opc('b1', 20, ['Autocarro']), opc('b2', 22, ['Autocarro']), opc('b3', 24, ['Autocarro']), opc('b4', 25, ['Autocarro']), opc('b5', 26, ['Autocarro']), opc('m1', 33, ['Metro', 'Metro']), opc('b6', 40, ['Autocarro'])];
  let r = lim(lista, 5);
  ok('[lista] o metro entra mesmo ficando fora dos 5 primeiros', r.some((o) => o.id === 'm1'), r.map((o) => o.id).join(','));
  ok('[lista] continua a ter 5 opções', r.length === 5, String(r.length));
  ok('[lista] a ordem é a original (mais rápida primeiro)', r.map((o) => o.totalDurationMinutes).every((v, i, a) => i === 0 || a[i - 1] <= v), r.map((o) => o.totalDurationMinutes).join(','));
  ok('[lista] a melhor opção não sai', r[0].id === 'b1');
  // muito mais lento do que a melhor: não se força
  r = lim([...lista.slice(0, 5), opc('m2', 95, ['Metro'])], 5);
  ok('[lista] um metro muito mais lento não é forçado', !r.some((o) => o.id === 'm2'), r.map((o) => o.id).join(','));
  // já lá está: não mexe
  r = lim([opc('m1', 10, ['Metro']), opc('b1', 12, ['Autocarro']), opc('b2', 13, ['Autocarro']), opc('b3', 14, ['Autocarro']), opc('b4', 15, ['Autocarro']), opc('b5', 16, ['Autocarro'])], 5);
  ok('[lista] sem necessidade, só corta ao tamanho', r.length === 5 && r[0].id === 'm1' && !r.some((o) => o.id === 'b5'), r.map((o) => o.id).join(','));
  // metro, comboio e barco todos fora dos 5
  r = lim([opc('b1', 10, ['Autocarro']), opc('b2', 11, ['Autocarro']), opc('b3', 12, ['Autocarro']), opc('b4', 13, ['Autocarro']), opc('b5', 14, ['Autocarro']), opc('m1', 20, ['Metro']), opc('c1', 21, ['Comboio']), opc('x1', 22, ['Barco'])], 5);
  ok('[lista] metro, comboio e barco entram todos, o melhor autocarro fica', ['m1', 'c1', 'x1', 'b1'].every((id) => r.some((o) => o.id === id)) && r.length === 5, r.map((o) => o.id).join(','));
  // a pé não é arrancado
  r = lim([opc('a-pe', 15, []), opc('b1', 16, ['Autocarro']), opc('b2', 17, ['Autocarro']), opc('b3', 18, ['Autocarro']), opc('b4', 19, ['Autocarro']), opc('m1', 25, ['Metro'])], 5);
  ok('[lista] a opção a pé fica', r.some((o) => o.id === 'a-pe') && r.some((o) => o.id === 'm1'), r.map((o) => o.id).join(','));
  ok('[lista] lista vazia ou curta não parte', lim([], 5).length === 0 && lim([opc('b1', 5, ['Autocarro'])], 5).length === 1);
}

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo OK');
try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* sem importância */ }
process.exit(falhas ? 1 : 0);
