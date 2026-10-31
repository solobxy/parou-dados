// Testa as "mais procuradas": cada pessoa conta uma vez por dia por linha/paragem, só entram as que pelo
// menos 3 pessoas abriram, a ordem é por pessoas, e no disco não fica quem abriu.
// Uso: APP=<pasta da app> tsx auditoria/mais-procuradas.mjs
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
const APP = process.env.APP || '../parou';
process.env.PAROU_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'procuras-'));
let falhas = 0;
const ok = (n, c, e = '') => { if (!c) falhas++; console.log(c ? 'OK     ' : 'FALHOU ', n, e); };
const m = await import(path.join(APP, 'src/server/estatisticas.ts'));
const { base } = await import(path.join(APP, 'src/server/comunidade/baseDados.ts'));
const hoje = Date.parse('2026-10-29T12:00:00Z');
const ontem = hoje - 86400_000;

// Linha A: 5 pessoas (uma delas abre 4 vezes). Linha B: 3 pessoas. Linha C: 2 pessoas (abaixo do mínimo).
for (const p of ['p1', 'p2', 'p3', 'p4', 'p5']) m.registarProcura('linha', 'carris:728', 'Carris 728', p, hoje);
const repetidas = [1, 2, 3].map(() => m.registarProcura('linha', 'carris:728', 'Carris 728', 'p1', hoje));
ok('[contar] a mesma pessoa no mesmo dia conta uma vez', repetidas.every((x) => x === false));
for (const p of ['p1', 'p2', 'p3']) m.registarProcura('linha', 'stcp:205', 'STCP 205', p, hoje);
for (const p of ['p1', 'p2']) m.registarProcura('linha', 'cp:sintra', 'CP Sintra', p, hoje);
// Outro dia: a mesma pessoa volta a contar
ok('[contar] noutro dia a mesma pessoa volta a contar', m.registarProcura('linha', 'cp:sintra', 'CP Sintra', 'p1', ontem) === true);
ok('[validar] tipo inválido não conta', m.registarProcura('autocarro', 'x', '', 'p9', hoje) === false);
ok('[validar] id com espaços/HTML não conta', m.registarProcura('linha', '<script>', '', 'p9', hoje) === false && m.registarProcura('linha', 'a b', '', 'p9', hoje) === false);
m.registarProcura('paragem', 'stop-cm:010101', 'Cais do Sodré', 'p1', hoje);

const lista = m.maisProcuradas('linha', { agora: hoje });
ok('[ordem] mais pessoas primeiro', lista[0]?.id === 'carris:728' && lista[0]?.pessoas === 5, JSON.stringify(lista));
ok('[ordem] B entra com 3', lista.some((x) => x.id === 'stcp:205' && x.pessoas === 3));
ok('[mínimo] soma dos dias conta (C: 2 hoje + 1 ontem = 3)', lista.some((x) => x.id === 'cp:sintra' && x.pessoas === 3));
ok('[mínimo] só entram com 3 ou mais', lista.every((x) => x.pessoas >= 3));
ok('[nome] guarda o nome para a administração', lista[0]?.nome === 'Carris 728');
ok('[paragens] separadas das linhas', m.maisProcuradas('paragem', { agora: hoje, minimo: 1 })[0]?.nome === 'Cais do Sodré');
const pop = m.linhasPopulares([], 8, hoje);
ok('[populares] sem cidades devolve as linhas por ordem', Array.isArray(pop) && pop[0] === 'carris:728' && pop.length === 3, JSON.stringify(pop));
ok('[30 dias] fora da janela não conta', m.maisProcuradas('linha', { agora: hoje + 40 * 86400_000 }).length === 0);

// Privacidade: a tabela só tem dia, tipo, alvo, nome e contagem
const cols = base().prepare('PRAGMA table_info(procuras_dia)').all().map((c) => c.name).sort().join(',');
ok('[privacidade] no disco não fica quem abriu', cols === 'alvo,dia,n,nome,tipo', cols);
const resumo = m.resumoEstatisticas(hoje);
ok('[admin] resumo traz linhas e paragens', resumo.maisProcuradas30Dias?.linhas?.length >= 3 && resumo.maisProcuradas30Dias?.paragens?.length === 1);
console.log(falhas ? `${falhas} FALHOU` : 'tudo OK');
process.exit(falhas ? 1 : 0);
