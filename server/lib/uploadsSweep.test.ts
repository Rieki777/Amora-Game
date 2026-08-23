/**
 * THE REASONING, EXERCISED WITHOUT A VOLUME OR A SCHEMA.
 *
 * `classifyVolume` is pure so the safety argument can be tested directly:
 * every rule that keeps a file is a case here, and so is every rule that
 * makes one removable. The route suite proves the product; this proves the
 * decision, including the cases a live village would take months to produce.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  classifyVolume,
  humanBytes,
  indexByStamp,
  isProposalAttachment,
  namesReferencedIn,
  removableNames,
  removeFiles,
  stampOf,
  thumbNameOf,
  thumbParentOf,
  type VolumeEntry,
} from "./uploadsSweep";

const NOW = Date.UTC(2026, 7, 22, 12, 0, 0);
const DAY = 86_400_000;
const OLD = NOW - 400 * DAY;

function file(name: string, opts: Partial<VolumeEntry> = {}): VolumeEntry {
  return {
    name,
    bytes: 1024,
    mtimeMs: OLD,
    isFile: true,
    isSymbolicLink: false,
    isDirectory: false,
    ...opts,
  };
}

function judge(entries: VolumeEntry[], referenced: string[] = [], over: Partial<Parameters<typeof classifyVolume>[0]> = {}) {
  return classifyVolume({
    entries,
    referenced: new Set(referenced),
    graceDays: 30,
    now: NOW,
    complete: true,
    scan: { tables: 40, columns: 200, values: 5000 },
    ...over,
  });
}

const verdictOf = (r: ReturnType<typeof classifyVolume>, name: string) =>
  r.findings.find((f) => f.name === name)?.verdict ?? "kept";

describe("what carries this platform's stamp", () => {
  it("reads the millisecond out of every shape the five doors mint", () => {
    expect(stampOf("proposal-1755912345678-ab3de.jpg")).toBe(1755912345678);
    expect(stampOf("brand-1755912345678-ab3de.webp")).toBe(1755912345678);
    expect(stampOf("brand-1755912345678-ab3de.thumb.webp")).toBe(1755912345678);
    expect(stampOf("brand-font-1755912345678-ab3de.woff2")).toBe(1755912345678);
    expect(stampOf("place-1755912345678-ab3de.webp")).toBe(1755912345678);
    // The vault keeps the document's own name, and appends the extension raw.
    expect(stampOf("Cap-Table-2026-1755912345678-ab3de.pdf")).toBe(1755912345678);
    expect(stampOf("Cap-Table-2026-1755912345678-ab3de.XLSX")).toBe(1755912345678);
    // A document uploaded with no extension at all still comes out stamped.
    expect(stampOf("scan-1755912345678-ab3de")).toBe(1755912345678);
    // Math.random().toString(36) occasionally returns a short tail.
    expect(stampOf("proposal-1755912345678-7.jpg")).toBe(1755912345678);
  });

  it("says nothing about a name it did not mint", () => {
    expect(stampOf("operator-notes.txt")).toBeNull();
    expect(stampOf("hero.webp")).toBeNull();
    expect(stampOf("backup-20260101.tar")).toBeNull();
    // Twelve digits is not the stamp, and neither is a name with no tail.
    expect(stampOf("thing-175591234567-ab3de.jpg")).toBeNull();
    expect(stampOf("thing-1755912345678-.jpg")).toBeNull();
  });

  it("pairs a thumbnail with its full-size picture in both directions", () => {
    expect(thumbParentOf("brand-1-ab.thumb.webp")).toBe("brand-1-ab.webp");
    expect(thumbParentOf("brand-1-ab.webp")).toBeNull();
    expect(thumbNameOf("brand-1-ab.webp")).toBe("brand-1-ab.thumb.webp");
    expect(thumbNameOf("scan-with-no-extension")).toBeNull();
  });

  it("lets the proposal sweep reach the proposal door's files and no others", () => {
    expect(isProposalAttachment("proposal-1755912345678-ab3de.jpg")).toBe(true);
    // The whole point: a stranger posting this into `data.attachment` must not
    // be able to make the retention sweep unlink the village's hero image.
    expect(isProposalAttachment("brand-1755912345678-ab3de.webp")).toBe(false);
    expect(isProposalAttachment("place-1755912345678-ab3de.webp")).toBe(false);
    expect(isProposalAttachment("Cap-Table-1755912345678-ab3de.pdf")).toBe(false);
    expect(isProposalAttachment("proposal.jpg")).toBe(false);
  });
});

describe("which files a stored value names", () => {
  const onVolume = [
    "place-1755912345678-ab3de.webp",
    "place-1755912345678-ab3de.thumb.webp",
    "Cap-Table-1755999999999-zz9kk.pdf",
    "proposal-1755000000000-qq1ww.jpg",
  ];
  const idx = indexByStamp(onVolume);

  it("reads an address out of a URL, wherever it sits in the string", () => {
    expect(namesReferencedIn('{"hero":"/api/uploads/place-1755912345678-ab3de.webp"}', idx))
      .toEqual(["place-1755912345678-ab3de.webp"]);
    expect(namesReferencedIn("see /api/uploads/Cap-Table-1755999999999-zz9kk.pdf for the numbers", idx))
      .toEqual(["Cap-Table-1755999999999-zz9kk.pdf"]);
  });

  it("reads a BARE filename, which is how the proposal door stores one", () => {
    expect(namesReferencedIn('{"attachment":"proposal-1755000000000-qq1ww.jpg"}', idx))
      .toEqual(["proposal-1755000000000-qq1ww.jpg"]);
  });

  it("refuses to treat a row id as a pointer at a file", () => {
    // `pph-<stamp>` is the photograph's id. It carries the same millisecond as
    // the file and names nothing on the volume, and reading it as a reference
    // would keep a genuine orphan forever with no way to tell why.
    expect(namesReferencedIn('{"id":"pph-1755912345678-ab3de"}', idx)).toEqual([]);
  });

  it("does not let a thumbnail's address stand in for the full-size picture", () => {
    expect(namesReferencedIn("/api/uploads/place-1755912345678-ab3de.thumb.webp", idx))
      .toEqual(["place-1755912345678-ab3de.thumb.webp"]);
  });

  it("finds a name sitting behind a longer digit run", () => {
    expect(namesReferencedIn("20260101120000 /api/uploads/proposal-1755000000000-qq1ww.jpg", idx))
      .toEqual(["proposal-1755000000000-qq1ww.jpg"]);
  });

  it("finds every name in a value that holds several", () => {
    const hits = namesReferencedIn(
      "/api/uploads/place-1755912345678-ab3de.webp and /api/uploads/Cap-Table-1755999999999-zz9kk.pdf.",
      idx,
    );
    expect(hits.sort()).toEqual(["Cap-Table-1755999999999-zz9kk.pdf", "place-1755912345678-ab3de.webp"]);
  });
});

describe("the verdict on one file", () => {
  it("calls a stamped, unnamed, old file an orphan and says why", () => {
    const r = judge([file("Term-Sheet-1755000000000-ab3de.pdf")]);
    expect(verdictOf(r, "Term-Sheet-1755000000000-ab3de.pdf")).toBe("orphan");
    expect(removableNames(r)).toEqual(["Term-Sheet-1755000000000-ab3de.pdf"]);
    expect(r.findings[0].reason).toContain("No row anywhere in the database names this file");
    expect(r.tally.orphan.files).toBe(1);
  });

  it("never offers a file a row points at, however old it is", () => {
    const name = "Cap-Table-1700000000000-ab3de.pdf";
    const r = judge([file(name, { mtimeMs: OLD })], [name]);
    expect(removableNames(r)).toEqual([]);
    expect(r.tally.referenced.files).toBe(1);
    expect(r.findings).toEqual([]);
  });

  it("makes no claim about a file whose name it does not recognise", () => {
    const r = judge([file("operator-notes.txt")]);
    expect(verdictOf(r, "operator-notes.txt")).toBe("unknown");
    expect(removableNames(r)).toEqual([]);
    // The database was never asked about it, so the sentence must not say it was.
    expect(r.findings[0].reason).not.toContain("No row");
    expect(r.findings[0].reason).toContain("carries no stamp");
  });

  it("leaves a young file alone even when nothing names it", () => {
    const fresh = NOW - 3 * DAY;
    const r = judge([file(`Draft-${fresh}-ab3de.pdf`, { mtimeMs: fresh })]);
    expect(r.tally.recent.files).toBe(1);
    expect(removableNames(r)).toEqual([]);
  });

  it("uses the MORE RECENT of the two clocks, so a touched file is a young file", () => {
    // Stamped a year ago, written to yesterday. A superseded brand image that
    // something rewrote is still in flight somewhere.
    const r = judge([file(`brand-${OLD}-ab3de.webp`, { mtimeMs: NOW - DAY })]);
    expect(r.tally.recent.files).toBe(1);
    expect(removableNames(r)).toEqual([]);
  });

  it("never follows or offers a symlink, and never touches a folder", () => {
    const r = judge([
      file("link-1755000000000-ab3de.webp", { isFile: false, isSymbolicLink: true }),
      file("archive", { isFile: false, isDirectory: true, bytes: 0 }),
    ]);
    expect(removableNames(r)).toEqual([]);
    expect(r.tally.unknown.files).toBe(2);
    expect(r.findings.map((f) => f.reason).join(" ")).toContain("symbolic link");
  });
});

describe("a thumbnail and its picture are one decision", () => {
  const full = "brand-1700000000000-ab3de.webp";
  const thumb = "brand-1700000000000-ab3de.thumb.webp";

  it("keeps the thumbnail no stored string names, because the picture is kept", () => {
    // This is the live case: `BrandImageField` discards `data.thumbUrl`, so
    // judged alone every brand thumbnail ever written is an orphan.
    const r = judge([file(full), file(thumb)], [full]);
    expect(removableNames(r)).toEqual([]);
    expect(r.tally.referenced.files).toBe(2);
  });

  it("keeps the picture when only the thumbnail is named", () => {
    const r = judge([file(full), file(thumb)], [thumb]);
    expect(removableNames(r)).toEqual([]);
  });

  it("offers both when neither is named and both are past the window", () => {
    const r = judge([file(full), file(thumb)]);
    expect(removableNames(r).sort()).toEqual([thumb, full].sort());
  });

  it("keeps both when the picture is inside the grace window", () => {
    const r = judge([file(full, { mtimeMs: NOW - DAY }), file(thumb)]);
    expect(removableNames(r)).toEqual([]);
  });
});

describe("a scan that did not finish proves nothing", () => {
  it("offers no file at all, and says what stopped it", () => {
    const r = judge([file("Term-Sheet-1700000000000-ab3de.pdf")], [], {
      complete: false,
      incompleteReason: "forum_replies.body could not be read: connection lost",
    });
    expect(removableNames(r)).toEqual([]);
    expect(r.digest).toBe(judge([], [], { complete: false }).digest);
    expect(r.incompleteReason).toContain("forum_replies.body");
    // The file is still REPORTED. An unreadable table hides a file from the
    // count, and the count is the thing a founder is reading.
    expect(verdictOf(r, "Term-Sheet-1700000000000-ab3de.pdf")).toBe("orphan");
  });
});

describe("the fingerprint of the list", () => {
  const a = "Term-Sheet-1700000000000-ab3de.pdf";
  const b = "Deck-1700000000001-zz9kk.pdf";

  it("is stable for the same set in any order", () => {
    expect(judge([file(a), file(b)]).digest).toBe(judge([file(b), file(a)]).digest);
  });

  it("changes when a file joins, leaves, or changes size", () => {
    const base = judge([file(a)]).digest;
    expect(judge([file(a), file(b)]).digest).not.toBe(base);
    expect(judge([]).digest).not.toBe(base);
    expect(judge([file(a, { bytes: 2048 })]).digest).not.toBe(base);
  });

  it("gives an empty list its own digest, so it cannot be replayed into a full one", () => {
    expect(judge([]).digest).not.toBe(judge([file(a)]).digest);
  });
});

describe("removing the files, on a real directory", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uploads-sweep-"));
  afterAll(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* gone */ } });

  it("unlinks what it was given and reports the bytes", () => {
    fs.writeFileSync(path.join(dir, "gone.pdf"), Buffer.alloc(64, 1));
    fs.writeFileSync(path.join(dir, "stays.pdf"), Buffer.alloc(32, 1));
    const out = removeFiles(dir, ["gone.pdf"]);
    expect(out.removed).toEqual(["gone.pdf"]);
    expect(out.bytes).toBe(64);
    expect(fs.existsSync(path.join(dir, "stays.pdf"))).toBe(true);
  });

  it("refuses anything that is not a plain filename in this directory", () => {
    const out = removeFiles(dir, ["../stays.pdf", "sub/stays.pdf"]);
    expect(out.removed).toEqual([]);
    expect(out.kept.length).toBe(2);
    expect(fs.existsSync(path.join(dir, "stays.pdf"))).toBe(true);
  });

  it("says so when a file was already gone, and removes nothing else", () => {
    const out = removeFiles(dir, ["never-existed.pdf"]);
    expect(out.removed).toEqual([]);
    expect(out.kept[0].reason).toContain("already gone");
  });

  it("refuses a directory that happens to be named in the list", () => {
    fs.mkdirSync(path.join(dir, "archive"), { recursive: true });
    const out = removeFiles(dir, ["archive"]);
    expect(out.removed).toEqual([]);
    expect(fs.existsSync(path.join(dir, "archive"))).toBe(true);
  });
});

describe("bytes a founder reads", () => {
  it("names the unit the number is in", () => {
    expect(humanBytes(512)).toBe("512 bytes");
    expect(humanBytes(2048)).toBe("2 KB");
    expect(humanBytes(5 * 1024 * 1024)).toBe("5 MB");
  });
});
