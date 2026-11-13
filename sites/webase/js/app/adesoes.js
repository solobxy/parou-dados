// webase — subscrições (mensalidades) e pacotes (ex.: 10 cortes): vender, usar, registar pagamentos.
import { estado, h, icone, get, post, euros, num, data, relativo, ligacao, campo, opcao, formFolha, aviso, falhou, confirmar, pode,
  vazio, debounce, escolherCliente, hojeIso, centParaTexto, ligado } from './nucleo.js';
import { estadoAdesao } from './clientes.js';

const PER = { mensal: 'por mês', trimestral: 'por trimestre', semestral: 'por semestre', anual: 'por ano' };

function produtoForm(p, depois) {
  let tipo = p?.tipo || 'pacote';
  const zonaTipo = h('div', { class: 'grelha' });
  const pintar = () => {
    zonaTipo.replaceChildren(...(tipo === 'subscricao'
      ? [campo({ nome: 'periodo', rotulo: 'Paga-se', tipo: 'select', valor: p?.periodo || 'mensal', opcoes: [['mensal', 'Todos os meses'], ['trimestral', 'De 3 em 3 meses'], ['semestral', 'De 6 em 6 meses'], ['anual', 'Todos os anos']] })]
      : [h('div', { class: 'duas' }, campo({ nome: 'usos', rotulo: 'Número de usos', inputmode: 'numeric', valor: p?.usos || 10, obrig: true, ajuda: 'Ex.: 10 cortes, 8 aulas.' }),
        campo({ nome: 'validade', rotulo: 'Validade (dias)', inputmode: 'numeric', valor: p?.validade || '', ajuda: 'Vazio = não expira.' }))]));
  };
  const selTipo = campo({ nome: 'tipo', rotulo: 'Tipo', tipo: 'select', valor: tipo, opcoes: [['pacote', 'Pacote (número de usos)'], ['subscricao', 'Subscrição (mensalidade)']] });
  selTipo.querySelector('select').addEventListener('change', (e) => { tipo = e.target.value; pintar(); });
  if (p) selTipo.querySelector('select').disabled = true;
  pintar();
  formFolha({ titulo: p ? 'Editar ' + p.nome : 'Novo plano ou pacote', botao: p ? 'Guardar' : 'Criar', campos: [
    campo({ nome: 'nome', rotulo: 'Nome', valor: p?.nome, obrig: true, placeholder: 'Ex.: 10 cortes, Plano livre trânsito' }),
    selTipo, campo({ nome: 'preco', rotulo: 'Preço (€)', inputmode: 'decimal', valor: centParaTexto(p?.preco), obrig: true }), zonaTipo,
    p ? h('div', { class: 'campo' }, opcao({ nome: 'ativo', rotulo: 'À venda', marcado: p.ativo })) : null],
  enviar: async (d, form, f) => {
    d.tipo = tipo;
    if (d.usos) d.usos = Number(d.usos);
    d.validade = Number(d.validade || 0);
    if (p) await post('/api/produtos/' + p.id, d); else await post('/api/produtos', d);
    f.fechar(); aviso('Guardado.'); depois();
  } });
}

export async function venderAdesao({ cliente, depois } = {}) {
  let r;
  try { r = await get('/api/adesoes'); } catch (e) { return falhou(e); }
  const prods = r.produtos.filter((p) => p.ativo);
  if (!prods.length) {
    aviso('Primeiro cria um plano ou pacote na página Subscrições e pacotes.', { erro: true });
    return;
  }
  const descr = (p) => `${p.nome} — ${euros(p.preco)}${p.tipo === 'subscricao' ? ' ' + PER[p.periodo] : ` (${p.usos} usos)`}`;
  formFolha({ titulo: 'Vender plano ou pacote', botao: 'Vender', campos: [
    escolherCliente({ inicial: cliente }),
    campo({ nome: 'produto', rotulo: 'Plano ou pacote', tipo: 'select', opcoes: prods.map((p) => [p.id, descr(p)]) }),
    campo({ nome: 'inicio', rotulo: 'Começa em', tipo: 'date', valor: hojeIso() }),
    ligado('pontos') ? h('div', { class: 'campo' }, opcao({ nome: 'pontos', rotulo: 'Dar pontos por este pagamento', marcado: true })) : null,
  ], enviar: async (d, form, f) => {
    const x = await post('/api/adesoes', d);
    f.fechar(); aviso(`${x.adesao.produto_nome} vendido a ${x.adesao.cliente_nome}.`, { carimbo: true, icone: 'pacote' }); depois?.(x.adesao);
  } });
}

export async function mostrar(raiz) {
  const filtros = { estado: '', q: '' };
  const corpo = h('div');
  const carregar = async () => {
    const r = await get('/api/adesoes?' + new URLSearchParams(Object.entries(filtros).filter(([, v]) => v)));
    const podeEd = pode('adesoes', 'e');
    const podeC = pode('adesoes', 'c');
    const acao = async (caminho, msg, opc) => { try { await post(caminho, opc); aviso(msg, { carimbo: true, icone: 'certo' }); carregar(); } catch (e) { falhou(e); } };
    const sep = h('div', { class: 'separadores', role: 'tablist' }, [['', 'Todas'], ['ativa', 'Ativas'], ['em_atraso', 'Em atraso'], ['esgotado', 'Esgotados'], ['cancelada', 'Canceladas']].map(([v, t]) =>
      h('button', { type: 'button', role: 'tab', 'aria-selected': String(filtros.estado === v), onclick: () => { filtros.estado = v; carregar().catch(falhou); } }, t)));
    const inpQ = h('input', { class: 'entrada', type: 'search', placeholder: 'Procurar cliente ou plano', 'aria-label': 'Procurar', value: filtros.q });
    inpQ.addEventListener('input', debounce(() => { filtros.q = inpQ.value.trim(); carregar().then(() => { const n = raiz.querySelector('input[type=search]'); n?.focus(); n?.setSelectionRange(n.value.length, n.value.length); }).catch(falhou); }));
    const itens = r.itens.map((a) => h('div', { class: 'linha com-acoes' },
      h('span', { class: 'icone-linha' }, icone(a.tipo === 'pacote' ? 'pacote' : 'adesoes')),
      h('span', { class: 'principal-l' }, ligacao('/app/clientes/' + a.cliente, { class: 't', style: 'display:block;text-decoration:none' }, a.cliente_nome),
        h('span', { class: 's', style: 'display:block' }, a.produto_nome, ' · ',
          a.tipo === 'pacote' ? `faltam ${a.usos} de ${a.usos_total}` : (a.estado === 'em_atraso' ? `devia ter pago ${relativo(a.proxima)}` : `próximo pagamento ${data(a.proxima)}`))),
      estadoAdesao(a),
      h('span', { class: 'acoes-l' },
        podeC && ['ativa', 'em_atraso'].includes(a.estado) ? h('button', { class: 'bt bt-pq', type: 'button', onclick: () => acao('/api/adesoes/' + a.id + '/usar', a.tipo === 'pacote' ? 'Uso registado.' : 'Visita registada.') }, a.tipo === 'pacote' ? 'Usar' : 'Visita') : null,
        podeEd && a.estado !== 'cancelada' ? h('button', { class: 'bt bt-pq' + (a.estado === 'em_atraso' || a.estado === 'esgotado' ? ' bt-p' : ''), type: 'button',
          onclick: () => acao('/api/adesoes/' + a.id + '/pagamento', a.tipo === 'pacote' ? 'Pacote renovado.' : 'Pagamento registado.', {}) }, a.tipo === 'pacote' ? 'Renovar' : 'Pago') : null,
        podeEd && a.estado !== 'cancelada' ? h('button', { class: 'bt bt-pq bt-limpo', type: 'button', 'aria-label': 'Cancelar ' + a.produto_nome + ' de ' + a.cliente_nome, onclick: async () => {
          if (await confirmar({ titulo: 'Cancelar?', texto: `${a.produto_nome} de ${a.cliente_nome}. Deixa de contar como ativa.`, sim: 'Cancelar plano', perigo: true })) acao('/api/adesoes/' + a.id + '/cancelar', 'Cancelado.');
        } }, icone('fechar')) : null)));
    corpo.replaceChildren(
      h('div', { class: 'numeros' },
        h('div', { class: 'numero' }, h('span', { class: 'r' }, 'Ativas'), h('span', { class: 'n' }, num(r.resumo.ativas))),
        h('div', { class: 'numero' }, h('span', { class: 'r' }, 'Mensalidades'), h('span', { class: 'n' }, euros(r.resumo.mensal)), h('span', { class: 'd' }, 'por mês')),
        h('div', { class: 'numero' }, h('span', { class: 'r' }, 'A renovar'), h('span', { class: 'n' }, num(r.resumo.a_renovar)), h('span', { class: 'd' }, 'nos próximos 7 dias')),
        h('div', { class: 'numero' }, h('span', { class: 'r' }, 'Em atraso'), h('span', { class: 'n' }, num(r.resumo.em_atraso)))),
      h('div', { class: 'grelha lado' },
        h('section', { class: 'ficha' }, h('div', { class: 'barra-filtros', style: 'margin-bottom:8px' }, sep, h('div', { class: 'pesquisa' }, icone('procurar'), inpQ)),
          itens.length ? h('div', { class: 'lista' }, itens) : (r.produtos.length ? h('p', { style: 'color:var(--tinta2);padding:12px 4px' }, 'Nada aqui.')
            : vazio({ titulo: 'Vende pacotes e mensalidades', icone: 'pacote', texto: 'Cria um pacote (ex.: 10 cortes por 90 €) ou uma mensalidade (ex.: ginásio a 30 € por mês). Depois vendes a um cliente e registas cada uso ou pagamento.' }))),
        h('section', { class: 'ficha' }, h('header', null, h('h2', null, 'Planos e pacotes'), podeEd ? h('button', { class: 'bt bt-pq', type: 'button', onclick: () => produtoForm(null, carregar) }, icone('mais'), 'Novo') : null),
          r.produtos.length ? h('div', { class: 'lista' }, r.produtos.map((p) => h('button', { class: 'linha', type: 'button', disabled: !podeEd, onclick: () => produtoForm(p, carregar) },
            h('span', { class: 'principal-l' }, h('span', { class: 't' }, p.nome), h('span', { class: 's' }, p.tipo === 'pacote' ? `${p.usos} usos${p.validade ? ` · ${p.validade} dias` : ''}` : 'Subscrição ' + PER[p.periodo], p.ativo ? '' : ' · fora de venda')),
            h('strong', null, euros(p.preco)))))
            : h('p', { style: 'color:var(--tinta2)' }, 'Ainda não há planos.', podeEd ? [' ', h('button', { class: 'ligacao', type: 'button', onclick: () => produtoForm(null, carregar) }, 'Criar o primeiro')] : null))));
  };
  const acoes = pode('adesoes', 'c') ? [h('button', { class: 'bt bt-p', type: 'button', onclick: () => venderAdesao({ depois: carregar }) }, icone('mais'), 'Vender')] : [];
  raiz.replaceChildren(h('header', { class: 'cabeca' }, h('div', null, h('h1', null, 'Subscrições e pacotes'), h('p', { class: 'sub' }, 'Mensalidades, pacotes de sessões e o que cada cliente já usou')), h('div', { class: 'acoes' }, acoes)), corpo);
  await carregar();
}
