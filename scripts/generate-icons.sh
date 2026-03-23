#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# generate-icons.sh – Creates all required Tauri icon files from a 1024×1024
# source PNG.
#
# Usage:
#   ./scripts/generate-icons.sh [source.png]
#
# If no source PNG is provided the script generates a default CodeOS icon
# using only tools available on a stock macOS install (sips + iconutil).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ICONS_DIR="$(cd "$(dirname "$0")/.." && pwd)/src-tauri/icons"
SOURCE="${1:-}"
TMP_DIR="$(mktemp -d)"

cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

echo "→ Icon output: $ICONS_DIR"
mkdir -p "$ICONS_DIR"

# ── 1. Obtain or generate a 1024×1024 source PNG ─────────────────────────────
if [[ -z "$SOURCE" ]]; then
  SOURCE="$TMP_DIR/source-1024.png"
  echo "→ No source PNG provided – generating default icon with Python/Pillow …"

  # Try Pillow first (may not be installed), fall back to a pure-Python approach
  python3 - <<'PYEOF' "$SOURCE"
import sys, struct, zlib, math

out = sys.argv[1]
SIZE = 1024

# ── draw a simple rounded-rect "CO" icon in pure Python (no Pillow needed) ──
# We'll write a raw RGBA PNG manually.

def png_chunk(name, data):
    c = zlib.crc32(name + data) & 0xFFFFFFFF
    return struct.pack(">I", len(data)) + name + data + struct.pack(">I", c)

W = H = SIZE
pixels = bytearray(W * H * 4)

def set_pixel(x, y, r, g, b, a=255):
    if 0 <= x < W and 0 <= y < H:
        idx = (y * W + x) * 4
        pixels[idx]   = r
        pixels[idx+1] = g
        pixels[idx+2] = b
        pixels[idx+3] = a

# Background gradient: deep navy → indigo
for y in range(H):
    t = y / H
    r = int(15 + t * 20)
    g = int(17 + t * 10)
    b = int(40 + t * 60)
    for x in range(W):
        set_pixel(x, y, r, g, b)

# Rounded rect (radius = 220px, inset 60px) – antialiased via alpha
R = 220
INSET = 60
x0, y0, x1, y1 = INSET, INSET, W-INSET, H-INSET
for y in range(H):
    for x in range(W):
        in_rect = x0 <= x <= x1 and y0 <= y <= y1
        # corner check
        cx = cy = None
        if x < x0 + R and y < y0 + R: cx, cy = x0+R, y0+R
        elif x > x1 - R and y < y0 + R: cx, cy = x1-R, y0+R
        elif x < x0 + R and y > y1 - R: cx, cy = x0+R, y1-R
        elif x > x1 - R and y > y1 - R: cx, cy = x1-R, y1-R
        if cx is not None:
            dist = math.sqrt((x-cx)**2 + (y-cy)**2)
            if dist > R + 1: continue
            if dist > R:
                alpha = int(255 * (R+1-dist))
                idx = (y*W+x)*4
                pixels[idx+3] = min(pixels[idx+3], alpha)
        elif not in_rect:
            continue
        # accent fill: slightly lighter blue
        t = y / H
        r = int(30 + t*30)
        g = int(35 + t*20)
        b = int(90 + t*80)
        set_pixel(x, y, r, g, b)

# Write PNG
raw_rows = b""
for y in range(H):
    row = bytes(pixels[y*W*4:(y+1)*W*4])
    raw_rows += b"\x00" + row
compressed = zlib.compress(raw_rows, 9)
with open(out, "wb") as f:
    f.write(b"\x89PNG\r\n\x1a\n")
    f.write(png_chunk(b"IHDR", struct.pack(">IIBBBBB", W, H, 8, 6, 0, 0, 0)))
    f.write(png_chunk(b"IDAT", compressed))
    f.write(png_chunk(b"IEND", b""))
print(f"Generated {out}")
PYEOF

fi

echo "→ Resizing icons with sips …"

# ── 2. Generate PNG sizes with sips (built-in macOS) ─────────────────────────
sips -z 32   32   "$SOURCE" --out "$ICONS_DIR/32x32.png"      > /dev/null
sips -z 128  128  "$SOURCE" --out "$ICONS_DIR/128x128.png"    > /dev/null
sips -z 256  256  "$SOURCE" --out "$ICONS_DIR/128x128@2x.png" > /dev/null
sips -z 1024 1024 "$SOURCE" --out "$TMP_DIR/icon-1024.png"    > /dev/null 2>&1 || \
  cp "$SOURCE" "$TMP_DIR/icon-1024.png"

# ── 3. Build .icns with iconutil ──────────────────────────────────────────────
ICONSET="$TMP_DIR/AppIcon.iconset"
mkdir -p "$ICONSET"

for size in 16 32 64 128 256 512 1024; do
  sips -z $size $size "$SOURCE" --out "$ICONSET/icon_${size}x${size}.png" > /dev/null
done
# @2x variants
for size in 16 32 64 128 256 512; do
  dbl=$(( size * 2 ))
  cp "$ICONSET/icon_${dbl}x${dbl}.png" "$ICONSET/icon_${size}x${size}@2x.png"
done

iconutil -c icns "$ICONSET" -o "$ICONS_DIR/icon.icns"
echo "→ icon.icns created"

# ── 4. Create a minimal .ico (16/32/48 px) using Python ──────────────────────
python3 - "$ICONS_DIR/icon.ico" "$TMP_DIR/icon-1024.png" <<'PYEOF'
import sys, struct, zlib, math

out_path = sys.argv[1]
src_png  = sys.argv[2]

# Read our generated PNG
with open(src_png, "rb") as f:
    png_data = f.read()

# For simplicity, embed the same PNG bytes as all three sizes in the ICO.
# Windows/Tauri only cares about having a valid ICO.
sizes = [16, 32, 48]
# Re-scale using sips was already done; just use the 32px PNG as a proxy
import subprocess, tempfile, os
images = {}
for s in sizes:
    tmp = tempfile.mktemp(suffix=".png")
    subprocess.run(["sips", "-z", str(s), str(s), src_png, "--out", tmp],
                   capture_output=True)
    with open(tmp, "rb") as f:
        images[s] = f.read()
    os.unlink(tmp)

# ICO header
n = len(sizes)
header = struct.pack("<HHH", 0, 1, n)
offset = 6 + n * 16
entries = b""
data_blob = b""
for s in sizes:
    img = images[s]
    entries += struct.pack("<BBBBHHII",
        s if s < 256 else 0,  # width (0=256)
        s if s < 256 else 0,  # height
        0, 0,                  # color count, reserved
        1, 32,                 # planes, bpp
        len(img), offset)
    offset += len(img)
    data_blob += img

with open(out_path, "wb") as f:
    f.write(header + entries + data_blob)

print(f"Generated {out_path}")
PYEOF

echo "✓ All icons generated in $ICONS_DIR"
ls -lh "$ICONS_DIR"
