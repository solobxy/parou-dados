// Testa a leitura dos ficheiros de tempo real da TUB (src/server/tubTempoReal.ts + protobufMinimo.ts):
//  - ficheiros GTFS-Realtime montados à mão com o feitio dos da TUB (posições e atualizações de viagens);
//  - entidades estragadas, veículos fora da zona, números negativos, rumo calculado pelo caminho;
//  - cache, pedido partilhado, pausa depois de falhar e dados com mais de 2 minutos.
// Se FICHEIROS_TUB apontar para uma pasta com vehicle_positions.pb e trip_updates.pb (ficheiros reais), lê-os também.
// Uso: APP=caminho-da-app node --import tsx auditoria/tub-leitor.mjs
import fs from 'node:fs';
import path from 'node:path';

const caminho = process.env.APP || '../app';
const T = await import(`${caminho}/src/server/tubTempoReal.ts`);
const P = await import(`${caminho}/src/server/protobufMinimo.ts`);

let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };
const perto = (a, b, tol) => Math.abs(a - b) <= tol;

// ---------------------------------------------------------------- codificador mínimo de protobuf
const varint = (n) => { let v = BigInt(n); if (v < 0n) v = BigInt.asUintN(64, v); const o = []; do { let b = Number(v & 0x7fn); v >>= 7n; if (v > 0n) b |= 0x80; o.push(b); } while (v > 0n); return o; };
const chave = (n, t) => varint(n * 8 + t);
const cVar = (n, v) => [...chave(n, 0), ...varint(v)];
const cBytes = (n, b) => [...chave(n, 2), ...varint(b.length), ...b];
const cTexto = (n, s) => cBytes(n, [...Buffer.from(s)]);
const cFloat = (n, f) => { const b = Buffer.alloc(4); b.writeFloatLE(f); return [...chave(n, 5), ...b]; };
const cDouble = (n, f) => { const b = Buffer.alloc(8); b.writeDoubleLE(f); return [...chave(n, 1), ...b]; };

const feed = (ts, entidades) => new Uint8Array([...cBytes(1, [...cTexto(1, '2.0'), ...cVar(2, 0), ...cVar(3, ts)]), ...entidades.flatMap((e) => cBytes(2, e))]);

function entidadeVeiculo({ id, trip, rota, veiculo, lat, lon, rumo, ms, ts, parag = '76', seq = 22 }) {
  const viagem = [...cTexto(1, trip), ...cTexto(3, '20261015'), ...cTexto(5, rota)];
  const pos = [...cFloat(1, lat), ...cFloat(2, lon), ...(rumo === undefined ? [] : cFloat(3, rumo)), ...cDouble(4, 12345.5), ...cFloat(5, ms)];
  const desc = [...cTexto(1, veiculo), ...cTexto(2, veiculo)];
  const vp = [...cBytes(1, viagem), ...cBytes(2, pos), ...cVar(3, seq), ...cVar(4, 2), ...cVar(5, ts), ...cTexto(7, parag), ...cBytes(8, desc)];
  return [...cTexto(1, id), ...cBytes(4, vp)];
}

const evento = ({ tempo, atraso }) => [...(atraso === undefined ? [] : cVar(1, atraso)), ...(tempo === undefined ? [] : cVar(2, tempo))];
const stu = ({ seq, paragem, chegada, partida, rel }) => [...cVar(1, seq), ...(chegada ? cBytes(2, evento(chegada)) : []), ...(partida ? cBytes(3, evento(partida)) : []), ...cTexto(4, paragem), ...(rel === undefined ? [] : cVar(5, rel))];
function entidadeViagem({ id, trip, rota, veiculo, ts, paragens, estado }) {
  const viagem = [...cTexto(1, trip), ...cTexto(3, '20261015'), ...(estado === undefined ? [] : cVar(4, estado)), ...cTexto(5, rota)];
  const tu = [...cBytes(1, viagem), ...paragens.flatMap((p) => cBytes(2, stu(p))), ...cBytes(3, cTexto(1, veiculo)), ...cVar(4, ts)];
  return [...cTexto(1, id), ...cBytes(3, tu)];
}

const AGORA = 1_760_544_000; // 2025-10-15 (qualquer instante serve; os testes usam o relógio falso abaixo)
const LAT = 41.5518, LON = -8.4229; // Braga
const M = 111320, COS = Math.cos(LAT * Math.PI / 180);
const norte = (m) => LAT + m / M;
const este = (m) => LON + m / (M * COS);

// ---------------------------------------------------------------- 1. números
{
  const [neg32] = P.lerVarint(new Uint8Array(varint(-45)), 0);
  ok('varint: negativo de 32 bits em 10 bytes lê-se como -45', neg32 === -45, String(neg32));
  const [grande] = P.lerVarint(new Uint8Array(varint(1_760_544_000)), 0);
  ok('varint: hora (5 bytes) certa', grande === 1_760_544_000);
  const [zero] = P.lerVarint(new Uint8Array(varint(0)), 0);
  ok('varint: zero', zero === 0);
  let erro = false;
  try { P.lerVarint(new Uint8Array([0x80, 0x80, 0x80]), 0); } catch { erro = true; }
  ok('varint: número cortado dá erro (não fica pendurado)', erro);
}

// ---------------------------------------------------------------- 1b. a STCP continua a ler os seus ficheiros com o leitor partilhado
{
  const S = await import(`${caminho}/src/server/stcpApi.ts`);
  const ficheiro = feed(AGORA, [
    entidadeVeiculo({ id: 'e1', trip: '801_7', rota: '801', veiculo: '3342', lat: 41.1496, lon: -8.6109, ms: 10, ts: AGORA - 4, rumo: 135 }),
  ]);
  const l = S.lerPosicoes(ficheiro);
  ok('STCP: lê o veículo, a viagem e a linha como antes', l.length === 1 && l[0].id === 'stcp:3342' && l[0].tripId === '801_7' && l[0].routeId === '801' && l[0].rumo === 135 && l[0].velocidade === 36, JSON.stringify(l[0]));
}

// ---------------------------------------------------------------- 2. posições
{
  const ficheiro = feed(AGORA, [
    entidadeVeiculo({ id: '45_410', trip: '45_410', rota: '45', veiculo: '1066', lat: LAT, lon: LON, ms: 0.056, ts: AGORA - 3 }),
    entidadeVeiculo({ id: '43_315', trip: '43_315', rota: '43', veiculo: '919', lat: norte(500), lon: este(300), ms: 8.5, ts: AGORA - 6, rumo: 270 }),
    entidadeVeiculo({ id: 'longe', trip: 'x_1', rota: '9', veiculo: '5', lat: 38.7, lon: -9.15, ms: 3, ts: AGORA }), // Lisboa: fora da zona
    entidadeVeiculo({ id: 'semveic', trip: 'x_2', rota: '9', veiculo: '', lat: LAT, lon: LON, ms: 3, ts: AGORA }),
    [...cTexto(1, 'estragada'), ...cBytes(4, [0x0a, 0x7f, 0x01])], // mensagem cortada
    entidadeVeiculo({ id: 'sem-hora', trip: '24_9', rota: '24', veiculo: '777', lat: norte(100), lon: este(100), ms: 0, ts: 0 }),
  ]);
  const lista = T.lerPosicoesTub(ficheiro, AGORA);
  ok('posições: lê os 3 veículos bons e salta o de Lisboa, o sem número e a entidade estragada', lista.length === 3, `tem ${lista.length}`);
  const a = lista.find((p) => p.veiculo === '1066');
  ok('posições: veículo 1066 → viagem, linha e coordenadas', !!a && a.tripId === '45_410' && a.routeId === '45' && perto(a.lat, LAT, 1e-5) && perto(a.lon, LON, 1e-5));
  ok('posições: velocidade em km/h (0,056 m/s → 0)', a?.velocidade === 0, String(a?.velocidade));
  ok('posições: hora do veículo', a?.epoch === AGORA - 3);
  const b = lista.find((p) => p.veiculo === '919');
  ok('posições: velocidade 8,5 m/s → 31 km/h', b?.velocidade === 31, String(b?.velocidade));
  ok('posições: rumo enviado pela TUB (270) mantém-se', b?.rumo === 270);
  const c = lista.find((p) => p.veiculo === '777');
  ok('posições: sem hora própria usa a hora do ficheiro', c?.epoch === AGORA);
  ok('cabeçalho: hora do ficheiro', T.lerHoraDoFicheiro(ficheiro) === AGORA);
  ok('cabeçalho: ficheiro sem cabeçalho → 0', T.lerHoraDoFicheiro(new Uint8Array([])) === 0);
  let rebentou = false;
  try { T.lerPosicoesTub(new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01])); } catch { rebentou = true; }
  ok('posições: lixo dá erro (a fonte guarda os dados anteriores)', rebentou);
}

// ---------------------------------------------------------------- 3. rumo calculado
{
  T.limparRumosTub();
  const lerComPosicao = (ts, lat, lon, veiculo = '1') => {
    const l = T.lerPosicoesTub(feed(ts, [entidadeVeiculo({ id: 'a', trip: '1_1', rota: '1', veiculo, lat, lon, ms: 5, ts })]), ts);
    T.completarRumos(l);
    return l[0];
  };
  const p0 = lerComPosicao(AGORA, LAT, LON);
  ok('rumo: primeira leitura não tem rumo', p0.rumo === undefined);
  const p1 = lerComPosicao(AGORA + 10, norte(60), LON);
  ok('rumo: 60 m para norte → 0°', p1.rumo === 0, String(p1.rumo));
  const p2 = lerComPosicao(AGORA + 20, norte(60), este(80));
  ok('rumo: 80 m para este → 90°', p2.rumo === 90, String(p2.rumo));
  const p3 = lerComPosicao(AGORA + 30, norte(61.5), este(81));
  ok('rumo: parado (tremor de 2 m) mantém 90°', p3.rumo === 90, String(p3.rumo));
  const p4 = lerComPosicao(AGORA + 30, norte(61.5), este(81));
  ok('rumo: a mesma leitura outra vez mantém 90°', p4.rumo === 90, String(p4.rumo));
  const p5 = lerComPosicao(AGORA + 40, norte(-10), este(80));
  ok('rumo: 70 m para sul → 180°', p5.rumo === 180, String(p5.rumo));
  const q0 = lerComPosicao(AGORA + 40, norte(1000), LON, '2');
  ok('rumo: outro veículo começa sem rumo (não herda o do 1)', q0.rumo === undefined);
  // movimento lento: 3 m por leitura vai somando até ≥ 8 m
  const l1 = lerComPosicao(AGORA + 50, norte(500), LON, '3');
  const l2 = lerComPosicao(AGORA + 60, norte(503), LON, '3');
  const l3 = lerComPosicao(AGORA + 70, norte(506), LON, '3');
  const l4 = lerComPosicao(AGORA + 80, norte(509), LON, '3');
  ok('rumo: movimento lento (3 m por leitura) só dá rumo depois de 8 m', l1.rumo === undefined && l2.rumo === undefined && l3.rumo === undefined && l4.rumo === 0, `${l2.rumo},${l3.rumo},${l4.rumo}`);
}

// ---------------------------------------------------------------- 4. atualizações de viagens
{
  const ficheiro = feed(AGORA, [
    entidadeViagem({ id: '12_61', trip: '12_61', rota: '12', veiculo: '351', ts: AGORA - 3, paragens: [
      { seq: 13, paragem: '795', chegada: { tempo: AGORA + 100 }, partida: { tempo: AGORA + 117 } },
      { seq: 14, paragem: '797', chegada: { tempo: AGORA + 170 }, partida: { tempo: AGORA + 190 } },
      { seq: 15, paragem: '1606', chegada: { tempo: AGORA + 260 }, rel: 1 },
      { seq: 16, paragem: '1607', chegada: { atraso: -45 }, partida: { atraso: 120 } },
    ] }),
    entidadeViagem({ id: '13_40', trip: '13_40', rota: '13', veiculo: '904', ts: AGORA, estado: 3, paragens: [{ seq: 1, paragem: '10', chegada: { tempo: AGORA + 60 } }] }),
    [...cTexto(1, 'estragada'), ...cBytes(3, [0x0a, 0x7f])],
    entidadeViagem({ id: 'sem-paragem', trip: '14_1', rota: '14', veiculo: '5', ts: AGORA, paragens: [{ seq: 1, paragem: '', chegada: { tempo: AGORA + 60 } }, { seq: 2, paragem: '20', partida: { tempo: AGORA + 90 } }] }),
  ]);
  const lista = T.lerViagensTub(ficheiro, AGORA);
  ok('viagens: lê 3 viagens e salta a estragada', lista.length === 3, `tem ${lista.length}`);
  const a = lista.find((v) => v.tripId === '12_61');
  ok('viagens: 12_61 com veículo 351, linha 12 e 4 paragens', a?.veiculo === '351' && a.routeId === '12' && a.paragens.length === 4);
  ok('viagens: horas previstas de chegada e partida', a?.paragens[0].chegada === AGORA + 100 && a.paragens[0].partida === AGORA + 117);
  ok('viagens: paragem saltada (relação = 1)', a?.paragens[2].saltada === true && a.paragens[0].saltada === false);
  ok('viagens: atraso negativo e positivo lidos com o sinal certo', a?.paragens[3].atrasoChegada === -45 && a.paragens[3].atrasoPartida === 120, `${a?.paragens[3].atrasoChegada},${a?.paragens[3].atrasoPartida}`);
  ok('viagens: sequência da paragem', a?.paragens[1].sequencia === 14);
  const b = lista.find((v) => v.tripId === '13_40');
  ok('viagens: viagem suprimida (estado 3)', b?.cancelada === true && lista.find((v) => v.tripId === '12_61')?.cancelada === false);
  const c = lista.find((v) => v.tripId === '14_1');
  ok('viagens: paragem sem código é saltada e a outra fica', c?.paragens.length === 1 && c.paragens[0].paragem === '20' && c.paragens[0].partida === AGORA + 90);
}

// ---------------------------------------------------------------- 4b. ligar a previsão da TUB a uma partida do horário
{
  const DEP = Date.UTC(2026, 9, 15, 16, 30) / 1000; // 17:30 em Lisboa (hora de verão), quinta-feira 15/10/2026
  const partida = (extra = {}) => ({ trip_id: 'tub_braga:12_61', stop_id: 'tub_braga:795', dep_epoch_secs: DEP, scheduled_seconds: 17 * 3600 + 30 * 60, ...extra });
  const viagem = (extra = {}) => ({ tripId: '12_61', routeId: '12', veiculo: '351', dia: '20261015', cancelada: false, epoch: DEP - 600, paragens: [{ sequencia: 13, paragem: '795', chegada: DEP + 150, partida: DEP + 180, saltada: false }], ...extra });
  const mapa = (v) => new Map([[v.tripId, v]]);

  let e = T.estimativaTub(partida(), mapa(viagem()));
  ok('previsão: usa a hora de partida prevista pela TUB (3 min depois do horário)', e?.tipo === 'hora' && e.epoch === DEP + 180 && e.veiculo === '351', JSON.stringify(e));
  e = T.estimativaTub(partida(), mapa(viagem({ paragens: [{ sequencia: 13, paragem: '795', chegada: DEP + 150, saltada: false }] })));
  ok('previsão: sem hora de partida usa a de chegada', e?.tipo === 'hora' && e.epoch === DEP + 150);
  e = T.estimativaTub(partida(), mapa(viagem({ dia: '20261016' })));
  ok('previsão: viagem de outro dia (mesmo código) não conta', e === null);
  e = T.estimativaTub(partida(), mapa(viagem({ dia: undefined, paragens: [{ sequencia: 13, paragem: '795', partida: DEP + 4 * 3600, saltada: false }] })));
  ok('previsão: hora a mais de 3 horas do horário não é desta partida', e === null);
  e = T.estimativaTub(partida(), mapa(viagem({ cancelada: true, paragens: [] })));
  ok('previsão: viagem suprimida pela TUB', e?.tipo === 'suprimida' && e.motivo === 'viagem');
  e = T.estimativaTub(partida(), mapa(viagem({ cancelada: true, dia: '20261016', paragens: [] })));
  ok('previsão: supressão de outro dia não afeta esta partida', e === null);
  e = T.estimativaTub(partida({ dep_epoch_secs: DEP + 20 * 3600 }), mapa(viagem({ cancelada: true, dia: undefined, paragens: [] })));
  ok('previsão: supressão sem dia, com 20 h de diferença, não conta', e === null);
  e = T.estimativaTub(partida(), mapa(viagem({ paragens: [{ sequencia: 13, paragem: '795', saltada: true, chegada: DEP + 150 }] })));
  ok('previsão: paragem saltada', e?.tipo === 'suprimida' && e.motivo === 'paragem');
  e = T.estimativaTub(partida({ stop_id: 'tub_braga:999' }), mapa(viagem()));
  ok('previsão: paragem que a viagem já não tem (já passou) → sem previsão', e === null);
  e = T.estimativaTub(partida({ trip_id: 'tub_braga:outra' }), mapa(viagem()));
  ok('previsão: viagem que não está em circulação → sem previsão', e === null);
  e = T.estimativaTub(partida(), mapa(viagem({ paragens: [{ sequencia: 2, paragem: '795', partida: DEP - 3500, saltada: false }, { sequencia: 40, paragem: '795', partida: DEP + 60, saltada: false }] })));
  ok('previsão: linha circular (duas passagens) fica com a mais perto do horário', e?.tipo === 'hora' && e.epoch === DEP + 60, JSON.stringify(e));
  e = T.estimativaTub(partida(), mapa(viagem({ paragens: [{ sequencia: 13, paragem: '795', atrasoPartida: 75, saltada: false }] })));
  ok('previsão: só o atraso (75 s) → horário + atraso', e?.tipo === 'hora' && e.epoch === DEP + 75, JSON.stringify(e));
  e = T.estimativaTub(partida({ dep_epoch_secs: Date.UTC(2026, 9, 16, 0, 10) / 1000, scheduled_seconds: 25 * 3600 + 10 * 60 }), mapa(viagem({ paragens: [{ sequencia: 13, paragem: '795', partida: Date.UTC(2026, 9, 16, 0, 12) / 1000, saltada: false }] })));
  ok('previsão: viagem depois da meia-noite (25:10) pertence ao dia anterior do serviço', e?.tipo === 'hora', JSON.stringify(e));
  e = T.estimativaTub(partida({ trip_id: '12_61', stop_id: '795' }), mapa(viagem()));
  ok('previsão: códigos sem prefixo também servem', e?.tipo === 'hora');
  e = T.estimativaTub(partida({ scheduled_seconds: NaN }), mapa(viagem()));
  ok('previsão: sem segundos de horário não rebenta (sem verificar o dia)', e?.tipo === 'hora');
}

// ---------------------------------------------------------------- 4c. horas previstas ao longo do percurso («A bordo»)
{
  const B = 1_760_000_000;
  const percurso = ['10', '11', '12', '11', '13', '14'].map((n) => ({ id: `tub_braga:${n}` })); // a paragem 11 repete-se (linha circular)
  const viagem = { tripId: 'x', routeId: '1', cancelada: false, epoch: B, paragens: [
    { sequencia: 4, paragem: '11', chegada: B + 600, partida: B + 620, saltada: false },
    { sequencia: 5, paragem: '13', chegada: B + 900, saltada: false },
    { sequencia: 6, paragem: '14', partida: B + 1200, saltada: false },
  ] };
  let m = T.previsoesDoPercurso(viagem, percurso, 3);
  ok('percurso: a partir da paragem 4 (índice 3) dá as horas de 11, 13 e 14', m.size === 3 && m.get(3) === B + 600 && m.get(4) === B + 900 && m.get(5) === B + 1200, JSON.stringify([...m]));
  ok('percurso: usa a hora de chegada (e a de partida quando só há essa)', m.get(3) === B + 600 && m.get(5) === B + 1200);
  ok('percurso: as paragens já passadas não têm hora', !m.has(0) && !m.has(1) && !m.has(2));
  m = T.previsoesDoPercurso({ ...viagem, paragens: [{ sequencia: 2, paragem: '11', chegada: B + 100, saltada: false }, ...viagem.paragens] }, percurso, 1);
  ok('percurso: linha circular — a 1.ª passagem pela 11 (índice 1) e a 2.ª (índice 3) ficam com horas diferentes', m.get(1) === B + 100 && m.get(3) === B + 600, JSON.stringify([...m]));
  m = T.previsoesDoPercurso({ ...viagem, paragens: [{ sequencia: 4, paragem: '11', chegada: B + 600, saltada: true }, viagem.paragens[1]] }, percurso, 3);
  ok('percurso: paragem saltada não leva hora', !m.has(3) && m.get(4) === B + 900);
  m = T.previsoesDoPercurso({ ...viagem, paragens: [] }, percurso, 0);
  ok('percurso: sem previsões → vazio', m.size === 0);
  m = T.previsoesDoPercurso(viagem, percurso, 99);
  ok('percurso: índice fora do percurso não rebenta', m.size === 0);
}

// ---------------------------------------------------------------- 5. cache, pedido partilhado, falhas e idade
{
  let agoraFalso = AGORA * 1000;
  const dataReal = Date.now;
  Date.now = () => agoraFalso;
  const fetchReal = globalThis.fetch;
  let pedidos = 0;
  let modo = 'bom';
  let horaDoFicheiro = AGORA;
  globalThis.fetch = async () => {
    pedidos++;
    await new Promise((r) => setTimeout(r, 15));
    if (modo === 'falha') throw new Error('sem rede');
    if (modo === 'http') return new Response('erro', { status: 503 });
    return new Response(feed(horaDoFicheiro, [entidadeViagem({ id: 'v', trip: '1_1', rota: '1', veiculo: '1', ts: horaDoFicheiro, paragens: [{ seq: 1, paragem: '1', chegada: { tempo: horaDoFicheiro + 60 } }] })]));
  };
  try {
    const r1 = await Promise.all([T.viagensTub(2000), T.viagensTub(2000), T.viagensTub(2000)]);
    ok('fonte: 3 pedidos ao mesmo tempo → 1 ida à TUB', pedidos === 1 && r1.every((r) => r && r.dados.has('1_1')), `pedidos=${pedidos}`);
    agoraFalso += 5_000;
    await T.viagensTub(2000);
    ok('fonte: 5 s depois ainda usa a cache (sem novo pedido)', pedidos === 1);
    agoraFalso += 12_000; horaDoFicheiro = Math.floor(agoraFalso / 1000);
    const r2 = await T.viagensTub(2000);
    ok('fonte: 17 s depois pede outra vez', pedidos === 2 && !!r2, `pedidos=${pedidos}`);
    ok('fonte: idade dos dados dentro do razoável', !!r2 && r2.idadeS < 5, String(r2?.idadeS));

    modo = 'falha';
    agoraFalso += 20_000; horaDoFicheiro = Math.floor(agoraFalso / 1000);
    const r3 = await T.viagensTub(2000);
    ok('fonte: se a TUB falha, usa os dados de há 20 s (ainda valem)', pedidos === 3 && !!r3 && r3.idadeS >= 19 && r3.idadeS < 25, `pedidos=${pedidos} idade=${r3?.idadeS}`);
    agoraFalso += 15_000;
    await T.viagensTub(2000);
    ok('fonte: depois de falhar não insiste antes de 30 s', pedidos === 3, `pedidos=${pedidos}`);
    agoraFalso += 20_000;
    const r4 = await T.viagensTub(2000);
    ok('fonte: passados 30 s volta a tentar', pedidos === 4 && !!r4, `pedidos=${pedidos}`);
    agoraFalso += 100_000;
    const r5 = await T.viagensTub(2000);
    ok('fonte: dados com mais de 2 minutos não se usam', r5 === null, JSON.stringify(r5 && r5.idadeS));

    modo = 'http';
    agoraFalso += 40_000;
    const r6 = await T.viagensTub(2000);
    ok('fonte: erro HTTP não deita fora nem inventa dados', r6 === null);

    modo = 'bom'; horaDoFicheiro = Math.floor(agoraFalso / 1000) - 300; // ficheiro que a TUB deixou de atualizar
    agoraFalso += 40_000;
    const r7 = await T.viagensTub(2000);
    ok('fonte: ficheiro parado há 5 minutos (hora no cabeçalho) não se usa', r7 === null, JSON.stringify(r7 && r7.idadeS));

    modo = 'bom'; horaDoFicheiro = Math.floor(agoraFalso / 1000) + 40; // relógio da TUB adiantado
    agoraFalso += 40_000;
    const r8 = await T.viagensTub(2000);
    ok('fonte: relógio da TUB adiantado não estraga a idade', !!r8 && r8.idadeS < 60, JSON.stringify(r8 && r8.idadeS));
  } finally {
    globalThis.fetch = fetchReal;
    Date.now = dataReal;
  }
}

// ---------------------------------------------------------------- 6. ficheiros reais (se houver)
if (process.env.FICHEIROS_TUB) {
  const pasta = process.env.FICHEIROS_TUB;
  const pos = new Uint8Array(fs.readFileSync(path.join(pasta, 'vehicle_positions.pb')));
  const via = new Uint8Array(fs.readFileSync(path.join(pasta, 'trip_updates.pb')));
  const hp = T.lerHoraDoFicheiro(pos);
  const lp = T.lerPosicoesTub(pos, hp);
  const lv = T.lerViagensTub(via, T.lerHoraDoFicheiro(via));
  console.log(`NOTA    ficheiros reais: ${lp.length} posições, ${lv.length} viagens`);
  ok('reais: posições lidas', lp.length > 0);
  ok('reais: todas as posições com viagem, linha e número de veículo', lp.every((p) => p.tripId && p.routeId && p.veiculo));
  ok('reais: posições em Braga (41.4–41.7, -8.6–-8.2)', lp.every((p) => p.lat > 41.4 && p.lat < 41.7 && p.lon > -8.6 && p.lon < -8.2), JSON.stringify(lp.slice(0, 1)));
  ok('reais: viagens lidas com paragens', lv.length > 0 && lv.every((v) => v.paragens.length > 0));
  ok('reais: cada paragem tem hora (chegada ou partida)', lv.every((v) => v.paragens.every((s) => s.chegada || s.partida || s.atrasoChegada !== undefined || s.atrasoPartida !== undefined)));
  const porViagem = new Map(lv.map((v) => [v.tripId, v]));
  ok('reais: as viagens com posição têm previsões', lp.filter((p) => porViagem.has(p.tripId)).length >= Math.floor(lp.length * 0.8), `${lp.filter((p) => porViagem.has(p.tripId)).length}/${lp.length}`);
  const ord = lv.every((v) => v.paragens.every((s, i, a) => i === 0 || a[i - 1].sequencia <= s.sequencia));
  ok('reais: paragens por ordem de sequência', ord);
  const mono = lv.every((v) => v.paragens.every((s, i, a) => { const t = s.partida ?? s.chegada; const u = i ? (a[i - 1].partida ?? a[i - 1].chegada) : undefined; return !t || !u || t >= u - 1; }));
  ok('reais: as horas previstas não andam para trás ao longo da viagem', mono);
}

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTodos os testes OK');
process.exit(falhas ? 1 : 0);
