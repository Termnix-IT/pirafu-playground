"""Architecture of the Playground pavilion: one continuous shell, a floor that grows into it, and the view.

The building is a single white shell, like a cloth lifted at three places:
  - a wide front opening towards the horizon (glazed),
  - a low slit at seated eye level beside the sunken lounge,
  - a doorway on the left.
An oculus at the crown lets a pool of daylight move across the floor through the day.
The floor is one surface as well: it sinks into the lounge and the reflecting pool, and rises
into a continuous bench where the shell meets the ground, so floor, wall and ceiling read as one form.

Axes: X right, Y towards the horizon, Z up. The pole of the shell (under the oculus) is the origin.
"""
from math import sin, cos, pi, radians, atan2, sqrt

import bpy
import bmesh
import numpy as np
from mathutils import Vector

import lib as L

# ---------------------------------------------------------------- form
H = 8.2            # height of the shell at the crown
P, Q = 2.4, 2.2    # superellipse exponents of the section
T = 0.26           # shell thickness
LIFTS = (          # (centre angle, half width, height) of each place where the shell is lifted
    (radians(90), radians(64), 6.5),
    (radians(202), radians(17), 2.7),
    (radians(0), radians(26), 1.4),
)


def plan_r(t):
    """Distance from the pole to the foot of the shell in direction t: an asymmetric, egg-like plan."""
    return 9.2 + 1.2 * np.cos(2 * (t - 1.7)) + 0.9 * np.cos(t - 2.6) + 0.35 * np.cos(3 * t + 1.0)


def bump(u):
    u = np.clip(np.abs(u), 0, 1)
    return (1 - u * u) ** 2


def wrap(a):
    return (a + pi) % (2 * pi) - pi


def edge_z(t):
    """Height of the shell's lower edge in direction t (0 where it rests on the floor)."""
    z = np.zeros_like(np.asarray(t, dtype=float))
    for c, hw, lift in LIFTS:
        z = z + lift * bump(wrap(np.asarray(t) - c) / hw)
    return z


def dome(r, t, grow=0.0):
    """Height of the shell surface at polar position (r, t). grow > 0 gives the outer skin."""
    big = plan_r(t) + grow
    x = np.clip(np.asarray(r) / big, 0, 1)
    return (H + grow) * (1 - x ** P) ** (1 / Q)


def radius_at(z, t, grow=0.0):
    """Inverse of dome(): radius at which the surface has height z."""
    k = np.clip(np.asarray(z) / (H + grow), 0, 1)
    return (plan_r(t) + grow) * (1 - k ** Q) ** (1 / P)


def oculus_r(t):
    return 1.75 + 0.42 * np.cos(2 * t + 0.6)


def polar(r, t, z=0.0):
    return (float(r * cos(t)), float(r * sin(t)), float(z))


# ---------------------------------------------------------------- shell
def build_shell(coll, mat):
    n_t, n_s = 300, 56
    loops = []
    for i in range(n_t):
        t = 2 * pi * i / n_t
        ez = float(edge_z(t))
        r0, r1 = float(radius_at(ez, t)), float(oculus_r(t))
        ro0, ro1 = float(radius_at(ez, t, T)), r1 + 0.03
        inner, outer = [], []
        for j in range(n_s + 1):
            s = (j / n_s) ** 0.85
            r = r0 + (r1 - r0) * s
            inner.append(polar(r, t, dome(r, t)))
            r = ro0 + (ro1 - ro0) * s
            outer.append(polar(r, t, dome(r, t, T)))
        zi, zo = inner[-1][2], outer[-1][2]
        top = [polar(r1 - 0.06, t, zi + (zo - zi) * 0.3), polar(r1 - 0.07, t, (zi + zo) / 2), polar(r1 - 0.04, t, zi + (zo - zi) * 0.75)]
        # lower edge: a soft rounded lip, slightly thinner than the shell so the rim reads as a fine line
        a, b = Vector(outer[0]), Vector(inner[0])
        mid = (a + b) / 2
        down = Vector((0, 0, -0.07)) if ez > 0.05 else Vector((0, 0, 0))
        lip = [tuple(a.lerp(mid, 0.45) + down * 0.8), tuple(mid + down), tuple(b.lerp(mid, 0.45) + down * 0.8)]
        loops.append(inner + top + outer[::-1] + lip)
    ob = L.new_obj('Shell', L.loft_ring(loops), coll, mat, angle=50, grp='shell')
    return ob


# ---------------------------------------------------------------- floor (height field)
POOL = dict(c=(0.0, 0.0), rx=2.0, ry=1.4, rot=0.4, depth=-0.09)
PIT = dict(c=(4.55, 0.35), r=1.95, depth=-0.45)
PIT_STEP = dict(c=(2.95, -0.25), r=0.9, depth=-0.225)
STAGES = {                       # low plinths that mark each terminal's place: (centre, half sizes, rotation, height)
    'game': ((-3.6, -2.2), (1.5, 1.2), 0.55, 0.12),
    'tool': ((1.6, 4.0), (1.9, 1.35), -0.1, 0.12),
    'experiment': ((3.5, -3.1), (1.2, 1.2), 0.0, 0.12),
    'media': ((-5.4, 4.4), (2.2, 1.9), 0.62, 0.12),
}
BENCH_H, BENCH_D = 0.43, 1.05


def terrace_r(t):
    return plan_r(t) + 0.9 + 3.8 * bump(wrap(t - radians(90)) / radians(82))


def _ss(a, b, x):
    k = np.clip((x - a) / (b - a), 0, 1)
    return k * k * (3 - 2 * k)


def floor_height(x, y):
    """Height of the floor at (x, y), as numpy arrays. Every level change has a soft, filleted flank."""
    r = np.hypot(x, y)
    t = np.arctan2(y, x)
    z = np.zeros_like(x)
    # bench where the shell rests on the ground
    closed = 1 - _ss(0.0, 0.5, edge_z(t))
    inner_edge = plan_r(t) - BENCH_D
    z = z + BENCH_H * closed * _ss(inner_edge - 0.09, inner_edge + 0.09, r)
    # terminal stages (superellipse footprints)
    for (cx, cy), (ax, ay), rot, h in STAGES.values():
        dx, dy = x - cx, y - cy
        u = dx * cos(rot) + dy * sin(rot)
        v = -dx * sin(rot) + dy * cos(rot)
        d = (np.abs(u / ax) ** 3 + np.abs(v / ay) ** 3) ** (1 / 3)
        z = np.maximum(z, h * _ss(1.05, 0.95, d))
    # sunken lounge with one broad step
    d_pit = np.hypot(x - PIT['c'][0], y - PIT['c'][1])
    d_step = np.hypot(x - PIT_STEP['c'][0], y - PIT_STEP['c'][1])
    sink = np.minimum(PIT['depth'] * _ss(PIT['r'] + 0.08, PIT['r'] - 0.08, d_pit),
                      PIT_STEP['depth'] * _ss(PIT_STEP['r'] + 0.08, PIT_STEP['r'] - 0.08, d_step))
    z = np.where(sink < -0.001, np.minimum(z, 0) + sink + np.maximum(z, 0) * _ss(-0.05, 0.0, sink), z)
    # reflecting pool under the oculus
    dx, dy = x - POOL['c'][0], y - POOL['c'][1]
    u = dx * cos(POOL['rot']) + dy * sin(POOL['rot'])
    v = -dx * sin(POOL['rot']) + dy * cos(POOL['rot'])
    d = np.hypot(u / POOL['rx'], v / POOL['ry'])
    z = z + POOL['depth'] * _ss(1.03, 0.97, d)
    return z


def build_floor(coll, mat, step=0.05):
    xs = np.arange(-14.0, 14.0 + step, step)
    ys = np.arange(-12.0, 17.5 + step, step)
    X, Y = np.meshgrid(xs, ys)
    Z = floor_height(X, Y)
    inside = np.hypot(X, Y) <= terrace_r(np.arctan2(Y, X))
    ny, nx = X.shape
    index = np.arange(ny * nx).reshape(ny, nx)
    cell = inside[:-1, :-1] & inside[1:, :-1] & inside[:-1, 1:] & inside[1:, 1:]
    quads = np.stack([index[:-1, :-1][cell], index[:-1, 1:][cell], index[1:, 1:][cell], index[1:, :-1][cell]], axis=1)
    used = np.zeros(ny * nx, dtype=bool)
    used[quads.ravel()] = True
    remap = np.cumsum(used) - 1
    verts = np.stack([X.ravel()[used], Y.ravel()[used], Z.ravel()[used]], axis=1)
    me = bpy.data.meshes.new('Floor')
    me.from_pydata(verts.tolist(), [], remap[quads].tolist())
    me.update()
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new('Floor', me)
    coll.objects.link(ob)
    me.materials.append(mat)
    ob['soft'] = 1
    ob['grp'] = 'floor'
    return ob


def build_terrace_rim(coll, mat):
    """Stone edge of the terrace; it also hides the stepped border of the height-field grid."""
    pts = [polar(float(terrace_r(t)) - 0.12, t, -0.45) for t in np.linspace(0, 2 * pi, 361)[:-1]]
    section = L.rrect(0.5, 0.96, 0.03, 3)
    bm = L.sweep(pts + [pts[0], pts[1]], section, fixed_b=(0, 0, 1), cap=False)
    return L.new_obj('TerraceRim', bm, coll, mat, grp='structure')


# ---------------------------------------------------------------- glazing
def glazing_line(t, setback=0.7):
    """Radius of the glass wall: set back from the shell's edge so the edge floats in front of it."""
    return float(radius_at(edge_z(t), t)) - setback


def build_glazing(coll, glass, metal):
    """Full-height glass between slender fins; no transoms, so nothing crosses the horizon."""
    c, hw, _ = LIFTS[0]
    t0, t1 = c - hw * 0.86, c + hw * 0.86
    bays = 15
    gm = bmesh.new()
    for i in range(bays + 1):
        t = t0 + (t1 - t0) * i / bays
        r = glazing_line(t)
        top = float(dome(r, t)) - 0.02
        fin = L.box(0.022, 0.15, top, 0.003, 1)
        ob = L.new_obj('Fin_%02d' % i, fin, coll, metal, loc=polar(r, t, top / 2), rot=(0, 0, t - pi / 2), grp='structure')
        if i == bays:
            break
        for k in range(4):                                  # glass follows the curve in four facets per bay
            ta = t + (t1 - t0) / bays * k / 4
            tb = t + (t1 - t0) / bays * (k + 1) / 4
            ra, rb = glazing_line(ta), glazing_line(tb)
            quad = [polar(ra, ta, 0.0), polar(rb, tb, 0.0), polar(rb, tb, float(dome(rb, tb))), polar(ra, ta, float(dome(ra, ta)))]
            gm.faces.new([gm.verts.new(p) for p in quad])
    bmesh.ops.remove_doubles(gm, verts=gm.verts[:], dist=1e-4)
    L.new_obj('Glazing', gm, coll, glass, grp='glass', soft=True, recalc=False)
    # low slit beside the lounge
    c, hw, _ = LIFTS[2]
    gm = bmesh.new()
    n = 24
    for k in range(n):
        ta = c - hw * 0.9 + 2 * hw * 0.9 * k / n
        tb = c - hw * 0.9 + 2 * hw * 0.9 * (k + 1) / n
        ra, rb = glazing_line(ta, 0.35), glazing_line(tb, 0.35)
        quad = [polar(ra, ta, 0.0), polar(rb, tb, 0.0), polar(rb, tb, float(dome(rb, tb))), polar(ra, ta, float(dome(ra, ta)))]
        gm.faces.new([gm.verts.new(p) for p in quad])
    bmesh.ops.remove_doubles(gm, verts=gm.verts[:], dist=1e-4)
    L.new_obj('GlazingSlit', gm, coll, glass, grp='glass', soft=True, recalc=False)


# ---------------------------------------------------------------- integrated light
def build_cove(coll, emit):
    """A continuous line of light hidden behind the bench, washing up the inside of the shell."""
    pts, run = [], []
    for t in np.linspace(0, 2 * pi, 721):
        closed = float(edge_z(t)) < 0.02
        if closed:
            r = float(plan_r(t)) - 0.2
            run.append(polar(r, t, BENCH_H + 0.012))
        elif run:
            pts.append(run)
            run = []
    if run:
        pts.append(run)
    for i, seg in enumerate(pts):
        if len(seg) > 3:
            L.new_obj('Cove_%d' % i, L.sweep(seg, L.rrect(0.012, 0.05, 0.004, 2), fixed_b=(0, 0, 1)), coll, emit, grp='emit_cove')


def build_pool_water(coll, water, inlay):
    bm = bmesh.new()
    n = 96
    ring = []
    for i in range(n):
        a = 2 * pi * i / n
        u, v = POOL['rx'] * 0.985 * cos(a), POOL['ry'] * 0.985 * sin(a)
        x = POOL['c'][0] + u * cos(POOL['rot']) - v * sin(POOL['rot'])
        y = POOL['c'][1] + u * sin(POOL['rot']) + v * cos(POOL['rot'])
        ring.append((x, y))
    bm.faces.new([bm.verts.new((x, y, -0.022)) for x, y in ring])
    L.new_obj('PoolWater', bm, coll, water, grp='water', recalc=False)
    pts = [(x * 1.0, y * 1.0, 0.0015) for x, y in ring]
    scale = 1.06
    pts = [(POOL['c'][0] + (x - POOL['c'][0]) * scale, POOL['c'][1] + (y - POOL['c'][1]) * scale, 0.0012) for x, y, _ in pts]
    L.new_obj('PoolInlay', L.sweep(pts + [pts[0], pts[1]], L.rrect(0.004, 0.022, 0.001, 1), fixed_b=(0, 0, 1), cap=False), coll, inlay, grp='structure')
