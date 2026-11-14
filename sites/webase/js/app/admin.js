// webase — apoio da plataforma (só para os e-mails de administração): números gerais e palavra-passe nova a quem se esqueceu.
import { estado, h, get, post, num, relativo, data, aviso, falhou, folha, confirmar, vazio, carregando, debounce, aGuardar } from './nucleo.js';

function mostrarSenha(nome, email, senha) {
  const copiar = h('button', { class: 'bt', type: 'button', onclick: async () => {
    try { await navigator.clipboard.writeText(senha); aviso('Copiada.'); } catch { aviso('Seleciona e copia à mão.', { erro: true }); }
  } }, 'Copiar');
  const ok = h('button', { class: 'bt bt-p', type: 'button' }, 'Já a mandei');
  const d = folha({ titulo: 'Palavra-passe nova', corpo: h('div', { class: 'grelha' },
    h('p', null, 'Manda esta palavra-passe a ', h('strong', null, nome), ' (', email, '), de preferência por resposta ao e-mail que te escreveu. Só aparece agora. Ao entrar, a pessoa escolhe uma só dela e as sessões antigas já terminaram.'),
    h('div', { class: 'senha-temp' }, senha)), pe: [copiar, ok] });
  ok.addEventListener('click', () => d.fechar());
}

function linhaPessoa(p) {
  const b = h('button', { class: 'bt bt-pq', type: 'button' }, 'Palavra-passe nova');
  b.addEventListener('click', async () => {
    const sim = await confirmar({ titulo: 'Dar palavra-passe nova a ' + p.nome + '?',
      texto: 'Confirma primeiro que o pedido veio do e-mail ' + p.email + '. A palavra-passe atual deixa de funcionar e a pessoa sai de todos os aparelhos.', sim: 'Dar palavra-passe nova' });
    if (!sim) return;
    try {
      const r = await aGuardar(b, () => post('/api/admin/senha', { email: p.email }), 'A criar…');
      mostrarSenha(r.nome, p.email, r.senha_temporaria);
    } catch (e) { falhou(e); }
  });
  return h('div', { class: 'linha com-acoes' },
    h('span', { class: 'principal-l' },
      h('span', { class: 't' }, p.nome, p.dono ? h('span', { style: 'font-weight:400;color:var(--tinta2)' }, ' · dono') : null),
      h('span', { class: 's' }, [p.email, p.visto ? 'visto ' + relativo(p.visto) : 'nunca entrou', p.trocar_senha ? 'tem palavra-passe temporária' : ''].filter(Boolean).join(' · '))),
    h('span', { class: 'acoes-l' }, b));
}

export async function mostrar(raiz) {
  if (!estado.eu.admin) {
    raiz.replaceChildren(vazio({ titulo: 'Esta página não existe', icone: 'apoio' }));
    return;
  }
  const r = await get('/api/admin/resumo');
  const lista = h('div', { 'aria-live': 'polite' });
  const caixa = h('input', { class: 'entrada', type: 'search', id: 'adm-q', placeholder: 'E-mail, nome do negócio ou NIF', autocomplete: 'off', inputmode: 'search' });
  let n = 0;
  async function procurar() {
    const meu = ++n;
    lista.replaceChildren(carregando());
    try {
      const x = await get('/api/admin/contas?q=' + encodeURIComponent(caixa.value.trim()));
      if (meu !== n) return;
      lista.replaceChildren(x.contas.length ? h('div', { class: 'grelha', style: 'gap:16px' }, x.contas.map((k) =>
        h('section', { class: 'ficha' },
          h('header', { style: 'display:block' }, h('h2', null, k.nome), h('p', { style: 'margin-top:4px;color:var(--tinta2);font-size:14px' },
            [k.setor, 'plano ' + k.plano, num(k.clientes) + ' clientes', 'criada a ' + data(k.criado)].join(' · '))),
          h('div', { class: 'lista' }, k.pessoas.map(linhaPessoa))))) : vazio({ titulo: 'Nenhuma conta encontrada', icone: 'procurar' }));
    } catch (e) { if (meu === n) { lista.replaceChildren(); falhou(e); } }
  }
  caixa.addEventListener('input', debounce(procurar, 300));
  const numero = (rot, val, det) => h('div', { class: 'numero' }, h('span', { class: 'r' }, rot), h('span', { class: 'n' }, num(val)), det ? h('span', { class: 'd' }, det) : null);
  raiz.replaceChildren(
    h('header', { class: 'cabeca' }, h('div', null, h('h1', null, 'Apoio webase'), h('p', { class: 'sub' }, 'Só tu vês esta página.'))),
    h('div', { class: 'numeros', style: '--cols:4' },
      numero('Contas', r.contas, `+${num(r.contas_semana)} esta semana`),
      numero('Pessoas ativas', r.utilizadores, `${num(r.ativos_semana)} entraram esta semana`),
      numero('Clientes guardados', r.clientes, 'em todas as contas'),
      numero('Denúncias no fórum', r.denuncias, r.denuncias ? 'por ver' : 'nenhuma por ver')),
    h('section', { class: 'grelha', style: 'gap:12px;margin-top:28px' },
      h('label', { for: 'adm-q', style: 'font-weight:600' }, 'Procurar conta'),
      caixa,
      h('p', { class: 'nota-suave' }, 'Quando alguém se esquece da palavra-passe e te escreve, procura o e-mail, confirma que o pedido veio desse endereço e dá-lhe uma nova.')),
    h('div', { style: 'margin-top:20px' }, lista));
  procurar();
}
