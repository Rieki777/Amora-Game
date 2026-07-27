/**
 * The notification bell (S16): unread badge + dropdown feed. Reads are
 * polled gently (on mount and every two minutes); opening the panel marks
 * everything read — the badge is an invitation, not a chore list.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { Link } from "wouter";
import { authToken } from "@/lib/gameApi";

interface Ntf {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  isRead: boolean;
  at: string;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<Ntf[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    // authToken() is the ONE reader of the canonical key. Reading
    // localStorage directly is how this silently fetched as an anonymous
    // visitor and left the bell permanently empty for signed-in members.
    const token = authToken();
    if (!token) return;
    fetch("/api/notifications", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setUnread(d.unreadCount ?? 0);
        setItems(d.notifications ?? []);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 120_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      const token = authToken();
      fetch("/api/notifications/read", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: "{}",
      })
        .then(() => setUnread(0))
        .catch(() => {});
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        aria-label="Notifications"
        className="relative p-2 rounded-lg hover:bg-white/10 transition-colors"
      >
        <Bell className="w-4.5 h-4.5 w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-amber text-[10px] font-bold text-teal-deep flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-white text-gray-800 rounded-xl shadow-xl border border-gray-200 z-50">
          <div className="px-4 py-2.5 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Notifications
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-400 text-center">Nothing yet — go be seen.</p>
          ) : (
            items.slice(0, 15).map((n) => (
              <Link
                key={n.id}
                href={n.link ?? "/profile"}
                onClick={() => setOpen(false)}
                className={`block px-4 py-3 border-b border-gray-50 hover:bg-gray-50 ${n.isRead ? "" : "bg-teal-deep/5"}`}
              >
                <p className="text-sm font-medium text-gray-900 leading-snug">{n.title}</p>
                {n.body && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>}
                <p className="text-[10px] text-gray-400 mt-1">{new Date(n.at).toLocaleString()}</p>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
