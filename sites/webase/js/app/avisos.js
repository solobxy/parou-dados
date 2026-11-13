// webase — avisos da conta (marketplace, partilhas, respostas no fórum).
import { estado, h, icone, get, post, relativo, ligacao, vazio } from './nucleo.js';

const IC = { mk: 'marketplace', partilha: 'partilha', forum: 'forum' };

export async function mostrar(raiz) {
  const r = await get('/api/avisos');
  if (estado.eu.avisos) { post('/api/avisos/lidos').catch(() => {}); estado.eu.avisos = 0; document.querySelectorAll('.conta-n').forEach((x) => x.remove()); }
  raiz.replaceChildren(
    h('header', { class: 'cabeca' }, h('div', null, h('h1', null, 'Avisos'))),
    r.avisos.length ? h('section', { class: 'ficha' }, h('div', { class: 'lista' }, r.avisos.map((a) => {
      const corpo = [h('span', { class: 'icone-linha' + (a.lido ? '' : ' acento') }, icone(IC[a.tipo] || 'sino')),
        h('span', { class: 'principal-l' }, h('span', { class: 't', style: 'white-space:normal' }, a.texto), h('span', { class: 's' }, relativo(a.quando)))];
      return a.ligacao && a.ligacao.startsWith('/app') ? ligacao(a.ligacao, { class: 'linha' }, corpo) : h('div', { class: 'linha' }, corpo);
    }))) : vazio({ titulo: 'Sem avisos', icone: 'sino', texto: 'Quando alguém responder no fórum, partilhar contactos contigo ou quiser comprar uma base tua, aparece aqui.' }));
}
