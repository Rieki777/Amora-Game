/**
 * Saying what a reader found, without a model (S78, Lane K1).
 *
 * A live measurement of the organize assistant found that seven of its ten
 * demo questions were structured lookups: the model opened one reader, read a
 * list of rows, and wrote a sentence saying how many there were and what they
 * were called. That sentence costs two upstream POSTs and about 7,400 input
 * tokens, and this file writes the same sentence for nothing.
 *
 * Each renderer takes ONE reader's data, already through `capTokens`, and
 * returns the organize route's own response shape so the transparency line in
 * the client renders exactly as it did. A reader key still goes into
 * `consulted.readers`, because the village record really was read and the
 * person asking is entitled to know which shelf the answer came off.
 *
 * THE RULE THAT MAKES THIS SAFE: a renderer never throws and never guesses. It
 * returns null the moment the data is not the shape it expected, and the route
 * falls through to a road that involves the model. Every branch below that
 * returns null is a case where a template COULD have written a confident
 * sentence and the sentence might have been wrong, which is the one failure
 * worse than an expensive answer. Truncation is the live example: `capTokens`
 * sheds rows from the end, so a template that counted what survived would
 * quietly under-report a village big enough to hit the cap.
 *
 * These strings are shipped copy. They are held to the house writing rules by
 * `scripts/check-voice.mjs`, which reads string literals in this directory.
 */

import { villageTimezone } from "./villageReaders";

/** The organize route's response shape, so the client renders it unchanged. */
export interface Rendered {
  reply: string;
  consulted: { ownRecord: string[]; references: string[]; readers: string[] };
}

export type Renderer = (data: unknown) => Rendered | null;

/**
 * How many names one sentence will carry before it rolls the tail into a
 * count. A reader's own `maxTokens` already caps the payload, and 120 quest
 * titles inside one paragraph is still unreadable at the cap.
 */
const MAX_NAMED = 20;

function out(key: string, reply: string): Rendered {
  return { reply, consulted: { ownRecord: [], references: [], readers: [key] } };
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/**
 * The rows a reader returned, and how many it dropped.
 *
 * `capTokens` returns the array untouched when it fits, `{items, truncated}`
 * when an array had to shed its tail, and `{truncated: true, note}` when a
 * non-array was too big at all. The third shape carries no rows, so it reads
 * as null here and the caller falls through.
 */
function asRows(data: unknown): { rows: Record<string, unknown>[]; more: number } | null {
  if (Array.isArray(data)) return { rows: data as Record<string, unknown>[], more: 0 };
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    if (Array.isArray(o.items)) {
      const more = Number(o.truncated ?? 0);
      return { rows: o.items as Record<string, unknown>[], more: Number.isFinite(more) && more > 0 ? more : 0 };
    }
  }
  return null;
}

/** Non-empty strings under one field, in the reader's own order. */
function field(rows: Record<string, unknown>[], key: string): string[] {
  return rows.map((r) => String(r[key] ?? "").trim()).filter((s) => s.length > 0);
}

function named(values: string[], dropped: number): string {
  const shown = values.slice(0, MAX_NAMED);
  const hidden = dropped + (values.length - shown.length);
  const list = shown.join(", ");
  return hidden > 0 ? `${list}, and ${hidden} more` : list;
}

/**
 * "Tue 18:00" in the village's own zone (round 4, lane L6). Falls back to UTC
 * when the zone name is bad, because a template that throws takes the answer
 * with it and a wrong-zone time is at least a time.
 */
export function clockIn(iso: string, timeZone: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const fmt = (tz: string) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  try {
    return fmt(timeZone).replace(",", "");
  } catch {
    return fmt("UTC").replace(",", "");
  }
}

/** The one renderer that reads a clock. Kept out of the table so it can be given the zone. */
export function renderWeek(data: unknown, timeZone: string): Rendered | null {
  const r = asRows(data);
  if (!r) return null;
  const total = r.rows.length + r.more;
  if (total === 0) return out("events.week", "Nothing is on the calendar for the next seven days.");
  const named = r.rows
    .map((x) => {
      const title = String(x.title ?? "").trim();
      const when = clockIn(String(x.startsAt ?? ""), timeZone);
      if (!title || !when) return "";
      return `${title} (${when})`;
    })
    .filter((s) => s.length > 0);
  if (named.length === 0) return null;
  const shown = named.slice(0, MAX_NAMED);
  const hidden = r.more + (named.length - shown.length);
  const list = hidden > 0 ? `${shown.join(", ")}, and ${hidden} more` : shown.join(", ");
  return out("events.week", `This week: ${total} ${plural(total, "gathering", "gatherings")}: ${list}.`);
}

export const RENDERERS: Record<string, Renderer> = {
  // Reads `villageTimezone()` at render time, so the table stays a table of
  // (data) => Rendered and the route needs no special case for this key.
  "events.week": (data) => renderWeek(data, villageTimezone()),

  "roles.all": (data) => {
    const r = asRows(data);
    if (!r) return null;
    const total = r.rows.length + r.more;
    if (total === 0) return out("roles.all", "No roles are defined in this village yet.");
    const names = field(r.rows, "name");
    if (names.length === 0) return null;
    return out(
      "roles.all",
      `This village has ${total} ${plural(total, "role", "roles")} defined: ${named(names, r.more)}.`,
    );
  },

  "seats.vacant": (data) => {
    const r = asRows(data);
    if (!r) return null;
    const total = r.rows.length + r.more;
    if (total === 0) {
      return out("seats.vacant", "No roles are defined in this village yet, so no seats are waiting.");
    }
    const empty = r.rows.filter((x) => Number(x.holders ?? 0) === 0);
    const names = field(empty, "role");
    if (names.length === 0) {
      // The dropped tail could hold vacancies. Saying every seat is filled
      // would be a confident sentence about rows this process never saw.
      if (r.more > 0) return null;
      return out("seats.vacant", "Every role in this village has someone holding it.");
    }
    return out(
      "seats.vacant",
      `${names.length} ${plural(names.length, "role has", "roles have")} nobody holding ` +
        `${plural(names.length, "it", "them")} right now: ${named(names, 0)}.`,
    );
  },

  "circles.all": (data) => {
    const r = asRows(data);
    if (!r) return null;
    const total = r.rows.length + r.more;
    if (total === 0) return out("circles.all", "No circles are defined in this village yet.");
    const names = field(r.rows, "name");
    if (names.length === 0) return null;
    return out(
      "circles.all",
      `This village has ${total} ${plural(total, "circle", "circles")}: ${named(names, r.more)}.`,
    );
  },

  "members.summary": (data) => {
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    const o = data as Record<string, unknown>;
    // The over-budget shape for a non-array. Nothing countable survived it.
    if (o.truncated) return null;
    const members = Number(o.members);
    const holding = Number(o.holdingARole);
    if (!Number.isFinite(members) || !Number.isFinite(holding)) return null;
    if (members === 0) return out("members.summary", "No members have joined this village yet.");
    return out(
      "members.summary",
      `This village has ${members} ${plural(members, "member", "members")}, and ${holding} of them ` +
        `${plural(holding, "holds", "hold")} at least one role.`,
    );
  },

  "quests.library": (data) => {
    const r = asRows(data);
    if (!r) return null;
    const total = r.rows.length + r.more;
    if (total === 0) return out("quests.library", "The quest library is empty.");
    const titles = field(r.rows, "title");
    if (titles.length === 0) return null;
    return out(
      "quests.library",
      `There ${plural(total, "is", "are")} ${total} ${plural(total, "quest", "quests")} in the library: ` +
        `${named(titles, r.more)}.`,
    );
  },

  "badges.all": (data) => {
    const r = asRows(data);
    if (!r) return null;
    const total = r.rows.length + r.more;
    if (total === 0) return out("badges.all", "This village issues no badges yet.");
    const names = field(r.rows, "name");
    if (names.length === 0) return null;
    return out(
      "badges.all",
      `This village issues ${total} ${plural(total, "badge", "badges")}: ${named(names, r.more)}.`,
    );
  },

  "record.decisions": (data) => {
    const r = asRows(data);
    if (!r) return null;
    const total = r.rows.length + r.more;
    // The sentence the model itself wrote against this empty corpus. A
    // template that answered an empty log with an apology would be a
    // downgrade, so it says the same plain thing.
    if (total === 0) return out("record.decisions", "Your decision log is empty.");
    const titles = r.rows
      .map((x) => {
        const title = String(x.title ?? "").trim();
        if (!title) return "";
        const on = String(x.decidedOn ?? "").trim();
        return on ? `${title} (${on})` : title;
      })
      .filter((s) => s.length > 0);
    if (titles.length === 0) return null;
    return out(
      "record.decisions",
      `The record holds ${total} ${plural(total, "decision", "decisions")}, newest first: ` +
        `${named(titles, r.more)}.`,
    );
  },

  "concierge.gaps": (data) => {
    const r = asRows(data);
    if (!r) return null;
    const total = r.rows.length + r.more;
    if (total === 0) {
      return out("concierge.gaps", "Nobody has asked the concierge a question it could not answer.");
    }
    const asked = field(r.rows, "asked");
    if (asked.length === 0) return null;
    return out(
      "concierge.gaps",
      `${total} ${plural(total, "question", "questions")} came in that nothing in the village ` +
        `could answer: ${named(asked, r.more)}.`,
    );
  },
};

/** Reader keys a template can answer. Derived, so a test can hold it to the registry. */
export const RENDERED_READERS = Object.keys(RENDERERS);
