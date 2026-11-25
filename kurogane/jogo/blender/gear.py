# Equipamento do Kurogane modelado no Blender e ajustado ao corpo novo (malha do MakeHuman na pose do jogo):
# capacete, colete de placas, mochila de campismo, mochila de couro, visão noturna e fato ghillie (por parte do corpo).
# Correr: /tmp/bl/bin/python blender/gear.py [peça ...] [--preview]  → escreve src/geardata.js
import sys, os, math, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gunlib import *
import gunlib as L
import numpy as np
R = np.load('/tmp/mh/rest_player.npz'); PB, WB, TAGB = R['P'], R['W'], R['TAG']
SEG = ['torso', 'head', 'armL', 'armR', 'foreL', 'foreR', 'legL', 'legR', 'shinL', 'shinR']
HIP, NECK, SHY, SHX, UPPER, THIGH = 0.92, 0.74, 1.42, 0.27, 0.30, 0.44
HEADP = np.array([0, HIP + NECK, 0.0]); TORSOP = np.array([0, HIP, 0.0])
OLV, TAN, BLK, STRAP = 0x5f6844, 0x8a7a55, 0x1c1d1f, 0x2a2b26
HC = HEADP + np.array([0, -0.0402, 0.0386])  # centro da cabeça (mundo)
def shift(part, d):  # passa a peça para as coordenadas locais do grupo (cabeça ou tronco)
    for v in part.ob.data.vertices: v.co = (v.co.x - d[0], v.co.y - d[1], v.co.z - d[2])
def all_shift(d):
    for P in L.PARTS: shift(P, d)
def smooth_field(V, F, val, it=8):
    nb = [set() for _ in range(len(V))]
    for f in F:
        for a in f:
            nb[a].update(f)
    nb = [np.array(sorted(n - {i})) for i, n in enumerate(nb)]
    for _ in range(it): val = 0.5 * val + 0.5 * np.array([val[n].mean() if len(n) else val[i] for i, n in enumerate(nb)])
    return val

def capacete():
    hv = PB[(WB[:, 1] > 0.5) & (TAGB == 0)]; r = hv - HC
    ear = (np.abs(r[:, 0]) > 0.066) & (r[:, 1] < 0.035) & (r[:, 1] > -0.06) & (r[:, 2] < 0.03)
    crown = hv[~ear] - HC; cn = crown / np.linalg.norm(crown, axis=1)[:, None]; cr = np.linalg.norm(crown, axis=1)
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=48, v_segments=28, radius=1.0)
    V = np.array([list(v.co) for v in bm.verts]); D = V / np.linalg.norm(V, axis=1)[:, None]
    dots = D @ cn.T; rad = np.where(dots > math.cos(math.radians(9)), cr[None, :], 0).max(1)
    rad[rad < 0.05] = 0.09
    F = [[v.index for v in f.verts] for f in bm.faces]
    rad = smooth_field(V, F, rad, 10) + 0.024 + 0.006 * np.clip(D[:, 1], 0, 1)
    for v, rr in zip(bm.verts, rad): v.co = v.co.normalized() * float(rr)
    # linha da borda: alta à frente (por cima das sobrancelhas), corte alto por cima das orelhas, desce atrás
    A = [0.0, 0.6, 1.0, 1.25, 1.55, 1.9, 2.3, math.pi]; Yb = [0.05, 0.046, 0.034, 0.04, 0.045, 0.012, -0.02, -0.03]
    kill = [f for f in bm.faces if (lambda c: c.y < np.interp(abs(math.atan2(c.x, c.z)), A, Yb))(f.calc_center_median())]
    bmesh.ops.delete(bm, geom=kill, context='FACES'); bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bv = [v for v in bm.verts if v.is_boundary]
    for _ in range(6):
        nw = {}
        for v in bv:
            nb = [e.other_vert(v) for e in v.link_edges if e.is_boundary]
            if len(nb) == 2: nw[v] = v.co * 0.4 + (nb[0].co + nb[1].co) * 0.3
        for v, c in nw.items(): v.co = c
    bmesh.ops.translate(bm, vec=tuple(HC), verts=bm.verts)
    bm.normal_update()
    r_ = bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.007)
    shell = L._reg(bm, OLV, 'v', 0.0015, 2, 40)
    # orla de borracha: tira fina ao longo da borda
    edge = [(math.atan2(0, 1))]
    # trilhos laterais (ARC), placa da frente para a visão noturna, velcro atrás, almofadas e francalete
    for sx in (-1, 1):
        th = [math.radians(a) for a in range(60, 128, 6)]
        pts = []
        for t in th:
            d = np.array([sx * math.sin(t), 0.0, math.cos(t)]); dd = D @ (d / np.linalg.norm(d)); i = int(np.argmax(dd)); pts.append(HC + d * (rad[i] + 0.004) + np.array([0, 0.052 - 0.01 * abs(t - 1.6), 0]))
        for a, b in zip(pts, pts[1:]):
            m = (a + b) / 2; l = np.linalg.norm(b - a); ang = math.atan2(b[0] - a[0], b[2] - a[2])
            box(0.006, 0.018, l + 0.002, m[0], m[1], m[2], BLK, 'v', 0.001, ry=ang)
    top = HC + np.array([0, 0.048, 0]); fz = HC[2] + 0.115
    box(0.05, 0.034, 0.012, 0, HC[1] + 0.058, fz, BLK, 'm', 0.002, rx=-0.35)  # placa da frente (shroud)
    box(0.056, 0.04, 0.006, 0, HC[1] + 0.07, HC[2] - 0.122, 0x4a5236, 'v', 0.002, rx=0.5)  # velcro atrás
    for sx in (-1, 1):
        sweep([(-0.006, -0.0012), (0.006, -0.0012), (0.006, 0.0012), (-0.006, 0.0012)], [(HC[2] + 0.005, HC[1] + 0.012), (HC[2] + 0.03, HC[1] - 0.05), (HC[2] + 0.06, HC[1] - 0.11)], STRAP, 'v') if False else None
    # francalete: duas tiras de cada lado a descer para o queixo
    for sx in (-1, 1):
        for zo in (-0.02, 0.03):
            p0 = HC + np.array([sx * 0.088, 0.03, zo]); p1 = HC + np.array([sx * 0.06, -0.075, 0.035]); p2 = HC + np.array([0, -0.118, 0.07])
            for a, b in ((p0, p1), (p1, p2)):
                m = (a + b) / 2; l = np.linalg.norm(b - a); ry = math.atan2(b[0] - a[0], b[2] - a[2]); rx = -math.atan2(b[1] - a[1], math.hypot(b[0] - a[0], b[2] - a[2]))
                box(0.012, 0.002, l, m[0], m[1], m[2], STRAP, 'v', 0, rx=rx, ry=ry) if False else None
    for sx in (-1, 1):
        a = HC + np.array([sx * 0.084, 0.035, 0.01]); b = HC + np.array([sx * 0.07, -0.07, 0.04]); c = HC + np.array([0, -0.122, 0.072])
        for p, q in ((a, b), (b, c)):
            d = q - p; l = float(np.linalg.norm(d)); m = (p + q) / 2
            o = box(0.012, 0.0022, l, 0, 0, 0, STRAP, 'v', 0)
            M = Matrix.Translation(tuple(m)) @ Vector((0, 0, 1)).rotation_difference(Vector(tuple(d / l))).to_matrix().to_4x4()
            for v in o.ob.data.vertices: v.co = M @ v.co
    all_shift(HEADP)
    return {}

def torso_profile():
    tv = PB[(WB[:, 0] > 0.45) & (np.abs(PB[:, 0]) < 0.22) & (TAGB == 0)]
    cache = {}
    def ring(yk):  # perfil de uma altura: raio em 72 ângulos, sem picos (ombros e braços não contam)
        if yk in cache: return cache[yk]
        y = yk / 1000; sel = tv[np.abs(tv[:, 1] - y) < 0.02]
        if y > 1.32: sel = sel[np.abs(sel[:, 0]) < 0.17 - (y - 1.32) * 0.6]
        if len(sel) < 10: cache[yk] = (np.full(72, 0.12), 0.0); return cache[yk]
        zc = (sel[:, 2].max() + sel[:, 2].min()) / 2; a = np.arctan2(sel[:, 0], sel[:, 2] - zc); r = np.hypot(sel[:, 0], sel[:, 2] - zc)
        ths = np.linspace(-np.pi, np.pi, 73)[:-1]; out = np.zeros(72)
        for i, t in enumerate(ths):
            da = np.abs((a - t + np.pi) % (2 * np.pi) - np.pi); m = da < 0.1
            out[i] = r[m].max() if m.any() else np.nan
        ok = ~np.isnan(out); out[~ok] = np.interp(np.where(~ok)[0], np.where(ok)[0], out[ok], period=72)
        med = np.array([np.median(np.take(out, range(i - 3, i + 4), mode='wrap')) for i in range(72)]); out = np.minimum(out, med + 0.006)
        out = np.array([np.take(out, range(i - 1, i + 2), mode='wrap').mean() for i in range(72)])
        cache[yk] = (out, float(zc)); return cache[yk]
    def at(y, th):
        out, zc = ring(int(round(y * 1000 / 5)) * 5); i = (th + np.pi) / (2 * np.pi) * 72
        return float(np.interp(i, np.arange(73), np.append(out, out[0]))), zc
    return at
TP = None
def vest_surface(y0, y1, cover, off, th_n=48, dy=0.03, col=TAN, thick=0.018, bev=0.003):
    ys = np.arange(y0, y1 + 1e-6, dy); ths = np.linspace(-math.pi, math.pi, th_n + 1)[:-1]
    bm = bmesh.new(); grid = {}
    for i, y in enumerate(ys):
        for j, t in enumerate(ths):
            if not cover(y, t): continue
            r, zc = TP(y, t); r += off(y, t)
            grid[(i, j)] = bm.verts.new((r * math.sin(t), y, zc + r * math.cos(t)))
    for (i, j), v in list(grid.items()):
        a, b, c = grid.get((i, (j + 1) % th_n)), grid.get((i + 1, (j + 1) % th_n)), grid.get((i + 1, j))
        if a and b and c: bm.faces.new((v, c, b, a))
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=thick)
    return L._reg(bm, col, 'v', bev, 1, 40)
def on_surface(y, t, out=0.0):
    r, zc = TP(y, t); r += out; return np.array([r * math.sin(t), y, zc + r * math.cos(t)])
def place_box(w, h, d, y, t, out, col, mat='v', bev=0.003):  # caixa encostada à superfície (de frente para fora)
    p = on_surface(y, t, out + d / 2); b = box(w, h, d, 0, 0, 0, col, mat, bev)
    M = Matrix.Translation(tuple(p)) @ Matrix.Rotation(t, 4, 'Y')
    for v in b.ob.data.vertices: v.co = M @ v.co
    return b
def colete():
    global TP; TP = torso_profile()
    FRONT = lambda t: abs(t) < 1.0; BACK = lambda t: abs(abs(t) - math.pi) < 1.0
    def cover(y, t):
        top = 1.415 - 0.03 * (abs(math.sin(t)) > 0.5)
        return (1.09 <= y <= 1.405 and (FRONT(t) or BACK(t))) or (1.09 <= y <= 1.23)
    vest_surface(1.09, 1.41, cover, lambda y, t: 0.03 + (0.004 if FRONT(t) or BACK(t) else 0), col=TAN, thick=0.02)
    # tiras MOLLE na frente e nos lados
    for k in range(4):
        y = 1.13 + k * 0.028
        vest_surface(y, y + 0.012, lambda yy, t: abs(t) < 1.5 or abs(abs(t) - math.pi) < 0.9, lambda yy, t: 0.053, dy=0.012, col=0x6f6244, thick=0.003, bev=0)
    # alças dos ombros
    for sx in (-1, 1):
        x = sx * 0.088; zf = on_surface(1.40, sx * 0.55, 0.05)[2]; zb = on_surface(1.40, sx * (math.pi - 0.55), 0.05)[2]
        path = [(zf, 1.395), (zf - 0.01, 1.43), (zf * 0.5 + zb * 0.5 + 0.02, 1.488), (zb + 0.01, 1.43), (zb, 1.395)]
        path = bez(path[0], path[1], path[2], 5) + bez(path[2], path[3], path[4], 5)[1:]
        sec = [(x - 0.03, -0.006), (x + 0.03, -0.006), (x + 0.03, 0.006), (x - 0.03, 0.006)]
        sweep(sec, path, TAN, 'v', bev=0.002)
    # carregadores à frente (3), bolsa de administração no peito, pega de arrasto atrás
    for i, t in enumerate((-0.42, 0.0, 0.42)):
        place_box(0.07, 0.11, 0.032, 1.18, t, 0.05, 0x7e6f4c, 'v', 0.004); place_box(0.074, 0.028, 0.036, 1.245, t, 0.05, 0x6f6244, 'v', 0.003)
    place_box(0.16, 0.08, 0.018, 1.33, 0.0, 0.055, 0x7e6f4c, 'v', 0.004)
    place_box(0.14, 0.12, 0.02, 1.25, math.pi, 0.055, 0x7e6f4c, 'v', 0.004)
    place_box(0.07, 0.02, 0.03, 1.40, math.pi, 0.06, BLK, 'v', 0.004)
    all_shift(TORSOP)
    return {}

def mochila(leather=False):
    global TP; TP = torso_profile()
    C = 0x6a4a2e if leather else 0x6f5f3e; C2 = 0x5a3e26 if leather else 0x5c4f33
    zb = on_surface(1.25, math.pi, 0.0)[2] - 0.035  # face da frente da mochila (encostada às costas)
    if leather:
        prof([(zb, 1.05), (zb, 1.40), (zb - 0.02, 1.43), (zb - 0.14, 1.42), (zb - 0.17, 1.36), (zb - 0.18, 1.08), (zb - 0.16, 1.04)], 0.32, C, 'v', bev=0.02, seg=3)
        prof([(zb - 0.005, 1.43), (zb - 0.15, 1.425), (zb - 0.185, 1.38), (zb - 0.19, 1.24), (zb - 0.175, 1.24), (zb - 0.168, 1.36), (zb - 0.14, 1.405), (zb - 0.005, 1.41)], 0.326, C2, 'v', bev=0.006)  # aba
        for sx in (-1, 1): box(0.022, 0.12, 0.006, sx * 0.08, 1.22, zb - 0.185, 0x3a2a1a, 'v', 0.002); box(0.026, 0.02, 0.009, sx * 0.08, 1.20, zb - 0.188, 0xb8a060, 'm', 0.002)  # correias e fivelas
    else:
        prof([(zb, 1.00), (zb, 1.46), (zb - 0.03, 1.50), (zb - 0.19, 1.49), (zb - 0.23, 1.42), (zb - 0.24, 1.06), (zb - 0.21, 1.00)], 0.34, C, 'v', bev=0.03, seg=3)  # corpo
        prof([(zb - 0.01, 1.505), (zb - 0.2, 1.495), (zb - 0.235, 1.43), (zb - 0.235, 1.38), (zb - 0.215, 1.39), (zb - 0.19, 1.455), (zb - 0.01, 1.47)], 0.33, C2, 'v', bev=0.012)  # tampa
        prof([(zb - 0.24, 1.08), (zb - 0.24, 1.30), (zb - 0.30, 1.28), (zb - 0.31, 1.12), (zb - 0.29, 1.08)], 0.24, C2, 'v', bev=0.02, seg=3)  # bolso da frente
        for sx in (-1, 1):
            cyl(0.045, 1.05, 1.32, C2, 'v', x=sx * 0.19, y=0, seg=14, bev=0.01, axis='y') if False else cyly(0.045, 1.05, 1.32, sx * 0.192, zb - 0.12, C2, 'v', 14, 0.01)  # bolsos dos lados
            for y in (1.18, 1.36): box(0.02, 0.02, 0.24, sx * 0.172, y, zb - 0.12, 0x2a2b26, 'v', 0.002)  # correias de compressão
        cylx(0.055, -0.21, 0.21, 1.545, zb - 0.11, 0x8a4b36, 'v', 20, 0.01)  # colchão enrolado
        for sx in (-1, 1): box(0.02, 0.115, 0.115, sx * 0.13, 1.545, zb - 0.11, 0x2a2b26, 'v', 0.003)
    # alças: das costas, por cima do ombro, até à frente do peito e por baixo do braço
    for sx in (-1, 1):
        x = sx * 0.085; zf = on_surface(1.36, sx * 0.62, 0.035)[2]
        path = bez((zb + 0.01, 1.40), (zb + 0.02, 1.50), ((zb + zf) / 2, 1.495), 5) + bez(((zb + zf) / 2, 1.495), (zf + 0.02, 1.49), (zf, 1.38), 5)[1:] + bez((zf, 1.38), (zf - 0.01, 1.25), (zf - 0.08, 1.18), 4)[1:]
        sweep([(x - 0.028, -0.007), (x + 0.028, -0.007), (x + 0.028, 0.007), (x - 0.028, 0.007)], path, 0x2a2b26 if not leather else 0x3a2a1a, 'v', bev=0.002)
    if not leather: place_box(0.12, 0.016, 0.01, 1.33, 0.0, 0.045, 0x2a2b26, 'v', 0.002)  # tira do peito
    all_shift(TORSOP)
    return {}
def mochilaC(): return mochila(True)

def nvg():  # visão noturna binocular rebatida à frente dos olhos, presa por braço à frente (com fita à volta da cabeça)
    EY = np.array([0.0, 1.626 - 0.0, 0.103])
    for sx in (-1, 1):
        cyl(0.0165, EY[2] + 0.03, EY[2] + 0.10, BLK, 'm', x=sx * 0.032, y=EY[1], seg=18, bev=0.002)
        cyl(0.018, EY[2] + 0.086, EY[2] + 0.104, 0x15161a, 'm', x=sx * 0.032, y=EY[1], seg=18, bev=0.0015)
        cyl(0.0135, EY[2] + 0.1045, EY[2] + 0.106, 0x1f4a2a, 'm', x=sx * 0.032, y=EY[1], seg=18)
        cyl(0.0175, EY[2] + 0.024, EY[2] + 0.034, 0x111214, 'v', x=sx * 0.032, y=EY[1], seg=18, bev=0.001)  # ocular de borracha
    box(0.05, 0.028, 0.05, 0, EY[1] + 0.012, EY[2] + 0.06, BLK, 'm', 0.004)  # ponte
    box(0.024, 0.07, 0.016, 0, EY[1] + 0.05, EY[2] + 0.05, BLK, 'm', 0.003, rx=0.25)  # braço de montagem
    # fita à volta da cabeça (fica escondida dentro do capacete)
    sweep([(0, -0.007), (0, 0.007)][:0] + [(-0.0015, -0.012), (0.0015, -0.012), (0.0015, 0.012), (-0.0015, 0.012)], [(0, 0)], STRAP, 'v') if False else None
    ring = [(HC[0] + 0.104 * math.sin(a), HC[2] + 0.118 * math.cos(a)) for a in np.linspace(0, 2 * math.pi, 33)]
    bm = bmesh.new(); top = [bm.verts.new((x, HC[1] + 0.052, z)) for x, z in ring]; bot = [bm.verts.new((x, HC[1] + 0.03, z)) for x, z in ring]
    for i in range(32): bm.faces.new((top[i], top[i + 1], bot[i + 1], bot[i]))
    L._reg(bm, STRAP, 'v', 0)
    all_shift(HEADP)
    return {}

def ghillie():  # fato ghillie: tufos de tiras de folhagem presos a cada parte do corpo (coordenadas de cada parte)
    import random
    rnd = random.Random(7); PAL = [0x3e4a28, 0x4f5a30, 0x5f5a36, 0x4a3e26, 0x6a6a3a, 0x36401f]
    piv = {'torso': TORSOP, 'head': HEADP, 'armL': np.array([-SHX, SHY, 0]), 'armR': np.array([SHX, SHY, 0]), 'foreL': np.array([-SHX, SHY - UPPER, 0]), 'foreR': np.array([SHX, SHY - UPPER, 0]),
           'legL': np.array([-0.11, HIP, 0]), 'legR': np.array([0.11, HIP, 0]), 'shinL': np.array([-0.11, HIP - THIGH, 0]), 'shinR': np.array([0.11, HIP - THIGH, 0])}
    N = {'torso': 110, 'head': 30, 'armL': 22, 'armR': 22, 'foreL': 16, 'foreR': 16, 'legL': 28, 'legR': 28, 'shinL': 20, 'shinR': 20}
    parts = {}
    for k, s in enumerate(SEG):
        sel = np.where((WB.argmax(1) == k) & (TAGB == 0))[0]
        if s == 'head': sel = sel[(PB[sel, 2] < HC[2] + 0.03) | (PB[sel, 1] > HC[1] + 0.03)]  # sem tapar a cara
        if s.startswith('shin'): sel = sel[PB[sel, 1] > 0.12]
        pts = PB[rnd.sample(list(sel), min(N[s], len(sel)))]
        cen = PB[sel].mean(0)
        bm = bmesh.new()
        for p in pts:
            d = p - cen; d[1] *= 0.3; d /= (np.linalg.norm(d) + 1e-9); base = p + d * 0.022
            for j in range(rnd.randint(3, 5)):
                ln = rnd.uniform(0.07, 0.14); w = rnd.uniform(0.012, 0.022); a = rnd.uniform(0, 2 * math.pi)
                side = np.array([math.cos(a), 0, math.sin(a)]); col = PAL[rnd.randrange(len(PAL))]
                q0 = base + side * rnd.uniform(-0.01, 0.01); dirv = d * rnd.uniform(0.2, 0.5) + np.array([0, -1, 0]) + side * rnd.uniform(-0.3, 0.3); dirv /= np.linalg.norm(dirv)
                q1 = q0 + dirv * ln * 0.5; q2 = q0 + dirv * ln + side * rnd.uniform(-0.02, 0.02)
                sv = np.cross(dirv, d); sv /= (np.linalg.norm(sv) + 1e-9)
                vs = [bm.verts.new(tuple(q + sv * w * f)) for q, f in ((q0, 0.5), (q0, -0.5), (q1, -0.45), (q1, 0.45), (q2, 0.0))]
                f1 = bm.faces.new((vs[0], vs[1], vs[2], vs[3])); f2 = bm.faces.new((vs[3], vs[2], vs[4]))
                ws = [bm.verts.new(tuple(v.co)) for v in vs]; f3 = bm.faces.new((ws[3], ws[2], ws[1], ws[0])); f4 = bm.faces.new((ws[4], ws[2], ws[3]))  # dos dois lados
                for f in (f1, f2, f3, f4): f.material_index = PAL.index(col)
        # uma cor por tufo: separa por material
        for ci, col in enumerate(PAL):
            b2 = bm.copy(); bmesh.ops.delete(b2, geom=[f for f in b2.faces if f.material_index != ci], context='FACES'); bmesh.ops.delete(b2, geom=[v for v in b2.verts if not v.link_faces], context='VERTS')
            for v in b2.verts: v.co = Vector(tuple(np.array(v.co) - piv[s]))
            P_ = L._reg(b2, col, 'vf', 0); P_.ob.name = 'gh_' + s
        bm.free()
    return {}

GEARF = {'capacete': capacete, 'colete': colete, 'mochila': mochila, 'mochilaC': mochilaC, 'nvg': nvg, 'ghillie': ghillie}
if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('-')]; prev = '--preview' in sys.argv
    OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'geardata.js')
    data = json.load(open('/tmp/gp/geardata.json')) if os.path.exists('/tmp/gp/geardata.json') else {}
    L.MIRROR = False
    for n in (args or list(GEARF)):
        reset(); L.MIRROR = False; anc = GEARF[n]()
        if n == 'ghillie':  # uma entrada por parte do corpo
            allp = list(L.PARTS)
            for s in SEG:
                L.PARTS[:] = [p for p in allp if p.ob.name.startswith('gh_' + s)]
                if L.PARTS: out, nt = export('ghillie_' + s, {}, scale=1.0); data['ghillie_' + s] = out
            L.PARTS[:] = allp
        else:
            out, nt = export(n, anc, scale=1.0); data[n] = out
        if prev: preview(f'/tmp/gp/gear-{n}.png', views=('tres',))
    json.dump(data, open('/tmp/gp/geardata.json', 'w'))
    open(OUT, 'w').write('// gerado por blender/gear.py (equipamento ajustado ao corpo novo). Não editar à mão.\nexport const GEARDATA = ' + json.dumps(data, separators=(',', ':')) + ';\n')
    print('escrito', OUT, os.path.getsize(OUT) // 1024, 'KB')
