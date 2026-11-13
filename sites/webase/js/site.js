// webase — site público: montra com separadores, cartão de carimbos, entradas suaves, menu do telemóvel e lugares de fundador.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

// montra do herói: trocar a captura ao escolher um separador (setas também funcionam)
for (const tabs of $$('[role=tablist][data-palco]')) {
  const palco = document.getElementById(tabs.dataset.palco);
  const legenda = document.getElementById(tabs.dataset.legenda);
  const botoes = $$('[role=tab]', tabs);
  const escolher = (b, foco) => {
    botoes.forEach((x) => { const sim = x === b; x.setAttribute('aria-selected', String(sim)); x.tabIndex = sim ? 0 : -1; });
    [...palco.children].forEach((el) => el.classList.toggle('ativa', el.dataset.vista === b.dataset.vista));
    if (legenda && b.dataset.legenda) legenda.textContent = b.dataset.legenda;
    if (foco) b.focus();
    window.estat?.('montra', b.dataset.vista);
  };
  botoes.forEach((b, i) => {
    b.addEventListener('click', () => escolher(b));
    b.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') escolher(botoes[(i + 1) % botoes.length], true);
      if (e.key === 'ArrowLeft') escolher(botoes[(i - 1 + botoes.length) % botoes.length], true);
    });
  });
}

// entradas das secções e carimbos: uma vez, quando aparecem
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver((ents) => {
    for (const e of ents) if (e.isIntersecting) { e.target.classList.add(e.target.classList.contains('cartao-c') ? 'carimbar' : 'visto'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -12% 0px' });
  $$('.surge, .cartao-c').forEach((el) => io.observe(el));
} else {
  $$('.surge').forEach((el) => el.classList.add('visto'));
  $$('.cartao-c').forEach((el) => el.classList.add('carimbar'));
}

// menu do telemóvel
const bMenu = $('.menu-tel');
const folhaMenu = $('#menu-folha');
if (bMenu && folhaMenu) {
  bMenu.addEventListener('click', () => {
    const aberto = folhaMenu.classList.toggle('aberto');
    bMenu.setAttribute('aria-expanded', String(aberto));
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && folhaMenu.classList.contains('aberto')) { folhaMenu.classList.remove('aberto'); bMenu.setAttribute('aria-expanded', 'false'); bMenu.focus(); } });
}

// lugares de fundador (número real, vindo da base de dados)
const lugares = $$('[data-fundadores]');
if (lugares.length) {
  fetch('/api/publico/estado').then((r) => r.ok ? r.json() : null).then((d) => {
    if (!d) return;
    for (const el of lugares) {
      if (d.fundadores_restantes > 0) el.textContent = d.fundadores_restantes === 1 ? 'Resta 1 lugar de fundador' : `Restam ${d.fundadores_restantes} lugares de fundador`;
      else el.closest('[data-bloco-fundadores]')?.remove();
    }
  }).catch(() => {});
}

// cliques nas ações principais (estatísticas sem cookies)
$$('[data-estat]').forEach((el) => el.addEventListener('click', () => window.estat?.('cta', el.dataset.estat)));
