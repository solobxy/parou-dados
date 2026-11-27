// Tempo real da STCP: viagens que ainda não saíram do início da linha e entradas que são só horário.
// Caso real: Campanhã, 27/11/2026, 20:04 (respostas da STCP copiadas daí).
// Uso: APP=<pasta da app> tsx auditoria/stcp-fantasmas.mjs
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const APP = process.env.APP || path.resolve('..', 'parou');
const F = await import(pathToFileURL(path.join(APP, 'src/server/stcpFantasmas.ts')).href);
let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };

const agora = Date.parse('2026-11-27T20:04:39Z') / 1000;
const r206_17 = { route_short_name: '206', trip_headsign: 'Viso', estimated_arrival_time: '2026-11-27T20:04:39+00:00', delay_minutes: 98.7, arrival_minutes: 0, status: 'ARRIVING', trip_id: '206_0_1|340|D1|T1|N17' };
const r206_19 = { route_short_name: '206', trip_headsign: 'Viso', estimated_arrival_time: '2026-11-27T20:15:00+00:00', delay_minutes: 0, arrival_minutes: 10, status: 'ON_TIME', trip_id: '206_0_1|340|D1|T1|N19' };
const r400 = { route_short_name: '400', trip_headsign: 'Trindade', estimated_arrival_time: '2026-11-27T20:15:39+00:00', delay_minutes: 12.7, arrival_minutes: 10, status: 'DELAYED' };
const r400_certo = { route_short_name: '400', estimated_arrival_time: '2026-11-27T20:23:00+00:00', delay_minutes: 0, arrival_minutes: 18, com_gps: true };

ok('hora estimada da fonte anterior (ao segundo, não aos minutos)', F.horaEstimada(r400, agora) === Date.parse('2026-11-27T20:15:39Z') / 1000);
ok('hora exata da API oficial', F.horaEstimada({ epoch: 1795000000, arrival_minutes: 3 }, agora) === 1795000000);
ok('sem hora: minutos que faltam', F.horaEstimada({ arrival_minutes: 4 }, agora) === agora + 240);
ok('atraso 0 e hora certa ao segundo (20:15:00) = só horário', F.soHorario(r206_19) === true);
ok('com atraso não é só horário', F.soHorario(r400) === false);
ok('API oficial com GPS e atraso 0 é tempo real', F.soHorario(r400_certo) === false);
ok('API oficial sem GPS e atraso 0 = só horário', F.soHorario({ delay_minutes: 0, com_gps: false, epoch: agora + 60 }) === true);

const est = F.horaEstimada(r206_17, agora);
const atrasoS = Math.round(98.7 * 60);
ok('206 das 18:26 «a chegar» com 98 min no início da linha: não é um autocarro a chegar',
  F.aindaNaOrigem({ estEpoch: est, atrasoS, agora, naOrigem: true }) === true);
ok('o mesmo atraso a meio da linha fica (o autocarro está mesmo atrasado)',
  F.aindaNaOrigem({ estEpoch: est, atrasoS, agora, naOrigem: false }) === false);
ok('na origem com atraso pequeno (3 min) fica', F.aindaNaOrigem({ estEpoch: agora + 30, atrasoS: 180, agora, naOrigem: true }) === false);
ok('na origem, saída daqui a 8 min com atraso: fica (há hora prevista)', F.aindaNaOrigem({ estEpoch: agora + 480, atrasoS: 900, agora, naOrigem: true }) === false);

// O motor tem de usar estas regras antes de juntar a chegada à partida (barreira contra regressões)
const fs = await import('node:fs');
const motor = fs.readFileSync(path.join(APP, 'src/server/realtimeEngine.ts'), 'utf8');
const bloco = motor.slice(motor.indexOf('for (const a of chegadas)'), motor.indexOf('stcpTempoReal.set(melhor'));
ok('motor: ignora entradas só de horário', /soHorario\(a\)\) continue/.test(bloco));
ok('motor: ignora viagens ainda na origem', /aindaNaOrigem\(/.test(bloco) && /paragemDeOrigemStcp\(/.test(bloco));

const filtro = motor.slice(motor.indexOf('public static async getStcpArrivals('), motor.indexOf('private static async getStcpArrivalsBrutas('));
ok('fonte: o tempo real da STCP sai já filtrado para todos os ecrãs (Perto, paragem, linhas)',
  filtro.length > 0 && /soHorario\(a\)/.test(filtro) && /aindaNaOrigem\(/.test(filtro));
const fim = motor.slice(motor.lastIndexOf('result.push(mergedDep)') - 900, motor.lastIndexOf('result.push(mergedDep)'));
ok('todos os operadores: hora «agora» com atraso grande na 1.ª paragem da viagem não passa', /aindaNaOrigem\(/.test(fim) && /primeiraParagemDaViagem\(/.test(fim));
const prim = motor.slice(motor.indexOf('private static primeiraParagemDaViagem('), motor.indexOf('private static primeiraParagemDaViagem(') + 1200);
ok('linha circular: a 1.ª paragem conta pela ordem, não só pelo nome', /seq === info\.seq/.test(prim));

console.log(falhas ? `\n${falhas} FALHAS` : '\nTUDO OK');
process.exit(falhas ? 1 : 0);
