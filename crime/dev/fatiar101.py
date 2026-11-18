# v101: corta as grelhas geradas (2x2 e 4x4) em imagens soltas. Procura as calhas escuras entre as células perto de onde devem estar.
# Uso: python3 dev/fatiar101.py <pasta das grelhas> <pasta sites/crime/img>
import sys, os
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
def cuts(im, n):
    g = im.convert('L'); W, H = g.size; px = g.load()
    def best(axis, k):
        L = W if axis == 0 else H; c = round(L * k / n); lo, hi = c - L // 40, c + L // 40
        def dark(x):
            s = 0
            for t in range(0, (H if axis == 0 else W), 7): s += px[x, t] if axis == 0 else px[t, x]
            return s
        return min(range(lo, hi), key=dark)
    xs = [0] + [best(0, k) for k in range(1, n)] + [W]; ys = [0] + [best(1, k) for k in range(1, n)] + [H]
    return xs, ys
def cells(name, n):
    im = Image.open(os.path.join(src, name)).convert('RGB'); xs, ys = cuts(im, n); out = []
    for j in range(n):
        for i in range(n):
            pad = max(6, (xs[i + 1] - xs[i]) // 60)
            c = im.crop((xs[i] + pad, ys[j] + pad, xs[i + 1] - pad, ys[j + 1] - pad)); w, h = c.size; s = min(w, h)
            out.append(c.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s)))
    return out
def save(img, path, size):
    os.makedirs(os.path.dirname(path), exist_ok=True); img.resize((size, size), Image.LANCZOS).save(path, 'WEBP', quality=82, method=6)
V, C, SI, CE = os.path.join(dst, 'viagens'), os.path.join(dst, 'col'), os.path.join(dst, 'sitios'), os.path.join(dst, 'cenas')
a = cells('g1.png', 2)
for k, id in enumerate(['gb', 'it', 'eg', 'br']): save(a[k], f'{V}/r_{id}.webp', 600)
a = cells('g2.png', 2)
save(a[0], f'{V}/r_mx.webp', 600); save(a[1], f'{V}/r_za.webp', 600); save(a[2], f'{CE}/viagens.webp', 600); save(a[2], f'{CE}/viagens-g.webp', 1100); save(a[3], f'{V}/xray.webp', 600)
a = cells('g3.png', 2)
for k, id in enumerate(['volubilis', 'suttonhoo', 'pompeia', 'saqqara']): save(a[k], f'{SI}/{id}.webp', 600)
a = cells('g4.png', 2)
save(a[0], f'{SI}/teotihuacan.webp', 600); save(a[1], f'{SI}/xian.webp', 600); save(a[2], f'{V}/alfandega.webp', 600); save(a[3], f'{V}/voo.webp', 600)
a = cells('g5.png', 4)
for k, id in enumerate(['argao', 'tabaco', 'whisky', 'cartoes', 'limoncello', 'malas', 'papiro', 'antiguidades', 'tenis', 'telemoveis', 'cachaca', 'esmeraldas', 'prata', 'passaportes', 'vinho', 'diamantes']): save(a[k], f'{V}/g_{id}.webp', 480)
a = cells('g6.png', 4)
for k, id in enumerate(['seda', 'relogios', 'facas', 'perolas']): save(a[k], f'{V}/g_{id}.webp', 480)
for k, id in enumerate(['caobronze', 'busto', 'sesterco', 'balsamario', 'aplique', 'elmo', 'fivela', 'fecho', 'bossa', 'corno', 'fresco', 'venus']): save(a[4 + k], f'{C}/{id}.webp', 480)
a = cells('g7.png', 4)
for k, id in enumerate(['camafeu', 'pao', 'estrigil', 'escaravelho', 'ushabti', 'canopo', 'mascara', 'horus', 'jade', 'obsidiana', 'incensario', 'figura', 'concha', 'guerreiro', 'gatilho', 'espelho']): save(a[k], f'{C}/{id}.webp', 480)
a = cells('g8.png', 2)
save(a[0], f'{C}/banliang.webp', 480); save(a[1], f'{C}/bi.webp', 480); save(a[2], f'{V}/mala.webp', 480); save(a[3], f'{V}/cacifo.webp', 480)
# os países que já tinham imagem (v63)
for id in ['ma', 'us', 'cn', 'jp']: save(Image.open(f'{CE}/pais-{id}.webp').convert('RGB'), f'{V}/r_{id}.webp', 600)
print('ok')
# os ténis gerados traziam um símbolo parecido com uma marca na lateral: tira-se logo
import subprocess
subprocess.run([sys.executable, os.path.join(os.path.dirname(__file__), 'tenis101.py'), f'{V}/g_tenis.webp'], check=True)
