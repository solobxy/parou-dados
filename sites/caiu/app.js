/* caiu.pt — dados em /dados/*.json (escritos por caiu/recolher.py todos os dias) */
(() => {
  'use strict';
  const LOJAS = { c: 'Continente', p: 'Pingo Doce', a: 'Auchan' };
  const COD = { continente: 'c', pingodoce: 'p', auchan: 'a' };
  const BASE = { c: 'https://www.continente.pt', p: 'https://www.pingodoce.pt', a: 'https://www.auchan.pt' };
  const IMGPRE = [
    'https://www.continente.pt/dw/image/v2/BDVS_PRD/on/demandware.static/-/Sites-col-master-catalog/default/',
    'https://static.pingodoce.pt/dw/image/v2/BLJJ_PRD/on/demandware.static/-/Sites-pingo-doce-master/default/',
    'https://www.auchan.pt/dw/image/v2/BFRC_PRD/on/demandware.static/-/Sites-auchan-pt-master-catalog/default/'
  ];
  const CARIMBO = { real: 'A sério', fachada: 'Fachada', pvpr: 'Sobre o PVPR', promo: 'Promoção' };
  const $ = (s, el = document) => el.querySelector(s);
  const reduzido = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const NB = ' ';

  let R = null;            // resumo do dia
  let G = null;            // Map id -> produto (lista completa)
  let carregarLista = null;
  const conhecidos = new Map(); // produtos já vistos (destaques), para abrir a folha sem a lista completa

  // ---------- utilitários ----------
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const nf = new Intl.NumberFormat('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const ni = new Intl.NumberFormat('pt-PT');
  const eur = v => v == null ? '' : nf.format(v) + NB + '€';
  const precoHTML = v => `<span class="preco">${nf.format(v)}<span class="eur">€</span></span>`;
  const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const pct = (de, para) => Math.round((de - para) / de * 100);
  const dataLonga = iso => {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-PT', { day: 'numeric', month: 'long' }) + ', às ' + d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
  };
  const naLoja = c => 'No ' + LOJAS[c];
  const igual = (a, b) => Math.abs(a - b) < 0.005;
  const juntar = xs => xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' e ' + xs[xs.length - 1];
  // onde está mais barato: «no Continente», «no Continente e no Pingo Doce» ou «igual nas três»
  function ondeMaisBarato(g) {
    const m = g.o.filter(o => igual(o.p, g.min)).map(o => o.l);
    if (g.o.length > 1 && m.length === g.o.length) return g.o.length === 3 ? 'mesmo preço nas três lojas' : 'mesmo preço nas duas lojas';
    return (g.o.length > 1 ? 'mais barato ' : '') + juntar(m.map(l => 'no ' + LOJAS[l]));
  }
  const destaca = (g, o) => g.o.length > 1 && igual(o.p, g.min) && !g.o.every(x => igual(x.p, g.min));

  function imgUrl(s) {
    if (!s) return '';
    const k = s.indexOf('|');
    if (k > 0 && k < 3) {
      const pre = ((R && R.img) || IMGPRE)[+s.slice(0, k)];
      if (pre) return pre + s.slice(k + 1) + '?sw=240&sh=240&sm=fit';
    }
    return s;
  }
  function dec(a) {
    const g = {
      i: a[0], n: a[1], m: a[2], q: a[3], c: a[4], img: imgUrl(a[5]), v: a[6], dif: a[8], pc: a[9],
      o: a[7].map(x => ({ l: x[0], id: x[1], p: x[2], pu: x[3], u: x[4], a: x[5], r: x[6], t: x[7], v: x[8], m: x[9] || [], url: x[10], d: x[11] }))
    };
    g.min = Math.min(...g.o.map(o => o.p));
    if (!conhecidos.has(g.i)) conhecidos.set(g.i, g);
    return g;
  }
  const qtdTexto = q => (q || '').replace(/^emb\.\s*/i, '').replace(/(\d)\.(\d)/g, '$1,$2').replace(/\bKg\b/g, 'kg').replace(/\bgr\b/g, 'g').replace(/\blt\b/g, 'L');
  const imgHTML = (g, cls, tam) => g.img
    ? `<img class="${cls}" src="${esc(g.img)}" alt="" width="${tam}" height="${tam}" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-letra="${esc((g.n || '?')[0])}">`
    : `<div class="${cls} et__img--vazio" aria-hidden="true">${esc((g.n || '?')[0])}</div>`;

  function aviso(txt) {
    const el = $('#aviso');
    el.textContent = txt;
    el.hidden = false;
    clearTimeout(aviso.t);
    aviso.t = setTimeout(() => { el.hidden = true; }, 2600);
  }

  // imagem que falha: troca por uma letra
  document.addEventListener('error', e => {
    const im = e.target;
    if (im.tagName !== 'IMG' || !im.dataset.letra) return;
    const d = document.createElement('div');
    d.className = im.className + ' et__img--vazio';
    d.setAttribute('aria-hidden', 'true');
    d.textContent = im.dataset.letra;
    im.replaceWith(d);
  }, true);

  // ---------- motivos ----------
  const ORDEM = { outra: 0, antes: 1, igual: 2, min30: 3, pvpr: 4 };
  function motivo(o, g, curto) {
    const fr = [];
    const ms = [...o.m].sort((a, b) => ORDEM[a[0]] - ORDEM[b[0]]);
    for (const m of (curto ? ms.slice(0, 1) : ms)) {
      if (m[0] === 'min30') fr.push(`Está mais barato do que em qualquer um dos ${m[2]} dias anteriores. O mínimo tinha sido ${eur(m[1])}.`);
      if (m[0] === 'outra') fr.push(`${naLoja(COD[m[1]])} está mais barato: ${eur(m[2])}.`);
      if (m[0] === 'antes') fr.push(`O preço riscado (${eur(m[1])}) não aparece nos nossos registos: nos últimos ${m[3]} dias o mais alto foi ${eur(m[2])}.`);
      if (m[0] === 'igual') fr.push(`Nos últimos 30 dias já esteve a ${eur(m[1])}. Esta promoção não é o preço mais baixo do mês.`);
      if (m[0] === 'pvpr') fr.push(`O desconto é calculado sobre o PVPR de ${eur(m[1])}, o preço recomendado pela marca, e não sobre o preço a que a loja vendia.`);
    }
    if (o.v === 'pvpr' && g && g.o.length > 1 && igual(o.p, g.min)) {
      const outras = g.o.filter(x => x !== o);
      if (outras.every(x => igual(x.p, o.p))) fr.push(`${outras.length > 1 ? 'As outras lojas vendem' : `${naLoja(outras[0].l)} vende`} ao mesmo preço${outras.some(x => x.v) ? '' : ', sem anunciar desconto'}.`);
      else if (outras.some(x => igual(x.p, o.p))) fr.push('Mesmo assim, ninguém o vende mais barato.');
      else fr.push(`Mesmo assim, é o mais barato ${g.o.length === 3 ? 'das três lojas' : 'das duas lojas que o vendem'}.`);
    }
    if (o.v === 'promo' && !fr.length) fr.push(o.d < 7 ? 'Ainda temos poucos dias de registos para confirmar este desconto.' : 'Não encontrámos nada que contradiga esta promoção.');
    return fr.join(' ');
  }
  function etiquetaPromo(o) {
    const partes = [];
    if (o.r && o.p < o.r) partes.push(`−${pct(o.r, o.p)}${NB}% sobre o PVPR <span class="riscado">${eur(o.r)}</span>`);
    else if (o.a && o.p < o.a) partes.push(`antes <span class="riscado">${eur(o.a)}</span>`);
    if (o.t && !/^-?\d+%? sobre PVPR$/i.test(o.t.replace(/\s/g, '')) && !(o.r && /PVPR/i.test(o.t))) partes.push(esc(o.t));
    return partes.join(' · ');
  }

  // ---------- etiquetas ----------
  function cartao(g, foco) {
    const o = foco || g.o.find(x => x.v === g.v) || g.o[0];
    const outras = g.o.filter(x => x !== o).sort((a, b) => a.p - b.p);
    const tag = etiquetaPromo(o);
    const li = document.createElement('li');
    li.className = 'et';
    li.innerHTML = `
      <div class="et__cab">${imgHTML(g, 'et__img', 84)}<div><h3 class="et__nome"><a href="#p=${encodeURIComponent(g.i)}">${esc(g.n)}</a></h3><p class="et__q">${esc(qtdTexto(g.q))}</p></div></div>
      ${o.v ? `<span class="carimbo carimbo--${o.v}">${CARIMBO[o.v]}</span>` : ''}
      <div class="et__fita"><div class="et__loja">${LOJAS[o.l]}${tag ? `<small>${tag}</small>` : ''}</div>${precoHTML(o.p)}</div>
      ${outras.length ? `<ul class="et__outras">${outras.map(x => `<li class="${destaca(g, x) && x.p < o.p - 0.005 ? 'melhor' : ''}"><span>${LOJAS[x.l]}</span><b>${eur(x.p)}</b></li>`).join('')}</ul>` : ''}
      <p class="et__motivo">${motivo(o, g, true)}</p>`;
    return li;
  }

  function linha(g, extra) {
    const li = document.createElement('li');
    li.className = 'ln';
    const ord = [...g.o].sort((a, b) => a.p - b.p);
    const varias = g.o.length > 1;
    li.innerHTML = `
      ${imgHTML(g, 'ln__img', 64)}
      <p class="ln__nome"><a href="#p=${encodeURIComponent(g.i)}">${esc(g.n)}</a></p>
      ${precoHTML(g.min)}
      <p class="ln__meta"><span>${esc(qtdTexto(g.q))}</span>${ord.map(o => `<span class="${destaca(g, o) ? 'melhor' : ''}">${LOJAS[o.l]} <b>${eur(o.p)}</b></span>`).join('')}${extra || ''}</p>
      <div class="ln__pe">${g.v ? `<span class="carimbo carimbo--${g.v}">${CARIMBO[g.v]}</span>` : ''}</div>`;
    li.querySelector('.ln__pe').append(botaoLista(g.i));
    return li;
  }

  // ---------- animações (carimbos e barras), só quando aparecem ----------
  const obs = ('IntersectionObserver' in window && !reduzido) ? new IntersectionObserver(ents => {
    for (const e of ents) {
      if (!e.isIntersecting) continue;
      const el = e.target;
      if (el.classList.contains('carimbo')) { el.classList.remove('espera'); el.classList.add('bate'); }
      else el.classList.remove('espera');
      obs.unobserve(el);
    }
  }, { rootMargin: '0px 0px -12% 0px' }) : null;
  function animar(raiz) {
    if (!obs) return;
    raiz.querySelectorAll('.carimbo:not(.carimbo--fixo):not(.bate)').forEach(c => { c.classList.add('espera'); obs.observe(c); });
  }

  // ---------- secções do dia ----------
  const vistos = new Set();
  function preencher(ul, gs, fazer, n = 6) {
    const els = gs.map(g => { vistos.add(g.i); return fazer(g); });
    ul.replaceChildren(...els.slice(0, n));
    animar(ul);
    const resto = els.slice(n);
    let bt = ul.nextElementSibling;
    if (bt && bt.classList.contains('mais')) bt.remove();
    if (!resto.length) return;
    bt = Object.assign(document.createElement('button'), { type: 'button', className: 'botao botao--leve mais', textContent: `Ver mais ${resto.length}` });
    bt.addEventListener('click', () => { ul.append(...resto); animar(ul); bt.remove(); });
    ul.after(bt);
  }
  function mostrarResumo() {
    const r = R;
    $('#talaoHora').textContent = new Date(r.atualizado).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', ' ·');
    const v = { ofertas: r.ofertas, promos: r.promos, pvpr: r.pvpr, outra: r.outra };
    document.querySelectorAll('#talaoLinhas dd').forEach(dd => { dd.textContent = ni.format(v[dd.dataset.k] ?? 0); });
    document.querySelectorAll('#talaoLinhas > div').forEach(d => { if (!d.querySelector('.pontos')) d.querySelector('dt').after(Object.assign(document.createElement('span'), { className: 'pontos', ariaHidden: 'true' })); });
    $('#talaoPe').textContent = `${ni.format(r.produtos)} produtos, ${ni.format(r.iguais)} encontrados em mais de uma loja`;
    $('#talaoDia').classList.add('imprime');
    $('#rodapeDados').textContent = `Preços recolhidos a ${dataLonga(r.atualizado)}, nas lojas online do Continente, Pingo Doce e Auchan. Podem mudar durante o dia.`;

    // em promoção e mais caro ao lado
    const fach = (r.fachada || []).map(dec);
    if (fach.length) {
      $('#fachadaLead').innerHTML = `Hoje, <strong>${ni.format(r.outra)} produtos</strong> em promoção estão mais baratos noutro supermercado. Estes são os casos com maior diferença.`;
      preencher($('#fachadaLista'), fach, g => cartao(g, g.o.find(o => o.m.some(m => m[0] === 'outra'))));
      $('#fachada').hidden = false;
    }

    // cabaz
    const cb = r.cabaz;
    if (cb && cb.n >= 5) {
      const ord = Object.keys(cb.totais).sort((a, b) => cb.totais[a] - cb.totais[b]);
      const max = Math.max(...Object.values(cb.totais));
      const div = cb.dividir || Math.min(...Object.values(cb.totais));
      const poup = cb.totais[ord[0]] - div;
      const p1 = v => (v < 1 ? v.toLocaleString('pt-PT', { maximumFractionDigits: 1 }) : Math.round(v)) + NB + '%';
      $('#cabazLead').innerHTML = `Somámos <strong>${ni.format(cb.n)} produtos</strong> iguais à venda nos três. Os totais quase empatam, mas cada loja ganha nalguns: o Continente em ${ni.format(cb.vence.c)}, o Pingo Doce em ${ni.format(cb.vence.p)} e o Auchan em ${ni.format(cb.vence.a)}.` +
        (poup > 0.5 ? ` Comprar cada coisa onde está mais barata poupa <strong>${eur(poup)}</strong>.` : '');
      const linhaBarra = (nome, sub, v, cls, mais) => `
        <li class="barra${cls}">
          <div class="barra__topo"><span class="barra__loja">${nome}<small>${sub}</small></span>${precoHTML(v).replace('class="preco"', 'class="preco barra__total"')}</div>
          <div class="barra__pista" aria-hidden="true"><div class="barra__enche" style="width:${(v / max * 100).toFixed(1)}%">${mais ? `<div class="barra__mais" style="width:${mais.toFixed(1)}%"></div>` : ''}</div></div>
        </li>`;
      const ol = $('#cabazBarras');
      ol.innerHTML = ord.map(c => linhaBarra('Tudo no ' + LOJAS[c], `+${eur(cb.totais[c] - div)} (${p1((cb.totais[c] - div) / div * 100)} mais)`, cb.totais[c], '', (cb.totais[c] - div) / cb.totais[c] * 100)).join('') +
        (poup > 0.5 ? linhaBarra('Cada coisa no mais barato', 'dividindo a compra pelas lojas', div, ' barra--melhor', 0) : '');
      $('#cabaz').hidden = false;
      if (obs) { ol.classList.add('espera'); obs.observe(ol); }
    }

    // PVPR
    const pv = (r.pvpr_top || []).map(dec);
    if (pv.length) {
      $('#pvprLead').innerHTML = `PVPR é o preço de venda recomendado pela marca. Hoje, <strong>${ni.format(r.pvpr)} das ${ni.format(r.promos)} promoções</strong> (${Math.round(r.pvpr / r.promos * 100)}${NB}%) calculam o desconto sobre ele, e não sobre o preço a que a loja vendia antes.`;
      preencher($('#pvprLista'), pv, g => cartao(g, g.o.find(o => o.m.some(m => m[0] === 'pvpr'))));
      $('#pvpr').hidden = false;
    }

    // o mesmo produto, outro preço
    const dif = (r.diferenca || []).map(dec).filter(g => !vistos.has(g.i));
    if (dif.length) {
      $('#t-dif').textContent = `O mesmo produto, até ${dif[0].pc}${NB}% mais caro`;
      $('#difLead').textContent = 'Mesmo nome, mesma marca, mesmo tamanho. Só muda a loja.';
      preencher($('#difLista'), dif, g => linha(g, `<span class="ln__dif">+${eur(g.dif)} (${g.pc}${NB}%)</span>`));
      $('#diferenca').hidden = false;
    }

    // desceram a sério
    const reais = (r.reais || []).map(dec);
    $('#reais').hidden = false;
    if (reais.length) {
      $('#reaisLead').textContent = 'Preços de hoje abaixo de todos os dos 30 dias anteriores.';
      preencher($('#reaisLista'), reais, g => cartao(g, g.o.find(o => o.v === 'real')));
    } else {
      const ini = new Date((r.inicio_historico || r.dia) + 'T12:00:00');
      const pronto = new Date(ini.getTime() + 7 * 864e5);
      const d = pronto.toLocaleDateString('pt-PT', { day: 'numeric', month: 'long' });
      $('#reaisLead').innerHTML = (Date.now() < pronto.getTime())
        ? `Para dizer que um preço desceu mesmo, comparamos com os dias anteriores. Começámos a guardar os preços a ${ini.toLocaleDateString('pt-PT', { day: 'numeric', month: 'long' })}: as primeiras descidas confirmadas aparecem a <strong>${d}</strong>.`
        : 'Hoje não encontrámos nenhum preço abaixo do mínimo dos 30 dias anteriores.';
    }
  }

  async function iniciar() {
    try {
      const resp = await fetch('/dados/resumo.json', { cache: 'no-cache' });
      if (!resp.ok) throw new Error(resp.status);
      R = await resp.json();
      mostrarResumo();
    } catch (e) {
      $('#talaoHora').textContent = 'sem dados';
      $('#talaoPe').textContent = 'Estamos a recolher os preços de hoje. Volta daqui a pouco.';
    }
    desenharLista();
    if (lerLista().length) obterLista().then(desenharLista).catch(() => {});
    rotas();
  }

  // ---------- lista completa (só quando é precisa) ----------
  function obterLista() {
    if (!carregarLista) {
      carregarLista = fetch('/dados/lista.json', { cache: 'no-cache' })
        .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(j => {
          G = new Map();
          for (const a of j.g) {
            const g = dec(a);
            conhecidos.set(g.i, g);
            g.k = norm(`${g.n} ${g.m} ${g.q}`);
            G.set(g.i, g);
          }
          return G;
        })
        .catch(e => { carregarLista = null; throw e; });
    }
    return carregarLista;
  }

  // ---------- pesquisa ----------
  let resultados = [], mostrados = 0, ultimaQ = '';
  function procurar(q) {
    const t = norm(q).split(/[^a-z0-9%]+/).filter(x => x.length > 0);
    if (!t.length) return [];
    const testes = t.map(x => {
      const alts = [x];
      if (x.length > 4 && x.endsWith('s')) alts.push(x.slice(0, -1));
      if (x.length > 4 && x.endsWith('es')) alts.push(x.slice(0, -2));
      return alts.map(a => new RegExp('(^|[^a-z0-9])' + a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    });
    const out = [];
    for (const g of G.values()) {
      if (!testes.every(alts => alts.some(re => re.test(g.k)))) continue;
      const nome = norm(g.n);
      let s = g.o.length * 2;
      if (nome.startsWith(t[0])) s += 3;
      if (testes[0].some(re => re.test(nome))) s += 2;
      if (g.v === 'fachada' || g.v === 'real') s += 1;
      out.push([s, g]);
    }
    out.sort((a, b) => b[0] - a[0] || a[1].min - b[1].min);
    return out.map(x => x[1]);
  }
  async function pesquisar(q, rolar) {
    q = q.trim();
    const sec = $('#resultados');
    if (!q) { sec.hidden = true; return; }
    sec.hidden = false;
    $('#t-res').textContent = `«${q}»`;
    $('#resInfo').textContent = 'A procurar…';
    try { await obterLista(); } catch (e) {
      $('#resInfo').textContent = 'Não conseguimos abrir os preços agora. Tenta outra vez daqui a pouco.';
      return;
    }
    resultados = procurar(q);
    mostrados = 0;
    $('#resLista').replaceChildren();
    if (!resultados.length) {
      $('#resInfo').textContent = `Não encontrámos «${q}». Experimenta uma palavra só (ex.: «azeite» em vez de «azeite virgem extra 750 ml»). Por agora seguimos os produtos mais comprados de cada loja.`;
    } else {
      $('#resInfo').textContent = `${ni.format(resultados.length)} ${resultados.length === 1 ? 'produto' : 'produtos'}. O preço grande é o mais baixo das lojas onde existe.`;
      maisResultados();
    }
    if (q !== ultimaQ) { ultimaQ = q; window.estat('pesquisa', q.slice(0, 60)); }
    if (rolar) sec.scrollIntoView({ behavior: reduzido ? 'auto' : 'smooth', block: 'start' });
  }
  function maisResultados() {
    const fatia = resultados.slice(mostrados, mostrados + 20);
    mostrados += fatia.length;
    const ol = $('#resLista');
    ol.append(...fatia.map(g => linha(g)));
    animar(ol);
    $('#resMais').hidden = mostrados >= resultados.length;
  }
  $('#resMais').addEventListener('click', maisResultados);
  $('#busca').addEventListener('submit', e => {
    e.preventDefault();
    const q = $('#q').value;
    history.replaceState(null, '', q.trim() ? '#q=' + encodeURIComponent(q.trim()) : location.pathname);
    pesquisar(q, true);
    $('#q').blur();
  });
  let tDig;
  $('#q').addEventListener('input', () => {
    clearTimeout(tDig);
    const q = $('#q').value;
    if (q.trim().length < 3) return;
    tDig = setTimeout(() => pesquisar(q, false), 260);
  });
  $('#q').addEventListener('focus', () => { obterLista().catch(() => {}); }, { once: true });
  $('#limparBusca').addEventListener('click', () => {
    $('#q').value = '';
    $('#resultados').hidden = true;
    history.replaceState(null, '', location.pathname);
    $('#q').focus();
  });

  // ---------- a minha lista ----------
  const CHAVE = 'caiu-lista';
  function lerLista() { try { return JSON.parse(localStorage.getItem(CHAVE)) || []; } catch (e) { return []; } }
  function gravarLista(l) { try { localStorage.setItem(CHAVE, JSON.stringify(l)); } catch (e) { /* modo privado: fica só nesta visita */ } memoria = l; }
  let memoria = null;
  const lista = () => memoria || (memoria = lerLista());
  const naLista = id => lista().some(x => x.i === id);

  function botaoLista(id) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'add';
    b.dataset.lista = id;
    atualizarBotao(b);
    return b;
  }
  function atualizarBotao(b) {
    const em = naLista(b.dataset.lista);
    b.setAttribute('aria-pressed', em ? 'true' : 'false');
    b.textContent = em ? 'Na lista' : 'Pôr na lista';
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-lista]');
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    const id = b.dataset.lista;
    let l = lista().slice();
    if (l.some(x => x.i === id)) { l = l.filter(x => x.i !== id); aviso('Tirado da lista'); }
    else { l.push({ i: id, n: 1 }); aviso('Posto na lista'); window.estat('lista', 'pôr'); }
    gravarLista(l);
    document.querySelectorAll(`[data-lista="${CSS.escape(id)}"]`).forEach(atualizarBotao);
    obterLista().then(desenharLista).catch(desenharLista);
    desenharLista();
  });

  function desenharLista() {
    const l = lista();
    const n = l.reduce((s, x) => s + x.n, 0);
    $('#nLista').hidden = !l.length;
    $('#nLista').textContent = n;
    const caixa = $('#talaoLista');
    if (!l.length) {
      caixa.innerHTML = '<p class="talao__vazio">Ainda não tens nada na lista. Procura um produto lá em cima e carrega em «Pôr na lista».</p>';
      return;
    }
    const prod = id => (G && G.get(id)) || conhecidos.get(id);
    const itens = l.map(x => ({ x, g: prod(x.i) }));
    const tot = { c: 0, p: 0, a: 0 }, falta = { c: 0, p: 0, a: 0 };
    let dividir = 0, semPreco = 0;
    for (const { x, g } of itens) {
      if (!g) { semPreco++; continue; }
      for (const c of 'cpa') {
        const o = g.o.find(o => o.l === c);
        if (o) tot[c] += o.p * x.n; else falta[c]++;
      }
      dividir += g.min * x.n;
    }
    const lojas = Object.keys(tot).filter(c => tot[c] > 0 || !falta[c]);
    const completas = lojas.filter(c => !falta[c]);
    const melhor = (completas.length ? completas : lojas).sort((a, b) => (falta[a] - falta[b]) || (tot[a] - tot[b]))[0];
    const linhas = itens.map(({ x, g }) => {
      if (!g) return `<div class="tl"><span class="tl__nome">Produto que já não encontramos<small>Tira-o da lista</small></span><span class="pontos" aria-hidden="true"></span><button class="tl__tirar" type="button" data-tirar="${esc(x.i)}" aria-label="Tirar da lista">×</button></div>`;
      const o = g.o.reduce((a, b) => (b.p < a.p ? b : a));
      return `<div class="tl">
        <span class="tl__nome"><a href="#p=${encodeURIComponent(g.i)}">${esc(g.n)}</a><small>${esc(qtdTexto(g.q))} · ${ondeMaisBarato(g)}</small></span>
        <span class="tl__qtd"><button type="button" data-qtd="${esc(x.i)}" data-d="-1" aria-label="Menos um">−</button><span>${x.n}</span><button type="button" data-qtd="${esc(x.i)}" data-d="1" aria-label="Mais um">+</button></span>
        <span class="pontos" aria-hidden="true"></span>
        <span class="tl__val">${eur(o.p * x.n)}</span>
        <button class="tl__tirar" type="button" data-tirar="${esc(x.i)}" aria-label="Tirar ${esc(g.n)} da lista">×</button>
      </div>`;
    }).join('');
    const ord = lojas.slice().sort((a, b) => (falta[a] - falta[b]) || (tot[a] - tot[b]));
    const somas = ord.map(c => `<div class="soma${c === melhor ? ' soma--melhor' : ''}">
        <span class="soma__loja">Tudo no ${LOJAS[c]}<small>${falta[c] ? `faltam ${falta[c]} ${falta[c] === 1 ? 'produto' : 'produtos'}` : (c === melhor ? 'a loja mais barata para esta lista' : igual(tot[c], tot[melhor]) ? 'o mesmo total' : `+${eur(tot[c] - tot[melhor])}`)}</small></span>
        <span class="pontos" aria-hidden="true"></span>${precoHTML(tot[c]).replace('class="preco"', 'class="preco soma__val"')}</div>`).join('');
    const poup = melhor ? tot[melhor] - dividir : 0;
    caixa.innerHTML = `
      <div class="talao__cab"><strong>A tua lista</strong><span>${n} ${n === 1 ? 'artigo' : 'artigos'}</span></div>
      ${linhas}
      <div class="somas">${G || conhecidos.size ? somas : ''}</div>
      ${poup > 0.05 && completas.length ? `<p class="dividir">Se comprares cada coisa onde está mais barata, pagas <strong>${eur(dividir)}</strong>: menos ${eur(poup)} do que tudo no ${LOJAS[melhor]}.</p>` : ''}
      ${semPreco ? '<p class="dividir">Há produtos sem preço hoje: não entram nas contas.</p>' : ''}
      <div class="lista__acoes"><button class="botao botao--pequeno" type="button" id="partilharLista">Enviar a lista</button><button class="botao botao--leve botao--pequeno" type="button" id="limparLista">Limpar a lista</button></div>`;
  }
  $('#talaoLista').addEventListener('click', e => {
    const t = e.target.closest('[data-tirar]');
    const q = e.target.closest('[data-qtd]');
    if (t) {
      gravarLista(lista().filter(x => x.i !== t.dataset.tirar));
      document.querySelectorAll(`[data-lista="${CSS.escape(t.dataset.tirar)}"]`).forEach(atualizarBotao);
      desenharLista();
    } else if (q) {
      const l = lista().map(x => x.i === q.dataset.qtd ? { ...x, n: Math.max(1, Math.min(99, x.n + +q.dataset.d)) } : x);
      gravarLista(l);
      desenharLista();
    } else if (e.target.id === 'limparLista') {
      const b = e.target;
      if (b.dataset.confirmar) { gravarLista([]); document.querySelectorAll('[data-lista]').forEach(atualizarBotao); desenharLista(); aviso('Lista limpa'); }
      else { b.dataset.confirmar = '1'; b.textContent = 'Carrega outra vez para limpar'; setTimeout(() => { if (b.isConnected) { delete b.dataset.confirmar; b.textContent = 'Limpar a lista'; } }, 3500); }
    } else if (e.target.id === 'partilharLista') {
      partilhar();
    }
  });
  async function partilhar() {
    const prod = id => (G && G.get(id)) || conhecidos.get(id);
    const linhas = lista().map(x => { const g = prod(x.i); if (!g) return null; return `${x.n} × ${g.n} ${qtdTexto(g.q)}: ${eur(g.min)} (${ondeMaisBarato(g)})`; }).filter(Boolean);
    const txt = `Lista de compras (preços de ${R ? new Date(R.atualizado).toLocaleDateString('pt-PT') : 'hoje'}):\n` + linhas.join('\n') + '\n\ncaiu.pt';
    window.estat('lista', 'enviar');
    try {
      if (navigator.share) { await navigator.share({ text: txt }); return; }
      await navigator.clipboard.writeText(txt);
      aviso('Lista copiada. Cola onde quiseres.');
    } catch (e) { if (e && e.name !== 'AbortError') aviso('Não deu para copiar neste navegador.'); }
  }

  // ---------- folha do produto ----------
  const folha = $('#folha');
  async function abrirProduto(id) {
    let g = (G && G.get(id)) || conhecidos.get(id);
    if (!g) { try { await obterLista(); g = G.get(id); } catch (e) { /* sem lista */ } }
    if (!g) { aviso('Este produto já não está nos preços de hoje.'); history.replaceState(null, '', location.pathname); return; }
    const ord = [...g.o].sort((a, b) => a.p - b.p);
    const varias = g.o.length > 1;
    $('#folhaCorpo').innerHTML = `
      <div class="fp__cab">${imgHTML(g, 'fp__img', 96)}<div><h3 id="folhaTitulo">${esc(g.n)}</h3><p class="fp__q">${esc(qtdTexto(g.q))}${g.m ? ' · ' + esc(g.m) : ''}</p></div></div>
      <ul class="fp__lojas">${ord.map((o, k) => {
        const tag = etiquetaPromo(o);
        const mot = motivo(o, g);
        const melhor = destaca(g, o);
        return `<li class="fp__loja${melhor ? ' fp__loja--melhor' : ''}">
          <span class="fp__nome">${LOJAS[o.l]}<small>${o.pu ? `${eur(o.pu)}/${esc(o.u)}` : ''}${melhor ? (o.pu ? ' · ' : '') + 'o mais barato' : ''}</small></span>
          ${precoHTML(o.p)}
          ${o.v || tag ? `<div class="fp__extra">${o.v ? `<span class="carimbo carimbo--${o.v}">${CARIMBO[o.v]}</span>` : ''}${tag ? `<span>${tag}</span>` : ''}</div>` : ''}
          ${mot && o.v ? `<p class="fp__motivo">${mot}</p>` : ''}
          <a class="fp__ir" href="${esc(BASE[o.l] + o.url)}" target="_blank" rel="noopener" data-loja="${o.l}">Ver no ${LOJAS[o.l]} ↗</a>
        </li>`;
      }).join('')}</ul>
      <div class="fp__hist" id="fpHist"><h4>Preço nos últimos dias</h4><p>A carregar…</p></div>
      <div class="fp__acoes" id="fpAcoes"></div>`;
    $('#fpAcoes').append(botaoLista(g.i));
    if (!folha.open) { folha.showModal(); }
    $('#fecharFolha').focus();
    window.estat('produto', g.n.slice(0, 60));
    try {
      const h = await (await fetch(`/dados/h/${encodeURIComponent(g.i)}.json`, { cache: 'no-cache' })).json();
      $('#fpHist').innerHTML = '<h4>Preço nos últimos dias</h4>' + grafico(h);
    } catch (e) {
      $('#fpHist').innerHTML = '<h4>Preço nos últimos dias</h4><p>Não conseguimos abrir o histórico agora.</p>';
    }
  }
  function fecharProduto() { if (folha.open) folha.close(); }
  folha.addEventListener('close', () => { if (location.hash.startsWith('#p=')) history.replaceState(null, '', location.pathname + (ultimaQ ? '#q=' + encodeURIComponent(ultimaQ) : '')); });
  folha.addEventListener('click', e => { if (e.target === folha) fecharProduto(); });
  $('#fecharFolha').addEventListener('click', fecharProduto);
  folha.addEventListener('click', e => { const a = e.target.closest('[data-loja]'); if (a) window.estat('loja', LOJAS[a.dataset.loja]); });

  function grafico(h) {
    const series = Object.entries(h).filter(([, v]) => v.length);
    const dias = [...new Set(series.flatMap(([, v]) => v.map(x => x[0])))].sort();
    if (dias.length < 2) {
      const ini = new Date((dias[0] || new Date().toISOString().slice(0, 10)) + 'T12:00:00').toLocaleDateString('pt-PT', { day: 'numeric', month: 'long' });
      return `<p>Começámos a guardar o preço deste produto a ${ini}. O gráfico vai-se enchendo a cada dia.</p>`;
    }
    const W = 600, H = 190, e = 44, d = 12, t = 12, b = 26;
    const vals = series.flatMap(([, v]) => v.map(x => x[1]));
    let mn = Math.min(...vals), mx = Math.max(...vals);
    if (mx - mn < 0.1) { mn -= 0.1; mx += 0.1; }
    const x = dia => e + (dias.indexOf(dia) / (dias.length - 1)) * (W - e - d);
    const y = v => t + (1 - (v - mn) / (mx - mn)) * (H - t - b);
    const tracos = { c: '', p: '7 5', a: '2 4' };
    const linhas = series.map(([c, v]) => `<polyline fill="none" stroke="#141414" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" ${tracos[c] ? `stroke-dasharray="${tracos[c]}"` : ''} points="${v.map(p => `${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ')}"/>`).join('');
    const fmtD = s => new Date(s + 'T12:00:00').toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' }).replace('.', '');
    const leg = series.map(([c], k) => `<g transform="translate(${e + k * 150},${H + 18})"><line x1="0" x2="26" y1="-4" y2="-4" stroke="#141414" stroke-width="2.5" ${tracos[c] ? `stroke-dasharray="${tracos[c]}"` : ''}/><text x="32" y="0">${LOJAS[c]}</text></g>`).join('');
    return `<svg class="grafico" viewBox="0 0 ${W} ${H + 28}" role="img" aria-label="Evolução do preço desde ${fmtD(dias[0])}">
      <text x="${e - 8}" y="${y(mx) + 4}" text-anchor="end">${nf.format(mx)}</text>
      <text x="${e - 8}" y="${y(mn) + 4}" text-anchor="end">${nf.format(mn)}</text>
      <line x1="${e}" x2="${W - d}" y1="${H - b + 6}" y2="${H - b + 6}" stroke="#D8D8D0" stroke-width="2"/>
      <text x="${e}" y="${H - 4}">${fmtD(dias[0])}</text><text x="${W - d}" y="${H - 4}" text-anchor="end">${fmtD(dias[dias.length - 1])}</text>
      ${linhas}<g class="legenda">${leg}</g></svg>`;
  }

  // ---------- endereços (#q=… e #p=…) ----------
  function rotas() {
    const h = decodeURIComponent(location.hash.slice(1));
    if (h.startsWith('q=')) {
      const q = h.slice(2);
      $('#q').value = q;
      if (q !== ultimaQ || $('#resultados').hidden) pesquisar(q, true);
      fecharProduto();
    } else if (h.startsWith('p=')) {
      abrirProduto(h.slice(2));
    } else if (folha.open) {
      fecharProduto();
    }
  }
  window.addEventListener('hashchange', rotas);

  iniciar();
})();
