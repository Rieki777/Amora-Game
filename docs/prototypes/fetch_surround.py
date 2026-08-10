#!/usr/bin/env python3
"""The land beyond the land: real ground out to the edge of the field of view.

Rye, looking at the D1 build: "extend it out for my whole field of view."
The core plate covers exactly the 2400x1600 world rect, so everything past it
was flat colour. This stitches a WIDER, lower-zoom mosaic from the same Esri
World Imagery and the same grade, to be drawn UNDER the core plate over an
extended rect. The world coordinate system does not move: every structure,
feature, boundary point and export stays exactly where it was.

Peripheral vision does not need detail, so the surround is fetched a zoom
level below the core. When a reader is close enough to see pixels, they are
looking at the core.

Usage: python3 fetch_surround.py [out.jpg]
"""
import io, math, sys, time, urllib.request
from PIL import Image, ImageEnhance

OUT = sys.argv[1] if len(sys.argv) > 1 else "amora-surround.jpg"

# ── the same pin and the same world the core plate was cut from ──────────
LAT, LON = 9.2320128, -83.8343203
WORLD_W, WORLD_H = 2400, 1600          # world units
WORLD_M_W, WORLD_M_H = 2592, 1728      # metres the world rect covers
PIN_AT = (1520, 800)                   # world units where the pin lands
MPU = WORLD_M_W / WORLD_W              # 1.08 m per world unit

# How far past the rect a reader can pull the camera, in world units. The
# clamp allows half a screen past the land at the widest zoom; this is that,
# rounded up, so the rim is never colour.
PAD_X, PAD_Y = 780, 920
Z = int(__import__("os").environ.get("SUR_Z","16"))
MPP = 156543.03392 * math.cos(math.radians(LAT)) / (2 ** Z)

SUR_M_W = (WORLD_W + 2 * PAD_X) * MPU
SUR_M_H = (WORLD_H + 2 * PAD_Y) * MPU
PXW, PXH = int(SUR_M_W / MPP), int(SUR_M_H / MPP)


def g_px(lat, lon):
    n = 2 ** Z * 256
    x = (lon + 180) / 360 * n
    lr = math.radians(lat)
    y = (1 - math.log(math.tan(lr) + 1 / math.cos(lr)) / math.pi) / 2 * n
    return x, y


gx, gy = g_px(LAT, LON)
# the pin sits at PIN_AT inside the world rect, which starts PAD in from the surround
west = gx - ((PIN_AT[0] + PAD_X) * MPU) / MPP
top = gy - ((PIN_AT[1] + PAD_Y) * MPU) / MPP
tx0, ty0 = int(west // 256), int(top // 256)
tx1, ty1 = int((west + PXW) // 256), int((top + PXH) // 256)
n_tiles = (tx1 - tx0 + 1) * (ty1 - ty0 + 1)
print(f"z{Z} · {MPP:.3f} m/px · canvas {PXW}x{PXH}px · {n_tiles} tiles")

mosaic = Image.new("RGB", ((tx1 - tx0 + 1) * 256, (ty1 - ty0 + 1) * 256))
ok = bad = 0
for ty in range(ty0, ty1 + 1):
    for tx in range(tx0, tx1 + 1):
        url = f"https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{Z}/{ty}/{tx}"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "AmoraLivingMap-prototype/0.4"})
            with urllib.request.urlopen(req, timeout=25) as r:
                mosaic.paste(Image.open(io.BytesIO(r.read())).convert("RGB"), ((tx - tx0) * 256, (ty - ty0) * 256))
            ok += 1
        except Exception as e:
            bad += 1
            print("tile fail", tx, ty, str(e)[:60])
        time.sleep(0.04)
print("tiles ok/bad:", ok, bad)
assert bad * 4 < ok, "too many tiles missing to trust the mosaic"

crop = mosaic.crop((int(west - tx0 * 256), int(top - ty0 * 256),
                    int(west - tx0 * 256) + PXW, int(top - ty0 * 256) + PXH))


def heal_open_water(im):
    """Esri's mosaic drops a different, hazy capture over the open Pacific here,
    as a hard-edged pale rectangle. It is the same at z15 and z16, so it is the
    source and not the stitch. Every pixel of it is open water, so it is healed
    against the image's own clean sea rather than patched by hand.

    A cloud over jungle is pale too, and those are real weather worth keeping,
    so the mask only takes pale pixels that are FAR FROM LAND.
    """
    import numpy as np
    from PIL import ImageFilter
    a = np.asarray(im).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx, mn = a.max(2), a.min(2)
    val = mx / 255.0
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)

    # measured, not guessed: jungle sits at val .27 sat .62, clean sea at
    # .22/.91, and the bad capture at .60/.18. Green dominance ALONE calls the
    # haze block land, because it is a pale green-grey, so land has to be
    # green and saturated and not pale.
    land = ((g > r + 6) & (g > b + 6) & (sat > 0.30) & (val < 0.55)).astype(np.uint8) * 255
    near = Image.fromarray(land).filter(ImageFilter.MaxFilter(9))
    for _ in range(6):                       # reach well past the surf line
        near = near.filter(ImageFilter.MaxFilter(9))
    near = np.asarray(near).astype(np.float32) / 255.0

    # The bad capture arrives as TILES, and the tiles differ from each other,
    # so a per-pixel threshold takes some and leaves others and the result is a
    # checkerboard. Decide per cell instead: a cell is bad or it is not, and
    # its neighbours go with it.
    C = 64
    hh2, ww2 = a.shape[0] // C * C, a.shape[1] // C * C
    def cell_mean(x):
        return x[:hh2, :ww2].reshape(hh2 // C, C, ww2 // C, C).mean((1, 3))
    c_sat, c_val, c_near = cell_mean(sat), cell_mean(val), cell_mean(near)
    bad = ((c_val > 0.36) & (c_sat < 0.46) & (c_near < 0.25)).astype(np.uint8) * 255
    if bad.sum() == 0:
        print("open water looks clean, nothing healed")
        return im
    bad_im = Image.fromarray(bad).filter(ImageFilter.MaxFilter(3))   # take the neighbours too
    soft = np.asarray(bad_im.resize((a.shape[1], a.shape[0]), Image.BILINEAR)
                      .filter(ImageFilter.GaussianBlur(C // 2))).astype(np.float32) / 255.0
    haze = soft

    sea = (sat >= 0.24) & (near < 0.5) & (b > g) & (val < 0.6)   # the honest water
    if sea.sum() < 500:
        return im
    # the DEEP end of the honest water, not its median: the median is pulled up
    # by the bright shallows and the fill came out lighter than the ocean it sat in
    med = np.array([np.percentile(a[..., i][sea], 30) for i in range(3)], dtype=np.float32)
    # darker the further from shore, and the shore is east of this water
    xs = np.linspace(0.78, 1.06, a.shape[1], dtype=np.float32)[None, :, None]
    fill = np.clip(med[None, None, :] * xs, 0, 255)
    out = a * (1 - soft[..., None]) + fill * soft[..., None]
    print(f"healed {int(haze.sum())} px of open water ({100*haze.mean():.1f}% of the plate)")
    return Image.fromarray(out.astype(np.uint8))


crop = heal_open_water(crop)
# The core plate's grade, verbatim, so the join between the two is invisible.
crop = ImageEnhance.Color(crop).enhance(1.3)
crop = ImageEnhance.Contrast(crop).enhance(1.1)
crop = ImageEnhance.Brightness(crop).enhance(1.04)
crop = Image.blend(crop, Image.new("RGB", crop.size, (40, 72, 48)), 0.13)
crop.save(OUT, "JPEG", quality=76, optimize=True)
import os
print("saved", OUT, crop.size, os.path.getsize(OUT) // 1024, "KB")
print("world rect of this image:", (-PAD_X, -PAD_Y, WORLD_W + 2 * PAD_X, WORLD_H + 2 * PAD_Y))
