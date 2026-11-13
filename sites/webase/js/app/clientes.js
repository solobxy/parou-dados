// webase — clientes: lista, pesquisa, importar/exportar, ficha com cronologia e ações rápidas.
import { estado, h, icone, get, post, euros, num, relativo, data, dataIso, ligacao, navegar, campo, opcao, formFolha, folha,
  aviso, falhou, confirmar, pode, podeX, ligado, avatar, vazio, carregando, debounce, descarregar, estadoTxt, aGuardar, iniciais,
  dataHora, minutos, telefone } from './nucleo.js';
import { botaoLigar, formatarNumero } from './ligar.js';

const TIPOS_ATIV = { nota: 'nota', chamada: 'chamadas', contrato: 'contratos', pontos: 'pontos', adesao: 'adesoes', uso: 'adesoes',
  lead: 'leads', ganho: 'ganho', perdido: 'fechar', criado: 'mais', editado: 'editar', consentimento: 'certo' };

function camposPersonalizados(valores = {}) {
  const defs = estado.eu.conta.campos || [];
  return defs.map((f) => {
    const nome = 'x_' + f.id;
    const v = valores[f.id];
    if (f.tipo === 'escolha') return campo({ nome, rotulo: f.nome, tipo: 'select', valor: v ?? '', opcoes: [['', '—'], ...f.opcoes.map((o) => [o, o])] });
    if (f.tipo === 'sim_nao') return h('div', { class: 'campo', dados: { campo: f.id } }, opcao({ nome, rotulo: f.nome, marcado: v === true }));
    if (f.tipo === 'data') return campo({ nome, rotulo: f.nome, tipo: 'date', valor: v ?? '' });
    if (f.tipo === 'numero') return campo({ nome, rotulo: f.nome, tipo: 'text', inputmode: 'decimal', valor: v ?? '' });
    return campo({ nome, rotulo: f.nome, valor: v ?? '' });
  });
}

function juntarExtra(d) {
  const extra = {};
  for (const f of estado.eu.conta.campos || []) {
    const k = 'x_' + f.id;
    if (k in d) { extra[f.id] = f.tipo === 'sim_nao' ? d[k] : d[k]; delete d[k]; }
  }
  d.extra = extra;
  return d;
}

function camposCliente(c = {}, equipa = []) {
  const so = estado.eu.perm.ambito === 'meus';
  return [
    h('div', { class: 'duas' },
      campo({ nome: 'nome', rotulo: 'Nome', valor: c.nome, obrig: true, autocomplete: 'off' }),
      campo({ nome: 'tipo', rotulo: 'Tipo', tipo: 'select', valor: c.tipo || 'particular', opcoes: [['particular', 'Particular'], ['empresa', 'Empresa']] })),
    h('div', { class: 'duas' },
      campo({ nome: 'telefone', rotulo: 'Telefone', tipo: 'tel', valor: c.telefone, inputmode: 'tel', autocomplete: 'off' }),
      campo({ nome: 'email', rotulo: 'E-mail', tipo: 'email', valor: c.email, inputmode: 'email', autocomplete: 'off' })),
    h('div', { class: 'duas' },
      campo({ nome: 'empresa', rotulo: 'Empresa', valor: c.empresa }),
      campo({ nome: 'nif', rotulo: 'NIF', valor: c.nif, inputmode: 'numeric' })),
    h('div', { class: 'duas' },
      campo({ nome: 'nascimento', rotulo: 'Data de nascimento', tipo: 'date', valor: c.nascimento, ajuda: 'Aparece no início no dia dos anos.' }),
      campo({ nome: 'etiquetas', rotulo: 'Etiquetas', valor: (c.etiquetas || []).join(', '), ajuda: 'Separadas por vírgulas (ex.: vip, fade).' })),
    campo({ nome: 'morada', rotulo: 'Morada', valor: c.morada, autocomplete: 'off' }),
    h('div', { class: 'duas' },
      campo({ nome: 'localidade', rotulo: 'Localidade', valor: c.localidade }),
      campo({ nome: 'codpostal', rotulo: 'Código postal', valor: c.codpostal, placeholder: '4420-155' })),
    ...camposPersonalizados(c.extra || {}),
    !so && equipa.length > 1 ? campo({ nome: 'responsavel', rotulo: 'Responsável', tipo: 'select', valor: c.responsavel ?? estado.eu.id,
      opcoes: equipa.filter((p) => p.ativo).map((p) => [p.id, p.nome]) }) : null,
    campo({ nome: 'notas', rotulo: 'Notas', tipo: 'textarea', valor: c.notas, linhas: 3 }),
    h('div', { class: 'campo', dados: { campo: 'consentimento' } },
      opcao({ nome: 'consentimento', rotulo: 'Deu consentimento para receber comunicações de marketing', marcado: !!c.consentimento }),
      campo({ nome: 'consentimento_como', rotulo: 'Como foi dado (opcional)', valor: c.consentimento_como, placeholder: 'Ex.: formulário ao balcão, 12/03/2026' })),
  ];
}

let equipaCache = null;
async function equipa() {
  if (!equipaCache) { try { equipaCache = (await get('/api/equipa')).equipa; } catch { equipaCache = []; } }
  return equipaCache;
}

export async function novoCliente({ depois } = {}) {
  const eq = await equipa();
  let forcar = false;
  formFolha({ titulo: 'Novo cliente', campos: camposCliente({}, eq), botao: 'Criar ficha', larga: true,
    enviar: async (d, form, f) => {
      d = juntarExtra(d);
      if (d.responsavel) d.responsavel = Number(d.responsavel);
      if (forcar) d.forcar = true;
      try {
        const r = await post('/api/clientes', d);
        f.fechar();
        aviso('Ficha criada: ' + r.cliente.nome, { carimbo: true });
        window.estat?.('cliente', 'criado');
        if (depois) depois(r.cliente); else navegar('/app/clientes/' + r.cliente.id);
      } catch (e) {
        if (e.estado === 409 && e.dados.duplicado) {
          forcar = true;
          e.message += ' Carrega outra vez em «Criar ficha» para criar mesmo assim.';
        }
        throw e;
      }
    } });
}

async function editarCliente(c, aoGuardar) {
  const eq = await equipa();
  let forcar = false;
  formFolha({ titulo: 'Editar ficha', campos: camposCliente(c, eq), larga: true,
    enviar: async (d, form, f) => {
      d = juntarExtra(d);
      if (d.responsavel) d.responsavel = Number(d.responsavel);
      if (forcar) d.forcar = true;
      try {
        const r = await post('/api/clientes/' + c.id, d);
        f.fechar(); aviso('Ficha guardada.'); aoGuardar(r.cliente);
      } catch (e) {
        if (e.estado === 409 && e.dados.duplicado) { forcar = true; e.message += ' Carrega outra vez em «Guardar» para guardar mesmo assim.'; }
        throw e;
      }
    } });
}

// ---------------------------------------------------------------- importar

function importar(aoAcabar) {
  let texto = '';
  let mapa = {};
  let previa = null;
  const zona = h('div', { class: 'grelha' });
  const inpF = h('input', { type: 'file', accept: '.csv,text/csv,.txt', id: 'fich-imp' });
  const bOk = h('button', { class: 'bt bt-p', type: 'button', disabled: true }, 'Importar');
  const bNao = h('button', { class: 'bt', type: 'button' }, 'Cancelar');
  const etq = campo({ nome: 'etiqueta', rotulo: 'Etiqueta para todos (opcional)', placeholder: 'Ex.: lista antiga' });
  const nomesCampos = { nome: 'Nome', email: 'E-mail', telefone: 'Telefone', nif: 'NIF', empresa: 'Empresa', morada: 'Morada', localidade: 'Localidade',
    codpostal: 'Código postal', nascimento: 'Nascimento', etiquetas: 'Etiquetas', notas: 'Notas', tipo: 'Tipo' };
  const desenhar = () => {
    if (!previa) {
      zona.replaceChildren(
        h('p', null, 'Escolhe um ficheiro CSV (no Excel: Ficheiro → Guardar como → CSV). A primeira linha tem de ter os títulos das colunas.'),
        h('div', { class: 'campo' }, h('label', { for: 'fich-imp' }, 'Ficheiro'), inpF),
        h('p', { class: 'nota-suave' }, 'Contactos com o mesmo e-mail ou telefone de um cliente que já tens não são duplicados.'));
      return;
    }
    zona.replaceChildren(
      h('p', null, h('strong', null, num(previa.total)), ' contactos no ficheiro. Confirma a que corresponde cada coluna:'),
      h('div', { class: 'grelha', style: 'gap:10px' }, previa.colunas.map((col, i) => h('div', { class: 'duas', style: 'align-items:center;gap:10px' },
        h('span', { style: 'font-weight:600;overflow-wrap:anywhere' }, col || `Coluna ${i + 1}`),
        h('select', { class: 'entrada', 'aria-label': 'Campo para a coluna ' + col, onchange: (e) => { if (e.target.value) mapa[i] = e.target.value; else delete mapa[i]; } },
          h('option', { value: '' }, 'Não importar'),
          previa.campos.map((k) => h('option', { value: k, selected: mapa[i] === k }, nomesCampos[k] || k)))))),
      etq,
      previa.exemplo?.length ? h('div', null, h('p', { class: 'rotulo' }, 'Primeiros contactos'),
        h('div', { class: 'lista' }, previa.exemplo.filter(Boolean).map((c) => h('div', { class: 'linha', style: 'min-height:44px' },
          h('span', { class: 'principal-l' }, h('span', { class: 't' }, c.nome), h('span', { class: 's' }, [telefone(c.telefone), c.email, c.localidade].filter(Boolean).join(' · '))))))) : null);
    bOk.disabled = false;
  };
  inpF.addEventListener('change', async () => {
    const f = inpF.files[0];
    if (!f) return;
    if (f.size > 3 * 1024 * 1024) return aviso('O ficheiro tem mais de 3 MB. Divide-o em partes.', { erro: true });
    const buf = await f.arrayBuffer();
    try { texto = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { texto = new TextDecoder('windows-1252').decode(buf); }
    try {
      previa = await post('/api/clientes/importar', { csv: texto, previa: true });
      mapa = { ...previa.mapa };
      desenhar();
    } catch (e) { falhou(e); }
  });
  bOk.addEventListener('click', async () => {
    try {
      const r = await aGuardar(bOk, () => post('/api/clientes/importar', { csv: texto, mapa, etiqueta: etq.querySelector('input').value }), 'A importar…');
      d.fechar();
      aviso(`${num(r.criados)} clientes importados` + (r.repetidos ? ` · ${num(r.repetidos)} já existiam` : ''), { carimbo: true });
      aoAcabar?.();
    } catch (e) { falhou(e); }
  });
  const d = folha({ titulo: 'Importar contactos', corpo: zona, pe: [bNao, bOk], larga: true });
  bNao.addEventListener('click', () => d.fechar());
  desenhar();
}

// ---------------------------------------------------------------- lista

async function lista(raiz) {
  const params = new URLSearchParams(location.search);
  const filtros = { q: params.get('q') || '', etiqueta: params.get('etiqueta') || '', tipo: '', ordem: '', pagina: 1 };
  const corpo = h('div', null, carregando());
  const contador = h('span', { class: 'sub' });
  const selEtq = h('select', { class: 'entrada', style: 'width:auto;min-width:150px', 'aria-label': 'Filtrar por etiqueta' });
  const carregar = async () => {
    const qs = new URLSearchParams(Object.entries(filtros).filter(([, v]) => v));
    let r;
    try { r = await get('/api/clientes?' + qs); } catch (e) { corpo.replaceChildren(h('p', null, e.message)); return; }
    contador.textContent = `${num(r.total)} ${r.total === 1 ? 'cliente' : 'clientes'}`;
    selEtq.replaceChildren(h('option', { value: '' }, 'Todas as etiquetas'), r.etiquetas.map((e) => h('option', { value: e, selected: e === filtros.etiqueta }, e)));
    if (!r.itens.length) {
      corpo.replaceChildren(filtros.q || filtros.etiqueta || filtros.tipo
        ? h('p', { style: 'padding:24px 4px;color:var(--tinta2)' }, 'Nenhum cliente com estes filtros.')
        : vazio({ titulo: 'Ainda não tens clientes', texto: 'Cria a primeira ficha ou importa a lista que já tens.', icone: 'clientes',
          acao: pode('clientes', 'c') ? h('button', { class: 'bt bt-p', type: 'button', onclick: () => novoCliente() }, 'Criar ficha') : null }));
      return;
    }
    const usaPontos = ligado('pontos');
    const tabela = h('table', { class: 'tabela so-pc' },
      h('thead', null, h('tr', null, h('th', null, 'Nome'), h('th', null, 'Contacto'), h('th', null, 'Etiquetas'),
        usaPontos ? h('th', { class: 'num' }, 'Pontos') : null, h('th', { class: 'num' }, 'Gasto'), h('th', null, 'Responsável'), h('th', null, 'Atualizado'))),
      h('tbody', null, r.itens.map((c) => h('tr', { onclick: (e) => { if (e.target.closest('a')) return; navegar('/app/clientes/' + c.id); } },
        h('td', null, h('div', { style: 'display:flex;align-items:center;gap:10px' }, avatar(c.nome, c.tipo === 'empresa'),
          h('div', null, ligacao('/app/clientes/' + c.id, { class: 't' }, c.nome), c.empresa && c.tipo !== 'empresa' ? h('div', { class: 'ajuda', style: 'font-size:13px;color:var(--tinta2)' }, c.empresa) : null))),
        h('td', null, h('div', null, telefone(c.telefone)), h('div', { style: 'font-size:13px;color:var(--tinta2)' }, c.email || '')),
        h('td', null, c.etiquetas.slice(0, 3).map((e) => h('span', { class: 'etiqueta' }, e))),
        usaPontos ? h('td', { class: 'num' }, num(c.pontos)) : null,
        h('td', { class: 'num' }, euros(c.gasto)),
        h('td', null, c.responsavel_nome),
        h('td', { style: 'color:var(--tinta2);white-space:nowrap' }, relativo(c.atualizado))))));
    const cartoes = h('div', { class: 'lista so-tel' }, r.itens.map((c) => ligacao('/app/clientes/' + c.id, { class: 'linha' },
      avatar(c.nome, c.tipo === 'empresa'),
      h('span', { class: 'principal-l' }, h('span', { class: 't' }, c.nome), h('span', { class: 's' }, [telefone(c.telefone), c.email, c.localidade].filter(Boolean).join(' · ') || '—')),
      usaPontos && c.pontos ? h('span', { class: 'lado-d' }, h('strong', null, num(c.pontos)), 'pontos') : null)));
    const paginas = Math.ceil(r.total / r.por_pagina);
    const pag = paginas > 1 ? h('div', { class: 'paginacao' },
      h('button', { class: 'bt bt-pq', type: 'button', disabled: filtros.pagina <= 1, onclick: () => { filtros.pagina--; carregar(); } }, 'Anterior'),
      h('span', null, `Página ${filtros.pagina} de ${paginas}`),
      h('button', { class: 'bt bt-pq', type: 'button', disabled: filtros.pagina >= paginas, onclick: () => { filtros.pagina++; carregar(); } }, 'Seguinte')) : null;
    corpo.replaceChildren(h('div', { class: 'ficha', style: 'padding:8px 12px' }, tabela, cartoes, pag));
  };
  const inpQ = h('input', { class: 'entrada', type: 'search', placeholder: 'Procurar por nome, telefone, e-mail, NIF…', 'aria-label': 'Procurar clientes', value: filtros.q });
  inpQ.addEventListener('input', debounce(() => { filtros.q = inpQ.value.trim(); filtros.pagina = 1; carregar(); }, 250));
  selEtq.addEventListener('change', () => { filtros.etiqueta = selEtq.value; filtros.pagina = 1; carregar(); });
  const selTipo = h('select', { class: 'entrada', style: 'width:auto', 'aria-label': 'Tipo de cliente', onchange: (e) => { filtros.tipo = e.target.value; filtros.pagina = 1; carregar(); } },
    h('option', { value: '' }, 'Todos'), h('option', { value: 'particular' }, 'Particulares'), h('option', { value: 'empresa' }, 'Empresas'));
  const selOrdem = h('select', { class: 'entrada', style: 'width:auto', 'aria-label': 'Ordenar', onchange: (e) => { filtros.ordem = e.target.value; carregar(); } },
    h('option', { value: '' }, 'Mais recentes'), h('option', { value: 'nome' }, 'Nome'), ligado('pontos') ? h('option', { value: 'pontos' }, 'Mais pontos') : null,
    h('option', { value: 'gasto' }, 'Mais gasto'), h('option', { value: 'visita' }, 'Última visita'));
  const acoes = [];
  if (podeX('importar') && pode('clientes', 'c')) acoes.push(h('button', { class: 'bt', type: 'button', onclick: () => importar(carregar) }, icone('enviar'), 'Importar'));
  if (podeX('exportar')) acoes.push(h('button', { class: 'bt', type: 'button', onclick: () => descarregar('/api/exportar/clientes.csv').catch(falhou) }, icone('descarregar'), 'Exportar'));
  if (pode('clientes', 'c')) acoes.push(h('button', { class: 'bt bt-p', type: 'button', onclick: () => novoCliente() }, icone('mais'), 'Novo cliente'));
  raiz.replaceChildren(
    h('header', { class: 'cabeca' }, h('div', null, h('h1', null, 'Clientes'), contador), h('div', { class: 'acoes' }, acoes)),
    h('div', { class: 'barra-filtros' }, h('div', { class: 'pesquisa' }, icone('procurar'), inpQ), selEtq, selTipo, selOrdem),
    corpo);
  await carregar();
  if (params.get('importar') && podeX('importar')) importar(carregar);
}

// ---------------------------------------------------------------- ficha

async function ficha(raiz, id) {
  const r = await get('/api/clientes/' + id);
  const c = r.cliente;
  const recarregar = () => ficha(raiz, id);
  const acoes = [];
  if (c.telefone) acoes.push(botaoLigar({ numero: c.telefone, nome: c.nome, cliente: c.id, depois: recarregar, aoLigar: () => window.estat?.('ficha', 'ligar') }));
  if (c.email) acoes.push(h('a', { class: 'bt', href: 'mailto:' + c.email }, icone('email'), 'E-mail'));
  if (pode('pontos', 'c')) acoes.push(h('button', { class: 'bt', type: 'button', onclick: async () => (await import('./pontos.js')).darPontos({ cliente: c, depois: recarregar }) }, icone('pontos'), 'Dar pontos'));
  if (pode('adesoes', 'c')) acoes.push(h('button', { class: 'bt', type: 'button', onclick: async () => (await import('./adesoes.js')).venderAdesao({ cliente: c, depois: recarregar }) }, icone('pacote'), 'Vender pacote'));
  if (pode('chamadas', 'c')) acoes.push(h('button', { class: 'bt', type: 'button', onclick: async () => (await import('./chamadas.js')).registarChamada({ cliente: c, depois: recarregar }) }, icone('chamadas'), 'Registar chamada'));
  if (pode('leads', 'c')) acoes.push(h('button', { class: 'bt', type: 'button', onclick: async () => (await import('./leads.js')).novaLead({ cliente: c, depois: recarregar }) }, icone('leads'), 'Nova lead'));
  if (pode('contratos', 'c')) acoes.push(h('button', { class: 'bt', type: 'button', onclick: async () => (await import('./contratos.js')).novoContrato({ cliente: c, depois: recarregar }) }, icone('contratos'), 'Novo contrato'));

  const menu = [];
  if (pode('clientes', 'e')) menu.push(h('button', { class: 'bt', type: 'button', onclick: () => editarCliente(c, recarregar) }, icone('editar'), 'Editar'));
  const extras = [];
  if (podeX('exportar')) extras.push(h('button', { class: 'nav-item', type: 'button', style: 'border:0;background:none;width:100%',
    onclick: () => { dm.fechar(); descarregar('/api/clientes/' + c.id + '/dados').catch(falhou); } }, icone('descarregar'),
    h('span', null, 'Descarregar os dados desta pessoa', h('br'), h('small', { style: 'color:var(--tinta2);font-weight:400' }, 'Para responder a um pedido de acesso (RGPD)'))));
  if (pode('clientes', 'a')) extras.push(h('button', { class: 'nav-item', type: 'button', style: 'border:0;background:none;width:100%;color:var(--vermelho)', onclick: async () => {
    dm.fechar();
    if (!await confirmar({ titulo: 'Apagar ' + c.nome + '?', texto: 'Apaga a ficha e tudo o que está ligado a ela (pontos, pacotes, contratos e cronologia). Não dá para desfazer.', sim: 'Apagar', perigo: true })) return;
    try { await post('/api/clientes/' + c.id + '/apagar'); aviso('Ficha apagada.'); navegar('/app/clientes', true); } catch (e) { falhou(e); }
  } }, icone('lixo'), h('span', null, 'Apagar ficha')));
  let dm = null;
  if (extras.length) menu.push(h('button', { class: 'bt bt-icone', type: 'button', 'aria-label': 'Mais opções', 'aria-haspopup': 'dialog',
    onclick: () => { dm = folha({ titulo: c.nome, corpo: h('div', { class: 'grelha', style: 'gap:2px' }, extras) }); } }, icone('pontinhos')));

  const defs = estado.eu.conta.campos || [];
  const dado = (rot, val) => val ? h('div', { class: 'dado' }, h('dt', null, rot), h('dd', null, val)) : null;
  const dados = h('dl', { class: 'dados' },
    dado('Telefone', c.telefone ? botaoLigar({ numero: c.telefone, nome: c.nome, cliente: c.id, depois: recarregar, classe: 'ligar-texto', texto: formatarNumero(c.telefone), semIcone: true }) : null),
    dado('E-mail', c.email ? h('a', { href: 'mailto:' + c.email }, c.email) : null),
    dado('Empresa', c.tipo !== 'empresa' ? c.empresa : null),
    dado('NIF', c.nif),
    dado('Morada', [c.morada, [c.codpostal, c.localidade].filter(Boolean).join(' ')].filter(Boolean).join(', ')),
    dado('Nascimento', c.nascimento ? dataIso(c.nascimento) : null),
    ...defs.map((f) => { const v = c.extra?.[f.id]; return dado(f.nome, v === true ? 'Sim' : v === false ? null : f.tipo === 'data' ? dataIso(v) : (v ?? '') === '' ? null : String(v)); }),
    dado('Etiquetas', c.etiquetas.length ? h('span', null, c.etiquetas.map((e) => ligacao('/app/clientes?etiqueta=' + encodeURIComponent(e), { class: 'etiqueta', style: 'text-decoration:none' }, e))) : null),
    dado('Responsável', c.responsavel_nome),
    dado('Origem', c.origem),
    dado('Marketing', c.consentimento ? `Consentiu em ${data(c.consentimento_quando)}${c.consentimento_como ? ' · ' + c.consentimento_como : ''}` : 'Sem consentimento'),
    dado('Cliente desde', data(c.criado)),
    c.notas ? h('div', { class: 'dado' }, h('dt', null, 'Notas'), h('dd', { class: 'texto-longo', style: 'font-size:15px' }, c.notas)) : null);

  const nota = h('form', { class: 'grelha', style: 'gap:8px' },
    h('label', { for: 'nota-txt', class: 'rotulo' }, 'Escrever uma nota'),
    h('textarea', { id: 'nota-txt', class: 'entrada', rows: 2, placeholder: 'Ex.: prefere marcações ao fim da tarde', maxlength: 2000 }),
    h('div', null, h('button', { class: 'bt bt-pq', type: 'submit' }, 'Guardar nota')));
  nota.addEventListener('submit', async (e) => {
    e.preventDefault();
    const t = nota.querySelector('textarea');
    if (!t.value.trim()) return t.focus();
    try { await aGuardar(nota.querySelector('button'), () => post('/api/clientes/' + c.id + '/nota', { texto: t.value })); aviso('Nota guardada.'); recarregar(); } catch (er) { falhou(er); }
  });

  const cronologia = h('div', { class: 'cronologia' }, r.atividade.length ? r.atividade.map((a) => h('div', { class: 'evento' },
    h('span', { class: 'ponto' + (['ganho', 'pontos', 'adesao'].includes(a.tipo) ? ' acento' : '') }, icone(TIPOS_ATIV[a.tipo] || 'nota')),
    h('div', null, h('div', { class: 'txt' }, a.texto), h('div', { class: 'quando' }, relativo(a.quando) + (a.quem ? ' · ' + a.quem : ''))))) : h('p', { style: 'color:var(--tinta2)' }, 'Ainda sem movimentos.'));

  const blocos = [];
  if (r.pontos) blocos.push(h('section', { class: 'ficha' }, h('header', null, h('h2', null, 'Pontos')),
    h('div', { class: 'saldo' }, h('span', { class: 'n' }, num(c.pontos)), h('span', { style: 'color:var(--tinta2)' }, 'pontos', h('br'), `Gastou ${euros(c.gasto)} no total`)),
    c.ultima_visita ? h('p', { style: 'color:var(--tinta2);font-size:13.5px;margin-top:8px' }, 'Última visita ' + relativo(c.ultima_visita)) : null));
  if (r.adesoes && r.adesoes.length) blocos.push(h('section', { class: 'ficha' }, h('header', null, h('h2', null, 'Subscrições e pacotes'), ligacao('/app/subscricoes', { class: 'ligacao' }, 'Ver todas')),
    h('div', { class: 'lista' }, r.adesoes.map((a) => {
      // ao balcão, o uso do pacote marca-se aqui mesmo, sem sair da ficha
      const acao = (caminho, msg) => async (ev) => {
        try { await aGuardar(ev.currentTarget, () => post(caminho, {}), '…'); aviso(msg, { carimbo: true, icone: 'certo' }); recarregar(); } catch (e) { falhou(e); }
      };
      const ativa = ['ativa', 'em_atraso'].includes(a.estado);
      const fim = ['em_atraso', 'esgotado', 'expirada'].includes(a.estado);
      return h('div', { class: 'linha com-acoes' },
        h('span', { class: 'principal-l' }, h('span', { class: 't' }, a.produto_nome),
          h('span', { class: 's' }, a.tipo === 'pacote' ? `Faltam ${a.usos} de ${a.usos_total}` : `Próximo pagamento ${data(a.proxima)}`)),
        estadoAdesao(a),
        h('span', { class: 'acoes-l' },
          pode('adesoes', 'c') && ativa ? h('button', { class: 'bt bt-pq', type: 'button', onclick: acao('/api/adesoes/' + a.id + '/usar', a.tipo === 'pacote' ? 'Uso registado.' : 'Visita registada.') }, a.tipo === 'pacote' ? 'Usar' : 'Visita') : null,
          pode('adesoes', 'e') && fim ? h('button', { class: 'bt bt-pq bt-p', type: 'button', onclick: acao('/api/adesoes/' + a.id + '/pagamento', a.tipo === 'pacote' ? 'Pacote renovado.' : 'Pagamento registado.') }, a.tipo === 'pacote' ? 'Renovar' : 'Pago') : null));
    }))));
  if (r.leads && r.leads.length) blocos.push(h('section', { class: 'ficha' }, h('header', null, h('h2', null, 'Oportunidades'), ligacao('/app/leads', { class: 'ligacao' }, 'Ver leads')),
    h('div', { class: 'lista' }, r.leads.map((l) => h('div', { class: 'linha' }, h('span', { class: 'principal-l' }, h('span', { class: 't' }, l.titulo),
      h('span', { class: 's' }, nomeFase(l.fase))), h('strong', null, euros(l.valor)))))));
  if (r.contratos && r.contratos.length) blocos.push(h('section', { class: 'ficha' }, h('header', null, h('h2', null, 'Contratos'), ligacao('/app/contratos', { class: 'ligacao' }, 'Ver contratos')),
    h('div', { class: 'lista' }, r.contratos.map((k) => h('div', { class: 'linha' }, h('span', { class: 'principal-l' }, h('span', { class: 't' }, k.titulo),
      h('span', { class: 's' }, `${dataIso(k.inicio)}${k.fim ? ' – ' + dataIso(k.fim) : ''} · ${euros(k.valor)}`)),
      k.a_terminar ? h('span', { class: 'estado atencao' }, 'A terminar') : h('span', { class: 'estado ' + (k.estado === 'ativo' ? 'ok' : 'neutro') }, k.estado))))));
  if (r.chamadas && r.chamadas.length) blocos.push(h('section', { class: 'ficha' }, h('header', null, h('h2', null, 'Chamadas')),
    h('div', { class: 'lista' }, r.chamadas.slice(0, 8).map((x) => h('div', { class: 'linha' },
      h('span', { class: 'icone-linha' }, icone(x.direcao === 'entrada' ? 'entra' : 'sai_')),
      h('span', { class: 'principal-l' }, h('span', { class: 't' }, x.direcao === 'entrada' ? 'Recebida' : 'Feita'),
        h('span', { class: 's' }, [dataHora(x.quando), x.duracao ? minutos(x.duracao) : '', x.quem].filter(Boolean).join(' · '))))))));

  raiz.replaceChildren(
    ligacao('/app/clientes', { class: 'voltar' }, icone('voltar'), 'Clientes'),
    h('header', { class: 'cabeca' },
      h('div', { class: 'cabeca-cliente' }, avatar(c.nome, c.tipo === 'empresa'),
        h('div', null, h('h1', null, c.nome), h('p', { class: 'sub' }, [c.tipo === 'empresa' ? 'Empresa' : 'Particular', c.localidade].filter(Boolean).join(' · '),
          c.estado === 'inativo' ? h('span', { class: 'estado neutro', style: 'margin-left:8px' }, 'Inativo') : null))),
      h('div', { class: 'acoes' }, menu)),
    acoes.length ? h('div', { class: 'acoes-rapidas' }, acoes) : null,
    h('div', { class: 'grelha lado-e' },
      h('div', { class: 'grelha' }, h('section', { class: 'ficha' }, h('header', null, h('h2', null, 'Dados')), dados), ...blocos),
      h('section', { class: 'ficha' }, h('header', null, h('h2', null, 'Cronologia')), pode('clientes', 'e') ? nota : null,
        h('div', { style: 'margin-top:12px' }, cronologia))));
}

export function estadoAdesao(a) {
  const m = { ativa: ['ok', 'Ativa'], em_atraso: ['mau', 'Em atraso'], esgotado: ['neutro', 'Esgotado'], expirada: ['neutro', 'Expirado'], cancelada: ['neutro', 'Cancelada'] };
  const [t, x] = m[a.estado] || ['neutro', a.estado];
  return h('span', { class: 'estado ' + t }, x);
}

export function nomeFase(id) { return (estado.eu.conta.fases || []).find((f) => f.id === id)?.nome || id; }

export async function mostrar(raiz, caminho) {
  equipaCache = null;
  const m = caminho.match(/^\/app\/clientes\/([A-Za-z0-9_-]{12})$/);
  if (m) return ficha(raiz, m[1]);
  return lista(raiz);
}
