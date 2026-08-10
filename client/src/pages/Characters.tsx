/**
 * Choose who you will be.
 *
 * A character select screen: the class list down the left, the character on
 * the stage, what the class opens on the right, and the party you have built
 * along the bottom. Multi-class is the point, so nothing here is a radio
 * button between five options.
 *
 * The law of classes, which this page has to SAY and not only obey: a class
 * guides what the game shows you and never locks a door. Any hand may claim
 * any quest. The copy says so out loud, because a player who believes picking
 * The Builder closes the storytelling quests will pick differently than one
 * who knows it does not.
 *
 * Art degrades to a medallion. The server returns null for an avatar it does
 * not have rather than a path that might 404, and the img carries an onError
 * as well, because a file can go missing after the server answered.
 */
import Layout from "@/components/Layout";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { authToken } from "@/lib/gameApi";
import { Star, X } from "lucide-react";

const headers = (): Record<string, string> => {
  const t = authToken();
  return t ? { Authorization: `Bearer ${t}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
};

interface Archetype {
  key: string;
  name: string;
  subtitle: string;
  blurb: string;
  examples: string[];
  sigil: string;
}

interface Character {
  id: string;
  archetypeKey: string;
  presentation: "f" | "m";
  tone: "deep" | "olive" | "light";
  avatar: string | null;
  isPrimary: boolean;
}

interface Paths {
  roles: Array<{ id: string; name: string; seats: number; recruiting: boolean; color: string | null }>;
  questCount: number;
}

const TONES: Array<{ key: Character["tone"]; label: string; swatch: string }> = [
  { key: "deep", label: "Deep", swatch: "#5B3A21" },
  { key: "olive", label: "Olive", swatch: "#A9743F" },
  { key: "light", label: "Light", swatch: "#E3B58C" },
];

/** The medallion: a ring in the class colour with the class initial inside. */
function Medallion({ letter }: { letter: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center rounded-2xl bg-gradient-to-b from-emerald-900/20 to-amber-700/20">
      <div className="flex h-28 w-28 items-center justify-center rounded-full border-4 border-amber-600/60 bg-emerald-950/40 text-4xl font-semibold text-amber-200">
        {letter}
      </div>
    </div>
  );
}

export default function Characters() {
  const { user } = useAuth();
  const [archetypes, setArchetypes] = useState<Archetype[]>([]);
  const [party, setParty] = useState<Character[]>([]);
  const [activeKey, setActiveKey] = useState<string>("");
  const [presentation, setPresentation] = useState<Character["presentation"]>("f");
  const [tone, setTone] = useState<Character["tone"]>("olive");
  const [paths, setPaths] = useState<Paths | null>(null);
  const [artMissing, setArtMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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

  // Switching class shows what you already chose for it, so revisiting a class
  // you play does not silently offer to overwrite your character with defaults.
  useEffect(() => {
    if (!activeKey) return;
    const mine = party.find((c) => c.archetypeKey === activeKey);
    if (mine) {
      setPresentation(mine.presentation);
      setTone(mine.tone);
    }
    setArtMissing(false);
    setPaths(null);
    fetch(`/api/archetypes/${encodeURIComponent(activeKey)}/paths`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setPaths)
      .catch(() => {});
  }, [activeKey, party.length]);

  const active = useMemo(
    () => archetypes.find((a) => a.key === activeKey) ?? null,
    [archetypes, activeKey],
  );
  const playing = useMemo(
    () => party.some((c) => c.archetypeKey === activeKey),
    [party, activeKey],
  );
  const avatarSrc = activeKey ? `/images/avatars/${activeKey}-${presentation}-${tone}.webp` : "";

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
      const body = await res.json().catch(() => ({}));
      setError(body.error || "That did not save. Try again.");
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
          <h1 className="text-3xl font-semibold text-amber-100">Choose who you will be</h1>
          <p className="mt-4 text-amber-200/80">Sign in to pick your paths.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mx-auto max-w-6xl px-4 py-10">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-semibold text-amber-100">Choose who you will be</h1>
          <p className="mt-3 text-amber-200/80">
            Play as many as you like. Change any time. Every door stays open to every hand.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)_20rem]">
          {/* Left rail: the five classes. */}
          <nav aria-label="Classes" className="flex flex-row gap-2 overflow-x-auto lg:flex-col">
            {archetypes.map((a) => {
              const chosen = party.some((c) => c.archetypeKey === a.key);
              const isActive = a.key === activeKey;
              return (
                <button
                  key={a.key}
                  type="button"
                  onClick={() => setActiveKey(a.key)}
                  aria-current={isActive ? "true" : undefined}
                  className={`flex min-h-11 shrink-0 items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${
                    isActive
                      ? "border-amber-500 bg-amber-500/15 text-amber-100 shadow-[0_0_18px_-4px_rgba(245,190,90,0.6)]"
                      : "border-amber-900/40 bg-emerald-950/30 text-amber-200/80 hover:border-amber-700/60"
                  }`}
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full border border-amber-700/50 text-sm">
                    {a.name.replace(/^The\s+/i, "").slice(0, 1)}
                  </span>
                  <span className="flex-1 text-sm font-medium">{a.name}</span>
                  {chosen ? <Star className="h-4 w-4 fill-amber-400 text-amber-400" /> : null}
                </button>
              );
            })}
          </nav>

          {/* Centre stage. */}
          <section className="rounded-2xl border border-amber-900/40 bg-emerald-950/20 p-5">
            <div className="mx-auto aspect-[3/4] w-full max-w-sm overflow-hidden rounded-2xl border border-amber-900/40 bg-emerald-950/40">
              {active && !artMissing ? (
                <img
                  src={avatarSrc}
                  alt={active.name}
                  loading="lazy"
                  onError={() => setArtMissing(true)}
                  /* Slow breathing, transform only so it never repaints the
                     page, and switched off for anyone who asked for less
                     motion. */
                  className="h-full w-full object-cover motion-safe:animate-[breathe_7s_ease-in-out_infinite]"
                />
              ) : (
                <Medallion letter={active ? active.name.replace(/^The\s+/i, "").slice(0, 1) : "?"} />
              )}
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-6">
              <div className="flex items-center gap-2">
                {(["f", "m"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => { setPresentation(p); setArtMissing(false); }}
                    className={`min-h-11 rounded-lg border px-4 py-2 text-sm ${
                      presentation === p
                        ? "border-amber-500 bg-amber-500/15 text-amber-100"
                        : "border-amber-900/40 text-amber-200/70"
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
                    onClick={() => { setTone(t.key); setArtMissing(false); }}
                    style={{ background: t.swatch }}
                    className={`h-9 w-9 rounded-full border-2 transition ${
                      tone === t.key ? "border-amber-300 ring-2 ring-amber-400/50" : "border-amber-900/50"
                    }`}
                  />
                ))}
              </div>
            </div>

            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={walk}
                disabled={busy}
                className="min-h-11 rounded-xl border border-amber-500 bg-amber-500/20 px-6 py-3 font-medium text-amber-100 hover:bg-amber-500/30 disabled:opacity-50"
              >
                {playing ? "Save this look" : "Walk this path"}
              </button>
              {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
            </div>
          </section>

          {/* Right panel: the class card. */}
          <aside className="rounded-2xl border border-amber-900/40 bg-emerald-950/20 p-5">
            {active ? (
              <>
                <h2 className="text-xl font-semibold text-amber-100">{active.name}</h2>
                <p className="mt-1 text-sm uppercase tracking-wide text-amber-300/70">{active.subtitle}</p>
                <p className="mt-3 text-sm text-amber-200/85">{active.blurb}</p>

                {active.examples.length ? (
                  <ul className="mt-4 space-y-1.5">
                    {active.examples.map((e) => (
                      <li key={e} className="text-sm text-amber-200/75">{e}</li>
                    ))}
                  </ul>
                ) : null}

                <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-amber-300/80">
                  Open paths
                </h3>
                {paths === null ? (
                  <p className="mt-2 text-sm text-amber-200/60">Looking.</p>
                ) : paths.roles.length === 0 ? (
                  <p className="mt-2 text-sm text-amber-200/70">
                    No seats carry this tag yet. Every seat is still open to you.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {paths.roles.map((r) => (
                      <li
                        key={r.id}
                        className="flex items-center gap-2 rounded-lg border border-amber-900/40 px-3 py-2"
                      >
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: r.color || "#8a6a3a" }}
                        />
                        <span className="flex-1 text-sm text-amber-100">{r.name}</span>
                        {r.recruiting ? (
                          <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-200">
                            Open
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
                {paths ? (
                  <p className="mt-4 text-sm text-amber-200/75">
                    {paths.questCount === 0
                      ? "The whole quest board is open to you."
                      : `${paths.questCount} quests on the land welcome these hands.`}
                  </p>
                ) : null}
              </>
            ) : null}
          </aside>
        </div>

        {/* Your Party. */}
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-amber-100">Your party</h2>
          {party.length === 0 ? (
            <p className="mt-2 text-sm text-amber-200/70">
              Nobody yet. Pick a path above, or skip and wander as you are.
            </p>
          ) : (
            <ul className="mt-3 flex flex-wrap gap-3">
              {party.map((c) => {
                const a = archetypes.find((x) => x.key === c.archetypeKey);
                return (
                  <li
                    key={c.id}
                    className={`relative w-32 overflow-hidden rounded-xl border bg-emerald-950/30 ${
                      c.isPrimary ? "border-amber-400" : "border-amber-900/40"
                    }`}
                  >
                    <div className="aspect-[3/4] w-full bg-emerald-950/50">
                      {c.avatar ? (
                        <img
                          src={c.avatar}
                          alt={a?.name ?? c.archetypeKey}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Medallion letter={(a?.name ?? "?").replace(/^The\s+/i, "").slice(0, 1)} />
                      )}
                    </div>
                    <p className="truncate px-2 py-1.5 text-xs text-amber-100">{a?.name ?? c.archetypeKey}</p>
                    <button
                      type="button"
                      aria-label="Set as primary"
                      onClick={() => act(`/api/me/characters/${c.id}/primary`, "POST")}
                      className="absolute left-1 top-1 rounded-full bg-black/50 p-1.5"
                    >
                      <Star className={`h-4 w-4 ${c.isPrimary ? "fill-amber-400 text-amber-400" : "text-amber-200"}`} />
                    </button>
                    <button
                      type="button"
                      aria-label="Leave this path"
                      onClick={() => act(`/api/me/characters/${c.id}`, "DELETE")}
                      className="absolute right-1 top-1 rounded-full bg-black/50 p-1.5"
                    >
                      <X className="h-4 w-4 text-amber-200" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </Layout>
  );
}
