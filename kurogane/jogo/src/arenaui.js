// Interface da arena: escolher equipa e kit (com o que cada kit traz), placar, mortes ao vivo e o ecrã de quando morres.
import { ITEMS, attFits } from './items.js';
import { RDP } from './chars.js';
import { ARENA_KITS, ARENA_KIT_ORDER, ARENA_KIT_SVG } from './arena.js';

export function initArenaUI(G, { $, audio, toast }) {
  const el = $('arw'), TN = ['Vermelha', 'Azul'];
  let mode = 'lobby', team = null, kit = null, cd = 0, cdT = null, katt = {};
  try { const s = JSON.parse(localStorage.getItem('kg.arena') || '{}'); if (s.team === 0 || s.team === 1) team = s.team; if (ARENA_KITS[s.kit]) kit = s.kit; if (s.att && typeof s.att === 'object') katt = s.att; } catch (e) { }
  kit = kit || 'atirador';
  const keep = () => { try { localStorage.setItem('kg.arena', JSON.stringify({ team, kit, att: katt })); } catch (e) { } };
  const nm = k => (ITEMS[k] && (ITEMS[k].s || ITEMS[k].n)) || k;
  // o que o kit traz, em linhas curtas (para a pré-visualização)
  const lines = k => { const K = ARENA_KITS[k], L = [];
    for (const [g, a] of K.belt) { const d = ITEMS[g]; if (!d) continue; if (d.gun) { const c = curAtt(k, g, a), at = [c.scope && c.scope !== 'iron' && c.scope !== 'nada' ? nm(c.scope) : '', c.sup ? 'silenc.' : '', c.light ? 'lanterna' : ''].filter(Boolean).join(', '); L.push(nm(g) + (at ? ' · ' + at : '')); } else L.push((a > 1 ? a + ' × ' : '') + nm(g)); }
    const prot = [K.head && 'capacete', K.vest && 'colete'].filter(Boolean); if (prot.length) L.push(prot.join(' e ').replace(/^./, c => c.toUpperCase()));
    const mags = K.bag.filter(([c]) => ITEMS[c] && ITEMS[c].clip).reduce((s, [, n]) => s + n, 0), loose = K.bag.filter(([c]) => ITEMS[c] && !ITEMS[c].clip).map(([c, n]) => n + ' × ' + nm(c));
    if (mags) L.push(mags + (mags === 1 ? ' carregador' : ' carregadores') + (loose.length ? ' · ' + loose.join(' · ') : '')); else if (loose.length) L.push(loose.join(' · '));
    return L; };
  const guns = k => ARENA_KITS[k].belt.filter(([g]) => ITEMS[g] && ITEMS[g].gun);
  const optsOf = g => { const gd = ITEMS[g].gun, sc = ['reddot', 'mira4', 'mira8'].filter(a => attFits(g, a)); return { scope: sc.length ? (RDP[g] ? ['iron'] : ['nada']).concat(sc) : null, sup: !!gd.sup, light: !!gd.light }; };
  const curAtt = (k, g, a0) => { const c = katt[k] && katt[k][g]; if (c) return c; const d = a0 || {}; return { scope: d.scope || (RDP[g] ? 'iron' : 'nada'), sup: !!d.sup, light: !!d.light }; };
  const attOf = k => { const o = {}; for (const [g, a0] of guns(k)) o[g] = curAtt(k, g, a0); return o; };
  const SCN = { iron: 'Ferro', nada: 'Sem mira', reddot: 'Ponto vermelho', mira4: '4×', mira8: '8×' };
  const attHTML = () => { const rows = guns(kit).map(([g, a0]) => { const o = optsOf(g), c = curAtt(kit, g, a0), chip = (f, v, lb, on) => `<button class="ach${on ? ' on' : ''}" data-g="${g}" data-f="${f}" data-v="${v}" aria-pressed="${!!on}">${lb}</button>`;
      if (!o.scope && !o.sup && !o.light) return ''; return `<div class="arow"><b>${esc(nm(g))}</b><div class="achs">${o.scope ? o.scope.map(v => chip('scope', v, SCN[v], c.scope === v)).join('') : ''}${o.sup ? chip('sup', c.sup ? 0 : 1, 'Silenciador', c.sup) : ''}${o.light ? chip('light', c.light ? 0 : 1, 'Lanterna', c.light) : ''}</div></div>`; }).join('');
    return rows ? `<div class="aatt"><em>Acessórios do kit ${esc(ARENA_KITS[kit].n)}</em>${rows}</div>` : ''; };
  const n = () => (G.net && G.net.arena && G.net.arena.n) || [0, 0];
  const render = () => {
    const sc = (G.net && G.net.arena && G.net.arena.s) || [0, 0], N = n(), dead = mode === 'dead';
    const head = dead ? `<b class="cond aT">${G.arenaBy ? 'Morto por ' + esc(G.arenaBy) : 'Morreste'}</b>` : `<b class="cond aT">Arena de Tóquio</b>`;
    el.innerHTML = `<div class="abox"><div class="ah">${head}<span class="asc2"><i class="r">${sc[0]}</i><em>baixas</em><i class="b">${sc[1]}</i></span>${mode === 'menu' ? '<button class="close" id="arX" aria-label="Fechar">' + ($('mClose') ? $('mClose').innerHTML : '×') + '</button>' : ''}</div>
      <div class="ateams">${[0, 1].map(t => `<button class="atm t${t}${team === t ? ' on' : ''}" data-t="${t}"><b>${TN[t]}</b><em>${G.net && G.net.on ? N[t] + ' ' + (N[t] === 1 ? 'jogador' : 'jogadores') : t ? 'Este' : 'Oeste'}</em></button>`).join('')}</div>
      <div class="akits">${ARENA_KIT_ORDER.map(k => `<button class="akit${kit === k ? ' on' : ''}" data-k="${k}" aria-pressed="${kit === k}"><span class="aks">${ARENA_KIT_SVG[k]}</span><b>${ARENA_KITS[k].n}</b><ul>${lines(k).map(l => '<li>' + esc(l) + '</li>').join('')}</ul></button>`).join('')}</div>
      ${attHTML()}
      <p class="akd">${esc(ARENA_KITS[kit].d)}${mode === 'menu' ? ' O kit novo fica para quando voltares a nascer.' : ''}</p>
      <div class="aft"><button class="btn sm" id="arLeave">Sair da arena</button><button class="btn pri" id="arGo"${team == null ? ' disabled' : ''}>${mode === 'lobby' ? (team == null ? 'Escolhe a equipa' : 'Entrar na arena') : mode === 'dead' ? (cd > 0 ? 'Renascer (' + cd + ')' : 'Renascer') : 'Voltar ao jogo'}</button></div></div>`;
  };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const show = m => { mode = m; el.hidden = false; render(); };
  const hide = () => { el.hidden = true; clearInterval(cdT); cdT = null; };
  el.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; audio.play('ui');
    if (b.dataset.t != null) { const t = +b.dataset.t; if (mode === 'menu' || mode === 'dead') { if (t !== team) { team = t; G.arenaTeamSet(t); toast('Mudaste para a equipa ' + TN[t]); if (mode === 'menu') hide(); } } else team = t; keep(); if (!el.hidden) render(); return; }
    if (b.dataset.f) { const g = b.dataset.g, f = b.dataset.f, a0 = (guns(kit).find(([x]) => x === g) || [])[1]; katt[kit] = katt[kit] || {}; const c = { ...curAtt(kit, g, a0) }; c[f] = f === 'scope' ? b.dataset.v : b.dataset.v === '1'; katt[kit][g] = c; keep(); if (G.playing) G.arenaKitSet(kit); render(); return; }
    if (b.dataset.k) { kit = b.dataset.k; keep(); if (G.playing) G.arenaKitSet(kit); render(); return; }
    if (b.id === 'arX') { hide(); return; }
    if (b.id === 'arLeave') { try { sessionStorage.removeItem('kgArena'); } catch (e) { } G.updating = true; location.reload(); return; }
    if (b.id === 'arGo') { if (team == null) return; if (mode === 'lobby') { hide(); G.arenaStart(team, kit); } else if (mode === 'dead') { if (cd > 0) return; hide(); G.arenaKitK = kit; G.arenaRespawn(); } else hide(); } });
  // placar no ecrã e mortes ao vivo
  const sEl = $('asc'), fEl = $('akf');
  const score = m => { if (!m) return; const s = m.s || [0, 0]; sEl.hidden = false; sEl.innerHTML = `<i class="r">${s[0]}</i><span>Vermelha · Azul</span><i class="b">${s[1]}</i>`; if (!el.hidden && mode !== 'dead') render(); else if (!el.hidden) { const a = el.querySelector('.asc2'); if (a) a.innerHTML = `<i class="r">${s[0]}</i><em>baixas</em><i class="b">${s[1]}</i>`; } };
  const feed = m => { const d = document.createElement('div'); d.className = 'akl'; const W = m.w && ITEMS[m.w] ? '' : ''; d.innerHTML = (m.k ? `<b class="t${m.kt}">${esc(m.k)}</b><span>${m.w === 'queda' ? 'empurrou' : 'abateu'}</span>` : '') + `<b class="t${m.vt}">${esc(m.v)}</b>` + (m.k ? '' : '<span>morreu</span>') + W; fEl.prepend(d); while (fEl.children.length > 5) fEl.lastChild.remove(); setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 400); }, 5000); };
  const death = o => { G.arenaBy = o && o.by; cd = 4; show('dead'); clearInterval(cdT); cdT = setInterval(() => { cd--; if (cd <= 0) { clearInterval(cdT); cdT = null; } if (mode === 'dead' && !el.hidden) { const b = $('arGo'); if (b) b.textContent = cd > 0 ? 'Renascer (' + cd + ')' : 'Renascer'; } }, 1000); };
  return { attOf, show, hide, score, feed, death, lobby: () => show('lobby'), menu: () => show('menu'), team: () => team, kit: () => kit };
}
