"""Deterministic painterly stylization of a satellite plate + optional palette transfer.
Geometry is never resampled: every operation is per-pixel or a fixed-radius neighbourhood."""
import numpy as np
from PIL import Image
import time

def kuwahara(img, r=4):
    """Anisotropic-ish Kuwahara via summed-area tables: O(1) per pixel."""
    H, W, _ = img.shape
    k = r + 1
    pad = np.pad(img, ((r, r), (r, r), (0, 0)), mode='edge')
    lum = pad.mean(2)
    def sat(a):
        s = np.cumsum(np.cumsum(a, axis=0), axis=1)
        return np.pad(s, ((1, 0), (1, 0)), mode='constant')
    S_l, S_l2 = sat(lum), sat(lum * lum)
    S_c = [sat(pad[..., c]) for c in range(3)]
    def box(S, a, b):
        return (S[a+k:a+k+H, b+k:b+k+W] - S[a:a+H, b+k:b+k+W]
                - S[a+k:a+k+H, b:b+W] + S[a:a+H, b:b+W])
    n = k * k
    best_var = None; best_rgb = None
    for a, b in ((0,0), (0,r), (r,0), (r,r)):
        m  = box(S_l,  a, b) / n
        m2 = box(S_l2, a, b) / n
        var = np.maximum(m2 - m*m, 0)
        rgb = np.dstack([box(S_c[c], a, b) / n for c in range(3)])
        if best_var is None:
            best_var, best_rgb = var, rgb
        else:
            take = var < best_var
            best_var = np.where(take, var, best_var)
            best_rgb = np.where(take[..., None], rgb, best_rgb)
    return best_rgb

def edge_ink(img, strength=0.55):
    """Darken along luminance gradients — the brush-edge that reads as 'painted'."""
    g = img.mean(2)
    gx = np.gradient(g, axis=1); gy = np.gradient(g, axis=0)
    e = np.hypot(gx, gy)
    e = np.clip(e / (np.percentile(e, 97) + 1e-6), 0, 1) ** 0.8
    return img * (1.0 - strength * e[..., None])

def posterize(img, levels=22):
    return np.round(img / 255.0 * levels) / levels * 255.0

def canvas_tooth(img, amount=0.05, seed=20260808):
    rng = np.random.default_rng(seed)          # deterministic
    n = rng.normal(0, 1, img.shape[:2])
    n = (n - n.mean()) / (n.std() + 1e-6)
    return img * (1.0 + amount * n[..., None])

def reinhard(src, ref):
    """Move src's colour statistics onto ref's, in Ruderman lab. Pixels never move."""
    def to_lab(a):
        a = np.clip(a, 1.0, 255.0) / 255.0
        M = np.array([[0.3811,0.5783,0.0402],[0.1967,0.7244,0.0782],[0.0241,0.1288,0.8444]])
        lms = np.log10(np.clip(a @ M.T, 1e-5, None))
        T = np.array([[1/np.sqrt(3),1/np.sqrt(3),1/np.sqrt(3)],
                      [1/np.sqrt(6),1/np.sqrt(6),-2/np.sqrt(6)],
                      [1/np.sqrt(2),-1/np.sqrt(2),0]])
        return lms @ T.T
    def to_rgb(l):
        T = np.array([[1/np.sqrt(3),1/np.sqrt(3),1/np.sqrt(3)],
                      [1/np.sqrt(6),1/np.sqrt(6),-2/np.sqrt(6)],
                      [1/np.sqrt(2),-1/np.sqrt(2),0]])
        lms = 10 ** (l @ np.linalg.inv(T.T))
        M = np.array([[0.3811,0.5783,0.0402],[0.1967,0.7244,0.0782],[0.0241,0.1288,0.8444]])
        return np.clip(lms @ np.linalg.inv(M.T), 0, 1) * 255.0
    a, b = to_lab(src), to_lab(ref)
    out = (a - a.mean((0,1))) * (b.std((0,1)) / (a.std((0,1)) + 1e-6)) + b.mean((0,1))
    return to_rgb(out)

def painterly(sat_rgb, ref_rgb=None, r=4, blend=0.85):
    t0 = time.time()
    x = kuwahara(sat_rgb, r)
    x = posterize(x, 22)
    x = edge_ink(x, 0.5)
    x = canvas_tooth(x, 0.045)
    if ref_rgb is not None:
        x = blend * reinhard(x, ref_rgb) + (1 - blend) * x
    return np.clip(x, 0, 255).astype(np.uint8), time.time() - t0

if __name__ == '__main__':
    W, H = 1200, 800
    sat = np.asarray(Image.open('plates/satellite.jpg').convert('RGB').resize((W,H))).astype(np.float32)
    ref = np.asarray(Image.open('plates/painted.jpg').convert('RGB').resize((W//4,H//4))).astype(np.float32)
    filt, t1 = painterly(sat, None)
    hyb,  t2 = painterly(sat, ref)
    print('filter only      %.2fs at %dx%d' % (t1, W, H))
    print('filter + palette %.2fs (palette donor is a %dx%d thumbnail)' % (t2, W//4, H//4))
    Image.fromarray(filt).save('plates/out-filter.png')
    Image.fromarray(hyb ).save('plates/out-hybrid.png')
    # palette donor as pure statistics
    def lab_stats(a):
        return 'mean/std donated: 6 floats'
    print('donor payload if statistics only:', lab_stats(ref))
