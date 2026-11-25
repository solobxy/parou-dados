# Biblioteca para modelar as armas no Blender (sem interface): perfis laterais extrudidos com arestas boleadas,
# cilindros, caixas, cortes (booleanos) e exportação compacta para o jogo (posições int16, normais int8, índices).
# Eixos do jogo: z para a frente (cano), y para cima, x para a direita. Metros, tamanho real.
import bpy, bmesh, math, numpy as np, base64, json, os
from mathutils import Vector, Matrix
R2 = math.pi / 2
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    global PARTS; PARTS = []
PARTS = []
MIRROR = True
class Part:
    def __init__(s, ob, col, mat, bev, seg, ang): s.ob, s.col, s.mat, s.bev, s.seg, s.ang, s.cuts = ob, col, mat, bev, seg, ang, []
def _obj(bm, name='p'):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    for p in me.polygons: p.use_smooth = True
    return ob
def _reg(bm, col, mat, bev, seg=2, ang=35, cutter=False):
    if bev and bev < 0.0011 and seg == 2: seg = 1
    import traceback; ln = traceback.extract_stack()[-3].lineno
    ob = _obj(bm, 'L%d' % ln)
    if cutter: ob.hide_render = True; ob.hide_viewport = True; return ob
    P = Part(ob, col, mat, bev, seg, ang); PARTS.append(P); return P
def _xf(bm, M):
    bmesh.ops.transform(bm, matrix=M, verts=bm.verts)
def mrot(rx=0, ry=0, rz=0): return Matrix.Rotation(ry, 4, 'Y') @ Matrix.Rotation(rx, 4, 'X') @ Matrix.Rotation(rz, 4, 'Z')
def prof(pts, w, col, mat='v', x=0.0, bev=0.0012, seg=2, ang=35, cutter=False, M=None):
    """perfil lateral (lista de (z, y)) extrudido em x com largura w, centrado em x"""
    bm = bmesh.new(); vs = [bm.verts.new((x - w / 2, y, z)) for z, y in pts]; f = bm.faces.new(vs); bm.normal_update()
    if f.normal.x > 0: f.normal_flip()
    r = bmesh.ops.extrude_face_region(bm, geom=[f]); nv = [g for g in r['geom'] if isinstance(g, bmesh.types.BMVert)]
    for v in nv: v.co.x += w
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    if M is not None: _xf(bm, M)
    return _reg(bm, col, mat, bev, seg, ang, cutter)
def profx(pts, d, col, mat='v', z=0.0, bev=0.0012, seg=2, ang=35, cutter=False, M=None):
    """perfil de frente (lista de (x, y)) extrudido em z com comprimento d (de z a z+d)"""
    bm = bmesh.new(); vs = [bm.verts.new((x, y, z)) for x, y in pts]; f = bm.faces.new(vs); bm.normal_update()
    if f.normal.z > 0: f.normal_flip()
    r = bmesh.ops.extrude_face_region(bm, geom=[f]); nv = [g for g in r['geom'] if isinstance(g, bmesh.types.BMVert)]
    for v in nv: v.co.z += d
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    if M is not None: _xf(bm, M)
    return _reg(bm, col, mat, bev, seg, ang, cutter)
def cyl(r, z0, z1, col, mat='m', y=0.0, x=0.0, seg=20, r1=None, bev=0.0008, M=None, cutter=False, axis='z'):
    bm = bmesh.new(); L = z1 - z0
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r, radius2=r if r1 is None else r1, depth=L)
    if axis == 'x': _xf(bm, Matrix.Rotation(R2, 4, 'Y'))
    elif axis == 'y': _xf(bm, Matrix.Rotation(-R2, 4, 'X'))
    _xf(bm, Matrix.Translation((x, y, (z0 + z1) / 2) if axis == 'z' else (0, 0, 0)))
    if axis != 'z': _xf(bm, Matrix.Translation((x, y, z0)))
    if M is not None: _xf(bm, M)
    return _reg(bm, col, mat, bev, 2, 35, cutter)
def cylx(r, x0, x1, y, z, col, mat='m', seg=16, bev=0.0006, cutter=False):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r, radius2=r, depth=x1 - x0)
    _xf(bm, Matrix.Rotation(R2, 4, 'Y')); _xf(bm, Matrix.Translation(((x0 + x1) / 2, y, z)))
    return _reg(bm, col, mat, bev, 1, 35, cutter)
def cyly(r, y0, y1, x, z, col, mat='m', seg=16, bev=0.0006, cutter=False, r1=None):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r, radius2=r if r1 is None else r1, depth=y1 - y0)
    _xf(bm, Matrix.Rotation(-R2, 4, 'X')); _xf(bm, Matrix.Translation((x, (y0 + y1) / 2, z)))
    return _reg(bm, col, mat, bev, 1, 35, cutter)
def box(w, h, l, x, y, z, col, mat='v', bev=0.001, M=None, cutter=False, rx=0, ry=0, rz=0):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1); _xf(bm, Matrix.Diagonal((w, h, l, 1)))
    if rx or ry or rz: _xf(bm, mrot(rx, ry, rz))
    _xf(bm, Matrix.Translation((x, y, z)))
    if M is not None: _xf(bm, M)
    return _reg(bm, col, mat, bev, 2, 35, cutter)
def sph(r, x, y, z, col, mat='m', sx=1, sy=1, sz=1, seg=16):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=max(6, seg // 2), radius=r); _xf(bm, Matrix.Diagonal((sx, sy, sz, 1))); _xf(bm, Matrix.Translation((x, y, z)))
    return _reg(bm, col, mat, 0)
def cut(part, cutter):
    part.cuts.append(cutter.ob if isinstance(cutter, Part) else cutter)
def rail(y, z0, z1, col, w=0.021, x=0.0, M=None):
    """calha picatinny: base e dentes (10 mm de passo)"""
    out = [box(w, 0.006, z1 - z0, x, y + 0.003, (z0 + z1) / 2, col, 'm', 0.0006, M)]
    z = z0 + 0.004
    while z < z1 - 0.006:
        out.append(box(w, 0.004, 0.0052, x, y + 0.008, z + 0.0026, col, 'm', 0, M)); z += 0.01
    return out
def arc(cz, cy, r, a0, a1, n=8):
    return [(cz + r * math.cos(a0 + (a1 - a0) * i / n), cy + r * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]
def bez(p0, p1, p2, n=8):
    return [((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]) for t in [i / n for i in range(n + 1)]]

def export(name, anchors, scale=1.6):
    """aplica cortes e boleados, junta por (cor, material) e escreve o JSON compacto"""
    dg = bpy.context.evaluated_depsgraph_get()
    for P in PARTS:  # boleado primeiro e cortes depois: as arestas dos cortes ficam vivas (muito menos triângulos)
        if P.bev > 0:
            m = P.ob.modifiers.new('b', 'BEVEL'); m.width = P.bev; m.segments = P.seg; m.limit_method = 'ANGLE'; m.angle_limit = math.radians(P.ang); m.harden_normals = True; m.miter_outer = 'MITER_ARC'
        for c in P.cuts:
            m = P.ob.modifiers.new('c', 'BOOLEAN'); m.operation = 'DIFFERENCE'; m.object = c; m.solver = 'FAST'
        if P.cuts:  # normais pesadas pela área: as faces grandes ficam lisas e o corte não risca o sombreado
            m = P.ob.modifiers.new('w', 'WEIGHTED_NORMAL'); m.mode = 'FACE_AREA'; m.keep_sharp = True; m.weight = 100
    dg = bpy.context.evaluated_depsgraph_get(); dg.update()
    G = {}
    ntri = 0
    for P in PARTS:
        ev = P.ob.evaluated_get(dg); me = ev.to_mesh(); me.calc_loop_triangles()
        nv, nl, nt = len(me.vertices), len(me.loops), len(me.loop_triangles)
        V = np.zeros(nv * 3); me.vertices.foreach_get('co', V); V = V.reshape(-1, 3)
        LV = np.zeros(nl, int); me.loops.foreach_get('vertex_index', LV)
        CN = np.zeros(nl * 3); me.corner_normals.foreach_get('vector', CN); CN = CN.reshape(-1, 3)
        TL = np.zeros(nt * 3, int); me.loop_triangles.foreach_get('loops', TL)
        TLr = TL.reshape(-1, 3)[:, ::-1].ravel() if MIRROR else TL  # espelho em x: o lado direito da arma real fica em −x no jogo (inverte a ordem dos vértices)
        Vm = V[LV[TLr]].copy(); Nm = CN[TLr].copy()
        if MIRROR: Vm[:, 0] *= -1; Nm[:, 0] *= -1
        g = G.setdefault((P.col, P.mat), [[], []]); g[0].append(Vm); g[1].append(Nm); ntri += nt
        if os.environ.get('PARTS'): print('  parte', P.ob.name, len(P.cuts), 'cortes', nt)
        ev.to_mesh_clear()
    out = {'g': [], 'a': anchors}
    for (col, mat), (Ps, Ns) in G.items():
        Pp = np.concatenate(Ps); Nn = np.concatenate(Ns)
        qp = np.clip(np.round(Pp / scale * 32767), -32767, 32767).astype(np.int16); qn = np.clip(np.round(Nn * 127), -127, 127).astype(np.int8)
        key = np.concatenate([qp.astype(np.int64), qn.astype(np.int64)], 1)
        uk, inv = np.unique(key, axis=0, return_inverse=True); inv = inv.ravel()
        idx = inv.astype(np.uint16 if len(uk) < 65536 else np.uint32)
        b = lambda a: base64.b64encode(np.ascontiguousarray(a).tobytes()).decode()
        out['g'].append({'c': col, 'm': mat, 'p': b(uk[:, :3].astype(np.int16)), 'n': b(uk[:, 3:].astype(np.int8)), 'i': b(idx), 'w': 4 if idx.dtype == np.uint32 else 2})
    out['s'] = scale
    print(name, 'triângulos', ntri, 'grupos', len(G))
    return out, ntri

def preview(path, views=('lado',), res=(1200, 600), dist=None):
    import mathutils
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.samples = 48; sc.cycles.device = 'CPU'; sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.film_transparent = False; wd = bpy.data.worlds.new('w'); sc.world = wd; wd.use_nodes = True; wd.node_tree.nodes['Background'].inputs[0].default_value = (0.55, 0.57, 0.6, 1); wd.node_tree.nodes['Background'].inputs[1].default_value = 0.7
    mats = {}
    def mm(col, mat):
        k = (col, mat)
        if k in mats: return mats[k]
        m = bpy.data.materials.new('m'); m.use_nodes = True; bs = m.node_tree.nodes['Principled BSDF']
        c = ((col >> 16) & 255) / 255, ((col >> 8) & 255) / 255, (col & 255) / 255
        bs.inputs['Base Color'].default_value = (c[0] ** 2.2 * 1.6, c[1] ** 2.2 * 1.6, c[2] ** 2.2 * 1.6, 1); bs.inputs['Roughness'].default_value = 0.38 if mat == 'm' else 0.7; bs.inputs['Metallic'].default_value = 0.55 if mat == 'm' else 0.0
        mats[k] = m; return m
    for P in PARTS:
        P.ob.data.materials.clear(); P.ob.data.materials.append(mm(P.col, P.mat))
    # objetos do jogo: y para cima → no Blender z para cima (rodar)
    root = bpy.data.objects.new('root', None); sc.collection.objects.link(root); root.rotation_euler = (R2, 0, 0)
    for P in PARTS: P.ob.parent = root
    for c in [o for o in sc.objects if o.hide_render]: c.parent = root
    xs = []
    for P in PARTS: xs.append(np.array([list(P.ob.matrix_world @ v.co) for v in P.ob.data.vertices[:1]]))
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3.5; sun.rotation_euler = (0.7, 0.2, 0.6); sc.collection.objects.link(sun)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
    bpy.context.view_layer.update()
    allv = np.concatenate([np.array([list(P.ob.matrix_world @ Vector(v)) for v in [(vv.co) for vv in P.ob.data.vertices]]) for P in PARTS])
    lo, hi = allv.min(0), allv.max(0); ctr = (lo + hi) / 2; L = (hi - lo).max()
    cam.data.type = 'ORTHO'; ex = hi - lo; cam.data.ortho_scale = max(ex[1], ex[2] * res[0] / res[1], ex[0]) * 1.1
    for v in views:
        if v == 'lado': cam.location = (ctr[0] + 2, ctr[1], ctr[2]); cam.rotation_euler = (R2, 0, R2)
        elif v == 'esq': cam.location = (ctr[0] - 2, ctr[1], ctr[2]); cam.rotation_euler = (R2, 0, -R2)
        elif v == 'tres': cam.data.type = 'PERSP'; cam.data.lens = 50; cam.location = (ctr[0] + L * 0.9, ctr[1] - L * 0.6, ctr[2] + L * 0.35); d = Vector(ctr) - cam.location; cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = path.replace('.png', '-' + v + '.png'); bpy.ops.render.render(write_still=True)
