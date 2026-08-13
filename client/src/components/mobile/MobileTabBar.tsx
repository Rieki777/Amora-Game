/**
 * MobileTabBar: five-slot bottom nav, mobile only.
 *
 * Slots come from config/mobileNav.ts. The last one dispatches
 * "open-mobile-menu", which Layout listens for and opens the existing header
 * drawer, so there is one nav menu in the app rather than two that drift apart.
 *
 * Ported from regen-civics. Two details from that implementation are carried
 * over deliberately because both were bug fixes, not decoration:
 *
 *  - It portals to <body>. A `position: fixed` element is positioned against
 *    the nearest ancestor that has a transform, filter, backdrop-filter or
 *    contain, not against the viewport. Any of those on a parent silently turns
 *    this bar into an absolutely-positioned strip floating mid-page.
 *  - It pads for env(safe-area-inset-bottom) so the bar clears the iOS home
 *    indicator.
 */
import { createPortal } from "react-dom";
import { Link, useLocation } from "wouter";
import { TAB_SLOTS } from "@/config/mobileNav";

export default function MobileTabBar() {
  const [location] = useLocation();
  const currentPath = location.split("?")[0].replace(/\/$/, "") || "/";

  const bar = (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-gradient-to-t from-[#0f5f5e] to-[#157f7d] backdrop-blur-xl border-t border-white/15 shadow-[0_-10px_30px_-12px_rgba(0,0,0,0.45)]"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      aria-label="Bottom navigation"
    >
      {/* Seafoam accent hairline along the top edge */}
      <div
        className="absolute top-0 left-0 right-0 h-0.5 opacity-70"
        style={{ background: "linear-gradient(to right, transparent, #7fb8ac, transparent)" }}
      />
      <div className="grid grid-cols-[repeat(5,minmax(0,1fr))] h-16 items-stretch max-w-2xl mx-auto min-w-0">
        {TAB_SLOTS.map((slot) => {
          const active =
            !!slot.path &&
            (slot.path === "/"
              ? currentPath === "/"
              : currentPath === slot.path || currentPath.startsWith(slot.path + "/"));

          const inner = (
            <>
              <span
                className={`pointer-events-none absolute top-0 h-0.5 w-8 rounded-full bg-[#ecb163] transition-opacity duration-300 ${
                  active ? "opacity-100" : "opacity-0"
                }`}
              />
              <div
                className={`relative flex items-center justify-center rounded-2xl transition-all duration-300 ${
                  active ? "px-2.5 py-1 -translate-y-0.5 bg-white/15" : "px-1.5 py-1"
                }`}
              >
                <slot.Icon className="w-[22px] h-[22px]" />
              </div>
              {/* min-w-0 + truncate, because at a 320px viewport the five labels needed
                  325px of min-content and the bar itself became wider than the
                  screen. It is fixed, so it set the document width and every page
                  with it: /profile's entire 5px of overflow was this bar. */}
              <span className={`text-[11px] leading-none min-w-0 truncate ${active ? "font-semibold" : "font-medium"}`}>
                {slot.label}
              </span>
            </>
          );

          const cls = `group relative flex flex-col items-center justify-center gap-1 transition-transform active:scale-95 ${
            active ? "text-white" : "text-white/70 hover:text-white"
          }`;

          if (slot.path) {
            return (
              <Link
                key={slot.label}
                href={slot.path}
                aria-label={slot.label}
                aria-current={active ? "page" : undefined}
                className={cls}
              >
                {inner}
              </Link>
            );
          }

          return (
            <button
              key={slot.label}
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent(slot.event!))}
              aria-label={slot.label}
              className={cls}
            >
              {inner}
            </button>
          );
        })}
      </div>
    </nav>
  );

  if (typeof document === "undefined") return bar;
  return createPortal(bar, document.body);
}
