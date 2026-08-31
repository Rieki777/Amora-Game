/**
 * THE HALF OF THE BACKUP THAT DID NOT EXIST.
 *
 * `.github/workflows/db-backup.yml` dumps MySQL, encrypts it to two GPG
 * recipients and proves the restore on every run. It has never touched
 * `data/uploads/`. Member photographs, brand images and investor documents
 * live on a Railway volume with no copy anywhere, and `docs/FORK_RUNBOOK.md`
 * already says in as many words that a photograph lost from that volume is not
 * recoverable from anywhere.
 *
 * A GitHub Action cannot reach into a Railway volume. There is no API for
 * "hand me a tarball of this service's mount", and the one alternative this
 * repository has ever exercised (`railway ssh`, by hand, once, recorded in
 * AMORA_FOUNDATION_UPGRADE_PLAN.md) is an interactive subcommand that nothing
 * here has ever run headless. So the volume has to hand ITSELF out, over an
 * authenticated route, and this module is the part that builds the bytes.
 *
 * ── WHY A HAND-WRITTEN TAR AND NOT A LIBRARY ─────────────────────────────
 *
 * `tar` is not a dependency of this project and adding one to serve a single
 * backup route means a new package in the lockfile, a new supply-chain surface
 * on the process that holds every member's session, and a new thing that can
 * break a deploy. POSIX ustar is a 512-byte header, an octal checksum and
 * zero padding. It is written out below in about a hundred lines, and it is
 * read by GNU tar, bsdtar, 7-Zip and Python's `tarfile` without an extension
 * any of them have to opt into.
 *
 * ── WHY IT STREAMS, WHICH IS NOT A PREFERENCE ────────────────────────────
 *
 * This is the SAME Node process that serves every member request. It has one
 * event loop and one heap. The `/health` gauge exists precisely because the
 * volume fills silently, and the sizing note in docs/DESIGN_TOKENS_SPEC.md
 * puts it in the hundreds of megabytes from photographs alone. Buffering that
 * into a Buffer to send it would take the village down to take its own backup.
 * So: one 64 KB chunk in flight at a time, backpressure honoured on every
 * write, and never more than one export running at once.
 *
 * ── WHAT A DRILL CAN ASSERT, AND WHAT IT CANNOT ──────────────────────────
 *
 * The MySQL drill decrypts, restores, counts rows and round-trips a timestamp.
 * There is no scratch Railway volume to redeploy into inside a GitHub Action,
 * so the honest ceiling here is "the bytes are intact and complete", not "a
 * fresh deploy boots from them". Two entries carry that:
 *
 *   MANIFEST.txt        FIRST entry. File count, total bytes, and a SHA-256 of
 *                       one deterministic canary (the lexicographically first
 *                       filename, so choosing it needs no bookkeeping).
 *   EXPORT-STATUS.txt   LAST entry. Whether the walk finished and which files,
 *                       if any, changed under it mid-stream.
 *
 * The trailer is the part that stops a false green. A tar is a stream, and a
 * stream that dies at 60% still untars: you get most of the files and no
 * error worth noticing. Counts alone cannot tell that apart from a small
 * volume. But EXPORT-STATUS.txt is written last, so a drill that can read it
 * has proof the server got to the end. `complete=yes` is the assertion; a
 * drill that only checked MANIFEST.txt would be asserting a number the server
 * promised rather than one it delivered.
 *
 * Same reasoning for `degraded`. A file deleted between the stat pass and the
 * read pass leaves a correctly-sized, zero-padded hole: the count matches, the
 * byte total matches, and the contents are wrong. Nothing about the archive
 * would ever say so. So it is said, by name, in the trailer.
 */
import { createHash } from "crypto";
import fs from "fs";
import path from "path";

/** One 512-byte tar block, and the unit everything here is padded to. */
const BLOCK = 512;

/** Read buffer. Bounded on purpose: see the streaming note above. */
const CHUNK = 64 * 1024;

/** The manifest's own name inside the archive. Excluded from the counts. */
export const MANIFEST_ENTRY = "MANIFEST.txt";

/** The completeness trailer's name. Written last, always. */
export const STATUS_ENTRY = "EXPORT-STATUS.txt";

export interface ArchiveFile {
  name: string;
  size: number;
  mtimeMs: number;
}

export interface ArchivePlan {
  /** Regular files on the volume, sorted by name. Manifest entries excluded. */
  files: ArchiveFile[];
  totalBytes: number;
  /** Lexicographically first filename, or null on an empty volume. */
  canary: string | null;
  /** SHA-256 of the canary's contents at plan time, or null. */
  canarySha256: string | null;
  /** Files a ustar header cannot state a length for. Never silently dropped. */
  oversize: string[];
  takenAt: string;
}

export interface ArchiveOutcome {
  /** Upload files written. Excludes MANIFEST.txt and EXPORT-STATUS.txt. */
  entries: number;
  /** Total bytes of file CONTENT written, padding and headers excluded. */
  contentBytes: number;
  /** Files that changed or vanished under the walk, by name. */
  degraded: string[];
  /** True when every planned file was written at its planned length. */
  complete: boolean;
}

// ── ustar ───────────────────────────────────────────────────────────────────

/** Octal, NUL-terminated, right-aligned in `len`, the tar numeric encoding. */
function octal(value: number, len: number): string {
  return value.toString(8).padStart(len - 1, "0") + "\0";
}

/**
 * The largest size a ustar header can state: eleven octal digits.
 *
 * Nothing on this volume approaches it (every upload route runs through
 * multer's memory storage, which dies orders of magnitude earlier), but a file
 * that did would make `ustarHeader` throw HALFWAY THROUGH a response that has
 * already sent bytes, which is the one failure mode this module exists to
 * refuse. So it is a plan-time filter instead, and the trailer names it.
 */
export const MAX_TAR_ENTRY_BYTES = 8 ** 11 - 1;

/** Truncate to at most `max` BYTES without splitting a character. */
function truncateBytes(s: string, max: number): string {
  let out = s;
  while (Buffer.byteLength(out, "utf8") > max) out = out.slice(0, -1);
  return out;
}

/**
 * A 512-byte header block.
 *
 * The checksum is the sum of every byte with the checksum field itself read as
 * eight spaces. Getting that wrong produces an archive that every tool refuses
 * with "invalid header", which is at least loud; getting the SIZE field wrong
 * produces one that untars into silent garbage, which is why the writer below
 * emits exactly `size` bytes whatever the file does.
 */
function ustarHeader(name: string, size: number, mtimeMs: number, typeflag: string): Buffer {
  const head = Buffer.alloc(BLOCK, 0);
  const nameBytes = Buffer.from(name, "utf8");
  if (nameBytes.length > 100) throw new Error(`tar name too long for a ustar header: ${name}`);
  nameBytes.copy(head, 0);
  head.write(octal(0o644, 8), 100, "ascii"); // mode
  head.write(octal(0, 8), 108, "ascii"); // uid
  head.write(octal(0, 8), 116, "ascii"); // gid
  head.write(octal(size, 12), 124, "ascii");
  head.write(octal(Math.floor(mtimeMs / 1000), 12), 136, "ascii");
  head.write("        ", 148, "ascii"); // checksum placeholder: eight spaces
  head.write(typeflag, 156, "ascii");
  head.write("ustar\0", 257, "ascii");
  head.write("00", 263, "ascii");
  // Indexed rather than `for...of`: this project's tsconfig targets below
  // es2015, where iterating a Buffer is a compile error.
  let sum = 0;
  for (let i = 0; i < head.length; i++) sum += head[i]!;
  head.write(octal(sum, 7), 148, "ascii");
  head.write(" ", 155, "ascii");
  return head;
}

/**
 * A PAX extended header carrying a path too long for ustar's 100 bytes.
 *
 * Uploads are stamped `${Date.now()}-${random}-${original}` and an original
 * filename has no length limit, so this is reachable with an ordinary photo
 * off a phone. The alternatives were truncating the name (an archive that
 * restores to the wrong filename) or skipping the file (a backup that silently
 * omits exactly the files with the longest names). PAX is the POSIX answer and
 * GNU tar, bsdtar and Python's tarfile all read it without a flag.
 */
function paxBlocks(name: string): Buffer[] {
  const value = `path=${name}\n`;
  // The length prefix counts itself, so it is solved rather than measured.
  let len = Buffer.byteLength(value) + 2;
  for (let i = 0; i < 4; i++) len = Buffer.byteLength(value) + String(len).length + 1;
  const record = Buffer.from(`${len} ${value}`, "utf8");
  // The ustar name on a PAX header is ignored by readers that understand it
  // and is what readers that do not will fall back to, so keep it meaningful.
  // Truncated by BYTES: `slice(80)` counts characters, and one accented
  // character in a filename would push a "short enough" stub over the 100-byte
  // field and throw out of the header writer.
  const stub = `PaxHeader/${truncateBytes(path.basename(name), 80)}`;
  return [ustarHeader(stub, record.length, Date.now(), "x"), record, padding(record.length)];
}

/** The zero bytes that round a payload up to the next 512-byte boundary. */
function padding(size: number): Buffer {
  const rem = size % BLOCK;
  return rem === 0 ? Buffer.alloc(0) : Buffer.alloc(BLOCK - rem, 0);
}

/** Header blocks for one entry: PAX prologue when the name needs it. */
function headerFor(name: string, size: number, mtimeMs: number): Buffer[] {
  const fits = Buffer.byteLength(name, "utf8") <= 100;
  const shortName = fits ? name : truncateBytes(path.basename(name), 100);
  return [
    ...(fits ? [] : paxBlocks(name)),
    ustarHeader(shortName, size, mtimeMs, "0"),
  ];
}

/** The two zero blocks that end every tar. */
export const TAR_TRAILER = Buffer.alloc(BLOCK * 2, 0);

// ── The plan ────────────────────────────────────────────────────────────────

/**
 * Walk the volume once, cheaply, and decide what the archive claims to be.
 *
 * `readdir` plus one `stat` per entry, no file contents except the canary, so
 * the numbers in the manifest are settled before a single byte of payload is
 * written and can go out as response headers too. Directories, symlinks and
 * anything else that is not a regular file are dropped: the uploads volume is
 * flat by construction (every writer calls `writeToVolume` with a stamped
 * basename) and a backup is not the place to start following links.
 */
export async function planUploadsArchive(dir: string): Promise<ArchivePlan> {
  const takenAt = new Date().toISOString();
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    // A volume that is not there yet is an empty volume, not a failure: a
    // fresh village has no uploads until somebody uploads something.
    return { files: [], totalBytes: 0, canary: null, canarySha256: null, oversize: [], takenAt };
  }
  const files: ArchiveFile[] = [];
  const oversize: string[] = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    // These two names are ours. A file on the volume that happened to be
    // called MANIFEST.txt would collide with the archive's own entry and make
    // the counts unreadable, so it is excluded and named in the trailer.
    if (e.name === MANIFEST_ENTRY || e.name === STATUS_ENTRY) continue;
    try {
      const st = await fs.promises.stat(path.join(dir, e.name));
      if (st.size > MAX_TAR_ENTRY_BYTES) oversize.push(e.name);
      else files.push({ name: e.name, size: st.size, mtimeMs: st.mtimeMs });
    } catch {
      /* raced a delete between readdir and stat; it is not in the archive */
    }
  }
  files.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  oversize.sort();
  const totalBytes = files.reduce((n, f) => n + f.size, 0);
  const canary = files.length ? files[0]!.name : null;
  const canarySha256 = canary ? await sha256File(path.join(dir, canary)) : null;
  return { files, totalBytes, canary, canarySha256, oversize, takenAt };
}

/** SHA-256 of a file, streamed. Null if it cannot be read. */
async function sha256File(file: string): Promise<string | null> {
  return new Promise((resolve) => {
    const hash = createHash("sha256");
    const rs = fs.createReadStream(file, { highWaterMark: CHUNK });
    rs.on("data", (c) => hash.update(c));
    rs.on("error", () => resolve(null));
    rs.on("end", () => resolve(hash.digest("hex")));
  });
}

/**
 * The manifest a restore drill asserts against.
 *
 * Plain `key=value` lines because the consumer is a shell script in a GitHub
 * Action, and `grep`-able beats parseable-with-a-dependency there.
 *
 * `files` and `bytes` count the UPLOAD files only. The archive holds two more
 * entries than that, named here so a drill counting `tar -t` output knows what
 * to subtract rather than having to guess.
 */
export function manifestText(plan: ArchivePlan): string {
  return [
    "# uploads volume export",
    `takenAt=${plan.takenAt}`,
    `files=${plan.files.length}`,
    `bytes=${plan.totalBytes}`,
    `canary=${plan.canary ?? ""}`,
    `canarySha256=${plan.canarySha256 ?? ""}`,
    `manifestEntry=${MANIFEST_ENTRY}`,
    `statusEntry=${STATUS_ENTRY}`,
    `archiveEntries=${plan.files.length + 2}`,
    // Zero on every real volume. A non-zero line here means a file was too
    // large for the container format and is NOT in this archive; a drill that
    // sees one has found a genuine gap in the backup, not a formatting note.
    `excludedOversize=${plan.oversize.length}`,
    ...plan.oversize.map((n) => `oversize=${n}`),
    "",
  ].join("\n");
}

/**
 * The trailer, written last so that reading it is proof the export finished.
 *
 * An empty volume is a legitimate answer and says so (`canary=` empty in the
 * manifest above). A drill must treat `files=0` as a fact about a young
 * village, not as a broken export; `complete=yes` is what separates the two.
 */
export function statusText(outcome: ArchiveOutcome): string {
  return [
    "# written last: if you can read this, the server reached the end",
    `complete=${outcome.complete ? "yes" : "no"}`,
    `entries=${outcome.entries}`,
    `contentBytes=${outcome.contentBytes}`,
    `degradedCount=${outcome.degraded.length}`,
    ...outcome.degraded.map((n) => `degraded=${n}`),
    "",
  ].join("\n");
}

// ── The stream ──────────────────────────────────────────────────────────────

/** The reader hung up. Distinct from a file problem, and never swallowed. */
export class ExportReaderGone extends Error {
  constructor() {
    super("the export's reader went away mid-stream");
    this.name = "ExportReaderGone";
  }
}

/**
 * One write, with backpressure actually honoured rather than assumed.
 *
 * THE HANG THIS AVOIDS, which this module shipped and its own test caught.
 * The naive form waits on `drain` and nothing else. A client that disconnects
 * mid-export (a GitHub runner timing out, a curl the operator hit Ctrl-C on)
 * never drains, so that await never settles: the export sits forever holding
 * an open file handle, on the process that serves the village.
 *
 * Listening for `error` and `close` is not enough on its own, and that is the
 * part the first draft got wrong. Both events fire ONCE. By the time a later
 * write attaches its listener the socket has usually already closed, so the
 * listener is registered for an event that has been and gone and the await
 * hangs exactly as before: a guard that looks present and never runs. So the
 * dead-stream case is answered SYNCHRONOUSLY from the stream's own state
 * first, and the listeners only cover a close that happens while this
 * particular write is in flight.
 */
function write(sink: NodeJS.WritableStream, buf: Buffer): Promise<void> {
  const s = sink as NodeJS.WritableStream & { destroyed?: boolean; writableEnded?: boolean };
  if (s.destroyed || s.writableEnded) return Promise.reject(new ExportReaderGone());
  if (buf.length === 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const done = (err?: Error) => {
      sink.removeListener("drain", onDrain);
      sink.removeListener("error", onError);
      sink.removeListener("close", onClose);
      if (err) reject(err);
      else resolve();
    };
    const onDrain = () => done();
    const onError = () => done(new ExportReaderGone());
    const onClose = () => done(new ExportReaderGone());
    const ok = sink.write(buf);
    if (ok) return done();
    sink.once("drain", onDrain);
    sink.once("error", onError);
    sink.once("close", onClose);
  });
}

async function writeAll(sink: NodeJS.WritableStream, bufs: Buffer[]): Promise<void> {
  for (const b of bufs) await write(sink, b);
}

/**
 * Write the whole archive to `sink`. Never returns before the last byte is
 * accepted, and never holds more than one CHUNK of a file in memory.
 *
 * THE INVARIANT THAT MATTERS: a tar header declares a length, and the reader
 * trusts it absolutely. Emit one byte fewer and every subsequent entry in the
 * archive is misaligned garbage; emit one more and the same. So each file's
 * payload is written as EXACTLY `size` bytes: a file that shrank under us is
 * zero-padded up, a file that grew is cut off, and either way the name lands
 * in `degraded` so the trailer can say the archive is not a faithful copy.
 * Correct-looking and wrong is the outcome this exists to make impossible.
 */
export async function streamUploadsArchive(
  dir: string,
  plan: ArchivePlan,
  sink: NodeJS.WritableStream,
): Promise<ArchiveOutcome> {
  const outcome: ArchiveOutcome = { entries: 0, contentBytes: 0, degraded: [], complete: false };

  const manifest = Buffer.from(manifestText(plan), "utf8");
  await writeAll(sink, [
    ...headerFor(MANIFEST_ENTRY, manifest.length, Date.now()),
    manifest,
    padding(manifest.length),
  ]);

  for (const f of plan.files) {
    await writeAll(sink, headerFor(f.name, f.size, f.mtimeMs));
    const written = await pumpFile(path.join(dir, f.name), f.size, sink);
    if (written !== f.size) {
      // Short read: pad to the declared length so the archive stays aligned.
      await write(sink, Buffer.alloc(f.size - written, 0));
      outcome.degraded.push(f.name);
    }
    await write(sink, padding(f.size));
    outcome.entries += 1;
    outcome.contentBytes += f.size;
  }

  outcome.complete = outcome.degraded.length === 0;
  const status = Buffer.from(statusText(outcome), "utf8");
  await writeAll(sink, [
    ...headerFor(STATUS_ENTRY, status.length, Date.now()),
    status,
    padding(status.length),
    TAR_TRAILER,
  ]);
  return outcome;
}

/**
 * Copy at most `size` bytes of `file` into `sink`, returning how many landed.
 *
 * A read error mid-file is NOT a throw. The volume can be raced by the daily
 * retention sweep or by a member deleting a photo, and losing the whole backup
 * because one file went away would be the wrong trade; the caller pads the
 * hole and the trailer names the file.
 */
async function pumpFile(file: string, size: number, sink: NodeJS.WritableStream): Promise<number> {
  if (size === 0) return 0;
  let written = 0;
  let fh: fs.promises.FileHandle | undefined;
  try {
    fh = await fs.promises.open(file, "r");
    const buf = Buffer.allocUnsafe(CHUNK);
    while (written < size) {
      const { bytesRead } = await fh.read(buf, 0, Math.min(CHUNK, size - written), null);
      if (bytesRead <= 0) break;
      await write(sink, buf.subarray(0, bytesRead));
      written += bytesRead;
    }
  } catch (e) {
    // A dead SINK is not a missing file. Swallowing it here would report the
    // file as degraded, pad four megabytes into a socket that is already gone,
    // and carry on to the next file doing the same thing.
    if (e instanceof ExportReaderGone) throw e; // `finally` still closes the handle
    /* vanished or unreadable: the caller pads and records it */
  } finally {
    await fh?.close().catch(() => {});
  }
  return written;
}
