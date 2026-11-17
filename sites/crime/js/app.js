// Jogo de crime: interface. O servidor decide tudo; aqui só se mostra e se pede.

import { t, tv, list, errText, setLang, lang, guessLang } from './i18n.js';
import { h, icon, svg, setBtn, setLocale, num, money, moneyShort, short, dur, hoursText, pct, rid } from './ui.js';
import * as fx from './fx.js';
import * as RV from './reveal.js';
import * as CZ from './crazy.js';
import * as C3 from './casino3d.js';
import * as GL from './globo.js';
import * as TK from './tarefas.js';

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
// 100 níveis e 20 títulos: o título muda de 5 em 5 níveis
const titleOf = (L) => { const T = list('titles'); return T[Math.min(T.length - 1, Math.floor((Math.max(1, L) - 1) / 5))]; };
// a época aberta (vem com o estado; versões antigas do servidor não a mandam)
const season = () => S.st?.season || null;
const divName = (d) => { const z = S.cfg?.season?.divSize || 20; return (d * z + 1) + '–' + (d + 1) * z; };
// o que falta para a época acabar, por extenso: «25 dias», «1 dia e 8 horas», «7 horas e 12 minutos»
function leftTxt(ms) {
  const m = Math.max(0, Math.ceil(ms / 60000)), d = Math.floor(m / 1440), hh = Math.floor((m % 1440) / 60), mm = m % 60;
  if (d >= 2) return t('nDays', { n: d });
  if (d === 1) return hh ? t('dayHours', { h: hh }) : t('nDay');
  return hh ? t('hoursMins', { h: hh, m: mm }) : t('nMins', { n: mm });
}
const nb = (x) => String(x).replace(/ /g, '\u00a0').replace(/-/g, '\u2011');   // não parte a linha a meio («Nível 12», «às 21:00»)
const fimEpoca = (ep) => nb(new Date(ep.end).toLocaleString(lang() === 'pt' ? 'pt-PT' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }));

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

// Avisos curtos por cima da barra de baixo. Os que nascem da mesma ação (ex.: recolher dinheiro e mercadoria do porto) ficam
// empilhados, no máximo 3; os de uma ação nova substituem os antigos.
let toastAt = 0;
function toast(msg, bad) {
  const t0 = performance.now();
  let box = document.querySelector('.toasts');
  if (!box) { box = h('div', { class: 'toasts' }); document.body.appendChild(box); }
  if (t0 - toastAt > 400) box.replaceChildren();
  toastAt = t0;
  const el = h('div', { class: 'toast' + (bad ? ' bad' : ''), role: 'status' }, msg);
  box.appendChild(el);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => { if (!el.isConnected) return; const a = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250 }); a.onfinish = () => el.remove(); }, 2600 + (box.children.length - 1) * 900);
}

// as ações vão em fila, uma de cada vez, pela ordem dos toques
function act(type, args = {}, opts = {}) {
  const job = type === 'crime' || type === 'crimeAll';
  if (job) {
    if (S.crimeBusy) return Promise.resolve(null);   // um golpe de cada vez: o cartão mostra que está a decorrer
    S.crimeBusy = true;
    document.querySelector('.toasts')?.replaceChildren();   // os avisos da ação anterior (ex.: «reparada») não ficam por cima do relatório
    opts.el?.classList.add('go'); fx.sfx('tap');
  } else if (S.pending >= 4) return Promise.resolve(null);
  S.pending++;
  const p = S.queue.then(async () => {
    const before = S.st?.me, started = performance.now();
    try {
      let out;
      // o biscate entregue um nadinha antes do tempo (o relógio daqui não bate ao milissegundo com o do servidor): espera e volta a entregar
      for (let k = 0; ; k++) {
        try { out = await api('POST', '/api/act', { type, ...args, rid: rid() }); break; }
        catch (e) { if (type === 'workDone' && e.code === 'TOO_FAST' && k < 3) { await new Promise((r) => setTimeout(r, Math.min(5000, (e.data?.wait || 500) + 250))); continue; } throw e; }
      }
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
  } else if (type === 'drug' || type === 'stockUse' || type === 'clubBuy') fx.sfx('refill');
  else if (type === 'stockBuy') { toast(t('stBought', { n: num(r.n), x: t('st_' + S.cfg.stocks.list[r.k].id), m: money(r.paid) })); fx.sfx('buy'); }
  else if (type === 'stockSell') { toast(t('stSold', { m: money(r.got), p: (r.profit >= 0 ? '+' : '−') + money(Math.abs(r.profit)) }), r.profit < 0); fx.sfx(r.profit >= 0 ? 'cash' : 'fail'); }
  else if (type === 'venueCollect') { toast(t('got', { m: money(r.club + r.bro) })); fx.sfx('cash'); }
  else if (type === 'gangBizCollect') { if (r.money > 0) { toast(t('got', { m: money(r.money) })); fx.sfx('cash'); } }
  else if (type === 'gangBiz') { toast(t('gBizDone', { m: money(r.amount), x: t('gb_' + r.biz) })); fx.sfx('claim'); }
  else if (type === 'gangLeave') { if (r.back > 0) { toast(t('gBizBack', { m: money(r.back) })); fx.sfx('cash'); } }
  else if (type === 'stockHold') { toast(t(r.on ? 'holdOnToast' : 'holdOffToast', { x: list('drugs')[r.d] })); fx.sfx('claim'); }
  else if (type === 'port') { toast(t('shSent', { x: list('ships')[r.k], t: hrs(S.cfg.port.ships[r.k].ms) })); fx.sfx('claim'); }
  else if (type === 'bizGoods') { toast(r.on ? t('bizGoodsOn', { x: list('drugs')[r.d] }) : t('bizGoodsOff')); fx.sfx('claim'); }
  else if (type === 'acct') { toast(t('acHired')); fx.sfx('claim'); }
  else if (type === 'stockLimit') { toast(r.tp || r.sl ? t('stLimSaved') : t('stLimOff')); fx.sfx('claim'); }
  else if (type === 'stockDump') { toast(t('got', { m: money(r.got) })); fx.sfx('cash'); }
  else if (type === 'mktBuy') { toast(t('tMkBought', { q: qty(r.d, r.n), x: list('drugs')[r.d].toLowerCase(), m: money(r.cost) })); fx.sfx('buy'); }
  else if (type === 'mktSell') { toast(t('tMkSold', { q: qty(r.d, r.n), x: list('drugs')[r.d].toLowerCase(), m: money(r.got) })); fx.sfx('cash'); }
  else if (type === 'mvSend') { toast(t('tSent', { q: qty(r.d, r.n), x: list('drugs')[r.d].toLowerCase(), h: hhmm(r.at), ...rgF(r.b) })); fx.sfx('claim'); }
  else if (type === 'whBuy') { toast(t('tWh', rgF(r.r))); fx.sfx('claim'); }
  else if (type === 'whUp') { toast(t('tWhUp', { x: t('whUp_' + r.k), n: r.lvl })); fx.sfx('claim'); }
  else if (type === 'venueSet') { toast(t('vnSaved')); fx.sfx('claim'); }
  else if (type === 'venueBuy') { toast(r.lvl === 1 ? t('vnOpened_' + r.kind) : t('vnUpped', { n: r.lvl })); fx.sfx('claim'); }
  else if (type === 'house') { toast(t('houseMoved', { x: list('houses')[me.house], n: r.respect })); fx.sfx('claim'); }
  else if (type === 'refill') { toast(t('rfDone', { e: r.energy, m: money(r.price) })); fx.sfx('refill'); }
  else if (type === 'dealBuy') { toast(t('dealBought', { g: num(r.grams), x: list('drugs')[r.d], m: money(r.price) })); fx.sfx('buy'); }
  else if (type === 'deal') { toast(t('dealSold', { g: r.grams, m: money(r.money), n: r.respect }) + (r.lav ? ' · ' + t('ro_lav', { m: money(r.lav) }) : '')); fx.sfx('cash'); }
  else if (type === 'workDone') { fx.vibrate(r.busted ? [40, 60, 40] : 14); fx.sfx(r.busted ? 'bust' : 'cash'); }
  else if (type === 'shift') { toast(t('jbDone', { m: money(r.money), n: r.left })); fx.sfx('cash'); }
  else if (type === 'course') { toast(t('crStarted', { x: t('cr_' + r.id), m: money(r.price) })); fx.sfx('buy'); }
  else if (type === 'job') { toast(t('jbChosen', { x: t('jb_' + r.job) })); fx.sfx('claim'); }
  else if (type === 'buy') { toast(r.id === 'balas' ? t('tBullets', { n: num(r.n), m: money(r.price) }) : r.slot === 'mat' ? t('to_matBuy', { x: t('g_' + r.id).toLowerCase(), m: money(r.price) }) : t('tUsing', { x: t('g_' + r.id) }) + (r.swapped ? ' ' + t('tSwapped', { x: t('g_' + r.swapped) }) : '')); fx.sfx('buy'); }
  else if (type === 'equip') { toast(t('tUsing', { x: t('g_' + r.id) }) + (r.swapped ? ' ' + t('tSwapped', { x: t('g_' + r.swapped) }) : '')); fx.sfx('claim'); }
  else if (type === 'sell') { toast(t('tSold', { x: itName(r.id), m: money(r.money) }) + (r.lav ? ' · ' + t('ro_lav', { m: money(r.lav) }) : '')); fx.sfx('cash'); }
  else if (type === 'sellGoods') { toast(t('tSoldAll', { n: r.n, m: money(r.money) }) + (r.lav ? ' · ' + t('ro_lav', { m: money(r.lav) }) : '')); fx.sfx('cash'); }
  // golpes grandes e avença
  else if (type === 'opStart') { toast(t('to_opStart', { x: t('op_' + S.cfg.ops[r.i].id), t: dayTxt(S.cfg.ops[r.i].prepH) })); fx.sfx('buy'); }
  else if (type === 'opStep') { toast(t('to_' + r.kind, { r: r.rasto, p: pct(r.chanceBp) })); fx.sfx('buy'); }
  else if (type === 'opDrop') { toast(t('to_drop', { m: money(r.lost) }), true); fx.sfx('fail'); }
  else if (type === 'opGo') {
    S.opK = r.i;
    const bad = r.busted || r.linked;
    fx.vibrate(bad ? [40, 60, 40] : r.success ? 12 : 30); fx.sfx(bad ? 'bust' : r.success ? 'crit' : 'fail');
    bigResult({ r, at: now(), lv, av: !!before && retained(before), bribe: !!S.opBribe });
  }
  else if (type === 'retainer') { toast(r.on ? t('to_av', { m: money(S.cfg.retainer.day) }) : t('to_avOff')); fx.sfx('claim'); }
  // prisão
  else if (type === 'jailSmuggle') { if (r.lost) { toast(t('tj_smugLost'), true); fx.sfx('fail'); } else { toast(t('tj_smug', { m: money(r.money) })); fx.sfx('cash'); } }
  else if (type === 'jailWork') { toast(t('tj_work', { m: money(r.money) })); fx.sfx('cash'); }
  else if (type === 'jailYard') { toast(t(r.win ? 'tj_yardW' : 'tj_yardL', { m: money(Math.abs(r.money)), n: r.value }), !r.win); fx.sfx(r.win ? 'cash' : 'fail'); }
  else if (type === 'jailCards') { toast(t(r.win ? 'tj_cardsW' : 'tj_cardsL', { m: money(Math.abs(r.money)) }), !r.win); fx.sfx(r.win ? 'cash' : 'fail'); }
  else if (type === 'jailFavor') { toast(r.kind === 'time' ? t('tj_favTime', { t: minTxt(r.cut) }) : t('tj_favContact', { n: r.contacts, c: S.cfg.jail.contactsMax })); fx.sfx('claim'); }
  else if (type === 'jailEscape') { if (r.free) { toast(t('tj_free')); fx.sfx('crit'); } else { toast(t('tj_caught', { t: minTxt(r.add) }), true); fx.sfx('bust'); fx.vibrate([40, 60, 40]); } }
  else if (type === 'repair') { toast(t('tRepaired', { x: t('g_' + me.eq[r.slot].id), m: money(r.price) })); fx.sfx('claim'); }
  else if (type === 'luxury') { toast(t('luxBought', { x: list('lux')[me.luxuries - 1], n: r.respect })); fx.sfx('claim'); }
  else if (type === 'hooker' || type === 'broVisit') { fx.sfx('refill'); if (r.sick) { toast(t('gotSick'), true); fx.vibrate([40, 60, 40]); } if (r.rob) { toast(t('hkRob_' + r.rob.kind, { m: money(r.rob.loss) }), true); fx.vibrate([30, 40, 30]); } }
  else if (type === 'claim') { toast(t('got', { m: money(r.cash) })); fx.sfx('claim'); }
  else if (type === 'portOpen') S.portLast = [...(S.portLast || []), r.item].slice(-3);   // sem avisos: quem mostra o que saiu é a cena do contentor
  else if (type === 'collect') {
    let total = (r.club || 0) + (r.bro || 0), lost = 0;
    for (const it of r.items) { lost += it.lost; if (it.units !== undefined) { total += it.rest; if (it.units > 0) toast(t('portGoodsToast', { n: num(it.units), x: list('drugs')[it.d], ...rgF(it.rg || 'lx') })); } else total += it.money; }
    // (os contentores já não passam por aqui: abrem-se no porto, um a um, com a cena de reveal.js)
    if (total > 0) { toast(t('got', { m: money(total) })); fx.sfx('cash'); }
    if (lost > 0) toast(t('raided', { m: money(lost) }), true);
  } else if (type === 'attack') {
    fx.sfx('hit');
    fx.fight(me.name, out.target.name, r.win, r.win ? (r.mode === 'mug' ? '+' + money(r.money) + ' · +' + r.respect : '+' + r.respect + ' ' + t('respect').toLowerCase()) : '−' + Math.abs(r.respect) + ' ' + t('respect').toLowerCase(), { win: t('youWon'), lose: t('youLost') });
    S.targets = null; loadTargets();
  } else if (type === 'hitman') {
    if (r.success) { toast(t('hmDone', { b: r.target, n: r.respLoss })); fx.sfx('crit'); fx.vibrate([20, 40, 20]); } else { toast(t('hmMissed', { b: r.target }), true); fx.sfx('fail'); }
    S.targets = null; loadTargets();
  } else if (type === 'tableBet') fx.sfx('deal');
  else if (type !== 'train' && type !== 'tableClear') fx.sfx('buy');
  if (type === 'crime' || type === 'crimeAll') requestAnimationFrame(showReport);
  if (lv) { skyline(lv.to); if (type !== 'crime' && type !== 'crimeAll' && type !== 'opGo') toast(t('r_lvl', { n: lv.to, x: titleOf(lv.to) })); }
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
// as duas barras sobem 1 a cada 2 minutos: a stamina (golpes) até ao máximo da casa, a energia (ginásio, lutas) até 100
function bar(v, t0, max, regenMs, n) {
  let x = v, next = null;
  if (x < max) {
    const ticks = Math.max(0, Math.floor((n - t0) / regenMs));
    x = Math.min(max, x + ticks);
    if (x < max) next = t0 + (ticks + 1) * regenMs - n;
  }
  return [x, next];
}
const stamMax = (me) => me.energyMax || S.cfg.energy.max;
const vigMax = () => S.cfg.vigor?.max || 100;
function live(me) {
  const n = now(), A = S.cfg.addiction;
  const [energy, nextE] = bar(me.energy, me.energyT, stamMax(me), S.cfg.energy.regenMs, n);
  const [vigor, nextV] = bar(me.vigor ?? vigMax(), me.vigorT ?? n, vigMax(), (S.cfg.vigor || S.cfg.energy).regenMs, n);
  let vice = me.addiction;
  if (vice > 0) vice = Math.max(0, vice - Math.max(0, Math.floor((n - me.addictionT) / A.decayMs)));
  return { energy, nextE, vigor, nextV, vice, jail: me.jailUntil > n ? me.jailUntil - n : 0, hosp: me.hospUntil > n ? me.hospUntil - n : 0 };
}
// armazém de um negócio: 8 h de rendimento, ou 24 h com contabilista
const bizCapN = (b) => b.perH * (S.cfg.storageMs / 3600000);
const bizCap = (b) => bizCapN(b) * (S.st.me.acct ? S.cfg.accountant.capMult : 1);
function storedNow(b, i) {
  const cap = bizCap(b);
  if (b.stored >= cap) return b.stored;
  const extra = Math.floor(b.perH * Math.max(0, now() - S.stAt) / 3600000);
  return Math.min(cap, b.stored + extra);
}
// o que vais mesmo receber: o guardado menos a parte do contabilista (só do que passa das 8 h)
const bizFeeOf = (b, st) => { if (!S.st.me.acct) return 0; const capN = bizCapN(b); return st > capN ? Math.floor(((st - capN) * S.cfg.accountant.feeBp) / 10000) : 0; };
const bizNet = (b, i) => { const st = storedNow(b, i); return st - bizFeeOf(b, st); };

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
  // dinheiro e respeito por extenso (são a pontuação do jogo: «$2M» e «17K» tiravam-lhes o peso), cada um com o seu ícone desenhado
  // (16/11: os ícones desenhados em 3D, notas e coroa, deram lugar a ícones de traço: o euro já diz que é dinheiro)
  S.hud.cashN = h('span', { class: 'num' });
  S.hud.cash = h('div', { class: 'cash' }, S.hud.cashN);
  S.hud.respN = h('span', { class: 'num' });
  S.hud.resp = h('div', { class: 'resp', title: t('respect') }, icon('crown'), h('span', { class: 'sr' }, t('respect')), S.hud.respN);
  S.hud.ebar = h('i'); S.hud.etxt = h('span');
  S.hud.gbar = h('i'); S.hud.gtxt = h('span');
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
      h('button', { class: 'sbar en', 'aria-label': t('energy') + ' · ' + t('p_club'), on: { click: () => go('club') } }, S.hud.ebar, S.hud.etxt),
      h('button', { class: 'sbar vg', 'aria-label': t('vigor') + ' · ' + t('p_gym'), on: { click: () => go('gym') } }, S.hud.gbar, S.hud.gtxt),
      h('button', { class: 'sbar vi', 'aria-label': t('vice') + ' · ' + t('p_hosp'), on: { click: () => go('hosp') } }, S.hud.vbar, S.hud.vtxt)),
    S.hud.stats, S.hud.fx);
  S.hud.shown = { cash: me.cash, respect: me.respect };
  return hud;
}

const STAT_IC = { F: 'fist', I: 'brain', C: 'chat', T: 'shield' };
const FX_IC = { F: 'fist', I: 'brain', C: 'chat', T: 'shield', loot: 'cash', biz: 'empire', bust: 'lock' };
const AV = (i) => `/img/av/${i}.webp?1`;
const fxText = (f) => t('fx_' + f.k, { p: f.bp / 100 });
// Bónus ativos: uma linha com o essencial (ícone e valor de cada um, e quanto falta para o primeiro acabar); o nome e o tempo de cada um abrem ao toque.
// Antes era uma pílula roxa por bónus: com sete ativos ocupavam três linhas do topo em todos os ecrãs.
function fxRow(list) {
  if (!list.length) return '';
  const first = list.reduce((a, f) => (f.until < a.until ? f : a));
  const open = !!S.fxOpen;
  return h('div', { class: 'fxw' + (open ? ' open' : '') },
    h('button', { class: 'fxsum', 'aria-expanded': String(open), 'aria-label': t('fxSum', { n: list.length }), on: { click: () => { S.fxOpen = !open; updateHud(); } } },
      open ? h('span', { class: 'fxh' }, t('fxOpen', { n: list.length }))
        : h('span', { class: 'fxts' }, list.map((f) => h('span', { class: 'fxt' }, icon(FX_IC[f.k]), (f.k === 'bust' ? '−' : '+') + f.bp / 100 + '%'))),
      h('span', { class: 'fxn' }, open ? null : icon('timer'), open ? null : h('b', { class: 'num', dataset: { left: first.until } }, dur(first.until - now())), icon('chev'))),
    open ? h('ul', { class: 'fxlist' }, list.map((f) => h('li', null, icon(FX_IC[f.k]), h('span', null, fxText(f)), h('b', { class: 'num', dataset: { left: f.until } }, dur(f.until - now()))))) : null);
}
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
  S.hud.title.textContent = titleOf(L);
  S.hud.name.textContent = me.name + (me.cls ? ' · ' + t('cl_' + me.cls) : '');
  const span = me.levelTo ? (me.levelTo - me.levelFrom) : 1;
  const prog = me.levelTo ? Math.min(1, Math.max(0, (me.peakRespect - me.levelFrom) / span)) : 1;
  S.hud.ringFg.setAttribute('stroke-dashoffset', String(S.hud.C * (1 - prog)));
  if (S.hud.av && S.hud.av.dataset.i !== String(me.av)) { S.hud.av.dataset.i = me.av; S.hud.av.src = AV(me.av); }
  S.hud.fx.replaceChildren(me.sick ? h('button', { class: 'chip fxc bad', on: { click: () => go('hosp') } }, icon('skull'), t('sickChip', { p: S.cfg.hookers.sickCutBp / 100 })) : '', fxRow(me.fx)); S.hud.fx.style.display = me.fx.length || me.sick ? '' : 'none';
  S.hud.stats.replaceChildren(...['F', 'I', 'C', 'T'].map((s) => h('span', { title: t('stat' + s) }, icon(STAT_IC[s]), h('b', { class: 'num' }, short(me.stats[s])))),
    h('span', { class: 'nx' }, me.levelTo ? t('toLevel', { n: num(me.levelTo - me.peakRespect), l: L + 1 }) : t('maxLevel')));
  const sh = S.hud.shown;
  S.hud.cash.dataset.len = money(me.cash).length > 13 ? 'xl' : money(me.cash).length > 10 ? 'l' : '';   // 10 ou mais algarismos: a letra encolhe um passo para o nome ao lado não desaparecer
  if (sh.cash !== me.cash) { fx.roll(S.hud.cashN, sh.cash, me.cash, money); delta(S.hud.cash, me.cash - sh.cash, money); sh.cash = me.cash; } else S.hud.cashN.textContent = money(me.cash);
  if (sh.respect !== me.respect) { fx.roll(S.hud.respN, sh.respect, me.respect, num); delta(S.hud.resp, me.respect - sh.respect, num); sh.respect = me.respect; } else S.hud.respN.textContent = num(me.respect);
  tickHud();
}

function tickHud() {
  const me = S.st?.me; if (!me || !S.hud.ebar) return;
  const L = live(me);
  const M = stamMax(me), G = vigMax();
  S.hud.ebar.style.width = (L.energy / M) * 100 + '%';
  S.hud.etxt.replaceChildren(icon('bolt'), ' ' + L.energy + '/' + M, h('small', null, L.nextE ? ' · ' + dur(L.nextE) : ''));
  S.hud.gbar.style.width = (L.vigor / G) * 100 + '%';
  S.hud.gtxt.replaceChildren(icon('fist'), ' ' + L.vigor + '/' + G);
  S.hud.vbar.style.width = (L.vice / me.addictionCap) * 100 + '%';
  S.hud.vtxt.replaceChildren(icon('pill'), ' ' + L.vice + '/' + me.addictionCap);
  tickShips(); tickNews();
  document.querySelectorAll('[data-left]').forEach((el) => { const left = +el.dataset.left - now(); el.textContent = el.dataset.long ? leftTxt(left) : dur(left); if (left <= 0 && el.dataset.re !== '1') { el.dataset.re = '1'; refresh(); } });
  document.querySelectorAll('[data-stored]').forEach((el) => { const i = +el.dataset.stored; const b = me.biz[i]; el.textContent = money(bizNet(b, i)); });
  document.querySelectorAll('[data-biz]').forEach((el) => {
    const i = +el.dataset.biz, b = me.biz[i]; const cap = bizCap(b);
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
    const v = me.biz.reduce((s, b, i) => s + bizNet(b, i), 0) + (me.club?.till || 0) + (me.bro?.till || 0);
    tot.textContent = v > 0 ? t('collect', { m: money(v) }) : t('nothingToCollect');
    tot.disabled = !(v > 0);
  }
}

// ---------- ecrãs ----------
// ---------- navegação: uma cidade com locais ----------
const PLACES = {
  city: { ic: 'skyline' }, empire: { ic: 'empire' }, rob: { ic: 'street', img: 'golpes' }, club: { ic: 'bolt', img: 'discoteca' }, gym: { img: 'ginasio' },
  biz: { ic: 'empire', img: 'negocios' }, stash: { img: 'stash' }, acct: { img: 'contabilista' }, port: { img: 'porto' }, air: { img: 'aeroporto' }, arms: { img: 'armas' }, bank: { img: 'banco' }, hosp: { img: 'hospital' },
  jail: { img: 'prisao' }, gang: { img: 'gangue' }, work: { img: 'profissao' }, news: { img: 'jornal' }, casino: { ic: 'gem', img: 'casino' }, roulette: { img: 'roleta' }, bj: { img: 'blackjack' }, dice: { img: 'dados' }, wheel: { img: 'roda' }, slot: { img: 'slot' }, zeus: { img: 'zeus' }, doce: { img: 'doce' }, rebucado: { img: 'rebucado' }, alley: { img: 'beco' }, lux: { img: 'luxos' }, fights: { ic: 'fights', img: 'lutas' }, rank: { img: 'procurados' }, hitman: { img: 'assassino' }, putas: { img: 'putas' }, gigs: { img: 'biscates' }, casa: {}, myclub: { img: 'discoteca' }, mybro: { img: 'putas' }, bolsa: { img: 'bolsa' }, job: { img: 'emprego' }, inv: { img: 'inventario' }, ops: { img: 'operacoes' },
};
// barra de baixo: só o que se usa a toda a hora. O resto vive dentro de cada separador, arrumado por zonas.
const NAV = ['city', 'rob', 'fights', 'casino', 'empire'];
const HUB = {
  city: [['sec_night', ['club', 'putas', 'casino', 'gang', 'alley', 'arms']], ['sec_street', ['gigs', 'job', 'gym', 'bank', 'hosp', 'jail', 'rank']]],
  empire: [['sec_income', ['biz', 'port', 'air', 'myclub', 'mybro']], ['sec_assets', ['casa', 'inv', 'bank', 'bolsa', 'stash', 'acct']]],
};
const PARENT = { gigs: 'city', gang: 'city', work: 'job', job: 'city', news: 'city', casino: 'city', roulette: 'casino', bj: 'casino', dice: 'casino', wheel: 'casino', slot: 'casino', zeus: 'casino', doce: 'casino', rebucado: 'casino', club: 'city', putas: 'city', gym: 'city', alley: 'city', hosp: 'city', jail: 'city',
  biz: 'empire', port: 'empire', air: 'empire', myclub: 'empire', mybro: 'empire', bolsa: 'empire', inv: 'empire', stash: 'empire', acct: 'empire', casa: 'empire', bank: 'empire', lux: 'empire', arms: 'fights', rank: 'fights', hitman: 'fights', ops: 'rob' };
const upOf = (id) => (S.backTo && S.backTo[id]) || PARENT[id] || 'city';   // um sítio que está em duas zonas volta para a zona de onde vieste
const tabOf = (id) => { let x = id; for (let k = 0; k < 4 && !NAV.includes(x); k++) x = upOf(x); return NAV.includes(x) ? x : 'city'; };
const IMG = (kind, id, big) => `/img/${kind}/${id}${big ? '-g' : ''}.webp?15`;
// o que cada sítio precisa de ir buscar ao servidor (ao entrar nele, e também quando o jogo abre já nesse sítio)
function loadFor(tab) {
  if (tab === 'fights') { if (S.fightSeg === 'events') loadEvents(true); else { S.fightSeg = 'targets'; loadTargets(); } }
  if (tab === 'rank') loadRanking();
  if (tab === 'hitman') loadHitman();
  if (tab === 'gang') loadGang();
  if (tab === 'club' || tab === 'putas') loadVenues();
  if (tab === 'bolsa') { S.stkSel = null; loadStocks(); }
  if (tab === 'stash') S.reg = null;
  if (tab === 'news' || tab === 'city') loadNews();
  if (tab === 'news') loadStocks();   // a página de Economia e a tira da bolsa na primeira página
}
function go(tab) {
  if (!PLACES[tab]) tab = 'city';
  if (HUB[S.tab]?.some(([, ids]) => ids.includes(tab)) || (S.tab === 'fights' && (tab === 'arms' || tab === 'rank' || tab === 'gang'))) S.backTo = { ...(S.backTo || {}), [tab]: S.tab };
  S.tab = tab; document.body.dataset.tab = tab; store.set('tab', tab); S.fxOpen = false;   // a lista dos bónus fecha ao mudar de ecrã, para não ficar a ocupar o topo
  loadFor(tab);
  render(); window.scrollTo({ top: 0 });
  if (SLOT_OF[tab]) requestAnimationFrame(() => slotFit());
  armBack();
}
// ---- gesto/botão de voltar atrás do telemóvel ----
// Enquanto há algo aberto (um sítio dentro da cidade, um jogo, uma folha), fica uma entrada a mais no histórico do browser.
// Voltar atrás gasta essa entrada e nós fechamos o que está aberto; só na cidade, sem nada aberto, é que o gesto sai do site.
// Duas regras para isto nunca sair do jogo sozinho:
// 1) só se acerta o histórico no fim do gesto (fechar uma folha e abrir outra no mesmo instante não mexe em nada);
// 2) quem diz se a entrada a mais existe é o próprio histórico (history.state), não uma variável nossa, e nunca há um
//    history.back() e um pushState ao mesmo tempo: no Chrome chegavam trocados e o gesto seguinte saía do site.
const backOn = () => { try { return !!history.state?.crime; } catch { return false; } };
function armBack() {
  if (S.backTick) return;
  S.backTick = true;
  queueMicrotask(() => { S.backTick = false; syncBack(); });
}
function syncBack() {
  if (S.backWait) return;   // há um history.back() nosso a caminho: quando chegar, volta-se a acertar
  const need = !!S.sheets?.length || (!!S.st?.me && S.tab !== 'city'), on = backOn();
  if (need && !on) { try { history.pushState({ crime: 1 }, ''); } catch { /* sem histórico: fica como estava */ } }
  else if (!need && on) { S.backWait = setTimeout(() => { S.backWait = 0; }, 1500); history.back(); }   // voltaste à cidade pelos botões do jogo: gasta-se a entrada a mais
}
addEventListener('popstate', () => {
  if (S.backWait) { clearTimeout(S.backWait); S.backWait = 0; syncBack(); return; }   // foi o nosso próprio history.back()
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

const SCREENS = { job: screenJob, city: screenCity, empire: screenEmpire, news: screenNews, casino: screenCasino, roulette: screenRoulette, bj: screenBJ, dice: screenDice, wheel: screenWheel, slot: () => screenSlotGame('slot'), zeus: () => screenSlotGame('zeus'), doce: () => screenSlotGame('doce'), rebucado: () => screenSlotGame('rebucado'), rob: screenRob, club: screenClub, gym: screenGym, biz: screenBiz, port: screenPort, arms: screenArms, bank: screenBank,
  hosp: screenHosp, jail: screenJail, gang: screenGang, work: screenWork, air: screenAir, putas: screenPutas, myclub: screenMyClub, mybro: screenMyBro, bolsa: screenBolsa, inv: screenInv, stash: screenStash, acct: screenAcct, casa: screenCasa, alley: screenAlley, lux: screenLux, fights: screenFights, rank: screenRank, hitman: screenHitman, ops: screenOps, gigs: screenGigs };
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
    rob: !!(me.op && me.op.ready <= n && !(me.op.miss || []).length),   // um golpe grande pronto para avançar
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
    // a imagem pequena (quase sempre já guardada, por ter aparecido no azulejo) fica de fundo enquanto a grande não chega
    P.img && !noImg ? h('div', { class: 'pimg', style: `background-image:url(${IMG('cenas', P.img)})` }, h('img', { src: IMG('cenas', P.img, 1), alt: '', width: 1100, height: 1100, decoding: 'async', fetchpriority: 'high',
      on: { load: (e) => e.currentTarget.classList.add('in'), error: (e) => e.currentTarget.remove() } })) : null,
    sub ? h('p', { class: 'psub' }, sub) : null);
}

function busyBanner(me) {
  const L = live(me);
  if (L.jail) return h('div', { class: 'state jail' }, h('h3', null, t('jail')), h('div', { class: 't' }, t('jailSub', { t: '' }), h('b', { class: 'num', dataset: { left: me.jailUntil } }, dur(L.jail))),
    h('div', { class: 'fill big jbar', dataset: { until: me.jailUntil, jtotal: me.jailT0 && me.jailUntil > me.jailT0 ? me.jailUntil - me.jailT0 : (S.cfg.crimes[me.jailTier - 1]?.jailMin || 1) * 60000 } }, h('i')),
    h('button', { class: 'btn buy block', on: { click: (e) => act('bail', {}, { el: e.currentTarget }) } }, t('payBail', { m: money(me.bail) })),
    S.tab !== 'jail' ? h('button', { class: 'jneed jdo', on: { click: () => go('jail') } }, t('jailDo') + ' ›') : null);
  if (L.hosp) return h('div', { class: 'state hosp' }, h('h3', null, t('hospital')), h('div', { class: 't' }, t('hospitalSub', { t: '' }), h('b', { class: 'num', dataset: { left: me.hospUntil } }, dur(L.hosp))),
    h('button', { class: 'btn buy block', on: { click: (e) => act('medic', {}, { el: e.currentTarget }) } }, t('payMedic', { m: money(me.medic) })));
  return null;
}

function art(kind, id, cls = 'art') {
  return h('img', { class: cls, src: IMG(kind, id), alt: '', width: 600, height: 600, loading: 'lazy', decoding: 'async', on: { error: (e) => { e.currentTarget.style.visibility = 'hidden'; } } });
}
// Pinta os valores dentro de uma frase de apoio: dinheiro a verde e respeito a âmbar; o resto fica como está.
// Serve para as linhas cinzentas com números lá dentro se lerem de relance (o que se ganha salta à vista).
function tint(s) {
  const out = [], re = /(€\d+(?:[.,\u00a0\u202f ]\d{3})*(?:[–-]€?\d+(?:[.,\u00a0\u202f ]\d{3})*)?|\d+(?:[.,\u00a0\u202f ]\d{3})*(?:[–-]\d+(?:[.,\u00a0\u202f ]\d{3})*)?\u00a0€)|([+−-]?\d[\d.,]* (?:de )?(?:respeito|respect))/g;
  let i = 0, m;
  while ((m = re.exec(s))) { if (m.index > i) out.push(s.slice(i, m.index)); out.push(h('span', { class: m[1] ? 'c-cash' : 'c-resp' }, m[0])); i = m.index + m[0].length; }
  if (i < s.length) out.push(s.slice(i));
  return out;
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
const NW_IC = { season: 'crown', hitman: 'skull', hitmanFail: 'shield', stockWin: 'cash', stockLoss: 'skull', stockBust: 'skull', air: 'cash', airLost: 'lock', cls: 'user', gangNew: 'fist', gangUp: 'empire', gangHeist: 'cash', gangHeistFail: 'lock', gangHit: 'fist', gangHitFail: 'skull', casino: 'gem', casinoLoss: 'skull', job: 'cash', crit: 'gem', spree: 'bolt', jail: 'lock', house: 'empire', lux: 'crown', beat: 'fist', mug: 'cash', fail: 'skull', sick: 'pill', lvl: 'crown', fight: 'fist', op: 'cash', opJail: 'lock', escape: 'bolt' };
const seedOf = (str) => { let x = 7; for (let i = 0; i < str.length; i++) x = (x * 31 + str.charCodeAt(i)) | 0; return Math.abs(x); };
// a gangue da rua (a do bot) tem nome próprio em cada língua; as dos jogadores ficam como eles as escreveram
const gName = (name) => (name === S.cfg?.gang?.bot?.name ? t('gBotName') : name);
function newsText(e) {
  if (e.gang) e = { ...e, gang: gName(e.gang) };
  const k = e.k === 'fight' ? (e.mode === 'mug' ? 'mug' : 'beat') : e.k, C = list('crimes');
  if (k === 'gangNew') return t('nw_gangNew', { a: e.name, g: e.gang, t: e.tag });
  if (k === 'season') return tv('nw_season', seedOf(e.name + k + e.t), { a: e.name, n: e.n + 1, x: divName(e.d) });
  if (k === 'gangUp') return t('nw_gangUp_' + e.what, { g: e.gang, n: e.n });
  if (k === 'air' || k === 'airLost') return tv('nw_' + k, seedOf(e.name + k + e.t), { a: e.name, x: t('ar_' + e.to), m: money(e.money || 0) });
  if (k === 'stockWin' || k === 'stockLoss' || k === 'stockBust') return tv('nw_' + k, seedOf((e.name || e.c) + k + e.t), { a: e.name, x: t('st_' + e.c), m: money(e.money || 0) });
  if (k === 'venue') return tv('nw_venue' + e.v, seedOf(e.name + k + e.t), { a: e.name });
  if (k === 'raidRecord') return t('nw_raidRecord', { x: e.d >= 0 ? list('drugs')[e.d].toLowerCase() : '', m: money(e.money || 0), ...rgF(e.r) });
  if (k === 'cls') return tv('nw_cls', seedOf(e.name + k + e.t), { a: e.name, x: t('cl_' + e.from), y: t('cl_' + e.to) });
  if (k === 'gangHeist' || k === 'gangHeistFail') return tv('nw_' + k, seedOf(e.gang + k + e.t), { g: e.gang, x: t('gh_' + e.c), n: e.n, m: money(e.money || 0) });
  if (k === 'gangHit' || k === 'gangHitFail') return tv('nw_' + k, seedOf(e.gang + k + e.t), { g: e.gang, b: e.target, n: e.n });
  const x = k === 'op' || k === 'opJail' ? t('op_' + e.o) : k === 'house' ? list('houses')[e.h] : k === 'lux' ? list('lux')[e.i] : k === 'lvl' ? titleOf(e.n) : k.startsWith('casino') ? t('csIn_' + e.g) : C[e.c];
  return tv('nw_' + k, seedOf(e.name + k + e.t), { a: e.name, b: e.target, x, m: money(e.money || 0), n: e.n });
}
const newsIdx = (f) => Math.floor(now() / 5000) % f.length;
// o jornal na cidade: a manchete do dia e a última hora a rodar; abre o jornal inteiro
function newsBar() {
  const f = S.feed || [], top = S.news?.today?.items?.[0];
  const e = f.length ? f[newsIdx(f)] : null;
  // uma tira do próprio jornal: o nome, a manchete do dia e a última hora a rodar. Abre o jornal inteiro.
  return h('button', { class: 'newsc paper', 'aria-label': t('paper'), on: { click: () => go('news') } },
    h('div', { class: 'nhead' }, h('span', { class: 'nlbl' }, t('paper')), h('span', { class: 'nday' }, paperDate()), icon('chev')),
    top ? h('div', { class: 'ntop' }, h('span', { class: 'kick' }, kick(top.k)), h('b', null, hnodes(headline(top, S.news.today.dia)))) : null,
    e ? h('div', { class: 'news', 'data-news': String(newsIdx(f)) }, h('span', { class: 'nago ptime' }, paperTime(e.t)), h('span', { class: 'ntx' }, newsText(e)))
      : h('div', { class: 'pempty' }, t('nwEmpty')));
}
function tickNews() {
  const el = document.querySelector('[data-news]'), f = S.feed || [];
  if (!el || !f.length) return;
  const i = newsIdx(f), e = f[i];
  if (+el.dataset.news === i) return;
  el.dataset.news = String(i);
  el.querySelector('.nago').textContent = paperTime(e.t);
  el.querySelector('.ntx').textContent = newsText(e);
  el.classList.remove('swap'); void el.offsetWidth; el.classList.add('swap');
}
async function loadNews() {
  try { const r = await api('GET', '/api/news'); S.news = r; if (r.feed) S.feed = r.feed; if (S.tab === 'news' || S.tab === 'city') render(); } catch {}
}
// ===== O jornal «A Sirene» =====
// Uma folha de papel dentro do jogo: cabeçalho, manchete em letras grandes e quatro páginas. Escreve-se com o que já existe
// (o título do dia de cada jogador, a última hora e a bolsa). As notícias do governo e das empresas entram com o motor de acontecimentos.
const PG = ['front', 'country', 'street', 'econ', 'live'], PGL = { front: 'pgFront', country: 'pgCountry', street: 'pgStreet', econ: 'pgEcon', live: 'pgLive' };
// ---- as edições do mundo (passo 6): o que cada uma trouxe, por ordem de peso ----
const coName = (id) => t('st_' + id);
const sPct = (bp) => (bp >= 0 ? '+' : '−') + pctOf(Math.abs(bp)) + '%';
function artLine(a) {
  switch (a.k) {
    case 'stAnn': return coName(a.c) + ': ' + t('sto_' + a.s) + '. ' + t('stDue', { d: edHour(a.dueAt) }) + '.';
    case 'stRum': return t('arRum', { x: coName(a.c), y: t('sto_' + a.s), r: pctOf(a.rel) + '%', z: t(a.said ? 'stRumOk' : 'stRumBad') });
    case 'stInv': return t('arInv', { x: coName(a.c), y: t('sto_' + a.s), p: pctOf(a.p) + '%' });
    case 'stOut': return t('arOut', { x: coName(a.c), y: t((a.ok ? 'stoOk_' : 'stoBad_') + a.s), p: sPct(a.pct) });
    case 'stPanic': return t('arPanic', { x: coName(a.c), p: sPct(a.pct) });
    case 'stEuph': return t('arEuph', { x: coName(a.c), p: sPct(a.pct) });
    case 'stBust': return t('arBust', { x: coName(a.c) });
    default: return null;
  }
}
const DESK = ['stBust', 'stOut', 'stPanic', 'stEuph', 'stAnn', 'stInv', 'stRum'];
function deskList(Wm, max) {
  const out = [];
  for (const e of [...(Wm?.arts || [])].reverse()) for (const a of e.a.filter((x) => DESK.includes(x.k)).sort((x, y) => DESK.indexOf(x.k) - DESK.indexOf(y.k))) { out.push([e.at, a]); if (out.length >= max) return out; }
  return out;
}
// hora da edição: só a hora se foi hoje, senão o dia e a hora («15/11 21:00»)
const edTime = (t0) => { const o = { timeZone: 'Europe/Lisbon' }, d = new Date(t0), loc = lang() === 'pt' ? 'pt-PT' : 'en-GB', hm = d.toLocaleTimeString(loc, { ...o, hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString(loc, o) === new Date(now()).toLocaleDateString(loc, o) ? hm : d.toLocaleDateString(loc, { ...o, day: '2-digit', month: '2-digit' }) + '\n' + hm; };   // o dia por cima da hora: cabe na coluna
const deskRow = ([at, a]) => h('li', null, h('span', { class: 'ptime' }, edTime(at)), h('span', null, h('b', null, t('ar_' + a.k) + '. '), artLine(a)));
const lxLine = (a) => t(a.d >= 2 ? 'lxUp' : a.d <= -2 ? 'lxDown' : 'lxSame', { n: a.crime });
const lxBustNow = (Wm) => Math.min(9500, Math.floor((Wm.bustBp * (S.cfg.world.lx.bustLo + S.cfg.world.lx.bustPer * Wm.lx.press)) / 10000));
function paperCountry() {
  const Wm = S.news?.mundo;
  if (!Wm || !S.cfg.world) return [h('p', { class: 'pempty' }, t('loading'))];
  const L = Wm.lx, prev = L.hist.length > 1 ? L.hist[L.hist.length - 2] : null, crimes = L.hist.map((x) => x[1]);
  const fact = (lbl, v, was) => h('div', { class: 'lxf' }, h('span', null, lbl), h('b', { class: 'num' }, String(v), h('i', null, ' ' + t('lxOf'))), was != null && was !== v ? h('small', { class: 'num ' + (v > was ? 'c-red' : 'c-cash') }, (v > was ? '▲ ' : '▼ ') + Math.abs(v - was)) : null);
  const lxArts = [...Wm.arts].reverse().map((e) => [e.at, e.a.find((x) => x.k === 'lx')]).filter(([, a]) => a).slice(0, 6);
  return [h('section', { class: 'psec lxs' }, h('h4', null, t('lxT')),
    h('div', { class: 'lxfs' }, fact(t('lxCrime'), L.crime, prev ? prev[1] : null), fact(t('lxPress'), L.press, prev ? prev[2] : null)),
    crimes.length > 1 ? h('div', { class: 'lxchw' }, h('span', { class: 'small' }, t('lxChartT', { n: crimes.length })), stChart(crimes, 'mini lxch', 320, 44)) : null,
    h('p', null, t('lxBust', { p: L.press, b: pctOf(lxBustNow(Wm)) + '%' })),
    h('p', { class: 'small pnote' }, t('lxHow'))),
    Wm.rg ? rgPaper(Wm) : null, rgEvPaper(Wm, 8),
    lxArts.length ? h('section', { class: 'psec' }, h('h4', null, t('lxEdsT')), h('ul', { class: 'plive' }, lxArts.map(([at, a]) => h('li', null, h('span', { class: 'ptime' }, edTime(at)), h('span', null, lxLine(a)))))) : null];
}
// as outras regiões, como um boletim: criminalidade e pressão de cada uma, e o que mexeu nos mercados
function rgPaper(Wm) {
  const row = (r, g) => { const prev = g.hist && g.hist.length > 1 ? g.hist[g.hist.length - 2] : null;
    return h('tr', null, h('th', { scope: 'row' }, rgName(r)), h('td', { class: 'num' }, String(g.crime), prev && prev[1] !== g.crime ? h('small', { class: g.crime > prev[1] ? 'pdn' : 'pup' }, (g.crime > prev[1] ? ' ▲' : ' ▼') + Math.abs(g.crime - prev[1])) : null),
      h('td', { class: 'num ' + (g.press >= S.cfg.wh.raidMin ? 'pdn' : '') }, String(g.press))); };
  return h('section', { class: 'psec' }, h('h4', null, t('rgT')),
    h('table', { class: 'pmkt prg' }, h('thead', null, h('tr', null, h('th'), h('th', { scope: 'col' }, t('lxCrime')), h('th', { scope: 'col' }, t('lxPress')))),
      h('tbody', null, row('lx', Wm.lx), ...Object.entries(Wm.rg).map(([r, g]) => row(r, g)))),
    h('p', { class: 'small pnote' }, t('rgHow')));
}
// até quando: «às 15:00» se for hoje, senão «terça-feira às 15:00»
const untilTxt = (ts) => { const o = { timeZone: 'Europe/Lisbon' }, loc = lang() === 'pt' ? 'pt-PT' : 'en-GB', d = new Date(ts), hm = hhmm(ts);
  return d.toLocaleDateString(loc, o) === new Date(now()).toLocaleDateString(loc, o) ? t('untilToday', { h: hm }) : t('untilDay', { d: d.toLocaleDateString(loc, { ...o, weekday: lang() === 'pt' ? 'long' : 'short' }), h: hm }); };
const rgEvLine = (a, toAt) => t('rgEvLine', { e: t('ev_' + a.e), x: list('drugs')[a.d].toLowerCase(), p: sPct(a.bp), h: untilTxt(toAt) });
function rgEvPaper(Wm, max) {
  const rows = [...(Wm.arts || [])].reverse().flatMap((e) => e.a.filter((x) => x.k === 'rgEv').map((a) => [e.at, a])).slice(0, max);
  return rows.length ? h('section', { class: 'psec' }, h('h4', null, t('rgEvT')), h('ul', { class: 'plive' }, rows.map(([at, a]) => h('li', null, h('span', { class: 'ptime' }, edTime(at)), h('span', null, rgEvLine(a, a.toAt) + (a.toAt <= now() ? ' ' + t('evOver') : '')))))) : null;
}
const kick = (k) => t('hl_' + k + '_t', { a: '' }).replace(/[:\s]+$/, '');   // «Procurado: {a}» sem o nome: é o antetítulo
const paperDate = () => new Date(now()).toLocaleDateString(lang() === 'pt' ? 'pt-PT' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'Europe/Lisbon' });
const toPage = (pg, alvo) => { S.newsPg = pg; render(); const e = alvo && document.querySelector(alvo); if (e) e.scrollIntoView(); else window.scrollTo({ top: 0 }); };
const more = (pg, lbl) => h('button', { class: 'pmore', on: { click: () => toPage(pg) } }, lbl + ' →');
// a hora a que aconteceu (hora de Lisboa); se não foi hoje, o dia. «2:03» de tempo decorrido lia-se como duas da manhã.
const paperTime = (t0) => { const o = { timeZone: 'Europe/Lisbon' }, d = new Date(t0), loc = lang() === 'pt' ? 'pt-PT' : 'en-GB';
  return d.toLocaleDateString(loc, o) === new Date(now()).toLocaleDateString(loc, o) ? d.toLocaleTimeString(loc, { ...o, hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString(loc, { ...o, day: '2-digit', month: '2-digit' }); };
const liveRow = (e) => h('li', null, h('span', { class: 'ptime' }, paperTime(e.t)), h('span', null, newsText(e)));
// uma notícia: antetítulo a vermelho, título em letras grandes, a fotografia de quem a fez e o texto. kind: lead (manchete), side (chamada) ou row (lista)
// o título diz o facto (três moldes por tipo de notícia), o texto só traz a piada: assim não se repetem um ao outro
const headline = (it, dia) => tv('hl_' + it.k + '_h', seedOf(it.name + it.k + dia + 'h'), { a: it.name, n: num(it.n), m: money(it.m) });
// num título, os milhares separam-se por um espaço estreito feito à mão (a letra dos títulos não tem esse carácter): «$1 250 000» não se pode ler como quatro palavras
const hnodes = (x) => x.split(/(\d+(?:\u00a0\d{3})+)/).map((p, i) => (i % 2 ? h('span', { class: 'pnum' }, p.split('\u00a0').flatMap((g, j) => (j ? [h('span', { class: 'pgap' }), g] : [g]))) : p));
function story(it, dia, kind) {
  const foto = S.avOk && (kind === 'lead' || kind === 'row');
  return h('article', { class: 'st st-' + kind },
    h('div', { class: 'kick' }, kick(it.k)),
    h(kind === 'lead' ? 'h2' : 'h3', null, hnodes(headline(it, dia))),
    h('div', { class: 'stb' }, foto ? h('img', { class: 'pphoto', src: AV(it.av || 0), alt: '', width: 192, height: 192, loading: 'lazy' }) : null,
      h('div', null, h('p', null, tv('hl_' + it.k, seedOf(it.name + it.k + dia), { a: it.name, n: num(it.n), m: money(it.m) })),
        foto ? h('div', { class: 'by' }, t('paperBy', { c: it.cls ? t('cl_' + it.cls) : '', l: it.level, r: num(it.respect) }).replace(/^, /, '')) : null)));
}
function paperFront(N) {
  const hoje = N.today.items.length > 0, day = hoje ? N.today : N.yesterday, its = day.items, out = [];
  // sem notícia não há «última hora»
  const calmEd = N.mundo && N.mundo.arts.length && (deskList({ arts: N.mundo.arts.slice(-1) }, 1).length || N.mundo.arts[N.mundo.arts.length - 1].a.some((x) => x.k === 'rgEv'));
  if (!its.length && !calmEd) out.push(h('article', { class: 'st st-lead' }, h('h2', null, t('paperCalmH')), h('div', { class: 'stb' }, h('p', null, t('paperCalm')))));
  else if (its.length) {
    if (!hoje) out.push(h('p', { class: 'pnote' }, t('paperYest')));
    out.push(story(its[0], day.dia, 'lead'));
    if (its.length > 1) out.push(h('div', { class: 'st2' + (its.length === 2 ? ' one' : '') }, its.slice(1, 3).map((it) => story(it, day.dia, 'side'))));
    if (its.length > 3) out.push(h('button', { class: 'pmore', on: { click: () => { S.newsSeg = hoje ? 'today' : 'yesterday'; toPage('street', '.pbriefs'); } } }, t('paperMore', { n: its.length - 3 }) + ' →'));
  }
  const Wm = N.mundo, last = Wm && Wm.arts.length ? Wm.arts[Wm.arts.length - 1] : null;
  if (last) {
    const lx = last.a.find((x) => x.k === 'lx'), top = deskList({ arts: [last] }, 2);
    out.push(h('section', { class: 'psec' }, h('h4', null, t('edAtH', { h: new Date(last.at).toLocaleTimeString(lang() === 'pt' ? 'pt-PT' : 'en-GB', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit' }) })),
      h('ul', { class: 'plive' }, ...top.map(deskRow), ...last.a.filter((x) => x.k === 'rgEv').map((a) => h('li', null, h('span', { class: 'ptime' }, edTime(last.at)), h('span', null, h('b', null, t('rgEvT') + '. '), rgEvLine(a, a.toAt)))),
        lx ? h('li', null, h('span', { class: 'ptime' }, edTime(last.at)), h('span', null, h('b', null, t('lxShort') + '. '), lxLine(lx) + '. ' + t('lxBust', { p: lx.press, b: pctOf(lxBustNow(Wm)) + '%' }))) : null),
      Wm.rg ? h('div', { class: 'pquo prgq', 'aria-label': t('lxPress') }, [['lx', Wm.lx], ...Object.entries(Wm.rg)].map(([r, g]) => h('span', { class: g.press >= S.cfg.wh.raidMin ? 'pdn' : '' }, h('b', null, rgName(r)), t('rgPress').toLowerCase() + ' ' + g.press))) : null,
      more('country', t('pgCountry'))));
  }
  const M = S.stocks;
  if (M && M.prices.length) out.push(h('section', { class: 'psec' }, h('h4', null, t('ecTitle')),
    h('div', { class: 'pquo' }, S.cfg.stocks.list.map((c, k) => h('span', { class: M.prices[k] > M.hist[k][0] ? 'pup' : M.prices[k] < M.hist[k][0] ? 'pdn' : '' }, h('b', null, list('stCodes')[k]), stPct(M.prices[k], M.hist[k][0])))),
    more('econ', t('pgEcon'))));
  const f = (S.feed || []).slice(0, 3);
  if (f.length) out.push(h('section', { class: 'psec' }, h('h4', null, t('nwLive')), h('ul', { class: 'plive' }, f.map(liveRow)), more('live', t('paperAll'))));
  return out;
}
function paperStreet(N) {
  const seg = S.newsSeg === 'yesterday' ? 'yesterday' : 'today', day = N[seg];
  return [h('div', { class: 'pseg', role: 'group' }, [['today', t('nwToday')], ['yesterday', t('nwYesterday')]].map(([id, lbl]) =>
    h('button', { 'aria-pressed': seg === id ? 'true' : 'false', on: { click: () => { S.newsSeg = id; render(); } } }, lbl))),
    day.items.length ? h('div', { class: 'stl' }, day.items.slice(0, 3).map((it) => story(it, day.dia, 'row'))) : h('p', { class: 'pempty' }, seg === 'today' ? t('hlNoneToday') : t('hlNoneYesterday')),
    day.items.length > 3 ? h('div', { class: 'pbriefs' }, day.items.slice(3).map((it) => story(it, day.dia, 'brief'))) : null];
}
function paperEcon() {
  const M = S.stocks, C = S.cfg.stocks;
  if (!M || !M.prices.length) return [h('p', { class: 'pempty' }, t('loading'))];
  const rows = C.list.map((c, k) => ({ c, k, pr: M.prices[k], h0: M.hist[k][0], pct: M.hist[k][0] ? (M.prices[k] - M.hist[k][0]) / M.hist[k][0] : 0 }));
  const top = rows.reduce((a, b) => (Math.abs(b.pct) > Math.abs(a.pct) ? b : a));
  const desk = (S.feed || []).filter((e) => e.k === 'stockWin' || e.k === 'stockLoss' || e.k === 'stockBust');
  return [
    Math.abs(top.pct) >= 0.03 ? h('article', { class: 'st st-lead' }, h('div', { class: 'kick' }, t(top.pct > 0 ? 'ecKup' : 'ecKdn')), h('h2', null, t(top.pct > 0 ? 'ecUp' : 'ecDown', { x: t('st_' + top.c.id), p: stPct(top.pr, top.h0).slice(1) })),
      h('div', { class: 'stb' }, h('p', null, t('ecLede', { p: stMoney(top.pr), q: stMoney(top.h0) })))) : null,
    h('section', { class: 'psec' }, h('h4', null, t('ecTitle')),
      h('table', { class: 'pmkt' }, h('tbody', null, rows.map((r) => h('tr', { class: r.pct >= 0 ? 'pup' : 'pdn' },
        h('th', { scope: 'row' }, t('st_' + r.c.id), h('small', null, list('stCodes')[r.k])), h('td', { class: 'pch' }, stChart(M.hist[r.k], 'mini', 96, 34)),
        h('td', { class: 'num pv' }, stMoney(r.pr)), h('td', { class: 'num pp' }, stPct(r.pr, r.h0))))))),
    h('section', { class: 'psec' }, h('h4', null, t('edDesk')), deskList(S.news?.mundo, 12).length ? h('ul', { class: 'plive' }, deskList(S.news.mundo, 12).map(deskRow)) : h('p', { class: 'pempty' }, t('edNone'))),
    desk.length ? h('section', { class: 'psec' }, h('h4', null, t('ecDesk')), h('ul', { class: 'plive' }, desk.map(liveRow))) : null,
    h('button', { class: 'pbtn', on: { click: () => go('bolsa') } }, t('ecGo'))];
}
function screenNews() {
  const N = S.news, pg = PG.includes(S.newsPg) ? S.newsPg : 'front', ep = season(), D = S.cfg.season?.days || 28;
  const dia = ep ? Math.min(D, Math.max(1, Math.floor((now() - ep.start) / 864e5) + 1)) : 1;
  const f = S.feed || [];
  const body = !N ? [h('p', { class: 'pempty' }, t('loading'))] : pg === 'front' ? paperFront(N) : pg === 'country' ? paperCountry() : pg === 'street' ? paperStreet(N) : pg === 'econ' ? paperEcon()
    : [f.length ? h('ul', { class: 'plive first' }, f.map(liveRow)) : h('p', { class: 'pempty' }, t('nwEmpty'))];
  return [h('div', { class: 'phead' }, h('div', { class: 'pbar pj' }, h('button', { class: 'back', 'aria-label': t('p_' + upOf('news')), on: { click: () => go(upOf('news')) } }, h('span', { 'aria-hidden': 'true' }, '←')), h('h1', { class: 'sr' }, t('paper')))),
    h('div', { class: 'paper' },
      h('header', { class: 'pmast' },
        h('div', { class: 'mline' }, h('span', null, paperDate()), h('span', null, ep ? t('paperDay', { n: ep.n + 1, d: dia, t: D }) : '')),
        h('div', { class: 'mname' }, t('paper')),
        h('div', { class: 'mtag' }, t('paperTag'))),
      h('nav', { class: 'ppg', 'aria-label': t('paper') }, PG.map((id) => h('button', { 'aria-pressed': pg === id ? 'true' : 'false', on: { click: () => toPage(id) } }, t(PGL[id])))),
      h('div', { class: 'pbody' }, body))];
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
  const ep = season();
  return [h('h1', { class: 'sr' }, t('p_city')), newsBar(), ...hubTiles('city', badge),
    ep ? h('p', { class: 'small muted', style: 'text-align:center;margin-top:16px' }, t('seasonEnds', { n: ep.n + 1, t: nb(leftTxt(ep.end - n)) })) : null].filter(Boolean);
}
function placeTile(id, badge) {
  const me = S.st.me;
  return h('button', { class: 'tile', on: { click: () => go(id) } },
    h('img', { src: id === 'casa' ? IMG('casa', S.cfg.house.tiers[me.house].id) : IMG('cenas', PLACES[id].img), alt: '', width: 600, height: 600, loading: 'lazy', decoding: 'async', on: { error: (e) => e.currentTarget.remove() } }),
    h('span', { class: 'lbl' + (id === 'rank' && S.st.rank ? ' up' : '') }, t('p_' + id)), badge ? h('span', { class: 'bdg' }, badge) : null,
    // no ranking, a tua posição na época vai por baixo do nome, em texto (não é coisa para recolher)
    id === 'rank' && S.st.rank ? h('span', { class: 'tsub' }, t('rankBadge', { p: ordOf(S.st.rank) })) : null);
}
function hubTiles(hub, badge) {
  return HUB[hub].flatMap(([sec, ids]) => [h('h2', { class: 'sec' }, t(sec)), h('div', { class: 'tiles' }, ids.map((id) => placeTile(id, badge[id])))]);
}
// o império: o que rende enquanto não estás, num só sítio
function screenEmpire() {
  const me = S.st.me, n = now();
  const tills = (me.club?.till || 0) + (me.bro?.till || 0);
  const total = me.biz.reduce((s, b, i) => s + bizNet(b, i), 0) + tills, perH = me.biz.reduce((s, b) => s + b.perH, 0) + (me.bro?.perH || 0);
  const portReady = me.port.filter((c) => c.readyAt <= n).length;
  const badge = {
    biz: total > 0 ? t('toCollect') : null,
    port: portReady ? t('ready') : me.port.length ? dur(Math.min(...me.port.map((c) => c.readyAt)) - n) : null,
    casa: me.housePrice != null && me.cash + me.bank >= me.housePrice ? t('canUpgrade') : null,
    bolsa: me.stk?.some((h) => h.n > 0) ? moneyShort(me.stk.reduce((x, h) => x + h.value, 0)) : null,
    myclub: me.club?.till > 0 ? t('toCollect') : me.club && !me.stock.some((x) => x > 0) ? t('vnEmpty') : null,
    mybro: me.bro?.till > 0 ? t('toCollect') : null,
    stash: me.mv?.length ? t('rgTransit') : whTotal(me) > 0 ? money(whTotal(me)) : null,
    inv: invFull(me) ? t('invFullB') : me.inv.some((x) => isGood(x.id)) ? moneyShort(me.inv.reduce((s, x) => s + (isGood(x.id) ? x.v : 0), 0)) : null,
    acct: me.acct ? null : me.level >= S.cfg.accountant.minLevel && me.cash + me.bank >= S.cfg.accountant.price ? t('acHire') : null,
  };
  const head = me.biz.some((b) => b.n > 0) || me.port.length || me.club || me.bro
    ? h('div', { class: 'card stack empsum' },
      h('div', { class: 'row sp' }, h('span', { class: 'muted' }, t('empIncome')), h('b', { class: 'num c-cash' }, money(perH) + t('perHour'))),
      h('button', { class: 'btn buy get block big', dataset: { total: 1 }, disabled: total <= 0, on: { click: (e) => act('collect', { port: false }, { el: e.currentTarget }) } },
        total > 0 ? t('collect', { m: money(total) }) : t('nothingToCollect')),
      // contentores chegados: abrem-se no porto. Se não há mais nada para receber, é este o botão principal.
      portReady ? h('button', { class: 'btn block ctgo' + (total > 0 ? '' : ' buy'), on: { click: () => go('port') } }, portReady === 1 ? t('ctGo1') : t('ctGo', { n: portReady })) : null)
    : h('div', { class: 'tip' }, h('p', null, t('empNone')));
  return [h('div', { class: 'phead' }, h('div', { class: 'pbar top' }, h('h1', null, t('p_empire')))), head, ...hubTiles('empire', badge)];
}

// ---------- biscates: trabalho à mão (16/11) ----------
// Uma tarefa de cada vez. Enquanto decorre, nada redesenha o ecrã (como numa jogada do casino), para não partir o arrastar.
const gramsTxt = (mg) => (lang() === 'pt' ? (mg / 1000).toFixed(2).replace('.', ',') : (mg / 1000).toFixed(2)) + ' g';
const gigCtx = () => ({ t, sfx: fx.sfx, vibrate: fx.vibrate, streets: list('streets'), grams: gramsTxt, risk: pct((S.cfg.work.list.find((x) => x.bustBp) || {}).bustBp || 0) });
async function gigStart(id, el) {
  if (S.gig && !S.gig.res) return;
  const out = await act('workStart', { id }, { el });
  if (out) openGig(out.result.task);
}
function openGig(task) {
  const g = TK.mount(task, gigCtx());
  if (!g) return;
  const G = S.gig = { task, g, res: null, ans: null, closing: false };
  S.casinoBusy = true; render(true); window.scrollTo({ top: 0 });
  g.finished.then(async (ans) => {
    G.ans = ans;
    // o servidor só paga depois do tempo mínimo da tarefa: o fecho cobre essa espera
    const left = task.t0 + task.minMs + 300 - now();
    if (left > 0) { G.closing = true; render(true); await TK.wait(left); }
    const out = await act('workDone', { ans });
    S.casinoBusy = false;
    if (S.gig !== G) return;
    if (out) G.res = out.result; else S.gig = null;
    render(true);
    if (out && !out.result.busted) { const b = document.querySelector('.tk-res > b.big'), c = document.querySelector('.hud .money .cash'); if (b && c) fx.bills(b.getBoundingClientRect(), c, 5); }
  });
}
function gigLine(G) {
  const L = G.task.layout, a = G.ans || {};
  if (G.task.id === 'camiao') {
    const heavy = L.boxes.map((b, i) => [b.kg, i]).sort((x, y) => y[0] - x[0] || x[1] - y[1]).slice(0, 3).map((x) => x[1]);
    const ok = (a.slots || []).filter((sl, i) => (sl < 3) === heavy.includes(i)).length;
    return t('tkQ_camiao', { n: ok }) + (a.drops ? ' · ' + t(a.drops === 1 ? 'tkQ_drop1' : 'tkQ_drops', { n: a.drops }) : '');
  }
  if (G.task.id === 'entregas') {
    let x = 0, y = 0, n = 0; for (const i of a.order || []) { const st = L.stops[i]; n += Math.abs(st.x - x) + Math.abs(st.y - y); x = st.x; y = st.y; }
    return t('tkQ_route', { a: n, b: TK.bestLen(L) });
  }
  const G2 = L.gauge, hits = (a.taps || []).filter((ms) => { const ph = (ms % G2.periodMs) / G2.periodMs, x = ph < 0.5 ? 2 * ph : 2 - 2 * ph; return Math.abs(x * 10000 - G2.c) <= G2.w; }).length;
  const good = (a.holds || []).filter((ms) => Math.abs((L.rate * ms) / 1000 - L.target) / L.target <= 0.05).length;
  return t('tkQ_lab', { h: hits, b: good, n: (a.holds || []).length });
}
function gigResult(G) {
  const r = G.res, me = S.st.me, again = h('button', { class: 'btn buy block big', on: { click: (e) => { const id = G.task.id; S.gig = null; gigStart(id, e.currentTarget); } } }, t('tkAgain'));
  const other = h('button', { class: 'btn ghost block', on: { click: () => { S.gig = null; render(true); } } }, t('tkOther'));
  if (r.busted) return h('div', { class: 'card tk-res bust' }, h('h3', null, t('tkBust')), h('p', null, t('tkBustSub')), other);
  const nxt = me.work ? me.work.multBp : 10000;
  return h('div', { class: 'card tk-res' },
    h('span', { class: 'small muted' }, t('tkPaid')), h('b', { class: 'num c-cash big' }, '+' + money(r.money)),
    h('p', { class: 'tk-q' }, t('tkQual', { p: pct(r.q) })), h('p', { class: 'small' }, gigLine(G)),
    G.task.id === 'laboratorio' ? h('p', { class: 'small muted' }, t('tkSafe')) : null,
    r.lav ? h('p', { class: 'small muted' }, t('ro_lav', { m: money(r.lav) })) : null,
    nxt < 10000 ? h('p', { class: 'small muted' }, t('tkNext', { p: Math.round(nxt / 100) })) : null,
    again, other);
}
function screenGigs() {
  const me = S.st.me, W = S.cfg.work, wv = me.work || { multBp: 10000 }, G = S.gig;
  const out = [pageHead('gigs', G ? null : t('gigsSub'), !!G)];
  if (G && !G.res) {
    out.push(h('div', { class: 'tk-wrap' + (G.closing ? ' closing' : '') }, G.g.el, G.closing ? h('p', { class: 'tk-closing' }, t('tkClosing')) : null));
    return out;
  }
  const b = busyBanner(me); if (b) out.push(b);
  if (G && G.res) out.push(gigResult(G));
  // uma tarefa a meio (o jogo foi fechado ou recarregado): continua de onde estava
  if (!G && wv.tk && W.list.some((x) => x.id === wv.tk.id)) {
    const x = W.list.find((y) => y.id === wv.tk.id);
    out.push(h('div', { class: 'tip' }, h('p', null, t('tkHalf', { x: t('gk_' + x.id) })), h('button', { class: 'btn buy sm', on: { click: () => openGig({ id: x.id, t0: wv.tk.t0, minMs: x.minMs, layout: wv.tk.layout }) } }, t('tkResume'))));
  }
  if (wv.multBp < 10000 && !(G && G.res)) out.push(h('p', { class: 'small muted tk-tired' }, t('gTired', { p: Math.round(wv.multBp / 100) })));
  out.push(h('div', { class: 'card vlist vc tk-list' }, W.list.map((x) => {
    const lo = Math.floor((x.base * W.qMin * wv.multBp) / 1e8), hi = Math.floor((x.base * W.qMax * wv.multBp) / 1e8), locked = me.level < x.level;
    return h('button', { class: 'vrow tk-gig', disabled: !!b || locked, on: { click: (e) => gigStart(x.id, e.currentTarget) } },
      art('gigs', x.id, 'vth'),
      h('div', { class: 'grow' }, h('b', null, t('gk_' + x.id)), h('div', { class: 'small muted' }, t('gd_' + x.id)),
        h('div', { class: 'small' }, h('span', { class: 'num c-cash' }, t('gPay', { a: money(lo), b: money(hi) })), h('span', { class: 'muted' }, ' · ' + t('gDur', { s: Math.round(x.minMs / 1000) + 8 })), x.bustBp ? h('span', { class: 'c-red' }, ' · ' + t('tkIllegal', { p: pct(x.bustBp) })) : null)),
      icon('chev'));
  })));
  return out;
}

// sem stamina: discoteca ou putas, com a que sai mais barata por ponto de stamina em destaque
function staminaHelp(me, L) {
  const room = stamMax(me) - L.energy, cash = me.cash + me.bank;
  const d = me.refill && me.refill.energy > 0 && me.refill.cost <= cash ? me.refill.cost / me.refill.energy : Infinity;
  let hk = Infinity;
  if (!me.sick) S.cfg.hookers.list.forEach((g, i) => { const e = Math.min(g.e, room); if (e > 0 && me.hookers[i] <= cash) hk = Math.min(hk, me.hookers[i] / e); });
  const best = d === Infinity && hk === Infinity ? null : hk < d ? 'putas' : 'club';
  const btn = (id, lbl) => h('button', { class: 'btn sm grow ' + (best === id || (!best && id === 'club') ? 'buy' : 'ghost'), on: { click: () => go(id) } }, lbl);
  return h('div', { class: 'stam' }, h('span', { class: 'small' }, t('noStamina')),
    h('div', { class: 'row' }, btn('club', t('goClub')), btn('putas', t('goPutas'))),
    h('button', { class: 'btn ghost sm block', on: { click: () => go('gigs') } }, t('goGigs')),
    best ? h('span', { class: 'small muted' }, t('stamBest', { x: t(best === 'putas' ? 'goPutas' : 'goClub').toLowerCase(), m: stMoney(Math.ceil(Math.min(d, hk) * 100)) })) : null);
}
// ---------- golpes ----------
// o que se leva em média num golpe que corre bem (a tabela do sorteio), com o bónus da mestria e o calor da rua de agora
// skill de uma família (bp a mais no que se leva), igual à do motor
const skBp = (me, fam) => { const K = S.cfg.skills, n = (me.sk && me.sk[fam]) || 0; return Math.floor((K.maxBp * Math.min(n, K.fullPts)) / K.fullPts); };
const pctOf = (bp) => (bp % 100 ? (bp / 100).toFixed(1).replace('.', lang() === 'pt' ? ',' : '.') : String(bp / 100));
const moneyRange = (a, z) => (lang() === 'pt' ? num(a) + '–' + num(z) + '\u00a0€' : '€' + num(a) + '–' + num(z));
const crimeEv = (c) => c.prizes.reduce((x, [bp, a, z]) => x + (bp * (a + z)) / 2, 0) / 10000;
const heatPct = (bp) => Math.round(bp / 100);
// ---------- equipamento e inventário ----------
const gearOf = (id) => S.cfg.gear.find((g) => g.id === id);
const isGood = (id) => S.cfg.loot.goods.includes(id);
const itName = (id) => (isGood(id) ? t('it_' + id) : t('g_' + id));
const itArt = (id, cls) => art(isGood(id) ? 'items' : 'gear', id, cls);
const invN = (me, id) => { const s = me.inv.find((x) => x.id === id); return s ? s.n : 0; };
const invFull = (me) => me.invUsed >= me.invCap;
// a arma dos golpes: a de mão se ainda dispara, senão a principal (igual ao motor)
const gunSlot = (me) => { const m = me.eq.mao, q = me.eq.principal; return m && m.u > 0 ? 'mao' : q && q.u > 0 ? 'principal' : m ? 'mao' : q ? 'principal' : null; };
function gunState(me) { const s = gunSlot(me); return !s ? 'none' : !(me.eq[s].u > 0) ? 'broken' : invN(me, 'balas') < S.cfg.bullets.perJob ? 'ammo' : 'ok'; }
const gunOk = (me) => gunState(me) === 'ok';
// caixas de balas que chegam para os golpes que a stamina dá agora (pelo menos uma, no máximo dez)
const boxesFor = (me, L, c) => { const B = S.cfg.bullets, jobs = Math.max(1, Math.min(S.cfg.crimeAllMax || 10, Math.floor(L.energy / c.e))); return Math.min(10, Math.max(1, Math.ceil((jobs * B.perJob - invN(me, 'balas')) / B.box))); };
// sem arma, arma gasta ou sem balas: o botão do golpe dá lugar ao que resolve, logo ali
function gunFix(me, L, c, gs) {
  const cash = me.cash + me.bank;
  if (gs === 'none') return h('button', { class: 'btn buy block big', on: { click: () => { S.armsSeg = 'fight'; go('arms'); } } }, t('goArms'));
  if (gs === 'broken') {
    const s = gunSlot(me), m = me.repair[s];
    return [h('p', { class: 'jgun c-red' }, t('gunWornLine', { x: t('g_' + me.eq[s].id) })),
      h('button', { class: 'btn buy block big', disabled: cash < m, on: { click: (e) => act('repair', { slot: s }, { el: e.currentTarget }) } }, t('fixGun', { m: money(m) }))];
  }
  const n = boxesFor(me, L, c), m = n * S.cfg.bullets.price, room = invN(me, 'balas') > 0 || !invFull(me);
  if (!room) return [h('p', { class: 'jgun c-red' }, t('noAmmoFull')), h('button', { class: 'btn buy block big', on: { click: () => go('inv') } }, t('toInv'))];
  return [h('p', { class: 'jgun c-red' }, t('noAmmoLine')),
    h('button', { class: 'btn buy block big', disabled: cash < m, on: { click: (e) => act('buy', { id: 'balas', n }, { el: e.currentTarget }) } }, t('buyAmmo', { n: num(n * S.cfg.bullets.box), m: money(m) }))];
}
// a linha da arma por baixo do cartão: o que cada tentativa gasta e o que ainda tens
function gunLine(me) {
  const B = S.cfg.bullets, s = gunSlot(me);
  if (!s) return t('jobNeedGun', { b: B.perJob });
  const it = me.eq[s];
  return t('jobGun', { b: B.perJob, x: t('g_' + it.id).toLowerCase(), n: num(invN(me, 'balas')), u: it.u });
}
// respeito de um golpe que corre bem: uma barra vale 20 + 2 por nível (até 120), vezes o calor, a dividir pela hipótese
function crimeResp(me, c, heatBp) {
  const St = S.cfg.street, perBar = Math.min(St.respCap, St.respBase + St.respPerLevel * me.level);
  return Math.max(1, Math.round(((perBar * c.e) / 100) * (heatBp / 10000) / (c.p / 10000)));
}
// no fim do relatório, quando entrou alguma coisa no inventário (ou não coube), o caminho para lá
const invLink = (on) => (on ? h('button', { class: 'jneed rinv', on: { click: () => go('inv') } }, t(invFull(S.st.me) ? 'toInvFull' : 'toInv') + ' ›') : null);
function reportAll(rep, li) {
  const { r, c, k, lv } = rep, lines = [li('', t(r.n === 1 ? 'ra_jobs1' : 'ra_jobs', { n: r.n }) + ' · ' + t(r.wins === 1 ? 'ra_ok1' : 'ra_ok', { w: r.wins }))];
  if (r.money) lines.push(li('c-cash', t('r_stole', { m: money(r.money) })));
  if (r.lav) lines.push(li('', t('ro_lav', { m: money(r.lav) })));
  // o que é objeto foi para o inventário (vale ao recetador); sem espaço, vendeu-se logo por metade
  const gn = r.goodsN || 0, gv = Object.values(r.goods || {}).reduce((x, v) => x + v, 0);
  if (gn > 0) lines.push(li('c-cash', t(gn === 1 ? 'ra_goods1' : 'ra_goods', { n: gn, m: money(gv) })));
  if (r.rushed) lines.push(li('', t(r.rushed === 1 ? 'ra_rushed1' : 'ra_rushed', { n: r.rushed })));
  if (r.bestItem && r.wins > 1) lines.push(li('', t('ra_best', { x: t('lt_' + r.bestItem), m: money(r.best) })));
  if (r.respect) lines.push(li('c-resp', t('r_resp', { n: r.respect })));
  lines.push(li('', t('ra_spent', { e: r.n * c.e }) + (r.ammo ? ' · ' + t('ra_ammo', { n: num(r.ammo) }) : '')));
  if (r.heatEnd < 10000) lines.push(li('', t('r_heat', { p: heatPct(r.heatEnd) })));
  if (r.busted) lines.push(li('c-red', t('r_jail', { t: dur(Math.max(0, r.jailUntil - rep.at)) })));
  if (lv) lines.push(li('c-resp', t('r_lvl', { n: lv.to, x: titleOf(lv.to) })));
  const head = r.busted ? t('ra_bust', { i: r.n }) : r.wins === r.n ? t('ra_clean') : r.wins ? t('ra_done') : t('ra_none');
  return h('div', { class: 'report ' + (r.busted ? 'bust' : r.wins ? 'ok' : 'miss'), role: 'status' }, h('b', null, head), h('ul', null, lines), invLink(gn > 0 || r.rushed));
}
function reportCard(rep) {
  const { r, c, k, lv } = rep;
  const li = (cls, txt) => h('li', { class: cls }, txt), lines = [];
  if (r.all) return reportAll(rep, li);
  if (r.success) {
    lines.push(li('c-cash', t(r.good ? 'r_good' : 'r_item', { x: r.good ? itName(r.good) : t('lt_' + r.item), m: money(r.good ? r.value : r.money) })));
    if (r.rushed) lines.push(li('', t('r_rushed', { m: money(r.value) })));
    if (r.lav) lines.push(li('', t('ro_lav', { m: money(r.lav) })));
    lines.push(li('c-resp', t('r_resp', { n: r.respect })));
    if (r.heatBp < 10000) lines.push(li('', t('r_heat', { p: heatPct(r.heatBp) })));
  } else { lines.push(li('', t('r_lost', { e: c.e }))); if (r.busted) lines.push(li('c-red', t('r_jail', { t: dur(Math.max(0, r.jailUntil - rep.at)) }))); }
  if (r.ammo) lines.push(li('', t('r_ammo', { n: r.ammo })));
  if (lv) lines.push(li('c-resp', t('r_lvl', { n: lv.to, x: titleOf(lv.to) })));
  return h('div', { class: 'report ' + (r.success ? 'ok' : r.busted ? 'bust' : 'miss'), role: 'status' },
    h('b', null, r.success ? t('r_ok') : r.busted ? t('r_bust') : t('r_miss')), h('ul', null, lines), invLink(r.good || r.rushed));
}
function screenRob() {
  const me = S.st.me, C = S.cfg.crimes, L = live(me), names = list('crimes'), st = me.street || { used: 0, heatBp: 10000 };
  const out = [pageHead('rob', null, true)];
  const b = busyBanner(me); if (b) out.push(b);
  const open = C.map((c, i) => i).filter((i) => me.crimes[i].unlocked);
  let k = S.robK ?? store.get('robK', -1);
  if (!open.includes(k)) { k = open[0]; for (const i of open) if (!C[i].gun || gunOk(me)) k = i; }   // o melhor que já dá para fazer
  S.robK = k;
  const c = C[k], bonus = 1 + skBp(me, c.fam) / 10000, heat = st.heatBp;
  const gs = c.gun ? gunState(me) : 'ok', media = Math.round(crimeEv(c) * bonus * (heat / 10000)), noGun = gs !== 'ok';
  const rep = S.report && S.report.k === k ? S.report : null;
  // O que decide o golpe fica em grande e só isso: quanto rende em média se correr bem (verde) e a hipótese (cor do risco).
  // Por baixo, o sorteio do que pode vir; o custo, o risco e o respeito vão em frases curtas, sem cor nem ícones.
  const sorteio = h('table', { class: 'loot' }, h('tbody', null, c.prizes.map(([bp, a, z, item]) => h('tr', null,
    h('th', { scope: 'row' }, t('lt_' + item)), h('td', { class: 'num' }, pct(bp)), h('td', { class: 'num' }, moneyRange(Math.round(a * bonus), Math.round(z * bonus)))))));
  out.push(h('div', { class: 'jobp' },
    h('div', { class: 'jimg' }, h('img', { src: IMG('crimes', c.id, 1), alt: '', width: 1100, height: 1100, decoding: 'async', on: { error: (e) => e.currentTarget.remove() } }), h('h2', null, names[k])),
    h('div', { class: 'jdeal' },
      h('div', null, h('span', null, t('lootAvg')), h('b', { class: 'num c-cash' }, money(media))),
      h('div', null, h('span', null, t('chance')), h('b', { class: 'num ' + chanceCls(c.p) }, pct(c.p)))),
    heat < 10000 ? h('p', { class: 'jheat' }, t('jobHeat', { p: heatPct(heat), h: dur(Math.ceil(((st.used - 199) * 60) / (st.coolPerH || 50)) * 60000) })) : null,
    (st.respBp ?? 10000) < 10000 ? h('p', { class: 'jheat' }, t('jobRespDay', { p: heatPct(st.respBp) })) : null,
    h('p', { class: 'jrisk' }, me.bustBp ? t('jobRiskP', { b: pctOf(me.bustBp) + '%', p: me.lx ? me.lx.press : 50, m: money(c.fine), t: c.jailMin }) : t('jobRisk', { m: money(c.fine), t: c.jailMin })),
    noGun ? gunFix(me, L, c, gs)
      : h('button', { class: 'btn rob block big', disabled: !!b || L.energy < c.e, on: { click: (e) => act('crime', { k }, { el: e.currentTarget }) } }, t('robBtn')),
    !b && !noGun && Math.floor(L.energy / c.e) >= 2 ? h('button', { class: 'btn block robAll', on: { click: (e) => act('crimeAll', { k }, { el: e.currentTarget }) } },
      t('robAll', { n: Math.min(Math.floor(L.energy / c.e), S.cfg.crimeAllMax || 10) })) : null,
    rep ? reportCard(rep) : null,
    !b && !noGun && L.energy < c.e ? staminaHelp(me, L) : null,
    h('h3', { class: 'lootH' }, t('lootWhat')), sorteio,
    h('p', { class: 'jcost' }, t('jobCost', { e: c.e, r: crimeResp(me, c, st.respBp ?? heat) })),
    c.gun ? h('p', { class: 'jcost' }, gunLine(me)) : null,
    h('p', { class: 'jcost' }, t('skLine', { x: t('sk_' + c.fam), p: pctOf(skBp(me, c.fam)), n: Math.floor((me.sk[c.fam] || 0) / 100) }))));
  out.push(h('h2', { class: 'sec' }, t('allJobs')));
  const rows = h('div', { class: 'rows' });
  let lockedShown = false;
  C.forEach((x, i) => {
    if (!me.crimes[i].unlocked) {
      if (lockedShown) return; lockedShown = true;
      rows.append(h('div', { class: 'rowi lock' }, art('crimes', x.id), h('div', { class: 'mid' }, h('div', { class: 'nm' }, names[i]), h('div', { class: 'meta' }, icon('lock'), ' ', t('opensAt', { n: x.level }))),
        h('div', { class: 'pct' }, pct(x.p))));
      return;
    }
    rows.append(h('button', { class: 'rowi' + (i === k ? ' sel' : ''), 'aria-pressed': i === k ? 'true' : 'false',
      on: { click: () => { S.robK = i; store.set('robK', i); S.report = null; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); } } },
      art('crimes', x.id),
      h('div', { class: 'mid' }, h('div', { class: 'nm' }, names[i]),
        h('div', { class: 'meta' }, h('span', { class: 'c-cash' }, t('avgShort', { m: money(Math.round(crimeEv(x) * (1 + skBp(me, x.fam) / 10000) * (heat / 10000))) })), h('span', null, icon('bolt'), ' ' + x.e), x.gun ? h('span', null, t('withGun')) : null)),
      h('div', { class: 'pct ' + chanceCls(x.p) }, pct(x.p))));
  });
  out.push(rows);
  out.push(h('h2', { class: 'sec' }, t('p_ops')), opsRow(me));
  out.push(...dealBlock(me, L, b), ...skillsBlock(me));
  return out;
}
const capFirst = (x) => x.charAt(0).toUpperCase() + x.slice(1);
// skills por família: as que têm golpes de rua ou golpes grandes (a burla e a condução só têm golpes grandes)
function skillsBlock(me) {
  const K = S.cfg.skills, O = S.cfg.ops || [], fams = K.fams.filter((f) => f === 'trafico' || S.cfg.crimes.some((c) => c.fam === f) || O.some((o) => o.fam === f));
  return [h('h2', { class: 'sec' }, t('skTitle')), h('p', { class: 'small muted', style: 'margin:-4px 2px 10px' }, t('skSub')),
    h('div', { class: 'card vlist vc skl' }, fams.map((f) => {
      const n = (me.sk && me.sk[f]) || 0, bars = Math.floor(n / 100), bp = skBp(me, f);
      return h('div', { class: 'vrow skr' }, h('div', { class: 'grow' },
        h('div', { class: 'row sp' }, h('b', null, capFirst(t('sk_' + f))), h('span', { class: 'num ' + (bp ? 'c-cash' : 'muted') }, '+' + pctOf(bp) + '%')),
        h('div', { class: 'fill' }, h('i', { style: `width:${Math.min(100, (n / K.fullPts) * 100)}%` })),
        h('div', { class: 'small muted num' }, t('skBars', { n: bars }) + ' · ' + (f === 'trafico' ? [t('dealTitle')] : []).concat(S.cfg.crimes.map((c, k) => (c.fam === f ? list('crimes')[k] : null)), O.map((o) => (o.fam === f ? t('op_' + o.id) : null))).filter(Boolean).join(', '))));
    }))];
}
// venda de droga na rua: compra-se ao quilo, vende-se ao grama com stamina, até onde a clientela compra hoje
function dealBlock(me, L, b) {
  const D = S.cfg.deal, dl = me.deal || { dst: D.list.map(() => 0), used: 0, cap: 0 }, left = Math.max(0, dl.cap - dl.used);
  const out = [h('h2', { class: 'sec' }, t('dealTitle')), h('p', { class: 'small muted', style: 'margin:-4px 2px 10px' }, t('dealSub', { c: dl.cap, l: left }))];
  out.push(h('div', { class: 'card vlist vc' }, D.list.map((x, j) => {
    const d = S.cfg.drugs.findIndex((g) => g.id === x.drug), g = S.cfg.drugs[d], grams = Math.floor((x.perBar * D.step) / 100), have = dl.dst[j] || 0;
    const lock = me.level < x.level, sale = Math.floor((grams * g.price * (10000 + skBp(me, 'trafico'))) / 10000);
    return h('div', { class: 'vrow deal' + (lock ? ' dim' : '') }, art('drugs', g.id, 'vth'),
      h('div', { class: 'grow' }, h('b', null, list('drugs')[d]),
        h('div', { class: 'small muted num' }, lock ? t('opensAt', { n: x.level }) : t('dealHave', { g: num(have), m: money(g.price) }))),
      lock ? null : h('div', { class: 'dealb' },
        h('button', { class: 'btn ghost sm num', disabled: !!b || me.cash + me.bank < x.kg, on: { click: (e) => act('dealBuy', { j, kg: 1 }, { el: e.currentTarget }) } }, t('dealBuy', { m: money(x.kg) })),
        h('button', { class: 'btn buy sm num', disabled: !!b || have < grams || L.energy < D.step || !left, on: { click: (e) => act('deal', { j }, { el: e.currentTarget }) } }, t('dealSell', { g: grams, m: money(sale) }))));
  })));
  out.push(h('p', { class: 'small muted', style: 'margin:8px 2px 0' }, t('dealNote', { e: D.step })));
  return out;
}

// ---------- golpes grandes ----------
// Preparam-se durante horas ou dias: cada passo custa dinheiro e mexe na hipótese ou no rasto, e o material compra-se pelo caminho.
// Quando a preparação acaba, avança-se. O ecrã mostra o que decide (a parte e a hipótese) e, em frases, o que acontece se correr mal.
const dayTxt = (hh) => (hh % 24 ? hh + ' h' : hh === 24 ? t('nDay') : t('nDays', { n: hh / 24 }));
const minTxt = (ms) => { const m = Math.round(ms / 60000), hh = Math.floor(m / 60), mm = m % 60; return nb(hh ? (mm ? t('hoursMins', { h: hh, m: mm }) : hh + ' h') : t('nMins', { n: mm })); };
const andList = (xs) => (xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + (lang() === 'pt' ? ' e ' : ' and ') + xs[xs.length - 1]);
const retained = (me) => !!me.avenca && me.level >= S.cfg.retainer.level;
const opJailMs = (me, o) => (o.jailMin * 60000 * (retained(me) ? 10000 - S.cfg.retainer.jailCutBp : 10000)) / 10000;
function opRisk(me, o, rasto, bribed) {
  const St = S.cfg.opSteps;
  if (bribed) return [h('p', { class: 'jcost' }, t('opBribed'))];
  return [h('p', { class: 'jrisk' }, t(retained(me) ? 'opFailAv' : 'opFail', { b: pctOf(rasto * St.caughtPer), t: minTxt(opJailMs(me, o)), m: money(o.lawyer) })),
    h('p', { class: 'jcost' }, t('opTrail', { r: rasto }) + ' ' + t('opOk', { l: pctOf(rasto * St.linkedPer) }))];
}
const opHead = (o, i) => h('div', { class: 'jimg' }, h('img', { src: IMG('ops', o.id, 1), alt: '', width: 1100, height: 1100, decoding: 'async', on: { error: (e) => e.currentTarget.remove() } }), h('h2', null, t('op_' + o.id)));
const opDeal = (o, bp) => h('div', { class: 'jdeal' },
  h('div', null, h('span', null, t('opPart')), h('b', { class: 'num c-cash' }, money(o.gain))),
  h('div', null, h('span', null, t('chance')), h('b', { class: 'num ' + chanceCls(bp) }, pct(bp))));
// a entrada no ecrã dos golpes: em que pé está o golpe grande (o nome é o do golpe; o título da secção já diz «Golpes grandes»)
function opsRow(me) {
  const O = S.cfg.ops, n = now();
  if (me.level < O[0].level) return h('div', { class: 'rowi lock' }, art('cenas', 'operacoes'), h('div', { class: 'mid' }, h('div', { class: 'nm' }, t('op_' + O[0].id)), h('div', { class: 'meta' }, icon('lock'), ' ', t('opensAt', { n: O[0].level }))), null);
  const st = me.op;
  let nm, meta;
  if (st) {
    nm = t('op_' + O[st.i].id);
    const miss = st.miss || [];
    meta = st.ready <= n ? h('span', { class: miss.length ? 'c-red' : 'c-cash' }, miss.length ? t('opsRowMiss', { x: andList(missNames(me, miss)) }) : t('opsRowReady'))
      : h('span', null, t('opsRowPrep', { t: '' }), h('b', { class: 'num', dataset: { left: st.ready, long: 1 } }, leftTxt(st.ready - n)));
  } else if (me.opPause > n) { nm = t('opsRowPauseT'); meta = h('span', null, t('opsRowPause', { t: '' }), h('b', { class: 'num', dataset: { left: me.opPause, long: 1 } }, leftTxt(me.opPause - n))); }
  else { nm = t('opsRowNoneT'); meta = h('span', null, t('opsRowNone')); }
  return h('button', { class: 'rowi opsr', on: { click: () => go('ops') } }, st ? art('ops', O[st.i].id) : art('cenas', 'operacoes'),
    h('div', { class: 'mid' }, h('div', { class: 'nm' }, nm), h('div', { class: 'meta' }, meta)), h('span', { class: 'chev', 'aria-hidden': 'true' }, '›'));
}
// o que falta para avançar, por nome, e como se resolve de uma vez (material, balas e reparar a arma). Sem arma nenhuma não há
// atalho: escolhe-se no armeiro.
const missNames = (me, miss) => miss.map((m) => nb(m === 'gun' ? t('opGun').toLowerCase() : m === 'gunWorn' ? t('opGunFix') : t('g_' + m).toLowerCase()));
function missFix(me, miss) {
  const St = S.cfg.opSteps, B = S.cfg.bullets, steps = [];
  let cost = 0, slots = 0;
  for (const m of miss) {
    if (m === 'gun') return null;
    if (m === 'gunWorn') { const sl = gunSlot(me); cost += me.repair[sl]; steps.push(['repair', { slot: sl }]); }
    else if (m === 'balas') { const have = invN(me, 'balas'), n = Math.max(1, Math.ceil((St.bullets - have) / B.box)); cost += n * B.price; steps.push(['buy', { id: 'balas', n }]); if (!have) slots += 1; }
    else { cost += gearOf(m).price; steps.push(['buy', { id: m }]); slots += 1; }
  }
  return { cost, steps, room: me.invCap - me.invUsed >= slots };
}
// o resultado de um golpe grande abre por cima do ecrã: é o fim de dias de preparação
function bigResult(rep) {
  const close = sheet(h('div', { class: 'stack opres' }, opReport(rep), h('button', { class: 'btn ghost block', on: { click: () => close() } }, t('close'))));
}
function opReport(rep) {
  const { r } = rep, o = S.cfg.ops[r.i], li = (cls, txt) => h('li', { class: cls }, txt), lines = [];
  const jailed = r.linked || r.busted, left = jailed ? dur(Math.max(0, r.jailUntil - rep.at)) : '';
  if (r.success) {
    lines.push(li('c-cash', t('ro_money', { m: money(r.money) })));
    if (r.lav) lines.push(li('', t('ro_lav', { m: money(r.lav) })));
    lines.push(li('c-resp', t('r_resp', { n: num(r.respect) })));
    if (r.linked) lines.push(li('c-red', t('ro_linked', { t: left })));
  } else {
    lines.push(li('', t('ro_lost', { m: money(r.lost) })));
    if (r.lawyer) lines.push(li('c-red', t('ro_lawyer', { m: money(r.lawyer) })));
    else if (!r.busted && rep.av) lines.push(li('', t('ro_lawyerAv')));
    else if (rep.bribe) lines.push(li('', t('ro_bribe')));
    if (r.busted) lines.push(li('c-red', t('ro_jail', { t: left })));
  }
  if (o.pauseH) lines.push(li('', t('ro_pause', { t: dayTxt(o.pauseH) })));
  if (rep.lv) lines.push(li('c-resp', t('r_lvl', { n: rep.lv.to, x: titleOf(rep.lv.to) })));
  const cls = jailed ? 'bust' : r.success ? 'ok' : 'miss';
  return h('div', { class: 'report ' + cls, role: 'status' }, h('b', null, t(jailed ? 'ro_bust' : r.success ? 'ro_ok' : 'ro_miss')), h('ul', null, lines));
}
// sem golpe em preparação: o escolhido em cima, com o botão de preparar
function opPick(me, b) {
  const O = S.cfg.ops, St = S.cfg.opSteps, n = now(), cash = me.cash + me.bank, open = O.map((o, i) => i).filter((i) => me.level >= O[i].level);
  let k = S.opK ?? store.get('opK', -1);
  if (!open.includes(k)) k = open.length ? open[open.length - 1] : 0;
  S.opK = k;
  const o = O[k], pv = me.opsPrev[k], lock = me.level < o.level, pause = me.opPause > n;
  const mats = o.mat.map((id) => nb(t('g_' + id).toLowerCase()));
  const need = [t('opCostLine', { m: money(o.cost), t: dayTxt(o.prepH) }), mats.length ? t('opMatLine', { x: andList(mats) }) : '', o.gun ? t('opGunLine', { b: St.bullets }) : '', !mats.length && !o.gun ? t('opNoMat') : ''].filter(Boolean).join(' ');
  let btn;
  if (lock) btn = h('button', { class: 'btn rob block big', disabled: true }, t('opLockBtn', { n: o.level }));
  else if (pause) btn = h('button', { class: 'btn rob block big', disabled: true }, t('opPauseBtn', { t: '' }), h('span', { class: 'num', dataset: { left: me.opPause, long: 1 } }, leftTxt(me.opPause - n)));
  else if (cash < o.cost) btn = h('button', { class: 'btn rob block big', disabled: true }, t('needMoney', { m: money(o.cost - cash) }));
  else btn = h('button', { class: 'btn rob block big', on: { click: (e) => act('opStart', { i: k }, { el: e.currentTarget }) } }, t('opStartBtn', { m: money(o.cost) }));
  return h('div', { class: 'jobp opp' }, opHead(o, k), opDeal(o, pv.chanceBp), ...opRisk(me, o, pv.rasto, false),
    me.contacts && !lock ? h('p', { class: 'jcost' }, t('opContacts', { n: me.contacts, r: St.contact })) : null,
    btn, h('p', { class: 'jcost' }, need));
}
// o golpe em preparação: os passos, o material e, quando está pronto, avançar
function opActive(me, b) {
  const st = me.op, o = S.cfg.ops[st.i], St = S.cfg.opSteps, B = S.cfg.bullets, n = now(), cash = me.cash + me.bank, ready = st.ready <= n, miss = st.miss || [];
  const done = h('span', { class: 'small c-cash' }, t('stDone'));
  const step = (kind, fx) => {
    const price = st.cost[kind]; if (!price) return null;
    return h('div', { class: 'vrow jbr' }, h('div', { class: 'grow' }, h('b', null, t('st_' + kind)), h('div', { class: 'small' + (st[kind] ? ' muted' : '') }, fx)),
      st[kind] ? done.cloneNode(true) : h('button', { class: 'btn sm ghost num', 'aria-label': t('st_' + kind) + ' · ' + money(price), disabled: cash < price, on: { click: (e) => act('opStep', { kind }, { el: e.currentTarget }) } }, t('payBtn') + ' · ' + money(price)));
  };
  const steps = [step('recon', t('stfx_recon', { n: St.recon })), step('crew', t('stfx_crew', { p: pctOf(St.crew) })), step('bribe', t('stfx_bribe')),
    st.contact ? h('div', { class: 'vrow jbr' }, h('div', { class: 'grow' }, h('b', null, t('st_contact')), h('div', { class: 'small muted' }, t('stfx_recon', { n: St.contact }))), done.cloneNode(true)) : null].filter(Boolean);
  // material: o que já tens fica marcado; o que falta compra-se aqui
  const gear = o.mat.map((id) => {
    const g = gearOf(id), have = me.inv.some((x) => x.id === id);
    return h('div', { class: 'vrow jbr' }, art('gear', id, 'vth'), h('div', { class: 'grow' }, h('b', null, t('g_' + id)), g.once ? h('div', { class: 'small muted' }, t('matOnce')) : null),
      have ? h('span', { class: 'small c-cash' }, t('matHave'))
        : h('button', { class: 'btn sm ghost num', 'aria-label': t('buyAria', { x: t('g_' + id), m: money(g.price) }), disabled: cash < g.price || invFull(me), on: { click: (e) => act('buy', { id }, { el: e.currentTarget }) } }, t('buy') + ' · ' + money(g.price)));
  });
  if (o.gun) {
    const s = gunSlot(me), it = s ? me.eq[s] : null, nb = invN(me, 'balas'), boxes = Math.max(1, Math.ceil((St.bullets - nb) / B.box)), room = nb > 0 || !invFull(me);
    gear.push(h('div', { class: 'vrow jbr' }, art('gear', it ? it.id : 'pistola', 'vth'),
      h('div', { class: 'grow' }, h('b', null, t('opGun')), h('div', { class: 'small' + (it && it.u > 0 ? ' muted' : ' c-red') }, !it ? t('opGunNone') : it.u > 0 ? t('g_' + it.id) + ' · ' + t('usesLeft', { u: it.u, l: gearOf(it.id).life }) : t('opGunWorn', { x: t('g_' + it.id).toLowerCase() }))),
      !it ? h('button', { class: 'btn sm ghost', on: { click: () => { S.armsSeg = 'fight'; go('arms'); } } }, t('p_arms'))
        : !(it.u > 0) ? h('button', { class: 'btn sm ghost num', disabled: cash < me.repair[s], on: { click: (e) => act('repair', { slot: s }, { el: e.currentTarget }) } }, t('repairBtn') + ' · ' + money(me.repair[s]))
          : h('span', { class: 'small c-cash' }, t('matHave'))));
    gear.push(h('div', { class: 'vrow jbr' }, art('gear', 'balas', 'vth'),
      h('div', { class: 'grow' }, h('b', null, t('opBul')), h('div', { class: 'small num' + (nb < St.bullets ? ' c-red' : ' muted') }, t('opBulLine', { b: St.bullets, n: num(nb) }))),
      nb >= St.bullets ? h('span', { class: 'small c-cash' }, t('matHave'))
        : h('button', { class: 'btn sm ghost num', disabled: !room || cash < boxes * B.price, on: { click: (e) => act('buy', { id: 'balas', n: boxes }, { el: e.currentTarget }) } }, t('boxBtn', { n: num(boxes * B.box), m: money(boxes * B.price) }))));
  }
  // o que mais baixa o rasto neste golpe, e o que já tens
  const lw = [], hv = (x, n, on) => x + ' (−' + n + (on ? ', ' + t('lw_have') : '') + ')';
  lw.push(hv(t('lw_gloves'), St.gloves, me.eq.maos && me.eq.maos.id === 'luvas'));
  const skN = Math.floor(skBp(me, o.fam) / St.skillDiv), skMax = Math.floor(S.cfg.skills.maxBp / St.skillDiv);
  lw.push(t('lw_skill', { x: t('sk_' + o.fam) }) + ' (' + t('lw_of', { n: '−' + skN, m: '−' + skMax }) + ')');
  if (o.alarm) lw.push(hv(t('lw_alarm'), St.alarm, (me.done || []).includes(St.alarmCourse)));
  if (o.drive) lw.push(hv(t('lw_drive'), St.drive, (me.done || []).includes(St.driveCourse)));
  const fix = miss.length ? missFix(me, miss) : null, left = h('span', { class: 'num', dataset: { left: st.ready, long: 1 } }, leftTxt(st.ready - n));
  let goBtn;
  if (miss.includes('gun')) goBtn = h('button', { class: 'btn rob block big', on: { click: () => { S.armsSeg = 'fight'; go('arms'); } } }, t('goArms'));
  else if (fix && !fix.room) goBtn = h('button', { class: 'btn rob block big', on: { click: () => go('inv') } }, t('toInvFull'));
  else if (fix) goBtn = h('button', { class: 'btn rob block big fixb', disabled: cash < fix.cost, on: { click: async (e) => { const el = e.currentTarget; for (const [type, args] of fix.steps) if (!(await act(type, args, { el }))) break; } } }, t('opFixBtn', { m: money(fix.cost) }));
  else if (!ready) goBtn = h('button', { class: 'btn rob block big', disabled: true }, t('opWaitBtn', { t: '' }), left);
  else goBtn = h('button', { class: 'btn rob block big', disabled: !!b, on: { click: (e) => { S.opBribe = st.bribe; act('opGo', {}, { el: e.currentTarget }); } } }, t('opGoBtn'));
  // por cima do botão: o que falta (a vermelho quando já só falta isso) e, se o botão é o de comprar, quanto falta para estar pronto
  const above = [miss.length ? h('p', { class: 'jgun ' + (ready ? 'c-red' : 'muted') }, t('opMissing', { x: andList(missNames(me, miss)) }) + (fix && !fix.room ? ' ' + t('noRoom') : '')) : null,
    miss.length && !ready ? h('p', { class: 'jcost' }, t('opPrepIn') + ' ', left.cloneNode(true)) : null];
  return h('div', { class: 'jobp opp' }, opHead(o, st.i), opDeal(o, st.chanceBp), ...opRisk(me, o, st.rasto, st.bribe),
    ...above, goBtn,
    h('h3', { class: 'lootH' }, t('opPrepH')), h('div', { class: 'vlist jbl opl' }, steps),
    gear.length ? h('h3', { class: 'lootH' }, t('opMatH')) : null, gear.length ? h('div', { class: 'vlist jbl opl' }, gear) : null,
    h('p', { class: 'jcost' }, t('opLowers', { x: lw.join('; ') })),
    sureBtn('btn ghost dng block opdrop', t('opDrop'), 'btn ghost dng block opdrop sure', t('opDropSure', { m: money(st.paid) }), () => act('opDrop')));
}
function screenOps() {
  const me = S.st.me, O = S.cfg.ops, n = now();
  const out = [pageHead('ops', t('s_ops'), true)];
  const b = busyBanner(me); if (b) out.push(b);
  out.push(me.op ? opActive(me, b) : opPick(me, b));
  out.push(h('h2', { class: 'sec' }, t('allOps')));
  const rows = h('div', { class: 'rows' });
  let lockedShown = false;
  O.forEach((o, i) => {
    const pv = me.opsPrev[i];
    if (me.level < o.level) {
      if (lockedShown) return; lockedShown = true;
      rows.append(h('div', { class: 'rowi lock' }, art('ops', o.id), h('div', { class: 'mid' }, h('div', { class: 'nm' }, t('op_' + o.id)), h('div', { class: 'meta' }, icon('lock'), ' ', t('opensAt', { n: o.level }))), h('div', { class: 'pct' }, pct(o.p))));
      return;
    }
    const sel = me.op ? me.op.i === i : i === S.opK, bp = me.op && me.op.i === i ? me.op.chanceBp : pv.chanceBp;   // o que está a preparar mostra a hipótese com os passos pagos
    const inner = [art('ops', o.id), h('div', { class: 'mid' }, h('div', { class: 'nm' }, t('op_' + o.id)),
      h('div', { class: 'meta' }, h('span', { class: 'c-cash' }, t('opsMeta', { m: money(o.gain) })), h('span', null, icon('timer'), ' ' + dayTxt(o.prepH)))),
      h('div', { class: 'pct ' + chanceCls(bp) }, pct(bp))];
    rows.append(me.op ? h('div', { class: 'rowi' + (sel ? ' sel' : '') }, ...inner)
      : h('button', { class: 'rowi' + (sel ? ' sel' : ''), 'aria-pressed': sel ? 'true' : 'false', on: { click: () => { S.opK = i; store.set('opK', i); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); } } }, ...inner));
  });
  out.push(rows);
  // advogado em avença
  const R = S.cfg.retainer, cash = me.cash + me.bank;
  out.push(h('h2', { class: 'sec' }, t('avT')), h('div', { class: 'card vlist vc jbl' }, h('div', { class: 'vrow jbr' },
    h('div', { class: 'grow' }, h('div', { class: 'small' }, t('avSub', { m: money(R.day) })), me.avenca ? h('div', { class: 'small c-cash' }, t('avOn')) : null),
    me.level < R.level ? h('span', { class: 'small muted' }, t('avLock', { n: R.level }))
      : me.avenca ? sureBtn('btn sm ghost', t('avOff'), 'btn sm ghost dng', t('avOffSure'), () => act('retainer', { on: false }))
        : h('button', { class: 'btn sm ghost', disabled: cash < R.day, on: { click: (e) => act('retainer', { on: true }, { el: e.currentTarget }) } }, t('avBtn')))));
  // lavagem
  const Lv = S.cfg.launder;
  if (Lv) {
    const over = (me.ilegal || 0) >= Lv.freeUpTo;
    out.push(h('h2', { class: 'sec' }, t('lavT')), h('p', { class: 'small muted lavp' }, t('lavSub', { f: money(Lv.freeUpTo), p: pctOf(Lv.bp), q: pctOf(Lv.courseBp) }) + ' ' +
      (over ? t('lavOver', { f: money(Lv.freeUpTo), p: pctOf((me.done || []).includes(Lv.course) ? Lv.courseBp : Lv.bp) }) : t('lavNow', { m: money(me.ilegal || 0) }))));
  }
  return out;
}
// ---------- prisão ----------
// A pena troca o que se pode fazer, não pára o jogo: a stamina e a energia continuam a encher, e lá dentro ganha-se cerca de metade do que cá fora.
function screenJail() {
  const me = S.st.me, L = live(me), out = [pageHead('jail')], b = busyBanner(me);
  if (!L.jail) { out.push(b || h('div', { class: 'note' }, h('p', { class: 'muted' }, t('notJailed')), h('button', { class: 'btn ghost', on: { click: () => go('rob') } }, t('backToWork')))); return out; }
  out.push(b);
  const J = S.cfg.jail, cash = me.cash, smug = Math.floor((me.streetBar * J.smuggleE) / 200), bet = me.yardBet, favLeft = Math.max(0, J.favors - (me.jf || 0));
  const btn = (lbl, off, type, args) => h('button', { class: 'btn sm ghost', disabled: off, on: { click: (e) => act(type, args || {}, { el: e.currentTarget }) } }, lbl);
  const row = (id, desc, right, wide) => h('div', { class: 'vrow jbr' + (wide ? ' blr' : '') }, art('jail', id, 'vth'), h('div', { class: 'grow' }, h('b', null, t('j_' + id)), h('div', { class: 'small' }, desc)), right);
  out.push(h('h2', { class: 'sec' }, t('jailInT')), h('div', { class: 'card vlist vc jbl jaill' },
    row('contrabando', tint(t('jd_contrabando', { e: J.smuggleE, m: money(smug), p: pctOf(J.smuggleLoseBp) })), btn(t('jbSmuggle'), L.energy < J.smuggleE, 'jailSmuggle')),
    row('oficina', tint(t('jd_oficina', { e: J.workE, m: money(J.work) })), btn(t('jbWork'), L.vigor < J.workE, 'jailWork')),
    row('patio', t('jd_patio', { e: J.yardE, m: money(bet) }), btn(t('jbYard'), L.vigor < J.yardE || cash < bet, 'jailYard')),
    row('cartas', t('jd_cartas', { m: money(J.cardsMax) }), h('div', { class: 'boxb' }, [10, 25, J.cardsMax].map((v) => h('button', { class: 'btn sm ghost num', disabled: cash < v, on: { click: (e) => act('jailCards', { bet: v }, { el: e.currentTarget }) } }, money(v)))), true),
    row('favores', t(favLeft === 1 ? 'jd_favores1' : 'jd_favores', { n: favLeft, t: J.favors, r: S.cfg.opSteps.contact }), h('div', { class: 'boxb' },
      btn(t('jbFavTime', { p: pctOf(J.favorCutBp) }), !favLeft, 'jailFavor', { kind: 'time' }),
      btn(t('jbFavContact', { n: me.contacts || 0, c: J.contactsMax }), !favLeft || (me.contacts || 0) >= J.contactsMax, 'jailFavor', { kind: 'contact' })), true),
    row('fuga', t('jd_fuga', { e: J.escapeE, p: pctOf(J.escapeBp) }), L.energy < J.escapeE ? h('button', { class: 'btn sm ghost dng', disabled: true }, t('jbEscape'))
      : sureBtn('btn sm ghost dng', t('jbEscape'), 'btn sm ghost dng sure', t('jbEscapeSure'), () => act('jailEscape')))));
  return out;
}

// ---------- discoteca ----------
function screenClub() {
  const me = S.st.me, L = live(me), max = stamMax(me), R = S.cfg.refillBar;
  const out = [pageHead('club', t('s_club'))];
  const b = busyBanner(me); if (b) out.push(b);
  // stamina a mais: a barra a droga, cada uma mais cara no mesmo dia
  // Os dois números são o que se paga: quanto custa encher agora e quanto custa cada ponto neste degrau da escada.
  // A escada sobe a cada 100 pontos comprados no mesmo dia; a frase diz quando sobe e para quanto.
  const feitas = me.refillBars || 0, k = Math.floor(feitas / 100) + 1, ponto = (n) => R.a * n + R.b * n * n, rf = me.refill;   // cêntimos por ponto
  out.push(h('div', { class: 'card stack vc refillc' },
    h('div', { class: 'row sp' }, h('h3', { style: 'margin:0' }, t('rfTitle')), feitas ? h('span', { class: 'small muted num' }, t('rfBought', { n: num(feitas) })) : null),
    meter(t('energy'), L.energy, max, 'en'),
    h('div', { class: 'facts two' },
      h('div', { class: 'fact' }, h('b', { class: 'num' + (rf ? ' c-cash' : '') }, rf ? money(rf.cost) : t('rfFullShort')), h('span', null, rf ? t('rfNowFor', { e: rf.energy }) : t('energy'))),
      h('div', { class: 'fact' }, h('b', { class: 'num' }, stMoney(ponto(k))), h('span', null, t('rfPerPoint')))),
    h('p', { class: 'small muted' }, t('rfLadder', { n: 100 - (feitas % 100), p: stMoney(ponto(k + 1)), z: stMoney(ponto(1)) })),
    h('button', { class: 'btn buy block big', disabled: !!b || !rf || me.cash + me.bank < rf.cost, on: { click: (e) => act('refill', {}, { el: e.currentTarget }) } },
      rf ? t('rfGo', { e: rf.energy, m: money(rf.cost) }) : t('rfFull'))));
  out.push(h('h2', { class: 'sec' }, t('clFx')), h('p', { class: 'small muted', style: 'margin:-4px 2px 10px' }, t('clFxSub')));
  out.push(h('div', { class: 'card meters' }, meter(t('vice'), L.vice, me.addictionCap, 'vi'), h('p', { class: 'small muted' }, t('vice') + ': ' + t('viceDown'))));
  if (L.vice >= me.addictionCap - 1) out.push(h('div', { class: 'note', style: 'margin-top:8px' }, h('p', null, t('viceFull')), h('button', { class: 'btn pri', on: { click: () => go('hosp') } }, t('goHosp'))));
  const more = (S.cfg.classes.find((c) => c.id === me.cls) || {}).fxMoreBp || 0;
  const mine = stockRows(me, b, true); if (mine) out.push(h('h2', { class: 'sec' }, t('clMine')), mine);
  const pv = playerClubs(me, L, b); if (pv.good) out.push(...pv, h('h2', { class: 'sec' }, t('p_club')));
  out.push(h('div', { class: 'card vlist vc fxl', style: 'margin-top:12px' }, S.cfg.drugs.map((g, d) => [g, d]).sort((x, y) => x[0].price - y[0].price).map(([g, d]) => {
    const price = me.drugPrices[d];
    const ok = L.vice + g.a <= me.addictionCap && me.cash + me.bank >= price && !b;
    return h('div', { class: 'vrow fxr' }, art('drugs', g.id, 'vth'),
      h('div', { class: 'grow' }, h('b', null, list('drugs')[d]),
        h('div', { class: 'small c-vice' }, '+' + g.a + ' ' + t('vice').toLowerCase()),
        g.fx ? g.fx.map((f) => h('div', { class: 'small' }, fxText(f) + ' · ' + t('fxFor', { m: Math.round((f.ms * (10000 + more)) / 10000 / 60000) })))
          : h('div', { class: 'small muted' }, t('noFx'))),
      h('button', { class: 'btn ghost sm num', 'aria-label': t('buyFor', { m: money(price) }), disabled: !ok, on: { click: (e) => act('drug', { d }, { el: e.currentTarget }) } }, t('vnUse') + ' · ' + money(price)));
  })));
  if (!pv.good) out.push(...pv);
  return out;
}

// ---------- putas ----------
function screenPutas() {
  const me = S.st.me, L = live(me), H = S.cfg.hookers;
  const out = [pageHead('putas', t('s_putas', { p: Math.round((H.stepNum / H.stepDen - 1) * 100) }))];
  const b = busyBanner(me); if (b) out.push(b);
  if (me.sick) out.push(h('div', { class: 'note', style: 'margin-bottom:10px' }, h('h3', { class: 'c-red' }, t('sickTitle')), h('p', null, t('sickSub', { p: H.sickCutBp / 100 })),
    h('button', { class: 'btn pri', on: { click: () => go('hosp') } }, t('goHosp'))));
  const pv = playerBros(me, L, b); if (pv.good) out.push(...pv, h('h2', { class: 'sec' }, t('brCity')));
  // uma lista, não uma grelha: a que dá stamina mais barata por ponto (das que se podem pagar) leva o botão cheio
  const full = L.energy >= stamMax(me), room = stamMax(me) - L.energy;
  const perPt = (i, g) => me.hookers[i] / Math.max(1, Math.min(g.e, room));
  let best = -1; H.list.forEach((g, i) => { if (!full && me.cash + me.bank >= me.hookers[i] && (best < 0 || perPt(i, g) < perPt(best, H.list[best]))) best = i; });
  if (full) out.push(h('p', { class: 'small muted', style: 'margin:0 2px 10px' }, t('hkFull')));
  // agrupadas pelo sítio (debaixo da ponte, da rua…): o sítio é o título do grupo, cada linha diz só a stamina, o risco e o preço
  const rows = [];
  H.list.map((g, i) => [g, i]).sort((x, y) => x[0].tier - y[0].tier || x[0].e - y[0].e).forEach(([g, i], n, all) => {
    if (!n || all[n - 1][0].tier !== g.tier) rows.push(h('h3', { class: 'hkt' }, t('hk_t' + g.tier)));
    const price = me.hookers[i];
    const ok = !b && !me.sick && !full && me.cash + me.bank >= price;
    rows.push(h('div', { class: 'vrow hkr' }, art('putas', g.id, 'vth'),
      h('div', { class: 'grow' }, h('b', null, list('hookers')[i]),
        h('div', { class: 'small c-en' }, '+' + g.e + ' ' + t('energy').toLowerCase()),
        h('div', { class: 'small c-red' }, t('hkSick', { p: (sickOf(g) / 100).toString().replace('.', lang() === 'pt' ? ',' : '.') })),
        (me.hkSteps?.[i] || 0) > 0 ? h('div', { class: 'small c-gold' }, t('hkUp', { p: Math.round(((H.stepNum / H.stepDen) ** me.hkSteps[i] - 1) * 100), h: me.hkSteps[i] })) : null),
      h('button', { class: 'btn sm num ' + (i === best ? 'buy' : 'ghost'), 'aria-label': t('hkGo', { m: money(price) }), disabled: !ok, on: { click: (e) => act('hooker', { i }, { el: e.currentTarget }) } }, t('hkBtn') + ' · ' + money(price))));
  });
  out.push(h('div', { class: 'card vlist vc hkl' }, rows));
  out.push(h('p', { class: 'small muted', style: 'margin:10px 2px 0' }, t('hkRobNote')));
  if (!pv.good) out.push(...pv);
  return out;
}

// ---------- discoteca e bordel do jogador ----------
const wholesaleOf = (d) => Math.max(1, Math.floor((S.cfg.drugs[d].price * S.cfg.goods.wholesaleBp) / 10000));
const canTake = (me, L, g) => (g.fx || L.energy + g.e <= stamMax(me)) && L.vice + g.a <= me.addictionCap;
const ownerTag = (v) => (v.tag ? '[' + v.tag + '] ' : '') + v.name;
// o armazém: cada linha abre as opções (tomar, despachar). Na discoteca da cidade há só o botão de tomar.
function stockRows(me, b, quick) {
  const L = live(me), rows = me.stock.map((n, d) => ({ n, d })).filter((x) => x.n > 0);
  if (!rows.length) return null;
  return h('div', { class: 'card vlist vc' }, rows.map(({ n, d }) => {
    const keep = me.club && me.hold?.includes(d);
    const g = S.cfg.drugs[d], body = [art('drugs', g.id, 'vth'), h('div', { class: 'grow' }, h('b', null, list('drugs')[d], keep ? h('span', { class: 'chip', style: 'margin-left:6px' }, t('holdTag')) : null), h('div', { class: 'small muted num' }, qty(d, n) + ' · ' + money(n * wholesaleOf(d))))];
    return quick
      ? h('div', { class: 'vrow' }, ...body, h('button', { class: 'btn buy sm', disabled: !!b || !canTake(me, L, g), on: { click: (e) => act('stockUse', { d }, { el: e.currentTarget }) } }, t('vnUse')))
      : h('button', { class: 'vrow tap', on: { click: () => stockSheet(d) } }, ...body, h('span', { class: 'muted', 'aria-hidden': 'true' }, '›'));
  }));
}
// a droga do armazém de Lisboa: vender, mudar, tomar ou tirar da venda da discoteca (a folha das regiões)
function stockSheet(d) { tradeSheet('lx', d, tradableD(d) ? 'sell' : 'use'); }
function venueTill(v, rateTxt) {
  const full = v.cap > 0 && v.till >= v.cap;
  return h('div', { class: 'card stack vc' },
    h('div', { class: 'row sp' }, h('span', { class: 'muted' }, t('vnTill')), h('b', { class: 'num c-cash vbig' }, money(v.till))),
    h('div', { class: 'fill' + (full ? ' full' : '') }, h('i', { style: `width:${v.cap ? Math.min(100, (v.till / v.cap) * 100) : 0}%` })),
    h('div', { class: 'row sp small muted' }, h('span', null, rateTxt), h('span', null, full ? t('storageFull') : t('vnCap', { m: moneyShort(v.cap) }))),
    h('button', { class: 'btn buy get block', disabled: v.till <= 0, on: { click: (e) => act('venueCollect', {}, { el: e.currentTarget }) } }, v.till > 0 ? t('collect', { m: money(v.till) }) : t('nothingToCollect')));
}
function venuePrices(kind, v) {
  const V = S.cfg.venue, me = S.st.me, floor = kind === 'club' ? S.cfg.goods.wholesaleBp : V.girlBp;
  const set = (pi, gd) => act('venueSet', { kind, pi, gd });
  const raw = Math.floor((V.prices[v.pi] * (10000 - V.gdisc[v.gd])) / 10000), gbp = Math.max(floor, raw);
  const vol = V.volBp[v.pi] / 100, bp = V.prices[v.pi], gain = kind === 'club' ? Math.round(((bp - floor) / floor) * 100) : (bp - floor) / 100;
  // o efeito da escolha em números grandes: verde quando é melhor para ti do que o normal, vermelho quando é pior; o resto sem cor
  const fact = (lbl, val, cls) => h('div', { class: 'fact' }, h('b', { class: 'num ' + cls }, val), h('span', null, lbl));
  const inGang = me.gang && !me.gang.bot;
  return h('div', { class: 'card stack vc' },
    h('h3', null, t('vnPrice')),
    h('div', { class: 'seg five', role: 'group', 'aria-label': t('vnPrice') }, V.prices.map((x, i) => h('button', { 'aria-pressed': i === v.pi ? 'true' : 'false', on: { click: () => set(i, v.gd) } }, x / 100 + '%'))),
    h('div', { class: 'segends', 'aria-hidden': 'true' }, h('span', null, t('vnPriceLo')), h('span', null, t('vnPriceHi'))),
    h('div', { class: 'facts two' }, fact(t('vnCust'), vol + '%', vol > 100 ? 'c-cash' : vol < 100 ? 'c-red' : ''), fact(t(kind === 'club' ? 'vnProfit' : 'vnCut'), gain + '%', gain > 0 ? 'c-cash' : 'muted')),
    bp <= floor ? h('p', { class: 'small muted' }, t('vnPriceZero')) : kind === 'club' ? null : h('p', { class: 'small muted' }, t('vnBroRest')),
    h('h3', { style: 'margin-top:8px' }, t('vnGang')),
    h('div', { class: 'seg five', role: 'group', 'aria-label': t('vnGang') }, V.gdisc.map((x, i) => h('button', { 'aria-pressed': i === v.gd ? 'true' : 'false', on: { click: () => set(v.pi, i) } }, x ? '−' + x / 100 + '%' : t('vnNoDisc')))),
    inGang ? h('div', { class: 'facts two' }, fact(t('vnPayGang'), gbp / 100 + '%', ''), fact(t('vnPayAll'), bp / 100 + '%', '')) : null,
    // o desconto escolhido passava do custo: diz-se logo, para o número de cima não parecer um erro
    !inGang ? h('p', { class: 'small muted' }, t('vnNoGang')) : raw < floor ? h('p', { class: 'small vfloor' }, t('vnFloor', { p: floor / 100 })) : null);
}
function venueUp(kind, v, nextTxt, b) {
  const me = S.st.me;
  return h('div', { class: 'card stack vc' }, h('div', { class: 'row sp' }, h('b', null, t('vnLvl', { n: v.lvl })), h('span', { class: 'small muted' }, v.next == null ? t('vnMax') : nextTxt)),
    v.next == null ? null : h('button', { class: 'btn pri block', disabled: !!b || me.cash + me.bank < v.next, on: { click: (e) => act('venueBuy', { kind }, { el: e.currentTarget }) } }, t('vnUp', { m: moneyShort(v.next) })));
}
function venuePitch(kind, b) {
  const me = S.st.me, cost = S.cfg.venue[kind].cost[0], k = kind === 'club' ? 'mc' : 'mb';
  return h('div', { class: 'card stack vc' }, h('p', { class: 'vlead' }, t(k + 'Pitch', { p: Math.round((10000 / S.cfg.goods.wholesaleBp - 1) * 100) })),
    h('ul', { class: 'vperks' }, [1, 2, 3].map((i) => h('li', null, icon('check'), t(k + 'Perk' + i)))),
    h('button', { class: 'btn buy block big', disabled: !!b || me.cash + me.bank < cost, on: { click: (e) => act('venueBuy', { kind }, { el: e.currentTarget }) } }, t('vnOpen', { m: moneyShort(cost) })));
}
function screenMyClub() {
  const me = S.st.me, V = S.cfg.venue, c = me.club, out = [pageHead('myclub', t('mcSub'))];
  const b = busyBanner(me); if (b) out.push(b);
  if (!c) out.push(venuePitch('club', b));
  else { out.push(venueTill(c, t('mcRate', { m: moneyShort(c.perH) }))); out.push(venuePrices('club', c)); }
  out.push(h('h2', { class: 'sec' }, t('vnStock')));
  out.push(stockRows(me, b) || h('div', { class: 'card stack vc' }, h('p', { class: 'muted' }, t('vnStockNone')),
    h('div', { class: 'row' }, h('button', { class: 'btn ghost grow', on: { click: () => go('port') } }, t('p_port')), h('button', { class: 'btn ghost grow', on: { click: () => go('air') } }, t('p_air')))));
  if (c) out.push(venueUp('club', c, c.next == null ? '' : t('mcNext', { m: moneyShort(V.club.perH[c.lvl]) }), b));
  return out;
}
// ---------- regiões e armazéns (passo 6, parte 2) ----------
// Portugal numa linha de norte a sul. Em cada região: a polícia, o armazém do jogador e o mercado. O jogador não viaja:
// muda a mercadoria (1 hora por salto, com o risco da pressão das duas regiões).
const RGS = () => S.cfg.regions.list.map((r) => r.id);
const rgName = (r) => t('rg_' + r);
// o nome da região com a preposição que cada frase pede («no Alentejo», «do Algarve», «para Lisboa», «ao Algarve»)
const rgF = (r) => ({ em: t('rgEm_' + r), de: t('rgDe_' + r), para: t('rgPara_' + r), a: t('rgA_' + r) });
const famOfD = (d) => S.cfg.drugs[d].fam;
const tradableD = (d) => famOfD(d) !== 'bar';
const refCOf = (d) => Math.floor((S.cfg.drugs[d].price * 100 * S.cfg.goods.wholesaleBp) / 10000);
const depthUOf = (r, d) => Math.max(1, Math.floor((S.cfg.market.depth[r] * 100) / refCOf(d)));
const uOf = (d, n) => list(n === 1 ? 'drugU1' : 'drugU')[d];
const qty = (d, n) => num(n) + ' ' + uOf(d, n);
const whStockC = (me, r) => (r === 'lx' ? me.stock : me.wh[r] ? me.wh[r].s : null);
// preço de uma unidade agora (sem o empurrão da ordem), em cêntimos: grosso × procura × saturação, mais ou menos a margem
const unitC = (me, r, d, side) => { const g = me.mk[r]; return (refCOf(d) * g.dem[d] * g.sat[d] * (10000 + side * S.cfg.market.spreadBp)) / 1e12; };
const perU = (c, d) => stMoney(Math.round(c)) + '/' + uOf(d, 1);
// n unidades de uma vez, em cêntimos, como o motor: o preço anda à medida que se compra ou vende, e pára nos limites
function mkQuote(me, r, d, n, side) {
  const M = S.cfg.market, g = me.mk[r], D = depthUOf(r, d), s0 = g.sat[d], lim = side > 0 ? M.satMax : M.satMin;
  const n1 = Math.min(n, (Math.max(0, side > 0 ? lim - s0 : s0 - lim) * D) / 10000);
  const sum = (n1 * (s0 + (side > 0 ? s0 + (n1 * 10000) / D : s0 - (n1 * 10000) / D))) / 2 + (n - n1) * lim;
  const c = (refCOf(d) * g.dem[d] * sum * (10000 + side * M.spreadBp)) / 1e12;
  return side > 0 ? Math.ceil(c) : Math.floor(c);
}
const rgPos = (r) => S.cfg.regions.list.find((x) => x.id === r).pos;
const mvHopsC = (a, b) => Math.abs(rgPos(a) - rgPos(b));
// risco no caminho (bp): em cada salto, a média da pressão das duas regiões a dividir por 10
function mvRiskC(me, a, b) {
  const pa = rgPos(a), pb = rgPos(b), ids = S.cfg.regions.list.filter((g) => g.pos >= Math.min(pa, pb) && g.pos <= Math.max(pa, pb)).sort((x, y) => (pa < pb ? x.pos - y.pos : y.pos - x.pos)).map((g) => g.id);
  let bp = 0; for (let i = 1; i < ids.length; i++) bp += Math.round(((me.mk[ids[i - 1]].press + me.mk[ids[i]].press) * 10) / 2);
  return Math.min(9500, bp);
}
const raidBpC = (me, r) => { const w = me.wh[r], p = me.mk[r].press; return !w || p < S.cfg.wh.raidMin ? 0 : Math.floor((S.cfg.wh.raidBp * p * w.heat * 100) / (100 * 10000)); };
const pressCls = (p) => (p >= S.cfg.wh.raidMin ? 'c-red' : '');
// o que vale o que está guardado numa região, ao preço a que se vende lá agora
const whTotal = (me) => (me.mk && me.wh ? RGS().reduce((x, r) => x + whWorth(me, r), 0) : 0);
const whWorth = (me, r) => { const s = whStockC(me, r); return s ? s.reduce((x, n, d) => x + (n > 0 && tradableD(d) ? Math.floor((n * unitC(me, r, d, -1)) / 100) : 0), 0) : 0; };
// o que vale a pena numa região: a droga que se compra aqui e se vende noutra com mais margem (barato), e a que se compra
// noutra e se vende aqui com mais margem (caro). Só aparece quando a conta dá lucro antes do risco do caminho.
function rgTips(me, r) {
  let cheap = null, dear = null;
  S.cfg.drugs.forEach((_, d) => {
    if (!tradableD(d)) return;
    const others = RGS().filter((x) => x !== r);
    const out = Math.max(...others.map((x) => unitC(me, x, d, -1))) / unitC(me, r, d, 1), inn = unitC(me, r, d, -1) / Math.min(...others.map((x) => unitC(me, x, d, 1)));
    if (out > 1 && (!cheap || out > cheap.v)) cheap = { d, v: out };
    if (inn > 1 && (!dear || inn > dear.v)) dear = { d, v: inn };
  });
  return { cheap: cheap && cheap.d, dear: dear && dear.d };
}
function regionRow(me, r) {
  const g = me.mk[r], w = me.wh[r], tip = rgTips(me, r);
  const whLine = w ? t('whUsed', { a: num(w.used), b: num(w.cap) })
    : me.level < S.cfg.wh.level ? t('rgWhLock', { n: S.cfg.wh.level }) : t('rgWhNone', { m: money(S.cfg.wh[r].price) });   // («Sem armazém (30 000 €)»)
  const lockT = me.level < S.cfg.regions.famLevel.leve ? t('rgTradeLock', { n: S.cfg.regions.famLevel.leve }) : null;
  const tips = lockT ? [h('div', { class: 'small muted' }, lockT)] : [tip.cheap != null ? h('div', { class: 'small' }, t('rgCheap', { x: list('drugs')[tip.cheap].toLowerCase() })) : null,
    tip.dear != null ? h('div', { class: 'small' }, t('rgDear', { x: list('drugs')[tip.dear].toLowerCase() })) : null].filter(Boolean);
  return h('button', { class: 'rgrow', on: { click: () => { S.reg = r; render(true); window.scrollTo({ top: 0 }); } } },
    art('cenas', 'regiao-' + r, 'rgth'),
    h('div', { class: 'grow' }, h('b', { class: 'rgnm' }, rgName(r)), h('div', { class: 'small muted' }, whLine), ...tips),
    h('div', { class: 'rgp' }, h('b', { class: 'num ' + pressCls(g.press) }, String(g.press)), h('span', null, t('rgPress'))), icon('chev'));
}
// a mercadoria a caminho e o que aconteceu às últimas cargas e aos armazéns (chegadas, apreensões, rusgas)
function rgTransit(me) {
  if (!me.mv.length) return null;
  return [h('h2', { class: 'sec' }, t('rgTransit')), h('div', { class: 'card vlist vc' }, me.mv.map((v) => h('div', { class: 'vrow' }, art('drugs', S.cfg.drugs[v.d].id, 'vth'),
    h('div', { class: 'grow' }, h('b', null, t('rgMvRow', { q: qty(v.d, v.n), x: list('drugs')[v.d].toLowerCase() })), h('div', { class: 'small muted' }, t('rgMvWay', { from: rgName(v.a), to: rgName(v.b) }) + ' · ' + t('rgArrAt', { h: hhmm(v.at) })),
      h('div', { class: 'small muted' }, t('rgRiskOut', { p: pctOf(v.risk) + '%' }))),
    h('b', { class: 'num mvt', dataset: { left: v.at } }, dur(Math.max(0, v.at - now()))))))];
}
const tookTxt = (took) => (took.length ? took.map(([d, n]) => qty(d, n) + ' ' + t('rgOf') + list('drugs')[d].toLowerCase()).join(', ') : t('raidNothing'));
function rgLog(me) {
  const rows = [
    ...(me.mvLog || []).map((x) => ({ at: x.at, bad: x.x !== 0, txt: x.x === 0 ? t('rgLogOk', { q: qty(x.d, x.n), x: list('drugs')[x.d].toLowerCase(), ...rgF(x.b) })
      : x.x === 1 ? t('rgLogFine', { x: list('drugs')[x.d].toLowerCase(), m: money(x.fine), ...rgF(x.b) }) : t('rgLogSeized', { q: qty(x.d, x.n), x: list('drugs')[x.d].toLowerCase(), ...rgF(x.b) }) + (x.jail ? t('rgLogJail') : '') })),
    ...(me.rz || []).map((x) => ({ at: x.at, bad: true, txt: t('rgLogRaid', { t: tookTxt(x.took), m: money(x.fine), ...rgF(x.r) }) + (x.jail ? t('rgLogJail') : '') })),
  ].sort((a, b) => b.at - a.at).slice(0, 5);
  if (!rows.length) return null;
  return h('section', { class: 'rglog' }, h('h2', { class: 'sec' }, t('rgLog')), h('ul', { class: 'plive' }, rows.map((x) => h('li', null, h('span', { class: 'ptime' }, paperTime(x.at)), h('span', { class: x.bad ? 'c-red' : '' }, x.txt)))));
}
function screenStash() {
  const me = S.st.me;
  if (!me.mk || !me.wh) return [pageHead('stash', null, true), h('p', { class: 'muted' }, t('loading'))];
  if (S.reg && RGS().includes(S.reg)) return regionDetail(me, S.reg);
  const out = [pageHead('stash', t('rgSub'), true)];
  const b = busyBanner(me); if (b) out.push(b);
  const ids = RGS(), line = h('div', { class: 'rgline' });
  ids.forEach((r, i) => {
    if (i) line.append(h('div', { class: 'rghop' }, h('span', null, t('rgHop', { h: mvHopsC(ids[i - 1], r), p: pctOf(mvRiskC(me, ids[i - 1], r)) + '%' }))));
    line.append(regionRow(me, r));
  });
  out.push(line);
  const tr = rgTransit(me); if (tr) out.push(...tr);
  const lg = rgLog(me); if (lg) out.push(lg);
  return out;
}
// uma região: a polícia, os acontecimentos, o armazém (com as melhorias) e o mercado, por família
function regionDetail(me, r) {
  const g = me.mk[r], w = me.wh[r], W = S.cfg.wh, cash = me.cash + me.bank, out = [];
  out.push(h('div', { class: 'phead' }, h('div', { class: 'pbar' }, h('button', { class: 'back', 'aria-label': t('rgBack'), on: { click: () => { S.reg = null; render(true); window.scrollTo({ top: 0 }); } } }, h('span', { 'aria-hidden': 'true' }, '←')), h('h1', null, rgName(r)))));
  const b = busyBanner(me); if (b) out.push(b);
  const prev = g.hist.length > 1 ? g.hist[g.hist.length - 2] : null, rb = raidBpC(me, r);
  const evs = g.ev.map((e) => h('p', { class: 'rgev' }, rgEvLine({ e: e.k, d: e.d, bp: e.bp }, e.to)));
  out.push(h('div', { class: 'jobp rghero' },
    h('div', { class: 'jimg' }, h('img', { src: IMG('cenas', 'regiao-' + r, 1), alt: '', width: 1100, height: 1100, decoding: 'async', on: { error: (e) => e.currentTarget.remove() } })),
    h('p', { class: 'small' }, t('rgd_' + r)),
    h('div', { class: 'jdeal' },
      h('div', null, h('span', null, t('lxPress')), h('b', { class: 'num ' + pressCls(g.press) }, String(g.press), h('small', { class: 'muted' }, ' ' + t('lxOf')))),
      h('div', null, h('span', null, t('lxCrime')), h('b', { class: 'num' }, String(g.crime), prev && prev[1] !== g.crime ? h('small', { class: g.crime > prev[1] ? 'c-red' : 'c-cash' }, (g.crime > prev[1] ? ' ▲' : ' ▼') + Math.abs(g.crime - prev[1])) : null))),
    g.press < W.raidMin ? h('p', { class: 'small muted' }, t('rgRaidNone', { p: g.press, n: W.raidMin })) : h('p', { class: 'jrisk' }, w ? t('rgRaidNow', { p: pctOf(rb) + '%' }) : t('rgRaidNo', { n: W.raidMin })),
    ...evs));
  // o armazém
  if (!w) {
    const lock = me.level < W.level;
    out.push(h('div', { class: 'card stack vc' }, h('h3', { style: 'margin:0' }, t('whBuyT', rgF(r))), h('p', { class: 'small muted' }, t('whBuySub', { n: num(W[r].sp[0]) })),
      lock ? h('p', { class: 'small' }, icon('lock'), ' ', t('needLevel', { n: W.level }))
        : h('button', { class: 'btn buy block big', disabled: cash < W[r].price, on: { click: (e) => act('whBuy', { r }, { el: e.currentTarget }) } }, t('whBuyGo', { m: money(W[r].price) }))));
  } else {
    const inTr = me.mv.filter((v) => v.b === r).reduce((x, v) => x + v.n, 0), full = w.used >= w.cap;
    out.push(h('div', { class: 'card stack vc' },
      h('div', { class: 'row sp' }, h('span', { class: 'muted' }, t('whUp_sp')), h('b', { class: 'num' }, t('whUsed', { a: num(w.used), b: num(w.cap) }))),
      h('div', { class: 'fill' + (full ? ' full' : '') }, h('i', { style: `width:${w.cap ? Math.min(100, (w.used / w.cap) * 100) : 0}%` })),
      inTr ? h('div', { class: 'small muted' }, t('whTransit', { n: num(inTr) })) : null,
      h('div', { class: 'jdeal three' },
        h('div', null, h('span', null, t('whHeat')), h('b', { class: 'num ' + (w.heat >= 50 ? 'c-red' : '') }, String(w.heat), h('small', { class: 'muted' }, ' ' + t('whOf')))),
        h('div', null, h('span', null, t('whHide')), h('b', { class: 'num' }, pctOf(w.hide) + '%')),
        h('div', null, h('span', null, t('whFront')), h('b', { class: 'num' }, '−' + pctOf(w.front) + '%'))),
      h('p', { class: 'small muted' }, t('whHeatSub'))));
    const up = (k, line) => h('div', { class: 'vrow' }, h('div', { class: 'grow' }, h('b', null, t('whUp_' + k)), h('div', { class: 'small muted' }, line)),
      w.up[k] == null ? h('span', { class: 'small muted whupb' }, t('whMax')) : h('button', { class: 'btn ghost sm num whupb', disabled: cash < w.up[k], on: { click: (e) => act('whUp', { r, k }, { el: e.currentTarget }) } }, t('upgrade') + ' · ' + money(w.up[k])));
    out.push(h('h2', { class: 'sec' }, t('whUpT')));
    out.push(h('div', { class: 'card vlist vc' },
      up('sp', w.sp >= 5 ? num(w.cap) : t('whUpSp', { a: w.sp, b: w.sp + 1, n: num(W[r].sp[w.sp]) })),
      up('hd', w.hd >= 5 ? pctOf(w.hide) + '%' : t('whUpHd', { a: pctOf(w.hide) + '%', b: pctOf(W.hideBp[w.hd]) + '%' })),
      up('fr', w.fr >= 5 ? '−' + pctOf(w.front) + '%' : t('whUpFr', { a: '−' + pctOf(w.front) + '%', b: '−' + pctOf(W.frontBp[w.fr]) + '%' }))));
    // o que está guardado aqui
    const st = whStockC(me, r), held = st.map((n, d) => ({ n, d })).filter((x) => x.n > 0);
    out.push(h('h2', { class: 'sec' }, t('whStockT')));
    out.push(held.length ? h('div', { class: 'card vlist vc' }, held.map(({ n, d }) => h('button', { class: 'vrow tap', on: { click: () => tradeSheet(r, d, tradableD(d) ? 'sell' : 'use') } }, art('drugs', S.cfg.drugs[d].id, 'vth'),
      h('div', { class: 'grow' }, h('b', null, list('drugs')[d]), h('div', { class: 'small muted num' }, qty(d, n) + (tradableD(d) ? ' · ' + t('rgWorth', { m: money(Math.floor((n * unitC(me, r, d, -1)) / 100)) }) : ''))),
      h('span', { class: 'muted', 'aria-hidden': 'true' }, '›'))))
      : h('p', { class: 'small muted' }, t('whEmpty')));
  }
  // o mercado, por família (a de bar não se trafica)
  out.push(h('h2', { class: 'sec' }, t('mkT', rgF(r))), h('p', { class: 'small muted', style: 'margin:-4px 2px 10px' }, t('mkSub')));
  for (const fam of ['leve', 'festa', 'pesada']) {
    const ds = S.cfg.drugs.map((_, d) => d).filter((d) => famOfD(d) === fam).sort((a, b) => S.cfg.drugs[a].price - S.cfg.drugs[b].price);
    const need = S.cfg.regions.famLevel[fam];
    out.push(h('div', { class: 'card vlist vc mkfam' }, h('div', { class: 'small mkfh' }, t('fam_' + fam), me.level < need ? h('span', { class: 'muted' }, ' · ' + t('mkLock', { n: need })) : null),
      ds.map((d) => {
        const sell = unitC(me, r, d, -1), best = RGS().filter((x) => x !== r).map((x) => ({ x, c: unitC(me, x, d, -1) })).sort((a, b) => b.c - a.c)[0], have = (whStockC(me, r) || [])[d] || 0;
        // «vende-se melhor noutra»: só quando comprar aqui e vender lá dá lucro antes do risco do caminho
        const buy = unitC(me, r, d, 1), gain = best && best.c > buy, ev = g.ev.find((e) => e.d === d);
        const sub = [t('mkBuyAt', { m: perU(buy, d) }), have ? t('mkHave', { q: qty(d, have) }) : null].filter(Boolean).join(' · ');
        return h('button', { class: 'vrow tap mkrow', on: { click: () => tradeSheet(r, d, have ? 'sell' : 'buy') } }, art('drugs', S.cfg.drugs[d].id, 'vth'),
          h('div', { class: 'grow' }, h('b', null, list('drugs')[d]), h('div', { class: 'small muted' }, sub),
            ev ? h('div', { class: 'small c-cash' }, t('ev_' + ev.k) + ' ' + sPct(ev.bp)) : null, gain ? h('div', { class: 'small c-cash' }, t('mkBest', { m: perU(best.c, d), ...rgF(best.x) })) : null),
          h('div', { class: 'mkp' }, h('span', null, t('mkSellAt')), h('b', { class: 'num' }, perU(sell, d))));
      })));
  }
  return out;
}
// Comprar, vender, mudar (e em Lisboa, tomar): uma droga numa região. Em cima, os preços nas três regiões lado a lado.
function tradeSheet(r, d, mode0) {
  const body = h('div', { class: 'stack' });
  let mode = mode0, dest = null, amt = '';
  const close = sheet(body);
  const draw = () => {
    const me = S.st.me, W = S.cfg.wh, w = me.wh[r], st = whStockC(me, r) || [], have = st[d] || 0, cash = me.cash + me.bank, fam = famOfD(d), need = S.cfg.regions.famLevel[fam];
    const others = RGS().filter((x) => x !== r && me.wh[x]);
    if (!tradableD(d)) mode = 'use';
    if (mode === 'sell' && !have) mode = 'buy';
    if (mode === 'move' && (!have || !others.length)) mode = have ? 'sell' : 'buy';
    if (!dest || !others.includes(dest)) dest = others.includes('lx') ? 'lx' : others[0] || null;
    const L = live(me), g = S.cfg.drugs[d];
    const head = h('div', { class: 'vrow' }, art('drugs', g.id, 'vth'), h('div', { class: 'grow' }, h('h2', { style: 'margin:0' }, list('drugs')[d]),
      h('div', { class: 'small muted' }, tradableD(d) ? t('fam_' + fam) : t('vnStock'))));
    if (mode === 'use') {
      body.replaceChildren(head, h('div', { class: 'small muted num' }, qty(d, have)),
        h('button', { class: 'btn buy block big', disabled: !!(L.jail || L.hosp) || !canTake(me, L, g) || !have, on: { click: () => { close(); act('stockUse', { d }); } } }, t('vnUseOne')));
      return;
    }
    // os preços nas três regiões: vende-se a este, compra-se 10% acima
    const bh = unitC(me, r, d, 1);
    const prices = h('div', { class: 'jdeal three tsp' }, RGS().map((x) => { const sx = unitC(me, x, d, -1), gp = sx / bh - 1;
      return h('div', { class: x === r ? 'on' : '' }, h('span', null, rgName(x)),
        mode === 'buy' && x === r ? h('b', { class: 'num' }, perU(bh, d)) : h('b', { class: 'num' }, perU(sx, d)),
        mode === 'buy' ? h('small', { class: 'num ' + (x === r ? 'muted' : gp > 0 ? 'c-cash' : 'c-red') }, x === r ? t('tsBuyHere') : t('tsThere', { p: sPct(Math.round(gp * 10000)) }))
          : h('small', { class: 'muted num' }, t('mkBuyAt', { m: stMoney(Math.round(unitC(me, x, d, 1))) }))); }));
    const segs = [['buy', t('tsBuy')], ['sell', t('tsSell')], ['move', t('tsMove')]];
    const seg = h('div', { class: 'seg', role: 'group', style: 'margin-bottom:0' }, segs.map(([id, lbl]) => h('button', { 'aria-pressed': mode === id ? 'true' : 'false',
      disabled: (id === 'sell' && !have) || (id === 'move' && (!have || !others.length)) || (id === 'buy' && !w), on: { click: () => { mode = id; amt = ''; draw(); } } }, lbl)));
    // quanto: na compra, o que cabe e o que o dinheiro paga; na venda e na mudança, o que lá está
    const free = w ? Math.max(0, w.cap - w.used) : 0;
    let maxN = 0;
    if (mode === 'buy') { let n = Math.min(free, Math.floor((cash * 100) / Math.max(1, unitC(me, r, d, 1)))); while (n > 0 && mkQuote(me, r, d, n, 1) > cash * 100) n = n > 2000 ? Math.floor(n * 0.995) : n - 1; maxN = Math.max(0, n); }
    else if (mode === 'sell') maxN = have;
    else maxN = dest ? Math.min(have, Math.max(0, me.wh[dest].cap - me.wh[dest].used)) : 0;
    // o campo vazio não quer dizer «tudo»: vender tudo de uma vez pode empurrar o preço a pique, por isso escreve-se ou toca-se num atalho
    const inp = h('input', { id: 'tsamt', inputmode: 'numeric', autocomplete: 'off', enterkeyhint: 'done', value: amt, placeholder: t('tsMaxPh', { q: qty(d, maxN) }) });
    const nOf = () => Math.max(0, Math.min(maxN, parseInt(inp.value, 10) || 0));
    const sum = h('div', { class: 'stack', style: 'gap:6px' }), btn = h('button', { class: 'btn block big buy stgo tsgo' });
    const row = (a, b2, cls = '') => h('div', { class: 'row sp small' }, h('span', { class: 'muted' }, a), h('b', { class: 'num ' + cls }, b2));
    let why = '';
    if (mode === 'buy' && !w) why = t('tsNoWh', rgF(r));
    else if (mode === 'buy' && me.level < need) why = t('tsLvl', { x: list('drugs')[d].toLowerCase(), n: need });
    else if (mode === 'buy' && !free) why = t('tsFull');
    else if (mode === 'buy' && maxN < 1) why = t('tsNoCash');
    else if (mode === 'move' && me.mv.length >= S.cfg.mv.max) why = t('tsMvMax', { n: me.mv.length });
    else if (mode === 'move' && dest && maxN < 1) why = t('tsFull');
    const sync = () => {
      const n = nOf();
      if (why) { setBtn(btn, why); btn.disabled = true; sum.replaceChildren(); return; }
      if (mode === 'buy' || mode === 'sell') {
        const side = mode === 'buy' ? 1 : -1, c = n > 0 ? mkQuote(me, r, d, n, side) : 0, base = n * unitC(me, r, d, side), push = Math.abs(c - base);
        sum.replaceChildren(...[n > 0 ? row(t('tsAvg'), perU(c / n, d)) : null, n > 0 && push >= 100 ? row(t('tsPush'), money(Math.round(push / 100)), 'c-red') : null,
          n > 0 ? row(t(mode === 'buy' ? 'tsPay' : 'tsGet'), money(mode === 'buy' ? Math.ceil(c / 100) : Math.floor(c / 100)), mode === 'sell' ? 'c-cash' : '') : null].filter(Boolean));
        setBtn(btn, n > 0 ? t(mode === 'buy' ? 'tsBuyGo' : 'tsSellGo', { q: qty(d, n), m: money(mode === 'buy' ? Math.ceil(c / 100) : Math.floor(c / 100)) }) : t('tsNone'));
        btn.disabled = n < 1; btn.dataset.c = String(c);
      } else {
        const risk = mvRiskC(me, r, dest), hops = mvHopsC(r, dest), val = Math.floor((n * refCOf(d)) / 100);
        const ifc = fam === 'leve' ? t('tsIf_leve', { m: money(Math.floor((val * W.fineBp) / 10000)) }) : fam === 'festa' ? t('tsIf_festa') : t('tsIf_pesada', { t: W.jailMin });
        sum.replaceChildren(h('div', { class: 'jdeal three' },
          h('div', null, h('span', null, t('tsTime')), h('b', { class: 'num' }, hops + ' h')),
          h('div', null, h('span', null, t('tsRisk')), h('b', { class: 'num ' + (risk >= 500 ? 'c-red' : '') }, pctOf(risk) + '%')),
          h('div', null, h('span', null, t('tsArr')), h('b', { class: 'num' }, hhmm(now() + hops * S.cfg.mv.hopMs)))), h('p', { class: 'small muted' }, ifc));
        setBtn(btn, n > 0 ? t('tsMoveGo', { q: qty(d, n), ...rgF(dest) }) : t('tsNone')); btn.disabled = n < 1;
      }
    };
    inp.addEventListener('input', () => { inp.value = inp.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 9); amt = inp.value; sync(); });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
    btn.addEventListener('click', async () => {
      const n = nOf(); if (n < 1) return; inp.blur(); close();
      if (mode === 'move') await act('mvSend', { a: r, b: dest, d, n });
      else await act(mode === 'buy' ? 'mktBuy' : 'mktSell', { r, d, n, c: +btn.dataset.c });
    });
    const quick = h('div', { class: 'bquick' }, [25, 50, 75].map((q) => h('button', { class: 'btn ghost sm', disabled: maxN < 1 || !!why, on: { click: () => { inp.value = String(Math.max(1, Math.floor((maxN * q) / 100))); amt = inp.value; sync(); } } }, q + '%')),
      h('button', { class: 'btn ghost sm', disabled: maxN < 1 || !!why, on: { click: () => { inp.value = String(maxN); amt = inp.value; sync(); } } }, t('stAll')));
    const dests = mode === 'move' && others.length > 1 ? h('div', { class: 'stack', style: 'gap:6px' }, h('span', { class: 'small muted' }, t('tsTo')),
      h('div', { class: 'seg', role: 'group', style: 'margin-bottom:0' }, others.map((x) => h('button', { 'aria-pressed': dest === x ? 'true' : 'false', on: { click: () => { dest = x; amt = ''; draw(); } } }, rgName(x))))) : null;
    const lxExtra = r === 'lx' && have ? h('div', { class: 'row', style: 'gap:8px' },
      h('button', { class: 'btn ghost grow', disabled: !!(L.jail || L.hosp) || !canTake(me, L, g), on: { click: () => { close(); act('stockUse', { d }); } } }, t('vnUseOne')),
      me.club ? h('button', { class: 'btn ghost grow', on: { click: () => { close(); act('stockHold', { d, on: !me.hold?.includes(d) }); } } }, t(me.hold?.includes(d) ? 'holdSale' : 'holdKeep')) : null) : null;
    body.replaceChildren(...[head, h('div', { class: 'small muted' }, t(mode === 'buy' ? 'tsWhereBuy' : 'tsWhere')), prices, seg,
      mode === 'move' && !others.length ? h('p', { class: 'small muted' }, t('tsNoOther')) : null,
      dests, h('div', { class: 'field', style: 'margin:0' }, h('label', { for: 'tsamt' }, t('tsQty', { u: uOf(d, 2) })), inp), quick, sum, btn, lxExtra].filter(Boolean));
    sync();
  };
  draw();
}
// o contabilista: guarda o que passava do armazém e diz onde o dinheiro rende mais
function screenAcct() {
  const me = S.st.me, A = S.cfg.accountant, B = S.cfg.biz, out = [pageHead('acct', t('acSub'))];
  const hours = (S.cfg.storageMs / 3600000), row = (a, b, cls = '') => h('div', { class: 'row sp small' }, h('span', { class: 'muted' }, a), h('b', { class: 'num ' + cls }, b));
  if (!me.acct) {
    const low = me.level < A.minLevel, poor = me.cash + me.bank < A.price;
    out.push(h('div', { class: 'card stack vc' }, h('h2', { style: 'margin:0' }, t('acPitchT')),
      h('ul', { class: 'bul' }, h('li', null, t('acP1', { a: hours, b: hours * A.capMult })), h('li', null, t('acP2', { p: A.feeBp / 100, a: hours })), h('li', null, t('acP3'))),
      h('button', { class: 'btn buy block big', disabled: low || poor, on: { click: (e) => act('acct', {}, { el: e.currentTarget }) } }, t('acHireFor', { m: money(A.price) })),
      low ? h('p', { class: 'small muted' }, t('needLevel', { n: A.minLevel })) : h('p', { class: 'small muted' }, t('acOnce'))));
    return out;
  }
  // o que ele tem guardado acima das 8 h e quanto fica para ele
  let over = 0, fee = 0; me.biz.forEach((b, i) => { const st = storedNow(b, i); over += Math.max(0, st - bizCapN(b)); fee += bizFeeOf(b, st); });
  const bizH = me.biz.reduce((s, b) => s + b.perH, 0), broH = me.bro?.perH || 0, clubH = me.club && me.stock.some((x) => x > 0) ? me.club.perH : 0, perH = bizH + broH + clubH;
  out.push(h('div', { class: 'card stack vc' }, h('div', { class: 'row sp' }, h('b', null, t('acOn')), h('span', { class: 'chip good' }, t('acFeeChip', { p: A.feeBp / 100 }))),
    h('p', { class: 'small muted' }, t('acHow', { a: hours, b: hours * A.capMult, p: A.feeBp / 100 })),
    over > 0 ? row(t('acSaved'), money(over), 'c-cash') : null, over > 0 ? row(t('acCut'), '−' + money(fee), 'c-red') : null));
  out.push(h('h2', { class: 'sec' }, t('acIncome')));
  out.push(h('div', { class: 'card stack vc' }, row(t('p_biz'), money(bizH) + t('perHour')), me.bro ? row(t('p_mybro'), money(broH) + t('perHour')) : null, me.club ? row(t('p_myclub'), clubH ? t('acUpTo', { m: money(clubH) }) + t('perHour') : t('vnEmpty')) : null,
    h('div', { class: 'row sp' }, h('span', { class: 'muted' }, t('acDay')), h('b', { class: 'num vbig c-cash' }, money(perH * 24)))));
  // onde o próximo dinheiro rende mais: cada compra possível, pelo tempo que demora a pagar-se
  const picks = B.map((cfg, i) => { const b = me.biz[i]; if (!b.price) return null;
    const gain = b.n > 0 ? Math.floor(b.perH / b.n) : Math.floor((cfg.perH * (1000 + Math.min(me.stats[cfg.stat], 1000))) / 1000);
    return gain > 0 ? { i, price: b.price, gain, h: b.price / gain } : null; }).filter(Boolean).sort((x, y) => x.h - y.h);
  out.push(h('h2', { class: 'sec' }, t('acNext')));
  out.push(picks.length ? h('div', { class: 'card vlist vc' }, picks.map((x, k) => h('button', { class: 'vrow tap', on: { click: () => go('biz') } }, art('biz', B[x.i].id, 'vth'),
    h('div', { class: 'grow' }, h('b', null, list('biz')[x.i], k === 0 ? h('span', { class: 'chip good', style: 'margin-left:6px' }, t('acBest')) : null),
      h('div', { class: 'small muted num' }, moneyShort(x.price) + ' · +' + moneyShort(x.gain) + t('perHour')),
      h('div', { class: 'small num ' + (me.cash + me.bank >= x.price ? 'c-cash' : 'muted') }, t('acPays', { t: dur(x.h * 3600000) }))),
    h('span', { class: 'muted', 'aria-hidden': 'true' }, '›'))))
    : h('div', { class: 'card vc' }, h('p', { class: 'muted' }, t('acAllMax'))));
  // avisos: dinheiro parado ou em risco
  const warn = [];
  if (me.cash >= Math.max(1000, perH)) warn.push(['bank', t('acW_cash', { m: money(me.cash), p: me.bankFeeBp / 100 })]);
  if (me.club && !me.stock.some((x, d) => x > 0 && !me.hold?.includes(d))) warn.push(['stash', t('acW_club')]);
  if (me.club && me.club.till >= me.club.cap || me.bro && me.bro.cap > 0 && me.bro.till >= me.bro.cap) warn.push(['empire', t('acW_till')]);
  if (me.stk?.some((x) => x.n > 0 && !x.tp && !x.sl)) warn.push(['bolsa', t('acW_stk')]);
  if (B.some((cfg, i) => cfg.drug >= 0 && me.biz[i].n > 0 && !me.biz[i].g) && me.club) warn.push(['biz', t('acW_fab')]);
  out.push(h('h2', { class: 'sec' }, t('acWarn')));
  out.push(warn.length ? h('div', { class: 'card vlist vc' }, warn.map(([id, txt]) => h('button', { class: 'vrow tap', on: { click: () => go(id) } }, h('span', { class: 'c-gold' }, icon('bolt')), h('div', { class: 'grow small' }, txt), h('span', { class: 'muted', 'aria-hidden': 'true' }, '›'))))
    : h('div', { class: 'card vc' }, h('p', { class: 'muted' }, t('acWarnNone'))));
  return out;
}
function screenMyBro() {
  const me = S.st.me, V = S.cfg.venue, v = me.bro, H = S.cfg.hookers.list, out = [pageHead('mybro', t('mbSub'))];
  const b = busyBanner(me); if (b) out.push(b);
  if (!v) { out.push(venuePitch('bro', b)); return out; }
  const rate = (g) => Math.floor((Math.floor((V.bro.perH[g.tier] * V.volBp[v.pi]) / 10000) * (V.prices[v.pi] - V.girlBp)) / (10000 - V.girlBp));
  out.push(venueTill(v, t('mbRate', { m: moneyShort(v.perH) })));
  out.push(venuePrices('bro', v));
  out.push(h('h2', { class: 'sec' }, t('mbRooms', { a: v.girls.length, b: v.rooms })));
  out.push(v.girls.length ? h('div', { class: 'card vlist vc' }, v.girls.map((i, slot) => h('div', { class: 'vrow' }, art('putas', H[i].id, 'vth'),
    h('div', { class: 'grow' }, h('b', null, list('hookers')[i]), h('div', { class: 'small muted num' }, moneyShort(rate(H[i])) + t('perHour'))),
    h('button', { class: 'btn ghost sm', on: { click: () => { const close = sheet(h('div', { class: 'stack' }, h('h2', null, t('mbFireT', { x: list('hookers')[i] })), h('p', { class: 'muted' }, t('mbFireSub')),
      h('button', { class: 'btn danger block', on: { click: () => { close(); act('broFire', { slot }); } } }, t('mbFire')))); } } }, t('mbFire')))))
    : h('div', { class: 'card vc' }, h('p', { class: 'muted' }, t('mbNoGirls'))));
  if (v.girls.length < v.rooms) {
    out.push(h('h2', { class: 'sec' }, t('mbHire')));
    out.push(h('div', { class: 'shop' }, H.map((g, i) => [g, i]).sort((x, y) => x[0].tier - y[0].tier || x[0].min - y[0].min).map(([g, i]) => { const cost = V.bro.hire[g.tier]; return h('div', { class: 'item' }, art('putas', g.id),
      h('div', { class: 'nm' }, list('hookers')[i]), h('div', { class: 'small muted' }, t('hk_t' + g.tier)),
      h('div', { class: 'small c-cash num' }, '+' + moneyShort(rate(g)) + t('perHour')),
      h('button', { class: 'btn buy block', disabled: !!b || me.cash + me.bank < cost, on: { click: (e) => act('broHire', { i }, { el: e.currentTarget }) } }, t('buyFor', { m: moneyShort(cost) }))); })));
  } else out.push(h('div', { class: 'card vc' }, h('p', { class: 'muted' }, t('mbFull'))));
  out.push(venueUp('bro', v, v.next == null ? '' : t('mbNext', { n: V.bro.rooms[v.lvl] }), b));
  return out;
}
// ---------- bolsa ----------
const stMoney = (c) => { const v = (c / 100).toLocaleString(lang() === 'pt' ? 'pt-PT' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' }); return lang() === 'pt' ? v + '\u00a0€' : '€' + v; };
// o empurrão de uma ordem no preço (igual ao do servidor): proporcional ao tamanho, até ao teto; compra-se e vende-se já ao preço empurrado
const stImp = (k, gross) => { const W = S.cfg.world; return W ? Math.min(W.impMaxBp, Math.floor((gross * 10000) / W.co[S.cfg.stocks.list[k].id].liq)) : 0; };
const stExec = (price, k, n, side) => { const imp = stImp(k, Math.floor((n * price) / 100)); return side > 0 ? Math.ceil((price * (10000 + imp)) / 10000) : Math.max(1, Math.floor((price * (10000 - imp)) / 10000)); };
const stQuote = (price, n, k) => { const ex = k == null ? price : stExec(price, k, n, 1), g = Math.ceil((n * ex) / 100); return g + Math.ceil((g * S.cfg.stocks.feeBp) / 10000); };
// o que se sabe de uma empresa: a notícia pendente (comunicado, rumores, investigação) e o dividendo
const edHour = (t0) => new Date(t0).toLocaleString(lang() === 'pt' ? 'pt-PT' : 'en-GB', { timeZone: 'Europe/Lisbon', weekday: 'short', hour: '2-digit', minute: '2-digit' });
function stStory(c, co) {
  if (!co) return null;
  const st = co.st, rows = [];
  if (st) {
    rows.push(h('p', { class: 'stsN' }, h('b', null, t('ar_stAnn') + '. '), t('sto_' + st.s) + '. ' + t('stDue', { d: edHour(st.dueAt) }) + '.'));
    if (st.p != null) rows.push(h('p', { class: 'small' }, t('stInvg', { p: pctOf(st.p) + '%' })));
    for (const [at, said, rel] of [...(st.rum || [])].reverse()) rows.push(h('p', { class: 'small' }, h('span', { class: 'muted num' }, edHour(at) + ' · '), t('stRum', { r: pctOf(rel) + '%', x: t(said ? 'stRumOk' : 'stRumBad') })));
  } else rows.push(h('p', { class: 'small muted' }, t('stNoStory')));
  const W = S.cfg.world, cc = W && W.co[c.id];
  const mine = S.st.me.stk[S.cfg.stocks.list.indexOf(c)], got = co.div && mine && mine.n ? Math.floor((mine.n * co.div) / 100) : 0;
  if (cc && cc.r0 > 0) rows.push(h('p', { class: 'small muted' }, (co.div ? t('stDivLast', { m: stMoney(co.div) }) + (got ? ' (' + t('stDivGot', { m: money(got) }) + ')' : '') : t('stDivNone')) + ' · ' + t('stRevLast', { m: money(co.rev) })));
  return h('div', { class: 'card stack vc sts' }, ...rows);
}
const stPct = (a, b) => { const p = b ? ((a - b) / b) * 100 : 0; if (Math.abs(p) < 0.05) return (0).toFixed(1).replace('.', lang() === 'pt' ? ',' : '.') + '%'; return (p >= 0 ? '+' : '−') + Math.abs(p).toFixed(Math.abs(p) >= 100 ? 0 : 1).replace('.', lang() === 'pt' ? ',' : '.') + '%'; };
function stChart(arr, cls, w, hh) {
  const min = Math.min(...arr), max = Math.max(...arr), span = max - min || 1, n = Math.max(1, arr.length - 1);
  const xy = arr.map((v, i) => [(i / n) * w, hh - 3 - ((v - min) / span) * (hh - 6)]);
  const line = xy.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const el = svg('svg', { class: 'stch ' + cls + (arr.at(-1) >= arr[0] ? ' up' : ' down'), viewBox: `0 0 ${w} ${hh}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
  if (cls === 'big') el.append(svg('path', { class: 'ar', d: line + ` L${w} ${hh} L0 ${hh} Z` }));
  el.append(svg('path', { class: 'ln', d: line }));
  return el;
}
function screenBolsa() {
  const me = S.st.me, C = S.cfg.stocks, M = S.stocks, out = [pageHead('bolsa', S.stkSel == null ? t('stSub', { p: C.feeBp / 100 }) : null, S.stkSel != null)];
  if (!M || !M.prices.length) { out.push(h('p', { class: 'muted' }, t('loading'))); return out; }
  const inv = me.stk.reduce((x, y) => x + y.cost, 0), hold = me.stk.map((y, k) => ({ ...y, value: Math.floor((y.n * M.prices[k]) / 100) })), worth = hold.reduce((x, y) => x + y.value, 0);
  const risk = (c) => t('stRisk' + (c.vol <= 55 ? 0 : c.vol <= 90 ? 1 : 2));
  if (S.stkSel == null) {
    out.push(h('div', { class: 'card stack vc' },
      h('div', { class: 'row sp' }, h('span', { class: 'muted' }, t('stWorth')), h('b', { class: 'num vbig ' + (worth >= inv ? 'c-cash' : 'c-red') }, money(worth))),
      h('div', { class: 'row sp small' }, h('span', { class: 'muted' }, t('stInv')), h('span', { class: 'num' }, money(inv) + (inv ? ' · ' + (worth >= inv ? '+' : '−') + money(Math.abs(worth - inv)) : ''))),
      h('div', { class: 'small muted' }, M.edNext ? t('stEd') : t('stNext'), M.edNext ? h('b', { class: 'num', dataset: { left: M.edNext, long: 1 } }, leftTxt(M.edNext - now())) : h('b', { class: 'num', dataset: { left: M.nextAt } }, dur(Math.max(0, M.nextAt - now()))))));
    out.push(h('div', { class: 'small muted', style: 'text-align:right;margin:0 4px 6px' }, t('stDay')));
    out.push(h('div', { class: 'stlist' }, C.list.map((c, k) => {
      const hist = M.hist[k], pr = M.prices[k], up = pr >= hist[0];
      return h('button', { class: 'strow', on: { click: () => { S.stkSel = k; S.stkAmt = ''; S.stkMode = 'buy'; render(true); window.scrollTo({ top: 0 }); } } },
        h('div', { class: 'stnm' }, h('b', null, t('st_' + c.id)), h('span', { class: 'small muted' }, list('stCodes')[k] + (M.co && M.co[k] && M.co[k].st ? ' · ' + t('stNews') : ''))),
        stChart(hist, 'mini', 96, 34),
        h('div', { class: 'stpr' }, h('b', { class: 'num' }, stMoney(pr)), h('span', { class: 'small num ' + (up ? 'c-cash' : 'c-red') }, stPct(pr, hist[0]))),
        hold[k].n ? h('div', { class: 'styou small' }, h('span', { class: 'muted' }, t('stYours', { n: num(hold[k].n), m: money(hold[k].value) })), h('b', { class: 'num ' + (hold[k].value >= hold[k].cost ? 'c-cash' : 'c-red') }, (hold[k].value >= hold[k].cost ? '+' : '−') + money(Math.abs(hold[k].value - hold[k].cost)))) : null);
    })));
    out.push(h('p', { class: 'small muted' }, t('stCap', { m: money(me.stockCap) }) + ' ' + t('stBustNote')));
    return out;
  }
  const k = S.stkSel, c = C.list[k], hist = M.hist[k], pr = M.prices[k], H = hold[k], mode = S.stkMode === 'sell' && H.n ? 'sell' : 'buy', fee = C.feeBp;
  const cashAll = me.cash + me.bank, room = Math.max(0, me.stockCap - inv), maxBuy$ = Math.min(cashAll, room);
  const fit = (amt) => { let n = Math.floor((amt * 100 * 10000) / (pr * (10000 + fee))); while (n > 0 && stQuote(pr, n, k) > amt) n = n > 2000 ? Math.floor(n * 0.995) : n - 1; return Math.max(0, n); };
  const maxN = mode === 'buy' ? fit(maxBuy$) : H.n;
  const inp = h('input', { id: 'bamt', inputmode: 'numeric', autocomplete: 'off', enterkeyhint: 'done', value: S.stkAmt || '', placeholder: mode === 'buy' ? t('stMaxPh', { m: money(maxBuy$) }) : t('stAllPh', { n: num(H.n) }) });
  const btn = h('button', { class: 'btn block big buy stgo' }), sum = h('div', { class: 'stack', style: 'gap:6px' });
  const nOf = () => { const v = inp.value === '' ? Infinity : parseInt(inp.value, 10) || 0; return mode === 'buy' ? (v === Infinity ? maxN : Math.min(maxN, fit(Math.min(v, maxBuy$)))) : Math.min(H.n, v === Infinity ? H.n : v); };
  const row = (a, b, cls = '') => h('div', { class: 'row sp small' }, h('span', { class: 'muted' }, a), h('b', { class: 'num ' + cls }, b));
  const sync = () => {
    const n = nOf();
    if (mode === 'buy') {
      const ex = stExec(pr, k, n, 1), g = Math.ceil((n * ex) / 100), tot = stQuote(pr, n, k);
      setBtn(btn, n > 0 ? t('stBuyGo', { n: num(n), m: money(tot) }) : t('stBuyNone')); btn.disabled = n < 1;
      sum.replaceChildren(...[row(t('stGetN'), t('stShares', { n: num(n) })), row(t('stFee', { p: fee / 100 }), money(tot - g)), ex > pr ? row(t('stImpact'), money(Math.ceil((n * (ex - pr)) / 100))) : null].filter(Boolean));
      if (n < 1) { sum.replaceChildren(); if (room < Math.ceil(pr / 100) + 1) setBtn(btn, t('stCapHit')); }
    } else {
      const ex = stExec(pr, k, n, -1), g = Math.floor((n * ex) / 100), f = Math.min(g, Math.ceil((g * fee) / 10000)), got = g - f, part = n === H.n ? H.cost : Math.floor((H.cost * n) / (H.n || 1)), pl = got - part;
      setBtn(btn, t('stSellGo', { n: num(n), m: money(got) })); btn.disabled = n < 1;
      sum.replaceChildren(...[row(t('stFee', { p: fee / 100 }), money(f)), ex < pr ? row(t('stImpact'), money(Math.ceil((n * (pr - ex)) / 100))) : null, row(t('stGet'), money(got)), row(t('stPL'), (pl >= 0 ? '+' : '−') + money(Math.abs(pl)), pl >= 0 ? 'c-cash' : 'c-red')].filter(Boolean));
    }
  };
  const setV = (v) => { inp.value = v; S.stkAmt = v; sync(); };
  inp.addEventListener('input', () => setV(inp.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 15)));
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
  btn.addEventListener('click', async () => {
    const n = nOf(); if (n < 1) return; inp.blur();
    await act(mode === 'buy' ? 'stockBuy' : 'stockSell', { k, n, price: pr }, { el: btn });
    S.stkAmt = ''; loadStocks();
  });
  sync();
  out.push(h('button', { class: 'btn ghost sm', style: 'margin-bottom:10px', on: { click: () => { S.stkSel = null; render(true); } } }, '← ' + t('stBack')));
  out.push(h('div', { class: 'card stack vc' },
    h('div', { class: 'row sp' }, h('div', null, h('h2', { style: 'margin:0' }, t('st_' + c.id)), h('span', { class: 'small muted' }, list('stCodes')[k])),
      h('div', { class: 'stpr' }, h('b', { class: 'num vbig' }, stMoney(pr)), h('span', { class: 'small num ' + (pr >= hist[0] ? 'c-cash' : 'c-red') }, stPct(pr, hist[0]) + ' · ' + t('stDay')))),
    stChart([...hist, pr], 'big', 320, 120),
    h('div', { class: 'row sp small muted' }, h('span', null, t('stLaunch', { m: stMoney(c.base) })), M.edNext ? h('span', null, t('stEd'), h('b', { class: 'num', dataset: { left: M.edNext, long: 1 } }, leftTxt(M.edNext - now()))) : null)));
  out.push(h('div', { class: 'card stack vc' },
    h('div', { class: 'seg', role: 'group', style: 'margin-bottom:0' }, [['buy', t('stBuy')], ['sell', t('stSell')]].map(([id, lbl]) => h('button', { 'aria-pressed': mode === id ? 'true' : 'false', disabled: id === 'sell' && !H.n, on: { click: () => { S.stkMode = id; S.stkAmt = ''; render(true); } } }, lbl))),
    h('div', { class: 'field', style: 'margin:0' }, h('label', { for: 'bamt' }, t(mode === 'buy' ? 'stAmt' : 'stQty')), inp),
    h('div', { class: 'bquick' }, [25, 50, 75].map((q) => h('button', { class: 'btn ghost sm', disabled: maxN < 1, on: { click: () => setV(String(mode === 'buy' ? Math.floor((maxBuy$ * q) / 100) : Math.max(1, Math.floor((H.n * q) / 100)))) } }, q + '%')),
      h('button', { class: 'btn ghost sm', disabled: maxN < 1, on: { click: () => setV('') } }, t('stAll'))),
    sum, btn,
    mode === 'buy' && room < cashAll ? h('p', { class: 'small muted' }, t('stCap', { m: money(me.stockCap) })) : null));
  out.push(stStory(c, M.co && M.co[k]));
  if (H.n) out.push(h('div', { class: 'card stack vc' }, row(t('stYours', { n: num(H.n), m: money(H.value) }), (H.value >= H.cost ? '+' : '−') + money(Math.abs(H.value - H.cost)), H.value >= H.cost ? 'c-cash' : 'c-red'), row(t('stInv'), money(H.cost)),
    H.tp ? row(t('stTp'), stMoney(H.tp), 'c-cash') : null, H.sl ? row(t('stSl'), stMoney(H.sl), 'c-red') : null,
    h('button', { class: 'btn ghost block', on: { click: () => stLimitSheet(k) } }, H.tp || H.sl ? t('stLimEdit') : t('stLimSet'))));
  return out;
}
// limites de venda de uma posição: alvo de lucro e travão de perda, em percentagem sobre o preço de agora
function stLimitSheet(k) {
  const me = S.st.me, M = S.stocks, pr = M.prices[k], H = me.stk[k], avg = H.n ? Math.round((H.cost * 100) / H.n) : pr;
  let tp = H.tp || 0, sl = H.sl || 0;
  const body = h('div', { class: 'stack' });
  const pctOf = (x) => stPct(x, pr), est = (x) => { const g = Math.floor((H.n * x) / 100), got = g - Math.min(g, Math.ceil((g * S.cfg.stocks.feeBp) / 10000)); return (got >= H.cost ? '+' : '−') + money(Math.abs(got - H.cost)); };
  const draw = () => {
    const opt = (cur, list, sign, set) => h('div', { class: 'seg five lim', role: 'group' }, [0, ...list].map((p) => { const v = p ? Math.max(1, sign > 0 ? Math.ceil((pr * (100 + p)) / 100) : Math.floor((pr * (100 - p)) / 100)) : 0, ok = !p || (sign > 0 ? v > pr : v < pr && v >= 1);
      const on = p ? cur && Math.abs(cur - v) <= Math.max(1, Math.round(pr / 400)) : !cur;
      return h('button', { 'aria-pressed': on ? 'true' : 'false', disabled: !ok, on: { click: () => { set(v); draw(); } } }, p ? (sign > 0 ? '+' : '−') + p + '%' : t('stLimNo')); }));
    body.replaceChildren(h('h2', { style: 'margin:0' }, t('stLimT', { x: t('st_' + S.cfg.stocks.list[k].id) })), h('p', { class: 'small muted' }, t('stLimSub', { p: S.cfg.stocks.feeBp / 100 })),
      h('div', { class: 'row sp small' }, h('span', { class: 'muted' }, t('stLimNow')), h('b', { class: 'num' }, stMoney(pr))), h('div', { class: 'row sp small' }, h('span', { class: 'muted' }, t('stLimAvg')), h('b', { class: 'num' }, stMoney(avg))),
      h('h3', { class: 'c-cash', style: 'margin:8px 0 0' }, t('stTp')), opt(tp, [5, 10, 25, 50], 1, (v) => { tp = v; }),
      h('div', { class: 'small muted limtx' }, tp ? t('stLimAt', { m: stMoney(tp), p: pctOf(tp), g: est(tp) }) : t('stLimNone')),
      h('h3', { class: 'c-red', style: 'margin:8px 0 0' }, t('stSl')), opt(sl, [5, 10, 20, 35], -1, (v) => { sl = v; }),
      h('div', { class: 'small muted limtx' }, sl ? t('stLimAt', { m: stMoney(sl), p: pctOf(sl), g: est(sl) }) : t('stLimNone')),
      h('button', { class: 'btn buy block big', on: { click: async () => { close(); await act('stockLimit', { k, tp, sl }); loadStocks(); } } }, t('stLimSave')),
      h('p', { class: 'small muted' }, t('stLimNote')));
  };
  draw();
  const close = sheet(body);
}
// casas dos outros jogadores: só aparece o que te sai mais barato do que na cidade
const venueHead = (v) => h('div', { class: 'row sp' }, h('div', { class: 'grow', style: 'min-width:0' }, h('b', { class: 'cut' }, ownerTag(v)), h('div', { class: 'small muted' }, t('vnLvl', { n: v.lvl }))),
  h('span', { class: 'chip good num' }, (v.gang && v.bp < v.pub ? t('vnGangTag') + ' · ' : '') + v.bp / 100 + '%'));
function playerClubs(me, L, b) {
  const all = S.venues?.clubs; if (!all) return [];
  const out = [h('h2', { class: 'sec' }, t('clPlayers'))];
  const good = all.map((c) => ({ ...c, items: c.items.filter((it) => it.price < me.drugPrices[it.d]) })).filter((c) => c.items.length).slice(0, 6);
  out.good = good.length;
  if (!good.length) out.push(h('div', { class: 'card stack vc' }, h('p', { class: 'muted' }, t('clNone')), me.club ? null : h('button', { class: 'btn ghost', on: { click: () => go('myclub') } }, t('clOpen'))));
  for (const c of good) out.push(h('div', { class: 'card vlist vc' }, venueHead(c), c.items.map((it) => { const g = S.cfg.drugs[it.d];
    return h('div', { class: 'vrow' }, art('drugs', g.id, 'vth'), h('div', { class: 'grow' }, h('b', null, list('drugs')[it.d]), h('div', { class: 'small c-cash num' }, t('vnSave', { m: money(me.drugPrices[it.d] - it.price) }))),
      h('button', { class: 'btn buy sm num', disabled: !!b || !canTake(me, L, g) || me.cash + me.bank < it.price, on: { click: async (e) => { await act('clubBuy', { owner: c.name, d: it.d, price: it.price }, { el: e.currentTarget }); loadVenues(); } } }, t('vnUse') + ' · ' + money(it.price))); })));
  return out;
}
function playerBros(me, L, b) {
  const all = S.venues?.bros; if (!all) return [];
  const H = S.cfg.hookers.list, out = [h('h2', { class: 'sec' }, t('brPlayers'))];
  const good = all.map((v) => ({ ...v, girls: v.girls.filter((x) => x.price < me.hookers[x.i]) })).filter((v) => v.girls.length).slice(0, 6);
  out.good = good.length;
  if (!good.length) out.push(h('div', { class: 'card stack vc' }, h('p', { class: 'muted' }, t('brNone')), me.bro ? null : h('button', { class: 'btn ghost', on: { click: () => go('mybro') } }, t('brOpen'))));
  for (const v of good) out.push(h('div', { class: 'card vlist vc' }, venueHead(v), v.girls.map((x) => { const g = H[x.i];
    return h('div', { class: 'vrow' }, art('putas', g.id, 'vth'), h('div', { class: 'grow' }, h('b', null, list('hookers')[x.i]), h('div', { class: 'small num' }, h('span', { class: 'c-en' }, icon('bolt'), '+' + g.e), ' · ', h('span', { class: 'c-cash' }, t('vnSave', { m: money(me.hookers[x.i] - x.price) })))),
      h('button', { class: 'btn buy sm num', disabled: !!b || me.sick || L.energy >= stamMax(me) || me.cash + me.bank < x.price, on: { click: async (e) => { await act('broVisit', { owner: v.name, slot: x.slot, price: x.price }, { el: e.currentTarget }); loadVenues(); } } }, t('hkBtn') + ' · ' + money(x.price))); })));
  return out;
}

// ---------- ginásio ----------
// ---------- emprego (passo 3) ----------
// o que paga o turno n (1 a 6): os seis somam exatamente o dia (igual ao motor)
const shiftPay = (x, n) => { const P = S.cfg.jobs.perDay; return Math.floor((x.day * n) / P) - Math.floor((x.day * (n - 1)) / P); };
const hhmm = (ts) => new Date(ts).toLocaleTimeString(lang() === 'pt' ? 'pt-PT' : 'en-GB', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit' });
// a informação que um turno deu, numa frase; o nome do jogador e o dinheiro saltam à vista
function tipText(x) {
  switch (x.k) {
    case 'cash': return t('tip_cash', { a: x.a, m: money(x.m) });
    case 'guard': return t('tip_guard', { a: x.a, m: money(x.m) });
    case 'hosp': return t('tip_hosp', { a: x.a, h: hhmm(x.until), m: money(x.m) });
    case 'jail': return t('tip_jail', { a: x.a, h: hhmm(x.until), m: money(x.m) });
    case 'stock': return t(x.p > 0 ? 'tip_stockUp' : 'tip_stockDown', { x: t('st_' + S.cfg.stocks.list[x.s].id), p: Math.abs(x.p) });
    case 'club': return t('tip_club', { a: x.a, x: list('drugs')[x.d], p: Math.round(x.bp / 100) });
    default: return t('tip_none');
  }
}
const TIP_GO = { cash: 'fights', guard: 'fights', hosp: 'fights', jail: 'fights', stock: 'bolsa', club: 'club' };
const tipRow = (x) => TIP_GO[x.k]
  ? h('button', { class: 'vrow tap tipr', on: { click: () => go(TIP_GO[x.k]) } }, h('span', { class: 'small muted num tipt' }, hhmm(x.t)), h('p', { class: 'grow' }, tint(tipText(x))), h('span', { class: 'muted', 'aria-hidden': 'true' }, '›'))
  : h('div', { class: 'vrow tipr' }, h('span', { class: 'small muted num tipt' }, hhmm(x.t)), h('p', { class: 'grow' }, tint(tipText(x))));
function screenJob() {
  const me = S.st.me, L = live(me), J = S.cfg.jobs, cur = J.list[me.job], feitos = me.shifts || 0, cash = me.cash + me.bank;
  const out = [pageHead('job', null, !!cur)];   // com emprego, a imagem do emprego faz de capa
  const b = busyBanner(me); if (b) out.push(b);
  if (cur) {
    const fim = feitos >= J.perDay, semE = L.vigor < J.shiftE;
    out.push(h('div', { class: 'jobp jbc' },
      h('div', { class: 'jimg' }, h('img', { src: IMG('jobs', cur.id, 1), alt: '', width: 1100, height: 1100, decoding: 'async', on: { error: (e) => e.currentTarget.remove() } }), h('h2', null, t('jb_' + cur.id))),
      h('div', { class: 'jdeal' },
        fim ? h('div', null, h('span', null, t('jbPaidToday')), h('b', { class: 'num c-cash' }, money(cur.day)))
          : h('div', null, h('span', null, t('jbNext')), h('b', { class: 'num c-cash' }, money(shiftPay(cur, feitos + 1)))),
        h('div', null, h('span', null, t('jbToday')), h('b', { class: 'num' }, feitos + '/' + J.perDay))),
      h('p', { class: 'jinfo' }, t('jbTipIs_' + cur.tip)),
      fim ? null : h('div', { class: 'jgive num' }, h('span', { class: 'c-vg' }, t('jbCostE', { e: J.shiftE })), h('span', { class: 'c-cash' }, t('jbGetM', { m: money(shiftPay(cur, feitos + 1)) })), h('span', { class: 'c-resp' }, t('r_resp', { n: J.resp }))),
      h('button', { class: 'btn rob block big', disabled: !!b || fim || semE, on: { click: (e) => act('shift', {}, { el: e.currentTarget }) } },
        fim ? t('jbDoneToday') : semE ? t('jbNoVigor') : t('jbGo')),
      // a informação do último turno, logo por baixo do botão (é a recompensa que interessa)
      me.jt && me.jt[0] ? h(TIP_GO[me.jt[0].k] ? 'button' : 'div', { class: 'jlast', on: TIP_GO[me.jt[0].k] ? { click: () => go(TIP_GO[me.jt[0].k]) } : undefined },
        h('small', null, t('jbLast', { h: hhmm(me.jt[0].t) })), tint(tipText(me.jt[0]))) : null,
      h('p', { class: 'jcost' }, t('jbPay', { m: money(cur.day), n: J.perDay }))));
    if (me.jt && me.jt.length > 1) out.push(h('h2', { class: 'sec' }, t('jbTips')), h('div', { class: 'card vlist vc tipl' }, me.jt.slice(1).map(tipRow)));
  } else out.push(h('div', { class: 'note' }, h('p', null, t('jbSub')), h('p', null, t('jbNone'))));
  let bestOpen = -1; J.list.forEach((x, i) => { if ((!x.course || me.done.includes(x.course)) && (bestOpen < 0 || x.day > J.list[bestOpen].day)) bestOpen = i; });
  // os empregos: os que já dá para ter e os que pedem um curso
  out.push(h('h2', { class: 'sec' }, t('jbAll')));
  out.push(h('div', { class: 'card vlist vc jbl' }, J.list.map((x, i) => {
    const open = !x.course || me.done.includes(x.course);
    return h('div', { class: 'vrow jbr' + (open ? '' : ' dim') }, art('jobs', x.id, 'vth'),
      h('div', { class: 'grow' }, h('b', null, t('jb_' + x.id)),
        h('div', { class: 'small num' }, h('span', { class: 'c-cash' }, t('jbDay', { m: money(x.day) }))),
        open ? h('div', { class: 'small muted' }, t('jbTipShort_' + x.tip))
          : h('button', { class: 'jneed', on: { click: () => document.getElementById('cursos')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) } }, t('jbNeeds', { x: t('cr_' + x.course) }) + ' ›')),
      i === me.job ? h('span', { class: 'small c-cash' }, t('jbHere'))
        : open ? h('button', { class: 'btn sm ' + (!cur && i === bestOpen ? 'buy' : 'ghost'), on: { click: (e) => act('job', { i }, { el: e.currentTarget }) } }, t('jbPick')) : null);
  })));
  // cursos: um de cada vez, pagos à cabeça, em tempo real
  out.push(h('h2', { class: 'sec', id: 'cursos' }, t('crTitle')), h('p', { class: 'small muted', style: 'margin:-4px 2px 10px' }, t('crSub')));
  out.push(h('div', { class: 'card vlist vc crl' }, S.cfg.courses.map((c) => {
    const feito = me.done.includes(c.id), aDecorrer = me.course && me.course.id === c.id;
    const falta = c.needs && !me.done.includes(c.needs) ? t('crNeeds', { x: t('cr_' + c.needs) }) : c.level && me.level < c.level ? t('opensAt', { n: c.level }) : null;
    const pode = !feito && !me.course && !falta && cash >= c.price;
    return h('div', { class: 'vrow crr' + (falta && !feito ? ' dim' : '') },
      h('div', { class: 'grow' }, h('b', null, t('cr_' + c.id)),
        h('div', { class: 'small muted num' }, money(c.price) + ' · ' + t('crDays', { n: c.days }) + ' · ' + t('crOpens', { x: t('jb_' + J.list.find((x) => x.course === c.id).id) })),
        aDecorrer ? h('div', { class: 'small' }, t('crLeft'), ' ', h('span', { class: 'num crl2', dataset: { left: me.course.end } }, dur(me.course.end - now()))) : null,
        aDecorrer ? h('div', { class: 'fill' }, h('i', { style: `width:${Math.max(2, Math.min(100, 100 - ((me.course.end - now()) / (c.days * 864e5)) * 100))}%;background:var(--cash)` })) : null,
        falta && !feito ? h('div', { class: 'small muted' }, falta) : null),
      feito ? h('span', { class: 'small c-cash' }, t('crDone'))
        : aDecorrer || falta ? null
        : me.course ? h('span', { class: 'small muted' }, t('crOneAtATime'))
        : cash < c.price ? h('span', { class: 'small muted num' }, t('needMoney', { m: money(c.price - cash) }))
        : h('button', { class: 'btn ghost sm num', disabled: !pode, on: { click: (e) => act('course', { id: c.id }, { el: e.currentTarget }) } }, t('crGo')));
  })));
  // a profissão (ladrão, vigarista…) muda-se aqui ao lado
  out.push(h('button', { class: 'card row tap stlink', style: 'margin-top:14px', on: { click: () => go('work') } },
    h('span', { class: 'grow' }, t('jbClass', { x: me.cls ? t('cl_' + me.cls) : '—' })), h('span', { class: 'muted', 'aria-hidden': 'true' }, '›')));
  return out;
}

function screenGym() {
  const me = S.st.me, L = live(me), E = S.cfg.train.energy;
  const out = [pageHead('gym', t('gymSub', { e: E }))];
  const b = busyBanner(me); if (b) out.push(b);
  out.push(h('div', { class: 'card meters' }, meter(t('vigor'), L.vigor, vigMax(), 'vg'), h('p', { class: 'small muted' }, t('vigorSub'))));
  out.push(h('div', { class: 'power' },
    h('div', { class: 'card' }, h('b', null, icon('fist'), short(me.attack)), h('span', { class: 'small muted' }, t('attackPower'))),
    h('div', { class: 'card' }, h('b', null, icon('shield'), short(me.defense)), h('span', { class: 'small muted' }, t('defensePower')))));
  out.push(h('div', { class: 'shop' }, ['F', 'I', 'C', 'T'].map((s) => {
    const train = async (e, n) => { const el = e.currentTarget; for (let i = 0; i < n; i++) { const r = await act('train', { stat: s }, { el }); if (!r) break; } };
    return h('div', { class: 'item' }, art('stats', s),
      h('div', { class: 'nm' }, icon(STAT_IC[s]), ' ', t('stat' + s), ' ', h('b', { class: 'num' }, num(me.stats[s]))),
      h('p', { class: 'small muted' }, t('stat' + s + 'd')),
      me.xp && s !== 'T' ? h('div', { class: 'fill', title: t('practiceLbl') }, h('i', { style: `width:${Math.min(100, (me.xp[s] / me.xpNeed[s]) * 100)}%;background:var(--energy)` })) : null,
      h('div', { class: 'row gymr' }, h('button', { class: 'btn buy grow', disabled: !!b || L.vigor < E, on: { click: (e) => train(e, 1) } }, t('train')),
        h('button', { class: 'btn', disabled: !!b || L.vigor < 5 * E, on: { click: (e) => train(e, 5) } }, t('trainX5'))));
  })));
  return out;
}

// ---------- negócios ----------
function screenBiz() {
  const me = S.st.me, B = S.cfg.biz;
  const out = [pageHead('biz', t('empireSub'))];
  const total = me.biz.reduce((s, b, i) => s + bizNet(b, i), 0);
  if (me.biz.some((b) => b.n > 0)) out.push(h('div', { class: 'collect' }, h('button', { class: 'btn buy get block big', dataset: { total: 1 }, disabled: total <= 0,
    on: { click: (e) => act('collect', { port: false }, { el: e.currentTarget }) } }, total > 0 ? t('collect', { m: money(total) }) : t('nothingToCollect'))));
  if (me.biz.some((b, i) => b.g && B[i].drug >= 0)) out.push(h('button', { class: 'card row tap stlink', on: { click: () => go('stash') } }, icon('pill'), h('span', { class: 'grow' }, t('bizToStash')), h('span', { class: 'muted', 'aria-hidden': 'true' }, '›')));
  out.push(h('div', { class: 'shop' }, B.map((cfg, i) => {
    const b = me.biz[i];
    const cap = bizCap(b);
    const stored = storedNow(b, i), fee = bizFeeOf(b, stored);
    const unitPerH = Math.floor(cfg.perH * (1000 + Math.min(me.stats[cfg.stat], 1000)) / 1000);
    const fill = cap ? Math.min(1, stored / cap) : 0;
    return h('div', { class: 'item' },
      h('div', { class: 'bscene ' + cfg.id + (b.n > 0 ? ' on' : '') + (fill >= 1 ? ' full' : ''), dataset: { biz: i }, style: `--fill:${fill.toFixed(3)}` }, art('biz', cfg.id, 'pic'), b.n > 0 ? bizAnim(cfg.id) : null,
        b.n > 0 ? h('span', { class: 'cnt num' }, '×' + b.n) : null),
      h('div', { class: 'nm' }, list('biz')[i]),
      b.n > 0 ? h('div', { class: 'small' }, h('b', { class: 'c-cash num', dataset: { stored: i } }, money(stored - fee)), h('span', { class: 'muted num' }, ' · ' + moneyShort(b.perH) + t('perHour')))
        : h('div', { class: 'small muted' }, '+' + moneyShort(unitPerH) + t('perHour') + ' · +' + cfg.resp + ' ' + t('respect').toLowerCase()),
      b.n > 0 ? h('div', { class: 'fill big' + (fill >= 1 ? ' full' : ''), dataset: { fill: i } }, h('i', { style: `width:${fill * 100}%` })) : null,
      b.n > 0 ? h('div', { class: 'small muted', dataset: { fillTxt: i } }, fill >= 1 ? t('storageFull') : t('storage', { p: Math.floor(fill * 100) })) : null,
      h('div', { class: 'small ' + (cfg.toBank ? 'muted' : 'c-red') }, cfg.toBank ? t('legal') : t('raidRisk')),
      cfg.drug >= 0 && b.n > 0 ? h('div', { class: 'seg bzg', role: 'group', 'aria-label': t('bizOut') },
        h('button', { 'aria-pressed': b.g ? 'false' : 'true', on: { click: () => { if (b.g) act('bizGoods', { i, on: false }); } } }, t('bizOutCash')),
        h('button', { 'aria-pressed': b.g ? 'true' : 'false', on: { click: () => { if (!b.g) act('bizGoods', { i, on: true }); } } }, list('drugs')[cfg.drug])) : null,
      cfg.drug >= 0 && b.n === 0 ? h('div', { class: 'small c-vice' }, t('bizFactory', { x: list('drugs')[cfg.drug] })) : null,
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
    const g = svg('g', { class: 'ship', 'data-ready': c.readyAt, 'data-i': i, 'data-ms': S.cfg.port.ships[shipOf(c)].ms });
    g.append(svg('path', { d: 'M-8 1l2.5 5h11l2.5-5zM-4.5 1v-5h9v5M-1-4v-3.5h2.5v3.5' }));
    s.append(g);
  });
  return h('div', { class: 'pmapbox' }, s);
}
function tickShips() {
  document.querySelectorAll('.pmap').forEach((m) => {
    const route = m.querySelector('.route'), L = route.getTotalLength(); let far = 0;
    m.querySelectorAll('.ship').forEach((g) => {
      const pr = Math.min(1, Math.max(0, 1 - (+g.dataset.ready - now()) / +g.dataset.ms)), pt = route.getPointAtLength(pr * L);
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
      h('div', { class: 'grow' }, h('div', null, !L.seized && L.units !== undefined ? t('airKept', { n: L.units, x: list('drugs')[L.d] }) + (L.rest ? t('airKeptRest', { m: money(L.rest) }) : '') + (L.over ? ' ' + t('ctOver', { q: qty(L.d, L.over), m: money(L.overGot) }) : '') : t(L.seized ? 'airLost' : 'airGot', { x: t('ar_' + R.id), m: money(L.seized ? L.amount : L.got), g: money(L.got - L.amount) })), L.seized ? null : h('div', { class: 'small muted' }, t('airResp', { n: L.respect })))));
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
      left > 0 ? h('button', { class: 'btn buy block big', disabled: true }, t('airWait')) : null,
      ...(left > 0 ? [] : [[false, t('airSell', { m: moneyShort(back) }), 'buy'], [true, t('airKeep', { n: Math.floor(back / wholesaleOf(S.cfg.drugs.findIndex((d) => d.id === R.drug))), x: drugName(R) }), 'pri']].map(([keep, lbl, cls]) =>
        h('button', { class: 'btn ' + cls + ' block big', on: { click: async (e) => { const o = await act('airCollect', { keep }, { el: e.currentTarget }); if (o) { S.airLast = o.result; fx.sfx(o.result.seized ? 'bust' : 'cash'); G.flight(null); render(true); } } } }, lbl))),
      left > 0 ? null : h('p', { class: 'small muted' }, t('airKeepSub', { p: Math.round((10000 / S.cfg.goods.wholesaleBp - 1) * 100) }))));
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
    setBtn(btn, t('airGo', { m: moneyShort(a + extra) })); btn.disabled = !!b || a < A.minAmount || S.st.round.playEnd - now() < R.ms;
    sum.replaceChildren(
      h('div', { class: 'row sp small' }, h('span', { class: 'muted' }, t('airIfOk')), h('b', { class: 'num c-cash' }, money(a + gain) + ' (+' + money(gain) + ')')),
      h('div', { class: 'row sp small' }, h('span', { class: 'muted' }, t('airIfBad')), h('b', { class: 'num c-red' }, '−' + money(a + extra) + ' · ' + pctBp(risk))),
      extra ? h('div', { class: 'row sp small' }, h('span', { class: 'muted' }, t('airBribeCost')), h('b', { class: 'num' }, money(extra))) : '');
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
// ---------- porto: carregamentos ----------
// Um menu como o dos golpes: cada barco traz a sua droga, com o seu tempo, o seu lucro e o seu risco. Tocar num abre a folha para escolher quanto e como.
const shipOf = (c) => (Number.isInteger(c.k) && S.cfg.port.ships[c.k] ? c.k : S.cfg.port.legacy);
const hrs = (ms) => String(ms / 3600000).replace('.', lang() === 'pt' ? ',' : '.') + ' h';
const riskTxt = (bp) => String(bp / 100).replace('.', lang() === 'pt' ? ',' : '.') + '%';
const riskCls = (bp) => (bp <= 700 ? 'hi' : bp <= 1300 ? 'mid' : 'lo');
function screenPort() {
  const me = S.st.me, P = S.cfg.port, names = list('ships');
  const out = [pageHead('port', t('portSub'))];
  out.push(portMap(me));
  // o que acabaste de abrir (até três): barco, o que tinhas enviado e o que saiu de lá
  if (S.portLast?.length) out.push(h('div', { class: 'note stack plast' }, S.portLast.map((c) => h('div', { class: 'row sp' },
    h('div', { class: 'grow' }, h('b', null, names[c.k] ?? ''), h('div', { class: 'small muted num' }, t('ctSent', { m: money(c.amount) }))),
    c.seized ? h('b', { class: 'c-red num' }, '−' + money(c.amount)) : c.units !== undefined ? h('b', { class: 'c-cash num' }, t('portGoodsRow', { n: num(c.units), x: list('drugs')[c.d] })) : h('b', { class: 'c-cash num' }, '+' + money(c.got - c.amount))))));
  // no mar: o que já enviaste
  const pc = h('div', { class: 'card stack' }, h('div', { class: 'row sp' }, h('b', null, t('portSailing')), h('span', { class: 'small muted' }, t('slots', { a: me.port.length, b: me.portSlots }))));
  if (!me.port.length) pc.append(h('p', { class: 'small muted' }, t('portNone')));
  for (const c of me.port) {
    const left = c.readyAt - now(), k = shipOf(c);
    const info = [art('port', P.ships[k].id, 'vth'), h('div', { class: 'grow' }, h('b', null, names[k]), h('div', { class: 'small muted num' }, money(c.amount) + (c.d !== undefined ? ' · ' + list('drugs')[c.d] : '')))];
    // chegou: a linha inteira é o botão que abre o contentor (só aí se sabe se a polícia o apanhou)
    if (left <= 0) pc.append(h('button', { class: 'cont rdy', on: { click: () => openCargo(c) } }, ...info, h('span', { class: 'open' }, t('ctOpen'))));
    else pc.append(h('div', { class: 'cont' }, ...info, h('span', { class: 'small muted', style: 'text-align:right' }, t('arrivesIn', { t: '' }), h('b', { class: 'num', dataset: { left: c.readyAt } }, dur(left)))));
  }
  out.push(pc);
  // os carregamentos
  out.push(h('h2', { class: 'sec' }, t('portShips')));
  out.push(h('div', { class: 'rows' }, P.ships.map((s, k) => {
    const locked = me.level < s.level, risk = me.portRisk[k];
    const body = [art('port', s.id),
      h('div', { class: 'mid' }, h('div', { class: 'nm' }, names[k]),
        locked ? h('div', { class: 'meta' }, icon('lock'), ' ', t('needLevel', { n: s.level }))
          : h('div', { class: 'meta' }, h('span', { class: 'c-en' }, icon('timer'), ' ' + hrs(s.ms)), h('span', { class: 'c-cash' }, '+' + s.gainBp / 100 + '%'), h('span', { class: 'c-vice' }, icon('pill'), ' ' + list('drugs')[s.drug]))),
      h('div', { class: 'pct risk ' + riskCls(risk) }, riskTxt(risk), h('small', null, t('risk')))];
    return locked ? h('div', { class: 'rowi lock' }, ...body) : h('button', { class: 'rowi', on: { click: () => shipSheet(k) } }, ...body);
  })));
  return out;
}
// Abrir um contentor que chegou: a cena de reveal.js com o resultado verdadeiro, pedido ao servidor no toque.
// Cada barco tem a sua transportadora (nome inventado) e a sua cor de contentor. Nenhuma é verde nem vermelha:
// essas duas cores ficam para dizer se correu bem ou mal.
const SHIP_SKIN = [['MARALTO', '#3f7f93'], ['VELOZ', '#2b63b3'], ['NOTURNA', '#c4621d'], ['TRANSMAR', '#a67c12'], ['ATLANTIS', '#7a4630'], ['ABISSAL', '#4b5565']];
function openCargo(c, seq) {
  const k = shipOf(c), nome = list('ships')[k], dn = c.d !== undefined ? list('drugs')[c.d] : null, [marca, cor] = SHIP_SKIN[k % SHIP_SKIN.length];
  const cod = String((c.readyAt + k * 7919) % 1000000).padStart(6, '0'), rato = matchMedia('(hover: hover) and (pointer: fine)').matches;
  seq ||= { i: 1, n: S.st.me.port.filter((x) => x.readyAt <= now()).length };
  if (dn) new Image().src = IMG('drugs', S.cfg.drugs[c.d].id);   // a imagem da droga já vem a caminho quando as portas abrirem
  RV.caixa({
    pele: RV.contentor({ cor, marca, codigo: [marca.slice(0, 3) + 'U', cod.slice(0, 3) + ' ' + cod.slice(3)] }),
    fundo: IMG('cenas', 'porto', 1), passo: seq.n > 1 ? t('ctStep', { i: seq.i, n: seq.n }) : '', titulo: nome, sub: t('ctSent', { m: money(c.amount) }) + (dn ? ' · ' + dn : ''),
    toque: t(rato ? 'ctClick' : 'ctTap'), aCortar: t('ctBusy'), rotulo: t('ctAria'), sair: t('close'),
    pedir: async () => { const out = await act('portOpen', { at: c.readyAt }); return out ? out.result : null; },
    mostrar: ({ item: it }) => (it.seized ? { tom: 'lost', de: 0, ate: it.amount, fmt: (v) => '−' + money(v), linha: t('ctLost'), fita: t('ctTape') }
      : it.units !== undefined ? { tom: 'goods', de: 0, ate: it.units, fmt: (v) => '+' + num(v), linha: t('ctGoodsLine', { x: list('drugs')[it.d], ...rgF(it.rg || 'lx') }),
        sub: [it.over > 0 ? t('ctOver', { q: qty(it.d, it.over), m: money(it.overGot) }) : '', it.rest > 0 ? t('ctRest', { m: money(it.rest) }) : ''].filter(Boolean).join(' '), img: IMG('drugs', S.cfg.drugs[it.d].id) }
      : { tom: 'cash', de: 0, ate: it.got - it.amount, fmt: (v) => '+' + money(v), linha: t('ctBack', { m: money(it.got) }), notas: Math.max(4, Math.min(14, Math.round(Math.log10(Math.max(10, it.got)) * 2.4))) }),
    // o botão de seguir só vem a verde quando o resultado foi bom; depois de uma apreensão fica neutro
    botoes: (r) => { const prox = S.st.me.port.find((x) => x.readyAt <= now()), cls = r.item.seized ? 'btn lite' : 'btn cash';
      return prox ? [{ texto: t('close'), cls: 'btn ghost' }, { texto: r.left > 1 ? t('ctNext') : t('ctLast'), cls, fazer: () => openCargo(prox, { i: seq.i + 1, n: seq.n }) }] : [{ texto: t('ctDone'), cls }]; },
  }).then((r) => {   // ao fechar, o dinheiro que voltou voa para o topo (a contagem lá em cima já está certa)
    if (!r || r.item.seized || r.item.units !== undefined || !S.hud.cash || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    fx.bills({ left: innerWidth / 2 - 10, top: innerHeight * 0.45, width: 20, height: 20 }, S.hud.cash, 8); fx.pop(S.hud.cash); fx.sfx('cash');
  });
}
// a folha de um carregamento: o que é, quanto mandas, se volta em dinheiro ou em droga, e o que acontece nos dois casos
function shipSheet(k) {
  const me = S.st.me, P = S.cfg.port, s = P.ships[k], dn = list('drugs')[s.drug], risk = me.portRisk[k], liquid = me.cash + me.bank;
  // um quarto, metade ou tudo do que podes mandar (o teu limite por carregamento, ou o dinheiro que tens se for menos)
  const teto = Math.min(me.portCap, liquid), opts = [0.25, 0.5, 1].map((f) => Math.floor(teto * f)).filter((v, i, a) => v >= P.minAmount && a.indexOf(v) === i);
  let goods = !!S.portGoods, amount = opts[opts.length - 1] || 0;
  const full = me.port.length >= me.portSlots, late = S.st.round.playEnd - now() < s.ms, why = full ? t('shFull') : late ? t('portEnding') : !opts.length ? t('portMin', { m: money(P.minAmount) }) : '';
  const rg = s.rg || 'lx', noWh = !me.wh?.[rg];   // em droga, o barco descarrega no armazém da região onde chega
  if (noWh) goods = false;   // sem armazém lá, começa em dinheiro
  const body = h('div', { class: 'stack' });
  const row = (a, b, cls) => h('div', { class: 'row sp' }, h('span', { class: 'muted' }, a), h('b', { class: 'num ' + cls }, b));
  const draw = () => {
    const back = amount + Math.floor((amount * s.gainBp) / 10000), units = Math.floor(back / wholesaleOf(s.drug));
    body.replaceChildren(...[   // (o replaceChildren escreve «null» se lhe passarem um vazio: filtra-se antes)
      h('div', { class: 'shiphd' }, art('port', s.id, 'shimg'), h('div', { class: 'grow' }, h('h2', { style: 'margin:0' }, list('ships')[k]), h('p', { class: 'small muted', style: 'margin:4px 0 0' }, t('shd_' + s.id)),
        h('p', { class: 'small', style: 'margin:4px 0 0' }, t('portLands', rgF(rg))))),
      // os quatro números lado a lado, como no cartão do golpe: o nome em cima, o número grande por baixo
      h('div', { class: 'jdeal four' },
        h('div', null, h('span', null, t('shTime')), h('b', { class: 'num' }, hrs(s.ms))),
        h('div', null, h('span', null, t('shProfit')), h('b', { class: 'num c-cash' }, '+' + s.gainBp / 100 + '%')),
        h('div', null, h('span', null, t('risk')), h('b', { class: 'num ' + riskCls(risk) }, riskTxt(risk))),
        h('div', null, h('span', null, t('shCargo')), h('b', { class: 'shdrug' }, dn))),
      why ? h('p', { class: 'small c-gold' }, why) : null,
      !why ? h('div', { class: 'seg', role: 'group', style: 'margin-bottom:0' }, [[false, t('portCash')], [true, t('portGoods', { x: dn.toLowerCase() })]].map(([v, lbl]) => h('button', { 'aria-pressed': goods === v ? 'true' : 'false', on: { click: () => { goods = v; S.portGoods = v; draw(); } } }, lbl))) : null,
      !why && goods ? (noWh ? h('div', { class: 'stack', style: 'gap:8px' }, h('p', { class: 'small c-red', style: 'margin:0' }, t('portNoWh', { x: dn.toLowerCase(), ...rgF(rg) })),
        h('button', { class: 'btn ghost', on: { click: () => { close(); S.reg = rg; go('stash'); S.reg = rg; render(); } } }, t('portToWh') + ' ›'))
        : h('p', { class: 'small muted' }, t('portGoodsSub', { x: dn, ...rgF(rg) }))) : null,
      !why && opts.length > 1 ? h('div', { class: 'seg', role: 'group', style: 'margin-bottom:0', 'aria-label': t('shAmount') }, opts.map((v) => h('button', { 'aria-pressed': amount === v ? 'true' : 'false', on: { click: () => { amount = v; draw(); } } }, moneyShort(v)))) : null,
      !why ? h('div', { class: 'card stack shsum' }, row(t('shIfOk', { p: riskTxt(10000 - risk) }), goods ? t('rgMvRow', { q: qty(s.drug, units), x: dn.toLowerCase() }) : '+' + money(back - amount), 'c-cash'), row(t('shIfLost', { p: riskTxt(risk) }), '−' + money(amount), 'c-red')) : null,
      h('button', { class: 'btn buy block big', disabled: !!why || (goods && noWh), on: { click: async () => { close(); await act('port', { k, amount, goods }); } } }, why ? t('shSend') : t('ship', { m: money(amount) }))].filter(Boolean));
  };
  draw();
  const close = sheet(body);
}

// ---------- armas ----------
const plusPct = (bp) => '+' + pctOf(bp) + '%';
// o que uma peça faz, numa frase curta
function gearFx(g) {
  if (g.atk) return t('fxAtk', { p: pctOf(g.atk) });
  if (g.def) return t('fxDef', { p: pctOf(g.def) });
  if (g.room) return t('fxRoom', { n: g.room });
  if (g.bustBp) return t('fxBust', { a: Math.round(10000 / g.bustBp), b: Math.round(10000 / S.cfg.bustBp) });
  return '';
}
// uma linha de equipamento: no corpo, no inventário (usar) ou na loja (comprar). Sem cartões iguais: uma lista.
function gearRow(me, g) {
  const worn = me.eq[g.slot] && me.eq[g.slot].id === g.id ? me.eq[g.slot] : null, held = worn ? -1 : me.inv.findIndex((x) => x.id === g.id);
  const lock = me.level < (g.level || 1), cash = me.cash + me.bank, swap = me.eq[g.slot] && !worn && invFull(me);
  const info = [gearFx(g)].concat(g.gun ? [t('fxLife', { n: g.life })] : []).join(' · ');
  let right = null, extra = null;
  if (worn) {
    const gasta = g.gun && !(worn.u > 0);
    extra = h('div', { class: 'small num' }, h('span', { class: gasta ? 'c-red' : 'c-cash' }, gasta ? t('gunWorn') : t('inUse')),
      g.gun && !gasta ? ' · ' + t('usesLeft', { u: worn.u, l: g.life }) : null, g.gun && worn.u < g.life ? h('span', { class: 'muted' }, ' · ' + t('repairCost', { m: money(me.repair[g.slot]) })) : null);
    if (g.gun && worn.u < g.life) right = h('button', { class: 'btn sm ' + (gasta ? 'buy' : 'ghost'), disabled: cash < me.repair[g.slot], on: { click: (e) => act('repair', { slot: g.slot }, { el: e.currentTarget }) } }, t('repairBtn'));
  } else if (held >= 0) {
    extra = h('div', { class: 'small muted' }, t('inInv'));
    right = h('button', { class: 'btn sm ghost', on: { click: (e) => act('equip', { i: held }, { el: e.currentTarget }) } }, t('useBtn'));
  } else if (lock) right = h('span', { class: 'small muted' }, t('arNeedLvl', { n: g.level }));
  else {
    if (swap) extra = h('div', { class: 'small c-red' }, t('noRoomSwap'));
    // o botão tem o preço: é a etiqueta de uma loja
    right = h('button', { class: 'btn sm ghost num', 'aria-label': t('buyAria', { x: t('g_' + g.id), m: money(g.price) }), disabled: cash < g.price || swap, on: { click: (e) => act('buy', { id: g.id }, { el: e.currentTarget }) } }, t('buy') + ' · ' + money(g.price));
  }
  return h('div', { class: 'vrow jbr' + (lock && !worn ? ' dim' : '') }, art('gear', g.id, 'vth'),
    h('div', { class: 'grow' }, h('b', null, t('g_' + g.id)), h('div', { class: 'small' }, info), extra), right);
}
// as armas de gangue e os guardas continuam por ordem, uma de cada vez
function stepRow(me, kind, g, i, name, fx, folder, names) {
  const cur = me[kind] ?? -1, lock = me.level < (g.level || 1), next = i === cur + 1, cash = me.cash + me.bank;
  const right = i === cur ? h('span', { class: 'small c-cash' }, t('inUse')) : i < cur ? h('span', { class: 'small muted' }, t('owned'))
    : lock ? h('span', { class: 'small muted' }, t('arNeedLvl', { n: g.level }))
    : next ? h('button', { class: 'btn sm ghost num', 'aria-label': t('buyAria', { x: name, m: money(g.price) }), disabled: cash < g.price, on: { click: (e) => act('gear', { kind, idx: i }, { el: e.currentTarget }) } }, t('buy') + ' · ' + money(g.price)) : null;
  return h('div', { class: 'vrow jbr' + (i > cur + 1 ? ' dim' : '') }, art(folder, i, 'vth'),
    h('div', { class: 'grow' }, h('b', null, name), h('div', { class: 'small' }, fx),
      i > cur + 1 && !lock ? h('div', { class: 'small muted num' }, money(g.price) + ' · ' + t('stepFirst', { x: names[cur + 1] })) : null), right);
}
function screenArms() {
  const me = S.st.me, G = S.cfg.gear, H = S.cfg.hitman, B = S.cfg.bullets, cash = me.cash + me.bank;
  const seg = ['fight', 'gang', 'def'].includes(S.armsSeg) ? S.armsSeg : 'fight';
  const out = [pageHead('arms', t('s_arms'))];
  out.push(h('div', { class: 'seg armseg', role: 'group' }, [['fight', t('arFight')], ['def', t('arDef')], ['gang', t('arGang')]].map(([id, lbl]) =>
    h('button', { 'aria-pressed': seg === id ? 'true' : 'false', on: { click: () => { S.armsSeg = id; render(); } } }, lbl))));
  const sub = (txt) => h('p', { class: 'small muted', style: 'margin:-4px 2px 10px' }, txt);
  const list2 = (rows) => h('div', { class: 'card vlist vc jbl' }, rows);
  if (seg === 'fight') {
    out.push(h('div', { class: 'armsum row sp' }, h('span', null, t('arAtkNow')), h('b', { class: 'num' }, plusPct(me.atkBp || 0))), sub(t('arFightSub')));
    for (const sl of ['branca', 'mao', 'principal']) out.push(h('h2', { class: 'sec' }, t('sl_' + sl)), list2(G.filter((g) => g.slot === sl).map((g) => gearRow(me, g))));
    // balas: às caixas; sem espaço no inventário só se juntam às que já tens
    const have = invN(me, 'balas'), room = have > 0 || !invFull(me);
    out.push(h('h2', { class: 'sec' }, t('g_balas')), list2([h('div', { class: 'vrow jbr blr' }, art('gear', 'balas', 'vth'),
      h('div', { class: 'grow' }, h('b', { class: 'num' }, t('haveBullets', { n: num(have) })), h('div', { class: 'small' }, t('bulletsSub', { b: B.box, n: B.perJob })),
        room ? null : h('div', { class: 'small c-red' }, t('noRoom'))),
      h('div', { class: 'boxb' }, [1, 4].map((n) => h('button', { class: 'btn sm ghost num', disabled: !room || cash < n * B.price, on: { click: (e) => act('buy', { id: 'balas', n }, { el: e.currentTarget }) } }, t('boxBtn', { n: num(n * B.box), m: money(n * B.price) })))))]));
  } else if (seg === 'def') {
    out.push(h('div', { class: 'armsum row sp' }, h('span', null, t('arDefNow')), h('b', { class: 'num' }, plusPct(me.defBp || 0))), sub(t('arArmorSub')));
    out.push(list2(['cabeca', 'tronco', 'pernas', 'pes', 'maos'].flatMap((sl) => [h('h3', { class: 'hkt' }, t('sl_' + sl)), ...G.filter((g) => g.slot === sl).map((g) => gearRow(me, g))])));
    out.push(h('h2', { class: 'sec' }, t('sl_acess')), sub(t('arAccSub')), list2(G.filter((g) => g.slot === 'acess').map((g) => gearRow(me, g))));
    out.push(h('h2', { class: 'sec' }, t('guards')), sub(t('guardsSub', { p: H.baseBp / 100 })),
      list2((S.cfg.guards || []).map((g, i) => stepRow(me, 'guard', g, i, list('guardsL')[i], '+' + g.bp / 100 + '% ' + t('guardDef') + ' · ' + t('guardHit', { p: Math.max(H.minBp, H.baseBp - g.block) / 100 }), 'guards', list('guardsL')))));
  } else {
    out.push(sub(t('arGangSub')), list2((S.cfg.gweapons || []).map((g, i) => stepRow(me, 'gweapon', g, i, list('gweaponsL')[i], t('arStrGang', { n: g.str }), 'gweapons', list('gweaponsL')))));
  }
  return out;
}

// ---------- inventário ----------
// o que trazes no corpo (9 espaços), o que guardas (ocupa espaço) e o recetador
function screenInv() {
  const me = S.st.me, B = S.cfg.bullets, used = me.invUsed, cap = me.invCap, full = used >= cap;
  const out = [pageHead('inv', t('invSub'))];
  const bag = me.eq.acess && gearOf(me.eq.acess.id)?.room;
  const goods = me.inv.filter((x) => isGood(x.id)), gv = goods.reduce((s, x) => s + x.v, 0), gn = goods.reduce((s, x) => s + x.n, 0);
  // espaço: o número que manda, uma barra e a regra numa frase
  out.push(h('div', { class: 'card stack invsp' },
    h('div', { class: 'row sp' }, h('b', null, t('invSpace')), h('b', { class: 'num ' + (full ? 'c-red' : '') }, t('invSpaceN', { u: used, c: cap }))),
    h('div', { class: 'fill' + (full ? ' bad' : '') }, h('i', { style: `width:${Math.min(100, (used / Math.max(1, cap)) * 100)}%` })),
    h('p', { class: 'small muted' }, t('invRule', { h: S.cfg.house.tiers[me.house].slots }) + (bag ? ' ' + t('invBag', { n: bag }) : '')),
    full ? h('p', { class: 'small c-red' }, t('invFull')) : null));
  // o recetador: quanto dá por tudo o que roubaste, em grande, e um botão
  if (gn) out.push(h('div', { class: 'card stack invsp fence' },
    h('div', { class: 'row sp' }, h('b', null, t('fenceT')), h('b', { class: 'num c-cash' }, money(gv))),
    h('button', { class: 'btn buy block big', on: { click: (e) => act('sellGoods', {}, { el: e.currentTarget }) } }, t('fenceAll')),
    h('p', { class: 'small muted' }, t('fenceSub'))));
  // o que está guardado: uma linha por espaço ocupado
  out.push(h('h2', { class: 'sec' }, t('invHeld')));
  const rows = me.inv.map((it, i) => {
    const good = isGood(it.id), g = good ? null : gearOf(it.id);
    let detail, sell;
    if (good) { detail = t('itGoods', { n: it.n, m: money(it.v) }); sell = it.v; }
    else if (it.id === 'balas') { detail = t('itBullets', { n: num(it.n) }); sell = Math.floor((it.n * B.price) / (B.box * 2)); }
    else if (g.slot === 'mat') { detail = t('sl_mat') + ' · ' + t('matFor', { x: andList(S.cfg.ops.filter((o) => o.mat.includes(g.id)).map((o) => t('op_' + o.id))) }); sell = Math.floor(g.price / 2); }
    else { detail = t('sl_' + g.slot) + (g.gun ? ' · ' + (it.u > 0 ? t('usesLeft', { u: it.u, l: g.life }) : t('gunWorn')) : ''); sell = Math.floor((g.price * (g.gun ? it.u / g.life : 1)) / 2); }
    // trocar por pior: diz-se antes de tocar em «Usar»
    const on = g && me.eq[g.slot] ? gearOf(me.eq[g.slot].id) : null, k2 = g && (g.atk ? 'atk' : g.def ? 'def' : null);
    const pior = on && k2 && on[k2] > g[k2] ? h('div', { class: 'small c-red num' }, t('worseThan', { p: pctOf(g[k2]), q: pctOf(on[k2]) })) : null;
    const sellIt = (e) => act('sell', { i }, { el: e.currentTarget });
    const opNow = me.op ? S.cfg.ops[me.op.i] : null, needed = opNow && ((it.id === 'balas' && opNow.gun) || opNow.mat.includes(it.id)) ? h('div', { class: 'small c-red' }, t('opNeeds', { x: t('op_' + opNow.id) })) : null;
    return h('div', { class: 'vrow jbr' }, itArt(it.id, 'vth'),
      h('div', { class: 'grow' }, h('b', null, itName(it.id)), h('div', { class: 'small num' }, good ? tint(detail) : detail), pior, needed,
        good ? null : sureBtn('btn ghost sm', t('sellBtn') + ' · ' + money(sell), 'btn ghost dng sm sure', t('sellSure', { m: money(sell) }), () => act('sell', { i }))),
      good ? h('button', { class: 'btn sm ghost', on: { click: sellIt } }, t('sellBtn'))
        : g && g.slot !== 'mat' ? h('button', { class: 'btn sm ghost', on: { click: (e) => act('equip', { i }, { el: e.currentTarget }) } }, t('useBtn')) : null);
  });
  // a droga para vender na rua também ocupa (um espaço por tipo)
  const D = S.cfg.deal, drugs = ((me.deal && me.deal.dst) || []).map((g, j) => [g, S.cfg.drugs.findIndex((x) => x.id === D.list[j].drug)]).filter(([g]) => g > 0);
  if (drugs.length) rows.push(h('button', { class: 'vrow jbr tap', on: { click: () => go('rob') } }, h('div', { class: 'grow' }, h('b', null, t('invDrugs')),
    h('div', { class: 'small muted num' }, drugs.map(([g, d]) => num(g) + ' g ' + list('drugs')[d].toLowerCase()).join(' · '))), h('span', { class: 'muted', 'aria-hidden': 'true' }, '›')));
  out.push(rows.length ? h('div', { class: 'card vlist vc jbl' }, rows) : h('div', { class: 'tip' }, h('p', null, t('invNone'))));
  // no corpo: os nove espaços, cheios ou vazios
  out.push(h('h2', { class: 'sec' }, t('invWorn')));
  const livres = S.cfg.slots.filter((sl) => !me.eq[sl]);
  out.push(h('div', { class: 'card vlist vc jbl wornl' }, S.cfg.slots.filter((sl) => me.eq[sl]).map((sl) => {
    const it = me.eq[sl], g = gearOf(it.id);
    return h('button', { class: 'vrow wrow tap', on: { click: () => { S.armsSeg = ['branca', 'mao', 'principal'].includes(sl) ? 'fight' : 'def'; go('arms'); } } },
      h('span', { class: 'small muted wsl' }, t('sl_' + sl)),
      h('span', { class: 'grow' }, t('g_' + it.id), g.gun ? h('span', { class: 'num ' + (it.u > 0 ? 'muted' : 'c-red') }, ' · ' + (it.u > 0 ? t('usesLeft', { u: it.u, l: g.life }) : t('gunWorn'))) : null),
      h('span', { class: 'muted', 'aria-hidden': 'true' }, '›'));
  }).concat(livres.length ? [h('button', { class: 'vrow wrow tap', on: { click: () => { S.armsSeg = livres.some((x) => ['branca', 'mao', 'principal'].includes(x)) ? 'fight' : 'def'; go('arms'); } } },
    h('span', { class: 'grow muted' }, livres.length === S.cfg.slots.length ? t('wornNone') : t('wornFree', { x: livres.map((x) => t('sl_' + x).toLowerCase()).join(', ') })),
    h('span', { class: 'muted', 'aria-hidden': 'true' }, '›'))] : [])));
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
    setBtn(btn, t(mode === 'dep' ? 'depositAll' : 'withdrawAll', { m: money(a) }) + (fee ? ' · ' + t('fee', { m: money(fee) }) : ''));
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
  const me = S.st.me, names = list('lux'), Lx = S.cfg.luxury.list;
  const out = [pageHead('lux', t('luxSub'))];
  out.push(...luxRows(me, names, Lx));
  return out;
}
function luxRows(me, names, Lx) {
  const nx = me.luxuries, liquid = me.cash + me.bank;
  return [h('div', { class: 'card vlist vc' }, Lx.map((x, i) => h('div', { class: 'vrow lux' + (i > nx ? ' dim' : '') },
    h('div', { class: 'grow' }, h('b', null, names[i]), h('div', { class: 'small muted num' }, money(x.price) + ' · ', h('span', { class: 'c-resp' }, t('luxResp', { n: num(Math.floor(Math.sqrt(x.price))) })))),
    i < nx ? h('span', { class: 'small c-cash' }, t('owned'))
      : i === nx ? h('button', { class: 'btn buy sm', disabled: liquid < x.price, on: { click: (e) => act('luxury', {}, { el: e.currentTarget }) } }, liquid < x.price ? t('needMoney', { m: money(x.price - liquid) }) : t('luxBuy'))
      : null)))];
}
// a casa: compra-se a seguinte (a antiga entra na troca pelo que custou), sem renda nem despesa. Mais espaços e mais stamina máxima.
function screenCasa() {
  const me = S.st.me, H = S.cfg.house, cur = H.tiers[me.house], nx = H.tiers[me.house + 1], names = list('houses');
  const pic = (id, cls) => h('img', { class: cls, src: IMG('casa', id), alt: '', width: 600, height: 600, decoding: 'async', on: { error: (e) => e.currentTarget.remove() } });
  const out = [pageHead('casa', t('s_casa'), true)];
  const fact = (lbl, val) => h('div', { class: 'fact' }, h('b', { class: 'num' }, val), h('span', null, lbl));
  out.push(h('div', { class: 'jobp home' },
    h('div', { class: 'jimg' }, pic(cur.id), h('h2', null, names[me.house])),
    h('div', { class: 'facts two' }, fact(t('hSlots'), String(cur.slots)), fact(t('hStam'), String(cur.emax))),
    nx ? h('div', { class: 'nexth' }, pic(nx.id, 'nximg'), h('div', { class: 'grow' }, h('div', { class: 'small muted' }, t('houseNext')), h('div', { class: 'nm' }, names[me.house + 1]),
      h('div', { class: 'small muted' }, t('hNextGives', { s: nx.slots, e: nx.emax })),
      h('div', { class: 'small c-resp' }, t('r_resp', { n: num(nx.resp) })))) : h('p', { class: 'c-gold' }, t('houseTop')),
    nx && cur.price ? h('p', { class: 'small muted' }, t('hTrade', { m: money(cur.price) })) : null,
    nx ? h('button', { class: 'btn buy block big', disabled: me.cash + me.bank < me.housePrice, on: { click: (e) => act('house', {}, { el: e.currentTarget }) } },
      me.cash + me.bank < me.housePrice ? t('needMoney', { m: money(me.housePrice - me.cash - me.bank) }) : t('houseBuy', { m: money(me.housePrice) })) : null));
  out.push(h('h2', { class: 'sec' }, t('hAll')));
  out.push(h('div', { class: 'card vlist vc' }, H.tiers.map((x, i) => h('div', { class: 'vrow' + (i > me.house + 1 ? ' dim' : '') },
    h('img', { class: 'vth', src: IMG('casa', x.id), alt: '', width: 600, height: 600, loading: 'lazy', decoding: 'async', on: { error: (e) => { e.currentTarget.style.visibility = 'hidden'; } } }),
    h('div', { class: 'grow' }, h('b', null, names[i]), h('div', { class: 'small muted num' }, (x.price ? money(x.price) : t('hFree')) + ' · ' + t('hRow', { s: x.slots, e: x.emax }))),
    i === me.house ? h('span', { class: 'small c-cash' }, t('hHere')) : null))));
  out.push(h('h2', { class: 'sec' }, t('p_lux')), h('p', { class: 'small muted', style: 'margin:-4px 2px 10px' }, t('luxSub')), ...luxRows(me, list('lux'), S.cfg.luxury.list));
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
    h('p', { class: 'small muted' }, t('detoxSub', { p: Math.round((S.cfg.detox.stepNum / S.cfg.detox.stepDen - 1) * 100) })),
    h('button', { class: 'btn buy block', disabled: !!b || me.cash + me.bank < me.detox, on: { click: (e) => act('detox', {}, { el: e.currentTarget }) } }, t('detoxBtn', { m: money(me.detox) }))));
  else if (!b && !me.sick) out.push(h('div', { class: 'note' }, h('p', { class: 'muted' }, t('healthy')), h('button', { class: 'btn ghost', on: { click: () => go('rob') } }, t('backToWork'))));
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
const GOAL_GO = { wins: 'rob', tier: 'rob', shifts: 'job', courses: 'job', skill: 'rob', level: 'rob', trains: 'gym', refills: 'club', gear: 'arms', biz: 'biz', collects: 'biz', ports: 'port', pvpWins: 'fights', lux: 'casa' };
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
  // trocar por outro: o que se salta volta no fim; uma vez por hora
  if (!m.done && m.swapAt) {
    const left = m.swapAt - now();
    out.push(h('div', { class: 'card stack vc', style: 'margin-top:10px' },
      left > 0 ? h('button', { class: 'btn ghost block', disabled: true }, t('mSwapWait', { t: '' }), h('b', { class: 'num', dataset: { left: m.swapAt } }, dur(left)))
        : h('button', { class: 'btn ghost block', on: { click: (e) => act('missionSwap', {}, { el: e.currentTarget }) } }, t('mSwap')),
      h('p', { class: 'small muted' }, t('mSwapSub'))));
  }
  return out;
}

// ---------- lutas e ranking ----------
// assassino a soldo: mostra-se o preço, a pontaria e o que acontece, antes de se pagar
function hitmanSheet(x) {
  const me = S.st.me, H = S.cfg.hitman, liquid = me.cash + me.bank, pc = (bp) => (bp / 100).toString().replace('.', lang() === 'pt' ? ',' : '.');
  const why = x.hw || (liquid < x.hp ? 'NO_MONEY' : null);
  const li = (ic, txt) => h('li', null, icon(ic), h('span', null, txt));
  const close = sheet(h('div', { class: 'stack' }, h('h2', null, icon('skull'), ' ', t('hmT')), h('p', { class: 'muted' }, t('hmSub', { b: x.name })),
    h('div', { class: 'row sp' }, h('span', { class: 'muted' }, t('hmPrice')), h('b', { class: 'num c-cash' }, money(x.hp))),
    h('div', { class: 'row sp' }, h('span', { class: 'muted' }, t('hmAim') + (x.hc < H.baseBp ? ' · ' + t('hmGuards') : '')), h('b', { class: 'num ' + chanceCls(x.hc) }, pct(x.hc))),
    h('ul', { class: 'vperks' }, li('skull', t('hmOk', { h: Math.round(H.hospMs / 60000) + ' min', r: pc(H.respBp), c: pc(H.cashBp) })), li('user', t('hmAnon')), li('shield', t('hmFail'))),
    h('p', { class: 'small muted' }, t('hmLeft', { n: me.hitmanLeft ?? H.perDay, x: H.perDay })),
    why ? h('p', { class: 'small c-red' }, errText(why)) : null,
    h('button', { class: 'btn danger block big', disabled: !!why, on: { click: (e) => { const el = e.currentTarget; withShield(async (drop) => { const o = await act('hitman', { target: x.name, drop }, { el }); if (o) { close(); if (S.tab === 'hitman') loadHitman(); else loadTargets(); } }); } } }, t('hmGo', { m: moneyShort(x.hp) }))));
}
// O assassino tem um sítio próprio: nas lutas só aparecia em cada alvo, e quem não tem alvos (o primeiro do ranking, por exemplo) nunca o via.
// Aqui estão todos os outros jogadores, com o preço e a pontaria, e o motivo quando não dá para encomendar.
async function loadHitman() { try { const r = await api('GET', '/api/hitman'); S.hitList = r.list; if (S.tab === 'hitman') render(); } catch {} }
function screenHitman() {
  const me = S.st.me, H = S.cfg.hitman, P = S.cfg.pvp, pc = (bp) => (bp / 100).toString().replace('.', lang() === 'pt' ? ',' : '.');
  const li = (ic, txt) => h('li', null, icon(ic), h('span', null, txt));
  const GLOBAL = ['LOW_LEVEL', 'HITMAN_LIMIT', 'NO_PVP_YET'];   // motivos do teu lado: dizem-se uma vez, em cima, e não em cada linha
  const all = S.hitList, low = me.level < H.minLevel, glob = low ? null : all?.find((x) => GLOBAL.includes(x.hw))?.hw;
  const out = [pageHead('hitman', t('hitmanSub'))];
  if (low) out.push(h('div', { class: 'tip' }, h('p', null, t('hmLocked', { n: H.minLevel }))));
  else if (glob) out.push(h('div', { class: 'tip' }, h('p', null, errText(glob))));
  out.push(h('div', { class: 'card stack', style: 'margin:0 0 12px' },
    h('ul', { class: 'vperks' }, li('cash', tint(t('hmFrom', { m: money(H.priceMin) }))), li('skull', t('hmOk', { h: Math.round(H.hospMs / 60000) + ' min', r: pc(H.respBp), c: pc(H.cashBp) })), li('user', t('hmAnon')), li('shield', t('hmFail'))),
    h('p', { class: 'small muted', style: 'margin:0' }, (low ? '' : t('hmLeft', { n: me.hitmanLeft ?? H.perDay, x: H.perDay }) + ' ') + t('hmRule', { p: pc(P.minTargetBp), r: num(Math.ceil((me.respect * P.minTargetBp) / 10000)) }))));
  out.push(h('h2', { class: 'sec' }, t('hmListT')));
  if (!all) out.push(h('p', { class: 'muted' }, t('loading')));
  else if (!all.length) out.push(h('div', { class: 'note' }, h('p', { class: 'muted' }, t('hmNone'))));
  else {
    out.push(h('div', { class: 'stack' }, all.map((x) => {
      const ok = !x.hw;
      return h('div', { class: 'card row gm hmrow' + (ok ? '' : ' off') },
        S.avOk ? h('img', { class: 'avs', src: AV(x.av || 0), alt: '', width: 96, height: 96, loading: 'lazy' }) : null,
        h('div', { class: 'grow' }, h('div', { style: 'font-weight:700' }, x.tag ? h('span', { class: 'gtag' }, x.tag) : null, x.tag ? ' ' : '', x.name),
          h('div', { class: 'small muted' }, t('level') + ' ' + x.level + ' · ', h('span', { class: 'c-resp' }, icon('crown'), ' ' + short(x.respect)), ok ? ' · ' + t('hmAimShort', { p: pct(x.hc) }) : ''),
          !ok && !GLOBAL.includes(x.hw) ? h('div', { class: 'small muted' }, errText(x.hw), x.until > now() ? [' · ', h('b', { class: 'num', dataset: { opend: x.until } }, dur(x.until - now()))] : null) : null),
        ok ? h('button', { class: 'btn danger sm', 'aria-label': t('hmGo', { m: moneyShort(x.hp) }), on: { click: () => hitmanSheet(x) } }, icon('skull'), moneyShort(x.hp)) : null);
    })));
  }
  out.push(h('button', { class: 'btn ghost block', style: 'margin-top:12px', on: { click: () => { S.hitList = null; render(); loadHitman(); } } }, icon('refresh'), t('retry')));
  return out;
}
function screenFights() {
  const me = S.st.me, n = now();
  const out = [pageHead('fights', t('fightsSub'))];
  out.push(h('div', { class: 'hlinks' }, ['gang', 'arms', 'rank', 'hitman'].map((id) => h('button', { class: 'hlink', on: { click: () => go(id) } },
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
    // quem dá para atacar em cima; por baixo, os outros jogadores com o motivo (os mais perto de ti no ranking primeiro)
    const can = (S.targets || []).filter((x) => !x.why), cant = (S.targets || []).filter((x) => x.why);
    if (!S.targets) out.push(h('p', { class: 'muted' }, t('loading')));
    else if (!S.targets.length) out.push(h('div', { class: 'note' }, h('p', { class: 'muted' }, t('hmNone'))));
    else if (!can.length) out.push(h('div', { class: 'note' }, h('p', { class: 'muted' }, t('noTargets'))));
    else out.push(h('div', { class: 'stack' }, can.map((x) => h('div', { class: 'card tgt' },
      h('div', { class: 'who2' }, S.avOk ? h('img', { class: 'avs', src: AV(x.av || 0), alt: '', width: 96, height: 96, loading: 'lazy' }) : null, h('div', null, h('div', { class: 'nm' }, x.tag ? h('span', { class: 'gtag' }, x.tag) : null, x.tag ? ' ' : '', x.name), h('div', { class: 'lv' }, t('level') + ' ' + x.level + ' · ' + titleOf(x.level) + ' · ', h('span', { class: 'c-resp' }, icon('crown'), ' ' + short(x.respect))))),
      h('div', { class: 'pct' }, pct(x.chance), h('small', null, t('chanceLbl'))),
      h('div', { class: 'acts' },
        h('button', { class: 'btn buy sm', disabled: !!b, on: { click: (e) => { const el = e.currentTarget; withShield((drop) => act('attack', { target: x.name, mode: 'beat', drop }, { el })); } } }, t('beat') + ' · ' + t('luxResp', { n: x.gain })),
        h('button', { class: 'btn ghost sm', disabled: !!b, on: { click: (e) => { const el = e.currentTarget; withShield((drop) => act('attack', { target: x.name, mode: 'mug', drop }, { el })); } } }, t('rob') + ' · ~' + money(x.loot)),
        x.hp && x.hw !== 'LOW_LEVEL' ? h('button', { class: 'btn ghost dng sm hmb', on: { click: () => hitmanSheet(x) } }, t('hmBtn', { m: moneyShort(x.hp) })) : null)))));
    if (cant.length) out.push(h('h2', { class: 'sec' }, t('tgOffT')), h('div', { class: 'stack' }, cant.map((x) => h('div', { class: 'card tgt off' },
      h('div', { class: 'who2' }, S.avOk ? h('img', { class: 'avs', src: AV(x.av || 0), alt: '', width: 96, height: 96, loading: 'lazy' }) : null, h('div', null, h('div', { class: 'nm' }, x.tag ? h('span', { class: 'gtag' }, x.tag) : null, x.tag ? ' ' : '', x.name), h('div', { class: 'lv' }, t('level') + ' ' + x.level + ' · ' + titleOf(x.level) + ' · ', h('span', { class: 'c-resp' }, icon('crown'), ' ' + short(x.respect))),
        h('div', { class: 'why' }, errText(x.why), x.until > n ? [' · ', h('b', { class: 'num', dataset: { opend: x.until } }, dur(x.until - n))] : null)))))));
    out.push(h('button', { class: 'btn ghost block', style: 'margin-top:12px', on: { click: () => { S.targets = null; render(); loadTargets(); } } }, icon('refresh'), t('retry')));
  } else if (!S.events) out.push(h('p', { class: 'muted' }, t('loading')));
  else if (!S.events.length) out.push(h('div', { class: 'note' }, h('p', { class: 'muted' }, t('noEvents'))));
  else out.push(h('div', { class: 'stack' }, S.events.map(eventRow)));
  return out;
}
const ordOf = (n) => list('ord')[n - 1] || (lang() === 'pt' ? n + '.º' : n + 'th');
function screenRank() {
  const R = S.ranking, ep = season(), me = S.st.me, geral = R?.view === 'geral';
  const out = [pageHead('rank', null)];
  if (!R) { out.push(h('p', { class: 'muted' }, t('loading'))); return out; }
  const mineDiv = me?.ep?.div ?? 0;
  out.push(h('div', { class: 'seg' }, [['epoca', t('rkSeason')], ['geral', t('rkAll')]].map(([v, n]) => h('button', { 'aria-pressed': R.view === v ? 'true' : 'false', on: { click: () => { S.rankView = v; loadRanking(); } } }, n))));
  if (geral) out.push(h('p', { class: 'rkline muted' }, t('rkAllSub')));
  else {
    if (ep) out.push(h('div', { class: 'eph' }, h('div', { class: 'ept' }, t('seasonN', { n: ep.n + 1 })),
      h('div', { class: 'small muted' }, t('seasonLeft', { d: fimEpoca(ep), t: nb(leftTxt(ep.end - now())) }))));
    // onde estás e quanto falta para o pódio (só na tua divisão)
    if (R.me && R.d === mineDiv) {
      const third = R.top.find((x) => x.pos === 3), gap = third && R.me.pos > 3 ? third.score - R.me.score + 1 : 0;
      out.push(h('p', { class: 'rkyou' }, t('rkYou', { p: ordOf(R.me.pos), r: num(R.me.score) }) + (gap > 0 ? ' ' + t('rkGap', { n: num(gap) }) : '')));
    }
    out.push(h('div', { class: 'seg rkdiv', role: 'group', 'aria-label': t('rkDivs') }, Array.from({ length: S.cfg.season?.divs || 5 }, (_, d) => h('button', { 'aria-pressed': R.d === d ? 'true' : 'false', 'aria-label': t('rkDivA', { x: divName(d) }),
      on: { click: () => { S.rankDiv = d; loadRanking(); } } }, divName(d)))));
    out.push(h('p', { class: 'small muted rkline' }, R.d === mineDiv ? t('rkYour', { x: divName(R.d) }) : t('rkOther', { x: divName(R.d), y: divName(mineDiv) })));
    if (R.prizes) out.push(h('div', { class: 'facts three' }, R.prizes.map((m, i) => h('div', { class: 'fact' }, h('b', { class: 'num ' + (m > 0 ? 'c-cash' : 'muted') }, m > 0 ? money(m) : '—'), h('span', null, t('rkPlace', { p: ordOf(i + 1) }))))));
    out.push(h('p', { class: 'small muted rkline' }, t('rkPrize')));
  }
  const st = h('div', { class: 'rklist' });
  const row = (r) => h('div', { class: 'rk' + (r.me ? ' me' : '') },
    h('div', { class: 'p' }, r.pos), S.avOk ? h('img', { class: 'avs', src: AV(r.av || 0), alt: '', width: 96, height: 96, loading: 'lazy' }) : null,
    h('div', { style: 'min-width:0' }, h('div', { class: 'rkn' }, r.tag ? h('span', { class: 'gtag' }, r.tag) : null, r.tag ? ' ' : '', r.name),
      h('div', { class: 'rkl' }, nb(t('level') + ' ' + r.level) + ' · ' + (r.vet ? t('vetShort') : titleOf(r.level)))),   // o veterano mostra-se no lugar do título (o título vê-se no perfil)
    h('div', { class: 'r num' }, num(geral ? r.respect : r.score)));
  R.top.forEach((r, i) => { st.append(row(r)); if (!geral && r.pos === 3 && R.top.length > 3) st.append(h('div', { class: 'rkcut' }, t('rkCut'))); });
  if (!R.top.length) st.append(h('p', { class: 'rkempty' }, geral ? t('rkNone') : t('rkNoneDiv', { x: divName(R.d) })));
  if (R.me && R.me.pos > 100) st.append(row({ ...R.me, me: true, av: me?.av || 0, tag: '', vet: false }));
  out.push(st);
  if (!geral && R.last && R.last.top.length) {
    out.push(h('h2', { class: 'sec', style: 'margin-bottom:2px' }, t('rkLast', { n: R.last.n + 1 })), h('p', { class: 'small muted rkline', style: 'margin-top:0' }, t('rkLastSub', { x: divName(R.d) })));
    out.push(h('div', { class: 'rklist' }, R.last.top.map((x) => h('div', { class: 'rk' }, h('div', { class: 'p' }, x.pos), S.avOk ? h('img', { class: 'avs', src: AV(x.av || 0), alt: '', width: 96, height: 96, loading: 'lazy' }) : null,
      h('div', { style: 'min-width:0' }, h('div', { class: 'rkn' }, x.name), h('div', { class: 'rkl' }, x.money > 0 ? h('span', null, t('rkWon') + ' ', h('span', { class: 'c-cash' }, money(x.money))) : t('rkWonT'))), h('div', { class: 'r num' }, num(x.score))))));
  }
  return out;
}

function eventRow(e) {
  let txt;
  if (e.k === 'season') return h('div', { class: 'card row' }, h('b', { class: 'evpos' }, ordOf(e.pos)),
    h('div', { class: 'grow' }, h('div', null, t('evSeason', { n: e.n + 1, x: divName(e.d) }) + (e.money > 0 ? ' ' + t('evSeasonM', { m: money(e.money) }) : '')), h('div', { class: 'small muted' }, dur(now() - e.t))));
  if (e.k === 'gangIn' || e.k === 'gangOut') return h('div', { class: 'card row' }, h('span', { class: e.k === 'gangIn' ? 'c-cash' : 'c-red' }, icon('fist')),
    h('div', { class: 'grow' }, h('div', null, t(e.k === 'gangIn' ? 'evGangIn' : 'evGangOut', { g: e.gang }) + (e.money > 0 ? ' ' + t('gBizBack', { m: money(e.money) }) : '')), h('div', { class: 'small muted' }, dur(now() - e.t))));
  if (e.k === 'gangRole') return h('div', { class: 'card row' }, h('span', { class: e.role > (e.was || 0) ? 'c-resp' : 'muted' }, icon('crown')),
    h('div', { class: 'grow' }, h('div', null, t('evRole' + e.role, { g: e.gang })), h('div', { class: 'small muted' }, dur(now() - e.t))));
  if (e.k === 'gangBail' || e.k === 'gangMedic') return h('div', { class: 'card row' }, h('span', { class: 'c-cash' }, icon(e.k === 'gangBail' ? 'lock' : 'pill')),
    h('div', { class: 'grow' }, h('div', null, t(e.k === 'gangBail' ? 'evBail' : 'evMedic', { who: e.by, m: money(e.money) })), h('div', { class: 'small muted' }, dur(now() - e.t))));
  if (e.k === 'gop') return opResult(e, e.out || e.cancelled ? 0 : e.respect, e.t);
  if (e.k === 'stAuto') return h('div', { class: 'card row' }, h('span', { class: e.profit >= 0 ? 'c-cash' : 'c-red' }, icon('gem')),
    h('div', { class: 'grow' }, h('div', null, t(e.why === 'tp' ? 'evStTp' : 'evStSl', { x: t('st_' + e.c), n: num(e.n), m: money(e.money || 0), g: (e.profit >= 0 ? '+' : '−') + money(Math.abs(e.profit || 0)) })), h('div', { class: 'small muted' }, dur(now() - e.t))));
  if (e.k === 'stDiv') return h('div', { class: 'card row' }, h('span', { class: 'c-cash' }, icon('cash')),
    h('div', { class: 'grow' }, h('div', null, t('evStDiv', { m: money(e.money || 0), x: (e.cs || []).map((c) => t('st_' + c)).join(', ') })), h('div', { class: 'small muted' }, dur(now() - e.t))));
  if (e.k === 'raid') return h('div', { class: 'card row' }, h('span', { class: 'c-red' }, icon('lock')),
    h('div', { class: 'grow' }, h('div', null, t('evRaid', { t: tookTxt(e.took || []), m: money(e.fine || 0), ...rgF(e.r) }) + (e.jail ? t('evRaidJ') : '')), h('div', { class: 'small muted' }, dur(now() - e.t))));
  if (e.k === 'hkRob') return h('div', { class: 'card row' }, h('span', { class: 'c-red' }, icon('skull')),
    h('div', { class: 'grow' }, h('div', null, t('hkRob_' + e.kind, { m: money(e.money || 0) })), h('div', { class: 'small muted' }, dur(now() - e.t))));
  if (e.k === 'hitman') return h('div', { class: 'card row' }, h('span', { class: e.win ? 'c-red' : 'c-cash' }, icon(e.win ? 'skull' : 'shield')),
    h('div', { class: 'grow' }, h('div', null, e.win ? t('evHitman', { m: money(e.money || 0) }) : t('evHitmanFail', { who: e.by })), h('div', { class: 'small muted' }, dur(now() - e.t))),
    e.respect ? h('b', { class: 'c-red' }, String(e.respect)) : null);
  if (e.crew) txt = t(e.win ? 'evCrew' : 'evCrewLost', { who: e.by, n: e.crew });
  else if (e.mode === 'mug') txt = e.win ? t('evMug', { who: e.by, m: money(e.money) }) : t('evMugLost', { who: e.by });
  else txt = e.win ? t('evBeat', { who: e.by }) : t('evBeatLost', { who: e.by });
  const ago = dur(now() - e.t);
  return h('div', { class: 'card row' }, h('span', { class: e.win ? 'c-red' : 'c-cash' }, icon(e.win ? 'skull' : 'shield')),
    h('div', { class: 'grow' }, h('div', null, txt), h('div', { class: 'small muted' }, ago)),
    e.respect ? h('b', { class: e.respect < 0 ? 'c-red' : 'c-cash' }, (e.respect > 0 ? '+' : '') + e.respect) : null);
}

// quem ainda tem o escudo de jogador novo escolhe antes de atacar: perde-o de vez ou fica com ele
function withShield(run) {
  const me = S.st.me, left = me.shieldUntil - now();
  if (!(left > 0)) return run(false);
  const close = sheet(h('div', { class: 'stack' }, h('h2', null, icon('shield'), ' ', t('shDropT')), h('p', { class: 'muted' }, t('shDropSub', { t: dur(left) })),
    h('button', { class: 'btn danger block', on: { click: () => { close(); run(true); } } }, t('shDropGo')),
    h('button', { class: 'btn ghost block', on: { click: () => close() } }, t('shKeep'))));
}
// bolsa: os preços vêm do servidor; volta-se a pedir logo a seguir a cada mudança (de 10 em 10 minutos) enquanto o ecrã estiver aberto
async function loadStocks() {
  clearTimeout(S.stkTimer);
  try { const r = await api('GET', '/api/stocks'); S.stocks = r; if ((S.tab === 'bolsa' && !document.activeElement?.matches?.('#bamt')) || S.tab === 'news') render(); } catch {}
  if (S.tab === 'bolsa') S.stkTimer = setTimeout(loadStocks, S.stocks?.nextAt ? Math.max(4000, Math.min(60000, S.stocks.nextAt - now() + 1500)) : 20000);
}
async function loadVenues() { try { const r = await api('GET', '/api/venues'); S.venues = r; if (S.tab === 'club' || S.tab === 'putas') render(); } catch {} }
async function loadTargets() { try { const r = await api('GET', '/api/targets'); S.targets = r.list; if (S.tab === 'fights') render(); } catch {} }
async function loadRanking() {
  const q = S.rankView === 'geral' ? '?v=geral' : Number.isInteger(S.rankDiv) ? '?d=' + S.rankDiv : '';
  try { S.ranking = await api('GET', '/api/ranking' + q); if (S.tab === 'rank') render(); } catch {}
}
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
    h('div', { class: 'row sp' }, h('div', null, h('div', { class: 'gname' }, h('span', { class: 'gtag' }, g.tag), ' ' + gName(g.name)), h('div', { class: 'small muted' }, t('gLine', { n: g.members, s: g.slots, r: short(g.respect), l: g.leader }))),
      h('b', { class: 'gpos num' }, '#' + g.pos)),
    h('div', { class: 'row sp', style: 'margin-top:10px' }, h('span', { class: 'small' }, t('gLv', { a: g.sede, b: g.armaria })),
      me.gang ? null : h('button', { class: 'btn sm' + (g.open ? ' buy' : ''), disabled: full || lowLvl || g.asked || me.gangWait > now(), on: { click: () => gAct('gangJoin', { id: g.id }) } },
        full ? t('gFull') : g.asked ? t('gAsked') : g.open ? t('gJoin') : t('gAsk'))));
}
// Negócios da gangue: cada um põe o seu e ganha sobre o que pôs; os sócios ao mesmo nível dão bónus uns aos outros.
function gangBiz(mine, me) {
  const G = S.cfg.gang, list0 = mine.biz || []; if (!list0.length) return [];
  const liquid = me.cash + me.bank, stored = list0.reduce((x, b) => x + b.stored, 0), pct = (bp) => (bp / 100).toString().replace('.', lang() === 'pt' ? ',' : '.');
  const out = [h('h2', { class: 'sec' }, t('gBizT'))];
  out.push(h('div', { class: 'card stack gbz', style: 'margin:0 0 12px' },
    h('p', { class: 'small muted', style: 'margin:0' }, t('gBizNote', { p: pct(G.bizCoopBp), x: pct(G.bizCoopMax), h: pct(10000 - G.bizRefundBp) })),
    list0.map((b, k) => {
      const B = G.biz[k], room = Math.max(0, b.cap - b.inv), can = Math.min(room, liquid);
      const amounts = [0.25, 0.5, 1].map((f) => Math.floor(can * f)).filter((v, i, a) => v >= G.bizMin && a.indexOf(v) === i);
      return h('div', { class: 'gbr' + (b.open ? '' : ' off') },
        h('div', { class: 'row gbh' }, art('gang', b.id, 'gthumb' + (b.open ? '' : ' lock')),
          h('div', { class: 'grow' }, h('div', { style: 'font-weight:700' }, t('gb_' + b.id)), h('div', { class: 'small muted' }, tint(t('gBizRate', { p: pct(B.rateBp) }) + (b.total > 0 ? ' · ' + t('gBizAll', { m: moneyShort(b.total), n: b.investors }) : '')))),
          b.inv > 0 ? h('b', { class: 'num c-cash' }, '+' + moneyShort(b.perH) + '/h') : null),
        !b.open ? h('div', { class: 'small muted' }, t('gBizLock', { n: B.sede }))
          : [b.inv > 0 ? h('div', { class: 'small' }, t('gBizMine', { a: money(b.inv), c: moneyShort(b.cap) }), b.coop > 0 ? h('span', { class: 'c-cash' }, ' · ' + t('gBizBonus', { p: pct(b.coop) })) : h('span', { class: 'muted' }, ' · ' + t('gBizAlone'))) : null,
            room <= 0 ? h('div', { class: 'small muted' }, t('gBizFull'))
              : amounts.length ? h('div', { class: 'row', style: 'flex-wrap:wrap;gap:8px' }, amounts.map((v) => h('button', { class: 'btn grow', on: { click: () => gAct('gangBiz', { k, amount: v }) } }, t('gBizPut', { m: moneyShort(v) }))))
                : h('div', { class: 'small muted' }, t('gBizNoCash', { m: money(G.bizMin) }))]);
    }),
    h('button', { class: 'btn buy get block', disabled: stored <= 0, on: { click: (e) => gAct('gangBizCollect', {}, { el: e.currentTarget }) } }, stored > 0 ? t('collect', { m: money(stored) }) : t('nothingToCollect'))));
  return out;
}
// Gangue da rua: chefiada por um bot, entra quem quiser. Mostra-se o acordo antes de entrar.
function gangBotRules() {
  const B = S.cfg.gang.bot, li = (ic, txt) => h('li', null, icon(ic), h('span', null, txt));
  return h('ul', { class: 'vperks' }, li('user', t('gBot1')), li('fist', t('gBot2')), li('empire', t('gBot3')), li('skull', t('gBot4')), li('lock', t('gBot5', { h: Math.round(B.rejoinMs / 3600000) })));
}
function gangBotCard(bot, me) {
  const low = me.level < S.cfg.gang.minLevel, wait = Math.max(bot.wait, me.gangWait || 0) > now() ? Math.max(bot.wait, me.gangWait || 0) : 0;
  const open = () => { const close = sheet(h('div', { class: 'stack' }, art('cenas', 'vadios', 'buyimg'), h('h2', null, t('gBotName')), h('p', { class: 'muted' }, t('gBotSub')), gangBotRules(),
    h('button', { class: 'btn buy block big', disabled: low || !!wait, on: { click: async () => { close(); await gAct('gangJoin', { id: bot.id }); } } }, t('gBotJoin')),
    h('button', { class: 'btn ghost block', on: { click: () => close() } }, t('gBotNo')))); };
  return h('div', { class: 'card gbot' }, art('cenas', 'vadios', 'gbimg'),
    h('div', { class: 'gbtx' }, h('h2', null, t('gBotT')), h('p', { class: 'small muted' }, t('gBotSub') + (bot.members ? ' ' + t('gBotMembers', { n: bot.members }) : '')),
      low ? h('p', { class: 'small muted' }, t('gNeedLvl', { n: S.cfg.gang.minLevel })) : wait ? h('p', { class: 'small muted' }, t('gBotWait', { t: dur(wait - now()) })) : null,
      h('button', { class: 'btn block', on: { click: open } }, t('gBotRead'))));
}
function screenGang() {
  const me = S.st.me, G = S.cfg.gang, d = S.gang;
  const out = [pageHead('gang', t('gangSub'))];
  if (!d) { out.push(h('p', { class: 'muted' }, t('loading'))); return out; }
  const mine = d.mine;
  if (!mine) {
    if (me.gangWait > now()) out.push(h('div', { class: 'tip' }, h('p', null, t('gWait', { t: dur(me.gangWait - now()) }))));
    if (d.bot) out.push(gangBotCard(d.bot, me));
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
  out.push(h('div', { class: 'ghead' }, h('div', { class: 'gbig' }, h('span', { class: 'gtag' }, mine.tag), ' ' + gName(mine.name)),
    h('div', { class: 'small muted' }, mine.bot ? t('gBotHead', { n: mine.members }) : t('gHead', { p: mine.pos, r: short(mine.respect), n: mine.members, s: mine.slots }))));
  // as regras da gangue da rua ficam a um toque, para não empurrarem os golpes para baixo
  if (mine.bot) out.push(h('button', { class: 'btn ghost sm', style: 'margin:0 0 12px', on: { click: () => { const close = sheet(h('div', { class: 'stack' }, art('cenas', 'vadios', 'buyimg'), h('h2', null, t('gBotName')), gangBotRules(), h('button', { class: 'btn ghost block', on: { click: () => close() } }, t('close')))); } } }, t('gBotRead')));
  out.push(h('div', { class: 'power' },
    h('div', { class: 'card' }, h('b', { class: 'c-cash' }, '+' + (G.lootBpPer * mine.sede) / 100 + '%'), h('span', { class: 'small muted' }, t('gBonusLoot', { n: mine.sede }))),
    h('div', { class: 'card' }, h('b', { class: 'c-red' }, '+' + (G.fightBpPer * mine.armaria) / 100 + '%'), h('span', { class: 'small muted' }, t('gBonusFight', { n: mine.armaria })))));
  out.push(...gangOps(mine, me));
  out.push(...gangBiz(mine, me));
  // cofre e melhorias (a gangue da rua não tem)
  if (!mine.bot) out.push(h('h2', { class: 'sec' }, t('gFundT')));
  const give = [0.1, 0.25, 0.5].map((f) => Math.floor(liquid * f)).filter((v, i, a) => v >= G.donateMin && a.indexOf(v) === i);
  const upRow = (what, lvl, cost, txt) => {
    const max = lvl >= G.maxLevel, miss = max ? 0 : Math.max(0, cost - mine.fund);
    return h('div', { class: 'row sp gup' }, art('gang', what, 'gthumb'), h('div', { class: 'grow' }, h('div', { style: 'font-weight:700' }, txt), h('div', { class: 'small ' + (miss ? 'muted' : 'c-cash') }, max ? t('gMax') : miss ? t('gMiss', { m: money(miss) }) : t('gReady'))),
      max ? null : h('button', { class: 'btn buy sm', disabled: !boss || miss > 0, on: { click: () => gAct('gangUp', { what }) } }, boss ? moneyShort(cost) : t('gBossOnly')));
  };
  if (!mine.bot) out.push(h('div', { class: 'card stack', style: 'margin:0 0 12px' },
    h('div', { class: 'row gbh' }, art('gang', 'cofre', 'gthumb'), h('span', { class: 'muted grow' }, t('gFund')), h('b', { class: 'gfund num c-cash' }, money(mine.fund))),
    give.length ? h('div', { class: 'row', style: 'flex-wrap:wrap;gap:8px' }, give.map((v) => h('button', { class: 'btn grow', on: { click: () => gAct('gangDonate', { amount: v }) } }, t('gGive', { m: moneyShort(v) })))) : h('p', { class: 'small muted' }, t('gGiveMin', { m: money(G.donateMin) })),
    h('p', { class: 'small muted' }, t('gFundNote')),
    upRow('sede', mine.sede, G.sede[mine.sede - 1], t('gUpSede', { n: mine.sede + 1 })),
    upRow('armaria', mine.armaria, G.armaria[mine.armaria], t('gUpArm', { n: mine.armaria + 1 }))));
  // pedidos de entrada (o chefe e quem tem cargo para isso)
  const can = mine.can || {}, myRole = mine.role || 0;
  if (can.asks && mine.asks.length) out.push(h('h2', { class: 'sec' }, t('gAsksT')), h('div', { class: 'stack' }, mine.asks.map((a) => h('div', { class: 'card row sp gask' },
    h('div', { class: 'grow' }, h('div', { style: 'font-weight:700' }, a.name), h('div', { class: 'small muted' }, t('gMemberLine', { l: a.level, r: short(a.respect) }))),
    h('div', { class: 'row', style: 'gap:8px' }, h('button', { class: 'btn ghost sm', on: { click: () => gAct('gangReject', { name: a.name }) } }, t('gNo')), h('button', { class: 'btn buy sm', on: { click: () => gAct('gangAccept', { name: a.name }) } }, t('gYes')))))));
  // membros
  out.push(h('h2', { class: 'sec' }, mine.bot ? t('gBotMembersT', { n: mine.members }) : t('gMembersT', { n: mine.members, s: mine.slots })));
  out.push(h('div', { class: 'stack' }, mine.roster.map((m) => h('div', { class: 'card row gm' + (m.me ? ' me' : '') },
    S.avOk ? h('img', { class: 'avs', src: AV(m.av || 0), alt: '', width: 96, height: 96, loading: 'lazy' }) : null,
    h('div', { class: 'grow' }, h('div', { class: 'gmn' }, h('b', null, m.name), m.role ? h('span', { class: 'grole r' + m.role }, m.role === 3 ? icon('crown') : null, t('gRole' + m.role)) : null), h('div', { class: 'small muted' }, t('gMemberLine', { l: m.level, r: short(m.respect) }) + (m.given ? ' · ' + t('gGave', { m: moneyShort(m.given) }) : '') + (m.stake ? ' · ' + t('gStake', { m: moneyShort(m.stake) }) : '')),
      m.jail > now() ? h('div', { class: 'small c-red' }, t('gInJail'), ' ', h('b', { class: 'num', dataset: { opend: m.jail } }, dur(m.jail - now()))) : m.hosp > now() ? h('div', { class: 'small c-red' }, t('gInHosp'), ' ', h('b', { class: 'num', dataset: { opend: m.hosp } }, dur(m.hosp - now()))) : null),
    !m.me && m.jail > now() ? h('button', { class: 'btn buy sm gsave', disabled: liquid < m.bail, on: { click: () => gAct('gangBail', { name: m.name }) } }, icon('lock'), t('gBail', { m: moneyShort(m.bail) }))
      : !m.me && m.hosp > now() ? h('button', { class: 'btn buy sm gsave', disabled: liquid < m.medic, on: { click: () => gAct('gangMedic', { name: m.name }) } }, icon('pill'), t('gMedic', { m: moneyShort(m.medic) })) : null,
    // gerir: o chefe gere todos; quem pode expulsar só vê o botão em quem está abaixo dele
    !m.me && (boss || (can.kick && (m.role || 0) < myRole)) ? h('button', { class: 'btn ghost sm gmore', 'aria-label': t('gManage', { a: m.name }), on: { click: () => gangMember(m, mine) } }, '⋯') : null))));
  if (!mine.bot) out.push(h('button', { class: 'btn ghost block granks', on: { click: () => gangRanks(mine) } }, t('gRolesBtn')));
  if (boss) out.push(h('h2', { class: 'sec small' }, t('gOpenT')), h('div', { class: 'seg' }, [[true, t('gOpenY')], [false, t('gOpenN')]].map(([v, lbl]) => h('button', { 'aria-pressed': mine.open === v ? 'true' : 'false', on: { click: () => gAct('gangOpen', { open: v }) } }, lbl))));
  // conversa
  out.push(h('h2', { class: 'sec' }, t('gChatT')));
  const inp = h('input', { id: 'gmsg', maxlength: G.chatMax, autocomplete: 'off', enterkeyhint: 'send', placeholder: t('gChatPh'), value: S.gMsg || '', on: { input: (e) => { S.gMsg = e.target.value; }, keydown: (e) => { if (e.key === 'Enter') send(); } } });
  const send = async () => { const txt = inp.value.trim(); if (!txt) return; S.gMsg = ''; inp.value = ''; await gAct('gangChat', { txt }); };
  out.push(h('div', { class: 'card gchat' },
    mine.chat.length ? h('div', { class: 'gmsgs' }, mine.chat.map((m) => h('div', { class: 'gmsg' + (m.me ? ' me' : '') }, h('b', null, m.name), h('span', null, m.txt), h('small', { class: 'muted' }, dur(Math.max(0, now() - m.t)))))) : h('p', { class: 'small muted' }, t('gChatNone')),
    h('div', { class: 'row', style: 'gap:8px' }, h('label', { class: 'sr', for: 'gmsg' }, t('gChatPh')), inp, h('button', { class: 'btn buy', on: { click: send } }, t('gSend')))));
  out.push(h('button', { class: 'btn ghost block', style: 'margin-top:16px', on: { click: () => {
    const inv = (mine.biz || []).reduce((x, b) => x + b.inv, 0), sto = (mine.biz || []).reduce((x, b) => x + b.stored, 0);
    const close = sheet(h('div', { class: 'stack' }, h('h2', null, t('gLeaveT')), h('p', null, mine.bot ? t('gLeaveBot', { h: Math.round(S.cfg.gang.bot.rejoinMs / 3600000) }) : t(mine.members === 1 ? 'gLeaveLast' : boss ? 'gLeaveBoss' : 'gLeaveSub')),
      inv > 0 ? h('p', { class: 'c-red' }, t('gLeaveBiz', { a: money(inv), m: money(Math.floor((inv * (S.cfg.gang.bizRefundBp || 0)) / 10000) + sto) })) : null,
      h('button', { class: 'btn danger block', on: { click: async () => { close(); await gAct('gangLeave', {}); } } }, t('gLeave'))));
  } } }, t('gLeave')));
  queueMicrotask(() => { const b = document.querySelector('.gmsgs'); if (b) b.scrollTop = b.scrollHeight; });
  return out;
}
// ---- operações da gangue: golpes e tareias em grupo ----
const opName = (o) => (o.kind === 'hit' ? t('goHitT', { a: o.target }) : t('gh_' + (o.c || S.cfg.gang.heists[o.k].id)));
// o = { kind, c|k, target, cancelled, gone, stale, by, out, n, need, ok, money, busted, jailed }
function opText(o) {
  if (o.out) return t('evGopOut');
  if (o.cancelled) return o.by ? t('goCalled', { a: o.by }) : o.stale ? t('goStale') : o.gone ? t('goGone', { a: o.target }) : t('goFew', { n: o.n, s: o.need });
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
  const G = S.cfg.gang, n = now(), op = mine.op, lv = live(me), busy = lv.jail || lv.hosp, en = lv.energy, vg = lv.vigor;
  const out = [h('h2', { class: 'sec' }, t('gOpsT'))];
  if (op) {
    // O pedido não tem prazo. Enquanto falta gente mostra-se quantos faltam; com a equipa completa conta a última chamada.
    const going = op.goAt > 0, away = op.away || 0, miss = Math.max(0, op.need - (op.parts.length - away)), full = op.parts.length >= G.opMax;
    const status = going ? t('goLast') : op.hold ? t('goHold', { a: op.target }) : miss === 1 ? t('goNeed1') : t('goNeed', { n: miss });
    const join = (e) => { const el = e.currentTarget; if (op.kind === 'hit') withShield((drop) => gAct('gangOpJoin', { drop }, { el })); else gAct('gangOpJoin', {}, { el }); };
    out.push(h('div', { class: 'card gop' + (going ? ' going' : '') },
      h('div', { class: 'gimg' }, h('img', { src: op.kind === 'hit' ? IMG('cenas', 'lutas', 1) : IMG('crimes', G.heists[op.k].id, 1), alt: '', width: 1100, height: 1100, decoding: 'async', on: { error: (e) => e.currentTarget.parentNode.remove() } })),
      h('div', { class: 'row sp' }, h('div', { class: 'gt' }, opName(op)), going ? h('b', { class: 'gcd num', dataset: { opend: op.goAt } }, dur(Math.max(0, op.goAt - n))) : null),
      h('div', { class: 'row sp gline' }, h('span', null, t('goCount', { n: op.parts.length, s: op.need })), h('b', { class: chanceCls(op.chance) }, t('goChance', { p: pct(op.chance) }))),
      h('div', { class: 'small muted' }, op.parts.map((a) => (a === op.by ? t('goOpener', { a }) : a)).join(' · ')),
      h('p', { class: 'small gstat' }, going ? null : h('b', null, t('goOpen') + ' '), status),
      away ? h('p', { class: 'small c-red' }, away === 1 ? t('goAway1') : t('goAway', { n: away })) : null,
      op.staleAt ? h('p', { class: 'small muted' }, t('goStaleIn'), h('b', { class: 'num', dataset: { opend: op.staleAt } }, dur(Math.max(0, op.staleAt - n))), '.') : null,
      op.joined && op.share != null ? h('p', { class: 'small ' + (op.share < 10000 ? 'c-gold' : 'muted') }, t(op.share < 10000 ? 'goShareLow' : 'goShare', { p: pct(op.share) })) : null,
      // uma ação principal de cada vez: alinhar se ainda não estás; avançar se estás e mandas no pedido
      op.joined ? null : h('button', { class: 'btn buy block', disabled: !!busy || (op.kind === 'hit' ? vg : en) < op.e || full || !!op.hold, on: { click: join } }, t(op.kind === 'hit' ? 'goJoinV' : 'goJoin', { e: op.e })),
      op.canGo ? h('button', { class: 'btn block ' + (op.joined ? 'buy' : 'pri'), on: { click: async (e) => { await gAct('gangOpGo', {}, { el: e.currentTarget }); refresh(); } } }, t('goGo')) : null,
      op.joined ? h('div', { class: 'row sp gin' }, h('span', null, icon('check'), t('goIn')),
        op.mine ? null : h('button', { class: 'btn ghost sm', on: { click: () => gAct('gangOpLeave', {}) } }, t('goOut'))) : null,
      op.mineToCancel ? h('button', { class: 'btn ghost dng block', on: { click: () => gAct('gangOpCancel', {}) } }, t('goCancel')) : null));   // acaba o pedido para todos: a vermelho, como tudo o que não se desfaz
    return out;
  }
  const L = mine.last;
  if (L && n - L.t < 30 * 60000) {
    const eu = (L.parts || []).find((x) => x.name === me.name);
    out.push(opResult({ kind: L.kind, k: L.k, target: L.target, cancelled: L.cancelled, gone: L.gone, stale: L.stale, by: L.by, n: L.n, need: L.need, ok: L.kind === 'hit' ? L.win : L.success,
      money: eu ? eu.money : L.parts?.[0]?.money || 0, jailed: (L.parts || []).filter((x) => x.busted).map((x) => x.name) }, eu ? eu.respect : 0, L.t));
  }
  const cool = mine.opCool > n;
  // por ordem de dificuldade (os números de cada golpe no servidor não mudam)
  const ordem = G.heists.map((H, k) => [H, k]).sort((a, b) => a[0].sede - b[0].sede || a[0].D - b[0].D);
  if (cool) out.push(h('div', { class: 'tip' }, h('p', null, t('goWait', { t: '' }), h('b', { class: 'num', dataset: { opend: mine.opCool } }, dur(mine.opCool - n)))));
  out.push(h('div', { class: 'card gopl' },
    // cada linha: imagem, nome e botão em cima; os números por baixo, a toda a largura (não se partem em colunas estreitas)
    ordem.map(([H, k]) => h('div', { class: 'gup gop2' }, art('crimes', H.id, 'gthumb' + (mine.sede < H.sede ? ' lock' : '')),
      h('div', { class: 'gnm' }, t('gh_' + H.id)),
      mine.sede < H.sede ? h('span', { class: 'small muted glock' }, icon('lock'), t('ghLock', { n: H.sede }))
        : h('button', { class: 'btn buy sm', disabled: cool || !!busy || en < H.e, on: { click: () => gAct('gangOp', { kind: 'heist', k }) } }, t('ghOpen'), ' · ', icon('bolt'), String(H.e)),
      h('div', { class: 'small muted gln' }, tint(t('ghLine', { n: H.need, a: moneyShort(H.min), b: moneyShort(H.max), r: H.r }))))),
    mine.bot ? null : h('div', { class: 'gup gop2' }, art('cenas', 'lutas', 'gthumb'),
      h('div', { class: 'gnm' }, t('goHit')),
      h('button', { class: 'btn danger sm', disabled: cool || !!busy || vg < S.cfg.pvp.energy, on: { click: () => gangPickTarget() } }, t('goPick')),
      h('div', { class: 'small muted gln' }, t('goHitLine', { n: G.hitNeed, m: Math.round((S.cfg.pvp.beatHospMs * G.hitHospBp) / 10000 / 60000) }))),
    h('p', { class: 'small muted', style: 'padding-top:10px' }, t('ghNote', { m: Math.round(G.opCoolMs / 60000) }))));
  return out;
}
async function gangPickTarget() {
  const body = h('div', { class: 'stack' }, h('h2', null, t('goPickT')), h('p', { class: 'muted' }, t('loading')));
  const close = sheet(body);
  try { const r = await api('GET', '/api/targets'); S.targets = r.list; } catch {}
  const L = (S.targets || []).filter((x) => !x.why && (!S.st.me.gang || x.tag !== S.st.me.gang.tag));
  body.replaceChildren(h('h2', null, t('goPickT')), h('p', { class: 'small muted' }, t('goPickSub')),
    ...(L.length ? L.map((x) => h('div', { class: 'card row sp', style: 'background:var(--s2)' },
      h('div', { class: 'grow', style: 'min-width:0' }, h('div', { style: 'font-weight:700' }, x.tag ? h('span', { class: 'gtag' }, x.tag) : null, x.tag ? ' ' : '', x.name), h('div', { class: 'small muted' }, t('gMemberLine', { l: x.level, r: short(x.respect) }))),
      h('button', { class: 'btn danger sm', on: { click: () => { close(); withShield((drop) => gAct('gangOp', { kind: 'hit', target: x.name, drop })); } } }, t('goMark'))))
      : [h('p', { class: 'muted' }, t('noTargets'))]));
}
// contagem das operações: quando chega a zero vai buscar o resultado
setInterval(() => {
  const els = document.querySelectorAll('[data-opend]'); if (!els.length) return;
  let due = false;
  els.forEach((el) => { const left = +el.dataset.opend - now(); el.textContent = dur(Math.max(0, left)); if (left <= -600 && el.dataset.re !== '1') { el.dataset.re = '1'; due = true; } });
  if (due) { loadGang(); refresh(); if (S.tab === 'fights' && S.fightSeg !== 'events') loadTargets(); if (S.tab === 'hitman') loadHitman(); }
}, 500);
// A folha de um membro: o chefe escolhe o cargo (uma escolha entre três), passa a chefia e expulsa; o subchefe só expulsa quem está abaixo dele.
function gangMember(m, mine) {
  const R = S.cfg.gang.roles || { max: [0, 2, 1] }, boss = mine.leaderMe, role = m.role || 0;
  const com = (r) => mine.roster.filter((x) => (x.role || 0) === r && x.name !== m.name).map((x) => x.name);
  const cheios = [1, 2].filter((r) => r !== role && com(r).length >= R.max[r]);
  const close = sheet(h('div', { class: 'stack' }, h('h2', null, m.name),
    h('p', { class: 'muted' }, t('gMemberLine', { l: m.level, r: short(m.respect) })),
    boss ? h('h3', { style: 'margin-top:6px' }, t('gRankT')) : null,
    boss ? h('div', { class: 'seg', role: 'group', 'aria-label': t('gRankT'), style: 'margin-bottom:0' }, [0, 1, 2].map((r) => h('button', { 'aria-pressed': r === role ? 'true' : 'false', disabled: cheios.includes(r),
      on: { click: async () => { if (r === role) return; close(); await gAct('gangRole', { name: m.name, role: r }); } } }, t('gRole' + r)))) : null,
    boss ? h('p', { class: 'small muted' }, t('gRoleDo' + role)) : null,
    ...(boss ? cheios.map((r) => h('p', { class: 'small muted' }, t(com(r).length > 1 ? 'gRoleFullN' : 'gRoleFull1', { x: t('gRole' + r).toLowerCase(), a: com(r).join(' · ') }))) : []),
    h('div', { class: 'gsp' }),
    boss ? sureBtn('btn ghost block', t('gMakeBoss'), 'btn pri block', t('gBossSure', { a: m.name }), async () => { close(); await gAct('gangLeader', { name: m.name }); }) : null,
    sureBtn('btn ghost dng block', t('gKick'), 'btn danger block', t('gKickSure', { a: m.name }), async () => { close(); await gAct('gangKick', { name: m.name }); }),
    h('button', { class: 'btn ghost block', on: { click: () => close() } }, t('close'))));
}
// Um botão para o que não se desfaz: o primeiro toque só pede confirmação (muda de cor e de texto), o segundo faz.
function sureBtn(cls, label, clsSure, labelSure, run) {
  const b = h('button', { class: cls, on: { click: () => { if (b.dataset.sure === '1') return run(); b.dataset.sure = '1'; b.className = clsSure; setBtn(b, labelSure); } } }, label);
  return b;
}
// Quem pode o quê: os cargos da gangue, do chefe ao membro, com quem os tem agora.
function gangRanks(mine) {
  const R = S.cfg.gang.roles || { max: [0, 2, 1] }, quem = (r) => mine.roster.filter((x) => (x.role || 0) === r).map((x) => x.name);
  const row = (r) => { const q = quem(r);
    return h('div', { class: 'grk' }, h('div', { class: 'row sp' }, h('b', { class: 'grole r' + r }, r === 3 ? icon('crown') : null, t('gRole' + r)),
      r === 3 || !r ? null : h('span', { class: 'small muted num' }, t('gRoleSeats', { n: q.length, s: R.max[r] }))),
      r && q.length ? h('div', { class: 'gwho' }, q.join(' · ')) : null, h('p', { class: 'small muted' }, t('gRoleDo' + r))); };
  const close = sheet(h('div', { class: 'stack' }, h('h2', null, t('gRolesT')), h('p', { class: 'muted' }, t('gRoleSub')), row(3), row(2), row(1), row(0),
    h('button', { class: 'btn ghost block', on: { click: () => close() } }, t('close'))));
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
    : d.phase === 'spin' && !S.casinoBusy && n < d.nextAt ? t('lvNext', { s: Math.max(1, Math.ceil((d.nextAt - n) / 1000)) })
    : d.phase === 'spin' && document.querySelector('.crz') && !document.querySelector('.crz-go') ? t('czPicking') : d.phase === 'spin' ? t('lvSpin') : t('lvClosed');
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
    const r = g === 'roulette' ? { n: d.res.n, t0: (d.closesAt + LIVE_START) / 1000 } : { ...d.res, round: d.id, mine, from: d.prev, bet: mine?.total || 0, win: mine?.win || 0, mineBets: mine?.bets || [] };
    await Promise.race([(g === 'roulette' ? rlAnim : wheelAnim)(r), wait(g === 'wheel' && d.res.s === 'louca' ? 150000 : 50000)]);   // a Crazy pode ter várias voltas
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
  const what = g === 'roulette' ? t('rlOut', { n: r.n, c: t('rlc_' + rlCol(r.n)) }) : t('wOut', { s: wLabel(r.s) }) + ((r.bonus || (r.top && r.top.s === r.s)) && wMult(r, mine?.flap) !== null ? ' · ×' + wMult(r, mine?.flap) : '');
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
  await wait(900);
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
// a jogada certa vem do servidor (a mesma tabela que usamos nos testes); aqui só se troca pela alternativa quando não há dinheiro para dobrar ou dividir
const bjTipOf = (view, canDbl, canSplit) => (!view?.tip ? null : (view.tip[0] === 'double' && !canDbl) || (view.tip[0] === 'split' && !canSplit) ? view.tip[1] : view.tip[0]);
function screenBJ() {
  const me = S.st.me, view = S.bjView || me.bj, done = S.bjDone, anim = S.bjAnim || {}, chip = chipNow();
  const out = csHead('bj');
  const dl = view ? (done ? view.dl : [view.dl[0], null]) : [];
  const hands = view ? (view.hands || [{ pl: view.pl, tot: view.tot, bet: view.bet }]) : [], two = hands.length > 1, cur = two ? view.cur : 0;
  let k = 0;   // as cartas novas caem uma a seguir à outra, seja qual for a mão
  const row = (cards, from, flipAt) => h('div', { class: 'hand', style: `--n:${cards.length};--m:${Math.max(1, cards.length - 1)}` }, cards.map((c, i) => card(c, i >= from ? 'deal' : i === flipAt ? 'flip' : '', i >= from ? k++ * 260 : 0)));
  const plRows = hands.map((x, i) => {
    const r = row(x.pl, anim.pl ? anim.pl[i] ?? 0 : 99, -1);
    if (!two) return [h('div', { class: 'hlab' }, t('bjYou'), h('b', { class: 'num' }, String(x.tot))), r];
    const tag = x.res ? h('span', { class: 'bjtag ' + (x.res === 'win' ? 'win' : x.res === 'push' ? 'push' : 'lose') }, x.res === 'win' ? '+' + moneyShort(x.win - x.bet) : x.res === 'push' ? t('csPush') : x.res === 'bust' ? t('bjBustS') : '−' + moneyShort(x.bet)) : h('span', { class: 'bjtag' }, moneyShort(x.bet));
    return h('div', { class: 'bjh' + (!done && i === cur ? ' on' : ''), 'aria-current': !done && i === cur ? 'true' : null }, h('div', { class: 'hlab' }, t('bjHandN', { n: i + 1 }), h('b', { class: 'num' }, String(x.tot))), r, tag);
  });
  const dlRow = row(dl, anim.dl ?? 99, anim.flip ? 1 : -1);
  out.push(h('div', { class: 'felt' },
    h('div', { class: 'hlab' }, t('bjDealer'), view ? h('b', { class: 'num' }, done ? String(view.dtot) : '?') : null),
    dlRow,
    done && S.bjLast ? h('div', { class: 'bjres', style: `--d:${S.bjAnim ? 700 : 0}ms` }, csResult(S.bjLast, two ? t('bjTwo') : t('bj_' + S.bjLast.res))) : null,
    two ? h('div', { class: 'hands2' }, plRows) : plRows.flat(),
    !view ? h('p', { class: 'muted small', style: 'text-align:center' }, t('bjRules')) : null));
  const open = me.bj && !done;
  if (open) {
    const canDbl = view.pl.length === 2 && !view.dbl && me.cash >= view.bet, canSplit = !!view.split && me.cash >= view.bet;
    const showTip = store.get('bjTip', true), tip = showTip ? bjTipOf(view, canDbl, canSplit) : null;
    const btn = (op, cls, label, off) => h('button', { class: 'btn big ' + cls + (tip === op ? ' best' : ''), disabled: off || S.casinoBusy, on: { click: () => bjPlay(op) } }, label);
    out.push(h('div', { class: 'stick csbar' },
      h('div', { class: 'bjline' }, h('span', { class: 'muted' }, t(two ? 'bjStakeN' : 'bjStake', { m: money(view.bet), n: cur + 1 })),
        h('button', { class: 'lnk', 'aria-pressed': showTip ? 'true' : 'false', on: { click: () => { store.set('bjTip', !showTip); render(); } } }, tip ? t('bjTipOn', { a: t('bjOp_' + tip) }) : t('bjTipOff'))),
      h('div', { class: 'bjacts' + (view.split ? ' four' : '') },
        btn('hit', '', t('bjHit')), btn('stand', 'buy', t('bjStand')), btn('double', 'ghost', t('bjDouble'), !canDbl),
        view.split ? btn('split', 'ghost', t('bjSplit'), !canSplit) : null)));
  } else {
    out.push(h('div', { class: 'stick csbar' }, chipPicker(),
      h('button', { class: 'btn buy block big', disabled: betMax() < S.cfg.casino.minBet || S.casinoBusy, on: { click: () => bjPlay('deal', chip) } }, t('bjDeal', { m: moneyShort(chip) }))));
  }
  return out;
}
async function bjPlay(op, amt) {
  const prev = op === 'deal' ? null : (S.bjView || S.st.me.bj);
  const r = await play('bj', { op, amt }, async (res) => {
    const h0 = res.hand, now0 = h0.hands || [{ pl: h0.pl }];
    // quantas cartas de cada mão já estavam na mesa: as outras entram a cair
    const old = !prev ? [] : op === 'split' ? [1, 1] : prev.hands ? prev.hands.map((x) => x.pl.length) : [prev.pl.length];
    S.bjAnim = { pl: now0.map((_, i) => old[i] ?? 0), dl: res.done ? (prev ? 1 : 0) : prev ? 99 : 0, flip: res.done && !!prev };
    S.bjView = h0; S.bjDone = res.done; S.bjLast = res.done ? res : null;
    render(true);
    const n = now0.reduce((x, y, i) => x + y.pl.length - S.bjAnim.pl[i], 0) + (res.done ? h0.dl.length - Math.min(S.bjAnim.dl, h0.dl.length) : 0);
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
const topm = () => S.cfg.casino.wheel.topMult || [2, 3, 5, 10, 20, 50];   // os multiplicadores que o topo pode dar (vêm do servidor)
// o multiplicador que conta: na Crazy é o do flapper (sem flapper, o melhor dos três); null enquanto a roda grande não abriu
const wMult = (r, flap) => (r.s !== 'louca' ? r.mult : !r.bonus?.mults ? null : (flap === undefined || flap === null ? Math.max(...r.bonus.mults) : r.bonus.mults[flap]) * (r.tm || 1));
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
  const spots = S.cfg.casino.wheel.spots, TOPM = topm(), rnd = (a) => a[Math.floor(Math.random() * a.length)], HH = 40;
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
    show('th-' + r.s, r.s === 'louca' ? null : h('b', { class: 'wst-name' }, t('wb_' + r.s)));   // a Crazy já traz o nome no centro da roda
    if (r.s === 'moeda') await C3.coinFlip(stage, { sides: r.bonus.sides, side: r.bonus.side, sfx: fx.sfx, L: { red: t('rl_r'), blue: t('wBlue') } });
    else if (r.s === 'caixas') await C3.cashHunt(stage, { secs: 7, boxes: r.bonus.boxes, pick: r.bonus.pick, sfx: fx.sfx, L: { prizes: t('wPrizes'), shuffle: t('wShuffle'), pick: t('wPick') } });
    else if (r.s === 'bola') await C3.pachinko(stage, { slots: r.bonus.slots, at: r.bonus.at, sfx: fx.sfx });
    else {
      // Crazy: escolhe-se o flapper, e só depois de a escolha fechar é que o servidor diz onde a roda grande pára
      const LC = S.cfg.casino.wheel.louca, aposta = (r.mineBets || []).some((b) => b.s === 'louca');
      const abre = async () => {
        for (let k = 0; k < 12; k++) {
          try { const d = await (await fetch('/api/table?g=wheel', { credentials: 'same-origin' })).json(); if (d.now) S.off = d.now - Date.now(); if (d.id === r.round && d.res?.bonus?.stops) return d; if (d.id !== r.round) return null; } catch { /* sem rede: tenta outra vez */ }
          await wait(500);
        }
        return null;
      };
      const out = await CZ.crazyBonus(stage, { segs: LC.segs, flaps: LC.flaps, pickUntil: r.bonus.pickUntil, now, canPick: aposta, sfx: fx.sfx, vibrate: fx.vibrate,
        pick: (c) => act('tableFlap', { c }),
        reveal: async () => { const d = await abre(); if (!d) return null; r.bonus = d.res.bonus; if (d.mine) { r.win = d.mine.win || 0; r.flap = d.mine.flap; r.auto = d.mine.auto; if (r.mine) Object.assign(r.mine, d.mine); } return { stops: d.res.bonus.stops, mults: d.res.bonus.mults, flap: aposta ? d.mine?.flap : null }; },
        L: { colors: [t('czGreen'), t('wBlue'), t('czYellow')], pick: t('czPick'), note: t('czNote'), picked: (f) => t('czPicked', { c: [t('czGreen'), t('wBlue'), t('czYellow')][f].toLowerCase() }), yours: t('czYours'),
          watch: t('czWatch'), auto: t('czAuto'), spin: t('czSpin'), boost: (x) => t('czDblAll', { x }), left: (s) => s + ' s' } });
      r.mult = out ? wMult(r, aposta ? r.flap : null) : wMult(r, r.flap);
    }
  }
  // resultado em grande, com tempo para se ler
  if (r.mult === null || r.mult === undefined) { stage.hidden = true; return; }   // a Crazy não chegou a abrir (ligação perdida): o que se ganhou aparece na mesa
  const net = r.win - r.bet, base = topHit ? r.mult / r.top.m : r.mult;
  show('th-' + r.s + ' res',
    h('span', { class: 'wst-chip', style: `background:${WCOL[r.s]}` }, wLabel(r.s)),
    h('b', { class: 'wst-x' }, r.bonus || topHit ? '×' + r.mult : r.s + ':1'),
    topHit ? h('span', { class: 'wst-sub' }, t('wTopCalc', { a: base, b: r.top.m })) : null,
    // Crazy: o que saiu a cada flapper (o teu em destaque)
    r.s === 'louca' && r.bonus?.mults ? h('span', { class: 'wst-sub czres' }, r.bonus.mults.map((m, f) => h('b', { class: f === r.flap && bet ? 'me' : '', style: `--fc:${CZ.FLAP_COR[f]}` }, '×' + m * (r.tm || 1)))) : null,
    // as contas à vista: quanto estava na casa que saiu, vezes o multiplicador
    bet && (r.bonus || topHit) ? h('span', { class: 'wst-sub' }, t('wCalc', { s: wLabel(r.s), b: money(bet), x: r.mult, w: money(bet * r.mult) })) : null,
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
    /^\d+$/.test(x.s) ? (x.m > +x.s ? x.s + ' ×' + x.m / +x.s : x.s) : wLabel(x.s) + (x.m ? ' ×' + x.m : '')))));
  out.push(liveBar(g));
  out.push(h('div', { class: 'wspots lvboard' }, W.spots.map((s) => h('button', { class: 'wsp' + (res && res.s === s ? ' hit' : ''), style: `--c:${WCOL[s]}`, on: { click: () => liveBet(g, { s, amt: chipNow() }) } },
    h('b', { class: /^\d+$/.test(s) ? '' : 'wd' }, wLabel(s)), h('span', { class: 'small' }, /^\d+$/.test(s) ? s + ':1' : t('wBonus')), bets[s] ? h('span', { class: 'chipm' }, moneyShort(bets[s])) : null))));
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
  const lastRd = last ? last.spin.free.at(-1) || last.spin.base : null, step = lastRd ? lastRd.steps.at(-1) : null;
  const dud = G.kind === 'scatter' && lastRd && !(lastRd.win > 0) && !(G.accAll && last.spin.free.length);   // a rodada que ficou à vista não teve prémio: os multiplicadores dela ficam apagados
  const cells = step ? step.g : Array.from({ length: n }, (_, i) => (Math.imul(i + 7, 2654435761) >>> 9) % G.nsym);   // mistura fixa, sem padrão à vista
  return [G.kind === 'cluster' ? h('div', { class: 'sspots' }, Array.from({ length: n }, (_, i) => { const v = step?.sp?.[i] || 0; return h('i', { class: spotCls(v), dataset: { v } }); })) : null,
    h('div', { class: 'sgrid' }, cells.map((s, i) => { const el = slotCellEl(g, s, step?.o?.[i]); if (dud && s === G.nsym + 1) el.classList.add('dud'); return el; })),
    G.kind === 'cluster' ? h('div', { class: 'ssplab', 'aria-hidden': 'true' }, Array.from({ length: n }, (_, i) => { const v = step?.sp?.[i] || 0; return h('b', { class: 'spl' + (v >= 64 ? ' v64' : v >= 16 ? ' v16' : v >= 8 ? ' v8' : v >= 4 ? ' v4' : '') }, v >= 2 ? '×' + v : ''); })) : null];
}
// Uma queda: no início a grelha toda cai de cima, coluna a coluna; depois de um prémio, o que sobra desce para os buracos
// e os novos entram por cima. Cada célula sabe de quantas casas cai.
// live: a rodada tem prémio, por isso os multiplicadores que caírem vão mesmo contar (só então há trovão, bomba ou moedas)
async function slotStep(g, grid, step, prev, sp, live = true) {
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
  if (G.kind === 'scatter' && !S.slotSkip) {
    const orbs = step.g.map((s, i) => (s === G.nsym + 1 && fresh[i] ? i : -1)).filter((i) => i >= 0);
    if (orbs.length && live && !RM()) await orbShow(g, grid, orbs, sp);
    else if (!live) orbs.forEach((i) => grid.children[i]?.classList.add('dud'));   // caiu numa rodada sem prémio: não multiplica nada, fica apagado
  }
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
  const sl = document.querySelector('.slot'); if (sl && !slotFit(true)) await tableFocus(sl);
  const sk = document.querySelector('.csbar .btn.buy');
  if (sk) { sk.disabled = false; sk.replaceChildren(h('i', { class: 'stopi' })); sk.setAttribute('aria-label', t('slSkip')); sk.classList.replace('buy', 'skip'); const ml = document.querySelector('.smsgl'); if (ml) ml.textContent = t('slWinL'); sk.addEventListener('click', () => { S.slotSkip = true; }); }
  const grid = document.querySelector('.sgrid'), meter = document.querySelector('.swinm'), freeL = document.querySelector('.sfree');
  if (!grid) return;
  const cash = (c) => Math.floor((r.base * Math.min(c, G.max * 100)) / 100);
  let acc = 0, shown = 0; meter.textContent = money(0);
  const show = (c, ms = 450) => { const to = cash(c); if (RM() || S.slotSkip) meter.textContent = money(to); else fx.roll(meter, shown, to, money, ms); shown = to; };
  // os símbolos da jogada anterior caem para fora
  if (!RM()) { [...grid.children].forEach((el, i) => { el.classList.add('out'); el.style.setProperty('--d', (i % G.cols) * 45 + 'ms'); }); fx.sfx('refill'); await wait(330 + G.cols * 45); }
  // fr: só nas rodadas grátis das slots com multiplicador acumulado: { prev: o que estava acumulado antes desta rodada }
  const round = async (rd, sp, mult, fr) => {
    let w = 0;
    const counts = rd.win > 0 || (!!fr && !!G.accAll);   // as esferas desta rodada vão contar?
    for (let k = 0; k < rd.steps.length && !S.slotSkip; k++) {
      await slotStep(g, grid, rd.steps[k], k ? rd.steps[k - 1] : null, sp, counts);
      if (rd.steps[k].w) { w += rd.steps[k].w.reduce((x, y) => x + y.pay, 0); show(acc + w); }
    }
    if (S.slotSkip) return;
    if (fr) {
      // cada esfera voa para o multiplicador acumulado, que sobe à vista; só depois (se houve prémio) o total multiplica
      const sa = freeL.querySelector('.sav'), orbs = counts ? [...grid.querySelectorAll('.orb')] : [];
      if (sa && orbs.length && mult > fr.prev) {
        if (!RM()) {
          const ib = sa.getBoundingClientRect(); let sum = fr.prev;
          for (const el of orbs.slice(0, 12)) {
            const b = el.getBoundingClientRect(), v = parseInt(el.querySelector('.ov')?.textContent.slice(1) || '0', 10);
            el.classList.add('hit');
            const fl = h('b', { class: 'sfly num', style: `left:${b.left + b.width / 2}px;top:${b.top + b.height / 2}px;--x:${ib.left + ib.width / 2 - b.left - b.width / 2}px;--y:${ib.top + ib.height / 2 - b.top - b.height / 2}px` }, '×' + v);
            document.body.append(fl); fx.sfx('tick'); await wait(430 * sp); fl.remove();
            sum += v; sa.textContent = '×' + Math.min(sum, mult); sa.classList.remove('bump'); void sa.offsetWidth; sa.classList.add('bump');
            if (S.slotSkip) break;
          }
        }
        sa.textContent = '×' + mult; sa.classList.remove('bump'); void sa.offsetWidth; sa.classList.add('bump'); freeL._m = mult;
        fx.sfx('claim'); if (!(w > 0)) await wait(RM() ? 150 : 450 * sp);
      }
      if (w > 0 && mult > 1) { flashInfo('×' + mult); fx.sfx('crit'); acc += w * mult; show(acc, 800); await wait(RM() ? 300 : 1000 * sp); }
      else { acc += w; show(acc); if (w > 0) await wait(RM() ? 0 : 350 * sp); }
      return;
    }
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
    // anuncia-se só as rodadas do início: as que saem a meio (scatters outra vez) aparecem na altura, com «+5»
    const F = r.spin.free, f0 = r.spin.free0 ?? F.length;
    await slotBanner('free', t('slFreeT', { n: f0 }), t('slFreeS'), RM() ? 900 : 2600);
    sl?.classList.add('free');
    const before = acc;
    const leftOf = (k) => (k < 0 ? f0 : F[k].left ?? F.length - k - 1);
    const accFree = G.kind === 'scatter' && G.accFree;
    const counter = (n, bump) => {
      const m = freeL._m || 1;   // o multiplicador acumulado que está à vista; quem o sobe é a própria rodada, quando as esferas lá chegam
      freeL.replaceChildren(h('span', { class: 'sleft' + (bump ? ' bump' : '') }, t('slFreeLeft', { n })), accFree ? h('span', { class: 'sacc', title: t('slAcc') }, h('small', null, t('slAccS')), h('b', { class: 'sav num' }, '×' + m)) : '');
    };
    freeL._m = 1;
    for (let k = 0; k < F.length && !S.slotSkip; k++) {
      const f = F[k];
      freeL._k = k; counter(Math.max(0, leftOf(k - 1) - 1));
      await round(f, 0.82, f.acc, accFree ? { prev: k ? F[k - 1].acc || 0 : 0 } : null);
      if (f.add > 0 && !S.slotSkip) {
        grid.querySelectorAll('.scat').forEach((el) => el.classList.add('hit', 'trig'));
        fx.sfx('crit'); fx.vibrate([20, 40, 20]); await wait(RM() ? 150 : 700);
        counter(leftOf(k), true); fx.sfx('level');
        await slotBanner('free more', t('slFreeMore', { n: f.add }), t('slFreeLeft', { n: leftOf(k) }), RM() ? 800 : 1700);
      }
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
  const lim = S.st.me.casinoMax * (S.cfg.casino.buyMaxMult || 1), can = price <= Math.min(lim, S.st.me.cash);   // a compra de bónus tem um teto mais alto do que uma jogada normal
  const close = sheet(h('div', { class: 'stack' }, art('cenas', 'jackpot', 'buyimg'), h('h2', null, t(kind === 2 ? 'slBuySuper' : 'slBuyT')),
    h('p', null, t(G.kind === 'cluster' ? (kind === 2 ? 'slBuyDescSuper' : 'slBuyDescC') : 'slBuyDesc', { n: G.free || G.fs[3], x: mult })),
    h('div', { class: 'row sp' }, h('span', { class: 'muted' }, t('csBet')), h('b', { class: 'num' }, money(chip))),
    h('div', { class: 'row sp' }, h('span', { class: 'muted' }, t('slBuyPrice', { x: mult })), h('b', { class: 'num c-cash' }, money(price))),
    !can ? h('p', { class: 'small c-red' }, price > lim ? t('csOver', { m: money(lim) }) : t('csNoCash', { m: money(price) })) : null,
    h('button', { class: 'btn buy block big', disabled: !can, on: { click: () => { close(); play('slot', { game: g, amt: chip, buy: kind }, slotAnim); } } }, t('slBuyGo', { m: moneyShort(price) }))));
}
// Em ecrãs baixos a slot não cabe inteira entre o topo e a barra de baixo. Em vez de encolher a grelha até ficar minúscula, sobe-se a página
// só o preciso para a fila do botão de rodar ficar à vista, sem nunca esconder a grelha (o cartaz com o nome é o que sai de cena).
function slotFit(smooth) {
  const fr = document.querySelector('.slot .sfr'), row = document.querySelector('.slot .srow'), nav = document.querySelector('.tabs'), hud = document.querySelector('.hud');
  if (!fr || !row || !nav) return false;
  const over = row.getBoundingClientRect().bottom + 6 - nav.getBoundingClientRect().top, room = fr.getBoundingClientRect().top - (hud ? hud.getBoundingClientRect().bottom : 0) - 4;
  if (over <= 0) return row.getBoundingClientRect().top > 0 && fr.getBoundingClientRect().top >= (hud ? hud.getBoundingClientRect().bottom : 0) - 1;   // já está tudo à vista: não é preciso mexer
  if (room <= 0) return true;
  scrollBy({ top: Math.min(over, room), behavior: smooth ? 'smooth' : 'auto' }); return true;
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
  const me = S.st.me, ep = season();
  const tts = (me.titles || []).slice().sort((a, b) => (a.k === 'vet' ? -1 : b.k === 'vet' ? 1 : b.n - a.n || a.pos - b.pos));
  let close;
  const langBtns = h('div', { class: 'seg' }, [['en', 'English'], ['pt', 'Português']].map(([l, n]) => h('button', { 'aria-pressed': lang() === l ? 'true' : 'false', on: { click: async () => { applyLang(l); close(); shell(); render(); openProfile(); try { await api('POST', '/api/lang', { lang: l }); } catch {} } } }, n)));
  const anim = store.get('light', false);
  const animBtns = h('div', { class: 'seg' }, [[false, t('animFull')], [true, t('animLight')]].map(([v, n]) => h('button', { 'aria-pressed': anim === v ? 'true' : 'false', on: { click: () => { store.set('light', v); fx.setLight(v); close(); openProfile(); } } }, n)));
  close = sheet(h('div', { class: 'stack' },
    h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 'small muted' }, t('level') + ' ' + me.level), h('div', { style: 'font-family:var(--disp);font-weight:900;font-size:34px;text-transform:uppercase;line-height:1' }, titleOf(me.level)), h('div', { class: 'muted' }, me.name), me.levelTo ? h('div', { class: 'small muted' }, t('toNext', { n: num(me.levelTo - me.peakRespect), l: me.level + 1 })) : null),
      h('div', { style: 'text-align:right;align-self:start' }, h('div', { class: 'c-resp', style: 'font-weight:800;font-size:20px;white-space:nowrap' }, icon('crown'), ' ' + num(me.respect)))),
    me.ep && ep ? h('button', { class: 'pep', on: { click: () => { close(); S.rankView = 'epoca'; S.rankDiv = null; go('rank'); } } },
      h('b', null, t('seasonN', { n: ep.n + 1 })), h('span', null, (S.st.rank ? t('pepPos', { p: ordOf(S.st.rank), x: divName(me.ep.div) }) : t('pepDiv', { x: divName(me.ep.div) })) + ' · ' + t('pepResp', { r: num(me.ep.score) })),
      h('span', { class: 'small muted' }, t('pepLeft', { t: nb(leftTxt(ep.end - now())) })), h('span', { class: 'chev', 'aria-hidden': 'true' }, '›')) : null,
    me.cls ? h('p', { class: 'small muted', style: 'margin:0' }, t('cl_' + me.cls) + ' · ' + classLines(S.cfg.classes.find((c) => c.id === me.cls)).join(' · ')) : null,
    me.cls ? h('button', { class: 'btn sm', style: 'justify-self:start', on: { click: () => { close(); go('work'); } } }, t('clsChangeT')) : null,
    S.avOk ? h('h2', { class: 'sec', style: 'margin-top:10px' }, t('avatar')) : null,
    S.avOk ? h('div', { class: 'avgrid' }, Array.from({ length: S.cfg.avatars }, (_, i) => h('button', { class: i === me.av ? 'sel' : '', 'aria-label': t('avatar') + ' ' + (i + 1), 'aria-pressed': i === me.av ? 'true' : 'false',
      on: { click: async (e) => { const b = e.currentTarget; if (!(await act('avatar', { i }))) return;   // troca-se no sítio: a folha não fecha nem volta ao cimo
        for (const x of b.parentNode.children) { x.classList.toggle('sel', x === b); x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); } } } }, h('img', { src: AV(i), alt: '', width: 96, height: 96, loading: 'lazy', on: { error: (e) => e.currentTarget.parentNode.remove() } })))) : null,
    tts.length ? h('h2', { class: 'sec', style: 'margin-top:10px' }, t('titlesT')) : null,
    tts.length ? h('div', { class: 'ptits' }, tts.map((x) => x.k === 'vet'
      ? h('div', { class: 'ptit' }, h('span', { class: 'tpos' }, h('img', { src: '/img/ui/coroa.webp?2', alt: '', width: 114, height: 96, decoding: 'async' })), h('div', null, h('div', { class: 'tn' }, t('ttVet')), h('div', { class: 'small muted' }, t('ttVetSub'))))
      : h('div', { class: 'ptit' }, h('b', { class: 'tpos' }, ordOf(x.pos)), h('div', null, h('div', { class: 'tn' }, t('ttEp', { n: x.n + 1 })), h('div', { class: 'small muted' }, t('ttEpSub', { x: divName(x.d) })))))) : null,
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
    h('p', { class: 'muted' }, t('pauseSub', { t: dur(Math.max(0, r.start - now())) })),
    h('p', { class: 'credit' }, h('a', { href: 'https://dinissousa.pt', target: '_blank', rel: 'noopener' }, t('credit')))));
}

// ---------- entrada ----------
function applyLang(l) { setLang(l); setLocale(l); try { localStorage.setItem('cr.lang', l); } catch {} }
// a língua escolhida neste aparelho (texto simples, lido também pelo i18n ao arrancar); sem escolha, vale a da conta
const langSaved = () => { try { return localStorage.getItem('cr.lang'); } catch { return null; } };

async function showLanding(st) {
  $main = null;
  let info = st ? { jogadores: st.players, epoca: st.season } : null;
  if (!info) { try { const r = await fetch('/api/saude'); info = await r.json(); } catch {} }
  const langsw = h('div', { class: 'langsw' }, [['en', 'EN'], ['pt', 'PT']].map(([l, n]) => h('button', { 'aria-pressed': lang() === l ? 'true' : 'false', on: { click: () => { applyLang(l); showLanding(info ? { players: info.jogadores, season: info.epoca } : null); } } }, n)));
  $app.replaceChildren(langsw, h('div', { class: 'land' },
    h('div', { class: 'land-art', 'aria-hidden': 'true' }, h('img', { src: '/img/cenas/entrada-g.webp?10', alt: '', width: 800, height: 800, fetchpriority: 'high', decoding: 'async' })),
    h('div', { class: 'word neon', 'aria-label': 'Crime' }, 'Crime'),
    h('p', { class: 'tag' }, t('tagline')),
    info ? h('div', { class: 'meta' },
      h('span', null, t('playersIn', { n: num(info.jogadores) })),
      info.epoca ? h('span', null, t('seasonEnds', { n: info.epoca.n + 1, t: nb(leftTxt(info.epoca.end - now())) })) : null) : null,
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
  const mailI = h('input', { id: 'em', name: 'email', type: 'email', inputmode: 'email', autocomplete: 'email', autocapitalize: 'none', spellcheck: 'false', required: true, maxlength: 254 });
  const hp = h('input', { class: 'hp', name: 'website', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' });
  const err = h('p', { class: 'err', role: 'alert' });
  const submit = h('button', { class: 'btn pri sodium block', type: 'submit' }, mode === 'register' ? t('register') : t('login'));
  const form = h('form', { novalidate: true, on: { submit: async (e) => {
    e.preventDefault(); err.textContent = ''; submit.disabled = true;
    try {
      const r = await api('POST', mode === 'register' ? '/api/register' : '/api/login', mode === 'register'
        ? { name: nameI.value.trim(), email: mailI.value.trim(), password: passI.value, website: hp.value, lang: lang() }
        : { name: nameI.value.trim(), password: passI.value, lang: lang() });
      if (r.lang && r.lang !== lang()) applyLang(r.lang);
      try { window.estat && window.estat(mode === 'register' ? 'conta_criada' : 'entrou', ''); } catch {}
    } catch (ex) { err.textContent = errText(ex.code); submit.disabled = false; (ex.code === 'BAD_PASSWORD' ? passI : ex.code === 'BAD_EMAIL' || ex.code === 'EMAIL_TAKEN' ? mailI : nameI).focus(); return; }
    // a conta já entrou: se o jogo não abrir à primeira (falha passageira do servidor), tenta outra vez e, se falhar, diz porquê em vez de ficar calado
    close(); await startSafe();
  } } },
    h('h2', { class: 'sec', style: 'margin-top:0' }, mode === 'register' ? t('register') : t('login')),
    h('div', { class: 'field' }, h('label', { for: 'nm' }, t('name')), nameI, mode === 'register' ? h('small', null, t('nameHint')) : null),
    mode === 'register' ? h('div', { class: 'field' }, h('label', { for: 'em' }, t('email')), mailI, h('small', null, t('emailHint'))) : null,
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
    if (st.account?.lang && !langSaved()) applyLang(st.account.lang);
    render();
  } catch {}
}

async function start() {
  [S.cfg] = await Promise.all([S.cfg || api('GET', '/api/config')]);
  const st = await api('GET', '/api/state');
  if (!st.account) { S.st = null; return showLanding(st); }
  S.st = st; S.stAt = now(); if (st.feed) S.feed = st.feed;
  if (st.account.lang && !langSaved()) applyLang(st.account.lang);   // aparelho novo: o jogo abre logo na língua da conta, sem piscar na outra
  $main = null;
  S.tab = store.get('tab', 'city');
  if (st.me) loadFor(S.tab);   // abrir o jogo num sítio guardado (lutas, ranking, bolsa…) também vai buscar os dados dele
  if (SLOT_OF[S.tab]) setTimeout(() => slotFit(), 400);
  render();
  armBack();
  if (st.me) skyline(st.me.level);
  loadEvents(false);
  if (st.me) warmImages();
}
// aquece as imagens dos sítios (as pequenas, que servem de azulejo e de fundo provisório): devagar, uma vez por visita e só com rede decente.
// O service worker guarda-as de vez, por isso da segunda vez em diante abrem logo.
let warmed = false;
function warmImages() {
  if (warmed) return; warmed = true;
  const c = navigator.connection;
  if (c && (c.saveData || /2g/.test(c.effectiveType || ''))) return;
  const urls = [...new Set(Object.values(PLACES).filter((p) => p.img).map((p) => IMG('cenas', p.img)))];
  let i = 0;
  const next = () => { if (i >= urls.length) return; const im = new Image(); im.decoding = 'async'; im.onload = im.onerror = () => setTimeout(next, 150); im.src = urls[i++]; };
  setTimeout(() => { next(); next(); }, 3000);
}

{ const l = guessLang(); setLang(l); setLocale(l); }   // palpite pelo browser, sem o guardar: só fica guardada a língua que o jogador escolher (ou a da conta)
fx.setLight(store.get('light', false));
fx.setSound(store.get('sound', true));
fx.setMusic(store.get('music', true));
// os avatares só aparecem quando as imagens existirem no servidor
{ const pr = new Image(); pr.onload = () => { S.avOk = true; if (S.st?.me && $main) { shell(); render(); } }; pr.src = '/img/av/0.webp?1'; }
setInterval(tickHud, 1000);
setInterval(() => { if (S.st && document.visibilityState === 'visible') { refresh(); loadEvents(false); if (S.tab === 'news' || S.tab === 'city') loadNews(); } }, 30000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.st) refresh(); });
// abre o jogo; uma falha passageira do servidor leva uma segunda tentativa e, se continuar, um aviso (nunca um ecrã calado)
async function startSafe() {
  try { await start(); return; } catch (e) { if (e.code === 'LOGIN_REQUIRED') return; }
  await new Promise((r) => setTimeout(r, 900));
  try { await start(); } catch (e) {
    if (e.code === 'LOGIN_REQUIRED') return;
    if (!S.st) showLanding();
    if (e.code) toast(errText(e.code === 'default' ? 'SERVER' : e.code), true); else console.error(e);
  }
}
startSafe();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
