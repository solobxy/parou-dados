# Corpo humano realista para o jogo (Blender, sem ecrã), a partir da malha base do MakeHuman (CC0, makehumancommunity/mpfb2).
#  1. aplica as formas do MakeHuman (zombie: magro e sem músculo; jogador: médio)
#  2. agrupa os pesos dos 163 ossos do MakeHuman nas 10 partes que o jogo já anima (tronco, cabeça, braços, antebraços, coxas, canelas)
#  3. leva a malha para a pose de descanso do jogo (braços caídos) e para as medidas do esqueleto do jogo
#  4. cópia densa com relevo e cor (roupa, pele, sangue) → mapas de cor, normais e sombra de canto numa malha leve
#  5. exporta: posição, normal, UV, partes e pesos (4 por vértice) em src/<nome>.js; texturas em assets/tex/<nome>.jpg e <nome>_n.jpg
# Correr: /tmp/bl/bin/python blender/human.py zombie [--preview]
import bpy, bmesh, math, sys, json, gzip, base64, os
import numpy as np

KIND = 'player' if 'player' in sys.argv else 'zombie'
PREV = '--preview' in sys.argv
FP = 'fparms' in sys.argv  # só os braços com as mãos fechadas (para a 1.ª pessoa): escreve src/fparms.js e sai
MH = os.environ.get('MH', '/tmp/mpfb/src/mpfb/data/')
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, '..')
NAME = 'zbody' if KIND == 'zombie' else 'pbody'
TEX, TARGET_TRIS = (1024, 5200) if KIND == 'zombie' else (1024, 7000)

# ---------- 1. malha base, UVs, grupos ----------
V, VT, F, FT, FG = [], [], [], [], []; g = None
for line in open(MH + '3dobjs/base.obj'):
    if line.startswith('v '): V.append([float(x) for x in line.split()[1:4]])
    elif line.startswith('vt '): VT.append([float(x) for x in line.split()[1:3]])
    elif line.startswith('g '): g = line.split()[1]
    elif line.startswith('f '):
        t = [p.split('/') for p in line.split()[1:]]; F.append([int(p[0]) - 1 for p in t]); FT.append([int(p[1]) - 1 for p in t]); FG.append(g)
V = np.array(V); VT = np.array(VT)
def target(name, w=1.0):
    for l in gzip.open(MH + 'targets/' + name + '.target.gz', 'rt'):
        p = l.split()
        if len(p) == 4: V[int(p[0])] += w * np.array([float(p[1]), float(p[2]), float(p[3])])
if KIND == 'zombie':
    target('macrodetails/universal-male-young-minmuscle-minweight', 0.75); target('macrodetails/universal-male-young-averagemuscle-averageweight', 0.25); target('macrodetails/caucasian-male-old', 0.6); target('macrodetails/caucasian-male-young', 0.4)
else:
    target('macrodetails/universal-male-young-averagemuscle-averageweight'); target('macrodetails/caucasian-male-young')
target('torso/measure-shoulder-dist-incr', 0.8)  # ombros um pouco mais largos (o esqueleto do jogo tem os ombros afastados)
V = V * 0.1; V[:, 1] += 0.8183  # decímetros → metros, chão em y = 0
grp = {}
for f, gn in zip(F, FG): grp.setdefault(gn, set()).update(f)
J = {k: V[sorted(v)].mean(0) for k, v in grp.items() if k.startswith('joint')}
KEEP = ['body', 'helper-l-eye', 'helper-r-eye', 'helper-upper-teeth', 'helper-lower-teeth']
faces = [i for i, gn in enumerate(FG) if gn in KEEP]
used = sorted({v for i in faces for v in F[i]}); remap = {v: i for i, v in enumerate(used)}
P0 = V[used].copy()
TAG = np.zeros(len(used), int)  # 0 corpo, 1 olho, 2 dentes
for i in faces:
    if FG[i].startswith('helper-l-eye') or FG[i].startswith('helper-r-eye'):
        for v in F[i]: TAG[remap[v]] = 1
    elif 'teeth' in FG[i]:
        for v in F[i]: TAG[remap[v]] = 2

# ---------- 2. pesos por parte ----------
SEG = ['torso', 'head', 'armL', 'armR', 'foreL', 'foreR', 'legL', 'legR', 'shinL', 'shinR']
def seg_of(b):
    side = None
    if b.endswith('.L'): side = 'R'  # .L do MakeHuman fica em +x: no jogo é o lado R (o jogo põe armL em −x)
    elif b.endswith('.R'): side = 'L'
    n = b.split('.')[0]
    if n.startswith('upperarm'): return 'arm' + side
    if n.startswith(('lowerarm', 'wrist', 'metacarpal', 'finger')): return 'fore' + side
    if n.startswith('upperleg'): return 'leg' + side
    if n.startswith(('lowerleg', 'foot', 'toe')): return 'shin' + side
    if n in ('neck02', 'neck03', 'head', 'jaw') or n.startswith(('eye', 'levator', 'oculi', 'orbicularis', 'oris', 'risorius', 'special', 'temporalis', 'tongue')): return 'head'
    return 'torso'  # raiz, coluna, bacia, clavícula, ombro, peito, pescoço de baixo
Wb = json.load(open(MH + 'rigs/standard/weights.default.json'))['weights']
W = np.zeros((len(used), len(SEG)))
for b, lst in Wb.items():
    s = SEG.index(seg_of(b))
    for vi, w in lst:
        if vi in remap: W[remap[vi], s] += w
for i in np.where(TAG > 0)[0]: W[i] = 0; W[i, 1] = 1  # olhos e dentes só com a cabeça
W[W.sum(1) == 0, 0] = 1
W /= W.sum(1)[:, None]

# ---------- 2b. (jogador) dedos meio fechados, como numa mão relaxada (a malha base tem a mão aberta e esticada) ----------
def rotm(ax, ang):
    a = ax / np.linalg.norm(ax); K = np.array([[0, -a[2], a[1]], [a[2], 0, -a[0]], [-a[1], a[0], 0]]); return np.eye(3) + math.sin(ang) * K + (1 - math.cos(ang)) * K @ K
if KIND != 'zombie':
    BW = {}
    for b_, lst in Wb.items():
        if b_.startswith(('finger', 'metacarpal1')):
            arr = np.zeros(len(used))
            for vi, w in lst:
                if vi in remap: arr[remap[vi]] += w
            BW[b_] = arr
    CURL = float(os.environ.get('CURL', '1'))
    # poses das mãos da 1.ª pessoa (ângulos em radianos por articulação: base, meio, ponta; polegar: oposição, base, meio, ponta)
    FPP = {'gatilho': {2: (0.3, 0.55, 0.3), 3: (1.0, 1.2, 0.45), 4: (1.05, 1.2, 0.45), 5: (1.1, 1.15, 0.45), 't': (0.55, 0.5, 0.6, 0.5), 'ab': -0.08},
           'pega': {2: (0.95, 1.15, 0.45), 3: (1.0, 1.2, 0.45), 4: (1.05, 1.2, 0.45), 5: (1.1, 1.15, 0.45), 't': (0.55, 0.5, 0.6, 0.5)},
           'larga': {2: (0.7, 0.85, 0.35), 3: (0.75, 0.9, 0.4), 4: (0.8, 0.9, 0.4), 5: (0.85, 0.85, 0.35), 't': (0.45, 0.35, 0.4, 0.3)},
           'punho': {2: (1.45, 1.75, 0.9), 3: (1.5, 1.8, 0.9), 4: (1.5, 1.8, 0.9), 5: (1.55, 1.75, 0.85), 't': (0.6, 0.75, 0.9, 0.7)},
           'aberta': {2: (0.25, 0.3, 0.15), 3: (0.28, 0.32, 0.15), 4: (0.3, 0.34, 0.16), 5: (0.32, 0.35, 0.16), 't': (0.35, 0.1, 0.1, 0.1)}}
    POSE = FPP.get(os.environ.get('FPPOSE', 'pega')) if FP else None
    if os.environ.get('FPDIAG'):
        for sd in ('l', 'r'):
            g = lambda f, k: J[f'joint-{sd}-finger-{f}-{k}']
            lat = g(2, 1) - g(5, 1); mid = g(3, 2) - g(3, 1); n = np.cross(lat, mid); n /= np.linalg.norm(n)
            ch = g(3, 4) - g(3, 1); bow = (g(3, 2) + g(3, 3)) / 2 - (g(3, 1) + g(3, 4)) / 2; bow -= ch * bow.dot(ch) / ch.dot(ch)
            print('DIAG', sd, 'hand', np.round(J[f'joint-{sd}-hand'], 3), 'lat', np.round(lat, 3), 'mid', np.round(mid / np.linalg.norm(mid), 3), 'n', np.round(n, 3), 'bow', np.round(bow * 1000, 2), 'thumb', [np.round(g(1, k), 3) for k in (1, 2, 3, 4)], 'idx1', np.round(g(2, 1), 3))
        sys.exit(0)
    def rot_w(P, c, k, ang, w):
        # roda cada vértice à volta do eixo k (por c) num ângulo proporcional ao seu peso: as zonas de transição torcem em vez de
        # encolherem (misturar posições roda-e-não-roda achatava o polegar e os nós dos dedos)
        w = np.minimum(w, 1.0); m = w > 1e-4
        if not np.any(m): return P
        k = k / np.linalg.norm(k); v = P[m] - c; th = (w[m] * ang)[:, None]; cs, sn = np.cos(th), np.sin(th)
        P = P.copy(); P[m] = c + v * cs + np.cross(k, v) * sn + k * (v @ k)[:, None] * (1 - cs); return P
    def pose_hands(P0, POSE):
        P0 = P0.copy()
        for sd, sfx in (('l', '.L'), ('r', '.R')):
            lat = J[f'joint-{sd}-finger-2-1'] - J[f'joint-{sd}-finger-5-1']
            mid = J[f'joint-{sd}-finger-3-2'] - J[f'joint-{sd}-finger-3-1']; mid /= np.linalg.norm(mid)
            pn = np.cross(lat, mid); pn /= np.linalg.norm(pn)  # normal das costas da mão (o sentido acerta-se a seguir: a palma é -pn)
            tipm = rotm(np.cross(lat, mid), 0.5) @ (J[f'joint-{sd}-finger-3-4'] - J[f'joint-{sd}-finger-3-1'])
            if pn[1] < 0: pn = -pn  # normal da palma: na malha base (pose em A) a palma está virada para baixo, nas duas mãos
            fingers = ((2, (0.45, 0.7, 0.4)), (3, (0.5, 0.75, 0.45)), (4, (0.55, 0.8, 0.45)), (5, (0.65, 0.85, 0.5)), (1, (0.12, 0.2, 0.25)))
            if POSE: fingers = tuple((f, POSE[f]) for f in (2, 3, 4, 5)) + ((1, POSE['t']),)
            for f, angs in fingers:
                js = [J[f'joint-{sd}-finger-{f}-{k}'].copy() for k in (1, 2, 3, 4)]
                d = js[1] - js[0]
                if f != 1:
                    # dobrar = rodar à volta do eixo que atravessa os nós dos dedos (perpendicular ao dedo, no plano da mão),
                    # no sentido que leva a ponta para a palma. Antes rodava à volta da normal da mão: os dedos iam para o lado.
                    # pn aponta para as costas da mão (o lado convexo dos dedos em repouso), por isso a palma é -pn
                    ax = np.cross(d, pn); ax /= np.linalg.norm(ax)
                    t0 = rotm(ax, 0.5) @ (js[3] - js[0])
                    if np.dot(t0, pn) > np.dot(js[3] - js[0], pn): ax = -ax
                    axes = [ax, ax, ax]; ang3 = angs
                    if POSE and POSE.get('ab') and f == 2:  # indicador um pouco afastado (ao longo do guarda-mato)
                        R = rotm(pn, POSE['ab'] * (1 if sd == 'l' else -1)); w = sum(BW.get(f'finger{f}-{k}{sfx}', 0) for k in range(1, 4)); c = js[0]
                        P0 = rot_w(P0, c, pn, POSE['ab'] * (1 if sd == 'l' else -1), w)
                        for k in range(1, 4): js[k] = R @ (js[k] - c) + c
                else:
                    # polegar: oposição (roda para a frente da palma à volta do eixo da mão) e depois dobra nas três articulações
                    td = js[1] - js[0]; td /= np.linalg.norm(td)
                    fx = np.cross(pn, td); fx /= np.linalg.norm(fx)
                    t0 = rotm(fx, 0.4) @ (js[3] - js[0])
                    if np.dot(t0, pn) > np.dot(js[3] - js[0], pn): fx = -fx  # a dobra leva a ponta para o lado da palma (-pn)
                    op = mid.copy(); t1 = rotm(op, 0.4) @ (js[3] - js[0])
                    if np.dot(t1, pn) > np.dot(js[3] - js[0], pn): op = -op  # oposição: o polegar vem para a frente da palma
                    if POSE:
                        w = sum(BW.get(f'finger{f}-{k}{sfx}', 0) for k in range(1, 4)) + 0.5 * BW.get(f'metacarpal1{sfx}', 0)
                        a0 = angs[0] * float(os.environ.get('FPTOP', '1')); R = rotm(op, a0); c = js[0]; P0 = rot_w(P0, c, op, a0, w)
                        for k in range(1, 4): js[k] = R @ (js[k] - c) + c
                        fx = R @ fx; angs = angs[1:]
                    axes = [fx, fx, fx]; ang3 = angs
                for j in range(3):
                    w = sum(BW.get(f'finger{f}-{k}{sfx}', 0) for k in range(j + 1, 4))
                    if not np.any(w): continue
                    R = rotm(axes[j], ang3[j] * (1 if POSE else CURL)); c = js[j]
                    P0 = rot_w(P0, c, axes[j], ang3[j] * (1 if POSE else CURL), w)
                    for k in range(j + 1, 4): js[k] = R @ (js[k] - c) + c
        return P0
    P0_open = P0.copy()
    P0 = pose_hands(P0, POSE)

# ---------- 3. pose e medidas do jogo ----------
HIP, SHY, SHX, THIGH, UPPER, NECK = 0.92, 1.42, 0.27, 0.44, 0.30, 0.74
def frame(o, child, fwd=np.array([0, 0, 1.0])):
    a = child - o; a /= np.linalg.norm(a); Y = -a; Z = fwd - fwd.dot(Y) * Y; Z /= np.linalg.norm(Z); X = np.cross(Y, Z); return np.stack([X, Y, Z], 1), o
B = {}
B['torso'] = (np.eye(3), np.array([0, J['joint-l-upper-leg'][1], J['joint-pelvis'][2]]))
B['head'] = (np.eye(3), J['joint-head'])
for s, mh in (('R', 'l'), ('L', 'r')):
    B['arm' + s] = frame(J[f'joint-{mh}-shoulder'], J[f'joint-{mh}-elbow'])
    B['fore' + s] = frame(J[f'joint-{mh}-elbow'], J[f'joint-{mh}-hand'])
    B['leg' + s] = frame(J[f'joint-{mh}-upper-leg'], J[f'joint-{mh}-knee'])
    B['shin' + s] = frame(J[f'joint-{mh}-knee'], J[f'joint-{mh}-ankle'])
G = {'torso': np.array([0, HIP, 0]), 'head': np.array([0, HIP + NECK, 0.02])}
for s, sx in (('L', -1), ('R', 1)):
    G['arm' + s] = np.array([sx * SHX, SHY, 0.02]); G['fore' + s] = G['arm' + s] + [0, -UPPER, 0]
    G['leg' + s] = np.array([sx * 0.11, HIP, 0]); G['shin' + s] = G['leg' + s] + [0, -THIGH, 0]
# onde cada parte fica na malha: igual ao esqueleto do jogo, menos duas diferenças que esticariam o corpo —
# os ombros do jogo estão mais afastados (0,27 m) do que num corpo real, e o pescoço do jogo é mais comprido.
# A malha guarda os ombros e o pescoço reais; o jogo roda cada parte à volta do seu ponto (ver BIND), o que só se nota pouco ao abrir os braços.
GM = {k: v.copy() for k, v in G.items()}
for s, mh in (('R', 'l'), ('L', 'r')):
    dx = J[f'joint-{mh}-shoulder'][0] - G['arm' + s][0]; GM['arm' + s][0] += dx; GM['fore' + s][0] += dx
dneck = (J['joint-head'][1] - J['joint-l-upper-leg'][1]) - NECK; GM['head'][1] += dneck
print('ombro real', J['joint-l-shoulder'].round(3), 'pescoço', round(dneck, 3))
P = np.zeros_like(P0)
for k, s in enumerate(SEG):
    R, o = B[s]; P += W[:, k:k + 1] * (GM[s] + (P0 - o) @ R)  # (P0 − o) @ R = Rᵀ(P0 − o): coordenadas locais da parte
if KIND != 'zombie':  # ombro: ao baixar os braços da pose em A fica uma aresta; alisa-se só a zona de transição tronco/braço
    nbr = [set() for _ in range(len(P))]
    for f in [[remap[v] for v in F[i]] for i in faces]:
        for a_ in f:
            nbr[a_].update(f)
    nbr = [np.array(sorted(n_ - {i})) for i, n_ in enumerate(nbr)]
    wa = W[:, SEG.index('armL')] + W[:, SEG.index('armR')]
    msk = np.clip(4 * wa * (1 - wa), 0, 1) * (lambda t: t * t * (3 - 2 * t))(np.clip((P[:, 1] - 1.25) / 0.11, 0, 1)) * (TAG == 0)
    for _ in range(12):
        mean = np.array([P[n_].mean(0) if len(n_) else P[i] for i, n_ in enumerate(nbr)])
        P += 0.5 * msk[:, None] * (mean - P)
print('pose do jogo: altura', P[:, 1].max().round(3), 'pés', P[:, 1].min().round(3))
hv = P[(W[:, 1] > 0.95) & (TAG == 0)]; hc = (hv.min(0) + hv.max(0)) / 2 - G['head']; hr = float(((hv.max(0) - hv.min(0)) / 2)[[0, 2]].mean())
print('cabeça: centro', hc.round(3), 'raio', round(hr, 3))  # cabeça desenhada (para a mira e o capacete)
BIND = {s: G[s].tolist() for s in SEG}
def game_pose(Pq):
    Pg = np.zeros_like(Pq)
    for k, s_ in enumerate(SEG):
        R, o = B[s_]; Pg += W[:, k:k + 1] * (GM[s_] + (Pq - o) @ R)
    return Pg
POSED = {nm: game_pose(pose_hands(P0_open, FPP[nm])) for nm in FPP} if FP else {}
if not FP: np.savez('/tmp/mh/rest_' + KIND + '.npz', P=P, W=W, TAG=TAG)

# ---------- Blender: malha na pose do jogo ----------
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'
Wd = bpy.data.worlds.new('w'); sc.world = Wd
fl = [[remap[v] for v in F[i]] for i in faces]; ftl = [FT[i] for i in faces]
me = bpy.data.meshes.new(NAME); me.from_pydata([tuple(p) for p in P], [], fl); me.update()
uv = me.uv_layers.new(name='UV'); k = 0
for poly, tl in zip(me.polygons, ftl):
    for li, t in zip(poly.loop_indices, tl): uv.data[li].uv = VT[t]
for poly in me.polygons: poly.use_smooth = True
ob = bpy.data.objects.new(NAME, me); sc.collection.objects.link(ob)
for k, s in enumerate(SEG):
    vg = ob.vertex_groups.new(name=s)
    for i in np.where(W[:, k] > 0.003)[0]: vg.add([int(i)], float(W[i, k]), 'REPLACE')
tg = me.attributes.new('tag', 'INT', 'POINT'); tg.data.foreach_set('value', TAG.tolist())
print('malha base', len(me.vertices), 'vértices', len(me.polygons), 'faces')


# ---------- ruído 3D vetorizado (determinístico) ----------
R0 = np.random.default_rng(13); PERM = np.concatenate([R0.permutation(256)] * 2); GR = R0.normal(size=(256, 3)); GR /= np.linalg.norm(GR, axis=1)[:, None]
def noise(Pn):
    Pn = np.asarray(Pn, float); i = np.floor(Pn).astype(int); f = Pn - i; u = f * f * f * (f * (f * 6 - 15) + 10); out = np.zeros(len(Pn))
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
def ss(a, b, x): t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)

# pontos de referência na pose do jogo
def at(jn, s='head'): return GM[s] + (J[jn] - B[s][1]) @ B[s][0]
EYE_R, EYE_L, MOUTH = at('joint-l-eye'), at('joint-r-eye'), at('joint-mouth')
NECK_Y = HIP + (J['joint-neck'][1] - J['joint-l-upper-leg'][1])
print('olhos', EYE_R.round(3), 'boca', MOUTH.round(3), 'pescoço', round(NECK_Y, 3))

# ---------- 4. roupa: camisa, calças e sapatos são cascas por cima do corpo (com rasgões); o corpo tapado sai ----------
REG = {'skin': 0, 'eye': 1, 'teeth': 2, 'shirt': 3, 'pants': 4, 'shoe': 5, 'rim': 6}
def region_of_faces(bm):
    tl = bm.verts.layers.int.get('tag'); out = {}
    for f in bm.faces:
        c = f.calc_center_median(); vs = [v.index for v in f.verts]; t = max(v[tl] for v in f.verts)
        if t: continue
        sg = np.bincount(seg[vs], minlength=10).argmax(); name = SEG[sg]; x, y, z = c
        r = None
        Z_ = KIND == 'zombie'; shoeTop = 0.125 if Z_ else 0.165  # o jogador usa botas (canos até acima do tornozelo)
        if name.startswith('shin') and y < shoeTop + (0.01 * math.sin(x * 40) if Z_ else 0): r = 'shoe'
        elif name.startswith(('leg', 'shin')) or (name == 'torso' and y < 0.996): r = 'pants' if (y > 0.11 + 0.025 * noise(np.array([[x * 30, z * 30, 1]]))[0] if Z_ else y > shoeTop - 0.02) else None
        elif name == 'torso':
            neck = math.hypot(x, (z - 0.0) * 1.3) < 0.082 and y > NECK_Y - 0.075
            r = None if (neck or y > NECK_Y - 0.01) else 'shirt' if y > 0.988 else None
        elif name.startswith('arm'):
            if KIND == 'zombie': top = GM[name][1]; L = 0.19 + 0.05 * noise(np.array([[x * 25, y * 3, z * 25]]))[0]; r = 'shirt' if y > top - L else None
            else: r = 'shirt'
        elif name.startswith('fore') and KIND != 'zombie':  # jogador: manga comprida até ao pulso
            r = 'shirt' if y > GM[name][1] - 0.215 else None
        if r: out[f.index] = r
    return out

# uma subdivisão suave antes de cortar a roupa: bordas e rasgões menos aos degraus (no fim a malha é reduzida outra vez)
md = ob.modifiers.new('sub', 'SUBSURF'); md.levels = 1; md.uv_smooth = 'PRESERVE_BOUNDARIES'
bpy.context.view_layer.objects.active = ob; bpy.ops.object.modifier_apply(modifier='sub'); me = ob.data
# a subdivisão mistura os pesos; os valores inteiros (etiqueta) e o lado de cada vértice voltam a ser lidos daqui
nW = np.zeros((len(me.vertices), len(SEG)))
for v in me.vertices:
    for gg in v.groups: nW[v.index, gg.group] = gg.weight
nW[nW.sum(1) == 0, 0] = 1; W = nW / nW.sum(1)[:, None]; seg = W.argmax(1)
bm = bmesh.new(); bm.from_mesh(me)
bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table(); bm.normal_update()
reg = region_of_faces(bm)
# rasgões: buracos na camisa (mais à frente, na barriga) e nas calças (joelhos), com bordas irregulares
fc = np.array([tuple(bm.faces[i].calc_center_median()) for i in reg]); fid = list(reg.keys())
holes = set()
if KIND == 'zombie':
    hs = fbm(fc, 8, 4, 21)
    for j, i in enumerate(fid):
        x, y, z = fc[j]; r = reg[i]
        if r == 'shirt' and hs[j] + (0.22 if (z > 0.04 and 1.02 < y < 1.25) else 0.0) - (0.25 if y > 1.38 else 0) > 0.27: holes.add(i)
        if r == 'pants' and z > 0.02 and abs(y - 0.5) < 0.09 and hs[j] + 0.18 > 0.25: holes.add(i)
        if r == 'pants' and hs[j] > 0.36: holes.add(i)
FL = bm.faces.layers.int.new('reg')
OF = {i: bm.faces[i] for i in reg}  # referências às faces originais (os índices mudam ao duplicar)
cov = {i for i in reg if i not in holes}
# só sai o corpo bem por baixo da roupa: a fila de faces junto a cada borda fica (a borda da casca foi alisada e não pode abrir uma fresta)
edge_v = {v.index for i in cov for v in OF[i].verts if any(lf.index not in cov for lf in v.link_faces)}
covered = [OF[i] for i in cov if not any(v.index in edge_v for v in OF[i].verts)]
TH = {'shirt': 0.0105, 'pants': 0.008, 'shoe': 0.012} if KIND == 'zombie' else {'shirt': 0.0095, 'pants': 0.0095, 'shoe': 0.013}
shell = {}
for r in ('shirt', 'pants', 'shoe'):
    fs = [OF[i] for i, rr in reg.items() if rr == r and i not in holes]
    if not fs: continue
    d = bmesh.ops.duplicate(bm, geom=fs); nf = [e for e in d['geom'] if isinstance(e, bmesh.types.BMFace)]; nv = [e for e in d['geom'] if isinstance(e, bmesh.types.BMVert)]
    for v in nv:  # folga: a camisa solta em baixo, as calças largas nas canelas (corte direito)
        y = v.co.y; t = TH[r]
        if r == 'shirt': t += 0.012 * float(ss(1.36, 1.05, y))
        if r == 'pants': t += (0.013 * float(ss(0.6, 0.15, y)) if KIND == 'zombie' else 0.006 * float(ss(0.35, 0.75, y)) * float(ss(0.95, 0.8, y)) + 0.004 * float(ss(0.3, 0.18, y))) + 0.004 * float(ss(0.85, 1.0, y))
        v.co = v.co + v.normal * t
    for f in nf: f[FL] = REG[r]
    bnd = {v for f in nf for e in f.edges if len(e.link_faces) == 1 for v in e.verts}
    if r == 'shoe':  # sapato: sem dedos, biqueira arredondada e sola plana
        inner = [v for v in nv if v not in bnd]
        for _ in range(30 if KIND == 'zombie' else 70): bmesh.ops.smooth_vert(bm, verts=inner, factor=0.7, use_axis_x=True, use_axis_y=True, use_axis_z=True)
        bm.normal_update()
        for v in inner: v.co = v.co + v.normal * 0.006
        for v in nv:
            if v.co.y < 0.0: v.co.y = -0.014
    if KIND != 'zombie':  # jogador: bainhas, punhos e canos das botas direitos (a seleção por faces deixa-os em serra)
        cuff = GM['foreR'][1] - 0.215
        for v in bnd:
            x, y = abs(v.co.x), v.co.y
            if r == 'shirt' and 0.93 < y < 1.1 and x < 0.21: v.co.y = 0.978
            elif r == 'shirt' and y < 0.97 and x > 0.12: v.co.y = cuff
            elif r == 'pants' and y < 0.4: v.co.y = 0.146
            elif r == 'shoe' and y > 0.1: v.co.y = 0.166
    # bordas: rasgões e bainhas sem degraus (alisadas ao longo da própria borda)
    for _ in range(3):
        nb = {}
        for v in bnd:
            ln = [e.other_vert(v) for e in v.link_edges if len(e.link_faces) == 1 and e.other_vert(v) in bnd]
            if len(ln) == 2: nb[v] = (ln[0].co + ln[1].co) * 0.5
        for v, c in nb.items(): v.co = v.co * 0.5 + c * 0.5
    shell[r] = (nf, nv)
    # borda com espessura: as arestas soltas da casca dobram para dentro (bainhas, mangas, rasgões)
    be = [e for f in nf for e in f.edges if len(e.link_faces) == 1]
    if be:
        ex = bmesh.ops.extrude_edge_only(bm, edges=list(set(be)))
        for e in ex['geom']:
            if isinstance(e, bmesh.types.BMVert): e.co = e.co - e.normal * (TH[r] * 0.9)
            if isinstance(e, bmesh.types.BMFace): e[FL] = REG['rim']
# o corpo tapado pela roupa (sem buraco) já não se vê: sai
ring = [OF[i] for i in cov if any(v.index in edge_v for v in OF[i].verts)]
uvL = bm.loops.layers.uv.active
for f in ring:  # por baixo da borda da roupa: não disputam a textura com a roupa (UV num canto vazio)
    f[FL] = 7
    for l in f.loops: l[uvL].uv = (0.997, 0.997)
bmesh.ops.delete(bm, geom=covered, context='FACES')
tl = bm.verts.layers.int.get('tag')
for f in bm.faces:
    if f[FL] == 7: f[FL] = 0
    elif f[FL] == 0: t = max(v[tl] for v in f.verts); f[FL] = 1 if t == 1 else 2 if t == 2 else 0
bm.to_mesh(me); bm.free(); me.update()
print('com roupa', len(me.vertices), 'vértices', len(me.polygons), 'faces')

def preview(obj, tag, mat=None, cams=('frente', 'lado', 'costas', 'cara'), extra=()):
    if mat is None:  # cores lisas por região (controlo da forma)
        mat = bpy.data.materials.new('reg'); mat.use_nodes = True; nt = mat.node_tree; bs = nt.nodes['Principled BSDF']
        a = nt.nodes.new('ShaderNodeAttribute'); a.attribute_name = 'reg'; a.attribute_type = 'GEOMETRY'
        mth = nt.nodes.new('ShaderNodeMath'); mth.operation = 'DIVIDE'; mth.inputs[1].default_value = 6.0
        cr = nt.nodes.new('ShaderNodeValToRGB'); cr.color_ramp.interpolation = 'CONSTANT'; E = cr.color_ramp.elements
        cols = [(0.42, 0.47, 0.38), (0.85, 0.82, 0.7), (0.7, 0.65, 0.5), (0.55, 0.5, 0.42), (0.12, 0.14, 0.2), (0.08, 0.07, 0.06), (0.25, 0.22, 0.2)]
        E[0].color = (*cols[0], 1); E[1].position = 1.0 / 12; E[1].color = (*cols[1], 1)
        for k in range(2, 7): e = E.new((2 * k - 1) / 12); e.color = (*cols[k], 1)
        nt.links.new(a.outputs['Fac'], mth.inputs[0]); nt.links.new(mth.outputs[0], cr.inputs[0]); nt.links.new(cr.outputs['Color'], bs.inputs['Base Color']); bs.inputs['Roughness'].default_value = 0.8
    c = obj.copy(); c.data = obj.data.copy(); sc.collection.objects.link(c); c.data.materials.clear(); c.data.materials.append(mat); c.rotation_euler = (math.pi / 2, 0, 0); c.hide_render = False
    ex = []
    for e, em_, loc in extra:
        ce = e.copy(); ce.data = e.data.copy(); sc.collection.objects.link(ce); ce.data.materials.clear(); ce.data.materials.append(em_); g = loc; ce.location = (g[0], -g[2], g[1]); ce.rotation_euler = (math.pi / 2, 0, 0); ce.hide_render = False; ex.append(ce)
    for o in sc.objects:
        if o is not c and o not in ex and o.type == 'MESH': o.hide_render = True
    if not sc.world.use_nodes:
        sc.world.use_nodes = True; sc.world.node_tree.nodes['Background'].inputs[0].default_value = (0.55, 0.58, 0.62, 1)
        L = bpy.data.lights.new('s', 'SUN'); L.energy = 3; lo_ = bpy.data.objects.new('s', L); sc.collection.objects.link(lo_); lo_.rotation_euler = (0.75, 0.25, 0.5)
    cam = bpy.data.cameras.new('c'); co = bpy.data.objects.new('c', cam); sc.collection.objects.link(co); sc.camera = co
    sc.render.resolution_x, sc.render.resolution_y = 520, 720; sc.cycles.samples = 32; out = []
    V = {'frente': ((0, -4.0, 0.95), (math.pi / 2, 0, 0), 55), 'lado': ((3.3, -1.6, 1.05), (math.pi / 2 - 0.04, 0, math.radians(63)), 55), 'costas': ((0, 4.0, 0.95), (math.pi / 2, 0, math.pi), 55), 'cara': ((0.0, -0.75, 1.62), (math.pi / 2, 0, 0), 60), 'nuca': ((0.56, 0.54, 1.66), (math.pi / 2 - 0.05, 0, math.radians(136)), 60), 'mao': ((0.5, -0.62, 0.8), (math.pi / 2 - 0.05, 0, math.radians(27)), 40)}
    import mathutils
    def look(loc, tgt, lens): d = mathutils.Vector(tgt) - mathutils.Vector(loc); return (loc, tuple(d.to_track_quat('-Z', 'Y').to_euler()), lens)
    HC = (0.53, -0.27, 0.97)  # mão esquerda (vista da pré-visualização)
    V.update({'maoP': look((0.18, -0.32, 1.0), HC, 50), 'maoC': look((0.62, -0.75, 1.15), HC, 60), 'maoF': look((0.55, -0.9, 0.95), HC, 60), 'maoB': look((0.95, -0.3, 1.0), HC, 55)})
    if tag.startswith('fp'):  # mão esquerda: aponta as câmaras ao centro dos 12 cm mais baixos do braço do lado +x
        bpy.context.view_layer.update(); W_ = [c.matrix_world @ v.co for v in c.data.vertices]; W_ = [w for w in W_ if w.x > 0.1]; zmin = min(w.z for w in W_); hs = [w for w in W_ if w.z < zmin + 0.12]
        hc = sum(hs, mathutils.Vector()) / len(hs); off = mathutils.Vector(hc) - mathutils.Vector(HC)
        for k in ('maoF', 'maoP', 'maoB', 'maoC'): V[k] = look(tuple(mathutils.Vector(V[k][0]) + off), tuple(hc), V[k][2])
    for nm in cams:
        co.location, co.rotation_euler, cam.lens = V[nm]; sc.render.filepath = f'/tmp/{tag}-{nm}.png'; bpy.ops.render.render(write_still=True); out.append(sc.render.filepath)
    bpy.data.objects.remove(c); bpy.data.objects.remove(co)
    for ce in ex: bpy.data.objects.remove(ce)
    return out

if PREV and 'roupa' in sys.argv: preview(ob, 'roupa', cams=('frente', 'lado', 'costas')); sys.exit(0)

# ---------- 4b. (jogador) cabelo e barba: cascas por cima do couro cabeludo e da cara, presas à cabeça ----------
HAIR = {}
if KIND != 'zombie':
    HC = G['head'] + hc  # centro da cabeça desenhada
    Wh = np.zeros(len(me.vertices))  # peso da cabeça de cada vértice (a malha mudou ao fazer a roupa: lê-se dos grupos)
    gh = ob.vertex_groups['head'].index
    for v in me.vertices:
        for gg in v.groups:
            if gg.group == gh: Wh[v.index] = gg.weight
    def shell_from(sel, t_fun, name, extra=None, tris=1400, taper=0.012, smooth=5):
        import heapq
        bmh = bmesh.new(); bmh.from_mesh(me); bmh.verts.ensure_lookup_table(); bmh.faces.ensure_lookup_table(); bmh.normal_update()
        keep = set(sel(bmh)); bmesh.ops.delete(bmh, geom=[f for f in bmh.faces if f.index not in keep], context='FACES')
        bmesh.ops.delete(bmh, geom=[v for v in bmh.verts if not v.link_faces], context='VERTS')
        bv = [v for v in bmh.verts if v.is_boundary]
        for _ in range(smooth):  # a orla em serra (faces inteiras) passa a curva suave
            nw = {}
            for v in bv:
                nb = [e.other_vert(v) for e in v.link_edges if e.is_boundary]
                if len(nb) == 2: nw[v] = v.co * 0.5 + (nb[0].co + nb[1].co) * 0.25
            for v, c in nw.items(): v.co = c
        bmh.normal_update()
        dist = {v: 1e9 for v in bmh.verts}; hq = []
        for v in bv: dist[v] = 0.0; heapq.heappush(hq, (0.0, v.index, v))
        while hq:  # distância à orla, ao longo da superfície
            d, _, v = heapq.heappop(hq)
            if d > dist[v]: continue
            for e in v.link_edges:
                o2 = e.other_vert(v); nd = d + e.calc_length()
                if nd < dist[o2]: dist[o2] = nd; heapq.heappush(hq, (nd, o2.index, o2))
        for v in bmh.verts:  # mais fino na orla: o cabelo assenta na pele em vez de acabar num degrau
            t = t_fun(v.co); k = float(ss(0.0, taper, dist[v])); v.co = v.co + v.normal * (0.0012 + (t - 0.0012) * k)
        if extra: extra(bmh)
        for v in bmh.verts: v.co = v.co - mathutils.Vector(tuple(G['head']))  # coordenadas da cabeça (ponto de rotação)
        mh = bpy.data.meshes.new(name); bmh.to_mesh(mh); bmh.free(); o = bpy.data.objects.new(name, mh); sc.collection.objects.link(o); o.hide_render = True
        nt = sum(len(p.vertices) - 2 for p in mh.polygons)
        if nt > tris:
            dm = o.modifiers.new('d', 'DECIMATE'); dm.ratio = tris / nt; bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier='d')
        for p in mh.polygons: p.use_smooth = True
        return o
    import mathutils
    def rel(c): return np.array([c.x, c.y, c.z]) - HC
    HL_A = [0.0, 0.35, 0.7, 1.05, 1.3, 1.42, 1.5, 1.85, 2.05, 2.5, math.pi]  # linha do cabelo: altura (relativa ao centro da cabeça) por ângulo à volta
    HL_Y = [0.064, 0.07, 0.05, 0.03, -0.02, -0.02, 0.028, 0.028, -0.02, -0.065, -0.08]
    def scalp(bmh, strip=None, lift=0.0):
        out = []
        for f in bmh.faces:
            if f[bmh.faces.layers.int.get('reg')] != 0: continue
            vs = [v.index for v in f.verts]
            if Wh[vs].mean() < 0.9: continue
            r = rel(f.calc_center_median()); x, y, z = r
            if abs(x) > 0.075 and y < 0.03 and -0.05 < z < 0.03: continue  # orelha
            if strip is not None and abs(x) > strip: continue
            if y > float(np.interp(abs(math.atan2(x, z)), HL_A, HL_Y)) + lift: out.append(f.index)
        return out
    def strands(o, k=1.0):  # cor por vértice: madeixas (riscas ao longo do cabelo) e raiz mais escura
        m = o.data; Pm = np.zeros(len(m.vertices) * 3); m.vertices.foreach_get('co', Pm); Pm = Pm.reshape(-1, 3)
        s_ = 0.78 + 0.22 * np.sin(np.arctan2(Pm[:, 0], Pm[:, 2]) * 60 * k + 6 * fbm(Pm, 30, 2, 41)) * 0.5 + 0.12 * fbm(Pm, 60, 2, 42)
        ca = m.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT'); ca.data.foreach_set('color', np.concatenate([np.repeat(np.clip(s_, 0.3, 1.1)[:, None], 3, 1), np.ones((len(Pm), 1))], 1).ravel())
        return o
    vol = lambda c: 0.007 + 0.006 * float(ss(0.0, 0.1, c.y - HC[1])) + 0.0015 * float(noise(np.array([[c.x * 60, c.y * 60, c.z * 60]]))[0])
    HAIR['curto'] = strands(shell_from(lambda b: scalp(b), vol, 'curto'))
    from mathutils.bvhtree import BVHTree
    bmb = bmesh.new(); bmb.from_mesh(me); BVH = BVHTree.FromBMesh(bmb); bmb.free()
    def body_r(y, dr):  # distância do eixo da cabeça à pele, a uma altura e numa direção
        o0 = mathutils.Vector((HC[0], y, HC[2] - 0.015)); h = BVH.ray_cast(o0, dr, 0.2)[0]  # de dentro para fora: apanha a nuca/pescoço, não o ombro
        return (h - o0).length if h else 0.06
    def curtain(bmh):  # comprido: nasce à volta da cabeça (por cima das orelhas), assenta na nuca e cai até aos ombros
        cols, rows = 29, 11; grid = []
        for i in range(cols):
            ph = 1.22 + (2 * math.pi - 2.44) * i / (cols - 1); side = abs(math.cos(ph))
            dr = mathutils.Vector((math.sin(ph), 0, math.cos(ph))); y0 = HC[1] + 0.045; o_ = mathutils.Vector((HC[0], 0, HC[2] - 0.015))
            r0 = body_r(y0, dr) + 0.011; ln = (0.21 - 0.16 * side) * (1 + 0.12 * float(noise(np.array([[ph * 3, 0, 0]]))[0]))
            col = []
            for j in range(rows):
                t = j / (rows - 1); y = y0 - ln * t
                r = min(max(body_r(y, dr) + 0.012, r0 - 0.3 * (y0 - y)), r0 + 0.02) + 0.025 * side * t * t
                col.append(bmh.verts.new(mathutils.Vector((o_.x, y, o_.z)) + dr * r))
            grid.append(col)
        fs = []
        for i in range(cols - 1):
            for j in range(rows - 1): fs.append(bmh.faces.new((grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j])))
        bmh.normal_update(); bmesh.ops.solidify(bmh, geom=fs, thickness=0.01); bmh.normal_update()
    HAIR['comprido'] = strands(shell_from(lambda b: scalp(b), lambda c: vol(c) + 0.003, 'comprido', curtain, 2400), 0.6)
    def tail(bmh):  # rabo-de-cavalo: preso atrás da cabeça (com elástico), cai pelas costas e afina na ponta
        ring = 10; prev = None; base = HC + np.array([0, 0.012, -0.095]); N = 12
        for i in range(N):
            t = i / (N - 1); c = base + np.array([0, -0.2 * t ** 1.25, -0.03 - 0.03 * math.sin(min(t, 0.6) / 0.6 * 1.5) + 0.012 * t])
            r = 0.016 + 0.008 * math.sin(min(1, t / 0.25) * math.pi * 0.5) * (1 - t) ** 0.6 + 0.003 * (1 - t) - (0.004 if 0.06 < t < 0.12 else 0)
            r = max(r * (1 - 0.85 * ss(0.6, 1.0, t)), 0.002)
            cur = [bmh.verts.new((c[0] + r * math.cos(2 * math.pi * k / ring), c[1], c[2] + r * 0.8 * math.sin(2 * math.pi * k / ring))) for k in range(ring)]
            if prev:
                for k in range(ring): bmh.faces.new((prev[k], prev[(k + 1) % ring], cur[(k + 1) % ring], cur[k]))
            else: bmh.faces.new(cur)
            prev = cur
        bmh.faces.new(prev[::-1]); bmh.normal_update()
    HAIR['rabo'] = strands(shell_from(lambda b: scalp(b), lambda c: 0.005 + 0.002 * float(ss(0.0, 0.1, c.y - HC[1])), 'rabo', tail))
    HAIR['moicano'] = strands(shell_from(lambda b: scalp(b, strip=0.026, lift=0.01), lambda c: 0.008 + 0.022 * float(ss(-0.02, 0.09, c.y - HC[1])) * (0.7 + 0.5 * float(noise(np.array([[0, c.y * 90, c.z * 90]]))[0])), 'moicano', None, 1400, 0.026, 3), 2.0)
    def beard_sel(bmh, kind):
        out = []; MYr = MOUTH - HC
        for f in bmh.faces:
            if f[bmh.faces.layers.int.get('reg')] != 0: continue
            vs = [v.index for v in f.verts]
            if Wh[vs].mean() < 0.6: continue
            x, y, z = rel(f.calc_center_median()); my = MYr[1] - 0.04
            if kind == 'barba' and (y < my + 0.012) and (y > -0.115) and (z > -0.035) and not (abs(x) < 0.022 and abs(y - my) < 0.01 and z > 0.07): out.append(f.index)
            if kind == 'bigode' and abs(y - (my + 0.017 - 6 * x * x)) < 0.0075 and abs(x) < 0.034 and z > 0.06: out.append(f.index)
        return out
    HAIR['barba'] = strands(shell_from(lambda b: beard_sel(b, 'barba'), lambda c: 0.0045, 'barba', None, 900, 0.01), 2.5)
    HAIR['bigode'] = strands(shell_from(lambda b: beard_sel(b, 'bigode'), lambda c: 0.004, 'bigode', None, 240, 0.006, 3), 3)
    print('cabelos', {k: len(o.data.polygons) for k, o in HAIR.items()})

# ---------- 5. cópia densa com relevo (pregas, costuras, costelas, rugas) ----------
def vreg(m):  # região de cada vértice (a da primeira face onde está)
    fr = np.zeros(len(m.polygons), int); m.attributes['reg'].data.foreach_get('value', fr); out = np.zeros(len(m.vertices), int)
    for p in m.polygons:
        for vi in p.vertices: out[vi] = fr[p.index]
    return out
# as faces do corpo que ficaram por baixo da borda da roupa não se veem: o UV vai para um canto (não disputam a textura com a roupa)
hi = ob.copy(); hi.data = me.copy(); hi.name = 'hi'; sc.collection.objects.link(hi)
md = hi.modifiers.new('s', 'SUBSURF'); md.levels = 1; md.uv_smooth = 'PRESERVE_BOUNDARIES'
bpy.ops.object.select_all(action='DESELECT'); hi.select_set(True); bpy.context.view_layer.objects.active = hi; bpy.ops.object.modifier_apply(modifier='s')
hm = hi.data; n = len(hm.vertices); Ph = np.zeros(n * 3); hm.vertices.foreach_get('co', Ph); Ph = Ph.reshape(-1, 3); Nh = np.zeros(n * 3); hm.vertices.foreach_get('normal', Nh); Nh = Nh.reshape(-1, 3)
rh = vreg(hm); x, y, z = Ph.T; d = np.zeros(n)
sk, sh, pa, so = rh == 0, rh == 3, rh == 4, rh == 5
d[sk] += 0.0007 * fbm(Ph[sk], 70, 3, 31) + 0.0006 * ss(0.9, 0.97, 1 - np.abs(fbm(Ph[sk], 22, 3, 32)) * 6)  # rugas e veias
rib = sk & (z > 0.03) & (y > 1.06) & (y < 1.34) & (np.abs(x) < 0.14); d[rib] += 0.0022 * np.maximum(0, np.sin((y[rib] - 1.06) * 96)) - 0.002  # costelas à vista nos rasgões
d[sh] += 0.0032 * np.sin(y[sh] * 62 + 7 * fbm(Ph[sh], 6, 2, 33)) * ss(-0.2, 0.25, fbm(Ph[sh], 5, 2, 34)) + 0.0012 * fbm(Ph[sh], 30, 2, 35)  # pregas da camisa
for kx in (-1, 1): d[sh] += 0.0008 * ss(0.006, 0.0, np.abs(np.abs(x[sh]) - 0.175)) * (y[sh] < 1.3)  # costuras de lado
kn = pa & (np.abs(y - 0.5) < 0.08); d[kn] += 0.0035 * np.sin(y[kn] * 110 + 4 * fbm(Ph[kn], 9, 2, 36))  # pregas no joelho
an = pa & (y < 0.3); d[an] += 0.004 * np.sin(y[an] * 85 + 5 * fbm(Ph[an], 8, 2, 37)) * ss(0.3, 0.14, y[an])  # calças amontoadas no tornozelo
d[pa] += 0.001 * fbm(Ph[pa], 25, 2, 38)
d[so] += 0.0012 * fbm(Ph[so], 40, 2, 39)
Ph += Nh * d[:, None]; hm.vertices.foreach_set('co', Ph.ravel()); hm.update()
print('cópia densa', n, 'vértices')

# ---------- 6. malhas leves (perto e longe) ----------
def reduced(name, tris):
    o = ob.copy(); o.data = me.copy(); o.name = name; sc.collection.objects.link(o)
    nt = sum(len(p.vertices) - 2 for p in o.data.polygons); dm = o.modifiers.new('d', 'DECIMATE'); dm.ratio = min(1.0, tris / nt); dm.use_collapse_triangulate = True
    # cara e mãos perdem menos detalhe (peso menor = reduz menos)
    vg = o.vertex_groups.new(name='decim'); Pc = np.zeros(len(o.data.vertices) * 3); o.data.vertices.foreach_get('co', Pc); Pc = Pc.reshape(-1, 3)
    face = (Pc[:, 1] > NECK_Y + 0.02) & (Pc[:, 2] > -0.02); hand = (np.abs(Pc[:, 0]) > 0.17) & (Pc[:, 1] < 0.9) & (Pc[:, 1] > 0.6)
    wv = np.where(face | hand, 0.0 if (FP and name == 'fa') else 0.15, 1.0)
    for k in range(len(wv)): vg.add([k], float(wv[k]), 'REPLACE')
    dm.vertex_group = 'decim'; dm.vertex_group_factor = 1.0
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier='d')
    print(name, sum(len(p.vertices) - 2 for p in o.data.polygons), 'triângulos'); return o
if FP:  # braços da 1.ª pessoa: só os braços, mãos com todo o detalhe (a mesma topologia em todas as poses), resto reduzido
    import bmesh as _bm
    NV = len(me.vertices); va = me.attributes.new('vid', 'INT', 'POINT'); va.data.foreach_set('value', list(range(NV)))
    Pall = np.zeros(NV * 3); me.vertices.foreach_get('co', Pall); Pall = Pall.reshape(-1, 3)
    PN = os.environ.get('FPPOSE', 'pega'); os.makedirs('/tmp/fp', exist_ok=True); np.save(f'/tmp/fp/{PN}.npy', Pall)
    if os.environ.get('FPONLYPOS'): print('pose guardada', PN, NV); sys.exit(0)
    FPOS = {nm: np.load(f'/tmp/fp/{nm}.npy') for nm in FPP if os.path.exists(f'/tmp/fp/{nm}.npy')}
    FPOS = {nm: q for nm, q in FPOS.items() if q.shape == Pall.shape}
    moved = np.zeros(NV, bool)
    for q in FPOS.values(): moved |= np.linalg.norm(q - Pall, axis=1) > 1e-6
    print('poses', list(FPOS), 'vértices que mexem', int(moved.sum()))
    fa = ob.copy(); fa.data = me.copy(); fa.name = 'fa'; sc.collection.objects.link(fa)
    bm = _bm.new(); bm.from_mesh(fa.data); dl = bm.verts.layers.deform.verify(); ia = [fa.vertex_groups[n].index for n in ('armL', 'armR', 'foreL', 'foreR')]
    _bm.ops.delete(bm, geom=[v for v in bm.verts if sum(v[dl].get(i, 0) for i in ia) < 0.7], context='VERTS'); bm.to_mesh(fa.data); bm.free(); fa.data.update()
    vids = np.zeros(len(fa.data.vertices), int); fa.data.attributes['vid'].data.foreach_get('value', vids)
    hand = moved[vids] | ((np.abs(Pall[vids, 0]) > 0.15) & (Pall[vids, 1] < 0.88))
    vg = fa.vertex_groups.new(name='decim')
    for k in range(len(vids)): vg.add([k], 0.0 if hand[k] else 1.0, 'REPLACE')
    nt = sum(len(p_.vertices) - 2 for p_ in fa.data.polygons); ht = int(os.environ.get('FPTRIS', '9000'))
    dm = fa.modifiers.new('d', 'DECIMATE'); dm.decimate_type = 'UNSUBDIV'; dm.iterations = int(os.environ.get('FPUNSUB', '1'))  # desfaz a subdivisão: os vértices que ficam não mudam de sítio (as poses continuam a bater certo)
    bpy.ops.object.select_all(action='DESELECT'); fa.select_set(True); bpy.context.view_layer.objects.active = fa; bpy.ops.object.modifier_apply(modifier='d')
    print('fa', nt, '→', sum(len(p_.vertices) - 2 for p_ in fa.data.polygons), 'triângulos')
lo = reduced('lo', TARGET_TRIS); lo1 = reduced('lo1', 1500)
ob.hide_render = True; lo1.hide_render = True  # só a leve de perto entra nas contas da textura

# ---------- 7. mapas: normais e sombra de canto (da densa para a leve), posição e região (da leve) ----------
def img(nm, data=False):
    im = bpy.data.images.new(nm, TEX, TEX, alpha=False, float_buffer=True)
    if data: im.colorspace_settings.name = 'Non-Color'
    return im
bm_ = bpy.data.materials.new('bake'); bm_.use_nodes = True; bn = bm_.node_tree; tnode = bn.nodes.new('ShaderNodeTexImage'); bn.nodes.active = tnode
em = bn.nodes.new('ShaderNodeEmission'); outn = bn.nodes['Material Output']
lo.data.materials.clear(); lo.data.materials.append(bm_)
def bake(kind, image, sel=True, emit=None):
    tnode.image = image
    for l in list(bn.links):
        if l.to_node == outn: bn.links.remove(l)
    if emit is not None: bn.links.new(emit, em.inputs['Color']); bn.links.new(em.outputs[0], outn.inputs['Surface'])
    else: bn.links.new(bn.nodes['Principled BSDF'].outputs[0], outn.inputs['Surface'])
    bpy.ops.object.select_all(action='DESELECT'); lo.select_set(True); bpy.context.view_layer.objects.active = lo
    sc.render.bake.use_selected_to_active = sel
    if sel: hi.hide_render = False; hi.select_set(True); sc.render.bake.cage_extrusion = 0.01; sc.render.bake.max_ray_distance = 0.02
    sc.render.bake.margin = 8
    bpy.ops.object.bake(type=kind, normal_space='TANGENT') if kind == 'NORMAL' else bpy.ops.object.bake(type=kind)
    hi.hide_render = True
    return np.array(image.pixels[:]).reshape(TEX, TEX, 4)
if not FP:
    sc.cycles.samples = 4; Nm = bake('NORMAL', img('nrm', True))
    sc.cycles.samples = 64; sc.world.light_settings.distance = 0.05; AOm = bake('AO', img('ao', True), sel=False)
    geo = bn.nodes.new('ShaderNodeNewGeometry'); add = bn.nodes.new('ShaderNodeVectorMath'); add.operation = 'ADD'; add.inputs[1].default_value = (1, 1, 1)
    bn.links.new(geo.outputs['Position'], add.inputs[0]); sc.cycles.samples = 1
    POS = bake('EMIT', img('pos', True), sel=False, emit=add.outputs[0])
    at_ = bn.nodes.new('ShaderNodeAttribute'); at_.attribute_name = 'reg'; at_.attribute_type = 'GEOMETRY'; mul = bn.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'; mul.inputs[1].default_value = 0.1
    bn.links.new(at_.outputs['Fac'], mul.inputs[0])
    REGm = bake('EMIT', img('reg', True), sel=False, emit=mul.outputs[0])
    np.savez_compressed('/tmp/mh/maps_' + KIND + '.npz', N=Nm, AO=AOm, POS=POS, REG=REGm)
    print('mapas feitos')


# ---------- 8. exportar as malhas leves (perto e longe) com pesos, UV e tangentes ----------
def export(o):
    m = o.data; m.calc_tangents(); m.calc_loop_triangles(); uvl = m.uv_layers.active.data
    gw = np.zeros((len(m.vertices), len(SEG)))
    gi = {g.index: SEG.index(g.name) for g in o.vertex_groups if g.name in SEG}
    for v in m.vertices:
        for gg in v.groups:
            if gg.group in gi: gw[v.index, gi[gg.group]] = gg.weight
    gw[gw.sum(1) == 0, 0] = 1
    global VI; VI = []
    km, Pv, Nv, Tv, Uv, Si, Sw, I = {}, [], [], [], [], [], [], []
    for t in m.loop_triangles:
        for li, vi in zip(t.loops, t.vertices):
            L = m.loops[li]; uv = tuple(uvl[li].uv); key = (vi, round(uv[0], 5), round(uv[1], 5))
            if key not in km:
                km[key] = len(Pv); VI.append(vi); Pv.append(tuple(m.vertices[vi].co)); Nv.append(tuple(m.vertices[vi].normal)); Tv.append((*L.tangent, L.bitangent_sign)); Uv.append(uv)
                w = gw[vi]; top = np.argsort(-w)[:4]; ww = w[top] / max(1e-6, w[top].sum()); q = np.round(ww * 255).astype(int); q[0] += 255 - q.sum()
                Si.append(top.tolist()); Sw.append(q.tolist())
            I.append(km[key])
    b = lambda a: base64.b64encode(np.ascontiguousarray(a).tobytes()).decode()
    Pv = np.array(Pv); print(o.name, 'exportado', len(Pv), 'vértices', len(I) // 3, 'triângulos')
    return {'n': len(Pv), 'p': b(np.clip(np.round(Pv / 2.0 * 32767), -32767, 32767).astype(np.int16)), 'nm': b(np.clip(np.round(np.array(Nv) * 127), -127, 127).astype(np.int8)),
            'tg': b(np.clip(np.round(np.array(Tv) * 127), -127, 127).astype(np.int8)), 'uv': b(np.clip(np.round(np.array(Uv) * 65535), 0, 65535).astype(np.uint16)),
            'si': b(np.array(Si, np.uint8)), 'sw': b(np.array(Sw, np.uint8)), 'i': b(np.array(I, np.uint16 if len(Pv) < 65536 else np.uint32))}
if FP:
    D_ = export(fa)
    # poses das mãos: os mesmos vértices (a mão não foi reduzida), só os dedos mudam de sítio
    dec = lambda k, t: np.frombuffer(base64.b64decode(D_[k]), t)
    Pe = dec('p', np.int16).reshape(-1, 3) / 32767 * 2.0; Ie = dec('i', np.uint16 if D_['n'] < 65536 else np.uint32).reshape(-1, 3).astype(np.int64)
    vidE = np.zeros(len(fa.data.vertices), int); fa.data.attributes['vid'].data.foreach_get('value', vidE); src = vidE[np.array(VI)]
    he = np.where(moved[src])[0]; print('poses: vértices exportados que mexem', len(he))
    Dp = {}; b_ = lambda a: base64.b64encode(np.ascontiguousarray(a).tobytes()).decode()
    for nm, PP in FPOS.items():
        Q = Pe.copy(); Q[he] = PP[src[he]]
        fnrm = np.cross(Q[Ie[:, 1]] - Q[Ie[:, 0]], Q[Ie[:, 2]] - Q[Ie[:, 0]]); acc = np.zeros_like(Q)
        for c in range(3): np.add.at(acc, Ie[:, c], fnrm)
        agg = np.zeros((NV, 3)); np.add.at(agg, src, acc); Nn = agg[src[he]]; Nn /= np.maximum(1e-9, np.linalg.norm(Nn, axis=1))[:, None]
        Dp[nm] = {'p': b_(np.clip(np.round(Q[he] / 2.0 * 32767), -32767, 32767).astype(np.int16)), 'nm': b_(np.clip(np.round(Nn * 127), -127, 127).astype(np.int8))}
    D_['poses'] = Dp; D_['pi'] = b_(he.astype(np.uint16))
    open(os.path.join(ROOT, 'src', 'fparms.js'), 'w').write('// gerado por blender/human.py fparms: braços e mãos do jogador (1.ª pessoa) com as poses das mãos, a textura e os pesos do corpo. Não editar à mão.\nexport const FPARMS = ' + json.dumps(D_) + ';\n')
    print('escrito fparms.js', os.path.getsize(os.path.join(ROOT, 'src', 'fparms.js')) // 1024, 'KB')
    if PREV:
        for o_ in list(sc.objects):
            if o_ is not fa: o_.hide_render = True
        pm = bpy.data.materials.new('pv'); pm.use_nodes = True; pn = pm.node_tree; ti = pn.nodes.new('ShaderNodeTexImage'); ti.image = bpy.data.images.load(os.path.join(ROOT, 'assets', 'tex', 'player.jpg')); pn.links.new(ti.outputs['Color'], pn.nodes['Principled BSDF'].inputs['Base Color'])
        fa.hide_render = False; preview(fa, 'fp-' + os.environ.get('FPPOSE', 'pega'), mat=pm, cams=('maoF', 'maoP', 'maoB', 'maoC'))
    sys.exit(0)
OUTD = {'seg': SEG, 'bind': BIND, 'headC': hc.round(4).tolist(), 'headR': round(hr, 4), 'lod0': export(lo), 'lod1': export(lo1)}
def export_rigid(o):  # cabelo: preso só à cabeça (coordenadas em relação ao ponto de rotação da cabeça)
    m = o.data; m.calc_loop_triangles(); ca = m.color_attributes.get('Col')
    Pv = np.zeros(len(m.vertices) * 3); m.vertices.foreach_get('co', Pv); Pv = Pv.reshape(-1, 3); Nv = np.zeros(len(m.vertices) * 3); m.vertices.foreach_get('normal', Nv); Nv = Nv.reshape(-1, 3)
    Cv = np.array([ca.data[i].color[0] for i in range(len(m.vertices))]) if ca else np.ones(len(Pv))
    I = np.array([t.vertices[:] for t in m.loop_triangles], np.uint16).ravel(); b = lambda a: base64.b64encode(np.ascontiguousarray(a).tobytes()).decode()
    return {'n': len(Pv), 'p': b(np.clip(np.round(Pv / 0.5 * 32767), -32767, 32767).astype(np.int16)), 'nm': b(np.clip(np.round(Nv * 127), -127, 127).astype(np.int8)), 'c': b(np.clip(np.round(Cv / 1.2 * 255), 0, 255).astype(np.uint8)), 'i': b(I)}
if HAIR: OUTD['hair'] = {k: export_rigid(o) for k, o in HAIR.items()}
open(os.path.join(ROOT, 'src', NAME + '.js'), 'w').write('// gerado por blender/human.py a partir da malha base do MakeHuman (CC0): corpo com pele por partes (pesos), UV e tangentes. Não editar à mão.\nexport const ' + NAME.upper() + ' = ' + json.dumps(OUTD) + ';\n')
np.savez('/tmp/mh/ref_' + KIND + '.npz', EYE_R=EYE_R, EYE_L=EYE_L, MOUTH=MOUTH, NECK_Y=NECK_Y, HC=np.array(G['head']) + hc, HL_A=np.array(HL_A if KIND != 'zombie' else [0.0]), HL_Y=np.array(HL_Y if KIND != 'zombie' else [0.0]))
print('escrito', NAME + '.js', os.path.getsize(os.path.join(ROOT, 'src', NAME + '.js')) // 1024, 'KB')

# ---------- 9. cor e relevo fino (zcolor.py) e imagem de controlo ----------
import subprocess
subprocess.run([sys.executable, os.path.join(HERE, 'zcolor.py'), KIND], check=True)
if PREV:
    TN = 'zombie' if KIND == 'zombie' else 'player'
    pm = bpy.data.materials.new('pv'); pm.use_nodes = True; pn = pm.node_tree; bs = pn.nodes['Principled BSDF']
    ti = pn.nodes.new('ShaderNodeTexImage'); ti.image = bpy.data.images.load(os.path.join(ROOT, 'assets', 'tex', TN + '.jpg'))
    tnm = pn.nodes.new('ShaderNodeTexImage'); tnm.image = bpy.data.images.load(os.path.join(ROOT, 'assets', 'tex', TN + '_n.jpg')); tnm.image.colorspace_settings.name = 'Non-Color'
    nmap = pn.nodes.new('ShaderNodeNormalMap'); pn.links.new(ti.outputs['Color'], bs.inputs['Base Color']); pn.links.new(tnm.outputs['Color'], nmap.inputs['Color']); pn.links.new(nmap.outputs['Normal'], bs.inputs['Normal'])
    bs.inputs['Roughness'].default_value = 0.85
    if KIND != 'zombie':  # jogador: pinta a textura com cores de exemplo (como o jogo faz) e mostra os penteados
        mk = pn.nodes.new('ShaderNodeTexImage'); mk.image = bpy.data.images.load(os.path.join(ROOT, 'assets', 'tex', 'player_m.png')); mk.image.colorspace_settings.name = 'Non-Color'
        sep = pn.nodes.new('ShaderNodeSeparateColor'); pn.links.new(mk.outputs['Color'], sep.inputs['Color'])
        def ratio(c, ref): return tuple(((c >> s_ & 255) / 255) ** 2.2 / max(1e-3, ((ref >> s_ & 255) / 255) ** 2.2) for s_ in (16, 8, 0))
        cur = ti.outputs['Color']
        for ch, col, ref in (('Red', 0x3a4a5e, 0x9a9a96), ('Green', 0x3a3f33, 0x8e8e8a), ('Blue', 0xb9805a, 0xd9a882)):
            mu = pn.nodes.new('ShaderNodeMix'); mu.data_type = 'RGBA'; mu.blend_type = 'MULTIPLY'; pn.links.new(sep.outputs[ch], mu.inputs['Factor']); pn.links.new(cur, mu.inputs[6]); mu.inputs[7].default_value = (*ratio(col, ref), 1); cur = mu.outputs[2]
        a_ = pn.nodes.new('ShaderNodeMix'); a_.data_type = 'RGBA'; a_.blend_type = 'MULTIPLY'; pn.links.new(mk.outputs['Alpha'], a_.inputs['Factor']); pn.links.new(cur, a_.inputs[6]); a_.inputs[7].default_value = (*ratio(0x2a211b, 0x6a5a4c), 1); cur = a_.outputs[2]
        pn.links.new(cur, bs.inputs['Base Color'])
        hm_ = bpy.data.materials.new('hair'); hm_.use_nodes = True; hn = hm_.node_tree; vc = hn.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'; mm = hn.nodes.new('ShaderNodeMix'); mm.data_type = 'RGBA'; mm.blend_type = 'MULTIPLY'; mm.inputs['Factor'].default_value = 1; pn2 = hn.nodes['Principled BSDF']
        hn.links.new(vc.outputs['Color'], mm.inputs[6]); mm.inputs[7].default_value = (0.03, 0.02, 0.015, 1); hn.links.new(mm.outputs[2], pn2.inputs['Base Color']); pn2.inputs['Roughness'].default_value = 0.55
        preview(lo, 'final', mat=pm, cams=('frente', 'lado', 'mao'), extra=[(HAIR['curto'], hm_, G['head'])])
        for st in ('comprido', 'rabo', 'moicano'): preview(lo, 'h-' + st, mat=pm, cams=('cara', 'nuca'), extra=[(HAIR[st], hm_, G['head']), (HAIR['barba' if st == 'rabo' else 'bigode'], hm_, G['head'])])
    else: preview(lo, 'final', mat=pm)
    if 'longe' in sys.argv: preview(lo1, 'longe', mat=pm, cams=('frente',))
