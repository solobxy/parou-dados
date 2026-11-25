# Texturas do chão, sem costuras (tudo periódico: ruído por FFT e desenhos repetidos nas bordas)
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
import os
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'tex') + os.sep
rng = np.random.default_rng(7)

def fnoise(n, beta=2.0, seed=None):
    r = np.random.default_rng(seed) if seed is not None else rng
    w = r.standard_normal((n, n))
    F = np.fft.fft2(w); fx = np.fft.fftfreq(n)[:, None]; fy = np.fft.fftfreq(n)[None, :]
    f = np.sqrt(fx * fx + fy * fy); f[0, 0] = 1
    F = F / f ** (beta / 2); F[0, 0] = 0
    a = np.real(np.fft.ifft2(F)); a = (a - a.mean()) / (a.std() + 1e-9); return a

def band(n, lo, hi, seed=None):  # ruído só numa banda de frequências (manchas de um certo tamanho)
    r = np.random.default_rng(seed); w = r.standard_normal((n, n)); F = np.fft.fft2(w)
    fx = np.fft.fftfreq(n)[:, None] * n; fy = np.fft.fftfreq(n)[None, :] * n; f = np.sqrt(fx * fx + fy * fy)
    F[(f < lo) | (f > hi)] = 0; a = np.real(np.fft.ifft2(F)); return (a - a.mean()) / (a.std() + 1e-9)

def save(a, name, q=82):
    im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)); im.save(OUT + name, quality=q, optimize=True, progressive=True); print(name, im.size)

def wrapdraw(img, fn):  # desenha 9 vezes (com desvio de ±tamanho) para as figuras que passam a borda continuarem do outro lado
    d = ImageDraw.Draw(img, 'RGBA'); n = img.size[0]
    def put(shape, *a, **k):
        for ox in (-n, 0, n):
            for oy in (-n, 0, n): shape(d, ox, oy, *a, **k)
    fn(put)

def tint(base, var, *layers):
    out = np.zeros(layers[0].shape + (3,))
    for c in range(3): out[..., c] = base[c] + sum(l * v[c] for l, v in zip(layers, var))
    return out

# ---------- relva (vista de cima): fundo de terra e erva, manchas suaves, muitas folhas curtas
def grass(n=1024):
    lo = fnoise(n, 3.2, 1); mid = band(n, 6, 30, 2); fine = fnoise(n, 1.0, 3)
    base = tint((78, 100, 52), [(10, 14, 6), (8, 9, 4), (5, 6, 4)], lo, mid, fine)
    dry = np.clip(band(n, 3, 10, 4) - 0.6, 0, None)  # zonas mais secas
    base += dry[..., None] * np.array([28, 18, -2]); img = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8)).convert('RGB')
    r = np.random.default_rng(11)
    def blades(put):
        for i in range(52000):
            x, y = r.uniform(0, n, 2); L = r.uniform(5, 13); a = r.uniform(0, 2 * np.pi)
            g = r.uniform(0, 1); col = (int(60 + 55 * g + r.uniform(-8, 8)), int(84 + 60 * g + r.uniform(-8, 8)), int(36 + 28 * g), int(r.uniform(120, 220)))
            if r.random() < 0.06: col = (int(150 + r.uniform(0, 30)), int(140 + r.uniform(0, 20)), 80, 160)  # folha seca
            x2, y2 = x + np.cos(a) * L, y + np.sin(a) * L
            put(lambda d, ox, oy: d.line([(x + ox, y + oy), (x2 + ox, y2 + oy)], fill=col, width=int(r.integers(1, 3))))
        for i in range(2200):  # pedrinhas e terra entre a erva
            x, y = r.uniform(0, n, 2); s = r.uniform(1, 2.6); v = int(r.uniform(70, 110))
            put(lambda d, ox, oy: d.ellipse([x + ox - s, y + oy - s, x + ox + s, y + oy + s], fill=(v, v - 8, v - 20, 150)))
    wrapdraw(img, blades); a = np.asarray(img.convert('RGB')).astype(float)
    sh = fnoise(n, 2.6, 5); a *= (1 + 0.07 * sh)[..., None]; save(a, 'grass.jpg', 80)

# ---------- terra batida com pedras
def dirt(n=512):
    lo = fnoise(n, 3.0, 21); mid = band(n, 8, 40, 22); fine = fnoise(n, 0.8, 23)
    a = tint((122, 100, 74), [(14, 12, 9), (9, 8, 6), (10, 9, 8)], lo, mid, fine)
    img = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).convert('RGB'); r = np.random.default_rng(24)
    def stones(put):
        for i in range(1400):
            x, y = r.uniform(0, n, 2); s = r.uniform(0.8, 3.2); v = int(r.uniform(95, 165)); e = r.uniform(0.6, 1.3)
            put(lambda d, ox, oy: (d.ellipse([x + ox - s + 0.6, y + oy - s * e + 0.8, x + ox + s + 0.6, y + oy + s * e + 0.8], fill=(60, 48, 36, 120)), d.ellipse([x + ox - s, y + oy - s * e, x + ox + s, y + oy + s * e], fill=(v, v - 6, v - 16, 230))))
    wrapdraw(img, stones); a = np.asarray(img.convert('RGB')).astype(float); save(a, 'dirt.jpg', 80)

# ---------- asfalto: grão fino, brita clara e escura, manchas de óleo e desgaste
def asph(n=1024):
    fine = np.random.default_rng(31).standard_normal((n, n)); fine = np.asarray(Image.fromarray(((fine * 0.5 + 0.5).clip(0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))).astype(float) / 255 - 0.5
    lo = fnoise(n, 3.0, 32); mid = band(n, 10, 60, 33)
    a = tint((86, 87, 90), [(26, 26, 26), (7, 7, 7), (5, 5, 5)], fine, lo, mid); a -= (np.clip(band(n, 8, 20, 35) - 1.6, 0, None) * 14)[..., None] # manchas de óleo suaves
    img = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).convert('RGB'); r = np.random.default_rng(34)
    def agg(put):
        for i in range(26000):
            x, y = r.uniform(0, n, 2); s = r.uniform(0.6, 1.8); v = int(r.uniform(40, 160)); al = int(r.uniform(90, 210))
            put(lambda d, ox, oy: d.ellipse([x + ox - s, y + oy - s, x + ox + s, y + oy + s], fill=(v, v, v + 2, al)))
    wrapdraw(img, agg); a = np.asarray(img.convert('RGB')).astype(float); save(a, 'asph.jpg', 78)

# ---------- betão: manchas, poros e juntas de dilatação a cada 2 m (a textura cobre 4 m)
def conc(n=512):
    lo = fnoise(n, 3.2, 41); mid = band(n, 6, 30, 42); fine = fnoise(n, 0.6, 43)
    a = tint((176, 172, 164), [(8, 8, 8), (6, 6, 6), (6, 6, 6)], lo, mid, fine); a -= (np.clip(band(n, 4, 12, 45) - 1.2, 0, None) * 10)[..., None] # manchas de humidade
    img = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).convert('RGB'); r = np.random.default_rng(44)
    def pores(put):
        for i in range(5000):
            x, y = r.uniform(0, n, 2); s = r.uniform(0.4, 1.1); v = int(r.uniform(110, 150))
            put(lambda d, ox, oy: d.ellipse([x + ox - s, y + oy - s, x + ox + s, y + oy + s], fill=(v, v - 2, v - 6, 150)))
    wrapdraw(img, pores); d = ImageDraw.Draw(img, 'RGBA')
    for k in (0, n // 2): d.line([(k, 0), (k, n)], fill=(96, 92, 86, 170), width=2); d.line([(0, k), (n, k)], fill=(96, 92, 86, 170), width=2)
    a = np.asarray(img.convert('RGB')).astype(float); save(a, 'conc.jpg', 80)

# ---------- passeio: lajes de betão de 60 cm com junta (4 por textura de 2,4 m)
def tile(n=512):
    lo = fnoise(n, 3.0, 51); fine = fnoise(n, 0.7, 52)
    a = tint((184, 178, 168), [(6, 6, 6), (7, 7, 7)], lo, fine); a += (np.random.default_rng(54).standard_normal((n, n)) * 4)[..., None]; r = np.random.default_rng(53); s = n // 4
    for i in range(4):
        for j in range(4): a[j * s:(j + 1) * s, i * s:(i + 1) * s] += r.uniform(-10, 10)
    img = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).convert('RGB'); d = ImageDraw.Draw(img, 'RGBA')
    for k in range(5): p = k * s; d.line([(p, 0), (p, n)], fill=(110, 104, 96, 210), width=3); d.line([(0, p), (n, p)], fill=(110, 104, 96, 210), width=3)
    a = np.asarray(img.convert('RGB')).astype(float); save(a, 'tile.jpg', 82)

grass(); dirt(); asph(); conc(); tile()
