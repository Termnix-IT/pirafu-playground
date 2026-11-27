"""Renders build/playground_p4.blend with Cycles.

    blender --background --factory-startup --python render.py -- [--views main,wide] [--time noon]
            [--scenery sky] [--size 1920x1080] [--samples 256] [--tag name] [--no-clouds]

Images are written to ../renders/<view>_<time>_<scenery>[_tag].png
"""
import os
import sys
import time as clock

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import look  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def arg(name, default):
    return argv[argv.index(name) + 1] if name in argv else default


VIEWS = arg('--views', 'main').split(',')
TIME = arg('--time', 'noon')
SCENERY = arg('--scenery', 'sky')
W, H = (int(v) for v in arg('--size', '1920x1080').split('x'))
SAMPLES = int(arg('--samples', '256'))
TAG = arg('--tag', '')

bpy.ops.wm.open_mainfile(filepath=os.path.join(HERE, 'build', 'playground_p4.blend'))
scene = bpy.context.scene
look.apply(scene, TIME, SCENERY)
if '--no-clouds' in argv:
    for name in ('cumulus', 'cloudsea', 'horizon'):
        bpy.data.collections['Env_' + name].hide_render = True

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
c = scene.cycles
c.samples = SAMPLES
c.use_adaptive_sampling = True
c.adaptive_threshold = 0.02
c.use_denoising = True
c.max_bounces = 10
c.diffuse_bounces = 6
c.glossy_bounces = 6
c.transmission_bounces = 10
c.transparent_max_bounces = 24
c.volume_bounces = 6
c.volume_step_rate = 2.0
c.volume_max_steps = 192
c.caustics_reflective = False
c.caustics_refractive = False
c.sample_clamp_indirect = 8.0
scene.render.resolution_x, scene.render.resolution_y = W, H
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.film_transparent = False

out_dir = os.path.abspath(os.path.join(HERE, '..', 'renders'))
os.makedirs(out_dir, exist_ok=True)
for view in VIEWS:
    scene.camera = bpy.data.objects['Cam_' + view]
    look.set_white_point(scene, TIME, view)
    name = '%s_%s_%s%s.png' % (view, TIME, SCENERY, ('_' + TAG) if TAG else '')
    scene.render.filepath = os.path.join(out_dir, name)
    t0 = clock.time()
    bpy.ops.render.render(write_still=True)
    print('RENDERED', name, round(clock.time() - t0), 's')
