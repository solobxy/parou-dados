// webase — definições: negócio, módulos, marca (cor e logótipo), campos, fases, pontos, plano, segurança e conta.
import { estado, h, icone, get, post, ligacao, navegar, campo, opcao, aviso, falhou, confirmar, podeX, lerForm, limparErros, mostrarErro,
  aGuardar, relativo, data, descarregar, carimbo, iniciais, vazio } from './nucleo.js';
import { MODS, DESCR } from './main.js';
import { secaoTelemovel } from './ligar.js';

const CORES = ['#2B3FD6', '#0B5CAD', '#0F766E', '#1E7A4C', '#7A5A00', '#9A3412', '#B42318', '#A21CAF', '#6D28D9', '#14161B'];
const SECOES = [
  ['negocio', 'Negócio', 'definicoes'], ['modulos', 'Módulos', 'definicoes'], ['marca', 'Marca', 'definicoes'], ['campos', 'Campos da ficha', 'definicoes'],
  ['fases', 'Fases das leads', 'definicoes'], ['pontos', 'Pontos', 'definicoes'], ['telemovel', 'Ligar do computador', null], ['plano', 'Plano', null], ['seguranca', 'Segurança e aparência', null], ['conta', 'Dados e conta', null],
];

function atualizarEu(eu) { estado.eu = eu; window.dispatchEvent(new CustomEvent('wb:eu')); }

function formSimples(campos, botao, enviar) {
  const form = h('form', { novalidate: true, class: 'grelha', style: 'max-width:640px' }, campos, h('div', null, h('button', { class: 'bt bt-p', type: 'submit' }, botao)));
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); limparErros(form);
    try { await aGuardar(form.querySelector('button[type=submit]'), () => enviar(lerForm(form), form)); } catch (er) { mostrarErro(form, er); }
  });
  return form;
}

function negocio() {
  const k = estado.eu.conta;
  return [h('section', { class: 'ficha' }, h('header', null, h('h2', null, 'Dados do negócio')),
    formSimples([
      campo({ nome: 'nome', rotulo: 'Nome do negócio', valor: k.nome, obrig: true }),
      h('div', { class: 'duas' }, campo({ nome: 'nif', rotulo: 'NIF', valor: k.nif, inputmode: 'numeric' }), campo({ nome: 'telefone', rotulo: 'Telefone', tipo: 'tel', valor: k.telefone })),
      campo({ nome: 'email', rotulo: 'E-mail do negócio', tipo: 'email', valor: k.email }),
      h('div', { class: 'duas' }, campo({ nome: 'morada', rotulo: 'Morada', valor: k.morada }), campo({ nome: 'localidade', rotulo: 'Localidade', valor: k.localidade })),
    ], 'Guardar', async (d) => { atualizarEu(await post('/api/conta/dados', d)); aviso('Dados guardados.'); })),
  h('section', { class: 'ficha' }, h('header', null, h('h2', null, 'Código da conta')),
    h('p', { style: 'color:var(--tinta2)' }, 'Dá este código a outra conta da webase para ela te partilhar contactos.'),
    h('p', { class: 'senha-temp', style: 'max-width:280px;margin-top:10px' }, k.codigo))];
}

function modulos() {
  const k = estado.eu.conta;
  const sel = new Set(k.modulos);
  const setores = estado.publico?.setores || [];
  const lista = h('div', { class: 'grelha', style: 'gap:8px' }, Object.keys(DESCR).map((m) => {
    const fixo = m === 'clientes';
    return h('label', { class: 'modulo' + (fixo ? ' fixo' : '') }, h('input', { type: 'checkbox', checked: sel.has(m), disabled: fixo, onchange: (e) => { e.target.checked ? sel.add(m) : sel.delete(m); } }),
      h('span', null, h('strong', null, MODS[m]?.nome || 'Fichas de clientes'), h('span', null, DESCR[m])));
  }));
  const setor = h('select', { class: 'entrada', id: 'set-sel' }, setores.map((s) => h('option', { value: s.id, selected: s.id === k.setor }, s.nome)));
  const b = h('button', { class: 'bt bt-p', type: 'button', onclick: async () => {
    try { atualizarEu(await aGuardar(b, () => post('/api/conta/configurar', { setor: setor.value, modulos: [...sel] }))); aviso('Módulos guardados.', { carimbo: true }); } catch (e) { falhou(e); }
  } }, 'Guardar módulos');
  return [h('section', { class: 'ficha grelha', style: 'gap:16px' }, h('header', null, h('h2', null, 'O que esta conta usa')),
    h('p', { style: 'color:var(--tinta2);max-width:60ch' }, 'Desligar um módulo só o esconde: os dados ficam guardados e voltam quando o ligares outra vez.'),
    h('div', { class: 'campo', style: 'max-width:320px' }, h('label', { for: 'set-sel' }, 'Tipo de negócio'), setor), lista, h('div', null, b))];
}

function contraste(hex) {
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return 1.05 / (0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) + 0.05);
}

function marca() {
  const k = estado.eu.conta;
  let cor = k.cor;
  const prev = h('div', { style: 'display:flex;gap:12px;align-items:center;flex-wrap:wrap' });
  const info = h('p', { class: 'ajuda', 'aria-live': 'polite' });
  const inpCor = h('input', { type: 'color', value: cor.toLowerCase(), 'aria-label': 'Escolher outra cor', style: 'width:52px;height:44px;border:0;background:none;padding:0' });
  const botoes = h('div', { class: 'cores', role: 'group', 'aria-label': 'Cores' });
  const pintar = () => {
    const c = contraste(cor);
    botoes.replaceChildren(...CORES.map((x) => h('button', { type: 'button', class: 'cor', style: `background:${x}`, 'aria-label': 'Cor ' + x, 'aria-pressed': String(x.toUpperCase() === cor.toUpperCase()),
      onclick: () => { cor = x; inpCor.value = x.toLowerCase(); pintar(); } }, x.toUpperCase() === cor.toUpperCase() ? icone('certo') : null)));
    prev.replaceChildren(h('span', { class: 'bt', style: `background:${cor};color:#fff` }, 'Botão principal'), h('span', { class: 'carimbo', style: `color:${cor}` }, icone('certo')));
    info.textContent = c >= 4.5 ? `Contraste com texto branco: ${c.toFixed(1).replace('.', ',')}:1. Fica legível.` : `Contraste ${c.toFixed(1).replace('.', ',')}:1 — demasiado clara para texto branco. Escolhe uma cor mais escura.`;
    info.style.color = c >= 4.5 ? 'var(--tinta2)' : 'var(--vermelho)';
    bCor.disabled = c < 4.5;
  };
  inpCor.addEventListener('input', () => { cor = inpCor.value.toUpperCase(); pintar(); });
  const bCor = h('button', { class: 'bt bt-p', type: 'button', onclick: async () => {
    try { atualizarEu(await aGuardar(bCor, () => post('/api/conta/marca', { cor }))); aviso('Cor da marca guardada.', { carimbo: true }); } catch (e) { falhou(e); }
  } }, 'Guardar cor');

  const logoBox = h('div', { class: 'logo-prev' }, k.logo ? h('img', { src: k.logo, alt: 'Logótipo atual' }) : h('span', { style: 'font-weight:700;font-size:28px' }, iniciais(k.nome)));
  const inpLogo = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/svg+xml', id: 'logo-f', class: 'so-leitor' });
  inpLogo.addEventListener('change', async () => {
    const f = inpLogo.files[0];
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) return aviso('A imagem tem mais de 8 MB. Escolhe uma mais pequena.', { erro: true });
    try {
      const url = URL.createObjectURL(f);
      const img = new Image();
      await new Promise((ok, mau) => { img.onload = ok; img.onerror = () => mau(new Error('Não conseguimos ler essa imagem.')); img.src = url; });
      const lado = 512;
      const esc = Math.min(1, lado / Math.max(img.naturalWidth || lado, img.naturalHeight || lado));
      const w = Math.max(16, Math.round((img.naturalWidth || lado) * esc)), hh = Math.max(16, Math.round((img.naturalHeight || lado) * esc));
      const cv = document.createElement('canvas'); cv.width = w; cv.height = hh;
      cv.getContext('2d').drawImage(img, 0, 0, w, hh);
      URL.revokeObjectURL(url);
      const png = cv.toDataURL('image/png');
      atualizarEu(await post('/api/conta/logo', { png }));
      aviso('Logótipo guardado.', { carimbo: true });
    } catch (e) { falhou(e); }
  });
  pintar();
  return [h('section', { class: 'ficha grelha', style: 'gap:16px' }, h('header', null, h('h2', null, 'Logótipo')),
    h('div', { style: 'display:flex;gap:20px;align-items:center;flex-wrap:wrap' }, logoBox,
      h('div', { class: 'grelha', style: 'gap:8px' }, h('p', { style: 'color:var(--tinta2);max-width:46ch' }, 'Aparece no topo da app para toda a tua equipa e no fórum e no marketplace. PNG, JPG ou SVG; fica com 512 px no máximo.'),
        h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, h('label', { for: 'logo-f', class: 'bt' }, icone('enviar'), k.logo ? 'Trocar logótipo' : 'Escolher logótipo'),
          k.logo ? h('button', { class: 'bt bt-perigo', type: 'button', onclick: async () => { try { atualizarEu(await post('/api/conta/logo/apagar')); aviso('Logótipo removido.'); } catch (e) { falhou(e); } } }, 'Remover') : null),
        inpLogo))),
  h('section', { class: 'ficha grelha', style: 'gap:16px' }, h('header', null, h('h2', null, 'Cor da marca')),
    h('p', { style: 'color:var(--tinta2);max-width:60ch' }, 'É a cor dos botões e do carimbo em toda a app. Verificamos o contraste para continuar fácil de ler.'),
    h('div', { style: 'display:flex;gap:10px;align-items:center;flex-wrap:wrap' }, botoes, h('label', { class: 'rotulo', style: 'display:flex;align-items:center;gap:8px' }, inpCor, 'Outra')),
    prev, info, h('div', null, bCor))];
}

function campos() {
  let lista = JSON.parse(JSON.stringify(estado.eu.conta.campos || []));
  const zona = h('div', { class: 'grelha', style: 'gap:10px' });
  const TIPOS = [['texto', 'Texto'], ['numero', 'Número'], ['data', 'Data'], ['escolha', 'Escolha (lista)'], ['sim_nao', 'Sim ou não']];
  const desenhar = () => {
    zona.replaceChildren(...lista.map((f, i) => h('div', { class: 'ficha', style: 'background:var(--folha2);display:grid;gap:10px;padding:14px' },
      h('div', { class: 'duas' },
        h('div', { class: 'campo' }, h('label', { for: 'cn' + i }, 'Nome do campo'), h('input', { id: 'cn' + i, class: 'entrada', value: f.nome, maxlength: 40, oninput: (e) => { f.nome = e.target.value; } })),
        h('div', { class: 'campo' }, h('label', { for: 'ct' + i }, 'Tipo'), h('select', { id: 'ct' + i, class: 'entrada', onchange: (e) => { f.tipo = e.target.value; if (f.tipo === 'escolha' && !f.opcoes?.length) f.opcoes = ['']; desenhar(); } },
          TIPOS.map(([v, t]) => h('option', { value: v, selected: f.tipo === v }, t))))),
      f.tipo === 'escolha' ? h('div', { class: 'campo' }, h('label', { for: 'co' + i }, 'Opções (separadas por vírgulas)'),
        h('input', { id: 'co' + i, class: 'entrada', value: (f.opcoes || []).join(', '), oninput: (e) => { f.opcoes = e.target.value.split(',').map((x) => x.trim()).filter(Boolean); } })) : null,
      h('div', null, h('button', { class: 'bt bt-pq bt-perigo', type: 'button', onclick: () => { lista.splice(i, 1); desenhar(); } }, icone('lixo'), 'Tirar este campo')))),
    h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
      lista.length < 20 ? h('button', { class: 'bt', type: 'button', onclick: () => { lista.push({ nome: '', tipo: 'texto', opcoes: [] }); desenhar(); zona.querySelector(`#cn${lista.length - 1}`)?.focus(); } }, icone('mais'), 'Juntar campo') : null,
      h('button', { class: 'bt bt-p', type: 'button', onclick: async (e) => {
        try { atualizarEu(await aGuardar(e.currentTarget, () => post('/api/conta/campos', { campos: lista }))); aviso('Campos guardados.'); } catch (er) { falhou(er); }
      } }, 'Guardar campos')));
  };
  desenhar();
  return [h('section', { class: 'ficha grelha', style: 'gap:16px' }, h('header', null, h('h2', null, 'Campos da ficha de cliente')),
    h('p', { style: 'color:var(--tinta2);max-width:62ch' }, 'Junta à ficha o que o teu negócio precisa de saber. Exemplos: corte preferido, alergias, número de sócio, operadora atual, fim da fidelização.'), zona)];
}

function fases() {
  let lista = JSON.parse(JSON.stringify(estado.eu.conta.fases));
  const zona = h('div', { class: 'grelha', style: 'gap:8px' });
  const desenhar = () => {
    zona.replaceChildren(...lista.map((f, i) => h('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap' },
      h('input', { class: 'entrada', style: 'flex:1 1 200px', value: f.nome, maxlength: 30, 'aria-label': 'Nome da fase ' + (i + 1), oninput: (e) => { f.nome = e.target.value; } }),
      h('select', { class: 'entrada', style: 'width:auto', 'aria-label': 'Tipo da fase', onchange: (e) => { f.tipo = e.target.value; } },
        [['aberta', 'Em curso'], ['ganho', 'Ganho'], ['perdido', 'Perdido']].map(([v, t]) => h('option', { value: v, selected: f.tipo === v }, t))),
      h('button', { class: 'bt bt-icone bt-pq', type: 'button', 'aria-label': 'Subir', disabled: i === 0, onclick: () => { [lista[i - 1], lista[i]] = [lista[i], lista[i - 1]]; desenhar(); } }, icone('voltar', { style: 'transform:rotate(90deg)' })),
      h('button', { class: 'bt bt-icone bt-pq', type: 'button', 'aria-label': 'Descer', disabled: i === lista.length - 1, onclick: () => { [lista[i + 1], lista[i]] = [lista[i], lista[i + 1]]; desenhar(); } }, icone('voltar', { style: 'transform:rotate(-90deg)' })),
      h('button', { class: 'bt bt-icone bt-pq bt-perigo', type: 'button', 'aria-label': 'Tirar fase', onclick: () => { lista.splice(i, 1); desenhar(); } }, icone('lixo')))),
    h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:8px' },
      lista.length < 12 ? h('button', { class: 'bt', type: 'button', onclick: () => { lista.splice(Math.max(0, lista.findIndex((x) => x.tipo !== 'aberta')), 0, { nome: 'Nova fase', tipo: 'aberta' }); desenhar(); } }, icone('mais'), 'Juntar fase') : null,
      h('button', { class: 'bt bt-p', type: 'button', onclick: async (e) => {
        try { atualizarEu(await aGuardar(e.currentTarget, () => post('/api/conta/fases', { fases: lista }))); aviso('Fases guardadas.'); } catch (er) { falhou(er); }
      } }, 'Guardar fases')));
  };
  desenhar();
  return [h('section', { class: 'ficha grelha', style: 'gap:16px' }, h('header', null, h('h2', null, 'Fases das leads')),
    h('p', { style: 'color:var(--tinta2);max-width:62ch' }, 'Dá às fases os nomes que usas no dia a dia. Precisas de pelo menos uma em curso, uma de ganho e uma de perdido. Leads de uma fase que tires passam para a primeira.'), zona)];
}

function pontos() {
  const k = estado.eu.conta;
  return [h('section', { class: 'ficha' }, h('header', null, h('h2', null, 'Regras dos pontos')),
    formSimples([
      campo({ nome: 'pontos_euro', rotulo: 'Pontos por cada euro gasto', valor: String(k.pontos_euro).replace('.', ','), inputmode: 'decimal', ajuda: 'Ex.: 1 = um ponto por euro; 0,5 = um ponto por cada 2 €.' }),
      campo({ nome: 'pontos_boas_vindas', rotulo: 'Pontos de boas-vindas', valor: k.pontos_boas_vindas, inputmode: 'numeric', ajuda: 'Dados a cada cliente novo. 0 para não dar.' }),
    ], 'Guardar', async (d) => {
      atualizarEu(await post('/api/conta/pontos', { pontos_euro: Number(String(d.pontos_euro).replace(',', '.')), pontos_boas_vindas: Number(d.pontos_boas_vindas || 0) }));
      aviso('Regras guardadas.');
    }))];
}

function plano() {
  const k = estado.eu.conta;
  const planos = [
    ['gratis', 'Grátis', '0 €', ['1 pessoa', 'Até 300 clientes', 'Fichas, pontos e leads', 'Importar e exportar']],
    ['negocio', 'Negócio', '19 € por mês', ['Até 5 pessoas', 'Clientes sem limite', 'Pacotes, chamadas e contratos', 'Papéis prontos para a equipa']],
    ['equipa', 'Equipa', '49 € por mês', ['Até 25 pessoas', 'Permissões por pessoa', 'Vender no marketplace', 'Registo de atividade']],
  ];
  return [h('section', { class: 'ficha grelha', style: 'gap:16px' }, h('header', null, h('h2', null, 'O teu plano')),
    h('div', { class: 'nota-suave' }, h('strong', null, 'Acesso antecipado: '), 'enquanto os pagamentos não abrem, a tua conta tem tudo aberto, sem pagar. Avisamos com 30 dias de antecedência antes de cobrar seja o que for.',
      k.fundador ? [' ', h('strong', null, 'És fundador: fica com 40 % de desconto para sempre.')] : null),
    h('div', { class: 'grelha g3' }, planos.map(([id, nome, preco, itens]) => h('div', { class: 'ficha', style: 'background:var(--folha2);display:grid;gap:10px;align-content:start' },
      h('h3', { style: 'font-size:18px' }, nome), h('p', { style: 'font-size:24px;font-weight:600;font-stretch:85%' }, preco, id !== 'gratis' ? h('span', { style: 'font-size:13px;color:var(--tinta2);font-weight:500' }, ' + IVA') : null),
      h('ul', { style: 'margin:0;padding-left:18px;color:var(--tinta2);font-size:14px;display:grid;gap:4px' }, itens.map((x) => h('li', null, x))),
      id !== 'gratis' ? h('button', { class: 'bt bt-pq', type: 'button', onclick: async (e) => {
        try { await post('/api/conta/plano', { plano: id }); aviso('Fica registado. Avisamos-te quando o plano ' + nome + ' abrir.', { carimbo: true }); e.target.disabled = true; } catch (er) { falhou(er); }
      } }, 'Quero este plano') : null))))];
}

async function seguranca() {
  const s = await get('/api/eu/sessoes');
  const temas = [['auto', 'Como o aparelho'], ['claro', 'Claro'], ['escuro', 'Escuro']];
  return [
    h('section', { class: 'ficha' }, h('header', null, h('h2', null, 'Aparência')),
      h('div', { class: 'separadores', role: 'radiogroup', 'aria-label': 'Tema' }, temas.map(([v, t]) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(estado.eu.tema === v), 'aria-selected': String(estado.eu.tema === v),
        onclick: async () => { try { atualizarEu(await post('/api/eu/preferencias', { tema: v })); } catch (e) { falhou(e); } } }, t)))),
    h('section', { class: 'ficha' }, h('header', null, h('h2', null, 'O teu nome')),
      formSimples([campo({ nome: 'nome', rotulo: 'Nome', valor: estado.eu.nome, obrig: true })], 'Guardar', async (d) => { atualizarEu(await post('/api/eu/preferencias', d)); aviso('Guardado.'); })),
    h('section', { class: 'ficha' }, h('header', null, h('h2', null, 'Mudar a palavra-passe')),
      formSimples([campo({ nome: 'atual', rotulo: 'Palavra-passe atual', tipo: 'password', autocomplete: 'current-password', obrig: true }),
        campo({ nome: 'nova', rotulo: 'Nova palavra-passe', tipo: 'password', autocomplete: 'new-password', obrig: true, ajuda: 'Pelo menos 10 caracteres.' })],
      'Mudar palavra-passe', async (d, form) => { await post('/api/eu/senha', d); form.reset(); aviso('Palavra-passe mudada. Os outros aparelhos saíram da conta.', { carimbo: true }); })),
    h('section', { class: 'ficha' }, h('header', null, h('h2', null, 'Aparelhos com sessão aberta')),
      h('div', { class: 'lista' }, s.sessoes.map((x) => h('div', { class: 'linha' }, h('span', { class: 'principal-l' },
        h('span', { class: 't' }, resumoAparelho(x.disp), x.esta ? ' (este)' : ''), h('span', { class: 's' }, 'Entrou ' + relativo(x.criada)))))),
      s.sessoes.length > 1 ? h('button', { class: 'bt', type: 'button', style: 'margin-top:12px', onclick: async (e) => {
        try { const r = await post('/api/eu/sessoes/terminar'); aviso(`${r.terminadas} sessões terminadas.`); mostrarSecao('seguranca'); } catch (er) { falhou(er); }
      } }, 'Sair dos outros aparelhos') : null),
  ];
}

function resumoAparelho(ua) {
  ua = ua || '';
  const so = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Mac OS/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Aparelho';
  const nav = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'navegador';
  return `${nav} · ${so}`;
}

function conta() {
  const eu = estado.eu;
  const blocos = [];
  if (eu.dono && podeX('exportar')) blocos.push(h('section', { class: 'ficha grelha', style: 'gap:12px' }, h('header', null, h('h2', null, 'Levar os teus dados')),
    h('p', { style: 'color:var(--tinta2);max-width:60ch' }, 'Descarrega tudo o que a conta tem (clientes, leads, chamadas, contratos, pontos e pacotes) num ficheiro. Os dados são teus.'),
    h('div', null, h('button', { class: 'bt', type: 'button', onclick: () => descarregar('/api/conta/exportar-tudo').catch(falhou) }, icone('descarregar'), 'Exportar tudo'))));
  if (eu.dono) {
    const form = h('form', { novalidate: true, class: 'grelha', style: 'max-width:520px' },
      h('p', { style: 'color:var(--tinta2)' }, 'Apaga a conta, a equipa e todos os dados. Não dá para desfazer.'),
      campo({ nome: 'confirmacao', rotulo: `Escreve «${eu.conta.nome}» para confirmar`, obrig: true, autocomplete: 'off' }),
      campo({ nome: 'senha', rotulo: 'A tua palavra-passe', tipo: 'password', autocomplete: 'current-password', obrig: true }),
      h('div', null, h('button', { class: 'bt bt-perigo cheio', type: 'submit' }, 'Apagar a conta para sempre')));
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); limparErros(form);
      if (!await confirmar({ titulo: 'Tens a certeza?', texto: 'Todos os clientes e dados desta conta vão ser apagados.', sim: 'Apagar tudo', perigo: true })) return;
      try { await post('/api/conta/apagar', lerForm(form)); location.href = '/'; } catch (er) { mostrarErro(form, er); }
    });
    blocos.push(h('section', { class: 'ficha' }, h('header', null, h('h2', null, 'Apagar a conta')), form));
  } else {
    blocos.push(h('section', { class: 'ficha' }, h('p', { style: 'color:var(--tinta2)' }, 'Só quem criou a conta pode exportar tudo ou apagá-la.')));
  }
  return blocos;
}

let raizAtual;
async function mostrarSecao(id) {
  const fns = { negocio, modulos, marca, campos, fases, pontos, plano, seguranca, conta, telemovel: () => secaoTelemovel(() => mostrarSecao('telemovel')) };
  const zona = raizAtual.querySelector('#def-zona');
  zona.replaceChildren(h('div', { class: 'carregar' }));
  try { zona.replaceChildren(...await fns[id]()); } catch (e) { zona.replaceChildren(h('p', null, e.message)); }
}

export async function mostrar(raiz, caminho) {
  raizAtual = raiz;
  const disp = SECOES.filter(([, , x]) => !x || podeX(x));
  let atual = (caminho.split('/')[3] || '');
  if (!disp.find(([id]) => id === atual)) atual = disp[0][0];
  const nav = h('nav', { class: 'separadores nav-def', 'aria-label': 'Secções das definições' }, disp.map(([id, nome]) =>
    ligacao('/app/definicoes/' + id, { 'aria-current': id === atual ? 'page' : null }, nome)));
  raiz.replaceChildren(h('header', { class: 'cabeca' }, h('div', null, h('h1', null, 'Definições'), h('p', { class: 'sub' }, estado.eu.conta.nome))),
    nav, h('div', { id: 'def-zona', class: 'grelha' }));
  nav.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  await mostrarSecao(atual);
}
