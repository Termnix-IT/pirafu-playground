"""Modelling helpers for the Pirafu2411 Playground space (Blender 5.x, runs headless).

Everything is built with bmesh so the scripts need no UI context. Blender axes: X right,
Y away from the camera, Z up. glTF export turns this into three.js axes (x, z, -y).
"""
import bpy
import bmesh
from math import sin, cos, pi, radians
from mathutils import Vector, Matrix

COLL = {}
MATS = {}


def srgb(hex_color):
    """'#rrggbb' -> linear RGB tuple (Blender shader inputs are linear)."""
    h = hex_color.lstrip('#')
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return tuple(out)


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    COLL.clear()
    MATS.clear()
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    return scene


def coll(name, parent=None):
    if name in COLL:
        return COLL[name]
    c = bpy.data.collections.new(name)
    (parent or bpy.context.scene.collection).children.link(c)
    COLL[name] = c
    return c


def mat(name, base, rough=0.5, metal=0.0, coat=0.0, coat_rough=0.06, transmission=0.0, ior=1.45,
        emission=None, strength=1.0, alpha=1.0, sheen=0.0, double_sided=False):
    """Principled BSDF limited to inputs the glTF exporter understands."""
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    rgb = srgb(base) if isinstance(base, str) else tuple(base)

    def put(key, value):
        if key in bsdf.inputs:
            bsdf.inputs[key].default_value = value

    put('Base Color', (*rgb, 1.0))
    put('Roughness', rough)
    put('Metallic', metal)
    put('Coat Weight', coat)
    put('Coat Roughness', coat_rough)
    put('Transmission Weight', transmission)
    put('IOR', ior)
    put('Alpha', alpha)
    put('Sheen Weight', sheen)
    if emission is not None:
        e = srgb(emission) if isinstance(emission, str) else tuple(emission)
        put('Emission Color', (*e, 1.0))
        put('Emission Strength', strength)
    m.use_backface_culling = not double_sided
    if alpha < 1.0:
        m.surface_render_method = 'BLENDED'
    if transmission > 0.0 and hasattr(m, 'use_raytrace_refraction'):
        m.use_raytrace_refraction = True
    m.diffuse_color = (*rgb, alpha)
    m.roughness = rough
    m.metallic = metal
    MATS[name] = m
    return m


# ---------- object creation ----------

def new_obj(name, bm, collection, material=None, loc=(0, 0, 0), rot=(0, 0, 0), parent=None,
            angle=38.0, soft=False, subsurf=0, grp=None, ao=None, recalc=True):
    """bmesh -> object. `grp` decides which exported mesh it is joined into, `ao` the AO atlas."""
    if recalc:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    limit = radians(180.0 if soft else angle)
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:
        if len(e.link_faces) == 2:
            e.smooth = e.calc_face_angle(0.0) < limit
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    collection.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = rot
    if material is not None:
        for m in (material if isinstance(material, (list, tuple)) else [material]):
            me.materials.append(m)
    if parent is not None:
        ob.parent = parent
    if subsurf:
        mod = ob.modifiers.new('subsurf', 'SUBSURF')
        mod.levels = subsurf
        mod.render_levels = subsurf
    ob['soft'] = 1 if (soft or subsurf) else 0
    if grp:
        ob['grp'] = grp
    if ao:
        ob['ao'] = ao
    return ob


def empty(name, collection, loc=(0, 0, 0), rot=(0, 0, 0), parent=None):
    ob = bpy.data.objects.new(name, None)
    ob.empty_display_size = 0.15
    collection.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = rot
    if parent is not None:
        ob.parent = parent
    return ob


def text(name, body, size, collection, material, loc=(0, 0, 0), rot=(pi / 2, 0, 0), parent=None,
         extrude=0.0004, spacing=1.12, grp=None, align='CENTER'):
    """Engraved / printed lettering. Uses Blender's built-in font, converted to mesh later."""
    cu = bpy.data.curves.new(name, 'FONT')
    cu.body = body
    cu.size = size
    cu.extrude = extrude
    cu.align_x = align
    cu.align_y = 'CENTER'
    cu.resolution_u = 3
    cu.space_character = spacing
    ob = bpy.data.objects.new(name, cu)
    collection.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = rot
    cu.materials.append(material)
    if parent is not None:
        ob.parent = parent
    ob['soft'] = 0
    if grp:
        ob['grp'] = grp
    return ob


def finalize_meshes():
    """Apply modifiers, convert text to mesh and harden normals so bevels shade cleanly."""
    scene = bpy.context.scene
    for ob in list(scene.objects):
        if ob.type == 'MESH' and not ob.get('soft'):
            wn = ob.modifiers.new('weighted_normal', 'WEIGHTED_NORMAL')
            wn.keep_sharp = True
            wn.weight = 100
    dg = bpy.context.evaluated_depsgraph_get()
    dg.update()
    for ob in list(scene.objects):
        if ob.type == 'MESH' and ob.modifiers:
            me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
            old = ob.data
            ob.modifiers.clear()
            ob.data = me
            me.name = old.name
            bpy.data.meshes.remove(old)
        elif ob.type == 'FONT':
            me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), depsgraph=dg)
            new = bpy.data.objects.new(ob.name + '_mesh', me)
            for c in ob.users_collection:
                c.objects.link(new)
            new.parent = ob.parent
            new.matrix_parent_inverse = ob.matrix_parent_inverse.copy()
            new.location = ob.location
            new.rotation_euler = ob.rotation_euler
            for key in ('grp', 'ao', 'soft'):
                if key in ob:
                    new[key] = ob[key]
            for p in me.polygons:
                p.use_smooth = False
            old_curve = ob.data
            bpy.data.objects.remove(ob)
            bpy.data.curves.remove(old_curve)


# ---------- 2D profiles ----------

def rrect(w, h, r, seg=6):
    """Rounded rectangle outline, counter-clockwise."""
    r = max(1e-4, min(r, w / 2 - 1e-4, h / 2 - 1e-4))
    pts = []
    for cx, cy, a0 in ((w / 2 - r, h / 2 - r, 0.0), (-w / 2 + r, h / 2 - r, pi / 2),
                       (-w / 2 + r, -h / 2 + r, pi), (w / 2 - r, -h / 2 + r, 1.5 * pi)):
        for i in range(seg + 1):
            a = a0 + (pi / 2) * i / seg
            pts.append((cx + r * cos(a), cy + r * sin(a)))
    return pts


def circle(r, seg=10):
    return [(r * cos(2 * pi * i / seg), r * sin(2 * pi * i / seg)) for i in range(seg)]


# ---------- solids ----------

def bevel(bm, edges, offset, seg=3):
    edges = [e for e in set(edges) if e.is_valid]
    if offset > 0 and edges:
        bmesh.ops.bevel(bm, geom=edges, offset=offset, offset_type='OFFSET', segments=seg,
                        profile=0.5, affect='EDGES', clamp_overlap=True)


def prism_y(pts, depth):
    """Extrude an XZ outline along Y. Returns (bm, cap faces)."""
    bm = bmesh.new()
    front = [bm.verts.new((x, -depth / 2, z)) for x, z in pts]
    back = [bm.verts.new((x, depth / 2, z)) for x, z in pts]
    n = len(pts)
    caps = [bm.faces.new(front), bm.faces.new(back[::-1])]
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((front[i], back[i], back[j], front[j]))
    return bm, caps


def slab_y(w, h, d, r=0.02, f=0.006, seg=6):
    """Upright rounded panel: w (X) x h (Z), thickness d (Y), filleted rim."""
    bm, caps = prism_y(rrect(w, h, r, seg), d)
    bevel(bm, [e for c in caps for e in c.edges], f, 3)
    return bm


def slab_z(w, d, h, r=0.02, f=0.006, seg=6):
    """Flat rounded panel: w (X) x d (Y), thickness h (Z). Table tops, bases."""
    bm = slab_y(w, d, h, r, f, seg)
    bmesh.ops.rotate(bm, verts=bm.verts[:], cent=(0, 0, 0), matrix=Matrix.Rotation(pi / 2, 3, 'X'))
    return bm


def box(w, d, h, b=0.008, seg=2):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(w, d, h), verts=bm.verts[:])
    bevel(bm, bm.edges[:], b, seg)
    return bm


def lathe(profile, seg=48, caps=True, closed=False):
    """Revolve (radius, z) pairs around Z. Radius 0 closes the surface with a fan.

    `closed` joins the last ring back to the first (rings, tori); `caps=False` leaves ends open.
    """
    bm = bmesh.new()
    rings = []
    if closed:
        profile = list(profile) + [profile[0]]
        caps = False
    for r, z in profile:
        if r < 1e-6:
            rings.append([bm.verts.new((0, 0, z))])
        else:
            rings.append([bm.verts.new((r * cos(2 * pi * i / seg), r * sin(2 * pi * i / seg), z)) for i in range(seg)])
    for a, b in zip(rings[:-1], rings[1:]):
        for i in range(seg):
            j = (i + 1) % seg
            if len(a) == 1 and len(b) == 1:
                continue
            if len(a) == 1:
                bm.faces.new((a[0], b[i], b[j]))
            elif len(b) == 1:
                bm.faces.new((a[i], a[j], b[0]))
            else:
                bm.faces.new((a[i], a[j], b[j], b[i]))
    if closed:
        bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-6)
    if caps and len(rings[0]) > 1:
        bm.faces.new(rings[0][::-1])
    if caps and len(rings[-1]) > 1:
        bm.faces.new(rings[-1])
    return bm


def sphere(r, seg=32, rings=16):
    """UV sphere centred on the origin."""
    return lathe([(r * sin(pi * i / rings), -r * cos(pi * i / rings)) for i in range(rings + 1)], seg)


def torus(major, minor, seg=64, minor_seg=10):
    """Ring lying in the XY plane."""
    return lathe([(major + minor * cos(2 * pi * i / minor_seg), minor * sin(2 * pi * i / minor_seg))
                  for i in range(minor_seg)], seg, closed=True)


def cyl(r, h, b=0.004, seg=48):
    """Capped cylinder standing on z=0 with a small edge fillet."""
    b = min(b, r * 0.45, h * 0.45)
    k = b * 0.3
    return lathe([(r - b, 0), (r - k, k), (r, b), (r, h - b), (r - k, h - k), (r - b, h)], seg)


def sweep(points, section, fixed_b=None, cap=True, scale=None):
    """Sweep a 2D section along a polyline using parallel-transport frames."""
    bm = bmesh.new()
    pts = [Vector(p) for p in points]
    n = len(pts)
    rings = []
    prev = None
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
        if fixed_b is not None:
            b = Vector(fixed_b)
            nrm = b.cross(t).normalized()
        else:
            if prev is None:
                a = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
                nrm = (a - t * a.dot(t)).normalized()
            else:
                nrm = (prev - t * prev.dot(t)).normalized()
            b = t.cross(nrm).normalized()
        prev = nrm
        s = scale(i / (n - 1)) if scale else 1.0
        rings.append([bm.verts.new(p + nrm * (u * s) + b * (v * s)) for u, v in section])
    m = len(section)
    for i in range(n - 1):
        for j in range(m):
            k = (j + 1) % m
            bm.faces.new((rings[i][j], rings[i][k], rings[i + 1][k], rings[i + 1][j]))
    if cap:
        bm.faces.new(rings[0][::-1])
        bm.faces.new(rings[-1])
    return bm


def tube(points, r, seg=10, taper=None):
    return sweep(points, circle(r, seg), scale=taper)


def loft(loops, cap_start=True, cap_end=True):
    """Skin a list of same-sized closed vertex loops."""
    bm = bmesh.new()
    rings = [[bm.verts.new(p) for p in loop] for loop in loops]
    m = len(rings[0])
    for a, b in zip(rings[:-1], rings[1:]):
        for j in range(m):
            k = (j + 1) % m
            bm.faces.new((a[j], a[k], b[k], b[j]))
    if cap_start:
        bm.faces.new(rings[0][::-1])
    if cap_end:
        bm.faces.new(rings[-1])
    return bm


def join_bm(target, source, matrix=None):
    """Append `source` geometry into `target`, optionally transformed."""
    me = bpy.data.meshes.new('tmp')
    source.to_mesh(me)
    source.free()
    if matrix is not None:
        me.transform(matrix)
    target.from_mesh(me)
    bpy.data.meshes.remove(me)
    return target


# ---------- paths ----------

def bezier(p0, p1, p2, p3, n=16):
    p0, p1, p2, p3 = Vector(p0), Vector(p1), Vector(p2), Vector(p3)
    out = []
    for i in range(n + 1):
        t = i / n
        a = (1 - t)
        out.append(p0 * a ** 3 + p1 * 3 * a * a * t + p2 * 3 * a * t * t + p3 * t ** 3)
    return out


def add_leaf(bm, origin, direction, up, length, width, fold=0.18):
    """A folded leaf: 4 triangles around a lowered midrib point."""
    d = Vector(direction).normalized()
    side = d.cross(Vector(up))
    if side.length < 1e-4:
        side = d.cross(Vector((1, 0, 0)))
    side.normalize()
    nrm = side.cross(d).normalized()
    o = Vector(origin)
    b = bm.verts.new(o)
    t = bm.verts.new(o + d * length)
    l = bm.verts.new(o + d * (length * 0.45) - side * (width / 2))
    r = bm.verts.new(o + d * (length * 0.45) + side * (width / 2))
    c = bm.verts.new(o + d * (length * 0.5) - nrm * (width * fold))
    return [bm.faces.new((b, r, c)), bm.faces.new((r, t, c)), bm.faces.new((t, l, c)), bm.faces.new((l, b, c))]
