// webase — contratos e avenças: estado, valor, início/fim, renovação automática e receita mensal.
import { estado, h, icone, get, post, euros, num, dataIso, ligacao, campo, opcao, formFolha, aviso, falhou, confirmar, pode, podeX,
  vazio, debounce, descarregar, escolherCliente, hojeIso, centParaTexto, estadoTxt } from './nucleo.js';

const PER = { unico: 'Pagamento único', mensal: 'Mensal', trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual' };
const EST = { rascunho: ['neutro', 'Rascunho'], ativo: ['ok', 'Ativo'], terminado: ['neutro', 'Terminado'], cancelado: ['mau', 'Cancelado'] };

function campos(k = {}, cliente = null) {
  return [
    escolherCliente({ inicial: cliente || (k.cliente ? { id: k.cliente, nome: k.cliente_nome } : null) }),
    h('div', { class: 'duas' }, campo({ nome: 'titulo', rotulo: 'Título', valor: k.titulo, obrig: true, placeholder: 'Ex.: Avença de manutenção' }),
      campo({ nome: 'referencia', rotulo: 'Referência', valor: k.referencia, placeholder: 'Ex.: C-2026-014' })),
    h('div', { class: 'duas' }, campo({ nome: 'valor', rotulo: 'Valor (€)', inputmode: 'decimal', valor: centParaTexto(k.valor), placeholder: '0,00' }),
      campo({ nome: 'periodicidade', rotulo: 'Periodicidade', tipo: 'select', valor: k.periodicidade || 'mensal', opcoes: Object.entries(PER) })),
    h('div', { class: 'duas' }, campo({ nome: 'inicio', rotulo: 'Início', tipo: 'date', valor: k.inicio || hojeIso(), obrig: true }),
      campo({ nome: 'fim', rotulo: 'Fim', tipo: 'date', valor: k.fim, ajuda: 'Vazio se não tem fim.' })),
    campo({ nome: 'estado', rotulo: 'Estado', tipo: 'select', valor: k.estado || 'ativo', opcoes: Object.entries(EST).map(([v, [, t]]) => [v, t]) }),
    h('div', { class: 'campo', dados: { campo: 'renovacao' } }, opcao({ nome: 'renovacao', rotulo: 'Renova sozinho quando chega ao fim', marcado: !!k.renovacao })),
    campo({ nome: 'notas', rotulo: 'Notas', tipo: 'textarea', valor: k.notas, linhas: 3 }),
  ];
}

export function novoContrato({ cliente, depois } = {}) {
  formFolha({ titulo: 'Novo contrato', campos: campos({}, cliente), botao: 'Criar contrato', larga: true,
    enviar: async (d, form, f) => { const r = await post('/api/contratos', d); f.fechar(); aviso('Contrato criado.', { carimbo: true, icone: 'contratos' }); depois?.(r.contrato); } });
}

function editar(k, depois) {
  const bApagar = pode('contratos', 'a') ? h('button', { class: 'bt bt-perigo esq', type: 'button' }, icone('lixo'), 'Apagar') : null;
  const ff = formFolha({ titulo: k.titulo, campos: campos(k), larga: true, extraPe: bApagar ? [bApagar] : [],
    enviar: async (d, form, f) => { await post('/api/contratos/' + k.id, d); f.fechar(); aviso('Contrato guardado.'); depois(); } });
  bApagar?.addEventListener('click', async () => {
    if (!await confirmar({ titulo: 'Apagar este contrato?', texto: k.titulo, sim: 'Apagar', perigo: true })) return;
    try { await post('/api/contratos/' + k.id + '/apagar'); ff.folha.fechar(); aviso('Contrato apagado.'); depois(); } catch (e) { falhou(e); }
  });
}

export async function mostrar(raiz) {
  const filtros = { estado: '', q: '' };
  const corpo = h('div');
  const numeros = h('div', { class: 'numeros' });
  const sep = h('div', { class: 'separadores', role: 'tablist' });
  const carregar = async () => {
    const r = await get('/api/contratos?' + new URLSearchParams(Object.entries(filtros).filter(([, v]) => v)));
    numeros.replaceChildren(
      h('div', { class: 'numero' }, h('span', { class: 'r' }, 'Ativos'), h('span', { class: 'n' }, num(r.resumo.ativos))),
      h('div', { class: 'numero' }, h('span', { class: 'r' }, 'Receita por mês'), h('span', { class: 'n' }, euros(r.resumo.mensal)), h('span', { class: 'd' }, 'contratos ativos, por mês')),
      h('div', { class: 'numero' }, h('span', { class: 'r' }, 'Por ano'), h('span', { class: 'n' }, euros(r.resumo.mensal * 12))),
      h('button', { class: 'numero', type: 'button', style: 'border:0;text-align:left;cursor:pointer', onclick: () => { filtros.estado = 'a_terminar'; carregar().catch(falhou); } },
        h('span', { class: 'r' }, 'A terminar'), h('span', { class: 'n' }, num(r.resumo.a_terminar)), h('span', { class: 'd' }, 'nos próximos 30 dias')));
    sep.replaceChildren(...[['', 'Todos'], ['ativo', 'Ativos'], ['a_terminar', 'A terminar'], ['rascunho', 'Rascunhos'], ['terminado', 'Terminados'], ['cancelado', 'Cancelados']].map(([v, t]) =>
      h('button', { type: 'button', role: 'tab', 'aria-selected': String(filtros.estado === v), onclick: () => { filtros.estado = v; carregar().catch(falhou); } }, t)));
    if (!r.itens.length) {
      corpo.replaceChildren(!filtros.estado && !filtros.q ? vazio({ titulo: 'Ainda não tens contratos', icone: 'contratos',
        texto: 'Guarda contratos, avenças e fidelizações com início, fim e valor. Avisamos-te antes de terminarem.',
        acao: pode('contratos', 'c') ? h('button', { class: 'bt bt-p', type: 'button', onclick: () => novoContrato({ depois: carregar }) }, 'Criar contrato') : null })
        : h('p', { style: 'padding:20px 4px;color:var(--tinta2)' }, 'Nenhum contrato aqui.'));
      return;
    }
    corpo.replaceChildren(h('div', { class: 'ficha', style: 'padding:6px 14px' }, h('div', { class: 'lista' }, r.itens.map((k) => {
      const [t, x] = EST[k.estado] || ['neutro', k.estado];
      return h('div', { class: 'linha' },
        h('span', { class: 'icone-linha' }, icone('contratos')),
        h('button', { class: 'principal-l', type: 'button', style: 'border:0;background:none;text-align:left;padding:0;min-width:0', onclick: () => pode('contratos', 'e') && editar(k, carregar) },
          h('span', { class: 't', style: 'display:block' }, k.titulo, k.referencia ? h('span', { style: 'color:var(--tinta2);font-weight:500' }, ' · ' + k.referencia) : null),
          h('span', { class: 's', style: 'display:block' }, [k.cliente_nome, PER[k.periodicidade], `${dataIso(k.inicio)}${k.fim ? ' – ' + dataIso(k.fim) : ''}`, k.renovacao ? 'renova sozinho' : ''].filter(Boolean).join(' · '))),
        h('span', { class: 'lado-d' }, h('strong', null, euros(k.valor)), k.a_terminar ? h('span', { class: 'estado atencao' }, 'A terminar') : h('span', { class: 'estado ' + t }, x)),
        k.cliente ? ligacao('/app/clientes/' + k.cliente, { class: 'bt bt-pq bt-limpo so-pc-flex' }, 'Ficha') : null);
    }))));
  };
  const inpQ = h('input', { class: 'entrada', type: 'search', placeholder: 'Procurar por título, referência ou cliente', 'aria-label': 'Procurar contratos' });
  inpQ.addEventListener('input', debounce(() => { filtros.q = inpQ.value.trim(); carregar().catch(falhou); }));
  const acoes = [];
  if (podeX('exportar')) acoes.push(h('button', { class: 'bt', type: 'button', onclick: () => descarregar('/api/exportar/contratos.csv').catch(falhou) }, icone('descarregar'), 'Exportar'));
  if (pode('contratos', 'c')) acoes.push(h('button', { class: 'bt bt-p', type: 'button', onclick: () => novoContrato({ depois: carregar }) }, icone('mais'), 'Novo contrato'));
  raiz.replaceChildren(h('header', { class: 'cabeca' }, h('div', null, h('h1', null, 'Contratos'), h('p', { class: 'sub' }, 'Avenças, fidelizações e acordos')), h('div', { class: 'acoes' }, acoes)),
    numeros, h('div', { class: 'barra-filtros' }, sep, h('div', { class: 'pesquisa' }, icone('procurar'), inpQ)), corpo);
  await carregar();
}
