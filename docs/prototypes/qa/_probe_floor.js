/* What floor is ACHIEVABLE by ring rotation alone?
   The 22 px floor was derived when a seal was 22 px wide (catchment 11 = the
   ink radius). Seals are 28 px now, so the self-consistent floor is 28
   (catchment 14). This re-runs the same greedy solver in-page against several
   floors and reports the minimum cross-building distance each one reaches, so
   the constant is measured rather than assumed.
   Usage: source qa/env.sh && node qa/_probe_floor.js */
const { chromium } = require('playwright');

(async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_EXE });
  const p = await (await b.newContext({ viewport: { width: 1480, height: 1180 } })).newPage();
  await p.goto(process.env.GROUNDS_FILE); await p.waitForTimeout(1200);
  try { await p.click('#enterBtn'); } catch (_) {}
  await p.waitForTimeout(2600);
  console.log(JSON.stringify(await p.evaluate(() => {
    cam.z = 1.7; cam.x = 1240; cam.y = 700; clampCam(); syncBanners(); refreshBadges(); syncBanners();
    // Rebuild the same group set layoutBadges works from.
    const groups = [];
    for (const s of SCENE.structures) {
      const bg = bgEls[s.key]; if (!bg || !bg._on || !bg.classList.contains('on')) continue;
      const kinds = (bg.dataset.kinds || '').split(',').filter(Boolean);
      const off = bg._off || 30, need = badgeRing(kinds, BADGE_GAP);
      const cluster = need > Math.max(off * 1.8, 30);
      if (cluster || bg.classList.contains('far')) continue;
      groups.push({ key: s.key, kinds, R: Math.max(off, need, 20), cx: bg._cx, cy: bg._cy });
    }
    const pts = (g, rot) => {
      const out = [];
      for (const kd of g.kinds) {
        if (kd === 'home') continue;
        const a = ((BADGE_SLOT[kd] !== undefined ? BADGE_SLOT[kd] : 215) + rot) * Math.PI / 180;
        out.push({ x: g.cx + Math.cos(a) * g.R, y: g.cy - Math.sin(a) * g.R });
      }
      const ha = (BADGE_SLOT.home + rot) * Math.PI / 180;
      out.push({ x: g.cx + Math.cos(ha) * g.R, y: g.cy - Math.sin(ha) * g.R });
      return out;
    };
    const solve = (floor, steps) => {
      const live = groups.map(g => ({ ...g, rot: 0, _pts: null }));
      for (let i = 0; i < live.length; i++) {
        const g = live[i];
        const near = q => { let w = Infinity;
          for (let j = 0; j < i; j++) for (const a of live[j]._pts) for (const c of q) {
            const d = Math.hypot(a.x - c.x, a.y - c.y); if (d < w) w = d; }
          return w; };
        let best = 0, bp = pts(g, 0), bm = near(bp);
        if (bm < floor) for (let r = 1; r < steps.length; r++) {
          const q = pts(g, steps[r]), m = near(q);
          if (m > bm) { bm = m; best = steps[r]; bp = q; }
          if (m >= floor) break;
        }
        g.rot = best; g._pts = bp;
      }
      let min = Infinity;
      for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++)
        for (const a of live[i]._pts) for (const c of live[j]._pts) {
          const d = Math.hypot(a.x - c.x, a.y - c.y); if (d < min) min = d; }
      return { floor, achievedMin: +min.toFixed(1), turned: live.filter(g => g.rot).length };
    };
    const NARROW = [0, 9, -9, 18, -18, 27, -27];
    const WIDE = [0, 6, -6, 12, -12, 18, -18, 24, -24, 30, -30, 36, -36, 42, -42];
    return {
      rings: groups.length,
      narrow: [22, 26, 28, 32].map(f => solve(f, NARROW)),
      wide: [28, 32, 36].map(f => solve(f, WIDE)),
    };
  }), null, 1));
  await b.close();
})();
