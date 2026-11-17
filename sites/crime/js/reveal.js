// Abrir uma caixa para ver o que vem lá dentro. Hoje: o contentor do porto.
// A caixa (a «pele») é só o desenho e a maneira de abrir. O resto é comum e serve para a próxima (a mala do aeroporto):
// pedir ao servidor no toque, mostrar o que saiu com os números reais, saltar ao segundo toque, respeitar a redução de movimento.
import { h } from './ui.js';
import * as fx from './fx.js';

const parado = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// Uma linha de tempo que se pode saltar: os passos que faltam correm logo, por ordem, e as animações acabam no último quadro.
function linha() {
  let saltou = false;
  const pend = new Set(), anims = new Set();
  return {
    get saltou() { return saltou; },
    em(ms, fn) {
      if (saltou || ms <= 0) return fn();
      const rec = { fn, id: setTimeout(() => { pend.delete(rec); fn(); }, ms) };
      pend.add(rec);
    },
    anim(el, quadros, o) {
      const a = el.animate(quadros, { fill: 'both', ...o, duration: saltou ? 0 : o.duration, delay: saltou ? 0 : o.delay || 0 });
      anims.add(a); a.finished.then(() => anims.delete(a), () => anims.delete(a));
      return a;
    },
    saltar() {
      if (saltou) return;
      saltou = true;
      for (const a of anims) { try { a.finish(); } catch { /* já tinha acabado */ } }
      const fila = [...pend]; pend.clear();
      for (const r of fila) { clearTimeout(r.id); r.fn(); }
    },
  };
}

// ---------- o que aparece lá dentro ----------
// Cada peça diz onde fica (b) e de onde entra (a). As transformações vão por extenso, sem variáveis de CSS,
// para a entrada funcionar também nos browsers que não as aceitam dentro de uma animação.
const peca = (el, a, b) => { el.style.transform = b; return { el, a, b }; };
// fotografias (17/11): o contentor, o interior, o cadeado, as notas e os caixotes deixaram de ser desenhos
const OBJ = (n) => `/img/obj/${n}.webp?1`;
const foto = (n, cls) => h('img', { class: cls, src: OBJ(n), alt: '', draggable: 'false', decoding: 'async' });
// maços de notas empilhados em pirâmide, de baixo para cima
function notas(n) {
  const out = [];
  let fila = 0, naFila = 0, cabem = 5;
  for (let i = 0; i < n; i++) {
    if (naFila >= cabem) { fila++; naFila = 0; cabem = Math.max(2, cabem - 1); }
    const x = 50 + (naFila - (cabem - 1) / 2) * 17 + (fila % 2 ? 1.5 : 0), r = ((i * 37) % 7) - 3;
    out.push(peca(foto('notas', 'bd'), `translate(-50%,26px) rotate(${r}deg) scale(.7)`, `translate(-50%,0) rotate(${r}deg)`));
    Object.assign(out.at(-1).el.style, { left: x + '%', bottom: 8 + fila * 9.5 + '%' });
    naFila++;
  }
  return out;
}
// a droga vem em caixotes de madeira: três em baixo e dois por cima (o que é e quanto é diz-se no resultado, com a imagem dela)
const caixotes = () => [[27, 9, -2], [50, 8, 1], [73, 9, 2], [38.5, 31, 1], [61.5, 31, -2]].map(([x, y, r]) => {
  const p = peca(foto('caixote', 'cx'), `translate(-50%,26px) rotate(${r}deg) scale(.7)`, `translate(-50%,0) rotate(${r}deg)`);
  Object.assign(p.el.style, { left: x + '%', bottom: y + '%' });
  return p;
});
// a fita da polícia: duas tiras cruzadas, cada uma a entrar do seu lado
const fita = (txt) => [['a', -11, -1], ['b', 9, 1]].map(([c, r, lado]) =>
  peca(h('div', { class: 'tp ' + c }, h('span', null, Array(6).fill(txt).join('  ·  '))), `translate(${-50 + lado * 130}%,-50%) rotate(${r}deg)`, `translate(-50%,-50%) rotate(${r}deg)`));

// a fotografia do contentor é vermelha; para a cor de cada transportadora roda-se o tom e acerta-se a saturação e a luz
function tom(hex) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  let hh = 0; if (d) hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  const cl = (v, a, z) => Math.min(z, Math.max(a, v));
  return `hue-rotate(${Math.round(hh * 60 - 4)}deg) saturate(${cl(s / 0.55, 0.15, 1.6).toFixed(2)}) brightness(${cl(l / 0.3, 0.8, 1.45).toFixed(2)})`;
}
// ---------- pele: contentor visto de frente (fotografia), com as duas portas e um cadeado ----------
// marca: o nome (inventado) da transportadora, pintado na porta; codigo: [prefixo, número] do contentor
export function contentor({ cor, marca, codigo }) {
  const lock = h('div', { class: 'ct-lock' }, foto('cadeado'));
  const porta = (lado, ...dentro) => h('div', { class: 'ct-door ' + lado }, foto('contentor', 'ph'), ...dentro);
  const L = porta('l', h('div', { class: 'ct-nm' }, marca));
  const R = porta('r', h('div', { class: 'ct-code' }, ...codigo.map((x) => h('b', null, x)), h('span'), h('span'), h('span')));
  const fill = h('div', { class: 'ct-fill' });
  const el = h('div', { class: 'ct', style: `--ct:${cor};--ctf:${tom(cor)}` }, foto('contentor', 'ct-frame'), h('div', { class: 'ct-in' }, foto('contentor-dentro', 'ct-room'), h('div', { class: 'ct-glow' }), h('div', { class: 'ct-cop' }), fill), L, R, lock);
  const C = 'translate(-50%,-50%)', ABERTA = (lado) => ({ transform: `rotateY(${lado * 108}deg)`, filter: 'brightness(.45)' });
  return {
    el, fill,
    // enquanto o servidor não responde, o cadeado abana
    abanar: () => lock.animate([{ transform: C + ' rotate(0)' }, { transform: C + ' rotate(-11deg)' }, { transform: C + ' rotate(9deg)' }, { transform: C + ' rotate(-4deg)' }, { transform: C + ' rotate(0)' }], { duration: 260, iterations: Infinity }),
    // o cadeado salta e cai; só depois as portas rodam para fora, a escurecer
    abrir(T, D) {
      T.anim(lock, [{ transform: C + ' rotate(0)', opacity: 1 }, { transform: 'translate(-50%,-90%) rotate(-14deg)', opacity: 1, offset: 0.3 }, { transform: 'translate(-50%,170%) rotate(34deg)', opacity: 0 }], { duration: D(280), easing: 'cubic-bezier(.4,0,.9,.5)' });
      T.em(D(230), () => {
        fx.sfx('door');
        const o = { duration: D(760), easing: 'cubic-bezier(.2,.85,.25,1)' };
        T.anim(L, [{ transform: 'rotateY(0deg)', filter: 'brightness(1)' }, ABERTA(-1)], o);
        T.anim(R, [{ transform: 'rotateY(0deg)', filter: 'brightness(1)' }, ABERTA(1)], o);
      });
      return D(230) + D(330);   // a esta altura já se vê lá para dentro
    },
    // sem movimento: o mesmo fim (portas abertas, sem cadeado), mas de uma vez
    abrirParado(T) {
      T.anim(lock, [{ opacity: 0 }, { opacity: 0 }], { duration: 0 });
      T.anim(L, [ABERTA(-1), ABERTA(-1)], { duration: 0 }); T.anim(R, [ABERTA(1), ABERTA(1)], { duration: 0 });
      return 0;
    },
  };
}

// ---------- a cena ----------
// o = { pele, fundo, passo, titulo, sub, toque, aCortar, rotulo, sair, pedir(), mostrar(res), botoes(res) }
//   passo        → «Contentor 1 de 3» (ou nada); sair → rótulo do X, que fecha sem abrir
//   pedir()      → pede ao servidor; devolve o resultado, ou null se falhou (o erro já foi mostrado)
//   mostrar(res) → { tom: 'cash' | 'goods' | 'lost', de, ate, fmt, linha, sub, notas, img, fita }   (img: miniatura ao lado do número)
//   botoes(res)  → [{ texto, cls, fazer }]   (fazer corre depois de a cena fechar)
// Devolve uma promessa com o resultado, quando a cena fecha.
export function caixa(o) {
  return new Promise((resolve) => {
    const calmo = parado(), D = fx.dur, T = linha();
    let estado = 'espera', res = null, feito = false;
    const big = h('div', { class: 'rv-big num' }), line = h('div', { class: 'rv-line' }), sub = h('div', { class: 'rv-sub' });
    const prompt = h('div', { class: 'rv-prompt' }, o.toque);
    const th = h('img', { class: 'rv-th', alt: '', width: 600, height: 600, hidden: true });
    const out = h('div', { class: 'rv-res', 'aria-live': 'polite' }, h('div', { class: 'rv-num' }, th, big), line, sub), btns = h('div', { class: 'rv-btns' });
    const x = h('button', { class: 'rv-x', type: 'button', 'aria-label': o.sair, on: { click: () => { if (estado === 'espera') fechar(); } } }, '×');
    const palco = h('button', { class: 'rv-stage', type: 'button', 'aria-label': o.rotulo }, o.pele.el, h('span', { class: 'rv-floor' }));
    const ov = h('div', { class: 'overlay rv is-wait', role: 'dialog', 'aria-modal': 'true', 'aria-label': o.titulo, style: o.fundo ? `--bg:url(${o.fundo})` : '' },
      x, h('div', { class: 'rv-in' }, h('div', { class: 'rv-head' }, o.passo ? h('div', { class: 'rv-step' }, o.passo) : null, h('div', { class: 'rv-k' }, o.titulo), h('div', { class: 'rv-s' }, o.sub)), palco, h('div', { class: 'rv-txt' }, prompt, out), btns));
    document.querySelectorAll('.overlay.rv').forEach((e) => e.remove());
    document.body.appendChild(ov);
    if (!calmo) palco.animate([{ transform: 'translateY(-26px) scale(.96)', opacity: 0 }, { transform: 'translateY(4px) scale(1.01)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], { duration: D(420), easing: 'cubic-bezier(.2,.8,.3,1)' });
    palco.focus({ preventScroll: true });

    const fechar = (depois) => {
      if (feito) return; feito = true;
      document.removeEventListener('keydown', tecla);
      const a = ov.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 170 });
      a.onfinish = () => { ov.remove(); resolve(res); if (depois) depois(); };
    };
    const tecla = (e) => { if (e.key === 'Escape' && (estado === 'espera' || estado === 'fim')) fechar(); };
    document.addEventListener('keydown', tecla);

    // o resultado: o que está lá dentro, o número grande e os botões
    const revelar = () => {
      const v = o.mostrar(res);
      estado = 'anim'; ov.classList.remove('is-busy'); ov.classList.add('is-open', 't-' + v.tom);
      const itens = v.tom === 'cash' ? notas(document.body.classList.contains('light') ? Math.min(6, v.notas) : v.notas) : v.tom === 'goods' ? caixotes() : fita(v.fita);
      if (v.img) { th.src = v.img; th.hidden = false; }
      o.pele.fill.replaceChildren(...itens.map((x) => x.el));
      prompt.remove();
      const t0 = calmo ? o.pele.abrirParado(T) : (fx.sfx('clank'), fx.vibrate(18), o.pele.abrir(T, D));
      T.em(t0, () => {
        ov.classList.add('lit');
        fx.sfx(v.tom === 'cash' ? 'claim' : v.tom === 'goods' ? 'pop' : 'bust'); fx.vibrate(v.tom === 'lost' ? [40, 60, 40] : 12);
        itens.forEach((x, i) => T.anim(x.el, [{ transform: x.a, opacity: 0 }, { transform: x.b, opacity: 1 }],
          { duration: D(v.tom === 'lost' ? 320 : 280), delay: D(i * (v.tom === 'cash' ? 38 : v.tom === 'goods' ? 80 : 120)), easing: v.tom === 'lost' ? 'cubic-bezier(.2,.8,.2,1)' : 'cubic-bezier(.2,.9,.3,1.2)' }));
      });
      T.em(t0 + D(260), () => {
        big.className = 'rv-big num ' + (v.tom === 'lost' ? 'c-red' : 'c-cash');
        line.textContent = v.linha; sub.textContent = v.sub || '';
        out.classList.add('on');
        if (T.saltou || v.de === v.ate) big.textContent = v.fmt(v.ate);
        else { big.textContent = v.fmt(v.de); fx.roll(big, v.de, v.ate, v.fmt, 620); }   // acaba antes de os botões aparecerem
      });
      T.em(t0 + D(900), () => {
        if (T.saltou) fx.roll(big, v.ate, v.ate, v.fmt);   // saltou-se a meio da contagem: fica logo no valor certo
        btns.replaceChildren(...o.botoes(res).map((b) => h('button', { class: b.cls, type: 'button', on: { click: () => fechar(b.fazer) } }, b.texto)));
        btns.classList.add('on'); estado = 'fim';
        btns.firstChild?.focus({ preventScroll: true });
      });
      if (calmo) T.saltar();
    };

    palco.addEventListener('click', async () => {
      if (estado === 'anim') return T.saltar();   // segundo toque: salta para o fim
      if (estado !== 'espera') return;
      estado = 'pedido'; ov.classList.replace('is-wait', 'is-busy'); prompt.textContent = o.aCortar; x.remove();
      const abana = calmo ? null : o.pele.abanar();
      fx.sfx('tick');
      const [r] = await Promise.all([o.pedir(), espera(calmo ? 0 : D(520))]);   // o cadeado abana pelo menos meio segundo, mesmo que o servidor responda logo
      abana?.cancel();
      if (feito) return;
      if (!r) return fechar();
      res = r; revelar();
    });
    ov.addEventListener('click', (e) => { if (estado === 'anim' && !palco.contains(e.target)) T.saltar(); });
  });
}
