"""
Pipeline Blender headless: Z-Anatomy (.blend) -> body-map.glb do IronTracks.

Uso:
  blender -b <Startup.blend> -P build-glb.py -- \
      --map scripts/muscle-map-3d/muscle-groups.json \
      --out public/models/body-map.glb \
      [--target-tris 90000] [--inflate 0.0015] [--no-draco]

O GLB sai com UMA malha por grupo muscular, nomeada com o MuscleId do app
(chest, delts_front, ...), mais uma malha "body" com a superfície corporal.
O componente React acha cada grupo POR NOME — renomear aqui quebra a pintura
lá, silenciosamente. O guard do repo cobre essa lista.

Licença do modelo de origem: Z-Anatomy, CC BY-SA 4.0.
"""

import bpy, bmesh, json, sys, os, math

# ---------------------------------------------------------------- argumentos
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []

def arg(flag, default=None):
    return argv[argv.index(flag) + 1] if flag in argv else default

MAP_PATH    = arg("--map", "scripts/muscle-map-3d/muscle-groups.json")
OUT_PATH    = arg("--out", "public/models/body-map.glb")
TARGET_TRIS = int(arg("--target-tris", "90000"))
# Raio máximo entre a face do manequim e o músculo que a reivindica.
#
# 18 mm é decisão de DESIGN, medida com --calibrate-dist: cor só significa
# contra silêncio, e a 50 mm cada grupo reivindicava a pele toda em volta —
# 90% do corpo aceso, um macacão colorido em que nada se destaca. A 18 mm
# sobra metade do manequim neutro e o músculo ainda tem forma reconhecível;
# abaixo disso os grupos viram manchas soltas e a leitura anatômica se perde.
MAX_REGION_DIST = float(arg("--max-region-dist", "0.018"))
# Modo calibração: mede a distribuição de área para vários pesos de um grupo
# numa execução só. Montar os músculos leva minutos; classificar é rápido — sem
# isso cada tentativa de peso custava um build inteiro.
CALIBRATE = arg("--calibrate")
# Varre RAIOS e mede quanto do corpo fica colorido. O mapa precisa de respiro:
# com raio grande cada grupo reivindica a pele toda em volta e o manequim vira
# um macacão colorido — o 2D só pinta o ventre do músculo.
CALIBRATE_DIST = "--calibrate-dist" in argv

# Quanto a pele do TRONCO E MEMBROS afunda para virar o corpo escuro POR BAIXO
# dos músculos. Mãos, pés e cabeça não afundam: são a pele visível de verdade,
# e ali isso colapsaria os dedos.
#
# 22 mm medido em tela: a 14 mm a coxa e o glúteo ainda ficavam cobertos e só
# aparecia uma faixa fina do feixe — o tecido sobre eles é mais espesso que
# sobre o peitoral.
SKIN_SINK = float(arg("--skin-sink", "0.022"))
USE_DRACO   = "--no-draco" not in argv

# A pele leva uma fatia do orçamento; o resto se divide entre os músculos
# proporcionalmente ao tamanho original de cada grupo.
BODY_TRIS_SHARE = 0.22

print(f"[build] alvo={TARGET_TRIS} tris | raio={MAX_REGION_DIST} m | draco={USE_DRACO}")

# ---------------------------------------------------------------- utilidades
def obj_variants(name):
    """Z-Anatomy nomeia os pares como '<nome>.l' / '<nome>.r'; alguns são únicos."""
    out = []
    for suffix in (".l", ".r", ""):
        o = bpy.data.objects.get(name + suffix)
        if o is not None and o.type == "MESH" and len(o.data.polygons) > 0:
            out.append(o)
    return out


def tri_count(obj):
    """Triângulos da malha (polígono de n lados conta n-2)."""
    return sum(max(len(p.vertices) - 2, 0) for p in obj.data.polygons)


def duplicate(objs, name):
    """Cópia independente (make_single_user) dos objetos, unida numa malha só."""
    copies = []
    for src in objs:
        cp = src.copy()
        cp.data = src.data.copy()      # sem isso, decimar um lado decima o outro
        cp.animation_data_clear()
        for col in list(cp.users_collection):
            col.objects.unlink(cp)
        bpy.context.scene.collection.objects.link(cp)
        cp.hide_viewport = False
        cp.hide_render = False
        copies.append(cp)

    if not copies:
        return None

    bpy.ops.object.select_all(action="DESELECT")
    for c in copies:
        c.select_set(True)
    bpy.context.view_layer.objects.active = copies[0]
    if len(copies) > 1:
        bpy.ops.object.join()

    merged = bpy.context.view_layer.objects.active
    merged.name = name
    merged.data.name = name
    return merged


def apply_transform(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def weld(obj, dist=0.0008):
    """Solda vértices coincidentes — as malhas do BodyParts3D vêm muito fragmentadas."""
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=dist)
    bm.to_mesh(me)
    bm.free()


def decimate(obj, target_tris):
    cur = tri_count(obj)
    if cur <= target_tris or cur == 0:
        return cur
    mod = obj.modifiers.new("dec", "DECIMATE")
    mod.decimate_type = "COLLAPSE"
    mod.ratio = max(0.01, target_tris / cur)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return tri_count(obj)


def fill_holes(obj, sides=400):
    """Fecha as bordas abertas deixadas pelas regiões removidas (virilha).

    Sem isso o manequim fica com um furo preto no lugar da genitália — que é
    pior que o problema original.
    """
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.holes_fill(bm, edges=bm.edges, sides=sides)
    bm.to_mesh(me)
    bm.free()


def recalc_normals(obj):
    """Deixa todas as faces apontando para fora.

    A pele é montada de ~250 objetos independentes do Z-Anatomy e parte deles
    vem com as faces invertidas. Como `inflate` empurra o vértice pela normal,
    a metade invertida INFLA quando se pede para afundar — e cobre os músculos.
    Sintoma medido: um lado do corpo com musculatura visível e o outro liso,
    mesmo com as malhas perfeitamente simétricas.
    """
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()


def inflate(obj, amount):
    """Desloca cada vértice pela própria normal. Negativo AFUNDA.

    É assim que a pele do tronco e dos membros vira o corpo escuro por baixo:
    ela some alguns milímetros para dentro e os músculos, que já estão ali,
    passam a ser a superfície visível. Mãos, pés e cabeça não passam por aqui —
    são pele de verdade, e afundar 14 mm colapsaria os dedos.
    """
    if amount == 0:
        return
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * amount
    bm.to_mesh(me)
    bm.free()


def assign_skin_regions(skin, muscle_objs, max_dist, weights):
    """Fatia a PELE em regiões, uma por grupo muscular.

    É assim que o mapa 2D funciona: o usuário vê a área do corpo que o músculo
    ocupa, pintada na superfície. Duas tentativas anteriores falharam e ficam
    registradas para ninguém repetir:

      1. Exportar as malhas musculares e inflá-las para fora da pele. Elas ficam
         a distâncias muito diferentes da superfície (dedos x abdome), então
         qualquer valor único deixa metade escondida.
      2. Encolher a pele alguns milímetros para o músculo aflorar. Medido a 6 mm:
         aparecem MANCHAS irregulares — um pedaço de antebraço, um risco nas
         costas — porque a espessura do tecido varia pelo corpo. Aumentar o
         encolhimento deforma dedos e rosto antes de fechar as áreas.

    Aqui cada face do manequim pergunta "qual músculo está mais perto de mim?".
    Passando de `max_dist` a face não pertence a ninguém e continua manequim —
    sem esse teto, a cabeça inteira viraria trapézio por falta de concorrência.
    """
    from mathutils import kdtree, Vector

    # Uma árvore POR GRUPO, e não uma só com todos os pontos. Com árvore única
    # os N vizinhos mais próximos de uma face lombar são TODOS do dorsal — ele é
    # denso e está por cima —, então o eretor espinhal nunca entra na disputa e
    # o peso não tem em quem agir. Medido: mudar o peso de 0,55 para 0,30 não
    # alterou UM triângulo. Perguntando a cada grupo a sua distância, todos
    # competem em pé de igualdade.
    trees = {}
    for muscle_id, obj in muscle_objs.items():
        mw = obj.matrix_world
        verts = obj.data.vertices
        kd = kdtree.KDTree(len(verts))
        for i, v in enumerate(verts):
            kd.insert(mw @ v.co, i)
        kd.balance()
        trees[muscle_id] = kd

    mw = skin.matrix_world
    face_group = []
    for poly in skin.data.polygons:
        center = mw @ Vector(poly.center)
        best_id, best_score = None, float("inf")
        for muscle_id, kd in trees.items():
            _, _, dist = kd.find(center)
            score = dist * weights.get(muscle_id, 1.0)
            if score < best_score:
                best_score, best_id = score, muscle_id
        face_group.append(best_id if best_score <= max_dist else None)
    return face_group


def split_skin_by_region(skin, face_group, muscle_ids):
    """Uma malha por grupo, recortada da pele. Sobra vira o manequim ('body')."""
    pieces = {}
    for target in list(muscle_ids) + [None]:
        name = target or "body"
        piece = skin.copy()
        piece.data = skin.data.copy()
        piece.name = name
        piece.data.name = name
        bpy.context.scene.collection.objects.link(piece)

        bm = bmesh.new()
        bm.from_mesh(piece.data)
        bm.faces.ensure_lookup_table()
        doomed = [f for i, f in enumerate(bm.faces) if face_group[i] != target]
        bmesh.ops.delete(bm, geom=doomed, context="FACES")
        bm.to_mesh(piece.data)
        bm.free()

        if len(piece.data.polygons) == 0:
            bpy.data.objects.remove(piece, do_unlink=True)
            continue
        pieces[name] = piece
    return pieces


def set_material(obj, name, rgba):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = rgba
        if "Roughness" in bsdf.inputs:
            bsdf.inputs["Roughness"].default_value = 0.75
        for slot in ("Specular IOR Level", "Specular"):
            if slot in bsdf.inputs:
                bsdf.inputs[slot].default_value = 0.15
                break
    obj.data.materials.clear()
    obj.data.materials.append(mat)


# ---------------------------------------------------------------- construção
_map = json.load(open(MAP_PATH))
groups = _map["groups"]
# Peso < 1 aproxima o grupo: é como um músculo PROFUNDO ganha a superfície que
# de fato é dele. Calibração visual, conferida no render — não é anatomia.
weights = _map.get("weights", {})

bpy.ops.object.mode_set(mode="OBJECT") if bpy.context.object and bpy.context.object.mode != "OBJECT" else None

# Tudo visível: objeto escondido não entra em select/join
for o in bpy.data.objects:
    o.hide_viewport = False
    o.hide_set(False)
for col in bpy.data.collections:
    col.hide_viewport = False

built = {}
missing = []

# --- 1. músculos
raw_sizes = {}
for muscle_id, names in groups.items():
    objs = []
    for n in names:
        found = obj_variants(n)
        if not found:
            missing.append(f"{muscle_id} :: {n}")
        objs.extend(found)
    if not objs:
        continue
    # Prefixo `src_`: estes objetos são só REFERÊNCIA. Se ocupassem o nome
    # final (`chest`), o datablock ainda vivo faria o Blender exportar a peça
    # de verdade como `chest.001` — e o componente, que casa por nome, pintaria
    # NADA, sem erro nenhum. Aconteceu; o guard do contrato pegou.
    merged = duplicate(objs, f"src_{muscle_id}")
    apply_transform(merged)
    weld(merged)
    raw_sizes[muscle_id] = tri_count(merged)
    built[muscle_id] = merged
    print(f"[grupo] {muscle_id:16} {len(objs):3} objetos  {raw_sizes[muscle_id]:>8} tris")

if missing:
    print("[ERRO] nomes não encontrados no .blend:")
    for m in missing:
        print("   ", m)
    sys.exit(1)

# --- 2. superfície corporal (o manequim)
# Excluídos de propósito:
#  .g          -> objetos de RÓTULO do Z-Anatomy (texto 3D "REGIONS OF HUMAN BODY")
#  Hairs       -> cabelo/sobrancelha/pelo púbico; 10k polígonos e o manequim é liso
#  Urogenital/ -> genitália explícita. O buraco que sobra é fechado por holes_fill
#  Anal/Pubic     logo abaixo, virando uma superfície lisa.
SKIN_EXCLUDE = ("hairs", "urogenital region", "anal region", "pubic")

# Superfície que existe no manequim mas nunca pertence a um grupo de treino.
# Sem isso a MÃO inteira vira "antebraço" — 11,6% da superfície do corpo,
# medido, o maior grupo de todos — porque os flexores são o músculo mais
# próximo de qualquer ponto da palma.
NEVER_A_GROUP = (
    "hand", "digit", "palm", "thenar", "nail",
    "foot", "toe", "heel", "sole", "dorsum", "arch of",
    "head", "face", "auricle", "helix", "tragus", "nose", "nostril",
    "eye", "brow", "lip", "mouth", "chin", "cheek", "ear", "temple",
    "occipital region", "parietal region", "frontal region",
)


def never_a_group(name):
    low = name.lower()
    # "forehead" contém "head" e é do rosto — cai na regra do mesmo jeito.
    return any(term in low for term in NEVER_A_GROUP)

def is_label(obj):
    return obj.name.endswith(".g") or obj.name[:-2].endswith(".g")

skin_objs = []
neutral_objs = []
for col in bpy.data.collections:
    if "Regions of human body" in col.name:
        for o in col.all_objects:
            if o.type != "MESH" or len(o.data.polygons) == 0:
                continue
            if is_label(o):
                continue
            if any(term in o.name.lower() for term in SKIN_EXCLUDE):
                continue
            (neutral_objs if never_a_group(o.name) else skin_objs).append(o)
        break

if not skin_objs:
    print("[ERRO] coleção 'Regions of human body' não encontrada — sem manequim base")
    sys.exit(1)

body = duplicate(skin_objs, "src_skin")
apply_transform(body)
weld(body, dist=0.002)
fill_holes(body)
print(f"[grupo] {'body':16} {len(skin_objs):3} objetos  {tri_count(body):>8} tris")

# --- 3. o que se vê é o MÚSCULO, não um adesivo na pele
#
# Três rodadas foram gastas pintando regiões da pele antes de aceitar o óbvio:
# uma região definida por "qual músculo está mais perto desta face" não tem
# forma de músculo — é uma mancha. O dono resumiu em uma frase: "parece um
# manequim pintado por uma criança". Nenhum ajuste de cor, borda ou proporção
# conserta falta de forma.
#
# O Z-Anatomy traz o peitoral COM forma de peitoral. Ele é a superfície agora.
# A pele do tronco e dos membros afunda alguns milímetros e vira o corpo escuro
# que preenche os vãos entre os grupos; mãos, pés e cabeça continuam pele.

MUSCLE_BUDGET = int(TARGET_TRIS * 0.72)
raw_total = sum(raw_sizes.values()) or 1

pieces = {}
for muscle_id, obj in built.items():
    share = raw_sizes[muscle_id] / raw_total
    decimate(obj, max(1200, int(MUSCLE_BUDGET * share)))
    # Sai do prefixo de trabalho: o componente casa malha com grupo POR NOME,
    # e `src_chest` no GLB significa peitoral que nunca acende.
    obj.name = muscle_id
    obj.data.name = muscle_id
    set_material(obj, muscle_id, (0.72, 0.30, 0.26, 1.0))
    pieces[muscle_id] = obj
    print(f"[músculo] {muscle_id:16} {tri_count(obj):>7} tris")

# A pele vira o corpo por baixo: afunda o suficiente para os músculos ficarem
# por fora, sem sumir — ela ainda preenche pescoço, flancos, articulações.
decimate(body, int(TARGET_TRIS * 0.20))
recalc_normals(body)
inflate(body, -SKIN_SINK)
set_material(body, "body", (0.20, 0.20, 0.19, 1.0))

if neutral_objs:
    neutral = duplicate(neutral_objs, "src_neutral")
    apply_transform(neutral)
    weld(neutral, dist=0.002)
    decimate(neutral, int(TARGET_TRIS * 0.08))
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    neutral.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()

body.name = "body"
body.data.name = "body"
set_material(body, "body", (0.20, 0.20, 0.19, 1.0))
pieces["body"] = body
print(f"[malha] {'body':16} {tri_count(body):>7} tris")

# As malhas do Z-Anatomy trazem vertex color próprio. No écorché a forma vem da
# GEOMETRIA, e uma cor de vértice herdada tingiria o músculo por baixo do que o
# app pinta — além de engordar o arquivo à toa. O guard do contrato reprova se
# algum COLOR_0 escapar.
for _piece in pieces.values():
    while len(_piece.data.color_attributes):
        _piece.data.color_attributes.remove(_piece.data.color_attributes[0])

# --- 4. limpar a cena: só o que vai pro GLB
keep = set(pieces.values())
for o in list(bpy.data.objects):
    if o not in keep:
        bpy.data.objects.remove(o, do_unlink=True)

# --- 5. centralizar na origem e normalizar a altura para 1.0
bpy.ops.object.select_all(action="SELECT")
bpy.context.view_layer.objects.active = next(iter(keep))

mins = [math.inf] * 3
maxs = [-math.inf] * 3
for o in keep:
    for corner in o.bound_box:
        wc = o.matrix_world @ __import__("mathutils").Vector(corner)
        for i in range(3):
            mins[i] = min(mins[i], wc[i])
            maxs[i] = max(maxs[i], wc[i])

height = maxs[2] - mins[2]
scale = 1.0 / height if height > 0 else 1.0
center = [(mins[i] + maxs[i]) / 2 for i in range(3)]

for o in keep:
    o.location = (
        (o.location.x - center[0]) * scale,
        (o.location.y - center[1]) * scale,
        (o.location.z - center[2]) * scale,
    )
    o.scale = (o.scale.x * scale, o.scale.y * scale, o.scale.z * scale)

print(f"[normalizar] altura original {height:.3f} -> 1.0 (escala {scale:.4f})")

final_tris = sum(tri_count(o) for o in keep)
print(f"[total] {final_tris} tris em {len(keep)} malhas")

# --- 6. exportar
os.makedirs(os.path.dirname(OUT_PATH) or ".", exist_ok=True)
bpy.ops.object.select_all(action="SELECT")

export_kwargs = dict(
    filepath=OUT_PATH,
    export_format="GLB",
    use_selection=True,
    export_apply=True,
    export_materials="EXPORT",
    export_cameras=False,
    export_lights=False,
    export_yup=True,
    export_normals=True,
    export_texcoords=False,

    export_skins=False,
    export_animations=False,
)
if USE_DRACO:
    export_kwargs.update(
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_draco_position_quantization=12,
        export_draco_normal_quantization=8,
    )

bpy.ops.export_scene.gltf(**export_kwargs)

size_mb = os.path.getsize(OUT_PATH) / 1048576
print(f"[ok] {OUT_PATH} — {size_mb:.2f} MB — {final_tris} tris")
