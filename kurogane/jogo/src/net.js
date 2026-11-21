// Modo online: liga ao servidor de jogo, mostra os outros jogadores, manda os teus tiros (o servidor decide
// quem acerta), mostra quem está a dormir e as mochilas de quem morreu, e trata dos clãs.
import * as THREE from 'three';

const MODES = ['none', 'pistol', 'rifle', 'melee'];

export function makeNet({ G, scene, mkRemote, audio, Conta, enc, dec, hurt, die, wallEnd, world, WV }) {
  let ws = null, tok = null, sendT = 0, invT = 0, retry = 0, want = false, off = 0, cyc0 = 0, cur = null, psT = 0, zT = 0; const zdQ = [];
  const R = new Map(), sleepers = new Map();
  const tags = document.createElement('div'); tags.id = 'tags'; { const h = document.getElementById('hud'); if (h && h.parentNode) h.parentNode.insertBefore(tags, h); else document.body.appendChild(tags); } // por baixo do HUD e dos ecrãs por cima
  const N = { on: false, world: false, id: null, clan: null, clanInfo: null, R };
  const url = () => { try { const o = localStorage.getItem('kg.srv'); if (o) return o; } catch (e) { } return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/srv/ws'; };
  const tokKey = () => 'kg.tok.' + ((Conta.ativo() || {}).id || 'x');
  const send = o => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };
  const tag = (name, cls) => { const e = document.createElement('div'); e.className = 'ntag' + (cls ? ' ' + cls : ''); e.textContent = name; e.style.display = 'none'; tags.appendChild(e); return e; };
  const mate = c => !!(N.clan && c === N.clan);
  const addRemote = (id, name, look, clan) => {
    if (R.has(id)) return R.get(id); const b = mkRemote(look); b.root.visible = false;
    const r = { id, name, clan, b, el: tag(name, mate(clan) ? 'mate' : ''), s0: null, s1: null, t0: 0, t1: 0, x: 0, z: 0, step: 0, w: null, ar: '' };
    R.set(id, r); return r;
  };
  const delRemote = id => { const r = R.get(id); if (!r) return; scene.remove(r.b.root); r.el.remove(); R.delete(id); };
  const setSleepers = list => {
    for (const s of sleepers.values()) { scene.remove(s.b.root); s.el.remove(); } sleepers.clear();
    for (const [k, x, z, lv, yaw, name, look, clan] of list) { const b = mkRemote(look); b.pose(0, 0, 'none'); b.root.position.set(x, 0.16, z); b.root.rotation.set(-Math.PI / 2, yaw, 0, 'YXZ'); b.root.visible = false; sleepers.set(k, { x, z, lv, b, name, el: tag(name + ' · a dormir', 'sleep') }); }
  };
  const clearAll = () => { for (const id of [...R.keys()]) delRemote(id); setSleepers([]); };
  // deixa de estar ligado: os sacos do servidor saem e as caixas voltam a ser deste aparelho
  const offline = () => { if (!N.world) return; N.world = false; cur = null; for (const b of [...G.bags]) if (b.nid) world.bags(null, [b.nid]); for (const c of G.W.containers) if (c.wid != null && !c.own) { c.grid = null; c.next = 0; } zdQ.length = 0; world.z.offline(); };
  const onMsg = m => {
    switch (m.t) {
      case 'ok': {
        N.id = m.id; tok = m.tok; try { localStorage.setItem(tokKey(), tok); } catch (e) { } N.on = true; retry = 0;
        clearAll(); for (const [id, name, look, clan] of m.players) addRemote(id, name, look, clan); setSleepers(m.sleep); N.clan = m.clan ? m.clan.id : null; N.clanInfo = m.clan;
        off = m.w.now - Date.now(); cyc0 = m.w.cyc0; N.world = true; cur = null; world.reset(m.w);
        const n = m.players.length; G.ui.toast(n ? `Online · ${n} ${n === 1 ? 'jogador ligado' : 'jogadores ligados'}` : 'Online · estás sozinho no servidor por agora');
        if (m.killed) { G.ui.toast('Mataram-te enquanto dormias'); die('dormir'); }
        else if (m.resume && G.p && m.resume.hp != null && m.resume.hp < G.p.hp) G.p.hp = Math.max(1, m.resume.hp);
        N.sendInv(); if (N.onClan) N.onClan(); return;
      }
      case 'erro': want = false; G.ui.toast(m.e === 'nome_em_uso' ? 'Esse nome já é de outro jogador. Muda o nome do perfil para jogar online.' : m.e === 'versao' ? 'Há uma versão nova do jogo. Recarrega a página para jogar online.' : 'O nome do perfil não serve para o servidor (3 a 16 letras ou números).'); try { ws.close(); } catch (e) { } return;
      case 'join': addRemote(m.id, m.name, m.look, m.clan); G.ui.toast(m.name + ' entrou'); return;
      case 'left': { const r = R.get(m.id); if (r) G.ui.toast(r.name + ' saiu e ficou a dormir'); delRemote(m.id); return; }
      case 's': {
        const now = performance.now(), seen = new Set();
        for (const a of m.ps) { const r = R.get(a[0]); if (!r) continue; seen.add(r.id); r.s0 = r.s1 || a; r.s1 = a; r.t0 = r.s0 === a ? now - 100 : r.t1; r.t1 = now;
          const ar = a[12] || [0, 0], ak = ar.join(); if (ak !== r.ar) { r.ar = ak; r.b.setGear({ head: ar[0] ? { k: 'capacete' } : null, vest: ar[1] ? { k: 'colete' } : null }); }
          if (r.w !== a[8]) { r.w = a[8]; r.b.setWeapon(a[8] || null, {}); } }
        for (const r of R.values()) if (!seen.has(r.id)) { r.s1 = r.s0 = null; r.b.root.visible = false; r.el.style.display = 'none'; }
        if (m.zu) world.z.rows(m.zu); if (m.zg) world.z.gone(m.zg);
        return;
      }
      case 'fx': {
        const p = G.p, d = p ? Math.hypot(m.o[0] - p.x, m.o[2] - p.z) : 99;
        audio.play(m.sup ? 'abafado' : 'pistola', Math.max(0.04, 1 - d / (m.sup ? 70 : 320)) * (m.sup ? 0.6 : 1));
        wallEnd(m.o, m.d); if (G.noise) G.noise(m.o[0], m.o[2], m.sup ? 12 : 34); if (G.heardShot && d < 300) G.heardShot(); if (p && d > 2.5) G.ui.sound(m.o[0], m.o[2], 't', d); return;
      }
      case 'hit': hurt(m.dmg, m.by, m.zone, m.pop); return;
      case 'hitc': { const r = m.on != null ? R.get(m.on) : null; G.ui.hit(!!m.kill, m.zone, false, r ? new THREE.Vector3(r.x, (r.y || 0) + (m.zone === 'head' ? 1.6 : 1.1), r.z) : null); G.buzz && G.buzz(m.kill ? [25, 40, 35] : 14); if (m.kill) G.ui.toast('Abateste ' + (m.name || 'um jogador')); return; }
      case 'sleep': setSleepers(m.list); return;
      case 'dr': world.door(m.i, m.o); return;
      case 'nd': world.node(m.k, m.ms); return;
      case 'wx': world.wx(m.r); return;
      case 'zk': world.z.killed(m.i, m.by, m.head); return;
      case 'zh': world.z.hit(m.i, m.dx, m.dz); return;
      case 'zat': hurt(m.dmg, null, 'body', null, 'zombie'); return;
      case 'bg': world.bags(m.add, m.del); return;
      case 'opn': { if (!cur || cur.key !== m.c) return; const gen = world.opened(cur.c, m); if (G.box !== cur.c) { cur = null; return; } cur.sig = gen ? '' : sigOf(cur.c); cur.open = true; return; }
      case 'clan': if (m.erro) { if (N.onClan && N.onClan(m.erro)) return; G.ui.toast(m.erro); return; } else { N.clan = m.info ? m.info.id : null; N.clanInfo = m.info; for (const r of R.values()) r.el.classList.toggle('mate', mate(r.clan)); } if (N.onClan) N.onClan(); return;
      case 'pclan': { const r = R.get(m.id); if (r) { r.clan = m.clan; r.el.classList.toggle('mate', mate(m.clan)); } return; }
    }
  };
  const connect = () => {
    if (ws || !want) return; const a = Conta.ativo(); if (!a || !a.nome) return;
    try { tok = localStorage.getItem(tokKey()); } catch (e) { }
    let opened = false; try { ws = new WebSocket(url()); } catch (e) { ws = null; G.ui.toast('Sem ligação ao servidor. Continuas sozinho.'); return; }
    ws.onopen = () => { opened = true; send({ t: 'hi', name: a.nome, look: a.look || {}, tok, wv: WV, x: G.p ? G.p.x : 0, z: G.p ? G.p.z : 0 }); };
    ws.onmessage = e => { try { onMsg(JSON.parse(e.data)); } catch (er) { console.error(er); } };
    ws.onclose = () => {
      const was = N.on; ws = null; N.on = false; clearAll(); offline();
      if (!want) return;
      if (retry < 6) { retry++; if (was) G.ui.toast('Perdeste a ligação ao servidor. A tentar outra vez…'); else if (!opened && retry === 1) G.ui.toast('O servidor não responde. Continuas sozinho e o jogo tenta outra vez.'); setTimeout(connect, 1500 * retry); }
      else G.ui.toast('Sem servidor. Continuas sozinho.');
    };
  };
  N.start = () => { want = true; retry = 0; connect(); };
  N.stop = () => { want = false; if (ws) { try { if (N.on) { closeBox(); N.sendInv(); } ws.close(); } catch (e) { } } ws = null; N.on = false; clearAll(); offline(); };
  N.shot = (O, D, k, n, L, sup) => send({ t: 'shot', o: [+O.x.toFixed(2), +O.y.toFixed(2), +O.z.toFixed(2)], d: [+D.x.toFixed(4), +D.y.toFixed(4), +D.z.toFixed(4)], k, n, L: Math.round(L), sup: !!sup });
  N.died = () => send({ t: 'died', it: G.inv.all().map(enc), force: 1 });
  // mundo partilhado
  N.cyc = () => (((Date.now() + off - cyc0) / 1000) % 1920 + 1920) % 1920;
  N.door = (i, o) => send({ t: 'dr', i, o: o ? 1 : 0 });
  // zombies: lista inicial (mundo novo), dano (junto num só envio por imagem) e ataques a outros jogadores
  N.zseed = L => send({ t: 'zs', L });
  N.zd = o => zdQ.push(o);
  N.zatk = (i, to, dmg) => send({ t: 'za', i, to, dmg: +dmg.toFixed(1) });
  N.node = k => send({ t: 'nd', k });
  N.bag = (x, z, y, lv, it) => send({ t: 'bag', x: +x.toFixed(2), z: +z.toFixed(2), y: +y.toFixed(2), lv, it });
  // caixas e sacos: pede ao servidor (só uma pessoa de cada vez); enquanto estiver aberta vai mandando o que tem; ao fechar manda o fim
  const keyOf = c => c.nid ? 'b' + c.nid : 'w' + c.wid;
  const sigOf = c => c.grid ? JSON.stringify(world.encG(c.grid)) : '';
  const closeBox = () => { if (!cur) return; if (cur.open && cur.c.grid) send({ t: 'cl', c: cur.key, it: world.encG(cur.c.grid) }); cur = null; };
  N.open = c => { closeBox(); cur = { key: keyOf(c), c, open: false, t: performance.now() }; send({ t: 'op', c: cur.key }); };
  N.clanCmd = (a, v) => send({ t: 'clan', a, nome: v, codigo: v });
  N.sendInv = () => send({ t: 'inv', it: G.inv.all().map(enc) });
  N.near = (x, z, r) => { for (const o of R.values()) if (o.s1 && Math.hypot(o.s1[1] - x, o.s1[2] - z) < r) return true; for (const s of sleepers.values()) if (Math.hypot(s.x - x, s.z - z) < r) return true; return false; };
  // cada imagem: o teu estado para o servidor (10 por segundo) e os outros no sítio certo, 100 ms atrás (para andarem suaves)
  const _v = new THREE.Vector3();
  const place = (el, x, y, z) => { _v.set(x, y, z); const q = G.proj(_v); if (!q.ok) { el.style.display = 'none'; return; } el.style.display = ''; el.style.transform = `translate(${q.x.toFixed(0)}px,${q.y.toFixed(0)}px) translate(-50%,-100%)`; };
  N.frame = (dt, me, see) => {
    if (!N.on) return; const now = performance.now();
    { const hide = G.mapOpen || G.invOpen || G.paused || !G.playing; if (tags.hidden !== hide) tags.hidden = hide; }
    sendT -= dt; if (sendT <= 0 && me) { sendT = 0.1; send({ t: 'st', ...me }); }
    if (zdQ.length) { send({ t: 'zd', L: zdQ.splice(0, 40) }); }
    zT -= dt; if (zT <= 0 && N.world) { zT = 0.1; const L = world.z.up(); if (L.length) send({ t: 'zu', L }); }
    if (cur) { if (cur.open && G.box !== cur.c) closeBox(); else if (cur.open) { psT -= dt; if (psT <= 0) { psT = 0.4; const sg = sigOf(cur.c); if (sg !== cur.sig) { cur.sig = sg; send({ t: 'ps', c: cur.key, it: world.encG(cur.c.grid) }); } } } else if (performance.now() - cur.t > 4000) cur = null; }
    invT -= dt; if (invT <= 0) { invT = 15; N.sendInv(); }
    const lv = me ? me.lv : 0;
    for (const r of R.values()) {
      const a = r.s0, b = r.s1; if (!b) continue;
      const span = Math.max(40, r.t1 - r.t0), f = Math.min(1.25, (now - 100 - r.t0) / span);
      const x = a[1] + (b[1] - a[1]) * f, z = a[2] + (b[2] - a[2]) * f, y = a[3] + (b[3] - a[3]) * Math.min(1, f);
      let dy = b[5] - a[5]; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
      r.step += Math.hypot(x - r.x, z - r.z) * 2.6; r.x = x; r.z = z; r.y = y;
      const vis = !b[11] && b[10] && (b[4] || 0) === lv && see({ x, z, lv: b[4] || 0 });
      r.b.root.visible = vis; if (!vis) { r.el.style.display = 'none'; continue; }
      r.b.root.position.set(x, y, z); r.b.root.rotation.set(0, a[5] + dy * Math.min(1, f), 0);
      const an = b[7] | 0; r.b.pose(dt, b[6], MODES[an & 3], -1, 0, 0, -1, r.step, an & 4 ? 1 : 0.25, null);
      place(r.el, x, y + 2.05, z);
    }
    for (const s of sleepers.values()) {
      const vis = me && (s.lv || 0) === lv && Math.hypot(s.x - me.x, s.z - me.z) < 45 && see({ x: s.x, z: s.z, lv: s.lv || 0 });
      s.b.root.visible = !!vis; if (vis) place(s.el, s.x, 0.7, s.z); else s.el.style.display = 'none';
    }
  };
  N.mates = () => { const out = []; for (const r of R.values()) if (mate(r.clan) && r.s1) out.push({ x: r.s1[1], z: r.s1[2], name: r.name }); return out; };
  addEventListener('pagehide', () => { if (N.on) { closeBox(); N.sendInv(); } });
  return N;
}
