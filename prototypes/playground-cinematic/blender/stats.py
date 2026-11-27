"""Prints triangle counts of build/playground_p4.blend by part, for the web-porting estimate.

    blender --background --factory-startup --python stats.py
"""
import os
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
bpy.ops.wm.open_mainfile(filepath=os.path.join(HERE, 'build', 'playground_p4.blend'))
groups = {}
for ob in bpy.context.scene.objects:
    if ob.type != 'MESH':
        continue
    grp = ob.get('grp', 'other')
    if ob.name.startswith('Body_') or ob.name in ('SofaBase', 'LoungeTable') or 'Shell_' in ob.name or 'StoolBody' in ob.name:
        grp = 'monolith'
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    g = groups.setdefault(grp, [0, 0])
    g[0] += tris
    g[1] += 1
total = 0
for grp, (tris, count) in sorted(groups.items(), key=lambda kv: -kv[1][0]):
    total += tris
    print('PART %-12s %8d tris  %4d objects' % (grp, tris, count))
print('PART %-12s %8d tris' % ('TOTAL', total))
