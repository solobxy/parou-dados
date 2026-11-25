// Garante que os avisos da plataforma GO da TML chegam à app.
//
// O problema que isto impede: a TML mudou a API (cada pedido leva agora a organização: /hub/api/v1/<organização>/alerts) e os
// endereços antigos (/hub/api/v1/alerts, /eta, /vehicles…) passaram a dar 404. A app deixou de receber os avisos do Metro de
// Lisboa e da MobiCascais que só chegam por aqui, sem dar por isso. Os da Carris Metropolitana chegam pela API dela, por isso
// os da TML com as agências da Carris Metropolitana não se repetem.
// Uso: APP=caminho-da-app tsx auditoria/tml-alertas.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.PAROU_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'parou-tml-'));
const caminho = process.env.APP || '../app';

let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };

const agora = Date.now();
const DIA = 86400_000;
// formato real (respostas de 25/11/2026)
const AVISOS = [
  { _id: 'CM1', agency_id: 'LA77N', title: 'Cascais | 1625: Desvio de percurso Alcoitão', description: 'A partir do dia 23 de novembro, a linha 1625 irá sofrer alteração de percurso.', cause: 'CONSTRUCTION', effect: 'DETOUR', active_period_start_date: agora - DIA, active_period_end_date: agora + 5 * DIA, info_url: null, reference_type: 'lines', references: [{ child_ids: [], parent_id: '[LA77N]1625' }] },
  { _id: 'ML1', agency_id: 'IA2N9', title: 'Metro | Estação Entre Campos: Acesso encerrado', description: 'O acesso da Av. 5 de Outubro está encerrado.', cause: 'MAINTENANCE', effect: 'ACCESSIBILITY_ISSUE', active_period_start_date: agora - DIA, active_period_end_date: agora + 30 * DIA, info_url: null, reference_type: 'stops', references: [{ child_ids: ['210443'], parent_id: '[IA2N9]2' }] },
  { _id: 'MC1', agency_id: 'HF16N', title: 'Condicionamento de trânsito na Av. Sabóia | Alterações nas Linhas M12 e M20', description: 'Devido a obras, as linhas M12 e M20 fazem desvio.', cause: 'CONSTRUCTION', effect: 'DETOUR', active_period_start_date: agora - DIA, active_period_end_date: agora + 6 * DIA, info_url: 'https://mobi.cascais.pt/aviso/x', reference_type: 'lines', references: [{ child_ids: [], parent_id: '[HF16N]12' }, { child_ids: [], parent_id: '[HF16N]20' }] },
  // A MobiCascais publica o mesmo desvio uma vez por cada dia (o título é a lista das datas que faltam): é um só aviso
  ...[[-3, 'Dias 22, 28 e 29 de novembro e 5 de dezembro de 2026'], [3, 'Dias 28 e 29 de novembro e 5 de dezembro de 2026'], [4, 'Dias 29 de novembro e 5 de dezembro de 2026'], [10, 'Dia 5 de dezembro de 2026']].map(([d, titulo], i) => ({
    _id: `M27_${i}`, agency_id: 'HF16N', title: titulo, description: `No âmbito das iniciativas do Natal em Cascais, será necessário proceder a cortes de trânsito ${titulo.replace(/^Dias?/, 'nos dias').replace(' de 2026', '')}, entre as 17h e as 20h. A Linha M27 realizará o desvio pela Av. da República.`, // como nos reais: o texto também traz as datas
    cause: 'DEMONSTRATION', effect: 'DETOUR', active_period_start_date: agora + d * DIA, active_period_end_date: agora + d * DIA + 3 * 3600_000, info_url: null,
    reference_type: 'lines', references: [{ child_ids: [], parent_id: '[HF16N]27' }],
  })),
];
const AGENCIAS = [
  { _id: 'LA77N', name: 'Carris Metropolitana' }, { _id: 'IA2N9', name: 'Metro de Lisboa' }, { _id: 'HF16N', name: 'MobiCascais' },
  { _id: 'IA9T6', name: 'CARRIS' }, { _id: 'KJTOU', name: 'Unir' },
];
const pedidos = [];
const envelope = (data) => new Response(JSON.stringify({ data, error: null, status_code: '200' }), { status: 200, headers: { 'content-type': 'application/json' } });
globalThis.fetch = async (url) => {
  const u = String(url);
  pedidos.push(u);
  const m = /^https:\/\/go\.tmlmobilidade\.pt\/hub\/api\/v1\/([A-Z0-9]{5})\/(alerts|agencies|network\/lines|vehicles\/positions|eta)$/.exec(u);
  if (m) {
    if (m[2] === 'alerts') return envelope(AVISOS);
    if (m[2] === 'agencies') return envelope(AGENCIAS);
    return envelope([]);
  }
  if (u.startsWith('https://go.tmlmobilidade.pt/')) return new Response('<!DOCTYPE html><title>GO | 404 Not Found</title>', { status: 404 }); // os endereços antigos
  return new Response('sem rede no teste', { status: 503 });
};

const T = await import(`${caminho}/src/server/tmlGoHubService.ts`);
const A = await import(`${caminho}/src/server/centralAlertsEngine.ts`);

const avisosTml = await T.getTmlAlerts();
ok('[API] os avisos da TML chegam (endereço com a organização)', avisosTml.length === AVISOS.length, `${avisosTml.length} avisos; pedidos: ${pedidos.filter((p) => p.includes('tmlmobilidade')).join(' ')}`);
ok('[API] as agências da TML chegam', (await T.getTmlAgencies()).length === 5);

const lista = await A.getCentralAlerts({ status: 'Todos' });
const daTml = lista.filter((a) => a.source === 'TML GO Hub');
const ml = daTml.find((a) => a.external_id === 'ML1');
const mc = daTml.find((a) => a.external_id === 'MC1');
ok('[central] o aviso do Metro de Lisboa entra, com o operador certo', ml?.operador === 'Metro de Lisboa', JSON.stringify(ml && { op: ml.operador, linhas: ml.linhas }));
ok('[central] a linha do Metro vem pela cor (2 = Amarela)', JSON.stringify(ml?.linhas) === '["Amarela"]', JSON.stringify(ml?.linhas));
ok('[central] o aviso da MobiCascais entra, com o operador e as linhas', mc?.operador === 'MobiCascais' && JSON.stringify(mc?.linhas) === '["12","20"]', JSON.stringify(mc && { op: mc.operador, linhas: mc.linhas }));
ok('[central] o aviso da Carris Metropolitana não se repete pela TML (chega pela API da Carris Metropolitana)', !daTml.some((a) => a.external_id === 'CM1'), daTml.map((a) => a.external_id).join(','));

const m27 = daTml.filter((a) => (a.linhas || []).includes('27'));
ok('[repetidos] os 4 avisos da linha 27 (um por dia) ficam num só', m27.length === 1, m27.map((a) => a['título']).join(' / '));
ok('[repetidos] fica o da próxima data (o de há 3 dias já passou), com o título das datas que faltam',
  m27[0]?.['título'] === 'Dias 28 e 29 de novembro e 5 de dezembro de 2026' && Math.abs(new Date(m27[0]?.start_datetime).getTime() - (agora + 3 * DIA)) < 60_000 && m27[0]?.status === 'Futuro',
  JSON.stringify(m27[0] && { t: m27[0]['título'], ini: m27[0].start_datetime, st: m27[0].status }));
ok('[repetidos] avisos diferentes da mesma agência continuam separados', !!mc && m27.length === 1 && daTml.filter((a) => a.operador === 'MobiCascais').length === 2, daTml.map((a) => a.external_id).join(','));
const lista2 = await A.getCentralAlerts({ status: 'Todos' }); // segunda sincronização: o mesmo aviso, não um novo
ok('[repetidos] numa nova sincronização continua a ser um só (o mesmo código)', lista2.filter((a) => a.source === 'TML GO Hub' && (a.linhas || []).includes('27')).length === 1);

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo OK');
process.exit(falhas ? 1 : 0);
