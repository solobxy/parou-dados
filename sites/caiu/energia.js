/* caiu.pt — luz e gás: a conta de cada pessoa, feita no telemóvel com /dados/energia.json e energia-calc.js. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var C = window.CaiuEnergia;
  var D = null, ultimo = null, mostrar = 10, contou = false;
  var form = $('#lgForm');
  if (!form || !C) return;

  var POT = ['1,15', '2,3', '3,45', '4,6', '5,75', '6,9', '10,35', '13,8', '17,25', '20,7'];
  // casos tipo da ERSE (kWh por ano): 1–2 pessoas, 3–4, 5 ou mais
  var CASA = { 1: { kva: '3,45', kwh: 1900, gkwh: 1610 }, 2: { kva: '6,9', kwh: 5000, gkwh: 3407 }, 3: { kva: '13,8', kwh: 10900, gkwh: 7467 } };
  var TEM = [
    ['cartao_continente', 'Cartão Continente'], ['pingodoce', 'App Pingo Doce'], ['nos_tv', 'NOS com TV'],
    ['vodafone', 'Vodafone'], ['meo', 'MEO M4e ou M5e'], ['santander', 'Santander'],
    ['acp', 'Sócio do ACP'], ['parceiro_repsol', 'Sócio FCP, SCP ou SLB'], ['amigo', 'Código de amigo'], ['solar_galp', 'Solar da Galp'],
    ['jovem', 'Até 35 anos'], ['ve', 'Carro elétrico'], ['coop', 'Coopérnico']
  ];
  var TEM_VISIVEIS = 6;
  var CHAVE = 'caiu-energia';

  function eur(v, casas) {
    casas = casas == null ? 2 : casas;
    var s = Math.abs(v).toFixed(casas).replace('.', ',');
    var p = s.split(','); p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return (v < 0 ? '−' : '') + p.join(',') + '\u00a0€';
  }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function nomeCom(com) {
    return String(com).split('+').map(function (c) { return (D.com[c] || {}).n || c; }).join(' + ');
  }
  function guardar(o) { try { localStorage.setItem(CHAVE, JSON.stringify(o)); } catch (e) { /* sem armazenamento: não faz mal */ } }
  function lido() { try { return JSON.parse(localStorage.getItem(CHAVE) || 'null'); } catch (e) { return null; } }

  /* ---------- formulário ---------- */
  function montarForm() {
    $('#lgKva').innerHTML = POT.map(function (k) { return '<option value="' + k + '">' + k + ' kVA</option>'; }).join('');
    $('#lgTem').innerHTML = TEM.map(function (t, i) {
      return '<label class="pilha"' + (i >= TEM_VISIVEIS ? ' data-extra hidden' : '') + '><input type="checkbox" name="tem" value="' + t[0] + '"><span>' + esc(t[1]) + '</span></label>';
    }).join('') + '<button class="pilha__mais" type="button" id="lgTemMais">Mais ' + (TEM.length - TEM_VISIVEIS) + '</button>';
    $('#lgTemMais').addEventListener('click', function () {
      $$('[data-extra]', form).forEach(function (el) { el.hidden = false; });
      this.remove();
    });
    var coms = Object.keys(D.com).filter(function (k) { return D.of.some(function (o) { return o.com === k && o.novos; }); })
      .sort(function (a, b) { return nomeCom(a).localeCompare(nomeCom(b), 'pt'); });
    $('#lgCliente').insertAdjacentHTML('beforeend', coms.map(function (k) { return '<option value="' + esc(k) + '">' + esc(nomeCom(k)) + '</option>'; }).join(''));
    var g = lido();
    if (g) {
      $$('input, select', form).forEach(function (el) {
        if (!(el.name in g)) return;
        var v = g[el.name];
        if (el.type === 'radio') el.checked = String(v) === el.value;
        else if (el.type === 'checkbox' && el.name === 'tem') el.checked = (v || []).indexOf(el.value) >= 0;
        else if (el.type === 'checkbox') el.checked = !!v;
        else el.value = v;
      });
      if (typeof g.camp === 'boolean') $('#lgCamp').checked = g.camp;
      if (typeof g.parc === 'boolean') $('#lgParc').checked = g.parc;
    }
    if (g && g.tem && g.tem.some(function (k) { return TEM.slice(TEM_VISIVEIS).some(function (t) { return t[0] === k; }); })) {
      $$('[data-extra]', form).forEach(function (el) { el.hidden = false; });
      var b = $('#lgTemMais'); if (b) b.remove();
    }
    if (!g || !g.kwh) aplicarCasa();
  }

  function val(nome) { var el = form.elements[nome]; return el ? el.value : ''; }
  function marcado(nome) { var el = form.elements[nome]; return !!(el && el.checked); }
  function radio(nome) { var el = $('input[name="' + nome + '"]:checked', form); return el ? el.value : ''; }

  function aplicarCasa() {
    var c = CASA[radio('casa')] || CASA[2];
    $('#lgKva').value = c.kva; $('#lgKwh').value = Math.round(c.kwh / 12); $('#lgGkwh').value = Math.round(c.gkwh / 12);
  }

  function lerForm() {
    var o = {};
    $$('input, select', form).forEach(function (el) {
      if (!el.name) return;
      if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
      else if (el.name === 'tem') { o.tem = o.tem || []; if (el.checked) o.tem.push(el.value); }
      else if (el.type === 'checkbox') o[el.name] = el.checked;
      else o[el.name] = el.value;
    });
    o.camp = $('#lgCamp').checked; o.parc = $('#lgParc').checked;
    return o;
  }

  function perfil() {
    var f = lerForm();
    var kva = POT.indexOf(f.kva) >= 0 ? f.kva : '6,9';
    var casa = CASA[f.casa] || CASA[2];
    var kwhMes = Math.max(10, Math.min(5000, +f.kwh || Math.round(casa.kwh / 12)));
    var ciclo = f.ciclo === '2' ? 2 : 1;
    var vazio = Math.max(0, Math.min(100, +f.vazio || 0)) / 100;
    // se o consumo é o do caso tipo (arredondado ao mês), usamos o valor anual exato da ERSE
    var ano = kwhMes === Math.round(casa.kwh / 12) ? casa.kwh : kwhMes * 12;
    var gMes = +f.gkwh || Math.round(casa.gkwh / 12);
    var gAno = gMes === Math.round(casa.gkwh / 12) ? casa.gkwh : gMes * 12;
    var tem = {};
    (f.tem || []).forEach(function (k) { tem[k] = true; });
    var cont = Math.max(0, +f.continente || 0), pd = Math.max(0, +f.pingodoce || 0);
    if (cont > 0) tem.cartao_continente = true;
    if (pd > 0) tem.pingodoce = true;
    var litros = {};
    if (f.marca) litros[f.marca] = Math.max(0, Math.min(250, +f.litros || 0));
    var cp = (f.cp || '').replace(/\D/g, '').slice(0, 4);
    return {
      tipo: f.tipo || 'E',
      ele: { kva: kva, kvaN: parseFloat(kva.replace(',', '.')), ciclo: ciclo,
             kwh: ciclo === 2 ? [ano * (1 - vazio), ano * vazio] : [ano], familiaNumerosa: radio('casa') === '3' },
      gas: { kwh: Math.max(120, Math.min(108000, gAno)), ord: (D.cp && D.cp[cp]) || null },
      tem: tem,
      habitos: { continente: cont, pingodoce: pd, litros: litros },
      pref: { dd: f.dd !== false, fe: f.fe !== false, servicos: f.servicos !== false, indexado: !!f.indexado, clienteDe: f.cliente || '' },
      _f: f
    };
  }

  /* ---------- resultados ---------- */
  function avisos(l) {
    var a = [], of = l.of;
    if (of.tmp) a.push('desconto só no 1.º ano');
    if (of.idx) a.push('preço muda todos os meses');
    if (of.novos) a.push('só novos clientes');
    if (l.fatura.servicos) a.push('inclui serviço ' + eur(l.fatura.servicos, 0) + '/ano');
    (of.req || []).forEach(function (r) { a.push('para ' + (D.req[r] || r)); });
    return a;
  }

  function linhasConta(l, op) {
    var out = [], semC = l.semCampanhas.total, comC = l.fatura.total;
    out.push(['Fatura do ano, com impostos', semC]);
    if (op.campanhas !== false && semC - comC > 0.5) out.push(['Campanha de adesão', -(semC - comC)]);
    l.vantagens.forEach(function (v) {
      if (v.so_nota || v.falta.length || op.parcerias === false) return;
      out.push([v.nome, -v.valor]);
    });
    return out;
  }

  function desenharTalao(linhas, p, op) {
    var t = $('#lgTalao');
    if (!linhas.length) {
      t.innerHTML = '<figcaption class="talao__cab"><strong>Nenhuma oferta com estas escolhas</strong></figcaption>' +
        '<p class="talao__vazio">Experimenta aceitar débito direto ou fatura eletrónica, ou tirar alguma condição em «Mais opções».</p>';
      return;
    }
    var l = linhas[0], ano = l.ano1;
    var ls = linhasConta(l, op).map(function (x) {
      return '<div><dt>' + esc(x[0]) + '</dt><dd>' + eur(x[1]) + '</dd></div>';
    }).join('');
    var pe = [];
    if (Math.abs(l.depois - l.ano1) > 1) pe.push('Do 2.º ano em diante, sem a campanha: ' + eur(l.depois, 0) + ' por ano' + (l.of.tmp ? ' ou mais (o desconto acaba)' : '') + '.');
    else if (l.of.tmp) pe.push('O desconto acaba ao fim de 12 meses: depois o preço sobe.');
    if (l.of.idx) pe.push('Preço indexado: a conta usa a média do mês passado.');
    var seg = linhas[1];
    var porque = seg ? 'Fica ' + eur(seg.ano1 - ano, 0) + ' abaixo da 2.ª, ' + esc(nomeCom(seg.of.com)) + '.' : '';
    t.innerHTML = '<figcaption class="talao__cab"><strong>' + esc(nomeCom(l.of.com)) + '</strong><span>a tua melhor opção</span></figcaption>' +
      '<p class="lg-talao__of">' + esc(l.of.n) + '</p>' +
      '<dl class="talao__linhas">' + ls + '</dl>' +
      '<div class="lg-talao__total"><span>Fica-te a</span><b class="preco">' + eur(ano / 12) + '<small>/mês</small></b><em>' + eur(ano, 0) + ' no 1.º ano</em></div>' +
      '<p class="talao__pe">' + [porque].concat(pe).filter(Boolean).map(esc).join(' ') + '</p>' +
      botoes(l);
    t.classList.remove('imprime'); void t.offsetWidth; t.classList.add('imprime');
  }

  function botoes(l) {
    var partes = l.partes ? l.partes.map(function (x) { return x.of; }) : [l.of];
    return '<p class="lg-ir">' + partes.map(function (of) {
      return of.url ? '<a class="botao botao--pequeno" href="' + esc(of.url) + '" target="_blank" rel="noopener nofollow" data-ir="' + esc(of.id) + '">Ver ' +
        esc(partes.length > 1 ? nomeCom(of.com) : 'a oferta') + ' ↗</a>' : '';
    }).join('') + '</p>';
  }

  function detalhes(l, op) {
    var partes = l.partes ? l.partes.map(function (x) { return x.of; }) : [l.of];
    var conta = linhasConta(l, op).map(function (x) { return '<li><span>' + esc(x[0]) + '</span><b>' + eur(x[1]) + '</b></li>'; }).join('');
    var vs = l.vantagens.map(function (v) {
      if (v.so_nota) return '<li class="lgd__nota">' + esc(v.nota) + '</li>';
      if (v.falta.length) return '<li class="lgd__nota">Com ' + v.falta.map(function (k) { return esc(nomeTem(k)); }).join(' e ') +
        ' ganhavas mais ' + eur(v.valor, 0) + ' por ano (' + esc(v.nome) + ').</li>';
      return '<li class="lgd__nota">' + esc(v.nome) + ': ' + esc(v.nota) + (v.estado === 'velho' ? ' (confirmado há poucos dias)' : '') + '.</li>';
    }).join('');
    var txt = partes.map(function (of) {
      return '<p><b>' + esc(nomeCom(of.com)) + ' · ' + esc(of.n) + '.</b> ' + esc(of.txt || '') + (of.txt2 ? ' ' + esc(of.txt2) : '') +
        (of.fim ? ' Oferta válida até ' + esc(of.fim) + '.' : '') + '</p>';
    }).join('');
    return '<div class="lgd"><ul class="lgd__conta">' + conta + '<li class="lgd__tot"><span>Total do 1.º ano</span><b>' + eur(l.ano1) + '</b></li></ul>' +
      (vs ? '<ul class="lgd__vs">' + vs + '</ul>' : '') + '<div class="lgd__txt">' + txt + '</div>' + botoes(l) + '</div>';
  }

  function nomeTem(k) { for (var i = 0; i < TEM.length; i++) if (TEM[i][0] === k) return TEM[i][1]; return k; }

  function desenharLista(linhas, op) {
    var ol = $('#lgLista');
    ol.innerHTML = linhas.slice(0, mostrar).map(function (l, i) {
      var av = avisos(l).slice(0, 3);
      var vant = l.vant > 0.5 && op.parcerias !== false ? '<span class="lgl__v">inclui ' + eur(l.vant, 0) + ' de saldo</span>' : '';
      return '<li class="lgl__i' + (i === 0 ? ' lgl__i--1' : '') + '">' +
        '<button class="lgl__b" type="button" aria-expanded="false">' +
        '<span class="lgl__n">' + (i + 1) + '</span>' +
        '<span class="lgl__nome"><b>' + esc(nomeCom(l.of.com)) + '</b><small>' + esc(l.of.n) + '</small>' +
        (av.length || vant ? '<span class="lgl__av">' + vant + av.map(function (a) { return '<i>' + esc(a) + '</i>'; }).join('') + '</span>' : '') + '</span>' +
        '<span class="lgl__p"><b class="preco">' + eur(l.ano1 / 12) + '<small>/mês</small></b><small>' + eur(l.ano1, 0) + '/ano</small></span></button>' +
        '<div class="lgl__d" hidden></div></li>';
    }).join('');
    $('#lgMais').hidden = linhas.length <= mostrar;
    $$('.lgl__b', ol).forEach(function (b, i) {
      b.addEventListener('click', function () {
        var d = b.nextElementSibling, abre = d.hidden;
        if (abre && !d.innerHTML) d.innerHTML = detalhes(ultimo.linhas[i], ultimo.op);
        d.hidden = !abre; b.setAttribute('aria-expanded', String(abre));
        if (abre) window.estat('energia', 'detalhe');
      });
    });
  }

  function desenharComparar(linhas, p) {
    var sec = $('#comparar');
    var por = C.porComercializador(linhas).filter(function (l) { return l.of.t !== 'D2'; }).slice(0, 10);
    if (por.length < 3) { sec.hidden = true; return; }
    sec.hidden = false;
    var min = por[0].ano1;
    var maxDif = Math.max.apply(null, por.map(function (l) { return l.ano1 - min; })) || 1;
    $('#lgCompLead').textContent = 'A melhor oferta de cada comercializador para o teu caso, e quanto pagas a mais por ano em cada um.';
    var ol = $('#lgBarras');
    ol.innerHTML = por.map(function (l, i) {
      // a barra mostra quanto paga a mais por ano do que a mais barata
      var w = i ? Math.max(3, Math.round((l.ano1 - min) / maxDif * 74)) : 0;   // até 74 %: o valor fica sempre à direita, no cinzento
      return '<li class="barra lgb' + (i === 0 ? ' barra--melhor' : '') + '"><div class="barra__topo"><span class="barra__loja">' + esc(nomeCom(l.of.com)) +
        '<small>' + esc(l.of.n) + '</small></span><span class="barra__total preco">' + eur(l.ano1 / 12) + '<small>/mês</small></span></div>' +
        (i ? '<div class="lgb__pista"><div class="lgb__enche" style="width:' + w + '%"></div><span class="lgb__val">+' + eur(l.ano1 - min, 0) + ' por ano</span></div>'
           : '<p class="lgb__melhor">A mais barata para ti</p>') + '</li>';
    }).join('');
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { ol.classList.remove('espera'); io.disconnect(); } }); }, { threshold: 0.2 });
      io.observe(ol);
    } else ol.classList.remove('espera');
  }

  function visibilidade(p) {
    $$('[data-so]', form).forEach(function (el) { el.hidden = el.getAttribute('data-so').split(' ').indexOf(p.tipo) < 0; });
    $$('[data-ciclo]', form).forEach(function (el) { el.hidden = el.hidden || String(p.ele.ciclo) !== el.getAttribute('data-ciclo'); });
    $$('[data-marca]', form).forEach(function (el) { el.hidden = !radio('marca'); });
  }

  var tempo = null;
  function calcular() {
    if (!D) return;
    var p = perfil();
    visibilidade(p);
    var op = { campanhas: $('#lgCamp').checked, parcerias: $('#lgParc').checked };
    var linhas = C.comparar(D, p, op);
    ultimo = { linhas: linhas, op: op, p: p };
    desenharTalao(linhas, p, op);
    desenharLista(linhas, op);
    desenharComparar(linhas, p);
    guardar(p._f);
    clearTimeout(tempo);
    tempo = setTimeout(function () {
      if (!contou) { contou = true; window.estat('energia', p.tipo + radio('casa')); }
    }, 1500);
  }

  form.addEventListener('input', function (ev) {
    var t = ev.target.type;
    if (t !== 'number' && t !== 'text') return;
    mostrar = 10;
    calcular();
  });
  form.addEventListener('change', function (ev) {
    if (ev.target.name === 'casa') aplicarCasa();
    mostrar = 10;
    calcular();
  });
  form.addEventListener('submit', function (ev) { ev.preventDefault(); });
  $('#lgCamp').addEventListener('change', calcular);
  $('#lgParc').addEventListener('change', calcular);
  $('#lgMais').addEventListener('click', function () { mostrar += 10; desenharLista(ultimo.linhas, ultimo.op); });
  document.addEventListener('click', function (ev) {
    var a = ev.target.closest && ev.target.closest('a[data-ir]');
    if (a) window.estat('energia', 'ir:' + a.getAttribute('data-ir'));
  });

  fetch('/dados/energia.json', { credentials: 'omit' }).then(function (r) {
    if (!r.ok) throw new Error(r.status);
    return r.json();
  }).then(function (j) {
    D = j;
    montarForm();
    calcular();
  }).catch(function () {
    $('#lgTalao').innerHTML = '<figcaption class="talao__cab"><strong>Não conseguimos carregar as ofertas</strong></figcaption>' +
      '<p class="talao__vazio">Verifica a ligação e <a href="">tenta outra vez</a>. As mais baratas de hoje estão mais abaixo.</p>';
  });
}());
