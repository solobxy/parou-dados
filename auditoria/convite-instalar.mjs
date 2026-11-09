// Convite para instalar a PAROU (regras) e contagem de quem abre a app instalada (servidor).
// Uso: APP=caminho-da-app tsx auditoria/convite-instalar.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'parou-convite-'));
process.env.PAROU_DATA_DIR = dir; // antes de importar a app
const APP = process.env.APP || '../app';
const C = await import(`${APP}/src/utils/conviteInstalar.ts`);
const E = await import(`${APP}/src/server/estatisticas.ts`);

let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };
const DIA = 864e5, AGORA = Date.parse('2026-11-10T09:00:00Z');
const base = { instalada: false, telemovel: true, robo: false, avisoAntigoFechado: false, jaMostradoNestaSessao: false, memoria: { fechadoEm: null, vezes: 0 }, agora: AGORA };

// --- Regras do convite
ok('telemóvel, sem app, 1.ª vez: convida', C.deveConvidar(base));
ok('com a app instalada: não convida', !C.deveConvidar({ ...base, instalada: true }));
ok('no computador: não convida (instala-se pelo menu)', !C.deveConvidar({ ...base, telemovel: false }));
ok('navegador automático: não convida', !C.deveConvidar({ ...base, robo: true }));
ok('já fechou o aviso antigo: não convida', !C.deveConvidar({ ...base, avisoAntigoFechado: true }));
ok('já apareceu nesta sessão: não convida outra vez', !C.deveConvidar({ ...base, jaMostradoNestaSessao: true }));
ok('fechou há 3 dias (1.ª vez): sossego', !C.deveConvidar({ ...base, memoria: { fechadoEm: AGORA - 3 * DIA, vezes: 1 } }));
ok('fechou há 15 dias (1.ª vez): pode voltar', C.deveConvidar({ ...base, memoria: { fechadoEm: AGORA - 15 * DIA, vezes: 1 } }));
ok('fechou 2 vezes, a última há 30 dias: ainda sossego (45 dias)', !C.deveConvidar({ ...base, memoria: { fechadoEm: AGORA - 30 * DIA, vezes: 2 } }));
ok('fechou 2 vezes, a última há 50 dias: pode voltar', C.deveConvidar({ ...base, memoria: { fechadoEm: AGORA - 50 * DIA, vezes: 2 } }));
ok('fechou 3 vezes: nunca mais', !C.deveConvidar({ ...base, memoria: { fechadoEm: AGORA - 400 * DIA, vezes: 3 } }));
ok('memória estragada no telemóvel: conta como nova', JSON.stringify(C.lerMemoria('{isto não é json')) === JSON.stringify({ fechadoEm: null, vezes: 0 }));
ok('fechar soma uma vez e guarda a hora', JSON.stringify(C.memoriaDepoisDeFechar({ fechadoEm: null, vezes: 1 }, AGORA)) === JSON.stringify({ fechadoEm: AGORA, vezes: 2 }));
ok('browser dentro do Instagram/Facebook: dentro de outra app', C.dentroDeOutraApp('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0') && C.dentroDeOutraApp('Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120 Mobile Safari/537.36 [FBAN/EMA;FBAV/400]'));
ok('Chrome e Safari normais: não', !C.dentroDeOutraApp('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36') && !C.dentroDeOutraApp('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'));

// --- Servidor: quem abre a app instalada fica marcado, mesmo que depois volte pelo site
const T0 = Date.parse('2026-10-20T10:00:00Z');
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
// A: chega pelo site, instala no dia seguinte, depois volta pelo site
E.registarVisita(id(1), 'site', 'pt', T0);
E.registarVisita(id(1), 'instalada', 'pt', T0 + DIA);
E.registarVisita(id(1), 'site', 'pt', T0 + 3 * DIA);
// B: só site, volta 2 dias depois
E.registarVisita(id(2), 'site', 'pt', T0);
E.registarVisita(id(2), 'site', 'pt', T0 + 2 * DIA);
// C: só site, nunca volta
E.registarVisita(id(3), 'site', 'pt', T0);
const r = E.resumoEstatisticas(T0 + 10 * DIA);
const f = r.fidelidade;
ok('quem abriu a app instalada conta como "com a app" mesmo depois de voltar pelo site', f.naPrimeiraSemanaComAppInstalada?.amostra === 1 && f.naPrimeiraSemanaComAppInstalada?.voltaram === 1, JSON.stringify(f.naPrimeiraSemanaComAppInstalada));
ok('só pelo site: 2 pessoas, 1 voltou', f.naPrimeiraSemanaSoSite?.amostra === 2 && f.naPrimeiraSemanaSoSite?.voltaram === 1, JSON.stringify(f.naPrimeiraSemanaSoSite));
ok('aberturas da app instalada nos últimos 30 dias: 1', r.instalacoes?.ultimos30Dias === 1, JSON.stringify(r.instalacoes));
ok('o total da 1.ª semana continua igual (3 pessoas, 2 voltaram)', f.naPrimeiraSemana.amostra === 3 && f.naPrimeiraSemana.voltaram === 2, JSON.stringify(f.naPrimeiraSemana));

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo OK');
try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* sem importância */ }
process.exit(falhas ? 1 : 0);
