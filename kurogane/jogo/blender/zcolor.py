# Cor e relevo fino de cada píxel da textura do corpo (a partir dos mapas que o human.py calculou no Blender):
# posição de cada píxel no corpo, região (pele, olho, dentes, camisa, calças, sapato, borda), normais e sombra de canto.
# Saída: assets/tex/<nome>.jpg (cor) e <nome>_n.jpg (normais). Correr: /tmp/bl/bin/python blender/zcolor.py zombie
import sys, os, numpy as np
from PIL import Image
KIND = 'player' if 'player' in sys.argv else 'zombie'; NAME = 'zombie' if KIND == 'zombie' else 'player'
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, '..', 'assets', 'tex')
M = np.load(f'/tmp/mh/maps_{KIND}.npz'); RF = np.load(f'/tmp/mh/ref_{KIND}.npz')
Nm, AO, POS, REGm = M['N'][..., :3], M['AO'][..., 0], M['POS'], M['REG'][..., 0]
S = Nm.shape[0]; cov = (POS[..., :3].sum(-1) > 0.5)
P = POS[..., :3] - 1.0; R = np.round(REGm * 10).astype(int)
idx = np.where(cov); Pc = P[idx]; Rc = R[idx]; x, y, z = Pc.T; n = len(Pc)

R0 = np.random.default_rng(13); PERM = np.concatenate([R0.permutation(256)] * 2); GR = R0.normal(size=(256, 3)); GR /= np.linalg.norm(GR, axis=1)[:, None]
def noise(Pn):
    i = np.floor(Pn).astype(int); f = Pn - i; u = f * f * f * (f * (f * 6 - 15) + 10); out = np.zeros(len(Pn))
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                h = PERM[(PERM[(PERM[(i[:, 0] + dx) & 255] + i[:, 1] + dy) & 255] + i[:, 2] + dz) & 255]
                w = np.where(dx, u[:, 0], 1 - u[:, 0]) * np.where(dy, u[:, 1], 1 - u[:, 1]) * np.where(dz, u[:, 2], 1 - u[:, 2])
                out += w * np.einsum('ij,ij->i', GR[h], f - np.array([dx, dy, dz]))
    return out
def fbm(Pn, s, o=4, seed=0):
    Pn = np.asarray(Pn, float) * s + seed * 17.3; a, t = 0.5, 0.0
    for _ in range(o): t = t + a * noise(Pn); Pn = Pn * 2.03 + 3.1; a *= 0.5
    return t
def ss(a, b, v): t = np.clip((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)
def hexc(h): return np.array([(h >> 16) & 255, (h >> 8) & 255, h & 255]) / 255.0
def mix(a, b, t): t = np.asarray(t, float); t = t[:, None] if t.ndim == 1 else t; return a + (b - a) * t

C = np.zeros((n, 3)); H = np.zeros(n)  # cor (sRGB) e altura fina (m) por píxel
sk, ey, te, sh, pa, so, rim = [Rc == k for k in range(7)]
big = fbm(Pc, 7, 3, 1); mid = fbm(Pc, 25, 3, 2); fine = fbm(Pc, 120, 2, 3); grain = fbm(Pc, 420, 2, 4)
EYE_R, EYE_L, MOUTH, NECK_Y = RF['EYE_R'], RF['EYE_L'], RF['MOUTH'], float(RF['NECK_Y'])

if KIND == 'zombie':
    # pele: cinzento-esverdeado baço, nódoas arroxeadas, veias, zonas amareladas, sujidade; cara com órbitas escuras e lábios roxos
    base = hexc(0x8c917f)
    skc = base[None, :] * (1 + 0.1 * mid + 0.05 * fine)[:, None]
    skc = mix(skc, skc * np.array([0.62, 0.52, 0.62]), 0.6 * ss(0.05, 0.3, fbm(Pc, 5, 3, 5)))
    skc = mix(skc, skc * np.array([0.92, 0.95, 0.72]), 0.45 * ss(0.0, 0.3, fbm(Pc, 3, 2, 6)))
    vein = ss(0.94, 0.985, 1 - np.abs(fbm(Pc, 18, 3, 7)) * 7); skc = mix(skc, skc * np.array([0.5, 0.52, 0.64]), 0.32 * vein * np.where(y > NECK_Y + 0.02, 0.35, 1.0))
    head = y > NECK_Y + 0.02
    for E in (EYE_R, EYE_L):
        dd = np.hypot(x - E[0], (y - E[1]) * 1.15); skc = mix(skc, skc * np.array([0.3, 0.25, 0.3]), (ss(0.032, 0.012, dd) * (z > E[2] - 0.03) * head))
    MY = MOUTH[1] - 0.04  # a referência do MakeHuman fica um pouco acima dos lábios
    lip = ss(0.02, 0.01, np.hypot((x - MOUTH[0]) * 0.8, (y - MY) * 2.4)) * (z > MOUTH[2] - 0.01) * head
    skc = mix(skc, hexc(0x4a2a30)[None, :], 0.8 * lip)
    hair = head & (y > NECK_Y + 0.19) & (fbm(Pc, 14, 4, 8) > -0.08) & (z < EYE_R[2] - 0.035)
    skc[hair] = hexc(0x262220) * (1 + 0.3 * grain[hair])[:, None]
    hand = (np.abs(x) > 0.17) & (y < 0.88); skc = mix(skc, skc * np.array([0.6, 0.55, 0.45]), 0.5 * hand * ss(0.86, 0.68, y))  # mãos sujas
    wound = ss(0.33, 0.38, fbm(Pc, 9, 4, 9)); skc = mix(skc, hexc(0x5a1410)[None, :], 0.85 * wound); skc = mix(skc, hexc(0x2a0c0a)[None, :], 0.7 * ss(0.38, 0.42, fbm(Pc, 9, 4, 9)))
    C[sk] = skc[sk]; H[sk] = 0.00025 * grain[sk] + 0.0004 * fine[sk] - 0.0012 * wound[sk]
    # olhos baços com uma íris apagada; dentes amarelos e escuros entre si
    C[ey] = mix(np.tile(hexc(0xd4cfb4), (n, 1)), hexc(0x8a8a78)[None, :], 0.3 * (mid > 0))[ey]
    C[te] = hexc(0xb8a476) * (0.75 + 0.35 * (np.sin(x * 900) > -0.4))[te, None]
    # camisa: algodão claro, trama, manchas de suor e de terra, sangue no peito, costuras
    shirt = hexc(0xb7ae99)[None, :] * (1 + 0.05 * np.sin(x * 2400) * np.sin(y * 2400) + 0.06 * fine)[:, None]
    shirt = mix(shirt, shirt * np.array([0.72, 0.66, 0.52]), 0.55 * ss(-0.05, 0.4, big))  # terra
    shirt = mix(shirt, shirt * 0.55, 0.6 * ss(1.25, 0.98, y) * ss(-0.1, 0.3, mid))  # sujo em baixo
    blood = ss(0.22, 0.3, fbm(Pc, 6, 4, 10) + 0.2 * (z > 0.05) * (y > 1.15)); shirt = mix(shirt, hexc(0x5c1410)[None, :], 0.8 * blood); shirt = mix(shirt, hexc(0x3a100c)[None, :], 0.5 * ss(0.3, 0.4, fbm(Pc, 6, 4, 10)))
    seam = ss(0.004, 0.0, np.abs(np.abs(x) - 0.175)) * (y < 1.32); shirt = shirt * (1 - 0.25 * seam)[:, None]
    C[sh] = shirt[sh]; H[sh] = 0.00018 * np.sin(x[sh] * 2400) * np.sin(y[sh] * 2400) + 0.0005 * seam[sh]
    # calças de ganga: sarja diagonal, desbotada nas coxas e joelhos, costuras laranja, lama em baixo, sangue
    tw = np.sin((x + y) * 1800 + z * 600); jean = hexc(0x3a4760)[None, :] * (1 + 0.08 * tw + 0.05 * fine)[:, None]
    fade = ss(-0.05, 0.35, fbm(Pc, 6, 3, 11)) * (z > 0.0) * (0.4 + 0.6 * ss(0.35, 0.6, y) * ss(0.95, 0.7, y)); jean = mix(jean, hexc(0x8494b0)[None, :], 0.55 * fade)
    out_seam = ss(0.0035, 0.0, np.abs(np.abs(x) - (0.11 + 0.082 * np.clip((0.9 - y) / 0.8, 0, 1) * 0 + 0.0))) * 0
    stitch = ss(0.003, 0.0, np.abs(z + 0.0)) * 0
    jean = mix(jean, hexc(0x5a4632)[None, :], 0.7 * ss(0.3, 0.12, y) * ss(-0.2, 0.2, mid))  # lama
    jean = mix(jean, hexc(0x4a120e)[None, :], 0.75 * ss(0.28, 0.34, fbm(Pc, 7, 4, 12)))
    C[pa] = jean[pa]; H[pa] = 0.00022 * tw[pa]
    # sapatos: couro escuro gasto, sola de borracha, atacadores
    shoe = hexc(0x3b2e24)[None, :] * (1 + 0.12 * fine + 0.08 * mid)[:, None]; shoe = mix(shoe, hexc(0x6a5a48)[None, :], 0.35 * ss(0.1, 0.4, big))
    sole = y < 0.004; shoe[sole] = hexc(0x1e1d1c) * (1 + 0.1 * grain[sole])[:, None]
    lace = (z > 0.06) & (y > 0.045) & (y < 0.1) & (np.abs(x) > 0.05) & (np.sin(z * 260) > 0.6); shoe[lace] = hexc(0x8a7f6a)
    C[so] = shoe[so]; H[so] = 0.0003 * fine[so] + 0.0006 * lace[so]
    C[rim] = (C[rim] if rim.any() else 0) * 0 + hexc(0x2a2622)
C = np.clip(C, 0, 1)

# sombra de canto suave (nunca chega a preto) e a cor final
ao = AO[idx]; Cf = C * (0.4 + 0.6 * np.clip(ao, 0, 1) ** 0.75)[:, None]
img = np.zeros((S, S, 3)); img[idx] = Cf
# fora das ilhas: estica a cor da borda (para o mipmap não puxar preto)
from scipy import ndimage
def dilate(a, mask, it=10):
    a = a.copy(); m = mask.copy()
    for _ in range(it):
        acc = np.zeros_like(a); cnt = np.zeros(m.shape)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            sh_ = np.roll(np.roll(m, dy, 0), dx, 1); acc += np.roll(np.roll(a, dy, 0), dx, 1) * sh_[..., None]; cnt += sh_
        new = (~m) & (cnt > 0); a[new] = acc[new] / cnt[new][:, None]; m = m | new
    return a
img = dilate(img, cov, 12)
img[S - 10:, S - 10:] = np.median(Cf[sk], 0) if sk.any() else 0.5  # canto usado pelas faces escondidas debaixo das bordas da roupa: cor de pele
Image.fromarray((np.clip(img[::-1], 0, 1) * 255).astype(np.uint8)).save(os.path.join(OUT, NAME + '.jpg'), quality=88, optimize=True)

# relevo fino → juntar às normais cozidas (inclinação da altura ao longo de U e V, em metros por píxel)
Hm = np.zeros((S, S)); Hm[idx] = H
dPu = np.linalg.norm(np.roll(P, -1, 1) - P, axis=-1); dPv = np.linalg.norm(np.roll(P, -1, 0) - P, axis=-1)
gu = (np.roll(Hm, -1, 1) - Hm) / np.maximum(dPu, 1e-4); gv = (np.roll(Hm, -1, 0) - Hm) / np.maximum(dPv, 1e-4)
ok = cov & np.roll(cov, -1, 1) & np.roll(cov, -1, 0) & (dPu < 0.01) & (dPv < 0.01)
gu[~ok] = 0; gv[~ok] = 0
N = Nm * 2 - 1; N[..., 0] -= np.clip(gu, -1.5, 1.5); N[..., 1] -= np.clip(gv, -1.5, 1.5); N /= np.linalg.norm(N, axis=-1, keepdims=True) + 1e-9
N[~cov] = (0, 0, 1)
Nimg = dilate(N * 0.5 + 0.5, cov, 12); Nimg[S - 10:, S - 10:] = (0.5, 0.5, 1.0)
Image.fromarray((np.clip(Nimg[::-1], 0, 1) * 255).astype(np.uint8)).save(os.path.join(OUT, NAME + '_n.jpg'), quality=90, optimize=True)
print('texturas', NAME, os.path.getsize(os.path.join(OUT, NAME + '.jpg')) // 1024, 'KB', os.path.getsize(os.path.join(OUT, NAME + '_n.jpg')) // 1024, 'KB')
