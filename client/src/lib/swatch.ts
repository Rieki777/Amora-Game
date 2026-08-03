/**
 * Colour swatches that admin-editable content may choose from.
 *
 * Circles and roles carry a `color` string typed into the Admin panel, and the
 * cards paint it behind an icon and behind the focus-area pills. Two separate
 * things can go wrong with that value, and both have:
 *
 *   1. The class does not exist. `bg-sage-light` was stored on four live
 *      records and was never defined, so the swatch painted NOTHING and the
 *      white icon and white pill labels sat on a white card, invisible.
 *   2. The class exists but the text on top of it does not survive. `bg-cream`
 *      is real and is 1.22:1 against white. Checking only that a class exists
 *      would wave that through and produce the same unreadable pill.
 *
 * So a colour is not resolved on its own, it is resolved together with the text
 * colour that makes it legible. Every entry below is measured; the value is
 * whichever foreground clears WCAG AA 4.5:1 on that background:
 *
 *   white text        dark text (--foreground #1a3a39)
 *   bg-forest  10.84  bg-amber-light 11.01   bg-cream      10.07
 *   bg-coral    6.63  bg-green-light  9.96   bg-sage-light  9.95
 *   bg-sage     5.95  bg-cream-dark   9.01   bg-aqua-light  8.68
 *   bg-teal-deep 4.81 bg-cyan-brand   7.08   bg-amber       6.46
 *   bg-gold     4.55  bg-teal         5.48   bg-aqua        4.74
 *
 * `bg-teal-light` (#3a9896) is deliberately absent: it is a true mid-tone at
 * 3.44:1 against white and 3.58:1 against the dark foreground, so neither
 * foreground clears AA and there is nothing honest to pair it with. It falls
 * back like any unknown value.
 *
 * Keeping the pairing here rather than an allowlist of "safe" backgrounds means
 * an editor who picks amber still gets amber, drawn with dark text, instead of
 * silently having their choice replaced.
 */
type Ink = "text-white" | "text-foreground";

const SWATCH_INK: Readonly<Record<string, Ink>> = {
  "bg-teal-deep": "text-white",
  "bg-sage": "text-white",
  "bg-forest": "text-white",
  "bg-coral": "text-white",
  "bg-gold": "text-white",
  "bg-teal": "text-foreground",
  "bg-aqua": "text-foreground",
  "bg-aqua-light": "text-foreground",
  "bg-cream": "text-foreground",
  "bg-cream-dark": "text-foreground",
  "bg-amber": "text-foreground",
  "bg-cyan-brand": "text-foreground",
  "bg-sage-light": "text-foreground",
  "bg-amber-light": "text-foreground",
  "bg-green-light": "text-foreground",
};

export const SWATCH_FALLBACK = "bg-sage";

export interface Swatch {
  /** Background utility class, guaranteed to exist in the stylesheet. */
  bg: string;
  /** Text/icon colour class that clears AA on that background. */
  ink: Ink;
}

/**
 * Resolve an admin-supplied colour into a background and the ink that stays
 * readable on it. Anything unknown, blank, or carrying an opacity suffix
 * (`bg-sage/40` fades the panel out from under the text) falls back.
 */
export function swatchFor(input?: string | null, fallback = SWATCH_FALLBACK): Swatch {
  const value = (input ?? "").trim();
  const ink = SWATCH_INK[value];
  if (ink) return { bg: value, ink };
  return { bg: fallback, ink: SWATCH_INK[fallback] ?? "text-white" };
}

/** The choices worth offering an editor, for admin UI and docs. */
export const SWATCH_CHOICES: readonly string[] = Object.keys(SWATCH_INK);
