"""Render de conferência do GLB: frente e costas lado a lado, numa imagem só.

Uso: blender -b -P preview.py -- --glb <body-map.glb> --out <preview.png>
Existe para conferir GEOMETRIA (músculo por fora da pele, corpo íntegro,
escala), não para ser bonito.
"""
import bpy, sys, math, mathutils

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def arg(f, d=None): return argv[argv.index(f)+1] if f in argv else d
GLB = arg("--glb"); OUT = arg("--out", "/tmp/preview.png")
HIDE_BODY = "--hide-body" in argv
# Uma cor por grupo: com tudo do mesmo tom não dá para ver onde uma região
# termina e a outra começa, que é justamente o que este render precisa provar.
RAINBOW = "--rainbow" in argv

PALETTE = [
    (0.85, 0.20, 0.20), (0.95, 0.55, 0.10), (0.95, 0.85, 0.15),
    (0.35, 0.75, 0.25), (0.15, 0.70, 0.60), (0.20, 0.55, 0.90),
    (0.45, 0.35, 0.85), (0.80, 0.35, 0.75), (0.95, 0.45, 0.45),
    (0.55, 0.85, 0.35), (0.30, 0.85, 0.85), (0.90, 0.70, 0.35),
    (0.60, 0.25, 0.35), (0.25, 0.40, 0.60), (0.70, 0.90, 0.55),
]

bpy.ops.wm.read_factory_settings(use_empty=True)

def load(offset_x, rot_z):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=GLB)
    news = [o for o in bpy.data.objects if o not in before]
    if HIDE_BODY:
        for o in list(news):
            if o.name.startswith("body"):
                bpy.data.objects.remove(o, do_unlink=True)
                news.remove(o)
    parent = bpy.data.objects.new(f"grp{offset_x}", None)
    bpy.context.scene.collection.objects.link(parent)
    for o in news:
        if o.parent is None:
            o.parent = parent
    if RAINBOW:
        idx = 0
        for o in sorted(news, key=lambda x: x.name):
            if o.type != "MESH":
                continue
            if o.name.startswith("body"):
                rgb = (0.30, 0.30, 0.31)
            else:
                rgb = PALETTE[idx % len(PALETTE)]
                idx += 1
            mat = bpy.data.materials.new(o.name)
            mat.use_nodes = True
            bsdf = mat.node_tree.nodes.get("Principled BSDF")
            if bsdf:
                bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
            o.data.materials.clear()
            o.data.materials.append(mat)

    parent.location = (offset_x, 0, 0)
    parent.rotation_euler = (0, 0, rot_z)
    return news

load(-0.42, 0)              # frente
load(0.42, math.radians(180))  # costas

cam_data = bpy.data.cameras.new("cam")
cam_data.type = 'ORTHO'
cam_data.ortho_scale = 1.65
cam = bpy.data.objects.new("cam", cam_data)
bpy.context.scene.collection.objects.link(cam)
cam.location = (0, -3, 0)
cam.rotation_euler = (math.radians(90), 0, 0)
bpy.context.scene.camera = cam

for pos, energy in (((-2, -3, 2), 120), ((2, -3, 1), 70), ((0, 3, 1), 60)):
    lamp = bpy.data.lights.new("l", 'POINT'); lamp.energy = energy
    lo = bpy.data.objects.new("l", lamp); lo.location = pos
    bpy.context.scene.collection.objects.link(lo)

sc = bpy.context.scene
for engine in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE', 'BLENDER_WORKBENCH'):
    try:
        sc.render.engine = engine
        break
    except TypeError:
        continue
try:
    sc.eevee.taa_render_samples = 16
except Exception:
    pass
sc.render.resolution_x = 900
sc.render.resolution_y = 620
sc.render.film_transparent = False
sc.world = bpy.data.worlds.new("w")
sc.world.use_nodes = True
sc.world.node_tree.nodes["Background"].inputs[0].default_value = (0.04, 0.04, 0.04, 1)
sc.view_settings.view_transform = 'Standard'
sc.view_settings.look = 'None'
sc.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print(f"[preview] {OUT}")
