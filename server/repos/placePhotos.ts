/**
 * Every query the place-photo feature makes (0093).
 *
 * All of it is here because the module contract's clause 13 refuses raw SQL
 * outside `server/repos`, and because one file holding every read of a table
 * is the only way the retention sweep and the serving guard can be shown to
 * agree about which files are live.
 *
 * camelCase at the interface, snake_case in the table, the same shape
 * `server/repos/gratitude.ts` uses.
 */
import type { Pool, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import type { PlacePhoto, PlacePhotoReport, ReportKind, ReportStatus } from "../../shared/placePhotos";

const toIso = (v: unknown): string =>
  v instanceof Date ? v.toISOString() : v == null ? "" : new Date(String(v)).toISOString();

const toIsoOrNull = (v: unknown): string | null => (v == null ? null : toIso(v));

/** A DATE column comes back as a Date at UTC midnight, or as a string. */
const toDateOnly = (v: unknown): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};

const num = (v: unknown): number | null => (v == null ? null : Number(v));

/**
 * The columns every read selects, and the join that resolves a contributor's
 * name. LEFT JOIN on purpose: an account that has been anonymised leaves the
 * photograph standing, and the surface falls back to a role.
 */
const PHOTO_COLUMNS =
  "p.id, p.structure_key, p.url, p.thumb_url, p.alt_text, p.caption, p.taken_on, " +
  "p.width, p.height, p.bytes, p.contributor_id, u.name AS contributor_name, " +
  "p.hero_at, p.hidden_at, p.hidden_by, p.hidden_reason, p.removed_at, p.created_at";

function rowToPhoto(r: any): PlacePhoto {
  return {
    id: String(r.id),
    structureKey: String(r.structure_key),
    url: String(r.url),
    thumbUrl: r.thumb_url ? String(r.thumb_url) : null,
    altText: String(r.alt_text ?? ""),
    caption: r.caption ? String(r.caption) : null,
    takenOn: toDateOnly(r.taken_on),
    width: num(r.width),
    height: num(r.height),
    bytes: num(r.bytes),
    contributorId: String(r.contributor_id),
    contributorName: r.contributor_name ? String(r.contributor_name) : "a member",
    heroAt: toIsoOrNull(r.hero_at),
    hiddenAt: toIsoOrNull(r.hidden_at),
    hiddenBy: r.hidden_by ? String(r.hidden_by) : null,
    hiddenReason: r.hidden_reason ? String(r.hidden_reason) : null,
    createdAt: toIso(r.created_at),
  };
}

export interface NewPlacePhoto {
  id: string;
  villageId: string;
  structureKey: string;
  url: string;
  thumbUrl: string | null;
  altText: string;
  caption: string | null;
  takenOn: string | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
  contributorId: string;
}

/** One place's photographs. Removed rows never come back from here. */
export async function photosForPlace(
  pool: Pool,
  villageId: string,
  structureKey: string,
  opts: { includeHidden?: boolean } = {},
): Promise<PlacePhoto[]> {
  const hidden = opts.includeHidden ? "" : " AND p.hidden_at IS NULL";
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT ${PHOTO_COLUMNS} FROM place_photos p LEFT JOIN users u ON u.id = p.contributor_id ` +
      `WHERE p.village_id = ? AND p.structure_key = ? AND p.removed_at IS NULL${hidden} ` +
      "ORDER BY p.created_at DESC, p.id ASC LIMIT 500",
    [villageId, structureKey],
  );
  return rows.map(rowToPhoto);
}

/** One photograph, whatever state it is in. The moderation paths need tombstones. */
export async function photoById(pool: Pool, id: string): Promise<(PlacePhoto & { removedAt: string | null; villageId: string }) | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT ${PHOTO_COLUMNS}, p.village_id FROM place_photos p LEFT JOIN users u ON u.id = p.contributor_id WHERE p.id = ?`,
    [id],
  );
  if (!rows[0]) return null;
  return { ...rowToPhoto(rows[0]), removedAt: toIsoOrNull(rows[0].removed_at), villageId: String(rows[0].village_id) };
}

export interface PlaceSummary {
  structureKey: string;
  photoCount: number;
  /** The place's lead picture, chosen by the same rule the gallery uses. */
  coverUrl: string | null;
  coverThumbUrl: string | null;
  coverAltText: string | null;
  latestAt: string;
}

/**
 * Every place that has at least one live photograph, newest activity first.
 *
 * The cover is picked in SQL by the gallery's own rule (a pinned hero beats
 * everything, then newest, then id) so the list page and the place page never
 * lead with different pictures.
 */
export async function placesWithPhotos(pool: Pool, villageId: string): Promise<PlaceSummary[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT p.structure_key, COUNT(*) AS n, MAX(p.created_at) AS latest_at FROM place_photos p " +
      "WHERE p.village_id = ? AND p.removed_at IS NULL AND p.hidden_at IS NULL " +
      "GROUP BY p.structure_key ORDER BY latest_at DESC LIMIT 200",
    [villageId],
  );
  const out: PlaceSummary[] = [];
  for (const r of rows) {
    const [cover] = await pool.query<RowDataPacket[]>(
      "SELECT url, thumb_url, alt_text FROM place_photos " +
        "WHERE village_id = ? AND structure_key = ? AND removed_at IS NULL AND hidden_at IS NULL " +
        "ORDER BY (hero_at IS NULL) ASC, hero_at DESC, created_at DESC, id ASC LIMIT 1",
      [villageId, String(r.structure_key)],
    );
    out.push({
      structureKey: String(r.structure_key),
      photoCount: Number(r.n),
      coverUrl: cover[0] ? String(cover[0].url) : null,
      coverThumbUrl: cover[0] && cover[0].thumb_url ? String(cover[0].thumb_url) : null,
      coverAltText: cover[0] ? String(cover[0].alt_text) : null,
      latestAt: toIso(r.latest_at),
    });
  }
  return out;
}

export async function countForPlace(pool: Pool, villageId: string, structureKey: string): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT COUNT(*) AS n FROM place_photos WHERE village_id = ? AND structure_key = ? AND removed_at IS NULL",
    [villageId, structureKey],
  );
  return Number(rows[0]?.n ?? 0);
}

/**
 * What one member has added in the last 24 hours, across every place.
 *
 * Counts removed rows too. A member who posts twelve pictures and takes six
 * down has still spent twelve of the village's day, and not counting them
 * would make the dial a suggestion.
 */
export async function countByContributorSince(pool: Pool, contributorId: string, hours: number): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT COUNT(*) AS n FROM place_photos WHERE contributor_id = ? AND created_at >= (NOW(3) - INTERVAL ? HOUR)",
    [contributorId, hours],
  );
  return Number(rows[0]?.n ?? 0);
}

export async function insertPhoto(pool: Pool, row: NewPlacePhoto): Promise<void> {
  await pool.query(
    "INSERT INTO place_photos (id, village_id, structure_key, url, thumb_url, alt_text, caption, taken_on, width, height, bytes, contributor_id) " +
      "VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
    [
      row.id, row.villageId, row.structureKey, row.url, row.thumbUrl, row.altText,
      row.caption, row.takenOn, row.width, row.height, row.bytes, row.contributorId,
    ],
  );
}

/**
 * Pin one photograph as the place's lead shot, unpinning whatever held it.
 *
 * Two statements and no transaction on purpose: the worst interleaving leaves
 * a place with no hero for a moment, and a place with no hero simply leads
 * with its newest. Nothing here can produce two heroes, because the clear runs
 * first and covers every row in the place.
 */
export async function setHero(pool: Pool, villageId: string, structureKey: string, photoId: string | null): Promise<void> {
  await pool.query(
    "UPDATE place_photos SET hero_at = NULL WHERE village_id = ? AND structure_key = ? AND hero_at IS NOT NULL",
    [villageId, structureKey],
  );
  if (photoId) {
    await pool.query(
      "UPDATE place_photos SET hero_at = CURRENT_TIMESTAMP(3) WHERE id = ? AND removed_at IS NULL AND hidden_at IS NULL",
      [photoId],
    );
  }
}

/** Reversible. Returns false when the row was already hidden or is gone. */
export async function hidePhoto(pool: Pool, id: string, by: string, reason: string | null): Promise<boolean> {
  const [r] = await pool.query<ResultSetHeader>(
    "UPDATE place_photos SET hidden_at = CURRENT_TIMESTAMP(3), hidden_by = ?, hidden_reason = ?, hero_at = NULL " +
      "WHERE id = ? AND hidden_at IS NULL AND removed_at IS NULL",
    [by, reason, id],
  );
  return r.affectedRows > 0;
}

export async function restorePhoto(pool: Pool, id: string): Promise<boolean> {
  const [r] = await pool.query<ResultSetHeader>(
    "UPDATE place_photos SET hidden_at = NULL, hidden_by = NULL, hidden_reason = NULL " +
      "WHERE id = ? AND hidden_at IS NOT NULL AND removed_at IS NULL",
    [id],
  );
  return r.affectedRows > 0;
}

/** Irreversible. The caller unlinks the file; the row stays as a tombstone. */
export async function removePhoto(pool: Pool, id: string, by: string): Promise<boolean> {
  const [r] = await pool.query<ResultSetHeader>(
    "UPDATE place_photos SET removed_at = CURRENT_TIMESTAMP(3), removed_by = ?, hero_at = NULL WHERE id = ? AND removed_at IS NULL",
    [by, id],
  );
  return r.affectedRows > 0;
}

/**
 * Filenames that must not be served: hidden, or removed and still on disk.
 *
 * Hiding a row stops it appearing in a gallery and does nothing at all to the
 * bytes, which anyone holding the address can still fetch. For a photograph
 * somebody has asked to have taken down, that gap is the whole failure. The
 * uploads route reads this set, so a hidden picture is unreachable by URL as
 * well as absent from the page.
 */
export async function suppressedFilenames(pool: Pool): Promise<string[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT url, thumb_url FROM place_photos WHERE hidden_at IS NOT NULL OR removed_at IS NOT NULL",
  );
  const out: string[] = [];
  for (const r of rows) {
    for (const v of [r.url, r.thumb_url]) {
      const s = v == null ? "" : String(v);
      if (s) out.push(s.slice(s.lastIndexOf("/") + 1));
    }
  }
  return out;
}

/** Tombstones the sweep may forget, with the files they still name. */
export async function tombstonesOlderThan(pool: Pool, days: number): Promise<{ id: string; url: string; thumbUrl: string | null }[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT id, url, thumb_url FROM place_photos WHERE removed_at IS NOT NULL AND removed_at < (NOW(3) - INTERVAL ? DAY) LIMIT 500",
    [days],
  );
  return rows.map((r) => ({ id: String(r.id), url: String(r.url), thumbUrl: r.thumb_url ? String(r.thumb_url) : null }));
}

/**
 * Every file a photograph that is NOT removed still points at.
 *
 * The sweep asks this before unlinking anything. Two rows can never share a
 * file (the unique key on url says so), and this is the belt: a file a live
 * row names is never deleted because a tombstone also named it.
 */
export async function liveFilenames(pool: Pool): Promise<Set<string>> {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT url, thumb_url FROM place_photos WHERE removed_at IS NULL");
  const out = new Set<string>();
  for (const r of rows) {
    for (const v of [r.url, r.thumb_url]) {
      const s = v == null ? "" : String(v);
      if (s) out.add(s.slice(s.lastIndexOf("/") + 1));
    }
  }
  return out;
}

export async function deletePhotoRows(pool: Pool, ids: readonly string[]): Promise<number> {
  if (!ids.length) return 0;
  const marks = ids.map(() => "?").join(",");
  await pool.query(`DELETE FROM place_photo_reports WHERE photo_id IN (${marks})`, [...ids]);
  const [r] = await pool.query<ResultSetHeader>(`DELETE FROM place_photos WHERE id IN (${marks})`, [...ids]);
  return r.affectedRows;
}

// ── Reports ────────────────────────────────────────────────────────────────

export async function insertReport(
  pool: Pool,
  row: { id: string; villageId: string; photoId: string; reporterId: string; kind: ReportKind; reason: string | null },
): Promise<void> {
  await pool.query(
    "INSERT INTO place_photo_reports (id, village_id, photo_id, reporter_id, kind, reason) VALUES (?,?,?,?,?,?)",
    [row.id, row.villageId, row.photoId, row.reporterId, row.kind, row.reason],
  );
}

/** Distinct members who have an open concern on one photograph. */
export async function openConcernReporters(pool: Pool, photoId: string): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT COUNT(DISTINCT reporter_id) AS n FROM place_photo_reports WHERE photo_id = ? AND kind = 'concern' AND status = 'open'",
    [photoId],
  );
  return Number(rows[0]?.n ?? 0);
}

/**
 * The curator's queue, joined into something a person can act on.
 *
 * Opaque identifiers are what kept the forum's queue unbuilt for a release:
 * the picture, what it shows, whether it is already dark and who raised it are
 * the fields that turn a row into a decision.
 */
export async function listReports(pool: Pool, status: ReportStatus): Promise<PlacePhotoReport[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT r.id, r.photo_id, r.kind, r.reason, r.status, r.created_at, r.resolved_at, " +
      "ru.name AS resolved_by_name, u.name AS reporter_name, " +
      "p.structure_key, p.url, p.alt_text, p.hidden_at, p.removed_at " +
      "FROM place_photo_reports r " +
      "LEFT JOIN place_photos p ON p.id = r.photo_id " +
      "LEFT JOIN users u ON u.id = r.reporter_id " +
      "LEFT JOIN users ru ON ru.id = r.resolved_by " +
      "WHERE r.status = ? ORDER BY r.created_at ASC LIMIT 200",
    [status],
  );
  return rows.map((r) => ({
    id: String(r.id),
    photoId: String(r.photo_id),
    structureKey: r.structure_key ? String(r.structure_key) : "",
    photoUrl: r.removed_at || !r.url ? null : String(r.url),
    photoAltText: r.alt_text ? String(r.alt_text) : null,
    photoRemoved: !!r.removed_at,
    photoHidden: !!r.hidden_at,
    kind: (String(r.kind) === "subject" ? "subject" : "concern") as ReportKind,
    reason: r.reason ? String(r.reason) : null,
    status: String(r.status) as ReportStatus,
    reporter: r.reporter_name ? String(r.reporter_name) : "a member",
    at: toIso(r.created_at),
    resolvedBy: r.resolved_at ? (r.resolved_by_name ? String(r.resolved_by_name) : "a curator") : null,
    resolvedAt: toIsoOrNull(r.resolved_at),
  }));
}

export async function reporterOf(pool: Pool, reportId: string): Promise<{ reporterId: string; photoId: string } | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT reporter_id, photo_id FROM place_photo_reports WHERE id = ?",
    [reportId],
  );
  if (!rows[0]) return null;
  return { reporterId: String(rows[0].reporter_id), photoId: String(rows[0].photo_id) };
}

export async function closeReport(pool: Pool, id: string, status: "resolved" | "dismissed", by: string | null): Promise<boolean> {
  const [r] = await pool.query<ResultSetHeader>(
    "UPDATE place_photo_reports SET status = ?, resolved_by = ?, resolved_at = CURRENT_TIMESTAMP(3) WHERE id = ? AND status = 'open'",
    [status, by, id],
  );
  return r.affectedRows > 0;
}

/** Close every open report on one photograph. A takedown answers all of them. */
export async function closeReportsForPhoto(pool: Pool, photoId: string, by: string | null): Promise<string[]> {
  const [open] = await pool.query<RowDataPacket[]>(
    "SELECT reporter_id FROM place_photo_reports WHERE photo_id = ? AND status = 'open'",
    [photoId],
  );
  await pool.query(
    "UPDATE place_photo_reports SET status = 'resolved', resolved_by = ?, resolved_at = CURRENT_TIMESTAMP(3) WHERE photo_id = ? AND status = 'open'",
    [by, photoId],
  );
  return open.map((r) => String(r.reporter_id));
}

/** How many reports are waiting. The count a curator's door shows. */
export async function openReportCount(pool: Pool): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT COUNT(*) AS n FROM place_photo_reports WHERE status = 'open'",
  );
  return Number(rows[0]?.n ?? 0);
}
