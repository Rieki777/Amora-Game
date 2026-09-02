import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { MODULES } from "@shared/modules";

/**
 * Every module in the registry has an image, and every image has a module.
 *
 * Five were missing on production: crowdpool, governance, hypha, introductions
 * and resources. Each rendered as a broken image, because the village serves
 * its SPA shell for any missing asset, so the browser received HTML where a
 * picture should be.
 *
 * That last detail is why this test reads the FILESYSTEM rather than fetching
 * the URL. A fetch would have returned HTTP 200 for all of them: the first
 * attempt to measure this scored 19 of 19 present, and only a control (asking
 * for a module id that does not exist, and also getting 200) showed the method
 * could not tell a hit from a miss.
 *
 * Both directions are checked. An orphan image is a smaller problem than a
 * missing one, but it is the tell that a module was renamed or removed and its
 * asset was left behind.
 */

const ROOT = path.resolve(__dirname, "..", "..", "..");
const IMAGE_DIR = path.join(ROOT, "client", "public", "images", "modules");

describe("module images", () => {
  const files = fs.existsSync(IMAGE_DIR) ? fs.readdirSync(IMAGE_DIR) : [];
  const images = new Set(files.filter((f) => f.endsWith(".webp")).map((f) => f.slice(0, -5)));
  const ids = MODULES.map((m) => m.id);

  it("reads a real registry and a real image directory", () => {
    // Control. Two empty sets agree with each other perfectly, and that
    // agreement would be reported as success.
    expect(ids.length).toBeGreaterThan(10);
    expect(images.size).toBeGreaterThan(10);
  });

  it("gives every module an image", () => {
    const missing = ids.filter((id) => !images.has(id));
    expect(missing, `modules with no image: ${missing.join(", ")}`).toEqual([]);
  });

  it("leaves no image without a module", () => {
    const orphans = [...images].filter((f) => !ids.includes(f)).sort();
    expect(orphans, `images with no module: ${orphans.join(", ")}`).toEqual([]);
  });

  it("keeps every image to the house size and shape", () => {
    // 640x400 and roughly 25 KB is the convention every existing image follows.
    // The first pass of the five new ones came out at 58 to 73 KB, which is
    // 2.5 times the weight of everything around them on the same grid.
    const heavy = [...images]
      .map((id) => ({ id, kb: Math.round(fs.statSync(path.join(IMAGE_DIR, `${id}.webp`)).size / 1024) }))
      .filter((x) => x.kb > 45);
    expect(heavy, `oversized: ${heavy.map((h) => `${h.id} ${h.kb}KB`).join(", ")}`).toEqual([]);
  });
});
