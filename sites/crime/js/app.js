// Jogo de crime: interface. O servidor decide tudo; aqui só se mostra e se pede.

import { t, tv, list, errText, setLang, lang, guessLang } from './i18n.js';
import { h, icon, svg, setLocale, num, money, moneyShort, short, dur, hoursText, pct, rid } from './ui.js';
import * as fx from './fx.js';
import * as C3 from './casino3d.js';
import * as GL from './globo.js';

const $app = document.getElementById('app');
const S = {
  cfg: null, st: null, off: 0, tab: 'city', fightSeg: 'targets', robK: null, report: null, avOk: false, clsPick: null,
  targets: null, ranking: null, events: null, lastEventSeen: 0, hud: {}, queue: Promise.resolve(), pending: 0,
};
const store = {
  get(k, d) { try { const v = localStorage.getItem('cr.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('cr.' + k, JSON.stringify(v)); } catch {} },
};
const now = () => Date.now() + S.off;

// ---------- pedidos ----------
async function api(method, path, body) {
  let r;
  try {
    r = await fetch(path, { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  } catch {
    toast(t('offline'), true);
    throw new Error('OFFLINE');
  }
  let data = {};
  try { data = await r.json(); } catch {}
  if (data.now) S.off = data.now - Date.now();
  if (r.status === 401 && path !== '/api/login') { S.st = null; showLanding(); throw Object.assign(new Error('LOGIN'), { code: 'LOGIN_REQUIRED' }); }
  if (!r.ok) throw Object.assign(new Error(data.error || 'ERR'), { code: data.error || 'default', data });
  return data;
}

function toast(msg, bad) {
  document.querySelectorAll('.toast').forEach((e) => e.remove());
  const el = h('div', { class: 'toast' + (bad ? ' bad' : ''), role: 'status' }, msg);
  document.body.appendChild(el);
  setTimeout(() => { const a = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250 }); a.onfinish = () => el.remove(); }, 2600);
}

// as ações vão em fila, uma de cada vez, pela ordem dos toques
function act(type, args = {}, opts = {}) {
  const job = type === 'crime' || type === 'crimeAll';
  if (job) {
    if (S.crimeBusy) return Promise.resolve(null);   // um golpe de cada vez: o cartão mostra que está a decorrer
    S.crimeBusy = true;
    opts.el?.classList.add('go'); fx.sfx('tap');
  } else if (S.pending >= 4) return Promise.resolve(null);
  S.pending++;
  const p = S.queue.then(async () => {
    const before = S.st?.me, started = performance.now();
    try {
      const out = await api('POST', '/api/act', { type, ...args, rid: rid() });
      if (job) { const wait = fx.dur(type === 'crimeAll' ? 650 : 380) - (performance.now() - started); if (wait > 0) await new Promise((r) => setTimeout(r, wait)); }
      S.st.me = out.me; S.stAt = now(); if (out.feed) S.feed = out.feed;
      react(type, out, before, { ...opts, args });
      return out;
    } catch (e) {
      if (e.data?.me) { S.st.me = e.data.me; S.stAt = now(); }
      if (e.code && e.code !== 'LOGIN_REQUIRED') { toast(errText(e.code), true); fx.vibrate([30, 40, 30]); }
      render();
      return null;
    } finally { S.pending--; if (job) S.crimeBusy = false; }
  });
  S.queue = p.catch(() => {});
  return p;
}

// ---------- o que acontece depois de cada ação ----------
function react(type, out, before, opts) {
  const r = out.result, me = out.me, lv = r.levelUp && r.levelUp.to > r.levelUp.from ? r.levelUp : null;
  if (type === 'crime' || type === 'crimeAll') {
    const k = opts.args.k;
    S.report = { k, r, c: S.cfg.crimes[k], lv, at: now(), unlocked: [] };
    if (before) me.crimes.forEach((x, i) => { if (x.unlocked && !before.crimes[i].unlocked) S.report.unlocked.push(i); });
    const ok = r.all ? r.wins > 0 : r.success, crit = r.all ? r.crits > 0 : r.crit;
    fx.vibrate(r.busted ? [40, 60, 40] : ok ? 12 : 30); fx.sfx(r.busted ? 'bust' : ok ? (crit ? 'crit' : 'cash') : 'fail');
  } else if (type === 'drug') fx.sfx('refill');
  else if (type === 'house') { toast(t('houseMoved', { x: list('houses')[me.house], n: r.respect })); fx.sfx('claim'); }
  else if (type === 'hooker') { fx.sfx('refill'); if (r.sick) { toast(t('gotSick'), true); fx.vibrate([40, 60, 40]); } }
  else if (type === 'claim') { toast(t('got', { m: money(r.cash) })); fx.sfx('claim'); }
  else if (type === 'collect') {
    let total = 0, lost = 0;
    for (const it of r.items) { total += it.money; lost += it.lost; }
    // contentores: diz-se o que chegou (com o lucro) e o que a polícia apreendeu, com os valores
    let back = 0, sent = 0, gone = 0;
    for (const c of r.port) { if (c.seized) gone += c.amount; else { back += c.got; sent += c.amount; } }
    if (total > 0) { toast(t('got', { m: money(total) })); fx.sfx('cash'); }
    if (back > 0) { toast(t('portBack', { m: money(back), g: money(back - sent) })); fx.sfx('cash'); }
    if (lost > 0) toast(t('raided', { m: money(lost) }), true);
    if (gone > 0) { toast(t('portGone', { m: money(gone) }), true); fx.sfx('fail'); }
    if (r.port.length) S.portLast = r.port;
  } else if (type === 'attack') {
    fx.sfx('hit');
    fx.fight(me.name, out.target.name, r.win, r.win ? (r.mode === 'mug' ? '+' + money(r.money) + ' · +' + r.respect : '+' + r.respect + ' ' + t('respect').toLowerCase()) : '−' + Math.abs(r.respect) + ' ' + t('respect').toLowerCase(), { win: t('youWon'), lose: t('youLost') });
    S.targets = null; loadTargets();
  } else if (type === 'tableBet') fx.sfx('deal');
  else if (type !== 'train' && type !== 'tableClear') fx.sfx('buy');
  if (type === 'crime' || type === 'crimeAll') requestAnimationFrame(showReport);
  if (lv) { skyline(lv.to); if (type !== 'crime' && type !== 'crimeAll') toast(t('r_lvl', { n: lv.to, x: list('titles')[lv.to - 1] })); }
  render();
}

// o resultado do golpe tem de se ver sem procurar: se ficou abaixo do ecrã (ex.: prisão por cima), desce até ele
function showReport() {
  const el = document.querySelector('.report'); if (!el) return;
  const bar = document.querySelector('.tabs'), bottom = innerHeight - (bar ? bar.getBoundingClientRect().height : 0) - 12;
  const r = el.getBoundingClientRect(), need = Math.min(r.bottom - bottom, r.top - 70);
  if (need > 0) window.scrollBy({ top: need, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

// ---------- tempo real no cliente (só para mostrar) ----------
function live(me) {
  const n = now();
  const E = S.cfg.energy, A = S.cfg.addiction;
  let energy = me.energy, nextE = null;
  if (energy < E.max) {
    const ticks = Math.floor((n - me.energyT) / E.regenMs);
    energy = Math.min(E.max, energy + Math.max(0, ticks));
    if (energy < E.max) nextE = me.energyT + (Math.max(0, ticks) + 1) * E.regenMs - n;
  }
  let vice = me.addiction;
  if (vice > 0) vice = Math.max(0, vice - Math.max(0, Math.floor((n - me.addictionT) / A.decayMs)));
  return { energy, nextE, vice, jail: me.jailUntil > n ? me.jailUntil - n : 0, hosp: me.hospUntil > n ? me.hospUntil - n : 0 };
}
function storedNow(b, i) {
  const cap = b.perH * (S.cfg.storageMs / 3600000);
  const extra = Math.floor(b.perH * Math.max(0, now() - S.stAt) / 3600000);
  return Math.min(cap, b.stored + extra);
}

// ---------- topo ----------
function buildHud() {
  const me = S.st.me;
  const ring = svg('svg', { class: 'ring', viewBox: '0 0 48 48' });
  const C = 2 * Math.PI * 21;
  ring.append(svg('circle', { class: 'bg', cx: 24, cy: 24, r: 21, fill: 'none', 'stroke-width': 4 }),
    S.hud.ringFg = svg('circle', { class: 'fg', cx: 24, cy: 24, r: 21, fill: 'none', 'stroke-width': 4, 'stroke-linecap': 'round', 'stroke-dasharray': C, 'stroke-dashoffset': C }));
  S.hud.C = C;
  S.hud.lvl = h('span', { class: 'num' });
  S.hud.title = h('div', { class: 'title' });
  S.hud.name = h('div', { class: 'name' });
  S.hud.cash = h('div', { class: 'cash num' });
  S.hud.respN = h('span', { class: 'num' });
  S.hud.resp = h('div', { class: 'resp' }, icon('crown'), S.hud.respN);
  S.hud.ebar = h('i'); S.hud.etxt = h('span');
  S.hud.vbar = h('i'); S.hud.vtxt = h('span');
  S.hud.stats = h('div', { class: 'hstats' });
  S.hud.fx = h('div', { class: 'hfx' });
  S.hud.av = S.avOk ? h('img', { class: 'av', alt: '', width: 96, height: 96 }) : null;
  const hud = h('header', { class: 'hud' },
    h('div', { class: 'hud-top' },
      h('button', { class: 'badge' + (S.hud.av ? ' hasav' : ''), 'aria-label': t('profile'), on: { click: openProfile } }, ring, S.hud.av, S.hud.lvl),
      h('div', { class: 'who' }, S.hud.title, S.hud.name),
      h('div', { class: 'money' }, S.hud.cash, S.hud.resp)),
    h('div', { class: 'hbars' },
      h('button', { class: 'sbar en', 'aria-label': t('p_club'), on: { click: () => go('club') } }, S.hud.ebar, S.hud.etxt),
      h('button', { class: 'sbar vi', 'aria-label': t('p_hosp'), on: { click: () => go('hosp') } }, S.hud.vbar, S.hud.vtxt)),
    S.hud.stats, S.hud.fx);
  S.hud.shown = { cash: me.cash, respect: me.respect };
  return hud;
}

const STAT_IC = { F: 'fist', I: 'brain', C: 'chat', T: 'shield' };
const FX_IC = { F: 'fist', I: 'brain', C: 'chat', T: 'shield', loot: 'cash', biz: 'empire', bust: 'lock' };
const AV = (i) => `/img/av/${i}.webp?1`;
const fxText = (f) => t('fx_' + f.k, { p: f.bp / 100 });
function fxChip(f) { return h('span', { class: 'chip fxc' }, icon(FX_IC[f.k]), fxText(f) + ' · ', h('b', { class: 'num', dataset: { left: f.until } }, dur(f.until - now()))); }
// mostra ao lado do número quanto subiu ou desceu
function delta(el, d, fmt) {
  if (!el || !d) return;
  el.classList.remove('up', 'down'); void el.offsetWidth; el.classList.add(d > 0 ? 'up' : 'down');
  const chip = h('span', { class: 'delta ' + (d > 0 ? 'up' : 'down') + (el === S.hud.resp ? ' r2' : '') }, (d > 0 ? '+' : '−') + fmt(Math.abs(d)));
  el.parentNode.appendChild(chip); setTimeout(() => chip.remove(), 1400);
}

function updateHud() {
  const me = S.st.me; if (!me || !S.hud.cash) return;
  const L = me.level;
  S.hud.lvl.textContent = L;
  S.hud.title.textContent = list('titles')[L - 1];
  S.hud.name.textContent = me.name + (me.cls ? ' · ' + t('cl_' + me.cls) : '') + (S.st.rank ? ' · #' + S.st.rank : '');
  const span = me.levelTo ? (me.levelTo - me.levelFrom) : 1;
  const prog = me.levelTo ? Math.min(1, Math.max(0, (me.peakRespect - me.levelFrom) / span)) : 1;
  S.hud.ringFg.setAttribute('stroke-dashoffset', String(S.hud.C * (1 - prog)));
  if (S.hud.av && S.hud.av.dataset.i !== String(me.av)) { S.hud.av.dataset.i = me.av; S.hud.av.src = AV(me.av); }
  S.hud.fx.replaceChildren(me.sick ? h('button', { class: 'chip fxc bad', on: { click: () => go('hosp') } }, icon('skull'), t('sickChip', { p: S.cfg.hookers.sickCutBp / 100 })) : '', ...me.fx.map(fxChip)); S.hud.fx.style.display = me.fx.length || me.sick ? '' : 'none';
  S.hud.stats.replaceChildren(...['F', 'I', 'C', 'T'].map((s) => h('span', { title: t('stat' + s) }, icon(STAT_IC[s]), h('b', { class: 'num' }, short(me.stats[s])))),
    h('span', { class: 'nx' }, me.levelTo ? t('toLevel', { n: num(me.levelTo - me.peakRespect), l: L + 1 }) : t('maxLevel')));
  const sh = S.hud.shown;
  if (sh.cash !== me.cash) { fx.roll(S.hud.cash, sh.cash, me.cash, moneyShort); delta(S.hud.cash, me.cash - sh.cash, money); sh.cash = me.cash; } else S.hud.cash.textContent = moneyShort(me.cash);
  if (sh.respect !== me.respect) { fx.roll(S.hud.respN, sh.respect, me.respect, short); delta(S.hud.resp, me.respect - sh.respect, num); sh.respect = me.respect; } else S.hud.respN.textContent = short(me.respect);
  tickHud();
}

function tickHud() {
  const me = S.st?.me; if (!me || !S.hud.ebar) return;
  const L = live(me);
  S.hud.ebar.style.width = (L.energy / S.cfg.energy.max) * 100 + '%';
  S.hud.etxt.replaceChildren(icon('bolt'), ' ' + L.energy + '/' + S.cfg.energy.max, h('small', null, L.nextE ? ' · ' + t('nextIn', { t: dur(L.nextE) }) : ''));
  S.hud.vbar.style.width = (L.vice / me.addictionCap) * 100 + '%';
  S.hud.vtxt.textContent = t('vice') + ' ' + L.vice + '/' + me.addictionCap;
  tickShips(); tickNews();
  document.querySelectorAll('[data-left]').forEach((el) => { const left = +el.dataset.left - now(); el.textContent = dur(left); if (left <= 0 && el.dataset.re !== '1') { el.dataset.re = '1'; refresh(); } });
  document.querySelectorAll('[data-stored]').forEach((el) => { const i = +el.dataset.stored; const b = me.biz[i]; el.textContent = money(storedNow(b, i)); });
  document.querySelectorAll('[data-biz]').forEach((el) => {
    const i = +el.dataset.biz, b = me.biz[i]; const cap = b.perH * (S.cfg.storageMs / 3600000);
    const f = cap ? Math.min(1, storedNow(b, i) / cap) : 0;
    el.style.setProperty('--fill', f.toFixed(3)); el.classList.toggle('full', f >= 1);
    const bar = document.querySelector(`[data-fill="${i}"]`);
    if (bar) { bar.firstChild.style.width = f * 100 + '%'; bar.classList.toggle('full', f >= 1); }
    const txt = document.querySelector(`[data-fill-txt="${i}"]`);
    if (txt) txt.textContent = f >= 1 ? t('storageFull') : t('storage', { p: Math.floor(f * 100) });
    // o dinheiro a pingar: de vez em quando sobe um «+$» da imagem
    const v = storedNow(b, i), last = el._v ?? v;
    if (v > last && now() - (el._t || 0) > 2500 && !document.body.classList.contains('light')) { el._t = now(); const tk = h('span', { class: 'tick' }, '+' + money(v - last)); el.appendChild(tk); setTimeout(() => tk.remove(), 1300); el._v = v; }
    else if (v < last || el._v === undefined) el._v = v;
  });
  const tot = document.querySelector('[data-total]');
  if (tot) {
    const v = me.biz.reduce((s, b, i) => s + storedNow(b, i), 0);
    const ready = me.port.some((c) => c.readyAt <= now());
    tot.textContent = v > 0 || ready ? t('collect', { m: money(v) }) : t('nothingToCollect');
    tot.disabled = !(v > 0 || ready);
  }
}

// ---------- ecrãs ----------
// ---------- navegação: uma cidade com locais ----------
const PLACES = {
  city: { ic: 'skyline' }, empire: { ic: 'empire' }, rob: { ic: 'street', img: 'golpes' }, club: { ic: 'bolt', img: 'discoteca' }, gym: { img: 'ginasio' },
  biz: { ic: 'empire', img: 'negocios' }, port: { img: 'porto' }, air: { img: 'aeroporto' }, arms: { img: 'armas' }, bank: { img: 'banco' }, hosp: { img: 'hospital' },
  jail: { img: 'prisao' }, gang: { img: 'gangue' }, work: { img: 'profissao' }, news: { img: 'jornal' }, casino: { ic: 'gem', img: 'casino' }, roulette: { img: 'roleta' }, bj: { img: 'blackjack' }, dice: { img: 'dados' }, wheel: { img: 'roda' }, slot: { img: 'slot' }, zeus: { img: 'zeus' }, doce: { img: 'doce' }, rebucado: { img: 'rebucado' }, alley: { img: 'beco' }, lux: { img: 'luxos' }, fights: { ic: 'fights', img: 'lutas' }, rank: { img: 'ranking' }, putas: { img: 'putas' }, casa: {},
};
// barra de baixo: só o que se usa a toda a hora. O resto vive dentro de cada separador, arrumado por zonas.
const NAV = ['city', 'rob', 'fights', 'casino', 'empire'];
const HUB = {
  city: [['sec_night', ['club', 'putas', 'casino', 'gang', 'alley', 'arms']], ['sec_street', ['bank', 'work', 'gym', 'hosp', 'jail', 'rank']]],
  empire: [['sec_income', ['biz', 'port', 'air']], ['sec_assets', ['casa', 'bank']]],
};
const PARENT = { gang: 'city', work: 'city', news: 'city', casino: 'city', roulette: 'casino', bj: 'casino', dice: 'casino', wheel: 'casino', slot: 'casino', zeus: 'casino', doce: 'casino', rebucado: 'casino', club: 'city', putas: 'city', gym: 'city', alley: 'city', hosp: 'city', jail: 'city',
  biz: 'empire', port: 'empire', air: 'empire', casa: 'empire', bank: 'empire', lux: 'empire', arms: 'fights', rank: 'fights' };
const upOf = (id) => (S.backTo && S.backTo[id]) || PARENT[id] || 'city';   // um sítio que está em duas zonas volta para a zona de onde vieste
const tabOf = (id) => { let x = id; for (let k = 0; k < 4 && !NAV.includes(x); k++) x = upOf(x); return NAV.includes(x) ? x : 'city'; };
const IMG = (kind, id, big) => `/img/${kind}/${id}${big ? '-g' : ''}.webp?9`;
function go(tab) {
  if (!PLACES[tab]) tab = 'city';
  if (HUB[S.tab]?.some(([, ids]) => ids.includes(tab)) || (S.tab === 'fights' && (tab === 'arms' || tab === 'rank' || tab === 'gang'))) S.backTo = { ...(S.backTo || {}), [tab]: S.tab };
  S.tab = tab; document.body.dataset.tab = tab; store.set('tab', tab);
  if (tab === 'fights') { if (S.fightSeg === 'events') loadEvents(true); else { S.fightSeg = 'targets'; loadTargets(); } }
  if (tab === 'rank') loadRanking();
  if (tab === 'gang') loadGang();
  if (tab === 'news' || tab === 'city') loadNews();
  render(); window.scrollTo({ top: 0 });
  armBack();
}
// ---- gesto/botão de voltar atrás do telemóvel ----
// Enquanto há algo aberto (um sítio dentro da cidade, um jogo, uma folha), fica uma entrada a mais no histórico do browser.
// Voltar atrás gasta essa entrada e nós fechamos o que está aberto; só na cidade, sem nada aberto, é que o gesto sai do site.
function armBack() {
  const need = !!S.sheets?.length || (!!S.st?.me && S.tab !== 'city');
  if (need && !S.backArmed) { try { history.pushState({ crime: 1 }, ''); S.backArmed = true; } catch { /* sem histórico: fica como estava */ } }
  else if (!need && S.backArmed) { S.backArmed = false; S.backSkip = true; history.back(); }   // voltaste à cidade pelos botões do jogo: gasta-se a entrada a mais
}
addEventListener('popstate', () => {
  if (S.backSkip) { S.backSkip = false; return; }
  S.backArmed = false;
  const sh = S.sheets?.at(-1);
  if (sh) sh();
  else if (S.st?.me && S.tab !== 'city') go(upOf(S.tab));
  armBack();
});

let $main, $tabs;
function shell() {
  const hud = buildHud();
  $main = h('main', { id: 'main' });
  $tabs = h('nav', { style: '--n:' + NAV.length }, NAV.map((id) => h('button', { class: 'tab', dataset: { tab: id }, on: { click: () => go(id) } }, icon(PLACES[id].ic), t('p_' + id))));
  $app.replaceChildren(hud, $main, h('div', { class: 'tabs' }, $tabs));
  document.body.dataset.tab = S.tab;
  updateHud();
}

const SCREENS = { city: screenCity, empire: screenEmpire, news: screenNews, casino: screenCasino, roulette: screenRoulette, bj: screenBJ, dice: screenDice, wheel: screenWheel, slot: () => screenSlotGame('slot'), zeus: () => screenSlotGame('zeus'), doce: () => screenSlotGame('doce'), rebucado: () => screenSlotGame('rebucado'), rob: screenRob, club: screenClub, gym: screenGym, biz: screenBiz, port: screenPort, arms: screenArms, bank: screenBank,
  hosp: screenHosp, jail: screenJail, gang: screenGang, work: screenWork, air: screenAir, putas: screenPutas, casa: screenCasa, alley: screenAlley, lux: screenLux, fights: screenFights, rank: screenRank };
function render(force) {
  if (!S.st) return;
  if (!S.st.me || S.st.round.phase !== 'play') return renderPause();
  if (!PLACES[S.tab]) S.tab = 'city';
  // a meio de uma jogada no casino, nada redesenha a mesa (eventos, notícias, relógio); só mudar de sítio
  if (!force && S.casinoBusy && S.tab === S.drawn && $main && document.body.contains($main)) { tabDots(); return; }
  if (!force && S.tab === S.drawn && document.activeElement?.id === 'bamt') { tabDots(); updateHud(); return; }   // a meio de escrever uma quantia no banco
  if (!$main || !document.body.contains($main)) shell();
  const cur = tabOf(S.tab);
  $tabs.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-current', b.dataset.tab === cur ? 'page' : 'false'));
  tabDots();
  $main.replaceChildren(...(S.st.me.cls ? SCREENS[S.tab]() : screenClass()).filter(Boolean));
  S.drawn = S.tab;
  updateHud();
}

// pontos na barra: há coisa à tua espera nesse separador
function tabDots() {
  const me = S.st.me, n = now();
  const want = {
    fights: (S.events || []).some((e) => e.id > S.lastEventSeen),
    empire: (me.air && me.air.readyAt <= n) || me.port.some((c) => c.readyAt <= n) || me.biz.some((b, i) => b.n > 0 && storedNow(b, i) >= (b.perH * S.cfg.storageMs) / 3600000 / 2),
    city: !!me.mission?.done,
    casino: !!me.bj,   // tens uma mão de blackjack por acabar
  };
  for (const id of NAV) {
    const tab = $tabs.querySelector(`[data-tab="${id}"]`), dot = tab && tab.querySelector('.dot');
    if (want[id] && !dot) tab.appendChild(h('span', { class: 'dot' }));
    if (!want[id] && dot) dot.remove();
  }
}

// cabeçalho de cada local: voltar (para a zona de onde veio), nome e a imagem do sítio
function pageHead(id, sub, noImg) {
  const P = PLACES[id], up = NAV.includes(id) ? null : upOf(id);
  return h('div', { class: 'phead' },
    h('div', { class: 'pbar' + (up ? '' : ' top') }, up ? h('button', { class: 'back', 'aria-label': t('p_' + up), on: { click: () => go(up) } }, h('span', { 'aria-hidden': 'true' }, '←')) : null, h('h1', null, t('p_' + id))),
    P.img && !noImg ? h('div', { class: 'pimg' }, h('img', { src: IMG('cenas', P.img, 1), alt: '', width: 1100, height: 1100, decoding: 'async', on: { error: (e) => e.currentTarget.parentNode.remove() } })) : null,
    sub ? h('p', { class: 'psub' }, sub) : null);
}

function busyBanner(me) {
  const L = live(me);
  if (L.jail) return h('div', { class: 'state jail' }, h('h3', null, t('jail')), h('div', { class: 't' }, t('jailSub', { t: '' }), h('b', { class: 'num', dataset: { left: me.jailUntil } }, dur(L.jail))),
    h('div', { class: 'fill big jbar', dataset: { until: me.jailUntil, jtotal: (S.cfg.crimes[me.jailTier - 1]?.jailMin || 1) * 60000 } }, h('i')),
    h('button', { class: 'btn danger block', on: { click: (e) => act('bail', {}, { el: e.currentTarget }) } }, t('payBail', { m: money(me.bail) })));
  if (L.hosp) return h('div', { class: 'state hosp' }, h('h3', null, t('hospital')), h('div', { class: 't' }, t('hospitalSub', { t: '' }), h('b', { class: 'num', dataset: { left: me.hospUntil } }, dur(L.hosp))),
    h('button', { class: 'btn danger block', on: { click: (e) => act('medic', {}, { el: e.currentTarget }) } }, t('payMedic', { m: money(me.medic) })));
  return null;
}

function art(kind, id, cls = 'art') {
  return h('img', { class: cls, src: IMG(kind, id), alt: '', width: 600, height: 600, loading: 'lazy', decoding: 'async', on: { error: (e) => e.currentTarget.remove() } });
}
function meter(label, v, max, cls) {
  return h('div', { class: 'sbar ' + cls }, h('i', { style: `width:${Math.min(100, (v / max) * 100)}%` }), h('span', null, label + ' ', h('b', { class: 'num' }, v + '/' + max)));
}
const chanceCls = (bp) => (bp >= 7000 ? 'hi' : bp >= 4000 ? 'mid' : 'lo');

function bizAnim(id) {
  const NS = 'http://www.w3.org/2000/svg';
  const s = svg('svg', { class: 'anim', viewBox: '0 0 100 100', preserveAspectRatio: 'xMidYMax meet', 'aria-hidden': 'true' });
  const add = (parent, tag, attrs) => { const e = svg(tag, attrs); parent.append(e); return e; };
  if (id === 'erva') {
    for (let k = 0; k < 5; k++) {
      const x = 12 + k * 19;
      const grow = add(s, 'g', { class: 'grow', style: `--k:${k};transform-origin:${x}px 100px` });
      const sway = add(grow, 'g', { class: 'sway', style: `transform-origin:${x}px 100px;animation-delay:${-k * 0.6}s` });
      add(sway, 'path', { d: `M${x} 100 V58`, class: 'stem' });
      // folhas de cinco pontas, alternadas pelo caule
      for (const [dy, side, sc] of [[84, -1, 1], [76, 1, .9], [68, -1, .8], [61, 1, .65]]) {
        const leaf = add(sway, 'g', { class: 'leaf', transform: `translate(${x + side * 2} ${dy}) scale(${sc}) rotate(${side * 35})` });
        for (const a of [-60, -30, 0, 30, 60]) add(leaf, 'ellipse', { cx: 0, cy: -6, rx: 1.6, ry: a === 0 ? 7 : 5.5, transform: `rotate(${a})` });
      }
      add(sway, 'ellipse', { class: 'bud', cx: x, cy: 56, rx: 2.6, ry: 4 });
    }
  } else if (id === 'coca') {
    for (let k = 0; k < 10; k++) {
      const col = k % 5, row = Math.floor(k / 5);
      add(s, 'rect', { class: 'brick', x: 14 + col * 15, y: 88 - row * 9, width: 13, height: 8, rx: 1.5, style: `--k:${k}` });
    }
  } else if (id === 'laboratorio') {
    for (let k = 0; k < 9; k++) add(s, 'circle', { class: 'pill', cx: 20 + (k % 5) * 14 + (k > 4 ? 7 : 0), cy: k > 4 ? 84 : 92, r: 5, style: `--k:${k}` });
    for (let k = 0; k < 5; k++) add(s, 'circle', { class: 'bubble', cx: 18 + k * 7, cy: 70, r: 1.6 + (k % 2), style: `animation-delay:${-k * 0.45}s` });
  } else {
    // lavandaria e casa: maços de notas a empilhar
    for (let k = 0; k < 8; k++) {
      const g = add(s, 'g', { class: 'bill', style: `--k:${k}` });
      const x = 54 + (k % 2) * 2, y = 92 - k * 5;
      add(g, 'rect', { x, y, width: 34, height: 6, rx: 1 });
      add(g, 'ellipse', { class: 'seal', cx: x + 17, cy: y + 3, rx: 3.2, ry: 2 });
    }
    if (id === 'lavandaria') for (let k = 0; k < 5; k++) add(s, 'circle', { class: 'bubble soap', cx: 16 + k * 8, cy: 80, r: 2 + (k % 3), style: `animation-delay:${-k * 0.5}s` });
    if (id === 'prostitutas') add(s, 'path', { class: 'heart', d: 'M20 14c-2-3-7-2-7 2 0 4 7 8 7 8s7-4 7-8c0-4-5-5-7-2z' });
  }
  return s;
}

function statNames(w) {
  const names = { I: t('statI'), F: t('statF'), C: t('statC') };
  return Object.entries(w).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([s]) => names[s]).join(' + ');
}

// ---------- profissão ----------
const myClass = () => S.cfg.classes.find((c) => c.id === S.st.me.cls) || {};
const sickOf = (g) => Math.floor((g.sickBp * (10000 - (myClass().sickCutBp || 0))) / 10000);
function classLines(c) { return Object.keys(c).filter((k) => k !== 'id' && k !== 'need').map((k) => t('cb_' + k, { p: k === 'capPlus' ? c[k] : c[k] / 100 })); }
function classCard(c, me, pick) {
  const locked = (c.need || 0) > me.peakRespect, cur = me.cls === c.id;
  return h('button', { class: 'item cls' + (pick === c.id ? ' sel' : '') + (locked ? ' lock' : '') + (cur ? ' cur' : ''), disabled: locked || cur, 'aria-pressed': pick === c.id ? 'true' : 'false', on: { click: () => { S.clsPick = c.id; render(); } } },
    art('classes', c.id), h('div', { class: 'nm' }, t('cl_' + c.id)),
    cur ? h('div', { class: 'small c-cash clsnow' }, t('clsNow')) : c.need ? h('div', { class: 'small clsneed ' + (locked ? 'c-red' : 'c-resp') }, icon(locked ? 'lock' : 'crown'), t('clsNeed', { n: num(c.need) })) : null,
    h('ul', { class: 'perks' }, classLines(c).map((x) => h('li', null, x))));
}
function classGroups(me, pick, noHead) {
  const base = S.cfg.classes.filter((c) => !c.need), elite = S.cfg.classes.filter((c) => c.need);
  return [noHead ? null : h('h2', { class: 'sec' }, t('clsBase')), h('div', { class: 'shop' }, base.map((c) => classCard(c, me, pick))),
    h('h2', { class: 'sec' }, t('clsElite')), h('p', { class: 'small muted', style: 'margin:-4px 0 10px' }, t('clsEliteSub')), h('div', { class: 'shop' }, elite.map((c) => classCard(c, me, pick)))];
}
// mudar de profissão: paga-se e só de 24 em 24 h
function screenWork() {
  const me = S.st.me, n = now(), waitT = me.clsWait > n, pick = S.clsPick && S.clsPick !== me.cls ? S.clsPick : null, poor = me.cash + me.bank < me.clsCost;
  const out = [pageHead('work', t('workSub', { m: money(me.clsCost) }))];
  if (waitT) out.push(h('div', { class: 'tip' }, h('p', null, t('clsWaitT'), ' ', h('b', { class: 'num', dataset: { left: me.clsWait } }, dur(me.clsWait - n)))));
  else if (poor) out.push(h('div', { class: 'tip' }, h('p', null, t('clsPoor', { m: money(me.clsCost) }))));
  out.push(...classGroups(me, pick));
  if (pick) out.push(h('div', { class: 'stick' }, h('button', { class: 'btn buy block big', disabled: waitT || poor, on: { click: async (e) => { const o = await act('classChange', { id: pick }, { el: e.currentTarget }); if (o) { S.clsPick = null; render(); } } } }, t('clsChangeGo', { x: t('cl_' + pick), m: moneyShort(me.clsCost) }))));
  return out;
}
function screenClass() {
  const pick = S.clsPick;
  return [h('div', { class: 'phead' }, h('div', { class: 'pbar' }, h('h1', { style: 'margin:0' }, t('clsTitle'))), h('p', { class: 'psub' }, t('clsSub'))),
    S.avOk ? h('h2', { class: 'sec', style: 'margin-top:4px' }, t('avatar')) : null,
    S.avOk ? h('div', { class: 'avgrid' }, Array.from({ length: S.cfg.avatars }, (_, i) => h('button', { class: i === S.st.me.av ? 'sel' : '', 'aria-label': t('avatar') + ' ' + (i + 1), 'aria-pressed': i === S.st.me.av ? 'true' : 'false',
      on: { click: () => act('avatar', { i }) } }, h('img', { src: AV(i), alt: '', width: 96, height: 96, loading: 'lazy', on: { error: (e) => e.currentTarget.parentNode.remove() } })))) : null,
    S.avOk ? h('h2', { class: 'sec' }, t('clsWork')) : null,
    ...classGroups(S.st.me, pick, !S.avOk),
    pick ? h('div', { class: 'stick' }, h('button', { class: 'btn buy block big', on: { click: (e) => act('class', { id: pick }, { el: e.currentTarget }) } }, t('clsConfirm', { x: t('cl_' + pick) }))) : null];
}

// ---------- a cidade ----------
// ---------- jornal da cidade: o que os outros andam a fazer ----------
const NW_IC = { air: 'cash', airLost: 'lock', cls: 'user', gangNew: 'fist', gangUp: 'empire', gangHeist: 'cash', gangHeistFail: 'lock', gangHit: 'fist', gangHitFail: 'skull', casino: 'gem', casinoLoss: 'skull', job: 'cash', crit: 'gem', spree: 'bolt', jail: 'lock', house: 'empire', lux: 'crown', beat: 'fist', mug: 'cash', fail: 'skull', sick: 'pill', lvl: 'crown', fight: 'fist' };
const seedOf = (str) => { let x = 7; for (let i = 0; i < str.length; i++) x = (x * 31 + str.charCodeAt(i)) | 0; return Math.abs(x); };
function newsText(e) {
  const k = e.k === 'fight' ? (e.mode === 'mug' ? 'mug' : 'beat') : e.k, C = list('crimes');
  if (k === 'gangNew') return t('nw_gangNew', { a: e.name, g: e.gang, t: e.tag });
  if (k === 'gangUp') return t('nw_gangUp_' + e.what, { g: e.gang, n: e.n });
  if (k === 'air' || k === 'airLost') return tv('nw_' + k, seedOf(e.name + k + e.t), { a: e.name, x: t('ar_' + e.to), m: moneyShort(e.money || 0) });
  if (k === 'cls') return tv('nw_cls', seedOf(e.name + k + e.t), { a: e.name, x: t('cl_' + e.from), y: t('cl_' + e.to) });
  if (k === 'gangHeist' || k === 'gangHeistFail') return tv('nw_' + k, seedOf(e.gang + k + e.t), { g: e.gang, x: t('gh_' + e.c), n: e.n, m: moneyShort(e.money || 0) });
  if (k === 'gangHit' || k === 'gangHitFail') return tv('nw_' + k, seedOf(e.gang + k + e.t), { g: e.gang, b: e.target, n: e.n });
  const x = k === 'house' ? list('houses')[e.h] : k === 'lux' ? list('lux')[e.i] : k === 'lvl' ? list('titles')[e.n - 1] : k.startsWith('casino') ? t('csIn_' + e.g) : C[e.c];
  return tv('nw_' + k, seedOf(e.name + k + e.t), { a: e.name, b: e.target, x, m: moneyShort(e.money || 0), n: e.n });
}
const newsIdx = (f) => Math.floor(now() / 5000) % f.length;
// o jornal na cidade: a manchete do dia e a última hora a rodar; abre o jornal inteiro
function newsBar() {
  const f = S.feed || [], top = S.news?.today?.items?.[0];
  const e = f.length ? f[newsIdx(f)] : null;
  return h('button', { class: 'newsc', 'aria-label': t('p_news'), on: { click: () => go('news') } },
    h('div', { class: 'nhead' }, h('span', { class: 'nlbl' }, t('p_news')), h('span', { class: 'nlive' }, t('nwLive')), icon('chev')),
    top ? h('div', { class: 'ntop' }, t('hl_' + top.k + '_t', { a: top.name })) : null,
    e ? h('div', { class: 'news', 'data-news': String(newsIdx(f)) },
      h('span', { class: 'nic' }, icon(NW_IC[e.k] || 'chat')), h('span', { class: 'ntx' }, newsText(e)), h('span', { class: 'nago muted' }, dur(now() - e.t)))
      : h('div', { class: 'small muted' }, t('nwEmpty')));
}
function tickNews() {
  const el = document.querySelector('[data-news]'), f = S.feed || [];
  if (!el || !f.length) return;
  const i = newsIdx(f), e = f[i];
  el.querySelector('.nago').textContent = dur(now() - e.t);
  if (+el.dataset.news === i) return;
  el.dataset.news = String(i);
  el.querySelector('.nic').replaceChildren(icon(NW_IC[e.k] || 'chat'));
  el.querySelector('.ntx').textContent = newsText(e);
  el.classList.remove('swap'); void el.offsetWidth; el.classList.add('swap');
}
async function loadNews() {
  try { const r = await api('GET', '/api/news'); S.news = r; if (r.feed) S.feed = r.feed; if (S.tab === 'news' || S.tab === 'city') render(); } catch {}
}
// o jornal: manchetes de hoje e de ontem (feitas sozinhas a partir do que os jogadores fazem) e a última hora
function hlCard(it, when, dia) {
  const cls = it.cls ? t('cl_' + it.cls) : '';
  return h('article', { class: 'hl hl-' + it.k },
    h('h3', null, t('hl_' + it.k + '_t', { a: it.name })),
    h('p', null, tv('hl_' + it.k, seedOf(it.name + it.k + dia), { a: it.name, n: it.n, m: money(it.m), d: when })),
    h('div', { class: 'hlwho' }, S.avOk ? h('img', { class: 'avs', src: AV(it.av || 0), alt: '', width: 96, height: 96, loading: 'lazy' }) : null,
      h('div', null, h('b', null, it.name), h('div', { class: 'small muted' }, (cls ? cls + ' · ' : '') + t('level') + ' ' + it.level),
        h('div', { class: 'small c-resp' }, icon('crown'), ' ' + num(it.respect)))));
}
function screenNews() {
  const N = S.news, seg = S.newsSeg || 'today';
  const out = [pageHead('news', t('s_news'))];
  out.push(h('div', { class: 'seg', role: 'group' }, [['today', t('nwToday')], ['yesterday', t('nwYesterday')], ['live', t('nwLive')]].map(([id, lbl]) =>
    h('button', { 'aria-pressed': seg === id ? 'true' : 'false', on: { click: () => { S.newsSeg = id; render(); } } }, lbl))));
  if (!N) { out.push(h('p', { class: 'muted' }, t('loading'))); return out; }
  if (seg === 'live') {
    const f = S.feed || [];
    if (!f.length) out.push(h('div', { class: 'note' }, h('p', { class: 'muted' }, t('nwEmpty'))));
    else out.push(h('div', { class: 'card nlist' }, f.map((e) => h('div', { class: 'row nrow' }, h('span', { class: 'nic' }, icon(NW_IC[e.k] || 'chat')),
      h('div', { class: 'grow' }, newsText(e)), h('span', { class: 'small muted' }, dur(now() - e.t))))));
    return out;
  }
  const day = seg === 'today' ? N.today : N.yesterday, when = seg === 'today' ? t('dToday') : t('dYesterday');
  if (!day.items.length) out.push(h('div', { class: 'note' }, h('p', { class: 'muted' }, seg === 'today' ? t('hlNoneToday') : t('hlNoneYesterday'))));
  else out.push(h('div', { class: 'hls' }, day.items.map((it) => hlCard(it, when, day.dia))));
  return out;
}
function screenCity() {
  const me = S.st.me, L = live(me), n = now();
  const badge = {
    biz: me.biz.some((b, i) => storedNow(b, i) > 0) ? t('toCollect') : null,
    port: me.port.some((c) => c.readyAt <= n) ? t('ready') : null,
    alley: me.mission?.done ? t('prize') : null,
    hosp: L.hosp ? t('inside') : null,
    jail: L.jail ? t('inside') : null,
    fights: (S.events || []).some((e) => e.id > S.lastEventSeen) ? t('newEvt') : null,
  };
  const r = S.st.round;
  return [h('h1', { class: 'sr' }, t('p_city')), newsBar(), ...hubTiles('city', badge),
    h('p', { class: 'small muted', style: 'text-align:center;margin-top:16px' }, t('roundEnds', { n: r.n + 1, t: dur(r.playEnd - n) }))].filter(Boolean);
}
function placeTile(id, badge) {
  const me = S.st.me;
  return h('button', { class: 'tile', on: { click: () => go(id) } },
    h('img', { src: id === 'casa' ? IMG('casa', S.cfg.house.tiers[me.house].id) : IMG('cenas', PLACES[id].img), alt: '', width: 600, height: 600, loading: 'lazy', decoding: 'async', on: { error: (e) => e.currentTarget.remove() } }),
    h('span', { class: 'lbl' }, t('p_' + id)), badge ? h('span', { class: 'bdg' }, badge) : null);
}
function hubTiles(hub, badge) {
  return HUB[hub].flatMap(([sec, ids]) => [h('h2', { class: 'sec' }, t(sec)), h('div', { class: 'tiles' }, ids.map((id) => placeTile(id, badge[id])))]);
}
// o império: o que rende enquanto não estás, num só sítio
function screenEmpire() {
  const me = S.st.me, n = now();
  const total = me.biz.reduce((s, b, i) => s + storedNow(b, i), 0), perH = me.biz.reduce((s, b) => s + b.perH, 0);
  const portReady = me.port.filter((c) => c.readyAt <= n).length;
  const badge = {
    biz: total > 0 ? t('toCollect') : null,
    port: portReady ? t('ready') : me.port.length ? dur(Math.min(...me.port.map((c) => c.readyAt)) - n) : null,
    casa: me.housePrice != null && me.cash + me.bank >= me.housePrice ? t('canUpgrade') : null,
  };
  const head = me.biz.some((b) => b.n > 0) || me.port.length
    ? h('div', { class: 'card stack empsum' },
      h('div', { class: 'row sp' }, h('span', { class: 'muted' }, t('empIncome')), h('b', { class: 'num c-cash' }, money(perH) + t('perHour'))),
      h('button', { class: 'btn buy block big', dataset: { total: 1 }, disabled: total <= 0 && !portReady, on: { click: (e) => act('collect', {}, { el: e.currentTarget }) } },
        total > 0 || portReady ? t('collect', { m: money(total) }) : t('nothingToCollect')))
    : h('div', { class: 'tip' }, h('p', null, t('empNone')));
  return [h('div', { class: 'phead' }, h('div', { class: 'pbar top' }, h('h1', null, t('p_empire')))), head, ...hubTiles('empire', badge)];
}

// ---------- golpes ----------
function reportAll(rep, li, names) {
  const { r, c, k, lv, unlocked } = rep, lines = [li('', t(r.n === 1 ? 'ra_jobs1' : 'ra_jobs', { n: r.n }) + ' · ' + t(r.wins === 1 ? 'ra_ok1' : 'ra_ok', { w: r.wins }))];
  if (r.crits) lines.push(li('c-gold', t(r.crits === 1 ? 'ra_crit1' : 'ra_crit', { n: r.crits })));
  if (r.money) lines.push(li('c-cash', t('r_stole', { m: money(r.money) })));
  if (r.respect) lines.push(li('c-resp', t('r_resp', { n: r.respect })));
  lines.push(li('', t('ra_spent', { e: r.n * c.e })));
  if (r.busted) lines.push(li('c-red', t('r_jail', { t: dur(Math.max(0, r.jailUntil - rep.at)) })));
  for (const [s, n] of Object.entries(r.gained || {})) lines.push(li('c-en', '+' + n + ' ' + names[s]));
  if (r.newChanceBp > r.chanceBp) lines.push(li('', t('r_chance', { p: pct(r.newChanceBp) })));
  if (r.star) lines.push(li('c-gold', t('r_star', { x: list('crimes')[k] })));
  if (lv) lines.push(li('c-resp', t('r_lvl', { n: lv.to, x: list('titles')[lv.to - 1] })));
  for (const i of unlocked) lines.push(li('c-cash', t('newJob', { x: list('crimes')[i] })));
  const head = r.busted ? t('ra_bust', { i: r.n }) : r.wins === r.n ? t('ra_clean') : r.wins ? t('ra_done') : t('ra_none');
  return h('div', { class: 'report ' + (r.busted ? 'bust' : r.wins ? 'ok' : 'miss'), role: 'status' }, h('b', null, head), h('ul', null, lines));
}
function reportCard(rep) {
  const { r, c, k, lv, unlocked } = rep, names = { F: t('statF'), I: t('statI'), C: t('statC') };
  const li = (cls, txt) => h('li', { class: cls }, txt), lines = [];
  if (r.all) return reportAll(rep, li, names);
  if (r.success) { lines.push(li('c-cash', t('r_stole', { m: money(r.money) }))); lines.push(li('c-resp', t('r_resp', { n: r.respect }))); }
  else { lines.push(li('', t('r_lost', { e: c.e }))); if (r.busted) lines.push(li('c-red', t('r_jail', { t: dur(Math.max(0, r.jailUntil - rep.at)) }))); }
  for (const [s, n] of Object.entries(r.gained || {})) lines.push(li('c-en', '+' + n + ' ' + names[s]));
  if (r.newChanceBp > r.chanceBp) lines.push(li('', t('r_chance', { p: pct(r.newChanceBp) })));
  if (r.star) lines.push(li('c-gold', t('r_star', { x: list('crimes')[k] })));
  if (lv) lines.push(li('c-resp', t('r_lvl', { n: lv.to, x: list('titles')[lv.to - 1] })));
  for (const i of unlocked) lines.push(li('c-cash', t('newJob', { x: list('crimes')[i] })));
  return h('div', { class: 'report ' + (r.success ? 'ok' : r.busted ? 'bust' : 'miss'), role: 'status' },
    h('b', null, r.success ? (r.crit ? t('r_crit') : t('r_ok')) : r.busted ? t('r_bust') : t('r_miss')), h('ul', null, lines));
}
function screenRob() {
  const me = S.st.me, C = S.cfg.crimes, L = live(me), names = list('crimes');
  const out = [pageHead('rob', null, true)];
  const b = busyBanner(me); if (b) out.push(b);
  const open = C.map((c, i) => i).filter((i) => me.crimes[i].unlocked);
  let k = S.robK ?? store.get('robK', -1);
  if (!open.includes(k)) { k = open[0]; for (const i of open) if (me.crimes[i].chance >= 6500) k = i; }
  S.robK = k;
  const c = C[k], info = me.crimes[k], bonus = 1 + (me.stars[k] * S.cfg.mastery.bonusBp) / 10000;
  const rep = S.report && S.report.k === k ? S.report : null;
  const fact = (lbl, val, cls, ic) => h('div', { class: 'fact' }, h('b', { class: 'num ' + cls }, val), h('span', null, icon(ic), lbl));
  out.push(h('div', { class: 'jobp' },
    h('div', { class: 'jimg' }, h('img', { src: IMG('crimes', c.id, 1), alt: '', width: 1100, height: 1100, decoding: 'async' }), h('h2', null, names[k])),
    h('div', { class: 'facts' },
      fact(t('chance'), pct(info.chance), chanceCls(info.chance), 'target'), fact(t('energy'), '−' + c.e, 'c-en', 'bolt'),
      fact(t('loot'), moneyShort(Math.floor(c.min * bonus)) + '–' + moneyShort(Math.floor(c.max * bonus)), 'c-cash', 'cash'), fact(t('respect'), '+' + c.r, 'c-resp', 'crown')),
    h('button', { class: 'btn buy block big', disabled: !!b || L.energy < c.e, on: { click: (e) => act('crime', { k }, { el: e.currentTarget }) } }, t('robBtn')),
    !b && Math.floor(L.energy / c.e) >= 2 ? h('button', { class: 'btn ghost block robAll', on: { click: (e) => act('crimeAll', { k }, { el: e.currentTarget }) } },
      icon('bolt'), ' ' + t('robAll', { n: Math.min(Math.floor(L.energy / c.e), S.cfg.crimeAllMax || 25) })) : null,
    !b && L.energy < c.e ? h('div', { class: 'row sp' }, h('span', { class: 'small' }, t('noStamina')), h('button', { class: 'btn sm pri', on: { click: () => go('club') } }, t('goClub'))) : null,
    rep ? reportCard(rep) : null,
    me.stars[k] ? h('p', { class: 'small muted' }, t('r_exp', { n: me.wk[k], p: me.stars[k] * 10 })) : null));
  out.push(h('h2', { class: 'sec' }, t('allJobs')));
  const rows = h('div', { class: 'rows' });
  let lockedShown = false;
  C.forEach((x, i) => {
    const inf = me.crimes[i];
    if (!inf.unlocked) {
      if (lockedShown) return; lockedShown = true;
      rows.append(h('div', { class: 'rowi lock' }, art('crimes', x.id), h('div', { class: 'mid' }, h('div', { class: 'nm' }, names[i]), h('div', { class: 'meta' }, icon('lock'), ' ', t('needsStats', { s: statNames(x.w) }))),
        h('div', { class: 'pct' }, pct(inf.chance))));
      return;
    }
    rows.append(h('button', { class: 'rowi' + (i === k ? ' sel' : ''), 'aria-pressed': i === k ? 'true' : 'false',
      on: { click: () => { S.robK = i; store.set('robK', i); S.report = null; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); } } },
      art('crimes', x.id),
      h('div', { class: 'mid' }, h('div', { class: 'nm' }, names[i]),
        h('div', { class: 'meta' }, h('span', { class: 'c-en' }, icon('bolt'), ' ' + x.e), h('span', { class: 'c-cash' }, moneyShort(x.min) + '–' + moneyShort(x.max)), h('span', { class: 'c-resp' }, icon('crown'), ' +' + x.r))),
      h('div', { class: 'pct ' + chanceCls(inf.chance) }, pct(inf.chance))));
  });
  out.push(rows);
  return out;
}

// ---------- discoteca ----------
function screenClub() {
  const me = S.st.me, L = live(me), max = S.cfg.energy.max;
  const out = [pageHead('club', t('s_club'))];
  const b = busyBanner(me); if (b) out.push(b);
  out.push(h('div', { class: 'card meters' }, meter(t('energy'), L.energy, max, 'en'), meter(t('vice'), L.vice, me.addictionCap, 'vi'), h('p', { class: 'small muted' }, t('vice') + ': ' + t('viceDown'))));
  if (L.vice >= me.addictionCap - 1) out.push(h('div', { class: 'note', style: 'margin-top:8px' }, h('p', null, t('viceFull')), h('button', { class: 'btn pri', on: { click: () => go('hosp') } }, t('goHosp'))));
  const more = (S.cfg.classes.find((c) => c.id === me.cls) || {}).fxMoreBp || 0;
  out.push(h('div', { class: 'shop', style: 'margin-top:12px' }, S.cfg.drugs.map((g, d) => {
    const price = me.drugPrices[d];
    const ok = (g.fx || L.energy + g.e <= max) && L.vice + g.a <= me.addictionCap && me.cash + me.bank >= price && !b;
    return h('div', { class: 'item' }, art('drugs', g.id),
      h('div', { class: 'nm' }, list('drugs')[d]),
      h('div', { class: 'small' }, h('span', { class: 'c-en' }, icon('bolt'), '+' + g.e), ' · ', h('span', { class: 'c-vice' }, icon('pill'), '+' + g.a)),
      g.fx ? h('ul', { class: 'perks' }, g.fx.map((f) => h('li', null, icon(FX_IC[f.k]), fxText(f) + ' · ' + t('fxFor', { m: Math.round((f.ms * (10000 + more)) / 10000 / 60000) }))))
        : h('div', { class: 'small muted' }, t('noFx')),
      h('button', { class: 'btn buy block', disabled: !ok, on: { click: (e) => act('drug', { d }, { el: e.currentTarget }) } }, t('buyFor', { m: money(price) })));
  })));
  return out;
}

// ---------- putas ----------
function screenPutas() {
  const me = S.st.me, L = live(me), H = S.cfg.hookers;
  const out = [pageHead('putas', t('s_putas', { p: Math.round((H.stepNum / H.stepDen - 1) * 100) }))];
  const b = busyBanner(me); if (b) out.push(b);
  if (me.sick) out.push(h('div', { class: 'note', style: 'margin-bottom:10px' }, h('h3', { class: 'c-red' }, t('sickTitle')), h('p', null, t('sickSub', { p: H.sickCutBp / 100 })),
    h('button', { class: 'btn pri', on: { click: () => go('hosp') } }, t('goHosp'))));
  out.push(h('div', { class: 'shop' }, H.list.map((g, i) => {
    const price = me.hookers[i];
    const ok = !b && !me.sick && L.energy < S.cfg.energy.max && me.cash + me.bank >= price;
    return h('div', { class: 'item' }, art('putas', g.id),
      h('div', { class: 'nm' }, list('hookers')[i]),
      h('div', { class: 'small muted' }, t('hk_t' + g.tier)),
      h('div', { class: 'small' }, h('span', { class: 'c-en' }, icon('bolt'), '+' + g.e + ' ' + t('energy').toLowerCase())),
      h('div', { class: 'small ' + (sickOf(g) >= 500 ? 'c-red' : 'muted') }, icon('skull'), t('hkRisk', { p: (sickOf(g) / 100).toString().replace('.', lang() === 'pt' ? ',' : '.') })),
      h('button', { class: 'btn buy block', disabled: !ok, on: { click: (e) => act('hooker', { i }, { el: e.currentTarget }) } }, t('hkGo', { m: money(price) })));
  })));
  return out;
}

// ---------- ginásio ----------
function screenGym() {
  const me = S.st.me;
  const out = [pageHead('gym', t('gymSub'))];
  const b = busyBanner(me); if (b) out.push(b);
  out.push(h('div', { class: 'power' },
    h('div', { class: 'card' }, h('b', { class: 'c-red' }, icon('fist'), short(me.attack)), h('span', { class: 'small muted' }, t('attackPower'))),
    h('div', { class: 'card' }, h('b', { class: 'c-en' }, icon('shield'), short(me.defense)), h('span', { class: 'small muted' }, t('defensePower')))));
  out.push(h('div', { class: 'shop' }, ['F', 'I', 'C', 'T'].map((s) => {
    const train = async (e, n) => { const el = e.currentTarget; for (let i = 0; i < n; i++) { const r = await act('train', { stat: s }, { el }); if (!r) break; } };
    return h('div', { class: 'item' }, art('stats', s),
      h('div', { class: 'nm' }, icon(STAT_IC[s]), ' ', t('stat' + s), ' ', h('b', { class: 'num c-en' }, num(me.stats[s]))),
      h('p', { class: 'small muted' }, t('stat' + s + 'd')),
      me.xp && s !== 'T' ? h('div', { class: 'fill', title: t('practiceLbl') }, h('i', { style: `width:${Math.min(100, (me.xp[s] / me.xpNeed[s]) * 100)}%;background:var(--energy)` })) : null,
      h('div', { class: 'row' }, h('button', { class: 'btn buy grow', disabled: !!b, on: { click: (e) => train(e, 1) } }, t('train')),
        h('button', { class: 'btn', disabled: !!b, on: { click: (e) => train(e, 5) } }, t('trainX5'))));
  })));
  out.push(h('p', { class: 'small muted', style: 'margin-top:12px' }, t('trainCost', { e: S.cfg.train.energy })));
  return out;
}

// ---------- negócios ----------
function screenBiz() {
  const me = S.st.me, B = S.cfg.biz;
  const out = [pageHead('biz', t('empireSub'))];
  const total = me.biz.reduce((s, b, i) => s + storedNow(b, i), 0);
  const readyPort = me.port.filter((c) => c.readyAt <= now()).length;
  if (me.biz.some((b) => b.n > 0)) out.push(h('div', { class: 'collect' }, h('button', { class: 'btn buy block big', dataset: { total: 1 }, disabled: total <= 0 && !readyPort,
    on: { click: (e) => act('collect', {}, { el: e.currentTarget }) } }, total > 0 || readyPort ? t('collect', { m: money(total) }) : t('nothingToCollect'))));
  out.push(h('div', { class: 'shop' }, B.map((cfg, i) => {
    const b = me.biz[i];
    const cap = b.perH * (S.cfg.storageMs / 3600000);
    const stored = storedNow(b, i);
    const unitPerH = Math.floor(cfg.perH * (1000 + Math.min(me.stats[cfg.stat], 1000)) / 1000);
    const fill = cap ? Math.min(1, stored / cap) : 0;
    return h('div', { class: 'item' },
      h('div', { class: 'bscene ' + cfg.id + (b.n > 0 ? ' on' : '') + (fill >= 1 ? ' full' : ''), dataset: { biz: i }, style: `--fill:${fill.toFixed(3)}` }, art('biz', cfg.id, 'pic'), b.n > 0 ? bizAnim(cfg.id) : null,
        b.n > 0 ? h('span', { class: 'cnt num' }, '×' + b.n) : null),
      h('div', { class: 'nm' }, list('biz')[i]),
      b.n > 0 ? h('div', { class: 'small' }, h('b', { class: 'c-cash num', dataset: { stored: i } }, money(stored)), h('span', { class: 'muted num' }, ' · ' + moneyShort(b.perH) + t('perHour')))
        : h('div', { class: 'small muted' }, '+' + moneyShort(unitPerH) + t('perHour') + ' · +' + cfg.resp + ' ' + t('respect').toLowerCase()),
      b.n > 0 ? h('div', { class: 'fill big' + (fill >= 1 ? ' full' : ''), dataset: { fill: i } }, h('i', { style: `width:${fill * 100}%` })) : null,
      b.n > 0 ? h('div', { class: 'small muted', dataset: { fillTxt: i } }, fill >= 1 ? t('storageFull') : t('storage', { p: Math.floor(fill * 100) })) : null,
      h('div', { class: 'small muted' }, cfg.toBank ? t('legal') : t('raidRisk')),
      b.price ? h('button', { class: 'btn buy block', disabled: me.cash + me.bank < b.price, on: { click: (e) => act('buyBiz', { i }, { el: e.currentTarget }) } }, t('buyFor', { m: moneyShort(b.price) }))
        : h('div', { class: 'small c-resp' }, t('maxed')));
  })));
  return out;
}

// ---------- porto ----------
// mapa: cada contentor é um navio que atravessa o mar ao ritmo do tempo que falta
function portMap(me) {
  const s = svg('svg', { class: 'pmap', viewBox: '0 0 320 150', role: 'img', 'aria-label': t('p_port') });
  for (let x = 40; x < 320; x += 40) s.append(svg('path', { class: 'grid', d: `M${x} 0V150` }));
  for (let y = 30; y < 150; y += 30) s.append(svg('path', { class: 'grid', d: `M0 ${y}H320` }));
  for (let k = 0; k < 7; k++) s.append(svg('path', { class: 'wave', d: `M${20 + k * 44} ${30 + (k * 37) % 100}q5-4 10 0t10 0`, style: `animation-delay:${-k * 0.7}s` }));
  s.append(svg('path', { class: 'land', d: 'M0 150V78c16-8 30-2 38 10 9 13 4 26 17 35 10 7 15 15 13 27z' }));
  s.append(svg('path', { class: 'land', d: 'M320 0v100c-13 4-22-3-26-14-4-12-17-12-21-25-4-11 3-21-4-31-5-9-2-20 5-30z' }));
  s.append(svg('path', { class: 'route', d: 'M46 110C96 130 118 38 176 58s80 10 106-22' }), svg('path', { class: 'route done', d: 'M46 110C96 130 118 38 176 58s80 10 106-22' }));
  s.append(svg('circle', { class: 'org', cx: 46, cy: 110, r: 4 }), svg('circle', { class: 'ping', cx: 282, cy: 36, r: 4 }), svg('circle', { class: 'dst', cx: 282, cy: 36, r: 4 }));
  const lbl = (x, y, txt, anchor) => { const e = svg('text', { x, y, 'text-anchor': anchor }); e.textContent = txt; return e; };
  s.append(lbl(54, 128, 'Cartagena', 'start'), lbl(274, 24, t('p_port'), 'end'));
  me.port.forEach((c, i) => {
    const g = svg('g', { class: 'ship', 'data-ready': c.readyAt, 'data-i': i });
    g.append(svg('path', { d: 'M-8 1l2.5 5h11l2.5-5zM-4.5 1v-5h9v5M-1-4v-3.5h2.5v3.5' }));
    s.append(g);
  });
  return h('div', { class: 'pmapbox' }, s);
}
function tickShips() {
  document.querySelectorAll('.pmap').forEach((m) => {
    const route = m.querySelector('.route'), L = route.getTotalLength(); let far = 0;
    m.querySelectorAll('.ship').forEach((g) => {
      const pr = Math.min(1, Math.max(0, 1 - (+g.dataset.ready - now()) / S.cfg.port.ms)), pt = route.getPointAtLength(pr * L);
      g.setAttribute('transform', `translate(${pt.x.toFixed(1)} ${(pt.y - 4 - (+g.dataset.i % 3) * 3).toFixed(1)})`);
      g.classList.toggle('in', pr >= 1); far = Math.max(far, pr);
    });
    m.querySelector('.done').setAttribute('stroke-dasharray', `${(far * L).toFixed(1)} ${L.toFixed(1)}`);
  });
  document.querySelectorAll('.jbar').forEach((el) => { const left = +el.dataset.until - now(); el.firstChild.style.width = Math.min(100, Math.max(0, (1 - left / +el.dataset.jtotal) * 100)) + '%'; });
}
// ---------- aeroporto: um avião de cada vez, visto de satélite ----------
function air3() {
  if (!S.air3) S.air3 = GL.globe({ home: S.cfg.air.home, homeName: t('airHome'), clock: now, routes: S.cfg.air.routes.map((r) => ({ lat: r.lat, lon: r.lon, name: t('ar_' + r.id).toUpperCase() })) });
  return S.air3;
}
const pctBp = (bp) => (bp / 100).toString().replace('.', lang() === 'pt' ? ',' : '.') + '%';
function screenAir() {
  const me = S.st.me, A = S.cfg.air, f = me.air, n = now(), G = air3(), liquid = me.cash + me.bank;
  const out = [pageHead('air', t('airSub'), true)];
  const drugName = (R) => list('drugs')[S.cfg.drugs.findIndex((d) => d.id === R.drug)] || '';
  const minLvl = A.routes[0].level;
  out.push(G.el); queueMicrotask(() => G.wake());
  if (S.airLast) {
    const L = S.airLast, R = A.routes[L.r];
    out.push(h('div', { class: 'card row gres' }, h('span', { class: L.seized ? 'c-red' : 'c-cash' }, icon(L.seized ? 'lock' : 'cash')),
      h('div', { class: 'grow' }, h('div', null, t(L.seized ? 'airLost' : 'airGot', { x: t('ar_' + R.id), m: money(L.seized ? L.amount : L.got), g: money(L.got - L.amount) })), L.seized ? null : h('div', { class: 'small muted' }, t('airResp', { n: L.respect })))));
  }
  if (f) {
    const R = A.routes[f.r], left = f.readyAt - n, back = f.amount + Math.floor((f.amount * R.gainBp) / 10000), u = Math.min(1, Math.max(0, (n - f.t0) / (f.readyAt - f.t0)));
    G.flight({ r: f.r, t0: f.t0, t1: f.readyAt });
    out.push(h('div', { class: 'card stack airfl' },
      h('div', { class: 'row sp' }, h('div', null, h('div', { class: 'airto' }, t('ar_' + R.id)), h('div', { class: 'small muted' }, drugName(R) + ' · ' + t(left <= 0 ? 'airLanded' : u < 0.47 ? 'airOut' : u < 0.53 ? 'airLoad' : 'airBack'))),
        left > 0 ? h('b', { class: 'gcd num', dataset: { left: f.readyAt } }, dur(left)) : h('b', { class: 'c-cash' }, t('ready'))),
      h('div', { class: 'fill big jbar', dataset: { until: f.readyAt, jtotal: f.readyAt - f.t0 } }, h('i')),
      h('div', { class: 'row sp small' }, h('span', { class: 'muted' }, t('airCargo')), h('b', { class: 'num' }, money(f.amount) + (f.bribe ? ' · ' + t('airBribed') : ''))),
      h('div', { class: 'row sp small' }, h('span', { class: 'muted' }, t('airIfOk')), h('b', { class: 'num c-cash' }, money(back))),
      h('div', { class: 'row sp small' }, h('span', { class: 'muted' }, t('airRisk')), h('b', { class: 'num c-red' }, pctBp(f.bribe ? Math.floor(me.airSeize[f.r] / 2) : me.airSeize[f.r]))),
      h('button', { class: 'btn buy block big', disabled: left > 0, on: { click: async (e) => { const o = await act('airCollect', {}, { el: e.currentTarget }); if (o) { S.airLast = o.result; fx.sfx(o.result.seized ? 'bust' : 'cash'); G.flight(null); render(true); } } } }, t(left > 0 ? 'airWait' : 'airUnload'))));
    return out;
  }
  G.flight(null);
  if (me.level < minLvl) { G.select(-1); out.push(h('div', { class: 'note' }, h('p', { class: 'muted' }, t('airLocked', { n: minLvl })))); return out; }
  const open = A.routes.map((R, i) => i).filter((i) => me.level >= A.routes[i].level);
  const sel = open.includes(S.airSel) ? S.airSel : open[open.length - 1];
  G.select(sel);
  const b = busyBanner(me); if (b) out.push(b);
  out.push(h('div', { class: 'airlist' }, A.routes.map((R, i) => {
    const lock = me.level < R.level;
    return h('button', { class: 'airr' + (i === sel ? ' sel' : '') + (lock ? ' lock' : ''), disabled: lock, 'aria-pressed': i === sel ? 'true' : 'false', on: { click: () => { S.airSel = i; render(true); } } },
      h('div', { class: 'grow' }, h('b', null, t('ar_' + R.id)), h('span', { class: 'small muted' }, lock ? t('airNeed', { n: R.level }) : drugName(R) + ' · ' + hoursText(R.ms / 3600000))),
      lock ? icon('lock') : h('div', { class: 'airn' }, h('b', { class: 'c-cash num' }, '+' + pctBp(R.gainBp)), h('span', { class: 'small c-red num' }, t('airRiskS', { p: pctBp(me.airSeize[i]) }))));
  })));
  const R = A.routes[sel], bribe = !!S.airBribe, max = Math.min(me.airCap, bribe ? Math.floor((liquid * 10000) / (10000 + A.bribeBp)) : liquid);
  const raw = S.airAmt || '', amtOf = (v) => Math.max(0, Math.min(max, v === '' ? max : parseInt(v, 10) || 0));
  const btn = h('button', { class: 'btn buy block big' }), sum = h('div', { class: 'stack', style: 'gap:6px' });
  const inp = h('input', { id: 'bamt', inputmode: 'numeric', autocomplete: 'off', enterkeyhint: 'done', value: raw, placeholder: t('airMaxPh', { m: money(max) }) });
  const sync = () => {
    const a = amtOf(inp.value), extra = bribe ? Math.ceil((a * A.bribeBp) / 10000) : 0, risk = bribe ? Math.floor(me.airSeize[sel] / 2) : me.airSeize[sel], gain = Math.floor((a * R.gainBp) / 10000);
    btn.textContent = t('airGo', { m: moneyShort(a + extra) }); btn.disabled = !!b || a < A.minAmount || S.st.round.playEnd - now() < R.ms;
    sum.replaceChildren(
      h('div', { class: 'row sp small' }, h('span', { class: 'muted' }, t('airIfOk')), h('b', { class: 'num c-cash' }, money(a + gain) + ' (+' + money(gain) + ')')),
      h('div', { class: 'row sp small' }, h('span', { class: 'muted' }, t('airIfBad')), h('b', { class: 'num c-red' }, '−' + money(a + extra) + ' · ' + pctBp(risk))),
      extra ? h('div', { class: 'row sp small' }, h('span', { class: 'muted' }, t('airBribeCost')), h('b', { class: 'num' }, money(extra))) : null);
  };
  const setV = (v) => { inp.value = v; S.airAmt = v; sync(); };
  inp.addEventListener('input', () => { let d = inp.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 15); if (d && parseInt(d, 10) > max) d = String(max); setV(d); });
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
  btn.addEventListener('click', async () => {
    const a = amtOf(inp.value); if (a < A.minAmount) return;
    inp.blur();
    const o = await act('air', { r: sel, amount: a, bribe }, { el: btn });
    if (o) { S.airAmt = ''; S.airLast = null; fx.sfx('deal'); render(true); }
  });
  sync();
  out.push(h('div', { class: 'card stack' },
    h('div', { class: 'field', style: 'margin:0' }, h('label', { for: 'bamt' }, t('airAmt', { m: moneyShort(me.airCap) })), inp),
    h('div', { class: 'bquick' }, [25, 50, 75].map((q) => h('button', { class: 'btn ghost sm', disabled: max <= 0, on: { click: () => setV(String(Math.floor((max * q) / 100))) } }, q + '%')),
      h('button', { class: 'btn ghost sm', disabled: max <= 0, on: { click: () => setV('') } }, t('airMax'))),
    h('div', { class: 'seg', role: 'group' }, [[false, t('airNoBribe')], [true, t('airBribe', { p: A.bribeBp / 100 })]].map(([v, lbl]) => h('button', { 'aria-pressed': bribe === v ? 'true' : 'false', on: { click: () => { S.airBribe = v; render(true); } } }, lbl))),
    sum, btn,
    S.st.round.playEnd - n < R.ms ? h('p', { class: 'small muted' }, t('portEnding')) : null));
  return out;
}
function screenPort() {
  const me = S.st.me;
  const out = [pageHead('port', t('portSub', { p: (me.portSeizeBp / 100).toString().replace('.', lang() === 'pt' ? ',' : '.') }))];
  out.push(portMap(me));
  if (S.portLast?.length) out.push(h('div', { class: 'note stack', style: 'margin-bottom:10px' }, S.portLast.map((c) => h('div', { class: 'row sp' }, h('span', null, icon('ship'), ' ' + money(c.amount)),
    c.seized ? h('b', { class: 'c-red' }, t('portLostRow', { m: money(c.amount) })) : h('b', { class: 'c-cash' }, t('portGotRow', { m: money(c.got), g: money(c.got - c.amount) }))))));
  const pc = h('div', { class: 'card stack' }, h('div', { class: 'small muted' }, t('slots', { a: me.port.length, b: me.portSlots })));
  for (const c of me.port) {
    const left = c.readyAt - now();
    pc.append(h('div', { class: 'cont' }, h('span', { class: 'num' }, icon('ship'), ' ' + money(c.amount)),
      left > 0 ? h('span', { class: 'muted' }, t('arrivesIn', { t: '' }), h('b', { class: 'num', dataset: { left: c.readyAt } }, dur(left))) : h('b', { class: 'c-cash' }, t('ready'))));
  }
  if (me.port.some((c) => c.readyAt <= now())) pc.append(h('button', { class: 'btn buy block', on: { click: (e) => act('collect', {}, { el: e.currentTarget }) } }, t('unload')));
  const liquid = me.cash + me.bank;
  if (me.port.length < me.portSlots) {
    const opts = [0.25, 0.5, 1].map((f) => Math.min(me.portCap, Math.floor(liquid * f))).filter((v, i, a) => v >= S.cfg.port.minAmount && a.indexOf(v) === i);
    if (S.st.round.playEnd - now() < S.cfg.port.ms) pc.append(h('p', { class: 'small muted' }, t('portEnding')));
    else if (!opts.length) pc.append(h('p', { class: 'small muted' }, t('portMin', { m: money(S.cfg.port.minAmount) })));
    else pc.append(h('div', { class: 'row', style: 'flex-wrap:wrap' }, opts.map((v) => h('button', { class: 'btn buy grow', on: { click: (e) => act('port', { amount: v }, { el: e.currentTarget }) } }, t('ship', { m: moneyShort(v) })))));
  }
  out.push(pc);
  return out;
}

// ---------- armas ----------
function screenArms() {
  const me = S.st.me;
  const out = [pageHead('arms', t('s_arms'))];
  for (const [kind, arr, names, lbl, folder] of [['weapon', S.cfg.weapons, list('weaponsL'), t('weapon'), 'weapons'], ['armor', S.cfg.armors, list('armorsL'), t('armor'), 'armors']]) {
    const cur = me[kind];
    out.push(h('h2', { class: 'sec' }, lbl));
    out.push(h('div', { class: 'shop' }, arr.map((g, i) => h('div', { class: 'item' + (i > cur + 1 ? ' dim' : '') }, art(folder, i),
      h('div', { class: 'nm' }, names[i]), h('div', { class: 'small c-resp' }, '+' + g.bp / 100 + '%'),
      i === cur ? h('div', { class: 'tagline c-cash' }, t('inUse')) : i < cur ? h('div', { class: 'tagline muted' }, t('owned'))
        : h('button', { class: 'btn buy block', disabled: i !== cur + 1 || me.cash + me.bank < g.price, on: { click: (e) => act('gear', { kind, idx: i }, { el: e.currentTarget }) } }, t('buyFor', { m: moneyShort(g.price) }))))));
  }
  return out;
}

// ---------- banco, luxos, hospital, prisão, beco ----------
function screenBank() {
  const me = S.st.me, bp = me.bankFeeBp ?? S.cfg.bank.feeBp, mode = S.bankMode === 'wd' ? 'wd' : 'dep', max = mode === 'dep' ? me.cash : me.bank;
  const raw = (S.bankAmt || {})[mode] || '';
  const amtOf = (v) => Math.min(max, v === '' ? max : parseInt(v, 10) || 0);   // campo vazio = tudo
  const btn = h('button', { class: 'btn buy block big' }), net = h('p', { class: 'small muted', style: 'text-align:center;min-height:18px' });
  const inp = h('input', { id: 'bamt', inputmode: 'numeric', autocomplete: 'off', enterkeyhint: 'done', value: raw, placeholder: t('bankAllPh', { m: money(max) }) });
  const sync = () => {
    const a = amtOf(inp.value), fee = mode === 'dep' ? Math.ceil((a * bp) / 10000) : 0;
    btn.textContent = t(mode === 'dep' ? 'depositAll' : 'withdrawAll', { m: money(a) }) + (fee ? ' · ' + t('fee', { m: money(fee) }) : '');
    btn.disabled = a <= 0;
    net.textContent = mode === 'dep' && a > 0 ? t('bankNet', { m: money(a - fee) }) : '';
  };
  const setV = (v) => { inp.value = v; S.bankAmt = { ...(S.bankAmt || {}), [mode]: v }; sync(); };
  inp.addEventListener('input', () => { let d = inp.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 15); if (d && parseInt(d, 10) > max) d = String(max); setV(d); });
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
  btn.addEventListener('click', async () => {
    const a = amtOf(inp.value); if (a <= 0) return;
    inp.blur();
    const o = await act(mode === 'dep' ? 'deposit' : 'withdraw', { amount: a }, { el: btn });
    if (o) { S.bankAmt = { ...(S.bankAmt || {}), [mode]: '' }; render(true); }
  });
  sync();
  return [pageHead('bank', t('bankSub', { p: (bp / 100).toString().replace('.', lang() === 'pt' ? ',' : '.') })),
    h('div', { class: 'card stack' },
      h('div', { class: 'row sp' }, h('span', { class: 'muted' }, icon('cash'), ' ' + t('cash')), h('b', { class: 'c-cash num' }, money(me.cash))),
      h('div', { class: 'row sp' }, h('span', { class: 'muted' }, icon('bank'), ' ' + t('bank')), h('b', { class: 'num' }, money(me.bank)))),
    h('div', { class: 'seg', role: 'group', style: 'margin:12px 0' }, [['dep', t('bankDep')], ['wd', t('bankWd')]].map(([id, lbl]) => h('button', { 'aria-pressed': mode === id ? 'true' : 'false', on: { click: () => { S.bankMode = id; render(true); } } }, lbl))),
    h('div', { class: 'card stack' },
      h('div', { class: 'field', style: 'margin:0' }, h('label', { for: 'bamt' }, t('bankAmt')), inp),
      h('div', { class: 'bquick' }, [25, 50, 75].map((q) => h('button', { class: 'btn ghost sm', disabled: max <= 0, on: { click: () => setV(String(Math.floor((max * q) / 100))) } }, q + '%')),
        h('button', { class: 'btn ghost sm', disabled: max <= 0, on: { click: () => setV('') } }, t('bankAll'))),
      btn, net)];
}
function screenLux() {
  const me = S.st.me, names = list('lux');
  const out = [pageHead('lux', t('luxSub', { n: S.cfg.luxury.respect }))];
  if (me.luxuries < S.cfg.luxury.max) out.push(h('button', { class: 'btn buy block big', style: 'margin-bottom:12px', disabled: me.cash + me.bank < me.luxuryPrice, on: { click: (e) => act('luxury', {}, { el: e.currentTarget }) } },
    t('buyLux', { x: names[me.luxuries], m: moneyShort(me.luxuryPrice) })));
  if (me.luxuries) out.push(h('div', { class: 'chips' }, names.slice(0, me.luxuries).map((n) => h('span', { class: 'chip' }, n))));
  return out;
}
// a casa: vê-se a melhorar, dá respeito e deixa subir as melhorias
const UP_IC = { cofre: 'lock', alarme: 'shield', garagem: 'car', escritorio: 'empire' };
function screenCasa() {
  const me = S.st.me, H = S.cfg.house, cur = H.tiers[me.house], nx = H.tiers[me.house + 1], names = list('houses');
  const pic = (id, cls) => h('img', { class: cls, src: IMG('casa', id), alt: '', width: 600, height: 600, decoding: 'async', on: { error: (e) => e.currentTarget.remove() } });
  const out = [pageHead('casa', t('s_casa'), true)];
  const pct = (v) => (v / 100).toString().replace('.', lang() === 'pt' ? ',' : '.');
  out.push(h('div', { class: 'jobp home' },
    h('div', { class: 'jimg' }, pic(cur.id),
      // o que a casa já tem instalado vê-se logo na imagem
      h('div', { class: 'hups' }, H.ups.map((g, u) => h('span', { class: 'hup' + (me.hu[u] ? ' on' : ''), title: t('hu_' + g.id) }, icon(UP_IC[g.id]), me.hu[u] ? h('b', null, String(me.hu[u])) : null))),
      h('h2', null, names[me.house])),
    h('div', { class: 'small muted' }, t('houseNow', { a: me.house + 1, b: H.tiers.length })),
    nx ? h('div', { class: 'nexth' }, pic(nx.id, 'nximg'), h('div', { class: 'grow' }, h('div', { class: 'small muted' }, t('houseNext')), h('div', { class: 'nm' }, names[me.house + 1]),
      h('div', { class: 'small c-resp' }, icon('crown'), ' +' + nx.resp + ' ' + t('respect').toLowerCase()))) : h('p', { class: 'c-gold' }, t('houseTop')),
    nx ? h('button', { class: 'btn buy block big', disabled: me.cash + me.bank < nx.price, on: { click: (e) => act('house', {}, { el: e.currentTarget }) } }, t('houseBuy', { m: moneyShort(nx.price) })) : null));
  out.push(h('h2', { class: 'sec' }, t('upsTitle')));
  out.push(h('div', { class: 'shop' }, H.ups.map((g, u) => {
    const lv = me.hu[u], price = me.huPrices[u], max = H.tiers.length - 1;
    return h('div', { class: 'item up' },
      h('div', { class: 'uhead' }, h('span', { class: 'uic' }, icon(UP_IC[g.id])), h('div', { class: 'nm' }, t('hu_' + g.id))),
      // barra de níveis: laranja = já tens, cinzento claro = a tua casa deixa, escuro = precisa de casa melhor
      h('div', { class: 'pips', role: 'img', 'aria-label': t('huLevel', { a: lv, b: me.house }) }, Array.from({ length: max }, (_, k) => h('i', { class: k < lv ? 'on' : k < me.house ? 'av' : '' }))),
      h('div', { class: 'small' }, lv ? t('hd_' + g.id, { p: pct(lv * g.bp) }) : h('span', { class: 'muted' }, t('huNone'))),
      lv < me.house ? h('div', { class: 'small c-cash' }, t('huNext', { x: t('hd_' + g.id, { p: pct((lv + 1) * g.bp) }) })) : null,
      lv < me.house ? h('button', { class: 'btn buy block', disabled: me.cash + me.bank < price, on: { click: (e) => act('houseUp', { u }, { el: e.currentTarget }) } }, t('huBuy', { m: moneyShort(price) }))
        : h('div', { class: 'tagline muted small' }, lv >= max ? t('maxed') : t('huNeed')));
  })));
  out.push(h('h2', { class: 'sec' }, t('p_lux')), h('p', { class: 'small muted', style: 'margin-bottom:10px' }, t('luxSub', { n: S.cfg.luxury.respect })), ...screenLux().slice(1));
  return out;
}
function screenHosp() {
  const me = S.st.me, L = live(me);
  const out = [pageHead('hosp', t('s_hosp'))];
  const b = busyBanner(me); if (b) out.push(b);
  if (me.sick) out.push(h('div', { class: 'card detox', style: 'margin-bottom:10px' }, h('b', { class: 'c-red' }, icon('skull'), ' ' + t('sickTitle')),
    h('p', { class: 'small muted' }, t('sickSub', { p: S.cfg.hookers.sickCutBp / 100 })),
    h('button', { class: 'btn buy block', disabled: me.cash + me.bank < me.cure, on: { click: (e) => act('cure', {}, { el: e.currentTarget }) } }, t('cureBtn', { m: money(me.cure) }))));
  if (L.vice > 0) out.push(h('div', { class: 'card detox' },
    meter(t('vice'), L.vice, me.addictionCap, 'vi'),
    h('p', { class: 'small muted' }, t('detoxSub')),
    h('button', { class: 'btn buy block', disabled: !!b || me.cash + me.bank < me.detox, on: { click: (e) => act('detox', {}, { el: e.currentTarget }) } }, t('detoxBtn', { m: money(me.detox) }))));
  else if (!b && !me.sick) out.push(h('div', { class: 'note' }, h('p', { class: 'muted' }, t('healthy'))));
  return out;
}
function screenJail() {
  const out = [pageHead('jail')], b = busyBanner(S.st.me);
  out.push(b || h('div', { class: 'note' }, h('p', { class: 'muted' }, t('notJailed'))));
  return out;
}
function missionText(m) {
  const n = m.need;
  switch (m.type) {
    case 'wins': return n === 1 ? t('m_wins1') : t('m_wins', { n });
    case 'tier': return t('m_tier', { x: list('crimes')[n - 1] });
    case 'biz': return n === 1 ? t('m_biz1') : t('m_biz', { n });
    case 'pvpWins': return n === 1 ? t('m_pvpWins1') : t('m_pvpWins', { n });
    case 'lux': return n === 1 ? t('m_lux1') : t('m_lux', { n });
    default: return t('m_' + m.type, { n });
  }
}
const GOAL_GO = { wins: 'rob', tier: 'rob', stars: 'rob', level: 'rob', trains: 'gym', refills: 'club', gear: 'arms', biz: 'biz', collects: 'biz', ports: 'port', pvpWins: 'fights', lux: 'casa' };
function screenAlley() {
  const m = S.st.me.mission;
  const out = [pageHead('alley', t('s_alley'))];
  if (!m) { out.push(h('div', { class: 'note' }, h('p', null, t('goalsDone')))); return out; }
  out.push(h('div', { class: 'goal' + (m.done ? ' ready' : '') },
    h('div', { class: 'gtop' }, h('span', null, t('goal', { a: m.i + 1, b: m.total })), h('span', { class: 'gr num' }, t('reward', { m: money(m.cash) }))),
    h('div', { class: 'gtxt' }, missionText(m)),
    h('div', { class: 'gprog' }, h('div', { class: 'fill' }, h('i', { style: `width:${Math.min(100, (m.have / m.need) * 100)}%` })), h('span', { class: 'small num' }, Math.min(m.have, m.need) + '/' + m.need)),
    m.done ? h('button', { class: 'btn buy block', on: { click: (e) => act('claim', {}, { el: e.currentTarget }) } }, t('claim', { m: money(m.cash) }))
      : h('button', { class: 'btn block', on: { click: () => go(GOAL_GO[m.type] || 'rob') } }, t('goThere') + ': ' + t('p_' + (GOAL_GO[m.type] || 'rob')))));
  return out;
}

// ---------- lutas e ranking ----------
function screenFights() {
  const me = S.st.me, n = now();
  const out = [pageHead('fights', t('fightsSub'))];
  out.push(h('div', { class: 'hlinks' }, ['gang', 'arms', 'rank'].map((id) => h('button', { class: 'hlink', on: { click: () => go(id) } },
    art('cenas', PLACES[id].img, 'hthumb'), h('span', null, t('p_' + id)), icon('chev')))));
  out.push(h('div', { class: 'seg', role: 'group' }, [['targets', t('targets')], ['events', t('news')]].map(([id, lbl]) =>
    h('button', { 'aria-pressed': S.fightSeg === id ? 'true' : 'false', on: { click: () => { S.fightSeg = id; if (id === 'targets') loadTargets(); else loadEvents(true); render(); } } }, lbl))));
  if (S.fightSeg !== 'events') {
    const b = busyBanner(me); if (b) out.push(b);
    const info = [];
    if (me.shieldUntil > n) info.push(t('newShield', { t: dur(me.shieldUntil - n) }));
    else if (Math.max(me.protectUntil, me.capUntil) > n) info.push(t('protectedUntil', { t: dur(Math.max(me.protectUntil, me.capUntil) - n) }));
    if (n - S.st.round.start < S.cfg.round.noPvpMs) info.push(t('noPvpYet'));
    if (info.length) out.push(h('div', { class: 'tip' }, h('p', null, info.join(' '))));
    if (!S.targets) out.push(h('p', { class: 'muted' }, t('loading')));
    else if (!S.targets.length) out.push(h('div', { class: 'note' }, h('p', { class: 'muted' }, t('noTargets'))));
    else out.push(h('div', { class: 'stack' }, S.targets.map((x) => h('div', { class: 'card tgt' },
      h('div', { class: 'who2' }, S.avOk ? h('img', { class: 'avs', src: AV(x.av || 0), alt: '', width: 96, height: 96, loading: 'lazy' }) : null, h('div', null, h('div', { class: 'nm' }, x.tag ? h('span', { class: 'gtag' }, x.tag) : null, x.tag ? ' ' : '', x.name), h('div', { class: 'lv' }, t('level') + ' ' + x.level + ' · ' + list('titles')[x.level - 1] + ' · ', h('span', { class: 'c-resp' }, icon('crown'), ' ' + short(x.respect))))),
      h('div', { class: 'pct ' + chanceCls(x.chance) }, pct(x.chance)),
      h('div', { class: 'acts' },
        h('button', { class: 'btn danger sm', disabled: !!b, on: { click: (e) => act('attack', { target: x.name, mode: 'beat' }, { el: e.currentTarget }) } }, icon('fist'), t('beat') + ' · +' + x.gain),
        h('button', { class: 'btn sm', disabled: !!b, on: { click: (e) => act('attack', { target: x.name, mode: 'mug' }, { el: e.currentTarget }) } }, icon('cash'), t('rob') + ' · ~' + moneyShort(x.loot)))))));
    out.push(h('button', { class: 'btn ghost block', style: 'margin-top:12px', on: { click: () => { S.targets = null; render(); loadTargets(); } } }, icon('refresh'), t('retry')));
  } else if (!S.events) out.push(h('p', { class: 'muted' }, t('loading')));
  else if (!S.events.length) out.push(h('div', { class: 'note' }, h('p', { class: 'muted' }, t('noEvents'))));
  else out.push(h('div', { class: 'stack' }, S.events.map(eventRow)));
  return out;
}
function screenRank() {
  const out = [pageHead('rank', t('s_rank'))];
  if (!S.ranking) { out.push(h('p', { class: 'muted' }, t('loading'))); return out; }
  const st = h('div', null);
  for (const r of S.ranking.top) st.append(h('div', { class: 'rk' + (r.pos <= 3 ? ' g' + r.pos : '') + (r.me ? ' me' : '') },
    h('div', { class: 'p' }, r.pos), S.avOk ? h('img', { class: 'avs', src: AV(r.av || 0), alt: '', width: 96, height: 96, loading: 'lazy' }) : null, h('div', null, h('div', { style: 'font-weight:700' }, r.tag ? h('span', { class: 'gtag' }, r.tag) : null, r.tag ? ' ' : '', r.name), h('div', { class: 'small muted' }, t('level') + ' ' + r.level + ' · ' + list('titles')[r.level - 1])),
    h('div', { class: 'r num' }, icon('crown'), ' ' + short(r.respect))));
  if (S.ranking.me && S.ranking.me.pos > 100) st.append(h('div', { class: 'rk me' }, h('div', { class: 'p' }, S.ranking.me.pos), h('div', null, S.ranking.me.name), h('div', { class: 'r' }, short(S.ranking.me.respect))));
  out.push(st);
  return out;
}

function eventRow(e) {
  let txt;
  if (e.k === 'gangIn' || e.k === 'gangOut') return h('div', { class: 'card row' }, h('span', { class: e.k === 'gangIn' ? 'c-cash' : 'c-red' }, icon('fist')),
    h('div', { class: 'grow' }, h('div', null, t(e.k === 'gangIn' ? 'evGangIn' : 'evGangOut', { g: e.gang })), h('div', { class: 'small muted' }, dur(now() - e.t))));
  if (e.k === 'gangBail' || e.k === 'gangMedic') return h('div', { class: 'card row' }, h('span', { class: 'c-cash' }, icon(e.k === 'gangBail' ? 'lock' : 'pill')),
    h('div', { class: 'grow' }, h('div', null, t(e.k === 'gangBail' ? 'evBail' : 'evMedic', { who: e.by, m: money(e.money) })), h('div', { class: 'small muted' }, dur(now() - e.t))));
  if (e.k === 'gop') return opResult(e, e.out || e.cancelled ? 0 : e.respect, e.t);
  if (e.crew) txt = t(e.win ? 'evCrew' : 'evCrewLost', { who: e.by, n: e.crew });
  else if (e.mode === 'mug') txt = e.win ? t('evMug', { who: e.by, m: money(e.money) }) : t('evMugLost', { who: e.by });
  else txt = e.win ? t('evBeat', { who: e.by }) : t('evBeatLost', { who: e.by });
  const ago = dur(now() - e.t);
  return h('div', { class: 'card row' }, h('span', { class: e.win ? 'c-red' : 'c-cash' }, icon(e.win ? 'skull' : 'shield')),
    h('div', { class: 'grow' }, h('div', null, txt), h('div', { class: 'small muted' }, ago)),
    e.respect ? h('b', { class: e.respect < 0 ? 'c-red' : 'c-cash' }, (e.respect > 0 ? '+' : '') + e.respect) : null);
}

async function loadTargets() { try { const r = await api('GET', '/api/targets'); S.targets = r.list; if (S.tab === 'fights') render(); } catch {} }
async function loadRanking() { try { S.ranking = await api('GET', '/api/ranking'); if (S.tab === 'rank') render(); } catch {} }
async function loadEvents(seen) {
  try {
    const r = await api('GET', '/api/events'); S.events = r.list;
    S.lastEventSeen = store.get('evSeen', 0);
    if (seen && S.events.length) { S.lastEventSeen = S.events[0].id; store.set('evSeen', S.lastEventSeen); }
    render();
  } catch {}
}

// ---------- casino ----------
// O resultado vem sempre do servidor. Aqui só se anima: a roda gira até ao número que já saiu.
// As animações do jogo correm sempre, mesmo com «remover animações» ou poupança de bateria ligados no telemóvel:
// aqui a animação é o próprio jogo (a bola, a roda, os símbolos a cair).
const RM = () => false;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const CHIPS = [10, 50, 100, 500, 1000, 5000, 10000, 50000, 100000, 500000, 1000000, 5000000, 10000000];
const betMax = () => Math.min(S.st.me.casinoMax, S.st.me.cash);
function chipNow() {
  const min = S.cfg.casino.minBet, v = S.chip ?? store.get('chip', 100);
  return Math.max(min, Math.min(v, Math.max(min, betMax())));
}
function chipPicker() {
  const max = betMax(), cur = chipNow(), min = S.cfg.casino.minBet;
  if (max < min) return h('div', { class: 'tip' }, h('p', null, t('csNoCash', { m: money(min) })), h('button', { class: 'btn sm', on: { click: () => go('bank') } }, t('p_bank')));
  // 5 fichas à volta da que está escolhida, para a aposta em uso estar sempre à vista
  const all = CHIPS.filter((c) => c <= max), at = Math.max(0, all.findLastIndex((c) => c <= cur));
  const from = Math.max(0, Math.min(at - 2, all.length - 5)), vals = all.slice(from, from + 5);
  if (!vals.includes(max) && max > (vals.at(-1) || 0) && from + 5 >= all.length) vals.push(max);
  return h('div', { class: 'chips2', role: 'group', 'aria-label': t('csBet') }, vals.map((v) => h('button', {
    class: 'chip2' + (v === cur ? ' on' : '') + (v === max && !CHIPS.includes(v) ? ' max' : ''), 'aria-pressed': v === cur ? 'true' : 'false',
    on: { click: () => { S.chip = v; store.set('chip', v); render(); } } }, v === max && !CHIPS.includes(v) ? t('csMax') : moneyShort(v))));
}
function csHead(id) {
  const me = S.st.me;
  return [pageHead(id, null, true), h('div', { class: 'row sp cshead' }, h('span', { class: 'muted small' }, t('csInHand')), h('b', { class: 'num c-cash' }, money(me.cash)),
    h('span', { class: 'muted small' }, t('csLimit', { m: moneyShort(me.casinoMax) })))];
}
async function play(g, args, anim) {
  if (S.casinoBusy) return null;
  S.casinoBusy = true; fx.sfx('tap');
  try {
    const out = await api('POST', '/api/act', { type: 'casino', g, ...args, rid: rid() });
    const r = out.result;
    if (anim) await anim(r);
    S.st.me = out.me; S.stAt = now(); if (out.feed) S.feed = out.feed;
    const staked = r.g === 'bj' ? (r.done ? r.hand.bet : 0) : r.bet, net = r.win - staked;
    if (r.g !== 'bj' || r.done) { if (net > 0) { fx.sfx(net >= staked * 5 ? 'crit' : 'cash'); fx.vibrate(15); } else if (net < 0) fx.sfx('fail'); }
    return r;
  } catch (e) {
    if (e.data?.me) { S.st.me = e.data.me; S.stAt = now(); }
    if (e.code && e.code !== 'LOGIN_REQUIRED') toast(errText(e.code), true);
    else if (!e.code) console.error(e);
    return null;
  } finally { S.casinoBusy = false; render(); }
}
function csResult(r, extra) {
  if (!r) return null;
  const staked = r.g === 'bj' ? r.hand.bet : r.bet, net = r.win - staked;
  return h('div', { class: 'csres ' + (net > 0 ? 'win' : net < 0 ? 'lose' : 'push'), role: 'status' },
    extra ? h('div', { class: 'small' }, extra) : null,
    h('b', null, net > 0 ? t('csWon', { m: money(net) }) : net < 0 ? t('csLost', { m: money(-net) }) : t('csPush')));
}

function screenCasino() {
  const me = S.st.me;
  const out = [pageHead('casino', t('s_casino', { m: moneyShort(me.casinoMax) }))];
  out.push(h('div', { class: 'games' }, [['zeus', 'zeus'], ['doce', 'doce'], ['rebucado', 'rebucado'], ['slot', 'slot'], ['wheel', 'roda'], ['roulette', 'roleta'], ['bj', 'blackjack'], ['dice', 'dados']].map(([id, img]) =>
    h('button', { class: 'game', on: { click: () => go(id) } }, art('cenas', img, 'gimg'),
      h('div', { class: 'gtx' }, h('b', null, t('p_' + id)), h('span', { class: 'small muted' }, t('gd_' + id))), icon('chev')))));
  if (me.bj) out.push(h('div', { class: 'tip' }, h('p', null, t('bjOpen')), h('button', { class: 'btn sm', on: { click: () => go('bj') } }, t('bjResume'))));
  return out;
}

// ---- roleta (europeia, um zero) ----
const RL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const rlCol = (n) => (n === 0 ? 'g' : S.cfg.casino.red.includes(n) ? 'r' : 'b');
// ---------- gangue ----------
async function loadGang() { try { S.gang = await api('GET', '/api/gang'); if (S.tab === 'gang') render(); } catch {} }
const gAct = async (type, args, opt) => { const out = await act(type, args, opt); await loadGang(); return out; };
function gangRow(g, me) {
  const full = g.members >= g.slots, lowLvl = me.level < S.cfg.gang.minLevel;
  return h('div', { class: 'card grow2' },
    h('div', { class: 'row sp' }, h('div', null, h('div', { class: 'gname' }, h('span', { class: 'gtag' }, g.tag), ' ' + g.name), h('div', { class: 'small muted' }, t('gLine', { n: g.members, s: g.slots, r: short(g.respect), l: g.leader }))),
      h('b', { class: 'gpos num' }, '#' + g.pos)),
    h('div', { class: 'row sp', style: 'margin-top:10px' }, h('span', { class: 'small' }, t('gLv', { a: g.sede, b: g.armaria })),
      me.gang ? null : h('button', { class: 'btn sm' + (g.open ? ' buy' : ''), disabled: full || lowLvl || g.asked || me.gangWait > now(), on: { click: () => gAct('gangJoin', { id: g.id }) } },
        full ? t('gFull') : g.asked ? t('gAsked') : g.open ? t('gJoin') : t('gAsk'))));
}
function screenGang() {
  const me = S.st.me, G = S.cfg.gang, d = S.gang;
  const out = [pageHead('gang', t('gangSub'))];
  if (!d) { out.push(h('p', { class: 'muted' }, t('loading'))); return out; }
  const mine = d.mine;
  if (!mine) {
    if (me.gangWait > now()) out.push(h('div', { class: 'tip' }, h('p', null, t('gWait', { t: dur(me.gangWait - now()) }))));
    // criar
    const nm = h('input', { id: 'gnm', maxlength: 20, autocomplete: 'off', placeholder: t('gNamePh'), value: S.gDraft?.n || '', on: { input: (e) => { S.gDraft = { ...(S.gDraft || {}), n: e.target.value }; } } });
    const tg = h('input', { id: 'gtg', maxlength: 4, autocomplete: 'off', autocapitalize: 'characters', placeholder: 'ABC', value: S.gDraft?.t || '', on: { input: (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); S.gDraft = { ...(S.gDraft || {}), t: e.target.value }; } } });
    const low = me.level < G.minLevel;
    out.push(h('div', { class: 'card stack', style: 'margin-bottom:16px' }, h('h2', { class: 'sec', style: 'margin:0' }, t('gCreateT')),
      h('div', { class: 'gform' }, h('div', { class: 'field' }, h('label', { for: 'gnm' }, t('gName')), nm), h('div', { class: 'field' }, h('label', { for: 'gtg' }, t('gTag')), tg)),
      low ? h('p', { class: 'small muted' }, t('gNeedLvl', { n: G.minLevel })) : null,
      h('button', { class: 'btn buy block', disabled: low || me.cash + me.bank < G.createCost, on: { click: async () => { const o = await gAct('gangCreate', { name: nm.value, tag: tg.value }); if (o) S.gDraft = null; } } }, t('gCreate', { m: moneyShort(G.createCost) }))));
    out.push(h('h2', { class: 'sec' }, t('gListT')));
    out.push(d.list.length ? h('div', { class: 'stack' }, d.list.map((g) => gangRow(g, me))) : h('div', { class: 'note' }, h('p', { class: 'muted' }, t('gNone'))));
    return out;
  }
  // a minha gangue
  const boss = mine.leaderMe, liquid = me.cash + me.bank;
  out.push(h('div', { class: 'ghead' }, h('div', { class: 'gbig' }, h('span', { class: 'gtag' }, mine.tag), ' ' + mine.name),
    h('div', { class: 'small muted' }, t('gHead', { p: mine.pos, r: short(mine.respect), n: mine.members, s: mine.slots }))));
  out.push(h('div', { class: 'power' },
    h('div', { class: 'card' }, h('b', { class: 'c-cash' }, '+' + (G.lootBpPer * mine.sede) / 100 + '%'), h('span', { class: 'small muted' }, t('gBonusLoot', { n: mine.sede }))),
    h('div', { class: 'card' }, h('b', { class: 'c-red' }, '+' + (G.fightBpPer * mine.armaria) / 100 + '%'), h('span', { class: 'small muted' }, t('gBonusFight', { n: mine.armaria })))));
  out.push(...gangOps(mine, me));
  // cofre e melhorias
  out.push(h('h2', { class: 'sec' }, t('gFundT')));
  const give = [0.1, 0.25, 0.5].map((f) => Math.floor(liquid * f)).filter((v, i, a) => v >= G.donateMin && a.indexOf(v) === i);
  const upRow = (what, lvl, cost, txt) => {
    const max = lvl >= G.maxLevel, miss = max ? 0 : Math.max(0, cost - mine.fund);
    return h('div', { class: 'row sp gup' }, h('div', { class: 'grow' }, h('div', { style: 'font-weight:700' }, txt), h('div', { class: 'small ' + (miss ? 'muted' : 'c-cash') }, max ? t('gMax') : miss ? t('gMiss', { m: money(miss) }) : t('gReady'))),
      max ? null : h('button', { class: 'btn buy sm', disabled: !boss || miss > 0, on: { click: () => gAct('gangUp', { what }) } }, boss ? moneyShort(cost) : t('gBossOnly')));
  };
  out.push(h('div', { class: 'card stack', style: 'margin:0 0 12px' },
    h('div', { class: 'row sp' }, h('span', { class: 'muted' }, t('gFund')), h('b', { class: 'gfund num c-cash' }, money(mine.fund))),
    give.length ? h('div', { class: 'row', style: 'flex-wrap:wrap;gap:8px' }, give.map((v) => h('button', { class: 'btn grow', on: { click: () => gAct('gangDonate', { amount: v }) } }, t('gGive', { m: moneyShort(v) })))) : h('p', { class: 'small muted' }, t('gGiveMin', { m: money(G.donateMin) })),
    h('p', { class: 'small muted' }, t('gFundNote')),
    upRow('sede', mine.sede, G.sede[mine.sede - 1], t('gUpSede', { n: mine.sede + 1 })),
    upRow('armaria', mine.armaria, G.armaria[mine.armaria], t('gUpArm', { n: mine.armaria + 1 }))));
  // pedidos de entrada (só o chefe)
  if (boss && mine.asks.length) out.push(h('h2', { class: 'sec' }, t('gAsksT')), h('div', { class: 'stack' }, mine.asks.map((a) => h('div', { class: 'card row sp' },
    h('div', null, h('div', { style: 'font-weight:700' }, a.name), h('div', { class: 'small muted' }, t('gMemberLine', { l: a.level, r: short(a.respect) }))),
    h('div', { class: 'row', style: 'gap:8px' }, h('button', { class: 'btn ghost sm', on: { click: () => gAct('gangReject', { name: a.name }) } }, t('gNo')), h('button', { class: 'btn buy sm', on: { click: () => gAct('gangAccept', { name: a.name }) } }, t('gYes')))))));
  // membros
  out.push(h('h2', { class: 'sec' }, t('gMembersT', { n: mine.members, s: mine.slots })));
  out.push(h('div', { class: 'stack' }, mine.roster.map((m) => h('div', { class: 'card row gm' + (m.me ? ' me' : '') },
    S.avOk ? h('img', { class: 'avs', src: AV(m.av || 0), alt: '', width: 96, height: 96, loading: 'lazy' }) : null,
    h('div', { class: 'grow' }, h('div', { style: 'font-weight:700' }, m.name, m.leader ? h('span', { class: 'c-resp' }, ' ', icon('crown')) : null), h('div', { class: 'small muted' }, t('gMemberLine', { l: m.level, r: short(m.respect) }) + (m.given ? ' · ' + t('gGave', { m: moneyShort(m.given) }) : '')),
      m.jail > now() ? h('div', { class: 'small c-red' }, t('gInJail'), ' ', h('b', { class: 'num', dataset: { opend: m.jail } }, dur(m.jail - now()))) : m.hosp > now() ? h('div', { class: 'small c-red' }, t('gInHosp'), ' ', h('b', { class: 'num', dataset: { opend: m.hosp } }, dur(m.hosp - now()))) : null),
    !m.me && m.jail > now() ? h('button', { class: 'btn buy sm gsave', disabled: liquid < m.bail, on: { click: () => gAct('gangBail', { name: m.name }) } }, icon('lock'), t('gBail', { m: moneyShort(m.bail) }))
      : !m.me && m.hosp > now() ? h('button', { class: 'btn buy sm gsave', disabled: liquid < m.medic, on: { click: () => gAct('gangMedic', { name: m.name }) } }, icon('pill'), t('gMedic', { m: moneyShort(m.medic) })) : null,
    boss && !m.me ? h('button', { class: 'btn ghost sm', 'aria-label': t('gManage', { a: m.name }), on: { click: () => gangMember(m) } }, '⋯') : null))));
  if (boss) out.push(h('div', { class: 'seg', style: 'margin-top:12px' }, [[true, t('gOpenY')], [false, t('gOpenN')]].map(([v, lbl]) => h('button', { 'aria-pressed': mine.open === v ? 'true' : 'false', on: { click: () => gAct('gangOpen', { open: v }) } }, lbl))));
  // conversa
  out.push(h('h2', { class: 'sec' }, t('gChatT')));
  const inp = h('input', { id: 'gmsg', maxlength: G.chatMax, autocomplete: 'off', enterkeyhint: 'send', placeholder: t('gChatPh'), value: S.gMsg || '', on: { input: (e) => { S.gMsg = e.target.value; }, keydown: (e) => { if (e.key === 'Enter') send(); } } });
  const send = async () => { const txt = inp.value.trim(); if (!txt) return; S.gMsg = ''; inp.value = ''; await gAct('gangChat', { txt }); };
  out.push(h('div', { class: 'card gchat' },
    mine.chat.length ? h('div', { class: 'gmsgs' }, mine.chat.map((m) => h('div', { class: 'gmsg' + (m.me ? ' me' : '') }, h('b', null, m.name), h('span', null, m.txt), h('small', { class: 'muted' }, dur(Math.max(0, now() - m.t)))))) : h('p', { class: 'small muted' }, t('gChatNone')),
    h('div', { class: 'row', style: 'gap:8px' }, h('label', { class: 'sr', for: 'gmsg' }, t('gChatPh')), inp, h('button', { class: 'btn buy', on: { click: send } }, t('gSend')))));
  out.push(h('button', { class: 'btn ghost block', style: 'margin-top:16px', on: { click: () => {
    const close = sheet(h('div', { class: 'stack' }, h('h2', null, t('gLeaveT')), h('p', null, t(mine.members === 1 ? 'gLeaveLast' : boss ? 'gLeaveBoss' : 'gLeaveSub')),
      h('button', { class: 'btn danger block', on: { click: async () => { close(); await gAct('gangLeave', {}); } } }, t('gLeave'))));
  } } }, t('gLeave')));
  queueMicrotask(() => { const b = document.querySelector('.gmsgs'); if (b) b.scrollTop = b.scrollHeight; });
  return out;
}
// ---- operações da gangue: golpes e tareias em grupo ----
const opName = (o) => (o.kind === 'hit' ? t('goHitT', { a: o.target }) : t('gh_' + (o.c || S.cfg.gang.heists[o.k].id)));
// o = { kind, c|k, target, cancelled, gone, out, n, need, ok, money, busted, jailed }
function opText(o) {
  if (o.out) return t('evGopOut');
  if (o.cancelled) return o.gone ? t('goGone', { a: o.target }) : t('goFew', { n: o.n, s: o.need });
  if (o.kind === 'hit') return t(o.ok ? 'goHitOk' : 'goHitBad', { a: o.target });
  if (o.ok) return t('goHeistOk', { x: opName(o), m: money(o.money) });
  return t('goHeistBad', { x: opName(o) }) + (o.jailed?.length ? ' ' + t('goJailed', { a: o.jailed.join(', ') }) : o.busted ? ' ' + t('goYouJail') : '');
}
const opIcon = (o) => (o.cancelled || o.out ? 'timer' : o.kind === 'hit' ? (o.ok ? 'fist' : 'skull') : o.ok ? 'cash' : 'lock');
function opResult(o, resp, when) {
  const bad = o.cancelled || o.out || !o.ok;
  return h('div', { class: 'card row gres' }, h('span', { class: o.cancelled || o.out ? 'muted' : bad ? 'c-red' : 'c-cash' }, icon(opIcon(o))),
    h('div', { class: 'grow' }, h('div', null, opText(o)), h('div', { class: 'small muted' }, dur(Math.max(0, now() - when)))),
    resp ? h('b', { class: 'num ' + (resp < 0 ? 'c-red' : 'c-cash') }, (resp > 0 ? '+' : '') + resp) : null);
}
function gangOps(mine, me) {
  const G = S.cfg.gang, n = now(), op = mine.op, lv = live(me), busy = lv.jail || lv.hosp, en = lv.energy;
  const out = [h('h2', { class: 'sec' }, t('gOpsT'))];
  if (op && op.closesAt > n - 4000) {
    const miss = Math.max(0, op.need - op.parts.length);
    out.push(h('div', { class: 'card gop' },
      h('div', { class: 'gimg' }, h('img', { src: op.kind === 'hit' ? IMG('cenas', 'lutas', 1) : IMG('crimes', G.heists[op.k].id, 1), alt: '', width: 1100, height: 1100, decoding: 'async', on: { error: (e) => e.currentTarget.parentNode.remove() } })),
      h('div', { class: 'row sp' }, h('div', { class: 'gt' }, opName(op)), h('b', { class: 'gcd num', dataset: { opend: op.closesAt } }, dur(Math.max(0, op.closesAt - n)))),
      h('div', { class: 'row sp gline' }, h('span', null, t('goCount', { n: op.parts.length, s: op.need })), h('b', { class: chanceCls(op.chance) }, t('goChance', { p: pct(op.chance) }))),
      h('div', { class: 'small muted' }, op.parts.join(' · ')),
      miss ? h('p', { class: 'small muted' }, miss === 1 ? t('goNeed1') : t('goNeed', { n: miss })) : null,
      op.joined ? h('p', { class: 'gin' }, icon('check'), t('goIn'))
        : h('button', { class: 'btn buy block', disabled: !!busy || en < op.e || op.parts.length >= G.opMax, on: { click: (e) => gAct('gangOpJoin', {}, { el: e.currentTarget }) } }, t('goJoin', { e: op.e })),
      op.mineToCancel ? h('button', { class: 'btn ghost block', on: { click: () => gAct('gangOpCancel', {}) } }, t('goCancel')) : null));
    return out;
  }
  const L = mine.last;
  if (L && n - L.t < 30 * 60000) {
    const eu = (L.parts || []).find((x) => x.name === me.name);
    out.push(opResult({ kind: L.kind, k: L.k, target: L.target, cancelled: L.cancelled, gone: L.gone, n: L.n, need: L.need, ok: L.kind === 'hit' ? L.win : L.success,
      money: eu ? eu.money : L.parts?.[0]?.money || 0, jailed: (L.parts || []).filter((x) => x.busted).map((x) => x.name) }, eu ? eu.respect : 0, L.t));
  }
  const cool = mine.opCool > n, left = Math.max(0, G.heistPerDay - (me.heistsToday || 0));
  if (cool) out.push(h('div', { class: 'tip' }, h('p', null, t('goWait', { t: '' }), h('b', { class: 'num', dataset: { opend: mine.opCool } }, dur(mine.opCool - n)))));
  out.push(h('div', { class: 'card gopl' },
    G.heists.map((H, k) => h('div', { class: 'row sp gup' }, art('crimes', H.id, 'gthumb' + (mine.sede < H.sede ? ' lock' : '')),
      h('div', { class: 'grow' }, h('div', { style: 'font-weight:700' }, t('gh_' + H.id)), h('div', { class: 'small muted' }, t('ghLine', { n: H.need, a: moneyShort(H.min), b: moneyShort(H.max), r: H.r }))),
      mine.sede < H.sede ? h('span', { class: 'small muted glock' }, icon('lock'), t('ghLock', { n: H.sede }))
        : h('button', { class: 'btn buy sm', disabled: cool || !!busy || !left || en < H.e, on: { click: () => gAct('gangOp', { kind: 'heist', k }) } }, t('ghOpen'), ' · ', icon('bolt'), String(H.e)))),
    h('div', { class: 'row sp gup' }, art('cenas', 'lutas', 'gthumb'),
      h('div', { class: 'grow' }, h('div', { style: 'font-weight:700' }, t('goHit')), h('div', { class: 'small muted' }, t('goHitLine', { n: G.hitNeed, m: Math.round((S.cfg.pvp.beatHospMs * G.hitHospBp) / 10000 / 60000) }))),
      h('button', { class: 'btn danger sm', disabled: cool || !!busy || en < S.cfg.pvp.energy, on: { click: () => gangPickTarget() } }, t('goPick'))),
    h('p', { class: 'small muted', style: 'padding-top:10px' }, t('ghLeft', { n: left, s: G.heistPerDay }))));
  return out;
}
async function gangPickTarget() {
  const body = h('div', { class: 'stack' }, h('h2', null, t('goPickT')), h('p', { class: 'muted' }, t('loading')));
  const close = sheet(body);
  try { const r = await api('GET', '/api/targets'); S.targets = r.list; } catch {}
  const L = (S.targets || []).filter((x) => !S.st.me.gang || x.tag !== S.st.me.gang.tag);
  body.replaceChildren(h('h2', null, t('goPickT')), h('p', { class: 'small muted' }, t('goPickSub')),
    ...(L.length ? L.map((x) => h('div', { class: 'card row sp', style: 'background:var(--s2)' },
      h('div', { class: 'grow', style: 'min-width:0' }, h('div', { style: 'font-weight:700' }, x.tag ? h('span', { class: 'gtag' }, x.tag) : null, x.tag ? ' ' : '', x.name), h('div', { class: 'small muted' }, t('gMemberLine', { l: x.level, r: short(x.respect) }))),
      h('button', { class: 'btn danger sm', on: { click: async () => { close(); await gAct('gangOp', { kind: 'hit', target: x.name }); } } }, t('goMark'))))
      : [h('p', { class: 'muted' }, t('noTargets'))]));
}
// contagem das operações: quando chega a zero vai buscar o resultado
setInterval(() => {
  const els = document.querySelectorAll('[data-opend]'); if (!els.length) return;
  let due = false;
  els.forEach((el) => { const left = +el.dataset.opend - now(); el.textContent = dur(Math.max(0, left)); if (left <= -600 && el.dataset.re !== '1') { el.dataset.re = '1'; due = true; } });
  if (due) { loadGang(); refresh(); }
}, 500);
function gangMember(m) {
  const close = sheet(h('div', { class: 'stack' }, h('h2', null, m.name), h('p', { class: 'muted' }, t('gMemberLine', { l: m.level, r: short(m.respect) })),
    h('button', { class: 'btn block', on: { click: async () => { close(); await gAct('gangLeader', { name: m.name }); } } }, t('gMakeBoss')),
    h('button', { class: 'btn danger block', on: { click: async () => { close(); await gAct('gangKick', { name: m.name }); } } }, t('gKick'))));
}
// a conversa e os pedidos atualizam-se sozinhos enquanto estás no ecrã (sem mexer no que estás a escrever)
setInterval(() => { if (S.st?.me && S.tab === 'gang' && !document.hidden && document.activeElement?.id !== 'gmsg' && !document.querySelector('.sheet')) loadGang(); }, 8000);

// ---------- mesas ao vivo: roleta e roda ----------
// A ronda é a mesma para toda a gente. Cada toque numa casa põe logo a ficha na mesa (o dinheiro sai da mão);
// quando as apostas fecham, o servidor manda o resultado e todos veem a mesma jogada ao mesmo tempo.
const liveOf = (g) => ((S.live ||= {})[g] ||= { d: null, anim: 0, shown: 0, busy: false, at: 0, prev: store.get('lvprev_' + g, null) });
async function livePoll(g) {
  const L = liveOf(g); if (L.busy) return;
  L.busy = true; L.at = performance.now();
  try {
    const r = await fetch('/api/table?g=' + g, { credentials: 'same-origin' }); if (!r.ok) return;
    const d = await r.json(), old = L.d;
    if (d.now) S.off = d.now - Date.now();
    L.d = d; if (d.last && !L.prev) L.prev = d.last.bets;
    if (S.tab !== g) return;
    if (d.phase === 'spin' && L.anim !== d.id) {
      L.anim = d.id;
      const late = d.now - (d.closesAt + LIVE_START);   // a jogada começa à mesma hora (do servidor) em todos os telemóveis
      if (late < 2500 && !S.casinoBusy) { S.casinoBusy = true; setTimeout(() => liveAnim(g, d), Math.max(0, -late)); }
      else { L.shown = d.id; if (g === 'roulette') rl3().set(d.res.n); else w3().set(d.res.idx); render(); }   // entrou a meio: vê só onde parou
    } else if (!S.casinoBusy && (!old || old.id !== d.id || old.phase !== d.phase)) render();
    else liveClock(g);
  } catch { /* sem rede: tenta outra vez daqui a pouco */ } finally { L.busy = false; }
}
function liveClock(g) {
  const el = document.querySelector('.lvstrip'), d = liveOf(g).d; if (!el || !d) return;
  const n = now(), left = d.phase === 'bets' ? d.closesAt - n : 0, open = left > 0;
  el.classList.toggle('open', open); el.classList.toggle('hot', open && left < 5000);
  el.querySelector('.lvt').textContent = open ? t('lvOpen', { s: Math.ceil(left / 1000) })
    : d.phase === 'spin' && !S.casinoBusy && n < d.nextAt ? t('lvNext', { s: Math.max(1, Math.ceil((d.nextAt - n) / 1000)) }) : d.phase === 'spin' ? t('lvSpin') : t('lvClosed');
  el.querySelector('.lvp').textContent = d.players ? t('lvPlayers', { n: d.players, m: moneyShort(d.pot) }) : t('lvEmpty');
  el.querySelector('.lvbar i').style.transform = `scaleX(${open ? Math.min(1, left / (d.closesAt - d.opensAt)) : 0})`;
  document.querySelector('.lvboard')?.classList.toggle('shut', !open);
}
setInterval(() => {
  const g = S.tab; if (!S.st?.me || (g !== 'roulette' && g !== 'wheel') || document.hidden) return;
  const L = liveOf(g), d = L.d, n = now(), since = performance.now() - L.at;
  liveClock(g);
  if (!d) { if (since > 1500) livePoll(g); return; }
  if (d.phase === 'bets' ? (n >= d.closesAt + 150 ? since > 300 : since > 2000) : (n >= d.nextAt + 150 ? since > 600 : since > 4000)) livePoll(g);   // mal as apostas fecham, vai buscar o resultado: a jogada começa 1 s depois do fecho em todos
}, 250);
const LIVE_START = 1000;
async function liveAnim(g, d) {
  const L = liveOf(g), mine = d.mine;
  S.casinoBusy = true;
  if (S.tab !== g) { S.casinoBusy = false; L.shown = d.id; return; }   // saíste da mesa antes de a jogada começar
  C3.seed(d.id);   // o mesmo lançamento, a mesma bola e o mesmo baralhar para toda a gente
  try {
    const r = g === 'roulette' ? { n: d.res.n, t0: (d.closesAt + LIVE_START) / 1000 } : { ...d.res, from: d.prev, bet: mine?.total || 0, win: mine?.win || 0, mineBets: mine?.bets || [] };
    await Promise.race([(g === 'roulette' ? rlAnim : wheelAnim)(r), wait(50000)]);
    if (mine) { const net = (mine.win || 0) - mine.total; if (net > 0) { fx.sfx(net >= mine.total * 5 ? 'crit' : 'cash'); fx.vibrate(15); } else if (net < 0) fx.sfx('fail'); }
  } catch (e) { console.error(e); } finally { C3.seed(null); S.casinoBusy = false; L.shown = d.id; await refresh(); render(); }
}
async function liveBet(g, bets) {
  const L = liveOf(g), d = L.d;
  if (!d || d.phase !== 'bets' || now() >= d.closesAt) return toast(errText('BETS_CLOSED'), true);
  const out = await act('tableBet', { g, bets: Array.isArray(bets) ? bets : [bets] });
  if (out) { L.prev = out.result.bets; store.set('lvprev_' + g, L.prev); }   // fica guardada para o botão «Repetir» das rondas seguintes
  if (out && L.d && out.result.round === L.d.id) { const had = !!L.d.mine; L.d.mine = { bets: out.result.bets, total: out.result.total }; L.d.pot += out.result.bet; if (!had) L.d.players += 1; }
  render();
}
async function liveClear(g) {
  const L = liveOf(g), out = await act('tableClear', { g });
  if (out && L.d && out.result.round === L.d.id && L.d.mine) { L.d.pot -= out.result.back; L.d.players -= 1; L.d.mine = null; }
  render();
}
function liveStrip(g) {
  const d = liveOf(g).d;
  queueMicrotask(() => liveClock(g));
  return h('div', { class: 'lvstrip' }, h('div', { class: 'row sp' }, h('b', { class: 'lvt num' }, d ? '' : t('loading')), h('span', { class: 'lvp small muted' })), h('div', { class: 'lvbar' }, h('i')));
}
function liveBar(g) {
  const L = liveOf(g), mine = L.d?.mine;
  return h('div', { class: 'lvbar2' }, chipPicker(),
    h('div', { class: 'row sp' }, h('span', { class: 'small' }, t('lvOnTable') + ' ', h('b', { class: 'num c-cash' }, money(mine?.total || 0))),
      h('div', { class: 'row', style: 'gap:8px' },
        h('button', { class: 'btn ghost sm', disabled: !!mine || !L.prev, on: { click: () => liveBet(g, L.prev) } }, t('lvRepeat')),
        h('button', { class: 'btn ghost sm', disabled: !mine, on: { click: () => liveClear(g) } }, t('csClear')))));
}
function liveResult(g, d) {
  const mine = d.mine, net = mine ? (mine.win || 0) - mine.total : 0, r = d.res;
  const what = g === 'roulette' ? t('rlOut', { n: r.n, c: t('rlc_' + rlCol(r.n)) }) : t('wOut', { s: wLabel(r.s) }) + (r.bonus || (r.top && r.top.s === r.s) ? ' · ×' + r.mult : '');
  return h('div', { class: 'csres ' + (!mine || !net ? 'push' : net > 0 ? 'win' : 'lose'), role: 'status' }, h('div', { class: 'small' }, what),
    mine ? h('b', null, net > 0 ? t('csWon', { m: money(net) }) : net < 0 ? t('csLost', { m: money(-net) }) : t('csPush')) : null,
    mine && mine.win > 0 ? h('div', { class: 'small' }, t('lvBreak', { w: money(mine.win), b: money(mine.total) })) : null,   // as contas à vista: o que voltou e o que estava na mesa
    d.wins?.length ? h('div', { class: 'small muted' }, d.wins.map((w) => w.name + ' +' + moneyShort(w.win)).join(' · ')) : null);
}

// ---- roleta ----
function rl3() { if (!S.rl3) S.rl3 = C3.roulette({ order: RL_ORDER, colorOf: rlCol, sfx: fx.sfx }); return S.rl3; }
async function rlAnim(r) {
  const T = rl3(); await tableFocus(T.el.parentNode || T.el, true);
  document.querySelector('.rl3num')?.classList.remove('on');
  await T.spin(r.n, r.t0);
  const bd = document.querySelector('.rl3num'); if (bd) { bd.textContent = String(r.n); bd.className = 'rl3num num on ' + rlCol(r.n); }
  await wait(1300);
}
const rlKey = (b) => b.t + (b.n !== undefined && b.n !== null ? ':' + b.n : '');
function screenRoulette() {
  const g = 'roulette', L = liveOf(g), d = L.d, T = rl3();
  const bets = Object.fromEntries((d?.mine?.bets || []).map((b) => [rlKey(b), b]));
  const n = d && d.phase === 'spin' && L.shown === d.id ? d.res.n : null;
  const cell = (t0, nn, label, cls) => {
    const b = bets[rlKey({ t: t0, n: nn })];
    return h('button', { class: 'rlc ' + (cls || '') + (n !== null && rlWon({ t: t0, n: nn }, n) ? ' hit' : ''), on: { click: () => liveBet(g, nn === undefined ? { t: t0, amt: chipNow() } : { t: t0, n: nn, amt: chipNow() }) } },
      label, b ? h('span', { class: 'chipm' }, moneyShort(b.amt)) : null);
  };
  const out = csHead('roulette');
  out.push(h('div', { class: 'rlbox' }, h('div', { class: 'rl3wrap' }, T.el, h('b', { class: 'rl3num num' + (n !== null ? ' on ' + rlCol(n) : '') }, n !== null ? String(n) : ''))));
  out.push(liveStrip(g));
  if (n !== null) out.push(liveResult(g, d));
  out.push(h('div', { class: 'rlhist' }, (d?.hist || []).slice(n === null && d?.phase === 'spin' ? 1 : 0, 13).map((x, i) => h('span', { class: 'hn ' + rlCol(x) + (i === 0 ? ' last' : '') }, String(x)))));
  out.push(liveBar(g));
  out.push(h('div', { class: 'lvboard' },
    h('div', { class: 'rlout' }, cell('red', undefined, t('rl_r'), 'r'), cell('black', undefined, t('rl_b'), 'b'), cell('even', undefined, t('rlEven')), cell('odd', undefined, t('rlOdd')),
      cell('low', undefined, '1–18'), cell('high', undefined, '19–36'), cell('dozen', 0, '1–12', 'dz'), cell('dozen', 1, '13–24', 'dz'), cell('dozen', 2, '25–36', 'dz')),
    h('h2', { class: 'sec small' }, t('rlNums')),
    h('div', { class: 'rlnums' }, cell('num', 0, '0', 'g n0'), Array.from({ length: 36 }, (_, i) => cell('num', i + 1, String(i + 1), rlCol(i + 1))))));
  out.push(h('p', { class: 'small muted', style: 'margin:12px 0 0' }, t('lvHow')));
  T.wake();
  return out;
}
function rlWon(b, n) {
  const red = S.cfg.casino.red.includes(n);
  switch (b.t) {
    case 'red': return n > 0 && red; case 'black': return n > 0 && !red; case 'even': return n > 0 && n % 2 === 0; case 'odd': return n % 2 === 1;
    case 'low': return n >= 1 && n <= 18; case 'high': return n >= 19; case 'dozen': return n > 0 && Math.floor((n - 1) / 12) === b.n; case 'num': return n === b.n;
  }
  return false;
}

// ---- dados ----
function dc3() { if (!S.dc3) S.dc3 = C3.diceTable({ sfx: fx.sfx }); return S.dc3; }
async function diceAnim(r) {
  const T = dc3(); await tableFocus(T.el);
  await T.roll(r.d[0], r.d[1]);
  const sum = document.querySelector('.dcsum'); if (sum) { sum.textContent = String(r.d[0] + r.d[1]); sum.classList.add('on'); }
  fx.sfx('claim'); S.diceLast = r; await wait(RM() ? 300 : 1100);
}
function screenDice() {
  const pick = S.dicePick || 'low', D = S.cfg.casino.dice, last = S.diceLast, chip = chipNow(), T = dc3();
  if (!S.casinoBusy && last) T.set(last.d[0], last.d[1]);
  const out = csHead('dice');
  out.push(h('div', { class: 'dcwrap' }, T.el, h('b', { class: 'dcsum num' + (last ? ' on' : '') }, last ? String(last.d[0] + last.d[1]) : '')));
  if (last) out.push(csResult(last, t('dcOut', { n: last.d[0] + last.d[1] })));
  out.push(h('div', { class: 'dcpicks', role: 'group' }, [['low', '2–6'], ['seven', '7'], ['high', '8–12']].map(([id, rng0]) =>
    h('button', { class: 'dcp' + (pick === id ? ' on' : ''), 'aria-pressed': pick === id ? 'true' : 'false', on: { click: () => { S.dicePick = id; render(); } } },
      h('b', null, t('dc_' + id)), h('span', null, rng0), h('span', { class: 'c-cash' }, t('csPays', { x: (D[id] / 10).toString().replace('.', lang() === 'pt' ? ',' : '.') }))))));
  out.push(h('div', { class: 'stick csbar' }, chipPicker(),
    h('button', { class: 'btn buy block big', disabled: betMax() < S.cfg.casino.minBet || S.casinoBusy, on: { click: () => play('dice', { pick, amt: chip }, diceAnim) } }, t('dcRoll', { m: moneyShort(chip) }))));
  return out;
}

// ---- blackjack ----
const SUITS = ['♠', '♥', '♦', '♣'], RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const card = (c, cls = '', delay = 0) => c === null
  ? h('div', { class: 'pc back ' + cls, style: `--d:${delay}ms`, 'aria-label': t('bjHidden') })
  : h('div', { class: 'pc ' + (c % 52 >= 13 && c % 52 < 39 ? 'red ' : '') + cls, style: `--d:${delay}ms`, 'aria-label': RANKS[c % 13] + SUITS[Math.floor((c % 52) / 13)] },
    h('b', null, RANKS[c % 13]), h('span', null, SUITS[Math.floor((c % 52) / 13)]));
function screenBJ() {
  const me = S.st.me, view = S.bjView || me.bj, done = S.bjDone, anim = S.bjAnim || {}, chip = chipNow();
  const out = csHead('bj');
  const dl = view ? (done ? view.dl : [view.dl[0], null]) : [], pl = view ? view.pl : [];
  const row = (cards, from, flipAt) => h('div', { class: 'hand' }, cards.map((c, i) => card(c, i >= from ? 'deal' : i === flipAt ? 'flip' : '', Math.max(0, i - from) * 260)));
  out.push(h('div', { class: 'felt' },
    h('div', { class: 'hlab' }, t('bjDealer'), view ? h('b', { class: 'num' }, done ? String(view.dtot) : '?') : null),
    row(dl, anim.dl ?? 99, anim.flip ? 1 : -1),
    done && S.bjLast ? h('div', { class: 'bjres', style: `--d:${S.bjAnim ? 700 : 0}ms` }, csResult(S.bjLast, t('bj_' + S.bjLast.res))) : null,
    h('div', { class: 'hlab' }, t('bjYou'), view ? h('b', { class: 'num' }, String(view.tot)) : null),
    row(pl, anim.pl ?? 99, -1),
    !view ? h('p', { class: 'muted small', style: 'text-align:center' }, t('bjRules')) : null));
  const open = me.bj && !done;
  if (open) {
    const canDbl = view.pl.length === 2 && !view.dbl && me.cash >= view.bet;
    out.push(h('div', { class: 'stick csbar' }, h('div', { class: 'small muted', style: 'text-align:center' }, t('bjStake', { m: money(view.bet) })),
      h('div', { class: 'bjacts' },
        h('button', { class: 'btn big', disabled: S.casinoBusy, on: { click: () => bjPlay('hit') } }, t('bjHit')),
        h('button', { class: 'btn buy big', disabled: S.casinoBusy, on: { click: () => bjPlay('stand') } }, t('bjStand')),
        h('button', { class: 'btn ghost big', disabled: !canDbl || S.casinoBusy, on: { click: () => bjPlay('double') } }, t('bjDouble')))));
  } else {
    out.push(h('div', { class: 'stick csbar' }, chipPicker(),
      h('button', { class: 'btn buy block big', disabled: betMax() < S.cfg.casino.minBet || S.casinoBusy, on: { click: () => bjPlay('deal', chip) } }, t('bjDeal', { m: moneyShort(chip) }))));
  }
  return out;
}
async function bjPlay(op, amt) {
  const prev = op === 'deal' ? null : (S.bjView || S.st.me.bj);
  const r = await play('bj', { op, amt }, async (res) => {
    const h0 = res.hand;
    S.bjAnim = { pl: prev ? prev.pl.length : 0, dl: res.done ? (prev ? 1 : 0) : prev ? 99 : 0, flip: res.done && !!prev };
    if (res.done && !prev) S.bjAnim.dl = 0;
    S.bjView = h0; S.bjDone = res.done; S.bjLast = res.done ? res : null;
    render(true);
    const n = (h0.pl.length - S.bjAnim.pl) + (res.done ? h0.dl.length - Math.min(S.bjAnim.dl, h0.dl.length) : 0);
    for (let k = 0; k < Math.max(1, n); k++) setTimeout(() => fx.sfx('deal'), k * 260);
    await wait(RM() ? 200 : 260 * Math.max(1, n) + 350);
  });
  S.bjAnim = null;
  if (r && !r.done) { S.bjView = null; S.bjDone = false; }
  render();
}

// ---- Roda da Sorte ----
// cores de casino noir: pedras preciosas escuras com letras douradas
const WCOL = { 1: '#2b5a8c', 2: '#12805a', 5: '#a8243f', 10: '#5b3bb5', moeda: '#b8860b', caixas: '#0e7a8a', bola: '#a3246e', louca: '#c2161f' };
const LCOL = ['#c2161f', '#1c2330', '#0f5c44', '#b8860b', '#3b2a7a', '#a3246e'];
const TOPM = [2, 3, 5, 10, 20, 50];
const wLabel = (s) => (/^\d+$/.test(s) ? s : t('w_' + s));
function w3() {
  if (!S.w3 || S.w3lang !== lang()) {
    S.w3 = C3.bigWheel({ sfx: fx.sfx, hub: t('p_wheel').toUpperCase(), segs: S.cfg.casino.wheel.segs.map((k) => ({ text: /^\d+$/.test(k) ? k : t('w_' + k).toUpperCase(), color: WCOL[k], ink: '#f6e3a8', big: /^\d+$/.test(k) })) });
    S.w3lang = lang();
  }
  return S.w3;
}
// põe a mesa à vista e encolhe a barra de baixo enquanto a jogada corre
async function tableFocus(el, fixed) {
  document.querySelector('.csres')?.remove();
  document.querySelector('.csbar')?.classList.add('anim');
  const top = document.querySelector('.hud')?.offsetHeight || 0, b = el.getBoundingClientRect();
  if (b.top < top || b.bottom > innerHeight - 170) { scrollTo({ top: Math.max(0, b.top + scrollY - top - 8), behavior: RM() ? 'auto' : 'smooth' }); if (!fixed) await wait(RM() ? 0 : 320); }
  if (fixed) await wait(320);   // nas mesas ao vivo o tempo é o mesmo para todos, tenha ou não sido preciso deslizar o ecrã
}
function topSlotEl(last) {
  const cellS = (s) => h('span', { class: 'tsp', style: `background:${WCOL[s]}` }, wLabel(s)), cellM = (m) => h('span', null, '×' + m);
  return h('div', { class: 'tslot' + (last ? (last.top ? ' match' : ' miss') : '') },
    h('div', { class: 'tsr a' }, h('div', { class: 'tss' }, last?.top ? cellS(last.top.s) : h('span', { class: 'muted' }, '?'))),
    h('div', { class: 'tsr b' }, h('div', { class: 'tss' }, last?.top ? cellM(last.top.m) : h('span', { class: 'muted' }, '×?'))));
}
async function topSpin(r) {
  const el = document.querySelector('.tslot'); if (!el) return;
  el.classList.remove('match', 'miss');
  const spots = S.cfg.casino.wheel.spots, rnd = (a) => a[Math.floor(Math.random() * a.length)], HH = 40;
  const A = Array.from({ length: 16 }, () => rnd(spots)), B = Array.from({ length: 22 }, () => rnd(TOPM));
  A.push(r.top ? r.top.s : rnd(spots)); B.push(r.top ? r.top.m : rnd(TOPM)); B.push(rnd(TOPM));
  const sa = el.querySelector('.tsr.a .tss'), sb = el.querySelector('.tsr.b .tss');
  sa.replaceChildren(...A.map((s) => h('span', { class: 'tsp', style: `background:${WCOL[s]}` }, wLabel(s)))); sb.replaceChildren(...B.map((m) => h('span', null, '×' + m)));
  const da = RM() ? 200 : 1500, db = RM() ? 250 : 2200;
  [sa, sb].forEach((s) => { s.style.transition = 'none'; s.style.transform = 'translateY(0)'; }); void sa.offsetHeight;
  sa.style.transition = `transform ${da}ms cubic-bezier(.15,.75,.2,1)`; sb.style.transition = `transform ${db}ms cubic-bezier(.15,.75,.2,1)`;
  sa.style.transform = `translateY(${-(A.length - 1) * HH}px)`;
  // sem multiplicador: o segundo rolo pára desalinhado, entre dois valores
  sb.style.transform = `translateY(${-(B.length - 2) * HH - (r.top ? 0 : HH / 2)}px)`;
  if (!RM()) for (let k = 0, t0 = 0; t0 < db * 0.85; k++) { t0 += 50 + k * k * 1.6; setTimeout(() => fx.sfx('tick'), t0); }
  await wait(db + 120);
  el.classList.add(r.top ? 'match' : 'miss'); fx.sfx(r.top ? 'claim' : 'tap');
  await wait(RM() ? 150 : r.top ? 900 : 450);
}
async function wheelAnim(r) {
  const box = document.querySelector('.wbox'); if (!box) return;
  const W3 = w3(), stage = box.querySelector('.wstage'), bet = (r.mineBets || []).find((b) => b.s === r.s)?.amt || 0;
  await tableFocus(box, true);
  const ts = topSpin(r);   // o multiplicador do topo sorteia-se enquanto a roda já gira
  await W3.spin(r.idx, r.from); await ts;
  const topHit = r.top && r.top.s === r.s, show = (cls, ...kids) => { stage.className = 'wstage ' + cls; stage.hidden = false; stage.replaceChildren(...kids.filter(Boolean)); };
  if (r.bonus) {
    show('th-' + r.s + ' intro', h('b', { class: 'wst-title' }, t('wb_' + r.s))); fx.sfx('level'); await wait(RM() ? 400 : 1500);
    show('th-' + r.s, h('b', { class: 'wst-name' }, t('wb_' + r.s)));
    if (r.s === 'moeda') await C3.coinFlip(stage, { sides: r.bonus.sides, side: r.bonus.side, sfx: fx.sfx, L: { red: t('rl_r'), blue: t('wBlue') } });
    else if (r.s === 'caixas') await C3.cashHunt(stage, { secs: 7, boxes: r.bonus.boxes, pick: r.bonus.pick, sfx: fx.sfx, L: { prizes: t('wPrizes'), shuffle: t('wShuffle'), pick: t('wPick') } });
    else if (r.s === 'bola') await C3.pachinko(stage, { slots: r.bonus.slots, at: r.bonus.at, sfx: fx.sfx });
    else {
      const lw = C3.bigWheel({ sfx: fx.sfx, cls: 'bw3 mini', turns: 4, secs: 7.5, hub: t('w_louca').toUpperCase(), segs: r.bonus.slots.map((v, i) => ({ text: '×' + v, color: LCOL[i % LCOL.length], ink: '#f6e3a8', big: true })) });
      stage.append(lw.el); lw.wake(); await wait(400); await lw.spin(r.bonus.at);
    }
  }
  // resultado em grande, com tempo para se ler
  const net = r.win - r.bet, base = topHit ? r.mult / r.top.m : r.mult;
  show('th-' + r.s + ' res',
    h('span', { class: 'wst-chip', style: `background:${WCOL[r.s]}` }, wLabel(r.s)),
    h('b', { class: 'wst-x' }, r.bonus || topHit ? '×' + r.mult : r.s + ':1'),
    topHit ? h('span', { class: 'wst-sub' }, t('wTopCalc', { a: base, b: r.top.m })) : null,
    bet && r.win > 0 ? h('span', { class: 'wst-sub' }, t('lvBreak', { w: money(r.win), b: money(r.bet) })) : null,
    h('b', { class: 'wst-win ' + (!bet ? 'muted' : net > 0 ? 'c-cash' : net < 0 ? 'c-red' : '') }, !bet ? t('wNoBet', { s: wLabel(r.s) }) : net > 0 ? t('csWon', { m: money(net) }) : net < 0 ? t('csLost', { m: money(-net) }) : t('csPush')));
  if (net > 0) { fx.sfx(r.mult >= 20 ? 'crit' : 'cash'); fx.vibrate(20); }
  await wait(r.bonus ? 3200 : net > 0 ? 2600 : 2000);
}
function screenWheel() {
  const g = 'wheel', L = liveOf(g), d = L.d, W = S.cfg.casino.wheel, W3 = w3();
  const bets = Object.fromEntries((d?.mine?.bets || []).map((b) => [b.s, b.amt]));
  const res = d && d.phase === 'spin' && L.shown === d.id ? d.res : null;
  const out = csHead('wheel');
  out.push(h('div', { class: 'wbox' }, topSlotEl(res), W3.el, h('div', { class: 'wstage', hidden: true })));
  out.push(liveStrip(g));
  if (res) out.push(liveResult(g, d));
  out.push(h('div', { class: 'whist' }, (d?.hist || []).slice(!res && d?.phase === 'spin' ? 1 : 0, 11).map((x, i) => h('span', { class: 'wh' + (i === 0 ? ' last' : ''), style: `background:${WCOL[x.s]}` },
    /^\d+$/.test(x.s) ? (x.m > +x.s ? x.s + ' ×' + x.m / +x.s : x.s) : wLabel(x.s) + ' ×' + x.m))));
  out.push(liveBar(g));
  out.push(h('div', { class: 'wspots lvboard' }, W.spots.map((s) => h('button', { class: 'wsp' + (res && res.s === s ? ' hit' : ''), style: `--c:${WCOL[s]}`, on: { click: () => liveBet(g, { s, amt: chipNow() }) } },
    h('b', null, wLabel(s)), h('span', { class: 'small' }, /^\d+$/.test(s) ? s + ':1' : t('wBonus')), bets[s] ? h('span', { class: 'chipm' }, moneyShort(bets[s])) : null))));
  out.push(h('p', { class: 'small muted', style: 'margin:12px 0 0' }, t('wRules') + ' ' + t('lvHow')));
  W3.wake();
  return out;
}

// ---- slots ----
// Quatro jogos: Chefão (o nosso), Trovão de Zeus 1000, Doce Vingança (6×5, paga em qualquer sítio) e Rebuçado Louco 1000 (7×7 por grupos).
const SLOT_OF = { slot: 'chefao', zeus: 'zeus', doce: 'doce', rebucado: 'rebucado' };
const SYM = (g, i) => `/img/slot/${g}/${i}.webp?4`;
const slotCfg = (g) => S.cfg.casino.slots[g];
function symImg(g, s, orb) {
  const G = slotCfg(g), big = orb >= 100 && (g === 'zeus' || g === 'doce');
  return SYM(g, s === G.nsym + 1 && big ? '10b' : s);
}
function slotCellEl(g, s, orb) {
  const G = slotCfg(g), cls = 'sc2' + (s === G.nsym ? ' scat' : s === G.nsym + 1 ? ' orb' : '');
  return h('div', { class: cls }, h('img', { src: symImg(g, s, orb), alt: '', width: 80, height: 80, decoding: 'async' }), orb ? h('b', { class: 'ov' + (orb >= 100 ? ' v100' : orb >= 25 ? ' v25' : orb >= 10 ? ' v10' : '') }, '×' + orb) : null);
}
// as casas com multiplicador são do tabuleiro, não dos símbolos: ficam paradas por baixo enquanto os símbolos caem
const spotCls = (v) => 'ssp' + (v === 1 ? ' mk' : v >= 2 ? ' mx' + (v >= 64 ? ' v64' : v >= 16 ? ' v16' : v >= 8 ? ' v8' : v >= 4 ? ' v4' : '') : '');
function slotSpots(grid, sp) {
  const lay = grid.parentNode?.querySelector('.sspots'); if (!lay || !sp) return;
  const cols = slotCfg(S.slotGame || 'rebucado').cols, many = [...lay.children].filter((el, i) => (sp[i] || 0) !== (+el.dataset.v || 0)).length > 14;
  const labs = grid.parentNode?.querySelector('.ssplab'); let best = 0;
  [...lay.children].forEach((el, i) => {
    const v = sp[i] || 0, old = +el.dataset.v || 0; if (v === old) return;
    el.dataset.v = v; el.className = spotCls(v) + (many && v >= 2 ? ' deal' : v > old ? ' bump' : ''); el.textContent = '';
    const lb = labs?.children[i]; if (lb) { lb.textContent = v >= 2 ? '×' + v : ''; lb.className = 'spl' + (v >= 64 ? ' v64' : v >= 16 ? ' v16' : v >= 8 ? ' v8' : v >= 4 ? ' v4' : '') + (many && v >= 2 ? ' deal' : v > old && v >= 2 ? ' bump' : ''); lb.style.animationDelay = el.style.animationDelay; }
    if (!many && v > old && v >= 2) { best = Math.max(best, v); if (!S.slotSkip && !RM()) candyBurst(grid, i, v); }
    // tabuleiro da compra super: as casas acendem-se uma a uma, em diagonal
    el.style.animationDelay = many ? ((i % cols) + Math.floor(i / cols)) * 55 + 'ms' : '';
  });
  if (many && !S.slotSkip) { fx.sfx('refill'); return wait(13 * 55 + 500); }
  // um multiplicador que subiu fica à vista um bocado (mais tempo quanto maior)
  if (best && !S.slotSkip && !RM()) { fx.sfx(best >= 8 ? 'crit' : 'claim'); if (best >= 8) { fx.vibrate(18); slotShake(grid, best >= 32); } return wait(best >= 16 ? 900 : best >= 4 ? 620 : 420); }
}
function slotGrid(g) {
  const G = slotCfg(g), n = G.cols * G.rows, last = S.slotLast?.[g];
  const step = last ? (last.spin.free.at(-1) || last.spin.base).steps.at(-1) : null;
  const cells = step ? step.g : Array.from({ length: n }, (_, i) => (Math.imul(i + 7, 2654435761) >>> 9) % G.nsym);   // mistura fixa, sem padrão à vista
  return [G.kind === 'cluster' ? h('div', { class: 'sspots' }, Array.from({ length: n }, (_, i) => { const v = step?.sp?.[i] || 0; return h('i', { class: spotCls(v), dataset: { v } }); })) : null,
    h('div', { class: 'sgrid' }, cells.map((s, i) => slotCellEl(g, s, step?.o?.[i]))),
    G.kind === 'cluster' ? h('div', { class: 'ssplab', 'aria-hidden': 'true' }, Array.from({ length: n }, (_, i) => { const v = step?.sp?.[i] || 0; return h('b', { class: 'spl' + (v >= 64 ? ' v64' : v >= 16 ? ' v16' : v >= 8 ? ' v8' : v >= 4 ? ' v4' : '') }, v >= 2 ? '×' + v : ''); })) : null];
}
// Uma queda: no início a grelha toda cai de cima, coluna a coluna; depois de um prémio, o que sobra desce para os buracos
// e os novos entram por cima. Cada célula sabe de quantas casas cai.
async function slotStep(g, grid, step, prev, sp) {
  const G = slotCfg(g), C = G.cols, R = G.rows, rm = prev && prev.rm ? new Set(prev.rm) : null;
  const dist = new Array(C * R).fill(0), fresh = new Array(C * R).fill(false);
  for (let c = 0; c < C; c++) {
    if (!prev) { for (let r = 0; r < R; r++) { dist[r * C + c] = R + 1; fresh[r * C + c] = true; } continue; }
    const keep = []; for (let r = 0; r < R; r++) if (!rm.has(r * C + c)) keep.push(r);
    const k = R - keep.length;
    for (let r = 0; r < R; r++) { if (r < k) { dist[r * C + c] = k; fresh[r * C + c] = true; } else dist[r * C + c] = r - keep[r - k]; }
  }
  const pitch = grid.children[0] ? grid.children[0].offsetHeight + parseFloat(getComputedStyle(grid).rowGap || 4) : 60;
  let end = 0; const lands = new Set();
  await slotSpots(grid, step.sp);
  grid.replaceChildren(...step.g.map((s, i) => {
    const el = slotCellEl(g, s, step.o?.[i]), d = dist[i];
    if (d > 0 && !RM()) {
      const c = i % C, r = Math.floor(i / C), delay = (prev ? c * 28 + (fresh[i] ? 70 : 0) : c * 85 + (R - 1 - r) * 48) * sp, t0 = (300 + 62 * Math.sqrt(d) * 2.2) * sp;
      el.classList.add('fall'); el.style.setProperty('--from', -d * pitch + 'px'); el.style.setProperty('--d', delay + 'ms'); el.style.setProperty('--t', t0 + 'ms');
      end = Math.max(end, delay + t0); lands.add(Math.round((delay + t0 * 0.78) / 40) * 40);
    }
    return el;
  }));
  if (!RM()) [...lands].slice(0, 8).forEach((ms) => setTimeout(() => fx.sfx('deal'), ms));
  await wait(RM() ? 120 : end + 90 * sp);
  if (G.kind === 'scatter' && !S.slotSkip && !RM()) { const orbs = step.g.map((s, i) => (s === G.nsym + 1 && fresh[i] ? i : -1)).filter((i) => i >= 0); if (orbs.length) await orbShow(g, grid, orbs, sp); }
  if (step.w && !S.slotSkip) {
    const cells = step.rm.map((i) => grid.children[i]), pay = step.w.reduce((x, w) => x + w.pay, 0);
    cells.forEach((el) => el.classList.add('hit'));
    const m = step.w.reduce((x, w) => x + (w.m || 0), 0);
    if (m) flashInfo('×' + m);
    // o valor do prémio aparece em cima dos símbolos que pagaram
    const gb = grid.closest('.slot').querySelector('.sfxl').getBoundingClientRect(), bs = cells.map((el) => el.getBoundingClientRect());
    const cx = bs.reduce((x, b) => x + b.left + b.width / 2, 0) / bs.length - gb.left, cy = bs.reduce((x, b) => x + b.top + b.height / 2, 0) / bs.length - gb.top;
    const tag = h('b', { class: 'swpop num', style: `left:${Math.max(40, Math.min(gb.width - 40, cx))}px;top:${cy}px` }, '+' + money(Math.floor((S.slotBase * pay) / 100)));
    grid.closest('.slot').querySelector('.sfxl').append(tag); setTimeout(() => tag.remove(), 1500);
    fx.sfx('cash'); await wait(RM() ? 250 : 720 * sp);
    cells.forEach((el) => {
      el.classList.remove('hit'); el.classList.add('boom');
      if (!RM()) for (let k = 0; k < 6; k++) el.append(h('i', { class: 'sp', style: `--a:${k * 60 + Math.random() * 40}deg;--r:${26 + Math.random() * 26}px` }));
    });
    fx.sfx('pop'); fx.vibrate(8); await wait(RM() ? 80 : 430 * sp);
  }
}
// ---- entradas dos multiplicadores ----
function slotShake(grid, hard) {
  const sl = grid.closest('.slot'); if (!sl) return;
  sl.classList.remove('shake', 'shakeh'); void sl.offsetWidth; sl.classList.add(hard ? 'shakeh' : 'shake'); setTimeout(() => sl.classList.remove('shake', 'shakeh'), 520);
}
function fxAt(grid, i) {
  const sl = grid.closest('.slot'), lay = sl.querySelector('.sfxl'), lb = lay.getBoundingClientRect(), el = grid.children[i], b = el.getBoundingClientRect();
  return { sl, lay, el, x: b.left + b.width / 2 - lb.left, y: b.top + b.height / 2 - lb.top, w: lb.width, hh: lb.height, size: b.width };
}
// Candy Madness: a casa rebenta em estrelas e o número salta
function candyBurst(grid, i, v) {
  const { lay, x, y, size } = fxAt(grid, i);
  const ring = h('i', { class: 'cring' + (v >= 16 ? ' big' : ''), style: `left:${x}px;top:${y}px;--s:${size}px` });
  const pop = h('b', { class: 'cpop num' + (v >= 16 ? ' big' : ''), style: `left:${x}px;top:${y}px` }, '×' + v);
  const stars = Array.from({ length: v >= 8 ? 10 : 6 }, (_, k) => h('i', { class: 'cstar', style: `left:${x}px;top:${y}px;--a:${k * (360 / (v >= 8 ? 10 : 6)) + Math.random() * 20}deg;--r:${size * (0.7 + Math.random() * 0.6)}px;--h:${Math.floor(Math.random() * 360)}` }));
  lay.append(ring, ...stars, pop); setTimeout(() => { ring.remove(); pop.remove(); stars.forEach((s) => s.remove()); }, 950);
}
// Zeus: um raio cai do céu em cima do multiplicador e o ecrã treme. Sweet Revenge: o rastilho arde e a bomba rebenta. The Boss: moedas.
async function orbShow(g, grid, idx, sp) {
  const many = idx.length > 3;
  const one = async (i, k) => {
    if (many) await wait(k * 90);
    if (S.slotSkip || !grid.children[i]) return;
    const { sl, lay, el, x, y, w, hh, size } = fxAt(grid, i), v = parseInt(el.querySelector('.ov')?.textContent.slice(1) || '0', 10), strong = v >= 10;
    if (g === 'zeus') {
      const pts = [[x + (Math.random() * 70 - 35), -8]], n = 5 + Math.floor(y / 55);
      for (let j = 1; j < n; j++) pts.push([x + (Math.random() * 46 - 23) * (1 - j / n) + (pts[0][0] - x) * (1 - j / n) * 0.6, (y * j) / n]);
      pts.push([x, y]);
      const d = pts.map((p, j) => (j ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
      const bolt = svg('svg', { class: 'zbolt', viewBox: `0 0 ${w} ${hh}`, preserveAspectRatio: 'none' }); bolt.append(svg('path', { d, class: 'zb1' }), svg('path', { d, class: 'zb2' }));
      const flash = h('i', { class: 'zflash' });
      lay.append(flash, bolt); fx.sfx('thunder'); fx.vibrate(strong ? [25, 30, 40] : 25); slotShake(grid, strong);
      el.classList.add('struck', 'zeus'); setTimeout(() => { bolt.remove(); flash.remove(); }, 520);
      await wait(460 * sp);
    } else if (g === 'doce') {
      el.classList.add('fuse'); const fz = h('i', { class: 'fz' }); el.append(fz); fx.sfx('fuse');
      await wait(470 * sp); fz.remove(); el.classList.remove('fuse');
      if (S.slotSkip) return;
      const ring = h('i', { class: 'exr' + (strong ? ' big' : ''), style: `left:${x}px;top:${y}px;--s:${size}px` });
      const bits = Array.from({ length: 9 }, (_, j) => h('i', { class: 'exb', style: `left:${x}px;top:${y}px;--a:${j * 40 + Math.random() * 25}deg;--r:${size * (0.8 + Math.random() * 0.7)}px` }));
      lay.append(ring, ...bits); setTimeout(() => { ring.remove(); bits.forEach((b) => b.remove()); }, 700);
      el.classList.add('struck', 'bomb'); fx.sfx('boom'); fx.vibrate(strong ? 35 : 18); slotShake(grid, strong);
      await wait(400 * sp);
    } else {
      const ring = h('i', { class: 'exr gold', style: `left:${x}px;top:${y}px;--s:${size}px` }); lay.append(ring); setTimeout(() => ring.remove(), 700);
      el.classList.add('struck', 'gold'); fx.sfx('claim'); if (strong) slotShake(grid, false);
      await wait(380 * sp);
    }
  };
  if (many) await Promise.all(idx.map((i, k) => one(i, k))); else for (let k = 0; k < idx.length && !S.slotSkip; k++) await one(idx[k], k);
  // o multiplicador fica à vista mais tempo do que uma queda sem nada
  if (!S.slotSkip) await wait(650 * sp);
}
function flashInfo(txt) {
  const info = document.querySelector('.sinfo'); if (!info) return;
  info.textContent = txt; info.classList.add('on');
  clearTimeout(info._t); info._t = setTimeout(() => info.classList.remove('on'), 1100);
}
// faixa grande por cima da grelha: rodadas grátis, ganhos grandes, fim do bónus
async function slotBanner(kind, title, sub, ms) {
  const lay = document.querySelector('.slot .sfxl'); if (!lay) return;
  const el = h('div', { class: 'sban ' + kind }, h('i', { class: 'rays' }), h('b', { class: 'sbt' }, title), sub ? h('span', { class: 'sbs num' }, sub) : null,
    kind !== 'free' && !RM() ? Array.from({ length: 22 }, () => h('i', { class: 'cn', style: `left:${Math.random() * 100}%;--d:${Math.random() * 900}ms;--t:${900 + Math.random() * 900}ms` })) : null);
  lay.append(el);
  for (let t0 = 0; t0 < ms && !S.slotSkip; t0 += 100) await wait(100);
  el.classList.add('bye'); await wait(S.slotSkip ? 0 : 260); el.remove();
  return el;
}
async function slotAnim(r) {
  const g = r.game, G = slotCfg(g);
  S.slotSkip = false; S.slotBase = r.base; S.slotGame = g;
  const sl = document.querySelector('.slot'); if (sl) await tableFocus(sl);
  const sk = document.querySelector('.csbar .btn.buy');
  if (sk) { sk.disabled = false; sk.replaceChildren(h('i', { class: 'stopi' })); sk.setAttribute('aria-label', t('slSkip')); sk.classList.replace('buy', 'skip'); const ml = document.querySelector('.smsgl'); if (ml) ml.textContent = t('slWinL'); sk.addEventListener('click', () => { S.slotSkip = true; }); }
  const grid = document.querySelector('.sgrid'), meter = document.querySelector('.swinm'), freeL = document.querySelector('.sfree');
  if (!grid) return;
  const cash = (c) => Math.floor((r.base * Math.min(c, G.max * 100)) / 100);
  let acc = 0, shown = 0; meter.textContent = money(0);
  const show = (c, ms = 450) => { const to = cash(c); if (RM() || S.slotSkip) meter.textContent = money(to); else fx.roll(meter, shown, to, money, ms); shown = to; };
  // os símbolos da jogada anterior caem para fora
  if (!RM()) { [...grid.children].forEach((el, i) => { el.classList.add('out'); el.style.setProperty('--d', (i % G.cols) * 45 + 'ms'); }); fx.sfx('refill'); await wait(330 + G.cols * 45); }
  const round = async (rd, sp, mult) => {
    let w = 0;
    for (let k = 0; k < rd.steps.length && !S.slotSkip; k++) {
      await slotStep(g, grid, rd.steps[k], k ? rd.steps[k - 1] : null, sp);
      if (rd.steps[k].w) { w += rd.steps[k].w.reduce((x, y) => x + y.pay, 0); show(acc + w); }
    }
    if (S.slotSkip) return;
    if (G.kind === 'scatter' && w > 0 && mult > 1) {
      // as esferas voam uma a uma para o multiplicador e só depois o prémio é multiplicado
      const info = document.querySelector('.sinfo'), orbs = [...grid.querySelectorAll('.orb')];
      if (!RM() && info) {
        const ib = info.getBoundingClientRect(); let sum = 0;
        for (const el of orbs.slice(0, 12)) {
          const b = el.getBoundingClientRect(), v = parseInt(el.querySelector('.ov')?.textContent.slice(1) || '0', 10);
          el.classList.add('hit');
          const fl = h('b', { class: 'sfly num', style: `left:${b.left + b.width / 2}px;top:${b.top + b.height / 2}px;--x:${ib.left + ib.width / 2 - b.left - b.width / 2}px;--y:${ib.top + ib.height / 2 - b.top - b.height / 2}px` }, '×' + v);
          document.body.append(fl); fx.sfx('tick'); await wait(430 * sp); fl.remove();
          sum += v; info.textContent = '×' + sum; info.classList.add('on'); clearTimeout(info._t);
        }
        info.textContent = '×' + mult; info.classList.add('on', 'bump'); clearTimeout(info._t); info._t = setTimeout(() => info.classList.remove('on', 'bump'), 1600);
      } else flashInfo('×' + mult);
      fx.sfx('crit'); acc += w * mult; show(acc, 800); await wait(RM() ? 300 : 1000 * sp);
    } else { acc += w; show(acc); if (w > 0) await wait(RM() ? 0 : 350 * sp); }
  };
  await round(r.spin.base, 1, r.spin.base.orbSum);
  if (r.spin.free.length && !S.slotSkip) {
    acc += r.spin.scatPay; show(acc);
    grid.querySelectorAll('.scat').forEach((el) => el.classList.add('hit', 'trig'));
    fx.sfx('crit'); await wait(RM() ? 200 : 1300);
    fx.sfx('level'); fx.vibrate([20, 40, 20]);
    await slotBanner('free', t('slFreeT', { n: r.spin.free.length }), t('slFreeS'), RM() ? 900 : 2600);
    sl?.classList.add('free');
    const before = acc;
    for (let k = 0; k < r.spin.free.length && !S.slotSkip; k++) {
      const f = r.spin.free[k];
      freeL.replaceChildren(t('slFreeLeft', { n: r.spin.free.length - k - 1 }), G.kind === 'scatter' && G.accFree ? h('b', { class: 'sacc num' + ((f.acc || 1) > (freeL._m || 1) ? ' bump' : '') }, '×' + (f.acc || 1)) : '');
      freeL._m = f.acc || 1;
      await round(f, 0.82, f.acc);
      if (!S.slotSkip) await wait(RM() ? 0 : 250);
    }
    if (!S.slotSkip) { fx.sfx('claim'); await slotBanner('end', t('slFreeEnd'), money(cash(acc) - cash(before) + cash(r.spin.scatPay)), RM() ? 900 : 2400); }
  }
  S.slotLast = { ...(S.slotLast || {}), [g]: r }; const skipped = S.slotSkip; S.slotSkip = false;
  const tot = Math.floor((r.base * r.spin.total) / 100), x = tot / r.base;
  meter.textContent = money(tot);
  if (x >= 20 && tot > r.bet && !skipped) {   // numa compra de bónus só se festeja se houve lucro
    fx.sfx('level'); fx.vibrate([30, 50, 30]);
    const ban = slotBanner('big', t(x >= 200 ? 'slEpic' : x >= 50 ? 'slMega' : 'slBigT'), money(0), RM() ? 1200 : 3400);
    const amt = document.querySelector('.sban.big .sbs'); if (amt && !RM()) fx.roll(amt, 0, tot, money, 2400); else if (amt) amt.textContent = money(tot);
    await ban;
  }
}
function slotBuy(g, kind) {
  const G = slotCfg(g), chip = chipNow(), mult = kind === 2 ? G.superBuy : G.buy, price = chip * mult;
  const can = price <= betMax();
  const close = sheet(h('div', { class: 'stack' }, art('cenas', 'jackpot', 'buyimg'), h('h2', null, t(kind === 2 ? 'slBuySuper' : 'slBuyT')),
    h('p', null, t(G.kind === 'cluster' ? (kind === 2 ? 'slBuyDescSuper' : 'slBuyDescC') : 'slBuyDesc', { n: G.free || G.fs[3], x: mult })),
    h('div', { class: 'row sp' }, h('span', { class: 'muted' }, t('csBet')), h('b', { class: 'num' }, money(chip))),
    h('div', { class: 'row sp' }, h('span', { class: 'muted' }, t('slBuyPrice', { x: mult })), h('b', { class: 'num c-cash' }, money(price))),
    !can ? h('p', { class: 'small c-red' }, price > S.st.me.casinoMax ? t('csOver', { m: money(S.st.me.casinoMax) }) : t('csNoCash', { m: money(price) })) : null,
    h('button', { class: 'btn buy block big', disabled: !can, on: { click: () => { close(); play('slot', { game: g, amt: chip, buy: kind }, slotAnim); } } }, t('slBuyGo', { m: moneyShort(price) }))));
}
function screenSlotGame(page) {
  const g = SLOT_OF[page], G = slotCfg(g), last = S.slotLast?.[g], me = S.st.me, max = betMax(), min = S.cfg.casino.minBet;
  const all = CHIPS.filter((c) => c <= max); if (max >= min && !all.includes(max)) all.push(max);
  const chip = chipNow(), at = Math.max(0, all.findLastIndex((c) => c <= chip));
  const setBet = (i) => { S.chip = all[i]; store.set('chip', all[i]); render(); };
  const auto = S.slotAuto && S.slotAuto.g === g ? S.slotAuto : null;
  const plq = (kind, label, mult) => h('button', { class: 'splq bbuy' + (kind === 2 ? ' sup' : ''), disabled: S.casinoBusy, on: { click: () => slotBuy(g, kind) } }, h('span', null, label), h('b', { class: 'num' }, moneyShort(chip * mult)));
  return [
    h('div', { class: 'slot th-' + g },
      h('div', { class: 'shead', style: `background-image:url(${IMG('cenas', PLACES[page].img, 1)})` }, h('button', { class: 'sback', 'aria-label': t('p_casino'), on: { click: () => go(upOf(page)) } }, '←'), h('h1', { class: 'slogo' }, t('p_' + page)), h('span', { class: 'sup2' }, t('slUpTo', { x: num(G.max) }))),
      h('div', { class: 'sfr' }, h('div', { class: 'stop' }, h('span', { class: 'sfree' }), h('span', { class: 'sinfo num' })), h('div', { class: 'sgw', style: `--cols:${G.cols};--rows:${G.rows}` }, slotGrid(g)), h('div', { class: 'sfxl' })),
      h('div', { class: 'smsg' }, h('span', { class: 'smsgl' }, last ? t('slWinL') : t('slGood')), h('b', { class: 'swinm num' }, last ? money(last.win) : '')),
      h('div', { class: 'csbar sctl' },
        h('div', { class: 'brow' }, plq(1, t('slBuyL'), G.buy), G.superBuy ? plq(2, t('slSuperL'), G.superBuy) : null),
        h('div', { class: 'srow' },
          h('div', { class: 'sbet' }, h('button', { class: 'sbb', 'aria-label': '−', disabled: at <= 0, on: { click: () => setBet(at - 1) } }, '−'),
            h('div', null, h('small', null, t('slBetL')), h('b', { class: 'num' }, moneyShort(chip))),
            h('button', { class: 'sbb', 'aria-label': '+', disabled: at >= all.length - 1, on: { click: () => setBet(at + 1) } }, '+')),
          h('button', { class: 'btn buy sspin', 'aria-label': t('slSpin', { m: moneyShort(chip) }), disabled: max < min || S.casinoBusy || !!auto, on: { click: () => play('slot', { game: g, amt: chip }, slotAnim) } }, icon('refresh')),
          h('div', { class: 'sright' },
            h('button', { class: 'sib sauto' + (auto ? ' on' : ''), disabled: !auto && (max < min || S.casinoBusy), on: { click: (e) => (S.slotAuto ? slotAutoStop(e.currentTarget) : slotAutoPick(g)) } }, h('b', { class: 'num' }, auto ? String(auto.left) : 'A'), h('small', null, auto ? t('slStop') : t('slAuto'))),
            h('button', { class: 'sib', on: { click: () => slotPaytable(g) } }, h('b', null, 'i'), h('small', null, t('slInfo'))))),
        h('div', { class: 'scred' }, h('span', null, t('csInHand') + ' '), h('b', { class: 'num c-cash' }, money(me.cash)), h('span', null, ' · ' + t('slBetL') + ' '), h('b', { class: 'num' }, money(chip)))))];
}
// ---- rodar automático: n rodadas seguidas com a aposta escolhida ----
function slotAutoPick(g) {
  const chip = chipNow();
  const close = sheet(h('div', { class: 'stack' }, h('h2', null, t('slAutoT')), h('p', null, t('slAutoSub', { m: money(chip) })),
    h('div', { class: 'autogrid' }, [10, 25, 50, 100].map((n) => h('button', { class: 'btn', on: { click: () => { close(); slotAutoRun(g, n); } } }, h('b', { class: 'num' }, String(n)), h('small', null, t('slAutoUpTo', { m: moneyShort(chip * n) }))))),
    h('p', { class: 'small muted' }, t('slAutoNote'))));
}
function slotAutoStop(btn) {
  if (!S.slotAuto) return;
  S.slotAuto.left = 0; S.slotAuto.stop = true;
  if (btn) { btn.querySelector('b').textContent = '0'; btn.querySelector('small').textContent = t('slStopping'); btn.disabled = true; }
  if (!S.casinoBusy) { S.slotAuto = null; render(); }
}
async function slotAutoRun(g, n) {
  const page = Object.keys(SLOT_OF).find((k) => SLOT_OF[k] === g);
  S.slotAuto = { g, left: n, total: n }; render();
  while (S.slotAuto && S.slotAuto.left > 0 && S.tab === page) {
    const chip = chipNow(); if (betMax() < S.cfg.casino.minBet) break;
    S.slotAuto.left -= 1;
    const r = await play('slot', { game: g, amt: chip }, slotAnim);
    if (!r || !S.slotAuto || S.slotAuto.stop) break;
    if (r.spin.free.length) break;                    // saiu um bónus: pára para se ver com calma
    await wait(500);
  }
  S.slotAuto = null; render();
}
function slotPaytable(g) {
  const G = slotCfg(g), x = (v) => (v / 100).toString().replace('.', lang() === 'pt' ? ',' : '.') + '×';
  const rows = G.pay.map((row, i) => [i, row]).sort((a, b) => b[1].at(-1) - a[1].at(-1));
  const heads = G.kind === 'cluster' ? ['5', '8', '10', '15+'] : ['8–9', '10–11', '12+'], cols = G.kind === 'cluster' ? [0, 3, 5, 10] : [0, 1, 2];
  sheet(h('div', { class: 'stack' }, h('h2', null, t('slTable')), h('p', { class: 'small muted' }, t(G.kind === 'cluster' ? 'slTableC' : 'slTableSub')),
    h('div', { class: 'ptab', style: `--n:${cols.length}` }, h('span'), ...heads.map((x2) => h('b', null, x2)),
      ...rows.flatMap(([i, row]) => [h('img', { src: SYM(g, i), alt: '', width: 40, height: 40 }), ...cols.map((c) => h('span', { class: 'num' }, x(row[c])))])),
    h('div', { class: 'row', style: 'gap:10px' }, h('img', { src: SYM(g, G.nsym), alt: '', width: 48, height: 48 }), h('p', { class: 'small' }, t('scat_' + g))),
    G.kind === 'scatter' ? h('div', { class: 'row', style: 'gap:10px' }, h('img', { src: SYM(g, G.nsym + 1), alt: '', width: 48, height: 48 }), h('p', { class: 'small' }, t('orb_' + g))) : h('p', { class: 'small' }, t('spots_rebucado')),
    h('p', { class: 'small muted' }, t('slRtp', { p: t('rtp_' + g), x: num(G.max) }))));
}

// ---------- perfil ----------
function sheet(content) {
  const bd = h('div', { class: 'backdrop' });
  const sh = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' }, h('div', { class: 'grab' }), content);
  const close = () => { bd.remove(); sh.remove(); document.removeEventListener('keydown', esc); S.sheets = (S.sheets || []).filter((x) => x !== close); armBack(); };
  const esc = (e) => { if (e.key === 'Escape') close(); };
  bd.addEventListener('click', close); document.addEventListener('keydown', esc);
  document.body.append(bd, sh);
  (S.sheets ||= []).push(close); armBack();
  return close;
}

// ---- instalar o jogo no telemóvel (aplicação web) ----
// O Chrome do Android avisa quando o site pode ser instalado; guardamos o aviso para o botão do perfil.
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); S.installEvt = e; });
addEventListener('appinstalled', () => { S.installEvt = null; S.installed = true; });
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
function installBox(redraw) {
  if (isStandalone() || S.installed) return h('p', { class: 'small muted' }, t('appInstalled'));
  if (S.installEvt) return h('button', { class: 'btn buy block', on: { click: async () => {
    const ev = S.installEvt; S.installEvt = null;
    try { ev.prompt(); const c = await ev.userChoice; if (c && c.outcome === 'accepted') { S.installed = true; toast(t('appDone')); } } catch { /* o browser recusou mostrar a pergunta */ }
    redraw();
  } } }, t('appInstall'));
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return h('p', { class: 'small muted' }, t(ios ? 'appIos' : 'appOther'));
}
function openProfile() {
  const me = S.st.me, r = S.st.round;
  const end = new Date(r.playEnd).toLocaleString(lang() === 'pt' ? 'pt-PT' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  let close;
  const langBtns = h('div', { class: 'seg' }, [['en', 'English'], ['pt', 'Português']].map(([l, n]) => h('button', { 'aria-pressed': lang() === l ? 'true' : 'false', on: { click: async () => { applyLang(l); close(); shell(); render(); openProfile(); try { await api('POST', '/api/lang', { lang: l }); } catch {} } } }, n)));
  const anim = store.get('light', false);
  const animBtns = h('div', { class: 'seg' }, [[false, t('animFull')], [true, t('animLight')]].map(([v, n]) => h('button', { 'aria-pressed': anim === v ? 'true' : 'false', on: { click: () => { store.set('light', v); fx.setLight(v); close(); openProfile(); } } }, n)));
  close = sheet(h('div', { class: 'stack' },
    h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 'small muted' }, t('level') + ' ' + me.level), h('div', { style: 'font-family:var(--disp);font-weight:900;font-size:34px;text-transform:uppercase;line-height:1' }, list('titles')[me.level - 1]), h('div', { class: 'muted' }, me.name + (S.st.rank ? ' · #' + S.st.rank : ''))),
      h('div', { style: 'text-align:right' }, h('div', { class: 'c-resp', style: 'font-weight:800;font-size:20px' }, icon('crown'), ' ' + num(me.respect)), h('div', { class: 'small muted' }, me.levelTo ? t('toNext', { n: num(me.levelTo - me.peakRespect), l: me.level + 1 }) : ''))),
    me.cls ? h('div', { class: 'chip', style: 'justify-self:start' }, t('cl_' + me.cls) + ' · ' + classLines(S.cfg.classes.find((c) => c.id === me.cls)).join(' · ')) : null,
    me.cls ? h('button', { class: 'btn sm', style: 'justify-self:start', on: { click: () => { close(); go('work'); } } }, t('clsChangeT')) : null,
    S.avOk ? h('h2', { class: 'sec', style: 'margin-top:10px' }, t('avatar')) : null,
    S.avOk ? h('div', { class: 'avgrid' }, Array.from({ length: S.cfg.avatars }, (_, i) => h('button', { class: i === me.av ? 'sel' : '', 'aria-label': t('avatar') + ' ' + (i + 1), 'aria-pressed': i === me.av ? 'true' : 'false',
      on: { click: async () => { await act('avatar', { i }); close(); openProfile(); } } }, h('img', { src: AV(i), alt: '', width: 96, height: 96, loading: 'lazy', on: { error: (e) => e.currentTarget.parentNode.remove() } })))) : null,
    h('div', { class: 'small muted' }, t('roundInfo', { n: r.n + 1, d: end })),
    h('div', { class: 'small muted' }, t('playersIn', { n: num(S.st.players) })),
    h('h2', { class: 'sec', style: 'margin-top:10px' }, t('appT')), installBox(() => { close(); openProfile(); }),
    h('h2', { class: 'sec', style: 'margin-top:10px' }, t('language')), langBtns,
    h('h2', { class: 'sec', style: 'margin-top:10px' }, t('animations')), animBtns,
    h('h2', { class: 'sec', style: 'margin-top:10px' }, t('sound')),
    h('div', { class: 'seg' }, [[true, t('on')], [false, t('off')]].map(([v, n]) => h('button', { 'aria-pressed': store.get('sound', true) === v ? 'true' : 'false', on: { click: () => { store.set('sound', v); fx.setSound(v); if (v) fx.sfx('cash'); close(); openProfile(); } } }, n))),
    h('h2', { class: 'sec', style: 'margin-top:10px' }, t('music')),
    h('div', { class: 'seg' }, [[true, t('on')], [false, t('off')]].map(([v, n]) => h('button', { 'aria-pressed': store.get('music', true) === v ? 'true' : 'false', on: { click: () => { store.set('music', v); fx.setMusic(v); close(); openProfile(); } } }, n))),
    h('button', { class: 'btn ghost block', style: 'margin-top:12px', on: { click: async () => { try { await api('POST', '/api/logout'); } catch {} close(); S.st = null; showLanding(); } } }, t('logout')),
    h('p', { class: 'credit' }, h('a', { href: 'https://dinissousa.pt', target: '_blank', rel: 'noopener' }, t('credit')))));
}

// ---------- fim de ronda ----------
function renderPause() {
  const r = S.st.round;
  $main = null;
  $app.replaceChildren(h('div', { class: 'land' },
    h('div', { class: 'word neon' }, 'Crime'),
    h('h1', { style: 'font-family:var(--disp);font-weight:900;font-size:40px;text-transform:uppercase' }, t('pauseTitle')),
    S.st.me && S.st.rank ? h('p', { style: 'font-weight:700' }, t('finalRank', { n: S.st.rank, r: num(S.st.me.respect) })) : null,
    h('p', { class: 'muted' }, t('pauseSub', { t: dur(r.nextStart - now()) })),
    h('p', { class: 'credit' }, h('a', { href: 'https://dinissousa.pt', target: '_blank', rel: 'noopener' }, t('credit')))));
}

// ---------- entrada ----------
function applyLang(l) { setLang(l); setLocale(l); store.set('lang', l); try { localStorage.setItem('cr.lang', l); } catch {} }

async function showLanding(st) {
  $main = null;
  let info = st ? { jogadores: st.players, round: st.round } : null;
  if (!info) { try { const r = await fetch('/api/saude'); info = await r.json(); } catch {} }
  const langsw = h('div', { class: 'langsw' }, [['en', 'EN'], ['pt', 'PT']].map(([l, n]) => h('button', { 'aria-pressed': lang() === l ? 'true' : 'false', on: { click: () => { applyLang(l); showLanding(info ? { players: info.jogadores, round: info.round } : null); } } }, n)));
  $app.replaceChildren(langsw, h('div', { class: 'land' },
    h('div', { class: 'land-art', 'aria-hidden': 'true' }, h('img', { src: '/img/cenas/entrada-g.webp?8', alt: '', width: 800, height: 800, fetchpriority: 'high', decoding: 'async' })),
    h('div', { class: 'word neon', 'aria-label': 'Crime' }, 'Crime'),
    h('p', { class: 'tag' }, t('tagline')),
    info ? h('div', { class: 'meta' },
      h('span', null, t('playersIn', { n: num(info.jogadores) })),
      info.round ? h('span', null, info.round.phase === 'play' ? t('roundEnds', { n: info.round.n + 1, t: dur(info.round.playEnd - now()) }) : t('roundStarts', { t: dur(info.round.nextStart - now()) })) : null) : null,
    h('div', { class: 'cta' },
      h('button', { class: 'btn pri sodium block', on: { click: () => authSheet('register') } }, t('play')),
      h('button', { class: 'btn ghost block', on: { click: () => authSheet('login') } }, t('haveAccount'))),
    h('p', { class: 'credit' }, h('a', { href: 'https://dinissousa.pt', target: '_blank', rel: 'noopener' }, t('credit')))));
  skyline(6);
}

function authSheet(mode) {
  let close;
  const nameI = h('input', { id: 'nm', name: 'username', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', required: true, maxlength: 16 });
  const passI = h('input', { id: 'pw', name: 'password', type: 'password', autocomplete: mode === 'register' ? 'new-password' : 'current-password', required: true, minlength: 8, maxlength: 200 });
  const hp = h('input', { class: 'hp', name: 'website', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' });
  const err = h('p', { class: 'err', role: 'alert' });
  const submit = h('button', { class: 'btn pri sodium block', type: 'submit' }, mode === 'register' ? t('register') : t('login'));
  const form = h('form', { novalidate: true, on: { submit: async (e) => {
    e.preventDefault(); err.textContent = ''; submit.disabled = true;
    try {
      const r = await api('POST', mode === 'register' ? '/api/register' : '/api/login', { name: nameI.value.trim(), password: passI.value, website: hp.value, lang: lang() });
      if (r.lang && r.lang !== lang()) applyLang(r.lang);
      try { window.estat && window.estat(mode === 'register' ? 'conta_criada' : 'entrou', ''); } catch {}
      close(); await start();
    } catch (ex) { err.textContent = errText(ex.code); submit.disabled = false; (ex.code === 'BAD_PASSWORD' ? passI : nameI).focus(); }
  } } },
    h('h2', { class: 'sec', style: 'margin-top:0' }, mode === 'register' ? t('register') : t('login')),
    h('div', { class: 'field' }, h('label', { for: 'nm' }, t('name')), nameI, mode === 'register' ? h('small', null, t('nameHint')) : null),
    h('div', { class: 'field' }, h('label', { for: 'pw' }, t('password')), passI, mode === 'register' ? h('small', null, t('passHint')) : null),
    hp, err, submit,
    h('button', { class: 'btn ghost block', type: 'button', style: 'margin-top:8px', on: { click: () => { close(); authSheet(mode === 'register' ? 'login' : 'register'); } } }, mode === 'register' ? t('haveAccount') : t('newHere')));
  close = sheet(form);
  setTimeout(() => nameI.focus(), 60);
}

// ---------- cidade ao fundo: acende-se contigo ----------
let skyLevel = -1;
function skyline(level) {
  if (level === skyLevel) return; skyLevel = level;
  const host = document.querySelector('.skyline'); if (!host) return;
  const W = 1200, H = 420;
  const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMax slice' });
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const lit = Math.min(0.85, 0.06 + level * 0.04);
  let x = 0;
  while (x < W) {
    const bw = 50 + Math.floor(rnd() * 90), bh = 120 + Math.floor(rnd() * 280);
    s.append(svg('rect', { class: 'b', x, y: H - bh, width: bw, height: bh }));
    for (let wy = H - bh + 14; wy < H - 16; wy += 18) for (let wx = x + 8; wx < x + bw - 10; wx += 14) {
      const on = rnd() < lit;
      s.append(svg('rect', { class: 'w' + (on ? ' on' + (rnd() < 0.04 ? ' f' : '') : ''), x: wx, y: wy, width: 6, height: 9 }));
    }
    x += bw + 2;
  }
  host.replaceChildren(s);
}

// ---------- arranque ----------
async function refresh() {
  if (S.casinoBusy) return;   // a meio de uma jogada, o dinheiro só muda quando a animação acaba
  try {
    const st = await api('GET', '/api/state');
    S.st = st; S.stAt = now(); if (st.feed) S.feed = st.feed;
    if (st.account?.lang && !store.get('lang')) applyLang(st.account.lang);
    render();
  } catch {}
}

async function start() {
  [S.cfg] = await Promise.all([S.cfg || api('GET', '/api/config')]);
  const st = await api('GET', '/api/state');
  if (!st.account) { S.st = null; return showLanding(st); }
  S.st = st; S.stAt = now(); if (st.feed) S.feed = st.feed;
  $main = null;
  S.tab = store.get('tab', 'city');
  S.backArmed = false; try { if (history.state?.crime) history.replaceState(null, ''); } catch { /* sem histórico */ }
  render();
  armBack();
  if (st.me) skyline(st.me.level);
  loadEvents(false);
}

applyLang(guessLang());
fx.setLight(store.get('light', false));
fx.setSound(store.get('sound', true));
fx.setMusic(store.get('music', true));
// os avatares só aparecem quando as imagens existirem no servidor
{ const pr = new Image(); pr.onload = () => { S.avOk = true; if (S.st?.me && $main) { shell(); render(); } }; pr.src = '/img/av/0.webp?1'; }
setInterval(tickHud, 1000);
setInterval(() => { if (S.st && document.visibilityState === 'visible') { refresh(); loadEvents(false); if (S.tab === 'news' || S.tab === 'city') loadNews(); } }, 30000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.st) refresh(); });
start().catch((e) => { if (e.code !== 'LOGIN_REQUIRED') { if (!S.st) showLanding(); } });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
