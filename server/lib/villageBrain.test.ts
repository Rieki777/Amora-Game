/**
 * Pure-function tests for the village brain (S74).
 *
 * The rendering half is where the privacy rules actually land: `people` names
 * members and `legal` names title holders, and a markdown endpoint written
 * without an audience filter would have shipped both to anyone signed in.
 */
import { describe, expect, it } from "vitest";
import { BRIEF_SECTIONS, MINIMUM_BRIEF } from "../../shared/villageBrief";
import {
  capMarkdown,
  estimateTokens,
  renderIndexMarkdown,
  renderSectionMarkdown,
  slugify,
  type BriefRow,
  type RecordSummary,
} from "./villageBrain";

const brief = (over: Partial<BriefRow>): BriefRow => ({
  id: "brief-aims",
  section: "aims",
  title: "What this project is for",
  body: "Food sovereignty, water security, and a place guests can arrive into.",
  audience: "member",
  source: "session0",
  status: "confirmed",
  confirmedBy: "rye",
  confirmedAt: "2026-08-14T09:22:00.000Z",
  revision: 2,
  updatedAt: "2026-08-14T09:22:00.000Z",
  ...over,
});

describe("the section registry", () => {
  it("names a minimum viable brain of exactly three sections", () => {
    // A first session targets these and stops. A founder must be able to leave
    // with a usable game, so this is not the whole registry by design.
    expect(MINIMUM_BRIEF).toEqual(["work", "people", "constraints"]);
  });

  it("keeps the sections that name people admin-only", () => {
    const byId = Object.fromEntries(BRIEF_SECTIONS.map((s) => [s.id, s.audience]));
    expect(byId.people).toBe("admin");
    expect(byId.legal).toBe("admin");
    expect(byId.constraints).toBe("admin");
    expect(byId.economy).toBe("admin");
  });

  it("gives every section an ask, so a blank one can be filled in conversation", () => {
    for (const s of BRIEF_SECTIONS) {
      expect(s.ask.length).toBeGreaterThan(30);
      expect(s.feeds.length).toBeGreaterThan(20);
    }
  });

  it("has unique ids", () => {
    expect(new Set(BRIEF_SECTIONS.map((s) => s.id)).size).toBe(BRIEF_SECTIONS.length);
  });
});

describe("slugify", () => {
  it("keeps only lowercase, digits and hyphens", () => {
    expect(slugify("Water Rights: the Well (2026)")).toBe("water-rights-the-well-2026");
  });

  it("cannot produce a path", () => {
    // This becomes an export filename. A slug built from typed text is a path
    // traversal waiting for someone to notice.
    expect(slugify("../../etc/passwd")).toBe("etc-passwd");
    expect(slugify("a/b\\c")).toBe("a-b-c");
  });

  it("falls back when the input has nothing usable", () => {
    expect(slugify("!!!", "entry")).toBe("entry");
    expect(slugify("")).toBe("entry");
  });

  it("bounds the length", () => {
    expect(slugify("x".repeat(400)).length).toBeLessThanOrEqual(100);
  });
});

describe("capMarkdown", () => {
  it("leaves a short document alone", () => {
    expect(capMarkdown("# Small\n\nbody", 400)).toBe("# Small\n\nbody");
  });

  it("cuts on a line boundary and says it cut", () => {
    const long = Array.from({ length: 300 }, (_, i) => `- line number ${i}`).join("\n");
    const out = capMarkdown(long, 100);
    expect(estimateTokens(out)).toBeLessThanOrEqual(100);
    expect(out).toContain("[truncated]");
    expect(out).not.toMatch(/- line number \d+\[truncated\]/);
  });
});

describe("renderSectionMarkdown", () => {
  it("states how far to trust the section, before its body", () => {
    const md = renderSectionMarkdown(brief({ section: "work", status: "proposed", source: "intake", confirmedBy: null }));
    expect(md.startsWith("---\n")).toBe(true);
    expect(md).toContain("section: work");
    expect(md).toContain("status: proposed");
    expect(md).toContain("source: intake");
    expect(md).not.toContain("confirmed_by:");
  });

  it("names the confirming human when there is one", () => {
    expect(renderSectionMarkdown(brief({}))).toContain("confirmed_by: rye");
  });
});

describe("renderIndexMarkdown", () => {
  it("lists blank sections, because the blanks are the point", () => {
    const md = renderIndexMarkdown([brief({})], [], "admin");
    expect(md).toContain("**membership**");
    expect(md).toContain("not yet written");
    expect(md).toContain("Still blank:");
  });

  it("says which sections are confirmed and which are only proposed", () => {
    const md = renderIndexMarkdown(
      [brief({ section: "aims", status: "confirmed" }), brief({ section: "work", status: "proposed" })],
      [],
      "admin",
    );
    expect(md).toMatch(/\*\*aims\*\*[^\n]*confirmed/);
    expect(md).toMatch(/\*\*work\*\*[^\n]*proposed, not yet confirmed/);
  });

  it("never shows a member the sections that name people", () => {
    const md = renderIndexMarkdown([brief({ section: "people", audience: "admin" })], [], "member");
    expect(md).not.toContain("**people**");
    expect(md).not.toContain("**legal**");
    expect(md).toContain("**aims**");
  });

  it("rolls the record up to counts, so a year of history cannot blow the budget", () => {
    const records: RecordSummary[] = [
      { section: "calls", entries: 214, recent: ["Water rights", "Dues", "Guest policy"] },
    ];
    const md = renderIndexMarkdown([brief({})], records, "admin");
    expect(md).toContain("214 entries");
    expect(md).toContain("Water rights");
    expect(estimateTokens(md)).toBeLessThan(400);
  });

  it("says entry, singular, for one", () => {
    const md = renderIndexMarkdown([], [{ section: "calls", entries: 1, recent: ["Water rights"] }], "admin");
    expect(md).toContain("1 entry");
  });

  it("fits the always-present budget on a fresh fork", () => {
    // Every section blank is the worst case for the index, and it is also the
    // state every new village starts in.
    expect(estimateTokens(renderIndexMarkdown([], [], "admin"))).toBeLessThanOrEqual(400);
  });
});
