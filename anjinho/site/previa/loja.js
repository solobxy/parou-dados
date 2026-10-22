// anjinho · pré-visualização da loja
// Peças fictícias, saco partilhado entre páginas (guardado neste navegador) e painel do saco.
// Ainda não há pagamentos: o checkout é só para ver como fica.

const PECAS = [
  {
    id: 'botas-nuvem', nome: 'botas nuvem', preco: 59.90,
    curta: 'camurça, renda e uma gola de pelo que parece uma nuvem.',
    desc: 'camurça sintética macia, uma faixa de renda de croché e uma gola de pelo sintético fofinha. sola alta, leve e com aderência para os dias de chuva. atam-se com um cordão e um lacinho.',
    nota: 'a peça do drop ♡',
    detalhes: ['exterior: camurça sintética', 'gola: pelo sintético', 'renda: croché de algodão', 'sola: borracha, 4 cm', 'forro quentinho por dentro'],
    tamanhos: ['36', '37', '38', '39', '40'],
    cores: [
      { nome: 'bege', hex: '#E9DCCB', imgs: [['botas_bege_2.webp', 'nuvem'], ['botas_bege_2m.webp', 'ceu'], ['det_bege.webp', 'foto']] },
      { nome: 'chocolate', hex: '#6B4632', imgs: [['botas_choc_1.webp', 'nuvem'], ['botas_choc_1m.webp', 'rosa'], ['det_choc.webp', 'foto']] }
    ],
    autocolante: ['laco', 'riscas']
  },
  {
    id: 'necessaire-bambi', nome: 'necessaire bambi', preco: 24.90,
    curta: 'pelo com pintas de bambi e a nossa etiqueta.',
    desc: 'pelo sintético macio com pintas de bambi, fecho de correr e a etiqueta anjinho à frente. cabe a maquilhagem toda e ainda sobra espaço para mais um batom.',
    nota: 'para a mala de todos os dias',
    detalhes: ['pelo sintético', 'forro interior lavável', 'fecho de correr', 'cerca de 22 × 12 × 12 cm'],
    tamanhos: ['único'],
    cores: [{ nome: 'bambi', hex: '#B07A4F', imgs: [['bambi_1.webp', 'nuvem'], ['bambi_1.webp', 'ceu'], ['det_bambi.webp', 'foto']] }],
    autocolante: ['coracao', 'pixel']
  },
  {
    id: 'necessaire-corca', nome: 'necessaire corça', preco: 27.90,
    curta: 'creme e caramelo, com um laço no fecho.',
    desc: 'pelo sintético em creme e caramelo, um laço de cetim no fecho e um pendente pequenino de corça. é fofa por fora e arrumada por dentro.',
    nota: 'a irmã da bambi',
    detalhes: ['pelo sintético', 'laço de cetim com pendente', 'forro interior lavável', 'cerca de 22 × 13 × 11 cm'],
    tamanhos: ['único'],
    cores: [{ nome: 'corça', hex: '#D9B48F', imgs: [['corca_1.webp', 'nuvem'], ['corca_2.webp', 'rosa'], ['det_corca.webp', 'foto']] }],
    autocolante: ['borboleta', 'papel']
  }
];

const IMG = '/previa/img/';
const eur = n => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(n);

// ---- saco (guardado no navegador; se não der, fica só em memória)
const LOJA = {
  chave: 'anjinho-saco-previa', mem: [],
  ler() { try { const v = JSON.parse(localStorage.getItem(this.chave)); if (Array.isArray(v)) return v; } catch (_) {} return this.mem; },
  guardar(l) { this.mem = l; try { localStorage.setItem(this.chave, JSON.stringify(l)); } catch (_) {} LOJA.mostrar(); },
  total(l) { return (l || this.ler()).reduce((s, i) => s + i.preco * i.qtd, 0); },
  quantos(l) { return (l || this.ler()).reduce((s, i) => s + i.qtd, 0); },
  adicionar(item) {
    const l = this.ler(); const k = item.id + '|' + (item.cor || '') + '|' + (item.tam || '') + '|' + (item.para || '');
    const ex = l.find(i => i.k === k);
    if (ex && !item.para) ex.qtd = Math.min(9, ex.qtd + 1); else l.push(Object.assign({ k, qtd: 1 }, item));
    this.guardar(l); abrirSaco();
  },
  mudar(k, d) { const l = this.ler(); const i = l.find(x => x.k === k); if (!i) return; i.qtd += d; this.guardar(i.qtd <= 0 ? l.filter(x => x !== i) : l); },
  tirar(k) { this.guardar(this.ler().filter(x => x.k !== k)); },
  limpar() { this.guardar([]); },
  mostrar() { if (window.atualizaSaco) atualizaSaco(this.quantos()); desenharSaco(); }
};

// ---- painel do saco
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
(function () {
  const css = `
  .ps{position:fixed;inset:0;z-index:70;display:none}
  .ps.aberto{display:block}
  .ps .fundo{position:absolute;inset:0;background:rgba(29,23,25,.35);opacity:0;transition:opacity .3s}
  .ps .painel{position:absolute;top:0;right:0;bottom:0;width:min(420px,92vw);background:#FBF7F2;display:flex;flex-direction:column;transform:translateX(100%);transition:transform .45s cubic-bezier(.2,.7,.1,1)}
  .ps.vis .fundo{opacity:1}.ps.vis .painel{transform:none}
  .ps header{display:flex;align-items:center;justify-content:space-between;padding:18px 20px 10px}
  .ps h2{font-family:"Inter Display","Inter",sans-serif;font-weight:800;font-size:30px;letter-spacing:-.04em}
  .ps .x{min-width:44px;min-height:44px;border:0;background:none;font:600 14px "Inter",system-ui,sans-serif;cursor:pointer;color:#1D1719}
  .ps .faixa{margin:0 20px;background:#DCE8F2;padding:10px 12px;font-size:14px}
  .ps .lista{flex:1;overflow:auto;padding:8px 20px}
  .ps .it{display:grid;grid-template-columns:76px 1fr auto;gap:12px;align-items:center;padding:14px 0;border-bottom:1px dashed #ecdde2}
  .ps .it .im{width:76px;height:76px;background:#F1E6E4;border-radius:50% 50% 8px 8px;display:flex;align-items:center;justify-content:center}
  .ps .it img{max-width:88%;max-height:88%}
  .ps .it b{font-weight:600;font-size:15px;display:block}
  .ps .it small{font-size:13px;color:#5d5056;display:block;margin-top:2px}
  .ps .qt{display:flex;align-items:center;gap:2px;margin-top:8px}
  .ps .qt button{width:34px;height:34px;border:1.5px solid #1D1719;background:#fff;cursor:pointer;font:600 16px "Inter",system-ui,sans-serif;color:#1D1719}
  .ps .qt span{min-width:26px;text-align:center;font-size:15px}
  .ps .qt .tira{width:auto;height:auto;border:0;background:none;font-size:13px;color:#5d5056;text-decoration:underline;cursor:pointer;margin-left:8px;min-height:34px}
  .ps .pr{font-size:15px;font-weight:600;align-self:start;margin-top:4px}
  .ps .vazio{padding:40px 0;text-align:center}
  .ps .vazio p{font-family:"Chorus","TeX Gyre Chorus",cursive;font-size:28px}
  .ps .vazio a{display:inline-block;margin-top:16px;background:#F6B8C8;padding:14px 20px;font-weight:600;text-decoration:none;color:#1D1719}
  .ps footer{padding:16px 20px calc(18px + env(safe-area-inset-bottom));border-top:2px dashed #F6B8C8;display:block;font-size:14px;color:#1D1719}
  .ps .linha{display:flex;justify-content:space-between;margin-top:6px}
  .ps .linha.tot{font-size:18px;font-weight:600;margin-top:10px}
  .ps .iva{font-size:12px;color:#5d5056;margin-top:4px}
  .ps .fin{display:flex;align-items:center;justify-content:space-between;margin-top:14px;background:#1D1719;color:#FBF7F2;min-height:56px;padding:0 20px;font-weight:600;text-decoration:none}
  `;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  const d = document.createElement('div'); d.className = 'ps'; d.id = 'ps'; d.hidden = true;
  d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-labelledby', 'psT');
  d.innerHTML = `<div class="fundo" data-fs></div><div class="painel" tabindex="-1"><header><h2 id="psT">o teu saco</h2><button class="x" data-fs>fechar</button></header>
   <p class="faixa">♡ envio grátis para portugal continental</p><div class="lista" id="psL"></div><footer id="psF"></footer></div>`;
  document.body.appendChild(d);
  d.addEventListener('click', e => {
    if (e.target.closest('[data-fs]')) return fecharSaco();
    const b = e.target.closest('[data-k]'); if (!b) return;
    if (b.dataset.a === 'mais') LOJA.mudar(b.dataset.k, 1);
    if (b.dataset.a === 'menos') LOJA.mudar(b.dataset.k, -1);
    if (b.dataset.a === 'tirar') LOJA.tirar(b.dataset.k);
  });
  addEventListener('keydown', e => { if (e.key === 'Escape' && !d.hidden) fecharSaco(); });
})();
function desenharSaco() {
  const L = document.getElementById('psL'), F = document.getElementById('psF'); if (!L) return;
  const l = LOJA.ler();
  if (!l.length) { L.innerHTML = `<div class="vazio"><p>o teu saco está vazio ♡</p><a href="/previa/#drop">ver o drop 01</a></div>`; F.innerHTML = ''; return; }
  L.innerHTML = l.map(i => `<div class="it"><div class="im">${i.img ? `<img src="${esc(i.img)}" alt="">` : ''}</div>
    <div><b>${esc(i.nome)}</b><small>${[i.cor, i.tam && i.tam !== 'único' ? 'tam. ' + i.tam : '', i.para ? 'para ' + i.para : ''].filter(Boolean).map(esc).join(' · ')}</small>
    <div class="qt">${i.para ? '' : `<button data-k="${esc(i.k)}" data-a="menos" aria-label="menos um">−</button><span>${i.qtd}</span><button data-k="${esc(i.k)}" data-a="mais" aria-label="mais um">+</button>`}<button class="tira" data-k="${esc(i.k)}" data-a="tirar">tirar</button></div></div>
    <span class="pr">${eur(i.preco * i.qtd)}</span></div>`).join('');
  const t = LOJA.total(l);
  F.innerHTML = `<div class="linha"><span>subtotal</span><span>${eur(t)}</span></div><div class="linha"><span>envio</span><span>grátis</span></div>
    <div class="linha tot"><span>total</span><span>${eur(t)}</span></div><p class="iva">IVA incluído</p>
    <a class="fin" href="/previa/checkout/">finalizar compra <span aria-hidden="true">→</span></a>`;
}
let _ultimoFoco = null;
function abrirSaco() {
  const d = document.getElementById('ps'); if (!d) return; desenharSaco(); _ultimoFoco = document.activeElement;
  d.hidden = false; d.classList.add('aberto'); requestAnimationFrame(() => { d.classList.add('vis'); d.querySelector('.painel').focus({ preventScroll: true }); });
  document.body.style.overflow = 'hidden';
}
function fecharSaco() {
  const d = document.getElementById('ps'); d.classList.remove('vis'); document.body.style.overflow = '';
  setTimeout(() => { d.classList.remove('aberto'); d.hidden = true; }, 400);
  if (_ultimoFoco && _ultimoFoco.focus) _ultimoFoco.focus();
}
document.addEventListener('DOMContentLoaded', () => {
  const s = document.getElementById('saco'); if (s) s.addEventListener('click', abrirSaco);
  LOJA.mostrar();
});
addEventListener('pageshow', () => LOJA.mostrar());

// ---- nuvens para trás das peças
const NUVENS = [
  'M40 190 C 6 186, 4 130, 46 122 C 40 74, 96 56, 124 86 C 140 34, 214 24, 238 74 C 262 40, 330 50, 330 102 C 376 98, 400 150, 370 176 C 396 214, 352 246, 314 230 C 290 258, 230 256, 210 234 C 182 258, 124 256, 106 230 C 80 248, 34 232, 40 190 Z',
  'M30 170 C 4 150, 18 104, 60 108 C 62 62, 120 48, 146 78 C 170 30, 250 36, 260 86 C 300 58, 366 82, 352 132 C 396 146, 392 206, 350 212 C 344 248, 288 254, 264 232 C 236 258, 176 256, 158 230 C 128 252, 74 244, 70 210 C 34 216, 14 196, 30 170 Z',
  'M52 176 C 14 168, 20 112, 64 116 C 72 70, 132 64, 150 100 C 176 48, 252 52, 266 104 C 306 80, 368 110, 350 156 C 392 176, 374 232, 330 226 C 312 256, 252 258, 232 232 C 204 256, 142 254, 128 226 C 92 246, 44 224, 52 176 Z'
];
const CORES_NUVEM = ['#F6E4E8', '#ECEFF3', '#F1E6E4'];
