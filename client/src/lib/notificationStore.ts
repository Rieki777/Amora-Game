/**
 * ONE POLLER FOR EVERY BELL, AND A CADENCE THAT FOLLOWS ATTENTION.
 *
 * WHAT WAS WRONG. `NotificationBell` held its own `setInterval(load,
 * 120_000)`, and Layout mounts the bell TWICE (once in the desktop bar, once
 * beside the mobile menu button). CSS hides one of them; React mounts both.
 * So the app made two identical requests every two minutes, and a thank-you
 * sent to somebody sitting on the page took up to two minutes to appear.
 *
 * WHAT THIS DOES INSTEAD.
 *
 *  - ONE loop, however many bells are mounted. The store is the subscriber
 *    list; the loop runs while anyone is listening and stops when nobody is.
 *  - A CHEAP poll. `?count=1` answers with the unread count and the newest
 *    timestamp from a single indexed query and skips the list entirely. The
 *    list is fetched when the panel opens, and when the cheap poll says the
 *    newest timestamp moved.
 *  - A CADENCE THAT FOLLOWS ATTENTION, and an immediate poll when a member
 *    comes back to the tab, which is the moment people actually look.
 *  - BACKOFF on failure, doubling to a five-minute ceiling, so a server having
 *    a bad afternoon is not hammered by every open tab in the village.
 *
 * WHY NOT A SOCKET. One Express process, no fanout layer. A socket per signed
 * in member is a standing cost, a reconnect story, a proxy configuration and a
 * second delivery path to keep correct, bought to save at most twenty-five
 * seconds on a bell. The reasoning is written out in
 * docs/NOTIFICATION_RESEARCH.md, part 2.
 */
import { authToken } from "@/lib/gameApi";
import type { FeedItem } from "@/lib/notificationFeed";

/** Visible, and the member touched the page inside the activity window. */
export const POLL_ACTIVE_MS = 25_000;
/** Visible, and nothing has been touched for a while. */
export const POLL_IDLE_MS = 60_000;
/** The tab is in the background. */
export const POLL_HIDDEN_MS = 150_000;
/** How long a pointer or a key counts as "still here". */
export const ACTIVITY_WINDOW_MS = 5 * 60_000;
/** The ceiling a failing poll backs off to. */
export const POLL_MAX_MS = 300_000;

export interface NotifyState {
  unread: number;
  /**
   * What the BADGE counts: unread rows that arrived after the last time this
   * member opened the panel. Always a subset of `unread`, so something
   * already dealt with never comes back as new.
   */
  unseen: number;
  items: FeedItem[];
  /** True once any answer has landed, so an empty bell is not shown too early. */
  loaded: boolean;
}

type Listener = () => void;
type ArrivalListener = (arrivals: FeedItem[]) => void;

let state: NotifyState = { unread: 0, unseen: 0, items: [], loaded: false };
const listeners = new Set<Listener>();
const arrivalListeners = new Set<ArrivalListener>();

/** Ids already shown to this page. Seeded silently by the first full load. */
const seen = new Set<string>();
let seeded = false;

let latestAt: string | null = null;
let timer: number | null = null;
let inFlight = false;
let failures = 0;
let lastActivityAt = Date.now();
let wired = false;

export function getNotifyState(): NotifyState {
  return state;
}

function publish(next: NotifyState) {
  state = next;
  for (const l of Array.from(listeners)) l();
}

/** The interval the next poll should use, given where the member's attention is. */
export function pollDelay(opts: { hidden: boolean; idleFor: number; failures: number }): number {
  if (opts.failures > 0) {
    return Math.min(POLL_MAX_MS, POLL_ACTIVE_MS * Math.pow(2, Math.min(opts.failures, 6)));
  }
  if (opts.hidden) return POLL_HIDDEN_MS;
  return opts.idleFor < ACTIVITY_WINDOW_MS ? POLL_ACTIVE_MS : POLL_IDLE_MS;
}

/*
 * The Authorization header is written out at every call site rather than
 * built by a helper, and that is deliberate: scripts/check-auth-fetch.mjs
 * reads the CALL, and a header assembled behind a function is a header it
 * cannot see. This deployment authenticates by Bearer alone, so a call the
 * guard cannot resolve is a call that might be silently anonymous.
 */
async function fetchFull(): Promise<void> {
  const token = authToken();
  if (!token) return;
  const res = await fetch("/api/notifications", { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(String(res.status));
  const d = await res.json();
  const items: FeedItem[] = Array.isArray(d?.notifications) ? d.notifications : [];
  latestAt = items[0]?.at ?? latestAt;

  const arrivals: FeedItem[] = [];
  for (const it of items) {
    if (seen.has(it.id)) continue;
    seen.add(it.id);
    // The first load seeds the set in silence. Otherwise every sign-in would
    // fire a celebration for something that happened last Tuesday.
    if (seeded && !it.isRead) arrivals.push(it);
  }
  seeded = true;

  publish({ unread: Number(d?.unreadCount ?? 0), unseen: Number(d?.unseenCount ?? 0), items, loaded: true });
  if (arrivals.length) {
    for (const l of Array.from(arrivalListeners)) l(arrivals);
  }
}

async function fetchCount(): Promise<void> {
  const token = authToken();
  if (!token) return;
  const res = await fetch("/api/notifications?count=1", { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(String(res.status));
  const d = await res.json();
  const nextLatest: string | null = d?.latestAt ?? null;
  const changed = nextLatest !== latestAt;
  // The count is authoritative on its own, so it lands even when nothing new
  // arrived: another tab marking rows read must quiet this tab's badge too.
  publish({ ...state, unread: Number(d?.unreadCount ?? 0), unseen: Number(d?.unseenCount ?? 0), loaded: true });
  if (changed || !seeded) await fetchFull();
}

/** Ask now. `full` forces the list; otherwise the cheap poll decides. */
export async function refreshNotifications(full = false): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  try {
    if (full || !seeded) await fetchFull();
    else await fetchCount();
    failures = 0;
  } catch {
    failures += 1;
  } finally {
    inFlight = false;
    schedule();
  }
}

function schedule() {
  if (timer !== null) {
    window.clearTimeout(timer);
    timer = null;
  }
  if (!listeners.size) return;
  const hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
  const delay = pollDelay({ hidden, idleFor: Date.now() - lastActivityAt, failures });
  timer = window.setTimeout(() => void refreshNotifications(), delay);
}

function noteActivity() {
  lastActivityAt = Date.now();
}

function onWake() {
  lastActivityAt = Date.now();
  if (document.visibilityState === "visible") void refreshNotifications();
}

function wire() {
  if (wired || typeof window === "undefined") return;
  wired = true;
  document.addEventListener("visibilitychange", onWake);
  window.addEventListener("focus", onWake);
  for (const ev of ["pointerdown", "keydown"]) {
    window.addEventListener(ev, noteActivity, { passive: true });
  }
}

/** React subscription. The loop starts with the first bell and stops with the last. */
export function subscribeNotifications(l: Listener): () => void {
  listeners.add(l);
  wire();
  if (listeners.size === 1) void refreshNotifications();
  else schedule();
  return () => {
    listeners.delete(l);
    if (!listeners.size && timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
  };
}

/** Told about genuinely new, still-unread rows. Never about the first load. */
export function subscribeArrivals(l: ArrivalListener): () => void {
  arrivalListeners.add(l);
  return () => arrivalListeners.delete(l);
}

/**
 * Mark rows read. `ids` omitted means every unread row this member has.
 *
 * The local state moves only after the server agrees, and the number the
 * server reports is what comes back, so the panel can say what it actually
 * did instead of what it hoped to do.
 */
export async function markNotificationsRead(ids?: string[]): Promise<number> {
  const token = authToken();
  if (!token) return 0;
  if (ids && ids.length === 0) return 0;
  const res = await fetch("/api/notifications/read", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(ids ? { ids } : {}),
  }).catch(() => null);
  if (!res?.ok) return 0;
  const d = await res.json().catch(() => null);
  const marked = Number(d?.marked ?? 0);
  const touched = ids ? new Set(ids) : null;
  publish({
    ...state,
    unread: Math.max(0, state.unread - marked),
    // Unseen can only ever shrink alongside unread, never grow: it is a
    // subset by definition and reading something cannot make it new again.
    unseen: Math.max(0, Math.min(state.unseen, state.unread - marked)),
    items: state.items.map((i) => (!touched || touched.has(i.id) ? { ...i, isRead: true } : i)),
  });
  return marked;
}

/**
 * SEEN, which is not read. Opening the panel quiets the badge and touches no
 * row's read state. The server holds the cursor; the badge is dropped here
 * straight away so the panel does not sit under a number while it is open.
 */
export async function markNotificationsSeen(): Promise<void> {
  const token = authToken();
  if (!token || state.unseen === 0) return;
  publish({ ...state, unseen: 0 });
  await fetch("/api/notifications/seen", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: "{}",
  }).catch(() => {
    // The badge comes back on the next poll if the server never heard. A
    // quiet badge that lied is better fixed by the truth arriving than by
    // refusing to quiet it in the first place.
  });
}

/** Test seam: forget everything this module remembered between page loads. */
export function resetNotificationStore() {
  state = { unread: 0, unseen: 0, items: [], loaded: false };
  seen.clear();
  seeded = false;
  latestAt = null;
  failures = 0;
  lastActivityAt = Date.now();
  if (timer !== null) {
    window.clearTimeout(timer);
    timer = null;
  }
}
