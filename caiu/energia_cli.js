// caiu.pt — ponte entre caiu/energia.py e o cálculo do site (sites/caiu/energia-calc.js).
// Lê do stdin {dados, faturas: [{id, perfil}], casos: [{id, perfil}]} e escreve no stdout
// {faturas: [fatura|null], casos: {id: [linhas]}}. Assim o servidor e o telemóvel fazem exatamente a mesma conta.
'use strict';
const path = require('path');
const C = require(path.join(__dirname, '..', 'sites', 'caiu', 'energia-calc.js'));

let entrada = '';
process.stdin.on('data', (d) => { entrada += d; });
process.stdin.on('end', () => {
  const p = JSON.parse(entrada);
  const D = p.dados;
  const ids = new Map(D.of.map((o) => [o.id, o]));
  const out = { faturas: [], casos: {} };
  for (const f of p.faturas || []) {
    const of = ids.get(f.id);
    out.faturas.push(of ? C.fatura(of, f.perfil, D.param, { campanhas: true }) : null);
  }
  for (const c of p.casos || []) {
    const linhas = C.porComercializador(C.comparar(D, c.perfil, { parcerias: false }));
    out.casos[c.id] = linhas.slice(0, 40).map((l) => ({
      id: l.of.id, com: l.of.com, n: l.of.n, t: l.of.t,
      total: l.fatura.total, semCampanhas: l.semCampanhas.total, campanha: l.fatura.campanha,
      servicos: l.fatura.servicos, tmp: l.of.tmp ? 1 : 0, idx: l.of.idx ? 1 : 0, novos: l.of.novos ? 1 : 0,
      partes: l.partes ? l.partes.map((x) => x.of.id) : undefined,
    }));
  }
  process.stdout.write(JSON.stringify(out));
});
