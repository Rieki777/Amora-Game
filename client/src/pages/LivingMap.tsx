/**
 * The Living Map at `/map`: the geographic picture of the village.
 *
 * This page is a SHELL. The map itself is `docs/prototypes/grounds-v0.html`,
 * a self-contained artifact the map workstream owns, staged into
 * `client/public/grounds/index.html` by `scripts/copy-grounds.mjs` at build
 * time. Nothing here reimplements any of it, and nothing here edits it: the
 * shell's whole job is to mount it, hand it the village's skin, and turn its
 * door clicks into navigation.
 *
 * The nested-circles org view still exists and still works. It lives at
 * `/map/circles` (client/src/pages/VillageMap.tsx) and keeps the concierge,
 * the contact relay and raise-your-hand, none of which the artifact can do,
 * because those read live data behind the capability gate. The artifact's own
 * top-left selector offers Living and Circles, so this shell adds no second
 * selector of its own.
 *
 * Three bridges to the artifact, in order of how much they can be trusted:
 *
 *  1. THE HASH. `/map#/place/greenhouse` forwards to the iframe so a deep
 *     link into the site reaches the same address inside the map. Set once
 *     via `src`; afterwards written to the iframe's own `location.hash`,
 *     because reassigning `src` reloads four megabytes.
 *  2. `postMessage({type:'nav', route})`. The listener is here and ready. The
 *     artifact does not send it yet; when the map workstream adds it, same-tab
 *     SPA navigation starts working with no change on this side.
 *  3. Same-origin fallback. Until then the artifact sets
 *     `window.top.location.href` itself, which navigates correctly and costs a
 *     full page load. The shim below upgrades that to SPA navigation when it
 *     can reach the artifact's `siteNav`, and simply does not apply when it
 *     cannot. Losing the shim costs a reload, never a broken door.
 */
import Layout from "@/components/Layout";
import NotFound from "@/pages/NotFound";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useModule, useModules } from "@/modules/ModuleProvider";
import { rememberMapAvailable } from "@/lib/landing";
import { MAP_SKIN_SAVED_EVENT, MAP_SKIN_SAVED_KEY } from "@shared/mapSkin";

/** Where the staged artifact is served from, and its presence probe. */
const GROUNDS = "/grounds/index.html";
const GROUNDS_MANIFEST = "/grounds/manifest.json";

type Presence = "checking" | "present" | "absent";

/**
 * Is the artifact actually staged?
 *
 * A missing `/grounds/index.html` does not 404. It falls through to the SPA
 * catch-all and returns the app's own HTML, so a status check would say yes
 * and the iframe would render the site inside itself. The copy step leaves a
 * few bytes of JSON beside the artifact; HTML arriving here fails to parse,
 * and that failure is the answer.
 */
async function probeGrounds(): Promise<Presence> {
  try {
    const res = await fetch(GROUNDS_MANIFEST, { headers: { Accept: "application/json" } });
    if (!res.ok) return "absent";
    const body = await res.json();
    return body?.present === true ? "present" : "absent";
  } catch {
    return "absent";
  }
}

export default function LivingMap() {
  const modules = useModules();
  const mapModule = useModule("map");
  const [, navigate] = useLocation();
  const frame = useRef<HTMLIFrameElement | null>(null);
  const [presence, setPresence] = useState<Presence>("checking");

  /**
   * The hash the map opens on, captured once. Reading it during render on
   * every pass would reset the iframe's `src` each time the parent re-renders
   * and reload the artifact under the member's feet.
   */
  const [initialHash] = useState(() =>
    typeof window === "undefined" ? "" : window.location.hash,
  );

  useEffect(() => {
    let live = true;
    probeGrounds().then((p) => { if (live) setPresence(p); });
    return () => { live = false; };
  }, []);

  // Same contract the circles view keeps: "available" means available to THIS
  // viewer, so a member's map never decides a signed-out visitor's landing.
  useEffect(() => {
    if (modules.loaded) rememberMapAvailable(Boolean(mapModule));
  }, [modules.loaded, mapModule?.id]);

  /**
   * Push the village's styling into the map.
   *
   * Kept as a callback rather than inlined because it runs from two places:
   * once when the artifact announces itself, and again whenever the wizard
   * saves. `postMessage` rather than reaching into `contentWindow`, because
   * the artifact now offers a real inbound contract and a message is the part
   * of it that survives the artifact being rewritten.
   */
  const pushSkin = useCallback(async () => {
    const win = frame.current?.contentWindow;
    if (!win) return;
    try {
      const res = await fetch("/api/map/skin");
      if (!res.ok) return;
      const body = await res.json();
      if (body?.skin) win.postMessage({ type: "skin", skin: body.skin }, window.location.origin);
    } catch {
      /* The map keeps whatever it is already wearing. */
    }
  }, []);

  /**
   * Messages from the artifact.
   *
   * Two kinds. `grounds-ready` is the boot handshake and the ONLY reliable
   * moment to send the skin: the iframe's `load` event fires when the document
   * is parsed, which is not when a four-megabyte map has finished wiring its
   * own globals. `nav` is a door click.
   *
   * The origin check is what makes any of it safe to act on, since any page
   * that embeds or is embedded by this one can post here. The artifact sends
   * its ready message with a `*` target (it cannot know our origin), so the
   * check on THIS side is the whole guard. Routes must start with a single
   * slash, so a message can never send a member to another site.
   */
  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin) return;
      const data = ev.data;
      if (!data || typeof data !== "object") return;

      if (data.type === "grounds-ready") {
        pushSkin();
        return;
      }
      if (data.type !== "nav") return;
      const route = typeof data.route === "string" ? data.route : "";
      if (!/^\/[^/]/.test(route) && route !== "/") return;
      navigate(route);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [navigate, pushSkin]);

  /**
   * A save in the wizard retints an open map.
   *
   * The wizard is a different route, so this is not a shared React tree and
   * there is no context to hang it on. `storage` covers the realistic case
   * (the wizard open in another tab), and the same-tab case is covered by the
   * custom event MapSkinPanel dispatches after a successful save. Neither is
   * load-bearing: the map takes the current skin on its next boot regardless.
   */
  useEffect(() => {
    const onSaved = () => pushSkin();
    const onStorage = (ev: StorageEvent) => {
      if (ev.key === MAP_SKIN_SAVED_KEY) pushSkin();
    };
    window.addEventListener(MAP_SKIN_SAVED_EVENT, onSaved);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(MAP_SKIN_SAVED_EVENT, onSaved);
      window.removeEventListener("storage", onStorage);
    };
  }, [pushSkin]);

  /** Parent hash changes reach the artifact without reloading it. */
  useEffect(() => {
    const onHash = () => {
      const win = frame.current?.contentWindow;
      if (!win) return;
      try {
        if (win.location.hash !== window.location.hash) win.location.hash = window.location.hash;
      } catch {
        /* Cross-origin only, which cannot happen for a same-origin artifact. */
      }
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  /**
   * On load: hand over the village's skin, then upgrade door clicks to SPA
   * navigation if the artifact exposes `siteNav`.
   *
   * Both steps are best-effort by design. The artifact is owned elsewhere and
   * may rename either hook; when it does, the skin simply stays at the map's
   * own defaults and doors go back to full page loads. Neither degrades into
   * a broken page, which is why this reaches into the frame at all instead of
   * demanding the artifact change first.
   */
  const onLoad = () => {
    const win = frame.current?.contentWindow as any;
    if (!win) return;

    /*
     * The skin is NOT sent from here. `load` fires when the document is
     * parsed, which on a four-megabyte map is well before it has finished
     * wiring its own globals; the artifact's `grounds-ready` message is the
     * moment it is actually able to repaint, and the listener above answers
     * that. This handler only installs the navigation shim, which needs
     * nothing but the function to exist.
     */
    try {
      const original = win.siteNav;
      if (typeof original !== "function" || original.__shimmed) return;
      /*
       * This closure is created in THIS frame, so its `window` is the shell's,
       * not the iframe's, even though the artifact is what calls it. It
       * therefore navigates directly and does NOT post a message: routing a
       * click back through `window.parent` would resolve to whatever embeds
       * the SHELL, which is the shell itself today and something else the
       * first time this app is framed. The listener above stays for the real
       * integration, when the artifact posts from inside its own frame.
       */
      const shim = (ev: Event, route: string) => {
        if (typeof route !== "string" || !route.startsWith("/") || route.startsWith("//")) {
          return original.call(win, ev, route);
        }
        ev?.preventDefault?.();
        navigate(route);
        return false;
      };
      shim.__shimmed = true;
      win.siteNav = shim;
    } catch {
      /* Leave the artifact's own navigation in place. */
    }
  };

  if (modules.loaded && !mapModule) return <NotFound />;

  return (
    <Layout>
      {/* The header stays: the map is the primary surface and it still has to
          be possible to leave it. The frame takes everything below. */}
      <div className="h-[calc(100vh-4rem)] min-h-[520px] w-full bg-background">
        {presence === "checking" && (
          <p className="text-center text-muted-foreground py-24">Opening the map...</p>
        )}

        {presence === "absent" && (
          <div className="container max-w-xl py-24 text-center">
            <h1 className="font-display text-2xl font-bold text-foreground mb-3">
              The Living Map is not installed
            </h1>
            <p className="text-muted-foreground mb-4">
              This deployment has no map artifact staged. It is built from{" "}
              <code>docs/prototypes/grounds-v0.html</code> by{" "}
              <code>scripts/copy-grounds.mjs</code> during{" "}
              <code>pnpm build</code>.
            </p>
            <p className="text-muted-foreground">
              The village's circles and seats are on the{" "}
              <a href="/map/circles" className="underline underline-offset-2 hover:text-foreground">
                org view
              </a>
              , which needs no artifact.
            </p>
          </div>
        )}

        {presence === "present" && (
          <iframe
            ref={frame}
            src={`${GROUNDS}${initialHash}`}
            onLoad={onLoad}
            title="Living map of the village"
            className="block h-full w-full border-0"
            /* Same-origin: the shell reads `contentWindow` for the skin and
               the nav shim, so this frame is not sandboxed away from us. */
            allow="fullscreen"
          />
        )}
      </div>
    </Layout>
  );
}
