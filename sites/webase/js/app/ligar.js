// webase — ligar no telemóvel.
// No computador, «Ligar» manda um aviso ao telemóvel da pessoa; no telemóvel, um toque abre a chamada e, no fim,
// escolhe-se o resultado (fica registado em Chamadas e na ficha). Nos telemóveis, «Ligar» continua a ser um tel: direto.
import { h, icone, get, post, aviso, falhou, folha, ligacao, navegar, carimbo, minutos, relativo, campo, pode, ligado,
  carregando, aGuardar, lerForm, limparErros, mostrarErro } from './nucleo.js';

const RES = [['atendida', 'Atendida'], ['nao_atendida', 'Não atendeu'], ['ocupado', 'Ocupado'], ['voicemail', 'Caixa de correio'],
  ['venda', 'Venda'], ['ligar_depois', 'Ligar depois'], ['sem_interesse', 'Sem interesse'], ['errado', 'Número errado']];
const NOME_RES = Object.fromEntries(RES);

export const eTelemovel = () => matchMedia('(hover: none) and (pointer: coarse)').matches;
export const temPush = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const eIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const instalada = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const reduzido = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function formatarNumero(n) {
  const s = String(n || '').replace(/\s/g, '');
  if (/^\d{9}$/.test(s)) return s.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3');
  if (/^(\+|00)351\d{9}$/.test(s)) return s.replace(/^(\+|00)351(\d{3})(\d{3})(\d{3})$/, '+351 $2 $3 $4');
  return s;
}

let cache = null;
async function meusTelemoveis(forcar = false) {
  if (!forcar && cache && Date.now() - cache.t < 60000) return cache.r;
  const r = await get('/api/ligar/dispositivos');
  cache = { t: Date.now(), r };
  return r;
}

// ---------------------------------------------------------------- botão «Ligar» (fichas, listas de chamadas)

export function botaoLigar({ numero, nome, cliente, classe = 'bt', texto = 'Ligar', soIcone = false, semIcone = false, depois, aoLigar } = {}) {
  const dentro = soIcone ? [icone('telefone')] : semIcone ? [texto] : [icone('telefone'), texto];
  const aria = soIcone ? 'Ligar para ' + (nome || formatarNumero(numero)) : null;
  if (eTelemovel()) {
    return h('a', { class: classe, href: 'tel:' + numero, 'aria-label': aria, onclick: () => { window.estat?.('ligar', 'telemovel'); aoLigar?.(); } }, dentro);
  }
  return h('button', { class: classe, type: 'button', 'aria-label': aria, 'aria-haspopup': 'dialog',
    onclick: () => abrirLigar({ numero, nome, cliente, depois, aoLigar }) }, dentro);
}

// ---------------------------------------------------------------- no computador: a folha que manda para o telemóvel

export async function abrirLigar({ numero, nome, cliente, depois, aoLigar } = {}) {
  const corpo = h('div', { class: 'ligar-pc' }, carregando());
  let parar = false;
  let pedidoAtivo = null;
  const d = folha({ titulo: 'Ligar a ' + (nome || formatarNumero(numero)), corpo, aoFechar: () => {
    parar = true;
    if (pedidoAtivo && ['pendente'].includes(pedidoAtivo.estado)) post('/api/ligar/' + pedidoAtivo.id + '/cancelar').catch(() => {});
  } });
  const daqui = h('a', { class: 'bt', href: 'tel:' + numero, onclick: () => { window.estat?.('ligar', 'computador'); aoLigar?.(); } },
    icone('telefone'), 'Ligar deste computador');
  const numeroEl = h('p', { class: 'ligar-numero' }, formatarNumero(numero));

  let lista = [];
  try { lista = (await meusTelemoveis()).dispositivos; } catch (e) { if (e.estado !== 401) falhou(e); }

  const inicio = () => {
    if (!lista.length) {
      corpo.replaceChildren(numeroEl,
        h('div', { class: 'ligar-passo' }, h('span', { class: 'ligar-ic' }, icone('telefone')),
          h('div', null, h('strong', null, 'Liga primeiro o teu telemóvel'),
            h('p', null, 'É uma vez só. No telemóvel, abre a webase, vai a Definições → Ligar do computador e toca em «Ativar». A partir daí, clicas aqui e o telemóvel mostra o aviso para ligar.'))),
        h('div', { class: 'ligar-acoes' }, ligacao('/app/definicoes/telemovel', { class: 'bt bt-p', onclick: () => d.fechar() }, 'Ver como ligar'), daqui));
      return;
    }
    const b = h('button', { class: 'bt bt-p bt-grande', type: 'button' }, icone('telefone'), 'Ligar no telemóvel');
    b.addEventListener('click', () => enviar(b));
    corpo.replaceChildren(numeroEl,
      h('p', { class: 'ligar-ajuda' }, lista.length === 1 ? `Vai aparecer um aviso no teu telemóvel (${lista[0].nome}). Tocas nele e ligas com o teu número.`
        : `Vai aparecer um aviso nos teus ${lista.length} telemóveis. Tocas num deles e ligas com o teu número.`),
      h('div', { class: 'ligar-acoes' }, b, daqui));
    b.focus();
  };

  const estadoVista = (p) => {
    const linhas = {
      pendente: ['Vê o teu telemóvel', 'Toca no aviso «Ligar a ' + (p.nome || formatarNumero(p.numero)) + '».', true],
      aberto: ['A ligar no telemóvel', ligado('chamadas') && pode('chamadas', 'c') ? 'Quando desligares, escolhe o resultado no telemóvel. Aparece aqui logo a seguir.' : 'Bom telefonema.', true],
      expirado: ['O telemóvel não respondeu', 'Confirma que tem internet e que as notificações da webase estão ligadas. Podes enviar outra vez.', false],
      cancelado: ['Cancelado no telemóvel', 'Podes enviar outra vez quando quiseres.', false],
    }[p.estado] || ['Pedido terminado', '', false];
    const [titulo, texto, aEspera] = linhas;
    const acoes = [];
    if (p.estado === 'pendente') {
      acoes.push(h('button', { class: 'bt', type: 'button', onclick: async () => {
        try { pedidoAtivo = (await post('/api/ligar/' + p.id + '/cancelar')).pedido; estadoVista(pedidoAtivo); } catch (e) { falhou(e); }
      } }, 'Cancelar'));
    }
    if (p.estado === 'expirado' || p.estado === 'cancelado') {
      const b = h('button', { class: 'bt bt-p', type: 'button' }, 'Enviar outra vez');
      b.addEventListener('click', () => enviar(b));
      acoes.push(b, daqui);
    }
    corpo.replaceChildren(
      h('div', { class: 'ligar-estado' + (aEspera ? ' a-espera' : ''), role: 'status', 'aria-live': 'polite' },
        h('span', { class: 'ligar-onda', 'aria-hidden': 'true' }, icone('telefone')),
        h('strong', null, titulo), texto ? h('p', null, texto) : null),
      acoes.length ? h('div', { class: 'ligar-acoes' }, acoes) : null);
  };

  const acompanhar = async (id) => {
    const fim = Date.now() + 30 * 60 * 1000;
    let espera = 1500;
    while (!parar && Date.now() < fim) {
      await new Promise((r) => setTimeout(r, espera));
      if (parar) return;
      let p;
      try { p = (await get('/api/ligar/' + id)).pedido; } catch (e) { espera = Math.min(espera * 2, 10000); continue; }
      const mudou = !pedidoAtivo || p.estado !== pedidoAtivo.estado;
      pedidoAtivo = p;
      if (p.estado === 'feito') {
        parar = true;
        corpo.replaceChildren(h('div', { class: 'ligar-estado', role: 'status' }, carimbo('certo'),
          h('strong', null, 'Chamada registada'), h('p', null, [NOME_RES[p.resultado] || '', p.duracao ? minutos(p.duracao) : ''].filter(Boolean).join(' · '))));
        aviso('Chamada registada pelo telemóvel.', { carimbo: true, icone: 'chamadas' });
        depois?.();
        setTimeout(() => d.fechar(), reduzido() ? 1800 : 1400);
        return;
      }
      if (p.estado === 'substituido') { parar = true; d.fechar(); return; }
      if (mudou) estadoVista(p);
      if (p.estado === 'expirado' || p.estado === 'cancelado') return;
      if (p.estado === 'aberto' && !(ligado('chamadas') && pode('chamadas', 'c'))) return;
      espera = p.estado === 'aberto' ? 3000 : 1500;
    }
  };

  async function enviar(botao) {
    try {
      const r = await aGuardar(botao, () => post('/api/ligar/pedir', { numero, cliente: cliente || null, nome: cliente ? null : nome }), 'A enviar…');
      window.estat?.('ligar', 'pedido');
      pedidoAtivo = r.pedido;
      parar = false;
      estadoVista(r.pedido);
      acompanhar(r.pedido.id);
    } catch (e) {
      if (e.dados?.codigo === 'sem_telemovel') { lista = []; cache = null; inicio(); return; }
      falhou(e);
    }
  }

  inicio();
}

// ---------------------------------------------------------------- no telemóvel: /app/ligar e /app/ligar/<id>

export async function mostrar(raiz, caminho) {
  const id = (caminho.match(/^\/app\/ligar\/([A-Za-z0-9_-]{12})$/) || [])[1];
  let p = null;
  try { p = id ? (await get('/api/ligar/' + id)).pedido : (await get('/api/ligar/pendente')).pedido; } catch (e) { if (e.estado !== 404) throw e; }
  const cab = (t, sub) => h('header', { class: 'cabeca' }, h('div', null, h('h1', null, t), sub ? h('p', { class: 'sub' }, sub) : null));

  if (!p) {
    raiz.replaceChildren(cab('Ligar'), h('div', { class: 'vazio' }, carimbo('telefone', false), h('h3', null, 'Não há chamadas à espera'),
      h('p', null, 'Quando clicares em «Ligar» no computador, o pedido aparece aqui e como aviso neste telemóvel.'),
      ligacao('/app/definicoes/telemovel', { class: 'bt' }, 'Ligar do computador')));
    return;
  }
  if (p.teste) {
    raiz.replaceChildren(cab('Está tudo pronto'), h('div', { class: 'vazio' }, carimbo('certo'), h('h3', null, 'Os avisos chegam a este telemóvel'),
      h('p', null, 'Agora, quando clicares em «Ligar» no computador, aparece um aviso igual a este. Tocas nele e ligas com o teu número.'),
      ligacao('/app', { class: 'bt bt-p' }, 'Ir para o início')));
    return;
  }
  const quem = p.nome || formatarNumero(p.numero);
  const regista = ligado('chamadas') && pode('chamadas', 'c');
  const fichaLig = p.cliente ? ligacao('/app/clientes/' + p.cliente, { class: 'bt' }, 'Abrir a ficha') : null;

  if (p.estado === 'feito') {
    raiz.replaceChildren(cab(quem), h('div', { class: 'vazio' }, carimbo('certo', false), h('h3', null, 'Esta chamada já está registada'),
      h('p', null, [NOME_RES[p.resultado], p.duracao ? minutos(p.duracao) : ''].filter(Boolean).join(' · ')), fichaLig || ligacao('/app/chamadas', { class: 'bt' }, 'Ver chamadas')));
    return;
  }
  if (['expirado', 'cancelado', 'substituido'].includes(p.estado)) {
    raiz.replaceChildren(cab(quem), h('div', { class: 'vazio' }, carimbo('relogio', false),
      h('h3', null, p.estado === 'cancelado' ? 'Este pedido foi cancelado' : p.estado === 'substituido' ? 'Há um pedido mais recente' : 'Este pedido já expirou'),
      h('p', null, 'Podes ligar na mesma: o número está aqui em baixo.'),
      h('a', { class: 'bt bt-p bt-grande', href: 'tel:' + p.numero }, icone('telefone'), 'Ligar ' + formatarNumero(p.numero))));
    return;
  }

  let inicioChamada = p.aberto ? p.aberto * 1000 : null;
  const resultado = h('div', { class: 'ligar-resultado', hidden: !p.aberto || !regista });
  const ligarBt = h('a', { class: 'bt bt-p bt-grande ligar-ja', href: 'tel:' + p.numero }, icone('telefone'), p.aberto ? 'Ligar outra vez' : 'Ligar agora');
  ligarBt.addEventListener('click', () => {
    if (!inicioChamada) inicioChamada = Date.now();
    post('/api/ligar/' + p.id + '/aberto').catch(() => {});
    window.estat?.('ligar', 'aberto');
    setTimeout(() => {
      ligarBt.lastChild.textContent = 'Ligar outra vez';
      ligarBt.classList.remove('bt-p');
      cancelar.remove();
      if (regista) { resultado.hidden = false; pintarResultado(); } else { obrigado.hidden = false; }
    }, 600);
  });
  const cancelar = h('button', { class: 'bt bt-limpo', type: 'button', onclick: async () => {
    try { await post('/api/ligar/' + p.id + '/cancelar'); aviso('Pedido cancelado.'); navegar('/app'); } catch (e) { falhou(e); }
  } }, 'Agora não');
  const obrigado = h('p', { class: 'nota-suave', hidden: true }, 'Bom telefonema. Podes voltar ao computador.');

  // duração: o tempo fora da página, desde que se tocou em «Ligar»
  const durMin = h('input', { class: 'entrada', id: 'lig-dur', inputmode: 'decimal', 'aria-describedby': 'lig-dur-a' });
  const atualizarDuracao = () => {
    if (!inicioChamada || durMin.dataset.mexido) return;
    const s = Math.max(0, Math.round((Date.now() - inicioChamada) / 1000) - 5);
    durMin.value = s ? String(Math.max(1, Math.round(s / 60))) : '';
  };
  durMin.addEventListener('input', () => { durMin.dataset.mexido = '1'; });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') atualizarDuracao(); });

  let escolhido = '';
  const grelha = h('div', { class: 'ligar-res', role: 'radiogroup', 'aria-label': 'Resultado da chamada' }, RES.map(([v, t]) => {
    const b = h('button', { type: 'button', class: 'bt', role: 'radio', 'aria-checked': 'false', dados: { v } }, t);
    b.addEventListener('click', () => {
      escolhido = v;
      grelha.querySelectorAll('button').forEach((x) => { const sim = x.dataset.v === v; x.setAttribute('aria-checked', String(sim)); x.classList.toggle('bt-p', sim); });
      limparErros(form);
    });
    return b;
  }));
  const form = h('form', { class: 'grelha', novalidate: true },
    h('fieldset', { class: 'campo', dados: { campo: 'resultado' }, style: 'border:0;padding:0;margin:0' }, h('legend', { class: 'rotulo', style: 'margin-bottom:8px' }, 'Como correu?'), grelha),
    h('div', { class: 'campo' }, h('label', { for: 'lig-dur' }, 'Duração (minutos)'), durMin,
      h('span', { class: 'ajuda', id: 'lig-dur-a' }, 'Contada desde que tocaste em «Ligar». Corrige se precisares.')),
    campo({ nome: 'notas', rotulo: 'Notas', tipo: 'textarea', linhas: 3, placeholder: 'O que ficou combinado' }),
    campo({ nome: 'seguimento', rotulo: 'Voltar a ligar em', tipo: 'datetime-local', ajuda: 'Opcional. Aparece no início nesse dia.' }),
    h('button', { class: 'bt bt-p bt-grande', type: 'submit' }, 'Guardar resultado'));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault(); limparErros(form);
    const dd = lerForm(form);
    const corpoPedido = { resultado: escolhido, notas: dd.notas || '', seguimento: dd.seguimento || null,
      duracao: Math.round(Number(String(durMin.value || '0').replace(',', '.')) * 60) || 0 };
    try {
      const r = await aGuardar(form.querySelector('button[type=submit]'), () => post('/api/ligar/' + p.id + '/resultado', corpoPedido));
      raiz.replaceChildren(cab(quem), h('div', { class: 'vazio' }, carimbo('certo'), h('h3', null, 'Chamada registada'),
        h('p', null, [NOME_RES[r.chamada.resultado], r.chamada.duracao ? minutos(r.chamada.duracao) : ''].filter(Boolean).join(' · ') + '. O computador já sabe.'),
        h('div', { class: 'ligar-acoes' }, fichaLig, ligacao('/app/chamadas', { class: 'bt' }, 'Ver chamadas'))));
      window.estat?.('ligar', 'registada');
    } catch (e) { mostrarErro(form, e); }
  });
  function pintarResultado() { atualizarDuracao(); }
  resultado.append(h('section', { class: 'ficha' }, form));
  if (!resultado.hidden) pintarResultado();

  raiz.replaceChildren(cab(quem, 'Pedido do computador · ' + relativo(p.criado)),
    h('section', { class: 'ficha ligar-tel' },
      h('p', { class: 'ligar-numero' }, formatarNumero(p.numero)),
      h('div', { class: 'ligar-acoes' }, ligarBt, p.aberto ? null : cancelar),
      obrigado,
      fichaLig && !regista ? fichaLig : null),
    resultado);
}

// ---------------------------------------------------------------- definições: ligar o telemóvel

function nomeAparelho() {
  const ua = navigator.userAgent;
  const sist = /Android/.test(ua) ? 'Android' : eIOS() ? (/iPad/.test(ua) ? 'iPad' : 'iPhone') : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Aparelho';
  const nav = /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /OPR\//.test(ua) ? 'Opera'
    : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  return nav ? sist + ' · ' + nav : sist;
}

function chaveBytes(b64) {
  const s = atob((b64 + '='.repeat((4 - b64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (ch) => ch.charCodeAt(0));
}

async function subscricaoAtual() {
  if (!temPush()) return null;
  const reg = await navigator.serviceWorker.getRegistration('/app/');
  return reg ? reg.pushManager.getSubscription() : null;
}

export async function ativarAqui(chave) {
  const reg = await navigator.serviceWorker.register('/app/sw.js', { scope: '/app/' });
  await navigator.serviceWorker.ready;
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error(perm === 'denied' ? 'As notificações estão bloqueadas para a webase neste browser. Desbloqueia nas definições do site (o cadeado ao lado do endereço) e tenta outra vez.' : 'Sem autorização para notificações, a webase não consegue avisar este telemóvel.');
  let sub = await reg.pushManager.getSubscription();
  const chaveAtual = sub?.options?.applicationServerKey;
  if (sub && chaveAtual && btoa(String.fromCharCode(...new Uint8Array(chaveAtual))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') !== chave) {
    await sub.unsubscribe(); sub = null;
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveBytes(chave) });
  return post('/api/ligar/dispositivos', { endpoint: sub.endpoint, nome: nomeAparelho() });
}

export async function secaoTelemovel(redesenhar) {
  const r = await meusTelemoveis(true);
  const atual = await subscricaoAtual().catch(() => null);
  const naoDa = !temPush();
  const iosSemIcone = eIOS() && !instalada();
  const bloqueado = temPush() && Notification.permission === 'denied';

  const lista = r.dispositivos.length ? h('div', { class: 'lista' }, r.dispositivos.map((x) => {
    return h('div', { class: 'linha' },
      h('span', { class: 'icone-linha' }, icone('telefone')),
      h('span', { class: 'principal-l' }, h('span', { class: 't' }, x.nome),
        h('span', { class: 's' }, 'Ligado ' + relativo(x.criado) + (x.usado ? ' · último aviso ' + relativo(x.usado) : '') + (x.falhas >= 3 ? ' · os últimos avisos falharam' : ''))),
      h('button', { class: 'bt bt-pq', type: 'button', onclick: async (ev) => {
        try { await aGuardar(ev.currentTarget, () => post('/api/ligar/dispositivos/' + x.id + '/testar'), 'A enviar…'); aviso('Aviso de teste enviado. Vê o telemóvel.'); } catch (e) { falhou(e); }
      } }, 'Testar'),
      h('button', { class: 'bt bt-pq bt-limpo bt-perigo', type: 'button', onclick: async () => {
        try { await post('/api/ligar/dispositivos/' + x.id + '/apagar'); cache = null; aviso('Telemóvel desligado.'); redesenhar(); } catch (e) { falhou(e); }
      } }, 'Desligar'));
  })) : h('p', { class: 'nota-suave' }, 'Ainda não ligaste nenhum telemóvel.');

  let ativar;
  if (eTelemovel() || !r.dispositivos.length) {
    if (naoDa && iosSemIcone) {
      ativar = h('div', { class: 'nota-suave' }, h('strong', null, 'No iPhone, falta um passo. '),
        'No Safari, toca em Partilhar → «Adicionar ao ecrã principal». Abre a webase pelo ícone novo, entra e volta aqui. O iPhone só deixa sites mostrar avisos assim (iOS 16.4 ou mais recente).');
    } else if (naoDa) {
      ativar = h('p', { class: 'nota-suave' }, 'Este browser não recebe avisos. No telemóvel, usa o Chrome (Android) ou o Safari a partir do ícone no ecrã principal (iPhone).');
    } else if (bloqueado) {
      ativar = h('p', { class: 'nota-suave' }, 'As notificações da webase estão bloqueadas neste browser. Desbloqueia nas definições do site e volta aqui.');
    } else if (eTelemovel()) {
      const b = h('button', { class: 'bt bt-p', type: 'button' }, icone('telefone'), atual ? 'Voltar a ativar neste telemóvel' : 'Ativar neste telemóvel');
      b.addEventListener('click', async () => {
        try {
          await aGuardar(b, () => ativarAqui(r.chave), 'A ativar…');
          cache = null; aviso('Telemóvel ligado. Experimenta clicar em «Ligar» no computador.', { carimbo: true, icone: 'telefone' }); redesenhar();
        } catch (e) { falhou(e); }
      });
      ativar = h('div', null, b);
    } else {
      ativar = h('div', { class: 'nota-suave' }, h('strong', null, 'Faz isto no telemóvel: '),
        'abre ', h('span', { class: 'mono-curto' }, location.host + '/app/definicoes/telemovel'), ', entra com a tua conta e toca em «Ativar neste telemóvel».');
    }
  }

  return [h('section', { class: 'ficha grelha', style: 'gap:16px' },
    h('header', null, h('h2', null, 'Ligar do computador')),
    h('p', { style: 'color:var(--tinta2);max-width:62ch' },
      'Clicas em «Ligar» no computador e o teu telemóvel mostra um aviso. Tocas nele e a chamada sai do teu número. No fim, escolhes o resultado no telemóvel e fica registado na ficha.'),
    h('ol', { class: 'passos-ligar' },
      h('li', null, h('strong', null, 'No telemóvel: '), 'ativa os avisos aqui, uma vez.'),
      h('li', null, h('strong', null, 'No computador: '), 'clica em «Ligar» numa ficha ou em Chamadas.'),
      h('li', null, h('strong', null, 'No telemóvel: '), 'toca no aviso, liga e escolhe como correu.')),
    ativar || null),
  h('section', { class: 'ficha grelha', style: 'gap:12px' }, h('header', null, h('h2', null, 'Telemóveis ligados')), lista,
    h('p', { style: 'color:var(--tinta2);font-size:14px' }, 'Os avisos não levam o número nem o nome: o telemóvel vai buscá-los à webase com a tua sessão.'))];
}

