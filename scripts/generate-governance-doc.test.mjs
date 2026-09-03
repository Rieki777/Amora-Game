/**
 * The governance generator's own guard.
 *
 * docs/GOVERNANCE.md is only worth trusting because a build step regenerates
 * it and compares. That step is worth exactly as much as the readers behind
 * it, so this file tests them on the cases that would let the document be
 * wrong QUIETLY:
 *
 *   - a subject type the close dispatcher executes and nothing describes. The
 *     dispatcher is the one table that says whether a member's vote binds, and
 *     a row rendering with a blank meaning is a village told nothing about the
 *     most consequential thing on the page.
 *   - a description left behind by a subject type that went away, which is the
 *     quieter half and the one a coverage check in one direction misses.
 *   - a Governance dial this document has never been written against. Most of
 *     the staged rulings arrive as a dial, so a new key is the first sign a
 *     status line here has gone stale.
 *   - a route whose door the reader cannot classify. It must SAY so and never
 *     guess, because a guessed door on a public route is the failure the
 *     document exists to prevent.
 *   - human prose that breaks the house writing rules, run through the same
 *     `checkSpan` the voice guard uses. The founder's quotes are exempt and
 *     the exemption is asserted, so the exemption cannot quietly widen.
 *   - determinism, because a byte comparison is the whole mechanism and a
 *     timestamp anywhere in the output would make every run a false failure.
 *
 * No village's name appears here: this file lives under scripts/, where the
 * brand guard scans.
 *
 * Run: node scripts/generate-governance-doc.test.mjs
 */
import assert from "node:assert";
import fs from "node:fs";
import {
  KNOWN_DIALS,
  PROSE,
  RULINGS,
  SUBJECT_WORDS,
  classifyDoor,
  collectFacts,
  dialCoverageProblem,
  generate,
  proseCoverageProblem,
  subjectCoverageProblem,
} from "./generate-governance-doc.mjs";
import { checkSpan } from "./check-voice.mjs";

let run = 0;
const check = (name, fn) => { fn(); run += 1; console.log(`  PASS  ${name}`); };

console.log("\ngenerate-governance-doc: the coverage refusals\n");

check("a subject type the dispatcher executes and nothing describes stops the build", () => {
  const problem = subjectCoverageProblem(["mechanics", "changeset"], { mechanics: "..." });
  assert.ok(problem, "an undescribed subject type must refuse");
  assert.ok(/changeset/.test(problem), problem);
  assert.ok(/SUBJECT_WORDS/.test(problem), "the message must name where to fix it");
});

check("a description whose subject type is gone stops the build", () => {
  const problem = subjectCoverageProblem(["mechanics"], { mechanics: "...", vanished: "..." });
  assert.ok(problem && /vanished/.test(problem), problem);
});

check("the real dispatcher is fully described in both directions", () => {
  const f = collectFacts();
  assert.strictEqual(subjectCoverageProblem(f.dispatcher.all), null);
});

check("a Governance dial this document has never seen stops the build", () => {
  const problem = dialCoverageProblem(["governance.unity_pct", "governance.criticality_tier"], ["governance.unity_pct"]);
  assert.ok(problem, "an unknown dial must refuse");
  assert.ok(/criticality_tier/.test(problem), problem);
  assert.ok(/KNOWN_DIALS/.test(problem), "the message must name where to fix it");
});

check("a dial this document described and the registry dropped stops the build", () => {
  const problem = dialCoverageProblem(["governance.unity_pct"], ["governance.unity_pct", "governance.gone"]);
  assert.ok(problem && /governance\.gone/.test(problem), problem);
});

check("the real Governance category matches KNOWN_DIALS", () => {
  const f = collectFacts();
  assert.strictEqual(dialCoverageProblem(f.dials.all.map((d) => d.key)), null);
  assert.ok(KNOWN_DIALS.length > 0);
});

console.log("\ngenerate-governance-doc: reading a route's door\n");

check("a handler that reads nobody answers a stranger", () => {
  assert.deepStrictEqual(classifyDoor("async (req, res) => { res.json(await rows()); }"), {
    door: "anyone, including a stranger",
    capability: null,
  });
});

check("a handler that refuses without a session asks for a signed-in member", () => {
  const body = 'async (req, res) => { const user = await authedUser(req); if (!user) return res.status(401).json({}); }';
  assert.strictEqual(classifyDoor(body).door, "signed in");
});

check("a handler that reads a viewer and refuses nobody still answers a stranger", () => {
  const body = "async (req, res) => { const viewer = await authedUser(req); res.json(serve(viewer?.id)); }";
  assert.strictEqual(classifyDoor(body).door, "anyone, including a stranger");
});

check("a capability gate is reported with the key it names", () => {
  const body = 'async (req, res) => { const verdict = await mayAct(req, "proposal.decide"); }';
  assert.deepStrictEqual(classifyDoor(body), { door: "capability", capability: "proposal.decide" });
});

check("an administrator gate outranks the rest", () => {
  const body = 'async (req, res) => { if (!(await isAdmin(req))) return res.status(403).json({}); const v = await mayAct(req, "dial.set"); }';
  assert.strictEqual(classifyDoor(body).door, "administrator");
});

check("A DOOR THIS READER CANNOT CLASSIFY SAYS SO AND NEVER GUESSES", () => {
  // The failure this whole classifier exists to avoid: a route that clearly
  // consults who is asking, in a shape none of the rules match. Reporting it
  // as public would put a wrong sentence about who can read a village's votes
  // into a document people trust.
  const body = "async (req, res) => { const who = await capabilityCtx(req); res.json(who); }";
  assert.strictEqual(classifyDoor(body).door, "could not derive");
});

check("the real routes are all classified, and the count is stated", () => {
  const f = collectFacts();
  assert.ok(f.routes.total > 0, "the walk must find routes, not report a clean zero");
  for (const r of f.routes.rows) {
    assert.ok(r.method && r.path.startsWith("/api/"), `a route row is malformed: ${JSON.stringify(r)}`);
  }
});

console.log("\ngenerate-governance-doc: the written half\n");

check("every entry in PROSE renders, and every marker names an entry", () => {
  assert.strictEqual(proseCoverageProblem(generate()), null);
});

check("a paragraph that renders nowhere stops the build", () => {
  const problem = proseCoverageProblem("# nothing here", { orphan: "..." }, []);
  assert.ok(problem && /orphan/.test(problem), problem);
});

check("a marker naming no entry stops the build", () => {
  const problem = proseCoverageProblem("<!-- written by a person: ghost -->", {}, []);
  assert.ok(problem && /ghost/.test(problem), problem);
});

check("EVERY HUMAN SENTENCE KEEPS THE HOUSE WRITING RULES", () => {
  // The same checkSpan the voice guard runs, applied to the prose store rather
  // than to the rendered file, because the rendered file also carries the
  // founder's own words and those are quoted verbatim.
  const complaints = [];
  const span = (label, text) => {
    for (const hit of checkSpan(text)) complaints.push(`${label}: ${hit[0]} (${hit[1]})`);
  };
  for (const [key, text] of Object.entries(PROSE)) span(`PROSE.${key}`, text);
  for (const [key, text] of Object.entries(SUBJECT_WORDS)) span(`SUBJECT_WORDS.${key}`, text);
  const facts = collectFacts();
  for (const r of RULINGS) {
    span(`ruling ${r.id} title`, r.title);
    span(`ruling ${r.id} note`, r.note(facts));
  }
  assert.strictEqual(complaints.length, 0, `\n    ${complaints.join("\n    ")}\n`);
});

check("the founder's words are quoted verbatim and marked as his", () => {
  const text = generate();
  for (const r of RULINGS) {
    assert.ok(r.quotes.length > 0, `ruling ${r.id} carries no quote`);
    for (const q of r.quotes) {
      assert.ok(text.includes(`> ${q.replace(/\n/g, " ")}`), `ruling ${r.id}'s quote is not reproduced exactly`);
    }
  }
  const marked = text.match(/<!-- the founder's own words -->/g) ?? [];
  const quoted = RULINGS.reduce((n, r) => n + r.quotes.length, 0);
  assert.strictEqual(marked.length, quoted, "every quote carries its own marker and nothing else does");
});

check("every ruling states a status, a date and where the status came from", () => {
  const facts = collectFacts();
  const text = generate();
  for (const r of RULINGS) {
    const label = r.status(facts);
    assert.ok(/\*\*(Built|Half built|Staged)/.test(label), `ruling ${r.id} has no recognisable status: ${label}`);
    assert.ok(r.dates.length > 0 && r.dates.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)), `ruling ${r.id} has no date`);
    const heading = `### ${r.id}. ${r.title}`;
    assert.ok(text.includes(heading), `ruling ${r.id} has no section of its own`);
    // The status line is the line after the heading's blank line, and it has
    // to say where the status came from IN THAT SECTION. Asserting the phrase
    // appears anywhere in the file would pass on the first ruling's line and
    // prove nothing about the other twenty-two.
    const statusLine = text.slice(text.indexOf(heading) + heading.length).split("\n").filter(Boolean)[0];
    assert.ok(statusLine.startsWith(label), `ruling ${r.id}'s section does not open with its status: ${statusLine}`);
    const basis = r.status.length === 0 ? "Status stated by a person" : "Status computed from the code";
    assert.ok(statusLine.includes(basis), `ruling ${r.id} does not say where its status came from: ${statusLine}`);
    for (const d of r.dates) assert.ok(statusLine.includes(d), `ruling ${r.id}'s status line omits ${d}`);
  }
});

console.log("\ngenerate-governance-doc: the document itself\n");

check("the real repository generates, and generates the same bytes twice", () => {
  const once = generate();
  const twice = generate();
  assert.strictEqual(once, twice, "a timestamp or any other clock reading would break the byte comparison");
  assert.ok(once.startsWith("# Governance\n"), "the document must open with its own title");
  assert.ok(once.endsWith("\n"), "a text file ends with a newline");
});

check("it names the commit whose sources it describes", () => {
  const text = generate();
  assert.ok(/It describes the code at commit `[0-9a-f]{40}`\./.test(text), "the commit line is how a reader checks everything else");
});

check("the constitution comes before the long tables", () => {
  const text = generate();
  const constitution = text.indexOf("## The constitution in one screen");
  const dials = text.indexOf("## The dials a village holds");
  const rulings = text.indexOf("## The founder's rulings");
  const json = text.indexOf("## Machine-readable");
  const madeFrom = text.indexOf("## What this file is made from");
  assert.ok(constitution > 0 && constitution < dials, "the one-screen constitution opens the document");
  assert.ok(dials < rulings && rulings < json && json < madeFrom, "the order is tables, rulings, JSON, sources");
});

check("the document carries a machine-readable block that parses", () => {
  const text = generate();
  const m = /```json\n([\s\S]+?)\n```/.exec(text);
  assert.ok(m, "the JSON block is the machine-readable half of the brief");
  const parsed = JSON.parse(m[1]);
  assert.ok(Array.isArray(parsed.subjects) && parsed.subjects.length > 0);
  assert.ok(Array.isArray(parsed.dials) && parsed.dials.length > 0);
  assert.ok(Array.isArray(parsed.routes) && parsed.routes.length > 0);
  assert.ok(Array.isArray(parsed.rulings) && parsed.rulings.length === RULINGS.length);
  assert.ok(/^[0-9a-f]{40}$/.test(parsed.commit));
  for (const s of parsed.subjects) {
    for (const field of ["subjectType", "minUnityPct", "minQuorumPct", "executesAtClose"]) {
      assert.ok(field in s, `every machine-readable subject needs ${field}`);
    }
  }
});

check("A VILLAGE'S FOUNDERS ARE CALLED CATALYSTS IN PROSE", () => {
  // The word a player reads is Catalyst. `founder` survives as the stored role
  // value, because a slug is history's identity, so it appears in this
  // document inside backticks, inside a quote, or in a table read out of the
  // code. "The founder" singular is the person whose rulings this document
  // carries, which is a different party from a village's own founders, so it
  // is allowed and the plural is not.
  const text = generate();
  for (const [i, line] of text.split("\n").entries()) {
    if (!/\bfounders?\b/i.test(line)) continue;
    if (line.startsWith(">")) continue; // his own words, verbatim
    if (/`[^`]*founder[^`]*`/.test(line)) continue; // a stored value or a ring, shown as code
    if (/^\s*"/.test(line) || /^\s*\|/.test(line)) continue; // the JSON block and the read tables
    const villageRole = /\bfounders\b/i.test(line) || /\ba founder\b/i.test(line) || /\bfounder-(held|ring)\b/i.test(line);
    if (!villageRole) continue;
    assert.fail(`line ${i + 1} names a village's founders where a player would read Catalyst:\n    ${line}`);
  }
});

check("THE GENERATOR STILL HAS NO SHEBANG", () => {
  // A shebang and CRLF line endings TOGETHER make Vite's transform throw
  // `SyntaxError: Invalid or unexpected token`, and server/db/governanceDoc.test.ts
  // imports this file through Vite. Either one alone is fine, which is how the
  // sibling generator ran green half a dozen times on an LF working copy and
  // went red the moment a rebase checked it out with CRLF.
  const src = fs.readFileSync(new URL("./generate-governance-doc.mjs", import.meta.url), "utf8");
  assert.ok(!src.startsWith("#!"), "generate-governance-doc.mjs must not open with a shebang");
});

console.log(`\n${run} check(s) passed\n`);
