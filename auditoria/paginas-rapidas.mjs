// Testa que as páginas públicas das paragens respondem depressa e não bloqueiam o servidor.
// Erro real a 30/10/2026: com o SQLite 3.51 (o do servidor) a consulta das partidas passou de ~1 ms para ~200 ms
// (plano "ANY(stop_id)"); cada página de paragem levava 0,3 a 3,5 s de CPU e, com o Google a visitar várias ao
// mesmo tempo, o /health deixava de responder e a vigia reiniciava a app em ciclo (503 nas páginas).
// Uso: BASE=http://127.0.0.1:3000 APP=<pasta da app> node auditoria/paginas-rapidas.mjs
import fs from 'node:fs';
import path from 'node:path';
const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const APP = process.env.APP || '/home/claude/parou';
let falhas = 0;
const ok = (n, c, e = '') => { if (!c) falhas++; console.log(c ? 'OK     ' : 'FALHOU ', n, e); };

const fonte = fs.readFileSync(path.join(APP, 'src/server/linesEngine.ts'), 'utf8');
ok('[sql] sem "stop_id = ? OR stop_id IN (...)" (plano lento no SQLite 3.51)', !/stop_id = \? OR st\.stop_id IN/.test(fonte));

const xml = await (await fetch(`${BASE}/sitemap-paragens-1.xml`)).text();
const todas = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/^https?:\/\/[^/]+/, '')).filter((u) => !/carris-metropolitana|\/unir\//.test(u));
ok('[preparar] há paragens no sitemap', todas.length > 100, String(todas.length));
// amostra fixa e variada (de vários operadores)
const porOp = new Map();
for (const u of todas) { const op = u.split('/')[2]; if (!porOp.has(op)) porOp.set(op, []); porOp.get(op).push(u); }
const amostra = [];
for (const lista of porOp.values()) for (let i = 0; i < 3 && i < lista.length; i++) amostra.push(lista[Math.floor((i + 1) * lista.length / 4)]);
const tempo = async (u) => { const a = performance.now(); const r = await fetch(BASE + u); await r.text(); return { ms: performance.now() - a, estado: r.status }; };
await tempo(amostra[0]); // aquecer
const ts = [];
for (const u of amostra) { const r = await tempo(u); ts.push(r.ms); if (r.estado !== 200) console.log('NOTA   ', r.estado, u); }
ts.sort((a, b) => a - b);
const med = ts[ts.length >> 1], p90 = ts[Math.floor(ts.length * 0.9)];
ok(`[tempo] mediana das páginas de paragem < 300 ms (${amostra.length} páginas, ${porOp.size} operadores)`, med < 300, `${med.toFixed(0)} ms, p90 ${p90.toFixed(0)} ms`);
ok('[tempo] p90 < 800 ms', p90 < 800, `${p90.toFixed(0)} ms`);

// Carga como um robô de pesquisa: 12 páginas ao mesmo tempo; o /health tem de continuar a responder
const lote = todas.filter((_, i) => i % Math.floor(todas.length / 12) === 7).slice(0, 12);
const pedidos = Promise.all(lote.map((u) => tempo(u)));
await new Promise((r) => setTimeout(r, 50));
const h = await tempo('/health');
const rs = await pedidos;
ok('[carga] /health responde em < 1 s com 12 páginas em simultâneo', h.ms < 1000, `${h.ms.toFixed(0)} ms`);
ok('[carga] as 12 páginas respondem 200', rs.every((r) => r.estado === 200), rs.map((r) => r.estado).join(','));
ok('[carga] a mais lenta < 3 s', Math.max(...rs.map((r) => r.ms)) < 3000, `${Math.max(...rs.map((r) => r.ms)).toFixed(0)} ms`);
console.log(falhas ? `${falhas} FALHOU` : 'tudo OK');
process.exit(falhas ? 1 : 0);
