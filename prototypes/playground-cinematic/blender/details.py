"""Soft things and small things: curtain, plants, lamps, and a few traces of whoever was just here.

Nothing here is needed to use the room. It is what makes the room feel recently left:
a cup beside the keyboard, a book left open in the lounge, a folded blanket, headphones set down.
"""
import random
from math import sin, cos, pi, radians, exp

import bpy
import bmesh
import numpy as np
from mathutils import Vector, Matrix

import lib as L
import arch

rng = random.Random(41)


def T(x=0, y=0, z=0):
    return Matrix.Translation((x, y, z))


def sheer_material():
    """Voile: most light passes straight through, the rest glows inside the cloth."""
    m = bpy.data.materials.new('Voile')
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    nt.nodes.clear()
    trans = nt.nodes.new('ShaderNodeBsdfTranslucent')
    trans.inputs['Color'].default_value = (0.95, 0.95, 0.94, 1)
    clear = nt.nodes.new('ShaderNodeBsdfTransparent')
    diff = nt.nodes.new('ShaderNodeBsdfDiffuse')
    diff.inputs['Color'].default_value = (0.93, 0.93, 0.92, 1)
    a = nt.nodes.new('ShaderNodeMixShader')
    a.inputs['Fac'].default_value = 0.35
    nt.links.new(trans.outputs[0], a.inputs[1])
    nt.links.new(diff.outputs[0], a.inputs[2])
    b = nt.nodes.new('ShaderNodeMixShader')
    b.inputs['Fac'].default_value = 0.42
    nt.links.new(a.outputs[0], b.inputs[1])
    nt.links.new(clear.outputs[0], b.inputs[2])
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(b.outputs[0], out.inputs['Surface'])
    m.use_backface_culling = False
    return m


def build_curtain(coll, mat):
    """A sheer drawn across the left of the glazing and gathered at its inner end."""
    c, hw, _ = arch.LIFTS[0]
    ta, tb = c + hw * 0.84, c + hw * 0.3
    nu, nv = 220, 60
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('UVMap')
    rows = []
    for j in range(nv + 1):
        k = j / nv
        row = []
        for i in range(nu + 1):
            u = i / nu
            g = u ** 1.9                                           # the cloth bunches towards the inner end
            t = ta + (tb - ta) * (0.74 * u + 0.1 * g)
            r = arch.glazing_line(t) - 0.28
            top = float(arch.dome(r, t)) - 0.04
            fold = sin(u * 2 * pi * (16 + 22 * u) + 0.9 * sin(k * 3.1)) * (0.035 + 0.05 * k) * (1.0 - 0.35 * u)
            fold += 0.02 * sin(u * 2 * pi * 4.0 + k * 2.2)
            x, y = (r + fold) * cos(t), (r + fold) * sin(t)
            row.append((bm.verts.new((x, y, top + (0.03 - top) * k)), (u, 1 - k)))
        rows.append(row)
    for j in range(nv):
        for i in range(nu):
            corners = (rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i])
            f = bm.faces.new([cn[0] for cn in corners])
            for loop, cn in zip(f.loops, corners):
                loop[uvl].uv = cn[1]
    L.new_obj('Curtain', bm, coll, mat, grp='curtain', soft=True, recalc=False)


def leaf_object(name, leaves, coll, materials):
    bm = bmesh.new()
    for origin, direction, up, length, width, mi in leaves:
        for f in L.add_leaf(bm, origin, direction, up, length, width):
            f.material_index = mi
    return L.new_obj(name, bm, coll, materials, grp='plants', angle=80, recalc=False)


def build_tree(coll, M, base, height=2.9, name='Tree'):
    """An olive tree in a large ceramic pot."""
    base = Vector(base)
    pot = [(0, 0), (0.24, 0), (0.27, 0.014), (0.36, 0.56), (0.37, 0.6), (0.34, 0.6), (0.33, 0.56), (0.32, 0.53), (0, 0.53)]
    L.new_obj(name + 'Pot', L.lathe(pot, 64), coll, M['pot'], loc=base, grp='plants', angle=50)
    L.new_obj(name + 'Soil', L.cyl(0.318, 0.012, 0.002, 48), coll, M['soil'], loc=base + Vector((0, 0, 0.52)), grp='plants')
    trunk = L.bezier(base + Vector((0, 0, 0.52)), base + Vector((0.14, 0.03, height * 0.4)), base + Vector((-0.16, 0.06, height * 0.62)), base + Vector((0.08, 0.0, height * 0.86)), 26)
    wood = L.tube(trunk, 0.06, 10, taper=lambda u: 1.0 - 0.66 * u)
    leaves = []
    for i in range(11):
        start = trunk[rng.randrange(13, 26)]
        a = i * 0.62 + rng.uniform(-0.2, 0.2)
        reach = rng.uniform(0.7, 1.15)
        end = start + Vector((cos(a) * reach, sin(a) * reach, rng.uniform(0.3, 0.9)))
        mid = start.lerp(end, 0.5) + Vector((0, 0, 0.26))
        branch = L.bezier(start, start.lerp(mid, 0.6), mid, end, 12)
        L.join_bm(wood, L.tube(branch, 0.018, 6, taper=lambda u: 1.0 - 0.72 * u))
        for k in range(190):
            u = rng.uniform(0.18, 1.0)
            spread = 0.08 + 0.15 * u
            p = branch[int(u * 12)] + Vector((rng.uniform(-spread, spread), rng.uniform(-spread, spread), rng.uniform(-spread, spread * 1.2)))
            d = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-0.3, 0.9)))
            size = rng.uniform(0.11, 0.19)
            leaves.append((p, d, (0, 0, 1), size, size * 0.3, rng.randrange(2)))
    L.new_obj(name + 'Wood', wood, coll, M['bark'], grp='plants')
    leaf_object(name + 'Leaves', leaves, coll, [M['olive_a'], M['olive_b']])


def build_vines(coll, M):
    """Trailing plants from the rim of the oculus and from the edge of the front opening."""
    stems, leaves = bmesh.new(), []
    anchors = []
    for i in range(16):
        t = radians(rng.uniform(20, 200))
        r = float(arch.oculus_r(t)) + 0.02
        anchors.append((Vector(arch.polar(r, t, float(arch.dome(r, t)) + 0.05)), rng.uniform(0.7, 2.6)))
    c, hw, _ = arch.LIFTS[0]
    for i in range(12):
        t = c + hw * rng.uniform(0.55, 0.8)
        r = float(arch.radius_at(arch.edge_z(t), t)) - rng.uniform(0.1, 0.45)
        anchors.append((Vector(arch.polar(r, t, float(arch.dome(r, t)) - 0.02)), rng.uniform(0.6, 2.0)))
    for top, length in anchors:
        ph = rng.uniform(0, 6.28)
        n = int(length / 0.1) + 2
        pts = [top + Vector((sin(d * 2.2 + ph) * 0.03 * d, cos(d * 1.7 + ph) * 0.03 * d, -d)) for d in (k / (n - 1) * length for k in range(n))]
        L.join_bm(stems, L.tube(pts, 0.003, 3))
        d = 0.1
        while d < length:
            k = d / length * (n - 1)
            p = pts[int(k)].lerp(pts[min(n - 1, int(k) + 1)], k - int(k))
            a = rng.uniform(0, 6.28)
            size = rng.uniform(0.07, 0.13) * (1.0 - 0.3 * d / length)
            leaves.append((p, Vector((cos(a), sin(a), rng.uniform(-0.9, -0.2))), (0, 0, 1), size, size * 0.66, rng.randrange(2)))
            d += rng.uniform(0.03, 0.07)
    L.new_obj('VineStems', stems, coll, M['stem'], grp='plants')
    leaf_object('VineLeaves', leaves, coll, [M['vine_a'], M['vine_b']])


def build_pendants(coll, M):
    """Three frosted globes hung at different heights over the lounge."""
    cx, cy = arch.PIT['c']
    for i, (dx, dy, z, r) in enumerate(((-0.5, 0.3, 2.05, 0.17), (0.25, -0.35, 2.55, 0.13), (0.55, 0.5, 1.75, 0.11))):
        x, y = cx + dx, cy + dy
        t, rr = np.arctan2(y, x), np.hypot(x, y)
        top = float(arch.dome(rr, t))
        L.new_obj('PendantCord_%d' % i, L.tube([(x, y, z + r), (x, y, top)], 0.0025, 5), coll, M['alu'], grp='lamp')
        L.new_obj('PendantCap_%d' % i, L.cyl(0.022, 0.03, 0.004, 20), coll, M['inlay'], loc=(x, y, z + r - 0.008), grp='lamp')
        L.new_obj('PendantGlobe_%d' % i, L.sphere(r, 40, 20), coll, M['frost'], loc=(x, y, z), grp='glass_solid', soft=True)
        L.new_obj('PendantBulb_%d' % i, L.sphere(r * 0.34, 20, 10), coll, M['lamp'], loc=(x, y, z), grp='emit', soft=True)


def build_orbs(coll, M):
    for i, (x, y, r) in enumerate(((-2.7, 5.2, 0.26), (-2.15, 4.75, 0.15), (5.6, -4.6, 0.2))):
        L.new_obj('Orb_%d' % i, L.sphere(r, 48, 24), coll, M['frost'], loc=(x, y, r + 0.01), grp='glass_solid', soft=True)
        L.new_obj('OrbCore_%d' % i, L.sphere(r * 0.27, 20, 10), coll, M['lamp'], loc=(x, y, r + 0.01), grp='emit', soft=True)
        L.new_obj('OrbFoot_%d' % i, L.torus(r * 0.4, 0.01, 48, 8), coll, M['inlay'], loc=(x, y, 0.01), grp='lamp')


def book(name, coll, M, cover, matrix, w=0.15, h=0.21, t=0.022):
    L.new_obj(name + '_pages', L.box(w - 0.006, h - 0.008, t - 0.004, 0.001, 1), coll, M['paper'], grp='props').matrix_world = matrix @ T(0.002, 0, t / 2)
    L.new_obj(name + '_cover', L.box(w, h, t, 0.002, 1), coll, cover, grp='props').matrix_world = matrix @ T(0, 0, t / 2) @ Matrix.Diagonal((1.0, 1.0, 1.0, 1.0))


def build_traces(coll, M):
    furniture = __import__('furniture')
    # TOOL desk: a cup, an open notebook and a pen, left where they were being used
    (tx, ty, tz), yaw = furniture.PLACE['tool']
    desk = T(tx, ty, tz) @ Matrix.Rotation(yaw, 4, 'Z') @ T(0, 0, 0.78)
    cup = [(0, 0), (0.032, 0), (0.038, 0.004), (0.041, 0.085), (0.037, 0.085), (0.034, 0.008), (0, 0.008)]
    L.new_obj('Cup_tool', L.lathe(cup, 40), coll, M['cup'], grp='props', angle=50).matrix_world = desk @ T(-0.52, -0.12, 0)
    L.new_obj('CupTea_tool', L.cyl(0.035, 0.002, 0.0005, 32), coll, M['tea'], grp='props').matrix_world = desk @ T(-0.52, -0.12, 0.066)
    note = desk @ T(-0.36, -0.27, 0) @ Matrix.Rotation(0.3, 4, 'Z')
    for s in (-1, 1):
        L.new_obj('Notebook_tool_%d' % s, L.box(0.14, 0.2, 0.006, 0.001, 1), coll, M['paper'], grp='props').matrix_world = note @ T(s * 0.071, 0, 0.004) @ Matrix.Rotation(-s * 0.05, 4, 'Y')
    L.new_obj('Pen_tool', L.lathe([(0, 0), (0.004, 0.01), (0.004, 0.13), (0, 0.135)], 12), coll, M['inlay'], grp='props').matrix_world = note @ T(0.03, 0.02, 0.014) @ Matrix.Rotation(pi / 2, 4, 'X') @ Matrix.Rotation(0.5, 4, 'Y')
    # GAME: headphones left on the stool, as if someone just stood up
    (gx, gy, gz), gyaw = furniture.PLACE['game']
    hp = T(gx, gy, gz) @ Matrix.Rotation(gyaw, 4, 'Z') @ T(0.1, -0.95, 0.492) @ Matrix.Rotation(0.9, 4, 'Z') @ T(0, -0.12, 0)
    for s in (-1, 1):
        L.new_obj('HeadphoneCup_%d' % s, L.cyl(0.045, 0.032, 0.012, 32), coll, M['ceramic'], grp='props', soft=True).matrix_world = hp @ T(s * 0.085, 0.12, 0.0) @ Matrix.Rotation(s * 0.25, 4, 'Y')
        L.new_obj('HeadphonePad_%d' % s, L.cyl(0.04, 0.014, 0.006, 32), coll, M['fabric_dark'], grp='props', soft=True).matrix_world = hp @ T(s * 0.085, 0.12, 0.03) @ Matrix.Rotation(s * 0.25, 4, 'Y')
    band = [Vector((cos(a) * 0.095, 0.12 + sin(a) * 0.1, 0.018)) for a in (radians(-10 + 200 * k / 24) for k in range(25))]
    L.new_obj('HeadphoneBand', L.tube(band, 0.007, 10), coll, M['alu'], grp='props').matrix_world = hp
    # lounge: an open book face down on the table, a cup, a folded blanket on the seat
    cx, cy = arch.PIT['c']
    z0 = arch.PIT['depth']
    table = T(cx + 0.05, cy, z0 + 0.3)
    for s in (-1, 1):
        L.new_obj('OpenBook_%d' % s, L.box(0.15, 0.21, 0.012, 0.002, 1), coll, M['book_blue'], grp='props').matrix_world = table @ T(-0.12, 0.05, 0.03) @ Matrix.Rotation(0.5, 4, 'Z') @ T(s * 0.07, 0, 0) @ Matrix.Rotation(s * 0.32, 4, 'Y')
    L.new_obj('Cup_lounge', L.lathe(cup, 40), coll, M['cup'], grp='props', angle=50).matrix_world = table @ T(0.18, -0.12, 0)
    a = radians(-31)
    seat = T(cx + cos(a) * 1.46, cy + sin(a) * 1.46, z0 + 0.42) @ Matrix.Rotation(a + pi / 2 + 0.2, 4, 'Z')
    for i, (w, d) in enumerate(((0.44, 0.34), (0.43, 0.33), (0.42, 0.33))):
        ob = L.new_obj('Blanket_%d' % i, L.box(w, d, 0.035, 0.014, 2), coll, M['fabric_dark'], grp='props', subsurf=2)
        ob.matrix_world = seat @ T(0.01 * i, -0.01 * i, 0.018 + 0.034 * i) @ Matrix.Rotation(0.05 * i, 4, 'Z')
    # bench on the left: two cushions and a short stack of books
    for i, t in enumerate((radians(196 - 30), radians(196 - 39))):
        r = float(arch.plan_r(t)) - 0.62
        ob = L.new_obj('BenchCushion_%d' % i, L.box(0.5, 0.46, 0.11, 0.045, 2), coll, M['fabric' if i == 0 else 'fabric_dark'], grp='props', subsurf=2)
        ob.matrix_world = T(r * cos(t), r * sin(t), arch.BENCH_H + 0.055) @ Matrix.Rotation(t + pi / 2, 4, 'Z')
    t = radians(196 - 21)
    r = float(arch.plan_r(t)) - 0.6
    stack = T(r * cos(t), r * sin(t), arch.BENCH_H)
    for i, (cov, rot) in enumerate(((M['book_blue'], 0.2), (M['book_sand'], -0.15), (M['book_white'], 0.4))):
        book('BenchBook_%d' % i, coll, M, cov, stack @ T(0, 0, 0.023 * i) @ Matrix.Rotation(t + rot, 4, 'Z'))


def build(scene, colls, M, emitter):
    coll = colls['DETAIL']
    M['voile'] = sheer_material()
    M['pot'] = L.mat('PotCeramic', '#eeece6', rough=0.5)
    M['soil'] = L.mat('Soil', '#3d342e', rough=1.0)
    M['bark'] = L.mat('Bark', '#8c8178', rough=0.9)
    M['stem'] = L.mat('Stem', '#6d7c57', rough=0.8)
    M['olive_a'] = L.mat('OliveA', '#8fae93', rough=0.55, double_sided=True)
    M['olive_b'] = L.mat('OliveB', '#6b9478', rough=0.55, double_sided=True)
    M['vine_a'] = L.mat('VineA', '#5b9f69', rough=0.5, double_sided=True)
    M['vine_b'] = L.mat('VineB', '#3f8553', rough=0.5, double_sided=True)
    M['frost'] = sheer_material()            # opal glass: lets the bulb light the room, unlike a refractive solid
    M['frost'].name = 'OpalGlass'
    M['lamp'] = emitter('LampWarm', '#ffd8a8', 26.0)
    M['paper'] = L.mat('Paper', '#f3efe6', rough=0.8)
    M['cup'] = L.mat('CupGlaze', '#e9e4da', rough=0.25, coat=0.4)
    M['tea'] = L.mat('Tea', '#5a3a22', rough=0.05)
    M['book_blue'] = L.mat('BookBlue', '#5f7fa6', rough=0.7)
    M['book_sand'] = L.mat('BookSand', '#cdbfa6', rough=0.7)
    M['book_white'] = L.mat('BookWhite', '#eceae4', rough=0.7)
    build_curtain(coll, M['voile'])
    build_tree(coll, M, (-6.5, -0.4, 0.0))
    build_vines(coll, M)
    build_pendants(coll, M)
    build_orbs(coll, M)
    build_traces(coll, M)
