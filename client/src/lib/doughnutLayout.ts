/**
 * WHERE THE DOUGHNUT'S OUTER LABELS GO, AND WHY THAT IS A SEPARATE FILE.
 *
 * `/village-health` draws the land's ledger as wedges growing outward from a
 * ring, with each wedge's name and running total written just past its tip.
 * Three of the five names were being CLIPPED, down to "ed", "He" and "0 t",
 * and "Food produced" was gone altogether.
 *
 * ── WHY EVERY EXISTING CHECK PASSED ──────────────────────────────────────
 *
 * The `<text>` elements hold the full strings. A DOM query, a text
 * assertion, a contrast check and the truncation audit all read "Water
 * protected" and were all correct. Nothing was truncated: the glyphs were
 * PAINTED OUTSIDE THE PICTURE.
 *
 * The label anchors sit at radius 362 from a centre at 360, so on the left
 * and right they land at x = 15.7 and x = 704.3, and the text runs outward
 * from there. The viewBox was `0 0 720 720`. An outermost `<svg>` has
 * `overflow: hidden` by default, so everything past the element's own box
 * was cut. The bottom label at y = 722 was below the box entirely.
 *
 * It also LOOKED resolution-dependent, which sent the first reading down the
 * wrong path. The svg is `w-full max-h-[76vh]`, and `preserveAspectRatio`
 * defaults to `xMidYMid meet`, so when the element box is wider than it is
 * tall the viewBox is scaled to the height and there is horizontal slack in
 * which out-of-viewBox glyphs survive. Wide window, more letters. Narrow
 * window, "ed" and "He". Same bug either way.
 *
 * ── SO THE FIX IS ARITHMETIC, AND ARITHMETIC CAN BE CHECKED ──────────────
 *
 * The geometry lives here rather than inside the page component so
 * `doughnutLayout.test.ts` can put the real metric names through it and
 * assert that every label box lands inside the viewBox. That test fails on
 * the old `0 0 720 720`, which is the whole point: a check that cannot go
 * red on the defect it was written for is not a check.
 */

export const TAU = Math.PI * 2;

/** The ring geometry the page draws with. One source for the page and the test. */
export const DOUGHNUT = {
  /** Centre, in viewBox units. */
  C: 360,
  /** Outer edge of the land's-ledger band. */
  RING_R_OUT: 270,
  /** How far past that band a best-lunation wedge reaches. */
  R_GROW: 70,
  /** Clear air between the longest wedge and its label. */
  LABEL_GAP: 22,
  /** Font sizes the page sets inline on the two label lines. */
  FONT_LABEL: 11.5,
  FONT_VALUE: 10.5,
  /** Baseline-to-baseline drop from the name to the running total. */
  LINE_GAP: 13,
} as const;

/**
 * The viewBox, sized to hold the rings AND every outer label.
 *
 * Symmetric on x around the centre (-140 and 860 are both 500 from 360) so
 * the picture stays centred, and symmetric on y (-25 and 745 are both 385
 * from 360). The budget it is sized against is in `LABEL_BUDGET` below, and
 * the test proves the real labels fit inside it.
 */
export const DOUGHNUT_VIEWBOX = "-140 -25 1000 770";

/** The widest label and value line this viewBox is sized to carry. */
export const LABEL_BUDGET = {
  /** e.g. "Hectares in restoration". */
  labelChars: 23,
  /** e.g. "1,000,000 liters to date": the number grows with the village. */
  valueChars: 26,
} as const;

/**
 * Width of a run of text, deliberately GENEROUS.
 *
 * There is no font metric available here and there must not be one: a layout
 * check that needs a browser is a check nobody runs. 0.58em per character
 * over-estimates a proportional sans for mixed-case text, so a label this
 * says fits, fits.
 */
export function textWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.58;
}

export interface OuterLabelPlacement {
  /** Mid-angle of this wedge, radians, zero at three o'clock. */
  angle: number;
  x: number;
  /** Baseline of the NAME line. The value line sits `LINE_GAP` below it. */
  y: number;
  anchor: "start" | "middle" | "end";
}

/**
 * Where the name and running total for wedge `i` of `count` are anchored.
 *
 * The wedges start at twelve o'clock and run clockwise, so the first label
 * is up and to the right. `anchor` follows which side of the circle the
 * label is on, which is what makes the text run away from the picture
 * rather than across it.
 */
export function outerLabelPlacement(count: number, i: number): OuterLabelPlacement {
  const { C, RING_R_OUT, R_GROW, LABEL_GAP } = DOUGHNUT;
  const span = TAU / Math.max(1, count);
  const angle = -Math.PI / 2 + (i + 0.5) * span;
  const r = RING_R_OUT + R_GROW + LABEL_GAP;
  const side = Math.cos(angle);
  return {
    angle,
    x: C + r * Math.cos(angle),
    y: C + r * Math.sin(angle),
    anchor: Math.abs(side) < 0.35 ? "middle" : side > 0 ? "start" : "end",
  };
}

export interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** The rectangle the two label lines occupy, ascenders and descenders included. */
export function outerLabelBox(count: number, i: number, label: string, value: string): Box {
  const { FONT_LABEL, FONT_VALUE, LINE_GAP } = DOUGHNUT;
  const p = outerLabelPlacement(count, i);
  const w = Math.max(textWidth(label, FONT_LABEL), textWidth(value, FONT_VALUE));
  const [x0, x1] =
    p.anchor === "start" ? [p.x, p.x + w] : p.anchor === "end" ? [p.x - w, p.x] : [p.x - w / 2, p.x + w / 2];
  // A baseline is not the top of the text. Ascent is about 0.8em above it and
  // descent about 0.2em below, and the value line's baseline is LINE_GAP down.
  return {
    x0,
    x1,
    y0: p.y - FONT_LABEL * 0.8,
    y1: p.y + LINE_GAP + FONT_VALUE * 0.25,
  };
}

/** `viewBox` parsed, so a check can ask whether a box is inside it. */
export function viewBoxBounds(viewBox: string = DOUGHNUT_VIEWBOX): Box {
  const [x, y, w, h] = viewBox.trim().split(/\s+/).map(Number);
  return { x0: x, x1: x + w, y0: y, y1: y + h };
}

export function boxInside(inner: Box, outer: Box): boolean {
  return inner.x0 >= outer.x0 && inner.x1 <= outer.x1 && inner.y0 >= outer.y0 && inner.y1 <= outer.y1;
}
