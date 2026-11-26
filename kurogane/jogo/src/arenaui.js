// Interface da arena, por passos: 1) equipa, 2) kit (personagem e arma em 3D, setas para mudar, com transição), 3) acessórios.
// Tudo cabe no ecrã sem deslizar (nem para o lado nem para baixo); os botões de baixo estão sempre à vista, acima das barras do telemóvel.
import { ITEMS, attFits } from './items.js';
import { RDP } from './chars.js';
import { ARENA_KITS, ARENA_KIT_ORDER, ARENA_KIT_SVG } from './arena.js';

export function initArenaUI(G, { $, audio, toast }) {
  const el = $('arw'), TN = ['Vermelha', 'Azul'];
  let mode = 'lobby', step = 1, team = null, kit = 'atirador', cd = 0, cdT = null, katt = {}, dir = 1;
  try { const s = JSON.parse(localStorage.getItem('kg.arena') || '{}'); if (s.team === 0 || s.team === 1) team = s.team; if (ARENA_KITS[s.kit]) kit = s.kit; if (s.att && typeof s.att === 'object') katt = s.att; } catch (e) { }
  const keep = () => { try { localStorage.setItem('kg.arena', JSON.stringify({ team, kit, att: katt })); } catch (e) { } };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nm = k => (ITEMS[k] && (ITEMS[k].s || ITEMS[k].n)) || k;
  const guns = k => ARENA_KITS[k].belt.filter(([g]) => ITEMS[g] && ITEMS[g].gun);
  const optsOf = g => { const gd = ITEMS[g].gun, sc = ['reddot', 'mira4', 'mira8'].filter(a => attFits(g, a)); return { scope: sc.length ? (RDP[g] ? ['iron'] : ['nada']).concat(sc) : null, sup: !!gd.sup, light: !!gd.light }; };
  const curAtt = (k, g, a0) => { const c = katt[k] && katt[k][g]; if (c) return c; const d = a0 || {}; return { scope: d.scope || (RDP[g] ? 'iron' : 'nada'), sup: !!d.sup, light: !!d.light }; };
  const attOf = k => { const o = {}; for (const [g, a0] of guns(k)) o[g] = curAtt(k, g, a0); return o; };
  const hasAtt = k => guns(k).some(([g]) => { const o = optsOf(g); return o.scope || o.sup || o.light; });
  const SCN = { iron: 'Ferro', nada: 'Sem mira', reddot: 'Holográfica', mira4: '4×', mira8: '8×' };
  const lines = k => { const K = ARENA_KITS[k], L = [];
    for (const [g, a] of K.belt) { const d = ITEMS[g]; if (!d) continue; if (d.gun) { const c = curAtt(k, g, a), at = [c.scope && c.scope !== 'iron' && c.scope !== 'nada' ? nm(c.scope) : '', c.sup ? 'silenc.' : '', c.light ? 'lanterna' : ''].filter(Boolean).join(', '); L.push(nm(g) + (at ? ' · ' + at : '')); } else L.push((a > 1 ? a + ' × ' : '') + nm(g)); }
    const prot = [K.head && 'capacete', K.vest && 'colete'].filter(Boolean); if (prot.length) L.push(prot.join(' e ').replace(/^./, c => c.toUpperCase()));
    const mags = K.bag.filter(([c]) => ITEMS[c] && ITEMS[c].clip).reduce((s, [, n]) => s + n, 0), loose = K.bag.filter(([c]) => ITEMS[c] && !ITEMS[c].clip).map(([c, n]) => n + ' × ' + nm(c));
    if (mags) L.push(mags + (mags === 1 ? ' carregador' : ' carregadores')); if (loose.length) L.push(loose.join(' · '));
    return L; };
  const n = () => (G.net && G.net.arena && G.net.arena.n) || [0, 0];
  const sc = () => (G.net && G.net.arena && G.net.arena.s) || [0, 0];
  // arma principal do kit (a que aparece em 3D) com os acessórios escolhidos
  const prevGun = () => { const g0 = guns(kit)[0]; if (!g0) return ['', {}]; const c = curAtt(kit, g0[0], g0[1]); return [g0[0], { scope: c.scope && c.scope !== 'iron' && c.scope !== 'nada' ? c.scope : null, sup: c.sup ? ITEMS[g0[0]].gun.sup : null, light: c.light ? 'lantArma' : null }]; };

  // esqueleto fixo (o canvas 3D não se recria): cabeçalho, palco, informação, barra de botões
  el.innerHTML = `<div class="aw">
    <div class="ah"><div class="aht"><b class="cond aT">Arena de Tóquio</b><span class="asc2"></span></div><ol class="asteps" aria-label="Passos"><li data-s="1"><i>1</i>Equipa</li><li data-s="2"><i>2</i>Kit</li><li data-s="3"><i>3</i>Acessórios</li></ol><button class="close" id="arX" aria-label="Fechar" hidden></button></div>
    <div class="am">
      <div class="ap1"></div>
      <div class="ap2">
        <div class="astage"><canvas id="arPrev" aria-label="A personagem com a arma do kit"></canvas>
          <button class="aarr l" id="arPrevK" aria-label="Kit anterior"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>
          <button class="aarr r" id="arNextK" aria-label="Kit seguinte"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button>
          <div class="adots" aria-hidden="true">${ARENA_KIT_ORDER.map(k => `<i data-k="${k}"></i>`).join('')}</div></div>
        <div class="ainfo" aria-live="polite"></div>
      </div>
    </div>
    <div class="af"><button class="btn" id="arBack"></button><button class="btn pri" id="arGo"></button></div></div>`;
  $('arX').innerHTML = $('mClose') ? $('mClose').innerHTML : '×';
  const cv = $('arPrev'), info = el.querySelector('.ainfo'), p1 = el.querySelector('.ap1'), stage = el.querySelector('.astage');

  const goLabel = () => mode === 'dead' ? (cd > 0 ? 'Renascer (' + cd + ')' : 'Renascer') : mode === 'menu' ? 'Voltar ao jogo' : step === 1 ? 'Escolher o kit' : 'Entrar na arena';
  const render = anim => {
    const s = sc(), N = n(), dead = mode === 'dead';
    el.querySelector('.aT').textContent = dead ? (G.arenaBy ? 'Morto por ' + G.arenaBy : 'Morreste') : 'Arena de Tóquio';
    el.querySelector('.asc2').innerHTML = `<i class="r">${s[0]}</i><em>baixas</em><i class="b">${s[1]}</i>`;
    el.querySelectorAll('.asteps li').forEach(li => { const k = +li.dataset.s; li.className = k === step ? 'on' : k < step ? 'done' : ''; li.style.display = k === 3 && !hasAtt(kit) ? 'none' : ''; });
    $('arX').hidden = false; $('arX').setAttribute('aria-label', mode === 'menu' ? 'Fechar' : 'Sair da arena'); $('arX').title = mode === 'menu' ? 'Fechar' : 'Sair da arena'; el.dataset.step = step;
    if (step === 1) p1.innerHTML = `<div class="ateams">${[0, 1].map(t => `<button class="atm t${t}${team === t ? ' on' : ''}" data-t="${t}" aria-pressed="${team === t}"><b>${TN[t]}</b><span>${t ? 'Nasces a este' : 'Nasces a oeste'}</span><em>${G.net && G.net.on ? N[t] + ' ' + (N[t] === 1 ? 'jogador' : 'jogadores') : ''}</em></button>`).join('')}</div><p class="ahelp">Os colegas de equipa aparecem a azul e não lhes acertas.</p>`;
    const K = ARENA_KITS[kit];
    if (step === 2) info.innerHTML = `<div class="akh"><span class="aks">${ARENA_KIT_SVG[kit]}</span><div><b>${esc(K.n)}</b><em>${ARENA_KIT_ORDER.indexOf(kit) + 1} de ${ARENA_KIT_ORDER.length}${mode === 'menu' ? ' · conta ao renasceres' : ''}</em></div></div><p class="akd">${esc(K.d)}</p><ul class="akl2">${lines(kit).map(l => '<li>' + esc(l) + '</li>').join('')}</ul>`;
    else if (step === 3) info.innerHTML = `<div class="akh"><span class="aks">${ARENA_KIT_SVG[kit]}</span><div><b>Acessórios</b><em>kit ${esc(K.n)}</em></div></div>` + guns(kit).map(([g, a0]) => { const o = optsOf(g), c = curAtt(kit, g, a0), chip = (f, v, lb, on) => `<button class="ach${on ? ' on' : ''}" data-g="${g}" data-f="${f}" data-v="${v}" aria-pressed="${!!on}">${lb}</button>`;
      if (!o.scope && !o.sup && !o.light) return ''; return `<div class="arow"><b>${esc(nm(g))}</b><div class="achs">${o.scope ? o.scope.map(v => chip('scope', v, SCN[v], c.scope === v)).join('') : ''}${o.sup ? chip('sup', c.sup ? 0 : 1, 'Silenciador', c.sup) : ''}${o.light ? chip('light', c.light ? 0 : 1, 'Lanterna', c.light) : ''}</div></div>`; }).join('');
    el.querySelectorAll('.adots i').forEach(i => i.className = i.dataset.k === kit ? 'on' : '');
    // barra de baixo: «voltar» do passo e o botão principal (no kit há também «Acessórios»)
    const bk = $('arBack'); bk.textContent = step === 1 ? 'Sair da arena' : step === 2 ? 'Equipa' : 'Kit';
    let ab = el.querySelector('#arAtt'); if (step === 2 && hasAtt(kit)) { if (!ab) { ab = document.createElement('button'); ab.className = 'btn'; ab.id = 'arAtt'; ab.textContent = 'Acessórios'; $('arGo').before(ab); } } else if (ab) ab.remove();
    const go = $('arGo'); go.textContent = goLabel(); go.disabled = (step === 1 && team == null) || (dead && cd > 0);
    if (step >= 2) { G.arenaPrev.mount(cv); G.arenaPrev.start(); const [g, a] = prevGun();
      if (anim) { stage.classList.remove('in', 'fwd', 'bwd'); stage.classList.add('out', dir > 0 ? 'fwd' : 'bwd'); setTimeout(() => { G.arenaPrev.set(g, a); stage.classList.remove('out'); void stage.offsetWidth; stage.classList.add('in'); }, 170); info.classList.remove('swap'); void info.offsetWidth; info.classList.add('swap'); }
      else G.arenaPrev.set(g, a); }
    else G.arenaPrev.stop();
  };
  const show = m => { mode = m; step = m === 'lobby' && team == null ? 1 : 2; el.hidden = false; render(); };
  const hide = () => { el.hidden = true; clearInterval(cdT); cdT = null; G.arenaPrev.stop(); };
  const setKit = (k, d) => { if (k === kit) return; dir = d; kit = k; keep(); if (G.playing) G.arenaKitSet(kit); audio.play('ui'); if (step === 3 && !hasAtt(kit)) step = 2; render(true); };
  const stepKit = d => { const i = ARENA_KIT_ORDER.indexOf(kit), L = ARENA_KIT_ORDER.length; setKit(ARENA_KIT_ORDER[(i + d + L) % L], d); };
  // deslizar o dedo depressa no palco muda de kit; devagar roda a personagem
  { let sx = 0, st = 0; cv.addEventListener('pointerdown', e => { sx = e.clientX; st = performance.now(); }); cv.addEventListener('pointerup', e => { const dx = e.clientX - sx, t = performance.now() - st; if (t < 280 && Math.abs(dx) > 60 && step === 2) stepKit(dx < 0 ? 1 : -1); }); }
  el.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'arPrevK') { stepKit(-1); return; } if (b.id === 'arNextK') { stepKit(1); return; }
    audio.play('ui');
    if (b.dataset.t != null) { const t = +b.dataset.t; if (mode !== 'lobby' && t !== team) { team = t; G.arenaTeamSet(t); toast('Mudaste para a equipa ' + TN[t]); } else team = t; keep(); step = 2; dir = 1; render(true); return; }
    if (b.dataset.f) { const g = b.dataset.g, f = b.dataset.f, a0 = (guns(kit).find(([x]) => x === g) || [])[1]; katt[kit] = katt[kit] || {}; const c = { ...curAtt(kit, g, a0) }; c[f] = f === 'scope' ? b.dataset.v : b.dataset.v === '1'; katt[kit][g] = c; keep(); if (G.playing) G.arenaKitSet(kit); render(); return; }
    if (b.id === 'arAtt') { step = 3; render(); return; }
    if (b.id === 'arX') { if (mode === 'menu') { hide(); return; } try { sessionStorage.removeItem('kgArena'); } catch (e) { } G.updating = true; location.reload(); return; }
    if (b.id === 'arBack') { if (step > 1) { step--; render(); return; } try { sessionStorage.removeItem('kgArena'); } catch (e) { } G.updating = true; location.reload(); return; }
    if (b.id === 'arGo') { if (b.disabled) return; if (step === 1) { if (team == null) return; step = 2; dir = 1; render(true); return; }
      if (mode === 'lobby') { hide(); G.arenaStart(team, kit); } else if (mode === 'dead') { if (cd > 0) return; hide(); G.arenaKitK = kit; G.arenaRespawn(); } else hide(); } });
  addEventListener('keydown', e => { if (el.hidden) return; if (e.key === 'ArrowLeft' && step === 2) stepKit(-1); else if (e.key === 'ArrowRight' && step === 2) stepKit(1); else if (e.key === 'Enter') $('arGo').click(); });
  // placar no ecrã e mortes ao vivo
  const sEl = $('asc'), fEl = $('akf');
  const score = m => { if (!m) return; const s = m.s || [0, 0]; sEl.hidden = false; sEl.innerHTML = `<i class="r">${s[0]}</i><span>Vermelha · Azul</span><i class="b">${s[1]}</i>`; if (!el.hidden) { el.querySelector('.asc2').innerHTML = `<i class="r">${s[0]}</i><em>baixas</em><i class="b">${s[1]}</i>`; if (step === 1) render(); } };
  const feed = m => { const d = document.createElement('div'); d.className = 'akl'; d.innerHTML = (m.k ? `<b class="t${m.kt}">${esc(m.k)}</b><span>${m.w === 'granada' ? 'granada em' : 'abateu'}</span>` : '') + `<b class="t${m.vt}">${esc(m.v)}</b>` + (m.k ? '' : '<span>morreu</span>'); fEl.prepend(d); while (fEl.children.length > 5) fEl.lastChild.remove(); setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 400); }, 5000); };
  const death = o => { G.arenaBy = o && o.by; cd = 4; show('dead'); clearInterval(cdT); cdT = setInterval(() => { cd--; if (cd <= 0) { clearInterval(cdT); cdT = null; } if (mode === 'dead' && !el.hidden) { const b = $('arGo'); b.textContent = goLabel(); b.disabled = cd > 0; } }, 1000); };
  return { attOf, show, hide, score, feed, death, lobby: () => show('lobby'), menu: () => show('menu'), team: () => team, kit: () => kit };
}
