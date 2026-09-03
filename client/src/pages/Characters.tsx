/**
 * Choose who you will be.
 *
 * WHY THIS WAS REWRITTEN, so nobody reintroduces it: the first version was
 * styled for a dark screen this site does not have. It put cream text
 * (`text-amber-100`) on cards it assumed were near-black, and `Layout` renders
 * on the light parchment skin, so the page's own heading measured 1.00:1
 * against the background. Not low contrast. The same luminance. Invisible.
 *
 * index.css says it directly: the `-light` tokens are BACKGROUNDS for dark
 * text, and anything rendering on a light surface picks from the dark set
 * instead. So every string here is teal-deep, sage or a grey, and there is no
 * cream text anywhere on this page.
 *
 * NOT gold, and that is the second lesson. This comment used to say gold at
 * "6.2:1 on white", copied from the token's own comment, and both were wrong:
 * gold measures 4.55 on white and 4.07 on the #f2f2f2 body, so moving headings
 * to it shipped a REGRESSION from the 4.30 teal they replaced. sage is 5.95 and
 * 5.32. Anything on the page background is measured against #f2f2f2, never
 * against white, because the body is not white.
 *
 * The arrangement follows the same correction. A character select shows you
 * the CAST:
 *   - the portrait is the first thing on the page, not the last. It was below
 *     the fold and clipped by the bottom nav, which is the most valuable asset
 *     on the site arriving last;
 *   - the rail is FACES, not letters in circles. A letter is a placeholder for
 *     a face, and thirty faces already exist;
 *   - the heading is small. Two lines of display type in the palest colour
 *     took 40% of the first screen above a picture nobody could see, and
 *     fixing the contrast alone would have made the loudest thing on screen
 *     also the largest. You arrive here by choosing to; the page does not need
 *     to announce itself.
 */
import Layout from "@/components/Layout";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { authToken } from "@/lib/gameApi";
import { Star, X } from "lucide-react";
import PortraitStudio, { type StudioPayload } from "@/components/characters/PortraitStudio";

const headers = (): Record<string, string> => {
  const t = authToken();
  return t
    ? { Authorization: `Bearer ${t}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
};

interface Archetype {
  key: string;
  name: string;
  subtitle: string;
  blurb: string;
  examples: string[];
}

interface Character {
  id: string;
  archetypeKey: string;
  presentation: "f" | "m";
  tone: "deep" | "olive" | "light";
  /** The member's own portrait when they have one, and the stock art otherwise. */
  avatar: string | null;
  /** The stock art on its own, so a surface can still show the village face. */
  stockAvatar: string | null;
  portrait: { source: "forged" | "uploaded"; published: boolean } | null;
  isPrimary: boolean;
}

interface Paths {
  roles: Array<{ id: string; name: string; recruiting: boolean; color: string | null }>;
  questCount: number;
}

const TONES: Array<{ key: Character["tone"]; label: string; swatch: string }> = [
  { key: "deep", label: "Deep", swatch: "#5B3A21" },
  { key: "olive", label: "Olive", swatch: "#A9743F" },
  { key: "light", label: "Light", swatch: "#E3B58C" },
];

/** The thirty assets are named by class, presentation and tone. */
const art = (key: string, p: string, t: string) => `/images/avatars/${key}-${p}-${t}.webp`;

export default function Characters() {
  const { user } = useAuth();
  const [archetypes, setArchetypes] = useState<Archetype[]>([]);
  const [party, setParty] = useState<Character[]>([]);
  const [activeKey, setActiveKey] = useState("");
  const [presentation, setPresentation] = useState<Character["presentation"]>("f");
  const [tone, setTone] = useState<Character["tone"]>("olive");
  const [paths, setPaths] = useState<Paths | null>(null);
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [studio, setStudio] = useState<StudioPayload | null>(null);

  const firstRun = useMemo(
    () => new URLSearchParams(window.location.search).get("first") === "1",
    [],
  );

  useEffect(() => {
    fetch("/api/archetypes")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: Archetype[]) => {
        setArchetypes(list);
        if (list.length) setActiveKey((k) => k || list[0].key);
      })
      .catch(() => {});
  }, []);

  const loadParty = () => {
    if (!user) return;
    fetch("/api/me/characters", { headers: headers() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setParty(d.party ?? []))
      .catch(() => {});
  };
  useEffect(loadParty, [user?.id]);

  /*
   * The studio is its own read and not part of the party payload.
   *
   * The party is what a class LOOKS like and is fetched on four other
   * surfaces; the budget is a fact about this member's gifts and belongs to
   * this page alone. Putting the counters on the party would have shipped them
   * to every profile that renders a party rail, including a stranger's.
   */
  useEffect(() => {
    if (!user) return;
    fetch("/api/me/portraits", { headers: headers() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setStudio(d as StudioPayload))
      .catch(() => {});
  }, [user?.id]);

  useEffect(() => {
    if (!activeKey) return;
    const mine = party.find((c) => c.archetypeKey === activeKey);
    if (mine) {
      setPresentation(mine.presentation);
      setTone(mine.tone);
    }
    setPaths(null);
    fetch(`/api/archetypes/${encodeURIComponent(activeKey)}/paths`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setPaths)
      .catch(() => {});
  }, [activeKey, party.length]);

  const active = useMemo(() => archetypes.find((a) => a.key === activeKey) ?? null, [archetypes, activeKey]);
  const playing = useMemo(() => party.some((c) => c.archetypeKey === activeKey), [party, activeKey]);
  const stockSrc = activeKey ? art(activeKey, presentation, tone) : "";
  /*
   * A member who has made their own face for this class sees THEIR face on the
   * stage, not the village's. The presentation and tone controls below still
   * drive the stock art, which is what they are for, and the two swatch rows
   * keep working for every class with no portrait.
   */
  const ownPortrait = studio?.portraits.find((p) => p.archetypeKey === activeKey)?.url ?? null;
  const heroSrc = ownPortrait ?? stockSrc;
  const heroBroken = broken[`${activeKey}-${presentation}-${tone}`] && !ownPortrait;

  /** A class's face for the rail: yours if you made one, the one you play, or a default to meet. */
  const faceFor = (key: string) => {
    const own = studio?.portraits.find((p) => p.archetypeKey === key)?.url;
    if (own) return own;
    const mine = party.find((c) => c.archetypeKey === key);
    return mine?.avatar ?? art(key, "f", "olive");
  };

  const walk = async () => {
    if (!activeKey || busy) return;
    setBusy(true);
    setError("");
    const res = await fetch("/api/me/characters", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ archetypeKey: activeKey, presentation, tone }),
    });
    setBusy(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error || "That did not save. Try again.");
      return;
    }
    loadParty();
  };

  const act = async (path: string, method: string) => {
    if (busy) return;
    setBusy(true);
    const res = await fetch(path, { method, headers: headers() });
    setBusy(false);
    if (res.ok) {
      const d = await res.json().catch(() => null);
      if (d?.party) setParty(d.party);
      else loadParty();
    }
  };

  if (!user) {
    return (
      <Layout>
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <h1 className="text-3xl font-display font-bold text-teal-deep">Choose who you will be</h1>
          <p className="mt-4 text-gray-700">Sign in to pick your paths.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-br from-teal-deep/5 to-amber/5 pb-24 pt-6">
        <div className="container">
          {/* Small, because the picture is the headline. */}
          <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-sm font-semibold uppercase tracking-widest text-sage">
              Choose who you will be
            </h1>
            <p className="text-sm text-gray-700">
              Play as many as you like. Every door stays open to every hand.
            </p>
            {firstRun ? (
              <a href="/profile" className="min-h-11 py-3 text-sm font-medium text-teal-deep underline">
                Skip for now
              </a>
            ) : null}
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[6rem_minmax(0,1fr)_20rem]">
            {/* THE STAGE, first in the DOM so a phone meets the character
                immediately. The rail follows it on small screens and moves
                left on wide ones. */}
            <section className="order-1 lg:order-2">
              <div className="relative overflow-hidden rounded-2xl bg-white shadow-lg">
                <div className="mx-auto aspect-[3/4] w-full max-w-sm">
                  {active && !heroBroken ? (
                    <img
                      src={heroSrc}
                      alt={active.name}
                      onError={() => setBroken((b) => ({ ...b, [`${activeKey}-${presentation}-${tone}`]: true }))}
                      className="h-full w-full object-cover motion-safe:animate-[breathe_7s_ease-in-out_infinite]"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-teal-deep/10 to-amber/10">
                      <div className="flex h-28 w-28 items-center justify-center rounded-full border-4 border-sage/50 text-4xl font-semibold text-teal-deep">
                        {active ? active.name.replace(/^The\s+/i, "").slice(0, 1) : "?"}
                      </div>
                    </div>
                  )}
                </div>
                {/* Name over the art, the way a select screen names its cast. */}
                {active ? (
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-5 pb-4 pt-12">
                    <h2 className="text-3xl font-display font-bold text-white">{active.name}</h2>
                    <p className="text-sm text-white/90">{active.subtitle}</p>
                  </div>
                ) : null}
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-center gap-5">
                <div className="flex items-center gap-2">
                  {(["f", "m"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPresentation(p)}
                      className={`min-h-11 rounded-lg border px-4 py-2 text-sm font-medium ${
                        presentation === p
                          ? "border-teal-deep bg-teal-deep text-white"
                          : "border-gray-300 bg-white text-gray-700"
                      }`}
                    >
                      {p === "f" ? "She" : "He"}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  {TONES.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      aria-label={t.label}
                      onClick={() => setTone(t.key)}
                      style={{ background: t.swatch }}
                      className={`h-10 w-10 rounded-full border-2 ${
                        tone === t.key ? "border-teal-deep ring-2 ring-teal-deep/40" : "border-gray-300"
                      }`}
                    />
                  ))}
                </div>
              </div>

              <div className="mt-5 text-center">
                <button
                  type="button"
                  onClick={walk}
                  disabled={busy}
                  className="min-h-11 rounded-xl bg-teal-deep px-8 py-3 font-semibold text-white shadow hover:bg-teal-deep-dark disabled:opacity-50"
                >
                  {playing ? "Save this look" : "Walk this path"}
                </button>
                {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
              </div>
            </section>

            {/* THE CAST. Faces, not letters. */}
            <nav aria-label="Classes" className="order-2 min-w-0 lg:order-1">
              <ul className="flex flex-wrap justify-center gap-3 lg:flex-nowrap lg:flex-col lg:justify-start">
                {archetypes.map((a) => {
                  const chosen = party.some((c) => c.archetypeKey === a.key);
                  const isActive = a.key === activeKey;
                  const src = faceFor(a.key);
                  return (
                    <li key={a.key} className="shrink-0">
                      <button
                        type="button"
                        onClick={() => setActiveKey(a.key)}
                        aria-current={isActive ? "true" : undefined}
                        title={a.name}
                        className={`relative block h-20 w-20 overflow-hidden rounded-xl border-2 bg-white transition ${
                          isActive
                            ? "border-teal-deep ring-2 ring-teal-deep/30"
                            : "border-gray-200 hover:border-teal-deep/50"
                        }`}
                      >
                        {broken[src] ? (
                          <span className="flex h-full w-full items-center justify-center text-lg font-semibold text-teal-deep">
                            {a.name.replace(/^The\s+/i, "").slice(0, 1)}
                          </span>
                        ) : (
                          <img
                            src={src}
                            alt={a.name}
                            onError={() => setBroken((b) => ({ ...b, [src]: true }))}
                            className="h-full w-full object-cover object-top"
                          />
                        )}
                        {chosen ? (
                          <Star className="absolute right-1 top-1 h-4 w-4 fill-gold text-sage drop-shadow" />
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>

            {/* The class card. */}
            <aside className="order-3 rounded-2xl bg-white p-6 shadow-lg">
              {active ? (
                <>
                  <p className="text-xs font-semibold uppercase tracking-wide text-sage">{active.subtitle}</p>
                  <p className="mt-2 text-gray-800">{active.blurb}</p>
                  {active.examples.length ? (
                    <ul className="mt-4 space-y-1.5">
                      {active.examples.map((e) => (
                        <li key={e} className="text-sm text-gray-700">
                          {e}
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-teal-deep">
                    Open paths
                  </h3>
                  {paths === null ? (
                    <p className="mt-2 text-sm text-gray-600">Looking.</p>
                  ) : paths.roles.length === 0 ? (
                    <p className="mt-2 text-sm text-gray-700">
                      No roles carry this tag yet. Every role is still open to you.
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {paths.roles.map((r) => (
                        <li key={r.id} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ background: r.color || "#a06b1c" }}
                          />
                          <span className="flex-1 text-sm text-gray-800">{r.name}</span>
                          {r.recruiting ? (
                            <span className="rounded-full bg-sage-light px-2 py-0.5 text-xs font-medium text-sage">
                              Open
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                  {paths ? (
                    <p className="mt-4 text-sm text-gray-700">
                      {paths.questCount === 0
                        ? "The whole quest board is open to you."
                        : `${paths.questCount} quests on the land welcome these hands.`}
                    </p>
                  ) : null}
                </>
              ) : null}
            </aside>
          </div>

          {/* Your own face for this class. Below the stage, because the class
              is what you came here to choose and the portrait is what you do
              once you have chosen one. */}
          {active ? (
            <PortraitStudio
              archetypeKey={active.key}
              archetypeName={active.name}
              presentation={presentation}
              tone={tone}
              stockArt={stockSrc}
              studio={studio}
              onChanged={(next) => {
                setStudio(next);
                // The party carries the portrait too, so a change here changes
                // what the rail and the party row draw.
                loadParty();
              }}
              authHeaders={headers}
            />
          ) : null}

          {/* Your party. */}
          {party.length > 0 ? (
            <section className="mt-10">
              <h2 className="text-lg font-display font-bold text-sage">Your party</h2>
              <ul className="mt-3 flex flex-wrap gap-3">
                {party.map((c) => {
                  const a = archetypes.find((x) => x.key === c.archetypeKey);
                  const label = a?.name ?? c.archetypeKey;
                  return (
                    <li
                      key={c.id}
                      className={`relative w-28 overflow-hidden rounded-xl border-2 bg-white ${
                        c.isPrimary ? "border-teal-deep" : "border-gray-200"
                      }`}
                    >
                      <div className="aspect-[3/4] w-full bg-gray-50">
                        {c.avatar && !broken[c.avatar] ? (
                          <img
                            src={c.avatar}
                            alt={label}
                            onError={() => setBroken((b) => ({ ...b, [c.avatar as string]: true }))}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-xl font-semibold text-teal-deep">
                            {label.replace(/^The\s+/i, "").slice(0, 1)}
                          </span>
                        )}
                      </div>
                      <p className="truncate px-2 py-1.5 text-xs font-medium text-gray-800">{label}</p>
                      <button
                        type="button"
                        aria-label={`Front ${label}`}
                        onClick={() => act(`/api/me/characters/${c.id}/primary`, "POST")}
                        className="absolute left-1 top-1 rounded-full bg-white/90 p-1.5 shadow"
                      >
                        <Star className={`h-4 w-4 ${c.isPrimary ? "fill-gold text-sage" : "text-gray-500"}`} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Leave ${label}`}
                        onClick={() => act(`/api/me/characters/${c.id}`, "DELETE")}
                        className="absolute right-1 top-1 rounded-full bg-white/90 p-1.5 shadow"
                      >
                        <X className="h-4 w-4 text-gray-600" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </Layout>
  );
}
