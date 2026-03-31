#!/usr/bin/env python3
"""
Creates a proper App Store review screenshot with iPhone dimensions.
Target: 1290 x 2796 pixels (iPhone 15 Pro Max / 6.7" display)
"""
import subprocess
import sys
import os

# Paths
SOURCE = "/Users/macmini/Documents/paywall_review.png"
OUTPUT = "/Users/macmini/Documents/review_screenshot_1290x2796.png"

# Target dimensions for iPhone 6.7" display
TARGET_W = 1290
TARGET_H = 2796

# Create a canvas with dark background and place the paywall image centered
# Using sips (built-in macOS tool)

# Step 1: Create a dark background canvas
# We'll use Python's built-in capabilities to create a proper image

try:
    from PIL import Image
    
    # Open source
    src = Image.open(SOURCE)
    
    # Create dark canvas
    canvas = Image.new('RGB', (TARGET_W, TARGET_H), (10, 10, 10))
    
    # Resize source to fit width, maintaining aspect ratio
    src_ratio = src.width / src.height
    new_width = TARGET_W - 40  # 20px padding each side
    new_height = int(new_width / src_ratio)
    
    if new_height > TARGET_H - 200:
        new_height = TARGET_H - 200
        new_width = int(new_height * src_ratio)
    
    src_resized = src.resize((new_width, new_height), Image.LANCZOS)
    
    # Center on canvas
    x_offset = (TARGET_W - new_width) // 2
    y_offset = (TARGET_H - new_height) // 2
    
    canvas.paste(src_resized, (x_offset, y_offset))
    
    # Save without alpha
    canvas.save(OUTPUT, 'PNG')
    print(f"Created: {OUTPUT} ({TARGET_W}x{TARGET_H})")
    
except ImportError:
    print("PIL not available, using sips approach...")
    
    # Approach using sips (macOS built-in)
    import tempfile
    
    # First, resize the source to fit within the target
    # Pad to exact dimensions using sips
    tmp = "/Users/macmini/Documents/tmp_resized.png"
    
    # Resize maintaining aspect ratio to fit width
    subprocess.run([
        "sips", "-Z", str(TARGET_H), "--resampleWidth", str(TARGET_W - 40),
        SOURCE, "--out", tmp
    ], check=True)
    
    # Now pad to exact dimensions with black background
    subprocess.run([
        "sips", "--padToHeightWidth", str(TARGET_H), str(TARGET_W),
        "--padColor", "0A0A0A",
        tmp, "--out", OUTPUT
    ], check=True)
    
    # Clean up
    os.remove(tmp)
    print(f"Created: {OUTPUT} ({TARGET_W}x{TARGET_H})")
