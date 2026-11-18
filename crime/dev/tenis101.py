# v101: tira o símbolo da lateral dos ténis gerados (parecia uma marca). Alisa só as partes claras dentro do contorno.
import sys, numpy as np, cv2
from PIL import Image, ImageDraw
p = sys.argv[1]
im = np.array(Image.open(p).convert('RGB')).astype(np.float32)
L = im.mean(axis=2); w = (L > 75).astype(np.float32)
num = cv2.GaussianBlur(im * w[..., None], (41, 41), 0); den = cv2.GaussianBlur(w, (41, 41), 0)[..., None] + 1e-6
sm = num / den
m = Image.new('L', im.shape[1::-1], 0); ImageDraw.Draw(m).polygon([(330, 156), (352, 146), (440, 132), (450, 142), (420, 172), (395, 197), (360, 207), (338, 202), (328, 182)], fill=255)
m = cv2.GaussianBlur(np.array(m).astype(np.float32) / 255.0, (7, 7), 0) * w
out = im * (1 - m[..., None]) + sm * m[..., None]
Image.fromarray(out.clip(0, 255).astype(np.uint8)).save(p, 'WEBP', quality=82, method=6)
