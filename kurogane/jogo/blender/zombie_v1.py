# Zombie em Blender (sem ecrã): cada parte do corpo é uma malha suave com cores por vértice e sombra de canto (AO) calculada no Blender.
# As partes usam as mesmas origens e eixos do jogo (Y para cima, +Z para a frente, metros): tronco na anca, cabeça no pescoço,
# coxa na anca, canela no joelho, braço no ombro, antebraço no cotovelo. Saída: src/zmodel.js (geometrias em base64).
# Correr: /tmp/bl/bin/python blender/zombie.py [--preview]
import bpy, bmesh, math, sys, json, base64, struct, os
import numpy as np

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'zmodel.js')
PREV = '--preview' in sys.argv
rng = np.random.default_rng(13)

def srgb(h):  # cor do jogo (hex sRGB) em 0..1 sRGB
    return np.array([(h >> 16) & 255, (h >> 8) & 255, h & 255], float) / 255.0

SKIN, SKIN_D, TOP, LEGS, SHOES, HAIR, BLOOD, EYE, SLEEVE = map(srgb, [0x8f9a7e, 0x5f6a52, 0x8a8274, 0x3a3d44, 0x26221e, 0x2a2520, 0x5a0e0b, 0xd8d0a0, 0x9a948a])

# ruído 3D suave e determinístico (para manchas, rasgões e pele)
_P = rng.permutation(256); _P = np.concatenate([_P, _P]); _G = rng.normal(size=(256, 3)); _G /= np.linalg.norm(_G, axis=1)[:, None]
def noise(p):
    p = np.asarray(p, float); i = np.floor(p).astype(int); f = p - i; u = f * f * (3 - 2 * f); r = 0.0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                h = _P[(_P[(_P[(i[0] + dx) & 255] + i[1] + dy) & 255] + i[2] + dz) & 255]
                w = (u[0] if dx else 1 - u[0]) * (u[1] if dy else 1 - u[1]) * (u[2] if dz else 1 - u[2])
                r += w * np.dot(_G[h], f - np.array([dx, dy, dz]))
    return r
def fbm(p, o=3):
    a, s, t = 0.5, 1.0, 0.0
    for _ in range(o): t += a * noise(np.asarray(p) * s); a *= 0.5; s *= 2.03
    return t

# ---------- construção de malhas (em coordenadas do jogo) ----------
def loft(rings, seg=12, axis='y', cap0=True, cap1=True):
    """rings: (t, rx, rr, c1, c2) ao longo do eixo; rx = raio em X, rr = raio no outro eixo; (c1, c2) = centro deslocado."""
    V, F = [], []
    for (t, rx, rr, c1, c2) in rings:
        for k in range(seg):
            a = 2 * math.pi * k / seg; x = c1 + rx * math.cos(a); o = c2 + rr * math.sin(a)
            V.append((x, t, o) if axis == 'y' else (x, o, t))
    n = len(rings)
    for r in range(n - 1):
        for k in range(seg):
            a, b = r * seg + k, r * seg + (k + 1) % seg; c, d = a + seg, b + seg
            F.append((a, b, d, c) if axis == 'y' else (a, c, d, b))
    def cap(r, dirn):
        t, rx, rr, c1, c2 = rings[r]; t2 = t + dirn * min(rx, rr) * 0.55
        V.append((c1, t2, c2) if axis == 'y' else (c1, c2, t2)); ci = len(V) - 1
        for k in range(seg):
            a, b = r * seg + k, r * seg + (k + 1) % seg
            F.append((ci, b, a) if (dirn > 0) == (axis == 'y') else (ci, a, b))
    if cap0: cap(0, 1 if rings[0][0] > rings[-1][0] else -1)
    if cap1: cap(n - 1, -1 if rings[0][0] > rings[-1][0] else 1)
    return V, F

def ellipsoid(cx, cy, cz, rx, ry, rz, ws=16, hs=10):
    V, F = [], []
    for j in range(1, hs):
        th = math.pi * j / hs
        for k in range(ws):
            ph = 2 * math.pi * k / ws; V.append((cx + rx * math.sin(th) * math.cos(ph), cy + ry * math.cos(th), cz + rz * math.sin(th) * math.sin(ph)))
    top = len(V); V.append((cx, cy + ry, cz)); bot = len(V); V.append((cx, cy - ry, cz))
    for j in range(hs - 2):
        for k in range(ws):
            a, b = j * ws + k, j * ws + (k + 1) % ws; F.append((a, a + ws, b + ws, b))
    for k in range(ws):
        F.append((top, k, (k + 1) % ws)); a = (hs - 2) * ws; F.append((bot, a + (k + 1) % ws, a + k))
    return V, F

class Part:
    def __init__(s, name): s.name, s.V, s.F, s.tag = name, [], [], []
    def add(s, VF, tag):
        V, F = VF; o = len(s.V); s.V += [tuple(v) for v in V]; s.F += [tuple(i + o for i in f) for f in F]; s.tag += [tag] * len(V); return s

def to_blender(p):
    me = bpy.data.meshes.new(p.name); me.from_pydata(p.V, [], p.F); me.validate(); me.update()
    ob = bpy.data.objects.new(p.name, me); bpy.context.scene.collection.objects.link(ob)
    # normais viradas para fora (os lofts e as tampas podem vir trocados)
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    for poly in me.polygons: poly.use_smooth = True
    me.update(); return ob

# ---------- as partes ----------
def thigh(side):
    p = Part('thigh' + ('L' if side < 0 else 'R'))
    p.add(loft([(0.07, 0.075, 0.075, 0, 0), (0.0, 0.106, 0.104, 0, 0), (-0.1, 0.1, 0.1, 0, 0.005), (-0.24, 0.086, 0.09, 0, 0.008), (-0.37, 0.072, 0.076, 0, 0.004), (-0.44, 0.076, 0.078, 0, 0.006), (-0.5, 0.055, 0.058, 0, 0)], seg=14), 'pants')
    return p

def shin():
    p = Part('shin')
    p.add(loft([(0.04, 0.06, 0.062, 0, 0), (0.0, 0.08, 0.082, 0, 0), (-0.09, 0.081, 0.088, 0, -0.008), (-0.21, 0.066, 0.07, 0, -0.004), (-0.33, 0.05, 0.054, 0, 0), (-0.4, 0.052, 0.056, 0, 0.0)], seg=12), 'pants')
    # sapato: ao longo de Z (calcanhar → biqueira); a sola fica plana no chão
    p.add(loft([(-0.075, 0.046, 0.034, 0, -0.44), (-0.05, 0.056, 0.05, 0, -0.43), (0.02, 0.06, 0.056, 0, -0.425), (0.1, 0.057, 0.042, 0, -0.44), (0.165, 0.048, 0.032, 0, -0.448), (0.205, 0.028, 0.02, 0, -0.455)], seg=12, axis='z'), 'shoe')
    return p

def upper():
    p = Part('upper')
    p.add(loft([(0.05, 0.05, 0.05, 0, 0), (0.0, 0.077, 0.072, 0, 0), (-0.09, 0.066, 0.062, 0, 0.004), (-0.2, 0.056, 0.054, 0, 0), (-0.3, 0.05, 0.048, 0, 0), (-0.34, 0.032, 0.03, 0, 0)], seg=12), 'sleeve')
    return p

def fore():
    p = Part('fore')
    p.add(loft([(0.03, 0.04, 0.038, 0, 0), (0.0, 0.054, 0.05, 0, 0), (-0.07, 0.05, 0.046, 0, 0.003), (-0.19, 0.038, 0.034, 0, 0.002), (-0.27, 0.03, 0.024, 0, 0), (-0.29, 0.032, 0.022, 0, 0.002)], seg=10), 'skin')
    p.add(loft([(-0.28, 0.036, 0.019, 0, 0.004), (-0.31, 0.048, 0.022, 0, 0.006), (-0.35, 0.05, 0.02, 0, 0.01), (-0.365, 0.045, 0.017, 0, 0.012)], seg=10), 'skin')  # palma
    # dedos em garra: descem e dobram para a frente; polegar de lado
    for i, x in enumerate((-0.034, -0.012, 0.012, 0.034)):
        L = 1.0 - 0.06 * abs(i - 1.5)
        p.add(loft([(-0.355, 0.011, 0.011, x, 0.012), (-0.39 * L, 0.0105, 0.0105, x * 1.05, 0.022), (-0.42 * L, 0.009, 0.009, x * 1.08, 0.045), (-0.432 * L, 0.007, 0.007, x * 1.1, 0.065)], seg=6), 'skin')
    p.add(loft([(-0.3, 0.01, 0.01, 0.0, 0.025), (-0.33, 0.009, 0.009, 0.0, 0.04), (-0.35, 0.007, 0.007, 0.0, 0.05)], seg=6), 'skin')
    return p

def torso():
    p = Part('torso')
    # anca, cintura magra, costelas, peito e ombros (corcunda: costas um pouco para trás)
    R = [(-0.04, 0.16, 0.1, 0, 0), (0.02, 0.18, 0.115, 0, 0), (0.09, 0.19, 0.118, 0, 0.002), (0.15, 0.19, 0.116, 0, 0.004), (0.21, 0.178, 0.106, 0, 0.002), (0.27, 0.176, 0.104, 0, 0.0), (0.33, 0.19, 0.11, 0, 0.004), (0.4, 0.206, 0.116, 0, 0.004), (0.47, 0.222, 0.12, 0, 0.0),
         (0.54, 0.235, 0.12, 0, -0.008), (0.59, 0.238, 0.116, 0, -0.014), (0.63, 0.215, 0.108, 0, -0.02), (0.66, 0.17, 0.094, 0, -0.02), (0.69, 0.1, 0.076, 0, -0.012), (0.735, 0.058, 0.06, 0, 0.0), (0.79, 0.052, 0.055, 0, 0.005)]
    p.add(loft(R, seg=24), 'torso')
    return p

def head():
    p = Part('head')
    V, F = ellipsoid(0, 0.152, 0.0, 0.118, 0.142, 0.13, ws=30, hs=20)
    V = [list(v) for v in V]
    def bump(v, c, r, d, sx=1, sy=1, sz=1):  # empurra o vértice para fora (d>0) ou para dentro (d<0), com queda suave
        dx, dy, dz = (v[0] - c[0]) / sx, (v[1] - c[1]) / sy, (v[2] - c[2]) / sz; q = (dx * dx + dy * dy + dz * dz) / (r * r)
        if q > 4: return 0
        return d * math.exp(-q * 1.6)
    for v in V:
        n = np.array([v[0], (v[1] - 0.15) * 0.85, v[2]]); n /= (np.linalg.norm(n) + 1e-9)
        d = 0.0
        for s in (-1, 1):
            d += bump(v, (s * 0.04, 0.165, 0.11), 0.026, -0.02)          # órbitas fundas
            d += bump(v, (s * 0.04, 0.198, 0.105), 0.03, 0.006, sx=1.4)   # arcada da sobrancelha
            d += bump(v, (s * 0.07, 0.125, 0.085), 0.028, 0.008)          # maçãs do rosto
            d += bump(v, (s * 0.07, 0.085, 0.07), 0.03, -0.012)           # bochechas encovadas
            d += bump(v, (s * 0.103, 0.145, -0.005), 0.022, 0.012, sy=1.5) # orelhas
        d += bump(v, (0, 0.135, 0.125), 0.018, 0.012, sy=1.6)             # nariz
        d += bump(v, (0, 0.06, 0.09), 0.03, 0.012, sx=1.6)                 # queixo para a frente
        d += bump(v, (0, 0.085, 0.112), 0.02, -0.01, sx=1.8)               # boca aberta (fenda)
        if v[1] < 0.07: v[0] *= 0.85; v[2] *= 0.93                         # maxilar mais estreito em baixo
        v[0] += n[0] * d; v[1] += n[1] * d; v[2] += n[2] * d
    p.add((V, F), 'head')
    for s in (-1, 1): p.add(ellipsoid(s * 0.04, 0.165, 0.094, 0.013, 0.012, 0.009, ws=10, hs=6), 'eye')  # olhos baços no fundo das órbitas
    return p

PARTS = [torso(), head(), thigh(-1), thigh(1), shin(), upper(), fore()]

# camisa rasgada à frente (a mesma regra dá a cor e afunda a pele, para a sombra de canto marcar a borda do rasgão)
def torn(x, y, z): return z > 0.02 and 0.18 < y < 0.6 and fbm((x * 7 + 1, y * 7, z * 7), 3) + (0.28 if 0.2 < y < 0.46 else -0.1) > 0.26
def ribs(y): return max(0.0, math.sin((y - 0.3) * 100)) if 0.3 < y < 0.52 else 0.0
# ---------- cores por vértice ----------
def mix(a, b, t): return a + (b - a) * t
def vcolor(part, tag, v, nrm):
    x, y, z = v; ns = fbm((x * 9 + 3, y * 9, z * 9 - 2), 3); g = fbm((x * 30, y * 30 + 7, z * 30), 2) # manchas grandes e grão
    def grime(c, k=0.18): return c * (1 - k * max(0, ns + 0.25)) * (1 + 0.08 * g)
    if tag == 'eye': return EYE * 0.95
    if tag == 'shoe': return grime(SHOES * (0.6 if y < -0.452 else 1.0))
    if tag == 'pants':
        c = grime(LEGS)
        if part.name.startswith('thigh') and fbm((x * 14 + (5 if part.name.endswith('R') else 0), y * 14, z * 14), 3) > 0.22 and z > 0: c = grime(SKIN) * 0.85  # rasgão na perna
        if fbm((x * 6, y * 6 + 2, z * 6), 2) > 0.3: c = mix(c, BLOOD * 0.8, 0.6)
        return c
    if tag == 'sleeve':
        edge = -0.17 + 0.05 * fbm((x * 20, 0, z * 20), 2)  # manga rasgada a meio do braço
        if y < edge: return grime(SKIN)
        return grime(SLEEVE * (0.82 if y > 0.02 else 1))
    if tag == 'skin':
        c = grime(SKIN)
        if y < -0.39: c = mix(c, np.array([0.22, 0.2, 0.16]), 0.6)  # pontas dos dedos sujas (unhas)
        if fbm((x * 8, y * 8 + 5, z * 8), 2) > 0.28: c = mix(c, BLOOD, 0.55)
        return c
    if tag == 'torso':
        if y > 0.675: return grime(SKIN)  # pescoço
        if y < 0.125: return grime(LEGS)  # calças
        if y < 0.168: return srgb(0x2a2623)  # cinto
        c = grime(TOP)
        if y > 0.64: c = c * 0.75  # gola
        # camisa rasgada à frente: aparece a barriga e as costelas
        if torn(x, y, z):
            c = grime(SKIN) * (0.8 + 0.25 * ribs(y))  # pele por baixo; as costelas mais claras
        if fbm((x * 5 + 9, y * 5, z * 5), 2) > 0.26: c = mix(c, BLOOD, 0.7)
        return c
    if tag == 'head':
        c = grime(SKIN, 0.25)
        for s in (-1, 1):
            if math.hypot(x - s * 0.04, y - 0.165) < 0.03 and z > 0.07: c = c * 0.35  # órbitas escuras
        if abs(y - 0.087) < 0.009 and z > 0.08 and abs(x) < 0.04: c = np.array([0.16, 0.04, 0.03])  # boca
        if abs(y - 0.097) < 0.004 and z > 0.09 and abs(x) < 0.032: c = np.array([0.62, 0.58, 0.46])  # dentes
        if y > 0.19 and z < 0.09 and fbm((x * 16, y * 16, z * 16), 2) > -0.12: c = grime(HAIR)  # cabelo ralo
        if fbm((x * 11 + 2, y * 11, z * 11), 2) > 0.3: c = mix(c, BLOOD, 0.6)
        return c
    return SKIN

# ---------- Blender: cena, AO, exportação ----------
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 96
W = bpy.data.worlds.new('w'); sc.world = W; W.light_settings.distance = 0.09  # AO: só os cantos próximos (sovacos, órbitas, dobras)
mat = bpy.data.materials.new('m'); mat.use_nodes = True

def b64(arr): return base64.b64encode(arr.tobytes()).decode()

out = {}
objs = []
for p in PARTS:
    ob = to_blender(p); ob.data.materials.append(mat); objs.append((p, ob))
    me = ob.data
    # pele: pequeno relevo irregular (rugas e magreza); só na pele, para a roupa ficar lisa
    for i, v in enumerate(me.vertices):
        co = v.co
        if p.tag[i] in ('skin', 'head'): v.co = co + v.normal * 0.0035 * fbm((co.x * 40, co.y * 40, co.z * 40), 2)
        elif p.tag[i] == 'torso' and torn(co.x, co.y, co.z): v.co = co + v.normal * (-0.009 + 0.006 * ribs(co.y))  # barriga e costelas por baixo da camisa
    me.update()
    ca = me.color_attributes.new('ao', 'FLOAT_COLOR', 'POINT'); me.color_attributes.active_color = ca
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    for _, o2 in objs[:-1]: o2.hide_render = True  # só a própria parte faz sombra (estão todas na origem)
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
    ao = np.array([ca.data[i].color[0] for i in range(len(me.vertices))])
    # junta: posição, normal suave, cor (base × sombra de canto)
    me.calc_loop_triangles()
    P = np.array([v.co[:] for v in me.vertices], np.float32); N = np.array([v.normal[:] for v in me.vertices], np.float32)
    C = np.array([vcolor(p, p.tag[i], P[i], N[i]) * (0.5 + 0.5 * ao[i] ** 0.8) for i in range(len(P))])
    C = np.clip(C, 0, 1)
    I = np.array([t.vertices[:] for t in me.loop_triangles], np.uint16).ravel()
    q = np.clip(np.round(P / 0.9 * 32767), -32767, 32767).astype(np.int16)  # posição: ±0,9 m em 16 bits
    nq = np.clip(np.round(N * 127), -127, 127).astype(np.int8)
    cq = np.round(C * 255).astype(np.uint8)
    out[p.name] = {'n': len(P), 'p': b64(q), 'nm': b64(nq), 'c': b64(cq), 'i': b64(I)}
    print(p.name, 'vértices', len(P), 'triângulos', len(I) // 3)

js = '// gerado por blender/zombie.py (Blender, sem ecrã): partes do zombie com cores por vértice e sombra de canto já calculada. Não editar à mão.\n'
js += 'export const ZM = ' + json.dumps(out) + ';\n'
open(OUT, 'w').write(js); print('escrito', OUT, len(js) // 1024, 'KB')

if PREV:  # imagem de controlo: o zombie montado de frente e de lado
    from mathutils import Matrix, Euler
    place = {'torso': (0, 0.87, 0), 'head': (0, 0.87 + 0.74, 0.02), 'thighL': (-0.11, 0.87, 0), 'thighR': (0.11, 0.87, 0)}
    for p, ob in objs:
        ob.hide_render = False
        if p.name in place: ob.location = place[p.name]
    def dup(name, loc):
        o = [ob for p, ob in objs if p.name == name][0]; c = o.copy(); c.location = loc; sc.collection.objects.link(c); return c
    for p, ob in objs:
        if p.name == 'shin': ob.location = (-0.11, 0.87 - 0.44, 0); dup('shin', (0.11, 0.43, 0))
        if p.name == 'upper': ob.location = (-0.27, 1.37, 0.02); dup('upper', (0.27, 1.37, 0.02))
        if p.name == 'fore': ob.location = (-0.27, 1.07, 0.02); dup('fore', (0.27, 1.07, 0.02))
    for o in sc.objects: o.rotation_euler = (math.pi / 2, 0, 0) if o.type == 'MESH' else o.rotation_euler; o.location = (o.location[0], -o.location[2], o.location[1]) if o.type == 'MESH' else o.location
    # material de controlo: mostra a cor por vértice
    m2 = bpy.data.materials.new('prev'); m2.use_nodes = True; nt = m2.node_tree; bsdf = nt.nodes['Principled BSDF']; at = nt.nodes.new('ShaderNodeVertexColor'); at.layer_name = 'col'; nt.links.new(at.outputs['Color'], bsdf.inputs['Base Color']); bsdf.inputs['Roughness'].default_value = 0.8
    for p, ob in objs:
        me = ob.data; ca = me.color_attributes.new('col', 'FLOAT_COLOR', 'POINT')
        P = [v.co for v in me.vertices]
        aoA = me.color_attributes['ao']
        for i in range(len(P)):
            c = vcolor(p, p.tag[i], np.array(P[i][:]), None) * (0.5 + 0.5 * aoA.data[i].color[0] ** 0.8); ca.data[i].color = (*(np.clip(c, 0, 1) ** 2.2), 1)
        me.materials.clear(); me.materials.append(m2)
    W.use_nodes = True; W.node_tree.nodes['Background'].inputs[0].default_value = (0.6, 0.62, 0.66, 1); W.node_tree.nodes['Background'].inputs[1].default_value = 1.0
    L = bpy.data.lights.new('sun', 'SUN'); L.energy = 3; lo = bpy.data.objects.new('sun', L); sc.collection.objects.link(lo); lo.rotation_euler = (0.7, 0.2, 0.6)
    cam = bpy.data.cameras.new('c'); cam.lens = 60; co = bpy.data.objects.new('c', cam); sc.collection.objects.link(co); sc.camera = co
    sc.render.resolution_x, sc.render.resolution_y = 560, 720; sc.cycles.samples = 48
    for nm, loc, rot in [('frente', (0.0, -3.6, 1.0), (math.pi / 2, 0, 0)), ('lado', (3.2, -1.6, 1.15), (math.pi / 2 - 0.05, 0, math.radians(63))), ('cara', (0.0, -1.0, 1.72), (math.pi / 2, 0, 0))]:
        co.location = loc; co.rotation_euler = rot; cam.lens = 60 if nm != 'cara' else 85
        sc.render.filepath = f'/tmp/zprev-{nm}.png'; bpy.ops.render.render(write_still=True)
