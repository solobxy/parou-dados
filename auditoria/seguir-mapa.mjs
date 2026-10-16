// Testa o zoom com que o mapa segue o autocarro «a bordo» (src/utils/seguirMapa.ts): mostrar mais ou menos 2 a 3 paragens à volta do autocarro.
// Uso: APP=caminho-da-app node --import tsx auditoria/seguir-mapa.mjs
const caminho = process.env.APP || '../app';
const M = await import(`${caminho}/src/utils/seguirMapa.ts`).catch(() => ({}));
let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };
const LAT = 41.15, M_LON = 111320 * Math.cos(LAT * Math.PI / 180);
const linha = (n, esp) => Array.from({ length: n }, (_, k) => ({ lat: LAT, lon: -8.6 + (k * esp) / M_LON }));
ok('[zoom] existe zoomParaParagens', typeof M.zoomParaParagens === 'function');
if (typeof M.zoomParaParagens === 'function') {
  const z = (esp, i = 5, larg = 390, n = 12) => M.zoomParaParagens(linha(n, esp), i, larg);
  const mpp = (zoom) => 156543.03 * Math.cos(LAT * Math.PI / 180) / 2 ** zoom;
  const vis = (esp, larg = 390) => (mpp(z(esp)) * larg) / esp;        // paragens (espaçamentos) que cabem na largura
  ok('[zoom] paragens a 350 m: cabem 2,5 a 3,5 espaçamentos na largura', vis(350) > 2.4 && vis(350) < 3.6, `${vis(350).toFixed(2)}`);
  ok('[zoom] paragens a 600 m: idem', vis(600) > 2.4 && vis(600) < 3.6, `${vis(600).toFixed(2)}`);
  ok('[zoom] paragens muito juntas (80 m): não passa de 17', z(80) <= 17 + 1e-9, String(z(80)));
  ok('[zoom] paragens muito afastadas (5 km): não desce de 14', z(5000) >= 14 - 1e-9, String(z(5000)));
  ok('[zoom] mais afastadas, menos zoom', z(800) < z(300));
  ok('[zoom] no início da linha (índice 0) também funciona', Number.isFinite(z(350, 0)));
  ok('[zoom] no fim da linha também funciona', Number.isFinite(z(350, 11)));
  ok('[zoom] com 2 paragens funciona', Number.isFinite(M.zoomParaParagens(linha(2, 400), 0, 390)));
  ok('[zoom] paragens repetidas no mesmo sítio: devolve um valor válido', Number.isFinite(M.zoomParaParagens(linha(5, 0), 2, 390)));
  ok('[zoom] ecrã mais largo, mais zoom (mesmo número de paragens à vista)', M.zoomParaParagens(linha(12, 350), 5, 1000) > z(350));
}
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTodos os testes OK');
process.exit(falhas ? 1 : 0);
