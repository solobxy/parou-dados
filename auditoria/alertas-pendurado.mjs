// Testa que as Notícias/Alertas respondem mesmo quando uma fonte externa fica pendurada
// (pedido que nunca termina e ignora o tempo limite). Erro real a 28/10/2026: /api/alertas
// deixou de responder e a página Notícias ficou vazia, porque um pedido em curso nunca acabou.
// Uso: APP=<pasta da app> tsx auditoria/alertas-pendurado.mjs
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
const APP = process.env.APP || '/home/claude/parou';
process.env.PAROU_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'alertas-'));
globalThis.fetch = () => new Promise(() => {}); // fonte pendurada: nunca responde, ignora o abort
let falhas = 0;
const ok = (n, c, e = '') => { if (!c) falhas++; console.log(c ? 'OK     ' : 'FALHOU ', n, e); };
const m = await import(path.join(APP, 'src/server/alertasEngine.ts'));
for (let volta = 1; volta <= 2; volta++) {
  const t0 = Date.now();
  const r = await Promise.race([m.obterAlertas({ area: 'LSB' }), new Promise((res) => setTimeout(() => res('PENDURADO'), 14000))]);
  const s = ((Date.now() - t0) / 1000).toFixed(1);
  ok(`[alertas] volta ${volta}: responde antes dos 14 s do ecrã`, r !== 'PENDURADO', `${s} s`);
  ok(`[alertas] volta ${volta}: resposta tem o local (Lisboa) e listas`, r && r.local && r.local.area === 'LSB' && Array.isArray(r.noticias), r?.local?.distrito || '');
}
console.log(falhas ? `${falhas} FALHOU` : 'tudo OK');
process.exit(falhas ? 1 : 0);
