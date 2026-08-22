/* How long does the resident line take to reach speak(), across reps?
 * F7 budgets 2500ms with a bare setTimeout. Everything else in that suite
 * waits for a state. This measures whether 2500ms is a real budget. */
const { chromium } = require('playwright');
const FILE = process.env.GROUNDS_FILE, EXE = process.env.PW_EXE;
const REPS = Number(process.env.REPS || 6);

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const out = [];
  for (let i = 0; i < REPS; i++) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const page = await ctx.newPage();
    await page.goto(FILE);
    await page.waitForFunction(() => typeof playJourney === 'function', null, { timeout: 15000 });
    await page.click('#enterBtn').catch(() => {});
    await page.waitForTimeout(1400);
    await page.evaluate(() => {
      window.__spoke = [];
      if (!('speechSynthesis' in window)) window.speechSynthesis = { cancel(){}, getVoices(){return[]}, speak(){} };
      const real = window.speechSynthesis.speak.bind(window.speechSynthesis);
      window.speechSynthesis.speak = (u) => {
        window.__spoke.push({ ms: Math.round(performance.now() - (window.__t0 || performance.now())), text: String(u.text || '') });
        try { real(u); } catch (_) {}
      };
      mvMode('hear');
    });
    await page.waitForTimeout(900);
    await page.evaluate(() => {
      window.__spoke = []; window.__raf = 0;
      const b = () => { window.__raf++; requestAnimationFrame(b); }; requestAnimationFrame(b);
      document.getElementById('maiaLog').innerHTML = '';
      window.__t0 = performance.now();
      playJourney('j1');
    });
    /* Wait well past any plausible budget, then read WHEN it landed. */
    await page.waitForTimeout(6000);
    const r = await page.evaluate(() => {
      const hit = (window.__spoke || []).find(x => /I am Maia/.test(x.text));
      return { at: hit ? hit.ms : null, fps: Math.round(window.__raf / 6), n: window.__spoke.length };
    });
    out.push(r);
    console.log(`rep ${i + 1}: resident line spoken at ${r.at === null ? 'NEVER' : r.at + 'ms'}  (~${r.fps}fps, ${r.n} utterances)  -> F7@2500ms would ${r.at !== null && r.at <= 2500 ? 'PASS' : 'FAIL'}`);
    await ctx.close();
  }
  const times = out.map(o => o.at).filter(v => v !== null);
  console.log(`\nmin=${Math.min(...times)}ms  max=${Math.max(...times)}ms  over/2500ms: ${out.filter(o => o.at === null || o.at > 2500).length}/${out.length}`);
  await browser.close();
})();
