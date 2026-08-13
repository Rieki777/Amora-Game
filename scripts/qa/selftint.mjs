// The "Guest" bug, generalised into a detector.
//
// GameDashboard set `bg-teal-deep/10` ON an element and wrote `text-teal-deep` on the SAME
// element. The element stood on its own tint, so the token measured 4.21 instead of 4.81 and
// missed AA. Every ANCESTOR was white and the token was real, which is why no review and no
// gate caught it, and why it took a rendered page to find. But the shape is grep-able: the
// same colour token appearing as a TINTED background and as the foreground in one className.
//
// This finds every instance in the client without rendering anything.
import fs from "node:fs";
import path from "node:path";

// Only tokens whose hex this file can resolve. An unknown token is SKIPPED AND COUNTED,
// never silently passed, because that is the rule the whole evening was about.
const TOKENS = {
  "teal-deep": [21, 127, 125],
  "teal": [20, 128, 128],
  "teal-light": [94, 177, 175],
  "sage": [61, 110, 74],
  "gold": [160, 107, 28],
  "coral": [155, 64, 48],
  "amber": [236, 177, 99],
  "primary": [21, 127, 125],
};

const lum = (c) => {
  const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const L1 = lum(a), L2 = lum(b); return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05); };
const over = (top, alpha, bottom) => [0, 1, 2].map((k) => Math.round(top[k] * alpha + bottom[k] * (1 - alpha)));

const SIZE_WORDS = /^(xs|sm|base|lg|xl|[2-9]xl|center|left|right|justify|balance|pretty|wrap|nowrap|ellipsis|clip|start|end)$/;

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".tsx")) out.push(p);
  }
  return out;
};

const hits = [];
const skipped = [];
for (const file of walk("client/src")) {
  const rel = file.split(path.sep).join("/");
  fs.readFileSync(file, "utf8").split("\n").forEach((line, i) => {
    const bgs = [...line.matchAll(/\bbg-([a-z0-9-]+)\/(\d{1,3})\b/g)];
    if (bgs.length === 0) return;
    const fgs = [...new Set([...line.matchAll(/\btext-([a-z0-9-]+)\b/g)].map((m) => m[1]))]
      .filter((t) => t !== "white" && !SIZE_WORDS.test(t));
    if (fgs.length === 0) return;
    for (const b of bgs) {
      for (const f of fgs) {
        const bgTok = TOKENS[b[1]], fgTok = TOKENS[f];
        if (!bgTok || !fgTok) { skipped.push(`${rel}:${i + 1}  bg-${b[1]}/${b[2]} + text-${f}`); continue; }
        const alpha = Number(b[2]) / 100;
        // The tint sits on a white card, which is the common case and the optimistic one.
        const backdrop = over(bgTok, alpha, [255, 255, 255]);
        const cr = ratio(fgTok, backdrop);
        hits.push({ rel, line: i + 1, bg: `bg-${b[1]}/${b[2]}`, fg: `text-${f}`, ratio: +cr.toFixed(2), pass: cr >= 4.5 });
      }
    }
  });
}

hits.sort((a, b) => a.ratio - b.ratio);
const fails = hits.filter((h) => !h.pass);
console.log(`  ${hits.length} measurable self-tint pairing(s), ${fails.length} below AA`);
for (const h of hits) {
  console.log(`    ${String(h.ratio).padStart(5)}:1 ${h.pass ? "ok  " : "FAIL"}  ${h.bg} + ${h.fg}   ${h.rel}:${h.line}`);
}
console.log(`  ${skipped.length} pairing(s) NOT MEASURABLE (token hex unknown to this script):`);
for (const s of [...new Set(skipped)].slice(0, 12)) console.log(`    ${s}`);
