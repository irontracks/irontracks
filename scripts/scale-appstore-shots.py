#!/usr/bin/env python3
"""
Escala screenshots capturados pelo Playwright para as dimensões
exatas exigidas pela App Store (iPhone 6.7" / 6.9" / 6.5").
"""
from PIL import Image
import os

BASE   = '/Volumes/SSD NVME 512GB/Projetos Antigravity/App IronTracks'
SCALED = f'{BASE}/screenshots-appstore'

DEVICE_SIZES = {
    'APP_IPHONE_69': (1320, 2868),
    'APP_IPHONE_67': (1290, 2796),
    'APP_IPHONE_65': (1284, 2778),
}

# Ordem: mais impactante primeiro
SCREENSHOTS = [
    'screenshot-dashboard.png',
    'screenshot-vip2.png',
    'screenshot-community.png',
    'screenshot-assessments.png',
    'screenshot-nutrition.png',
]

for device, (tw, th) in DEVICE_SIZES.items():
    folder = f'{SCALED}/{device}'
    os.makedirs(folder, exist_ok=True)
    for fname in SCREENSHOTS:
        src = f'{BASE}/{fname}'
        if not os.path.exists(src):
            print(f'  SKIP {fname}')
            continue
        img = Image.open(src).convert('RGB')
        sw, sh = img.size
        scale = max(tw / sw, th / sh)
        nw, nh = int(sw * scale), int(sh * scale)
        img = img.resize((nw, nh), Image.LANCZOS)
        left = (nw - tw) // 2
        top  = (nh - th) // 2
        img = img.crop((left, top, left + tw, top + th))
        out = f'{folder}/{fname.replace(".png", f"_{device}.png")}'
        img.save(out, 'PNG')
        print(f'  ✓ {device} / {fname}  →  {tw}×{th}px')

print('\nPronto. Screenshots em: screenshots-appstore/')
