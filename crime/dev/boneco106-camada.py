# Tira a camada de uma peça a partir da foto editada (o mesmo homem, a mesma pose) comparada com a base do boneco.
# Uso: python3 dev/boneco106-camada.py <editada.png> <saída.webp> <y0> <y1> <x0> <x1> [limiar] [zona_fixa_y0 zona_fixa_y1]
# A zona (y0..y1, x0..x1, em fração da altura/largura) é onde a peça pode estar; a zona fixa serve para alinhar (onde nada mudou).
import sys, numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage
src, out = sys.argv[1], sys.argv[2]
y0, y1, x0, x1 = map(float, sys.argv[3:7]); thr = float(sys.argv[7]) if len(sys.argv) > 7 else 28
fy0, fy1 = (map(float, sys.argv[8:10]) if len(sys.argv) > 9 else (0.0, 0.25))
base = Image.open('/home/claude/parou-dados/sites/crime/img/boneco/base.webp').convert('RGB'); W, H = base.size
B = np.asarray(base).astype(float)
G0 = Image.open(src).convert('RGB')
best = None
for s in [0.97, 0.98, 0.99, 1.0, 1.01, 1.02, 1.03]:
    g = G0.resize((round(W * s), round(H * s)), Image.LANCZOS); Ga = np.asarray(g).astype(float)
    for dy in range(-12, 13, 2):
        for dx in range(-12, 13, 2):
            # recorta/desloca para o tamanho da base
            ox, oy = (Ga.shape[1] - W) // 2 + dx, (Ga.shape[0] - H) // 2 + dy
            if ox < 0 or oy < 0 or ox + W > Ga.shape[1] or oy + H > Ga.shape[0]:
                pad = np.zeros((H + 60, W + 60, 3)); pad[:] = B[5, 5]
                yy, xx = 30 - ((Ga.shape[0] - H) // 2 + dy), 30 - ((Ga.shape[1] - W) // 2 + dx)
                ya, xa = max(0, yy), max(0, xx); yb, xb = min(H + 60, yy + Ga.shape[0]), min(W + 60, xx + Ga.shape[1])
                pad[ya:yb, xa:xb] = Ga[ya - yy:yb - yy, xa - xx:xb - xx]; C = pad[30:30 + H, 30:30 + W]
            else: C = Ga[oy:oy + H, ox:ox + W]
            fz = slice(int(fy0 * H), int(fy1 * H))
            e = np.abs(C[fz] - B[fz]).mean()
            if best is None or e < best[0]: best = (e, s, dx, dy, C)
e, s, dx, dy, C = best
print('alinhado: erro %.1f escala %.2f dx %d dy %d' % (e, s, dx, dy))
d = np.abs(C - B).sum(axis=2)
roi = np.zeros((H, W), bool); roi[int(y0 * H):int(y1 * H), int(x0 * W):int(x1 * W)] = True
m = (d > thr) & roi
m = ndimage.binary_opening(m, iterations=1); m = ndimage.binary_closing(m, iterations=4); m = ndimage.binary_fill_holes(m)
lab, n = ndimage.label(m)
if n:
    sz = ndimage.sum(m, lab, range(1, n + 1)); keep = [i + 1 for i, v in enumerate(sz) if v > 60]; m = np.isin(lab, keep)
m = ndimage.binary_dilation(m, iterations=2)
a = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
L = Image.fromarray(C.clip(0, 255).astype(np.uint8)).convert('RGBA'); L.putalpha(a)
L.save(out, 'WEBP', quality=88, method=6)
print('pixeis', int(m.sum()), 'caixa', Image.fromarray((m * 255).astype(np.uint8)).getbbox())
