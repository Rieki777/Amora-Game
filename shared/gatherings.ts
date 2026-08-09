/**
 * The Events module's domain vocabulary, shared by server and client.
 *
 * Named `gatherings` and not `events` on purpose. `server/lib/events.ts` is
 * the platform's event SPINE (recordEvent, the audit history every module
 * appends to). Two files called events, meaning two unrelated things, is a
 * mistake waiting for a tired import. The MODULE is `events`, the TABLES are
 * `events` and `event_rsvps`, and the code that handles them says gatherings.
 *
 * Everything here is pure. The date maths in particular is the map's
 * dependency: it brightens a building by how many days away the next
 * gathering there is, so `daysUntil` has to give the same answer on the
 * server, in the client, and in a test.
 */

/** Stored states. `draft` is ours; the rest are schema.org eventStatus. */
export const EVENT_STATUSES = ["draft", "scheduled", "cancelled", "postponed"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const ATTENDANCE_MODES = ["offline", "online", "mixed"] as const;
export type AttendanceMode = (typeof ATTENDANCE_MODES)[number];

export const RSVP_STATUSES = ["going", "maybe", "declined"] as const;
export type RsvpStatus = (typeof RSVP_STATUSES)[number];

/** States a visitor may see. `draft` never leaves the admin surface. */
export const PUBLIC_STATUSES: EventStatus[] = ["scheduled", "cancelled", "postponed"];

export interface Gathering {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  locationText: string | null;
  /** Which painted structures on the map this happens in. */
  structureKeys: string[];
  visitTypeId: string | null;
  capacity: number | null;
  status: EventStatus;
  attendanceMode: AttendanceMode;
  onlineUrl: string | null;
  /** Confirmed attendance, counted from `going` rows. */
  goingCount: number;
  /** NULL capacity means uncapped, so this is null too, never a big number. */
  spotsLeft: number | null;
  /** Whole days from now until it starts. Negative once it has begun. */
  daysUntil: number;
  /** This viewer's own answer, absent when signed out. */
  myRsvp?: RsvpStatus | null;
  isExample?: boolean;
}

/**
 * Whole days from `now` until `startsAt`, floored toward the past.
 *
 * Calendar days, not 24-hour blocks: something at 9pm tonight and something
 * at 8am tomorrow are "today" and "tomorrow" to a person, and rounding a
 * 13-hour gap to 0 days would call them the same day. Both arguments are
 * normalised to UTC midnight first, which matches how the server stores and
 * compares these (`timezone: 'Z'` on every connection).
 */
export function daysUntil(startsAt: string | Date, now: Date = new Date()): number {
  const start = startsAt instanceof Date ? startsAt : new Date(startsAt);
  if (Number.isNaN(start.getTime())) return 0;
  const day = 86_400_000;
  const startDay = Math.floor(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()) / day);
  const nowDay = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / day);
  return startDay - nowDay;
}

/** Uncapped stays uncapped; a full gathering reports 0, never a negative. */
export function spotsLeft(capacity: number | null, goingCount: number): number | null {
  if (capacity === null || capacity === undefined) return null;
  return Math.max(0, capacity - goingCount);
}

/** Would one more `going` overflow the cap? Uncapped never does. */
export function isFull(capacity: number | null, goingCount: number): boolean {
  if (capacity === null || capacity === undefined) return false;
  return goingCount >= capacity;
}

/**
 * schema.org/Event as JSON-LD.
 *
 * Emitted so a village's calendar is readable by search engines and portable
 * into any other tool that speaks the vocabulary. `draft` returns null: an
 * unpublished gathering must not be marked up for a crawler.
 *
 * `eventStatus` and `eventAttendanceMode` take the full schema.org URLs
 * because the short forms are not valid outside a context that defines them.
 */
export function toSchemaOrg(
  g: Gathering,
  opts: { siteUrl?: string } = {},
): Record<string, unknown> | null {
  if (g.status === "draft") return null;
  const S = "https://schema.org/";
  const statusUrl: Record<Exclude<EventStatus, "draft">, string> = {
    scheduled: `${S}EventScheduled`,
    cancelled: `${S}EventCancelled`,
    postponed: `${S}EventPostponed`,
  };
  const modeUrl: Record<AttendanceMode, string> = {
    offline: `${S}OfflineEventAttendanceMode`,
    online: `${S}OnlineEventAttendanceMode`,
    mixed: `${S}MixedEventAttendanceMode`,
  };

  const doc: Record<string, unknown> = {
    "@context": S.slice(0, -1),
    "@type": "Event",
    name: g.title,
    startDate: g.startsAt,
    eventStatus: statusUrl[g.status as Exclude<EventStatus, "draft">],
    eventAttendanceMode: modeUrl[g.attendanceMode],
  };
  if (g.description) doc.description = g.description;
  if (g.endsAt) doc.endDate = g.endsAt;
  if (g.capacity !== null) doc.maximumAttendeeCapacity = g.capacity;
  if (g.locationText) doc.location = { "@type": "Place", name: g.locationText };
  // An online gathering's "place" IS its URL, which is what VirtualLocation
  // exists for. A mixed one carries both, so the physical entry above stays.
  if (g.onlineUrl && g.attendanceMode !== "offline") {
    const virtual = { "@type": "VirtualLocation", url: g.onlineUrl };
    doc.location = doc.location ? [doc.location, virtual] : virtual;
  }
  if (opts.siteUrl) doc.url = `${opts.siteUrl.replace(/\/$/, "")}/events/${g.id}`;
  return doc;
}
