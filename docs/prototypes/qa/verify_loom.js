/* Session 5 verification — the Loom lens + drag-to-rewire + sprite scale + export/restore roundtrip. */
const { chromium } = require('playwright');
const fs = require('fs');
const FILE = process.env.GROUNDS_FILE || 'file:///root/amora/work/grounds-v0.html';
const EXE = process.env.PW_EXE || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let fails = 0;
const ok = (c, n) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fails++; };

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const ctx = await browser.newContext({ viewport: { width: 1480, height: 1180 } });
  const page = await ctx.newPage();
  const perr = [], cerr = [];
  page.on('pageerror', e => perr.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') cerr.push(m.text()); });
  await page.goto(FILE);
  await page.waitForTimeout(900);
  await page.click('#enterBtn');
  await page.waitForTimeout(1200);

  /* ---------- A. first-pass wiring happened at boot ---------- */
  const wiring = await page.evaluate(() => {
    const T = loomTable();
    const n = { creator: 0, resolver: 0, pool: 0 };
    T.forEach(r => n[r.prov]++);
    return { total: T.length, ...n,
      siteQuestsAddressed: SCENE.quests.filter(q => q.src === 'site' && q.at).length,
      siteSeatsAddressed: SCENE.seats.filter(s => s.src === 'site' && s.at).length };
  });
  ok(wiring.total > 55, `loom table has ${wiring.total} rows (quests+roles+threads+journey steps)`);
  ok(wiring.siteQuestsAddressed === 6, `all 6 site quests got a suggested address (${wiring.siteQuestsAddressed})`);
  ok(wiring.siteSeatsAddressed === 8, `all 8 site roles got a suggested address (${wiring.siteSeatsAddressed})`);
  ok(wiring.resolver > 10, `${wiring.resolver} amber suggestions on the loom`);

  /* ---------- B. open the Loom ---------- */
  await page.click('#loomBtn');
  await page.waitForTimeout(600);
  const open1 = await page.evaluate(() => ({
    open: document.body.classList.contains('loom'),
    rows: document.querySelectorAll('#loomLeft .lrow').length,
    nStruct: SCENE.structures.length,
    wires: document.querySelectorAll('#loomWires .lw').length,
    stats: document.getElementById('loomStats').textContent
  }));
  ok(open1.open, 'Loom opens from the HUD button');
  ok(open1.rows === open1.nStruct + 1, `left column: ${open1.rows} rows = ${open1.nStruct} structures + the Board pool`);
  ok(open1.wires > 40, `${open1.wires} provenance-colored wires drawn`);
  ok(/creator picks/.test(open1.stats), 'stats strip renders');
  await page.screenshot({ path: '/root/amora/shots/loom_open.png' });

  /* ---------- C. filters ---------- */
  await page.click('.lfk[data-f="quest"]'); await page.waitForTimeout(350);
  const noQ = await page.evaluate(() => ({
    sec: !!document.querySelector('[data-sec="quest"]'),
    wires: document.querySelectorAll('#loomWires .lw').length
  }));
  ok(!noQ.sec && noQ.wires < open1.wires, `kind filter hides quests (wires ${open1.wires} → ${noQ.wires})`);
  await page.click('.lfk[data-f="quest"]'); await page.waitForTimeout(350);
  await page.click('.lfp[data-p="creator"]'); await page.waitForTimeout(350);
  const noC = await page.evaluate(() => document.querySelectorAll('#loomWires .lw.creator').length);
  ok(noC === 0, 'provenance filter drops creator wires');
  await page.click('.lfp[data-p="creator"]'); await page.waitForTimeout(350);

  /* ---------- D. drag-to-rewire (real mouse) ---------- */
  const pick = await page.evaluate(() => {
    const gi = SCENE.quests.findIndex(q => q.q === 'Garden Helper');
    const cur = SCENE.quests[gi].at;
    const tgt = SCENE.structures.slice(0, 4).map(s => s.key).find(k => k !== cur);
    return { gi, cur, tgt };
  });
  const grip = await page.$(`.lgrip[data-conn="quest:${pick.gi}"]`);
  await grip.scrollIntoViewIfNeeded();
  const gb = await grip.boundingBox();
  const row = await page.$(`.lrow[data-k="${pick.tgt}"]`);
  const rb = await row.boundingBox();
  await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2);
  await page.mouse.down();
  await page.mouse.move((gb.x + rb.x) / 2, (gb.y + rb.y) / 2, { steps: 8 });
  await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2, { steps: 8 });
  await page.waitForTimeout(120);
  await page.mouse.up();
  await page.waitForTimeout(400);
  const staged = await page.evaluate(t => ({
    n: LOOM_STAGED.size, bar: document.getElementById('loomSaveBar').classList.contains('show'),
    to: LOOM_STAGED.get('quest:' + t), stagedWire: document.querySelectorAll('#loomWires .lw.staged').length
  }), pick.gi);
  ok(staged.n === 1 && staged.to === pick.tgt, `drag staged Garden Helper → ${pick.tgt} (was ${pick.cur})`);
  ok(staged.bar, 'Save bar appears with staged count');
  ok(staged.stagedWire === 1, 'staged wire drawn dashed green');
  await page.screenshot({ path: '/root/amora/shots/loom_staged.png' });

  /* ---------- E. stage more kinds programmatically, then Save the batch ---------- */
  const extra = await page.evaluate(() => {
    const tb = SCENE.quests.findIndex(q => q.q === 'Trail Builder');
    stageRewire('quest:' + tb, null);                    // creator says: the Board
    const th = SCENE.threads.find(t => t.id === 't13');
    const tTgt = SCENE.structures[5].key;
    stageRewire('thread:t13:g', tTgt);                   // confirm/redirect a thread guess
    const j = SCENE.journeys.find(j => j.id === 'j2');
    const sTgt = SCENE.structures[6].key;
    stageRewire('step:j2:0', sTgt);                      // re-address a journey step
    return { tb, tTgt, sTgt, n: LOOM_STAGED.size };
  });
  ok(extra.n === 4, `4 rewires staged across kinds (${extra.n})`);
  await page.click('#loomSaveBtn');
  await page.waitForTimeout(500);
  const saved = await page.evaluate(x => {
    const gh = SCENE.quests.find(q => q.q === 'Garden Helper');
    const tb = SCENE.quests[x.tb];
    const th = SCENE.threads.find(t => t.id === 't13');
    const st = SCENE.journeys.find(j => j.id === 'j2').steps[0];
    const ovr = EDITS.filter(e => e.action === 'address-override');
    return { gh: { at: gh.at, addr: gh.addr }, tb: { at: tb.at, addr: tb.addr },
      th: { keys: th.structures, addr: th.addr }, st: { at: st.at, addr: st.addr },
      nOvr: ovr.length, bar: document.getElementById('loomSaveBar').classList.contains('show'),
      stagedLeft: LOOM_STAGED.size };
  }, extra);
  ok(saved.gh.at === pick.tgt && saved.gh.addr === 'creator', 'quest rewire saved as the creator’s word');
  ok(saved.tb.at === null && saved.tb.addr === 'creator-board', 'un-address saved — and NOT re-guessed by the resolver');
  ok(saved.th.keys.includes(extra.tTgt) && saved.th.addr === 'creator', 'thread address confirmed to creator');
  ok(saved.st.at === extra.sTgt && saved.st.addr === 'creator', 'journey step rewired to creator');
  ok(saved.nOvr === 4, `4 address-override rows in map_edits (${saved.nOvr})`);
  ok(!saved.bar && saved.stagedLeft === 0, 'save bar clears after batch save');

  /* ---------- F. export contract ---------- */
  const exp = await page.evaluate(() => JSON.stringify(buildExportJSON()));
  fs.writeFileSync('/tmp/amora-export.json', exp);
  const J = JSON.parse(exp);
  ok(Array.isArray(J.journeys) && J.journeys.length === 4, 'export carries 4 journeys');
  ok(Array.isArray(J.forum_threads) && J.forum_threads.length === 13, 'export carries 13 forum threads');
  ok(J.quests.every(q => 'address_source' in q), 'every quest exports address_source');
  ok(J.org_roles.every(r => 'address_source' in r), 'every role exports address_source');
  ok(J.map_structures.every(s => 'scale' in s), 'every structure exports scale');

  /* ---------- G. sprite scale slider ---------- */
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);   // close loom
  const k0 = await page.evaluate(() => { const k = SCENE.structures[0].key; openInspect(k); return k; });
  await page.waitForTimeout(400);
  await page.$eval('#iScale', el => { el.value = 160; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(500);
  const sc = await page.evaluate(k => ({
    scale: BY[k].scale,
    tf: (pEls[k] && pEls[k].style.transform) || '',
    logged: EDITS.some(e => e.action === 'scale'),
    exp: buildExportJSON().map_structures.find(s => s.key === k).scale
  }), k0);
  ok(sc.scale === 1.6, `inspect slider sets scale ${sc.scale}`);
  ok(/scale\(/.test(sc.tf), 'sprite transform carries the scale');
  ok(sc.logged, 'scale change is audited');
  ok(sc.exp === 1.6, 'scale exports on the structure row');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);

  /* ---------- H. autosave → reload → restore roundtrip (debounce is 2500ms) ---------- */
  await page.waitForTimeout(3300);
  await page.reload(); await page.waitForTimeout(900);
  await page.click('#enterBtn'); await page.waitForTimeout(600);
  const hasBar = await page.evaluate(() => document.getElementById('restoreBar').style.display !== 'none');
  ok(hasBar, 'autosaved profile offered on return');
  if (hasBar) { await page.click('#restoreYes'); await page.waitForTimeout(900); }
  const back = await page.evaluate(t => {
    const gh = SCENE.quests.find(q => q.q === 'Garden Helper');
    const tb = SCENE.quests.find(q => q.q === 'Trail Builder');
    const th2 = SCENE.threads.find(x => x.id === 't2');
    const st = SCENE.journeys.find(j => j.id === 'j2').steps[0];
    return { gh: { at: gh.at, addr: gh.addr }, tb: { at: tb.at, addr: tb.addr },
      th2n: th2.structures.length, st: { at: st.at, addr: st.addr },
      scale: SCENE.structures[0].scale || 1, nThreads: SCENE.threads.length };
  }, pick.tgt);
  ok(back.gh.at === pick.tgt && back.gh.addr === 'creator', 'quest rewire survives reload+restore');
  ok(back.tb.at === null && back.tb.addr === 'creator-board', 'creator’s un-address survives restore (still not re-guessed)');
  ok(back.th2n === 2 && back.nThreads === 13, 'threads restore with multi-addresses intact');
  ok(back.st.addr === 'creator', 'journey step rewire survives restore');
  ok(back.scale === 1.6, 'sprite scale survives restore');
  await page.click('#loomBtn'); await page.waitForTimeout(600);
  const reOpen = await page.evaluate(() => document.querySelectorAll('#loomWires .lw').length);
  ok(reOpen > 40, `Loom re-renders after restore (${reOpen} wires)`);

  /* ---------- I. regression sentinels ---------- */
  await page.keyboard.press('Escape'); await page.waitForTimeout(250);
  await page.click('#wallBtn'); await page.waitForTimeout(250);
  const wall = await page.evaluate(() => document.getElementById('wall').classList.contains('show'));
  ok(wall, 'the Wall still opens');
  await page.click('#wallBtn');
  await page.keyboard.press('l'); await page.waitForTimeout(400);
  const kb = await page.evaluate(() => document.body.classList.contains('loom'));
  ok(kb, 'keyboard L opens the Loom');
  await page.keyboard.press('Escape');

  ok(perr.length === 0, `zero page errors (${perr.length})${perr.length ? ' — ' + perr[0] : ''}`);
  ok(cerr.length === 0, `zero console errors (${cerr.length})${cerr.length ? ' — ' + cerr[0] : ''}`);

  /* wiring table for the report */
  const table = await page.evaluate(() => loomTable());
  fs.writeFileSync('/root/amora/loom_table.json', JSON.stringify(table, null, 1));
  console.log(fails === 0 ? 'LOOM: ALL GREEN' : `LOOM: ${fails} FAILURES`);
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
