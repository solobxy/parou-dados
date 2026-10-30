// Testa os títulos e as descrições das páginas de linhas (src/server/seo/titulos.ts):
// começam pelo número e pelo percurso, não passam do tamanho que o Google mostra e a descrição traz
// a primeira e a última partida e o intervalo. Exemplos reais das pesquisas do Search Console (out/2026).
// Uso: APP=<pasta da app> tsx auditoria/titulos-linhas.mjs
import path from 'node:path';
const APP = process.env.APP || '/home/claude/parou';
let falhas = 0;
const ok = (n, c, e = '') => { if (!c) falhas++; console.log(c ? 'OK     ' : 'FALHOU ', n, e); };
const t = await import(path.join(APP, 'src/server/seo/titulos.ts'));
const h = (x) => { const [a, b] = x.split(':').map(Number); return a * 3600 + b * 60; };
const meiaHora = Array.from({ length: 37 }, (_, i) => h('06:35') + i * 1800); // 06:35 … 00:35

const casos = [
  { codigo: '4562', percurso: 'Setúbal (ITS) – Vila Nogueira de Azeitão (Escola) via Palmela (Estação)', operador: 'Carris Metropolitana', modo: 'Autocarro', nParagens: 62, tempoReal: true, uteis: meiaHora, sabado: meiaHora.slice(0, 20), domingo: [] },
  { codigo: '2795', percurso: 'Lisboa (Campo Grande) – Santa Iria da Azóia', operador: 'Carris Metropolitana', modo: 'Autocarro', nParagens: 40, tempoReal: true, uteis: meiaHora },
  { codigo: 'Linha de Sintra', percurso: 'Lisboa-Rossio – Mira Sintra-Meleças', operador: 'CP – Comboios de Portugal', modo: 'Comboio', nParagens: 14, tempoReal: false, uteis: Array.from({ length: 60 }, (_, i) => h('05:40') + i * 1200) },
  { codigo: '305', percurso: 'Cordoaria – Hospital de S. João', operador: 'STCP', modo: 'Autocarro', nParagens: 30, tempoReal: true, uteis: [] },
  { codigo: 'A', percurso: 'Estádio do Dragão – Senhor de Matosinhos', operador: 'Metro do Porto', modo: 'Metro', nParagens: 23, tempoReal: false, uteis: Array.from({ length: 100 }, (_, i) => h('06:00') + i * 600) },
  { codigo: '7007', percurso: 'Penafiel (Esc. Secundária) – Polo Universitário (pela A4) Valongo', operador: 'UNIR', modo: 'Autocarro', nParagens: 50, tempoReal: false },
];
for (const d of casos) {
  const tit = t.tituloLinha(d), desc = t.descricaoLinha(d);
  console.log('       ', JSON.stringify(tit), `(${tit.length})`);
  console.log('       ', JSON.stringify(desc), `(${desc.length})`);
  ok(`[${d.codigo}] título começa pelo número/nome da linha`, tit.startsWith(t.inicioTitulo(d.codigo)), tit);
  ok(`[${d.codigo}] título até 72 caracteres`, tit.length <= 72, String(tit.length));
  ok(`[${d.codigo}] título tem o operador (nome curto)`, tit.includes(t.operadorCurto(d.operador)), tit);
  ok(`[${d.codigo}] título diz "horário"`, /horário/.test(tit));
  ok(`[${d.codigo}] título tem o início do percurso`, tit.includes(t.semParenteses(d.percurso).split(' – ')[0].slice(0, 6)), tit);
  ok(`[${d.codigo}] descrição até 200 caracteres`, desc.length <= 200, String(desc.length));
  ok(`[${d.codigo}] descrição tem o operador`, desc.includes(d.operador));
  if (d.uteis && d.uteis.length) {
    ok(`[${d.codigo}] descrição começa pelas horas dos dias úteis`, desc.startsWith('Dias úteis: 1.º '), desc.slice(0, 40));
    ok(`[${d.codigo}] primeira partida certa`, desc.includes(t.hhmm(Math.min(...d.uteis))));
    ok(`[${d.codigo}] última partida certa (depois da meia-noite em 00:MM)`, desc.includes(t.hhmm(Math.max(...d.uteis))));
  } else {
    ok(`[${d.codigo}] sem horário: não inventa horas`, !/\d\d:\d\d/.test(desc), desc);
  }
}
ok('[4562] intervalo de 30 min na hora de ponta', t.descricaoLinha(casos[0]).includes('de 30 em 30 min'));
{ const d = { ...casos[3], uteis: meiaHora, sabado: meiaHora.slice(0, 10), domingo: [] }; const x = t.descricaoLinha(d);
  ok('[305] com sábados e sem domingos: diz sábados e não domingos', /sábados/.test(x) && !/domingos/.test(x), x); }
ok('[7007] sem parênteses dentro de parênteses', !/\([^)]*\(/.test(t.descricaoLinha(casos[5])), t.descricaoLinha(casos[5]));
ok('[4562] última partida 00:35 (depois da meia-noite)', t.descricaoLinha(casos[0]).includes('último às 00:35'));
ok('[Metro A] metro: "1.º metro"', t.descricaoLinha(casos[4]).includes('1.º metro'));
ok('[Sintra] comboio: "1.º comboio"', t.descricaoLinha(casos[2]).includes('1.º comboio'));
ok('[intervalo] com poucas partidas de manhã: null', t.intervaloPonta([h('07:00'), h('09:00')]) === null);
ok('[semVia] tira o "via"', t.semVia('Setúbal (ITS) – Azeitão via Palmela') === 'Setúbal (ITS) – Azeitão');
ok('[Metro A] título "Linha A …"', t.tituloLinha(casos[4]).startsWith('Linha A '), t.tituloLinha(casos[4]));
ok('[Sintra] "Lisboa-Rossio" não é partido em dois', t.tituloLinha(casos[2]).includes('Lisboa-Rossio'), t.tituloLinha(casos[2]));
ok('[Sintra] operador curto "CP"', t.operadorCurto('CP – Comboios de Portugal') === 'CP');
ok('[M44] código com letra e número fica como está', t.inicioTitulo('M44') === 'M44');
ok('[semVia] tira "(pela A4)" no fim', t.semVia('Penafiel – Valongo (pela A4)') === 'Penafiel – Valongo');
console.log(falhas ? `${falhas} FALHOU` : 'tudo OK');
process.exit(falhas ? 1 : 0);
