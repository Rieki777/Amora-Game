/**
 * Generate shared/lunarTable.json: the true new moons, full moons and season
 * instants for 2020 to 2050, as whole minutes since the Unix epoch.
 *
 * Run once, check the output in, never at runtime:
 *
 *   node scripts/gen-lunar-table.mjs
 *
 * astronomy-engine (MIT, Meeus-derived, about a minute of accuracy across
 * this range) is a dev dependency only. The table is a few kilobytes of
 * integers, so the client bundle carries the sky without carrying the
 * ephemeris library, and every environment reads the identical instants
 * (deterministic-first: no clock, no network, no library version drift).
 *
 * Why 2020 to 2050: far enough back to cover every gratitude cycle a
 * village has settled, far enough forward that nobody alive on the
 * platform today needs to regenerate it. Regenerating with a newer
 * astronomy-engine must not move any instant by more than a minute or two;
 * shared/lunar.test.ts pins the 2026 to 2028 new moons to a fixture taken
 * from the same run so a silent change fails loudly.
 *
 * Seed: round4/moons-2025-2028.mjs, the research memo's own probe.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as A from "astronomy-engine";

const FROM_YEAR = 2020;
const TO_YEAR = 2050;

const toMinutes = (d) => Math.round(d.getTime() / 60_000);

const newMoons = [];
const fullMoons = [];
let q = A.SearchMoonQuarter(new Date(Date.UTC(FROM_YEAR, 0, 1)));
while (q.time.date.getUTCFullYear() <= TO_YEAR) {
  if (q.quarter === 0) newMoons.push(toMinutes(q.time.date));
  if (q.quarter === 2) fullMoons.push(toMinutes(q.time.date));
  q = A.NextMoonQuarter(q);
}

// [year, marEquinox, junSolstice, sepEquinox, decSolstice] per year.
const seasons = [];
for (let y = FROM_YEAR; y <= TO_YEAR; y++) {
  const s = A.Seasons(y);
  seasons.push([
    y,
    toMinutes(s.mar_equinox.date),
    toMinutes(s.jun_solstice.date),
    toMinutes(s.sep_equinox.date),
    toMinutes(s.dec_solstice.date),
  ]);
}

const table = {
  generatedBy: "scripts/gen-lunar-table.mjs, astronomy-engine",
  unit: "minutes since 1970-01-01T00:00:00Z, rounded to the minute",
  fromYear: FROM_YEAR,
  toYear: TO_YEAR,
  newMoons,
  fullMoons,
  seasons,
};

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "..", "shared", "lunarTable.json");
fs.writeFileSync(out, JSON.stringify(table) + "\n");
console.log(
  `wrote ${path.relative(process.cwd(), out)}: ${newMoons.length} new moons, ${fullMoons.length} full moons, ${seasons.length} years of seasons`,
);
