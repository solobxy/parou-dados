# v106: limpa a camada da mochila tática (img/boneco/mochilatatica.webp): o contorno da mochila atrás dos ombros saía aos bocados,
# como uma mancha escura ao lado do pescoço. Fica com as alças (separadas do resto por erosão) e corta o que está acima do topo das alças.
# Uso: python3 crime/dev/boneco106-mochila.py <entrada.webp> <saída.webp>
import sys, numpy as np
from PIL import Image
from scipy import ndimage
A = np.asarray(Image.open(sys.argv[1]).convert('RGBA')).copy(); a = A[..., 3]
e = ndimage.binary_erosion(a > 110, iterations=4); lab, n = ndimage.label(e); sz = ndimage.sum(e, lab, range(1, n + 1))
k = ndimage.binary_dilation(np.isin(lab, [i + 1 for i, v in enumerate(sz) if v >= sz.max() * 0.08]), iterations=6) & (a > 0)
a2 = np.where(k, a, 0); topo = np.nonzero(a2[:, 255:300] > 110)[0].min()   # topo da alça direita
a2[:topo - 2, :] = 0
m = a2 > 60; lab, n = ndimage.label(m); sz = ndimage.sum(m, lab, range(1, n + 1))
A[..., 3] = np.where(ndimage.binary_dilation(np.isin(lab, [i + 1 for i, v in enumerate(sz) if v >= sz.max() * 0.08]), iterations=1), a2, 0).astype(np.uint8)
A[:134, :212, 3] = 0   # v108: o topo da mochila atrás do ombro esquerdo saía como um bocado solto
Image.fromarray(A).save(sys.argv[2], 'WEBP', quality=90, method=6)
