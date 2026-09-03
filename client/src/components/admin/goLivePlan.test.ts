/**
 * THE PACKAGE AND THE PAGE MUST NOT DRIFT.
 *
 * The point of `goLivePlan.ts` is that the downloadable file and the on-screen
 * steps come from one set of objects. That is only true while the renderer
 * actually walks every one of those objects. A renderer that quietly stopped
 * emitting, say, the prerequisites would still produce a plausible markdown
 * file, and nobody reading the screen would ever find out. So the first block
 * below asserts, entry by entry, that everything in the four lists reaches the
 * rendered text.
 *
 * The second block checks the plan against the repository it describes: every
 * variable the plan names has to exist in `.env.example`, and the one variable
 * the plan calls retired has to be recorded as retired there. That is the
 * cross-check the old on-screen steps never had, and it is the reason those
 * steps were still asking founders for `JOURNEY_PASSWORD` months after it
 * stopped doing anything.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  GO_LIVE_ENV,
  GO_LIVE_PREREQS,
  GO_LIVE_REFERENCES,
  GO_LIVE_STEPS,
  goLivePackageFilename,
  needLabel,
  renderGoLivePackage,
} from "./goLivePlan";

const ROOT = path.resolve(import.meta.dirname, "../../../..");
const ENV_EXAMPLE = fs.readFileSync(path.join(ROOT, ".env.example"), "utf8");

describe("the go-live package is rendered from the plan, all of it", () => {
  const md = renderGoLivePackage({ villageName: "Rio Nuevo", generatedOn: "2026-09-02" });

  it("names the village and the date it was generated", () => {
    expect(md).toContain("# Go live: Rio Nuevo");
    expect(md).toContain("Generated 2026-09-02");
  });

  it("carries every prerequisite, with what it is for and what it costs", () => {
    expect(GO_LIVE_PREREQS.length).toBeGreaterThan(5);
    for (const p of GO_LIVE_PREREQS) {
      expect(md, `prereq ${p.id} heading`).toContain("### " + p.name);
      expect(md, `prereq ${p.id} purpose`).toContain(p.what);
      expect(md, `prereq ${p.id} cost`).toContain(p.cost);
      expect(md, `prereq ${p.id} requirement`).toContain(needLabel(p));
    }
  });

  it("carries every step, its reason, its points and its commands", () => {
    expect(GO_LIVE_STEPS.length).toBeGreaterThan(5);
    for (const s of GO_LIVE_STEPS) {
      expect(md, `step ${s.id} heading`).toContain(s.n + ". " + s.title);
      expect(md, `step ${s.id} reason`).toContain(s.why);
      for (const point of s.points) expect(md, `step ${s.id} point`).toContain(point);
      for (const c of s.commands ?? []) expect(md, `step ${s.id} command`).toContain(c.code);
    }
  });

  it("carries every variable and every repository reference", () => {
    for (const v of GO_LIVE_ENV) {
      expect(md, `env ${v.name}`).toContain(v.name);
      expect(md, `env ${v.name} consequence`).toContain(v.breaks);
      /* A cell reading "Only if" with no condition is the shape this row used
         to have, and it told a founder nothing. */
      expect(md, `env ${v.name} requirement`).toContain("| " + needLabel(v) + " |");
    }
    for (const r of GO_LIVE_REFERENCES) expect(md, `reference ${r.path}`).toContain(r.path);
  });

  it("prints the word UNVERIFIED wherever the plan is unsure, and only there", () => {
    const unsurePrereqs = GO_LIVE_PREREQS.filter((p) => p.certainty === "unverified");
    const unsureCommands = GO_LIVE_STEPS.flatMap((s) => s.commands ?? []).filter(
      (c) => c.unverified,
    );
    /* Both kinds exist today. If a later round verifies them all, this
       assertion is the thing that says so out loud instead of the marker
       silently going missing. */
    expect(unsurePrereqs.length + unsureCommands.length).toBeGreaterThan(0);

    /* Two mentions belong to the legend at the top of the file, which explains
       both words. Every other one is an entry that earned it. */
    const marks = md.split("UNVERIFIED").length - 1;
    expect(marks).toBe(unsurePrereqs.length + unsureCommands.length + 1);
  });

  it("works with no village name and no date", () => {
    const bare = renderGoLivePackage();
    expect(bare.startsWith("# Go live\n")).toBe(true);
    expect(bare).not.toContain("Generated ");
    expect(bare).toContain("### 1. " + GO_LIVE_STEPS[0]!.title);
  });

  it("names the file after the village, and falls back when it cannot", () => {
    expect(goLivePackageFilename("Rio Nuevo")).toBe("go-live-rio-nuevo.md");
    expect(goLivePackageFilename("  Willow Bend!  ")).toBe("go-live-willow-bend.md");
    expect(goLivePackageFilename("")).toBe("go-live.md");
    expect(goLivePackageFilename(undefined)).toBe("go-live.md");
    expect(goLivePackageFilename("!!!")).toBe("go-live.md");
  });
});

describe("the plan matches the repository it describes", () => {
  it("names only variables that .env.example actually documents", () => {
    for (const v of GO_LIVE_ENV) {
      expect(ENV_EXAMPLE, `${v.name} is not in .env.example`).toMatch(
        new RegExp("^" + v.name + "=", "m"),
      );
    }
  });

  it("covers every variable .env.example calls required", () => {
    /* The four under the REQUIRED heading, read off the file rather than
       copied, so a fifth added there fails this test instead of quietly
       missing from the package a founder is handed. */
    const requiredBlock = ENV_EXAMPLE.split("# ── STRONGLY RECOMMENDED")[0] ?? "";
    const declared = [...requiredBlock.matchAll(/^([A-Z][A-Z0-9_]+)=/gm)].map((m) => m[1]!);
    expect(declared.length).toBeGreaterThan(3);
    const named = new Set(GO_LIVE_ENV.map((v) => v.name));
    for (const name of declared) expect(named.has(name), `${name} missing from the plan`).toBe(true);
  });

  it("does not ask a founder for the retired JOURNEY_PASSWORD", () => {
    /* .env.example records it as retired; the old on-screen step still set it.
       The plan mentions it once, to say not to. */
    expect(ENV_EXAMPLE).toContain("`JOURNEY_PASSWORD` shows up in older notes");
    expect(GO_LIVE_ENV.some((v) => v.name === "JOURNEY_PASSWORD")).toBe(false);
    const md = renderGoLivePackage();
    expect(md).toContain("Do not set JOURNEY_PASSWORD");
  });

  it("points only at repository files that exist", () => {
    for (const r of GO_LIVE_REFERENCES) {
      expect(fs.existsSync(path.join(ROOT, r.path)), `${r.path} does not exist`).toBe(true);
    }
  });

  it("does not send a founder back to client/index.html for a tag it does not carry", () => {
    const html = fs.readFileSync(path.join(ROOT, "client/index.html"), "utf8");
    /* The words appear once, inside the comment explaining why the file stays
       neutral. What matters is that no TAG declares either of them, which is
       what the old on-screen step told a founder to go and edit. */
    expect(html).not.toMatch(/property\s*=\s*"og:image"/);
    expect(html).not.toMatch(/name\s*=\s*"twitter:image"/);
    expect(html).toContain("NEUTRAL BY CONSTRUCTION");
    const step = GO_LIVE_STEPS.find((s) => s.id === "metadata");
    expect(step?.points.join(" ")).toContain("carries no og:image");
  });
});
