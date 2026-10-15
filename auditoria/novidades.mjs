// Verifica as novidades da app (src/config/novidades.ts), que também saem sozinhas na Comunidade:
//   - ids únicos e fixos; textos dentro dos limites do servidor (título 90, Comunidade 600 caracteres);
//   - cada imagem existe em public/ e é um JPEG quadrado de 1080×1080;
//   - o tema azul chama-se só «Azul» (nunca «Azul Porto») na app, nas traduções e nas novidades;
//   - só as novidades de hoje ou anteriores (não há datas no futuro).
// Uso: APP=caminho-da-app node --import tsx auditoria/novidades.mjs
import fs from 'fs';
const caminho = process.env.APP || '../app';
let falhas = 0;
const ok = (nome, cond, extra = '') => { if (!cond) falhas++; console.log(cond ? 'OK     ' : 'FALHOU ', nome, extra); };

const { NOVIDADES } = await import(`${caminho}/src/config/novidades.ts`);
const { TEMAS } = await import(`${caminho}/src/utils/tema.ts`);

function tamanhoJpeg(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

const ids = NOVIDADES.map((n) => n.id);
ok('[novidades] ids únicos', new Set(ids).size === ids.length, ids.filter((x, i) => ids.indexOf(x) !== i).join(','));
const hoje = new Date().toISOString().slice(0, 10);
for (const n of NOVIDADES) {
  const r = `[${n.id}]`;
  ok(`${r} título até 90 caracteres`, n.titulo.length <= 90, String(n.titulo.length));
  if (n.comunidade) ok(`${r} texto da Comunidade até 600 caracteres`, n.comunidade.length <= 600, String(n.comunidade.length));
  ok(`${r} data válida e não futura`, /^\d{4}-\d{2}-\d{2}$/.test(n.data) && n.data <= hoje, n.data);
  for (const img of n.imagens || []) {
    const f = `${caminho}/public${img}`;
    const existe = fs.existsSync(f);
    ok(`${r} imagem ${img} existe`, existe);
    if (existe) { const d = tamanhoJpeg(fs.readFileSync(f)); ok(`${r} imagem ${img} é JPEG 1080×1080`, !!d && d.w === 1080 && d.h === 1080, d ? `${d.w}×${d.h}` : 'não é JPEG'); }
  }
  ok(`${r} não diz «Azul Porto»`, !/azul porto/i.test(`${n.titulo} ${n.texto} ${n.comunidade || ''}`));
}
const azul = TEMAS.find((t) => t.id === 'porto');
ok('[tema] o tema azul chama-se só «Azul»', azul && azul.nome === 'Azul', azul?.nome);
for (const lang of ['en', 'fr', 'de']) {
  const txt = fs.readFileSync(`${caminho}/src/i18n/${lang}.ts`, 'utf8');
  ok(`[tema] ${lang}: sem a tradução antiga de «Azul Porto»`, !/'Azul Porto'/.test(txt));
  ok(`[tema] ${lang}: «Azul» está traduzido`, /^\s*'Azul':\s*'/m.test(txt));
}
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nNovidades e nome do tema em ordem.');
process.exit(falhas ? 1 : 0);
