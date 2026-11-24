// Junta tudo num só index.html (código, fontes, ícones).
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const R = path.join(__dirname, '..'), NM = path.join(R, 'node_modules'), SRC = path.join(__dirname, 'src'), OUT = path.join(__dirname, 'dist');
fs.mkdirSync(OUT, { recursive: true });
// 1) letras japonesas usadas no código -> fonte pequena
const cjk = new Set();
for (const f of fs.readdirSync(SRC)) { const t = fs.readFileSync(path.join(SRC, f), 'utf8'); for (const ch of t) if (/[　-ヿ㐀-鿿＀-￯]/.test(ch)) cjk.add(ch); }
const txt = path.join(OUT, 'jp.txt'); fs.writeFileSync(txt, [...cjk].join(''));
const jpOut = path.join(OUT, 'kjp.woff2');
execFileSync('pyftsubset', [path.join(NM, '@expo-google-fonts/noto-sans-jp/900Black/NotoSansJP_900Black.ttf'), `--text-file=${txt}`, '--flavor=woff2', `--output-file=${jpOut}`, '--layout-features=*']);
const b64 = f => fs.readFileSync(f).toString('base64');
const ff = (fam, w, file) => `@font-face{font-family:"${fam}";font-weight:${w};font-style:normal;font-display:swap;src:url(data:font/woff2;base64,${b64(file)}) format("woff2")}`;
const fonts = [
  ff('Roboto Condensed', 400, path.join(NM, '@fontsource/roboto-condensed/files/roboto-condensed-latin-400-normal.woff2')),
  ff('Roboto Condensed', 500, path.join(NM, '@fontsource/roboto-condensed/files/roboto-condensed-latin-500-normal.woff2')),
  ff('Roboto Condensed', 600, path.join(NM, '@fontsource/roboto-condensed/files/roboto-condensed-latin-600-normal.woff2')),
  ff('Roboto Condensed', 700, path.join(NM, '@fontsource/roboto-condensed/files/roboto-condensed-latin-700-normal.woff2')),
  ff('KJP', 900, jpOut),
].join('\n');
// 2) código
const js = path.join(OUT, 'game.js');
execFileSync(path.join(NM, '.bin/esbuild'), [path.join(SRC, 'main.js'), '--bundle', '--format=iife', ...(process.env.NOMIN ? [] : ['--minify']), '--target=es2020', `--outfile=${js}`, '--legal-comments=none'], { stdio: 'inherit', cwd: R });
const icon = n => fs.readFileSync(path.join(NM, 'lucide-static/icons', n + '.svg'), 'utf8').replace(/<!--.*?-->/s, '').replace(/\s*class="[^"]*"/, '').replace(/\s+/g, ' ').trim();
let code = fs.readFileSync(js, 'utf8').replace(/<\/script/gi, '<\\/script').replace(/\{\{([a-z0-9-]+)\}\}/g, (m, n) => fs.existsSync(path.join(NM, 'lucide-static/icons', n + '.svg')) ? icon(n).replace(/"/g, "'") : m);
// 3) ícones
let html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
html = html.replace(/\{\{([a-z0-9-]+)\}\}/g, (m, n) => fs.readFileSync(path.join(NM, 'lucide-static/icons', n + '.svg'), 'utf8').replace(/<!--.*?-->/s, '').replace(/\s*class="[^"]*"/, '').replace(/\s+/g, ' ').trim());
html = html.replace('/*FONTS*/', () => fonts).replace('<script>/*JS*/</script>', () => `<script>${code}</script>`);
fs.writeFileSync(path.join(OUT, 'index.html'), html);
// versão para o servidor: com as estatísticas próprias (no artefacto a página não pode enviar dados)
fs.mkdirSync(path.join(OUT, 'web'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'web', 'index.html'), html.replace('</head>', '<script>window.KG_ONLINE = 1</script>\n<script defer src="/_e.js" data-site="kurogane"></script>\n</head>'));
console.log('index.html', (fs.statSync(path.join(OUT, 'index.html')).size / 1024).toFixed(0) + ' KB', 'jp glyphs', cjk.size, 'jp font', (fs.statSync(jpOut).size / 1024).toFixed(1) + ' KB');
// música do menu: ficheiro ao lado do index.html (no site e nos testes)
for (const f of ['menu.mp3', 'fundo.mp3', 'perigo1.mp3', 'perigo2.mp3', 'perigo3.mp3']) { const a = path.join(fs.existsSync(path.join(__dirname, 'assets')) ? path.join(__dirname, 'assets') : path.join(__dirname, '../../sites/kurogane'), f); if (fs.existsSync(a)) { fs.copyFileSync(a, path.join(OUT, f)); fs.copyFileSync(a, path.join(OUT, 'web', f)); } }
