// Servidor de jogo do Kurogane: jogadores ligados uns aos outros, PvP decidido aqui, personagens a dormir
// quando saem (dá para as matar e levar o que tinham), mochilas no chão partilhadas e clãs.
// Só módulos do Node (sem dependências). WebSocket feito à mão (RFC 6455, mensagens de texto pequenas).
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const PORT = +process.env.PORT || 3190, DIR = process.env.STATE_DIRECTORY || path.join(process.cwd(), 'dados');
const FILE = path.join(DIR, 'estado.json'), SLEEP_MS = 72 * 3600e3, BAG_MS = 45 * 60e3, MAXP = 60;
// munições: velocidade (m/s), dano, perfuração, arrasto, bagos
const AM = { a9: [360, 30, 1.5, 0.0018], a9s: [300, 27, 1.3, 0.002], a556: [940, 34, 2.8, 0.0012], a762: [715, 40, 2.6, 0.0011], a308: [850, 95, 3.4, 0.0007], a357: [440, 48, 2, 0.0016], c12: [400, 15, 1, 0.004, 8], c12s: [490, 85, 2.2, 0.0022] };
const NAME = /^[A-Za-z0-9_À-ÖØ-öø-ÿ-]{3,16}$/;

// ---------- estado (gravado em disco)
const W0 = () => ({ wv: null, cyc0: Date.now() - 900e3, wx: { r: 0, next: Date.now() + 300e3 }, doors: {}, nodes: {}, ct: {}, zs: [] });
let S = { sleepers: {}, bags: {}, clans: {}, tokens: {}, w: W0() };
try { S = { ...S, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch (e) { }
S.w = { ...W0(), ...(S.w || {}) }; for (const z of S.w.zs) z.o = 0;
// mochilas antigas (só de mortes): passam ao formato novo
for (const b of Object.values(S.bags)) if (b.items && !b.it) { b.it = b.items; delete b.items; b.body = 1; b.y = b.y ?? 0; }
let dirty = false; const save = () => { if (!dirty) return; dirty = false; try { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(FILE + '.tmp', JSON.stringify(S)); fs.renameSync(FILE + '.tmp', FILE); } catch (e) { console.error('gravar', e.message); } };
setInterval(save, 15000);
const rid = n => crypto.randomBytes(n).toString('base64url');

// ---------- WebSocket mínimo
const players = new Map(); let nextId = 1;
const send = (c, o) => { if (c.dead) return; const b = Buffer.from(JSON.stringify(o)); let h; if (b.length < 126) h = Buffer.from([0x81, b.length]); else if (b.length < 65536) { h = Buffer.alloc(4); h[0] = 0x81; h[1] = 126; h.writeUInt16BE(b.length, 2); } else { h = Buffer.alloc(10); h[0] = 0x81; h[1] = 127; h.writeBigUInt64BE(BigInt(b.length), 2); } try { c.sock.write(Buffer.concat([h, b])); } catch (e) { } };
const bcast = (o, pred = () => true) => { for (const c of players.values()) if (c.p && pred(c)) send(c, o); };
const srv = http.createServer((req, res) => {
  if (req.url === '/saude') { res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'no-store' }); res.end(JSON.stringify({ ok: true, jogadores: [...players.values()].filter(c => c.p).length, a_dormir: Object.keys(S.sleepers).length, mochilas: Object.keys(S.bags).length, clas: Object.keys(S.clans).length, zombies: S.w.zs.filter(z => z.st !== 3).length, caixas: Object.keys(S.w.ct).length })); return; }
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

// ---------- caixas e mochilas: só uma pessoa de cada vez mexe em cada uma (não há objetos duplicados)
const LK = new Map(); // chave → { c: id de quem a tem aberta, t }
const KEY = /^(w\d{1,5}|b[A-Za-z0-9_-]{4,12})$/;
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

// ---------- zombies: o servidor guarda todos (posição, vida, proteção); quem está mais perto simula os que tem à volta
// e manda para aqui; os outros veem o mesmo. Dano e mortes passam sempre por aqui.
const zRow = (i, z, own) => [i, Math.round(z.x * 10), Math.round(z.z * 10), z.lv, Math.round(z.yaw * 100), Math.round((z.mv || 0) * 10), z.st, Math.round(z.hp), z.k, z.h, z.v, Math.round((z.limp || 0) * 10), own ? 1 : 0, Math.round(z.hx * 10), Math.round(z.hz * 10)];
// para quem o simula, a posição vem dele: só se volta a mandar quando muda a vida, a proteção ou morre
const zSig = (z, own, row) => own ? 'o' + (z.st === 3 ? 3 : 0) + ',' + row[7] + ',' + z.h + ',' + z.v + ',' + row[11] : row.join();
const zNear = (x, z, r) => { let n = 0; for (const c of players.values()) if (c.p && Math.hypot(c.p.x - x, c.p.z - z) < r) n++; return n; };

// dano num zombie: conta aqui; quem o simula recebe o empurrão (e o zombie vira-se para quem disparou)
const zHit = (c, p, m, now) => { const z = S.w.zs[m.i | 0]; if (!z || z.st === 3 || Math.hypot(z.x - p.x, z.z - p.z) > 900) return;
  z.hp -= num(m.dmg, 0, 2000); if (typeof m.h === 'number') z.h = num(m.h, 0, 4) | 0; if (typeof m.v === 'number') z.v = num(m.v, 0, 4) | 0; if (typeof m.hd === 'number') z.hd = m.hd; if (typeof m.vd === 'number') z.vd = m.vd;
  if (m.limp) z.limp = Math.min(2, (z.limp || 0) + num(m.limp, 0, 2));
  if (z.hp <= 0) { z.hp = 0; z.st = 3; z.dt = now; z.mv = 0; dirty = true; bcast({ t: 'zk', i: m.i | 0, by: c.id, head: m.zone === 'head' ? 1 : 0 }, o => o.p && Math.hypot(o.p.x - z.x, o.p.z - z.z) < 200); return; }
  if (z.o && z.o !== c.id) { const o = players.get(z.o); if (o) send(o, { t: 'zh', i: m.i | 0, dx: num(m.dx, -1, 1), dz: num(m.dz, -1, 1), by: c.id }); } };

// ---------- mensagens
const onMsg = (c, m) => {
  if (!m || typeof m.t !== 'string') return;
  if (m.t === 'hi') {
    if (c.p) return; const name = String(m.name || ''); if (!NAME.test(name)) return send(c, { t: 'erro', e: 'nome' });
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
    const look = m.look && typeof m.look === 'object' ? Object.fromEntries(Object.entries(m.look).filter(([k, v]) => ['skin', 'hair', 'top', 'legs', 'hairS', 'beardS'].includes(k) && typeof v === 'number')) : {};
    const tc = S.tokens[tok].clan, clan = tc && S.clans[tc] ? tc : null;
    c.p = { name, tok, look, x: num(m.x, -4100, 4100), z: num(m.z, -4100, 4100), y: 0, lv: 0, yaw: 0, mv: 0, an: 0, w: '', hp: resume ? resume.hp ?? 100 : 100, alive: true, ar: [0, 0], inv: [], clan, lastShot: 0, hd: null, vd: null };
    c.zc = new Map();
    const zseed = !S.w.zs.length && ![...players.values()].some(o => o !== c && o.zseed); if (zseed) c.zseed = true;
    send(c, { t: 'ok', id: c.id, tok, killed, resume, players: [...players.values()].filter(o => o.p && o !== c).map(o => [o.id, o.p.name, o.p.look, o.p.clan]), sleep: sleepList(), clan: clanInfo(clan),
      w: { cyc0: S.w.cyc0, now, wx: S.w.wx.r, doors: Object.entries(S.w.doors).map(([i, o]) => [+i, o]), nodes: Object.entries(S.w.nodes).map(([k, u]) => [k, u - now]).filter(a => a[1] > 0), bags: bagRows(), zseed } });
    bcast({ t: 'join', id: c.id, name, look, clan }, o => o !== c);
    return;
  }
  const p = c.p; if (!p) return; const now = Date.now();
  if (m.t === 'st') { p.x = num(m.x, -4100, 4100); p.z = num(m.z, -4100, 4100); p.y = num(m.y, -5, 40); p.lv = num(m.lv, 0, 6) | 0; p.yaw = num(m.yaw, -10, 10); p.mv = num(m.mv, 0, 3); p.an = num(m.an, 0, 9) | 0; p.w = typeof m.w === 'string' ? m.w.slice(0, 12) : '';
    const al = !!m.al, hp = num(m.hp, 0, 100, p.hp); if (al && !p.alive) { p.hp = hp; p.hd = p.vd = null; } else p.hp = Math.min(hp, p.hp + 3); p.alive = al; // a vida que o servidor tirou não volta de repente
    if (Array.isArray(m.ar)) { const a = [num(m.ar[0], 0, 4) | 0, num(m.ar[1], 0, 4) | 0]; if (a[0] !== p.ar[0]) p.hd = null; if (a[1] !== p.ar[1]) p.vd = null; p.ar = a; } return; }
  if (m.t === 'inv') { p.inv = cleanIt(m.it).map(({ x, y, ...r }) => r); return; }
  if (m.t === 'shot') { shot(c, m); return; }
  if (m.t === 'died') { // morreu (zombies, queda, outro jogador): o que tinha fica no corpo, que todos veem
    if (!p.alive && !m.force) return; p.alive = false; p.hp = 0; const it = Array.isArray(m.it) ? m.it : p.inv; mkBag(p.x, p.z, num(m.y, -5, 40, p.y), p.lv, it, { body: 1, name: p.name }); p.inv = []; return; }
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
    if (k[0] === 'b') { const b = S.bags[k.slice(1)]; if (!b) return send(c, { t: 'opn', c: k, gone: 1 }); if (Math.hypot(b.x - p.x, b.z - p.z) > 8) return send(c, { t: 'opn', c: k, far: 1 }); LK.set(k, { c: c.id, t: now }); return send(c, { t: 'opn', c: k, it: b.it, body: b.body }); }
    const r = S.w.ct[k]; LK.set(k, { c: c.id, t: now });
    if (!r) return send(c, { t: 'opn', c: k, gen: 1 });
    let roll = 0; if (now > r.next && r.it.length < 2) { roll = 1; r.next = now + 300e3; dirty = true; } // a caixa volta a ter loot passados 5 min (se estiver quase vazia)
    return send(c, { t: 'opn', c: k, it: r.it, roll }); }
  if (m.t === 'ps' || m.t === 'cl') { const k = String(m.c || ''); if (!KEY.test(k)) return; const L = lockOf(k); if (!L || L.c !== c.id) return; const it = cleanIt(m.it); store(k, it); L.t = now;
    if (m.t === 'cl') { LK.delete(k); if (k[0] === 'b' && !it.length) bagDel(k.slice(1)); } return; }
  if (m.t === 'bag') { const x = num(m.x, -4100, 4100), z = num(m.z, -4100, 4100); if (Math.hypot(x - p.x, z - p.z) > 450) return; mkBag(x, z, num(m.y, -5, 40), num(m.lv, 0, 6) | 0, m.it); return; }
  // zombies: a primeira pessoa num mundo novo espalha-os (com as zonas do jogo) e manda a lista
  if (m.t === 'zs') { if (!c.zseed || S.w.zs.length || !Array.isArray(m.L)) return; c.zseed = false;
    S.w.zs = m.L.slice(0, 3000).map(a => { const x = num(a[0], -4100, 4100), z = num(a[1], -4100, 4100), h = num(a[3], 0, 4) | 0, v = num(a[4], 0, 4) | 0, hp = num(a[5], 1, 300, 80);
      return { x, z, lv: 0, yaw: Math.random() * 6.28, hp, mx: hp, k: num(a[2], 0, 2) | 0, h, v, h0: h, v0: v, hd: null, vd: null, hx: x, hz: z, st: 0, mv: 0, limp: 0, dt: 0, re: (360 + Math.random() * 300) * 1000, o: 0 }; });
    dirty = true; return; }
  // quem simula manda a posição dos seus zombies
  if (m.t === 'zu') { if (!Array.isArray(m.L)) return; for (const a of m.L.slice(0, 400)) { const z = S.w.zs[a[0]]; if (!z || z.o !== c.id || z.st === 3) continue;
      z.x = num(a[1], -41000, 41000) / 10; z.z = num(a[2], -41000, 41000) / 10; z.lv = num(a[3], 0, 6) | 0; z.yaw = num(a[4], -1000, 1000) / 100; z.mv = num(a[5], 0, 40) / 10; z.st = num(a[6], 0, 4) | 0; z.limp = num(a[7], 0, 20) / 10; } return; }
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
      if (T.lying) { if (segPt(x, y, z, nx, ny, nz, T.x, by + 0.25, T.z) < 0.9 && Math.abs(ny - by) < 0.6) return { T, zone: 'body', dmg, pen, v: Math.hypot(vx, vy, vz) / v0 }; continue; }
      const hd = segPt(x, y, z, nx, ny, nz, T.x, by + 1.62, T.z); if (hd < 0.17) return { T, zone: 'head', dmg, pen, v: Math.hypot(vx, vy, vz) / v0 };
      // corpo: distância do segmento ao eixo vertical (amostras)
      for (let s = 0; s <= 4; s++) { const sy = by + 0.15 + s * 0.3; if (segPt(x, y, z, nx, ny, nz, T.x, sy, T.z) < 0.3) return { T, zone: sy > 0.85 ? 'body' : 'legs', dmg, pen, v: Math.hypot(vx, vy, vz) / v0 }; } }
    x = nx; y = ny; z = nz; dist += step; }
  return null;
};
const shot = (c, m) => {
  const p = c.p, now = Date.now(); if (!p.alive || now - p.lastShot < 60) return; p.lastShot = now;
  const O = Array.isArray(m.o) ? m.o.map(v => num(v, -4100, 4100)) : null, D = Array.isArray(m.d) ? m.d.map(v => num(v, -1, 1)) : null; if (!O || !D || O.length !== 3 || D.length !== 3) return;
  if (Math.hypot(O[0] - p.x, O[2] - p.z) > 3) return; // a bala tem de sair de perto de ti
  const dl = Math.hypot(D[0], D[1], D[2]) || 1; D[0] /= dl; D[1] /= dl; D[2] /= dl;
  const k = String(m.k || ''), n = Math.min(8, num(m.n, 1, 8, 1) | 0), L = num(m.L, 0, 900, 300), sup = !!m.sup;
  // para os outros: o som e o rasto do tiro
  bcast({ t: 'fx', id: c.id, o: O, d: D, sup }, o => o !== c && Math.hypot(o.p.x - O[0], o.p.z - O[2]) < (sup ? 60 : 400));
  const myClan = p.clan; const tgt = [];
  for (const o of players.values()) if (o !== c && o.p && o.p.alive && (o.p.lv || 0) === (p.lv || 0) && !(myClan && o.p.clan === myClan) && Math.hypot(o.p.x - O[0], o.p.z - O[2]) < L + 3) tgt.push({ x: o.p.x, y: o.p.y, z: o.p.z, c: o });
  for (const [tok, s] of Object.entries(S.sleepers)) if ((s.lv || 0) === (p.lv || 0) && !(myClan && s.clan === myClan) && Math.hypot(s.x - O[0], s.z - O[2]) < L + 3) tgt.push({ x: s.x, y: s.y || 0, z: s.z, sl: tok, lying: true });
  if (!tgt.length) return;
  for (let i = 0; i < n; i++) {
    const sp = n > 1 ? 0.035 : 0; const d = [D[0] + (Math.random() - 0.5) * sp * 2, D[1] + (Math.random() - 0.5) * sp * 2, D[2] + (Math.random() - 0.5) * sp * 2];
    const h = hitTest(O, d, k, L, tgt); if (!h) continue; const T = h.T;
    let dmg = h.dmg * Math.max(0.3, Math.pow(h.v, 1.5)) * (0.9 + Math.random() * 0.2);
    if (T.sl) { const s = S.sleepers[T.sl]; if (!s) continue; s.hp = (s.hp ?? 100) - dmg; if (s.hp <= 0) { delete S.sleepers[T.sl]; if (S.tokens[T.sl]) S.tokens[T.sl].killed = true; mkBag(s.x, s.z, s.y || 0, s.lv || 0, s.inv, { body: 1, name: s.name }); bcast({ t: 'sleep', list: sleepList() }); send(c, { t: 'hitc', zone: h.zone, kill: true, name: s.name }); } else send(c, { t: 'hitc', zone: h.zone }); dirty = true; continue; }
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

// ---------- imagens do mundo: 10 por segundo, só o que está perto (o clã sempre, para o mapa)
const ZR = 130; // zombies que cada um recebe (metros)
setInterval(() => {
  const L = [...players.values()].filter(c => c.p);
  for (const c of L) {
    const out = []; for (const o of L) { if (o === c) continue; const d = Math.hypot(o.p.x - c.p.x, o.p.z - c.p.z), mate = c.p.clan && o.p.clan === c.p.clan; if (d > 320 && !mate) continue; out.push([o.id, +o.p.x.toFixed(2), +o.p.z.toFixed(2), +o.p.y.toFixed(2), o.p.lv, +o.p.yaw.toFixed(2), +o.p.mv.toFixed(2), o.p.an, o.p.w, Math.round(o.p.hp), o.p.alive ? 1 : 0, d > 320 ? 1 : 0, o.p.ar]); }
    const msg = { t: 's', ps: out };
    // zombies: só os que mudaram desde a última vez (e os que saíram de perto)
    if (c.zc) { const u = [], seen = new Set(); const zs = S.w.zs;
      for (let i = 0; i < zs.length; i++) { const z = zs[i], own = z.o === c.id; if (!own && Math.abs(z.x - c.p.x) > ZR) continue; if (!own && (Math.abs(z.z - c.p.z) > ZR || Math.hypot(z.x - c.p.x, z.z - c.p.z) > ZR)) continue;
        seen.add(i); const row = zRow(i, z, own), sig = zSig(z, own, row); if (c.zc.get(i) !== sig) { c.zc.set(i, sig); u.push(row); } }
      const g = []; for (const i of c.zc.keys()) if (!seen.has(i)) { c.zc.delete(i); g.push(i); }
      if (u.length) msg.zu = u; if (g.length) msg.zg = g; }
    send(c, msg);
  }
}, 100);
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
