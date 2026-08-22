/* W1c — an action point in a place panel is a control, and is reachable.
 *
 * The founder's report: "in the living map UI when I click on a building and
 * see different elements I can interact with (like RSVP) those should REALLY
 * stand out as buttons to clearly indicate an action point, right now they're
 * the same size as regular text and hard to see."
 *
 * RSVP was the example. The class is EVERY actionable thing inside #panel, and
 * this gate is written so it cannot be satisfied by fixing one of them:
 *
 *   §0  PRECONDITION. A probe that finds nothing reports exactly what a probe
 *       where everything passed reports. So the first thing asserted is that
 *       the panel opened, that each tab drew controls, and that the KINDS of
 *       control the inventory names were all actually on screen: RSVP, a door
 *       CTA, a module door, a conversation row, Claim, Raise a hand, the Enter
 *       tab's door row, the four tabs and the close cross. A control that
 *       stops rendering fails here rather than passing by absence.
 *   §1  TAP TARGET. 44px in BOTH dimensions on every one of them, measured
 *       from getBoundingClientRect on the real page, at desk and at pocket.
 *   §2  SEMANTICS. Nothing inside the panel is actionable without being a
 *       <button>. The conversation row was a <div onclick> and this is the
 *       check that keeps it from becoming one again.
 *   §3  AFFORDANCE. Every control in the panel body carries a fill or a border
 *       that panel prose does not, and a font that panel prose does not.
 *   §4  FOCUS. Tab through the panel and every control that takes focus paints
 *       a real ring. Keyboard focus is asserted with the KEYBOARD, because
 *       :focus-visible is exactly the thing el.focus() may not satisfy.
 *   §5  HOVER. A pointer over a control changes something computed.
 *   §6  NOT COLOUR ALONE. Every control differs from prose in shape as well as
 *       in colour: a border, a fill and a size that a paragraph does not have.
 *   §7  REDUCED MOTION. With the preference set to reduce, no control in the
 *       panel carries a transition.
 *   §8  THE ROOM THE DOOR OPENS. #moduleCard's own controls hold the same 44px
 *       floor, because RSVP is drawn there too.
 *
 * GROUNDS_FILE and PW_EXE come from qa/env.sh.
 */
const { chromium } = require('playwright');
const FILE = process.env.GROUNDS_FILE || 'file:///root/qa/grounds-v0.html';
const EXE = process.env.PW_EXE;
let fails = 0;
const ok = (c, n) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fails++; };

const MIN = 44;

/* The inventory, by the thing on screen rather than by a selector, so a
 * renamed class fails §0 instead of quietly shrinking the sample. */
const INVENTORY = [
  ['tab', 'the four tabs'],
  ['close', 'the close cross'],
  ['rsvp', 'RSVP on the Overview'],
  ['doorcta', 'a door CTA on the Overview'],
  ['moduledoor', 'a module door on the Overview'],
  ['cvrow', 'a conversation row'],
  ['claim', 'Claim this quest'],
  ['hand', 'Raise a hand'],
  ['doorbtn', 'a door row on the Enter tab'],
];

/* Read every interactive element in a host, classified. Everything the page
 * can act on, not just the ones this patch touched: a bare div with an onclick
 * is exactly the defect §2 exists to catch, so the sweep has to see it. */
const SWEEP = (hostId) => {
  const host = document.getElementById(hostId);
  if (!host) return [];
  const sel = 'button, a[href], input, select, textarea, [onclick], [role="button"], [tabindex]';
  const out = [];
  const seen = new Set();
  for (const e of host.querySelectorAll(sel)) {
    if (seen.has(e)) continue;
    seen.add(e);
    const r = e.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const cls = typeof e.className === 'string' ? e.className : '';
    const txt = (e.textContent || '').replace(/\s+/g, ' ').trim();
    let kind = 'other';
    if (e.id === 'panelClose') kind = 'close';
    else if (e.parentElement && e.parentElement.id === 'tabs') kind = 'tab';
    else if (/\bcvrow\b/.test(cls)) kind = 'cvrow';
    else if (/\bdoorcta\b/.test(cls)) kind = 'doorcta';
    else if (/\bdoorbtn\b/.test(cls)) kind = 'doorbtn';
    else if (e.hasAttribute('data-ev')) kind = 'rsvp';
    else if (/^openDoorHere\(/.test(e.getAttribute('onclick') || '')) kind = 'moduledoor';
    else if (/^claimQuest\(/.test(e.getAttribute('onclick') || '')) kind = 'claim';
    else if (/Raise a hand/.test(txt)) kind = 'hand';
    out.push({
      kind, tag: e.tagName, cls, txt: txt.slice(0, 40),
      w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10,
      fontSize: parseFloat(cs.fontSize),
      fontVariant: cs.fontVariantCaps || cs.fontVariant,
      hasFill: cs.backgroundImage !== 'none' || cs.backgroundColor !== 'rgba(0, 0, 0, 0)',
      borderW: Math.max(
        parseFloat(cs.borderTopWidth) || 0, parseFloat(cs.borderBottomWidth) || 0,
        parseFloat(cs.borderLeftWidth) || 0, parseFloat(cs.borderRightWidth) || 0),
      shadow: cs.boxShadow !== 'none',
      cursor: cs.cursor,
      trans: cs.transitionDuration,
    });
  }
  return out;
};

/* Every tab, at one place, swept and accumulated. Which affordances a building
 * has is a property of the SCENE, so the sample is taken from more than one
 * building and the union is what §0 checks against. */
async function sweepPlace(page, key) {
  const rows = [];
  for (const t of [0, 1, 2, 3]) {
    await page.evaluate(([k, tab]) => openPanel(k, tab), [key, t]);
    await page.waitForTimeout(320);
    const r = await page.evaluate(SWEEP, 'panel');
    rows.push(...r.map(x => Object.assign({ tab: t, at: key }, x)));
  }
  return rows;
}

const label = (r) => `${r.at} tab ${r.tab} ${r.kind} "${r.txt}"`;

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const ctx = await browser.newContext({ viewport: { width: 1480, height: 1180 } });
  const page = await ctx.newPage();
  const perr = [];
  page.on('pageerror', e => perr.push(String(e)));
  console.log('artifact: ' + FILE);

  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForTimeout(1400);
  await page.click('#enterBtn');
  await page.waitForFunction("typeof SCENE!=='undefined' && !!(SCENE.structures && SCENE.structures.length)", null, { timeout: 30000 });
  await page.waitForTimeout(1600);

  /* Two places, chosen for what they carry rather than by name: one with a
     door CTA, one with the most quests and seats. Named in the output so a
     scene edit that empties them is visible instead of silent. */
  const places = await page.evaluate(() => {
    const rank = s => (eventsAt(s.key).length ? 1 : 0) + (threadsAt(s.key).length ? 1 : 0) +
      (questsAt(s.key).length ? 1 : 0) + (seatsAt(s.key).length ? 1 : 0) +
      ((s.modules || []).length ? 1 : 0);
    const withDoor = SCENE.structures.filter(s => Object.keys(s.doors || {}).length)
      .sort((a, b) => rank(b) - rank(a))[0];
    const rich = SCENE.structures.slice().sort((a, b) => rank(b) - rank(a))[0];
    return [withDoor && withDoor.key, rich && rich.key].filter(Boolean);
  });

  let rows = [];
  for (const k of places) rows = rows.concat(await sweepPlace(page, k));

  /* ══ §0 PRECONDITION ═══════════════════════════════════════════════════ */
  console.log('\n-- §0 the sample --');
  ok(places.length === 2, `§0.1 two places sampled: ${places.join(', ')}`);
  ok(rows.length > 0, `§0.2 the sweep found ${rows.length} interactive element(s) in #panel (a probe that finds nothing passes everything)`);
  const perTab = [0, 1, 2, 3].map(t => rows.filter(r => r.tab === t).length);
  ok(perTab.every(n => n > 0), `§0.3 every tab drew controls: ${perTab.join(' / ')}`);
  const kinds = new Set(rows.map(r => r.kind));
  for (const [k, name] of INVENTORY) {
    ok(kinds.has(k), `§0.4 ${name} is on screen (kind "${k}", ${rows.filter(r => r.kind === k).length} found)`);
  }
  ok(!kinds.has('other') || rows.filter(r => r.kind === 'other').length === 0,
    `§0.5 nothing interactive in the panel is unclassified` +
    (kinds.has('other') ? ' — ' + JSON.stringify(rows.filter(r => r.kind === 'other').slice(0, 3)) : ''));

  /* ══ §1 TAP TARGET ═════════════════════════════════════════════════════ */
  console.log('\n-- §1 44px in both dimensions --');
  const small = rows.filter(r => r.w < MIN || r.h < MIN);
  ok(small.length === 0,
    small.length
      ? `§1.1 ${small.length} of ${rows.length} control(s) are under ${MIN}px: ` +
        small.slice(0, 6).map(r => `${label(r)} ${r.w}x${r.h}`).join(' ; ')
      : `§1.1 all ${rows.length} control(s) clear ${MIN}x${MIN} — smallest is ` +
        (() => { const m = rows.slice().sort((a, b) => Math.min(a.w, a.h) - Math.min(b.w, b.h))[0]; return `${label(m)} at ${m.w}x${m.h}`; })());

  /* ══ §2 SEMANTICS ══════════════════════════════════════════════════════ */
  console.log('\n-- §2 a control is a button --');
  const notBtn = rows.filter(r => r.tag !== 'BUTTON');
  ok(notBtn.length === 0,
    notBtn.length
      ? `§2.1 ${notBtn.length} actionable element(s) are not <button>: ` + notBtn.slice(0, 5).map(r => `${label(r)} <${r.tag.toLowerCase()}>`).join(' ; ')
      : `§2.1 all ${rows.length} actionable elements in the panel are real <button>s`);
  const noCursor = rows.filter(r => r.cursor !== 'pointer');
  ok(noCursor.length === 0, noCursor.length
    ? `§2.2 ${noCursor.length} control(s) do not show a pointer: ` + noCursor.slice(0, 4).map(label).join(' ; ')
    : `§2.2 every control shows a pointer`);

  /* ══ §3 AFFORDANCE ═════════════════════════════════════════════════════ */
  console.log('\n-- §3 a fill or a border, and not prose --');
  const prose = await page.evaluate(() => {
    const b = document.getElementById('panelBody');
    const cs = getComputedStyle(b);
    return { fontSize: parseFloat(cs.fontSize), bg: cs.backgroundColor };
  });
  /* The tabs are the one control that is deliberately flat: they are a strip,
     and the strip's own border is the frame. They are held to §1, §4 and §5
     instead, which is where a flat control has to prove itself. */
  const body = rows.filter(r => r.kind !== 'tab');
  const flat = body.filter(r => !(r.hasFill || r.borderW >= 1 || r.shadow));
  ok(flat.length === 0, flat.length
    ? `§3.1 ${flat.length} control(s) carry neither fill, border nor shadow: ` + flat.slice(0, 4).map(label).join(' ; ')
    : `§3.1 all ${body.length} body control(s) carry a fill, a border or a shadow`);
  const brass = body.filter(r => /\bbtn\b/.test(r.cls));
  ok(brass.length > 0 && brass.every(r => r.fontSize >= prose.fontSize),
    brass.length
      ? `§3.2 the ${brass.length} .btn control(s) are set at ${[...new Set(brass.map(r => r.fontSize))].join('/')}px against ${prose.fontSize}px panel prose`
      : '§3.2 no .btn control was found to compare against panel prose');
  ok(brass.length > 0 && brass.every(r => /small-caps|all-small-caps|petite/.test(r.fontVariant)),
    `§3.3 the .btn controls speak the map's own control vocabulary (font-variant ${[...new Set(brass.map(r => r.fontVariant))].join('/')})`);

  /* ══ §4 FOCUS ══════════════════════════════════════════════════════════ */
  console.log('\n-- §4 the keyboard can see them --');
  await page.evaluate(k => openPanel(k, 0), places[0]);
  await page.waitForTimeout(350);
  /* TABBED, NOT el.focus()-ed. :focus-visible is a heuristic about how focus
     ARRIVED, and the ring this gate is about is the one a keyboard gets, so
     the keyboard is what moves focus here.
     The walk starts at the first tab button because #panelClose is the LAST
     child of #panel: the first version of this section started there, tabbed
     forward, and left the panel on the very first press. It reported "0
     controls reached", which is the shape of a probe that measures nothing
     and says nothing failed. §4.1 is the assertion that keeps that honest. */
  await page.keyboard.press('Tab');
  await page.evaluate(() => { document.querySelector('#tabs button').focus(); });
  const READ_FOCUS = () => {
    const a = document.activeElement;
    if (!a || !document.getElementById('panel').contains(a)) return null;
    const cs = getComputedStyle(a);
    const cls = typeof a.className === 'string' ? a.className : '';
    return {
      tag: a.tagName, cls, id: a.id,
      txt: (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 28),
      outline: parseFloat(cs.outlineWidth) || 0,
      style: cs.outlineStyle,
      colour: cs.outlineColor,
      visible: a.matches(':focus-visible'),
    };
  };
  const focusRings = [];
  for (let i = 0; i < 30; i++) {
    const r = await page.evaluate(READ_FOCUS);
    if (r) focusRings.push(r);
    else if (focusRings.length) break;
    await page.keyboard.press('Tab');
  }
  ok(focusRings.length > 0, `§4.1 tabbing reached ${focusRings.length} control(s) inside the panel`);
  const noRing = focusRings.filter(r => !(r.outline >= 2 && r.style !== 'none'));
  ok(focusRings.length > 0 && noRing.length === 0, noRing.length
    ? `§4.2 ${noRing.length} focused control(s) paint no ring: ` + noRing.slice(0, 4).map(r => `<${r.tag.toLowerCase()}> "${r.txt}" outline ${r.outline}px ${r.style}`).join(' ; ')
    : `§4.2 every one of the ${focusRings.length} focused controls paints a ring of ${[...new Set(focusRings.map(r => r.outline))].join('/')}px`);
  const kindsFocused = new Set(focusRings.map(r => r.id === 'panelClose' ? 'close' : (/cvrow/.test(r.cls) ? 'cvrow' : (/btn/.test(r.cls) ? 'btn' : 'tab'))));
  ok(kindsFocused.has('cvrow'), `§4.3 the conversation row is in the tab order (it was a <div> and was not) — reached ${[...kindsFocused].join(', ')}`);
  const notVisible = focusRings.filter(r => !r.visible);
  ok(focusRings.length > 0 && notVisible.length === 0, notVisible.length
    ? `§4.4 ${notVisible.length} keyboard-focused control(s) do not match :focus-visible`
    : `§4.4 every one of the ${focusRings.length} keyboard-focused controls matches :focus-visible`);

  /* ══ §5 HOVER ══════════════════════════════════════════════════════════ */
  console.log('\n-- §5 hover answers --');
  const hoverProbe = await page.evaluate(async () => {
    const out = [];
    for (const sel of ['#panelBody .btn', '#panelBody .cvrow', '#tabs button', '#panelClose']) {
      const el = document.querySelector(sel);
      if (!el) { out.push({ sel, found: false }); continue; }
      const before = getComputedStyle(el);
      const b = { filter: before.filter, bg: before.backgroundColor, bc: before.borderTopColor };
      out.push({ sel, found: true, before: b });
    }
    return out;
  });
  for (const h of hoverProbe) {
    if (!h.found) { ok(false, `§5.1 ${h.sel} was not on screen to hover`); continue; }
    await page.hover(h.sel);
    await page.waitForTimeout(220);
    const after = await page.evaluate((sel) => {
      const cs = getComputedStyle(document.querySelector(sel));
      return { filter: cs.filter, bg: cs.backgroundColor, bc: cs.borderTopColor };
    }, h.sel);
    const changed = after.filter !== h.before.filter || after.bg !== h.before.bg || after.bc !== h.before.bc;
    ok(changed, `§5.1 ${h.sel} answers a hover (${h.before.filter} -> ${after.filter}, border ${h.before.bc} -> ${after.bc})`);
  }
  /* A HOVER ANSWERS IN THE RIGHT DIRECTION. §5.1 only asks whether anything
     changed, and the first version of this patch passed it while making the
     CURRENT tab fainter: the new hover rule and the tab strip's .on rule weigh
     the same, so order decided, and the block below the strip won. Pointing at
     the tab you are on took its fill from .5 to .35 and its ink from #241a08
     to #3a2b12. Measured, not reasoned about. */
  {
    const alpha = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return 1; const p = m[1].split(','); return p.length > 3 ? parseFloat(p[3]) : 1; };
    const lum = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return 0; const p = m[1].split(',').map(parseFloat); return 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]; };
    const sel = '#tabs button.on';
    const before = await page.evaluate((s) => { const cs = getComputedStyle(document.querySelector(s)); return { bg: cs.backgroundColor, col: cs.color }; }, sel);
    await page.hover(sel); await page.waitForTimeout(220);
    const after = await page.evaluate((s) => { const cs = getComputedStyle(document.querySelector(s)); return { bg: cs.backgroundColor, col: cs.color }; }, sel);
    ok(alpha(after.bg) >= alpha(before.bg) && lum(after.col) <= lum(before.col) + 1,
      `§5.2 hovering the current tab does not wash it out (fill ${before.bg} -> ${after.bg}, ink ${before.col} -> ${after.col})`);
    await page.mouse.move(4, 4); await page.waitForTimeout(120);
  }

  /* ══ §6 NOT COLOUR ALONE ═══════════════════════════════════════════════ */
  console.log('\n-- §6 shape, not only colour --');
  const shaped = body.filter(r => r.borderW >= 1 || r.shadow);
  ok(shaped.length === body.length,
    `§6.1 ${shaped.length} of ${body.length} body controls are set apart by shape (border or shadow) and not by colour alone`);

  /* ══ §7 REDUCED MOTION ═════════════════════════════════════════════════ */
  console.log('\n-- §7 reduced motion --');
  await ctx.close().catch(() => {});
  const rmCtx = await browser.newContext({ viewport: { width: 1480, height: 1180 }, reducedMotion: 'reduce' });
  const rm = await rmCtx.newPage();
  const rmErr = [];
  rm.on('pageerror', e => rmErr.push(String(e)));
  await rm.goto(FILE, { waitUntil: 'load' });
  await rm.waitForTimeout(1400);
  await rm.click('#enterBtn');
  await rm.waitForFunction("typeof SCENE!=='undefined' && !!(SCENE.structures && SCENE.structures.length)", null, { timeout: 30000 });
  await rm.waitForTimeout(1500);
  await rm.evaluate(k => openPanel(k, 0), places[0]);
  await rm.waitForTimeout(320);
  const rmRows = await rm.evaluate(SWEEP, 'panel');
  ok(rmRows.length > 0, `§7.1 the panel drew ${rmRows.length} control(s) with reduced motion set`);
  const moving = rmRows.filter(r => !/^0s(, 0s)*$/.test(r.trans));
  ok(rmRows.length > 0 && moving.length === 0, moving.length
    ? `§7.2 ${moving.length} control(s) still transition under reduced motion: ` + moving.slice(0, 4).map(r => `${r.kind} ${r.trans}`).join(' ; ')
    : `§7.2 no control transitions under reduced motion`);
  /* And the same controls are still 44px, because a preference is not a
     licence to shrink. */
  const rmSmall = rmRows.filter(r => r.w < MIN || r.h < MIN);
  ok(rmSmall.length === 0, rmSmall.length
    ? `§7.3 ${rmSmall.length} control(s) fall under ${MIN}px with reduced motion set`
    : `§7.3 every control still clears ${MIN}x${MIN} with reduced motion set`);
  await rmCtx.close().catch(() => {});

  /* ══ §8 POCKET, and the room the door opens ════════════════════════════ */
  console.log('\n-- §8 the phone, and the room behind the door --');
  const pkCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const pk = await pkCtx.newPage();
  const pkErr = [];
  pk.on('pageerror', e => pkErr.push(String(e)));
  /* NO #enterBtn HERE, and that is the page being right rather than the gate
     being wrong: the pocket boot dismisses the intro card itself and opens the
     Welcome Walk (the hash lands on #/journey/j1). Clicking a button that a
     profile deliberately never draws is a 30-second timeout and a crash, which
     is what the first version of this section did. Escape ends the walk. */
  await pk.goto(FILE + '#hud=pocket', { waitUntil: 'load' });
  await pk.waitForFunction("typeof SCENE!=='undefined' && !!(SCENE.structures && SCENE.structures.length)", null, { timeout: 30000 });
  await pk.waitForTimeout(2200);
  await pk.keyboard.press('Escape');
  await pk.waitForTimeout(500);
  ok(await pk.evaluate(() => document.body.classList.contains('pocket')), '§8.1 the page is on the pocket profile');
  let pkRows = [];
  for (const k of places) {
    for (const t of [0, 1, 2, 3]) {
      await pk.evaluate(([key, tab]) => openPanel(key, tab), [k, t]);
      await pk.waitForTimeout(320);
      const r = await pk.evaluate(SWEEP, 'panel');
      pkRows.push(...r.map(x => Object.assign({ tab: t, at: k }, x)));
    }
  }
  ok(pkRows.length > 0, `§8.2 the pocket panel drew ${pkRows.length} control(s)`);
  const pkSmall = pkRows.filter(r => r.w < MIN || r.h < MIN);
  ok(pkRows.length > 0 && pkSmall.length === 0, pkSmall.length
    ? `§8.3 ${pkSmall.length} of ${pkRows.length} pocket control(s) are under ${MIN}px: ` + pkSmall.slice(0, 6).map(r => `${label(r)} ${r.w}x${r.h}`).join(' ; ')
    : `§8.3 all ${pkRows.length} pocket control(s) clear ${MIN}x${MIN}`);

  /* The room a door opens carries RSVP too. Opened by hand rather than by
     clicking a door, so this section is about the card and not about whether
     the building under test happened to have that door. */
  await pk.evaluate(() => { document.getElementById('panel').classList.remove('open'); openDoor('events', {}); });
  await pk.waitForTimeout(500);
  const cardRows = await pk.evaluate(SWEEP, 'moduleCard');
  ok(cardRows.length > 0, `§8.4 the Events room drew ${cardRows.length} control(s)`);
  const cardSmall = cardRows.filter(r => r.w < MIN || r.h < MIN);
  ok(cardRows.length > 0 && cardSmall.length === 0, cardSmall.length
    ? `§8.5 ${cardSmall.length} of ${cardRows.length} control(s) in the room are under ${MIN}px: ` + cardSmall.slice(0, 6).map(r => `${r.kind} "${r.txt}" ${r.w}x${r.h}`).join(' ; ')
    : `§8.5 all ${cardRows.length} control(s) in the room clear ${MIN}x${MIN}`);
  ok(cardRows.some(r => r.kind === 'rsvp'), `§8.6 RSVP is one of the room's controls, so §8.5 measured the one the founder named`);
  await pkCtx.close().catch(() => {});

  ok(perr.length === 0, `§9.1 zero page errors on the desk pass (${perr.length})${perr.length ? ' — ' + perr[0] : ''}`);
  ok(rmErr.length === 0, `§9.2 zero page errors on the reduced-motion pass (${rmErr.length})${rmErr.length ? ' — ' + rmErr[0] : ''}`);
  ok(pkErr.length === 0, `§9.3 zero page errors on the pocket pass (${pkErr.length})${pkErr.length ? ' — ' + pkErr[0] : ''}`);

  console.log(fails === 0 ? 'MAPACT: ALL GREEN' : `MAPACT: ${fails} FAILURES`);
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
