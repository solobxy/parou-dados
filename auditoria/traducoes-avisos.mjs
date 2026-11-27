// Títulos dos avisos nas outras línguas da app (27/11/2026: em inglês aparecia «Greve dos maquinistas terá impacto…»).
// Traduz uma vez cada título (serviço de fora, trocado aqui por um falso), guarda em disco e junta-o ao aviso.
// Uso: APP=<pasta da app> node --import tsx auditoria/traducoes-avisos.mjs
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
const APP = process.env.APP || '../parou';
const PASTA = fs.mkdtempSync(path.join(os.tmpdir(), 'traducoes-'));
process.env.PAROU_DATA_DIR = PASTA;
let falhas = 0;
const ok = (n, c, e = '') => { if (!c) falhas++; console.log(c ? 'OK     ' : 'FALHOU ', n, e); };
const T = await import(path.join(APP, 'src/server/traducoesAvisos.ts'));
let pedidos = 0;
T.usarTradutor(async (texto, lingua) => { pedidos++; return lingua === 'fr' && /falha/.test(texto) ? null : `[${lingua}] ${texto}`; });
await T.pedirTraducoes(['Greve reduz serviço do Metro esta sexta-feira', '  Greve reduz serviço   do Metro esta sexta-feira ', 'falha no francês'], 0);
const t = T.titulosTraduzidos('Greve reduz serviço do Metro esta sexta-feira');
ok('traduz para inglês, francês e alemão', t && t.en === '[en] Greve reduz serviço do Metro esta sexta-feira' && t.fr && t.de, JSON.stringify(t));
ok('espaços a mais não contam como outro título (6 pedidos, não 9)', pedidos === 6, String(pedidos));
const f = T.titulosTraduzidos('falha no francês');
ok('sem tradução numa língua: as outras ficam', f && f.en && !f.fr, JSON.stringify(f));
const antes = pedidos;
await T.pedirTraducoes(['Greve reduz serviço do Metro esta sexta-feira'], 0);
ok('título já traduzido não volta a ser pedido', pedidos === antes, String(pedidos - antes));
ok('fica guardado em disco', JSON.parse(fs.readFileSync(path.join(PASTA, 'traducoes-avisos.json'), 'utf8'))['Greve reduz serviço do Metro esta sexta-feira']?.de);
// o aviso leva os títulos traduzidos
const C = await import(path.join(APP, 'src/server/centralAlertsEngine.ts'));
const [a] = C.semAvisosRepetidos([{ id: 'x', título: 'Greve reduz serviço do Metro esta sexta-feira' }]);
ok('o aviso na resposta leva «titulos»', a.titulos?.en?.startsWith('[en]'), JSON.stringify(a.titulos));
// ecrã: o Perto e os Alertas usam o título traduzido
const perto = fs.readFileSync(path.join(APP, 'src/components/PertoView.tsx'), 'utf8');
const alertas = fs.readFileSync(path.join(APP, 'src/components/AlertasView.tsx'), 'utf8');
ok('[ecrã] avisos do topo do Perto na língua da app', /tituloDoAviso\(aviso\)/.test(perto) && /a\?\.titulos\?\.\[idioma\]/.test(perto));
ok('[ecrã] Alertas: títulos, resumos das greves e notícias na língua da app', /naLingua\(o\.titulo/.test(alertas) && /naLingua\(o\.resumo/.test(alertas) && /naLingua\(n\.titulo/.test(alertas));
console.log(falhas ? `${falhas} FALHOU` : 'Tudo OK');
process.exit(falhas ? 1 : 0);
