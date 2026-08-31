/**
 * What this suite is allowed to claim.
 *
 * It proves the archive is a well-formed POSIX ustar stream by decoding it
 * back with an independent reader written here, byte by byte, rather than by
 * calling the same code that wrote it. That is the only kind of round trip
 * worth anything: a writer checked against its own reader agrees with itself
 * and can be wrong together.
 *
 * It does NOT prove GNU tar accepts it. Nothing running inside vitest can:
 * that assertion needs the real binary and it is made out of band, with the
 * transcript recorded in the lane report. A test proves a behaviour is
 * intended. It never proves it is correct.
 */
import { createHash } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { PassThrough } from "stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MANIFEST_ENTRY,
  STATUS_ENTRY,
  manifestText,
  planUploadsArchive,
  streamUploadsArchive,
} from "./uploadsArchive";

let dir = "";

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "uploads-archive-"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

/** Collect a stream into one Buffer. Test-only: the route never does this. */
async function drain(fn: (sink: NodeJS.WritableStream) => Promise<unknown>) {
  const sink = new PassThrough();
  const chunks: Buffer[] = [];
  sink.on("data", (c: Buffer) => chunks.push(c));
  const result = await fn(sink);
  sink.end();
  await new Promise((r) => sink.on("end", r));
  return { bytes: Buffer.concat(chunks), result };
}

/**
 * An independent ustar reader. Deliberately NOT sharing a line with the
 * writer: it re-derives every offset from the format, so a writer that put the
 * size field in the wrong place fails here instead of agreeing with itself.
 */
function untar(buf: Buffer): { name: string; body: Buffer }[] {
  const out: { name: string; body: Buffer }[] = [];
  let off = 0;
  let pendingPath: string | null = null;
  while (off + 512 <= buf.length) {
    const head = buf.subarray(off, off + 512);
    if (head.every((b) => b === 0)) break;
    // The checksum is re-computed, not trusted: a header this reader accepts
    // is one any other tar would accept.
    const stated = parseInt(head.subarray(148, 154).toString("ascii").trim(), 8);
    const blanked = Buffer.from(head);
    blanked.write("        ", 148, "ascii");
    let sum = 0;
    for (const b of blanked) sum += b;
    if (sum !== stated) throw new Error(`bad tar checksum at offset ${off}`);

    const rawName = head.subarray(0, 100).toString("utf8").replace(/\0.*$/, "");
    const size = parseInt(head.subarray(124, 135).toString("ascii").replace(/\0.*$/, ""), 8);
    const typeflag = head.subarray(156, 157).toString("ascii");
    const body = buf.subarray(off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;

    if (typeflag === "x") {
      const m = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(body.toString("utf8"));
      pendingPath = m ? m[1]! : null;
      continue;
    }
    out.push({ name: pendingPath ?? rawName, body: Buffer.from(body) });
    pendingPath = null;
  }
  return out;
}

const parseKv = (text: string) => {
  const kv: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const m = /^([a-zA-Z0-9]+)=(.*)$/.exec(line);
    if (m) kv[m[1]!] = m[2]!;
  }
  return kv;
};

describe("planUploadsArchive", () => {
  it("counts regular files, sums their bytes, and hashes the first name as the canary", async () => {
    fs.writeFileSync(path.join(dir, "b-second.txt"), "second");
    fs.writeFileSync(path.join(dir, "a-first.txt"), "first!!");
    fs.mkdirSync(path.join(dir, "a-directory"));

    const plan = await planUploadsArchive(dir);
    expect(plan.files.map((f) => f.name)).toEqual(["a-first.txt", "b-second.txt"]);
    expect(plan.totalBytes).toBe(13);
    expect(plan.canary).toBe("a-first.txt");
    expect(plan.canarySha256).toBe(createHash("sha256").update("first!!").digest("hex"));
    expect(plan.oversize).toEqual([]);
  });

  it("answers for a volume that does not exist yet rather than throwing", async () => {
    const plan = await planUploadsArchive(path.join(dir, "no-such-volume"));
    expect(plan.files).toEqual([]);
    expect(plan.totalBytes).toBe(0);
    expect(plan.canary).toBeNull();
    // The empty answer must be distinguishable from a failed one by a drill,
    // which is what the status trailer is for. Here: no canary, no hash.
    expect(plan.canarySha256).toBeNull();
  });
});

describe("streamUploadsArchive", () => {
  it("round-trips every file, with the manifest first and the status last", async () => {
    fs.writeFileSync(path.join(dir, "one.txt"), "hello");
    fs.writeFileSync(path.join(dir, "two.bin"), Buffer.from([0, 1, 2, 250, 255]));
    // Not a multiple of 512, so the padding maths is exercised rather than
    // accidentally right.
    fs.writeFileSync(path.join(dir, "three.dat"), Buffer.alloc(1000, 7));

    const plan = await planUploadsArchive(dir);
    const { bytes, result } = await drain((sink) => streamUploadsArchive(dir, plan, sink));

    expect(bytes.length % 512).toBe(0);
    expect(bytes.subarray(bytes.length - 1024).every((b) => b === 0)).toBe(true);

    const entries = untar(bytes);
    expect(entries[0]!.name).toBe(MANIFEST_ENTRY);
    expect(entries[entries.length - 1]!.name).toBe(STATUS_ENTRY);
    expect(entries.map((e) => e.name)).toEqual([
      MANIFEST_ENTRY,
      "one.txt",
      "three.dat",
      "two.bin",
      STATUS_ENTRY,
    ]);
    expect(entries[1]!.body.toString()).toBe("hello");
    expect(entries[2]!.body.equals(Buffer.alloc(1000, 7))).toBe(true);
    expect(entries[3]!.body.equals(Buffer.from([0, 1, 2, 250, 255]))).toBe(true);

    const status = parseKv(entries[entries.length - 1]!.body.toString());
    expect(status.complete).toBe("yes");
    expect(status.entries).toBe("3");
    expect(status.degradedCount).toBe("0");
    expect(result).toMatchObject({ entries: 3, complete: true, degraded: [] });
  });

  it("writes a manifest a shell drill can grep, matching the bytes it shipped", async () => {
    fs.writeFileSync(path.join(dir, "aaa.txt"), "canary contents");
    fs.writeFileSync(path.join(dir, "zzz.txt"), "other");

    const plan = await planUploadsArchive(dir);
    const { bytes } = await drain((sink) => streamUploadsArchive(dir, plan, sink));
    const entries = untar(bytes);
    const manifest = parseKv(entries[0]!.body.toString());

    expect(manifest.files).toBe("2");
    expect(manifest.bytes).toBe("20");
    expect(manifest.canary).toBe("aaa.txt");
    expect(manifest.canarySha256).toBe(
      createHash("sha256").update("canary contents").digest("hex"),
    );
    expect(manifest.archiveEntries).toBe("4");
    expect(manifest.excludedOversize).toBe("0");
    // The drill re-hashes the canary out of the archive. That must agree with
    // what the manifest promised, or the manifest is describing a different
    // export than the one it travelled in.
    const canaryEntry = entries.find((e) => e.name === "aaa.txt")!;
    expect(createHash("sha256").update(canaryEntry.body).digest("hex")).toBe(manifest.canarySha256);
  });

  it("keeps the archive aligned and NAMES the file when one vanishes mid-export", async () => {
    fs.writeFileSync(path.join(dir, "aa-stays.txt"), "still here");
    fs.writeFileSync(path.join(dir, "bb-goes.txt"), Buffer.alloc(4096, 9));
    fs.writeFileSync(path.join(dir, "cc-after.txt"), "after the hole");

    const plan = await planUploadsArchive(dir);
    // The race, made deterministic: the plan has stated 4096 bytes and the
    // file is gone before the pump reaches it. This is the daily retention
    // sweep, or a member deleting a photo, landing inside the export window.
    fs.rmSync(path.join(dir, "bb-goes.txt"));

    const { bytes, result } = await drain((sink) => streamUploadsArchive(dir, plan, sink));
    const entries = untar(bytes);

    // Alignment survived: the entry AFTER the hole is readable and intact,
    // which is the whole reason the hole is zero-padded to its stated length.
    expect(entries.map((e) => e.name)).toEqual([
      MANIFEST_ENTRY,
      "aa-stays.txt",
      "bb-goes.txt",
      "cc-after.txt",
      STATUS_ENTRY,
    ]);
    expect(entries[3]!.body.toString()).toBe("after the hole");
    expect(entries[2]!.body.length).toBe(4096);

    // And the archive says so. Counts and byte totals BOTH still match here,
    // so nothing except this line distinguishes a faithful backup from one
    // with a 4 KB hole of zeroes in it.
    const status = parseKv(entries[entries.length - 1]!.body.toString());
    expect(status.complete).toBe("no");
    expect(status.degradedCount).toBe("1");
    expect(status.degraded).toBe("bb-goes.txt");
    expect((result as { degraded: string[] }).degraded).toEqual(["bb-goes.txt"]);
  });

  it("carries a name too long for a ustar header through a PAX record", async () => {
    const long = `${"n".repeat(140)}.txt`;
    fs.writeFileSync(path.join(dir, long), "long name payload");

    const plan = await planUploadsArchive(dir);
    const { bytes } = await drain((sink) => streamUploadsArchive(dir, plan, sink));
    const entries = untar(bytes);

    const found = entries.find((e) => e.name === long);
    expect(found, "the long-named file kept its real name").toBeTruthy();
    expect(found!.body.toString()).toBe("long name payload");
  });

  it("produces a readable, complete archive for an empty volume", async () => {
    const plan = await planUploadsArchive(dir);
    const { bytes } = await drain((sink) => streamUploadsArchive(dir, plan, sink));
    const entries = untar(bytes);

    expect(entries.map((e) => e.name)).toEqual([MANIFEST_ENTRY, STATUS_ENTRY]);
    const manifest = parseKv(entries[0]!.body.toString());
    expect(manifest.files).toBe("0");
    expect(manifest.canary).toBe("");
    // files=0 is a young village, not a broken export, and complete=yes is the
    // only thing that tells a drill which one it is looking at.
    expect(parseKv(entries[1]!.body.toString()).complete).toBe("yes");
  });

  it("does not include its own manifest names if the volume happens to hold them", async () => {
    fs.writeFileSync(path.join(dir, MANIFEST_ENTRY), "an impostor");
    fs.writeFileSync(path.join(dir, "real.txt"), "real");

    const plan = await planUploadsArchive(dir);
    expect(plan.files.map((f) => f.name)).toEqual(["real.txt"]);
    const { bytes } = await drain((sink) => streamUploadsArchive(dir, plan, sink));
    const entries = untar(bytes);
    expect(entries.filter((e) => e.name === MANIFEST_ENTRY)).toHaveLength(1);
    expect(entries[0]!.body.toString()).not.toBe("an impostor");
  });

  it("settles instead of hanging when the reader goes away mid-stream", async () => {
    // 6 MB across six files, so the sink's high-water mark is crossed and the
    // writer is genuinely waiting on drain when the socket dies.
    for (let i = 0; i < 6; i++) {
      fs.writeFileSync(path.join(dir, `big-${i}.bin`), Buffer.alloc(1024 * 1024, i));
    }
    const plan = await planUploadsArchive(dir);
    const sink = new PassThrough();
    // No reader at all: nothing consumes, so `write` returns false and the
    // only thing that can settle the export is the destroy below.
    const run = streamUploadsArchive(dir, plan, sink);
    setTimeout(() => sink.destroy(), 50);
    await expect(run).rejects.toThrow(/went away mid-stream/i);
    // A short timeout ON PURPOSE. The bug this covers is a hang, and a hang
    // under the 120s file default reads as "the suite is slow" for two
    // minutes before it reads as a failure. It failed here at ten seconds
    // first time out, which is how the guard above came to be written.
  }, 10_000);
});

describe("manifestText", () => {
  it("is line-oriented key=value with no leading whitespace, for grep in a shell", () => {
    const text = manifestText({
      files: [{ name: "x", size: 3, mtimeMs: 0 }],
      totalBytes: 3,
      canary: "x",
      canarySha256: "abc",
      oversize: [],
      takenAt: "2026-08-31T00:00:00.000Z",
    });
    for (const line of text.split("\n")) {
      if (!line || line.startsWith("#")) continue;
      expect(line).toMatch(/^[a-zA-Z0-9]+=/);
    }
    expect(text).toContain("canarySha256=abc");
  });
});
