/* caiu.pt — dados em /dados/*.json (caiu/recolher.py) e API em /api/* (caiu/api.py) */
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

  let R = null;                  // resumo do dia
  let G = null;                  // lista completa (só se a API falhar)
  let carregarLista = null;
  const conhecidos = new Map();  // produtos já recebidos (destaques, pesquisa, lista)

  // ---------- utilitários ----------
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const nf = new Intl.NumberFormat('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const ni = new Intl.NumberFormat('pt-PT');
  const eur = v => v == null ? '' : nf.format(v) + NB + '€';
  const precoHTML = (v, cls = '') => `<span class="preco${cls ? ' ' + cls : ''}">${nf.format(v)}<span class="eur">€</span></span>`;
  const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const pct = (de, para) => Math.round((de - para) / de * 100);
  const hojeLx = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Lisbon' });
  const dataCurta = iso => new Date(iso + (iso.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('pt-PT', { day: 'numeric', month: 'long' });
  const hora = iso => new Date(iso).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Lisbon' });
  const naLoja = c => 'No ' + LOJAS[c];
  const igual = (a, b) => Math.abs(a - b) < 0.005;
  const juntar = xs => xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' e ' + xs[xs.length - 1];
  const ler = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch (e) { return d; } };
  const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* modo privado */ } };

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
    conhecidos.set(g.i, g);
    return g;
  }
  const qtdTexto = q => (q || '').replace(/^emb\.\s*/i, '').replace(/^Quant\.\s*M[ií]nima\s*=\s*/i, 'mín. ')
    .replace(/(\d)\.(\d)/g, '$1,$2').replace(/\bKg\b/g, 'kg').replace(/\bgr\b/g, 'g').replace(/\blt\b/gi, 'L').replace(/\bLt\b/g, 'L');
  const imgHTML = (g, cls, tam) => g.img
    ? `<img class="${cls}" src="${esc(g.img)}" alt="" width="${tam}" height="${tam}" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-letra="${esc((g.n || '?')[0])}">`
    : `<div class="${cls} et__img--vazio" aria-hidden="true">${esc((g.n || '?')[0])}</div>`;

  function aviso(txt, ms = 2800) {
    const el = $('#aviso');
    el.textContent = txt;
    el.hidden = false;
    clearTimeout(aviso.t);
    aviso.t = setTimeout(() => { el.hidden = true; }, ms);
  }
  async function api(url, corpo) {
    const r = await fetch(url, corpo ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) } : {});
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(String(r.status)), { codigo: r.status, corpo: j });
    return j;
  }

  document.addEventListener('error', e => {
    const im = e.target;
    if (im.tagName !== 'IMG' || !im.dataset.letra) return;
    const d = document.createElement('div');
    d.className = im.className + ' et__img--vazio';
    d.setAttribute('aria-hidden', 'true');
    d.textContent = im.dataset.letra;
    im.replaceWith(d);
  }, true);

  // ---------- descontos dos cartões e parcerias (condições confirmadas a 11/11/2026) ----------
  const DESC = [
    { id: 'combina', loja: 'c', nome: 'COMBINA (Galp e NOS)', tipo: 'escolha',
      opcoes: [['', 'Não tenho'], ['2', '1 serviço Galp ou NOS: 2 %'], ['5', '2 serviços: 5 %'], ['10', '3 serviços: 10 %']],
      nota: 'Em saldo no Cartão Continente, sobre compras até 450 € por mês.', fonte: 'https://combina.pt/pdf/COMBINATermoseCondicoes.pdf' },
    { id: 'carrega', loja: 'c', nome: 'Continente Carrega', tipo: 'escolha', ate: '2026-12-31',
      opcoes: [['', 'Não uso'], ['5', 'Carrego 50 a 90 €: 5 %'], ['10', 'Carrego 100 € ou mais: 10 %']],
      nota: 'Em saldo no cartão, até 31 de dezembro de 2026. Não soma ao COMBINA: conta o maior.', fonte: 'https://feed.continente.pt/carrega-cartao' },
    { id: 'universo', loja: 'c', nome: 'Cartão Universo+ (Fim do Mês)', tipo: 'sim',
      nota: '5 % em saldo, até 10 € por mês.', fonte: 'https://universo.pt/wp-content/uploads/2025/12/Universo-Programa_de_descontos.pdf' },
    { id: 'edp', loja: 'p', nome: 'Saldo EDP por gastar este mês', tipo: 'valor', max: 10,
      nota: 'Clientes EDP recebem 10 % da fatura de energia em saldo na app Pingo Doce, até 10 € por mês. Indica quanto tens por gastar: desconta uma vez.', fonte: 'https://jornaleconomico.sapo.pt/noticias/edp-e-pingo-doce-lancam-parceria-que-da-10-da-fatura-de-energia-em-compras/' },
    { id: 'acp', loja: 'p', nome: 'Sócio do ACP', tipo: 'sim',
      nota: 'Cartões-oferta do Pingo Doce com 10 % de desconto (50 € por 45 €).', fonte: 'https://pingodoce.acp.pt/' },
    { id: 'clube', loja: 'a', nome: 'Clube Auchan', tipo: 'sim',
      nota: 'Cerca de 1 % em pontos (500 pontos dão um vale de 5 €). Valor aproximado.', fonte: 'https://www.auchan.pt/pt/clube-auchan/' },
    { id: 'cartao', loja: '*', nome: 'Cartão com reembolso em supermercados', tipo: 'pct',
      nota: 'Por exemplo, Cetelem Black+: 3 % até 10 € por mês. Indica a percentagem e o limite.' }
  ];
  let D = ler('caiu-descontos', {});
  const carregaAtivo = () => hojeLx() <= '2026-12-31';
  function temDescontos() { return Object.entries(D).some(([k, v]) => v && !(k === 'carrega' && !carregaAtivo()) && k !== 'cartaoTeto'); }
  function descontosLoja(l, total) {
    const linhas = [];
    if (!total) return { v: 0, linhas };
    if (l === 'c') {
      const comb = +D.combina || 0, carr = carregaAtivo() ? (+D.carrega || 0) : 0;
      const vComb = comb / 100 * Math.min(total, 450), vCarr = carr / 100 * total;
      if (vComb || vCarr) linhas.push(vCarr > vComb ? [`Continente Carrega ${carr}${NB}%`, vCarr] : [`COMBINA ${comb}${NB}%`, vComb]);
      if (D.universo) linhas.push([`Universo+ 5${NB}%`, Math.min(0.05 * total, 10)]);
    }
    if (l === 'p') {
      if (D.acp) linhas.push([`ACP 10${NB}%`, 0.10 * total]);
      if (+D.edp > 0) linhas.push(['saldo EDP', Math.min(+D.edp, total)]);
    }
    if (l === 'a' && D.clube) linhas.push([`Clube Auchan ≈1${NB}%`, 0.01 * total]);
    if (+D.cartao > 0) {
      let v = +D.cartao / 100 * total;
      if (+D.cartaoTeto > 0) v = Math.min(v, +D.cartaoTeto);
      linhas.push([`Cartão com reembolso ${+D.cartao}${NB}%`, v]);
    }
    const v = Math.min(total, linhas.reduce((s, x) => s + x[1], 0));
    return { v, linhas };
  }
  function pctLoja(l) {
    let p = +D.cartao || 0;
    if (l === 'c') p += Math.max(+D.combina || 0, carregaAtivo() ? (+D.carrega || 0) : 0) + (D.universo ? 5 : 0);
    if (l === 'p') p += D.acp ? 10 : 0;
    if (l === 'a') p += D.clube ? 1 : 0;
    return Math.min(p, 40);
  }

  function desenharDescontos() {
    const caixa = $('#descontosForm');
    const grupo = (l, titulo) => {
      const itens = DESC.filter(d => d.loja === l);
      return `<fieldset class="desc__grupo"><legend>${titulo}</legend>${itens.map(d => {
        const fim = d.ate && hojeLx() > d.ate;
        let ctl = '';
        if (d.tipo === 'escolha') ctl = `<select id="d-${d.id}" data-d="${d.id}"${fim ? ' disabled' : ''}>${d.opcoes.map(([v, t]) => `<option value="${v}"${String(D[d.id] || '') === v ? ' selected' : ''}>${t}</option>`).join('')}</select>`;
        if (d.tipo === 'sim') ctl = `<input type="checkbox" id="d-${d.id}" data-d="${d.id}"${D[d.id] ? ' checked' : ''}>`;
        if (d.tipo === 'valor') ctl = `<span class="desc__valor"><input type="number" id="d-${d.id}" data-d="${d.id}" min="0" max="${d.max}" step="0.5" inputmode="decimal" value="${D[d.id] || ''}" placeholder="0"><span>€</span></span>`;
        if (d.tipo === 'pct') ctl = `<span class="desc__valor"><input type="number" id="d-${d.id}" data-d="${d.id}" min="0" max="10" step="0.5" inputmode="decimal" value="${D[d.id] || ''}" placeholder="0"><span>%, até</span><input type="number" id="d-cartaoTeto" data-d="cartaoTeto" min="0" max="100" step="1" inputmode="decimal" value="${D.cartaoTeto || ''}" placeholder="sem limite" aria-label="Limite por mês em euros"><span>€/mês</span></span>`;
        const marca = d.tipo === 'sim' ? 'desc__item desc__item--sim' : 'desc__item';
        return `<div class="${marca}${fim ? ' desc__item--fim' : ''}">
          ${d.tipo === 'sim' ? ctl : ''}
          <label for="d-${d.id}" class="desc__nome">${d.nome}${fim ? ' <em>(terminou)</em>' : ''}</label>
          ${d.tipo !== 'sim' ? ctl : ''}
          <p class="desc__nota">${d.nota}${d.fonte ? ` <a href="${d.fonte}" target="_blank" rel="noopener">Condições</a>` : ''}</p>
        </div>`;
      }).join('')}</fieldset>`;
    };
    caixa.innerHTML = grupo('c', 'Continente') + grupo('p', 'Pingo Doce') + grupo('a', 'Auchan') + grupo('*', 'Em qualquer loja');
    resumirDescontos();
  }
  function resumirDescontos() {
    const partes = ['c', 'p', 'a'].map(l => {
      const p = pctLoja(l);
      const extra = l === 'p' && +D.edp > 0 ? ` + ${eur(+D.edp)} de saldo EDP` : '';
      return p || extra ? `${LOJAS[l]} ${p ? p.toLocaleString('pt-PT') + NB + '%' : ''}${extra}` : '';
    }).filter(Boolean);
    $('#descontosResumo').textContent = partes.length ? 'A contar com: ' + partes.join(' · ') + '.' : 'Sem descontos marcados: as contas usam o preço na caixa.';
  }
  $('#descontosForm').addEventListener('change', e => {
    const el = e.target.closest('[data-d]');
    if (!el) return;
    const k = el.dataset.d;
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (el.type === 'number') { v = Math.max(0, Math.min(+el.max || 100, +String(v).replace(',', '.') || 0)); if (!v) v = ''; el.value = v; }
    if (v === '' || v === false) delete D[k]; else D[k] = v;
    gravar('caiu-descontos', D);
    resumirDescontos();
    desenharLista();
    cabazMeu();
    window.estat('descontos', k);
  });

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
  // Limpa restos de HTML que alguma loja deixe passar e etiquetas repetidas ("Mais de 10 %")
  function textoPromo(t) {
    if (!t) return '';
    const p = t.split(' · ').map(x => x.trim()).filter(x => x && !/[<>="]|class|^%$/.test(x));
    const comPct = p.some(x => /\d\s*%/.test(x) && !/^mais de/i.test(x));
    return p.filter(x => !(comPct && /^mais de\s*\d+\s*%$/i.test(x))).join(' · ');
  }

  function etiquetaPromo(o) {
    const partes = [];
    if (o.r && o.p < o.r) partes.push(`−${pct(o.r, o.p)}${NB}% · PVPR <span class="riscado">${eur(o.r)}</span>`);
    else if (o.a && o.p < o.a) partes.push(`antes <span class="riscado">${eur(o.a)}</span>`);
    const t = textoPromo(o.t);
    if (t && !/^-?\d+%? sobre PVPR$/i.test(t.replace(/\s/g, '')) && !(o.r && /PVPR/i.test(t))) partes.push(esc(t));
    return partes.join(' · ');
  }

  // ---------- etiquetas e linhas ----------
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
    const deHoje = r.dia === hojeLx();
    $('#t-talao').textContent = deHoje ? 'Talão de hoje' : `Talão de ${dataCurta(r.dia)}`;
    $('#talaoHora').textContent = (deHoje ? 'às ' : `${r.dia.slice(8, 10)}/${r.dia.slice(5, 7)} · `) + hora(r.atualizado);
    const v = { ofertas: r.ofertas, promos: r.promos, pvpr: r.pvpr, outra: r.outra, reais: (r.classes || {}).real || 0 };
    document.querySelectorAll('#talaoLinhas dd').forEach(dd => { dd.textContent = ni.format(v[dd.dataset.k] ?? 0); });
    $('#talaoPe').textContent = deHoje
      ? `${ni.format(r.produtos)} produtos · atualizamos às 7:20, 12:50 e 18:20`
      : `Ainda não há preços de hoje: estes são os últimos que conseguimos recolher.`;
    $('#talaoDia').classList.add('imprime');
    $('#rodapeDados').textContent = `Preços recolhidos a ${dataCurta(r.atualizado.slice(0, 10))}, às ${hora(r.atualizado)}, nas lojas online do Continente, Pingo Doce e Auchan. Podem mudar durante o dia.`;

    try { mostrarEssencial(); } catch (e) { $('#essencial').hidden = true; }

    const fach = (r.fachada || []).map(dec);
    if (fach.length) {
      $('#fachadaLead').innerHTML = `Hoje, <strong>${ni.format(r.outra)} produtos</strong> em promoção estão mais baratos noutro supermercado. Estes são os casos com maior diferença.`;
      preencher($('#fachadaLista'), fach, g => cartao(g, g.o.find(o => o.m.some(m => m[0] === 'outra'))));
      $('#fachada').hidden = false;
    }

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
          <div class="barra__topo"><span class="barra__loja">${nome}<small>${sub}</small></span>${precoHTML(v, 'barra__total')}</div>
          <div class="barra__pista" aria-hidden="true"><div class="barra__enche" style="width:${(v / max * 100).toFixed(1)}%">${mais ? `<div class="barra__mais" style="width:${mais.toFixed(1)}%"></div>` : ''}</div></div>
        </li>`;
      const ol = $('#cabazBarras');
      ol.innerHTML = ord.map(c => linhaBarra('Tudo no ' + LOJAS[c], `+${eur(cb.totais[c] - div)} (${p1((cb.totais[c] - div) / div * 100)} mais)`, cb.totais[c], '', (cb.totais[c] - div) / cb.totais[c] * 100)).join('') +
        (poup > 0.5 ? linhaBarra('Cada coisa no mais barato', 'dividindo a compra pelas lojas', div, ' barra--melhor', 0) : '');
      $('#cabaz').hidden = false;
      if (obs) { ol.classList.add('espera'); obs.observe(ol); }
      cabazMeu();
    }

    const pv = (r.pvpr_top || []).map(dec);
    if (pv.length) {
      $('#pvprLead').innerHTML = `PVPR é o preço de venda recomendado pela marca. Hoje, <strong>${ni.format(r.pvpr)} das ${ni.format(r.promos)} promoções</strong> (${Math.round(r.pvpr / r.promos * 100)}${NB}%) calculam o desconto sobre ele, e não sobre o preço a que a loja vendia antes.`;
      preencher($('#pvprLista'), pv, g => cartao(g, g.o.find(o => o.m.some(m => m[0] === 'pvpr'))));
      $('#pvpr').hidden = false;
    }

    const dif = (r.diferenca || []).map(dec).filter(g => !vistos.has(g.i));
    if (dif.length) {
      $('#t-dif').textContent = `O mesmo produto, até ${dif[0].pc}${NB}% mais caro`;
      $('#difLead').textContent = 'Mesmo nome, mesma marca, mesmo tamanho. Só muda a loja.';
      preencher($('#difLista'), dif, g => linha(g, `<span class="ln__dif">+${eur(g.dif)} (${g.pc}${NB}%)</span>`));
      $('#diferenca').hidden = false;
    }

    const reais = (r.reais || []).map(dec);
    $('#reais').hidden = false;
    if (reais.length) {
      $('#reaisLead').textContent = 'Preços de hoje abaixo de todos os dos 30 dias anteriores. Segue os que compras e avisamos da próxima vez.';
      preencher($('#reaisLista'), reais, g => cartao(g, g.o.find(o => o.v === 'real')));
    } else {
      const ini = new Date((r.inicio_historico || r.dia) + 'T12:00:00');
      const pronto = new Date(ini.getTime() + 7 * 864e5);
      $('#reaisLead').innerHTML = (Date.now() < pronto.getTime())
        ? `Para dizer que um preço desceu mesmo, comparamos com os dias anteriores. As primeiras descidas confirmadas aparecem a <strong>${dataCurta(pronto.toISOString().slice(0, 10))}</strong>.`
        : 'Hoje não encontrámos nenhum preço abaixo do mínimo dos 30 dias anteriores.';
    }

    // exemplo real para a notificação desenhada nos avisos
    if (obs) { $('#notifExemplo').classList.add('espera'); obs.observe($('#notifExemplo')); }
    const ex = reais[0] || dif[0] || fach[0];
    if (ex) {
      const o = ex.o.reduce((a, b) => (b.p < a.p ? b : a));
      $('#notifTitulo').textContent = 'Baixou: ' + ex.n;
      const ref = reais[0] ? (o.m.find(m => m[0] === 'min30') || [0, 0])[1] : Math.max(...ex.o.map(x => x.p));
      $('#notifCorpo').textContent = `Agora ${eur(o.p)} no ${LOJAS[o.l]}` + (ref > o.p ? ` (antes ${eur(ref)}).` : '.');
    }
  }
  function cabazMeu() {
    const cb = R && R.cabaz, el = $('#cabazMeu');
    if (!cb || !temDescontos()) { el.hidden = true; return; }
    const tot = Object.fromEntries(Object.keys(cb.totais).map(c => [c, cb.totais[c] - descontosLoja(c, cb.totais[c]).v]));
    const ord = Object.keys(tot).sort((a, b) => tot[a] - tot[b]);
    el.innerHTML = `Com os teus cartões: ${ord.map(c => `${LOJAS[c]} <b>${eur(tot[c])}</b>`).join(', ')}.`;
    el.hidden = false;
  }

  // ---------- cabaz do essencial (caiu/cabaz.py) ----------
  const ESS = { p: Math.min(4, Math.max(1, +ler('caiu-ess-pessoas', 2) || 2)), m: ler('caiu-ess-periodo', 's') === 'm' ? 'm' : 's' };
  const UN_ART = { ovos: ['ovo', 'ovos'], papel: ['rolo', 'rolos'], roupa: ['lavagem', 'lavagens'] };
  const fatorEss = () => ESS.p * (ESS.m === 'm' ? (R.essencial.semanas_mes || 52 / 12) : 1);
  function qtdEss(a, f) {
    const v = a.q * f;
    if (a.u === 'kg' || a.u === 'L') {
      if (v < 1) return `${ni.format(Math.max(10, Math.round(v * 1000 / (v < 0.1 ? 5 : 10)) * (v < 0.1 ? 5 : 10)))}${NB}${a.u === 'kg' ? 'g' : 'ml'}`;
      return `${v.toLocaleString('pt-PT', { maximumFractionDigits: 1 })}${NB}${a.u === 'kg' ? 'kg' : 'L'}`;
    }
    const n = v >= 3 ? Math.round(v) : Math.round(v * 2) / 2;
    const [um, varios] = UN_ART[a.id] || ['unidade', 'unidades'];
    return `${n.toLocaleString('pt-PT', { maximumFractionDigits: 1 })}${NB}${n === 1 ? um : varios}`;
  }
  const porUnidade = (a, pu) => `${nf.format(pu)}${NB}€/${{ kg: 'kg', L: 'L', un: UN_ART[a.id] ? UN_ART[a.id][0] : 'un', dose: 'lavagem' }[a.u]}`;
  function contasEss() {
    const e = R.essencial, f = fatorEss();
    const linhas = e.artigos.map(a => {
      const v = {};
      for (const c of 'cpa') if (a.l[c]) v[c] = Math.round(a.l[c][2] * a.q * f * 100) / 100;
      return { a, v, min: Object.keys(v).length ? Math.min(...Object.values(v)) : 0 };
    });
    const comuns = linhas.filter(x => x.a.comum);
    const tot = { c: 0, p: 0, a: 0 };
    let div = 0;
    for (const x of comuns) { for (const c of 'cpa') tot[c] += x.v[c]; div += x.min; }
    for (const c of 'cpa') tot[c] = Math.round(tot[c] * 100) / 100;
    return { f, linhas, comuns, tot, div: Math.round(div * 100) / 100 };
  }
  function mostrarEssencial() {
    const e = R.essencial;
    if (!e || !e.artigos || e.n < 10) return;
    const k = contasEss();
    const ord = Object.keys(k.tot).sort((a, b) => k.tot[a] - k.tot[b]);
    const melhor = ord[0], pior = ord[2];
    const quem = `${ESS.p === 1 ? '1 pessoa' : ESS.p + ' pessoas'}`, quando = ESS.m === 'm' ? 'um mês' : 'uma semana';
    const difMax = k.tot[pior] - k.tot[melhor];
    const empata = difMax / k.tot[melhor] < 0.015;
    $('#essLead').innerHTML = `${ni.format(e.n)} produtos básicos, do arroz ao detergente. Em cada loja escolhemos o mais barato ao quilo, ao litro ou à unidade e somamos as quantidades de uma semana normal. Muda sozinho a cada recolha de preços.`;
    $('#essFrase').innerHTML = empata
      ? `Para ${quem}, ${quando}: as três lojas quase empatam. Entre a mais barata e a mais cara vão <strong>${eur(difMax)}</strong>.`
      : `Para ${quem}, ${quando}, o mais barato é o <strong>${LOJAS[melhor]}</strong>: menos ${eur(difMax)} do que no ${LOJAS[pior]}.`;
    $('#essLojas').innerHTML = ord.map((c, i) => {
      const dif = k.tot[c] - k.tot[melhor];
      const sub = i === 0 ? (igual(k.tot[ord[1]], k.tot[c]) ? 'empata com o ' + LOJAS[ord[1]] : 'o total mais baixo') : igual(dif, 0) ? 'o mesmo total' : `+${eur(dif)} (${(dif / k.tot[melhor] * 100).toLocaleString('pt-PT', { maximumFractionDigits: 1 })}${NB}%)`;
      return `<li class="pl${i === 0 ? ' pl--melhor' : ''}">
        <span class="pl__loja">${LOJAS[c]}</span>
        ${precoHTML(k.tot[c], 'pl__total')}
        <span class="pl__sub">${sub}</span>
        ${i === 0 ? '<span class="carimbo carimbo--real pl__carimbo">Mais barato</span>' : ''}
      </li>`;
    }).join('');
    animar($('#essLojas'));
    const poup = k.tot[melhor] - k.div;
    // quantas lojas é preciso visitar para ter tudo ao preço mais baixo (empates contam para qualquer uma)
    const mins = k.comuns.map(x => 'cpa'.split('').filter(c => igual(x.v[c], x.min)));
    const lojasPrecisas = new Set(mins.filter(m => m.length === 1).map(m => m[0]));
    for (const m of mins) if (!m.some(c => lojasPrecisas.has(c))) lojasPrecisas.add(m[0]);
    const idas = lojasPrecisas.size === 3 ? 'três idas' : 'duas idas';
    $('#essDividir').innerHTML = poup > 0.05 && lojasPrecisas.size > 1
      ? `Comprando cada coisa na loja onde está mais barata, pagas <strong>${eur(k.div)}</strong>: menos ${eur(poup)} do que tudo no ${LOJAS[melhor]}, mas são ${idas} às compras.`
      : 'Dividir a compra pelas três lojas quase não poupa nada: o melhor é ir a uma só.';
    // produtos
    $('#essResumo').textContent = `Ver os ${ni.format(e.artigos.length)} produtos`;
    const grupos = e.grupos || [];
    $('#essTabela').innerHTML = `<div class="arts__cab" aria-hidden="true"><span>Produto</span>${'cpa'.split('').map(c => `<span>${LOJAS[c]}</span>`).join('')}</div>` +
      grupos.map(([g, nome]) => {
        const xs = k.linhas.filter(x => x.a.g === g);
        if (!xs.length) return '';
        return `<h3 class="arts__g">${nome}</h3>` + xs.map(({ a, v, min }) => {
          const todosIguais = Object.values(v).every(x => igual(x, min));
          const celula = c => v[c] == null ? `<span class="arts__v arts__v--nao">não há<span class="sr"> no ${LOJAS[c]}</span></span>`
            : `<span class="arts__v${!todosIguais && igual(v[c], min) ? ' arts__v--min' : ''}"><span class="sr">${LOJAS[c]}: </span>${eur(v[c])}${!todosIguais && igual(v[c], min) ? '<span class="sr"> (mais barato)</span>' : ''}</span>`;
          const escolhas = 'cpa'.split('').filter(c => a.l[c]).map(c => {
            const [nome, preco, pu, , url, promo] = a.l[c];
            const ir = url ? ` <a href="${esc(/^https?:/.test(url) ? url : BASE[c] + url)}" target="_blank" rel="noopener" data-loja="${c}">Ver na loja</a>` : '';
            return `<li><b>${LOJAS[c]}</b> ${esc(nome)}: ${eur(preco)} (${porUnidade(a, pu)})${promo ? ' · em promoção' : ''}.${ir}</li>`;
          }).join('');
          return `<details class="art${a.comum ? '' : ' art--fora'}">
            <summary><span class="art__n"><span class="art__t">${esc(a.n)}</span><small>${qtdEss(a, k.f)}${a.comum ? '' : ' · fora das contas hoje'}</small></span>${'cpa'.split('').map(celula).join('')}</summary>
            <ul class="art__esc">${escolhas}</ul>
          </details>`;
        }).join('');
      }).join('') +
      `<p class="arts__pe">Toca num produto para ver o que escolhemos em cada loja. Contamos o preço ao quilo ou ao litro, por isso o valor é o da quantidade da lista e não o da embalagem inteira.</p>`;
    // como tem mudado
    const pts = (e.hist || []).filter(h => h[5] === e.n);
    const hh = { c: [], p: [], a: [] };
    for (const h of pts) { if (h[1]) hh.c.push([h[0], h[1] * k.f]); if (h[2]) hh.p.push([h[0], h[2] * k.f]); if (h[3]) hh.a.push([h[0], h[3] * k.f]); }
    $('#essHist').innerHTML = `<h3>Como tem mudado</h3>` + (pts.length >= 2
      ? grafico(hh, innerWidth < 560 ? 340 : 600).replace(/<p>O mais baixo desde/, '<p>O total mais baixo desde')
      : (e.hist || []).length >= 2
        ? '<p>Hoje há um produto que não encontrámos nas três lojas, por isso não comparamos com os outros dias. O gráfico volta quando estiver tudo outra vez.</p>'
        : `<p>Começámos a guardar o total do cabaz a ${dataCurta(e.dia)}. O gráfico enche-se a cada dia.</p>`);
    const faltam = e.artigos.filter(a => !a.comum);
    $('#essNota').innerHTML = `Preços online de ${dataCurta(R.atualizado.slice(0, 10))}, às ${hora(R.atualizado)}. Quantidades de referência que escolhemos para um adulto; o mês conta 52 semanas a dividir por 12.` +
      (faltam.length ? ` Hoje ${faltam.length === 1 ? 'fica de fora' : 'ficam de fora'} das contas: ${juntar(faltam.map(a => a.n.toLowerCase()))}, que não encontrámos nas três lojas.` : '');
    $('#essencial').hidden = false;
    $('#linkEssencial').hidden = false;
  }
  function marcarControlos() {
    document.querySelectorAll('#essCtl input[name="pessoas"]').forEach(i => { i.checked = +i.value === ESS.p; });
    document.querySelectorAll('#essCtl input[name="periodo"]').forEach(i => { i.checked = i.value === ESS.m; });
  }
  marcarControlos();
  $('#essCtl').addEventListener('submit', e => e.preventDefault());
  $('#essCtl').addEventListener('change', e => {
    if (e.target.name === 'pessoas') { ESS.p = +e.target.value; gravar('caiu-ess-pessoas', ESS.p); }
    if (e.target.name === 'periodo') { ESS.m = e.target.value; gravar('caiu-ess-periodo', ESS.m); }
    const aberto = [...document.querySelectorAll('#essTabela details[open]')].map(d => [...d.parentNode.children].indexOf(d));
    mostrarEssencial();
    const filhos = $('#essTabela').children;
    aberto.forEach(i => { if (filhos[i] && filhos[i].tagName === 'DETAILS') filhos[i].open = true; });
    $('#essLojas').classList.remove('muda'); void $('#essLojas').offsetWidth; $('#essLojas').classList.add('muda');
    window.estat('essencial', `${ESS.p}${ESS.m}`);
  });
  $('#essArtigos').addEventListener('toggle', e => { if (e.target.open) window.estat('essencial', 'produtos'); });
  $('#essEnviar').addEventListener('click', async () => {
    const k = contasEss();
    const ord = Object.keys(k.tot).sort((a, b) => k.tot[a] - k.tot[b]);
    const txt = `O essencial para ${ESS.p === 1 ? '1 pessoa' : ESS.p + ' pessoas'}, ${ESS.m === 'm' ? 'um mês' : 'uma semana'} (${R.essencial.n} produtos, preços de ${new Date(R.atualizado).toLocaleDateString('pt-PT')}):\n` +
      ord.map(c => `${LOJAS[c]}: ${eur(k.tot[c])}`).join('\n') + `\nCada coisa onde está mais barata: ${eur(k.div)}\n\nhttps://caiu.pt/#essencial`;
    window.estat('essencial', 'enviar');
    try {
      if (navigator.share) { await navigator.share({ text: txt }); return; }
      await navigator.clipboard.writeText(txt);
      aviso('Copiado. Cola onde quiseres.');
    } catch (err) { if (err && err.name !== 'AbortError') aviso('Não deu para copiar neste navegador.'); }
  });

  // ---------- lista completa (só se a API não responder) ----------
  function obterLista() {
    if (!carregarLista) {
      carregarLista = fetch('/dados/lista.json')
        .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(j => {
          G = new Map();
          for (const a of j.g) { const g = dec(a); g.k = norm(`${g.n} ${g.m} ${g.q}`); G.set(g.i, g); }
          return G;
        })
        .catch(e => { carregarLista = null; throw e; });
    }
    return carregarLista;
  }
  function procurarLocal(q) {
    const t = norm(q).split(/[^a-z0-9%]+/).filter(x => x.length > 0).slice(0, 8);
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
  // produtos por id: primeiro os que já conhecemos, depois a API, por fim a lista completa
  async function obterProdutos(ids) {
    const falta = ids.filter(i => !conhecidos.has(i));
    if (falta.length) {
      try {
        const j = await api('/api/produtos?ids=' + falta.map(encodeURIComponent).join(','));
        j.r.forEach(dec);
      } catch (e) {
        try { await obterLista(); } catch (e2) { /* sem rede */ }
      }
    }
    return ids.map(i => conhecidos.get(i) || (G && G.get(i))).filter(Boolean);
  }

  // ---------- pesquisa ----------
  const B = { q: '', total: 0, mostrados: 0, local: null, pedido: 0 };
  async function pesquisar(q, rolar, fim) {
    q = q.trim();
    const sec = $('#resultados');
    if (!q) { sec.hidden = true; return; }
    const n = ++B.pedido;
    sec.hidden = false;
    $('#t-res').textContent = `«${q}»`;
    if (B.q !== q) $('#resInfo').textContent = 'A procurar…';
    let gs = [];
    try {
      const j = await api(`/api/procurar?q=${encodeURIComponent(q)}${fim ? '&fim=1' : ''}`);
      if (n !== B.pedido) return;
      B.local = null; B.total = j.total; gs = j.r.map(dec);
    } catch (e) {
      try { await obterLista(); } catch (e2) {
        $('#resInfo').textContent = 'Não conseguimos abrir os preços agora. Tenta outra vez daqui a pouco.';
        return;
      }
      if (n !== B.pedido) return;
      B.local = procurarLocal(q); B.total = B.local.length; gs = B.local.slice(0, 20);
    }
    B.q = q; B.mostrados = 0;
    $('#resLista').replaceChildren();
    if (!B.total) {
      const curto = q.length < 3 || q.length > 40;
      $('#resInfo').textContent = `Ainda não temos «${q}». ` + (fim && !curto
        ? 'Juntámos à recolha: se as lojas o venderem online, aparece depois da próxima atualização.'
        : 'Experimenta uma palavra só (ex.: «azeite» em vez de «azeite virgem extra 750 ml»).');
    } else {
      $('#resInfo').textContent = `${ni.format(B.total)} ${B.total === 1 ? 'produto' : 'produtos'}. O preço grande é o mais baixo das lojas onde existe.`;
      mostrarResultados(gs);
    }
    if (fim) window.estat('pesquisa', q.slice(0, 60));
    if (rolar) sec.scrollIntoView({ behavior: reduzido ? 'auto' : 'smooth', block: 'start' });
  }
  function mostrarResultados(gs) {
    B.mostrados += gs.length;
    const ol = $('#resLista');
    ol.append(...gs.map(g => linha(g)));
    animar(ol);
    $('#resMais').hidden = B.mostrados >= B.total;
  }
  $('#resMais').addEventListener('click', async () => {
    const bt = $('#resMais');
    bt.disabled = true;
    try {
      if (B.local) mostrarResultados(B.local.slice(B.mostrados, B.mostrados + 20));
      else mostrarResultados((await api(`/api/procurar?q=${encodeURIComponent(B.q)}&o=${B.mostrados}`)).r.map(dec));
    } catch (e) { aviso('Não deu para carregar mais. Tenta outra vez.'); }
    bt.disabled = false;
  });
  $('#busca').addEventListener('submit', e => {
    e.preventDefault();
    const q = $('#q').value.trim();
    history.replaceState(null, '', q ? '#q=' + encodeURIComponent(q) : location.pathname);
    clearTimeout(tDig); clearTimeout(tFim);
    pesquisar(q, true, true);
    $('#q').blur();
  });
  let tDig, tFim;
  $('#q').addEventListener('input', () => {
    clearTimeout(tDig); clearTimeout(tFim);
    const q = $('#q').value;
    if (q.trim().length < 3) return;
    tDig = setTimeout(() => pesquisar(q, false, false), 220);
    tFim = setTimeout(() => {
      if ($('#q').value !== q) return;
      if (B.q === q.trim() && B.total) window.estat('pesquisa', q.trim().slice(0, 60));
      else pesquisar(q, false, true);
    }, 1800);
  });
  $('#limparBusca').addEventListener('click', () => {
    $('#q').value = '';
    $('#resultados').hidden = true;
    B.q = '';
    history.replaceState(null, '', location.pathname);
    $('#q').focus();
  });

  // ---------- a minha lista ----------
  let L = ler('caiu-lista', []);
  const naLista = id => L.some(x => x.i === id);
  function gravarLista(l) { L = l; gravar('caiu-lista', l); }
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
    if (naLista(id)) { gravarLista(L.filter(x => x.i !== id)); aviso('Tirado da lista'); }
    else { gravarLista([...L, { i: id, n: 1 }]); aviso('Posto na lista'); window.estat('lista', 'pôr'); }
    document.querySelectorAll(`[data-lista="${CSS.escape(id)}"]`).forEach(atualizarBotao);
    desenharLista();
  });

  async function desenharLista() {
    const n = L.reduce((s, x) => s + x.n, 0);
    $('#nLista').hidden = !L.length;
    $('#nLista').textContent = n;
    const caixa = $('#talaoLista');
    if (!L.length) {
      caixa.innerHTML = '<p class="talao__vazio">Ainda não tens nada na lista. Procura um produto lá em cima e carrega em «Pôr na lista».</p>';
      return;
    }
    await obterProdutos(L.map(x => x.i));
    const prod = id => conhecidos.get(id) || (G && G.get(id));
    const itens = L.map(x => ({ x, g: prod(x.i) }));
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
    const efetivo = c => tot[c] - descontosLoja(c, tot[c]).v;
    const lojas = Object.keys(tot).filter(c => tot[c] > 0 || !falta[c]);
    const completas = lojas.filter(c => !falta[c]);
    const ord = lojas.slice().sort((a, b) => (falta[a] - falta[b]) || (efetivo(a) - efetivo(b)));
    const melhor = ord[0];
    const linhas = itens.map(({ x, g }) => {
      if (!g) return `<div class="tl"><span class="tl__nome">Produto que já não encontramos<small>Tira-o da lista</small></span><span class="pontos" aria-hidden="true"></span><button class="tl__tirar" type="button" data-tirar="${esc(x.i)}" aria-label="Tirar da lista">×</button></div>`;
      return `<div class="tl">
        <span class="tl__nome"><a href="#p=${encodeURIComponent(g.i)}">${esc(g.n)}</a><small>${esc(qtdTexto(g.q))} · ${ondeMaisBarato(g)}</small></span>
        <span class="tl__qtd"><button type="button" data-qtd="${esc(x.i)}" data-d="-1" aria-label="Menos um">−</button><span>${x.n}</span><button type="button" data-qtd="${esc(x.i)}" data-d="1" aria-label="Mais um">+</button></span>
        <span class="pontos" aria-hidden="true"></span>
        <span class="tl__val">${eur(g.min * x.n)}</span>
        <button class="tl__tirar" type="button" data-tirar="${esc(x.i)}" aria-label="Tirar ${esc(g.n)} da lista">×</button>
      </div>`;
    }).join('');
    const comDesc = temDescontos();
    const somas = ord.map(c => {
      // loja a que faltam produtos: mostra só a soma do que há, sem descontos, e não entra na comparação
      const d = falta[c] ? { v: 0, linhas: [] } : descontosLoja(c, tot[c]);
      const sub = falta[c] ? `${falta[c] === 1 ? 'falta 1 produto' : `faltam ${falta[c]} produtos`}: soma do resto`
        : c === melhor ? (comDesc ? 'a mais barata, com os teus cartões' : 'a loja mais barata para esta lista')
        : igual(efetivo(c), efetivo(melhor)) ? 'o mesmo total' : `+${eur(efetivo(c) - efetivo(melhor))}`;
      return `<div class="soma${c === melhor && !falta[c] ? ' soma--melhor' : ''}${falta[c] ? ' soma--falta' : ''}">
        <span class="soma__loja">Tudo no ${LOJAS[c]}<small>${sub}</small></span>
        <span class="pontos" aria-hidden="true"></span>${precoHTML(d.v ? tot[c] - d.v : tot[c], 'soma__val')}
        ${d.v ? `<span class="soma__desc">${eur(tot[c])} na caixa · −${eur(d.v)} (${d.linhas.map(x => x[0]).join(', ')})</span>` : ''}
      </div>`;
    }).join('');
    const poup = melhor && !falta[melhor] ? efetivo(melhor) - dividir : 0;
    caixa.innerHTML = `
      <div class="talao__cab"><strong>A tua lista</strong><span>${n} ${n === 1 ? 'artigo' : 'artigos'}</span></div>
      ${linhas}
      <div class="somas">${somas}</div>
      ${poup > 0.05 && completas.length && !comDesc ? `<p class="dividir">Se comprares cada coisa onde está mais barata, pagas <strong>${eur(dividir)}</strong>: menos ${eur(poup)} do que tudo no ${LOJAS[melhor]}.</p>` : ''}
      ${comDesc ? '<p class="dividir">Os descontos em saldo (COMBINA, Carrega, Universo+) só se gastam na compra seguinte. <a href="#descontos">Mudar os teus cartões</a></p>' : '<p class="dividir"><a href="#descontos">Tens cartões ou parcerias (EDP, NOS, Galp, ACP…)? Conta com eles.</a></p>'}
      ${semPreco ? '<p class="dividir">Há produtos sem preço hoje: não entram nas contas.</p>' : ''}
      <div class="lista__acoes"><button class="botao botao--pequeno" type="button" id="partilharLista">Enviar a lista</button><button class="botao botao--leve botao--pequeno" type="button" id="seguirLista">Seguir estes preços</button><button class="botao botao--leve botao--pequeno" type="button" id="limparLista">Limpar</button></div>`;
  }
  $('#talaoLista').addEventListener('click', e => {
    const t = e.target.closest('[data-tirar]');
    const q = e.target.closest('[data-qtd]');
    if (t) {
      gravarLista(L.filter(x => x.i !== t.dataset.tirar));
      document.querySelectorAll(`[data-lista="${CSS.escape(t.dataset.tirar)}"]`).forEach(atualizarBotao);
      desenharLista();
    } else if (q) {
      gravarLista(L.map(x => x.i === q.dataset.qtd ? { ...x, n: Math.max(1, Math.min(99, x.n + +q.dataset.d)) } : x));
      desenharLista();
    } else if (e.target.id === 'limparLista') {
      const b = e.target;
      if (b.dataset.confirmar) { gravarLista([]); document.querySelectorAll('[data-lista]').forEach(atualizarBotao); desenharLista(); aviso('Lista limpa'); }
      else { b.dataset.confirmar = '1'; b.textContent = 'Carrega outra vez'; setTimeout(() => { if (b.isConnected) { delete b.dataset.confirmar; b.textContent = 'Limpar'; } }, 3500); }
    } else if (e.target.id === 'partilharLista') {
      partilhar();
    } else if (e.target.id === 'seguirLista') {
      const gs = L.map(x => conhecidos.get(x.i)).filter(Boolean);
      gs.forEach(g => marcarSeguido(g));
      desenharSeguidos();
      sincronizarSeguir(gs);
      aviso(`A seguir ${gs.length} ${gs.length === 1 ? 'produto' : 'produtos'}.`);
      if (!temAvisos()) document.getElementById('avisos').scrollIntoView({ behavior: reduzido ? 'auto' : 'smooth' });
    }
  });
  async function partilhar() {
    const linhas = L.map(x => { const g = conhecidos.get(x.i); return g ? `${x.n} × ${g.n} ${qtdTexto(g.q)}: ${eur(g.min)} (${ondeMaisBarato(g)})` : null; }).filter(Boolean);
    const txt = `Lista de compras (preços de ${R ? new Date(R.atualizado).toLocaleDateString('pt-PT') : 'hoje'}):\n` + linhas.join('\n') + '\n\ncaiu.pt';
    window.estat('lista', 'enviar');
    try {
      if (navigator.share) { await navigator.share({ text: txt }); return; }
      await navigator.clipboard.writeText(txt);
      aviso('Lista copiada. Cola onde quiseres.');
    } catch (e) { if (e && e.name !== 'AbortError') aviso('Não deu para copiar neste navegador.'); }
  }

  // ---------- seguir preços ----------
  let S = ler('caiu-seguir', {});            // id -> {p: preço quando começou, n: nome, t: quando}
  let conta = ler('caiu-conta', {});         // {email, estado: confirmar|ativo, t: token}
  const temAvisos = () => !!(conta.email || ler('caiu-push', 0));
  const seguido = id => !!S[id];
  function marcarSeguido(g) { if (!S[g.i]) { S[g.i] = { p: g.min, n: g.n, t: Date.now() }; gravar('caiu-seguir', S); } }
  async function sincronizarSeguir(gs, tirar) {
    const produtos = gs.map(g => ({ i: g.i, p: g.min }));
    if (conta.email && !tirar) api('/api/seguir', { email: conta.email, produtos }).catch(() => {});
    if (tirar && conta.t) api('/api/conta', { t: conta.t, acao: 'tirar', produto: tirar }).catch(() => {});
    if (ler('caiu-push', 0) && 'serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = reg && await reg.pushManager.getSubscription();
        if (sub) api('/api/push', { sub: sub.toJSON(), produtos: tirar ? [] : produtos, tirar: tirar || undefined }).catch(() => {});
      } catch (e) { /* sem notificações */ }
    }
  }
  function deixarDeSeguir(id) {
    delete S[id];
    gravar('caiu-seguir', S);
    sincronizarSeguir([], id);
    desenharSeguidos();
  }

  async function desenharSeguidos() {
    const ids = Object.keys(S);
    $('#linkSeguidos').hidden = !ids.length;
    $('#nSeguidos').textContent = ids.length;
    const sec = $('#seguidos');
    if (!ids.length) { sec.hidden = true; return; }
    sec.hidden = false;
    const gs = await obterProdutos(ids);
    const porId = new Map(gs.map(g => [g.i, g]));
    let baixaram = 0;
    const lis = ids.sort((a, b) => S[b].t - S[a].t).map(id => {
      const g = porId.get(id), s = S[id];
      const li = document.createElement('li');
      li.className = 'ln ln--seg';
      if (!g) {
        li.innerHTML = `<div class="ln__img et__img--vazio" aria-hidden="true">?</div><p class="ln__nome">${esc(s.n)}</p><p class="ln__meta">Não está nos preços de hoje.</p><div class="ln__pe"><button class="add add--leve" type="button" data-deixar="${esc(id)}">Deixar de seguir</button></div>`;
        return li;
      }
      const d = g.min - s.p;
      if (d < -0.005) baixaram++;
      const estado = d < -0.005 ? `<span class="mud mud--baixou">Baixou ${eur(-d)}</span>` : d > 0.005 ? `<span class="mud mud--subiu">Subiu ${eur(d)}</span>` : '<span class="mud">Igual</span>';
      li.innerHTML = `${imgHTML(g, 'ln__img', 64)}
        <p class="ln__nome"><a href="#p=${encodeURIComponent(g.i)}">${esc(g.n)}</a></p>
        ${precoHTML(g.min)}
        <p class="ln__meta"><span>${esc(qtdTexto(g.q))}</span><span>${ondeMaisBarato(g)}</span><span>seguias a <b>${eur(s.p)}</b></span></p>
        <div class="ln__pe">${estado}<button class="add add--leve" type="button" data-deixar="${esc(id)}">Deixar de seguir</button></div>`;
      return li;
    });
    $('#segLista').replaceChildren(...lis);
    $('#segLead').innerHTML = esc((baixaram ? `${baixaram} ${baixaram === 1 ? 'baixou' : 'baixaram'} desde que começaste a seguir. ` : 'Comparamos com o preço do dia em que começaste a seguir. ') +
      (temAvisos() ? (conta.email ? `Avisamos para ${conta.email}${conta.estado === 'confirmar' ? ' (falta confirmares o e-mail)' : ''}.` : 'Avisamos com notificações neste telemóvel.') : 'Para receberes um aviso quando baixarem, liga os avisos.')) +
      (conta.t ? ' <a href="#conta">Gerir os avisos por e-mail</a>' : '');
    $('#segAvisos').hidden = temAvisos() && conta.estado !== 'confirmar';
  }
  $('#segLista').addEventListener('click', e => {
    const b = e.target.closest('[data-deixar]');
    if (b) { deixarDeSeguir(b.dataset.deixar); aviso('Deixaste de seguir'); }
  });

  // ---------- avisos: e-mail e notificações ----------
  async function pedirEmail(email, semanal, origem) {
    const produtos = Object.entries(S).map(([i, s]) => ({ i, p: s.p }));
    const j = await api('/api/seguir', { email, produtos, semanal, site: '' });
    conta = { ...conta, email, estado: j.estado === 'ativo' ? 'ativo' : 'confirmar' };
    gravar('caiu-conta', conta);
    window.estat('avisos', origem + (semanal ? '+semanal' : ''));
    return j.estado;
  }
  const textoEstado = est => est === 'ativo' ? 'Feito. Já recebes os avisos neste e-mail.'
    : est === 'sem_servico' ? 'Ficou guardado. Mandamos o e-mail de confirmação daqui a pouco.'
    : 'Enviámos-te um e-mail. Carrega no link para confirmar (vê também o spam).';
  $('#formAvisos').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target, err = $('#erroAvisos'), inp = $('#emailAvisos');
    const email = inp.value.trim();
    err.hidden = true;
    if (f.site.value) return;
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) { err.textContent = 'Escreve um e-mail completo, por exemplo nome@gmail.com.'; err.hidden = false; inp.focus(); return; }
    const bt = f.querySelector('button');
    bt.disabled = true;
    try {
      const est = await pedirEmail(email, $('#semanalAvisos').checked, 'secao');
      err.textContent = textoEstado(est);
      err.classList.add('avisos__erro--ok');
      err.hidden = false;
      desenharSeguidos();
    } catch (x) {
      err.classList.remove('avisos__erro--ok');
      err.textContent = x.codigo === 429 ? 'Muitos pedidos seguidos. Tenta daqui a uns minutos.' : 'Não conseguimos guardar agora. Tenta outra vez.';
      err.hidden = false;
    }
    bt.disabled = false;
  });

  const pushPossivel = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const iosSemApp = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !matchMedia('(display-mode: standalone)').matches && !navigator.standalone;
  function u8(b64) { const s = atob((b64 + '='.repeat((4 - b64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(s, c => c.charCodeAt(0)); }
  async function ativarPush() {
    if (iosSemApp()) { aviso('No iPhone: toca em Partilhar e «Adicionar ao ecrã principal». Abre o caiu.pt por lá e liga os avisos.', 7000); return false; }
    if (!pushPossivel()) { aviso('Este navegador não aceita notificações. Usa os avisos por e-mail.', 5000); return false; }
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { aviso('Sem autorização para notificações. Podes mudar nas definições do navegador.', 5000); return false; }
      const { chave } = await api('/api/push/chave');
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: u8(chave) });
      await api('/api/push', { sub: sub.toJSON(), produtos: Object.entries(S).map(([i, s]) => ({ i, p: s.p })), semanal: true });
      gravar('caiu-push', 1);
      window.estat('avisos', 'push');
      atualizarPush();
      desenharSeguidos();
      aviso('Notificações ligadas neste telemóvel.');
      return true;
    } catch (e) {
      aviso('Não deu para ligar as notificações. Tenta outra vez ou usa o e-mail.', 5000);
      return false;
    }
  }
  function atualizarPush() {
    const ligado = ler('caiu-push', 0);
    const bt = $('#ativarPush');
    bt.textContent = ligado ? 'Notificações ligadas' : 'Avisar no telemóvel';
    bt.disabled = !!ligado;
    $('#pushNota').textContent = ligado ? 'Recebes os avisos neste telemóvel.' : iosSemApp() ? 'No iPhone, primeiro junta o caiu.pt ao ecrã principal.' : 'Notificações neste telemóvel, sem e-mail.';
    if (!pushPossivel() && !iosSemApp()) $('#pushBloco').hidden = true;
  }
  $('#ativarPush').addEventListener('click', ativarPush);

  // ---------- folha do produto ----------
  const folha = $('#folha');
  function abrirFolha() {
    if (!folha.open) folha.showModal();
    $('#fecharFolha').focus();
  }
  // páginas próprias dos produtos com dados que chegam (/produto/<nome>/), feitas no servidor depois de cada recolha
  let paginasProd = null;
  function paginaProduto(id) {
    if (!paginasProd) paginasProd = fetch('/produto/ids.json').then(r => (r.ok ? r.json() : {})).catch(() => ({}));
    return paginasProd.then(m => (m[id] ? `/produto/${m[id]}/` : ''));
  }
  async function abrirProduto(id) {
    let g = conhecidos.get(id) || (await obterProdutos([id]))[0];
    if (!g) { aviso('Este produto já não está nos preços de hoje.'); history.replaceState(null, '', location.pathname); return; }
    const ord = [...g.o].sort((a, b) => a.p - b.p);
    $('#folhaCorpo').innerHTML = `
      <div class="fp__cab">${imgHTML(g, 'fp__img', 96)}<div><h2 id="folhaTitulo">${esc(g.n)}</h2><p class="fp__q">${esc(qtdTexto(g.q))}${g.m ? ' · ' + esc(g.m) : ''}</p></div></div>
      <ul class="fp__lojas">${ord.map(o => {
        const tag = etiquetaPromo(o);
        const mot = motivo(o, g);
        const melhor = destaca(g, o);
        const pl = pctLoja(o.l);
        return `<li class="fp__loja${melhor ? ' fp__loja--melhor' : ''}">
          <span class="fp__nome">${LOJAS[o.l]}<small>${o.pu ? `${eur(o.pu)}/${esc(o.u)}` : ''}${melhor ? (o.pu ? ' · ' : '') + 'o mais barato' : ''}</small></span>
          <span class="fp__precos">${precoHTML(o.p)}${pl ? `<small>${eur(o.p * (1 - pl / 100))} com os teus cartões</small>` : ''}</span>
          ${o.v || tag ? `<div class="fp__extra">${o.v ? `<span class="carimbo carimbo--${o.v}">${CARIMBO[o.v]}</span>` : ''}${tag ? `<span>${tag}</span>` : ''}</div>` : ''}
          ${mot && o.v ? `<p class="fp__motivo">${mot}</p>` : ''}
          <a class="fp__ir" href="${esc(BASE[o.l] + o.url)}" target="_blank" rel="noopener" data-loja="${o.l}">Ver no ${LOJAS[o.l]} ↗</a>
        </li>`;
      }).join('')}</ul>
      <div class="fp__acoes" id="fpAcoes"></div>
      <div class="fp__seguir" id="fpSeguir" hidden></div>
      <div class="fp__hist" id="fpHist"><h3>Preço nos últimos dias</h3><p>A carregar…</p></div>`;
    const acoes = $('#fpAcoes');
    acoes.append(botaoLista(g.i));
    const bs = document.createElement('button');
    bs.type = 'button';
    bs.className = 'add add--seguir';
    const pintar = () => { bs.textContent = seguido(g.i) ? 'A seguir o preço' : 'Seguir o preço'; bs.setAttribute('aria-pressed', seguido(g.i) ? 'true' : 'false'); };
    pintar();
    bs.addEventListener('click', () => {
      if (seguido(g.i)) { deixarDeSeguir(g.i); pintar(); $('#fpSeguir').hidden = true; aviso('Deixaste de seguir'); return; }
      marcarSeguido(g); pintar(); desenharSeguidos(); window.estat('seguir', 'produto');
      if (temAvisos()) { sincronizarSeguir([g]); aviso(conta.email ? 'A seguir. Avisamos quando baixar.' : 'A seguir. Mandamos uma notificação quando baixar.'); }
      else mostrarComoAvisar(g);
    });
    acoes.append(bs);
    paginaProduto(g.i).then(u => {
      if (!u || !folha.open || !acoes.isConnected) return;
      const a = document.createElement('a');
      a.className = 'add add--leve';
      a.href = u;
      a.textContent = 'Página e histórico';
      acoes.append(a);
    });
    abrirFolha();
    window.estat('produto', g.n.slice(0, 60));
    try {
      const r = await fetch(`/dados/h/${encodeURIComponent(g.i)}.json`);
      if (r.status === 404) { $('#fpHist').innerHTML = '<h3>Preço nos últimos dias</h3><p>Começámos a registar este produto há pouco: o gráfico aparece nos próximos dias.</p>'; return; }
      if (!r.ok) throw new Error(r.status);
      $('#fpHist').innerHTML = '<h3>Preço nos últimos dias</h3>' + grafico(await r.json());
    } catch (e) {
      $('#fpHist').innerHTML = '<h3>Preço nos últimos dias</h3><p>Não conseguimos abrir o histórico agora. Tenta daqui a pouco.</p>';
    }
  }
  function mostrarComoAvisar(g) {
    const c = $('#fpSeguir');
    c.hidden = false;
    c.innerHTML = `<p class="fp__seg-t">Como queres saber quando baixar?</p>
      <form class="fp__seg-form" novalidate>
        <label for="fpEmail">O teu e-mail</label>
        <div class="avisos__linha"><input id="fpEmail" type="email" inputmode="email" autocomplete="email" placeholder="nome@exemplo.pt"><button class="botao botao--pequeno" type="submit">Avisar por e-mail</button></div>
        <label class="caixinha"><input type="checkbox" id="fpSemanal"> Também o resumo de quinta-feira</label>
        <p class="fp__seg-msg" role="alert" hidden></p>
      </form>
      ${pushPossivel() || iosSemApp() ? '<button class="botao botao--leve botao--pequeno" type="button" id="fpPush">Avisar no telemóvel</button>' : ''}
      <p class="fp__seg-nota">Também fica marcado aqui: vês a descida quando voltares.</p>`;
    const msg = c.querySelector('.fp__seg-msg');
    c.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault();
      const email = $('#fpEmail').value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) { msg.textContent = 'Escreve um e-mail completo.'; msg.hidden = false; return; }
      try { msg.textContent = textoEstado(await pedirEmail(email, $('#fpSemanal').checked, 'produto')); }
      catch (x) { msg.textContent = 'Não conseguimos guardar agora. Tenta outra vez.'; }
      msg.hidden = false;
      desenharSeguidos();
    });
    const bp = c.querySelector('#fpPush');
    if (bp) bp.addEventListener('click', async () => { if (await ativarPush()) c.hidden = true; });
    $('#fpEmail').focus({ preventScroll: true });
  }
  function fecharFolha() { if (folha.open) folha.close(); }
  folha.addEventListener('close', () => { if (/^#(p=|conta)/.test(location.hash)) history.replaceState(null, '', location.pathname + (B.q ? '#q=' + encodeURIComponent(B.q) : '')); });
  folha.addEventListener('click', e => { if (e.target === folha) fecharFolha(); });
  $('#fecharFolha').addEventListener('click', fecharFolha);
  folha.addEventListener('click', e => { const a = e.target.closest('[data-loja]'); if (a) window.estat('loja', LOJAS[a.dataset.loja]); });

  function grafico(h, W = 600) {
    const series = Object.entries(h).filter(([, v]) => v.length);
    const dias = [...new Set(series.flatMap(([, v]) => v.map(x => x[0])))].sort();
    if (dias.length < 2) return `<p>Começámos a guardar o preço deste produto a ${dataCurta(dias[0] || hojeLx())}. O gráfico vai-se enchendo a cada dia.</p>`;
    const H = 190, e = 44, d = 12, t = 12, b = 26, estreito = W < 500, passo = estreito ? W / 3 : 150, l0 = estreito ? 0 : e, tl = estreito ? 18 : 26;
    const vals = series.flatMap(([, v]) => v.map(x => x[1]));
    let mn = Math.min(...vals), mx = Math.max(...vals);
    if (mx - mn < 0.1) { mn -= 0.1; mx += 0.1; }
    const x = dia => e + (dias.indexOf(dia) / (dias.length - 1)) * (W - e - d);
    const y = v => t + (1 - (v - mn) / (mx - mn)) * (H - t - b);
    const tracos = { c: '', p: '7 5', a: '2 4' };
    const linhas = series.map(([c, v]) => `<polyline fill="none" stroke="#141414" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" ${tracos[c] ? `stroke-dasharray="${tracos[c]}"` : ''} points="${v.map(p => `${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ')}"/>`).join('');
    const fmtD = s => new Date(s + 'T12:00:00').toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' }).replace('.', '');
    const leg = series.map(([c], k) => `<g transform="translate(${l0 + k * passo},${H + 18})"><line x1="0" x2="${tl}" y1="-4" y2="-4" stroke="#141414" stroke-width="2.5" ${tracos[c] ? `stroke-dasharray="${tracos[c]}"` : ''}/><text x="${tl + 6}" y="0">${LOJAS[c]}</text></g>`).join('');
    const minimo = series.flatMap(([c, v]) => v.map(p => [p[1], c, p[0]])).sort((a, b) => a[0] - b[0])[0];
    return `<svg class="grafico" viewBox="0 0 ${W} ${H + 28}" role="img" aria-label="Preço desde ${fmtD(dias[0])}: o mais baixo foi ${eur(minimo[0])} no ${LOJAS[minimo[1]]} a ${fmtD(minimo[2])}">
      <text x="${e - 8}" y="${y(mx) + 4}" text-anchor="end">${nf.format(mx)}</text>
      <text x="${e - 8}" y="${y(mn) + 4}" text-anchor="end">${nf.format(mn)}</text>
      <line x1="${e}" x2="${W - d}" y1="${H - b + 6}" y2="${H - b + 6}" stroke="#D8D8D0" stroke-width="2"/>
      <text x="${e}" y="${H - 4}">${fmtD(dias[0])}</text><text x="${W - d}" y="${H - 4}" text-anchor="end">${fmtD(dias[dias.length - 1])}</text>
      ${linhas}<g class="legenda">${leg}</g></svg>
      <p>O mais baixo desde ${fmtD(dias[0])}: <b>${eur(minimo[0])}</b> no ${LOJAS[minimo[1]]}, a ${fmtD(minimo[2])}.</p>`;
  }

  // ---------- gerir avisos (link dos e-mails: #conta=…) ----------
  async function abrirConta(t) {
    $('#folhaCorpo').innerHTML = '<h2 id="folhaTitulo">Os teus avisos</h2><p class="fp__q">A carregar…</p>';
    abrirFolha();
    let j;
    try { j = await api('/api/conta?t=' + encodeURIComponent(t)); }
    catch (e) { $('#folhaCorpo').innerHTML = '<h2 id="folhaTitulo">Os teus avisos</h2><p class="fp__q">Este link já não é válido. Pede os avisos outra vez com o teu e-mail.</p>'; return; }
    conta = { ...conta, t, estado: j.confirmado ? 'ativo' : 'confirmar' };
    gravar('caiu-conta', conta);
    // o código de acesso sai do endereço (não fica no histórico nem em capturas de ecrã)
    if (location.hash.startsWith('#conta=')) history.replaceState(null, '', location.pathname + '#conta');
    // junta aos seguidos deste telemóvel o que segues por e-mail
    for (const s of j.seguidos) if (!S[s.i]) S[s.i] = { p: s.ref, n: s.n, t: Date.now() };
    gravar('caiu-seguir', S);
    desenharSeguidos();
    $('#folhaCorpo').innerHTML = `<h2 id="folhaTitulo">Os teus avisos</h2>
      <p class="fp__q">Para ${esc(j.email)}${j.confirmado ? '' : ' (por confirmar)'}</p>
      <label class="caixinha caixinha--escura"><input type="checkbox" id="contaSemanal"${j.semanal ? ' checked' : ''}> Resumo de quinta-feira com os descontos a sério</label>
      <h3 class="conta__t">Segues ${j.seguidos.length} ${j.seguidos.length === 1 ? 'produto' : 'produtos'}</h3>
      <ul class="conta__lista">${j.seguidos.map(s => `<li><a href="#p=${encodeURIComponent(s.i)}">${esc(s.n)}</a><button type="button" class="add add--leve" data-conta-tirar="${esc(s.i)}">Deixar de seguir</button></li>`).join('') || '<li>Ainda nada. Abre um produto e carrega em «Seguir o preço».</li>'}</ul>
      <div class="fp__acoes"><button type="button" class="botao botao--leve botao--pequeno" id="contaSair">Deixar de receber tudo</button></div>`;
    $('#contaSemanal').addEventListener('change', e => api('/api/conta', { t, acao: 'semanal', valor: e.target.checked }).then(() => aviso('Guardado')).catch(() => aviso('Não deu para guardar.')));
  }
  $('#folhaCorpo').addEventListener('click', async e => {
    const t = conta.t;
    const b = e.target.closest('[data-conta-tirar]');
    if (b && t) {
      await api('/api/conta', { t, acao: 'tirar', produto: b.dataset.contaTirar }).catch(() => {});
      delete S[b.dataset.contaTirar]; gravar('caiu-seguir', S);
      b.closest('li').remove(); desenharSeguidos(); aviso('Deixaste de seguir');
    }
    if (e.target.id === 'contaSair' && t) {
      await api('/api/conta', { t, acao: 'sair' }).catch(() => {});
      conta = {}; gravar('caiu-conta', conta);
      $('#folhaCorpo').innerHTML = '<h2 id="folhaTitulo">Feito</h2><p class="fp__q">Não voltas a receber e-mails do caiu.pt. Os produtos que segues continuam marcados neste telemóvel.</p>';
      desenharSeguidos();
    }
  });

  // ---------- endereços (#q=, #p=, #conta=) e mensagens (?ok=) ----------
  function rotas() {
    const h = decodeURIComponent(location.hash.slice(1));
    if (h.startsWith('q=')) {
      const q = h.slice(2);
      $('#q').value = q;
      if (q !== B.q || $('#resultados').hidden) pesquisar(q, true, true);
      fecharFolha();
    } else if (h.startsWith('p=')) {
      abrirProduto(h.slice(2));
    } else if (h.startsWith('conta=')) {
      abrirConta(h.slice(6));
    } else if (h === 'conta' && conta.t) {
      abrirConta(conta.t);
    } else if (folha.open) {
      fecharFolha();
    }
  }
  window.addEventListener('hashchange', rotas);
  function mensagens() {
    const ok = new URLSearchParams(location.search).get('ok');
    if (!ok) return;
    const txt = { confirmado: 'E-mail confirmado. Avisamos quando os teus produtos baixarem.', saiu: 'Pronto: não voltas a receber e-mails do caiu.pt.', 'link-velho': 'Este link já não é válido.' }[ok];
    if (ok === 'confirmado') { conta = { ...conta, estado: 'ativo' }; gravar('caiu-conta', conta); }
    if (ok === 'saiu') { conta = {}; gravar('caiu-conta', conta); }
    if (txt) aviso(txt, 5000);
    history.replaceState(null, '', location.pathname + location.hash);
  }

  async function iniciar() {
    mensagens();
    desenharDescontos();
    atualizarPush();
    if (conta.email) $('#emailAvisos').value = conta.email;
    try {
      const resp = await fetch('/dados/resumo.json');
      if (!resp.ok) throw new Error(resp.status);
      R = await resp.json();
      mostrarResumo();
    } catch (e) {
      $('#talaoHora').textContent = 'sem dados';
      $('#talaoPe').textContent = 'Estamos a recolher os preços de hoje. Volta daqui a pouco.';
    }
    desenharLista();
    desenharSeguidos();
    if (location.hash === '#essencial' || location.hash === '#lista' || location.hash === '#metodo' || location.hash === '#descontos' || location.hash === '#avisos' || location.hash === '#seguidos') {
      const alvo = document.querySelector(location.hash);
      if (alvo && !alvo.hidden) setTimeout(() => alvo.scrollIntoView(), 50);
    }
    rotas();
  }
  iniciar();
})();
