/**
 * Telling code from commentary, for the brand guard.
 *
 * Lives apart from check-brand-refs.mjs so it can be TESTED: that script
 * scans the tree and exits at import time, so nothing could ever import it
 * to check its answers. Two bugs hid in here for months because of that.
 */

/**
 * Cut a `//` comment off the end of a line WITHOUT cutting a URL in half.
 *
 * Walks the line tracking string state. The regex it replaces could not tell
 * `https://village.example` from the start of a comment, so every brand name
 * living in a URL was invisible to the guard.
 */
export function cutLineComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (quote) {
      if (c === "\\") { i += 1; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "/" && line[i + 1] === "/") return line.slice(0, i);
  }
  return line;
}

/**
 * The guard reads CODE, not commentary. A comment recording where a design
 * came from is honest provenance a fork should keep; a brand name inside a
 * string literal or an identifier is what a fork would inherit and have to
 * hunt down. Comments are counted separately and reported, never failed.
 *
 * The carriage return goes FIRST. JavaScript's dot excludes \r, so on a CRLF
 * checkout an anchored rule can never reach the end of the line: no comment
 * was ever stripped, every `// ... Amora ...` counted as code, and the same
 * commit read green on one machine and red on another.
 */
export function stripComments(line, ext) {
  let out = line.replace(/\r$/, "");
  if (ext === ".sql") out = out.replace(/--.*$/, "");
  else if (ext === ".css" || ext === ".json") { /* no line comments here */ }
  else out = cutLineComment(out);
  out = out.replace(/\/\*[\s\S]*?\*\//g, "");
  // Inside a block comment, a continuation line starts with * (JSDoc style).
  if (/^\s*\*/.test(line) || /^\s*\/\*/.test(line)) out = "";
  return out;
}
