// webase — equipa e permissões: pessoas, papéis, matriz por módulo e ação, âmbito e registo de atividade.
import { estado, h, icone, get, post, relativo, dataHora, campo, opcao, folha, formFolha, aviso, falhou, confirmar, podeX, avatar,
  aGuardar, lerForm, limparErros, mostrarErro, vazio } from './nucleo.js';

const ACOES = [['v', 'Ver'], ['c', 'Criar'], ['e', 'Editar'], ['a', 'Apagar']];
const ACOES_MK = { v: 'Ver', c: 'Comprar e publicar', e: 'Gerir anúncios', a: 'Apagar' };

function editorPerm(cfg, perm, papel) {
  const zona = h('div', { class: 'grelha' });
  let atual = JSON.parse(JSON.stringify(perm));
  const desenhar = () => {
    const modsConta = estado.eu.conta.modulos;
    const tabela = h('table', { class: 'matriz' },
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Módulo'), ACOES.map(([, t]) => h('th', { scope: 'col' }, t)))),
      h('tbody', null, cfg.modulos.filter((m) => modsConta.includes(m.id)).map((m) => h('tr', null, h('th', { scope: 'row', style: 'text-align:left;font-weight:600;color:var(--tinta)' }, m.nome),
        ACOES.map(([a, t]) => h('td', null, h('input', { type: 'checkbox', 'aria-label': `${m.nome}: ${m.id === 'marketplace' ? ACOES_MK[a] : t}`, checked: (atual.m[m.id] || '').includes(a),
          onchange: (e) => {
            let l = atual.m[m.id] || '';
            if (e.target.checked) { l += a; if (a !== 'v' && !l.includes('v')) l += 'v'; } else { l = l.replace(a, ''); if (a === 'v') l = ''; }
            atual.m[m.id] = 'vcea'.split('').filter((x) => l.includes(x)).join('');
            papel.value = 'personalizado'; desenhar();
          } })))))));
    zona.replaceChildren(
      h('div', { class: 'tabela-env' }, tabela),
      h('fieldset', { class: 'campo', style: 'border:0;padding:0;margin:0' }, h('legend', { class: 'rotulo', style: 'margin-bottom:6px' }, 'Que clientes pode ver'),
        opcao({ nome: 'ambito_r', tipo: 'radio', valor: 'todos', rotulo: 'Toda a base de clientes', marcado: atual.ambito === 'todos' }),
        opcao({ nome: 'ambito_r', tipo: 'radio', valor: 'meus', rotulo: 'Só os clientes, leads, chamadas e contratos de que é responsável', marcado: atual.ambito === 'meus' })),
      h('fieldset', { class: 'campo', style: 'border:0;padding:0;margin:0' }, h('legend', { class: 'rotulo', style: 'margin-bottom:6px' }, 'Pode também'),
        cfg.extras.map((x) => opcao({ nome: 'x_' + x.id, rotulo: x.nome, marcado: atual.x.includes(x.id) }))));
    zona.querySelectorAll('input[name=ambito_r]').forEach((r) => r.addEventListener('change', () => { atual.ambito = r.value; papel.value = 'personalizado'; }));
    zona.querySelectorAll('input[name^=x_]').forEach((r) => r.addEventListener('change', () => {
      const id = r.name.slice(2); atual.x = r.checked ? [...new Set([...atual.x, id])] : atual.x.filter((x) => x !== id); papel.value = 'personalizado';
    }));
  };
  papel.addEventListener('change', () => {
    const p = cfg.papeis.find((x) => x.id === papel.value);
    if (p) { atual = JSON.parse(JSON.stringify(p.perm)); desenhar(); }
  });
  desenhar();
  zona.ler = () => atual;
  return zona;
}

function mostrarSenha(nome, senha) {
  const copiar = h('button', { class: 'bt', type: 'button', onclick: async () => {
    try { await navigator.clipboard.writeText(senha); aviso('Copiada.'); } catch { aviso('Seleciona e copia à mão.', { erro: true }); }
  } }, 'Copiar');
  const ok = h('button', { class: 'bt bt-p', type: 'button' }, 'Já a passei');
  const d = folha({ titulo: 'Palavra-passe de ' + nome, corpo: h('div', { class: 'grelha' },
    h('p', null, 'Dá esta palavra-passe a ', h('strong', null, nome), '. Só aparece agora. Na primeira entrada, a pessoa escolhe uma só dela.'),
    h('div', { class: 'senha-temp' }, senha)), pe: [copiar, ok] });
  ok.addEventListener('click', () => d.fechar());
}

function pessoa(cfg, u, depois) {
  const novo = !u;
  const papelSel = h('select', { class: 'entrada', id: 'papel-sel', name: 'papel' },
    cfg.papeis.map((p) => h('option', { value: p.id, selected: (u?.papel || 'comercial') === p.id }, p.nome)), h('option', { value: 'personalizado', selected: u?.papel === 'personalizado' }, 'Personalizado'));
  const base = u ? u.perm : cfg.papeis.find((p) => p.id === 'comercial').perm;
  const editor = editorPerm(cfg, base, papelSel);
  const form = h('form', { novalidate: true, class: 'grelha' },
    h('div', { class: 'duas' }, campo({ nome: 'nome', rotulo: 'Nome', valor: u?.nome, obrig: true }),
      novo ? campo({ nome: 'email', rotulo: 'E-mail', tipo: 'email', obrig: true, autocomplete: 'off', ajuda: 'É com este e-mail que entra.' }) : h('div', { class: 'dado' }, h('dt', null, 'E-mail'), h('dd', null, u.email))),
    h('div', { class: 'campo' }, h('label', { for: 'papel-sel' }, 'Papel'), papelSel, h('span', { class: 'ajuda' }, 'Escolhe um papel e ajusta as caixas, se precisares.')),
    editor);
  const pe = [];
  if (!novo) {
    pe.push(h('button', { class: 'bt esq', type: 'button', onclick: async () => {
      if (!await confirmar({ titulo: 'Nova palavra-passe?', texto: `${u.nome} sai de todos os aparelhos e entra com a nova palavra-passe.`, sim: 'Gerar nova' })) return;
      try { const r = await post('/api/equipa/' + u.id + '/senha'); d.fechar(); mostrarSenha(u.nome, r.senha_temporaria); } catch (e) { falhou(e); }
    } }, 'Nova palavra-passe'));
    pe.push(h('button', { class: 'bt', type: 'button', onclick: async () => {
      try { await post('/api/equipa/' + u.id, { ativo: !u.ativo }); d.fechar(); aviso(u.ativo ? 'Acesso suspenso.' : 'Acesso reativado.'); depois(); } catch (e) { falhou(e); }
    } }, u.ativo ? 'Suspender' : 'Reativar'));
    pe.push(h('button', { class: 'bt bt-perigo', type: 'button', onclick: async () => {
      if (!await confirmar({ titulo: 'Remover ' + u.nome + '?', texto: 'Perde o acesso. Os clientes e leads de que era responsável passam para ti.', sim: 'Remover', perigo: true })) return;
      try { await post('/api/equipa/' + u.id + '/apagar'); d.fechar(); aviso('Removido da equipa.'); depois(); } catch (e) { falhou(e); }
    } }, 'Remover'));
  }
  const bOk = h('button', { class: 'bt bt-p', type: 'submit', form: 'fpessoa' }, novo ? 'Adicionar' : 'Guardar');
  pe.push(bOk);
  form.id = 'fpessoa';
  const d = folha({ titulo: novo ? 'Adicionar pessoa' : u.nome, corpo: form, pe, larga: true });
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); limparErros(form);
    const v = lerForm(form);
    const dados = { nome: v.nome, papel: papelSel.value, perm: editor.ler() };
    if (novo) dados.email = v.email;
    try {
      const r = await aGuardar(bOk, () => post(novo ? '/api/equipa/criar' : '/api/equipa/' + u.id, dados));
      d.fechar();
      if (novo) mostrarSenha(r.utilizador.nome, r.senha_temporaria); else aviso('Permissões guardadas.');
      depois();
    } catch (er) { mostrarErro(form, er); }
  });
}

const ACOES_AUD = { 'entrar': 'Entrou', 'entrar.falhou': 'Palavra-passe errada', 'conta.criar': 'Criou a conta', 'equipa.criar': 'Adicionou pessoa',
  'equipa.mudar': 'Mudou permissões', 'equipa.senha': 'Nova palavra-passe', 'equipa.apagar': 'Removeu pessoa', 'exportar': 'Exportou', 'exportar.tudo': 'Exportou tudo',
  'importar': 'Importou contactos', 'cliente.apagar': 'Apagou cliente', 'cliente.dados': 'Descarregou dados de cliente', 'lead.apagar': 'Apagou lead',
  'contrato.apagar': 'Apagou contrato', 'chamada.apagar': 'Apagou chamada', 'mk.publicar': 'Publicou no marketplace', 'mk.comprar': 'Recebeu base',
  'mk.reservar': 'Reservou base', 'mk.mudar': 'Mudou anúncio', 'partilha.enviar': 'Partilhou contactos', 'partilha.aceitar': 'Aceitou partilha',
  'senha.mudar': 'Mudou a palavra-passe', 'sessoes.terminar': 'Terminou sessões', 'conta.modulos': 'Mudou módulos', 'conta.dados': 'Mudou dados do negócio',
  'conta.cor': 'Mudou a cor', 'conta.logo': 'Mudou o logótipo', 'conta.fases': 'Mudou as fases', 'conta.campos': 'Mudou os campos', 'plano.interesse': 'Pediu plano',
  'telemovel.ligar': 'Ligou um telemóvel', 'telemovel.desligar': 'Desligou um telemóvel', 'forum.apagar': 'Apagou tópico do fórum' };

async function auditoria(caixa) {
  const r = await get('/api/auditoria');
  let comEntradas = false;
  const lista = h('div');
  const pintar = () => {
    const regs = r.registos.filter((x) => comEntradas || x.acao !== 'entrar');
    lista.replaceChildren(regs.length ? h('div', { class: 'lista' }, regs.map((x) => {
      const det = x.detalhe || x.alvo_nome;
      return h('div', { class: 'linha', style: 'min-height:48px' },
        h('span', { class: 'principal-l' }, h('span', { class: 't' }, (ACOES_AUD[x.acao] || x.acao), det ? h('span', { style: 'font-weight:400;color:var(--tinta2)' }, ' · ' + det) : null),
          h('span', { class: 's' }, [x.quem, dataHora(x.quando)].filter(Boolean).join(' · '))));
    })) : h('p', { style: 'color:var(--tinta2)' }, 'Sem registos.'));
  };
  const caixaEnt = h('label', { class: 'opcao', style: 'margin-bottom:8px' }, h('input', { type: 'checkbox', onchange: (e) => { comEntradas = e.target.checked; pintar(); } }),
    h('span', null, 'Mostrar também as entradas na conta'));
  pintar();
  caixa.replaceChildren(caixaEnt, lista);
}

export async function mostrar(raiz) {
  if (!podeX('equipa')) {
    raiz.replaceChildren(h('header', { class: 'cabeca' }, h('h1', null, 'Equipa e permissões')),
      vazio({ titulo: 'Não tens acesso a esta parte', icone: 'equipa', texto: 'Só quem gere a equipa vê e muda as permissões. Se precisas de outro acesso, pede a quem gere a conta.' }));
    return;
  }
  const carregar = async () => {
    const cfg = await get('/api/equipa');
    const ativos = cfg.equipa.filter((u) => u.ativo).length;
    const nomePapel = (id) => cfg.papeis.find((p) => p.id === id)?.nome || 'Personalizado';
    const aud = h('div', null, h('div', { class: 'carregar' }));
    raiz.replaceChildren(
      h('header', { class: 'cabeca' }, h('div', null, h('h1', null, 'Equipa e permissões'), h('p', { class: 'sub' }, `${ativos} de ${cfg.maximo} pessoas`)),
        h('div', { class: 'acoes' }, h('button', { class: 'bt bt-p', type: 'button', onclick: () => pessoa(cfg, null, carregar) }, icone('mais'), 'Adicionar pessoa'))),
      h('div', { class: 'grelha lado' },
        h('section', { class: 'ficha' }, h('div', { class: 'lista' }, cfg.equipa.map((u) => h('button', { class: 'linha', type: 'button', disabled: u.dono || u.id === estado.eu.id,
          onclick: () => pessoa(cfg, u, carregar) },
          avatar(u.nome), h('span', { class: 'principal-l' }, h('span', { class: 't' }, u.nome, u.id === estado.eu.id ? ' (tu)' : ''),
            h('span', { class: 's' }, u.email, ' · ', u.dono ? 'Dono da conta' : nomePapel(u.papel), u.perm.ambito === 'meus' && !u.dono ? ' · só os seus' : '')),
          h('span', { class: 'lado-d' }, !u.ativo ? h('span', { class: 'estado neutro' }, 'Suspenso') : u.trocar_senha ? h('span', { class: 'estado atencao' }, 'Ainda não entrou') : (u.visto ? 'Visto ' + relativo(u.visto) : '')))))),
        h('section', { class: 'ficha' }, h('header', null, h('h2', null, 'Como funcionam as permissões')),
          h('div', { class: 'grelha', style: 'gap:10px;color:var(--tinta2);font-size:14px' },
            h('p', null, 'Cada pessoa entra com o seu e-mail. Tu escolhes o papel e, se quiseres, cada caixa: ver, criar, editar e apagar em cada módulo.'),
            h('p', null, 'Com «só os clientes de que é responsável», um comercial não vê a carteira dos colegas.'),
            h('p', null, 'Exportar e importar contactos são permissões à parte: ninguém leva a tua base sem tu deixares.'),
            h('p', null, 'Quem não é dono nunca consegue dar mais permissões do que tem.')))),
      podeX('auditoria') ? h('section', { class: 'ficha' }, h('header', null, h('h2', null, 'Registo de atividade')), aud) : null);
    if (podeX('auditoria')) auditoria(aud).catch((e) => aud.replaceChildren(h('p', null, e.message)));
  };
  await carregar();
}
