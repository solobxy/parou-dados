// Prisão (v75, pedido de 17/11, 04:10): cada coisa que se faz lá dentro tem uma cena curta com objetos fotografados
// (cartas, luvas, telemóvel, matrícula, colher). O resultado vem sempre do servidor; a cena só o mostra.
// Nas cartas, as duas cartas mostradas são as que o servidor tirou: ganha a mais alta, por isso a sorte vê-se.
import { h } from './ui.js';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const OBJ = (n) => `/img/obj/${n}.webp?1`;
const pic = (n, cls) => h('img', { class: cls, src: OBJ(n), alt: '', draggable: 'false', decoding: 'async' });
const wait = (ms) => new Promise((r) => setTimeout(r, reduced() ? 0 : ms));

// carta: 0 a 51; valor = id >> 2 (0 = 2 … 12 = ás), naipe = id & 3
const SUITS = ['♠', '♥', '♦', '♣'];
const rankTxt = (id, lang) => {
  const v = id >> 2;
  if (v <= 8) return String(v + 2);
  return (lang === 'pt' ? ['V', 'D', 'R', 'A'] : ['J', 'Q', 'K', 'A'])[v - 9];
};
function card(id, lang, who) {
  const red = (id & 3) === 1 || (id & 3) === 2, r = rankTxt(id, lang), s = SUITS[id & 3];
  return h('div', { class: 'pc2 ' + who },
    h('div', { class: 'pc2-in' },
      h('div', { class: 'pc2-back' }, pic('carta-costas', 'pc2-ph')),
      h('div', { class: 'pc2-front' + (red ? ' red' : '') }, pic('carta-frente', 'pc2-ph'),
        h('span', { class: 'pc2-c tl' }, r, h('i', null, s)), h('span', { class: 'pc2-mid' }, s), h('span', { class: 'pc2-c br' }, r, h('i', null, s)))));
}

// a folha por cima do ecrã: fecha com o botão (ou com o «outra vez», que joga logo outra)
function sheet(cls, stage, foot) {
  const el = h('div', { class: 'jsc ' + cls, role: 'dialog', 'aria-modal': 'true' }, h('div', { class: 'jsc-card' }, stage, foot));
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  return el;
}
function close(el) { el.classList.remove('in'); setTimeout(() => el.remove(), reduced() ? 0 : 180); }

// o pé da folha: a linha do resultado, uma linha de apoio, e os botões
function foot(o) {
  const res = h('p', { class: 'jsc-res ' + (o.good ? 'c-cash' : 'c-red') }), sub = h('p', { class: 'small muted jsc-sub' });
  const btns = h('div', { class: 'jsc-btns' });
  const box = h('div', { class: 'jsc-foot' }, res, sub, btns);
  return { box, set(main, small, good) { res.textContent = main; res.className = 'jsc-res ' + (good ? 'c-cash' : 'c-red'); sub.textContent = small || ''; box.classList.add('on'); }, btns };
}

// ---------- cartas ----------
export async function cartas({ r, t, money, lang, again, bet }) {
  const [mine, theirs] = r.cards;
  const his = card(theirs, lang, 'his'), my = card(mine, lang, 'mine');
  const stage = h('div', { class: 'jsc-stage cartas' }, pic('mesa', 'jsc-bg'),
    h('div', { class: 'pc2-deck' }, pic('carta-costas', 'pc2-ph')),
    h('span', { class: 'jsc-lbl his' }, t('jcHim')), his, my, h('span', { class: 'jsc-lbl mine' }, t('jcYou')));
  const F = foot({});
  const el = sheet('k-cartas', stage, F.box);
  await wait(60); his.classList.add('dealt');
  await wait(220); my.classList.add('dealt');
  await wait(420); his.classList.add('up');
  await wait(520); my.classList.add('up');
  await wait(380);
  (r.win ? my : his).classList.add('wins'); stage.classList.add('done');
  const today = r.today || { n: 0, w: 0 };
  F.set(t(r.win ? 'jcWon' : 'jcLost', { m: money(Math.abs(r.money)) }), t('jcToday', { w: today.w, n: today.n }), r.win);
  F.btns.append(
    h('button', { class: 'btn buy block', on: { click: () => { close(el); again(bet); } } }, t('jcAgain', { m: money(bet) })),
    h('button', { class: 'btn ghost block', on: { click: () => close(el) } }, t('jscClose')));
}

// ---------- pátio: duas luvas, três trocas de golpes ----------
export async function patio({ r, t, money, again }) {
  const stage = h('div', { class: 'jsc-stage patio' }, h('div', { class: 'jsc-floor' }), pic('luvas', 'jsc-obj luvas'));
  const F = foot({});
  const el = sheet('k-patio', stage, F.box);
  for (let i = 0; i < 3; i++) { await wait(260); stage.classList.remove('hit'); void stage.offsetWidth; stage.classList.add('hit'); }
  await wait(420);
  stage.classList.add(r.win ? 'won' : 'lost');
  F.set(t(r.win ? 'jyWon' : 'jyLost', { m: money(Math.abs(r.money)) }), t('jyStat', { n: r.value }), r.win);
  F.btns.append(
    h('button', { class: 'btn buy block', on: { click: () => { close(el); again(); } } }, t('jyAgain')),
    h('button', { class: 'btn ghost block', on: { click: () => close(el) } }, t('jscClose')));
}

// ---------- contrabando: o telemóvel vai para dentro do pão; às vezes a lanterna do guarda apanha-o ----------
export async function contrabando({ r, t, money, again }) {
  const phone = pic('telemovel', 'jsc-obj tlm'), stage = h('div', { class: 'jsc-stage contra' }, pic('pao', 'jsc-obj pao'), phone, h('div', { class: 'jsc-torch' }));
  const F = foot({});
  const el = sheet('k-contra', stage, F.box);
  await wait(120); stage.classList.add('hide');
  await wait(700);
  if (r.lost) { stage.classList.add('caught'); await wait(650); }
  else stage.classList.add('safe');
  F.set(r.lost ? t('jsLost') : t('jsSold', { m: money(r.money) }), r.lost ? t('jsLostSub') : '', !r.lost);
  F.btns.append(
    h('button', { class: 'btn buy block', on: { click: () => { close(el); again(); } } }, t('jsAgain')),
    h('button', { class: 'btn ghost block', on: { click: () => close(el) } }, t('jscClose')));
}

// ---------- oficina: a prensa bate três vezes na matrícula ----------
export async function oficina({ r, t, money, again }) {
  const chars = 'AA-00-AA'.split('').map((c) => (c === '-' ? '-' : c === 'A' ? String.fromCharCode(65 + Math.floor(Math.random() * 26)) : String(Math.floor(Math.random() * 10))));
  const txt = h('div', { class: 'jsc-plate-txt' }, chars.map((c) => h('span', null, c)));
  const stage = h('div', { class: 'jsc-stage ofi' }, h('div', { class: 'jsc-plate' }, pic('matricula', 'jsc-obj plate'), txt), h('div', { class: 'jsc-press' }));
  const F = foot({});
  const el = sheet('k-ofi', stage, F.box);
  const spans = [...txt.children];
  for (let i = 0; i < 3; i++) {
    await wait(300); stage.classList.remove('slam'); void stage.offsetWidth; stage.classList.add('slam');
    spans.slice(Math.round((i * spans.length) / 3), Math.round(((i + 1) * spans.length) / 3)).forEach((s) => s.classList.add('on'));
  }
  await wait(380);
  F.set(t('jwDone', { m: money(r.money) }), t('jwSub'), true);
  F.btns.append(
    h('button', { class: 'btn buy block', on: { click: () => { close(el); again(); } } }, t('jwAgain')),
    h('button', { class: 'btn ghost block', on: { click: () => close(el) } }, t('jscClose')));
}

// ---------- fuga: a colher raspa a parede; ou se vê a luz lá fora, ou toca a sirene ----------
export async function fuga({ r, t, minTxt }) {
  const stage = h('div', { class: 'jsc-stage fuga' }, pic('parede', 'jsc-bg'), h('div', { class: 'jsc-hole' }), pic('colher', 'jsc-obj colher'), h('div', { class: 'jsc-siren' }));
  const F = foot({});
  const el = sheet('k-fuga', stage, F.box);
  stage.classList.add('dig');
  await wait(1400);
  stage.classList.remove('dig'); stage.classList.add(r.free ? 'free' : 'caught');
  await wait(500);
  F.set(r.free ? t('jeFree') : t('jeCaught'), r.free ? t('jeFreeSub') : t('jeCaughtSub', { t: minTxt(r.add) }), !!r.free);
  F.btns.append(h('button', { class: 'btn buy block', on: { click: () => close(el) } }, t(r.free ? 'jeOut' : 'jscClose')));
}
