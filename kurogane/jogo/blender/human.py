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
print('pose do jogo: altura', P[:, 1].max().round(3), 'pés', P[:, 1].min().round(3))
hv = P[(W[:, 1] > 0.95) & (TAG == 0)]; hc = (hv.min(0) + hv.max(0)) / 2 - G['head']; hr = float(((hv.max(0) - hv.min(0)) / 2)[[0, 2]].mean())
print('cabeça: centro', hc.round(3), 'raio', round(hr, 3))  # cabeça desenhada (para a mira e o capacete)
BIND = {s: G[s].tolist() for s in SEG}
np.savez('/tmp/mh/rest_' + KIND + '.npz', P=P, W=W, TAG=TAG)

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
        if name.startswith('shin') and y < 0.125 + 0.01 * math.sin(x * 40): r = 'shoe'
        elif name.startswith(('leg', 'shin')) or (name == 'torso' and y < 0.996): r = 'pants' if y > 0.11 + 0.025 * noise(np.array([[x * 30, z * 30, 1]]))[0] else None
        elif name == 'torso':
            neck = math.hypot(x, (z - 0.0) * 1.3) < 0.082 and y > NECK_Y - 0.075
            r = None if (neck or y > NECK_Y - 0.01) else 'shirt' if y > 0.988 else None
        elif name.startswith('arm'):
            top = GM[name][1]; L = (0.19 if KIND == 'zombie' else 0.27) + 0.05 * noise(np.array([[x * 25, y * 3, z * 25]]))[0]
            r = 'shirt' if y > top - L else None
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
TH = {'shirt': 0.0105, 'pants': 0.008, 'shoe': 0.012}
shell = {}
for r in ('shirt', 'pants', 'shoe'):
    fs = [OF[i] for i, rr in reg.items() if rr == r and i not in holes]
    if not fs: continue
    d = bmesh.ops.duplicate(bm, geom=fs); nf = [e for e in d['geom'] if isinstance(e, bmesh.types.BMFace)]; nv = [e for e in d['geom'] if isinstance(e, bmesh.types.BMVert)]
    for v in nv:  # folga: a camisa solta em baixo, as calças largas nas canelas (corte direito)
        y = v.co.y; t = TH[r]
        if r == 'shirt': t += 0.012 * float(ss(1.36, 1.05, y))
        if r == 'pants': t += 0.013 * float(ss(0.6, 0.15, y)) + 0.004 * float(ss(0.85, 1.0, y))
        v.co = v.co + v.normal * t
    for f in nf: f[FL] = REG[r]
    bnd = {v for f in nf for e in f.edges if len(e.link_faces) == 1 for v in e.verts}
    if r == 'shoe':  # sapato: sem dedos, biqueira arredondada e sola plana
        inner = [v for v in nv if v not in bnd]
        for _ in range(30): bmesh.ops.smooth_vert(bm, verts=inner, factor=0.7, use_axis_x=True, use_axis_y=True, use_axis_z=True)
        bm.normal_update()
        for v in inner: v.co = v.co + v.normal * 0.006
        for v in nv:
            if v.co.y < 0.0: v.co.y = -0.014
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

def preview(obj, tag, mat=None, cams=('frente', 'lado', 'costas', 'cara')):
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
    for o in sc.objects:
        if o is not c and o.type == 'MESH': o.hide_render = True
    if not sc.world.use_nodes:
        sc.world.use_nodes = True; sc.world.node_tree.nodes['Background'].inputs[0].default_value = (0.55, 0.58, 0.62, 1)
        L = bpy.data.lights.new('s', 'SUN'); L.energy = 3; lo_ = bpy.data.objects.new('s', L); sc.collection.objects.link(lo_); lo_.rotation_euler = (0.75, 0.25, 0.5)
    cam = bpy.data.cameras.new('c'); co = bpy.data.objects.new('c', cam); sc.collection.objects.link(co); sc.camera = co
    sc.render.resolution_x, sc.render.resolution_y = 520, 720; sc.cycles.samples = 32; out = []
    V = {'frente': ((0, -4.0, 0.95), (math.pi / 2, 0, 0), 55), 'lado': ((3.3, -1.6, 1.05), (math.pi / 2 - 0.04, 0, math.radians(63)), 55), 'costas': ((0, 4.0, 0.95), (math.pi / 2, 0, math.pi), 55), 'cara': ((0.0, -0.75, 1.62), (math.pi / 2, 0, 0), 60)}
    for nm in cams:
        co.location, co.rotation_euler, cam.lens = V[nm]; sc.render.filepath = f'/tmp/{tag}-{nm}.png'; bpy.ops.render.render(write_still=True); out.append(sc.render.filepath)
    bpy.data.objects.remove(c); bpy.data.objects.remove(co)
    return out

if PREV and 'roupa' in sys.argv: preview(ob, 'roupa', cams=('frente', 'lado', 'costas')); sys.exit(0)

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
    wv = np.where(face | hand, 0.15, 1.0)
    for k in range(len(wv)): vg.add([k], float(wv[k]), 'REPLACE')
    dm.vertex_group = 'decim'; dm.vertex_group_factor = 1.0
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier='d')
    print(name, sum(len(p.vertices) - 2 for p in o.data.polygons), 'triângulos'); return o
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
    km, Pv, Nv, Tv, Uv, Si, Sw, I = {}, [], [], [], [], [], [], []
    for t in m.loop_triangles:
        for li, vi in zip(t.loops, t.vertices):
            L = m.loops[li]; uv = tuple(uvl[li].uv); key = (vi, round(uv[0], 5), round(uv[1], 5))
            if key not in km:
                km[key] = len(Pv); Pv.append(tuple(m.vertices[vi].co)); Nv.append(tuple(m.vertices[vi].normal)); Tv.append((*L.tangent, L.bitangent_sign)); Uv.append(uv)
                w = gw[vi]; top = np.argsort(-w)[:4]; ww = w[top] / max(1e-6, w[top].sum()); q = np.round(ww * 255).astype(int); q[0] += 255 - q.sum()
                Si.append(top.tolist()); Sw.append(q.tolist())
            I.append(km[key])
    b = lambda a: base64.b64encode(np.ascontiguousarray(a).tobytes()).decode()
    Pv = np.array(Pv); print(o.name, 'exportado', len(Pv), 'vértices', len(I) // 3, 'triângulos')
    return {'n': len(Pv), 'p': b(np.clip(np.round(Pv / 2.0 * 32767), -32767, 32767).astype(np.int16)), 'nm': b(np.clip(np.round(np.array(Nv) * 127), -127, 127).astype(np.int8)),
            'tg': b(np.clip(np.round(np.array(Tv) * 127), -127, 127).astype(np.int8)), 'uv': b(np.clip(np.round(np.array(Uv) * 65535), 0, 65535).astype(np.uint16)),
            'si': b(np.array(Si, np.uint8)), 'sw': b(np.array(Sw, np.uint8)), 'i': b(np.array(I, np.uint16 if len(Pv) < 65536 else np.uint32))}
OUTD = {'seg': SEG, 'bind': BIND, 'headC': hc.round(4).tolist(), 'headR': round(hr, 4), 'lod0': export(lo), 'lod1': export(lo1)}
open(os.path.join(ROOT, 'src', NAME + '.js'), 'w').write('// gerado por blender/human.py a partir da malha base do MakeHuman (CC0): corpo com pele por partes (pesos), UV e tangentes. Não editar à mão.\nexport const ' + NAME.upper() + ' = ' + json.dumps(OUTD) + ';\n')
np.savez('/tmp/mh/ref_' + KIND + '.npz', EYE_R=EYE_R, EYE_L=EYE_L, MOUTH=MOUTH, NECK_Y=NECK_Y)
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
    preview(lo, 'final', mat=pm)
    if 'longe' in sys.argv: preview(lo1, 'longe', mat=pm, cams=('frente',))
