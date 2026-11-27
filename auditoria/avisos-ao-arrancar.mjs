// Ao reiniciar (cada publicação), as greves voltam logo da cópia em disco (27/11/2026: durante ~2 min depois de publicar,
// o Metro do Porto em greve aparecia como num dia normal, até a fonte voltar a ser lida).
// Uso: APP=<pasta da app> node --import tsx auditoria/avisos-ao-arrancar.mjs
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
const APP = process.env.APP || '../parou';
const PASTA = fs.mkdtempSync(path.join(os.tmpdir(), 'avisos-arrancar-'));
process.env.PAROU_DATA_DIR = PASTA;
globalThis.fetch = async () => new Response('sem rede no teste', { status: 503 });
let falhas = 0;
const ok = (n, c, e = '') => { if (!c) falhas++; console.log(c ? 'OK     ' : 'FALHOU ', n, e); };
const agora = Date.now();
const hojeIni = new Date(agora - 3600_000).toISOString(), hojeFim = new Date(agora + 10 * 3600_000).toISOString();
const greve = { id: 'mp-greve-teste', tipo: 'greve', status: 'Ativo', operador: 'Metro do Porto', título: 'Greve reduz serviço do Metro', source: 'Metro do Porto — avisos', source_url: 'u', start_datetime: hojeIni, end_datetime: hojeFim, content_hash: 'x', servico_na_greve: { linhas: [], trocos: [['senhora da hora', 'estadio do dragao']], horas: [0, 1440] } };
fs.writeFileSync(path.join(PASTA, 'avisos-em-memoria.json'), JSON.stringify({ em: agora - 60_000, avisos: [greve] }));
const P = await import(path.join(APP, 'src/server/grevesPlaneador.ts'));
const g = P.grevesAgora();
ok('ao arrancar, a greve da cópia está logo em memória', g.some((x) => x.operador === 'Metro do Porto' && x.servico?.trocos?.length === 1), JSON.stringify(g.map((x) => x.titulo)));
// cópia velha (mais de 6 h) não se usa
const C = await import(path.join(APP, 'src/server/centralAlertsEngine.ts'));
fs.writeFileSync(path.join(PASTA, 'avisos-em-memoria.json'), JSON.stringify({ em: agora - 7 * 3600_000, avisos: [{ ...greve, id: 'velho' }] }));
ok('cópia com mais de 6 h: não se repõe', C.reporCopiaDosAvisos() === 0);
console.log(falhas ? `${falhas} FALHOU` : 'Tudo OK');
process.exit(falhas ? 1 : 0);
