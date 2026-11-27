// Perfis neste aparelho (nome, personagem e mundo de cada um) e conta opcional na nuvem para levar o perfil para outro aparelho.
// A nuvem é o Supabase: o browser só chama as funções kg_* (nome + palavra-passe → token de sessão). A chave abaixo é pública por natureza.
const SUPA = 'https://hvvvswhwcpavucwrvlsf.supabase.co', KEY = 'sb_publishable_aGAxV-VSm1YIjgd-sXWDgQ_dJkhYFpa';
const LS = {
  get: k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); return true; } catch (e) { return false; } },
  raw: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  del: k => { try { localStorage.removeItem(k); } catch (e) { } },
};
const novoId = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export const NOME_OK = /^[A-Za-z0-9_À-ÖØ-öø-ÿ-]{3,16}$/;

export function perfis() {
  let P = LS.get('kg.perfis');
  if (!P || !Array.isArray(P.lista)) {
    P = { ativo: null, lista: [] };
    const old = LS.raw('kurogane-save-v1'); // gravação antiga (antes dos perfis): passa para um perfil
    if (old) { const id = novoId(); P.lista.push({ id, nome: '', criado: Date.now() }); P.ativo = id; LS.set('kg.save.' + id, old); LS.del('kurogane-save-v1'); }
    LS.set('kg.perfis', P);
  }
  return P;
}
const guardaP = P => LS.set('kg.perfis', P);
export const ativo = () => { const P = perfis(); return P.lista.find(p => p.id === P.ativo) || null; };
export function criar(nome) { const P = perfis(), id = novoId(); P.lista.push({ id, nome, criado: Date.now() }); P.ativo = id; guardaP(P); return id; }
export function escolher(id) { const P = perfis(); if (P.lista.some(p => p.id === id)) { P.ativo = id; guardaP(P); } }
export function setLook(look) { const P = perfis(), a = P.lista.find(p => p.id === P.ativo); if (a) { a.look = look; guardaP(P); } }
export function renomear(nome) { const P = perfis(), a = P.lista.find(p => p.id === P.ativo); if (a) { a.nome = nome; guardaP(P); } }
export function apagar(id) { const P = perfis(); P.lista = P.lista.filter(p => p.id !== id); if (P.ativo === id) P.ativo = P.lista[0] ? P.lista[0].id : null; guardaP(P); LS.del('kg.save.' + id); LS.del('kg.mundo.' + id); }
const k = s => 'kg.' + s + '.' + ((ativo() || {}).id || 'x');
export const lerPersonagem = () => { const s = LS.get(k('save')); return s && s.v === 1 ? s : null; };
export const lerMundo = () => { const s = LS.get(k('mundo')); return s && s.v === 1 ? s : null; };
export const gravarPersonagem = s => LS.set(k('save'), s);
export const gravarMundo = s => LS.set(k('mundo'), s);
export const apagarPersonagem = () => LS.del(k('save'));
export const apagarMundo = () => LS.del(k('mundo'));

// ---------- nuvem
const rpc = async (fn, body, keepalive = false) => {
  const r = await fetch(SUPA + '/rest/v1/rpc/' + fn, { method: 'POST', keepalive, headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch (e) { }
  if (!r.ok) { const m = (j && (j.message || j.hint)) || 'rede'; throw new Error(m); }
  if (j && j.erro) throw new Error(j.erro);
  return j;
};
export const MSG = { nome_invalido: 'O nome tem de ter 3 a 16 letras, números, - ou _.', pass_invalida: 'A palavra-passe tem de ter pelo menos 6 caracteres.', nome_ocupado: 'Esse nome já tem conta. Escolhe outro ou entra.', demasiados_registos: 'Muitas contas criadas daqui hoje. Tenta amanhã.', credenciais: 'Nome ou palavra-passe errados.', bloqueada: 'Muitas tentativas falhadas. Espera 10 minutos.', sessao: 'A sessão acabou. Entra outra vez.', grande: 'A gravação é demasiado grande.', rede: 'Sem ligação ao servidor. O jogo continua guardado neste aparelho.' };
export const conta = () => (ativo() || {}).conta || null;
const ligar = (nome, token) => { const P = perfis(), a = P.lista.find(p => p.id === P.ativo); if (a) { a.conta = { nome, token }; if (!a.nome) a.nome = nome; guardaP(P); } };
export async function registar(nome, pass) { const j = await rpc('kg_registar', { p_nome: nome, p_pass: pass }); ligar(j.nome, j.token); return j; }
export async function entrar(nome, pass) {
  const j = await rpc('kg_entrar', { p_nome: nome, p_pass: pass });
  // entrar leva-te para o perfil dessa conta neste aparelho (cria-o se ainda não existir)
  const P = perfis(); let a = P.lista.find(p => p.conta && p.conta.nome.toLowerCase() === j.nome.toLowerCase());
  if (!a) { const cur = P.lista.find(p => p.id === P.ativo); if (cur && !cur.conta && !LS.raw('kg.save.' + cur.id) && !LS.raw('kg.mundo.' + cur.id)) a = cur; else { a = { id: novoId(), nome: j.nome, criado: Date.now() }; P.lista.push(a); } }
  a.conta = { nome: j.nome, token: j.token }; a.nome = a.nome || j.nome; P.ativo = a.id; guardaP(P);
  return j;
}
export async function sair() { const c = conta(); const P = perfis(), a = P.lista.find(p => p.id === P.ativo); if (a) { delete a.conta; guardaP(P); } if (c) try { await rpc('kg_sair', { p_token: c.token }); } catch (e) { } }
// traz da nuvem e fica com o mais recente (nuvem ou aparelho)
export async function sincronizar() {
  const c = conta(); if (!c) return 'sem conta';
  const j = await rpc('kg_carregar', { p_token: c.token });
  const local = lerPersonagem(), lq = Math.max(local ? local.when || 0 : 0, (lerMundo() || {}).when || 0);
  { const lc = LS.get('kurogane-cfg-v1'), nc = j && j.dados && j.dados.cfg; if (nc && nc.v && (nc.ts || 0) > ((lc && lc.ts) || 0)) { LS.set('kurogane-cfg-v1', nc); try { window.G && G.ui && G.ui.cfgCloud && G.ui.cfgCloud(); } catch (e) { } } } // definições da nuvem se forem mais recentes
  if (j && j.dados && (j.quando || 0) > lq) { if (j.dados.char) gravarPersonagem(j.dados.char); else apagarPersonagem(); if (j.dados.world) gravarMundo(j.dados.world); return 'nuvem'; }
  if (lq) { await enviar(true); return 'aparelho'; }
  return 'vazio';
}
let ultimo = 0, pendente = null;
export async function enviar(ja = false, keepalive = false) {
  const c = conta(); if (!c) return;
  const now = Date.now(); if (!ja && now - ultimo < 30000) { if (!pendente) pendente = setTimeout(() => { pendente = null; enviar(true); }, 30000 - (now - ultimo)); return; }
  ultimo = now; const ch = lerPersonagem(), w = lerMundo(), cfg = LS.get('kurogane-cfg-v1'), dados = { char: ch, world: w, cfg }, quando = Math.max(ch ? ch.when || 0 : 0, w ? w.when || 0 : 0, cfg ? cfg.ts || 0 : 0) || now; // as definições também vão para a nuvem
  const body = { p_token: c.token, p_dados: dados, p_quando: quando };
  if (keepalive && JSON.stringify(body).length > 60000) keepalive = false;
  try { await rpc('kg_guardar', body, keepalive); return true; } catch (e) { if (e.message === 'sessao') { const P = perfis(), a = P.lista.find(p => p.id === P.ativo); if (a) { delete a.conta; guardaP(P); } } return false; }
}
