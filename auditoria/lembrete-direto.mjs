// «Avisar-me antes de sair de casa» em direto (alerta de chegada, como o do Moovit+, 26/11/2026): o lembrete acompanha o
// 1.º transporte. Se o operador prevê que vem 6 min atrasado, o aviso chega 6 min mais tarde e diz a hora prevista; se vem
// adiantado, chega mais cedo; sem previsão fica a hora do horário. Os lembretes normais (sem paragem) não mudam.
// Uso: APP=<pasta da app> tsx auditoria/lembrete-direto.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'parou-lembrete-direto-'));
process.env.PAROU_DATA_DIR = dir; // antes de importar a app
const APP = path.resolve(process.env.APP || '../parou');
const L = await import(path.join(APP, 'src/server/lembreteDireto.ts'));
const P = await import(path.join(APP, 'src/server/avisosPush.ts'));

let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };
const MIN = 60_000;
const hm = (ms) => new Intl.DateTimeFormat('pt-PT', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit' }).format(ms);

// --- 1. Regra
const hora = Date.parse('2026-11-26T06:00:00Z');
const deps = [
  { trip_id: 'stcp:801_1', route_short_name: '801', dep_epoch_secs: hora / 1000, realtime_epoch_secs: hora / 1000 + 360, is_realtime: true },
  { trip_id: 'cm:1001_7', route_short_name: '1001', dep_epoch_secs: hora / 1000 + 60, is_realtime: false },
  { trip_id: 'outro', route_short_name: '205', dep_epoch_secs: hora / 1000 + 30, realtime_epoch_secs: hora / 1000 - 120, is_realtime: true },
];
let e = L.escolherPartida(deps, 'stcp:801_1', '801', hora);
ok('[regra] a mesma viagem, com previsão do operador: hora prevista (6 min de atraso)', e?.direto === true && e.ms === hora + 6 * MIN, JSON.stringify(e));
e = L.escolherPartida(deps, 'cmh:1001_7', '1001', hora + MIN);
ok('[regra] viagens «cmh:» encontram as «cm:» da paragem (sem previsão: hora do horário)', e?.direto === false && e.ms === hora + MIN, JSON.stringify(e));
e = L.escolherPartida(deps, 'id-que-o-direto-nao-usa', '205', hora);
ok('[regra] ids diferentes em direto: a mesma linha à mesma hora do horário', e?.direto === true && e.ms === hora - 2 * MIN, JSON.stringify(e));
ok('[regra] outra linha ou outra hora: nada', L.escolherPartida(deps, 'x', '205', hora + 10 * MIN) === undefined && L.escolherPartida(deps, 'x', '999', hora) === undefined);
const lem = { quando: hora - 15 * MIN, hora, antes: 15 * MIN };
ok('[regra] atrasado 6 min: o aviso chega 6 min mais tarde', L.momentoDoAviso(lem, { ms: hora + 6 * MIN }) === hora - 9 * MIN);
ok('[regra] adiantado 2 min: o aviso chega 2 min mais cedo', L.momentoDoAviso(lem, { ms: hora - 2 * MIN }) === hora - 17 * MIN);
ok('[regra] sem previsão: a hora do horário', L.momentoDoAviso(lem, undefined) === lem.quando);
ok('[regra] previsão absurda (mais de 1 h): a hora do horário', L.momentoDoAviso(lem, { ms: hora + 2 * 3600_000 }) === lem.quando);
ok('[regra] texto com a hora prevista e «em direto»', L.textoDoAviso('Apanha linha 801 às {h} em S. Pedro', hora + 6 * MIN, true, 'em direto') === `Apanha linha 801 às ${hm(hora + 6 * MIN)} em S. Pedro (em direto)`);
ok('[regra] sem previsão: hora do horário, sem «em direto»', L.textoDoAviso('Às {h}', hora, false, 'em direto') === `Às ${hm(hora)}`);

// --- 2. Envio pelo servidor (com o envio e a previsão simulados)
const T = P._testes();
const enviados = [];
T.definirEnvio(async (sub, dados) => { enviados.push({ endpoint: sub.endpoint, ...dados }); return 201; });
const b = T.base();
const agora = Date.now();
b.prepare('INSERT INTO subscricoes (endpoint, p256dh, auth, distritos, criado, visto, so_lembretes) VALUES (?, ?, ?, ?, ?, ?, 1)')
  .run('https://push.teste/1', 'p', 'a', '[]', agora, agora);
const ins = b.prepare('INSERT INTO lembretes (endpoint, quando, titulo, corpo, url, tag, criado, paragem, viagem, linha, hora, antes, em_direto) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
const novo = (tag, quando, horaP, extra = {}) => ins.run('https://push.teste/1', quando, 'Sai de casa daqui a 5 min', 'Apanha linha 801 às {h} em S. Pedro', '/', tag, agora,
  extra.paragem ?? 'stcp:SPC1', 'stcp:801_1', '801', horaP, horaP - quando, 'em direto');
// a) atrasado: pelo horário era já, mas o autocarro vem 6 min atrasado → ainda não
novo('atrasado', agora - 10_000, agora + 10 * MIN - 10_000);
// b) adiantado: pelo horário faltavam 2 min, mas vem 3 min adiantado → já
novo('adiantado', agora + 2 * MIN, agora + 12 * MIN);
// c) sem previsão: à hora do horário
novo('sem-previsao', agora - 5_000, agora + 10 * MIN - 5_000);
// d) normal (sem paragem): como sempre
b.prepare('INSERT INTO lembretes (endpoint, quando, titulo, corpo, url, tag, criado) VALUES (?, ?, ?, ?, ?, ?, ?)').run('https://push.teste/1', agora - 3_000, 'Normal', 'Texto fixo', '/', 'normal', agora);
const previsoes = { atrasado: 6 * MIN, adiantado: -3 * MIN };
T.definirPrevisao(async (paragem, viagem, linha, horaP) => {
  const l = b.prepare('SELECT tag FROM lembretes WHERE hora = ?').get(horaP);
  const d = previsoes[l?.tag];
  return d === undefined ? undefined : { ms: horaP + d, direto: true };
});
await T.enviarLembretes();
const por = (tag) => enviados.find((x) => x.tag === tag);
ok('[envio] autocarro atrasado: o aviso espera por ele', !por('atrasado'), JSON.stringify(por('atrasado')));
const ad = por('adiantado');
ok('[envio] autocarro adiantado: o aviso sai já, com a hora prevista e «em direto»', !!ad && ad.body.includes('(em direto)') && ad.body.includes(hm(agora + 9 * MIN)), ad?.body);
const sp = por('sem-previsao');
ok('[envio] sem previsão: sai à hora do horário, sem «em direto»', !!sp && !sp.body.includes('em direto') && sp.body.includes(hm(agora + 10 * MIN - 5_000)), sp?.body);
ok('[envio] lembrete normal (sem paragem) continua igual', por('normal')?.body === 'Texto fixo');
const pendente = b.prepare("SELECT enviado FROM lembretes WHERE tag = 'atrasado'").get();
ok('[envio] o atrasado fica à espera (não é dado como enviado)', pendente?.enviado === 0);
// passa o tempo: com o atraso, chega a hora dele
previsoes.atrasado = -1 * MIN; // agora vem quase à hora
enviados.length = 0;
await T.enviarLembretes();
ok('[envio] quando o autocarro se aproxima, o aviso sai', !!por('atrasado'));
enviados.length = 0;
await T.enviarLembretes();
ok('[envio] nunca sai duas vezes', enviados.length === 0, String(enviados.length));

// --- 3. Pedido da app (POST /api/push/lembrete): guarda a paragem, a viagem e a antecedência; rejeita dados estranhos
{
  const express = (await import(path.join(APP, 'node_modules/express/index.js'))).default;
  const app = express();
  app.use(express.json());
  P.registarRotasPush(app);
  const srv = await new Promise((r) => { const x = app.listen(0, '127.0.0.1', () => r(x)); });
  const url = `http://127.0.0.1:${srv.address().port}/api/push/lembrete`;
  const quando = Date.now() + 20 * MIN, horaP = quando + 12 * MIN;
  const pedir = (extra) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: 'https://push.teste/1', quando, titulo: 'Sai de casa daqui a 5 min', corpo: 'Às {h}', tag: 'http-' + Math.random(), ...extra }) });
  let r = await pedir({ direto: { paragem: 'stcp:SPC1', viagem: 'stcp:801_1', linha: '801', hora: horaP, emDireto: 'em direto' } });
  const j = await r.json();
  const g = b.prepare('SELECT paragem, viagem, linha, hora, antes, em_direto FROM lembretes WHERE id = ?').get(j.id);
  ok('[app] o pedido em direto guarda paragem, viagem, linha e antecedência (a pé + minutos)', r.ok && g?.paragem === 'stcp:SPC1' && g.viagem === 'stcp:801_1' && g.antes === 12 * MIN && g.em_direto === 'em direto', JSON.stringify(g));
  r = await pedir({ direto: { paragem: 'stcp:SPC1"; DROP', hora: horaP } });
  const j2 = await r.json();
  const g2 = b.prepare('SELECT paragem FROM lembretes WHERE id = ?').get(j2.id);
  ok('[app] paragem com caracteres estranhos: fica lembrete normal (à hora fixa)', r.ok && !g2?.paragem, JSON.stringify(g2));
  r = await pedir({ direto: { paragem: 'stcp:SPC1', hora: quando - MIN } });
  const g3 = b.prepare('SELECT paragem FROM lembretes WHERE id = ?').get((await r.json()).id);
  ok('[app] hora do transporte antes da hora do aviso: fica lembrete normal', r.ok && !g3?.paragem);
  srv.close();
}

console.log();
console.log(falhas ? `${falhas} falha(s)` : 'Tudo OK');
process.exit(falhas ? 1 : 0);
