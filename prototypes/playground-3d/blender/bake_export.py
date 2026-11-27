"""Joins the assets into a few meshes, bakes ambient occlusion and exports the GLB for the web.

    blender --background --factory-startup --python bake_export.py -- [--out DIR] [--samples 96] [--skip-bake]

Only ambient occlusion is baked. Sun, shadows and sky stay dynamic in three.js so the
time of day can keep changing. Outputs:
  playground.glb      all meshes, Light_* empties, wood texture (WebP)
  ao_room.webp        AO atlas for the Interior mesh       (second UV set, "AO")
  ao_terms.webp       AO atlas for the four Terminal meshes (second UV set, "AO")
  ao_floor.webp       AO on the floor                      (first UV set)
"""
import os
import sys
import json
import struct
from math import radians

import bpy
from mathutils import Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def arg(name, default):
    return argv[argv.index(name) + 1] if name in argv else default


OUT = os.path.abspath(arg('--out', os.path.join(HERE, '..', 'public', 'assets')))
SAMPLES = int(arg('--samples', '96'))
SKIP_BAKE = '--skip-bake' in argv
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.open_mainfile(filepath=os.path.join(HERE, 'build', 'playground.blend'))
scene = bpy.context.scene
view_layer = bpy.context.view_layer
view_layer.update()

# ---- 1. flatten: world transform into the mesh data, no parents
world = {ob.name: ob.matrix_world.copy() for ob in scene.objects}
for ob in scene.objects:
    ob.parent = None
for ob in scene.objects:
    m = world[ob.name]
    if ob.type == 'MESH' and ob.get('grp') != 'screen':
        ob.data.transform(m)
        if m.determinant() < 0:
            ob.data.flip_normals()
        ob.matrix_world = Matrix.Identity(4)
    else:
        ob.matrix_world = m
view_layer.update()


def select_only(objs, active=None):
    for o in scene.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    view_layer.objects.active = active or objs[0]


def join(name, objs):
    if not objs:
        return None
    if len(objs) > 1:
        select_only(objs)
        bpy.ops.object.join()
    ob = view_layer.objects.active if len(objs) > 1 else objs[0]
    ob.name = name
    ob.data.name = name
    return ob


# ---- 2. join by group
groups = {}
for ob in scene.objects:
    if ob.type == 'MESH':
        groups.setdefault(ob.get('grp', 'interior'), []).append(ob)
NAMES = {'structure': 'Structure', 'interior': 'Interior', 'glass': 'VaultGlass', 'glass_solid': 'GlassSolid',
         'emit': 'Emitters', 'plants': 'Plants', 'curtain': 'Curtain', 'floor': 'Floor'}
joined = {}
for grp, objs in groups.items():
    if grp == 'screen':
        continue
    name = NAMES.get(grp) or ('Terminal_' + grp.split('_', 1)[1])
    joined[name] = join(name, objs)
for ob in list(scene.objects):                     # helper empties are no longer needed
    if ob.type == 'EMPTY' and not ob.name.startswith('Light_'):
        bpy.data.objects.remove(ob)
view_layer.update()

terminals = [ob for name, ob in joined.items() if name.startswith('Terminal_')]
ATLASES = {'ao_room': ([joined['Interior']], 2048, 2048), 'ao_terms': (terminals, 2048, 2048)}


# ---- 3. second UV set for the AO atlases
def ensure_uv(ob, name):
    layers = ob.data.uv_layers
    return layers.get(name) or layers.new(name=name)


for atlas, (objs, w, h) in ATLASES.items():
    for ob in objs:
        ensure_uv(ob, 'UVMap')
        ob.data.uv_layers.active = ensure_uv(ob, 'AO')
    select_only(objs)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=radians(66), island_margin=0.003, area_weight=0.0, scale_to_bounds=False)
    try:
        bpy.ops.uv.average_islands_scale()
        bpy.ops.uv.pack_islands(margin=0.003)
    except Exception as err:                       # the packing of smart_project is good enough
        print('PACK_SKIPPED', atlas, err)
    bpy.ops.object.mode_set(mode='OBJECT')
ensure_uv(joined['Floor'], 'UVMap')
ATLASES['ao_floor'] = ([joined['Floor']], 2048, 4096)


# ---- 4. bake ambient occlusion
def set_bake_target(objs, image):
    for ob in objs:
        for slot in ob.material_slots:
            nt = slot.material.node_tree
            node = nt.nodes.get('BAKE_TARGET') or nt.nodes.new('ShaderNodeTexImage')
            node.name = 'BAKE_TARGET'
            node.image = image
            nt.nodes.active = node


def clear_bake_targets():
    for m in bpy.data.materials:
        if m.node_tree and m.node_tree.nodes.get('BAKE_TARGET'):
            m.node_tree.nodes.remove(m.node_tree.nodes['BAKE_TARGET'])


if not SKIP_BAKE:
    scene.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for kind in ('OPTIX', 'CUDA'):
        try:
            prefs.compute_device_type = kind
            prefs.get_devices()
            for d in prefs.devices:
                d.use = d.type == kind
            scene.cycles.device = 'GPU'
            break
        except Exception:
            continue
    scene.cycles.samples = SAMPLES
    scene.cycles.use_denoising = False
    if scene.world is None:
        scene.world = bpy.data.worlds.new('BakeWorld')
    scene.world.light_settings.distance = 1.4       # contact shading, not a general darkening
    for name in ('VaultGlass', 'Curtain'):          # glazing and the sheer curtain do not occlude
        joined[name].hide_render = True
    for atlas, (objs, w, h) in ATLASES.items():
        image = bpy.data.images.new(atlas, w, h, alpha=False)
        image.colorspace_settings.name = 'Non-Color'
        set_bake_target(objs, image)
        for ob in objs:
            uv = ob.data.uv_layers.get('AO') or ob.data.uv_layers['UVMap']
            ob.data.uv_layers.active = uv
        for i, ob in enumerate(objs):
            select_only([ob])
            bpy.ops.object.bake(type='AO', margin=8, use_clear=(i == 0))
        image.filepath_raw = os.path.join(OUT, atlas + '.png')
        image.file_format = 'PNG'
        image.save()
        print('BAKED', atlas, w, h)
    for name in ('VaultGlass', 'Curtain'):
        joined[name].hide_render = False
    clear_bake_targets()

# the first UV set stays the one textures use; the exporter writes sets in this order
for ob in scene.objects:
    if ob.type == 'MESH' and ob.data.uv_layers.get('UVMap'):
        ob.data.uv_layers['UVMap'].active_render = True
        ob.data.uv_layers.active = ob.data.uv_layers['UVMap']

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'build', 'playground_export.blend'))

# ---- 5. export
export = [ob for ob in scene.objects if ob.type == 'MESH' or ob.name.startswith('Light_')]
select_only(export)
glb = os.path.join(OUT, 'playground.glb')
bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', use_selection=True, export_yup=True,
                          export_apply=False, export_texcoords=True, export_normals=True,
                          export_materials='EXPORT', export_image_format='WEBP', export_image_quality=82,
                          export_cameras=False, export_lights=False, export_extras=False,
                          export_animations=False)

# ---- 6. report what was written
with open(glb, 'rb') as fh:
    magic, version, length = struct.unpack('<4sII', fh.read(12))
    chunk_len, chunk_type = struct.unpack('<I4s', fh.read(8))
    doc = json.loads(fh.read(chunk_len))
print('GLB', round(os.path.getsize(glb) / 1024), 'KB')
for mesh in doc['meshes']:
    attrs = sorted(set(a for prim in mesh['primitives'] for a in prim['attributes']))
    tris = sum(doc['accessors'][prim['indices']]['count'] // 3 for prim in mesh['primitives'])
    print('MESH', mesh['name'], 'prims', len(mesh['primitives']), 'tris', tris, attrs)
print('EXTENSIONS', doc.get('extensionsUsed'))
print('MATERIALS', len(doc['materials']), 'IMAGES', [i.get('mimeType') for i in doc.get('images', [])])
