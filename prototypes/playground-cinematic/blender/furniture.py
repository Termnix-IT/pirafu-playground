"""Terminals and furniture, designed as one family.

Design language: each piece is a soft ceramic monolith (plain solids fused and rounded by
lib.soften), so desk, seat and display housing are one continuous body instead of a screen on a
table. Precise parts are then set into it: the display glass, satin aluminium controls,
anodised details in the colour borrowed from the work, and fabric where a person would touch it.

  GAME        an arcade-like console with a sloped control deck, stick and buttons
  TOOL        a wing desk whose rear rises into a wide display; dial, tablet, keyboard
  EXPERIMENT  a standing column with a portrait display and a glass bell jar
  MEDIA       a curved screening wall with a fabric speaker band, and a chaise in front of it
"""
import os
import json
from math import sin, cos, pi, radians

import bpy
import bmesh
from mathutils import Vector, Matrix

import lib as L
import arch

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
WORKS = {'game': 'dopasweeper', 'tool': 'poseref', 'experiment': 'blue-archive-db', 'media': None}
ACCENT = {'game': '#3184e5', 'tool': '#6692df', 'experiment': '#4dc19d', 'media': '#9fb4d6'}
LABEL = {'game': 'GAME', 'tool': 'TOOL', 'experiment': 'EXPERIMENT', 'media': 'MEDIA'}
YAW = {'game': 0.55, 'tool': -0.1, 'experiment': -0.75, 'media': 0.62}     # the front of a terminal is local -Y
PLACE = {key: ((c[0], c[1], h), YAW[key]) for key, (c, _, _, h) in arch.STAGES.items()}
CAMERAS = {}


def T(x=0, y=0, z=0):
    return Matrix.Translation((x, y, z))


def Rx(a):
    return Matrix.Rotation(a, 4, 'X')


def Rz(a):
    return Matrix.Rotation(a, 4, 'Z')


def COLUMN(h):
    """Waisted pedestal: wide foot, slim middle, flared top."""
    return L.lathe([(0, 0), (0.3, 0), (0.29, 0.05), (0.21, h * 0.42), (0.2, h * 0.84), (0.26, h), (0, h)], 48)


def union(parts):
    """parts: list of (bmesh, matrix). Returns one bmesh holding all of them."""
    bm = bmesh.new()
    for part, matrix in parts:
        L.join_bm(bm, part, matrix)
    return bm


def screen_material(key):
    """Emissive display showing the work's own thumbnail, under a glossy glass face."""
    m = L.mat('Screen_' + key, '#05080d', rough=0.06)
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    work = WORKS[key]
    strength = 1.5
    if work:
        record = json.load(open(os.path.join(REPO, 'catalog', 'projects', work + '.json'), encoding='utf-8'))
        img = bpy.data.images.load(os.path.join(REPO, 'catalog', record['catalog']['thumbnail']['path']))
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = img
        tex.extension = 'EXTEND'
        nt.links.new(tex.outputs['Color'], bsdf.inputs['Emission Color'])
    else:
        bsdf.inputs['Emission Color'].default_value = (0.02, 0.03, 0.05, 1)
        strength = 0.15
    bsdf.inputs['Emission Strength'].default_value = strength
    m['emit_base'] = strength
    m['emit_always'] = 0.8
    return m


def add_screen(key, parent, coll, M, w, h, loc, tilt=0.0, radius=0.018):
    """Display glass set into the housing: dark border, then the lit panel. Faces local -Y."""
    holder = L.empty('ScreenHolder_' + key, coll, loc=loc, rot=(-tilt, 0, 0), parent=parent)
    L.new_obj('ScreenBorder_' + key, L.slab_y(w + 0.022, h + 0.022, 0.016, radius + 0.008, 0.003, 6), coll, M['blackglass'], parent=holder, grp='term_' + key)
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('UVMap')
    pts = L.rrect(w, h, radius, 6)
    f = bm.faces.new([bm.verts.new((x, 0, z)) for x, z in pts])
    aspect = (w / h) / (4 / 3)                         # thumbnails are 4:3; crop to the screen, never stretch
    for loop, (x, z) in zip(f.loops, pts):
        u, v = x / w, z / h
        if aspect > 1:
            v /= aspect
        else:
            u *= aspect
        loop[uvl].uv = (u + 0.5, v + 0.5)
    scr = L.new_obj('Screen_' + key, bm, coll, M['screen_' + key], loc=(0, -0.0085, 0), parent=holder, grp='screen', recalc=False)
    if scr.data.polygons[0].normal.y > 0:
        scr.data.flip_normals()
    return holder


def keyboard(key, parent, coll, M, loc, yaw=0.0, cols=14):
    kb = L.empty('Keyboard_' + key, coll, loc=loc, rot=(0, 0, yaw), parent=parent)
    pitch, size, kh = 0.0195, 0.0165, 0.006
    width = cols * pitch + 0.02
    L.new_obj('KbTray_' + key, L.slab_z(width, 5 * pitch + 0.018, 0.012, 0.012, 0.003), coll, M['alu'], loc=(0, 0, 0.006), parent=kb, grp='term_' + key)
    keys, accent = bmesh.new(), bmesh.new()
    for row in range(5):
        col = 0
        while col < cols:
            span = 5 if (row == 0 and col == 4) else 1
            w = size + pitch * (span - 1)
            cx = (col + span / 2 - cols / 2) * pitch
            cy = (row - 2) * pitch
            target = accent if (row == 2 and col == cols - 1) else keys
            bmesh.ops.create_cube(target, size=1.0, matrix=Matrix.Translation((cx, cy, 0.012 + kh / 2)) @ Matrix.Diagonal((w, size, kh, 1.0)))
            col += span
    L.bevel(keys, keys.edges[:], 0.0018, 1)
    L.bevel(accent, accent.edges[:], 0.0018, 1)
    L.new_obj('KbKeys_' + key, keys, coll, M['keycap'], parent=kb, grp='term_' + key)
    L.new_obj('KbAccent_' + key, accent, coll, M['accent_' + key], parent=kb, grp='term_' + key)
    return kb


def engraving(key, parent, coll, M, loc, rot, size=0.02, text=None):
    return L.text('Engrave_%s_%d' % (key, int(abs(loc[2]) * 1000)), text or LABEL[key], size, coll, M['ink'], loc=loc, rot=rot, parent=parent, grp='term_' + key, spacing=1.3)


def placard(key, parent, coll, M, loc, yaw=0.0):
    """Low anodised blade standing on the stage with the category cut into it."""
    root = L.empty('Placard_' + key, coll, loc=loc, rot=(0, 0, yaw), parent=parent)
    w = 0.12 + 0.034 * len(LABEL[key])
    L.new_obj('PlacardBlade_' + key, L.slab_y(w, 0.17, 0.012, 0.016, 0.003), coll, M['alu'], loc=(0, 0, 0.085), rot=(-0.3, 0, 0), parent=root, grp='term_' + key)
    L.new_obj('PlacardLine_' + key, L.box(w - 0.06, 0.002, 0.003, 0.0005, 1), coll, M['accent_' + key], loc=(0, -0.019, 0.05), rot=(-0.3, 0, 0), parent=root, grp='term_' + key)
    L.text('PlacardText_' + key, LABEL[key], 0.036, coll, M['ink'], loc=(0, -0.0092, 0.095), rot=(pi / 2 - 0.3, 0, 0), parent=root, grp='term_' + key, spacing=1.2)


# ---------------------------------------------------------------- terminals
def build_game(root, coll, M):
    key = 'game'
    body = union([
        (COLUMN(0.74), T(0, 0.1, 0) @ Matrix.Diagonal((1.25, 1.0, 1.0, 1.0))),              # waisted trunk
        (L.slab_z(1.06, 0.62, 0.12, 0.22, 0.03), T(0, -0.1, 0.8) @ Rx(0.16)),                       # control deck, sloping to the player
        (L.slab_y(0.5, 0.3, 0.16, 0.08, 0.03), T(0, 0.31, 0.95)),                                  # spine
        (L.slab_y(0.98, 0.76, 0.22, 0.17, 0.04), T(0, 0.3, 1.34) @ Rx(-0.15)),                      # display housing
    ])
    L.soften(L.new_obj('Body_game', body, coll, M['ceramic'], parent=root, grp='term_game'), 0.01, 6)
    add_screen(key, root, coll, M, 0.76, 0.56, (0, 0.188, 1.34), 0.15, 0.06)
    deck = L.empty('Deck_game', coll, loc=(0, -0.1, 0.872), rot=(0.16, 0, 0), parent=root)
    L.new_obj('StickBase_game', L.cyl(0.05, 0.012, 0.003, 32), coll, M['alu'], loc=(-0.3, 0.0, 0), parent=deck, grp='term_game')
    L.new_obj('StickStem_game', L.tube([(-0.3, 0, 0.01), (-0.3, 0, 0.1)], 0.008, 12), coll, M['alu'], parent=deck, grp='term_game')
    L.new_obj('StickBall_game', L.sphere(0.03, 24, 12), coll, M['accent_game'], loc=(-0.3, 0, 0.12), parent=deck, grp='term_game', soft=True)
    for i, (x, y) in enumerate(((0.2, 0.03), (0.3, 0.07), (0.4, 0.03))):
        L.new_obj('ButtonRing_game_%d' % i, L.cyl(0.03, 0.006, 0.002, 28), coll, M['alu'], loc=(x, y, 0), parent=deck, grp='term_game')
        L.new_obj('Button_game_%d' % i, L.cyl(0.024, 0.016, 0.006, 28), coll, M['acrylic_game'], loc=(x, y, 0.002), parent=deck, grp='term_game')
    L.new_obj('StartKey_game', L.slab_z(0.07, 0.022, 0.006, 0.01, 0.002), coll, M['alu'], loc=(0.0, 0.16, 0.004), parent=deck, grp='term_game')
    engraving(key, deck, coll, M, (0.0, -0.2, 0.0016), (0, 0, 0), 0.022)
    # stool: a pebble with a cloth top
    stool = L.empty('Stool_game', coll, loc=(0.1, -0.95, 0), rot=(0, 0, 0.3), parent=root)
    L.soften(L.new_obj('StoolBody_game', union([(L.cyl(0.2, 0.36, 0.01, 40), T()), (L.cyl(0.25, 0.1, 0.01, 40), T(0, 0, 0.34))]), coll, M['ceramic'], parent=stool, grp='term_game'), 0.012, 14)
    L.new_obj('StoolPad_game', L.cyl(0.23, 0.05, 0.022, 48), coll, M['fabric'], loc=(0, 0, 0.44), parent=stool, grp='term_game', soft=True)
    placard(key, root, coll, M, (0.95, -0.55, 0), -0.25)
    CAMERAS['game'] = ((-1.75, -4.25, 1.42), (-3.6, -2.15, 1.08), 40.0, 4.0)


def build_tool(root, coll, M):
    key = 'tool'
    body = union([
        (COLUMN(0.7), T(-0.72, 0.0, 0) @ Matrix.Diagonal((1.0, 1.3, 1.0, 1.0))),             # pedestal on one side
        (L.slab_z(2.1, 0.88, 0.085, 0.3, 0.03), T(0.02, 0, 0.735)),                              # wing top
        (L.box(0.085, 0.66, 0.7, 0.02), T(0.94, 0, 0.35)),                               # slim blade leg
        (L.slab_y(0.34, 0.36, 0.12, 0.1, 0.03), T(0.05, 0.38, 0.9)),                             # neck rising from the back edge
        (L.slab_y(1.44, 0.62, 0.1, 0.1, 0.03), T(0.05, 0.36, 1.33) @ Rx(-0.08)),                 # wide display housing
    ])
    L.soften(L.new_obj('Body_tool', body, coll, M['ceramic'], parent=root, grp='term_tool'), 0.01, 6)
    add_screen(key, root, coll, M, 1.3, 0.48, (0.05, 0.308, 1.33), 0.08, 0.04)
    top = 0.78
    keyboard(key, root, coll, M, (0.0, -0.17, top), 0.0)
    L.new_obj('Dial_tool', L.cyl(0.036, 0.026, 0.005, 48), coll, M['alu'], loc=(0.34, -0.2, top), parent=root, grp='term_tool')
    L.new_obj('DialRing_tool', L.lathe([(0.02, 0.0262), (0.03, 0.0262)], 48, caps=False), coll, M['accent_tool'], loc=(0.34, -0.2, top), parent=root, grp='term_tool', recalc=False)
    L.new_obj('Tablet_tool', L.slab_z(0.36, 0.25, 0.008, 0.018, 0.002), coll, M['blackglass'], loc=(0.66, -0.16, top + 0.004), rot=(0, 0, -0.1), parent=root, grp='term_tool')
    L.new_obj('Stylus_tool', L.lathe([(0, 0), (0.0045, 0.012), (0.0045, 0.15), (0, 0.15)], 12), coll, M['alu'], loc=(0.6, -0.26, top + 0.013), rot=(pi / 2, 0, 0.9), parent=root, grp='term_tool')
    engraving(key, root, coll, M, (-0.72, -0.385, 0.5), (pi / 2, 0, 0), 0.03)
    # chair: seat and back as one shell on a column, with a cloth pad
    chair = L.empty('Chair_tool', coll, loc=(0.12, -0.92, 0), rot=(0, 0, 0.22), parent=root)
    shell = union([
        (L.cyl(0.24, 0.03, 0.008, 40), T()),
        (L.cyl(0.045, 0.42, 0.004, 20), T()),
        (L.box(0.5, 0.5, 0.09, 0.02), T(0, 0, 0.44)),
        (L.box(0.48, 0.09, 0.42, 0.02), T(0, -0.24, 0.66) @ Rx(0.14)),
    ])
    L.soften(L.new_obj('ChairShell_tool', shell, coll, M['ceramic'], parent=chair, grp='term_tool'), 0.012, 14)
    L.new_obj('ChairPad_tool', L.box(0.42, 0.4, 0.05, 0.02, 2), coll, M['fabric'], loc=(0, 0.02, 0.5), parent=chair, grp='term_tool', subsurf=2)
    placard(key, root, coll, M, (-1.35, -0.62, 0), 0.2)
    CAMERAS['tool'] = ((3.3, 1.5, 1.45), (1.6, 4.05, 1.02), 40.0, 4.0)


def build_experiment(root, coll, M):
    key = 'experiment'
    body = union([
        (L.lathe([(0, 0), (0.34, 0), (0.33, 0.06), (0.21, 0.45), (0.2, 0.85), (0.3, 1.0), (0, 1.0)], 48), T()),   # waisted column
        (L.slab_z(0.7, 0.46, 0.07, 0.2, 0.025), T(0.02, -0.14, 1.0) @ Rx(0.1)),                                           # working ledge
        (L.box(0.3, 0.12, 0.26, 0.02), T(0, 0.2, 1.12)),
        (L.slab_y(0.66, 0.98, 0.13, 0.2, 0.03), T(0, 0.17, 1.62) @ Rx(-0.12)),                                           # portrait display
        (L.slab_z(0.56, 0.36, 0.06, 0.16, 0.02), T(0.5, 0.05, 1.02)),                                                     # side shelf for the bell jar
    ])
    L.soften(L.new_obj('Body_experiment', body, coll, M['ceramic'], parent=root, grp='term_experiment'), 0.01, 6)
    add_screen(key, root, coll, M, 0.5, 0.8, (0, 0.103, 1.62), 0.12, 0.12)
    keyboard(key, root, coll, M, (0.0, -0.17, 1.055), 0.0, cols=11).rotation_euler = (0.1, 0, 0)
    # bell jar with a small living thing under it
    jar = L.empty('Jar_experiment', coll, loc=(0.56, 0.05, 1.05), parent=root)
    L.new_obj('JarBase_experiment', L.cyl(0.11, 0.014, 0.004, 40), coll, M['alu'], parent=jar, grp='term_experiment')
    prof = [(0.1, 0.014), (0.1, 0.17), (0.085, 0.23), (0.045, 0.265), (0.0, 0.272)]
    L.new_obj('JarGlass_experiment', L.lathe(prof, 48, caps=False), coll, M['glass'], parent=jar, grp='glass_solid', soft=True, recalc=False)
    L.new_obj('JarKnob_experiment', L.sphere(0.014, 16, 8), coll, M['clearglass'], loc=(0, 0, 0.284), parent=jar, grp='glass_solid', soft=True)
    L.new_obj('JarMoss_experiment', L.sphere(0.05, 20, 10), coll, M['moss'], loc=(0, 0, 0.03), parent=jar, grp='term_experiment', soft=True).scale = (1.3, 1.3, 0.5)
    leaves = bmesh.new()
    for i in range(9):
        a = i * 2.4
        for f in L.add_leaf(leaves, (cos(a) * 0.01, sin(a) * 0.01, 0.04), (cos(a) * 0.5, sin(a) * 0.5, 1.0), (0, 0, 1), 0.07 + 0.012 * (i % 3), 0.022):
            pass
    L.new_obj('JarSprout_experiment', leaves, coll, M['leaf'], parent=jar, grp='term_experiment', angle=80, recalc=False)
    L.new_obj('JarGlow_experiment', L.cyl(0.07, 0.003, 0.001, 32), coll, M['core_experiment'], loc=(0, 0, 0.0145), parent=jar, grp='emit')
    engraving(key, root, coll, M, (0, -0.337, 0.6), (pi / 2, 0, 0), 0.02)
    placard(key, root, coll, M, (-0.85, -0.5, 0), 0.5)
    CAMERAS['experiment'] = ((1.75, -5.55, 1.55), (3.55, -3.05, 1.25), 35.0, 4.0)


def build_media(root, coll, M):
    key = 'media'
    parts = []
    radius, n = 3.2, 37
    for i in range(n):                                    # a wall bent like a shallow shell, lower towards its ends
        u = 2 * i / (n - 1) - 1
        a = radians(27 * u)
        x, y = sin(a) * radius, radius - cos(a) * radius
        h = 1.62 - 0.42 * u * u
        parts.append((L.box(0.2, 0.22, h, 0.02), T(x, y, h / 2) @ Rz(-a)))
    parts.append((L.box(1.2, 0.5, 0.2, 0.02), T(0, -0.2, 0.1)))               # low plinth carrying the speaker
    L.soften(L.new_obj('Body_media', union(parts), coll, M['ceramic'], parent=root, grp='term_media'), 0.014, 14)
    add_screen(key, root, coll, M, 1.5, 0.78, (0, -0.108, 1.02), 0.0, 0.03)
    L.new_obj('Speaker_media', L.slab_y(1.1, 0.13, 0.12, 0.06, 0.02), coll, M['fabric_dark'], loc=(0, -0.3, 0.27), parent=root, grp='term_media')
    for s in (-1, 1):
        L.new_obj('SpeakerCap_media_%d' % s, L.cyl(0.05, 0.012, 0.003, 32), coll, M['alu'], loc=(s * 0.55 - (0.012 if s > 0 else 0), -0.3, 0.27), rot=(0, pi / 2, 0), parent=root, grp='term_media')
    engraving(key, root, coll, M, (0, -0.4515, 0.1), (pi / 2, 0, 0), 0.026)
    # chaise facing the screen
    chaise = L.empty('Chaise_media', coll, loc=(0.25, -1.75, 0), rot=(0, 0, 0.12), parent=root)
    shell = union([
        (L.box(0.74, 1.3, 0.22, 0.02), T(0, 0, 0.13)),
        (L.box(0.74, 0.3, 0.5, 0.02), T(0, -0.56, 0.38) @ Rx(0.35)),
    ])
    L.soften(L.new_obj('ChaiseShell_media', shell, coll, M['ceramic'], parent=chaise, grp='term_media'), 0.014, 16)
    L.new_obj('ChaisePad_media', L.box(0.64, 1.0, 0.09, 0.03, 2), coll, M['fabric'], loc=(0, 0.1, 0.285), parent=chaise, grp='term_media', subsurf=2)
    L.new_obj('ChaisePillow_media', L.box(0.5, 0.26, 0.11, 0.04, 2), coll, M['fabric_dark'], loc=(0, -0.44, 0.42), rot=(0.4, 0, 0.08), parent=chaise, grp='term_media', subsurf=2)
    placard(key, root, coll, M, (1.55, -1.0, 0), -0.35)
    CAMERAS['media'] = ((-2.35, 0.75, 1.55), (-5.2, 4.1, 0.85), 30.0, 4.0)


# ---------------------------------------------------------------- lounge
def build_lounge(coll, M):
    """The sunken lounge: a sofa that follows the pit's curve, a low table, a lamp."""
    cx, cy = arch.PIT['c']
    z0 = arch.PIT['depth']
    root = L.empty('Lounge', coll, loc=(cx, cy, z0))
    parts = []
    for i in range(11):
        a = radians(-78 + 156 * i / 10)                   # the sofa backs onto the shell and the low window
        x, y = cos(a) * 1.5, sin(a) * 1.5
        parts.append((L.box(0.62, 0.46, 0.3, 0.02), T(x, y, 0.15) @ Rz(a + pi / 2)))
        parts.append((L.box(0.2, 0.6, 0.62, 0.02), T(cos(a) * 1.78, sin(a) * 1.78, 0.31) @ Rz(a + pi / 2) @ Matrix.Rotation(pi / 2, 4, 'Z')))
    L.soften(L.new_obj('SofaBase', union(parts), coll, M['ceramic'], parent=root, grp='furniture'), 0.014, 16)
    for i in range(5):
        a = radians(-62 + 124 * i / 4)
        L.new_obj('SofaSeat_%d' % i, L.box(0.56, 0.7, 0.12, 0.04, 2), coll, M['fabric'], loc=(cos(a) * 1.46, sin(a) * 1.46, 0.36), rot=(0, 0, a + pi / 2), parent=root, grp='furniture', subsurf=2)
        if i != 1:
            L.new_obj('SofaBack_%d' % i, L.box(0.5, 0.14, 0.3, 0.04, 2), coll, M['fabric_dark' if i == 3 else 'fabric'], loc=(cos(a) * 1.68, sin(a) * 1.68, 0.58), rot=(-0.2, 0, a + pi / 2), parent=root, grp='furniture', subsurf=2)
    table = union([(L.cyl(0.2, 0.26, 0.01, 40), T()), (L.cyl(0.42, 0.06, 0.01, 56), T(0, 0, 0.24))])
    L.soften(L.new_obj('LoungeTable', table, coll, M['ceramic'], loc=(0.05, 0.0, 0), parent=root, grp='furniture'), 0.012, 12)
    L.new_obj('LoungeTableInlay', L.lathe([(0.3, 0.3005), (0.31, 0.3005)], 64, caps=False), coll, M['inlay'], loc=(0.05, 0, 0), parent=root, grp='furniture', recalc=False)
    CAMERAS['sofa'] = ((2.3, -1.9, 0.95), (5.0, 0.6, 0.05), 32.0, 4.0)


def build(scene, colls, M, emitter):
    coll = colls['FURN']
    M['ceramic'] = L.mat('Ceramic', '#f6f4f0', rough=0.2, coat=0.5, coat_rough=0.08)
    M['alu'] = L.mat('SatinAluminum', '#c6ccd3', rough=0.38, metal=1.0)
    M['blackglass'] = L.mat('BlackGlass', '#0b0e13', rough=0.05)
    M['keycap'] = L.mat('Keycap', '#e9ecef', rough=0.45)
    M['ink'] = L.mat('Ink', '#6f7a88', rough=0.6)
    M['white_ink'] = L.mat('WhiteInk', '#f5f6f7', rough=0.5)
    M['clearglass'] = L.mat('ClearGlass', '#ffffff', rough=0.0, transmission=1.0, ior=1.5)
    M['fabric'] = L.mat('Boucle', '#e3e0da', rough=0.95, sheen=0.4)
    M['fabric_dark'] = L.mat('WoolBlue', '#7f93ad', rough=0.95, sheen=0.3)
    M['moss'] = L.mat('Moss', '#4d7a4a', rough=0.9)
    M['leaf'] = L.mat('Leaf', '#5c9c62', rough=0.5, double_sided=True)
    for m in (M['fabric'], M['fabric_dark']):                # woven texture: fine bump, visible only close up
        nt = m.node_tree
        bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
        coord = nt.nodes.new('ShaderNodeTexCoord')
        noise = nt.nodes.new('ShaderNodeTexNoise')
        noise.inputs['Scale'].default_value = 380.0
        noise.inputs['Detail'].default_value = 2.0
        nt.links.new(coord.outputs['Object'], noise.inputs['Vector'])
        bump = nt.nodes.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = 0.5
        bump.inputs['Distance'].default_value = 0.002
        nt.links.new(noise.outputs[0], bump.inputs['Height'])
        nt.links.new(bump.outputs[0], bsdf.inputs['Normal'])
    for key, hexcol in ACCENT.items():
        M['accent_' + key] = L.mat('Anodized_' + key, hexcol, rough=0.36, metal=1.0)        # anodised aluminium in the work's colour
        M['acrylic_' + key] = L.mat('Acrylic_' + key, hexcol, rough=0.25, transmission=0.85)
        M['core_' + key] = emitter('Glow_' + key, hexcol, 6.0, 0.35)
        M['screen_' + key] = screen_material(key)
    builders = {'game': build_game, 'tool': build_tool, 'experiment': build_experiment, 'media': build_media}
    for key, (loc, yaw) in PLACE.items():
        root = L.empty('Terminal_' + key, coll, loc=loc, rot=(0, 0, yaw))
        builders[key](root, coll, M)
    build_lounge(coll, M)
