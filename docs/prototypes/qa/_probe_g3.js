/* L3 inspector probe (g family). Measures the four things this lane touches.
   Run:  cd docs/prototypes && source qa/env.sh && node qa/_probe_g3.js
   Viewport 1440x900 to match the handoff numbers.

   Trap 4: SCENE/SKIN/MEDIA are top-level `const` in a classic inline script, so
   they are NOT window properties. Bare identifiers resolve inside evaluate();
   window.SCENE does not. Top-level `function` declarations DO land on window,
   which is why openInspect/$ are reachable. */
const { chromium } = require('playwright');

const R = 'el=>{if(!el)return null;const r=el.getBoundingClientRect();return {top:Math.round(r.top),bottom:Math.round(r.bottom),left:Math.round(r.left),w:Math.round(r.width),h:Math.round(r.height)}}';

(async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_EXE });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const perr = [];
  p.on('pageerror', e => perr.push(String(e)));
  await p.goto(process.env.GROUNDS_FILE);
  await p.waitForFunction("typeof SCENE!=='undefined' && Array.isArray(SCENE.structures)", null, { timeout: 15000 });

  // #introCard (z 5000) covers the whole viewport at rest. Dismiss it or every
  // rect below is measured behind a full-screen card.
  await p.click('#enterBtn');
  await p.waitForTimeout(2400);

  const out = {};
  out.body = await p.evaluate(() => document.body.className);

  // enter build mode; the inspector only exists there
  await p.evaluate(() => { if (!document.body.classList.contains('build')) $('buildBtn').click(); });
  await p.waitForTimeout(600);
  out.bodyBuild = await p.evaluate(() => document.body.className);

  // pick three structures: one bare, one with quests, one with flows
  out.pick = await p.evaluate(() => {
    const has = (s) => ({
      key: s.key, name: s.name,
      quests: SCENE.quests.filter(q => q.at === s.key).length,
      flowsIn: SCENE.flows.filter(f => f.to === s.key).length,
      flowsOut: SCENE.flows.filter(f => f.from === s.key).length
    });
    const bare = SCENE.structures.find(s => !SCENE.quests.some(q => q.at === s.key) && !SCENE.flows.some(f => f.to === s.key || f.from === s.key));
    const rich = SCENE.structures.slice().sort((a, c) => {
      const n = s => SCENE.quests.filter(q => q.at === s.key).length + SCENE.flows.filter(f => f.to === s.key || f.from === s.key).length;
      return n(c) - n(a);
    })[0];
    return { bare: bare ? has(bare) : null, rich: has(rich) };
  });

  const scan = async (key) => {
    await p.evaluate(k => openInspect(k), key);
    await p.waitForTimeout(500); // .open transition is .28s
    return p.evaluate(() => {
      const sels = [...document.querySelectorAll('#inspect select')];
      const tag = s => s.id ? '#' + s.id : '[' + (['qaddr', 'qw', 'fmed', 'foth', 'fvia'].find(d => s.dataset[d] !== undefined) || '?') + ']';
      return {
        inInspect: sels.length,
        ids: sels.map(tag),
        houseListboxes: document.querySelectorAll('#inspect .insp-lb').length,
        wholeDoc: document.querySelectorAll('select').length,
        visible: [...document.querySelectorAll('select')].filter(s => s.getBoundingClientRect().width > 0 && getComputedStyle(s).visibility !== 'hidden' && getComputedStyle(s).display !== 'none').length
      };
    });
  };
  out.scanRich = await scan(out.pick.rich.key);
  if (out.pick.bare) out.scanBare = await scan(out.pick.bare.key);

  // geometry, measured on the rich structure with the panel settled open
  await p.evaluate(k => openInspect(k), out.pick.rich.key);
  await p.waitForTimeout(600);
  out.geom = await p.evaluate(() => {
    const r = el => { if (!el) return null; const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), w: Math.round(b.width), h: Math.round(b.height) }; };
    const act = document.querySelector('#iAct');
    const A = act && act.getBoundingClientRect();
    const rowOf = sel => { const e = document.querySelector(sel); return e ? e.closest('.irow') : null; };
    const dOff = el => (el && A) ? Math.round(el.getBoundingClientRect().top - A.top) : null;
    const doorsRow = document.querySelector('.dchip') ? document.querySelector('.dchip').closest('.irow') : null;
    const helperOf = row => row ? row.nextElementSibling : null;
    return {
      iAct: r(act),
      iActRow: r(rowOf('#iAct')),
      poolRowDelta: dOff(rowOf('#iFund')),
      sizeRowDelta: dOff(rowOf('#iScale')),
      poolHelperDelta: dOff(helperOf(rowOf('#iScale'))),
      doorsRowDelta: dOff(doorsRow),
      doorsRowH: doorsRow ? Math.round(doorsRow.getBoundingClientRect().height) : null,
      doorsHelperDelta: dOff(helperOf(doorsRow)),
      rolesHereDelta: dOff([...document.querySelectorAll('#inspBody h5')].find(h => /roles here/.test(h.textContent))),
      inspectZ: getComputedStyle(document.getElementById('inspect')).zIndex,
      seatDropZ: document.querySelector('#seatDrop') ? getComputedStyle(document.querySelector('#seatDrop')).zIndex : null
    };
  });

  // objective one: what explanation exists today
  out.explain = await p.evaluate(() => {
    const tip = sel => { const e = document.querySelector(sel); return e ? (e.getAttribute('data-tip') || null) : 'NO ELEMENT'; };
    return {
      // #tip resolves via e.target.closest('[data-tip]'), so a wrapper counts
      tips: { iFund: tip('#iFund'), iScale: tip('#iScale'), iAct: tip('#iAct'), dchip: tip('.dchip'),
        phaseRadio: (() => { const r = document.querySelector('[name=iPhase]'); const w = r && r.closest('[data-tip]'); return w ? w.getAttribute('data-tip') : (r ? null : 'NO ELEMENT'); })() },
      // the existing helper-line pattern: bare div, inline font-size 10 or 10.5
      helperLines: [...document.querySelectorAll('#inspBody div')]
        .filter(d => !d.className && /font-size:10/.test(d.getAttribute('style') || ''))
        .map(d => d.textContent.trim().slice(0, 72)),
      inspHelpClass: document.querySelectorAll('#inspBody .insp-help').length,
      tipHasRole: (() => { const t = document.getElementById('tip'); return t ? { role: t.getAttribute('role'), tabindex: t.getAttribute('tabindex'), id: t.id } : null; })(),
      ariaDescribedbyCount: document.querySelectorAll('[aria-describedby]').length
    };
  });

  // objective three: is there really a list below the role input?
  out.seat = await p.evaluate(() => {
    const inp = document.querySelector('#iSeatName'), dd = document.querySelector('#seatDrop');
    const o = {
      placeholder: inp ? inp.placeholder : null,
      notePlaceholder: (document.querySelector('#iSeatNote') || {}).placeholder,
      dropExists: !!dd,
      shownAtRest: dd ? dd.classList.contains('show') : null,
      seatsTotal: SCENE.seats.length,
      unplaced: SCENE.seats.filter(x => !x.at).length
    };
    if (inp) { inp.focus(); if (inp.onfocus) inp.onfocus(); }
    o.shownOnFocus = dd ? dd.classList.contains('show') : null;
    o.rowsOnFocus = dd ? dd.querySelectorAll('[data-seat-i]').length : null;
    // the lying case: type something no seat matches
    if (inp) { inp.value = 'zzzzqqq'; if (inp.oninput) inp.oninput(); }
    o.shownOnNoMatch = dd ? dd.classList.contains('show') : null;
    o.rowsOnNoMatch = dd ? dd.querySelectorAll('[data-seat-i]').length : null;
    o.textOnNoMatch = dd ? dd.textContent.trim().slice(0, 90) : null;
    if (inp) { inp.value = ''; if (inp.oninput) inp.oninput(); }
    return o;
  });

  // objective four: housing fields
  out.housing = await p.evaluate(() => ({
    homesTotal: !!document.querySelector('#iHomesTotal'),
    homesTaken: !!document.querySelector('#iHomesTaken'),
    homesRow: !!document.querySelector('.plate-homes, #iHomesTotal')
  }));

  // derivedState truth table, read off the live function
  out.derived = await p.evaluate(() => {
    const T = [];
    for (const fund of [null, 0, 0.01, 0.49, 0.5, 0.99, 1]) {
      for (const phase of [1, 2, 3]) {
        for (const act of ['steady', 'high', 'low']) {
          T.push([fund, phase, act, derivedState({ fund, phase, act })]);
        }
      }
    }
    return T;
  });

  // ---- the listbox, only meaningful once patch_g3_02 has landed ----
  out.lb = { present: await p.evaluate(() => document.querySelectorAll('#inspect .insp-lb-btn').length) };
  if (out.lb.present) {
    await p.evaluate(k => openInspect(k), out.pick.rich.key);
    await p.waitForTimeout(500);
    // the ACTIVITY control is the one Rye reported
    await p.click('#iAct + .insp-lb-btn, .insp-lb > #iAct ~ .insp-lb-btn');
    await p.waitForTimeout(200);
    out.lb.open = await p.evaluate(() => {
      const list = document.querySelector('body > .insp-lb-list.open');
      const btn = document.querySelector('#inspect .insp-lb-btn[aria-expanded=true]');
      const doors = document.querySelector('.dchip') ? document.querySelector('.dchip').closest('.irow') : null;
      const R = e => { if (!e) return null; const r = e.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) }; };
      const lr = list && list.getBoundingClientRect(), dr = doors && doors.getBoundingClientRect();
      return {
        inDocument: !!list, parentIsBody: !!(list && list.parentNode === document.body),
        z: list ? getComputedStyle(list).zIndex : null,
        rect: R(list), doorsRect: R(doors),
        overlapsDoorsPx: (lr && dr) ? Math.max(0, Math.round(Math.min(lr.bottom, dr.bottom) - Math.max(lr.top, dr.top))) : null,
        role: list && list.getAttribute('role'),
        optionRoles: list ? list.querySelectorAll('[role=option]').length : 0,
        ariaExpanded: btn && btn.getAttribute('aria-expanded'),
        ariaControls: !!(btn && btn.getAttribute('aria-controls')),
        activeIsList: document.activeElement === list,
        values: list ? [...list.querySelectorAll('[role=option]')].map(o => o.dataset.v) : []
      };
    });
    // keyboard: ArrowDown then Enter must land on the SECOND option's VALUE
    await p.keyboard.press('ArrowDown'); await p.waitForTimeout(80);
    await p.keyboard.press('Enter'); await p.waitForTimeout(500);
    out.lb.afterKeyboard = await p.evaluate(() => ({
      selValue: (document.querySelector('#iAct') || {}).value,
      structAct: BY[inspKey] ? (BY[inspKey].act || 'steady') : null,
      state: BY[inspKey] ? BY[inspKey].state : null,
      listsLeftInBody: document.querySelectorAll('body > .insp-lb-list').length,
      btnLabel: (document.querySelector('#inspect .insp-lb-btn .insp-lb-val') || {}).textContent
    }));
    // the camera must NOT have moved while typing in the list
    out.lb.camAfterTypeahead = await (async () => {
      const before = await p.evaluate(() => ({ x: Math.round(cam.x), y: Math.round(cam.y), z: +cam.z.toFixed(3), mode }));
      await p.click('#inspect .insp-lb-btn'); await p.waitForTimeout(150);
      for (const ch of ['t', 'v', 'w', 'h']) { await p.keyboard.press(ch); await p.waitForTimeout(60); }
      await p.keyboard.press('Escape'); await p.waitForTimeout(200);
      const after = await p.evaluate(() => ({ x: Math.round(cam.x), y: Math.round(cam.y), z: +cam.z.toFixed(3), mode,
        tourOpen: !!document.querySelector('#walkCard.show'), wallOpen: !!document.querySelector('#wall.show'),
        inspectStillOpen: document.getElementById('inspect').classList.contains('open') }));
      return { before, after };
    })();
    // qa/secD.js drives these three with page.selectOption; they must still work
    out.lb.selectOption = {};
    for (const [sel, val] of [['#iAct', 'low'], ['#iCircle', 'Gathering'], ['#iArch', 'solar']]) {
      try { await p.selectOption(sel, val, { timeout: 4000 }); await p.waitForTimeout(400); out.lb.selectOption[sel] = 'OK'; }
      catch (e) { out.lb.selectOption[sel] = 'FAIL ' + String(e.message).split('\n')[0].slice(0, 70); }
      await p.evaluate(k => openInspect(k), out.pick.rich.key); await p.waitForTimeout(300);
    }
    out.lb.afterSelectOption = await p.evaluate(() => ({
      arch: BY[inspKey].archetype, circle: BY[inspKey].circle, act: BY[inspKey].act || 'steady'
    }));
  }

  // ---- objective four: homes per hamlet ----
  out.homes = { where: await p.evaluate(() => SCENE.structures.filter(s => typeof housingApplies === 'function' && housingApplies(s)).map(s => s.key)) };
  if (out.homes.where.length) {
    const K = 'ridgeA';
    await p.evaluate(k => openInspect(k), K); await p.waitForTimeout(400);
    out.homes.fieldsOnHamlet = await p.evaluate(() => !!document.querySelector('#iHomesTotal') && !!document.querySelector('#iHomesTaken') && !!document.querySelector('#iHomesLabel'));
    out.homes.fieldsOnCouncil = await p.evaluate(() => { openInspect('council'); return !!document.querySelector('#iHomesTotal'); });
    await p.evaluate(k => openInspect(k), K); await p.waitForTimeout(300);

    const type = async (sel, v) => { await p.fill(sel, String(v)); await p.evaluate(s => document.querySelector(s).dispatchEvent(new Event('change', { bubbles: true })), sel); await p.waitForTimeout(250); };

    // partial: total only. Row exists, hamlet is NOT set, entries excludes it.
    await type('#iHomesTotal', 8);
    out.homes.partial = await p.evaluate(k => ({
      row: SCENE.housing[k] || null, set: housingSet(k), open: housingOpen(k),
      lots: window.LOTS[k], inEntries: housingExport().entries.some(e => e.structureKey === k),
      inRows: housingExport().rows.some(e => e.structureKey === k), configured: housingExport().configured
    }), K);

    // fully set
    await type('#iHomesTaken', 3);
    out.homes.set = await p.evaluate(k => ({
      row: SCENE.housing[k], set: housingSet(k), open: housingOpen(k),
      lots: window.LOTS[k], entry: housingExport().entries.find(e => e.structureKey === k),
      storedOpen: 'open' in (SCENE.housing[k] || {}), configured: housingExport().configured
    }), K);

    // taken above total must be refused, not clamped
    await type('#iHomesTaken', 99);
    out.homes.refusedOverTaken = await p.evaluate(k => ({ row: SCENE.housing[k], lots: window.LOTS[k] }), K);
    // input[type=number] will not accept "abc" from a keyboard at all, so the
    // refusal path is exercised the only way it can be reached: a value set
    // programmatically, which is what a paste or a restore would look like.
    out.homes.browserRejectsText = await p.evaluate(() => { const e = document.querySelector('#iHomesTotal'); e.value = 'abc'; return e.value; });
    await p.evaluate(() => { const e = document.querySelector('#iHomesTotal'); e.setAttribute('type', 'text'); e.value = '4.5'; e.dispatchEvent(new Event('change', { bubbles: true })); });
    await p.waitForTimeout(250);
    out.homes.refusedNonInteger = await p.evaluate(k => ({ row: SCENE.housing[k] }), K);

    // zero is set, never unlimited and never an example. taken is cleared first
    // on purpose: setting total to 0 while taken is 3 is a refusal, not a set,
    // which is the guard doing its job rather than the zero case.
    await p.evaluate(() => { const e = document.querySelector('#iHomesTotal'); if (e) e.setAttribute('type', 'number'); });
    await type('#iHomesTaken', ''); await type('#iHomesTotal', 0); await type('#iHomesTaken', 0);
    out.homes.zeroIsSet = await p.evaluate(k => ({ row: SCENE.housing[k], set: housingSet(k), open: housingOpen(k), inEntries: housingExport().entries.some(e => e.structureKey === k) }), K);

    // clearing both restores the seeded sample and drops the row
    await type('#iHomesTotal', ''); await type('#iHomesTaken', '');
    out.homes.cleared = await p.evaluate(k => ({
      row: SCENE.housing[k] || null, lots: window.LOTS[k], sample: (window.LOTS_SAMPLE || {})[k],
      inEntries: housingExport().entries.some(e => e.structureKey === k), configured: housingExport().configured
    }), K);
    out.homes.editKinds = await p.evaluate(() => EDITS.filter(e => /^housing-/.test(e.action)).map(e => e.action + ' -> ' + (window.EDIT_VERBS[e.action] || 'FALLBACK')));
  }

  console.log(JSON.stringify(out, null, 1));
  console.log('pageerrors', perr.length, perr.slice(0, 4));
  await b.close();
})().catch(e => { console.error('PROBE FAILED', e); process.exit(1); });
