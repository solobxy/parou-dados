// webase — início: o que há para fazer hoje e os números do negócio.
import { estado, h, icone, get, euros, num, plural, relativo, ligacao, ligado, pode, podeX, data, dataIso, carimbo, avatar } from './nucleo.js';
import { novoCliente } from './clientes.js';

const ICONE_TIPO = { aniversario: 'presente', seguimento: 'chamadas', lead: 'leads', contrato: 'contratos', renovacao: 'adesoes' };

function saudacao() {
  const hr = Number(new Intl.DateTimeFormat('pt-PT', { hour: 'numeric', hour12: false, timeZone: 'Europe/Lisbon' }).format(new Date()));
  return hr < 6 ? 'Boa noite' : hr < 13 ? 'Bom dia' : hr < 20 ? 'Boa tarde' : 'Boa noite';
}

export async function mostrar(raiz) {
  const p = await get('/api/painel');
  const eu = estado.eu;
  const numeros = [];
  if (p.clientes) numeros.push(ligacao('/app/clientes', { class: 'numero' }, h('span', { class: 'r' }, 'Clientes'),
    h('span', { class: 'n' }, num(p.clientes.total)), h('span', { class: 'd' }, `+${num(p.clientes.novos_mes)} este mês`)));
  if (p.leads) numeros.push(ligacao('/app/leads', { class: 'numero' }, h('span', { class: 'r' }, 'Em aberto'),
    h('span', { class: 'n' }, euros(p.leads.valor)), h('span', { class: 'd' }, plural(p.leads.abertas, 'oportunidade', 'oportunidades'))));
  if (p.leads) numeros.push(ligacao('/app/leads', { class: 'numero' }, h('span', { class: 'r' }, 'Ganho este mês'),
    h('span', { class: 'n' }, euros(p.leads.ganho_valor)), h('span', { class: 'd' }, plural(p.leads.ganhos_mes, 'negócio', 'negócios'))));
  if (p.chamadas) numeros.push(ligacao('/app/chamadas', { class: 'numero' }, h('span', { class: 'r' }, 'Chamadas hoje'),
    h('span', { class: 'n' }, num(p.chamadas.entrada + p.chamadas.saida)), h('span', { class: 'd' }, `${plural(p.chamadas.entrada, 'recebida', 'recebidas')} · ${plural(p.chamadas.saida, 'feita', 'feitas')}`)));
  if (p.adesoes) numeros.push(ligacao('/app/subscricoes', { class: 'numero' }, h('span', { class: 'r' }, 'Mensalidades'),
    h('span', { class: 'n' }, euros(p.adesoes.mensal)), h('span', { class: 'd' }, `${plural(p.adesoes.ativas, 'ativa', 'ativas')}${p.adesoes.em_atraso ? ` · ${p.adesoes.em_atraso} em atraso` : ''}`)));
  if (p.contratos) numeros.push(ligacao('/app/contratos', { class: 'numero' }, h('span', { class: 'r' }, 'Contratos por mês'),
    h('span', { class: 'n' }, euros(p.contratos.mensal)), h('span', { class: 'd' }, `${plural(p.contratos.ativos, 'ativo', 'ativos')}${p.contratos.a_terminar ? ` · ${p.contratos.a_terminar} a terminar` : ''}`)));
  if (p.pontos) numeros.push(ligacao('/app/pontos', { class: 'numero' }, h('span', { class: 'r' }, 'Pontos (30 dias)'),
    h('span', { class: 'n' }, num(p.pontos.dados)), h('span', { class: 'd' }, `${num(p.pontos.trocados)} ${p.pontos.trocados === 1 ? 'trocado' : 'trocados'} por prémios`)));

  const hoje = p.hoje.map((x) => {
    const destino = x.cliente ? '/app/clientes/' + x.cliente : x.lead ? '/app/leads' : x.chamada ? '/app/chamadas?vista=seguimentos' : '/app';
    const quando = x.data ? dataIso(x.data) : x.quando ? relativo(x.quando) : '';
    return ligacao(destino, { class: 'linha' },
      h('span', { class: 'icone-linha' + (x.tipo === 'aniversario' ? ' acento' : '') }, icone(ICONE_TIPO[x.tipo] || 'sino')),
      h('span', { class: 'principal-l' }, h('span', { class: 't' }, x.texto),
        quando ? h('span', { class: 's' }, x.atrasado ? h('span', { class: 'estado mau' }, 'Atrasado · ' + quando) : quando) : null),
      icone('seta', { width: 16, height: 16 }));
  });

  const acoes = [];
  if (pode('clientes', 'c')) acoes.push(h('button', { class: 'bt bt-p', type: 'button', onclick: () => novoCliente() }, icone('mais'), 'Novo cliente'));
  if (pode('chamadas', 'c')) acoes.push(ligacao('/app/chamadas?nova=1', { class: 'bt' }, icone('chamadas'), 'Registar chamada'));
  if (pode('pontos', 'c')) acoes.push(ligacao('/app/pontos?dar=1', { class: 'bt' }, icone('pontos'), 'Dar pontos'));

  const semanas = p.clientes?.semanas || [];
  const max = Math.max(1, ...semanas);
  const grafico = p.clientes ? h('section', { class: 'ficha' },
    h('header', null, h('h2', null, 'Clientes novos por semana')),
    h('div', { class: 'barras', role: 'img', 'aria-label': 'Clientes novos por semana: ' + semanas.join(', ') },
      semanas.map((n) => h('span', { style: `height:${Math.max(4, Math.round(n / max * 100))}%`, title: n + ' clientes' }))),
    h('p', { style: 'color:var(--tinta2);font-size:13px;margin-top:8px' }, `Últimas 12 semanas · ${num(semanas[semanas.length - 1] || 0)} esta semana`)) : null;

  const funil = p.leads && p.leads.por_fase.length ? h('section', { class: 'ficha' },
    h('header', null, h('h2', null, 'Funil'), ligacao('/app/leads', { class: 'ligacao ligacao-toque' }, 'Ver leads')),
    h('div', { class: 'lista' }, p.leads.por_fase.map((f) => h('div', { class: 'linha', style: 'min-height:44px' },
      h('span', { class: 'principal-l' }, f.nome), h('strong', null, num(f.n)))))) : null;

  const recentes = p.recentes && p.recentes.length ? h('section', { class: 'ficha' },
    h('header', null, h('h2', null, 'Últimos movimentos')),
    h('div', { class: 'lista' }, p.recentes.map((a) => ligacao('/app/clientes/' + a.cliente, { class: 'linha' },
      avatar(a.cliente_nome), h('span', { class: 'principal-l' }, h('span', { class: 't' }, a.cliente_nome), h('span', { class: 's' }, a.texto)),
      h('span', { class: 'lado-d' }, relativo(a.quando)))))) : null;

  const primeiroUso = p.clientes && p.clientes.total === 0;
  raiz.replaceChildren(
    h('header', { class: 'cabeca' }, h('div', null, h('h1', null, `${saudacao()}, ${p.nome || eu.nome}`),
      h('p', { class: 'sub' }, new Intl.DateTimeFormat('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Lisbon' }).format(new Date()))),
      h('div', { class: 'acoes' }, acoes)),
    primeiroUso ? h('section', { class: 'ficha' }, h('div', { class: 'vazio', style: 'padding:8px 0' }, carimbo('clientes', false),
      h('h3', null, 'Começa pelos teus clientes'),
      h('p', null, podeX('importar') ? 'Cria a primeira ficha ou importa a lista que já tens (Excel ou CSV). Em poucos minutos tens a base pronta.'
        : 'Ainda não tens clientes teus. As fichas que criares ficam aqui, com o histórico de cada pessoa.'),
      h('div', { class: 'acoes-rapidas' }, pode('clientes', 'c') ? h('button', { class: 'bt bt-p', type: 'button', onclick: () => novoCliente() }, 'Criar ficha') : null,
        podeX('importar') ? ligacao('/app/clientes?importar=1', { class: 'bt' }, icone('enviar'), 'Importar contactos') : null))) : null,
    numeros.length && !primeiroUso ? h('div', { class: 'numeros', style: `--cols:${numeros.length <= 4 ? numeros.length : numeros.length <= 6 ? 3 : 4}` }, numeros) : null,
    h('div', { class: primeiroUso ? 'grelha' : 'grelha lado' },
      h('section', { class: 'ficha' }, h('header', null, h('h2', null, 'Para hoje')),
        hoje.length ? h('div', { class: 'lista' }, hoje) : h('p', { style: 'color:var(--tinta2)' }, 'Nada pendente para hoje. Aniversários, chamadas por fazer, renovações e contratos a terminar aparecem aqui.')),
      primeiroUso ? null : h('div', { class: 'grelha' }, grafico, funil)),
    recentes);
}
