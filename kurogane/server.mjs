// Servidor de jogo do Kurogane: jogadores ligados uns aos outros, PvP decidido aqui, personagens a dormir
// quando saem (dá para as matar e levar o que tinham), mochilas no chão partilhadas e clãs.
// Só módulos do Node (sem dependências). WebSocket feito à mão (RFC 6455, mensagens de texto pequenas).
import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ITEMS, LOOT, RECIPES, ammoOf } from './jogo/src/items.js';
import { Grid, mkItem, rollLoot } from './jogo/src/bag.js';
import { VT, vt } from './jogo/src/vtypes.js';
import { TRADERS, PRICE, SELL, TRADE_R } from './jogo/src/traders.js';
import { makeArena } from './arena.mjs';
import { capsules, hitCapsules, rewind, histPush } from './jogo/src/hitbox.js';

const PORT = +process.env.PORT || 3190, DIR = process.env.STATE_DIRECTORY || path.join(process.cwd(), 'dados');
const FILE = path.join(DIR, 'estado.json'), SLEEP_MS = 72 * 3600e3, BAG_MS = 45 * 60e3, MAXP = 60;
// munições: velocidade (m/s), dano, perfuração, arrasto, bagos
const AM = { a9: [360, 30, 1.5, 0.0018], a9s: [300, 27, 1.3, 0.002], a556: [940, 34, 2.8, 0.0012], a762: [715, 40, 2.6, 0.0011], a308: [850, 95, 3.4, 0.0007], a357: [440, 48, 2, 0.0016], c12: [400, 16, 1, 0.004, 8], c12s: [490, 85, 2.2, 0.0022], a408: [900, 140, 4, 0.0005], a50: [850, 175, 5, 0.0006], a754: [825, 58, 3.2, 0.0008] };
const GKS = ['head', 'vest', 'suit', 'eyes', 'back']; // equipamento à vista (ghillie e visão noturna incluídos)
const HEAVY = new Set(['a408', 'a50']), CARX = { a50: 3, a408: 1.4 }; // calibres grossos: som próprio; a .50 desfaz veículos
const NAME = /^[A-Za-z0-9_À-ÖØ-öø-ÿ-]{3,16}$/;

// ---------- estado (gravado em disco)
const W0 = () => ({ wv: null, cyc0: Date.now() - 900e3, wx: { r: 0, next: Date.now() + 300e3 }, doors: {}, nodes: {}, ct: {}, zs: [], base: { p: {}, d: {} }, locks: {}, cars: {} });
let S = { sleepers: {}, bags: {}, clans: {}, tokens: {}, w: W0(), led: {}, roles: {}, bans: {}, stats: {}, admLog: [] };
try { S = { ...S, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch (e) { }
S.roles = S.roles || {}; S.bans = S.bans || {}; S.stats = S.stats || {}; S.admLog = S.admLog || [];
S.w = { ...W0(), ...(S.w || {}) }; for (const z of S.w.zs) z.o = 0; for (const c of Object.values(S.w.cars)) { c.s = vt(c.k).seats.map(() => 0); c.v = 0; }
if (!S.lkMig) { S.lkMig = Date.now(); for (const P of Object.values(S.w.base.p || {})) if (P.t === 'porta' && !P.cl) P.cl = { h: null, a: [] }; for (const d of Object.values(S.w.base.d || {})) if ((d.k === 'bau' || d.k === 'bauG') && !d.cl) d.cl = { h: null, a: [] }; }
// mochilas antigas (só de mortes): passam ao formato novo
for (const b of Object.values(S.bags)) if (b.items && !b.it) { b.it = b.items; delete b.items; b.body = 1; b.y = b.y ?? 0; }
// contas (anti-batota): quem já jogava antes fica com o que tinha na primeira vez que se liga
S.led = S.led || {}; if (!S.ledSince) { S.ledSince = Date.now(); for (const t of Object.values(S.tokens)) t.g = 1; }
let dirty = false; const save = () => { if (!dirty) return; dirty = false; try { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(FILE + '.tmp', JSON.stringify(S)); fs.renameSync(FILE + '.tmp', FILE); } catch (e) { console.error('gravar', e.message); } };
setInterval(save, 15000);
const now0 = () => Date.now();
const rid = n => crypto.randomBytes(n).toString('base64url');

// ---------- WebSocket mínimo
const players = new Map(); let nextId = 1;
const send = (c, o) => { if (c.dead) return; const b = Buffer.from(JSON.stringify(o)); let h; if (b.length < 126) h = Buffer.from([0x81, b.length]); else if (b.length < 65536) { h = Buffer.alloc(4); h[0] = 0x81; h[1] = 126; h.writeUInt16BE(b.length, 2); } else { h = Buffer.alloc(10); h[0] = 0x81; h[1] = 127; h.writeBigUInt64BE(BigInt(b.length), 2); } try { c.sock.write(Buffer.concat([h, b])); } catch (e) { } };
const ARENA = makeArena({ send });
const bcast = (o, pred = () => true) => { for (const c of players.values()) if (c.p && pred(c)) send(c, o); };
const srv = http.createServer((req, res) => {
  if (req.url === '/saude') { res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'no-store' }); res.end(JSON.stringify({ ok: true, arena: ARENA.count(), arenaN: ARENA.counts(), arenaB: ARENA.bots(), jogadores: [...players.values()].filter(c => c.p).length, a_dormir: Object.keys(S.sleepers).length, mochilas: Object.keys(S.bags).length, clas: Object.keys(S.clans).length, zombies: S.w.zs.filter(z => z.st !== 3).length, caixas: Object.keys(S.w.ct).length, carros: Object.keys(S.w.cars).length, mapa: mapOk(), equipa: Object.keys(S.roles).length, admin_cod: !!ADMH })); return; }
  res.writeHead(404); res.end();
});
srv.on('upgrade', (req, sock) => {
  const key = req.headers['sec-websocket-key'];
  const isA = req.url.startsWith('/arena'); // arena PvP de Tóquio: sala à parte
  if ((!req.url.startsWith('/ws') && !isA) || !key || (isA ? ARENA.count() >= 40 : players.size >= MAXP * 2)) { sock.destroy(); return; }
  const acc = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${acc}\r\n\r\n`);
  sock.setNoDelay(true);
  const c = { id: nextId++, sock, buf: Buffer.alloc(0), p: null, rate: 0, rt: Date.now(), dead: false, ip: String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim().slice(0, 64) };
  if (isA) { c.arena = true; ARENA.add(c); } else players.set(c.id, c);
  sock.on('data', d => { c.buf = Buffer.concat([c.buf, d]); if (c.buf.length > 1 << 17) return drop(c); for (;;) { const m = frame(c); if (m === null) break; if (m === false) return drop(c); } });
  sock.on('close', () => drop(c)); sock.on('error', () => drop(c));
});
const frame = c => {
  const b = c.buf; if (b.length < 2) return null; const op = b[0] & 15, masked = b[1] & 128; let len = b[1] & 127, o = 2;
  if (len === 126) { if (b.length < 4) return null; len = b.readUInt16BE(2); o = 4; } else if (len === 127) { if (b.length < 10) return null; const L = b.readBigUInt64BE(2); if (L > 65536n) return false; len = Number(L); o = 10; }
  if (len > 65536 || !masked) return false; if (b.length < o + 4 + len) return null;
  const mk = b.subarray(o, o + 4), data = Buffer.from(b.subarray(o + 4, o + 4 + len)); for (let i = 0; i < len; i++) data[i] ^= mk[i & 3]; c.buf = b.subarray(o + 4 + len);
  if (op === 8) return false; if (op === 9) { try { c.sock.write(Buffer.concat([Buffer.from([0x8a, data.length]), data])); } catch (e) { } return true; } if (op !== 1) return true;
  const now = Date.now(); if (now - c.rt > 1000) { c.rt = now; c.rate = 0; } if (++c.rate > 200) return true; // demasiadas mensagens: ignora (30 posições + 30 do carro + tiros + zombies por segundo cabem à vontade)
  let m; try { m = JSON.parse(data.toString('utf8')); } catch (e) { return true; } try { if (c.arena) ARENA.msg(c, m); else onMsg(c, m); } catch (e) { console.error('msg', e.message); } return true;
};
const drop = c => {
  if (c.dead) return; c.dead = true; try { c.sock.destroy(); } catch (e) { } if (c.arena) { ARENA.drop(c); return; } players.delete(c.id);
  for (const [k, L] of LK) if (L.c === c.id) LK.delete(k);
  for (const z of S.w.zs) if (z.o === c.id) z.o = 0;
  for (const car of Object.values(S.w.cars)) { const i = car.s.indexOf(c.id); if (i >= 0) { car.s[i] = 0; if (i === 0) { car.v = 0; car.alt = vt(car.k).fly ? (car.pad || 0) : 0; } } } /* helicóptero num telhado fica lá */
  const p = c.p; if (!p) return; if (S.tokens[p.tok]) S.tokens[p.tok].t = Date.now();
  // quem sai fica a dormir onde estava (com o que tinha), a não ser que já estivesse morto
  if (p.alive && p.tok) { S.sleepers[p.tok] = { x: p.x, z: p.z, y: p.y, lv: p.lv, yaw: p.yaw, name: p.name, look: p.look, inv: p.inv || [], hp: p.hp, ar: p.ar, clan: p.clan || null, t: Date.now(), hid: p.invis ? 1 : 0 }; dirty = true; bcast({ t: 'sleep', list: sleepList() }); }
  if (!p.invis) bcast({ t: 'left', id: c.id });
};
const sleepList = () => Object.entries(S.sleepers).filter(([, s]) => !s.hid).map(([k, s]) => [k.slice(0, 8), +s.x.toFixed(1), +s.z.toFixed(1), s.lv || 0, +(s.yaw || 0).toFixed(2), s.name, s.look || {}, s.clan || null]);
const bagRow = (id, b) => [id, +b.x.toFixed(2), +b.z.toFixed(2), +(b.y || 0).toFixed(2), b.lv || 0, b.body | 0, b.name || '']; // body: 1 = corpo, 2 = caixa do avião
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
const cleanInv = m => ({ bag: cleanIt(m.bag), belt: (Array.isArray(m.belt) ? m.belt.slice(0, 6) : []).map(o => o ? cleanIt([o])[0] || null : null), eq: Object.fromEntries(['head', 'eyes', 'suit', 'vest', 'back'].map(s => [s, m.eq && m.eq[s] ? cleanIt([m.eq[s]])[0] || null : null])) });
const strike = (c, p, what) => { p.strikes = (p.strikes || 0) + 1; if (p.strikes <= 5 || p.strikes % 20 === 0) console.log('batota?', p.name, what, p.strikes); };
// o inventário do jogo: se tiver coisas que o servidor não viu chegar, manda corrigir
const invMsg = (c, p, m) => { const L = ledOf(p), inv = cleanInv(m), C = tally(flat(inv));
  if (L.g) { L.T = C; L.inv = inv; L.g = false; if (S.tokens[p.tok]) delete S.tokens[p.tok].g; dirty = true; return; } // personagens de antes das contas: aceita-se o que tinham
  const extra = diffT(C, L.T); if (Object.keys(extra).length) { strike(c, p, 'inv ' + JSON.stringify(extra)); send(c, { t: 'fix', T: L.T }); return; }
  if (L.pend && Date.now() - L.pend.t < 8000) { for (const k in L.pend.k) if ((C[k] || 0) < (L.T[k] || 0)) C[k] = L.T[k]; } else L.pend = null; // o que a equipa deu há pouco ainda pode não ter chegado ao inventário que o jogo mandou
  L.T = C; L.inv = inv; p.inv = flat(inv).map(({ x, y, ...r }) => r); dirty = true; };
// juntar recursos (árvores e rochas): no máximo o que dá para apanhar a bater sem parar
const GATHER = { madeira: 1, pedraR: 1, metal: 1, enxofre: 1, pedra: 1, tecido: 1 };
const NODEY = new Map(); // quanto já saiu de cada árvore ou rocha (volta a crescer em 3 min)
const gather = (c, p, m) => { const k = String(m.k || ''), n = num(m.n, 0, 200) | 0, nk = String(m.nk || ''); if (!GATHER[k] || !n) return; const now = Date.now(), b = p.gb || (p.gb = { v: 3000, t: now }); b.v = Math.min(3000, b.v + (now - b.t) / 60000 * 3000); b.t = now;
  if (!/^[cs][0-9,:-]{1,24}$/.test(nk)) { strike(c, p, 'recursos sem árvore'); return; }
  let y = NODEY.get(nk); if (!y || now - y.t > 180e3) { y = { v: 0, t: now }; NODEY.set(nk, y); } if (NODEY.size > 50000) NODEY.clear();
  if (b.v < n || y.v + n > 520) { strike(c, p, 'recursos ' + k + ' ' + n); return; } b.v -= n; y.v += n; addT(ledOf(p).T, { [k]: n }); dirty = true; };
// fabricar: receita do jogo, com material e (se for preciso) bancada a menos de 4 m
const craft = (c, p, m) => { const r = RECIPES[m.i | 0]; if (!r) return; const L = ledOf(p);
  if (r.b) { let lv = 0; for (const d of Object.values(S.w.base.d)) { const b = /^bancada([123])$/.exec(d.k); if (b && Math.hypot(d.x - p.x, d.z - p.z) < 5) lv = Math.max(lv, +b[1]); } if (lv < r.b) { strike(c, p, 'bancada ' + r.k); send(c, { t: 'fix', T: L.T }); return; } }
  if (!fits(r.need, L.T)) { strike(c, p, 'material ' + r.k); send(c, { t: 'fix', T: L.T }); return; }
  addT(L.T, r.need, -1); addT(L.T, { [r.k]: r.n || 1 }); dirty = true; if (now0() - (p.cxT || 0) > 1500) { p.cxT = now0(); addXP(p, 2); } };
// caixas: o que sai vai para quem a tem aberta; o que entra tem de ser dele. Na fornalha, a madeira vira carvão e o minério metal.
const boxDelta = (c, p, k, oldIt, newIt) => { const O = tally(oldIt), N = tally(newIt); const out = diffT(O, N), inn = diffT(N, O);
  if (k[0] === 'd') { const d = S.w.base.d[k.slice(1)]; if (d && (d.k === 'fornalha' || d.k === 'fogueira')) for (const [a, b] of d.k === 'fornalha' ? [['carvao', 'madeira'], ['metalR', 'metal'], ['carneA', 'carneC']] : [['carneA', 'carneC']]) { const q = Math.min(inn[a] || 0, out[b] || 0); if (q) { inn[a] -= q; out[b] -= q; if (!inn[a]) delete inn[a]; if (!out[b]) delete out[b]; } } }
  const L = ledOf(p); if (!fits(inn, L.T)) { strike(c, p, 'caixa ' + JSON.stringify(diffT(inn, L.T))); return false; }
  addT(L.T, inn, -1); addT(L.T, out); dirty = true; return true; };
// loot das caixas do mundo: gerado aqui (com as tabelas do jogo), não no telemóvel
const genLoot = (k, prev) => { const t = S.w.ctab && S.w.ctab[+k.slice(1)]; if (!t || !LOOT[t[0]]) return prev || []; const g = new Grid(t[1], t[2]); for (const o of prev || []) { const it = mkItem(o.k, o.n); Object.assign(it, o); g.insert(it); } rollLoot(t[0], g); return g.list.map(e => encSrv(e.it, e.x, e.y)); };
const encSrv = (it, x, y) => { const o = { k: it.k, n: it.n }; for (const f of ['ammo', 'am', 'ak', 'mg']) if (it[f] !== undefined && it[f] !== null) o[f] = it[f]; if (it.att && Object.keys(it.att).length) o.att = it.att; if (it.r) o.r = 1; if (x !== undefined) { o.x = x; o.y = y; } return o; };
// tiros: só com uma arma que dispare essa munição
const canShoot = (p, k) => { if (p.test) return true; const T = ledOf(p).T; for (const g of Object.keys(T)) { const G2 = ITEMS[g] && ITEMS[g].gun; if (G2 && ammoOf(G2).includes(k)) return true; } return false; };
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
  const id = rid(6); S.bags[id] = { x, z, y, lv, it, body: o.body | 0, name: o.name || '', t: Date.now() }; dirty = true;
  bcast({ t: 'bg', add: [bagRow(id, S.bags[id])] }); return id;
};

// ---------- bases partilhadas: peças (fundação, paredes, portas, janelas, tetos) e objetos (baús, fornalha, bancadas, camas)
// Só o dono e o clã dele mexem numa base (construir ao lado, melhorar, demolir, abrir as portas); os explosivos partem tudo.
const CELL = 3, TIER_HP = [250, 600, 1200], BED_CD = { cama: 120e3, saco: 300e3 };
const DEP = { bau: 300, bauG: 500, fornalha: 500, bancada1: 400, bancada2: 600, bancada3: 900, cama: 200, saco: 80, candeeiro: 150, fogueira: 100 };
const EXB = { gran: { br: 1.8, bdmg: 40 }, c4: { br: 1.7, bdmg: 560 } };
const uidOf = tok => 'u' + crypto.createHash('sha1').update(tok).digest('hex').slice(0, 10);
const ally = (a, b) => a === b || !!(S.tokens[a] && S.tokens[a].clan && S.tokens[b] && S.tokens[a].clan === S.tokens[b].clan);
const BK = /^(f|t|h|v):(-?\d{1,4}):(-?\d{1,4})$/;
const clanTok = tok => (S.tokens[tok] && S.tokens[tok].clan) || 0;
const pRow = (k, P) => [k, P.t, P.tier, Math.round(P.hp), P.o ? 1 : 0, P.u, P.cl ? (P.cl.h ? 1 : 2) : 0, clanTok(P.tok)]; // último: 0 sem fechadura, 1 com código, 2 antiga (só dono e clã)
const dRow = (id, d) => [id, d.k, +d.x.toFixed(2), +d.z.toFixed(2), +d.yaw.toFixed(3), +d.y.toFixed(2), Math.round(d.hp), d.on ? 1 : 0, d.u, d.name || null, d.cd || 0, d.cl ? (d.cl.h ? 1 : 2) : 0, clanTok(d.tok)];
const baseRows = () => ({ p: Object.entries(S.w.base.p).map(([k, P]) => pRow(k, P)), d: Object.entries(S.w.base.d).map(([id, d]) => dRow(id, d)) });
const bb = o => { dirty = true; bcast({ t: 'bb', ...o }); };
const no = (c, a, k, e) => send(c, { t: 'bno', a, k, e });
const fundAt = (i, j) => S.w.base.p['f:' + i + ':' + j];
// ---------- proteção contra grief: ninguém constrói colado à base de outro, nem a cerca, nem lhe põe objetos ou camas à porta
const GAP_F = 3, GAP_D = 8, GAP_DD = 4; // casas livres entre bases de donos diferentes; metros entre um objeto solto e a base de outro; e entre objetos de donos diferentes
const fundsNear = (x, z, r) => { const out = [], i0 = Math.floor((x - r) / CELL), i1 = Math.floor((x + r) / CELL), j0 = Math.floor((z - r) / CELL), j1 = Math.floor((z + r) / CELL); for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const F = fundAt(i, j); if (F) out.push([i, j, F]); } return out; };
const distCell = (x, z, i, j) => Math.hypot(Math.max(i * CELL - x, 0, x - (i + 1) * CELL), Math.max(j * CELL - z, 0, z - (j + 1) * CELL));
// a nova fundação (ni, nj) do dono tok fecharia alguma base vizinha? (caminho a pé, sem diagonais, de lá até longe)
const wouldEnclose = (ni, nj, tok) => { const RW = 30, done = new Map();
  const reach = (vi, vj, vtok, extra) => { const blocked = (i, j) => { if (extra && i === ni && j === nj) return true; const F = fundAt(i, j); return !!F && !ally(F.tok, vtok); };
    const q = [[vi, vj]], vis = new Set([vi + ':' + vj]); while (q.length) { const [i, j] = q.pop(); if (Math.abs(i - vi) >= RW || Math.abs(j - vj) >= RW) return [true, vis]; for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) { const kk = a + ':' + b; if (vis.has(kk) || blocked(a, b)) continue; vis.add(kk); q.push([a, b]); } } return [false, vis]; };
  for (const [vi, vj, V] of fundsNear(ni * CELL + 1.5, nj * CELL + 1.5, RW * CELL)) { if (ally(V.tok, tok)) continue; const D = done.get(V.tok); if (D && D.has(vi + ':' + vj)) continue;
    const [ok, vis] = reach(vi, vj, V.tok, true); done.set(V.tok, D ? new Set([...D, ...vis]) : vis);
    if (!ok && reach(vi, vj, V.tok, false)[0]) return true; } // só conta se for esta fundação a fechar o caminho
  return false; };
const depNearOther = (x, z, tok) => { for (const [i, j, F] of fundsNear(x, z, GAP_D + CELL)) if (!ally(F.tok, tok) && distCell(x, z, i, j) < GAP_D) return 'Muito perto da base de outro jogador'; for (const d of Object.values(S.w.base.d)) if (!ally(d.tok, tok) && Math.hypot(d.x - x, d.z - z) < GAP_DD) return 'Muito perto das coisas de outro jogador'; return null; };
// onde se pode construir: o mapa vem de mapa.json (exportado do jogo); só vale se for da mesma versão do mundo
let MAPA = null; try { MAPA = JSON.parse(fs.readFileSync(new URL('./mapa.json', import.meta.url), 'utf8')); MAPA.grid = new Map(); for (const r of [...MAPA.rects, ...MAPA.pads]) for (let ix = Math.floor((r[0] - 2) / 16); ix <= Math.floor((r[2] + 2) / 16); ix++) for (let iz = Math.floor((r[1] - 2) / 16); iz <= Math.floor((r[3] + 2) / 16); iz++) { const k = ix * 1000 + iz; if (!MAPA.grid.has(k)) MAPA.grid.set(k, []); MAPA.grid.get(k).push(r); } } catch (e) { console.log('mapa.json:', e.message); }
const mapOk = () => !!MAPA && S.w.wv === MAPA.wv;
// água (lagos e rios), igual à do jogo: lagos com margem ondulada, rios como linhas com largura
const lakeRS = (L, a) => 1 + 0.1 * Math.sin(3 * a + L[4]) + 0.06 * Math.sin(5 * a + L[5]) + 0.03 * Math.sin(9 * a + L[4] * 2);
const wetS = (x, z, m = 0) => { const Wt = MAPA && MAPA.water; if (!Wt) return false;
  for (const L of Wt.lakes) { const dx = (x - L[0]) / L[2], dz = (z - L[1]) / L[3]; if (dx * dx + dz * dz > 2.2) continue; const a = Math.atan2(dz, dx), r = lakeRS(L, a), ex = Math.cos(a) * r * L[2] + Math.sign(Math.cos(a)) * m, ez = Math.sin(a) * r * L[3] + Math.sign(Math.sin(a)) * m; if ((x - L[0]) ** 2 + (z - L[1]) ** 2 < ex * ex + ez * ez) return true; }
  for (const P of Wt.rivers) for (let i = 0; i < P.length - 1; i++) { const [ax, az, aw] = P[i], [bx, bz, bw] = P[i + 1]; if (x < Math.min(ax, bx) - 40 || x > Math.max(ax, bx) + 40 || z < Math.min(az, bz) - 40 || z > Math.max(az, bz) + 40) continue; const vx = bx - ax, vz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz))), hw = aw + (bw - aw) * t + m; if ((ax + vx * t - x) ** 2 + (az + vz * t - z) ** 2 < hw * hw) return true; }
  return false; };
const inCityS = (x, z) => x > MAPA.city[0] && x < MAPA.city[2] && z > MAPA.city[1] && z < MAPA.city[3];
const hardAt = (x, z) => { const c = MAPA.city; if (x > c[0] - 1 && x < c[2] + 1 && z > c[1] - 1 && z < c[3] + 1) return true; for (const r of MAPA.roads) if (x > r[0] - 0.3 && x < r[2] + 0.3 && z > r[1] - 0.3 && z < r[3] + 0.3) return true;
  const l = MAPA.grid.get(Math.floor(x / 16) * 1000 + Math.floor(z / 16)); if (l) for (const r of l) if (x > r[0] - 0.2 && x < r[2] + 0.2 && z > r[1] - 0.2 && z < r[3] + 0.2) return true; return false; };
const groundBad = (x0, z0, x1, z1) => { const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  if (Math.max(Math.abs(x0), Math.abs(z0), Math.abs(x1), Math.abs(z1)) > 3992) return 'Fora do mapa';
  if (inCityS(cx, cz)) return 'Na cidade não se constrói';
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [cx, cz]]) if (wetS(x, z, 1)) return 'Na água não se constrói';
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
// mapa novo: as bases, o que está dentro delas e os sacos ficam; só sai o que agora calha em cima de uma estrada ou casa nova
const newWorld = wv => { const base = S.w.base, ct = Object.fromEntries(Object.entries(S.w.ct).filter(([k]) => k[0] === 'd'));
  S.w = { ...W0(), wv, cyc0: S.w.cyc0, wx: S.w.wx, base, ct }; LK.clear(); dirty = true; if (S.drop) { S.drop.zi = []; S.drop.cur = null; S.drop.warn = null; } if (!mapOk()) return;
  const clash = (x0, z0, x1, z1) => { const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2; if (inCityS(cx, cz)) return true; for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [cx, cz]]) if (hardAt(x, z)) return true;
    for (let ix = Math.floor(x0 / 16); ix <= Math.floor(x1 / 16); ix++) for (let iz = Math.floor(z0 / 16); iz <= Math.floor(z1 / 16); iz++) for (const r of MAPA.grid.get(ix * 1000 + iz) || []) if (r[0] < x1 && r[2] > x0 && r[1] < z1 && r[3] > z0) return true; return false; };
  const out = [], outd = [], gone = new Set();
  for (const k of Object.keys(base.p)) { const m = BK.exec(k); if (!m || m[1] !== 'f') continue; const i = +m[2], j = +m[3]; if (clash(i * CELL + 0.1, j * CELL + 0.1, i * CELL + CELL - 0.1, j * CELL + CELL - 0.1)) { gone.add(i + ':' + j); pDel(k, out); } }
  for (const [id, d] of Object.entries(base.d)) { const key = Math.floor(d.x / CELL) + ':' + Math.floor(d.z / CELL); if (gone.has(key) || (!fundAt(Math.floor(d.x / CELL), Math.floor(d.z / CELL)) && clash(d.x - 0.4, d.z - 0.4, d.x + 0.4, d.z + 0.4))) dDel(id, outd); }
  if (out.length || outd.length) console.log('mapa novo: saíram', out.length, 'peças e', outd.length, 'objetos'); };
const baseMsg = (c, p, m, now) => {
  const B = S.w.base, tok = p.tok;
  if (m.t === 'bp') { const k = String(m.k || ''), mm = BK.exec(k); if (!mm) return; const ty = mm[1], i = +mm[2], j = +mm[3], t = String(m.tt || '');
    if (!(ty === 'f' ? t === 'fund' : ty === 't' ? t === 'teto' : ['parede', 'porta', 'janela'].includes(t))) return;
    if (Math.hypot(i * CELL + 1.5 - p.x, j * CELL + 1.5 - p.z) > 14) return no(c, 'bp', k, 'Estás longe demais');
    if (B.p[k]) return no(c, 'bp', k, 'Já há aí uma peça');
    if (ty === 'f') { for (let a = i - GAP_F; a <= i + GAP_F; a++) for (let b = j - GAP_F; b <= j + GAP_F; b++) { const F = fundAt(a, b); if (F && !ally(F.tok, tok)) return no(c, 'bp', k, 'Muito perto da base de outro jogador'); } // nem colado nem a menos de 3 casas (9 m)
      for (const d of Object.values(B.d)) if (!ally(d.tok, tok) && distCell(d.x, d.z, i, j) < GAP_DD) return no(c, 'bp', k, 'Muito perto das coisas de outro jogador');
      if (wouldEnclose(i, j, tok)) return no(c, 'bp', k, 'Assim fechavas a base de outro jogador');
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
    if (!F) { const w = depNearOther(x, z, tok); if (w) return no(c, 'bd', k, w); let n = 0; for (const e of Object.values(B.d)) if (e.tok === tok && !fundAt(Math.floor(e.x / CELL), Math.floor(e.z / CELL))) n++; if (n >= 8) return no(c, 'bd', k, 'Já tens 8 objetos fora da base: apanha um primeiro'); } // fora da base, poucos: não dá para fazer muros de baús
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
  if (m.t === 'fu') { if (!d || (d.k !== 'fornalha' && d.k !== 'fogueira') || Math.hypot(d.x - p.x, d.z - p.z) > 6) return; d.on = m.on ? 1 : 0; d.last = now; d.until = num(m.until, 0, 1e15, 0); bb({ d: [dRow(id, d)] }); return; }
};
// explosão: quem a fez manda onde foi; aqui partem-se as peças e os objetos, e os outros veem e ouvem
// ---------- alarme de raid: notificação no telemóvel mesmo com o jogo fechado (Web Push sem bibliotecas: VAPID ES256 e aes128gcm, RFC 8291/8292)
if (!S.vapid) { const k = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' }); S.vapid = { pub: k.publicKey.export({ format: 'jwk' }), priv: k.privateKey.export({ format: 'jwk' }) }; dirty = true; }
if (!S.push) S.push = {};
const b64u = b => Buffer.from(b).toString('base64url');
const VPUB = Buffer.concat([Buffer.from([4]), Buffer.from(S.vapid.pub.x, 'base64url'), Buffer.from(S.vapid.pub.y, 'base64url')]), VKEY = crypto.createPrivateKey({ key: S.vapid.priv, format: 'jwk' });
const vapidJWT = aud => { const h = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' })), pl = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'https://kurogane.2-31-13-85.sslip.io' })); return h + '.' + pl + '.' + b64u(crypto.sign('sha256', Buffer.from(h + '.' + pl), { key: VKEY, dsaEncoding: 'ieee-p1363' })); };
const wpEncrypt = (sub, text) => { const ua = Buffer.from(sub.keys.p256dh, 'base64url'), auth = Buffer.from(sub.keys.auth, 'base64url'), E = crypto.createECDH('prime256v1'); E.generateKeys(); const as = E.getPublicKey(), sh = E.computeSecret(ua), salt = crypto.randomBytes(16);
  const hk = (sa, ikm, info, n) => Buffer.from(crypto.hkdfSync('sha256', ikm, sa, info, n));
  const ikm = hk(auth, sh, Buffer.concat([Buffer.from('WebPush: info\0'), ua, as]), 32), cek = hk(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16), nonce = hk(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
  const ci = crypto.createCipheriv('aes-128-gcm', cek, nonce), body = Buffer.concat([ci.update(Buffer.concat([Buffer.from(text), Buffer.from([2])])), ci.final(), ci.getAuthTag()]);
  const head = Buffer.alloc(21); salt.copy(head, 0); head.writeUInt32BE(4096, 16); head.writeUInt8(65, 20); return Buffer.concat([head, as, body]); };
const pushTo = (uid, data) => { for (const sub of (S.push[uid] || []).slice()) { try { const u = new URL(sub.endpoint), body = wpEncrypt(sub, JSON.stringify(data));
    const rq = https.request(u, { method: 'POST', timeout: 15000, headers: { 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '3600', Urgency: 'high', Authorization: 'vapid t=' + vapidJWT(u.origin) + ', k=' + b64u(VPUB), 'Content-Length': body.length } }, res => { if (res.statusCode === 404 || res.statusCode === 410) { S.push[uid] = (S.push[uid] || []).filter(q => q.endpoint !== sub.endpoint); dirty = true; } res.resume(); });
    rq.on('error', () => { }); rq.on('timeout', () => rq.destroy()); rq.end(body); } catch (e) { } } };
const RAIDT = new Map(); // no máximo um aviso a cada 5 min por pessoa
const raidAlarm = (toks, who, x, z) => { const uids = new Set(); for (const t of toks) { const T = S.tokens[t]; if (!T) continue; uids.add(uidOf(t)); if (T.clan) for (const [t2, T2] of Object.entries(S.tokens)) if (T2.clan === T.clan) uids.add(uidOf(t2)); }
  const now = Date.now(), on = new Set([...players.values()].filter(o => o.p).map(o => o.p.uid)); for (const u of uids) { if (on.has(u) || !S.push[u] || now - (RAIDT.get(u) || 0) < 300e3) continue; RAIDT.set(u, now); pushTo(u, { title: 'Estão a atacar a tua base', body: 'Explosão em ' + Math.round(x) + ', ' + Math.round(z) + ' (' + who + '). Entra para defender.', tag: 'raid' }); } };
const SLEEPT = new Map(); // personagem a dormir atacada: aviso no telemóvel (no máximo a cada 5 min; a morte avisa sempre)
const sleepAlarm = (tok, who, dead) => { const u = uidOf(tok); if (!S.push[u] || [...players.values()].some(o => o.p && o.p.uid === u)) return; const now = Date.now(); if (!dead && now - (SLEEPT.get(u) || 0) < 300e3) return; SLEEPT.set(u, now);
  pushTo(u, dead ? { title: 'Mataram a tua personagem', body: (who || 'Alguém') + ' matou-te enquanto dormias. As tuas coisas ficaram no chão.', tag: 'sono' } : { title: 'Estão a atacar a tua personagem!', body: 'Estás a dormir e ' + (who || 'alguém') + ' está a atacar-te. Entra já para te salvares.', tag: 'sono' }); };
const boom = (c, p, m) => { const X = EXB[m.k]; if (!X) return; const ti = (p.thr || []).findIndex(q => q.k === m.k && Date.now() - q.t < 120000); if (ti < 0) { strike(c, p, 'explosão sem lançar'); return; } p.thr.splice(ti, 1); const x = num(m.x, -4100, 4100), z = num(m.z, -4100, 4100), y = num(m.y, -5, 40), lv = num(m.lv, 0, 6) | 0; if (Math.hypot(x - p.x, z - p.z) > 60) return;
  bcast({ t: 'boom', k: m.k, x, y, z, lv }, o => o !== c && Math.hypot(o.p.x - x, o.p.z - z) < 300);
  if (Array.isArray(m.lk)) for (const [w, hp] of m.lk.slice(0, 4)) { const i = num(w, 0, 20000, -1) | 0; if (i < 0) continue; const L = S.w.locks[i] || {}; L.hp = Math.min(L.hp ?? 1e9, num(hp, 0, 5000)); if (L.hp <= 0) { L.hp = 0; L.broke = Date.now(); S.w.doors[i] = 1; } S.w.locks[i] = L; dirty = true; bcast({ t: 'lk', i, hp: L.hp, broke: L.broke || 0 }); }
  if (lv !== 0) return; for (const car of Object.values(S.w.cars)) { const q = Math.hypot(car.x - x, car.z - z); if (q > 5 || car.hp <= 0) continue; car.hp = Math.max(0, car.hp - (m.k === 'c4' ? 700 : 160) * (1 - q / 5) * (car.k === 'humvee' ? 0.6 : 1)); if (car.hp <= 0) { car.dead = Date.now(); car.s = car.s.map(() => 0); car.v = 0; } dirty = true; }
  const B = S.w.base, upd = [], rp = [], dd = [], rd = [], hitT = new Set();
  for (const [k, P] of Object.entries(B.p)) { if (!B.p[k]) continue; const mm = BK.exec(k); if (!mm) continue; const i = +mm[2], j = +mm[3]; let mx, mz;
    if (mm[1] === 'f' || mm[1] === 't') { mx = i * CELL + CELL / 2; mz = j * CELL + CELL / 2; } else if (mm[1] === 'h') { mx = i * CELL + CELL / 2; mz = j * CELL; } else { mx = i * CELL; mz = j * CELL + CELL / 2; }
    const d = Math.hypot(mx - x, mz - z) - (mm[1] === 'f' || mm[1] === 't' ? 1.2 : 0.9); if (d > X.br) continue; const f = d <= 0 ? 1 : (1 - d / X.br) * (1 - d / X.br);
    if (P.tok && P.tok !== p.tok) hitT.add(P.tok); P.hp -= X.bdmg * f * (P.t === 'fund' ? 0.5 : 1); if (P.hp <= 0) { delete B.p[k]; rp.push(k); } else upd.push(pRow(k, P)); }
  for (const [id, d] of Object.entries(B.d)) { const q = Math.hypot(d.x - x, d.z - z); if (q > X.br) continue; if (d.tok && d.tok !== p.tok) hitT.add(d.tok); d.hp -= X.bdmg * (1 - q / X.br); if (d.hp <= 0) dDel(id, rd); else dd.push(dRow(id, d)); }
  if (upd.length || rp.length || dd.length || rd.length) bb({ p: upd, rp, d: dd, rd }); if (hitT.size) raidAlarm(hitT, m.k === 'c4' ? 'C4' : 'granada', x, z); };


// ---------- carros: quem conduz manda a posição; o servidor guarda gasolina, estado e quem vai em cada lugar
const cRow = (id, c) => [id, Math.round(c.x * 10), Math.round(c.z * 10), Math.round(c.yaw * 100), Math.round((c.v || 0) * 10), +(+c.fuel).toFixed(1), Math.round(c.hp), c.k || 'sedan', c.s.map(x => x || 0), Math.round(c.ts || 0), Math.round((c.alt || 0) * 10), c.li == null ? -1 : c.li ? 1 : 0];
const carMsg = (c, p, m, now) => {
  const car = S.w.cars[String(m.id || '')];
  if (m.t === 'cin') { const seat = num(m.seat, 0, car ? car.s.length - 1 : 0) | 0; const holder = car && car.s[seat] && players.get(car.s[seat]);
    if (!car || car.hp <= 0 || (holder && holder.p) || Math.hypot(car.x - p.x, car.z - p.z) > 6) return send(c, { t: 'cin', id: m.id, seat, ok: 0 });
    for (const o of Object.values(S.w.cars)) { const i = o.s.indexOf(c.id); if (i >= 0) o.s[i] = 0; } car.s[seat] = c.id; return send(c, { t: 'cin', id: m.id, seat, ok: 1 }); }
  if (m.t === 'cout') { if (!car) return; const i = car.s.indexOf(c.id); if (i >= 0) { car.s[i] = 0; if (i === 0) { car.v = 0; car.alt = vt(car.k).fly ? (car.pad || 0) : 0; } dirty = true; } return; }
  if (m.t === 'cu') { if (!Array.isArray(m.L)) return; for (const a of m.L.slice(0, 2)) { const o = S.w.cars[a[0]]; if (!o || o.s[0] !== c.id || o.hp <= 0) continue;
      o.x = num(a[1], -41000, 41000) / 10; o.z = num(a[2], -41000, 41000) / 10; o.yaw = num(a[3], -100000, 100000) / 100; o.v = num(a[4], -300, 300) / 10; o.fuel = Math.min(o.fuel, num(a[5], 0, 200)); o.hp = Math.min(o.hp, num(a[6], 0, 5000)); o.alt = vt(o.k).fly ? num(a[7], 0, 600) / 10 : 0; o.ts = num(a[8], 0, 1e13, 0); o.pad = vt(o.k).fly ? Math.min(o.alt, num(a[9], 0, 600, 0) / 10) : 0;
      if (o.hp <= 0) { o.dead = now; o.s = o.s.map(() => 0); o.v = 0; o.alt = 0; } dirty = true; } return; }
  if (m.t === 'cfp') { if (!car || car.s[0] !== c.id || !vt(car.k).tank || now - (p.cfpT || 0) < 8000) return; p.cfpT = now; car.fuel = vt(car.k).tank; dirty = true; return; } // abastecer na bomba (com o carro parado ao lado)
  if (m.t === 'cl') { if (!car || !car.s.includes(c.id)) return; car.li = m.on ? 1 : 0; dirty = true; return; } // faróis: ficam como o condutor os deixou
  if (m.t === 'cf') { if (!car || Math.hypot(car.x - p.x, car.z - p.z) > 6 || !vt(car.k).tank) return; { const L = ledOf(p); if ((L.T.gasolina || 0) < 1) { send(c, { t: 'fix', T: L.T }); return; } addT(L.T, { gasolina: 1 }, -1); addT(L.T, { galaoV: 1 }); } car.fuel = Math.min(vt(car.k).tank, car.fuel + num(m.add, 0, 20)); dirty = true; return; }
  // atropelar outro jogador: quem conduz diz quem; o servidor confirma que o carro estava mesmo ao lado
  if (m.t === 'ck') { const o = players.get(m.to | 0), mine = Object.values(S.w.cars).find(q => q.s[0] === c.id); if (!o || !o.p || !o.p.alive || !mine || Math.hypot(mine.x - o.p.x, mine.z - o.p.z) > 5) return;
    if (p.clan && o.p.clan === p.clan) return; const v = o.p, dmg = num(m.dmg, 0, 120); v.hp = Math.max(0, v.hp - dmg); const kill = v.hp <= 0; if (kill) v.alive = false;
    send(o, { t: 'hit', by: p.name, dmg: +dmg.toFixed(1), zone: 'body', hp: v.hp, car: 1 }); send(c, { t: 'hitc', on: o.id, zone: 'body', kill, name: v.name }); return; }
};

// ---------- zombies: o servidor guarda todos (posição, vida, proteção); quem está mais perto simula os que tem à volta
// e manda para aqui; os outros veem o mesmo. Dano e mortes passam sempre por aqui.
const zRow = (i, z, own) => [i, Math.round(z.x * 10), Math.round(z.z * 10), z.lv, Math.round(z.yaw * 100), Math.round((z.mv || 0) * 10), z.st, Math.round(z.hp), z.k, z.h, z.v, Math.round((z.limp || 0) * 10), own ? 1 : 0, Math.round(z.hx * 10), Math.round(z.hz * 10), Math.round(z.ts || 0), z.pet || ''];
// para quem o simula, a posição vem dele: só se volta a mandar quando muda a vida, a proteção ou morre
const zSig = (z, own, row) => own ? 'o' + (z.st === 3 ? 3 : 0) + ',' + row[7] + ',' + z.h + ',' + z.v + ',' + row[11] + ',' + (z.pet || '') : row.join();
// animais (k 3–7): veado, javali, lobo, cão, galinha; o que deixam quando morrem
const ANLOOT = { 3: [['carneC', 5], ['couro', 2]], 4: [['carneC', 6], ['couro', 2]], 5: [['carneC', 3], ['couro', 2]], 6: [['carneC', 2], ['couro', 1]], 7: [['carneC', 1]] };
const FOOD = ['carneC', 'carneA', 'lata', 'sardinhas', 'racao', 'onigiri'];
const zNear = (x, z, r) => { let n = 0; for (const c of players.values()) if (c.p && Math.hypot(c.p.x - x, c.p.z - z) < r) n++; return n; };

// dano num zombie: conta aqui; quem o simula recebe o empurrão (e o zombie vira-se para quem disparou)
const zHit = (c, p, m, now) => { const z = S.w.zs[m.i | 0]; if (!z || z.st === 3 || Math.hypot(z.x - p.x, z.z - p.z) > 900) return;
  // anti-batota: cada golpe no máximo 600 de dano e, no total, o que a arma mais forte dá por segundo (reserva de 3000, volta 1500 por segundo)
  const zb = p.zdb || (p.zdb = { v: 3000, t: now }); zb.v = Math.min(3000, zb.v + (now - zb.t) / 1000 * 1500); zb.t = now; const dm = Math.min(600, num(m.dmg, 0, 2000)); if (zb.v < dm) { p.zdOver = (p.zdOver || 0) + 1; if (p.zdOver % 50 === 1) strike(c, p, 'dano em zombies a mais'); return; } zb.v -= dm;
  z.hp -= dm; if (typeof m.h === 'number') z.h = num(m.h, 0, 4) | 0; if (typeof m.v === 'number') z.v = num(m.v, 0, 4) | 0; if (typeof m.hd === 'number') z.hd = m.hd; if (typeof m.vd === 'number') z.vd = m.vd;
  if (m.limp) z.limp = Math.min(2, (z.limp || 0) + num(m.limp, 0, 2));
  if (z.hp <= 0 && z.k >= 3) { z.hp = 0; z.st = 3; z.dt = now; z.mv = 0; dirty = true; const g = new Grid(6, 4); for (const [k, n] of ANLOOT[z.k] || []) g.insert(mkItem(k, n)); mkBag(z.x, z.z, 0, z.lv || 0, g.list.map(e => encSrv(e.it, e.x, e.y))); bcast({ t: 'zk', i: m.i | 0, by: c.id, head: m.zone === 'head' ? 1 : 0 }, o => o.p && Math.hypot(o.p.x - z.x, o.p.z - z.z) < 200); return; }
  if (z.hp <= 0) { z.hp = 0; z.st = 3; z.dt = now; z.mv = 0; dirty = true; stat(p, 'z'); if (Math.random() < 0.32) { const g = new Grid(6, 4); rollLoot(z.k === 1 ? 'militar' : 'zombie', g); mkBag(z.x, z.z, 0, z.lv || 0, g.list.map(e => encSrv(e.it, e.x, e.y))); } bcast({ t: 'zk', i: m.i | 0, by: c.id, head: m.zone === 'head' ? 1 : 0 }, o => o.p && Math.hypot(o.p.x - z.x, o.p.z - z.z) < 200); return; }
  if (z.o && z.o !== c.id) { const o = players.get(z.o); if (o) send(o, { t: 'zh', i: m.i | 0, dx: num(m.dx, -1, 1), dz: num(m.dz, -1, 1), by: c.id }); } };

// ---------- mensagens
const onMsg = (c, m) => {
  if (!m || typeof m.t !== 'string') return;
  // perfil e amigos, também a partir do menu (sem personagem no mundo): o código da personagem prova quem é
  if (m.t === 'pf') { const tok = typeof m.tok === 'string' && m.tok.length === 32 && S.tokens[m.tok] ? m.tok : (c.p ? c.p.tok : null); if (!tok) return send(c, { t: 'pf', none: true }); friends(c, uidOf(tok), S.tokens[tok].name, m); return; }
  if (m.t === 'hi') {
    if (c.p) return; const name = String(m.name || ''); if (!NAME.test(name)) return send(c, { t: 'erro', e: 'nome' });
    // jogo antigo (antes da 0.15, sem o servidor a contar o inventário): tem de recarregar, senão apagava o inventário guardado
    if ((m.pv | 0) < 4) return send(c, { t: 'erro', e: 'versao' });
    if ([...players.values()].some(o => o.p && o.p.name.toLowerCase() === name.toLowerCase())) return send(c, { t: 'erro', e: 'nome_em_uso' });
    // versão do mundo (casas, caixas, portas): se mudou e não está ninguém ligado, recomeça o mundo partilhado
    const wv = typeof m.wv === 'string' ? m.wv.slice(0, 40) : '';
    if (wv && MAPA && wv !== MAPA.wv) return send(c, { t: 'erro', e: 'versao' });
    if (wv && S.w.wv !== wv) { if ([...players.values()].some(o => o.p)) return send(c, { t: 'erro', e: 'versao' }); newWorld(wv); }
    let tok = typeof m.tok === 'string' && m.tok.length === 32 && S.tokens[m.tok] ? m.tok : null;
    // o nome fica guardado 3 dias depois da última vez (ou enquanto a personagem dorme): ninguém se faz passar por outro
    const lo = name.toLowerCase(), now = Date.now();
    const dono = Object.keys(S.tokens).find(k => (S.tokens[k].name || '').toLowerCase() === lo && (S.sleepers[k] || now - S.tokens[k].t < 3 * 24 * 3600e3));
    // recuperar a personagem: a 0.47 apagava o código guardado no aparelho ao entrar na arena (fica vazio). O dono do servidor
    // põe o nome em reclamar.txt (pasta do estado) e, nas 6 h seguintes, o primeiro que entrar com esse nome e o código vazio recebe-a
    if (dono && dono !== tok && !tok && m.tok === '') { try { const RF = path.join(DIR, 'reclamar.txt'), st = fs.statSync(RF);
      if (now - st.mtimeMs < 6 * 3600e3) { const L = fs.readFileSync(RF, 'utf8').split(/\s+/).map(x => x.toLowerCase()).filter(Boolean); if (L.includes(lo)) { tok = dono; fs.writeFileSync(RF, L.filter(x => x !== lo).join('\n')); console.log('kurogane: personagem devolvida a', name); } } } catch (e) { } }
    if (dono && dono !== tok) return send(c, { t: 'erro', e: 'nome_em_uso' });
    { const u0 = tok ? uidOf(tok) : null, B = (u0 && S.bans[u0]) || (c.ip && Object.values(S.bans).find(b => b.ip && b.ip === c.ip)); if (B && (!B.until || B.until > now)) return send(c, { t: 'erro', e: 'banido', until: B.until || 0, why: B.why || '' }); }
    if (!tok) { tok = rid(24); S.tokens[tok] = { name, t: now }; } S.tokens[tok].name = name; S.tokens[tok].t = now; dirty = true;
    const sl = S.sleepers[tok]; let killed = false, resume = null;
    if (sl) { delete S.sleepers[tok]; dirty = true; resume = { x: sl.x, z: sl.z, y: sl.y || 0, lv: sl.lv, hp: sl.hp, yaw: sl.yaw || 0 }; bcast({ t: 'sleep', list: sleepList() }); }
    if (S.tokens[tok].killed) { killed = true; delete S.tokens[tok].killed; dirty = true; }
    if (!S.w.ctab && Array.isArray(m.ctab) && m.ctab.length < 5000) { S.w.ctab = m.ctab.map(a => Array.isArray(a) && typeof a[0] === 'string' && LOOT[a[0]] ? [a[0], num(a[1], 1, 8, 4) | 0, num(a[2], 1, 8, 4) | 0] : null); dirty = true; }
    const tst = process.env.KG_TEST === '1' && !!m.test; // só nos testes automáticos (que teletransportam e dão coisas)
    // quem ficou a dormir no mundo (vivo) continua: mesma posição e o que tinha; só começa de novo quem morreu ou não tem personagem
    const contin = !!sl && !killed;
    if (tst) S.led[tok] = { T: {}, inv: null, g: true };
    else if ((m.fresh && !contin) || killed) { S.led[tok] = { T: { ...KIT }, inv: null, g: false }; if (S.tokens[tok]) delete S.tokens[tok].g; dirty = true; }
    const look = m.look && typeof m.look === 'object' ? Object.fromEntries(Object.entries(m.look).filter(([k, v]) => ['skin', 'hair', 'top', 'legs', 'hairS', 'beardS'].includes(k) && typeof v === 'number')) : {};
    const tc = S.tokens[tok].clan, clan = tc && S.clans[tc] ? tc : null;
    c.p = { name, tok, look, x: sl ? sl.x : num(m.x, -4100, 4100), z: sl ? sl.z : num(m.z, -4100, 4100), lastSt: sl ? now : 0, y: 0, lv: 0, yaw: 0, mv: 0, an: 0, w: '', hp: resume ? resume.hp ?? 100 : 100, alive: true, ar: [0, 0], inv: [], clan, lastShot: 0, hd: null, vd: null };
    c.zc = new Map(); c.cc = new Map(); c.p.uid = uidOf(tok); c.p.test = tst;
    // veículos: a lista vem do jogo (sítios iguais em todos os aparelhos); muda quando muda o tipo de veículos (CARV), se ninguém estiver a conduzir
    if (Array.isArray(m.cars) && S.w.carv !== CARV && !Object.values(S.w.cars).some(o => o.s.some(Boolean))) { for (const id of Object.keys(S.w.cars)) if (!S.w.cars[id].adm) delete S.w.cars[id]; for (const o of players.values()) if (o.cc) o.cc.clear(); m.cars.slice(0, 160).forEach((a, i) => { const x = num(a[0], -4100, 4100), z = num(a[1], -4100, 4100), yaw = num(a[2], -10, 10), k = VT[a[3]] ? a[3] : 'sedan', T = VT[k]; S.w.cars['c' + i] = { k, x, z, yaw, v: 0, fuel: T.tank ? +(T.tank * (0.2 + Math.random() * 0.45)).toFixed(1) : 0, hp: T.hp, sx: x, sz: z, syaw: yaw, s: T.seats.map(() => 0), dead: 0 }; }); S.w.carv = CARV; dirty = true; }
    const zseed = !S.w.zs.length && ![...players.values()].some(o => o !== c && o.zseed && now - (o.zseedT || 0) < 15000); if (zseed) { c.zseed = true; c.zseedT = now; }
    send(c, { t: 'ok', id: c.id, tok, killed, resume, drop: dropInfo(), role: S.roles[c.p.uid] || null, players: [...players.values()].filter(o => o.p && o !== c).map(o => [o.id, o.p.name, o.p.look, o.p.clan]), sleep: sleepList(), clan: clanInfo(clan),
      uid: c.p.uid, xp: { x: (S.stats[c.p.uid] || {}).x || 0, ...lvOf((S.stats[c.p.uid] || {}).x) }, vapid: b64u(VPUB), inv: (contin || !m.fresh) && !killed && S.led[tok] && !S.led[tok].g ? (S.led[tok].inv || (sl && sl.inv) || null) : null, cont: contin, w: { cyc0: S.w.cyc0, now, wx: S.w.wx.r, base: baseRows(), locks: Object.entries(S.w.locks).map(([i, L]) => [+i, L.hp, L.broke || 0]), doors: Object.entries(S.w.doors).map(([i, o]) => [+i, o]), nodes: Object.entries(S.w.nodes).map(([k, u]) => [k, u - now]).filter(a => a[1] > 0), bags: bagRows(), zseed } });
    bcast({ t: 'join', id: c.id, name, look, clan }, o => o !== c);
    return;
  }
  const p = c.p; if (!p) return; const now = Date.now();
  if (m.t === 'st') { const nx = num(m.x, -4100, 4100), nz = num(m.z, -4100, 4100), al0 = !!m.al;
    if (p.frozen && Math.hypot(nx - p.x, nz - p.z) > 0.3) { send(c, { t: 'pos', x: p.x, z: p.z, lv: p.lv }); return; } // congelado pela equipa
    if (al0 && !p.alive) { const L = ledOf(p); L.T = { ...KIT }; L.inv = null; dirty = true; p.lastSt = 0; } // renasceu
    else if (p.lastSt && al0 && p.alive && !p.test) { const dt = (now - p.lastSt) / 1000, inCar = Object.values(S.w.cars).find(o => o.s.includes(c.id)), d = Math.hypot(nx - p.x, nz - p.z);
      if (d > (inCar ? vt(inCar.k).vmax * 1.3 + 4 : 8) * dt + 4) { strike(c, p, 'salto ' + d.toFixed(1) + ' m em ' + dt.toFixed(2) + ' s'); send(c, { t: 'pos', x: p.x, z: p.z, lv: p.lv }); p.lastSt = now; return; } }
    if (p.alive && al0 && (p.lv | 0) === 0 && p.y < 3 && Math.hypot(nx - p.x, nz - p.z) < 8 && wallCross(p.x, p.z, nx, nz)) { p.wallN = (p.wallN || 0) + 1; if (p.wallN % 20 === 1) console.log('parede', p.name, p.wallN); send(c, { t: 'pos', x: p.x, z: p.z, lv: p.lv }); p.lastSt = now; return; } // atravessar paredes da base
    p.lastSt = now; p.x = nx; p.z = nz; p.y = num(m.y, -5, 40); p.lv = num(m.lv, 0, 6) | 0;
    p.ts = num(m.ts, 0, 1e13, 0); p.yaw = num(m.yaw, -10, 10); p.mv = num(m.mv, 0, 3); p.an = num(m.an, 0, 127) | 0; p.w = typeof m.w === 'string' ? m.w.slice(0, 12) : ''; p.sc = num(m.sc, 0, 2, 0) | 0;
    histPush(p, now); // onde esteve no último segundo, com a pose (para pôr o alvo onde quem disparou o via)
    const al = !!m.al, hp = num(m.hp, 0, 100, p.hp); if (al && !p.alive) { p.hp = hp; p.hd = p.vd = null; } else p.hp = Math.min(hp, p.hp + 3); p.alive = al; // a vida que o servidor tirou não volta de repente
    if (Array.isArray(m.ar)) { const a = [num(m.ar[0], 0, 4) | 0, num(m.ar[1], 0, 4) | 0]; if (a[0] !== p.ar[0]) p.hd = null; if (a[1] !== p.ar[1]) p.vd = null; p.ar = a; }
    if (typeof m.gk === 'string' && (m.gk !== p.gkRaw || now - (p.gkT || 0) > 2000)) { p.gkRaw = m.gk.slice(0, 80); p.gkT = now; const T = ledOf(p).T, q = p.gkRaw.split(','); p.gk = GKS.map((s, i) => { const k = q[i] || ''; return ITEMS[k] && ITEMS[k].eq === s && T[k] > 0 ? k : ''; }).join(); p.ghillie = p.gk.includes('ghillie'); } return; }
  if (m.t === 'inv') { if (m.bag || m.belt) invMsg(c, p, m); return; }
  if (m.t === 'gt') { gather(c, p, m); return; }
  if (m.t === 'cr') { craft(c, p, m); return; }
  if (m.t === 'shot') { shot(c, m); return; }
  if (m.t === 'died') { // morreu (zombies, queda, outro jogador): o que tinha fica no corpo, que todos veem
    if (!p.alive && !m.force) return; p.alive = false; p.hp = 0; const L = ledOf(p), rest = { ...L.T }, it = [];
    for (const o of cleanIt(Array.isArray(m.it) ? m.it : p.inv)) { const t = tally([o]); if (fits(t, rest)) { addT(rest, t, -1); it.push(o); } }
    mkBag(p.x, p.z, num(m.y, -5, 40, p.y), p.lv, it, { body: 1, name: p.name }); p.inv = []; L.T = {}; L.inv = null; dirty = true; return; }
  if (m.t === 'clan') { clan(c, m); return; }
  if (m.t === 'adm' || m.t === 'admclaim') { adm(c, m); return; }
  if (m.t === 'lb') { lboard(c); return; }
  if (m.t === 'txp' && process.env.KG_TEST) { p.test = false; addXP(p, num(m.g, 0, 5000) | 0); return; } // só nos testes: dar experiência
  if (m.t === 'tgod' && process.env.KG_TEST) { p.god = !!m.on; return; } // só nos testes: não morre (para medir as hitboxes tiro a tiro)
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
    if (k[0] === 'd') { const d = S.w.base.d[k.slice(1)]; if (d && (d.k === 'fornalha' || d.k === 'fogueira')) { d.last = now; if (m.fu && typeof m.fu === 'object') { const on = m.fu.on ? 1 : 0, ch = on !== d.on; d.on = on; d.until = num(m.fu.until, 0, 1e15, 0); if (ch) bb({ d: [dRow(k.slice(1), d)] }); } } }
    if (m.t === 'cl') { LK.delete(k); if (k[0] === 'b' && !it.length) bagDel(k.slice(1)); } return; }
  if (m.t === 'bag') { const x = num(m.x, -4100, 4100), z = num(m.z, -4100, 4100); if (Math.hypot(x - p.x, z - p.z) > 12) return; const it = cleanIt(m.it), t = tally(it), L = ledOf(p); if (!fits(t, L.T)) { strike(c, p, 'largar'); send(c, { t: 'fix', T: L.T }); return; } addT(L.T, t, -1); dirty = true; mkBag(x, z, num(m.y, -5, 40), num(m.lv, 0, 6) | 0, it); return; }
  if (['bp', 'bu', 'bx', 'bdo', 'bd', 'bdr', 'bdn', 'bdc', 'fu', 'lkc', 'lkset'].includes(m.t)) { baseMsg(c, p, m, now); return; }
  if (m.t === 'boom') { boom(c, p, m); return; }
  if (m.t === 'gf') { const L = ledOf(p); if ((L.T.galaoV || 0) < 1 || now - (p.gfT || 0) < 1500) { send(c, { t: 'fix', T: L.T }); return; } p.gfT = now; addT(L.T, { galaoV: 1 }, -1); addT(L.T, { gasolina: 1 }); dirty = true; return; } // encher um galão vazio na bomba
  if (['cin', 'cout', 'cu', 'cf', 'ck', 'cl', 'cfp'].includes(m.t)) { carMsg(c, p, m, now); return; }
  // granada lançada ou C4 colado: os outros por perto veem-nos (a explosão vem depois, de quem os lançou)
  if (m.t === 'thr') { if (m.k !== 'gran' && m.k !== 'c4') return; { const L = ledOf(p), ik = m.k === 'gran' ? 'granada' : 'c4'; if ((L.T[ik] || 0) < 1) { strike(c, p, 'explosivo ' + ik); send(c, { t: 'fix', T: L.T }); return; } addT(L.T, { [ik]: 1 }, -1); (p.thr || (p.thr = [])).push({ k: m.k, t: now }); dirty = true; } const P = Array.isArray(m.P) ? m.P.slice(0, 3).map(v => num(v, -4100, 4100)) : null; if (!P || P.length !== 3 || Math.hypot(P[0] - p.x, P[2] - p.z) > 6) return;
    const o = { t: 'thr', k: m.k, P, lv: num(m.lv, 0, 6) | 0 }; if (m.k === 'gran') { o.V = Array.isArray(m.V) ? m.V.slice(0, 3).map(v => num(v, -60, 60)) : [0, 0, 0]; o.base = num(m.base, 0, 30); } else { o.yaw = num(m.yaw, -10, 10); o.st = m.st ? 1 : 0; }
    bcast(o, x => x !== c && Math.hypot(x.p.x - P[0], x.p.z - P[2]) < 300); return; }
  // zombies: a primeira pessoa num mundo novo espalha-os (com as zonas do jogo) e manda a lista
  if (m.t === 'zs') { if (!c.zseed || S.w.zs.length || !Array.isArray(m.L)) return; c.zseed = false;
    if (S.drop) S.drop.zi = [];
    S.w.zs = m.L.slice(0, 3000).map(a => { const x = num(a[0], -4100, 4100), z = num(a[1], -4100, 4100), h = num(a[3], 0, 4) | 0, v = num(a[4], 0, 4) | 0, hp = num(a[5], 1, 300, 80);
      return { x, z, lv: 0, yaw: Math.random() * 6.28, hp, mx: hp, k: num(a[2], 0, 7) | 0, h, v, h0: h, v0: v, hd: null, vd: null, hx: x, hz: z, st: 0, mv: 0, limp: 0, dt: 0, re: (360 + Math.random() * 300) * 1000, o: 0 }; });
    dirty = true; return; }
  // animais num mundo que já tinha zombies: quem o servidor escolheu manda a lista (só uma vez)
  if (m.t === 'as') { if (!c.aseed || !Array.isArray(m.L) || S.w.zs.some(z => z.k >= 3)) return; c.aseed = false;
    for (const a of m.L.slice(0, 600)) { const x = num(a[0], -4100, 4100), z = num(a[1], -4100, 4100), k = num(a[2], 3, 7) | 0, hp = num(a[5], 1, 300, 80); S.w.zs.push({ x, z, lv: 0, yaw: Math.random() * 6.28, hp, mx: hp, k, h: 0, v: 0, h0: 0, v0: 0, hd: null, vd: null, hx: x, hz: z, st: 0, mv: 0, limp: 0, dt: 0, re: (300 + Math.random() * 300) * 1000, o: 0, pk: num(a[6], 0, 99, 0) | 0 }); }
    dirty = true; return; }
  // alarme de raid: guardar onde avisar este jogador (até 3 aparelhos); manda já um aviso de teste
  if (m.t === 'psub') { const sb = m.sub; if (!sb || typeof sb.endpoint !== 'string' || !/^https:\/\/[\w.-]+\//.test(sb.endpoint) || sb.endpoint.length > 600 || !sb.keys || typeof sb.keys.p256dh !== 'string' || typeof sb.keys.auth !== 'string' || sb.keys.p256dh.length > 120 || sb.keys.auth.length > 40) return;
    const L = (S.push[p.uid] || []).filter(q => q.endpoint !== sb.endpoint); L.push({ endpoint: sb.endpoint, keys: { p256dh: sb.keys.p256dh, auth: sb.keys.auth } }); S.push[p.uid] = L.slice(-3); dirty = true; if (!m.q) pushTo(p.uid, { title: 'Alarme de raid ligado', body: 'Vais receber um aviso aqui quando atacarem a tua base.', tag: 'raid-ok' }); return; }
  if (m.t === 'punsub') { S.push[p.uid] = (S.push[p.uid] || []).filter(q => q.endpoint !== m.endpoint); dirty = true; return; }
  // comerciantes: comprar com ienes e vender o que tens, sempre contra as contas do servidor
  if (m.t === 'tr') { const T = TRADERS[m.id | 0], k = String(m.k || ''); if (!T || !ITEMS[k] || !PRICE[k] || Math.hypot(T.x - p.x, T.z - p.z) > TRADE_R + 3) return; const n = num(m.n, 1, 500, 1) | 0, L = ledOf(p);
    if (m.s) { if ((L.T[k] || 0) < n) { send(c, { t: 'fix', T: L.T }); return; } addT(L.T, { [k]: n }, -1); addT(L.T, { iene: SELL(k) * n }); }
    else { const cost = PRICE[k] * n; if (!T.sells.includes(k) || (L.T.iene || 0) < cost) { send(c, { t: 'fix', T: L.T }); return; } addT(L.T, { iene: cost }, -1); addT(L.T, { [k]: n }); }
    dirty = true; return; }
  // adotar um cão vadio: dás-lhe comida (do que tens mesmo) e passa a seguir-te; no máximo 2
  if (m.t === 'adopt') { const z = S.w.zs[m.i | 0]; if (!z || z.k !== 6 || z.pet || z.st === 3 || Math.hypot(z.x - p.x, z.z - p.z) > 4.5) return;
    if (S.w.zs.filter(o => o.pet === p.uid && o.st !== 3).length >= 2) { send(c, { t: 'admmsg', e: 'Já tens dois cães' }); return; }
    const L = ledOf(p), f = FOOD.find(k => (L.T[k] || 0) >= 1); if (!f) { send(c, { t: 'fix', T: L.T }); return; } addT(L.T, { [f]: 1 }, -1);
    z.pet = p.uid; z.o = c.id; z.st = 0; dirty = true; return; }
  // quem simula manda a posição dos seus zombies
  if (m.t === 'zu') { if (!Array.isArray(m.L)) return; for (const a of m.L.slice(0, 400)) { const z = S.w.zs[a[0]]; if (!z || z.o !== c.id || z.st === 3) continue;
      z.x = num(a[1], -41000, 41000) / 10; z.z = num(a[2], -41000, 41000) / 10; z.lv = num(a[3], 0, 6) | 0; z.yaw = num(a[4], -1000, 1000) / 100; z.mv = num(a[5], 0, 40) / 10; z.st = num(a[6], 0, 4) | 0; z.limp = num(a[7], 0, 20) / 10; z.ts = num(m.ts, 0, 1e13, 0); } return; }
  // dano a um zombie (de quem disparou ou bateu): a vida conta aqui
  if (m.t === 'zd') { for (const d of (Array.isArray(m.L) ? m.L : [m]).slice(0, 40)) zHit(c, p, d, now); return; }
  // ataque de um zombie a outro jogador (decidido por quem o simula)
  if (m.t === 'za') { const z = S.w.zs[m.i | 0], o = players.get(m.to | 0); if (!z || z.o !== c.id || !o || !o.p || o.p.god || Math.hypot(o.p.x - z.x, o.p.z - z.z) > 3) return; if (Object.values(S.w.cars).some(car => vt(car.k).fly && car.s.includes(o.id))) return; /* dentro do helicóptero ninguém é atacado */ send(o, { t: 'zat', dmg: num(m.dmg, 0, 30) }); return; }
};

// ---------- tiros entre jogadores: trajetória com gravidade e arrasto, até à parede que o cliente viu
// dentro da carroçaria de um veículo? (caixa rodada; nos abertos só a parte de baixo)
const inCarBox = (car, x, y, z, m = 0) => { const T = vt(car.k), dx = x - car.x, dz = z - car.z, c = Math.cos(car.yaw), s = Math.sin(car.yaw), u = dx * c - dz * s, w = dx * s + dz * c, a = car.alt || 0; return Math.abs(u) < T.wid / 2 + m && Math.abs(w) < T.len / 2 + m && y > a + 0.2 && y < a + (T.open ? 0.9 : T.h) + m; };
const hitTest = (O, D, k, L, tgt, cars = []) => {
  const A = AM[k]; if (!A) return null; const [v0, dmg, pen, cd] = A; let x = O[0], y = O[1], z = O[2], vx = D[0] * v0, vy = D[1] * v0, vz = D[2] * v0, dist = 0; const h = 1 / 240; let pass = null;
  for (let i = 0; i < 240 * 4 && dist < L + 0.6; i++) { const v = Math.hypot(vx, vy, vz), k2 = cd * v; vx -= vx * k2 * h; vy -= (vy * k2 + 9.81) * h; vz -= vz * k2 * h; const nx = x + vx * h, ny = y + vy * h, nz = z + vz * h, step = Math.hypot(nx - x, ny - y, nz - z);
    // veículos: a bala bate na carroçaria (estraga-a); nos blindados ou vazios para aí; nos outros passa (mais fraca) e pode acertar em quem vai dentro
    for (const car of cars) { if (car === pass || Math.abs(nx - car.x) > 4 || Math.abs(nz - car.z) > 4 || !inCarBox(car, nx, ny, nz)) continue; const T = vt(car.k);
      if (T.armor || !car.s.some(Boolean)) return { car, zone: 'car', dmg, pen, v: Math.hypot(vx, vy, vz) / v0, dist }; pass = car; vx *= 0.7; vy *= 0.7; vz *= 0.7; }
    if (dist >= L) break;
    // contra cada alvo: hitboxes por osso (a primeira cápsula que a bala toca neste troço); quem dorme fica deitado no chão
    let best = null;
    for (const T of tgt) { const by = T.y; if (Math.abs(nx - T.x) > 3 || Math.abs(nz - T.z) > 3) continue;
      // quem dorme também tem hitboxes por osso (deitado de costas)
      const r = hitCapsules(x, y, z, nx, ny, nz, T.caps); if (r && (!best || r.f < best.f)) best = { T, zone: r.zone, f: r.f }; }
    if (best) return { T: best.T, zone: best.zone, dmg, pen, v: Math.hypot(vx, vy, vz) / v0, dist: dist + step * best.f, car: pass };
    x = nx; y = ny; z = nz; dist += step; }
  return pass ? { car: pass, zone: 'car', dmg, pen, v: 0.8, dist } : null;
};
// tiro num veículo: perde estado; desfeito, quem vai dentro leva um bom golpe e sai
const carShot = (c, car, dmg) => { if (car.hp <= 0) return; car.hp = Math.max(0, car.hp - dmg); dirty = true; send(c, { t: 'hitc', zone: 'car' });
  if (car.hp > 0) return; car.dead = Date.now(); car.v = 0;
  for (const id of car.s) { const o = id && players.get(id); if (!o || !o.p || !o.p.alive) continue; const v = o.p, d = vt(car.k).armor ? 0 : 45; if (v.god || !d) continue; v.hp = Math.max(0, v.hp - d); const kill = v.hp <= 0; if (kill) { v.alive = false; stat(c.p, 'k'); stat(v, 'd'); } send(o, { t: 'hit', by: c.p.name, dmg: d, zone: 'body', hp: v.hp }); if (kill) send(c, { t: 'hitc', on: o.id, zone: 'body', kill, name: v.name }); }
  car.s = car.s.map(() => 0); };
const shot = (c, m) => {
  const p = c.p, now = Date.now(); if (!p.alive) return; { p.shB = Math.min(3, (p.shB ?? 3) + (now - (p.lastShot || 0)) / 60); p.lastShot = now; if (p.shB < 1) return; p.shB -= 1; } /* até 3 tiros seguidos podem chegar juntos (a rede junta pacotes); em média não mais de 1 a cada 60 ms */ if (!canShoot(p, String(m.k || ''))) { strike(c, p, 'tiro sem arma ' + m.k); return; }
  const O = Array.isArray(m.o) ? m.o.map(v => num(v, -4100, 4100)) : null, D = Array.isArray(m.d) ? m.d.map(v => num(v, -1, 1)) : null; if (!O || !D || O.length !== 3 || D.length !== 3) return;
  if (Math.hypot(O[0] - p.x, O[2] - p.z) > 3) return; // a bala tem de sair de perto de ti
  const dl = Math.hypot(D[0], D[1], D[2]) || 1; D[0] /= dl; D[1] /= dl; D[2] /= dl;
  const k = String(m.k || ''), n = Math.min(8, num(m.n, 1, 8, 1) | 0), L = num(m.L, 0, 900, 300), sup = !!m.sup;
  // para os outros: o som e o rasto do tiro
  bcast({ t: 'fx', id: c.id, o: O, d: D, sup, hv: HEAVY.has(k) ? 1 : 0, k: k.slice(0, 16) }, o => o !== c && Math.hypot(o.p.x - O[0], o.p.z - O[2]) < (sup ? 60 : 520));
  const myClan = p.clan; const tgt = [];
  // quem dispara vê os outros cerca de 0,1–0,3 s atrás (o caminho da rede e a suavização): conta onde o alvo está e onde esteve nesse tempo
  const VT = new Map(Array.isArray(m.vt) ? m.vt.slice(0, 40).filter(q => Array.isArray(q)).map(q => [q[0] | 0, +q[1] || 0]) : []);
  for (const o of players.values()) if (o !== c && o.p && o.p.alive && !o.p.invis && (o.p.lv || 0) === (p.lv || 0) && !(myClan && o.p.clan === myClan) && Math.hypot(o.p.x - O[0], o.p.z - O[2]) < L + 3) {
    // o alvo é posto onde quem disparou o estava a ver (com a pose desse momento); sem essa hora: agora e um pouco antes
    const add = st => tgt.push({ x: st.x, y: st.y, z: st.z, c: o, caps: capsules(st, 0.015) });
    if (VT.has(o.id)) add(rewind(o.p, VT.get(o.id))); else { add(rewind(o.p, 0)); const H = o.p.hist || [], lt = H.length ? H[H.length - 1][4] : 0; if (lt) for (const back of [90, 180]) add(rewind(o.p, lt - back)); } }
  for (const [tok, s] of Object.entries(S.sleepers)) if (!s.hid && (s.lv || 0) === (p.lv || 0) && !(myClan && s.clan === myClan) && Math.hypot(s.x - O[0], s.z - O[2]) < L + 3) tgt.push({ x: s.x, y: s.y || 0, z: s.z, sl: tok, lying: true, caps: capsules({ x: s.x, y: (s.y || 0) + 0.16, z: s.z, yaw: s.yaw || 0, lie: 1 }, 0.02) });
  // quem vai dentro de um blindado (sem se debruçar) não leva tiros; os veículos perto entram no teste
  const cars = Object.values(S.w.cars).filter(q => q.hp > 0 && Math.hypot(q.x - O[0], q.z - O[2]) < L + 6);
  for (let i = tgt.length - 1; i >= 0; i--) { const T = tgt[i]; if (T.c && cars.some(q => vt(q.k).armor && q.s.includes(T.c.id) && ((T.c.p.an | 0) & 8 || inCarBox(q, T.x, (T.y || 0) + 1, T.z, 0.1)))) tgt.splice(i, 1); }
  if (!tgt.length && !cars.length) return;
  // cada bala segue a direção que o jogador viu no rasto (com o desvio da arma), se não fugir mais do que 0,3 rad da mira; e para onde o cliente a viu parar (parede ou zombie)
  const ds = Array.isArray(m.ds) ? m.ds.slice(0, n) : null, Ls = Array.isArray(m.Ls) ? m.Ls : null;
  for (let i = 0; i < n; i++) {
    let d = D; if (ds && Array.isArray(ds[i]) && ds[i].length === 3) { const q = ds[i].map(v => num(v, -1, 1)), ql = Math.hypot(q[0], q[1], q[2]) || 1; q[0] /= ql; q[1] /= ql; q[2] /= ql; if (q[0] * D[0] + q[1] * D[1] + q[2] * D[2] > Math.cos(0.3)) d = q; }
    else if (n > 1) { const sp = 0.02; d = [D[0] + (Math.random() - 0.5) * sp * 2, D[1] + (Math.random() - 0.5) * sp * 2, D[2] + (Math.random() - 0.5) * sp * 2]; }
    const Li = Ls ? Math.min(L, num(Ls[i], 0, 900, L)) : L;
    const h = hitTest(O, d, k, Li, tgt, cars); if (!h) continue; const T = h.T;
    if (h.car) carShot(c, h.car, h.dmg * Math.max(0.3, h.v) * 0.55 * (CARX[k] || 1));
    if (!T) continue;
    // chumbo perde força com a distância (como no jogo, até 35 m); balas pela velocidade que ainda levam
    let dmg = h.dmg * (n > 1 ? Math.min(1, Math.max(0.25, 1 - h.dist / 35)) : Math.max(0.3, Math.pow(h.v, 1.5))) * (0.9 + Math.random() * 0.2);
    if (T.sl) { const s = S.sleepers[T.sl]; if (!s) continue; s.hp = (s.hp ?? 100) - dmg; try { sleepAlarm(T.sl, p.name, s.hp <= 0); } catch (e) { console.error('sleepAlarm', e && e.message); } if (s.hp <= 0) { stat(p, 'k'); const vu = uidOf(T.sl); S.stats[vu] = S.stats[vu] || { n: s.name, k: 0, d: 0, z: 0 }; S.stats[vu].d++; delete S.sleepers[T.sl]; if (S.tokens[T.sl]) S.tokens[T.sl].killed = true; if (S.led[T.sl]) { S.led[T.sl].T = {}; S.led[T.sl].inv = null; } mkBag(s.x, s.z, s.y || 0, s.lv || 0, s.inv, { body: 1, name: s.name }); bcast({ t: 'sleep', list: sleepList() }); send(c, { t: 'hitc', zone: h.zone, kill: true, name: s.name }); } else send(c, { t: 'hitc', zone: h.zone }); dirty = true; continue; }
    // como nos zombies: a proteção trava a bala (ainda magoa) e gasta-se até partir. Pistola: 1–2 tiros na cabeça, 3 no peito (4 com colete)
    const v = T.c.p, [helm, vest] = v.ar || [0, 0]; let pop = null;
    if (h.zone === 'head') { if (helm && h.pen <= helm) { v.hd = (v.hd ?? 20) - dmg; dmg *= 0.8; if (v.hd <= 0) { pop = 'head'; v.ar[0] = 0; v.hd = null; } } else dmg = n > 1 ? dmg * 2.5 : 999; }
    else if (h.zone === 'body') { dmg *= 1.2; if (vest && h.pen <= vest) { v.vd = (v.vd ?? (vest >= 3 ? 50 : 25)) - dmg; dmg *= 0.8; if (v.vd <= 0) { pop = 'vest'; v.ar[1] = 0; v.vd = null; } } else if (vest) dmg *= 0.85; }
    else if (h.zone === 'arms') dmg *= 1.2; // braços: contam como o tronco (como no CS), mas o colete não os protege
    else dmg *= 0.6;
    if (v.god) dmg = 0; v.hp = Math.max(0, v.hp - dmg); const kill = v.hp <= 0; if (kill) { v.alive = false; stat(p, 'k'); stat(v, 'd'); }
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
// ---------- estatísticas (classificações)
const stat = (p, k) => { if (!p || !p.uid) return; const s = S.stats[p.uid] || (S.stats[p.uid] = { n: p.name, k: 0, d: 0, z: 0 }); s.n = p.name; s[k] = (s[k] || 0) + 1; dirty = true; if (XPG[k]) addXP(p, XPG[k]); };
// ---------- nível: experiência ganha a jogar online (contada aqui, não no aparelho). Do nível L para o L+1 são precisos 100·L
const XPG = { z: 10, k: 50 }; // zombie morto, jogador morto (a fazer coisas: +2 por objeto feito, +3 por cada 2 minutos vivo)
const lvOf = x => { let L = 1, need = 100; x = x || 0; while (x >= need && L < 99) { x -= need; L++; need = 100 * L; } return { lv: L, at: x, need }; };
const connOf = p => { for (const o of players.values()) if (o.p === p) return o; return null; };
const addXP = (p, g) => { if (!p || !p.uid || p.test) return; const s = S.stats[p.uid] || (S.stats[p.uid] = { n: p.name, k: 0, d: 0, z: 0 }); const a = lvOf(s.x).lv; s.x = (s.x || 0) + g; dirty = true; const b = lvOf(s.x), c = connOf(p); if (c) send(c, { t: 'xp', g, x: s.x, ...b, up: b.lv > a }); };
setInterval(() => { for (const c of players.values()) if (c.p && c.p.alive && Date.now() - (c.p.lastSt || 0) < 30e3) addXP(c.p, 3); }, 120e3);
// ---------- amigos: pedido pelo nome, o outro aceita. Ver o nível e quem está online. Funciona também no menu (antes de entrar)
const FR = () => S.fr || (S.fr = {}); const frOf = u => FR()[u] || (FR()[u] = { f: {}, rq: {} });
const tokByName = n => { const lo = n.toLowerCase(); let best = null; for (const [k, t] of Object.entries(S.tokens)) if ((t.name || '').toLowerCase() === lo && (!best || t.t > S.tokens[best].t)) best = k; return best; };
const nameOfU = u => { const s = S.stats[u]; if (s && s.n) return s.n; for (const [k, t] of Object.entries(S.tokens)) if (uidOf(k) === u) return t.name; return '?'; };
const onlineU = () => { const o = new Set(); for (const c of players.values()) if (c.p) o.add(c.p.uid); return o; };
const frRow = (u, on) => { const s = S.stats[u] || {}; return [u, s.n || nameOfU(u), lvOf(s.x).lv, on.has(u) ? 1 : 0]; };
const pfInfo = u => { const s = S.stats[u] || { k: 0, d: 0, z: 0 }, F = frOf(u), on = onlineU(); const out = Object.entries(FR()).filter(([v, G]) => G.rq[u]).map(([v]) => frRow(v, on));
  return { t: 'pf', me: { n: nameOfU(u), x: s.x || 0, ...lvOf(s.x), k: s.k || 0, d: s.d || 0, z: s.z || 0 }, f: Object.keys(F.f).map(v => frRow(v, on)).sort((a, b) => b[3] - a[3] || b[2] - a[2]), rq: Object.keys(F.rq).map(v => frRow(v, on)), out }; };
const friends = (c, u, name, m) => { const now = Date.now(); if (now - (c.frT || 0) < 400) return; c.frT = now; const F = frOf(u), v = typeof m.u === 'string' ? m.u.slice(0, 16) : '';
  const err = e => send(c, { ...pfInfo(u), e });
  if (m.a === 'add') { const n = String(m.n || '').trim(); if (!NAME.test(n)) return err('Escreve o nome do jogador (3 a 16 letras).'); const tk = tokByName(n); if (!tk) return err('Não há nenhum jogador com esse nome.'); const w = uidOf(tk);
    if (w === u) return err('Esse és tu.'); if (F.f[w]) return err('Já são amigos.'); if (Object.keys(F.f).length >= 100) return err('Chegaste ao limite de 100 amigos.');
    const W = frOf(w); if (F.rq[w]) { delete F.rq[w]; F.f[w] = now; W.f[u] = now; delete W.rq[u]; } else { if (Object.keys(W.rq).length >= 50) return err('Esse jogador tem pedidos a mais.'); W.rq[u] = now; const o = [...players.values()].find(q => q.p && q.p.uid === w); if (o) send(o, { t: 'frq', n: name }); else if (now - (W.pt || 0) > 600e3) { W.pt = now; pushTo(w, { title: 'Pedido de amizade', body: name + ' quer ser teu amigo no Kurogane.', tag: 'amigo' }); } }
    dirty = true; return send(c, { ...pfInfo(u), ok: F.f[w] ? 'Agora são amigos.' : 'Pedido enviado a ' + nameOfU(w) + '.' }); }
  if (m.a === 'ok' && F.rq[v]) { delete F.rq[v]; F.f[v] = now; const W = frOf(v); W.f[u] = now; delete W.rq[u]; dirty = true; }
  if (m.a === 'no' && F.rq[v]) { delete F.rq[v]; dirty = true; }
  if (m.a === 'del') { delete F.f[v]; if (FR()[v]) { delete FR()[v].f[u]; delete FR()[v].rq[u]; } dirty = true; }
  if (m.a === 'undo' && FR()[v]) { delete FR()[v].rq[u]; dirty = true; }
  send(c, pfInfo(u)); };
const lboard = c => { const now = Date.now(); if (now - (c.lbT || 0) < 1500) return; c.lbT = now; const L = Object.entries(S.stats), me = S.stats[c.p.uid] || { k: 0, d: 0, z: 0 };
  const byName = new Map(L.map(([, s]) => [s.n.toLowerCase(), s]));
  const clans = Object.values(S.clans).map(C => { let k = 0, d = 0; for (const n of C.membros) { const s = byName.get(n.toLowerCase()); if (s) { k += s.k || 0; d += s.d || 0; } } return [C.nome, k, d, C.membros.length]; }).filter(x => x[1] + x[2] > 0).sort((a, b) => b[1] / Math.max(1, b[2]) - a[1] / Math.max(1, a[2]) || b[1] - a[1]).slice(0, 20);
  send(c, { t: 'lb', pvp: L.filter(([, s]) => s.k || s.d).sort((a, b) => b[1].k - a[1].k || a[1].d - b[1].d).slice(0, 20).map(([, s]) => [s.n, s.k || 0, s.d || 0]), z: L.filter(([, s]) => s.z).sort((a, b) => b[1].z - a[1].z).slice(0, 20).map(([, s]) => [s.n, s.z]), clans, me: [me.k || 0, me.d || 0, me.z || 0], name: c.p.name }); };
// ---------- administração: o Dinis (admin) e moderadores. Tudo confirmado aqui; o cliente só pede
let ADMH = null; try { ADMH = JSON.parse(fs.readFileSync(new URL('./admin.json', import.meta.url), 'utf8')).h; } catch (e) { }
const MODA = new Set(['list', 'goto', 'gopt', 'spec', 'inv', 'kick', 'ban', 'unban', 'freeze']);
const CLAIM = new Map(); // tentativas do código de administrador por IP
const onlineBy = uid => [...players.values()].find(o => o.p && o.p.uid === uid) || null;
const tokOf = uid => Object.keys(S.tokens).find(t => uidOf(t) === uid) || null;
const baseOf = () => { const B = {}; for (const [k, P] of Object.entries(S.w.base.p)) if (k[0] === 'f' && P.u && !B[P.u]) { const [, i, j] = k.split(':'); B[P.u] = [+i * CELL + 1.5, +j * CELL + 1.5]; } return B; };
const tp = (c, x, z) => { const p = c.p; p.x = num(x, -3990, 3990); p.z = num(z, -3990, 3990); p.lv = 0; p.lastSt = Date.now(); p.hist = []; send(c, { t: 'pos', x: p.x, z: p.z, lv: 0, tp: 1 }); };
const admList = c => { const now = Date.now(), B = baseOf(), on = new Set(), cn = id => (S.clans[id] || {}).nome || null;
  const online = [...players.values()].filter(o => o.p).map(o => { on.add(o.p.uid); return { uid: o.p.uid, n: o.p.name, on: 1, x: Math.round(o.p.x), z: Math.round(o.p.z), hp: Math.round(o.p.hp), al: o.p.alive ? 1 : 0, cl: cn(o.p.clan), r: S.roles[o.p.uid] || null, f: o.p.frozen ? 1 : 0, i: o.p.invis ? 1 : 0, g: o.p.god ? 1 : 0, b: B[o.p.uid] || null }; });
  const off = Object.entries(S.tokens).map(([t, T]) => [uidOf(t), t, T]).filter(([u]) => !on.has(u)).sort((a, b) => (b[2].t || 0) - (a[2].t || 0)).slice(0, 150).map(([u, t, T]) => { const sl = S.sleepers[t]; return { uid: u, n: T.name, on: 0, t: T.t || 0, sl: sl ? [Math.round(sl.x), Math.round(sl.z)] : null, cl: cn(T.clan), r: S.roles[u] || null, b: B[u] || null, ban: S.bans[u] ? (S.bans[u].until || 0) : null }; });
  send(c, { t: 'adm', list: { online, off, bans: Object.entries(S.bans).map(([u, b]) => ({ uid: u, n: b.n, until: b.until || 0, why: b.why || '', by: b.by || '', t: b.t || 0 })), clans: Object.entries(S.clans).map(([id, C]) => ({ id, n: C.nome, cod: C.codigo, m: C.membros })), now } }); };
const admFlags = c => send(c, { t: 'admf', r: S.roles[c.p.uid] || null, inv: c.p.invis ? 1 : 0, god: c.p.god ? 1 : 0, spec: c.p.spec ? 1 : 0 });
const setInv = (c, on) => { const p = c.p;  if (!!p.invis === on) return; p.invis = on ? 1 : 0; if (on) bcast({ t: 'left', id: c.id, quiet: 1 }, o => o !== c && !S.roles[o.p.uid]); else bcast({ t: 'join', id: c.id, name: p.name, look: p.look, clan: p.clan, quiet: 1 }, o => o !== c && !S.roles[o.p.uid]); };
const wipeBase = uid => { const out = [], outd = []; for (const [k, P] of Object.entries(S.w.base.p)) if (P.u === uid) pDel(k, out); for (const [id, d] of Object.entries(S.w.base.d)) if (d.u === uid) dDel(id, outd); if (out.length || outd.length) bb({ rp: out, rd: outd }); return out.length + outd.length; };
const adm = (c, m) => { const p = c.p, now = Date.now();
  if (m.t === 'admclaim') { const k = c.ip || 'x', A = CLAIM.get(k) || { n: 0, t: now }; if (now - A.t > 3600e3) { A.n = 0; A.t = now; } if (++A.n > 6) return send(c, { t: 'admno', e: 'Tentaste vezes demais. Espera uma hora.' }); CLAIM.set(k, A);
    const raw = String(m.code || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); if (!ADMH || raw.length !== 20 || crypto.createHash('sha256').update(raw).digest('hex') !== ADMH) return send(c, { t: 'admno', e: 'Código errado' });
    S.roles[p.uid] = 'admin'; dirty = true; S.admLog.push([now, p.name, 'claim']); console.log('admin:', p.name); return admFlags(c); }
  const r = S.roles[p.uid], a = String(m.a || ''); if (!r || !(r === 'admin' || MODA.has(a))) return send(c, { t: 'admno', e: 'Sem permissão' });
  const uid = typeof m.uid === 'string' ? m.uid.slice(0, 16) : '', o = uid ? onlineBy(uid) : null, tok = uid ? tokOf(uid) : null, tn = (o && o.p.name) || (tok && S.tokens[tok].name) || '?';
  if (a !== 'list') { S.admLog.push([now, p.name, a, tn]); if (S.admLog.length > 300) S.admLog.splice(0, 100); dirty = true; }
  if (a === 'list') return admList(c);
  if (a === 'goto') { const B = baseOf(); const P = m.w === 'b' ? B[uid] : o ? [o.p.x, o.p.z] : tok && S.sleepers[tok] ? [S.sleepers[tok].x, S.sleepers[tok].z] : B[uid]; if (!P) return send(c, { t: 'admno', e: 'Não sei onde está' }); tp(c, P[0] + 1.2, P[1] + 1.2); return; }
  if (a === 'gopt') { tp(c, m.x, m.z); return; }
  if (a === 'bring') { if (!o) return send(c, { t: 'admno', e: 'Não está ligado' }); tp(o, p.x + 1.2, p.z + 1.2); send(o, { t: 'admmsg', e: 'Um administrador trouxe-te' }); return; }
  if (a === 'spec' || a === 'inv' || a === 'god') { const on = !!m.on; if (a === 'god') p.god = on ? 1 : 0; else if (a === 'inv') setInv(c, on); else { p.spec = on ? 1 : 0; setInv(c, on); p.god = on ? 1 : p.god && !on ? 0 : p.god; } return admFlags(c); }
  if (a === 'kick') { if (!o) return send(c, { t: 'admno', e: 'Não está ligado' }); if (S.roles[uid] === 'admin' && r !== 'admin') return send(c, { t: 'admno', e: 'Sem permissão' }); send(o, { t: 'erro', e: 'expulso', why: String(m.why || '').slice(0, 120) }); setTimeout(() => drop(o), 300); return admList(c); }
  if (a === 'ban') { if (!uid || uid === p.uid || S.roles[uid] === 'admin') return send(c, { t: 'admno', e: 'Não podes banir este jogador' }); const h = num(m.h, 0, 24 * 3650, 0); S.bans[uid] = { n: tn, until: h ? now + h * 3600e3 : 0, why: String(m.why || '').slice(0, 120), by: p.name, t: now, ip: o ? o.ip : (S.bans[uid] || {}).ip || null }; dirty = true;
    if (m.wipe && r === 'admin') { wipeBase(uid); if (tok) { if (S.sleepers[tok]) { delete S.sleepers[tok]; bcast({ t: 'sleep', list: sleepList() }); } S.led[tok] = { T: {}, inv: null, g: false }; } }
    if (o) { send(o, { t: 'erro', e: 'banido', until: S.bans[uid].until, why: S.bans[uid].why }); setTimeout(() => drop(o), 300); } return admList(c); }
  if (a === 'unban') { delete S.bans[uid]; dirty = true; return admList(c); }
  if (a === 'freeze') { if (!o) return send(c, { t: 'admno', e: 'Não está ligado' }); o.p.frozen = m.on ? 1 : 0; send(o, { t: 'frz', on: o.p.frozen }); return admList(c); }
  if (a === 'kill') { if (!o) return send(c, { t: 'admno', e: 'Não está ligado' }); send(o, { t: 'akill' }); return admList(c); }
  if (a === 'give') { const k = String(m.k || ''), D = ITEMS[k]; if (!D) return; const n = num(m.n, 1, Math.max(1, (D.st || 1) * 10), 1) | 0; const L = ledOf(p); addT(L.T, { [k]: n }); L.pend = { t: Date.now(), k: { ...(L.pend && L.pend.k), [k]: 1 } }; return send(c, { t: 'adgive', k, n }); }
  if (a === 'car') { const id = 'a' + rid(4), yaw = num(p.yaw, -10, 10), x = p.x + Math.sin(yaw) * 4, z = p.z + Math.cos(yaw) * 4; const k = VT[m.k] ? m.k : 'sedan', T = VT[k]; S.w.cars[id] = { k, x, z, yaw, v: 0, fuel: T.tank, hp: T.hp, sx: x, sz: z, syaw: yaw, s: T.seats.map(() => 0), dead: 0, adm: 1 }; dirty = true; return send(c, { t: 'admmsg', e: T.n + ' criado à tua frente' }); }
  if (a === 'drop') { if (S.drop.warn) return send(c, { t: 'admno', e: 'Já vem um avião a caminho' }); const ok = dropWarn(Date.now(), Date.now() + 20e3); return send(c, ok ? { t: 'admmsg', e: 'Avião a caminho: cai daqui a 20 s' } : { t: 'admno', e: 'Não encontrei sítio para o avião' }); }
  if (a === 'delbase') { const n = uid ? wipeBase(uid) : 0; send(c, { t: 'admmsg', e: n ? 'Base apagada (' + n + ' peças)' : 'Não tem base' }); return admList(c); }
  if (a === 'role') { if (!uid || uid === p.uid) return send(c, { t: 'admno', e: 'Não podes mudar o teu cargo' }); const nr = m.r === 'admin' || m.r === 'mod' ? m.r : null; if (nr) S.roles[uid] = nr; else delete S.roles[uid]; dirty = true; if (o) { if (!nr) { if (o.p.invis) setInv(o, false); o.p.god = 0; o.p.spec = 0; } admFlags(o); } return admList(c); }
  if (a === 'clanDel' || a === 'clanKick') { const id = String(m.id || ''), C = S.clans[id]; if (!C) return; const gone = a === 'clanDel' ? [...C.membros] : C.membros.filter(n => n === String(m.n || ''));
    for (const n of gone) { for (const T of Object.values(S.tokens)) if (T.clan === id && (T.name || '') === n) delete T.clan; for (const q of players.values()) if (q.p && q.p.clan === id && q.p.name === n) { q.p.clan = null; send(q, { t: 'clan', info: null }); bcast({ t: 'pclan', id: q.id, clan: null }); } }
    C.membros = C.membros.filter(n => !gone.includes(n)); if (a === 'clanDel' || !C.membros.length) delete S.clans[id]; dirty = true; return admList(c); }
};
const leave = p => { if (!p.clan) return; const C = S.clans[p.clan]; if (C) { C.membros = C.membros.filter(n => n !== p.name); if (!C.membros.length) delete S.clans[p.clan]; } if (S.tokens[p.tok]) delete S.tokens[p.tok].clan; p.clan = null; dirty = true; };

// ---------- imagens do mundo: jogadores 20 por segundo, zombies e carros 10 (só o que está perto; o clã sempre, para o mapa)
let tickN = 0;
const ZR = 300; // zombies que cada um recebe (metros): até onde a luneta deixa ver bem
setInterval(() => {
  const L = [...players.values()].filter(c => c.p), full = (++tickN % 3) === 0; // jogadores 30 vezes por segundo; zombies e carros 10
  for (const c of L) {
    const out = [], staff = !!S.roles[c.p.uid]; for (const o of L) { if (o === c || (o.p.invis && !staff)) continue; const d = Math.hypot(o.p.x - c.p.x, o.p.z - c.p.z), mate = c.p.clan && o.p.clan === c.p.clan; if (d > 320 && !mate) continue; out.push([o.id, +o.p.x.toFixed(2), +o.p.z.toFixed(2), +o.p.y.toFixed(2), o.p.lv, +o.p.yaw.toFixed(2), +o.p.mv.toFixed(2), o.p.an, o.p.w, Math.round(o.p.hp), o.p.alive ? 1 : 0, d > 320 ? 1 : 0, o.p.ar, Math.round(o.p.ts || 0), o.p.gk || '', o.p.sc | 0]); }
    const msg = { t: 's', ps: out };
    // zombies: só os que mudaram desde a última vez (e os que saíram de perto)
    if (full && c.zc) { const u = [], seen = new Set(); const zs = S.w.zs;
      for (let i = 0; i < zs.length; i++) { const z = zs[i], own = z.o === c.id; if (!own && Math.abs(z.x - c.p.x) > ZR) continue; if (!own && (Math.abs(z.z - c.p.z) > ZR || Math.hypot(z.x - c.p.x, z.z - c.p.z) > ZR)) continue;
        seen.add(i); const row = zRow(i, z, own), sig = zSig(z, own, row); if (c.zc.get(i) !== sig) { c.zc.set(i, sig); u.push(row); } }
      const g = []; for (const i of c.zc.keys()) if (!seen.has(i)) { c.zc.delete(i); g.push(i); }
      if (u.length) msg.zu = u; if (g.length) msg.zg = g; }
    if (full && c.cc) { const u = [], seen = new Set(); for (const [id, car] of Object.entries(S.w.cars)) { if (Math.hypot(car.x - c.p.x, car.z - c.p.z) > 400 && car.s.indexOf(c.id) < 0) continue; seen.add(id); const row = cRow(id, car), drv = car.s[0] === c.id, sig = drv ? 'd' + row.slice(5, 12).join() : row.join(); if (c.cc.get(id) !== sig) { c.cc.set(id, sig); u.push(row); } }
      const g = []; for (const id of c.cc.keys()) if (!seen.has(id)) { c.cc.delete(id); g.push(id); } if (u.length) msg.cu = u; if (g.length) msg.cg = g; }
    send(c, msg);
  }
}, 33);
// quem simula cada zombie: o jogador mais perto (até 100 m), e só muda quando outro fica bem mais perto
setInterval(() => {
  const L = [...players.values()].filter(c => c.p); const now = Date.now();
  for (const z of S.w.zs) {
    if (z.st === 3) { z.o = 0; if (now - z.dt > z.re && zNear(z.hx, z.hz, 70) === 0) { Object.assign(z, { x: z.hx, z: z.hz, lv: 0, hp: z.mx, st: 0, mv: 0, limp: 0, dt: 0, h: z.h0, v: z.v0, hd: null, vd: null, re: (360 + Math.random() * 300) * 1000, pet: null }); dirty = true; } continue; }
    if (z.pet) { const own = L.find(c => c.p.uid === z.pet && c.p.alive && Math.hypot(c.p.x - z.x, c.p.z - z.z) < 500); if (own) { z.o = own.id; continue; } if (z.o) { z.o = 0; z.st = 0; z.mv = 0; } continue; } // cão de alguém: só o dono o mexe; sem dono por perto, fica à espera
    let best = null, bd = 1e9, cur = null, cd = 1e9;
    for (const c of L) { const d = Math.hypot(c.p.x - z.x, c.p.z - z.z); if (d < bd) { bd = d; best = c; } if (c.id === z.o) { cur = c; cd = d; } }
    if (cur && cd < 110 && cd < bd + 25) continue;
    if (best && bd < 100) { z.o = best.id; continue; }
    if (z.o) { z.o = 0; if (z.st) z.st = 0; z.mv = 0; } // longe de todos: fica parado onde está
  }
}, 500);
// fornalhas: apagam-se quando acaba a madeira (quem a fechou disse até quando dava)
setInterval(() => { const now = Date.now(), up = []; for (const [id, d] of Object.entries(S.w.base.d)) if (d.on && d.until && now > d.until && !lockOf('d' + id)) { d.on = 0; up.push(dRow(id, d)); } if (up.length) bb({ d: up }); }, 5000);
// mundo com zombies mas sem animais (antes da 0.29): pede a lista a um jogador ligado (os jogos antigos ignoram o pedido)
setInterval(() => { if (!S.w.zs.length || S.w.zs.some(z => z.k >= 3)) return; const now = Date.now(), L = [...players.values()].filter(c => c.p); if (!L.length || L.some(c => c.aseed && now - (c.aseedT || 0) < 20000)) return;
  for (const c of L) c.aseed = false; const c = L[Math.floor(Math.random() * L.length)]; c.aseed = true; c.aseedT = now; send(c, { t: 'aseed' }); }, 6000);
// mundo sem zombies (por exemplo, quem os devia espalhar tinha o jogo antigo): pede a outro jogador ligado
setInterval(() => { if (S.w.zs.length) return; const now = Date.now(), L = [...players.values()].filter(c => c.p); if (!L.length || L.some(c => c.zseed && now - (c.zseedT || 0) < 15000)) return;
  for (const c of L) c.zseed = false; const c = L[Math.floor(Math.random() * L.length)]; c.zseed = true; c.zseedT = now; send(c, { t: 'zseed' }); }, 5000);
setInterval(() => { const now = Date.now(); for (const car of Object.values(S.w.cars)) if (car.hp <= 0 && now - car.dead > 1200e3 && zNear(car.sx, car.sz, 30) === 0) { const T = vt(car.k); Object.assign(car, { x: car.sx, z: car.sz, yaw: car.syaw, v: 0, alt: 0, hp: T.hp, fuel: T.tank ? +(T.tank * (0.2 + Math.random() * 0.45)).toFixed(1) : 0, dead: 0, s: T.seats.map(() => 0) }); dirty = true; } }, 30000);
// ---------- lançamentos aéreos: a cada 30 min (só com gente ligada) um avião cai num sítio ao calhas, longe das terras, da água e das bases.
// 90 s antes, todos recebem o aviso e a zona no mapa; na queda ficam 3 caixas com loot militar do melhor e 10 soldados zombies à volta
const CARV = 3; // 3: sem veículos presos atrás de vedações (0.25)
const DROP_MS = 30 * 60e3, DROP_WARN = 90e3, DROP_LIFE = 40 * 60e3;
if (!S.drop) S.drop = { next: Date.now() + 12 * 60e3 };
if (process.env.KG_DROP_MS) S.drop.next = Date.now() + +process.env.KG_DROP_MS; // testes
const nearBase = (x, z, d) => { for (const k of Object.keys(S.w.base.p)) { if (k[0] !== 'f') continue; const [, i, j] = k.split(':'); if (Math.hypot(+i * CELL - x, +j * CELL - z) < d) return true; } return false; };
// densidade da floresta (igual à do jogo, sectors.js): o avião cai de preferência numa clareira
const fHash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return (h ^ (h >>> 16)) >>> 0; };
const fVn = (x, z) => { const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, s = t => t * t * (3 - 2 * t), h = (a, b) => fHash(a, b) / 4294967296; const a = h(xi, zi), b = h(xi + 1, zi), c = h(xi, zi + 1), d = h(xi + 1, zi + 1), u = s(xf), v = s(zf); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
const forestD = (x, z) => { const n = fVn(x / 260, z / 260) * 0.6 + fVn(x / 90 + 50, z / 90 - 30) * 0.3 + fVn(x / 35 - 9, z / 35 + 4) * 0.1; return Math.max(0, Math.min(1, (n - 0.32) * 1.9)); };
const dropSpot = () => { for (let k = 0; k < 900; k++) { const x = (Math.random() * 2 - 1) * 3700, z = (Math.random() * 2 - 1) * 3700; if (Math.max(Math.abs(x), Math.abs(z)) < 650) continue; if (k < 700 && Math.max(forestD(x, z), forestD(x + 20, z), forestD(x - 20, z), forestD(x, z + 20), forestD(x, z - 20)) > 0.08) continue; if (mapOk() && (wetS(x, z, 40) || groundBad(x - 30, z - 30, x + 30, z + 30))) continue; if (nearBase(x, z, 150)) continue; return [Math.round(x), Math.round(z)]; } return null; };
const dropInfo = () => { const D = S.drop, now = Date.now(); return { warn: D.warn ? { mx: D.warn.mx, mz: D.warn.mz, at: D.warn.at, now } : null, cur: D.cur && now - D.cur.t < DROP_LIFE ? D.cur : null }; };
const dropNow = (now = Date.now()) => { const D = S.drop; if (!D.warn) return; const { x, z } = D.warn, yaw = +(Math.random() * 6.28).toFixed(2); D.warn = null; D.next = now + DROP_MS;
  for (let i = 0; i < 3; i++) { const a = yaw + 1.2 + i * 0.9, r = 9 + i * 3, g = new Grid(6, 6); rollLoot('aereo', g); mkBag(x + Math.cos(a) * r, z + Math.sin(a) * r, 0, 0, g.list.map(e => encSrv(e.it, e.x, e.y)), { body: 2, name: 'Caixa do avião' }); }
  // soldados zombies: 10 lugares fixos na lista, que mudam para o sítio novo a cada queda
  D.zi = (D.zi || []).filter(i => S.w.zs[i] && S.w.zs[i].drop); while (D.zi.length < 10 && S.w.zs.length && S.w.zs.length < 3000) { D.zi.push(S.w.zs.length); S.w.zs.push({ x, z, lv: 0, yaw: 0, hp: 70, mx: 70, k: 1, h: 2, v: 2, h0: 2, v0: 2, hd: null, vd: null, hx: x, hz: z, st: 0, mv: 0, limp: 0, dt: 0, re: 3600e3, o: 0, drop: 1 }); }
  D.zi.forEach((i, n) => { const zb = S.w.zs[i], a = n / 10 * 6.28, r = 14 + Math.random() * 16, zx = x + Math.cos(a) * r, zz = z + Math.sin(a) * r; Object.assign(zb, { x: zx, z: zz, hx: zx, hz: zz, lv: 0, hp: 70, mx: 70, st: 0, mv: 0, limp: 0, dt: 0, h: 2, v: 2, hd: null, vd: null, o: 0, re: 3600e3 }); for (const c of players.values()) if (c.zc) c.zc.delete(i); });
  D.cur = { x, z, yaw, t: now }; dirty = true; bcast({ t: 'drop', ph: 2, x, z, yaw }); console.log('avião caído em', x, z); };
const dropWarn = (now = Date.now(), at = now + DROP_WARN) => { const D = S.drop, s = dropSpot(); if (!s) { D.next = now + DROP_MS; return false; }
  const a = Math.random() * 6.28, r = 40 + Math.random() * 70; D.warn = { x: s[0], z: s[1], mx: Math.round(s[0] + Math.cos(a) * r), mz: Math.round(s[1] + Math.sin(a) * r), at }; D.next = at; dirty = true; bcast({ t: 'drop', ph: 1, mx: D.warn.mx, mz: D.warn.mz, at, now }); return true; };
setInterval(() => { const now = Date.now(), D = S.drop, on = [...players.values()].some(c => c.p);
  if (D.cur && now - D.cur.t > DROP_LIFE) { D.cur = null; dirty = true; bcast({ t: 'drop', ph: 0 }); }
  if (!D.warn && now >= D.next - DROP_WARN) { if (!on) { D.next = now + DROP_WARN + 60e3; return; } dropWarn(now, Math.max(D.next, now + 30e3)); return; }
  if (D.warn && now >= D.warn.at) dropNow(now);
}, 2000);
// tempo: chuva de 3 a 7 min, a cada 10 a 25 min (igual para todos)
setInterval(() => { const now = Date.now(), X = S.w.wx; if (now < X.next) return;
  if (X.r > 0) { X.r = 0; X.next = now + (600 + Math.random() * 900) * 1000; } else { X.r = +(0.5 + Math.random() * 0.5).toFixed(2); X.next = now + (180 + Math.random() * 240) * 1000; }
  dirty = true; bcast({ t: 'wx', r: X.r }); }, 5000);
// limpezas: quem dorme há mais de 3 dias sai do mapa; mochilas velhas desaparecem (corpos 25 min, sacos 15 min); árvores voltam
setInterval(() => { const now = Date.now(); let ch = false;
  for (const [k, s] of Object.entries(S.sleepers)) if (now - s.t > SLEEP_MS) { delete S.sleepers[k]; ch = true; }
  for (const [id, b] of Object.entries(S.bags)) if (now - b.t > (b.body === 2 ? 2400e3 : b.body ? 1500e3 : 900e3) && !lockOf('b' + id)) bagDel(id);
  for (const [k, u] of Object.entries(S.w.nodes)) if (u < now) { delete S.w.nodes[k]; dirty = true; }
  for (const [k, t] of Object.entries(S.tokens)) if (now - t.t > 60 * 24 * 3600e3 && !S.sleepers[k]) delete S.tokens[k];
  if (ch) { dirty = true; bcast({ t: 'sleep', list: sleepList() }); } }, 30000);
// os zombies mexem-se sempre: grava de minuto a minuto mesmo sem outras mudanças
setInterval(() => { if (S.w.zs.length) dirty = true; }, 60000);
process.on('SIGTERM', () => { dirty = true; save(); process.exit(0); });
srv.listen(PORT, '127.0.0.1', () => console.log('kurogane: a ouvir em', PORT));
