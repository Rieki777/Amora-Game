/* Throwaway instrument for patch_e2_ring: what still clusters, and why.
   Kept because it documents how the fan test's new premise was proven.
   Usage: source qa/env.sh && node qa/_probe_e2_cluster.js */
const { chromium } = require('playwright');
const FILE = process.env.GROUNDS_FILE;
const EXE = process.env.PW_EXE;

(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const page = await b.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(FILE);
  await page.waitForTimeout(2500);

  const out = await page.evaluate(async () => {
    // the same camera the badge suite uses
    cam.z = 1.7; cam.x = 1240; cam.y = 700;
    clampCam(); refreshBadges(); syncBanners(); syncBanners();
    await new Promise(r => setTimeout(r, 200));

    const groups = [...document.querySelectorAll('#badges .bgroup')];
    const vis = groups.filter(g => g._on && g.classList.contains('on'));
    const clustered = vis.filter(g => g.classList.contains('clustered'));
    const withMore = [...document.querySelectorAll('.b-more')]
      .filter(s => getComputedStyle(s).display !== 'none');
    const richMore = withMore.filter(s =>
      s.closest('.bgroup').querySelectorAll('.bseal:not(.b-more)').length >= 2);

    // Can a cluster be FORCED on a building's own geometry? Shrink it and its
    // own ring stops fitting: that is the intrinsic rule, nothing to do with
    // neighbours, and it is what the fan test should stand on now.
    const cand = SCENE.structures.find(s => {
      const g = bgEls[s.key];
      return g && g._on && (g.dataset.kinds || '').split(',').filter(Boolean).length >= 2;
    });
    let forced = null;
    if (cand) {
      const was = cand.scale || 1;
      cand.scale = 0.3;
      refreshBadges(); syncBanners(); syncBanners();
      const g = bgEls[cand.key];
      forced = {
        key: cand.key,
        kinds: g.dataset.kinds || '',
        clustered: g.classList.contains('clustered'),
        moreVisible: getComputedStyle(g.querySelector('.b-more')).display !== 'none',
        sealsVisible: [...g.querySelectorAll('.bseal:not(.b-more)')]
          .filter(s => getComputedStyle(s).display !== 'none').length,
      };
      cand.scale = was; refreshBadges(); syncBanners();
    }
    return {
      visibleGroups: vis.length, clustered: clustered.length,
      moreVisible: withMore.length, richMore: richMore.length, forced,
    };
  });

  console.log(JSON.stringify(out, null, 2));
  await b.close();
})();
