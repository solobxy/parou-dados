// Painel de estatísticas dos sites. Os dados vêm do Supabase (projeto «estatisticas», esquema estat).
(function () {
  const PT = 'pt-PT';
  const INICIO = '2026-10-31'; // primeiro dia da recolha
  const nf = new Intl.NumberFormat(PT);
  const nf1 = new Intl.NumberFormat(PT, { maximumFractionDigits: 1 });
  const nfC = new Intl.NumberFormat(PT, { minimumFractionDigits: 2, maximumFractionDigits: 3 });
  let regioes = null;
  try { regioes = new Intl.DisplayNames([PT], { type: 'region' }); } catch (e) { regioes = null; }
  const dataCurta = new Intl.DateTimeFormat(PT, { day: 'numeric', month: 'short', timeZone: 'UTC' });

  // ---------- Respostas do Supabase em linhas ----------
  ['resumo', 'serie', 'sites', 'ultimas', 'paginas', 'fontes', 'campanhas', 'referencias', 'paises', 'regioes', 'tecnologia', 'horas',
    'mapa', 'elementos', 'scroll', 'acoes', 'acoes_detalhe', 'velocidade', 'erros', 'recolha'].forEach((id) => dash.loader(id, {
    description: 'A ferramenta execute_sql do Supabase responde com texto que traz o resultado em JSON; aqui só se tira esse JSON do texto e se abre a coluna «linhas» que a função devolve.',
    fn: ({ answer }) => {
      let t = answer;
      for (let i = 0; i < 3 && t && typeof t === 'object' && !Array.isArray(t); i++) {
        if (Array.isArray(t.content)) t = t.content.map((c) => (c && c.text) || '').join('\n');
        else if (typeof t.result === 'string' || Array.isArray(t.result)) t = t.result;
        else if (t.error) throw new Error(typeof t.error === 'string' ? t.error : (t.error.message || JSON.stringify(t.error)));
        else break;
      }
      if (Array.isArray(t)) return t;
      if (typeof t !== 'string') t = JSON.stringify(t);
      // O JSON está entre a última etiqueta de abertura antes do fecho (a primeira frase também a menciona)
      const fim = t.indexOf('</untrusted-data-');
      let corpo = t.trim();
      if (fim > 0) { const ini = t.lastIndexOf('<untrusted-data-', fim); corpo = t.slice(t.indexOf('>', ini) + 1, fim).trim(); }
      let linhas;
      try { linhas = JSON.parse(corpo); } catch (e) { throw new Error(t.slice(0, 400)); }
      if (!Array.isArray(linhas)) throw new Error(t.slice(0, 400));
      // Cada consulta chama uma função estat.painel_* que devolve as linhas numa só coluna «linhas»
      if (linhas.length === 1 && linhas[0] && 'linhas' in linhas[0]) {
        const l = linhas[0].linhas;
        return Array.isArray(l) ? l : (typeof l === 'string' ? JSON.parse(l) : []);
      }
      return linhas;
    },
  }));

  // ---------- Ajudas ----------
  const num = (x) => (x === null || x === undefined || x === '' ? null : Number(x));
  const fmt = (x) => { const n = num(x); return n === null || Number.isNaN(n) ? '—' : nf.format(n); };
  const pct = (x) => { const n = num(x); return n === null || Number.isNaN(n) ? '—' : nf1.format(n) + ' %'; };
  const tempo = (s) => {
    const n = num(s); if (n === null || Number.isNaN(n)) return '—';
    if (n < 90) return Math.round(n) + ' s';
    const m = Math.floor(n / 60); const r = Math.round(n - m * 60);
    return m + ' min ' + String(r).padStart(2, '0') + ' s';
  };
  const dia = (iso) => (iso ? dataCurta.format(new Date(iso.slice(0, 10) + 'T12:00:00Z')) : '—');
  const quando = (s) => (s ? dia(s) + ' ' + s.slice(11, 16) : '—');
  const bandeira = (c) => (/^[A-Z]{2}$/.test(c || '') && c !== 'ZZ' ? String.fromCodePoint(...[...c].map((ch) => 127397 + ch.charCodeAt(0))) : '🌐');
  const pais = (c) => (!c || c === 'ZZ' ? 'Desconhecido' : (regioes && regioes.of(c)) || c);
  const APARELHO = { telemovel: 'Telemóvel', computador: 'Computador', tablet: 'Tablet' };
  const ACAO = { whatsapp: 'WhatsApp', telefone: 'Chamadas', email: 'Emails', formulario: 'Formulários', instagram: 'Ligação para o Instagram', facebook: 'Ligação para o Facebook', tiktok: 'Ligação para o TikTok', mapa: 'Abriu o mapa', link_externo: 'Ligações para fora', download: 'Downloads' };
  const MOTIVO = { chave: 'Chave errada', robo: 'Robôs', site: 'Site desconhecido', id: 'Pedido inválido', formato: 'Pedido inválido', erro: 'Erro ao gravar' };
  const nomeSite = (id) => {
    const g = dash.data('sites');
    if (g.status === 'ok') { const r = g.data.find((x) => x.site === id); if (r) return r.nome; }
    return id || '—';
  };
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined && txt !== null) e.textContent = txt; return e; };

  // Estado de uma ou mais fontes: devolve as fontes prontas, ou desenha o estado e devolve null
  function estado(alvo, ids, vazio) {
    const gs = ids.map((id) => dash.data(id));
    const falhou = gs.some((g) => g.status === 'error');
    if (gs.every((g) => g.status === 'ok')) { alvo.classList.remove('dash-skeleton'); return gs; }
    const aCarregar = !falhou && gs.some((g) => g.status === 'loading');
    alvo.classList.toggle('dash-skeleton', aCarregar && vazio);
    if (falhou) {
      const f = el('span', 'ds-falha'); f.append(el('i'), document.createTextNode('Falhou ao carregar'));
      if (alvo.tagName === 'TBODY') { const tr = el('tr'); const td = el('td'); td.colSpan = 20; td.append(f); tr.append(td); alvo.replaceChildren(tr); }
      else if (alvo.tagName === 'SELECT') alvo.replaceChildren();
      else alvo.replaceChildren(f);
    } else if (alvo.tagName === 'TBODY' || alvo.tagName === 'SELECT' || vazio) alvo.replaceChildren();
    else alvo.textContent = '—';
    return null;
  }
  function semDados(alvo, msg) {
    const txt = msg || 'Ainda sem dados neste período.';
    if (alvo.tagName === 'TBODY') { const tr = el('tr'); const td = el('td', 'ds-vazio', txt); td.colSpan = 20; tr.append(td); alvo.replaceChildren(tr); }
    else alvo.replaceChildren(el('div', 'ds-vazio', txt));
  }
  function tabela(tbody, linhas, chave, colunas, clique) {
    tbody.replaceChildren(...linhas.map((r) => {
      const tr = el('tr'); tr.dataset.key = chave(r);
      if (clique) { tr.dataset.clicavel = '1'; tr.addEventListener('click', () => clique(r)); }
      colunas.forEach((c) => {
        const v = c(r); const td = el('td');
        if (v && typeof v === 'object') { td.textContent = v.t; if (v.c) td.className = v.c; if (v.s) td.append(el('span', 'ds-sub', v.s)); }
        else td.textContent = v === null || v === undefined || v === '' ? '—' : v;
        tr.append(td);
      });
      return tr;
    }));
  }
  const n = (t) => ({ t, c: 'n' });
  const tx = (t, s) => ({ t: t || '—', c: 'txt', s });
  function barras(alvo, linhas, o) {
    const max = d3.max(linhas, o.valor) || 1;
    const ul = el('ul', 'ds-barras');
    linhas.forEach((r, i) => {
      const li = el('li', 'ds-barra');
      const b = el('span', 'ds-barra-t'); const f = el('i');
      f.style.width = Math.max(1, 100 * (o.valor(r) || 0) / max) + '%';
      f.style.background = o.cor ? o.cor(r, i) : dash.colors[0];
      b.append(f);
      li.append(el('span', 'ds-barra-l', o.rotulo(r)), b, el('span', 'ds-barra-v', o.texto(r)));
      if (o.clique) { li.dataset.clicavel = '1'; li.addEventListener('click', () => o.clique(r)); }
      ul.append(li);
    });
    alvo.replaceChildren(ul);
  }
  function dica(caixa) {
    const t = el('div', 'ds-tip'); t.hidden = true; caixa.append(t);
    return {
      mostrar(px, py, titulo, linha) {
        t.replaceChildren(el('span', null, titulo), document.createTextNode(linha)); t.hidden = false;
        const w = caixa.clientWidth; const tw = t.offsetWidth;
        t.style.left = Math.max(0, Math.min(w - tw, px - tw / 2)) + 'px'; t.style.top = Math.max(0, py - t.offsetHeight - 10) + 'px';
      },
      esconder() { t.hidden = true; },
    };
  }

  // ---------- Filtros ----------
  const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date());
  const somar = (iso, k) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + k); return d.toISOString().slice(0, 10); };
  function intervalo(p) {
    const h = hoje();
    if (p === 'hoje') return { de: h, ate: h };
    if (p === 'ontem') { const o = somar(h, -1); return { de: o, ate: o }; }
    if (p === '7') return { de: somar(h, -6), ate: h };
    if (p === 'mes') return { de: h.slice(0, 8) + '01', ate: h };
    if (p === 'sempre') return { de: INICIO, ate: h };
    return { de: null, ate: null };
  }
  function periodoAtual() {
    const pr = dash.params();
    if (!pr.de && !pr.ate) return '30';
    for (const k of ['hoje', 'ontem', '7', 'mes', 'sempre']) { const i = intervalo(k); if (i.de === pr.de && i.ate === pr.ate) return k; }
    return null;
  }
  const NOME_PERIODO = { hoje: 'Hoje', ontem: 'Ontem', 7: 'Últimos 7 dias', 30: 'Últimos 30 dias', mes: 'Este mês', sempre: 'Desde o início' };

  document.querySelectorAll('[data-periodo]').forEach((b) => b.addEventListener('click', () => dash.setParams(intervalo(b.dataset.periodo))));
  const campoDe = () => document.querySelectorAll('.ds-de');
  const campoAte = () => document.querySelectorAll('.ds-ate');
  function mostrarDatas() {
    const pr = dash.params(); const i = (!pr.de && !pr.ate) ? { de: somar(hoje(), -29), ate: hoje() } : pr;
    campoDe().forEach((c) => { if (c !== document.activeElement) c.value = i.de || ''; });
    campoAte().forEach((c) => { if (c !== document.activeElement) c.value = i.ate || ''; });
  }
  campoDe().forEach((c) => {
    c.addEventListener('change', () => {
      if (!c.value || !c.validity.valid) return;
      const pr = dash.params(); let ate = pr.ate || hoje();
      if (ate < c.value) ate = c.value;
      dash.setParams({ de: c.value, ate });
    });
    c.addEventListener('blur', mostrarDatas);
  });
  campoAte().forEach((c) => {
    c.addEventListener('change', () => {
      if (!c.value || !c.validity.valid) return;
      const pr = dash.params(); let de = pr.de || somar(hoje(), -29);
      if (de > c.value) de = c.value;
      dash.setParams({ de, ate: c.value });
    });
    c.addEventListener('blur', mostrarDatas);
  });
  document.querySelectorAll('.ds-teste').forEach((c) => c.addEventListener('change', () => dash.setParams({ teste: c.checked })));
  document.querySelectorAll('.ds-repor').forEach((b) => b.addEventListener('click', () => dash.resetParams()));
  document.querySelectorAll('[data-disp]').forEach((b) => b.addEventListener('click', () => dash.setParams({ disp: b.dataset.disp })));

  // Separadores
  function abrir(id, guardar) {
    document.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === id)));
    document.querySelectorAll('.ds-sec').forEach((s) => { s.hidden = s.id !== id; });
    if (guardar) dash.setLink(id);
  }
  document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => abrir(b.dataset.tab, true)));
  const pedido = location.hash.slice(1);
  if (pedido && document.querySelector('.ds-sec#' + CSS.escape(pedido))) abrir(pedido, false);

  // Medida do gráfico ao longo do tempo
  let medida = 'visitantes';
  document.querySelectorAll('[data-medida]').forEach((b) => b.addEventListener('click', () => {
    medida = b.dataset.medida;
    document.querySelectorAll('[data-medida]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    dash.draw('serie');
  }));

  // Ordenar a tabela das páginas e procurar
  let ordem = { campo: 'vistas', dir: -1 }; let busca = '';
  document.querySelectorAll('.ds-t-paginas th[data-field]').forEach((th) => {
    const ordenar = () => {
      const c = th.dataset.field;
      ordem = { campo: c, dir: ordem.campo === c ? -ordem.dir : (c === 'caminho' || c === 'site' ? 1 : -1) };
      document.querySelectorAll('.ds-t-paginas th[data-field]').forEach((x) => x.setAttribute('aria-sort', x === th ? (ordem.dir > 0 ? 'ascending' : 'descending') : 'none'));
      dash.draw('t-paginas');
    };
    th.addEventListener('click', ordenar);
    th.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ordenar(); } });
  });
  document.querySelectorAll('.ds-busca-paginas').forEach((i) => i.addEventListener('input', () => { busca = i.value.trim().toLowerCase(); dash.draw('t-paginas'); }));

  dash.onData(() => {
    const pr = dash.params(); const p = periodoAtual();
    document.querySelectorAll('[data-periodo]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.periodo === p)));
    document.querySelectorAll('.ds-teste').forEach((c) => { c.checked = pr.teste !== false; });
    const disp = pr.disp || 'telemovel';
    document.querySelectorAll('[data-disp]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.disp === disp)));
    mostrarDatas();
  });

  // ---------- Desenhos ----------
  dash.draw('periodo', (e) => {
    const g = estado(e, ['resumo']); if (!g) return;
    const r = g[0].data[0] || {}; const p = periodoAtual();
    const nome = p ? NOME_PERIODO[p] : 'Período escolhido';
    e.textContent = r.de === r.ate ? nome + ' (' + dia(r.de) + ')' : nome + ' (' + dia(r.de) + ' a ' + dia(r.ate) + ')';
  });

  const FORMATO = { tempo_medio_s: tempo, rejeicao: pct, scroll_medio: pct, taxa_contacto: pct };
  dash.draw('kv', (e) => {
    const g = estado(e, ['resumo']); if (!g) return;
    const r = g[0].data[0] || {}; const f = e.dataset.field;
    e.textContent = (FORMATO[f] || fmt)(r[f]);
  });
  dash.draw('kd', (e) => {
    const g = estado(e, ['resumo']); if (!g) return;
    const r = g[0].data[0] || {}; const v = num(r[e.dataset.field]);
    e.className = 'ds-kpi-d';
    if (v === null || Number.isNaN(v)) { e.textContent = 'sem período anterior para comparar'; return; }
    const pp = e.dataset.tipo === 'pp';
    const bom = e.dataset.bom === 'baixo' ? v < 0 : v > 0;
    e.textContent = (v > 0 ? '+' : v < 0 ? '−' : '') + nf1.format(Math.abs(v)) + (pp ? ' p.p.' : ' %') + ' face ao anterior';
    if (v !== 0) e.classList.add(bom ? 'ds-bom' : 'ds-mau');
  });

  dash.draw('f-site', (sel) => {
    const g = dash.data('sites');
    const opcoes = [new Option('Todos os sites', 'todos')];
    if (g.status === 'ok') g.data.forEach((r) => opcoes.push(new Option(r.nome, r.site)));
    sel.replaceChildren(...opcoes);
    sel.value = dash.params().site || 'todos';
    sel.onchange = () => dash.setParams({ site: sel.value, pagina: null });
  });

  dash.draw('serie', (caixa) => {
    const g = estado(caixa, ['serie'], true); if (!g) return;
    const linhas = g[0].data;
    caixa.replaceChildren();
    if (!linhas.length) return semDados(caixa);
    const porHora = String(linhas[0].quando).length > 10;
    const W = Math.max(280, caixa.clientWidth || 600); const H = 220; const m = { t: 12, r: 8, b: 28, l: 8 };
    const max = d3.max(linhas, (r) => num(r[medida])) || 1;
    const y = d3.scaleLinear([0, max], [H - m.b, m.t]).nice();
    const svg = d3.select(caixa).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Gráfico de barras ao longo do tempo');
    const ticks = y.ticks(4).filter((v) => Number.isInteger(v));
    const prova = svg.append('text').attr('class', 'ds-tick').text(fmt(ticks[ticks.length - 1] || max));
    m.l = Math.ceil(prova.node().getComputedTextLength()) + 10; prova.remove();
    const x = d3.scaleBand(linhas.map((r) => r.quando), [m.l, W - m.r]).paddingInner(linhas.length > 60 ? 0.1 : 0.25);
    svg.append('g').selectAll('line').data(ticks).join('line')
      .attr('x1', m.l).attr('x2', W - m.r).attr('y1', (v) => y(v)).attr('y2', (v) => y(v)).attr('stroke', 'var(--cds-chart-grid)');
    svg.append('g').selectAll('text').data(ticks).join('text').attr('class', 'ds-tick')
      .attr('x', m.l - 6).attr('y', (v) => y(v)).attr('dy', '0.32em').attr('text-anchor', 'end').text((v) => fmt(v));
    const cabe = Math.max(2, Math.floor((W - m.l) / (porHora ? 44 : 64)));
    const passo = Math.ceil(linhas.length / cabe);
    svg.append('g').selectAll('text').data(linhas.filter((r, i) => i % passo === 0)).join('text').attr('class', 'ds-tick')
      .attr('x', (r) => x(r.quando) + x.bandwidth() / 2).attr('y', H - 8).attr('text-anchor', 'middle')
      .text((r) => (porHora ? r.quando.slice(11, 13) + 'h' : dia(r.quando)));
    const tip = dica(caixa);
    const rotular = (r) => (porHora ? dia(r.quando) + ', ' + r.quando.slice(11, 13) + 'h' : dia(r.quando));
    const nomeMedida = { visitantes: 'visitantes', visitas: 'visitas', paginas_vistas: 'páginas vistas', contactos: 'contactos' }[medida];
    svg.append('g').selectAll('rect').data(linhas).join('rect')
      .attr('x', (r) => x(r.quando)).attr('width', Math.max(1, x.bandwidth()))
      .attr('y', (r) => y(num(r[medida]) || 0)).attr('height', (r) => Math.max(0, y(0) - y(num(r[medida]) || 0)))
      .attr('rx', Math.min(3, x.bandwidth() / 2)).attr('fill', dash.colors[0])
;
    // alvo de toque invisível por cima de cada dia (barras finas são difíceis de tocar)
    svg.append('g').selectAll('rect').data(linhas).join('rect')
      .attr('x', (r) => x(r.quando) - x.step() * x.paddingInner() / 2).attr('width', x.step()).attr('y', m.t).attr('height', H - m.b - m.t)
      .attr('fill', 'transparent').style('cursor', porHora ? 'default' : 'pointer')
      .on('pointerenter pointermove', (ev, r) => { const [px, py] = d3.pointer(ev, caixa); tip.mostrar(px, Math.min(py, y(num(r[medida]) || 0)), rotular(r), fmt(r[medida]) + ' ' + nomeMedida); })
      .on('pointerleave', () => tip.esconder())
      .on('click', (ev, r) => { if (!porHora) dash.setParams({ de: r.quando, ate: r.quando }); });
  });

  dash.draw('t-sites', (tb) => {
    const g = estado(tb, ['sites']); if (!g) return;
    tabela(tb, g[0].data, (r) => r.site, [
      (r) => tx(r.nome, r.dominio), (r) => n(fmt(r.visitantes)), (r) => n(fmt(r.visitas)), (r) => n(fmt(r.paginas_vistas)),
      (r) => n(tempo(r.tempo_medio_s)), (r) => n(pct(r.rejeicao)), (r) => n(fmt(r.contactos)), (r) => n(pct(r.pct_teste)),
      (r) => n(fmt(r.agora)), (r) => quando(r.ultima),
    ], (r) => dash.setParams({ site: r.site, pagina: null }));
  });

  dash.draw('t-ultimas', (tb) => {
    const g = estado(tb, ['ultimas']); if (!g) return;
    if (!g[0].data.length) return semDados(tb);
    tabela(tb, g[0].data, (r) => r.id, [
      (r) => quando(r.quando), (r) => nomeSite(r.site), (r) => tx(r.caminho, r.teste ? 'endereço de teste' : ''), (r) => r.fonte,
      (r) => bandeira(r.pais) + ' ' + (r.pais || ''), (r) => APARELHO[r.dispositivo] || r.dispositivo, (r) => n(tempo(r.tempo_s)),
      (r) => n(pct(r.scroll_max)), (r) => (r.entrada ? 'Sim' : 'Não'),
    ]);
  });

  dash.draw('t-paginas', (tb) => {
    const g = estado(tb, ['paginas']); if (!g) return;
    let linhas = g[0].data.slice();
    if (busca) linhas = linhas.filter((r) => (r.caminho + ' ' + (r.titulo || '') + ' ' + r.site).toLowerCase().includes(busca));
    const c = ordem.campo; const texto = c === 'caminho' || c === 'site';
    linhas.sort((a, b) => (texto ? String(a[c]).localeCompare(String(b[c]), PT) : (num(a[c]) || 0) - (num(b[c]) || 0)) * ordem.dir);
    if (!linhas.length) return semDados(tb, busca ? 'Nenhuma página com esse texto.' : null);
    tabela(tb, linhas, (r) => r.chave, [
      (r) => tx(r.caminho, r.titulo), (r) => nomeSite(r.site), (r) => n(fmt(r.vistas)), (r) => n(fmt(r.visitantes)), (r) => n(fmt(r.entradas)),
      (r) => n(fmt(r.saidas)), (r) => n(tempo(r.tempo_medio_s)), (r) => n(pct(r.scroll_medio)), (r) => n(pct(r.chegou_fim)),
      (r) => n(pct(r.rejeicao)), (r) => n(fmt(r.cliques)), (r) => n(fmt(r.contactos)),
    ], (r) => { dash.setParams({ pagina: r.site + '|' + r.caminho }); abrir('cliques', true); });
  });

  dash.draw('b-fontes', (caixa) => {
    const g = estado(caixa, ['fontes'], true); if (!g) return;
    if (!g[0].data.length) return semDados(caixa);
    barras(caixa, g[0].data, { rotulo: (r) => r.fonte, valor: (r) => num(r.visitas), texto: (r) => fmt(r.visitas) });
  });
  dash.draw('b-conv', (caixa) => {
    const g = estado(caixa, ['fontes'], true); if (!g) return;
    const linhas = g[0].data.slice().sort((a, b) => num(b.taxa_contacto) - num(a.taxa_contacto));
    if (!linhas.length) return semDados(caixa);
    barras(caixa, linhas, { rotulo: (r) => r.fonte + ' (' + fmt(r.visitas) + ')', valor: (r) => num(r.taxa_contacto), texto: (r) => pct(r.taxa_contacto), cor: () => dash.colors[2] });
  });
  dash.draw('t-fontes', (tb) => {
    const g = estado(tb, ['fontes']); if (!g) return;
    if (!g[0].data.length) return semDados(tb);
    tabela(tb, g[0].data, (r) => r.fonte, [
      (r) => r.fonte, (r) => n(fmt(r.visitas)), (r) => n(fmt(r.visitantes)), (r) => n(pct(r.rejeicao)), (r) => n(tempo(r.tempo_medio_s)),
      (r) => n(nf1.format(num(r.paginas_por_visita) || 0)), (r) => n(fmt(r.visitas_com_contacto)), (r) => n(pct(r.taxa_contacto)),
    ]);
  });
  dash.draw('t-campanhas', (tb) => {
    const g = estado(tb, ['campanhas']); if (!g) return;
    if (!g[0].data.length) return semDados(tb, 'Ainda sem visitas de campanhas ou anúncios neste período.');
    tabela(tb, g[0].data, (r) => r.chave, [
      (r) => tx(r.campanha), (r) => r.origem, (r) => r.meio, (r) => tx(r.conteudo), (r) => ({ meta: 'Meta', google: 'Google', tiktok: 'TikTok' }[r.clique_anuncio] || '—'),
      (r) => n(fmt(r.visitas)), (r) => n(pct(r.rejeicao)), (r) => n(tempo(r.tempo_medio_s)), (r) => n(fmt(r.visitas_com_contacto)), (r) => n(pct(r.taxa_contacto)),
    ]);
  });
  dash.draw('t-referencias', (tb) => {
    const g = estado(tb, ['referencias']); if (!g) return;
    if (!g[0].data.length) return semDados(tb);
    tabela(tb, g[0].data, (r) => r.referencia, [(r) => tx(r.referencia), (r) => r.fonte, (r) => n(fmt(r.visitas))]);
  });

  dash.draw('b-paises', (caixa) => {
    const g = estado(caixa, ['paises'], true); if (!g) return;
    if (!g[0].data.length) return semDados(caixa);
    barras(caixa, g[0].data, { rotulo: (r) => bandeira(r.pais) + ' ' + pais(r.pais), valor: (r) => num(r.visitas), texto: (r) => pct(r.pct) });
  });
  dash.draw('b-regioes', (caixa) => {
    const g = estado(caixa, ['regioes'], true); if (!g) return;
    if (!g[0].data.length) return semDados(caixa, 'Sem visitas de Portugal neste período.');
    barras(caixa, g[0].data, { rotulo: (r) => r.regiao, valor: (r) => num(r.visitas), texto: (r) => fmt(r.visitas), cor: () => dash.colors[1] });
  });
  dash.draw('b-tec', (caixa) => {
    const g = estado(caixa, ['tecnologia'], true); if (!g) return;
    const d = caixa.dataset.dim;
    const linhas = g[0].data.filter((r) => r.dimensao === d).slice(0, 8);
    if (!linhas.length) return semDados(caixa);
    const rot = (r) => (d === 'dispositivo' ? APARELHO[r.valor] || r.valor : d === 'idioma' ? (r.valor === '?' ? 'Desconhecido' : r.valor.toUpperCase()) : r.valor);
    barras(caixa, linhas, { rotulo: rot, valor: (r) => num(r.visitas), texto: (r) => pct(r.pct), cor: () => dash.colors[1] });
  });

  dash.draw('horas', (caixa) => {
    const g = estado(caixa, ['horas'], true); if (!g) return;
    const linhas = g[0].data;
    if (!linhas.length) return semDados(caixa);
    const mapa = new Map(linhas.map((r) => [num(r.dia_semana) + '-' + num(r.hora), num(r.visitas)]));
    const max = d3.max(linhas, (r) => num(r.visitas)) || 1;
    const grelha = el('div', 'ds-horas');
    grelha.append(el('span'));
    for (let h = 0; h < 24; h++) grelha.append(el('span', 'ds-hlab', h % 6 === 0 ? h + 'h' : ''));
    const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
    const tip = dica(caixa);
    DIAS.forEach((nome, i) => {
      grelha.append(el('span', null, nome));
      for (let h = 0; h < 24; h++) {
        const v = mapa.get((i + 1) + '-' + h) || 0;
        const c = el('span', 'ds-cel'); const b = el('b');
        b.style.background = dash.colors[0]; b.style.opacity = v ? String(0.18 + 0.82 * v / max) : '0.05';
        c.append(b);
        const mostrar = (ev) => { const r = caixa.getBoundingClientRect(); tip.mostrar(ev.clientX - r.left, ev.clientY - r.top, nome + ', ' + h + 'h', fmt(v) + ' visitas'); };
        c.addEventListener('pointerenter', mostrar); c.addEventListener('click', mostrar); c.addEventListener('pointerleave', () => tip.esconder());
        grelha.append(c);
      }
    });
    caixa.replaceChildren(grelha, caixa.querySelector('.ds-tip') || el('span'));
  });

  dash.draw('f-pagina', (sel) => {
    const g = dash.data('paginas');
    const opcoes = [new Option('A página mais vista', '')];
    const todos = !dash.params().site || dash.params().site === 'todos';
    if (g.status === 'ok') g.data.slice(0, 80).forEach((r) => opcoes.push(new Option((todos ? nomeSite(r.site) + ' · ' : '') + r.caminho + ' (' + fmt(r.vistas) + ')', r.site + '|' + r.caminho)));
    sel.replaceChildren(...opcoes);
    sel.value = dash.params().pagina || '';
    if (sel.value !== (dash.params().pagina || '')) { const o = new Option(dash.params().pagina, dash.params().pagina); sel.append(o); sel.value = dash.params().pagina; }
    sel.onchange = () => dash.setParams({ pagina: sel.value || null });
  });
  dash.draw('pagina-atual', (e) => {
    const g = estado(e, ['scroll']); if (!g) return;
    const p = (g[0].data[0] || {}).pagina;
    if (!p) { e.textContent = 'nenhuma página com visitas neste período'; return; }
    const [s, c] = p.split('|'); e.textContent = nomeSite(s) + ' · ' + c;
  });
  dash.draw('leg-cor', (e) => { e.style.background = dash.colors[0]; });

  dash.draw('mapa', (caixa) => {
    const g = estado(caixa, ['mapa', 'scroll'], true); if (!g) return;
    const cliques = g[0].data; const sc = g[1].data;
    caixa.replaceChildren();
    if (!cliques.length) return semDados(caixa, 'Ainda sem cliques nesta página com este aparelho.');
    const alt = d3.median(cliques, (r) => num(r.altura_pagina)) || 3000;
    const jan = d3.median(cliques, (r) => num(r.janela_l)) || 390;
    const W = Math.round(Math.min(Math.max(caixa.clientWidth || 360, 280), jan > 700 ? 900 : 420));
    const H = Math.max(240, Math.round(alt * W / jan));
    const pts = cliques.map((r) => {
      const a = num(r.altura_pagina) || alt;
      return { x: Math.max(0, Math.min(1, (num(r.x) || 0) / 1000)) * W, y: Math.max(0, Math.min(1, (num(r.y) || 0) / a)) * H, r };
    });
    const svg = d3.select(caixa).append('svg').attr('width', W).attr('height', H).attr('viewBox', `0 0 ${W} ${H}`).style('max-width', '100%').style('height', 'auto').attr('role', 'img').attr('aria-label', 'Mapa de cliques da página');
    svg.append('rect').attr('width', W).attr('height', H).attr('fill', 'var(--color-panel)');
    // densidade (zonas quentes)
    try {
      const dens = d3.contourDensity().x((p) => p.x).y((p) => p.y).size([W, H]).bandwidth(Math.max(10, W / 28)).thresholds(10)(pts);
      const maxv = d3.max(dens, (c) => c.value) || 1;
      const contorno = (mp) => mp.coordinates.map((pol) => pol.map((anel) => 'M' + anel.map((q) => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join('L') + 'Z').join('')).join('');
      svg.append('g').selectAll('path').data(dens).join('path').attr('d', contorno)
        .attr('fill', 'var(--cds-chart-status-critical)').attr('fill-opacity', (c) => 0.04 + 0.22 * c.value / maxv);
    } catch (e) { /* sem zonas quentes se houver poucos pontos */ }
    // linhas de quantas pessoas chegaram a cada altura
    sc.filter((r) => [20, 40, 60, 80, 100].includes(num(r.nivel))).forEach((r) => {
      const yy = Math.min(H - 1, H * num(r.nivel) / 100);
      svg.append('line').attr('x1', 0).attr('x2', W).attr('y1', yy).attr('y2', yy).attr('stroke', 'var(--cds-chart-reference)').attr('stroke-dasharray', '4 4');
      svg.append('text').attr('class', 'ds-tick').attr('x', W - 6).attr('y', yy - 5).attr('text-anchor', 'end').text(pct(r.pct) + ' chegaram aqui');
    });
    svg.append('g').selectAll('circle').data(pts).join('circle')
      .attr('cx', (p) => p.x).attr('cy', (p) => p.y).attr('r', 4)
      .attr('fill', (p) => (p.r.raiva ? 'var(--cds-chart-status-critical)' : p.r.interativo ? dash.colors[0] : 'none'))
      .attr('fill-opacity', 0.55)
      .attr('stroke', (p) => (p.r.interativo || p.r.raiva ? 'none' : 'var(--color-fg-muted)')).attr('stroke-width', 1.5);
    const tip = dica(caixa);
    const delaunay = d3.Delaunay.from(pts, (p) => p.x, (p) => p.y);
    const mostrar = (ev) => {
      const [mx, my] = d3.pointer(ev, svg.node());
      const i = delaunay.find(mx, my); if (i < 0) return;
      const p = pts[i];
      const [cx, cy] = d3.pointer(ev, caixa);
      tip.mostrar(cx, cy, p.r.raiva ? 'Clique de raiva' : p.r.interativo ? 'Clique' : 'Não é clicável', String(p.r.elemento || '—').slice(0, 60));
    };
    svg.on('pointermove', mostrar).on('click', mostrar).on('pointerleave', () => tip.esconder());
  });

  dash.draw('scroll', (caixa) => {
    const g = estado(caixa, ['scroll'], true); if (!g) return;
    const linhas = g[0].data;
    if (!linhas.length || !num(linhas[0].vistas)) return semDados(caixa);
    barras(caixa, linhas, {
      rotulo: (r) => 'Chegaram a ' + num(r.nivel) + ' %', valor: (r) => num(r.pct), texto: (r) => pct(r.pct),
      cor: (r) => (num(r.pct) < 30 ? 'var(--cds-chart-status-critical)' : dash.colors[0]),
    });
  });

  dash.draw('t-elementos', (tb) => {
    const g = estado(tb, ['elementos']); if (!g) return;
    if (!g[0].data.length) return semDados(tb, 'Ainda sem cliques nesta página com este aparelho.');
    tabela(tb, g[0].data, (r) => r.chave, [
      (r) => tx(r.elemento), (r) => tx(r.texto), (r) => n(fmt(r.cliques)), (r) => n(fmt(r.visitas)), (r) => n(pct(r.pct_visitas)),
      (r) => (r.interativo ? 'Sim' : { t: 'Não', c: 'ds-mau' }), (r) => n(fmt(r.raiva)), (r) => tx(r.href),
    ]);
  });

  dash.draw('b-acoes', (caixa) => {
    const g = estado(caixa, ['acoes'], true); if (!g) return;
    if (!g[0].data.length) return semDados(caixa, 'Ainda sem ações neste período.');
    barras(caixa, g[0].data, {
      rotulo: (r) => (ACAO[r.nome] || r.nome) + (r.contacto ? ' ★' : ''), valor: (r) => num(r.n), texto: (r) => fmt(r.n),
      cor: (r) => (r.contacto ? dash.colors[2] : dash.colors[1]),
    });
  });
  dash.draw('t-acoes', (tb) => {
    const g = estado(tb, ['acoes_detalhe']); if (!g) return;
    if (!g[0].data.length) return semDados(tb, 'Ainda sem ações neste período.');
    tabela(tb, g[0].data, (r) => r.chave, [
      (r) => ACAO[r.nome] || r.nome, (r) => tx(r.valor), (r) => nomeSite(r.site), (r) => tx(r.caminho), (r) => n(fmt(r.n)), (r) => quando(r.ultima),
    ]);
  });

  const nota = (v, bom, mau) => (v === null ? '' : v <= bom ? 'n ds-bom' : v <= mau ? 'n ds-medio' : 'n ds-mau');
  dash.draw('t-velocidade', (tb) => {
    const g = estado(tb, ['velocidade']); if (!g) return;
    if (!g[0].data.length) return semDados(tb);
    tabela(tb, g[0].data, (r) => r.chave, [
      (r) => nomeSite(r.site), (r) => APARELHO[r.dispositivo] || r.dispositivo, (r) => n(fmt(r.amostras)),
      (r) => { const v = num(r.lcp_ms); return { t: v === null ? '—' : nf1.format(v / 1000) + ' s', c: nota(v, 2500, 4000) }; },
      (r) => { const v = num(r.cls); return { t: v === null ? '—' : nfC.format(v), c: nota(v, 0.1, 0.25) }; },
      (r) => { const v = num(r.inp_ms); return { t: v === null ? '—' : fmt(v) + ' ms', c: nota(v, 200, 500) }; },
      (r) => { const v = num(r.ttfb_ms); return { t: v === null ? '—' : fmt(v) + ' ms', c: nota(v, 800, 1800) }; },
    ]);
  });
  dash.draw('t-erros', (tb) => {
    const g = estado(tb, ['erros']); if (!g) return;
    if (!g[0].data.length) return semDados(tb, 'Sem erros neste período.');
    tabela(tb, g[0].data, (r) => r.chave, [
      (r) => tx(r.mensagem), (r) => tx(r.ficheiro), (r) => n(r.linha === null ? '—' : String(r.linha)), (r) => r.sites, (r) => n(fmt(r.n)),
      (r) => n(fmt(r.visitas)), (r) => tx(r.navegadores), (r) => tx(r.caminho), (r) => quando(r.ultima),
    ]);
  });
  dash.draw('t-recolha', (tb) => {
    const g = estado(tb, ['recolha']); if (!g) return;
    if (!g[0].data.length) return semDados(tb, 'Nenhum pedido recusado nos últimos 7 dias.');
    tabela(tb, g[0].data, (r) => r.chave, [
      (r) => dia(r.dia), (r) => (r.motivo === 'chave' ? { t: MOTIVO.chave, c: 'ds-mau' } : MOTIVO[r.motivo] || r.motivo), (r) => n(fmt(r.n)), (r) => quando(r.ultimo),
    ]);
  });
})();
