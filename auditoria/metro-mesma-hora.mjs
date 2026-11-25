// Metro do Porto: o horário oficial dá a mesma hora à linha A e à F no troço comum, mas na estação só passa um metro (25/11/2026).
// A app não mexe nas horas (não se sabe qual está certa): marca a partida e mostra um aviso. Testa a regra (marcarMesmaHora) e,
// com a app a correr (BASE), que as partidas de Campanhã com A e F ao mesmo minuto trazem o aviso.
// Uso: APP=pasta-da-app [BASE=http://127.0.0.1:3000] tsx metro-mesma-hora.mjs
import path from 'path';
const APP = process.env.APP || '../app';
const BASE = process.env.BASE || '';
let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };
const { marcarMesmaHora } = await import(path.resolve(APP, 'src/server/departureEngine.ts'));

const base = { feed_id: 'metro_porto', stop_id: 'metro_porto:5703', is_realtime: false, route_type: 0, dep_epoch_secs: 1_800_000_040 };
const dep = (o) => ({ ...base, ...o });
{
  const A = dep({ trip_id: 'AU140', route_id: 'A', route_short_name: 'A' });
  const F = dep({ trip_id: 'FU140', route_id: 'F', route_short_name: 'F', dep_epoch_secs: base.dep_epoch_secs + 10 });
  const Fv = dep({ trip_id: 'FU62', route_id: 'F', route_short_name: 'F' }); // sentido contrário, mesmo minuto
  const E = dep({ trip_id: 'EU27', route_id: 'E', route_short_name: 'E', dep_epoch_secs: base.dep_epoch_secs + 180 });
  marcarMesmaHora([A, F, Fv, E], () => new Map([['AU140', 1], ['FU140', 1], ['FU62', 0], ['EU27', 0]]));
  ok('[regra] A e F no mesmo sentido e minuto: a A avisa que tem a mesma hora que a F', A.mesma_hora_que === 'F', String(A.mesma_hora_que));
  ok('[regra] e a F avisa que tem a mesma hora que a A', F.mesma_hora_que === 'A', String(F.mesma_hora_que));
  ok('[regra] sentido contrário ao mesmo minuto: sem aviso (são metros em linhas diferentes)', Fv.mesma_hora_que === undefined);
  ok('[regra] outro minuto: sem aviso', E.mesma_hora_que === undefined);
}
{
  const A = dep({ trip_id: 'a', route_id: 'A', route_short_name: 'A', is_realtime: true });
  const F = dep({ trip_id: 'f', route_id: 'F', route_short_name: 'F' });
  marcarMesmaHora([A, F], () => new Map([['a', 1], ['f', 1]]));
  ok('[regra] com tempo real não se avisa', A.mesma_hora_que === undefined && F.mesma_hora_que === undefined);
  const b1 = dep({ trip_id: 'b1', route_id: '200', route_short_name: '200', route_type: 3 });
  const b2 = dep({ trip_id: 'b2', route_id: '201', route_short_name: '201', route_type: 3 });
  marcarMesmaHora([b1, b2], () => new Map([['b1', 0], ['b2', 0]]));
  ok('[regra] autocarros ao mesmo minuto não avisam (podem mesmo passar juntos)', b1.mesma_hora_que === undefined && b2.mesma_hora_que === undefined);
  const s1 = dep({ trip_id: 's1', route_id: 'A', route_short_name: 'A' });
  const s2 = dep({ trip_id: 's2', route_id: 'A', route_short_name: 'A' });
  marcarMesmaHora([s1, s2], () => new Map([['s1', 1], ['s2', 1]]));
  ok('[regra] a mesma linha duas vezes não avisa', s1.mesma_hora_que === undefined);
}
if (BASE) {
  // Campanhã: procura partidas A e F ao mesmo minuto no mesmo destino-sentido nas próximas horas
  const r = await fetch(`${BASE}/api/transit/stop/${encodeURIComponent('metro_porto:5703')}?linhas=1`).then((x) => x.json()).catch(() => null);
  const deps = (r?.departures || []).filter((d) => d.feed_id === 'metro_porto' && !d.is_realtime);
  const porMin = new Map();
  for (const d of deps) { const k = Math.floor(d.dep_epoch_secs / 60); porMin.set(k, [...(porMin.get(k) || []), d]); }
  const pares = [...porMin.values()].filter((l) => l.some((d) => d.route_short_name === 'A') && l.some((d) => d.route_short_name === 'F'));
  console.log(`NOTA   Campanhã: ${deps.length} partidas do metro, ${pares.length} minutos com A e F`);
  const doMesmoSentido = pares.filter((l) => l.some((d) => /Drag/.test(d.headsign || '')) && l.some((d) => /F[âa]nzeres/.test(d.headsign || '')));
  if (doMesmoSentido.length) {
    const comAviso = doMesmoSentido.every((l) => l.filter((d) => /Drag|F[âa]nzeres/.test(d.headsign || '')).every((d) => d.mesma_hora_que));
    ok('[app] em Campanhã, A (Dragão) e F (Fânzeres) ao mesmo minuto trazem o aviso', comAviso, JSON.stringify(doMesmoSentido[0].map((d) => [d.route_short_name, d.headsign, d.scheduled_time, d.mesma_hora_que])));
  } else console.log('NOTA   sem A e F ao mesmo minuto nas partidas de agora (fora de horas): parte da app não verificada');
  const semMotivo = deps.filter((d) => d.mesma_hora_que && !deps.some((x) => x !== d && Math.floor(x.dep_epoch_secs / 60) === Math.floor(d.dep_epoch_secs / 60) && x.route_short_name === d.mesma_hora_que));
  ok('[app] nenhum aviso sem a outra linha ao mesmo minuto', semMotivo.length === 0, String(semMotivo.length));
}
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo OK');
process.exit(falhas ? 1 : 0);
