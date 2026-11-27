# Ferramentas para modelar adereços do Kurogane no Blender (sem ecrã), cozer a oclusão (AO) nos vértices e exportar.
# Coordenadas do jogo: x, y para cima, z para a frente. No Blender: (x, -z, y).
import bpy, bmesh, math, json
from mathutils import Matrix, Vector, Euler

G2B = Matrix.Rotation(math.radians(90), 4, 'X')
B2G = G2B.inverted()
PARTS = []

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    PARTS.clear()
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 64
    w = bpy.data.worlds.new('w'); sc.world = w; w.light_settings.distance = 0.55
    # chão para a sombra de contacto (não se exporta)
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=20)
    me = bpy.data.meshes.new('chao'); bm.to_mesh(me); bm.free(); ob = bpy.data.objects.new('chao', me); bpy.context.collection.objects.link(ob)
    ob.data.materials.append(bpy.data.materials.new('m0'))

def xf(x=0, y=0, z=0, ry=0, rx=0, rz=0, sx=1, sy=1, sz=1):
    # como o mat4 do jogo: Euler YXZ, depois escala
    R = Euler((rx, ry, rz), 'YXZ').to_matrix().to_4x4()
    return Matrix.Translation((x, y, z)) @ R @ Matrix.Diagonal((sx, sy, sz, 1))

class Part:
    """uma peça = uma malha com material do jogo ('v', 'm', 'lit'), cor (hex) e se leva a cor do sítio (tint)"""
    def __init__(s, mat='v', col=0xffffff, tint=False, angle=35, lit=None, L=0, shade=1.0):
        s.bm = bmesh.new(); s.mat = mat; s.col = col; s.tint = tint; s.angle = angle; s.lit = lit; s.L = L; s.shade = shade
        PARTS.append(s)
    def _add(s, bm2, M):
        bmesh.ops.transform(bm2, matrix=M, verts=bm2.verts)
        me = bpy.data.meshes.new('t'); bm2.to_mesh(me); bm2.free(); s.bm.from_mesh(me); bpy.data.meshes.remove(me)
        return s
    def box(s, w, h, d, x=0, y=0, z=0, ry=0, rx=0, rz=0, bev=0.0, seg=1, taper=None):
        bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1)
        bmesh.ops.scale(bm, vec=(w, h, d), verts=bm.verts)
        if taper:  # (sx, sz) da face de cima
            for v in bm.verts:
                if v.co.y > 0: v.co.x *= taper[0]; v.co.z *= taper[1]
        if bev > 0: bmesh.ops.bevel(bm, geom=list(bm.edges) + list(bm.verts), offset=min(bev, min(w, h, d) * 0.45), segments=seg, affect='EDGES', profile=0.5, clamp_overlap=True)
        return s._add(bm, xf(x, y, z, ry, rx, rz))
    def cyl(s, r1, r2, h, n=12, x=0, y=0, z=0, ry=0, rx=0, rz=0, bev=0.0, seg=1, caps=True):
        bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=n, radius1=r1, radius2=r2, depth=h)
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(-90), 3, 'X'))
        if bev > 0: bmesh.ops.bevel(bm, geom=[e for e in bm.edges if len(e.link_faces) == 2 and e.calc_face_angle(0) > 0.6], offset=bev, segments=seg, affect='EDGES', profile=0.5, clamp_overlap=True)
        return s._add(bm, xf(x, y, z, ry, rx, rz))
    def lathe(s, prof, n=16, x=0, y=0, z=0, ry=0, rx=0, rz=0, close=True):
        """perfil [(raio, altura), ...] de baixo para cima, roda à volta do eixo y"""
        bm = bmesh.new(); vs = []
        for i in range(n):
            a = 2 * math.pi * i / n; vs.append([bm.verts.new((r * math.cos(a), yy, -r * math.sin(a))) for r, yy in prof])
        m = len(prof)
        for i in range(n):
            A, B = vs[i], vs[(i + 1) % n]
            for j in range(m - 1): bm.faces.new((A[j], B[j], B[j + 1], A[j + 1]))
        if close:
            if prof[0][0] > 1e-4: bm.faces.new([vs[i][0] for i in range(n)][::-1])
            if prof[-1][0] > 1e-4: bm.faces.new([vs[i][m - 1] for i in range(n)])
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        return s._add(bm, xf(x, y, z, ry, rx, rz))
    def torus(s, R, r, n=16, m=6, x=0, y=0, z=0, ry=0, rx=0, rz=0, arc=2 * math.pi):
        bm = bmesh.new(); full = arc >= 2 * math.pi - 1e-6; N = n if full else n + 1; rings = []
        for i in range(N):
            a = arc * i / n; c = Vector((R * math.cos(a), R * math.sin(a), 0)); rings.append([bm.verts.new(c + Vector((math.cos(a) * math.cos(b) * r, math.sin(a) * math.cos(b) * r, math.sin(b) * r))) for b in [2 * math.pi * j / m for j in range(m)]])
        for i in range(n if full else n):
            A, B = rings[i], rings[(i + 1) % N]
            for j in range(m): bm.faces.new((A[j], B[j], B[(j + 1) % m], A[(j + 1) % m]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        return s._add(bm, xf(x, y, z, ry, rx, rz))
    def tube(s, pts, r, m=6):
        """cano por pontos (x, y, z) do jogo"""
        bm = bmesh.new(); rings = []
        P = [Vector(p) for p in pts]
        for i, p in enumerate(P):
            t = (P[min(i + 1, len(P) - 1)] - P[max(i - 1, 0)]).normalized()
            u = t.cross(Vector((0, 1, 0))) if abs(t.y) < 0.9 else t.cross(Vector((1, 0, 0)))
            u.normalize(); v = t.cross(u)
            rings.append([bm.verts.new(p + (u * math.cos(2 * math.pi * j / m) + v * math.sin(2 * math.pi * j / m)) * r) for j in range(m)])
        for i in range(len(P) - 1):
            A, B = rings[i], rings[i + 1]
            for j in range(m): bm.faces.new((A[j], A[(j + 1) % m], B[(j + 1) % m], B[j]))
        bm.faces.new(rings[0][::-1]); bm.faces.new(rings[-1])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        return s._add(bm, Matrix())

def finish_parts():
    """cria os objetos: triangula, parte as arestas compridas (para a AO ter pontos onde pousar), normais por ângulo"""
    obs = []
    for i, P in enumerate(PARTS):
        bm = P.bm
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        bmesh.ops.triangulate(bm, faces=bm.faces)
        P.n0 = len(bm.faces)
        if not P.lit and P.L:
            for _ in range(2):
                long = [e for e in bm.edges if e.calc_length() > P.L]
                if not long: break
                bmesh.ops.subdivide_edges(bm, edges=long, cuts=1, use_grid_fill=False)
                bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3])
        bmesh.ops.transform(bm, matrix=G2B, verts=bm.verts)
        me = bpy.data.meshes.new('p%d' % i); bm.to_mesh(me); bm.free()
        for f in me.polygons: f.use_smooth = True
        me.set_sharp_from_angle(angle=math.radians(P.angle))
        ob = bpy.data.objects.new('p%d' % i, me); bpy.context.collection.objects.link(ob)
        ob.data.materials.append(bpy.data.materials.new('m%d' % i))
        ca = me.color_attributes.new('ao', 'FLOAT_COLOR', 'CORNER'); me.color_attributes.active_color = ca
        P.n1 = len(me.polygons); obs.append(ob)
    print('   peças:', ' '.join('%d>%d' % (P.n0, P.n1) for P in PARTS))
    return obs

def bake(obs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs: o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    sc = bpy.context.scene; sc.render.bake.target = 'VERTEX_COLORS'
    bpy.ops.object.bake(type='AO')

def lin(hexc):
    r, g, b = ((hexc >> 16) & 255) / 255, ((hexc >> 8) & 255) / 255, (hexc & 255) / 255
    f = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (f(r), f(g), f(b))

def export(name, obs, strength=0.85, out=None):
    groups = {}
    for P, ob in zip(PARTS, obs):
        me = ob.data; me.calc_loop_triangles(); cn = me.corner_normals; ao = me.color_attributes['ao'].data
        key = ('lit' if P.lit else P.mat, 1 if P.tint else 0)
        G = groups.setdefault(key, {'p': [], 'n': [], 'c': []})
        base = (P.shade,) * 3 if P.tint else (P.lit if P.lit else lin(P.col))
        for t in me.loop_triangles:
            for li in t.loops:
                v = me.vertices[me.loops[li].vertex_index].co; n = cn[li].vector
                g = B2G @ Vector((v.x, v.y, v.z)); gn = (B2G.to_3x3() @ Vector((n.x, n.y, n.z))).normalized()
                a = 1.0 if P.lit else (1 - strength + strength * ao[li].color[0])
                G['p'] += [g.x, g.y, g.z]; G['n'] += [gn.x, gn.y, gn.z]; G['c'] += [base[0] * a, base[1] * a, base[2] * a]
    parts = [{'m': k[0], 't': k[1], **v} for k, v in groups.items()]
    tris = sum(len(p['p']) // 9 for p in parts)
    json.dump({'name': name, 'parts': parts}, open(out or ('out/%s.json' % name), 'w'))
    return tris
