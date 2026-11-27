# Texturas dos objetos (caixotes, bidões, metal pintado, betão): 4 camadas de 512 px empilhadas numa imagem 512×2048 (assets/tex/props.webp).
# RGB: multiplica a cor do objeto (cinzento médio = sem mudança); A: 255 menos a ferrugem (255 = nada; 55 = ferrugem toda por cima da cor).
# Todas dão a volta (sem costuras ao repetir). Correr: python3 props/textures.py
import numpy as np, os
from PIL import Image
N = 512
rng = np.random.default_rng(7)

def noise(f, seed):  # ruído suave que dá a volta: grelha f×f ao acaso, interpolada
    r = np.random.default_rng(seed).random((f, f))
    x = np.arange(N) * f / N; i = np.floor(x).astype(int); t = x - i; t = t * t * (3 - 2 * t)
    i0, i1 = i % f, (i + 1) % f
    a = r[i0][:, i0] * (1 - t)[None, :] + r[i0][:, i1] * t[None, :]
    b = r[i1][:, i0] * (1 - t)[None, :] + r[i1][:, i1] * t[None, :]
    return a * (1 - t)[:, None] + b * t[:, None]
def fbm(f, seed, oct=5):
    s, w, tot = 0, 1, 0
    for o in range(oct):
        if f * 2 ** o > N // 2: break
        s = s + w * noise(f * 2 ** o, seed + o); tot += w; w *= 0.5
    return s / tot
def stretch(f, seed, sx, sy, oct=4):  # ruído esticado (veios da madeira, escorridos)
    s, w, tot = 0, 1, 0
    for o in range(oct):
        fx, fy = max(1, int(f * sx * 2 ** o)), max(1, int(f * sy * 2 ** o))
        if max(fx, fy) > N // 2: break
        r = np.random.default_rng(seed + o).random((fy, fx))
        y = np.arange(N) * fy / N; x = np.arange(N) * fx / N
        iy, ix = np.floor(y).astype(int), np.floor(x).astype(int); ty, tx = y - iy, x - ix; ty = ty * ty * (3 - 2 * ty); tx = tx * tx * (3 - 2 * tx)
        a = r[iy % fy][:, ix % fx] * (1 - tx)[None] + r[iy % fy][:, (ix + 1) % fx] * tx[None]
        b = r[(iy + 1) % fy][:, ix % fx] * (1 - tx)[None] + r[(iy + 1) % fy][:, (ix + 1) % fx] * tx[None]
        s = s + w * (a * (1 - ty)[:, None] + b * ty[:, None]); tot += w; w *= 0.5
    return s / tot
yy, xx = np.mgrid[0:N, 0:N]

def wood():  # tábuas na vertical (14 cm), veios, nós, frinchas escuras e pregos
    W = 72; plank = xx // W; u = (xx % W) / W
    tone = np.random.default_rng(3).uniform(0.82, 1.12, N // W + 1)[plank % (N // W + 1)]
    grain = stretch(4, 11, 1.0, 0.06) * 0.6 + stretch(16, 21, 1.0, 0.05) * 0.4
    rings = 0.5 + 0.5 * np.sin((grain * 22 + plank * 1.7) * np.pi)
    m = tone * (0.86 + 0.16 * grain + 0.07 * rings)
    gap = np.clip(1 - np.minimum(u, 1 - u) * W / 2.2, 0, 1); m *= 1 - 0.22 * gap
    for k in range(9):  # nós
        cx, cy = rng.integers(0, N), rng.integers(0, N); d = np.hypot(((xx - cx + N // 2) % N - N // 2) * 1.6, (yy - cy + N // 2) % N - N // 2)
        m *= 1 - 0.32 * np.exp(-(d / 7) ** 2)
    for py in (36, 290):  # pregos nas travessas
        for k in range(N // W + 1):
            d = np.hypot(xx - (k * W + W // 2), yy - py); m *= 1 - 0.45 * np.exp(-(d / 2.2) ** 2)
    dirt = fbm(4, 31); m *= 0.9 + 0.2 * dirt
    rgb = np.stack([m * 0.52, m * 0.5, m * 0.47], -1); return rgb, np.zeros((N, N))

def scratches(n, seed, lmax=60):
    r = np.random.default_rng(seed); S = np.zeros((N, N))
    for k in range(n):
        x, y = r.uniform(0, N, 2); a = r.uniform(0, np.pi); L = r.uniform(6, lmax); st = r.uniform(0.3, 1)
        for t in np.arange(0, L, 0.5): S[int(y + np.sin(a) * t) % N, int(x + np.cos(a) * t) % N] = max(S[int(y + np.sin(a) * t) % N, int(x + np.cos(a) * t) % N], st)
    return S

def rusty():  # bidão: ferrugem em manchas, escorridos para baixo, riscos claros
    base = fbm(4, 41); spots = fbm(6, 51)
    rust = np.clip((spots * 0.75 + base * 0.45 - 0.52) * 3.2, 0, 1)
    drip = stretch(24, 61, 1.0, 0.04); rust = np.maximum(rust, np.clip((drip - 0.62) * 4, 0, 1) * np.clip(1 - yy / N * 0.3, 0, 1) * 0.8)
    S = scratches(220, 71)
    m = 0.9 + 0.18 * (fbm(16, 81) - 0.5) + 0.25 * S
    rgb = np.stack([m * 0.5] * 3, -1); return rgb, rust

def painted():  # metal pintado gasto: lascas, riscos, sujidade em baixo, um pouco de ferrugem nas lascas
    chip = fbm(10, 91); chips = np.clip((chip - 0.66) * 6, 0, 1)
    S = scratches(160, 101, 40)
    dirt = fbm(3, 111) * 0.6 + stretch(20, 121, 1.0, 0.05) * 0.4
    m = 0.95 + 0.1 * (fbm(24, 131) - 0.5) - 0.18 * (dirt - 0.5) + 0.3 * S - 0.25 * chips
    rgb = np.stack([m * 0.5] * 3, -1); return rgb, chips * 0.55

def concrete():  # betão: poros, manchas, fissuras finas
    m = 0.92 + 0.22 * (fbm(6, 141) - 0.5) + 0.12 * (fbm(48, 151) - 0.5)
    pores = np.random.default_rng(161).random((N, N)); m *= 1 - 0.25 * (pores > 0.985)
    crack = np.abs(fbm(5, 171) - 0.5); m *= 1 - 0.35 * np.clip(1 - crack * 90, 0, 1) * np.clip((fbm(3, 181) - 0.55) * 6, 0, 1)
    rgb = np.stack([m * 0.5] * 3, -1); return rgb, np.zeros((N, N))

L = [wood(), rusty(), painted(), concrete()]
img = np.zeros((N * 4, N, 4), np.uint8)
for i, (rgb, a) in enumerate(L):
    img[i * N:(i + 1) * N, :, :3] = np.clip(rgb * 255, 0, 255).astype(np.uint8); img[i * N:(i + 1) * N, :, 3] = np.clip(255 - a * 200, 0, 255).astype(np.uint8)  # alfa = 255 − ferrugem (nunca 0: o WebP estraga a cor dos píxeis transparentes)
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'tex', 'props.webp')
Image.fromarray(img, 'RGBA').save(out, 'WEBP', quality=84, method=6, exact=True)
print('escrito', out, os.path.getsize(out) // 1024, 'KB')
