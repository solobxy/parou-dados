// Interface: HUD, inventário com arrastar e largar, fabrico, mapa, ecrãs de início e de morte.
import { ITEMS, RECIPES, CAT, ammoOf } from './items.js';
import { mkItem, IW, IH, capOf } from './bag.js';
import { MAP, CORE, CITY, inCity } from './world.js';
import { forestDens } from './sectors.js';
import { marks, addMark, delMark, saveMarks, MCOL, MSYM, MSYM_N, drawSym, drawCompass, gridName, gridLet, CELL, bearing, cardOf, distTxt } from './marks.js';
import { VT } from './vtypes.js';
import { initArenaUI } from './arenaui.js';
import { pager, fitDrop } from './pager.js';
import { audio } from './audio.js';
import { makeMusic } from './music.js';
import * as THREE from 'three';
import * as Conta from './conta.js';

export function initUI(G) {
  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  document.body.classList.toggle('touch', G.TOUCH);
  const GAP = 2; let CS = 44;

  // ---------- gestos do sistema: sem puxar para atualizar, sem zoom, menos saídas por engano
  document.addEventListener('touchmove', e => { if (!e.target.closest('.scroll,.sbody,#inv .ibody')) e.preventDefault(); }, { passive: false });
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
  document.addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
  addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0'].includes(e.key)) e.preventDefault(); });
  try { history.pushState({ kg: 1 }, ''); addEventListener('popstate', () => { try { history.pushState({ kg: 1 }, ''); } catch (e) { } if (!G.playing) return; if (G.invOpen) closeInv(); else if (G.mapOpen) toggleMap(false); else if (!$('set').hidden) closeSet(); else openSet(); }); } catch (e) { }
  // ecrã inteiro sempre: o browser só deixa depois de um toque, por isso cada toque (ou tecla) volta a pedir se não estiver
  { const D = document.documentElement, on = () => !!(document.fullscreenElement || document.webkitFullscreenElement), can = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled) && !!(D.requestFullscreen || D.webkitRequestFullscreen);
    let last = 0; const fs = () => { if (!can || on() || G.noFS) return; const t = performance.now(); if (t - last < 800) return; last = t; try { const r = D.requestFullscreen ? D.requestFullscreen({ navigationUI: 'hide' }) : D.webkitRequestFullscreen(); if (r && r.catch) r.catch(() => { }); } catch (e) { } };
    for (const ev of ['pointerup', 'touchend', 'keydown']) addEventListener(ev, fs, { capture: true, passive: true }); }
  // ---------- ecrã inicial
  $('sKeys').innerHTML = G.TOUCH
    ? '<b>Polegar esquerdo</b><span>mover (até ao fim para correr)</span><b>Botão de disparo</b><span>1.º toque levanta a arma e mira no mais perto · arrasta para a cabeça · toca para disparar</span><b>Lado direito</b><span>arrastar ajusta a mira · com arma branca, toque = golpe</span><b>Botões</b><span>revistar e portas, recarregar, olho (1.ª ou 3.ª pessoa), inventário e mapa</span>'
    : '<b>WASD</b><span>mover · Shift correr</span><b>Rato</b><span>botão direito levanta a arma (com mira 4x/8x vês pela mira) · clique dispara</span><b>E</b><span>revistar e portas · Tab inventário · R recarregar</span><b>1–6</b><span>cinto · M mapa · F lanterna · Q correr sempre · V 1.ª ou 3.ª pessoa · Shift na mira suster a respiração</span>';
  const go = (cont, kit) => {
    const a = Conta.ativo(); if (!a || !a.nome) { askName(false, () => go(cont, kit)); return; }
    audio.start(); MUS.prime(['fundo', ...PER]); audio.play('ui');
    if (G.TOUCH) { try { const r = document.documentElement.requestFullscreen && document.documentElement.requestFullscreen({ navigationUI: 'hide' }); if (r && r.catch) r.catch(() => { }); } catch (e) { } }
    $('start').hidden = true; $('modes').hidden = true; $('gate').hidden = true; G.start(cont, kit);
  };
  // o Kurogane só se joga online: antes de entrar confirma que o servidor responde; sem servidor não se joga
  const SITE = 'https://kurogane.2-31-13-85.sslip.io';
  const health = () => { let u = window.KG_ONLINE ? '/srv/saude' : SITE + '/srv/saude'; try { const o = localStorage.getItem('kg.srv'); if (o) u = o.replace(/^ws/, 'http').replace(/\/ws$/, '/saude'); } catch (e) { } return u; };
  let joining = false;
  const playOnline = () => { if (joining) return; const b = $('sPlay'), em = b.querySelector('em'), old = em.textContent; joining = true; b.classList.add('busy'); em.textContent = 'A ligar ao servidor…'; audio.play('ui');
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 8000);
    fetch(health(), { cache: 'no-store', signal: ctl.signal }).then(r => r.ok ? r.json() : null).catch(() => null).then(j => { clearTimeout(tm); joining = false; b.classList.remove('busy'); em.textContent = old;
      if (j && j.ok) { go(false); return; }
      mnote(window.KG_ONLINE ? 'O servidor não está a responder. O Kurogane só se joga online: tenta outra vez daqui a pouco.' : 'Daqui não dá para ligar ao servidor. O Kurogane só se joga online, no site: ' + SITE.replace('https://', '')); }); };
  $('sPlay').onclick = playOnline; $('sArena').onclick = () => { audio.play('ui'); const a = Conta.ativo(); if (!a || !a.nome) { askName(false, () => $('sArena').onclick()); return; } try { sessionStorage.setItem('kgArena', '1'); } catch (e) { } G.updating = true; $('sArena').querySelector('em').textContent = 'A preparar a arena…'; location.reload(); }; $('sCont').onclick = () => go(true);
  G.dbgKit = () => go(false, true); // só para os testes automáticos (joga sempre sem servidor)
  // um só servidor para todos: no site joga-se sempre online (se o servidor não responder, joga-se sozinho até voltar)
  let canOnline = true; // sem modo offline: no site e fora dele tenta sempre o servidor
  G.online = canOnline;
  if (!canOnline) { $('sOnl').hidden = true; const f = document.querySelector('#start .foot'); if (f) f.textContent = ((f.textContent.match(/Protótipo [\d.]+/) || ['Protótipo'])[0]) + ' · aqui jogas sozinho · o jogo online está no site do Kurogane'; }
  else { const b = $('sOnl'), t = $('sOnT');
    const count = () => { let u = window.KG_ONLINE ? '/srv/saude' : 'https://kurogane.2-31-13-85.sslip.io/srv/saude'; try { const o = localStorage.getItem('kg.srv'); if (o) u = o.replace(/^ws/, 'http').replace(/\/ws$/, '/saude'); } catch (e) { }
      fetch(u, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(j => { const up = !!(j && j.ok); b.classList.toggle('up', up); b.classList.toggle('down', !up); t.textContent = up ? (j.jogadores ? `${j.jogadores} a jogar agora` : 'Servidor ligado') : 'Servidor em baixo'; $('mdNS').textContent = up && j.jogadores != null ? `${j.jogadores} a jogar` : ''; $('mdNA').textContent = up && j.arena != null ? `${j.arena} na arena` : ''; }).catch(() => { b.classList.add('down'); t.textContent = 'Servidor em baixo'; }); };
    count(); G.ui_count = count; }
  // os toques no jogo não contam como cliques nas estatísticas (só os botões dos menus)
  for (const id of ['touch', 'c']) $(id).addEventListener('click', e => e.stopPropagation());
  // zona livre do ecrã para o círculo de visão (sem HUD por cima), por orientação
  const ins = () => { const cs = getComputedStyle($('ins')); return { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 }; };
  const portrait = () => innerHeight > innerWidth;
  const safe = () => { const w = innerWidth, h = innerHeight, I = ins();
    if (portrait()) return G.TOUCH ? { x0: I.l + 6, x1: w - I.r - 6, y0: I.t + 118, y1: h - I.b - (h <= 700 ? 280 : 304) } : { x0: I.l + 8, x1: w - I.r - 8, y0: I.t + 150, y1: h - I.b - 86 };
    return { x0: I.l + 6, x1: w - I.r - 6, y0: I.t + 6, y1: h - I.b - (G.TOUCH ? 66 : 74) }; };
  const scopeR = () => { const S = safe(); return Math.max(80, Math.min(S.x1 - S.x0, S.y1 - S.y0 + 20) * 0.5); };
  const scopeC = () => { const S = safe(); return { x: (S.x0 + S.x1) / 2, y: (S.y0 + S.y1) / 2 }; };

  // ---------- HUD: cinto
  const beltEl = $('belt'); const bs = [];
  for (let i = 0; i < 6; i++) { const b = document.createElement('button'); b.className = 'bs'; b.dataset.i = i; b.innerHTML = `<span class="k">${i + 1}</span>`; b.setAttribute('aria-label', 'Cinto ' + (i + 1)); beltEl.appendChild(b); bs.push(b);
    b.addEventListener('pointerdown', e => { e.stopPropagation(); const it = G.inv.belt[i]; if (G.sel === i && it && ITEMS[it.k].use) G.use(it); else if (G.sel === i && G.aimS.on) G.aimEnd(); else G.select(i); }); }
  $('bInv').onclick = () => G.invOpen ? closeInv() : openInv(G.box);
  $('bMap').onclick = () => toggleMap(); $('mm').onclick = () => toggleMap();
  $('tReload').addEventListener('pointerdown', e => { e.stopPropagation(); G.reload(); });
  $('tUse').addEventListener('pointerdown', e => { e.stopPropagation(); G.interact(); });
  $('iClose').onclick = () => closeInv(); $('mClose').onclick = () => toggleMap(false); $('map').onclick = e => { if (e.target.id === 'map') toggleMap(false); };
  $('dGo').onclick = () => { audio.play('ui'); G.respawn(null); };
  $('furn').onclick = () => { if (G.box) { G.base.toggleFurnace(G.box); render(); } };

  // ---------- sticks tácteis
  // polegar esquerdo: mover. Polegar direito: com arma de fogo arrasta a mira (como um rato); com arma branca aponta e toque rápido = golpe
  const gunHeld = () => { const it = G.inv.belt[G.sel]; return !!(it && ITEMS[it.k].gun); };
  const mx = x => cfg.mirror ? innerWidth - x : x; // com os comandos trocados, o #touch está espelhado: o botão fica onde puseste o dedo
  const pad = (id, key) => {
    const el = $(id), kn = el.querySelector('.knob'), ki = kn.querySelector('i'); let pid = null, ox = 0, oy = 0, lx = 0, ly = 0, t0 = 0, maxM = 0, trk = false, moved = 0; const R = 50;
    el.addEventListener('pointerdown', e => { if (pid !== null || !G.playing || G.invOpen) return; pid = e.pointerId; el.setPointerCapture(pid); ox = lx = e.clientX; oy = ly = e.clientY; t0 = performance.now(); maxM = 0; moved = 0; trk = key === 'R' && (gunHeld() || G.fpv.on); $(key === 'L' ? 'gL' : 'gR').style.opacity = 0; if (trk) { if (!G.aimS.on && !G.fpv.on) G.aimStart(); return; } kn.style.left = mx(ox) + 'px'; kn.style.top = oy + 'px'; kn.classList.add('on'); ki.style.transform = ''; G.sticks[key] = { x: 0, y: 0, m: 0 }; });
    el.addEventListener('pointermove', e => { if (e.pointerId !== pid) return; if (!trk && key === 'R' && (gunHeld() || G.fpv.on)) { trk = true; lx = e.clientX; ly = e.clientY; kn.classList.remove('on'); G.sticks.R = null; return; } /* a vista mudou para a 1.ª pessoa (ou pegaste numa arma) a meio do toque: passa a rodar a vista */ if (trk) { const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY; moved += Math.abs(dx) + Math.abs(dy); G.aimDrag(dx, dy); return; } let dx = e.clientX - ox, dy = e.clientY - oy; const l = Math.hypot(dx, dy); if (l > R) { dx *= R / l; dy *= R / l; if (key === 'L' && l > R * 1.6) { ox = e.clientX - dx * 1.0; oy = e.clientY - dy * 1.0; kn.style.left = mx(ox) + 'px'; kn.style.top = oy + 'px'; } } const m = Math.min(1, l / R); maxM = Math.max(maxM, m); G.sticks[key] = { x: dx / R, y: dy / R, m }; ki.style.transform = `translate(${cfg.mirror ? -dx : dx}px,${dy}px)`; });
    const up = e => { if (e.pointerId !== pid) return; pid = null; kn.classList.remove('on'); G.sticks[key] = null; if (key !== 'R') return; const quick = performance.now() - t0 < 260; if (quick && maxM < 0.35 && G.base.placing()) { G.base.pin(G.groundAt(e.clientX, e.clientY)); return; } /* a colocar um objeto: o toque escolhe o sítio */ if (trk) { if (G.fpv.on) { if (quick && moved < 10 && !gunHeld()) G.tapAttack(); return; } /* na 1.ª pessoa: toque rápido bate (com arma branca ou à mão) */ if (quick && moved < 10) G.relock(); return; } if (quick && maxM < 0.35) G.tapAttack(); };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
    // um dedo levantado fora (painel aberto por cima, morte, entrar no carro) não pode deixar o comando preso para sempre
    document.addEventListener('pointerup', e => { if (e.pointerId === pid) up(e); }, true); document.addEventListener('pointercancel', e => { if (e.pointerId === pid) up(e); }, true);
  };
  pad('padL', 'L'); pad('padR', 'R');
  // na 1.ª pessoa, um polegar que começa num botão do lado direito (mira, saltar, recarregar…) e arrasta também roda a vista
  { const D = new Map();
    document.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') return; const b = e.target.closest && e.target.closest('#touch .tb'); if (!b || b.id === 'tFire') return; const right = cfg.mirror ? e.clientX < innerWidth * 0.5 : e.clientX > innerWidth * 0.5; if (right) D.set(e.pointerId, [e.clientX, e.clientY]); }, true);
    document.addEventListener('pointermove', e => { const q = D.get(e.pointerId); if (!q) return; const dx = e.clientX - q[0], dy = e.clientY - q[1]; q[0] = e.clientX; q[1] = e.clientY; if (G.playing && !G.invOpen && G.fpv.on) G.aimDrag(dx, dy); }, true);
    const fim = e => D.delete(e.pointerId); document.addEventListener('pointerup', fim, true); document.addEventListener('pointercancel', fim, true); }

  // ---------- inventário
  const inv = $('inv'), gBag = $('gBag'), gBox = $('gBox');
  let sel = null, tab = 'inv', lastPortrait = '', lastTap = { id: 0, t: 0 };
  inv.querySelectorAll('.tabs button').forEach(b => b.onclick = () => { tab = b.dataset.tab; inv.dataset.tab = tab; sel = null; { const L = tab === 'craft' ? $('recipes') : tab === 'skills' ? $('skl') : null; if (L && L._pg) L._pg.first(); } inv.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b)); audio.play('ui'); render(); });
  const layout = () => {
    const sl = G.TOUCH ? 46 : innerHeight > 640 ? 60 : 52; inv.style.setProperty('--slot', sl + 'px');
    const body = inv.querySelector('.ibody'), Hb = body.clientHeight, Wd = body.clientWidth, g6 = 5 * GAP;
    if (innerHeight > innerWidth) {
      // ao alto: o que fica fixo (equipamento, ações, cinto, títulos) e o resto dividido entre a mochila (6 linhas) e pelo menos 3 linhas do que se revista
      const fixed = 2 * 24 + 2 * sl + 4 * 8 + 12;
      const byH = Math.floor((Hb - fixed - 8 * GAP) / 9), byW = Math.floor((Wd - g6) / 6);
      CS = clamp(Math.min(byH, byW), 34, 54); inv.style.setProperty('--cs', CS + 'px'); $('cBox').style.width = ''; return;
    }
    // deitado e baixo (ex.: 640×300): o equipamento e o cinto encolhem para caber na altura, e as grelhas encolhem para caber na largura (nada sai do ecrã)
    const sl2 = Math.min(sl, Math.max(28, Math.floor((Hb - 62) / 5))); if (sl2 !== sl) inv.style.setProperty('--slot', sl2 + 'px'); inv.classList.toggle('short', sl2 < sl);
    const eqMin = Math.min(200, Math.max(150, 2 * sl2 + 74)); inv.style.setProperty('--eqw', eqMin + 'px');
    let cs = Math.floor((Hb - 30 - g6) / 6);
    while (cs > 22 && 2 * (6 * cs + g6) + eqMin + 28 > Wd) cs--;
    CS = clamp(cs, 22, G.TOUCH ? 54 : 64); inv.style.setProperty('--cs', CS + 'px');
    $('cBox').style.width = (6 * CS + g6) + 'px';
  };
  const P = n => n * CS + (n - 1) * GAP;
  const catOf = d => 't-' + d.cat;
  // acessório que serve nesta arma (e que ainda não está lá montado)
  const fits = (g, it) => { const gd = ITEMS[g.k].gun, d = ITEMS[it.k]; if (!gd || !d.att || (g.att && g.att[d.att] === it.k)) return false; return d.att === 'sup' ? gd.sup === it.k : d.att === 'light' ? !!gd.light : d.rd ? !!(gd.scope || gd.rd) : !!gd.scope && (it.k !== 'mira8' || gd.scope >= 2); };
  // encaixes da arma (mira, cano, calha): cheio mostra a peça, vazio fica tracejado; o que vai receber o acessório escolhido acende
  const slotsHTML = (it, want) => { const gd = ITEMS[it.k].gun; if (!gd) return ''; let h = ''; for (const [s, ok] of [['scope', gd.scope || gd.rd], ['sup', gd.sup], ['light', gd.light]]) { if (!ok) continue; const a = it.att && it.att[s]; h += `<i class="${a ? 'on' : ''}${want === s ? ' tgt' : ''}" title="${{ scope: 'Mira', sup: 'Cano', light: 'Calha' }[s]}">${a ? `<img src="${G.ICONS[a]}" alt="">` : ''}</i>`; } return h ? `<span class="atts">${h}</span>` : ''; };
  const itemHTML = (it, small, want) => { const d = ITEMS[it.k]; const ct = d.gun ? `<span class="ct am">${d.gun.clip && !it.mg ? '—' : it.ammo || 0}</span>` : d.clip ? `<span class="ct am">${it.am || 0}</span>` : it.n > 1 ? `<span class="ct">${it.n}</span>` : ''; return `<img src="${(small && G.ICONS_SQ && G.ICONS_SQ[it.k]) || G.ICONS[it.k]}" alt="">${small ? '' : `<span class="nm">${d.s}</span>`}${ct}${small ? '' : slotsHTML(it, want)}`; }; // nas casas quadradas (cinto, equipamento) as armas compridas vão na diagonal e ficam grandes
  const renderGrid = (el, grid, rows, kind) => {
    el.innerHTML = ''; el.dataset.kind = kind; if (!grid) { el.style.width = el.style.height = '0px'; return; }
    const R = grid.rows; el.style.width = P(grid.cols) + 'px'; el.style.height = P(R) + 'px';
    let h = '';
    for (let y = 0; y < R; y++) for (let x = 0; x < grid.cols; x++) h += `<div class="cell${y >= rows ? ' off' : ''}" style="left:${x * (CS + GAP)}px;top:${y * (CS + GAP)}px"></div>`;
    const sa = sel && ITEMS[sel.it.k].att ? sel.it : null; // acessório escolhido: as armas onde serve ficam marcadas
    for (const e of grid.list) { const d = ITEMS[e.it.k], w = P(IW(e.it)), hh = P(IH(e.it)), fit = sa && fits(e.it, sa); h += `<div class="item ${catOf(d)}${d.rare ? ' rare' : ''}${e.it.r ? ' rot' : ''}${hh > CS ? ' tall' : ''}${sel && sel.it === e.it ? ' sel' : ''}${fit ? ' fit' : ''}" data-src="${kind}:${e.it.id}" style="left:${e.x * (CS + GAP)}px;top:${e.y * (CS + GAP)}px;width:${w}px;height:${hh}px;--bw:${w}px;--bh:${hh}px">${itemHTML(e.it, false, fit ? ITEMS[sa.k].att : null)}</div>`; }
    el.innerHTML = h;
    // nome numa linha por cima do desenho: se não couber, a letra encolhe um pouco (até 8 px) antes de cortar com reticências
    { const rg = document.createRange(); for (const n of el.querySelectorAll('.item:not(.tall) .nm')) { rg.selectNodeContents(n); let f = parseFloat(getComputedStyle(n).fontSize); while (rg.getBoundingClientRect().width > n.clientWidth - 0.5 && f > 8) { f -= 0.5; n.style.fontSize = f + 'px'; } } } // mede o texto a sério (com reticências, scrollWidth arredonda e engana)
  };
  const slotHTML = (it, label, key) => it ? `${key ? `<span class="k">${key}</span>` : ''}${itemHTML(it, true)}` : `${key ? `<span class="k">${key}</span>` : ''}${label ? `<span class="lb">${label}</span>` : ''}`;
  const render = () => {
    if (!G.invOpen) return;
    const I = G.inv, rows = I.rows();
    renderGrid(gBag, I.bag, rows, 'bag');
    $('bagCap').textContent = I.eq.back ? '6 × 6' : '6 × 4 · sem mochila';
    // equipamento e cinto
    for (const s of ['head', 'eyes', 'suit', 'vest', 'back']) { const el = inv.querySelector(`[data-eq="${s}"]`), it = I.eq[s]; el.innerHTML = slotHTML(it, { head: 'Cabeça', eyes: 'Olhos', suit: 'Fato', vest: 'Colete', back: 'Costas' }[s]); el.dataset.src = it ? 'eq:' + s : ''; el.classList.toggle('sel', !!(sel && it && sel.it === it)); el.className = 'slot' + (it ? ' ' + catOf(ITEMS[it.k]) : '') + (sel && it && sel.it === it ? ' sel' : ''); }
    const bI = $('beltI'); if (!bI.children.length) for (let i = 0; i < 6; i++) { const d = document.createElement('div'); d.className = 'slot'; d.dataset.belt = i; bI.appendChild(d); }
    const sa = sel && ITEMS[sel.it.k].att ? sel.it : null;
    [...bI.children].forEach((el, i) => { const it = I.belt[i], fit = !!(sa && it && fits(it, sa)); el.innerHTML = slotHTML(it, '', i + 1) + (fit ? slotsHTML(it, ITEMS[sa.k].att) : ''); el.dataset.src = it ? 'belt:' + i : ''; el.className = 'slot' + (it ? ' ' + catOf(ITEMS[it.k]) : '') + (sel && it && sel.it === it ? ' sel' : '') + (fit ? ' fit' : ''); });
    const pk = ['head', 'eyes', 'suit', 'vest', 'back'].map(s => I.eq[s] ? I.eq[s].k : '').join() + (I.belt.some(b => b && b.k === 'm4') ? 'r' : '') + (G.lookV || 0);
    if (pk !== lastPortrait) { lastPortrait = pk; $('portrait').src = G.portrait(I.eq); }
    // caixa / chão
    $('boxV').hidden = tab !== 'inv'; $('craftV').hidden = tab !== 'craft'; $('skillV').hidden = tab !== 'skills'; if (tab === 'skills') renderSkills();
    const B = G.box;
    $('boxName').textContent = B ? B.label.replace(/^(Abrir|Revistar) /, '').replace(/^./, c => c.toUpperCase()) : 'Perto de ti';
    renderGrid(gBox, B ? B.grid : null, B && B.grid ? B.grid.rows : 0, 'box');
    $('boxEmpty').hidden = !!(B && B.grid && !B.grid.empty); if (B && B.grid && B.grid.empty) $('boxEmpty').textContent = 'Vazio. Volta mais tarde: as coisas reaparecem.'; else if (!B) $('boxEmpty').textContent = 'Nada aberto. Aproxima-te de um armário, caixa, carro ou saco e revista.';
    inv.classList.toggle('nobox', tab === 'inv' && !B); // nada aberto: o espaço vai para a mochila (ao alto)
    $('takeAll').hidden = !(B && B.grid && !B.grid.empty); { const fu = $('furn'), F = B && B.dep && (B.dep.k === 'fornalha' || B.dep.k === 'fogueira') ? B.dep : null; fu.hidden = !F; if (F) { fu.textContent = F.on ? 'Apagar' : 'Acender'; fu.classList.toggle('pri', !F.on); } }
    if (tab === 'craft') renderCraft();
    renderBar();
    { const L = G.load ? G.load() : { kg: 0, cap: 28 }; $('iKgN').textContent = L.kg.toFixed(1).replace('.', ','); $('iKgC').textContent = '/' + Math.round(L.cap) + ' kg'; $('iKgB').style.width = Math.min(100, L.kg / (L.cap + 18) * 100) + '%'; const el = $('iKg'); el.classList.toggle('heavy', L.kg > L.cap && L.kg <= L.cap + 18); el.classList.toggle('over', L.kg > L.cap + 18); el.title = L.kg > L.cap + 18 ? 'Pesado demais: não consegues correr' : L.kg > L.cap ? 'Pesado: andas mais devagar e cansas-te mais' : 'Peso'; }
    $('iStat').textContent = G.inside ? G.inside.name : (G.zoneAt(G.p.x, G.p.z) || { name: 'Floresta' }).name;
  };
  const renderBar = () => {
    const nm = $('iName'), ct = $('iCat'), ds = $('iDesc'), ac = $('iAct'); ac.innerHTML = '';
    if (!sel || !locate(sel.it)) { sel = null; bar.hidden = true; $('iHint').innerHTML = G.TOUCH ? '<span><b>Toque</b> ver o que fazer</span><span><b>Dois toques</b> ação principal</span><span><b>Arrastar</b> mover; para fora, largar</span>' : '<span><b>Clique</b> ver o que fazer</span><span><b>Duplo clique</b> ação principal</span><span><b>Arrastar</b> mover; para fora, largar</span>'; return; }
    bar.hidden = false; ds.classList.remove('open');
    const it = sel.it, d = ITEMS[it.k], loc = locate(it);
    nm.textContent = d.n + (it.n > 1 ? ' × ' + it.n : ''); ct.textContent = d.rare ? 'Raro · ' + CAT[d.cat] : CAT[d.cat]; ct.className = 'cat' + (d.rare ? ' rare' : '');
    const attTxt = d.gun && it.att ? Object.values(it.att).filter(Boolean).map(k => ITEMS[k].s).join(', ') : '';
    ds.textContent = d.desc + (d.gun ? (d.gun.clip && !it.mg ? ' Sem carregador.' : ` Carregada: ${it.ammo}/${capOf(it)} de ${ITEMS[it.ak || ammoOf(d.gun)[0]].s}.`) + (attTxt ? ' Tem: ' + attTxt.replace(/\.$/, '') + '.' : '') : '') + (d.clip ? ` Tem ${it.am || 0}/${d.clip.cap}` + (it.am ? ` de ${ITEMS[it.ak].s}.` : '.') : '') + (d.bal ? ` Perfuração ${d.bal.pen}: os coletes de nível igual ou maior travam-na.` : '');
    const add = (label, fn, pri, cls, html) => { const b = document.createElement('button'); b.className = 'btn sm' + (pri ? ' pri' : '') + (cls ? ' ' + cls : ''); if (html) { b.innerHTML = html; b.setAttribute('aria-label', label); } else b.textContent = label; b.onclick = () => { audio.play('ui'); fn(); G.refresh(); }; ac.appendChild(b); };
    // tirar só as balas (de uma arma ou de um carregador), direto para a mochila; a arma ou o carregador ficam onde estão
    const unload = () => { const q = d.gun ? it.ammo | 0 : it.am | 0, k = it.ak || (d.gun ? ammoOf(d.gun)[0] : d.clip && d.clip.ammo[0]); if (!q || !k) return; const a = mkItem(k, q); const left = G.inv.give(a); const got = q - (left || 0); if (!got) return toast('Mochila cheia');
      if (d.gun) it.ammo = q - got; else it.am = q - got; feed(k, got); audio.play('recarregar', 0.5); if (left) toast('Mochila cheia: ficaram ' + left + ' balas'); };
    const loaded = (d.gun && (it.ammo | 0) > 0) || (d.clip && (it.am | 0) > 0);
    // acessórios: montar numa arma compatível (também direto da caixa ou do chão, mesmo com a mochila cheia)
    const attActs = () => {
      if (d.att) { const guns = [...G.inv.belt.filter(Boolean), ...G.inv.bag.list.map(e => e.it)].filter(g => fits(g, it));
        if (!guns.length) add('Sem arma compatível', () => toast(d.att === 'sup' ? 'Este silenciador não serve nas armas que tens' : d.att === 'light' ? 'Não tens arma onde a montar' : 'Esta mira não serve nas armas que tens'));
        // se a arma já tem uma peça nesse encaixe, troca e a antiga vai para a mochila
        const SLOT = { scope: 'mira', sup: 'cano', light: 'calha' };
        for (const g of guns.slice(0, 3)) { const old = g.att && g.att[d.att], lab = (old ? 'Trocar na ' : 'Pôr na ') + ITEMS[g.k].s + ' (' + SLOT[d.att] + ')'; /* a arma com os encaixes: o que recebe a peça acende */ add(lab + (old ? ' · substitui ' + ITEMS[old].s : ''), () => { removeAt(it, loc); g.att = g.att || {}; if (old) { const o = mkItem(old); const left = G.inv.give(o); if (left) { G.dropItem(o); toast('Sem espaço: ' + ITEMS[old].s + ' ficou no chão'); } } g.att[d.att] = it.k; audio.play('recarregar', 0.6); sel = null; }, !old, 'att', `<span class="ag"><img src="${G.ICONS[g.k]}" alt="">${slotsHTML(g, d.att)}</span><span class="at"><b>${lab}</b>${old ? `<small>Substitui: ${ITEMS[old].s}</small>` : ''}</span>`); } }
    };
    if (loc.t === 'box') { add('Tirar', () => takeToMe(it, loc), true); attActs(); if (loaded) add('Descarregar (' + (d.gun ? it.ammo : it.am) + ' balas)', unload); }
    else {
      if (d.use) add('Usar', () => { G.use(it); if (G.TOUCH) closeInv(); });
      if (d.deploy) add('Colocar', () => { G.base.deploy(it); sel = null; closeInv(); }, true); // escolhe-se o sítio no mundo (fantasma) e depois Colocar
      if (d.eq && loc.t !== 'eq') add('Equipar', () => move(it, loc, { t: 'eq', s: d.eq }) || toast('Não dá para equipar agora'), !d.use);
      if (loc.t === 'eq') add('Tirar', () => toBag(it, loc), true);
      if (loc.t === 'bag' && !d.eq) add('Para o cinto', () => { const i = G.inv.belt.indexOf(null); if (i < 0) return toast('Cinto cheio'); move(it, loc, { t: 'belt', i }); }, !d.use);
      if (loc.t === 'belt') add('Para a mochila', () => toBag(it, loc));
      if (G.box) add('Pôr na caixa', () => toBox(it, loc));
      attActs();
      if (d.gun && it.att) for (const slot of ['scope', 'sup', 'light']) if (it.att[slot]) add('Tirar ' + ITEMS[it.att[slot]].s, () => { const a = mkItem(it.att[slot]); const left = G.inv.give(a); if (left) { G.dropItem(a); toast('Sem espaço: ficou no chão'); } it.att[slot] = null; });
      // carregadores: encher, esvaziar, meter numa arma; e tirar o carregador da arma
      if (d.clip) {
        const cap = d.clip.cap, loose = d.clip.ammo.filter(k => G.inv.count(k) > 0);
        if ((it.am || 0) < cap && loose.length) add('Encher', () => { let k = it.am ? it.ak : (loose.includes(it.ak) ? it.ak : loose[0]); if (it.am && !loose.includes(k)) return toast('Sem balas de ' + ITEMS[k].s); it.ak = k; it.am = (it.am || 0) + G.inv.take(k, cap - (it.am || 0)); audio.play('recarregar', 0.5); }, true);
        if (it.am) add('Esvaziar', () => { const a = mkItem(it.ak, it.am); it.am = 0; const left = G.inv.give(a); if (left) { G.dropItem(a); toast('Sem espaço: as balas ficaram no chão'); } });
        const gs = G.inv.belt.filter(g => g && ITEMS[g.k].gun && ITEMS[g.k].gun.clip === it.k);
        for (const g of gs.slice(0, 2)) add('Meter na ' + ITEMS[g.k].s, () => { removeAt(it, loc); if (g.mg) { const old = mkItem(g.mg); old.am = g.ammo; old.ak = g.ak; const left = G.inv.give(old); if (left) { G.dropItem(old); toast('Sem espaço: o outro ficou no chão'); } } g.mg = it.k; g.ammo = it.am || 0; g.ak = it.ak; audio.play('recarregar', 0.6); sel = null; });
      }
      if (d.gun && !d.gun.clip && (it.ammo | 0) > 0) add('Descarregar', unload);
      if (d.gun && d.gun.clip && it.mg) add('Tirar carregador', () => { const m = mkItem(it.mg); m.am = it.ammo; m.ak = it.ak; it.mg = null; it.ammo = 0; const left = G.inv.give(m); if (left) { G.dropItem(m); toast('Sem espaço: ficou no chão'); } });
      if (d.gun) for (const k of ammoOf(d.gun)) if (k !== (it.pref || it.ak) && ammoOf(d.gun).length > 1) add('Usar ' + ITEMS[k].s, () => { it.pref = k; toast('Na próxima recarga usa ' + ITEMS[k].s); });
      if (it.n > 1) add('Dividir', () => split(it));
      if (loc.t === 'bag' && d.w !== d.h) add('Rodar', () => rotateAt(it, loc));
      add('Largar no chão', () => { removeAt(it, loc); G.dropItem(it); sel = null; }, false, 'end');
    }
    // a ação principal vai primeiro, a toda a largura; largar fica no fim
    [...ac.querySelectorAll('.btn.pri')].reverse().forEach(b => ac.prepend(b));
    placeBar();
  };
  // o cartão do objeto aparece ao lado dele (deitado: à esquerda ou à direita; ao alto: por cima ou por baixo), sem o tapar
  const bar = $('iBar');
  const placeBar = () => {
    if (bar.hidden || !sel) return; const src = [...inv.querySelectorAll('[data-src]')].find(e => { const f = e.dataset.src && fromSrc(e.dataset.src); return f && f.it === sel.it; });
    const vw = innerWidth, vh = innerHeight, m = 8, W = bar.offsetWidth, H = bar.offsetHeight, r = src ? src.getBoundingClientRect() : { left: vw / 2, right: vw / 2, top: vh / 2, bottom: vh / 2, width: 0, height: 0 };
    let x, y;
    if (vh > vw) { x = (vw - W) / 2; const head = inv.querySelector('.ihead').getBoundingClientRect().bottom + 6; y = r.top + r.height / 2 > vh / 2 ? Math.max(head, r.top - H - 10) : Math.min(vh - H - m, r.bottom + 10); if (y < head) y = head; }
    else { const right = r.left + r.width / 2 < vw / 2; x = right ? r.right + 10 : r.left - W - 10; x = clamp(x, m, vw - W - m); y = clamp(r.top - 6, m, vh - H - m); }
    bar.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
  };
  $('iBarX').onclick = () => { audio.play('ui'); sel = null; render(); };
  $('iDesc').onclick = () => { $('iDesc').classList.toggle('open'); placeBar(); };
  addEventListener('resize', () => { if (G.invOpen) requestAnimationFrame(placeBar); });
  // treino: nível, barra e o que já ganhaste, em números reais
  const renderSkills = () => {
    const v = k => G.sk(k), pc = x => Math.round(x * 100), L = [
      ['res', 'Treina-se a correr.', x => `Corres ${Math.round(100 / (3.3 * (1 - 0.4 * x)))}\u00a0s seguidos e recuperas ${pc(0.3 * x)}% mais depressa. Gastas ${pc(0.15 * x)}% menos comida e água.`],
      ['mira', 'Treina-se a disparar e, mais ainda, a acertar (cabeça conta a dobrar).', x => `${pc(0.35 * x)}% menos recuo, ${pc(0.3 * x)}% menos balanço na mira e ${pc(0.2 * x)}% menos dispersão. Susténs a respiração ${(4 + 3 * x).toFixed(1).replace('.', ',')}\u00a0s.`],
      ['rec', 'Treina-se a cortar árvores e a partir rochas.', x => `+${pc(0.5 * x)}% de madeira, pedra e minério por golpe.`]];
    $('skl').innerHTML = L.map(([k, how, fx]) => { const x = v(k), n = Math.floor(x * 10 + 0.05); return `<div class="sk"><div class="t"><b>${G.SKN[k]}</b><span class="lv">${n}<small> / 10</small></span></div><div class="bar"><i style="width:${(x * 100).toFixed(1)}%"></i></div><p>${fx(x)}</p><p class="how">${how}</p></div>`; }).join('');
  };
  const renderCraft = () => {
    const el = $('recipes'); el.innerHTML = ''; const bn = G.base ? G.base.benchNear() : 0;
    const head = t => { const h = document.createElement('div'); h.className = 'rhead'; h.textContent = t; el.appendChild(h); };
    let last = -1; const can = r => Object.entries(r.need).every(([k, n]) => G.inv.count(k) >= n) ? 1 : 0;
    // em cada nível, primeiro o que já dá para fazer
    for (const r of RECIPES.map((r, i) => [r, i]).sort((a, b) => (a[0].b || 0) - (b[0].b || 0) || can(b[0]) - can(a[0]) || a[1] - b[1]).map(a => a[0])) {
      const lv = r.b || 0; if (lv !== last) { last = lv; head(lv ? 'Bancada nível ' + lv + (bn >= lv ? '' : ' · precisas de uma a menos de 4 m') : 'À mão'); }
      const d = ITEMS[r.k], has = Object.entries(r.need).every(([k, n]) => G.inv.count(k) >= n), near = bn >= lv, ok = has && near;
      const row = document.createElement('div'); row.className = 'recipe' + (near ? '' : ' lock');
      row.innerHTML = `<img src="${G.ICONS[r.k]}" alt=""><div class="rn"><b>${d.n}${r.n > 1 ? ' × ' + r.n : ''}</b><div class="need">${Object.entries(r.need).map(([k, n]) => { const h = G.inv.count(k); return `<span class="${h >= n ? 'ok' : 'no'}">${ITEMS[k].s} ${Math.min(h, n)}/${n}</span>`; }).join('')}</div></div>`;
      const b = document.createElement('button'); b.className = 'btn sm' + (ok ? ' pri' : ''); b.textContent = near ? 'Fabricar' : 'Bancada ' + lv; b.disabled = !ok;
      b.onclick = () => { if (!Object.entries(r.need).every(([k, n]) => G.inv.count(k) >= n) || (G.base ? G.base.benchNear() : 0) < lv) return; for (const [k, n] of Object.entries(r.need)) G.inv.take(k, n); G.gain(r.k, r.n); if (G.net && G.net.world) G.net.raw({ t: 'cr', i: RECIPES.indexOf(r) }); audio.play('apanhar'); render(); };
      row.appendChild(b); el.appendChild(row);
    }
  };

  // ---------- regras de mudar objetos de sítio
  const locate = it => { const w = G.inv.where(it); if (w) { if (w.t === 'bag') { const e = G.inv.bag.list.find(e => e.it === it); return { t: 'bag', x: e.x, y: e.y }; } return w; } if (G.box) { const e = G.box.grid.list.find(e => e.it === it); if (e) return { t: 'box', x: e.x, y: e.y }; } return null; };
  const gridOf = t => t === 'bag' ? G.inv.bag : t === 'box' && G.box ? G.box.grid : null;
  const rowsOf = t => t === 'bag' ? G.inv.rows() : G.box ? G.box.grid.rows : 0;
  const removeAt = (it, loc) => { if (!loc) return; if (loc.t === 'bag' || loc.t === 'box') gridOf(loc.t).remove(it); else if (loc.t === 'belt') G.inv.belt[loc.i] = null; else if (loc.t === 'eq') G.inv.eq[loc.s] = null; if (G.p.use && G.p.use.it === it) G.p.use = null; };
  const placeAt = (it, loc) => { if (!loc) return false; if (loc.t === 'bag' || loc.t === 'box') { const g = gridOf(loc.t); if (g && g.fits(it, loc.x, loc.y, rowsOf(loc.t))) { g.add(it, loc.x, loc.y); return true; } return false; } if (loc.t === 'belt') { if (!G.inv.belt[loc.i]) { G.inv.belt[loc.i] = it; return true; } return false; } if (loc.t === 'eq') { if (!G.inv.eq[loc.s] && ITEMS[it.k].eq === loc.s) { G.inv.eq[loc.s] = it; return true; } return false; } return false; };
  const snap = () => ({ bag: G.inv.bag.list.map(e => ({ ...e })), box: G.box ? G.box.grid.list.map(e => ({ ...e })) : null, belt: G.inv.belt.slice(), eq: { ...G.inv.eq }, n: G.inv.all().concat(G.box ? G.box.grid.list.map(e => e.it) : []).map(it => [it, it.n, it.r]) });
  const unsnap = s => { G.inv.bag.list = s.bag; if (G.box && s.box) G.box.grid.list = s.box; G.inv.belt = s.belt; G.inv.eq = s.eq; for (const [it, n, r] of s.n) { it.n = n; it.r = r; } };
  const valid = () => G.inv.bag.list.every(e => e.y + IH(e.it) <= G.inv.rows());
  const doMove = (it, from, to) => {
    if (to.t === 'ground') { removeAt(it, from); G.dropItem(it); return true; }
    if (to.t === 'bag' || to.t === 'box') {
      const g = gridOf(to.t); if (!g) return false; const d = ITEMS[it.k], rows = rowsOf(to.t);
      const under = to.px !== undefined ? g.at(to.px, to.py) : null;
      if (under && under.it !== it && under.it.k === it.k && d.st) { const m = Math.min(d.st - under.it.n, it.n); if (m <= 0) return false; under.it.n += m; it.n -= m; if (!it.n) removeAt(it, from); return true; }
      const x = clamp(to.x, 0, g.cols - IW(it)), y = clamp(to.y, 0, rows - IH(it));
      removeAt(it, from); if (!g.fits(it, x, y, rows)) return false; g.add(it, x, y); return true;
    }
    if (to.t === 'belt') { const occ = G.inv.belt[to.i]; if (occ === it) return true; removeAt(it, from); if (occ) G.inv.belt[to.i] = null; G.inv.belt[to.i] = it; if (occ && !placeAt(occ, from) && G.inv.bag.insert(occ, G.inv.rows())) return false; return true; }
    if (to.t === 'eq') { if (ITEMS[it.k].eq !== to.s) return false; const occ = G.inv.eq[to.s]; if (occ === it) return true; removeAt(it, from); G.inv.eq[to.s] = it; if (occ && !placeAt(occ, from) && G.inv.bag.insert(occ, G.inv.rows())) return false; return true; }
    return false;
  };
  const move = (it, from, to) => { const s = snap(); let ok = false; try { ok = doMove(it, from, to) && valid(); } catch (e) { console.error(e); ok = false; } if (!ok) { unsnap(s); toast(from.t === 'eq' && from.s === 'back' ? 'Tira primeiro o que está nas duas filas de baixo da mochila' : to.t === 'eq' ? 'Não dá para pôr aí' : 'Não cabe aí'); } else audio.play('apanhar', 0.6); G.refresh(); return ok; };
  const toBag = (it, loc) => { const s = snap(); removeAt(it, loc); const left = G.inv.bag.insert(it, G.inv.rows()); if (left || !valid()) { unsnap(s); toast(left ? 'Mochila cheia' : 'Tira primeiro o que está nas duas filas de baixo da mochila'); return false; } return true; };
  const toBox = (it, loc) => { const s = snap(); removeAt(it, loc); const left = G.box.grid.insert(it); if (left) { unsnap(s); toast('A caixa está cheia'); } };
  const takeToMe = (it, loc) => { const n0 = it.n; G.box.grid.remove(it); const left = G.inv.give(it); if (left) { it.n = left; G.box.grid.insert(it); toast('Mochila cheia'); } if (n0 - left > 0) { feed(it.k, n0 - left); audio.play('apanhar'); } };
  // rodar no sítio; se não couber, procura outro espaço já rodado
  const rotateAt = (it, loc) => { const g = gridOf(loc.t), rows = rowsOf(loc.t); it.r = !it.r; if (g.fits(it, loc.x, loc.y, rows)) { const e = g.list.find(e => e.it === it); if (e) { e.x = loc.x; e.y = loc.y; } return; }
    for (let y = 0; y < rows; y++) for (let x = 0; x < g.cols; x++) if (g.fits(it, x, y, rows)) { const e = g.list.find(e => e.it === it); e.x = x; e.y = y; return; }
    it.r = !it.r; toast('Não cabe rodado'); };
  const split = it => { const h = Math.floor(it.n / 2); const n = mkItem(it.k, h); const p = G.inv.bag.firstFit(n, G.inv.rows()); if (!p) return toast('Sem espaço para dividir'); it.n -= h; G.inv.bag.add(n, p[0], p[1]); };
  $('takeAll').onclick = () => { if (!G.box) return; const list = [...G.box.grid.list].sort((a, b) => ITEMS[b.it.k].w * ITEMS[b.it.k].h - ITEMS[a.it.k].w * ITEMS[a.it.k].h); let full = false; for (const e of list) { const n0 = e.it.n; G.box.grid.remove(e.it); const left = G.inv.give(e.it); if (left) { e.it.n = left; G.box.grid.add(e.it, e.x, e.y); full = true; } if (n0 - left > 0) feed(e.it.k, n0 - left); } audio.play('apanhar'); if (full) toast('Mochila cheia: ficou alguma coisa'); G.refresh(); };

  // ---------- arrastar e tocar
  let drag = null;
  const ghost = document.createElement('div'); ghost.id = 'dragG'; ghost.hidden = true; document.body.appendChild(ghost);
  const prev = document.createElement('div'); prev.className = 'prev';
  const fromSrc = src => { if (!src) return null; const [t, v] = src.split(':'); if (t === 'bag' || t === 'box') { const g = gridOf(t); const e = g && g.list.find(e => String(e.it.id) === v); return e ? { it: e.it, loc: { t, x: e.x, y: e.y } } : null; } if (t === 'belt') { const it = G.inv.belt[+v]; return it ? { it, loc: { t, i: +v } } : null; } if (t === 'eq') { const it = G.inv.eq[v]; return it ? { it, loc: { t, s: v } } : null; } return null; };
  const targetAt = (x, y, grab) => {
    ghost.hidden = true; const el = document.elementFromPoint(x, y); if (drag && drag.moved) ghost.hidden = false; if (!el) return null;
    const g = el.closest('.grid'); if (g && g.dataset.kind && gridOf(g.dataset.kind)) { const r = g.getBoundingClientRect(); const px = Math.floor((x - r.left) / (CS + GAP)), py = Math.floor((y - r.top) / (CS + GAP)); return { t: g.dataset.kind, x: px - grab[0], y: py - grab[1], px, py, el: g }; }
    const s = el.closest('[data-belt],[data-eq]'); if (s) return s.dataset.belt !== undefined ? { t: 'belt', i: +s.dataset.belt, el: s } : { t: 'eq', s: s.dataset.eq, el: s };
    if (!el.closest('.col,.ihead,.ibar')) return { t: 'ground' };
    return null;
  };
  // rodar a meio do arrasto: R no teclado ou um toque com o outro dedo
  const ghostDraw = () => { const r = !!drag.it.r; ghost.className = r ? 'rot' : ''; ghost.style.width = drag.w + 'px'; ghost.style.height = drag.h + 'px'; ghost.style.setProperty('--bw', drag.w + 'px'); ghost.style.setProperty('--bh', drag.h + 'px'); };
  const dragRotate = () => { if (!drag || !drag.moved || drag.none) return; const d = ITEMS[drag.it.k]; if (d.w === d.h) return;
    drag.it.r = !drag.it.r; [drag.w, drag.h] = [drag.h, drag.w]; drag.grab = [Math.min(IW(drag.it) - 1, Math.floor(IW(drag.it) / 2)), Math.min(IH(drag.it) - 1, Math.floor(IH(drag.it) / 2))]; drag.ox = drag.w / 2; drag.oy = drag.h / 2;
    ghostDraw(); audio.play('ui', 0.5); dragMove(drag.lx, drag.ly); };
  addEventListener('keydown', e => { if ((e.key === 'r' || e.key === 'R') && drag && drag.moved) { e.preventDefault(); e.stopPropagation(); dragRotate(); } }, true);
  inv.addEventListener('pointerdown', e => {
    if (e.target.closest('#iBar')) return;
    if (drag && !drag.none && drag.moved && e.pointerId !== drag.pid) { e.preventDefault(); dragRotate(); return; }
    const src = e.target.closest('[data-src]'); const s = src && src.dataset.src ? fromSrc(src.dataset.src) : null;
    if (!s) { drag = { none: true, x: e.clientX, y: e.clientY, target: e.target }; return; }
    const r = src.getBoundingClientRect(), iw = IW(s.it), ih = IH(s.it);
    const grab = src.classList.contains('item') ? [Math.min(iw - 1, Math.floor((e.clientX - r.left) / (CS + GAP))), Math.min(ih - 1, Math.floor((e.clientY - r.top) / (CS + GAP)))] : [0, 0];
    drag = { ...s, el: src, pid: e.pointerId, r0: !!s.it.r, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, moved: false, grab, ox: e.clientX - r.left, oy: e.clientY - r.top, w: src.classList.contains('item') ? r.width : P(iw), h: src.classList.contains('item') ? r.height : P(ih) };
    try { inv.setPointerCapture(e.pointerId); } catch (er) { }
  });
  const dragMove = (cx, cy) => {
    ghost.style.transform = `translate(${cx - drag.ox}px,${cy - drag.oy}px)`;
    const t = targetAt(cx, cy, drag.grab); inv.querySelectorAll('.slot.drop').forEach(x => x.classList.remove('drop')); prev.remove();
    if (t && (t.t === 'bag' || t.t === 'box')) { const g = gridOf(t.t), d = ITEMS[drag.it.k], rows = rowsOf(t.t), iw = IW(drag.it), ih = IH(drag.it); const x = clamp(t.x, 0, g.cols - iw), y = clamp(t.y, 0, rows - ih); const under = g.at(t.px, t.py); const ok = (under && under.it.k === drag.it.k && d.st && under.it !== drag.it) || g.fits(drag.it, x, y, rows); prev.className = 'prev ' + (ok ? 'ok' : 'no'); Object.assign(prev.style, { left: x * (CS + GAP) + 'px', top: y * (CS + GAP) + 'px', width: P(iw) + 'px', height: P(ih) + 'px' }); t.el.appendChild(prev); }
    else if (t && t.el) t.el.classList.add('drop');
  };
  inv.addEventListener('pointermove', e => {
    if (!drag || drag.none || e.pointerId !== drag.pid) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 7) { drag.moved = true; ghost.innerHTML = `<img src="${G.ICONS[drag.it.k]}" alt="">`; ghostDraw(); ghost.hidden = false; drag.el.classList.add('drag'); bar.hidden = true; if (!drag.el.classList.contains('item')) { drag.ox = drag.w / 2; drag.oy = drag.h / 2; } }
    if (!drag.moved) return;
    drag.lx = e.clientX; drag.ly = e.clientY; dragMove(e.clientX, e.clientY);
  });
  const endDrag = e => {
    if (!drag || (drag.pid !== undefined && e.pointerId !== drag.pid)) return; const D = drag; drag = null; ghost.hidden = true; prev.remove(); inv.querySelectorAll('.slot.drop').forEach(x => x.classList.remove('drop'));
    if (D.none) { // toque em sítio vazio: mover o selecionado para lá
      if (Math.hypot(e.clientX - D.x, e.clientY - D.y) > 8 || !sel) return; const t = targetAt(e.clientX, e.clientY, [0, 0]); const l = locate(sel.it); if (!t || !l || t.t === 'ground') { if (!(D.target && D.target.closest && D.target.closest('button'))) { sel = null; render(); } return; }
      if ((t.t === 'bag' || t.t === 'box') && gridOf(t.t).at(t.px, t.py) && gridOf(t.t).at(t.px, t.py).it !== sel.it && gridOf(t.t).at(t.px, t.py).it.k !== sel.it.k) return;
      move(sel.it, l, t); return;
    }
    if (D.moved) { D.el.classList.remove('drag'); const t = targetAt(e.clientX, e.clientY, D.grab); const l = locate(D.it); let ok = false; if (t && l) { ok = move(D.it, l, t); if (t.t === 'ground') sel = null; else sel = { it: D.it }; } if (!ok) D.it.r = D.r0; render(); return; }
    // toque num objeto
    const now = performance.now();
    if (lastTap.id === D.it.id && now - lastTap.t < 320) { lastTap = { id: 0, t: 0 }; quick(D.it, locate(D.it)); return; }
    lastTap = { id: D.it.id, t: now };
    if (sel && sel.it !== D.it && D.loc.t !== 'box' && sel.it.k === D.it.k && ITEMS[D.it.k].st) { const l = locate(sel.it); if (l && (D.loc.t === 'bag' || D.loc.t === 'box')) { move(sel.it, l, { ...D.loc, px: D.loc.x, py: D.loc.y }); sel = null; render(); return; } }
    sel = sel && sel.it === D.it ? null : { it: D.it }; audio.play('ui'); render();
  };
  inv.addEventListener('pointerup', endDrag); inv.addEventListener('pointercancel', e => { if (drag && drag.pid !== undefined && e.pointerId !== drag.pid) return; if (drag && drag.el) drag.el.classList.remove('drag'); if (drag && drag.it && !drag.none) drag.it.r = drag.r0; drag = null; ghost.hidden = true; prev.remove(); render(); });
  const quick = (it, loc) => { if (!loc) return; const d = ITEMS[it.k]; if (d.use && loc.t !== 'box') G.use(it); /* dois toques num consumível: come, bebe ou trata */ else if (loc.t === 'box') takeToMe(it, loc); else if (loc.t === 'eq' || loc.t === 'belt') toBag(it, loc); else if (G.box) toBox(it, loc); else if (d.eq) move(it, loc, { t: 'eq', s: d.eq }); else if (d.use) G.use(it); else { const i = G.inv.belt.indexOf(null); if (i >= 0) move(it, loc, { t: 'belt', i }); } sel = null; G.refresh(); };

  const openInv = (box, t) => { G.invOpen = true; G.sticks.L = G.sticks.R = null; G.box = box || null; if (G.box) tab = 'inv'; if (t) tab = t; if (G.ARENA) tab = 'inv'; /* na arena não há fabrico nem treino */ inv.classList.toggle('arena', !!G.ARENA); { const b0 = inv.querySelector('.tabs [data-tab="inv"]'); if (b0) b0.textContent = G.ARENA ? 'Inventário' : 'Perto de ti'; } inv.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x.dataset.tab === tab)); inv.dataset.tab = tab; inv.hidden = false; inv.classList.toggle('has-box', !!G.box); layout(); sel = null; render(); audio.play('ui'); };
  const closeInv = () => { G.invOpen = false; inv.hidden = true; G.box = null; sel = null; drag = null; ghost.hidden = true; };


  // ---------- definições (guardadas neste browser)
  // sensibilidade por defeito mais alta no telemóvel (o polegar anda pouco)
  const SENS0 = matchMedia('(pointer: coarse)').matches ? 1.7 : 1.2;
  const DEF = { v: 2, quick: true, mirror: false, sprintPush: true, assist: true, autoDoor: true, autoLean: true, sens: SENS0, sensV: 2, btn: 1, op: 1, shadows: true, props: true, outline: true, lowres: false, fps: false, vol: 0.7, musMenu: 0.7, musGame: 0.5, soundViz: true, haptics: false,
    hud: { mm: { on: 1 }, zone: { on: 1 }, tr: { on: 1 }, vit: { on: 1 }, cmp: { on: 1 }, belt: { on: 1 }, ammo: { on: 1 }, feed: { on: 1 }, reload: { on: 1 }, use: { on: 1 }, sprint: { on: 1 }, jump: { on: 1 }, crouch: { on: 1 }, prone: { on: 1 }, fire: { on: 1 }, light: { on: 1 }, scope: { on: 1 }, ads: { on: 1 }, lower: { on: 1 }, breath: { on: 1 } } };
  const NAMES = { mm: 'Minimapa', zone: 'Zona', tr: 'Mapa, inventário e definições', vit: 'Vida, comida e água', cmp: 'Bússola', belt: 'Cinto', ammo: 'Munições', feed: 'Avisos de recolha', reload: 'Recarregar', use: 'Revistar e portas', sprint: 'Correr sempre (Auto)', jump: 'Saltar', crouch: 'Agachar', prone: 'Deitar', fire: 'Mirar e disparar', light: 'Lanterna', scope: 'Vista (1.ª ou 3.ª pessoa)', ads: 'Mira (na 1.ª pessoa)', lower: 'Baixar a arma', breath: 'Respirar' };
  const BTN = ['reload', 'use', 'sprint', 'jump', 'crouch', 'prone', 'fire', 'tr', 'light', 'scope', 'ads', 'lower', 'breath'];
  let cfg; try { cfg = JSON.parse(localStorage.getItem('kurogane-cfg-v1') || 'null'); } catch (e) { cfg = null; }
  if (cfg && cfg.v === 1) { cfg.v = 2; for (const k in cfg.hud) { const h = cfg.hud[k]; if (h.dx || h.dy || h.s) h.L = { dx: h.dx || 0, dy: h.dy || 0, s: h.s || 1 }; delete h.dx; delete h.dy; delete h.s; } if (cfg.hud.fire) cfg.hud.fire.on = 1; delete cfg.fire; }
  if (!cfg || cfg.v !== 2) cfg = JSON.parse(JSON.stringify(DEF)); for (const k in DEF) if (cfg[k] === undefined) cfg[k] = JSON.parse(JSON.stringify(DEF[k])); for (const k in DEF.hud) if (!cfg.hud[k]) cfg.hud[k] = { ...DEF.hud[k] };
  if (cfg.sensV !== 2) { if (cfg.sens === 1) cfg.sens = SENS0; cfg.sensV = 2; }
  if ((cfg.hudV | 0) < 3) { cfg.hudV = 3; for (const k of ['vit', 'tr', 'feed', 'fire', 'reload', 'jump', 'ads', 'crouch', 'prone']) if (cfg.hud && cfg.hud[k]) delete cfg.hud[k].L; } /* HUD compacta: as posições mudaram, recomeça do sítio novo */
  if (!cfg.autoV) { cfg.autoV = 1; if (cfg.hud && cfg.hud.sprint) cfg.hud.sprint.on = 1; } // o botão de correr sempre passa a aparecer
  if (!cfg.q2) { cfg.q2 = 1; cfg.quick = true; } // 0.22: o botão grande passa a disparar logo (antes o 1.º toque só levantava a arma)
  G.cfg = cfg; G.FP_ONLY = true; G.fpFree = G.FP_ONLY || !!cfg.fpView; // teste: o jogo só em 1.ª pessoa (a 3.ª continua para os outros te verem) // a vista escolhida fica guardada
  const saveCfg = () => { cfg.ts = Date.now(); try { localStorage.setItem('kurogane-cfg-v1', JSON.stringify(cfg)); } catch (e) { } try { Conta.enviar(); } catch (e) { } }; // fica no aparelho e, com conta, na nuvem (volta ao entrar noutro aparelho ou se o browser apagar os dados)

  // ---------- música do menu: começa no primeiro toque (os browsers não deixam antes), entra e sai devagar
  // música: menu; em jogo a de fundo (baixa) e, em perigo, uma das de tensão com fade
  const MUS = makeMusic(() => audio.context()), PER = ['p1', 'p2', 'p3'];
  MUS.add('menu', 'menu.mp3', 0.7, 1.2, 0.8); MUS.add('fundo', 'fundo.mp3', 0.57, 6, 3);
  MUS.add('p1', 'perigo1.mp3', 1, 2.5, 5); MUS.add('p2', 'perigo2.mp3', 1, 2.5, 5); MUS.add('p3', 'perigo3.mp3', 1, 2.5, 5);
  MUS.T.menu.el.addEventListener('error', () => { $('sMus').hidden = true; });
  const musVol = k => (cfg.music === false ? 0 : (cfg.vol ?? 0.7) * (k === 'menu' ? cfg.musMenu ?? 0.7 : cfg.musGame ?? 0.5));
  let musGo = false, perK = null, perOn = false;
  const musState = () => {
    if (!musGo) return [];
    if (!$('start').hidden || !$('gate').hidden || !$('modes').hidden || !$('news').hidden) return ['menu'];
    const p = G.p; if (!G.playing || !p || !p.alive || !$('dead').hidden) return [];
    if (G.danger && G.danger()) {
      if (!perOn) { perOn = true; if (!(perK && MUS.playing(perK))) { const o = PER.filter(k => MUS.ok(k) && k !== perK); if (o.length) perK = o[Math.random() * o.length | 0]; if (perK) MUS.rewindIfStale(perK, 90); } }
      return perK && MUS.ok(perK) ? [perK] : ['fundo'];
    }
    perOn = false; return ['fundo'];
  };
  let musT = performance.now();
  const musRun = () => { const n = performance.now(), dt = Math.min(0.5, (n - musT) / 1000); musT = n; MUS.only(musState()); MUS.tick(dt, musVol); };
  setInterval(musRun, 100);
  document.addEventListener('visibilitychange', () => MUS.hide(document.hidden));
  // o 1.º toque desbloqueia o som (tem de ser dentro do gesto)
  const kick = () => { musGo = true; musRun(); }; addEventListener('pointerdown', kick, true); addEventListener('keydown', kick, true);
  const musBtn = () => $('sMus').classList.toggle('mute', cfg.music === false);
  $('sMus').onclick = e => { e.stopPropagation(); cfg.music = cfg.music === false; saveCfg(); musBtn(); musRun(); };
  G.music = MUS;
  musBtn();

  // ---------- perfis e conta
  const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  // teclado do telemóvel aberto: as janelas encolhem para cima dele e o botão principal fica à vista (no iPhone o browser não o faz sozinho)
  const nextBtn = el => { const box = el.closest('.pfbox, .ov'); return box ? [...box.querySelectorAll('button')].find(q => q.offsetParent && (el.compareDocumentPosition(q) & Node.DOCUMENT_POSITION_FOLLOWING)) : null; };
  { const vv = window.visualViewport, kbSet = () => { const h = vv ? Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop)) : 0; document.documentElement.style.setProperty('--kb', h + 'px'); for (const o of document.querySelectorAll('.ov')) o.classList.toggle('kb', h > 80 && !!o.querySelector('input:focus, textarea:focus')); };
    if (vv) { vv.addEventListener('resize', kbSet); vv.addEventListener('scroll', kbSet); }
    document.addEventListener('focusin', e => { if (!/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return; setTimeout(() => { kbSet(); const b = nextBtn(e.target); e.target.scrollIntoView({ block: 'center' }); if (b) b.scrollIntoView({ block: 'nearest' }); }, 350); });
    // Enter (ou «Ir» no teclado) carrega no botão que vem a seguir ao campo
    document.addEventListener('keydown', e => { if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return; const b = nextBtn(e.target); if (b) { e.preventDefault(); b.click(); } });
    document.addEventListener('focusout', () => setTimeout(kbSet, 100)); }
  const pfm = $('pfm'), pfB = $('pfB');
  const pfClose = () => { pfm.hidden = true; pfB.onclick = null; pfm.classList.remove('wide', 'kpw'); };
  let mnT = 0; const mnote = t => { const m = $('mnote'); m.textContent = t; m.hidden = false; clearTimeout(mnT); mnT = setTimeout(() => { m.hidden = true; }, 9000); };
  $('pfX').onclick = () => { audio.play('ui'); pfClose(); };
  // teclado de código (fechaduras): 4 números, apagar e confirmar; também com as teclas do computador
  let KP = null;
  const keypad = ({ title, lead, ok, onCode }) => {
    $('pfT').textContent = title; pfm.classList.remove('wide', 'kpw'); pfm.classList.add('kpw');
    pfB.innerHTML = `<p class="kp-lead">${lead}</p><div class="kp-dots" aria-hidden="true"><i></i><i></i><i></i><i></i></div><p class="kp-msg" id="kpM" role="status"></p><div class="kp">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button class="btn kp-k" data-n="${n}">${n}</button>`).join('')}<button class="btn kp-k kp-x" data-n="x" aria-label="Apagar">{{delete}}</button><button class="btn kp-k" data-n="0">0</button><button class="btn pri kp-k kp-ok" data-n="ok">${ok}</button></div>`;
    let code = ''; const dots = pfB.querySelector('.kp-dots'), okB = pfB.querySelector('.kp-ok');
    const draw = () => { dots.querySelectorAll('i').forEach((e, i) => e.classList.toggle('on', i < code.length)); okB.disabled = code.length !== 4; };
    const press = n => { if (n === 'x') code = code.slice(0, -1); else if (n === 'ok') { if (code.length === 4) onCode(code); return; } else if (code.length < 4) code += n; $('kpM').textContent = ''; draw(); };
    pfB.onclick = e => { const b = e.target.closest('.kp-k'); if (!b) return; e.stopPropagation(); audio.play('ui'); G.buzz && G.buzz(8); press(b.dataset.n); };
    KP = { press, err: t => { code = ''; draw(); $('kpM').textContent = t; dots.classList.remove('shake'); void dots.offsetWidth; dots.classList.add('shake'); G.buzz && G.buzz(40); } };
    draw(); pfm.hidden = false; return KP;
  };
  document.addEventListener('keydown', e => { if (!KP || pfm.hidden || !pfB.querySelector('.kp')) return; if (/^[0-9]$/.test(e.key)) KP.press(e.key); else if (e.key === 'Backspace') KP.press('x'); else if (e.key === 'Enter') KP.press('ok'); else return; e.preventDefault(); e.stopPropagation(); }, true);
  const codeAsk = T => keypad({ title: 'Fechadura', lead: T.door ? 'Esta porta tem fechadura. Escreve o código de 4 números.' : 'Este baú tem fechadura. Escreve o código de 4 números.', ok: 'Abrir', onCode: c => G.base.lockSend(T, { t: 'lkc', code: c }) });
  const codeErr = t => { if (KP && !pfm.hidden && pfB.querySelector('.kp')) KP.err(t || 'Código errado'); else toast(t || 'Código errado'); };
  const codeDone = m => { if (KP && !pfm.hidden && pfB.querySelector('.kp')) { KP = null; pfClose(); }
    if (m.k[0] === 'd' && !m.set && !m.rm) { const d = G.base.deps.find(q => 'd' + q.nid === m.k); if (d && d.c) G.net.open(d.c); } };
  const lockMenu = T => {
    const cl = G.base.lockOf(T), what = T.door ? 'porta' : 'baú', set = (title, ok) => keypad({ title, lead: cl ? 'Escolhe o novo código. Quem já sabia o antigo deixa de entrar (o teu clã continua a entrar).' : `Escolhe um código de 4 números para esta ${what}. Quem o souber entra; tu e o teu clã entram sempre.`, ok, onCode: c => { G.base.lockSend(T, { t: 'lkset', code: c }); KP = null; pfClose(); } });
    if (!cl) { if (!G.inv.count('fechadura')) { toast('Precisas de uma fechadura de código'); return; } set('Pôr fechadura', 'Trancar'); return; }
    $('pfT').textContent = 'Fechadura'; pfm.classList.remove('wide', 'kpw');
    pfB.innerHTML = `<p>${cl === 2 ? `Esta ${what} já estava trancada antes das fechaduras: só tu e o teu clã entram. Põe um código para o poderes dar a mais alguém.` : `Esta ${what} tem fechadura de código. Tu e o teu clã entram sempre.`}</p><button class="btn pri big" id="lkNew">${cl === 2 ? 'Pôr código' : 'Mudar código'}</button>${cl === 1 ? '<button class="btn big" id="lkRm">Tirar fechadura</button>' : ''}`;
    pfB.onclick = null; $('lkNew').onclick = e => { e.stopPropagation(); audio.play('ui'); set(cl === 2 ? 'Pôr código' : 'Mudar código', 'Guardar'); };
    if ($('lkRm')) $('lkRm').onclick = e => { e.stopPropagation(); audio.play('ui'); G.base.lockSend(T, { t: 'lkset', rm: 1 }); pfClose(); };
    pfm.hidden = false;
  };
  $('tLock').addEventListener('pointerdown', e => { e.stopPropagation(); if (G.lockT) { audio.play('ui'); lockMenu(G.lockT); } });
  const startLabels = () => { $('sCont').hidden = true; $('sPlay').hidden = false; }; // só online: a personagem fica no servidor
  // ---------- lobby: perfil, personagem ao centro, atalhos, JOGAR. Quem já entrou neste aparelho vem direto para aqui
  let lookKey = '';
  const pfRender = () => {
    const a = Conta.ativo(), c = Conta.conta();
    $('lbName').textContent = a && a.nome ? a.nome : '—'; $('lbSub').textContent = c ? 'Conta ligada · na nuvem' : 'Só neste aparelho';
    $('sAccT').textContent = c ? 'Conta' : 'Criar conta';
    const L = (a && a.look) || null, k = JSON.stringify(L || {}) + (a ? a.id : '');
    if (k !== lookKey && G.portraitBig) { lookKey = k; const u = G.portraitBig(L || undefined); $('lbChar').src = u; $('lbAv').src = u; }
    newsDot(); startLabels();
  };
  const showMenu = () => { const a = Conta.ativo(); $('modes').hidden = true; $('news').hidden = true;
    if (a && a.nome) { $('gate').hidden = true; $('start').hidden = false; pfRender(); if (G.ui_count) G.ui_count(); }
    else { $('start').hidden = true; gateShow(); } };
  G.showMenu = showMenu;
  // ---------- entrada: entrar, criar conta ou jogar sem conta. A sessão fica guardada neste aparelho (não se volta a pedir)
  let gMode = 'ent';
  const gateShow = () => { $('gate').hidden = false; $('gForm').hidden = true; $('gBtns').hidden = false; $('gVer').textContent = (document.querySelector('#start .foot') || {}).textContent || ''; };
  const gateForm = m => { gMode = m; audio.play('ui'); $('gBtns').hidden = true; $('gForm').hidden = false; $('gM').textContent = ''; $('gM').className = 'pmsg';
    $('gfT').textContent = m === 'ent' ? 'Entrar' : m === 'reg' ? 'Criar conta' : 'Jogar sem conta'; $('gOk').querySelector('span').textContent = m === 'ent' ? 'Entrar' : m === 'reg' ? 'Criar conta' : 'Começar';
    $('gPw').hidden = m === 'guest'; $('gP').autocomplete = m === 'reg' ? 'new-password' : 'current-password';
    $('gfN').textContent = m === 'ent' ? 'Com o nome e a palavra-passe da tua conta. Trazemos o teu jogo da nuvem.' : m === 'reg' ? 'A personagem, o loot e o mundo ficam guardados na nuvem e continuam noutro aparelho.' : 'Fica tudo só neste aparelho. Podes criar conta depois, em Definições › Conta.';
    setTimeout(() => $('gN').focus(), 60); };
  $('gIn').onclick = () => gateForm('ent'); $('gReg').onclick = () => gateForm('reg'); $('gGuest').onclick = () => gateForm('guest');
  $('gfX').onclick = () => { audio.play('ui'); gateShow(); };
  $('gForm').onsubmit = async e => { e.preventDefault(); const n = $('gN').value.trim(), pw = $('gP').value, msg = (t, k) => { $('gM').textContent = t; $('gM').className = 'pmsg ' + (k || ''); };
    if (!Conta.NOME_OK.test(n)) return msg(Conta.MSG.nome_invalido, 'err');
    if (gMode === 'guest') { const a = Conta.ativo(); if (a && !a.nome) Conta.renomear(n); else if (!Conta.localPorNome(n)) Conta.criar(n); audio.play('apanhar'); showMenu(); mnote('Olá, ' + n + '. Fica tudo guardado neste aparelho.'); return; }
    if (pw.length < 6) return msg(Conta.MSG.pass_invalida, 'err');
    $('gOk').disabled = true; msg(gMode === 'reg' ? 'A criar a conta…' : 'A entrar…');
    try { if (gMode === 'reg') { const a = Conta.ativo(); if (a && !a.nome) Conta.renomear(n); else if (!a || a.conta) Conta.criar(n); await Conta.registar(n, pw); await Conta.enviar(true); audio.play('apanhar'); showMenu(); mnote('Conta criada. O teu jogo fica guardado na nuvem.'); }
      else { await Conta.entrar(n, pw); const r = await Conta.sincronizar(); audio.play('apanhar'); showMenu(); mnote(r === 'nuvem' ? 'Bem-vindo de volta. Trouxemos o teu jogo da nuvem.' : 'Bem-vindo de volta, ' + n + '.'); } }
    catch (err) { msg(Conta.MSG[err.message] || Conta.MSG.rede, 'err'); } finally { $('gOk').disabled = false; } };
  // botões do lobby
  $('prof').onclick = () => { audio.play('ui'); showAccount(); };
  $('sLook').onclick = () => { audio.play('ui'); showLook(); }; $('sProf').onclick = () => { audio.play('ui'); showList(); }; $('sAcc').onclick = () => { audio.play('ui'); showAccount(); };
  $('sGo').onclick = () => { audio.play('ui'); $('modes').hidden = false; if (G.ui_count) G.ui_count(); };
  $('mdX').onclick = () => { audio.play('ui'); $('modes').hidden = true; };
  $('sHow').onclick = () => { audio.play('ui'); $('pfT').textContent = 'Como se joga'; pfm.classList.remove('wide', 'kpw'); pfB.innerHTML = `<div class="keys howk">${$('sKeys').innerHTML}</div><p class="note">Revista tudo, come e bebe, treina o corpo (perde-se ao morrer) e evita a cidade de noite. O melhor loot está no centro, onde há PvP.</p>`; pfm.hidden = false; };
  // ---------- novidades (as mais recentes primeiro; o ponto vermelho some depois de as abrires)
  const NEWS = [
    { id: '0.71', d: '27/11/2026', t: 'Céu novo', img: 'menu/n-ceu.jpg', b: '<p>O céu agora tem sol, nuvens a andar e cores que mudam ao longo do dia: azul de manhã, rosa e laranja ao pôr do sol, estrelas e lua à noite. Ao longe, o nevoeiro funde-se com o horizonte.</p><ul><li>Com chuva o céu fica mais carregado de nuvens</li><li>Imagens novas nos cartões do Survival e da Arena</li></ul>' },
    { id: '0.70', d: '27/11/2026', t: 'Mais fluido e equipamento novo', img: 'menu/n-equipamento.jpg', b: '<p>De dia o jogo faz menos contas por cada píxel: as luzes da noite, da lanterna e dos faróis só contam quando estão acesas. Nos telemóveis deve notar-se nos FPS.</p><ul><li>Capacete com contrapeso, lanterna no trilho e luz em cima</li><li>Colete com rádio e antena, garrote, fivelas e bolsas com puxadores</li><li>Capacetes, coletes e mochilas com sujidade e desgaste</li><li>O contorno dos móveis passa a seguir só o móvel</li><li>O botão Aparência voltou a funcionar</li></ul>' },
    { id: '0.68', d: '27/11/2026', t: 'Contorno no que dá para usar', img: 'menu/n-contorno.jpg', b: '<p>Portas, sacos, carros e móveis que podes abrir ganham uma linha branca à volta quando ficam à tua frente, para saberes logo o que dá para usar.</p><ul><li>Armas, capacetes, coletes e mochilas com desgaste: sujidade, riscos e metal a brilhar onde a tinta saiu</li><li>Para desligar o contorno: Definições › Gráficos</li></ul>' },
    { id: '0.67', d: '27/11/2026', t: 'Menus novos e sessão guardada', img: 'menu/n-menus.jpg', b: '<p>Entrada nova antes de jogar: entras com a tua conta, crias uma ou jogas sem conta. A sessão fica guardada neste aparelho e da próxima vez vens direto para o menu.</p><ul><li>Menu com a tua personagem ao centro, novidades e atalhos</li><li>Escolha do modo com Survival e Arena lado a lado, com quantos estão a jogar</li><li>Definições arrumadas por categorias, com Não/Sim e os valores à vista</li></ul>' },
    { id: '0.66', d: '27/11/2026', t: 'Luz dentro das casas', img: 'menu/n-luzes.jpg', b: '<p>Os prédios têm lâmpadas no teto: umas acesas, outras a piscar e outras partidas. As mais perto de ti iluminam a divisão, e os olhos habituam-se ao escuro lá dentro.</p><ul><li>Postes, marcos do correio, cabines, pilaretes e bicicletas novos</li><li>Sacos no chão e saco de cadáver com forma a sério</li><li>Capacete, colete e mochila com sombras</li></ul>' },
    { id: '0.63', d: '27/11/2026', t: 'Objetos com pormenor', img: 'menu/n-objetos.jpg', b: '<p>Caixotes do lixo, máquinas de bebidas, bancos, caixotes, bidões, cones, candeeiros, ar condicionado, móveis, cozinhas e casas de banho foram refeitos com forma e sombras a sério. Os carros parados têm vidros transparentes e bancos lá dentro.</p><p>Se o telemóvel pesar, desliga em Definições › Gráficos › Objetos com pormenor.</p>' },
    { id: '0.61', d: '27/11/2026', t: 'Granadas, clarões e dano', img: 'menu/n-granada.jpg', b: '<p>Segura o botão para atirar a granada mais longe e vês por onde vai cair. Todas as armas fazem clarão ao disparar, levar um tiro mostra de onde veio e a câmara estremece.</p><ul><li>Armas com metal que reflete a luz</li><li>Bots da arena sem saltos nem desaparecimentos</li></ul>' },
  ];
  const seenNews = () => { try { return localStorage.getItem('kg.news') || ''; } catch (e) { return ''; } };
  const newsDot = () => { const d = $('sNews').querySelector('.dot'); if (d) d.hidden = seenNews() === NEWS[0].id; const n = NEWS[0]; $('lbNewsT').textContent = n.t; $('lbNewsImg').src = n.img; };
  const newsOpen = (id) => { const N = NEWS.find(n => n.id === id) || NEWS[0], seen = seenNews();
    $('nwList').innerHTML = NEWS.map(n => `<button class="nw-it${n.id === N.id ? ' on' : ''}" data-n="${n.id}" role="tab" aria-selected="${n.id === N.id}"><b>${esc(n.t)}</b><span>${n.d} · versão ${n.id}</span></button>`).join('');
    $('nwD').innerHTML = `<h2>${esc(N.t)}</h2><time>${N.d} · versão ${N.id}</time><img src="${N.img}" alt="">${N.b}`;
    $('news').hidden = false; try { localStorage.setItem('kg.news', NEWS[0].id); } catch (e) { } newsDot(); };
  $('nwList').onclick = e => { const b = e.target.closest('[data-n]'); if (!b) return; audio.play('ui'); newsOpen(b.dataset.n); };
  $('sNews').onclick = () => { audio.play('ui'); newsOpen(); }; $('sNewsCard').onclick = () => { audio.play('ui'); newsOpen(); };
  $('nwX').onclick = () => { audio.play('ui'); $('news').hidden = true; };

  // aparência: cor da pele, cabelo, barba, roupa; pré-visualização ao vivo
  const LDEF = { skin: 0xd9a882, hair: 0x2a211b, top: 0x5c6846, legs: 0x3a3f33, hairS: 0, beardS: 1 }, LLBL = { skin: 'Pele', hair: 'Cabelo', hairS: 'Corte', beardS: 'Barba', top: 'Camisola', legs: 'Calças' };
  const showLook = () => {
    const a = Conta.ativo(); if (!a) return; const O = G.LOOK_OPTS; let L = { ...LDEF, ...(a.look || {}) };
    const hex = c => '#' + c.toString(16).padStart(6, '0');
    const sw = k => `<div class="lrow"><span>${LLBL[k]}</span><div class="sws">${O[k].map((c, i) => `<button class="sw" data-k="${k}" data-v="${c}" style="--c:${hex(c)}" aria-label="${LLBL[k]} ${i + 1}"></button>`).join('')}</div></div>`;
    const ch = k => `<div class="lrow"><span>${LLBL[k]}</span><div class="lchs">${O[k].map((t, i) => `<button class="lch" data-k="${k}" data-i="${i}">${t}</button>`).join('')}</div></div>`;
    $('pfT').textContent = 'Aparência'; pfm.classList.add('wide');
    pfB.innerHTML = `<div class="look"><div class="lcol"><div class="lpv"><img id="lkImg" alt="A tua personagem"></div><div class="lact"><button class="btn pri" id="lkOk">Guardar</button><button class="btn" id="lkRnd">Aleatório</button></div></div><div class="lowrap"><div class="lopts">${sw('skin')}${sw('hair')}${ch('hairS')}${ch('beardS')}${sw('top')}${sw('legs')}</div></div></div>`; pager(pfB.querySelector('.lopts'), '.lrow');
    const draw = () => { $('lkImg').src = G.portraitLook(L); pfB.querySelectorAll('[data-k]').forEach(b => { const k = b.dataset.k, on = b.dataset.v !== undefined ? +b.dataset.v === L[k] : +b.dataset.i === L[k]; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }); };
    pfB.onclick = e => { const b = e.target.closest('[data-k]'); if (!b) return; audio.play('ui'); L[b.dataset.k] = b.dataset.v !== undefined ? +b.dataset.v : +b.dataset.i; draw(); };
    $('lkRnd').onclick = e => { e.stopPropagation(); audio.play('ui'); const r = arr => arr[Math.floor(Math.random() * arr.length)]; L = { skin: r(O.skin), hair: r(O.hair), top: r(O.top), legs: r(O.legs), hairS: Math.floor(Math.random() * O.hairS.length), beardS: Math.floor(Math.random() * O.beardS.length) }; draw(); };
    $('lkOk').onclick = e => { e.stopPropagation(); Conta.setLook(L); G.setLook(L); G.lookNow = L; audio.play('apanhar'); pfClose(); pfRender(); mnote('Aparência guardada'); };
    pfm.hidden = false; draw();
  };
  // clã: criar, entrar com código, ver quem está, sair. Os do mesmo clã veem-se no mapa e não se magoam
  const showClan = () => {
    const N = G.net; $('pfT').textContent = 'Clã'; pfm.classList.remove('wide', 'kpw');
    const draw = () => {
      if (!N.on) { pfB.innerHTML = '<p>Sem ligação ao servidor. Os clãs voltam assim que o jogo voltar a ligar.</p>'; return; }
      const C = N.clanInfo;
      if (C) {
        const on = new Set([...N.R.values()].map(r => r.name)), me = (Conta.ativo() || {}).nome;
        pfB.innerHTML = `<div class="clan"><b class="cn">${esc(C.nome)}</b><div class="ccode"><span>Código para entrar</span><b>${esc(C.codigo)}</b></div><p>Dá este código a quem quiseres no clã. No mapa veem-se uns aos outros a azul, e os tiros entre vocês não magoam.</p><ul class="cmem">${C.membros.map(n => `<li><span>${esc(n)}</span><em>${n === me ? 'tu' : on.has(n) ? 'online' : ''}</em></li>`).join('')}</ul><button class="btn" id="clLeave">Sair do clã</button></div>`;
        $('clLeave').onclick = e => { e.stopPropagation(); audio.play('ui'); N.clanCmd('leave'); };
      } else {
        pfB.innerHTML = `<p>Cria um clã e dá o código aos teus amigos, ou entra num com o código que te derem. Não há limite de membros.</p>${field('clN', 'Nome do clã', 'text', '', 'off')}<button class="btn pri big" id="clMk">Criar clã</button><div class="cor">ou</div>${field('clC', 'Código', 'text', '', 'off')}<button class="btn big" id="clIn">Entrar no clã</button><div class="pmsg err" id="clM"></div>`;
        $('clN').maxLength = 20; $('clC').maxLength = 8; $('clC').style.textTransform = 'uppercase';
        $('clMk').onclick = e => { e.stopPropagation(); const v = $('clN').value.trim(); if (v.length < 3) { mnoteIn('O nome tem de ter pelo menos 3 letras'); return; } audio.play('ui'); N.clanCmd('create', v); };
        $('clIn').onclick = e => { e.stopPropagation(); const v = $('clC').value.trim(); if (v.length < 4) { mnoteIn('Escreve o código que te deram'); return; } audio.play('ui'); N.clanCmd('join', v); };
      }
    };
    const mnoteIn = t => { const el = $('clM'); if (el) el.textContent = t; };
    N.onClan = err => { if (pfm.hidden || $('pfT').textContent !== 'Clã') return false; if (err) mnoteIn(err); else draw(); return true; }; draw(); pfm.hidden = false;
  };
  $('mClan').onclick = e => { e.stopPropagation(); audio.play('ui'); showClan(); };
  const field = (id, label, type, val, ac) => `<div class="fld"><label for="${id}">${label}</label><input id="${id}" type="${type}" value="${esc(val || '')}" maxlength="${type === 'password' ? 72 : 16}" autocomplete="${ac}" autocapitalize="off" spellcheck="false"></div>`;
  function askName(fresh, then) {
    $('pfT').textContent = fresh ? 'Novo perfil' : 'Como te chamas?';
    pfB.innerHTML = `<p>${fresh ? 'Cada perfil tem a sua personagem e o seu mundo, guardados neste aparelho.' : 'O nome fica no teu perfil. Tudo o que fizeres fica guardado neste aparelho, e se criares conta também na nuvem.'}</p>` + field('pfN', 'Nome', 'text', '', 'nickname') + `<div class="pmsg" id="pfM">3 a 16 letras, números, - ou _</div><button class="btn pri big" id="pfOk">${then ? 'Começar' : 'Criar perfil'}</button>`;
    pfm.hidden = false; const inp = $('pfN'); setTimeout(() => inp.focus(), 60);
    const ok = () => { const n = inp.value.trim(); if (!Conta.NOME_OK.test(n)) { $('pfM').textContent = 'O nome tem de ter 3 a 16 letras, números, - ou _.'; $('pfM').className = 'pmsg err'; return; } const a = Conta.ativo(); if (!fresh && a && !a.nome) Conta.renomear(n); else Conta.criar(n); audio.play('ui'); pfClose(); pfRender(); if (then) then(); };
    $('pfOk').onclick = ok; inp.onkeydown = e => { if (e.key === 'Enter') ok(); };
  }
  function showList() {
    const P = Conta.perfis(); $('pfT').textContent = 'Perfis neste aparelho';
    pfB.innerHTML = `<div class="plist">${P.lista.filter(p => p.nome).map(p => { const s = (() => { try { return JSON.parse(localStorage.getItem('kg.save.' + p.id) || 'null'); } catch (e) { return null; } })(); return `<div class="pitem${p.id === P.ativo ? ' on' : ''}"><button class="pt" data-id="${p.id}"><b>${esc(p.nome)}</b><em>${p.conta ? 'Conta ligada · ' : ''}${s ? 'com personagem viva' : 'sem personagem'}</em></button>${p.id === P.ativo ? '' : `<button class="del" data-del="${p.id}">Apagar</button>`}</div>`; }).join('')}</div><button class="btn big" id="pfNew">Novo perfil</button>`;
    pfm.hidden = false;
    pfB.querySelectorAll('[data-id]').forEach(b => b.onclick = () => { Conta.escolher(b.dataset.id); audio.play('ui'); pfClose(); pfRender(); });
    pfB.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { if (!b.classList.contains('sure')) { b.classList.add('sure'); b.textContent = 'Toca outra vez'; return; } Conta.apagar(b.dataset.del); showList(); pfRender(); });
    $('pfNew').onclick = () => askName(true, null);
  }
  function showAccount(mode) {
    const c = Conta.conta(), a = Conta.ativo(); $('pfT').textContent = 'Conta';
    if (c) { pfB.innerHTML = `<p>Ligado como <b>${esc(c.nome)}</b>. O jogo deste perfil vai para a nuvem sozinho enquanto jogas, e podes entrar noutro aparelho com o mesmo nome e palavra-passe.</p><div class="pmsg" id="pfM"></div><button class="btn big" id="pfSync">Guardar agora</button><button class="btn big" id="pfOut">Sair da conta</button>`;
      pfm.hidden = false; $('pfSync').onclick = async () => { $('pfM').textContent = 'A guardar…'; $('pfM').className = 'pmsg'; G.save && G.save(); const r = await Conta.enviar(true); $('pfM').textContent = r ? 'Guardado na nuvem.' : Conta.MSG.rede; $('pfM').className = 'pmsg ' + (r ? 'ok' : 'err'); };
      $('pfOut').onclick = async () => { await Conta.sair(); audio.play('ui'); pfClose(); pfRender(); mnote('Saíste da conta. O perfil continua neste aparelho.'); }; return; }
    mode = mode || 'reg';
    pfB.innerHTML = `<div class="ptabs"><button data-m="reg" class="${mode === 'reg' ? 'on' : ''}">Criar conta</button><button data-m="ent" class="${mode === 'ent' ? 'on' : ''}">Entrar</button></div><p>${mode === 'reg' ? 'Opcional. Com conta, o teu perfil (personagem, loot e mundo) fica guardado na nuvem e continua noutro aparelho.' : 'Entra com o nome e a palavra-passe da tua conta. Trazemos o jogo mais recente.'}</p>` + field('pfN', 'Nome', 'text', mode === 'reg' && a ? a.nome : '', 'username') + field('pfP', 'Palavra-passe', 'password', '', mode === 'reg' ? 'new-password' : 'current-password') + `<div class="pmsg" id="pfM">${mode === 'reg' ? 'Pelo menos 6 caracteres. Não uses a palavra-passe de outros sítios.' : ''}</div><button class="btn pri big" id="pfOk">${mode === 'reg' ? 'Criar conta' : 'Entrar'}</button>`;
    pfm.hidden = false;
    pfB.querySelectorAll('[data-m]').forEach(b => b.onclick = () => showAccount(b.dataset.m));
    const msg = (t, k) => { $('pfM').textContent = t; $('pfM').className = 'pmsg ' + (k || ''); };
    const ok = async () => { const n = $('pfN').value.trim(), pw = $('pfP').value; if (!Conta.NOME_OK.test(n)) return msg(Conta.MSG.nome_invalido, 'err'); if (pw.length < 6) return msg(Conta.MSG.pass_invalida, 'err');
      $('pfOk').disabled = true; msg(mode === 'reg' ? 'A criar a conta…' : 'A entrar…');
      try { if (mode === 'reg') { if (a && !a.nome) Conta.renomear(n); else if (!a) Conta.criar(n); await Conta.registar(n, pw); G.save && G.save(); await Conta.enviar(true); pfClose(); pfRender(); mnote('Conta criada. O teu jogo fica guardado na nuvem.'); }
        else { await Conta.entrar(n, pw); const r = await Conta.sincronizar(); pfClose(); pfRender(); mnote(r === 'nuvem' ? 'Entraste. Trouxemos o teu jogo da nuvem.' : 'Entraste. Este perfil fica ligado à conta.'); } }
      catch (e) { msg(Conta.MSG[e.message] || Conta.MSG.rede, 'err'); } finally { const b = $('pfOk'); if (b) b.disabled = false; } };
    $('pfOk').onclick = ok; $('pfP').onkeydown = e => { if (e.key === 'Enter') ok(); };
  }
  pfRender();
  const hudEls = () => [...document.querySelectorAll('#hud [data-h]')];
  // posição e tamanho guardados à parte para a horizontal (L) e a vertical (P)
  const OR = () => portrait() ? 'P' : 'L';
  const posOf = k => { const h = cfg.hud[k] || (cfg.hud[k] = { on: 1 }); return h[OR()] || (h[OR()] = { dx: 0, dy: 0, s: 1 }); };
  const applyHud = () => {
    for (const el of hudEls()) { const k = el.dataset.h, h = cfg.hud[k] || { on: 1 }, q = h[OR()] || {}; el.style.translate = `${q.dx || 0}px ${q.dy || 0}px`; el.style.scale = String((q.s || 1) * (BTN.includes(k) ? cfg.btn : 1)); el.classList.toggle('hoff', !h.on); }
    $('hud').style.opacity = ''; $('hud').style.setProperty('--hop', cfg.op); $('hud').classList.toggle('hop', cfg.op < 0.995); // só os botões e o mapa ficam transparentes; vida, fome, sede, mira, marcas de acerto e o vermelho do dano ficam sempre a 100% $('fps').hidden = !cfg.fps; document.body.classList.toggle('mir', !!cfg.mirror);
  };
  const applyAll = () => { applyHud(); audio.vol(cfg.vol); if (G.applyGfx) G.applyGfx(cfg); saveCfg(); };
  // botões novos
  const hold = (el, on, off) => { el.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); on(); }); const end = e => { e.stopPropagation(); off && off(); }; el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); el.addEventListener('pointerleave', end); };
  // botão de disparo: 1.º toque levanta a arma; depois dispara; arrastar a partir dele mexe na mira
  { const el = $('tFire'); let pid = null, lx = 0, ly = 0;
    el.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); if (pid !== null) return; pid = e.pointerId; try { el.setPointerCapture(pid); } catch (er) { } lx = e.clientX; ly = e.clientY; G.fireDown(); });
    el.addEventListener('pointermove', e => { if (e.pointerId !== pid) return; const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY; if (gunHeld() || G.fpv.on) G.aimDrag(dx, dy); });
    const end = e => { if (e.pointerId !== pid) return; pid = null; G.fireUp(); }; el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); el.addEventListener('lostpointercapture', end); document.addEventListener('pointerup', end, true); document.addEventListener('pointercancel', end, true); }
  hold($('tView'), () => G.viewToggle()); hold($('tAds'), () => G.scopeToggle());
  // versão nova no site: aviso que tapa o jogo e um botão para recarregar (só na página do servidor)
  if (window.KG_ONLINE && window.KG_BUILD) { let shown = false; const chk = () => { if (shown || document.hidden) return; fetch('versao.txt?t=' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? r.text() : null).then(v => { v = v && v.trim(); if (!v || v === window.KG_BUILD || !/^[0-9a-f]{12}$/.test(v)) return; shown = true; $('upd').hidden = false; $('updB').focus(); }).catch(() => {}); };
    $('updB').onclick = () => { G.updating = true; $('updB').textContent = 'A atualizar…'; location.reload(); }; setInterval(chk, 60000); document.addEventListener('visibilitychange', chk); setTimeout(chk, 15000); }
  // sugestão: a sangrar, com pouca vida, fome ou sede, mostra o melhor que tens para isso (um toque usa)
  let sugIt = null, sugT = 0; const sugEl = $('tSug');
  hold(sugEl, () => { if (sugIt) { G.use(sugIt); sugT = 0; } });
  const suggest = () => { const p = G.p, I = G.inv; if (!p || !p.alive || p.use || G.car || (G.fp && (!G.fpv.on || G.aimS.scope)) || !G.playing) return null; const all = [...I.belt.filter(Boolean), ...I.bag.list.map(e => e.it)], U = it => ITEMS[it.k].use || {};
    const best = (f, sc) => { let b = null, bs = -1e9; for (const it of all) { const u = U(it); if (!f(u)) continue; const s = sc(u, it); if (s > bs) { bs = s; b = it; } } return b; };
    if (p.bleed) { const it = best(u => u.bleed, u => -(u.hp || 0)); if (it) return [it, 'Parar a hemorragia', 1]; }
    if (p.hp < 45) { const it = best(u => u.hp && !u.food, u => u.hp); if (it) return [it, 'Tratar-te', 1]; }
    if (p.water < 25) { const it = best(u => (u.water || 0) > 10, u => -Math.abs((u.water || 0) - (100 - p.water)) - Math.max(0, (u.food || 0) - (100 - p.food)) * 0.8); if (it) return [it, 'Beber', p.water < 10]; }
    if (p.food < 25) { const it = best(u => (u.food || 0) > 8, u => -Math.abs((u.food || 0) - (100 - p.food)) + Math.min(0, u.water || 0) - Math.max(0, (u.water || 0) - (100 - p.water)) * 0.8); if (it) return [it, 'Comer', p.food < 10]; }
    return null; };
  // conduzir: cada botão conta enquanto o dedo estiver em cima (dá para acelerar e virar ao mesmo tempo, um polegar de cada lado)
  G.dIn = { u: 0, d: 0, l: 0, r: 0 };
  // pairar (helicóptero no ar): fica parado à mesma altura
  G.hovSet = on => { const b = $('dHov'); if (b) { b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.querySelector('em').textContent = on ? 'A pairar' : 'Pairar'; } };
  G.hoverToggle = () => { const c = G.car; if (!c || G.carSeat || !(VT[c.k] || {}).fly || !(c.alt > 1)) return; c.hov = !c.hov; G.hovSet(c.hov); G.ui.toast(c.hov ? 'A pairar: o helicóptero fica parado no ar' : 'Já não está a pairar'); G.buzz && G.buzz(12); };
  $('dHov').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); G.hoverToggle(); });
  for (const [id, k] of [['dUp', 'u'], ['dDn', 'd'], ['dL', 'l'], ['dR', 'r']]) { const el = $(id); hold(el, () => { G.dIn[k] = 1; el.classList.add('dn'); G.buzz && G.buzz(8); }, () => { G.dIn[k] = 0; el.classList.remove('dn'); }); }
  hold($('tLower'), () => G.aimEnd());
  addEventListener('keydown', e => { if (e.code === 'Escape' && G.aimS && G.aimS.on) G.aimEnd(); });
  hold($('tBreath'), () => G.breath(true), () => G.breath(false));
  hold($('tJump'), () => G.jump()); hold($('tCrouch'), () => G.stanceToggle(1)); hold($('tProne'), () => G.stanceToggle(2));
  hold($('tSprint'), () => G.setAuto(!G.autoRun));
  hold($('tLight'), () => G.toggleLight());
  // painel
  const setEl = $('set'), body = $('setBody');
  const row = (title, sub, ctl) => { const r = document.createElement('div'); r.className = 'srow'; r.innerHTML = `<div class="lab"><b>${title}</b>${sub ? `<span>${sub}</span>` : ''}</div>`; r.appendChild(ctl); return r; };
  const tog = (get, set) => { const b = document.createElement('button'); b.className = 'tog' + (get() ? ' on' : ''); b.setAttribute('role', 'switch'); b.onclick = () => { set(!get()); b.classList.toggle('on', get()); audio.play('ui'); applyAll(); }; return b; };
  const range = (min, max, step, get, set) => { const w = document.createElement('div'); w.className = 'rng'; const o = document.createElement('output'), i = document.createElement('input'); i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = get(); const show = () => { o.textContent = Math.round(+i.value * 100) + '%'; }; show(); i.oninput = () => { set(+i.value); show(); applyAll(); }; w.append(o, i); return w; }; // valor à vista (em %)
  const renderSet = () => {
    body.innerHTML = ''; setTabsR();
    const TABOF = { 'Controlos': 'ctl', 'Ecrã': 'ecra', 'Ecrã inteiro': 'ecra', 'Gráficos': 'img', 'Som': 'img', 'Conta': 'conta', 'Sessão': 'conta' };
    const grp = (t, rows, cls = '') => { if ((TABOF[t] || 'mais') !== setTab) return; const g = document.createElement('div'); g.className = 'sgrp ' + cls; g.innerHTML = `<h3>${t}</h3>`; rows.forEach(r => g.appendChild(r)); body.appendChild(g); };
    const doors = row('Portas automáticas', 'Abrem quando vais contra elas e fecham-se atrás de ti. Desligado, abres e fechas com o botão.', tog(() => cfg.autoDoor, v => cfg.autoDoor = v));
    const iron = row('Mira de ferro', 'Na 1.ª pessoa, nas espingardas sem mira (M4, AK, SMG, caça, metralhadoras), o botão «Mira» aponta pela mira de ferro da arma.', tog(() => cfg.fpIron !== false, v => cfg.fpIron = v));
    const lean = row('Espreitar nas esquinas', 'Ao apontar encostado a uma parede, esquina ou poste, o boneco inclina-se para o lado livre para conseguires disparar.', tog(() => cfg.autoLean, v => cfg.autoLean = v));
    const quick = row('Disparo rápido', 'O botão de disparar dispara logo (assim que a arma sobe). Desligado, o primeiro toque só levanta a arma.', tog(() => cfg.quick, v => cfg.quick = v));
    const mirror = row('Comandos para canhotos', 'Troca os lados: andas com o polegar direito, apontas e disparas com o esquerdo.', tog(() => cfg.mirror, v => { cfg.mirror = v; applyHud(); }));
    const sens = row('Sensibilidade da mira', 'Quanto a mira anda ao arrastar o dedo ou o rato na mira 4x/8x.', range(0.5, 3, 0.05, () => cfg.sens, v => cfg.sens = v));
    // ecrã inteiro: esconde as barras do browser (o iPhone só deixa pela app no ecrã principal)
    { const D = document.documentElement, can = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled) && !!(D.requestFullscreen || D.webkitRequestFullscreen), on = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
      const b = document.createElement('button'); b.className = 'btn sm' + (on() ? '' : ' pri'); b.textContent = on() ? 'Sair' : 'Ecrã inteiro';
      b.onclick = () => { audio.play('ui'); try { const r = on() ? (document.exitFullscreen || document.webkitExitFullscreen).call(document) : (D.requestFullscreen ? D.requestFullscreen({ navigationUI: 'hide' }) : D.webkitRequestFullscreen()); if (r && r.catch) r.catch(() => toast('Este browser não deixou pôr em ecrã inteiro')); } catch (e) { toast('Este browser não deixou pôr em ecrã inteiro'); } };
      grp('Ecrã inteiro', [row('Sempre em ecrã inteiro', can ? 'O jogo esconde as barras do browser sozinho. Se saíres (gesto de voltar), volta ao próximo toque.' : 'Este browser não deixa. No iPhone: Partilhar e «Adicionar ao ecrã principal», e abre o jogo a partir daí.', document.createElement('span'))]); }
    if (G.TOUCH) {
      grp('Controlos', [mirror, quick, iron,
        row('Mira assistida', 'Perto de um zombie ou jogador à vista, a mira abranda um pouco e puxa ligeiramente para ele enquanto arrastas (nunca através de paredes). Na vista de cima, ao levantar a arma vai para o zombie mais perto.', tog(() => cfg.assist, v => cfg.assist = v)),
        sens, doors, lean,
        row('Correr ao empurrar o polegar até ao fim', 'O botão «Auto» corre sempre em frente sem tocar no polegar.', tog(() => cfg.sprintPush, v => { cfg.sprintPush = v; if (!v) cfg.hud.sprint.on = 1; })),
        row('Vibração', 'Vibra ao levar dano, disparar e acertar. Não funciona no iPhone (o Safari não deixa).', tog(() => cfg.haptics, v => { cfg.haptics = v; if (v) try { navigator.vibrate && navigator.vibrate(30); } catch (e) { } })),
      ]);
    } else grp('Controlos', [row('Rato e teclado', 'WASD mover · Shift correr · Espaço saltar e trepar · botão direito levantar a arma · clique disparar · E revistar e portas · Tab inventário · R recarregar · M mapa · F lanterna', document.createElement('span')), quick, iron, sens, doors, lean]);
    const vis = document.createElement('div'); vis.className = 'vis';
    for (const k in NAMES) { if (!G.TOUCH && ['reload', 'use', 'sprint', 'jump', 'crouch', 'prone', 'fire', 'light', 'scope', 'lower', 'breath'].includes(k)) continue; const b = document.createElement('button'); b.className = cfg.hud[k].on ? 'on' : ''; b.innerHTML = (cfg.hud[k].on ? EYE : EYEOFF) + NAMES[k]; b.onclick = () => { cfg.hud[k].on = cfg.hud[k].on ? 0 : 1; audio.play('ui'); applyAll(); renderSet(); }; vis.appendChild(b); }
    // telemóvel: alarme de raid e instalar como app
    if (G.pwa) { const P = G.pwa, pb = document.createElement('button'); pb.className = 'btn sm' + (P.pushOn() ? '' : ' pri'); pb.textContent = P.pushOn() ? 'Desligar' : 'Ligar';
      pb.onclick = async () => { audio.play('ui'); if (P.pushOn()) { await P.disablePush(); toast('Alarme de raid desligado'); renderSet(); return; } pb.disabled = true; const r = await P.enablePush().catch(() => 'nao'); pb.disabled = false;
        toast(r === 'ok' ? 'Alarme ligado: deve chegar já um aviso de teste' : r === 'ios' ? 'No iPhone, primeiro instala o jogo no ecrã principal (Partilhar → Adicionar ao ecrã principal) e abre-o por lá' : r === 'offline' ? 'Liga-te ao servidor primeiro (entra no jogo online)' : r === 'negado' ? 'Os avisos estão bloqueados nas definições do browser' : 'Este browser não deixa avisos'); renderSet(); };
      const ib = document.createElement(P.canInstall() ? 'button' : 'span'); if (P.canInstall()) { ib.className = 'btn sm pri'; ib.textContent = 'Instalar'; ib.onclick = async () => { audio.play('ui'); await P.install(); renderSet(); }; }
      grp('Telemóvel', [row('Alarme de raid', 'Aviso no telemóvel quando rebentam a tua base ou a do teu clã, mesmo com o jogo fechado.', pb),
        row('Instalar como app', P.installed() ? 'Já estás a jogar na app.' : P.canInstall() ? 'Fica com um ícone no ecrã, abre sem a barra do browser e o gesto de voltar atrás não sai do jogo.' : P.ios ? 'No Safari: Partilhar → Adicionar ao ecrã principal.' : 'No menu do browser: Instalar app (ou Adicionar ao ecrã principal).', ib)]); }
    if (G.playing) { const qb = document.createElement('button'); qb.className = 'btn sm'; qb.textContent = 'Sair'; qb.onclick = () => { closeSet(); G.askQuit(); }; grp('Jogo', [row('Sair para o menu', 'Fica tudo guardado onde estás. Em combate tens de ficar 5 s parado: mexer-te ou levar dano cancela.', qb)]); }
    const ed = document.createElement('button'); ed.className = 'btn pri sm'; ed.textContent = 'Editar'; ed.onclick = () => startEdit();
    const rs = document.createElement('button'); rs.className = 'btn sm'; rs.textContent = 'Repor'; rs.onclick = () => { cfg.hud = JSON.parse(JSON.stringify(DEF.hud)); cfg.btn = 1; cfg.op = 1; applyAll(); renderSet(); };
    const both = document.createElement('div'); both.style.display = 'flex'; both.style.gap = '6px'; both.append(ed, rs);
    grp('Ecrã', [
      row('Posição e tamanho de cada elemento', 'Arrasta cada botão ou painel e muda o tamanho. A horizontal e a vertical guardam-se à parte.', both),
      ...(G.TOUCH ? [row('Tamanho dos botões', '', range(0.7, 1.5, 0.05, () => cfg.btn, v => cfg.btn = v))] : []),
      row('Opacidade do ecrã', '', range(0.4, 1, 0.05, () => cfg.op, v => cfg.op = v)),
      vis,
    ]);
    if (G.net && G.net.on) { if (G.net.role) { const b = document.createElement('button'); b.className = 'btn sm pri'; b.textContent = 'Abrir'; b.onclick = () => { closeSet(); admOpen(); }; grp('Equipa do jogo', [row('Painel de ' + (G.net.role === 'admin' ? 'administrador' : 'moderador'), 'Jogadores, bans, clãs e as tuas ferramentas.', b)]); }
      else { const w = document.createElement('div'); w.className = 'aq'; w.style.margin = '0'; w.innerHTML = '<input id="admCode" type="password" placeholder="Código" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Código de administrador"><button class="btn sm" id="admGo">Entrar</button>'; w.querySelector('#admGo').onclick = () => { const v = w.querySelector('#admCode').value.trim(); if (!v) return; audio.play('ui'); G.net.admClaim(v); };
        grp('Equipa do jogo', [row('Código de administrador', 'Só para quem gere o servidor.', w)]); } }
    grp('Gráficos', [row('Sombras', 'Desligar ajuda telemóveis mais fracos.', tog(() => cfg.shadows, v => cfg.shadows = v)), row('Objetos com pormenor', 'Caixotes, máquinas, bancos, carros e móveis detalhados. Desligar alivia telemóveis fracos (vale ao voltar a entrar).', tog(() => cfg.props !== false, v => cfg.props = v)), row('Modo poupança', 'Menos resolução, mais fluidez e menos bateria.', tog(() => cfg.lowres, v => cfg.lowres = v)), row('Contorno no que dá para usar', 'Linha branca à volta de portas, sacos, carros e móveis que podes abrir.', tog(() => cfg.outline !== false, v => cfg.outline = v)), row('Mostrar FPS', '', tog(() => cfg.fps, v => cfg.fps = v))]);
    grp('Som', [row('Volume geral', '', range(0, 1, 0.05, () => cfg.vol, v => cfg.vol = v)), row('Música do menu', '', range(0, 1, 0.05, () => cfg.musMenu, v => { cfg.musMenu = v; if (v > 0 && cfg.music === false) { cfg.music = true; musBtn(); } })), row('Música em jogo', 'Baixa no dia a dia; sobe quando há perigo.', range(0, 1, 0.05, () => cfg.musGame, v => { cfg.musGame = v; if (v > 0 && cfg.music === false) { cfg.music = true; musBtn(); } })), row('Ver os sons à volta do ecrã', 'Setas na borda mostram de onde vêm grunhidos, passos e tiros.', tog(() => cfg.soundViz, v => cfg.soundViz = v))]);
    { const a = Conta.ativo(), c = Conta.conta(), bt = (t, f, pri) => { const b = document.createElement('button'); b.className = 'btn sm' + (pri ? ' pri' : ''); b.textContent = t; b.onclick = () => { audio.play('ui'); f(); }; return b; };
      grp('Conta', [row(a && a.nome ? a.nome : 'Sem perfil', c ? 'Conta ligada: o jogo vai para a nuvem sozinho enquanto jogas e continua noutro aparelho.' : 'Só neste aparelho. Com conta, a personagem e o mundo ficam na nuvem.', bt(c ? 'Conta' : 'Criar conta ou entrar', () => { closeSet(); showAccount(); }, !c)),
        row('Perfis neste aparelho', 'Cada perfil tem a sua personagem e o seu mundo.', bt('Ver', () => { closeSet(); showList(); }))]);
      if (!G.playing) grp('Sessão', [row('Terminar sessão', 'Volta ao ecrã de entrada. O perfil fica guardado neste aparelho.', bt('Terminar', async () => { if (Conta.conta()) await Conta.sair(); Conta.semPerfil(); closeSet(); showMenu(); }))]); }
    grp('Créditos', [row('Sons de animais', 'Freesound: newagesoup (rosnar), yottasounds (javali) e bonson.ca (galinha), licença CC BY 3.0; os outros em domínio público (CC0).', document.createElement('span'))]);
  };
  // ---------- painel da equipa (administrador e moderador): tudo é pedido ao servidor, que confirma o cargo
  const admEl = $('adm'), admB = $('admB'); let admTab = 'p', admData = null, admOpenUid = null, admQ = '', admBan = { h: 24, wipe: false, why: '' };
  const ago = t => { const s = (Date.now() - t) / 1000; return s < 3600 ? 'há ' + Math.max(1, Math.round(s / 60)) + ' min' : s < 86400 ? 'há ' + Math.round(s / 3600) + ' h' : 'há ' + Math.round(s / 86400) + ' dias'; };
  const admRole = (r, flags) => { $('bAdm').hidden = !r; if (!r && !admEl.hidden) admEl.hidden = true; if (flags && !setEl.hidden && r) { closeSet(); admOpen(); } if (!admEl.hidden) admRender(); };
  const admOpen = () => { if (!G.net.role) return; admEl.hidden = false; $('admR').textContent = G.net.role === 'admin' ? 'Admin' : 'Moderador'; $('admR').className = 'admr' + (G.net.role === 'mod' ? ' mod' : ''); $('admTabs').querySelector('[data-t=c]').hidden = G.net.role !== 'admin'; admRender(); G.net.adm('list'); };
  const admList = L => { admData = L; if (!admEl.hidden) admRender(); };
  const A = (a, o) => { audio.play('ui'); G.net.adm(a, o); };
  const admRender = () => {
    const r = G.net.role, isA = r === 'admin'; admEl.querySelectorAll('#admTabs button').forEach(b => b.classList.toggle('on', b.dataset.t === admTab));
    if (admTab === 'e') { const F = G.admF || {}; const t = (lbl, sub, key, a) => `<div class="srow"><div class="lab"><b>${lbl}</b><span>${sub}</span></div><button class="tog${F[key] ? ' on' : ''}" data-a="${a}" data-on="${F[key] ? 0 : 1}" role="switch"></button></div>`;
      admB.innerHTML = t('Ver sem ser visto', 'Ninguém te vê nem te acerta e os zombies ignoram-te.', 'spec', 'spec') + t('Invisível', 'Os outros jogadores deixam de te ver no mapa e no jogo.', 'inv', 'inv') + (isA ? t('Invencível', 'Não perdes vida com tiros, zombies, quedas nem fome.', 'god', 'god') : '')
        + `<div class="srow"><div class="lab"><b>Ir a um ponto do mapa</b><span>Liga e toca no mapa grande onde queres ir.</span></div><button class="tog${G.admTp ? ' on' : ''}" id="admTp" role="switch"></button></div>`
        + (isA ? `<div class="srow ae"><div class="lab"><b>Criar objeto</b><span>Vai para o teu inventário.</span></div><div class="aq" style="margin:0"><select id="admK">${Object.keys(ITEMS).sort((a, b) => ITEMS[a].n.localeCompare(ITEMS[b].n, 'pt')).map(k => `<option value="${k}">${esc(ITEMS[k].n)}</option>`).join('')}</select><input id="admN" type="number" min="1" max="999" value="1" style="width:80px"><button class="btn sm pri" id="admGive">Dar</button></div></div>
        <div class="srow ae"><div class="lab"><b>Criar veículo</b><span>Aparece à tua frente (o helicóptero precisa de espaço).</span></div><div class="aq" style="margin:0"><select id="admV">${Object.keys(VT).map(k => `<option value="${k}"${k === (G.admV || 'sedan') ? ' selected' : ''}>${esc(VT[k].n)}</option>`).join('')}</select><button class="btn sm pri" id="admCar">Criar</button></div></div>
        <div class="srow"><div class="lab"><b>Lançamento aéreo</b><span>Um avião cai daqui a 20 s, num sítio ao calhas.</span></div><button class="btn sm" id="admDrop">Lançar</button></div>` : '');
      admB.querySelectorAll('.tog[data-a]').forEach(b => b.onclick = () => A(b.dataset.a, { on: +b.dataset.on }));
      $('admTp').onclick = () => { G.admTp = !G.admTp; audio.play('ui'); admRender(); if (G.admTp) toast('Abre o mapa e toca onde queres ir'); };
      if (isA) { $('admGive').onclick = () => A('give', { k: $('admK').value, n: +$('admN').value || 1 }); $('admV').onchange = e => { G.admV = e.target.value; }; $('admCar').onclick = () => A('car', { k: $('admV').value }); $('admDrop').onclick = () => A('drop'); }
      return; }
    if (!admData) { admB.innerHTML = '<p class="empty">A carregar…</p>'; return; }
    if (admTab === 'b') { admB.innerHTML = admData.bans.length ? admData.bans.map(b => `<div class="ap"><button><span class="nm"><b>${esc(b.n || '?')}</b><span>${b.until ? 'até ' + new Date(b.until).toLocaleString('pt-PT', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'para sempre'} · por ${esc(b.by)}${b.why ? ' · ' + esc(b.why) : ''}</span></span></button><div class="aa"><button class="btn sm" data-ub="${b.uid}">Tirar ban</button></div></div>`).join('') : '<p class="empty">Ninguém está banido.</p>';
      admB.querySelectorAll('[data-ub]').forEach(b => b.onclick = () => A('unban', { uid: b.dataset.ub })); return; }
    if (admTab === 'c') { admB.innerHTML = admData.clans.length ? admData.clans.map(C => `<div class="ap"><button><span class="nm"><b>${esc(C.n)}</b><span>Código ${esc(C.cod)} · ${C.m.length} ${C.m.length === 1 ? 'membro' : 'membros'}</span></span></button><div class="aa">${C.m.map(n => `<button class="btn sm" data-ck="${C.id}" data-n="${esc(n)}">Tirar ${esc(n)}</button>`).join('')}<button class="btn sm red" data-cd="${C.id}">Apagar clã</button></div></div>`).join('') : '<p class="empty">Não há clãs.</p>';
      admB.querySelectorAll('[data-ck]').forEach(b => b.onclick = () => A('clanKick', { id: b.dataset.ck, n: b.dataset.n })); admB.querySelectorAll('[data-cd]').forEach(b => b.onclick = () => { if (b.dataset.sure) A('clanDel', { id: b.dataset.cd }); else { b.dataset.sure = 1; b.textContent = 'Confirmar: apagar'; } }); return; }
    // jogadores: ligados primeiro, depois os outros pela ordem em que saíram
    const q = admQ.toLowerCase(), all = [...admData.online, ...admData.off].filter(P => !q || P.n.toLowerCase().includes(q));
    admB.innerHTML = `<div class="aq"><input id="admQ" placeholder="Procurar jogador" value="${esc(admQ)}" autocomplete="off" spellcheck="false"><button class="btn sm" id="admRf">Atualizar</button></div>` + (all.length ? all.map(P => { const me = P.uid === G.net.uid, open = admOpenUid === P.uid;
      const sub = P.on ? (P.al ? 'Ligado · ' + P.hp + ' de vida' : 'Ligado · morto') + (P.cl ? ' · ' + esc(P.cl) : '') : ago(P.t) + (P.sl ? ' · a dormir em ' + P.sl.join(', ') : '') + (P.cl ? ' · ' + esc(P.cl) : '');
      const tags = [P.r ? `<i class="${P.r === 'admin' ? 'red' : 'blue'}">${P.r === 'admin' ? 'Admin' : 'Mod'}</i>` : '', P.f ? '<i class="blue">Congelado</i>' : '', P.i ? '<i>Invisível</i>' : '', P.b ? '<i>Base</i>' : '', P.ban != null ? '<i class="red">Banido</i>' : ''].join('');
      let acts = '';
      if (open && !me) { const B = (lbl, a, o = {}, cls = '') => `<button class="btn sm ${cls}" data-a="${a}" data-o='${JSON.stringify(o)}'>${lbl}</button>`;
        acts = '<div class="aa">' + (P.on || P.sl ? B('Ir ter com ele', 'goto', { uid: P.uid, w: 'p' }) : '') + (P.b ? B('Ir à base', 'goto', { uid: P.uid, w: 'b' }) : '') + (isA && P.on ? B('Trazer até mim', 'bring', { uid: P.uid }) : '') + (P.on ? B(P.f ? 'Descongelar' : 'Congelar', 'freeze', { uid: P.uid, on: P.f ? 0 : 1 }) : '')
          + (isA && P.on && P.al ? B('Matar', 'kill', { uid: P.uid }) : '') + (P.on && P.r !== 'admin' ? B('Expulsar', 'kick', { uid: P.uid }) : '') + (isA && P.b ? B('Apagar base', 'delbase', { uid: P.uid }, 'red') : '')
          + (isA ? (P.r !== 'admin' ? B('Tornar admin', 'role', { uid: P.uid, r: 'admin' }) : '') + (P.r !== 'mod' ? B('Tornar moderador', 'role', { uid: P.uid, r: 'mod' }) : '') + (P.r ? B('Tirar cargo', 'role', { uid: P.uid, r: null }) : '') : '')
          + (P.ban != null ? B('Tirar ban', 'unban', { uid: P.uid }) : P.r !== 'admin' ? `<div class="bf"><div class="seg">${[[1, '1 hora'], [24, '1 dia'], [168, '7 dias'], [0, 'Sempre']].map(([h, l]) => `<button class="${admBan.h === h ? 'on' : ''}" data-bh="${h}">${l}</button>`).join('')}</div>${isA ? `<label><input type="checkbox" id="admWipe"${admBan.wipe ? ' checked' : ''}>Apagar a base e o que tem</label>` : ''}<input id="admWhy" class="aqi" placeholder="Motivo (opcional)" value="${esc(admBan.why)}" maxlength="120" style="height:44px;padding:0 12px;background:#24221f;border:1px solid rgba(255,250,240,.1);color:var(--tx);border-radius:2px;font:500 15px 'Roboto Condensed',sans-serif"><button class="btn red" data-ban="${P.uid}">Banir ${esc(P.n)}</button></div>` : '') + '</div>'; }
      return `<div class="ap${P.on ? ' on' : ''}"><button data-p="${P.uid}"><span class="dot"></span><span class="nm"><b>${esc(P.n)}${me ? ' (tu)' : ''}</b><span>${sub}</span></span><span class="tags">${tags}</span></button>${acts}</div>`; }).join('') : '<p class="empty">Ninguém com esse nome.</p>');
    const qi = $('admQ'); qi.oninput = () => { admQ = qi.value; const pos = qi.selectionStart; admRender(); const n = $('admQ'); n.focus(); n.setSelectionRange(pos, pos); };
    $('admRf').onclick = () => A('list');
    admB.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { admOpenUid = admOpenUid === b.dataset.p ? null : b.dataset.p; audio.play('ui'); admRender(); });
    admB.querySelectorAll('[data-a]').forEach(b => b.onclick = e => { e.stopPropagation(); const o = JSON.parse(b.dataset.o); if (['kill', 'delbase'].includes(b.dataset.a) && !b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Confirmar'; return; } A(b.dataset.a, o); if (b.dataset.a === 'goto') admEl.hidden = true; });
    admB.querySelectorAll('[data-bh]').forEach(b => b.onclick = e => { e.stopPropagation(); admBan.h = +b.dataset.bh; admRender(); });
    if ($('admWipe')) $('admWipe').onchange = e => { admBan.wipe = e.target.checked; };
    if ($('admWhy')) $('admWhy').oninput = e => { admBan.why = e.target.value; };
    admB.querySelectorAll('[data-ban]').forEach(b => b.onclick = e => { e.stopPropagation(); if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Confirmar ban (' + (admBan.h ? admBan.h >= 24 ? admBan.h / 24 + ' dia' + (admBan.h > 24 ? 's' : '') : '1 hora' : 'para sempre') + ')'; return; } A('ban', { uid: b.dataset.ban, h: admBan.h, wipe: admBan.wipe ? 1 : 0, why: admBan.why }); admOpenUid = null; admBan.why = ''; });
  };
  admEl.querySelectorAll('#admTabs button').forEach(b => b.onclick = () => { admTab = b.dataset.t; audio.play('ui'); admRender(); });
  $('admX').onclick = () => { admEl.hidden = true; audio.play('ui'); };
  $('bAdm').onclick = e => { e.stopPropagation(); audio.play('ui'); admOpen(); };
  // ---------- classificações
  // ---------- comerciantes: comprar e vender por ienes (online, o servidor confirma contra o que tens)
  const trEl = $('trw'), trB = $('trB'); let trT = null, trTab = 'b';
  const yen = n => '¥ ' + Math.round(n).toLocaleString('pt-PT');
  const trRender = () => { if (!trT) return; const T = trT, money = G.inv.count('iene'); $('trT').textContent = T.n + ' · ' + T.where; $('trM').textContent = yen(money);
    trEl.querySelectorAll('#trTabs button').forEach(b => b.classList.toggle('on', b.dataset.t === trTab));
    const rows = [];
    if (trTab === 'b') { for (const k of T.sells) { const d = ITEMS[k], n = d.cat === 'a' ? 20 : 1, cost = G.TR.PRICE[k] * n, can = money >= cost; rows.push(`<div class="trr${can ? '' : ' no'}"><img src="${G.ICONS[k]}" alt=""><div class="n"><b>${d.n}${n > 1 ? ' × ' + n : ''}</b><span>${d.desc.split('.')[0]}</span></div><span class="p">${yen(cost)}</span><button class="btn sm${can ? ' pri' : ''}" data-b="${k}" data-n="${n}" ${can ? '' : 'disabled'}>Comprar</button></div>`); } }
    else { const seen = new Map(); for (const it of [...G.inv.bag.list.map(e => e.it), ...G.inv.belt.filter(Boolean)]) { const p = G.TR.SELL(it.k); if (!p || it.k === 'iene') continue; seen.set(it.k, (seen.get(it.k) || 0) + Math.max(1, it.n || 1)); }
      if (!seen.size) rows.push('<p class="empty">Não tens nada que este comerciante compre. O equipamento vestido não aparece aqui: tira-o primeiro para a mochila.</p>');
      for (const [k, have] of seen) { const d = ITEMS[k], n = Math.min(have, d.cat === 'a' ? 20 : d.cat === 'r' ? Math.min(have, 50) : 1), got = G.TR.SELL(k) * n; rows.push(`<div class="trr"><img src="${G.ICONS[k]}" alt=""><div class="n"><b>${d.n}${n > 1 ? ' × ' + n : ''}</b><span>Tens ${have}</span></div><span class="p">+ ${yen(got)}</span><button class="btn sm" data-s="${k}" data-n="${n}">Vender</button></div>`); } }
    trB.innerHTML = rows.join('');
    trB.querySelectorAll('button[data-b]').forEach(b => b.onclick = () => { G.trade(T, b.dataset.b, +b.dataset.n, false); trRender(); });
    trB.querySelectorAll('button[data-s]').forEach(b => b.onclick = () => { G.trade(T, b.dataset.s, +b.dataset.n, true); trRender(); }); };
  const trOpen = T => { trT = T; trTab = 'b'; trEl.hidden = false; audio.play('ui'); trRender(); };
  trEl.querySelectorAll('#trTabs button').forEach(b => b.onclick = () => { trTab = b.dataset.t; audio.play('ui'); trRender(); });
  $('trX').onclick = () => { trEl.hidden = true; trT = null; audio.play('ui'); };
  const lbEl = $('lbw'), lbB = $('lbB'); let lbTab = 'pvp', lbData = null;
  const lbOpen = () => { if (!G.net || !G.net.on) { toast('As classificações só existem online'); return; } lbEl.hidden = false; lbRender(); G.net.lb(); };
  const lbShow = m => { lbData = m; if (!lbEl.hidden) lbRender(); };
  const lbRender = () => { lbEl.querySelectorAll('#lbTabs button').forEach(b => b.classList.toggle('on', b.dataset.t === lbTab)); if (!lbData) { lbB.innerHTML = '<p class="empty">A carregar…</p>'; return; }
    const me = (lbData.name || '').toLowerCase(), kd = (k, d) => (k / Math.max(1, d)).toFixed(2).replace('.', ',');
    const rows = lbTab === 'pvp' ? lbData.pvp.map(([n, k, d]) => [n, k, d, kd(k, d)]) : lbTab === 'z' ? lbData.z.map(([n, z]) => [n, z]) : lbData.clans.map(([n, k, d, m]) => [n, kd(k, d), k, m]);
    const head = lbTab === 'pvp' ? ['Abates', 'Mortes', 'K/D'] : lbTab === 'z' ? ['Zombies'] : ['K/D', 'Abates', 'Membros'];
    const cols = '32px 1fr' + ' auto'.repeat(head.length);
    lbB.innerHTML = rows.length ? `<div class="lbt" style="grid-template-columns:${cols}"><div class="h"><span>#</span><span>${lbTab === 'clans' ? 'Clã' : 'Jogador'}</span>${head.map(h => `<span style="text-align:right">${h}</span>`).join('')}</div>${rows.map((r, i) => `<div class="${i < 3 ? 'top ' : ''}${lbTab !== 'clans' && r[0].toLowerCase() === me ? 'me' : ''}"><span class="pos">${i + 1}</span><span class="n">${esc(r[0])}</span>${r.slice(1).map(v => `<span class="v">${v}</span>`).join('')}</div>`).join('')}</div>` : '<p class="empty">Ainda não há ninguém aqui.</p>';
    const [k, d, z] = lbData.me; lbB.insertAdjacentHTML('beforeend', `<div class="lbme">Tu: <b>${k}</b> abates · <b>${d}</b> mortes em PvP · K/D <b>${kd(k, d)}</b> · <b>${z}</b> zombies</div>`); };
  lbEl.querySelectorAll('#lbTabs button').forEach(b => b.onclick = () => { lbTab = b.dataset.t; audio.play('ui'); lbRender(); });
  $('lbX').onclick = () => { lbEl.hidden = true; audio.play('ui'); };
  $('mLb').onclick = e => { e.stopPropagation(); audio.play('ui'); lbOpen(); };
  const EYE = `{{eye}}`, EYEOFF = `{{eye-off}}`;
  for (const ev of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(ev, () => { if (!setEl.hidden) renderSet(); });
  let setTab = 'ctl';
  const setTabsEl = $('setTabs');
  { const cb = document.createElement('button'); cb.dataset.t = 'conta'; cb.textContent = 'Conta'; setTabsEl.appendChild(cb); }
  // deitado e largo: as categorias passam para uma coluna à esquerda, com ícone (como nos jogos de telemóvel)
  const sside = document.createElement('nav'); sside.className = 'sside'; sside.setAttribute('aria-label', 'Categorias');
  sside.innerHTML = [['ctl', 'Controlos', `{{gamepad-2}}`], ['ecra', 'Ecrã', `{{layout-dashboard}}`], ['img', 'Imagem e som', `{{monitor}}`], ['mais', 'Mais', `{{settings-2}}`], ['conta', 'Conta', `{{user-round}}`]].map(([t, n, ic]) => `<button data-t="${t}">${ic}<span>${n}</span></button>`).join('');
  setEl.querySelector('.sp2').insertBefore(sside, body);
  const setTabsR = () => { for (const b of [...setTabsEl.children, ...sside.children]) b.classList.toggle('on', b.dataset.t === setTab); };
  sside.onclick = e => { const b = e.target.closest('button'); if (!b || b.dataset.t === setTab) return; setTab = b.dataset.t; audio.play('ui'); renderSet(); body._pg && body._pg.first(); };
  setTabsEl.onclick = e => { const b = e.target.closest('button'); if (!b || b.dataset.t === setTab) return; setTab = b.dataset.t; audio.play('ui'); renderSet(); body._pg && body._pg.first(); };
  const openSet = () => { G.paused = G.playing; renderSet(); setEl.hidden = false; audio.play('ui'); body._pg && body._pg.first(); };
  const closeSet = () => { setEl.hidden = true; G.paused = false; saveCfg(); };
  $('zUp').onclick = () => G.zeroAdj(1); $('zDn').onclick = () => G.zeroAdj(-1);
  $('qX').onclick = () => { G.quit = null; $('quit').hidden = true; audio.play('ui'); };
  $('bSet').onclick = openSet; $('sSet').onclick = openSet; $('setClose').onclick = closeSet;
  // editor do ecrã: arrastar, mudar tamanho, esconder
  let edSel = null, edDrag = null;
  const hudBox = $('hud');
  const startEdit = () => { setEl.hidden = true; G.editing = true; G.paused = true; hudBox.hidden = false; hudBox.classList.add('edit'); for (const el of hudEls()) { el.dataset.wasHidden = el.hidden ? 1 : ''; el.hidden = false; } $('hedit').hidden = false; edSel = null; $('heName').textContent = 'Toca num elemento'; };
  const endEdit = () => { G.editing = false; hudBox.classList.remove('edit'); $('hedit').hidden = true; hudEls().forEach(e => { e.classList.remove('hsel'); e.hidden = !!e.dataset.wasHidden; }); for (const k in vals) delete vals[k]; saveCfg(); if (!G.playing) hudBox.hidden = true; openSet(); };
  const selectEl = el => { hudEls().forEach(e => e.classList.toggle('hsel', e === el)); edSel = el; const k = el.dataset.h; $('heName').textContent = NAMES[k]; $('heVis').textContent = cfg.hud[k].on ? 'Esconder' : 'Mostrar'; };
  hudBox.addEventListener('pointerdown', e => { if (!G.editing) return; const el = e.target.closest('[data-h]'); if (!el) return; e.preventDefault(); e.stopPropagation(); selectEl(el); const h = posOf(el.dataset.h); edDrag = { el, h, x: e.clientX, y: e.clientY, dx: h.dx || 0, dy: h.dy || 0 }; try { hudBox.setPointerCapture(e.pointerId); } catch (er) { } }, true);
  hudBox.addEventListener('pointermove', e => { if (!edDrag) return; edDrag.h.dx = Math.round(edDrag.dx + (cfg.mirror && edDrag.el.closest('#touch') ? -1 : 1) * (e.clientX - edDrag.x)); edDrag.h.dy = Math.round(edDrag.dy + e.clientY - edDrag.y); applyHud(); });
  hudBox.addEventListener('pointerup', () => { edDrag = null; });
  const sz = f => { if (!edSel) return; const h = posOf(edSel.dataset.h); h.s = clamp((h.s || 1) * f, 0.5, 2.2); applyHud(); };
  $('hePlus').onclick = () => sz(1.12); $('heMinus').onclick = () => sz(1 / 1.12);
  $('heVis').onclick = () => { if (!edSel) return; const h = cfg.hud[edSel.dataset.h]; h.on = h.on ? 0 : 1; applyHud(); selectEl(edSel); };
  $('heReset').onclick = () => { for (const k in cfg.hud) delete cfg.hud[k][OR()]; applyHud(); edSel = null; hudEls().forEach(e => e.classList.remove('hsel')); };
  $('heDone').onclick = endEdit;
  applyAll();

  // ---------- sons à volta do ecrã
  const sind = $('sind'), SI = [], _v = new THREE.Vector3(); const ICO = { z: `{{skull}}`, p: `{{footprints}}`, t: `{{crosshair}}` };
  for (let i = 0; i < 8; i++) { const d = document.createElement('div'); d.className = 'si'; d.style.opacity = 0; d.innerHTML = '<i></i><b></b><span></span>'; sind.appendChild(d); SI.push({ el: d, t: 0, key: '' }); }
  const sound = (x, z, kind, dist) => {
    if (!cfg.soundViz || !G.playing || G.editing || dist < 2.5) return;
    const key = kind + Math.round(x / 3) + ',' + Math.round(z / 3); let slot = SI.find(o => o.key === key && o.t > 0) || SI.reduce((a, o) => o.t < a.t ? o : a, SI[0]);
    const V = G.view || { cx: innerWidth / 2, cy: innerHeight / 2, rx: 150, ry: 150 }; let ang;
    if (V.fp) { const b = Math.atan2(x - G.p.x, z - G.p.z); ang = -Math.PI / 2 - (b - V.yaw); }
    else { _v.set(x, G.p.y + 1, z).project(G.cam); ang = Math.atan2((1 - _v.y) / 2 * innerHeight - V.cy, (_v.x + 1) / 2 * innerWidth - V.cx); }
    const px = clamp(V.cx + Math.cos(ang) * (V.rx + 26), 24, innerWidth - 24), py = clamp(V.cy + Math.sin(ang) * (V.ry + 26), 24, innerHeight - 24);
    if (slot.kind !== kind) { slot.el.className = 'si ' + kind; slot.el.querySelector('span').innerHTML = ICO[kind]; slot.kind = kind; }
    slot.el.style.transform = `translate(${px}px,${py}px)`; slot.el.querySelector('b').style.transform = `rotate(${ang + Math.PI / 2}rad) translateY(-26px)`;
    slot.key = key; slot.t = 1.3; slot.a = Math.max(0.35, 1 - dist / 30);
  };
  // ---------- mapa: o centro com detalhe (2 px/m) e o mundo todo de 8 km mais leve (0,25 px/m)
  const off = document.createElement('canvas'), K = 2; off.width = off.height = CORE * 2 * K;
  const offW = document.createElement('canvas'), KW = 2048 / (MAP * 2); offW.width = offW.height = 2048;
  // água (lagos e rios) num mapa qualquer: T e Tz passam de metros para píxeis, S = píxeis por metro
  const drawWater = (c, T, Tz, S, x0, z0, x1, z1) => { const Wt = G.W.water; if (!Wt) return; c.fillStyle = c.strokeStyle = '#2f5866'; c.lineCap = c.lineJoin = 'round';
    for (const L of Wt.lakes) { if (L.x + L.rx * 1.3 < x0 || L.x - L.rx * 1.3 > x1 || L.z + L.rz * 1.3 < z0 || L.z - L.rz * 1.3 > z1) continue; c.beginPath(); for (let k = 0; k <= 48; k++) { const a = k / 48 * 6.2832, r = L.rf(a), X = T(L.x + Math.cos(a) * r * L.rx), Z = Tz(L.z + Math.sin(a) * r * L.rz); if (k) c.lineTo(X, Z); else c.moveTo(X, Z); } c.fill(); }
    for (const R of Wt.rivers) { const P = R.P, w = P.reduce((s, q) => s + q[2], 0) / P.length; c.lineWidth = Math.max(1.4, 2 * w * S); c.beginPath(); P.forEach((q, i) => { const X = T(q[0]), Z = Tz(q[1]); if (i) c.lineTo(X, Z); else c.moveTo(X, Z); }); c.stroke(); } };
  const drawOff = () => {
    const x = off.getContext('2d'); const T = v => (v + CORE) * K;
    x.fillStyle = '#3f5531'; x.fillRect(0, 0, off.width, off.height);
    for (const s of G.W.map) { if (s.x1 < -CORE || s.x0 > CORE || s.z1 < -CORE || s.z0 > CORE) continue; x.fillStyle = s.c; x.fillRect(T(s.x0), T(s.z0), (s.x1 - s.x0) * K, (s.z1 - s.z0) * K); }
    x.fillStyle = 'rgba(30,48,26,.95)'; for (const t of G.W.trees) { x.beginPath(); x.arc(T(t.x), T(t.z), 2.1 * K * t.s, 0, 7); x.fill(); }
    for (const r of G.W.rocks) { x.fillStyle = r.kind === 'sulfur' ? '#d8bc3a' : r.kind === 'metal' ? '#a0603a' : '#9a988f'; x.beginPath(); x.arc(T(r.x), T(r.z), 1.4 * K, 0, 7); x.fill(); }
    for (const o of G.W.openings) if (o.k === 'd' && Math.abs(o.x) < CORE && Math.abs(o.z) < CORE) { x.fillStyle = '#D8CBA8'; x.fillRect(T(o.x) - 1.5, T(o.z) - 1.5, 3, 3); }
    for (const c of G.W.cuts) if (c.enter && Math.abs(c.x0) < CORE && Math.abs(c.z0) < CORE) { x.strokeStyle = 'rgba(216,203,168,.9)'; x.lineWidth = K * 0.5; x.strokeRect(T(c.x0), T(c.z0), (c.x1 - c.x0) * K, (c.z1 - c.z0) * K); }
    // mundo todo: manchas de floresta, estradas, vilas e o centro em miniatura
    const w = offW.getContext('2d'), TW = v => (v + MAP) * KW, cs = 32;
    { // terreno: prado claro → floresta escura, em degradê suave (512 amostras de lado, ampliadas com suavização) e um grão por cima
      const N = 512, cl = MAP * 2 / N, sm = document.createElement('canvas'); sm.width = sm.height = N; const sx = sm.getContext('2d'), im = sx.createImageData(N, N), D = im.data;
      const ss = (a, b, t) => { t = Math.max(0, Math.min(1, (t - a) / (b - a))); return t * t * (3 - 2 * t); };
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const x = -MAP + (i + 0.5) * cl, z = -MAP + (j + 0.5) * cl, f = ss(0.08, 0.62, forestDens(x, z)), dry = ss(0.2, 0.8, forestDens(x * 0.37 + 1713, z * 0.37 - 911)), o = (j * N + i) * 4;
        const mr = 104 + dry * 22, mg = 124 + dry * 8, mb = 74 - dry * 8; // prado: verde-amarelado, mais seco aqui e ali
        D[o] = mr + (34 - mr) * f; D[o + 1] = mg + (58 - mg) * f; D[o + 2] = mb + (38 - mb) * f; D[o + 3] = 255; }
      sx.putImageData(im, 0, 0); w.imageSmoothingEnabled = true; w.imageSmoothingQuality = 'high'; w.drawImage(sm, 0, 0, 2048, 2048);
      const gt = document.createElement('canvas'); gt.width = gt.height = 128; const gc = gt.getContext('2d'); for (let k = 0; k < 900; k++) { gc.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,.09)' : 'rgba(255,255,240,.05)'; gc.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 1.5, 1 + Math.random() * 1.5); }
      w.fillStyle = w.createPattern(gt, 'repeat'); w.fillRect(0, 0, 2048, 2048); }
    drawWater(w, TW, TW, KW, -MAP, -MAP, MAP, MAP);
    for (const s of G.W.map) { if (s.x1 - s.x0 > 1500 && s.z1 - s.z0 > 1500) continue; w.fillStyle = s.c; w.fillRect(TW(s.x0), TW(s.z0), Math.max(1, (s.x1 - s.x0) * KW), Math.max(1, (s.z1 - s.z0) * KW)); }
    for (const pass of [0, 1]) for (const r of G.W.roads) { const wx = (r.x1 - r.x0) * KW, wz = (r.z1 - r.z0) * KW, horiz = wx > wz, e = pass ? 0 : 0.8; w.fillStyle = pass ? (r.dirt ? '#b49a72' : '#d9d2c3') : 'rgba(20,18,14,.55)'; w.fillRect(TW(r.x0) - (horiz ? e : 1 + e), TW(r.z0) - (horiz ? 1 + e : e), Math.max(wx, 2) + e * 2, Math.max(wz, 2) + e * 2); }
    w.drawImage(off, TW(-CORE), TW(-CORE), CORE * 2 * KW, CORE * 2 * KW);
  };
  const mmc = $('mmc'), mctx = mmc.getContext('2d');
  // arena: mapa próprio, nítido (4 px por metro), só com a arena
  const AX = 3650, AZ = 3650, AS = 112, AK = 4; let offA = null;
  const arenaRaster = () => { if (offA) return offA; offA = document.createElement('canvas'); offA.width = offA.height = AS * AK; const x = offA.getContext('2d'), x0 = AX - AS / 2, z0 = AZ - AS / 2, T = v => (v - x0) * AK, Tz = v => (v - z0) * AK, L = (a, b, c, d) => c > x0 && a < x0 + AS && d > z0 && b < z0 + AS;
    x.fillStyle = '#5c6150'; x.fillRect(0, 0, offA.width, offA.height);
    for (const q of G.W.map) if (L(q.x0, q.z0, q.x1, q.z1) && q.x1 - q.x0 < 400) { x.fillStyle = q.c; x.fillRect(T(q.x0), Tz(q.z0), (q.x1 - q.x0) * AK, (q.z1 - q.z0) * AK); }
    x.fillStyle = '#9a7a52'; for (const q of G.W.steps) if (L(q.x0, q.z0, q.x1, q.z1) && q.y > 1) x.fillRect(T(q.x0), Tz(q.z0), (q.x1 - q.x0) * AK, (q.z1 - q.z0) * AK); // plataformas
    for (const q of G.W.rects) if (q.k === 's' && !(q.lv > 0) && !q.car && L(q.x0, q.z0, q.x1, q.z1)) { x.fillStyle = q.h >= 2.2 ? '#2a2824' : '#55514a'; x.fillRect(T(q.x0), Tz(q.z0), Math.max(1.5, (q.x1 - q.x0) * AK), Math.max(1.5, (q.z1 - q.z0) * AK)); } // paredes escuras, coberturas baixas mais claras
    x.fillStyle = '#e8a6b8'; for (const c of G.W.circles) if (L(c.x, c.z, c.x, c.z) && c.r >= 0.2 && c.r <= 0.45) { x.beginPath(); x.arc(T(c.x), Tz(c.z), Math.max(2, c.r * AK * 1.4), 0, 7); x.fill(); }
    return offA; };
  const drawMini = () => {
    const sz = mmc.clientWidth * Math.min(2, devicePixelRatio || 1); if (mmc.width !== sz) { mmc.width = mmc.height = sz; }
    const c = mctx, p = G.p, span = 70, s = sz / span / K, inC = Math.max(Math.abs(p.x), Math.abs(p.z)) < CORE - 36;
    c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#2a2c28'; c.fillRect(0, 0, sz, sz);
    c.save(); c.translate(sz / 2, sz / 2); c.rotate(G.YAW); c.scale(s, s);
    if (G.ARENA && Math.abs(p.x - AX) < 70 && Math.abs(p.z - AZ) < 70) { c.imageSmoothingEnabled = true; c.drawImage(arenaRaster(), (AX - AS / 2 - p.x) * K, (AZ - AS / 2 - p.z) * K, AS * K, AS * K); }
    else if (inC) c.drawImage(off, -(p.x + CORE) * K, -(p.z + CORE) * K);
    else { // fora do centro: o mapa leve ampliado e, por cima, o que está à volta (estradas, casas, árvores e rochas carregadas)
      c.imageSmoothingEnabled = true; c.drawImage(offW, -(p.x + MAP) * K, -(p.z + MAP) * K, offW.width * K / KW, offW.height * K / KW);
      const R = 60, L = (x0, z0, x1, z1) => x1 > p.x - R && x0 < p.x + R && z1 > p.z - R && z0 < p.z + R;
      drawWater(c, v => (v - p.x) * K, v => (v - p.z) * K, K, p.x - R, p.z - R, p.x + R, p.z + R);
      for (const r of G.W.roads) if (L(r.x0, r.z0, r.x1, r.z1)) { c.fillStyle = r.x1 - r.x0 > 8 && r.z1 - r.z0 > 8 ? '#6b5b44' : '#55534e'; c.fillRect((r.x0 - p.x) * K, (r.z0 - p.z) * K, (r.x1 - r.x0) * K, (r.z1 - r.z0) * K); }
      for (const q of G.W.cuts) if (q.enter && L(q.x0, q.z0, q.x1, q.z1)) { c.fillStyle = '#8a7f72'; c.fillRect((q.x0 - p.x) * K, (q.z0 - p.z) * K, (q.x1 - q.x0) * K, (q.z1 - q.z0) * K); c.strokeStyle = 'rgba(216,203,168,.9)'; c.lineWidth = K * 0.5; c.strokeRect((q.x0 - p.x) * K, (q.z0 - p.z) * K, (q.x1 - q.x0) * K, (q.z1 - q.z0) * K); }
      c.fillStyle = 'rgba(30,48,26,.95)'; for (const t of G.sectors.trees()) { if (Math.abs(t.x - p.x) > R || Math.abs(t.z - p.z) > R || !t.alive) continue; c.beginPath(); c.arc((t.x - p.x) * K, (t.z - p.z) * K, 2.1 * K * t.s, 0, 7); c.fill(); }
      for (const S of G.sectors.loaded.values()) for (const r of S.rocks || []) { if (Math.abs(r.x - p.x) > R || Math.abs(r.z - p.z) > R || !r.alive) continue; c.fillStyle = r.kind === 'sulfur' ? '#d8bc3a' : r.kind === 'metal' ? '#a0603a' : '#9a988f'; c.beginPath(); c.arc((r.x - p.x) * K, (r.z - p.z) * K, 1.4 * K, 0, 7); c.fill(); }
    }
    for (const b of G.bags) if (b.body && (b.mine || !b.nid)) { c.fillStyle = '#F07A68'; c.beginPath(); c.arc((b.x - p.x) * K, (b.z - p.z) * K, 2.2 * K, 0, 7); c.fill(); }
    if (G.net && G.net.on) { for (const m of G.net.mates()) { c.fillStyle = '#6FA8FF'; c.strokeStyle = '#0d1520'; c.lineWidth = K * 0.5; c.beginPath(); c.arc((m.x - p.x) * K, (m.z - p.z) * K, 2 * K, 0, 7); c.fill(); c.stroke(); } }
    if (G.ARENA && G.net && G.net.on && G.net.foes) { for (const m of G.net.foes()) { c.globalAlpha = Math.min(1, m.a); c.fillStyle = '#F0594A'; c.strokeStyle = '#1a0806'; c.lineWidth = K * 0.5; c.beginPath(); c.arc((m.x - p.x) * K, (m.z - p.z) * K, 2 * K, 0, 7); c.fill(); c.stroke(); } c.globalAlpha = 1; } // inimigos vistos ou a disparar
    c.rotate(Math.atan2(Math.cos(p.yaw), Math.sin(p.yaw)));
    c.fillStyle = '#F4F1EA'; c.strokeStyle = '#111'; c.lineWidth = K * 0.5; c.beginPath(); c.moveTo(3.4 * K, 0); c.lineTo(-2.2 * K, 2.4 * K); c.lineTo(-1.2 * K, 0); c.lineTo(-2.2 * K, -2.4 * K); c.closePath(); c.fill(); c.stroke();
    c.restore();
    { const cs0 = Math.cos(G.YAW), sn0 = Math.sin(G.YAW), sk = s * K, rMax = sz / 2 - sz * 0.09; for (const m of (G.ARENA ? [] : marks)) { const dx = (m.x - p.x) * sk, dz = (m.z - p.z) * sk; let X = dx * cs0 - dz * sn0, Y = dx * sn0 + dz * cs0; const l = Math.hypot(X, Y); if (l > rMax) { X *= rMax / l; Y *= rMax / l; } drawSym(c, m.s, sz / 2 + X, sz / 2 + Y, sz * 0.06, MCOL[m.c] || MCOL[0]); } }
    const r = sz / 2 - sz * 0.1; c.fillStyle = 'rgba(15,17,19,.8)'; const nx = sz / 2 + Math.sin(G.YAW) * r, ny = sz / 2 - Math.cos(G.YAW) * r; c.beginPath(); c.arc(nx, ny, sz * 0.075, 0, 7); c.fill(); c.fillStyle = '#EEE9E0'; c.font = `700 ${sz * 0.1}px "Roboto Condensed",sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('N', nx, ny + sz * 0.005);
  };
  // mapa grande: o mundo todo ou perto de ti (2 km)
  const SPANS = [MAP * 2, 4000, 2000, 1000, 500]; let mapLv = 0; // mundo todo → 500 m
  const toggleMap = force => {
    G.mapOpen = force ?? !G.mapOpen; $('map').hidden = !G.mapOpen; if (!G.mapOpen) { mEdit = null; edRender(); return; } drawBig();
  };
  const drawBig = () => {
    const cv = $('mapc'), c = cv.getContext('2d'), p = G.p, AR = !!G.ARENA, span = AR ? AS : SPANS[mapLv], mapNear = AR || mapLv > 0, cx = AR ? AX : mapNear ? clamp(p.x, -MAP + span / 2, MAP - span / 2) : 0, cz = AR ? AZ : mapNear ? clamp(p.z, -MAP + span / 2, MAP - span / 2) : 0, S = cv.width / span, u = cv.width / Math.max(240, cv.getBoundingClientRect().width || cv.width); // u: píxeis do desenho por píxel do ecrã
    c.setTransform(1, 0, 0, 1, 0, 0); c.imageSmoothingEnabled = true; c.fillStyle = '#4a6338'; c.fillRect(0, 0, cv.width, cv.height);
    const sx = (cx - span / 2 + MAP) * KW, sz2 = span * KW; if (AR) c.drawImage(arenaRaster(), 0, 0, cv.width, cv.height); else c.drawImage(offW, sx, (cz - span / 2 + MAP) * KW, sz2, sz2, 0, 0, cv.width, cv.height); c.filter = 'none';
    // perto do centro e ampliado: usa o mapa com detalhe
    if (mapNear) { const a = Math.max(-CORE, cx - span / 2), b = Math.min(CORE, cx + span / 2), a2 = Math.max(-CORE, cz - span / 2), b2 = Math.min(CORE, cz + span / 2); if (b > a && b2 > a2) c.drawImage(off, (a + CORE) * K, (a2 + CORE) * K, (b - a) * K, (b2 - a2) * K, (a - cx + span / 2) * S, (a2 - cz + span / 2) * S, (b - a) * S, (b2 - a2) * S); }
    const T = v => (v - cx + span / 2) * S, Tz = v => (v - cz + span / 2) * S;
    if (span <= 4000 && !AR) { const L = (x0, z0, x1, z1) => x1 > cx - span / 2 && x0 < cx + span / 2 && z1 > cz - span / 2 && z0 < cz + span / 2, inCore = (x, z) => Math.abs(x) < CORE && Math.abs(z) < CORE; // estradas nítidas, com berma, fora do centro
      drawWater(c, T, Tz, S, cx - span / 2, cz - span / 2, cx + span / 2, cz + span / 2);
      { const Wt = G.W.water; if (Wt) { c.strokeStyle = 'rgba(150,190,190,.45)'; c.lineWidth = 1.2 * u; for (const Lk of Wt.lakes) { if (!L(Lk.x - Lk.rx * 1.3, Lk.z - Lk.rz * 1.3, Lk.x + Lk.rx * 1.3, Lk.z + Lk.rz * 1.3)) continue; c.beginPath(); for (let k = 0; k <= 48; k++) { const a = k / 48 * 6.2832, r = Lk.rf(a), X = T(Lk.x + Math.cos(a) * r * Lk.rx), Z = Tz(Lk.z + Math.sin(a) * r * Lk.rz); if (k) c.lineTo(X, Z); else c.moveTo(X, Z); } c.stroke(); } } }
      const mw = 1.6 * u; for (const pass of [0, 1]) for (const r of G.W.roads) if (L(r.x0, r.z0, r.x1, r.z1) && !inCore((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2)) { const e = pass ? 0 : 0.9 * u, wx = Math.max(mw, (r.x1 - r.x0) * S), wz = Math.max(mw, (r.z1 - r.z0) * S), X = T((r.x0 + r.x1) / 2) - wx / 2, Z = Tz((r.z0 + r.z1) / 2) - wz / 2; c.fillStyle = pass ? (r.dirt ? '#b8a07a' : '#ddd6c8') : 'rgba(18,16,12,.6)'; c.fillRect(X - e, Z - e, wx + e * 2, wz + e * 2); }
      if (span <= 1000) { c.fillStyle = 'rgba(40,36,32,.85)'; for (const q of G.W.rects) if (q.k === 's' && q.h >= 2.2 && !(q.lv > 0) && !q.car && L(q.x0, q.z0, q.x1, q.z1) && !inCore(q.x0, q.z0)) c.fillRect(T(q.x0), Tz(q.z0), Math.max(u, (q.x1 - q.x0) * S), Math.max(u, (q.z1 - q.z0) * S)); } // paredes: o desenho das casas
      for (const q of G.W.cuts) if (q.enter && L(q.x0, q.z0, q.x1, q.z1) && !inCore(q.x0, q.z0)) { c.fillStyle = '#8a7f72'; c.fillRect(T(q.x0), Tz(q.z0), (q.x1 - q.x0) * S, (q.z1 - q.z0) * S); c.strokeStyle = 'rgba(216,203,168,.9)'; c.lineWidth = 1.5; c.strokeRect(T(q.x0), Tz(q.z0), (q.x1 - q.x0) * S, (q.z1 - q.z0) * S); }
      if (span <= 1000) { c.fillStyle = 'rgba(30,48,26,.95)'; for (const t of G.sectors.trees()) { if (!t.alive || !L(t.x, t.z, t.x, t.z) || inCore(t.x, t.z)) continue; c.beginPath(); c.arc(T(t.x), Tz(t.z), Math.max(1.5, 2.1 * t.s * S), 0, 7); c.fill(); } }
    }
    c.textAlign = 'center';
    const placed = [], pri = z => z.kind === 'city' ? 3 : z.kind === 'mil' ? 2 : 1; for (const zn of [...G.W.zones].sort((a, b) => pri(b) - pri(a) || Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))) { if (zn.nolabel) continue; const X = T(zn.x), Z = Tz(zn.z); if (X < -40 || Z < -40 || X > cv.width + 40 || Z > cv.height + 40) continue; if (zn.kind === 'cabin') { c.fillStyle = '#e8dcc8'; c.beginPath(); c.arc(X, Z, (mapNear ? 3 : 2) * u, 0, 7); c.fill(); continue; } const big = zn.kind === 'city'; if (!mapNear && !big && (zn.small || Math.max(Math.abs(zn.x), Math.abs(zn.z)) < CORE)) continue; c.font = `700 ${Math.round((big ? 13 : mapNear ? 12 : 10.5) * u)}px "Roboto Condensed",sans-serif`; const lab = zn.name.toUpperCase() + (big ? ' · PvP' : ''); const w = c.measureText(lab).width, box = [X - w / 2 - 6 * u, Z - 10 * u, X + w / 2 + 6 * u, Z + 10 * u]; if (placed.some(q => q[0] < box[2] && box[0] < q[2] && q[1] < box[3] && box[1] < q[3])) continue; placed.push(box); c.fillStyle = 'rgba(12,14,16,.78)'; c.fillRect(X - w / 2 - 4 * u, Z - 8 * u, w + 8 * u, 16 * u); c.fillStyle = zn.kind === 'mil' ? '#ff9a7a' : big ? '#E39B6A' : '#EEE9E0'; c.textBaseline = 'middle'; c.fillText(lab, X, Z + 0.5 * u); c.textBaseline = 'alphabetic'; }
    for (const b of G.bags) if (b.body && (b.mine || !b.nid)) { c.fillStyle = '#F07A68'; c.beginPath(); c.arc(T(b.x), Tz(b.z), 4 * u, 0, 7); c.fill(); }
    // lançamento aéreo: zona do aviso (tracejada) e o sítio do avião caído
    if (G.drop && (G.drop.warn || G.drop.cur)) { const D = G.drop; c.font = `700 ${Math.round(12 * u)}px "Roboto Condensed",sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      const tag = (X, Z, txt) => { const w = c.measureText(txt).width + 12 * u; c.fillStyle = 'rgba(20,18,16,.85)'; c.fillRect(X - w / 2, Z - 9 * u, w, 18 * u); c.fillStyle = '#F4C9A8'; c.fillText(txt, X, Z + 0.5 * u); };
      if (D.warn) { const X = T(D.warn.mx), Z = Tz(D.warn.mz), r = Math.max(14 * u, 150 * S), s = Math.max(0, Math.round((D.warn.at - Date.now()) / 1000)); c.fillStyle = 'rgba(240,122,104,.14)'; c.strokeStyle = 'rgba(240,122,104,.95)'; c.lineWidth = 2 * u; c.setLineDash([6 * u, 5 * u]); c.beginPath(); c.arc(X, Z, r, 0, 7); c.fill(); c.stroke(); c.setLineDash([]); tag(X, Z - r - 12 * u, s ? 'Avião · ' + s + ' s' : 'Avião a cair'); }
      if (D.cur) { const X = T(D.cur.x), Z = Tz(D.cur.z); c.strokeStyle = '#1a0806'; c.lineCap = 'round'; for (const [lw, col] of [[6 * u, '#1a0806'], [3 * u, '#F07A68']]) { c.lineWidth = lw; c.strokeStyle = col; c.beginPath(); c.moveTo(X - 8 * u, Z); c.lineTo(X + 8 * u, Z); c.moveTo(X, Z - 9 * u); c.lineTo(X, Z + 6 * u); c.moveTo(X - 4 * u, Z + 6 * u); c.lineTo(X + 4 * u, Z + 6 * u); c.stroke(); } tag(X, Z - 20 * u, 'Avião caído'); }
    }
    if (G.base) { c.font = `600 ${Math.round(12 * u)}px "Roboto Condensed",sans-serif`; for (const d of G.base.beds()) { const X = T(d.x), Z = Tz(d.z); c.fillStyle = '#7fd38a'; c.strokeStyle = '#0f1a10'; c.lineWidth = 1.2 * u; c.fillRect(X - 3 * u, Z - 3 * u, 6 * u, 6 * u); c.strokeRect(X - 3 * u, Z - 3 * u, 6 * u, 6 * u); if (mapNear) { c.lineWidth = 3 * u; c.strokeStyle = 'rgba(12,14,16,.85)'; c.strokeText(d.name, X, Z - 7 * u); c.fillStyle = '#DDF3E0'; c.fillText(d.name, X, Z - 7 * u); } } }
    if (G.net && G.net.on) { c.font = `700 ${Math.round(14 * u)}px "Roboto Condensed",sans-serif`; for (const m of G.net.mates()) { const X = T(m.x), Z = Tz(m.z); c.fillStyle = '#6FA8FF'; c.strokeStyle = '#0d1520'; c.lineWidth = 1.6 * u; c.beginPath(); c.arc(X, Z, 5 * u, 0, 7); c.fill(); c.stroke(); c.lineWidth = 3 * u; c.strokeStyle = 'rgba(12,14,16,.85)'; c.strokeText(m.name, X, Z - 9 * u); c.fillStyle = '#CFE0FF'; c.fillText(m.name, X, Z - 9 * u); } }
    if (G.ARENA && G.net && G.net.on && G.net.foes) { for (const m of G.net.foes()) { const X = T(m.x), Z = Tz(m.z); c.globalAlpha = Math.min(1, m.a); c.fillStyle = '#F0594A'; c.strokeStyle = '#1a0806'; c.lineWidth = 1.6 * u; c.beginPath(); c.arc(X, Z, 6 * u, 0, 7); c.fill(); c.stroke(); } c.globalAlpha = 1; }
    if (G.net && G.net.on) { const W2 = cv.width, m0 = 16 * u; c.font = `700 ${Math.round(13 * u)}px "Roboto Condensed",sans-serif`; for (const m of G.net.mates()) { const X = T(m.x), Z = Tz(m.z); if (X >= 0 && Z >= 0 && X <= W2 && Z <= W2) continue; // colega fora da vista: seta na borda com a distância
        const dx = X - W2 / 2, dz = Z - W2 / 2, k = (W2 / 2 - m0) / Math.max(Math.abs(dx), Math.abs(dz)), ex = W2 / 2 + dx * k, ez = W2 / 2 + dz * k, a = Math.atan2(dz, dx), d = Math.hypot(m.x - p.x, m.z - p.z);
        c.save(); c.translate(ex, ez); c.rotate(a); c.fillStyle = '#6FA8FF'; c.strokeStyle = '#0d1520'; c.lineWidth = 1.6 * u; c.beginPath(); c.moveTo(9 * u, 0); c.lineTo(-5 * u, 6.5 * u); c.lineTo(-5 * u, -6.5 * u); c.closePath(); c.fill(); c.stroke(); c.restore();
        const lbl = m.name + ' · ' + (d >= 1000 ? (d / 1000).toFixed(1).replace('.', ',') + ' km' : Math.round(d) + ' m'), tx = clamp(ex - Math.cos(a) * 20 * u, 40 * u, W2 - 40 * u), tz = clamp(ez - Math.sin(a) * 20 * u, 12 * u, W2 - 8 * u); c.lineWidth = 3 * u; c.strokeStyle = 'rgba(12,14,16,.85)'; c.strokeText(lbl, tx, tz); c.fillStyle = '#CFE0FF'; c.fillText(lbl, tx, tz); } }
    if (!AR) { // grelha de 500 m com letra e número (para dizer «estou em F7» aos colegas)
      c.strokeStyle = 'rgba(244,241,234,.16)'; c.lineWidth = u; c.font = `700 ${Math.round(11 * u)}px "Roboto Condensed",sans-serif`; c.textAlign = 'left'; c.textBaseline = 'top';
      for (let g = -MAP; g <= MAP; g += CELL) { const X = T(g), Z = Tz(g); if (X >= -1 && X <= cv.width + 1) { c.beginPath(); c.moveTo(X, 0); c.lineTo(X, cv.height); c.stroke(); } if (Z >= -1 && Z <= cv.height + 1) { c.beginPath(); c.moveTo(0, Z); c.lineTo(cv.width, Z); c.stroke(); } }
      const lab = (lb, tx, tz) => { c.fillStyle = 'rgba(12,11,10,.6)'; c.fillRect(tx - 2 * u, tz - 1 * u, c.measureText(lb).width + 4 * u, 13 * u); c.fillStyle = 'rgba(244,241,234,.85)'; c.fillText(lb, tx, tz); };
      if (S * CELL >= 90 * u) { for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) { const X = T(-MAP + i * CELL), Z = Tz(-MAP + j * CELL); if (X < -2 || Z < -2 || X > cv.width - 20 * u || Z > cv.height - 14 * u) continue; lab(gridLet(i) + (j + 1), X + 4 * u, Z + 3 * u); } } // cada quadrado com o nome
      else { for (let i = 0; i < 16; i++) { const X = T(-MAP + (i + 0.5) * CELL); if (X > 6 * u && X < cv.width - 6 * u) lab(gridLet(i), X - 3 * u, 3 * u); } for (let j = 0; j < 16; j++) { const Z = Tz(-MAP + (j + 0.5) * CELL); if (Z > 18 * u && Z < cv.height - 8 * u) lab(String(j + 1), 3 * u, Z - 6 * u); } } // longe: letras em cima e números à esquerda
      c.textAlign = 'center'; c.textBaseline = 'middle'; }
    for (const m of (G.ARENA ? [] : marks)) { const X = T(m.x), Z = Tz(m.z), d = Math.hypot(m.x - p.x, m.z - p.z); if (X < -20 || Z < -20 || X > cv.width + 20 || Z > cv.height + 20) continue; if (m === mEdit) { c.strokeStyle = '#F4F1EA'; c.lineWidth = 2 * u; c.beginPath(); c.arc(X, Z, 15 * u, 0, 7); c.stroke(); } drawSym(c, m.s, X, Z, 10 * u, MCOL[m.c] || MCOL[0]); c.font = `700 ${Math.round(12 * u)}px "Roboto Condensed",sans-serif`; c.lineWidth = 3 * u; c.strokeStyle = 'rgba(12,14,16,.85)'; const lb = distTxt(d); c.strokeText(lb, X, Z + 18 * u); c.fillStyle = '#F4F1EA'; c.fillText(lb, X, Z + 18 * u); }
    { const X = T(p.x), Z = Tz(p.z); c.fillStyle = 'rgba(244,241,234,.16)'; c.strokeStyle = 'rgba(244,241,234,.9)'; c.lineWidth = 1.3 * u; c.beginPath(); c.arc(X, Z, 15 * u, 0, 7); c.fill(); c.stroke(); } // tu: um anel à volta para se ver logo
    c.save(); c.translate(T(p.x), Tz(p.z)); c.rotate(Math.atan2(Math.cos(p.yaw), Math.sin(p.yaw))); c.fillStyle = '#F4F1EA'; c.strokeStyle = '#111'; c.lineWidth = 1.6 * u; c.beginPath(); c.moveTo(10 * u, 0); c.lineTo(-6 * u, 7 * u); c.lineTo(-3 * u, 0); c.lineTo(-6 * u, -7 * u); c.closePath(); c.fill(); c.stroke(); c.restore();
    $('mScale').textContent = AR ? 'Arena de Tóquio · ' + (p.x < AX ? 'oeste (Vermelha)' : 'este (Azul)') : (mapNear ? '' : 'Mundo · ') + (span >= 1000 ? span / 1000 + ' km' : span + ' m') + ' · ' + gridName(p.x, p.z); $('mIn').disabled = mapLv >= SPANS.length - 1; $('mOut').disabled = mapLv <= 0;
  };
  // administração: tocar no mapa para ir a esse ponto
  const mapPt = e => { const cv = $('mapc'), r = cv.getBoundingClientRect(), p = G.p, AR = !!G.ARENA, span = AR ? AS : SPANS[mapLv], near = AR || mapLv > 0, cx = AR ? AX : near ? clamp(p.x, -MAP + span / 2, MAP - span / 2) : 0, cz = AR ? AZ : near ? clamp(p.z, -MAP + span / 2, MAP - span / 2) : 0; return { x: cx - span / 2 + (e.clientX - r.left) / r.width * span, z: cz - span / 2 + (e.clientY - r.top) / r.height * span, mpp: span / r.width }; };
  let mEdit = null, mLastC = 0, mLastS = 'ponto';
  const mEd = $('mEd'), mLeg = document.querySelector('#map .ml');
  const edRender = () => { const on = !!mEdit; mEd.hidden = !on; mLeg.hidden = on; $('map').classList.toggle('editing', on); if (!on) return;
    $('mEdT').textContent = gridName(mEdit.x, mEdit.z) + ' · ' + distTxt(Math.hypot(mEdit.x - G.p.x, mEdit.z - G.p.z)) + ' · ' + Math.round(bearing(mEdit.x - G.p.x, mEdit.z - G.p.z)) + '°';
    $('mEdC').innerHTML = MCOL.map((col, i) => `<button class="sw${i === mEdit.c ? ' on' : ''}" data-c="${i}" style="background:${col}" aria-label="Cor ${i + 1}"></button>`).join('');
    $('mEdS').innerHTML = MSYM.map(k => `<button class="sy${k === mEdit.s ? ' on' : ''}" data-s="${k}" aria-label="${MSYM_N[k]}"><canvas width="44" height="44"></canvas></button>`).join('');
    $('mEdS').querySelectorAll('.sy').forEach(b => { const cc = b.querySelector('canvas').getContext('2d'); drawSym(cc, b.dataset.s, 22, 22, 16, MCOL[mEdit.c] || MCOL[0]); }); };
  $('mEd').addEventListener('click', e => { e.stopPropagation(); const b = e.target.closest('button'); if (!b || !mEdit) return; audio.play('ui');
    if (b.dataset.c) { mEdit.c = mLastC = +b.dataset.c; } else if (b.dataset.s) { mEdit.s = mLastS = b.dataset.s; } else if (b.id === 'mEdDel') { delMark(mEdit); mEdit = null; } else if (b.id === 'mEdOk') mEdit = null;
    saveMarks(); edRender(); drawBig(); });
  $('mapc').addEventListener('click', e => { if (G.ARENA) return; /* na arena não se marca no mapa */ if (G.admTp && G.net.role) return; const q = mapPt(e); let best = null, bd = 1e9; for (const m of marks) { const d = Math.hypot(m.x - q.x, m.z - q.z) / q.mpp; if (d < bd) { bd = d; best = m; } }
    if (best && bd < 22) mEdit = mEdit === best ? null : best; else if (mEdit) mEdit = null; else { mEdit = addMark(q.x, q.z, mLastC, mLastS); toast('Marcador posto · escolhe a cor e o símbolo'); }
    audio.play('ui'); edRender(); drawBig(); });
  $('mapc').addEventListener('click', e => { if (!G.admTp || !G.net.role) return; const cv = $('mapc'), r = cv.getBoundingClientRect(), p = G.p, span = SPANS[mapLv], near = mapLv > 0, cx = near ? clamp(p.x, -MAP + span / 2, MAP - span / 2) : 0, cz = near ? clamp(p.z, -MAP + span / 2, MAP - span / 2) : 0;
    const x = cx - span / 2 + (e.clientX - r.left) / r.width * span, z = cz - span / 2 + (e.clientY - r.top) / r.height * span; G.net.adm('gopt', { x: Math.round(x), z: Math.round(z) }); audio.play('ui'); toggleMap(false); });
  const mapStep = d => { const n = clamp(mapLv + d, 0, SPANS.length - 1); if (n === mapLv) return; mapLv = n; audio.play('ui'); drawBig(); };
  $('mIn').onclick = e => { e.stopPropagation(); mapStep(1); }; $('mOut').onclick = e => { e.stopPropagation(); mapStep(-1); };
  $('mapc').addEventListener('wheel', e => { e.preventDefault(); mapStep(e.deltaY < 0 ? 1 : -1); }, { passive: false });
  { let pd = 0; const cv = $('mapc'); cv.addEventListener('touchmove', e => { if (e.touches.length !== 2) return; e.preventDefault(); const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); if (!pd) { pd = d; return; } if (d / pd > 1.35) { mapStep(1); pd = d; } else if (pd / d > 1.35) { mapStep(-1); pd = d; } }, { passive: false }); cv.addEventListener('touchend', () => { pd = 0; }); }

  // ---------- avisos
  const toastEl = $('toast'); let toastT = 0;
  const toast = m => { toastEl.textContent = m; toastEl.hidden = false; toastEl.style.opacity = 1; toastT = 2.8; };
  const AUI = initArenaUI(G, { $, audio, toast });
  $('bAr').onclick = () => { audio.play('ui'); AUI.menu(); };
  const feedEl = $('feed'), feeds = [];
  const feed = (k, n) => { if (!n) return; const f = feeds.find(f => f.k === k && f.t > 0.6); if (f) { f.n += n; f.t = 3; f.el.querySelector('b').textContent = '+' + f.n; return; } const el = document.createElement('div'); el.className = 'fd'; el.innerHTML = `<img src="${G.ICONS[k]}" alt=""><b>+${n}</b><span>${ITEMS[k].s}</span>`; feedEl.appendChild(el); feeds.push({ k, n, t: 3, el }); while (feeds.length > 3) { const o = feeds.shift(); o.el.remove(); } };
  const xh = $('xh'), hm = $('hm'), scEl = $('scope'); let hitT = 0;
  // controlo do zero: ao lado da mira, no 1.º sítio livre (sem botões por baixo e dentro do ecrã)
  const zPlace = (SC, R) => { const zs = $('szero'), si = scEl.querySelector('.sinfo'), key = innerWidth + 'x' + innerHeight + ':' + (R | 0) + ':' + $('tBreath').hidden + ':' + cfg.btn; if (zs._k === key) return; zs._k = key;
    const vw = innerWidth, vh = innerHeight, I = ins(), m = 8;
    const busy = [...document.querySelectorAll('#touch .tb, #ammo, #vit, #belt, #mm, #tr')].filter(e => e.offsetParent !== null).map(e => e.getBoundingClientRect()).filter(r => r.width > 0);
    const free = (x, y, w, h) => x >= I.l + m && y >= I.t + m && x + w <= vw - I.r - m && y + h <= vh - I.b - m && !busy.some(r => x < r.right + 6 && x + w > r.left - 6 && y < r.bottom + 6 && y + h > r.top - 6);
    const inside = h => { const dy = R * 0.3 + h; return Math.sqrt(Math.max(0, R * R - dy * dy)); };
    // zero à esquerda, ampliação e distância à direita (em espelho quando têm de ficar dentro do círculo)
    { const w = zs.offsetWidth || 150, h = zs.offsetHeight || 40, c = [[SC.x - R * 0.58 - w, SC.y + R * 0.58], [SC.x - w / 2, SC.y + R + 10], [SC.x - inside(h) + 10, SC.y + R * 0.3], [SC.x - w / 2, SC.y - R - h - 10]];
      const at = c.find(q => free(q[0], q[1], w, h)) || c[2]; zs.style.left = at[0].toFixed(0) + 'px'; zs.style.top = at[1].toFixed(0) + 'px'; }
    { const w = Math.max(44, si.offsetWidth), h = Math.max(30, si.offsetHeight), c = [[SC.x + R * 0.62, SC.y + R * 0.62], [SC.x + inside(h) - w - 10, SC.y + R * 0.3 + 4]];
      const at = c.find(q => free(q[0], q[1], w, h)) || c[1]; si.style.left = at[0].toFixed(0) + 'px'; si.style.top = at[1].toFixed(0) + 'px'; } };
  let hitAt = null;
  const hit = (kill, zone, stop, at) => { hitAt = at || null; hm.className = (kill ? 'kill ' : '') + (zone === 'head' && !stop ? 'head ' : '') + (stop ? 'stop' : ''); hm.hidden = false; hitT = zone === 'head' && kill ? 0.4 : 0.22; if (zone === 'head' && kill && !stop) feedTxt('Na cabeça'); else if (stop && zone !== 'car') feedTxt(zone === 'head' ? 'O capacete travou' : 'O colete travou'); };
  let ftT = 0; const feedTxt = m => { if (ftT > 0 && toastEl.textContent === m) return; toast(m); toastT = 1.1; ftT = 1; };
  // levar dano: as bordas ficam vermelhas (mais com mais dano) e um arco mostra de onde veio; fica um instante e apaga devagar
  let dmgT = 0, dirT = 0;
  const damage = (amt = 25, ang = null) => { const d = $('dmg'); d.style.setProperty('--dk', Math.min(1, 0.45 + amt / 60).toFixed(2)); d.classList.add('on'); clearTimeout(dmgT); dmgT = setTimeout(() => d.classList.remove('on'), 140);
    if (ang != null) { const e = $('dmgDir'); e.style.transform = 'rotate(' + ang.toFixed(3) + 'rad)'; e.classList.add('on'); clearTimeout(dirT); dirT = setTimeout(() => e.classList.remove('on'), 500); } };
  // morte: onde morreste, as tuas camas no mapa e escolher em qual renasces (como no Rust)
  let dTick = null, dSure = null;
  const mmss = ms => { const t = Math.ceil(ms / 1000); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
  const dMap = () => {
    const cv = $('dMap'), c = cv.getContext('2d'), L = G.base.beds(), P = G.deadAt || { x: 0, z: 0 }, pts = L.map(d => [d.x, d.z]).concat([[P.x, P.z]]);
    let x0 = Math.min(...pts.map(q => q[0])), x1 = Math.max(...pts.map(q => q[0])), z0 = Math.min(...pts.map(q => q[1])), z1 = Math.max(...pts.map(q => q[1]));
    const span = Math.min(MAP * 2, Math.max(240, Math.max(x1 - x0, z1 - z0) * 1.35)), cx = clamp((x0 + x1) / 2, -MAP + span / 2, MAP - span / 2), cz = clamp((z0 + z1) / 2, -MAP + span / 2, MAP - span / 2), S = cv.width / span;
    c.setTransform(1, 0, 0, 1, 0, 0); c.imageSmoothingEnabled = true; c.fillStyle = '#4a6338'; c.fillRect(0, 0, cv.width, cv.height);
    // longe: o mapa do mundo; perto: fundo liso com uma grelha de 50 m (o mapa do mundo ficava aos quadrados)
    if (span >= 1200) c.drawImage(offW, (cx - span / 2 + MAP) * KW, (cz - span / 2 + MAP) * KW, span * KW, span * KW, 0, 0, cv.width, cv.height);
    else { const st = span > 600 ? 100 : 50; c.strokeStyle = 'rgba(15,22,12,.22)'; c.lineWidth = 1; for (let g = Math.ceil((cx - span / 2) / st) * st; g < cx + span / 2; g += st) { const X = (g - cx + span / 2) * S; c.beginPath(); c.moveTo(X, 0); c.lineTo(X, cv.height); c.stroke(); } for (let g = Math.ceil((cz - span / 2) / st) * st; g < cz + span / 2; g += st) { const Z = (g - cz + span / 2) * S; c.beginPath(); c.moveTo(0, Z); c.lineTo(cv.width, Z); c.stroke(); }
      c.fillStyle = 'rgba(12,14,16,.72)'; c.fillRect(8, cv.height - 26, 74, 18); c.fillStyle = '#EEE9E0'; c.font = '600 13px "Roboto Condensed",sans-serif'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText('grelha ' + st + ' m', 14, cv.height - 17); }
    { const a = Math.max(-CORE, cx - span / 2), b = Math.min(CORE, cx + span / 2), a2 = Math.max(-CORE, cz - span / 2), b2 = Math.min(CORE, cz + span / 2); if (b > a && b2 > a2) c.drawImage(off, (a + CORE) * K, (a2 + CORE) * K, (b - a) * K, (b2 - a2) * K, (a - cx + span / 2) * S, (a2 - cz + span / 2) * S, (b - a) * S, (b2 - a2) * S); }
    const T = v => (v - cx + span / 2) * S, Tz = v => (v - cz + span / 2) * S;
    // estradas e nomes das zonas por perto, para saberes onde fica cada cama
    const vx0 = cx - span / 2, vx1 = cx + span / 2, vz0 = cz - span / 2, vz1 = cz + span / 2;
    for (const r of G.W.roads) { if (r.x1 < vx0 || r.x0 > vx1 || r.z1 < vz0 || r.z0 > vz1) continue; c.fillStyle = r.x1 - r.x0 > 8 && r.z1 - r.z0 > 8 ? '#6b5b44' : '#7a6f60'; c.fillRect(T(r.x0), Tz(r.z0), Math.max(2, (r.x1 - r.x0) * S), Math.max(2, (r.z1 - r.z0) * S)); }
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '700 15px "Roboto Condensed",sans-serif';
    for (const zn of G.W.zones) { if (zn.kind === 'cabin' || zn.nolabel || zn.x < vx0 - 30 || zn.x > vx1 + 30 || zn.z < vz0 - 30 || zn.z > vz1 + 30) continue; const lab = zn.name.toUpperCase(), w = c.measureText(lab).width, X = clamp(T(zn.x), w / 2 + 4, cv.width - w / 2 - 4), Z = clamp(Tz(zn.z), 12, cv.height - 12); c.fillStyle = 'rgba(12,14,16,.72)'; c.fillRect(X - w / 2 - 5, Z - 10, w + 10, 20); c.fillStyle = zn.kind === 'city' ? '#E39B6A' : '#EEE9E0'; c.fillText(lab, X, Z + 1); }
    // onde morreste: uma cruz
    c.strokeStyle = '#1a0806'; c.lineWidth = 7; c.lineCap = 'round'; const X = T(P.x), Z = Tz(P.z); for (const w of [7, 3.5]) { c.lineWidth = w; c.strokeStyle = w > 5 ? '#1a0806' : '#F07A68'; c.beginPath(); c.moveTo(X - 9, Z - 9); c.lineTo(X + 9, Z + 9); c.moveTo(X + 9, Z - 9); c.lineTo(X - 9, Z + 9); c.stroke(); }
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '700 17px "Roboto Condensed",sans-serif';
    const placed = [];
    L.forEach((d, i) => { const ox = T(d.x), oz = Tz(d.z); let x = ox, z = oz, k = 0; while (k < 12 && placed.some(q => Math.hypot(q[0] - x, q[1] - z) < 30)) { k++; const a = -Math.PI / 2 + (k - 1) * 0.9; x = ox + Math.cos(a) * 32; z = oz + Math.sin(a) * 32; } placed.push([x, z]); const ok = !G.base.bedReady(d);
      if (k) { c.strokeStyle = '#0f1a10'; c.lineWidth = 2; c.beginPath(); c.moveTo(ox, oz); c.lineTo(x, z); c.stroke(); c.fillStyle = '#0f1a10'; c.beginPath(); c.arc(ox, oz, 3, 0, 7); c.fill(); }
      c.font = '700 17px "Roboto Condensed",sans-serif'; c.fillStyle = '#0f1a10'; c.beginPath(); c.arc(x, z, 15, 0, 7); c.fill(); c.fillStyle = ok ? '#7fd38a' : '#5a5f63'; c.beginPath(); c.arc(x, z, 12.5, 0, 7); c.fill(); c.fillStyle = ok ? '#0f1a10' : '#e0dbd2'; c.fillText(String(i + 1), x, z + 1); d._mx = x; d._mz = z; });
  };
  const dInfo = (d, P) => { const w = G.base.bedReady(d), dist = Math.hypot(d.x - P.x, d.z - P.z), dd = dist >= 1000 ? (dist / 1000).toFixed(1).replace('.', ',') + ' km' : Math.round(dist) + ' m'; return [w, (d.k === 'saco' ? 'Saco-cama' : 'Cama') + ' · ' + dd + ' · ' + (w ? 'pronta daqui a ' + mmss(w) : 'pronta')]; };
  // a lista só se refaz quando muda (camas ou «Remover?»); a cada segundo só mudam os textos, para os toques nunca se perderem
  let dKey = '';
  const dRows = () => {
    const L = G.base.beds(), P = G.deadAt || { x: 0, z: 0 }, key = L.map(d => d.name).join('|') + '#' + (dSure ? L.indexOf(dSure) : -1);
    if (key !== dKey) { dKey = key;
      $('dList').innerHTML = L.map((d, i) => `<div class="dbed" role="listitem"><button class="dgo" data-i="${i}"><b>${i + 1}</b><span><strong>${esc(d.name)}</strong><em></em></span></button><button class="dx${dSure === d ? ' sure' : ''}" data-x="${i}" aria-label="Remover ${esc(d.name)}">${dSure === d ? 'Remover?' : '×'}</button></div>`).join('');
      $('dBeds').hidden = !L.length; $('dp').classList.toggle('has-beds', !!L.length); $('dGo').classList.toggle('pri', !L.length); }
    $('dList').querySelectorAll('.dbed').forEach((el, i) => { const d = L[i]; if (!d) return; const [w, t] = dInfo(d, P); el.classList.toggle('wait', !!w); const em = el.querySelector('em'); if (em.textContent !== t) em.textContent = t; el.querySelector('.dgo').setAttribute('aria-disabled', w ? 'true' : 'false'); });
  };
  $('dList').onclick = e => { const L = G.base.beds(), g = e.target.closest('.dgo'), x = e.target.closest('.dx');
    if (g) { const d = L[+g.dataset.i]; if (!d) return; const w = G.base.bedReady(d); if (w) { audio.play('vazio'); toast(d.name + ': pronta daqui a ' + mmss(w)); return; } audio.play('ui'); G.respawn(d); return; }
    if (x) { const d = L[+x.dataset.x]; if (!d) return; audio.play('ui'); if (dSure === d) { G.base.removeBed(d); dSure = null; toast(d.name + ' foi removida'); } else { dSure = d; setTimeout(() => { if (dSure === d) { dSure = null; if (!$('dead').hidden) dRows(); } }, 3000); } dRows(); dMap(); } };
  $('dMap').onclick = e => { const cv = $('dMap'), r = cv.getBoundingClientRect(), x = (e.clientX - r.left) * cv.width / r.width, z = (e.clientY - r.top) * cv.height / r.height; let best = null, bd = 30; for (const d of G.base.beds()) { const q = Math.hypot((d._mx ?? -99) - x, (d._mz ?? -99) - z); if (q < bd) { bd = q; best = d; } } if (!best) return; const w = G.base.bedReady(best); if (w) { audio.play('vazio'); toast(best.name + ': pronta daqui a ' + mmss(w)); return; } audio.play('ui'); G.respawn(best); };
  const death = o => { const C = { queda: 'Caíste de muito alto.', admin: 'Um administrador tirou-te do jogo.', zombie: 'Os zombies apanharam-te.', lobo: 'Os lobos apanharam-te.', javali: 'Um javali deu cabo de ti.', sangue: 'Sangraste até ao fim. Uma ligadura tinha chegado.', fome: 'Morreste de fome.', sede: 'Morreste de sede.', afogado: 'Ficaste sem fôlego a nadar e afogaste-te.', explosao: 'Uma explosão apanhou-te.', dormir: 'Mataram-te enquanto dormias e levaram o que tinhas.' }; $('dCause').textContent = o.cause === 'pvp' ? (o.by ? o.by + ' matou-te.' : 'Outro jogador matou-te.') : o.cause === 'carro' ? (o.by ? o.by + ' atropelou-te.' : 'Foste atropelado.') : C[o.cause] || 'Morreste.'; const m = Math.floor(o.time / 60), s = Math.floor(o.time % 60); $('dStat').textContent = `Sobreviveste ${m} min ${s} s · ${o.kills} zombie${o.kills === 1 ? '' : 's'} abatido${o.kills === 1 ? '' : 's'}`;
    $('dNote').textContent = o.cause === 'dormir' ? 'Tens de começar com o que trouxeres.' : 'As tuas coisas ficaram no teu corpo, onde caíste.';
    dSure = null; dKey = ''; dRows(); $('dead').hidden = false; toastEl.hidden = true; requestAnimationFrame(dMap); clearInterval(dTick); dTick = setInterval(() => { if ($('dead').hidden) { clearInterval(dTick); return; } dRows(); dMap(); }, 1000); };
  // cama ou saco-cama: mudar o nome ou apanhar
  const bedMenu = d => {
    const nm = d.k === 'saco' ? 'Saco-cama' : 'Cama'; $('pfT').textContent = nm; pfm.classList.remove('wide', 'kpw');
    pfB.innerHTML = `<p>Quando morres, escolhes no mapa em que cama ou saco-cama queres renascer. Depois de usares ${d.k === 'saco' ? 'este saco-cama esperas 5 min' : 'esta cama esperas 2 min'} até dar outra vez.</p>${field('bdN', 'Nome', 'text', d.name, 'off')}<div class="pmsg" id="bdM"></div><button class="btn pri big" id="bdOk">Guardar nome</button><button class="btn big" id="bdPick">Apanhar ${d.k === 'saco' ? 'o saco-cama' : 'a cama'}</button>`;
    $('bdN').maxLength = 24;
    $('bdOk').onclick = e => { e.stopPropagation(); if (!G.base.renameBed(d, $('bdN').value)) { $('bdM').textContent = 'Escreve um nome'; $('bdM').className = 'pmsg err'; return; } audio.play('ui'); pfClose(); toast('Agora chama-se ' + d.name); };
    $('bdPick').onclick = e => { e.stopPropagation(); G.base.pickBed(d); pfClose(); toast(nm + ' apanhad' + (d.k === 'saco' ? 'o' : 'a')); };
    $('bdN').onkeydown = e => { if (e.key === 'Enter') $('bdOk').click(); };
    pfm.hidden = false;
  };

  // ---------- HUD por frame
  const vals = {}; const setV = (id, v) => { if (vals[id] === v) return; vals[id] = v; $(id).textContent = v; };
  const setB = (id, v) => { const k = id + 'b'; const r = Math.round(v); if (vals[k] === r) return; vals[k] = r; $(id).style.width = r + '%'; };
  let mmT = 0, beltKey = '';
  const refresh = light => {
    const I = G.inv; const key = I.belt.map(b => b ? b.k + b.n + ':' + (b.ammo ?? '') : '-').join('|') + G.sel;
    if (key !== beltKey) { beltKey = key; bs.forEach((b, i) => { const it = I.belt[i]; b.className = 'bs' + (i === G.sel ? ' on' : ''); b.innerHTML = `<span class="k">${i + 1}</span>` + (it ? `<img src="${G.ICONS[it.k]}" alt="">` + (ITEMS[it.k].gun ? `<span class="ct am">${it.ammo}</span>` : it.n > 1 ? `<span class="ct">${it.n}</span>` : '') : ''); }); }
    if (!light) render();
  };
  // barra de construção: com a planta escolhes a peça; com o martelo vês a peça e o custo de melhorar
  const BN = { fund: 'Fundação', parede: 'Parede', porta: 'Porta', janela: 'Janela', teto: 'Teto' };
  { const bm = $('bModes'); for (const m of Object.keys(BN)) { const b = document.createElement('button'); b.dataset.m = m; b.textContent = BN[m]; b.onclick = e => { e.stopPropagation(); G.base.setMode(m); audio.play('ui'); vals.bk = ''; }; bm.appendChild(b); } }
  $('bDemo').onclick = e => { e.stopPropagation(); if (G.base.demolish()) audio.play('ui'); vals.bk = ''; };
  const buildBar = () => {
    const k = G.buildK, el = $('build'), ts = $('toast'); if (k !== 'planta' && k !== 'martelo' || G.invOpen || G.fp) { if (!el.hidden) { el.hidden = true; ts.style.bottom = ''; } return; }
    el.hidden = false; const B = G.base.B;
    if (k === 'planta') { const c = G.base.costOf(B.mode), ok = G.base.can(c), bad = B.tgt && B.tgt.bad, key = 'p' + B.mode + ok + bad;
      if (vals.bk !== key) { vals.bk = key; $('bModes').hidden = false; $('bDemo').hidden = true; for (const b of $('bModes').children) b.classList.toggle('on', b.dataset.m === B.mode); $('bName').textContent = BN[B.mode]; const sp = $('bCost'); sp.textContent = bad || G.base.costTxt(c); sp.className = bad || !ok ? 'no' : ''; } }
    else { const I = G.base.upgradeInfo(), key = 'm' + (I ? I.n + I.tier + I.hp + I.need : '');
      if (vals.bk !== key) { vals.bk = key; $('bModes').hidden = true; $('bDemo').hidden = !I; $('bName').textContent = I ? I.n + ' de ' + I.tier.toLowerCase() + ' · ' + I.hp + '/' + I.max : 'Vira-te para uma peça'; $('bCost').textContent = I ? (I.next ? 'Disparar: ' + I.next.toLowerCase() + ' (' + I.need + ')' : 'Já está no máximo') : ''; $('bCost').className = ''; } }
    // por cima do cinto, no 1.º sítio sem botões nem painéis por baixo
    { const key = innerWidth + 'x' + innerHeight + ':' + el.offsetWidth + ':' + cfg.btn; if (el._k !== key) { el._k = key; const r = $('belt').getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight, x0 = (innerWidth - w) / 2, x1 = x0 + w;
      const busy = [...document.querySelectorAll('#touch .tb, #vit, #ammo, #mm, #tr, #feed')].filter(e => e.offsetParent !== null).map(e => e.getBoundingClientRect()).filter(q => q.width > 0 && q.left < x1 + 6 && q.right > x0 - 6);
      let y = r.top - 8 - h; for (let k = 0; k < 120 && busy.some(q => y < q.bottom + 6 && y + h > q.top - 6); k++) y -= 4; el.style.bottom = Math.round(innerHeight - y - h) + 'px'; } }
    // o aviso sobe para cima da barra (na horizontal fica em baixo e tapava-a)
    if (getComputedStyle(ts).top === 'auto' || ts.style.bottom) { const br = el.getBoundingClientRect(); ts.style.bottom = Math.round(innerHeight - br.top + 8) + 'px'; }
  };
  const cmpC = $('cmpc'), cmpT = $('cmpt'); let cmpLast = -1;
  const frame = dt => {
    if (!G.playing || G.editing) return;
    buildBar();
    if (cfg.fps) { G.fpsT = (G.fpsT || 0) - dt; if (G.fpsT <= 0) { G.fpsT = 0.5; $('fps').textContent = Math.round(G.fps) + ' fps'; } }
    const p = G.p;
    setV('vHp', Math.max(0, Math.ceil(p.hp))); setV('vFd', Math.ceil(p.food)); setV('vWt', Math.ceil(p.water));
    setB('bHp', p.hp); setB('bFd', p.food); setB('bWt', p.water);
    const low = { hp: p.hp < 30, fo: p.food < 15, wt: p.water < 15 };
    for (const k in low) { const el = document.querySelector('.vb.' + k); if (el.classList.contains('low') !== low[k]) el.classList.toggle('low', low[k]); }
    const st = (p.bleed ? 'b' : '') + (G.inside ? 'i' : '');
    if (vals.st !== st + (G.inside ? G.inside.name : '')) { vals.st = st + (G.inside ? G.inside.name : ''); $('status').innerHTML = (p.bleed ? '<span class="chip">A sangrar</span>' : ''); }
    $('lowhp').style.opacity = p.alive && p.hp < 35 ? (1 - p.hp / 35).toFixed(2) : 0;
    const sb = $('stam'); sb.style.opacity = p.stam < 99 ? 1 : 0; sb.firstChild.style.width = p.stam + '%';
    // munições (no carro: velocidade e gasolina)
    const it = G.inv.belt[G.sel], d = it && ITEMS[it.k];
    if (G.car) { const c = G.car, kmh = Math.round(Math.abs(c.v) * 3.6), key = 'car' + kmh + '|' + Math.round(c.fuel) + '|' + Math.round(c.hp / 4) + G.carSeat + '|' + Math.round(c.alt || 0); $('ammo').hidden = false;
      if (vals.am !== key) { vals.am = key; $('aN').innerHTML = kmh + '<small> km/h</small>'; const T = VT[c.k] || VT.sedan; $('aW').textContent = (G.carSeat ? 'Passageiro · ' : T.n + ' · ') + (T.fly ? Math.round(c.alt || 0) + ' m · ' : '') + (T.tank ? Math.round(c.fuel) + ' L · ' : '') + (c.hp <= 0 ? 'desfeito' : Math.round(c.hp / T.hp * 100) + '%'); } }
    else if (d && d.gun) { $('ammo').hidden = false; const ak = it.ak || (Array.isArray(d.gun.ammo) ? d.gun.ammo[0] : d.gun.ammo), cl = d.gun.clip ? G.clipsOf(d.gun.clip) : [], inMags = cl.reduce((s, m) => s + (m.am || 0), 0), left = G.inv.count(ak) + inMags, noMag = d.gun.clip && !it.mg, k = it.ammo + '/' + left + ak + cl.length + (noMag ? 'n' : '') + (p.reload > 0 ? 'r' : '') + (it.att && it.att.sup ? 's' : ''); if (vals.am !== k) { vals.am = k; $('aN').innerHTML = `${noMag ? '—' : it.ammo}<small>/ ${left}</small>`; $('aW').textContent = p.reload > 0 ? (p.reloadMode === 'swap' ? 'A trocar o carregador' : 'A recarregar') : noMag ? 'Sem carregador' : ITEMS[ak].s + (d.gun.clip ? ' · ' + cl.length + (cl.length === 1 ? ' carregador' : ' carregadores') : '') + (it.att && it.att.sup ? ' · silenc.' : ''); } } else $('ammo').hidden = true;
    $('tReload').hidden = !(d && d.gun) || !!G.car;
    // barra de uso
    const u = p.use || (p.reload > 0 ? { t: p.reloadDur - p.reload, dur: p.reloadDur, rl: true } : null);
    if (u) { $('use').hidden = false; $('use').firstChild.textContent = u.rl ? 'A recarregar' : 'A usar: ' + ITEMS[u.it.k].s; $('use').querySelector('b').style.width = (u.t / u.dur * 100).toFixed(1) + '%'; } else $('use').hidden = true;
    // revistar
    const pr = G.prompt && !G.invOpen && p.alive ? G.prompt : null;
    const lbl = pr ? pr.label + (pr.grid && pr.grid.empty && !pr.bag ? ' · vazio' : '') : '';
    { const T = G.lockT, lk = !!(pr && T && G.base.lockOf(T) && G.base.lockMine(T) && !pr.lockPut); if (vals.lk !== lk) { vals.lk = lk; $('tLock').hidden = !lk; } }
    if (vals.pr !== lbl) { vals.pr = lbl; $('prompt').hidden = !pr; $('tUse').hidden = !pr; if (pr) { $('prompt').lastChild.textContent = lbl; $('tUse').lastChild.textContent = lbl; $('tUse').classList.toggle('door', !!pr.door); } }
    // zona
    const mins = Math.floor((G.tod ?? 0.33) * 1440), hhmm = String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(Math.floor(mins / 10) * 10 % 60).padStart(2, '0');
    const zn = G.ARENA ? { name: 'Arena de Tóquio', sub: 'PvP · Vermelha contra Azul', kind: 'city' } : G.zoneAt(p.x, p.z), wet = (G.rain || 0) > 0.25, zk = (G.inside ? 'i' + G.inside.name : '') + (zn ? zn.name : 'f') + hhmm + wet;
    if (vals.z !== zk) { vals.z = zk; const z = $('zone'); z.className = zn && (zn.kind === 'city' || zn.kind === 'mil') ? 'pvp' : ''; z.innerHTML = `<b>${zn ? zn.name : 'Floresta'} <em style="font-style:normal;color:var(--tx2);font-weight:600;letter-spacing:.02em">${hhmm}${wet ? ' · chuva' : ''}</em></b><span>${G.inside ? 'Dentro: ' + G.inside.name : zn ? zn.sub : 'Recursos · poucos zombies'}</span>`; }
    // mira: na vista de cima, um anel no ponto onde vais acertar (cor da zona); na 4x/8x, a luneta
    const A = G.aimS, gun = d && d.gun, fp = G.fp, fpT = A.fpT || 0;
    const showX = !fp && p.alive && !G.invOpen && (G.TOUCH ? A.on && gun : G.mouse.has);
    if (showX) { const q = G.aimS.Aw && gun && (A.on || !G.TOUCH) ? G.proj(A.Aw) : { x: G.mouse.x, y: G.mouse.y };
      const spr = gun ? gun.spread * (1 - 0.6 * A.steady) * (Math.hypot(p.vx, p.vz) > 0.6 ? 1.7 : 1) : 0.02, dist = Math.hypot(A.A.x - p.x, A.A.z - p.z), r = clamp(spr * dist * (G.pxm || 20), 9, 46);
      xh.hidden = false; xh.style.transform = `translate(${q.x}px,${q.y}px)`; xh.style.setProperty('--r', r.toFixed(1) + 'px'); const zc = gun && A.zone ? 'z-' + A.zone : ''; const cls = (A.raise >= 1 || !gun ? 'up ' : '') + zc; if (xh.className !== cls) xh.className = cls;
      const zl = gun && A.zone ? { head: 'Cabeça', body: 'Corpo', arms: 'Braço', legs: 'Pernas' }[A.zone] : ''; if (vals.zl !== zl) { vals.zl = zl; xh.querySelector('.zl').textContent = zl; } }
    else if (fp && G.fpv.on && p.alive && !G.invOpen && (A.adsT || 0) < 0.35) { // vista livre: mira no centro (com arma, o anel mostra quanto espalha à anca)
      const cx = innerWidth / 2, cy = innerHeight / 2, spr = gun ? gun.spread * (1 - 0.6 * A.steady) * (Math.hypot(p.vx, p.vz) > 0.6 ? 1.5 : 1) : 0, fov = G.fpFov ? G.fpFov() : 70, r = gun ? clamp(spr / Math.tan(fov * Math.PI / 360) * innerHeight / 2, 7, 40) : 0;
      xh.hidden = false; xh.style.transform = `translate(${cx}px,${cy}px)`; xh.style.setProperty('--r', r.toFixed(1) + 'px'); const cls = 'fpx ' + (gun ? (A.raise >= 1 ? 'up ' : '') + (A.zone ? 'z-' + A.zone : '') : 'up mel'); if (xh.className !== cls) xh.className = cls;
      const zl = gun && A.zone ? { head: 'Cabeça', body: 'Corpo', arms: 'Braço', legs: 'Pernas' }[A.zone] : ''; if (vals.zl !== zl) { vals.zl = zl; xh.querySelector('.zl').textContent = zl; } }
    else xh.hidden = true;
    if (!hm.hidden && hitAt) { const q = G.proj(hitAt); hm.style.transform = `translate(${q.x}px,${q.y}px)`; hm.style.visibility = q.ok ? '' : 'hidden'; }
    if (hitT > 0) { hitT -= dt; if (hitT <= 0) hm.hidden = true; }
    ftT -= dt;
    const fvo = !!G.fpv.on, adsT = A.adsT || 0;
    if (fvo ? adsT > 0.001 && fp && p.alive : fpT > 0 && p.alive) { scEl.hidden = false; const R = scopeR(), SC = scopeC(), sm = t => t * t * (3 - 2 * t);
      if (fvo) { const e = sm(adsT), far = Math.hypot(innerWidth, innerHeight), sI = G.scopeItem && G.scopeItem(), mid = !(sI && sI.mag >= 2); scEl.style.setProperty('--cx', (mid ? innerWidth / 2 : SC.x) + 'px'); scEl.style.setProperty('--cy', (mid ? innerHeight / 2 : SC.y) + 'px'); scEl.style.setProperty('--hr', (R + (far - R) * (1 - e)).toFixed(1) + 'px'); scEl.style.setProperty('--ro', e.toFixed(3)); } // na 1.ª pessoa: a luneta fecha à volta do centro
      else if (fp) { const e = sm(clamp((fpT - 0.55) / 0.45, 0, 1)); scEl.style.setProperty('--cx', SC.x + 'px'); scEl.style.setProperty('--cy', SC.y + 'px'); scEl.style.setProperty('--hr', (R * e).toFixed(1) + 'px'); scEl.style.setProperty('--ro', e.toFixed(3)); }
      else { const e = sm(clamp(fpT / 0.55, 0, 1)), q = G.proj(A.A), far = Math.hypot(innerWidth, innerHeight); scEl.style.setProperty('--cx', q.x + 'px'); scEl.style.setProperty('--cy', q.y + 'px'); scEl.style.setProperty('--hr', (far * (1 - e) + 2).toFixed(1) + 'px'); scEl.style.setProperty('--ro', '0'); }
      scEl.style.setProperty('--r', R.toFixed(0) + 'px');
      const sc = G.scopeItem ? G.scopeItem() : it && it.att && it.att.scope ? ITEMS[it.att.scope] : null; const m8 = sc && sc.mag >= 8, rd = !!(sc && sc.rd); scEl.classList.toggle('m8', !!m8); scEl.classList.toggle('rd', rd); scEl.classList.toggle('ir', !!(sc && sc.iron)); scEl.classList.toggle('vm', !!G.vmOn); scEl.classList.toggle('z-head', A.zone === 'head'); setV('scMag', (sc ? sc.mag : 4) + '×'); setV('scDist', A.dist ? Math.round(A.dist) + ' m' : '');
      // zero e marcas de queda (para a munição carregada): cada marca é onde pôr o alvo a 200, 300, 400 m…
      { const zs = $('szero'); zs.hidden = !(gun && sc && fp && !sc.rd); if (!zs.hidden) zs.style.setProperty('--ro', scEl.style.getPropertyValue('--ro')); if (fp) zPlace(SC, R); }
      if (gun && sc && !sc.rd) { const zero = it.zero || (m8 ? 200 : 100), v0 = ITEMS[it.ak || ammoOf(gun)[0]].bal.v * (gun.vk || 1), key = it.ak + v0 + ':' + zero + ':' + sc.mag; setV('scZero', zero + ' m');
        if (vals.hold !== key) { vals.hold = key; const half = (55 / sc.mag / 2) * Math.PI / 180, B = G.ballis, ak = it.ak || ammoOf(gun)[0], e0 = B.elevFor(ak, v0, zero); let h = ''; for (let d = Math.ceil((zero + 1) / 100) * 100; d <= 800; d += 100) { const u = (B.elevFor(ak, v0, d) - e0) / half * 100; if (u > 94) break; if (u < 2) continue; const w = d % 200 ? 4 : 7; h += `<path d="M${-w} ${u.toFixed(2)}H${w}"/>` + (d % 200 ? '' : `<text x="${w + 2}" y="${(u + 2).toFixed(2)}">${d / 100}</text>`); } $('scHold').innerHTML = h; } }
      const br = scEl.querySelector('.breath'); br.classList.toggle('on', A.breathOn || A.breathT > 0.05); $('scBr').style.width = (100 - A.breathT / 4 * 100).toFixed(0) + '%'; }
    else { scEl.hidden = true; $('szero').hidden = true; }
    sugT -= dt; if (sugT <= 0) { sugT = 0.5; const s = suggest(); sugIt = s ? s[0] : null; sugEl.hidden = !s; if (s) { const key = s[0].k + s[1] + s[2]; if (vals.sug !== key) { vals.sug = key; sugEl.querySelector('img').src = G.ICONS[s[0].k]; sugEl.querySelector('span').textContent = s[1] + ' · ' + ITEMS[s[0].k].s; sugEl.classList.toggle('urg', !!s[2]); } } }
    // no carro: sem botões de armas, saltar ou correr
    { const inCar = !!G.car; if (vals.car !== inCar) { vals.car = inCar; for (const id of ['tFire', 'tView', 'tAds', 'tLower', 'tBreath', 'tJump', 'tSprint', 'tCrouch', 'tProne']) $(id).style.visibility = inCar ? 'hidden' : ''; }
    { const st = G.p ? G.p.stance | 0 : 0; if (vals.stc !== st) { vals.stc = st; $('tCrouch').classList.toggle('on', st === 1); $('tProne').classList.toggle('on', st === 2); } }
      const drv = inCar && G.carSeat === 0 && p.alive; { const ha = drv && (VT[G.car.k] || {}).fly && (G.car.alt || 0) > 1; if (vals.ha !== ha) { vals.ha = ha; document.body.classList.toggle('heliAir', !!ha); if (!ha) G.hovSet(false); } } if (vals.drv !== drv) { vals.drv = drv; document.body.classList.toggle('driving', drv); if (!drv) for (const k in G.dIn) G.dIn[k] = 0; document.querySelectorAll('.dv.dn').forEach(e => e.classList.remove('dn')); }
      if (drv) { const fl = (VT[G.car.k] || {}).fly, lb = fl ? (G.car.v > 2.5 ? 'Travar' : (G.car.alt || 0) > 0.3 ? 'Descer' : 'Parado') : G.car.v > 0.5 ? 'Travar' : 'Trás', ub = fl ? ((G.car.alt || 0) < 0.3 && (G.car.rot || 0) < 0.92 ? 'Rotor…' : (G.car.alt || 0) < 0.3 ? 'Levantar' : 'Avançar') : 'Acelerar'; if (vals.dlb !== lb) { vals.dlb = lb; $('dDn').querySelector('em').textContent = lb; } if (vals.dub !== ub) { vals.dub = ub; $('dUp').querySelector('em').textContent = ub; } } }
    // botões das armas
    const fb = $('tFire'), armed = !!gun && A.raise >= 1; if (fb.classList.contains('armed') !== armed) fb.classList.toggle('armed', armed); if (fb.classList.contains('melee') !== !gun) fb.classList.toggle('melee', !gun); { const bk = G.buildK === 'planta' || G.buildK === 'martelo', hk2 = (G.inv.belt[G.sel] || {}).k, bm = hk2 === 'granada' || hk2 === 'c4'; if (fb.classList.contains('build') !== bk) fb.classList.toggle('build', bk); if (fb.classList.contains('boom') !== bm) fb.classList.toggle('boom', bm); }
    const hk = (G.inv.belt[G.sel] || {}).k, fl = G.base.placing() ? 'Colocar' : G.buildK === 'planta' ? 'Construir' : G.buildK === 'martelo' ? 'Melhorar' : hk === 'granada' ? 'Lançar' : hk === 'c4' ? 'Colocar' : gun ? (armed || cfg.quick ? 'Disparar' : A.on ? '' : 'Levantar') : 'Bater'; if (vals.fl !== fl) { vals.fl = fl; fb.querySelector('em').textContent = fl; }
    // olho: 1.ª ou 3.ª pessoa (sempre à mão). «Mira»: só na 1.ª pessoa, com uma arma que tenha mira (de ferro, ponto vermelho ou luneta)
    const fv = !!G.fpv.on, hasSc = !!(gun && G.scopeItem && G.scopeItem()), vb = $('tView'); if (vals.fv !== G.fpFree) { vals.fv = G.fpFree; vb.classList.toggle('on', !!G.fpFree); vb.setAttribute('aria-pressed', G.fpFree ? 'true' : 'false'); vb.querySelector('em').textContent = G.fpFree ? '3.ª pessoa' : '1.ª pessoa'; vb.setAttribute('aria-label', G.fpFree ? 'Passar para a 3.ª pessoa' : 'Passar para a 1.ª pessoa'); }
    $('tAds').hidden = !(fv && hasSc); $('tLower').hidden = !(gun && A.on) || !!G.FP_ONLY; $('tAds').classList.toggle('on', !!A.scope); $('tBreath').hidden = !fp || !A.scope || !!(it && it.att && it.att.scope === 'reddot') || !!(G.scopeItem && G.scopeItem() && G.scopeItem().iron); $('tBreath').classList.toggle('on', !!A.breathOn);
    $('padR').querySelector('.knob').style.visibility = gun || fv ? 'hidden' : ''; if (fp) { $('gR').style.opacity = 0; $('gL').style.opacity = 0; }
    // avisos
    if (toastT > 0) { toastT -= dt; if (toastT <= 0.3) toastEl.style.opacity = Math.max(0, toastT / 0.3); if (toastT <= 0) toastEl.hidden = true; }
    for (const o of SI) if (o.t > 0) { o.t -= dt; o.el.style.opacity = (Math.min(1, o.t / 0.4) * o.a).toFixed(2); }
    $('tLight').classList.toggle('on', G.car && G.carSeat === 0 && G.cars ? G.cars.isLit(G.car) : !!G.lightOn);
    for (let i = feeds.length - 1; i >= 0; i--) { const f = feeds[i]; f.t -= dt; if (f.t < 0.4) f.el.classList.add('out'); if (f.t <= 0) { f.el.remove(); feeds.splice(i, 1); } }
    mmT -= dt; if (mmT <= 0) { mmT = 0.12; drawMini(); }
    if (G.ARENA) { const pr = !!(G.p && G.p.alive && G.p.born != null && G.t - G.p.born < 2.5 && !(G.p.fireT > G.p.born)), el = $('aprot'); if (el.hidden === pr) el.hidden = !pr; if (pr) { const t = 'Protegido ' + (2.5 - (G.t - G.p.born)).toFixed(1).replace('.', ',') + ' s'; if (el.textContent !== t) el.textContent = t; } } // proteção ao nascer (acaba ao disparar)
    if (cmpC && G.p && G.playing) { const a = G.fpv && G.fpv.on && G.aimS && G.aimS.fy != null ? G.aimS.fy : G.p.yaw, hd = bearing(Math.sin(a), Math.cos(a)); const h = drawCompass(cmpC, hd, G.p, G.net && G.net.on ? G.net.mates() : null); if (h !== undefined && h !== cmpLast) { cmpLast = h; cmpT.textContent = String(h).padStart(3, '0') + '° ' + cardOf(h) + ' · ' + gridName(G.p.x, G.p.z); } }
    if (G.invOpen) { G.invT = (G.invT || 0) - dt; if (G.invT <= 0) { G.invT = 0.5; if (tab === 'craft') renderCraft(); } }
  };
  let lastOr = OR();
  const resize = () => { if (OR() !== lastOr) { lastOr = OR(); applyHud(); } if (G.invOpen) { layout(); render(); } };

  // sem scroll em lado nenhum: listas compridas passam a páginas
  pager(body, '.sgrp > *:not(.vis), .sgrp .vis > *');
  pager($('dList'), ':scope > *'); pager($('admB'), ':scope > *');
  fitDrop(pfm, ['.pfb > p', '.pfb .note', '.pfb label small'], () => pfm.querySelector('.pfbox'));
  pager($('recipes'), ':scope > *'); pager($('skl'), ':scope > *'); pager(trB, ':scope > *'); pager(lbB, ':scope > p, .lbt > div:not(.h)');
  return {
    cfgCloud: () => { try { const c = JSON.parse(localStorage.getItem("kurogane-cfg-v1") || "null"); if (c && c.v === cfg.v) { Object.assign(cfg, c); applyAll(); } } catch (e) { } }, // definições que vieram da nuvem
    refresh, openInv, closeInv, toast, note: t => mnote(t), saveCfg, feed, hit, damage, death, toggleMap, frame, resize, safe, scopeR, scopeC,
    arenaAtt: k => AUI.attOf(k), arenaDeath: o => AUI.death(o), arenaFeed: m => AUI.feed(m), arenaScore: m => AUI.score(m), arenaHide: () => AUI.hide(), arenaMenu: () => AUI.menu(), arenaShow: m => AUI.show(m),
    closeDeath: () => { $('dead').hidden = true; clearInterval(dTick); }, sound, bedMenu, codeAsk, codeErr, codeDone, lockMenu, admRole, admList, admOpen, lbShow, lbOpen, trOpen, trRender, trOpenNow: () => !!trT, trWho: () => trT, trClose: () => { trEl.hidden = true; trT = null; },
    showHUD: msg => { $('hud').hidden = false; refresh(); toast(msg); },
    // sair para o menu (com 5 s parado se estiveres em combate)
    toMenu: () => { setTimeout(() => { pfRender(); if (G.ui_count) G.ui_count(); }, 50); if (!pfm.hidden && $('pfT').textContent === 'Clã') pfClose(); $('quit').hidden = true; $('hud').hidden = true; setEl.hidden = true; G.paused = false; closeInv(); $('map').hidden = true; if (G.ARENA) { $('dead').hidden = true; AUI.lobby(); } else showMenu(); },
    quitTick: t => { const q = $('quit'); if (t < 0) { q.hidden = true; return; } q.hidden = false; $('qN').textContent = Math.max(1, Math.ceil(t)); q.style.setProperty('--qp', (1 - t / 5).toFixed(3)); },
    ready: () => { drawOff(); { const t = $('ldP'), b = document.querySelector('#load .bar b'); if (t) t.textContent = '100%'; if (b) b.style.width = '100%'; } $('load').hidden = true; if (G.ARENA) { const a = Conta.ativo(); if (a && a.nome) AUI.lobby(); else askName(false, () => AUI.lobby()); $('bAr').hidden = false; $('mClan').style.display = $('mLb').style.display = 'none'; { const ml = document.querySelector('#map .ml'); if (ml) ml.innerHTML = '<span><i style="background:#F4F1EA"></i>Tu</span><span><i style="background:#6FA8FF"></i>Equipa</span><span><i style="background:#F0594A"></i>Inimigo visto</span><span><i style="background:#b8544a"></i>Partida vermelha</span><span><i style="background:#4a6ab8"></i>Partida azul</span><span><i style="background:#9a7a52"></i>Plataformas</span>'; } for (const id of ['mIn', 'mOut']) if ($(id)) $(id).style.visibility = 'hidden'; } else showMenu(); pfRender(); Conta.conta() && Conta.sincronizar().then(r => { if (r === 'nuvem') { pfRender(); mnote('Trouxemos o teu jogo mais recente da nuvem.'); } }).catch(() => { }); 
      // intro curta (uma vez por sessão; toca para saltar; sem animação se o sistema pedir menos movimento)
      let seen = false; try { seen = sessionStorage.getItem('kgIntro') === '1'; sessionStorage.setItem('kgIntro', '1'); } catch (e) { } if (!seen && !matchMedia('(prefers-reduced-motion: reduce)').matches) { const it = $('intro'); it.hidden = false; const end = () => { it.hidden = true; }; it.onclick = end; setTimeout(end, 2700); } },
  };
}
