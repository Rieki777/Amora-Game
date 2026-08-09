#!/usr/bin/env python3
"""Amora masterplan -> painted terrain plate via Gemini image API.
Usage: GEMINI_API_KEY=... python3 gen_plate.py [input.png] [out.png]"""
import base64, json, os, sys, urllib.request

KEY = os.environ.get("GEMINI_API_KEY") or (sys.argv[3] if len(sys.argv) > 3 else None)
assert KEY, "GEMINI_API_KEY required"
SRC = sys.argv[1] if len(sys.argv) > 1 else "/home/claude/livingmap/masterplan-1.png"
OUT = sys.argv[2] if len(sys.argv) > 2 else "/home/claude/livingmap/amora-plate.png"

PROMPT = (
 "Translate this real topographic ecovillage masterplan into a painterly video-game world map "
 "in the style of Age of Empires II and Anno campaign maps. Keep the ACTUAL geography faithful: "
 "the winding creeks and springs, the dense rainforest-covered ridges, the open clearings, the "
 "curving access roads, and building clusters exactly where the footprints sit - rendered as "
 "tropical timber-and-thatch structures, tiny homes, community center, greenhouses, gardens, ponds. "
 "Costa Rican Pacific coast rainforest hills, warm painterly light, soft high-angle bird's-eye view. "
 "Full-bleed terrain only: no text, no labels, no legend, no borders, no UI."
)

img = base64.b64encode(open(SRC, "rb").read()).decode()
MODELS = ["gemini-3-pro-image-preview", "gemini-2.5-flash-image", "gemini-2.0-flash-preview-image-generation"]
for model in MODELS:
    body = {
        "contents": [{"parts": [
            {"inline_data": {"mime_type": "image/png", "data": img}},
            {"text": PROMPT}]}],
        "generationConfig": {"responseModalities": ["IMAGE", "TEXT"],
                              "imageConfig": {"aspectRatio": "3:2", "imageSize": "2K"}},
    }
    req = urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        data=json.dumps(body).encode(), method="POST",
        headers={"Content-Type": "application/json", "x-goog-api-key": KEY})
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            resp = json.load(r)
        for part in resp["candidates"][0]["content"]["parts"]:
            if "inlineData" in part:
                open(OUT, "wb").write(base64.b64decode(part["inlineData"]["data"]))
                print("OK", model, "->", OUT, os.path.getsize(OUT), "bytes"); sys.exit(0)
        print("no image part from", model)
    except Exception as e:
        msg = e.read().decode()[:300] if hasattr(e, "read") else str(e)
        print("FAIL", model, ":", msg)
        if "imageConfig" in msg or "imageSize" in msg or "aspectRatio" in msg:
            body["generationConfig"] = {"responseModalities": ["IMAGE", "TEXT"]}
            req = urllib.request.Request(req.full_url, data=json.dumps(body).encode(), method="POST", headers=req.headers)
            try:
                with urllib.request.urlopen(req, timeout=300) as r:
                    resp = json.load(r)
                for part in resp["candidates"][0]["content"]["parts"]:
                    if "inlineData" in part:
                        open(OUT, "wb").write(base64.b64decode(part["inlineData"]["data"]))
                        print("OK(no-cfg)", model, "->", OUT); sys.exit(0)
            except Exception as e2:
                print("FAIL2", model, ":", str(e2)[:200])
sys.exit(1)
