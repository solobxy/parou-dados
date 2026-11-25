// Arquivo permanente (historico.ts): avisos dos operadores e greves com todas as versões, e notícias, sem nunca perder nada.
// Uso: APP=caminho-da-app tsx auditoria/historico-arquivo.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.PAROU_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'parou-historico-'));
const caminho = process.env.APP || '../app';
let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };

const H = await import(`${caminho}/src/server/historico.ts`);
const greve = {
  id: 'cp:123', tipo: 'Greve', título: 'Greve na CP a 2 de dezembro', descrição: 'Supressões previstas', operador: 'CP',
  linhas: ['Linha de Sintra'], paragens: [], região: 'Lisboa', municípios: ['Sintra'], start_datetime: '2026-12-02T00:00:00Z',
  end_datetime: '2026-12-02T23:59:00Z', published_datetime: '2026-11-25T10:00:00Z', source: 'cp', source_url: 'https://www.cp.pt/x', status: 'Futuro',
};
const t0 = 1_800_000_000_000;
let r = H.arquivarAvisos([greve], t0);
ok('[avisos] um aviso novo fica guardado', r.novos === 1 && r.mudaram === 0, JSON.stringify(r));
r = H.arquivarAvisos([greve], t0 + 60_000);
ok('[avisos] o mesmo aviso outra vez não cria versão nova', r.novos === 0 && r.mudaram === 0, JSON.stringify(r));
r = H.arquivarAvisos([{ ...greve, descrição: 'Supressões previstas; serviços mínimos decretados' }], t0 + 120_000);
ok('[avisos] o texto mudou: versão nova', r.mudaram === 1, JSON.stringify(r));
r = H.arquivarAvisos([{ ...greve, descrição: 'Supressões previstas; serviços mínimos decretados', status: 'Ativo' }], t0 + 180_000);
ok('[avisos] o estado mudou (Futuro → Ativo): versão nova', r.mudaram === 1, JSON.stringify(r));
const b = H.baseHistorico();
const a = b.prepare('SELECT * FROM avisos WHERE id = ?').get('cp:123');
ok('[avisos] fica o estado atual, a 1.ª e a última vez visto e o n.º de versões', a.estado === 'Ativo' && a.primeiro_visto === t0 && a.ultimo_visto === t0 + 180_000 && a.versoes === 3, JSON.stringify({ estado: a.estado, versoes: a.versoes }));
ok('[avisos] linhas e municípios guardados', JSON.parse(a.linhas)[0] === 'Linha de Sintra' && JSON.parse(a.municipios)[0] === 'Sintra');
const v = b.prepare('SELECT * FROM avisos_versoes WHERE id = ? ORDER BY visto').all('cp:123');
ok('[versões] as 3 versões ficam, cada uma com o aviso inteiro', v.length === 3 && JSON.parse(v[0].dados).descrição === 'Supressões previstas' && v[2].estado === 'Ativo', String(v.length));
r = H.arquivarAvisos([{ ...greve, id: 'tml:9', operador: 'Carris Metropolitana', tipo: 'Perturbação' }, greve], t0 + 240_000);
ok('[avisos] vários avisos de uma vez', r.novos === 1, JSON.stringify(r));
ok('[avisos] lista vazia (fonte em baixo) não apaga nada', H.arquivarAvisos([], t0 + 300_000).novos === 0 && b.prepare('SELECT COUNT(*) AS n FROM avisos').get().n === 2);

const n1 = { id: 'RTP:https://x/1', fonte: 'RTP Notícias', categoria: 'greve', titulo: 'Greve no Metro', resumo: 'Amanhã', url: 'https://x/1', data: '2026-11-25T10:00:00Z' };
H.arquivarNoticias([n1], t0);
H.arquivarNoticias([n1, { ...n1, id: 'RTP:https://x/2', url: 'https://x/2' }], t0 + 60_000);
const ns = b.prepare('SELECT * FROM noticias ORDER BY id').all();
ok('[notícias] cada notícia fica uma vez, com a 1.ª e a última vez vista', ns.length === 2 && ns[0].primeiro_visto === t0 && ns[0].ultimo_visto === t0 + 60_000, JSON.stringify(ns.map((x) => x.id)));

// A app chama o arquivo onde os avisos e as notícias chegam, e copia as bases de 6 em 6 h
const fonte = (f) => fs.readFileSync(`${caminho}/src/server/${f}`, 'utf8');
ok('[ligação] a sincronização dos avisos arquiva', /arquivarAvisos\(/.test(fonte('centralAlertsEngine.ts')));
ok('[ligação] a leitura das notícias arquiva', /arquivarNoticias\(/.test(fonte('alertasEngine.ts')));
ok('[cópias] o histórico e os atrasos entram nas cópias de segurança', /historico\.db/.test(fonte('comunidade/baseDados.ts')) && /atrasos\.db/.test(fonte('comunidade/baseDados.ts')));

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo OK');
process.exit(falhas ? 1 : 0);
