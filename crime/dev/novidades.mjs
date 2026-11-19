// As novidades do jogo, tiradas do histórico do git: uma entrada por versão (a data e a hora são as do primeiro commit com
// esse número), com o texto para os jogadores em PT e EN e uma imagem quando a versão trouxe alguma.
// O texto vem, por esta ordem:
//   1. das linhas «PT: …» e «EN: …» na mensagem de um commit dessa versão (é assim que se escreve daqui para a frente);
//   2. de dev/novidades-antigas.json (as versões de antes desta regra, escritas à mão uma vez; com «force», manda mesmo havendo linhas no commit);
//   3. do título do commit, sem o prefixo (só em PT, e o EN fica igual).
// A imagem: «IMG: /img/…» na mensagem, a de novidades-antigas.json, ou a primeira imagem nova dessa versão (sem as -g).
// Grava sites/crime/novidades.json, que o jogo lê no Arquivo.
// Uso (antes de publicar, depois do commit da versão nova): node crime/dev/novidades.mjs && git add sites/crime/novidades.json && git commit --amend --no-edit
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const git = (...a) => execFileSync('git', ['-C', RAIZ, ...a], { encoding: 'utf8', maxBuffer: 64 << 20 });
const antigas = JSON.parse(readFileSync(join(RAIZ, 'crime/dev/novidades-antigas.json'), 'utf8'));

// o repositório tem de ter o histórico todo (num clone raso, as versões antigas faltavam)
if (git('rev-parse', '--is-shallow-repository').trim() === 'true') git('fetch', '-q', '--unshallow');

const SEP = '\u001f', FIM = '\u001e';
const log = git('log', '--reverse', `--format=%H${SEP}%aI${SEP}%B${FIM}`, 'HEAD', '--', 'crime', 'sites/crime')
  .split(FIM).map((x) => x.trim()).filter(Boolean).map((x) => { const [h, at, msg] = x.split(SEP); return { h, at, msg: msg.trim() }; });

const versao = (h) => { try { const m = git('show', `${h}:crime/server.mjs`).match(/^const VERSAO = (\d+)/m); return m ? +m[1] : 0; } catch { return 0; } };
const imagens = (h) => git('show', '--format=', '--name-status', '--diff-filter=A', h, '--', 'sites/crime/img')
  .split('\n').map((l) => l.split('\t')[1]).filter((f) => f && /\.(webp|png|jpg)$/.test(f) && !/-g\.\w+$/.test(f))
  .filter((f) => existsSync(join(RAIZ, f))).map((f) => f.replace(/^sites\/crime/, ''));   // só as que ainda existem
const linha = (msg, k) => { const m = msg.match(new RegExp('^' + k + ':\\s*(.+)$', 'm')); return m ? m[1].trim() : null; };
// v113: a linha «IMG:» às vezes é um caminho (/img/cenas/x.webp) e às vezes uma nota («cenas/corridas, carros/clio…»): fica o caminho,
// ou o primeiro «pasta/nome» da nota se essa imagem existir; senão, nada (e vale a primeira imagem nova da versão)
const imgDe = (s) => {
  if (!s) return null;
  if (/^\/img\/\S+\.(webp|png|jpg)$/.test(s)) return existsSync(join(RAIZ, 'sites/crime', s)) ? s : null;
  const m = s.match(/^([a-z0-9_-]+\/[a-z0-9_-]+)(?=[,;\s]|$)/i), f = m && '/img/' + m[1] + '.webp';
  return f && existsSync(join(RAIZ, 'sites/crime', f)) ? f : null;
};
const limpa = (s) => s.split('\n')[0].replace(/^crime:\s*/i, '').replace(/^v\d+\s*[—-]?\s*/, '').replace(/\s*\(v\d+[^)]*\)\s*$/, '').replace(/^./, (c) => c.toUpperCase());

const grupos = new Map();
for (const c of log) {
  const v = versao(c.h), k = v ? 'v' + v : c.h.slice(0, 7);
  if (!grupos.has(k)) grupos.set(k, { k, v, at: c.at, commits: [] });
  grupos.get(k).commits.push(c);
}

const out = [];
for (const g of grupos.values()) {
  const a = antigas[g.k];
  if (a === null) continue;   // marcado para não aparecer (trabalho interno)
  let pt = null, en = null, img = null;
  for (const c of g.commits) { pt = linha(c.msg, 'PT') || pt; en = linha(c.msg, 'EN') || en; img = imgDe(linha(c.msg, 'IMG')) || img; }
  if (a && (a.force || !pt)) { pt = a.pt; en = a.en; }   // force: corrige o texto de uma versão já publicada (o commit não se reescreve)
  if (!img && a && a.img && existsSync(join(RAIZ, 'sites/crime', a.img))) img = a.img;
  if (!pt) { pt = limpa(g.commits[0].msg); en = en || pt; }
  if (!img) img = g.commits.flatMap((c) => imagens(c.h)).find((f) => f.startsWith('/img/cenas/')) || g.commits.flatMap((c) => imagens(c.h))[0] || null;
  out.push({ v: g.v, at: g.at, pt, en: en || pt, ...(img ? { img } : {}) });
}
out.reverse();   // as mais novas primeiro
writeFileSync(join(RAIZ, 'sites/crime/novidades.json'), JSON.stringify(out, null, 0).replace(/\},\{/g, '},\n{') + '\n');
console.log(`novidades: ${out.length} entradas, a última v${out[0].v} de ${out[0].at}`);
