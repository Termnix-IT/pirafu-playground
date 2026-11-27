"""Builds every asset of the Pirafu2411 Playground space and saves build/playground.blend.

    blender --background --factory-startup --python build_scene.py

Axes: X right, Y away from the camera, Z up. The viewer stands near (1.2, -9, 1.6) looking +Y.
Each object carries two custom properties used by bake_export.py:
  grp : which exported mesh it is joined into (structure / interior / glass / plants / ...)
  ao  : which ambient-occlusion atlas it is baked into (room / terms), if any
"""
import os
import sys
import random
from math import sin, cos, pi, radians, sqrt, exp

import bpy
import bmesh
import numpy as np
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import lib as L  # noqa: E402

OUT = os.path.join(HERE, 'build')
os.makedirs(OUT, exist_ok=True)
rng = random.Random(2411)
scene = L.reset_scene()

ARCH = L.coll('Architecture')
INTERIOR = L.coll('Interior')
PLANTS = L.coll('Plants')
TERMS = L.coll('Terminals')

# ---------------------------------------------------------------- materials
M = {}
M['steel'] = L.mat('WhiteSteel', '#f1f3f6', rough=0.36, coat=0.35)          # painted structure
M['plaster'] = L.mat('Plaster', '#e9e6e1', rough=0.86)                       # walls, plinths, dais
M['ceramic'] = L.mat('Ceramic', '#f7f6f2', rough=0.2, coat=0.6)              # terminal housings
M['alu'] = L.mat('Aluminum', '#c9d0d8', rough=0.27, metal=1.0)
M['champagne'] = L.mat('Champagne', '#d9c7a3', rough=0.3, metal=1.0)
M['rubber'] = L.mat('Rubber', '#39434f', rough=0.7)
M['keycap'] = L.mat('Keycap', '#e3e9f0', rough=0.48)
M['ink'] = L.mat('Ink', '#5c6878', rough=0.6)                                # engraved lettering
M['glass'] = L.mat('GlassClear', '#ffffff', rough=0.02, transmission=1.0, ior=1.5)
M['frost'] = L.mat('GlassFrost', '#eef6ff', rough=0.42, transmission=1.0, ior=1.45)
M['vault'] = L.mat('GlassVault', '#eaf4ff', rough=0.04, alpha=0.08, double_sided=True)
M['fabric'] = L.mat('Fabric', '#e6ebf1', rough=0.95, sheen=0.25)
M['fabric_dark'] = L.mat('FabricDark', '#9fb0c6', rough=1.0, sheen=0.2)
M['curtain'] = L.mat('Curtain', '#ffffff', rough=0.9, alpha=0.55, sheen=0.5, double_sided=True)
M['floor'] = L.mat('Floor', '#dfe5ec', rough=0.1)
M['pot'] = L.mat('Pot', '#efeee8', rough=0.72)
M['soil'] = L.mat('Soil', '#463c35', rough=1.0)
M['bark'] = L.mat('Bark', '#8b8178', rough=0.9)
M['stem'] = L.mat('Stem', '#6d7c57', rough=0.8)
M['leaf_a'] = L.mat('LeafA', '#5aa46e', rough=0.55, double_sided=True)
M['leaf_b'] = L.mat('LeafB', '#3f8a57', rough=0.55, double_sided=True)
M['leaf_c'] = L.mat('LeafC', '#8cbf8f', rough=0.55, double_sided=True)
M['olive_a'] = L.mat('OliveA', '#8fb59a', rough=0.6, double_sided=True)
M['olive_b'] = L.mat('OliveB', '#6f9e7f', rough=0.6, double_sided=True)
M['emit_cool'] = L.mat('EmitCool', '#ffffff', emission='#eaf2ff', strength=4.0)
M['emit_warm'] = L.mat('EmitWarm', '#ffffff', emission='#ffe2b8', strength=5.0)
BOOKS = [L.mat('BookGlass%d' % i, c, rough=0.08, transmission=1.0)
         for i, c in enumerate(('#bfe3ff', '#9fd0ff', '#d8ecff', '#a9e4f2', '#c9d6ff'))]

ACCENT = {'game': '#3184e5', 'tool': '#6692df', 'experiment': '#4dc19d', 'media': '#9fb4d6'}
LABEL = {'game': 'GAME', 'tool': 'TOOL', 'experiment': 'EXPERIMENT', 'media': 'MEDIA'}
for key, hexcol in ACCENT.items():
    on = key != 'media'
    M['screen_' + key] = L.mat('Screen_' + key, '#10203a', rough=0.1,
                               emission=hexcol if on else '#0c1424', strength=2.5 if on else 0.05)
    M['core_' + key] = L.mat('Core_' + key, '#ffffff', emission=hexcol, strength=6.0 if on else 0.0)
    M['tint_' + key] = L.mat('GlassTint_' + key, hexcol, rough=0.38, transmission=1.0)
    M['accent_' + key] = L.mat('Accent_' + key, hexcol, rough=0.45)


def wood_material():
    """Pale ash with a generated grain texture (packed into the .blend and the GLB)."""
    size = 1024
    g = np.random.default_rng(7)
    streak = np.repeat(g.random((size, 32)), size // 32, axis=1)
    for _ in range(6):
        streak = (np.roll(streak, 9, axis=1) + streak + np.roll(streak, -9, axis=1)) / 3
    fine = g.random((size, 1)) * np.ones((1, size))
    for _ in range(3):
        fine = (np.roll(fine, 1, axis=0) + fine + np.roll(fine, -1, axis=0)) / 3
    rings = 0.5 + 0.5 * np.sin(np.linspace(0, 40 * pi, size))[:, None] * np.ones((1, size))
    grain = 0.55 * streak + 0.3 * fine + 0.15 * rings
    grain = (grain - grain.min()) / (grain.max() - grain.min())
    base = np.array(L.srgb('#e3d3ba'))
    dark = np.array(L.srgb('#c9b08a'))
    rgb = base[None, None, :] * (1 - grain[..., None] * 0.55) + dark[None, None, :] * (grain[..., None] * 0.55)
    px = np.concatenate([rgb, np.ones((size, size, 1))], axis=2).astype(np.float32)
    img = bpy.data.images.new('wood_ash', size, size, alpha=False)
    img.colorspace_settings.name = 'sRGB'
    srgb_px = np.where(px <= 0.0031308, px * 12.92, 1.055 * np.power(np.clip(px, 1e-6, 1), 1 / 2.4) - 0.055)
    srgb_px[..., 3] = 1.0
    img.pixels.foreach_set(srgb_px.ravel())
    img.pack()
    m = L.mat('Wood', '#e3d3ba', rough=0.5, coat=0.15, coat_rough=0.3)
    nt = m.node_tree
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    return m


M['wood'] = wood_material()


def box_uv(ob, scale=1.0):
    """Planar UVs along the longest horizontal axis, for the wood grain."""
    me = ob.data
    uv = me.uv_layers.new(name='UVMap')
    for poly in me.polygons:
        n = poly.normal
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            if abs(n.z) > 0.6:
                uv.data[li].uv = (co.x * scale, co.y * scale)
            elif abs(n.y) > 0.6:
                uv.data[li].uv = (co.x * scale, co.z * scale)
            else:
                uv.data[li].uv = (co.y * scale, co.z * scale)


def place(name, bm, material, matrix, collection, grp, ao=None, **kw):
    ob = L.new_obj(name, bm, collection, material, grp=grp, ao=ao, **kw)
    ob.matrix_world = matrix
    return ob


def T(x=0, y=0, z=0):
    return Matrix.Translation((x, y, z))


def Rz(a):
    return Matrix.Rotation(a, 4, 'Z')


def Rx(a):
    return Matrix.Rotation(a, 4, 'X')


def Ry(a):
    return Matrix.Rotation(a, 4, 'Y')


# ---------------------------------------------------------------- architecture
A, B, Z0 = 8.6, 7.9, 0.45        # half span, rise and springing height of the vault
Y0, Y1 = -8.0, 16.0              # first and last rib
RIBS = (-8.0, -2.0, 4.0, 10.0, 16.0)


def arch(theta, y, off=0.0):
    return ((A + off) * cos(theta), y, Z0 + (B + off) * sin(theta))


def arch_top(x, off=0.0):
    return Z0 + (B + off) * sqrt(max(0.0, 1 - (x / (A + off)) ** 2))


# main ribs: deep, slender fins so their edges catch the light
rib_section = L.rrect(0.30, 0.11, 0.022, 3)
for i, y in enumerate(RIBS):
    pts = [arch(pi * k / 96, y, -0.15) for k in range(97)]
    L.new_obj('Rib_%d' % i, L.sweep(pts, rib_section, fixed_b=(0, 1, 0)), ARCH, M['steel'], grp='structure')
    for s in (-1, 1):
        L.new_obj('RibShoe_%d_%d' % (i, s), L.box(0.36, 0.2, 0.07, 0.008), ARCH, M['alu'],
                  loc=(s * (A - 0.15), y, Z0 + 0.035), grp='structure')

# purlins and thin secondary arches form the glazing grid
for i, deg in enumerate((18, 42, 66, 90, 114, 138, 162)):
    t = radians(deg)
    L.new_obj('Purlin_%d' % i, L.tube([arch(t, Y0, -0.03), arch(t, Y1, -0.03)], 0.028, 8), ARCH, M['steel'], grp='structure')
for i, y in enumerate((-5.0, 1.0, 7.0, 13.0)):
    pts = [arch(pi * k / 64, y, -0.03) for k in range(65)]
    L.new_obj('GlazingArch_%d' % i, L.tube(pts, 0.02, 6), ARCH, M['steel'], grp='structure')

# glass skin
bm = bmesh.new()
grid = [[bm.verts.new(arch(radians(2 + 176 * a / 72), Y0 + (Y1 - Y0) * b / 8, 0.02)) for a in range(73)] for b in range(9)]
for b in range(8):
    for a in range(72):
        bm.faces.new((grid[b][a], grid[b][a + 1], grid[b + 1][a + 1], grid[b + 1][a]))
L.new_obj('VaultGlass', bm, ARCH, M['vault'], grp='glass', recalc=False)

# plinths under the ribs, with planter strips on the left
for s in (-1, 1):
    L.new_obj('Plinth_%d' % s, L.box(0.9, 25.0, Z0, 0.02), ARCH, M['plaster'], loc=(s * (A - 0.05), 4.0, Z0 / 2), grp='interior', ao='room')
PLANTERS = ((-8.5, 1.0), (-8.5, 7.0), (8.5, 13.0))
for i, (x, y) in enumerate(PLANTERS):
    L.new_obj('PlanterSoil_%d' % i, L.box(0.52, 4.7, 0.03, 0.004), ARCH, M['soil'], loc=(x, y, Z0 + 0.012), grp='interior', ao='room')

# gable: glazed end wall with an open doorway onto the terrace
TRANSOM = 3.15
DOOR_HALF = 1.25
for x in (-5.6, -2.9, 2.9, 5.6):
    h = arch_top(x, -0.02)
    L.new_obj('Mullion_%.1f' % x, L.box(0.06, 0.12, h, 0.006), ARCH, M['steel'], loc=(x, Y1, h / 2), grp='structure')
for s in (-1, 1):
    h = arch_top(DOOR_HALF, -0.02)
    L.new_obj('Jamb_%d' % s, L.box(0.1, 0.16, TRANSOM, 0.008), ARCH, M['steel'], loc=(s * DOOR_HALF, Y1, TRANSOM / 2), grp='structure')
    L.new_obj('JambUpper_%d' % s, L.box(0.06, 0.12, h - TRANSOM, 0.006), ARCH, M['steel'],
              loc=(s * DOOR_HALF, Y1, (h + TRANSOM) / 2), grp='structure')
half = A * sqrt(1 - ((TRANSOM - Z0) / B) ** 2) - 0.05
L.new_obj('Transom', L.box(2 * half, 0.14, 0.08, 0.006), ARCH, M['steel'], loc=(0, Y1, TRANSOM), grp='structure')


def gable_pane(name, x0, x1, z_base):
    bm = bmesh.new()
    pts = [(x0, z_base), (x1, z_base)]
    for k in range(25):
        x = x1 + (x0 - x1) * k / 24
        pts.append((x, arch_top(x, 0.0) if abs(x) < A else Z0))
    if abs(x0) >= A - 1e-3:
        pts.append((x0, Z0))
    bm.faces.new([bm.verts.new((x, Y1, z)) for x, z in pts])
    L.new_obj(name, bm, ARCH, M['vault'], grp='glass', recalc=False)


gable_pane('GablePane_L', -A, -DOOR_HALF, 0.0)
gable_pane('GablePane_R', DOOR_HALF, A, 0.0)
gable_pane('GablePane_T', -DOOR_HALF, DOOR_HALF, TRANSOM)

# door leaves, swung open towards the horizon
for s, angle in ((-1, radians(104)), (1, radians(-98))):
    hinge = T(s * DOOR_HALF, Y1, 0) @ Rz(angle) @ (Matrix.Identity(4) if s < 0 else Matrix.Scale(-1, 4, (1, 0, 0)))
    for nm, bmx, loc in (('StileA', L.box(0.05, 0.045, TRANSOM - 0.06, 0.005), (0.035, 0, TRANSOM / 2)),
                         ('StileB', L.box(0.05, 0.045, TRANSOM - 0.06, 0.005), (1.2, 0, TRANSOM / 2)),
                         ('RailTop', L.box(1.2, 0.045, 0.05, 0.005), (0.62, 0, TRANSOM - 0.06)),
                         ('RailBottom', L.box(1.2, 0.045, 0.09, 0.005), (0.62, 0, 0.065))):
        place('Door%d_%s' % (s, nm), bmx, M['steel'], hinge @ T(*loc), ARCH, 'structure')
    bm = bmesh.new()
    bm.faces.new([bm.verts.new(p) for p in ((0.06, 0, 0.11), (1.18, 0, 0.11), (1.18, 0, TRANSOM - 0.09), (0.06, 0, TRANSOM - 0.09))])
    place('Door%d_Glass' % s, bm, M['vault'], hinge, ARCH, 'glass', recalc=False)
    place('Door%d_Handle' % s, L.tube([(1.1, -0.05, 0.9), (1.1, -0.05, 1.5)], 0.012, 10), M['alu'], hinge, ARCH, 'structure')

# floor and its slab
bm = bmesh.new()
FX, FY0, FY1 = 9.1, -13.0, 25.0
quad = [bm.verts.new(p) for p in ((-FX, FY0, 0), (FX, FY0, 0), (FX, FY1, 0), (-FX, FY1, 0))]
face = bm.faces.new(quad)
uv = bm.loops.layers.uv.new('UVMap')
for loop, co in zip(face.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
    loop[uv].uv = co
L.new_obj('Floor', bm, ARCH, M['floor'], grp='floor', recalc=False)
L.new_obj('FloorSlab', L.box(2 * FX + 0.12, FY1 - FY0 + 0.12, 0.3, 0.012), ARCH, M['plaster'],
          loc=(0, (FY0 + FY1) / 2, -0.152), grp='structure')

# central dais: two shallow steps and a metal inlay
DAIS = (1.1, 0.8)
L.new_obj('DaisLower', L.cyl(2.95, 0.12, 0.012, 96), ARCH, M['plaster'], loc=(*DAIS, 0), grp='interior', ao='room')
L.new_obj('DaisUpper', L.cyl(2.5, 0.12, 0.012, 96), ARCH, M['plaster'], loc=(*DAIS, 0.12), grp='interior', ao='room')
L.new_obj('DaisInlay', L.lathe([(2.3, 0.2408), (2.34, 0.2408)], 96, caps=False), ARCH, M['champagne'], loc=(*DAIS, 0), grp='interior', recalc=False)
DAIS_Z = 0.24

# free-standing wall with an arched doorway, and a bench in front of it
WALL = T(-4.9, 9.4, 0) @ Rz(1.2)        # turned to face the viewer, so the doorway frames the sky
wl, wh, s0, hw, spring = 2.6, 4.3, 0.6, 1.0, 2.2
outline = [(-wl, 0), (s0 - hw, 0)] + [(s0 - hw * cos(pi * k / 20), spring + hw * sin(pi * k / 20)) for k in range(21)] + [(s0 + hw, 0), (wl, 0), (wl, wh), (-wl, wh)]
bm, caps = L.prism_y(outline, 0.34)
L.bevel(bm, [e for c in caps for e in c.edges], 0.014, 2)
place('Wall', bm, M['plaster'], WALL @ Rz(pi / 2), ARCH, 'interior', 'room')
place('WallBench', L.box(0.5, 1.5, 0.4, 0.014), M['plaster'], WALL @ T(0.45, -1.7, 0.2), INTERIOR, 'interior', 'room')
ob = place('WallBenchTop', L.slab_z(0.54, 1.56, 0.035, 0.02, 0.005), M['wood'], WALL @ T(0.45, -1.7, 0.418), INTERIOR, 'interior', 'room')
box_uv(ob, 1.2)

# ring light
RING = (DAIS[0], DAIS[1], 5.5)
L.new_obj('RingHousing', L.lathe([(2.35 + u, v) for u, v in L.rrect(0.07, 0.05, 0.02, 3)], 160, closed=True), ARCH, M['steel'], loc=RING, grp='structure')
L.new_obj('RingGlow', L.lathe([(2.325, -0.0262), (2.375, -0.0262)], 160, caps=False), ARCH, M['emit_cool'], loc=RING, grp='emit', recalc=False)
for k in range(3):
    a = k * 2.094 + 0.5
    x, y = RING[0] + cos(a) * 2.35, RING[1] + sin(a) * 2.35
    L.new_obj('RingCable_%d' % k, L.tube([(x, y, RING[2]), (x, y, arch_top(x, -0.3))], 0.004, 5), ARCH, M['alu'], grp='structure')
L.empty('Light_ring', ARCH, loc=(RING[0], RING[1], RING[2] - 0.25))

# ---------------------------------------------------------------- interior
def floor_lamp(name, x, y, h=1.5):
    L.new_obj(name + '_Base', L.cyl(0.15, 0.022, 0.006, 48), INTERIOR, M['alu'], loc=(x, y, 0), grp='interior', ao='room')
    L.new_obj(name + '_Stem', L.tube([(x, y, 0.02), (x, y, h)], 0.011, 10), INTERIOR, M['alu'], grp='interior')
    L.new_obj(name + '_Collar', L.cyl(0.035, 0.03, 0.006, 24), INTERIOR, M['champagne'], loc=(x, y, h - 0.01), grp='interior')
    L.new_obj(name + '_Globe', L.sphere(0.16, 40, 20), INTERIOR, M['frost'], loc=(x, y, h + 0.16), grp='glass_solid', soft=True)
    L.new_obj(name + '_Bulb', L.sphere(0.055, 20, 10), INTERIOR, M['emit_warm'], loc=(x, y, h + 0.16), grp='emit', soft=True)
    L.empty('Light_' + name, INTERIOR, loc=(x, y, h + 0.16))


floor_lamp('lampA', -6.7, 3.9, 1.55)
floor_lamp('lampB', 5.0, -4.3, 1.35)

for i, (x, y, r) in enumerate(((3.2, 3.9, 0.3), (3.85, 3.3, 0.17), (2.75, 3.25, 0.11))):
    L.new_obj('Orb_%d' % i, L.sphere(r, 48, 24), INTERIOR, M['glass'], loc=(x, y, r + 0.012), grp='glass_solid', soft=True)
    L.new_obj('OrbCore_%d' % i, L.sphere(r * 0.26, 20, 10), INTERIOR, M['emit_warm'], loc=(x, y, r + 0.012), grp='emit', soft=True)
    L.new_obj('OrbFoot_%d' % i, L.torus(r * 0.42, 0.012, 48, 8), INTERIOR, M['champagne'], loc=(x, y, 0.012), grp='interior')
    L.empty('Light_orb%d' % i, INTERIOR, loc=(x, y, r + 0.012))


def soft_box(w, d, h, b=0.04):
    return L.box(w, d, h, b, 1)


# round daybed in the foreground: seen from above, it frames the lower right of the view
SOFA = T(3.15, -4.9, 0)
place('DaybedPlinth', L.cyl(0.98, 0.07, 0.006, 72), M['rubber'], SOFA, INTERIOR, 'interior', 'room')
place('DaybedBase', L.cyl(1.1, 0.15, 0.02, 96), M['plaster'], SOFA @ T(0, 0, 0.07), INTERIOR, 'interior', 'room')
place('DaybedCushion', L.cyl(1.06, 0.2, 0.085, 96), M['fabric'], SOFA @ T(0, 0, 0.22), INTERIOR, 'interior', 'room', soft=True)
place('DaybedPillowA', soft_box(0.5, 0.46, 0.15, 0.05), M['fabric_dark'], SOFA @ T(-0.3, 0.42, 0.49) @ Rz(0.5) @ Rx(0.12), INTERIOR, 'interior', 'room', subsurf=2)
place('DaybedPillowB', soft_box(0.42, 0.4, 0.13, 0.05), M['fabric'], SOFA @ T(0.12, 0.55, 0.5) @ Rz(-0.25) @ Rx(-0.2), INTERIOR, 'interior', 'room', subsurf=2)

# side table with glass books and a cup
TABLE = SOFA @ T(-1.5, -0.25, 0)
place('SideTableBase', L.cyl(0.17, 0.016, 0.005, 40), M['alu'], TABLE, INTERIOR, 'interior', 'room')
place('SideTableStem', L.tube([(0, 0, 0.016), (0, 0, 0.48)], 0.013, 10), M['alu'], TABLE, INTERIOR, 'interior')
ob = place('SideTableTop', L.cyl(0.27, 0.024, 0.006, 56), M['wood'], TABLE @ T(0, 0, 0.48), INTERIOR, 'interior', 'room')
box_uv(ob, 1.6)
for i, hgt in enumerate((0.21, 0.25, 0.18, 0.23, 0.2)):
    lean = Ry(-0.26) if i == 4 else Matrix.Identity(4)
    place('Book_%d' % i, L.box(0.03, 0.15, hgt, 0.003), BOOKS[i], TABLE @ T(-0.1 + i * 0.034 + (0.03 if i == 4 else 0), 0.02, 0.504 + hgt / 2) @ lean, INTERIOR, 'glass_solid')
cup = [(0, 0), (0.03, 0), (0.036, 0.004), (0.04, 0.075), (0.036, 0.075), (0.032, 0.008), (0, 0.008)]
place('Cup', L.lathe(cup, 32), M['ceramic'], TABLE @ T(0.12, -0.09, 0.504), INTERIOR, 'interior')

# sheer curtain on the right, gathered by a tie-back
CUR_C = Vector((6.3, 0.6, 0.0))
CUR_W = Vector((0.276, -0.961, 0.0))       # along the rail
CUR_N = Vector((0.961, 0.276, 0.0))        # fold direction
CW, CTOP, CBOT = 5.0, 5.5, 0.04
bm = bmesh.new()
uvl = bm.loops.layers.uv.new('UVMap')
NU, NV = 150, 72
rows = []
for j in range(NV + 1):
    k = j / NV
    gather = 1 - 0.7 * exp(-((k - 0.6) / 0.2) ** 2) - 0.08 * k
    kk = min(1.0, k / 0.6)
    shift = 1.45 * kk * kk * (3 - 2 * kk)
    row = []
    for i in range(NU + 1):
        u = i / NU
        along = (u - 0.5) * CW * gather + shift
        fold = sin(u * 2 * pi * 13 + 1.4 * sin(k * 4.0)) * (0.045 + 0.05 * k) * sqrt(gather)
        fold += 0.03 * sin(u * 2 * pi * 3.5 + k * 2.0)
        p = CUR_C + CUR_W * along + CUR_N * fold + Vector((0, 0, CTOP + (CBOT - CTOP) * k))
        row.append((bm.verts.new(p), (u, 1 - k)))
    rows.append(row)
for j in range(NV):
    for i in range(NU):
        corners = (rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i])
        f = bm.faces.new([c[0] for c in corners])
        for loop, c in zip(f.loops, corners):
            loop[uvl].uv = c[1]
L.new_obj('Curtain', bm, INTERIOR, M['curtain'], grp='curtain', soft=True, recalc=False)
rail = [CUR_C + CUR_W * ((u - 0.5) * CW * 0.94) + Vector((0, 0, CTOP + 0.03)) for u in (0, 1)]
L.new_obj('CurtainRail', L.tube(rail, 0.012, 10), INTERIOR, M['alu'], grp='structure')

# ---------------------------------------------------------------- plants
def leaf_object(name, leaves, materials, grp='plants'):
    bm = bmesh.new()
    for origin, direction, up, length, width, mi in leaves:
        for f in L.add_leaf(bm, origin, direction, up, length, width):
            f.material_index = mi
    return L.new_obj(name, bm, PLANTS, materials, grp=grp, angle=80, recalc=False)


# hanging vines from the upper left of the vault
stems = bmesh.new()
vine_leaves = []
for i in range(36):
    t = radians(rng.uniform(113, 148))
    y = rng.uniform(0.3, 7.6)
    top = Vector(arch(t, y, -0.08))
    length = rng.uniform(1.1, 3.9)
    ph = rng.uniform(0, 6.28)
    pts = []
    n = int(length / 0.12) + 2
    for k in range(n):
        d = k / (n - 1) * length
        pts.append(top + Vector((sin(d * 2.2 + ph) * 0.035 * d, cos(d * 1.7 + ph) * 0.03 * d, -d)))
    L.join_bm(stems, L.tube(pts, 0.0035, 3))
    d = 0.18
    while d < length:
        k = d / length * (n - 1)
        p = pts[int(k)].lerp(pts[min(n - 1, int(k) + 1)], k - int(k))
        a = rng.uniform(0, 6.28)
        size = rng.uniform(0.1, 0.17) * (1.0 - 0.3 * d / length)
        direction = Vector((cos(a), sin(a), rng.uniform(-0.9, -0.2)))
        vine_leaves.append((p, direction, (0, 0, 1), size, size * 0.66, rng.randrange(3)))
        d += rng.uniform(0.035, 0.075)
L.new_obj('VineStems', stems, PLANTS, M['stem'], grp='plants')
leaf_object('VineLeaves', vine_leaves, [M['leaf_a'], M['leaf_b'], M['leaf_c']])

# olive tree in a ceramic pot
TREE = Vector((-6.0, 2.2, 0.0))
pot = [(0, 0), (0.2, 0), (0.225, 0.012), (0.3, 0.5), (0.31, 0.53), (0.285, 0.53), (0.275, 0.5), (0.27, 0.47), (0, 0.47)]
L.new_obj('TreePot', L.lathe(pot, 56), PLANTS, M['pot'], loc=TREE, grp='interior', ao='room')
L.new_obj('TreeSoil', L.cyl(0.268, 0.01, 0.002, 40), PLANTS, M['soil'], loc=TREE + Vector((0, 0, 0.462)), grp='interior')
trunk = L.bezier(TREE + Vector((0, 0, 0.46)), TREE + Vector((0.1, 0.02, 1.1)), TREE + Vector((-0.12, 0.05, 1.7)), TREE + Vector((0.06, 0.0, 2.45)), 24)
wood = L.tube(trunk, 0.05, 10, taper=lambda u: 1.0 - 0.62 * u)
tree_leaves = []
for i in range(9):
    start = trunk[rng.randrange(12, 24)]
    a = i * 0.7 + rng.uniform(-0.2, 0.2)
    reach = rng.uniform(0.55, 0.95)
    end = start + Vector((cos(a) * reach, sin(a) * reach, rng.uniform(0.25, 0.75)))
    mid = start.lerp(end, 0.5) + Vector((0, 0, 0.22))
    branch = L.bezier(start, start.lerp(mid, 0.6), mid, end, 12)
    L.join_bm(wood, L.tube(branch, 0.016, 6, taper=lambda u: 1.0 - 0.7 * u))
    for k in range(150):
        u = rng.uniform(0.2, 1.0)
        spread = 0.07 + 0.12 * u
        p = branch[int(u * 12)] + Vector((rng.uniform(-spread, spread), rng.uniform(-spread, spread), rng.uniform(-spread, spread * 1.2)))
        direction = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-0.3, 0.9)))
        size = rng.uniform(0.12, 0.2)
        tree_leaves.append((p, direction, (0, 0, 1), size, size * 0.32, rng.randrange(2)))
L.new_obj('TreeWood', wood, PLANTS, M['bark'], grp='plants')
leaf_object('TreeLeaves', tree_leaves, [M['olive_a'], M['olive_b']])

# grass tufts in the planter strips
bm = bmesh.new()
for x, y in PLANTERS:
    for i in range(22):
        base = Vector((x + rng.uniform(-0.18, 0.18), y + rng.uniform(-2.2, 2.2), Z0 + 0.027))
        for b in range(11):
            a = rng.uniform(0, 6.28)
            h = rng.uniform(0.22, 0.52)
            bend = rng.uniform(0.15, 0.55)
            d = Vector((cos(a), sin(a), 0))
            side = Vector((-sin(a), cos(a), 0))
            prev = None
            for k in range(5):
                u = k / 4
                c = base + d * (bend * u * u * h) + Vector((0, 0, h * (u - 0.25 * u * u)))
                w = 0.011 * (1 - u) + 0.0008
                cur = (bm.verts.new(c - side * w), bm.verts.new(c + side * w))
                if prev:
                    f = bm.faces.new((prev[0], prev[1], cur[1], cur[0]))
                    f.material_index = rng.randrange(2)
                prev = cur
L.new_obj('Grass', bm, PLANTS, [M['leaf_a'], M['leaf_c']], grp='plants', angle=80, recalc=False)

# ---------------------------------------------------------------- terminals
def keyboard(key, root, grp, x, y, z, yaw=0.0):
    """Slim keyboard: metal tray, sculpted key grid, one accent-coloured key."""
    kb = L.empty('Keyboard_' + key, TERMS, loc=(x, y, z), rot=(0, 0, yaw), parent=root)
    L.new_obj('KbTray_' + key, L.slab_z(0.43, 0.15, 0.011, 0.014, 0.003), TERMS, M['alu'], loc=(0, 0, 0.0055), parent=kb, grp=grp, ao='terms')
    pitch, size, kh = 0.0265, 0.0225, 0.0065
    bm = bmesh.new()
    accent = bmesh.new()
    for row in range(5):
        col = 0
        while col < 15:
            span = 1
            if row == 0 and col == 5:
                span = 5                       # space bar
            elif col == 14 and row in (1, 2):
                span = 1
            w = size + pitch * (span - 1)
            cx = (col + span / 2 - 7.5) * pitch
            cy = (row - 2) * pitch
            target = accent if (row == 2 and col == 14) else bm
            bmesh.ops.create_cube(target, size=1.0, matrix=Matrix.Translation((cx, cy, 0.011 + kh / 2)) @ Matrix.Diagonal((w, size, kh, 1.0)))
            col += span
    L.bevel(bm, bm.edges[:], 0.0022, 1)
    L.bevel(accent, accent.edges[:], 0.0022, 1)
    L.new_obj('KbKeys_' + key, bm, TERMS, M['keycap'], parent=kb, grp=grp, ao='terms')
    L.new_obj('KbAccent_' + key, accent, TERMS, M['accent_' + key], parent=kb, grp=grp)
    return kb


def nameplate(key, root, grp, x, y, z, yaw=0.0):
    """Tilted metal plate with the category engraved on it."""
    np_root = L.empty('Nameplate_' + key, TERMS, loc=(x, y, z), rot=(0, 0, yaw), parent=root)
    w = 0.05 + 0.0165 * len(LABEL[key])
    tilt = L.empty('NameplateTilt_' + key, TERMS, loc=(0, 0, 0.028), rot=(-0.42, 0, 0), parent=np_root)
    L.new_obj('PlateFoot_' + key, L.slab_z(w * 0.7, 0.04, 0.006, 0.006, 0.0015), TERMS, M['alu'], loc=(0, 0.012, 0.003), parent=np_root, grp=grp)
    L.new_obj('Plate_' + key, L.slab_y(w, 0.046, 0.004, 0.006, 0.001), TERMS, M['ceramic'], parent=tilt, grp=grp)
    L.text('PlateText_' + key, LABEL[key], 0.017, TERMS, M['ink'], loc=(0, -0.0022, 0), parent=tilt, grp=grp)


def signpost(key, root, grp, x, y, yaw=0.0):
    """Gallery-style placard on a slim post: the category can be read from across the room."""
    sp = L.empty('Sign_' + key, TERMS, loc=(x, y, 0), rot=(0, 0, yaw), parent=root)
    w = 0.16 + 0.05 * len(LABEL[key])
    L.new_obj('SignBase_' + key, L.cyl(0.13, 0.014, 0.004, 40), TERMS, M['alu'], parent=sp, grp=grp, ao='terms')
    L.new_obj('SignPost_' + key, L.tube([(0, 0, 0.014), (0, 0, 0.96)], 0.009, 10), TERMS, M['alu'], parent=sp, grp=grp)
    tilt = L.empty('SignTilt_' + key, TERMS, loc=(0, -0.012, 1.0), rot=(-0.3, 0, 0), parent=sp)
    L.new_obj('SignPlate_' + key, L.slab_y(w, 0.13, 0.009, 0.014, 0.002), TERMS, M['ceramic'], parent=tilt, grp=grp)
    L.new_obj('SignRule_' + key, L.box(w - 0.06, 0.001, 0.0022, 0.0004, 1), TERMS, M['accent_' + key], loc=(0, -0.0048, -0.043), parent=tilt, grp=grp)
    L.text('SignText_' + key, LABEL[key], 0.056, TERMS, M['ink'], loc=(0, -0.0048, 0.006), parent=tilt, grp=grp, spacing=1.2)


def pedestal(key, root, grp, x, y, z, neck):
    """Weighted base that flares into a slim neck, with a ball joint on top."""
    prof = [(0, 0), (0.19, 0), (0.196, 0.005), (0.19, 0.013), (0.12, 0.019), (0.06, 0.03), (0.036, 0.055), (0.03, 0.09), (0.03, neck), (0, neck)]
    L.new_obj('StandBase_' + key, L.lathe(prof, 56), TERMS, M['ceramic'], loc=(x, y, z), parent=root, grp=grp, ao='terms', angle=50)
    L.new_obj('StandJoint_' + key, L.sphere(0.04, 24, 12), TERMS, M['alu'], loc=(x, y, z + neck + 0.02), parent=root, grp=grp, soft=True)


def display(key, root, grp, loc, tilt, W, H, chin, depth, radius=0.04):
    """Front of a terminal: ceramic frame, dark gasket, screen, chin with lettering and controls.

    Returns the head empty and (screen width, height, vertical offset).
    """
    head = L.empty('Head_' + key, TERMS, loc=loc, rot=(-tilt, 0, 0), parent=root)
    L.new_obj('Frame_' + key, L.slab_y(W, H, depth, radius, 0.006, 8), TERMS, M['ceramic'], parent=head, grp=grp, ao='terms')
    bz = 0.016
    sw, sh = W - 2 * bz, H - chin - bz
    zc = (chin - bz) / 2
    front = -depth / 2
    L.new_obj('Gasket_' + key, L.slab_y(sw + 0.007, sh + 0.007, 0.004, 0.02, 0.0012, 6), TERMS, M['rubber'], loc=(0, front - 0.0012, zc), parent=head, grp=grp)
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('UVMap')
    pts = L.rrect(sw, sh, 0.017, 6)
    f = bm.faces.new([bm.verts.new((x, 0, z)) for x, z in pts])
    for loop, (x, z) in zip(f.loops, pts):
        loop[uvl].uv = (x / sw + 0.5, z / sh + 0.5)
    scr = L.new_obj('Screen_' + key, bm, TERMS, M['screen_' + key], loc=(0, front - 0.0036, zc), parent=head, grp='screen', recalc=False)
    if scr.data.polygons[0].normal.y > 0:
        scr.data.flip_normals()
    zchin = -H / 2 + chin / 2 + 0.002
    L.text('Label_' + key, LABEL[key], 0.017, TERMS, M['ink'], loc=(-W / 2 + 0.03, front - 0.0002, zchin), parent=head, grp=grp, align='LEFT', spacing=1.25)
    L.new_obj('Dial_' + key, L.cyl(0.011, 0.007, 0.0015, 28), TERMS, M['alu'], loc=(W / 2 - 0.04, front, zchin), rot=(pi / 2, 0, 0), parent=head, grp=grp)
    for i in range(2):
        L.new_obj('Button_%s_%d' % (key, i), L.cyl(0.0042, 0.003, 0.0008, 16), TERMS, M['rubber'], loc=(W / 2 - 0.075 - i * 0.02, front, zchin), rot=(pi / 2, 0, 0), parent=head, grp=grp)
    L.new_obj('Led_' + key, L.cyl(0.0026, 0.0015, 0.0004, 12), TERMS, M['core_' + key], loc=(W / 2 - 0.122, front, zchin), rot=(pi / 2, 0, 0), parent=head, grp='emit')
    return head, (sw, sh, zc)


def crt_back(key, head, grp, W, H, depth, length=0.24, shrink=0.42):
    """Translucent housing that tapers back like a tube monitor; the core light shows through."""
    loops = []
    for t in (0.0, 0.18, 0.4, 0.62, 0.82, 1.0):
        s = 1 - shrink * t * t
        loops.append([(x, depth / 2 + length * t, z + 0.01 * t) for x, z in L.rrect(W * 0.94 * s, H * 0.94 * s, 0.05 * s + 0.01, 8)])
    L.new_obj('Back_' + key, L.loft(loops, cap_start=False), TERMS, M['tint_' + key], parent=head, grp='glass_solid', angle=60)
    L.new_obj('Core_' + key, L.cyl(0.026, 0.16, 0.012, 20), TERMS, M['core_' + key], loc=(-0.08, depth / 2 + length * 0.45, 0), rot=(0, pi / 2, 0), parent=head, grp='emit')
    for i in range(5):
        L.new_obj('Fin_%s_%d' % (key, i), L.box(0.004, 0.09, 0.11, 0.001, 1), TERMS, M['alu'], loc=(-0.06 + i * 0.03, depth / 2 + length * 0.45, -0.06), parent=head, grp=grp)


def build_game(root):
    key, grp = 'game', 'term_game'
    top = 0.72
    # desk: white top carried by two thick frosted panels
    L.new_obj('DeskTop_game', L.slab_z(1.7, 0.82, 0.042, 0.05, 0.008), TERMS, M['steel'], loc=(0, 0, top - 0.021), parent=root, grp=grp, ao='terms')
    for s in (-1, 1):
        L.new_obj('DeskLeg_game_%d' % s, L.slab_y(0.66, top - 0.06, 0.03, 0.02, 0.004), TERMS, M['frost'], loc=(s * 0.7, 0, (top - 0.06) / 2 + 0.012), rot=(0, 0, pi / 2), parent=root, grp='glass_solid')
        for z in (0.006, top - 0.048):
            L.new_obj('DeskShoe_game_%d_%d' % (s, int(z * 100)), L.box(0.05, 0.68, 0.012, 0.003, 1), TERMS, M['alu'], loc=(s * 0.7, 0, z), parent=root, grp=grp, ao='terms')
    W, H, chin, depth = 0.74, 0.62, 0.062, 0.05
    pedestal(key, root, grp, 0, 0.1, top, 0.085)
    head, scr = display(key, root, grp, (0, 0.085, top + 0.105 + H / 2), 0.1, W, H, chin, depth, 0.05)
    crt_back(key, head, grp, W, H, depth, 0.26)
    # carry handle
    handle = L.bezier((-0.17, 0.06, H / 2 - 0.004), (-0.17, 0.06, H / 2 + 0.085), (0.17, 0.06, H / 2 + 0.085), (0.17, 0.06, H / 2 - 0.004), 24)
    L.new_obj('Handle_game', L.tube(handle, 0.011, 12), TERMS, M['alu'], parent=head, grp=grp)
    for s in (-1, 1):
        L.new_obj('HandleLug_game_%d' % s, L.cyl(0.02, 0.012, 0.003, 20), TERMS, M['ceramic'], loc=(s * 0.17, 0.06, H / 2 - 0.004), parent=head, grp=grp)
    keyboard(key, root, grp, -0.05, -0.2, top, 0.0)
    nameplate(key, root, grp, -0.68, -0.3, top, 0.2)
    signpost(key, root, grp, 1.08, -0.5, -0.12)
    # game pad
    pad = L.empty('Pad_game', TERMS, loc=(0.52, -0.2, top), rot=(0, 0, -0.25), parent=root)
    L.new_obj('PadBody_game', L.slab_z(0.16, 0.085, 0.024, 0.036, 0.008), TERMS, M['ceramic'], loc=(0, 0, 0.012), parent=pad, grp=grp, ao='terms')
    for s in (-1, 1):
        L.new_obj('PadStick_game_%d' % s, L.cyl(0.011, 0.012, 0.003, 20), TERMS, M['rubber'], loc=(s * 0.045, -0.006, 0.024), parent=pad, grp=grp)
    L.new_obj('PadKey_game', L.cyl(0.007, 0.004, 0.001, 16), TERMS, M['accent_game'], loc=(0, 0.018, 0.024), parent=pad, grp=grp)
    # stool
    st = L.empty('Stool_game', TERMS, loc=(0.25, -0.95, 0), parent=root)
    L.new_obj('StoolFoot_game', L.lathe([(0, 0), (0.2, 0), (0.205, 0.006), (0.2, 0.014), (0.06, 0.024), (0.022, 0.06), (0.022, 0.4), (0, 0.4)], 48), TERMS, M['alu'], parent=st, grp='interior', ao='room', angle=50)
    L.new_obj('StoolSeat_game', L.cyl(0.19, 0.075, 0.03, 48), TERMS, M['fabric'], loc=(0, 0, 0.4), parent=st, grp='interior', ao='room', soft=True)
    return scr


def build_tool(root):
    key, grp = 'tool', 'term_tool'
    top = 0.74
    ob = L.new_obj('DeskTop_tool', L.slab_z(2.05, 0.9, 0.036, 0.03, 0.006), TERMS, M['wood'], loc=(0, 0, top - 0.018), parent=root, grp=grp, ao='terms')
    box_uv(ob, 0.9)
    for s in (-1, 1):                               # trestles
        x = s * 0.78
        apex = top - 0.04
        for sy in (-1, 1):
            L.new_obj('Trestle_tool_%d_%d' % (s, sy), L.tube([(x, sy * 0.36, 0.0), (x, sy * 0.1, apex)], 0.016, 10), TERMS, M['steel'], parent=root, grp=grp, ao='terms')
        L.new_obj('TrestleBar_tool_%d' % s, L.tube([(x, -0.24, 0.33), (x, 0.24, 0.33)], 0.011, 8), TERMS, M['steel'], parent=root, grp=grp)
        L.new_obj('TrestleCap_tool_%d' % s, L.box(0.07, 0.3, 0.02, 0.004, 1), TERMS, M['steel'], loc=(x, 0, apex + 0.008), parent=root, grp=grp, ao='terms')
    W, H, chin, depth = 1.2, 0.5, 0.05, 0.03
    hz = top + 0.2 + H / 2
    head, scr = display(key, root, grp, (0, 0.12, hz), 0.05, W, H, chin, depth, 0.028)
    L.new_obj('BackPlate_tool', L.slab_y(W * 0.9, H * 0.82, 0.016, 0.04, 0.004), TERMS, M['alu'], loc=(0, depth / 2 + 0.006, 0), parent=head, grp=grp, ao='terms')
    L.new_obj('BiasLight_tool', L.box(W * 0.6, 0.006, 0.006, 0.001, 1), TERMS, M['core_tool'], loc=(0, depth / 2 + 0.006, -H / 2 + 0.03), parent=head, grp='emit')
    # articulated arm clamped to the back edge
    ax, ay = 0.0, 0.41
    L.new_obj('ArmClamp_tool', L.box(0.08, 0.07, 0.085, 0.006), TERMS, M['alu'], loc=(ax, ay, top - 0.005), parent=root, grp=grp, ao='terms')
    L.new_obj('ArmPost_tool', L.tube([(ax, ay, top + 0.03), (ax, ay, hz - 0.02)], 0.017, 14), TERMS, M['alu'], parent=root, grp=grp)
    L.new_obj('ArmLink_tool', L.tube([(ax, ay, hz - 0.03), (ax, 0.17, hz + 0.01)], 0.014, 12), TERMS, M['steel'], parent=root, grp=grp)
    for p in ((ax, ay, hz - 0.03), (ax, 0.17, hz + 0.01)):
        L.new_obj('ArmJoint_tool_%d' % int(p[1] * 100), L.cyl(0.024, 0.05, 0.004, 24), TERMS, M['alu'], loc=(p[0] - 0.025, p[1], p[2]), rot=(0, pi / 2, 0), parent=root, grp=grp)
    keyboard(key, root, grp, -0.1, -0.2, top, 0.0)
    nameplate(key, root, grp, -0.86, -0.33, top, 0.15)
    signpost(key, root, grp, -1.3, -0.52, 0.18)
    # pen tablet, stylus and a machined dial
    L.new_obj('Tablet_tool', L.slab_z(0.34, 0.23, 0.008, 0.016, 0.002), TERMS, M['rubber'], loc=(0.5, -0.2, top + 0.004), rot=(0, 0, -0.12), parent=root, grp=grp, ao='terms')
    L.new_obj('Stylus_tool', L.lathe([(0, 0), (0.0045, 0.012), (0.0045, 0.15), (0, 0.15)], 12), TERMS, M['keycap'], loc=(0.46, -0.27, top + 0.013), rot=(pi / 2, 0, 0.9), parent=root, grp=grp)
    L.new_obj('Knob_tool', L.cyl(0.03, 0.022, 0.004, 40), TERMS, M['alu'], loc=(0.78, -0.24, top), parent=root, grp=grp, ao='terms')
    L.new_obj('KnobRing_tool', L.lathe([(0.018, 0.0222), (0.026, 0.0222)], 40, caps=False), TERMS, M['accent_tool'], loc=(0.78, -0.24, top), parent=root, grp=grp, recalc=False)
    return scr


def build_experiment(root):
    key, grp = 'experiment', 'term_experiment'
    top = 0.76
    L.new_obj('TableTop_experiment', L.cyl(0.64, 0.036, 0.008, 80), TERMS, M['steel'], loc=(0, 0, top - 0.036), parent=root, grp=grp, ao='terms')
    L.new_obj('TableColumn_experiment', L.lathe([(0.11, 0.024), (0.075, 0.2), (0.07, top - 0.036)], 40, caps=False), TERMS, M['frost'], parent=root, grp='glass_solid')
    L.new_obj('TableBase_experiment', L.cyl(0.34, 0.024, 0.006, 64), TERMS, M['alu'], parent=root, grp=grp, ao='terms')
    W, H, chin, depth = 0.56, 0.9, 0.055, 0.045
    pedestal(key, root, grp, 0, 0.12, top, 0.1)
    head, scr = display(key, root, grp, (0, 0.1, top + 0.12 + H / 2), 0.05, W, H, chin, depth, 0.045)
    # clear dome on the back with the working parts on show
    dome = L.lathe([(0.2 * sin(pi / 2 * i / 12), 0.2 * cos(pi / 2 * i / 12)) for i in range(13)][::-1], 40, caps=False)
    bmesh.ops.scale(dome, vec=(W * 0.43 / 0.2, H * 0.43 / 0.2, 1.0), verts=dome.verts[:])
    L.new_obj('Dome_experiment', dome, TERMS, M['glass'], loc=(0, depth / 2, 0), rot=(-pi / 2, 0, 0), parent=head, grp='glass_solid', soft=True)
    L.new_obj('Core_experiment', L.cyl(0.016, 0.13, 0.006, 16), TERMS, M['core_experiment'], loc=(0, depth / 2 + 0.02, 0), rot=(-pi / 2, 0, 0), parent=head, grp='emit')
    for i in range(3):
        L.new_obj('Coil_experiment_%d' % i, L.torus(0.05 - i * 0.008, 0.005, 40, 8), TERMS, M['champagne'], loc=(0, depth / 2 + 0.045 + i * 0.038, 0), rot=(pi / 2, 0, 0), parent=head, grp=grp)
    L.new_obj('DomeCollar_experiment', L.torus(0.2, 0.006, 4, 4), TERMS, M['alu'], loc=(0, depth / 2 + 0.002, 0), rot=(pi / 2, pi / 4, 0), parent=head, grp=grp).scale = (W * 0.43 / 0.2 * 0.72, 1, H * 0.43 / 0.2 * 0.72)
    keyboard(key, root, grp, 0.03, -0.25, top, 0.0)
    nameplate(key, root, grp, -0.38, -0.36, top, 0.35)
    signpost(key, root, grp, -0.95, -0.42, 0.45)
    # flask with a little glowing liquid, and a dish
    flask = [(0, 0), (0.06, 0), (0.066, 0.006), (0.066, 0.012), (0.02, 0.105), (0.02, 0.15), (0.024, 0.154), (0.024, 0.158), (0.017, 0.158), (0.017, 0.106), (0.06, 0.014), (0, 0.012)]
    L.new_obj('Flask_experiment', L.lathe(flask, 40), TERMS, M['glass'], loc=(0.36, -0.12, top), parent=root, grp='glass_solid', angle=60)
    L.new_obj('FlaskLiquid_experiment', L.lathe([(0, 0.013), (0.058, 0.015), (0.04, 0.05), (0, 0.05)], 32), TERMS, M['core_experiment'], loc=(0.36, -0.12, top), parent=root, grp='emit')
    L.new_obj('Dish_experiment', L.lathe([(0, 0), (0.05, 0), (0.052, 0.014), (0.049, 0.014), (0.047, 0.003), (0, 0.003)], 36), TERMS, M['glass'], loc=(0.3, -0.33, top), parent=root, grp='glass_solid')
    L.empty('Light_flask', TERMS, loc=(0.36, -0.12, top + 0.05), parent=root)
    return scr


def build_media(root):
    key, grp = 'media', 'term_media'
    top = 0.54
    # low credenza: white body, timber top, slatted front
    L.new_obj('Credenza_media', L.slab_y(1.76, top - 0.1, 0.5, 0.03, 0.006), TERMS, M['steel'], loc=(0, 0, 0.08 + (top - 0.1) / 2), parent=root, grp=grp, ao='terms')
    ob = L.new_obj('CredenzaTop_media', L.slab_z(1.8, 0.54, 0.03, 0.03, 0.005), TERMS, M['wood'], loc=(0, 0, top - 0.015), parent=root, grp=grp, ao='terms')
    box_uv(ob, 0.9)
    slats = bmesh.new()
    for i in range(34):
        bmesh.ops.create_cube(slats, size=1.0, matrix=Matrix.Translation((-0.8 + i * 0.0485, -0.256, 0.08 + (top - 0.13) / 2)) @ Matrix.Diagonal((0.022, 0.014, top - 0.16, 1.0)))
    L.bevel(slats, slats.edges[:], 0.003, 1)
    ob = L.new_obj('CredenzaSlats_media', slats, TERMS, M['wood'], parent=root, grp=grp, ao='terms')
    box_uv(ob, 0.9)
    for sx in (-0.74, 0.74):
        for sy in (-0.18, 0.18):
            L.new_obj('CredenzaFoot_media_%d_%d' % (int(sx * 10), int(sy * 10)), L.cyl(0.022, 0.08, 0.003, 20), TERMS, M['alu'], loc=(sx, sy, 0), parent=root, grp=grp, ao='terms')
    W, H, chin, depth = 1.14, 0.62, 0.05, 0.04
    for s in (-1, 1):
        L.new_obj('Foot_media_%d' % s, L.slab_z(0.045, 0.24, 0.012, 0.02, 0.003), TERMS, M['alu'], loc=(s * 0.34, 0.03, top + 0.006), parent=root, grp=grp, ao='terms')
        L.new_obj('FootPost_media_%d' % s, L.box(0.03, 0.02, 0.07, 0.004, 1), TERMS, M['alu'], loc=(s * 0.34, 0.06, top + 0.045), parent=root, grp=grp)
    head, scr = display(key, root, grp, (0, 0.04, top + 0.07 + H / 2), 0.04, W, H, chin, depth, 0.035)
    L.new_obj('BackPlate_media', L.slab_y(W * 0.86, H * 0.8, 0.03, 0.06, 0.008), TERMS, M['alu'], loc=(0, depth / 2 + 0.012, 0), parent=head, grp=grp, ao='terms')
    # speaker bar and a film reel
    L.new_obj('Speaker_media', L.slab_y(0.9, 0.075, 0.085, 0.036, 0.01), TERMS, M['fabric_dark'], loc=(0, -0.14, top + 0.04), parent=root, grp=grp, ao='terms')
    for s in (-1, 1):
        L.new_obj('SpeakerCap_media_%d' % s, L.cyl(0.03, 0.012, 0.003, 28), TERMS, M['alu'], loc=(s * 0.45 + (0 if s > 0 else 0.012), -0.14, top + 0.04), rot=(0, pi / 2, 0), parent=root, grp=grp)
    L.new_obj('Reel_media', L.lathe([(0.012, 0), (0.09, 0), (0.092, 0.003), (0.09, 0.006), (0.03, 0.006), (0.03, 0.03), (0.09, 0.03), (0.092, 0.033), (0.09, 0.036), (0.012, 0.036)], 48), TERMS, M['alu'], loc=(0.68, -0.1, top), parent=root, grp=grp, ao='terms', angle=50)
    nameplate(key, root, grp, -0.68, -0.2, top, 0.1)
    signpost(key, root, grp, 1.12, -0.42, -0.25)
    return scr


# position (x, depth) and yaw of each terminal; asymmetry is deliberate
LAYOUT = {
    'game': ((-2.1, -3.0, 0.0), 0.10, build_game),
    'tool': ((1.1, 0.8, DAIS_Z), 0.40, build_tool),
    'experiment': ((3.7, -2.4, 0.0), -0.70, build_experiment),
    'media': ((-3.9, 5.2, 0.0), 0.68, build_media),
}
SCREEN_INFO = {}
for key, (loc, yaw, builder) in LAYOUT.items():
    root = L.empty('Terminal_' + key, TERMS, loc=loc, rot=(0, 0, yaw))
    SCREEN_INFO[key] = builder(root)

# ---------------------------------------------------------------- finish
L.finalize_meshes()
bpy.context.view_layer.update()
tris = sum(sum(len(p.vertices) - 2 for p in ob.data.polygons) for ob in scene.objects if ob.type == 'MESH')
print('OBJECTS', len(scene.objects), 'TRIANGLES', tris)
for key, (sw, sh, zc) in SCREEN_INFO.items():
    print('SCREEN', key, round(sw, 3), round(sh, 3))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'playground.blend'))
print('SAVED', os.path.join(OUT, 'playground.blend'))
