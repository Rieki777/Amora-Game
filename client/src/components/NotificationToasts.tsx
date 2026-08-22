/**
 * A MOMENT WHEN SOMETHING RARE ARRIVES, and nothing the rest of the time.
 *
 * FOUR KINDS earn this: a stage crossed, a ballot carried, a cycle settled, a
 * quest consented. The ration lives in shared/notificationKinds.ts as
 * `celebrate`, and an unknown type is quiet by default, so a new producer has
 * to ASK for a celebration by adding a line there. A bell that shouts at every
 * event becomes a bell nobody opens.
 *
 * MOUNTED ONCE. Layout renders NotificationBell twice (desktop bar, mobile
 * bar) and CSS hides one; React mounts both. This component is mounted once
 * beside them, so a member never sees the same moment twice, and so the page
 * carries exactly ONE polite live region, which is what screen readers want.
 *
 * IT IS NEVER THE ONLY SIGNAL. The line is already in the bell and stays
 * there. That is what makes a transient surface defensible at all: the WCAG
 * criteria on auto-dismiss disagree with each other about which one governs,
 * and they converge on the same design, which is that a toast may vanish when
 * the content lives somewhere permanent. Reasoning in
 * docs/NOTIFICATION_RESEARCH.md, part 1 section 5.
 *
 * MOTION AND SOUND. There is no sound, ever. Under `prefers-reduced-motion`
 * the celebration draws its still composition (the natural kit handles that
 * itself) and the toast does NOT time out, because a timed dismissal is one
 * more thing moving on its own. A member can turn the whole thing off in one
 * click on their profile; `celebrations: "off"` is honoured before anything
 * is rendered.
 *
 * IT NEVER TAKES FOCUS. The ARIA practices are unambiguous that an alert must
 * not move focus, so this announces politely and waits to be dismissed.
 */
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Link } from "wouter";
// Straight at the two files and never through the kit's barrel: this
// component sits in Layout, so anything the barrel drags along lands in the
// main chunk, and the main chunk has a 700 KB ceiling with a village's worth
// of pages already inside it. GameDashboard reaches for MoonProgress the same
// way, for the same reason.
import Celebration from "@/components/natural/Celebration";
import { useReducedMotion } from "@/components/natural/useReducedMotion";
import { celebrates, celebrationFor } from "@shared/notificationKinds";
import { authToken } from "@/lib/gameApi";
import { subscribeArrivals } from "@/lib/notificationStore";
import type { FeedItem } from "@/lib/notificationFeed";

/** How long a moment sits there before it lets itself out. */
export const TOAST_MS = 9000;
/** Two at once is a stack; three is a wall. */
export const TOAST_MAX = 2;

interface Moment {
  id: string;
  type: string;
  title: string;
  link: string | null;
}

export default function NotificationToasts() {
  const [moments, setMoments] = useState<Moment[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const [muted, setMuted] = useState<boolean | null>(null);
  const reduced = useReducedMotion();
  const paused = useRef(false);

  useEffect(() => {
    const token = authToken();
    if (!token) {
      setMuted(true);
      return;
    }
    let alive = true;
    fetch("/api/profile/prefs", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive) setMuted(d?.notify?.celebrations === "off");
      })
      .catch(() => {
        // A preference this page could not read is a preference it does not
        // get to overrule. Silence is the safe direction.
        if (alive) setMuted(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (muted !== false) return;
    return subscribeArrivals((arrivals: FeedItem[]) => {
      const rare = arrivals.filter((a) => celebrates(a.type));
      if (!rare.length) return;
      setMoments((was) =>
        [...rare.map((a) => ({ id: a.id, type: a.type, title: a.title, link: a.link ?? null })), ...was].slice(0, TOAST_MAX),
      );
      // One region, one message, composed whole and inserted in one write.
      setAnnouncement(rare.map((a) => a.title).join(". "));
    });
  }, [muted]);

  // Under reduced motion nothing times out; the dismiss button is the only way
  // out, which is also the ARIA practices' preferred answer for alerts.
  useEffect(() => {
    if (reduced || moments.length === 0) return;
    const t = window.setInterval(() => {
      if (paused.current) return;
      setMoments((was) => was.slice(0, -1));
    }, TOAST_MS);
    return () => window.clearInterval(t);
  }, [reduced, moments.length]);

  const drop = (id: string) => setMoments((was) => was.filter((m) => m.id !== id));

  return (
    <>
      {/* In the DOM from first paint, empty. A live region created together
          with its text is skipped by most screen readers. */}
      <p role="status" className="sr-only">
        {announcement}
      </p>
      {moments.length > 0 && (
        <div
          className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 w-[19rem] max-w-[calc(100vw-2rem)]"
          onMouseEnter={() => {
            paused.current = true;
          }}
          onMouseLeave={() => {
            paused.current = false;
          }}
          onFocusCapture={() => {
            paused.current = true;
          }}
          onBlurCapture={() => {
            paused.current = false;
          }}
        >
          {moments.map((m) => (
            <div
              key={m.id}
              className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-white shadow-xl px-3 py-3"
            >
              <span aria-hidden="true" className="shrink-0">
                <Celebration kind={celebrationFor(m.type)} intensity="moment" size={44} seed={m.id.length} />
              </span>
              <span className="min-w-0 flex-1">
                <Link
                  href={m.link ?? "/profile"}
                  onClick={() => drop(m.id)}
                  className="block text-sm font-semibold text-gray-900 leading-snug hover:underline"
                >
                  {m.title}
                </Link>
              </span>
              <button
                type="button"
                onClick={() => drop(m.id)}
                aria-label="Dismiss this"
                className="shrink-0 inline-flex items-center justify-center min-h-11 min-w-11 -m-2 text-gray-400 hover:text-gray-700"
              >
                <X aria-hidden="true" className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
