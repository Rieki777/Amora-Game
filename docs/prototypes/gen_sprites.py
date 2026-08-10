#!/usr/bin/env python3
"""Amora Living Map — painterly isometric sprite set via Gemini image API.
One sprite per base icon family, consistent camera/light, magenta-keyed to transparency.
Usage: GEMINI_API_KEY=... python3 gen_sprites.py [family ...]   (no args = all; skips existing unless --force)"""
import base64, io, json, os, sys, time, urllib.request

KEY = os.environ.get("GEMINI_API_KEY"); assert KEY, "GEMINI_API_KEY required"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sprites")
os.makedirs(OUT, exist_ok=True)
MODELS = ["gemini-3-pro-image", "gemini-3-pro-image-preview", "gemini-2.5-flash-image"]

STYLE = ("A single isolated building sprite for a video-game world map of a regenerative ecovillage - "
 "FUTURISTIC SOLARPUNK-ELVEN architecture, an original theme: graceful organic curves that look grown as much "
 "as built, flowing rooflines carrying living gardens, warm sculpted timber and bamboo, seamless curved glass, "
 "woven living-branch lattices, subtle brass-and-gold inlay, small solar-glass petals catching the sun, "
 "flowering vines integrated into the structure. Elegant, luminous, hopeful - NOT medieval, NOT rustic thatch. "
 "Painterly concept-art rendering with crisp game-sprite readability, three-quarter isometric view from the "
 "south-east, camera tilted about 35 degrees, bright cheerful daylight, vivid saturated colors, high-key "
 "lighting, no dark moody shading, no vignette. Whole structure centered with generous margin. "
 "Absolutely flat, solid, pure magenta background (#FF00FF) filling every pixel around the subject - no ground "
 "plane, no cast shadow, no other background elements, no text, no watermark, no border. "
 "Subject: {subject}")

FAMILIES = {
 "bighall": "a grand community great-hall with a sweeping curved living roof, open veranda of sculpted timber arches, and a slender golden light-spire",
 "hall": "a welcoming guest lodge with a flowing curved living roof, wide sculpted-timber porch and soft hanging light-orbs",
 "homes": "a cluster of three small organic pod-cottages with round doors, curved living roofs and tiny front gardens",
 "greenhouse": "a luminous curved-glass growing dome ribbed with sculpted timber, lush plants visible inside, raised garden beds at its feet",
 "kitchen": "an open-air communal kitchen under a sweeping leaf-shaped canopy, a sculpted hearth column with slim copper flue, hanging herbs",
 "library": "a two-story library-workshop of curved timber ribs and glass, round book-lined windows, light bamboo scaffolding on one side",
 "fire": "a council fire circle of smooth carved stone seats around a gentle warm flame, ringed by low flowering planters",
 "market": "a market pavilion with petal-shaped canvas canopies on curved timber ribs and crates of colorful produce",
 "orchard": "a small grove of seven graceful fruit trees with bright red fruit and a soft mulched path between them",
 "spring": "a natural spring pool - a WATER FEATURE with no building: clear turquoise water ringed by mossy stones and ferns, one slender carved marker post",
 "tank": "a sculptural water cistern of smooth pale staved wood banded in brass, on a low stone base with elegant copper pipes",
 "dome": "a serene meditation dome of curved glass petals and timber ribs with faint steam wisps at its door",
 "gate": "a graceful entrance gate of two living-wood pillars woven together into a curved arch, with a small plain banner",
 "barn": "an animal barn with a flowing curved living roof, an open hayloft and a small brass weathervane",
 "solar": "a ground-mounted array of petal-shaped solar-glass panels in a brass frame with wildflowers beneath",
 "tools": "an open workshop of curved timber with a workbench, neat tools on the wall and warm lamplight inside",
 "stage": "a small amphitheater of smooth curved stone terraces facing a low organic-timber stage",
 "bath": "a tiled bathing pool with curved carved privacy screens and gentle steam",
 "tower": "a slender spiral lookout tower of living wood with a small observation crown and a plain flag",
 "field": "neat crop rows in a small tilled field with a friendly scarecrow and a slim irrigation arc",
 "hive": "three sculpted wooden beehives on a low stand amid wildflowers",
 "cycle": "a tidy composting garden with three curved timber bays and a wheelbarrow",
 "bridge": "a small arched footbridge of bent living wood with woven rope rails",
 "school": "an open-air learning pavilion under a leaf-shaped living canopy with low curved benches",
 "lab": "a small research studio of curved timber and glass with copper instruments and a slim chimney",
 "tent": "a large bell tent of pale canvas on a curved wooden platform with a string of tiny lights",
 "sacred": "an ancient spreading tree with a small shrine and soft hanging lanterns at its roots",
 "store": "a village store of curved timber with a porch, woven baskets, barrels and a hanging plain sign",
 # The registry has always referenced these two families and this dict never
 # listed them, so the generator was never asked for them and every Pond,
 # River Pool and Waterfall on the map has fallen back to a flat SVG emblem.
 # Both are WATER FEATURES with no building, phrased like `spring` above so
 # the model does not invent a hut beside the water.
 "pool": "a natural swimming pool - a WATER FEATURE with no building: deep clear turquoise water held by smooth river boulders, a small pebble beach on one side, ferns and overhanging branches",
 "waterfall": "a woodland waterfall - a WATER FEATURE with no building: a slender fall of white water dropping over a mossy rock shelf into a clear plunge pool, wet stones and ferns around it, fine mist in the air",
}

def gen(fam, subject):
    body = {"contents": [{"parts": [{"text": STYLE.format(subject=subject)}]}],
            "generationConfig": {"responseModalities": ["IMAGE", "TEXT"],
                                  "imageConfig": {"aspectRatio": "1:1", "imageSize": "1K"}}}
    for model in MODELS:
        req = urllib.request.Request(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
            data=json.dumps(body).encode(), method="POST",
            headers={"Content-Type": "application/json", "x-goog-api-key": KEY})
        try:
            with urllib.request.urlopen(req, timeout=240) as r:
                resp = json.load(r)
            for part in resp["candidates"][0]["content"]["parts"]:
                if "inlineData" in part:
                    return base64.b64decode(part["inlineData"]["data"])
            print("  no image part from", model)
        except Exception as e:
            msg = e.read().decode()[:200] if hasattr(e, "read") else str(e)
            print("  FAIL", model, ":", msg)
    return None

def _bg_mask(a, np, Image, ImageDraw):
    """Which pixels are the BACKGROUND, found by flooding in from the edges.

    The old key measured every pixel's distance from pure #FF00FF. That works
    only while the model actually paints #FF00FF, and it does not always: the
    `pool` and `waterfall` sprites came back on a muted magenta, read as
    subject, and kept a pink box around them.

    So the background colour is SAMPLED from the border instead of assumed,
    and the mask is flood-filled from the four corners. Flooding matters as
    much as sampling: it only removes background CONNECTED to the edge, so a
    magenta flower in the middle of the subject keeps its pixels instead of
    being punched into a hole.

    Returns a boolean array, or None when the result looks implausible and the
    caller should fall back to the magenta rule.
    """
    h, w = a.shape[:2]
    border = np.concatenate([a[0:2].reshape(-1, 3), a[h - 2:h].reshape(-1, 3),
                             a[:, 0:2].reshape(-1, 3), a[:, w - 2:w].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    # Distance from the sampled background, as an 8-bit image PIL can flood.
    d = np.sqrt(((a - bg) ** 2).sum(axis=2))
    # Clamp to 254 so the sentinel 255 can only ever come from the fill.
    lo = Image.fromarray(np.clip(d, 0, 254).astype(np.uint8), "L")
    for seed in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        ImageDraw.floodfill(lo, seed, 255, thresh=60)
    mask = np.asarray(lo) == 255
    share = mask.mean()
    # A sprite is a subject on a field: if the flood took nearly nothing or
    # nearly everything, it found something other than the background.
    return mask if 0.05 < share < 0.95 else None


def key_out(raw, fam):
    """Background -> transparency, despill, crop, resize. Returns PNG bytes."""
    import numpy as np
    from PIL import Image, ImageDraw, ImageFilter
    im = Image.open(io.BytesIO(raw)).convert("RGB")
    a = np.asarray(im).astype(np.int32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    dist = np.sqrt((r - 255) ** 2 + g ** 2 + (b - 255) ** 2)
    alpha = np.clip((dist - 70) / 90.0, 0, 1)

    flood = _bg_mask(a, np, Image, ImageDraw)
    if flood is not None:
        # Hard mask from the flood, then one soft pixel of feather so the edge
        # does not look cut out with scissors against the painted land.
        edge = np.asarray(
            Image.fromarray(np.where(flood, 0, 255).astype(np.uint8), "L")
                 .filter(ImageFilter.GaussianBlur(0.8))
        ) / 255.0
        alpha = np.minimum(alpha if alpha.max() > 0 else 1.0, 1.0)
        alpha = edge
    # despill: magenta-tinted fringe pixels pull toward their green channel
    fringe = (alpha > 0) & (alpha < 1) | ((r > g + 60) & (b > g + 60) & (alpha < 0.98))
    m = np.minimum(r, b)
    r2 = np.where(fringe, np.minimum(r, (g + m) // 2 + 40), r)
    b2 = np.where(fringe, np.minimum(b, (g + m) // 2 + 40), b)
    out = np.dstack([np.clip(r2, 0, 255), np.clip(g, 0, 255), np.clip(b2, 0, 255),
                     (alpha * 255)]).astype(np.uint8)
    img = Image.fromarray(out, "RGBA")
    bbox = Image.fromarray((alpha * 255).astype(np.uint8), "L").getbbox()
    if bbox:
        pad = 12
        img = img.crop((max(0, bbox[0] - pad), max(0, bbox[1] - pad),
                        min(img.width, bbox[2] + pad), min(img.height, bbox[3] + pad)))
    h = 176
    img = img.resize((max(1, int(img.width * h / img.height)), h), Image.LANCZOS)
    buf = io.BytesIO(); img.save(buf, "PNG", optimize=True)
    return buf.getvalue()

if __name__ == "__main__":
    force = "--force" in sys.argv
    fams = [f for f in sys.argv[1:] if not f.startswith("--")] or list(FAMILIES)
    for f in fams:
        assert f in FAMILIES, f"unknown family {f}"
        path = os.path.join(OUT, f + ".png")
        if os.path.exists(path) and not force:
            print(f, "exists — skip"); continue
        print("generating", f, "…")
        raw = gen(f, FAMILIES[f])
        if not raw:
            print(f, "FAILED"); continue
        png = key_out(raw, f)
        open(path, "wb").write(png)
        print(" ", f, len(png) // 1024, "KB")
        time.sleep(1.0)
