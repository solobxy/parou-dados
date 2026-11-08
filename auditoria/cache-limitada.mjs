// Testa a cache com limite de memória das páginas do servidor (a cache antiga crescia sem fim e deitava a app abaixo):
// limite de bytes e de entradas, sai primeiro a menos usada, prazos, e o corte das caches por paragem (podarMapa).
// Uso: APP=<pasta da app> tsx auditoria/cache-limitada.mjs
import path from 'node:path';
const APP = process.env.APP || '../parou';
let falhas = 0;
const ok = (n, c, e = '') => { if (!c) falhas++; console.log(c ? 'OK     ' : 'FALHOU ', n, e); };
const { CacheLimitada, podarMapa } = await import(path.join(APP, 'src/server/cacheLimitada.ts'));

const t0 = 1_000_000;
const c = new CacheLimitada(4000, 5, 0);
c.set('a', 'x'.repeat(1000), 60_000, t0);
c.set('b', 'é'.repeat(500), 60_000, t0); // 500 letras com acento = 1000 bytes em UTF-8
ok('[bytes] conta os bytes em UTF-8', c.ocupado === 2000, String(c.ocupado));
c.set('c', 'z'.repeat(1000), 30_000, t0);
c.get('a', t0 + 1); // "a" passa a ser a mais recente
c.set('d', 'w'.repeat(1000), 60_000, t0 + 2);
c.set('e', 'v'.repeat(1000), 60_000, t0 + 2);
ok('[bytes] passa do limite: sai a menos usada (b), fica a usada (a)', c.get('b', t0 + 3) === undefined && c.get('a', t0 + 3)?.length === 1000);
ok('[bytes] nunca passa do limite', c.ocupado <= 4000, String(c.ocupado));
ok('[prazo] depois do prazo não devolve', c.get('c', t0 + 30_001) === undefined);
ok('[prazo] e liberta os bytes', c.ocupado === 3000, String(c.ocupado));
const e = new CacheLimitada(1e9, 5, 0);
for (let i = 0; i < 20; i++) e.set('k' + i, 'v' + i, 60_000, t0);
ok('[entradas] nunca passa do máximo de entradas', e.tamanho === 5, String(e.tamanho));
ok('[entradas] ficam as últimas', e.get('k19', t0) === 'v19' && e.get('k0', t0) === undefined);
const acentos = new CacheLimitada(1e6, 10, 0);
acentos.set('p', 'Marquês → Sé · Avenida', 1000, t0);
ok('[texto] guarda acentos e símbolos sem os estragar', acentos.get('p', t0) === 'Marquês → Sé · Avenida');
ok('[texto] getBuffer dá os mesmos bytes', acentos.getBuffer('p', t0)?.toString('utf8') === 'Marquês → Sé · Avenida');
const grande = new CacheLimitada(1000, 10, 0);
grande.set('g', 'x'.repeat(600), 1000, t0);
ok('[gigante] uma página maior que 1/4 do limite não entra', grande.tamanho === 0);
const x = new CacheLimitada(1e6, 100, 0);
x.set('a', '1', 10, t0); x.set('b', '2', 1e6, t0);
x.limparExpiradas(t0 + 20);
ok('[limpeza] limparExpiradas apaga só as que passaram do prazo', x.tamanho === 1 && x.get('b', t0 + 20) === '2');

const m = new Map();
for (let i = 0; i < 50; i++) m.set('s' + i, i);
podarMapa(m, 10);
ok('[podarMapa] fica com o máximo', m.size === 10);
ok('[podarMapa] saem as mais antigas', !m.has('s0') && m.has('s49') && m.has('s40'));
podarMapa(m, 100);
ok('[podarMapa] abaixo do máximo não mexe', m.size === 10);

console.log(falhas ? `${falhas} testes falharam` : 'Todos os testes passaram');
process.exit(falhas ? 1 : 0);
