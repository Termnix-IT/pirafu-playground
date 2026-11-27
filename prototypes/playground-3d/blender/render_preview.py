"""Renders build/playground.blend from inside Blender to check the assets on their own.

    blender --background --factory-startup --python render_preview.py -- [--engine cycles|eevee]
            [--views wide,game,tool,experiment,media] [--time noon|evening] [--size 1600x900] [--samples 96]

The lighting here is only for inspection. On the web the light, sky and time of day come from three.js.
"""
import os
import sys
from math import radians, sin, cos

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def arg(name, default):
    return argv[argv.index(name) + 1] if name in argv else default


ENGINE = arg('--engine', 'cycles')
VIEWS = arg('--views', 'wide').split(',')
TIME = arg('--time', 'noon')
W, H = (int(v) for v in arg('--size', '1600x900').split('x'))
SAMPLES = int(arg('--samples', '96'))

bpy.ops.wm.open_mainfile(filepath=os.path.join(HERE, 'build', 'playground.blend'))
scene = bpy.context.scene
out_dir = os.path.join(HERE, 'build', 'renders')
os.makedirs(out_dir, exist_ok=True)

# ---- world: a simple gradient sky, enough to judge materials against
SKY = {'noon': ((0.36, 0.62, 1.0), (0.02, 0.16, 0.7), (1.0, 0.97, 0.93), 50, -28, 5.0),
       'evening': ((1.0, 0.5, 0.3), (0.08, 0.12, 0.42), (1.0, 0.58, 0.34), 16, 14, 4.0)}[TIME]
world = bpy.data.worlds.new('PreviewSky')
try:
    world.use_nodes = True
except Exception:
    pass
nt = world.node_tree
nt.nodes.clear()
coord = nt.nodes.new('ShaderNodeTexCoord')
sep = nt.nodes.new('ShaderNodeSeparateXYZ')
ramp = nt.nodes.new('ShaderNodeValToRGB')
ramp.color_ramp.elements[0].position = 0.0
ramp.color_ramp.elements[0].color = (*SKY[0], 1)
ramp.color_ramp.elements[1].position = 0.4
ramp.color_ramp.elements[1].color = (*SKY[1], 1)
bg = nt.nodes.new('ShaderNodeBackground')
bg.inputs['Strength'].default_value = 0.75
outp = nt.nodes.new('ShaderNodeOutputWorld')
nt.links.new(coord.outputs['Generated'], sep.inputs[0])
nt.links.new(sep.outputs['Z'], ramp.inputs['Fac'])
nt.links.new(ramp.outputs['Color'], bg.inputs['Color'])
nt.links.new(bg.outputs['Background'], outp.inputs['Surface'])
scene.world = world

sun_data = bpy.data.lights.new('PreviewSun', 'SUN')
sun_data.energy = SKY[5]
sun_data.color = SKY[2]
sun_data.angle = radians(3.0)
sun = bpy.data.objects.new('PreviewSun', sun_data)
scene.collection.objects.link(sun)
el, az = radians(SKY[3]), radians(SKY[4])
direction = Vector((sin(az) * cos(el), cos(az) * cos(el), sin(el)))      # towards the sun
sun.rotation_euler = (-direction).to_track_quat('-Z', 'Y').to_euler()

# ---- renderer
scene.render.resolution_x, scene.render.resolution_y = W, H
scene.render.image_settings.file_format = 'PNG'
if ENGINE == 'cycles':
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
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 8
    scene.cycles.transparent_max_bounces = 16
else:
    scene.render.engine = 'BLENDER_EEVEE'
    scene.eevee.taa_render_samples = 48
    scene.eevee.use_raytracing = True
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
scene.view_settings.exposure = -0.9
# stacked glazing reads as fog in a still; the web version draws the glass with its own shader
for ob in scene.objects:
    if ob.get('grp') == 'glass':
        ob.hide_render = True

cam_data = bpy.data.cameras.new('PreviewCam')
cam_data.sensor_fit = 'VERTICAL'
cam = bpy.data.objects.new('PreviewCam', cam_data)
scene.collection.objects.link(cam)
scene.camera = cam


def aim(position, target, fov):
    cam.location = position
    cam.rotation_euler = (Vector(target) - Vector(position)).to_track_quat('-Z', 'Y').to_euler()
    cam_data.angle = radians(fov)


for view in VIEWS:
    if view == 'wide':
        aim((1.2, -9.0, 1.6), (-0.4, 6.0, 2.15), 40)
    else:
        screen = bpy.data.objects['Screen_' + view]
        m = screen.matrix_world
        p = m.translation.copy()
        n = (m.to_3x3() @ Vector((0, -1, 0))).normalized()
        side = n.cross(Vector((0, 0, 1))).normalized()
        aim(p + n * 1.9 + side * 0.85 + Vector((0, 0, 0.42)), p + Vector((0, 0, -0.22)), 36)
    scene.render.filepath = os.path.join(out_dir, '%s_%s_%s.png' % (view, TIME, ENGINE))
    bpy.ops.render.render(write_still=True)
    print('RENDERED', scene.render.filepath)
