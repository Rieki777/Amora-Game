import { describe, it, expect } from "vitest";
import {
  canManageMembers,
  canRename,
  groupMessagesByDay,
  inboxUnreadTotal,
  initialsOf,
  liveMembers,
  memberSummary,
  relativeTime,
  sortInbox,
  threadTitle,
  unreadBadge,
  unreadInThread,
  type ConversationMemberView,
  type InboxConversation,
  type ThreadMessage,
} from "./messaging";

const member = (
  userId: string,
  name: string | null,
  extra: Partial<ConversationMemberView> = {},
): ConversationMemberView => ({
  userId,
  name,
  handle: name ? name.toLowerCase() : null,
  role: "member",
  left: false,
  ...extra,
});

const conversation = (over: Partial<InboxConversation> = {}): InboxConversation => ({
  id: "cnv-1",
  kind: "direct",
  name: null,
  unreadCount: 0,
  muted: false,
  role: "member",
  lastReadSeq: 0,
  latestSeq: 0,
  preview: "",
  lastAuthorId: null,
  lastMessageAt: null,
  memberCount: 2,
  members: [member("u1", "Ana Ruiz"), member("u2", "Ben Cole")],
  ...over,
});

const message = (over: Partial<ThreadMessage> = {}): ThreadMessage => ({
  id: "msg-1",
  seq: 1,
  body: "hello",
  deleted: false,
  mine: false,
  author: { userId: "u1", name: "Ana", handle: "ana" },
  createdAt: "2026-08-10T12:00:00.000Z",
  ...over,
});

describe("threadTitle", () => {
  it("titles a direct thread with the other person, per viewer", () => {
    const c = conversation();
    expect(threadTitle(c, "u1")).toBe("Ben Cole");
    expect(threadTitle(c, "u2")).toBe("Ana Ruiz");
  });

  it("keeps naming someone who left: the history is a conversation with them", () => {
    const c = conversation({ members: [member("u1", "Ana Ruiz"), member("u2", "Ben Cole", { left: true })] });
    expect(threadTitle(c, "u1")).toBe("Ben Cole");
  });

  it("uses the group's own name, whoever is looking", () => {
    const c = conversation({ kind: "group", name: "Water crew" });
    expect(threadTitle(c, "u1")).toBe("Water crew");
    expect(threadTitle(c, "u9")).toBe("Water crew");
  });

  it("never renders an empty title", () => {
    expect(threadTitle(conversation({ kind: "group", name: "   " }), "u1")).toBe("Group conversation");
    expect(threadTitle(conversation({ members: [member("u1", "Ana")] }), "u1")).toBe("A member");
  });
});

describe("memberSummary", () => {
  it("names the viewer first", () => {
    expect(memberSummary([member("u1", "Ana"), member("u2", "Ben")], "u1")).toBe("You and Ben");
  });

  it("collapses a long roster to a count", () => {
    const roster = [
      member("u1", "Ana"),
      member("u2", "Ben"),
      member("u3", "Cara"),
      member("u4", "Dev"),
      member("u5", "Eli"),
    ];
    expect(memberSummary(roster, "u1")).toBe("You, Ben, Cara and 2 others");
  });

  it("says one other in the singular", () => {
    const roster = [member("u1", "Ana"), member("u2", "Ben"), member("u3", "Cara"), member("u4", "Dev")];
    expect(memberSummary(roster, "u1")).toBe("You, Ben, Cara and 1 other");
  });

  it("leaves out people who left", () => {
    const roster = [member("u1", "Ana"), member("u2", "Ben"), member("u3", "Cara", { left: true })];
    expect(memberSummary(roster, "u1")).toBe("You and Ben");
    expect(liveMembers(roster)).toHaveLength(2);
  });

  it("handles a thread the viewer is alone in", () => {
    expect(memberSummary([member("u1", "Ana")], "u1")).toBe("Just you");
  });
});

describe("unread counting", () => {
  it("shows nothing at zero and caps the badge at 9+", () => {
    expect(unreadBadge(0)).toBe("");
    expect(unreadBadge(4)).toBe("4");
    expect(unreadBadge(9)).toBe("9");
    expect(unreadBadge(10)).toBe("9+");
    expect(unreadBadge(-3)).toBe("");
  });

  it("keeps muted conversations out of the badge total", () => {
    const list = [
      conversation({ id: "a", unreadCount: 3 }),
      conversation({ id: "b", unreadCount: 5, muted: true }),
      conversation({ id: "c", unreadCount: 2 }),
    ];
    expect(inboxUnreadTotal(list)).toBe(5);
  });

  it("counts only other people's live messages past the read mark", () => {
    const messages = [
      message({ id: "m1", seq: 1 }),
      message({ id: "m2", seq: 2 }),
      message({ id: "m3", seq: 3, mine: true }),
      message({ id: "m4", seq: 4, deleted: true }),
      message({ id: "m5", seq: 5 }),
    ];
    expect(unreadInThread(messages, 2)).toBe(1);
    expect(unreadInThread(messages, 0)).toBe(3);
    expect(unreadInThread(messages, 5)).toBe(0);
  });
});

describe("sortInbox", () => {
  it("puts newest activity first and silent threads last", () => {
    // Seqs set, not just timestamps: without them every row would carry seq 0
    // and this would quietly be testing the silent-thread fallback instead of
    // the key the inbox actually orders by.
    const list = [
      conversation({ id: "quiet", lastMessageAt: null, latestSeq: 0 }),
      conversation({ id: "old", lastMessageAt: "2026-08-01T00:00:00.000Z", latestSeq: 4 }),
      conversation({ id: "new", lastMessageAt: "2026-08-10T00:00:00.000Z", latestSeq: 7 }),
    ];
    expect(sortInbox(list).map((c) => c.id)).toEqual(["new", "old", "quiet"]);
  });

  it("orders by seq, so identical timestamps do not decide anything", () => {
    // Since 0074 the server orders by last_message_seq and this must use the
    // same key, or an optimistic send re-sorts the list into an order the API
    // never returned. Timestamps here are IDENTICAL and the ids run counter to
    // the seqs on purpose: only the seq gives the right answer, so a fallback
    // to either of the others fails this outright.
    const same = "2026-08-10T00:00:00.000Z";
    const list = [
      conversation({ id: "cnv-900", lastMessageAt: same, latestSeq: 2 }),
      conversation({ id: "cnv-100", lastMessageAt: same, latestSeq: 9 }),
      conversation({ id: "cnv-500", lastMessageAt: same, latestSeq: 5 }),
    ];
    expect(sortInbox(list).map((c) => c.id)).toEqual(["cnv-100", "cnv-500", "cnv-900"]);
    // Stable: re-sorting an already-sorted list changes nothing, which is what
    // makes it safe to run after every optimistic update.
    expect(sortInbox(sortInbox(list)).map((c) => c.id)).toEqual(["cnv-100", "cnv-500", "cnv-900"]);
  });

  it("falls to time then id only for threads nobody has spoken in", () => {
    // Silent conversations all carry seq 0, which is the one case the seq
    // cannot separate. They sort after anything with a message, and among
    // themselves by newest id, matching the server's trailing
    // `c.created_at DESC, c.id DESC`.
    const list = [
      conversation({ id: "cnv-100", lastMessageAt: null, latestSeq: 0 }),
      conversation({ id: "cnv-300", lastMessageAt: null, latestSeq: 0 }),
      conversation({ id: "cnv-spoken", lastMessageAt: "2026-08-01T00:00:00.000Z", latestSeq: 1 }),
    ];
    expect(sortInbox(list).map((c) => c.id)).toEqual(["cnv-spoken", "cnv-300", "cnv-100"]);
  });

  it("does not mutate its input", () => {
    const list = [
      conversation({ id: "a", lastMessageAt: "2026-08-01T00:00:00.000Z" }),
      conversation({ id: "b", lastMessageAt: "2026-08-10T00:00:00.000Z" }),
    ];
    sortInbox(list);
    expect(list.map((c) => c.id)).toEqual(["a", "b"]);
  });
});

describe("relativeTime", () => {
  const now = new Date("2026-08-10T12:00:00.000Z");

  it("counts up through minutes, hours and days", () => {
    expect(relativeTime("2026-08-10T11:59:30.000Z", now)).toBe("now");
    expect(relativeTime("2026-08-10T11:48:00.000Z", now)).toBe("12m");
    expect(relativeTime("2026-08-10T09:00:00.000Z", now)).toBe("3h");
    expect(relativeTime("2026-08-08T12:00:00.000Z", now)).toBe("2d");
  });

  it("renders nothing for missing or unparseable input, never NaN", () => {
    expect(relativeTime(null, now)).toBe("");
    expect(relativeTime(undefined, now)).toBe("");
    expect(relativeTime("not a date", now)).toBe("");
  });
});

describe("groupMessagesByDay", () => {
  const now = new Date("2026-08-10T12:00:00.000Z");

  it("names today and yesterday and dates the rest", () => {
    const days = groupMessagesByDay(
      [
        message({ id: "m1", seq: 1, createdAt: "2026-08-04T10:00:00.000Z" }),
        message({ id: "m2", seq: 2, createdAt: "2026-08-09T10:00:00.000Z" }),
        message({ id: "m3", seq: 3, createdAt: "2026-08-10T10:00:00.000Z" }),
        message({ id: "m4", seq: 4, createdAt: "2026-08-10T11:00:00.000Z" }),
      ],
      now,
    );
    expect(days).toHaveLength(3);
    expect(days[1].label).toBe("Yesterday");
    expect(days[2].label).toBe("Today");
    expect(days[2].messages.map((m) => m.id)).toEqual(["m3", "m4"]);
  });

  it("keeps the order it was given and drops unparseable rows", () => {
    const days = groupMessagesByDay(
      [message({ id: "ok", createdAt: "2026-08-10T10:00:00.000Z" }), message({ id: "bad", createdAt: "nonsense" })],
      now,
    );
    expect(days).toHaveLength(1);
    expect(days[0].messages.map((m) => m.id)).toEqual(["ok"]);
  });

  it("returns nothing for an empty thread", () => {
    expect(groupMessagesByDay([], now)).toEqual([]);
  });
});

describe("initialsOf", () => {
  it("takes up to two initials", () => {
    expect(initialsOf("Ana Ruiz")).toBe("AR");
    expect(initialsOf("Ana Maria Ruiz")).toBe("AM");
    expect(initialsOf("Ana")).toBe("A");
  });

  it("falls back rather than rendering an empty circle", () => {
    expect(initialsOf(null)).toBe("?");
    expect(initialsOf("   ")).toBe("?");
  });
});

describe("owner affordances", () => {
  it("offers renaming and member management only to a group's owner", () => {
    expect(canRename({ kind: "group", role: "owner" })).toBe(true);
    expect(canRename({ kind: "group", role: "member" })).toBe(false);
    expect(canManageMembers({ kind: "crew", role: "owner" })).toBe(true);
  });

  it("never offers either on a direct thread", () => {
    expect(canRename({ kind: "direct", role: "owner" })).toBe(false);
    expect(canManageMembers({ kind: "direct", role: "owner" })).toBe(false);
  });
});
