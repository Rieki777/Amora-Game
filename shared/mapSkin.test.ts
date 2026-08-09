/**
 * The map skin sanitiser.
 *
 * Two of these fields leave JSON and become CSS custom properties inside the
 * map artifact, so the colour tests are the security ones: anything that is
 * not a plain six-digit hex has to come back blank, whatever it looks like.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_MAP_SKIN, sanitiseMapSkin } from "./mapSkin";

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
      note: "ignored",
    };
    expect(sanitiseMapSkin(exported)).toEqual({
      theme: "Terra Sol", words: "high desert", accent: "#157F7D", parchment: "#f3e7cf",
      label_scale: 1.1, global_scale: 1.5, icon_mode: "iso",
      mist: true, glow: false, painterly: { brush: 0.4, palette: 0.7 },
    });
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
