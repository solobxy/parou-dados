# Recorta objetos fotografados lado a lado sobre fundo escuro (uma imagem do Canva com vários produtos) em ficheiros soltos.
# Uso: python3 dev/recortar-objetos.py <imagem> <pasta saída> <nome1,nome2,...> [tamanho=480]
# Os objetos são lidos da esquerda para a direita, por filas (de cima para baixo). Cada um fica quadrado, centrado, com margem.
import sys
import numpy as np
from PIL import Image
from scipy import ndimage
src, out, names = sys.argv[1], sys.argv[2], sys.argv[3].split(',')
size = int(sys.argv[4]) if len(sys.argv) > 4 else 480
im = Image.open(src).convert('RGB'); a = np.asarray(im).astype(int)
bg = np.median(np.concatenate([a[:8].reshape(-1, 3), a[-8:].reshape(-1, 3)]), axis=0)
mask = np.abs(a - bg).sum(axis=2) > 60
mask = ndimage.binary_closing(mask, iterations=6); mask = ndimage.binary_fill_holes(mask)
lab, n = ndimage.label(mask)
boxes = [b for b in ndimage.find_objects(lab) if (b[0].stop - b[0].start) * (b[1].stop - b[1].start) > a.shape[0] * a.shape[1] * 0.004]
# juntar caixas que se sobrepõem (um copo e a colher, por exemplo)
def merge(bs):
    bs = [[b[0].start, b[0].stop, b[1].start, b[1].stop] for b in bs]; ch = True
    while ch:
        ch = False
        for i in range(len(bs)):
            for j in range(i + 1, len(bs)):
                x, y = bs[i], bs[j]
                if not (x[1] < y[0] - 10 or y[1] < x[0] - 10 or x[3] < y[2] - 10 or y[3] < x[2] - 10):
                    bs[i] = [min(x[0], y[0]), max(x[1], y[1]), min(x[2], y[2]), max(x[3], y[3])]; bs.pop(j); ch = True; break
            if ch: break
    return bs
bs = merge(boxes)
rowh = a.shape[0] / 4
bs.sort(key=lambda b: (round(((b[0] + b[1]) / 2) / rowh), (b[2] + b[3]) / 2))
print(len(bs), 'objetos', [(b[2], b[0], b[3] - b[2], b[1] - b[0]) for b in bs])
# «nome:2» junta os dois objetos seguintes num só (uma ampola e a seringa, por exemplo)
want = sum(int(n.split(':')[1]) if ':' in n else 1 for n in names)
if len(bs) != want: sys.exit('esperava %d objetos, encontrei %d' % (want, len(bs)))
grp, i = [], 0
for n in names:
    k = int(n.split(':')[1]) if ':' in n else 1; g = bs[i:i + k]; i += k
    grp.append((n.split(':')[0], [min(x[0] for x in g), max(x[1] for x in g), min(x[2] for x in g), max(x[3] for x in g)]))
for name, (y0, y1, x0, x1) in grp:
    side = int(max(y1 - y0, x1 - x0) * 1.18); cy, cx = (y0 + y1) // 2, (x0 + x1) // 2
    # só o próprio objeto: o que for de outro (um vizinho que entra no quadrado) fica da cor do fundo
    own = np.zeros(mask.shape, bool); own[max(0, y0 - 12):y1 + 12, max(0, x0 - 12):x1 + 12] = True
    clean = np.where(own[..., None], a, bg).astype(np.uint8)
    src_im = Image.fromarray(clean)
    sq = Image.new('RGB', (side, side), tuple(int(v) for v in bg))
    crop = src_im.crop((cx - side // 2, cy - side // 2, cx - side // 2 + side, cy - side // 2 + side))
    sq.paste(crop, (0, 0))
    sq.resize((size, size), Image.LANCZOS).save(f'{out}/{name}.webp', quality=80, method=6)
    print('gravado', name)
