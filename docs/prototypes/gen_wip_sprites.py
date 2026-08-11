#!/usr/bin/env python3
"""The unfinished twin of every building, drawn FROM the finished one.

Rye: "I want the under construction to not just be some scaffolding on the
current sprites but to generate a whole new set of them where their finished
buildings are the context for recreating them to be under construction."

Today phase 2 draws an SVG scaffold OVER the finished sprite. Same building,
a lattice on top. This makes a second sprite per family instead, and the
finished sprite is the reference image, so the unfinished one is recognisably
THAT building half-built rather than a generic construction site.

WHY IMAGE-TO-IMAGE AND NOT A SECOND PROMPT. `gen_sprites.py` is text only, and
a text description of "the great hall" produces a DIFFERENT great hall every
time: different roofline, different mass, different palette. The whole value
here is that the two sprites are the same building at two moments, so the
finished PNG goes in the request as the reference and the prompt asks for a
stage of it.

MAGENTA GOES IN AS WELL AS OUT. The finished sprites are transparent PNGs and
the model has no reliable notion of alpha, so each one is composited onto the
same flat #FF00FF the generator already keys against before it is sent. The
model sees a subject on a field, returns a subject on a field, and `key_out`
from gen_sprites.py handles the rest. One keying implementation, not two.

NOT EVERYTHING IS A BUILDING. A spring under construction is not scaffolding,
it is an excavated basin. Families whose subject is water or planting get their
own phrasing, because asking for timber frames around a pond produces a hut
beside a pond, which is the exact failure `gen_sprites.py` documents for the
water families.

Usage: GEMINI_API_KEY=... python3 gen_wip_sprites.py [family ...]
       (no args = every family with a finished sprite; skips existing unless --force)
"""
import base64, io, json, os, sys, time, urllib.request

from gen_sprites import key_out  # one keying implementation, shared deliberately

KEY = os.environ.get("GEMINI_API_KEY"); assert KEY, "GEMINI_API_KEY required"
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "sprites")
OUT = os.path.join(HERE, "sprites_wip")
os.makedirs(OUT, exist_ok=True)
MODELS = ["gemini-3-pro-image", "gemini-3-pro-image-preview", "gemini-2.5-flash-image"]

# What "half-built" means, held constant across the set so the sprites read as
# one construction language rather than thirty separate ideas.
BUILD = (
 "Show this SAME structure PART-BUILT, partway through construction. Keep the identical "
 "building: same silhouette, same footprint, same roofline shape, same materials and palette, "
 "same three-quarter isometric view from the south-east, same camera angle and height, same "
 "bright cheerful daylight from the same direction. Only its STAGE OF COMPLETION changes. "
 "The lower walls are finished and the upper structure is still open: exposed curved timber "
 "ribs and glulam frames where the roof will be, roof only partly clad so the frame shows "
 "through, some window openings still empty, a few glass panels already fitted. Slender bamboo "
 "scaffolding lashed with rope up one side, a light work platform, a ladder. Neat stacks of "
 "timber and bamboo and a few crates on the ground at its foot. The living roof garden is not "
 "planted yet, so the roof is bare structure and fresh boards where greenery will go. "
 "Hopeful and well-tended, an active building site rather than a ruin: nothing broken, "
 "nothing burnt, no rubble, no decay, no cranes, no modern machinery, no people."
)
STYLE_TAIL = (
 " Painterly concept-art rendering with crisp game-sprite readability, vivid saturated colors, "
 "high-key lighting, no dark moody shading, no vignette. The structure centered with generous "
 "margin, at the SAME scale and proportion as the reference so the two sprites can be swapped "
 "in place. Absolutely flat, solid, pure magenta background (#FF00FF) filling every pixel "
 "around the subject: no ground plane, no cast shadow, no other background elements, no text, "
 "no watermark, no border."
)

# Families the building language does not fit. Same construction idea, right noun.
SPECIAL = {
 "spring": "Show this SAME spring BEING MADE: the basin freshly excavated and not yet filled, "
   "damp bare earth and cut stone edging stacked ready to be set, a few stones already placed in "
   "the ring, one slender carved marker post standing. No building, no scaffolding, no water yet.",
 "pool": "Show this SAME swimming pool BEING MADE: the basin dug out and empty of water, river "
   "boulders stacked at the rim waiting to be set, the pebble beach half laid, bare damp earth "
   "where the ferns will go. No building, no scaffolding.",
 "waterfall": "Show this SAME waterfall BEING MADE READY: the plunge pool below dug out and "
   "empty, cut stones stacked beside it, a simple bamboo ladder and a rope line up the mossy rock "
   "shelf, the fall itself reduced to a thin trickle. No building.",
 "orchard": "Show this SAME grove NEWLY PLANTED: young bare saplings staked and tied instead of "
   "grown fruit trees, fresh mulch rings around each one, the path only half laid, a watering can "
   "and a stack of stakes on the ground. No fruit yet.",
 "field": "Show this SAME field BEING PREPARED: the rows freshly tilled and mostly bare with only "
   "the first seedlings showing, the irrigation arc half assembled, stacked seed trays and a hoe "
   "at the edge. The scarecrow frame is up but not yet dressed.",
 "hive": "Show this SAME apiary BEING SET UP: the low stand built and the hive boxes stacked "
   "unassembled beside it, one hive part built, fresh timber and a smoker on the ground, the "
   "wildflowers not yet grown.",
 "cycle": "Show this SAME compost garden BEING BUILT: one timber bay finished, the second a bare "
   "frame of posts, the third only marked out, loose boards and a wheelbarrow beside them.",
 "sacred": "Show this SAME ancient tree with its shrine BEING BUILT: the tree unchanged and fully "
   "grown, but the small shrine at its roots only part built, cut stone and timber stacked ready, "
   "the lanterns not yet hung. Keep the tree exactly as it is.",
 "solar": "Show this SAME solar array BEING INSTALLED: the brass frame erected and only some of "
   "the petal-shaped panels fitted, the remaining panels stacked on the ground in their crates, "
   "cabling coiled, the wildflowers not yet grown.",
 "fire": "Show this SAME council fire circle BEING BUILT: the ring marked out and only some of the "
   "carved stone seats set in place, the others rough-cut and waiting beside them, the fire pit dug "
   "but unlit, the planters empty. No flame.",
 "bridge": "Show this SAME footbridge PART-BUILT: the bent living-wood arch spanning across but "
   "the decking only partly laid so the frame shows through, the woven rope rails strung on one "
   "side only, coiled rope and boards stacked at the near bank.",
 "stage": "Show this SAME amphitheater PART-BUILT: the lower stone terraces finished and the upper "
   "ones only rough-cut blocks set out in their curve, the timber stage a bare frame without its "
   "deck, cut stone and boards stacked to one side.",
}


def gen(fam, path):
    """One request, finished sprite in, part-built sprite out."""
    from PIL import Image
    im = Image.open(path).convert("RGBA")
    # The model has no reliable notion of alpha, so the transparency becomes the
    # same key colour the output is expected to come back on.
    flat = Image.new("RGB", im.size, (255, 0, 255))
    flat.paste(im, (0, 0), im)
    buf = io.BytesIO(); flat.save(buf, "PNG")
    ref = base64.b64encode(buf.getvalue()).decode()

    prompt = (SPECIAL.get(fam) or BUILD) + STYLE_TAIL
    body = {"contents": [{"parts": [
                {"inline_data": {"mime_type": "image/png", "data": ref}},
                {"text": prompt}]}],
            "generationConfig": {"responseModalities": ["IMAGE", "TEXT"],
                                 "imageConfig": {"aspectRatio": "1:1", "imageSize": "1K"}}}
    for model in MODELS:
        req = urllib.request.Request(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
            data=json.dumps(body).encode(), method="POST",
            headers={"Content-Type": "application/json", "x-goog-api-key": KEY})
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                resp = json.load(r)
            for part in resp["candidates"][0]["content"]["parts"]:
                if "inlineData" in part:
                    return base64.b64decode(part["inlineData"]["data"])
            print("  no image part from", model)
        except Exception as e:
            msg = e.read().decode()[:220] if hasattr(e, "read") else str(e)
            print("  FAIL", model, ":", msg)
    return None


if __name__ == "__main__":
    force = "--force" in sys.argv
    have = sorted(f[:-4] for f in os.listdir(SRC) if f.endswith(".png"))
    fams = [a for a in sys.argv[1:] if not a.startswith("--")] or have
    for f in fams:
        src = os.path.join(SRC, f + ".png")
        if not os.path.exists(src):
            print(f, "has no finished sprite, skip"); continue
        dst = os.path.join(OUT, f + ".png")
        if os.path.exists(dst) and not force:
            print(f, "exists, skip"); continue
        print("generating", f, "...")
        raw = gen(f, src)
        if not raw:
            print(" ", f, "FAILED"); continue
        png = key_out(raw, f)
        open(dst, "wb").write(png)
        print(" ", f, len(png) // 1024, "KB")
        time.sleep(1.0)
