// webase — marketplace: bases de contactos entre contas (comprar, publicar) e partilhas diretas.
import { estado, h, icone, get, post, euros, num, relativo, data, ligacao, navegar, campo, opcao, formFolha, folha, aviso, falhou,
  pode, vazio, debounce, carimbo, iniciais, confirmar, aGuardar, lerForm, limparErros, mostrarErro } from './nucleo.js';

let info = null;

function cartao(a, abrir) {
  return h('button', { class: 'anuncio', type: 'button', onclick: () => abrir(a) },
    h('span', { class: 'autor' }, a.vendedor.logo ? h('img', { src: a.vendedor.logo, alt: '' }) : h('span', { class: 'iniciais' }, iniciais(a.vendedor.nome)),
      h('span', null, a.meu ? 'A tua conta' : a.vendedor.nome)),
    h('span', { class: 't' }, a.titulo),
    h('span', { class: 'meta' }, h('span', null, num(a.n) + ' contactos'), h('span', null, a.tipo_nome), a.regiao ? h('span', null, a.regiao) : null, h('span', null, a.setor_nome)),
    h('span', { style: 'display:flex;justify-content:space-between;align-items:center;gap:8px' },
      h('span', { class: 'preco' }, a.preco ? euros(a.preco) : 'Grátis'),
      a.meu ? h('span', { class: 'estado ' + (a.estado === 'ativo' ? 'ok' : 'neutro') }, a.estado === 'ativo' ? 'Publicado' : 'Em pausa')
        : a.compra ? h('span', { class: 'estado ' + (a.compra === 'reservada' ? 'atencao' : 'ok') }, a.compra === 'reservada' ? 'Reservado' : 'Já recebeste') : null));
}

async function abrir(a, recarregar) {
  let det;
  try { det = (await get('/api/mk/' + a.id)).anuncio; } catch (e) { return falhou(e); }
  const campos = det.campos.map((c) => info.campos[c] || c).join(', ');
  const corpo = h('div', { class: 'grelha' },
    h('span', { class: 'autor' }, det.vendedor.logo ? h('img', { src: det.vendedor.logo, alt: '' }) : h('span', { class: 'iniciais' }, iniciais(det.vendedor.nome)), det.vendedor.nome),
    h('div', { class: 'numeros', style: 'grid-template-columns:repeat(3,1fr)' },
      h('div', { class: 'numero', style: 'background:var(--folha2)' }, h('span', { class: 'r' }, 'Contactos'), h('span', { class: 'n' }, num(det.n))),
      h('div', { class: 'numero', style: 'background:var(--folha2)' }, h('span', { class: 'r' }, 'Preço'), h('span', { class: 'n' }, det.preco ? euros(det.preco) : 'Grátis')),
      h('div', { class: 'numero', style: 'background:var(--folha2)' }, h('span', { class: 'r' }, 'Vendas'), h('span', { class: 'n' }, num(det.vendas)))),
    det.descricao ? h('p', { class: 'texto-longo' }, det.descricao) : null,
    h('dl', { class: 'dados' },
      h('div', { class: 'dado' }, h('dt', null, 'Inclui'), h('dd', null, campos)),
      h('div', { class: 'dado' }, h('dt', null, 'Tipo'), h('dd', null, det.tipo_nome)),
      det.regiao ? h('div', { class: 'dado' }, h('dt', null, 'Região'), h('dd', null, det.regiao)) : null,
      h('div', { class: 'dado' }, h('dt', null, 'Publicado'), h('dd', null, data(det.criado)))),
    det.amostra?.length ? h('div', null, h('p', { class: 'rotulo' }, 'Amostra (escondida até receberes)'),
      h('table', { class: 'amostra' }, h('tbody', null, det.amostra.map((x) => h('tr', null, h('td', null, x.nome || x.empresa), h('td', null, x.telefone), h('td', null, x.email), h('td', null, x.localidade)))))) : null,
    h('p', { class: 'nota-suave' }, 'Quem vende declarou: «', det.declaracao, '» Os contactos chegam aos teus clientes com uma etiqueta própria e sem consentimento de marketing marcado: confirma a base legal antes de lhes enviares publicidade.'));
  const pe = [];
  if (det.meu) {
    pe.push(h('button', { class: 'bt bt-perigo esq', type: 'button', onclick: async () => {
      if (!await confirmar({ titulo: 'Retirar este anúncio?', texto: 'Os contactos guardados para venda são apagados. Quem já recebeu fica com eles.', sim: 'Retirar', perigo: true })) return;
      try { await post('/api/mk/' + det.id, { estado: 'removido' }); d.fechar(); aviso('Anúncio retirado.'); recarregar(); } catch (e) { falhou(e); }
    } }, 'Retirar'));
    pe.push(h('button', { class: 'bt', type: 'button', onclick: async () => {
      try { await post('/api/mk/' + det.id, { estado: det.estado === 'ativo' ? 'pausado' : 'ativo' }); d.fechar(); aviso(det.estado === 'ativo' ? 'Anúncio em pausa.' : 'Anúncio publicado.'); recarregar(); } catch (e) { falhou(e); }
    } }, det.estado === 'ativo' ? 'Pôr em pausa' : 'Publicar outra vez'));
  } else if (pode('marketplace', 'c') && pode('clientes', 'c') && !(det.compra && det.compra !== 'reservada')) {
    const b = h('button', { class: 'bt bt-p', type: 'button' }, det.preco ? `Comprar por ${euros(det.preco)}` : 'Receber grátis');
    if (det.compra === 'reservada') { b.textContent = 'Reservado'; b.disabled = true; }
    b.addEventListener('click', async () => {
      try {
        const r = await aGuardar(b, () => post('/api/mk/' + det.id + '/comprar'), 'A tratar…');
        d.fechar();
        if (r.reservada) aviso(r.mensagem, { carimbo: true, icone: 'relogio' });
        else { aviso(`${num(r.criados)} contactos juntos aos teus clientes`, { carimbo: true, icone: 'marketplace' }); navegar('/app/clientes?etiqueta=' + encodeURIComponent(r.etiqueta)); }
        window.estat?.('marketplace', det.preco ? 'reservar' : 'receber');
      } catch (e) { falhou(e); }
    });
    pe.push(b);
  }
  const d = folha({ titulo: det.titulo, corpo, pe, larga: true });
}

async function publicar(recarregar) {
  let etiquetas = [];
  try { etiquetas = (await get('/api/clientes')).etiquetas; } catch { /* sem etiquetas */ }
  const camposDisp = Object.entries(info.campos);
  const form = h('form', { novalidate: true, class: 'grelha' },
    campo({ nome: 'titulo', rotulo: 'Título', obrig: true, placeholder: 'Ex.: Cafés e pastelarias do Grande Porto' }),
    campo({ nome: 'descricao', rotulo: 'Descrição', tipo: 'textarea', linhas: 3, placeholder: 'De onde vêm os contactos, quando foram atualizados, para que servem.' }),
    h('div', { class: 'duas' }, campo({ nome: 'etiqueta', rotulo: 'Que clientes', tipo: 'select', opcoes: [['', 'Todos os meus clientes'], ...etiquetas.map((e) => [e, 'Com a etiqueta «' + e + '»'])] }),
      campo({ nome: 'tipo_dados', rotulo: 'Tipo de contactos', tipo: 'select', opcoes: Object.entries(info.tipos) })),
    h('div', { class: 'duas' }, campo({ nome: 'setor', rotulo: 'Setor', tipo: 'select', valor: estado.eu.conta.setor, opcoes: Object.entries(info.setores) }),
      campo({ nome: 'regiao', rotulo: 'Região', placeholder: 'Ex.: Porto' })),
    h('fieldset', { class: 'campo', style: 'border:0;padding:0;margin:0', dados: { campo: 'campos' } }, h('legend', { class: 'rotulo', style: 'margin-bottom:8px' }, 'Campos incluídos'),
      h('div', { class: 'duas', style: 'gap:8px' }, camposDisp.map(([k, t]) => opcao({ nome: 'cp_' + k, rotulo: t, marcado: ['nome', 'empresa', 'telefone', 'localidade'].includes(k) })))),
    campo({ nome: 'preco', rotulo: 'Preço (€)', inputmode: 'decimal', valor: '0', ajuda: `0 para dar de graça. A webase fica com ${info.comissao} % de cada venda paga.` }),
    h('div', { class: 'campo', dados: { campo: 'so_consentimento' } }, opcao({ nome: 'so_consentimento', rotulo: 'Incluir só quem deu consentimento para marketing' })),
    h('div', { class: 'campo', dados: { campo: 'declaracao' } }, opcao({ nome: 'declaracao', rotulo: info.declaracao })));
  const bOk = h('button', { class: 'bt bt-p', type: 'submit' }, 'Publicar');
  const bNao = h('button', { class: 'bt', type: 'button' }, 'Cancelar');
  const d = folha({ titulo: 'Publicar uma base', corpo: form, pe: [bNao, bOk], larga: true });
  bNao.addEventListener('click', () => d.fechar());
  bOk.setAttribute('form', form.id = 'fmk');
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); limparErros(form);
    const v = lerForm(form);
    const dados = { titulo: v.titulo, descricao: v.descricao, etiqueta: v.etiqueta, tipo_dados: v.tipo_dados, setor: v.setor, regiao: v.regiao, preco: v.preco,
      so_consentimento: v.so_consentimento, declaracao: v.declaracao, campos: camposDisp.map(([k]) => k).filter((k) => v['cp_' + k]) };
    try {
      const r = await aGuardar(bOk, () => post('/api/mk', dados), 'A publicar…');
      d.fechar(); aviso(`Publicado: ${num(r.anuncio.n)} contactos`, { carimbo: true, icone: 'marketplace' }); recarregar();
    } catch (er) { mostrarErro(form, er); }
  });
}

async function partilhar() {
  let etiquetas = [];
  try { etiquetas = (await get('/api/clientes')).etiquetas; } catch { /* nada */ }
  formFolha({ titulo: 'Partilhar com outra conta', botao: 'Partilhar', campos: [
    h('p', { class: 'nota-suave' }, 'A outra conta recebe um aviso e decide se aceita. Pede-lhe o código da conta (está em Definições → Negócio).'),
    campo({ nome: 'codigo', rotulo: 'Código da outra conta', obrig: true, placeholder: 'WB-XXXXXX' }),
    campo({ nome: 'titulo', rotulo: 'Título', obrig: true, placeholder: 'Ex.: Clientes da loja de Gondomar' }),
    campo({ nome: 'etiqueta', rotulo: 'Que clientes', tipo: 'select', opcoes: [['', 'Todos os meus clientes'], ...etiquetas.map((e) => [e, 'Com a etiqueta «' + e + '»'])] }),
  ], enviar: async (d, form, f) => {
    d.campos = ['nome', 'empresa', 'telefone', 'email', 'localidade', 'etiquetas'];
    const r = await post('/api/partilhas', d);
    f.fechar(); aviso(`Enviados ${num(r.n)} contactos para ${r.para}. Falta aceitarem.`, { carimbo: true, icone: 'partilha' });
  } });
}

async function minhas(raiz) {
  const [m, p] = await Promise.all([get('/api/mk/minhas'), get('/api/partilhas')]);
  const EST = { reservada: ['atencao', 'Reservada'], gratis: ['ok', 'Recebida'], teste: ['ok', 'Recebida (teste)'], paga: ['ok', 'Paga'], cancelada: ['neutro', 'Cancelada'],
    pendente: ['atencao', 'Por decidir'], aceite: ['ok', 'Aceite'], recusada: ['neutro', 'Recusada'], apagada: ['neutro', 'Apagada'] };
  const est = (e) => h('span', { class: 'estado ' + (EST[e]?.[0] || 'neutro') }, EST[e]?.[1] || e);
  const decidir = async (id, acao) => {
    try {
      const r = await post('/api/partilhas/' + id + '/' + acao);
      aviso(acao === 'aceitar' ? `${num(r.criados)} contactos juntos aos teus clientes` : 'Partilha recusada.', { carimbo: acao === 'aceitar' });
      minhas(raiz);
    } catch (e) { falhou(e); }
  };
  raiz.replaceChildren(
    ligacao('/app/marketplace', { class: 'voltar' }, icone('voltar'), 'Marketplace'),
    h('header', { class: 'cabeca' }, h('div', null, h('h1', null, 'As minhas trocas'), h('p', { class: 'sub' }, 'Código da tua conta: ', h('strong', null, p.codigo)))),
    h('div', { class: 'grelha g2' },
      h('section', { class: 'ficha' }, h('header', null, h('h2', null, 'Partilhas recebidas')),
        p.recebidas.length ? h('div', { class: 'lista' }, p.recebidas.map((x) => h('div', { class: 'linha' },
          h('span', { class: 'principal-l' }, h('span', { class: 't' }, x.titulo), h('span', { class: 's' }, `${x.outra} · ${num(x.n)} contactos · ${relativo(x.quando)}`)),
          x.estado === 'pendente' && pode('clientes', 'c') ? h('span', { style: 'display:flex;gap:6px' },
            h('button', { class: 'bt bt-pq', type: 'button', onclick: () => decidir(x.id, 'recusar') }, 'Recusar'),
            h('button', { class: 'bt bt-pq bt-p', type: 'button', onclick: () => decidir(x.id, 'aceitar') }, 'Aceitar')) : est(x.estado))))
          : h('p', { style: 'color:var(--tinta2)' }, 'Nenhuma partilha recebida.')),
      h('section', { class: 'ficha' }, h('header', null, h('h2', null, 'Partilhas enviadas')),
        p.enviadas.length ? h('div', { class: 'lista' }, p.enviadas.map((x) => h('div', { class: 'linha' },
          h('span', { class: 'principal-l' }, h('span', { class: 't' }, x.titulo), h('span', { class: 's' }, `${x.outra} · ${num(x.n)} contactos`)), est(x.estado))))
          : h('p', { style: 'color:var(--tinta2)' }, 'Ainda não partilhaste nada.')),
      h('section', { class: 'ficha' }, h('header', null, h('h2', null, 'Compras')),
        m.compras.length ? h('div', { class: 'lista' }, m.compras.map((x) => h('div', { class: 'linha' },
          h('span', { class: 'principal-l' }, h('span', { class: 't' }, x.titulo), h('span', { class: 's' }, `${x.outra} · ${x.preco ? euros(x.preco) : 'grátis'}${x.n ? ` · ${num(x.n)} contactos` : ''}`)), est(x.estado))))
          : h('p', { style: 'color:var(--tinta2)' }, 'Ainda não compraste bases.')),
      h('section', { class: 'ficha' }, h('header', null, h('h2', null, 'Vendas')),
        m.vendas.length ? h('div', { class: 'lista' }, m.vendas.map((x) => h('div', { class: 'linha' },
          h('span', { class: 'principal-l' }, h('span', { class: 't' }, x.titulo), h('span', { class: 's' }, `${x.outra} · ${x.preco ? euros(x.preco - x.comissao) + ' para ti' : 'grátis'}`)), est(x.estado))))
          : h('p', { style: 'color:var(--tinta2)' }, 'Ainda não vendeste.'))));
}

export async function mostrar(raiz, caminho) {
  if (/\/minhas$/.test(caminho)) return minhas(raiz);
  const filtros = { q: '', setor: '', tipo: '', ordem: '', meus: '' };
  const grelha = h('div');
  const carregar = async () => {
    info = await get('/api/mk?' + new URLSearchParams(Object.entries(filtros).filter(([, v]) => v)));
    grelha.replaceChildren(info.itens.length ? h('div', { class: 'anuncios' }, info.itens.map((a) => cartao(a, (x) => abrir(x, carregar))))
      : vazio({ titulo: filtros.q || filtros.setor || filtros.tipo ? 'Nenhuma base com estes filtros' : 'Ainda não há bases publicadas', icone: 'marketplace',
        texto: 'Aqui, as contas da webase compram, vendem e trocam bases de contactos. Publica a primeira e põe a tua conta à frente.',
        acao: pode('marketplace', 'c') ? h('button', { class: 'bt bt-p', type: 'button', onclick: () => publicar(carregar) }, 'Publicar uma base') : null }));
  };
  await carregar();
  const inpQ = h('input', { class: 'entrada', type: 'search', placeholder: 'Procurar bases', 'aria-label': 'Procurar bases' });
  inpQ.addEventListener('input', debounce(() => { filtros.q = inpQ.value.trim(); carregar().catch(falhou); }));
  const sel = (nome, rot, ops) => h('select', { class: 'entrada', style: 'width:auto', 'aria-label': rot, onchange: (e) => { filtros[nome] = e.target.value; carregar().catch(falhou); } },
    h('option', { value: '' }, rot), ops.map(([v, t]) => h('option', { value: v }, t)));
  const acoes = [ligacao('/app/marketplace/minhas', { class: 'bt' }, 'As minhas trocas')];
  if (pode('marketplace', 'c')) {
    acoes.push(h('button', { class: 'bt', type: 'button', onclick: partilhar }, icone('partilha'), 'Partilhar'));
    acoes.push(h('button', { class: 'bt bt-p', type: 'button', onclick: () => publicar(carregar) }, icone('mais'), 'Publicar base'));
  }
  raiz.replaceChildren(
    h('header', { class: 'cabeca' }, h('div', null, h('h1', null, 'Marketplace'), h('p', { class: 'sub' }, 'Bases de contactos entre contas da webase')), h('div', { class: 'acoes' }, acoes)),
    h('div', { class: 'barra-filtros' }, h('div', { class: 'pesquisa' }, icone('procurar'), inpQ),
      sel('setor', 'Todos os setores', Object.entries(info.setores)), sel('tipo', 'Todos os tipos', Object.entries(info.tipos)),
      sel('ordem', 'Mais recentes', [['preco', 'Mais baratas'], ['maiores', 'Mais contactos'], ['vendidos', 'Mais vendidas']]),
      sel('meus', 'De todas as contas', [['1', 'Só as minhas']])),
    grelha);
}
