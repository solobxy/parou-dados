// webase — leads e oportunidades: funil por fases (arrastar no computador, «Mover para…» em qualquer ecrã).
import { estado, h, icone, get, post, euros, num, relativo, ligacao, navegar, campo, formFolha, aviso, falhou, confirmar, pode, podeX,
  vazio, debounce, descarregar, escolherCliente, tsParaLocal, folha, centParaTexto } from './nucleo.js';

let equipaCache = null;
async function equipa() {
  if (!equipaCache) { try { equipaCache = (await get('/api/equipa')).equipa; } catch { equipaCache = []; } }
  return equipaCache;
}

function camposLead(l = {}, eq = [], cliente = null) {
  const fases = estado.eu.conta.fases;
  const cli = escolherCliente({ obrig: false, rotulo: 'Cliente (se já existir)', inicial: cliente || (l.cliente ? { id: l.cliente, nome: l.contacto || 'Cliente' } : null),
    ajuda: 'Se ainda não é cliente, deixa vazio e preenche o contacto.' });
  return [
    campo({ nome: 'titulo', rotulo: 'O que está em jogo', valor: l.titulo, obrig: true, placeholder: 'Ex.: Fibra + TV para a pastelaria' }),
    cli,
    h('div', { class: 'duas' }, campo({ nome: 'contacto', rotulo: 'Pessoa de contacto', valor: l.contacto }), campo({ nome: 'empresa', rotulo: 'Empresa', valor: l.empresa })),
    h('div', { class: 'duas' }, campo({ nome: 'telefone', rotulo: 'Telefone', tipo: 'tel', inputmode: 'tel', valor: l.telefone }),
      campo({ nome: 'email', rotulo: 'E-mail', tipo: 'email', valor: l.email })),
    h('div', { class: 'duas' }, campo({ nome: 'valor', rotulo: 'Valor (€)', inputmode: 'decimal', valor: centParaTexto(l.valor), placeholder: '0,00' }),
      campo({ nome: 'fase', rotulo: 'Fase', tipo: 'select', valor: l.fase || fases.find((f) => f.tipo === 'aberta').id, opcoes: fases.map((f) => [f.id, f.nome]) })),
    h('div', { class: 'duas' }, campo({ nome: 'proximo', rotulo: 'Próximo passo', valor: l.proximo, placeholder: 'Ex.: enviar proposta' }),
      campo({ nome: 'proximo_quando', rotulo: 'Quando', tipo: 'datetime-local', valor: tsParaLocal(l.proximo_quando) })),
    h('div', { class: 'duas' }, campo({ nome: 'origem', rotulo: 'Origem', valor: l.origem, placeholder: 'Ex.: porta a porta, Instagram' }),
      estado.eu.perm.ambito !== 'meus' && eq.length > 1 ? campo({ nome: 'responsavel', rotulo: 'Responsável', tipo: 'select', valor: l.responsavel ?? estado.eu.id,
        opcoes: eq.filter((p) => p.ativo).map((p) => [p.id, p.nome]) }) : h('span')),
    campo({ nome: 'notas', rotulo: 'Notas', tipo: 'textarea', valor: l.notas, linhas: 3 }),
  ];
}

function preparar(d) {
  if (!d.cliente) d.cliente = null;
  if (d.responsavel) d.responsavel = Number(d.responsavel);
  if (!d.proximo_quando) d.proximo_quando = null;
  return d;
}

export async function novaLead({ cliente, depois } = {}) {
  const eq = await equipa();
  formFolha({ titulo: 'Nova lead', campos: camposLead({ contacto: cliente?.nome, telefone: cliente?.telefone, email: cliente?.email }, eq, cliente), larga: true, botao: 'Criar lead',
    enviar: async (d, form, f) => {
      const r = await post('/api/leads', preparar(d));
      f.fechar(); aviso('Lead criada: ' + r.lead.titulo, { carimbo: true, icone: 'leads' }); depois?.(r.lead);
    } });
}

async function editar(l, depois) {
  const eq = await equipa();
  const bApagar = pode('leads', 'a') ? h('button', { class: 'bt bt-perigo esq', type: 'button' }, icone('lixo'), 'Apagar') : null;
  const extra = [];
  if (bApagar) extra.push(bApagar);
  if (!l.cliente && pode('clientes', 'c')) extra.push(h('button', { class: 'bt esq', type: 'button', onclick: async () => {
    try { const r = await post('/api/leads/' + l.id + '/cliente'); aviso(r.existia ? 'Ligada à ficha que já existia.' : 'Ficha de cliente criada.', { carimbo: true }); ff.folha.fechar(); navegar('/app/clientes/' + r.cliente); } catch (e) { falhou(e); }
  } }, icone('clientes'), 'Criar ficha'));
  const ff = formFolha({ titulo: l.titulo, campos: camposLead(l, eq), larga: true, extraPe: extra,
    enviar: async (d, form, f) => { const r = await post('/api/leads/' + l.id, preparar(d)); f.fechar(); aviso('Lead guardada.'); depois(r.lead); } });
  bApagar?.addEventListener('click', async () => {
    if (!await confirmar({ titulo: 'Apagar esta lead?', texto: l.titulo, sim: 'Apagar', perigo: true })) return;
    try { await post('/api/leads/' + l.id + '/apagar'); ff.folha.fechar(); aviso('Lead apagada.'); depois(null); } catch (e) { falhou(e); }
  });
}

function quandoCurto(ts) {
  const d = Date.now() / 1000 - ts;
  if (d > 0) return d < 86400 ? relativo(ts) : d < 172800 ? 'ontem' : `há ${Math.round(d / 86400)} dias`;
  const f = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Lisbon' });
  return -d < 86400 * 2 ? relativo(ts) : f.format(new Date(ts * 1000)).replace(',', ' ·');
}

function moverPara(l, fases, aoMover) {
  const d = folha({ titulo: 'Mover para…', corpo: h('div', { class: 'grelha', style: 'gap:6px' }, fases.map((f) => h('button', {
    class: 'bt' + (f.id === l.fase ? ' bt-p' : ''), type: 'button', style: 'justify-content:flex-start', 'aria-current': f.id === l.fase ? 'true' : null,
    onclick: () => { d.fechar(); if (f.id !== l.fase) aoMover(l, f.id); } }, f.nome))) });
}

export async function mostrar(raiz) {
  equipaCache = null;
  let dados;
  const filtros = { q: '', responsavel: '' };
  const quadro = h('div');
  const resumo = h('p', { class: 'sub' });
  const carregar = async () => {
    const qs = new URLSearchParams(Object.entries(filtros).filter(([, v]) => v));
    dados = await get('/api/leads?' + qs);
    desenhar();
  };
  const mover = async (l, fase, ordem) => {
    const antes = l.fase;
    l.fase = fase; desenhar();                     // mostra logo; volta atrás se o servidor recusar
    try {
      const r = await post('/api/leads/' + l.id + '/fase', { fase, ordem });
      Object.assign(l, r.lead);
      if (r.tipo === 'ganho') aviso('Negócio ganho: ' + l.titulo + ' · ' + euros(l.valor), { carimbo: true, icone: 'ganho' });
      desenhar();
    } catch (e) { l.fase = antes; desenhar(); falhou(e); }
  };
  const desenhar = () => {
    const fases = dados.fases;
    const abertas = dados.leads.filter((l) => fases.find((f) => f.id === l.fase)?.tipo === 'aberta');
    resumo.textContent = `${num(abertas.length)} em aberto · ${euros(abertas.reduce((s, l) => s + l.valor, 0))}`;
    if (!dados.leads.length && !filtros.q) {
      quadro.replaceChildren(vazio({ titulo: 'Ainda não tens leads', icone: 'leads',
        texto: 'Uma lead é uma venda possível: quem pediu um orçamento, um contacto da feira, uma empresa a visitar. Acompanha-as por fases até ganhares ou perderes.',
        acao: pode('leads', 'c') ? h('button', { class: 'bt bt-p', type: 'button', onclick: () => novaLead({ depois: carregar }) }, 'Criar lead') : null }));
      return;
    }
    const podeMover = pode('leads', 'e');
    const colunas = fases.map((f) => {
      const ls = dados.leads.filter((l) => l.fase === f.id).sort((a, b) => a.ordem - b.ordem);
      const total = ls.reduce((s, l) => s + l.valor, 0);
      const col = h('section', { class: 'coluna', 'aria-label': f.nome, dados: { fase: f.id } },
        h('header', null, h('h2', null, f.nome), h('span', null, `${ls.length} · ${euros(total)}`)),
        ls.map((l) => {
          const cart = h('article', { class: 'cartao', draggable: podeMover ? 'true' : null, tabindex: '0', dados: { id: l.id } },
            h('span', { class: 't' }, l.titulo),
            l.contacto || l.empresa ? h('span', { class: 's' }, [l.contacto, l.empresa].filter(Boolean).join(' · ')) : null,
            h('span', { class: 'v' }, euros(l.valor)),
            h('span', { class: 'pe' },
              l.proximo_quando && f.tipo === 'aberta' ? h('span', { class: 'quando' + (l.proximo_quando * 1000 < Date.now() ? ' atrasado' : ''), title: l.proximo || '' },
                icone('relogio'), quandoCurto(l.proximo_quando)) : h('span', null, l.responsavel_nome || ''),
              podeMover ? h('button', { class: 'mover', type: 'button', 'aria-label': 'Mover «' + l.titulo + '» para outra fase', onclick: (e) => { e.stopPropagation(); moverPara(l, fases, (x, fase) => mover(x, fase)); } }, 'Mover') : null));
          cart.addEventListener('click', () => pode('leads', 'e') && editar(l, () => carregar()));
          cart.addEventListener('keydown', (e) => { if (e.key === 'Enter') cart.click(); });
          cart.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', l.id); e.dataTransfer.effectAllowed = 'move'; cart.classList.add('arrasta'); });
          cart.addEventListener('dragend', () => cart.classList.remove('arrasta'));
          return cart;
        }));
      if (podeMover) {
        col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('alvo'); });
        col.addEventListener('dragleave', (e) => { if (!col.contains(e.relatedTarget)) col.classList.remove('alvo'); });
        col.addEventListener('drop', (e) => {
          e.preventDefault(); col.classList.remove('alvo');
          const l = dados.leads.find((x) => x.id === e.dataTransfer.getData('text/plain'));
          if (!l) return;
          // posição: antes do cartão por baixo do rato
          const cartoes = [...col.querySelectorAll('.cartao')].filter((c) => c.dataset.id !== l.id);
          const depois = cartoes.find((c) => e.clientY < c.getBoundingClientRect().top + c.offsetHeight / 2);
          const ord = (id) => dados.leads.find((x) => x.id === id)?.ordem ?? 0;
          let ordem;
          if (!cartoes.length) ordem = 0;
          else if (!depois) ordem = ord(cartoes[cartoes.length - 1].dataset.id) + 1;
          else { const i = cartoes.indexOf(depois); ordem = i === 0 ? ord(depois.dataset.id) - 1 : (ord(cartoes[i - 1].dataset.id) + ord(depois.dataset.id)) / 2; }
          if (l.fase === f.id && Math.abs(l.ordem - ordem) < 1e-9) return;
          l.ordem = ordem;
          mover(l, f.id, ordem);
        });
      }
      return col;
    });
    const kb = h('div', { class: 'kanban' }, colunas);
    quadro.replaceChildren(kb);
    const marcar = () => kb.classList.toggle('corta', kb.scrollWidth - kb.clientWidth - kb.scrollLeft > 8);
    kb.addEventListener('scroll', marcar, { passive: true });
    requestAnimationFrame(marcar);
  };
  const inpQ = h('input', { class: 'entrada', type: 'search', placeholder: 'Procurar leads', 'aria-label': 'Procurar leads' });
  inpQ.addEventListener('input', debounce(() => { filtros.q = inpQ.value.trim(); carregar().catch(falhou); }));
  const acoes = [];
  if (podeX('exportar')) acoes.push(h('button', { class: 'bt', type: 'button', onclick: () => descarregar('/api/exportar/leads.csv').catch(falhou) }, icone('descarregar'), 'Exportar'));
  if (podeX('definicoes')) acoes.push(ligacao('/app/definicoes/fases', { class: 'bt' }, icone('definicoes'), 'Fases'));
  if (pode('leads', 'c')) acoes.push(h('button', { class: 'bt bt-p', type: 'button', onclick: () => novaLead({ depois: carregar }) }, icone('mais'), 'Nova lead'));
  const eq = await equipa();
  const selResp = estado.eu.perm.ambito !== 'meus' && eq.length > 1 ? h('select', { class: 'entrada', style: 'width:auto', 'aria-label': 'Responsável',
    onchange: (e) => { filtros.responsavel = e.target.value; carregar().catch(falhou); } }, h('option', { value: '' }, 'Toda a equipa'), eq.filter((p) => p.ativo).map((p) => h('option', { value: p.id }, p.nome))) : null;
  raiz.replaceChildren(
    h('header', { class: 'cabeca' }, h('div', null, h('h1', null, 'Leads'), resumo), h('div', { class: 'acoes' }, acoes)),
    h('div', { class: 'barra-filtros' }, h('div', { class: 'pesquisa' }, icone('procurar'), inpQ), selResp),
    quadro);
  await carregar();
}
