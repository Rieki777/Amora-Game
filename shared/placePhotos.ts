/**
 * Photographs of a place on the living map. Pure logic, shared by both sides.
 *
 * ── THE ORDERING, AND WHY ────────────────────────────────────────────────
 *
 * Hero first when the village has chosen one, then newest first. Both, and in
 * that order, for two different reasons.
 *
 * A listing needs one picture that answers "what is this place". Left to pure
 * chronology that slot goes to whoever uploaded most recently, which on a
 * building site means the lead image is a close-up of a pipe. So a village may
 * pin one shot, and every place that has pinned one leads with it.
 *
 * Under the hero, newest first. A place changes: the first wall, the same wall
 * a season later with a roof on it, the view from inside. Newest first means
 * the top of the gallery is the place AS IT IS NOW, and scrolling walks
 * backwards through how it got there. Oldest first would open every place on
 * a photograph of bare ground, which is the one state the place is guaranteed
 * not to be in.
 *
 * Ties break on id so the order is total. A pair of photographs uploaded in
 * the same millisecond otherwise swap places between two reads of the same
 * data, and a gallery that reshuffles under a person's thumb reads as broken.
 *
 * ── ATTRIBUTION IS THE FEATURE ───────────────────────────────────────────
 *
 * "Photo by Sol, taken March 2026" is what makes this the village's record
 * instead of a folder of images. The name and the date ride on every surface
 * that renders a photograph, and neither is optional in the layout.
 *
 * The date is a fact with two spellings, and the difference matters. When the
 * contributor knows when they took it, the line says "taken". When they do
 * not, it says "added" and gives the upload month, which is a weaker claim and
 * says so. Printing the upload date as the taken date would be the system
 * inventing a fact about the world.
 */

/** One photograph, as every surface reads it. Mirrors `place_photos`. */
export interface PlacePhoto {
  id: string;
  structureKey: string;
  /** Always an address under the village's own uploads. */
  url: string;
  thumbUrl: string | null;
  /** Required, and what the img tag renders. Never empty. */
  altText: string;
  caption: string | null;
  /** ISO date (YYYY-MM-DD) or null when the contributor did not say. */
  takenOn: string | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
  contributorId: string;
  /** Resolved for display. Falls back to a role when the account is gone. */
  contributorName: string;
  /** Set when the village pinned this as the place's lead picture. */
  heroAt: string | null;
  hiddenAt: string | null;
  hiddenBy: string | null;
  hiddenReason: string | null;
  createdAt: string;
}

export const REPORT_KINDS = ["concern", "subject"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export const REPORT_STATUSES = ["open", "resolved", "dismissed"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/** One row of the curator's queue. Mirrors `place_photo_reports`, joined. */
export interface PlacePhotoReport {
  id: string;
  photoId: string;
  structureKey: string;
  /** Null once the photograph has been taken down for good. */
  photoUrl: string | null;
  photoAltText: string | null;
  photoRemoved: boolean;
  photoHidden: boolean;
  kind: ReportKind;
  reason: string | null;
  status: ReportStatus;
  reporter: string;
  at: string;
  resolvedBy: string | null;
  resolvedAt: string | null;
}

/**
 * What a photograph may arrive as. The same list the brand upload accepts,
 * with one deliberate absence: SVG is a script-bearing document wearing a
 * picture's name, and nobody photographs anything with one.
 */
export const PHOTO_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/heic",
  "image/heif",
] as const;

export function isPhotoMimeType(mime: unknown): boolean {
  return typeof mime === "string" && (PHOTO_MIME_TYPES as readonly string[]).includes(mime.toLowerCase());
}

/** Column widths in 0093, kept here so the two cannot drift. */
export const ALT_TEXT_MAX = 300;
export const CAPTION_MAX = 500;
export const REASON_MAX = 500;
/** Short enough to catch a keyboard mash, long enough for "The north wall". */
export const ALT_TEXT_MIN = 4;

/**
 * The alt text a photograph must carry, or the sentence saying what is wrong.
 *
 * Returns null when the value is good. Required, and required at the door
 * instead of somewhere further in, so the failure is one a person can fix
 * while they are still looking at the form.
 */
export function altTextProblem(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return "Describe the photograph so a member who cannot see it knows what is here.";
  if (text.length < ALT_TEXT_MIN) return "That description is too short to tell anyone anything.";
  if (text.length > ALT_TEXT_MAX) return `Keep the description under ${ALT_TEXT_MAX} characters.`;
  return null;
}

export function captionProblem(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return "A caption is text.";
  if (value.trim().length > CAPTION_MAX) return `Keep the caption under ${CAPTION_MAX} characters.`;
  return null;
}

/**
 * The day a photograph was taken, normalised, or the reason it was refused.
 *
 * A future date is refused because it is the one value that cannot be true,
 * and because the gallery sorts and labels by it. Everything else is accepted
 * verbatim: a member posting a picture from ten years ago is contributing to
 * the record, and nothing here decides how old a photograph may be.
 */
export function takenOnProblem(value: unknown, today: Date = new Date()): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return "Give the date as YYYY-MM-DD, or leave it blank.";
  }
  const parsed = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed)) return "That is not a date on any calendar.";
  const endOfToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 23, 59, 59);
  if (parsed > endOfToday) return "A photograph cannot have been taken later than today.";
  return null;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "March 2026" from either an ISO date or an ISO timestamp. */
export function monthAndYear(iso: string): string {
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * "Photo by Sol, taken March 2026", or "Photo by Sol, added March 2026".
 *
 * One line, and it appears wherever the photograph does. The verb carries the
 * difference between a date the photographer gave and the date the file
 * arrived, so the line never claims to know more than it does.
 */
export function attributionLine(photo: Pick<PlacePhoto, "contributorName" | "takenOn" | "createdAt">): string {
  const who = (photo.contributorName || "").trim() || "a member";
  if (photo.takenOn) {
    const when = monthAndYear(photo.takenOn);
    return when ? `Photo by ${who}, taken ${when}` : `Photo by ${who}`;
  }
  const added = monthAndYear(photo.createdAt);
  return added ? `Photo by ${who}, added ${added}` : `Photo by ${who}`;
}

/**
 * Hero first, then newest first, ties broken on id. See the file header.
 *
 * Total on purpose: a comparator that can return 0 for two different rows
 * leaves their order to the sort's internals, and two reads of one gallery
 * then disagree.
 */
export function orderPhotos<T extends { id: string; heroAt: string | null; createdAt: string }>(photos: readonly T[]): T[] {
  return [...photos].sort((a, b) => {
    const aHero = a.heroAt ? 1 : 0;
    const bHero = b.heroAt ? 1 : 0;
    if (aHero !== bHero) return bHero - aHero;
    const byDate = Date.parse(b.createdAt) - Date.parse(a.createdAt);
    if (byDate) return byDate;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * At most one hero per place, and the newest pin wins.
 *
 * Enforced in code because MySQL has no partial unique index and a nullable
 * column in a unique key admits infinite duplicates. This is the read side of
 * that rule: whatever the table holds, one picture leads.
 */
export function heroOf<T extends { id: string; heroAt: string | null; createdAt: string }>(photos: readonly T[]): T | null {
  const pinned = photos.filter((p) => p.heroAt);
  if (!pinned.length) return null;
  return orderPhotos(pinned).slice().sort((a, b) => Date.parse(b.heroAt!) - Date.parse(a.heroAt!))[0] ?? null;
}

/**
 * How many more photographs this place will take.
 *
 * `perPlace` of 0 is zero and never unlimited, which is the caps-fail-closed
 * invariant. A negative result is clamped: a village that lowers the dial
 * below what a place already holds keeps every existing picture and accepts
 * no more.
 */
export function remainingForPlace(currentCount: number, perPlace: number): number {
  return Math.max(0, perPlace - currentCount);
}

/**
 * What the gallery says about how full a place is. A count, and nothing else.
 *
 * This is a fact a person cannot otherwise see, so it is printed. It carries
 * no advice about whether to post: that would be the interface telling a
 * village what to want.
 */
export function capacityLine(currentCount: number, perPlace: number): string {
  const left = remainingForPlace(currentCount, perPlace);
  const held = currentCount === 1 ? "1 photograph" : `${currentCount} photographs`;
  if (left === 0) return `${held} here. This place is at the village's limit.`;
  const room = left === 1 ? "room for 1 more" : `room for ${left} more`;
  return `${held} here, ${room}.`;
}

/** The words a member reads the moment a report is filed. Shared so the two controls agree. */
export const CONCERN_FILED =
  "Report sent. It is in the curators' queue, and you get a notification once it is closed.";
export const CONCERN_ALREADY =
  "You already reported this photograph. It is with the curators either way.";
export const SUBJECT_FILED =
  "This photograph is hidden now and the curators have your request. It stays hidden while they look.";
export const SUBJECT_ALREADY =
  "You already asked for this photograph to come down. It is hidden and the request is open.";
export const REPORT_FAILED = "That did not send. Try again in a moment.";

/** The empty state of the curator's queue, per tab. */
export function emptyQueueLine(status: ReportStatus): string {
  if (status === "open") return "No open reports. A quiet queue is the good outcome.";
  if (status === "resolved") return "Nothing marked handled yet.";
  return "Nothing dismissed yet.";
}

/**
 * What a report card says the reported thing IS, in one line.
 *
 * The two kinds are different claims and a curator deciding between them
 * needs to know which one is on the card before they read the reason.
 */
export function reportHeadline(report: Pick<PlacePhotoReport, "kind">): string {
  return report.kind === "subject"
    ? "Someone says this photograph is of them"
    : "A member flagged this photograph";
}

/** Whether a report can still be acted on. The server refuses closed rows with a 404. */
export function canAct(report: Pick<PlacePhotoReport, "status">): boolean {
  return report.status === "open";
}
