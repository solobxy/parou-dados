// O painel de baixo do Perto tem um só tamanho (pedido do Dinis, 27/11/2026: «há pessoas menos tecnológicas que não vão
// saber estender/diminuir o tamanho dessa aba»): sem pega, sem arrastar com o dedo e sem o botão de aumentar o mapa.
// Uso: APP=<pasta da app> node auditoria/painel-fixo.mjs
import fs from 'node:fs';
import path from 'node:path';
const APP = process.env.APP || '../parou';
let falhas = 0;
const ok = (n, c, e = '') => { if (!c) falhas++; console.log(c ? 'OK     ' : 'FALHOU ', n, e); };
const s = fs.readFileSync(path.join(APP, 'src/components/PertoView.tsx'), 'utf8');
ok('sem forma de mudar o tamanho do painel (setMapaExpandido)', !/setMapaExpandido/.test(s));
ok('sem arrastar o painel com o dedo', !/gestoPainel|onTouchMove/.test(s));
ok('sem a pega (barrinha cinzenta)', !/w-10 h-1\.5 rounded-full bg-\[#D4D4D0\]/.test(s));
ok('sem o botão «Aumentar o mapa» nem «Encolher a lista»', !/Aumentar o mapa|Encolher a lista|encolher-percurso/.test(s));
console.log(falhas ? `${falhas} FALHOU` : 'Tudo OK');
process.exit(falhas ? 1 : 0);
