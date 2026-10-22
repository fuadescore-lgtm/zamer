# Проверка IFC: каждое тело строится ifcopenshell (как в Revit/BIM-программах), отчёт + картинка
import sys, glob, json, os
import ifcopenshell, ifcopenshell.geom
import numpy as np
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
out = sys.argv[2] if len(sys.argv) > 2 else 'ifc-out'; os.makedirs(out, exist_ok=True)
st = ifcopenshell.geom.settings(); st.set('use-world-coords', True)
for fn in sorted(glob.glob(sys.argv[1])):
    f = ifcopenshell.open(fn); rep = []; polys = []; cols = []
    for p in f.by_type('IfcProduct'):
        if not p.Representation: continue
        try:
            sh = ifcopenshell.geom.create_shape(st, p)
        except Exception as e:
            rep.append({'type': p.is_a(), 'name': p.Name, 'ERROR': str(e)}); continue
        g = sh.geometry; v = np.array(g.verts).reshape(-1, 3); fa = np.array(g.faces).reshape(-1, 3)
        mids = list(g.material_ids); mats = g.materials
        rep.append({'type': p.is_a(), 'name': p.Name, 'tri': len(fa), 'edges': len(g.edges)//2,
                    'bbox': [np.round(v.min(0)).tolist(), np.round(v.max(0)).tolist()] if len(v) else None,
                    'mats': sorted({mats[m].name for m in mids if m >= 0}) if mats else []})
        if p.is_a('IfcOpeningElement'): continue
        for i, t in enumerate(fa):
            polys.append(v[t]); m = mids[i] if i < len(mids) else -1
            if m >= 0:
                d = mats[m].diffuse; c = (d.r(), d.g(), d.b()) if hasattr(d, 'r') else tuple(d)[:3]
                tr = getattr(mats[m], 'transparency', 0) or 0
                cols.append((*c, 1 - 0.7*tr))
            else: cols.append((.7, .7, .7, 1))
    b = os.path.splitext(os.path.basename(fn))[0]
    json.dump(rep, open(f'{out}/{b}.json', 'w'), ensure_ascii=False, indent=1)
    errs = [r for r in rep if 'ERROR' in r]
    print(fn, 'products', len(rep), 'errors', len(errs))
    for r in errs: print('  ERR', r)
    for r in rep:
        if r['type'] in ('IfcWindow', 'IfcDoor', 'IfcRoof', 'IfcBuildingElementProxy'): print('  ', r['type'], r['name'], 'tri', r.get('tri'), 'edges', r.get('edges'), r.get('mats'), r.get('bbox'))
    if not polys: continue
    P = np.concatenate(polys); lo, hi = P.min(0), P.max(0); c = (lo+hi)/2; R = (hi-lo).max()/2
    for k, (el, az) in enumerate([(25, -60), (25, 120), (35, -120)]):
        fig = plt.figure(figsize=(12, 9), dpi=110); ax = fig.add_subplot(111, projection='3d')
        pc = Poly3DCollection(polys, facecolors=cols, edgecolors=(0, 0, 0, .25), linewidths=.2); ax.add_collection3d(pc)
        ax.set_xlim(c[0]-R, c[0]+R); ax.set_ylim(c[1]-R, c[1]+R); ax.set_zlim(c[2]-R, c[2]+R); ax.view_init(el, az); ax.set_axis_off()
        fig.savefig(f'{out}/{b}_{k}.png', bbox_inches='tight'); plt.close(fig)
