"""
Vegetação e edifícios da Ilha do Coqueiro, por cima do terreno (correr depois de ilha_terreno.py).

    blender.exe -b blender/ilha.blend --python blender/ilha_cenario.py

Usa os modelos dos packs do jogo (apps/web/public/models): palmeiras, arbustos, rochas, casas da
aldeia, bancas das lojas, farol, navio… Cada modelo entra uma vez e é repetido como cópia ligada
(a mesma malha), para o .glb não crescer. Nada fica em cima dos caminhos, e as coisas altas nunca
ficam à frente das casas (do lado da câmara, −Y). Grava blender/ilha.blend e blender/ilha.glb.
"""
import json
import math
import os
import random

import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.join(HERE, '..', 'apps', 'web', 'public', 'models')
BLEND = os.path.join(HERE, 'ilha.blend')
GLB = os.path.join(HERE, 'ilha.glb')
rng = random.Random(2026)

scene = bpy.context.scene
# Recomeça o cenário (o terreno, as casas e a ponte ficam).
old = bpy.data.collections.get('cenario')
if old:
    for o in list(old.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.collections.remove(old)
cen = bpy.data.collections.new('cenario')
scene.collection.children.link(cen)

terrain = bpy.data.objects['terreno']
deps = bpy.context.evaluated_depsgraph_get()
bvh = BVHTree.FromObject(terrain, deps)
casas = {o.name.split('.')[0]: o for o in scene.objects if o.name.startswith('casa_')}
rules = json.loads(next(o for o in scene.objects if o.name.startswith('mapa'))['regras'])
tunnels = {(t['from'], t['to']) for t in rules.get('tunnels', [])}
segs = []
for name, o in casas.items():
    for nxt in [s.strip() for s in str(o.get('seguinte', '')).split(',') if s.strip()]:
        if nxt in casas and (name, nxt) not in tunnels:
            segs.append((o.location.copy(), casas[nxt].location.copy()))


def ground(x, y):
    hit = bvh.ray_cast(Vector((x, y, 200)), Vector((0, 0, -1)))
    return hit[0].z if hit[0] else None


def path_dist(x, y):
    best = 1e9
    for a, b in segs:
        dx, dy = b.x - a.x, b.y - a.y
        l2 = dx * dx + dy * dy
        t = 0 if l2 == 0 else max(0.0, min(1.0, ((x - a.x) * dx + (y - a.y) * dy) / l2))
        best = min(best, math.hypot(x - a.x - dx * t, y - a.y - dy * t))
    return best


def in_front(x, y, depth=12.0):
    """Há casas logo atrás deste ponto (do lado oposto à câmara)? Então aqui só coisas baixas."""
    return any(abs(c.location.x - x) < 4 and 0 < c.location.y - y < depth for c in casas.values())


# ── Biblioteca de modelos ─────────────────────────────────────────────

_lib = {}


def model(key, height):
    """Malha (uma só, já à escala e com a base em z=0) do modelo `key` do pack, com `height` m de altura."""
    if key in _lib:
        return _lib[key]
    path = os.path.join(MODELS, key + ('.glb' if os.path.exists(os.path.join(MODELS, key + '.glb')) else '.gltf'))
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.data = o.data.copy()
        o.data.transform(o.matrix_world)
        o.matrix_world = Matrix.Identity(4)
        o.parent = None
    for o in new:
        if o.type != 'MESH':
            bpy.data.objects.remove(o, do_unlink=True)
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    me = obj.data
    zs = [v.co.z for v in me.vertices]
    xs = [v.co.x for v in me.vertices]
    ys = [v.co.y for v in me.vertices]
    s = height / max(1e-6, max(zs) - min(zs))
    me.transform(Matrix.Translation((-(min(xs) + max(xs)) / 2, -(min(ys) + max(ys)) / 2, -min(zs))))
    me.transform(Matrix.Scale(s, 4))
    me.name = 'modelo ' + key.split('/')[-1]
    me.use_fake_user = True
    bpy.data.objects.remove(obj, do_unlink=True)
    _lib[key] = me
    return me


def place(key, x, y, height, rot=None, z=None, name=None):
    me = model(key, height)
    o = bpy.data.objects.new(name or key.split('/')[-1], me)
    gz = ground(x, y) if z is None else z
    o.location = (x, y, (gz if gz is not None else 0) - 0.05)
    o.rotation_euler = (0, 0, rng.uniform(0, math.tau) if rot is None else rot)
    cen.objects.link(o)
    return o


def facing_camera(x, y):
    """Rotação para a frente do modelo (−Y do modelo) ficar virada para a câmara."""
    return 0.0


PALMS = ['kenney-pirate/palm-bend', 'kenney-pirate/palm-straight', 'kenney-pirate/palm-detailed-bend', 'kenney-pirate/palm-detailed-straight']
BUSHES = [f'kaykit-forest/Bush_{a}_Color1' for a in ('1_A', '1_C', '2_A', '2_C', '3_A', '4_A', '4_C')]
GRASS = [f'kaykit-forest/Grass_{a}_Color1' for a in ('1_A', '1_C', '2_A', '2_C')]
ROCKS = [f'kaykit-forest/Rock_{a}_Color1' for a in ('1_A', '1_D', '1_H', '2_A', '2_D', '3_A', '3_C')]
SAND_ROCKS = ['kenney-pirate/rocks-sand-a', 'kenney-pirate/rocks-sand-b', 'kenney-pirate/rocks-sand-c']
TREES = ['kaykit-medieval/tree_single_A', 'kaykit-medieval/tree_single_B']

# ── Edifícios e marcos ────────────────────────────────────────────────

plateaus = [(p['x'], -p['z'], p['r'] - 2.2, p['y']) for p in rules.get('plateaus', [])]
village, dock, cave, shell = plateaus[:4]
# Aldeia: casas, poço e bandeira no meio do anel.
place('kaykit-medieval/building_home_A_yellow', village[0] - 2.2, village[1] + 1.8, 3.4, rot=0.2)
place('kaykit-medieval/building_home_B_red', village[0] + 2.4, village[1] + 2.0, 3.2, rot=-0.3)
place('kaykit-medieval/building_well_blue', village[0], village[1] - 1.5, 1.8, rot=0)
# Doca: moinho e casa do pescador no meio.
place('kaykit-medieval/building_windmill_yellow', dock[0] - 0.8, dock[1] + 1.0, 5.5, rot=0.3)
place('kaykit-medieval/building_home_B_blue', dock[0] + 2.0, dock[1] - 1.2, 2.6, rot=-0.4)
# Gruta: acampamento.
place('kaykit-medieval/tent', cave[0] + 0.8, cave[1] + 1.2, 2.4, rot=-0.5)
place('kaykit-medieval/barrel', cave[0] - 1.5, cave[1] - 0.6, 0.9)
place('kenney-pirate/crate', cave[0] - 0.8, cave[1] - 1.6, 0.8)
# Praia das conchas: chapéus de sol e baú.
place('kaykit-mixed1/umbrella_pink', shell[0] - 1.2, shell[1] + 0.5, 2.2)
place('kaykit-mixed1/umbrella_yellow', shell[0] + 1.4, shell[1] + 0.9, 2.2)
place('kenney-pirate/chest', shell[0], shell[1] - 1.3, 0.8, rot=0)

# Lojas: banca do mercado atrás da casa (do lado de lá), virada para a câmara.
STALL = {'geral': 'blue', 'barata': 'green', 'luxo': 'red', 'ultimo': 'yellow'}
for shop in rules.get('shops', []):
    c = casas[shop['spaceId']].location
    place(f"kaykit-medieval/building_market_{STALL.get(shop['kind'], 'blue')}", c.x, c.y + 3.4, 3.2, rot=0)
# Canhão e cofre do pirata, atrás das suas casas.
for cannon in rules.get('cannons', []):
    c = casas[cannon['spaceId']].location
    place('kenney-pirate/cannon', c.x, c.y + 2.6, 1.1, rot=math.pi)
bank = next((o for o in casas.values() if o.get('tipo') == 'bank'), None)
if bank:
    place('kenney-pirate/chest', bank.location.x, bank.location.y + 2.4, 1.0, rot=0)

# Navio pirata ancorado ao lado do cais (a este) e um barco a remos.
ship = [o.location for o in casas.values() if o.get('zona') == 'ship']
if ship:
    sx = max(p.x for p in ship) + 9
    sy = sum(p.y for p in ship) / len(ship)
    place('kenney-pirate/ship-pirate-medium', sx, sy, 11, rot=math.pi / 2, z=-0.9)
    place('kenney-pirate/boat-row-small', sx - 5, sy - 12, 1.2, rot=0.6, z=-0.6)
# Bandeira pirata no cume da montanha.
for m in rules.get('mountains', []):
    place('kenney-pirate/flag-pirate-high', m['x'] + 1.5, -m['z'] + 1.5, 4)

# ── Vegetação e rochas espalhadas ─────────────────────────────────────

xs = [c.location.x for c in casas.values()]
ys = [c.location.y for c in casas.values()]
X0, X1, Y0, Y1 = min(xs) - 22, max(xs) + 22, min(ys) - 16, max(ys) + 14
counts = {'palm': 0, 'bush': 0, 'grass': 0, 'rock': 0, 'tree': 0}
for _ in range(26000):
    x, y = rng.uniform(X0, X1), rng.uniform(Y0, Y1)
    h = ground(x, y)
    if h is None or h < -0.35:
        continue
    d = path_dist(x, y)
    if d < 2.3:
        continue
    front = in_front(x, y)
    if y > max(ys) + 3:  # encosta do vulcão, atrás de tudo: só rochas
        if rng.random() < 0.02:
            place(rng.choice(ROCKS), x, y, rng.uniform(1.0, 2.5))
        continue
    # Inclinação (pela diferença de altura à volta).
    hs = [ground(x + dx, y + dy) or h for dx, dy in ((0.8, 0), (-0.8, 0), (0, 0.8), (0, -0.8))]
    slope = (max(hs) - min(hs)) / 1.6
    r = rng.random()
    if slope > 0.9:
        if r < 0.05 and counts['rock'] < 90:
            place(rng.choice(ROCKS), x, y, rng.uniform(0.8, 2.2))
            counts['rock'] += 1
        continue
    if h < 0.6:  # praia
        if r < 0.02 and not front and d > 3 and counts['palm'] < 110:
            place(rng.choice(PALMS), x, y, rng.uniform(4.5, 7.0))
            counts['palm'] += 1
        elif r < 0.02:
            place(rng.choice(SAND_ROCKS), x, y, rng.uniform(0.4, 1.0))
            counts['rock'] += 1
        continue
    # Relva (ilha, ilhotas, encostas)
    if r < 0.012 and not front and d > 3.2 and counts['palm'] < 110:
        place(rng.choice(PALMS), x, y, rng.uniform(5, 8))
        counts['palm'] += 1
    elif r < 0.03 and not front and d > 3.5 and h > 2.0 and counts['tree'] < 50:
        place(rng.choice(TREES), x, y, rng.uniform(3.5, 5.5))
        counts['tree'] += 1
    elif r < 0.07 and counts['bush'] < 300:
        place(rng.choice(BUSHES), x, y, rng.uniform(0.5, 1.3) if front else rng.uniform(0.7, 1.8))
        counts['bush'] += 1
    elif r < 0.13 and counts['grass'] < 400:
        place(rng.choice(GRASS), x, y, rng.uniform(0.3, 0.6))
        counts['grass'] += 1

# Rochas grandes à volta do vulcão (ao fundo).
for _ in range(26):
    a = rng.uniform(0.15 * math.pi, 0.85 * math.pi)
    x, y = 34 * math.cos(a), 72 - 30 * math.sin(a) + rng.uniform(-3, 3)
    if ground(x, y) is not None:
        place(rng.choice(ROCKS), x, y, rng.uniform(2.0, 4.5))

print('Cenário:', counts, 'modelos:', len(_lib))
bpy.ops.wm.save_as_mainfile(filepath=BLEND)
bpy.ops.export_scene.gltf(filepath=GLB, export_format='GLB', export_extras=True, export_yup=True, export_apply=True)
print('Feito:', GLB)
