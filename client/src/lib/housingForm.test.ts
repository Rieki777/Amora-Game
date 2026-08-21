/**
 * The guard the housing Admin surface did not have.
 *
 * A reviewer reverted `storedTaken` to `taken` at all three sites in the
 * Admin form and every gate stayed green. Nothing imports client/src/pages,
 * vitest collects client tests ending `.test.ts` and never `.test.tsx`, and
 * no typecheck can tell one nullable number from another. The surface was
 * unguarded by construction, so the fix could be undone by accident and the
 * founder's typed number destroyed again with nothing to say so.
 *
 * Two halves, and both are needed. The first drives the pure decisions in
 * housingForm.ts: which field each box reads, what each control sends, and
 * whether a blur changed anything. The second reads the panel AS TEXT to
 * check it still routes through those decisions, because a component that
 * builds its own request body inline puts the bug back where no unit test
 * can see it. A test of a helper nobody calls proves nothing.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  addHamlet,
  hamletNumbers,
  INITIAL_PHASE,
  isNoOp,
  labelFieldValue,
  labelPatch,
  loadSettled,
  loadStarted,
  showsPlaceholder,
  showsRefreshing,
  sourcePatch,
  takenFieldValue,
  totalFieldValue,
  totalPatch,
  takenPatch,
  type FounderRow,
} from "./housingForm";

/** A hamlet with four homes typed and two of them live from reservations. */
const row = (over: Partial<FounderRow> = {}): FounderRow => ({
  structureKey: "ridgeA",
  label: null,
  total: 10,
  taken: 4,
  storedTaken: 4,
  open: 6,
  isSet: true,
  takenSource: "founder",
  reservedCount: 0,
  ...over,
});

/** The row shape the whole defect lives in: typed 4, live 2, flipped over. */
const flipped = () =>
  row({ takenSource: "reservations", storedTaken: 4, taken: 2, open: 8, reservedCount: 2 });

describe("which number the homes-taken box shows", () => {
  it("shows the founder's TYPED number on a hamlet counted by reservations", () => {
    /*
     * The defect in one assertion. The box shows what the box will send, so a
     * box showing the live count writes the live count into homes_taken the
     * moment anyone tabs through it, and migration 0077's promise that the
     * typed number survives the flip is gone. Reading `taken` here returns
     * "2" and this test is what says no.
     */
    expect(takenFieldValue(flipped())).toBe("4");
  });

  it("shows the same number when the founder is authoritative", () => {
    expect(takenFieldValue(row({ storedTaken: 4, taken: 4 }))).toBe("4");
  });

  it("shows an empty box when no number was ever typed", () => {
    // Empty is UNSET, and unset is what makes a hamlet read as an example.
    expect(takenFieldValue(row({ storedTaken: null, taken: null }))).toBe("");
  });

  it("shows zero as zero, which is a real answer and not an empty box", () => {
    expect(takenFieldValue(row({ storedTaken: 0, taken: 0 }))).toBe("0");
  });

  it("reads the other two boxes off their own columns", () => {
    expect(totalFieldValue(row({ total: 10 }))).toBe("10");
    expect(totalFieldValue(row({ total: null }))).toBe("");
    expect(labelFieldValue(row({ label: "Ridge Hamlet North" }))).toBe("Ridge Hamlet North");
    expect(labelFieldValue(row({ label: null }))).toBe("");
  });
});

describe("each control sends its own field and nothing else", () => {
  /*
   * The rule that ends the whole-row clobber. A rename that also restates the
   * counts and the authority writes back whatever this tab last loaded, so a
   * flip made in builder mode a minute ago is reverted by someone typing a
   * name. Counting the keys is the assertion: a patch with one key cannot
   * revert a field it never mentions.
   */
  it("renaming sends the label alone", () => {
    const r = labelPatch("Ridge Hamlet North");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Object.keys(r.patch)).toEqual(["label"]);
    expect(r.patch.label).toBe("Ridge Hamlet North");
  });

  it("emptying the name box clears the label back to the map's own name", () => {
    const r = labelPatch("   ");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.patch).toEqual({ label: null });
  });

  it("editing a count sends that count alone", () => {
    const t = totalPatch("8");
    expect(t.ok && Object.keys(t.patch)).toEqual(["total"]);
    const k = takenPatch("3");
    expect(k.ok && Object.keys(k.patch)).toEqual(["taken"]);
  });

  it("emptying a count box clears it to unset, and typing 0 does not", () => {
    expect(totalPatch("")).toEqual({ ok: true, patch: { total: null } });
    expect(totalPatch("0")).toEqual({ ok: true, patch: { total: 0 } });
    expect(takenPatch("")).toEqual({ ok: true, patch: { taken: null } });
    expect(takenPatch("0")).toEqual({ ok: true, patch: { taken: 0 } });
  });

  it("REFUSES a value that is not a number instead of clearing the count", () => {
    /*
     * `Number("nine")` is NaN, `JSON.stringify` writes NaN as null, and null
     * is the one value that clears a founder's count. A typo would have
     * silently unset a hamlet and every surface would have started calling
     * its numbers an example.
     */
    expect(totalPatch("nine").ok).toBe(false);
    expect(takenPatch("2.5").ok).toBe(false);
    expect(totalPatch("-1").ok).toBe(false);
    expect(totalPatch("10001").ok).toBe(false);
  });

  it("flipping the authority sends the authority alone", () => {
    const r = sourcePatch("reservations");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.patch).toEqual({ takenSource: "reservations" });
  });

  it("refuses an authority it does not recognise", () => {
    expect(sourcePatch("whoever").ok).toBe(false);
  });
});

describe("a blur that changed nothing sends nothing", () => {
  it("calls an untouched field a no-op, so tabbing across a row is free", () => {
    expect(isNoOp(row({ label: "Ridge" }), { label: "Ridge" })).toBe(true);
    expect(isNoOp(row({ total: 10 }), { total: 10 })).toBe(true);
    expect(isNoOp(row(), { takenSource: "founder" })).toBe(true);
  });

  it("compares taken against the TYPED number, never the live one", () => {
    /*
     * Same defect, second site. On a flipped hamlet the box holds 4 and the
     * live count is 2. Comparing against `taken` would call re-typing 4 a
     * change and typing 2 a no-op, which is backwards on both counts.
     */
    expect(isNoOp(flipped(), { taken: 4 })).toBe(true);
    expect(isNoOp(flipped(), { taken: 2 })).toBe(false);
  });

  it("sees a real edit", () => {
    expect(isNoOp(row({ label: "Ridge" }), { label: "Ridge Hamlet North" })).toBe(false);
    expect(isNoOp(row({ total: 10 }), { total: null })).toBe(false);
    expect(isNoOp(row(), { takenSource: "reservations" })).toBe(false);
  });
});

describe("the list stays on screen once it has loaded", () => {
  /*
   * The defect, as a sequence rather than as a string. Every field edit saves
   * and then reloads, so `loadStarted` runs on a list a founder is typing
   * into. If it can put the first-load placeholder back, the whole list
   * unmounts mid-edit, focus goes with it, and the per-row Saving indicator
   * is inside the row that just disappeared.
   */
  const settled = loadSettled(loadStarted(INITIAL_PHASE));

  it("shows the placeholder for the first load and only then", () => {
    expect(showsPlaceholder(INITIAL_PHASE)).toBe(true);
    expect(showsPlaceholder(loadStarted(INITIAL_PHASE))).toBe(true);
    expect(showsPlaceholder(settled)).toBe(false);
  });

  it("NEVER puts the placeholder back on a later refresh", () => {
    // The assertion the old text check could not make. Saving a field starts
    // a load on a settled list, and that load must leave every row mounted.
    expect(showsPlaceholder(loadStarted(settled))).toBe(false);
  });

  it("stays put across many saves in a row", () => {
    let p = settled;
    for (let i = 0; i < 12; i++) {
      p = loadStarted(p);
      expect(showsPlaceholder(p)).toBe(false);
      p = loadSettled(p);
      expect(showsPlaceholder(p)).toBe(false);
    }
  });

  it("says it is refreshing only under a list that is actually there", () => {
    expect(showsRefreshing(INITIAL_PHASE)).toBe(false);
    expect(showsRefreshing(loadStarted(INITIAL_PHASE))).toBe(false);
    expect(showsRefreshing(loadStarted(settled))).toBe(true);
    expect(showsRefreshing(settled)).toBe(false);
  });
});

describe("what a public surface may claim about a hamlet before the numbers land", () => {
  const set = [{ structureKey: "ridgeA", open: 3, total: 5 }];

  it("says NOTHING while the answer is still in flight", () => {
    /*
     * The defect. `entries` starts null, `find` on null yields nothing,
     * nothing reads as absent, and absent reads as example. So the
     * reservation page told every visitor arriving from the map "The founder
     * has not set this hamlet yet" about a hamlet the founder HAD set, for
     * the length of a round trip, and then replaced it with the real count.
     *
     * A page that states a fact about the village and then retracts it is
     * worse than a page that waits, and the retraction is the tell: if the
     * first claim can be wrong, it was never a claim, it was a guess.
     */
    expect(hamletNumbers(null, "ridgeA")).toEqual({ kind: "unknown" });
    // Including for a hamlet that is about to come back as fully set: this is
    // the case the page got wrong, and it is the common one.
    expect(hamletNumbers(null, "ridgeA").kind).not.toBe("example");
  });

  it("calls a hamlet an example once the list HAS landed without it", () => {
    // An empty list is an answer. This is the one the page got right.
    expect(hamletNumbers([], "ridgeA")).toEqual({ kind: "example" });
    expect(hamletNumbers(set, "pondB")).toEqual({ kind: "example" });
  });

  it("reports the counts for a hamlet that is in the list", () => {
    expect(hamletNumbers(set, "ridgeA")).toEqual({ kind: "set", open: 3, total: 5 });
  });

  it("treats a FAILED read as example and never as unknown", () => {
    /*
     * Fail-closed, and the reason the three states are not two-plus-a-spinner.
     * The page catches a failed fetch into an empty list, so an unreachable
     * server settles on example and stays there. A network blip must never
     * promote example numbers to real ones, and must never leave the label
     * off forever either.
     */
    expect(hamletNumbers([], "ridgeA")).toEqual({ kind: "example" });
  });

  it("says nothing at all about a page that was handed no hamlet", () => {
    expect(hamletNumbers(set, "")).toEqual({ kind: "unknown" });
    expect(hamletNumbers(null, "")).toEqual({ kind: "unknown" });
  });

  it("never inspects a count for nullness, because presence is the predicate", () => {
    // A hamlet in `entries` with zero homes open is SET. Re-deriving the rule
    // from the counts is how three surfaces start disagreeing.
    expect(hamletNumbers([{ structureKey: "ridgeA", open: 0, total: 0 }], "ridgeA")).toEqual({
      kind: "set",
      open: 0,
      total: 0,
    });
  });

  it("keeps the reservation page asking this helper rather than the list", () => {
    /*
     * The page is a .tsx no test can render, so this is the same move the
     * panel guard makes: check that the decision still travels through the
     * function the cases above run. A page that goes back to
     * `entries?.find(...)` for its predicate puts the defect back where no
     * unit test can see it.
     */
    const page = readSource("../pages/ReserveHome.tsx");
    expect(page).toContain('from "@/lib/housingForm"');
    expect(page).toContain("hamletNumbers(entries, hamlet)");
    // The three branches, so the unknown state reaches the markup rather than
    // being computed and then folded back into two.
    expect(page).toContain('numbers.kind === "set"');
    expect(page).toContain('numbers.kind === "example"');
    // And no second predicate beside it: the page may look up a NAME, but it
    // must not decide whether a hamlet is set from a find of its own.
    expect(page).not.toMatch(/hamletIsSet/);
    expect(page).not.toMatch(/entries\s*\?\?\s*\[\]/);
  });
});

describe("Add hamlet cannot destroy a hamlet", () => {
  const rows = [row({ structureKey: "ridgeA", label: "Ridge Hamlet North", total: 10 })];

  it("refuses a key that is already in the list", () => {
    /*
     * It used to send {total: null, taken: null, label: null} for any key
     * that passed a format check, so typing an existing key into a box
     * labelled Add wiped that hamlet's counts and its name through the
     * upsert's UPDATE branch, with no confirmation and no undo.
     */
    const r = addHamlet(rows, "ridgeA");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toContain("ridgeA");
  });

  it("sends an EMPTY patch for a new key, so a race can destroy nothing", () => {
    const r = addHamlet(rows, "pondhomes");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.structureKey).toBe("pondhomes");
    expect(Object.keys(r.patch)).toEqual([]);
  });

  it("still refuses a key the map could never have minted", () => {
    expect(addHamlet(rows, "ridge A!").ok).toBe(false);
    expect(addHamlet(rows, "").ok).toBe(false);
    expect(addHamlet(rows, "x".repeat(65)).ok).toBe(false);
  });

  it("trims what a founder typed before deciding", () => {
    expect(addHamlet(rows, "  ridgeA  ").ok).toBe(false);
    const r = addHamlet(rows, "  ridgeB  ");
    expect(r.ok && r.structureKey).toBe("ridgeB");
  });
});

/**
 * The half that makes the half above matter.
 *
 * These read the shipped panel as text. A unit test of a helper proves
 * nothing if the component stops calling it, and reverting this surface is
 * exactly the edit that went unnoticed before. Text is a blunt instrument and
 * it is the only one that reaches a React component from a node-environment
 * suite in this repo.
 */
const readSource = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const PANEL = "../components/HousingAdminPanel.tsx";

describe("the panel still routes every decision through housingForm", () => {
  it("never reads the effective taken count anywhere", () => {
    const panel = readSource(PANEL);
    const hits = panel.match(/\.taken\b(?!Source)/g) ?? [];
    expect(
      hits,
      "HousingAdminPanel must never touch row.taken: it is the LIVE reservation count, " +
        "and a box bound to it writes the live count over the founder's typed number. " +
        "Use takenFieldValue(row) from @/lib/housingForm.",
    ).toEqual([]);
  });

  it("binds the homes-taken box through takenFieldValue", () => {
    const panel = readSource(PANEL);
    expect(panel).toContain("defaultValue={takenFieldValue(r)}");
    expect(panel).toContain("defaultValue={totalFieldValue(r)}");
    expect(panel).toContain("defaultValue={labelFieldValue(r)}");
  });

  it("asks the server whether a hamlet is set, and never re-derives it", () => {
    /*
     * PAID, AND SHIPPED TO MAIN BEFORE IT WAS CAUGHT. This line said
     * `r.open !== null`, and a comment above it claimed that was the predicate
     * publicEntries applies. It was not. `open` comes off the EFFECTIVE taken,
     * so a hamlet flipped to `reservations` with a homes_taken nobody typed
     * showed the founder a green badge reading "9 open of 9" beside an EMPTY
     * taken box, while /reserve told the visitor "Example numbers. The founder
     * has not set this hamlet yet."
     *
     * The fix landed with NO GATE ON IT. A reviewer put the one line back and
     * ran everything: 91 files, 1491 tests, 0 failed, exit 0, plus all seven
     * guards. Not one test moved. Nothing in this repo renders a component -
     * no @testing-library, no render() anywhere - so this file and its
     * siblings are the only thing standing between that line and production.
     *
     * A SOURCE GUARD IS WEAKER THAN A BEHAVIOUR TEST and this comment says so
     * rather than pretending otherwise: the sibling M6 guard was evaded once by
     * spelling the same defect a different way. Two assertions here, so a
     * rename alone cannot satisfy both: the panel must READ isSet off the row,
     * and `open` must not be compared to null anywhere in the file.
     */
    const panel = readSource(PANEL);
    // Plain string compares, deliberately. Three regex attempts in this session
    // were mangled before they reached the file: the last one wrote literal
    // backspace bytes (0x08) from a word-boundary escape, giving a regex that could never
    // match and a failure that read like a stale file read. cat -A found it.
    expect(panel).toContain("const isSet = r.isSet;");
    expect(panel).not.toContain("r.open !== null");
    expect(panel).not.toContain("r.open != null");
  });

  it("builds no request body of its own", () => {
    const panel = readSource(PANEL);
    expect(panel).toContain("JSON.stringify(patch)");
    // An inline patch object is how all four fields got restated on every
    // save. These three keys never appear as literals in the panel again.
    expect(panel).not.toMatch(/\btaken:\s/);
    expect(panel).not.toMatch(/\btakenSource:\s/);
    expect(panel).not.toMatch(/\btotal:\s/);
    /*
     * `label:` is allowed only as a plain quoted string, which is what the
     * status dropdown holds. The lookahead has to swallow the whitespace
     * itself: `\s*(?!")` lets `\s*` match nothing and then reads the space as
     * "not a quote", so it fires on every well-behaved line.
     */
    expect(panel).not.toMatch(/\blabel:(?!\s*")/);
  });

  it("imports the decisions instead of restating them", () => {
    const panel = readSource(PANEL);
    expect(panel).toContain('from "@/lib/housingForm"');
    for (const fn of ["addHamlet", "isNoOp", "takenFieldValue", "labelPatch", "sourcePatch"]) {
      expect(panel).toContain(fn);
    }
  });

  it("RUNS the panel's own transitions, and none of them can raise the placeholder", () => {
    /*
     * ── THE THIRD ATTEMPT AT THIS GUARD, AND THE FIRST THAT IS NOT SPELLING ──
     *
     * Attempt one was `not.toMatch(/setLoading\(true\)/)`: a string the
     * rewritten panel can never contain. It passed on a faithful revert that
     * put the placeholder back under the flag's new name.
     *
     * Attempt two was `not.toMatch(/setPhase\(\s*\{/)`, which catches exactly
     * one spelling of one defect. `setPhase((p) => ({ started: false,
     * refreshing: true }))` restores the defect precisely and leaves that
     * assertion, and this whole file, green. Both attempts share a shape: they
     * enumerate ways of WRITING the bug, and there are always more ways.
     *
     * So this one does not read the panel for a phrase. It extracts the
     * panel's phase machine and EXECUTES it:
     *
     *   1. find the state the placeholder predicate actually reads, by
     *      looking at what `showsPlaceholder(...)` is called on. Nothing here
     *      assumes the name `phase`.
     *   2. find the `useState` that owns that state, and take the SETTER's
     *      name from the binding pattern. Nothing assumes `setPhase`.
     *   3. collect every call to that setter anywhere in the file, evaluate
     *      each argument for real against the real helpers, and treat it as a
     *      transition: a function is applied, a value is assigned.
     *   4. close the reachable state set from a settled list under every one
     *      of those transitions, and assert the placeholder never comes back.
     *
     * That covers the object literal, the arrow returning an object literal,
     * a helper the panel defines for itself, and any renaming of any of it,
     * because it asks what the transitions DO rather than how they are typed.
     *
     * ── AND IT FAILS LOUD WHEN IT CANNOT RUN ─────────────────────────────
     * Every step below asserts it found something before using it. A check
     * that silently finds nothing reports exactly what a check that passed
     * reports, and that is the failure this whole round has been about: if
     * the predicate is renamed, or the setter is never called, or an argument
     * will not evaluate, this goes RED rather than vacuously green.
     */
    const panel = readSource(PANEL);
    const sf = ts.createSourceFile("HousingAdminPanel.tsx", panel, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

    const callsTo = (name: string): ts.CallExpression[] => {
      const found: ts.CallExpression[] = [];
      const walk = (n: ts.Node) => {
        if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === name) found.push(n);
        n.forEachChild(walk);
      };
      walk(sf);
      return found;
    };

    // 1. What does the placeholder actually read? Two sites: the hamlet list
    // and the reservations list. Both must be the same state, or one of them
    // is on a flag nothing here is watching.
    const predicateSites = callsTo("showsPlaceholder");
    expect(predicateSites.length, "the panel must ask showsPlaceholder at all").toBeGreaterThan(0);
    const stateNames = [...new Set(predicateSites.map((c) => c.arguments[0]!.getText(sf)))];
    expect(stateNames, "every placeholder reads the ONE phase value").toHaveLength(1);
    const stateName = stateNames[0];

    // 2. The useState that owns it, and the setter's real name.
    let setterName: string | null = null;
    let initialName: string | null = null;
    const findState = (n: ts.Node) => {
      if (
        ts.isVariableDeclaration(n) &&
        n.initializer &&
        ts.isCallExpression(n.initializer) &&
        ts.isIdentifier(n.initializer.expression) &&
        n.initializer.expression.text === "useState" &&
        ts.isArrayBindingPattern(n.name) &&
        n.name.elements.length === 2 &&
        n.name.elements[0]!.getText(sf) === stateName
      ) {
        setterName = n.name.elements[1]!.getText(sf);
        initialName = n.initializer.arguments[0]?.getText(sf) ?? null;
      }
      n.forEachChild(findState);
    };
    findState(sf);
    expect(setterName, `no useState owns ${stateName}`).toBeTruthy();
    expect(initialName, "the phase must start from the shared initial value").toBe("INITIAL_PHASE");

    // 3. Every transition the panel can perform, evaluated for real. The
    // helpers are passed in by name, so `loadStarted` here IS the exported
    // `loadStarted`, and a panel that invented its own is caught in step 4
    // rather than waved through.
    const scope = { INITIAL_PHASE, loadStarted, loadSettled, showsPlaceholder, showsRefreshing };
    const names = Object.keys(scope);
    const evaluate = (expr: string): unknown => {
      const js = ts
        .transpileModule(`(${expr})`, {
          compilerOptions: { target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.Preserve },
        })
        .outputText.replace(/;\s*$/, "")
        .trim();
      try {
        // eslint-disable-next-line no-new-func
        return new Function(...names, `return (${js});`)(...names.map((n) => (scope as any)[n]));
      } catch (err) {
        throw new Error(
          `the panel sets the phase to something this test cannot evaluate, so it cannot be ` +
            `checked and must not pass: ${expr}\n${String(err)}`,
        );
      }
    };

    const setterSites = callsTo(setterName!);
    expect(setterSites.length, `nothing ever calls ${setterName}, so this check cannot run`).toBeGreaterThan(0);
    const transitions = setterSites.map((site) => {
      const arg = site.arguments[0];
      expect(arg, `${setterName} was called with no argument`).toBeTruthy();
      const value = evaluate(arg!.getText(sf));
      const apply = typeof value === "function" ? (value as (p: any) => any) : () => value;
      return { source: arg!.getText(sf), apply };
    });

    // 4. Close the reachable set from a list that has already loaded, which is
    // the state every field edit starts from, and look for the placeholder.
    const settledPhase = loadSettled(loadStarted(INITIAL_PHASE));
    expect(showsPlaceholder(INITIAL_PHASE), "the placeholder belongs to the first load").toBe(true);
    expect(showsPlaceholder(settledPhase), "and is gone once that load settles").toBe(false);

    const seen = new Map<string, any>([[JSON.stringify(settledPhase), settledPhase]]);
    const queue = [settledPhase];
    while (queue.length) {
      const current = queue.shift();
      for (const t of transitions) {
        const next = t.apply(current);
        expect(
          showsPlaceholder(next),
          `${setterName}(${t.source}) puts the first-load placeholder back on a list that had ` +
            `already loaded. Every field edit runs a save and then a reload, so this unmounts ` +
            `the whole list mid-edit: focus goes with it, tabbing from a hamlet's name to its ` +
            `total becomes impossible, and the per-row Saving indicator lives inside the row ` +
            `that just disappeared.`,
        ).toBe(false);
        const key = JSON.stringify(next);
        if (!seen.has(key)) {
          seen.set(key, next);
          queue.push(next);
        }
      }
    }
    // The walk visited more than the state it started from, so the loop above
    // is not reporting "no counter-example" about a set of size one.
    expect(seen.size, "the transitions must actually move the phase").toBeGreaterThan(1);
  });

  it("keeps the list, and the per-row Saving note inside it, out of the placeholder branch", () => {
    /*
     * The other half of the same behaviour, and the half a state machine
     * cannot see: WHERE the list and its indicator are rendered.
     *
     * A phase that never raises the placeholder is worth nothing if the rows
     * are rendered in the placeholder's own branch, and a Saving note that
     * sits outside `rows.map` is not per-row at all. Both are positions in
     * the tree, so both are checked as positions in the tree rather than as
     * text: the row list must live in the branch taken when the placeholder
     * is NOT shown, and the Saving note must live inside the row.
     */
    const panel = readSource(PANEL);
    const sf = ts.createSourceFile("HousingAdminPanel.tsx", panel, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

    const conditionals: ts.ConditionalExpression[] = [];
    const rowMaps: ts.CallExpression[] = [];
    const walk = (n: ts.Node) => {
      if (ts.isConditionalExpression(n) && n.condition.getText(sf).startsWith("showsPlaceholder")) {
        conditionals.push(n);
      }
      if (
        ts.isCallExpression(n) &&
        ts.isPropertyAccessExpression(n.expression) &&
        n.expression.name.text === "map" &&
        n.expression.expression.getText(sf) === "rows"
      ) {
        rowMaps.push(n);
      }
      walk_(n);
    };
    const walk_ = (n: ts.Node) => n.forEachChild(walk);
    walk(sf);

    expect(conditionals.length, "the placeholder must be a branch this test can find").toBeGreaterThan(0);
    expect(rowMaps, "exactly one place renders the hamlet rows").toHaveLength(1);
    const list = rowMaps[0]!;

    // The rows render in the branch taken when the placeholder is NOT shown.
    const owning = conditionals.filter((c) => c.getStart(sf) < list.getStart(sf) && c.getEnd() > list.getEnd());
    expect(owning, "the hamlet list sits under a placeholder branch").toHaveLength(1);
    const branch = owning[0]!;
    expect(
      list.getStart(sf) > branch.whenFalse.getStart(sf) && list.getEnd() < branch.whenFalse.getEnd(),
      "the rows render when the placeholder is NOT shown, never inside it",
    ).toBe(true);

    // And the per-row Saving note is inside the row, where a founder editing
    // that row can see it, rather than beside the list.
    const saving = panel.indexOf(">Saving.<");
    expect(saving, "the panel still shows a Saving note").toBeGreaterThan(-1);
    expect(
      saving > list.getStart(sf) && saving < list.getEnd(),
      "the Saving note belongs to the row being saved, not to the list",
    ).toBe(true);

    // No second, unguarded flag beside the phase.
    expect(panel).not.toMatch(/useState\(true\)/);
  });

  it("keeps the Admin page out of the housing write path", () => {
    // The panel is the only writer. A second copy in Admin.tsx would be a
    // second set of rules, and only one of them would be under test.
    const admin = readSource("../pages/Admin.tsx");
    expect(admin).not.toContain("housing/availability");
    expect(admin).toContain("<HousingAdminPanel password={password} />");
  });
});
