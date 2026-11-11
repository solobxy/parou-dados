/* ganhas.pt — interações. Sem bibliotecas. Tudo funciona sem script (o conteúdo já vem no HTML). */
(() => {
  'use strict';
  const D = (() => { try { return JSON.parse((document.getElementById('dados') || {}).textContent || '{}'); } catch (e) { return {}; } })();
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduzido = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // mesmo formato das páginas: 1.234,50 € (ponto nos milhares, vírgula nas casas decimais)
  // nas páginas em inglês: 1,234.50 e €1,234.50
  const EN = document.documentElement.lang === 'en';
  const num = (v, casas = 0) => {
    const [i, d] = Math.abs(v).toFixed(casas).split('.');
    return (v < 0 ? '−' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, EN ? ',' : '.') + (d ? (EN ? '.' : ',') + d : '');
  };
  const euro = (v, casas = 0) => (EN ? (v < 0 ? '−€' + num(-v, casas) : '€' + num(v, casas)) : num(v, casas) + '\u00a0€');
  const pct = (v, casas = 0) => num(v, casas) + (EN ? '%' : '\u00a0%');
  const guardar = (k, v) => { try { localStorage.setItem('ganhas.' + k, v); } catch (e) { /* modo privado */ } };
  const ler = (k) => { try { return localStorage.getItem('ganhas.' + k); } catch (e) { return null; } };
  const estat = (n, v) => { try { window.estat && window.estat(n, v); } catch (e) { /* sem estatísticas */ } };
  document.documentElement.classList.remove('sem-js');

  // ---------- entradas e traço de marcador (uma vez) ----------
  // também mostra o que já ficou para trás (saltos com âncoras ou scroll muito rápido)
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => {
    for (const e of es) if (e.isIntersecting || e.boundingClientRect.top < 0) { e.target.classList.add('on'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -10% 0px' }) : null;
  const pendentes = new Set();
  const observar = (els) => els.forEach((el, i) => {
    if (!io) { el.classList.add('on'); return; }
    if (el.classList.contains('entra')) el.style.transitionDelay = ((i % 4) * 70) + 'ms';
    io.observe(el); pendentes.add(el);
  });
  observar($$('.entra, .mk'));
  if (io) {
    let pedido = 0;
    const varrer = () => {
      pedido = 0;
      const lim = innerHeight * 0.95;
      for (const el of pendentes) {
        if (el.classList.contains('on')) { pendentes.delete(el); continue; }
        if (el.getBoundingClientRect().top < lim) { el.classList.add('on'); io.unobserve(el); pendentes.delete(el); }
      }
      if (!pendentes.size) removeEventListener('scroll', aoScroll);
    };
    const aoScroll = () => { if (!pedido) pedido = requestAnimationFrame(varrer); };
    addEventListener('scroll', aoScroll, { passive: true });
  }

  // ---------- contagem dos números ----------
  function contar(el, alvo, fmt, dur = 600) {
    if (!el) return;
    const ini = parseFloat(el.dataset.v || '0') || 0;
    el.dataset.v = alvo;
    if (ini === alvo) { el.textContent = fmt(alvo); return; }
    const t0 = performance.now();
    const passo = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(ini + (alvo - ini) * e);
      if (k < 1) requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  }

  // ---------- distribuição (decis oficiais) ----------
  // pontos: [[€, percentil], ...] ordenados; entre pontos assume-se distribuição uniforme
  function percentil(x, pontos) {
    if (!pontos || !pontos.length) return null;
    if (x <= pontos[0][0]) return 0;
    for (let i = 1; i < pontos.length; i++) {
      const [x0, p0] = pontos[i - 1], [x1, p1] = pontos[i];
      if (x <= x1) return p0 + (p1 - p0) * (x - x0) / (x1 - x0);
    }
    return pontos[pontos.length - 1][1];
  }

  // ---------- IRS 2026 (tabelas de retenção na fonte, Continente) ----------
  // Cada linha: [limite superior, taxa, parcela a abater]; a parcela pode ser {t, f, b} = t × f × (b − R).
  // Regras: Despacho n.º 233-A/2026 (fórmula, n.º 5 al. h) e Código do IRS, art. 99.º-E (arredonda ao euro inferior).
  // Novembro de 2026: metade da retenção, exceto acima do penúltimo escalão (Despacho n.º 12523-A/2026).
  function retencao(R, tabela, dependentes, novembro) {
    const T = D.irs && D.irs.tabelas && D.irs.tabelas[tabela];
    if (!T || !(R > 0)) return 0;
    const dep = dependentes || 0;
    for (const l of T.linhas) {
      if (l[0] === null || R <= l[0]) {
        let taxa = l[1];
        if (dep >= 3 && (tabela === 'I' || tabela === 'II')) taxa -= 0.01;
        let parcela = l[2];
        if (parcela && typeof parcela === 'object') parcela = parcela.t * parcela.f * (parcela.b - R);
        let r = Math.max(0, Math.floor(R * taxa - (parcela || 0) - (T.dependente || 0) * dep + 1e-9));
        const lim = D.irs.novembro && D.irs.novembro.limite[tabela];
        if (novembro && lim && R <= lim) r = Math.floor(r * D.irs.novembro.fator + 1e-9);
        return r;
      }
    }
    return 0;
  }

  const c2 = (v) => Math.round(v * 100) / 100;
  function liquido(o) {
    // o: {bruto, meses (12|14), tabela, dependentes, subsidioDia, subsidioTipo, dias}
    const I = D.irs || {};
    const ss = I.ss || 0.11;
    const base = o.bruto || 0;
    const dias = o.dias || 22;
    const limite = o.subsidioTipo === 'dinheiro' ? I.subsidio_dinheiro : I.subsidio_cartao;
    const dia = Math.max(0, o.subsidioDia || 0);
    const subs = c2(dia * dias);
    const subsIsento = c2(Math.min(dia, limite || 0) * dias);
    const subsTributavel = c2(subs - subsIsento);
    const R = base + subsTributavel;
    const tab = o.tabela, dep = o.dependentes || 0;
    const irsMes = retencao(R, tab, dep);
    const ssMes = c2(R * ss);
    // subsídios de férias e de Natal: retenção autónoma (Código do IRS, art. 99.º-C)
    const irsSub = retencao(base, tab, dep);
    const liquidoSubsidio = c2(base - irsSub - base * ss);
    // em duodécimos: cada fração retém à taxa efetiva do subsídio inteiro
    const taxaSub = base ? irsSub / base : 0;
    const fr = base / 12;
    const duo = o.meses === 12 ? c2(2 * fr) : 0;
    const irsDuo = o.meses === 12 ? 2 * Math.floor(fr * taxaSub + 1e-9) : 0;
    const ssDuo = o.meses === 12 ? c2(duo * ss) : 0;
    const liquidoMes = c2(R + subsIsento + duo - irsMes - irsDuo - ssMes - ssDuo);
    // mês sem subsídio de alimentação (férias): 11 meses com subsídio, 1 sem
    const semSubs = c2(base + duo - retencao(base, tab, dep) - irsDuo - base * ss - ssDuo);
    const anual = o.meses === 12 ? c2(11 * liquidoMes + semSubs) : c2(11 * liquidoMes + semSubs + 2 * liquidoSubsidio);
    const liquidoNovembro = c2(R + subsIsento + duo - retencao(R, tab, dep, true) - irsDuo - ssMes - ssDuo);
    const tsu = I.tsu_empresa || 0.2375;
    const custoEmpresa = c2((base + subsTributavel) * (1 + tsu) + subsIsento + duo * (1 + tsu));
    return { R, irs: irsMes + irsDuo, ss: c2(ssMes + ssDuo), subs, subsIsento, subsTributavel, duo, liquidoMes,
      liquidoSubsidio, anual, liquidoNovembro, custoEmpresa, brutoAnual: c2(14 * base + 11 * subs) };
  }
  window.ganhasLiquido = liquido;

  // ---------- comparador do herói ----------
  // A pergunta, o campo e o resultado ficam no mesmo ecrã: o número grande muda enquanto se escreve.
  const comp = $('#comparador');
  const cartao = $('#resultado');
  if (comp && cartao && D.distribuicao) {
    const inp = $('#salario', comp);
    const pre = $('#res-pre'), numEl = $('#res-num'), pos = $('#res-pos');
    const dadosEl = $('#res-dados'), erro = $('#salario-erro'), resumo = $('#afinar-resumo');
    const liqEl = $('#res-liq'), liqA = $('#res-liq-a'), medEl = $('#res-med'), difEl = $('#res-dif');
    const seguirLiq = $('#seguir-liquido');
    // O recibo de exemplo mais abaixo passa a ser o da pessoa
    const ex = ['ex-tit', 'ex-base', 'ex-ss', 'ex-irs', 'ex-liq'].map((id) => $('#' + id));
    ex.forEach((el) => { if (el) el.dataset.orig = el.textContent; });
    const recibo = (v) => {
      if (!ex[0]) return;
      if (!v) { ex.forEach((el) => { if (el) el.textContent = el.dataset.orig; }); return; }
      const r = liquido({ bruto: v, meses: 14, tabela: 'I', dependentes: 0 });
      ex[0].textContent = 'Com o teu salário: ' + euro(v) + ' brutos';
      if (ex[1]) ex[1].textContent = euro(v, 2);
      if (ex[2]) ex[2].textContent = '− ' + euro(r.ss, 2);
      if (ex[3]) ex[3].textContent = '− ' + euro(r.irs, 2);
      if (ex[4]) ex[4].textContent = euro(r.liquidoMes, 2);
    };
    const DD = D.distribuicao;
    let ultimoEnvio = 0;
    const ler_valor = () => {
      const t = (inp.value || '').replace(/[^\d,.]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
      return parseFloat(t);
    };
    const histos = $$('[data-histo]');
    const ligacoes = (v) => {
      const q = v ? '?bruto=' + Math.round(v) : '';
      if (liqA) liqA.href = '/calculadora/' + q;
      if (seguirLiq) seguirLiq.href = '/calculadora/' + q;
    };
    const atualizar = (registar) => {
      const tipo = ($('input[name="tipo"]:checked', comp) || {}).value || 'base';
      const meses = $('input[name="meses"]:checked', comp);
      const doze = !!(meses && meses.value === '12');
      if (resumo) resumo.textContent = (tipo === 'base' ? 'Só o vencimento base' : 'Com prémios e subsídios') + ' · ' + (doze ? '12 meses' : '14 meses');
      const S = DD[tipo];
      histos.forEach((h) => { h.hidden = h.dataset.histo !== tipo; });
      const h = histos.find((x) => x.dataset.histo === tipo);
      const marca = h && $('.histo-tu', h);
      const barras = h ? $$('.histo-barras i', h) : [];
      const v = ler_valor();
      barras.forEach((b) => b.classList.remove('tu'));
      const rp = $('#res-partilha');
      if (!v || v < 100) {
        cartao.dataset.estado = 'vazio';
        pre.textContent = 'Metade de quem trabalha a tempo completo ' + (tipo === 'base' ? 'tem um vencimento base abaixo de' : 'ganha menos de');
        numEl.dataset.v = '0';
        numEl.textContent = euro(S.mediana);
        pos.textContent = 'E tu? Escreve o teu salário.';
        if (dadosEl) dadosEl.hidden = true;
        if (marca) marca.hidden = true;
        if (rp) rp.hidden = true;
        ultimoTexto = null;
        ligacoes(0);
        recibo(0);
        return;
      }
      if (erro) erro.hidden = true;
      const v14 = doze ? v * 12 / 14 : v;
      const p = percentil(v14, S.pontos);
      const [xmin, xmax] = S.eixo;
      const x = Math.max(0, Math.min(1, (v14 - xmin) / (xmax - xmin)));
      if (marca) {
        marca.hidden = false;
        const larg = marca.parentElement.clientWidth;
        marca.style.setProperty('--x', Math.round(x * (larg - 2)) + 'px');
        marca.classList.toggle('direita', x > 0.62);
        $('b', marca).textContent = 'Tu: ' + euro(v14);
      }
      const idx = Math.min(barras.length - 1, Math.floor((v14 - xmin) / 100));
      if (idx >= 0) barras[idx] && barras[idx].classList.add('tu');
      cartao.dataset.estado = 'cheio';
      if (v14 < DD.minimo_hoje) {
        pre.textContent = 'O salário mínimo a tempo completo' + (DD.minimo_ano ? ' em ' + DD.minimo_ano : '') + ' é de';
        numEl.dataset.v = '0';
        numEl.textContent = euro(DD.minimo_hoje);
        pos.textContent = 'O valor que escreveste fica abaixo. Se trabalhas a tempo parcial, esta comparação não serve.';
      } else if (p >= 90) {
        pre.textContent = 'Estás nos';
        numEl.dataset.v = '0';
        numEl.textContent = pct(10);
        pos.textContent = 'que mais ganham em Portugal.';
      } else {
        pre.textContent = 'Ganhas mais do que';
        if (!/%/.test(numEl.textContent)) numEl.dataset.v = '0';
        contar(numEl, Math.max(1, Math.round(p)), (n) => pct(Math.round(n)), reduzido ? 1 : 500);
        pos.textContent = 'de quem trabalha a tempo completo em Portugal' + (tipo === 'base' ? '.' : ', contando prémios e subsídios.');
      }
      const dif = v14 - S.mediana;
      if (liqEl && D.irs) liqEl.textContent = euro(liquido({ bruto: v14, meses: 14, tabela: 'I', dependentes: 0 }).liquidoMes);
      if (medEl) medEl.textContent = euro(S.mediana);
      if (difEl) difEl.textContent = Math.abs(dif) < 15 ? 'Estás mesmo no meio' : 'Estás ' + euro(Math.abs(dif)) + (dif > 0 ? ' acima' : ' abaixo');
      if (dadosEl) dadosEl.hidden = false;
      ligacoes(v14);
      recibo(D.irs && v14 >= DD.minimo_hoje ? v14 : 0);
      guardar('ultimo', (inp.value || '').trim().slice(0, 12));
      ultimoTexto = (p >= 90 ? 'Em ' + DD.ano + ', eu estaria nos 10 % que mais ganhavam em Portugal.'
        : v14 < DD.minimo_hoje || (v14 <= S.pontos[0][0] && S.pontos[0][1] > 0) ? null
        : 'Em ' + DD.ano + ', ' + pct(Math.max(1, p)) + ' de quem trabalhava a tempo completo em Portugal ganhava menos do que eu.');
      if (rp) rp.hidden = !ultimoTexto;
      if (registar && Date.now() - ultimoEnvio > 4000) { ultimoEnvio = Date.now(); estat('comparou', tipo + ':' + Math.round(p / 10) * 10); }
    };
    let tempo, ultimoTexto = null;
    const bp = $('#partilhar-resultado');
    if (bp) bp.addEventListener('click', async () => {
      if (!ultimoTexto) return;
      const texto = ultimoTexto + ' E tu?';
      const url = location.origin + '/';
      estat('partilhou_resultado', navigator.share ? 'nativo' : 'copiado');
      try {
        if (navigator.share) { await navigator.share({ text: texto, url }); return; }
        await navigator.clipboard.writeText(texto + ' ' + url);
        const ok = $('#partilha-ok'); if (ok) { ok.hidden = false; setTimeout(() => { ok.hidden = true; }, 3000); }
      } catch (e) { /* a pessoa cancelou */ }
    });
    inp.addEventListener('input', () => { clearTimeout(tempo); tempo = setTimeout(() => atualizar(true), 150); });
    $$('input[name="meses"], input[name="tipo"]', comp).forEach((r) => r.addEventListener('change', () => atualizar(true)));
    // «Comparar» (ou Enter): fecha o teclado e traz o resultado para o ecrã
    comp.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const v = ler_valor();
      if (!v || v < 100) { if (erro) erro.hidden = false; inp.focus(); return; }
      clearTimeout(tempo);
      atualizar(true);
      inp.blur();
      estat('comparar_botao', '1');
      setTimeout(() => {
        const r = cartao.getBoundingClientRect();
        if (r.top > innerHeight * 0.45 || r.top < 0) cartao.scrollIntoView({ behavior: reduzido ? 'auto' : 'smooth', block: 'start' });
      }, 300);
    });
    addEventListener('resize', () => atualizar(false), { passive: true });
    const antes = ler('ultimo');
    if (antes && !inp.value) inp.value = antes;
    atualizar(false);
  }

  // ---------- calculadora de salário líquido ----------
  const calc = $('#calculadora');
  if (calc && D.irs) {
    const campos = $$('input, select', calc);
    const out = (id, v) => { const el = $('#' + id); if (el) el.textContent = v; };
    const correr = () => {
      const bruto = parseFloat(($('#c-bruto').value || '').replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')) || 0;
      const sit = $('#c-situacao').value;
      const dependentes = parseInt($('#c-dep').value, 10) || 0;
      const o = {
        bruto, meses: parseInt($('#c-meses').value, 10), dependentes,
        tabela: sit === 'c1' ? 'III' : (sit === 'nc' && dependentes > 0 ? 'II' : 'I'),
        subsidioDia: parseFloat(($('#c-subs').value || '0').replace(',', '.')) || 0,
        subsidioTipo: $('#c-subs-tipo').value,
      };
      if (!bruto || bruto < 1) { calc.classList.add('vazia'); return; }
      calc.classList.remove('vazia');
      const r = liquido(o);
      out('c-r-base', euro(bruto, 2));
      out('c-r-subs', euro(r.subs, 2));
      $('#c-l-subs').hidden = !r.subs;
      out('c-r-duo', euro(r.duo, 2));
      $('#c-l-duo').hidden = !r.duo;
      out('c-r-ss', '− ' + euro(r.ss, 2));
      out('c-r-irs', '− ' + euro(r.irs, 2));
      contar($('#c-r-liq'), r.liquidoMes, (v) => euro(v, 2));
      out('c-r-ano', euro(r.anual, 0));
      out('c-r-taxa', pct(r.R ? (r.irs / (r.R + r.duo)) * 100 : 0, 1));
      out('c-r-custo', euro(r.custoEmpresa, 2));
      const nov = $('#c-l-nov');
      if (nov) { const ate = !!(D.irs && D.irs.novembro) && new Date() < new Date((D.irs.ano || 2026) + '-12-01T00:00:00'); nov.hidden = !ate || Math.abs(r.liquidoNovembro - r.liquidoMes) < 0.5; out('c-r-nov', euro(r.liquidoNovembro, 2)); }
      clearTimeout(correr.t); correr.t = setTimeout(() => estat('calculou', String(Math.round(bruto / 100) * 100)), 1500);
      const ch = $('#c-chamada'); if (ch) ch.hidden = !(bruto >= 100);
    };
    try {
      const q = new URLSearchParams(location.search).get('bruto');
      if (q && /^\d{3,6}$/.test(q)) $('#c-bruto').value = q;
    } catch (e) { /* sem parâmetros */ }
    campos.forEach((c) => c.addEventListener('input', correr));
    const fc = $('#form-calc'); if (fc) fc.addEventListener('submit', (ev) => ev.preventDefault());
    correr();
  }

  // ---------- dispositivo (para não contar a mesma pessoa duas vezes) ----------
  function dispositivo() {
    let d = ler('dispositivo');
    if (!d || !/^[A-Za-z0-9_-]{16,64}$/.test(d)) {
      const a = new Uint8Array(18); crypto.getRandomValues(a);
      d = btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      guardar('dispositivo', d);
    }
    return d;
  }

  // ---------- pesquisa com sugestões (profissões, empresas) ----------
  const semAcentos = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  function sugerir(inp, lista, aoEscolher, livre) {
    const caixa = document.createElement('ul');
    caixa.className = 'sugestoes'; caixa.id = inp.id + '-lista'; caixa.setAttribute('role', 'listbox'); caixa.hidden = true;
    inp.setAttribute('role', 'combobox'); inp.setAttribute('aria-autocomplete', 'list'); inp.setAttribute('aria-expanded', 'false');
    inp.setAttribute('aria-controls', caixa.id);
    inp.parentElement.appendChild(caixa);
    let itens = [], ativo = -1;
    const fechar = () => { caixa.hidden = true; inp.setAttribute('aria-expanded', 'false'); ativo = -1; };
    const marcar = (i) => {
      ativo = i;
      $$('li', caixa).forEach((li, j) => li.setAttribute('aria-selected', j === i ? 'true' : 'false'));
      if (i >= 0) inp.setAttribute('aria-activedescendant', caixa.id + '-' + i); else inp.removeAttribute('aria-activedescendant');
    };
    const escolher = (it) => { inp.value = it.nome; fechar(); aoEscolher(it); };
    inp.addEventListener('input', () => {
      aoEscolher(null);
      const q = semAcentos(inp.value.trim());
      if (q.length < 2) { fechar(); return; }
      const palavras = q.split(/\s+/);
      itens = lista.filter((it) => palavras.every((w) => it._p.includes(w)))
        .sort((a, b) => (semAcentos(a.nome).startsWith(q) ? 0 : 1) - (semAcentos(b.nome).startsWith(q) ? 0 : 1)).slice(0, 8);
      caixa.innerHTML = '';
      itens.forEach((it, i) => {
        const li = document.createElement('li'); li.id = caixa.id + '-' + i; li.setAttribute('role', 'option');
        li.textContent = it.nome; li.addEventListener('mousedown', (e) => { e.preventDefault(); escolher(it); });
        caixa.appendChild(li);
      });
      caixa.hidden = !itens.length; inp.setAttribute('aria-expanded', String(!!itens.length)); marcar(-1);
    });
    inp.addEventListener('keydown', (e) => {
      if (caixa.hidden) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); marcar(Math.min(itens.length - 1, ativo + 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); marcar(Math.max(0, ativo - 1)); }
      else if (e.key === 'Enter' && ativo >= 0) { e.preventDefault(); escolher(itens[ativo]); }
      else if (e.key === 'Escape') fechar();
    });
    inp.addEventListener('blur', () => setTimeout(() => {
      fechar();
      if (!livre) {
        const q = semAcentos(inp.value.trim());
        const exato = lista.find((it) => semAcentos(it.nome) === q || (it.fem && semAcentos(it.fem) === q));
        if (exato) aoEscolher(exato);
      }
    }, 120));
  }

  // ---------- partilhar ----------
  const form = $('#form-partilhar');
  if (form && D.catalogo) {
    const profs = D.catalogo.profissoes.map((p) => ({ ...p, _p: semAcentos(p.pesquisa + ' ' + p.nome) }));
    const emps = D.catalogo.empresas.map((e) => ({ ...e, _p: semAcentos(e.nome + ' ' + e.id + ' ' + (e.outros || []).join(' ')) }));
    let profEscolhida = null;
    sugerir($('#p-profissao'), profs, (it) => { profEscolhida = it; }, false);
    const pre = new URLSearchParams(location.search).get('p');
    const preP = pre && profs.find((x) => x.id === pre);
    if (preP) { $('#p-profissao').value = preP.nome; profEscolhida = preP; }
    sugerir($('#p-empresa'), emps, () => {}, true);
    const inicio = Date.now();
    let desafio = null, prova = null, aCalcular = null;
    const prepararProva = () => {
      if (aCalcular) return aCalcular;
      aCalcular = fetch('/api/desafio', { cache: 'no-store' }).then((r) => r.json()).then((d) => new Promise((res, rej) => {
        desafio = d;
        const w = new Worker('/prova.js');
        w.onmessage = (ev) => { w.terminate(); if (ev.data.nonce) { prova = ev.data.nonce; res(); } else rej(new Error('prova')); };
        w.onerror = () => { w.terminate(); rej(new Error('prova')); };
        w.postMessage({ sal: d.sal, bits: d.bits });
      })).catch((e) => { aCalcular = null; throw e; });
      return aCalcular;
    };
    form.addEventListener('focusin', () => prepararProva().catch(() => {}), { once: true });
    const erroCampo = (nome, msg) => {
      const f = form.querySelector('[data-campo="' + nome + '"]');
      if (!f) return;
      f.classList.toggle('tem-erro', !!msg);
      const e = $('.erro span', f); if (e) e.textContent = msg || '';
    };
    const geral = $('#p-erro');
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      geral.hidden = true;
      ['profissao', 'distrito', 'bruto', 'contrato', 'experiencia', 'empresa'].forEach((c) => erroCampo(c, ''));
      const bruto = parseFloat(($('#p-bruto').value || '').replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
      let falhas = [];
      if (!profEscolhida) { erroCampo('profissao', 'Escolhe uma profissão da lista (escreve e toca numa sugestão).'); falhas.push('p-profissao'); }
      if (!$('#p-distrito').value) { erroCampo('distrito', 'Escolhe o distrito onde trabalhas.'); falhas.push('p-distrito'); }
      if (!bruto || bruto < 200) { erroCampo('bruto', 'Escreve o salário bruto mensal, antes de descontos.'); falhas.push('p-bruto'); }
      if (!form.contrato.value) { erroCampo('contrato', 'Escolhe o tipo de contrato.'); falhas.push('p-contrato-0'); }
      if (!$('#p-experiencia').value) { erroCampo('experiencia', 'Escolhe os anos de experiência.'); falhas.push('p-experiencia'); }
      if (falhas.length) { $('#' + falhas[0]).focus(); return; }
      const botao = $('button[type=submit]', form);
      botao.setAttribute('aria-busy', 'true');
      const textoBotao = botao.textContent;
      botao.textContent = 'A enviar…';
      try {
        await prepararProva();
        const corpo = {
          desafio, nonce: prova, site: form.site.value, t: Date.now() - inicio, dispositivo: dispositivo(),
          profissao: profEscolhida.id, distrito: $('#p-distrito').value, bruto, periodo: 'mes',
          meses: parseInt(form.meses.value, 10) || 14, horas: parseInt($('#p-horas').value, 10) || 40,
          contrato: form.contrato.value, experiencia: $('#p-experiencia').value, genero: $('#p-genero').value,
          empresa: $('#p-empresa').value.trim(), subsidio_dia: parseFloat(($('#p-subs').value || '').replace(',', '.')) || null,
        };
        const r = await fetch('/api/partilhar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          if (j.campos) Object.entries(j.campos).forEach(([k, v]) => erroCampo(k, v));
          geral.textContent = j.erro || 'Não foi possível enviar. Tenta outra vez daqui a pouco.';
          geral.hidden = false; geral.focus();
          aCalcular = null; prova = null;
          return;
        }
        guardar('partilhado', JSON.stringify({ profissao: profEscolhida.id, nome: profEscolhida.nome, quando: Date.now() }));
        estat('partilhou', profEscolhida.id);
        mostrarObrigado(profEscolhida, bruto, j);
      } catch (e) {
        geral.textContent = 'Sem ligação ao servidor. Verifica a internet e tenta outra vez.';
        geral.hidden = false; geral.focus();
        aCalcular = null; prova = null;
      } finally {
        botao.removeAttribute('aria-busy'); botao.textContent = textoBotao;
      }
    });

    function mostrarObrigado(prof, bruto, j) {
      const caixa = $('#obrigado');
      form.hidden = true; caixa.hidden = false;
      const ofi = prof.ganho_grupo;
      const pos = D.distribuicao ? percentil(bruto, D.distribuicao.base.pontos) : null;
      let html = '<h2 tabindex="-1">Obrigado. A tua resposta conta a partir de amanhã.</h2>';
      if (pos !== null && bruto > D.distribuicao.minimo) html += '<p class="res-frase" style="margin-top:24px">Em ' + D.distribuicao.ano + ', <span class="mk on">' + pct(Math.max(1, Math.min(99, pos))) + '</span> de quem trabalhava a tempo completo tinha um vencimento base mais baixo.</p>';
      if (ofi) html += '<p class="lede" style="margin-top:16px">No teu grupo de profissões, o ganho médio oficial é ' + euro(ofi) + ' brutos por mês (setor privado).</p>';
      const c = j.comunidade || {};
      html += c.mediana ? '<p class="lede" style="margin-top:12px">Entre ' + c.n + ' pessoas com a tua profissão no ganhas.pt, a mediana é ' + euro(c.mediana) + '.</p>'
        : '<p class="lede" style="margin-top:12px">Ainda faltam ' + (c.faltam || 5) + ' partilhas da tua profissão para mostrarmos a mediana da comunidade. Partilha o site com colegas.</p>';
      html += '<p style="margin-top:32px;display:flex;flex-wrap:wrap;gap:12px"><button class="botao" id="b-partilhar" type="button">Enviar o site a colegas</button>' +
        '<a class="botao sec2" href="/profissoes/' + prof.id + '/">Ver a minha profissão</a></p>';
      caixa.innerHTML = html;
      $('h2', caixa).focus();
      $('#b-partilhar', caixa).addEventListener('click', partilharSite);
    }
  }

  async function partilharSite() {
    const dados = { title: 'ganhas.pt', text: 'Quanto ganhas? Compara o teu salário com o resto de Portugal, sem conta e sem nome.', url: 'https://ganhas.pt/' };
    estat('enviou_site', 'partilha');
    if (navigator.share) { try { await navigator.share(dados); } catch (e) { /* cancelado */ } return; }
    try { await navigator.clipboard.writeText(dados.url); alertaCurto('Ligação copiada.'); } catch (e) { /* sem área de transferência */ }
  }
  $$('[data-partilhar-site]').forEach((b) => b.addEventListener('click', partilharSite));
  function alertaCurto(t) {
    const el = document.createElement('div');
    el.className = 'ok-msg'; el.setAttribute('role', 'status'); el.textContent = t;
    Object.assign(el.style, { position: 'fixed', left: '50%', bottom: '24px', transform: 'translateX(-50%)', zIndex: 60 });
    document.body.appendChild(el); setTimeout(() => el.remove(), 2200);
  }

  // ---------- apagar a minha partilha ----------
  const apagar = $('#apagar-partilha');
  if (apagar) {
    const p = ler('partilhado');
    if (p) apagar.hidden = false;
    const btn = $('button', apagar);
    let armado = 0;
    btn && btn.addEventListener('click', async () => {
      // confirmação no próprio botão (sem janelas do navegador): o 2.º toque nos 6 s seguintes apaga
      if (Date.now() - armado > 6000) {
        armado = Date.now(); const antes = btn.textContent; btn.textContent = 'Toca outra vez para apagar';
        setTimeout(() => { if (Date.now() - armado >= 6000) btn.textContent = antes; }, 6100);
        return;
      }
      btn.setAttribute('aria-busy', 'true');
      const r = await fetch('/api/apagar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dispositivo: dispositivo() }) }).catch(() => null);
      if (r && r.ok) { try { localStorage.removeItem('ganhas.partilhado'); } catch (e) { /* */ } apagar.innerHTML = '<p class="ok-msg" role="status">Apagado. Não fica nada teu nas nossas contas.</p>'; }
      else alertaCurto('Não foi possível apagar agora. Tenta mais tarde ou escreve-nos.');
    });
  }

  // ---------- comunidade numa página de profissão ou empresa ----------
  const com = $('[data-comunidade]');
  if (com) {
    fetch('/api/resumo?' + com.dataset.comunidade, { cache: 'default' }).then((r) => r.json()).then((j) => {
      if (j.mediana) {
        com.innerHTML = '<p class="res-frase">Mediana na comunidade: <span class="mk on">' + euro(j.mediana) + '</span></p>' +
          '<p class="res-extra">Metade entre ' + euro(j.p25) + ' e ' + euro(j.p75) + ' · ' + j.n + ' pessoas · valores brutos a 40 h por semana, arredondados à dezena.</p>';
      } else {
        com.innerHTML = '<p class="lede">Ainda há ' + (j.n || 0) + ' ' + ((j.n || 0) === 1 ? 'partilha' : 'partilhas') + '. Mostramos a mediana quando houver 5 pessoas diferentes (faltam ' + (j.faltam || 5) + ').</p>';
      }
    }).catch(() => { com.innerHTML = '<p class="lede">Não foi possível carregar as partilhas agora.</p>'; });
  }

  // ---------- contador real de partilhas ----------
  const cont = $('[data-contador]');
  if (cont) fetch('/api/estado').then((r) => r.json()).then((j) => {
    if (typeof j.partilhas === 'number' && j.partilhas >= 20) { cont.textContent = num(j.partilhas) + ' salários partilhados até agora.'; cont.hidden = false; }
  }).catch(() => {});

  // ---------- filtro de listas (profissões, concelhos) ----------
  $$('[data-filtro]').forEach((inp) => {
    const alvo = $(inp.dataset.filtro);
    const linhas = $$('[data-nome]', alvo);
    const vazio = $(inp.dataset.vazio || '#__nada');
    inp.addEventListener('input', () => {
      const q = semAcentos(inp.value.trim());
      let n = 0;
      linhas.forEach((l) => { const ok = !q || l.dataset.nome.includes(q); l.hidden = !ok; if (ok) n++; });
      if (vazio) vazio.hidden = n > 0;
    });
  });
})();
