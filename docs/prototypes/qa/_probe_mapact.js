/* Recon: what is actually interactive inside a building's panel, and how big is it.
   Throwaway. The gate that ships is verify_mapact.js. */
const { chromium } = require('playwright');
const FILE = process.env.GROUNDS_FILE;
const EXE = process.env.PW_EXE;

(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const p = await (await b.newContext({ viewport: { width: 1480, height: 1180 } })).newPage();
  p.on('pageerror', e => console.log('PAGEERROR ' + e.message));
  await p.goto(FILE); await p.waitForTimeout(1200);
  await p.click('#enterBtn'); await p.waitForTimeout(2800);

  // which structures carry which affordances
  const census = await p.evaluate(() => {
    return SCENE.structures.map(s => ({
      key: s.key, name: s.name,
      ev: (typeof eventsAt === 'function' ? eventsAt(s.key).length : 0),
      th: (typeof threadsAt === 'function' ? threadsAt(s.key).length : 0),
      q: (typeof questsAt === 'function' ? questsAt(s.key).length : 0),
      seats: (typeof seatsAt === 'function' ? seatsAt(s.key).length : 0),
      doors: Object.keys(s.doors || {}).length,
      mods: (s.modules || []).length,
    }));
  });
  const rich = census.filter(c => c.ev && c.th && c.q && c.seats).sort((a, b2) => (b2.ev + b2.th + b2.q + b2.seats + b2.doors + b2.mods) - (a.ev + a.th + a.q + a.seats + a.doors + a.mods));
  console.log('structures with event+thread+quest+seat: ' + rich.length);
  console.log(JSON.stringify(rich.slice(0, 6), null, 1));
  console.log('with doors: ' + JSON.stringify(census.filter(c => c.doors).map(c => c.key + ':' + c.doors)));
  console.log('with events: ' + JSON.stringify(census.filter(c => c.ev).map(c => c.key)));

  const KEY = process.env.PKEY || (rich[0] && rich[0].key) || census[0].key;
  console.log('\n--- panel at ' + KEY + ' ---');

  const SEL = '#panel button, #panel [onclick], #panel a[href], #panel input, #panel select, #panel textarea, #panel [tabindex]';
  for (const tab of [0, 1, 2, 3]) {
    await p.evaluate(([k, t]) => { openPanel(k, t); }, [KEY, tab]);
    await p.waitForTimeout(500);
    const rows = await p.evaluate((sel) => {
      const seen = new Set();
      return [...document.querySelectorAll(sel)].filter(e => { if (seen.has(e)) return false; seen.add(e); return true; }).map(e => {
        const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
        return {
          tag: e.tagName.toLowerCase(),
          cls: (typeof e.className === 'string' ? e.className : '') || '',
          id: e.id || '',
          txt: (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 42),
          w: Math.round(r.width), h: Math.round(r.height),
          fs: cs.fontSize, pad: cs.padding,
          bg: cs.backgroundImage !== 'none' ? 'grad' : cs.backgroundColor,
          bord: cs.borderTopWidth + ' ' + cs.borderTopStyle,
          onclick: !!e.getAttribute('onclick'),
        };
      });
    }, SEL);
    console.log('\ntab ' + tab + ' — ' + rows.length + ' interactive');
    rows.forEach(r => console.log('  ' + JSON.stringify(r)));
  }
  await b.close();
})();
