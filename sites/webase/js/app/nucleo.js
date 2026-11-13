// webase — peças comuns da app: elementos, ícones, pedidos à API, formatos PT, avisos, folhas e formulários.
// Regra: nunca innerHTML com dados de pessoas. Tudo passa por textContent (função h).

export const estado = { eu: null, rotas: [], publico: null };

// replaceChildren/append/prepend nativos escrevem «null» quando recebem null: aqui ignoram null, undefined e false
for (const nome of ['replaceChildren', 'append', 'prepend']) {
  const orig = Element.prototype[nome];
  Element.prototype[nome] = function (...f) { return orig.apply(this, f.flat(Infinity).filter((x) => x !== null && x !== undefined && x !== false)); };
}

export function h(tag, attrs, ...filhos) {
  const el = document.createElementNS(tag === 'svg' || tag === 'path' || tag === 'circle' ? 'http://www.w3.org/2000/svg' : 'http://www.w3.org/1999/xhtml', tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.setAttribute('class', v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'dados') for (const [dk, dv] of Object.entries(v)) el.dataset[dk] = dv;
      else if (k === 'html') throw new Error('html proibido');
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  for (const f of filhos.flat(Infinity)) {
    if (f === null || f === undefined || f === false) continue;
    el.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
  return el;
}

const P = {
  inicio: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  clientes: 'M16 20c0-2.5-2-4.5-4.5-4.5h-3C6 15.5 4 17.5 4 20M10 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM20.5 20c0-2-1.2-3.7-3-4.3M15.5 4.3a4 4 0 0 1 0 7.4',
  leads: 'M3 4h18l-7 8.5V19l-4 2v-8.5z',
  chamadas: 'M5 4h3.5l2 5-2.6 1.6a11 11 0 0 0 5.5 5.5L15 13.5l5 2V19a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
  contratos: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4',
  pontos: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  adesoes: 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3',
  marketplace: 'M4 9l1.5-5h13L20 9M4 9v11h16V9M10 20v-5h4v5M4 9h16',
  forum: 'M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 20 12zM8.5 10.5h7M8.5 13.5h4',
  equipa: 'M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6zM9 12l2 2 4-4',
  definicoes: 'M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4',
  sino: 'M6 16v-5a6 6 0 1 1 12 0v5l2 2H4zM10 21h4',
  mais: 'M12 5v14M5 12h14',
  procurar: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4.2-4.2',
  fechar: 'M6 6l12 12M18 6 6 18',
  voltar: 'M15 18l-6-6 6-6',
  seta: 'M9 6l6 6-6 6',
  sair: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11',
  descarregar: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  enviar: 'M12 20V9M7 14l5-5 5 5M5 4h14',
  certo: 'M5 12.5l4.5 4.5L19 7',
  lixo: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  editar: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  pontinhos: 'M5 12h.01M12 12h.01M19 12h.01',
  gosto: 'M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.1a4.3 4.3 0 0 1 7.5 2.7C19.5 15.4 12 20 12 20z',
  entra: 'M17 7 7 17M7 9v8h8',
  sai_: 'M7 17 17 7M9 7h8v8',
  relogio: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  presente: 'M4 11h16v10H4zM3 7h18v4H3zM12 7v14M12 7C10.5 4 7 4 7 6s3 1 5 1c2 0 5 1 5-1s-3.5-2-5 1',
  nota: 'M5 4h14v11l-5 5H5zM14 20v-5h5',
  partilha: 'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4',
  telefone: 'M5 4h3.5l2 5-2.6 1.6a11 11 0 0 0 5.5 5.5L15 13.5l5 2V19a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
  email: 'M3 6h18v12H3zM3 7l9 6 9-6',
  pacote: 'M3 8l9-5 9 5v8l-9 5-9-5zM3 8l9 5 9-5M12 13v8',
  ganho: 'M5 12.5l4.5 4.5L19 7',
  alerta: 'M12 4l9 16H3zM12 10v4M12 17h.01',
  olho: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  lua: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  admin: 'M3 21h18M5 21V10l7-6 7 6v11M9 21v-6h6v6',
};

export function icone(nome, extra = {}) {
  const svg = h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': nome === 'pontinhos' ? 3 : 1.8,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false', ...extra });
  svg.append(h('path', { d: P[nome] || P.mais }));
  return svg;
}

export function logoWb() {
  const svg = h('svg', { viewBox: '0 0 32 32', 'aria-hidden': 'true', fill: 'none' });
  svg.append(h('circle', { cx: 16, cy: 16, r: 13, stroke: 'currentColor', 'stroke-width': 3 }));
  svg.append(h('path', { d: 'M8.6 16.2C9.4 19.6 10.6 22 12.4 22C14.2 22 15.2 19.4 16 17.6C16.8 19.4 17.8 22 19.6 22C21.4 22 22.6 19.6 23.4 16.2', stroke: 'currentColor', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  svg.append(h('circle', { cx: 16, cy: 10.8, r: 2.2, fill: 'currentColor' }));
  return svg;
}

export function carimbo(nomeIcone = 'certo', pousa = true) {
  return h('span', { class: 'carimbo' + (pousa ? ' pousa' : ''), 'aria-hidden': 'true' }, icone(nomeIcone, { 'stroke-width': 2.4 }));
}

// ---------------------------------------------------------------- pedidos à API

export class ErroApi extends Error {
  constructor(estado, dados) { super(dados?.erro || 'Algo correu mal. Tenta outra vez.'); this.estado = estado; this.dados = dados || {}; }
}

export async function api(metodo, caminho, corpo) {
  const op = { method: metodo, headers: { 'X-Wb': '1' }, credentials: 'same-origin' };
  if (metodo !== 'GET') { op.headers['Content-Type'] = 'application/json'; op.body = JSON.stringify(corpo || {}); }
  let r;
  try { r = await fetch(caminho, op); } catch {
    throw new ErroApi(0, { erro: 'Sem ligação à internet. Confirma a rede e tenta outra vez.' });
  }
  let dados = {};
  try { dados = await r.json(); } catch { /* resposta sem JSON */ }
  if (!r.ok) {
    if (r.status === 401 && !caminho.startsWith('/api/conta/')) { estado.eu = null; window.dispatchEvent(new CustomEvent('wb:sessao')); }
    if (r.status === 403 && dados.trocar_senha) window.dispatchEvent(new CustomEvent('wb:trocar-senha'));
    throw new ErroApi(r.status, dados);
  }
  return dados;
}
export const get = (c) => api('GET', c);
export const post = (c, d) => api('POST', c, d);

export async function descarregar(caminho) {
  const r = await fetch(caminho, { headers: { 'X-Wb': '1' }, credentials: 'same-origin' });
  if (!r.ok) { let d = {}; try { d = await r.json(); } catch {} throw new ErroApi(r.status, d); }
  const blob = await r.blob();
  const nome = (r.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/)?.[1] || 'webase.csv';
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: nome });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ---------------------------------------------------------------- formatos PT

const fEur = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });
const fNum = new Intl.NumberFormat('pt-PT');
export const euros = (c) => fEur.format((c || 0) / 100);
export const num = (n) => fNum.format(n || 0);
const fData = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Lisbon' });
const fDataHora = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Lisbon' });
const fHora = new Intl.DateTimeFormat('pt-PT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Lisbon' });
const fDiaMes = new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'long', timeZone: 'Europe/Lisbon' });
export const data = (ts) => ts ? fData.format(new Date(ts * 1000)) : '';
export const dataHora = (ts) => ts ? fDataHora.format(new Date(ts * 1000)) : '';
export const hora = (ts) => ts ? fHora.format(new Date(ts * 1000)) : '';
export const diaMes = (ts) => ts ? fDiaMes.format(new Date(ts * 1000)) : '';
export const dataIso = (s) => s && s.length === 10 ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '';

export function relativo(ts) {
  if (!ts) return '';
  const d = Date.now() / 1000 - ts;
  if (d < 0) {
    const f = -d;
    if (f < 3600) return `daqui a ${Math.max(1, Math.round(f / 60))} min`;
    if (f < 86400) return `hoje às ${hora(ts)}`;
    if (f < 172800) return `amanhã às ${hora(ts)}`;
    return dataHora(ts);
  }
  if (d < 60) return 'agora';
  if (d < 3600) return `há ${Math.round(d / 60)} min`;
  if (d < 86400) return `há ${Math.round(d / 3600)} h`;
  if (d < 172800) return 'ontem';
  if (d < 7 * 86400) return `há ${Math.round(d / 86400)} dias`;
  return data(ts);
}

export function agoraLocal(deslocMin = 0) {
  const d = new Date(Date.now() + deslocMin * 60000);
  const p = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  return p.replace(' ', 'T').slice(0, 16);
}
export function hojeIso() { return agoraLocal().slice(0, 10); }
export function tsParaLocal(ts) {
  if (!ts) return '';
  const p = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ts * 1000));
  return p.replace(' ', 'T').slice(0, 16);
}
export const centParaTexto = (c) => c ? String((c / 100).toFixed(2)).replace('.', ',').replace(/,00$/, '') : '';

export function iniciais(nome) {
  const p = (nome || '?').trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || '?') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}
export function avatar(nome, empresa = false) { return h('span', { class: 'avatar' + (empresa ? ' empresa' : ''), 'aria-hidden': 'true' }, iniciais(nome)); }
export const plural = (n, um, varios) => `${num(n)} ${n === 1 ? um : varios}`;
export function minutos(s) { s = s || 0; return s >= 60 ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s` : `${s} s`; }

// ---------------------------------------------------------------- avisos rápidos

let caixaToasts;
export function aviso(texto, { erro = false, carimbo: comCarimbo = false, icone: ic = 'certo' } = {}) {
  if (!caixaToasts) { caixaToasts = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(caixaToasts); }
  const t = h('div', { class: 'toast' + (erro ? ' erro' : '') }, comCarimbo ? carimbo(ic) : null, h('span', null, texto));
  caixaToasts.append(t);
  setTimeout(() => { t.classList.add('sai'); setTimeout(() => t.remove(), 200); }, erro ? 6000 : 3600);
}
export function falhou(e) { aviso(e?.message || 'Algo correu mal. Tenta outra vez.', { erro: true }); }

// ---------------------------------------------------------------- folhas (diálogos)

export function folha({ titulo, corpo, pe, larga = false, aoFechar } = {}) {
  const bFechar = h('button', { class: 'bt bt-icone bt-limpo', type: 'button', 'aria-label': 'Fechar' }, icone('fechar'));
  const titEl = h('h2', { id: 'f' + Math.random().toString(36).slice(2) }, titulo);
  const d = h('dialog', { class: 'folha' + (larga ? ' larga' : ''), 'aria-labelledby': titEl.id },
    h('div', { class: 'folha-cabeca' }, titEl, bFechar),
    h('div', { class: 'folha-corpo' }, corpo),
    pe ? h('div', { class: 'folha-pe' }, pe) : null);
  const fechar = () => { if (d.open) d.close(); };
  bFechar.addEventListener('click', fechar);
  d.addEventListener('click', (e) => { if (e.target === d) fechar(); });
  d.addEventListener('close', () => { d.remove(); aoFechar?.(); });
  document.body.append(d);
  d.showModal();
  const primeiro = d.querySelector('input:not([type=hidden]):not([type=checkbox]), select, textarea');
  if (primeiro && window.matchMedia('(min-width: 900px)').matches) primeiro.focus();
  d.fechar = fechar;
  return d;
}

export function confirmar({ titulo, texto, sim = 'Confirmar', perigo = false }) {
  return new Promise((resolve) => {
    let r = false;
    const bSim = h('button', { class: 'bt ' + (perigo ? 'bt-perigo cheio' : 'bt-p'), type: 'button' }, sim);
    const bNao = h('button', { class: 'bt', type: 'button' }, 'Cancelar');
    const d = folha({ titulo, corpo: h('p', null, texto), pe: [bNao, bSim], aoFechar: () => resolve(r) });
    bSim.addEventListener('click', () => { r = true; d.fechar(); });
    bNao.addEventListener('click', () => d.fechar());
  });
}

// ---------------------------------------------------------------- formulários

let nId = 0;
export function campo({ nome, rotulo, tipo = 'text', valor = '', obrig = false, ajuda, opcoes, autocomplete, inputmode, min, max, passo, linhas, placeholder, maxlength }) {
  const id = 'c' + (++nId);
  let el;
  if (tipo === 'select') {
    el = h('select', { id, name: nome, required: obrig });
    for (const o of opcoes || []) {
      const [v, t] = Array.isArray(o) ? o : [o.v ?? o.id, o.t ?? o.nome];
      el.append(h('option', { value: v, selected: String(v) === String(valor ?? '') }, t));
    }
  } else if (tipo === 'textarea') {
    el = h('textarea', { id, name: nome, required: obrig, rows: linhas || 4, placeholder, maxlength });
    el.value = valor ?? '';
  } else {
    el = h('input', { id, name: nome, type: tipo, required: obrig, autocomplete, inputmode, min, max, step: passo, placeholder, maxlength });
    el.value = valor ?? '';
  }
  const idAjuda = ajuda ? id + 'a' : null;
  if (idAjuda) el.setAttribute('aria-describedby', idAjuda);
  return h('div', { class: 'campo', dados: { campo: nome } },
    h('label', { for: id }, rotulo, obrig ? null : h('span', { class: 'so-leitor' }, ' (opcional)')),
    el, ajuda ? h('span', { class: 'ajuda', id: idAjuda }, ajuda) : null);
}

export function opcao({ nome, rotulo, marcado = false, tipo = 'checkbox', valor }) {
  return h('label', { class: 'opcao' }, h('input', { type: tipo, name: nome, checked: marcado, value: valor }), h('span', null, rotulo));
}

export function lerForm(form) {
  const d = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') d[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) d[el.name] = el.value; }
    else d[el.name] = el.value.trim();
  }
  return d;
}

export function limparErros(form) {
  form.querySelectorAll('.campo.erro').forEach((c) => c.classList.remove('erro'));
  form.querySelectorAll('.erro-campo, .erro-geral').forEach((e) => e.remove());
}

export function mostrarErro(form, e) {
  limparErros(form);
  const nomeCampo = e?.dados?.campo;
  const alvo = nomeCampo && form.querySelector(`.campo[data-campo="${CSS.escape(nomeCampo)}"]`);
  if (alvo) {
    alvo.classList.add('erro');
    const msg = h('span', { class: 'erro-campo', role: 'alert' }, e.message);
    alvo.append(msg);
    const inp = alvo.querySelector('input, select, textarea');
    inp?.setAttribute('aria-invalid', 'true');
    inp?.focus();
  } else {
    form.prepend(h('div', { class: 'erro-geral', role: 'alert' }, e?.message || 'Algo correu mal. Tenta outra vez.'));
  }
}

// botão que mostra «A guardar…» enquanto o pedido corre
export async function aGuardar(botao, fn, texto = 'A guardar…') {
  const antes = botao.textContent;
  botao.disabled = true;
  botao.textContent = texto;
  try { return await fn(); } finally { botao.disabled = false; botao.textContent = antes; }
}

// formulário numa folha: valida, envia, mostra erros junto ao campo
export function formFolha({ titulo, campos, botao = 'Guardar', enviar, larga = false, extraPe = [] }) {
  const form = h('form', { novalidate: true, class: 'grelha' }, campos);
  const bOk = h('button', { class: 'bt bt-p', type: 'submit' }, botao);
  const bNao = h('button', { class: 'bt', type: 'button' }, 'Cancelar');
  const d = folha({ titulo, corpo: form, pe: [...extraPe, bNao, bOk], larga });
  bNao.addEventListener('click', () => d.fechar());
  bOk.setAttribute('form', form.id = 'ff' + (++nId));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    limparErros(form);
    try {
      await aGuardar(bOk, () => enviar(lerForm(form), form, d));
    } catch (e) {
      if (e instanceof ErroApi) mostrarErro(form, e); else { console.error(e); mostrarErro(form, { message: 'Algo correu mal. Tenta outra vez.' }); }
    }
  });
  return { form, folha: d };
}

export function vazio({ titulo, texto, acao, icone: ic = 'mais' }) {
  return h('div', { class: 'vazio' }, carimbo(ic, false), h('h3', null, titulo), texto ? h('p', null, texto) : null, acao || null);
}

export function carregando() { return h('div', { class: 'carregar', role: 'status', 'aria-label': 'A carregar' }); }

export function erroBloco(e, tentar) {
  return h('div', { class: 'vazio' }, h('h3', null, 'Não conseguimos carregar isto'), h('p', null, e?.message || ''),
    tentar ? h('button', { class: 'bt', type: 'button', onclick: tentar }, 'Tentar outra vez') : null);
}

export function pode(mod, acao = 'v') {
  const eu = estado.eu;
  if (!eu) return false;
  if (!eu.conta.modulos.includes(mod)) return false;
  return (eu.perm.m[mod] || '').includes(acao);
}
export const podeX = (x) => !!estado.eu?.perm.x.includes(x);
export const ligado = (mod) => !!estado.eu?.conta.modulos.includes(mod);

export function navegar(caminho, substituir = false) {
  if (substituir) history.replaceState(null, '', caminho); else history.pushState(null, '', caminho);
  window.dispatchEvent(new CustomEvent('wb:rota'));
}

export function ligacao(caminho, attrs, ...filhos) {
  return h('a', { href: caminho, ...attrs, onclick: (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault(); navegar(caminho);
  } }, ...filhos);
}

export function estadoTxt(tipo, texto) { return h('span', { class: 'estado ' + tipo }, texto); }

export function debounce(fn, ms = 250) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// procura de clientes num campo (para chamadas, contratos, pontos, pacotes)
export function escolherCliente({ nome = 'cliente', rotulo = 'Cliente', obrig = true, inicial = null, ajuda } = {}) {
  const oculto = h('input', { type: 'hidden', name: nome, value: inicial?.id || '' });
  const id = 'c' + (++nId);
  const inp = h('input', { id, type: 'search', autocomplete: 'off', placeholder: 'Escreve o nome, telefone ou e-mail', role: 'combobox',
    'aria-expanded': 'false', 'aria-controls': id + 'l', 'aria-autocomplete': 'list' });
  inp.value = inicial?.nome || '';
  const lista = h('div', { id: id + 'l', role: 'listbox', class: 'lista', style: 'max-height:240px;overflow:auto' });
  const escolher = (c) => { oculto.value = c.id; inp.value = c.nome; lista.replaceChildren(); inp.setAttribute('aria-expanded', 'false'); wrap.dispatchEvent(new CustomEvent('escolhido', { detail: c })); };
  const procurar = debounce(async () => {
    oculto.value = '';
    const q = inp.value.trim();
    if (q.length < 1) { lista.replaceChildren(); return; }
    try {
      const r = await get('/api/clientes?q=' + encodeURIComponent(q));
      lista.replaceChildren(...r.itens.slice(0, 8).map((c) => h('button', { type: 'button', class: 'linha', role: 'option', onclick: () => escolher(c) },
        avatar(c.nome, c.tipo === 'empresa'), h('span', { class: 'principal-l' }, h('span', { class: 't' }, c.nome),
          h('span', { class: 's' }, [c.telefone, c.email].filter(Boolean).join(' · '))))));
      if (!r.itens.length) lista.replaceChildren(h('p', { class: 'ajuda', style: 'padding:8px 4px' }, 'Nenhum cliente encontrado.'));
      inp.setAttribute('aria-expanded', 'true');
    } catch { /* ignora */ }
  });
  inp.addEventListener('input', procurar);
  const wrap = h('div', { class: 'campo', dados: { campo: nome } }, h('label', { for: id }, rotulo), oculto, inp, lista,
    ajuda ? h('span', { class: 'ajuda' }, ajuda) : null);
  wrap.oculto = oculto;
  return wrap;
}
