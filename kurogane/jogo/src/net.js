// Modo online: liga ao servidor de jogo, mostra os outros jogadores, manda os teus tiros (o servidor decide
// quem acerta), mostra quem está a dormir e as mochilas de quem morreu, e trata dos clãs.
import * as THREE from 'three';
import { track, push, sample } from './interp.js';
import { ITEMS } from './items.js';

const MODES = ['none', 'pistol', 'rifle', 'melee'];
// som do tiro dos outros pelo calibre (gravações reais)
const AMSND = { a9: 'pistola', a9s: 'pistola', a556: 'm4', a762: 'ak', a308: 'caca', a357: 'revolver', c12: 'cacadeira', c12s: 'cacadeira', a408: 'pesado', a50: 'pesado', a754: 'ak' };

const angD = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
export function makeNet({ G, scene, mkRemote, audio, Conta, enc, dec, hurt, die, wallEnd, muzzle, world, WV }) {
  let ws = null, tok = null, sendT = 0, invT = 0, retry = 0, want = false, off = 0, cyc0 = 0, cur = null, psT = 0, zT = 0; const zdQ = [];
  const R = new Map(), sleepers = new Map();
  const tags = document.createElement('div'); tags.id = 'tags'; { const h = document.getElementById('hud'); if (h && h.parentNode) h.parentNode.insertBefore(tags, h); else document.body.appendChild(tags); } // por baixo do HUD e dos ecrãs por cima
  const N = { on: false, world: false, id: null, clan: null, clanInfo: null, R };
  const url0 = () => { try { const o = localStorage.getItem('kg.srv'); if (o) return o; } catch (e) { } return window.KG_ONLINE ? (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/srv/ws' : 'wss://kurogane.2-31-13-85.sslip.io/srv/ws'; };
  const url = () => G.ARENA ? url0().replace(/\/ws$/, '/arena') : url0(); // a arena é outra sala no mesmo servidor
  const tokKey = () => 'kg.tok.' + ((Conta.ativo() || {}).id || 'x');
  const send = o => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };
  const tag = (name, cls) => { const e = document.createElement('div'); e.className = 'ntag' + (cls ? ' ' + cls : ''); e.textContent = name; e.style.display = 'none'; tags.appendChild(e); return e; };
  const mate = c => !!(N.clan && c === N.clan);
  const addRemote = (id, name, look, clan) => {
    if (R.has(id)) return R.get(id); const b = mkRemote(look); b.root.visible = false;
    const r = { id, name, clan, b, el: tag(name, mate(clan) ? 'mate' : ''), s1: null, T: track(), o: {}, x: 0, z: 0, y: 0, step: 0, spd: 0, w: null, ar: '' };
    R.set(id, r); return r;
  };
  const delRemote = id => { const r = R.get(id); if (!r) return; scene.remove(r.b.root); r.el.remove(); R.delete(id); };
  const setSleepers = list => {
    for (const s of sleepers.values()) { scene.remove(s.b.root); s.el.remove(); } sleepers.clear();
    for (const [k, x, z, lv, yaw, name, look, clan] of list) { const b = mkRemote(look); b.pose(0, 0, 'none'); b.root.position.set(x, 0.16, z); b.root.rotation.set(-Math.PI / 2, yaw, 0, 'YXZ'); b.root.visible = false; sleepers.set(k, { x, z, lv, yaw, b, name, el: tag(name + ' · a dormir', 'sleep') }); }
  };
  const clearAll = () => { for (const id of [...R.keys()]) delRemote(id); setSleepers([]); };
  // deixa de estar ligado: os sacos do servidor saem e as caixas voltam a ser deste aparelho
  const offline = () => { if (!N.world) return; N.world = false; cur = null; for (const b of [...G.bags]) if (b.nid) world.bags(null, [b.nid]); for (const c of G.W.containers) if (c.wid != null && !c.own) { c.grid = null; c.next = 0; } zdQ.length = 0; world.z.offline(); world.leave(); };
  const onMsg = m => {
    switch (m.t) {
      case 'ok': {
        N.id = m.id; if (!G.ARENA && typeof m.tok === 'string' && m.tok.length === 32) { tok = m.tok; try { localStorage.setItem(tokKey(), tok); } catch (e) { } } /* a arena não tem código: nunca apaga o do mundo */ N.on = true; if (m.xp) N.xp = m.xp; retry = 0; found();
        clearAll(); for (const [id, name, look, clan] of m.players) addRemote(id, name, look, clan); setSleepers(m.sleep); N.clan = m.clan ? m.clan.id : null; N.clanInfo = m.clan; if (G.ARENA && m.clan && /^arena-/.test(m.clan.id)) { const t = m.clan.id === 'arena-b' ? 1 : 0; if (t !== G.arenaTeam) { G.arenaTeam = t; if (G.arenaRespawn && G.p && G.p.alive) G.arenaRespawn(); G.ui.toast('Equipas equilibradas: ficaste na ' + (t ? 'Azul' : 'Vermelha')); } }
        if (G.airdrop) G.airdrop({ ph: 9, ...(m.drop || {}) });
        N.role = m.role || null; G.admF = { r: N.role, inv: 0, god: 0, spec: 0 }; G.frozen = false; G.ui.admRole && G.ui.admRole(N.role);
        off = m.w.now - Date.now(); cyc0 = m.w.cyc0; N.uid = m.uid; N.vapid = m.vapid || null; N.world = true; if (G.pushResub) G.pushResub(); cur = null; world.reset(m.w); if (m.inv && !m.killed && G.loadInv) G.loadInv(m.inv); invSig = '';
        const n = m.players.length; G.ui.toast(n ? `Online · ${n} ${n === 1 ? 'jogador ligado' : 'jogadores ligados'}` : 'Online · estás sozinho no servidor por agora');
        if (m.killed) { G.ui.toast('Mataram-te enquanto dormias'); die('dormir'); }
        else if (m.resume && G.p) { if (m.cont && !G.ARENA) { const r = m.resume; G.p.x = r.x; G.p.z = r.z; G.p.y = r.y || 0; G.p.lv = r.lv || 0; if (r.yaw != null) G.p.yaw = r.yaw; G.p.vx = G.p.vz = 0; if (G.aimS) G.aimS.fy = G.p.yaw; G.ui.toast('Acordaste onde adormeceste, com o que tinhas.'); } if (m.resume.hp != null && m.resume.hp < G.p.hp) G.p.hp = Math.max(1, m.resume.hp); }
        if (m.arena) { N.arena = { s: m.arena.score, n: m.arena.n, L: [] }; G.ui.arenaScore && G.ui.arenaScore(N.arena); }
        if (G.ARENA && G.p && G.p.alive) send({ t: 'aspawn', x: G.p.x, z: G.p.z });
        if (!G.ARENA) N.sendInv(); if (N.onClan) N.onClan(); return;
      }
      case 'erro': { const w = ws; ws = null; if (m.e === 'versao') { G.updating = true; lost(true, 'Há uma versão nova do jogo. A atualizar…'); setTimeout(() => location.reload(), 1200); } else lost(true, m.e === 'expulso' ? 'Foste expulso do servidor' + (m.why ? ': ' + m.why : '') : m.e === 'banido' ? 'Estás banido do servidor' + (m.until ? ' até ' + new Date(m.until).toLocaleString('pt-PT', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : '') + (m.why ? ' · ' + m.why : '') : m.e === 'nome_em_uso' ? 'Esse nome já é de outro jogador. Muda o nome do perfil e entra outra vez.' : m.e === 'versao' ? 'Há uma versão nova do jogo. Recarrega a página para jogar online.' : 'O nome do perfil não serve para o servidor (3 a 16 letras ou números).'); try { w && w.close(); } catch (e) { } return; }
      case 'join': addRemote(m.id, m.name, m.look, m.clan); if (!m.quiet) G.ui.toast(m.name + ' entrou'); return;
      case 'left': { const r = R.get(m.id); if (r && !m.quiet) G.ui.toast(r.name + (m.arena ? ' saiu da arena' : ' saiu e ficou a dormir')); delRemote(m.id); return; }
      case 'akf': G.ui.arenaFeed && G.ui.arenaFeed(m); return;
      case 'asc': N.arena = m; G.ui.arenaScore && G.ui.arenaScore(m); return;
      case 'adm': G.ui.admList && G.ui.admList(m.list); return;
      case 'admf': N.role = m.r; G.admF = { r: m.r, inv: m.inv, god: m.god, spec: m.spec }; G.ui.admRole && G.ui.admRole(m.r, true); return;
      case 'admno': G.ui.toast(m.e || 'Não deu'); G.ui.admErr && G.ui.admErr(m.e); return;
      case 'admmsg': G.ui.toast(m.e); return;
      case 'frz': G.frozen = !!m.on; G.ui.toast(m.on ? 'Foste congelado por um administrador' : 'Já te podes mexer'); return;
      case 'akill': if (G.p && G.p.alive) die('admin'); return;
      case 'adgive': G.gain(m.k, m.n); G.ui.toast('Recebeste ' + m.n + ' × ' + m.k); return;
      case 'lb': G.ui.lbShow && G.ui.lbShow(m); return;
      case 'pf': if (pfWait) { const f = pfWait; pfWait = null; f(m); } return;
      case 'xp': N.xp = m; G.setLv && G.setLv(m.lv); if (m.up && G.refreshWeapon) G.refreshWeapon(); G.ui.xp && G.ui.xp(m); return;
      case 'frq': G.ui.toast(m.n + ' quer ser teu amigo. Aceita no menu, em Perfil.'); audio.play && audio.play('ui'); return;
      case 's1': rowIn(m.p, performance.now()); return;
      case 's': {
        const now = performance.now(), seen = new Set();
        for (const a of m.ps) { const r = rowIn(a, now); if (r) seen.add(r.id); }
        for (const r of R.values()) if (!seen.has(r.id)) { r.s1 = null; r.T = track(); r.b.root.visible = false; r.el.style.display = 'none'; }
        if (m.zu) world.z.rows(m.zu); if (m.zg) world.z.gone(m.zg); if (m.cu) G.cars.rows(m.cu); if (m.cg) G.cars.gone(m.cg);
        return;
      }
      case 'fx': {
        const p = G.p, d = p ? Math.hypot(m.o[0] - p.x, m.o[2] - p.z) : 99;
        { const v = Math.max(0.04, 1 - d / (m.sup ? 70 : m.hv ? 480 : 320)) * (m.sup ? 0.6 : 1), far = Math.max(0, Math.min(1, (d - 35) / 220));
          if (m.sup) audio.play('abafado', v); else if (!audio.shot(AMSND[m.k] || (m.hv ? 'pesado' : 'pistola'), v, far)) audio.play(m.hv ? 'grosso' : 'pistola', v); }
        wallEnd(m.o, m.d); if (muzzle) muzzle(m.o, m.d, m.sup, m.id); if (G.noise) G.noise(m.o[0], m.o[2], m.sup ? 12 : 34); if (G.heardShot && d < 300) G.heardShot(); if (p && d > 2.5) G.ui.sound(m.o[0], m.o[2], 't', d); return;
      }
      case 'hit': hurt(m.dmg, m.by, m.zone, m.pop, m.car ? 'carro' : null); return;
      case 'hitc': { if (m.zone === 'car') { G.ui.hit(false, 'car', true, null); return; } const r = m.on != null ? R.get(m.on) : null; G.ui.hit(!!m.kill, m.zone, false, r ? new THREE.Vector3(r.x, (r.y || 0) + (m.zone === 'head' ? 1.6 : 1.1), r.z) : null); G.buzz && G.buzz(m.kill ? [25, 40, 35] : 14); if (m.kill) G.ui.toast('Abateste ' + (m.name || 'um jogador')); return; }
      case 'sleep': setSleepers(m.list); return;
      case 'dr': world.door(m.i, m.o); return;
      case 'nd': world.node(m.k, m.ms); return;
      case 'wx': world.wx(m.r); return;
      case 'drop': G.airdrop && G.airdrop(m); return;
      case 'zk': world.z.killed(m.i, m.by, m.head); return;
      case 'zh': world.z.hit(m.i, m.dx, m.dz); return;
      case 'zat': hurt(m.dmg, null, 'body', null, 'zombie'); return;
      case 'cin': { const c = G.cars.list.find(q => q.id === m.id); if (m.ok && c) G.cars.seated(c, m.seat); else G.ui.toast('Esse lugar já está ocupado'); return; }
      case 'fix': if (G.fixInv) G.fixInv(m.T); invSig = ''; return;
      case 'pos': if (G.p) { G.p.x = m.x; G.p.z = m.z; G.p.vx = G.p.vz = 0; } return;
      case 'boxfix': if (cur && cur.key === m.c && cur.c.grid) { const g = cur.c.grid; for (const e of [...g.list]) g.remove(e.it); for (const o of m.it || []) { const it = world.dec(o); if (it) { if (g.fits(it, o.x, o.y)) g.add(it, o.x, o.y); else g.insert(it); } } cur.sig = sigOf(cur.c); G.ui.refresh(true); } return;
      case 'zseed': if (N.world) N.zseed(world.z.seed()); return;
      case 'aseed': if (N.world) send({ t: 'as', L: world.z.aseed() }); return;
      case 'bb': world.base(m); return;
      case 'bno': if (m.a === 'lkc') { G.ui.codeErr(m.e); return; } if (m.lk && m.a === 'bdo') { const P = G.base.pieces.get(m.k); if (P) { G.ui.codeAsk({ door: P }); return; } } G.ui.toast(m.e || 'Não deu'); G.base.refused(m.a, m.k); return;
      case 'lkok': G.base.lockOk(m); G.ui.codeDone(m); return;
      case 'bxok': G.base.demolished(m.tt); return;
      case 'bdok': if (m.pick) G.base.picked(m.pick, m.lb); else G.base.deployed(m.k); return;
      case 'boom': window.__booms = (window.__booms || 0) + 1; world.boom(m); return;
      case 'thr': world.thr(m); return;
      case 'lk': world.lock(m.i, m.hp, m.broke); return;
      case 'bg': world.bags(m.add, m.del); return;
      case 'opn': { if (!cur || cur.key !== m.c) return; const gen = world.opened(cur.c, m); if (G.box !== cur.c) { cur = null; return; } cur.sig = gen ? '' : sigOf(cur.c); cur.open = true; return; }
      case 'clan': if (m.erro) { if (N.onClan && N.onClan(m.erro)) return; G.ui.toast(m.erro); return; } else { N.clan = m.info ? m.info.id : null; N.clanInfo = m.info; for (const r of R.values()) r.el.classList.toggle('mate', mate(r.clan)); if (G.ARENA && m.info && /^arena-/.test(m.info.id)) { const t = m.info.id === 'arena-b' ? 1 : 0; if (t !== G.arenaTeam) { G.arenaTeam = t; if (G.arenaRespawn && G.p && G.p.alive) G.arenaRespawn(); G.ui.toast('Essa equipa tinha mais jogadores: ficaste na ' + (t ? 'Azul' : 'Vermelha')); } } } if (N.onClan) N.onClan(); return;
      case 'pclan': { const r = R.get(m.id); if (r) { r.clan = m.clan; r.el.classList.toggle('mate', mate(m.clan)); } return; }
    }
  };
  // sem modo offline: só se joga depois de o servidor dizer «ok»; se a ligação cair, o jogo para e tenta voltar; se não voltar, regressa ao menu
  let joinT = 0;
  const ov = (title, txt) => { const el = document.getElementById('netLost'); if (!el) return; const b = el.querySelector('b'), t = document.getElementById('netLostT'); if (b) b.textContent = title; if (t) t.textContent = txt; el.hidden = false; };
  const lost = (final, why) => { const el = document.getElementById('netLost'); if (final) { want = false; clearTimeout(joinT); if (el) el.hidden = true; G.paused = false; if (G.playing || G.ARENA) G.toMenu(); const msg = why || 'Sem ligação ao servidor. O Kurogane só se joga online: tenta outra vez daqui a pouco.'; setTimeout(() => { if (G.ui.note) G.ui.note(msg); else G.ui.toast(msg); }, 120); return; }
    if (!G.playing) return; G.paused = true; ov('Sem ligação ao servidor', 'A tentar outra vez… (' + retry + ' de 6)'); };
  const found = () => { clearTimeout(joinT); const el = document.getElementById('netLost'); if (el && !el.hidden) { el.hidden = true; G.paused = false; } };
  const connect = () => {
    if (ws || !want) return; const a = Conta.ativo(); if (!a || !a.nome) { lost(true, 'Falta o nome do perfil para entrar no servidor.'); return; }
    try { tok = localStorage.getItem(tokKey()); } catch (e) { }
    let opened = false; try { ws = new WebSocket(url()); } catch (e) { ws = null; lost(true); return; }
    ws.onopen = () => { opened = true; if (G.ARENA) { send({ t: 'hi', pv: 4, name: a.nome, look: a.look || {}, team: G.arenaTeam | 0, kit: G.arenaKitK }); return; } send({ t: 'hi', pv: 4, name: a.nome, look: a.look || {}, tok, wv: WV, x: G.p ? G.p.x : 0, z: G.p ? G.p.z : 0, cars: G.cars.spawnPoints(), ctab: G.W.containers.filter(c => c.wid != null).sort((a, b) => a.wid - b.wid).map(c => [c.table, c.slots[0], c.slots[1]]), fresh: !!G.freshStart, test: (() => { try { return localStorage.getItem('kg.test') === '1'; } catch (e) { return false; } })() }); G.freshStart = false; };
    ws.onmessage = e => { try { onMsg(JSON.parse(e.data)); } catch (er) { console.error(er); } };
    ws.onclose = () => {
      const was = N.on; ws = null; N.on = false; clearAll(); offline();
      if (!want) return;
      if (retry < 6) { retry++; lost(false); setTimeout(connect, 1500 * retry); }
      else lost(true);
    };
  };
  N.start = () => { want = true; retry = 0; if (!N.on) { if (G.playing) G.paused = true; ov('A entrar no servidor', 'Só um momento…'); clearTimeout(joinT); joinT = setTimeout(() => { if (want && !N.on) { const w = ws; ws = null; lost(true, 'O servidor não respondeu a tempo. O Kurogane só se joga online: tenta outra vez.'); try { w && w.close(); } catch (e) { } } }, 15000); } connect(); };
  N.stop = () => { want = false; clearTimeout(joinT); { const el = document.getElementById('netLost'); if (el) el.hidden = true; } if (ws) { try { if (N.on) { closeBox(); N.sendInv(); } ws.close(); } catch (e) { } } ws = null; N.on = false; clearAll(); offline(); };
  // o tiro vai com a direção de cada bala (o desvio que viste no rasto) e até onde cada uma chega antes de parar numa parede ou num zombie
  const v4 = v => [+v.x.toFixed(4), +v.y.toFixed(4), +v.z.toFixed(4)];
  // vt: a hora (do relógio de cada alvo) a que o estavas a ver quando disparaste: o servidor põe-no onde o viste
  N.shot = (O, D, k, n, L, sup, ds, Ls) => { const vt = []; for (const r of R.values()) if (r.b.root.visible && r.rt > 0 && vt.length < 12) vt.push([r.id, Math.round(r.rt)]); send({ t: 'shot', o: [+O.x.toFixed(2), +O.y.toFixed(2), +O.z.toFixed(2)], d: v4(D), k, n, L: Math.round(L), sup: !!sup, ds: ds ? ds.map(v4) : undefined, Ls: Ls ? Ls.map(v => Math.round(v * 10) / 10) : undefined, vt }); };
  // quem está à vista para levar um tiro (para a mira e para o rasto pararem neles)
  N.targets = () => { const out = []; for (const r of R.values()) if (r.b.root.visible && r.al !== false) out.push({ x: r.x, y: r.y || 0, z: r.z, sc: r.sc || 0, yaw: r.b.root.rotation.y - (r.lr || 0), lr: r.lr || 0, an: r.an | 0, mv: r.mvS || 0 }); for (const s of sleepers.values()) if (s.b.root.visible) out.push({ x: s.x, y: 0.16, z: s.z, yaw: s.yaw || 0, lie: 1, lying: true }); return out; };
  N.died = by => send(G.ARENA ? { t: 'died', by: by || null } : { t: 'died', it: G.inv.all().map(enc), force: 1 });
  // mundo partilhado
  N.cyc = () => (((Date.now() + off - cyc0) / 1000) % 1920 + 1920) % 1920;
  // linha de estado de outro jogador (vem na volta do servidor, «s», ou logo que ele a manda, «s1»)
  const rowIn = (a, now) => { const r = R.get(a[0]); if (!r) return null; if (r.s1 && (Math.hypot(a[1] - r.s1[1], a[2] - r.s1[2]) > 25 || a[4] !== r.s1[4])) r.T = track(); r.s1 = a; push(r.T, a[13] || now, now, { x: a[1], z: a[2], y: a[3], yaw: a[5], a });
          if (G.ARENA) r.b.setTeam(r.clan === 'arena-b' ? 1 : r.clan === 'arena-r' ? 0 : null);
          const ar = a[12] || [0, 0], gk = typeof a[14] === 'string' ? a[14] : null, ak = gk ?? ar.join(); if (ak !== r.ar) { r.ar = ak; if (gk != null) { const q = gk.split(','), e = {}; ['head', 'vest', 'suit', 'eyes', 'back'].forEach((s, i) => { if (q[i] && ITEMS[q[i]]) e[s] = { k: q[i] }; }); r.b.setGear(e); r.gh = !!e.suit; } else r.b.setGear({ head: ar[0] ? { k: 'capacete' } : null, vest: ar[1] ? { k: 'colete' } : null }); }
          if (r.w !== a[8]) { r.w = a[8]; const q = String(a[8] || '').split('~'); r.wi = q[0]; r.b.setWeapon(q[0] || null, { skin: q[1] | 0 }); } return r; };
  N.raw = o => send(o);
  // perfil e amigos: dentro do jogo vai pela ligação que já existe; no menu abre uma ligação curta só para isto
  let pfWait = null;
  N.pf = (o = {}) => new Promise(res => {
    const done = m => { clearTimeout(to); res(m); }, to = setTimeout(() => { pfWait = null; res({ t: 'pf', e: 'rede' }); }, 7000);
    if (ws && ws.readyState === 1 && N.on && !G.ARENA) { pfWait = done; send({ ...o, t: 'pf' }); return; }
    let k = null; try { k = localStorage.getItem(tokKey()); } catch (e) { } if (!k) { done({ t: 'pf', none: true }); return; }
    let w; try { w = new WebSocket(url0()); } catch (e) { done({ t: 'pf', e: 'rede' }); return; }
    w.onopen = () => w.send(JSON.stringify({ ...o, t: 'pf', tok: k }));
    w.onmessage = ev => { let m = null; try { m = JSON.parse(ev.data); } catch (e) { } if (m && m.t === 'pf') { try { w.close(); } catch (e) { } done(m); } };
    w.onerror = () => done({ t: 'pf', e: 'rede' }); });
  N.door = (i, o) => send({ t: 'dr', i, o: o ? 1 : 0 });
  // zombies: lista inicial (mundo novo), dano (junto num só envio por imagem) e ataques a outros jogadores
  N.zseed = L => send({ t: 'zs', L });
  N.zd = o => zdQ.push(o);
  N.zatk = (i, to, dmg) => send({ t: 'za', i, to, dmg: +dmg.toFixed(1) });
  N.node = k => send({ t: 'nd', k });
  N.bag = (x, z, y, lv, it) => send({ t: 'bag', x: +x.toFixed(2), z: +z.toFixed(2), y: +y.toFixed(2), lv, it });
  // caixas e sacos: pede ao servidor (só uma pessoa de cada vez); enquanto estiver aberta vai mandando o que tem; ao fechar manda o fim
  const keyOf = c => c.nid ? 'b' + c.nid : c.did ? 'd' + c.did : 'w' + c.wid;
  const sigOf = c => c.grid ? JSON.stringify(world.encG(c.grid)) : '';
  const closeBox = () => { if (!cur) return; if (cur.open && cur.c.grid) { const d = cur.c.dep, o = { t: 'cl', c: cur.key, it: world.encG(cur.c.grid) }; if (d && (d.k === 'fornalha' || d.k === 'fogueira')) o.fu = { on: d.on ? 1 : 0, until: G.base.furnUntil(d) }; send(o); } cur = null; };
  N.open = c => { closeBox(); cur = { key: keyOf(c), c, open: false, t: performance.now() }; send({ t: 'op', c: cur.key }); };
  N.clanCmd = (a, v) => send({ t: 'clan', a, nome: v, codigo: v });
  N.adm = (a, o = {}) => send({ ...o, t: 'adm', a }); N.admClaim = code => send({ t: 'admclaim', code }); N.lb = () => send({ t: 'lb' });
  // com uma caixa aberta, o que mudou nela vai primeiro: assim o servidor já sabe que tiraste de lá quando vê o teu inventário (e não o corrige por engano)
  let invSig = ''; N.sendInv = () => { if (!G.invLayout || !G.inv) return; if (cur && cur.open && cur.c && cur.c.grid) { const s0 = sigOf(cur.c); if (s0 !== cur.sig) { cur.sig = s0; send({ t: 'ps', c: cur.key, it: world.encG(cur.c.grid) }); } } const L = G.invLayout(), sg = JSON.stringify(L); if (sg === invSig) return; invSig = sg; send({ t: 'inv', ...L }); };
  N.near = (x, z, r) => { for (const o of R.values()) if (o.s1 && Math.hypot(o.s1[1] - x, o.s1[2] - z) < r) return true; for (const s of sleepers.values()) if (Math.hypot(s.x - x, s.z - z) < r) return true; return false; };
  // cada imagem: o teu estado para o servidor (10 por segundo) e os outros no sítio certo, 100 ms atrás (para andarem suaves)
  const _v = new THREE.Vector3();
  const place = (el, x, y, z) => { _v.set(x, y, z); const q = G.proj(_v); if (!q.ok) { el.style.display = 'none'; return; } el.style.display = ''; el.style.transform = `translate(${q.x.toFixed(0)}px,${q.y.toFixed(0)}px) translate(-50%,-100%)`; };
  N.frame = (dt, me, see, los) => {
    if (!N.on) return; const now = performance.now();
    { const hide = G.mapOpen || G.invOpen || G.paused || !G.playing; if (tags.hidden !== hide) tags.hidden = hide; }
    if (me && now - sendT >= 32) { sendT = now; /* 30 vezes por segundo: os outros veem-te com menos atraso */ send({ t: 'st', ...me, ts: Math.round(now) }); if (N.world) { const ca = G.cars.up(); if (ca) send({ t: 'cu', L: [ca] }); } }
    if (zdQ.length) { send({ t: 'zd', L: zdQ.splice(0, 40) }); }
    zT -= dt; if (zT <= 0 && N.world) { zT = 0.066; const L = world.z.up(); if (L.length) send({ t: 'zu', L, ts: Math.round(now) }); }
    if (cur) { if (cur.open && G.box !== cur.c) closeBox(); else if (cur.open) { psT -= dt; if (psT <= 0) { psT = 0.4; const sg = sigOf(cur.c); if (sg !== cur.sig) { cur.sig = sg; send({ t: 'ps', c: cur.key, it: world.encG(cur.c.grid) }); } } } else if (performance.now() - cur.t > 4000) cur = null; }
    invT -= dt; if (invT <= 0) { invT = 3; N.sendInv(); }
    const lv = me ? me.lv : 0;
    if (G.ARENA && !G.dbgNoVis) { visT -= dt; if (visT <= 0) { visT = 0.35; const L = []; for (const r of R.values()) if (r.seen && !mate(r.clan)) L.push(r.id); send({ t: 'vis', L }); } }
    for (const r of R.values()) {
      if (!r.s1) continue; const S = sample(r.T, now, r.o); if (!S) continue; const b = S.s.a, x = S.x, z = S.z, y = S.y; r.rt = S.rt; r.an = b[7] | 0; r.mvS = b[6] || 0;
      const dd = Math.hypot(x - r.x, z - r.z); r.spd += (Math.min(9, dd / Math.max(dt, 1e-3)) - r.spd) * Math.min(1, dt * 8);
      { if (dd > 0.003) r.my = Math.atan2(x - r.x, z - r.z); const rel = r.my == null ? 0 : angD(r.my, S.yaw); r.back = r.spd > 0.6 && Math.abs(rel) > 1.95; r.step += dd * 2.6 * (r.back ? -1 : 1); } r.x = x; r.z = z; r.y = y; // a andar para trás, as pernas andam ao contrário
      // passos dos outros: ouve-se quem anda perto (a correr de mais longe), mesmo sem o ver
      if (me && r.spd > 0.9 && r.spd < 7.5 && !b[11] && b[10]) { const run = r.spd > 3.5; r.sd = (r.sd || 0) + dd; if (r.sd >= (run ? 1.7 : 1.15)) { r.sd = 0; const d = Math.hypot(x - me.x, z - me.z), q = 1 - d / (run ? 34 : 18); if (q > 0 && audio.sample) audio.sample('passo-' + (G.W.paved && G.W.paved(x, z) ? 'betao' : 'relva'), q * q * (run ? 0.8 : 0.45), { vary: 0.12, lp: d > 9 ? 2200 : 0, pan: Math.max(-0.8, Math.min(0.8, (x - me.x) / 14)) }); } }
      // arena: radar (colegas sempre; inimigos quando disparam ou um colega os vê, a aparecer e a desaparecer devagar) e o corpo de quem morre cai
      const al = !!b[10]; if (G.ARENA) { if (!al && r.al !== false) r.deadT = now; if (al && r.al === false) { r.deadT = 0; r.w = undefined; } r.al = al; const sp = !!(b[16] || (r.s1 && r.s1[16])) && al; r.spA = (r.spA || 0) + ((sp ? 1 : 0) - (r.spA || 0)) * Math.min(1, dt * (sp ? 6 : 1.6)); }
      const dying = G.ARENA && !al && r.deadT && now - r.deadT < 20000;
      const vis = !b[11] && (b[10] || dying) && !((b[7] | 0) & 8) && (b[4] || 0) === lv && see({ x, z, lv: b[4] || 0 });
      const lsee = vis && (!los || los({ x, z, lv: b[4] || 0 })); /* o 3D desenha-o, mas o nome e o radar dos colegas só com linha de vista */
      r.seen = !!(lsee && al);
      r.b.root.visible = vis; if (!vis) { r.el.style.display = 'none'; continue; }
      { const lw = r.spd > 0.6 && r.my != null && (r.sc || 0) < 1.5 ? Math.max(-1, Math.min(1, r.back ? angD(r.my + Math.PI, S.yaw) : angD(r.my, S.yaw))) : 0; r.lr = (r.lr || 0) + (lw - (r.lr || 0)) * Math.min(1, dt * 8); } // de lado: as pernas viram-se para onde anda e o tronco continua a apontar
      r.b.root.position.set(x, y, z); r.b.root.rotation.set(0, S.yaw + r.lr, 0);
      if (dying) { const k = Math.min(1, (now - r.deadT) / 600), e = k * k; r.b.root.rotation.set(-Math.PI / 2 * e, S.yaw, 0, 'YXZ'); r.b.root.position.y = y + 0.16 * e; if (r.w !== '') { r.w = ''; r.b.setWeapon(null, {}); } r.el.style.display = 'none'; r.b.stance = 0; r.b.pose(dt, 0, 'none'); continue; } // cai de costas e fica no chão até renascer
      const an = b[7] | 0; { r.wt = (r.wt || 0) - dt; if (r.wt <= 0 && G.wallAhead) { r.wt = 0.1; r.wk = Math.max(0, Math.min(1, (0.85 - G.wallAhead(x, z, S.yaw, b[4])) / 0.35)); } } // recarga, granada e ligadura dos outros: o progresso conta-se aqui desde que o sinal chega
      const nowS = now / 1000, edge = (bit, key) => { if (an & bit) { if (r[key] == null) r[key] = nowS; return nowS - r[key]; } r[key] = null; return -1; };
      const rs = edge(16, 'rS'), ts = edge(32, 'tS'), us = edge(64, 'uS'), gd = ITEMS[r.wi] && ITEMS[r.wi].gun, rd = gd ? gd.reload : 2;
      r.sc = (r.sc || 0) + ((b[15] | 0) - (r.sc || 0)) * Math.min(1, dt * 7); r.b.stance = r.sc; /* postura dos outros: agachado ou deitado, suave */
      r.b.pose(dt, Math.min(b[6], r.spd / 3 + 0.03), MODES[an & 3], -1, 0, -(r.lr || 0), -1, r.step, (an & 4 ? 1 : 0.25) * (1 - 0.85 * (r.wk || 0)), us >= 0 ? { kind: 'heal', t: (us % 3) / 3 } : null, { rel: rs >= 0 ? Math.min(0.99, rs / rd) : -1, thr: ts >= 0 ? Math.min(0.99, ts / 0.7) : -1 });
      if (!lsee || (G.ARENA && !mate(r.clan)) || (r.gh && me && !mate(r.clan) && Math.hypot(x - me.x, z - me.z) > 12)) r.el.style.display = 'none'; else place(r.el, x, y + 2.05 - 0.5 * Math.min(1, r.sc || 0) - 0.95 * Math.max(0, (r.sc || 0) - 1), z); // de ghillie não se vê o nome ao longe
    }
    for (const s of sleepers.values()) {
      const vis = me && (s.lv || 0) === lv && Math.hypot(s.x - me.x, s.z - me.z) < 45 && see({ x: s.x, z: s.z, lv: s.lv || 0 });
      s.b.root.visible = !!vis; if (vis) place(s.el, s.x, 0.7, s.z); else s.el.style.display = 'none';
    }
  };
  let visT = 0;
  N.foes = () => { const out = []; if (!G.ARENA) return out; for (const r of R.values()) if (!mate(r.clan) && r.s1 && (r.spA || 0) > 0.02) out.push({ x: r.x, z: r.z, a: r.spA }); return out; }; // inimigos no radar da arena
  N.mates = () => { const out = []; for (const r of R.values()) if (mate(r.clan) && r.s1 && !(G.ARENA && r.al === false)) out.push({ x: r.s1[1], z: r.s1[2], name: r.name }); return out; };
  addEventListener('pagehide', () => { if (N.on) { closeBox(); N.sendInv(); } });
  return N;
}
