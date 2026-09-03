/**
 * THE BRAND PACK READER: a founder's design system, read once, as data.
 *
 * A founder arrives holding a brand guide. Usually it is one self-contained
 * HTML file from a designer, sometimes a stylesheet, sometimes a page of
 * notes. Everything the Look and Typography panels ask them to type by hand
 * is already inside it: the palette, the type pairing, the mark, the line
 * they use to describe themselves. This module reads that file and hands
 * back the answers, so the first design step can be "here is what we found,
 * change what is wrong" instead of eleven empty fields.
 *
 * ── THREE RULES THIS MODULE IS BUILT AROUND ──────────────────────────────
 *
 * 1. PURE. One string in, one plain object out. No network, no filesystem,
 *    no DOM. The caller reads the file; this reads the text. That is what
 *    makes it testable, and it is also what keeps a stranger's upload from
 *    becoming a request this server makes on their behalf.
 *
 * 2. THE INPUT IS HOSTILE. A brand guide is a file someone uploads, so it is
 *    attacker-controlled markup by default. Nothing here is executed,
 *    evaluated, or fetched. `<script>` blocks are removed before any scan
 *    and never read. Remote references (`@import`, `<link href>`, `url()`,
 *    `<image href="data:...">`, `<use href="#x">`) are parsed for the family
 *    NAMES they mention and are never followed. Every SVG returned has been
 *    rebuilt from an allow-list of elements and attributes, so what comes
 *    back is not the caller's markup with the dangerous parts deleted, it is
 *    a new document containing only shapes.
 *
 * 3. A ZERO MUST SAY WHY IT IS ZERO. Every field carries a status of
 *    "found", "absent" or "unreadable". "absent" is a claim: the parse
 *    completed and this document has none. "unreadable" means the parse did
 *    not complete, so an empty list proves nothing. A parser that answers
 *    the same way when it did not run as when it found nothing is the exact
 *    failure this repository keeps paying for, so the two answers are
 *    different values here, checked by their own tests.
 *
 * ── THE VERDICT, WHICH IS THE FIELD TO BRANCH ON ─────────────────────────
 * A founder who uploads a Wix export, a PDF brochure or a screenshot of an
 * Instagram grid gets little or nothing out of the read above. They have now
 * waited AND arrived at the same blank form, which is worse than starting
 * blank. So `result.verdict` answers four questions in one object:
 *
 *   kind          "usable" / "partial" / "empty" / "unreadable". A caller
 *                 branches on this and never re-derives it from confidences.
 *   reasons       WHY, in terms of what was looked for. "The document has no
 *                 stylesheet of its own" is actionable. "Low confidence" is not.
 *   unfilled      Which fields are empty, how much each one matters, whether
 *                 it is empty because the document has none or because the
 *                 parse failed, and the smallest question that would fill it.
 *   observations  What was in the file that a person could still use: the
 *                 images it holds, its first heading, how much text there is.
 *                 A weak signal a founder can confirm beats silence.
 *
 * The one thing the verdict must never do is read the same for "this file has
 * no brand in it" and "this file could not be read". Those are "empty" and
 * "unreadable", and they are the two the tests pin hardest.
 *
 * ── WHAT "PREFER A NAME OVER A COUNT" MEANS ──────────────────────────────
 * A hex frequency count tells you which colour got used most, which is often
 * the background. A custom property called `--champagne` tells you a person
 * decided that colour was worth naming. Named declarations therefore sort
 * ahead of raw frequency and carry higher confidence, and every colour keeps
 * its declaration index so a caller can re-sort by the order the designer
 * wrote them in.
 *
 * Entry point: `extractBrand(source)`.
 */

import { hslToHex } from "./brandTokens";

// ── Public shape ─────────────────────────────────────────────────────────────

export type Confidence = "high" | "medium" | "low";

/**
 * "absent" and "unreadable" both come with an empty or partial list. They
 * mean opposite things and a caller must branch on them: "absent" is safe to
 * present as "this guide has no palette", "unreadable" is only ever safe to
 * present as "we could not read this".
 */
export type FieldStatus = "found" | "absent" | "unreadable";

export interface Field<T> {
  status: FieldStatus;
  /** "none" whenever status is anything other than "found". */
  confidence: Confidence | "none";
  /** One plain sentence saying what happened. Always populated. */
  note: string;
  items: T[];
}

export type SourceFormat = "html" | "css" | "text";

export interface ExtractedColor {
  /** Normalised `#rrggbb`, lower case. Alpha is dropped and noted. */
  hex: string;
  /** The custom property name without its leading dashes, when it had one. */
  name: string | null;
  /** How many times this colour appears in colour-bearing text. */
  occurrences: number;
  source: "custom-property" | "frequency";
  /** Order the property was declared in, for callers who want author order. */
  declarationIndex: number | null;
  confidence: Confidence;
}

export type FontRoleGuess = "display" | "body" | "accent";

export interface ExtractedFont {
  /** First family in the stack, unquoted. */
  family: string;
  /** The stack exactly as the document wrote it. */
  stack: string;
  role: FontRoleGuess | null;
  /** The custom property that carried it, when it came from one. */
  name: string | null;
  origin: "custom-property" | "font-family" | "stylesheet-link";
  /** What the role guess was read off, for a caller that wants to show it. */
  evidence: string;
  confidence: Confidence;
}

export interface ExtractedMark {
  /** Rebuilt from an allow-list. Null when the mark was dropped, see below. */
  svg: string | null;
  /** Why `svg` is null, when it is. */
  svgOmitted: "too-large" | "nothing-drawable" | null;
  viewBox: string | null;
  /** `aria-label`, or the text of a `<title>` child. */
  label: string | null;
  /** Text of the nearest heading above this mark in the document. */
  heading: string | null;
  /** Rendered width the document asked for, when it stated one in pixels. */
  declaredWidthPx: number | null;
  /** How many times this same geometry appears in the document. */
  repeats: number;
  /** Higher sorts first. `items[0]` is the primary mark guess. */
  score: number;
  /** Every term that moved the score, so the guess can be argued with. */
  reasons: string[];
  confidence: Confidence;
}

export type BrandFieldName = "colors" | "fonts" | "marks" | "tagline" | "weAre" | "weAreNot";

/** How much of the design section a field carries. Drives what to ask first. */
export type Importance = "critical" | "important" | "optional";

/**
 * The four answers a caller has to be able to tell apart. A UI that treats
 * these as one thing sends a founder back to the blank form they started with,
 * which costs them the wait AND the expectation that it would work.
 *
 *   usable      Enough to prefill the design section and let them correct it.
 *   partial     Some of it. Show what was found, ask for the rest by name.
 *   empty       The file parsed and holds no brand information. Nothing is
 *               broken; this file was never going to fill the form.
 *   unreadable  The parse did not complete. Nothing here is a claim about
 *               what the file contains.
 */
export type VerdictKind = "usable" | "partial" | "empty" | "unreadable";

export interface UnfilledField {
  field: BrandFieldName;
  importance: Importance;
  /** "absent" is a fact about the document. "unreadable" is a fact about us. */
  because: "absent" | "unreadable";
  /** The smallest question that would fill this field. */
  ask: string;
}

/**
 * Something in the document a person could still use, when the structured read
 * came up short. `detail` is deliberately never a URL a caller could fetch:
 * an image is reported by its alt text or its file name, so this object can
 * cross into a UI without carrying a request with it.
 */
export interface Observation {
  kind: "image" | "heading" | "stylesheet" | "text" | "shape";
  detail: string;
  count: number;
}

export interface Verdict {
  kind: VerdictKind;
  /** One sentence, written for a person. */
  headline: string;
  /** Why, in terms of what was looked for and what was there. */
  reasons: string[];
  filled: BrandFieldName[];
  /** Ranked: critical first, so a caller asks the question that matters most. */
  unfilled: UnfilledField[];
  observations: Observation[];
  /** 0 to 10. How much of the design section this document can fill. */
  coverage: number;
}

export interface BrandExtract {
  /** "unreadable" means nothing was parsed at all. Check the notes. */
  status: "ok" | "unreadable";
  format: SourceFormat;
  /**
   * The one field to branch on. Everything below it is the detail behind it.
   */
  verdict: Verdict;
  /** Document-level observations: truncation, caps hit, references skipped. */
  notes: string[];
  colors: Field<ExtractedColor>;
  fonts: Field<ExtractedFont>;
  marks: Field<ExtractedMark>;
  /** `items[0]` is the best candidate; the rest are runners-up, ranked. */
  tagline: Field<string>;
  weAre: Field<string>;
  weAreNot: Field<string>;
}

/**
 * What each field is worth, and the smallest question that would fill it.
 * The weights add to 10, which is what `verdict.coverage` is out of.
 */
export const FIELD_META: Record<BrandFieldName, { weight: number; importance: Importance; ask: string }> = {
  colors: { weight: 3, importance: "critical", ask: "What are your main colours? A hex value for each is enough." },
  fonts: { weight: 2, importance: "important", ask: "Which typefaces do you use, one for headings and one for body text?" },
  marks: { weight: 2, importance: "important", ask: "Upload your logo. An SVG keeps it sharp at every size." },
  tagline: { weight: 1, importance: "optional", ask: "What is the one line you use to describe the village?" },
  weAre: { weight: 1, importance: "optional", ask: "Name two things that are on brand for you." },
  weAreNot: { weight: 1, importance: "optional", ask: "Name two things you never want shown." },
};

const FIELD_ORDER: BrandFieldName[] = ["colors", "fonts", "marks", "tagline", "weAre", "weAreNot"];

export interface ExtractOptions {
  /** Anything longer than this is refused. Parsing a prefix would lie. */
  maxChars?: number;
}

/**
 * Every cap in one place, because a limit that lives at its call site is a
 * limit nobody finds when the file that hits it arrives.
 */
export const LIMITS = {
  /** About 4 MB of text. The real guide that motivated this is 330 KB. */
  inputChars: 4_000_000,
  /** SVG blocks examined. Beyond this the document is noted and truncated. */
  svgBlocks: 240,
  /** Distinct marks returned, after identical geometry is collapsed. */
  marks: 24,
  colors: 48,
  /** Unnamed colours kept. A count with no name behind it is a long tail. */
  unnamedColors: 16,
  fonts: 12,
  statements: 12,
  /** Sanitised SVG longer than this is dropped, with its metadata kept. */
  markChars: 24_000,
  /** Longest single statement or heading kept. */
  textChars: 400,
} as const;

// ── Entry point ──────────────────────────────────────────────────────────────

export function extractBrand(source: unknown, options: ExtractOptions = {}): BrandExtract {
  const maxChars = options.maxChars ?? LIMITS.inputChars;

  if (typeof source !== "string") {
    return allUnreadable("text", "The input was not text, so nothing was parsed.", [
      "This reader takes a string. Read the file to text first, and check it is HTML, CSS or plain text.",
    ]);
  }
  if (source.length > maxChars) {
    return allUnreadable(
      detectFormat(source.slice(0, 4096)),
      `The input is ${source.length} characters, over the ${maxChars} cap. Nothing was parsed, because parsing a prefix would report a partial palette as a whole one.`,
      [`The file is larger than this reader will take, which is ${maxChars} characters.`],
    );
  }

  // Named before the NUL check below, because "this looks like a PDF" is
  // something a founder can act on and "the input contains NUL bytes" is not.
  const binary = sniffBinary(source);
  if (binary) {
    return allUnreadable("text", `The input looks like ${binary}, which is not text this reader can parse.`, [
      `The file looks like ${binary}.`,
      "This reader takes HTML, CSS or plain text. Export or convert the file first.",
    ]);
  }
  if (source.includes("\u0000")) {
    // Written as an escape on purpose. A literal NUL in this file would make
    // the file itself binary to grep, which is the hazard being checked for.
    return allUnreadable(
      "text",
      "The input contains NUL bytes, which is how a truncated or binary file arrives. Nothing was parsed.",
      ["The file is not text. It may be a binary format, or a text file that was cut off part-written."],
    );
  }
  if (source.trim() === "") {
    return allAbsent("text", "The input is empty.", ["The file has no content at all."]);
  }

  const format = detectFormat(source);
  const notes: string[] = [];

  const doc = format === "html" ? readHtml(source, notes) : readNonHtml(source, format);

  const colors = extractColors(doc, notes);
  const fonts = extractFonts(doc, notes);
  const marks = extractMarks(doc, notes);
  const { tagline, weAre, weAreNot } = extractStatements(doc);

  const fields: FieldMap = { colors, fonts, marks, tagline, weAre, weAreNot };
  return { status: "ok", format, verdict: buildVerdict(fields, doc), notes, ...fields };
}

// ── The verdict ──────────────────────────────────────────────────────────────

interface FieldMap {
  colors: Field<ExtractedColor>;
  fonts: Field<ExtractedFont>;
  marks: Field<ExtractedMark>;
  tagline: Field<string>;
  weAre: Field<string>;
  weAreNot: Field<string>;
}

/**
 * Turns six field statuses into one answer a caller can branch on without
 * re-deriving it, plus the specific questions that would fill the gaps.
 *
 * The bar for "usable" is deliberately about the PALETTE. A design section
 * with colours and nothing else is worth showing, because every other token
 * derives from a seed colour (`deriveTheme` in brandTokens.ts). A design
 * section with a tagline and no colours is a blank form with a sentence on it.
 */
function buildVerdict(fields: FieldMap, doc: ParsedDoc): Verdict {
  const filled: BrandFieldName[] = [];
  const unfilled: UnfilledField[] = [];
  let coverage = 0;
  let anyUnreadable = false;

  for (const name of FIELD_ORDER) {
    const field = fields[name] as Field<unknown>;
    const meta = FIELD_META[name];
    if (field.status === "unreadable") anyUnreadable = true;
    if (field.status === "found" && field.items.length > 0) {
      filled.push(name);
      coverage += meta.weight;
    } else {
      unfilled.push({
        field: name,
        importance: meta.importance,
        because: field.status === "unreadable" ? "unreadable" : "absent",
        ask: meta.ask,
      });
    }
  }

  const rank: Record<Importance, number> = { critical: 0, important: 1, optional: 2 };
  unfilled.sort(
    (a, b) => rank[a.importance] - rank[b.importance] || FIELD_ORDER.indexOf(a.field) - FIELD_ORDER.indexOf(b.field),
  );

  const observations = observe(doc, fields);
  const reasons = explain(fields, doc, observations);

  const hasPalette = fields.colors.status === "found";
  let kind: VerdictKind;
  if (filled.length === 0 && anyUnreadable) kind = "unreadable";
  else if (filled.length === 0) kind = "empty";
  else if (hasPalette && coverage >= 5) kind = "usable";
  else kind = "partial";

  const headline =
    kind === "usable"
      ? `Read the design system out of this file: ${listFields(filled)}.`
      : kind === "partial"
        ? `Read part of this file: ${listFields(filled)}. ${unfilled.length} ${unfilled.length === 1 ? "field is" : "fields are"} still empty.`
        : kind === "empty"
          ? "This file parsed and carries no brand information."
          : "This file could not be read to the end, so nothing here says what it contains.";

  return { kind, headline, reasons, filled, unfilled, observations, coverage };
}

function listFields(names: BrandFieldName[]): string {
  const label: Record<BrandFieldName, string> = {
    colors: "the palette",
    fonts: "the typefaces",
    marks: "the mark",
    tagline: "a tagline",
    weAre: "on-brand examples",
    weAreNot: "off-brand examples",
  };
  return names.map((n) => label[n]).join(", ");
}

/**
 * Why each empty field is empty, in terms of what was looked for and what was
 * there. "No CSS custom properties and no stylesheet" is something a founder
 * can act on. "Low confidence" is not.
 */
function explain(fields: FieldMap, doc: ParsedDoc, observations: Observation[]): string[] {
  const reasons: string[] = [];
  const images = observations.find((o) => o.kind === "image");

  if (fields.colors.status === "absent") {
    if (doc.format === "text") {
      reasons.push("No palette: this is plain text, so there is no stylesheet to read colours out of. A list of hex values written into the text would be read.");
    } else if (doc.css.trim() === "") {
      reasons.push("No palette: the document has no stylesheet of its own. The colours may live in a linked stylesheet, which is never fetched.");
    } else {
      reasons.push("No palette: the stylesheet declares no custom property holding a colour, and names no colour anywhere this reader looks.");
    }
  }
  if (fields.colors.status === "unreadable") {
    reasons.push("No palette can be claimed: the stylesheet did not parse to the end.");
  }

  if (fields.fonts.status === "absent") {
    reasons.push(
      doc.format === "html" && doc.css.trim() === ""
        ? "No typefaces: the document has no stylesheet and no webfont link."
        : "No typefaces: nothing in the document sets a font-family.",
    );
  }

  if (fields.marks.status === "absent" && doc.format === "html") {
    reasons.push(
      images && images.count > 0
        ? `No mark: the document has no inline SVG. It does have ${images.count} ${images.count === 1 ? "image" : "images"}, which this reader lists and never opens.`
        : "No mark: the document has no inline SVG and no images.",
    );
  }

  if (fields.tagline.status === "absent" && fields.weAre.status === "absent" && fields.weAreNot.status === "absent") {
    reasons.push(
      doc.format === "html"
        ? "No brand statements: nothing is labelled as a tagline, and no element is marked as an on-brand or off-brand example."
        : "No brand statements: no line is labelled `Tagline:`, `We are:` or `We are not:`.",
    );
  }

  return reasons;
}

/**
 * What the document holds that a person could still use. A weak signal a
 * founder can confirm beats silence, so this runs whether or not the
 * structured read succeeded.
 */
function observe(doc: ParsedDoc, fields: FieldMap): Observation[] {
  const out: Observation[] = [];

  if (doc.format === "html") {
    const images = imageObservation(doc.markup);
    if (images) out.push(images);

    const headings = Array.from(doc.markup.matchAll(/<h([1-6])\b[^>]{0,300}>([\s\S]{0,400}?)<\/h\1>/gi));
    if (headings.length > 0) {
      const first = plainPhrase(headings[0][2]);
      out.push({
        kind: "heading",
        detail: first ? `first heading: ${first}` : "headings, none of them carrying text",
        count: headings.length,
      });
    }
  }

  if (doc.format !== "text") {
    const declarations = doc.css.trim() === "" ? 0 : (doc.css.match(/:/g) ?? []).length;
    out.push({
      kind: "stylesheet",
      detail: declarations === 0 ? "no stylesheet in the document" : `a stylesheet with roughly ${declarations} declarations`,
      count: declarations,
    });
  }

  const words = doc.text.trim() === "" ? 0 : doc.text.trim().split(/\s+/).length;
  out.push({
    kind: "text",
    detail: words < 40 ? "very little text, so there is not much here to read" : `${words} words of text`,
    count: words,
  });

  if (fields.marks.items.length > 0) {
    out.push({
      kind: "shape",
      detail: "inline shapes, ranked with the primary mark guess first",
      count: fields.marks.items.length,
    });
  }

  return out;
}

/** Images by alt text or file name. Never by a URL a caller could fetch. */
function imageObservation(markup: string): Observation | null {
  const tags = Array.from(markup.matchAll(/<img\b([^>]{0,800})>/gi));
  if (tags.length === 0) return null;
  const names: string[] = [];
  for (const tag of tags.slice(0, 6)) {
    const attrs = parseAttributes(tag[1]);
    const alt = attrs["alt"]?.trim();
    if (alt) { names.push(alt); continue; }
    const src = attrs["src"] ?? "";
    if (/^data:/i.test(src)) { names.push("an inline image"); continue; }
    const file = src.split(/[?#]/)[0].split("/").filter(Boolean).pop();
    if (file) names.push(file);
  }
  const detail = names.length > 0
    ? `images this reader lists and never opens: ${names.slice(0, 4).join(", ")}`
    : "images this reader lists and never opens";
  return { kind: "image", detail: truncate(detail, LIMITS.textChars), count: tags.length };
}

/**
 * A file that is not text at all, named by what it looks like. A founder who
 * uploads a brochure gets "this looks like a PDF", which tells them what to do
 * next. A byte-level complaint does not.
 */
function sniffBinary(source: string): string | null {
  const head = source.slice(0, 16);
  // Full signatures written as escapes. A two-letter "PK" would misread a
  // note that opens with the word "PKs", and a false "this is a zip" is worse
  // than no guess at all.
  const signatures: Array<[string, string]> = [
    ["%PDF-", "a PDF"],
    ["PK\u0003\u0004", "a zip archive or an Office document"],
    ["PK\u0005\u0006", "an empty zip archive"],
    ["\u0089PNG", "a PNG image"],
    ["GIF87a", "a GIF image"],
    ["GIF89a", "a GIF image"],
    ["%!PS", "a PostScript file"],
    ["{\\rtf", "an RTF document"],
    ["OTTO", "a font file"],
    ["wOFF", "a font file"],
    ["wOF2", "a font file"],
  ];
  for (const [prefix, label] of signatures) {
    if (head.startsWith(prefix)) return label;
  }
  // A JPEG, a WebP or anything else binary decodes to replacement characters.
  // Three inside the first sixteen is not a text file anybody wrote.
  const replacements = (head.match(/\uFFFD/g) ?? []).length;
  if (replacements >= 3) return "a binary file";
  return null;
}

// ── Document model ───────────────────────────────────────────────────────────

interface ParsedDoc {
  format: SourceFormat;
  /** Every stylesheet block joined, CSS comments removed. */
  css: string;
  /** Text that can legitimately carry a colour, and nothing else. */
  colourCorpus: string;
  /** Markup with comments and script blocks removed. Empty for css/text. */
  markup: string;
  /**
   * The same markup, lower-cased once. Every tag scan needs a case-insensitive
   * haystack, and building one per call turned the 330 KB guide this was
   * written against into 8 seconds of `toLowerCase()`.
   */
  markupLower: string;
  /** Plain text of the document, block boundaries preserved as newlines. */
  text: string;
  /** Font families named by a stylesheet link, never fetched. */
  linkedFamilies: string[];
  /** Set when a construct opened and never closed. Poisons the field. */
  cssTruncated: boolean;
  svgTruncated: boolean;
}

function detectFormat(source: string): SourceFormat {
  if (/<\s*(!doctype\s+html|html|head|body|div|section|header|main|style|svg|p|h[1-6])\b/i.test(source)) {
    return "html";
  }
  // A stylesheet has declarations inside braces. Requiring both the brace and
  // a colon keeps a page of prose containing one stray `{` out of this branch.
  if (/\{[^{}]{0,4000}:[^{}]{0,4000}\}/.test(source) || /(^|[\s;{])--[a-z0-9_-]{1,64}\s*:/i.test(source)) {
    return "css";
  }
  return "text";
}

function readNonHtml(source: string, format: SourceFormat): ParsedDoc {
  const css = format === "css" ? stripCssComments(source) : "";
  return {
    format,
    css,
    // A stylesheet is colour-bearing throughout. A page of notes may name a
    // hex in prose, which is the whole reason the "text" branch exists.
    colourCorpus: format === "css" ? css : source,
    markup: "",
    markupLower: "",
    text: source,
    linkedFamilies: [],
    cssTruncated: false,
    svgTruncated: false,
  };
}

function readHtml(source: string, notes: string[]): ParsedDoc {
  // Comments first. An unterminated comment swallows the rest of the file,
  // and a reader that silently drops half a document is the silent zero.
  let cssTruncated = false;
  const { text: withoutComments, truncated: commentTruncated } = stripHtmlComments(source);
  if (commentTruncated) {
    notes.push("An HTML comment opened and never closed. Everything after it was discarded.");
    cssTruncated = true;
  }

  // Script blocks are removed before anything else looks at the markup. They
  // are never parsed, never scanned for colours, never reported.
  const withoutScripts = removeElement(withoutComments, "script");
  if (withoutScripts.unclosed) {
    notes.push("A <script> block opened and never closed. Everything after it was discarded.");
  }

  const styles = collectElement(withoutScripts.text, "style");
  if (styles.unclosed) {
    notes.push("A <style> block opened and never closed, so the stylesheet is incomplete.");
    cssTruncated = true;
  }
  const css = stripCssComments(styles.contents.join("\n"));
  const markup = styles.remainder;

  if (/@import\b/i.test(css)) {
    notes.push("The stylesheet has an @import. Remote stylesheets are never fetched, so anything defined only there is missing.");
  }

  const linkedFamilies = readStylesheetLinks(markup, notes);

  const svgBalance = countTags(markup, "svg");
  const svgTruncated = svgBalance.open > svgBalance.close;
  if (svgTruncated) {
    notes.push("An <svg> opened and never closed, so the mark list is incomplete.");
  }

  return {
    format: "html",
    css,
    colourCorpus: [css, inlineStyleValues(markup), paintAttributeValues(markup)].join("\n"),
    markup,
    markupLower: markup.toLowerCase(),
    text: htmlToText(markup),
    linkedFamilies,
    cssTruncated,
    svgTruncated,
  };
}

// ── Colours ──────────────────────────────────────────────────────────────────

const GENERIC_FAMILIES = new Set([
  "serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui",
  "ui-serif", "ui-sans-serif", "ui-monospace", "ui-rounded", "math", "emoji",
  "fangsong", "inherit", "initial",
]);

interface CustomProperty { name: string; value: string; index: number }

function customProperties(css: string): CustomProperty[] {
  const out: CustomProperty[] = [];
  const re = /--([a-zA-Z0-9_-]{1,64})\s*:\s*([^;{}]{1,400})(?=[;}])/g;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(css)) !== null) {
    out.push({ name: m[1], value: m[2].trim(), index: i++ });
    if (out.length >= 512) break;
  }
  return out;
}

function extractColors(doc: ParsedDoc, notes: string[]): Field<ExtractedColor> {
  const counts = countHexOccurrences(doc.colourCorpus);
  const named: ExtractedColor[] = [];
  const seen = new Set<string>();
  let alphaDropped = false;

  for (const prop of customProperties(doc.css)) {
    const parsed = parseColour(prop.value);
    if (!parsed) continue;
    if (parsed.hadAlpha) alphaDropped = true;
    if (seen.has(parsed.hex)) continue;
    seen.add(parsed.hex);
    named.push({
      hex: parsed.hex,
      name: prop.name,
      occurrences: counts.get(parsed.hex) ?? 1,
      source: "custom-property",
      declarationIndex: prop.index,
      // A person wrote this name down on purpose. That is the strongest
      // signal in the file, stronger than any count.
      confidence: "high",
    });
  }

  const byFrequency: ExtractedColor[] = [];
  counts.forEach((occurrences, hex) => {
    if (seen.has(hex)) return;
    // Pure black and white carry no hue a village would recognise as theirs,
    // so they are dropped from the count. A named property called `--black`
    // skips this filter entirely, by the rule at the top of the file.
    //
    // A single appearance is kept. Requiring two was the first rule here and
    // it was wrong in the small case that matters most: `h1{color:#abcdef}`
    // is a stylesheet WITH a colour, and answering "absent" for it is the
    // confident-wrong answer this module exists to avoid. One appearance is
    // reported at low confidence and sorted last instead.
    if (hex === "#000000" || hex === "#ffffff") return;
    byFrequency.push({
      hex,
      name: null,
      occurrences,
      source: "frequency",
      declarationIndex: null,
      confidence: occurrences >= 3 ? "medium" : "low",
    });
  });

  named.sort((a, b) => b.occurrences - a.occurrences || (a.declarationIndex ?? 0) - (b.declarationIndex ?? 0));
  byFrequency.sort((a, b) => b.occurrences - a.occurrences || a.hex.localeCompare(b.hex));

  const items = [...named, ...byFrequency.slice(0, LIMITS.unnamedColors)].slice(0, LIMITS.colors);
  if (alphaDropped) {
    notes.push("Some colours declared an alpha channel. The opaque value was kept and the alpha dropped.");
  }

  if (doc.cssTruncated) {
    return {
      status: "unreadable",
      confidence: "none",
      note: "The stylesheet did not parse to the end, so this list may be missing colours. Do not read an empty list here as a document with no palette.",
      items,
    };
  }
  if (items.length === 0) {
    return {
      status: "absent",
      confidence: "none",
      note: "The document parsed and declares no colours.",
      items,
    };
  }
  return {
    status: "found",
    confidence: named.length > 0 ? "high" : items[0].occurrences >= 3 ? "medium" : "low",
    note:
      named.length > 0
        ? `${named.length} named colour ${named.length === 1 ? "property" : "properties"} and ${byFrequency.length} more by frequency.`
        : `${items.length} colours by frequency only. This document names none of them, so the ordering is a count and carries no intent.`,
    items,
  };
}

/**
 * Counts hex colours across text that is allowed to carry one: stylesheet
 * source, inline `style` values, and paint attributes. Scanning raw markup
 * instead would count `href="#dad"` as a colour, and the founder guide that
 * motivated this module contains `"The #1 ..."` in its own copy.
 */
function countHexOccurrences(corpus: string): Map<string, number> {
  const counts = new Map<string, number>();
  const re = /#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(corpus)) !== null) {
    const parsed = parseColour(`#${m[1]}`);
    if (!parsed) continue;
    counts.set(parsed.hex, (counts.get(parsed.hex) ?? 0) + 1);
  }
  // rgb() and hsl() count too, so a stylesheet written in either is not read
  // as a document with no palette.
  const fn = /\b(rgba?|hsla?)\(([^()]{1,120})\)/gi;
  while ((m = fn.exec(corpus)) !== null) {
    const parsed = parseColour(`${m[1]}(${m[2]})`);
    if (!parsed) continue;
    counts.set(parsed.hex, (counts.get(parsed.hex) ?? 0) + 1);
  }
  return counts;
}

function parseColour(raw: string): { hex: string; hadAlpha: boolean } | null {
  const value = raw.trim();

  const hex = /^#([0-9a-fA-F]{3,8})$/.exec(value);
  if (hex) {
    const d = hex[1];
    if (d.length === 3) return { hex: `#${d[0]}${d[0]}${d[1]}${d[1]}${d[2]}${d[2]}`.toLowerCase(), hadAlpha: false };
    if (d.length === 4) return { hex: `#${d[0]}${d[0]}${d[1]}${d[1]}${d[2]}${d[2]}`.toLowerCase(), hadAlpha: true };
    if (d.length === 6) return { hex: `#${d}`.toLowerCase(), hadAlpha: false };
    if (d.length === 8) return { hex: `#${d.slice(0, 6)}`.toLowerCase(), hadAlpha: true };
    return null;
  }

  const rgb = /^rgba?\(\s*([^,\s/]+)[\s,]+([^,\s/]+)[\s,]+([^,\s/)]+)\s*(?:[,/]\s*([^)]+))?\)$/i.exec(value);
  if (rgb) {
    const chan = (t: string): number | null => {
      const pct = /^(-?[\d.]+)%$/.exec(t);
      const n = pct ? Number(pct[1]) * 2.55 : Number(t);
      if (!Number.isFinite(n)) return null;
      return Math.max(0, Math.min(255, Math.round(n)));
    };
    const r = chan(rgb[1]), g = chan(rgb[2]), b = chan(rgb[3]);
    if (r === null || g === null || b === null) return null;
    const to2 = (n: number) => n.toString(16).padStart(2, "0");
    return { hex: `#${to2(r)}${to2(g)}${to2(b)}`, hadAlpha: rgb[4] !== undefined };
  }

  const hsl = /^hsla?\(\s*([^,\s/]+)[\s,]+([^,\s/]+)[\s,]+([^,\s/)]+)\s*(?:[,/]\s*([^)]+))?\)$/i.exec(value);
  if (hsl) {
    const h = Number(hsl[1].replace(/deg$/i, ""));
    const s = Number(hsl[2].replace(/%$/, "")) / 100;
    const l = Number(hsl[3].replace(/%$/, "")) / 100;
    if (![h, s, l].every(Number.isFinite)) return null;
    return { hex: hslToHex({ h, s, l }).toLowerCase(), hadAlpha: hsl[4] !== undefined };
  }

  return null;
}

// ── Fonts ────────────────────────────────────────────────────────────────────

function extractFonts(doc: ParsedDoc, notes: string[]): Field<ExtractedFont> {
  const props = customProperties(doc.css);
  const byProperty = new Map<string, CustomProperty>();
  for (const p of props) byProperty.set(p.name, p);

  const found = new Map<string, ExtractedFont>();
  const add = (font: ExtractedFont): void => {
    const key = font.family.toLowerCase();
    const prior = found.get(key);
    if (!prior) { found.set(key, font); return; }
    // Keep the entry that knows the most: a role beats no role, and usage
    // evidence beats a guess from a property name.
    const rank = (f: ExtractedFont) => (f.role ? 2 : 0) + (f.confidence === "high" ? 2 : f.confidence === "medium" ? 1 : 0);
    if (rank(font) > rank(prior)) found.set(key, { ...font, name: font.name ?? prior.name });
  };

  // Usage first, because a selector says what a face is FOR. `h1,h2,h3 {}`
  // is a display face by the author's own arrangement, and no name guess is
  // as good as that.
  for (const rule of declarationBlocks(doc.css)) {
    const decl = /(?:^|[;{\s])font-family\s*:\s*([^;}]{1,300})/i.exec(rule.body);
    if (!decl) continue;
    const resolved = resolveVars(decl[1].trim(), byProperty);
    if (!looksLikeFontStack(resolved.stack)) continue;
    const role = roleFromSelector(rule.selector) ?? roleFromStack(resolved.stack);
    add({
      family: primaryFamily(resolved.stack),
      stack: resolved.stack,
      role,
      name: resolved.viaProperty,
      origin: resolved.viaProperty ? "custom-property" : "font-family",
      evidence: `used by \`${truncate(rule.selector, 80)}\``,
      confidence: roleFromSelector(rule.selector) ? "high" : role ? "medium" : "low",
    });
  }

  // Then any custom property that holds a stack, used or not. A designer who
  // declares `--script` and never wires it up still meant it.
  for (const p of props) {
    if (!looksLikeFontStack(p.value)) continue;
    const role = roleFromStack(p.value) ?? roleFromName(p.name);
    add({
      family: primaryFamily(p.value),
      stack: p.value,
      role,
      name: p.name,
      origin: "custom-property",
      evidence: `declared as \`--${p.name}\``,
      confidence: role ? "medium" : "low",
    });
  }

  // Last, families a stylesheet link names. The link is read as text and is
  // never requested, so this says only "this document expects this face".
  for (const family of doc.linkedFamilies) {
    add({
      family,
      stack: `"${family}"`,
      role: null,
      name: null,
      origin: "stylesheet-link",
      evidence: "named by a webfont stylesheet link, which was not fetched",
      confidence: "low",
    });
  }

  const order: Record<FontRoleGuess | "none", number> = { display: 0, body: 1, accent: 2, none: 3 };
  const roleRank = (f: ExtractedFont): number => order[f.role ?? "none"];
  const items = Array.from(found.values())
    .sort((a, b) => roleRank(a) - roleRank(b) || a.family.localeCompare(b.family))
    .slice(0, LIMITS.fonts);

  if (doc.cssTruncated) {
    return {
      status: "unreadable",
      confidence: "none",
      note: "The stylesheet did not parse to the end, so this list may be missing faces.",
      items,
    };
  }
  if (items.length === 0) {
    return { status: "absent", confidence: "none", note: "The document parsed and names no font families.", items };
  }
  const withRole = items.filter((f) => f.role !== null).length;
  if (withRole === 0) notes.push("Font roles could not be read off usage. The families are listed without a display, body or accent guess.");
  return {
    status: "found",
    confidence: items.some((f) => f.confidence === "high") ? "high" : withRole > 0 ? "medium" : "low",
    note: `${items.length} font ${items.length === 1 ? "family" : "families"}, ${withRole} with a role read off how the document uses them.`,
    items,
  };
}

function looksLikeFontStack(value: string): boolean {
  if (value.length > 300) return false;
  // A stack has no function calls. This is what keeps `cubic-bezier(...)`,
  // `clamp(...)` and every gradient out of the font list.
  if (/[()]/.test(value)) return false;
  const parts = splitStack(value);
  if (parts.length === 0) return false;
  const last = parts[parts.length - 1].toLowerCase();
  if (GENERIC_FAMILIES.has(last)) return true;
  // A single quoted family with no generic fallback is still a stack.
  return parts.length >= 2 && /^["']/.test(value.trim());
}

function splitStack(value: string): string[] {
  return value
    .split(",")
    .map((p) => p.trim().replace(/^["']|["']$/g, "").trim())
    .filter((p) => p.length > 0 && p.length < 80);
}

function primaryFamily(stack: string): string {
  return splitStack(stack)[0] ?? stack.trim();
}

function roleFromSelector(selector: string): FontRoleGuess | null {
  const s = selector.toLowerCase();
  if (/(^|[\s,>+~])(h[1-6])\b/.test(s) || /\.(title|display|headline|hero|heading)\b/.test(s)) return "display";
  if (/(^|[\s,>+~])(body|html|p)\b/.test(s) || /\.(body|prose|note|copy|text)\b/.test(s)) return "body";
  if (/\.(script|signature|accent|hand|quote)\b/.test(s)) return "accent";
  return null;
}

function roleFromStack(stack: string): FontRoleGuess | null {
  const last = splitStack(stack).slice(-1)[0]?.toLowerCase() ?? "";
  if (last === "cursive" || last === "fantasy") return "accent";
  return null;
}

function roleFromName(name: string): FontRoleGuess | null {
  const n = name.toLowerCase();
  if (/script|hand|signature|accent|cursive/.test(n)) return "accent";
  if (/display|head|title|serif/.test(n)) return "display";
  if (/body|text|sans|base|copy/.test(n)) return "body";
  return null;
}

/** Replaces `var(--x)` with the property's value, once, without recursion. */
function resolveVars(value: string, byProperty: Map<string, CustomProperty>): { stack: string; viaProperty: string | null } {
  const single = /^var\(\s*--([a-zA-Z0-9_-]{1,64})\s*(?:,[^)]*)?\)$/.exec(value.trim());
  if (single) {
    const prop = byProperty.get(single[1]);
    if (prop) return { stack: prop.value, viaProperty: single[1] };
    return { stack: value, viaProperty: single[1] };
  }
  return { stack: value, viaProperty: null };
}

/**
 * Family names a webfont stylesheet link asks for. The href is read as text.
 * Nothing is requested, which is the whole point: a founder's file naming a
 * host we then call would turn an upload form into a request this server
 * makes on a stranger's behalf.
 */
function readStylesheetLinks(markup: string, notes: string[]): string[] {
  const families: string[] = [];
  const re = /<link\b([^>]{0,800})>/gi;
  let m: RegExpExecArray | null;
  let sawRemote = false;
  while ((m = re.exec(markup)) !== null) {
    const href = attribute(m[1], "href");
    if (!href) continue;
    if (!/^https?:\/\//i.test(href)) continue;
    sawRemote = true;
    if (!/^https:\/\/fonts\.googleapis\.com\//i.test(href)) continue;
    for (const fam of Array.from(href.matchAll(/[?&]family=([^&:]{1,80})/g))) {
      const name = decodeURIComponent(fam[1]).replace(/\+/g, " ").trim();
      if (name && !families.includes(name)) families.push(name);
    }
  }
  if (sawRemote) {
    notes.push("The document links remote stylesheets. Their URLs were read for font family names and were never fetched.");
  }
  return families.slice(0, LIMITS.fonts);
}

// ── Marks ────────────────────────────────────────────────────────────────────

const SVG_ELEMENTS = new Set([
  "svg", "g", "defs", "title", "desc", "path", "circle", "ellipse", "rect",
  "line", "polyline", "polygon", "lineargradient", "radialgradient", "stop",
]);

const SVG_ATTRS = new Set([
  "viewbox", "xmlns", "width", "height", "preserveaspectratio", "id",
  "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin",
  "stroke-dasharray", "stroke-dashoffset", "stroke-miterlimit", "stroke-opacity",
  "fill-rule", "fill-opacity", "clip-rule", "opacity", "color", "transform",
  "d", "points", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry",
  "offset", "stop-color", "stop-opacity", "gradientunits", "gradienttransform",
  "spreadmethod", "vector-effect", "paint-order", "role", "aria-label", "aria-hidden",
]);

/** Attributes long enough to be real geometry. Everything else stays short. */
const LONG_ATTRS = new Set(["d", "points"]);

/**
 * Elements whose CHILDREN go with them. Everything else outside the allow-list
 * is unwrapped: the element and its attributes are dropped, its children are
 * validated on their own terms and kept.
 *
 * The difference is a real mark. A designer's export wraps its paths in an
 * `<a href="...">` often enough that dropping the subtree throws the drawing
 * away and returns an empty lockup. Unwrapping keeps the paths and loses the
 * link, which is the answer wanted in both directions. These few carry a
 * payload in their children, so for those few the subtree is the danger.
 */
const DROP_SUBTREE = new Set(["script", "style", "foreignobject", "iframe", "object", "embed", "metadata", "annotation"]);

/**
 * SVG names are case-sensitive, and the allow-lists above are matched in lower
 * case. Emitting what was matched would hand back `<lineargradient viewbox=...>`,
 * which an HTML parser silently repairs and an XML one refuses. A caller who
 * writes the returned string to a `.svg` file gets the XML parser, so the
 * canonical spelling is restored on the way out.
 */
const CANONICAL_ELEMENT: Record<string, string> = {
  lineargradient: "linearGradient",
  radialgradient: "radialGradient",
};
const CANONICAL_ATTR: Record<string, string> = {
  viewbox: "viewBox",
  gradientunits: "gradientUnits",
  gradienttransform: "gradientTransform",
  spreadmethod: "spreadMethod",
  preserveaspectratio: "preserveAspectRatio",
};

function extractMarks(doc: ParsedDoc, notes: string[]): Field<ExtractedMark> {
  if (doc.format !== "html") {
    return {
      status: "absent",
      confidence: "none",
      note: `This is a ${doc.format} document, which carries no inline SVG.`,
      items: [],
    };
  }

  const blocks = findSvgBlocks(doc.markup, doc.markupLower);
  if (blocks.length >= LIMITS.svgBlocks) {
    notes.push(`The document has at least ${LIMITS.svgBlocks} SVG blocks. Only the first ${LIMITS.svgBlocks} were examined.`);
  }

  const bySignature = new Map<string, { mark: ExtractedMark; signature: string }>();

  for (const block of blocks) {
    const open = openingTag(block.source);
    if (!open) continue;
    const attrs = open.attrs;
    const clean = sanitizeSvg(block.source);
    const signature = clean.signature || `raw:${block.source.length}:${attrs["viewbox"] ?? ""}`;

    const existing = bySignature.get(signature);
    if (existing) {
      existing.mark.repeats += 1;
      // A later instance can carry context the first one lacked. The mark in a
      // page header sits above every heading in the document, so the copy that
      // sits under "The lotus" is the one that knows what it is called.
      existing.mark.label = existing.mark.label ?? labelOf(attrs, block.source);
      existing.mark.heading = existing.mark.heading ?? nearestHeading(doc.markup, block.start);
      existing.mark.declaredWidthPx = existing.mark.declaredWidthPx ?? declaredWidth(attrs);
      continue;
    }

    const mark: ExtractedMark = {
      svg: clean.svg,
      svgOmitted: clean.omitted,
      viewBox: attrs["viewbox"] ?? null,
      label: labelOf(attrs, block.source),
      heading: nearestHeading(doc.markup, block.start),
      declaredWidthPx: declaredWidth(attrs),
      repeats: 1,
      score: 0,
      reasons: [],
      confidence: "low",
    };
    bySignature.set(signature, { mark, signature });
  }

  const marks = Array.from(bySignature.values()).map(({ mark }, i) => scoreMark(mark, i === 0));
  marks.sort((a, b) => b.score - a.score || b.repeats - a.repeats);
  const items = marks.slice(0, LIMITS.marks);

  if (doc.svgTruncated) {
    return {
      status: "unreadable",
      confidence: "none",
      note: "An <svg> opened and never closed, so this list may be missing marks.",
      items,
    };
  }
  if (items.length === 0) {
    return { status: "absent", confidence: "none", note: "The document parsed and contains no inline SVG.", items };
  }
  const top = items[0];
  const confidence: Confidence = top.score >= 6 ? "high" : top.score >= 3 ? "medium" : "low";
  top.confidence = confidence;
  return {
    status: "found",
    confidence,
    note: `${items.length} distinct ${items.length === 1 ? "shape" : "shapes"}, ranked. The first is the primary mark guess and its reasons are listed on it.`,
    items,
  };
}

/**
 * The primary mark guess, argued and never asserted: every term is written
 * onto the mark so a reviewer can see what carried it. The terms are all
 * structural, so nothing here depends on any village's vocabulary.
 */
function scoreMark(mark: ExtractedMark, isFirstInDocument: boolean): ExtractedMark {
  let score = 0;
  const reasons: string[] = [];
  const bump = (n: number, why: string) => { score += n; reasons.push(`${n > 0 ? "+" : ""}${n} ${why}`); };

  if (mark.label) bump(3, "carries an accessible name, so the document treats it as content");
  if (mark.repeats >= 2) bump(2, `the same geometry appears ${mark.repeats} times`);
  if (mark.declaredWidthPx !== null && mark.declaredWidthPx >= 150) bump(2, `drawn at ${mark.declaredWidthPx}px`);
  else if (mark.declaredWidthPx !== null && mark.declaredWidthPx >= 100) bump(1, `drawn at ${mark.declaredWidthPx}px`);
  if (isFirstInDocument) bump(1, "first shape in the document");

  const box = parseViewBox(mark.viewBox);
  if (box && box.minX === 0 && box.minY === 0 && box.width === box.height && box.width <= 128) {
    bump(-3, "square icon grid at the origin, which is how icon sets are drawn");
  } else if (box && (box.minX !== 0 || box.minY !== 0)) {
    bump(1, "viewBox is offset from the origin, which is how a drawing tool exports one shape");
  }

  return { ...mark, score, reasons };
}

function parseViewBox(raw: string | null): { minX: number; minY: number; width: number; height: number } | null {
  if (!raw) return null;
  const n = raw.trim().split(/[\s,]+/).map(Number);
  if (n.length !== 4 || !n.every(Number.isFinite)) return null;
  return { minX: n[0], minY: n[1], width: n[2], height: n[3] };
}

function labelOf(attrs: Record<string, string>, source: string): string | null {
  const aria = attrs["aria-label"]?.trim();
  if (aria) return truncate(decodeEntities(aria), 120);
  const title = /<title\b[^>]{0,200}>([\s\S]{0,300}?)<\/title>/i.exec(source);
  if (title) {
    const text = decodeEntities(stripTags(title[1])).trim();
    if (text) return truncate(text, 120);
  }
  return null;
}

function declaredWidth(attrs: Record<string, string>): number | null {
  const style = attrs["style"];
  if (style) {
    const w = /(?:^|;)\s*width\s*:\s*([^;]{1,80})/i.exec(style);
    const px = w ? /(\d+(?:\.\d+)?)\s*px/.exec(w[1]) : null;
    if (px) return Math.round(Number(px[1]));
  }
  const attr = attrs["width"];
  if (attr) {
    const px = /^(\d+(?:\.\d+)?)(px)?$/i.exec(attr.trim());
    if (px) return Math.round(Number(px[1]));
  }
  return null;
}

function nearestHeading(markup: string, before: number): string | null {
  const region = markup.slice(Math.max(0, before - 4000), before);
  let last: string | null = null;
  const re = /<h([1-6])\b[^>]{0,300}>([\s\S]{0,500}?)<\/h\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(region)) !== null) last = m[2];
  if (last === null) return null;
  const text = decodeEntities(stripTags(last)).replace(/\s+/g, " ").trim();
  return text ? truncate(text, LIMITS.textChars) : null;
}

/**
 * Rebuilds an SVG from an allow-list of elements and attributes. This is a
 * construction, not a deletion: anything the allow-list does not name never
 * reaches the output, so a tag or an attribute nobody thought of when this
 * was written is dropped by default instead of passed through.
 *
 * What that removes on the guide this was written against: a `<script>`, a
 * `<image href="data:image/jpeg;base64,...">` holding a 169 KB texture, and
 * four `<use href="#glt">` that tile it. Reference-carrying elements are gone
 * as a class, so a `href` cannot become a request and a `style` cannot carry
 * a `url()`.
 */
function sanitizeSvg(source: string): { svg: string | null; omitted: ExtractedMark["svgOmitted"]; signature: string } {
  const out: string[] = [];
  const geometry: string[] = [];
  const stack: string[] = [];
  let skipDepth = 0;
  let skipping: string | null = null;
  let i = 0;
  let drawables = 0;

  while (i < source.length) {
    const lt = source.indexOf("<", i);
    if (lt === -1) break;

    // Text between tags survives only inside a title or a desc, which is the
    // only place an SVG carries words worth reading.
    if (lt > i && skipping === null) {
      const owner = stack[stack.length - 1];
      // Decoded, then escaped. Escaping the raw source would double-escape a
      // title that already reads `&lt;script&gt;` and show the entity itself.
      // Both are safe; only one is what the designer wrote.
      if (owner === "title" || owner === "desc") out.push(escapeText(decodeEntities(source.slice(i, lt))));
    }

    if (source.startsWith("<!--", lt)) {
      const end = source.indexOf("-->", lt + 4);
      i = end === -1 ? source.length : end + 3;
      continue;
    }
    if (source.startsWith("<!", lt) || source.startsWith("<?", lt)) {
      const end = source.indexOf(">", lt + 2);
      i = end === -1 ? source.length : end + 1;
      continue;
    }

    const gt = findTagEnd(source, lt);
    if (gt === -1) break;
    const inner = source.slice(lt + 1, gt);
    i = gt + 1;

    if (inner.startsWith("/")) {
      const name = inner.slice(1).trim().toLowerCase();
      if (skipping !== null) {
        if (name === skipping) {
          skipDepth -= 1;
          if (skipDepth === 0) skipping = null;
        }
        continue;
      }
      const at = stack.lastIndexOf(name);
      if (at === -1) continue;
      for (let k = stack.length - 1; k >= at; k--) out.push(`</${CANONICAL_ELEMENT[stack[k]] ?? stack[k]}>`);
      stack.length = at;
      continue;
    }

    const selfClosing = inner.endsWith("/");
    const body = selfClosing ? inner.slice(0, -1) : inner;
    const nameMatch = /^([a-zA-Z][a-zA-Z0-9:-]{0,40})/.exec(body);
    if (!nameMatch) continue;
    const name = nameMatch[1].toLowerCase();

    if (skipping !== null) {
      if (name === skipping && !selfClosing) skipDepth += 1;
      continue;
    }
    if (!SVG_ELEMENTS.has(name)) {
      // Unwrap by default, drop the subtree only for the few that hide their
      // payload in their children. Either way the element itself and every
      // attribute it carried are gone.
      if (!selfClosing && DROP_SUBTREE.has(name)) { skipping = name; skipDepth = 1; }
      continue;
    }

    const attrs = parseAttributes(body.slice(nameMatch[1].length));
    const kept: string[] = [];
    for (const [key, value] of Object.entries(attrs)) {
      if (!SVG_ATTRS.has(key)) continue;
      const safe = safeAttributeValue(key, value);
      if (safe === null) continue;
      kept.push(`${CANONICAL_ATTR[key] ?? key}="${escapeAttr(safe)}"`);
      if (LONG_ATTRS.has(key) || key === "cx" || key === "cy" || key === "r" || key === "points") {
        geometry.push(`${key}:${safe}`);
      }
    }
    if (name !== "svg" && name !== "g" && name !== "defs" && name !== "title" && name !== "desc") drawables += 1;

    const emitted = CANONICAL_ELEMENT[name] ?? name;
    const open = `<${emitted}${kept.length ? " " + kept.join(" ") : ""}`;
    if (selfClosing) out.push(`${open}/>`);
    else { out.push(`${open}>`); stack.push(name); }
  }

  for (let k = stack.length - 1; k >= 0; k--) out.push(`</${CANONICAL_ELEMENT[stack[k]] ?? stack[k]}>`);

  const svg = out.join("");
  const signature = geometry.join("|").slice(0, 4000) + `#${geometry.length}`;
  if (drawables === 0) return { svg: null, omitted: "nothing-drawable", signature };
  if (svg.length > LIMITS.markChars) return { svg: null, omitted: "too-large", signature };
  return { svg, omitted: null, signature };
}

/**
 * Rejects an attribute value that could reach outside the document. A local
 * paint reference (`url(#gradient)`) is the one function call allowed through,
 * because gradients are how a real mark is filled.
 */
function safeAttributeValue(key: string, value: string): string | null {
  const limit = LONG_ATTRS.has(key) ? 40_000 : 512;
  if (value.length > limit) return null;
  if (/[<>]/.test(value)) return null;
  // The one absolute URL that has to survive, because an SVG detached from its
  // page needs its namespace to render at all. Any other value here is dropped.
  if (key === "xmlns") return value.trim() === "http://www.w3.org/2000/svg" ? value.trim() : null;
  if (/[a-z][a-z0-9+.-]*:/i.test(value) && !/^\s*(#|[\d.,\s-])/.test(value)) {
    // Anything shaped like a scheme, which covers javascript:, data: and http:.
    if (!/^url\(#[A-Za-z0-9_.:-]{1,64}\)$/.test(value)) return null;
  }
  if (/url\(/i.test(value) && !/^url\(#[A-Za-z0-9_.:-]{1,64}\)$/.test(value)) return null;
  if (/&#|&[a-z]+;/i.test(value) && LONG_ATTRS.has(key)) return null;
  return value;
}

// ── Statements ───────────────────────────────────────────────────────────────

/**
 * Class tokens that mark a column of examples. Two names are deliberately
 * absent, and both were tempting:
 *
 *   `no`    the guide this was built from numbers its sections with
 *           `<span class="no">06</span>`, and a reader that treats that as an
 *           off-brand marker returns "06" as brand copy.
 *   `right` half the stylesheets on earth use it for text alignment, so it
 *           would turn every right-aligned paragraph into a brand statement.
 *
 * Both are pinned by tests, because the next person to widen this list will
 * reach for exactly these two.
 */
const POSITIVE_CLASS = /^(do|dos|good|yes|onbrand|on-brand|weare|we-are|always)$/;
/** `no` is deliberately absent: the guide this was built from numbers its
 *  sections with `<span class="no">06</span>`, and a reader that treats that
 *  as an off-brand example returns "06" as a brand statement. */
const NEGATIVE_CLASS = /^(dont|donts|do-not|dont-s|bad|offbrand|off-brand|never|avoid|not|wrong)$/;

/**
 * Label text, matched whole. `\b` was the first version and it read a heading
 * of "Do you want to visit?" as a "Do" column, then took the four paragraphs
 * under it as brand statements. A label element is a short label, so the whole
 * of it has to be the label.
 */
const POSITIVE_LABEL = /^(on[- ]?brand|we are|do|dos|do this|always|say this|yes|good)$/i;
const NEGATIVE_LABEL = /^(off[- ]?brand|we are not|we aren'?t|don'?ts?|do not|never|avoid|not this|say this instead|no)$/i;

function extractStatements(doc: ParsedDoc): Pick<BrandExtract, "tagline" | "weAre" | "weAreNot"> {
  if (doc.format !== "html") {
    const labelled = labelledLines(doc.text);
    return {
      tagline: statementField(labelled.tagline, "low", `Read from a labelled line in this ${doc.format} document.`, `This ${doc.format} document has no line labelled as a tagline.`),
      weAre: statementField(labelled.positive, "low", "Read from labelled lines.", `This ${doc.format} document has no line labelled as an on-brand example.`),
      weAreNot: statementField(labelled.negative, "low", "Read from labelled lines.", `This ${doc.format} document has no line labelled as an off-brand example.`),
    };
  }

  // Class tokens first. A designer who marks a column `do` and its twin
  // `dont` has already labelled the pair, and reading that beats reading prose.
  const byClass = { positive: [] as string[], negative: [] as string[] };
  const isVoiceColumn = (classes: string[]) => classes.some((t) => POSITIVE_CLASS.test(t) || NEGATIVE_CLASS.test(t));
  for (const el of elementsWithClass(doc, isVoiceColumn)) {
    const tokens = el.classes;
    if (tokens.some((t) => POSITIVE_CLASS.test(t))) byClass.positive.push(...phrasesIn(el.inner));
    else if (tokens.some((t) => NEGATIVE_CLASS.test(t))) byClass.negative.push(...phrasesIn(el.inner));
  }

  // Then a labelled block: a short element reading "On brand" with the
  // examples following it. Computed only when the class route came back
  // empty, because it walks the whole document a second time.
  const needsLabels = byClass.positive.length === 0 || byClass.negative.length === 0;
  const byLabel = needsLabels ? labelledBlocks(doc.markup) : { positive: [], negative: [] };

  const positive = dedupe(byClass.positive.length ? byClass.positive : byLabel.positive);
  const negative = dedupe(byClass.negative.length ? byClass.negative : byLabel.negative);
  const fromClass = byClass.positive.length > 0 || byClass.negative.length > 0;

  return {
    tagline: taglineField(doc),
    weAre: statementField(
      positive,
      fromClass ? "high" : "medium",
      fromClass ? "Read from an element the document marks as its on-brand column." : "Read from the block under an on-brand label.",
      "The document parsed and marks nothing as an on-brand example.",
    ),
    weAreNot: statementField(
      negative,
      fromClass ? "high" : "medium",
      fromClass ? "Read from an element the document marks as its off-brand column." : "Read from the block under an off-brand label.",
      "The document parsed and marks nothing as an off-brand example.",
    ),
  };
}

function statementField(items: string[], confidence: Confidence, foundNote: string, absentNote: string): Field<string> {
  const kept = items.slice(0, LIMITS.statements);
  if (kept.length === 0) return { status: "absent", confidence: "none", note: absentNote, items: [] };
  return { status: "found", confidence, note: foundNote, items: kept };
}

/**
 * Ranked tagline candidates. An explicitly named element wins, because the
 * class is the author saying which line it is. The first heading is next.
 * A "lead" or "intro" paragraph ranks below both: it is the opening
 * paragraph, which is a different job from the line a village puts on a sign.
 */
function taglineField(doc: ParsedDoc): Field<string> {
  const markup = doc.markup;
  const NAMED = /^(tagline|tag-line|strapline|slogan|motto)$/;
  const SECONDARY = /^(lead|subtitle|sub-title|intro|standfirst)$/;
  const named: string[] = [];
  const secondary: string[] = [];
  for (const el of elementsWithClass(doc, (cs) => cs.some((c) => NAMED.test(c) || SECONDARY.test(c)))) {
    const t = plainPhrase(el.inner);
    if (!t) continue;
    if (el.classes.some((c) => NAMED.test(c))) named.push(t);
    else secondary.push(t);
  }

  const headings: string[] = [];
  const h1 = /<h1\b[^>]{0,300}>([\s\S]{0,600}?)<\/h1>/gi;
  let m: RegExpExecArray | null;
  while ((m = h1.exec(markup)) !== null) {
    const t = plainPhrase(m[1]);
    // A document titled "Brand Guidelines" is describing itself. That is the
    // one heading that is never the village's line.
    if (t && !/\b(brand|style|visual|design)\s+(guide|guidelines|system|book)\b/i.test(t)) headings.push(t);
  }

  const labelled = labelledLines(doc.text).tagline;
  const items = dedupe([...named, ...labelled, ...headings, ...secondary]).slice(0, LIMITS.statements);
  if (items.length === 0) {
    return { status: "absent", confidence: "none", note: "The document parsed and carries no line that reads as a tagline.", items };
  }
  const confidence: Confidence = named.length > 0 ? "high" : headings.length > 0 ? "medium" : "low";
  return {
    status: "found",
    confidence,
    note:
      named.length > 0
        ? "The document names a tagline element, and that is the first candidate."
        : headings.length > 0
          ? "No element is named as a tagline, so the first candidate is the document's own top heading."
          : "The first candidate is an intro paragraph, which the document did not label as a tagline.",
    items,
  };
}

/** `Tagline: ...` and `We are not: ...`, the shape a plain-text brand note takes. */
function labelledLines(text: string): { tagline: string[]; positive: string[]; negative: string[] } {
  const tagline: string[] = [];
  const positive: string[] = [];
  const negative: string[] = [];
  for (const raw of text.split("\n").slice(0, 4000)) {
    const line = raw.trim();
    if (!line || line.length > 600) continue;
    const m = /^([A-Za-z][A-Za-z' -]{1,28})\s*[:\u2013-]\s*(.+)$/.exec(line);
    if (!m) continue;
    const label = m[1].trim();
    const value = m[2].trim();
    if (value.length < 3) continue;
    if (/^(tagline|tag line|strapline|slogan|motto)$/i.test(label)) tagline.push(truncate(value, LIMITS.textChars));
    else if (NEGATIVE_LABEL.test(label)) negative.push(truncate(value, LIMITS.textChars));
    else if (POSITIVE_LABEL.test(label)) positive.push(truncate(value, LIMITS.textChars));
  }
  return { tagline, positive, negative };
}

function labelledBlocks(markup: string): { positive: string[]; negative: string[] } {
  const positive: string[] = [];
  const negative: string[] = [];
  const re = /<(h[1-6]|div|p|span|strong|dt)\b[^>]{0,300}>([\s\S]{0,120}?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markup)) !== null) {
    // A label is read with its own floor. `plainPhrase` discards anything
    // under three characters, which is right for a statement and wrong for a
    // column headed "Do".
    const label = plainLabel(m[2]);
    if (!label || label.length > 40) continue;
    const target = NEGATIVE_LABEL.test(label) ? negative : POSITIVE_LABEL.test(label) ? positive : null;
    if (!target) continue;
    // Take what follows the label, up to the next label-sized element or the
    // end of the enclosing block, whichever comes first.
    target.push(...phrasesIn(markup.slice(m.index + m[0].length, m.index + m[0].length + 2000)).slice(0, 4));
  }
  return { positive, negative };
}

function phrasesIn(html: string): string[] {
  const out: string[] = [];
  const re = /<(p|li|blockquote|q)\b[^>]{0,300}>([\s\S]{0,1200}?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const t = plainPhrase(m[2]);
    if (t) out.push(t);
    if (out.length >= LIMITS.statements) break;
  }
  return out;
}

function plainLabel(html: string): string | null {
  const text = decodeEntities(stripTags(html)).replace(/\s+/g, " ").trim();
  return text.length >= 2 ? truncate(text, 60) : null;
}

function plainPhrase(html: string): string | null {
  const text = decodeEntities(stripTags(html)).replace(/\s+/g, " ").trim().replace(/^["“]|["”]$/g, "").trim();
  if (text.length < 3) return null;
  return truncate(text, LIMITS.textChars);
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

// ── Markup helpers ───────────────────────────────────────────────────────────

function stripHtmlComments(source: string): { text: string; truncated: boolean } {
  let out = "";
  let i = 0;
  while (i < source.length) {
    const open = source.indexOf("<!--", i);
    if (open === -1) { out += source.slice(i); break; }
    out += source.slice(i, open);
    const close = source.indexOf("-->", open + 4);
    if (close === -1) return { text: out, truncated: true };
    i = close + 3;
  }
  return { text: out, truncated: false };
}

function removeElement(source: string, tag: string): { text: string; unclosed: boolean } {
  const open = new RegExp(`<${tag}\\b`, "i");
  const close = `</${tag}>`;
  let out = "";
  let rest = source;
  for (let guard = 0; guard < 5000; guard++) {
    const m = open.exec(rest);
    if (!m) { out += rest; return { text: out, unclosed: false }; }
    out += rest.slice(0, m.index);
    const end = rest.toLowerCase().indexOf(close, m.index);
    if (end === -1) return { text: out, unclosed: true };
    rest = rest.slice(end + close.length);
  }
  return { text: out + rest, unclosed: false };
}

function collectElement(source: string, tag: string): { contents: string[]; remainder: string; unclosed: boolean } {
  const open = new RegExp(`<${tag}\\b([^>]{0,600})>`, "i");
  const close = `</${tag}>`;
  const contents: string[] = [];
  let remainder = "";
  let rest = source;
  for (let guard = 0; guard < 5000; guard++) {
    const m = open.exec(rest);
    if (!m) { remainder += rest; return { contents, remainder, unclosed: false }; }
    remainder += rest.slice(0, m.index);
    const from = m.index + m[0].length;
    const end = rest.toLowerCase().indexOf(close, from);
    if (end === -1) return { contents, remainder, unclosed: true };
    contents.push(rest.slice(from, end));
    rest = rest.slice(end + close.length);
  }
  return { contents, remainder: remainder + rest, unclosed: false };
}

function countTags(source: string, tag: string): { open: number; close: number } {
  const open = source.match(new RegExp(`<${tag}\\b`, "gi"))?.length ?? 0;
  const close = source.match(new RegExp(`</${tag}\\s*>`, "gi"))?.length ?? 0;
  return { open, close };
}

function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, " ");
}

function inlineStyleValues(markup: string): string {
  const out: string[] = [];
  for (const m of Array.from(markup.matchAll(/\sstyle\s*=\s*"([^"]{0,600})"/gi))) out.push(m[1]);
  for (const m of Array.from(markup.matchAll(/\sstyle\s*=\s*'([^']{0,600})'/gi))) out.push(m[1]);
  return out.join(";");
}

/**
 * Attribute values allowed to carry a colour. `data-hex` and its neighbours
 * are here because a swatch grid is how a brand guide states its palette out
 * loud: the guide this was built against tags each swatch `data-hex="#15604A"`
 * so a click can copy it, and that is the palette written down by hand.
 */
function paintAttributeValues(markup: string): string {
  const out: string[] = [];
  const dq = /\s(?:fill|stroke|stop-color|color|bgcolor|data-hex|data-color|data-colour|data-swatch)\s*=\s*"([^"]{0,120})"/gi;
  const sq = /\s(?:fill|stroke|stop-color|color|bgcolor|data-hex|data-color|data-colour|data-swatch)\s*=\s*'([^']{0,120})'/gi;
  for (const m of Array.from(markup.matchAll(dq))) out.push(m[1]);
  for (const m of Array.from(markup.matchAll(sq))) out.push(m[1]);
  return out.join("\n");
}

interface CssRule { selector: string; body: string }

/**
 * Declaration blocks, with at-rules walked into and never over. Written as
 * an index scan because a regex for balanced braces is a regex that eventually
 * meets a stylesheet it cannot handle.
 */
function declarationBlocks(css: string, depth = 0): CssRule[] {
  if (depth > 4) return [];
  const rules: CssRule[] = [];
  let i = 0;
  let selectorStart = 0;
  while (i < css.length && rules.length < 4000) {
    const open = css.indexOf("{", i);
    if (open === -1) break;
    let level = 1;
    let j = open + 1;
    while (j < css.length && level > 0) {
      const ch = css[j];
      if (ch === "{") level += 1;
      else if (ch === "}") level -= 1;
      j += 1;
    }
    const selector = css.slice(selectorStart, open).replace(/\s+/g, " ").trim();
    const body = css.slice(open + 1, Math.max(open + 1, j - 1));
    if (body.includes("{")) rules.push(...declarationBlocks(body, depth + 1));
    else rules.push({ selector, body });
    i = j;
    selectorStart = j;
  }
  return rules;
}

interface SvgBlock { source: string; start: number }

function findSvgBlocks(markup: string, lower: string): SvgBlock[] {
  const blocks: SvgBlock[] = [];
  let i = 0;
  while (blocks.length < LIMITS.svgBlocks) {
    const start = indexOfTag(lower, "svg", i);
    if (start === -1) break;
    let depth = 0;
    let k = start;
    let end = -1;
    while (k < markup.length) {
      const nextOpen = indexOfTag(lower, "svg", k + 1);
      const nextClose = lower.indexOf("</svg>", k + 1);
      if (nextClose === -1) break;
      if (nextOpen !== -1 && nextOpen < nextClose) { depth += 1; k = nextOpen; continue; }
      if (depth === 0) { end = nextClose + 6; break; }
      depth -= 1;
      k = nextClose;
    }
    if (end === -1) break;
    blocks.push({ source: markup.slice(start, end), start });
    i = end;
  }
  return blocks;
}

/** `lower` must already be lower case. See `ParsedDoc.markupLower`. */
function indexOfTag(lower: string, tag: string, from: number): number {
  const needle = `<${tag}`;
  let i = from;
  while (i < lower.length) {
    const at = lower.indexOf(needle, i);
    if (at === -1) return -1;
    const after = lower[at + needle.length];
    if (after === undefined || after === ">" || after === "/" || /\s/.test(after)) return at;
    i = at + needle.length;
  }
  return -1;
}

function openingTag(source: string): { attrs: Record<string, string> } | null {
  const end = findTagEnd(source, 0);
  if (end === -1) return null;
  const inner = source.slice(1, end).replace(/\/$/, "");
  const nameMatch = /^([a-zA-Z][a-zA-Z0-9:-]{0,40})/.exec(inner);
  if (!nameMatch) return null;
  return { attrs: parseAttributes(inner.slice(nameMatch[1].length)) };
}

/** The `>` that ends a tag, skipping any inside a quoted attribute value. */
function findTagEnd(source: string, from: number): number {
  let quote: string | null = null;
  for (let i = from + 1; i < source.length; i++) {
    const ch = source[i];
    if (quote) { if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === ">") return i;
  }
  return -1;
}

function parseAttributes(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z_:][a-zA-Z0-9_.:-]{0,60})\s*(?:=\s*(?:"([^"]{0,60000})"|'([^']{0,60000})'|([^\s"'>]{0,2000})))?/g;
  let m: RegExpExecArray | null;
  let count = 0;
  while ((m = re.exec(source)) !== null && count < 80) {
    if (!m[1]) continue;
    count += 1;
    attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  }
  return attrs;
}

function attribute(tagBody: string, name: string): string | null {
  return parseAttributes(tagBody)[name.toLowerCase()] ?? null;
}

interface ClassedElement { classes: string[]; inner: string }

/**
 * Elements carrying a class, with their inner markup. Depth counting on the
 * tag name, so a column of examples comes back whole.
 */
function elementsWithClass(doc: ParsedDoc, wanted: (classes: string[]) => boolean): ClassedElement[] {
  const { markup, markupLower } = doc;
  const out: ClassedElement[] = [];
  const skip = new Set(["svg", "path", "br", "img", "input", "hr", "meta", "link", "script", "style"]);
  let i = 0;
  // An index scan, in place of one big regex. A pattern of the shape
  // `<tag[^>]{0,600}class="..."[^>]{0,600}>` has two ambiguous bounded runs
  // over the same characters, and on a 330 KB guide that is a lot of
  // backtracking to hand a stranger's upload.
  //
  // `wanted` runs before the inner markup is built, on purpose. Finding an
  // element's closing tag is a forward scan, and running one for all 2,000
  // classed elements in a real guide costs more than the whole rest of this
  // module put together.
  while (i < markup.length && out.length < 2000) {
    const lt = markup.indexOf("<", i);
    if (lt === -1) break;
    const nameMatch = /^<([a-zA-Z][a-zA-Z0-9-]{0,20})/.exec(markup.slice(lt, lt + 24));
    if (!nameMatch) { i = lt + 1; continue; }
    const gt = findTagEnd(markup, lt);
    if (gt === -1) break;
    i = gt + 1;
    const tag = nameMatch[1].toLowerCase();
    if (skip.has(tag)) continue;
    const classAttr = parseAttributes(markup.slice(lt + 1 + nameMatch[1].length, gt))["class"];
    if (!classAttr) continue;
    const classes = classAttr.split(/\s+/).map((c) => c.toLowerCase()).filter(Boolean);
    if (classes.length === 0 || !wanted(classes)) continue;
    const inner = innerHtml(markup, markupLower, tag, gt + 1);
    if (inner === null) continue;
    out.push({ classes, inner });
  }
  return out;
}

function innerHtml(markup: string, lower: string, tag: string, from: number): string | null {
  let depth = 0;
  let i = from;
  for (let guard = 0; guard < 5000; guard++) {
    const nextOpen = indexOfTag(lower, tag, i);
    const nextClose = indexOfCloseTag(lower, tag, i);
    if (nextClose === -1) return null;
    if (nextOpen !== -1 && nextOpen < nextClose) { depth += 1; i = nextOpen + tag.length + 1; continue; }
    if (depth === 0) return markup.slice(from, nextClose);
    depth -= 1;
    i = nextClose + tag.length + 2;
  }
  return null;
}

/** `lower` must already be lower case. See `ParsedDoc.markupLower`. */
function indexOfCloseTag(lower: string, tag: string, from: number): number {
  const needle = `</${tag}`;
  let i = from;
  while (i < lower.length) {
    const at = lower.indexOf(needle, i);
    if (at === -1) return -1;
    const after = lower[at + needle.length];
    if (after === undefined || after === ">" || /\s/.test(after)) return at;
    i = at + needle.length;
  }
  return -1;
}

function htmlToText(markup: string): string {
  const withBreaks = markup
    .replace(/<\s*(br|hr)\b[^>]{0,200}>/gi, "\n")
    .replace(/<\/\s*(p|div|section|header|footer|li|h[1-6]|tr|td|blockquote|article|main|ul|ol|dl|dt|dd)\s*>/gi, "\n")
    .replace(/<\s*(p|div|section|header|footer|li|h[1-6]|tr|td|blockquote|article|main|ul|ol|dl|dt|dd)\b[^>]{0,600}>/gi, "\n");
  return decodeEntities(stripTags(withBreaks))
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .join("\n");
}

function stripTags(html: string): string {
  return html.replace(/<[^>]{0,4000}>/g, " ");
}

const NAMED_ENTITIES: Record<string, string> = {
  // The non-ASCII values are written as escapes. They are DATA, and a literal
  // em-dash sitting in a source file is the thing the house writing rules ban.
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  nbsp: "\u00A0", mdash: "\u2014", ndash: "\u2013",
  hellip: "\u2026", rsquo: "\u2019", lsquo: "\u2018",
  ldquo: "\u201C", rdquo: "\u201D", middot: "\u00B7",
  times: "\u00D7", copy: "\u00A9", reg: "\u00AE",
  deg: "\u00B0", eacute: "\u00E9",
};

/**
 * Decoded once, on the way to plain TEXT only. Nothing decoded here is ever
 * re-emitted as markup, which is what keeps `&lt;script&gt;` from becoming a
 * script on the way back out.
 */
function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]{1,6}|[a-zA-Z]{2,12});/g, (whole, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return whole;
      try { return String.fromCodePoint(code); } catch { return whole; }
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

function escapeText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max).trimEnd();
}

// ── Empty results ────────────────────────────────────────────────────────────

/** Every field unfilled, in importance order, so a caller can still ask. */
function allUnfilled(because: "absent" | "unreadable"): UnfilledField[] {
  const rank: Record<Importance, number> = { critical: 0, important: 1, optional: 2 };
  return FIELD_ORDER
    .map((field) => ({ field, importance: FIELD_META[field].importance, because, ask: FIELD_META[field].ask }))
    .sort((a, b) => rank[a.importance] - rank[b.importance]);
}

function allUnreadable(format: SourceFormat, note: string, reasons: string[]): BrandExtract {
  const field = <T,>(): Field<T> => ({ status: "unreadable", confidence: "none", note, items: [] });
  return {
    status: "unreadable",
    format,
    verdict: {
      kind: "unreadable",
      headline: "This file could not be read, so nothing here says what it contains.",
      reasons,
      filled: [],
      unfilled: allUnfilled("unreadable"),
      observations: [],
      coverage: 0,
    },
    notes: [note],
    colors: field<ExtractedColor>(),
    fonts: field<ExtractedFont>(),
    marks: field<ExtractedMark>(),
    tagline: field<string>(),
    weAre: field<string>(),
    weAreNot: field<string>(),
  };
}

function allAbsent(format: SourceFormat, note: string, reasons: string[]): BrandExtract {
  const field = <T,>(): Field<T> => ({ status: "absent", confidence: "none", note, items: [] });
  return {
    status: "ok",
    format,
    verdict: {
      kind: "empty",
      headline: "This file parsed and carries no brand information.",
      reasons,
      filled: [],
      unfilled: allUnfilled("absent"),
      observations: [],
      coverage: 0,
    },
    notes: [note],
    colors: field<ExtractedColor>(),
    fonts: field<ExtractedFont>(),
    marks: field<ExtractedMark>(),
    tagline: field<string>(),
    weAre: field<string>(),
    weAreNot: field<string>(),
  };
}
