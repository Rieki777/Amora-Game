/**
 * The map skin sanitiser.
 *
 * Two of these fields leave JSON and become CSS custom properties inside the
 * map artifact, so the colour tests are the security ones: anything that is
 * not a plain six-digit hex has to come back blank, whatever it looks like.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_MAP_SKIN, RUNTIME_PAINTERLY, sanitiseMapSkin, type MapSkin } from "./mapSkin";

describe("sanitiseMapSkin", () => {
  it("returns the defaults for junk input", () => {
    expect(sanitiseMapSkin(undefined)).toEqual(DEFAULT_MAP_SKIN);
    expect(sanitiseMapSkin(null)).toEqual(DEFAULT_MAP_SKIN);
    expect(sanitiseMapSkin("nonsense")).toEqual(DEFAULT_MAP_SKIN);
  });

  it("keeps a real export intact", () => {
    // Painterly values as the artifact actually emits them: fractions, from
    // its own `brushVal = sliderValue / 100`.
    const exported = {
      theme: "Terra Sol", words: "high desert", mist: true, glow: false,
      global_scale: 1.5, accent: "#157F7D", parchment: "#f3e7cf",
      label_scale: 1.1, icon_mode: "iso", painterly: { brush: 0.4, palette: 0.7 },
      flow_style: "gold", label_style: "tablet",
      note: "ignored",
    };
    expect(sanitiseMapSkin(exported)).toEqual({
      theme: "Terra Sol", words: "high desert", accent: "#157F7D", parchment: "#f3e7cf",
      label_scale: 1.1, global_scale: 1.5, icon_mode: "iso",
      flow_style: "gold", label_style: "tablet",
      mist: true, glow: false, painterly: { brush: 0.4, palette: 0.7 },
    });
  });

  /*
   * The dress the map wears. Added in artifact v0.8, and dropped in silence
   * until this list grew to match: a founder set gold flows and tablet
   * labels, exported, pasted into the wizard, and the wizard saved a skin
   * with neither. Nothing errored, which is the whole problem.
   */
  it("carries the dress the map wears", () => {
    const dressed = sanitiseMapSkin({ flow_style: "medium", label_style: "tablet" });
    expect(dressed.flow_style).toBe("medium");
    expect(dressed.label_style).toBe("tablet");
  });

  it("falls back to the map's own default for a style it does not know", () => {
    // Not blank. The artifact reads a falsy style as "use the default", so
    // there is no third state and storing "" would only look like a choice.
    for (const bad of ["", "sparkle", 7, null, undefined, { flow: "gold" }]) {
      expect(sanitiseMapSkin({ flow_style: bad }).flow_style).toBe("glyph");
      expect(sanitiseMapSkin({ label_style: bad }).label_style).toBe("ribbon");
    }
  });

  it("blanks any colour that is not a six-digit hex", () => {
    for (const bad of [
      "red",
      "#fff",
      "#12345g",
      // The one that matters: a value that would close the declaration and
      // open another if it were ever interpolated into a stylesheet.
      "#fff; background: url(https://evil.test/x)",
      "javascript:alert(1)",
      "var(--something)",
    ]) {
      expect(sanitiseMapSkin({ accent: bad }).accent).toBe("");
      expect(sanitiseMapSkin({ parchment: bad }).parchment).toBe("");
    }
  });

  it("drops an unknown theme and an unknown icon mode", () => {
    expect(sanitiseMapSkin({ theme: "Mordor" }).theme).toBe("");
    expect(sanitiseMapSkin({ icon_mode: "hologram" }).icon_mode).toBe("painted");
  });

  it("clamps scales into range instead of refusing them", () => {
    expect(sanitiseMapSkin({ label_scale: 99 }).label_scale).toBe(1.3);
    expect(sanitiseMapSkin({ label_scale: 0 }).label_scale).toBe(0.8);
    expect(sanitiseMapSkin({ global_scale: 99 }).global_scale).toBe(3);
    expect(sanitiseMapSkin({ global_scale: -4 }).global_scale).toBe(0.5);
    // A non-number falls back to 1 rather than clamping NaN to a bound.
    expect(sanitiseMapSkin({ label_scale: "wide" }).label_scale).toBe(1);
  });

  it("keeps the pulse lit for a document written before glow existed", () => {
    // The artifact reads glow as `!== false`, and this has to agree.
    expect(sanitiseMapSkin({}).glow).toBe(true);
    expect(sanitiseMapSkin({ glow: false }).glow).toBe(false);
    // Anything non-boolean is not an instruction to turn it off.
    expect(sanitiseMapSkin({ glow: "no" }).glow).toBe(true);
  });

  it("separates an unset painterly dial from a zeroed one", () => {
    expect(sanitiseMapSkin({}).painterly).toEqual({ brush: null, palette: null });
    expect(sanitiseMapSkin({ painterly: { brush: 0 } }).painterly.brush).toBe(0);
    expect(sanitiseMapSkin({ painterly: { brush: 900 } }).painterly.brush).toBe(1);
    expect(sanitiseMapSkin({ painterly: { brush: "x" } }).painterly.brush).toBeNull();
  });

  it("keeps painterly as a FRACTION, which is what the map reads", () => {
    /*
     * The regression this locks down. The first draft clamped painterly to
     * 0-100 integers, so a real exported 0.4 came back through Math.round as
     * 0 and the dial was silently destroyed on import. The artifact's
     * applySkinExport multiplies by 100, so anything but a fraction here
     * drives its slider off the end of its own range.
     */
    expect(sanitiseMapSkin({ painterly: { brush: 0.4 } }).painterly.brush).toBe(0.4);
    expect(sanitiseMapSkin({ painterly: { palette: 0.07 } }).painterly.palette).toBe(0.07);
    // A percent-shaped value is out of range and clamps to full rather than
    // quietly meaning something forty times too strong.
    expect(sanitiseMapSkin({ painterly: { brush: 40 } }).painterly.brush).toBe(1);
    // Hundredths survive; the slider cannot produce anything finer.
    expect(sanitiseMapSkin({ painterly: { brush: 0.335 } }).painterly.brush).toBe(0.335);
  });

  it("truncates the words field rather than storing an essay", () => {
    expect(sanitiseMapSkin({ words: "x".repeat(500) }).words).toHaveLength(160);
  });
});

/**
 * The server's write path, exactly as `PUT /api/admin/brand` performs it:
 *   sanitiseMapSkin({ ...getBrand().skin, ...req.body.skin })
 * Reproduced here so the merge semantics are pinned without a database.
 */
const putSkin = (stored: Partial<MapSkin>, sent: Partial<MapSkin>) =>
  sanitiseMapSkin({ ...DEFAULT_MAP_SKIN, ...stored, ...sent });

describe("B2/F1: an untouched Save changes nothing", () => {
  it("keeps painterly null through open-then-save on a fresh village", () => {
    /*
     * The regression. The panel used to render an unset dial at 50%, so a
     * founder opening the step saw a number the map was not drawing; the fix
     * shows the runtime default instead. What must NOT follow is the panel
     * writing that display value down. Storage stays null until a dial moves,
     * so a no-op save cannot repaint the land.
     */
    const stored = sanitiseMapSkin({});
    expect(stored.painterly).toEqual({ brush: null, palette: null });

    // Exactly what the panel sends when nothing was touched: the loaded skin.
    const afterSave = putSkin(stored, stored);
    expect(afterSave).toEqual(stored);
    expect(afterSave.painterly).toEqual({ brush: null, palette: null });
  });

  it("displays the map's own defaults for an unset dial, and never stores them", () => {
    // These are what the artifact draws with no skin applied.
    expect(RUNTIME_PAINTERLY.brush).toBe(1);
    expect(RUNTIME_PAINTERLY.palette).toBe(0.3);
    // Reading them for display must not make them stored values.
    expect(sanitiseMapSkin({}).painterly.brush).toBeNull();
  });

  it("records a dial only once a founder actually moves it, and reset clears it", () => {
    const stored = sanitiseMapSkin({});
    const moved = putSkin(stored, { painterly: { brush: 0.25, palette: null } });
    expect(moved.painterly).toEqual({ brush: 0.25, palette: null });
    // A second untouched save preserves the choice.
    expect(putSkin(moved, moved).painterly).toEqual({ brush: 0.25, palette: null });
    // Reset puts it back to unset, which is distinct from zero.
    expect(putSkin(moved, { painterly: { brush: null, palette: null } }).painterly)
      .toEqual({ brush: null, palette: null });
  });
});

describe("B1: booleans survive the brand merge", () => {
  it("persists mist ON through the write path", () => {
    /*
     * Dream mist defaults false, so it is the field most exposed to a merge
     * that drops it: anything losing the sent value falls back to the default
     * and the toggle silently reverts. `getBrand()` rebuilds the document from
     * NAMED SECTIONS, which has swallowed a whole section before (theme), so
     * this pins the boolean end to end.
     */
    const stored = sanitiseMapSkin({});
    expect(stored.mist).toBe(false);
    const on = putSkin(stored, { mist: true });
    expect(on.mist).toBe(true);
    // And it survives a subsequent unrelated save.
    expect(putSkin(on, { accent: "#112233" }).mist).toBe(true);
    // Turning it back off is honoured too, which a `||` merge would break.
    expect(putSkin(on, { mist: false }).mist).toBe(false);
  });

  it("keeps the pulse lit unless explicitly turned off", () => {
    const stored = sanitiseMapSkin({});
    expect(stored.glow).toBe(true);
    expect(putSkin(stored, { glow: false }).glow).toBe(false);
    expect(putSkin(sanitiseMapSkin({ glow: false }), { glow: true }).glow).toBe(true);
  });
});
