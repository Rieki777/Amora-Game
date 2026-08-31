// A HYPHEN STANDING IN FOR A DASH, which check-voice.mjs cannot see.
//
// The voice profile's rule 1 sends people from an em-dash to "a comma, a period, a
// colon, or a rewrite". A sweep took a fifth path nobody offered: delete the dash and
// keep the hyphen. That passes check-voice, because the CHARACTER is legal, and it
// shipped fourteen glued compounds onto public pages. Live QA read them off the
// rendered site:
//
//     a heartfelt covenant-a living agreement
//     we do not just sustain-we heal
//     a role that still matters-not a golf course
//
// WHY THIS IS A SEPARATE SCRIPT AND NOT A RULE INSIDE check-voice.mjs. I added it
// there first. It fired correctly, then stopped firing once I added the compound
// allowlist, and a probe file containing both constructions came back "clean across
// 335 files". I could not explain that in the time I had, and a gate rule that
// silently never runs is worse than no rule: it converts "unchecked" into "passed",
// which is the exact failure this repo spent a day cataloguing. So the check lives
// here, where it demonstrably works, until somebody can debug the extractor.
//
// Detected by the SECOND word, not by guessing at compounds: "well-being",
// "decision-making" and "one-on-one" are all correct, and a
// lowercase-hyphen-lowercase rule would flag every one. The allowlist exists because
// this rule found its own counterexample on the first run: "thank-you" is real.
//
// SCOPE: client/src ONLY, on purpose, not by oversight. This regex is a dumb
// text scan over raw file content, with no notion of "copy" versus "code" the
// way check-voice.mjs's AST-based `copySpans()` has. That is exactly why it
// lives here instead of inside check-voice.mjs (see above), and it is also
// why widening the walk to server/scripts/docs is not a safe drop-in change.
// Measured (SEASON2_FLEET_LEDGER.md 8a's guard audit): pointing this same
// regex at server/scripts/docs/shared surfaces 111 hits, and every one
// sampled was a false positive: test-fixture ids ("place-a", "rec-a",
// "swap-a"), a URL fragment, and legitimate compounds ("use-it-or-lose-it",
// "held-versus-not"). Widening this script as written would trade one real,
// documented gap for a guard nobody trusts. If client/src-only coverage ever
// needs to grow, the right move is teaching this rule to check-voice.mjs's
// copy-span extractor (abandoned once already, see above, so budget real
// time for it), not pointing this raw regex at more directories.
// check-hyphen-dash.test.mjs pins this boundary as a running assertion so it
// cannot drift silently again.
//
// CI step name: keep "Dash guard (client/src)" or equivalent. "Dash guard"
// alone reads as repo-wide and is not.

import fs from "node:fs";
import path from "node:path";

const RE = /([a-z]{3,})-(not|it|its|we|you|your|they|and|but|a|an|the|so|then|which|that)(?![a-z-])/gi;
const OK = new Set(["thank-you", "know-it", "hand-me", "made-to"]);

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
};

let n = 0;
for (const f of walk("client/src")) {
  const t = fs.readFileSync(f, "utf8");
  for (const m of t.matchAll(RE)) {
    if (OK.has(m[0].toLowerCase())) continue;
    const line = t.slice(0, m.index).split("\n").length;
    const ctx = t.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\s+/g, " ");
    console.log(`  ${f.split(path.sep).join("/")}:${line}  ${m[0]}   ...${ctx}...`);
    n++;
  }
}
console.log(`  ${n} hyphen(s) standing in for a dash in client/src (this guard's only scope)`);
process.exit(n > 0 ? 1 : 0);
