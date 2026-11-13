// webase — pontos e recompensas: o cartão de carimbos sem papel.
import { estado, h, icone, get, post, euros, num, relativo, ligacao, campo, formFolha, folha, aviso, falhou, pode, podeX, vazio,
  escolherCliente, carimbo, lerForm, mostrarErro, limparErros, aGuardar } from './nucleo.js';

export async function darPontos({ cliente, depois } = {}) {
  let info;
  try { info = await get('/api/pontos'); } catch (e) { return falhou(e); }
  let modo = 'compra';
  const recs = info.recompensas.filter((r) => r.ativa);
  const zona = h('div', { class: 'grelha' });
  const sep = h('div', { class: 'separadores', role: 'tablist' });
  const form = h('form', { novalidate: true, class: 'grelha' });
  const cli = escolherCliente({ inicial: cliente });
  const bOk = h('button', { class: 'bt bt-p', type: 'submit' }, 'Guardar');
  const desenhar = () => {
    sep.replaceChildren(...[['compra', 'Compra'], ['resgate', 'Trocar prémio'], pode('pontos', 'e') ? ['ajuste', 'Acertar'] : null].filter(Boolean).map(([v, t]) =>
      h('button', { type: 'button', role: 'tab', 'aria-selected': String(modo === v), onclick: () => { modo = v; desenhar(); } }, t)));
    let campos;
    if (modo === 'compra') {
      const valor = campo({ nome: 'valor', rotulo: 'Valor da compra (€)', inputmode: 'decimal', obrig: true, placeholder: '0,00' });
      const prev = h('p', { class: 'nota-suave', 'aria-live': 'polite' }, `${info.pontos_euro} ${info.pontos_euro === 1 ? 'ponto' : 'pontos'} por cada euro.`);
      valor.querySelector('input').addEventListener('input', (e) => {
        const v = Number(String(e.target.value).replace(',', '.'));
        prev.textContent = v > 0 ? `Vai ganhar ${num(Math.floor(v * info.pontos_euro))} pontos.` : `${info.pontos_euro} pontos por cada euro.`;
      });
      campos = [valor, prev, campo({ nome: 'descricao', rotulo: 'Descrição (opcional)', placeholder: 'Ex.: corte + barba' })];
      bOk.textContent = 'Dar pontos';
    } else if (modo === 'resgate') {
      campos = recs.length ? [campo({ nome: 'recompensa', rotulo: 'Prémio', tipo: 'select', opcoes: recs.map((r) => [r.id, `${r.nome} — ${num(r.custo)} pontos`]) })]
        : [h('p', { class: 'nota-suave' }, 'Ainda não criaste prémios. Cria-os na página de Pontos (ex.: «Corte grátis — 100 pontos»).')];
      bOk.textContent = 'Trocar';
    } else {
      campos = [campo({ nome: 'pontos', rotulo: 'Pontos a dar (ou a tirar, com −)', inputmode: 'numeric', obrig: true, placeholder: 'Ex.: 50 ou -20' }),
        campo({ nome: 'descricao', rotulo: 'Porquê', obrig: true, placeholder: 'Ex.: oferta de aniversário' })];
      bOk.textContent = 'Acertar';
    }
    form.replaceChildren(cli, ...campos);
  };
  zona.append(sep, form);
  const bNao = h('button', { class: 'bt', type: 'button' }, 'Cancelar');
  const d = folha({ titulo: 'Pontos', corpo: zona, pe: [bNao, bOk] });
  bNao.addEventListener('click', () => d.fechar());
  bOk.setAttribute('form', form.id = 'fp' + Date.now());
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); limparErros(form);
    const dados = lerForm(form);
    dados.tipo = modo;
    if (modo === 'ajuste') dados.pontos = Number(String(dados.pontos).replace('−', '-'));
    try {
      const r = await aGuardar(bOk, () => post('/api/pontos/movimento', dados));
      d.fechar();
      aviso(r.delta >= 0 ? `+${num(r.delta)} pontos · saldo ${num(r.pontos)}` : `${num(r.delta)} pontos · saldo ${num(r.pontos)}`, { carimbo: true, icone: 'pontos' });
      window.estat?.('pontos', modo);
      depois?.(r);
    } catch (er) { mostrarErro(form, er); }
  });
  desenhar();
}

function recompensa(r, depois) {
  formFolha({ titulo: r ? 'Editar prémio' : 'Novo prémio', botao: r ? 'Guardar' : 'Criar prémio', campos: [
    campo({ nome: 'nome', rotulo: 'Prémio', valor: r?.nome, obrig: true, placeholder: 'Ex.: Café grátis' }),
    campo({ nome: 'custo', rotulo: 'Custa (pontos)', valor: r?.custo, inputmode: 'numeric', obrig: true }),
  ], extraPe: r ? [h('button', { class: 'bt esq', type: 'button', onclick: async (e) => {
    try { await post('/api/recompensas/' + r.id, { ativa: !r.ativa }); aviso(r.ativa ? 'Prémio escondido.' : 'Prémio ativo.'); e.target.closest('dialog').fechar(); depois(); } catch (er) { falhou(er); }
  } }, r.ativa ? 'Esconder' : 'Voltar a mostrar')] : [],
  enviar: async (d, form, f) => {
    d.custo = Number(d.custo);
    if (r) await post('/api/recompensas/' + r.id, d); else await post('/api/recompensas', d);
    f.fechar(); aviso('Prémio guardado.'); depois();
  } });
}

export async function mostrar(raiz) {
  const params = new URLSearchParams(location.search);
  const carregar = async () => {
    const r = await get('/api/pontos');
    const acoes = [];
    if (pode('pontos', 'c')) acoes.push(h('button', { class: 'bt bt-p', type: 'button', onclick: () => darPontos({ depois: carregar }) }, icone('pontos'), 'Dar pontos'));
    const podeEditar = pode('pontos', 'e');
    raiz.replaceChildren(
      h('header', { class: 'cabeca' }, h('div', null, h('h1', null, 'Pontos'), h('p', { class: 'sub' }, `${r.pontos_euro} ${r.pontos_euro === 1 ? 'ponto' : 'pontos'} por cada euro gasto`,
        podeX('definicoes') ? [' · ', ligacao('/app/definicoes/pontos', { class: 'ligacao' }, 'mudar')] : null)), h('div', { class: 'acoes' }, acoes)),
      h('div', { class: 'numeros' },
        h('div', { class: 'numero' }, h('span', { class: 'r' }, 'Pontos dados'), h('span', { class: 'n' }, num(r.resumo.dados)), h('span', { class: 'd' }, 'últimos 30 dias')),
        h('div', { class: 'numero' }, h('span', { class: 'r' }, 'Trocados por prémios'), h('span', { class: 'n' }, num(r.resumo.trocados)), h('span', { class: 'd' }, 'últimos 30 dias')),
        h('div', { class: 'numero' }, h('span', { class: 'r' }, 'Clientes com pontos'), h('span', { class: 'n' }, num(r.resumo.clientes)), h('span', { class: 'd' }, 'com movimentos em 30 dias')),
        h('div', { class: 'numero' }, h('span', { class: 'r' }, 'Prémios ativos'), h('span', { class: 'n' }, num(r.recompensas.filter((x) => x.ativa).length)))),
      h('div', { class: 'grelha lado' },
        h('section', { class: 'ficha' }, h('header', null, h('h2', null, 'Últimos movimentos')),
          r.movimentos.length ? h('div', { class: 'lista' }, r.movimentos.map((m) => ligacao('/app/clientes/' + m.cliente, { class: 'linha' },
            h('span', { class: 'icone-linha' + (m.delta > 0 ? ' acento' : '') }, icone(m.motivo === 'resgate' ? 'presente' : 'pontos')),
            h('span', { class: 'principal-l' }, h('span', { class: 't' }, m.cliente_nome), h('span', { class: 's' }, [m.descricao, relativo(m.quando), m.quem].filter(Boolean).join(' · '))),
            h('strong', { style: 'white-space:nowrap' }, (m.delta > 0 ? '+' : '') + num(m.delta)))))
            : vazio({ titulo: 'Ainda sem pontos', icone: 'pontos', texto: 'Cada compra dá pontos ao cliente. Quando junta pontos suficientes, troca por um prémio. Sem cartões de papel a perder-se.',
              acao: pode('pontos', 'c') ? h('button', { class: 'bt bt-p', type: 'button', onclick: () => darPontos({ depois: carregar }) }, 'Dar os primeiros pontos') : null })),
        h('div', { class: 'grelha' },
          h('section', { class: 'ficha' }, h('header', null, h('h2', null, 'Prémios'), podeEditar ? h('button', { class: 'ligacao', type: 'button', onclick: () => recompensa(null, carregar) }, 'Novo prémio') : null),
            r.recompensas.length ? h('div', { class: 'lista' }, r.recompensas.map((x) => h('button', { class: 'linha', type: 'button', disabled: !podeEditar, onclick: () => recompensa(x, carregar) },
              carimbo('presente', false), h('span', { class: 'principal-l' }, h('span', { class: 't' }, x.nome), h('span', { class: 's' }, x.ativa ? 'Ativo' : 'Escondido')),
              h('strong', null, num(x.custo), ' pts'))))
              : h('p', { style: 'color:var(--tinta2)' }, 'Cria prémios para os clientes trocarem os pontos (ex.: «Café grátis — 50 pontos»).')),
          r.top.length ? h('section', { class: 'ficha' }, h('header', null, h('h2', null, 'Quem tem mais pontos')),
            h('div', { class: 'lista' }, r.top.map((c) => ligacao('/app/clientes/' + c.id, { class: 'linha' },
              h('span', { class: 'principal-l' }, h('span', { class: 't' }, c.nome), h('span', { class: 's' }, 'Gastou ' + euros(c.gasto))), h('strong', null, num(c.pontos)))))) : null)));
  };
  await carregar();
  if (params.get('dar') && pode('pontos', 'c')) { history.replaceState(null, '', '/app/pontos'); darPontos({ depois: carregar }); }
}
