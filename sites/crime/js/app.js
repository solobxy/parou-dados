// Jogo de crime: interface. O servidor decide tudo; aqui só se mostra e se pede.

import { t, list, errText, setLang, lang, guessLang } from './i18n.js';
import { h, icon, svg, setLocale, num, money, moneyShort, short, dur, hoursText, pct, rid } from './ui.js';
import * as fx from './fx.js';

const $app = document.getElementById('app');
const S = {
  cfg: null, st: null, off: 0, tab: 'street', citySeg: 'club', fightSeg: 'targets',
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
  if (S.pending >= 4) return Promise.resolve(null);
  S.pending++;
  const p = S.queue.then(async () => {
    const before = S.st?.me;
    try {
      const out = await api('POST', '/api/act', { type, ...args, rid: rid() });
      S.st.me = out.me; S.stAt = now();
      await react(type, out, before, { ...opts, args });
      return out;
    } catch (e) {
      if (e.data?.me) { S.st.me = e.data.me; S.stAt = now(); }
      if (e.code && e.code !== 'LOGIN_REQUIRED') { toast(errText(e.code), true); fx.vibrate([30, 40, 30]); }
      render();
      return null;
    } finally { S.pending--; }
  });
  S.queue = p.catch(() => {});
  return p;
}

// ---------- reação visual ao resultado ----------
async function react(type, out, before, opts) {
  const r = out.result, me = out.me;
  const from = opts.el ? opts.el.getBoundingClientRect() : null;
  updateHud(before);
  if (type === 'crime') {
    store.set('tip.first', 1);
    const g = r.gained || {};
    const names = { F: t('statF'), I: t('statI'), C: t('statC') };
    let delay = 260;
    for (const [s, n] of Object.entries(g)) { if (from) fx.fly('+' + n + ' ' + names[s], 'var(--energy)', from, null, delay); delay += 160; }
    if (r.newChanceBp > r.chanceBp) S.chanceUp = { k: opts.args?.k, from: r.chanceBp, to: r.newChanceBp, t: Date.now() };
    if (Object.keys(g).length && !store.get('tip.practice')) { store.set('tip.practice', 1); setTimeout(() => toast(t('practiceTip')), 1400); }
    if (r.success) {
      opts.el?.classList.remove('win'); void opts.el?.offsetWidth; opts.el?.classList.add('win');
      if (from) { fx.bills(from, S.hud.cash, r.crit ? 12 : 5); fx.fly('+' + money(r.money), 'var(--cash)', from, S.hud.cash); fx.fly('+' + r.respect, 'var(--sodium)', from, S.hud.resp, 120); }
      fx.vibrate(r.crit ? [15, 40, 15, 40, 30] : 12);
      if (r.crit) fx.stamp(t('perfect'), 'var(--gold)');
      if (!store.get('tip.respect')) { store.set('tip.respect', 1); setTimeout(() => toast(t('tipRespect')), 900); }
    } else {
      opts.el?.classList.remove('lose'); void opts.el?.offsetWidth; opts.el?.classList.add('lose');
      fx.vibrate([40, 60, 40]);
      fx.stamp(t('busted'), 'var(--danger)');
      setTimeout(render, 700);
    }
  } else if (type === 'train') {
    if (from) fx.fly('+1', 'var(--energy)', from, null);
  } else if (type === 'drug' || type === 'refill') {
    if (from) fx.fly('+' + r.energy, 'var(--energy)', from, S.hud.ebar);
    fx.vibrate(12);
  } else if (type === 'detox') {
    if (from) fx.fly('0', 'var(--vice)', from, S.hud.vwrap);
    fx.vibrate([12, 30, 12]);
  } else if (type === 'collect') {
    let total = 0, lost = 0;
    for (const it of r.items) { total += it.money; lost += it.lost; }
    for (const c of r.port) if (!c.seized) total += c.got;
    if (total > 0 && from) { fx.bills(from, S.hud.cash, 10); fx.fly('+' + money(total), 'var(--cash)', from, S.hud.cash); fx.vibrate(15); }
    if (lost > 0) toast(t('raided', { m: money(lost) }), true);
    if (r.port.some((c) => c.seized)) toast(t('seized'), true);
  } else if (type === 'buyBiz' || type === 'luxury') {
    if (from && r.respect) fx.fly('+' + r.respect, 'var(--sodium)', from, S.hud.resp);
    fx.vibrate(12);
  } else if (type === 'attack') {
    await fx.fight(me.name, out.target.name, r.win, r.win ? (r.mode === 'mug' ? '+' + money(r.money) + ' · +' + r.respect : '+' + r.respect + ' ' + t('respect').toLowerCase()) : '−' + Math.abs(r.respect) + ' ' + t('respect').toLowerCase(), { win: t('youWon'), lose: t('youLost') });
    S.targets = null; loadTargets();
  }
  const lv = r.levelUp;
  render();
  if (lv && lv.to > lv.from) {
    await fx.levelUp(lv.to, t('levelUp'), list('titles')[lv.to - 1], t('newTitle'));
    skyline(lv.to);
  }
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
  S.hud.ebar = h('i');
  S.hud.vbar = h('i');
  S.hud.elbl = h('div', { class: 'barlbl' });
  S.hud.vwrap = h('div', { class: 'bar vice', title: t('vice') }, S.hud.vbar);
  const hud = h('header', { class: 'hud' },
    h('div', { class: 'hud-top' },
      h('button', { class: 'badge', 'aria-label': t('profile'), on: { click: openProfile } }, ring, S.hud.lvl),
      h('div', { class: 'who' }, S.hud.title, S.hud.name),
      h('div', { class: 'money' }, S.hud.cash, S.hud.resp)),
    h('div', { class: 'bars' },
      h('div', { style: 'display:grid;gap:5px' }, h('div', { class: 'bar', role: 'progressbar', 'aria-label': t('energy') }, S.hud.ebar), S.hud.vwrap),
      h('button', { class: 'plus', on: { click: () => { S.citySeg = 'club'; go('city'); } }, 'aria-label': t('club') }, icon('plus'), icon('bolt')),
      S.hud.elbl));
  S.hud.shown = { cash: me.cash, respect: me.respect };
  return hud;
}

function updateHud(before) {
  const me = S.st.me; if (!me || !S.hud.cash) return;
  const L = me.level;
  S.hud.lvl.textContent = L;
  S.hud.title.textContent = list('titles')[L - 1];
  S.hud.name.textContent = me.name + (S.st.rank ? ' · #' + S.st.rank : '');
  const span = me.levelTo ? (me.levelTo - me.levelFrom) : 1;
  const prog = me.levelTo ? Math.min(1, Math.max(0, (me.peakRespect - me.levelFrom) / span)) : 1;
  S.hud.ringFg.setAttribute('stroke-dashoffset', String(S.hud.C * (1 - prog)));
  const sh = S.hud.shown;
  if (sh.cash !== me.cash) { fx.roll(S.hud.cash, sh.cash, me.cash, moneyShort); if (me.cash > sh.cash) fx.pop(S.hud.cash); sh.cash = me.cash; } else S.hud.cash.textContent = moneyShort(me.cash);
  if (sh.respect !== me.respect) { fx.roll(S.hud.respN, sh.respect, me.respect, short); if (me.respect > sh.respect) fx.pop(S.hud.resp); sh.respect = me.respect; } else S.hud.respN.textContent = short(me.respect);
  tickHud();
}

function tickHud() {
  const me = S.st?.me; if (!me || !S.hud.ebar) return;
  const L = live(me);
  S.hud.ebar.style.width = (L.energy / S.cfg.energy.max) * 100 + '%';
  S.hud.vwrap.style.display = L.vice > 0 ? '' : 'none';
  S.hud.vbar.style.width = (L.vice / me.addictionCap) * 100 + '%';
  S.hud.elbl.replaceChildren(
    h('span', null, icon('bolt'), ' ', h('b', { class: 'num' }, L.energy + '/' + S.cfg.energy.max), ' · ', L.nextE ? t('nextIn', { t: dur(L.nextE) }) : t('full')),
    L.vice > 0 ? h('span', { class: 'c-vice' }, t('vice') + ' ' + L.vice + '/' + me.addictionCap) : h('span'));
  document.querySelectorAll('[data-left]').forEach((el) => { const left = +el.dataset.left - now(); el.textContent = dur(left); if (left <= 0 && el.dataset.re !== '1') { el.dataset.re = '1'; refresh(); } });
  document.querySelectorAll('[data-stored]').forEach((el) => { const i = +el.dataset.stored; const b = me.biz[i]; el.textContent = money(storedNow(b, i)); });
  document.querySelectorAll('[data-biz]').forEach((el) => {
    const i = +el.dataset.biz, b = me.biz[i]; const cap = b.perH * (S.cfg.storageMs / 3600000);
    const f = cap ? Math.min(1, storedNow(b, i) / cap) : 0;
    el.style.setProperty('--fill', f.toFixed(3)); el.classList.toggle('full', f >= 1);
    const bar = document.querySelector(`[data-fill="${i}"]`);
    if (bar) { bar.firstChild.style.width = f * 100 + '%'; bar.classList.toggle('full', f >= 1); }
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
const TABS = [['street', 'street'], ['gym', 'gym'], ['empire', 'empire'], ['city', 'city'], ['fights', 'fights']];
function go(tab) {
  S.tab = tab; document.body.dataset.tab = tab; store.set('tab', tab);
  if (tab === 'fights') { if (S.fightSeg === 'targets') loadTargets(); else loadRanking(); }
  render(); window.scrollTo({ top: 0 });
}

let $main, $tabs;
function shell() {
  const hud = buildHud();
  $main = h('main', { id: 'main' });
  $tabs = h('nav', null, TABS.map(([id, ic]) => h('button', { class: 'tab', dataset: { tab: id }, on: { click: () => go(id) } }, icon(ic), t(id))));
  $app.replaceChildren(hud, $main, h('div', { class: 'tabs' }, $tabs));
  document.body.dataset.tab = S.tab;
  updateHud();
}

function render() {
  if (!S.st) return;
  if (!S.st.me) return renderPause();
  if (!$main || !document.body.contains($main)) shell();
  $tabs.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-current', b.dataset.tab === S.tab ? 'page' : 'false'));
  const dot = $tabs.querySelector('[data-tab="fights"] .dot');
  const unseen = (S.events || []).some((e) => e.id > S.lastEventSeen);
  if (unseen && !dot) $tabs.querySelector('[data-tab="fights"]').appendChild(h('span', { class: 'dot' }));
  if (!unseen && dot) dot.remove();
  const f = { street: screenStreet, gym: screenGym, empire: screenEmpire, city: screenCity, fights: screenFights }[S.tab];
  $main.replaceChildren(...f());
  updateHud();
}

function head(title, sub, scene) {
  if (!scene) return h('div', { class: 'screen-h' }, h('h1', null, title), h('p', null, sub));
  return h('div', { class: 'hero' },
    h('img', { src: `/img/cenas/${scene}.webp`, alt: '', width: 720, height: 720, decoding: 'async' }),
    h('div', { class: 'txt' }, h('h1', null, title), h('p', null, sub)));
}

function busyBanner(me) {
  const L = live(me);
  if (L.jail) return h('div', { class: 'state jail' }, art('cenas', 'prisao', 'bg'), h('h3', null, t('jail')), h('div', { class: 't' }, t('jailSub', { t: '' }), h('b', { class: 'num', dataset: { left: me.jailUntil } }, dur(L.jail))),
    h('button', { class: 'btn danger block', on: { click: (e) => act('bail', {}, { el: e.currentTarget }) } }, t('payBail', { m: money(me.bail) })));
  if (L.hosp) return h('div', { class: 'state hosp' }, art('cenas', 'hospital', 'bg'), h('h3', null, t('hospital')), h('div', { class: 't' }, t('hospitalSub', { t: '' }), h('b', { class: 'num', dataset: { left: me.hospUntil } }, dur(L.hosp))),
    h('button', { class: 'btn danger block', on: { click: (e) => act('medic', {}, { el: e.currentTarget }) } }, t('payMedic', { m: money(me.medic) })));
  return null;
}

// recarga num toque e desintoxicação (discoteca e rua)
function refillBtn(me, busy) {
  const L = live(me), R = me.refill;
  if (R) return h('button', { class: 'btn pri block refill', disabled: !!busy, on: { click: (e) => act('refill', {}, { el: e.currentTarget }) } },
    icon('bolt'), t('refillBtn', { e: R.energy, m: money(R.cost) }));
  const why = L.energy >= S.cfg.energy.max - 4 ? t('refillFull') : L.vice >= me.addictionCap - 1 ? t('refillVice') : t('refillMoney');
  return h('button', { class: 'btn block refill', disabled: true }, why);
}
function detoxCard(me, busy) {
  const L = live(me);
  if (L.vice <= 0) return null;
  const wait = me.detoxReadyAt > now() ? me.detoxReadyAt : 0;
  return h('div', { class: 'card detox' },
    h('div', { class: 'row sp' }, h('b', null, icon('pill'), ' ' + t('detoxTitle')), h('span', { class: 'small c-vice num' }, L.vice + '/' + me.addictionCap)),
    h('p', { class: 'small muted' }, t('detoxSub')),
    wait ? h('p', { class: 'small muted' }, t('detoxWait', { t: '' }), h('b', { class: 'num', dataset: { left: wait } }, dur(wait - now())))
      : h('button', { class: 'btn block', style: 'background:var(--vice);color:#160a24', disabled: !!busy || me.cash + me.bank < me.detox,
        on: { click: (e) => act('detox', {}, { el: e.currentTarget }) } }, t('detoxBtn', { m: money(me.detox) })));
}

function tip(key, text) {
  if (store.get('tip.' + key)) return null;
  const el = h('div', { class: 'tip' }, h('p', null, text), h('button', { class: 'btn sm', on: { click: () => { store.set('tip.' + key, 1); el.remove(); } } }, t('ok')));
  return el;
}

// ilustrações que já existem (as outras mostram o ícone num quadrado escuro)
function art(kind, id, cls = 'art') {
  return h('img', { class: cls, src: `/img/${kind}/${id}.webp`, alt: '', width: 480, height: 480, loading: 'lazy', decoding: 'async' });
}

// cenas animadas dos negócios: o produto cresce com o armazém (--fill vai de 0 a 1)
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

function screenStreet() {
  const me = S.st.me, C = S.cfg.crimes, L = live(me);
  const out = [head(t('streetTitle'), t('streetSub'))];
  const b = busyBanner(me); if (b) out.push(b);
  out.push(tip('first', t('tipFirst')));
  const minE = C[0].e;
  if (!b && L.energy < minE) {
    out.push(h('div', { class: 'note' }, h('h3', null, t('outOfEnergy')),
      h('p', { class: 'muted' }, t('outOfEnergySub', { t: '' }), h('b', { class: 'num', dataset: { left: now() + (minE - L.energy - 1) * S.cfg.energy.regenMs + (L.nextE || 0) } }, '')),
      refillBtn(me, b), me.refill ? null : detoxCard(me, b),
      h('button', { class: 'btn ghost block', on: { click: () => { S.citySeg = 'club'; go('city'); } } }, t('goClub'))));
    if (!store.get('tip.energy')) out.push(tip('energy', t('tipEnergy')));
  } else if (!b && L.energy < 25 && me.refill) {
    out.push(h('div', { style: 'margin-bottom:12px' }, refillBtn(me, b)));
  }
  const jobs = h('div', { class: 'stack' });
  let lockedShown = false;
  C.forEach((c, k) => {
    const info = me.crimes[k];
    if (!info.unlocked) {
      if (lockedShown) return; lockedShown = true;
      jobs.append(h('div', { class: 'job lock', 'aria-disabled': 'true' },
        art('crimes', c.id),
        h('div', { class: 'nm' }, list('crimes')[k]),
        h('div', { class: 'meta' }, icon('lock'), t('needsStats', { s: statNames(c.w) })),
        h('div', { class: 'pct' }, pct(info.chance), h('small', null, t('chance')))));
      return;
    }
    const cls = info.chance >= 7000 ? 'hi' : info.chance >= 4000 ? 'mid' : 'lo';
    const btn = h('button', { class: 'job ' + cls, disabled: !!b,
      'aria-label': `${list('crimes')[k]}, ${pct(info.chance)} ${t('chance')}, ${c.e} ${t('energy')}`,
      on: { click: (e) => act('crime', { k }, { el: e.currentTarget }) } },
      art('crimes', c.id),
      h('div', { class: 'nm' }, list('crimes')[k]),
      h('div', { class: 'meta' },
        h('span', { class: 'e' }, icon('bolt'), ' ', c.e),
        h('span', { class: 'm' }, money(c.min) + '–' + money(c.max)),
        h('span', { class: 'r' }, icon('crown'), ' +' + c.r),
        h('span', null, icon('timer'), ' ' + c.jailMin + ' min')),
      h('div', { class: 'pct' + (S.chanceUp && S.chanceUp.k === k && Date.now() - S.chanceUp.t < 4000 ? ' up' : '') }, pct(info.chance),
        S.chanceUp && S.chanceUp.k === k && Date.now() - S.chanceUp.t < 4000 ? h('i', { class: 'delta' }, '▲' + (Math.round((S.chanceUp.to - S.chanceUp.from) / 100) >= 1 ? Math.round((S.chanceUp.to - S.chanceUp.from) / 100) + '%' : '')) : null,
        h('small', null, t('chance'))));
    jobs.append(btn);
  });
  out.push(jobs);
  return out.filter(Boolean);
}

function screenGym() {
  const me = S.st.me;
  const out = [head(t('gymTitle'), t('gymSub'), 'ginasio')];
  const b = busyBanner(me); if (b) out.push(b);
  out.push(h('div', { class: 'power' },
    h('div', { class: 'card' }, h('b', { class: 'c-red' }, short(me.attack)), h('span', { class: 'small muted' }, t('attackPower'))),
    h('div', { class: 'card' }, h('b', { class: 'c-en' }, short(me.defense)), h('span', { class: 'small muted' }, t('defensePower')))));
  const st = h('div', { class: 'stack' });
  for (const s of ['F', 'T', 'I', 'C']) {
    const train = async (e, n) => { const el = e.currentTarget; for (let i = 0; i < n; i++) { const r = await act('train', { stat: s }, { el }); if (!r) break; } };
    st.append(h('div', { class: 'card stat' },
      h('div', { class: 'head' }, h('span', { class: 'v num' }, num(me.stats[s])), h('span', { class: 'lbl' }, t('stat' + s))),
      h('button', { class: 'btn pri sm', disabled: !!b, on: { click: (e) => train(e, 1) } }, '+1'),
      h('button', { class: 'btn sm', disabled: !!b, on: { click: (e) => train(e, 5) } }, t('trainX5')),
      h('p', { class: 'd' }, t('stat' + s + 'd')),
      me.xp && s !== 'T' ? h('div', { class: 'prac' }, h('span', { class: 'small muted' }, t('practiceLbl')),
        h('div', { class: 'fill' }, h('i', { style: `width:${Math.min(100, (me.xp[s] / me.xpNeed[s]) * 100)}%;background:var(--energy)` }))) : null));
  }
  out.push(st);
  return out;
}

function screenEmpire() {
  const me = S.st.me, B = S.cfg.biz;
  const out = [head(t('empireTitle'), t('empireSub'))];
  const total = me.biz.reduce((s, b, i) => s + storedNow(b, i), 0);
  const readyPort = me.port.filter((c) => c.readyAt <= now()).length;
  const owns = me.biz.some((b) => b.n > 0) || me.port.length > 0;
  if (owns) out.push(h('div', { class: 'collect' }, h('button', { class: 'btn cash block', dataset: { total: 1 }, disabled: total <= 0 && !readyPort,
    on: { click: (e) => act('collect', {}, { el: e.currentTarget }) } }, total > 0 || readyPort ? t('collect', { m: money(total) }) : t('nothingToCollect'))));
  else out.push(tip('empire', t('tipEmpire')));
  const list_ = h('div', { class: 'stack' });
  B.forEach((cfg, i) => {
    const b = me.biz[i];
    const cap = b.perH * (S.cfg.storageMs / 3600000);
    const stored = storedNow(b, i);
    const unitPerH = Math.floor(cfg.perH * (1000 + Math.min(me.stats[cfg.stat], 1000)) / 1000);
    const pb = b.price ? b.price / unitPerH : 0;
    const fill = cap ? Math.min(1, stored / cap) : 0;
    const scene = h('div', { class: 'bscene ' + cfg.id + (b.n > 0 ? ' on' : '') + (fill >= 1 ? ' full' : ''), dataset: { biz: i }, style: `--fill:${fill.toFixed(3)}` },
      art('biz', cfg.id, 'pic'), b.n > 0 ? bizAnim(cfg.id) : null);
    list_.append(h('div', { class: 'card biz' },
      h('div', { class: 'bhead' }, scene,
        h('div', { class: 'binfo' },
          h('div', { class: 'top' }, h('div', { class: 'nm' }, list('biz')[i]), h('div', { class: 'cnt num' }, '×' + b.n)),
          b.n > 0 ? h('div', { class: 'small' }, h('b', { class: 'c-cash num', dataset: { stored: i } }, money(stored)), h('span', { class: 'muted num' }, ' · ' + money(b.perH) + t('perHour')))
            : h('div', { class: 'small muted' }, t('notOwned')),
          h('div', { class: 'small muted' }, cfg.toBank ? t('legal') : t('raidRisk')))),
      b.n > 0 ? h('div', { class: 'fill' + (fill >= 1 ? ' full' : ''), dataset: { fill: i } }, h('i', { style: `width:${fill * 100}%` })) : null,
      b.price ? h('div', { class: 'row sp' }, h('span', { class: 'small muted' }, '+' + money(unitPerH) + t('perHour') + ' · ' + t('paysBack', { t: hoursText(pb) }) + ' · +' + cfg.resp + ' ' + t('respect').toLowerCase()),
        h('button', { class: 'btn sm cash', on: { click: (e) => act('buyBiz', { i }, { el: e.currentTarget }) } }, t('buyFor', { m: moneyShort(b.price) })))
        : h('div', { class: 'small c-resp' }, t('maxed'))));
  });
  out.push(list_);
  // porto
  out.push(h('h2', { class: 'sec' }, t('port')), h('p', { class: 'secsub' }, t('portSub')));
  const pc = h('div', { class: 'card stack port' }, h('div', { class: 'band' }, art('cenas', 'porto', 'pic')));
  pc.append(h('div', { class: 'small muted' }, t('slots', { a: me.port.length, b: me.portSlots })));
  for (const c of me.port) {
    const left = c.readyAt - now();
    pc.append(h('div', { class: 'cont' }, h('span', { class: 'num' }, icon('ship'), ' ' + money(c.amount)),
      left > 0 ? h('span', { class: 'muted' }, t('arrivesIn', { t: '' }), h('b', { class: 'num', dataset: { left: c.readyAt } }, dur(left))) : h('b', { class: 'c-cash' }, t('ready'))));
  }
  const liquid = me.cash + me.bank;
  const ending = S.st.round.playEnd - now() < S.cfg.port.ms;
  if (me.port.length < me.portSlots) {
    const opts = [0.25, 0.5, 1].map((f) => Math.min(me.portCap, Math.floor(liquid * f))).filter((v, i, a) => v >= S.cfg.port.minAmount && a.indexOf(v) === i);
    if (ending) pc.append(h('p', { class: 'small muted' }, t('portEnding')));
    else pc.append(h('div', { class: 'row', style: 'flex-wrap:wrap' }, opts.map((v) => h('button', { class: 'btn sm grow', on: { click: (e) => act('port', { amount: v }, { el: e.currentTarget }) } }, t('ship', { m: moneyShort(v) })))));
  }
  out.push(pc);
  return out;
}

function screenCity() {
  const me = S.st.me;
  const out = [head(t('cityTitle'), t('citySub'), { club: 'discoteca', bank: 'banco', lux: 'luxos' }[S.citySeg])];
  const segs = [['club', t('club')], ['arms', t('weapons')], ['bank', t('bankTitle')], ['lux', t('luxuries')]];
  out.push(h('div', { class: 'seg', role: 'group' }, segs.map(([id, lbl]) => h('button', { 'aria-pressed': S.citySeg === id ? 'true' : 'false', on: { click: () => { S.citySeg = id; render(); } } }, lbl))));
  const L = live(me);
  if (S.citySeg === 'club') {
    out.push(h('p', { class: 'secsub' }, t('clubSub')));
    const b = busyBanner(me); if (b) out.push(b);
    out.push(h('div', { class: 'card' }, h('div', { class: 'row sp small' }, h('span', { class: 'c-en' }, icon('bolt'), ' ' + t('energy') + ' ' + L.energy + '/' + S.cfg.energy.max), h('span', { class: 'c-vice' }, icon('pill'), ' ' + t('vice') + ' ' + L.vice + '/' + me.addictionCap)),
      h('div', { class: 'fill', style: 'margin-top:8px' }, h('i', { style: `width:${(L.vice / me.addictionCap) * 100}%;background:var(--vice)` })),
      h('p', { class: 'small muted', style: 'margin-top:6px' }, t('viceDown'))));
    out.push(h('div', { class: 'stack', style: 'margin-top:8px' }, refillBtn(me, b), detoxCard(me, b)));
    out.push(h('h2', { class: 'sec' }, t('orPick')));
    const st = h('div', { class: 'stack', style: 'margin-top:8px' });
    S.cfg.drugs.forEach((g, d) => {
      const ok = L.energy + g.e <= S.cfg.energy.max && L.vice + g.a <= me.addictionCap && me.cash + me.bank >= g.price && !b;
      st.append(h('div', { class: 'card row item' }, art('drugs', g.id, 'thumb'),
        h('div', { class: 'grow' }, h('div', { style: 'font-weight:700' }, list('drugs')[d]),
          h('div', { class: 'small muted' }, h('span', { class: 'c-en' }, '+' + g.e + ' ' + t('energy').toLowerCase()), ' · ', h('span', { class: 'c-vice' }, '+' + g.a + ' ' + t('vice').toLowerCase()), ' · ' + (g.e / g.a).toFixed(2).replace(/\.?0+$/, '') + '×')),
        h('button', { class: 'btn sm pri', disabled: !ok, on: { click: (e) => act('drug', { d }, { el: e.currentTarget }) } }, money(g.price))));
    });
    out.push(st);
  } else if (S.citySeg === 'arms') {
    for (const [kind, arr, names, lbl, ic] of [['weapon', S.cfg.weapons, list('weaponsL'), t('weapon'), 'gun'], ['armor', S.cfg.armors, list('armorsL'), t('armor'), 'shield']]) {
      const cur = me[kind];
      const nx = cur + 1;
      out.push(h('div', { class: 'card stack', style: 'margin-bottom:8px' },
        h('div', { class: 'row sp' }, h('span', { class: 'muted small' }, icon(ic), ' ' + lbl), h('b', null, cur >= 0 ? names[cur] + ' · +' + arr[cur].bp / 100 + '%' : t('none'))),
        nx < arr.length ? h('div', { class: 'gear' }, art(kind === 'weapon' ? 'weapons' : 'armors', nx, 'thumb'),
          h('div', { class: 'grow' }, h('div', { class: 'small muted' }, t('upgrade')), h('div', { class: 'nx' }, names[nx] + ' · +' + arr[nx].bp / 100 + '%')),
          h('button', { class: 'btn pri sm', disabled: me.cash + me.bank < arr[nx].price, on: { click: (e) => act('gear', { kind, idx: nx }, { el: e.currentTarget }) } }, moneyShort(arr[nx].price)))
          : h('div', { class: 'gear' }, art(kind === 'weapon' ? 'weapons' : 'armors', cur, 'thumb'), h('div', { class: 'small c-resp' }, t('maxed')))));
    }
  } else if (S.citySeg === 'bank') {
    out.push(h('p', { class: 'secsub' }, t('bankSub')));
    const fee = Math.ceil(me.cash * S.cfg.bank.feeBp / 10000);
    out.push(h('div', { class: 'card stack' },
      h('div', { class: 'row sp' }, h('span', { class: 'muted' }, icon('cash'), ' ' + t('cash')), h('b', { class: 'c-cash num' }, money(me.cash))),
      h('div', { class: 'row sp' }, h('span', { class: 'muted' }, icon('bank'), ' ' + t('bank')), h('b', { class: 'num' }, money(me.bank))),
      h('button', { class: 'btn pri block', disabled: me.cash <= 0, on: { click: (e) => act('deposit', { amount: me.cash }, { el: e.currentTarget }) } }, t('depositAll', { m: money(me.cash) }) + (me.cash > 0 ? ' · ' + t('fee', { m: money(fee) }) : '')),
      h('button', { class: 'btn ghost block', disabled: me.bank <= 0, on: { click: (e) => act('withdraw', { amount: me.bank }, { el: e.currentTarget }) } }, t('withdrawAll', { m: money(me.bank) }))));
  } else {
    out.push(h('p', { class: 'secsub' }, t('luxSub')));
    const names = list('lux');
    if (me.luxuries < S.cfg.luxury.max) out.push(h('button', { class: 'btn pri block', style: 'margin-bottom:12px', disabled: me.cash + me.bank < me.luxuryPrice, on: { click: (e) => act('luxury', {}, { el: e.currentTarget }) } },
      icon('gem'), ' ' + t('buyLux', { x: names[me.luxuries], m: moneyShort(me.luxuryPrice) })));
    if (me.luxuries) out.push(h('div', { class: 'chips' }, names.slice(0, me.luxuries).map((n) => h('span', { class: 'chip' }, n))));
  }
  return out;
}

function screenFights() {
  const me = S.st.me, n = now();
  const out = [head(t('fightsTitle'), t('fightsSub'), 'lutas')];
  out.push(h('div', { class: 'seg', role: 'group' }, [['targets', t('targets')], ['ranking', t('ranking')], ['events', t('events').split(' ')[0] === 'What' ? 'News' : 'Avisos']].map(([id, lbl]) =>
    h('button', { 'aria-pressed': S.fightSeg === id ? 'true' : 'false', on: { click: () => { S.fightSeg = id; if (id === 'targets') loadTargets(); else if (id === 'ranking') loadRanking(); else loadEvents(true); render(); } } }, lbl))));
  if (S.fightSeg === 'targets') {
    const b = busyBanner(me); if (b) out.push(b);
    const info = [];
    if (me.shieldUntil > n) info.push(t('newShield', { t: dur(me.shieldUntil - n) }));
    else if (Math.max(me.protectUntil, me.capUntil) > n) info.push(t('protectedUntil', { t: dur(Math.max(me.protectUntil, me.capUntil) - n) }));
    if (n - S.st.round.start < S.cfg.round.noPvpMs) info.push(t('noPvpYet'));
    if (info.length) out.push(h('div', { class: 'tip' }, h('p', null, info.join(' '))));
    if (!S.targets) out.push(h('p', { class: 'muted' }, t('loading')));
    else if (!S.targets.length) out.push(h('div', { class: 'note' }, h('p', { class: 'muted' }, t('noTargets'))));
    else {
      const st = h('div', { class: 'stack' });
      for (const x of S.targets) {
        const col = x.chance >= 7000 ? 'c-cash' : x.chance >= 4000 ? 'c-resp' : 'c-red';
        st.append(h('div', { class: 'card tgt' },
          h('div', null, h('div', { class: 'nm' }, x.name), h('div', { class: 'lv' }, t('level') + ' ' + x.level + ' · ' + list('titles')[x.level - 1] + ' · ', h('span', { class: 'c-resp' }, icon('crown'), ' ' + short(x.respect)))),
          h('div', { class: 'pct ' + col }, pct(x.chance), h('div', { class: 'small muted', style: 'font-family:var(--ui);font-weight:500;font-size:11px' }, t('chance'))),
          h('div', { class: 'acts' },
            h('button', { class: 'btn danger sm', disabled: !!b, on: { click: (e) => act('attack', { target: x.name, mode: 'beat' }, { el: e.currentTarget }) } }, icon('fist'), t('beat') + ' · +' + x.gain),
            h('button', { class: 'btn sm', disabled: !!b, on: { click: (e) => act('attack', { target: x.name, mode: 'mug' }, { el: e.currentTarget }) } }, icon('cash'), t('rob') + ' · ~' + moneyShort(x.loot)))));
      }
      out.push(st);
    }
    out.push(h('button', { class: 'btn ghost block', style: 'margin-top:12px', on: { click: () => { S.targets = null; render(); loadTargets(); } } }, icon('refresh'), t('retry')));
  } else if (S.fightSeg === 'ranking') {
    if (!S.ranking) out.push(h('p', { class: 'muted' }, t('loading')));
    else {
      const st = h('div', null);
      for (const r of S.ranking.top) {
        st.append(h('div', { class: 'rk' + (r.pos <= 3 ? ' g' + r.pos : '') + (r.me ? ' me' : '') },
          h('div', { class: 'p' }, r.pos), h('div', null, h('div', { style: 'font-weight:700' }, r.name), h('div', { class: 'small muted' }, t('level') + ' ' + r.level + ' · ' + list('titles')[r.level - 1])),
          h('div', { class: 'r num' }, icon('crown'), ' ' + short(r.respect))));
      }
      if (S.ranking.me && S.ranking.me.pos > 100) st.append(h('div', { class: 'rk me' }, h('div', { class: 'p' }, S.ranking.me.pos), h('div', null, S.ranking.me.name), h('div', { class: 'r' }, short(S.ranking.me.respect))));
      out.push(st);
    }
  } else {
    if (!S.events) out.push(h('p', { class: 'muted' }, t('loading')));
    else if (!S.events.length) out.push(h('div', { class: 'note' }, h('p', { class: 'muted' }, t('noEvents'))));
    else out.push(h('div', { class: 'stack' }, S.events.map(eventRow)));
  }
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
async function loadRanking() { try { S.ranking = await api('GET', '/api/ranking'); if (S.tab === 'fights') render(); } catch {} }
async function loadEvents(seen) {
  try {
    const r = await api('GET', '/api/events'); S.events = r.list;
    S.lastEventSeen = store.get('evSeen', 0);
    if (seen && S.events.length) { S.lastEventSeen = S.events[0].id; store.set('evSeen', S.lastEventSeen); }
    render();
  } catch {}
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
    h('div', { class: 'small muted' }, t('roundInfo', { n: r.n + 1, d: end })),
    h('div', { class: 'small muted' }, t('playersIn', { n: num(S.st.players) })),
    h('h2', { class: 'sec', style: 'margin-top:10px' }, t('language')), langBtns,
    h('h2', { class: 'sec', style: 'margin-top:10px' }, t('animations')), animBtns,
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
    h('div', { class: 'land-art', 'aria-hidden': 'true' }, h('img', { src: '/img/cenas/entrada.webp', alt: '', width: 720, height: 720, fetchpriority: 'high', decoding: 'async' })),
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
  try {
    const st = await api('GET', '/api/state');
    S.st = st; S.stAt = now();
    if (st.account?.lang && !store.get('lang')) applyLang(st.account.lang);
    render();
  } catch {}
}

async function start() {
  [S.cfg] = await Promise.all([S.cfg || api('GET', '/api/config')]);
  const st = await api('GET', '/api/state');
  if (!st.account) { S.st = null; return showLanding(st); }
  S.st = st; S.stAt = now();
  $main = null;
  S.tab = store.get('tab', 'street');
  render();
  if (st.me) skyline(st.me.level);
  loadEvents(false);
}

applyLang(guessLang());
fx.setLight(store.get('light', false));
setInterval(tickHud, 1000);
setInterval(() => { if (S.st && document.visibilityState === 'visible') { refresh(); loadEvents(false); } }, 30000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.st) refresh(); });
start().catch((e) => { if (e.code !== 'LOGIN_REQUIRED') { if (!S.st) showLanding(); } });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
