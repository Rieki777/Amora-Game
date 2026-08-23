/**
 * WHAT THE VOLUME IS HOLDING, IN WORDS BOTH SIDES AGREE ON.
 *
 * The uploads volume is written by five doors and read by one route, and
 * until now nothing could say which of its files any row still points at.
 * These are the four answers the sweep gives about a file, and they are here
 * in `shared/` so the server's verdict and the founder's screen cannot drift.
 *
 * The sentence a person reads is minted on the SERVER, beside the evidence,
 * and travels with the row. The client renders it. That is deliberate: a
 * lookup table in the browser keyed by these four words would be a second
 * copy of the reasoning, and the second copy is the one that goes stale.
 */

/** What the sweep concluded about one file on the volume. */
export type UploadVerdict =
  /** A row in the database names this file. It stays. */
  | "referenced"
  /** Nothing names it, and it is younger than the grace window. It stays. */
  | "recent"
  /** Nothing names it, it carries this platform's stamp, and it is past the grace window. */
  | "orphan"
  /** Nothing names it and nothing here can prove what it is. It stays, and it is reported. */
  | "unknown";

/** Every verdict, in the order a report lists them. */
export const UPLOAD_VERDICTS: readonly UploadVerdict[] = ["orphan", "unknown", "recent", "referenced"];

/** One file on the volume, and why the sweep decided what it decided. */
export interface UploadFinding {
  /** The name on disk. Treat as hostile data: never interpolate it into a shell or into HTML. */
  name: string;
  bytes: number;
  /** Whole days since the file was written, by the more recent of its stamp and its mtime. */
  ageDays: number;
  verdict: UploadVerdict;
  /** The whole reason, in a sentence, written where the evidence was. */
  reason: string;
}

/** A count and a byte total per verdict. */
export interface UploadTally {
  files: number;
  bytes: number;
}

/**
 * The dry run, and the same shape the removal returns afterwards.
 *
 * `complete` is the load-bearing field. The reference scan reads every text
 * column of every table in the schema, and if any part of that read fails or
 * is truncated then NOTHING is offered for removal: an unfinished scan cannot
 * prove a negative, and the whole safety argument here is the negative.
 */
export interface UploadsSweepReport {
  scannedAt: string;
  graceDays: number;
  complete: boolean;
  /** Present only when `complete` is false. Names what stopped the scan. */
  incompleteReason: string | null;
  /** Everything on the volume, whatever the verdict. */
  volume: UploadTally;
  /** Per verdict. `Record<UploadVerdict, …>` so a fifth verdict is a build error. */
  tally: Record<UploadVerdict, UploadTally>;
  /**
   * The orphans and the unknowns, named. Referenced and recent files are
   * counted and not listed: a founder scrolling nine hundred live photographs
   * to find eleven orphans is a report that hides its own answer.
   */
  findings: UploadFinding[];
  /**
   * A fingerprint of exactly the set of files this report offers to remove.
   * The removal carries it back, so a file that arrived between the looking
   * and the pressing stops the removal instead of riding along in it.
   */
  digest: string;
  /** How much of the database the reference scan actually read. */
  scan: { tables: number; columns: number; values: number };
}

/** What came back from the removal itself. */
export interface UploadsRemovalResult {
  removed: number;
  bytes: number;
  /** Every name that was unlinked, so the founder reads what happened and not a number. */
  names: string[];
  /** Files the sweep offered and could not remove, with the reason each one stayed. */
  kept: Array<{ name: string; reason: string }>;
  /** The state of the volume after the removal. */
  after: UploadsSweepReport;
}
