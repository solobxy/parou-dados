// Partilhar a viagem (26/11/2026): ligação parou.pt/v/<id> com o destino, a hora de chegada, os transportes e a última
// posição. Testa: validação do pedido, chegada ao destino, posição velha escondida, nunca o segredo nem o histórico na
// vista pública, só quem tem o segredo atualiza ou para, e a partilha apaga-se ao parar ou ao acabar o tempo.
// Uso: APP=<pasta da app> tsx auditoria/partilha-viagem.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'parou-partilha-'));
process.env.PAROU_DATA_DIR = dir;
const APP = path.resolve(process.env.APP || '../parou');
const P = await import(path.join(APP, 'src/server/partilhaViagem.ts'));
let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };
const MIN = 60_000;
const agora = Date.now();
const pedido = (o = {}) => ({ destino: { nome: 'Braga', lat: 41.5484, lon: -8.4342 }, chegada: agora + 60 * MIN,
  trocos: [{ modo: 'Comboio', linha: 'CP', cor: '#111111', de: 'Porto São Bento', para: 'Braga', sai: '06:40', chega: '07:53' }], ...o });

// --- 1. Regras
let d = P.partilhaDoPedido(pedido(), agora);
ok('[regra] pedido válido: dura até 30 min depois da chegada prevista', d && d.expira === agora + 90 * MIN && d.estado === 'a-caminho', JSON.stringify(d?.expira));
ok('[regra] nunca mais de 4 h', P.partilhaDoPedido(pedido({ chegada: agora + 3.9 * 3600_000 }), agora)?.expira === agora + 4 * 3600_000);
ok('[regra] destino fora de Portugal ou sem nome: recusado', P.partilhaDoPedido(pedido({ destino: { nome: 'X', lat: 48.8, lon: 2.3 } }), agora) === null && P.partilhaDoPedido(pedido({ destino: { nome: '', lat: 41.5, lon: -8.4 } }), agora) === null);
ok('[regra] chegada daqui a mais de 4 h: recusado', P.partilhaDoPedido(pedido({ chegada: agora + 5 * 3600_000 }), agora) === null);
ok('[regra] Açores e Madeira contam', !!P.partilhaDoPedido(pedido({ destino: { nome: 'Ponta Delgada', lat: 37.74, lon: -25.67 } }), agora) && !!P.partilhaDoPedido(pedido({ destino: { nome: 'Funchal', lat: 32.65, lon: -16.91 } }), agora));
const x = P.partilhaDoPedido(pedido({ trocos: [{ linha: 'A'.repeat(50), de: '<script>', cor: 'red', sai: '99:99x' }] }), agora);
ok('[regra] textos cortados, cor e horas inválidas fora', x.trocos[0].linha.length === 12 && x.trocos[0].cor === undefined && x.trocos[0].sai === '');
const p0 = { id: 'abc', ...d };
let p1 = P.comPosicao(p0, 41.40, -8.50, 20, agora);
ok('[regra] longe do destino: continua a caminho', p1.estado === 'a-caminho' && p1.pos.lat === 41.40);
p1 = P.comPosicao(p1, 41.5490, -8.4345, 15, agora + 50 * MIN);
ok('[regra] a menos de 150 m do destino: chegou (e acaba 15 min depois)', p1.estado === 'chegou' && p1.expira === agora + 65 * MIN);
const v = P.vistaPublica(P.comPosicao(p0, 41.40, -8.50, 20, agora), agora + 11 * MIN);
ok('[regra] posição com mais de 10 min não se mostra (fica só a hora da última)', !v.pos && v.atualizado === agora);
ok('[regra] a vista pública nunca leva o id do segredo nem o histórico', !('segredo' in v) && !('historico' in v));

// --- 2. Pedidos reais (express)
const express = (await import(path.join(APP, 'node_modules/express/index.js'))).default;
const app = express();
app.use(express.json());
P.registarRotasPartilha(app);
const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
const B = `http://127.0.0.1:${srv.address().port}`;
const post = (u, b) => fetch(B + u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
let r = await post('/api/partilha', pedido({ pos: { lat: 41.1455, lon: -8.6108, acc: 12 } }));
const c = await r.json();
ok('[api] criar: ligação parou.pt/v/<12 letras> e segredo', r.ok && /^https:\/\/parou\.pt\/v\/[a-z0-9]{12}$/.test(c.url) && c.segredo.length === 48, c.url);
r = await fetch(`${B}/api/partilha/${c.id}`);
let pub = await r.json();
ok('[api] ver: destino, chegada, transportes e posição', r.ok && pub.destino.nome === 'Braga' && pub.trocos.length === 1 && pub.pos?.lat === 41.1455);
ok('[api] ver: sem segredo e sem indexação', !JSON.stringify(pub).includes(c.segredo) && r.headers.get('x-robots-tag') === 'noindex');
r = await post(`/api/partilha/${c.id}`, { segredo: 'errado'.padEnd(48, '0'), lat: 41.2, lon: -8.6 });
ok('[api] atualizar sem o segredo: recusado', r.status === 403);
r = await post(`/api/partilha/${c.id}`, { segredo: c.segredo, lat: 41.3, lon: -8.55, acc: 30 });
pub = await (await fetch(`${B}/api/partilha/${c.id}`)).json();
ok('[api] atualizar com o segredo: posição nova (só a última)', r.ok && pub.pos.lat === 41.3);
r = await post(`/api/partilha/${c.id}`, { segredo: c.segredo, parar: true });
const depois = await fetch(`${B}/api/partilha/${c.id}`);
ok('[api] parar: apaga logo (quem abre a ligação vê que acabou)', r.ok && depois.status === 404);
ok('[api] id estranho: 404', (await fetch(`${B}/api/partilha/..%2Fx`)).status === 404);
srv.close();

console.log();
console.log(falhas ? `${falhas} falha(s)` : 'Tudo OK');
process.exit(falhas ? 1 : 0);
