#!/usr/bin/env python3
"""
IronTracks — Instagram Carousel Generator
Gera 10 slides 1080x1080 para @irontrackscompany
"""

from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os
import textwrap

BASE = '/Volumes/SSD NVME 512GB/Projetos Antigravity/App IronTracks'
OUT  = f'{BASE}/instagram-carousel'
os.makedirs(OUT, exist_ok=True)

# ── Cores ──────────────────────────────────────────────────────────
BG        = (10, 10, 10)
BG2       = (18, 18, 18)
GOLD      = (201, 160, 34)
GOLD_L    = (240, 198, 70)
WHITE     = (255, 255, 255)
GRAY      = (150, 150, 150)
DARK_CARD = (22, 22, 22)
ACCENT    = (201, 160, 34, 30)

SIZE = (1080, 1080)

FONT_REG  = '/System/Library/Fonts/HelveticaNeue.ttc'
IDX_REG   = 0
IDX_BOLD  = 1

def fnt(size, bold=False):
    return ImageFont.truetype(FONT_REG, size, index=IDX_BOLD if bold else IDX_REG)

def text_w(draw, text, font):
    bb = draw.textbbox((0, 0), text, font=font)
    return bb[2] - bb[0]

def text_h(draw, text, font):
    bb = draw.textbbox((0, 0), text, font=font)
    return bb[3] - bb[1]

def centered_text(draw, text, y, font, color=WHITE, width=1080):
    w = text_w(draw, text, font)
    draw.text(((width - w) // 2, y), text, fill=color, font=font)
    return text_h(draw, text, font)

def wrap_text(draw, text, x, y, font, color, max_width, line_spacing=8):
    words = text.split()
    lines = []
    current = ''
    for word in words:
        test = (current + ' ' + word).strip()
        if text_w(draw, test, font) <= max_width:
            current = test
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)

    cy = y
    for line in lines:
        draw.text((x, cy), line, fill=color, font=font)
        cy += text_h(draw, line, font) + line_spacing
    return cy

def make_canvas():
    img = Image.new('RGB', SIZE, BG)
    return img

def add_gold_glow(img, cx=540, cy=540, radius=320, intensity=0.12):
    glow = Image.new('RGB', SIZE, (0, 0, 0))
    draw = ImageDraw.Draw(glow)
    for r in range(radius, 0, -4):
        a = int(255 * intensity * (1 - r/radius))
        draw.ellipse([cx-r, cy-r, cx+r, cy+r], fill=(201, 160, 34))
    img = Image.blend(img, glow, intensity)
    return img

def add_bottom_gradient(img, start_y=700):
    overlay = Image.new('RGBA', SIZE, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    for y in range(start_y, 1080):
        alpha = int(200 * (y - start_y) / (1080 - start_y))
        draw.line([(0, y), (1080, y)], fill=(10, 10, 10, alpha))
    base = img.convert('RGBA')
    result = Image.alpha_composite(base, overlay)
    return result.convert('RGB')

def draw_gold_line(draw, x1, y, x2, thick=3):
    draw.rectangle([x1, y, x2, y + thick], fill=GOLD)

def phone_mockup(canvas, shot_path, x, y, w, h):
    if not os.path.exists(shot_path):
        return canvas
    shot = Image.open(shot_path).convert('RGBA')
    sw, sh = shot.size
    scale = min(w / sw, h / sh)
    nw, nh = int(sw * scale), int(sh * scale)
    shot = shot.resize((nw, nh), Image.LANCZOS)

    radius = 36

    # Shadow
    shadow_layer = Image.new('RGBA', SIZE, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow_layer)
    sd.rounded_rectangle([x+8, y+8, x+nw+8, y+nh+8], radius=radius, fill=(0, 0, 0, 140))
    shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(20))
    canvas = canvas.convert('RGBA')
    canvas = Image.alpha_composite(canvas, shadow_layer)

    # Phone frame (gold border)
    frame_layer = Image.new('RGBA', SIZE, (0, 0, 0, 0))
    fd = ImageDraw.Draw(frame_layer)
    fd.rounded_rectangle([x-3, y-3, x+nw+3, y+nh+3], radius=radius+3, fill=(*GOLD, 80))
    canvas = Image.alpha_composite(canvas, frame_layer)

    # Screenshot with rounded mask
    mask = Image.new('L', (nw, nh), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle([0, 0, nw, nh], radius=radius, fill=255)
    shot.putalpha(mask)
    canvas.paste(shot, (x, y), shot)

    return canvas.convert('RGB')

def draw_dots(draw, current, total=10, y=1042):
    dot_r = 5
    gap = 18
    total_w = total * (dot_r*2) + (total-1) * (gap - dot_r*2)
    sx = (1080 - total_w) // 2
    for i in range(total):
        cx = sx + i * gap
        if i == current:
            draw.ellipse([cx, y, cx+dot_r*2, y+dot_r*2], fill=GOLD)
        else:
            draw.ellipse([cx, y, cx+dot_r*2, y+dot_r*2], fill=(55, 55, 55))

def draw_topbar(draw, label='', page=1, total=10):
    # Logo mini
    f = fnt(22, bold=True)
    draw.text((48, 44), "IRON", fill=WHITE, font=f)
    iw = text_w(draw, "IRON", f)
    draw.text((48 + iw, 44), "TRACKS", fill=GOLD, font=f)
    # Page number
    fp = fnt(16)
    pg_txt = f'{page}/{total}'
    pw = text_w(draw, pg_txt, fp)
    draw.text((1080 - 48 - pw, 49), pg_txt, fill=GRAY, font=fp)
    # Gold top line
    draw.rectangle([0, 0, 1080, 4], fill=GOLD)

def draw_ig_handle(draw, y=1022):
    f = fnt(17)
    txt = '@irontrackscompany'
    w = text_w(draw, txt, f)
    draw.text(((1080-w)//2, y), txt, fill=(90, 90, 90), font=f)

# ════════════════════════════════════════════════════════════════════
# SLIDE 1 — CAPA
# ════════════════════════════════════════════════════════════════════
def slide_01():
    img = make_canvas()
    img = add_gold_glow(img, cx=540, cy=400, radius=400, intensity=0.18)
    draw = ImageDraw.Draw(img)

    # Logo
    logo_path = f'{BASE}/Logo Nova IronTracks.png'
    if os.path.exists(logo_path):
        logo = Image.open(logo_path).convert('RGBA')
        lw, lh = logo.size
        scale = 260 / lw
        logo = logo.resize((int(lw*scale), int(lh*scale)), Image.LANCZOS)
        img.paste(logo, ((1080-logo.width)//2, 165), logo)
        draw = ImageDraw.Draw(img)

    # IRONTRACKS headline
    f_big = fnt(76, bold=True)
    iron_w = text_w(draw, "IRON", f_big)
    tracks_w = text_w(draw, "TRACKS", f_big)
    total_w = iron_w + tracks_w
    tx = (1080 - total_w) // 2
    draw.text((tx, 500), "IRON", fill=WHITE, font=f_big)
    draw.text((tx + iron_w, 500), "TRACKS", fill=GOLD, font=f_big)

    # Separator
    draw_gold_line(draw, 390, 588, 690, thick=3)

    # Tagline
    f_tag = fnt(26, bold=True)
    f_sub = fnt(19)
    line1 = "A PLATAFORMA FITNESS QUE VAI TE"
    line2 = "FAZER QUEBRAR TODO REGISTRO"
    centered_text(draw, line1, 606, f_tag, WHITE)
    centered_text(draw, line2, 638, f_tag, GOLD_L)

    # Sub
    centered_text(draw, "Treinos com IA · Comunidade · Evolução real", 692, f_sub, GRAY)

    # Swipe hint
    f_hint = fnt(17)
    centered_text(draw, "deslize para descobrir  ›", 840, f_hint, (80, 80, 80))

    draw.rectangle([0, 0, 1080, 4], fill=GOLD)
    draw_dots(draw, 0)
    draw_ig_handle(draw)

    img.save(f'{OUT}/slide-01-capa.png')
    print('✓ Slide 1: CAPA')

# ════════════════════════════════════════════════════════════════════
# SLIDE 2 — TREINOS COM IA
# ════════════════════════════════════════════════════════════════════
def slide_02():
    img = make_canvas()
    img = add_gold_glow(img, cx=280, cy=540, radius=380, intensity=0.10)
    draw = ImageDraw.Draw(img)
    draw_topbar(draw, page=2)

    # Phone mockup — left
    img = phone_mockup(img, f'{BASE}/screenshot-dashboard.png', 46, 110, 440, 820)
    draw = ImageDraw.Draw(img)

    # Right side content
    rx = 590
    f_label = fnt(14, bold=True)
    f_h1    = fnt(48, bold=True)
    f_sub   = fnt(22)
    f_body  = fnt(18)

    draw.text((rx, 160), "FUNCIONALIDADE", fill=GOLD, font=f_label)
    draw_gold_line(draw, rx, 188, rx+220, thick=2)

    wrap_text(draw, "TREINOS CRIADOS", rx, 204, fnt(50, bold=True), WHITE, 470)
    wrap_text(draw, "PELA IA EM", rx, 264, fnt(50, bold=True), WHITE, 470)
    wrap_text(draw, "SEGUNDOS", rx, 324, fnt(50, bold=True), GOLD_L, 470)

    draw_gold_line(draw, rx, 398, rx+180, thick=2)

    items = [
        "> Treino Express — pronto em 15 min",
        "> Wizard — periodização inteligente",
        "> Monte com objetivo e dias disponíveis",
        "> IA aprende seus recordes e adapta",
    ]
    cy = 418
    for item in items:
        draw.text((rx, cy), item, fill=GRAY, font=fnt(17))
        cy += 44

    draw_dots(draw, 1)
    draw_ig_handle(draw)

    img.save(f'{OUT}/slide-02-treinos-ia.png')
    print('✓ Slide 2: Treinos com IA')

# ════════════════════════════════════════════════════════════════════
# SLIDE 3 — IRON RANK & GAMIFICAÇÃO
# ════════════════════════════════════════════════════════════════════
def slide_03():
    img = make_canvas()
    img = add_gold_glow(img, cx=800, cy=500, radius=360, intensity=0.11)
    draw = ImageDraw.Draw(img)
    draw_topbar(draw, page=3)

    # Phone left
    img = phone_mockup(img, f'{BASE}/screenshot-dashboard.png', 46, 110, 440, 820)
    draw = ImageDraw.Draw(img)

    rx = 590

    draw.text((rx, 160), "GAMIFICAÇÃO", fill=GOLD, font=fnt(14, bold=True))
    draw_gold_line(draw, rx, 188, rx+200, thick=2)

    draw.text((rx, 204), "CADA KG", fill=WHITE, font=fnt(50, bold=True))
    draw.text((rx, 264), "LEVANTADO", fill=WHITE, font=fnt(50, bold=True))
    draw.text((rx, 324), "TE APROXIMA", fill=WHITE, font=fnt(44, bold=True))
    draw.text((rx, 374), "DA LENDA", fill=GOLD_L, font=fnt(50, bold=True))

    draw_gold_line(draw, rx, 445, rx+170, thick=2)

    ranks = [
        ("> ", "Iniciante das Ferros"),
        ("> ", "Veterano do Ferro"),
        ("> ", "Mestre do Ferro"),
        ("> ", "Lenda Imortal  ← topo"),
    ]
    cy = 462
    for icon, name in ranks:
        draw.text((rx, cy), f"{icon}  {name}", fill=GRAY, font=fnt(17))
        cy += 42

    draw.text((rx, cy+10), "Sistema exclusivo de ranking por", fill=(80,80,80), font=fnt(15))
    draw.text((rx, cy+32), "volume total levantado", fill=(80,80,80), font=fnt(15))

    draw_dots(draw, 2)
    draw_ig_handle(draw)

    img.save(f'{OUT}/slide-03-iron-rank.png')
    print('✓ Slide 3: Iron Rank')

# ════════════════════════════════════════════════════════════════════
# SLIDE 4 — COMUNIDADE
# ════════════════════════════════════════════════════════════════════
def slide_04():
    img = make_canvas()
    img = add_gold_glow(img, cx=800, cy=520, radius=360, intensity=0.10)
    draw = ImageDraw.Draw(img)
    draw_topbar(draw, page=4)

    img = phone_mockup(img, f'{BASE}/screenshot-community.png', 46, 110, 440, 820)
    draw = ImageDraw.Draw(img)

    rx = 590

    draw.text((rx, 160), "COMUNIDADE", fill=GOLD, font=fnt(14, bold=True))
    draw_gold_line(draw, rx, 188, rx+200, thick=2)

    draw.text((rx, 204), "SEU TREINO", fill=WHITE, font=fnt(50, bold=True))
    draw.text((rx, 264), "TEM PLATEIA", fill=GOLD_L, font=fnt(50, bold=True))

    draw_gold_line(draw, rx, 334, rx+170, thick=2)

    wrap_text(draw, "Veja o que seus amigos estão quebrando. Inspire. Seja inspirado.", rx, 354, fnt(20), GRAY, 440, line_spacing=10)

    cy = 490
    feats = [
        "> Feed de atividades em tempo real",
        "> Rankings globais e entre amigos",
        "> Desafios com recompensas",
        "> Siga atletas e personal trainers",
        "> Recordes pessoais celebrados",
    ]
    for f in feats:
        draw.text((rx, cy), f, fill=GRAY, font=fnt(17))
        cy += 44

    draw_dots(draw, 3)
    draw_ig_handle(draw)

    img.save(f'{OUT}/slide-04-comunidade.png')
    print('✓ Slide 4: Comunidade')

# ════════════════════════════════════════════════════════════════════
# SLIDE 5 — NUTRIÇÃO
# ════════════════════════════════════════════════════════════════════
def slide_05():
    img = make_canvas()
    img = add_gold_glow(img, cx=800, cy=500, radius=360, intensity=0.10)
    draw = ImageDraw.Draw(img)
    draw_topbar(draw, page=5)

    img = phone_mockup(img, f'{BASE}/screenshot-nutrition.png', 46, 110, 440, 820)
    draw = ImageDraw.Draw(img)

    rx = 590

    draw.text((rx, 160), "NUTRIÇÃO", fill=GOLD, font=fnt(14, bold=True))
    draw_gold_line(draw, rx, 188, rx+190, thick=2)

    draw.text((rx, 204), "CONTROLE", fill=WHITE, font=fnt(50, bold=True))
    draw.text((rx, 264), "SEUS MACROS", fill=WHITE, font=fnt(44, bold=True))
    draw.text((rx, 314), "COM PRECISÃO", fill=GOLD_L, font=fnt(44, bold=True))

    draw_gold_line(draw, rx, 378, rx+170, thick=2)

    wrap_text(draw, "Meta de calorias calculada automaticamente pelo seu TDEE.", rx, 398, fnt(19), GRAY, 440, line_spacing=8)

    cy = 490
    macros = [
        ("> ", "Calorias", "Meta personalizada por TDEE"),
        ("> ", "Proteína", "Metas por peso corporal"),
        ("> ", "Carboidratos", "Ajuste por objetivo"),
        ("> ", "Gordura", "Controle total dos macros"),
    ]
    for icon, name, desc in macros:
        draw.text((rx, cy), f"{icon}  {name}", fill=WHITE, font=fnt(18, bold=True))
        draw.text((rx + 160, cy + 2), f"— {desc}", fill=(90,90,90), font=fnt(15))
        cy += 44

    draw.text((rx, cy+14), "Gráfico Treino × Nutrição — 30 dias", fill=(70,70,70), font=fnt(15))

    draw_dots(draw, 4)
    draw_ig_handle(draw)

    img.save(f'{OUT}/slide-05-nutricao.png')
    print('✓ Slide 5: Nutrição')

# ════════════════════════════════════════════════════════════════════
# SLIDE 6 — AVALIAÇÕES & EVOLUÇÃO
# ════════════════════════════════════════════════════════════════════
def slide_06():
    img = make_canvas()
    img = add_gold_glow(img, cx=800, cy=500, radius=360, intensity=0.10)
    draw = ImageDraw.Draw(img)
    draw_topbar(draw, page=6)

    img = phone_mockup(img, f'{BASE}/screenshot-assessments.png', 46, 110, 440, 820)
    draw = ImageDraw.Draw(img)

    rx = 590

    draw.text((rx, 160), "AVALIAÇÕES", fill=GOLD, font=fnt(14, bold=True))
    draw_gold_line(draw, rx, 188, rx+200, thick=2)

    draw.text((rx, 204), "EVOLUÇÃO", fill=WHITE, font=fnt(52, bold=True))
    draw.text((rx, 264), "VISÍVEL EM", fill=WHITE, font=fnt(52, bold=True))
    draw.text((rx, 324), "CADA DETALHE", fill=GOLD_L, font=fnt(44, bold=True))

    draw_gold_line(draw, rx, 390, rx+170, thick=2)

    wrap_text(draw, "Documente sua jornada. Números não mentem.", rx, 410, fnt(20), GRAY, 440)

    cy = 478
    metrics = [
        ("> ", "Peso corporal"),
        ("> ", "% de Gordura"),
        ("> ", "Massa Magra"),
        ("> ", "BMR (Taxa metabólica basal)"),
        ("> ", "Import por foto ou PDF"),
    ]
    for icon, label in metrics:
        draw.text((rx, cy), f"{icon} {label}", fill=GRAY, font=fnt(18))
        cy += 44

    draw_dots(draw, 5)
    draw_ig_handle(draw)

    img.save(f'{OUT}/slide-06-avaliacoes.png')
    print('✓ Slide 6: Avaliações')

# ════════════════════════════════════════════════════════════════════
# SLIDE 7 — VIP ELITE
# ════════════════════════════════════════════════════════════════════
def slide_07():
    img = make_canvas()
    img = add_gold_glow(img, cx=800, cy=500, radius=400, intensity=0.14)
    draw = ImageDraw.Draw(img)
    draw_topbar(draw, page=7)

    img = phone_mockup(img, f'{BASE}/screenshot-vip2.png', 46, 110, 440, 820)
    draw = ImageDraw.Draw(img)

    rx = 590

    draw.text((rx, 160), "VIP ELITE", fill=GOLD, font=fnt(14, bold=True))
    draw_gold_line(draw, rx, 188, rx+200, thick=2)

    draw.text((rx, 204), "ACESSO AO", fill=WHITE, font=fnt(52, bold=True))
    draw.text((rx, 264), "NÍVEL MÁXIMO", fill=WHITE, font=fnt(48, bold=True))
    draw.text((rx, 320), "DO APP", fill=GOLD_L, font=fnt(52, bold=True))

    draw_gold_line(draw, rx, 388, rx+170, thick=2)

    cy = 408
    vips = [
        ("> ", "Coach IA — sessões ilimitadas"),
        ("> ", "Wizard — treinos periodizados"),
        ("> ", "Insights avançados de PRs"),
        ("> ", "Nutrição sem limites"),
        ("> ", "Histórico completo de treinos"),
        ("> ", "Tudo sem restrição"),
    ]
    for icon, label in vips:
        draw.text((rx, cy), f"{icon}  {label}", fill=GRAY, font=fnt(17))
        cy += 44

    draw_dots(draw, 6)
    draw_ig_handle(draw)

    img.save(f'{OUT}/slide-07-vip.png')
    print('✓ Slide 7: VIP Elite')

# ════════════════════════════════════════════════════════════════════
# SLIDE 8 — COACH IA
# ════════════════════════════════════════════════════════════════════
def slide_08():
    img = make_canvas()
    img = add_gold_glow(img, cx=800, cy=500, radius=360, intensity=0.11)
    draw = ImageDraw.Draw(img)
    draw_topbar(draw, page=8)

    img = phone_mockup(img, f'{BASE}/screenshot-vip2.png', 46, 110, 440, 820)
    draw = ImageDraw.Draw(img)

    rx = 590

    draw.text((rx, 160), "INTELIGÊNCIA ARTIFICIAL", fill=GOLD, font=fnt(13, bold=True))
    draw_gold_line(draw, rx, 184, rx+260, thick=2)

    draw.text((rx, 200), "UM COACH IA", fill=WHITE, font=fnt(46, bold=True))
    draw.text((rx, 254), "DISPONÍVEL", fill=WHITE, font=fnt(46, bold=True))
    draw.text((rx, 308), "24 HORAS", fill=GOLD_L, font=fnt(52, bold=True))
    draw.text((rx, 368), "POR DIA", fill=WHITE, font=fnt(46, bold=True))

    draw_gold_line(draw, rx, 430, rx+170, thick=2)

    wrap_text(draw, "Pergunte sobre treino, nutrição, sobrecarga, exercícios. A IA responde com base no SEU histórico.", rx, 450, fnt(18), GRAY, 440, line_spacing=8)

    cy = 572
    feats = [
        "> Respostas personalizadas ao seu perfil",
        "> Análise dos seus PRs e fraquezas",
        "> Sugestão de cargas e progressão",
        "> Chat ilimitado no plano VIP",
    ]
    for f in feats:
        draw.text((rx, cy), f, fill=GRAY, font=fnt(17))
        cy += 44

    draw_dots(draw, 7)
    draw_ig_handle(draw)

    img.save(f'{OUT}/slide-08-coach-ia.png')
    print('✓ Slide 8: Coach IA')

# ════════════════════════════════════════════════════════════════════
# SLIDE 9 — PARA PROFESSORES
# ════════════════════════════════════════════════════════════════════
def slide_09():
    img = make_canvas()
    img = add_gold_glow(img, cx=800, cy=500, radius=360, intensity=0.10)
    draw = ImageDraw.Draw(img)
    draw_topbar(draw, page=9)

    img = phone_mockup(img, f'{BASE}/screenshot-professores.png', 46, 110, 440, 820)
    draw = ImageDraw.Draw(img)

    rx = 590

    draw.text((rx, 160), "PARA PROFESSORES", fill=GOLD, font=fnt(13, bold=True))
    draw_gold_line(draw, rx, 184, rx+260, thick=2)

    draw.text((rx, 200), "VOCÊ É", fill=WHITE, font=fnt(56, bold=True))
    draw.text((rx, 264), "PROFESSOR?", fill=GOLD_L, font=fnt(50, bold=True))

    draw_gold_line(draw, rx, 330, rx+170, thick=2)

    wrap_text(draw, "Gerencie seus alunos, envie treinos e acompanhe a evolução de cada um — tudo num só lugar.", rx, 350, fnt(19), GRAY, 440, line_spacing=8)

    cy = 480
    feats = [
        "> Envie treinos personalizados",
        "> Acompanhe evolução de cada aluno",
        "> Acesso ao histórico e PRs do aluno",
        "> Agenda de sessões integrada",
        "> Até 34+ professores na plataforma",
        "> Planos a partir de R$49/mês",
    ]
    for f in feats:
        draw.text((rx, cy), f, fill=GRAY, font=fnt(17))
        cy += 44

    draw_dots(draw, 8)
    draw_ig_handle(draw)

    img.save(f'{OUT}/slide-09-professores.png')
    print('✓ Slide 9: Para Professores')

# ════════════════════════════════════════════════════════════════════
# SLIDE 10 — CTA
# ════════════════════════════════════════════════════════════════════
def slide_10():
    img = make_canvas()
    img = add_gold_glow(img, cx=540, cy=420, radius=500, intensity=0.20)
    draw = ImageDraw.Draw(img)

    # Gold top line
    draw.rectangle([0, 0, 1080, 4], fill=GOLD)

    # Logo
    logo_path = f'{BASE}/Logo Nova IronTracks.png'
    if os.path.exists(logo_path):
        logo = Image.open(logo_path).convert('RGBA')
        lw, lh = logo.size
        scale = 160 / lw
        logo = logo.resize((int(lw*scale), int(lh*scale)), Image.LANCZOS)
        img.paste(logo, ((1080-logo.width)//2, 120), logo)
        draw = ImageDraw.Draw(img)

    # Main CTA
    f_cta = fnt(78, bold=True)
    f_sub = fnt(32, bold=True)
    f_body = fnt(22)
    f_sm = fnt(18)

    centered_text(draw, "SEU PRÓXIMO", 330, f_cta, WHITE)
    centered_text(draw, "NÍVEL", 416, f_cta, WHITE)

    # Gold bar under NÍVEL
    draw_gold_line(draw, 300, 510, 780, thick=5)

    centered_text(draw, "COMEÇA AGORA", 528, f_sub, GOLD_L)

    # Separator dots
    centered_text(draw, "· · ·", 584, fnt(22), (60, 60, 60))

    # Sub lines
    centered_text(draw, "Baixe grátis. Treine diferente. Quebre seus limites.", 618, f_body, GRAY)

    # Gold button mockup
    bx, by, bw, bh = 290, 688, 500, 68
    draw.rounded_rectangle([bx, by, bx+bw, by+bh], radius=34, fill=GOLD)
    btn_txt = "BAIXAR GRÁTIS — iOS & ANDROID"
    btn_f = fnt(20, bold=True)
    bw_txt = text_w(draw, btn_txt, btn_f)
    draw.text(((1080-bw_txt)//2, by+20), btn_txt, fill=(10, 10, 10), font=btn_f)

    # Handle + URL
    centered_text(draw, "@irontrackscompany", 788, fnt(22, bold=True), GOLD)
    centered_text(draw, "irontracks.com.br", 824, fnt(18), GRAY)

    # Bottom tagline
    centered_text(draw, "Alta Performance. Toda Sessão.", 880, fnt(16), (60, 60, 60))

    draw_dots(draw, 9)

    img.save(f'{OUT}/slide-10-cta.png')
    print('✓ Slide 10: CTA')

# ════════════════════════════════════════════════════════════════════
# MAIN
# ════════════════════════════════════════════════════════════════════
if __name__ == '__main__':
    print('\n🎨  IronTracks — Gerando carousel Instagram...\n')
    slide_01()
    slide_02()
    slide_03()
    slide_04()
    slide_05()
    slide_06()
    slide_07()
    slide_08()
    slide_09()
    slide_10()
    print(f'\n✅  10 slides gerados em:\n    {OUT}\n')
