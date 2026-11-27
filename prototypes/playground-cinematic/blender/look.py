"""Light, sky and the view outside. Everything that changes with the time of day lives here,
separate from the models, so the same split can be kept when the scene moves to three.js.

apply(scene, time, scenery) sets the sun, the sky, the interior lights and which landscape is shown.
"""
from math import radians, sin, cos, pi
import random

import bpy
import bmesh
from mathutils import Vector

import lib as L

# sun_az is measured from the view axis (+Y) towards the right (+X).
# wb is the white point in kelvin (None leaves the image as rendered). Morning and noon are graded cool so
# that the whites read as clear, bluish air; evening and night keep the warmth of the low sun and the lamps.
# wb_close is the white point for the close-ups of the terminals (CLOSEUPS). They are framed mostly in shade,
# where the cool grade turns the white ceramic blue, so they are pulled part of the way back to neutral.
# sky_seen is how bright the camera sees the sky (see SKY_SEEN in build_world).
TIMES = {
    'morning': dict(sun_el=19, sun_az=-33, sun=3.8, sun_color=(1.0, 0.86, 0.72), sun_soft=3.5, sky=0.26, exposure=-0.35, interior=0.25, air=1.0, aerosol=1.6, wb=5300, wb_close=5900, sky_seen=0.44),
    'noon':    dict(sun_el=40, sun_az=-38, sun=5.0, sun_color=(1.0, 0.96, 0.9), sun_soft=2.2, sky=0.2, exposure=-0.85, interior=0.0, air=1.0, aerosol=1.0, wb=5300, wb_close=5900, sky_seen=0.44),
    'evening': dict(sun_el=5.0, sun_az=8, sun=2.8, sun_color=(1.0, 0.6, 0.38), sun_soft=4.0, sky=0.3, exposure=-0.25, interior=0.6, air=1.3, aerosol=2.4, wb=None, wb_close=None, sky_seen=0.5),
    'night':   dict(sun_el=38, sun_az=-20, sun=0.2, sun_color=(0.6, 0.73, 1.0), sun_soft=5.0, sky=0.0, exposure=-0.1, interior=1.0, air=1.0, aerosol=1.0, wb=None, wb_close=None, sky_seen=0.5),
}
CLOSEUPS = ('game', 'tool', 'experiment', 'media')


def set_white_point(scene, time, view='main'):
    """White balance for one view; render.py calls this per camera."""
    wb = TIMES[time]['wb_close' if view in CLOSEUPS else 'wb']
    vs = scene.view_settings
    if hasattr(vs, 'use_white_balance'):
        vs.use_white_balance = wb is not None
        if wb is not None:
            vs.white_balance_temperature = wb
SCENERIES = ('sky', 'cloud', 'water')


def sun_vector(el_deg, az_deg):
    el, az = radians(el_deg), radians(az_deg)
    return Vector((sin(az) * cos(el), cos(az) * cos(el), sin(el)))


# ---------------------------------------------------------------- world
def build_world(scene):
    world = bpy.data.worlds.new('Sky')
    try:
        world.use_nodes = True
    except Exception:
        pass
    nt = world.node_tree
    nt.nodes.clear()
    sky = nt.nodes.new('ShaderNodeTexSky')
    sky.name = 'SKY'
    sky.sky_type = 'MULTIPLE_SCATTERING'
    sky.sun_disc = True
    sky.sun_size = radians(1.2)
    sky.sun_intensity = 0.25
    day = nt.nodes.new('ShaderNodeBackground')
    day.name = 'DAY'
    # The sky lights the room at full strength, but the camera sees it a little darker. Without this the
    # view outside burns out to white whenever the interior is exposed correctly (a graduated filter, in effect).
    path = nt.nodes.new('ShaderNodeLightPath')
    seen = nt.nodes.new('ShaderNodeMath')
    seen.operation = 'MAXIMUM'
    nt.links.new(path.outputs['Is Camera Ray'], seen.inputs[0])
    nt.links.new(path.outputs['Is Glossy Ray'], seen.inputs[1])
    dim = nt.nodes.new('ShaderNodeMapRange')
    dim.name = 'SKY_SEEN'
    dim.inputs['To Min'].default_value = 1.0
    dim.inputs['To Max'].default_value = 0.5
    nt.links.new(seen.outputs[0], dim.inputs['Value'])
    scale = nt.nodes.new('ShaderNodeVectorMath')
    scale.operation = 'SCALE'
    nt.links.new(sky.outputs[0], scale.inputs[0])
    nt.links.new(dim.outputs['Result'], scale.inputs['Scale'])
    nt.links.new(scale.outputs[0], day.inputs['Color'])
    # night sky: a deep gradient with fine stars
    coord = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(coord.outputs['Generated'], sep.inputs[0])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (0.016, 0.04, 0.11, 1)
    ramp.color_ramp.elements[1].position = 0.6
    ramp.color_ramp.elements[1].color = (0.002, 0.005, 0.02, 1)
    nt.links.new(sep.outputs['Z'], ramp.inputs['Fac'])
    stars = nt.nodes.new('ShaderNodeTexVoronoi')            # one fine point per cell, most of them left dark
    stars.inputs['Scale'].default_value = 260.0
    nt.links.new(coord.outputs['Generated'], stars.inputs['Vector'])
    point = nt.nodes.new('ShaderNodeMapRange')
    point.inputs['From Min'].default_value = 0.0
    point.inputs['From Max'].default_value = 0.055
    point.inputs['To Min'].default_value = 1.0
    point.inputs['To Max'].default_value = 0.0
    nt.links.new(stars.outputs['Distance'], point.inputs['Value'])
    pick = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(stars.outputs['Color'], pick.inputs[0])
    some = nt.nodes.new('ShaderNodeMapRange')
    some.inputs['From Min'].default_value = 0.72
    some.inputs['From Max'].default_value = 1.0
    some.inputs['To Max'].default_value = 0.9
    nt.links.new(pick.outputs['X'], some.inputs['Value'])
    thresh = nt.nodes.new('ShaderNodeMath')
    thresh.operation = 'MULTIPLY'
    nt.links.new(point.outputs['Result'], thresh.inputs[0])
    nt.links.new(some.outputs['Result'], thresh.inputs[1])
    add = nt.nodes.new('ShaderNodeMixRGB')
    add.blend_type = 'ADD'
    add.inputs['Fac'].default_value = 1.0
    nt.links.new(ramp.outputs['Color'], add.inputs['Color1'])
    nt.links.new(thresh.outputs[0], add.inputs['Color2'])
    night = nt.nodes.new('ShaderNodeBackground')
    night.name = 'NIGHT'
    nt.links.new(add.outputs['Color'], night.inputs['Color'])
    mix = nt.nodes.new('ShaderNodeMixShader')
    mix.name = 'DAYNIGHT'
    nt.links.new(day.outputs[0], mix.inputs[1])
    nt.links.new(night.outputs[0], mix.inputs[2])
    out = nt.nodes.new('ShaderNodeOutputWorld')
    nt.links.new(mix.outputs[0], out.inputs['Surface'])
    scene.world = world

    sun_data = bpy.data.lights.new('Sun', 'SUN')
    sun = bpy.data.objects.new('Sun', sun_data)
    scene.collection.objects.link(sun)
    return world


# ---------------------------------------------------------------- sea
def build_sea(coll):
    m = bpy.data.materials.new('Sea')
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (0.012, 0.05, 0.085, 1)
    bsdf.inputs['Roughness'].default_value = 0.035
    bsdf.inputs['IOR'].default_value = 1.33
    coord = nt.nodes.new('ShaderNodeTexCoord')
    mapping = nt.nodes.new('ShaderNodeMapping')
    mapping.name = 'WAVE_MAP'
    mapping.inputs['Scale'].default_value = (0.5, 1.1, 1.0)       # waves run across the view
    nt.links.new(coord.outputs['Object'], mapping.inputs['Vector'])
    n1 = nt.nodes.new('ShaderNodeTexNoise')
    n1.inputs['Scale'].default_value = 1.6
    n1.inputs['Detail'].default_value = 6.0
    n1.inputs['Roughness'].default_value = 0.62
    nt.links.new(mapping.outputs[0], n1.inputs['Vector'])
    bump = nt.nodes.new('ShaderNodeBump')
    bump.name = 'WAVE_BUMP'
    bump.inputs['Strength'].default_value = 0.12
    bump.inputs['Distance'].default_value = 0.4
    swell = nt.nodes.new('ShaderNodeTexNoise')            # a long swell keeps the far water from mirroring only the pale horizon
    swell.inputs['Scale'].default_value = 0.07
    swell.inputs['Detail'].default_value = 3.0
    nt.links.new(mapping.outputs[0], swell.inputs['Vector'])
    both = nt.nodes.new('ShaderNodeMath')
    both.operation = 'MULTIPLY_ADD'
    both.inputs[1].default_value = 14.0
    nt.links.new(swell.outputs[0], both.inputs[0])
    nt.links.new(n1.outputs[0], both.inputs[2])
    nt.links.new(both.outputs[0], bump.inputs['Height'])
    nt.links.new(bump.outputs[0], bsdf.inputs['Normal'])
    bm = bmesh.new()
    s = 30000.0
    bm.faces.new([bm.verts.new(p) for p in ((-s, -s, 0), (s, -s, 0), (s, s, 0), (-s, s, 0))])
    ob = L.new_obj('Sea', bm, coll, m, loc=(0, 0, -0.85), grp='env', recalc=False)
    return ob


# ---------------------------------------------------------------- clouds (volumes)
def cloud_material(name, density, scale):
    """Soft-edged volume: a rounded falloff per puff, eroded by 3D noise so the edges billow."""
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    nt.nodes.clear()
    coord = nt.nodes.new('ShaderNodeTexCoord')
    length = nt.nodes.new('ShaderNodeVectorMath')
    length.operation = 'LENGTH'
    nt.links.new(coord.outputs['Object'], length.inputs[0])
    fall = nt.nodes.new('ShaderNodeMapRange')                 # 1 at the centre, 0 at the puff's surface
    fall.inputs['From Min'].default_value = 1.0
    fall.inputs['From Max'].default_value = 0.25
    nt.links.new(length.outputs['Value'], fall.inputs['Value'])
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = scale
    noise.inputs['Detail'].default_value = 5.0
    noise.inputs['Roughness'].default_value = 0.6
    nt.links.new(geo.outputs['Position'], noise.inputs['Vector'])
    mix = nt.nodes.new('ShaderNodeMath')
    mix.operation = 'MULTIPLY_ADD'                            # falloff * 1.5 + (noise - 1.05)
    mix.inputs[1].default_value = 1.5
    sub = nt.nodes.new('ShaderNodeMath')
    sub.operation = 'SUBTRACT'
    sub.inputs[1].default_value = 1.05
    nt.links.new(noise.outputs[0], sub.inputs[0])
    nt.links.new(fall.outputs['Result'], mix.inputs[0])
    nt.links.new(sub.outputs[0], mix.inputs[2])
    ramp = nt.nodes.new('ShaderNodeMapRange')
    ramp.inputs['From Min'].default_value = 0.0
    ramp.inputs['From Max'].default_value = 0.22
    ramp.inputs['To Max'].default_value = density
    nt.links.new(mix.outputs[0], ramp.inputs['Value'])
    vol = nt.nodes.new('ShaderNodeVolumePrincipled')
    vol.inputs['Color'].default_value = (1, 1, 1, 1)
    vol.inputs['Anisotropy'].default_value = 0.55
    nt.links.new(ramp.outputs['Result'], vol.inputs['Density'])
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(vol.outputs[0], out.inputs['Volume'])
    return m


def build_cumulus(coll, mat, name, centre, size, height, puffs, seed):
    """A towering cumulus: puffs stacked highest in the middle, on a flat base."""
    rng = random.Random(seed)
    cx, cy, base = centre
    bm = bmesh.new()
    for i in range(puffs):
        a, d = rng.uniform(0, 2 * pi), rng.random() ** 0.7
        x, y = cos(a) * d * size, sin(a) * d * size * 0.55
        top = height * (1 - d ** 1.6) * rng.uniform(0.55, 1.0)
        z = rng.uniform(0.0, 1.0) ** 0.8 * top
        r = size * rng.uniform(0.14, 0.32) * (1.0 - 0.4 * z / max(height, 1))
        ob = bpy.data.objects.new('%s_%02d' % (name, i), bpy.data.meshes.new('%s_%02d' % (name, i)))
        pm = bmesh.new()
        bmesh.ops.create_icosphere(pm, subdivisions=2, radius=1.0)
        pm.to_mesh(ob.data)
        pm.free()
        ob.data.materials.append(mat)
        ob.location = (cx + x, cy + y, base + max(z, r * 0.55))
        ob.scale = (r, r, r * rng.uniform(0.62, 0.8))
        ob['grp'] = 'env'
        ob['soft'] = 1
        coll.objects.link(ob)
    bm.free()


def build_cloud_sea(coll, mat):
    """A floor of cloud below the pavilion, reaching the horizon."""
    rng = random.Random(7)
    for i in range(520):
        d = 60 + (rng.random() ** 1.7) * 5200
        a = radians(rng.uniform(8, 172))
        r = (30 + d * 0.075) * rng.uniform(0.7, 1.5)
        ob = bpy.data.objects.new('CloudSea_%03d' % i, bpy.data.meshes.new('CloudSea_%03d' % i))
        pm = bmesh.new()
        bmesh.ops.create_icosphere(pm, subdivisions=2, radius=1.0)
        pm.to_mesh(ob.data)
        pm.free()
        ob.data.materials.append(mat)
        ob.location = (cos(a) * d, sin(a) * d - 20, -38 - r * 0.28 + rng.uniform(-4, 6) + d * 0.004)
        ob.scale = (r, r, r * rng.uniform(0.36, 0.5) * (1.9 if i % 9 == 0 else 1.0))     # a few towers break the flat top
        ob['grp'] = 'env'
        ob['soft'] = 1
        coll.objects.link(ob)


def build_landscapes(scene):
    """Three collections, one per view; apply() shows exactly one of them."""
    env = {name: L.coll('Env_' + name) for name in ('sea', 'cumulus', 'cloudsea', 'horizon')}
    build_sea(env['sea'])
    puff = cloud_material('CloudPuff', density=0.0036, scale=0.011)
    far = cloud_material('CloudFar', density=0.0028, scale=0.006)
    build_cumulus(env['cumulus'], puff, 'CuHero', (-900, 4600, 150), 1300, 2100, 150, 3)
    build_cumulus(env['cumulus'], puff, 'CuRight', (2600, 6200, 180), 900, 1000, 60, 11)
    build_cumulus(env['cumulus'], far, 'CuFarL', (2300, 11000, 220), 1500, 1500, 60, 5)
    build_cumulus(env['cumulus'], far, 'CuFarR', (-4800, 14000, 240), 2200, 1300, 60, 8)
    build_cumulus(env['cumulus'], far, 'CuFarC', (600, 18000, 260), 2600, 900, 50, 9)
    build_cumulus(env['horizon'], far, 'CuLowA', (-2200, 9000, 180), 1500, 520, 40, 21)
    build_cumulus(env['horizon'], far, 'CuLowB', (2600, 12000, 200), 2200, 640, 44, 22)
    build_cloud_sea(env['cloudsea'], cloud_material('CloudSea', density=0.009, scale=0.016))
    return env


# ---------------------------------------------------------------- apply
def apply(scene, time='noon', scenery='sky'):
    p = TIMES[time]
    nt = scene.world.node_tree
    sky = nt.nodes['SKY']
    night = time == 'night'
    sky.sun_elevation = radians(max(p['sun_el'], 1.0))
    sky.sun_rotation = radians(p['sun_az'])          # Blender measures this from +Y as well
    sky.air_density = p['air']
    sky.aerosol_density = p['aerosol']
    sky.sun_disc = not night
    nt.nodes['DAY'].inputs['Strength'].default_value = p['sky']
    nt.nodes['NIGHT'].inputs['Strength'].default_value = 1.0
    nt.nodes['DAYNIGHT'].inputs['Fac'].default_value = 1.0 if night else 0.0
    sun = bpy.data.objects['Sun']
    sun.data.energy = p['sun']
    sun.data.color = p['sun_color']
    sun.data.angle = radians(p['sun_soft'])
    sun.rotation_euler = (-sun_vector(p['sun_el'], p['sun_az'])).to_track_quat('-Z', 'Y').to_euler()
    scene.view_settings.exposure = p['exposure']
    set_white_point(scene, time)
    nt.nodes['SKY_SEEN'].inputs['To Max'].default_value = p['sky_seen']
    # interior light: cove, lamps and screens share one dimmer per time of day
    k = p['interior']
    for m in bpy.data.materials:
        base = m.get('emit_base')
        if base is None:
            continue
        bsdf = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if bsdf:
            always = m.get('emit_always', 0.0)
            bsdf.inputs['Emission Strength'].default_value = base * (always + (1 - always) * k)
    # landscape
    show = {'sky': ('sea', 'cumulus'), 'cloud': ('cloudsea', 'horizon'), 'water': ('sea', 'horizon')}[scenery]
    for name in ('sea', 'cumulus', 'cloudsea', 'horizon'):
        c = bpy.data.collections.get('Env_' + name)
        if c:
            c.hide_render = name not in show
            c.hide_viewport = name not in show
    sea = bpy.data.materials.get('Sea')
    if sea:
        sea.node_tree.nodes['WAVE_BUMP'].inputs['Strength'].default_value = 0.3 if scenery == 'water' else 0.1
    scene['time'] = time
    scene['scenery'] = scenery
