// webase — fórum de quem usa a webase.
import { estado, h, icone, get, post, num, relativo, ligacao, navegar, campo, formFolha, aviso, falhou, pode, vazio, debounce,
  iniciais, confirmar, aGuardar } from './nucleo.js';

function autor(a) {
  if (!a) return h('span', { class: 'autor' }, 'Apagado');
  return h('span', { class: 'autor' }, a.logo ? h('img', { src: a.logo, alt: '' }) : h('span', { class: 'iniciais' }, iniciais(a.negocio || a.nome)),
    h('span', null, h('strong', null, a.nome), a.negocio ? ' · ' + a.negocio : '', a.equipa ? h('span', { class: 'equipa' }, ' · Equipa webase') : null));
}

function gosto(alvoUrl, g) {
  const b = h('button', { class: 'bt bt-pq bt-limpo', type: 'button', 'aria-pressed': String(g.gostei), 'aria-label': 'Gosto' },
    icone('gosto', g.gostei ? { fill: 'currentColor' } : {}), h('span', null, num(g.gostos)));
  b.addEventListener('click', async () => {
    try { const r = await post(alvoUrl, {}); b.replaceChildren(icone('gosto', r.gostei ? { fill: 'currentColor' } : {}), h('span', null, num(r.gostos))); b.setAttribute('aria-pressed', String(r.gostei)); }
    catch (e) { falhou(e); }
  });
  return b;
}

function denunciar(alvo) {
  formFolha({ titulo: 'Denunciar', botao: 'Enviar', campos: [campo({ nome: 'motivo', rotulo: 'O que está mal?', tipo: 'textarea', obrig: true, linhas: 3,
    placeholder: 'Ex.: publicidade enganosa, insultos, dados pessoais de alguém' })],
  enviar: async (d, form, f) => { await post('/api/forum/denunciar', { alvo, motivo: d.motivo }); f.fechar(); aviso('Obrigado. A equipa da webase vai ver.'); } });
}

function novoTopico(cats, inicial = {}, depois) {
  formFolha({ titulo: inicial.id ? 'Editar tópico' : 'Novo tópico', botao: inicial.id ? 'Guardar' : 'Publicar', larga: true, campos: [
    inicial.id ? null : campo({ nome: 'categoria', rotulo: 'Categoria', tipo: 'select', valor: 'perguntas', opcoes: cats.filter((c) => !c.so_equipa || estado.eu.admin).map((c) => [c.id, c.nome]) }),
    campo({ nome: 'titulo', rotulo: 'Título', obrig: true, valor: inicial.titulo, placeholder: 'Ex.: Como lidam com clientes que faltam à marcação?' }),
    campo({ nome: 'texto', rotulo: 'Texto', tipo: 'textarea', obrig: true, linhas: 8, valor: inicial.texto }),
    h('p', { class: 'ajuda', style: 'color:var(--tinta2);font-size:13px' }, 'O teu primeiro nome, a inicial do apelido e o nome do negócio ficam visíveis para quem usa a webase.'),
  ], enviar: async (d, form, f) => {
    const r = inicial.id ? await post('/api/forum/' + inicial.id + '/editar', d) : await post('/api/forum', d);
    f.fechar(); aviso(inicial.id ? 'Tópico guardado.' : 'Publicado.', { carimbo: !inicial.id, icone: 'forum' });
    depois ? depois() : navegar('/app/forum/' + r.topico.id);
  } });
}

async function topico(raiz, id) {
  const r = await get('/api/forum/' + id);
  const t = r.topico;
  const recarregar = () => topico(raiz, id);
  const caixa = h('form', { class: 'grelha', style: 'gap:8px' },
    h('label', { for: 'resp', class: 'rotulo' }, 'Responder'),
    h('textarea', { id: 'resp', class: 'entrada', rows: 4, maxlength: 5000, placeholder: 'Escreve a tua resposta' }),
    h('div', null, h('button', { class: 'bt bt-p', type: 'submit' }, 'Publicar resposta')));
  caixa.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ta = caixa.querySelector('textarea');
    if (!ta.value.trim()) return ta.focus();
    try { await aGuardar(caixa.querySelector('button'), () => post('/api/forum/' + id + '/responder', { texto: ta.value })); recarregar(); } catch (er) { falhou(er); }
  });
  const acoesT = [gosto('/api/forum/' + id + '/gosto', t)];
  if (t.pode_editar) acoesT.push(h('button', { class: 'bt bt-pq bt-limpo', type: 'button', onclick: () => novoTopico([], t, recarregar) }, 'Editar'));
  if (t.meu || r.admin) acoesT.push(h('button', { class: 'bt bt-pq bt-limpo bt-perigo', type: 'button', onclick: async () => {
    if (!await confirmar({ titulo: 'Apagar este tópico?', texto: t.titulo, sim: 'Apagar', perigo: true })) return;
    try { await post('/api/forum/' + id + '/apagar'); aviso('Tópico apagado.'); navegar('/app/forum', true); } catch (e) { falhou(e); }
  } }, 'Apagar'));
  if (r.admin) {
    acoesT.push(h('button', { class: 'bt bt-pq bt-limpo', type: 'button', onclick: async () => { await post('/api/forum/' + id + '/fixar').catch(falhou); recarregar(); } }, t.fixo ? 'Desafixar' : 'Fixar'));
    acoesT.push(h('button', { class: 'bt bt-pq bt-limpo', type: 'button', onclick: async () => { await post('/api/forum/' + id + '/fechar').catch(falhou); recarregar(); } }, t.fechado ? 'Reabrir' : 'Fechar'));
  }
  if (!t.meu) acoesT.push(h('button', { class: 'bt bt-pq bt-limpo', type: 'button', onclick: () => denunciar(t.id) }, 'Denunciar'));
  raiz.replaceChildren(
    ligacao('/app/forum', { class: 'voltar' }, icone('voltar'), 'Fórum'),
    h('article', { class: 'ficha grelha', style: 'gap:12px' },
      h('p', { class: 'ajuda', style: 'color:var(--tinta2);font-size:13px;font-weight:600' }, t.categoria_nome, t.fixo ? ' · Fixado' : '', t.fechado ? ' · Fechado' : ''),
      h('h1', { style: 'font-size:clamp(24px,3vw,32px)' }, t.titulo),
      h('div', { style: 'display:flex;gap:12px;flex-wrap:wrap;align-items:center' }, autor(t.autor), h('span', { class: 'ajuda', style: 'color:var(--tinta3);font-size:13px' }, relativo(t.criado), t.editado ? ' · editado' : '')),
      h('div', { class: 'texto-longo' }, t.texto),
      h('div', { style: 'display:flex;gap:4px;flex-wrap:wrap' }, acoesT)),
    h('section', { class: 'ficha' }, h('header', null, h('h2', null, `${num(r.respostas.filter((x) => !x.apagado).length)} respostas`)),
      r.respostas.map((x) => h('div', { class: 'resposta' },
        x.apagado ? h('p', { style: 'color:var(--tinta3);font-style:italic' }, 'Resposta apagada.') : [
          h('div', { style: 'display:flex;gap:12px;flex-wrap:wrap;align-items:center' }, autor(x.autor), h('span', { style: 'color:var(--tinta3);font-size:13px' }, relativo(x.criado), x.editado ? ' · editado' : '')),
          h('div', { class: 'texto-longo' }, x.texto),
          h('div', { style: 'display:flex;gap:4px;flex-wrap:wrap' }, gosto('/api/forum/r/' + x.id + '/gosto', x),
            x.meu || r.admin ? h('button', { class: 'bt bt-pq bt-limpo bt-perigo', type: 'button', onclick: async () => {
              if (!await confirmar({ titulo: 'Apagar esta resposta?', texto: x.texto.slice(0, 120), sim: 'Apagar', perigo: true })) return;
              try { await post('/api/forum/r/' + x.id + '/apagar'); recarregar(); } catch (e) { falhou(e); }
            } }, 'Apagar') : null,
            !x.meu ? h('button', { class: 'bt bt-pq bt-limpo', type: 'button', onclick: () => denunciar(x.id) }, 'Denunciar') : null)])),
      t.fechado && !r.admin ? h('p', { class: 'nota-suave', style: 'margin-top:12px' }, 'Este tópico está fechado a novas respostas.') : (pode('forum', 'c') ? h('div', { style: 'margin-top:16px' }, caixa) : null)));
}

export async function mostrar(raiz, caminho) {
  const m = caminho.match(/^\/app\/forum\/([A-Za-z0-9_-]{12})$/);
  if (m) return topico(raiz, m[1]);
  const filtros = { categoria: '', q: '', pagina: 1 };
  const lista = h('div');
  let cats = [];
  const sep = h('div', { class: 'separadores', role: 'tablist', 'aria-label': 'Categorias' });
  const carregar = async () => {
    const r = await get('/api/forum?' + new URLSearchParams(Object.entries(filtros).filter(([, v]) => v)));
    cats = r.categorias;
    sep.replaceChildren(...[{ id: '', nome: 'Tudo' }, ...cats].map((c) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(filtros.categoria === c.id),
      onclick: () => { filtros.categoria = c.id; filtros.pagina = 1; carregar().catch(falhou); } }, c.nome)));
    lista.replaceChildren(r.itens.length ? h('div', { class: 'ficha', style: 'padding:4px 16px' }, r.itens.map((t) => ligacao('/app/forum/' + t.id, { class: 'topico' },
      h('span', { class: 't' }, t.titulo, t.fixo ? h('span', { class: 'estado neutro', style: 'margin-left:8px' }, 'Fixado') : null),
      t.resumo ? h('span', { style: 'color:var(--tinta2);font-size:14px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical' }, t.resumo) : null,
      h('span', { class: 'meta' }, autor(t.autor), h('span', null, t.categoria_nome), h('span', null, `${num(t.respostas)} respostas`), h('span', null, relativo(t.ultima))))),
      r.total > 30 ? h('div', { class: 'paginacao' },
        h('button', { class: 'bt bt-pq', type: 'button', disabled: filtros.pagina <= 1, onclick: () => { filtros.pagina--; carregar(); } }, 'Anterior'),
        h('span', null, `Página ${filtros.pagina}`),
        h('button', { class: 'bt bt-pq', type: 'button', disabled: filtros.pagina * 30 >= r.total, onclick: () => { filtros.pagina++; carregar(); } }, 'Seguinte')) : null)
      : vazio({ titulo: filtros.q || filtros.categoria ? 'Nada por aqui' : 'O fórum ainda está vazio', icone: 'forum',
        texto: 'Pergunta como os outros negócios fazem, partilha uma dica ou uma notícia do teu setor.',
        acao: pode('forum', 'c') ? h('button', { class: 'bt bt-p', type: 'button', onclick: () => novoTopico(cats) }, 'Abrir tópico') : null }));
  };
  const inpQ = h('input', { class: 'entrada', type: 'search', placeholder: 'Procurar no fórum', 'aria-label': 'Procurar no fórum' });
  inpQ.addEventListener('input', debounce(() => { filtros.q = inpQ.value.trim(); filtros.pagina = 1; carregar().catch(falhou); }));
  raiz.replaceChildren(
    h('header', { class: 'cabeca' }, h('div', null, h('h1', null, 'Fórum'), h('p', { class: 'sub' }, 'Perguntas, dicas e notícias entre negócios que usam a webase')),
      h('div', { class: 'acoes' }, pode('forum', 'c') ? h('button', { class: 'bt bt-p', type: 'button', onclick: () => novoTopico(cats) }, icone('mais'), 'Novo tópico') : null)),
    h('div', { class: 'barra-filtros' }, sep, h('div', { class: 'pesquisa' }, icone('procurar'), inpQ)), lista);
  await carregar();
}
