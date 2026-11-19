# v106: recorta as peças do museu (img/col) do fundo da fotografia com o rembg, para a vitrine não mostrar manchas do fundo,
# e põe todas à mesma escala (a peça ocupa ~80% do lado maior; antes a fíbula e o cossoiro ficavam minúsculos).
# Uso: python3 crime/dev/col106-recorte.py <pasta img/col> <pasta de saída> [ids...]
import sys, glob, os
import numpy as np
from PIL import Image
from scipy import ndimage
from rembg import remove, new_session
src, out = sys.argv[1], sys.argv[2]
ids = sys.argv[3:]
LIMIAR = {'selo'}   # fundo preto liso e peça clara com recortes: a luz chega e o rembg comia metade do selo
os.makedirs(out, exist_ok=True)
ses = new_session('isnet-general-use')
for f in sorted(glob.glob(os.path.join(src, '*.webp'))):
    id = os.path.basename(f)[:-5]
    if ids and id not in ids: continue
    im = Image.open(f).convert('RGB')
    if id in LIMIAR:
        A = np.asarray(im).astype(int); m = A.mean(axis=2) > 28
        m = ndimage.binary_fill_holes(ndimage.binary_closing(m, iterations=2))
        lab, n = ndimage.label(m); sz = ndimage.sum(m, lab, range(1, n + 1)); m = lab == (int(np.argmax(sz)) + 1)
        a = Image.fromarray((m * 255).astype(np.uint8))
        cut = im.convert('RGBA'); cut.putalpha(a)
    else:
        cut = remove(im, session=ses, post_process_mask=True)
        cut.putalpha(cut.getchannel('A').point(lambda v: 0 if v < 14 else v))   # tira o véu quase transparente
    cut = cut.crop(cut.getbbox())
    side = int(max(cut.size) / 0.8)
    sq = Image.new('RGBA', (side, side), (0, 0, 0, 0)); sq.alpha_composite(cut, ((side - cut.size[0]) // 2, (side - cut.size[1]) // 2))
    sq = sq.resize((480, 480), Image.LANCZOS)
    sq.save(os.path.join(out, id + '.webp'), 'WEBP', quality=88, method=6)
    print(id, flush=True)
