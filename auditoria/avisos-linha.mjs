// Avisos das linhas guardadas: a mesma chave para a linha guardada na app e a linha no aviso do operador, só quem
// guardou a linha recebe o aviso (com a linha no título), o mesmo aviso não chega duas vezes (geral e da linha),
// avisos que piscam não repetem, e ao ligar a novidade no servidor não chegam de uma vez os avisos já ativos.
// Uso: APP=<pasta da app> tsx auditoria/avisos-linha.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'parou-avisos-linha-'));
process.env.PAROU_DATA_DIR = dir; // antes de importar a app
const APP = process.env.APP || '../parou';
const U = await import(path.join(APP, 'src/utils/avisosLinha.ts'));
const A = await import(path.join(APP, 'src/server/alertasEngine.ts'));
const P = await import(path.join(APP, 'src/server/avisosPush.ts'));

let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };

// --- 1. Chaves: a linha guardada e a linha do aviso dão a mesma chave
const k = A.chaveLinha;
ok('[chave] CM: «1001» (app) = «1001_0» (aviso, com sentido)', k('Carris Metropolitana', '1001') === 'carris-metropolitana|1001' && k('Carris Metropolitana', '1001_0') === 'carris-metropolitana|1001', k('Carris Metropolitana', '1001_0'));
ok('[chave] CM pelo feed do id («cm:1001»)', k('cm', '1001') === 'carris-metropolitana|1001' && k('carris_metropolitana', '1001') === 'carris-metropolitana|1001');
ok('[chave] CM: aviso do TML com prefixo [..]', k('TML', '[CM]1001_1') === 'carris-metropolitana|1001', k('TML', '[CM]1001_1'));
ok('[chave] Metro de Lisboa: «Linha Azul» (aviso) = «AZ» (código) = cor só no nome',
  k('Metropolitano de Lisboa', 'Linha Azul') === 'metro-lisboa|azul' && k('Metro de Lisboa', 'AZ') === 'metro-lisboa|azul' && k('metro_lisboa', '1', 'Linha Azul (Reboleira - Santa Apolónia)') === 'metro-lisboa|azul',
  [k('Metropolitano de Lisboa', 'Linha Azul'), k('Metro de Lisboa', 'AZ'), k('metro_lisboa', '1', 'Linha Azul (Reboleira - Santa Apolónia)')].join(' '));
ok('[chave] Carris (Lisboa) 728 ≠ Carris Metropolitana 728', k('Carris (Lisboa)', '728') === 'carris|728' && k('Carris (Lisboa)', '728') !== k('Carris Metropolitana', '728'));
ok('[chave] sem linha ou sem operador: vazia', k('Carris Metropolitana', '') === '' && k('', '1001') === '');

// --- 1b. Avisos dos operadores que viram avisos por linha
const H = 3600_000, ag = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const av = (id, o) => ({ id, status: 'Ativo', tipo: 'desvio', título: `Aviso ${id}`, operador: 'Carris Metropolitana', linhas: ['1001_0'], start_datetime: iso(ag - H), end_datetime: iso(ag + 5 * H), ...o });
const C = await A.candidatosLinhas(async () => [
  av('tml-1', { título: 'Desvio na Rua Direita', operador: 'TML', linhas: ['[CM]1001_0'] }),
  av('carris-9', { título: 'Desvio na Rua Direita', linhas: ['1002_1'] }), // o mesmo aviso, pela outra fonte
  av('rede', { linhas: Array.from({ length: 31 }, (_, i) => String(2000 + i)) }),
  av('horario', { tipo: 'novo horário' }),
  av('longe', { status: 'Futuro', start_datetime: iso(ag + 20 * H) }),
  av('breve', { status: 'Futuro', título: 'Obras na Avenida', start_datetime: iso(ag + 2 * H) }),
  av('velho', { start_datetime: iso(ag - 8 * H) }),
  av('acabou', { end_datetime: iso(ag - H) }),
  av('aviao', { operador: 'TAP Air Portugal', título: 'Voos cancelados' }),
  av('ipma', { operador: 'IPMA / Proteção Civil' }),
  av('greve-ml', { operador: 'Metropolitano de Lisboa', tipo: 'greve', título: 'Paralisação dos trabalhadores', linhas: ['Linha Verde'] }),
]);
const porId = (p) => C.find((c) => c.id.startsWith(`linha:${p}@`));
ok('[avisos] o mesmo aviso pelas duas fontes: um só, com as linhas das duas', C.filter((c) => /Rua Direita/.test(c.corpo)).length === 1 && JSON.stringify(porId('tml-1')?.linhas) === JSON.stringify(['carris-metropolitana|1001', 'carris-metropolitana|1002']), JSON.stringify(C.filter((c) => /Rua Direita/.test(c.corpo)).map((c) => c.linhas)));
ok('[avisos] fora: rede inteira (31 linhas), horários novos, a mais de 12 h, começou há mais de 6 h, já acabou, aviões, IPMA',
  ['rede', 'horario', 'longe', 'velho', 'acabou', 'aviao', 'ipma'].every((p) => !porId(p)), C.map((c) => c.id).join(' '));
ok('[avisos] dentro: o que começa daqui a 2 h, com a hora no texto', /hoje às|amanhã às/.test(porId('breve')?.corpo || ''), porId('breve')?.corpo);
ok('[avisos] greve no Metro: diz que é greve e vai para quem segue a Linha Verde', porId('greve-ml')?.corpo.startsWith('Greve: ') && JSON.stringify(porId('greve-ml')?.linhas) === '["metro-lisboa|verde"]' && porId('greve-ml')?.pausaHoras === 2, JSON.stringify(porId('greve-ml')));
ok('[avisos] nenhum aviso de linha vai por distrito', C.every((c) => c.distritos.length === 0 && c.linhas?.length > 0));

// --- 2. Que linhas a app manda (favoritos novos e lista antiga dos Horários)
const fav = [
  { id: 'line-cm:1001', operatorName: 'Carris Metropolitana', lineCode: '1001', lineName: 'Algés - Linda-a-Velha' },
  { id: 'line-metro_lisboa:2', operatorName: 'Metro de Lisboa', lineCode: '2', lineName: 'Linha Amarela' },
  { id: 'stop-cm:010101', operatorName: 'Carris Metropolitana' },
];
const L = U.linhasParaAvisos(fav, ['cm:1001', 'carris:728', 42]);
ok('[app] só linhas (paragens ficam de fora), sem repetir a da lista antiga', L.length === 3, JSON.stringify(L));
ok('[app] linha da lista antiga usa o feed do id', L.some((l) => l.op === 'carris' && l.ln === '728'));
ok('[app] no servidor, cada uma dá a chave certa', L.map((l) => k(l.op, l.ln, l.nome || '')).join(' ') === 'carris-metropolitana|1001 metro-lisboa|amarela carris|728', L.map((l) => k(l.op, l.ln, l.nome || '')).join(' '));
ok('[app] nunca mais de 40', U.linhasParaAvisos(Array.from({ length: 60 }, (_, i) => ({ id: `line-cm:${1000 + i}`, operatorName: 'Carris Metropolitana', lineCode: String(1000 + i) }))).length === 40);
ok('[app] avisos por linha só onde existem (CM e Metro de Lisboa)', U.temAvisosPorLinha('Carris Metropolitana') && U.temAvisosPorLinha('Metro de Lisboa') && U.temAvisosPorLinha('', 'cm:1001') && !U.temAvisosPorLinha('STCP (Porto)', 'stcp:200') && !U.temAvisosPorLinha('Carris (Lisboa)', 'carris:728'));

// --- 3. Convite para ligar os avisos ao guardar uma linha
const DIA = 864e5, AGORA = Date.parse('2026-11-11T18:00:00Z');
const c0 = { suportado: true, permissao: 'default', ligados: false, memoria: { vezes: 0, fechadoEm: null }, agora: AGORA };
ok('[convite] 1.ª vez: convida', U.deveConvidarAvisosLinha(c0));
ok('[convite] já tem os avisos ligados: não', !U.deveConvidarAvisosLinha({ ...c0, ligados: true }));
ok('[convite] bloqueou as notificações: não', !U.deveConvidarAvisosLinha({ ...c0, permissao: 'denied' }));
ok('[convite] aparelho sem notificações (iPhone fora da app instalada): não', !U.deveConvidarAvisosLinha({ ...c0, suportado: false }));
ok('[convite] disse «agora não» há 3 dias: não', !U.deveConvidarAvisosLinha({ ...c0, memoria: { vezes: 1, fechadoEm: AGORA - 3 * DIA } }));
ok('[convite] disse «agora não» há 20 dias: volta', U.deveConvidarAvisosLinha({ ...c0, memoria: { vezes: 1, fechadoEm: AGORA - 20 * DIA } }));
ok('[convite] disse «agora não» 2 vezes: nunca mais', !U.deveConvidarAvisosLinha({ ...c0, memoria: { vezes: 2, fechadoEm: AGORA - 400 * DIA } }));
ok('[convite] memória estragada conta como nova', JSON.stringify(U.lerMemoriaConvite('{nada')) === JSON.stringify({ vezes: 0, fechadoEm: null }));

// --- 4. Servidor: quem recebe o quê
const T = P._testes();
const enviados = [];
T.definirEnvio(async (sub, dados) => { enviados.push({ quem: sub.endpoint.split('/').pop(), ...dados }); return 201; });
T.definirSilencio(() => false);
const b = T.base();
const sub = (nome, distritos, linhas) => b.prepare(
  'INSERT INTO subscricoes (endpoint, p256dh, auth, distritos, linhas, criado, visto, so_lembretes) VALUES (?, ?, ?, ?, ?, ?, ?, 0)',
).run(`https://push.exemplo/${nome}`, 'x', 'y', JSON.stringify(distritos), JSON.stringify(linhas), Date.now(), Date.now());
sub('ana', ['Lisboa'], ['carris-metropolitana|1001']); // segue a 1001
sub('bruno', ['Lisboa'], []); // só avisos gerais de Lisboa
sub('carla', ['Porto'], ['metro-lisboa|azul']); // vive no Porto mas segue a Linha Azul
let fonte = [];
T.definirFonte(async () => fonte);
const ciclo = async (lista) => { fonte = lista; enviados.length = 0; await T.ciclo(); return enviados.map((e) => `${e.quem}: ${e.title}`); };

await ciclo([]); // servidor novo: só regista
const avisoCM = (id, linhas, inicio = '2026-11-11T17:30:00Z') => ({
  id: `linha:${id}@${inicio}`, grupo: `linha:${id}`, pausaHoras: 12, titulo: 'Carris Metropolitana', corpo: 'Desvio na Rua X', distritos: [], urgente: false,
  url: '/alertas', linhas: linhas.map((l) => `carris-metropolitana|${l}`), opNome: 'Carris Metropolitana',
});
let r = await ciclo([avisoCM('alert-tml-1', ['1001', '1002'])]);
ok('[servidor] logo a seguir a ligar a novidade, os avisos de linha já ativos não chegam de uma vez', r.length === 0, r.join(' | '));
b.prepare("UPDATE vistos SET quando = 0 WHERE id = 'inicio-linhas'").run(); // passou meia hora

const geral = { id: 'oficial:alert-tml-2', grupo: 'grave:carris-metropolitana', pausaHoras: 4, titulo: 'Carris Metropolitana', corpo: 'Linha 1001 interrompida', distritos: ['Lisboa', 'Setúbal'], urgente: false, url: '/alertas' };
r = await ciclo([geral, avisoCM('alert-tml-2', ['1001'])]);
ok('[servidor] quem segue a 1001 recebe uma só vez, com a linha no título', r.filter((x) => x.startsWith('ana:')).join() === 'ana: Linha 1001 · Carris Metropolitana', r.join(' | '));
ok('[servidor] quem não segue a linha recebe o aviso geral do distrito', r.filter((x) => x.startsWith('bruno:')).join() === 'bruno: Carris Metropolitana', r.join(' | '));
ok('[servidor] quem não segue a linha nem é do distrito não recebe nada', !r.some((x) => x.startsWith('carla:')), r.join(' | '));

r = await ciclo([avisoCM('alert-tml-3', ['1002'])]);
ok('[servidor] aviso de uma linha que ninguém segue: ninguém recebe', r.length === 0, r.join(' | '));

const metro = (inicio) => ({ id: `linha:alert-ml-azul@${inicio}`, grupo: 'linha:metro-lisboa|perturbacaonalinhaazul', pausaHoras: 2, titulo: 'Metro de Lisboa', corpo: 'Perturbação na Linha Azul do Metro de Lisboa', distritos: [], urgente: false, url: '/alertas', linhas: ['metro-lisboa|azul'], opNome: 'Metro de Lisboa' });
r = await ciclo([metro('2026-11-11T17:40:00Z')]);
ok('[servidor] Linha Azul: chega a quem a segue, mesmo noutro distrito', r.join() === 'carla: Linha Azul · Metro de Lisboa', r.join(' | '));
r = await ciclo([metro('2026-11-11T17:55:00Z')]);
ok('[servidor] a mesma linha volta a ter perturbação 15 min depois: não repete (pausa de 2 h)', r.length === 0, r.join(' | '));
b.prepare("UPDATE vistos SET quando = 0 WHERE id LIKE 'grupo:linha:metro-lisboa%'").run(); // passaram 3 h
r = await ciclo([metro('2026-11-11T21:00:00Z')]);
ok('[servidor] nova perturbação horas depois: volta a avisar (o id muda com o início)', r.join() === 'carla: Linha Azul · Metro de Lisboa', r.join(' | '));
ok('[servidor] título com várias linhas seguidas', T.tituloDaLinha({ titulo: 'x', opNome: 'Metro de Lisboa' }, ['azul', 'verde']) === 'Linhas Azul e Verde · Metro de Lisboa');

fs.rmSync(dir, { recursive: true, force: true });
console.log(falhas ? `\n${falhas} falha(s)` : '\nTudo OK');
process.exit(falhas ? 1 : 0);
