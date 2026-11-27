# Folhagem: uma imagem 1024×1024 com recorte (alfa) para as árvores e a erva (assets/tex/foliage.webp).
#   [0..512, 0..512]     ramo de folhas largas (vista de frente), cinzento claro: a cor vem do vértice (verde, amarelo dos ginkgos)
#   [512..1024, 0..512]  ramo de pinheiro (agulhas), a descer da esquerda para a direita
#   [0..512, 512..1024]  casca de árvore (opaca, repete na vertical)
#   [512..1024, 512..768] tufo de erva (lâminas)
#   [512..1024, 768..1024] branco liso (para as árvores de longe, que só usam a cor do vértice)
# Correr: python3 props/foliage.py
import numpy as np, math, os
from PIL import Image, ImageDraw, ImageFilter
S = 1024
rng = np.random.default_rng(5)
img = Image.new('RGBA', (S, S), (0, 0, 0, 0))

def leaf_branch(W, H, seed):
    r = np.random.default_rng(seed); L = Image.new('RGBA', (W * 2, H * 2), (0, 0, 0, 0)); d = ImageDraw.Draw(L)
    cx, cy = W, H
    # galhos finos a partir do centro de baixo
    stems = []
    for k in range(7):
        a = -math.pi / 2 + r.uniform(-1.25, 1.25); ln = r.uniform(0.55, 0.95) * H
        x0, y0 = cx + r.uniform(-30, 30), cy * 2 - 10; x1, y1 = cx + math.cos(a) * ln * 1.1, cy * 2 - 10 + math.sin(a) * ln * 1.6
        stems.append((x0, y0, x1, y1)); d.line([(x0, y0), (x1, y1)], fill=(70, 60, 48, 255), width=5)
    # folhas ao longo dos galhos e à volta
    for i in range(1500):
        rr_, aa = math.sqrt(r.uniform(0, 1)) * 0.92, r.uniform(0, math.pi * 2)
        px, py = cx + math.cos(aa) * rr_ * W, cy + math.sin(aa) * rr_ * H * 0.95
        if r.uniform() > 1.15 - rr_ * 0.5: continue  # mais denso no meio, a esfiapar na orla
        a = r.uniform(0, math.pi * 2); l, w = r.uniform(30, 52), r.uniform(13, 21)
        sh = r.uniform(0.55, 1.0); base = int(150 + 90 * sh)
        pts = []
        for s in np.linspace(0, 1, 9):
            ww = w * math.sin(math.pi * s) ** 0.8
            pts.append((s * l, ww))
        pts = pts + [(p[0], -p[1]) for p in reversed(pts)]
        ca, sa = math.cos(a), math.sin(a)
        poly = [(px + x * ca - y * sa, py + x * sa + y * ca) for x, y in pts]
        g = base; d.polygon(poly, fill=(int(g * 0.92), g, int(g * 0.86), 255), outline=(int(g * 0.55), int(g * 0.6), int(g * 0.5), 255))
        d.line([(px, py), (px + l * 0.9 * ca, py + l * 0.9 * sa)], fill=(int(g * 0.7), int(g * 0.75), int(g * 0.65), 255), width=1)
    return L.resize((W, H), Image.LANCZOS)

def pine_branch(W, H, seed):
    r = np.random.default_rng(seed); L = Image.new('RGBA', (W * 2, H * 2), (0, 0, 0, 0)); d = ImageDraw.Draw(L)
    # ramo principal da esquerda (tronco) para a direita, a descer um pouco; raminhos para os lados, agulhas em cada um
    def stem(x0, y0, x1, y1, wdt, dens, depth):
        d.line([(x0, y0), (x1, y1)], fill=(80, 64, 48, 255), width=wdt)
        n = int(math.hypot(x1 - x0, y1 - y0) / 5 * dens)
        for i in range(n):
            t = r.uniform(0, 1); px, py = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
            a = math.atan2(y1 - y0, x1 - x0) + r.choice([-1, 1]) * r.uniform(0.6, 1.2); l = r.uniform(26, 46) * (1.1 - t * 0.4)
            g = int(r.uniform(140, 235)); d.line([(px, py), (px + math.cos(a) * l, py + math.sin(a) * l)], fill=(int(g * 0.85), g, int(g * 0.8), 255), width=4)
        if depth:
            for k in range(9):
                t = 0.12 + k * 0.095; px, py = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t; a = math.atan2(y1 - y0, x1 - x0)
                for sgn in (-1, 1):
                    b = a + sgn * r.uniform(0.5, 0.9); l = (1 - t * 0.7) * math.hypot(x1 - x0, y1 - y0) * r.uniform(0.38, 0.5)
                    stem(px, py, px + math.cos(b) * l, py + math.sin(b) * l, 3, dens * 1.8, depth - 1)
    stem(10, H * 0.7, W * 2 - 30, H * 1.25, 9, 1.0, 1)
    return L.resize((W, H), Image.LANCZOS)

def bark(W, H):
    y, x = np.mgrid[0:H, 0:W]
    def st(fx, fy, seed):
        rr = np.random.default_rng(seed).random((fy, fx)); X = x * fx / W; Y = y * fy / H; ix, iy = X.astype(int), Y.astype(int); tx, ty = X - ix, Y - iy
        a = rr[iy % fy, ix % fx] * (1 - tx) + rr[iy % fy, (ix + 1) % fx] * tx; b = rr[(iy + 1) % fy, ix % fx] * (1 - tx) + rr[(iy + 1) % fy, (ix + 1) % fx] * tx; return a * (1 - ty) + b * ty
    n = st(24, 4, 1) * 0.5 + st(48, 8, 2) * 0.3 + st(96, 16, 3) * 0.2
    ridges = np.abs(np.sin((x / W * 14 + n * 3.0) * math.pi)) ** 0.4
    m = 0.55 + 0.35 * ridges + 0.2 * (st(64, 64, 4) - 0.5)
    m = np.clip(m, 0, 1)
    rgb = np.stack([m * 205, m * 190, m * 172], -1).astype(np.uint8)
    return Image.fromarray(np.dstack([rgb, np.full((H, W), 255, np.uint8)]), 'RGBA')

def grass(W, H, seed):
    r = np.random.default_rng(seed); L = Image.new('RGBA', (W * 2, H * 2), (0, 0, 0, 0)); d = ImageDraw.Draw(L)
    for i in range(90):
        x0 = r.uniform(40, W * 2 - 40); h = r.uniform(0.45, 0.98) * H * 2; bend = r.uniform(-0.5, 0.5); w = r.uniform(7, 13)
        g = int(r.uniform(120, 230)); pts_l, pts_r = [], []
        for s in np.linspace(0, 1, 10):
            cx = x0 + bend * (s ** 2) * h * 0.5; cy = H * 2 - s * h; ww = w * (1 - s) ** 0.8
            pts_l.append((cx - ww, cy)); pts_r.append((cx + ww, cy))
        d.polygon(pts_l + list(reversed(pts_r)), fill=(int(g * 0.88), g, int(g * 0.78), 255))
    return L.resize((W, H), Image.LANCZOS)

img.paste(leaf_branch(512, 512, 11), (0, 0))
img.paste(pine_branch(512, 512, 21), (512, 0))
img.paste(bark(512, 512), (0, 512))
img.paste(grass(512, 256, 31), (512, 512))
img.paste(Image.new('RGBA', (512, 256), (235, 235, 235, 255)), (512, 768))
# recorte: píxeis transparentes com a cor média por baixo (evita orla preta ao misturar níveis da textura)
a = np.array(img); al = a[..., 3]
for sl in [(slice(0, 512), slice(0, 512)), (slice(0, 512), slice(512, 1024)), (slice(512, 768), slice(512, 1024))]:
    blk = a[sl]; m = blk[..., 3] > 128
    if m.any():
        mean = blk[m][:, :3].mean(0); blk[~m, :3] = mean.astype(np.uint8); blk[~m, 3] = np.minimum(blk[~m, 3], 1)
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'tex', 'foliage.webp')
Image.fromarray(a, 'RGBA').save(out, 'WEBP', quality=86, method=6, exact=True)
print('escrito', out, os.path.getsize(out) // 1024, 'KB')
