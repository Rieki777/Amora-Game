/**
 * NO SHEBANG, and it has to stay that way.
 *
 * Same reason `scripts/generate-token-doc.mjs` carries that rule and the same
 * reason `scripts/check-identity-keys.mjs` does: this file is imported, not
 * only executed, so it can go through a bundler's transform as well as node,
 * and A SHEBANG PLUS CRLF LINE ENDINGS makes that transform throw
 * `SyntaxError: Invalid or unexpected token`. Either one alone is fine.
 * `core.autocrlf` is true on the Windows checkouts this repository is
 * developed on, so the failure appears at a rebase and not at the edit that
 * caused it. The self-test asserts the line is still absent.
 */
/**
 * THE FACTS IN docs/ECONOMICS.md, WRITTEN FROM THE CODE RATHER THAN ABOUT IT.
 *
 * `docs/TOKENS.md` is generated whole. This document cannot be, and the
 * difference is the point: most of ECONOMICS.md is narrative that no reader
 * can derive from a switch statement (why a lock that stops one member racing
 * themselves is what makes the village fail against each other, what a member
 * sees when a spend refuses, what a departing member is owed). Prose like that
 * has to be written and it can drift.
 *
 * So the document is SPLIT. Every fact that a machine can read out of the code
 * lives inside a marked region:
 *
 *     <!-- generated:tokens start -->
 *     ...written by this script, never by hand...
 *     <!-- generated:tokens end -->
 *
 * and `scripts/check-economics-doc.mjs` regenerates each region and fails the
 * build when the committed text and the code have come apart. Everything
 * outside the markers is prose, and `scripts/check-economics-narrative.mjs`
 * is the guard on that half: it fails when the economy's code moved and the
 * document did not.
 *
 * WHAT IT DESCRIBES. A FRESH village: what a founder standing up a new
 * instance gets on the first boot. Not the live deployment, which has history
 * and which no script here can reach.
 *
 * WHAT IT READS, AND THE RULE FOR EACH READER. Every reader is ANCHORED and
 * FAILS LOUD. If the shape it expects is gone it throws, naming the file and
 * the text it could not read, and the check exits 2 rather than 0. A reader
 * that silently returns nothing when the code moves is worse than no reader:
 * the document keeps rendering and quietly loses a faucet.
 *
 *   scripts/generate-token-doc.mjs   the registry, faucets, sinks and seeded
 *                                    rules, through ITS readers rather than a
 *                                    second copy of them (see below)
 *   server/lib/ledger.ts             checkLedgerInvariants: what boot refuses
 *   server/lib/economy.ts            the `keys` object: every occurrence key
 *
 * WHY IT IMPORTS THE TOKEN GENERATOR INSTEAD OF COPYING IT. Those readers are
 * anchored, fail loud, and are already proved twice over: by
 * `scripts/generate-token-doc.test.mjs` and by `server/db/tokenDoc.test.ts`,
 * which runs every migration against a real MySQL and asserts the SQL
 * interpreter's rows equal the database's. A second copy of that interpreter
 * would be a second thing to keep true, and the first time the two disagreed
 * one document would be right and the other would look right. Nothing here
 * writes docs/TOKENS.md or calls its renderer; only the readers are used.
 *
 * NO SERVER TYPESCRIPT IS IMPORTED AT RUNTIME, for the same reason the token
 * generator does not: `server/lib/economy.ts` reaches a database on load. The
 * TypeScript compiler parses the files as text and the readers walk the AST.
 *
 * Usage:
 *   node scripts/generate-economics-doc.mjs           rewrite the regions in place
 *   node scripts/generate-economics-doc.mjs --stdout  print them, write nothing
 *   node scripts/generate-economics-doc.mjs --list    print what it reads
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { collectFacts } from "./generate-token-doc.mjs";

export const ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1"),
  "..",
);

export const DOC_RELATIVE = "docs/ECONOMICS.md";
export const DOC_PATH = path.join(ROOT, "docs", "ECONOMICS.md");

/**
 * Every file the generated regions are derived from. Existence is checked
 * before anything is parsed, so a rename fails with the path it wanted rather
 * than with a parse error twenty frames deep.
 *
 * `drizzle` and the token generator's own source list are read through
 * `collectFacts`, which checks them itself and throws the same way.
 */
export const SOURCES = [
  "drizzle",
  "server/lib/economy.ts",
  "server/lib/economySeed.ts",
  "server/lib/ledger.ts",
  "server/lib/spending.ts",
  "server/lib/exit.ts",
  "server/lib/voiceClaim.ts",
  "shared/gameVariables.ts",
];

/** Thrown when the code no longer has the shape a reader is anchored to. */
export class ReadError extends Error {}

function fail(message) {
  throw new ReadError(message);
}

// ── TypeScript: anchored reads ──────────────────────────────────────────────

const sourceCache = new Map();

function sourceFile(abs) {
  if (!sourceCache.has(abs)) {
    if (!fs.existsSync(abs)) fail(`economics-doc: ${abs} is gone; the generator reads it`);
    sourceCache.set(
      abs,
      ts.createSourceFile(abs, fs.readFileSync(abs, "utf8"), ts.ScriptTarget.Latest, true),
    );
  }
  return sourceCache.get(abs);
}

function eachChild(node, fn) {
  node.forEachChild((child) => {
    fn(child);
    eachChild(child, fn);
  });
}

/** Top-level `const NAME = ...` in a file, by name. */
function constInit(abs, name) {
  const sf = sourceFile(abs);
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const d of stmt.declarationList.declarations) {
      if (ts.isIdentifier(d.name) && d.name.text === name && d.initializer) return d.initializer;
    }
  }
  return null;
}

/** A named function declaration, by name. */
function functionNamed(abs, name) {
  const sf = sourceFile(abs);
  let found;
  eachChild(sf, (n) => {
    if (found) return;
    if (ts.isFunctionDeclaration(n) && n.name?.text === name) found = n;
  });
  if (!found) fail(`economics-doc: ${path.basename(abs)} no longer declares function ${name}()`);
  return found;
}

/**
 * Every occurrence key the economy can write, read out of `keys` in
 * server/lib/economy.ts.
 *
 * Each entry is an arrow function returning ONE template literal, and that is
 * asserted rather than assumed: a key built by concatenation or by a helper
 * would render as an empty shape here and the table would announce a key
 * format that is not the one the ledger holds. The parameter names are the
 * placeholders, so the rendered shape reads the way a row in the database
 * reads.
 *
 * WHY THE SHAPE IS WORTH PRINTING AT ALL. `keys.roleCycle`'s own comment
 * records what changing one of these costs: when the cycle id's spelling
 * moved, every already-paid seat in the open lunation looked unpaid, and a
 * migration had to rename the historical keys in the same change. A format
 * nobody can see is a format nobody checks before editing.
 */
export function occurrenceKeys(root = ROOT) {
  const abs = path.join(root, "server", "lib", "economy.ts");
  const init = constInit(abs, "keys");
  if (!init || !ts.isObjectLiteralExpression(init)) {
    fail("economics-doc: server/lib/economy.ts no longer declares `export const keys = { ... }`");
  }
  const out = [];
  for (const prop of init.properties) {
    if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) {
      fail(
        `economics-doc: an entry in \`keys\` (server/lib/economy.ts) is not a plain \`name: fn\` ` +
          `assignment, and this reader cannot follow it: ${prop.getText().slice(0, 80)}`,
      );
    }
    const fn = prop.initializer;
    if (!ts.isArrowFunction(fn)) {
      fail(`economics-doc: keys.${prop.name.text} is not an arrow function; the reader cannot follow it`);
    }
    const params = fn.parameters.map((p) => (ts.isIdentifier(p.name) ? p.name.text : p.name.getText()));
    const body = fn.body;
    if (!ts.isTemplateExpression(body) && !ts.isNoSubstitutionTemplateLiteral(body)) {
      fail(
        `economics-doc: keys.${prop.name.text} no longer returns a single template literal ` +
          `(it returns ${ts.SyntaxKind[body.kind]}). The document prints the key SHAPE, and a ` +
          "key assembled another way would render as a shape the ledger never holds.",
      );
    }
    let shape;
    if (ts.isNoSubstitutionTemplateLiteral(body)) {
      shape = body.text;
    } else {
      shape = body.head.text;
      for (const span of body.templateSpans) {
        const e = span.expression;
        shape += ts.isIdentifier(e) ? `<${e.text}>` : `<${e.getText()}>`;
        shape += span.literal.text;
      }
    }
    out.push({ name: prop.name.text, params, shape });
  }
  if (!out.length) fail("economics-doc: `keys` in server/lib/economy.ts is empty");
  return out;
}

/**
 * What every boot refuses, read out of `checkLedgerInvariants` in
 * server/lib/ledger.ts.
 *
 * READ FROM THE BODY, NOT FROM THE COMMENT ABOVE IT. That function carries a
 * numbered list in its own JSDoc, and reading that list would be reading prose
 * about the code, which is the failure this whole pipeline exists to stop: the
 * comment can say six while the body runs five.
 *
 * Each check in that body is a query followed by a loop that pushes one
 * sentence per row, so the reader pairs them in source order: the most recent
 * query is the one a `problems.push` belongs to. That pairing is CHECKED, not
 * assumed. A push with no query before it, or a query with no push after it,
 * means the shape moved and this throws rather than dropping an invariant
 * from the document in silence.
 */
export function invariantChecks(root = ROOT) {
  const abs = path.join(root, "server", "lib", "ledger.ts");
  const fn = functionNamed(abs, "checkLedgerInvariants");

  const found = [];
  let pendingSql = null;
  let pendingQueryOrder = -1;
  let order = 0;

  const sqlOf = (node) => {
    let sql = null;
    eachChild(node, (n) => {
      if (sql) return;
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
        if (/\bFROM\b|\bSELECT\b/i.test(n.text)) sql = n.text;
      }
      // Concatenated string chains: take the whole joined text.
      if (
        ts.isBinaryExpression(n) &&
        n.operatorToken.kind === ts.SyntaxKind.PlusToken &&
        ts.isStringLiteral(n.left) &&
        /\bSELECT\b/i.test(n.left.text)
      ) {
        const parts = [];
        const walk = (b) => {
          if (ts.isBinaryExpression(b) && b.operatorToken.kind === ts.SyntaxKind.PlusToken) {
            walk(b.left);
            walk(b.right);
            return;
          }
          if (ts.isStringLiteral(b) || ts.isNoSubstitutionTemplateLiteral(b)) parts.push(b.text);
        };
        walk(n);
        sql = parts.join("");
      }
    });
    return sql;
  };

  eachChild(fn, (n) => {
    if (ts.isCallExpression(n)) {
      const callee = n.expression;
      const isQuery =
        ts.isPropertyAccessExpression(callee) && callee.name.text === "query";
      if (isQuery) {
        const sql = sqlOf(n);
        if (sql) {
          order += 1;
          pendingSql = sql.replace(/\s+/g, " ").trim();
          pendingQueryOrder = order;
        }
        return;
      }
      const isPush =
        ts.isPropertyAccessExpression(callee) &&
        callee.name.text === "push" &&
        ts.isIdentifier(callee.expression) &&
        callee.expression.text === "problems";
      if (!isPush) return;
      if (!pendingSql) {
        fail(
          "economics-doc: checkLedgerInvariants() pushes a problem with no query before it. " +
            "The reader pairs each refusal with the read that produced it and can no longer do so.",
        );
      }
      const arg = n.arguments[0];
      let message;
      if (ts.isNoSubstitutionTemplateLiteral(arg) || ts.isStringLiteral(arg)) {
        message = arg.text;
      } else if (ts.isTemplateExpression(arg)) {
        message = arg.head.text;
        for (const span of arg.templateSpans) {
          const e = span.expression;
          message += ts.isPropertyAccessExpression(e) ? `<${e.name.text}>` : `<${e.getText()}>`;
          message += span.literal.text;
        }
      } else {
        fail(
          `economics-doc: a problems.push() in checkLedgerInvariants() no longer carries a string ` +
            `or template literal (${ts.SyntaxKind[arg.kind]}); the reader cannot print what it refuses.`,
        );
      }
      found.push({ order: pendingQueryOrder, sql: pendingSql, message: message.replace(/\s+/g, " ").trim() });
      pendingSql = null;
    }
  });

  if (!found.length) {
    fail("economics-doc: checkLedgerInvariants() no longer pushes any problem; the reader found no invariants");
  }
  if (found.length !== order) {
    fail(
      `economics-doc: checkLedgerInvariants() runs ${order} read(s) and produced ${found.length} ` +
        "refusal(s). One of them is a read whose refusal this reader could not find, which means " +
        "the document would print fewer invariants than boot actually enforces.",
    );
  }
  return found;
}

/**
 * The refusal sentences one function can hand a member, in the order it
 * checks them.
 *
 * WHY THE ORDER MATTERS ENOUGH TO PRINT. `sendGratitude`'s header calls the
 * order of refusals part of the contract, and `checkGive` says the same in its
 * own words: the most specific and most private reason wins, so a member is
 * told the useful thing rather than the first thing. A document that listed
 * these alphabetically would lose the only property anybody needs from them.
 *
 * TWO SHAPES, because the two files answer differently. `server/lib/spending.ts`
 * returns the sentence directly (`return "..."`), while `checkGive` returns
 * `{ ok: false, error: "..." }`. Both are read: any string or template literal
 * that is either returned or assigned to a property named `error`. Anything
 * else in that position throws, because a refusal assembled from a variable
 * would be a sentence the document cannot quote and would silently omit.
 */
export function refusalsFrom(root, relFile, fnName) {
  const abs = path.join(root, relFile);
  const fn = functionNamed(abs, fnName);
  const out = [];
  const textOf = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isTemplateExpression(node)) {
      let s = node.head.text;
      for (const span of node.templateSpans) {
        const e = span.expression;
        s += ts.isPropertyAccessExpression(e) ? `<${e.name.text}>` : `<${e.getText().replace(/\s+/g, " ")}>`;
        s += span.literal.text;
      }
      return s;
    }
    /*
     * A `+` chain of literals is ONE sentence wrapped to fit the line, and it
     * has to be joined rather than refused. `checkGive`'s share refusal is
     * written that way today. The join is strict: every leaf must itself be a
     * literal this function can read, so a genuine `"..." + variable` still
     * throws instead of printing half a sentence.
     */
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = textOf(node.left);
      const right = textOf(node.right);
      return left === null || right === null ? null : left + right;
    }
    return null;
  };
  /*
   * A refusal that cannot be read is a FAILURE, never a skip.
   *
   * The first draft of this reader pushed only what `textOf` could resolve and
   * silently ignored the rest. `sendRefusal` returns two of its sentences out
   * of a ternary (`def.kind === "recognition" ? ... : ...`), so that draft
   * dropped the recognition refusal, which is the single most load-bearing
   * sentence in the send path, and printed a shorter list that looked
   * complete. A reader that can lose a case without losing its green is the
   * exact failure this pipeline exists to stop, so every unreadable position
   * throws with the syntax kind it met.
   */
  const readOrFail = (node, what) => {
    // `return null` is "nothing refuses this", which is a real answer.
    if (node.kind === ts.SyntaxKind.NullKeyword) return [];
    const direct = textOf(node);
    if (direct !== null) return [direct];
    // A ternary is two sentences and both are reachable, so both are printed.
    if (ts.isConditionalExpression(node)) {
      return [...readOrFail(node.whenTrue, what), ...readOrFail(node.whenFalse, what)];
    }
    if (ts.isParenthesizedExpression(node)) return readOrFail(node.expression, what);
    /*
     * `return { ok: false, error: "..." }`. The sentence is on the `error`
     * property, which the walk below reaches on its own, so this returns
     * nothing rather than reading it twice. `{ ok: true }` carries no refusal
     * and correctly contributes none.
     */
    if (ts.isObjectLiteralExpression(node)) return [];
    fail(
      `economics-doc: ${relFile} ${fnName}() ${what} this reader cannot quote ` +
        `(${ts.SyntaxKind[node.kind]}). The document prints the sentence a member sees, and a ` +
        "sentence this reader cannot resolve would be dropped in silence, which is how a refusal " +
        "disappears from the document while still shipping to members.",
    );
    return [];
  };

  eachChild(fn, (n) => {
    if (ts.isReturnStatement(n) && n.expression) {
      // Only refusal-shaped returns. A function like sendRefusal returns
      // strings and null; anything else here is read strictly.
      out.push(...readOrFail(n.expression, "returns a value"));
      return;
    }
    if (ts.isPropertyAssignment(n) && ts.isIdentifier(n.name) && n.name.text === "error") {
      out.push(...readOrFail(n.initializer, "builds a refusal"));
    }
  });
  if (!out.length) {
    fail(
      `economics-doc: ${relFile} ${fnName}() returns no refusal sentence any more. ` +
        "Either it stopped refusing or the reader's anchor moved; both mean the document is now wrong.",
    );
  }
  return out.map((s) => s.replace(/\s+/g, " ").trim());
}

/** The tables an invariant's SQL reads, for the "reads" column. */
function tablesIn(sql) {
  const names = new Set();
  for (const m of sql.matchAll(/\b(?:FROM|JOIN)\s+`?([a-z_][a-z0-9_]*)`?/gi)) {
    const name = m[1].toLowerCase();
    // Derived-table aliases (`FROM ( ... ) m`) never match this pattern, but a
    // subquery's own FROM does, which is correct: it is still a table read.
    names.add(name);
  }
  return Array.from(names).sort();
}

// ── Rendering ───────────────────────────────────────────────────────────────

const yesNo = (b) => (b ? "yes" : "no");

function table(headers, rows) {
  const lines = [`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`];
  for (const r of rows) lines.push(`| ${r.join(" | ")} |`);
  return lines.join("\n");
}

/** Markdown table cells cannot hold a bare pipe. */
const cell = (v) => String(v).replace(/\|/g, "\\|");

/**
 * The regions, by name. Each renders to a string WITHOUT its markers; the
 * splice and the check both add those.
 *
 * ORDER IS THE ORDER THEY APPEAR IN THE DOCUMENT, which is only a convenience
 * for `--stdout`. The check finds each region by its marker, so moving a
 * section in the document does not move anything here.
 */
export const REGIONS = {
  /** The registry a fresh village boots with. */
  tokens(f) {
    const rows = f.tokens.map((t) => [
      cell(`\`${t.slug}\``),
      cell(t.name),
      cell(t.kind),
      cell(t.governance === "platform" ? "the village" : "Hypha, on Base"),
      cell(t.decimals),
      cell(t.faucet ? `\`${t.faucet}\`` : "none, it is read from Base"),
      cell(t.sendable ? "yes" : `no: ${t.sendBlockedBy}`),
    ]);
    return [
      table(
        ["Slug", "Name", "Kind", "Governed by", "Decimals", "Faucet", "A member may send it"],
        rows,
      ),
      "",
      `${f.tokens.length} tokens in a fresh village: ` +
        `${f.tokens.filter((t) => t.governance === "platform").length} minted here, ` +
        `${f.tokens.filter((t) => t.governance !== "platform").length} read from Base. ` +
        `The registry rows are seeded by ${f.migrationsRead.length} migration file(s) ` +
        "and by the modules that register their own token at boot.",
    ].join("\n");
  },

  /** Which account issues which token, and the system accounts that are not faucets. */
  faucets(f) {
    const rows = Object.entries(f.faucets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([slug, account]) => [cell(`\`${account}\``), cell(`\`${slug}\``)]);
    const holding = [
      [`\`${f.spendSinks.fallback}\``, "where a spent credit lands, unless the token names its own sink"],
      [`\`${f.accounts.exitSettlement}\``, "a departing member's swept balance"],
      [`\`${f.accounts.voiceBridge}\``, "voice debited by a claim, waiting on Hypha"],
      [`\`${f.accounts.voiceSettled}\``, "voice whose claim Hypha confirmed"],
    ];
    return [
      table(["Faucet account", "Issues"], rows),
      "",
      "A faucet's NEGATIVE balance is the issued supply of its token. These system accounts are not faucets and never go below zero:",
      "",
      table(["Vault account", "Holds"], holding.map((r) => r.map(cell))),
      "",
      "Sources that may drive a NON-faucet account below zero, and only with `allowNegative` set: " +
        f.allowNegative.map((s) => `\`${s}\``).join(", ") +
        ".",
    ].join("\n");
  },

  /** The mint rules a fresh village is born with. */
  "mint-rules"(f) {
    const rows = f.seededRules.map((r) => [
      cell(`\`${r.trigger}\``),
      cell(`\`${r.token}\``),
      cell(r.amount === null ? "read from the work" : r.amount),
      cell(r.ceiling),
      cell(r.recipient),
      cell(r.enabled === false ? "**no**" : "yes"),
    ]);
    return [
      table(["Trigger", "Token", "Amount", "Ceiling", "Recipient", "Enabled"], rows),
      "",
      "Seeded by `seedEconomy` in `server/lib/economySeed.ts` with `INSERT IGNORE` on " +
        "(village, trigger, token), so an amount a village has edited is never restored by a redeploy.",
    ].join("\n");
  },

  /** Where a spent token goes, and what may be spent at all. */
  sinks(f) {
    const rows = f.tokens
      .filter((t) => t.priceable)
      .map((t) => [cell(`\`${t.slug}\``), cell(`\`${t.spendSink}\``)]);
    return [
      "A token may carry a price when it is platform-governed, active, not an example, and of kind " +
        f.priceableKinds.map((k) => `\`${k}\``).join(" or ") +
        " (`isPriceableToken`, `server/lib/spending.ts`). Today that is:",
      "",
      table(["Priceable token", "Spending it lands in"], rows),
      "",
      "`spendSinkFor` names " +
        (Object.keys(f.spendSinks.named).length
          ? Object.entries(f.spendSinks.named)
              .map(([slug, account]) => `\`${slug}\` to \`${account}\``)
              .join(", ")
          : "no token") +
        ` and sends everything else to \`${f.spendSinks.fallback}\`.`,
      "",
      "Kinds a member may hand to another member (`SENDABLE_KINDS`): " +
        f.sendableKinds.map((k) => `\`${k}\``).join(", ") +
        ". Held out by name even though they are that kind (`MODULE_VOUCHERS`): " +
        f.moduleVouchers.map((s) => `\`${s}\``).join(", ") +
        ".",
    ].join("\n");
  },

  /** What every boot refuses. */
  conservation(f, root) {
    const checks = invariantChecks(root);
    // Backticked, because a refusal carries `<token_type>` placeholders and a
    // markdown renderer eats an unbackticked angle bracket as an HTML tag.
    const rows = checks.map((c) => [
      cell(`\`${c.message}\``),
      cell(tablesIn(c.sql).map((t) => `\`${t}\``).join(", ")),
    ]);
    return [
      `\`checkLedgerInvariants\` (\`server/lib/ledger.ts\`) runs ${checks.length} reads at every boot and ` +
        "refuses with one sentence per offending row. These are the sentences, with the tables each read:",
      "",
      table(["Boot refuses with", "Reading"], rows),
      "",
      "Conservation is checked against `token_balances`, which is a CACHE, and the cache is " +
        "separately checked against a recomputation from `token_ledger`. Both are needed: the sum " +
        "of a wrong cache can still be zero.",
    ].join("\n");
  },

  /**
   * The exact sentences a member reads when the economy says no.
   *
   * QUOTED FROM THE CODE, never retyped. A refusal is the only part of this
   * engine most members will ever meet, and a document that paraphrases one is
   * a document that cannot be used to answer "why did it say that?". The
   * angle brackets are the code's own interpolations.
   */
  refusals(f, root) {
    const groups = [
      {
        title: "Sending a token to another member",
        where: "`sendRefusal`, `server/lib/spending.ts`",
        lines: refusalsFrom(root, "server/lib/spending.ts", "sendRefusal"),
      },
      {
        title: "Putting a price on a room or a seat",
        where: "`priceRefusal`, `server/lib/spending.ts`",
        lines: refusalsFrom(root, "server/lib/spending.ts", "priceRefusal"),
      },
      {
        title: "Opening sending on a token, as an admin",
        where: "`mayToggleTransferable`, `server/lib/spending.ts`",
        lines: refusalsFrom(root, "server/lib/spending.ts", "mayToggleTransferable"),
      },
      {
        title: "Giving gratitude",
        where: "`checkGive`, `server/lib/economy.ts`",
        lines: refusalsFrom(root, "server/lib/economy.ts", "checkGive"),
      },
    ];
    const out = [];
    for (const g of groups) {
      out.push(`**${g.title}** (${g.where}):`, "");
      for (const line of g.lines) out.push(`- \`${line}\``);
      out.push("");
    }
    out.pop();
    return out.join("\n");
  },

  /** Every occurrence key the economy can write. */
  triggers(f, root) {
    const rows = occurrenceKeys(root).map((k) => [
      cell(`\`keys.${k.name}\``),
      cell(`\`${k.shape}\``),
    ]);
    return [
      "A key names an OCCURRENCE, never a thing, and `token_ledger.idempotency_key` is UNIQUE, so " +
        "the shape of the key is what decides whether a second attempt pays again. Read from " +
        "`keys` in `server/lib/economy.ts`; the angle brackets are that function's own parameter names.",
      "",
      table(["Builder", "Key shape"], rows),
    ].join("\n");
  },
};

export const REGION_NAMES = Object.keys(REGIONS);

export const startMarker = (name) => `<!-- generated:${name} start -->`;
export const endMarker = (name) => `<!-- generated:${name} end -->`;

/**
 * Render one region's body. Throws a ReadError when a source moved.
 *
 * `facts` is passed in by `renderAll` so six regions do not re-read the whole
 * migration set six times.
 */
export function renderRegion(name, root = ROOT, facts = null) {
  const render = REGIONS[name];
  if (!render) fail(`economics-doc: no region named "${name}"; known: ${REGION_NAMES.join(", ")}`);
  return render(facts ?? collectFacts(root), root);
}

/** Every region, by name. One read of the sources for all of them. */
export function renderAll(root = ROOT) {
  for (const rel of SOURCES) {
    if (!fs.existsSync(path.join(root, rel))) {
      fail(`economics-doc: ${rel} is gone; the generator reads it`);
    }
  }
  const facts = collectFacts(root);
  const out = {};
  for (const name of REGION_NAMES) out[name] = renderRegion(name, root, facts);
  return out;
}

/**
 * Find one region's body in a document.
 *
 * Returns `{ body, start, end }` or a `problem` string. A MISSING MARKER IS A
 * PROBLEM AND NOT AN EMPTY REGION: an empty region compares equal to nothing
 * and would let somebody delete a table by deleting its markers, which is the
 * one edit this whole pipeline has to refuse.
 */
export function findRegion(text, name) {
  const open = startMarker(name);
  const close = endMarker(name);
  const a = text.indexOf(open);
  if (a === -1) return { problem: `the marker ${open} is not in the document` };
  if (text.indexOf(open, a + open.length) !== -1) {
    return { problem: `the marker ${open} appears more than once` };
  }
  const b = text.indexOf(close, a + open.length);
  if (b === -1) return { problem: `${open} is there but ${close} is not` };
  if (text.indexOf(close, b + close.length) !== -1) {
    return { problem: `the marker ${close} appears more than once` };
  }
  return {
    body: text.slice(a + open.length, b).replace(/^\n/, "").replace(/\n$/, ""),
    start: a + open.length,
    end: b,
  };
}

/** Put every rendered region back into the document text. */
export function spliceAll(text, rendered) {
  let out = text;
  for (const name of REGION_NAMES) {
    const found = findRegion(out, name);
    if (found.problem) fail(`economics-doc: ${DOC_RELATIVE}: ${found.problem}`);
    out = `${out.slice(0, found.start)}\n${rendered[name]}\n${out.slice(found.end)}`;
  }
  return out;
}

// ── CLI ─────────────────────────────────────────────────────────────────────

const invokedDirectly = (() => {
  const arg = process.argv[1];
  if (!arg) return false;
  return path.resolve(arg) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
})();

if (invokedDirectly) {
  if (process.argv.includes("--list")) {
    process.stdout.write(`${DOC_RELATIVE} regions are generated from:\n`);
    for (const s of SOURCES) process.stdout.write(`  ${s}\n`);
    process.stdout.write(`  scripts/generate-token-doc.mjs (its readers, not its renderer)\n`);
    process.stdout.write(`\nRegions: ${REGION_NAMES.join(", ")}\n`);
  } else if (process.argv.includes("--stdout")) {
    const rendered = renderAll();
    for (const name of REGION_NAMES) {
      process.stdout.write(`${startMarker(name)}\n${rendered[name]}\n${endMarker(name)}\n\n`);
    }
  } else {
    const rendered = renderAll();
    const before = fs.readFileSync(DOC_PATH, "utf8");
    const after = spliceAll(before, rendered);
    if (before === after) {
      process.stdout.write(`${DOC_RELATIVE}: ${REGION_NAMES.length} generated region(s) already match the code.\n`);
    } else {
      fs.writeFileSync(DOC_PATH, after);
      process.stdout.write(`${DOC_RELATIVE}: ${REGION_NAMES.length} generated region(s) rewritten from the code.\n`);
    }
  }
}
