/**
 * The Living Map at `/map`: the geographic picture of the village.
 *
 * This page is a SHELL. The map itself is `docs/prototypes/grounds-v0.html`,
 * a self-contained artifact the map workstream owns, served straight from
 * there by the server at `/grounds/index.html` (there is deliberately no
 * second copy: a 4 MB duplicate in `dist/public` blew the CI bundle budget).
 * Nothing here reimplements any of it, and nothing here edits it: the shell's
 * whole job is to mount it, hand it the village's skin, and turn its door
 * clicks into navigation.
 *
 * The nested-circles org view still exists and still works. It lives at
 * `/map/circles` (client/src/pages/VillageMap.tsx) and keeps the concierge,
 * the contact relay and raise-your-hand, none of which the artifact can do,
 * because those read live data behind the capability gate. The artifact's own
 * top-left selector offers Living and Circles, so this shell adds no second
 * selector of its own.
 *
 * Since 0063 the shell also carries the LAND itself. The artifact ships a
 * `const SCENE` seed baked into it; a village that has published one gets its
 * own scene pushed on boot and draws that instead. Build mode's draft, the
 * publish, and an undo all relay through here to `/api/map/*`. The shell
 * decides none of it: every permission question is the server's, and what
 * arrives here only decides what gets DRAWN.
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
import ModuleGate from "@/components/modules/ModuleGate";
import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useModule, useModules } from "@/modules/ModuleProvider";
import { rememberMapAvailable } from "@/lib/landing";
import { MAP_SKIN_SAVED_EVENT, MAP_SKIN_SAVED_KEY } from "@shared/mapSkin";
import { isPromiseKind } from "@shared/mapPromise";
import { isSceneVerb } from "@shared/mapScene";
import { gameFetch } from "@/lib/gameApi";

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
async function probeGrounds(): Promise<{ presence: Presence; url: string }> {
  try {
    const res = await fetch(GROUNDS_MANIFEST, { headers: { Accept: "application/json" } });
    if (!res.ok) return { presence: "absent", url: GROUNDS };
    const body = await res.json();
    if (body?.present !== true) return { presence: "absent", url: GROUNDS };
    /*
     * Prefer the content-hashed URL the manifest names: it is served
     * immutable, so the 4 MB map is fetched once per version instead of
     * revalidated on every visit. Only a same-origin absolute path is
     * followed, and anything else falls back to the stable name, so a
     * malformed manifest cannot point the iframe somewhere else.
     */
    const named = typeof body.url === "string" && /^\/grounds\/[A-Za-z0-9._-]+$/.test(body.url)
      ? body.url
      : GROUNDS;
    return { presence: "present", url: named };
  } catch {
    return { presence: "absent", url: GROUNDS };
  }
}

export default function LivingMap() {
  const modules = useModules();
  const mapModule = useModule("map");
  const [, navigate] = useLocation();
  const frame = useRef<HTMLIFrameElement | null>(null);
  const [presence, setPresence] = useState<Presence>("checking");
  /** The URL the manifest names, hashed and immutable where available. */
  const [groundsUrl, setGroundsUrl] = useState<string>(GROUNDS);

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
    probeGrounds().then((p) => { if (live) { setPresence(p.presence); setGroundsUrl(p.url); } });
    return () => { live = false; };
  }, []);

  // Same contract the circles view keeps: "available" means available to THIS
  // viewer, so a member's map never decides a signed-out visitor's landing.
  useEffect(() => {
    if (modules.loaded) rememberMapAvailable(Boolean(mapModule));
  }, [modules.loaded, mapModule?.id]);

  /**
   * Leaving app mode, by one path.
   *
   * A marker entry goes on the history stack when the map opens, so the
   * browser Back button pops it and lands here in `popstate`. The artifact's
   * own exit button posts `{type:'exit'}` and calls `history.back()`, which
   * arrives at the SAME handler, and so does the shell's own escape control
   * below. One way out, three triggers, no chance of any of them disagreeing.
   *
   * Where it lands: popping the marker returns to the `/map` entry, and the
   * `popstate` handler replaces that entry with `/`. So leaving the map always
   * arrives at the village door rather than at whichever page the visitor came
   * from, which is what the control's name promises. A direct deep link that
   * never pushed a marker takes the second branch to the same place.
   *
   * The marker keeps the `/map` URL, so popping it does not navigate on its
   * own; this handler does that, replacing rather than pushing so a second
   * Back does not walk straight back into the map.
   */
  const exitApp = useCallback(() => {
    if (window.history.state?.villageMapApp) window.history.back();
    else navigate("/", { replace: true });
  }, [navigate]);

  useEffect(() => {
    window.history.pushState({ villageMapApp: true }, "");
    const onPop = () => navigate("/", { replace: true });
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [navigate]);

  /**
   * Nothing behind the map scrolls while it is open.
   *
   * The frame is `position: fixed`, so without this the document underneath
   * keeps its own scroll height and a phone still rubber-bands the page
   * behind the map when a drag crosses an edge.
   */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  /**
   * Push the village's styling into the map.
   *
   * Kept as a callback rather than inlined because it runs from two places:
   * once when the artifact announces itself, and again whenever the wizard
   * saves. `postMessage` rather than reaching into `contentWindow`, because
   * the artifact now offers a real inbound contract and a message is the part
   * of it that survives the artifact being rewritten.
   */
  const pushConfig = useCallback(async () => {
    const win = frame.current?.contentWindow;
    if (!win) return;
    try {
      const res = await fetch("/api/map/config");
      if (!res.ok) return;
      const body = await res.json();
      /*
       * One push carries skin, walk and vocabulary. The artifact applies each
       * part only when present, so a village that has customised none of them
       * gets its own seed and nothing is overwritten with blanks.
       *
       * A null walk means "use the artifact's seed", so it is omitted rather
       * than sent as an empty array: the artifact treats a non-empty array as
       * a replacement, and an empty one would read as a walk with no steps.
       */
      const payload: Record<string, unknown> = { type: "config" };
      if (body?.skin) payload.skin = body.skin;
      if (Array.isArray(body?.walk) && body.walk.length) payload.walk = body.walk;
      if (body?.vocabulary) payload.vocabulary = body.vocabulary;
      /*
       * The published land (0063). Same "absent means keep your own" rule as
       * the walk: a village that has never published sends null and the map
       * draws its own seed, which is the ordinary state of a fresh fork.
       *
       * The scene crosses the wire as JSON TEXT so the server stores the
       * bytes the map wrote. This is the one place it becomes an object
       * again, and a scene that will not parse is dropped rather than pushed:
       * the map keeps drawing the land it already has, which is a strictly
       * better failure than a half-applied scene.
       */
      if (typeof body?.scene === "string" && body.scene) {
        try {
          payload.scene = JSON.parse(body.scene);
          payload.sceneVersion = Number(body.sceneVersion) || 0;
        } catch {
          /* Unparseable: the map keeps the land it is already drawing. */
        }
      }
      win.postMessage(payload, window.location.origin);
    } catch {
      /* The map keeps whatever it is already wearing. */
    }
  }, []);

  /**
   * What THIS member may do to the map, and the draft waiting for them.
   *
   * Separate from the config push because it is the only part that depends on
   * who is asking. `/api/map/config` is the same answer for everyone and is
   * fetched without credentials; this one carries the session.
   *
   * A failure here is silent and safe by construction: the artifact starts
   * with no hand at all, so a member who cannot be identified simply keeps
   * the read-only map every visitor gets. The gate is the SERVER's, and this
   * message only decides what gets drawn.
   */
  const pushHand = useCallback(async () => {
    const win = frame.current?.contentWindow;
    if (!win) return;
    try {
      const res = await gameFetch("/api/map/draft");
      if (!res.ok) return;
      const body = await res.json();
      let draft: unknown = null;
      if (body?.draft && typeof body.draft.scene === "string") {
        try {
          draft = {
            scene: JSON.parse(body.draft.scene),
            baseVersion: Number(body.draft.baseVersion) || 0,
            updatedAt: body.draft.updatedAt,
          };
        } catch {
          /* A draft that will not parse is no draft. Nothing is destroyed:
             the row stays and the next save replaces it. */
        }
      }
      win.postMessage(
        {
          type: "hand",
          canEdit: body?.canEdit === true,
          canPublish: body?.canPublish === true,
          liveVersion: Number(body?.liveVersion) || 0,
          live: body?.live ?? null,
          draft,
        },
        window.location.origin,
      );
    } catch {
      /* No hand pushed: the map stays exactly as read-only as it booted. */
    }
  }, []);

  /**
   * Who is playing, and what the village says about its seats.
   *
   * SEPARATE FROM THE HAND, and deliberately so. `pushHand` decides whether the
   * Build button works, and hanging these off it would make a founder's edit
   * rights wait on the org chart: `/api/map` is four queries and reads the whole
   * `users` table when the caller may see people. This message only decides what
   * the org lens draws, so it can arrive whenever it arrives.
   *
   * BOTH ARE CREDENTIALED, and both have to be. The party is which characters
   * this particular player has chosen, and `/api/map/config` is fetched WITHOUT
   * credentials and returns the same answer to everyone, so nothing
   * identity-bearing may ride it.
   *
   * Every failure here is silent and costs only the narrowing. With no party the
   * map shows every mark, and with no seats it draws each one as the scene wrote
   * it, which is exactly what a signed-out reader already gets.
   */
  const pushLens = useCallback(async () => {
    const win = frame.current?.contentWindow;
    if (!win) return;
    const [partyRes, orgRes] = await Promise.all([
      gameFetch("/api/me/characters").catch(() => null),
      gameFetch("/api/map").catch(() => null),
    ]);
    const partyBody = partyRes?.ok ? await partyRes.json().catch(() => null) : null;
    const orgBody = orgRes?.ok ? await orgRes.json().catch(() => null) : null;
    const party: string[] = Array.isArray(partyBody?.party)
      ? partyBody.party.map((c: any) => String(c?.archetypeKey ?? "")).filter(Boolean)
      : [];
    // Example seats are demo data the `progression` module seeds into every
    // fresh fork. Handing them over would paint a village's own land with seats
    // nobody in it has ever heard of.
    const roles = Array.isArray(orgBody?.roles)
      ? orgBody.roles
          .filter((r: any) => r && !r.isExample && typeof r.name === "string")
          .map((r: any) => ({
            name: String(r.name),
            state: String(r.state ?? "open"),
            archetypes: Array.isArray(r.archetypes) ? r.archetypes.map(String) : [],
          }))
      : [];
    try {
      win.postMessage({ type: "lens", party, roles }, window.location.origin);
    } catch {
      /* The lens keeps whatever it is already drawing. */
    }
  }, []);

  /**
   * The map asking the village to keep, publish, discard or roll back its
   * work.
   *
   * Same relay discipline as the promises above and for the same reasons: the
   * shell decides nothing, the route owns every permission question and every
   * sentence, and A REPLY GOES BACK ON EVERY PATH including a thrown fetch.
   * The map's rule is that silence means the optimistic state stands, which
   * is right when it runs standalone from `file://` and dangerous here: a
   * village that answered "you may not publish" has to reach the person, or
   * they will believe the land moved when it did not.
   *
   * The nonce is echoed exactly and never inspected, so a reply to a publish
   * the member already replaced cannot apply itself over the newer one.
   */
  const relayScene = useCallback(async (msg: any) => {
    const win = frame.current?.contentWindow;
    if (!win) return;
    const send = (r: Record<string, unknown>) =>
      win.postMessage({ type: "scene-result", of: msg.type, nonce: msg.nonce, ...r }, window.location.origin);

    // The scene is stringified ONCE, here, and that exact text is what the
    // server stores. Building it twice would risk two different strings.
    const sceneText = () => {
      try {
        return JSON.stringify(msg.scene);
      } catch {
        return null;
      }
    };

    try {
      if (msg.type === "draft-save") {
        const scene = sceneText();
        if (!scene) return send({ ok: false, error: "That draft could not be written down." });
        const res = await gameFetch("/api/map/draft", {
          method: "PUT",
          body: JSON.stringify({ scene, baseVersion: msg.baseVersion ?? 0 }),
        });
        const body = await res.json().catch(() => null);
        return send(res.ok ? { ok: true, baseVersion: body?.baseVersion } : { ok: false, error: body?.error });
      }

      if (msg.type === "draft-discard") {
        const res = await gameFetch("/api/map/draft", { method: "DELETE" });
        const body = await res.json().catch(() => null);
        return send(res.ok ? { ok: true } : { ok: false, error: body?.error });
      }

      if (msg.type === "publish") {
        const scene = sceneText();
        if (!scene) return send({ ok: false, error: "That scene could not be written down." });
        const res = await gameFetch("/api/map/publish", {
          method: "POST",
          body: JSON.stringify({ scene, baseVersion: msg.baseVersion ?? 0, note: msg.note ?? null }),
        });
        const body = await res.json().catch(() => null);
        if (res.ok) return send({ ok: true, version: body?.version, live: body?.live });
        // 409 carries WHO moved the map and WHEN. It travels untouched: the
        // route owns that sentence so there is one place it is written.
        return send({ ok: false, reason: body?.reason, error: body?.error, live: body?.live });
      }

      if (msg.type === "restore") {
        const version = Number(msg.version);
        const res = await gameFetch(`/api/map/revisions/${version}/restore`, { method: "POST" });
        const body = await res.json().catch(() => null);
        return send(res.ok ? { ok: true, version: body?.version, live: body?.live } : { ok: false, error: body?.error });
      }
    } catch {
      return send({ ok: false, error: "The village could not be reached. Your work is still here." });
    }
  }, []);

  /**
   * A promise the map made, carried to the village and answered.
   *
   * The shell is a RELAY and nothing more. It does not decide whether an
   * answer is allowed, does not turn a status code into words, and does not
   * know what a quest key is: the route owns all of that so the reason
   * vocabulary lives in one file. What this adds is the round trip and the
   * nonce.
   *
   * THE REPLY IS SENT ON EVERY PATH, including a network failure, because the
   * map cannot tell a missing reply from a missing shell. Its own rule is that
   * silence means the optimistic state stands, which is right for the map
   * running standalone from `file://` and wrong here: a village that answered
   * "you are not signed in" has to reach the person. So a throw becomes a
   * spoken `error` rather than nothing.
   *
   * The nonce is echoed EXACTLY and never inspected. It closes the ordering
   * race: toggle on-off-on quickly and three replies come back carrying the
   * same id and kind, and the map drops any whose nonce is not the one it is
   * waiting on.
   */
  const relayPromise = useCallback(async (msg: any) => {
    const win = frame.current?.contentWindow;
    if (!win) return;
    const kind = msg.type;
    const id = typeof msg.id === "string" ? msg.id : "";
    const on = msg.on === true;
    const send = (r: Record<string, unknown>) =>
      win.postMessage(
        { type: "promise-result", kind, id, nonce: msg.nonce, ...r },
        window.location.origin,
      );
    if (!id) return send({ ok: false, state: on ? "off" : "on", reason: "error" });
    try {
      /*
       * gameFetch, NOT fetch. This deployment authenticates by
       * `Authorization: Bearer` alone (server `authedUser`), with no cookie
       * fallback, and gameFetch is the one place that attaches the token. A
       * plain fetch here reaches the route unauthenticated, so every promise
       * a signed-in member makes comes back `anonymous` and the map offers
       * them a way in they do not need. The server tests never see it,
       * because they set the header themselves.
       */
      const res = await gameFetch("/api/map/promise", {
        method: "POST",
        body: JSON.stringify({ kind, id, on }),
      });
      const body = await res.json().catch(() => null);
      // A shape we do not recognise is still an answer the map has to draw,
      // so it becomes a spoken failure instead of a silent one.
      if (!body || typeof body.state !== "string") {
        return send({ ok: false, state: on ? "off" : "on", reason: "error" });
      }
      send(body);
    } catch {
      send({ ok: false, state: on ? "off" : "on", reason: "error" });
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
        // Two pushes, deliberately. The config is the same for everyone and
        // needs no session; the hand depends on who is asking. Sending them
        // separately means a signed-out visitor still gets the published land
        // even though their hand request tells them they may do nothing.
        pushConfig();
        pushHand();
        // Third and last, because it is the only one nothing waits on: the org
        // lens narrows what is drawn and never decides what may be done.
        pushLens();
        return;
      }
      // The map asking to be closed. Same path as the browser Back button.
      if (data.type === "exit") {
        exitApp();
        return;
      }
      if (isPromiseKind(data.type)) {
        void relayPromise(data);
        return;
      }
      if (isSceneVerb(data.type)) {
        void relayScene(data);
        return;
      }
      if (data.type !== "nav") return;
      const route = typeof data.route === "string" ? data.route : "";
      if (!/^\/[^/]/.test(route) && route !== "/") return;
      navigate(route);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [navigate, pushConfig, pushHand, pushLens, exitApp, relayPromise, relayScene]);

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
    const onSaved = () => pushConfig();
    const onStorage = (ev: StorageEvent) => {
      if (ev.key === MAP_SKIN_SAVED_KEY) pushConfig();
    };
    window.addEventListener(MAP_SKIN_SAVED_EVENT, onSaved);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(MAP_SKIN_SAVED_EVENT, onSaved);
      window.removeEventListener("storage", onStorage);
    };
  }, [pushConfig]);

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

  if (modules.loaded && !mapModule) return <ModuleGate moduleId="map" name="How Power Is Held" />;

  /*
   * APP MODE. No Layout, no header, no bottom nav, and no page scroll.
   *
   * The map used to sit under the site header at `calc(100vh - 4rem)`, which
   * made the document taller than the viewport: the page scrolled, and on a
   * desktop the last strip of the map (the "what needs hands" bar) ended up
   * under the OS taskbar until you scrolled. A surface that fills the screen
   * has to BE the screen.
   *
   * `100dvh` and not `100vh`: on a phone, `vh` is the height with the browser
   * chrome hidden, so a `100vh` element sits partly behind the address bar
   * until you scroll. `dvh` tracks the chrome as it comes and goes, which is
   * the whole difference between "fills the screen" and "nearly fills it".
   *
   * Leaving is the artifact's `{type:'exit'}`, the browser Back button, and
   * the shell's own escape control, and all three run the same path (see the
   * history effect above). The shell draws one because the artifact's are laid
   * out off-screen on a phone, which left app mode with no way out at all.
   */
  return (
    <div className="fixed inset-0 z-50 h-[100dvh] w-screen overflow-hidden bg-background">
      {/*
       * THE WAY OUT, drawn by the SHELL.
       *
       * App mode hands the whole viewport to a four-megabyte artifact this
       * file does not own and may not edit. The artifact carries its own exit
       * controls, but they are laid out for a desk: on a phone they render
       * off-screen, so a visitor arriving from the top nav or the landing hero
       * had no in-app way back at all. The browser gesture is not a substitute,
       * because a pannable canvas can swallow the swipe (round-2 QA, V-H2).
       *
       * So the escape lives OUT here, above the frame, where no artifact
       * layout can push it off-screen and no artifact rewrite can remove it.
       * It runs `exitApp`, the same single path the browser Back button and
       * the artifact's own `{type:'exit'}` message run, so the three cannot
       * disagree about what leaving means.
       *
       * The offsets are measured, not guessed. The artifact's own top strip
       * (`#vitals`) is 35px tall at 390 and at 1280, so 44px clears it at every
       * viewport; `max()` against the safe-area inset means a notched phone
       * pushes the control further down rather than tucking it under the
       * notch. The floor is a literal rather than the inset alone because some
       * iOS cases report the inset as 0 (the same trap MobileFab documents).
       *
       * `z-10` reads oddly next to the shell's `z-50` and is correct: the
       * shell is a stacking context of its own, so this means "above the
       * iframe", not a site-wide layer number.
       *
       * Not rendered in the `absent` branch, which already offers this exact
       * way out inline and would otherwise carry two controls with one name.
       */}
      {presence !== "absent" && (
        <button
          type="button"
          onClick={exitApp}
          aria-label="Back to the village"
          className="fixed z-10 inline-flex items-center gap-2 min-h-[44px] min-w-[44px] px-4 py-2 text-sm rounded-lg border border-border bg-background/95 text-foreground shadow-sm backdrop-blur-sm hover:bg-muted"
          style={{
            top: "max(env(safe-area-inset-top, 0px), 44px)",
            left: "max(env(safe-area-inset-left, 0px), 12px)",
          }}
        >
          <ArrowLeft className="w-4 h-4 shrink-0" aria-hidden="true" />
          Back to the village
        </button>
      )}

      {presence === "checking" && (
        <p className="text-center text-muted-foreground py-24">Opening the map...</p>
      )}

      {presence === "absent" && (
        <div className="mx-auto max-w-xl py-24 px-6 text-center">
          <h1 className="font-display text-2xl font-bold text-foreground mb-3">
            The Living Map is not installed
          </h1>
          <p className="text-muted-foreground mb-4">
            This deployment has no map artifact. The server serves it from{" "}
            <code>docs/prototypes/grounds-v0.html</code>, and that file is not
            present here.
          </p>
          <p className="text-muted-foreground">
            The village's circles and roles are on the{" "}
            <a href="/map/circles" className="underline underline-offset-2 hover:text-foreground">
              org view
            </a>
            , which needs no artifact.
          </p>
          <button type="button" onClick={exitApp}
            className="mt-6 px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted">
            Back to the village
          </button>
        </div>
      )}

      {presence === "present" && (
        <iframe
          ref={frame}
          src={`${groundsUrl}${initialHash}`}
          onLoad={onLoad}
          title="Living map of the village"
          className="block h-full w-full border-0"
          /* Same-origin: the shell reads `contentWindow` for the skin and
             the nav shim, so this frame is not sandboxed away from us. */
          allow="fullscreen"
        />
      )}
    </div>
  );
}
