# v106: as «luvas» da loja são de cabedal preto sem dedos; a camada antiga era de lã cinzenta com dedos.
# Faz a camada a partir das luvas de cabedal (mesma pose) e tira-lhe as pontas dos dedos, deixando ver a mão do boneco.
# Uso (dentro de crime/): python3 dev/boneco106-luvas.py [fração do corte, 0.66 por defeito]
import os, sys, numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage
B = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'sites', 'crime', 'img', 'boneco')
f = float(sys.argv[1]) if len(sys.argv) > 1 else 0.66
src = Image.open(os.path.join(B, 'luvascabedal.webp')).convert('RGBA'); A = np.asarray(src).copy()
m = A[..., 3] > 40; lab, n = ndimage.label(m)
sz = ndimage.sum(m, lab, range(1, n + 1)); maos = [i + 1 for i in np.argsort(sz)[::-1][:2]]
keep = np.ones(m.shape, float)
for k in maos:
    ys, xs = np.nonzero(lab == k); y0, y1 = ys.min(), ys.max(); cut = y0 + f * (y1 - y0)
    yy = np.arange(m.shape[0])[:, None]; band = np.clip((cut + 2 - yy) / 4, 0, 1)   # corte com 4 px de transição
    sel = (lab == k); keep[sel] = band.repeat(m.shape[1], 1)[sel]
    # bainha: uma linha um pouco mais escura logo acima do corte
    hem = sel & (yy.repeat(m.shape[1], 1) > cut - 4) & (yy.repeat(m.shape[1], 1) <= cut)
    A[..., :3][hem] = (A[..., :3][hem] * 0.7).astype(np.uint8)
A[..., 3] = (A[..., 3] * keep).astype(np.uint8)
Image.fromarray(A).save(os.path.join(B, 'luvas.webp'), 'WEBP', quality=90, method=6)
print('luvas.webp feito, corte a', f)
