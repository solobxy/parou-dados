// Jogo de crime: interface. O servidor decide tudo; aqui só se mostra e se pede.

import { t, tv, list, errText, setLang, lang, guessLang } from './i18n.js';
import { h, icon, svg, setLocale, num, money, moneyShort, short, dur, hoursText, pct, rid } from './ui.js';
import * as fx from './fx.js';
import * as C3 from './casino3d.js';

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
    for (const c of r.port) if (!c.seized) total += c.got;
    if (total > 0) { toast(t('got', { m: money(total) })); fx.sfx('cash'); }
    if (lost > 0) toast(t('raided', { m: money(lost) }), true);
    if (r.port.some((c) => c.seized)) toast(t('seized'), true);
  } else if (type === 'attack') {
    fx.sfx('hit');
    fx.fight(me.name, out.target.name, r.win, r.win ? (r.mode === 'mug' ? '+' + money(r.money) + ' · +' + r.respect : '+' + r.respect + ' ' + t('respect').toLowerCase()) : '−' + Math.abs(r.respect) + ' ' + t('respect').toLowerCase(), { win: t('youWon'), lose: t('youLost') });
    S.targets = null; loadTargets();
  } else if (type !== 'train') fx.sfx('buy');
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
  biz: { ic: 'empire', img: 'negocios' }, port: { img: 'porto' }, arms: { img: 'armas' }, bank: { img: 'banco' }, hosp: { img: 'hospital' },
  jail: { img: 'prisao' }, news: { img: 'jornal' }, casino: { img: 'casino' }, roulette: { img: 'roleta' }, bj: { img: 'blackjack' }, dice: { img: 'dados' }, wheel: { img: 'roda' }, slot: { img: 'slot' }, zeus: { img: 'zeus' }, doce: { img: 'doce' }, rebucado: { img: 'rebucado' }, alley: { img: 'beco' }, lux: { img: 'luxos' }, fights: { ic: 'fights', img: 'lutas' }, rank: { img: 'ranking' }, putas: { img: 'putas' }, casa: {},
};
// barra de baixo: só o que se usa a toda a hora. O resto vive dentro de cada separador, arrumado por zonas.
const NAV = ['city', 'rob', 'fights', 'empire'];
const HUB = {
  city: [['sec_night', ['club', 'putas', 'casino']], ['sec_street', ['gym', 'alley', 'hosp', 'jail', 'arms', 'rank']]],
  empire: [['sec_income', ['biz', 'port']], ['sec_assets', ['casa', 'bank']]],
};
const PARENT = { news: 'city', casino: 'city', roulette: 'casino', bj: 'casino', dice: 'casino', wheel: 'casino', slot: 'casino', zeus: 'casino', doce: 'casino', rebucado: 'casino', club: 'city', putas: 'city', gym: 'city', alley: 'city', hosp: 'city', jail: 'city',
  biz: 'empire', port: 'empire', casa: 'empire', bank: 'empire', lux: 'empire', arms: 'fights', rank: 'fights' };
const upOf = (id) => (S.backTo && S.backTo[id]) || PARENT[id] || 'city';   // um sítio que está em duas zonas volta para a zona de onde vieste
const tabOf = (id) => { let x = id; for (let k = 0; k < 4 && !NAV.includes(x); k++) x = upOf(x); return NAV.includes(x) ? x : 'city'; };
const IMG = (kind, id, big) => `/img/${kind}/${id}${big ? '-g' : ''}.webp?9`;
function go(tab) {
  if (!PLACES[tab]) tab = 'city';
  if (HUB[S.tab]?.some(([, ids]) => ids.includes(tab)) || (S.tab === 'fights' && (tab === 'arms' || tab === 'rank'))) S.backTo = { ...(S.backTo || {}), [tab]: S.tab };
  S.tab = tab; document.body.dataset.tab = tab; store.set('tab', tab);
  if (tab === 'fights') { if (S.fightSeg === 'events') loadEvents(true); else { S.fightSeg = 'targets'; loadTargets(); } }
  if (tab === 'rank') loadRanking();
  if (tab === 'news' || tab === 'city') loadNews();
  render(); window.scrollTo({ top: 0 });
}

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
  hosp: screenHosp, jail: screenJail, putas: screenPutas, casa: screenCasa, alley: screenAlley, lux: screenLux, fights: screenFights, rank: screenRank };
function render(force) {
  if (!S.st) return;
  if (!S.st.me || S.st.round.phase !== 'play') return renderPause();
  if (!PLACES[S.tab]) S.tab = 'city';
  // a meio de uma jogada no casino, nada redesenha a mesa (eventos, notícias, relógio); só mudar de sítio
  if (!force && S.casinoBusy && S.tab === S.drawn && $main && document.body.contains($main)) { tabDots(); return; }
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
    empire: me.port.some((c) => c.readyAt <= n) || me.biz.some((b, i) => b.n > 0 && storedNow(b, i) >= (b.perH * S.cfg.storageMs) / 3600000 / 2),
    city: !!me.mission?.done,
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
function classLines(c) { return Object.keys(c).filter((k) => k !== 'id').map((k) => t('cb_' + k, { p: k === 'capPlus' ? c[k] : c[k] / 100 })); }
function screenClass() {
  const pick = S.clsPick;
  return [h('div', { class: 'phead' }, h('div', { class: 'pbar' }, h('h1', { style: 'margin:0' }, t('clsTitle'))), h('p', { class: 'psub' }, t('clsSub'))),
    S.avOk ? h('h2', { class: 'sec', style: 'margin-top:4px' }, t('avatar')) : null,
    S.avOk ? h('div', { class: 'avgrid' }, Array.from({ length: S.cfg.avatars }, (_, i) => h('button', { class: i === S.st.me.av ? 'sel' : '', 'aria-label': t('avatar') + ' ' + (i + 1), 'aria-pressed': i === S.st.me.av ? 'true' : 'false',
      on: { click: () => act('avatar', { i }) } }, h('img', { src: AV(i), alt: '', width: 96, height: 96, loading: 'lazy', on: { error: (e) => e.currentTarget.parentNode.remove() } })))) : null,
    S.avOk ? h('h2', { class: 'sec' }, t('clsWork')) : null,
    h('div', { class: 'shop' }, S.cfg.classes.map((c) => h('button', { class: 'item cls' + (pick === c.id ? ' sel' : ''), 'aria-pressed': pick === c.id ? 'true' : 'false', on: { click: () => { S.clsPick = c.id; render(); } } },
      art('classes', c.id), h('div', { class: 'nm' }, t('cl_' + c.id)), h('ul', { class: 'perks' }, classLines(c).map((x) => h('li', null, x)))))),
    pick ? h('div', { class: 'stick' }, h('button', { class: 'btn buy block big', on: { click: (e) => act('class', { id: pick }, { el: e.currentTarget }) } }, t('clsConfirm', { x: t('cl_' + pick) }))) : null];
}

// ---------- a cidade ----------
// ---------- jornal da cidade: o que os outros andam a fazer ----------
const NW_IC = { casino: 'gem', casinoLoss: 'skull', job: 'cash', crit: 'gem', spree: 'bolt', jail: 'lock', house: 'empire', lux: 'crown', beat: 'fist', mug: 'cash', fail: 'skull', sick: 'pill', lvl: 'crown', fight: 'fist' };
const seedOf = (str) => { let x = 7; for (let i = 0; i < str.length; i++) x = (x * 31 + str.charCodeAt(i)) | 0; return Math.abs(x); };
function newsText(e) {
  const k = e.k === 'fight' ? (e.mode === 'mug' ? 'mug' : 'beat') : e.k, C = list('crimes');
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
      h('div', { class: 'small ' + (g.sickBp >= 500 ? 'c-red' : 'muted') }, icon('skull'), t('hkRisk', { p: (g.sickBp / 100).toString().replace('.', lang() === 'pt' ? ',' : '.') })),
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
function screenPort() {
  const me = S.st.me;
  const out = [pageHead('port', t('portSub'))];
  out.push(portMap(me));
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
  const me = S.st.me, bp = me.bankFeeBp ?? S.cfg.bank.feeBp, fee = Math.ceil(me.cash * bp / 10000);
  return [pageHead('bank', t('bankSub', { p: (bp / 100).toString().replace('.', lang() === 'pt' ? ',' : '.') })), h('div', { class: 'card stack' },
    h('div', { class: 'row sp' }, h('span', { class: 'muted' }, icon('cash'), ' ' + t('cash')), h('b', { class: 'c-cash num' }, money(me.cash))),
    h('div', { class: 'row sp' }, h('span', { class: 'muted' }, icon('bank'), ' ' + t('bank')), h('b', { class: 'num' }, money(me.bank))),
    h('button', { class: 'btn buy block', disabled: me.cash <= 0, on: { click: (e) => act('deposit', { amount: me.cash }, { el: e.currentTarget }) } }, t('depositAll', { m: money(me.cash) }) + (me.cash > 0 ? ' · ' + t('fee', { m: money(fee) }) : '')),
    h('button', { class: 'btn ghost block', disabled: me.bank <= 0, on: { click: (e) => act('withdraw', { amount: me.bank }, { el: e.currentTarget }) } }, t('withdrawAll', { m: money(me.bank) })))];
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
  out.push(h('div', { class: 'hlinks' }, ['arms', 'rank'].map((id) => h('button', { class: 'hlink', on: { click: () => go(id) } },
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
      h('div', { class: 'who2' }, S.avOk ? h('img', { class: 'avs', src: AV(x.av || 0), alt: '', width: 96, height: 96, loading: 'lazy' }) : null, h('div', null, h('div', { class: 'nm' }, x.name), h('div', { class: 'lv' }, t('level') + ' ' + x.level + ' · ' + list('titles')[x.level - 1] + ' · ', h('span', { class: 'c-resp' }, icon('crown'), ' ' + short(x.respect))))),
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
    h('div', { class: 'p' }, r.pos), S.avOk ? h('img', { class: 'avs', src: AV(r.av || 0), alt: '', width: 96, height: 96, loading: 'lazy' }) : null, h('div', null, h('div', { style: 'font-weight:700' }, r.name), h('div', { class: 'small muted' }, t('level') + ' ' + r.level + ' · ' + list('titles')[r.level - 1])),
    h('div', { class: 'r num' }, icon('crown'), ' ' + short(r.respect))));
  if (S.ranking.me && S.ranking.me.pos > 100) st.append(h('div', { class: 'rk me' }, h('div', { class: 'p' }, S.ranking.me.pos), h('div', null, S.ranking.me.name), h('div', { class: 'r' }, short(S.ranking.me.respect))));
  out.push(st);
  return out;
}

function eventRow(e) {
  let txt;
  if (e.mode === 'mug') txt = e.win ? t('evMug', { who: e.by, m: money(e.money) }) : t('evMugLost', { who: e.by });
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
const RM = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
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
function rl3() { if (!S.rl3) { S.rl3 = C3.roulette({ order: RL_ORDER, colorOf: rlCol, sfx: fx.sfx }); if (S.rlLast) S.rl3.set(S.rlLast.n); } return S.rl3; }
async function rlAnim(r) {
  const T = rl3(); await tableFocus(T.el.parentNode || T.el);
  document.querySelector('.rl3num')?.classList.remove('on');
  await T.spin(r.n);
  const bd = document.querySelector('.rl3num'); if (bd) { bd.textContent = String(r.n); bd.className = 'rl3num on ' + rlCol(r.n); }
  S.rlHist = [r.n, ...(S.rlHist || [])].slice(0, 12); S.rlLast = r;
  await wait(RM() ? 300 : 1300);
}
const rlKey = (b) => b.t + (b.n !== undefined && b.n !== null ? ':' + b.n : '');
function rlAdd(t0, n) {
  S.rlBets = S.rlBets || {};
  const b = { t: t0, n }, k = rlKey(b), chip = chipNow(), tot = Object.values(S.rlBets).reduce((x, y) => x + y.amt, 0);
  if (!S.rlBets[k] && Object.keys(S.rlBets).length >= 12) return toast(t('rlMaxSpots'), true);
  if (tot + chip > betMax()) return toast(t('csOver', { m: money(betMax()) }), true);
  S.rlBets[k] = { ...b, amt: (S.rlBets[k]?.amt || 0) + chip };
  fx.sfx('tap'); render();
}
function screenRoulette() {
  const bets = S.rlBets || {}, tot = Object.values(bets).reduce((x, y) => x + y.amt, 0), last = S.rlLast, won = (b) => last && S.cfg && rlWon(b, last.n);
  const cell = (t0, n, label, cls) => {
    const k = rlKey({ t: t0, n }), b = bets[k];
    return h('button', { class: 'rlc ' + (cls || '') + (won({ t: t0, n }) ? ' hit' : ''), on: { click: () => rlAdd(t0, n) } }, label, b ? h('span', { class: 'chipm' }, moneyShort(b.amt)) : null);
  };
  const out = csHead('roulette');
  out.push(h('div', { class: 'rlbox' }, h('div', { class: 'rl3wrap' }, rl3().el, h('b', { class: 'rl3num num' + (last ? ' on ' + rlCol(last.n) : '') }, last ? String(last.n) : '')),
    h('div', { class: 'rlhist' }, (S.rlHist || []).map((n, i) => h('span', { class: 'hn ' + rlCol(n) + (i === 0 ? ' last' : '') }, String(n))))));
  if (last) out.push(csResult(last, t('rlOut', { n: last.n, c: t('rlc_' + rlCol(last.n)) })));
  out.push(h('div', { class: 'rlout' },
    cell('red', undefined, t('rl_r'), 'r'), cell('black', undefined, t('rl_b'), 'b'), cell('even', undefined, t('rlEven')), cell('odd', undefined, t('rlOdd')),
    cell('low', undefined, '1–18'), cell('high', undefined, '19–36'),
    cell('dozen', 0, '1–12', 'dz'), cell('dozen', 1, '13–24', 'dz'), cell('dozen', 2, '25–36', 'dz')));
  out.push(h('h2', { class: 'sec small' }, t('rlNums')), h('div', { class: 'rlnums' }, cell('num', 0, '0', 'g n0'),
    Array.from({ length: 36 }, (_, i) => cell('num', i + 1, String(i + 1), rlCol(i + 1)))));
  out.push(h('div', { class: 'stick csbar' }, chipPicker(),
    h('div', { class: 'row' }, h('button', { class: 'btn ghost', disabled: !tot, on: { click: () => { S.rlBets = {}; render(); } } }, t('csClear')),
      h('button', { class: 'btn buy grow big', disabled: !tot || tot > S.st.me.cash || S.casinoBusy, on: { click: () => play('roulette', { bets: Object.values(bets) }, rlAnim) } },
        tot ? t('rlSpin', { m: moneyShort(tot) }) : t('rlPlace')))));
  rl3().wake();
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
const WCOL = { 1: '#2f80ed', 2: '#f2b705', 5: '#ff5fa2', 10: '#8b5cf6', moeda: '#ff7a00', caixas: '#1fa655', bola: '#10b5c9', louca: '#e02b2b' };
const LCOL = ['#e02b2b', '#f2b705', '#1fa655', '#2f80ed', '#8b5cf6', '#ff5fa2'];
const TOPM = [2, 3, 5, 10, 20, 50];
const wLabel = (s) => (/^\d+$/.test(s) ? s : t('w_' + s));
function w3() {
  if (!S.w3 || S.w3lang !== lang()) {
    S.w3 = C3.bigWheel({ sfx: fx.sfx, hub: t('p_wheel').toUpperCase(), segs: S.cfg.casino.wheel.segs.map((k) => ({ text: /^\d+$/.test(k) ? k : t('w_' + k).toUpperCase(), color: WCOL[k], big: /^\d+$/.test(k) })) });
    S.w3lang = lang(); if (S.wLast) S.w3.set(S.wLast.idx);
  }
  return S.w3;
}
// põe a mesa à vista e encolhe a barra de baixo enquanto a jogada corre
async function tableFocus(el) {
  document.querySelector('.csres')?.remove();
  document.querySelector('.csbar')?.classList.add('anim');
  const top = document.querySelector('.hud')?.offsetHeight || 0, b = el.getBoundingClientRect();
  if (b.top < top || b.bottom > innerHeight - 170) { scrollTo({ top: Math.max(0, b.top + scrollY - top - 8), behavior: RM() ? 'auto' : 'smooth' }); await wait(RM() ? 0 : 320); }
}
function topSlotEl(last) {
  const cellS = (s) => h('span', { style: `color:${WCOL[s]}` }, wLabel(s)), cellM = (m) => h('span', null, '×' + m);
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
  sa.replaceChildren(...A.map((s) => h('span', { style: `color:${WCOL[s]}` }, wLabel(s)))); sb.replaceChildren(...B.map((m) => h('span', null, '×' + m)));
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
  const W3 = w3(), stage = box.querySelector('.wstage'), bet = (S.wBets || {})[r.s] || 0;
  await tableFocus(box);
  await topSpin(r);
  await W3.spin(r.idx);
  const topHit = r.top && r.top.s === r.s, show = (cls, ...kids) => { stage.className = 'wstage ' + cls; stage.hidden = false; stage.replaceChildren(...kids.filter(Boolean)); };
  if (r.bonus) {
    show('th-' + r.s + ' intro', h('b', { class: 'wst-title' }, t('wb_' + r.s))); fx.sfx('level'); await wait(RM() ? 400 : 1500);
    show('th-' + r.s, h('b', { class: 'wst-name' }, t('wb_' + r.s)));
    if (r.s === 'moeda') await C3.coinFlip(stage, { sides: r.bonus.sides, side: r.bonus.side, sfx: fx.sfx, L: { red: t('rl_r'), blue: t('wBlue') } });
    else if (r.s === 'caixas') await C3.cashHunt(stage, { boxes: r.bonus.boxes, pick: r.bonus.pick, sfx: fx.sfx, L: { shuffle: t('wShuffle'), pick: t('wPick') } });
    else if (r.s === 'bola') await C3.pachinko(stage, { slots: r.bonus.slots, at: r.bonus.at, sfx: fx.sfx });
    else {
      const lw = C3.bigWheel({ sfx: fx.sfx, cls: 'bw3 mini', turns: 4, secs: 7.5, hub: t('w_louca').toUpperCase(), segs: r.bonus.slots.map((v, i) => ({ text: '×' + v, color: LCOL[i % LCOL.length], big: true })) });
      stage.append(lw.el); lw.wake(); await wait(400); await lw.spin(r.bonus.at);
    }
  }
  // resultado em grande, com tempo para se ler
  const net = r.win - r.bet, base = topHit ? r.mult / r.top.m : r.mult;
  show('th-' + r.s + ' res',
    h('span', { class: 'wst-chip', style: `background:${WCOL[r.s]}` }, wLabel(r.s)),
    h('b', { class: 'wst-x' }, r.bonus || topHit ? '×' + r.mult : r.s + ':1'),
    topHit ? h('span', { class: 'wst-sub' }, t('wTopCalc', { a: base, b: r.top.m })) : null,
    h('b', { class: 'wst-win ' + (!bet ? 'muted' : net > 0 ? 'c-cash' : net < 0 ? 'c-red' : '') }, !bet ? t('wNoBet', { s: wLabel(r.s) }) : net > 0 ? t('csWon', { m: money(net) }) : net < 0 ? t('csLost', { m: money(-net) }) : t('csPush')));
  if (net > 0) { fx.sfx(r.mult >= 20 ? 'crit' : 'cash'); fx.vibrate(20); }
  await wait(RM() ? 1200 : r.bonus || net > 0 ? 3200 : 1900);
  S.wLast = r;
}
function screenWheel() {
  const W = S.cfg.casino.wheel, bets = S.wBets || {}, tot = Object.values(bets).reduce((x, y) => x + y, 0), last = S.wLast, W3 = w3();
  const out = csHead('wheel');
  out.push(h('div', { class: 'wbox' }, topSlotEl(last), W3.el, h('div', { class: 'wstage', hidden: true })));
  if (last) out.push(csResult(last, t('wOut', { s: wLabel(last.s) }) + (last.bonus || (last.top && last.top.s === last.s) ? ' · ×' + last.mult : '')));
  out.push(h('div', { class: 'wspots' }, W.spots.map((s) => h('button', { class: 'wsp', style: `--c:${WCOL[s]}`, on: { click: () => {
    const chip = chipNow(); if (tot + chip > betMax()) return toast(t('csOver', { m: money(betMax()) }), true);
    S.wBets = { ...bets, [s]: (bets[s] || 0) + chip }; fx.sfx('tap'); render(); } } },
    h('b', null, wLabel(s)), h('span', { class: 'small' }, /^\d+$/.test(s) ? s + ':1' : t('wBonus')), bets[s] ? h('span', { class: 'chipm' }, moneyShort(bets[s])) : null))));
  out.push(h('p', { class: 'small muted', style: 'margin:10px 0 0' }, t('wRules')));
  out.push(h('div', { class: 'stick csbar' }, chipPicker(),
    h('div', { class: 'row' }, h('button', { class: 'btn ghost', disabled: !tot, on: { click: () => { S.wBets = {}; render(); } } }, t('csClear')),
      h('button', { class: 'btn buy grow big', disabled: !tot || tot > S.st.me.cash || S.casinoBusy, on: { click: () => play('wheel', { bets: Object.entries(bets).map(([s, amt]) => ({ s, amt })) }, wheelAnim) } },
        tot ? t('rlSpin', { m: moneyShort(tot) }) : t('rlPlace')))));
  W3.wake();
  return out;
}

// ---- slots ----
// Quatro jogos: Chefão (o nosso), Trovão de Zeus 1000, Doce Vingança (6×5, paga em qualquer sítio) e Rebuçado Louco 1000 (7×7 por grupos).
const SLOT_OF = { slot: 'chefao', zeus: 'zeus', doce: 'doce', rebucado: 'rebucado' };
const SYM = (g, i) => `/img/slot/${g}/${i}.webp?2`;
const slotCfg = (g) => S.cfg.casino.slots[g];
function symImg(g, s, orb) {
  const G = slotCfg(g), big = orb >= 100 && (g === 'zeus' || g === 'doce');
  return SYM(g, s === G.nsym + 1 && big ? '10b' : s);
}
function slotCellEl(g, s, orb, spot) {
  const G = slotCfg(g), cls = 'sc2' + (s === G.nsym ? ' scat' : s === G.nsym + 1 ? ' orb' : '') + (spot === 1 ? ' mk' : spot >= 2 ? ' mx' : '');
  return h('div', { class: cls }, h('img', { src: symImg(g, s, orb), alt: '', width: 80, height: 80, decoding: 'async' }),
    orb ? h('b', { class: 'ov' }, '×' + orb) : null, spot >= 2 ? h('b', { class: 'spm' }, '×' + spot) : null);
}
function slotGrid(g) {
  const G = slotCfg(g), n = G.cols * G.rows, last = S.slotLast?.[g];
  const step = last ? (last.spin.free.at(-1) || last.spin.base).steps.at(-1) : null;
  const cells = step ? step.g : Array.from({ length: n }, (_, i) => (Math.imul(i + 7, 2654435761) >>> 9) % G.nsym);   // mistura fixa, sem padrão à vista
  return h('div', { class: 'sgrid', style: `--cols:${G.cols};--rows:${G.rows}` }, cells.map((s, i) => slotCellEl(g, s, step?.o?.[i], step?.sp?.[i])));
}
async function slotStep(g, grid, step, prev, fast) {
  const G = slotCfg(g), fresh = new Set();
  if (prev && prev.rm) for (let c = 0; c < G.cols; c++) { const k = prev.rm.filter((i) => i % G.cols === c).length; for (let r0 = 0; r0 < k; r0++) fresh.add(r0 * G.cols + c); }
  grid.replaceChildren(...step.g.map((s, i) => {
    const el = slotCellEl(g, s, step.o?.[i], step.sp?.[i]);
    if (!prev || fresh.has(i)) { el.classList.add('drop'); el.style.setProperty('--d', (prev ? 0 : (i % G.cols) * 50 + Math.floor(i / G.cols) * 16) + 'ms'); }
    return el;
  }));
  await wait(RM() ? 120 : fast ? 240 : 460);
  if (step.w) {
    step.rm.forEach((i) => grid.children[i].classList.add('hit'));
    const m = step.w.reduce((x, w) => x + (w.m || 0), 0);
    if (m) flashInfo('×' + m);
    fx.sfx('cash'); await wait(RM() ? 250 : fast ? 360 : 620);
    step.rm.forEach((i) => grid.children[i].classList.add('pop'));
    await wait(RM() ? 80 : fast ? 150 : 240);
  }
}
function flashInfo(txt, big) {
  const info = document.querySelector('.sinfo'); if (!info) return;
  info.textContent = txt; info.classList.add('on'); info.classList.toggle('big', !!big);
  clearTimeout(info._t); info._t = setTimeout(() => info.classList.remove('on', 'big'), big ? 1500 : 800);
}
async function slotAnim(r) {
  const g = r.game, G = slotCfg(g);
  S.slotSkip = false;
  document.querySelector('.csres')?.remove();   // o resultado anterior não fica à vista durante a jogada nova
  document.querySelector('.csbar')?.classList.add('anim');   // a barra encolhe para só o «saltar»: a grelha fica toda à vista
  const sl = document.querySelector('.slot');
  if (sl) {
    const top = document.querySelector('.hud')?.offsetHeight || 0, b0 = sl.getBoundingClientRect();
    if (b0.top < top || b0.bottom > innerHeight - 170) { scrollTo({ top: Math.max(0, b0.top + scrollY - top - 8), behavior: RM() ? 'auto' : 'smooth' }); await wait(RM() ? 0 : 320); }
  }
  const sk = document.querySelector('.csbar .btn.buy');
  if (sk) { sk.disabled = false; sk.textContent = t('slSkip'); sk.classList.replace('buy', 'ghost'); sk.addEventListener('click', () => { S.slotSkip = true; }); }
  document.querySelectorAll('.csbar .bbuy').forEach((b) => { b.disabled = true; });
  const grid = document.querySelector('.sgrid'), meter = document.querySelector('.swinm'), freeL = document.querySelector('.sfree');
  if (!grid) return;
  const show = (c) => { meter.textContent = money(Math.floor((r.base * Math.min(c, G.max * 100)) / 100)); };
  let acc = 0; show(0);
  const round = async (rd, fast, mult) => {
    let w = 0;
    for (let k = 0; k < rd.steps.length && !S.slotSkip; k++) {
      await slotStep(g, grid, rd.steps[k], k ? rd.steps[k - 1] : null, fast);
      if (rd.steps[k].w) { w += rd.steps[k].w.reduce((x, y) => x + y.pay, 0); show(acc + w); }
    }
    if (S.slotSkip) return;
    if (G.kind === 'scatter' && w > 0 && mult > 1) {
      grid.querySelectorAll('.orb').forEach((el) => el.classList.add('hit'));
      flashInfo('×' + mult); fx.sfx('crit'); await wait(RM() ? 300 : 900);
    }
    acc += G.kind === 'scatter' && w > 0 && mult > 1 ? w * mult : w; show(acc);
  };
  await round(r.spin.base, false, r.spin.base.orbSum);
  if (r.spin.free.length && !S.slotSkip) {
    acc += r.spin.scatPay; show(acc);
    grid.querySelectorAll('.scat').forEach((el) => el.classList.add('hit'));
    flashInfo(t('slFree', { n: r.spin.free.length }), true); fx.sfx('level'); await wait(RM() ? 600 : 1600);
    document.querySelector('.slot')?.classList.add('free');
    for (let k = 0; k < r.spin.free.length && !S.slotSkip; k++) {
      const f = r.spin.free[k];
      freeL.textContent = t(G.kind === 'scatter' && G.accFree ? 'slFreeLeftM' : 'slFreeLeft', { n: r.spin.free.length - k - 1, m: f.acc || 1 });
      await round(f, true, f.acc);
    }
  }
  S.slotLast = { ...(S.slotLast || {}), [g]: r }; S.slotSkip = false;
  const tot = Math.floor((r.base * r.spin.total) / 100);
  if (tot >= r.base * 50 && !RM()) { flashInfo(t('slBig', { x: Math.floor(tot / r.base) }), true); fx.sfx('level'); await wait(1600); }
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
  const g = SLOT_OF[page], G = slotCfg(g), chip = chipNow(), last = S.slotLast?.[g];
  const out = csHead(page);
  out.push(h('div', { class: 'slot th-' + g }, h('div', { class: 'stop' }, h('span', { class: 'sfree' }), h('b', { class: 'swinm num' }, last ? money(last.win) : '$0'), h('span', { class: 'sinfo' })), slotGrid(g)));
  if (last) out.push(csResult({ ...last, bet: last.bet }));
  out.push(h('div', { class: 'row', style: 'gap:8px;margin:0 0 4px;flex-wrap:wrap' }, h('button', { class: 'btn ghost sm', on: { click: () => slotPaytable(g) } }, t('slTable')),
    h('span', { class: 'small muted' }, t('slMaxWin', { x: num(G.max) }))));
  out.push(h('div', { class: 'stick csbar' }, chipPicker(),
    h('div', { class: 'row' }, h('button', { class: 'btn buy grow big', disabled: betMax() < S.cfg.casino.minBet || S.casinoBusy, on: { click: () => play('slot', { game: g, amt: chip }, slotAnim) } }, t('slSpin', { m: moneyShort(chip) }))),
    h('div', { class: 'row brow', style: 'gap:8px' },
      h('button', { class: 'btn ghost grow bbuy', disabled: S.casinoBusy, on: { click: () => slotBuy(g, 1) } }, t(G.superBuy ? 'slBuyS' : 'slBuy', { m: moneyShort(chip * G.buy) })),
      G.superBuy ? h('button', { class: 'btn ghost grow bbuy', disabled: S.casinoBusy, on: { click: () => slotBuy(g, 2) } }, t('slBuySuperB', { m: moneyShort(chip * G.superBuy) })) : null)));
  return out;
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
  const close = () => { bd.remove(); sh.remove(); document.removeEventListener('keydown', esc); };
  const esc = (e) => { if (e.key === 'Escape') close(); };
  bd.addEventListener('click', close); document.addEventListener('keydown', esc);
  document.body.append(bd, sh);
  return close;
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
    S.avOk ? h('h2', { class: 'sec', style: 'margin-top:10px' }, t('avatar')) : null,
    S.avOk ? h('div', { class: 'avgrid' }, Array.from({ length: S.cfg.avatars }, (_, i) => h('button', { class: i === me.av ? 'sel' : '', 'aria-label': t('avatar') + ' ' + (i + 1), 'aria-pressed': i === me.av ? 'true' : 'false',
      on: { click: async () => { await act('avatar', { i }); close(); openProfile(); } } }, h('img', { src: AV(i), alt: '', width: 96, height: 96, loading: 'lazy', on: { error: (e) => e.currentTarget.parentNode.remove() } })))) : null,
    h('div', { class: 'small muted' }, t('roundInfo', { n: r.n + 1, d: end })),
    h('div', { class: 'small muted' }, t('playersIn', { n: num(S.st.players) })),
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
  render();
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
