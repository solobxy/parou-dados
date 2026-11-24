// Servidor de jogo do Kurogane: jogadores ligados uns aos outros, PvP decidido aqui, personagens a dormir
// quando saem (dá para as matar e levar o que tinham), mochilas no chão partilhadas e clãs.
// Só módulos do Node (sem dependências). WebSocket feito à mão (RFC 6455, mensagens de texto pequenas).
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ITEMS, LOOT, RECIPES, ammoOf } from './jogo/src/items.js';
import { Grid, mkItem, rollLoot } from './jogo/src/bag.js';

const PORT = +process.env.PORT || 3190, DIR = process.env.STATE_DIRECTORY || path.join(process.cwd(), 'dados');
const FILE = path.join(DIR, 'estado.json'), SLEEP_MS = 72 * 3600e3, BAG_MS = 45 * 60e3, MAXP = 60;
// munições: velocidade (m/s), dano, perfuração, arrasto, bagos
const AM = { a9: [360, 30, 1.5, 0.0018], a9s: [300, 27, 1.3, 0.002], a556: [940, 34, 2.8, 0.0012], a762: [715, 40, 2.6, 0.0011], a308: [850, 95, 3.4, 0.0007], a357: [440, 48, 2, 0.0016], c12: [400, 16, 1, 0.004, 8], c12s: [490, 85, 2.2, 0.0022] };
const NAME = /^[A-Za-z0-9_À-ÖØ-öø-ÿ-]{3,16}$/;

// ---------- estado (gravado em disco)
const W0 = () => ({ wv: null, cyc0: Date.now() - 900e3, wx: { r: 0, next: Date.now() + 300e3 }, doors: {}, nodes: {}, ct: {}, zs: [], base: { p: {}, d: {} }, locks: {}, cars: {} });
let S = { sleepers: {}, bags: {}, clans: {}, tokens: {}, w: W0(), led: {} };
try { S = { ...S, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch (e) { }
S.w = { ...W0(), ...(S.w || {}) }; for (const z of S.w.zs) z.o = 0; for (const c of Object.values(S.w.cars)) { c.s = [0, 0, 0, 0]; c.v = 0; }
if (!S.lkMig) { S.lkMig = Date.now(); for (const P of Object.values(S.w.base.p || {})) if (P.t === 'porta' && !P.cl) P.cl = { h: null, a: [] }; for (const d of Object.values(S.w.base.d || {})) if ((d.k === 'bau' || d.k === 'bauG') && !d.cl) d.cl = { h: null, a: [] }; }
// mochilas antigas (só de mortes): passam ao formato novo
for (const b of Object.values(S.bags)) if (b.items && !b.it) { b.it = b.items; delete b.items; b.body = 1; b.y = b.y ?? 0; }
// contas (anti-batota): quem já jogava antes fica com o que tinha na primeira vez que se liga
S.led = S.led || {}; if (!S.ledSince) { S.ledSince = Date.now(); for (const t of Object.values(S.tokens)) t.g = 1; }
let dirty = false; const save = () => { if (!dirty) return; dirty = false; try { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(FILE + '.tmp', JSON.stringify(S)); fs.renameSync(FILE + '.tmp', FILE); } catch (e) { console.error('gravar', e.message); } };
setInterval(save, 15000);
const rid = n => crypto.randomBytes(n).toString('base64url');

// ---------- WebSocket mínimo
const players = new Map(); let nextId = 1;
const send = (c, o) => { if (c.dead) return; const b = Buffer.from(JSON.stringify(o)); let h; if (b.length < 126) h = Buffer.from([0x81, b.length]); else if (b.length < 65536) { h = Buffer.alloc(4); h[0] = 0x81; h[1] = 126; h.writeUInt16BE(b.length, 2); } else { h = Buffer.alloc(10); h[0] = 0x81; h[1] = 127; h.writeBigUInt64BE(BigInt(b.length), 2); } try { c.sock.write(Buffer.concat([h, b])); } catch (e) { } };
const bcast = (o, pred = () => true) => { for (const c of players.values()) if (c.p && pred(c)) send(c, o); };
const srv = http.createServer((req, res) => {
  if (req.url === '/saude') { res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'no-store' }); res.end(JSON.stringify({ ok: true, jogadores: [...players.values()].filter(c => c.p).length, a_dormir: Object.keys(S.sleepers).length, mochilas: Object.keys(S.bags).length, clas: Object.keys(S.clans).length, zombies: S.w.zs.filter(z => z.st !== 3).length, caixas: Object.keys(S.w.ct).length, carros: Object.keys(S.w.cars).length })); return; }
  res.writeHead(404); res.end();
});
srv.on('upgrade', (req, sock) => {
  const key = req.headers['sec-websocket-key'];
  if (!req.url.startsWith('/ws') || !key || players.size >= MAXP * 2) { sock.destroy(); return; }
  const acc = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${acc}\r\n\r\n`);
  sock.setNoDelay(true);
  const c = { id: nextId++, sock, buf: Buffer.alloc(0), p: null, rate: 0, rt: Date.now(), dead: false };
  players.set(c.id, c);
  sock.on('data', d => { c.buf = Buffer.concat([c.buf, d]); if (c.buf.length > 1 << 17) return drop(c); for (;;) { const m = frame(c); if (m === null) break; if (m === false) return drop(c); } });
  sock.on('close', () => drop(c)); sock.on('error', () => drop(c));
});
const frame = c => {
  const b = c.buf; if (b.length < 2) return null; const op = b[0] & 15, masked = b[1] & 128; let len = b[1] & 127, o = 2;
  if (len === 126) { if (b.length < 4) return null; len = b.readUInt16BE(2); o = 4; } else if (len === 127) { if (b.length < 10) return null; const L = b.readBigUInt64BE(2); if (L > 65536n) return false; len = Number(L); o = 10; }
  if (len > 65536 || !masked) return false; if (b.length < o + 4 + len) return null;
  const mk = b.subarray(o, o + 4), data = Buffer.from(b.subarray(o + 4, o + 4 + len)); for (let i = 0; i < len; i++) data[i] ^= mk[i & 3]; c.buf = b.subarray(o + 4 + len);
  if (op === 8) return false; if (op === 9) { try { c.sock.write(Buffer.concat([Buffer.from([0x8a, data.length]), data])); } catch (e) { } return true; } if (op !== 1) return true;
  const now = Date.now(); if (now - c.rt > 1000) { c.rt = now; c.rate = 0; } if (++c.rate > 120) return true; // demasiadas mensagens: ignora
  let m; try { m = JSON.parse(data.toString('utf8')); } catch (e) { return true; } try { onMsg(c, m); } catch (e) { console.error('msg', e.message); } return true;
};
const drop = c => {
  if (c.dead) return; c.dead = true; players.delete(c.id); try { c.sock.destroy(); } catch (e) { }
  for (const [k, L] of LK) if (L.c === c.id) LK.delete(k);
  for (const z of S.w.zs) if (z.o === c.id) z.o = 0;
  for (const car of Object.values(S.w.cars)) { const i = car.s.indexOf(c.id); if (i >= 0) { car.s[i] = 0; if (i === 0) car.v = 0; } }
  const p = c.p; if (!p) return; if (S.tokens[p.tok]) S.tokens[p.tok].t = Date.now();
  // quem sai fica a dormir onde estava (com o que tinha), a não ser que já estivesse morto
  if (p.alive && p.tok) { S.sleepers[p.tok] = { x: p.x, z: p.z, y: p.y, lv: p.lv, yaw: p.yaw, name: p.name, look: p.look, inv: p.inv || [], hp: p.hp, ar: p.ar, clan: p.clan || null, t: Date.now() }; dirty = true; bcast({ t: 'sleep', list: sleepList() }); }
  bcast({ t: 'left', id: c.id });
};
const sleepList = () => Object.entries(S.sleepers).map(([k, s]) => [k.slice(0, 8), +s.x.toFixed(1), +s.z.toFixed(1), s.lv || 0, +(s.yaw || 0).toFixed(2), s.name, s.look || {}, s.clan || null]);
const bagRow = (id, b) => [id, +b.x.toFixed(2), +b.z.toFixed(2), +(b.y || 0).toFixed(2), b.lv || 0, b.body ? 1 : 0, b.name || ''];
const bagRows = () => Object.entries(S.bags).map(([id, b]) => bagRow(id, b));
const clanOf = id => S.clans[id] || null;
const clanInfo = cid => { const C = clanOf(cid); return C ? { id: cid, nome: C.nome, codigo: C.codigo, membros: C.membros } : null; };
const num = (v, a, b, d = 0) => (typeof v === 'number' && isFinite(v) ? Math.max(a, Math.min(b, v)) : d);

// ---------- objetos (o que vai nas mochilas e caixas): só campos conhecidos, com limites
const ITK = /^[A-Za-z0-9]{1,15}$/;
const cleanIt = L => !Array.isArray(L) ? [] : L.slice(0, 80).filter(o => o && typeof o.k === 'string' && ITK.test(o.k)).map(o => {
  const r = { k: o.k, n: num(o.n, 1, 1000, 1) | 0 };
  for (const f of ['ammo', 'am', 'zero']) if (typeof o[f] === 'number') r[f] = num(o[f], 0, 1000) | 0;
  for (const f of ['ak', 'mg', 'pref']) if (typeof o[f] === 'string' && ITK.test(o[f])) r[f] = o[f];
  if (o.att && typeof o.att === 'object') r.att = Object.fromEntries(Object.entries(o.att).filter(([a, v]) => ITK.test(a) && typeof v === 'string' && ITK.test(v)).slice(0, 6));
  if (o.r) r.r = 1; if (typeof o.x === 'number') r.x = num(o.x, 0, 30) | 0; if (typeof o.y === 'number') r.y = num(o.y, 0, 30) | 0;
  return r; });

// ---------- contas de cada jogador (anti-batota): o servidor sabe quanto tem cada um de cada coisa e só deixa
// ter, guardar ou largar o que viu chegar: caixas e sacos, recursos apanhados, o que fabricou, o kit ao nascer.
// Conta pilhas, acessórios metidos nas armas, carregadores metidos e as balas lá dentro (carregar e descarregar não muda nada).
const KIT = { pedra: 1, ligadura: 2, onigiri: 1, lanterna: 1 };
const tally = (list, T = {}) => { for (const o of list || []) { if (!o || !ITEMS[o.k]) continue; const d = ITEMS[o.k]; T[o.k] = (T[o.k] || 0) + Math.max(1, o.n | 0);
    if (o.att) for (const v of Object.values(o.att)) if (ITEMS[v]) T[v] = (T[v] || 0) + 1;
    if (d.gun && o.mg && ITEMS[o.mg]) T[o.mg] = (T[o.mg] || 0) + 1;
    const am = (d.gun ? o.ammo | 0 : 0) + (d.clip ? o.am | 0 : 0); if (am > 0 && o.ak && ITEMS[o.ak]) T[o.ak] = (T[o.ak] || 0) + am; }
  return T; };
const flat = inv => !inv ? [] : [...(inv.bag || []), ...(inv.belt || []).filter(Boolean), ...Object.values(inv.eq || {}).filter(Boolean)];
const diffT = (A, B) => { const out = {}; for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) { const d = (A[k] || 0) - (B[k] || 0); if (d > 0) out[k] = d; } return out; }; // o que A tem a mais que B
const fits = (need, T) => Object.entries(need).every(([k, n]) => (T[k] || 0) >= n);
const addT = (T, X, s = 1) => { for (const [k, n] of Object.entries(X)) { T[k] = (T[k] || 0) + s * n; if (T[k] <= 0) delete T[k]; } };
const ledOf = p => { let L = S.led[p.tok]; if (!L) { L = S.led[p.tok] = { T: { ...KIT }, inv: null, g: !!(S.tokens[p.tok] && S.tokens[p.tok].g) }; dirty = true; } return L; };
const cleanInv = m => ({ bag: cleanIt(m.bag), belt: (Array.isArray(m.belt) ? m.belt.slice(0, 6) : []).map(o => o ? cleanIt([o])[0] || null : null), eq: Object.fromEntries(['head', 'vest', 'back'].map(s => [s, m.eq && m.eq[s] ? cleanIt([m.eq[s]])[0] || null : null])) });
const strike = (c, p, what) => { p.strikes = (p.strikes || 0) + 1; if (p.strikes <= 5 || p.strikes % 20 === 0) console.log('batota?', p.name, what, p.strikes); };
// o inventário do jogo: se tiver coisas que o servidor não viu chegar, manda corrigir
const invMsg = (c, p, m) => { const L = ledOf(p), inv = cleanInv(m), C = tally(flat(inv));
  if (L.g) { L.T = C; L.inv = inv; L.g = false; if (S.tokens[p.tok]) delete S.tokens[p.tok].g; dirty = true; return; } // personagens de antes das contas: aceita-se o que tinham
  const extra = diffT(C, L.T); if (Object.keys(extra).length) { strike(c, p, 'inv ' + JSON.stringify(extra)); send(c, { t: 'fix', T: L.T }); return; }
  L.T = C; L.inv = inv; p.inv = flat(inv).map(({ x, y, ...r }) => r); dirty = true; };
// juntar recursos (árvores e rochas): no máximo o que dá para apanhar a bater sem parar
const GATHER = { madeira: 1, pedraR: 1, metal: 1, enxofre: 1 };
const NODEY = new Map(); // quanto já saiu de cada árvore ou rocha (volta a crescer em 3 min)
const gather = (c, p, m) => { const k = String(m.k || ''), n = num(m.n, 0, 200) | 0, nk = String(m.nk || ''); if (!GATHER[k] || !n) return; const now = Date.now(), b = p.gb || (p.gb = { v: 3000, t: now }); b.v = Math.min(3000, b.v + (now - b.t) / 60000 * 3000); b.t = now;
  if (!/^[cs][0-9,:-]{1,24}$/.test(nk)) { strike(c, p, 'recursos sem árvore'); return; }
  let y = NODEY.get(nk); if (!y || now - y.t > 180e3) { y = { v: 0, t: now }; NODEY.set(nk, y); } if (NODEY.size > 50000) NODEY.clear();
  if (b.v < n || y.v + n > 520) { strike(c, p, 'recursos ' + k + ' ' + n); return; } b.v -= n; y.v += n; addT(ledOf(p).T, { [k]: n }); dirty = true; };
// fabricar: receita do jogo, com material e (se for preciso) bancada a menos de 4 m
const craft = (c, p, m) => { const r = RECIPES[m.i | 0]; if (!r) return; const L = ledOf(p);
  if (r.b) { let lv = 0; for (const d of Object.values(S.w.base.d)) { const b = /^bancada([123])$/.exec(d.k); if (b && Math.hypot(d.x - p.x, d.z - p.z) < 5) lv = Math.max(lv, +b[1]); } if (lv < r.b) { strike(c, p, 'bancada ' + r.k); send(c, { t: 'fix', T: L.T }); return; } }
  if (!fits(r.need, L.T)) { strike(c, p, 'material ' + r.k); send(c, { t: 'fix', T: L.T }); return; }
  addT(L.T, r.need, -1); addT(L.T, { [r.k]: r.n || 1 }); dirty = true; };
// caixas: o que sai vai para quem a tem aberta; o que entra tem de ser dele. Na fornalha, a madeira vira carvão e o minério metal.
const boxDelta = (c, p, k, oldIt, newIt) => { const O = tally(oldIt), N = tally(newIt); const out = diffT(O, N), inn = diffT(N, O);
  if (k[0] === 'd') { const d = S.w.base.d[k.slice(1)]; if (d && d.k === 'fornalha') for (const [a, b] of [['carvao', 'madeira'], ['metalR', 'metal']]) { const q = Math.min(inn[a] || 0, out[b] || 0); if (q) { inn[a] -= q; out[b] -= q; if (!inn[a]) delete inn[a]; if (!out[b]) delete out[b]; } } }
  const L = ledOf(p); if (!fits(inn, L.T)) { strike(c, p, 'caixa ' + JSON.stringify(diffT(inn, L.T))); return false; }
  addT(L.T, inn, -1); addT(L.T, out); dirty = true; return true; };
// loot das caixas do mundo: gerado aqui (com as tabelas do jogo), não no telemóvel
const genLoot = (k, prev) => { const t = S.w.ctab && S.w.ctab[+k.slice(1)]; if (!t || !LOOT[t[0]]) return prev || []; const g = new Grid(t[1], t[2]); for (const o of prev || []) { const it = mkItem(o.k, o.n); Object.assign(it, o); g.insert(it); } rollLoot(t[0], g); return g.list.map(e => encSrv(e.it, e.x, e.y)); };
const encSrv = (it, x, y) => { const o = { k: it.k, n: it.n }; for (const f of ['ammo', 'am', 'ak', 'mg']) if (it[f] !== undefined && it[f] !== null) o[f] = it[f]; if (it.att && Object.keys(it.att).length) o.att = it.att; if (it.r) o.r = 1; if (x !== undefined) { o.x = x; o.y = y; } return o; };
// tiros: só com uma arma que dispare essa munição
const canShoot = (p, k) => { const T = ledOf(p).T; for (const g of Object.keys(T)) { const G2 = ITEMS[g] && ITEMS[g].gun; if (G2 && ammoOf(G2).includes(k)) return true; } return false; };
// custos das peças da base (os mesmos do jogo)
const PCOST = { fund: { madeira: 60 }, parede: { madeira: 60 }, porta: { madeira: 90 }, janela: { madeira: 60 }, teto: { madeira: 60 } };
const PUP = { fund: [{ pedraR: 150 }, { metalR: 90 }], parede: [{ pedraR: 150 }, { metalR: 90 }], porta: [{ pedraR: 150 }, { metalR: 120 }], janela: [{ pedraR: 120 }, { metalR: 80 }], teto: [{ pedraR: 150 }, { metalR: 90 }] };

// ---------- caixas e mochilas: só uma pessoa de cada vez mexe em cada uma (não há objetos duplicados)
const LK = new Map(); // chave → { c: id de quem a tem aberta, t }
const KEY = /^(w\d{1,5}|[bd][A-Za-z0-9_-]{4,12})$/;
const lockOf = k => { const L = LK.get(k); if (!L) return null; const o = players.get(L.c); if (!o || o.dead || Date.now() - L.t > 120e3) { LK.delete(k); return null; } return L; };
const bagDel = id => { if (!S.bags[id]) return; delete S.bags[id]; LK.delete('b' + id); dirty = true; bcast({ t: 'bg', del: [id] }); };
const store = (k, it) => {
  if (k[0] === 'b') { const b = S.bags[k.slice(1)]; if (b) { b.it = it; dirty = true; } return; }
  const r = S.w.ct[k]; S.w.ct[k] = { it, next: r ? r.next : Date.now() + 300e3 }; dirty = true;
};
const mkBag = (x, z, y, lv, it, o = {}) => {
  it = cleanIt(it); if (!it.length) return null;
  if (!o.body) for (const [id, b] of Object.entries(S.bags)) if (!b.body && (b.lv || 0) === lv && Math.hypot(b.x - x, b.z - z) < 1.6 && !lockOf('b' + id) && b.it.length + it.length <= 60) { b.it.push(...it.map(({ x, y, ...r }) => r)); b.t = Date.now(); dirty = true; return id; }
  const id = rid(6); S.bags[id] = { x, z, y, lv, it, body: o.body ? 1 : 0, name: o.name || '', t: Date.now() }; dirty = true;
  bcast({ t: 'bg', add: [bagRow(id, S.bags[id])] }); return id;
};

// ---------- bases partilhadas: peças (fundação, paredes, portas, janelas, tetos) e objetos (baús, fornalha, bancadas, camas)
// Só o dono e o clã dele mexem numa base (construir ao lado, melhorar, demolir, abrir as portas); os explosivos partem tudo.
const CELL = 3, TIER_HP = [250, 600, 1200], BED_CD = { cama: 120e3, saco: 300e3 };
const DEP = { bau: 300, bauG: 500, fornalha: 500, bancada1: 400, bancada2: 600, bancada3: 900, cama: 200, saco: 80 };
const EXB = { gran: { br: 1.8, bdmg: 40 }, c4: { br: 1.7, bdmg: 560 } };
const uidOf = tok => 'u' + crypto.createHash('sha1').update(tok).digest('hex').slice(0, 10);
const ally = (a, b) => a === b || !!(S.tokens[a] && S.tokens[a].clan && S.tokens[b] && S.tokens[a].clan === S.tokens[b].clan);
const BK = /^(f|t|h|v):(-?\d{1,4}):(-?\d{1,4})$/;
const pRow = (k, P) => [k, P.t, P.tier, Math.round(P.hp), P.o ? 1 : 0, P.u, P.cl ? (P.cl.h ? 1 : 2) : 0]; // último: 0 sem fechadura, 1 com código, 2 antiga (só dono e clã)
const dRow = (id, d) => [id, d.k, +d.x.toFixed(2), +d.z.toFixed(2), +d.yaw.toFixed(3), +d.y.toFixed(2), Math.round(d.hp), d.on ? 1 : 0, d.u, d.name || null, d.cd || 0, d.cl ? (d.cl.h ? 1 : 2) : 0];
const baseRows = () => ({ p: Object.entries(S.w.base.p).map(([k, P]) => pRow(k, P)), d: Object.entries(S.w.base.d).map(([id, d]) => dRow(id, d)) });
const bb = o => { dirty = true; bcast({ t: 'bb', ...o }); };
const no = (c, a, k, e) => send(c, { t: 'bno', a, k, e });
const fundAt = (i, j) => S.w.base.p['f:' + i + ':' + j];
// onde se pode construir: o mapa vem de mapa.json (exportado do jogo); só vale se for da mesma versão do mundo
let MAPA = null; try { MAPA = JSON.parse(fs.readFileSync(new URL('./mapa.json', import.meta.url), 'utf8')); MAPA.grid = new Map(); for (const r of [...MAPA.rects, ...MAPA.pads]) for (let ix = Math.floor((r[0] - 2) / 16); ix <= Math.floor((r[2] + 2) / 16); ix++) for (let iz = Math.floor((r[1] - 2) / 16); iz <= Math.floor((r[3] + 2) / 16); iz++) { const k = ix * 1000 + iz; if (!MAPA.grid.has(k)) MAPA.grid.set(k, []); MAPA.grid.get(k).push(r); } } catch (e) { console.log('mapa.json:', e.message); }
const mapOk = () => !!MAPA && S.w.wv === MAPA.wv;
const inCityS = (x, z) => x > MAPA.city[0] && x < MAPA.city[2] && z > MAPA.city[1] && z < MAPA.city[3];
const hardAt = (x, z) => { const c = MAPA.city; if (x > c[0] - 1 && x < c[2] + 1 && z > c[1] - 1 && z < c[3] + 1) return true; for (const r of MAPA.roads) if (x > r[0] - 0.3 && x < r[2] + 0.3 && z > r[1] - 0.3 && z < r[3] + 0.3) return true;
  const l = MAPA.grid.get(Math.floor(x / 16) * 1000 + Math.floor(z / 16)); if (l) for (const r of l) if (x > r[0] - 0.2 && x < r[2] + 0.2 && z > r[1] - 0.2 && z < r[3] + 0.2) return true; return false; };
const groundBad = (x0, z0, x1, z1) => { const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  if (Math.max(Math.abs(x0), Math.abs(z0), Math.abs(x1), Math.abs(z1)) > 3992) return 'Fora do mapa';
  if (inCityS(cx, cz)) return 'Na cidade não se constrói';
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [cx, cz]]) { if (hardAt(x, z)) return 'Só em terreno natural'; for (const r of MAPA.roads) if (x > r[0] - 3.9 && x < r[2] + 3.9 && z > r[1] - 3.9 && z < r[3] + 3.9) return 'Muito perto da estrada'; }
  for (const zn of MAPA.zones) if (Math.hypot(cx - zn[0], cz - zn[1]) < zn[2] + 19.9) return 'Muito perto de ' + zn[4];
  for (let ix = Math.floor(x0 / 16); ix <= Math.floor(x1 / 16); ix++) for (let iz = Math.floor(z0 / 16); iz <= Math.floor(z1 / 16); iz++) for (const r of MAPA.grid.get(ix * 1000 + iz) || []) if (r[0] < x1 && r[2] > x0 && r[1] < z1 && r[3] > z0) return 'Há alguma coisa no caminho';
  return null; };
// fechaduras de código: quem sabe o código fica autorizado; o dono e o clã dele entram sempre
const lkOk = (L, owner, tok, uid) => !L || ally(owner, tok) || (!!L.h && L.a.includes(uid));
const lkHash = (s, code) => crypto.createHash('sha256').update(s + ':' + code).digest('hex');
const LKF = new Map(); // tentativas erradas por jogador (token): { n, until }
const doorXZ = k => { const m = BK.exec(k); const i = +m[2], j = +m[3]; return m[1] === 'h' ? [i * CELL + CELL / 2, j * CELL] : [i * CELL, j * CELL + CELL / 2]; };
// o caminho de a até b atravessa uma parede, janela ou porta fechada da base? (portas abertas deixam passar pelo vão)
const DFR = 0.85, WALLT = new Set(['parede', 'porta', 'janela']);
const wallCross = (x0, z0, x1, z1) => { const B = S.w.base.p, ax = Math.min(x0, x1), bx = Math.max(x0, x1), az = Math.min(z0, z1), bz = Math.max(z0, z1);
  if (bx - ax > 60 || bz - az > 60) return null;
  for (let j = Math.floor(az / CELL); j <= Math.floor(bz / CELL) + 1; j++) { const Z = j * CELL; if (!((z0 < Z && z1 >= Z) || (z0 > Z && z1 <= Z))) continue; const x = x0 + (Z - z0) / (z1 - z0) * (x1 - x0), i = Math.floor(x / CELL), P = B['h:' + i + ':' + j]; if (!P || !WALLT.has(P.t)) continue; if (P.t === 'porta' && P.o) { const a = x - i * CELL; if (a > DFR && a < CELL - DFR) continue; } return P; }
  for (let i = Math.floor(ax / CELL); i <= Math.floor(bx / CELL) + 1; i++) { const X = i * CELL; if (!((x0 < X && x1 >= X) || (x0 > X && x1 <= X))) continue; const z = z0 + (X - x0) / (x1 - x0) * (z1 - z0), j = Math.floor(z / CELL), P = B['v:' + i + ':' + j]; if (!P || !WALLT.has(P.t)) continue; if (P.t === 'porta' && P.o) { const a = z - j * CELL; if (a > DFR && a < CELL - DFR) continue; } return P; }
  return null; };
const edgeCells = (t, i, j) => t === 'h' ? [[i, j - 1], [i, j]] : [[i - 1, j], [i, j]];
// remover uma peça; se for fundação, saem as paredes que ficavam só nela e o teto
const pDel = (k, out) => { const P = S.w.base.p[k]; if (!P) return; delete S.w.base.p[k]; out.push(k);
  const m = BK.exec(k); if (!m || m[1] !== 'f') return; const i = +m[2], j = +m[3];
  for (const [ek, oi, oj] of [['h:' + i + ':' + j, i, j - 1], ['h:' + i + ':' + (j + 1), i, j + 1], ['v:' + i + ':' + j, i - 1, j], ['v:' + (i + 1) + ':' + j, i + 1, j]]) if (S.w.base.p[ek] && !fundAt(oi, oj)) { delete S.w.base.p[ek]; out.push(ek); }
  if (S.w.base.p['t:' + i + ':' + j]) { delete S.w.base.p['t:' + i + ':' + j]; out.push('t:' + i + ':' + j); } };
// tirar um objeto: o que tinha dentro fica num saco no chão
const dDel = (id, out) => { const d = S.w.base.d[id]; if (!d) return; delete S.w.base.d[id]; out.push(id); const r = S.w.ct['d' + id]; if (r) { if (r.it && r.it.length) mkBag(d.x, d.z, d.y || 0, 0, r.it); delete S.w.ct['d' + id]; } LK.delete('d' + id); };
const baseMsg = (c, p, m, now) => {
  const B = S.w.base, tok = p.tok;
  if (m.t === 'bp') { const k = String(m.k || ''), mm = BK.exec(k); if (!mm) return; const ty = mm[1], i = +mm[2], j = +mm[3], t = String(m.tt || '');
    if (!(ty === 'f' ? t === 'fund' : ty === 't' ? t === 'teto' : ['parede', 'porta', 'janela'].includes(t))) return;
    if (Math.hypot(i * CELL + 1.5 - p.x, j * CELL + 1.5 - p.z) > 14) return no(c, 'bp', k, 'Estás longe demais');
    if (B.p[k]) return no(c, 'bp', k, 'Já há aí uma peça');
    if (ty === 'f') { for (let a = i - 2; a <= i + 2; a++) for (let b = j - 2; b <= j + 2; b++) { const F = fundAt(a, b); if (F && !ally(F.tok, tok)) return no(c, 'bp', k, 'Muito perto da base de outro jogador'); } // nem colado nem a menos de 2 casas (6 m)
      if (mapOk()) { const bad = groundBad(i * CELL + 0.05, j * CELL + 0.05, i * CELL + CELL - 0.05, j * CELL + CELL - 0.05); if (bad) return no(c, 'bp', k, bad); } }
    else if (ty === 't') { const F = fundAt(i, j); if (!F) return no(c, 'bp', k, 'Precisa de fundação'); if (!ally(F.tok, tok)) return no(c, 'bp', k, 'Esta base não é tua'); }
    else { const fs2 = edgeCells(ty, i, j).map(([a, b]) => fundAt(a, b)).filter(Boolean); if (!fs2.length) return no(c, 'bp', k, 'Precisa de fundação'); if (fs2.some(F => !ally(F.tok, tok))) return no(c, 'bp', k, 'Esta base não é tua'); }
    { const L = ledOf(p); if (!fits(PCOST[t], L.T)) return no(c, 'bp', k, 'Não tens material'); addT(L.T, PCOST[t], -1); }
    B.p[k] = { t, tier: 0, hp: TIER_HP[0], o: 0, u: p.uid, tok }; bb({ p: [pRow(k, B.p[k])] }); return; }
  if (m.t === 'bu') { const k = String(m.k || ''), P = B.p[k]; if (!P) return no(c, 'bu', k, 'Essa peça já não existe'); if (!ally(P.tok, tok)) return no(c, 'bu', k, 'Esta base não é tua'); if (P.tier >= 2) return no(c, 'bu', k, 'Já é de metal');
    { const L = ledOf(p), need = PUP[P.t][P.tier]; if (!fits(need, L.T)) return no(c, 'bu', k, 'Não tens material'); addT(L.T, need, -1); }
    P.tier++; P.hp = TIER_HP[P.tier]; bb({ p: [pRow(k, P)] }); return; }
  if (m.t === 'bx') { const k = String(m.k || ''), P = B.p[k]; if (!P) return; if (!ally(P.tok, tok)) return no(c, 'bx', k, 'Esta base não é tua'); const out = []; pDel(k, out); bb({ rp: out }); addT(ledOf(p).T, Object.fromEntries(Object.entries(PCOST[P.t]).map(([a, n]) => [a, Math.floor(n / 2)]))); send(c, { t: 'bxok', k, tt: P.t }); return; }
  if (m.t === 'bdo') { const k = String(m.k || ''), P = B.p[k]; if (!P || P.t !== 'porta') return; const [dx, dz] = doorXZ(k); if (Math.hypot(dx - p.x, dz - p.z) > 4) return no(c, 'bdo', k, 'Chega-te à porta'); if (!lkOk(P.cl, P.tok, tok, p.uid)) return send(c, { t: 'bno', a: 'bdo', k, e: P.cl.h ? 'Trancada com código' : 'Trancada', lk: P.cl.h ? 1 : 0 }); P.o = m.o ? 1 : 0; bb({ p: [pRow(k, P)] }); return; }
  if (m.t === 'bd') { const k = String(m.k || ''); if (!DEP[k]) return; const x = num(m.x, -4100, 4100), z = num(m.z, -4100, 4100); if (Math.hypot(x - p.x, z - p.z) > 6) return no(c, 'bd', k, 'Estás longe demais');
    const F = fundAt(Math.floor(x / CELL), Math.floor(z / CELL)); if (F && !ally(F.tok, tok)) return no(c, 'bd', k, 'Esta base não é tua');
    if (!F && mapOk()) { if (inCityS(x, z)) return no(c, 'bd', k, 'Na cidade não'); for (const zn of MAPA.zones) if (Math.hypot(x - zn[0], z - zn[1]) < zn[2] + 9.9) return no(c, 'bd', k, 'Muito perto de ' + zn[4]); if (hardAt(x, z)) return no(c, 'bd', k, 'Só em terreno natural'); }
    { const L = ledOf(p); if ((L.T[k] || 0) < 1) return no(c, 'bd', k, 'Não tens isso'); addT(L.T, { [k]: 1 }, -1); }
    const id = rid(6); B.d[id] = { k, x, z, yaw: num(m.yaw, -10, 10), y: num(m.y, 0, 5), hp: DEP[k], on: 0, u: p.uid, tok, name: typeof m.name === 'string' ? m.name.replace(/[<>]/g, '').slice(0, 24) : null, cd: 0 };
    bb({ d: [dRow(id, B.d[id])] }); send(c, { t: 'bdok', id, k }); return; }
  const d = B.d[String(m.id || '')], id = String(m.id || '');
  if (m.t === 'bdr') { if (!d) return; if (d.tok !== tok && !(ally(d.tok, tok) && !BED_CD[d.k])) return no(c, 'bdr', id, 'Não é teu'); if (m.pick && Math.hypot(d.x - p.x, d.z - p.z) > 5) return no(c, 'bdr', id, 'Chega-te mais perto'); const out = []; dDel(id, out); bb({ rd: out }); if (m.pick) { addT(ledOf(p).T, { [d.k]: 1 }); const lb = d.cl && d.cl.h ? 1 : 0; if (lb) addT(ledOf(p).T, { fechadura: 1 }); send(c, { t: 'bdok', pick: d.k, id, lb }); } return; }
  if (m.t === 'bdn') { if (!d || d.tok !== tok) return; d.name = String(m.name || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24) || d.name; bb({ d: [dRow(id, d)] }); return; }
  if (m.t === 'bdc') { if (!d || d.tok !== tok || !BED_CD[d.k]) return; d.cd = now + BED_CD[d.k]; bb({ d: [dRow(id, d)] }); return; }
  if (m.t === 'lkc' || m.t === 'lkset') { const isD = !!m.id, k = String(m.k || ''), T = isD ? d : (BK.test(k) ? B.p[k] : null); if (!T || (isD ? !(T.k === 'bau' || T.k === 'bauG') : T.t !== 'porta')) return; const key = isD ? 'd' + id : k;
    const [tx, tz] = isD ? [T.x, T.z] : doorXZ(k); if (Math.hypot(tx - p.x, tz - p.z) > 4 || wallCross(p.x, p.z, tx, tz) && isD) return no(c, m.t, key, 'Chega-te mais perto');
    if (m.t === 'lkc') { const code = String(m.code || ''); if (!/^\d{4}$/.test(code) || !T.cl || !T.cl.h) return; const F = LKF.get(tok) || { n: 0, until: 0 }; if (now < F.until) return send(c, { t: 'bno', a: 'lkc', k: key, e: 'Espera ' + Math.ceil((F.until - now) / 1000) + ' s' });
      if (lkHash(T.cl.s, code) !== T.cl.h) { F.n++; if (F.n % 3 === 0) F.until = now + Math.min(600e3, 30e3 * 2 ** (F.n / 3 - 1)); LKF.set(tok, F); return send(c, { t: 'bno', a: 'lkc', k: key, e: 'Código errado', lk: 1 }); }
      LKF.delete(tok); if (!T.cl.a.includes(p.uid)) { T.cl.a.push(p.uid); if (T.cl.a.length > 64) T.cl.a.shift(); } dirty = true;
      if (!isD) { T.o = 1; bb({ p: [pRow(k, T)] }); } send(c, { t: 'lkok', k: key }); return; }
    if (m.rm) { if (!T.cl) return; if (!lkOk(T.cl, T.tok, tok, p.uid)) return no(c, 'lkset', key, 'Não sabes o código'); const real = !!T.cl.h; delete T.cl; if (real) addT(ledOf(p).T, { fechadura: 1 }); dirty = true; if (isD) bb({ d: [dRow(id, T)] }); else bb({ p: [pRow(k, T)] }); send(c, { t: 'lkok', k: key, rm: 1, back: real ? 1 : 0 }); return; }
    const code = String(m.code || ''); if (!/^\d{4}$/.test(code)) return no(c, 'lkset', key, 'O código tem 4 números');
    if (!T.cl) { if (!ally(T.tok, tok)) return no(c, 'lkset', key, 'Não é da tua base'); const L = ledOf(p); if ((L.T.fechadura || 0) < 1) return no(c, 'lkset', key, 'Precisas de uma fechadura'); addT(L.T, { fechadura: 1 }, -1); T.cl = { h: null, a: [] }; }
    else if (!lkOk(T.cl, T.tok, tok, p.uid)) return no(c, 'lkset', key, 'Não sabes o código');
    T.cl.s = rid(8); T.cl.h = lkHash(T.cl.s, code); T.cl.a = [p.uid]; dirty = true; if (isD) bb({ d: [dRow(id, T)] }); else bb({ p: [pRow(k, T)] }); send(c, { t: 'lkok', k: key, set: 1 }); return; }
  if (m.t === 'fu') { if (!d || d.k !== 'fornalha' || Math.hypot(d.x - p.x, d.z - p.z) > 6) return; d.on = m.on ? 1 : 0; d.last = now; d.until = num(m.until, 0, 1e15, 0); bb({ d: [dRow(id, d)] }); return; }
};
// explosão: quem a fez manda onde foi; aqui partem-se as peças e os objetos, e os outros veem e ouvem
const boom = (c, p, m) => { const X = EXB[m.k]; if (!X) return; const ti = (p.thr || []).findIndex(q => q.k === m.k && Date.now() - q.t < 120000); if (ti < 0) { strike(c, p, 'explosão sem lançar'); return; } p.thr.splice(ti, 1); const x = num(m.x, -4100, 4100), z = num(m.z, -4100, 4100), y = num(m.y, -5, 40), lv = num(m.lv, 0, 6) | 0; if (Math.hypot(x - p.x, z - p.z) > 60) return;
  bcast({ t: 'boom', k: m.k, x, y, z, lv }, o => o !== c && Math.hypot(o.p.x - x, o.p.z - z) < 300);
  if (Array.isArray(m.lk)) for (const [w, hp] of m.lk.slice(0, 4)) { const i = num(w, 0, 20000, -1) | 0; if (i < 0) continue; const L = S.w.locks[i] || {}; L.hp = Math.min(L.hp ?? 1e9, num(hp, 0, 5000)); if (L.hp <= 0) { L.hp = 0; L.broke = Date.now(); S.w.doors[i] = 1; } S.w.locks[i] = L; dirty = true; bcast({ t: 'lk', i, hp: L.hp, broke: L.broke || 0 }); }
  if (lv !== 0) return; for (const car of Object.values(S.w.cars)) { const q = Math.hypot(car.x - x, car.z - z); if (q > 5 || car.hp <= 0) continue; car.hp = Math.max(0, car.hp - (m.k === 'c4' ? 700 : 160) * (1 - q / 5)); if (car.hp <= 0) { car.dead = Date.now(); car.s = [0, 0, 0, 0]; car.v = 0; } dirty = true; }
  const B = S.w.base, upd = [], rp = [], dd = [], rd = [];
  for (const [k, P] of Object.entries(B.p)) { if (!B.p[k]) continue; const mm = BK.exec(k); if (!mm) continue; const i = +mm[2], j = +mm[3]; let mx, mz;
    if (mm[1] === 'f' || mm[1] === 't') { mx = i * CELL + CELL / 2; mz = j * CELL + CELL / 2; } else if (mm[1] === 'h') { mx = i * CELL + CELL / 2; mz = j * CELL; } else { mx = i * CELL; mz = j * CELL + CELL / 2; }
    const d = Math.hypot(mx - x, mz - z) - (mm[1] === 'f' || mm[1] === 't' ? 1.2 : 0.9); if (d > X.br) continue; const f = d <= 0 ? 1 : (1 - d / X.br) * (1 - d / X.br);
    P.hp -= X.bdmg * f * (P.t === 'fund' ? 0.5 : 1); if (P.hp <= 0) { delete B.p[k]; rp.push(k); } else upd.push(pRow(k, P)); }
  for (const [id, d] of Object.entries(B.d)) { const q = Math.hypot(d.x - x, d.z - z); if (q > X.br) continue; d.hp -= X.bdmg * (1 - q / X.br); if (d.hp <= 0) dDel(id, rd); else dd.push(dRow(id, d)); }
  if (upd.length || rp.length || dd.length || rd.length) bb({ p: upd, rp, d: dd, rd }); };


// ---------- carros: quem conduz manda a posição; o servidor guarda gasolina, estado e quem vai em cada lugar
const cRow = (id, c) => [id, Math.round(c.x * 10), Math.round(c.z * 10), Math.round(c.yaw * 100), Math.round((c.v || 0) * 10), +(+c.fuel).toFixed(1), Math.round(c.hp), c.s[0] || 0, c.s[1] || 0, c.s[2] || 0, c.s[3] || 0, Math.round(c.ts || 0)];
const carMsg = (c, p, m, now) => {
  const car = S.w.cars[String(m.id || '')];
  if (m.t === 'cin') { const seat = num(m.seat, 0, 3) | 0; const holder = car && car.s[seat] && players.get(car.s[seat]);
    if (!car || car.hp <= 0 || (holder && holder.p) || Math.hypot(car.x - p.x, car.z - p.z) > 6) return send(c, { t: 'cin', id: m.id, seat, ok: 0 });
    for (const o of Object.values(S.w.cars)) { const i = o.s.indexOf(c.id); if (i >= 0) o.s[i] = 0; } car.s[seat] = c.id; return send(c, { t: 'cin', id: m.id, seat, ok: 1 }); }
  if (m.t === 'cout') { if (!car) return; const i = car.s.indexOf(c.id); if (i >= 0) { car.s[i] = 0; if (i === 0) car.v = 0; dirty = true; } return; }
  if (m.t === 'cu') { if (!Array.isArray(m.L)) return; for (const a of m.L.slice(0, 2)) { const o = S.w.cars[a[0]]; if (!o || o.s[0] !== c.id || o.hp <= 0) continue;
      o.x = num(a[1], -41000, 41000) / 10; o.z = num(a[2], -41000, 41000) / 10; o.yaw = num(a[3], -100000, 100000) / 100; o.v = num(a[4], -300, 300) / 10; o.fuel = Math.min(o.fuel, num(a[5], 0, 40)); o.hp = Math.min(o.hp, num(a[6], 0, 400)); o.ts = num(a[7], 0, 1e13, 0);
      if (o.hp <= 0) { o.dead = now; o.s = [0, 0, 0, 0]; o.v = 0; } dirty = true; } return; }
  if (m.t === 'cf') { if (!car || Math.hypot(car.x - p.x, car.z - p.z) > 6) return; { const L = ledOf(p); if ((L.T.gasolina || 0) < 1) { send(c, { t: 'fix', T: L.T }); return; } addT(L.T, { gasolina: 1 }, -1); } car.fuel = Math.min(40, car.fuel + num(m.add, 0, 20)); dirty = true; return; }
  // atropelar outro jogador: quem conduz diz quem; o servidor confirma que o carro estava mesmo ao lado
  if (m.t === 'ck') { const o = players.get(m.to | 0), mine = Object.values(S.w.cars).find(q => q.s[0] === c.id); if (!o || !o.p || !o.p.alive || !mine || Math.hypot(mine.x - o.p.x, mine.z - o.p.z) > 5) return;
    if (p.clan && o.p.clan === p.clan) return; const v = o.p, dmg = num(m.dmg, 0, 120); v.hp = Math.max(0, v.hp - dmg); const kill = v.hp <= 0; if (kill) v.alive = false;
    send(o, { t: 'hit', by: p.name, dmg: +dmg.toFixed(1), zone: 'body', hp: v.hp, car: 1 }); send(c, { t: 'hitc', on: o.id, zone: 'body', kill, name: v.name }); return; }
};

// ---------- zombies: o servidor guarda todos (posição, vida, proteção); quem está mais perto simula os que tem à volta
// e manda para aqui; os outros veem o mesmo. Dano e mortes passam sempre por aqui.
const zRow = (i, z, own) => [i, Math.round(z.x * 10), Math.round(z.z * 10), z.lv, Math.round(z.yaw * 100), Math.round((z.mv || 0) * 10), z.st, Math.round(z.hp), z.k, z.h, z.v, Math.round((z.limp || 0) * 10), own ? 1 : 0, Math.round(z.hx * 10), Math.round(z.hz * 10), Math.round(z.ts || 0)];
// para quem o simula, a posição vem dele: só se volta a mandar quando muda a vida, a proteção ou morre
const zSig = (z, own, row) => own ? 'o' + (z.st === 3 ? 3 : 0) + ',' + row[7] + ',' + z.h + ',' + z.v + ',' + row[11] : row.join();
const zNear = (x, z, r) => { let n = 0; for (const c of players.values()) if (c.p && Math.hypot(c.p.x - x, c.p.z - z) < r) n++; return n; };

// dano num zombie: conta aqui; quem o simula recebe o empurrão (e o zombie vira-se para quem disparou)
const zHit = (c, p, m, now) => { const z = S.w.zs[m.i | 0]; if (!z || z.st === 3 || Math.hypot(z.x - p.x, z.z - p.z) > 900) return;
  z.hp -= num(m.dmg, 0, 2000); if (typeof m.h === 'number') z.h = num(m.h, 0, 4) | 0; if (typeof m.v === 'number') z.v = num(m.v, 0, 4) | 0; if (typeof m.hd === 'number') z.hd = m.hd; if (typeof m.vd === 'number') z.vd = m.vd;
  if (m.limp) z.limp = Math.min(2, (z.limp || 0) + num(m.limp, 0, 2));
  if (z.hp <= 0) { z.hp = 0; z.st = 3; z.dt = now; z.mv = 0; dirty = true; if (Math.random() < 0.32) { const g = new Grid(6, 4); rollLoot(z.k === 1 ? 'militar' : 'zombie', g); mkBag(z.x, z.z, 0, z.lv || 0, g.list.map(e => encSrv(e.it, e.x, e.y))); } bcast({ t: 'zk', i: m.i | 0, by: c.id, head: m.zone === 'head' ? 1 : 0 }, o => o.p && Math.hypot(o.p.x - z.x, o.p.z - z.z) < 200); return; }
  if (z.o && z.o !== c.id) { const o = players.get(z.o); if (o) send(o, { t: 'zh', i: m.i | 0, dx: num(m.dx, -1, 1), dz: num(m.dz, -1, 1), by: c.id }); } };

// ---------- mensagens
const onMsg = (c, m) => {
  if (!m || typeof m.t !== 'string') return;
  if (m.t === 'hi') {
    if (c.p) return; const name = String(m.name || ''); if (!NAME.test(name)) return send(c, { t: 'erro', e: 'nome' });
    // jogo antigo (antes da 0.15, sem o servidor a contar o inventário): tem de recarregar, senão apagava o inventário guardado
    if ((m.pv | 0) < 3) return send(c, { t: 'erro', e: 'versao' });
    if ([...players.values()].some(o => o.p && o.p.name.toLowerCase() === name.toLowerCase())) return send(c, { t: 'erro', e: 'nome_em_uso' });
    // versão do mundo (casas, caixas, portas): se mudou e não está ninguém ligado, recomeça o mundo partilhado
    const wv = typeof m.wv === 'string' ? m.wv.slice(0, 40) : '';
    if (wv && S.w.wv !== wv) { if ([...players.values()].some(o => o.p)) return send(c, { t: 'erro', e: 'versao' }); S.w = { ...W0(), wv, cyc0: S.w.cyc0, wx: S.w.wx }; LK.clear(); dirty = true; }
    let tok = typeof m.tok === 'string' && m.tok.length === 32 && S.tokens[m.tok] ? m.tok : null;
    // o nome fica guardado 3 dias depois da última vez (ou enquanto a personagem dorme): ninguém se faz passar por outro
    const lo = name.toLowerCase(), now = Date.now();
    const dono = Object.keys(S.tokens).find(k => (S.tokens[k].name || '').toLowerCase() === lo && (S.sleepers[k] || now - S.tokens[k].t < 3 * 24 * 3600e3));
    if (dono && dono !== tok) return send(c, { t: 'erro', e: 'nome_em_uso' });
    if (!tok) { tok = rid(24); S.tokens[tok] = { name, t: now }; } S.tokens[tok].name = name; S.tokens[tok].t = now; dirty = true;
    const sl = S.sleepers[tok]; let killed = false, resume = null;
    if (sl) { delete S.sleepers[tok]; dirty = true; resume = { x: sl.x, z: sl.z, lv: sl.lv, hp: sl.hp }; bcast({ t: 'sleep', list: sleepList() }); }
    if (S.tokens[tok].killed) { killed = true; delete S.tokens[tok].killed; dirty = true; }
    if (!S.w.ctab && Array.isArray(m.ctab) && m.ctab.length < 5000) { S.w.ctab = m.ctab.map(a => Array.isArray(a) && typeof a[0] === 'string' && LOOT[a[0]] ? [a[0], num(a[1], 1, 8, 4) | 0, num(a[2], 1, 8, 4) | 0] : null); dirty = true; }
    const tst = process.env.KG_TEST === '1' && !!m.test; // só nos testes automáticos (que teletransportam e dão coisas)
    if (tst) S.led[tok] = { T: {}, inv: null, g: true };
    else if (m.fresh || killed) { S.led[tok] = { T: { ...KIT }, inv: null, g: false }; if (S.tokens[tok]) delete S.tokens[tok].g; dirty = true; }
    const look = m.look && typeof m.look === 'object' ? Object.fromEntries(Object.entries(m.look).filter(([k, v]) => ['skin', 'hair', 'top', 'legs', 'hairS', 'beardS'].includes(k) && typeof v === 'number')) : {};
    const tc = S.tokens[tok].clan, clan = tc && S.clans[tc] ? tc : null;
    c.p = { name, tok, look, x: sl ? sl.x : num(m.x, -4100, 4100), z: sl ? sl.z : num(m.z, -4100, 4100), lastSt: sl ? now : 0, y: 0, lv: 0, yaw: 0, mv: 0, an: 0, w: '', hp: resume ? resume.hp ?? 100 : 100, alive: true, ar: [0, 0], inv: [], clan, lastShot: 0, hd: null, vd: null };
    c.zc = new Map(); c.cc = new Map(); c.p.uid = uidOf(tok); c.p.test = tst;
    if (!Object.keys(S.w.cars).length && Array.isArray(m.cars)) { m.cars.slice(0, 60).forEach((a, i) => { const x = num(a[0], -4100, 4100), z = num(a[1], -4100, 4100), yaw = num(a[2], -10, 10); S.w.cars['c' + i] = { x, z, yaw, v: 0, fuel: +(10 + Math.random() * 20).toFixed(1), hp: 400, sx: x, sz: z, syaw: yaw, s: [0, 0, 0, 0], dead: 0 }; }); dirty = true; }
    const zseed = !S.w.zs.length && ![...players.values()].some(o => o !== c && o.zseed && now - (o.zseedT || 0) < 15000); if (zseed) { c.zseed = true; c.zseedT = now; }
    send(c, { t: 'ok', id: c.id, tok, killed, resume, players: [...players.values()].filter(o => o.p && o !== c).map(o => [o.id, o.p.name, o.p.look, o.p.clan]), sleep: sleepList(), clan: clanInfo(clan),
      uid: c.p.uid, inv: !m.fresh && !killed && S.led[tok] && !S.led[tok].g ? S.led[tok].inv : null, w: { cyc0: S.w.cyc0, now, wx: S.w.wx.r, base: baseRows(), locks: Object.entries(S.w.locks).map(([i, L]) => [+i, L.hp, L.broke || 0]), doors: Object.entries(S.w.doors).map(([i, o]) => [+i, o]), nodes: Object.entries(S.w.nodes).map(([k, u]) => [k, u - now]).filter(a => a[1] > 0), bags: bagRows(), zseed } });
    bcast({ t: 'join', id: c.id, name, look, clan }, o => o !== c);
    return;
  }
  const p = c.p; if (!p) return; const now = Date.now();
  if (m.t === 'st') { const nx = num(m.x, -4100, 4100), nz = num(m.z, -4100, 4100), al0 = !!m.al;
    if (al0 && !p.alive) { const L = ledOf(p); L.T = { ...KIT }; L.inv = null; dirty = true; p.lastSt = 0; } // renasceu
    else if (p.lastSt && al0 && p.alive && !p.test) { const dt = (now - p.lastSt) / 1000, inCar = Object.values(S.w.cars).some(o => o.s.includes(c.id)), d = Math.hypot(nx - p.x, nz - p.z);
      if (d > (inCar ? 25 : 8) * dt + 4) { strike(c, p, 'salto ' + d.toFixed(1) + ' m em ' + dt.toFixed(2) + ' s'); send(c, { t: 'pos', x: p.x, z: p.z, lv: p.lv }); p.lastSt = now; return; } }
    if (p.alive && al0 && (p.lv | 0) === 0 && p.y < 3 && Math.hypot(nx - p.x, nz - p.z) < 8 && wallCross(p.x, p.z, nx, nz)) { p.wallN = (p.wallN || 0) + 1; if (p.wallN % 20 === 1) console.log('parede', p.name, p.wallN); send(c, { t: 'pos', x: p.x, z: p.z, lv: p.lv }); p.lastSt = now; return; } // atravessar paredes da base
    p.lastSt = now; p.x = nx; p.z = nz; p.y = num(m.y, -5, 40); p.lv = num(m.lv, 0, 6) | 0;
    { const H = p.hist || (p.hist = []); H.push([now, p.x, p.y, p.z]); while (H.length > 2 && now - H[0][0] > 500) H.shift(); } // onde esteve nos últimos 0,5 s (para o tiro de quem o via um pouco atrás)
    p.ts = num(m.ts, 0, 1e13, 0); p.yaw = num(m.yaw, -10, 10); p.mv = num(m.mv, 0, 3); p.an = num(m.an, 0, 15) | 0; p.w = typeof m.w === 'string' ? m.w.slice(0, 12) : '';
    const al = !!m.al, hp = num(m.hp, 0, 100, p.hp); if (al && !p.alive) { p.hp = hp; p.hd = p.vd = null; } else p.hp = Math.min(hp, p.hp + 3); p.alive = al; // a vida que o servidor tirou não volta de repente
    if (Array.isArray(m.ar)) { const a = [num(m.ar[0], 0, 4) | 0, num(m.ar[1], 0, 4) | 0]; if (a[0] !== p.ar[0]) p.hd = null; if (a[1] !== p.ar[1]) p.vd = null; p.ar = a; } return; }
  if (m.t === 'inv') { if (m.bag || m.belt) invMsg(c, p, m); return; }
  if (m.t === 'gt') { gather(c, p, m); return; }
  if (m.t === 'cr') { craft(c, p, m); return; }
  if (m.t === 'shot') { shot(c, m); return; }
  if (m.t === 'died') { // morreu (zombies, queda, outro jogador): o que tinha fica no corpo, que todos veem
    if (!p.alive && !m.force) return; p.alive = false; p.hp = 0; const L = ledOf(p), rest = { ...L.T }, it = [];
    for (const o of cleanIt(Array.isArray(m.it) ? m.it : p.inv)) { const t = tally([o]); if (fits(t, rest)) { addT(rest, t, -1); it.push(o); } }
    mkBag(p.x, p.z, num(m.y, -5, 40, p.y), p.lv, it, { body: 1, name: p.name }); p.inv = []; L.T = {}; L.inv = null; dirty = true; return; }
  if (m.t === 'clan') { clan(c, m); return; }
  if (m.t === 'ping') { send(c, { t: 'pong', k: m.k }); return; }
  // portas do mundo
  if (m.t === 'dr') { const i = num(m.i, 0, 20000, -1) | 0, o = m.o ? 1 : 0; if (i < 0) return; if (o) S.w.doors[i] = 1; else delete S.w.doors[i]; dirty = true; bcast({ t: 'dr', i, o }, x => x !== c); return; }
  // árvores e rochas: quando alguém as acaba, desaparecem para todos durante 3 min
  if (m.t === 'nd') { const k = String(m.k || ''); if (!/^[cs][0-9,:-]{1,24}$/.test(k)) return; S.w.nodes[k] = now + 180e3; dirty = true; bcast({ t: 'nd', k, ms: 180e3 }, x => x !== c); return; }
  // caixas e mochilas
  if (m.t === 'op') { const k = String(m.c || ''); if (!KEY.test(k)) return;
    for (const [k2, L] of LK) if (L.c === c.id && k2 !== k) LK.delete(k2); // só uma aberta de cada vez
    const L = lockOf(k); if (L && L.c !== c.id) { const o = players.get(L.c); return send(c, { t: 'opn', c: k, busy: o && o.p ? o.p.name : 'alguém' }); }
    if (k[0] === 'd') { const d = S.w.base.d[k.slice(1)]; if (!d || !DEP[d.k]) return send(c, { t: 'opn', c: k, gone: 1 }); if (Math.hypot(d.x - p.x, d.z - p.z) > 4 || wallCross(p.x, p.z, d.x, d.z)) return send(c, { t: 'opn', c: k, far: 1 }); if (!lkOk(d.cl, d.tok, p.tok, p.uid)) return send(c, { t: 'opn', c: k, lk: d.cl.h ? 1 : 2 }); LK.set(k, { c: c.id, t: now }); const r = S.w.ct[k]; return send(c, { t: 'opn', c: k, it: r ? r.it : [], on: d.on ? 1 : 0, el: d.on && d.last ? now - d.last : 0 }); }
    if (k[0] === 'b') { const b = S.bags[k.slice(1)]; if (!b) return send(c, { t: 'opn', c: k, gone: 1 }); if (Math.hypot(b.x - p.x, b.z - p.z) > 8) return send(c, { t: 'opn', c: k, far: 1 }); LK.set(k, { c: c.id, t: now }); return send(c, { t: 'opn', c: k, it: b.it, body: b.body }); }
    let r = S.w.ct[k]; LK.set(k, { c: c.id, t: now });
    if (!r) { r = S.w.ct[k] = { it: genLoot(k, []), next: now + 300e3 }; dirty = true; }
    else if (now > r.next && r.it.length < 2) { r.it = genLoot(k, r.it); r.next = now + 300e3; dirty = true; } // a caixa volta a ter loot passados 5 min (se estiver quase vazia)
    return send(c, { t: 'opn', c: k, it: r.it }); }
  if (m.t === 'ps' || m.t === 'cl') { const k = String(m.c || ''); if (!KEY.test(k)) return; const L = lockOf(k); if (!L || L.c !== c.id) return; const it = cleanIt(m.it);
    const old = k[0] === 'b' ? (S.bags[k.slice(1)] || {}).it || [] : (S.w.ct[k] || {}).it || [];
    if (!boxDelta(c, p, k, old, it)) { send(c, { t: 'fix', T: ledOf(p).T }); send(c, { t: 'boxfix', c: k, it: old }); if (m.t === 'cl') LK.delete(k); return; }
    store(k, it); L.t = now;
    if (k[0] === 'd') { const d = S.w.base.d[k.slice(1)]; if (d && d.k === 'fornalha') { d.last = now; if (m.fu && typeof m.fu === 'object') { const on = m.fu.on ? 1 : 0, ch = on !== d.on; d.on = on; d.until = num(m.fu.until, 0, 1e15, 0); if (ch) bb({ d: [dRow(k.slice(1), d)] }); } } }
    if (m.t === 'cl') { LK.delete(k); if (k[0] === 'b' && !it.length) bagDel(k.slice(1)); } return; }
  if (m.t === 'bag') { const x = num(m.x, -4100, 4100), z = num(m.z, -4100, 4100); if (Math.hypot(x - p.x, z - p.z) > 12) return; const it = cleanIt(m.it), t = tally(it), L = ledOf(p); if (!fits(t, L.T)) { strike(c, p, 'largar'); send(c, { t: 'fix', T: L.T }); return; } addT(L.T, t, -1); dirty = true; mkBag(x, z, num(m.y, -5, 40), num(m.lv, 0, 6) | 0, it); return; }
  if (['bp', 'bu', 'bx', 'bdo', 'bd', 'bdr', 'bdn', 'bdc', 'fu', 'lkc', 'lkset'].includes(m.t)) { baseMsg(c, p, m, now); return; }
  if (m.t === 'boom') { boom(c, p, m); return; }
  if (['cin', 'cout', 'cu', 'cf', 'ck'].includes(m.t)) { carMsg(c, p, m, now); return; }
  // granada lançada ou C4 colado: os outros por perto veem-nos (a explosão vem depois, de quem os lançou)
  if (m.t === 'thr') { if (m.k !== 'gran' && m.k !== 'c4') return; { const L = ledOf(p), ik = m.k === 'gran' ? 'granada' : 'c4'; if ((L.T[ik] || 0) < 1) { strike(c, p, 'explosivo ' + ik); send(c, { t: 'fix', T: L.T }); return; } addT(L.T, { [ik]: 1 }, -1); (p.thr || (p.thr = [])).push({ k: m.k, t: now }); dirty = true; } const P = Array.isArray(m.P) ? m.P.slice(0, 3).map(v => num(v, -4100, 4100)) : null; if (!P || P.length !== 3 || Math.hypot(P[0] - p.x, P[2] - p.z) > 6) return;
    const o = { t: 'thr', k: m.k, P, lv: num(m.lv, 0, 6) | 0 }; if (m.k === 'gran') { o.V = Array.isArray(m.V) ? m.V.slice(0, 3).map(v => num(v, -60, 60)) : [0, 0, 0]; o.base = num(m.base, 0, 30); } else { o.yaw = num(m.yaw, -10, 10); o.st = m.st ? 1 : 0; }
    bcast(o, x => x !== c && Math.hypot(x.p.x - P[0], x.p.z - P[2]) < 300); return; }
  // zombies: a primeira pessoa num mundo novo espalha-os (com as zonas do jogo) e manda a lista
  if (m.t === 'zs') { if (!c.zseed || S.w.zs.length || !Array.isArray(m.L)) return; c.zseed = false;
    S.w.zs = m.L.slice(0, 3000).map(a => { const x = num(a[0], -4100, 4100), z = num(a[1], -4100, 4100), h = num(a[3], 0, 4) | 0, v = num(a[4], 0, 4) | 0, hp = num(a[5], 1, 300, 80);
      return { x, z, lv: 0, yaw: Math.random() * 6.28, hp, mx: hp, k: num(a[2], 0, 2) | 0, h, v, h0: h, v0: v, hd: null, vd: null, hx: x, hz: z, st: 0, mv: 0, limp: 0, dt: 0, re: (360 + Math.random() * 300) * 1000, o: 0 }; });
    dirty = true; return; }
  // quem simula manda a posição dos seus zombies
  if (m.t === 'zu') { if (!Array.isArray(m.L)) return; for (const a of m.L.slice(0, 400)) { const z = S.w.zs[a[0]]; if (!z || z.o !== c.id || z.st === 3) continue;
      z.x = num(a[1], -41000, 41000) / 10; z.z = num(a[2], -41000, 41000) / 10; z.lv = num(a[3], 0, 6) | 0; z.yaw = num(a[4], -1000, 1000) / 100; z.mv = num(a[5], 0, 40) / 10; z.st = num(a[6], 0, 4) | 0; z.limp = num(a[7], 0, 20) / 10; z.ts = num(m.ts, 0, 1e13, 0); } return; }
  // dano a um zombie (de quem disparou ou bateu): a vida conta aqui
  if (m.t === 'zd') { for (const d of (Array.isArray(m.L) ? m.L : [m]).slice(0, 40)) zHit(c, p, d, now); return; }
  // ataque de um zombie a outro jogador (decidido por quem o simula)
  if (m.t === 'za') { const z = S.w.zs[m.i | 0], o = players.get(m.to | 0); if (!z || z.o !== c.id || !o || !o.p || Math.hypot(o.p.x - z.x, o.p.z - z.z) > 3) return; send(o, { t: 'zat', dmg: num(m.dmg, 0, 30) }); return; }
};

// ---------- tiros entre jogadores: trajetória com gravidade e arrasto, até à parede que o cliente viu
const hitTest = (O, D, k, L, tgt) => {
  const A = AM[k]; if (!A) return null; const [v0, dmg, pen, cd] = A; let x = O[0], y = O[1], z = O[2], vx = D[0] * v0, vy = D[1] * v0, vz = D[2] * v0, dist = 0; const h = 1 / 240;
  for (let i = 0; i < 240 * 4 && dist < L; i++) { const v = Math.hypot(vx, vy, vz), k2 = cd * v; vx -= vx * k2 * h; vy -= (vy * k2 + 9.81) * h; vz -= vz * k2 * h; const nx = x + vx * h, ny = y + vy * h, nz = z + vz * h, step = Math.hypot(nx - x, ny - y, nz - z);
    // contra cada alvo: cápsula do corpo (0,3 m) e esfera da cabeça (0,16 m); deitado = cápsula no chão
    for (const T of tgt) { const by = T.y; if (Math.abs(nx - T.x) > 3 || Math.abs(nz - T.z) > 3) continue;
      const segPt = (ax, ay, az, bx, by2, bz, px, py, pz) => { const dx = bx - ax, dy = by2 - ay, dz = bz - az, l2 = dx * dx + dy * dy + dz * dz || 1e-9; let t = ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / l2; t = Math.max(0, Math.min(1, t)); return Math.hypot(ax + dx * t - px, ay + dy * t - py, az + dz * t - pz); };
      if (T.lying) { if (segPt(x, y, z, nx, ny, nz, T.x, by + 0.25, T.z) < 0.9 && Math.abs(ny - by) < 0.6) return { T, zone: 'body', dmg, pen, v: Math.hypot(vx, vy, vz) / v0, dist }; continue; }
      const hd = segPt(x, y, z, nx, ny, nz, T.x, by + 1.62, T.z); if (hd < 0.17) return { T, zone: 'head', dmg, pen, v: Math.hypot(vx, vy, vz) / v0, dist };
      // corpo: distância do segmento ao eixo vertical (amostras)
      for (let s = 0; s <= 4; s++) { const sy = by + 0.15 + s * 0.3; if (segPt(x, y, z, nx, ny, nz, T.x, sy, T.z) < 0.3) return { T, zone: sy > 0.85 ? 'body' : 'legs', dmg, pen, v: Math.hypot(vx, vy, vz) / v0, dist }; } }
    x = nx; y = ny; z = nz; dist += step; }
  return null;
};
const shot = (c, m) => {
  const p = c.p, now = Date.now(); if (!p.alive || now - p.lastShot < 60) return; p.lastShot = now; if (!canShoot(p, String(m.k || ''))) { strike(c, p, 'tiro sem arma ' + m.k); return; }
  const O = Array.isArray(m.o) ? m.o.map(v => num(v, -4100, 4100)) : null, D = Array.isArray(m.d) ? m.d.map(v => num(v, -1, 1)) : null; if (!O || !D || O.length !== 3 || D.length !== 3) return;
  if (Math.hypot(O[0] - p.x, O[2] - p.z) > 3) return; // a bala tem de sair de perto de ti
  const dl = Math.hypot(D[0], D[1], D[2]) || 1; D[0] /= dl; D[1] /= dl; D[2] /= dl;
  const k = String(m.k || ''), n = Math.min(8, num(m.n, 1, 8, 1) | 0), L = num(m.L, 0, 900, 300), sup = !!m.sup;
  // para os outros: o som e o rasto do tiro
  bcast({ t: 'fx', id: c.id, o: O, d: D, sup }, o => o !== c && Math.hypot(o.p.x - O[0], o.p.z - O[2]) < (sup ? 60 : 400));
  const myClan = p.clan; const tgt = [];
  // quem dispara vê os outros cerca de 0,1–0,3 s atrás (o caminho da rede e a suavização): conta onde o alvo está e onde esteve nesse tempo
  for (const o of players.values()) if (o !== c && o.p && o.p.alive && (o.p.lv || 0) === (p.lv || 0) && !(myClan && o.p.clan === myClan) && Math.hypot(o.p.x - O[0], o.p.z - O[2]) < L + 3) {
    // o caminho que fez nos últimos 0,45 s, com pontos a cada ~0,25 m (quem dispara vê-o algures nesse caminho)
    const P = (o.p.hist || []).filter(h => now - h[0] <= 450).map(h => [h[1], h[2], h[3]]); P.push([o.p.x, o.p.y, o.p.z]); tgt.push({ x: o.p.x, y: o.p.y, z: o.p.z, c: o });
    for (let i = P.length - 1; i > 0; i--) { const a = P[i], b = P[i - 1], dd = Math.hypot(b[0] - a[0], b[2] - a[2]); if (dd < 0.15 || dd > 6) continue; const n = Math.min(8, Math.ceil(dd / 0.25)); for (let k = 1; k <= n; k++) { const f = k / n; tgt.push({ x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, z: a[2] + (b[2] - a[2]) * f, c: o }); } } }
  for (const [tok, s] of Object.entries(S.sleepers)) if ((s.lv || 0) === (p.lv || 0) && !(myClan && s.clan === myClan) && Math.hypot(s.x - O[0], s.z - O[2]) < L + 3) tgt.push({ x: s.x, y: s.y || 0, z: s.z, sl: tok, lying: true });
  if (!tgt.length) return;
  // cada bala segue a direção que o jogador viu no rasto (com o desvio da arma), se não fugir mais do que 0,3 rad da mira; e para onde o cliente a viu parar (parede ou zombie)
  const ds = Array.isArray(m.ds) ? m.ds.slice(0, n) : null, Ls = Array.isArray(m.Ls) ? m.Ls : null;
  for (let i = 0; i < n; i++) {
    let d = D; if (ds && Array.isArray(ds[i]) && ds[i].length === 3) { const q = ds[i].map(v => num(v, -1, 1)), ql = Math.hypot(q[0], q[1], q[2]) || 1; q[0] /= ql; q[1] /= ql; q[2] /= ql; if (q[0] * D[0] + q[1] * D[1] + q[2] * D[2] > Math.cos(0.3)) d = q; }
    else if (n > 1) { const sp = 0.02; d = [D[0] + (Math.random() - 0.5) * sp * 2, D[1] + (Math.random() - 0.5) * sp * 2, D[2] + (Math.random() - 0.5) * sp * 2]; }
    const Li = Ls ? Math.min(L, num(Ls[i], 0, 900, L)) : L;
    const h = hitTest(O, d, k, Li, tgt); if (!h) continue; const T = h.T;
    // chumbo perde força com a distância (como no jogo, até 35 m); balas pela velocidade que ainda levam
    let dmg = h.dmg * (n > 1 ? Math.min(1, Math.max(0.25, 1 - h.dist / 35)) : Math.max(0.3, Math.pow(h.v, 1.5))) * (0.9 + Math.random() * 0.2);
    if (T.sl) { const s = S.sleepers[T.sl]; if (!s) continue; s.hp = (s.hp ?? 100) - dmg; if (s.hp <= 0) { delete S.sleepers[T.sl]; if (S.tokens[T.sl]) S.tokens[T.sl].killed = true; if (S.led[T.sl]) { S.led[T.sl].T = {}; S.led[T.sl].inv = null; } mkBag(s.x, s.z, s.y || 0, s.lv || 0, s.inv, { body: 1, name: s.name }); bcast({ t: 'sleep', list: sleepList() }); send(c, { t: 'hitc', zone: h.zone, kill: true, name: s.name }); } else send(c, { t: 'hitc', zone: h.zone }); dirty = true; continue; }
    // como nos zombies: a proteção trava a bala (ainda magoa) e gasta-se até partir. Pistola: 1–2 tiros na cabeça, 3 no peito (4 com colete)
    const v = T.c.p, [helm, vest] = v.ar || [0, 0]; let pop = null;
    if (h.zone === 'head') { if (helm && h.pen <= helm) { v.hd = (v.hd ?? 20) - dmg; dmg *= 0.8; if (v.hd <= 0) { pop = 'head'; v.ar[0] = 0; v.hd = null; } } else dmg = n > 1 ? dmg * 2.5 : 999; }
    else if (h.zone === 'body') { dmg *= 1.2; if (vest && h.pen <= vest) { v.vd = (v.vd ?? (vest >= 3 ? 50 : 25)) - dmg; dmg *= 0.8; if (v.vd <= 0) { pop = 'vest'; v.ar[1] = 0; v.vd = null; } } else if (vest) dmg *= 0.85; }
    else dmg *= 0.6;
    v.hp = Math.max(0, v.hp - dmg); const kill = v.hp <= 0; if (kill) v.alive = false;
    send(T.c, { t: 'hit', by: p.name, dmg: +dmg.toFixed(1), zone: h.zone, hp: v.hp, pop });
    send(c, { t: 'hitc', on: T.c.id, zone: h.zone, kill, name: v.name });
  }
};

// ---------- clãs: sem limite de membros; um código para entrar
const clan = (c, m) => {
  const p = c.p;
  if (m.a === 'create') { const nome = String(m.nome || '').trim().slice(0, 20); if (nome.length < 3) return send(c, { t: 'clan', erro: 'O nome do clã tem de ter 3 a 20 letras.' }); leave(p); const id = rid(6), codigo = rid(5).toUpperCase().replace(/[^A-Z0-9]/g, 'X'); S.clans[id] = { nome, codigo, membros: [p.name], t: Date.now() }; p.clan = id; if (S.tokens[p.tok]) S.tokens[p.tok].clan = id; dirty = true; }
  else if (m.a === 'join') { const cod = String(m.codigo || '').trim().toUpperCase(); const id = Object.keys(S.clans).find(k => S.clans[k].codigo === cod); if (!id) return send(c, { t: 'clan', erro: 'Não há nenhum clã com esse código.' }); leave(p); S.clans[id].membros.push(p.name); p.clan = id; if (S.tokens[p.tok]) S.tokens[p.tok].clan = id; dirty = true; }
  else if (m.a === 'leave') { leave(p); }
  send(c, { t: 'clan', info: clanInfo(p.clan) }); bcast({ t: 'pclan', id: c.id, clan: p.clan });
};
const leave = p => { if (!p.clan) return; const C = S.clans[p.clan]; if (C) { C.membros = C.membros.filter(n => n !== p.name); if (!C.membros.length) delete S.clans[p.clan]; } if (S.tokens[p.tok]) delete S.tokens[p.tok].clan; p.clan = null; dirty = true; };

// ---------- imagens do mundo: jogadores 20 por segundo, zombies e carros 10 (só o que está perto; o clã sempre, para o mapa)
let tickN = 0;
const ZR = 300; // zombies que cada um recebe (metros): até onde a luneta deixa ver bem
setInterval(() => {
  const L = [...players.values()].filter(c => c.p), full = (++tickN & 1) === 0;
  for (const c of L) {
    const out = []; for (const o of L) { if (o === c) continue; const d = Math.hypot(o.p.x - c.p.x, o.p.z - c.p.z), mate = c.p.clan && o.p.clan === c.p.clan; if (d > 320 && !mate) continue; out.push([o.id, +o.p.x.toFixed(2), +o.p.z.toFixed(2), +o.p.y.toFixed(2), o.p.lv, +o.p.yaw.toFixed(2), +o.p.mv.toFixed(2), o.p.an, o.p.w, Math.round(o.p.hp), o.p.alive ? 1 : 0, d > 320 ? 1 : 0, o.p.ar, Math.round(o.p.ts || 0)]); }
    const msg = { t: 's', ps: out };
    // zombies: só os que mudaram desde a última vez (e os que saíram de perto)
    if (full && c.zc) { const u = [], seen = new Set(); const zs = S.w.zs;
      for (let i = 0; i < zs.length; i++) { const z = zs[i], own = z.o === c.id; if (!own && Math.abs(z.x - c.p.x) > ZR) continue; if (!own && (Math.abs(z.z - c.p.z) > ZR || Math.hypot(z.x - c.p.x, z.z - c.p.z) > ZR)) continue;
        seen.add(i); const row = zRow(i, z, own), sig = zSig(z, own, row); if (c.zc.get(i) !== sig) { c.zc.set(i, sig); u.push(row); } }
      const g = []; for (const i of c.zc.keys()) if (!seen.has(i)) { c.zc.delete(i); g.push(i); }
      if (u.length) msg.zu = u; if (g.length) msg.zg = g; }
    if (full && c.cc) { const u = [], seen = new Set(); for (const [id, car] of Object.entries(S.w.cars)) { if (Math.hypot(car.x - c.p.x, car.z - c.p.z) > 400 && car.s.indexOf(c.id) < 0) continue; seen.add(id); const row = cRow(id, car), drv = car.s[0] === c.id, sig = drv ? 'd' + row.slice(5, 11).join() : row.join(); if (c.cc.get(id) !== sig) { c.cc.set(id, sig); u.push(row); } }
      const g = []; for (const id of c.cc.keys()) if (!seen.has(id)) { c.cc.delete(id); g.push(id); } if (u.length) msg.cu = u; if (g.length) msg.cg = g; }
    send(c, msg);
  }
}, 50);
// quem simula cada zombie: o jogador mais perto (até 100 m), e só muda quando outro fica bem mais perto
setInterval(() => {
  const L = [...players.values()].filter(c => c.p); const now = Date.now();
  for (const z of S.w.zs) {
    if (z.st === 3) { z.o = 0; if (now - z.dt > z.re && zNear(z.hx, z.hz, 70) === 0) { Object.assign(z, { x: z.hx, z: z.hz, lv: 0, hp: z.mx, st: 0, mv: 0, limp: 0, dt: 0, h: z.h0, v: z.v0, hd: null, vd: null, re: (360 + Math.random() * 300) * 1000 }); dirty = true; } continue; }
    let best = null, bd = 1e9, cur = null, cd = 1e9;
    for (const c of L) { const d = Math.hypot(c.p.x - z.x, c.p.z - z.z); if (d < bd) { bd = d; best = c; } if (c.id === z.o) { cur = c; cd = d; } }
    if (cur && cd < 110 && cd < bd + 25) continue;
    if (best && bd < 100) { z.o = best.id; continue; }
    if (z.o) { z.o = 0; if (z.st) z.st = 0; z.mv = 0; } // longe de todos: fica parado onde está
  }
}, 500);
// fornalhas: apagam-se quando acaba a madeira (quem a fechou disse até quando dava)
setInterval(() => { const now = Date.now(), up = []; for (const [id, d] of Object.entries(S.w.base.d)) if (d.on && d.until && now > d.until && !lockOf('d' + id)) { d.on = 0; up.push(dRow(id, d)); } if (up.length) bb({ d: up }); }, 5000);
// mundo sem zombies (por exemplo, quem os devia espalhar tinha o jogo antigo): pede a outro jogador ligado
setInterval(() => { if (S.w.zs.length) return; const now = Date.now(), L = [...players.values()].filter(c => c.p); if (!L.length || L.some(c => c.zseed && now - (c.zseedT || 0) < 15000)) return;
  for (const c of L) c.zseed = false; const c = L[Math.floor(Math.random() * L.length)]; c.zseed = true; c.zseedT = now; send(c, { t: 'zseed' }); }, 5000);
setInterval(() => { const now = Date.now(); for (const car of Object.values(S.w.cars)) if (car.hp <= 0 && now - car.dead > 1200e3 && zNear(car.sx, car.sz, 30) === 0) { Object.assign(car, { x: car.sx, z: car.sz, yaw: car.syaw, v: 0, hp: 400, fuel: +(10 + Math.random() * 20).toFixed(1), dead: 0, s: [0, 0, 0, 0] }); dirty = true; } }, 30000);
// tempo: chuva de 3 a 7 min, a cada 10 a 25 min (igual para todos)
setInterval(() => { const now = Date.now(), X = S.w.wx; if (now < X.next) return;
  if (X.r > 0) { X.r = 0; X.next = now + (600 + Math.random() * 900) * 1000; } else { X.r = +(0.5 + Math.random() * 0.5).toFixed(2); X.next = now + (180 + Math.random() * 240) * 1000; }
  dirty = true; bcast({ t: 'wx', r: X.r }); }, 5000);
// limpezas: quem dorme há mais de 3 dias sai do mapa; mochilas velhas desaparecem (corpos 25 min, sacos 15 min); árvores voltam
setInterval(() => { const now = Date.now(); let ch = false;
  for (const [k, s] of Object.entries(S.sleepers)) if (now - s.t > SLEEP_MS) { delete S.sleepers[k]; ch = true; }
  for (const [id, b] of Object.entries(S.bags)) if (now - b.t > (b.body ? 1500e3 : 900e3) && !lockOf('b' + id)) bagDel(id);
  for (const [k, u] of Object.entries(S.w.nodes)) if (u < now) { delete S.w.nodes[k]; dirty = true; }
  for (const [k, t] of Object.entries(S.tokens)) if (now - t.t > 60 * 24 * 3600e3 && !S.sleepers[k]) delete S.tokens[k];
  if (ch) { dirty = true; bcast({ t: 'sleep', list: sleepList() }); } }, 30000);
// os zombies mexem-se sempre: grava de minuto a minuto mesmo sem outras mudanças
setInterval(() => { if (S.w.zs.length) dirty = true; }, 60000);
process.on('SIGTERM', () => { dirty = true; save(); process.exit(0); });
srv.listen(PORT, '127.0.0.1', () => console.log('kurogane: a ouvir em', PORT));
