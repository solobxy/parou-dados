// Imagens dos avisos do canal desenhadas num browser a sério (Chromium): 8 avisos de zonas, transportes e tipos
// diferentes. Verifica a faixa laranja, a zona em grande, que nenhum texto passa a margem direita, e o JPEG final
// (com as letras da marca carregadas). Guarda as imagens para se verem. Não é num telemóvel.
// Uso: APP=<pasta da app> SAIDA=res node cartaz-aviso-ecra.mjs   (precisa do playwright e do esbuild da app)
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const APP = path.resolve(process.env.APP || path.join('..', 'app'));
const SAIDA = process.env.SAIDA || 'res';
fs.mkdirSync(SAIDA, { recursive: true });
let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };

const esbuild = createRequire(path.join(APP, 'package.json'))('esbuild');
const pasta = fs.mkdtempSync('/tmp/cartaz-');
await esbuild.build({ entryPoints: [path.join(APP, 'src/utils/cartazAviso.ts')], bundle: true, format: 'iife', globalName: 'Cartaz', outfile: path.join(pasta, 'cartaz.js'), logLevel: 'error' });
for (const f of fs.readdirSync(path.join(APP, 'public/fontes'))) fs.copyFileSync(path.join(APP, 'public/fontes', f), path.join(pasta, f));
const ff = (fam, w, f) => `@font-face{font-family:"${fam}";font-weight:${w};src:url(${f})}`;
fs.writeFileSync(path.join(pasta, 'p.html'), `<!doctype html><meta charset="utf-8"><style>${ff('Barlow', 600, 'barlow-600.woff')}${ff('Barlow', 700, 'barlow-700.woff')}${ff('Barlow Condensed', 600, 'barlowcondensed-600.woff')}${ff('Barlow Condensed', 700, 'barlowcondensed-700.woff')}${ff('Barlow Condensed', 800, 'barlowcondensed-800.woff')}</style><script src="cartaz.js"></script>`);

const base = { linhas: [], paragens: [], 'descrição': '', status: 'Futuro', end_datetime: null };
const AVISOS = [
  { id: 'porto-greve', tipo: 'greve', 'título': 'Greve reduz serviço do Metro esta sexta-feira', operador: 'Metro do Porto', 'região': 'Área Metropolitana do Porto', 'municípios': ['Porto'], start_datetime: '2026-11-27T00:00:00Z', end_datetime: '2026-11-27T23:59:00Z', status: 'Ativo', servico_na_greve: { linhas: [], trocos: [['Senhora da Hora', 'Estádio do Dragão'], ['Hospital São João', 'Santo Ovídio']] } },
  { id: 'coimbra-greve', tipo: 'greve', 'título': 'FESINAP convoca greve para a próxima 4ª feira', operador: 'SMTUC', 'região': 'Coimbra', 'municípios': ['Coimbra'], start_datetime: '2026-12-02T00:00:00Z', end_datetime: '2026-12-02T23:59:00Z' },
  { id: 'lisboa-avaria', tipo: 'interrupção', 'título': 'Avaria na catenária interrompe a circulação entre Benfica e Sintra durante toda a tarde de hoje', operador: 'CP', linhas: ['Sintra'], 'região': 'Área Metropolitana de Lisboa', 'municípios': ['Lisboa', 'Sintra'], start_datetime: '2026-11-27T20:10:00Z', status: 'Ativo' },
  { id: 'porto-desvio', tipo: 'desvio', 'título': 'Linhas desviadas na Avenida da Boavista por obras', operador: 'STCP', linhas: ['201', '203', '502', '505', '506', '507', '508', '600', '601', '602'], 'região': 'Área Metropolitana do Porto', 'municípios': ['Porto'], start_datetime: '2026-11-30T07:00:00Z', end_datetime: '2026-12-12T20:00:00Z' },
  { id: 'braga-obras', tipo: 'obras', 'título': 'Obras na Avenida da Liberdade alteram paragens', operador: 'TUB', linhas: ['2', '7', '43'], 'região': 'Braga', 'municípios': ['Braga'], start_datetime: '2026-11-28T08:00:00Z', end_datetime: '2026-12-20T20:00:00Z' },
  { id: 'lisboa-normal', tipo: 'outros alertas oficiais', 'título': 'Circulação normalizada na ligação Cais do Sodré – Cacilhas', operador: 'Transtejo Soflusa', 'região': 'Área Metropolitana de Lisboa', 'municípios': ['Lisboa', 'Almada'], start_datetime: '2026-11-27T19:00:00Z', status: 'Ativo' },
  { id: 'acores-tempo', tipo: 'outros alertas oficiais', 'título': 'Aviso amarelo de chuva forte e vento no arquipélago', operador: 'AzoresBus', 'região': 'Açores', 'municípios': ['Ponta Delgada'], start_datetime: '2026-11-28T06:00:00Z', end_datetime: '2026-11-28T23:00:00Z' },
  { id: 'portugal-greve', tipo: 'greve', 'título': 'Greve na CP: serviços mínimos de 8 a 10 de dezembro', operador: 'CP', 'região': 'Nacional', 'municípios': ['Portugal'], start_datetime: '2026-12-08T00:00:00Z', end_datetime: '2026-12-11T00:00:00Z' },
].map((a) => ({ ...base, ...a, external_id: a.id, published_datetime: '', source: '', source_url: '', last_update: '' }));

// publicações automáticas da Comunidade (sem transporte: fica o ícone do tipo em grande)
const DADOS = [
  { id: 'comunidade-incendio', zona: { nome: 'AROUCA', silhueta: 'centro' }, modo: null, tipo: { rotulo: 'INCÊNDIO', cor: '#FF5A2A', icone: 'chama' }, operador: 'PROTEÇÃO CIVIL', quando: 'EM CURSO', titulo: 'Incêndio grave em Arouca', destaque: { etiqueta: 'MEIOS NO TERRENO', texto: '320 operacionais · 6 meios aéreos' } },
  { id: 'comunidade-feriado', zona: { nome: 'PORTUGAL', silhueta: 'portugal' }, modo: null, tipo: { rotulo: 'FERIADO', cor: '#4DA3FF', icone: 'calendario' }, operador: 'FERIADO NACIONAL', quando: 'TER 08/12', titulo: 'Imaculada Conceição', destaque: { etiqueta: 'TRANSPORTES', texto: 'Horário de domingos e feriados' } },
];

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, args: ['--no-sandbox'] } : {});
const p = await browser.newPage();
const erros = [];
p.on('pageerror', (e) => erros.push(String(e)));
await p.goto('file://' + path.join(pasta, 'p.html'));
const res = await p.evaluate(async ({ avisos, dados }) => {
  await Promise.all(['800 100px "Barlow Condensed"', '700 40px "Barlow Condensed"', '600 40px "Barlow Condensed"', '700 40px Barlow', '600 40px Barlow'].map((f) => document.fonts.load(f)));
  const agora = new Date('2026-11-27T21:50:00Z');
  const out = [];
  for (const a of avisos) {
    const c = document.createElement('canvas'); c.width = 1080; c.height = 1080;
    const ctx = c.getContext('2d');
    const d = Cartaz.dadosDoCartaz(a, undefined, agora);
    Cartaz.desenharCartaz(ctx, d);
    const px = ctx.getImageData(0, 0, 1080, 1080).data;
    const em = (x, y) => { const i = (y * 1080 + x) * 4; return [px[i], px[i + 1], px[i + 2]]; };
    let fora = 0;
    for (let y = 150; y < 960; y += 2) for (let x = 1012; x < 1080; x++) { const [r, g, b] = em(x, y); if (r > 200 && g > 200 && b > 200) fora++; }
    let zona = 0;
    for (let y = 190; y < 360; y += 2) for (let x = 72; x < 600; x += 2) { const [r, g, b] = em(x, y); if (r > 230 && g > 230 && b > 230) zona++; }
    out.push({ id: a.id, png: c.toDataURL('image/png'), faixa: em(540, 1070), fora, zona, d: { zona: d.zona.nome, modo: d.modo, tipo: d.tipo.rotulo, quando: d.quando } });
  }
  for (const d of dados) {
    const c = document.createElement('canvas'); c.width = 1080; c.height = 1080;
    const ctx = c.getContext('2d');
    Cartaz.desenharCartaz(ctx, Cartaz.cartazValido(d));
    const px = ctx.getImageData(0, 0, 1080, 1080).data;
    const em = (x, y) => { const i = (y * 1080 + x) * 4; return [px[i], px[i + 1], px[i + 2]]; };
    let fora = 0;
    for (let y = 150; y < 960; y += 2) for (let x = 1012; x < 1080; x++) { const [r, g, b] = em(x, y); if (r > 200 && g > 200 && b > 200) fora++; }
    let zona = 0;
    for (let y = 190; y < 360; y += 2) for (let x = 72; x < 600; x += 2) { const [r, g, b] = em(x, y); if (r > 230 && g > 230 && b > 230) zona++; }
    out.push({ id: d.id, png: c.toDataURL('image/png'), faixa: em(540, 1070), fora, zona, d: { zona: d.zona.nome, modo: d.modo, tipo: d.tipo.rotulo, quando: d.quando } });
  }
  const blobDados = await Cartaz.gerarCartazDeDados(Cartaz.cartazValido(dados[0]));
  const blob = await Cartaz.gerarCartaz(avisos[0]);
  return { out, jpeg: { tipo: blob.type, tamanho: blob.size }, jpegDados: { tipo: blobDados.type, tamanho: blobDados.size }, fontes: document.fonts.check('800 100px "Barlow Condensed"') };
}, { avisos: AVISOS, dados: DADOS });
ok('letras da marca carregadas', res.fontes);
for (const r of res.out) {
  fs.writeFileSync(path.join(SAIDA, `cartaz_${r.id}.png`), Buffer.from(r.png.split(',')[1], 'base64'));
  const [R, G, B] = r.faixa;
  ok(`[${r.id}] faixa laranja em baixo`, Math.abs(R - 255) < 6 && Math.abs(G - 107) < 8 && Math.abs(B - 26) < 8, r.faixa.join(','));
  ok(`[${r.id}] zona em grande (${r.d.zona})`, r.zona > 2500, String(r.zona));
  ok(`[${r.id}] nenhum texto passa a margem direita`, r.fora === 0, String(r.fora));
  console.log('       ', JSON.stringify(r.d));
}
ok('Comunidade: JPEG a partir dos dados guardados', res.jpegDados.tipo === 'image/jpeg' && res.jpegDados.tamanho > 30000, JSON.stringify(res.jpegDados));
ok('JPEG final pronto a partilhar', res.jpeg.tipo === 'image/jpeg' && res.jpeg.tamanho > 30000, JSON.stringify(res.jpeg));
ok('sem erros na página', erros.length === 0, erros.join(' | '));
await browser.close();
console.log(falhas ? `\n${falhas} FALHAS` : '\nTUDO OK');
process.exit(falhas ? 1 : 0);
