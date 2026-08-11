/* The floor across the WHOLE live badge range, not one camera.
   The map lane's catch: tuning at z 1.7 tunes the easy end. `off` comes from
   `_crownOff`, which shrinks with the LOD scale `k`, so as the camera pulls
   back the rings tighten AND the buildings converge on screen at once.

   One refinement to their sweep: the TARGET is zoom-dependent too. `.bmid` is
   toggled at `cam.z < 1.45` and takes a seal from 28 px to 22, so the floor
   that makes a catchment cover the ink is 22 below that and 28 above it. The
   floor is read from the rendered seal, never assumed.

   Searches (budget, step) rotation tables for the SMALLEST budget that clears
   the floor at every zoom, which is the map lane's suggestion: if 24 degrees
   is enough once the steps are finer, learnability costs nothing.
   Usage: source qa/env.sh && node qa/_probe_zoomsweep.js */
const { chromium } = require('playwright');

const ZOOMS = [1.0, 1.1, 1.2, 1.35, 1.45, 1.6, 1.7, 2.0, 2.4, 3.0];
const TABLES = [];
for (const budget of [18, 24, 30, 36, 42]) {
  for (const stepDeg of [3, 6, 9]) {
    const t = [0];
    for (let d = stepDeg; d <= budget; d += stepDeg) { t.push(d, -d); }
    TABLES.push({ label: `b${budget}/s${stepDeg}`, budget, stepDeg, table: t });
  }
}

(async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_EXE });
  const p = await (await b.newContext({ viewport: { width: 1480, height: 1180 } })).newPage();
  await p.goto(process.env.GROUNDS_FILE); await p.waitForTimeout(1200);
  try { await p.click('#enterBtn'); } catch (_) {}
  await p.waitForTimeout(2600);

  const out = await p.evaluate(({ ZOOMS, TABLES }) => {
    const groupsAt = () => {
      const gs = [];
      for (const s of SCENE.structures) {
        const bg = bgEls[s.key];
        if (!bg || !bg._on || !bg.classList.contains('on')) continue;
        const kinds = (bg.dataset.kinds || '').split(',').filter(Boolean);
        const off = bg._off || 30, need = badgeRing(kinds, BADGE_GAP);
        if (need > Math.max(off * 1.8, 30)) continue;           // intrinsic cluster
        if (bg.classList.contains('far')) continue;
        gs.push({ kinds, R: Math.max(off, need, 20), cx: bg._cx, cy: bg._cy });
      }
      return gs;
    };
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
    const solve = (gs, floor, steps) => {
      const live = gs.map(g => ({ ...g, rot: 0, _pts: null }));
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
      return { min, maxRot: Math.max(...live.map(g => Math.abs(g.rot))) };
    };

    const snap = [];
    for (const z of ZOOMS) {
      cam.z = z; cam.x = 1240; cam.y = 700; clampCam();
      refreshBadges(); syncBanners(); syncBanners();
      const seal = document.querySelector('.bseal');
      const ink = seal ? parseFloat(getComputedStyle(seal).width) : 28;
      snap.push({ z, ink, groups: groupsAt() });
    }

    const results = TABLES.map(T => {
      const rows = snap.map(s => {
        const r = solve(s.groups, s.ink, T.table);
        return { z: s.z, ink: s.ink, min: +r.min.toFixed(1), ok: r.min >= s.ink, maxRot: r.maxRot };
      });
      const worst = rows.reduce((a, r) => (r.min - r.ink < a.min - a.ink ? r : a), rows[0]);
      /* The lowest zoom from which every HIGHER zoom clears. That is the gate
         a full ring should be shown above, since no rotation makes room that
         the screen does not have. */
      let from = null;
      for (let i = 0; i < rows.length; i++) if (rows.slice(i).every(r => r.ok)) { from = rows[i].z; break; }
      return { label: T.label, budget: T.budget, step: T.stepDeg, rows,
        allClear: rows.every(r => r.ok), clearFrom: from,
        worstZ: worst.z, worstMin: worst.min, worstInk: worst.ink,
        maxRotUsed: Math.max(...rows.map(r => r.maxRot)) };
    });
    const baseline = snap.map(s => {
      const r = solve(s.groups, s.ink, [0]);
      return { z: s.z, ink: s.ink, min: +r.min.toFixed(1) };
    });
    return { baseline, results };
  }, { ZOOMS, TABLES });

  console.log('NO ROTATION AT ALL:');
  for (const r of out.baseline) console.log(`  z ${r.z.toFixed(2)}  ink ${r.ink}  min ${r.min}`);
  console.log('\nTABLES THAT CLEAR EVERY ZOOM (smallest budget first):');
  const clear = out.results.filter(r => r.allClear).sort((a, b) => a.budget - b.budget || a.step - b.step);
  for (const r of clear) console.log(`  ${r.label}  maxRotUsed ${r.maxRotUsed}  worst z ${r.worstZ} min ${r.worstMin} vs ink ${r.worstInk}`);
  if (!clear.length) console.log('  NONE');
  console.log('\nLOWEST ZOOM FROM WHICH EVERY HIGHER ZOOM CLEARS:');
  const byGate = out.results.filter(r => r.clearFrom !== null)
    .sort((a, b) => a.clearFrom - b.clearFrom || a.budget - b.budget || a.step - b.step);
  for (const r of byGate.slice(0, 8))
    console.log(`  ${r.label}  clears from z ${r.clearFrom}  maxRotUsed ${r.maxRotUsed}`);
  if (!byGate.length) console.log('  NONE');
  const pick = byGate[0];
  if (pick) {
    console.log(`\nPER-ZOOM for ${pick.label}:`);
    for (const r of pick.rows)
      console.log(`  z ${r.z.toFixed(2)}  ink ${r.ink}  min ${r.min}  ${r.ok ? 'ok' : 'SHORT'}  maxRot ${r.maxRot}`);
  }
  await b.close();
})();
