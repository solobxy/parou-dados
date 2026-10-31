/* já está — motor das pré-visualizações.
   Lê os dados do negócio (window.D, ou #d=<base64> no endereço), preenche a página,
   calcula «aberto agora» na hora de Portugal e, em modo pré-visualização, mostra a barra
   «já está» e o que cada botão faria no site a sério, em vez de o executar. */
(function () {
  'use strict';
  var BASE = (function () { var c = document.currentScript; return c && c.src ? c.src.replace(/[^/]*$/, '') : '/m/'; })();
  var DINIS_WA = '351913488258';
  var DINIS_TEL = '+351913488258';
  var PRECO = 149;            // preço de lançamento (5 primeiros negócios)
  var PRECO_DEPOIS = 249;     // preço depois dos 5 primeiros
  var RENOVACAO = 96;         // por ano, a partir do 2.º ano
  var DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
  var NOMES_DIA = { seg: 'Segunda', ter: 'Terça', qua: 'Quarta', qui: 'Quinta', sex: 'Sexta', sab: 'Sábado', dom: 'Domingo' };
  var ORDEM = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];

  function lerHash() {
    var m = /[#&]d=([^&]+)/.exec(location.hash || '');
    if (!m) return null;
    try {
      var b = m[1].replace(/-/g, '+').replace(/_/g, '/');
      while (b.length % 4) b += '=';
      var bin = atob(b), bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch (e) { return null; }
  }

  var D = window.D || lerHash() || window.EXEMPLO || {};
  window.D = D;
  var PREVIA = !D.final && !/[#&]limpo/.test(location.hash);
  var EXEMPLO = !window.D || D === window.EXEMPLO || (D.expira && D.expira >= '2099');
  var doc = document.documentElement;
  if (PREVIA) doc.classList.add('previa');
  // aberto no telemóvel do Dinis (marca guardada pela página /criar/): o fecho faz-se ali mesmo
  var NO_DINIS = false;
  try { NO_DINIS = localStorage.getItem('jaesta-dinis') === '1'; } catch (e) {}

  /* ---------- utilidades ---------- */
  var nb = ' ';
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function soDigitos(t) { return String(t || '').replace(/\D/g, ''); }
  function telIntl(t) { var d = soDigitos(t); if (d.length === 9) d = '351' + d; return d; }
  function telBonito(t) {
    var d = soDigitos(t); if (d.indexOf('351') === 0 && d.length === 12) d = d.slice(3);
    if (d.length !== 9) return t || '';
    return d.slice(0, 3) + nb + d.slice(3, 6) + nb + d.slice(6);
  }
  function eTelemovel(t) { var d = soDigitos(t); if (d.indexOf('351') === 0) d = d.slice(3); return d[0] === '9'; }
  function hora(h) { var p = h.split(':'); return +p[0] + 'h' + (p[1] && p[1] !== '00' ? p[1] : ''); }
  function minutos(h) { var p = h.split(':'); return (+p[0]) * 60 + (+p[1] || 0); }
  function sem(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function slug(s) { return sem(s).replace(/&/g, 'e').replace(/[^a-z0-9]+/g, ''); }
  function lista(arr) {
    if (arr.some(function (x) { return / e /.test(x); })) return arr.join(', ');
    arr = arr.slice(); var u = arr.pop(); return arr.length ? arr.join(', ') + ' e ' + u : (u || '');
  }

  /* «da Barbearia», «do Estúdio», «das Remodelações»; nomes próprios ficam «de» */
  var FEM = 'barbearia oficina clinica pastelaria padaria tasca casa loja auto garagem estetica cabeleireira drogaria farmacia mercearia taberna churrasqueira marisqueira pizzaria hamburgueria cervejaria tabacaria papelaria lavandaria serralharia carpintaria mecanica reparadora empresa construtora sociedade escola academia esplanada adega quinta florista boutique retrosaria sapataria optica ourivesaria relojoaria vidraria eletrica canalizadora pintora'.split(' ');
  var MASC = 'estudio studio salao espaco centro instituto restaurante cafe atelier ginasio cabeleireiro barbeiro talho snack bar grupo armazem stand atelie consultorio gabinete laboratorio minimercado supermercado'.split(' ');
  var PLUR_F = 'remodelacoes construcoes canalizacoes instalacoes pinturas reparacoes obras manutencoes montagens decoracoes unhas'.split(' ');
  var PLUR_M = 'servicos trabalhos acabamentos'.split(' ');
  function artigo() {
    if (D.artigo !== undefined) return D.artigo;
    var p = sem(String(D.nome || '').trim().split(/\s+/)[0]);
    if (FEM.indexOf(p) > -1) return 'a';
    if (MASC.indexOf(p) > -1) return 'o';
    if (PLUR_F.indexOf(p) > -1) return 'as';
    if (PLUR_M.indexOf(p) > -1) return 'os';
    return '';
  }
  function deN(nome) { var a = artigo(); return (a ? 'd' + a + ' ' : 'de ') + nome; }
  function dominio() { return D.dominio || (slug(D.nome).slice(0, 40) + '.pt'); }
  function agoraLisboa() {
    var f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    var p = {}; f.formatToParts(new Date()).forEach(function (x) { p[x.type] = x.value; });
    var map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return { dia: map[p.weekday], min: (+p.hour) * 60 + (+p.minute) };
  }
  function dataPT(d, opts) {
    if (typeof d === 'string') d = new Date(d + 'T12:00:00');
    return d.toLocaleDateString('pt-PT', opts || { day: 'numeric', month: 'long' });
  }

  /* serviços: «Corte | 12 €» dá nome e preço; só nome também serve */
  function servicos(padrao) {
    var l = (D.servicos && D.servicos.length) ? D.servicos : padrao;
    return l.map(function (s) {
      if (typeof s === 'object') return s;
      var p = String(s).split(/\s*[|=]\s*/);
      var preco = p[1] ? p[1].replace(/\s*€?\s*$/, '').trim() : '';
      return { nome: p[0].trim(), preco: preco ? (/^[\d.,]+$/.test(preco) ? preco.replace('.', ',') + nb + '€' : preco) : '' };
    });
  }

  /* ---------- horário ---------- */
  var H = D.horario || null;
  function blocos(dia) { return (H && H[dia]) || []; }
  function estado() {
    if (!H) return null;
    var a = agoraLisboa(), hoje = DIAS[a.dia], bl = blocos(hoje);
    for (var i = 0; i < bl.length; i++) {
      var ini = minutos(bl[i][0]), fim = minutos(bl[i][1]);
      if (fim <= ini) fim += 24 * 60;
      if (a.min >= ini && a.min < fim) {
        var falta = fim - a.min;
        return { aberto: true, texto: 'Aberto agora', detalhe: falta <= 45 ? 'fecha daqui a ' + falta + nb + 'min' : 'fecha às ' + hora(bl[i][1]) };
      }
      if (a.min < ini) return { aberto: false, texto: 'Fechado agora', detalhe: 'abre hoje às ' + hora(bl[i][0]) };
    }
    for (var k = 1; k <= 7; k++) {
      var d = DIAS[(a.dia + k) % 7], b2 = blocos(d);
      if (b2.length) return { aberto: false, texto: 'Fechado agora', detalhe: 'abre ' + (k === 1 ? 'amanhã' : NOMES_DIA[d].toLowerCase()) + ' às ' + hora(b2[0][0]) };
    }
    return null;
  }
  function horarioLinhas() {
    var out = [], hoje = DIAS[agoraLisboa().dia];
    ORDEM.forEach(function (d) {
      var bl = blocos(d);
      out.push({ dia: NOMES_DIA[d], hoje: d === hoje, texto: bl.length ? bl.map(function (b) { return hora(b[0]) + '–' + hora(b[1]); }).join(' · ') : 'Fechado' });
    });
    return out;
  }
  function diasAbertos(n) {
    var a = agoraLisboa(), res = [];
    for (var k = 0; res.length < n && k < 14; k++) {
      var idx = (a.dia + k) % 7, d = DIAS[idx], bl = blocos(d);
      if (H && !bl.length) continue;
      if (k === 0 && bl.length && a.min >= minutos(bl[bl.length - 1][1]) - 30) continue;
      var dt = new Date(Date.now() + k * 864e5);
      res.push({ chave: d, curto: k === 0 ? 'Hoje' : k === 1 ? 'Amanhã' : NOMES_DIA[d], num: dt.toLocaleDateString('pt-PT', { day: 'numeric', timeZone: 'Europe/Lisbon' }), frase: k === 0 ? 'hoje' : k === 1 ? 'amanhã' : (d === 'sab' || d === 'dom' ? 'no ' : 'na ') + NOMES_DIA[d].toLowerCase() });
    }
    return res;
  }

  /* ---------- preencher ---------- */
  function preencher() {
    document.querySelectorAll('[data-d]').forEach(function (e) {
      var v = D[e.getAttribute('data-d')];
      if (v == null || v === '') { var s = e.closest('[data-se]'); if (s) s.hidden = true; return; }
      e.textContent = v;
    });
    document.querySelectorAll('[data-se]').forEach(function (e) {
      var k = e.getAttribute('data-se');
      if (k && (D[k] == null || D[k] === '' || (Array.isArray(D[k]) && !D[k].length))) e.hidden = true;
    });
    document.querySelectorAll('[data-tel]').forEach(function (e) { e.textContent = telBonito(D.tel); });
    document.querySelectorAll('[data-rating]').forEach(function (e) {
      if (!D.rating) { var s = e.closest('[data-se-rating]') || e; s.hidden = true; return; }
      e.textContent = Number(D.rating).toFixed(1).replace('.', ',');
    });
    document.querySelectorAll('[data-n]').forEach(function (e) { e.textContent = D.n ? D.n + nb + (D.n === 1 ? 'avaliação' : 'avaliações') : ''; });
    document.querySelectorAll('[data-ano]').forEach(function (e) { e.textContent = new Date().getFullYear(); });
    document.querySelectorAll('[data-dominio]').forEach(function (e) { e.textContent = dominio(); });
    // fotos do negócio: no site final, as do dono; na pré-visualização, o lugar onde vão ficar
    document.querySelectorAll('[data-fotos]').forEach(function (e) {
      var f = Array.isArray(D.fotos) ? D.fotos : [];
      if (f.length) {
        e.innerHTML = f.slice(0, 7).map(function (u, i) {
          return '<figure><img src="' + esc(u) + '" alt="Foto ' + (i + 1) + ' ' + esc(deN(D.nome || 'negócio')) + '" loading="lazy" decoding="async" width="1200" height="900"></figure>';
        }).join('');
      } else if (PREVIA) {
        e.classList.add('reservado');
        e.innerHTML = ['A sua melhor foto', 'Uma foto do espaço', 'Uma foto do trabalho'].map(function (t) {
          return '<figure><span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h3l2-2h6l2 2h3v12H4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>' + t + '</span></figure>';
        }).join('');
      } else { var s = e.closest('[data-se-fotos]'); if (s) s.hidden = true; }
    });
    var est = estado();
    document.querySelectorAll('[data-aberto]').forEach(function (e) {
      if (!est) { e.hidden = true; return; }
      e.classList.toggle('esta-aberto', est.aberto);
      e.innerHTML = '<i aria-hidden="true"></i><b>' + est.texto + '</b><span>' + est.detalhe + '</span>';
    });
    document.querySelectorAll('[data-horario]').forEach(function (e) {
      if (!H) { var s = e.closest('[data-se-horario]'); if (s) s.hidden = true; return; }
      e.innerHTML = horarioLinhas().map(function (l) {
        return '<li' + (l.hoje ? ' class="hoje"' : '') + '><span>' + l.dia + (l.hoje ? ' <em>hoje</em>' : '') + '</span><span>' + l.texto + '</span></li>';
      }).join('');
    });
    if (D.nome) document.title = D.nome + (D.freguesia ? ' · ' + D.freguesia : '');
    // dados estruturados para o Google no site final (sem notas copiadas de outros sites)
    try {
      var ld = { '@context': 'https://schema.org', '@type': window.TIPO_SCHEMA || 'LocalBusiness', name: D.nome, telephone: D.tel ? '+' + telIntl(D.tel) : undefined, address: D.morada };
      var s = document.createElement('script'); s.type = 'application/ld+json'; s.textContent = JSON.stringify(ld); document.head.appendChild(s);
    } catch (e) {}
  }

  /* ---------- ações do negócio ---------- */
  function temWhats() { return !!(D.wa || eTelemovel(D.tel)); }
  function linkWhatsNegocio(msg) {
    var n = D.wa || (eTelemovel(D.tel) ? D.tel : null);
    return n ? 'https://wa.me/' + telIntl(n) + '?text=' + encodeURIComponent(msg) : null;
  }
  function linkMapa() { return D.maps || 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent((D.nome || '') + ' ' + (D.morada || '')); }
  function executar(tipo, msg) {
    var url;
    if (tipo === 'ligar') url = 'tel:+' + telIntl(D.tel);
    else if (tipo === 'mapa') url = linkMapa();
    else if (tipo === 'instagram') url = 'https://instagram.com/' + String(D.instagram || '').replace('@', '');
    else url = linkWhatsNegocio(msg) || 'tel:+' + telIntl(D.tel);
    if (PREVIA) { mostrarEfeito(tipo, msg); return; }
    if (url.indexOf('tel:') === 0) location.href = url; else window.open(url, '_blank', 'noopener');
  }

  /* título à medida: cabe em no máximo 2 linhas e a palavra mais comprida nunca se parte */
  function ajustar(alvo, max, min, linhas) {
    if (!alvo) return;
    linhas = linhas || 2;
    function cabe(t) {
      alvo.style.fontSize = t + 'px';
      var lh = parseFloat(getComputedStyle(alvo).lineHeight) || t;
      return alvo.scrollWidth <= alvo.clientWidth + 1 && alvo.getBoundingClientRect().height <= lh * linhas + 2;
    }
    function fazer() {
      if (!alvo.clientWidth) return;
      var lo = min || 28, hi = max;
      if (cabe(hi)) return;
      for (var i = 0; i < 9; i++) { var mid = (lo + hi) / 2; if (cabe(mid)) lo = mid; else hi = mid; }
      alvo.style.fontSize = Math.floor(lo) + 'px';
    }
    alvo.style.overflowWrap = 'normal';
    fazer();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fazer);
    var t; window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(fazer, 120); });
  }

  /* aviso junto a um botão quando falta escolher alguma coisa */
  function avisar(junto, texto) {
    var a = junto.parentNode.querySelector('.je-falta');
    if (!a) { a = el('p', 'je-falta'); a.setAttribute('role', 'alert'); junto.parentNode.insertBefore(a, junto.nextSibling); }
    a.textContent = texto;
    clearTimeout(a._t); a._t = setTimeout(function () { a.remove(); }, 4000);
  }

  window.JaEsta = {
    D: D, previa: PREVIA, executar: executar, diasAbertos: diasAbertos, nb: nb, esc: esc, ajustar: ajustar,
    temWhats: temWhats, servicos: servicos, lista: lista, avisar: avisar, deN: deN
  };
  document.addEventListener('click', function (ev) {
    var a = ev.target.closest('[data-acao]');
    if (!a) return;
    ev.preventDefault();
    var tipo = a.getAttribute('data-acao');
    var msg = a.getAttribute('data-msg') || ('Olá! Vi o vosso site e queria ' + (window.PEDIDO_PADRAO || 'pedir uma informação') + '.');
    executar(tipo, msg);
  });

  /* ---------- modo pré-visualização ---------- */
  var toast, folha, barra, focoAntes;
  function mostrarEfeito(tipo, msg) {
    var dn = esc(deN(D.nome || 'negócio'));
    var corpo;
    if (tipo === 'ligar') corpo = 'No site a sério, este botão liga logo para o número <b>' + esc(telBonito(D.tel)) + '</b>, ' + dn + '.';
    else if (tipo === 'mapa') corpo = 'No site a sério, abre o Google Maps com o caminho até à porta ' + dn + '.';
    else if (tipo === 'instagram') corpo = 'No site a sério, abre o Instagram ' + dn + '.';
    else if (temWhats()) corpo = 'No site a sério, abre o WhatsApp ' + dn + ' com esta mensagem já escrita:<q>' + esc(msg) + '</q>O cliente só carrega em enviar.';
    else corpo = 'No site a sério, este botão liga para o número <b>' + esc(telBonito(D.tel)) + '</b>, ' + dn + '. Com um telemóvel com WhatsApp, o pedido chegava assim, já escrito:<q>' + esc(msg) + '</q>';
    if (!toast) {
      toast = el('div', 'je-toast');
      toast.setAttribute('role', 'dialog'); toast.setAttribute('aria-live', 'polite'); toast.setAttribute('aria-label', 'O que este botão faz');
      document.body.appendChild(toast);
    }
    focoAntes = document.activeElement;
    toast.innerHTML = '<p>' + corpo + '</p><button type="button" class="je-ok">Percebi</button>';
    toast.classList.add('ativo');
    var ok = toast.querySelector('.je-ok');
    ok.focus({ preventScroll: true });
    ok.onclick = function () { toast.classList.remove('ativo'); if (focoAntes && focoAntes.focus) focoAntes.focus({ preventScroll: true }); };
  }

  /* versões de cor: o dono escolhe a de que gosta mais (e essa segue na mensagem para o Dinis) */
  var VERS = window.VERSOES || null, versao = 0;
  function aplicarVersao(i) {
    if (!VERS) return;
    versao = i;
    var v = VERS[i].cores; for (var k in v) doc.style.setProperty(k, v[k]);
    var mt = document.querySelector('meta[name=theme-color]'); if (mt && VERS[i].tema) mt.content = VERS[i].tema;
    document.querySelectorAll('.je-versoes button').forEach(function (b, j) { b.setAttribute('aria-pressed', j === i); });
    var m = document.querySelector('.je-folha a.je-btn.je-quero'); if (m) m.href = linkDinis();
    document.querySelectorAll('.je-versao-escolhida').forEach(function (t) { t.textContent = 'Cores escolhidas: ' + VERS[i].nome.toLowerCase() + '.'; });
  }
  function linkDinis() {
    return 'https://wa.me/' + DINIS_WA + '?text=' + encodeURIComponent('Olá Dinis, vi a pré-visualização do site ' + deN(D.nome || '') + ' e quero avançar' + (VERS ? ', com as cores ' + VERS[versao].nome.toLowerCase() : '') + '.');
  }
  function bolinhas(v) { return '<span class="je-bol" aria-hidden="true">' + v.amostra.map(function (c) { return '<i style="background:' + c + '"></i>'; }).join('') + '</span>'; }
  function marcarSim() {
    try {
      var l = JSON.parse(localStorage.getItem('jaesta-feitas') || '[]'), achou = false;
      l.forEach(function (it) { if (it.nome === D.nome) { it.estado = 'Disse que sim'; achou = true; } });
      if (!achou) l.unshift({ nome: D.nome, link: location.href, data: new Date().toLocaleDateString('pt-PT'), estado: 'Disse que sim' });
      localStorage.setItem('jaesta-feitas', JSON.stringify(l));
    } catch (e) {}
  }

  function construirBarra() {
    var expira = D.expira ? new Date(D.expira + 'T23:59:59') : null;
    if (expira && Date.now() > expira.getTime()) {
      var fim = el('div', 'je-expirou');
      fim.innerHTML = '<div><svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#2B3FE0"/><path d="M20 33l8 8 17-19" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg><h2>Esta pré-visualização terminou a ' + dataPT(D.expira) + '.</h2><p>O site ' + esc(deN(D.nome || 'negócio')) + ' ainda pode ficar no ar. Fale com o Dinis.</p><a class="je-btn" href="https://wa.me/' + DINIS_WA + '?text=' + encodeURIComponent('Olá Dinis, a pré-visualização do site ' + deN(D.nome || '') + ' terminou. Ainda dá para avançar?') + '" target="_blank" rel="noopener">Falar com o Dinis</a></div>';
      document.body.appendChild(fim);
      document.body.style.overflow = 'hidden';
      return;
    }
    barra = el('div', 'je-barra');
    barra.innerHTML =
      '<button type="button" class="je-abrir" aria-haspopup="dialog">' +
      '<svg class="je-simb" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#2B3FE0"/><path d="M20 33l8 8 17-19" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      '<span class="je-txt"><b>' + esc(D.nome || 'O seu negócio') + '</b><span>Pré-visualização</span></span>' +
      '<span class="je-cta">Quero este site</span></button>';
    if (VERS) {
      var vs = el('div', 'je-versoes'); vs.setAttribute('role', 'group'); vs.setAttribute('aria-label', 'Ver com outras cores');
      vs.innerHTML = '<span>Cores</span>' + VERS.map(function (v, i) { return '<button type="button" aria-pressed="' + (i === 0) + '" aria-label="Cores ' + esc(v.nome.toLowerCase()) + '">' + bolinhas(v) + '</button>'; }).join('');
      barra.insertBefore(vs, barra.firstChild);
      vs.querySelectorAll('button').forEach(function (b, i) { b.addEventListener('click', function () { aplicarVersao(i); }); });
    }
    document.body.appendChild(barra);
    /* o fim da página nunca fica escondido atrás da barra, mesmo quando ela parte em duas linhas */
    if (window.ResizeObserver) new ResizeObserver(function () { document.body.style.paddingBottom = 'calc(' + (barra.offsetHeight + 24) + 'px + env(safe-area-inset-bottom))'; }).observe(barra);

    var noAr = new Date(Date.now() + 2 * 864e5);
    var expiraTxt = (D.expira && !EXEMPLO) ? ' A pré-visualização fica guardada até ' + dataPT(D.expira) + '.' : '';
    folha = el('div', 'je-folha');
    folha.setAttribute('role', 'dialog'); folha.setAttribute('aria-modal', 'true'); folha.setAttribute('aria-labelledby', 'je-titulo'); folha.hidden = true;
    var oferta =
      '<div class="je-carimbo" aria-hidden="true"><span>já está</span><small>feito para</small><span class="je-carimbo-nome">' + esc(D.nome || '') + '</span></div>' +
      '<h2 id="je-titulo">Este site já está feito. Falta só dizer que sim.</h2>' +
      '<ul class="je-lista">' +
      '<li><b>No ar em 48' + nb + 'horas</b>, no endereço <span class="je-dom">' + esc(dominio()) + '</span> (confirmo se está livre).</li>' +
      '<li><b>Fotos, preços e textos</b> acertados consigo. As fotos passam a ser as suas.</li>' +
      '<li><b>Fica seu</b>: o domínio fica em nome do negócio.</li>' +
      '</ul>' +
      '<div class="je-preco"><div class="je-linha-preco"><span class="je-valor">' + PRECO + nb + '€</span><span class="je-unico">para pôr no ar, com o 1.º ano de domínio e alojamento</span></div>' +
      '<p class="je-depois">Depois, ' + RENOVACAO + nb + '€ por ano, com alterações pequenas incluídas. Sem fidelização.</p>' +
      '<p>Metade quando disser que sim, o resto só com o site no ar. Se não gostar, não paga nada.</p></div>' +
      '<p class="je-nota">Preço final, sem IVA a somar, com fatura-recibo. Preço de lançamento para os 5 primeiros negócios; depois, ' + PRECO_DEPOIS + nb + '€. Para comparar: encontrei preços públicos em Portugal de 297' + nb + '€ a 690' + nb + '€ + IVA por um site de uma página. Isto é uma proposta de demonstração: ainda não é o site oficial ' + (D.nome ? esc(deN(D.nome)) : 'do negócio') + '.' + expiraTxt + '</p>' +
      (VERS ? '<p class="je-versao-escolhida">Cores escolhidas: ' + esc(VERS[0].nome.toLowerCase()) + '.</p>' : '');
    var acoes = NO_DINIS
      ? '<button type="button" class="je-btn je-fechar-ja">Fechar agora</button>' +
        '<div class="je-fecho" hidden>' +
        '<h3>Ótimo. Fica assim:</h3>' +
        '<ol><li><b>Agora:</b> ' + (PRECO / 2).toFixed(2).replace('.', ',') + nb + '€ por <span class="nb">MB' + nb + 'WAY</span> para o 913' + nb + '488' + nb + '258 (Dinis Sousa).</li>' +
        '<li><b>Hoje:</b> mande-me pelo WhatsApp 3 a 6 fotos, o logótipo (se tiver) e os preços. Para a fatura: nome e NIF.</li>' +
        '<li><b>' + dataPT(noAr, { weekday: 'long', day: 'numeric', month: 'long' }) + ':</b> o site fica no ar e paga os outros ' + (PRECO / 2).toFixed(2).replace('.', ',') + nb + '€.</li></ol>' +
        '<button type="button" class="je-btn je-sec je-marcar">Marcar «Disse que sim» na minha lista</button></div>'
      : '<a class="je-btn je-quero" href="' + linkDinis() + '" target="_blank" rel="noopener">Quero este site</a>' +
        '<a class="je-btn je-sec" href="tel:' + DINIS_TEL + '">Ligar ao Dinis · 913' + nb + '488' + nb + '258</a>';
    folha.innerHTML =
      '<div class="je-fundo" data-fechar></div>' +
      '<div class="je-cartao" tabindex="-1">' +
      '<button type="button" class="je-fechar" data-fechar aria-label="Fechar">×</button>' +
      '<div class="je-rolo">' + oferta + acoes +
      '<p class="je-assina"><span>Feito por <a href="https://dinissousa.pt" target="_blank" rel="noopener">Dinis Sousa</a>, em Gondomar.</span><img class="je-logo" src="' + BASE + 'jaesta-logo.svg" alt="já está" width="88" height="27"></p>' +
      '</div></div>';
    document.body.appendChild(folha);
    if (NO_DINIS) {
      folha.querySelector('.je-fechar-ja').addEventListener('click', function () {
        this.hidden = true; var f = folha.querySelector('.je-fecho'); f.hidden = false; f.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
      folha.querySelector('.je-marcar').addEventListener('click', function () { marcarSim(); this.textContent = 'Marcado na lista'; this.disabled = true; });
    }
    var ultimoFoco = null;
    function abrir() {
      ultimoFoco = document.activeElement;
      folha.hidden = false;
      requestAnimationFrame(function () { folha.classList.add('ativo'); });
      folha.querySelector('.je-cartao').focus({ preventScroll: true });
      document.body.classList.add('je-preso');
    }
    function fechar() {
      folha.classList.remove('ativo');
      document.body.classList.remove('je-preso');
      setTimeout(function () { folha.hidden = true; }, 320);
      if (ultimoFoco) ultimoFoco.focus({ preventScroll: true });
    }
    barra.querySelector('.je-abrir').addEventListener('click', abrir);
    folha.addEventListener('click', function (e) { if (e.target.closest('[data-fechar]')) fechar(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { if (folha.classList.contains('ativo')) fechar(); if (toast) toast.classList.remove('ativo'); }
      if (e.key === 'Tab' && folha.classList.contains('ativo')) {
        var f = [].filter.call(folha.querySelectorAll('a,button'), function (x) { return x.offsetParent; }); var p = f[0], u = f[f.length - 1];
        if (e.shiftKey && document.activeElement === p) { e.preventDefault(); u.focus(); }
        else if (!e.shiftKey && document.activeElement === u) { e.preventDefault(); p.focus(); }
      }
    });
    // a barra entra depois de a pessoa ver o topo do site (o site é o protagonista)
    setTimeout(function () { barra.classList.add('ativo'); }, 1600);
    if (/[#&]oferta/.test(location.hash)) setTimeout(abrir, 400);
  }

  function arrancar() {
    preencher();
    if (PREVIA) construirBarra();
    if (VERS && D.versao) aplicarVersao(Math.min(VERS.length - 1, +D.versao || 0));
    if (typeof window.aoArrancar === 'function') window.aoArrancar(D);
    // entradas por secção: só acontecem uma vez; sem script, tudo fica visível
    var alvos = document.querySelectorAll('[data-entra]');
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (x) { if (x.isIntersecting) { x.target.classList.add('dentro'); io.unobserve(x.target); } });
      }, { rootMargin: '0px 0px -8% 0px' });
      alvos.forEach(function (a) { a.classList.add('fora'); io.observe(a); });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar); else arrancar();

  /* Telefones, monograma e títulos em letra grande: se não couberem (ecrã estreito ou letra aumentada), encolhem até caber */
  (function () {
    function larg(e) { var r = document.createRange(); r.selectNodeContents(e); return r.getBoundingClientRect().width; }
    function cabe() {
      [].forEach.call(document.querySelectorAll('.contactos .tel, .tel-grande, .vidro .letra'), function (e) {
        e.style.fontSize = ''; var p = e.parentElement, ps = getComputedStyle(p), livre = (p.clientWidth - parseFloat(ps.paddingLeft) - parseFloat(ps.paddingRight)) * (e.classList.contains('letra') ? 0.9 : 1);
        for (var k = 0; k < 3; k++) { var w = larg(e); if (!w || w <= livre + 1) break; e.style.fontSize = (parseFloat(getComputedStyle(e).fontSize) * livre / w * 0.98) + 'px'; }
      });
      /* títulos: a palavra mais comprida tem de caber inteira (sem a partir) */
      [].forEach.call(document.querySelectorAll('h1, h2'), function (e) {
        if (e.closest('.je-folha, .je-barra, .je-expirou')) return; e.style.fontSize = '';
        for (var k = 0; k < 3; k++) { if (e.scrollWidth <= e.clientWidth + 1 || !e.clientWidth) break; e.style.fontSize = (parseFloat(getComputedStyle(e).fontSize) * e.clientWidth / e.scrollWidth * 0.98) + 'px'; }
      });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', cabe); else cabe();
    addEventListener('resize', cabe); addEventListener('load', cabe);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(cabe);
  })();
})();
