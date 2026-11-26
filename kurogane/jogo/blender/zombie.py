# Zombie em Blender (sem ecrã). Cada parte do corpo é uma malha leve e suave; o detalhe (tecido, pele, sujidade, sangue,
# rasgões e sombra de canto) vai para uma textura única de 512 px, calculada no Blender a partir de uma cópia muito
# subdividida (de alta para baixa resolução). As partes usam as origens e eixos do jogo (Y para cima, +Z para a frente,
# metros): tronco na anca, cabeça no pescoço, coxa na anca, canela no joelho, braço no ombro, antebraço no cotovelo.
# Saída: src/zmodel.js (malhas em base64) e assets/tex/zombie.jpg. Correr: /tmp/bl/bin/python blender/zombie.py [--preview]
import bpy, bmesh, math, sys, json, base64, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, '..')
OUT_JS = os.path.join(ROOT, 'src', 'zmodel.js'); OUT_TEX = os.path.join(ROOT, 'assets', 'tex', 'zombie.jpg')
PREV = '--preview' in sys.argv; TEX = 512

def srgb(h): return np.array([(h >> 16) & 255, (h >> 8) & 255, h & 255], float) / 255.0
SKIN, TOP, LEGS, SHOES, HAIR, BLOOD, EYE, SLEEVE, BELT = map(srgb, [0x8f9a7e, 0x8a8274, 0x3a3d44, 0x26221e, 0x2a2520, 0x5a0e0b, 0xd8d0a0, 0x9a948a, 0x2a2623])
DRIED = srgb(0x3a1410)

# ---------- ruído 3D vetorizado (determinístico) ----------
R0 = np.random.default_rng(13); PERM = np.concatenate([R0.permutation(256)] * 2); GR = R0.normal(size=(256, 3)); GR /= np.linalg.norm(GR, axis=1)[:, None]
def noise(P):
    P = np.asarray(P, float); i = np.floor(P).astype(int); f = P - i; u = f * f * f * (f * (f * 6 - 15) + 10); out = np.zeros(len(P))
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                h = PERM[(PERM[(PERM[(i[:, 0] + dx) & 255] + i[:, 1] + dy) & 255] + i[:, 2] + dz) & 255]
                w = np.where(dx, u[:, 0], 1 - u[:, 0]) * np.where(dy, u[:, 1], 1 - u[:, 1]) * np.where(dz, u[:, 2], 1 - u[:, 2])
                out += w * np.einsum('ij,ij->i', GR[h], f - np.array([dx, dy, dz]))
    return out
def fbm(P, s, o=4, seed=0):
    P = np.asarray(P, float) * s + seed * 17.3; a, t = 0.5, 0.0
    for _ in range(o): t = t + a * noise(P); P = P * 2.03 + 3.1; a *= 0.5
    return t
def ss(a, b, x): t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)
def mix(a, b, t):
    t = np.asarray(t, float)
    if t.ndim == 1: t = t[:, None]
    return a + (b - a) * t

# ---------- malhas leves (em coordenadas do jogo) ----------
def loft(rings, seg=12, axis='y'):
    V, F = [], []
    for (t, rx, rr, c1, c2) in rings:
        for k in range(seg):
            a = 2 * math.pi * k / seg; x = c1 + rx * math.cos(a); o = c2 + rr * math.sin(a); V.append((x, t, o) if axis == 'y' else (x, o, t))
    n = len(rings)
    for r in range(n - 1):
        for k in range(seg):
            a, b = r * seg + k, r * seg + (k + 1) % seg; F.append((a, b, b + seg, a + seg))
    for r, dirn in ((0, -1), (n - 1, 1)):
        t, rx, rr, c1, c2 = rings[r]; sgn = 1 if rings[-1][0] > rings[0][0] else -1; t2 = t + dirn * sgn * min(rx, rr) * 0.55
        V.append((c1, t2, c2) if axis == 'y' else (c1, c2, t2)); ci = len(V) - 1
        for k in range(seg): F.append((ci, r * seg + k, r * seg + (k + 1) % seg))
    return V, F

def ellipsoid(c, r, ws=16, hs=10):
    V, F = [], []
    for j in range(1, hs):
        th = math.pi * j / hs
        for k in range(ws):
            ph = 2 * math.pi * k / ws; V.append((c[0] + r[0] * math.sin(th) * math.cos(ph), c[1] + r[1] * math.cos(th), c[2] + r[2] * math.sin(th) * math.sin(ph)))
    top = len(V); V.append((c[0], c[1] + r[1], c[2])); bot = len(V); V.append((c[0], c[1] - r[1], c[2]))
    for j in range(hs - 2):
        for k in range(ws): a, b = j * ws + k, j * ws + (k + 1) % ws; F.append((a, a + ws, b + ws, b))
    for k in range(ws): F.append((top, k, (k + 1) % ws)); a = (hs - 2) * ws; F.append((bot, a + (k + 1) % ws, a + k))
    return V, F

class Part:
    def __init__(s, name): s.name, s.V, s.F, s.tag = name, [], [], []
    def add(s, VF, tag):
        V, F = VF; o = len(s.V); s.V += [list(v) for v in V]; s.F += [tuple(i + o for i in f) for f in F]; s.tag += [tag] * len(V); return s

def head():
    p = Part('head'); V, F = ellipsoid((0, 0.152, 0.0), (0.118, 0.142, 0.13), ws=30, hs=20)
    def bump(v, c, r, d, sx=1, sy=1, sz=1):
        dx, dy, dz = (v[0] - c[0]) / sx, (v[1] - c[1]) / sy, (v[2] - c[2]) / sz; q = (dx * dx + dy * dy + dz * dz) / (r * r)
        return 0 if q > 4 else d * math.exp(-q * 1.6)
    out = []
    for v in V:
        v = list(v); n = np.array([v[0], (v[1] - 0.152) * 0.9, v[2]]); n /= (np.linalg.norm(n) + 1e-9); d = 0.0
        for s in (-1, 1):
            d += bump(v, (s * 0.045, 0.168, 0.118), 0.026, -0.022)            # órbitas fundas
            d += bump(v, (s * 0.045, 0.2, 0.112), 0.03, 0.007, sx=1.4)       # arcada da sobrancelha
            d += bump(v, (s * 0.078, 0.128, 0.09), 0.03, 0.008)              # maçãs do rosto
            d += bump(v, (s * 0.075, 0.085, 0.078), 0.032, -0.014)           # bochechas encovadas
            d += bump(v, (s * 0.116, 0.148, -0.005), 0.024, 0.013, sy=1.5)   # orelhas
        d += bump(v, (0, 0.14, 0.135), 0.018, 0.014, sy=1.7)                 # nariz
        d += bump(v, (0, 0.055, 0.1), 0.032, 0.012, sx=1.6)                  # queixo
        d += bump(v, (0, 0.088, 0.122), 0.02, -0.016, sx=2.0)                # boca aberta
        if v[1] < 0.075: v[0] *= 0.86; v[2] *= 0.94
        out.append([v[0] + n[0] * d, v[1] + n[1] * d, v[2] + n[2] * d])
    p.add((out, F), 'head')
    for s in (-1, 1): p.add(ellipsoid((s * 0.045, 0.168, 0.102), (0.014, 0.013, 0.01), ws=10, hs=6), 'eye')
    return p

def torso():
    R = [(-0.04, 0.16, 0.1, 0, 0), (0.02, 0.18, 0.115, 0, 0), (0.09, 0.19, 0.118, 0, 0.002), (0.15, 0.19, 0.116, 0, 0.004), (0.21, 0.178, 0.106, 0, 0.002), (0.27, 0.174, 0.102, 0, 0.0), (0.33, 0.188, 0.108, 0, 0.004), (0.4, 0.205, 0.115, 0, 0.004), (0.47, 0.222, 0.12, 0, 0.0),
         (0.54, 0.235, 0.12, 0, -0.008), (0.59, 0.238, 0.116, 0, -0.014), (0.63, 0.215, 0.108, 0, -0.02), (0.66, 0.17, 0.094, 0, -0.02), (0.69, 0.1, 0.076, 0, -0.012), (0.735, 0.058, 0.06, 0, 0.0), (0.79, 0.052, 0.055, 0, 0.005)]
    return Part('torso').add(loft(R, seg=24), 'torso')
def thigh(side):
    return Part('thigh' + ('L' if side < 0 else 'R')).add(loft([(0.07, 0.075, 0.075, 0, 0), (0.0, 0.106, 0.104, 0, 0), (-0.1, 0.1, 0.1, 0, 0.005), (-0.24, 0.086, 0.09, 0, 0.008), (-0.37, 0.072, 0.076, 0, 0.004), (-0.44, 0.076, 0.078, 0, 0.006), (-0.5, 0.055, 0.058, 0, 0)], seg=16), 'pants')
def shin():
    p = Part('shin').add(loft([(0.04, 0.06, 0.062, 0, 0), (0.0, 0.08, 0.082, 0, 0), (-0.09, 0.081, 0.088, 0, -0.008), (-0.21, 0.066, 0.07, 0, -0.004), (-0.33, 0.05, 0.054, 0, 0), (-0.4, 0.052, 0.056, 0, 0.0)], seg=14), 'pants')
    return p.add(loft([(-0.075, 0.046, 0.034, 0, -0.44), (-0.05, 0.056, 0.05, 0, -0.43), (0.02, 0.06, 0.056, 0, -0.425), (0.1, 0.057, 0.042, 0, -0.44), (0.165, 0.048, 0.032, 0, -0.448), (0.205, 0.028, 0.02, 0, -0.455)], seg=12, axis='z'), 'shoe')
def upper():
    return Part('upper').add(loft([(0.05, 0.05, 0.05, 0, 0), (0.0, 0.077, 0.072, 0, 0), (-0.09, 0.066, 0.062, 0, 0.004), (-0.2, 0.056, 0.054, 0, 0), (-0.3, 0.05, 0.048, 0, 0), (-0.34, 0.032, 0.03, 0, 0)], seg=14), 'sleeve')
def fore():
    p = Part('fore').add(loft([(0.03, 0.04, 0.038, 0, 0), (0.0, 0.054, 0.05, 0, 0), (-0.07, 0.05, 0.046, 0, 0.003), (-0.19, 0.038, 0.034, 0, 0.002), (-0.27, 0.03, 0.024, 0, 0), (-0.29, 0.032, 0.022, 0, 0.002)], seg=12), 'skin')
    p.add(loft([(-0.28, 0.036, 0.019, 0, 0.004), (-0.31, 0.048, 0.022, 0, 0.006), (-0.35, 0.05, 0.02, 0, 0.01), (-0.365, 0.045, 0.017, 0, 0.012)], seg=10), 'skin')
    for i, x in enumerate((-0.034, -0.012, 0.012, 0.034)):
        L = 1.0 - 0.06 * abs(i - 1.5)
        p.add(loft([(-0.355, 0.011, 0.011, x, 0.012), (-0.39 * L, 0.0105, 0.0105, x * 1.05, 0.022), (-0.42 * L, 0.009, 0.009, x * 1.08, 0.045), (-0.432 * L, 0.007, 0.007, x * 1.1, 0.065)], seg=6), 'skin')
    return p.add(loft([(-0.3, 0.012, 0.012, 0.0, 0.026), (-0.33, 0.011, 0.011, 0.0, 0.042), (-0.35, 0.008, 0.008, 0.0, 0.052)], seg=6), 'skin')

PARTS = [torso(), head(), thigh(-1), thigh(1), shin(), upper(), fore()]
TAGS = ['torso', 'head', 'eye', 'pants', 'shoe', 'sleeve', 'skin']

# ---------- cor de cada ponto (nas coordenadas da parte) ----------
def color(pname, tag, P):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]; n = len(P); T = np.array(tag)
    big = fbm(P, 9, 3, 1); grain = fbm(P, 70, 2, 2); fine = fbm(P, 260, 2, 3)
    skin = SKIN[None, :] * (1 + 0.07 * fbm(P, 22, 3, 4) + 0.04 * grain)[:, None]  # pele baça, com grão
    bruise = ss(0.08, 0.32, fbm(P, 6, 3, 5)); skin = mix(skin, skin * np.array([0.62, 0.55, 0.62]), 0.55 * bruise)  # nódoas arroxeadas
    skin = mix(skin, skin * np.array([0.8, 0.86, 0.7]), 0.4 * ss(0.0, 0.3, fbm(P, 3, 2, 13)))  # zonas mais amareladas
    veins = ss(0.9, 0.97, 1 - np.abs(fbm(P, 26, 3, 6)) * 7)  # veias finas e escuras
    skin = mix(skin, skin * np.array([0.5, 0.52, 0.62]), 0.35 * veins)
    weave = 1 + 0.07 * np.sin(x * 900 + y * 260) * np.sin(y * 900 - z * 250) + 0.08 * fine  # trama do tecido
    def cloth(c, dirt=0.22): return c[None, :] * (weave * (1 - dirt * ss(-0.1, 0.4, big)))[:, None]
    C = np.zeros((n, 3))
    def put(mask, val): C[mask] = val[mask]
    eye = np.tile(EYE * 0.9, (n, 1)) * (1 - 0.6 * ss(0.006, 0.0, np.hypot(np.abs(x) - 0.045, y - 0.168)))[:, None]; put(T == 'eye', eye)
    put(T == 'shoe', cloth(SHOES, 0.1) * np.where(y < -0.452, 0.55, 1.0)[:, None])
    # calças: rasgões nos joelhos e na coxa mostram pele; sangue seco
    pants = cloth(LEGS)
    if pname.startswith('thigh'):
        q = fbm(P + (0.5 if pname.endswith('R') else 0), 14, 4, 7) + 0.25 * ss(-0.3, -0.42, y)
        rip = (q > 0.28) & (z > 0.0); edge = (q > 0.23) & ~rip & (z > 0.0)
        pants[rip] = skin[rip] * 0.9; pants[edge] *= 1.35
    put(T == 'pants', pants)
    # manga rasgada a meio do braço
    q = fbm(P, 18, 3, 8); sl = cloth(SLEEVE) * np.where(y > 0.02, 0.85, 1.0)[:, None]; cut = y < -0.16 + 0.06 * q; frayed = (~cut) & (y < -0.13 + 0.06 * q)
    sl[cut] = skin[cut]; sl[frayed] *= 0.7; put(T == 'sleeve', sl)
    # mão e antebraço: pele, unhas e pontas sujas
    sk = skin.copy(); tips = y < -0.4; sk[tips] = mix(sk[tips], np.array([0.2, 0.17, 0.13]), 0.65); put(T == 'skin', sk)
    # tronco: calças, cinto, camisa rasgada à frente (barriga e costelas), gola, pescoço
    if pname == 'torso':
        tr = cloth(TOP); tr[y > 0.64] *= 0.78
        q = fbm(P, 7, 4, 9) + np.where((y > 0.2) & (y < 0.46), 0.28, -0.12)
        torn = (z > 0.0) & (q > 0.26) & (y > 0.18) & (y < 0.6); rim = (z > 0.0) & (q > 0.21) & ~torn & (y > 0.17) & (y < 0.61)
        rib = np.where((y > 0.3) & (y < 0.52), np.maximum(0, np.sin((y - 0.3) * 100)), 0)
        tr[torn] = skin[torn] * (0.78 + 0.3 * rib[torn])[:, None]; tr[rim] *= 0.62
        lg = y < 0.125; tr[lg] = cloth(LEGS)[lg]; belt = (y >= 0.125) & (y < 0.168); tr[belt] = BELT[None, :] * (1 + 0.1 * grain[belt])[:, None]
        nk = y > 0.675; tr[nk] = skin[nk]
        put(T == 'torso', tr)
    if pname == 'head':
        h = skin.copy()
        sock = sum(ss(0.032, 0.012, np.hypot(x - s * 0.045, (y - 0.168) * 1.1)) for s in (-1, 1)) * (z > 0.07)
        h *= (1 - 0.7 * sock)[:, None]
        mouth = (np.abs(y - 0.088) < 0.011 * np.clip(1 - (x / 0.045) ** 2, 0, 1)) & (z > 0.09); h[mouth] = np.array([0.14, 0.035, 0.03])
        teeth = (np.abs(y - 0.1) < 0.005) & (np.abs(x) < 0.03) & (z > 0.1) & (np.sin(x * 420) > -0.3); h[teeth] = np.array([0.6, 0.56, 0.42])
        hair = (y > 0.2) & (z < 0.095) & (fbm(P, 16, 4, 10) > -0.1); h[hair] = HAIR[None, :] * (1 + 0.3 * fine[hair])[:, None]
        put(T == 'head', h)
    # sangue: salpicos (fresco e seco), mais à frente e nas mãos
    bl = ss(0.3, 0.36, fbm(P, 11, 4, 11) + 0.08 * (z > 0.02) + 0.12 * (y < -0.3) * (pname == 'fore')); dr = ss(0.33, 0.4, fbm(P, 5, 3, 12))
    bm = T != 'eye'; Cb = C[bm]; Cb = mix(Cb, BLOOD[None, :] * (0.8 + 0.4 * grain[bm])[:, None], 0.85 * bl[bm]); Cb = mix(Cb, DRIED[None, :], 0.6 * dr[bm]); C[bm] = Cb
    return np.clip(C, 0, 1)

# ---------- Blender ----------
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 64
W = bpy.data.worlds.new('w'); sc.world = W; W.light_settings.distance = 0.07

def make(name, V, F, smooth=True):
    me = bpy.data.meshes.new(name); me.from_pydata([tuple(v) for v in V], [], F); me.validate(); me.update()
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    for poly in me.polygons: poly.use_smooth = smooth
    ob = bpy.data.objects.new(name, me); sc.collection.objects.link(ob); return ob

# 1) malha leve: todas as partes num só objeto, afastadas (a sombra de uma não cai na outra), com a parte e a etiqueta guardadas
OFF = {p.name: (i * 0.9, 0, 0) for i, p in enumerate(PARTS)}
V, F, pid, tid = [], [], [], []
for k, p in enumerate(PARTS):
    o = len(V); ox = OFF[p.name][0]; V += [(v[0] + ox, v[1], v[2]) for v in p.V]; F += [tuple(i + o for i in f) for f in p.F]; pid += [k] * len(p.V); tid += [TAGS.index(t) for t in p.tag]
lo = make('lo', V, F)
for nm, arr in (('pid', pid), ('tid', tid)):
    at = lo.data.attributes.new(nm, 'INT', 'POINT'); at.data.foreach_set('value', arr)
bpy.ops.object.select_all(action='DESELECT'); lo.select_set(True); bpy.context.view_layer.objects.active = lo
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.012); bpy.ops.uv.pack_islands(margin=0.008); bpy.ops.object.mode_set(mode='OBJECT')

# 2) cópia densa (subdivisão simples: mesma forma) com a cor calculada ponto a ponto
hi = lo.copy(); hi.data = lo.data.copy(); hi.name = 'hi'; sc.collection.objects.link(hi)
md = hi.modifiers.new('s', 'SUBSURF'); md.subdivision_type = 'SIMPLE'; md.levels = 3
bpy.ops.object.select_all(action='DESELECT'); hi.select_set(True); bpy.context.view_layer.objects.active = hi; bpy.ops.object.modifier_apply(modifier='s')
hm = hi.data; nV = len(hm.vertices); Phi = np.zeros(nV * 3); hm.vertices.foreach_get('co', Phi); Phi = Phi.reshape(-1, 3)
hp = np.zeros(nV, int); hm.attributes['pid'].data.foreach_get('value', hp); ht = np.zeros(nV, int); hm.attributes['tid'].data.foreach_get('value', ht)
Col = np.zeros((nV, 3))
for k, p in enumerate(PARTS):
    m = hp == k; L = Phi[m] - np.array(OFF[p.name]); Col[m] = color(p.name, [TAGS[t] for t in ht[m]], L)
ca = hm.color_attributes.new('col', 'FLOAT_COLOR', 'POINT'); ca.data.foreach_set('color', np.concatenate([Col ** 2.2, np.ones((nV, 1))], 1).ravel())
print('malha densa', nV, 'vértices')
mat = bpy.data.materials.new('hm'); mat.use_nodes = True; nt = mat.node_tree; bsdf = nt.nodes['Principled BSDF']; vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'col'; nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color']); hm.materials.append(mat)

# 3) texturas: cor (da cópia densa para a leve) e sombra de canto (só a leve)
def img(name): return bpy.data.images.new(name, TEX, TEX, alpha=False, float_buffer=True)
lm = bpy.data.materials.new('lm'); lm.use_nodes = True; ln = lm.node_tree; tn = ln.nodes.new('ShaderNodeTexImage'); ln.nodes.active = tn; lo.data.materials.append(lm)
alb = img('alb'); tn.image = alb
bpy.ops.object.select_all(action='DESELECT'); hi.select_set(True); lo.select_set(True); bpy.context.view_layer.objects.active = lo
sc.render.bake.use_selected_to_active = True; sc.render.bake.cage_extrusion = 0.01; sc.render.bake.max_ray_distance = 0.03; sc.render.bake.margin = 6
sc.cycles.samples = 4; bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'})
ao = img('ao'); tn.image = ao; sc.render.bake.use_selected_to_active = False; hi.hide_render = True
bpy.ops.object.select_all(action='DESELECT'); lo.select_set(True); sc.cycles.samples = 96; bpy.ops.object.bake(type='AO')
A = np.array(alb.pixels[:]).reshape(TEX, TEX, 4)[..., :3]; O = np.array(ao.pixels[:]).reshape(TEX, TEX, 4)[..., :1]
fin = np.clip(A, 0, 1) ** (1 / 2.2) * (0.42 + 0.58 * np.clip(O, 0, 1) ** 0.7)  # cor em sRGB; a sombra de canto nunca chega a preto
from PIL import Image
Image.fromarray((np.clip(fin[::-1], 0, 1) * 255).astype(np.uint8)).save(OUT_TEX, quality=88, optimize=True); print('textura', OUT_TEX, os.path.getsize(OUT_TEX) // 1024, 'KB')

# 4) exportar cada parte da malha leve: posição (16 bits), normal (8 bits), UV (16 bits), índices
me = lo.data; me.calc_loop_triangles(); uvl = me.uv_layers.active.data
lp = np.zeros(len(me.vertices), int); me.attributes['pid'].data.foreach_get('value', lp)
out = {}
for k, p in enumerate(PARTS):
    keymap, Pv, Nv, Uv, I = {}, [], [], [], []
    for t in me.loop_triangles:
        if lp[t.vertices[0]] != k: continue
        for li, vi in zip(t.loops, t.vertices):
            uv = tuple(uvl[li].uv); key = (vi, round(uv[0], 5), round(uv[1], 5))
            if key not in keymap:
                keymap[key] = len(Pv); co = me.vertices[vi].co; Pv.append((co.x - OFF[p.name][0], co.y, co.z)); Nv.append(tuple(me.vertices[vi].normal)); Uv.append(uv)
            I.append(keymap[key])
    Pv, Nv, Uv, I = np.array(Pv), np.array(Nv), np.array(Uv), np.array(I, np.uint16)
    b = lambda a: base64.b64encode(a.tobytes()).decode()
    out[p.name] = {'n': len(Pv), 'p': b(np.clip(np.round(Pv / 0.9 * 32767), -32767, 32767).astype(np.int16)), 'nm': b(np.clip(np.round(Nv * 127), -127, 127).astype(np.int8)), 'uv': b(np.clip(np.round(Uv * 65535), 0, 65535).astype(np.uint16)), 'i': b(I)}
    print(p.name, 'vértices', len(Pv), 'triângulos', len(I) // 3)
open(OUT_JS, 'w').write('// gerado por blender/zombie.py (Blender, sem ecrã): partes do zombie (posição, normal, UV) para a textura tex/zombie.jpg. Não editar à mão.\nexport const ZM = ' + json.dumps(out) + ';\n')
print('escrito', OUT_JS, os.path.getsize(OUT_JS) // 1024, 'KB')

if PREV:  # controlo: o zombie montado, com a textura final
    t = bpy.data.images.load(OUT_TEX); pm = bpy.data.materials.new('pv'); pm.use_nodes = True; pn = pm.node_tree; ti = pn.nodes.new('ShaderNodeTexImage'); ti.image = t
    pn.links.new(ti.outputs['Color'], pn.nodes['Principled BSDF'].inputs['Base Color']); pn.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.85
    lo.data.materials.clear(); lo.data.materials.append(pm); lo.hide_render = True
    place = {'torso': [(0, 0.87, 0)], 'head': [(0, 1.61, 0.02)], 'thighL': [(-0.11, 0.87, 0)], 'thighR': [(0.11, 0.87, 0)], 'shin': [(-0.11, 0.43, 0), (0.11, 0.43, 0)], 'upper': [(-0.27, 1.37, 0.02), (0.27, 1.37, 0.02)], 'fore': [(-0.27, 1.07, 0.02), (0.27, 1.07, 0.02)]}
    for k, p in enumerate(PARTS):
        for loc in place[p.name]:
            c = lo.copy(); c.data = lo.data.copy(); sc.collection.objects.link(c); c.hide_render = False
            bm = bmesh.new(); bm.from_mesh(c.data); pl = bm.verts.layers.int.get('pid'); bmesh.ops.delete(bm, geom=[v for v in bm.verts if v[pl] != k], context='VERTS'); bm.to_mesh(c.data); bm.free()
            g = (loc[0] - OFF[p.name][0], loc[1], loc[2]); c.location = (g[0], -g[2], g[1]); c.rotation_euler = (math.pi / 2, 0, 0)
    W.use_nodes = True; W.node_tree.nodes['Background'].inputs[0].default_value = (0.55, 0.58, 0.62, 1); W.node_tree.nodes['Background'].inputs[1].default_value = 0.9
    Ls = bpy.data.lights.new('sun', 'SUN'); Ls.energy = 3.2; lso = bpy.data.objects.new('sun', Ls); sc.collection.objects.link(lso); lso.rotation_euler = (0.75, 0.25, 0.5)
    cam = bpy.data.cameras.new('c'); co = bpy.data.objects.new('c', cam); sc.collection.objects.link(co); sc.camera = co
    sc.render.resolution_x, sc.render.resolution_y = 560, 720; sc.cycles.samples = 48
    for nm, loc, rot, lens in [('frente', (0.0, -3.6, 1.0), (math.pi / 2, 0, 0), 60), ('lado', (3.2, -1.6, 1.15), (math.pi / 2 - 0.05, 0, math.radians(63)), 60), ('cara', (0.0, -0.95, 1.76), (math.pi / 2, 0, 0), 70)]:
        co.location = loc; co.rotation_euler = rot; cam.lens = lens; sc.render.filepath = f'/tmp/zprev-{nm}.png'; bpy.ops.render.render(write_still=True)
