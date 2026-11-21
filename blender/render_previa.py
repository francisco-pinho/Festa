"""
Imagem de pré-visualização de um mapa (sem abrir o jogo): mar à altura do jogo, sol e câmara
do lado de onde o jogo olha para o tabuleiro.

    blender.exe -b blender/ilha.blend --python blender/render_previa.py -- saida.png [vista]

vista: «jogo» (por omissão, inclinada como a câmara do mapa) ou «cima».
"""
import math
import sys

import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
out = args[0] if args else '//previa.png'
view = args[1] if len(args) > 1 else 'jogo'

scene = bpy.context.scene
for engine in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT', 'BLENDER_WORKBENCH'):
    try:
        scene.render.engine = engine
        break
    except TypeError:
        continue
scene.render.resolution_x, scene.render.resolution_y = 1280, 720
scene.render.filepath = out

# Mar (como no jogo, a −0,6 m).
bpy.ops.mesh.primitive_plane_add(size=600, location=(0, 0, -0.6))
sea = bpy.context.object
m = bpy.data.materials.new('mar')
m.use_nodes = True
nodes = m.node_tree.nodes
b = next((n for n in nodes if n.type == 'BSDF_PRINCIPLED'), None) or nodes.new('ShaderNodeBsdfPrincipled')
if not any(n.type == 'OUTPUT_MATERIAL' for n in nodes):
    m.node_tree.links.new(b.outputs[0], nodes.new('ShaderNodeOutputMaterial').inputs[0])
b.inputs['Base Color'].default_value = (0.08, 0.45, 0.65, 1)
b.inputs['Roughness'].default_value = 0.15
b.inputs['Alpha'].default_value = 0.75
sea.data.materials.append(m)

# Céu e sol.
world = bpy.data.worlds.new('ceu') if not scene.world else scene.world
scene.world = world
world.use_nodes = True
bg = next((n for n in world.node_tree.nodes if n.type == 'BACKGROUND'), None)
if bg is None:
    bg = world.node_tree.nodes.new('ShaderNodeBackground')
    world.node_tree.links.new(bg.outputs[0], world.node_tree.nodes.new('ShaderNodeOutputWorld').inputs[0])
bg.inputs['Color'].default_value = (0.55, 0.78, 0.95, 1)
bg.inputs['Strength'].default_value = 0.9
bpy.ops.object.light_add(type='SUN', location=(30, -30, 60))
sun = bpy.context.object
sun.data.energy = 3.5
sun.rotation_euler = (math.radians(50), 0, math.radians(30))

# Câmara a olhar para o meio das casas.
casas = [o for o in scene.objects if o.name.startswith('casa_')]
cx = sum(o.location.x for o in casas) / len(casas)
cy = sum(o.location.y for o in casas) / len(casas)
target = Vector((cx, cy, 0))
if view == 'cima':
    loc = Vector((cx, cy, 160))
else:
    loc = Vector((cx, cy - 95, 70))
bpy.ops.object.camera_add(location=loc)
cam = bpy.context.object
cam.rotation_euler = (target - loc).to_track_quat('-Z', 'Y').to_euler()
cam.data.lens = 28
scene.camera = cam
bpy.ops.render.render(write_still=True)
print('Imagem:', out)
