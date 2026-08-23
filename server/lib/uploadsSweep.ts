/**
 * THE FILES NOTHING POINTS AT, AND HOW A FILE IS PROVEN TO BE ONE.
 *
 * ── WHAT THIS EXISTS TO CLOSE ────────────────────────────────────────────
 *
 * `POST /api/admin/investor-docs/upload` wrote its file to the volume and
 * then attempted a row naming columns the table does not have. `title` is NOT
 * NULL and `dbCollection` names every spec'd column on every insert, so the
 * insert threw every single time. Both halves are fixed. What the fix could
 * not do is reach backwards: every press of that button since the route
 * shipped left a file on the volume that no row has ever named, and those
 * files are still sitting on every running village.
 *
 * There was no way to see them and no way to remove them without a shell on a
 * production volume. That was the actual defect. This module is the half that
 * decides; `server/repos/uploadRefs.ts` reads the database and the routes in
 * `server/index.ts` are the door.
 *
 * ── THE SAFETY RULE, AND WHY IT IS SHAPED LIKE THIS ──────────────────────
 *
 * `UPLOADS_DIR` is flat and it holds five doors' output at once: proposal
 * attachments from a public form, brand images and their thumbnails, village
 * font packages, investor vault documents, and the photographs members take
 * on the land. A cleanup that cannot tell one door's file from another's is a
 * cleanup that deletes a village's photographs, and a photograph is not
 * recoverable.
 *
 * So a file is removable only when ALL of these hold, and the first one is
 * the whole argument:
 *
 *   1. NOTHING IN THE DATABASE NAMES IT. Proven against every text-shaped
 *      column of every table in the live schema, read from the database and
 *      never from a repo cache. Not a filename pattern: a pattern is a guess
 *      about which door minted a file, and the guess is what eats a
 *      photograph. See `uploadRefs.ts` for why that scan is exhaustive rather
 *      than a list of tables somebody remembered.
 *
 *   2. IT CARRIES THIS PLATFORM'S STAMP. Every one of the five doors mints
 *      `<prefix>-<13 digit millisecond>-<random><ext>`, so a stamped name is
 *      a file this platform wrote. A file WITHOUT one was put there by
 *      somebody, and nothing here is entitled to an opinion about it. Those
 *      are reported as `unknown` and left where they are.
 *
 *   3. IT IS PAST THE GRACE WINDOW, measured on the MORE RECENT of its own
 *      mtime and the millisecond in its name. This is what protects a
 *      superseded brand image: replacing an image mints a new URL by design
 *      (that is what makes the one-year immutable cache on
 *      `/api/uploads/:filename` correct), so the old file goes unreferenced
 *      the moment the new one lands while every browser cache and every
 *      already-sent email still points at it.
 *
 *   4. ITS THUMBNAIL PARTNER IS ALSO REMOVABLE. `X.thumb.webp` is written
 *      beside `X.webp` by the brand-image door and the client currently
 *      discards the thumb URL, so judged alone every brand thumbnail ever
 *      written looks like an orphan, and the day somebody wires `uploadSrcSet`
 *      up the sweep would start deleting live thumbnails. The pair is judged
 *      together or not at all.
 *
 *   5. IT IS A REGULAR FILE, sitting directly in the volume, whose parent
 *      directory resolves back to the volume. Symlinks are never followed and
 *      never removed; directories are never touched.
 *
 * Anything that fails any of these is REPORTED and KEPT. An unknown file is a
 * finding somebody can act on. A deleted photograph is not.
 *
 * ── WHY THE STAMP IS ALSO WHAT MAKES THE PROOF CHEAP ─────────────────────
 *
 * A reference to a file contains the file's name, and the name contains
 * thirteen consecutive digits. So a string that does NOT contain thirteen
 * consecutive digits cannot name a stamped file, and a string that does can
 * only name the handful of files sharing that millisecond. Indexing the
 * candidates by their stamp turns "does any cell in the database contain any
 * of these names" from a scan of every name against every cell into one pass
 * over each cell. It is an exact equivalence and not an approximation, which
 * is the only reason it is allowed to stand in for the full comparison.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { UploadFinding, UploadTally, UploadVerdict, UploadsSweepReport } from "../../shared/uploadsSweep";
import { UPLOAD_VERDICTS } from "../../shared/uploadsSweep";

/**
 * The stamp every door in this platform writes into a filename.
 *
 * `stampedName()` builds `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}${ext}`
 * and the two hand-rolled call sites (brand images, place photographs) build
 * the same shape. The random tail is written as one to eight characters and
 * not exactly five on purpose: `Math.random().toString(36)` occasionally
 * returns a short string, so `slice(2, 7)` occasionally returns fewer than
 * five characters, and a rule that demanded five would class a genuine orphan
 * as unknown. Being loose here can only ever move a file from `unknown` into
 * `orphan`, and a file only becomes removable after the database has been
 * asked about it, so the looseness costs nothing and the strictness would.
 *
 * The extension group is optional because the vault appends
 * `path.extname(originalname)` raw, and a file uploaded with no extension at
 * all comes out carrying none.
 */
const STAMPED = /-(\d{13})-[a-z0-9]{1,8}((?:\.[A-Za-z0-9]+)*)$/;

/** Thirteen consecutive digits, wherever they appear in a stored string. */
const STAMP_RUN = /\d{13}/g;

/** The millisecond a platform-minted name carries, or null when it carries none. */
export function stampOf(filename: string): number | null {
  const m = STAMPED.exec(filename);
  if (!m) return null;
  const ms = Number(m[1]);
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

/**
 * The full-size file a thumbnail belongs to, or null.
 *
 * Both doors that write a thumbnail write `<base>.thumb.<ext>` beside
 * `<base>.<ext>`, so the partner is found by removing exactly one `.thumb`
 * segment. Nothing is inferred from the prefix.
 */
export function thumbParentOf(filename: string): string | null {
  const at = filename.lastIndexOf(".thumb.");
  if (at < 0) return null;
  return filename.slice(0, at) + filename.slice(at + ".thumb".length);
}

/**
 * A file the PUBLIC proposal door minted, and nothing else.
 *
 * The retention sweep deletes a handled submission's attachment when the row
 * ages out, and it takes the filename out of the row's `data` JSON. That JSON
 * arrives through `POST /api/forms/submit`, which is public and validates
 * nothing about `data`, so a stranger could post
 * `data.attachment = "brand-<stamp>.webp"` and the sweep would unlink the
 * village's hero image the day that submission aged out. One door's sweep
 * must only ever be able to reach that door's files, so the name is checked
 * against the shape `stampedName("proposal", ext)` mints and nothing else
 * is reachable from there.
 */
const PROPOSAL_ATTACHMENT = /^proposal-\d{13}-[a-z0-9]{1,8}(?:\.[A-Za-z0-9]+)*$/;

export function isProposalAttachment(filename: string): boolean {
  return PROPOSAL_ATTACHMENT.test(filename);
}

/** The `.thumb.` partner of a full-size name, whether or not it exists. */
export function thumbNameOf(filename: string): string | null {
  const ext = path.extname(filename);
  if (!ext) return null;
  return `${filename.slice(0, -ext.length)}.thumb${ext}`;
}

/**
 * Every filename a stored string could be naming, keyed by the millisecond in
 * each name so a cell is compared only against the names it could possibly
 * hold. `known` is the set of stamped filenames actually sitting on the
 * volume, so nothing is looked up that is not a real file.
 */
export function indexByStamp(names: string[]): Map<string, string[]> {
  const byStamp = new Map<string, string[]>();
  for (const name of names) {
    const m = STAMPED.exec(name);
    if (!m) continue;
    const list = byStamp.get(m[1]);
    if (list) list.push(name);
    else byStamp.set(m[1], [name]);
  }
  return byStamp;
}

/**
 * Which of the volume's files this one stored value names.
 *
 * The value is any string held in any column. Every thirteen-digit run in it
 * is looked up, and each candidate sharing that run is then tested for real:
 * the run alone proves nothing (a place photograph's row id carries the same
 * millisecond as its file and is not a pointer at it), so the containment
 * test is what decides.
 */
export function namesReferencedIn(value: string, byStamp: Map<string, string[]>): string[] {
  if (!value) return [];
  const hits: string[] = [];
  STAMP_RUN.lastIndex = 0;
  let run: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((run = STAMP_RUN.exec(value))) {
    if (seen.has(run[0])) continue;
    seen.add(run[0]);
    for (const candidate of byStamp.get(run[0]) ?? []) {
      if (value.includes(candidate)) hits.push(candidate);
    }
  }
  return hits;
}

/** One entry as the volume walk found it. Built by `readVolume`, or by a test. */
export interface VolumeEntry {
  name: string;
  bytes: number;
  /** Milliseconds, from `lstat`. Never a symlink target's mtime. */
  mtimeMs: number;
  isFile: boolean;
  isSymbolicLink: boolean;
  isDirectory: boolean;
}

/**
 * Walk the volume. `lstat` and never `stat`: a symlink's target mtime must
 * never be mistaken for the entry's own, and a symlink is reported rather
 * than followed. Flat, because the volume is flat and a recursive walk would
 * be a claim about a shape nothing here maintains.
 */
export function readVolume(dir: string): VolumeEntry[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: VolumeEntry[] = [];
  for (const e of entries) {
    let st: fs.Stats;
    try {
      st = fs.lstatSync(path.join(dir, e.name));
    } catch {
      continue; // raced a delete; it is not here to be judged
    }
    out.push({
      name: e.name,
      bytes: st.isFile() ? st.size : 0,
      mtimeMs: st.mtimeMs,
      isFile: st.isFile(),
      isSymbolicLink: st.isSymbolicLink(),
      isDirectory: st.isDirectory(),
    });
  }
  return out;
}

const DAY = 86_400_000;

/** Whole days, rounded down, never negative. */
function daysSince(ms: number, now: number): number {
  return Math.max(0, Math.floor((now - ms) / DAY));
}

export interface ClassifyInput {
  entries: VolumeEntry[];
  /** Filenames the database names. Built by `server/repos/uploadRefs.ts`. */
  referenced: Set<string>;
  graceDays: number;
  now: number;
  /** False when the reference scan did not finish. Nothing is offered for removal. */
  complete: boolean;
  incompleteReason?: string | null;
  scan: { tables: number; columns: number; values: number };
}

/**
 * The whole decision, as a pure function of what was on disk and what the
 * database said. Pure so the proof can be exercised without a volume and
 * without a schema, and so the same reasoning that produces the report
 * produces the removal list.
 */
export function classifyVolume(input: ClassifyInput): UploadsSweepReport {
  const { entries, referenced, graceDays, now, complete } = input;
  const byName = new Map(entries.map((e) => [e.name, e]));

  /** The verdict for one entry, judged alone. The pairing rule runs after. */
  const alone = (e: VolumeEntry): { verdict: UploadVerdict; reason: string; ageDays: number } => {
    const stamp = stampOf(e.name);
    // The more recent of the two clocks wins, so a file touched yesterday is a
    // day old however old the millisecond in its name is. Both have to clear
    // the window before anything is removable.
    const byMtime = daysSince(e.mtimeMs, now);
    const age = stamp === null ? byMtime : Math.min(byMtime, daysSince(stamp, now));

    if (e.isSymbolicLink) {
      return { verdict: "unknown", reason: "This is a symbolic link. Nothing here follows one or removes one.", ageDays: age };
    }
    if (e.isDirectory) {
      return { verdict: "unknown", reason: "This is a folder. The sweep only ever looks at files.", ageDays: age };
    }
    if (!e.isFile) {
      return { verdict: "unknown", reason: "This is not a regular file, so nothing here will touch it.", ageDays: age };
    }
    /*
     * The stamp question comes BEFORE the reference question, and the order is
     * about honesty as much as safety. Only stamped names are looked up in the
     * database, because only their millisecond makes the lookup exact. So for
     * an unstamped file this code has NO evidence either way, and a sentence
     * saying "no row points at this file" would be a claim it never checked.
     * It says what it actually knows.
     */
    if (stamp === null) {
      return {
        verdict: "unknown",
        reason:
          "This file carries no stamp any door here mints, so nothing here can tell what it is " +
          "or whether something points at it. It stays.",
        ageDays: age,
      };
    }
    if (referenced.has(e.name)) {
      return { verdict: "referenced", reason: "A row in the database points at this file.", ageDays: age };
    }
    if (age < graceDays) {
      return {
        verdict: "recent",
        reason: `No row points at this file yet, and it arrived ${age} day(s) ago. Files are left alone for their first ${graceDays} days.`,
        ageDays: age,
      };
    }
    return {
      verdict: "orphan",
      reason: `No row anywhere in the database names this file. It was written by a door here ${age} days ago and nothing has pointed at it since.`,
      ageDays: age,
    };
  };

  const first = new Map<string, { verdict: UploadVerdict; reason: string; ageDays: number }>();
  for (const e of entries) first.set(e.name, alone(e));

  /*
   * The pairing rule. A thumbnail and its full-size picture are one decision:
   * the brand door writes a thumbnail that no stored string names, so judged
   * alone every one of them is an orphan, and the day the client starts
   * reading `thumbUrl` the sweep would begin deleting live thumbnails. Both
   * directions, so a referenced thumbnail also saves its parent.
   */
  const findings: UploadFinding[] = [];
  const paired = new Map<string, { verdict: UploadVerdict; reason: string; ageDays: number }>();
  for (const e of entries) {
    const own = first.get(e.name)!;
    const partnerName = thumbParentOf(e.name) ?? thumbNameOf(e.name);
    const partner = partnerName && byName.has(partnerName) ? first.get(partnerName) : undefined;
    if (own.verdict === "orphan" && partner && partner.verdict !== "orphan") {
      const isThumb = thumbParentOf(e.name) !== null;
      paired.set(e.name, {
        verdict: partner.verdict,
        reason: isThumb
          ? "No row names this thumbnail, and the full-size picture it belongs to is staying. A pair is one decision."
          : "No row names this picture, and its thumbnail is staying. A pair is one decision.",
        ageDays: own.ageDays,
      });
      continue;
    }
    paired.set(e.name, own);
  }

  const tally = Object.fromEntries(
    UPLOAD_VERDICTS.map((v) => [v, { files: 0, bytes: 0 }]),
  ) as Record<UploadVerdict, UploadTally>;
  const volume: UploadTally = { files: 0, bytes: 0 };
  const removable: string[] = [];

  for (const e of entries) {
    const v = paired.get(e.name)!;
    volume.files += 1;
    volume.bytes += e.bytes;
    tally[v.verdict].files += 1;
    tally[v.verdict].bytes += e.bytes;
    if (v.verdict === "orphan" || v.verdict === "unknown") {
      findings.push({ name: e.name, bytes: e.bytes, ageDays: v.ageDays, verdict: v.verdict, reason: v.reason });
    }
    if (v.verdict === "orphan" && complete) removable.push(e.name);
  }

  // Biggest first inside each verdict: the founder's question is how much
  // room this frees, so the file that answers it goes at the top.
  const order: Record<UploadVerdict, number> = { orphan: 0, unknown: 1, recent: 2, referenced: 3 };
  findings.sort((a, b) => order[a.verdict] - order[b.verdict] || b.bytes - a.bytes || a.name.localeCompare(b.name));

  return {
    scannedAt: new Date(now).toISOString(),
    graceDays,
    complete,
    incompleteReason: complete ? null : input.incompleteReason ?? "The reference scan did not finish.",
    volume,
    tally,
    findings,
    digest: digestOf(removable, byName),
    scan: input.scan,
  };
}

/**
 * The fingerprint of exactly the set being offered for removal.
 *
 * Name and size of every removable file, sorted, hashed. The founder's press
 * carries it back and the server recomputes it: if a file has arrived, gone,
 * or changed size since he looked, the digests differ and the removal stops
 * and shows him the new list. An empty set has its own stable digest, so a
 * report with nothing to remove cannot be replayed into one that does.
 */
export function digestOf(names: string[], byName: Map<string, VolumeEntry>): string {
  const body = [...names]
    .sort()
    .map((n) => `${n}:${byName.get(n)?.bytes ?? 0}`)
    .join("\n");
  return crypto.createHash("sha256").update(`uploads-sweep-v1\n${body}`).digest("hex").slice(0, 32);
}

/** The names a report offers to remove, read back out of it. */
export function removableNames(report: UploadsSweepReport): string[] {
  return report.complete ? report.findings.filter((f) => f.verdict === "orphan").map((f) => f.name) : [];
}

export interface RemovalOutcome {
  removed: string[];
  bytes: number;
  kept: Array<{ name: string; reason: string }>;
}

/**
 * Unlink exactly the names given, and report what actually happened.
 *
 * Every name comes from a directory walk this process did, never from a
 * request body, so traversal is not reachable. The containment check is here
 * anyway because `UPLOADS_DIR` is a plain join over a mount point with no
 * `realpath` behind it: if the volume path or its `uploads` child is ever a
 * symlink, or a sibling `uploads-old` exists, a prefix test would pass while
 * the real target sat outside. Resolving the parent and comparing exactly is
 * the check that holds in both cases.
 *
 * `unlink` inside a try, with no `existsSync` in front of it: the pair is a
 * time-of-check window and the existence question is the one `unlink` already
 * answers.
 */
export function removeFiles(dir: string, names: string[]): RemovalOutcome {
  const out: RemovalOutcome = { removed: [], bytes: 0, kept: [] };
  let realDir: string;
  try {
    realDir = fs.realpathSync(dir);
  } catch {
    for (const name of names) out.kept.push({ name, reason: "The uploads volume could not be resolved, so nothing was removed." });
    return out;
  }
  for (const name of names) {
    if (name !== path.basename(name)) {
      out.kept.push({ name, reason: "That name is not a plain filename, so it was left alone." });
      continue;
    }
    const target = path.join(realDir, name);
    let realParent: string;
    try {
      realParent = fs.realpathSync(path.dirname(target));
    } catch {
      out.kept.push({ name, reason: "Its folder could not be resolved, so it was left alone." });
      continue;
    }
    if (realParent !== realDir) {
      out.kept.push({ name, reason: "It does not sit directly in the uploads volume, so it was left alone." });
      continue;
    }
    let bytes = 0;
    try {
      const st = fs.lstatSync(target);
      if (!st.isFile()) {
        out.kept.push({ name, reason: "It is not a regular file, so it was left alone." });
        continue;
      }
      bytes = st.size;
    } catch {
      out.kept.push({ name, reason: "It was already gone." });
      continue;
    }
    try {
      fs.unlinkSync(target);
      out.removed.push(name);
      out.bytes += bytes;
    } catch (err) {
      out.kept.push({ name, reason: `It could not be removed: ${(err as Error)?.message ?? "unknown reason"}` });
    }
  }
  return out;
}

/** Bytes as a founder reads them. Whole megabytes above a megabyte, kilobytes below. */
export function humanBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} bytes`;
}
