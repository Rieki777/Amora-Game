/**
 * Selection tests for Maia's shelves (S71/S72).
 *
 * These run against the REAL shipped files, because both bugs being fixed were
 * invisible to any synthetic fixture:
 *
 *   S71: the old tokenizer dropped every term under four characters and every
 *   term starting with a digit, so "how do we handle tax", "what is NVC" and
 *   "is 508(c)(1)(A) legit" either consulted nothing or consulted the wrong
 *   document with confidence.
 *
 *   S72: `docs/modules/` holds two CRITIQUE files, two platform notes and one
 *   doc for a module that does not ship. A directory glob would have let her
 *   answer "should we turn on the exchange?" by quoting a critique of its own
 *   design back to a founder.
 *
 * If someone rewrites the scoring again, these are the queries and the
 * exclusions that must keep holding.
 */
import { describe, expect, it } from "vitest";
import { MODULES } from "../../shared/modules";
import {
  MODULE_DOCS,
  SHELF_BUDGET,
  estimateTokens,
  expandPlurals,
  indexDoc,
  loadShelves,
  modulesWithoutContracts,
  rank,
  rankSyntheses,
  relevantDocs,
  relevantSections,
  sectionCitation,
  shelfDocs,
  splitSections,
  tokenize,
  type SynthesisRow,
} from "./knowledge";

const loaded = loadShelves(process.cwd());

/** Top document keys for a question, literature shelf only unless told otherwise. */
const keys = (query: string, opts?: Parameters<typeof relevantSections>[1]) =>
  relevantSections(query, { shelves: ["knowledge"], ...(opts ?? {}) }).map((s) => s.docKey);

describe("the shared brain loads", () => {
  it("splits both shelves into sections", () => {
    expect(loaded.knowledge).toBeGreaterThan(7);
    expect(loaded.modules).toBeGreaterThan(8);
  });

  it("lists the literature by document", () => {
    expect(shelfDocs("knowledge").map((d) => d.key)).toContain("legal-structures");
    expect(shelfDocs("knowledge").every((d) => d.sectionCount > 0)).toBe(true);
  });

  it("keys module contracts by MODULE ID, never by filename", () => {
    const moduleKeys = shelfDocs("modules").map((d) => d.key);
    expect(moduleKeys).toContain("exchange"); // the file is internal-exchange.md
    expect(moduleKeys).toContain("map"); // the file is village-map.md
    expect(moduleKeys).not.toContain("internal-exchange");
    expect(moduleKeys).not.toContain("village-map");
  });

  it("every allowlisted contract actually loaded", () => {
    expect(shelfDocs("modules").map((d) => d.key).sort()).toEqual(Object.keys(MODULE_DOCS).sort());
  });
});

describe("the module shelf is an allowlist, not a glob", () => {
  it("never loads the CRITIQUE documents", () => {
    // A critique of the economy's design is not a description of the product,
    // and quoting one to a founder deciding whether to enable a module is the
    // failure this allowlist exists to prevent.
    const titles = shelfDocs("modules").map((d) => `${d.key} ${d.title}`.toLowerCase());
    expect(titles.some((t) => t.includes("critique"))).toBe(false);
  });

  it("never loads docs for modules that do not ship", () => {
    expect(shelfDocs("modules").map((d) => d.key)).not.toContain("crowdpool-dashboard");
    expect(shelfDocs("modules").map((d) => d.key)).not.toContain("module-framework");
  });

  it("no module contract can be reached by a question, if it was not allowlisted", () => {
    const reached = relevantSections("crowdpool dashboard contributions critique of the economy", {
      shelves: ["modules"],
      budget: { maxSections: 6 },
    });
    for (const s of reached) expect(Object.keys(MODULE_DOCS)).toContain(s.docKey);
  });

  it("names the modules that ship no contract, so she can say so", () => {
    const uncovered = modulesWithoutContracts(MODULES.map((m) => m.id));
    expect(uncovered).toContain("commerce");
    expect(uncovered).toContain("forum");
    expect(uncovered).not.toContain("exchange");
    // Every module is either covered or named. Nothing falls between.
    expect(uncovered.length + Object.keys(MODULE_DOCS).length).toBe(MODULES.length);
  });
});

describe("relevantSections: the terms that used to be invisible", () => {
  it("'tax' selects legal-structures (three characters, scored nothing before)", () => {
    expect(keys("how do we handle tax")).toContain("legal-structures");
  });

  it("'NVC' selects nvc-and-conflict (it ranked dead last before)", () => {
    expect(keys("what is NVC")[0]).toBe("nvc-and-conflict");
  });

  it("'508(c)(1)(A)' selects legal-structures, where its scam warnings live", () => {
    // Maia's system prompt forbids softening these warnings. She cannot repeat
    // them if the term never selects the document that holds them.
    expect(keys("is 508(c)(1)(A) legit for our village?")[0]).toBe("legal-structures");
    expect(keys("should we set up a 508c1a?")[0]).toBe("legal-structures");
  });

  it("'LLC' selects legal-structures", () => {
    expect(keys("what LLC should we form")[0]).toBe("legal-structures");
  });

  it("'DAO' selects decentralized-governance", () => {
    expect(keys("DAO governance")[0]).toBe("decentralized-governance");
  });
});

describe("relevantSections: ranking and refusal", () => {
  it("routes ordinary questions to the document that owns them", () => {
    expect(keys("how do we make decisions when someone objects")[0]).toBe("sociocracy");
    expect(keys("how do we price membership dues")[0]).toBe("membership-and-economics");
  });

  it("still selects on vocabulary every document shares", () => {
    expect(keys("consent vs consensus")).toContain("sociocracy");
  });

  it("returns nothing for a question of pure function words", () => {
    expect(keys("what should we do")).toEqual([]);
  });

  it("returns nothing for a question off every shelf", () => {
    expect(relevantSections("how do I bake sourdough")).toEqual([]);
  });
});

describe("relevantSections: the module shelf answers module questions", () => {
  it("a question about the exchange reaches the exchange contract", () => {
    const hits = relevantSections("should we turn on the exchange, and what does it do?", {
      shelves: ["modules"],
    });
    expect(hits.map((s) => s.docKey)).toContain("exchange");
  });

  it("an off module is still reachable, because that is the question being asked", () => {
    // Filtering the shelf to modules that are ON would hide exactly the
    // contract a founder needs when deciding whether to enable one.
    const hits = relevantSections("what does the material library do with deposits?", {
      shelves: ["modules"],
    });
    expect(hits.map((s) => s.docKey)).toContain("library");
  });

  it("moduleKeys narrows the shelf when a caller wants only what is on", () => {
    const hits = relevantSections("what does the material library do with deposits?", {
      shelves: ["modules"],
      moduleKeys: ["map", "badges"],
    });
    expect(hits.map((s) => s.docKey)).not.toContain("library");
  });

  it("cites a section, not just a document", () => {
    const hits = relevantSections("how does the exchange price tokens", { shelves: ["modules"] });
    expect(hits.length).toBeGreaterThan(0);
    expect(sectionCitation(hits[0])).toContain(">");
  });

  /*
   * LANE Q: a citation says WHOSE WORDS it is quoting.
   *
   * `moduleDocProvenance.ts` has been the mechanism since Lane C (a document
   * declares its provenance in its own text, and one that declares nothing
   * cannot join the module shelf), and the last line of the wiring lived in
   * this file, which belonged to another lane at the time. Without it, every
   * section cited as `Title > Heading`, which reads as "sourced and shipped
   * with the platform". True of every document on the shelf today; false and
   * SILENTLY false the first time a listing's own contract joins it, when a
   * village would receive a vendor's description of a vendor's product in the
   * same voice as the platform's own contract for quests.
   */
  it("appends nothing for the platform's own documents, so today's shelf is unchanged", () => {
    const hits = relevantSections("how does the exchange price tokens", { shelves: ["modules"] });
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) {
      // Every shipped module contract declares `Provenance: platform`, and
      // silence means ours: the citation is exactly what it always was.
      expect(h.provenance).toEqual({ source: "platform" });
      expect(sectionCitation(h)).toBe(h.heading ? `${h.docTitle} > ${h.heading}` : h.docTitle);
      expect(sectionCitation(h)).not.toContain("written by");
    }
  });

  it("names the author when a document is not the platform's own", () => {
    // Built rather than read off disk: no vendor document ships yet, and the
    // point of wiring this now is that the day one is added the citation is
    // already honest. This is the shape `readProvenance` produces.
    const vendorSection = {
      shelfId: "modules" as const,
      docKey: "signals",
      docTitle: "Signals capture",
      heading: "What it does",
      body: "Reads a feed and writes a row.",
      tokens: 8,
      provenance: { source: "vendor" as const, author: "Example Systems Ltd" },
    };
    expect(sectionCitation(vendorSection)).toBe("Signals capture > What it does (written by Example Systems Ltd)");
    // The heading-less preamble case carries it too.
    expect(sectionCitation({ ...vendorSection, heading: "" })).toBe("Signals capture (written by Example Systems Ltd)");
  });

  it("stays quiet for a document that declares nothing", () => {
    // The literature shelf carries no provenance markers and must be
    // unaffected: a missing declaration reads the same as the platform's own.
    const hits = relevantSections("what is nonviolent communication", { shelves: ["knowledge"] });
    expect(hits.length).toBeGreaterThan(0);
    expect(sectionCitation(hits[0])).not.toContain("written by");
  });
});

describe("retrieval is two stage, and each stage earns its keep", () => {
  it("stage one picks the document, so one lucky section cannot hijack a question", () => {
    // Ranking sections directly answered "should we turn on the exchange?" from
    // the health dashboard, because `turn` appeared in 2 sections and
    // `exchange` in 27. Documents are big and topical; sections are not.
    expect(relevantDocs("should we turn on the exchange, and what does it do?", { shelves: ["modules"] })[0].key)
      .toBe("exchange");
  });

  it("every returned section belongs to a document stage one chose", () => {
    const q = "how does the material library handle deposits";
    const chosen = new Set(relevantDocs(q).map((d) => `${d.shelfId}:${d.key}`));
    for (const s of relevantSections(q)) expect(chosen.has(`${s.shelfId}:${s.docKey}`)).toBe(true);
  });

  it("a document NAMED for the term beats one that merely mentions it", () => {
    // stays.md talks about work-exchange quests, so it holds the word
    // "exchange" without being about the exchange. BM25 saturates term
    // frequency, so only an identity bonus can express the difference.
    const keys2 = relevantDocs("exchange", { shelves: ["modules"] }).map((d) => d.key);
    expect(keys2[0]).toBe("exchange");
    const libKeys = relevantDocs("material library", { shelves: ["modules"] }).map((d) => d.key);
    expect(libKeys[0]).toBe("library");
  });

  it("generic verbs never select a document", () => {
    // `set` appears in exactly 5 of the 42 literature sections, the same as
    // `508c1a`, so document frequency alone cannot tell them apart.
    expect(keys("should we set up a 508c1a?")[0]).toBe("legal-structures");
    expect(tokenize("set up turn on")).toEqual(["set", "up", "turn", "on"]);
    // Those four tokens are all stopwords, so a question of only them selects
    // nothing at all.
    expect(relevantSections("set it up and turn it on")).toEqual([]);
  });
});

describe("expandPlurals", () => {
  it("folds onto forms the collection actually uses", () => {
    const docs2 = [indexDoc("a", "the deposit is escrowed"), indexDoc("b", "unrelated")];
    expect(expandPlurals(["deposits"], docs2)).toContain("deposit");
  });

  it("never invents a form the collection does not have", () => {
    // Generic stemming would turn "process" into "proces". Checking the
    // vocabulary first means a variant only appears when a document uses it.
    const docs2 = [indexDoc("a", "the process is slow")];
    expect(expandPlurals(["process"], docs2)).toEqual(["process"]);
  });

  it("lets a plural question reach a singular document", () => {
    const docs2 = [indexDoc("deposits-doc", "each loan takes a refundable deposit"), indexDoc("other", "compost and water")];
    expect(rank(docs2, "how do deposits work", 2)[0]).toBe("deposits-doc");
  });
});

describe("the prompt budget holds", () => {
  // A question deliberately worded to match a lot, across both shelves.
  const broad = "governance conflict membership legal economics tokens roles circles quests badges stays library exchange health";

  it("never exceeds the token budget", () => {
    const hits = relevantSections(broad);
    const total = hits.reduce((a, s) => a + s.tokens, 0);
    expect(total).toBeLessThanOrEqual(SHELF_BUDGET.maxTokens);
  });

  it("never exceeds the section count", () => {
    expect(relevantSections(broad).length).toBeLessThanOrEqual(SHELF_BUDGET.maxSections);
  });

  it("never takes more than three sections from one document", () => {
    const counts = new Map<string, number>();
    for (const s of relevantSections(broad)) {
      const k = `${s.shelfId}:${s.docKey}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    for (const n of counts.values()) expect(n).toBeLessThanOrEqual(SHELF_BUDGET.maxPerDoc);
  });

  it("caps a single oversized section instead of letting it eat the budget", () => {
    for (const s of relevantSections(broad)) {
      expect(s.tokens).toBeLessThanOrEqual(SHELF_BUDGET.sectionTokenCap);
    }
  });

  it("a tighter budget is honoured", () => {
    const hits = relevantSections(broad, { budget: { maxTokens: 400, maxSections: 2 } });
    expect(hits.length).toBeLessThanOrEqual(2);
    expect(hits.reduce((a, s) => a + s.tokens, 0)).toBeLessThanOrEqual(400);
  });
});

describe("splitSections", () => {
  it("splits on ## and ###, keeping the heading with its body", () => {
    const secs = splitSections("# Title\n\nOpening line.\n\n## First\n\nbody one\n\n### Nested\n\nbody two\n");
    expect(secs.map((s) => s.heading)).toEqual(["", "First", "Nested"]);
    expect(secs[0].text).toContain("Opening line.");
    expect(secs[1].text).toContain("body one");
  });

  it("keeps the preamble, so a document's framing is never lost", () => {
    const secs = splitSections("# Title\n\nWhy this exists.\n\n## Detail\n\nx\n");
    expect(secs[0].text).toContain("Why this exists.");
  });

  it("ignores # and #### so only real section boundaries split", () => {
    const secs = splitSections("# Title\n\na\n\n#### Deep\n\nb\n");
    expect(secs.length).toBe(1);
  });

  it("drops empty sections", () => {
    expect(splitSections("\n\n   \n").length).toBe(0);
  });
});

describe("estimateTokens", () => {
  it("is four characters per token, deterministic", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
    expect(estimateTokens("")).toBe(0);
  });
});

describe("tokenize", () => {
  it("keeps short and digit-leading terms, and compacts punctuation-joined ones", () => {
    // Function words survive tokenizing and are filtered at the qualifying gate
    // instead, so they can still contribute to ranking.
    expect(tokenize("is 508(c)(1)(A) an LLC or a co-op?")).toEqual([
      "is", "508", "508c1a", "an", "llc", "or", "co", "op", "coop",
    ]);
  });

  it("drops single characters", () => {
    expect(tokenize("a b cd")).toEqual(["cd"]);
  });

  it("does not compact a URL into a term", () => {
    expect(tokenize("https://example.org/508c1a-churches/separating-fact-from-marketing")).not.toContain(
      "httpsexampleorg508c1achurchesseparatingfactfrommarketing",
    );
  });
});

describe("rank", () => {
  it("matches whole words, never substrings", () => {
    // The old scorer counted `hay.split(w)`, so "art" scored against "start"
    // and "party" and quietly poisoned every short query.
    const docs = [indexDoc("a", "start the party at the start"), indexDoc("b", "the art of it")];
    expect(rank(docs, "art", 2)).toEqual(["b"]);
  });

  it("keeps input order for ties, so callers get recency as the tiebreak", () => {
    const docs = [indexDoc("newest", "compost toilets"), indexDoc("older", "compost toilets")];
    expect(rank(docs, "compost", 2)).toEqual(["newest", "older"]);
  });

  it("drops matches far below the best one", () => {
    const docs = [
      indexDoc("strong", "compost compost compost compost compost toilets"),
      indexDoc("weak", `compost ${"filler ".repeat(400)}`),
    ];
    expect(rank(docs, "compost toilets", 2)).toEqual(["strong"]);
  });

  it("returns nothing from an empty shelf", () => {
    expect(rank([], "anything", 3)).toEqual([]);
  });
});

describe("rankSyntheses", () => {
  const row = (over: Partial<SynthesisRow>): SynthesisRow => ({
    body: "",
    title: "Untitled",
    recorded_at: "2026-07-01T00:00:00Z",
    ...over,
  });

  it("ranks the village's own record on content, not recency alone", () => {
    const hits = rankSyntheses(
      [
        row({ title: "Land call", body: "We walked the boundary and talked about the well.", recorded_at: "2026-07-20T00:00:00Z" }),
        row({ title: "Dues call", body: "Membership dues, sliding scale, and what a resident pays monthly.", recorded_at: "2026-01-05T00:00:00Z" }),
      ],
      "how did we decide dues",
      3,
    );
    expect(hits[0].recordingTitle).toBe("Dues call");
    expect(hits[0].recordedAt).toBe("2026-01-05T00:00:00.000Z");
  });

  it("truncates the excerpt to the prompt budget", () => {
    const hits = rankSyntheses([row({ body: `dues ${"x ".repeat(4000)}` })], "dues", 1);
    expect(hits[0].excerpt.length).toBe(2400);
  });

  it("names an untitled recording rather than showing null", () => {
    const hits = rankSyntheses([row({ title: null, body: "compost toilets and greywater" })], "compost", 1);
    expect(hits[0].recordingTitle).toBe("Untitled call");
  });

  it("says nothing when the archive does not cover the question", () => {
    expect(rankSyntheses([row({ body: "compost toilets" })], "quarterly tax filings", 3)).toEqual([]);
  });

  it("is empty on a fresh fork with no syntheses", () => {
    expect(rankSyntheses([], "anything", 3)).toEqual([]);
  });
});
