"""
Terreno da Ilha do Coqueiro, gerado no Blender à volta das casas (docs/BLENDER-MAPAS.md).

    "C:\\Program Files\\Blender Foundation\\Blender 5.3\\blender.exe" -b --factory-startup --python blender/ilha_terreno.py

Importa blender/ilha-casas.glb (as casas exportadas do jogo), cria o terreno (ilha com costa
irregular, praias, ilhotas em falésia, montanha com carreiros escavados e o vulcão ao fundo), a
ponte de madeira sobre a baía, e grava blender/ilha.blend e blender/ilha.glb. Depois:
    npm run mapa -- importar ilha

As alturas debaixo dos caminhos são as das casas (o jogo põe as casas a essa altura); longe dos
caminhos o terreno é livre. Pode-se continuar à mão no ilha.blend (esculpir, pintar, pôr coisas).
"""
import json
import math
import os
import random

import bpy
import bmesh
from mathutils import Vector, noise

HERE = os.path.dirname(os.path.abspath(__file__))
CASAS = os.path.join(HERE, 'ilha-casas.glb')
BLEND = os.path.join(HERE, 'ilha.blend')
GLB = os.path.join(HERE, 'ilha.glb')

STEP = 0.6  # resolução do terreno (m)
SEA_FLOOR = -3.0
WATER = -0.6  # o mar do jogo

# ── Cena limpa e casas ────────────────────────────────────────────────

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=CASAS)
casas = {o.name.split('.')[0]: o for o in bpy.context.scene.objects if o.name.startswith('casa_')}
mapa = next(o for o in bpy.context.scene.objects if o.name.startswith('mapa'))
rules = json.loads(mapa['regras'])
tunnels = {(t['from'], t['to']) for t in rules.get('tunnels', [])}


def pos(name):
    p = casas[name].location
    return Vector((p.x, p.y, p.z))


# Segmentos do caminho (de casa a casa), sem os túneis. Os da ponte ficam à parte (por cima da água).
segs, bridge = [], []
for name, o in casas.items():
    for nxt in [s.strip() for s in str(o.get('seguinte', '')).split(',') if s.strip()]:
        if (name, nxt) in tunnels or nxt not in casas:
            continue
        a, b = pos(name), pos(nxt)
        if o.get('zona') == 'bridge' or casas[nxt].get('zona') == 'bridge':
            bridge.append((a, b))
        else:
            segs.append((a, b))


def seg_dist(px, py, a, b):
    """Distância (no plano) ao segmento a→b e altura do caminho nesse ponto."""
    dx, dy = b.x - a.x, b.y - a.y
    l2 = dx * dx + dy * dy
    t = 0.0 if l2 == 0 else max(0.0, min(1.0, ((px - a.x) * dx + (py - a.y) * dy) / l2))
    qx, qy = a.x + dx * t, a.y + dy * t
    return math.hypot(px - qx, py - qy), a.z + (b.z - a.z) * t


def smooth(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def fbm(x, y, octaves=4, scale=0.05):
    return noise.fractal(Vector((x * scale, y * scale, 0.0)), 0.5, 2.0, octaves)


# Ilhotas (planaltos) e montanhas vêm das regras (coordenadas do jogo: z do jogo = −y do Blender).
plateaus = [(p['x'], -p['z'], p['r'], p['y']) for p in rules.get('plateaus', [])]
mountains = [(m['x'], -m['z'], m['r'], m['h']) for m in rules.get('mountains', [])]
# Vulcão ao fundo (só cenário), a norte da encosta: fecha o horizonte.
VOLCANO = (0.0, 72.0, 34.0, 32.0)

# ── Alturas ──────────────────────────────────────────────────────────

xs = [p.x for p in (pos(n) for n in casas)]
ys = [p.y for p in (pos(n) for n in casas)]
X0, X1 = min(xs) - 30, max(xs) + 30
Y0, Y1 = min(ys) - 22, VOLCANO[1] + VOLCANO[2] + 4
NX = int((X1 - X0) / STEP) + 1
NY = int((Y1 - Y0) / STEP) + 1


def height_and_kind(x, y):
    # Distância ao caminho mais próximo (e a altura dele).
    best, path_h = 1e9, 0.0
    for a, b in segs:
        if abs(x - a.x) > 14 and abs(x - b.x) > 14:
            continue
        d, h = seg_dist(x, y, a, b)
        if d < best:
            best, path_h = d, h
    # Costa irregular: a terra vai até ~6 m dos caminhos, com o contorno torcido pelo ruído.
    coast = best - 6.5 + fbm(x, y, 3, 0.06) * 5.0
    h = SEA_FLOOR + (0.0 - SEA_FLOOR) * (1 - smooth(0.0, 7.0, coast))
    # Colinas suaves longe dos caminhos.
    h += max(0.0, fbm(x + 40, y, 4, 0.04)) * 2.2 * smooth(3.0, 10.0, best) * (1 - smooth(-2.0, 2.0, coast))
    kind = 'grass'
    # Ilhotas: planalto com falésia.
    for cx, cy, r, ph in plateaus:
        d = math.hypot(x - cx, y - cy) + fbm(x, y, 2, 0.3) * 0.8
        if d < r + 1.5:
            k = 1 - smooth(r - 0.4, r + 1.2, d)
            if k > 0.02 and h < ph * k:
                h = ph * k
                if 0.05 < k < 0.95:
                    kind = 'rock'
    # Montanhas: cone com cristas (ruído), mais íngreme em cima.
    for cx, cy, r, mh in mountains:
        d = math.hypot(x - cx, y - cy)
        if d < r * 1.15:
            t = max(0.0, 1 - d / (r * 1.1))
            ridge = 1 - abs(noise.noise(Vector((x * 0.18, y * 0.18, 3.0))))
            # Mais alta e com pico do que o cone das casas: os carreiros ficam escavados na encosta.
            mh_here = mh * 1.7 * t ** 1.35 + ridge * 2.2 * t * (1 - t) * 2
            if mh_here > h:
                h = mh_here
                kind = 'rock' if t > 0.55 else 'grass'
    # Vulcão ao fundo, com cratera.
    cx, cy, r, vh = VOLCANO
    d = math.hypot(x - cx, y - cy) + fbm(x, y, 3, 0.08) * 3
    if d < r:
        t = 1 - d / r
        vol = vh * min(1.0, t ** 1.6 * 1.25) - (smooth(0.82, 0.95, t) * 9 if t > 0.82 else 0)
        if vol > h:
            h = vol
            kind = 'volcano'
    # Debaixo e à volta dos caminhos, o terreno fica à altura das casas (carreiros escavados).
    if best < 3.2:
        k = smooth(1.7, 3.2, best)
        h = path_h - 0.06 + (h - path_h + 0.06) * k
        if best < 1.0:
            kind = 'path'
    # Areia só junto ao mar (praias), não na ilha toda.
    if kind == 'grass' and coast > -2.0 and h < 0.8:
        kind = 'sand'
    return h, kind


COLORS = {
    'grass': (0.36, 0.70, 0.25),
    'sand': (0.93, 0.82, 0.55),
    'path': (0.80, 0.64, 0.42),
    'rock': (0.50, 0.50, 0.53),
    'volcano': (0.33, 0.24, 0.21),
    'seabed': (0.78, 0.70, 0.50),
}

heights, kinds = [], []
for j in range(NY):
    y = Y0 + j * STEP
    for i in range(NX):
        h, k = height_and_kind(X0 + i * STEP, y)
        heights.append(h)
        kinds.append(k)

# ── Malha ────────────────────────────────────────────────────────────

mesh = bpy.data.meshes.new('terreno')
verts = [(X0 + (v % NX) * STEP, Y0 + (v // NX) * STEP, heights[v]) for v in range(NX * NY)]
faces = []
for j in range(NY - 1):
    for i in range(NX - 1):
        a = j * NX + i
        faces.append((a, a + 1, a + NX + 1, a + NX))
mesh.from_pydata(verts, [], faces)
mesh.update()

# Cor por vértice: tipo de chão, mais rocha nas encostas íngremes e pedra/terra a variar com ruído.
col = mesh.color_attributes.new('Cor', 'FLOAT_COLOR', 'POINT')
rnd = random.Random(7)
rgb = [None] * (NX * NY)
for v in range(NX * NY):
    x, y = verts[v][0], verts[v][1]
    h = heights[v]
    kind = kinds[v]
    i, j = v % NX, v // NX
    hx = heights[v + 1] - heights[v - 1] if 0 < i < NX - 1 else 0
    hy = heights[v + NX] - heights[v - NX] if 0 < j < NY - 1 else 0
    slope = math.hypot(hx, hy) / (2 * STEP)
    if h < WATER - 0.3:
        kind = 'seabed'
    elif kind in ('grass', 'sand') and slope > 1.1:
        kind = 'rock'
    c = COLORS[kind]
    var = 1 + fbm(x * 3, y * 3, 2, 0.5) * 0.12 + (rnd.random() - 0.5) * 0.04
    rgb[v] = [min(1.0, ch * var) for ch in c]

# Transições suaves entre relva, areia e rocha (média com os vizinhos, duas vezes).
for _ in range(2):
    nxt = list(rgb)
    for j in range(1, NY - 1):
        for i in range(1, NX - 1):
            v = j * NX + i
            nxt[v] = [(rgb[v][k] * 2 + rgb[v - 1][k] + rgb[v + 1][k] + rgb[v - NX][k] + rgb[v + NX][k]) / 6 for k in range(3)]
    rgb = nxt
for v in range(NX * NY):
    # As cores estão em sRGB; o atributo de cor é linear.
    col.data[v].color = tuple(ch ** 2.2 for ch in rgb[v]) + (1.0,)

terrain = bpy.data.objects.new('terreno', mesh)
bpy.context.scene.collection.objects.link(terrain)
for p in mesh.polygons:
    p.use_smooth = True

mat = bpy.data.materials.new('terreno')
mat.use_nodes = True
nt = mat.node_tree
bsdf = nt.nodes['Principled BSDF']
attr = nt.nodes.new('ShaderNodeVertexColor')
attr.layer_name = 'Cor'
nt.links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = 0.95
mesh.materials.append(mat)

# ── Ponte de madeira sobre a baía ─────────────────────────────────────

wood = bpy.data.materials.new('madeira')
wood.use_nodes = True
wood.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.45, 0.28, 0.14, 1)
bm = bmesh.new()
for a, b in bridge:
    d = b - a
    length = d.length
    ang = math.atan2(d.y, d.x)
    n = max(1, int(length / 0.45))
    for k in range(n):
        c = a + d * ((k + 0.5) / n)
        m = bmesh.ops.create_cube(bm, size=1.0)
        vs = m['verts']
        bmesh.ops.scale(bm, vec=(0.32, 2.0, 0.12), verts=vs)
        bmesh.ops.rotate(bm, verts=vs, cent=(0, 0, 0), matrix=__import__('mathutils').Matrix.Rotation(ang, 3, 'Z'))
        bmesh.ops.translate(bm, verts=vs, vec=(c.x, c.y, c.z - 0.1))
    # Estacas a cada ponta do segmento.
    for side in (-1, 1):
        off = Vector((-math.sin(ang), math.cos(ang), 0)) * side * 0.95
        m = bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=0.12, radius2=0.12, depth=3.0)
        bmesh.ops.translate(bm, verts=m['verts'], vec=(a.x + off.x, a.y + off.y, a.z - 1.4))
bridge_mesh = bpy.data.meshes.new('ponte')
bm.to_mesh(bridge_mesh)
bm.free()
bridge_mesh.materials.append(wood)
bridge_obj = bpy.data.objects.new('ponte', bridge_mesh)
bpy.context.scene.collection.objects.link(bridge_obj)

# ── Gravar e exportar ─────────────────────────────────────────────────

bpy.ops.wm.save_as_mainfile(filepath=BLEND)
bpy.ops.export_scene.gltf(
    filepath=GLB,
    export_format='GLB',
    export_extras=True,
    export_yup=True,
    export_apply=True,
)
print(f'Feito: {NX}x{NY} vértices; {BLEND}; {GLB}')
