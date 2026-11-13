// webase — casca da app: sessão, navegação, entrar/registar, boas-vindas e encaminhamento para cada módulo.
import { estado, h, icone, logoWb, get, post, ligacao, navegar, campo, opcao, lerForm, mostrarErro, limparErros, aGuardar,
  carregando, erroBloco, iniciais, ligado, podeX, aviso, folha, relativo, ErroApi } from './nucleo.js';

const MODS = {
  clientes: { nome: 'Clientes', icone: 'clientes', url: '/app/clientes' },
  leads: { nome: 'Leads', icone: 'leads', url: '/app/leads' },
  chamadas: { nome: 'Chamadas', icone: 'chamadas', url: '/app/chamadas' },
  contratos: { nome: 'Contratos', icone: 'contratos', url: '/app/contratos' },
  pontos: { nome: 'Pontos', icone: 'pontos', url: '/app/pontos' },
  adesoes: { nome: 'Subscrições e pacotes', curto: 'Pacotes', icone: 'adesoes', url: '/app/subscricoes' },
  marketplace: { nome: 'Marketplace', icone: 'marketplace', url: '/app/marketplace' },
  forum: { nome: 'Fórum', icone: 'forum', url: '/app/forum' },
};

const VISTAS = [
  [/^\/app\/?$/, () => import('./painel.js')],
  [/^\/app\/clientes(\/.*)?$/, () => import('./clientes.js')],
  [/^\/app\/leads\/?$/, () => import('./leads.js')],
  [/^\/app\/chamadas\/?$/, () => import('./chamadas.js')],
  [/^\/app\/contratos\/?$/, () => import('./contratos.js')],
  [/^\/app\/pontos\/?$/, () => import('./pontos.js')],
  [/^\/app\/subscricoes\/?$/, () => import('./adesoes.js')],
  [/^\/app\/marketplace(\/.*)?$/, () => import('./marketplace.js')],
  [/^\/app\/forum(\/.*)?$/, () => import('./forum.js')],
  [/^\/app\/equipa\/?$/, () => import('./equipa.js')],
  [/^\/app\/definicoes(\/.*)?$/, () => import('./definicoes.js')],
  [/^\/app\/avisos\/?$/, () => import('./avisos.js')],
  [/^\/app\/ligar(\/[A-Za-z0-9_-]{12})?\/?$/, () => import('./ligar.js')],
];

const raiz = document.getElementById('app');

function aplicarMarca() {
  const eu = estado.eu;
  const html = document.documentElement;
  html.dataset.tema = eu?.tema || 'auto';
  if (eu?.conta?.cor) html.style.setProperty('--acento', eu.conta.cor); else html.style.removeProperty('--acento');
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.setAttribute('content', eu?.conta?.cor || '#2B3FD6');
}

function marcaConta() {
  const k = estado.eu.conta;
  return ligacao('/app', { class: 'marca-conta', 'aria-label': 'Início — ' + k.nome },
    k.logo ? h('img', { src: k.logo, alt: '', width: 36, height: 36, onerror: (e) => e.target.replaceWith(h('span', { class: 'iniciais', 'aria-hidden': 'true' }, iniciais(k.nome))) })
      : h('span', { class: 'iniciais', 'aria-hidden': 'true' }, iniciais(k.nome)),
    h('span', { style: 'min-width:0' }, h('strong', null, k.nome), h('span', { class: 'sub' }, estado.eu.nome)));
}

function itemNav(url, nome, ic, extra) {
  const atual = location.pathname === url || (url !== '/app' && location.pathname.startsWith(url + '/'));
  return ligacao(url, { class: 'nav-item', 'aria-current': atual ? 'page' : null }, icone(ic), h('span', null, nome), extra || null);
}

function modsVisiveis() {
  const eu = estado.eu;
  return Object.keys(MODS).filter((m) => eu.conta.modulos.includes(m) && (eu.perm.m[m] || '').includes('v'));
}

function casca(conteudo) {
  const eu = estado.eu;
  const mods = modsVisiveis();
  const nAvisos = eu.avisos ? h('span', { class: 'conta-n', 'aria-label': eu.avisos + ' por ler' }, eu.avisos > 9 ? '9+' : eu.avisos) : null;
  const lateral = h('nav', { class: 'lateral', 'aria-label': 'Principal' },
    marcaConta(),
    itemNav('/app', 'Início', 'inicio'),
    mods.map((m) => itemNav(MODS[m].url, MODS[m].nome, MODS[m].icone)),
    h('div', { class: 'rodape-lat' },
      itemNav('/app/avisos', 'Avisos', 'sino', nAvisos),
      podeX('equipa') ? itemNav('/app/equipa', 'Equipa', 'equipa') : null,
      itemNav('/app/definicoes', 'Definições', 'definicoes'),
      h('button', { class: 'nav-item', type: 'button', style: 'border:0;background:none;width:100%', onclick: sair }, icone('sair'), h('span', null, 'Sair'))));
  // telemóvel: 3 destinos principais + Mais
  const prioridade = ['clientes', 'leads', 'chamadas', 'pontos', 'adesoes', 'contratos', 'marketplace', 'forum'].filter((m) => mods.includes(m)).slice(0, 3);
  const itemInf = (url, nome, ic) => {
    const atual = location.pathname === url || (url !== '/app' && location.pathname.startsWith(url + '/'));
    return ligacao(url, { 'aria-current': atual ? 'page' : null }, icone(ic), h('span', null, nome));
  };
  const inferior = h('nav', { class: 'inferior', 'aria-label': 'Principal' },
    itemInf('/app', 'Início', 'inicio'),
    prioridade.map((m) => itemInf(MODS[m].url, MODS[m].curto || MODS[m].nome, MODS[m].icone)),
    h('button', { type: 'button', onclick: menuMais, 'aria-haspopup': 'dialog' }, icone('pontinhos'), h('span', null, 'Mais')));
  while (inferior.children.length < 5) inferior.insertBefore(h('span'), inferior.lastChild);
  const topo = h('header', { class: 'topo' }, marcaConta(),
    ligacao('/app/avisos', { class: 'bt bt-icone bt-limpo', 'aria-label': 'Avisos' + (eu.avisos ? ` (${eu.avisos} por ler)` : '') }, icone('sino')));
  const principal = h('main', { class: 'principal', id: 'conteudo', tabindex: '-1' }, conteudo);
  return h('div', { class: 'casca' }, lateral, h('div', { style: 'min-width:0' }, topo, principal), inferior);
}

function menuMais() {
  const todos = modsVisiveis();
  const naBarra = ['clientes', 'leads', 'chamadas', 'pontos', 'adesoes', 'contratos', 'marketplace', 'forum'].filter((m) => todos.includes(m)).slice(0, 3);
  const mods = todos.filter((m) => !naBarra.includes(m));
  const fechar = () => d.fechar();
  const item = (url, nome, ic) => ligacao(url, { class: 'nav-item', onclick: fechar }, icone(ic), h('span', null, nome));
  const d = folha({ titulo: 'Mais', corpo: h('nav', { class: 'grelha', style: 'gap:2px' },
    mods.map((m) => item(MODS[m].url, MODS[m].nome, MODS[m].icone)),
    podeX('equipa') ? item('/app/equipa', 'Equipa e permissões', 'equipa') : null,
    item('/app/avisos', 'Avisos', 'sino'),
    item('/app/definicoes', 'Definições', 'definicoes'),
    h('div', { class: 'nav-sep', role: 'separator' }),
    h('button', { class: 'nav-item', type: 'button', style: 'border:0;background:none;width:100%', onclick: sair }, icone('sair'), h('span', null, 'Sair'))) });
}

async function sair() {
  try { await post('/api/conta/sair'); } catch { /* sai na mesma */ }
  estado.eu = null;
  location.href = '/';
}

// ---------------------------------------------------------------- entrar e registar

function ladoMarca(titulo, texto) {
  return h('aside', { class: 'entrada-lado' },
    h('a', { href: '/', class: 'logo-wb', style: 'color:#fff' }, logoWb(), 'webase'),
    h('div', { style: 'display:grid;gap:20px' }, h('p', { class: 'grande' }, titulo), h('p', null, texto)),
    h('p', { style: 'font-size:13px' }, 'Feito em Portugal, para negócios portugueses.'));
}

function ecraEntrar() {
  document.title = 'Entrar — webase';
  const form = h('form', { novalidate: true },
    h('a', { href: '/', class: 'logo-wb' }, logoWb(), 'webase'),
    h('h1', null, 'Entrar na tua conta'),
    campo({ nome: 'email', rotulo: 'E-mail', tipo: 'email', autocomplete: 'username', obrig: true, inputmode: 'email' }),
    campo({ nome: 'senha', rotulo: 'Palavra-passe', tipo: 'password', autocomplete: 'current-password', obrig: true }),
    h('button', { class: 'bt bt-p', type: 'submit' }, 'Entrar'),
    h('p', { class: 'ajuda' }, 'Ainda não tens conta? ', ligacao('/app/registar', { class: 'ligacao' }, 'Criar conta grátis')),
    h('p', { class: 'ajuda', style: 'color:var(--tinta2);font-size:13.5px' }, 'Esqueceste-te da palavra-passe? Se a conta é de uma equipa, pede a quem a gere para te dar uma nova. Se criaste a conta, ',
      h('a', { class: 'ligacao', href: 'mailto:diniscash@gmail.com?subject=' + encodeURIComponent('webase: recuperar a palavra-passe') }, 'escreve-nos'), ' a partir do e-mail da conta.'));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    limparErros(form);
    const b = form.querySelector('button[type=submit]');
    try {
      estado.eu = await aGuardar(b, () => post('/api/conta/entrar', lerForm(form)), 'A entrar…');
      const volta = sessionStorage.getItem('wb-volta');
      sessionStorage.removeItem('wb-volta');
      navegar(volta && volta.startsWith('/app') && !volta.startsWith('/app/entrar') ? volta : '/app', true);
    } catch (err) { mostrarErro(form, err); }
  });
  raiz.replaceChildren(h('div', { class: 'entrada-ecra' },
    ladoMarca('Os teus clientes, numa base só tua.', 'Fichas, pontos, pacotes, chamadas e contratos no mesmo sítio. No telemóvel, ao balcão ou no escritório.'),
    h('main', { class: 'entrada-form', id: 'conteudo' }, form)));
}

function ecraRegistar() {
  document.title = 'Criar conta — webase';
  const setores = estado.publico?.setores || [];
  const params = new URLSearchParams(location.search);
  const form = h('form', { novalidate: true },
    h('a', { href: '/', class: 'logo-wb' }, logoWb(), 'webase'),
    h('div', null, h('h1', null, 'Criar conta grátis'), h('p', { class: 'ajuda', style: 'color:var(--tinta2);margin-top:6px' }, 'Sem cartão. Exportas os teus dados quando quiseres.')),
    campo({ nome: 'nome', rotulo: 'O teu nome', autocomplete: 'name', obrig: true }),
    campo({ nome: 'negocio', rotulo: 'Nome do negócio', autocomplete: 'organization', obrig: true }),
    // o tipo de negócio escolhe-se logo a seguir, no primeiro passo (aqui só passa o que vem da página de soluções)
    setores.some((s) => s.id === params.get('setor')) ? h('input', { type: 'hidden', name: 'setor', value: params.get('setor') }) : null,
    campo({ nome: 'email', rotulo: 'E-mail', tipo: 'email', autocomplete: 'email', obrig: true, inputmode: 'email' }),
    campo({ nome: 'senha', rotulo: 'Palavra-passe', tipo: 'password', autocomplete: 'new-password', obrig: true, ajuda: 'Pelo menos 10 caracteres. Uma frase curta é mais segura e mais fácil de lembrar.' }),
    h('div', { class: 'so-leitor', 'aria-hidden': 'true' }, h('label', null, 'Site', h('input', { name: 'site', tabindex: '-1', autocomplete: 'off' }))),
    h('div', { class: 'campo', dados: { campo: 'aceito' } }, opcao({ nome: 'aceito', rotulo: h('span', null, 'Li e aceito os ', h('a', { href: '/termos/', class: 'ligacao', target: '_blank' }, 'termos'), ' e a ', h('a', { href: '/privacidade/', class: 'ligacao', target: '_blank' }, 'política de privacidade'), '.') })),
    h('button', { class: 'bt bt-p', type: 'submit' }, 'Criar conta'),
    h('p', { class: 'ajuda' }, 'Já tens conta? ', ligacao('/app/entrar', { class: 'ligacao' }, 'Entrar')));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    limparErros(form);
    const d = lerForm(form);
    if (!d.aceito) return mostrarErro(form, { message: 'Para criar a conta tens de aceitar os termos e a política de privacidade.', dados: { campo: 'aceito' } });
    try {
      estado.eu = await aGuardar(form.querySelector('button[type=submit]'), () => post('/api/conta/criar', d), 'A criar…');
      window.estat?.('conta', 'criada');
      navegar('/app/boas-vindas', true);
    } catch (err) { mostrarErro(form, err); }
  });
  const fund = estado.publico && estado.publico.fundadores_restantes > 0
    ? `Ainda há ${estado.publico.fundadores_restantes} lugares de fundador: quem entra agora fica com 40 % de desconto para sempre quando os planos pagos abrirem.` : '';
  raiz.replaceChildren(h('div', { class: 'entrada-ecra' },
    ladoMarca('Começa com o que precisas. Junta o resto depois.', fund || 'Liga só os módulos que usas: fichas, pontos, pacotes, leads, chamadas ou contratos.'),
    h('main', { class: 'entrada-form', id: 'conteudo' }, form)));
}

function ecraTrocarSenha() {
  document.title = 'Escolher palavra-passe — webase';
  const form = h('form', { novalidate: true },
    h('a', { href: '/', class: 'logo-wb' }, logoWb(), 'webase'),
    h('h1', null, 'Escolhe a tua palavra-passe'),
    h('p', { class: 'nota-suave' }, 'Entraste com a palavra-passe que te deram. Escolhe agora uma só tua: mais ninguém a fica a saber.'),
    campo({ nome: 'atual', rotulo: 'Palavra-passe que te deram', tipo: 'password', autocomplete: 'current-password', obrig: true }),
    campo({ nome: 'nova', rotulo: 'Nova palavra-passe', tipo: 'password', autocomplete: 'new-password', obrig: true, ajuda: 'Pelo menos 10 caracteres.' }),
    h('button', { class: 'bt bt-p', type: 'submit' }, 'Guardar e continuar'));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await aGuardar(form.querySelector('button[type=submit]'), () => post('/api/eu/senha', lerForm(form)));
      estado.eu = await get('/api/eu');
      navegar('/app', true);
    } catch (err) { mostrarErro(form, err); }
  });
  raiz.replaceChildren(h('div', { class: 'entrada-ecra' }, ladoMarca('Bem-vindo à equipa.', 'A conta do teu negócio está na webase. Só falta a tua palavra-passe.'),
    h('main', { class: 'entrada-form', id: 'conteudo' }, form)));
}

// ---------------------------------------------------------------- boas-vindas (configurar a conta)

const DESCR = {
  clientes: 'A ficha de cada cliente: contactos, notas, histórico, aniversários. Está sempre ligada.',
  leads: 'Oportunidades por fases (por contactar, proposta, ganho…), com valor e próximo passo.',
  chamadas: 'Chamadas recebidas e feitas, resultado, duração e quem ligar a seguir.',
  contratos: 'Contratos e avenças com início, fim, valor e renovação automática.',
  pontos: 'Cartão de pontos sem papel: pontos por cada euro e recompensas.',
  adesoes: 'Mensalidades e pacotes (ex.: 10 cortes, plano do ginásio) com usos e renovações.',
  marketplace: 'Comprar, vender e partilhar bases de contactos com outras contas.',
  forum: 'Perguntas, dicas e notícias com outros negócios que usam a webase.',
};

function ecraBoasVindas() {
  document.title = 'Configurar — webase';
  const eu = estado.eu;
  const setores = estado.publico?.setores || [];
  let setor = eu.conta.setor;
  let mods = new Set(eu.conta.modulos);
  let passo = 1;
  const corpo = h('div', { class: 'caixa' });
  const desenhar = () => {
    const passos = h('div', { class: 'passos', 'aria-label': `Passo ${passo} de 2` }, h('span', { class: 'feito' }), h('span', { class: passo >= 2 ? 'feito' : '' }));
    if (passo === 1) {
      corpo.replaceChildren(passos, h('h1', null, 'Que tipo de negócio tens?'),
        h('p', { class: 'ajuda', style: 'color:var(--tinta2)' }, 'Usamos isto para sugerir os módulos certos. Mudas tudo depois.'),
        h('div', { class: 'escolhas', role: 'group', 'aria-label': 'Tipo de negócio' }, setores.map((s) => h('button', {
          type: 'button', class: 'escolha', 'aria-pressed': String(s.id === setor), onclick: () => { setor = s.id; mods = new Set(s.modulos); desenhar(); } }, s.nome))),
        h('button', { class: 'bt bt-p', type: 'button', onclick: () => { passo = 2; desenhar(); } }, 'Continuar'));
    } else {
      corpo.replaceChildren(passos, h('h1', null, 'O que queres gerir?'),
        h('p', { class: 'ajuda', style: 'color:var(--tinta2)' }, 'Liga só o que usas. Podes ligar ou desligar em Definições quando quiseres; nada se perde.'),
        h('div', { class: 'grelha', style: 'gap:8px' }, Object.keys(DESCR).map((m) => {
          const fixo = m === 'clientes';
          const inp = h('input', { type: 'checkbox', checked: mods.has(m), disabled: fixo, onchange: (e) => { e.target.checked ? mods.add(m) : mods.delete(m); } });
          return h('label', { class: 'modulo' + (fixo ? ' fixo' : '') }, inp, h('span', null, h('strong', null, MODS[m]?.nome || 'Fichas de clientes'), h('span', null, DESCR[m])));
        })),
        h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
          h('button', { class: 'bt', type: 'button', onclick: () => { passo = 1; desenhar(); } }, 'Voltar'),
          h('button', { class: 'bt bt-p', type: 'button', onclick: async (e) => {
            try {
              estado.eu = await aGuardar(e.currentTarget, () => post('/api/conta/configurar', { setor, modulos: [...mods] }));
              aviso('Conta pronta. Bom trabalho!', { carimbo: true });
              navegar('/app', true);
            } catch (err) { aviso(err.message, { erro: true }); }
          } }, 'Começar a usar')));
    }
  };
  desenhar();
  raiz.replaceChildren(h('div', { class: 'entrada-ecra' },
    ladoMarca('A tua base, à tua maneira.', 'Barbearia, café, ginásio ou equipa de vendas: cada conta tem só os módulos que fazem sentido.'),
    h('main', { class: 'entrada-form', id: 'conteudo' }, corpo)));
}

// ---------------------------------------------------------------- encaminhamento

let pedidoAtual = 0;
async function rota() {
  const caminho = location.pathname.replace(/\/+$/, '') || '/app';
  const n = ++pedidoAtual;
  if (!estado.publico) { try { estado.publico = await get('/api/publico/estado'); } catch { estado.publico = { setores: [] }; } }
  if (caminho === '/app/registar') { if (estado.eu) return navegar('/app', true); aplicarMarca(); return ecraRegistar(); }
  if (caminho === '/app/entrar') { if (estado.eu) return navegar('/app', true); aplicarMarca(); return ecraEntrar(); }
  if (!estado.eu) {
    try { estado.eu = await get('/api/eu'); } catch (e) {
      if (e instanceof ErroApi && e.dados?.trocar_senha) { return ecraTrocarSenha(); }
      if (e instanceof ErroApi && e.estado === 401) { sessionStorage.setItem('wb-volta', location.pathname + location.search); return navegar('/app/entrar', true); }
      raiz.replaceChildren(h('main', { class: 'principal' }, erroBloco(e, rota)));
      return;
    }
  }
  if (n !== pedidoAtual) return;
  aplicarMarca();
  if (estado.eu.trocar_senha) return ecraTrocarSenha();
  if (caminho === '/app/boas-vindas' || (!estado.eu.conta.configurada && estado.eu.dono)) return ecraBoasVindas();
  const vista = VISTAS.find(([rx]) => rx.test(caminho));
  const conteudo = h('div', { class: 'pagina' }, carregando());
  raiz.replaceChildren(casca(conteudo));
  const modRota = Object.keys(MODS).find((m) => caminho === MODS[m].url || caminho.startsWith(MODS[m].url + '/'));
  if (modRota && !(estado.eu.conta.modulos.includes(modRota) && (estado.eu.perm.m[modRota] || '').includes('v'))) {
    const ligado = estado.eu.conta.modulos.includes(modRota);
    conteudo.replaceChildren(h('header', { class: 'cabeca' }, h('h1', null, MODS[modRota].nome)),
      h('div', { class: 'vazio' }, h('h3', null, ligado ? 'Não tens acesso a esta parte' : 'Este módulo está desligado'),
        h('p', null, ligado ? 'Pede a quem gere a conta para te dar acesso.' : 'Liga-o nas definições e aparece logo no menu. Os dados nunca se perdem ao desligar.'),
        !ligado && podeX('definicoes') ? ligacao('/app/definicoes/modulos', { class: 'bt bt-p' }, 'Ligar módulos') : ligacao('/app', { class: 'bt' }, 'Ir para o início')));
    document.title = MODS[modRota].nome + ' — webase';
    return;
  }
  if (!vista) { conteudo.replaceChildren(h('div', { class: 'vazio' }, h('h3', null, 'Esta página não existe'), ligacao('/app', { class: 'bt' }, 'Ir para o início'))); return; }
  try {
    const mod = await vista[1]();
    if (n !== pedidoAtual) return;
    await mod.mostrar(conteudo, caminho);
    const titulo = conteudo.querySelector('h1');
    document.title = (titulo ? titulo.textContent + ' — ' : '') + estado.eu.conta.nome + ' · webase';
  } catch (e) {
    console.error(e);
    if (n === pedidoAtual) conteudo.replaceChildren(erroBloco(e, rota));
  }
}

window.addEventListener('popstate', rota);
window.addEventListener('wb:rota', () => { rota(); window.scrollTo(0, 0); document.getElementById('conteudo')?.focus({ preventScroll: true }); });
window.addEventListener('wb:sessao', () => { sessionStorage.setItem('wb-volta', location.pathname); navegar('/app/entrar', true); });
window.addEventListener('wb:trocar-senha', () => ecraTrocarSenha());
window.addEventListener('wb:eu', () => { aplicarMarca(); rota(); });
rota();
export { MODS, DESCR, relativo };
