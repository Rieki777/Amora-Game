/**
 * Messages: the inbox and the thread view.
 *
 * Designed at 390px first. The thread is a full-height column with the header
 * pinned to the top and the composer pinned above the keyboard, every tap
 * target is at least 44px, and the back arrow lives in the header because a
 * phone has no other way back. The wide layout is the same column, centred.
 *
 * Bodies render as TEXT (React escapes) — there is no HTML pipeline here to
 * sanitize, the same posture the forum takes.
 */
import Layout from "@/components/Layout";
import NotFound from "@/pages/NotFound";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { useModule, useModules } from "@/modules/ModuleProvider";
import { useAuth } from "@/contexts/AuthContext";
import { authToken } from "@/lib/gameApi";
import { ArrowLeft, Bell, BellOff, Flag, LogOut, Plus, Search, Send, Trash2, Users } from "lucide-react";
import {
  canManageMembers,
  canRename,
  groupMessagesByDay,
  initialsOf,
  inboxUnreadTotal,
  memberSummary,
  relativeTime,
  sortInbox,
  threadTitle,
  unreadBadge,
  type ConversationMemberView,
  type InboxConversation,
  type ThreadMessage,
} from "@/lib/messaging";

const headers = (): Record<string, string> => {
  const t = authToken();
  return t ? { Authorization: `Bearer ${t}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
};

/**
 * The global rule in index.css covers CSS transitions; it cannot reach a
 * scrollIntoView call, which is a script API. Jumping instead of gliding is
 * the whole point for someone who asked for less motion.
 */
function scrollBehavior(): ScrollBehavior {
  if (typeof window === "undefined" || !window.matchMedia) return "auto";
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

/** Every tap target on this page clears 44px. */
const TAP = "min-h-[44px]";

export default function Messages() {
  const [, params] = useRoute("/messages/:id");
  const modules = useModules();
  const messagingModule = useModule("messaging");
  // The framework decides existence: invisible module = the ordinary 404.
  if (modules.loaded && !messagingModule) return <NotFound />;
  return params?.id ? <ThreadView id={params.id} /> : <Inbox />;
}

// ── Inbox ────────────────────────────────────────────────────────────────────

function Inbox() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<InboxConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);

  const load = useCallback(() => {
    fetch("/api/messages", { headers: headers() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setConversations(Array.isArray(d?.conversations) ? d.conversations : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const ordered = useMemo(() => sortInbox(conversations), [conversations]);
  const total = useMemo(() => inboxUnreadTotal(conversations), [conversations]);
  const now = new Date();

  if (!user) {
    return (
      <Layout>
        <div className="container py-16 text-center">
          <h1 className="font-display text-3xl font-bold mb-3">Messages</h1>
          <p className="text-muted-foreground mb-6">Sign in to read and write to the people here.</p>
          <Link href="/login" className={`inline-flex items-center ${TAP} px-5 rounded-lg bg-teal-deep text-white font-semibold`}>
            Sign in
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container max-w-2xl py-6 sm:py-10">
        <header className="flex items-center justify-between gap-3 mb-5">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground">Messages</h1>
            <p className="text-sm text-muted-foreground">
              {total > 0 ? `${total} waiting for you` : "You are all caught up"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setComposing(true)}
            className={`inline-flex items-center gap-2 ${TAP} px-4 rounded-lg bg-teal-deep text-white font-semibold text-sm`}
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            New
          </button>
        </header>

        {composing && <NewConversation onClose={() => setComposing(false)} />}

        {loading && <p className="text-sm text-muted-foreground py-8 text-center">Loading your conversations…</p>}

        {!loading && !ordered.length && (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <Users className="w-7 h-7 mx-auto mb-3 text-muted-foreground" aria-hidden="true" />
            <p className="font-semibold text-foreground mb-1">No conversations yet</p>
            <p className="text-sm text-muted-foreground">
              Start one with anybody here. A conversation with two people is a direct message; add more and it becomes a
              named group.
            </p>
          </div>
        )}

        <ul className="divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
          {ordered.map((c) => {
            const title = c.title || threadTitle(c, user.id);
            const badge = unreadBadge(c.unreadCount);
            return (
              <li key={c.id}>
                <Link
                  href={`/messages/${c.id}`}
                  className={`flex items-center gap-3 px-4 py-3 ${TAP} hover:bg-muted/50 transition-colors`}
                >
                  <span
                    className="shrink-0 w-11 h-11 rounded-full bg-teal-deep/10 text-teal-deep grid place-items-center font-semibold text-sm"
                    aria-hidden="true"
                  >
                    {c.kind === "direct" ? initialsOf(title) : <Users className="w-5 h-5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className={`truncate ${c.unreadCount ? "font-bold" : "font-semibold"} text-foreground`}>
                        {title}
                      </span>
                      {c.kind !== "direct" && (
                        <span className="text-xs text-muted-foreground shrink-0">{c.memberCount}</span>
                      )}
                      <span className="ml-auto text-xs text-muted-foreground shrink-0">
                        {relativeTime(c.lastMessageAt, now)}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm text-muted-foreground">{c.preview || "No messages yet"}</span>
                      {badge && (
                        <span className="ml-auto shrink-0 min-w-[22px] h-[22px] px-1.5 rounded-full bg-teal-deep text-white text-xs font-bold grid place-items-center">
                          {badge}
                        </span>
                      )}
                      {c.muted && <BellOff className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-label="Muted" />}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </Layout>
  );
}

interface PersonResult {
  userId: string;
  name: string;
  handle: string | null;
}

/** Search people, pick one for a direct thread or several for a named group. */
function NewConversation({ onClose }: { onClose: () => void }) {
  const [, navigate] = useLocation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PersonResult[]>([]);
  const [chosen, setChosen] = useState<PersonResult[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const id = setTimeout(() => {
      fetch(`/api/messages/people?q=${encodeURIComponent(query.trim())}`, { headers: headers() })
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => setResults(Array.isArray(d) ? d : []))
        .catch(() => setResults([]));
    }, 200);
    return () => clearTimeout(id);
  }, [query]);

  const toggle = (p: PersonResult) => {
    setChosen((prev) => (prev.some((x) => x.userId === p.userId) ? prev.filter((x) => x.userId !== p.userId) : [...prev, p]));
    setQuery("");
    setResults([]);
  };

  const start = async () => {
    setError("");
    setBusy(true);
    try {
      const isGroup = chosen.length > 1;
      const res = await fetch(isGroup ? "/api/messages/groups" : "/api/messages/direct", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(
          isGroup ? { name: name.trim(), memberIds: chosen.map((c) => c.userId) } : { userId: chosen[0]?.userId },
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "That did not work");
        return;
      }
      onClose();
      navigate(`/messages/${data.id}`);
    } finally {
      setBusy(false);
    }
  };

  const needsName = chosen.length > 1;
  const ready = chosen.length > 0 && (!needsName || !!name.trim());

  return (
    <div className="rounded-xl border border-border bg-card p-4 mb-5">
      <h2 className="font-semibold text-foreground mb-3">Start a conversation</h2>

      {!!chosen.length && (
        <ul className="flex flex-wrap gap-2 mb-3">
          {chosen.map((c) => (
            <li key={c.userId}>
              <button
                type="button"
                onClick={() => toggle(c)}
                className="inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-full bg-teal-deep/10 text-teal-deep text-sm font-medium"
              >
                {c.name}
                <span aria-hidden="true">×</span>
                <span className="sr-only">Remove {c.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <label className="block relative mb-3">
        <span className="sr-only">Search for a member by name or handle</span>
        <Search
          className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or handle"
          className={`w-full ${TAP} pl-9 pr-3 rounded-lg border border-border bg-background text-foreground`}
        />
      </label>

      {!!results.length && (
        <ul className="divide-y divide-border rounded-lg border border-border mb-3 overflow-hidden">
          {results.map((p) => (
            <li key={p.userId}>
              <button
                type="button"
                onClick={() => toggle(p)}
                className={`w-full text-left flex items-center gap-3 px-3 ${TAP} hover:bg-muted/50`}
              >
                <span className="w-8 h-8 rounded-full bg-teal-deep/10 text-teal-deep grid place-items-center text-xs font-semibold" aria-hidden="true">
                  {initialsOf(p.name)}
                </span>
                <span className="text-sm text-foreground">{p.name}</span>
                {p.handle && <span className="text-xs text-muted-foreground">@{p.handle}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      {needsName && (
        <label className="block mb-3">
          <span className="block text-sm font-medium text-foreground mb-1">Name this group</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Water crew"
            maxLength={120}
            className={`w-full ${TAP} px-3 rounded-lg border border-border bg-background text-foreground`}
          />
        </label>
      )}

      {error && <p className="text-sm text-destructive mb-3">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={!ready || busy}
          onClick={start}
          className={`inline-flex items-center ${TAP} px-5 rounded-lg bg-teal-deep text-white font-semibold text-sm disabled:opacity-50`}
        >
          {busy ? "Starting…" : "Start"}
        </button>
        <button type="button" onClick={onClose} className={`inline-flex items-center ${TAP} px-4 rounded-lg border border-border text-sm`}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Thread ───────────────────────────────────────────────────────────────────

interface ThreadData {
  id: string;
  kind: "direct" | "group" | "crew";
  name: string | null;
  title: string;
  role: "owner" | "member";
  muted: boolean;
  lastReadSeq: number;
  latestSeq: number;
  members: ConversationMemberView[];
  messages: ThreadMessage[];
}

function ThreadView({ id }: { id: string }) {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [thread, setThread] = useState<ThreadData | null>(null);
  const [gone, setGone] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const bottom = useRef<HTMLDivElement | null>(null);

  const load = useCallback(
    (markRead: boolean) => {
      fetch(`/api/messages/${id}`, { headers: headers() })
        .then((r) => {
          // 404 covers both "no such conversation" and "not yours", on
          // purpose: the server will not tell anyone which it was.
          if (r.status === 404) {
            setGone(true);
            return null;
          }
          return r.ok ? r.json() : null;
        })
        .then((d: ThreadData | null) => {
          if (!d) return;
          setThread(d);
          if (markRead && d.latestSeq > d.lastReadSeq) {
            fetch(`/api/messages/${id}/read`, {
              method: "POST",
              headers: headers(),
              body: JSON.stringify({ seq: d.latestSeq }),
            }).catch(() => {});
          }
        })
        .catch(() => {});
    },
    [id],
  );

  useEffect(() => load(true), [load]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: scrollBehavior(), block: "end" });
  }, [thread?.messages.length]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch(`/api/messages/${id}/messages`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "That message did not send");
        return;
      }
      setDraft("");
      load(true);
    } finally {
      setSending(false);
    }
  };

  const act = async (path: string, init: RequestInit) => {
    const res = await fetch(`/api/messages/${id}${path}`, { headers: headers(), ...init });
    if (res.ok) load(false);
    return res.ok;
  };

  if (gone) return <NotFound />;
  if (!user || !thread) {
    return (
      <Layout>
        <div className="container py-16 text-center text-sm text-muted-foreground">Loading the conversation…</div>
      </Layout>
    );
  }

  const days = groupMessagesByDay(thread.messages, new Date());
  const subtitle =
    thread.kind === "direct" ? "Direct message" : memberSummary(thread.members, user.id);

  return (
    <Layout>
      {/*
        A column that owns the viewport minus the site header. The message list
        is the only thing that scrolls, so the composer stays reachable with a
        thumb and the keyboard never pushes it off the screen.
      */}
      <div className="container max-w-2xl px-0 sm:px-4">
        <div className="flex flex-col h-[calc(100dvh-4rem)] sm:h-[calc(100dvh-8rem)] sm:my-6 sm:rounded-xl sm:border sm:border-border bg-card overflow-hidden">
          <header className="shrink-0 flex items-center gap-2 px-2 sm:px-4 py-2 border-b border-border bg-card">
            <Link
              href="/messages"
              className={`shrink-0 grid place-items-center w-11 ${TAP} rounded-lg hover:bg-muted`}
              aria-label="Back to all messages"
            >
              <ArrowLeft className="w-5 h-5" aria-hidden="true" />
            </Link>
            <button
              type="button"
              onClick={() => setShowMembers((v) => !v)}
              className="min-w-0 flex-1 text-left py-1"
              aria-expanded={showMembers}
            >
              <span className="block truncate font-semibold text-foreground">{thread.title}</span>
              <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
            </button>
            <button
              type="button"
              onClick={() => act("", { method: "PATCH", body: JSON.stringify({ muted: !thread.muted }) })}
              className={`shrink-0 grid place-items-center w-11 ${TAP} rounded-lg hover:bg-muted`}
              aria-label={thread.muted ? "Unmute this conversation" : "Mute this conversation"}
            >
              {thread.muted ? <BellOff className="w-5 h-5" aria-hidden="true" /> : <Bell className="w-5 h-5" aria-hidden="true" />}
            </button>
          </header>

          {showMembers && (
            <div className="shrink-0 border-b border-border px-4 py-3 bg-muted/30">
              <ul className="flex flex-wrap gap-2 mb-3">
                {thread.members
                  .filter((m) => !m.left)
                  .map((m) => (
                    <li
                      key={m.userId}
                      className="inline-flex items-center gap-1.5 min-h-[32px] px-2.5 rounded-full bg-card border border-border text-sm"
                    >
                      <span className="w-5 h-5 rounded-full bg-teal-deep/10 text-teal-deep grid place-items-center text-[10px] font-semibold" aria-hidden="true">
                        {initialsOf(m.name)}
                      </span>
                      {m.name ?? "A member"}
                      {m.role === "owner" && <span className="text-xs text-muted-foreground">owner</span>}
                    </li>
                  ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                {canRename(thread) && (
                  <button
                    type="button"
                    onClick={() => {
                      const next = window.prompt("Name this conversation", thread.name ?? "");
                      if (next && next.trim()) act("", { method: "PATCH", body: JSON.stringify({ name: next.trim() }) });
                    }}
                    className={`inline-flex items-center ${TAP} px-3 rounded-lg border border-border text-sm`}
                  >
                    Rename
                  </button>
                )}
                {canManageMembers(thread) && (
                  <span className="inline-flex items-center text-xs text-muted-foreground px-1">
                    You own this conversation
                  </span>
                )}
                <button
                  type="button"
                  onClick={async () => {
                    if (!window.confirm("Leave this conversation?")) return;
                    if (await act("/leave", { method: "POST" })) navigate("/messages");
                  }}
                  className={`inline-flex items-center gap-1.5 ${TAP} px-3 rounded-lg border border-border text-sm text-destructive`}
                >
                  <LogOut className="w-4 h-4" aria-hidden="true" />
                  Leave
                </button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-4">
            {!thread.messages.length && (
              <p className="text-center text-sm text-muted-foreground py-10">
                Nothing here yet. Say the first thing.
              </p>
            )}
            {days.map((day) => (
              <section key={day.label} aria-label={day.label}>
                <h2 className="text-center text-xs font-medium text-muted-foreground my-3">{day.label}</h2>
                <ul className="space-y-2">
                  {day.messages.map((m) => (
                    <li key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[85%] sm:max-w-[75%] ${m.mine ? "items-end" : "items-start"} flex flex-col`}>
                        {!m.mine && thread.kind !== "direct" && (
                          <span className="text-xs text-muted-foreground px-1 mb-0.5">{m.author.name ?? "A member"}</span>
                        )}
                        <div
                          className={`rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words ${
                            m.deleted
                              ? "bg-muted text-muted-foreground italic"
                              : m.mine
                                ? "bg-teal-deep text-white"
                                : "bg-muted text-foreground"
                          }`}
                        >
                          {m.deleted ? "This message was deleted" : m.body}
                        </div>
                        <span className="flex items-center gap-2 text-[11px] text-muted-foreground px-1 mt-0.5">
                          {relativeTime(m.createdAt, new Date())}
                          {m.mine && !m.deleted && (
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm("Delete this message?")) {
                                  act(`/messages/${m.id}`, { method: "DELETE" });
                                }
                              }}
                              className="inline-flex items-center gap-1 py-2 hover:text-destructive"
                            >
                              <Trash2 className="w-3 h-3" aria-hidden="true" />
                              <span className="sr-only">Delete this message</span>
                            </button>
                          )}
                          {!m.mine && !m.deleted && (
                            <button
                              type="button"
                              onClick={() => {
                                const reason = window.prompt("What is wrong with this message?");
                                if (reason !== null) {
                                  act(`/messages/${m.id}/report`, { method: "POST", body: JSON.stringify({ reason }) });
                                }
                              }}
                              className="inline-flex items-center gap-1 py-2 hover:text-destructive"
                            >
                              <Flag className="w-3 h-3" aria-hidden="true" />
                              <span className="sr-only">Report this message</span>
                            </button>
                          )}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <div ref={bottom} />
          </div>

          {error && <p className="shrink-0 px-4 py-2 text-sm text-destructive border-t border-border">{error}</p>}

          <form
            className="shrink-0 flex items-end gap-2 p-2 sm:p-3 border-t border-border bg-card safe-area-pb"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <label className="flex-1">
              <span className="sr-only">Write a message</span>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={1}
                maxLength={4000}
                placeholder="Write a message"
                className="w-full min-h-[44px] max-h-32 px-3 py-2.5 rounded-2xl border border-border bg-background text-foreground resize-none"
              />
            </label>
            <button
              type="submit"
              disabled={!draft.trim() || sending}
              className={`shrink-0 grid place-items-center w-11 ${TAP} rounded-full bg-teal-deep text-white disabled:opacity-50`}
              aria-label="Send"
            >
              <Send className="w-5 h-5" aria-hidden="true" />
            </button>
          </form>
        </div>
      </div>
    </Layout>
  );
}
