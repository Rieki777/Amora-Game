/**
 * THE BADGE PAGE'S VOCABULARY AGAINST THE COLUMN THAT FEEDS IT.
 *
 * Same class again, and here the authority IS a migration: `badges`.`kind` is
 * declared `enum('self','earned','granted','warning','hypha')` by
 * `drizzle/0023_badges.sql`, so the database is what the route selects and the
 * migration is what the page answers to. Read the way
 * gameMechanicsStates.test.ts reads `mechanics_proposals`.`status`: off the
 * LAST migration to declare the column, because that is the one that ran.
 *
 * WHAT MAKES THIS ONE WORSE THAN A BLANK. The page read
 * `KIND_META[b.kind] ?? KIND_META.granted`, which is guarded, never throws,
 * and states something false. Badge kinds are how this village says what a
 * badge DOES: the one gate is `admin -> badgeDenies -> role ->
 * badgeCapabilities -> stage`, and `warning` is the kind that DENIES, beating
 * role and stage with only admin above it. A sixth kind added to that column
 * carrying deny semantics would have rendered to every member as a friendly
 * amber "granted" award. The fallback now reads the raw kind and claims
 * nothing.
 *
 * A SIXTH BADGE KIND ADDED BY A MIGRATION FAILS THIS FILE.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BADGE_KIND_META } from "./Badges";

const ROOT = path.resolve(__dirname, "../../..");

/** The kinds the column can hold, off the LAST migration that declares it. */
function badgeKindsFromMigrations(): string[] {
  const files = fs
    .readdirSync(path.join(ROOT, "drizzle"))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  let last: string[] | null = null;
  let from = "";
  for (const f of files) {
    const sql = fs.readFileSync(path.join(ROOT, "drizzle", f), "utf8");
    // Both shapes that declare it: the CREATE TABLE body and every ALTER.
    const re = /`kind`\s+enum\(([^)]*)\)/gi;
    for (const m of sql.matchAll(re)) {
      const body = m[1];
      // Several tables carry a `kind` enum. This is the badges one.
      if (!body || !/'granted'/.test(body)) continue;
      last = [...body.matchAll(/'([^']+)'/g)].map((v) => v[1]);
      from = f;
    }
  }
  if (!last) throw new Error("no badges kind enum found in drizzle/");
  // eslint-disable-next-line no-console
  console.log(`[states] ${last.length} badge kind(s), last declared in ${from}: ${last.join(", ")}`);
  return last;
}

describe("the badges page speaks every kind the column can hold", () => {
  it("has a chip for every badge kind the migrations declare", () => {
    const kinds = badgeKindsFromMigrations();
    // A control on the reader: `warning` is the kind that carries denies, and
    // reading a different table's `kind` enum could not produce it.
    expect(kinds, "the enum read does not look like badge kinds").toContain("warning");
    const missing = kinds.filter((k) => !(k in BADGE_KIND_META));
    expect(missing, `no chip copy for badge kind(s): ${missing.join(", ")}`).toEqual([]);
  });

  it("never presents an unfamiliar kind as one of the real ones", () => {
    // The shape that shipped: `?? KIND_META.granted`, which paints an unknown
    // kind as an award. Read off the source so the assertion survives the
    // helper being renamed.
    const src = fs.readFileSync(path.join(ROOT, "client/src/pages/Badges.tsx"), "utf8");
    expect(src, "the fallback still guesses a real kind").not.toMatch(/\?\?\s*KIND_META\.\w+/);
    const labels = Object.values(BADGE_KIND_META).map((v) => v.label);
    expect(labels).toContain("warning");
    // The unknown chip reads the raw kind, so it cannot collide with a label.
    const m = src.match(/label:\s*String\(kind \|\| "([^"]+)"\)/);
    expect(m, "the unknown-kind chip no longer reads the raw kind").toBeTruthy();
    expect(labels).not.toContain(m![1]);
  });
});
