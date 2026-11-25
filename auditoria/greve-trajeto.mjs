// Greves nos trajetos (pedido do Dinis, 25/11/2026: havia greve confirmada na CP e o troço de comboio do trajeto não
// avisava). Um aviso oficial de greve do operador marca o troço que sai dentro do período da greve (ou num dia em que o
// operador prevê perturbações). Testa a regra (grevesPlaneador.ts) e, com a app a correr (BASE), que um comboio da CP
// dentro de uma greve oficial ativa traz o aviso.
// Uso: APP=pasta-da-app [BASE=http://127.0.0.1:3000] node --import tsx greve-trajeto.mjs
import path from 'node:path';
const APP = path.resolve(process.env.APP || '../app');
const BASE = process.env.BASE || '';
let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };
const G = await import(`${APP}/src/server/grevesPlaneador.ts`);

const agora = Date.parse('2026-11-25T23:00:00Z');
const aviso = (o) => ({ tipo: 'greve', status: 'Ativo', operador: 'CP', título: 'Greve - serviços mínimos a 24 e 25 de novembro', source_url: 'https://www.cp.pt/pt/detalhe-aviso/greve-23a27-nov',
  start_datetime: '2026-11-23T00:00:00.000Z', end_datetime: '2026-11-27T23:59:59.999Z', ...o });
const greves = G.grevesDosAvisos([
  aviso({}),
  aviso({ operador: 'Metro de Lisboa', título: 'Greve no Metro', start_datetime: '2026-11-20T00:00:00Z', end_datetime: '2026-11-20T23:59:59Z', dias_perturbacao: ['2026-11-26'] }),
  aviso({ tipo: 'obras', operador: 'STCP', título: 'Obras' }),
  aviso({ operador: 'Carris', título: 'Greve antiga', start_datetime: '2026-11-01T00:00:00Z', end_datetime: '2026-11-02T00:00:00Z' }),
  aviso({ operador: 'Fertagus', status: 'Cancelado' }),
], agora);
ok('[regra] só greves que ainda valem (fora obras, antigas e canceladas)', greves.length === 2, greves.map((g) => g.operador).join(','));
const amanha0640 = Date.parse('2026-11-26T06:40:00Z');
let g = G.greveDoTroco('cp', amanha0640, greves);
ok('[regra] comboio da CP amanhã às 06:40, dentro da greve: aviso', g && !g.previsto && g.operador === 'CP' && /cp\.pt/.test(g.url), JSON.stringify(g));
ok('[regra] comboio da CP depois do fim da greve: sem aviso', G.greveDoTroco('cp', Date.parse('2026-11-28T08:00:00Z'), greves) === undefined);
ok('[regra] outro operador no mesmo dia: sem aviso', G.greveDoTroco('stcp', amanha0640, greves) === undefined && G.greveDoTroco('metro_porto', amanha0640, greves) === undefined);
g = G.greveDoTroco('metro_lisboa', amanha0640, greves);
ok('[regra] dia com perturbações previstas pelo operador: aviso «previsto»', g && g.previsto === true, JSON.stringify(g));
ok('[regra] Carris não é a Carris Metropolitana', G.greveDoTroco('cm', amanha0640, G.grevesDosAvisos([aviso({ operador: 'Carris' })], agora)) === undefined
  && G.greveDoTroco('carris', amanha0640, G.grevesDosAvisos([aviso({ operador: 'Carris' })], agora))?.operador === 'Carris');
const semFim = G.grevesDosAvisos([aviso({ end_datetime: null, start_datetime: '2026-11-26T00:00:00Z' })], agora);
ok('[regra] greve sem fim indicado: vale no dia em que começa', !!G.greveDoTroco('cp', amanha0640, semFim) && !G.greveDoTroco('cp', Date.parse('2026-11-27T10:00:00Z'), semFim));

if (BASE) {
  // Com uma greve oficial da CP a decorrer, um trajeto de comboio dentro do período tem de trazer o aviso
  const r = await fetch(`${BASE}/api/central-alerts?tipo=greve`).then((x) => x.json()).catch(() => ({}));
  const cp = (r.alerts || []).filter((a) => a.operador === 'CP' && (a.status === 'Ativo' || a.status === 'Futuro'));
  if (!cp.length) {
    console.log('NOTA   sem greve oficial da CP agora: a parte real fica para quando houver');
  } else {
    const a = cp[0];
    const ini = Math.max(Date.parse(a.start_datetime), Date.now() + 3600_000);
    const fim = a.end_datetime ? Date.parse(a.end_datetime) : Date.parse(a.start_datetime) + 20 * 3600_000;
    // às 10h (Lisboa) de um dia dentro da greve
    const d = new Date(Math.min(ini + 24 * 3600_000, fim - 3600_000));
    const dia = d.toISOString().slice(0, 10);
    const quando = `${dia}T10:00`;
    const u = `${BASE}/api/transit/plan-route?originLat=41.14527&originLon=-8.61044&destLat=41.54842&destLon=-8.43423&destName=Braga&quando=${encodeURIComponent(quando)}`;
    const j = await fetch(u).then((x) => x.json()).catch((e) => ({ erro: String(e) }));
    const comCp = (j.routes || []).filter((o) => o.legs.some((l) => l.mode === 'TRANSIT' && /comboios de portugal|^cp/i.test(l.operatorName || '')));
    console.log('NOTA  ', `greve «${a['título']}»; São Bento → Braga ${quando}: ${comCp.length} opções com CP`);
    ok('[real] os troços da CP dentro da greve oficial trazem o aviso', comCp.length > 0 && comCp.every((o) => o.legs.filter((l) => /comboios de portugal|^cp/i.test(l.operatorName || '')).every((l) => l.greve && l.greve.url)),
      JSON.stringify(comCp.map((o) => o.legs.filter((l) => l.mode === 'TRANSIT').map((l) => [l.operatorName, l.departureTime, !!l.greve]))).slice(0, 300));
  }
}

console.log();
console.log(falhas ? `${falhas} falha(s)` : 'Tudo OK');
process.exit(falhas ? 1 : 0);
