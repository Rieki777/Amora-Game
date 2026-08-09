#!/usr/bin/env python3
"""Stitch Esri World Imagery around the Amora pin into the map's base plate, with a game-look grade."""
import io, math, time, urllib.request
from PIL import Image, ImageEnhance

LAT, LON = 9.2320128, -83.8343203
Z = 17
MPP = 156543.03392 * math.cos(math.radians(LAT)) / (2 ** Z)   # meters per pixel
# world: 2400x1600 units; we want ~2592m x 1728m with the pin sitting right-of-center
WORLD_M_W, WORLD_M_H = 2592, 1728
PIN_AT = (1520, 800)  # world units where the pin should land
PXW, PXH = int(WORLD_M_W / MPP), int(WORLD_M_H / MPP)

def g_px(lat, lon):
    n = 2 ** Z * 256
    x = (lon + 180) / 360 * n
    lr = math.radians(lat)
    y = (1 - math.log(math.tan(lr) + 1 / math.cos(lr)) / math.pi) / 2 * n
    return x, y

gx, gy = g_px(LAT, LON)
west = gx - (PIN_AT[0] / 2400 * WORLD_M_W) / MPP
top = gy - (PIN_AT[1] / 1600 * WORLD_M_H) / MPP
tx0, ty0 = int(west // 256), int(top // 256)
tx1, ty1 = int((west + PXW) // 256), int((top + PXH) // 256)
print(f"{MPP:.3f} m/px · canvas {PXW}x{PXH}px · tiles x{tx0}-{tx1} y{ty0}-{ty1} = {(tx1-tx0+1)*(ty1-ty0+1)}")

mosaic = Image.new("RGB", ((tx1 - tx0 + 1) * 256, (ty1 - ty0 + 1) * 256))
ok = bad = 0
for ty in range(ty0, ty1 + 1):
    for tx in range(tx0, tx1 + 1):
        url = f"https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{Z}/{ty}/{tx}"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "AmoraLivingMap-prototype/0.3"})
            with urllib.request.urlopen(req, timeout=20) as r:
                mosaic.paste(Image.open(io.BytesIO(r.read())).convert("RGB"), ((tx - tx0) * 256, (ty - ty0) * 256))
            ok += 1
        except Exception as e:
            bad += 1; print("tile fail", tx, ty, str(e)[:60])
        time.sleep(0.05)
print("tiles ok/bad:", ok, bad)

crop = mosaic.crop((int(west - tx0 * 256), int(top - ty0 * 256),
                    int(west - tx0 * 256) + PXW, int(top - ty0 * 256) + PXH))
# ---- game-look grade: lift saturation, deepen contrast, warm-green wash, edge vignette ----
crop = ImageEnhance.Color(crop).enhance(1.3)
crop = ImageEnhance.Contrast(crop).enhance(1.1)
crop = ImageEnhance.Brightness(crop).enhance(1.04)
wash = Image.new("RGB", crop.size, (40, 72, 48))
crop = Image.blend(crop, wash, 0.13)
crop.save("/home/claude/livingmap/amora-sat.png")
crop.resize((1280, int(1280 * PXH / PXW))).save("/home/claude/livingmap/amora-sat-preview.png")
print("saved", crop.size)
