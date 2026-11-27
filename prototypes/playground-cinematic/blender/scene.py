"""Builds the Phase 4 Playground space and saves build/playground_p4.blend.

    blender --background --factory-startup --python scene.py

Models (arch.py, furniture.py, details.py), materials (this file) and light (look.py) are kept
apart on purpose: when the scene moves to three.js, the models export as GLB while the light,
sky and time of day are rebuilt there.
"""
import os
import sys
from math import radians, pi

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import lib as L      # noqa: E402
import arch          # noqa: E402
import look          # noqa: E402

OUT = os.path.join(HERE, 'build')
os.makedirs(OUT, exist_ok=True)
scene = L.reset_scene()
ARCH = L.coll('Architecture')
FURN = L.coll('Furniture')
DETAIL = L.coll('Details')


# ---------------------------------------------------------------- materials
def nodes(m):
    nt = m.node_tree
    return nt, next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')


def add_bump(m, scale, strength, distance=0.01, detail=4.0):
    nt, bsdf = nodes(m)
    coord = nt.nodes.new('ShaderNodeTexCoord')
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = scale
    noise.inputs['Detail'].default_value = detail
    nt.links.new(coord.outputs['Object'], noise.inputs['Vector'])
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = strength
    bump.inputs['Distance'].default_value = distance
    nt.links.new(noise.outputs[0], bump.inputs['Height'])
    nt.links.new(bump.outputs[0], bsdf.inputs['Normal'])
    return noise


def vary_roughness(m, scale, low, high):
    nt, bsdf = nodes(m)
    coord = nt.nodes.new('ShaderNodeTexCoord')
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = scale
    noise.inputs['Detail'].default_value = 3.0
    nt.links.new(coord.outputs['Object'], noise.inputs['Vector'])
    rng = nt.nodes.new('ShaderNodeMapRange')
    rng.inputs['From Min'].default_value = 0.3
    rng.inputs['From Max'].default_value = 0.7
    rng.inputs['To Min'].default_value = low
    rng.inputs['To Max'].default_value = high
    nt.links.new(noise.outputs[0], rng.inputs['Value'])
    nt.links.new(rng.outputs['Result'], bsdf.inputs['Roughness'])


def emitter(name, color, strength, always=0.0):
    """Light source whose strength look.apply() scales with the time of day."""
    m = L.mat(name, '#ffffff', emission=color, strength=strength)
    m['emit_base'] = strength
    m['emit_always'] = always
    return m


def thin_glass(name, tint=(0.96, 0.985, 1.0)):
    """Architectural glass: clear to light and shadow rays, with a soft reflection at glancing angles."""
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    nt.nodes.clear()
    clear = nt.nodes.new('ShaderNodeBsdfTransparent')
    clear.inputs['Color'].default_value = (*tint, 1)
    gloss = nt.nodes.new('ShaderNodeBsdfGlossy')
    gloss.inputs['Roughness'].default_value = 0.0
    fres = nt.nodes.new('ShaderNodeFresnel')
    fres.inputs['IOR'].default_value = 1.5
    path = nt.nodes.new('ShaderNodeLightPath')
    cam = nt.nodes.new('ShaderNodeMath')                 # reflect only for camera and glossy rays
    cam.operation = 'MAXIMUM'
    nt.links.new(path.outputs['Is Camera Ray'], cam.inputs[0])
    nt.links.new(path.outputs['Is Glossy Ray'], cam.inputs[1])
    fac = nt.nodes.new('ShaderNodeMath')
    fac.operation = 'MULTIPLY'
    nt.links.new(fres.outputs[0], fac.inputs[0])
    nt.links.new(cam.outputs[0], fac.inputs[1])
    mix = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(fac.outputs[0], mix.inputs['Fac'])
    nt.links.new(clear.outputs[0], mix.inputs[1])
    nt.links.new(gloss.outputs[0], mix.inputs[2])
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(mix.outputs[0], out.inputs['Surface'])
    m.use_backface_culling = False
    L.MATS[name] = m
    return m


M = {}
# The shell and the floor are a cool white, not a warm one: with a warm white the room turned beige and
# lost the blue clarity of the sky around it.
M['plaster'] = L.mat('ShellPlaster', '#eceef0', rough=0.62)                 # fine mineral plaster, one skin inside and out
add_bump(M['plaster'], 240.0, 0.035, 0.002)
M['terrazzo'] = L.mat('FloorTerrazzo', '#d3d9df', rough=0.32)                # honed, not polished: reflections stay soft
vary_roughness(M['terrazzo'], 1.3, 0.22, 0.4)
add_bump(M['terrazzo'], 60.0, 0.02, 0.001)
M['stone'] = L.mat('RimStone', '#c9c6c0', rough=0.55)
M['glass'] = thin_glass('ArchGlass')
M['fin'] = L.mat('FinAnodized', '#ddd3c2', rough=0.42, metal=1.0)           # pale champagne anodised aluminium
M['inlay'] = L.mat('Inlay', '#c9b48e', rough=0.28, metal=1.0)
M['pool'] = L.mat('PoolWater', '#0a1a22', rough=0.0)
nodes(M['pool'])[1].inputs['IOR'].default_value = 1.33
add_bump(M['pool'], 2.2, 0.035, 0.05, 2.0)
M['cove'] = emitter('CoveLight', '#ffd9b0', 30.0)

# ---------------------------------------------------------------- architecture
arch.build_shell(ARCH, M['plaster'])
arch.build_floor(ARCH, M['terrazzo'])
arch.build_terrace_rim(ARCH, M['stone'])
arch.build_glazing(ARCH, M['glass'], M['fin'])
arch.build_cove(ARCH, M['cove'])
arch.build_pool_water(ARCH, M['pool'], M['inlay'])

# ---------------------------------------------------------------- furniture and details (added in later stages)
for module in ('furniture', 'details'):
    if os.path.exists(os.path.join(HERE, module + '.py')):
        __import__(module).build(scene, {'FURN': FURN, 'DETAIL': DETAIL, 'ARCH': ARCH}, M, emitter)

# ---------------------------------------------------------------- light and view
look.build_world(scene)
look.build_landscapes(scene)


def camera(name, position, target, lens=24.0, fstop=None, focus=None):
    data = bpy.data.cameras.new(name)
    data.lens = lens
    data.sensor_width = 36.0
    data.clip_start = 0.05
    data.clip_end = 60000.0
    if fstop:
        data.dof.use_dof = True
        data.dof.aperture_fstop = fstop
        data.dof.focus_distance = focus or (Vector(target) - Vector(position)).length
    ob = bpy.data.objects.new(name, data)
    scene.collection.objects.link(ob)
    ob.location = position
    ob.rotation_euler = (Vector(target) - Vector(position)).to_track_quat('-Z', 'Y').to_euler()
    return ob


camera('Cam_main', (0.6, -8.2, 1.5), (-0.5, 6.5, 2.7), 22.0)
camera('Cam_wide', (-5.6, -6.2, 1.6), (2.2, 5.0, 2.6), 18.0)
camera('Cam_up', (1.6, -3.2, 1.3), (-0.6, 1.6, 7.0), 16.0)
camera('Cam_lounge', (0.8, -1.6, 1.25), (5.2, 0.9, 0.6), 28.0)
if 'furniture' in sys.modules:
    for name, (pos, target, lens, fstop) in sys.modules['furniture'].CAMERAS.items():
        camera('Cam_' + name, pos, target, lens, fstop)
scene.camera = bpy.data.objects['Cam_main']

L.finalize_meshes()
look.apply(scene, 'noon', 'sky')

scene.render.engine = 'CYCLES'
scene.render.resolution_x, scene.render.resolution_y = 1920, 1080
for name in ('AgX', 'Filmic', 'Standard'):
    try:
        scene.view_settings.view_transform = name
        break
    except Exception:
        continue
try:
    scene.view_settings.look = 'AgX - Medium High Contrast'
except Exception:
    pass

tris = sum(sum(len(p.vertices) - 2 for p in ob.data.polygons) for ob in scene.objects if ob.type == 'MESH')
print('OBJECTS', len(scene.objects), 'TRIANGLES', tris)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'playground_p4.blend'))
print('SAVED')
