// Estado das linhas da Metro do Porto (página inicial do site): "Ok" ou o texto da perturbação, por linha.
// Lê-se como fonte oficial de avisos (antes não havia nenhuma fonte da Metro do Porto). Testa-se o leitor com duas páginas:
// tudo normal e duas linhas perturbadas (estrutura copiada da página real de 26/11/2026).
// Uso: APP=caminho-da-app tsx auditoria/metro-porto-estado.mjs
import fs from 'node:fs';
const caminho = process.env.APP || '../app';
let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };
const C = await import(`${caminho}/src/server/centralAlertsEngine.ts`);
const dir = new URL('./fixtures/metro-porto/', import.meta.url);
const normal = C.estadoLinhasMetroPorto(fs.readFileSync(new URL('estado-ok.html', dir), 'utf8'));
ok('lê as 6 linhas da lista "Estado das Linhas"', normal.length === 6, JSON.stringify(normal.map((l) => l.letra)));
ok('letras A–F pelas imagens (lina_a, linha_b…)', normal.map((l) => l.letra).join('') === 'ABCDEF');
ok('todas "Ok"', normal.every((l) => /^ok$/i.test(l.estado)), JSON.stringify(normal.map((l) => l.estado)));
ok('não lê a lista que vem depois', !normal.some((l) => /Outra lista/.test(l.nome)));
const mal = C.estadoLinhasMetroPorto(fs.readFileSync(new URL('estado-perturbado.html', dir), 'utf8'));
const e = mal.find((l) => l.letra === 'E');
ok('linha E: texto da perturbação, com acentos', e && e.estado === 'Circulação interrompida entre Verdes e Aeroporto devido a avaria.', e && e.estado);
ok('linha A: greve', /Greve/.test(mal.find((l) => l.letra === 'A')?.estado || ''));
ok('página sem a lista: nada (não dá falsos "normais")', C.estadoLinhasMetroPorto('<html>outra coisa</html>').length === 0);
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo OK');
process.exit(falhas ? 1 : 0);
