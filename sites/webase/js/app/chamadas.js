// webase — chamadas recebidas e feitas, com cronómetro, resultado, notas e quem ligar a seguir.
import { estado, h, icone, get, post, num, relativo, dataHora, ligacao, campo, formFolha, aviso, falhou, confirmar, pode, podeX,
  vazio, debounce, descarregar, escolherCliente, agoraLocal, tsParaLocal, minutos, navegar, telefone } from './nucleo.js';
import { botaoLigar } from './ligar.js';

const RES = { atendida: 'Atendida', nao_atendida: 'Não atendida', ocupado: 'Ocupado', voicemail: 'Caixa de correio', venda: 'Venda',
  ligar_depois: 'Ligar depois', sem_interesse: 'Sem interesse', errado: 'Número errado' };

function cronometro(inputDur) {
  let inicio = null; let t = null;
  const mostrador = h('span', { class: 'contagem-tempo', 'aria-live': 'off' }, '0:00');
  const b = h('button', { class: 'bt', type: 'button' }, icone('relogio'), 'Começar a contar');
  const pintar = (s) => { mostrador.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  b.addEventListener('click', () => {
    if (inicio) {
      clearInterval(t); const s = Math.round((Date.now() - inicio) / 1000); inicio = null;
      inputDur.value = String(s); b.replaceChildren(icone('relogio'), 'Começar a contar'); pintar(s);
    } else {
      inicio = Date.now(); b.replaceChildren(icone('certo'), 'Parar');
      t = setInterval(() => pintar(Math.round((Date.now() - inicio) / 1000)), 500);
    }
  });
  return h('div', { style: 'display:flex;align-items:center;gap:16px;flex-wrap:wrap' }, b, mostrador);
}

export function registarChamada({ cliente, numero, depois, chamada } = {}) {
  const c = chamada || {};
  const durInput = h('input', { type: 'hidden', name: 'duracao', value: c.duracao || 0 });
  const cli = escolherCliente({ obrig: false, rotulo: 'Cliente', inicial: cliente || (c.cliente ? { id: c.cliente, nome: c.nome } : null),
    ajuda: 'Se o número for de um cliente teu, liga-se sozinho.' });
  const campos = [
    h('fieldset', { class: 'campo', style: 'border:0;padding:0;margin:0', dados: { campo: 'direcao' } },
      h('legend', { class: 'rotulo', style: 'margin-bottom:6px' }, 'A chamada foi'),
      h('div', { class: 'separadores', role: 'radiogroup' }, [['saida', 'Feita por mim'], ['entrada', 'Recebida']].map(([v, t]) => {
        const inp = h('input', { type: 'radio', name: 'direcao', value: v, checked: (c.direcao || 'saida') === v, class: 'so-leitor', id: 'dir-' + v });
        const lab = h('label', { for: 'dir-' + v, class: 'bt bt-pq' + ((c.direcao || 'saida') === v ? ' bt-p' : '') }, t);
        inp.addEventListener('change', () => lab.parentElement.parentElement.querySelectorAll('label').forEach((l) => l.classList.toggle('bt-p', l.htmlFor === inp.id)));
        return h('span', null, inp, lab);
      }))),
    cli,
    h('div', { class: 'duas' }, campo({ nome: 'numero', rotulo: 'Número', tipo: 'tel', inputmode: 'tel', valor: c.numero || numero || cliente?.telefone || '' }),
      campo({ nome: 'nome', rotulo: 'Nome (se não é cliente)', valor: c.cliente ? '' : (c.nome || '') })),
    campo({ nome: 'resultado', rotulo: 'Resultado', tipo: 'select', valor: c.resultado || 'atendida', opcoes: Object.entries(RES) }),
    durInput,
    c.id ? campo({ nome: 'duracao_txt', rotulo: 'Duração (minutos)', inputmode: 'numeric', valor: c.duracao ? Math.round(c.duracao / 60) : '' }) : cronometro(durInput),
    campo({ nome: 'notas', rotulo: 'Notas', tipo: 'textarea', valor: c.notas, linhas: 3, placeholder: 'O que ficou combinado' }),
    h('div', { class: 'duas' }, campo({ nome: 'quando', rotulo: 'Quando foi', tipo: 'datetime-local', valor: c.quando ? tsParaLocal(c.quando) : agoraLocal() }),
      campo({ nome: 'seguimento', rotulo: 'Voltar a ligar em', tipo: 'datetime-local', valor: tsParaLocal(c.seguimento), ajuda: 'Aparece no início nesse dia.' })),
  ];
  formFolha({ titulo: c.id ? 'Editar chamada' : 'Registar chamada', campos, botao: 'Guardar chamada', larga: true,
    enviar: async (d, form, f) => {
      if (!d.cliente) d.cliente = null;
      if (!d.seguimento) d.seguimento = null;
      if ('duracao_txt' in d) { d.duracao = Math.round(Number(String(d.duracao_txt).replace(',', '.') || 0) * 60); delete d.duracao_txt; }
      else d.duracao = Number(d.duracao || 0);
      const r = c.id ? await post('/api/chamadas/' + c.id, d) : await post('/api/chamadas', d);
      f.fechar(); aviso(c.id ? 'Chamada guardada.' : 'Chamada registada.', { carimbo: !c.id, icone: 'chamadas' }); depois?.(r.chamada);
    } });
}

export async function mostrar(raiz) {
  const params = new URLSearchParams(location.search);
  const filtros = { vista: params.get('vista') || 'todas', q: '', pagina: 1 };
  const corpo = h('div');
  const numeros = h('div', { class: 'numeros' });
  const sep = h('div', { class: 'separadores', role: 'tablist', 'aria-label': 'Ver chamadas' });
  const carregar = async () => {
    const r = await get('/api/chamadas?' + new URLSearchParams(Object.entries(filtros).filter(([, v]) => v)));
    const hj = r.hoje;
    numeros.replaceChildren(
      h('div', { class: 'numero' }, h('span', { class: 'r' }, 'Hoje'), h('span', { class: 'n' }, num(hj.total)), h('span', { class: 'd' }, `${hj.entrada} ${hj.entrada === 1 ? 'recebida' : 'recebidas'} · ${hj.saida} ${hj.saida === 1 ? 'feita' : 'feitas'}`)),
      h('div', { class: 'numero' }, h('span', { class: 'r' }, 'Atendidas hoje'), h('span', { class: 'n' }, hj.total ? Math.round(hj.atendidas / hj.total * 100) + '%' : '—'), h('span', { class: 'd' }, `${hj.atendidas} de ${hj.total}`)),
      h('div', { class: 'numero' }, h('span', { class: 'r' }, 'Tempo ao telefone'), h('span', { class: 'n' }, Math.round(hj.duracao / 60) + ' min'), h('span', { class: 'd' }, 'hoje')),
      h('button', { class: 'numero', type: 'button', style: 'border:0;text-align:left;cursor:pointer', onclick: () => { filtros.vista = 'seguimentos'; filtros.pagina = 1; carregar().catch(falhou); } },
        h('span', { class: 'r' }, 'Para ligar'), h('span', { class: 'n' + (hj.seguimentos ? ' acento-texto' : '') }, num(hj.seguimentos)), h('span', { class: 'd' }, 'até ao fim do dia')));
    sep.replaceChildren(...[['todas', 'Todas'], ['saida', 'Feitas'], ['entrada', 'Recebidas'], ['seguimentos', 'Para ligar']].map(([v, t]) =>
      h('button', { type: 'button', role: 'tab', 'aria-selected': String(filtros.vista === v), onclick: () => { filtros.vista = v; filtros.pagina = 1; carregar().catch(falhou); } }, t)));
    if (!r.itens.length) {
      corpo.replaceChildren(filtros.vista === 'todas' && !filtros.q ? vazio({ titulo: 'Ainda não registaste chamadas', icone: 'chamadas',
        texto: 'Regista as chamadas que fazes e recebes: fica o histórico em cada cliente e sabes a quem voltar a ligar.',
        acao: pode('chamadas', 'c') ? h('button', { class: 'bt bt-p', type: 'button', onclick: () => registarChamada({ depois: carregar }) }, 'Registar chamada') : null })
        : h('p', { style: 'padding:20px 4px;color:var(--tinta2)' }, filtros.vista === 'seguimentos' ? 'Não tens chamadas por fazer.' : 'Sem chamadas aqui.'));
      return;
    }
    const MAUS = ['nao_atendida', 'ocupado', 'errado', 'sem_interesse'];
    const linhas = r.itens.map((x) => {
      const seg = filtros.vista === 'seguimentos';
      const abrir = () => pode('chamadas', 'e') && registarChamada({ chamada: x, depois: carregar });
      return h('div', { class: 'linha' },
        h('span', { class: 'icone-linha' + (seg ? ' acento' : '') }, icone(seg ? 'relogio' : x.direcao === 'entrada' ? 'entra' : 'sai_')),
        h('button', { class: 'principal-l', type: 'button', style: 'border:0;background:none;text-align:left;padding:0;min-width:0;min-height:44px', onclick: abrir },
          h('span', { style: 'display:flex;gap:8px;align-items:baseline;justify-content:space-between' },
            h('span', { class: 't' }, x.nome || telefone(x.numero) || 'Sem nome'),
            h('span', { class: 'quando-d' }, seg ? relativo(x.seguimento) : relativo(x.quando))),
          h('span', { class: 's duas-l' }, seg ? (x.notas || 'Voltar a ligar') :
            [h('span', { class: MAUS.includes(x.resultado) ? 'res-mau' : '' }, RES[x.resultado]), x.duracao ? ' · ' + minutos(x.duracao) : '', x.quem ? ' · ' + x.quem : '', x.notas ? ' · ' + x.notas : ''])),
        x.cliente ? ligacao('/app/clientes/' + x.cliente, { class: 'bt bt-pq bt-limpo so-pc-flex' }, 'Ficha') : null,
        x.numero ? botaoLigar({ numero: x.numero, nome: x.nome, cliente: x.cliente, classe: 'bt bt-icone', soIcone: true, depois: carregar,
          aoLigar: () => { if (seg) setTimeout(() => registarChamada({ cliente: x.cliente ? { id: x.cliente, nome: x.nome } : null, numero: x.numero, depois: carregar }), 400); } }) : null,
        seg && pode('chamadas', 'e') ? h('button', { class: 'bt bt-icone', type: 'button', 'aria-label': 'Marcar como feito', onclick: async () => {
          try { await post('/api/chamadas/' + x.id + '/feito'); aviso('Feito.'); carregar(); } catch (e) { falhou(e); }
        } }, icone('certo')) : null);
    });
    const paginas = Math.ceil(r.total / r.por_pagina);
    corpo.replaceChildren(h('div', { class: 'ficha', style: 'padding:6px 14px' }, h('div', { class: 'lista' }, linhas),
      paginas > 1 ? h('div', { class: 'paginacao' },
        h('button', { class: 'bt bt-pq', type: 'button', disabled: filtros.pagina <= 1, onclick: () => { filtros.pagina--; carregar(); } }, 'Anterior'),
        h('span', null, `Página ${filtros.pagina} de ${paginas}`),
        h('button', { class: 'bt bt-pq', type: 'button', disabled: filtros.pagina >= paginas, onclick: () => { filtros.pagina++; carregar(); } }, 'Seguinte')) : null));
  };
  const inpQ = h('input', { class: 'entrada', type: 'search', placeholder: 'Procurar por nome, número ou notas', 'aria-label': 'Procurar chamadas' });
  inpQ.addEventListener('input', debounce(() => { filtros.q = inpQ.value.trim(); filtros.pagina = 1; carregar().catch(falhou); }));
  const acoes = [];
  if (podeX('exportar')) acoes.push(h('button', { class: 'bt', type: 'button', onclick: () => descarregar('/api/exportar/chamadas.csv').catch(falhou) }, icone('descarregar'), 'Exportar'));
  if (pode('chamadas', 'c')) acoes.push(h('button', { class: 'bt bt-p', type: 'button', onclick: () => registarChamada({ depois: carregar }) }, icone('mais'), 'Registar chamada'));
  raiz.replaceChildren(
    h('header', { class: 'cabeca' }, h('div', null, h('h1', null, 'Chamadas'), h('p', { class: 'sub' }, 'Recebidas, feitas e por fazer')), h('div', { class: 'acoes' }, acoes)),
    numeros, h('div', { class: 'barra-filtros' }, sep, h('div', { class: 'pesquisa' }, icone('procurar'), inpQ)), corpo);
  await carregar();
  if (params.get('nova') && pode('chamadas', 'c')) { history.replaceState(null, '', '/app/chamadas'); registarChamada({ depois: carregar }); }
}
